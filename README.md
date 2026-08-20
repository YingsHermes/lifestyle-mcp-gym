# Lifestyle MCP Gym

Lifestyle MCP Gym is an agent-ready gym tracker: humans register a full profile, create scoped agents, and track workouts, body metrics, and training statistics through a responsive web dashboard and JSON-RPC MCP endpoint.

## MVP capabilities

- Human registration and login with password hashing, secure HTTP-only session cookies, goals, experience, timezone, and consent.
- Agent registration with scoped capabilities, optional HTTPS webhook, owner metadata, and a one-time secret response. Only a hash is stored.
- Workout tracking: exercises, sets, reps, weight, duration, notes, and recent activity.
- Body metrics: weight, body fat, waist, date, and notes.
- Stats: workout count, weekly activity, training volume, and latest body metrics.
- MCP JSON-RPC endpoint at `/api/mcp` with `initialize`, `tools/list`, and `tools/call`.
- MCP tools: `register_agent`, `log_workout`, `list_workouts`, `get_stats`, and `record_body_metrics`.

## Run locally

Requirements: Node.js 20+ and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

The default local storage driver is a JSON file at `.data/lifestyle-gym.json`. It is useful for local development and is ignored by git. To use explicit demo storage instead:

```bash
LIFESTYLE_STORAGE_DRIVER=memory npm run dev
```

Memory storage resets when the server process restarts.

## Environment

See `.env.example`:

- `LIFESTYLE_STORAGE_DRIVER`: `file` or `memory`.
- `LIFESTYLE_DATA_FILE`: optional path for local JSON storage.
- `SESSION_SECRET`: optional secret for signing sessions; set a long random value outside local demo use.

The current MVP intentionally does **not** claim durable production persistence on Vercel. Vercel serverless instances do not guarantee writes to the local filesystem, so the runtime reports that limitation and defaults to process-local memory when `VERCEL` is set. Before production use, add a durable adapter behind `LifestyleStorage` (for example, a managed Postgres/SQLite-compatible service) and set the deployment's environment variables.

## MCP quickstart

Register a human in the dashboard, then create an agent. The agent secret is shown once. Send it as a bearer token:

```bash
curl -s https://YOUR_DEPLOYMENT/api/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_AGENT_SECRET' \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

curl -s https://YOUR_DEPLOYMENT/api/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_AGENT_SECRET' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

Human browser sessions may call the endpoint from the same origin. Agent tool calls require the relevant scopes. `register_agent` requires a human session; workout and metric tools require their matching agent scope.

## Validate

```bash
npm test
npm run lint
npm run build
```

## Deploy to Vercel

Install or invoke the CLI, then deploy a preview:

```bash
npx vercel@latest --token "$VERCEL_TOKEN" --yes
```

Use `--prod` only for an intentional production deployment. Verify the returned deployment with `npx vercel@latest inspect <deployment-url> --token "$VERCEL_TOKEN"`.

## Architecture

- `src/components/`: client dashboard, auth, forms, and API guide.
- `src/app/api/`: Next.js route handlers for auth, workouts, metrics, stats, agents, status, and MCP.
- `src/lib/domain.ts`: validated domain input schemas and stat calculations.
- `src/lib/service.ts`: auth, authorization, and application operations.
- `src/lib/storage/`: storage interface plus local JSON and in-memory adapters.
- `src/lib/mcp.ts`: JSON-RPC/MCP request validation, tools, auth, and scope enforcement.

The storage interface is the extension point for adding durable persistence without changing the UI or MCP contract.
