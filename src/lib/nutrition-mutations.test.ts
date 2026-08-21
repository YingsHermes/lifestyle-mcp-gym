import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { foodLogPatchSchema, type NutritionEntry } from "@/lib/domain";
import { handleMcpRequest } from "@/lib/mcp";
import { AppError, LifestyleService } from "@/lib/service";
import { JsonFileStorage } from "@/lib/storage/file";
import { MemoryStorage } from "@/lib/storage/memory";
import type { LifestyleStorage } from "@/lib/storage/types";

const tempDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function seededService(storage: LifestyleStorage) {
  let now = "2026-08-20T12:00:00.000Z";
  const service = new LifestyleService(storage, { now: () => new Date(now) });
  const first = await service.registerHuman({
    name: "Maya Chen",
    email: "maya@example.com",
    password: "correct horse battery staple",
    timezone: "America/Los_Angeles",
    goals: ["Build strength"],
    experience: "intermediate",
    consent: true,
  });
  const second = await service.registerHuman({
    name: "Other Owner",
    email: "other@example.com",
    password: "another correct horse battery staple",
    timezone: "UTC",
    goals: ["Move"],
    experience: "beginner",
    consent: true,
  });
  const entry = await service.logFood(first.user.id, {
    eatenAt: "2026-08-20T11:30:00.000Z",
    mealType: "lunch",
    foodName: "Rice bowl",
    servingSize: "1 bowl",
    servings: 1,
    caloriesKcal: 600,
    proteinG: 30,
    carbohydratesG: 80,
    fatG: 15,
    fiberG: 8,
    notes: "Original",
  });
  return {
    service,
    entry,
    ownerId: first.user.id,
    otherOwnerId: second.user.id,
    setNow(value: string) { now = value; },
  };
}

async function createFileStorage(): Promise<JsonFileStorage> {
  const directory = await mkdtemp(join(tmpdir(), "lifestyle-food-mutations-"));
  tempDirectories.push(directory);
  return new JsonFileStorage(join(directory, "data.json"));
}

describe("food patch validation", () => {
  it("accepts partial mutable values but rejects empty patches and owner changes", () => {
    expect(foodLogPatchSchema.parse({ foodName: "Updated bowl", caloriesKcal: 650 })).toEqual({ foodName: "Updated bowl", caloriesKcal: 650 });
    expect(() => foodLogPatchSchema.parse({})).toThrow();
    expect(() => foodLogPatchSchema.parse({ ownerId: "user_attacker" })).toThrow();
    expect(() => foodLogPatchSchema.parse({ caloriesKcal: -1 })).toThrow();
  });
});

describe.each([
  ["memory", async () => new MemoryStorage()],
  ["local file", createFileStorage],
] as const)("%s food mutation persistence", (_name, createStorage) => {
  it("edits and deletes while preserving owner, source, and creation audit fields", async () => {
    const context = await seededService(await createStorage());
    context.setNow("2026-08-20T13:00:00.000Z");
    const updated = await context.service.editFood(context.ownerId, context.entry.id, {
      foodName: "Large rice bowl",
      caloriesKcal: 720,
      notes: "Corrected from label",
    });
    expect(updated).toMatchObject({
      id: context.entry.id,
      ownerId: context.ownerId,
      foodName: "Large rice bowl",
      caloriesKcal: 720,
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T13:00:00.000Z",
    });

    await expect(context.service.editFood(context.otherOwnerId, context.entry.id, { foodName: "Stolen" }))
      .rejects.toMatchObject({ status: 404, code: "nutrition_entry_not_found" } satisfies Partial<AppError>);
    await expect(context.service.deleteFood(context.otherOwnerId, context.entry.id))
      .rejects.toMatchObject({ status: 404, code: "nutrition_entry_not_found" } satisfies Partial<AppError>);

    const deleted = await context.service.deleteFood(context.ownerId, context.entry.id);
    expect(deleted.id).toBe(context.entry.id);
    expect(await context.service.listFoodLog(context.ownerId)).toEqual([]);
  });
});

describe("agent nutrition mutation authorization", () => {
  async function call(service: LifestyleService, secret: string, name: string, args: unknown) {
    return handleMcpRequest(
      { jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: args } },
      secret,
      service,
    );
  }

  it("requires nutrition:write and can mutate only the credential owner's entries", async () => {
    const context = await seededService(new MemoryStorage());
    const writer = await context.service.createAgent(context.ownerId, {
      name: "Nutrition writer",
      scopes: ["nutrition:write"],
      capabilities: ["food corrections"],
    });
    const reader = await context.service.createAgent(context.ownerId, {
      name: "Nutrition reader",
      scopes: ["nutrition:read"],
      capabilities: ["food review"],
    });

    const forbidden = await call(context.service, reader.secret, "update_food", { entryId: context.entry.id, foodName: "Nope" });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toMatchObject({ error: { code: -32003, message: "Agent lacks required scope: nutrition:write" } });

    context.setNow("2026-08-20T14:00:00.000Z");
    const edited = await call(context.service, writer.secret, "update_food", { entryId: context.entry.id, foodName: "Agent correction" });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      result: { structuredContent: { entry: { ownerId: context.ownerId, foodName: "Agent correction", updatedAt: "2026-08-20T14:00:00.000Z" } } },
    });

    const removed = await call(context.service, writer.secret, "delete_food", { entryId: context.entry.id });
    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({ result: { structuredContent: { deleted: true, entryId: context.entry.id } } });
  });

  it("does not permit ownerId in mutation tool arguments", async () => {
    const context = await seededService(new MemoryStorage());
    const writer = await context.service.createAgent(context.ownerId, {
      name: "Nutrition writer",
      scopes: ["nutrition:write"],
      capabilities: ["food corrections"],
    });
    const response = await call(context.service, writer.secret, "update_food", {
      entryId: context.entry.id,
      ownerId: context.otherOwnerId,
      foodName: "Attempted transfer",
    });
    expect(response.status).toBe(400);
    const entries = await context.service.listFoodLog(context.ownerId);
    expect((entries[0] as NutritionEntry).ownerId).toBe(context.ownerId);
  });
});
