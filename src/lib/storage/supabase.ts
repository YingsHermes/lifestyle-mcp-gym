import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  activityLevels,
  agentScopes,
  experienceLevels,
  mealTypes,
  nutritionGoals,
  nutritionSexes,
  type Agent,
  type AgentDashboardLink,
  type BodyMetric,
  type NutritionEntry,
  type NutritionProfile,
  type Session,
  type User,
  type Workout,
} from "@/lib/domain";
import { StorageConflictError, type LifestyleStorage, type NutritionEntryUpdate } from "@/lib/storage/types";

const humanRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  password_hash: z.string(),
  timezone: z.string(),
  goals: z.array(z.string()),
  experience: z.enum(experienceLevels),
  consent_at: z.string(),
  created_at: z.string(),
});

const sessionRowSchema = z.object({
  id: z.string(),
  human_id: z.string(),
  token_hash: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
});

const agentRowSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  name: z.string(),
  secret_hash: z.string(),
  scopes: z.array(z.enum(agentScopes)),
  capabilities: z.array(z.string()),
  webhook_url: z.string().nullable(),
  owner_metadata: z.record(z.string()).nullable(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
});
const dashboardAccessLinkRowSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  agent_id: z.string(),
  token_hash: z.string(),
  expires_at: z.string(),
  used_at: z.string().nullable(),
  created_at: z.string(),
});


const workoutSetRowSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  reps: z.number().int().nullable(),
  weight_kg: z.number().nullable(),
  duration_seconds: z.number().int().nullable(),
  notes: z.string().nullable(),
});

const workoutExerciseRowSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  name: z.string(),
  workout_sets: z.array(workoutSetRowSchema),
});

const workoutRowSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  agent_id: z.string().nullable(),
  title: z.string(),
  occurred_at: z.string(),
  duration_minutes: z.number().int().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  workout_exercises: z.array(workoutExerciseRowSchema),
});

const bodyMetricRowSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  agent_id: z.string().nullable(),
  recorded_at: z.string(),
  weight_kg: z.number().nullable(),
  body_fat_percent: z.number().nullable(),
  waist_cm: z.number().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

