-- 在 item_column_mappings 加入廠商群組欄位（來自 Excel 第 1 列，如「菜商」、「免洗」、「央廚配送」）
alter table item_column_mappings add column if not exists vendor_group text;
