import type { BodyMetric, Workout } from "@/lib/domain";

export type TrendDirection = "up" | "down" | "flat" | "insufficient_data";

export interface DateRange {
  from?: string;
  to?: string;
}

export interface BodyProgressSeries {
  unit: "kg" | "%" | "cm";
  first: number | null;
  latest: number | null;
  change: number | null;
  direction: TrendDirection;
  points: Array<{ recordedAt: string; value: number }>;
}

export interface BodyProgressSummary {
  range: { from: string | null; to: string | null };
  metricsCount: number;
  weight: BodyProgressSeries;
  bodyFat: BodyProgressSeries;
  waist: BodyProgressSeries;
  sparseDataMessage: string | null;
  humanReadable: string;
}

export type StrengthBadge = "weight_pr" | "estimated_1rm_pr";

export interface ExerciseStrengthProgress {
  name: string;
  sessions: number;
  firstPerformedAt: string;
  latestPerformedAt: string;
  bestWeightKg: number | null;
  bestEstimated1RMKg: number | null;
  firstBestWeightKg: number | null;
  latestBestWeightKg: number | null;
  weightChangeKg: number | null;
  firstEstimated1RMKg: number | null;
  latestEstimated1RMKg: number | null;
  estimated1RMChangeKg: number | null;
  badges: StrengthBadge[];
}

export interface StrengthPersonalRecord {
  exerciseName: string;
  type: "weight" | "estimated_1rm";
  valueKg: number;
  workoutId: string;
  occurredAt: string;
  estimated: boolean;
}

export interface StrengthProgressSummary {
  generatedAt: string;
  range: { from: string | null; to: string | null };
  formula: { estimated1RM: string; estimated: true };
  workoutCount: number;
  totalVolumeKg: number;
  volumeTrend: {
    firstLoggedWeek: string | null;
    latestLoggedWeek: string | null;
    firstLoggedWeekKg: number | null;
    latestLoggedWeekKg: number | null;
    changeKg: number | null;
    changePercent: number | null;
    direction: TrendDirection;
    points: Array<{ weekStart: string; volumeKg: number }>;
  };
  exercises: ExerciseStrengthProgress[];
  personalRecords: StrengthPersonalRecord[];
  dataQuality: { hasWeightedSets: boolean; message: string };
  humanReadable: string;
}

const rounded = (value: number): number => Math.round(value * 10) / 10;

export function estimatedOneRepMaxKg(weightKg: number | undefined, reps: number | undefined): number | null {
  if (weightKg === undefined || reps === undefined || weightKg <= 0 || reps <= 0) return null;
  return rounded(weightKg * (1 + reps / 30));
}

function direction(change: number | null): TrendDirection {
  if (change === null) return "insufficient_data";
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
}

function inRange(timestamp: string, range: DateRange): boolean {
  const date = timestamp.slice(0, 10);
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

function bodySeries(
  metrics: BodyMetric[],
  field: "weightKg" | "bodyFatPercent" | "waistCm",
  unit: BodyProgressSeries["unit"],
): BodyProgressSeries {
  const points = metrics.flatMap((metric) => {
    const value = metric[field];
    return value === undefined ? [] : [{ recordedAt: metric.recordedAt, value }];
  });
  const first = points[0]?.value ?? null;
  const latest = points.at(-1)?.value ?? null;
  const change = first !== null && latest !== null && points.length > 1 ? rounded(latest - first) : null;
  return { unit, first, latest, change, direction: direction(change), points };
}

export function calculateBodyProgress(metrics: BodyMetric[], range: DateRange = {}): BodyProgressSummary {
  const filtered = metrics
    .filter((metric) => inRange(metric.recordedAt, range))
    .toSorted((left, right) => left.recordedAt.localeCompare(right.recordedAt));
  const weight = bodySeries(filtered, "weightKg", "kg");
  const bodyFat = bodySeries(filtered, "bodyFatPercent", "%");
  const waist = bodySeries(filtered, "waistCm", "cm");
  const maximumPoints = Math.max(weight.points.length, bodyFat.points.length, waist.points.length);
  const sparseDataMessage = maximumPoints === 0
    ? "No body measurements exist in this range. Record a measurement to start a trend."
    : maximumPoints === 1
      ? "A second measurement is needed before a trend or change can be calculated."
      : null;
  const changes = [
    weight.change === null ? null : `weight ${weight.change > 0 ? "+" : ""}${weight.change} kg`,
    bodyFat.change === null ? null : `body fat ${bodyFat.change > 0 ? "+" : ""}${bodyFat.change}%`,
    waist.change === null ? null : `waist ${waist.change > 0 ? "+" : ""}${waist.change} cm`,
  ].filter((value): value is string => value !== null);
  return {
    range: { from: range.from ?? null, to: range.to ?? null },
    metricsCount: filtered.length,
    weight,
    bodyFat,
    waist,
    sparseDataMessage,
    humanReadable: changes.length ? `Since the first measurement in range: ${changes.join(", ")}.` : sparseDataMessage ?? "No comparable body signals.",
  };
}

function weekStart(timestamp: string): string {
  const date = new Date(timestamp);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const weekday = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - (weekday === 0 ? 6 : weekday - 1));
  return start.toISOString().slice(0, 10);
}

