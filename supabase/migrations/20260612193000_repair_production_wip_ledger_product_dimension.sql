-- Repair production WIP-side stock ledger product dimension.
-- PI source stock rows and PO2 destination stock rows keep their line product.
-- WIP-side rows represent the production order WIP bucket, so they must use
-- production_orders.product_id to keep product-level stock balance coherent.

update public.stock_ledger sl
set
  product_id = po.product_id,
  updated_at = now(),
  updated_by = 'migration:20260612193000_repair_production_wip_ledger_product_dimension'
from public.production_inputs pi
join public.production_orders po on po.id = pi.order_id
where sl.ref_type in ('PI', 'PI-REV')
  and sl.movement_type in ('WIP_IN', 'PRODUCTION_INPUT_REVERSE_WIP_OUT')
  and sl.ref_id = pi.id::text
  and po.product_id is not null
  and sl.product_id is distinct from po.product_id;

update public.stock_ledger sl
set
  product_id = po.product_id,
  updated_at = now(),
  updated_by = 'migration:20260612193000_repair_production_wip_ledger_product_dimension'
from public.production_outputs pout
join public.production_orders po on po.id = pout.order_id
where sl.ref_type in ('PO2', 'PO2-REV')
  and sl.movement_type in (
    'PRODUCTION_OUTPUT_WIP_OUT',
    'PRODUCTION_LOSS',
    'PRODUCTION_OUTPUT_REVERSE_WIP_IN'
  )
  and sl.ref_id = pout.id::text
  and po.product_id is not null
  and sl.product_id is distinct from po.product_id;
