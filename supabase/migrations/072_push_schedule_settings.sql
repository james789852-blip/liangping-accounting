-- HQ-managed schedule for business push reminders. All clock times are Asia/Taipei.
create table if not exists push_schedule_settings (
  id smallint primary key default 1 check (id = 1),
  accounting_first_time text not null default '23:00',
  accounting_final_time text not null default '23:30',
  ck_handoff_time text not null default '17:00',
  returned_reminder_minutes integer not null default 60,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint push_schedule_accounting_first_time_format check (
    accounting_first_time ~ '^(?:[01][0-9]|2[0-3]):(?:00|05|10|15|20|25|30|35|40|45|50|55)$'
  ),
  constraint push_schedule_accounting_final_time_format check (
    accounting_final_time ~ '^(?:[01][0-9]|2[0-3]):(?:00|05|10|15|20|25|30|35|40|45|50|55)$'
  ),
  constraint push_schedule_ck_handoff_time_format check (
    ck_handoff_time ~ '^(?:[01][0-9]|2[0-3]):(?:00|05|10|15|20|25|30|35|40|45|50|55)$'
  ),
  constraint push_schedule_returned_minutes_range check (
    returned_reminder_minutes between 15 and 1440 and returned_reminder_minutes % 15 = 0
  )
);

insert into push_schedule_settings (id)
values (1)
on conflict (id) do nothing;

alter table push_schedule_settings enable row level security;
revoke all on table push_schedule_settings from anon, authenticated;
grant all on table push_schedule_settings to service_role;

comment on table push_schedule_settings is
  '總公司管理的帳務推播排程；時間欄位使用 Asia/Taipei，固定只有 id=1。';
