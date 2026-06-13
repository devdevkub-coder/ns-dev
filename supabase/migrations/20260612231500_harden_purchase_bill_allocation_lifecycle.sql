alter table public.purchase_bill_items
  add column if not exists item_status text not null default 'active',
  add column if not exists item_version integer not null default 1,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by text,
  add column if not exists superseded_reason text;

alter table public.purchase_bill_receipt_allocations
  add column if not exists allocation_status text not null default 'active',
  add column if not exists released_at timestamptz,
  add column if not exists released_by text,
  add column if not exists release_reason text;

alter table public.purchase_bill_po_allocations
  add column if not exists allocation_status text not null default 'active',
  add column if not exists released_at timestamptz,
  add column if not exists released_by text,
  add column if not exists release_reason text;

alter table public.purchase_bill_items
  drop constraint if exists uq_purchase_bill_items_bill_line;

drop index if exists public.uq_purchase_bill_items_bill_line;

create unique index if not exists uq_purchase_bill_items_active_bill_line
  on public.purchase_bill_items(purchase_bill_id, line_no)
  where item_status = 'active';

create index if not exists idx_purchase_bill_items_active_bill
  on public.purchase_bill_items(purchase_bill_id, line_no)
  where item_status = 'active';

create index if not exists idx_purchase_bill_items_bill_status_version
  on public.purchase_bill_items(purchase_bill_id, item_status, item_version desc, line_no);

create index if not exists idx_purchase_bill_receipt_allocations_active_ticket
  on public.purchase_bill_receipt_allocations(weight_ticket_id, weight_ticket_product_summary_id, purchase_bill_id)
  where allocation_status = 'active';

create index if not exists idx_purchase_bill_receipt_allocations_active_bill
  on public.purchase_bill_receipt_allocations(purchase_bill_id, purchase_bill_item_id)
  where allocation_status = 'active';

create index if not exists idx_purchase_bill_po_allocations_active_po
  on public.purchase_bill_po_allocations(po_buy_id, purchase_bill_id, purchase_bill_item_id)
  where allocation_status = 'active';

create index if not exists idx_purchase_bill_po_allocations_active_bill
  on public.purchase_bill_po_allocations(purchase_bill_id, purchase_bill_item_id)
  where allocation_status = 'active';

comment on column public.purchase_bill_items.item_status is
  'Lifecycle status for PB line snapshots. Active lines are the current editable/read-model rows; superseded lines remain for audit.';

comment on column public.purchase_bill_items.item_version is
  'Monotonic version per purchase bill edit cycle; preserved to trace previous line snapshots without delete/rebuild.';

comment on column public.purchase_bill_receipt_allocations.allocation_status is
  'Lifecycle status for WTI-to-PB allocation facts. Active rows drive availability/reconciliation; released rows remain as audit history.';

comment on column public.purchase_bill_po_allocations.allocation_status is
  'Lifecycle status for POB-to-PB allocation facts. Active rows drive outstanding/reconciliation; released rows remain as audit history.';

comment on index public.uq_purchase_bill_items_active_bill_line is
  'Only one active line number per purchase bill; superseded line versions can keep the same historical line number.';
