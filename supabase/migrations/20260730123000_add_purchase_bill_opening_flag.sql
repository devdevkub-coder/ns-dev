alter table public.purchase_bills
  add column if not exists is_opening boolean not null default false;

create index if not exists idx_purchase_bills_opening
  on public.purchase_bills (is_opening, created_at);
