create table if not exists public.trading_cost_sources (
  id bigserial primary key,
  source_no text not null,
  source_type text not null default 'SPOT_MANUAL',
  date date not null,
  supplier_id bigint references public.suppliers(id) on delete set null,
  product_id bigint references public.products(id) on delete set null,
  product_code_snapshot text,
  product_name_snapshot text,
  supplier_name_snapshot text,
  qty numeric not null default 0,
  unit_cost numeric not null default 0,
  total_amount numeric not null default 0,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  constraint uq_trading_cost_sources_source_no unique (source_no),
  constraint trading_cost_sources_qty_nonnegative check (qty >= 0),
  constraint trading_cost_sources_unit_cost_nonnegative check (unit_cost >= 0),
  constraint trading_cost_sources_total_amount_nonnegative check (total_amount >= 0),
  constraint trading_cost_sources_status_chk check (status in ('active', 'exhausted', 'cancelled', 'reversed'))
);

alter table public.trading_allocation_facts
  add column if not exists trading_cost_source_id bigint references public.trading_cost_sources(id) on delete set null;

create index if not exists idx_trading_cost_sources_date
  on public.trading_cost_sources (date desc, id desc);

create index if not exists idx_trading_cost_sources_product_status
  on public.trading_cost_sources (product_id, status, date desc);

create index if not exists idx_trading_cost_sources_supplier_status
  on public.trading_cost_sources (supplier_id, status, date desc);

create index if not exists idx_trading_allocation_facts_cost_source
  on public.trading_allocation_facts (trading_cost_source_id, product_id);
