export const NUTRITION_FORMULA_VERSION = "lifestyle-nutrition-v2";
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
  /** Backward-compatible TDEE field. Prefer maintenanceCalories for the neutral baseline. */
  tdee: number | null;
  maintenanceCalories: number | null;
  goalTargetCalories: number | null;
  goalAdjustmentCalories: number | null;
  goal: NutritionGoal | null;
  goalSummary: string;
  suggestions: string[];
  /** Backward-compatible alias of goalTargetCalories. */
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

function suggestionsForGoal(goal: NutritionGoal): string[] {
  if (goal === "gain") {
    return [
      "Eat above maintenance with a modest calorie surplus and monitor your body-weight trend.",
      "Support the gain goal with progressive resistance training and adequate protein.",
    ];
  }
  if (goal === "lose") {
    return [
      "Use a modest deficit below maintenance and monitor your body-weight trend.",
      "Preserve protein intake and resistance training while losing weight.",
    ];
  }
  return [
    "Stay near maintenance and monitor your body-weight trend.",
    "Keep protein intake and resistance training consistent while maintaining.",
  ];
}

function goalSummary(goal: NutritionGoal, adjustmentCalories: number): string {
  if (goal === "maintain") {
    return "Maintain goal: target stays at maintenance.";
  }
  if (goal === "gain") {
    return `Gain goal: target is a ${Math.abs(adjustmentCalories)} kcal/day surplus above maintenance.`;
  }
  if (adjustmentCalories === 0) {
    return "Lose goal: safety constraints leave the target at maintenance rather than creating an unsafe target.";
  }
  return `Lose goal: target is a ${Math.abs(adjustmentCalories)} kcal/day deficit below maintenance.`;
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
      maintenanceCalories: null,
      goalTargetCalories: null,
      goalAdjustmentCalories: null,
      goal: input.profile.goal,
      goalSummary: `${input.profile.goal.charAt(0).toUpperCase()}${input.profile.goal.slice(1)} goal: a current body weight is required to calculate the neutral baseline and ${input.profile.goal === "gain" ? "surplus" : input.profile.goal === "lose" ? "deficit" : "maintenance target"}.`,
      suggestions: [
        "Record a current body weight to calculate maintenance and the goal-adjusted target.",
        ...suggestionsForGoal(input.profile.goal),
      ],
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
  const suppliedRate = input.profile.targetRateKgPerWeek;
  let rawTarget: number;

  if (input.profile.goal === "maintain") {
    rawTarget = rawTdee;
    assumptions.push("The maintain goal uses TDEE without a calorie adjustment.");
    if (suppliedRate !== undefined && suppliedRate !== 0) {
      assumptions.push(`The supplied target rate of ${suppliedRate} kg/week was ignored because a maintain goal stays at maintenance.`);
    }
  } else if (suppliedRate !== undefined && suppliedRate !== 0) {
    const normalizedRate = input.profile.goal === "lose" ? -Math.abs(suppliedRate) : Math.abs(suppliedRate);
    if (normalizedRate !== suppliedRate) {
      assumptions.push(`The supplied target rate of ${suppliedRate} kg/week conflicts with the ${input.profile.goal} goal; normalized to ${normalizedRate} kg/week before calculating the target.`);
    }
    const dailyAdjustment = normalizedRate * 7700 / 7;
    rawTarget = rawTdee + dailyAdjustment;
    assumptions.push(`${normalizedRate === suppliedRate ? "The supplied" : "The normalized"} target rate of ${normalizedRate} kg/week adjusts maintenance by ${roundWhole(dailyAdjustment)} kcal/day using 7700 kcal/kg.`);
  } else {
    const adjustment = GOAL_ADJUSTMENT[input.profile.goal];
    rawTarget = rawTdee + adjustment;
    if (suppliedRate === 0) {
      assumptions.push(`The supplied target rate of 0 kg/week does not express a ${input.profile.goal} direction, so the default goal adjustment was used.`);
    }
    assumptions.push(`The ${input.profile.goal} goal uses the default ${Math.abs(adjustment)} kcal/day ${adjustment < 0 ? "deficit" : "surplus"}.`);
  }

  const floor = SAFETY_FLOOR[input.profile.sex];
  if (rawTarget < floor && input.profile.goal !== "maintain") {
    const calculatedTarget = roundWhole(rawTarget);
    if (input.profile.goal === "lose" && rawTdee <= floor) {
      assumptions.push(`The calculated target of ${calculatedTarget} kcal/day was below the ${floor} kcal/day safety floor, which would meet or exceed maintenance; the target was set to maintenance instead.`);
      rawTarget = rawTdee;
    } else {
      assumptions.push(`The calculated target of ${calculatedTarget} kcal/day was clamped to the ${floor} kcal/day safety floor.`);
      rawTarget = floor;
    }
  }

  const proteinTargetG = roundTenth(1.8 * input.weightKg);
  const fatTargetG = roundTenth(0.8 * input.weightKg);
  const remainingCalories = rawTarget - proteinTargetG * 4 - fatTargetG * 9;
  const carbsTargetG = roundTenth(Math.max(0, remainingCalories / 4));
  assumptions.push("Macro targets use 1.8 g protein/kg and 0.8 g fat/kg; carbohydrates fill remaining target calories at 4 kcal/g.");
  if (remainingCalories < 0) {
    assumptions.push("Protein and fat targets exceed the calorie target, so the carbohydrate target was clamped to 0 g.");
  }

  const maintenanceCalories = roundWhole(rawTdee);
  let goalTargetCalories = roundWhole(rawTarget);
  if (input.profile.goal === "gain" && goalTargetCalories <= maintenanceCalories) {
    goalTargetCalories = maintenanceCalories + 1;
  } else if (input.profile.goal === "lose" && rawTarget < rawTdee && goalTargetCalories >= maintenanceCalories) {
    goalTargetCalories = maintenanceCalories - 1;
  }
  const goalAdjustmentCalories = goalTargetCalories - maintenanceCalories;

  return {
    bmr: roundWhole(rawBmr),
    tdee: maintenanceCalories,
    maintenanceCalories,
    goalTargetCalories,
    goalAdjustmentCalories,
    goal: input.profile.goal,
    goalSummary: goalSummary(input.profile.goal, goalAdjustmentCalories),
    suggestions: suggestionsForGoal(input.profile.goal),
    targetCalories: goalTargetCalories,
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
    maintenanceCalories: null,
    goalTargetCalories: null,
    goalAdjustmentCalories: null,
    goal: null,
    goalSummary: "Goal unavailable: set a nutrition profile to calculate maintenance and a goal-adjusted target.",
    suggestions: [
      "Set a nutrition profile with a lose, maintain, or gain goal.",
      "Record a current body weight to calculate maintenance and the goal-adjusted target.",
    ],
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
