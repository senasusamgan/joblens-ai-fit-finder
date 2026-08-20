create table if not exists public.gmail_signal_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  message_id text not null,
  action text not null check (
    action in ('linked', 'created', 'dismissed')
  ),
  application_id uuid references public.applications(id) on delete set null,
  handled_at timestamptz not null default now()
);

alter table public.gmail_signal_actions enable row level security;

revoke all on public.gmail_signal_actions from anon;

grant select, insert, update, delete
on public.gmail_signal_actions
to authenticated;

drop policy if exists gmail_signal_actions_select_own
on public.gmail_signal_actions;

drop policy if exists gmail_signal_actions_insert_own
on public.gmail_signal_actions;

drop policy if exists gmail_signal_actions_update_own
on public.gmail_signal_actions;

drop policy if exists gmail_signal_actions_delete_own
on public.gmail_signal_actions;

create policy gmail_signal_actions_select_own
on public.gmail_signal_actions
for select
to authenticated
using (
  (select auth.uid()) = user_id
);

create policy gmail_signal_actions_insert_own
on public.gmail_signal_actions
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
);

create policy gmail_signal_actions_update_own
on public.gmail_signal_actions
for update
to authenticated
using (
  (select auth.uid()) = user_id
)
with check (
  (select auth.uid()) = user_id
);

create policy gmail_signal_actions_delete_own
on public.gmail_signal_actions
for delete
to authenticated
using (
  (select auth.uid()) = user_id
);

create unique index if not exists gmail_signal_actions_user_message_uidx
on public.gmail_signal_actions(user_id, message_id);

create index if not exists gmail_signal_actions_user_handled_idx
on public.gmail_signal_actions(user_id, handled_at desc);
