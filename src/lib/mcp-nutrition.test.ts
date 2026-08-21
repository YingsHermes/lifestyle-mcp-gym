import { z } from "zod";
import { describe, expect, it } from "vitest";
import { handleMcpRequest } from "@/lib/mcp";
import { LifestyleService } from "@/lib/service";
import { MemoryStorage } from "@/lib/storage/memory";

async function registeredService() {
  const storage = new MemoryStorage();
  const service = new LifestyleService(storage, { now: () => new Date("2026-08-20T20:00:00.000Z") });
  const registration = await service.registerHuman({
    name: "Maya Chen",
    email: "maya@example.com",
    password: "correct horse battery staple",
    timezone: "America/Los_Angeles",
    goals: ["Build strength"],
    experience: "intermediate",
    consent: true,
  });
  return { service, ownerId: registration.user.id, sessionToken: registration.sessionToken };
}

async function call(service: LifestyleService, secret: string, name: string, args: unknown = {}) {
  return handleMcpRequest(
    { jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: args } },
    secret,
    service,
  );
}

const toolListSchema = z.object({
  result: z.object({
    tools: z.array(z.object({
      name: z.string(),
      description: z.string(),
      inputSchema: z.record(z.unknown()),
    })),
  }),
});

const toolResultSchema = z.object({
  result: z.object({
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    structuredContent: z.record(z.unknown()),
  }),
});

describe("nutrition MCP schemas", () => {
  it("advertises strict profile, food, summary, target, and coaching tools plus registration scopes", async () => {
    const { service } = await registeredService();
    const listed = toolListSchema.parse((await handleMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      undefined,
      service,
    )).body);
    const byName = new Map(listed.result.tools.map((tool) => [tool.name, tool]));

    expect([...byName.keys()]).toEqual(expect.arrayContaining([
      "set_nutrition_profile",
      "get_nutrition_profile",
      "log_food",
      "list_food_log",
      "get_nutrition_summary",
      "calculate_calorie_targets",
      "get_coaching_context",
    ]));
    expect(byName.get("set_nutrition_profile")?.inputSchema).toMatchObject({
      additionalProperties: false,
      required: ["sex", "birthDate", "heightCm", "activityLevel", "goal"],
    });
    expect(byName.get("log_food")?.inputSchema).toMatchObject({
      additionalProperties: false,
      required: [
        "eatenAt", "mealType", "foodName", "servingSize", "servings", "caloriesKcal",
        "proteinG", "carbohydratesG", "fatG", "fiberG",
      ],
    });
    const registerScopes = (((byName.get("register_agent")?.inputSchema.properties as Record<string, unknown>).scopes as Record<string, unknown>).items as Record<string, unknown>).enum;
    expect(registerScopes).toEqual(expect.arrayContaining(["nutrition:read", "nutrition:write", "coaching:read"]));
  });
});

