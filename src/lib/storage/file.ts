import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Agent, BodyMetric, Session, User, Workout } from "@/lib/domain";
import { MemoryStorage } from "@/lib/storage/memory";
import { storageDocumentSchema } from "@/lib/storage/schema";

export class JsonFileStorage extends MemoryStorage {
  private readonly filePath: string;
  private readonly ready: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      this.document = storageDocumentSchema.parse(JSON.parse(raw));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return;
      }
      throw error;
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(this.document, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.filePath);
  }

  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    await this.ready;
    const task = this.writeQueue.then(async () => {
      const result = await operation();
      await this.persist();
      return result;
    });
    this.writeQueue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  private async waitForReads(): Promise<void> {
    await this.ready;
    await this.writeQueue;
  }

  override async createUser(user: User): Promise<User> {
    return this.mutate(() => super.createUser(user));
  }

  override async findUserByEmail(email: string): Promise<User | null> {
    await this.waitForReads();
    return super.findUserByEmail(email);
  }

  override async getUser(id: string): Promise<User | null> {
    await this.waitForReads();
    return super.getUser(id);
  }

  override async createSession(session: Session): Promise<Session> {
    return this.mutate(() => super.createSession(session));
  }

  override async findSessionByTokenHash(tokenHash: string): Promise<Session | null> {
    await this.waitForReads();
    return super.findSessionByTokenHash(tokenHash);
  }

  override async deleteSession(tokenHash: string): Promise<void> {
    return this.mutate(() => super.deleteSession(tokenHash));
  }

  override async createAgent(agent: Agent): Promise<Agent> {
    return this.mutate(() => super.createAgent(agent));
  }

  override async getAgent(id: string): Promise<Agent | null> {
    await this.waitForReads();
    return super.getAgent(id);
  }

  override async listAgents(ownerId: string): Promise<Agent[]> {
    await this.waitForReads();
    return super.listAgents(ownerId);
  }

  override async touchAgent(id: string, lastUsedAt: string): Promise<void> {
    return this.mutate(() => super.touchAgent(id, lastUsedAt));
  }

  override async createWorkout(workout: Workout): Promise<Workout> {
    return this.mutate(() => super.createWorkout(workout));
  }

  override async listWorkouts(ownerId: string, limit: number): Promise<Workout[]> {
    await this.waitForReads();
    return super.listWorkouts(ownerId, limit);
  }

  override async createBodyMetric(metric: BodyMetric): Promise<BodyMetric> {
    return this.mutate(() => super.createBodyMetric(metric));
  }

  override async listBodyMetrics(ownerId: string, limit: number): Promise<BodyMetric[]> {
    await this.waitForReads();
    return super.listBodyMetrics(ownerId, limit);
  }
}
