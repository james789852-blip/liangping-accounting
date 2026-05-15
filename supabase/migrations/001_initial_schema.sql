-- ============================================================
-- 梁平作帳系統 - 初始資料庫 Schema
-- ============================================================

-- 啟用 UUID 擴充
create extension if not exists "uuid-ossp";

-- ============================================================
-- 1. companies（公司）
-- ============================================================
create table companies (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  tax_id     text,
  created_at timestamptz default now()
);

-- ============================================================
-- 2. stores（店家）
-- ============================================================
create table stores (
  id                uuid primary key default uuid_generate_v4(),
  company_id        uuid references companies(id) on delete cascade,
  name              text not null,
  mode              text not null check (mode in ('ichef','handwrite','mixed')),
  uber_enabled      boolean default false,
  uber_accounts     jsonb default '[]',
  panda_enabled     boolean default false,
  panda_rate        decimal(5,2) default 28,
  online_enabled    boolean default false,
  online_rate       decimal(5,2) default 3.17,
  twpay_enabled     boolean default false,
  twpay_rate        decimal(5,2) default 1,
  ichef_uber_linked boolean default false,
  petty_cash        integer default 35000,
  active            boolean default true,
  created_at        timestamptz default now()
);

-- ============================================================
-- 3. user_profiles（使用者資料，搭配 auth.users）
-- ============================================================
create table user_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  name          text not null,
  phone         text,
  role          text not null check (role in ('店長','副店長','助理','顧問','經理','總監')),
  store_ids     uuid[] default '{}',
  active        boolean default true,
  last_login_at timestamptz,
  created_at    timestamptz default now()
);

-- ============================================================
-- 4. role_settings（職務權限設定）
-- ============================================================
create table role_settings (
  role        text primary key,
  portal      text not null check (portal in ('manager','hq')),
  permissions jsonb not null default '{}',
  updated_by  uuid references auth.users(id),
  updated_at  timestamptz default now()
);

-- ============================================================
-- 5. central_kitchen_prices（央廚單價）
-- ============================================================
create table central_kitchen_prices (
  id           uuid primary key default uuid_generate_v4(),
  item_name    text not null,
  unit_price   decimal(10,2) not null,
  excel_column text,
  active       boolean default true,
  updated_by   uuid references auth.users(id),
  updated_at   timestamptz default now()
);

-- ============================================================
-- 6. central_kitchen_price_history（央廚單價異動紀錄）
-- ============================================================
create table central_kitchen_price_history (
  id          uuid primary key default uuid_generate_v4(),
  item_name   text not null,
  old_price   decimal(10,2),
  new_price   decimal(10,2) not null,
  changed_by  uuid references auth.users(id),
  changed_at  timestamptz default now(),
  reason      text
);

-- ============================================================
-- 7. daily_closings（每日結帳主表）
-- ============================================================
create table daily_closings (
  id                      uuid primary key default uuid_generate_v4(),
  store_id                uuid not null references stores(id),
  manager_id              uuid not null references auth.users(id),
  business_date           date not null,
  status                  text not null default 'draft' check (status in ('draft','submitted','verified','disputed')),
  total_revenue           decimal(12,2) default 0,
  total_cost              decimal(12,2) default 0,
  expected_remit          decimal(12,2) default 0,
  actual_remit            decimal(12,2) default 0,
  should_include_delivery decimal(12,2) default 0,
  variance                decimal(12,2) default 0,
  note                    text,
  submitted_at            timestamptz,
  verified_at             timestamptz,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now(),
  unique (store_id, business_date)
);

-- ============================================================
-- 8. revenue_items（營收明細）
-- ============================================================
create table revenue_items (
  id           uuid primary key default uuid_generate_v4(),
  closing_id   uuid not null references daily_closings(id) on delete cascade,
  channel      text not null check (channel in ('pos','uber','panda','twpay','online','handwrite')),
  account_name text,
  gross_amount decimal(12,2) not null default 0,
  is_cash      boolean default false,
  created_at   timestamptz default now()
);

-- ============================================================
-- 9. handwrite_orders（手寫訂單）
-- ============================================================
create table handwrite_orders (
  id           uuid primary key default uuid_generate_v4(),
  closing_id   uuid not null references daily_closings(id) on delete cascade,
  store_id     uuid not null references stores(id),
  order_no     text,
  amount       decimal(10,2) not null,
  entered_by   uuid references auth.users(id),
  entered_at   timestamptz default now(),
  locked_at    timestamptz,
  edit_history jsonb default '[]'
);

