import { NextRequest, NextResponse } from "next/server";
import { apiResponse, requireHuman } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  return apiResponse(async () => {
    const user = await requireHuman(request);
    return NextResponse.json({ stats: await getLifestyleService().getStats(user.id) });
  });
}
