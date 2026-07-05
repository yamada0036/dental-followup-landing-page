-- Praxora P0/P1 funnel schema for Supabase/Postgres.
-- Safe to run multiple times in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  first_name text not null,
  email text not null,
  practice_name text,
  source text not null default 'revenue_leak_calculator',
  largest_leak text,
  missed_call_score integer,
  unscheduled_treatment_score integer,
  recall_score integer,
  missed_call_opportunity integer,
  unscheduled_treatment_opportunity integer,
  recall_opportunity integer,
  daily_calls integer,
  missed_call_rate text,
  missed_call_followup_rate text,
  average_new_patient_value numeric,
  knows_unscheduled_value text,
  unscheduled_treatment_value numeric,
  unscheduled_patient_count integer,
  average_treatment_value numeric,
  unscheduled_followup_process text,
  overdue_recall_count integer,
  average_recall_value numeric,
  recall_workflow_status text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  email_status text not null default 'pending',
  sequence_status text not null default 'not_enrolled'
);

alter table public.leads add column if not exists average_new_patient_value numeric;
alter table public.leads add column if not exists knows_unscheduled_value text;
alter table public.leads add column if not exists unscheduled_treatment_value numeric;
alter table public.leads add column if not exists unscheduled_patient_count integer;
alter table public.leads add column if not exists average_treatment_value numeric;
alter table public.leads add column if not exists overdue_recall_count integer;
alter table public.leads add column if not exists average_recall_value numeric;
alter table public.leads add column if not exists sequence_status text not null default 'not_enrolled';

create index if not exists leads_created_at_idx on leads (created_at desc);
create index if not exists leads_email_idx on leads (email);

create table if not exists leak_reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  practice_name text not null,
  number_of_locations integer,
  pms text,
  missed_call_process text,
  unscheduled_treatment_process text,
  overdue_recall_process text,
  most_frustrating_workflow text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  review_status text not null default 'new',
  founder_email_status text not null default 'pending',
  requester_email_status text not null default 'pending',
  notes text
);

alter table public.leak_reviews add column if not exists founder_email_status text not null default 'pending';
alter table public.leak_reviews add column if not exists requester_email_status text not null default 'pending';

create index if not exists leak_reviews_created_at_idx on leak_reviews (created_at desc);
create index if not exists leak_reviews_email_idx on leak_reviews (email);

create table if not exists submission_rate_limits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  request_hash text not null,
  endpoint text not null
);

create index if not exists submission_rate_limits_lookup_idx on submission_rate_limits (request_hash, endpoint, created_at desc);
create index if not exists submission_rate_limits_created_at_idx on submission_rate_limits (created_at desc);
