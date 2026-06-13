create index if not exists idx_receipt_vouchers_date_doc_no
  on public.receipt_vouchers(date desc, doc_no desc);

create index if not exists idx_receipt_vouchers_doc_no_pattern
  on public.receipt_vouchers(doc_no text_pattern_ops)
  where doc_no is not null;

create index if not exists idx_receipt_voucher_status_logs_voucher_created_asc
  on public.receipt_voucher_status_logs(receipt_voucher_id, created_at asc, id asc);

create index if not exists idx_purchase_bills_active_created_doc_no
  on public.purchase_bills(created_at desc, doc_no desc)
  where status not in ('cancelled', 'cancelled_supplier_swap');

create index if not exists idx_suppliers_active_code_name
  on public.suppliers(code asc, name asc)
  where active is true;
