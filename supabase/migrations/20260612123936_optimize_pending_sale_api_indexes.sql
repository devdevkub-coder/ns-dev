create index if not exists idx_stock_issues_doc_no
  on public.stock_issues (doc_no);

create index if not exists idx_stock_issues_status_date_doc
  on public.stock_issues (status, date desc, doc_no desc);

create index if not exists idx_stock_issues_date_doc
  on public.stock_issues (date desc, doc_no desc);

create index if not exists idx_stock_issues_converted_bill
  on public.stock_issues (converted_to_bill_id, status)
  where converted_to_bill_id is not null;

create index if not exists idx_stock_holds_consumed_ref
  on public.stock_holds (consumed_by_ref_type, consumed_by_ref_no, status);

drop index if exists public.idx_stock_ledger_ref_lookup;

create index idx_stock_ledger_ref_lookup
  on public.stock_ledger (ref_type, ref_no, product_id)
  where ref_type in ('PB', 'PB-CANCEL', 'PB-EDIT-REV', 'SB', 'SB-CANCEL', 'PSALE', 'PSALE-CANCEL');

drop index if exists public.idx_stock_ledger_sales_reversal_ref;

create index idx_stock_ledger_sales_reversal_ref
  on public.stock_ledger (ref_no, ref_type, branch_id, warehouse_id, product_id)
  where ref_type in ('SB', 'SB-CANCEL', 'PSALE', 'PSALE-CANCEL');

create index if not exists idx_stock_ledger_pending_sale_reversal_ref
  on public.stock_ledger (ref_type, ref_no, ref_id)
  where ref_type in ('PSALE', 'PSALE-CANCEL');

create index if not exists idx_weight_ticket_usage_logs_sales_bill_doc
  on public.weight_ticket_usage_logs (target_type, target_doc_no, action)
  where target_type = 'SALES_BILL';
