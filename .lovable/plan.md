# Database integration check + safe migration path

## What I confirmed (read-only)

- The active database is a **Lovable Cloud-managed** hosted backend (managed flag: true, org-owned by Lovable, not paused, healthy).
- That is exactly why it does not show up in your own Supabase CLI `projects list` and why `link` returns 403: the project lives in Lovable's organization, not your Supabase account. Your personal CLI token has no grant on it. This is expected, not a misconfiguration — there is no self-serve CLI/dashboard access for Cloud-managed backends.
- Current `public.search_goals` columns: `user_id`, `target_roles text[]`, `locations text[]`, `work_models text[]`, `weekly_application_goal int`, `created_at`, `updated_at`. There is no `target_industries` column yet, and no separate industries table.
- Existing row security on the table already scopes every read/write to `auth.uid()`, and an `updated_at` trigger is in place.

## Safest supported way to apply the column

Schema changes go through the in-product migration flow here (I author the SQL, you review and approve it before it runs). Nothing else is supported for this backend — no CLI link, no dashboard, no direct DDL over psql (the sandbox role is read-only for schema).

The migration itself is additive and touches nothing else:

```sql
ALTER TABLE public.search_goals
  ADD COLUMN IF NOT EXISTS target_industries text[] NOT NULL DEFAULT '{}'::text[];
```

Why this is safe:
- `ADD COLUMN` with a non-volatile default is a metadata-only change in Postgres — no table rewrite, no row locking beyond a brief lock.
- Existing rows get `'{}'` automatically; no data is modified, deleted, or re-typed.
- No grants, policies, triggers, indexes, or other columns are altered. Row security already covers the new column.

## After it runs

The generated types file refreshes automatically, so a follow-up (separate) step would be needed for any app code that should read/write the new field — for example `src/lib/search-goals.ts` and `src/lib/cloud-search-goals.ts`, plus the Goals screen. That is deliberately out of scope until you ask for it; this plan is the column only.

## Recommendation

Approve this plan and I'll submit the single `ALTER TABLE` above for your migration approval, then confirm the column exists with a read-only query. No other schema or data will change.
