"use client";

import { useState, type FormEvent } from "react";
import { z } from "zod";
import { ApiGuide } from "@/components/api-guide";
import { ApiRequestError, fetchApi, sessionResponseSchema, type PublicUser } from "@/components/client-api";
import { Brand, Icon, InlineNotice, Spinner } from "@/components/ui";

const experienceSchema = z.enum(["beginner", "intermediate", "advanced"]);
type AuthMode = "register" | "login";

export function AuthView({ onAuthenticated }: { onAuthenticated: (user: PublicUser) => void }) {
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [mode, setMode] = useState<AuthMode>("register");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [experience, setExperience] = useState<z.infer<typeof experienceSchema>>("beginner");

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetchApi("/api/auth/register", sessionResponseSchema, {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          timezone: form.get("timezone"),
          goals: String(form.get("goals") ?? "").split(",").map((goal) => goal.trim()).filter(Boolean),
          experience,
          consent: form.get("consent") === "on",
        }),
      });
      onAuthenticated(response.user);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Registration could not be completed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetchApi("/api/auth/login", sessionResponseSchema, {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      onAuthenticated(response.user);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Sign in could not be completed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="landing-shell">
      <header className="landing-nav">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#capabilities">Capabilities</a>
          <a href="#mcp-quickstart">MCP quickstart</a>
          <a className="nav-endpoint" href="#mcp-quickstart"><span className="status-dot" /> /api/mcp</a>
        </nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span>Human-owned</span><i />Agent-ready training</div>
          <h1>Your training record,<br /><em>built to be used.</em></h1>
          <p className="hero-lede">Log every set. Track the signals that matter. Give trusted agents a scoped MCP surface without handing over your account.</p>
          <div className="hero-proof">
            <div><Icon name="shield" /><span><strong>Scoped credentials</strong>Secrets hashed at rest</span></div>
            <div><Icon name="activity" /><span><strong>Live progress</strong>Volume and body trends</span></div>
            <div><Icon name="code" /><span><strong>MCP-native</strong>Five callable tools</span></div>
          </div>
        </div>

        <aside className="auth-card" aria-label={mode === "register" ? "Create account" : "Sign in"}>
          <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected={mode === "register"} onClick={() => { setMode("register"); setError(null); }}>Create account</button>
            <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setError(null); }}>Sign in</button>
          </div>
          {mode === "register" ? (
            <form onSubmit={submitRegistration} className="auth-form">
              <div className="form-heading"><span>Start your training record</span><small>All fields are required unless noted.</small></div>
              {error && <InlineNotice>{error}</InlineNotice>}
              <div className="field-row">
                <label><span>Name</span><input name="name" autoComplete="name" minLength={2} maxLength={80} placeholder="Maya Chen" required /></label>
                <label><span>Experience</span><select name="experience" value={experience} onChange={(event) => setExperience(experienceSchema.parse(event.target.value))}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
              </div>
              <label><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={254} placeholder="maya@example.com" required /></label>
              <label><span>Password</span><input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} placeholder="12+ characters" required /></label>
              <label><span>Timezone</span><input name="timezone" defaultValue={browserTimezone} maxLength={100} required /></label>
              <label><span>Goals <small>comma separated</small></span><input name="goals" placeholder="Build strength, improve mobility" required /></label>
              <label className="consent-field"><input name="consent" type="checkbox" required /><span>I consent to storing the training and body data I submit. I understand local/demo persistence limits.</span></label>
              <button className="primary-button full-button" type="submit" disabled={submitting}>{submitting ? <Spinner label="Creating account" /> : <>Create my account <Icon name="arrow" size={18} /></>}</button>
            </form>
          ) : (
            <form onSubmit={submitLogin} className="auth-form login-form">
              <div className="form-heading"><span>Welcome back</span><small>Continue to your training workspace.</small></div>
              {error && <InlineNotice>{error}</InlineNotice>}
              <label><span>Email</span><input name="email" type="email" autoComplete="email" placeholder="maya@example.com" required /></label>
              <label><span>Password</span><input name="password" type="password" autoComplete="current-password" required /></label>
              <button className="primary-button full-button" type="submit" disabled={submitting}>{submitting ? <Spinner label="Signing in" /> : <>Open dashboard <Icon name="arrow" size={18} /></>}</button>
              <p className="form-footnote">Sessions use an HttpOnly, SameSite cookie and expire after 30 days.</p>
            </form>
          )}
        </aside>
      </section>

      <section className="capability-band" id="capabilities">
        <div className="capability-intro"><span className="section-index">01 / THE SYSTEM</span><h2>Less app theatre.<br />More useful signal.</h2></div>
        <div className="capability-grid">
          <article><span className="feature-number">A</span><Icon name="dumbbell" /><h3>Workout ledger</h3><p>Exercises, sets, reps, weight, timed work, notes, and recent activity through real APIs.</p></article>
          <article><span className="feature-number">B</span><Icon name="body" /><h3>Body signal</h3><p>Record weight, body fat, and waist measurements. See change without noisy conclusions.</p></article>
          <article><span className="feature-number">C</span><Icon name="agent" /><h3>Agent control</h3><p>Issue one-time secrets with explicit read/write scopes and owner metadata.</p></article>
        </div>
      </section>

      <ApiGuide />
      <footer className="site-footer"><Brand /><p>Own the work. Expose only what your tools need.</p><span>Local-first MVP · MCP 2025-03-26</span></footer>
    </main>
  );
}
