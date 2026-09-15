-- Push reliability: durable schedule runs and short-window submission digests.

create table if not exists push_schedule_runs (
  id uuid primary key default uuid_generate_v4(),
  run_key text not null unique,
  schedule_key text not null,
  business_date date,
  scheduled_for timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  eligible_count integer not null default 0,
  target_device_count integer not null default 0,
  delivered_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists push_schedule_runs_key_time_idx
  on push_schedule_runs(schedule_key, started_at desc);

alter table push_schedule_runs enable row level security;
revoke all on table push_schedule_runs from anon, authenticated;
grant all on table push_schedule_runs to service_role;

create table if not exists push_submission_digest_items (
  id uuid primary key default uuid_generate_v4(),
  submission_event_id text not null unique,
  accounting_kind text not null check (accounting_kind in ('store', 'ck')),
  store_id uuid not null references stores(id) on delete cascade,
  record_id uuid not null,
  business_date date not null,
  sender_id uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'skipped')),
  processing_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists push_submission_digest_pending_idx
  on push_submission_digest_items(status, created_at) where status = 'pending';

alter table push_submission_digest_items enable row level security;
revoke all on table push_submission_digest_items from anon, authenticated;
grant all on table push_submission_digest_items to service_role;

comment on table push_schedule_runs is '推播排程每次預定執行的狀態、結果與補跑依據。';
comment on table push_submission_digest_items is '首次送審的短時間合併佇列；退回後重送不進此佇列。';
