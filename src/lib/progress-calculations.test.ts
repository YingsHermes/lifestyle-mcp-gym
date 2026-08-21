import { describe, expect, it } from "vitest";
import type { BodyMetric, Workout } from "@/lib/domain";
import {
  calculateBodyProgress,
  calculateStrengthProgress,
  estimatedOneRepMaxKg,
} from "@/lib/progress-calculations";

const workout = (
  id: string,
  occurredAt: string,
  exercises: Workout["exercises"],
): Workout => ({
  id,
  ownerId: "user_1",
  title: `Session ${id}`,
  occurredAt,
  exercises,
  createdAt: occurredAt,
});

const metric = (id: string, recordedAt: string, values: Partial<BodyMetric>): BodyMetric => ({
  id,
  ownerId: "user_1",
  recordedAt,
  createdAt: recordedAt,
  ...values,
});

describe("strength progress calculations", () => {
  it("uses Epley only for positive weight and repetitions", () => {
    expect(estimatedOneRepMaxKg(100, 5)).toBe(116.7);
    expect(estimatedOneRepMaxKg(0, 5)).toBeNull();
    expect(estimatedOneRepMaxKg(100, undefined)).toBeNull();
  });

  it("computes exercise records, first-to-latest changes, volume trend, and PR badges", () => {
    const summary = calculateStrengthProgress([
      workout("first", "2026-07-01T18:00:00.000Z", [
        { id: "ex_1", name: "Back Squat", sets: [{ id: "set_1", reps: 5, weightKg: 100 }] },
        { id: "ex_2", name: "Bench Press", sets: [{ id: "set_2", reps: 8, weightKg: 60 }] },
      ]),
      workout("latest", "2026-08-19T18:00:00.000Z", [
        {
          id: "ex_3",
          name: "back squat",
          sets: [
            { id: "set_3", reps: 3, weightKg: 110 },
            { id: "set_4", reps: 5, weightKg: 105 },
          ],
        },
        { id: "ex_4", name: "Bench Press", sets: [{ id: "set_5", reps: 5, weightKg: 70 }] },
      ]),
    ]);

    expect(summary.totalVolumeKg).toBe(2185);
    expect(summary.volumeTrend).toMatchObject({
      firstLoggedWeekKg: 980,
      latestLoggedWeekKg: 1205,
      changeKg: 225,
      direction: "up",
    });
    const squat = summary.exercises.find((exercise) => exercise.name === "back squat");
    expect(squat).toMatchObject({
      bestWeightKg: 110,
      bestEstimated1RMKg: 122.5,
      firstBestWeightKg: 100,
      latestBestWeightKg: 110,
      weightChangeKg: 10,
      firstEstimated1RMKg: 116.7,
      latestEstimated1RMKg: 122.5,
      estimated1RMChangeKg: 5.8,
      badges: ["weight_pr", "estimated_1rm_pr"],
    });
    expect(summary.personalRecords).toEqual(expect.arrayContaining([
      expect.objectContaining({ exerciseName: "back squat", type: "weight", valueKg: 110, workoutId: "latest" }),
      expect.objectContaining({ exerciseName: "back squat", type: "estimated_1rm", valueKg: 122.5, workoutId: "latest", estimated: true }),
    ]));
    expect(summary.humanReadable).toContain("estimated 1RM");
  });

  it("explains insufficient trend data without inventing progress", () => {
    const summary = calculateStrengthProgress([]);
    expect(summary.exercises).toEqual([]);
    expect(summary.volumeTrend.direction).toBe("insufficient_data");
    expect(summary.dataQuality.message).toContain("workout");
    expect(summary.personalRecords).toEqual([]);
  });
});

describe("body progress calculations", () => {
  const metrics = [
    metric("old", "2026-05-01T08:00:00.000Z", { weightKg: 82 }),
    metric("first", "2026-07-01T08:00:00.000Z", { weightKg: 80, bodyFatPercent: 20, waistCm: 90 }),
    metric("latest", "2026-08-19T08:00:00.000Z", { weightKg: 78, bodyFatPercent: 19, waistCm: 87 }),
  ];

  it("filters by inclusive date range and reports clear units and trends", () => {
    const summary = calculateBodyProgress(metrics, { from: "2026-07-01", to: "2026-08-19" });
    expect(summary.metricsCount).toBe(2);
    expect(summary.weight).toMatchObject({ unit: "kg", first: 80, latest: 78, change: -2, direction: "down" });
    expect(summary.bodyFat).toMatchObject({ unit: "%", first: 20, latest: 19, change: -1, direction: "down" });
    expect(summary.waist).toMatchObject({ unit: "cm", first: 90, latest: 87, change: -3, direction: "down" });
    expect(summary.range).toEqual({ from: "2026-07-01", to: "2026-08-19" });
    expect(summary.sparseDataMessage).toBeNull();
  });

  it("returns a readable sparse-data explanation for one measurement", () => {
    const summary = calculateBodyProgress(metrics.slice(0, 1));
    expect(summary.weight.direction).toBe("insufficient_data");
    expect(summary.sparseDataMessage).toContain("second measurement");
  });
});
