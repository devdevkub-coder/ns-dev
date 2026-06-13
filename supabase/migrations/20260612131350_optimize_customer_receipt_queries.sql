-- Customer Receipt read/write query support.
-- These are additive indexes for the active `/api/sales/receipts` paths:
-- - outstanding Sales Bill queue ordered by newest bill first
-- - active receipt allocation existence checks from the queue
-- - Receipt Voucher history ordered by business date then created timestamp

drop index if exists public.idx_sales_bills_customer_receipt_outstanding_queue;

create index idx_sales_bills_customer_receipt_outstanding_queue
  on public.sales_bills (date desc, id desc)
  where receivable_balance > 0
    and status not in ('cancelled', 'canceled');

create index if not exists idx_customer_receipt_allocations_active_sales_bill
  on public.customer_receipt_allocations (sales_bill_id)
  where status = 'active';

create index if not exists idx_customer_receipts_history_order
  on public.customer_receipts (date desc, created_at desc, id desc);
