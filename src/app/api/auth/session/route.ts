import { NextRequest, NextResponse } from "next/server";
import { apiResponse, assertSameOrigin, clearSessionCookie, requireHuman, SESSION_COOKIE } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  return apiResponse(async () => NextResponse.json({ user: await requireHuman(request) }));
}

export async function DELETE(request: NextRequest) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      await getLifestyleService().logout(token);
    }
    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    return response;
  });
}
