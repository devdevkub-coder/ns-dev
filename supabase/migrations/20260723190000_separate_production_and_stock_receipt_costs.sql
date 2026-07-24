begin;

alter table public.production_outputs
  add column if not exists stock_receipt_unit_cost numeric,
  add column if not exists stock_receipt_total_cost numeric,
  add column if not exists cost_variance numeric;

alter table public.production_input_returns
  add column if not exists stock_receipt_unit_cost numeric,
  add column if not exists stock_receipt_total_cost numeric,
  add column if not exists cost_variance numeric;

comment on column public.production_outputs.unit_cost is
  'Production/WIP cost snapshot. Stock receipt valuation is stored separately.';
comment on column public.production_outputs.stock_receipt_unit_cost is
  'WAC of the destination warehouse at the time the production output was received.';
comment on column public.production_outputs.cost_variance is
  'Stock receipt total cost minus production/WIP total cost.';
comment on column public.production_input_returns.unit_cost is
  'Original production/WIP cost released by the return.';
comment on column public.production_input_returns.stock_receipt_unit_cost is
  'WAC of the source warehouse at the time the returned material was received.';

commit;
