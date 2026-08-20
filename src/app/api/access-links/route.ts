import { NextRequest, NextResponse } from "next/server";
import { apiResponse, bearerTokenFromRequest, readJson, resolveAppBaseUrl } from "@/lib/api";
import { dashboardLinkInputSchema } from "@/lib/domain";
import { AppError } from "@/lib/service";
import { getLifestyleService } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return apiResponse(async () => {
    const bearerToken = bearerTokenFromRequest(request);
    if (!bearerToken) {
      throw new AppError(401, "unauthorized", "Agent bearer authentication required");
    }
    const service = getLifestyleService();
    const authenticated = await service.authenticateAgent(bearerToken);
    const input = dashboardLinkInputSchema.parse(await readJson(request));
    const link = await service.createDashboardLink(
      { kind: "agent", ...authenticated },
      input,
      resolveAppBaseUrl(request),
    );
    return NextResponse.json(link, { status: 201 });
  });
}
