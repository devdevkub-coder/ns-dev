-- New production flow stores internal event identity separately from the PO.
-- Existing rows are intentionally not backfilled; runtime code must use the new
-- fields for newly posted events and must not fall back to legacy document data.

alter table public.production_inputs
  add column if not exists event_key text;

alter table public.production_outputs
  add column if not exists event_key text,
  add column if not exists output_round integer;

create index if not exists idx_production_inputs_order_event
  on public.production_inputs (order_id, event_key);

create index if not exists idx_production_outputs_order_event
  on public.production_outputs (order_id, event_key);

create unique index if not exists uq_production_outputs_order_round
  on public.production_outputs (order_id, output_round)
  where output_round is not null;
