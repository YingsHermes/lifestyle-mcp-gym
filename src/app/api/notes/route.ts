import { NextRequest, NextResponse } from "next/server";
import { noteInputSchema, noteSearchQuerySchema } from "@/lib/domain";
import { apiResponse, assertSameOrigin, readJson, requireDataOwner } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  return apiResponse(async () => {
    const { ownerId } = await requireDataOwner(request, "notes:read");
    const query = noteSearchQuerySchema.parse({
      query: request.nextUrl.searchParams.get("query") ?? undefined,
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
    });
    return NextResponse.json({ notes: await getLifestyleService().searchNotes(ownerId, query) });
  });
}

export async function POST(request: NextRequest) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const { ownerId, agentId } = await requireDataOwner(request, "notes:write");
    const note = await getLifestyleService().createNote(ownerId, noteInputSchema.parse(await readJson(request)), agentId);
    return NextResponse.json({ note }, { status: 201 });
  });
}
