alter table public.production_outputs
  add column if not exists source_product_id bigint,
  add column if not exists source_stock_category text,
  add column if not exists source_warehouse_id bigint;

create index if not exists idx_production_outputs_wip_source
  on public.production_outputs (order_id, source_product_id, source_stock_category, source_warehouse_id)
  where status = 'active';
