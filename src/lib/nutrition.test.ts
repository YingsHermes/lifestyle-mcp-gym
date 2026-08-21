import { describe, expect, it } from "vitest";
import {
  foodLogInputSchema,
  nutritionProfileInputSchema,
  type NutritionProfile,
} from "@/lib/domain";
import { ageOnDate, calculateNutritionTargets } from "@/lib/nutrition-calculations";

const baseProfile: NutritionProfile = {
  ownerId: "user_1",
  sex: "male",
  birthDate: "1996-08-20",
  heightCm: 180,
  activityLevel: "moderately_active",
  goal: "lose",
  dietaryPreferences: [],
  allergies: [],
  createdAt: "2026-08-20T12:00:00.000Z",
  updatedAt: "2026-08-20T12:00:00.000Z",
};

describe("deterministic nutrition calculations", () => {
  it("calculates age against the as-of date without timezone drift", () => {
    expect(ageOnDate("1990-08-21", "2026-08-20")).toBe(35);
    expect(ageOnDate("1990-08-20", "2026-08-20")).toBe(36);
    expect(ageOnDate("2000-02-29", "2026-02-28")).toBe(25);
  });

  it("keeps a lose goal below neutral maintenance with loss-specific coaching", () => {
    const result = calculateNutritionTargets({
      profile: baseProfile,
      weightKg: 80,
      asOfDate: "2026-08-20",
    });

    expect(result).toMatchObject({
      bmr: 1780,
      tdee: 2759,
      maintenanceCalories: 2759,
      goalTargetCalories: 2259,
      goalAdjustmentCalories: -500,
      goal: "lose",
      goalSummary: "Lose goal: target is a 500 kcal/day deficit below maintenance.",
      targetCalories: 2259,
      proteinTargetG: 144,
      fatTargetG: 64,
      carbsTargetG: 276.8,
      formulaVersion: "lifestyle-nutrition-v2",
      missingInputs: [],
    });
    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.stringMatching(/modest deficit/i),
      expect.stringMatching(/protein.*resistance training/i),
    ]));
    expect(result.suggestions.join(" ")).not.toMatch(/surplus/i);
    expect(result.assumptions).toEqual(expect.arrayContaining([
      expect.stringContaining("Mifflin-St Jeor"),
      expect.stringContaining("1.55"),
      expect.stringContaining("500 kcal/day"),
    ]));
    expect(result.safetyNote).toContain("wellness estimate");
  });

  it("keeps a maintain goal exactly at neutral maintenance", () => {
    const result = calculateNutritionTargets({
      profile: { ...baseProfile, goal: "maintain" },
      weightKg: 80,
      asOfDate: "2026-08-20",
    });

    expect(result).toMatchObject({
      maintenanceCalories: 2759,
      goalTargetCalories: 2759,
      goalAdjustmentCalories: 0,
      goal: "maintain",
      goalSummary: "Maintain goal: target stays at maintenance.",
      targetCalories: 2759,
    });
    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.stringMatching(/stay near maintenance.*monitor.*trend/i),
    ]));
  });

  it("keeps a gain goal above neutral maintenance with gain-specific coaching", () => {
    const result = calculateNutritionTargets({
      profile: { ...baseProfile, goal: "gain" },
      weightKg: 80,
      asOfDate: "2026-08-20",
    });

    expect(result.goalTargetCalories).toBeGreaterThan(2759);
    expect(result).toMatchObject({
      maintenanceCalories: 2759,
      goalTargetCalories: 3059,
      goalAdjustmentCalories: 300,
      goal: "gain",
      goalSummary: "Gain goal: target is a 300 kcal/day surplus above maintenance.",
      targetCalories: 3059,
    });
    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.stringMatching(/eat above maintenance.*surplus/i),
      expect.stringMatching(/progressive resistance training/i),
    ]));
    expect(result.suggestions.join(" ")).not.toMatch(/deficit/i);
  });

  it("normalizes custom target-rate signs that conflict with lose or gain goals", () => {
    const loss = calculateNutritionTargets({
      profile: { ...baseProfile, targetRateKgPerWeek: 0.25 },
      weightKg: 80,
      asOfDate: "2026-08-20",
    });
    const gain = calculateNutritionTargets({
      profile: { ...baseProfile, goal: "gain", targetRateKgPerWeek: -0.25 },
      weightKg: 80,
      asOfDate: "2026-08-20",
    });

    expect(loss).toMatchObject({ maintenanceCalories: 2759, goalTargetCalories: 2484, goalAdjustmentCalories: -275 });
    expect(gain).toMatchObject({ maintenanceCalories: 2759, goalTargetCalories: 3034, goalAdjustmentCalories: 275 });
    expect(loss.assumptions).toEqual(expect.arrayContaining([
      expect.stringMatching(/0\.25 kg\/week conflicts with the lose goal; normalized to -0\.25 kg\/week/i),
    ]));
    expect(gain.assumptions).toEqual(expect.arrayContaining([
      expect.stringMatching(/-0\.25 kg\/week conflicts with the gain goal; normalized to 0\.25 kg\/week/i),
    ]));
  });

  it("uses sex-specific offsets and clearly labels the other-sex midpoint estimate", () => {
    const female = calculateNutritionTargets({
      profile: { ...baseProfile, sex: "female", goal: "maintain" },
      weightKg: 80,
      asOfDate: "2026-08-20",
    });
    const other = calculateNutritionTargets({
      profile: { ...baseProfile, sex: "other", goal: "maintain" },
      weightKg: 80,
      asOfDate: "2026-08-20",
    });

    expect(female.bmr).toBe(1614);
    expect(other.bmr).toBe(1697);
    expect(other.assumptions).toContain("Sex 'other' uses the midpoint Mifflin-St Jeor offset of -78 kcal/day; this is a labeled estimate.");
  });

  it("uses a supplied weekly rate and explains a safety-floor clamp", () => {
    const result = calculateNutritionTargets({
      profile: {
        ...baseProfile,
        sex: "female",
        birthDate: "1986-08-20",
        heightCm: 150,
        activityLevel: "sedentary",
        targetRateKgPerWeek: -1,
      },
      weightKg: 45,
      asOfDate: "2026-08-20",
    });

    expect(result.goalTargetCalories).toBe(1200);
    expect(result.targetCalories).toBe(result.goalTargetCalories);
    expect(result.assumptions).toEqual(expect.arrayContaining([
      expect.stringContaining("-1 kg/week"),
      expect.stringContaining("clamped to the 1200 kcal/day safety floor"),
    ]));
  });

  it("returns every explicit goal field without inventing a missing body weight", () => {
    const result = calculateNutritionTargets({ profile: baseProfile, asOfDate: "2026-08-20" });

    expect(result).toMatchObject({
      bmr: null,
      tdee: null,
      maintenanceCalories: null,
      goalTargetCalories: null,
      goalAdjustmentCalories: null,
      goal: "lose",
      targetCalories: null,
      proteinTargetG: null,
      fatTargetG: null,
      carbsTargetG: null,
      missingInputs: ["weightKg"],
    });
    expect(result.goalSummary).toMatch(/current body weight.*neutral baseline.*deficit/i);
    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.stringMatching(/record a current body weight/i),
      expect.stringMatching(/modest deficit/i),
    ]));
    expect(result.assumptions).toContain("No body weight was available; calorie and macro targets were not calculated.");
  });
});

