import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { hashCredential } from "@/lib/auth";
import { JsonFileStorage } from "@/lib/storage/file";
import { StorageConflictError } from "@/lib/storage/types";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("JsonFileStorage", () => {
  it("persists owner-scoped records across adapter instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lifestyle-gym-"));
    tempDirectories.push(directory);
    const file = join(directory, "store.json");
    const first = new JsonFileStorage(file);

    await first.createUser({
      id: "user_1",
      name: "Maya Chen",
      email: "maya@example.com",
      passwordHash: await hashCredential("correct horse battery staple"),
      timezone: "America/Los_Angeles",
      goals: ["Build strength"],
      experience: "intermediate",
      consentAt: "2026-08-20T12:00:00.000Z",
      createdAt: "2026-08-20T12:00:00.000Z",
    });
    await first.createWorkout({
      id: "workout_1",
      ownerId: "user_1",
      title: "Heavy day",
      occurredAt: "2026-08-20T12:00:00.000Z",
      createdAt: "2026-08-20T12:01:00.000Z",
      exercises: [{ id: "exercise_1", name: "Squat", sets: [{ id: "set_1", reps: 5, weightKg: 100 }] }],
    });

    const reopened = new JsonFileStorage(file);
    expect((await reopened.findUserByEmail("maya@example.com"))?.id).toBe("user_1");
    expect(await reopened.listWorkouts("user_1", 10)).toHaveLength(1);
    expect(await reopened.listWorkouts("another_owner", 10)).toEqual([]);
  });

  it("stores only credential hashes and never a raw agent secret", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lifestyle-gym-"));
    tempDirectories.push(directory);
    const file = join(directory, "store.json");
    const storage = new JsonFileStorage(file);

    await storage.createAgent({
      id: "agent_1",
      ownerId: "user_1",
      name: "Training logger",
      secretHash: await hashCredential("raw-agent-secret"),
      scopes: ["workouts:write"],
      capabilities: ["logging"],
      createdAt: "2026-08-20T12:00:00.000Z",
    });

    const persisted = await readFile(file, "utf8");
    expect(persisted).not.toContain("raw-agent-secret");
    expect(persisted).toContain("secretHash");
  });

  it("serializes user creation and rejects duplicate emails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lifestyle-gym-"));
    tempDirectories.push(directory);
    const storage = new JsonFileStorage(join(directory, "store.json"));
    const user = {
      id: "user_1",
      name: "Maya Chen",
      email: "maya@example.com",
      passwordHash: "scrypt$placeholder",
      timezone: "America/Los_Angeles",
      goals: ["Build strength"],
      experience: "intermediate" as const,
      consentAt: "2026-08-20T12:00:00.000Z",
      createdAt: "2026-08-20T12:00:00.000Z",
    };

    await expect(
      Promise.all([
        storage.createUser(user),
        storage.createUser({ ...user, id: "user_2" }),
      ]),
    ).rejects.toBeInstanceOf(StorageConflictError);
    expect((await storage.findUserByEmail(user.email))?.id).toBe("user_1");
  });
});
