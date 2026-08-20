import { z } from "zod";

export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  timezone: z.string(),
  goals: z.array(z.string()),
  experience: z.enum(["beginner", "intermediate", "advanced"]),
  createdAt: z.string(),
});

const setSchema = z.object({
  id: z.string(),
  reps: z.number().optional(),
  weightKg: z.number().optional(),
  durationSeconds: z.number().optional(),
  notes: z.string().optional(),
});

const workoutSchema = z.object({
  id: z.string(),
  title: z.string(),
  occurredAt: z.string(),
  durationMinutes: z.number().optional(),
  notes: z.string().optional(),
  exercises: z.array(z.object({ id: z.string(), name: z.string(), sets: z.array(setSchema) })),
});

const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(z.enum(["workouts:read", "workouts:write", "metrics:read", "metrics:write"])),
  capabilities: z.array(z.string()),
  webhookUrl: z.string().optional(),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
});

const metricSchema = z.object({
  id: z.string(),
  recordedAt: z.string(),
  weightKg: z.number().optional(),
  bodyFatPercent: z.number().optional(),
  waistCm: z.number().optional(),
  notes: z.string().optional(),
});

const statsSchema = z.object({
  totalWorkouts: z.number(),
  weeklyWorkouts: z.number(),
  totalVolumeKg: z.number(),
  weeklyVolumeKg: z.number(),
  currentWeightKg: z.number().nullable(),
  weightChangeKg: z.number().nullable(),
  weeklyActivity: z.array(z.object({ date: z.string(), volumeKg: z.number(), workouts: z.number() })),
});

export const sessionResponseSchema = z.object({ user: publicUserSchema });
export const workoutsResponseSchema = z.object({ workouts: z.array(workoutSchema) });
export const statsResponseSchema = z.object({ stats: statsSchema });
export const metricsResponseSchema = z.object({ metrics: z.array(metricSchema) });
export const agentsResponseSchema = z.object({ agents: z.array(agentSchema) });
export const agentCreatedResponseSchema = z.object({ agent: agentSchema, secret: z.string() });
export const workoutCreatedResponseSchema = z.object({ workout: workoutSchema });
export const metricCreatedResponseSchema = z.object({ metric: metricSchema });
export const statusResponseSchema = z.object({
  status: z.literal("ok"),
  storage: z.object({ mode: z.enum(["file", "memory"]), durable: z.boolean(), notice: z.string() }),
});

const apiErrorResponseSchema = z.object({
  error: z.object({ message: z.string(), fields: z.record(z.array(z.string())).optional() }),
});

export type PublicUser = z.infer<typeof publicUserSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type BodyMetric = z.infer<typeof metricSchema>;
export type ProgressStats = z.infer<typeof statsSchema>;
export type StorageStatus = z.infer<typeof statusResponseSchema>["storage"];

export class ApiRequestError extends Error {
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(status: number, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.fields = fields;
  }
}

export async function fetchApi<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsedError = apiErrorResponseSchema.safeParse(payload);
    throw new ApiRequestError(
      response.status,
      parsedError.success ? parsedError.data.error.message : "The request could not be completed",
      parsedError.success ? parsedError.data.error.fields : undefined,
    );
  }
  return schema.parse(payload);
}
