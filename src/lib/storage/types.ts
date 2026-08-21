import type { Agent, AgentDashboardLink, BodyMetric, FoodLogPatchInput, NutritionEntry, NutritionProfile, Session, User, Workout } from "@/lib/domain";
export class StorageConflictError extends Error {}

export type NutritionEntryUpdate = FoodLogPatchInput & { updatedAt: string };


export interface LifestyleStorage {
  createUser(user: User): Promise<User>;
  findUserByEmail(email: string): Promise<User | null>;
  getUser(id: string): Promise<User | null>;
  createSession(session: Session): Promise<Session>;
  findSessionByTokenHash(tokenHash: string): Promise<Session | null>;
  deleteSession(tokenHash: string): Promise<void>;
  createAgent(agent: Agent): Promise<Agent>;
  getAgent(id: string): Promise<Agent | null>;
  listAgents(ownerId: string): Promise<Agent[]>;
  touchAgent(id: string, lastUsedAt: string): Promise<void>;
  createAgentDashboardLink(link: AgentDashboardLink): Promise<AgentDashboardLink>;
  consumeAgentDashboardLink(tokenHash: string, usedAt: string): Promise<AgentDashboardLink | null>;
  createWorkout(workout: Workout): Promise<Workout>;
  listWorkouts(ownerId: string, limit: number): Promise<Workout[]>;
  createBodyMetric(metric: BodyMetric): Promise<BodyMetric>;
  listBodyMetrics(ownerId: string, limit: number): Promise<BodyMetric[]>;
  upsertNutritionProfile(profile: NutritionProfile): Promise<NutritionProfile>;
  getNutritionProfile(ownerId: string): Promise<NutritionProfile | null>;
  createNutritionEntry(entry: NutritionEntry): Promise<NutritionEntry>;
  listNutritionEntries(ownerId: string, limit: number): Promise<NutritionEntry[]>;
  updateNutritionEntry(ownerId: string, entryId: string, patch: NutritionEntryUpdate): Promise<NutritionEntry | null>;
  deleteNutritionEntry(ownerId: string, entryId: string): Promise<NutritionEntry | null>;
}

export interface StorageDocument {
  version: 1;
  users: User[];
  sessions: Session[];
  agents: Agent[];
  agentDashboardLinks: AgentDashboardLink[];
  workouts: Workout[];
  bodyMetrics: BodyMetric[];
  nutritionProfiles: NutritionProfile[];
  nutritionEntries: NutritionEntry[];
}

export function emptyStorageDocument(): StorageDocument {
  return {
    version: 1,
    users: [],
    sessions: [],
    agents: [],
    agentDashboardLinks: [],
    workouts: [],
    bodyMetrics: [],
    nutritionProfiles: [],
    nutritionEntries: [],
  };
}
