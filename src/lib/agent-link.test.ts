import { NextRequest } from "next/server";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { handleMcpRequest } from "@/lib/mcp";
import { resolveAppBaseUrl } from "@/lib/api";
import { AppError, LifestyleService } from "@/lib/service";
import { MemoryStorage } from "@/lib/storage/memory";
const toolListResponseSchema = z.object({
  result: z.object({
    tools: z.array(z.object({
      name: z.string(),
      inputSchema: z.record(z.unknown()),
    })),
  }),
});

const dashboardLinkResponseSchema = z.object({
  result: z.object({
    content: z.array(z.object({ type: z.string(), text: z.string() })).min(1),
    structuredContent: z.object({ url: z.string().url(), expiresAt: z.string().datetime() }),
  }),
});


async function fixture(scopes: Array<"dashboard:link" | "workouts:read"> = ["dashboard:link"]) {
  let currentTime = new Date("2026-08-20T12:00:00.000Z");
  const storage = new MemoryStorage();
  const service = new LifestyleService(storage, { now: () => currentTime });
  const registration = await service.registerHuman({
    name: "Maya Chen",
    email: "maya@example.com",
    password: "correct horse battery staple",
    timezone: "America/Los_Angeles",
    goals: ["Build strength"],
    experience: "intermediate",
    consent: true,
  });
  const created = await service.createAgent(registration.user.id, {
    name: "Dashboard coach",
    scopes,
    capabilities: ["dashboard handoff"],
  });
  const principal = await service.authenticateBearer(created.secret);
  return {
    storage,
    service,
    registration,
    created,
    principal,
    setTime: (value: string) => { currentTime = new Date(value); },
  };
}

describe("agent dashboard links", () => {
  it("issues a hashed owner-bound link with the default ten-minute TTL", async () => {
    const { service, principal, registration } = await fixture();

    const issued = await service.createDashboardLink(principal, {}, "https://gym.example.com");

    expect(issued.url).toMatch(/^https:\/\/gym\.example\.com\/auth\/agent-link\?token=[A-Za-z0-9_-]+$/);
    expect(issued.expiresAt).toBe("2026-08-20T12:10:00.000Z");
    const token = new URL(issued.url).searchParams.get("token");
    expect(token).toBeTruthy();

    const consumed = await service.consumeDashboardLink(token!);
    expect(consumed.user.id).toBe(registration.user.id);
    await expect(service.authenticateSession(consumed.sessionToken)).resolves.toMatchObject({ id: registration.user.id });
  });

  it("rejects expired and reused links without changing the public error", async () => {
    const expired = await fixture();
    const expiringLink = await expired.service.createDashboardLink(expired.principal, { ttlMinutes: 1 }, "https://gym.example.com");
    expired.setTime("2026-08-20T12:01:00.000Z");

    await expect(expired.service.consumeDashboardLink(new URL(expiringLink.url).searchParams.get("token")!)).rejects.toMatchObject({
      status: 401,
      code: "invalid_agent_link",
    });

    const reusable = await fixture();
    const singleUseLink = await reusable.service.createDashboardLink(reusable.principal, {}, "https://gym.example.com");
    const token = new URL(singleUseLink.url).searchParams.get("token")!;
    await reusable.service.consumeDashboardLink(token);
    await expect(reusable.service.consumeDashboardLink(token)).rejects.toMatchObject({
      status: 401,
      code: "invalid_agent_link",
    });
  });

  it("atomically permits only one concurrent consumption", async () => {
    const { service, principal } = await fixture();
    const issued = await service.createDashboardLink(principal, {}, "https://gym.example.com");
    const token = new URL(issued.url).searchParams.get("token")!;

    const results = await Promise.allSettled([
      service.consumeDashboardLink(token),
      service.consumeDashboardLink(token),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("binds the human session to the issuing agent owner", async () => {
    const { service, principal, registration } = await fixture();
    await service.registerHuman({
      name: "Riley Stone",
      email: "riley@example.com",
      password: "another correct horse battery staple",
      timezone: "Europe/London",
      goals: ["Move daily"],
      experience: "beginner",
      consent: true,
    });
    const issued = await service.createDashboardLink(principal, {}, "https://gym.example.com");

    const consumed = await service.consumeDashboardLink(new URL(issued.url).searchParams.get("token")!);

    expect(consumed.user.id).toBe(registration.user.id);
    expect(consumed.user.email).toBe("maya@example.com");
  });

  it("requires an authenticated agent with dashboard link scope", async () => {
    const withoutScope = await fixture(["workouts:read"]);
    await expect(
      withoutScope.service.createDashboardLink(withoutScope.principal, {}, "https://gym.example.com"),
    ).rejects.toMatchObject({ status: 403, code: "insufficient_scope" });
    await expect(
      withoutScope.service.createDashboardLink({ kind: "human", user: withoutScope.registration.user }, {}, "https://gym.example.com"),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("enforces the one-to-thirty-minute TTL boundary", async () => {
    const { service, principal } = await fixture();

    await expect(service.createDashboardLink(principal, { ttlMinutes: 0 }, "https://gym.example.com")).rejects.toThrow();
    await expect(service.createDashboardLink(principal, { ttlMinutes: 31 }, "https://gym.example.com")).rejects.toThrow();
    await expect(service.createDashboardLink(principal, { ttlMinutes: 30 }, "https://gym.example.com")).resolves.toMatchObject({
      expiresAt: "2026-08-20T12:30:00.000Z",
    });
  });
  it("resolves configured, Vercel, and request-origin app URLs", () => {
    const request = new NextRequest("http://development.example.test/api/mcp");

    expect(resolveAppBaseUrl(request, { NEXT_PUBLIC_APP_URL: "https://gym.example.com/app" }))
      .toBe("https://gym.example.com");
    expect(resolveAppBaseUrl(request, { VERCEL_URL: "lifestyle-gym.vercel.app" }))
      .toBe("https://lifestyle-gym.vercel.app");
    expect(resolveAppBaseUrl(request, {})).toBe("http://development.example.test");
  });

  it("advertises the bounded create_dashboard_link MCP schema", async () => {
    const { service, created } = await fixture();
    const response = await handleMcpRequest(
      { jsonrpc: "2.0", id: "tools", method: "tools/list", params: {} },
      created.secret,
      service,
      { appBaseUrl: "https://gym.example.com" },
    );

    const parsed = toolListResponseSchema.parse(response.body);
    const listed = parsed.result.tools.find((tool) => tool.name === "create_dashboard_link");
    expect(listed).toMatchObject({
      name: "create_dashboard_link",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { ttlMinutes: { type: "integer", minimum: 1, maximum: 30, default: 10 } },
      },
    });
  });


  it("returns the MCP text and structured response contract", async () => {
    const { service, created } = await fixture();
    const response = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: "dashboard-link",
        method: "tools/call",
        params: { name: "create_dashboard_link", arguments: { ttlMinutes: 5 } },
      },
      created.secret,
      service,
      { appBaseUrl: "https://gym.example.com" },
    );

    expect(response.status).toBe(200);
    const result = dashboardLinkResponseSchema.parse(response.body).result;
    expect(result.structuredContent).toEqual({
      url: expect.stringMatching(/^https:\/\/gym\.example\.com\/auth\/agent-link\?token=/),
      expiresAt: "2026-08-20T12:05:00.000Z",
    });
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
  });
});
