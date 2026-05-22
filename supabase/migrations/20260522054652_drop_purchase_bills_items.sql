-- purchase bill line rows now live in public.purchase_bill_items.
-- This drops the old JSONB compatibility column after backfill and API migration.

alter table public.purchase_bills
drop column if exists items;
