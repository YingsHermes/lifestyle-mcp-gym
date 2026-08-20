import { z, ZodError } from "zod";
import {
  agentRegistrationSchema,
  bodyMetricInputSchema,
  dashboardLinkInputSchema,
  workoutInputSchema,
  type AgentScope,
} from "@/lib/domain";
import { AppError, type AuthenticatedPrincipal, type LifestyleService } from "@/lib/service";

const rpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

const toolCallSchema = z.object({
  name: z.string(),
  arguments: z.unknown().optional().default({}),
});

const listWorkoutsArgumentsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
});

const noArgumentsSchema = z.object({}).strict();

type RpcId = string | number | null;

export interface McpHttpResult {
  status: number;
  body: Record<string, unknown>;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const tools: ToolDefinition[] = [
  {
    name: "register_agent",
    description: "Register an agent owned by the authenticated human. The returned secret is shown once.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["name", "scopes", "capabilities"],
      properties: {
        name: { type: "string", minLength: 2, maxLength: 80 },
        scopes: { type: "array", minItems: 1, items: { enum: ["workouts:read", "workouts:write", "metrics:read", "metrics:write", "dashboard:link"] } },
        capabilities: { type: "array", minItems: 1, items: { type: "string" } },
        webhookUrl: { type: "string", format: "uri", pattern: "^https://" },
        ownerMetadata: { type: "object", additionalProperties: { type: "string" } },
      },
    },
  },
  {
    name: "log_workout",
    description: "Log a workout with exercises and sets for the agent owner.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "occurredAt", "exercises"],
      properties: {
        title: { type: "string" },
        occurredAt: { type: "string", format: "date-time" },
        durationMinutes: { type: "integer", minimum: 1 },
        notes: { type: "string" },
        exercises: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "sets"],
            properties: {
              name: { type: "string" },
              sets: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    reps: { type: "integer", minimum: 1 },
                    weightKg: { type: "number", minimum: 0 },
                    durationSeconds: { type: "integer", minimum: 1 },
                    notes: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  {
    name: "list_workouts",
    description: "List recent workouts for the agent owner.",
    inputSchema: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: 100 } } },
  },
  {
    name: "get_stats",
    description: "Get training volume, weekly activity, and body-weight progress statistics. Requires workouts:read and metrics:read.",
    inputSchema: { type: "object", additionalProperties: false },
  },
  {
    name: "record_body_metrics",
    description: "Record weight, body-fat percentage, waist circumference, or a combination.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["recordedAt"],
      properties: {
        recordedAt: { type: "string", format: "date-time" },
        weightKg: { type: "number", minimum: 20, maximum: 500 },
        bodyFatPercent: { type: "number", minimum: 1, maximum: 75 },
        waistCm: { type: "number", minimum: 20, maximum: 300 },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "create_dashboard_link",
    description: "Create a short-lived, single-use dashboard sign-in link for the agent owner.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        ttlMinutes: { type: "integer", minimum: 1, maximum: 30, default: 10 },
      },
    },
  },
];

function success(id: RpcId, result: unknown): McpHttpResult {
  return { status: 200, body: { jsonrpc: "2.0", id, result } };
}

function failure(id: RpcId, status: number, code: number, message: string, data?: unknown): McpHttpResult {
  const error: Record<string, unknown> = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { status, body: { jsonrpc: "2.0", id, error } };
}

function toolResult(value: unknown): Record<string, unknown> {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  };
}

function requireHuman(principal: AuthenticatedPrincipal): string {
  if (principal.kind !== "human") {
    throw new AppError(403, "forbidden", "Agent registration requires a human session bearer token");
  }
  return principal.user.id;
}

async function authenticatedPrincipal(bearerToken: string | undefined, service: LifestyleService): Promise<AuthenticatedPrincipal> {
  if (!bearerToken) {
    throw new AppError(401, "unauthorized", "Bearer authentication required");
  }
  return service.authenticateBearer(bearerToken);
}

