import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { NutritionEntry, NutritionProfile } from "@/lib/domain";
import { JsonFileStorage } from "@/lib/storage/file";
import { MemoryStorage } from "@/lib/storage/memory";
import {
  deserializeNutritionEntry,
  deserializeNutritionProfile,
  serializeNutritionEntry,
  serializeNutritionProfile,
} from "@/lib/storage/supabase";

const tempDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const profile: NutritionProfile = {
  ownerId: "user_1",
  sex: "female",
  birthDate: "1991-03-07",
  heightCm: 168,
  activityLevel: "lightly_active",
  goal: "maintain",
  targetRateKgPerWeek: 0,
  dietaryPreferences: ["vegetarian"],
  allergies: ["peanuts"],
  createdAt: "2026-08-20T12:00:00.000Z",
  updatedAt: "2026-08-20T12:00:00.000Z",
};

const entry: NutritionEntry = {
  id: "nutrition_1",
  ownerId: "user_1",
  agentId: "agent_1",
  eatenAt: "2026-08-20T12:30:00.000Z",
  mealType: "lunch",
  foodName: "Tofu rice bowl",
  servingSize: "1 bowl",
  servings: 1,
  caloriesKcal: 640,
  proteinG: 31,
  carbohydratesG: 82,
  fatG: 19,
  fiberG: 11,
  notes: "User-entered totals",
  createdAt: "2026-08-20T12:31:00.000Z",
};

describe.each([
  ["memory", () => new MemoryStorage()],
  ["file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lifestyle-nutrition-"));
    tempDirectories.push(directory);
    return new JsonFileStorage(join(directory, "store.json"));
  }],
] as const)("%s nutrition storage", (_name, createStorage) => {
  it("upserts one profile per owner and keeps food entries owner-scoped and newest-first", async () => {
    const storage = await createStorage();
    await storage.upsertNutritionProfile(profile);
    await storage.upsertNutritionProfile({ ...profile, goal: "gain", updatedAt: "2026-08-20T13:00:00.000Z" });
    await storage.createNutritionEntry(entry);
    await storage.createNutritionEntry({
      ...entry,
      id: "nutrition_2",
      eatenAt: "2026-08-20T18:30:00.000Z",
      mealType: "dinner",
    });
    await storage.createNutritionEntry({ ...entry, id: "nutrition_other", ownerId: "user_2" });

    await expect(storage.getNutritionProfile("user_1")).resolves.toMatchObject({ goal: "gain" });
    await expect(storage.getNutritionProfile("user_2")).resolves.toBeNull();
    await expect(storage.listNutritionEntries("user_1", 10)).resolves.toMatchObject([
      { id: "nutrition_2" },
      { id: "nutrition_1" },
    ]);
    await expect(storage.listNutritionEntries("user_2", 10)).resolves.toHaveLength(1);
  });
});

describe("Supabase nutrition row serialization", () => {
  it("round-trips profiles and entries without changing user-entered values", () => {
    expect(deserializeNutritionProfile(serializeNutritionProfile(profile))).toEqual(profile);
    expect(deserializeNutritionEntry(serializeNutritionEntry(entry))).toEqual(entry);
    expect(serializeNutritionProfile(profile)).toMatchObject({
      owner_id: "user_1",
      birth_date: "1991-03-07",
      target_rate_kg_per_week: 0,
    });
    expect(serializeNutritionEntry(entry)).toMatchObject({
      owner_id: "user_1",
      agent_id: "agent_1",
      calories_kcal: 640,
      carbohydrates_g: 82,
    });
  });
});
