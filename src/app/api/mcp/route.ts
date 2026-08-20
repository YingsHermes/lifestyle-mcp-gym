import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, bearerTokenFromRequest, resolveAppBaseUrl, SESSION_COOKIE } from "@/lib/api";
import { handleMcpRequest } from "@/lib/mcp";
import { getLifestyleService } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const authorizationToken = bearerTokenFromRequest(request);
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (!authorizationToken && sessionToken) {
    try {
      assertSameOrigin(request);
    } catch {
      return NextResponse.json(
        { jsonrpc: "2.0", id: null, error: { code: -32003, message: "Cross-origin mutation rejected" } },
        { status: 403, headers: { "Cache-Control": "no-store", "MCP-Protocol-Version": "2025-03-26" } },
      );
    }
  }
  const result = await handleMcpRequest(
    payload,
    authorizationToken ?? sessionToken,
    getLifestyleService(),
    { appBaseUrl: resolveAppBaseUrl(request) },
  );
  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store",
      "MCP-Protocol-Version": "2025-03-26",
    },
  });
}
