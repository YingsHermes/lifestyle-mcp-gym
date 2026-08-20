import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  agentScopes,
  experienceLevels,
  type Agent,
  type AgentDashboardLink,
  type BodyMetric,
  type Session,
  type User,
  type Workout,
} from "@/lib/domain";
import { StorageConflictError, type LifestyleStorage } from "@/lib/storage/types";

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

const HUMAN_SELECT = "id,name,email,password_hash,timezone,goals,experience,consent_at,created_at";
const SESSION_SELECT = "id,human_id,token_hash,expires_at,created_at";
const AGENT_SELECT = "id,owner_id,name,secret_hash,scopes,capabilities,webhook_url,owner_metadata,created_at,last_used_at";
const WORKOUT_SELECT = "id,owner_id,agent_id,title,occurred_at,duration_minutes,notes,created_at,workout_exercises(id,position,name,workout_sets(id,position,reps,weight_kg,duration_seconds,notes))";
const BODY_METRIC_SELECT = "id,owner_id,agent_id,recorded_at,weight_kg,body_fat_percent,waist_cm,notes,created_at";
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
}
