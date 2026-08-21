import { NextRequest, NextResponse } from "next/server";
import { bodyMetricInputSchema, bodyMetricListQuerySchema } from "@/lib/domain";
import { apiResponse, assertSameOrigin, readJson, requireHuman } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  return apiResponse(async () => {
    const user = await requireHuman(request);
    const query = bodyMetricListQuerySchema.parse({ limit: request.nextUrl.searchParams.get("limit") || undefined });
    return NextResponse.json({ metrics: await getLifestyleService().listBodyMetrics(user.id, query.limit) });
  });
}

export async function POST(request: NextRequest) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const user = await requireHuman(request);
    const input = bodyMetricInputSchema.parse(await readJson(request));
    const metric = await getLifestyleService().recordBodyMetric(user.id, input);
    return NextResponse.json({ metric }, { status: 201 });
  });
}
