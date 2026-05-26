create table if not exists public.purchase_bill_receipt_allocations (
  id text primary key,
  purchase_bill_id text not null references public.purchase_bills(id) on delete cascade,
  purchase_bill_item_id text not null unique references public.purchase_bill_items(id) on delete cascade,
  weight_ticket_id text not null references public.weight_tickets(id) on delete cascade,
  weight_ticket_product_summary_id text not null references public.weight_ticket_product_summaries(id) on delete cascade,
  allocated_qty numeric not null default 0,
  allocated_gross_weight numeric not null default 0,
  allocated_deduct_weight numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists idx_purchase_bill_receipt_allocations_bill
  on public.purchase_bill_receipt_allocations (purchase_bill_id);

create index if not exists idx_purchase_bill_receipt_allocations_ticket
  on public.purchase_bill_receipt_allocations (weight_ticket_id);

create index if not exists idx_purchase_bill_receipt_allocations_summary
  on public.purchase_bill_receipt_allocations (weight_ticket_product_summary_id);

create table if not exists public.purchase_bill_po_allocations (
  id text primary key,
  purchase_bill_id text not null references public.purchase_bills(id) on delete cascade,
  purchase_bill_item_id text not null unique references public.purchase_bill_items(id) on delete cascade,
  po_buy_id text not null references public.po_buys(id) on delete cascade,
  allocated_qty numeric not null default 0,
  allocated_amount numeric not null default 0,
  unit_price_snapshot numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists idx_purchase_bill_po_allocations_bill
  on public.purchase_bill_po_allocations (purchase_bill_id);

create index if not exists idx_purchase_bill_po_allocations_po
  on public.purchase_bill_po_allocations (po_buy_id);

with resolved_receipt_source as (
  select
    pbi.id as purchase_bill_item_id,
    pbi.purchase_bill_id,
    pb.created_by,
    pb.updated_by,
    coalesce((pbi.source_snapshot ->> 'receiptTicketId')::text, '') as weight_ticket_id,
    coalesce(
      (pbi.source_snapshot ->> 'receiptSummaryId')::text,
      bridge.summary_id,
      ''
    ) as weight_ticket_product_summary_id,
    coalesce(pbi.qty, 0)::numeric as allocated_qty
  from public.purchase_bill_items pbi
  join public.purchase_bills pb on pb.id = pbi.purchase_bill_id
  left join public.weight_ticket_product_summary_lines bridge
    on bridge.weight_ticket_line_id = (pbi.source_snapshot ->> 'receiptLineId')::text
)
insert into public.purchase_bill_receipt_allocations (
  id,
  purchase_bill_id,
  purchase_bill_item_id,
  weight_ticket_id,
  weight_ticket_product_summary_id,
  allocated_qty,
  allocated_gross_weight,
  allocated_deduct_weight,
  created_at,
  created_by
)
select
  'PBRA-' || gen_random_uuid()::text,
  src.purchase_bill_id,
  src.purchase_bill_item_id,
  src.weight_ticket_id,
  src.weight_ticket_product_summary_id,
  src.allocated_qty,
  case
    when coalesce(wts.net_weight, 0) = 0 then 0
    else coalesce(wts.gross_weight, 0) * src.allocated_qty / nullif(wts.net_weight, 0)
  end as allocated_gross_weight,
  case
    when coalesce(wts.net_weight, 0) = 0 then 0
    else coalesce(wts.deduct_weight, 0) * src.allocated_qty / nullif(wts.net_weight, 0)
  end as allocated_deduct_weight,
  now(),
  coalesce(src.updated_by, src.created_by)
from resolved_receipt_source src
join public.weight_ticket_product_summaries wts
  on wts.id = src.weight_ticket_product_summary_id
where src.weight_ticket_id <> ''
  and src.weight_ticket_product_summary_id <> ''
  and not exists (
    select 1
    from public.purchase_bill_receipt_allocations existing
    where existing.purchase_bill_item_id = src.purchase_bill_item_id
  );

insert into public.purchase_bill_po_allocations (
  id,
  purchase_bill_id,
  purchase_bill_item_id,
  po_buy_id,
  allocated_qty,
  allocated_amount,
  unit_price_snapshot,
  created_at,
  created_by
)
select
  'PBPA-' || gen_random_uuid()::text,
  pbi.purchase_bill_id,
  pbi.id,
  pbi.po_buy_id,
  coalesce(pbi.qty, 0)::numeric,
  coalesce(pbi.amount, 0)::numeric,
  coalesce(pbi.price, 0)::numeric,
  now(),
  coalesce(pb.updated_by, pb.created_by)
from public.purchase_bill_items pbi
join public.purchase_bills pb on pb.id = pbi.purchase_bill_id
where pbi.po_buy_id is not null
  and not exists (
    select 1
    from public.purchase_bill_po_allocations existing
    where existing.purchase_bill_item_id = pbi.id
  );
