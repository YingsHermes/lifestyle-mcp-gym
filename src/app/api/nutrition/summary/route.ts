import { NextRequest, NextResponse } from "next/server";
import { nutritionSummaryQuerySchema } from "@/lib/domain";
import { apiResponse, requireHuman } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  return apiResponse(async () => {
    const user = await requireHuman(request);
    const query = nutritionSummaryQuerySchema.parse({ date: request.nextUrl.searchParams.get("date") ?? undefined });
    return NextResponse.json({ summary: await getLifestyleService().getNutritionSummary(user.id, query.date) });
  });
}