interface ExerciseSession {
  name: string;
  workoutId: string;
  occurredAt: string;
  bestWeightKg: number | null;
  bestEstimated1RMKg: number | null;
}

export function calculateStrengthProgress(
  workouts: Workout[],
  range: DateRange = {},
  now = new Date(),
): StrengthProgressSummary {
  const filtered = workouts
    .filter((workout) => inRange(workout.occurredAt, range))
    .toSorted((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const sessionsByExercise = new Map<string, ExerciseSession[]>();
  const weeklyVolume = new Map<string, number>();
  let totalVolumeKg = 0;
  let weightedSetCount = 0;

  for (const workout of filtered) {
    let workoutVolume = 0;
    for (const exercise of workout.exercises) {
      let bestWeightKg: number | null = null;
      let bestEstimated1RMKg: number | null = null;
      for (const set of exercise.sets) {
        if (set.weightKg !== undefined && set.weightKg > 0) {
          weightedSetCount += 1;
          bestWeightKg = bestWeightKg === null ? set.weightKg : Math.max(bestWeightKg, set.weightKg);
          workoutVolume += (set.reps ?? 0) * set.weightKg;
        }
        const estimate = estimatedOneRepMaxKg(set.weightKg, set.reps);
        if (estimate !== null) bestEstimated1RMKg = bestEstimated1RMKg === null ? estimate : Math.max(bestEstimated1RMKg, estimate);
      }
      const key = exercise.name.trim().toLocaleLowerCase();
      const sessions = sessionsByExercise.get(key) ?? [];
      sessions.push({ name: exercise.name.trim(), workoutId: workout.id, occurredAt: workout.occurredAt, bestWeightKg, bestEstimated1RMKg });
      sessionsByExercise.set(key, sessions);
    }
    totalVolumeKg += workoutVolume;
    const bucket = weekStart(workout.occurredAt);
    weeklyVolume.set(bucket, (weeklyVolume.get(bucket) ?? 0) + workoutVolume);
  }

  const personalRecords: StrengthPersonalRecord[] = [];
  const exercises: ExerciseStrengthProgress[] = [];
  for (const sessions of sessionsByExercise.values()) {
    const first = sessions[0];
    const latest = sessions.at(-1) as ExerciseSession;
    const bestWeightSession = sessions.reduce((best, session) => (session.bestWeightKg ?? -1) > (best.bestWeightKg ?? -1) ? session : best, first);
    const bestEstimateSession = sessions.reduce((best, session) => (session.bestEstimated1RMKg ?? -1) > (best.bestEstimated1RMKg ?? -1) ? session : best, first);
    const bestWeightKg = bestWeightSession.bestWeightKg;
    const bestEstimated1RMKg = bestEstimateSession.bestEstimated1RMKg;
    const weightChangeKg = first.bestWeightKg !== null && latest.bestWeightKg !== null ? rounded(latest.bestWeightKg - first.bestWeightKg) : null;
    const estimated1RMChangeKg = first.bestEstimated1RMKg !== null && latest.bestEstimated1RMKg !== null
      ? rounded(latest.bestEstimated1RMKg - first.bestEstimated1RMKg)
      : null;
    const badges: StrengthBadge[] = [];
    if (bestWeightKg !== null && latest.bestWeightKg === bestWeightKg) badges.push("weight_pr");
    if (bestEstimated1RMKg !== null && latest.bestEstimated1RMKg === bestEstimated1RMKg) badges.push("estimated_1rm_pr");
    if (bestWeightKg !== null) personalRecords.push({ exerciseName: latest.name, type: "weight", valueKg: bestWeightKg, workoutId: bestWeightSession.workoutId, occurredAt: bestWeightSession.occurredAt, estimated: false });
    if (bestEstimated1RMKg !== null) personalRecords.push({ exerciseName: latest.name, type: "estimated_1rm", valueKg: bestEstimated1RMKg, workoutId: bestEstimateSession.workoutId, occurredAt: bestEstimateSession.occurredAt, estimated: true });
    exercises.push({
      name: latest.name,
      sessions: sessions.length,
      firstPerformedAt: first.occurredAt,
      latestPerformedAt: latest.occurredAt,
      bestWeightKg,
      bestEstimated1RMKg,
      firstBestWeightKg: first.bestWeightKg,
      latestBestWeightKg: latest.bestWeightKg,
      weightChangeKg,
      firstEstimated1RMKg: first.bestEstimated1RMKg,
      latestEstimated1RMKg: latest.bestEstimated1RMKg,
      estimated1RMChangeKg,
      badges,
    });
  }
  exercises.sort((left, right) => (right.bestEstimated1RMKg ?? -1) - (left.bestEstimated1RMKg ?? -1));
  personalRecords.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));

  const points = [...weeklyVolume.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([week, volumeKg]) => ({ weekStart: week, volumeKg: rounded(volumeKg) }));
  const firstPoint = points[0];
  const latestPoint = points.at(-1);
  const comparable = points.length > 1 && firstPoint && latestPoint;
  const changeKg = comparable ? rounded(latestPoint.volumeKg - firstPoint.volumeKg) : null;
  const changePercent = comparable && firstPoint.volumeKg > 0 ? rounded((changeKg as number) / firstPoint.volumeKg * 100) : null;
  const message = weightedSetCount === 0
    ? "Log a workout with repetitions and weight to calculate strength records and estimated 1RM."
    : filtered.length === 1
      ? "One workout provides records; another comparable session is needed to show strength change."
      : "Signals use only logged repetitions and weight; estimated 1RM is not a measured max.";
  const topChange = exercises.find((exercise) => exercise.estimated1RMChangeKg !== null && exercise.estimated1RMChangeKg > 0);

  return {
    generatedAt: now.toISOString(),
    range: { from: range.from ?? null, to: range.to ?? null },
    formula: { estimated1RM: "Epley: weightKg × (1 + reps ÷ 30)", estimated: true },
    workoutCount: filtered.length,
    totalVolumeKg: rounded(totalVolumeKg),
    volumeTrend: {
      firstLoggedWeek: firstPoint?.weekStart ?? null,
      latestLoggedWeek: latestPoint?.weekStart ?? null,
      firstLoggedWeekKg: firstPoint?.volumeKg ?? null,
      latestLoggedWeekKg: latestPoint?.volumeKg ?? null,
      changeKg,
      changePercent,
      direction: direction(changeKg),
      points,
    },
    exercises,
    personalRecords,
    dataQuality: { hasWeightedSets: weightedSetCount > 0, message },
    humanReadable: weightedSetCount === 0
      ? message
      : `${exercises.length} weighted exercise${exercises.length === 1 ? "" : "s"} tracked. ${topChange ? `${topChange.name} estimated 1RM changed ${topChange.estimated1RMChangeKg! > 0 ? "+" : ""}${topChange.estimated1RMChangeKg} kg from first to latest logged session.` : "No positive first-to-latest estimated 1RM change is established yet."} Estimates use the Epley formula and are not measured maxes.`,
  };
}
