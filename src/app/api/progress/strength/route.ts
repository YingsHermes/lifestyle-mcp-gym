import { NextRequest, NextResponse } from "next/server";
import { progressRangeQuerySchema } from "@/lib/domain";
import { apiResponse, requireHuman } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  return apiResponse(async () => {
    const user = await requireHuman(request);
    const range = progressRangeQuerySchema.parse({
      from: request.nextUrl.searchParams.get("from") || undefined,
      to: request.nextUrl.searchParams.get("to") || undefined,
    });
    return NextResponse.json({ summary: await getLifestyleService().getStrengthProgress(user.id, range) });
  });
}
