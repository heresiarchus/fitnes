-- Fitnes account storage. Run once in Supabase: SQL Editor → New query → paste → Run.
-- Every record (day, item, settings, connection) is one row owned by the signed-in user;
-- row-level security makes rows visible and writable only to their owner.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users on delete cascade,
  kind       text        not null check (kind in ('day', 'item', 'settings', 'secret')),
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null,            -- when the user changed it (device clock)
  server_at  timestamptz not null default now(), -- when it reached the server (for pulling changes)
  primary key (user_id, kind, id)
);

create index if not exists records_pull on public.records (user_id, server_at);

alter table public.records enable row level security;

drop policy if exists "own rows" on public.records;
create policy "own rows" on public.records
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.server_at := now();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();
