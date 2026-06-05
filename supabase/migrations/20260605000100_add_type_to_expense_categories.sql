alter table public.expense_categories
  add column if not exists type text;
