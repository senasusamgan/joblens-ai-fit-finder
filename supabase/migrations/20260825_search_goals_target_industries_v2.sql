alter table public.search_goals
add column if not exists target_industries text[] not null default '{}';
