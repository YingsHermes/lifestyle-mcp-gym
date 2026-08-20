import { randomBytes } from "node:crypto";
import {
  agentRegistrationSchema,
  bodyMetricInputSchema,
  calculateStats,
  humanRegistrationSchema,
  loginSchema,
  workoutInputSchema,
  type Agent,
  type AgentRegistrationInput,
  type AgentScope,
  type BodyMetric,
  type BodyMetricInput,
  type HumanRegistrationInput,
  type LoginInput,
  type User,
  type Workout,
  type WorkoutInput,
} from "@/lib/domain";
import { generateOpaqueToken, hashCredential, hashToken, verifyCredential } from "@/lib/auth";
import { StorageConflictError, type LifestyleStorage } from "@/lib/storage/types";

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
}