describe("nutrition MCP scope enforcement and structured responses", () => {
  it("enforces nutrition read/write independently", async () => {
    const { service, ownerId } = await registeredService();
    const reader = await service.createAgent(ownerId, {
      name: "Nutrition reader",
      scopes: ["nutrition:read"],
      capabilities: ["nutrition"],
    });
    const writer = await service.createAgent(ownerId, {
      name: "Nutrition writer",
      scopes: ["nutrition:write"],
      capabilities: ["nutrition"],
    });

    const profileInput = {
      sex: "female",
      birthDate: "1991-03-07",
      heightCm: 168,
      activityLevel: "lightly_active",
      goal: "maintain",
    };
    expect((await call(service, reader.secret, "set_nutrition_profile", profileInput)).body).toMatchObject({
      error: { message: "Agent lacks required scope: nutrition:write" },
    });
    expect((await call(service, writer.secret, "get_nutrition_profile")).body).toMatchObject({
      error: { message: "Agent lacks required scope: nutrition:read" },
    });

    const setResult = await call(service, writer.secret, "set_nutrition_profile", profileInput);
    expect(setResult.status).toBe(200);
    const readResult = toolResultSchema.parse((await call(service, reader.secret, "get_nutrition_profile")).body);
    expect(readResult.result.structuredContent).toMatchObject({ profile: { sex: "female", goal: "maintain" } });
    expect(readResult.result.content[0].text).toContain("Nutrition profile");
  });

  it("lets coaching:read ground only the aggregate operation", async () => {
    const { service, ownerId } = await registeredService();
    await service.setNutritionProfile(ownerId, {
      sex: "male",
      birthDate: "1996-08-20",
      heightCm: 180,
      activityLevel: "moderately_active",
      goal: "lose",
    });
    await service.recordBodyMetric(ownerId, { recordedAt: "2026-08-20T19:00:00.000Z", weightKg: 80 });
    await service.logFood(ownerId, {
      eatenAt: "2026-08-20T19:30:00.000Z",
      mealType: "lunch",
      foodName: "Tofu rice bowl",
      servingSize: "1 bowl",
      servings: 1,
      caloriesKcal: 640,
      proteinG: 31,
      carbohydratesG: 82,
      fatG: 19,
      fiberG: 11,
    });
    const coach = await service.createAgent(ownerId, {
      name: "Grounded coach",
      scopes: ["coaching:read"],
      capabilities: ["coaching"],
    });

    const standalone = await call(service, coach.secret, "list_food_log");
    expect(standalone.status).toBe(403);
    expect(standalone.body).toMatchObject({ error: { message: "Agent lacks required scope: nutrition:read" } });

    const aggregate = toolResultSchema.parse((await call(service, coach.secret, "get_coaching_context")).body);
    expect(aggregate.result.structuredContent).toMatchObject({
      nutritionProfile: { sex: "male", goal: "lose" },
      calorieTargets: {
        maintenanceCalories: 2759,
        goalTargetCalories: 2259,
        goalAdjustmentCalories: -500,
        goal: "lose",
        targetCalories: 2259,
        missingInputs: [],
      },
      todayNutrition: { totals: { caloriesKcal: 640, proteinG: 31 } },
      recentTrainingStats: { totalWorkouts: 0 },
      latestBodyMetrics: { weightKg: 80 },
      missingData: ["recentWorkouts"],
    });
    expect(aggregate.result.content[0].text).toContain("Neutral maintenance baseline: 2759 kcal/day.");
    expect(aggregate.result.content[0].text).toContain("Goal-adjusted target: 2259 kcal/day.");
    expect(aggregate.result.content[0].text).toContain("Lose goal: target is a 500 kcal/day deficit below maintenance.");
  });
});

describe("coaching context missing-data guidance", () => {
  it("returns explicit next actions when profile, weight, food, and training data are absent", async () => {
    const { service, ownerId } = await registeredService();
    const context = await service.getCoachingContext(ownerId);

    expect(context).toMatchObject({
      nutritionProfile: null,
      latestBodyMetrics: null,
      calorieTargets: {
        maintenanceCalories: null,
        goalTargetCalories: null,
        goalAdjustmentCalories: null,
        goal: null,
        targetCalories: null,
      },
      missingData: ["nutritionProfile", "bodyWeight", "todayFoodLog", "recentWorkouts"],
    });
    expect(context.actionGuidance).toEqual(expect.arrayContaining([
      expect.stringContaining("nutrition profile"),
      expect.stringContaining("body weight"),
      expect.stringContaining("food"),
      expect.stringContaining("workout"),
    ]));
    expect(context.calorieTargets.missingInputs).toEqual(expect.arrayContaining(["nutritionProfile", "weightKg"]));
    expect(context.safetyNote).toContain("not medical advice");
    expect(context.humanReadable).toContain("Neutral maintenance baseline and goal-adjusted target are unavailable");
  });
});
