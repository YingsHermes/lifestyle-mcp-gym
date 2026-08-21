import { z } from "zod";
import { describe, expect, it } from "vitest";
import { handleMcpRequest } from "@/lib/mcp";
import { LifestyleService } from "@/lib/service";
import { MemoryStorage } from "@/lib/storage/memory";

const listedSchema = z.object({
  result: z.object({
    tools: z.array(z.object({ name: z.string(), description: z.string() })),
  }),
});

async function setup() {
  const service = new LifestyleService(new MemoryStorage(), { now: () => new Date("2026-08-20T20:00:00.000Z") });
  const registration = await service.registerHuman({
    name: "Maya Chen",
    email: "maya@example.com",
    password: "correct horse battery staple",
    timezone: "America/Los_Angeles",
    goals: ["Build strength"],
    experience: "intermediate",
    consent: true,
  });
  await service.logWorkout(registration.user.id, {
    title: "Strength day",
    occurredAt: "2026-08-19T18:00:00.000Z",
    durationMinutes: 55,
    exercises: [{ name: "Deadlift", sets: [{ reps: 3, weightKg: 150 }] }],
  });
  return { service, ownerId: registration.user.id };
}

async function call(service: LifestyleService, secret: string, name: string, args: unknown = {}) {
  return handleMcpRequest(
    { jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: args } },
    secret,
    service,
  );
}

describe("progress MCP surface", () => {
  it("advertises daily logs, body trends, nutrition mutations, and strength summaries clearly", async () => {
    const { service } = await setup();
    const response = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }, undefined, service);
    const tools = listedSchema.parse(response.body).result.tools;
    expect(tools.find((tool) => tool.name === "list_workouts")?.description).toContain("daily");
    expect(tools.find((tool) => tool.name === "get_stats")?.description).toContain("body");
    expect(tools.find((tool) => tool.name === "update_food")?.description).toContain("owner");
    expect(tools.find((tool) => tool.name === "delete_food")?.description).toContain("owner");
    expect(tools.find((tool) => tool.name === "get_strength_progress")?.description).toContain("estimated 1RM");
  });

  it("returns a structured strength summary with estimate labels and enforces workouts:read", async () => {
    const { service, ownerId } = await setup();
    const reader = await service.createAgent(ownerId, {
      name: "Strength analyst",
      scopes: ["workouts:read"],
      capabilities: ["progress summaries"],
    });
    const nutritionOnly = await service.createAgent(ownerId, {
      name: "Nutrition analyst",
      scopes: ["nutrition:read"],
      capabilities: ["nutrition summaries"],
    });

    const denied = await call(service, nutritionOnly.secret, "get_strength_progress");
    expect(denied.status).toBe(403);

    const response = await call(service, reader.secret, "get_strength_progress");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      result: {
        structuredContent: {
          formula: { estimated1RM: "Epley: weightKg × (1 + reps ÷ 30)", estimated: true },
          exercises: [expect.objectContaining({ name: "Deadlift", bestWeightKg: 150, bestEstimated1RMKg: 165 })],
        },
      },
    });
  });
});
