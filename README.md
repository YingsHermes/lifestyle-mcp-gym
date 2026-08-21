# Lifestyle MCP Gym

Lifestyle MCP Gym is an agent-ready gym and personal-trainer data layer: humans manage nutrition, user-entered food, workouts, body metrics, and deterministic wellness estimates through a responsive dashboard and scoped JSON-RPC MCP tools.

## Capabilities

- Human registration and login with password hashing, secure HTTP-only session cookies, goals, experience, timezone, and consent.
- Agent registration with scoped capabilities, optional HTTPS webhook, owner metadata, and a one-time secret response. Only a hash is stored.
- Workout tracking: exercises, sets, reps, weight, duration, notes, and recent activity.
- Body metrics: weight, body fat, waist, date, and notes.
- Nutrition profiles and bounded food logs. Nutrition values are always user-entered and are never fabricated.
- Deterministic Mifflin-St Jeor BMR, activity-factor neutral maintenance calories, explicit goal-adjusted calories, and weight-based macro estimates with versioned assumptions, sign-mismatch warnings, missing-input guidance, safety floors, and wellness disclaimers.
- One-call coaching context with the nutrition profile, calculated targets, today's nutrition, recent training stats, latest body metrics, and explicit next actions.
- MCP JSON-RPC endpoint at `/api/mcp` with `initialize`, `tools/list`, and `tools/call`.
- Scoped MCP tools for workouts, metrics, nutrition, coaching context, agent registration, and dashboard access links.

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

   The checked-in migrations are idempotent and safe to rerun.
3. Copy the project URL and service-role key into `.env.local` for a local Supabase-backed server.
4. Restart the Next.js server and confirm `/api/status` reports storage mode `supabase`.

The migrations create normalized humans, sessions, agents, workouts, workout exercises/sets, body metrics, nutrition profiles, and nutrition entries. Row Level Security is enabled on every table. There are intentionally no public policies: all data access uses the server-side service-role client.

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

Human browser sessions may call the endpoint from the same origin. Agent tool calls require the relevant scopes. Existing workout and metric scopes are unchanged. Nutrition tools use `nutrition:read` or `nutrition:write`; `get_coaching_context` uses only `coaching:read`, which authorizes the aggregate read without granting separate nutrition, workout, or metric tools.


### LLM-ready coaching context

An agent with `coaching:read` can retrieve every grounded coaching input in one call:

```bash
curl -s https://YOUR_DEPLOYMENT/api/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_AGENT_SECRET' \
  --data '{
    "jsonrpc":"2.0",
    "id":"coach-context",
    "method":"tools/call",
    "params":{"name":"get_coaching_context","arguments":{}}
  }'
```

The response includes concise text in `result.content` and machine-readable JSON in `result.structuredContent`. Calculated targets include the formula version, exact inputs and assumptions, missing inputs, clamp explanations, a safety note, and these explicit goal fields:

| Field | Meaning |
| --- | --- |
| `maintenanceCalories` | Neutral TDEE baseline before any goal adjustment. |
| `goalTargetCalories` | Calorie target after applying the selected lose, maintain, or gain goal. |
| `goalAdjustmentCalories` | Signed difference between `goalTargetCalories` and `maintenanceCalories`. |
| `goal` | Selected direction: `lose`, `maintain`, `gain`, or `null` when unavailable. |
| `goalSummary` | Human-readable sentence stating the direction and adjustment. |
| `suggestions` | Goal-specific coaching and next-step suggestions. |
| `targetCalories` | Backward-compatible alias of `goalTargetCalories`. |

`lose` defaults below maintenance, `gain` defaults above maintenance, and `maintain` equals maintenance. A custom `targetRateKgPerWeek` is signed: negative for loss and positive for gain. If its sign contradicts the selected goal, the calculation normalizes the sign, reports that assumption, and uses the normalized rate. The coaching context repeats both the neutral baseline and goal-adjusted target in its human-readable text.

### Log user-entered food

`log_food` never looks up or invents nutrients. Supply totals for the complete log entry, including all servings:

```bash
curl -s https://YOUR_DEPLOYMENT/api/mcp \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer YOUR_AGENT_SECRET' \
  --data '{
    "jsonrpc":"2.0",
    "id":"food-1",
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
        "fiberG":11,
        "notes":"Totals entered from the recipe"
      }
    }
  }'
```
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
