-- 收據類別與廠商設定
create table if not exists receipt_categories (
  id          uuid primary key default uuid_generate_v4(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  sort_order  int default 0,
  created_at  timestamptz default now(),
  unique(store_id, name)
);

create table if not exists receipt_vendors (
  id          uuid primary key default uuid_generate_v4(),
  store_id    uuid not null references stores(id) on delete cascade,
  category_id uuid not null references receipt_categories(id) on delete cascade,
  name        text not null,
  sort_order  int default 0,
  created_at  timestamptz default now(),
  unique(store_id, category_id, name)
);

alter table receipt_categories enable row level security;
alter table receipt_vendors enable row level security;

create policy "service role all receipt_categories"
  on receipt_categories for all using (true);
create policy "service role all receipt_vendors"
  on receipt_vendors for all using (true);
