"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { ApiGuide } from "@/components/api-guide";
import {
  agentsResponseSchema,
  ApiRequestError,
  fetchApi,
  metricsResponseSchema,
  statsResponseSchema,
  statusResponseSchema,
  workoutsResponseSchema,
  type Agent,
  type BodyMetric,
  type ProgressStats,
  type PublicUser,
  type StorageStatus,
  type Workout,
} from "@/components/client-api";
import { AgentPanel, MetricForm, WorkoutForm } from "@/components/dashboard-forms";
import { Brand, Icon, InlineNotice, Spinner } from "@/components/ui";

type DashboardSection = "overview" | "workout" | "metrics" | "agents" | "api";

interface DashboardData {
  workouts: Workout[];
  metrics: BodyMetric[];
  agents: Agent[];
  stats: ProgressStats;
  storage: StorageStatus;
}

const emptyStats: ProgressStats = {
  totalWorkouts: 0,
  weeklyWorkouts: 0,
  totalVolumeKg: 0,
  weeklyVolumeKg: 0,
  currentWeightKg: null,
  weightChangeKg: null,
  weeklyActivity: [],
};

function formatVolume(value: number): string {
  return value >= 1000 ? `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value / 1000)}k` : new Intl.NumberFormat("en").format(value);
}

function workoutSetCount(workout: Workout): number {
  return workout.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
}
async function fetchDashboardData(): Promise<DashboardData> {
  const [workouts, metrics, agents, stats, status] = await Promise.all([
    fetchApi("/api/workouts?limit=20", workoutsResponseSchema),
    fetchApi("/api/metrics?limit=100", metricsResponseSchema),
    fetchApi("/api/agents", agentsResponseSchema),
    fetchApi("/api/stats", statsResponseSchema),
    fetchApi("/api/status", statusResponseSchema),
  ]);
  return {
    workouts: workouts.workouts,
    metrics: metrics.metrics,
    agents: agents.agents,
    stats: stats.stats,
    storage: status.storage,
  };
}


