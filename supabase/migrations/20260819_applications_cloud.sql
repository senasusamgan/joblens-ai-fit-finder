create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  job_title text not null,
  company_name text not null default '',
  job_url text,
  status text not null default 'Saved'
    check (status in ('Saved','Applied','Interview','Case','Offer','Rejected')),
  match_score integer check (match_score between 0 and 100),
  verdict text,
  job_description text,
  applied_at date,
  notes text,
  source_local_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.applications enable row level security;

revoke all on public.applications from anon;
grant select, insert, update, delete on public.applications to authenticated;

drop policy if exists applications_select_own on public.applications;
drop policy if exists applications_insert_own on public.applications;
drop policy if exists applications_update_own on public.applications;
drop policy if exists applications_delete_own on public.applications;

create policy applications_select_own
on public.applications for select
to authenticated
using ((select auth.uid()) = user_id);

create policy applications_insert_own
on public.applications for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy applications_update_own
on public.applications for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy applications_delete_own
on public.applications for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists applications_user_id_idx
on public.applications(user_id);

drop index if exists public.applications_user_source_local_id_uidx;

create unique index applications_user_source_local_id_uidx
on public.applications(user_id, source_local_id);

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

drop trigger if exists applications_set_updated_at on public.applications;

create trigger applications_set_updated_at
before update on public.applications
for each row execute function public.set_updated_at();
