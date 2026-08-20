import { NextRequest, NextResponse } from "next/server";
import { apiResponse, assertSameOrigin, readJson, setSessionCookie } from "@/lib/api";
import { loginSchema } from "@/lib/domain";
import { getLifestyleService } from "@/lib/runtime";

export async function POST(request: NextRequest) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const input = loginSchema.parse(await readJson(request));
    const authenticated = await getLifestyleService().login(input);
    const response = NextResponse.json({ user: authenticated.user });
    setSessionCookie(response, authenticated.sessionToken);
    return response;
  });
}
