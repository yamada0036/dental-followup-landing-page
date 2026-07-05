-- Praxora P0 funnel schema for Supabase/Postgres.
-- Run this in the Supabase SQL editor before enabling production traffic.

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
  unscheduled_followup_process text,
  recall_workflow_status text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  email_status text not null default 'pending'
);

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
  notes text
);

create index if not exists leak_reviews_created_at_idx on leak_reviews (created_at desc);
create index if not exists leak_reviews_email_idx on leak_reviews (email);
