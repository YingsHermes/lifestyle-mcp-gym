"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import {
  agentCreatedResponseSchema,
  ApiRequestError,
  fetchApi,
  metricCreatedResponseSchema,
  workoutCreatedResponseSchema,
  type Agent,
} from "@/components/client-api";
import { Icon, InlineNotice, Spinner } from "@/components/ui";

interface SetDraft {
  reps: string;
  weightKg: string;
  durationSeconds: string;
}

interface ExerciseDraft {
  name: string;
  sets: SetDraft[];
}

const blankSet = (): SetDraft => ({ reps: "", weightKg: "", durationSeconds: "" });
const blankExercise = (): ExerciseDraft => ({ name: "", sets: [blankSet()] });
const scopeSchema = z.enum(["workouts:read", "workouts:write", "metrics:read", "metrics:write", "dashboard:link"]);
type AgentScope = z.infer<typeof scopeSchema>;

function defaultLocalDateTime(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function optionalNumber(value: string): number | undefined {
  return value.trim() === "" ? undefined : Number(value);
}

export function WorkoutForm({ onSaved, onCancel }: { onSaved: () => Promise<void>; onCancel: () => void }) {
  const [exercises, setExercises] = useState<ExerciseDraft[]>([blankExercise()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateExerciseName(index: number, name: string) {
    setExercises((current) => current.map((exercise, candidate) => candidate === index ? { ...exercise, name } : exercise));
  }

  function updateSet(exerciseIndex: number, setIndex: number, field: keyof SetDraft, value: string) {
    setExercises((current) => current.map((exercise, candidate) => candidate === exerciseIndex
      ? { ...exercise, sets: exercise.sets.map((set, setCandidate) => setCandidate === setIndex ? { ...set, [field]: value } : set) }
      : exercise));
  }

  function addSet(exerciseIndex: number) {
    setExercises((current) => current.map((exercise, candidate) => candidate === exerciseIndex
      ? { ...exercise, sets: [...exercise.sets, blankSet()] }
      : exercise));
  }

  function removeSet(exerciseIndex: number, setIndex: number) {
    setExercises((current) => current.map((exercise, candidate) => candidate === exerciseIndex
      ? { ...exercise, sets: exercise.sets.filter((_, setCandidate) => setCandidate !== setIndex) }
      : exercise));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await fetchApi("/api/workouts", workoutCreatedResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          occurredAt: new Date(String(form.get("occurredAt"))).toISOString(),
          durationMinutes: optionalNumber(String(form.get("durationMinutes") ?? "")),
          notes: String(form.get("notes") ?? "").trim() || undefined,
          exercises: exercises.map((exercise) => ({
            name: exercise.name,
            sets: exercise.sets.map((set) => ({
              reps: optionalNumber(set.reps),
              weightKg: optionalNumber(set.weightKg),
              durationSeconds: optionalNumber(set.durationSeconds),
            })),
          })),
        }),
      });
      await onSaved();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Workout could not be saved");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="workspace-panel form-workspace">
      <div className="workspace-title"><div><span className="section-kicker">Training log</span><h1>Log a workout</h1><p>Capture the work. Weight is stored in kilograms.</p></div><button className="text-button" type="button" onClick={onCancel}>Cancel</button></div>
      <form onSubmit={submit} className="data-form">
        {error && <InlineNotice>{error}</InlineNotice>}
        <div className="field-row field-row-three">
          <label><span>Session title</span><input name="title" placeholder="Lower strength" minLength={2} maxLength={120} required /></label>
          <label><span>Date and time</span><input name="occurredAt" type="datetime-local" defaultValue={defaultLocalDateTime()} required /></label>
          <label><span>Duration <small>minutes</small></span><input name="durationMinutes" type="number" min={1} max={1440} placeholder="60" /></label>
        </div>
        <label><span>Session notes <small>optional</small></span><textarea name="notes" rows={3} maxLength={2000} placeholder="Energy, intent, or anything worth remembering." /></label>

        <div className="exercise-list">
          {exercises.map((exercise, exerciseIndex) => (
            <fieldset className="exercise-card" key={exerciseIndex}>
              <legend>Exercise {String(exerciseIndex + 1).padStart(2, "0")}</legend>
              <div className="exercise-head">
                <label><span>Exercise name</span><input value={exercise.name} onChange={(event) => updateExerciseName(exerciseIndex, event.target.value)} placeholder="Back squat" minLength={2} maxLength={100} required /></label>
                {exercises.length > 1 && <button className="danger-link" type="button" onClick={() => setExercises((current) => current.filter((_, index) => index !== exerciseIndex))}>Remove exercise</button>}
              </div>
              <div className="set-labels" aria-hidden="true"><span>Set</span><span>Reps</span><span>Weight kg</span><span>Time sec</span><span /></div>
              {exercise.sets.map((set, setIndex) => (
                <div className="set-row" key={setIndex}>
                  <strong>{setIndex + 1}</strong>
                  <label><span className="sr-only">Reps for set {setIndex + 1}</span><input aria-label={`Reps for set ${setIndex + 1}`} type="number" min={1} max={1000} value={set.reps} onChange={(event) => updateSet(exerciseIndex, setIndex, "reps", event.target.value)} placeholder="5" /></label>
                  <label><span className="sr-only">Weight kilograms for set {setIndex + 1}</span><input aria-label={`Weight kilograms for set ${setIndex + 1}`} type="number" min={0} max={2000} step="0.25" value={set.weightKg} onChange={(event) => updateSet(exerciseIndex, setIndex, "weightKg", event.target.value)} placeholder="100" /></label>
                  <label><span className="sr-only">Duration seconds for set {setIndex + 1}</span><input aria-label={`Duration seconds for set ${setIndex + 1}`} type="number" min={1} max={86400} value={set.durationSeconds} onChange={(event) => updateSet(exerciseIndex, setIndex, "durationSeconds", event.target.value)} placeholder="—" /></label>
                  <button className="icon-button" type="button" disabled={exercise.sets.length === 1} aria-label={`Remove set ${setIndex + 1}`} onClick={() => removeSet(exerciseIndex, setIndex)}>×</button>
                </div>
              ))}
              <button className="add-row-button" type="button" onClick={() => addSet(exerciseIndex)}><Icon name="plus" size={16} /> Add set</button>
            </fieldset>
          ))}
        </div>
        <button className="secondary-button" type="button" onClick={() => setExercises((current) => [...current, blankExercise()])}><Icon name="plus" size={17} /> Add exercise</button>
        <div className="form-actions"><button className="text-button" type="button" onClick={onCancel}>Discard</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? <Spinner label="Saving" /> : <>Save workout <Icon name="arrow" size={17} /></>}</button></div>
      </form>
    </section>
  );
}

