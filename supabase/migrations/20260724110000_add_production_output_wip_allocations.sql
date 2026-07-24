alter table public.production_outputs
  add column if not exists source_wip_allocations jsonb;

comment on column public.production_outputs.source_wip_allocations is
  'Source WIP allocations for this output/loss row. Each item contains productCode, stockCategory, warehouseCode, qty, unitCost, and totalCost.';
