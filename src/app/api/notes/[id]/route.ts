import { NextRequest, NextResponse } from "next/server";
import { notePatchSchema } from "@/lib/domain";
import { apiResponse, assertSameOrigin, readJson, requireDataOwner } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

type NoteRouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: NoteRouteContext) {
  return apiResponse(async () => {
    const { ownerId } = await requireDataOwner(request, "notes:read");
    const { id } = await context.params;
    return NextResponse.json({ note: await getLifestyleService().getNote(ownerId, id) });
  });
}

export async function PATCH(request: NextRequest, context: NoteRouteContext) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const { ownerId } = await requireDataOwner(request, "notes:write");
    const { id } = await context.params;
    const note = await getLifestyleService().updateNote(ownerId, id, notePatchSchema.parse(await readJson(request)));
    return NextResponse.json({ note });
  });
}

export async function DELETE(request: NextRequest, context: NoteRouteContext) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const { ownerId } = await requireDataOwner(request, "notes:write");
    const { id } = await context.params;
    await getLifestyleService().deleteNote(ownerId, id);
    return NextResponse.json({ deleted: true, noteId: id });
  });
}
