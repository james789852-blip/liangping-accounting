-- Durable in-app notifications, per-category controls, device visibility and retryable delivery jobs.

alter table user_profiles
  add column if not exists push_notification_preferences jsonb not null default '{
    "review_submission": true,
    "review_result": true,
    "accounting_reminder": true,
    "reimbursement_handoff": true,
    "hq_escalation": true
  }'::jsonb;

alter table stores
  add column if not exists push_notification_preferences jsonb not null default '{
    "review_result": true,
    "accounting_reminder": true,
    "reimbursement_handoff": true
  }'::jsonb;

alter table push_subscriptions
  add column if not exists device_name text,
  add column if not exists last_seen_at timestamptz not null default now();

create table if not exists app_notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid references stores(id) on delete set null,
  category text not null check (category in (
    'review_submission', 'review_result', 'accounting_reminder',
    'reimbursement_handoff', 'hq_escalation', 'system'
  )),
  title text not null,
  body text not null,
  url text not null default '/',
  tag text not null,
  source_key text not null,
  read_at timestamptz,
  clicked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_key)
);

create index if not exists app_notifications_user_created_idx
  on app_notifications(user_id, created_at desc);
create index if not exists app_notifications_user_unread_idx
  on app_notifications(user_id, created_at desc) where read_at is null;

alter table app_notifications enable row level security;

drop policy if exists "app_notifications_select_own" on app_notifications;
create policy "app_notifications_select_own" on app_notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "app_notifications_update_own" on app_notifications;
create policy "app_notifications_update_own" on app_notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on table app_notifications from anon;
grant select, update on table app_notifications to authenticated;
grant all on table app_notifications to service_role;

create table if not exists push_delivery_jobs (
  id uuid primary key default uuid_generate_v4(),
  notification_id uuid not null references app_notifications(id) on delete cascade,
  subscription_id uuid references push_subscriptions(id) on delete set null,
  device_name text,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, subscription_id)
);

create index if not exists push_delivery_jobs_pending_idx
  on push_delivery_jobs(status, next_attempt_at) where status = 'pending';
create index if not exists push_delivery_jobs_notification_idx
  on push_delivery_jobs(notification_id);

alter table push_delivery_jobs enable row level security;
revoke all on table push_delivery_jobs from anon, authenticated;
grant all on table push_delivery_jobs to service_role;

comment on table app_notifications is '帳務系統內通知中心；即使裝置推播失敗仍保留。';
comment on table push_delivery_jobs is '每則通知對每台裝置的 Web Push 投遞與重試狀態。';
