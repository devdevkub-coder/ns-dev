-- Optimize Purchase Bills list/create/options query paths.
-- Additive indexes only; no data or business-contract change.

create index if not exists idx_purchase_bills_created_doc_no
  on public.purchase_bills(created_at desc, doc_no desc);

create index if not exists idx_purchase_bills_branch_created_doc_no
  on public.purchase_bills(branch_id, created_at desc, doc_no desc)
  where branch_id is not null;

create index if not exists idx_purchase_bills_status_created_doc_no
  on public.purchase_bills(status, created_at desc, doc_no desc)
  where status is not null;

create index if not exists idx_purchase_bills_mode_created_doc_no
  on public.purchase_bills(transaction_mode, created_at desc, doc_no desc)
  where transaction_mode is not null;

create index if not exists idx_purchase_bills_source_created_doc_no
  on public.purchase_bills(purchase_source, created_at desc, doc_no desc)
  where purchase_source is not null;

create index if not exists idx_purchase_bills_doc_no_pattern
  on public.purchase_bills(doc_no text_pattern_ops);

create index if not exists idx_weight_tickets_wti_bill_options
  on public.weight_tickets(document_date desc, doc_no desc)
  where cancelled_at is null
    and doc_type = 'WTI'
    and status in ('received', 'partially_billed');

create index if not exists idx_weight_tickets_wti_branch_bill_options
  on public.weight_tickets(branch_id, document_date desc, doc_no desc)
  where cancelled_at is null
    and doc_type = 'WTI'
    and status in ('received', 'partially_billed');

create index if not exists idx_supplier_advances_active_advance_date_doc
  on public.supplier_advance_payments(advance_date desc, doc_no desc)
  where cancelled_at is null;

create index if not exists idx_supplier_advances_active_branch_advance_date_doc
  on public.supplier_advance_payments(branch_id, advance_date desc, doc_no desc)
  where cancelled_at is null
    and branch_id is not null;

create index if not exists idx_payments_active_bill_created
  on public.payments(bill_id, created_at asc)
  include (doc_no, amount, withholding_tax, discount, status)
  where status <> 'cancelled';

create index if not exists idx_payment_approvals_purchase_bill_locked
  on public.payment_approvals(source_id, status)
  include (doc_no)
  where source_type = 'purchase_bill'
    and status in ('approved', 'paid');

create index if not exists idx_purchase_bill_receipt_allocations_active_ticket_summary
  on public.purchase_bill_receipt_allocations(weight_ticket_id, weight_ticket_product_summary_id, purchase_bill_id)
  where allocation_status = 'active';

create index if not exists idx_purchase_bill_po_allocations_active_bill_item
  on public.purchase_bill_po_allocations(purchase_bill_id, purchase_bill_item_id)
  where allocation_status = 'active';
