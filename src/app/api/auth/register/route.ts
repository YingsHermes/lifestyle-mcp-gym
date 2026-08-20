import { NextRequest, NextResponse } from "next/server";
import { apiResponse, assertSameOrigin, readJson, setSessionCookie } from "@/lib/api";
import { humanRegistrationSchema } from "@/lib/domain";
import { getLifestyleService } from "@/lib/runtime";

export async function POST(request: NextRequest) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const input = humanRegistrationSchema.parse(await readJson(request));
    const registration = await getLifestyleService().registerHuman(input);
    const response = NextResponse.json({ user: registration.user }, { status: 201 });
    setSessionCookie(response, registration.sessionToken);
    return response;
  });
}
