-- 央廚配送單位欄位 & 配送單照片 URL
alter table central_kitchen_prices
  add column if not exists unit text default '份';

alter table daily_closings
  add column if not exists ck_delivery_photo_url text;

-- 設定預設單位
update central_kitchen_prices set unit = '盤' where item_name = '雞肉';
update central_kitchen_prices set unit = '鍋' where item_name = '好吃醬';
update central_kitchen_prices set unit = '包' where item_name = '雞湯';
update central_kitchen_prices set unit = '包' where item_name = '貢丸';
update central_kitchen_prices set unit = '包' where item_name = '魚丸';
update central_kitchen_prices set unit = '鍋' where item_name = '辣椒';
