drop index if exists public.idx_production_inputs_doc_no;
drop index if exists public.idx_production_outputs_doc_no;
drop index if exists public.idx_production_inputs_reversal_doc_no;
drop index if exists public.idx_production_outputs_reversal_doc_no;

create index if not exists idx_production_inputs_doc_no
  on public.production_inputs(doc_no);

create index if not exists idx_production_outputs_doc_no
  on public.production_outputs(doc_no);

create index if not exists idx_production_inputs_reversal_doc_no
  on public.production_inputs(reversal_doc_no)
  where reversal_doc_no is not null;

create index if not exists idx_production_outputs_reversal_doc_no
  on public.production_outputs(reversal_doc_no)
  where reversal_doc_no is not null;

create or replace view public.production_reconciliation_issues as
with
pi_fact as (
  select
    pi.doc_no,
    pi.order_id,
    po.doc_no as order_doc_no,
    sum(coalesce(pi.qty, 0)) as expected_qty,
    sum(coalesce(pi.total_cost, 0)) as expected_value
  from public.production_inputs pi
  join public.production_orders po on po.id = pi.order_id
  where pi.status = 'active'
  group by pi.doc_no, pi.order_id, po.doc_no
),
pi_ledger as (
  select
    sl.ref_no as doc_no,
    sum(case when sl.movement_type = 'PRODUCTION_INPUT_OUT' then coalesce(sl.qty_out, 0) else 0 end) as source_qty_out,
    sum(case when sl.movement_type = 'WIP_IN' then coalesce(sl.qty_in, 0) else 0 end) as wip_qty_in,
    sum(case when sl.movement_type = 'PRODUCTION_INPUT_OUT' then coalesce(sl.value_out, 0) else 0 end) as source_value_out,
    sum(case when sl.movement_type = 'WIP_IN' then coalesce(sl.value_in, 0) else 0 end) as wip_value_in
  from public.stock_ledger sl
  where sl.ref_type = 'PI'
  group by sl.ref_no
),
po2_fact as (
  select
    po2.doc_no,
    po2.order_id,
    po.doc_no as order_doc_no,
    sum(coalesce(po2.source_wip_qty, 0)) as expected_wip_qty,
    sum(case when po2.category_code in ('FG', 'RM') then coalesce(po2.qty, 0) else 0 end) as expected_stock_qty,
    sum(case when po2.category_code = 'LOSS' then coalesce(po2.qty, 0) else 0 end) as expected_loss_qty,
    sum(coalesce(po2.total_cost, 0)) as expected_value
  from public.production_outputs po2
  join public.production_orders po on po.id = po2.order_id
  where po2.status = 'active'
  group by po2.doc_no, po2.order_id, po.doc_no
),
po2_ledger as (
  select
    sl.ref_no as doc_no,
    sum(case when sl.movement_type in ('PRODUCTION_OUTPUT_WIP_OUT', 'PRODUCTION_LOSS') then coalesce(sl.qty_out, 0) else 0 end) as wip_qty_out,
    sum(case when sl.movement_type in ('PRODUCTION_OUTPUT_IN', 'PRODUCTION_OUTPUT_RM_IN') then coalesce(sl.qty_in, 0) else 0 end) as stock_qty_in,
    sum(case when sl.movement_type = 'PRODUCTION_LOSS' then coalesce(sl.qty_out, 0) else 0 end) as loss_qty_out,
    sum(case when sl.movement_type in ('PRODUCTION_OUTPUT_WIP_OUT', 'PRODUCTION_LOSS') then coalesce(sl.value_out, 0) else 0 end) as wip_value_out,
    sum(case when sl.movement_type in ('PRODUCTION_OUTPUT_IN', 'PRODUCTION_OUTPUT_RM_IN') then coalesce(sl.value_in, 0) else 0 end)
      + sum(case when sl.movement_type = 'PRODUCTION_LOSS' then coalesce(sl.value_out, 0) else 0 end) as output_value
  from public.stock_ledger sl
  where sl.ref_type = 'PO2'
  group by sl.ref_no
),
active_wip as (
  select
    po.id as order_id,
    po.doc_no as order_doc_no,
    po.status,
    coalesce(sum(pi.qty) filter (where pi.status = 'active'), 0)
      - coalesce((
        select sum(coalesce(po2.source_wip_qty, 0))
        from public.production_outputs po2
        where po2.order_id = po.id
          and po2.status = 'active'
      ), 0) as wip_qty
  from public.production_orders po
  left join public.production_inputs pi on pi.order_id = po.id
  group by po.id, po.doc_no, po.status
)
select
  'pi_ledger_mismatch'::text as issue,
  'PI'::text as ref_type,
  pi_fact.doc_no,
  pi_fact.order_doc_no,
  pi_fact.expected_qty,
  coalesce(pi_ledger.wip_qty_in, 0) as actual_qty,
  pi_fact.expected_value,
  coalesce(pi_ledger.wip_value_in, 0) as actual_value,
  jsonb_build_object(
    'sourceQtyOut', coalesce(pi_ledger.source_qty_out, 0),
    'wipQtyIn', coalesce(pi_ledger.wip_qty_in, 0),
    'sourceValueOut', coalesce(pi_ledger.source_value_out, 0),
    'wipValueIn', coalesce(pi_ledger.wip_value_in, 0)
  ) as details