-- ============================================================
-- 10. expense_categories（費用分類）
-- ============================================================
create table expense_categories (
  id               uuid primary key default uuid_generate_v4(),
  store_id         uuid references stores(id),
  name             text not null,
  type             text not null check (type in ('food','expense','other')),
  accounting_type  text,
  is_monthly       boolean default false,
  sort_order       integer default 0
);

-- ============================================================
-- 11. order_items（叫貨明細）
-- ============================================================
create table order_items (
  id           uuid primary key default uuid_generate_v4(),
  closing_id   uuid not null references daily_closings(id) on delete cascade,
  category_id  uuid references expense_categories(id),
  vendor       text,
  item_name    text not null,
  unit_price   decimal(10,2) not null,
  quantity     decimal(10,3) not null,
  total_amount decimal(12,2) not null,
  excel_column text,
  receipt_id   uuid,
  note         text,
  created_at   timestamptz default now()
);

-- ============================================================
-- 12. expense_items（其他費用明細）
-- ============================================================
create table expense_items (
  id           uuid primary key default uuid_generate_v4(),
  closing_id   uuid not null references daily_closings(id) on delete cascade,
  category_id  uuid references expense_categories(id),
  amount       decimal(12,2) not null,
  vendor       text,
  receipt_id   uuid,
  note         text,
  created_at   timestamptz default now()
);

-- ============================================================
-- 13. cash_counts（現金清點）
-- ============================================================
create table cash_counts (
  id          uuid primary key default uuid_generate_v4(),
  closing_id  uuid not null references daily_closings(id) on delete cascade unique,
  bills_1000  integer default 0,
  bills_500   integer default 0,
  bills_100   integer default 0,
  coins_50    integer default 0,
  coins_10    integer default 0,
  coins_5     integer default 0,
  coins_1     integer default 0,
  cash_total  decimal(12,2) generated always as (
    bills_1000 * 1000 + bills_500 * 500 + bills_100 * 100 +
    coins_50 * 50 + coins_10 * 10 + coins_5 * 5 + coins_1 * 1
  ) stored,
  created_at  timestamptz default now()
);

-- ============================================================
-- 14. receipts（發票收據）
-- ============================================================
create table receipts (
  id             uuid primary key default uuid_generate_v4(),
  closing_id     uuid not null references daily_closings(id) on delete cascade,
  store_id       uuid not null references stores(id),
  image_url      text not null,
  type           text not null check (type in ('invoice','receipt','手寫')),
  ocr_amount     decimal(12,2),
  ocr_vendor     text,
  ocr_date       date,
  manual_amount  decimal(12,2),
  review_status  text default 'pending' check (review_status in ('pending','approved','rejected')),
  reviewer_id    uuid references auth.users(id),
  uploaded_at    timestamptz default now()
);

-- ============================================================
-- 15. platform_screenshots（平台截圖）
-- ============================================================
create table platform_screenshots (
  id             uuid primary key default uuid_generate_v4(),
  closing_id     uuid not null references daily_closings(id) on delete cascade,
  store_id       uuid not null references stores(id),
  platform       text not null check (platform in ('uber','panda','twpay','online')),
  account_name   text,
  image_url      text not null,
  ocr_amount     decimal(12,2),
  input_amount   decimal(12,2),
  diff           decimal(12,2),
  review_status  text default 'pending_review' check (review_status in (
    'auto_pass','pending_review','approved_use_ocr',
    'approved_use_input','rejected'
  )),
  reviewer_id    uuid references auth.users(id),
  reviewed_at    timestamptz,
  uploaded_at    timestamptz default now()
);

-- ============================================================
-- 16. platform_payouts（平台匯款紀錄）
-- ============================================================
create table platform_payouts (
  id            uuid primary key default uuid_generate_v4(),
  store_id      uuid not null references stores(id),
  platform      text not null check (platform in ('uber','panda','twpay','online')),
  account_name  text,
  period_start  date not null,
  period_end    date not null,
  raw_total     decimal(12,2) not null,
  actual_amount decimal(12,2),
  diff          decimal(12,2),
  diff_rate     decimal(8,4),
  note          text,
  recorded_by   uuid references auth.users(id),
  recorded_at   timestamptz default now()
);

-- ============================================================
-- 17. payout_details（匯款明細）
-- ============================================================
create table payout_details (
  id         uuid primary key default uuid_generate_v4(),
  payout_id  uuid not null references platform_payouts(id) on delete cascade,
  type       text not null check (type in ('commission','ad','subsidy','refund','other')),
  amount     decimal(12,2) not null,
  note       text,
  created_at timestamptz default now()
);

