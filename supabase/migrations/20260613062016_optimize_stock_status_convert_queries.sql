-- Optimize Stock Status Convert (`SC`) history list and filter reads.
-- The page lists only the source/out row of each paired SC document.

CREATE INDEX IF NOT EXISTS idx_stock_ledger_sc_list
  ON public.stock_ledger (date DESC, created_at DESC, id DESC)
  WHERE ref_type = 'SC' AND qty_out > 0;

CREATE INDEX IF NOT EXISTS idx_stock_ledger_sc_filter
  ON public.stock_ledger (output_category, note, branch_id, warehouse_id, product_id, date DESC)
  WHERE ref_type = 'SC' AND qty_out > 0;

CREATE INDEX IF NOT EXISTS idx_stock_ledger_sc_transition_list
  ON public.stock_ledger (output_category, note, date DESC, created_at DESC, id DESC)
  WHERE ref_type = 'SC' AND qty_out > 0;
