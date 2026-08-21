import { NextRequest, NextResponse } from "next/server";
import { foodLogPatchSchema } from "@/lib/domain";
import { apiResponse, assertSameOrigin, readJson, requireDataOwner } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

type NutritionEntryRouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: NutritionEntryRouteContext) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const { ownerId } = await requireDataOwner(request, "nutrition:write");
    const { id } = await context.params;
    const entry = await getLifestyleService().editFood(ownerId, id, foodLogPatchSchema.parse(await readJson(request)));
    return NextResponse.json({ entry, dataSource: "user_entered" });
  });
}

export async function DELETE(request: NextRequest, context: NutritionEntryRouteContext) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const { ownerId } = await requireDataOwner(request, "nutrition:write");
    const { id } = await context.params;
    const entry = await getLifestyleService().deleteFood(ownerId, id);
    return NextResponse.json({ deleted: true, entryId: entry.id });
  });
}
