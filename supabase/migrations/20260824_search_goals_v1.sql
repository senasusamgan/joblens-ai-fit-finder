create table if not exists public.search_goals (
  user_id uuid primary key
    references auth.users(id)
    on delete cascade
    default auth.uid(),

  target_roles text[] not null default '{}',
  locations text[] not null default '{}',
  work_models text[] not null default '{}'
    check (
      work_models <@
      array['On-site', 'Hybrid', 'Remote']::text[]
    ),

  weekly_application_goal integer not null default 5
    check (
      weekly_application_goal >= 1
      and weekly_application_goal <= 50
    ),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.search_goals
enable row level security;

revoke all
on public.search_goals
from anon;

grant select, insert, update, delete
on public.search_goals
to authenticated;

drop policy if exists search_goals_select_own
on public.search_goals;

drop policy if exists search_goals_insert_own
on public.search_goals;

drop policy if exists search_goals_update_own
on public.search_goals;

drop policy if exists search_goals_delete_own
on public.search_goals;

create policy search_goals_select_own
on public.search_goals
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy search_goals_insert_own
on public.search_goals
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

create policy search_goals_update_own
on public.search_goals
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

create policy search_goals_delete_own
on public.search_goals
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists search_goals_set_updated_at
on public.search_goals;

create trigger search_goals_set_updated_at
before update on public.search_goals
for each row
execute function public.set_updated_at();