export function MetricForm({ onSaved, onCancel }: { onSaved: () => Promise<void>; onCancel: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await fetchApi("/api/metrics", metricCreatedResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          recordedAt: new Date(String(form.get("recordedAt"))).toISOString(),
          weightKg: optionalNumber(String(form.get("weightKg") ?? "")),
          bodyFatPercent: optionalNumber(String(form.get("bodyFatPercent") ?? "")),
          waistCm: optionalNumber(String(form.get("waistCm") ?? "")),
          notes: String(form.get("notes") ?? "").trim() || undefined,
        }),
      });
      await onSaved();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Measurement could not be saved");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="workspace-panel form-workspace compact-workspace">
      <div className="workspace-title"><div><span className="section-kicker">Body signal</span><h1>Record measurements</h1><p>Enter one or more values. No invented scores or judgment.</p></div><button className="text-button" type="button" onClick={onCancel}>Cancel</button></div>
      <form onSubmit={submit} className="data-form">
        {error && <InlineNotice>{error}</InlineNotice>}
        <label><span>Date and time</span><input name="recordedAt" type="datetime-local" defaultValue={defaultLocalDateTime()} required /></label>
        <div className="metric-input-grid">
          <label><span>Body weight <small>kg</small></span><input name="weightKg" type="number" min={20} max={500} step="0.1" placeholder="80.5" /></label>
          <label><span>Body fat <small>%</small></span><input name="bodyFatPercent" type="number" min={1} max={75} step="0.1" placeholder="18.0" /></label>
          <label><span>Waist <small>cm</small></span><input name="waistCm" type="number" min={20} max={300} step="0.1" placeholder="84.0" /></label>
        </div>
        <label><span>Notes <small>optional</small></span><textarea name="notes" rows={3} maxLength={500} placeholder="Morning, before breakfast" /></label>
        <div className="form-actions"><button className="text-button" type="button" onClick={onCancel}>Discard</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? <Spinner label="Saving" /> : <>Save measurement <Icon name="arrow" size={17} /></>}</button></div>
      </form>
    </section>
  );
}

