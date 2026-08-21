"use client";

import { useMemo, useState } from "react";
import {
  ApiRequestError,
  bodyProgressResponseSchema,
  fetchApi,
  strengthProgressResponseSchema,
  type Agent,
  type BodyMetric,
  type BodyProgress,
  type ProgressStats,
  type StrengthProgress,
  type Workout,
} from "@/components/client-api";
import { dateKey, localToday, rangeStart, workoutVolume, type AthleteSection } from "@/components/athlete-sections";
import {
  AnimatedNumber,
  ChartEmpty,
  ConsistencyHeatmap,
  MultiLineChart,
  ProgressRing,
  TrendChart,
  VolumeBars,
  type ChartPoint,
} from "@/components/progress-charts";
import { Icon, InlineNotice, Spinner } from "@/components/ui";

const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const formatNumber = (value: number): string => numberFormat.format(value);

const epley1RM = (weightKg: number, reps: number): number => weightKg * (1 + reps / 30);

const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

interface ExerciseSeries {
  name: string;
  volume: number;
  weight: ChartPoint[];
  e1rm: ChartPoint[];
}

function buildExerciseSeries(workouts: Workout[]): ExerciseSeries[] {
  const map = new Map<string, ExerciseSeries>();
  const sorted = [...workouts].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  for (const workout of sorted) {
    const day = dateKey(workout.occurredAt);
    for (const exercise of workout.exercises) {
      let bestWeight = 0;
      let bestE1rm = 0;
      let volume = 0;
      for (const set of exercise.sets) {
        const weight = set.weightKg ?? 0;
        const reps = set.reps ?? 0;
        volume += weight * reps;
        if (weight > bestWeight) bestWeight = weight;
        if (weight > 0 && reps > 0) bestE1rm = Math.max(bestE1rm, epley1RM(weight, reps));
      }
      if (bestWeight <= 0) continue;
      const entry = map.get(exercise.name) ?? { name: exercise.name, volume: 0, weight: [], e1rm: [] };
      entry.weight.push({ x: day, y: bestWeight });
      if (bestE1rm > 0) entry.e1rm.push({ x: day, y: Math.round(bestE1rm * 10) / 10 });
      entry.volume += volume;
      map.set(exercise.name, entry);
    }
  }
  return [...map.values()].sort((left, right) => right.volume - left.volume);
}

function buildHeatmapDays(workouts: Workout[]): Array<{ date: string; level: 0 | 1 | 2 | 3 | 4; volumeKg: number }> {
  const volumeByDate = new Map<string, number>();
  for (const workout of workouts) {
    const day = dateKey(workout.occurredAt);
    volumeByDate.set(day, (volumeByDate.get(day) ?? 0) + workoutVolume(workout));
  }
  const end = new Date(`${localToday()}T12:00:00`);
  const mondayOffset = (end.getDay() + 6) % 7;
  const start = new Date(end.getTime() - (17 * 7 + mondayOffset) * 86_400_000);
  const days: Array<{ date: string; level: 0 | 1 | 2 | 3 | 4; volumeKg: number }> = [];
  const maxVolume = Math.max(...volumeByDate.values(), 1);
  for (let cursor = start; cursor <= end; cursor = new Date(cursor.getTime() + 86_400_000)) {
    const key = dayKey(cursor);
    const volume = volumeByDate.get(key) ?? 0;
    const level = volume === 0 ? 0 : (Math.min(Math.ceil((volume / maxVolume) * 4), 4) as 1 | 2 | 3 | 4);
    days.push({ date: key, level, volumeKg: volume });
  }
  return days;
}

