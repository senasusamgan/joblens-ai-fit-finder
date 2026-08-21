create table if not exists public.application_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null
    references auth.users(id)
    on delete cascade
    default auth.uid(),

  application_id uuid not null
    references public.applications(id)
    on delete cascade,

  event_type text not null
    check (
      event_type in (
        'created',
        'status_change'
      )
    ),

  source text not null default 'manual'
    check (
      source in (
        'manual',
        'gmail',
        'analysis'
      )
    ),

  from_status text,
  to_status text,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.application_events
enable row level security;

revoke all
on public.application_events
from anon;

grant select, insert, update, delete
on public.application_events
to authenticated;

drop policy if exists application_events_select_own
on public.application_events;

drop policy if exists application_events_insert_own
on public.application_events;

drop policy if exists application_events_update_own
on public.application_events;

drop policy if exists application_events_delete_own
on public.application_events;

create policy application_events_select_own
on public.application_events
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy application_events_insert_own
on public.application_events
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.applications a
    where a.id = application_id
      and a.user_id = (select auth.uid())
  )
);

create policy application_events_update_own
on public.application_events
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1
    from public.applications a
    where a.id = application_id
      and a.user_id = (select auth.uid())
  )
);

create policy application_events_delete_own
on public.application_events
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

create index if not exists application_events_user_id_idx
on public.application_events(user_id);

create index if not exists application_events_application_id_idx
on public.application_events(application_id);

create index if not exists application_events_timeline_idx
on public.application_events(application_id, occurred_at desc);
