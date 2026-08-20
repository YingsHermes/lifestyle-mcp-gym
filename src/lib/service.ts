import { randomBytes } from "node:crypto";
import {
  agentRegistrationSchema,
  bodyMetricInputSchema,
  calculateStats,
  dashboardLinkInputSchema,
  foodLogInputSchema,
  foodLogListQuerySchema,
  humanRegistrationSchema,
  loginSchema,
  nutritionProfileInputSchema,
  workoutInputSchema,
  type Agent,
  type AgentRegistrationInput,
  type AgentScope,
  type BodyMetric,
  type BodyMetricInput,
  type DashboardLinkInput,
  type FoodLogInput,
  type FoodLogListQuery,
  type HumanRegistrationInput,
  type LoginInput,
  type NutritionEntry,
  type NutritionProfile,
  type NutritionProfileInput,
  type ProgressStats,
  type User,
  type Workout,
  type WorkoutInput,
} from "@/lib/domain";
import { generateOpaqueToken, hashCredential, hashToken, verifyCredential } from "@/lib/auth";
import { StorageConflictError, type LifestyleStorage } from "@/lib/storage/types";
import {
  calculateNutritionTargets,
  missingNutritionTargets,
  NUTRITION_SAFETY_NOTE,
  type NutritionTargetResult,
} from "@/lib/nutrition-calculations";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  timezone: string;
  goals: string[];
  experience: User["experience"];
  createdAt: string;
}

export interface PublicAgent {
  id: string;
  ownerId: string;
  name: string;
  scopes: AgentScope[];
  capabilities: string[];
  webhookUrl?: string;
  ownerMetadata?: Record<string, string>;
  createdAt: string;
  lastUsedAt?: string;
}

export type AuthenticatedPrincipal =
  | { kind: "human"; user: PublicUser }
  | { kind: "agent"; agent: PublicAgent; ownerId: string };

interface ServiceOptions {
  now?: () => Date;
}

export interface NutritionTotals {
  caloriesKcal: number;
  proteinG: number;
  carbohydratesG: number;
  fatG: number;
  fiberG: number;
}

export interface NutritionSummary {
  date: string;
  entries: NutritionEntry[];
  totals: NutritionTotals;
  calorieTargets: NutritionTargetResult;
  remainingCalories: number | null;
  dataSource: "user_entered";
  humanReadable: string;
}

export interface CoachingContext {
  generatedAt: string;
  nutritionProfile: NutritionProfile | null;
  calorieTargets: NutritionTargetResult;
  todayNutrition: NutritionSummary;
  recentTrainingStats: ProgressStats;
  latestBodyMetrics: BodyMetric | null;
  missingData: string[];
  actionGuidance: string[];
  safetyNote: string;
  humanReadable: string;
}

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const dummyCredentialHash = hashCredential(generateOpaqueToken());

function publicUser(user: User): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    goals: [...user.goals],
    experience: user.experience,
    createdAt: user.createdAt,
  };
}

function publicAgent(agent: Agent): PublicAgent {
  return {
    id: agent.id,
    ownerId: agent.ownerId,
    name: agent.name,
    scopes: [...agent.scopes],
    capabilities: [...agent.capabilities],
    webhookUrl: agent.webhookUrl,
    ownerMetadata: agent.ownerMetadata ? { ...agent.ownerMetadata } : undefined,
    createdAt: agent.createdAt,
    lastUsedAt: agent.lastUsedAt,
  };
}

function createId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url")}`;
}

