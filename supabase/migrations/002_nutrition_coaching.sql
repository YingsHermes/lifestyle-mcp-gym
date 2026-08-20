-- Nutrition data remains server-side. RLS has no client policies; only service_role is granted access.
begin;

create table if not exists public.nutrition_profiles (
  owner_id text primary key references public.humans(id) on delete cascade,
  sex text not null check (sex in ('male', 'female', 'other')),
  birth_date date not null,
  height_cm double precision not null check (height_cm between 100 and 250),
  activity_level text not null check (activity_level in ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'athlete')),
  goal text not null check (goal in ('lose', 'maintain', 'gain')),
  target_rate_kg_per_week double precision check (target_rate_kg_per_week is null or target_rate_kg_per_week between -1 and 1),
  dietary_preferences jsonb not null default '[]'::jsonb check (jsonb_typeof(dietary_preferences) = 'array'),
  allergies jsonb not null default '[]'::jsonb check (jsonb_typeof(allergies) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_entries (
  id text primary key,
  owner_id text not null references public.humans(id) on delete cascade,
  agent_id text,
  eaten_at timestamptz not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'other')),
  food_name text not null check (char_length(food_name) between 1 and 160),
  serving_size text not null check (char_length(serving_size) between 1 and 100),
  servings double precision not null check (servings > 0 and servings <= 100),
  calories_kcal double precision not null check (calories_kcal between 0 and 20000),
  protein_g double precision not null check (protein_g between 0 and 2000),
  carbohydrates_g double precision not null check (carbohydrates_g between 0 and 2000),
  fat_g double precision not null check (fat_g between 0 and 2000),
  fiber_g double precision not null check (fiber_g between 0 and 500),
  notes text check (notes is null or char_length(notes) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint lifestyle_nutrition_entries_agent_owner_fk foreign key (agent_id, owner_id)
    references public.agents(id, owner_id) on delete set null (agent_id)
);

create index if not exists lifestyle_nutrition_entries_owner_eaten_idx
  on public.nutrition_entries (owner_id, eaten_at desc);
create index if not exists lifestyle_nutrition_entries_agent_idx
  on public.nutrition_entries (agent_id) where agent_id is not null;

alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_entries enable row level security;

revoke all on table public.nutrition_profiles, public.nutrition_entries from public, anon, authenticated;
grant all on table public.nutrition_profiles, public.nutrition_entries to service_role;

commit;
