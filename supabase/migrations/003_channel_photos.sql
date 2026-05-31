-- 儲存平台截圖 URL（Uber/Panda/TW Pay 等）
alter table daily_closings
  add column if not exists channel_photo_urls jsonb default '{}';
