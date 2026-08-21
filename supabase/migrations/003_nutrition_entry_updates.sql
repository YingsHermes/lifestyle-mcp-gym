-- Food-entry edits retain immutable creation time and record each successful update.
begin;

alter table public.nutrition_entries
  add column if not exists updated_at timestamptz;

update public.nutrition_entries
set updated_at = created_at
where updated_at is null;

alter table public.nutrition_entries
  alter column updated_at set default now(),
  alter column updated_at set not null;

commit;