function localDate(value: Date | string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(typeof value === "string" ? new Date(value) : value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Unable to calculate local date for timezone ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function latestWeight(metrics: BodyMetric[]): number | undefined {
  return metrics.find((metric) => metric.weightKg !== undefined)?.weightKg;
}

function buildNutritionSummary(
  date: string,
  timeZone: string,
  entries: NutritionEntry[],
  calorieTargets: NutritionTargetResult,
): NutritionSummary {
  const dailyEntries = entries.filter((entry) => localDate(entry.eatenAt, timeZone) === date);
  const totals = dailyEntries.reduce<NutritionTotals>((sum, entry) => ({
    caloriesKcal: sum.caloriesKcal + entry.caloriesKcal,
    proteinG: sum.proteinG + entry.proteinG,
    carbohydratesG: sum.carbohydratesG + entry.carbohydratesG,
    fatG: sum.fatG + entry.fatG,
    fiberG: sum.fiberG + entry.fiberG,
  }), { caloriesKcal: 0, proteinG: 0, carbohydratesG: 0, fatG: 0, fiberG: 0 });
  for (const key of Object.keys(totals) as (keyof NutritionTotals)[]) {
    totals[key] = rounded(totals[key]);
  }
  const remainingCalories = calorieTargets.targetCalories === null
    ? null
    : rounded(calorieTargets.targetCalories - totals.caloriesKcal);
  return {
    date,
    entries: dailyEntries,
    totals,
    calorieTargets,
    remainingCalories,
    dataSource: "user_entered",
    humanReadable: `Today's nutrition: ${totals.caloriesKcal} kcal, ${totals.proteinG} g protein, ${totals.carbohydratesG} g carbohydrates, and ${totals.fatG} g fat from ${dailyEntries.length} user-entered food ${dailyEntries.length === 1 ? "entry" : "entries"}.`,
  };
}


export class LifestyleService {
  private readonly storage: LifestyleStorage;
  private readonly now: () => Date;

  constructor(storage: LifestyleStorage, options: ServiceOptions = {}) {
    this.storage = storage;
    this.now = options.now ?? (() => new Date());
  }

  private async issueSession(userId: string): Promise<string> {
    const sessionToken = generateOpaqueToken();
    const createdAt = this.now();
    await this.storage.createSession({
      id: createId("session"),
      userId,
      tokenHash: hashToken(sessionToken),
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + SESSION_DURATION_MS).toISOString(),
    });
    return sessionToken;
  }

  async registerHuman(rawInput: HumanRegistrationInput): Promise<{ user: PublicUser; sessionToken: string }> {
    const input = humanRegistrationSchema.parse(rawInput);
    if (await this.storage.findUserByEmail(input.email)) {
      throw new AppError(409, "email_in_use", "An account already exists for this email");
    }

    const now = this.now().toISOString();
    let user: User;
    try {
      user = await this.storage.createUser({
        id: createId("user"),
        name: input.name,
        email: input.email,
        passwordHash: await hashCredential(input.password),
        timezone: input.timezone,
        goals: [...new Set(input.goals)],
        experience: input.experience,
        consentAt: now,
        createdAt: now,
      });
    } catch (error) {
      if (error instanceof StorageConflictError) {
        throw new AppError(409, "email_in_use", "An account already exists for this email");
      }
      throw error;
    }
    return { user: publicUser(user), sessionToken: await this.issueSession(user.id) };
  }

  async login(rawInput: LoginInput): Promise<{ user: PublicUser; sessionToken: string }> {
    const input = loginSchema.parse(rawInput);
    const user = await this.storage.findUserByEmail(input.email);
    const encodedHash = user?.passwordHash ?? (await dummyCredentialHash);
    const valid = await verifyCredential(input.password, encodedHash);
    if (!user || !valid) {
      throw new AppError(401, "invalid_credentials", "Email or password is incorrect");
    }
    return { user: publicUser(user), sessionToken: await this.issueSession(user.id) };
  }

  async authenticateSession(sessionToken: string): Promise<PublicUser> {
    if (!sessionToken || sessionToken.length > 256) {
      throw new AppError(401, "unauthorized", "A valid session is required");
    }
    const tokenHash = hashToken(sessionToken);
    const session = await this.storage.findSessionByTokenHash(tokenHash);
    if (!session || new Date(session.expiresAt) <= this.now()) {
      if (session) {
        await this.storage.deleteSession(tokenHash);
      }
      throw new AppError(401, "unauthorized", "A valid session is required");
    }
    const user = await this.storage.getUser(session.userId);
    if (!user) {
      await this.storage.deleteSession(tokenHash);
      throw new AppError(401, "unauthorized", "A valid session is required");
    }
    return publicUser(user);
  }

  async logout(sessionToken: string): Promise<void> {
    if (sessionToken) {
      await this.storage.deleteSession(hashToken(sessionToken));
    }
  }

  async createAgent(ownerId: string, rawInput: AgentRegistrationInput): Promise<{ agent: PublicAgent; secret: string }> {
    const input = agentRegistrationSchema.parse(rawInput);
    const id = createId("agent");
    const secretPart = generateOpaqueToken();
    const agent = await this.storage.createAgent({
      id,
      ownerId,
      name: input.name,
      secretHash: await hashCredential(secretPart),
      scopes: [...new Set(input.scopes)],
      capabilities: [...new Set(input.capabilities)],
      webhookUrl: input.webhookUrl,
      ownerMetadata: input.ownerMetadata,
      createdAt: this.now().toISOString(),
    });
    return { agent: publicAgent(agent), secret: `${id}.${secretPart}` };
  }

  async listAgents(ownerId: string): Promise<PublicAgent[]> {
    const agents = await this.storage.listAgents(ownerId);
    return agents.map(publicAgent);
  }

  async authenticateAgent(token: string): Promise<{ agent: PublicAgent; ownerId: string }> {
    const separator = token.indexOf(".");
    if (separator < 1 || token.length > 512) {
      throw new AppError(401, "unauthorized", "Agent credential is invalid");
    }
    const id = token.slice(0, separator);
    const secretPart = token.slice(separator + 1);
    const agent = await this.storage.getAgent(id);
    const encodedHash = agent?.secretHash ?? (await dummyCredentialHash);
    const valid = await verifyCredential(secretPart, encodedHash);
    if (!agent || !valid) {
      throw new AppError(401, "unauthorized", "Agent credential is invalid");
    }
    const lastUsedAt = this.now().toISOString();
    await this.storage.touchAgent(id, lastUsedAt);
    return { agent: publicAgent({ ...agent, lastUsedAt }), ownerId: agent.ownerId };
  }

  async authenticateBearer(token: string): Promise<AuthenticatedPrincipal> {
    if (token.startsWith("agent_")) {
      const authenticated = await this.authenticateAgent(token);
      return { kind: "agent", ...authenticated };
    }
    const user = await this.authenticateSession(token);
    return { kind: "human", user };
  }

  requireAgentScope(principal: AuthenticatedPrincipal, scope: AgentScope): string {
    if (principal.kind !== "agent") {
      throw new AppError(403, "forbidden", "This operation requires an agent credential");
    }
    if (!principal.agent.scopes.includes(scope)) {
      throw new AppError(403, "insufficient_scope", `Agent lacks required scope: ${scope}`);
    }
    return principal.ownerId;
  }
  async createDashboardLink(
    principal: AuthenticatedPrincipal,
    rawInput: DashboardLinkInput,
    appBaseUrl: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const ownerId = this.requireAgentScope(principal, "dashboard:link");
    if (principal.kind !== "agent") {
      throw new AppError(403, "forbidden", "This operation requires an agent credential");
    }
    let appOrigin: string;
    try {
      const appUrl = new URL(appBaseUrl);
      if (appUrl.protocol !== "https:" && appUrl.protocol !== "http:") {
        throw new Error("Unsupported dashboard URL protocol");
      }
      appOrigin = appUrl.origin;
    } catch {
      throw new AppError(500, "invalid_app_url", "Dashboard links are not configured");
    }
    const input = dashboardLinkInputSchema.parse(rawInput);
    const token = generateOpaqueToken();
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + input.ttlMinutes * 60_000).toISOString();
    await this.storage.createAgentDashboardLink({
      id: createId("dashboard_link"),
      ownerId,
      agentId: principal.agent.id,
      tokenHash: hashToken(token),
      expiresAt,
      createdAt: createdAt.toISOString(),
    });

    const url = new URL("/auth/agent-link", appOrigin);
    url.searchParams.set("token", token);
    return { url: url.toString(), expiresAt };
  }

  async consumeDashboardLink(token: string): Promise<{ user: PublicUser; sessionToken: string }> {
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) {
      throw new AppError(401, "invalid_agent_link", "This dashboard link is invalid or expired");
    }
    const link = await this.storage.consumeAgentDashboardLink(hashToken(token), this.now().toISOString());
    if (!link) {
      throw new AppError(401, "invalid_agent_link", "This dashboard link is invalid or expired");
    }
    const user = await this.storage.getUser(link.ownerId);
    if (!user) {
      throw new AppError(401, "invalid_agent_link", "This dashboard link is invalid or expired");
    }
    return { user: publicUser(user), sessionToken: await this.issueSession(user.id) };
  }


  async logWorkout(ownerId: string, rawInput: WorkoutInput, agentId?: string): Promise<Workout> {
    const input = workoutInputSchema.parse(rawInput);
    const workout: Workout = {
      id: createId("workout"),
      ownerId,
      agentId,
      title: input.title,
      occurredAt: input.occurredAt,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
      exercises: input.exercises.map((exercise) => ({
        id: createId("exercise"),
        name: exercise.name,
        sets: exercise.sets.map((set) => ({ id: createId("set"), ...set })),
      })),
      createdAt: this.now().toISOString(),
    };
    return this.storage.createWorkout(workout);
  }

  async listWorkouts(ownerId: string, limit = 20): Promise<Workout[]> {
    return this.storage.listWorkouts(ownerId, Math.min(Math.max(limit, 1), 100));
  }

  async recordBodyMetric(ownerId: string, rawInput: BodyMetricInput, agentId?: string): Promise<BodyMetric> {
    const input = bodyMetricInputSchema.parse(rawInput);
    return this.storage.createBodyMetric({
      id: createId("metric"),
      ownerId,
      agentId,
      ...input,
      createdAt: this.now().toISOString(),
    });
  }

  async listBodyMetrics(ownerId: string, limit = 100): Promise<BodyMetric[]> {
    return this.storage.listBodyMetrics(ownerId, Math.min(Math.max(limit, 1), 500));
  }

  async getStats(ownerId: string) {
    const [workouts, metrics] = await Promise.all([
      this.storage.listWorkouts(ownerId, 10_000),
      this.storage.listBodyMetrics(ownerId, 10_000),
    ]);
    return calculateStats(workouts, metrics, this.now());
  }

  async setNutritionProfile(ownerId: string, rawInput: NutritionProfileInput): Promise<NutritionProfile> {
    const input = nutritionProfileInputSchema.parse(rawInput);
    const now = this.now();
    const owner = await this.storage.getUser(ownerId);
    const asOfDate = localDate(now, owner?.timezone ?? "UTC");
    if (input.birthDate > asOfDate) {
      throw new AppError(400, "invalid_birth_date", "Birth date cannot be in the future");
    }
    const existing = await this.storage.getNutritionProfile(ownerId);
    const timestamp = now.toISOString();
    return this.storage.upsertNutritionProfile({
      ownerId,
      ...input,
      dietaryPreferences: [...new Set(input.dietaryPreferences)],
      allergies: [...new Set(input.allergies)],
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
  }

  async getNutritionProfile(ownerId: string): Promise<NutritionProfile | null> {
    return this.storage.getNutritionProfile(ownerId);
  }

  async logFood(ownerId: string, rawInput: FoodLogInput, agentId?: string): Promise<NutritionEntry> {
    const input = foodLogInputSchema.parse(rawInput);
    return this.storage.createNutritionEntry({
      id: createId("nutrition"),
      ownerId,
      agentId,
      ...input,
      createdAt: this.now().toISOString(),
    });
  }

  async listFoodLog(ownerId: string, rawQuery: FoodLogListQuery = {}): Promise<NutritionEntry[]> {
    const query = foodLogListQuerySchema.parse(rawQuery);
    return this.storage.listNutritionEntries(ownerId, query.limit);
  }

  async calculateCalorieTargets(ownerId: string, asOfDate?: string): Promise<NutritionTargetResult> {
    const [owner, profile, metrics] = await Promise.all([
      this.storage.getUser(ownerId),
      this.storage.getNutritionProfile(ownerId),
      this.storage.listBodyMetrics(ownerId, 500),
    ]);
    const date = asOfDate ?? localDate(this.now(), owner?.timezone ?? "UTC");
    const weightKg = latestWeight(metrics);
    if (!profile) {
      return missingNutritionTargets([
        "nutritionProfile",
        ...(weightKg === undefined ? ["weightKg"] : []),
      ]);
    }
    return calculateNutritionTargets({ profile, weightKg, asOfDate: date });
  }

  async getNutritionSummary(ownerId: string, date?: string): Promise<NutritionSummary> {
    const [owner, profile, entries, metrics] = await Promise.all([
      this.storage.getUser(ownerId),
      this.storage.getNutritionProfile(ownerId),
      this.storage.listNutritionEntries(ownerId, 10_000),
      this.storage.listBodyMetrics(ownerId, 500),
    ]);
    const timeZone = owner?.timezone ?? "UTC";
    const summaryDate = date ?? localDate(this.now(), timeZone);
    const weightKg = latestWeight(metrics);
    const targets = profile
      ? calculateNutritionTargets({ profile, weightKg, asOfDate: summaryDate })
      : missingNutritionTargets(["nutritionProfile", ...(weightKg === undefined ? ["weightKg"] : [])]);
    return buildNutritionSummary(summaryDate, timeZone, entries, targets);
  }

  async getCoachingContext(ownerId: string): Promise<CoachingContext> {
    const [owner, profile, entries, workouts, metrics] = await Promise.all([
      this.storage.getUser(ownerId),
      this.storage.getNutritionProfile(ownerId),
      this.storage.listNutritionEntries(ownerId, 10_000),
      this.storage.listWorkouts(ownerId, 10_000),
      this.storage.listBodyMetrics(ownerId, 10_000),
    ]);
    const timeZone = owner?.timezone ?? "UTC";
    const now = this.now();
    const date = localDate(now, timeZone);
    const weightKg = latestWeight(metrics);
    const calorieTargets = profile
      ? calculateNutritionTargets({ profile, weightKg, asOfDate: date })
      : missingNutritionTargets(["nutritionProfile", ...(weightKg === undefined ? ["weightKg"] : [])]);
    const todayNutrition = buildNutritionSummary(date, timeZone, entries, calorieTargets);
    const recentTrainingStats = calculateStats(workouts, metrics, now);
    const latestBodyMetrics = metrics[0] ?? null;
    const missingData: string[] = [];
    const actionGuidance: string[] = [];
    if (!profile) {
      missingData.push("nutritionProfile");
      actionGuidance.push("Set the nutrition profile before calculating calorie or macro targets.");
    }
    if (weightKg === undefined) {
      missingData.push("bodyWeight");
      actionGuidance.push("Record a current body weight to calculate calorie and macro targets.");
    }
    if (todayNutrition.entries.length === 0) {
      missingData.push("todayFoodLog");
      actionGuidance.push("Log today's food with user-entered calorie and macro totals to ground nutrition coaching.");
    }
    if (workouts.length === 0) {
      missingData.push("recentWorkouts");
      actionGuidance.push("Log a workout to add recent training evidence to coaching context.");
    }
    return {
      generatedAt: now.toISOString(),
      nutritionProfile: profile,
      calorieTargets,
      todayNutrition,
      recentTrainingStats,
      latestBodyMetrics,
      missingData,
      actionGuidance,
      safetyNote: `${NUTRITION_SAFETY_NOTE} Coaching context is informational and not medical advice.`,
      humanReadable: `${todayNutrition.humanReadable} ${recentTrainingStats.weeklyWorkouts} workout${recentTrainingStats.weeklyWorkouts === 1 ? "" : "s"} logged this week. ${missingData.length === 0 ? "Core coaching inputs are present." : `${missingData.length} coaching input${missingData.length === 1 ? " is" : "s are"} missing.`}`,
    };
  }
}
