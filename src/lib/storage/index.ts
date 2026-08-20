import { join } from "node:path";
import { JsonFileStorage } from "@/lib/storage/file";
import { MemoryStorage } from "@/lib/storage/memory";
import type { LifestyleStorage } from "@/lib/storage/types";

export type StorageMode = "file" | "memory";

interface StorageRuntime {
  storage: LifestyleStorage;
  mode: StorageMode;
  durable: boolean;
  notice: string;
}

const globalStorage = globalThis as typeof globalThis & { lifestyleStorageRuntime?: StorageRuntime };

export function getStorageRuntime(): StorageRuntime {
  if (globalStorage.lifestyleStorageRuntime) {
    return globalStorage.lifestyleStorageRuntime;
  }

  const configuredMode = process.env.LIFESTYLE_STORAGE_DRIVER;
  if (configuredMode !== undefined && configuredMode !== "file" && configuredMode !== "memory") {
    throw new Error("LIFESTYLE_STORAGE_DRIVER must be either \"file\" or \"memory\"");
  }
  const onVercel = Boolean(process.env.VERCEL);
  const mode: StorageMode = configuredMode === "memory" || (onVercel && configuredMode !== "file") ? "memory" : "file";

  if (mode === "file") {
    const filePath = process.env.LIFESTYLE_DATA_FILE ?? join(process.cwd(), ".data", "lifestyle-gym.json");
    globalStorage.lifestyleStorageRuntime = {
      storage: new JsonFileStorage(filePath),
      mode,
      durable: !onVercel,
      notice: onVercel
        ? "File storage is process-local on Vercel and is not durable. Configure a durable adapter before production use."
        : "Local JSON file storage is enabled.",
    };
  } else {
    globalStorage.lifestyleStorageRuntime = {
      storage: new MemoryStorage(),
      mode,
      durable: false,
      notice: "Demo memory storage resets whenever the server process restarts.",
    };
  }

  return globalStorage.lifestyleStorageRuntime;
}