const nutritionProfileRowSchema = z.object({
  owner_id: z.string(),
  sex: z.enum(nutritionSexes),
  birth_date: z.string(),
  height_cm: z.number(),
  activity_level: z.enum(activityLevels),
  goal: z.enum(nutritionGoals),
  target_rate_kg_per_week: z.number().nullable(),
  dietary_preferences: z.array(z.string()),
  allergies: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

const nutritionEntryRowSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  agent_id: z.string().nullable(),
  eaten_at: z.string(),
  meal_type: z.enum(mealTypes),
  food_name: z.string(),
  serving_size: z.string(),
  servings: z.number(),
  calories_kcal: z.number(),
  protein_g: z.number(),
  carbohydrates_g: z.number(),
  fat_g: z.number(),
  fiber_g: z.number(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const HUMAN_SELECT = "id,name,email,password_hash,timezone,goals,experience,consent_at,created_at";
const SESSION_SELECT = "id,human_id,token_hash,expires_at,created_at";
const AGENT_SELECT = "id,owner_id,name,secret_hash,scopes,capabilities,webhook_url,owner_metadata,created_at,last_used_at";
const WORKOUT_SELECT = "id,owner_id,agent_id,title,occurred_at,duration_minutes,notes,created_at,workout_exercises(id,position,name,workout_sets(id,position,reps,weight_kg,duration_seconds,notes))";
const BODY_METRIC_SELECT = "id,owner_id,agent_id,recorded_at,weight_kg,body_fat_percent,waist_cm,notes,created_at";
const NUTRITION_PROFILE_SELECT = "owner_id,sex,birth_date,height_cm,activity_level,goal,target_rate_kg_per_week,dietary_preferences,allergies,created_at,updated_at";
const NUTRITION_ENTRY_SELECT = "id,owner_id,agent_id,eaten_at,meal_type,food_name,serving_size,servings,calories_kcal,protein_g,carbohydrates_g,fat_g,fiber_g,notes,created_at,updated_at";
const PAGE_SIZE = 1_000;

export function serializeHuman(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    password_hash: user.passwordHash,
    timezone: user.timezone,
    goals: user.goals,
    experience: user.experience,
    consent_at: user.consentAt,
    created_at: user.createdAt,
  };
}

export function deserializeHuman(value: unknown): User {
  const row = humanRowSchema.parse(value);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    timezone: row.timezone,
    goals: [...row.goals],
    experience: row.experience,
    consentAt: row.consent_at,
    createdAt: row.created_at,
  };
}

export function serializeSession(session: Session) {
  return {
    id: session.id,
    human_id: session.userId,
    token_hash: session.tokenHash,
    expires_at: session.expiresAt,
    created_at: session.createdAt,
  };
}

export function deserializeSession(value: unknown): Session {
  const row = sessionRowSchema.parse(value);
  return {
    id: row.id,
    userId: row.human_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export function serializeAgent(agent: Agent) {
  return {
    id: agent.id,
    owner_id: agent.ownerId,
    name: agent.name,
    secret_hash: agent.secretHash,
    scopes: agent.scopes,
    capabilities: agent.capabilities,
    webhook_url: agent.webhookUrl ?? null,
    owner_metadata: agent.ownerMetadata ?? null,
    created_at: agent.createdAt,
    last_used_at: agent.lastUsedAt ?? null,
  };
}

export function deserializeAgent(value: unknown): Agent {
  const row = agentRowSchema.parse(value);
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    secretHash: row.secret_hash,
    scopes: [...row.scopes],
    capabilities: [...row.capabilities],
    webhookUrl: row.webhook_url ?? undefined,
    ownerMetadata: row.owner_metadata ? { ...row.owner_metadata } : undefined,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at ?? undefined,
  };
}
export function serializeDashboardAccessLink(link: AgentDashboardLink) {
  return {
    id: link.id,
    owner_id: link.ownerId,
    agent_id: link.agentId,
    token_hash: link.tokenHash,
    expires_at: link.expiresAt,
    used_at: link.usedAt ?? null,
    created_at: link.createdAt,
  };
}

export function deserializeDashboardAccessLink(value: unknown): AgentDashboardLink {
  const row = dashboardAccessLinkRowSchema.parse(value);
  return {
    id: row.id,
    ownerId: row.owner_id,
    agentId: row.agent_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at ?? undefined,
    createdAt: row.created_at,
  };
}


export function deserializeWorkout(value: unknown): Workout {
  const row = workoutRowSchema.parse(value);
  return {
    id: row.id,
    ownerId: row.owner_id,
    agentId: row.agent_id ?? undefined,
    title: row.title,
    occurredAt: row.occurred_at,
    durationMinutes: row.duration_minutes ?? undefined,
    notes: row.notes ?? undefined,
    exercises: row.workout_exercises
      .toSorted((left, right) => left.position - right.position)
      .map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        sets: exercise.workout_sets
          .toSorted((left, right) => left.position - right.position)
          .map((set) => ({
            id: set.id,
            reps: set.reps ?? undefined,
            weightKg: set.weight_kg ?? undefined,
            durationSeconds: set.duration_seconds ?? undefined,
            notes: set.notes ?? undefined,
          })),
      })),
    createdAt: row.created_at,
  };
}

export function serializeBodyMetric(metric: BodyMetric) {
  return {
    id: metric.id,
    owner_id: metric.ownerId,
    agent_id: metric.agentId ?? null,
    recorded_at: metric.recordedAt,
    weight_kg: metric.weightKg ?? null,
    body_fat_percent: metric.bodyFatPercent ?? null,
    waist_cm: metric.waistCm ?? null,
    notes: metric.notes ?? null,
    created_at: metric.createdAt,
  };
}

