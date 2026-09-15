-- Shared ownership for HQ escalation notifications.
create table if not exists hq_notification_followups (
  id uuid primary key default uuid_generate_v4(),
  source_key text not null unique,
  kind text not null check (kind in ('accounting_missing', 'returned_accounting', 'ck_handoff')),
  store_id uuid references stores(id) on delete set null,
  title text not null,
  body text not null,
  url text not null default '/hq/accounting',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'resolved')),
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hq_notification_followups_claim_consistency check (
    (status = 'pending' and claimed_by is null and claimed_at is null)
    or (status = 'in_progress' and claimed_at is not null)
    or status = 'resolved'
  )
);

create index if not exists hq_notification_followups_status_idx
  on hq_notification_followups(status, created_at desc)
  where status <> 'resolved';

alter table hq_notification_followups enable row level security;
revoke all on table hq_notification_followups from anon, authenticated;
grant all on table hq_notification_followups to service_role;

comment on table hq_notification_followups is
  '總公司逾期與異常通知的共用接手狀態；由伺服器驗證審核權限後操作。';
