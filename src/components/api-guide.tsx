"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";

const initializeExample = `curl -s https://your-domain.example/api/mcp \\
  -H 'content-type: application/json' \\
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-03-26",
      "capabilities":{},
      "clientInfo":{"name":"my-agent","version":"1.0"}
    }
  }'`;

const toolCallExample = `curl -s https://your-domain.example/api/mcp \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer agent_ID.SECRET' \\
  -d '{
    "jsonrpc":"2.0",
    "id":2,
    "method":"tools/call",
    "params":{
      "name":"get_coaching_context",
      "arguments":{}
    }
  }'`;

const foodLogExample = `curl -s https://your-domain.example/api/mcp \\
  -H 'content-type: application/json' \\
  -H 'authorization: Bearer agent_ID.SECRET' \\
  -d '{
    "jsonrpc":"2.0",
    "id":3,
    "method":"tools/call",
    "params":{
      "name":"log_food",
      "arguments":{
        "eatenAt":"2026-08-20T12:30:00Z",
        "mealType":"lunch",
        "foodName":"Tofu rice bowl",
        "servingSize":"1 bowl",
        "servings":1,
        "caloriesKcal":640,
        "proteinG":31,
        "carbohydratesG":82,
        "fatG":19,
        "fiberG":11
      }
    }
  }'`;

function CodeBlock({ children, label }: { children: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className="code-block">
      <div className="code-head"><span>{label}</span><button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button></div>
      <pre><code>{children}</code></pre>
    </div>
  );
}

export function ApiGuide({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`api-guide ${compact ? "api-guide-compact" : ""}`} id="mcp-quickstart">
      <div className="section-kicker"><Icon name="code" size={16} /> Agent quickstart</div>
      <div className="guide-heading">
        <div>
          <h2>One endpoint. Thirteen scoped tools.</h2>
          <p>JSON-RPC 2.0 over HTTP. Structured results keep an LLM grounded while it handles the conversation.</p>
        </div>
        <span className="endpoint-chip">POST /api/mcp</span>
      </div>
      <ol className="guide-steps">
        <li><span>01</span><div><strong>Create a human account</strong><p>The owner controls consent, agents, and all recorded data.</p></div></li>
        <li><span>02</span><div><strong>Issue an agent credential</strong><p>Use the Agents panel. Copy the secret when shown; only its scrypt hash is stored.</p></div></li>
        <li><span>03</span><div><strong>Initialize, then call tools</strong><p>Send the complete <code>agent_ID.secret</code> credential as a bearer token.</p></div></li>
      </ol>
      <div className="code-grid">
        <CodeBlock label="Initialize">{initializeExample}</CodeBlock>
        <CodeBlock label="One-call coaching context">{toolCallExample}</CodeBlock>
        <CodeBlock label="Log user-entered food">{foodLogExample}</CodeBlock>
      </div>
      <div className="tool-strip" aria-label="Available MCP tools">
        {["register_agent", "log_workout", "list_workouts", "get_stats", "record_body_metrics", "set_nutrition_profile", "get_nutrition_profile", "log_food", "list_food_log", "get_nutrition_summary", "calculate_calorie_targets", "get_coaching_context", "create_dashboard_link"].map((tool) => <code key={tool}>{tool}</code>)}
      </div>
      <p className="security-line"><Icon name="shield" size={16} /> Agent scopes are checked per call. Registration requires an authenticated human session.</p>
    </section>
  );
}