export function deserializeBodyMetric(value: unknown): BodyMetric {
  const row = bodyMetricRowSchema.parse(value);
  return {
    id: row.id,
    ownerId: row.owner_id,
    agentId: row.agent_id ?? undefined,
    recordedAt: row.recorded_at,
    weightKg: row.weight_kg ?? undefined,
    bodyFatPercent: row.body_fat_percent ?? undefined,
    waistCm: row.waist_cm ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export function serializeNutritionProfile(profile: NutritionProfile) {
  return {
    owner_id: profile.ownerId,
    sex: profile.sex,
    birth_date: profile.birthDate,
    height_cm: profile.heightCm,
    activity_level: profile.activityLevel,
    goal: profile.goal,
    target_rate_kg_per_week: profile.targetRateKgPerWeek ?? null,
    dietary_preferences: profile.dietaryPreferences,
    allergies: profile.allergies,
    created_at: profile.createdAt,
    updated_at: profile.updatedAt,
  };
}

export function deserializeNutritionProfile(value: unknown): NutritionProfile {
  const row = nutritionProfileRowSchema.parse(value);
  return {
    ownerId: row.owner_id,
    sex: row.sex,
    birthDate: row.birth_date,
    heightCm: row.height_cm,
    activityLevel: row.activity_level,
    goal: row.goal,
    targetRateKgPerWeek: row.target_rate_kg_per_week ?? undefined,
    dietaryPreferences: row.dietary_preferences,
    allergies: row.allergies,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeNutritionEntry(entry: NutritionEntry) {
  return {
    id: entry.id,
    owner_id: entry.ownerId,
    agent_id: entry.agentId ?? null,
    eaten_at: entry.eatenAt,
    meal_type: entry.mealType,
    food_name: entry.foodName,
    serving_size: entry.servingSize,
    servings: entry.servings,
    calories_kcal: entry.caloriesKcal,
    protein_g: entry.proteinG,
    carbohydrates_g: entry.carbohydratesG,
    fat_g: entry.fatG,
    fiber_g: entry.fiberG,
    notes: entry.notes ?? null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

export function deserializeNutritionEntry(value: unknown): NutritionEntry {
  const row = nutritionEntryRowSchema.parse(value);
  return {
    id: row.id,
    ownerId: row.owner_id,
    agentId: row.agent_id ?? undefined,
    eatenAt: row.eaten_at,
    mealType: row.meal_type,
    foodName: row.food_name,
    servingSize: row.serving_size,
    servings: row.servings,
    caloriesKcal: row.calories_kcal,
    proteinG: row.protein_g,
    carbohydratesG: row.carbohydrates_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeNutritionEntryUpdate(patch: NutritionEntryUpdate): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: patch.updatedAt };
  if (patch.eatenAt !== undefined) row.eaten_at = patch.eatenAt;
  if (patch.mealType !== undefined) row.meal_type = patch.mealType;
  if (patch.foodName !== undefined) row.food_name = patch.foodName;
  if (patch.servingSize !== undefined) row.serving_size = patch.servingSize;
  if (patch.servings !== undefined) row.servings = patch.servings;
  if (patch.caloriesKcal !== undefined) row.calories_kcal = patch.caloriesKcal;
  if (patch.proteinG !== undefined) row.protein_g = patch.proteinG;
  if (patch.carbohydratesG !== undefined) row.carbohydrates_g = patch.carbohydratesG;
  if (patch.fatG !== undefined) row.fat_g = patch.fatG;
  if (patch.fiberG !== undefined) row.fiber_g = patch.fiberG;
  if (patch.notes !== undefined) row.notes = patch.notes;
  return row;
}


function throwIfError(operation: string, error: PostgrestError | null): void {
  if (error) {
    throw new Error(`Supabase storage ${operation} failed (${error.code || "unknown"})`, { cause: error });
  }
}

export class SupabaseStorage implements LifestyleStorage {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
  }

  async createUser(user: User): Promise<User> {
    const { error } = await this.client.from("humans").insert(serializeHuman(user));
    if (error?.code === "23505") {
      throw new StorageConflictError("User email already exists");
    }
    throwIfError("create user", error);
    return structuredClone(user);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.client.from("humans").select(HUMAN_SELECT).eq("email", email).maybeSingle();
    throwIfError("find user by email", error);
    return data ? deserializeHuman(data) : null;
  }

  async getUser(id: string): Promise<User | null> {
    const { data, error } = await this.client.from("humans").select(HUMAN_SELECT).eq("id", id).maybeSingle();
    throwIfError("get user", error);
    return data ? deserializeHuman(data) : null;
  }

  async createSession(session: Session): Promise<Session> {
    const { error } = await this.client.from("sessions").insert(serializeSession(session));
    throwIfError("create session", error);
    return structuredClone(session);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const { data, error } = await this.client.from("sessions").select(SESSION_SELECT).eq("token_hash", tokenHash).maybeSingle();
    throwIfError("find session", error);
    return data ? deserializeSession(data) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    const { error } = await this.client.from("sessions").delete().eq("token_hash", tokenHash);
    throwIfError("delete session", error);
  }

  async createAgent(agent: Agent): Promise<Agent> {
    const { error } = await this.client.from("agents").insert(serializeAgent(agent));
    throwIfError("create agent", error);
    return structuredClone(agent);
  }

  async getAgent(id: string): Promise<Agent | null> {
    const { data, error } = await this.client.from("agents").select(AGENT_SELECT).eq("id", id).maybeSingle();
    throwIfError("get agent", error);
    return data ? deserializeAgent(data) : null;
  }

  async listAgents(ownerId: string): Promise<Agent[]> {
    const agents: Agent[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await this.client
        .from("agents")
        .select(AGENT_SELECT)
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      throwIfError("list agents", error);
      if (!data?.length) {
        return agents;
      }
      agents.push(...data.map(deserializeAgent));
      offset += data.length;
    }
  }

  async touchAgent(id: string, lastUsedAt: string): Promise<void> {
    const { error } = await this.client.from("agents").update({ last_used_at: lastUsedAt }).eq("id", id);
    throwIfError("touch agent", error);
  }
  async createAgentDashboardLink(link: AgentDashboardLink): Promise<AgentDashboardLink> {
    const { error } = await this.client.from("dashboard_access_links").insert(serializeDashboardAccessLink(link));
    if (error?.code === "23505") {
      throw new StorageConflictError("Dashboard access link token hash already exists");
    }
    throwIfError("create dashboard access link", error);
    return structuredClone(link);
  }

  async consumeAgentDashboardLink(tokenHash: string, usedAt: string): Promise<AgentDashboardLink | null> {
    const { data, error } = await this.client.rpc("consume_dashboard_access_link", {
      p_token_hash: tokenHash,
      p_used_at: usedAt,
    });
    throwIfError("consume dashboard access link", error);
    const rows = z.array(dashboardAccessLinkRowSchema).parse(data ?? []);
    return rows[0] ? deserializeDashboardAccessLink(rows[0]) : null;
  }


  async createWorkout(workout: Workout): Promise<Workout> {
    const { error } = await this.client.rpc("create_lifestyle_workout", { workout });
    throwIfError("create workout", error);
    return structuredClone(workout);
  }

  async listWorkouts(ownerId: string, limit: number): Promise<Workout[]> {
    const workouts: Workout[] = [];
    let offset = 0;
    while (workouts.length < limit) {
      const pageSize = Math.min(PAGE_SIZE, limit - workouts.length);
      const { data, error } = await this.client
        .from("workouts")
        .select(WORKOUT_SELECT)
        .eq("owner_id", ownerId)
        .order("occurred_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      throwIfError("list workouts", error);
      if (!data?.length) {
        break;
      }
      workouts.push(...data.map(deserializeWorkout));
      offset += data.length;
    }
    return workouts;
  }

  async createBodyMetric(metric: BodyMetric): Promise<BodyMetric> {
    const { error } = await this.client.from("body_metrics").insert(serializeBodyMetric(metric));
    throwIfError("create body metric", error);
    return structuredClone(metric);
  }

  async listBodyMetrics(ownerId: string, limit: number): Promise<BodyMetric[]> {
    const metrics: BodyMetric[] = [];
    let offset = 0;
    while (metrics.length < limit) {
      const pageSize = Math.min(PAGE_SIZE, limit - metrics.length);
      const { data, error } = await this.client
        .from("body_metrics")
        .select(BODY_METRIC_SELECT)
        .eq("owner_id", ownerId)
        .order("recorded_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      throwIfError("list body metrics", error);
      if (!data?.length) {
        break;
      }
      metrics.push(...data.map(deserializeBodyMetric));
      offset += data.length;
    }
    return metrics;
  }

  async upsertNutritionProfile(profile: NutritionProfile): Promise<NutritionProfile> {
    const { data, error } = await this.client
      .from("nutrition_profiles")
      .upsert(serializeNutritionProfile(profile), { onConflict: "owner_id" })
      .select(NUTRITION_PROFILE_SELECT)
      .single();
    throwIfError("upsert nutrition profile", error);
    return deserializeNutritionProfile(data);
  }

  async getNutritionProfile(ownerId: string): Promise<NutritionProfile | null> {
    const { data, error } = await this.client
      .from("nutrition_profiles")
      .select(NUTRITION_PROFILE_SELECT)
      .eq("owner_id", ownerId)
      .maybeSingle();
    throwIfError("get nutrition profile", error);
    return data ? deserializeNutritionProfile(data) : null;
  }

  async createNutritionEntry(entry: NutritionEntry): Promise<NutritionEntry> {
    const { error } = await this.client.from("nutrition_entries").insert(serializeNutritionEntry(entry));
    throwIfError("create nutrition entry", error);
    return structuredClone(entry);
  }

  async listNutritionEntries(ownerId: string, limit: number): Promise<NutritionEntry[]> {
    const entries: NutritionEntry[] = [];
    let offset = 0;
    while (entries.length < limit) {
      const pageSize = Math.min(PAGE_SIZE, limit - entries.length);
      const { data, error } = await this.client
        .from("nutrition_entries")
        .select(NUTRITION_ENTRY_SELECT)
        .eq("owner_id", ownerId)
        .order("eaten_at", { ascending: false })
        .range(offset, offset + pageSize - 1);
      throwIfError("list nutrition entries", error);
      if (!data?.length) {
        break;
      }
      entries.push(...data.map(deserializeNutritionEntry));
      offset += data.length;
    }
    return entries;
  }

  async updateNutritionEntry(ownerId: string, entryId: string, patch: NutritionEntryUpdate): Promise<NutritionEntry | null> {
    const { data, error } = await this.client
      .from("nutrition_entries")
      .update(serializeNutritionEntryUpdate(patch))
      .eq("id", entryId)
      .eq("owner_id", ownerId)
      .select(NUTRITION_ENTRY_SELECT)
      .maybeSingle();
    throwIfError("update nutrition entry", error);
    return data ? deserializeNutritionEntry(data) : null;
  }

  async deleteNutritionEntry(ownerId: string, entryId: string): Promise<NutritionEntry | null> {
    const { data, error } = await this.client
      .from("nutrition_entries")
      .delete()
      .eq("id", entryId)
      .eq("owner_id", ownerId)
      .select(NUTRITION_ENTRY_SELECT)
      .maybeSingle();
    throwIfError("delete nutrition entry", error);
    return data ? deserializeNutritionEntry(data) : null;
  }
}