describe("nutrition input validation", () => {
  it("accepts a complete profile and rejects invalid enum, date, height, rate, and long list values", () => {
    expect(nutritionProfileInputSchema.parse({
      sex: "other",
      birthDate: "1990-04-12",
      heightCm: 171.5,
      activityLevel: "very_active",
      goal: "gain",
      targetRateKgPerWeek: 0.25,
      dietaryPreferences: ["vegetarian"],
      allergies: ["peanuts"],
    })).toMatchObject({ sex: "other", dietaryPreferences: ["vegetarian"] });

    expect(nutritionProfileInputSchema.safeParse({ ...baseProfile, sex: "unknown" }).success).toBe(false);
    expect(nutritionProfileInputSchema.safeParse({ ...baseProfile, birthDate: "04/12/1990" }).success).toBe(false);
    expect(nutritionProfileInputSchema.safeParse({ ...baseProfile, heightCm: 20 }).success).toBe(false);
    expect(nutritionProfileInputSchema.safeParse({ ...baseProfile, targetRateKgPerWeek: 1.1 }).success).toBe(false);
    expect(nutritionProfileInputSchema.safeParse({ ...baseProfile, allergies: ["a".repeat(51)] }).success).toBe(false);
  });

  it("accepts user-entered food totals and bounds every nonnegative numeric field", () => {
    const valid = {
      eatenAt: "2026-08-20T12:30:00.000Z",
      mealType: "lunch",
      foodName: "Tofu rice bowl",
      servingSize: "1 bowl",
      servings: 1.5,
      caloriesKcal: 640,
      proteinG: 31,
      carbohydratesG: 82,
      fatG: 19,
      fiberG: 11,
      notes: "User-entered package and recipe totals",
    };
    expect(foodLogInputSchema.parse(valid)).toEqual(valid);

    for (const field of ["caloriesKcal", "proteinG", "carbohydratesG", "fatG", "fiberG"] as const) {
      expect(foodLogInputSchema.safeParse({ ...valid, [field]: -0.1 }).success).toBe(false);
    }
    expect(foodLogInputSchema.safeParse({ ...valid, caloriesKcal: 20_001 }).success).toBe(false);
    expect(foodLogInputSchema.safeParse({ ...valid, proteinG: 2_001 }).success).toBe(false);
    expect(foodLogInputSchema.safeParse({ ...valid, servings: 0 }).success).toBe(false);
    expect(foodLogInputSchema.safeParse({ ...valid, extra: "not allowed" }).success).toBe(false);
  });
});
