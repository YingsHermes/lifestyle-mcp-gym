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

- `SUPABASE_URL`: project URL from the Supabase API settings.
- `SUPABASE_SERVICE_ROLE_KEY`: service-role secret from the Supabase API settings.
- `LIFESTYLE_STORAGE_DRIVER`: local fallback, either `file` or `memory`.
- `LIFESTYLE_DATA_FILE`: optional path for local JSON storage.

When both Supabase variables are present, the server automatically selects `SupabaseStorage`; otherwise the existing file/memory behavior remains. On Vercel, the fallback is process-local memory unless the file driver is explicitly selected.

**Security:** `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it with `NEXT_PUBLIC_`, import the storage adapter into client code, print the key, or commit it. The app stores password hashes, session-token hashes, and agent-secret hashes; raw agent secrets are returned only once.

## Supabase setup

1. Create a Supabase project.
2. Link the Supabase CLI to the project and apply the checked-in migration:

   ```bash
   npx supabase@latest link --project-ref YOUR_PROJECT_REF
   npx supabase@latest db push
   ```

   Alternatively, run `supabase/migrations/001_lifestyle_gym.sql` once in the project's SQL editor. The migration is safe to rerun.
3. Copy the project URL and service-role key into `.env.local` for a local Supabase-backed server.
4. Restart the Next.js server and confirm `/api/status` reports storage mode `supabase`.

The migration creates normalized humans, sessions, agents, workouts, workout exercises/sets, and body metrics. Row Level Security is enabled on every table. There are intentionally no public policies: this custom-auth MVP accesses the schema only through the server-side service-role client, which bypasses RLS.

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

Set these Vercel environment variables for every environment that should use persistent storage:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Use the Vercel dashboard or `vercel env add`; keep the service-role value out of command history and deployment logs. Do not create a `NEXT_PUBLIC_` copy.

Then deploy a preview:

```bash
npx vercel@latest --token "$VERCEL_TOKEN" --yes
```

Use `--prod` only for an intentional production deployment. Verify the returned deployment with `npx vercel@latest inspect <deployment-url> --token "$VERCEL_TOKEN"`.

## Architecture

- `src/components/`: client dashboard, auth, forms, and API guide.
- `src/app/api/`: Next.js route handlers for auth, workouts, metrics, stats, agents, status, and MCP.
- `src/lib/domain.ts`: validated domain input schemas and stat calculations.
- `src/lib/service.ts`: auth, authorization, and application operations.
- `src/lib/storage/`: storage interface plus Supabase, local JSON, and in-memory adapters.
- `src/lib/mcp.ts`: JSON-RPC/MCP request validation, tools, auth, and scope enforcement.

`LifestyleStorage` keeps domain, service, UI, and MCP behavior independent of the selected persistence adapter.