-- ============================================================
-- 18. menu_videos（菜單影片）
-- ============================================================
create table menu_videos (
  id            uuid primary key default uuid_generate_v4(),
  closing_id    uuid references daily_closings(id),
  store_id      uuid not null references stores(id),
  business_date date not null,
  file_url      text not null,
  file_size     bigint,
  duration_sec  integer,
  resolution    text,
  original_size bigint,
  uploaded_by   uuid references auth.users(id),
  uploaded_at   timestamptz default now(),
  review_status text default 'pending' check (review_status in ('pending','approved','rejected')),
  reviewer_id   uuid references auth.users(id),
  archive_date  date
);

-- ============================================================
-- 19. review_logs（審核紀錄）
-- ============================================================
create table review_logs (
  id               uuid primary key default uuid_generate_v4(),
  receipt_id       uuid references receipts(id),
  order_item_id    uuid references order_items(id),
  screenshot_id    uuid references platform_screenshots(id),
  ocr_amount       decimal(12,2),
  input_amount     decimal(12,2),
  diff             decimal(12,2),
  auto_status      text check (auto_status in ('pass','mismatch','unreadable','no_receipt')),
  reviewer_id      uuid references auth.users(id),
  decision         text check (decision in (
    'approved_use_ocr','approved_use_input','rejected','manual_fix'
  )),
  final_amount     decimal(12,2),
  reviewed_at      timestamptz default now(),
  note             text
);

-- ============================================================
-- 20. audit_logs（稽核日誌）
-- ============================================================
create table audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  event_type  text not null,
  severity    text not null default 'info' check (severity in ('info','warn','error')),
  store_id    uuid references stores(id),
  user_id     uuid references auth.users(id),
  closing_id  uuid references daily_closings(id),
  description text not null,
  metadata    jsonb default '{}',
  created_at  timestamptz default now()
);

-- ============================================================
-- 索引
-- ============================================================
create index idx_daily_closings_store_date on daily_closings(store_id, business_date);
create index idx_daily_closings_status on daily_closings(status);
create index idx_revenue_items_closing on revenue_items(closing_id);
create index idx_order_items_closing on order_items(closing_id);
create index idx_receipts_closing on receipts(closing_id);
create index idx_platform_screenshots_closing on platform_screenshots(closing_id);
create index idx_audit_logs_created on audit_logs(created_at desc);
create index idx_audit_logs_store on audit_logs(store_id);
create index idx_user_profiles_role on user_profiles(role);

-- ============================================================
-- RLS（Row Level Security）
-- ============================================================
alter table companies enable row level security;
alter table stores enable row level security;
alter table user_profiles enable row level security;
alter table role_settings enable row level security;
alter table central_kitchen_prices enable row level security;
alter table central_kitchen_price_history enable row level security;
alter table daily_closings enable row level security;
alter table revenue_items enable row level security;
alter table handwrite_orders enable row level security;
alter table expense_categories enable row level security;
alter table order_items enable row level security;
alter table expense_items enable row level security;
alter table cash_counts enable row level security;
alter table receipts enable row level security;
alter table platform_screenshots enable row level security;
alter table platform_payouts enable row level security;
alter table payout_details enable row level security;
alter table menu_videos enable row level security;
alter table review_logs enable row level security;
alter table audit_logs enable row level security;

-- Helper function：取得目前使用者角色
create or replace function get_my_role()
returns text language sql security definer stable as $$
  select role from user_profiles where user_id = auth.uid()
$$;

-- Helper function：取得目前使用者可看的店
create or replace function get_my_store_ids()
returns uuid[] language sql security definer stable as $$
  select store_ids from user_profiles where user_id = auth.uid()
$$;

-- Helper function：是否為總公司端（顧問/經理/總監）
create or replace function is_hq_user()
returns boolean language sql security definer stable as $$
  select role in ('顧問','經理','總監') from user_profiles where user_id = auth.uid()
$$;

-- RLS policies: user_profiles（自己看自己，總監看全部）
create policy "user_profiles_select" on user_profiles
  for select using (
    user_id = auth.uid() or get_my_role() = '總監'
  );

create policy "user_profiles_insert" on user_profiles
  for insert with check (get_my_role() = '總監');

create policy "user_profiles_update" on user_profiles
  for update using (
    user_id = auth.uid() or get_my_role() = '總監'
  );

-- RLS policies: stores（店長端看自己的店，總公司端看全部）
create policy "stores_select" on stores
  for select using (
    id = any(get_my_store_ids()) or is_hq_user()
  );

create policy "stores_update" on stores
  for update using (get_my_role() = '總監');

-- RLS policies: daily_closings
create policy "daily_closings_select" on daily_closings
  for select using (
    store_id = any(get_my_store_ids()) or is_hq_user()
  );

create policy "daily_closings_insert" on daily_closings
  for insert with check (
    store_id = any(get_my_store_ids())
  );

