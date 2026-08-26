alter table public.applications
  add column if not exists application_source text;

alter table public.applications
  drop constraint if exists applications_application_source_check;

alter table public.applications
  add constraint applications_application_source_check
  check (
    application_source is null or
    application_source in (
      'LinkedIn',
      'Company Website',
      'Youthall',
      'Kariyer.net',
      'Indeed',
      'Glassdoor',
      'Referral',
      'Networking / Event',
      'Other Job Board',
      'Other'
    )
  );
