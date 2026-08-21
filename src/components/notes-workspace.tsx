"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { ApiRequestError, fetchApi } from "@/components/client-api";
import { Icon, InlineNotice, Spinner } from "@/components/ui";

const noteSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  agentId: z.string().optional(),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const notesResponseSchema = z.object({ notes: z.array(noteSchema) });
const noteResponseSchema = z.object({ note: noteSchema });
const deleteResponseSchema = z.object({ deleted: z.literal(true), noteId: z.string() });

type Note = z.infer<typeof noteSchema>;

function messageFromError(error: unknown): string {
  return error instanceof ApiRequestError || error instanceof Error ? error.message : "The note request failed";
}

export function NotesWorkspace() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async (search: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchApi(`/api/notes?query=${encodeURIComponent(search)}&limit=100`, notesResponseSchema);
      setNotes(response.notes);
      setSelected((current) => current ? response.notes.find((note) => note.id === current.id) ?? null : null);
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void fetchApi("/api/notes?query=&limit=100", notesResponseSchema)
      .then((response) => {
        if (active) setNotes(response.notes);
      })
      .catch((caught: unknown) => {
        if (active) setError(messageFromError(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function edit(note: Note) {
    setSelected(note);
    setTitle(note.title);
    setContent(note.content);
    setTags(note.tags.join(", "));
    setError(null);
  }

  function clearEditor() {
    setSelected(null);
    setTitle("");
    setContent("");
    setTags("");
    setError(null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      title,
      content,
      tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))],
    };
    try {
      const response = await fetchApi(
        selected ? `/api/notes/${encodeURIComponent(selected.id)}` : "/api/notes",
        noteResponseSchema,
        { method: selected ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setSelected(response.note);
      setTitle(response.note.title);
      setContent(response.note.content);
      setTags(response.note.tags.join(", "));
      await loadNotes(query);
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await fetchApi(`/api/notes/${encodeURIComponent(selected.id)}`, deleteResponseSchema, { method: "DELETE" });
      clearEditor();
      await loadNotes(query);
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="notes-workspace">
      <section className="workspace-panel notes-heading">
        <div><span className="section-kicker">Durable memory</span><h1>Notes</h1><p>Search decisions, preferences, facts, and handoffs saved by you or your scoped agents.</p></div>
        <button className="primary-button" type="button" onClick={clearEditor}><Icon name="plus" size={17} /> New note</button>
      </section>
      {error && <InlineNotice>{error}</InlineNotice>}
      <div className="notes-grid">
        <section className="workspace-panel notes-library">
          <form className="notes-search" onSubmit={(event) => { event.preventDefault(); void loadNotes(query); }}>
            <label htmlFor="notes-query">Search durable notes</label>
            <div><input id="notes-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, tags, or content" /><button type="submit" disabled={loading}>Search</button></div>
          </form>
          {loading ? <div className="notes-loading"><Spinner label="Searching notes" /></div> : notes.length === 0 ? <div className="empty-compact"><Icon name="note" /><strong>No matching notes</strong><p>Save durable context here so future sessions can retrieve it.</p></div> : <div className="notes-list">{notes.map((note) => <button type="button" key={note.id} className={selected?.id === note.id ? "active" : ""} onClick={() => edit(note)}><span><strong>{note.title}</strong><time>{new Date(note.updatedAt).toLocaleDateString()}</time></span><p>{note.content}</p><small>{note.tags.length ? note.tags.join(" · ") : "Untagged"}</small></button>)}</div>}
        </section>
        <section className="workspace-panel note-editor">
          <div className="subsection-head"><div><span className="section-kicker">{selected ? "Edit durable note" : "New durable note"}</span><h2>{selected ? selected.title : "Save context for later"}</h2></div>{selected?.agentId && <span>Agent saved</span>}</div>
          <form onSubmit={save}>
            <label>Title<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What should be remembered?" /></label>
            <label>Content<textarea required maxLength={20_000} rows={12} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Record the decision, preference, fact, or handoff context." /></label>
            <label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="preferences, training, handoff" /></label>
            <div className="note-editor-actions">{selected && <button className="danger-button" type="button" disabled={saving} onClick={() => void remove()}>Delete</button>}<button className="primary-button" type="submit" disabled={saving}>{saving ? <Spinner label="Saving" /> : <><Icon name="check" size={17} /> Save durable note</>}</button></div>
          </form>
        </section>
      </div>
    </div>
  );
}
