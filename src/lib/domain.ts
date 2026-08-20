import { z } from "zod";

export const experienceLevels = ["beginner", "intermediate", "advanced"] as const;
export const agentScopes = ["workouts:read", "workouts:write", "metrics:read", "metrics:write", "dashboard:link"] as const;

const validTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};

const safeText = (minimum: number, maximum: number) =>
  z.string().trim().min(minimum).max(maximum);

export const humanRegistrationSchema = z.object({
  name: safeText(2, 80),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128)
    .refine((value) => !["passwordpassword", "123456789012", "qwertyqwerty"].includes(value.toLowerCase()), "Choose a less common password"),
  timezone: z.string().max(100).refine(validTimezone, "Use a valid IANA timezone"),
  goals: z.array(safeText(2, 80)).min(1).max(8),
  experience: z.enum(experienceLevels),
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required" }) }),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
}).strict();

export const agentRegistrationSchema = z.object({
  name: safeText(2, 80),
  scopes: z.array(z.enum(agentScopes)).min(1).max(agentScopes.length),
  capabilities: z.array(safeText(2, 60)).min(1).max(12),
  webhookUrl: z.string().url().max(2048).refine((value) => value.startsWith("https://"), "Webhook URL must use HTTPS").optional(),
  ownerMetadata: z.record(z.string().max(80), z.string().max(200)).optional(),
}).strict();

export const dashboardLinkInputSchema = z.object({
  ttlMinutes: z.number().int().min(1).max(30).optional().default(10),
}).strict();

const setInputSchema = z
  .object({
    reps: z.number().int().min(1).max(1000).optional(),
    weightKg: z.number().min(0).max(2000).optional(),
    durationSeconds: z.number().int().min(1).max(86400).optional(),
    notes: safeText(1, 500).optional(),
  })
  .strict()
  .refine((set) => set.reps !== undefined || set.durationSeconds !== undefined, "A set needs reps or duration");

const exerciseInputSchema = z.object({
  name: safeText(2, 100),
  sets: z.array(setInputSchema).min(1).max(100),
}).strict();

export const workoutInputSchema = z.object({
  title: safeText(2, 120),
  occurredAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  notes: safeText(1, 2000).optional(),
  exercises: z.array(exerciseInputSchema).min(1).max(50),
}).strict();

export const workoutListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const bodyMetricInputSchema = z
  .object({
    recordedAt: z.string().datetime({ offset: true }),
    weightKg: z.number().min(20).max(500).optional(),
    bodyFatPercent: z.number().min(1).max(75).optional(),
    waistCm: z.number().min(20).max(300).optional(),
    notes: safeText(1, 500).optional(),
  })
  .strict()
  .refine(
    (metric) => metric.weightKg !== undefined || metric.bodyFatPercent !== undefined || metric.waistCm !== undefined,
    "Provide at least one measurement",
  );

export type HumanRegistrationInput = z.infer<typeof humanRegistrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type AgentRegistrationInput = z.infer<typeof agentRegistrationSchema>;
export type DashboardLinkInput = z.input<typeof dashboardLinkInputSchema>;
export type WorkoutInput = z.infer<typeof workoutInputSchema>;
export type BodyMetricInput = z.infer<typeof bodyMetricInputSchema>;
export type AgentScope = (typeof agentScopes)[number];
export type ExperienceLevel = (typeof experienceLevels)[number];

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  timezone: string;
  goals: string[];
  experience: ExperienceLevel;
  consentAt: string;
  createdAt: string;
}

export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
}

export interface Agent {
  id: string;
  ownerId: string;
  name: string;
  secretHash: string;
  scopes: AgentScope[];
  capabilities: string[];
  webhookUrl?: string;
  ownerMetadata?: Record<string, string>;
  createdAt: string;
  lastUsedAt?: string;
}

export interface AgentDashboardLink {
  id: string;
  ownerId: string;
  agentId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface WorkoutSet {
  id: string;
  reps?: number;
  weightKg?: number;
  durationSeconds?: number;
  notes?: string;
}

export interface Exercise {
  id: string;
  name: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  ownerId: string;
  agentId?: string;
  title: string;
  occurredAt: string;
  durationMinutes?: number;
  notes?: string;
  exercises: Exercise[];
  createdAt: string;
}

export interface BodyMetric {
  id: string;
  ownerId: string;
  agentId?: string;
  recordedAt: string;
  weightKg?: number;
  bodyFatPercent?: number;
  waistCm?: number;
  notes?: string;
  createdAt: string;
}

export interface DailyActivity {
  date: string;
  volumeKg: number;
  workouts: number;
}

export interface ProgressStats {
  totalWorkouts: number;
  weeklyWorkouts: number;
  totalVolumeKg: number;
  weeklyVolumeKg: number;
  currentWeightKg: number | null;
  weightChangeKg: number | null;
  weeklyActivity: DailyActivity[];
}

const workoutVolume = (workout: Workout) =>
  workout.exercises.reduce(
    (workoutTotal, exercise) =>
      workoutTotal +
      exercise.sets.reduce(
        (exerciseTotal, set) => exerciseTotal + (set.reps ?? 0) * (set.weightKg ?? 0),
        0,
      ),
    0,
  );

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function calculateStats(workouts: Workout[], metrics: BodyMetric[], now = new Date()): ProgressStats {
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = weekStart.getUTCDay();
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const weeklyActivity = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setUTCDate(day.getUTCDate() + index);
    return { date: isoDate(day), volumeKg: 0, workouts: 0 };
  });

  let totalVolumeKg = 0;
  let weeklyVolumeKg = 0;
  let weeklyWorkouts = 0;

  for (const workout of workouts) {
    const volume = workoutVolume(workout);
    totalVolumeKg += volume;
    const occurredAt = new Date(workout.occurredAt);
    if (occurredAt >= weekStart && occurredAt < weekEnd) {
      weeklyVolumeKg += volume;
      weeklyWorkouts += 1;
      const day = weeklyActivity.find((activity) => activity.date === isoDate(occurredAt));
      if (day) {
        day.volumeKg += volume;
        day.workouts += 1;
      }
    }
  }

  const weights = metrics
    .filter((metric) => metric.weightKg !== undefined)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const firstWeight = weights.at(0)?.weightKg;
  const currentWeightKg = weights.at(-1)?.weightKg ?? null;

  return {
    totalWorkouts: workouts.length,
    weeklyWorkouts,
    totalVolumeKg,
    weeklyVolumeKg,
    currentWeightKg,
    weightChangeKg: currentWeightKg !== null && firstWeight !== undefined ? Number((currentWeightKg - firstWeight).toFixed(2)) : null,
    weeklyActivity,
  };
}
