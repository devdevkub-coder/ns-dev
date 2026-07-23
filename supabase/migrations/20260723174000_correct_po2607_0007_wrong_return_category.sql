begin;

with affected as (
  select
    sl.id as source_ledger_id,
    sl.branch_id,
    sl.date,
    sl.lot_no,
    sl.product_id,
    sl.qty_in as qty,
    sl.value_in as value,
    sl.unit_cost,
    sl.warehouse_id,
    pi.doc_no,
    pi.id as input_id
  from public.stock_ledger sl
  join public.production_inputs pi
    on pi.id::text = sl.ref_id
  join public.production_orders po
    on po.id = pi.order_id
  where po.doc_no = 'PO2607-0007'
    and sl.ref_type = 'PI-REV'
    and sl.movement_type = 'PRODUCTION_INPUT_REVERSE_STOCK_IN'
    and sl.output_category = 'RM'
    and pi.stock_category = 'FG'
), inserted as (
  insert into public.stock_ledger (
    branch_id, created_by, date, lot_no, movement_type, notes,
    output_category, product_id, qty_out, ref_id, ref_no, ref_type,
    unit_cost, value_out, warehouse_id
  )
  select
    a.branch_id,
    'migration:production-input-return-category',
    a.date,
    a.lot_no,
    'PRODUCTION_INPUT_RETURN_CORRECTION_OUT',
    'แก้ประเภทคืนวัตถุดิบของ PO2607-0007 จาก RM เป็น FG',
    'RM',
    a.product_id,
    a.qty,
    a.source_ledger_id::text,
    a.doc_no,
    'PI-RETURN-CORRECTION',
    a.unit_cost,
    a.value,
    a.warehouse_id
  from affected a
  where not exists (
    select 1
    from public.stock_ledger existing
    where existing.ref_type = 'PI-RETURN-CORRECTION'
      and existing.ref_id = a.source_ledger_id::text
      and existing.movement_type = 'PRODUCTION_INPUT_RETURN_CORRECTION_OUT'
  )
  returning id
)
insert into public.stock_ledger (
  branch_id, created_by, date, lot_no, movement_type, notes,
  output_category, product_id, qty_in, ref_id, ref_no, ref_type,
  unit_cost, value_in, warehouse_id
)
select
  a.branch_id,
  'migration:production-input-return-category',
  a.date,
  a.lot_no,
  'PRODUCTION_INPUT_RETURN_CORRECTION_IN',
  'แก้ประเภทคืนวัตถุดิบของ PO2607-0007 จาก RM เป็น FG',
  'FG',
  a.product_id,
  a.qty,
  a.source_ledger_id::text,
  a.doc_no,
  'PI-RETURN-CORRECTION',
  a.unit_cost,
  a.value,
  a.warehouse_id
from affected a
where exists (
  select 1
  from public.stock_ledger existing
  where existing.ref_type = 'PI-RETURN-CORRECTION'
    and existing.ref_id = a.source_ledger_id::text
    and existing.movement_type = 'PRODUCTION_INPUT_RETURN_CORRECTION_OUT'
)
and not exists (
  select 1
  from public.stock_ledger existing
  where existing.ref_type = 'PI-RETURN-CORRECTION'
    and existing.ref_id = a.source_ledger_id::text
    and existing.movement_type = 'PRODUCTION_INPUT_RETURN_CORRECTION_IN'
);

commit;
