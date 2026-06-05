drop index if exists public.expense_types_legacy_id_key;

drop index if exists public.expense_categories_legacy_id_key;

alter table public.expense_types
  drop column if exists legacy_id;

alter table public.expense_categories
  drop column if exists legacy_id;

alter table public.expenses
  drop column if exists category_legacy_id;
