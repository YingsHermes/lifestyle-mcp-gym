import { NextRequest, NextResponse } from "next/server";
import { agentRegistrationSchema } from "@/lib/domain";
import { apiResponse, assertSameOrigin, readJson, requireHuman } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  return apiResponse(async () => {
    const user = await requireHuman(request);
    return NextResponse.json({ agents: await getLifestyleService().listAgents(user.id) });
  });
}

export async function POST(request: NextRequest) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const user = await requireHuman(request);
    const input = agentRegistrationSchema.parse(await readJson(request));
    const created = await getLifestyleService().createAgent(user.id, input);
    return NextResponse.json(created, { status: 201 });
  });
}
