alter table stores
  add column if not exists push_notifications_enabled boolean not null default true;

alter table user_profiles
  add column if not exists push_notifications_enabled boolean not null default true;

comment on column stores.push_notifications_enabled is
  '總公司是否允許發送此店家的帳目審核結果推播';

comment on column user_profiles.push_notifications_enabled is
  '此帳號是否允許接收帳務推播';
