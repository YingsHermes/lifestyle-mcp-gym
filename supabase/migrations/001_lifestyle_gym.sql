-- Lifestyle MCP Gym uses a server-side Supabase service-role client for its custom auth MVP.
-- RLS is enabled on every table. Intentionally create no public policies: anon and
-- authenticated clients must not read or write this schema; service_role bypasses RLS.

begin;

create table if not exists public.humans (
  id text primary key,
  name text not null,
  email text not null,
  password_hash text not null,
  timezone text not null,
  goals jsonb not null check (jsonb_typeof(goals) = 'array'),
  experience text not null check (experience in ('beginner', 'intermediate', 'advanced')),
  consent_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint lifestyle_humans_email_key unique (email)
);

create table if not exists public.sessions (
  id text primary key,
  human_id text not null references public.humans(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint lifestyle_sessions_token_hash_key unique (token_hash)
);

create table if not exists public.agents (
  id text primary key,
  owner_id text not null references public.humans(id) on delete cascade,
  name text not null,
  secret_hash text not null,
  scopes jsonb not null check (jsonb_typeof(scopes) = 'array'),
  capabilities jsonb not null check (jsonb_typeof(capabilities) = 'array'),
  webhook_url text,
  owner_metadata jsonb,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint lifestyle_agents_owner_key unique (id, owner_id),
  constraint lifestyle_agents_owner_metadata_object check (owner_metadata is null or jsonb_typeof(owner_metadata) = 'object')
);

create table if not exists public.workouts (
  id text primary key,
  owner_id text not null references public.humans(id) on delete cascade,
  agent_id text,
  title text not null,
  occurred_at timestamptz not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  notes text,
  created_at timestamptz not null default now(),
  constraint lifestyle_workouts_agent_owner_fk foreign key (agent_id, owner_id)
    references public.agents(id, owner_id) on delete set null (agent_id)
);

create table if not exists public.workout_exercises (
  id text primary key,
  workout_id text not null references public.workouts(id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null,
  created_at timestamptz not null default now(),
  constraint lifestyle_workout_exercises_position_key unique (workout_id, position)
);

create table if not exists public.workout_sets (
  id text primary key,
  exercise_id text not null references public.workout_exercises(id) on delete cascade,
  position integer not null check (position >= 0),
  reps integer check (reps is null or reps > 0),
  weight_kg double precision check (weight_kg is null or weight_kg >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  notes text,
  created_at timestamptz not null default now(),
  constraint lifestyle_workout_sets_measurement_check check (reps is not null or duration_seconds is not null),
  constraint lifestyle_workout_sets_position_key unique (exercise_id, position)
);

create table if not exists public.body_metrics (
  id text primary key,
  owner_id text not null references public.humans(id) on delete cascade,
  agent_id text,
  recorded_at timestamptz not null,
  weight_kg double precision,
  body_fat_percent double precision,
  waist_cm double precision,
  notes text,
  created_at timestamptz not null default now(),
  constraint lifestyle_body_metrics_measurement_check check (
    weight_kg is not null or body_fat_percent is not null or waist_cm is not null
  ),
  constraint lifestyle_body_metrics_agent_owner_fk foreign key (agent_id, owner_id)
    references public.agents(id, owner_id) on delete set null (agent_id)
);

create index if not exists lifestyle_sessions_human_created_idx
  on public.sessions (human_id, created_at desc);
create index if not exists lifestyle_sessions_expires_idx
  on public.sessions (expires_at);
create index if not exists lifestyle_agents_owner_created_idx
  on public.agents (owner_id, created_at desc);
create index if not exists lifestyle_workouts_owner_occurred_idx
  on public.workouts (owner_id, occurred_at desc);
create index if not exists lifestyle_workouts_agent_idx
  on public.workouts (agent_id) where agent_id is not null;
create index if not exists lifestyle_workout_exercises_workout_idx
  on public.workout_exercises (workout_id, position);
create index if not exists lifestyle_workout_sets_exercise_idx
  on public.workout_sets (exercise_id, position);
create index if not exists lifestyle_body_metrics_owner_recorded_idx
  on public.body_metrics (owner_id, recorded_at desc);
create index if not exists lifestyle_body_metrics_agent_idx
  on public.body_metrics (agent_id) where agent_id is not null;

alter table public.humans enable row level security;
alter table public.sessions enable row level security;
alter table public.agents enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.body_metrics enable row level security;

create or replace function public.create_lifestyle_workout(workout jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  exercise jsonb;
  workout_set jsonb;
  exercise_position bigint;
  set_position bigint;
begin
  insert into public.workouts (
    id, owner_id, agent_id, title, occurred_at, duration_minutes, notes, created_at
  ) values (
    workout->>'id',
    workout->>'ownerId',
    workout->>'agentId',
    workout->>'title',
    (workout->>'occurredAt')::timestamptz,
    (workout->>'durationMinutes')::integer,
    workout->>'notes',
    (workout->>'createdAt')::timestamptz
  );

  for exercise, exercise_position in
    select item.value, item.ordinality
    from jsonb_array_elements(workout->'exercises') with ordinality as item(value, ordinality)
  loop
    insert into public.workout_exercises (id, workout_id, position, name)
    values (exercise->>'id', workout->>'id', exercise_position - 1, exercise->>'name');

    for workout_set, set_position in
      select item.value, item.ordinality
      from jsonb_array_elements(exercise->'sets') with ordinality as item(value, ordinality)
    loop
      insert into public.workout_sets (
        id, exercise_id, position, reps, weight_kg, duration_seconds, notes
      ) values (
        workout_set->>'id',
        exercise->>'id',
        set_position - 1,
        (workout_set->>'reps')::integer,
        (workout_set->>'weightKg')::double precision,
        (workout_set->>'durationSeconds')::integer,
        workout_set->>'notes'
      );
    end loop;
  end loop;
end;
$$;

revoke all on function public.create_lifestyle_workout(jsonb) from public, anon, authenticated;
grant execute on function public.create_lifestyle_workout(jsonb) to service_role;

commit;
