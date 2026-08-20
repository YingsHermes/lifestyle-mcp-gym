import { describe, expect, it } from "vitest";
import type { Agent, BodyMetric, Session, User } from "@/lib/domain";
import { createStorageRuntime } from "@/lib/storage";
import { JsonFileStorage } from "@/lib/storage/file";
import { MemoryStorage } from "@/lib/storage/memory";
import {
  deserializeAgent,
  deserializeBodyMetric,
  deserializeHuman,
  deserializeSession,
  deserializeWorkout,
  serializeAgent,
  serializeBodyMetric,
  serializeHuman,
  serializeSession,
  SupabaseStorage,
} from "@/lib/storage/supabase";

const createdAt = "2026-08-20T12:00:00.000Z";

describe("storage adapter selection", () => {
  it("selects Supabase only when both server credentials are present", () => {
    const runtime = createStorageRuntime({
      LIFESTYLE_STORAGE_DRIVER: "memory",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    });

    expect(runtime.mode).toBe("supabase");
    expect(runtime.durable).toBe(true);
    expect(runtime.storage).toBeInstanceOf(SupabaseStorage);
    expect(runtime.notice).not.toContain("test-service-role-key");
  });

  it.each([
    { SUPABASE_URL: "https://example.supabase.co" },
    { SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key" },
  ])("retains the configured local adapter when one Supabase value is missing", (supabaseEnvironment) => {
    const runtime = createStorageRuntime({
      LIFESTYLE_STORAGE_DRIVER: "memory",
      ...supabaseEnvironment,
    });

    expect(runtime.mode).toBe("memory");
    expect(runtime.storage).toBeInstanceOf(MemoryStorage);
  });

  it("retains file storage locally and memory storage on Vercel without Supabase", () => {
    const local = createStorageRuntime({ LIFESTYLE_DATA_FILE: "/tmp/lifestyle-gym-selection-test.json" });
    const vercel = createStorageRuntime({ VERCEL: "1" });

    expect(local.mode).toBe("file");
    expect(local.storage).toBeInstanceOf(JsonFileStorage);
    expect(vercel.mode).toBe("memory");
    expect(vercel.storage).toBeInstanceOf(MemoryStorage);
  });
});

describe("Supabase row serialization", () => {
  it("round-trips humans and sessions without changing hashes", () => {
    const human: User = {
      id: "user_1",
      name: "Maya Chen",
      email: "maya@example.com",
      passwordHash: "scrypt$password-hash",
      timezone: "America/Los_Angeles",
      goals: ["Build strength"],
      experience: "intermediate",
      consentAt: createdAt,
      createdAt,
    };
    const session: Session = {
      id: "session_1",
      userId: human.id,
      tokenHash: "sha256-token-hash",
      expiresAt: "2026-09-19T12:00:00.000Z",
      createdAt,
    };

    expect(deserializeHuman(serializeHuman(human))).toEqual(human);
    expect(deserializeSession(serializeSession(session))).toEqual(session);
    expect(serializeHuman(human)).not.toHaveProperty("passwordHash");
    expect(serializeSession(session)).not.toHaveProperty("tokenHash");
  });

  it("round-trips agent JSON fields and nullable values", () => {
    const agent: Agent = {
      id: "agent_1",
      ownerId: "user_1",
      name: "Training logger",
      secretHash: "scrypt$agent-secret-hash",
      scopes: ["workouts:write", "metrics:read"],
      capabilities: ["logging", "analysis"],
      ownerMetadata: { model: "coach-v2" },
      createdAt,
    };
    const row = serializeAgent(agent);

    expect(row.secret_hash).toBe(agent.secretHash);
    expect(row).not.toHaveProperty("secretHash");
    expect(row.webhook_url).toBeNull();
    expect(row.last_used_at).toBeNull();
    expect(deserializeAgent(row)).toEqual(agent);
  });

  it("rebuilds normalized workouts in their stored positions", () => {
    const workout = deserializeWorkout({
      id: "workout_1",
      owner_id: "user_1",
      agent_id: null,
      title: "Heavy day",
      occurred_at: createdAt,
      duration_minutes: null,
      notes: null,
      created_at: createdAt,
      workout_exercises: [
        {
          id: "exercise_2",
          position: 1,
          name: "Row",
          workout_sets: [{ id: "set_2", position: 0, reps: 8, weight_kg: 60, duration_seconds: null, notes: null }],
        },
        {
          id: "exercise_1",
          position: 0,
          name: "Squat",
          workout_sets: [
            { id: "set_1b", position: 1, reps: 5, weight_kg: 105, duration_seconds: null, notes: "Hard" },
            { id: "set_1a", position: 0, reps: 5, weight_kg: 100, duration_seconds: null, notes: null },
          ],
        },
      ],
    });

    expect(workout.exercises.map((exercise) => exercise.id)).toEqual(["exercise_1", "exercise_2"]);
    expect(workout.exercises[0].sets.map((set) => set.id)).toEqual(["set_1a", "set_1b"]);
    expect(workout.agentId).toBeUndefined();
    expect(workout.durationMinutes).toBeUndefined();
  });

  it("round-trips body metric optionals through nullable columns", () => {
    const metric: BodyMetric = {
      id: "metric_1",
      ownerId: "user_1",
      recordedAt: createdAt,
      weightKg: 72.4,
      createdAt,
    };
    const row = serializeBodyMetric(metric);

    expect(row.agent_id).toBeNull();
    expect(row.body_fat_percent).toBeNull();
    expect(row.waist_cm).toBeNull();
    expect(deserializeBodyMetric(row)).toEqual(metric);
  });
});
