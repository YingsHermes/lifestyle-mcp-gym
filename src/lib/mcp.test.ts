import { describe, expect, it } from "vitest";
import { LifestyleService } from "@/lib/service";
import { handleMcpRequest } from "@/lib/mcp";
import { MemoryStorage } from "@/lib/storage/memory";

async function registeredService() {
  const storage = new MemoryStorage();
  const service = new LifestyleService(storage, {
    now: () => new Date("2026-08-20T12:00:00.000Z"),
  });
  const registration = await service.registerHuman({
    name: "Maya Chen",
    email: "maya@example.com",
    password: "correct horse battery staple",
    timezone: "America/Los_Angeles",
    goals: ["Build strength"],
    experience: "intermediate",
    consent: true,
  });
  return { storage, service, registration };
}

describe("MCP JSON-RPC surface", () => {
  it("negotiates initialization and advertises standards-shaped tools", async () => {
    const { service } = await registeredService();
    const initialized = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } },
      },
      undefined,
      service,
    );
    expect(initialized.status).toBe(200);
    expect(initialized.body).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "lifestyle-mcp-gym" },
        capabilities: { tools: {} },
      },
    });

    const listed = await handleMcpRequest(
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      undefined,
      service,
    );
    const toolNames = (listed.body as { result: { tools: Array<{ name: string }> } }).result.tools.map((tool) => tool.name);
    expect(toolNames).toEqual([
      "register_agent",
      "log_workout",
      "list_workouts",
      "get_stats",
      "record_body_metrics",
    ]);
  });

  it("returns a useful JSON-RPC authentication error for agent tools", async () => {
    const { service } = await registeredService();
    const result = await handleMcpRequest(
      { jsonrpc: "2.0", id: "missing-auth", method: "tools/call", params: { name: "get_stats", arguments: {} } },
      undefined,
      service,
    );

    expect(result.status).toBe(401);
    expect(result.body).toEqual({
      jsonrpc: "2.0",
      id: "missing-auth",
      error: { code: -32001, message: "Bearer authentication required" },
    });
  });

  it("registers an agent once, authenticates it, and enforces scopes", async () => {
    const { service, registration } = await registeredService();
    const created = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "register_agent",
          arguments: {
            name: "Gym logger",
            scopes: ["workouts:write", "workouts:read"],
            capabilities: ["logging"],
            ownerMetadata: { team: "personal" },
          },
        },
      },
      registration.sessionToken,
      service,
    );
    expect(created.status).toBe(200);
    const structured = (created.body as { result: { structuredContent: { agentId: string; secret: string } } }).result.structuredContent;
    expect(structured.secret).toMatch(new RegExp(`^${structured.agentId}\\.`));

    const logged = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "log_workout",
          arguments: {
            title: "Lower strength",
            occurredAt: "2026-08-20T09:00:00.000Z",
            exercises: [{ name: "Back squat", sets: [{ reps: 5, weightKg: 100 }] }],
          },
        },
      },
      structured.secret,
      service,
    );
    expect(logged.status).toBe(200);

    const forbidden = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "record_body_metrics",
          arguments: { recordedAt: "2026-08-20T09:00:00.000Z", weightKg: 80.5 },
        },
      },
      structured.secret,
      service,
    );
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toMatchObject({ error: { code: -32003, message: "Agent lacks required scope: metrics:write" } });

    const metricsOnly = await service.createAgent(registration.user.id, {
      name: "Metrics reader",
      scopes: ["metrics:read"],
      capabilities: ["reporting"],
    });
    const stats = await handleMcpRequest(
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "get_stats", arguments: {} } },
      metricsOnly.secret,
      service,
    );
    expect(stats.status).toBe(403);
    expect(stats.body).toMatchObject({ error: { message: "Agent lacks required scope: workouts:read" } });
  });

  it("returns invalid-params and method-not-found errors without throwing", async () => {
    const { service } = await registeredService();
    const invalid = await handleMcpRequest(
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "log_workout", arguments: {} } },
      "not-a-valid-token",
      service,
    );
    expect(invalid.status).toBe(401);

    const unknown = await handleMcpRequest(
      { jsonrpc: "2.0", id: 7, method: "unknown/method" },
      undefined,
      service,
    );
    expect(unknown.body).toMatchObject({ error: { code: -32601, message: "Method not found" } });
  });
});
