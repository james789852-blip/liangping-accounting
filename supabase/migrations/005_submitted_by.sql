alter table daily_closings
  add column if not exists submitted_by uuid references auth.users(id);
