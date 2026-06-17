-- 放寬 revenue_items.channel 的 CHECK 限制，加入 'online_cash'
ALTER TABLE revenue_items
  DROP CONSTRAINT IF EXISTS revenue_items_channel_check;

ALTER TABLE revenue_items
  ADD CONSTRAINT revenue_items_channel_check
  CHECK (channel IN ('pos', 'uber', 'panda', 'twpay', 'online', 'online_cash', 'handwrite'));