export function AgentPanel({ agents, onSaved }: { agents: Agent[]; onSaved: () => Promise<void> }) {
  const [scopes, setScopes] = useState<AgentScope[]>(["workouts:read", "workouts:write", "metrics:read", "metrics:write", "dashboard:link"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function toggleScope(rawScope: string) {
    const scope = scopeSchema.parse(rawScope);
    setScopes((current) => current.includes(scope) ? current.filter((candidate) => candidate !== scope) : [...current, scope]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const team = String(form.get("ownerTeam") ?? "").trim();
      const response = await fetchApi("/api/agents", agentCreatedResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          scopes,
          capabilities: String(form.get("capabilities") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
          webhookUrl: String(form.get("webhookUrl") ?? "").trim() || undefined,
          ownerMetadata: team ? { team } : undefined,
        }),
      });
      setSecret(response.secret);
      event.currentTarget.reset();
      await onSaved();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Agent could not be registered");
    } finally {
      setSubmitting(false);
    }
  }

  async function copySecret() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="workspace-panel form-workspace">
      <div className="workspace-title"><div><span className="section-kicker">Delegated access</span><h1>Agents</h1><p>Credentials are scoped, owner-bound, and shown once.</p></div></div>
      {secret && <div className="secret-reveal" role="status"><div><Icon name="shield" /><span><strong>Copy this credential now</strong><small>It cannot be recovered. Only a scrypt hash is stored.</small></span></div><code>{secret}</code><button className="secondary-button" type="button" onClick={copySecret}>{copied ? "Copied" : "Copy credential"}</button><button className="secret-dismiss" type="button" onClick={() => setSecret(null)}>I stored it safely</button></div>}
      <div className="agent-layout">
        <form onSubmit={submit} className="data-form agent-form">
          <h2>Issue a credential</h2>
          {error && <InlineNotice>{error}</InlineNotice>}
          <label><span>Agent name</span><input name="name" placeholder="Training logger" minLength={2} maxLength={80} required /></label>
          <label><span>Capabilities <small>comma separated</small></span><input name="capabilities" placeholder="logging, analytics" required /></label>
          <fieldset className="scope-fieldset"><legend>Scopes</legend>{scopeSchema.options.map((scope) => <label key={scope}><input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} /><span>{scope}</span></label>)}</fieldset>
          <label><span>Webhook URL <small>optional, HTTPS</small></span><input name="webhookUrl" type="url" placeholder="https://agent.example/hooks/gym" /></label>
          <label><span>Owner team <small>optional metadata</small></span><input name="ownerTeam" placeholder="personal" maxLength={200} /></label>
          <button className="primary-button" type="submit" disabled={submitting || scopes.length === 0}>{submitting ? <Spinner label="Issuing" /> : <>Issue agent secret <Icon name="arrow" size={17} /></>}</button>
        </form>
        <div className="agent-list-panel"><div className="subsection-head"><h2>Active agents</h2><span>{agents.length}</span></div>{agents.length === 0 ? <div className="empty-compact"><Icon name="agent" /><strong>No agents yet</strong><p>Issue a scoped credential when a tool is ready to connect.</p></div> : <div className="agent-list">{agents.map((agent) => <article key={agent.id}><div><span className="agent-avatar"><Icon name="agent" /></span><span><strong>{agent.name}</strong><small>{agent.id}</small></span></div><div className="scope-tags">{agent.scopes.map((scope) => <code key={scope}>{scope}</code>)}</div><p>{agent.lastUsedAt ? `Last used ${new Date(agent.lastUsedAt).toLocaleString()}` : "Credential has not been used"}</p></article>)}</div>}</div>
      </div>
    </section>
  );
}
