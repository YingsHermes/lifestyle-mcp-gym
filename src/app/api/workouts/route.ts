import { NextRequest, NextResponse } from "next/server";
import { workoutInputSchema, workoutListQuerySchema } from "@/lib/domain";
import { apiResponse, assertSameOrigin, readJson, requireHuman } from "@/lib/api";
import { getLifestyleService } from "@/lib/runtime";

export async function GET(request: NextRequest) {
  return apiResponse(async () => {
    const user = await requireHuman(request);
    const query = workoutListQuerySchema.parse({ limit: request.nextUrl.searchParams.get("limit") ?? undefined });
    return NextResponse.json({ workouts: await getLifestyleService().listWorkouts(user.id, query.limit) });
  });
}

export async function POST(request: NextRequest) {
  return apiResponse(async () => {
    assertSameOrigin(request);
    const user = await requireHuman(request);
    const input = workoutInputSchema.parse(await readJson(request));
    const workout = await getLifestyleService().logWorkout(user.id, input);
    return NextResponse.json({ workout }, { status: 201 });
  });
}
