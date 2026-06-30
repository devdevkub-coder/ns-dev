alter table public.stock_holds
  add column if not exists unit_cost_snapshot numeric,
  add column if not exists value_snapshot numeric,
  add column if not exists cost_snapshot_at timestamptz,
  add column if not exists cost_snapshot_source text,
  add column if not exists cost_snapshot_note text;

comment on column public.stock_holds.unit_cost_snapshot is
  'Average-cost snapshot locked for this WTO pending_out portion. Draft holds may remain null until confirmation.';

comment on column public.stock_holds.value_snapshot is
  'qty * unit_cost_snapshot for this pending_out portion. Null until cost is locked.';

comment on column public.stock_holds.cost_snapshot_at is
  'Timestamp when average cost was locked for this pending_out portion.';

comment on column public.stock_holds.cost_snapshot_source is
  'Source action that locked the cost, such as WTO_CONFIRM or WTO_EDIT_INCREASE.';

comment on column public.stock_holds.cost_snapshot_note is
  'Human-readable note for audit/debug of WTO pending_out cost snapshot.';
