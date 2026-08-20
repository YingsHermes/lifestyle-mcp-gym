import { NextRequest, NextResponse } from "next/server";
import { apiResponse, setSessionCookie } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return apiResponse(async () => {
    const token = request.nextUrl.searchParams.get("token") ?? "";
    const authenticated = await getLifestyleService().consumeDashboardLink(token);
    const response = NextResponse.redirect(new URL("/", request.nextUrl.origin), 303);
    setSessionCookie(response, authenticated.sessionToken);
    return response;
  });
}
