"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { ApiGuide } from "@/components/api-guide";
import {
  AthleteOverview,
  BodyProgressWorkspace,
  EditableNutritionEntries,
  TrainingWorkspace,
  type AthleteSection,
} from "@/components/athlete-sections";
import { ProgressWorkspace } from "@/components/progress-section";
import { NotesWorkspace } from "@/components/notes-workspace";
import {
  agentsResponseSchema,
  bodyProgressResponseSchema,
  ApiRequestError,
  fetchApi,
  metricsResponseSchema,
  nutritionProfileResponseSchema,
  nutritionSummaryResponseSchema,
  statsResponseSchema,
  statusResponseSchema,
  strengthProgressResponseSchema,
  workoutsResponseSchema,
  type Agent,
  type BodyMetric,
  type BodyProgress,
  type NutritionProfile,
  type NutritionSummary,
  type ProgressStats,
  type PublicUser,
  type StorageStatus,
  type StrengthProgress,
  type Workout,
} from "@/components/client-api";
import { AgentPanel, FoodLogForm, MetricForm, NutritionProfileForm, WorkoutForm } from "@/components/dashboard-forms";
import { Brand, Icon, InlineNotice } from "@/components/ui";


interface DashboardData {
  workouts: Workout[];
  metrics: BodyMetric[];
  agents: Agent[];
  stats: ProgressStats;
  storage: StorageStatus;
  nutritionProfile: NutritionProfile | null;
  nutritionSummary: NutritionSummary;
  bodyProgress: BodyProgress;
  strengthProgress: StrengthProgress;
}



async function fetchDashboardData(): Promise<DashboardData> {
  const [workouts, metrics, agents, stats, status, nutritionProfile, nutritionSummary, bodyProgress, strengthProgress] = await Promise.all([
    fetchApi("/api/workouts?limit=100", workoutsResponseSchema),
    fetchApi("/api/metrics?limit=500", metricsResponseSchema),
    fetchApi("/api/agents", agentsResponseSchema),
    fetchApi("/api/stats", statsResponseSchema),
    fetchApi("/api/status", statusResponseSchema),
    fetchApi("/api/nutrition/profile", nutritionProfileResponseSchema),
    fetchApi("/api/nutrition/summary", nutritionSummaryResponseSchema),
    fetchApi("/api/progress/body", bodyProgressResponseSchema),
    fetchApi("/api/progress/strength", strengthProgressResponseSchema),
  ]);
  return {
    workouts: workouts.workouts,
    metrics: metrics.metrics,
    agents: agents.agents,
    stats: stats.stats,
    storage: status.storage,
    nutritionProfile: nutritionProfile.profile,
    nutritionSummary: nutritionSummary.summary,
    bodyProgress: bodyProgress.summary,
    strengthProgress: strengthProgress.summary,
  };
}


