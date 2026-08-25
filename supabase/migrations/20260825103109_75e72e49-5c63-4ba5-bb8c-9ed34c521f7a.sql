ALTER TABLE public.search_goals
  ADD COLUMN IF NOT EXISTS target_industries text[] NOT NULL DEFAULT '{}'::text[];