"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  ApiRequestError,
  bodyProgressResponseSchema,
  fetchApi,
  nutritionEntryDeletedResponseSchema,
  nutritionEntryUpdatedResponseSchema,
  type Agent,
  type BodyMetric,
  type BodyProgress,
  type NutritionEntry,
  type NutritionSummary,
  type ProgressStats,
  type StrengthProgress,
  type Workout,
} from "@/components/client-api";
import { AnimatedNumber, TrendChart } from "@/components/progress-charts";
import { Icon, InlineNotice, Spinner } from "@/components/ui";

export type AthleteSection = "today" | "training" | "workout" | "nutrition" | "body" | "metrics" | "progress" | "agents" | "api";
const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const formatNumber = (value: number): string => numberFormat.format(value);
export const dateKey = (value: string): string => value.slice(0, 10);
export const localToday = (): string => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const displayDate = (value: string): string => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
export const workoutVolume = (workout: Workout): number => workout.exercises.reduce((total, exercise) => total + exercise.sets.reduce((exerciseTotal, set) => exerciseTotal + (set.reps ?? 0) * (set.weightKg ?? 0), 0), 0);

export function AthleteOverview({
  firstName,
  workouts,
  stats,
  nutrition,
  body,
  strength,
  agents,
  onNavigate,
}: {
  firstName: string;
  workouts: Workout[];
  stats: ProgressStats;
  nutrition: NutritionSummary;
  body: BodyProgress;
  strength: StrengthProgress;
  agents: Agent[];
  onNavigate: (section: AthleteSection) => void;
}) {
  const today = nutrition.date;
  const todayWorkouts = workouts.filter((workout) => dateKey(workout.occurredAt) === today);
  const activeDays = stats.weeklyActivity.filter((day) => day.workouts > 0).length;
  const activeAgents = agents.filter((agent) => agent.lastUsedAt);
  const recentCutoff = new Date(new Date(strength.generatedAt).getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const recentPrs = strength.personalRecords.filter((record) => dateKey(record.occurredAt) >= recentCutoff);
  const calorieTarget = nutrition.calorieTargets.goalTargetCalories;
  const nextAction = todayWorkouts.length === 0
    ? { label: "Log today’s training", detail: "No workout is recorded today.", section: "training" as const }
    : nutrition.entries.length === 0
      ? { label: "Log today’s fuel", detail: "Training is present; nutrition is still unlogged.", section: "nutrition" as const }
      : body.metricsCount < 2
        ? { label: "Build a body trend", detail: "Add another measurement to unlock change signals.", section: "body" as const }
        : { label: "Review your progress", detail: "Your core daily signals are present.", section: "progress" as const };

  return (
    <div className="athlete-overview">
      <section className="command-heading workspace-panel" aria-labelledby="today-title">
        <div><span className="live-kicker"><i aria-hidden="true" /> Athlete command center</span><h1 id="today-title">Today, <span>{firstName}.</span></h1><p>Current facts first. Every signal below comes from your stored logs.</p></div>
        <button className="primary-button" type="button" onClick={() => onNavigate("workout")}><Icon name="plus" size={17} /> Log workout</button>
      </section>
      <section className="command-facts" aria-label="Today and this week">
        <article><span>Today · activity</span><strong><AnimatedNumber value={todayWorkouts.length} /></strong><p>{todayWorkouts.length ? `${formatNumber(todayWorkouts.reduce((total, item) => total + workoutVolume(item), 0))} kg logged volume` : "No workout logged"}</p><button type="button" onClick={() => onNavigate("training")}>Open training <Icon name="arrow" size={14} /></button></article>
        <article><span>Today · nutrition</span><strong><AnimatedNumber value={nutrition.totals.caloriesKcal} format={(value) => Math.round(value).toLocaleString()} /> <small>kcal</small></strong><p>{calorieTarget === null ? "Goal needs profile + weight" : `${Math.max(calorieTarget - nutrition.totals.caloriesKcal, 0).toLocaleString()} kcal remaining of ${calorieTarget.toLocaleString()}`}</p><button type="button" onClick={() => onNavigate("nutrition")}>Open nutrition <Icon name="arrow" size={14} /></button></article>
        <article><span>Since first log · body</span><strong>{body.weight.change === null ? "—" : `${body.weight.change > 0 ? "+" : ""}${formatNumber(body.weight.change)} kg`}</strong><p>{body.weight.latest === null ? "No body weight yet" : `${formatNumber(body.weight.latest)} kg latest · ${body.weight.direction}`}</p><button type="button" onClick={() => onNavigate("body")}>Open body <Icon name="arrow" size={14} /></button></article>
        <article><span>This week · consistency</span><strong><AnimatedNumber value={activeDays} /><small>/7 days</small></strong><p>{stats.weeklyWorkouts} workout{stats.weeklyWorkouts === 1 ? "" : "s"} · {formatNumber(stats.weeklyVolumeKg)} kg volume</p><button type="button" onClick={() => onNavigate("training")}>Review week <Icon name="arrow" size={14} /></button></article>
        <article><span>This week · strength PRs</span><strong><AnimatedNumber value={recentPrs.length} /></strong><p>{recentPrs.length ? `${recentPrs[0].exerciseName}: ${formatNumber(recentPrs[0].valueKg)} kg${recentPrs[0].estimated ? " estimated" : ""}` : "No new records established"}</p><button type="button" onClick={() => onNavigate("progress")}>See progress <Icon name="arrow" size={14} /></button></article>
        <article><span>Agent activity</span><strong>{activeAgents.length}<small>/{agents.length}</small></strong><p>{agents.length ? "agents have authenticated" : "No scoped agents connected"}</p><button type="button" onClick={() => onNavigate("agents")}>Manage agents <Icon name="arrow" size={14} /></button></article>
      </section>
      <section className="next-action workspace-panel">
        <span className="section-kicker">Next recommended action</span><div><div><h2>{nextAction.label}</h2><p>{nextAction.detail}</p></div><button className="primary-button" type="button" onClick={() => onNavigate(nextAction.section)}>Act now <Icon name="arrow" size={16} /></button></div>
      </section>
    </div>
  );
}

export function TrainingWorkspace({ workouts, agents, onLogWorkout }: { workouts: Workout[]; agents: Agent[]; onLogWorkout: () => void }) {
  const [selectedDate, setSelectedDate] = useState(localToday());
  const agentNames = useMemo(() => new Map(agents.map((agent) => [agent.id, agent.name])), [agents]);
  const filtered = selectedDate ? workouts.filter((workout) => dateKey(workout.occurredAt) === selectedDate) : workouts;
  const groups = useMemo(() => {
    const result = new Map<string, Workout[]>();
    for (const item of filtered) {
      const date = dateKey(item.occurredAt);
      result.set(date, [...(result.get(date) ?? []), item]);
    }
    return [...result.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [filtered]);
  const shiftDate = (days: number) => {
    const next = new Date(`${selectedDate || localToday()}T12:00:00`);
    next.setDate(next.getDate() + days);
    setSelectedDate(next.toISOString().slice(0, 10));
  };

  return (
    <div className="training-workspace">
      <section className="workspace-panel section-command-head"><div><span className="section-kicker">Daily training ledger</span><h1>Training logs</h1><p>Every exercise, working set, source, note, and timestamp in date order.</p></div><button className="primary-button" type="button" onClick={onLogWorkout}><Icon name="plus" size={17} /> Log workout</button></section>
      <section className="workspace-panel date-control" aria-label="Workout date filter">
        <button type="button" aria-label="Previous date" onClick={() => shiftDate(-1)}>←</button>
        <label><span>Activity date</span><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>
        <button type="button" aria-label="Next date" onClick={() => shiftDate(1)}>→</button>
        <button type="button" className="text-button" onClick={() => setSelectedDate(localToday())}>Today</button>
        <button type="button" className="text-button" onClick={() => setSelectedDate("")}>All dates</button>
      </section>
      {workouts.length === 0 ? <section className="workspace-panel empty-state"><span className="empty-icon"><Icon name="dumbbell" size={28} /></span><h2>No training history yet</h2><p>Log a workout manually or let an authorized agent write the first daily record.</p><button className="primary-button" type="button" onClick={onLogWorkout}>Log first workout</button></section>
        : groups.length === 0 ? <section className="workspace-panel empty-state"><span className="empty-icon"><Icon name="activity" size={28} /></span><h2>No activity on {displayDate(selectedDate)}</h2><p>Your training history is intact. Move to another date or log this session.</p><button className="secondary-button" type="button" onClick={() => setSelectedDate("")}>Show all dates</button></section>
          : <div className="workout-date-groups">{groups.map(([date, items]) => <section key={date} className="workout-date-group" aria-labelledby={`date-${date}`}><header><div><span className="section-kicker">{date === localToday() ? "Today" : "Daily log"}</span><h2 id={`date-${date}`}>{displayDate(date)}</h2></div><span>{items.length} workout{items.length === 1 ? "" : "s"}</span></header><div className="workout-log-list">{items.map((item) => <WorkoutLog key={item.id} workout={item} source={item.agentId ? agentNames.get(item.agentId) ?? item.agentId : "Human"} />)}</div></section>)}</div>}
    </div>
  );
}

function WorkoutLog({ workout, source }: { workout: Workout; source: string }) {
  const volume = workoutVolume(workout);
  return <details className="workspace-panel workout-log"><summary><div><span className="source-pill">{workout.agentId ? "Agent" : "Human"}</span><h3>{workout.title}</h3><p>{workout.durationMinutes ? `${workout.durationMinutes} min · ` : ""}{workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"} · {formatNumber(volume)} kg volume</p></div><span>Open details</span></summary><div className="workout-log-detail"><dl><div><dt>Started</dt><dd><time dateTime={workout.occurredAt}>{new Date(workout.occurredAt).toLocaleString()}</time></dd></div><div><dt>Source</dt><dd>{source}</dd></div><div><dt>Created</dt><dd><time dateTime={workout.createdAt}>{new Date(workout.createdAt).toLocaleString()}</time></dd></div><div><dt>Total volume</dt><dd>{formatNumber(volume)} kg</dd></div></dl>{workout.notes && <p className="workout-notes"><strong>Session notes:</strong> {workout.notes}</p>}<div className="table-scroll"><table><caption className="sr-only">Exercises and sets for {workout.title}</caption><thead><tr><th scope="col">Exercise</th><th scope="col">Set</th><th scope="col">Reps</th><th scope="col">Weight</th><th scope="col">Volume</th><th scope="col">Notes</th></tr></thead><tbody>{workout.exercises.flatMap((exercise) => exercise.sets.map((set, index) => <tr key={set.id}><th scope="row">{exercise.name}</th><td>{index + 1}</td><td>{set.reps ?? "—"}</td><td>{set.weightKg === undefined ? "—" : `${formatNumber(set.weightKg)} kg`}</td><td>{set.reps !== undefined && set.weightKg !== undefined ? `${formatNumber(set.reps * set.weightKg)} kg` : "—"}</td><td>{set.notes ?? (set.durationSeconds ? `${set.durationSeconds} sec` : "—")}</td></tr>))}</tbody></table></div></div></details>;
}

export const rangeStart = (days: number): string => new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

export function BodyProgressWorkspace({ initial, metrics, onRecord }: { initial: BodyProgress; metrics: BodyMetric[]; onRecord: () => void }) {
  const [rangedSummary, setRangedSummary] = useState<BodyProgress | null>(null);
  const [range, setRange] = useState<"30" | "90" | "all">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = range === "all" ? initial : rangedSummary ?? initial;
  async function selectRange(next: "30" | "90" | "all") {
    setRange(next); setError(null);
    if (next === "all") return;
    setLoading(true);
    try {
      const query = `?from=${rangeStart(Number(next))}`;
      setRangedSummary((await fetchApi(`/api/progress/body${query}`, bodyProgressResponseSchema)).summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Body progress could not be loaded");
    } finally { setLoading(false); }
  }
  const rows = [
    { label: "Weight", series: summary.weight, color: "var(--acid)" },
    { label: "Body fat", series: summary.bodyFat, color: "var(--ice)" },
    { label: "Waist", series: summary.waist, color: "var(--amber)" },
  ];
  return <div className="body-progress-workspace"><section className="workspace-panel section-command-head"><div><span className="section-kicker">Body changes</span><h1>Body progress</h1><p>First, latest, and change within the selected range. Direction describes the number only—not whether it is good or bad.</p></div><button className="primary-button" type="button" onClick={onRecord}><Icon name="plus" size={17} /> Record measurement</button></section><div className="range-tabs" role="group" aria-label="Body progress date range">{(["30", "90", "all"] as const).map((item) => <button key={item} type="button" aria-pressed={range === item} onClick={() => void selectRange(item)}>{item === "all" ? "All time" : `${item} days`}</button>)}</div>{error && <InlineNotice>{error}</InlineNotice>}{loading ? <section className="workspace-panel inline-loading" role="status"><Spinner label="Loading body progress" /></section> : <><section className="body-signal-grid">{rows.map(({ label, series, color }) => <article className="workspace-panel" key={label}><span>{label} · {series.unit}</span><strong>{series.latest === null ? "—" : formatNumber(series.latest)}</strong><p>{series.change === null ? "Trend needs more data" : `${series.change > 0 ? "+" : ""}${formatNumber(series.change)} ${series.unit} since first in range`}</p>{series.points.length >= 2 ? <TrendChart label={`${label} over time`} points={series.points.map((point) => ({ x: point.recordedAt, y: point.value }))} unit={series.unit} color={color} /> : <div className="line-chart-empty">Add another point to draw this trend.</div>}</article>)}</section>{summary.sparseDataMessage && <InlineNotice tone="info">{summary.sparseDataMessage}</InlineNotice>}<section className="workspace-panel progress-table"><div className="subsection-head"><div><span className="section-kicker">Readable history</span><h2>Measurements</h2></div><span>{summary.metricsCount} in range</span></div>{metrics.length === 0 ? <div className="empty-compact"><Icon name="body" /><strong>No body data yet</strong><p>Record weight, body fat, waist, or any combination.</p></div> : <div className="table-scroll"><table><thead><tr><th scope="col">Date</th><th scope="col">Weight</th><th scope="col">Body fat</th><th scope="col">Waist</th><th scope="col">Source</th><th scope="col">Notes</th></tr></thead><tbody>{metrics.filter((item) => !summary.range.from || dateKey(item.recordedAt) >= summary.range.from).map((item) => <tr key={item.id}><th scope="row">{new Date(item.recordedAt).toLocaleDateString()}</th><td>{item.weightKg === undefined ? "—" : `${formatNumber(item.weightKg)} kg`}</td><td>{item.bodyFatPercent === undefined ? "—" : `${formatNumber(item.bodyFatPercent)}%`}</td><td>{item.waistCm === undefined ? "—" : `${formatNumber(item.waistCm)} cm`}</td><td>{item.agentId ? "Agent" : "Human"}</td><td>{item.notes ?? "—"}</td></tr>)}</tbody></table></div>}</section></>}</div>;
}

const localDateTime = (value: string): string => {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function EditableNutritionEntries({ entries, onChanged }: { entries: NutritionEntry[]; onChanged: () => Promise<void> }) {
  if (entries.length === 0) return <div className="empty-compact"><Icon name="spark" /><strong>No food logged today</strong><p>Add exact values from a label, recipe, or your own record. The MCP will not guess.</p></div>;
  return <div className="meal-log-list editable-meal-list">{entries.map((entry) => <EditableNutritionEntry key={entry.id} entry={entry} onChanged={onChanged} />)}</div>;
}

function EditableNutritionEntry({ entry, onChanged }: { entry: NutritionEntry; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState(false); const [confirmingDelete, setConfirmingDelete] = useState(false); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(null); const form = new FormData(event.currentTarget);
    try {
      await fetchApi(`/api/nutrition/entries/${encodeURIComponent(entry.id)}`, nutritionEntryUpdatedResponseSchema, { method: "PATCH", body: JSON.stringify({ eatenAt: new Date(String(form.get("eatenAt"))).toISOString(), mealType: form.get("mealType"), foodName: form.get("foodName"), servingSize: form.get("servingSize"), servings: Number(form.get("servings")), caloriesKcal: Number(form.get("caloriesKcal")), proteinG: Number(form.get("proteinG")), carbohydratesG: Number(form.get("carbohydratesG")), fatG: Number(form.get("fatG")), fiberG: Number(form.get("fiberG")), notes: String(form.get("notes") ?? "").trim() || undefined }) });
      await onChanged(); setEditing(false); setNotice({ tone: "success", text: "Food entry updated." });
    } catch (caught) { setNotice({ tone: "error", text: caught instanceof ApiRequestError ? caught.message : "Food entry could not be updated" }); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setNotice(null);
    try { await fetchApi(`/api/nutrition/entries/${encodeURIComponent(entry.id)}`, nutritionEntryDeletedResponseSchema, { method: "DELETE" }); await onChanged(); }
    catch (caught) { setNotice({ tone: "error", text: caught instanceof ApiRequestError ? caught.message : "Food entry could not be deleted" }); setBusy(false); setConfirmingDelete(false); }
  }
  if (editing) return <form className="food-edit-card" onSubmit={submit}><div className="food-edit-head"><strong>Edit food entry</strong><button type="button" className="text-button" onClick={() => setEditing(false)}>Cancel</button></div>{notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}<label><span>Food or dish</span><input name="foodName" defaultValue={entry.foodName} maxLength={160} required /></label><div className="nutrition-form-grid"><label><span>Eaten at</span><input name="eatenAt" type="datetime-local" defaultValue={localDateTime(entry.eatenAt)} required /></label><label><span>Meal</span><select name="mealType" defaultValue={entry.mealType}><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option><option value="other">Other</option></select></label><label><span>Serving size</span><input name="servingSize" defaultValue={entry.servingSize} maxLength={100} required /></label><label><span>Servings</span><input name="servings" type="number" min="0.01" max="100" step="0.01" defaultValue={entry.servings} required /></label></div><div className="food-macro-grid"><label><span>Calories</span><input name="caloriesKcal" type="number" min="0" max="20000" step="0.1" defaultValue={entry.caloriesKcal} required /></label><label><span>Protein g</span><input name="proteinG" type="number" min="0" max="2000" step="0.1" defaultValue={entry.proteinG} required /></label><label><span>Carbs g</span><input name="carbohydratesG" type="number" min="0" max="2000" step="0.1" defaultValue={entry.carbohydratesG} required /></label><label><span>Fat g</span><input name="fatG" type="number" min="0" max="2000" step="0.1" defaultValue={entry.fatG} required /></label><label><span>Fiber g</span><input name="fiberG" type="number" min="0" max="500" step="0.1" defaultValue={entry.fiberG} required /></label></div><label><span>Notes</span><textarea name="notes" defaultValue={entry.notes} maxLength={1000} /></label><button className="primary-button" type="submit" disabled={busy}>{busy ? <Spinner label="Saving" /> : "Save correction"}</button></form>;
  return <article><div><span className="meal-type">{entry.mealType}</span><time dateTime={entry.eatenAt}>{new Date(entry.eatenAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time></div><h3>{entry.foodName}</h3><p>{entry.servings} × {entry.servingSize}</p><div><strong>{entry.caloriesKcal} kcal</strong><span>P {entry.proteinG} g</span><span>C {entry.carbohydratesG} g</span><span>F {entry.fatG} g</span></div>{entry.notes && <small>{entry.notes}</small>}<small>Created {new Date(entry.createdAt).toLocaleString()} · Updated {new Date(entry.updatedAt).toLocaleString()} · {entry.agentId ? "Agent" : "Human"}</small>{notice && <InlineNotice tone={notice.tone}>{notice.text}</InlineNotice>}<div className="entry-actions"><button type="button" className="secondary-button" onClick={() => setEditing(true)}>Edit</button>{confirmingDelete ? <><span>Delete permanently?</span><button type="button" className="danger-button" disabled={busy} onClick={() => void remove()}>{busy ? "Deleting…" : "Yes, delete"}</button><button type="button" className="text-button" onClick={() => setConfirmingDelete(false)}>Cancel</button></> : <button type="button" className="danger-link" onClick={() => setConfirmingDelete(true)}>Delete</button>}</div></article>;
}
