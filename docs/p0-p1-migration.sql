-- Praxora P0/P1 migration for an existing Supabase database.
-- Safe to run multiple times. Does not drop tables or delete lead data.

alter table public.leads add column if not exists average_new_patient_value numeric;
alter table public.leads add column if not exists knows_unscheduled_value text;
alter table public.leads add column if not exists unscheduled_treatment_value numeric;
alter table public.leads add column if not exists unscheduled_patient_count integer;
alter table public.leads add column if not exists average_treatment_value numeric;
alter table public.leads add column if not exists overdue_recall_count integer;
alter table public.leads add column if not exists average_recall_value numeric;
alter table public.leads add column if not exists sequence_status text not null default 'not_enrolled';

alter table public.leak_reviews add column if not exists founder_email_status text not null default 'pending';
alter table public.leak_reviews add column if not exists requester_email_status text not null default 'pending';

create table if not exists public.submission_rate_limits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_hash text not null,
  endpoint text not null
);

create index if not exists submission_rate_limits_lookup_idx on public.submission_rate_limits (request_hash, endpoint, created_at desc);
create index if not exists submission_rate_limits_created_at_idx on public.submission_rate_limits (created_at desc);
