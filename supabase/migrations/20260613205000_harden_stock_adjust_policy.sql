alter table public.stock_adjustments
  add column if not exists output_category text,
  add column if not exists on_hold_qty numeric default 0,
  add column if not exists ready_qty_snapshot numeric default 0,
  add column if not exists accounting_impact_policy text default 'NOTE_ONLY';

update public.stock_adjustments
set accounting_impact_policy = 'NOTE_ONLY'
where accounting_impact_policy is null;

create index if not exists idx_stock_adjustments_output_category
  on public.stock_adjustments (output_category);

comment on column public.stock_adjustments.output_category is
  'Stock bucket adjusted by physical count. Normal runtime uses RM/WIP/FG from stock_ledger.output_category.';

comment on column public.stock_adjustments.on_hold_qty is
  'Active hold quantity snapshot at posting time. Used to prevent direct adjustment from making available stock negative.';

comment on column public.stock_adjustments.ready_qty_snapshot is
  'Ready/available quantity snapshot at posting time after active holds.';

comment on column public.stock_adjustments.accounting_impact_policy is
  'Current policy is NOTE_ONLY: ADJ changes stock quantity but stock_ledger value_in/value_out stay zero until GL/P&L policy is approved.';
