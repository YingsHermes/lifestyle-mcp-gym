import { z } from "zod";
import { describe, expect, it } from "vitest";
import { handleMcpRequest } from "@/lib/mcp";
import { LifestyleService } from "@/lib/service";
import { MemoryStorage } from "@/lib/storage/memory";

const toolListSchema = z.object({
  result: z.object({
    tools: z.array(z.object({ name: z.string() })),
  }),
});

async function fixture() {
  let now = new Date("2026-08-20T12:00:00.000Z");
  const service = new LifestyleService(new MemoryStorage(), { now: () => now });
  const first = await service.registerHuman({
    name: "Notes Owner",
    email: "notes@example.com",
    password: "correct horse battery staple",
    timezone: "UTC",
    goals: ["Remember context"],
    experience: "intermediate",
    consent: true,
  });
  const second = await service.registerHuman({
    name: "Other Owner",
    email: "other-notes@example.com",
    password: "correct horse battery staple",
    timezone: "UTC",
    goals: ["Private context"],
    experience: "beginner",
    consent: true,
  });
  return { service, ownerId: first.user.id, otherOwnerId: second.user.id, setNow: (value: string) => { now = new Date(value); } };
}

async function call(service: LifestyleService, secret: string, name: string, args: unknown = {}) {
  return handleMcpRequest(
    { jsonrpc: "2.0", id: name, method: "tools/call", params: { name, arguments: args } },
    secret,
    service,
  );
}

describe("durable notes", () => {
  it("searches weighted owner-scoped content and preserves immutable audit fields", async () => {
    const { service, ownerId, otherOwnerId, setNow } = await fixture();
    const contentMatch = await service.createNote(ownerId, { title: "Weekly plan", content: "Prioritize squats", tags: ["training"] });
    const titleMatch = await service.createNote(ownerId, { title: "Squats preference", content: "Use moderate volume", tags: [] });
    await service.createNote(otherOwnerId, { title: "Squats private", content: "Must not leak", tags: [] });

    expect((await service.searchNotes(ownerId, { query: "squats" })).map((note) => note.id)).toEqual([titleMatch.id, contentMatch.id]);
    expect(await service.searchNotes(ownerId, { query: "private" })).toEqual([]);

    setNow("2026-08-20T13:00:00.000Z");
    const updated = await service.updateNote(ownerId, contentMatch.id, { content: "Prioritize deadlifts", tags: ["training", "training"] });
    expect(updated).toMatchObject({ id: contentMatch.id, ownerId, createdAt: contentMatch.createdAt, content: "Prioritize deadlifts", tags: ["training"], updatedAt: "2026-08-20T13:00:00.000Z" });
    expect((await service.getNotesContext(ownerId, { query: "deadlifts", limit: 10 })).context).toContain("Prioritize deadlifts");
    await service.deleteNote(ownerId, contentMatch.id);
    await expect(service.getNote(ownerId, contentMatch.id)).rejects.toMatchObject({ status: 404, code: "note_not_found" });
  });

  it("advertises search-first instructions and enforces independent note scopes", async () => {
    const { service, ownerId } = await fixture();
    const reader = await service.createAgent(ownerId, { name: "Notes reader", scopes: ["notes:read"], capabilities: ["memory search"] });
    const writer = await service.createAgent(ownerId, { name: "Notes writer", scopes: ["notes:write"], capabilities: ["memory capture"] });

    const initialized = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize" }, undefined, service);
    expect(initialized.body).toMatchObject({ result: { instructions: expect.stringContaining("Search durable notes before") } });
    const listed = toolListSchema.parse((await handleMcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" }, undefined, service)).body);
    const toolNames = listed.result.tools.map((tool) => tool.name);
    expect(toolNames).toEqual(expect.arrayContaining(["create_note", "search_notes", "get_note", "update_note", "delete_note", "get_notes_context"]));

    expect((await call(service, reader.secret, "create_note", { title: "Blocked", content: "No write scope" })).status).toBe(403);
    const created = await call(service, writer.secret, "create_note", { title: "Durable preference", content: "Search before work", tags: ["preference"] });
    expect(created.status).toBe(200);
    expect((await call(service, writer.secret, "search_notes", { query: "preference" })).status).toBe(403);
    const searched = await call(service, reader.secret, "get_notes_context", { query: "preference", limit: 10 });
    expect(searched.body).toMatchObject({ result: { structuredContent: { notes: [{ title: "Durable preference" }] } } });
  });
});
