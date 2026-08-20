import { NextRequest, NextResponse } from "next/server";
import { nutritionProfileInputSchema } from "@/lib/domain";
import { apiResponse, assertSameOrigin, readJson, requireHuman } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  return apiResponse(async () => {
    const user = await requireHuman(request);
    return NextResponse.json({ profile: await getLifestyleService().getNutritionProfile(user.id) });
  });
}

export async function PUT(request: NextRequest) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const user = await requireHuman(request);
    const input = nutritionProfileInputSchema.parse(await readJson(request));
    return NextResponse.json({ profile: await getLifestyleService().setNutritionProfile(user.id, input) });
  });
}