export function Dashboard({ user, onSignedOut }: { user: PublicUser; onSignedOut: () => void }) {
  const [section, setSection] = useState<AthleteSection>("today");
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

  async function saved(nextSection: AthleteSection = "today") {
    await loadData();
    setSection(nextSection);
  }

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
            <button type="button" aria-current={section === "today" ? "page" : undefined} className={section === "today" ? "active" : ""} onClick={() => setSection("today")}><Icon name="activity" /><span>Today</span></button>
            <button type="button" aria-current={section === "training" || section === "workout" ? "page" : undefined} className={section === "training" || section === "workout" ? "active" : ""} onClick={() => setSection("training")}><Icon name="dumbbell" /><span>Training</span></button>
            <button type="button" aria-current={section === "nutrition" ? "page" : undefined} className={section === "nutrition" ? "active" : ""} onClick={() => setSection("nutrition")}><Icon name="spark" /><span>Nutrition</span></button>
            <button type="button" aria-current={section === "notes" ? "page" : undefined} className={section === "notes" ? "active" : ""} onClick={() => setSection("notes")}><Icon name="note" /><span>Notes</span></button>
            <button type="button" aria-current={section === "body" || section === "metrics" ? "page" : undefined} className={section === "body" || section === "metrics" ? "active" : ""} onClick={() => setSection("body")}><Icon name="body" /><span>Body</span></button>
            <button type="button" aria-current={section === "progress" ? "page" : undefined} className={section === "progress" ? "active" : ""} onClick={() => setSection("progress")}><Icon name="trend" /><span>Progress</span></button>
            <button type="button" aria-current={section === "agents" ? "page" : undefined} className={section === "agents" ? "active" : ""} onClick={() => setSection("agents")}><Icon name="agent" /><span>Agents / API</span></button>
          </nav>
          <div className="sidebar-card"><Icon name="shield" /><strong>Owner controlled</strong><p>Every agent is bound to your account and explicit scopes.</p><button type="button" onClick={() => setSection("agents")}>Manage access <Icon name="arrow" size={15} /></button></div>
        </aside>

        <main className="dashboard-main">
          {loading ? <DashboardSkeleton /> : error ? <div className="state-card" role="alert"><Icon name="activity" size={28} /><span className="section-kicker">Signal interrupted</span><h1>Couldn’t load the workspace</h1><p>{error}</p><button className="primary-button" type="button" onClick={() => void loadData(true)}><Icon name="activity" size={17} /> Try again</button></div> : (
            <>
              {data?.storage && !data.storage.durable && <InlineNotice tone="info"><strong>Demo persistence:</strong> {data.storage.notice}</InlineNotice>}
              <div className="section-frame" key={section}>
                {section === "today" && data && <AthleteOverview firstName={firstName} workouts={data.workouts} stats={data.stats} nutrition={data.nutritionSummary} body={data.bodyProgress} strength={data.strengthProgress} agents={data.agents} onNavigate={setSection} />}
                {section === "training" && data && <TrainingWorkspace workouts={data.workouts} agents={data.agents} onLogWorkout={() => setSection("workout")} />}
                {section === "workout" && <WorkoutForm onSaved={() => saved("training")} onCancel={() => setSection("training")} />}
                {section === "body" && data && <BodyProgressWorkspace initial={data.bodyProgress} metrics={data.metrics} onRecord={() => setSection("metrics")} />}
                {section === "metrics" && <MetricWorkspace metrics={data?.metrics ?? []} onSaved={() => saved("body")} onCancel={() => setSection("body")} />}
                {section === "progress" && data && <ProgressWorkspace initialStrength={data.strengthProgress} initialBody={data.bodyProgress} workouts={data.workouts} metrics={data.metrics} stats={data.stats} agents={data.agents} onNavigate={setSection} />}
                {section === "nutrition" && data && <NutritionWorkspace profile={data.nutritionProfile} summary={data.nutritionSummary} onSaved={() => saved("nutrition")} />}
                {section === "notes" && <NotesWorkspace />}
                {section === "agents" && <><AgentPanel agents={data?.agents ?? []} onSaved={() => saved("agents")} /><div className="workspace-panel guide-workspace"><ApiGuide compact /></div></>}
                {section === "api" && <div className="workspace-panel guide-workspace"><ApiGuide compact /></div>}
              </div>
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


function MetricWorkspace({ metrics, onSaved, onCancel }: { metrics: BodyMetric[]; onSaved: () => Promise<void>; onCancel: () => void }) {
  return <div className="metric-workspace-grid"><MetricForm onSaved={onSaved} onCancel={onCancel} /><section className="metric-history workspace-panel"><div className="subsection-head"><div><span className="section-kicker">History</span><h2>Recent measurements</h2></div><span>{metrics.length}</span></div>{metrics.length === 0 ? <div className="empty-compact"><Icon name="body" /><strong>No measurements yet</strong><p>Your first entry will appear here.</p></div> : <div className="metric-history-list">{metrics.slice(0, 12).map((metric) => <article key={metric.id}><time>{new Date(metric.recordedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time><div>{metric.weightKg !== undefined && <span><strong>{metric.weightKg}</strong> kg</span>}{metric.bodyFatPercent !== undefined && <span><strong>{metric.bodyFatPercent}</strong> % fat</span>}{metric.waistCm !== undefined && <span><strong>{metric.waistCm}</strong> cm waist</span>}</div>{metric.notes && <p>{metric.notes}</p>}</article>)}</div>}</section></div>;
}

function NutritionWorkspace({ profile, summary, onSaved }: { profile: NutritionProfile | null; summary: NutritionSummary; onSaved: () => Promise<void> }) {
  const targets = summary.calorieTargets;
  const calorieTarget = targets.goalTargetCalories;
  const macroRows = [
    { label: "Protein", consumed: summary.totals.proteinG, target: targets.proteinTargetG, unit: "g" },
    { label: "Carbohydrates", consumed: summary.totals.carbohydratesG, target: targets.carbsTargetG, unit: "g" },
    { label: "Fat", consumed: summary.totals.fatG, target: targets.fatTargetG, unit: "g" },
  ];

  return (
    <div className="nutrition-workspace">
      <section className="workspace-panel nutrition-heading">
        <div><span className="section-kicker">Grounded nutrition</span><h1>Today’s fuel</h1><p>User-entered food paired with deterministic, editable wellness estimates.</p></div>
        <span className="estimate-chip"><Icon name="spark" size={15} /> Formula {targets.formulaVersion}</span>
      </section>

      {!profile ? (
        <section className="nutrition-onboarding workspace-panel">
          <div className="missing-state"><Icon name="spark" size={30} /><span className="section-kicker">Profile needed</span><h2>Make targets personal and reproducible</h2><p>Set formula inputs below. Food data remains available as user-entered totals; no nutrition values are inferred.</p></div>
          <NutritionProfileForm profile={null} onSaved={onSaved} />
        </section>
      ) : (
        <>
          {targets.missingInputs.length > 0 && <InlineNotice tone="info"><strong>Target needs more data:</strong> {targets.missingInputs.includes("weightKg") ? "record a body weight in Body metrics." : targets.missingInputs.join(", ")}</InlineNotice>}
          <section className="nutrition-signal-grid">
            <article className="workspace-panel calorie-signal">
              <div className="subsection-head"><div><span className="section-kicker">Calories</span><h2>{summary.totals.caloriesKcal.toLocaleString()} <small>eaten</small></h2></div><span>{calorieTarget === null ? "Target pending" : `${calorieTarget.toLocaleString()} goal target`}</span></div>
              <dl className="calorie-basis">
                <div><dt>Neutral maintenance</dt><dd>{targets.maintenanceCalories === null ? "Pending" : `${targets.maintenanceCalories.toLocaleString()} kcal`}</dd></div>
                <div><dt>Goal target</dt><dd>{calorieTarget === null ? "Pending" : `${calorieTarget.toLocaleString()} kcal`}</dd></div>
                <div><dt>Adjustment</dt><dd>{targets.goalAdjustmentCalories === null ? "Pending" : `${targets.goalAdjustmentCalories > 0 ? "+" : ""}${targets.goalAdjustmentCalories.toLocaleString()} kcal`}</dd></div>
              </dl>
              <p className="goal-summary">{targets.goalSummary}</p>
              {calorieTarget !== null ? <progress aria-label={`Calories: ${summary.totals.caloriesKcal} of ${calorieTarget} goal-target kilocalories`} max={calorieTarget} value={Math.min(summary.totals.caloriesKcal, calorieTarget)} /> : <div className="progress-placeholder" aria-label="Calorie target unavailable" />}
              <div className="calorie-foot"><span>{summary.remainingCalories === null ? "Add body weight for a target" : summary.remainingCalories >= 0 ? `${summary.remainingCalories.toLocaleString()} kcal remaining` : `${Math.abs(summary.remainingCalories).toLocaleString()} kcal over target`}</span><small>{summary.entries.length} {summary.entries.length === 1 ? "entry" : "entries"} today</small></div>
            </article>
            <article className="workspace-panel macro-signal" aria-label="Macronutrient progress">
              <div className="subsection-head"><div><span className="section-kicker">Macros</span><h2>Daily progress</h2></div><span>{summary.totals.fiberG} g fiber</span></div>
              <div className="macro-progress-list">{macroRows.map((macro) => <div key={macro.label} className="macro-progress-row"><div><strong>{macro.label}</strong><span>{macro.consumed} / {macro.target ?? "—"} {macro.unit}</span></div><progress aria-label={`${macro.label}: ${macro.consumed}${macro.target === null ? " grams, target unavailable" : ` of ${macro.target} grams`}`} max={macro.target ?? Math.max(macro.consumed, 1)} value={Math.min(macro.consumed, macro.target ?? macro.consumed)} /></div>)}</div>
            </article>
          </section>
        </>
      )}

      <section className="nutrition-content-grid">
        <div className="workspace-panel meal-log-panel">
          <div className="subsection-head"><div><span className="section-kicker">Meal log</span><h2>User-entered today</h2></div><span>{summary.entries.length}</span></div>
          <EditableNutritionEntries entries={summary.entries} onChanged={onSaved} />
        </div>
        <div className="workspace-panel nutrition-entry-panel"><FoodLogForm onSaved={onSaved} /></div>
      </section>

      {profile && <section className="nutrition-detail-grid">
        <details className="workspace-panel assumptions-panel" open>
          <summary><span><span className="section-kicker">Calculated estimate</span><strong>Assumptions and safety</strong></span><Icon name="arrow" size={16} /></summary>
          <div className="coaching-suggestions"><strong>Goal-specific next steps</strong><ul>{targets.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></div>
          <ul>{targets.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
          <p>{targets.safetyNote}</p>
          <dl><div><dt>Weight input</dt><dd>{targets.inputs.weightKg ?? "Missing"}{targets.inputs.weightKg !== null ? " kg" : ""}</dd></div><div><dt>Activity</dt><dd>{profile.activityLevel.replaceAll("_", " ")}</dd></div><div><dt>Goal</dt><dd>{profile.goal}</dd></div></dl>
        </details>
        <details className="workspace-panel profile-edit-panel">
          <summary><span><span className="section-kicker">User editable</span><strong>Nutrition profile</strong></span><Icon name="arrow" size={16} /></summary>
          <NutritionProfileForm profile={profile} onSaved={onSaved} />
        </details>
      </section>}
      <p className="nutrition-disclosure"><Icon name="shield" size={16} /> Calculations are wellness estimates, not medical advice. Food and profile values are user-entered and editable.</p>
    </div>
  );
}
