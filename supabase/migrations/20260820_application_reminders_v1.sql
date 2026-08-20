create table if not exists public.application_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  title text not null,
  due_at timestamptz not null,
  completed_at timestamptz,
  source_local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.application_reminders enable row level security;

revoke all on public.application_reminders from anon;
grant select, insert, update, delete
on public.application_reminders
to authenticated;

drop policy if exists application_reminders_select_own
on public.application_reminders;

drop policy if exists application_reminders_insert_own
on public.application_reminders;

drop policy if exists application_reminders_update_own
on public.application_reminders;

drop policy if exists application_reminders_delete_own
on public.application_reminders;

create policy application_reminders_select_own
on public.application_reminders
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy application_reminders_insert_own
on public.application_reminders
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

create policy application_reminders_update_own
on public.application_reminders
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

create policy application_reminders_delete_own
on public.application_reminders
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

create index if not exists application_reminders_user_id_idx
on public.application_reminders(user_id);

create index if not exists application_reminders_application_id_idx
on public.application_reminders(application_id);

create index if not exists application_reminders_due_at_idx
on public.application_reminders(user_id, due_at);

create unique index if not exists application_reminders_user_source_local_id_uidx
on public.application_reminders(user_id, source_local_id);

drop trigger if exists application_reminders_set_updated_at
on public.application_reminders;

create trigger application_reminders_set_updated_at
before update on public.application_reminders
for each row execute function public.set_updated_at();
