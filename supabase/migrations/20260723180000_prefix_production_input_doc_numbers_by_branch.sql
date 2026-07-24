-- Production input documents are branch-scoped business documents.
-- Keep stock ledger references aligned with the renamed PI document numbers.

with po_map as (
  select
    po.id,
    po.doc_no as old_doc_no,
    'PO' || b.code || substring(po.doc_no from 3) as new_doc_no
  from public.production_orders po
  join public.branches b on b.id = po.branch_id
  where po.doc_no ~ '^PO[0-9]{4}-[0-9]{4}$'
)
update public.production_order_status_logs log
set order_doc_no = map.new_doc_no
from po_map map
where log.order_id = map.id;

with po_map as (
  select
    po.id,
    po.doc_no as old_doc_no,
    'PO' || b.code || substring(po.doc_no from 3) as new_doc_no
  from public.production_orders po
  join public.branches b on b.id = po.branch_id
  where po.doc_no ~ '^PO[0-9]{4}-[0-9]{4}$'
)
update public.production_orders po
set doc_no = map.new_doc_no
from po_map map
where po.id = map.id;

with pi_map as (
  select distinct
    pi.doc_no as old_doc_no,
    'PI' || b.code || substring(pi.doc_no from 3) as new_doc_no,
    po.branch_id
  from public.production_inputs pi
  join public.production_orders po on po.id = pi.order_id
  join public.branches b on b.id = po.branch_id
  where pi.doc_no ~ '^PI[0-9]{4}-[0-9]{4}$'
)
update public.stock_ledger ledger
set ref_no = map.new_doc_no
from pi_map map
where ledger.ref_type in ('PI', 'PI-RETURN')
  and ledger.ref_no = map.old_doc_no
  and ledger.branch_id = map.branch_id;

with pi_map as (
  select
    pi.id,
    pi.doc_no as old_doc_no,
    'PI' || b.code || substring(pi.doc_no from 3) as new_doc_no
  from public.production_inputs pi
  join public.production_orders po on po.id = pi.order_id
  join public.branches b on b.id = po.branch_id
  where pi.doc_no ~ '^PI[0-9]{4}-[0-9]{4}$'
)
update public.production_inputs pi
set doc_no = map.new_doc_no
from pi_map map
where pi.id = map.id;