from pi_fact
left join pi_ledger on pi_ledger.doc_no = pi_fact.doc_no
where abs(pi_fact.expected_qty - coalesce(pi_ledger.source_qty_out, 0)) > 0.000001
   or abs(pi_fact.expected_qty - coalesce(pi_ledger.wip_qty_in, 0)) > 0.000001
   or abs(pi_fact.expected_value - coalesce(pi_ledger.source_value_out, 0)) > 0.000001
   or abs(pi_fact.expected_value - coalesce(pi_ledger.wip_value_in, 0)) > 0.000001

union all

select
  'po2_ledger_mismatch'::text as issue,
  'PO2'::text as ref_type,
  po2_fact.doc_no,
  po2_fact.order_doc_no,
  po2_fact.expected_wip_qty as expected_qty,
  coalesce(po2_ledger.wip_qty_out, 0) as actual_qty,
  po2_fact.expected_value,
  coalesce(po2_ledger.output_value, 0) as actual_value,
  jsonb_build_object(
    'expectedStockQty', po2_fact.expected_stock_qty,
    'actualStockQty', coalesce(po2_ledger.stock_qty_in, 0),
    'expectedLossQty', po2_fact.expected_loss_qty,
    'actualLossQty', coalesce(po2_ledger.loss_qty_out, 0),
    'wipValueOut', coalesce(po2_ledger.wip_value_out, 0),
    'outputValue', coalesce(po2_ledger.output_value, 0)
  ) as details
from po2_fact
left join po2_ledger on po2_ledger.doc_no = po2_fact.doc_no
where abs(po2_fact.expected_wip_qty - coalesce(po2_ledger.wip_qty_out, 0)) > 0.000001
   or abs(po2_fact.expected_stock_qty - coalesce(po2_ledger.stock_qty_in, 0)) > 0.000001
   or abs(po2_fact.expected_loss_qty - coalesce(po2_ledger.loss_qty_out, 0)) > 0.000001
   or abs(po2_fact.expected_value - coalesce(po2_ledger.wip_value_out, 0)) > 0.000001
   or abs(po2_fact.expected_value - coalesce(po2_ledger.output_value, 0)) > 0.000001

union all

select
  'completed_order_wip_not_zero'::text as issue,
  'PO'::text as ref_type,
  active_wip.order_doc_no as doc_no,
  active_wip.order_doc_no,
  0::numeric as expected_qty,
  active_wip.wip_qty as actual_qty,
  0::numeric as expected_value,
  0::numeric as actual_value,
  jsonb_build_object('status', active_wip.status) as details
from active_wip
where active_wip.status = 'Completed'
  and abs(active_wip.wip_qty) > 0.000001

union all

select
  'open_order_has_active_movement'::text as issue,
  'PO'::text as ref_type,
  active_wip.order_doc_no as doc_no,
  active_wip.order_doc_no,
  0::numeric as expected_qty,
  active_wip.wip_qty as actual_qty,
  0::numeric as expected_value,
  0::numeric as actual_value,
  jsonb_build_object('status', active_wip.status) as details
from active_wip
where active_wip.status = 'Open'
  and abs(active_wip.wip_qty) > 0.000001

union all

select
  'reversed_pi_missing_reversal_ledger'::text as issue,
  'PI-REV'::text as ref_type,
  pi.reversal_doc_no as doc_no,
  po.doc_no as order_doc_no,
  sum(coalesce(pi.qty, 0)) as expected_qty,
  0::numeric as actual_qty,
  sum(coalesce(pi.total_cost, 0)) as expected_value,
  0::numeric as actual_value,
  jsonb_build_object('inputDocNo', pi.doc_no) as details
from public.production_inputs pi
join public.production_orders po on po.id = pi.order_id
where pi.status = 'reversed'
  and pi.reversal_doc_no is not null
  and not exists (
    select 1
    from public.stock_ledger sl
    where sl.ref_type = 'PI-REV'
      and sl.ref_no = pi.reversal_doc_no
  )
group by pi.reversal_doc_no, po.doc_no, pi.doc_no

union all

select
  'reversed_po2_missing_reversal_ledger'::text as issue,
  'PO2-REV'::text as ref_type,
  po2.reversal_doc_no as doc_no,
  po.doc_no as order_doc_no,
  sum(coalesce(po2.qty, 0)) as expected_qty,
  0::numeric as actual_qty,
  sum(coalesce(po2.total_cost, 0)) as expected_value,
  0::numeric as actual_value,
  jsonb_build_object('outputDocNo', po2.doc_no) as details
from public.production_outputs po2
join public.production_orders po on po.id = po2.order_id
where po2.status = 'reversed'
  and po2.reversal_doc_no is not null
  and not exists (
    select 1
    from public.stock_ledger sl
    where sl.ref_type = 'PO2-REV'
      and sl.ref_no = po2.reversal_doc_no
  )
group by po2.reversal_doc_no, po.doc_no, po2.doc_no;
