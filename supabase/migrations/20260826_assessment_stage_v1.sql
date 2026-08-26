alter table public.applications
drop constraint if exists applications_status_check;

alter table public.applications
add constraint applications_status_check
check (
  status in (
    'Saved',
    'Applied',
    'Assessment',
    'Interview',
    'Case',
    'Offer',
    'Rejected'
  )
);
