import { NextResponse } from "next/server";
import { getStorageRuntime } from "@/lib/storage";

export async function GET() {
  const runtime = getStorageRuntime();
  return NextResponse.json({
    status: "ok",
    storage: { mode: runtime.mode, durable: runtime.durable, notice: runtime.notice },
  });
}
