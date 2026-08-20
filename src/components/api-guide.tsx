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
      "name":"log_workout",
      "arguments":{
        "title":"Lower strength",
        "occurredAt":"2026-08-20T09:00:00Z",
        "exercises":[{
          "name":"Back squat",
          "sets":[
            {"reps":5,"weightKg":100},
            {"reps":5,"weightKg":100}
          ]
        }]
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
          <h2>One endpoint. Five focused tools.</h2>
          <p>JSON-RPC 2.0 over HTTP, shaped for MCP protocol version 2025-03-26.</p>
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
        <CodeBlock label="Log a workout">{toolCallExample}</CodeBlock>
      </div>
      <div className="tool-strip" aria-label="Available MCP tools">
        {["register_agent", "log_workout", "list_workouts", "get_stats", "record_body_metrics"].map((tool) => <code key={tool}>{tool}</code>)}
      </div>
      <p className="security-line"><Icon name="shield" size={16} /> Agent scopes are checked per call. Registration requires an authenticated human session.</p>
    </section>
  );
}
