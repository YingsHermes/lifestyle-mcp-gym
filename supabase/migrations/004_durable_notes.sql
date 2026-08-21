-- Durable owner-scoped notes with weighted PostgreSQL full-text search.
begin;

create table if not exists public.notes (
  id text primary key,
  owner_id text not null references public.humans(id) on delete cascade,
  agent_id text,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 20000),
  tags text[] not null default '{}' check (cardinality(tags) <= 20),
  search_vector tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lifestyle_notes_agent_owner_fk foreign key (agent_id, owner_id)
    references public.agents(id, owner_id) on delete set null (agent_id)
);

create or replace function public.set_lifestyle_notes_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.content, '')), 'C');
  return new;
end;
$$;

drop trigger if exists lifestyle_notes_search_vector_trigger on public.notes;
create trigger lifestyle_notes_search_vector_trigger
before insert or update of title, content, tags on public.notes
for each row execute function public.set_lifestyle_notes_search_vector();

create index if not exists lifestyle_notes_owner_updated_idx
  on public.notes (owner_id, updated_at desc);
create index if not exists lifestyle_notes_agent_idx
  on public.notes (agent_id) where agent_id is not null;
create index if not exists lifestyle_notes_search_idx
  on public.notes using gin (search_vector);

alter table public.notes enable row level security;
grant all on table public.notes to service_role;

create or replace function public.search_lifestyle_notes(
  p_owner_id text,
  p_query text,
  p_limit integer
)
returns setof public.notes
language sql
stable
set search_path = public
as $$
  select note.*
  from public.notes as note
  where note.owner_id = p_owner_id
    and note.search_vector @@ websearch_to_tsquery('english', p_query)
  order by ts_rank_cd(note.search_vector, websearch_to_tsquery('english', p_query)) desc,
    note.updated_at desc
  limit least(greatest(p_limit, 1), 100);
$$;

revoke all on function public.search_lifestyle_notes(text, text, integer) from public;
grant execute on function public.search_lifestyle_notes(text, text, integer) to service_role;

commit;
