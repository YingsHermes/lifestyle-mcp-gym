import { ZodError } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { AppError, type AuthenticatedPrincipal, type PublicUser } from "@/lib/service";
import { getLifestyleService } from "@/lib/runtime";
import type { AgentScope } from "@/lib/domain";

export const SESSION_COOKIE = "lifestyle_session";
function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError(400, "invalid_json", "Request body must be valid JSON");
  }
}

export function assertSameOrigin(request: NextRequest): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError(403, "invalid_origin", "Cross-origin mutation rejected");
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    return;
  }
  const host = request.headers.get("host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",", 1)[0]?.trim();
  const protocol = forwardedProtocol ? `${forwardedProtocol}:` : request.nextUrl.protocol;
  try {
    const source = new URL(origin);
    if (!host || source.host !== host || source.protocol !== protocol) {
      throw new AppError(403, "invalid_origin", "Cross-origin mutation rejected");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(403, "invalid_origin", "Cross-origin mutation rejected");
  }
}

export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function requireHuman(request: NextRequest): Promise<PublicUser> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    throw new AppError(401, "unauthorized", "Sign in to continue");
  }
  return getLifestyleService().authenticateSession(token);
}

export function bearerTokenFromRequest(request: NextRequest): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }
  const token = authorization.slice(7).trim();
  return token || undefined;
}

export async function requireDataOwner(
  request: NextRequest,
  agentScope: AgentScope,
): Promise<{ ownerId: string; agentId?: string }> {
  const service = getLifestyleService();
  const bearerToken = bearerTokenFromRequest(request);
  const principal: AuthenticatedPrincipal = bearerToken
    ? await service.authenticateBearer(bearerToken)
    : { kind: "human", user: await requireHuman(request) };
  if (principal.kind === "human") return { ownerId: principal.user.id };
  return {
    ownerId: service.requireAgentScope(principal, agentScope),
    agentId: principal.agent.id,
  };
}
export function resolveAppBaseUrl(
  request: NextRequest,
  environment: { NEXT_PUBLIC_APP_URL?: string; VERCEL_URL?: string } = process.env as { NEXT_PUBLIC_APP_URL?: string; VERCEL_URL?: string },
): string {
  const configuredUrl = environment.NEXT_PUBLIC_APP_URL?.trim();
  const vercelHost = environment.VERCEL_URL?.trim();
  const candidate = configuredUrl || (vercelHost ? `https://${vercelHost}` : request.nextUrl.origin);
  try {
    const url = new URL(candidate);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || !url.host) {
      throw new Error("Unsupported app URL");
    }
    return url.origin;
  } catch {
    throw new AppError(500, "invalid_app_url", "Dashboard links are not configured");
  }
}


export async function apiResponse(operation: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return noStore(await operation());
  } catch (error) {
    if (error instanceof ZodError) {
      return noStore(NextResponse.json(
        { error: { code: "validation_error", message: "Check the submitted fields", fields: error.flatten().fieldErrors } },
        { status: 400 },
      ));
    }
    if (error instanceof AppError) {
      return noStore(NextResponse.json(
        { error: { code: error.code, message: error.message, details: error.details } },
        { status: error.status },
      ));
    }
    return noStore(NextResponse.json(
      { error: { code: "internal_error", message: "The request could not be completed" } },
      { status: 500 },
    ));
  }
}
