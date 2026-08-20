export const NUTRITION_FORMULA_VERSION = "lifestyle-nutrition-v1";
export const NUTRITION_SAFETY_NOTE = "These calculations are wellness estimates, not medical advice. Individual energy needs vary; edit user-entered data and consult a qualified clinician for medical or condition-specific guidance.";

export type NutritionSex = "male" | "female" | "other";
export type NutritionActivityLevel = "sedentary" | "lightly_active" | "moderately_active" | "very_active" | "athlete";
export type NutritionGoal = "lose" | "maintain" | "gain";

export interface NutritionCalculationProfile {
  sex: NutritionSex;
  birthDate: string;
  heightCm: number;
  activityLevel: NutritionActivityLevel;
  goal: NutritionGoal;
  targetRateKgPerWeek?: number;
}

export interface NutritionCalculationInputs {
  sex: NutritionSex | null;
  birthDate: string | null;
  heightCm: number | null;
  activityLevel: NutritionActivityLevel | null;
  goal: NutritionGoal | null;
  targetRateKgPerWeek: number | null;
  weightKg: number | null;
  asOfDate: string | null;
}

export interface NutritionTargetResult {
  bmr: number | null;
  tdee: number | null;
  targetCalories: number | null;
  proteinTargetG: number | null;
  fatTargetG: number | null;
  carbsTargetG: number | null;
  inputs: NutritionCalculationInputs;
  assumptions: string[];
  formulaVersion: typeof NUTRITION_FORMULA_VERSION;
  safetyNote: string;
  missingInputs: string[];
}

const ACTIVITY_FACTOR: Record<NutritionActivityLevel, number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  athlete: 1.9,
};

const SEX_OFFSET: Record<NutritionSex, number> = {
  male: 5,
  female: -161,
  other: -78,
};

const SAFETY_FLOOR: Record<NutritionSex, number> = {
  male: 1500,
  female: 1200,
  other: 1350,
};

const GOAL_ADJUSTMENT: Record<NutritionGoal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError(`Invalid ISO date: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError(`Invalid ISO date: ${value}`);
  }
  return { year, month, day };
}

export function ageOnDate(birthDate: string, asOfDate: string): number {
  const birth = parseIsoDate(birthDate);
  const asOf = parseIsoDate(asOfDate);
  const birthdayHasOccurred = asOf.month > birth.month || (asOf.month === birth.month && asOf.day >= birth.day);
  const age = asOf.year - birth.year - (birthdayHasOccurred ? 0 : 1);
  if (age < 0) {
    throw new RangeError("Birth date cannot be after the as-of date");
  }
  return age;
}

function roundWhole(value: number): number {
  return Math.round(value);
}

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculateNutritionTargets(input: {
  profile: NutritionCalculationProfile;
  weightKg?: number;
  asOfDate: string;
}): NutritionTargetResult {
  const inputs: NutritionCalculationInputs = {
    sex: input.profile.sex,
    birthDate: input.profile.birthDate,
    heightCm: input.profile.heightCm,
    activityLevel: input.profile.activityLevel,
    goal: input.profile.goal,
    targetRateKgPerWeek: input.profile.targetRateKgPerWeek ?? null,
    weightKg: input.weightKg ?? null,
    asOfDate: input.asOfDate,
  };
  const assumptions = [
    "BMR uses the Mifflin-St Jeor equation: 10 × weightKg + 6.25 × heightCm - 5 × age + sex offset.",
  ];
  if (input.profile.sex === "other") {
    assumptions.push("Sex 'other' uses the midpoint Mifflin-St Jeor offset of -78 kcal/day; this is a labeled estimate.");
  }
  const activityFactor = ACTIVITY_FACTOR[input.profile.activityLevel];
  assumptions.push(`TDEE multiplies BMR by the ${input.profile.activityLevel} activity factor of ${activityFactor}.`);

  if (input.weightKg === undefined) {
    assumptions.push("No body weight was available; calorie and macro targets were not calculated.");
    return {
      bmr: null,
      tdee: null,
      targetCalories: null,
      proteinTargetG: null,
      fatTargetG: null,
      carbsTargetG: null,
      inputs,
      assumptions,
      formulaVersion: NUTRITION_FORMULA_VERSION,
      safetyNote: NUTRITION_SAFETY_NOTE,
      missingInputs: ["weightKg"],
    };
  }

  const age = ageOnDate(input.profile.birthDate, input.asOfDate);
  const rawBmr = 10 * input.weightKg + 6.25 * input.profile.heightCm - 5 * age + SEX_OFFSET[input.profile.sex];
  const rawTdee = rawBmr * activityFactor;
  let rawTarget: number;
  if (input.profile.targetRateKgPerWeek !== undefined) {
    const rate = input.profile.targetRateKgPerWeek;
    const dailyAdjustment = rate * 7700 / 7;
    rawTarget = rawTdee + dailyAdjustment;
    assumptions.push(`The supplied target rate of ${rate} kg/week adjusts TDEE by ${roundWhole(dailyAdjustment)} kcal/day using 7700 kcal/kg.`);
  } else {
    const adjustment = GOAL_ADJUSTMENT[input.profile.goal];
    rawTarget = rawTdee + adjustment;
    const explanation = input.profile.goal === "maintain"
      ? "The maintain goal uses TDEE without a calorie adjustment."
      : `The ${input.profile.goal} goal uses the default ${Math.abs(adjustment)} kcal/day ${adjustment < 0 ? "deficit" : "surplus"}.`;
    assumptions.push(explanation);
  }

  const floor = SAFETY_FLOOR[input.profile.sex];
  if (rawTarget < floor) {
    assumptions.push(`The calculated target of ${roundWhole(rawTarget)} kcal/day was clamped to the ${floor} kcal/day safety floor.`);
    rawTarget = floor;
  }

  const proteinTargetG = roundTenth(1.8 * input.weightKg);
  const fatTargetG = roundTenth(0.8 * input.weightKg);
  const remainingCalories = rawTarget - proteinTargetG * 4 - fatTargetG * 9;
  const carbsTargetG = roundTenth(Math.max(0, remainingCalories / 4));
  assumptions.push("Macro targets use 1.8 g protein/kg and 0.8 g fat/kg; carbohydrates fill remaining target calories at 4 kcal/g.");
  if (remainingCalories < 0) {
    assumptions.push("Protein and fat targets exceed the calorie target, so the carbohydrate target was clamped to 0 g.");
  }

  return {
    bmr: roundWhole(rawBmr),
    tdee: roundWhole(rawTdee),
    targetCalories: roundWhole(rawTarget),
    proteinTargetG,
    fatTargetG,
    carbsTargetG,
    inputs,
    assumptions,
    formulaVersion: NUTRITION_FORMULA_VERSION,
    safetyNote: NUTRITION_SAFETY_NOTE,
    missingInputs: [],
  };
}

export function missingNutritionTargets(missingInputs: string[]): NutritionTargetResult {
  return {
    bmr: null,
    tdee: null,
    targetCalories: null,
    proteinTargetG: null,
    fatTargetG: null,
    carbsTargetG: null,
    inputs: {
      sex: null,
      birthDate: null,
      heightCm: null,
      activityLevel: null,
      goal: null,
      targetRateKgPerWeek: null,
      weightKg: null,
      asOfDate: null,
    },
    assumptions: ["Calorie and macro targets were not calculated because required user data is missing."],
    formulaVersion: NUTRITION_FORMULA_VERSION,
    safetyNote: NUTRITION_SAFETY_NOTE,
    missingInputs,
  };
}
