import { NextRequest, NextResponse } from "next/server";
import { foodLogInputSchema, foodLogListQuerySchema } from "@/lib/domain";
import { apiResponse, assertSameOrigin, readJson, requireHuman } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  return apiResponse(async () => {
    const user = await requireHuman(request);
    const query = foodLogListQuerySchema.parse({ limit: request.nextUrl.searchParams.get("limit") ?? undefined });
    return NextResponse.json({
      entries: await getLifestyleService().listFoodLog(user.id, query),
      dataSource: "user_entered",
    });
  });
}

export async function POST(request: NextRequest) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const user = await requireHuman(request);
    const input = foodLogInputSchema.parse(await readJson(request));
    return NextResponse.json({
      entry: await getLifestyleService().logFood(user.id, input),
      dataSource: "user_entered",
    }, { status: 201 });
  });
}
