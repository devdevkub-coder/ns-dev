create index if not exists idx_stock_ledger_production_source_movement
  on public.stock_ledger (ref_type, ref_id, movement_type)
  where ref_id is not null
    and ref_type in ('PI', 'PO2');
