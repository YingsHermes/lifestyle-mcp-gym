import { join } from "node:path";
import { JsonFileStorage } from "@/lib/storage/file";
import { MemoryStorage } from "@/lib/storage/memory";
import { SupabaseStorage } from "@/lib/storage/supabase";
import type { LifestyleStorage } from "@/lib/storage/types";

export type StorageMode = "file" | "memory" | "supabase";
interface StorageEnvironment {
  [name: string]: string | undefined;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  LIFESTYLE_STORAGE_DRIVER?: string;
  LIFESTYLE_DATA_FILE?: string;
  VERCEL?: string;
}

export interface StorageRuntime {
  storage: LifestyleStorage;
  mode: StorageMode;
  durable: boolean;
  notice: string;
}

const globalStorage = globalThis as typeof globalThis & { lifestyleStorageRuntime?: StorageRuntime };

export function createStorageRuntime(environment: StorageEnvironment): StorageRuntime {
  const supabaseUrl = environment.SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceRoleKey) {
    return {
      storage: new SupabaseStorage(supabaseUrl, serviceRoleKey),
      mode: "supabase",
      durable: true,
      notice: "Supabase persistent storage is enabled.",
    };
  }

  const configuredMode = environment.LIFESTYLE_STORAGE_DRIVER;
  if (configuredMode !== undefined && configuredMode !== "file" && configuredMode !== "memory") {
    throw new Error("LIFESTYLE_STORAGE_DRIVER must be either \"file\" or \"memory\"");
  }
  const onVercel = Boolean(environment.VERCEL);
  const mode: StorageMode = configuredMode === "memory" || (onVercel && configuredMode !== "file") ? "memory" : "file";

  if (mode === "file") {
    const filePath = environment.LIFESTYLE_DATA_FILE ?? join(process.cwd(), ".data", "lifestyle-gym.json");
    return {
      storage: new JsonFileStorage(filePath),
      mode,
      durable: !onVercel,
      notice: onVercel
        ? "File storage is process-local on Vercel and is not durable. Configure both Supabase environment variables."
        : "Local JSON file storage is enabled.",
    };
  }

  return {
    storage: new MemoryStorage(),
    mode,
    durable: false,
    notice: "Demo memory storage resets whenever the server process restarts.",
  };
}

export function getStorageRuntime(): StorageRuntime {
  if (!globalStorage.lifestyleStorageRuntime) {
    globalStorage.lifestyleStorageRuntime = createStorageRuntime(process.env);
  }
  return globalStorage.lifestyleStorageRuntime;
}
