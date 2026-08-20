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
  scopes: z.array(z.enum(["workouts:read", "workouts:write", "metrics:read", "metrics:write", "nutrition:read", "nutrition:write", "coaching:read", "dashboard:link"])),
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

const nutritionProfileSchema = z.object({
  ownerId: z.string(),
  sex: z.enum(["male", "female", "other"]),
  birthDate: z.string(),
  heightCm: z.number(),
  activityLevel: z.enum(["sedentary", "lightly_active", "moderately_active", "very_active", "athlete"]),
  goal: z.enum(["lose", "maintain", "gain"]),
  targetRateKgPerWeek: z.number().optional(),
  dietaryPreferences: z.array(z.string()),
  allergies: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const nutritionEntrySchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  agentId: z.string().optional(),
  eatenAt: z.string(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "other"]),
  foodName: z.string(),
  servingSize: z.string(),
  servings: z.number(),
  caloriesKcal: z.number(),
  proteinG: z.number(),
  carbohydratesG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  notes: z.string().optional(),
  createdAt: z.string(),
});

const nutritionTargetsSchema = z.object({
  bmr: z.number().nullable(),
  tdee: z.number().nullable(),
  targetCalories: z.number().nullable(),
  proteinTargetG: z.number().nullable(),
  fatTargetG: z.number().nullable(),
  carbsTargetG: z.number().nullable(),
  inputs: z.object({
    sex: z.enum(["male", "female", "other"]).nullable(),
    birthDate: z.string().nullable(),
    heightCm: z.number().nullable(),
    activityLevel: z.enum(["sedentary", "lightly_active", "moderately_active", "very_active", "athlete"]).nullable(),
    goal: z.enum(["lose", "maintain", "gain"]).nullable(),
    targetRateKgPerWeek: z.number().nullable(),
    weightKg: z.number().nullable(),
    asOfDate: z.string().nullable(),
  }),
  assumptions: z.array(z.string()),
  formulaVersion: z.string(),
  safetyNote: z.string(),
  missingInputs: z.array(z.string()),
});

const nutritionSummarySchema = z.object({
  date: z.string(),
  entries: z.array(nutritionEntrySchema),
  totals: z.object({
    caloriesKcal: z.number(),
    proteinG: z.number(),
    carbohydratesG: z.number(),
    fatG: z.number(),
    fiberG: z.number(),
  }),
  calorieTargets: nutritionTargetsSchema,
  remainingCalories: z.number().nullable(),
  dataSource: z.literal("user_entered"),
  humanReadable: z.string(),
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
export const nutritionProfileResponseSchema = z.object({ profile: nutritionProfileSchema.nullable() });
export const nutritionSummaryResponseSchema = z.object({ summary: nutritionSummarySchema });
export const nutritionProfileSavedResponseSchema = z.object({ profile: nutritionProfileSchema });
export const nutritionEntryCreatedResponseSchema = z.object({ entry: nutritionEntrySchema, dataSource: z.literal("user_entered") });
export const statusResponseSchema = z.object({
  status: z.literal("ok"),
  storage: z.object({ mode: z.enum(["file", "memory", "supabase"]), durable: z.boolean(), notice: z.string() }),
});

const apiErrorResponseSchema = z.object({
  error: z.object({ message: z.string(), fields: z.record(z.array(z.string())).optional() }),
});

export type PublicUser = z.infer<typeof publicUserSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type BodyMetric = z.infer<typeof metricSchema>;
export type ProgressStats = z.infer<typeof statsSchema>;
export type NutritionProfile = z.infer<typeof nutritionProfileSchema>;
export type NutritionEntry = z.infer<typeof nutritionEntrySchema>;
export type NutritionTargets = z.infer<typeof nutritionTargetsSchema>;
export type NutritionSummary = z.infer<typeof nutritionSummarySchema>;
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
