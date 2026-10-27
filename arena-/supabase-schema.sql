create table if not exists public.championships (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null check (
    jsonb_typeof(data) = 'object' and data ->> 'id' = id
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.championships enable row level security;

drop policy if exists "Users can read their own championships" on public.championships;
drop policy if exists "Anyone can read championships" on public.championships;
create policy "Anyone can read championships"
  on public.championships for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create their own championships" on public.championships;
create policy "Users can create their own championships"
  on public.championships for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own championships" on public.championships;
create policy "Users can update their own championships"
  on public.championships for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own championships" on public.championships;
create policy "Users can delete their own championships"
  on public.championships for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.championships to anon, authenticated;
grant insert, update, delete on public.championships to authenticated;
revoke insert, update, delete on public.championships from anon, public;

create table if not exists public.championship_registrations (
  id uuid primary key default gen_random_uuid(),
  championship_id text not null references public.championships (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  team_name text not null check (length(trim(team_name)) between 2 and 60),
  player_one text not null check (length(trim(player_one)) between 2 and 60),
  player_two text not null check (length(trim(player_two)) between 2 and 60),
  created_at timestamptz not null default now(),
  unique (championship_id, user_id)
);

create unique index if not exists championship_registrations_unique_team
  on public.championship_registrations (championship_id, lower(team_name));

alter table public.championship_registrations enable row level security;

drop policy if exists "Anyone can view championship registrations" on public.championship_registrations;
create policy "Anyone can view championship registrations"
  on public.championship_registrations for select
  to anon, authenticated
  using (true);

drop policy if exists "Logged in users can register" on public.championship_registrations;
create policy "Logged in users can register"
  on public.championship_registrations for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.championships c
      where c.id = championship_id
        and c.data ->> 'inscricoesAbertas' is distinct from 'false'
    )
  );

drop policy if exists "Users can cancel or organizers can reject registrations" on public.championship_registrations;
create policy "Users can cancel or organizers can reject registrations"
  on public.championship_registrations for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.championships c
      where c.id = championship_id
        and c.user_id = auth.uid()
    )
  );

grant select on public.championship_registrations to anon, authenticated;
grant insert, delete on public.championship_registrations to authenticated;
revoke insert, update, delete on public.championship_registrations from anon, public;
