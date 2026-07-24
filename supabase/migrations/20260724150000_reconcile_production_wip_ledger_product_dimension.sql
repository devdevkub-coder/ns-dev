-- Production WIP is a single order-level stock bucket. The source material
-- remains traceable in production_outputs.source_wip_allocations; it must not
-- change the product dimension of the WIP ledger balance.
update public.stock_ledger ledger
set
  source_input_product_id = case
    when ledger.product_id is distinct from orders.product_id then ledger.product_id
    else ledger.source_input_product_id
  end,
  product_id = orders.product_id,
  output_category = 'WIP'
from public.production_outputs outputs
join public.production_orders orders on orders.id = outputs.order_id
where ledger.ref_type in ('PO2', 'PO2-REV')
  and ledger.ref_id = outputs.id::text
  and ledger.movement_type in (
    'PRODUCTION_OUTPUT_WIP_OUT',
    'PRODUCTION_LOSS',
    'PRODUCTION_OUTPUT_REVERSE_WIP_IN'
  )
  and outputs.order_id is not null
  and orders.product_id is not null;

update public.stock_ledger ledger
set
  source_input_product_id = case
    when ledger.product_id is distinct from orders.product_id then ledger.product_id
    else ledger.source_input_product_id
  end,
  product_id = orders.product_id,
  output_category = 'WIP'
from public.production_input_returns returns
join public.production_orders orders on orders.id = returns.order_id
where ledger.ref_type = 'PI-RETURN'
  and ledger.ref_id = returns.id::text
  and ledger.movement_type = 'PRODUCTION_INPUT_RETURN_WIP_OUT'
  and orders.product_id is not null;

comment on column public.stock_ledger.source_input_product_id is
  'Original production input product dimension when a WIP ledger row is normalized to the production order WIP product.';
