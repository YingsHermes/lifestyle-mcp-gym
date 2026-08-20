import { LifestyleService } from "@/lib/service";
import { getStorageRuntime } from "@/lib/storage";

const globalService = globalThis as typeof globalThis & { lifestyleService?: LifestyleService };

export function getLifestyleService(): LifestyleService {
  if (!globalService.lifestyleService) {
    globalService.lifestyleService = new LifestyleService(getStorageRuntime().storage);
  }
  return globalService.lifestyleService;
}
