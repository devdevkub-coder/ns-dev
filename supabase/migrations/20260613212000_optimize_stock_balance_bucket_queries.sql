-- Optimize stock balance bucket aggregation, detail drilldown, and active hold overlay.

create index if not exists idx_stock_ledger_balance_bucket
  on public.stock_ledger (
    product_id,
    branch_id,
    warehouse_id,
    output_category,
    lot_no,
    not_available_for_sale,
    date
  );

create index if not exists idx_stock_ledger_bucket_detail
  on public.stock_ledger (
    product_id,
    branch_id,
    warehouse_id,
    output_category,
    lot_no,
    not_available_for_sale,
    date desc,
    created_at desc,
    id desc
  );

create index if not exists idx_stock_holds_active_bucket_detail
  on public.stock_holds (
    product_id,
    branch_id,
    warehouse_id,
    output_category,
    lot_no,
    not_available_for_sale,
    held_at desc,
    id desc
  )
  where status = 'active';

comment on index public.idx_stock_ledger_balance_bucket is
  'Supports /stock/balance SQL bucket aggregation by product/branch/warehouse/status/lot/availability/date.';

comment on index public.idx_stock_ledger_bucket_detail is
  'Supports /stock/balance bucket detail drilldown and latest movement lookup.';

comment on index public.idx_stock_holds_active_bucket_detail is
  'Supports active hold overlay and bucket detail drilldown for /stock/balance.';
