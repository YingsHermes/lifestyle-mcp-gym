import type { Agent, AgentDashboardLink, BodyMetric, NutritionEntry, NutritionProfile, Session, User, Workout } from "@/lib/domain";
import { emptyStorageDocument, StorageConflictError, type LifestyleStorage, type NutritionEntryUpdate, type StorageDocument } from "@/lib/storage/types";

export class MemoryStorage implements LifestyleStorage {
  protected document: StorageDocument;

  constructor(seed?: StorageDocument) {
    this.document = structuredClone(seed ?? emptyStorageDocument());
  }

  async createUser(user: User): Promise<User> {
    if (this.document.users.some((candidate) => candidate.email === user.email)) {
      throw new StorageConflictError("User email already exists");
    }
    this.document.users.push(structuredClone(user));
    return structuredClone(user);
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const user = this.document.users.find((candidate) => candidate.email === email);
    return user ? structuredClone(user) : null;
  }

  async getUser(id: string): Promise<User | null> {
    const user = this.document.users.find((candidate) => candidate.id === id);
    return user ? structuredClone(user) : null;
  }

  async createSession(session: Session): Promise<Session> {
    this.document.sessions.push(structuredClone(session));
    return structuredClone(session);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    const session = this.document.sessions.find((candidate) => candidate.tokenHash === tokenHash);
    return session ? structuredClone(session) : null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.document.sessions = this.document.sessions.filter((session) => session.tokenHash !== tokenHash);
  }

  async createAgent(agent: Agent): Promise<Agent> {
    this.document.agents.push(structuredClone(agent));
    return structuredClone(agent);
  }

  async getAgent(id: string): Promise<Agent | null> {
    const agent = this.document.agents.find((candidate) => candidate.id === id);
    return agent ? structuredClone(agent) : null;
  }

  async listAgents(ownerId: string): Promise<Agent[]> {
    return this.document.agents
      .filter((agent) => agent.ownerId === ownerId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((agent) => structuredClone(agent));
  }

  async touchAgent(id: string, lastUsedAt: string): Promise<void> {
    const agent = this.document.agents.find((candidate) => candidate.id === id);
    if (agent) {
      agent.lastUsedAt = lastUsedAt;
    }
  }
  async createAgentDashboardLink(link: AgentDashboardLink): Promise<AgentDashboardLink> {
    if (this.document.agentDashboardLinks.some((candidate) => candidate.tokenHash === link.tokenHash)) {
      throw new StorageConflictError("Dashboard access link token hash already exists");
    }
    this.document.agentDashboardLinks.push(structuredClone(link));
    return structuredClone(link);
  }

  async consumeAgentDashboardLink(tokenHash: string, usedAt: string): Promise<AgentDashboardLink | null> {
    const link = this.document.agentDashboardLinks.find((candidate) => candidate.tokenHash === tokenHash);
    if (!link || link.usedAt || new Date(link.expiresAt).getTime() <= new Date(usedAt).getTime()) {
      return null;
    }
    link.usedAt = usedAt;
    return structuredClone(link);
  }


  async createWorkout(workout: Workout): Promise<Workout> {
    this.document.workouts.push(structuredClone(workout));
    return structuredClone(workout);
  }

  async listWorkouts(ownerId: string, limit: number): Promise<Workout[]> {
    return this.document.workouts
      .filter((workout) => workout.ownerId === ownerId)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, limit)
      .map((workout) => structuredClone(workout));
  }

  async createBodyMetric(metric: BodyMetric): Promise<BodyMetric> {
    this.document.bodyMetrics.push(structuredClone(metric));
    return structuredClone(metric);
  }

  async listBodyMetrics(ownerId: string, limit: number): Promise<BodyMetric[]> {
    return this.document.bodyMetrics
      .filter((metric) => metric.ownerId === ownerId)
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
      .slice(0, limit)
      .map((metric) => structuredClone(metric));
  }

  async upsertNutritionProfile(profile: NutritionProfile): Promise<NutritionProfile> {
    const existingIndex = this.document.nutritionProfiles.findIndex((candidate) => candidate.ownerId === profile.ownerId);
    if (existingIndex >= 0) {
      this.document.nutritionProfiles[existingIndex] = structuredClone(profile);
    } else {
      this.document.nutritionProfiles.push(structuredClone(profile));
    }
    return structuredClone(profile);
  }

  async getNutritionProfile(ownerId: string): Promise<NutritionProfile | null> {
    const profile = this.document.nutritionProfiles.find((candidate) => candidate.ownerId === ownerId);
    return profile ? structuredClone(profile) : null;
  }

  async createNutritionEntry(entry: NutritionEntry): Promise<NutritionEntry> {
    this.document.nutritionEntries.push(structuredClone(entry));
    return structuredClone(entry);
  }

  async listNutritionEntries(ownerId: string, limit: number): Promise<NutritionEntry[]> {
    return this.document.nutritionEntries
      .filter((entry) => entry.ownerId === ownerId)
      .sort((left, right) => right.eatenAt.localeCompare(left.eatenAt))
      .slice(0, limit)
      .map((entry) => structuredClone(entry));
  }

  async updateNutritionEntry(ownerId: string, entryId: string, patch: NutritionEntryUpdate): Promise<NutritionEntry | null> {
    const index = this.document.nutritionEntries.findIndex((entry) => entry.id === entryId && entry.ownerId === ownerId);
    if (index < 0) return null;
    const updated = { ...this.document.nutritionEntries[index], ...structuredClone(patch) };
    this.document.nutritionEntries[index] = updated;
    return structuredClone(updated);
  }

  async deleteNutritionEntry(ownerId: string, entryId: string): Promise<NutritionEntry | null> {
    const index = this.document.nutritionEntries.findIndex((entry) => entry.id === entryId && entry.ownerId === ownerId);
    if (index < 0) return null;
    const [deleted] = this.document.nutritionEntries.splice(index, 1);
    return structuredClone(deleted);
  }
}