function scopesForTool(toolName: string): AgentScope[] | null {
  const scopes: Record<string, AgentScope[]> = {
    log_workout: ["workouts:write"],
    list_workouts: ["workouts:read"],
    get_stats: ["workouts:read", "metrics:read"],
    record_body_metrics: ["metrics:write"],
    create_dashboard_link: ["dashboard:link"],
  };
  return scopes[toolName] ?? null;
}

async function callTool(
  toolName: string,
  rawArguments: unknown,
  bearerToken: string | undefined,
  service: LifestyleService,
  options: McpRequestOptions,
): Promise<unknown> {
  const principal = await authenticatedPrincipal(bearerToken, service);

  if (toolName === "register_agent") {
    const ownerId = requireHuman(principal);
    const input = agentRegistrationSchema.parse(rawArguments);
    const created = await service.createAgent(ownerId, input);
    return { agentId: created.agent.id, secret: created.secret, scopes: created.agent.scopes, createdAt: created.agent.createdAt };
  }

  const requiredScopes = scopesForTool(toolName);
  if (!requiredScopes) {
    throw new AppError(400, "unknown_tool", `Unknown tool: ${toolName}`);
  }
  let ownerId = "";
  for (const scope of requiredScopes) {
    ownerId = service.requireAgentScope(principal, scope);
  }
  const agentId = principal.kind === "agent" ? principal.agent.id : undefined;
  if (toolName === "create_dashboard_link") {
    if (!options.appBaseUrl) {
      throw new AppError(500, "app_url_unavailable", "Dashboard links are not configured");
    }
    return service.createDashboardLink(principal, dashboardLinkInputSchema.parse(rawArguments), options.appBaseUrl);
  }


  if (toolName === "log_workout") {
    return service.logWorkout(ownerId, workoutInputSchema.parse(rawArguments), agentId);
  }
  if (toolName === "list_workouts") {
    const input = listWorkoutsArgumentsSchema.parse(rawArguments);
    return { workouts: await service.listWorkouts(ownerId, input.limit) };
  }
  if (toolName === "get_stats") {
    noArgumentsSchema.parse(rawArguments);
    return service.getStats(ownerId);
  }
  return service.recordBodyMetric(ownerId, bodyMetricInputSchema.parse(rawArguments), agentId);
}

export interface McpRequestOptions {
  appBaseUrl?: string;
}

export async function handleMcpRequest(
  rawRequest: unknown,
  bearerToken: string | undefined,
  service: LifestyleService,
  options: McpRequestOptions = {},
): Promise<McpHttpResult> {
  const parsedRequest = rpcRequestSchema.safeParse(rawRequest);
  if (!parsedRequest.success) {
    return failure(null, 400, -32600, "Invalid Request", parsedRequest.error.flatten());
  }

  const request = parsedRequest.data;
  const id = request.id ?? null;
  try {
    if (request.method === "initialize") {
      return success(id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "lifestyle-mcp-gym", version: "0.1.0" },
      });
    }
    if (request.method === "notifications/initialized") {
      return { status: 202, body: {} };
    }
    if (request.method === "tools/list") {
      return success(id, { tools });
    }
    if (request.method === "tools/call") {
      const call = toolCallSchema.parse(request.params);
      const value = await callTool(call.name, call.arguments, bearerToken, service, options);
      return success(id, toolResult(value));
    }
    return failure(id, 404, -32601, "Method not found");
  } catch (error) {
    if (error instanceof ZodError) {
      return failure(id, 400, -32602, "Invalid params", error.flatten());
    }
    if (error instanceof AppError) {
      const rpcCode = error.status === 401 ? -32001 : error.status === 403 ? -32003 : -32602;
      return failure(id, error.status, rpcCode, error.message, error.details);
    }
    return failure(id, 500, -32603, "Internal error");
  }
}