export function Dashboard({ user, onSignedOut }: { user: PublicUser; onSignedOut: () => void }) {
  const [section, setSection] = useState<DashboardSection>("overview");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      setData(await fetchDashboardData());
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.status === 401) {
        onSignedOut();
        return;
      }
      setError(caught instanceof Error ? caught.message : "Dashboard data could not be loaded");
    } finally {
      setLoading(false);
    }
  }, [onSignedOut]);

  useEffect(() => {
    let active = true;
    void fetchDashboardData()
      .then((dashboardData) => {
        if (active) setData(dashboardData);
      })
      .catch((caught: unknown) => {
        if (!active) return;
        if (caught instanceof ApiRequestError && caught.status === 401) {
          onSignedOut();
          return;
        }
        setError(caught instanceof Error ? caught.message : "Dashboard data could not be loaded");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onSignedOut]);

  async function logout() {
    try {
      await fetchApi("/api/auth/session", z.object({ ok: z.literal(true) }), { method: "DELETE" });
    } finally {
      onSignedOut();
    }
  }

  async function saved(nextSection: DashboardSection = "overview") {
    await loadData();
    setSection(nextSection);
  }

  const stats = data?.stats ?? emptyStats;
  const maxDayVolume = useMemo(() => Math.max(...stats.weeklyActivity.map((day) => day.volumeKg), 1), [stats.weeklyActivity]);
  const firstName = user.name.split(" ")[0];

  return (
    <div className="dashboard-shell">
      <header className="dashboard-topbar">
        <Brand />
        <div className="topbar-right">
          {data?.storage && <span className={`storage-badge ${data.storage.durable ? "storage-durable" : "storage-demo"}`} title={data.storage.notice}><span className="status-dot" />{data.storage.durable ? "Local file" : "Demo storage"}</span>}
          <span className="user-chip"><span>{user.name.slice(0, 1).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></span>
          <button className="text-button" type="button" onClick={logout}>Sign out</button>
        </div>
      </header>
      <div className="dashboard-grid">
        <aside className="sidebar">
          <nav aria-label="Dashboard navigation">
            <button type="button" className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}><Icon name="activity" /><span>Overview</span></button>
            <button type="button" className={section === "workout" ? "active" : ""} onClick={() => setSection("workout")}><Icon name="dumbbell" /><span>Log workout</span></button>
            <button type="button" className={section === "metrics" ? "active" : ""} onClick={() => setSection("metrics")}><Icon name="body" /><span>Body metrics</span></button>
            <button type="button" className={section === "agents" ? "active" : ""} onClick={() => setSection("agents")}><Icon name="agent" /><span>Agents</span></button>
            <button type="button" className={section === "api" ? "active" : ""} onClick={() => setSection("api")}><Icon name="code" /><span>API guide</span></button>
          </nav>
          <div className="sidebar-card"><Icon name="shield" /><strong>Owner controlled</strong><p>Every agent is bound to your account and explicit scopes.</p><button type="button" onClick={() => setSection("agents")}>Manage access <Icon name="arrow" size={15} /></button></div>
        </aside>

        <main className="dashboard-main">
          {loading ? <DashboardSkeleton /> : error ? <div className="state-card"><Icon name="activity" size={28} /><h1>Couldn’t load the workspace</h1><p>{error}</p><button className="primary-button" type="button" onClick={() => void loadData(true)}><Spinner label="Try again" /></button></div> : (
            <>
              {data?.storage && !data.storage.durable && <InlineNotice tone="info"><strong>Demo persistence:</strong> {data.storage.notice}</InlineNotice>}
              {section === "overview" && <Overview firstName={firstName} data={data} maxDayVolume={maxDayVolume} onNavigate={setSection} />}
              {section === "workout" && <WorkoutForm onSaved={() => saved("overview")} onCancel={() => setSection("overview")} />}
              {section === "metrics" && <MetricWorkspace metrics={data?.metrics ?? []} onSaved={() => saved("metrics")} onCancel={() => setSection("overview")} />}
              {section === "agents" && <AgentPanel agents={data?.agents ?? []} onSaved={() => saved("agents")} />}
              {section === "api" && <div className="workspace-panel guide-workspace"><ApiGuide compact /></div>}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return <div className="dashboard-skeleton" aria-label="Loading dashboard"><div className="skeleton-line skeleton-title" /><div className="skeleton-grid">{[1, 2, 3, 4].map((item) => <div className="skeleton-card" key={item} />)}</div><div className="skeleton-large" /></div>;
}

function Overview({ firstName, data, maxDayVolume, onNavigate }: { firstName: string; data: DashboardData | null; maxDayVolume: number; onNavigate: (section: DashboardSection) => void }) {
  const stats = data?.stats ?? emptyStats;
  const workouts = data?.workouts ?? [];
  return (
    <div className="overview-workspace">
      <section className="dashboard-heading"><div><span className="section-kicker">Training command</span><h1>Good to see you, {firstName}.</h1><p>{workouts.length ? "Your latest training signal is ready." : "Your ledger is ready for its first session."}</p></div><div className="heading-actions"><button className="secondary-button" type="button" onClick={() => onNavigate("metrics")}><Icon name="body" size={17} /> Record metrics</button><button className="primary-button" type="button" onClick={() => onNavigate("workout")}><Icon name="plus" size={17} /> Log workout</button></div></section>

      <section className="metric-cards" aria-label="Progress summary">
        <article><div><span>This week</span><Icon name="dumbbell" /></div><strong>{stats.weeklyWorkouts}</strong><p>workout{stats.weeklyWorkouts === 1 ? "" : "s"}</p></article>
        <article><div><span>Weekly volume</span><Icon name="activity" /></div><strong>{formatVolume(stats.weeklyVolumeKg)}</strong><p>kilograms moved</p></article>
        <article><div><span>Current weight</span><Icon name="body" /></div><strong>{stats.currentWeightKg === null ? "—" : stats.currentWeightKg}</strong><p>{stats.currentWeightKg === null ? "No entry yet" : "kilograms"}</p></article>
        <article><div><span>All-time sessions</span><Icon name="spark" /></div><strong>{stats.totalWorkouts}</strong><p>{formatVolume(stats.totalVolumeKg)} kg total volume</p></article>
      </section>

      <div className="overview-grid">
        <section className="chart-card">
          <div className="panel-head"><div><span className="section-kicker">Weekly load</span><h2>Volume by day</h2></div><span className="panel-total">{formatVolume(stats.weeklyVolumeKg)} <small>kg</small></span></div>
          {stats.weeklyActivity.length === 0 ? <div className="chart-empty">No weekly activity yet</div> : <div className="bar-chart" role="img" aria-label="Weekly workout volume bar chart">{stats.weeklyActivity.map((day) => { const height = day.volumeKg === 0 ? 3 : Math.max((day.volumeKg / maxDayVolume) * 100, 8); return <div className="bar-column" key={day.date}><span className="bar-value">{day.volumeKg ? formatVolume(day.volumeKg) : ""}</span><div className="bar-track"><i style={{ height: `${height}%` }} className={day.volumeKg ? "has-volume" : ""} /></div><span>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString("en", { weekday: "short" }).slice(0, 2)}</span></div>; })}</div>}
          <div className="chart-foot"><span><i /> Recorded volume</span><p>Volume = reps × weight</p></div>
        </section>

        <section className="quick-card"><div className="panel-head"><div><span className="section-kicker">Next move</span><h2>Quick actions</h2></div></div><button type="button" onClick={() => onNavigate("workout")}><span><Icon name="dumbbell" /><span><strong>Log training</strong><small>Add exercises and working sets</small></span></span><Icon name="arrow" /></button><button type="button" onClick={() => onNavigate("metrics")}><span><Icon name="body" /><span><strong>Record body signal</strong><small>Weight, body fat, or waist</small></span></span><Icon name="arrow" /></button><button type="button" onClick={() => onNavigate("agents")}><span><Icon name="agent" /><span><strong>Connect an agent</strong><small>Issue a scoped credential</small></span></span><Icon name="arrow" /></button></section>
      </div>

      <section className="recent-card"><div className="panel-head"><div><span className="section-kicker">Ledger</span><h2>Recent activity</h2></div>{workouts.length > 0 && <span>{workouts.length} shown</span>}</div>{workouts.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icon name="dumbbell" size={28} /></span><h3>No workouts recorded</h3><p>Start with today’s session. Your volume chart and recent activity will update immediately.</p><button className="primary-button" type="button" onClick={() => onNavigate("workout")}><Icon name="plus" size={17} /> Log first workout</button></div> : <div className="workout-table"><div className="table-head"><span>Session</span><span>Exercises</span><span>Sets</span><span>Duration</span><span>Date</span></div>{workouts.slice(0, 8).map((workout) => <article key={workout.id}><span><i><Icon name="dumbbell" size={17} /></i><span><strong>{workout.title}</strong><small>{workout.exercises.map((exercise) => exercise.name).join(" · ")}</small></span></span><span>{workout.exercises.length}</span><span>{workoutSetCount(workout)}</span><span>{workout.durationMinutes ? `${workout.durationMinutes} min` : "—"}</span><span>{new Date(workout.occurredAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></article>)}</div>}</section>
    </div>
  );
}

function MetricWorkspace({ metrics, onSaved, onCancel }: { metrics: BodyMetric[]; onSaved: () => Promise<void>; onCancel: () => void }) {
  return <div className="metric-workspace-grid"><MetricForm onSaved={onSaved} onCancel={onCancel} /><section className="metric-history workspace-panel"><div className="subsection-head"><div><span className="section-kicker">History</span><h2>Recent measurements</h2></div><span>{metrics.length}</span></div>{metrics.length === 0 ? <div className="empty-compact"><Icon name="body" /><strong>No measurements yet</strong><p>Your first entry will appear here.</p></div> : <div className="metric-history-list">{metrics.slice(0, 12).map((metric) => <article key={metric.id}><time>{new Date(metric.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time><div>{metric.weightKg !== undefined && <span><strong>{metric.weightKg}</strong> kg</span>}{metric.bodyFatPercent !== undefined && <span><strong>{metric.bodyFatPercent}</strong> % fat</span>}{metric.waistCm !== undefined && <span><strong>{metric.waistCm}</strong> cm waist</span>}</div>{metric.notes && <p>{metric.notes}</p>}</article>)}</div>}</section></div>;
}