create policy "daily_closings_update" on daily_closings
  for update using (
    (store_id = any(get_my_store_ids()) and status = 'draft')
    or is_hq_user()
  );

-- RLS policies: central_kitchen_prices（全部人可看，只有總監可改）
create policy "ck_prices_select" on central_kitchen_prices
  for select using (true);

create policy "ck_prices_insert" on central_kitchen_prices
  for insert with check (get_my_role() = '總監');

create policy "ck_prices_update" on central_kitchen_prices
  for update using (get_my_role() in ('經理', '總監'));

-- RLS policies: audit_logs（顧問以上可看）
create policy "audit_logs_select" on audit_logs
  for select using (is_hq_user());

create policy "audit_logs_insert" on audit_logs
  for insert with check (true);

-- RLS policies: companies（全部登入者可看）
create policy "companies_select" on companies
  for select using (auth.uid() is not null);

-- RLS policies: role_settings（全部登入者可看，總監可改）
create policy "role_settings_select" on role_settings
  for select using (auth.uid() is not null);

create policy "role_settings_update" on role_settings
  for update using (get_my_role() = '總監');

-- ============================================================
-- 初始資料種子
-- ============================================================

-- 公司
insert into companies (id, name, tax_id) values
  ('00000000-0000-0000-0000-000000000001', '梁平開發有限公司', '');

-- 10 家店
insert into stores (id, company_id, name, mode, uber_enabled, uber_accounts, panda_enabled, panda_rate, twpay_enabled, twpay_rate, online_enabled, online_rate, petty_cash) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '鑫耀鑫', 'ichef', true, '["鑫營","五分舖"]', true, 28, false, 0, false, 0, 35000),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', '梁鑫',   'ichef', true, '["梁鑫"]', false, 0, false, 0, false, 0, 35000),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '鑫營',   'ichef', true, '["鑫營本店","鑫營外帶"]', false, 0, true, 1, false, 0, 35000),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '府中',   'ichef', true, '["府中"]', false, 0, false, 0, false, 0, 25000),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', '景新',   'handwrite', false, '[]', false, 0, true, 1, true, 3.17, 20000),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '天津',   'ichef', true, '["天津A","天津B"]', true, 28, false, 0, false, 0, 30000),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', '心惦',   'handwrite', false, '[]', false, 0, false, 0, false, 0, 15000),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', '大直',   'ichef', true, '["大直"]', true, 28, false, 0, false, 0, 35000),
  ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', '幸福',   'ichef', true, '["幸福"]', false, 0, false, 0, false, 0, 30000),
  ('10000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', '福城',   'handwrite', false, '[]', false, 0, true, 1, false, 0, 20000);

-- 央廚 6 品項單價（預設值）
insert into central_kitchen_prices (item_name, unit_price, excel_column) values
  ('雞肉',   0, 'ck_chicken'),
  ('好吃醬', 0, 'ck_sauce'),
  ('雞湯',   0, 'ck_soup'),
  ('貢丸',   0, 'ck_meatball'),
  ('辣椒',   0, 'ck_chili'),
  ('魚丸',   0, 'ck_fishball');

-- 職務權限預設值
insert into role_settings (role, portal, permissions) values
  ('店長',   'manager', '{"view_own_store":true,"edit_closing":true,"upload_files":true,"export_own":true}'),
  ('副店長', 'manager', '{"view_own_store":true,"edit_closing":true,"upload_files":true,"export_own":true}'),
  ('助理',   'manager', '{"view_own_store":true,"edit_closing":true,"upload_files":true,"export_own":false}'),
  ('顧問',   'hq',      '{"view_all_stores":true,"review_receipts":true,"record_payouts":true,"view_audit":true,"export_all":true}'),
  ('經理',   'hq',      '{"view_all_stores":true,"review_receipts":true,"record_payouts":true,"view_audit":true,"export_all":true,"manage_uber":true}'),
  ('總監',   'hq',      '{"view_all_stores":true,"review_receipts":true,"record_payouts":true,"view_audit":true,"export_all":true,"manage_uber":true,"edit_commission":true,"manage_users":true,"manage_roles":true,"edit_ck_prices":true}');

-- 當日現金支出（2026-05-15 新增）
create table if not exists expense_items (
  id uuid primary key default gen_random_uuid(),
  closing_id uuid not null references daily_closings(id) on delete cascade,
  description text not null default '',
  amount numeric(10,2) not null default 0,
  created_at timestamptz default now()
);
alter table expense_items enable row level security;
create policy "expense_items_all" on expense_items
  for all using (
    closing_id in (
      select id from daily_closings where store_id = any(get_my_store_ids())
    )
  );
alter table daily_closings add column if not exists total_expenses numeric(10,2) not null default 0;
