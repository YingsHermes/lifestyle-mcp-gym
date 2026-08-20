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
import { Brand, Icon, InlineNotice } from "@/components/ui";

type DashboardSection = "overview" | "workout" | "metrics" | "agents" | "api";

interface DashboardData {
  workouts: Workout[];
  metrics: BodyMetric[];
  agents: Agent[];
  stats: ProgressStats;
  storage: StorageStatus;
}
interface ActivityEvent {
  id: string;
  type: "agent" | "metric" | "workout";
  occurredAt: string;
  title: string;
  detail: string;
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
function formatRelativeTime(value: string): string {
  const elapsedMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  const elapsedDays = Math.round(elapsedHours / 24);
  if (elapsedDays < 7) return `${elapsedDays}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
          {data?.storage && <span className={`storage-badge ${data.storage.durable ? "storage-durable" : "storage-demo"}`} title={data.storage.notice}><span className="status-dot" />{data.storage.mode === "supabase" ? "Supabase" : data.storage.durable ? "Local file" : "Demo storage"}</span>}
          <span className={`mcp-badge ${data?.agents.length ? "mcp-connected" : ""}`} aria-label={data?.agents.length ? `${data.agents.length} agents connected to MCP` : "MCP ready for an agent connection"}><span className="status-dot" />MCP {data?.agents.length ? "connected" : "ready"}</span>
          <span className="user-chip"><span>{user.name.slice(0, 1).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></span>
          <button className="text-button" type="button" onClick={logout}>Sign out</button>
        </div>
      </header>
      <div className="dashboard-grid">
        <aside className="sidebar">
          <nav aria-label="Dashboard navigation">
            <button type="button" aria-current={section === "overview" ? "page" : undefined} className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}><Icon name="activity" /><span>Overview</span></button>
            <button type="button" aria-current={section === "workout" ? "page" : undefined} className={section === "workout" ? "active" : ""} onClick={() => setSection("workout")}><Icon name="dumbbell" /><span>Log workout</span></button>
            <button type="button" aria-current={section === "metrics" ? "page" : undefined} className={section === "metrics" ? "active" : ""} onClick={() => setSection("metrics")}><Icon name="body" /><span>Body metrics</span></button>
            <button type="button" aria-current={section === "agents" ? "page" : undefined} className={section === "agents" ? "active" : ""} onClick={() => setSection("agents")}><Icon name="agent" /><span>Agents</span></button>
            <button type="button" aria-current={section === "api" ? "page" : undefined} className={section === "api" ? "active" : ""} onClick={() => setSection("api")}><Icon name="code" /><span>API guide</span></button>
          </nav>
          <div className="sidebar-card"><Icon name="shield" /><strong>Owner controlled</strong><p>Every agent is bound to your account and explicit scopes.</p><button type="button" onClick={() => setSection("agents")}>Manage access <Icon name="arrow" size={15} /></button></div>
        </aside>

        <main className="dashboard-main">
          {loading ? <DashboardSkeleton /> : error ? <div className="state-card" role="alert"><Icon name="activity" size={28} /><span className="section-kicker">Signal interrupted</span><h1>Couldn’t load the workspace</h1><p>{error}</p><button className="primary-button" type="button" onClick={() => void loadData(true)}><Icon name="activity" size={17} /> Try again</button></div> : (
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
  return <div className="dashboard-skeleton" role="status" aria-live="polite" aria-label="Loading dashboard"><div className="skeleton-line skeleton-title" /><div className="skeleton-grid">{[1, 2, 3, 4].map((item) => <div className="skeleton-card" key={item} />)}</div><div className="skeleton-large" /><span className="sr-only">Loading training signals</span></div>;
}

function Overview({ firstName, data, maxDayVolume, onNavigate }: { firstName: string; data: DashboardData | null; maxDayVolume: number; onNavigate: (section: DashboardSection) => void }) {
  const stats = data?.stats ?? emptyStats;
  const workouts = data?.workouts ?? [];
  const metrics = data?.metrics ?? [];
  const agents = data?.agents ?? [];
  const activeDays = stats.weeklyActivity.filter((day) => day.workouts > 0).length;
  const cadenceProgress = Math.round((activeDays / 7) * 100);
  const usedAgents = agents.filter((agent) => agent.lastUsedAt);
  const events: ActivityEvent[] = [
    ...workouts.map((workout) => ({
      id: `workout-${workout.id}`,
      type: "workout" as const,
      occurredAt: workout.occurredAt,
      title: workout.title,
      detail: `${workout.exercises.length} exercise${workout.exercises.length === 1 ? "" : "s"} · ${workoutSetCount(workout)} working sets`,
    })),
    ...metrics.map((metric) => {
      const measurements = [
        metric.weightKg === undefined ? null : `${metric.weightKg} kg`,
        metric.bodyFatPercent === undefined ? null : `${metric.bodyFatPercent}% body fat`,
        metric.waistCm === undefined ? null : `${metric.waistCm} cm waist`,
      ].filter((measurement): measurement is string => Boolean(measurement));
      return {
        id: `metric-${metric.id}`,
        type: "metric" as const,
        occurredAt: metric.recordedAt,
        title: "Body signal recorded",
        detail: measurements.join(" · "),
      };
    }),
    ...agents.map((agent) => ({
      id: `agent-${agent.id}`,
      type: "agent" as const,
      occurredAt: agent.lastUsedAt ?? agent.createdAt,
      title: agent.lastUsedAt ? `${agent.name} checked in` : `${agent.name} connected`,
      detail: agent.lastUsedAt ? "Authenticated MCP activity" : `${agent.scopes.length} scoped permissions`,
    })),
  ].toSorted((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 8);

  return (
    <div className="overview-workspace">
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="dashboard-hero-copy">
          <span className="live-kicker"><i aria-hidden="true" /> Training command online</span>
          <h1 id="dashboard-title">Move with intent, <span>{firstName}.</span></h1>
          <p>{workouts.length ? "Your training ledger is current. Review the signal, then make the next move." : "Your workspace is ready. Log a first session or let a scoped agent start the record."}</p>
          <div className="heading-actions">
            <button className="secondary-button" type="button" onClick={() => onNavigate("metrics")}><Icon name="body" size={17} /> Record metrics</button>
            <button className="primary-button" type="button" onClick={() => onNavigate("workout")}><Icon name="plus" size={17} /> Log workout</button>
          </div>
        </div>
        <div className="system-orbit-card" role="status" aria-label={agents.length ? `${agents.length} agents connected; MCP endpoint ready` : "MCP endpoint ready; no agents connected"}>
          <div className="agent-orbit" aria-hidden="true">
            <span className="orbit-ring" />
            <span className="orbit-node" />
            <span className="orbit-core"><Icon name="agent" size={22} /></span>
          </div>
          <div>
            <span className="section-kicker">Agent network</span>
            <strong>{agents.length ? "Connection healthy" : "Ready to connect"}</strong>
            <p><code>/api/mcp</code> · {agents.length} registered · {usedAgents.length} active</p>
          </div>
          <span className="health-pill"><i /> Live</span>
        </div>
      </section>

      <section className="metric-cards" aria-label="Progress summary">
        <article><div><span>This week</span><Icon name="dumbbell" /></div><strong>{stats.weeklyWorkouts}</strong><p>workout{stats.weeklyWorkouts === 1 ? "" : "s"} · {activeDays}/7 active days</p></article>
        <article><div><span>Weekly volume</span><Icon name="activity" /></div><strong>{formatVolume(stats.weeklyVolumeKg)}</strong><p>kg moved this week</p></article>
        <article><div><span>Current weight</span><Icon name="body" /></div><strong>{stats.currentWeightKg === null ? "—" : stats.currentWeightKg}</strong><p>{stats.currentWeightKg === null ? "No entry yet" : stats.weightChangeKg === null ? "kg current" : `${stats.weightChangeKg > 0 ? "+" : ""}${stats.weightChangeKg} kg change`}</p></article>
        <article><div><span>Agent pulse</span><Icon name="agent" /></div><strong>{usedAgents.length}/{agents.length}</strong><p>{agents.length ? "agents have checked in" : "Connect your first agent"}</p></article>
      </section>

      <div className="overview-grid">
        <section className="chart-card">
          <div className="panel-head"><div><span className="section-kicker">Weekly load</span><h2>Volume by day</h2></div><span className="panel-total">{formatVolume(stats.weeklyVolumeKg)} <small>kg</small></span></div>
          {stats.weeklyActivity.length === 0 ? <div className="chart-empty"><span>No weekly activity yet</span><small>Your first weighted sets will draw the signal.</small></div> : <div className="bar-chart" role="img" aria-label="Weekly workout volume bar chart">{stats.weeklyActivity.map((day) => { const height = day.volumeKg === 0 ? 3 : Math.max((day.volumeKg / maxDayVolume) * 100, 8); return <div className="bar-column" key={day.date}><span className="bar-value">{day.volumeKg ? formatVolume(day.volumeKg) : ""}</span><div className="bar-track"><i style={{ height: `${height}%` }} className={day.volumeKg ? "has-volume" : ""} /></div><span>{new Date(`${day.date}T12:00:00Z`).toLocaleDateString("en", { weekday: "short" }).slice(0, 2)}</span></div>; })}</div>}
          <div className="chart-foot"><span><i /> Recorded volume</span><p>Volume = reps × weight</p></div>
        </section>

        <div className="overview-side-stack">
          <section className="cadence-card">
            <div className="cadence-ring">
              <svg viewBox="0 0 44 44" role="img" aria-label={`${activeDays} active training days this week`}>
                <circle className="cadence-track" cx="22" cy="22" r="18" pathLength="100" />
                <circle className="cadence-value" cx="22" cy="22" r="18" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - cadenceProgress} />
              </svg>
              <strong>{activeDays}<small>/7</small></strong>
            </div>
            <div><span className="section-kicker">Weekly cadence</span><h2>{activeDays === 0 ? "Start the rhythm" : activeDays >= 4 ? "Momentum held" : "Rhythm building"}</h2><p>Active days recorded across the current week.</p></div>
          </section>
          <section className="quick-card"><div className="panel-head"><div><span className="section-kicker">Next move</span><h2>Quick actions</h2></div></div><button type="button" onClick={() => onNavigate("workout")}><span><Icon name="dumbbell" /><span><strong>Log training</strong><small>Add exercises and working sets</small></span></span><Icon name="arrow" /></button><button type="button" onClick={() => onNavigate("metrics")}><span><Icon name="body" /><span><strong>Record body signal</strong><small>Weight, body fat, or waist</small></span></span><Icon name="arrow" /></button><button type="button" onClick={() => onNavigate("agents")}><span><Icon name="agent" /><span><strong>Manage agent access</strong><small>Scopes, credentials, and health</small></span></span><Icon name="arrow" /></button></section>
        </div>
      </div>

      <section className="recent-card activity-card">
        <div className="panel-head"><div><span className="section-kicker">Live ledger</span><h2>Activity timeline</h2></div><span>{events.length ? `${events.length} latest signals` : "Waiting for signal"}</span></div>
        {events.length === 0 ? (
          <div className="empty-state"><span className="empty-icon"><Icon name="activity" size={28} /></span><h3>The ledger is listening</h3><p>Log a workout, record a body signal, or connect an agent. New activity will appear here in time order.</p><button className="primary-button" type="button" onClick={() => onNavigate("workout")}><Icon name="plus" size={17} /> Log first workout</button></div>
        ) : (
          <ol className="activity-timeline">
            {events.map((event) => <li key={event.id}><span className={`timeline-icon timeline-${event.type}`}><Icon name={event.type === "workout" ? "dumbbell" : event.type === "metric" ? "body" : "agent"} size={17} /></span><div><span><strong>{event.title}</strong><time dateTime={event.occurredAt}>{formatRelativeTime(event.occurredAt)}</time></span><p>{event.detail}</p></div></li>)}
          </ol>
        )}
      </section>
    </div>
  );
}

function MetricWorkspace({ metrics, onSaved, onCancel }: { metrics: BodyMetric[]; onSaved: () => Promise<void>; onCancel: () => void }) {
  return <div className="metric-workspace-grid"><MetricForm onSaved={onSaved} onCancel={onCancel} /><section className="metric-history workspace-panel"><div className="subsection-head"><div><span className="section-kicker">History</span><h2>Recent measurements</h2></div><span>{metrics.length}</span></div>{metrics.length === 0 ? <div className="empty-compact"><Icon name="body" /><strong>No measurements yet</strong><p>Your first entry will appear here.</p></div> : <div className="metric-history-list">{metrics.slice(0, 12).map((metric) => <article key={metric.id}><time>{new Date(metric.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time><div>{metric.weightKg !== undefined && <span><strong>{metric.weightKg}</strong> kg</span>}{metric.bodyFatPercent !== undefined && <span><strong>{metric.bodyFatPercent}</strong> % fat</span>}{metric.waistCm !== undefined && <span><strong>{metric.waistCm}</strong> cm waist</span>}</div>{metric.notes && <p>{metric.notes}</p>}</article>)}</div>}</section></div>;
}
