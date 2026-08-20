import { z } from "zod";
import { activityLevels, agentScopes, experienceLevels, mealTypes, nutritionGoals, nutritionSexes } from "@/lib/domain";

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  passwordHash: z.string(),
  timezone: z.string(),
  goals: z.array(z.string()),
  experience: z.enum(experienceLevels),
  consentAt: z.string(),
  createdAt: z.string(),
});

const sessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tokenHash: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

const agentSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string(),
  secretHash: z.string(),
  scopes: z.array(z.enum(agentScopes)),
  capabilities: z.array(z.string()),
  webhookUrl: z.string().optional(),
  ownerMetadata: z.record(z.string()).optional(),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
});

const agentDashboardLinkSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  agentId: z.string(),
  tokenHash: z.string(),
  expiresAt: z.string(),
  usedAt: z.string().optional(),
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
  ownerId: z.string(),
  agentId: z.string().optional(),
  title: z.string(),
  occurredAt: z.string(),
  durationMinutes: z.number().optional(),
  notes: z.string().optional(),
  exercises: z.array(z.object({ id: z.string(), name: z.string(), sets: z.array(setSchema) })),
  createdAt: z.string(),
});

const bodyMetricSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  agentId: z.string().optional(),
  recordedAt: z.string(),
  weightKg: z.number().optional(),
  bodyFatPercent: z.number().optional(),
  waistCm: z.number().optional(),
  notes: z.string().optional(),
  createdAt: z.string(),
});

const nutritionProfileSchema = z.object({
  ownerId: z.string(),
  sex: z.enum(nutritionSexes),
  birthDate: z.string(),
  heightCm: z.number(),
  activityLevel: z.enum(activityLevels),
  goal: z.enum(nutritionGoals),
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
  mealType: z.enum(mealTypes),
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

export const storageDocumentSchema = z.object({
  version: z.literal(1),
  users: z.array(userSchema),
  sessions: z.array(sessionSchema),
  agents: z.array(agentSchema),
  agentDashboardLinks: z.array(agentDashboardLinkSchema).default([]),
  workouts: z.array(workoutSchema),
  bodyMetrics: z.array(bodyMetricSchema),
  nutritionProfiles: z.array(nutritionProfileSchema).default([]),
  nutritionEntries: z.array(nutritionEntrySchema).default([]),
});
