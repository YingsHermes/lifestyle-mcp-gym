import { describe, expect, it } from "vitest";
import {
  bodyMetricInputSchema,
  calculateStats,
  humanRegistrationSchema,
  workoutInputSchema,
  type BodyMetric,
  type Workout,
} from "@/lib/domain";

describe("domain validation", () => {
  it("accepts complete human registration and normalizes email", () => {
    const result = humanRegistrationSchema.parse({
      name: "  Maya Chen  ",
      email: "MAYA@EXAMPLE.COM",
      password: "correct horse battery staple",
      timezone: "America/Los_Angeles",
      goals: ["Build strength", "Sleep better"],
      experience: "intermediate",
      consent: true,
    });

    expect(result.name).toBe("Maya Chen");
    expect(result.email).toBe("maya@example.com");
  });

  it("rejects weak credentials, false consent, and impossible workout sets", () => {
    expect(() =>
      humanRegistrationSchema.parse({
        name: "M",
        email: "not-an-email",
        password: "password",
        timezone: "Mars/Olympus",
        goals: [],
        experience: "expert",
        consent: false,
      }),
    ).toThrow();

    expect(() =>
      workoutInputSchema.parse({
        title: "Bad session",
        occurredAt: "2026-08-20T08:00:00.000Z",
        exercises: [{ name: "Squat", sets: [{ reps: 0, weightKg: -10 }] }],
      }),
    ).toThrow();
  });

  it("requires at least one body measurement", () => {
    expect(() =>
      bodyMetricInputSchema.parse({ recordedAt: "2026-08-20T08:00:00.000Z", notes: "none" }),
    ).toThrow();
  });
});

describe("progress statistics", () => {
  it("calculates weekly volume and weight trend at a fixed boundary", () => {
    const workouts: Workout[] = [
      {
        id: "w1",
        ownerId: "u1",
        title: "Strength A",
        occurredAt: "2026-08-18T10:00:00.000Z",
        createdAt: "2026-08-18T11:00:00.000Z",
        exercises: [
          {
            id: "e1",
            name: "Back squat",
            sets: [
              { id: "s1", reps: 5, weightKg: 100 },
              { id: "s2", reps: 5, weightKg: 100 },
            ],
          },
        ],
      },
      {
        id: "w2",
        ownerId: "u1",
        title: "Previous week",
        occurredAt: "2026-08-09T10:00:00.000Z",
        createdAt: "2026-08-09T11:00:00.000Z",
        exercises: [
          { id: "e2", name: "Deadlift", sets: [{ id: "s3", reps: 3, weightKg: 150 }] },
        ],
      },
    ];
    const metrics: BodyMetric[] = [
      { id: "m1", ownerId: "u1", recordedAt: "2026-08-01T08:00:00.000Z", weightKg: 82, createdAt: "2026-08-01T08:00:00.000Z" },
      { id: "m2", ownerId: "u1", recordedAt: "2026-08-19T08:00:00.000Z", weightKg: 80.5, createdAt: "2026-08-19T08:00:00.000Z" },
    ];

    const stats = calculateStats(workouts, metrics, new Date("2026-08-20T12:00:00.000Z"));

    expect(stats.totalWorkouts).toBe(2);
    expect(stats.weeklyWorkouts).toBe(1);
    expect(stats.weeklyVolumeKg).toBe(1000);
    expect(stats.totalVolumeKg).toBe(1450);
    expect(stats.currentWeightKg).toBe(80.5);
    expect(stats.weightChangeKg).toBe(-1.5);
    expect(stats.weeklyActivity).toEqual([
      { date: "2026-08-17", volumeKg: 0, workouts: 0 },
      { date: "2026-08-18", volumeKg: 1000, workouts: 1 },
      { date: "2026-08-19", volumeKg: 0, workouts: 0 },
      { date: "2026-08-20", volumeKg: 0, workouts: 0 },
      { date: "2026-08-21", volumeKg: 0, workouts: 0 },
      { date: "2026-08-22", volumeKg: 0, workouts: 0 },
      { date: "2026-08-23", volumeKg: 0, workouts: 0 },
    ]);
  });
});
