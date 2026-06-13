drop index if exists public.idx_stock_ledger_ref_lookup;

create index idx_stock_ledger_ref_lookup
  on public.stock_ledger(ref_type, ref_no, product_id)
  where ref_type = any (array[
    'PB'::text,
    'PB-CANCEL'::text,
    'PB-EDIT-REV'::text,
    'SB'::text,
    'SB-CANCEL'::text,
    'PSALE'::text
  ]);

create index if not exists idx_stock_ledger_purchase_reversal_ref
  on public.stock_ledger(ref_no, ref_type, branch_id, warehouse_id, product_id)
  where ref_type = any (array['PB'::text, 'PB-CANCEL'::text, 'PB-EDIT-REV'::text]);

create index if not exists idx_stock_ledger_sales_reversal_ref
  on public.stock_ledger(ref_no, ref_type, branch_id, warehouse_id, product_id)
  where ref_type = any (array['SB'::text, 'SB-CANCEL'::text, 'PSALE'::text]);

comment on index public.idx_stock_ledger_ref_lookup is
  'Lookup index for source-document stock movements, including append-only reversal ref_types.';

comment on index public.idx_stock_ledger_purchase_reversal_ref is
  'Purchase bill append/reversal audit lookup. PB rows are never deleted during edit/cancel.';

comment on index public.idx_stock_ledger_sales_reversal_ref is
  'Sales bill and pending-sale append/reversal audit lookup.';
