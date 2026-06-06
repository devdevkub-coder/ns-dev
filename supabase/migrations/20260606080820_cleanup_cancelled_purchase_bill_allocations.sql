-- Cleanup legacy purchase-bill allocation facts left behind by bills that are
-- already cancelled. Allocation tables represent active document consumption;
-- purchase-bill history/status logs are the audit source for cancelled bills.

create temp table _cancelled_purchase_bill_ids as
select id
from public.purchase_bills
where lower(coalesce(status, '')) = 'cancelled';

create temp table _affected_weight_ticket_ids as
select distinct pbra.weight_ticket_id
from public.purchase_bill_receipt_allocations pbra
join _cancelled_purchase_bill_ids pb on pb.id = pbra.purchase_bill_id;

delete from public.purchase_bill_receipt_allocations pbra
using _cancelled_purchase_bill_ids pb
where pbra.purchase_bill_id = pb.id;

delete from public.purchase_bill_po_allocations pbpa
using _cancelled_purchase_bill_ids pb
where pbpa.purchase_bill_id = pb.id;

with active_summary_usage as (
  select
    pbra.weight_ticket_product_summary_id,
    sum(pbra.allocated_qty) as billed_weight
  from public.purchase_bill_receipt_allocations pbra
  join public.purchase_bills pb on pb.id = pbra.purchase_bill_id
  where lower(coalesce(pb.status, '')) <> 'cancelled'
    and pbra.weight_ticket_id in (select weight_ticket_id from _affected_weight_ticket_ids)
  group by pbra.weight_ticket_product_summary_id
)
update public.weight_ticket_product_summaries wts
set
  billed_weight = coalesce((
    select active_summary_usage.billed_weight
    from active_summary_usage
    where active_summary_usage.weight_ticket_product_summary_id = wts.id
  ), 0),
  remaining_weight = greatest(0, wts.net_weight - coalesce((
    select active_summary_usage.billed_weight
    from active_summary_usage
    where active_summary_usage.weight_ticket_product_summary_id = wts.id
  ), 0)),
  updated_at = now()
from _affected_weight_ticket_ids affected
where wts.weight_ticket_id = affected.weight_ticket_id;

with ticket_totals as (
  select
    wt.id as weight_ticket_id,
    coalesce(sum(wtl.net_weight), 0) as total_weight
  from public.weight_tickets wt
  left join public.weight_ticket_lines wtl on wtl.weight_ticket_id = wt.id
  where wt.id in (select weight_ticket_id from _affected_weight_ticket_ids)
  group by wt.id
),
active_ticket_usage as (
  select
    pbra.weight_ticket_id,
    sum(pbra.allocated_qty) as billed_weight
  from public.purchase_bill_receipt_allocations pbra
  join public.purchase_bills pb on pb.id = pbra.purchase_bill_id
  where lower(coalesce(pb.status, '')) <> 'cancelled'
    and pbra.weight_ticket_id in (select weight_ticket_id from _affected_weight_ticket_ids)
  group by pbra.weight_ticket_id
)
update public.weight_tickets wt
set
  status = case
    when wt.cancelled_at is not null then wt.status
    when wt.doc_type <> 'WTI' then wt.status
    when coalesce(active_ticket_usage.billed_weight, 0) <= 0.0001 then 'received'
    when coalesce(active_ticket_usage.billed_weight, 0) + 0.0001 < ticket_totals.total_weight then 'partially_billed'
    else 'billed'
  end,
  updated_at = now()
from ticket_totals
left join active_ticket_usage
  on active_ticket_usage.weight_ticket_id = ticket_totals.weight_ticket_id
where wt.id = ticket_totals.weight_ticket_id;