function trainingStreak(activeDates: Set<string>): number {
  const cursor = new Date(`${localToday()}T12:00:00`);
  if (!activeDates.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (activeDates.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function Change({ value, estimated = false }: { value: number | null; estimated?: boolean }) {
  return value === null
    ? <small>needs comparison</small>
    : <small className={value > 0 ? "change-up" : value < 0 ? "change-down" : ""}>{value > 0 ? "+" : ""}{formatNumber(value)} kg{estimated ? " estimated" : ""}</small>;
}

export function ProgressWorkspace({
  initialStrength,
  initialBody,
  workouts,
  metrics,
  stats,
  agents,
  onNavigate,
}: {
  initialStrength: StrengthProgress;
  initialBody: BodyProgress;
  workouts: Workout[];
  metrics: BodyMetric[];
  stats: ProgressStats;
  agents: Agent[];
  onNavigate: (section: AthleteSection) => void;
}) {
  const [range, setRange] = useState<"30" | "90" | "all">("all");
  const [rangedStrength, setRangedStrength] = useState<StrengthProgress | null>(null);
  const [rangedBody, setRangedBody] = useState<BodyProgress | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [metric, setMetric] = useState<"weight" | "e1rm">("weight");
  const [selectedExercises, setSelectedExercises] = useState<string[] | null>(null);

  const strength = range === "all" ? initialStrength : rangedStrength ?? initialStrength;
  const body = range === "all" ? initialBody : rangedBody ?? initialBody;

  async function selectRange(next: "30" | "90" | "all") {
    setRange(next);
    setStatus(null);
    if (next === "all") return;
    setLoading(true);
    try {
      const from = rangeStart(Number(next));
      const [strengthResponse, bodyResponse] = await Promise.all([
        fetchApi(`/api/progress/strength?from=${from}`, strengthProgressResponseSchema),
        fetchApi(`/api/progress/body?from=${from}`, bodyProgressResponseSchema),
      ]);
      setRangedStrength(strengthResponse.summary);
      setRangedBody(bodyResponse.summary);
    } catch (caught) {
      setStatus(caught instanceof ApiRequestError ? caught.message : "Progress data could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  async function copySummary() {
    const leaders = strength.exercises.slice(0, 3).map((item) => `${item.name}: ${item.bestWeightKg ?? "—"} kg best weight, ${item.bestEstimated1RMKg ?? "—"} kg estimated 1RM`).join("; ");
    await navigator.clipboard.writeText(`My logged strength progress — ${leaders}. Total logged volume: ${formatNumber(strength.totalVolumeKg)} kg. Estimated 1RM uses Epley; not a measured max.`);
    setStatus("Strength summary copied with estimate labels.");
  }

  const rangedWorkouts = useMemo(() => {
    const from = strength.range.from;
    return from ? workouts.filter((workout) => dateKey(workout.occurredAt) >= from) : workouts;
  }, [workouts, strength.range.from]);

  const exerciseSeries = useMemo(() => buildExerciseSeries(rangedWorkouts), [rangedWorkouts]);
  const chartableExercises = exerciseSeries.filter((item) => (metric === "weight" ? item.weight : item.e1rm).length > 0);
  const selected = (selectedExercises ?? chartableExercises.slice(0, 3).map((item) => item.name)).filter((name) => chartableExercises.some((item) => item.name === name)).slice(0, 4);
  const curveSeries = selected.map((name) => {
    const entry = chartableExercises.find((item) => item.name === name)!;
    return { name, points: metric === "weight" ? entry.weight : entry.e1rm };
  });

  const heatmapDays = useMemo(() => buildHeatmapDays(workouts), [workouts]);
  const activeDates = useMemo(() => new Set(workouts.map((workout) => dateKey(workout.occurredAt))), [workouts]);
  const streak = trainingStreak(activeDates);
  const activeDaysThisWeek = stats.weeklyActivity.filter((day) => day.workouts > 0).length;

  const totalLogs = workouts.length + metrics.length;
  const agentLogs = workouts.filter((workout) => workout.agentId).length + metrics.filter((metricEntry) => metricEntry.agentId).length;
  const agentShare = totalLogs === 0 ? 0 : agentLogs / totalLogs;

  const records = [...strength.personalRecords].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const volumePoints = strength.volumeTrend.points.map((point) => ({ x: point.weekStart, y: point.volumeKg }));

  const heroStats = [
    { icon: "dumbbell" as const, label: "Logged volume", value: strength.totalVolumeKg, suffix: "kg", detail: strength.volumeTrend.direction === "insufficient_data" ? "Two logged weeks unlock a trend" : `${strength.volumeTrend.changeKg! > 0 ? "+" : ""}${formatNumber(strength.volumeTrend.changeKg!)} kg first week → latest` },
    { icon: "trend" as const, label: "Volume change", value: strength.volumeTrend.changeKg ?? 0, suffix: "kg", signed: true, detail: strength.volumeTrend.changePercent === null ? "Compared weekly volume" : `${strength.volumeTrend.changePercent > 0 ? "+" : ""}${formatNumber(strength.volumeTrend.changePercent)}% across logged weeks` },
    { icon: "trophy" as const, label: "Personal records", value: strength.personalRecords.length, suffix: "", detail: `${strength.exercises.length} exercise${strength.exercises.length === 1 ? "" : "s"} with recorded bests` },
    { icon: "flame" as const, label: "Training streak", value: streak, suffix: streak === 1 ? "day" : "days", detail: `${activeDates.size} active day${activeDates.size === 1 ? "" : "s"} in your log` },
  ];

  return (
    <div className="progress-workspace">
      <section className="workspace-panel section-command-head">
        <div>
          <span className="section-kicker">Proof of work</span>
          <h1>Progress</h1>
          <p>Every chart below is drawn from your stored logs only. Estimated 1RM uses Epley and is always labelled as an estimate.</p>
        </div>
        <button className="secondary-button" type="button" disabled={!strength.exercises.length} onClick={() => void copySummary()}>Copy factual flex</button>
      </section>

      <div className="range-tabs" role="group" aria-label="Progress date range">
        {(["30", "90", "all"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={range === item} onClick={() => void selectRange(item)}>{item === "all" ? "All time" : `${item} days`}</button>
        ))}
      </div>
      {status && <InlineNotice tone={status.startsWith("Strength summary") ? "success" : "info"}>{status}</InlineNotice>}

      {loading ? (
        <section className="workspace-panel inline-loading" role="status"><Spinner label="Loading progress" /></section>
      ) : (
        <div className="progress-animate" key={range}>
          <section className="progress-hero-grid" aria-label="Progress highlights">
            {heroStats.map((stat) => (
              <article className="workspace-panel progress-stat" key={stat.label}>
                <div className="progress-stat-head"><span>{stat.label}</span><Icon name={stat.icon} size={18} /></div>
                <strong>
                  {stat.signed && stat.value > 0 ? "+" : ""}<AnimatedNumber value={stat.value} />{stat.suffix && <small> {stat.suffix}</small>}
                </strong>
                <p>{stat.detail}</p>
              </article>
            ))}
          </section>

          <section className="progress-main-grid">
            <article className="workspace-panel progress-panel">
              <div className="subsection-head">
                <div><span className="section-kicker">Training volume</span><h2>Weekly kilograms lifted</h2></div>
                <span>{strength.workoutCount} workouts</span>
              </div>
              {volumePoints.length === 0
                ? <ChartEmpty icon={<Icon name="dumbbell" size={26} />} title="No volume logged yet" hint="Log a workout manually or through an MCP agent and this chart comes alive." />
                : <VolumeBars label="Weekly training volume" bars={volumePoints} unit="kg" />}
            </article>
            <article className="workspace-panel progress-panel progress-consistency">
              <div className="subsection-head">
                <div><span className="section-kicker">This week</span><h2>Consistency</h2></div>
              </div>
              <ProgressRing value={activeDaysThisWeek / 7} label={`${activeDaysThisWeek}/7`} sublabel="active days" />
              <p className="consistency-note">{stats.weeklyWorkouts} workout{stats.weeklyWorkouts === 1 ? "" : "s"} · {formatNumber(stats.weeklyVolumeKg)} kg this week</p>
            </article>
          </section>

          <section className="workspace-panel progress-panel progress-curves-panel">
            <div className="subsection-head">
              <div><span className="section-kicker">Strength curves</span><h2>{metric === "weight" ? "Session best weight" : "Estimated 1RM (Epley)"} per exercise</h2></div>
              <div className="curve-controls" role="group" aria-label="Curve metric">
                <button type="button" aria-pressed={metric === "weight"} onClick={() => setMetric("weight")}>Best weight</button>
                <button type="button" aria-pressed={metric === "e1rm"} onClick={() => setMetric("e1rm")}>Est. 1RM</button>
              </div>
            </div>
            {exerciseSeries.length > 1 && (
              <div className="exercise-chips" role="group" aria-label="Exercises on chart">
                {exerciseSeries.slice(0, 8).map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    aria-pressed={selected.includes(item.name)}
                    onClick={() => setSelectedExercises((current) => {
                      const base = (current ?? chartableExercises.slice(0, 3).map((entry) => entry.name)).filter((name) => chartableExercises.some((entry) => entry.name === name));
                      return base.includes(item.name) ? base.filter((name) => name !== item.name) : [...base, item.name].slice(-4);
                    })}
                  >{item.name}</button>
                ))}
              </div>
            )}
            {curveSeries.length === 0
              ? <ChartEmpty icon={<Icon name="trend" size={26} />} title="No weighted sets in this range" hint={strength.dataQuality.message} />
              : <MultiLineChart label={`Per-exercise ${metric === "weight" ? "best weight" : "estimated 1RM"} over time`} series={curveSeries} unit="kg" />}
            <p className="estimate-help">Per-session bests computed from your logged sets. {strength.formula.estimated1RM}.</p>
          </section>

          <section className="progress-body-grid" aria-label="Body composition trends">
            {([
              { label: "Weight", series: body.weight, color: "var(--acid)" },
              { label: "Body fat", series: body.bodyFat, color: "var(--ice)" },
              { label: "Waist", series: body.waist, color: "var(--amber)" },
            ] as const).map(({ label, series, color }) => (
              <article className="workspace-panel progress-panel body-trend-card" key={label}>
                <div className="body-trend-head">
                  <span>{label} · {series.unit}</span>
                  <strong>{series.latest === null ? "—" : formatNumber(series.latest)}</strong>
                  <p>{series.change === null ? "Trend needs more data" : <>{series.change > 0 ? "+" : ""}{formatNumber(series.change)} {series.unit} <small>in range</small></>}</p>
                </div>
                {series.points.length >= 2
                  ? <TrendChart label={`${label} over time`} points={series.points.map((point) => ({ x: point.recordedAt, y: point.value }))} unit={series.unit} color={color} />
                  : <ChartEmpty icon={<Icon name="body" size={24} />} title="Not enough points" hint="Record another measurement to draw this trend." />}
              </article>
            ))}
          </section>

          <section className="progress-lower-grid">
            <article className="workspace-panel progress-panel">
              <div className="subsection-head">
                <div><span className="section-kicker">Last 18 weeks</span><h2>Training consistency</h2></div>
                <span>{activeDates.size} active days</span>
              </div>
              <ConsistencyHeatmap days={heatmapDays} label="Daily training volume, last 18 weeks" />
            </article>
            <article className="workspace-panel progress-panel">
              <div className="subsection-head">
                <div><span className="section-kicker">Record wall</span><h2>Personal records</h2></div>
                <span>{records.length}</span>
              </div>
              {records.length === 0
                ? <ChartEmpty icon={<Icon name="trophy" size={26} />} title="No records yet" hint="Records are counted from your logged working sets — the first one lands here." />
                : (
                  <div className="record-wall">
                    {records.slice(0, 6).map((record, index) => (
                      <article className="record-card" key={`${record.exerciseName}-${record.type}-${record.occurredAt}`} style={{ animationDelay: `${index * 80}ms` }}>
                        <span className="record-icon"><Icon name="trophy" size={16} /></span>
                        <div>
                          <strong>{record.exerciseName}</strong>
                          <small>{new Date(record.occurredAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</small>
                        </div>
                        <div className="record-value">
                          <strong><AnimatedNumber value={record.valueKg} /> <small>kg</small></strong>
                          <span className={record.estimated ? "record-badge record-estimated" : "record-badge"}>{record.estimated ? "Est. 1RM" : "Measured"}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
            </article>
          </section>

          {strength.exercises.length > 0 && (
            <section className="workspace-panel strength-table progress-panel">
              <div className="subsection-head">
                <div><span className="section-kicker">Since first log</span><h2>Exercise records</h2></div>
                <span title={strength.formula.estimated1RM}>Estimated 1RM · help</span>
              </div>
              <div className="table-scroll">
                <table>
                  <thead><tr><th scope="col">Exercise</th><th scope="col">Best weight</th><th scope="col">Best estimated 1RM</th><th scope="col">First → latest weight</th><th scope="col">First → latest estimated 1RM</th><th scope="col">Records</th></tr></thead>
                  <tbody>
                    {strength.exercises.map((item) => (
                      <tr key={item.name}>
                        <th scope="row">{item.name}<small>{item.sessions} session{item.sessions === 1 ? "" : "s"}</small></th>
                        <td>{item.bestWeightKg === null ? "—" : `${formatNumber(item.bestWeightKg)} kg`}</td>
                        <td>{item.bestEstimated1RMKg === null ? "—" : `${formatNumber(item.bestEstimated1RMKg)} kg`}<small>estimated</small></td>
                        <td>{item.firstBestWeightKg ?? "—"} → {item.latestBestWeightKg ?? "—"} kg <Change value={item.weightChangeKg} /></td>
                        <td>{item.firstEstimated1RMKg ?? "—"} → {item.latestEstimated1RMKg ?? "—"} kg <Change value={item.estimated1RMChangeKg} estimated /></td>
                        <td><div className="pr-badges">{item.badges.includes("weight_pr") && <span>Weight PR</span>}{item.badges.includes("estimated_1rm_pr") && <span title="Highest Epley estimate in logged data">Est. 1RM PR</span>}{item.badges.length === 0 && "—"}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="estimate-help">{strength.dataQuality.message} Formula: {strength.formula.estimated1RM}.</p>
            </section>
          )}

          <section className="provenance-strip" aria-label="Data provenance">
            <span className="provenance-icon"><Icon name="agent" size={20} /></span>
            <div className="provenance-copy">
              <strong>{agentLogs === 0 ? "Every record here is human-entered" : `${formatNumber(agentLogs)} of ${totalLogs} records written by MCP agents`}</strong>
              <p>{agents.length === 0 ? "Connect an agent and it can write training, body, and nutrition logs straight into these charts." : `${agents.length} scoped agent${agents.length === 1 ? "" : "s"} connected · ${agents.slice(0, 3).map((agent) => agent.name).join(", ")}${agents.length > 3 ? "…" : ""}`}</p>
            </div>
            <span className="provenance-meter" aria-label={`${Math.round(agentShare * 100)} percent of records written by agents`}><i style={{ width: `${agentShare * 100}%` }} /></span>
            <button className="text-button" type="button" onClick={() => onNavigate("agents")}>Manage agents <Icon name="arrow" size={14} /></button>
          </section>
        </div>
      )}
    </div>
  );
}
