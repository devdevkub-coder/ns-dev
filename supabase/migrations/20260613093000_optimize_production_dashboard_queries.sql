create index if not exists idx_production_orders_active_date_doc
  on public.production_orders (date desc, doc_no desc)
  where status <> 'Cancelled';

create index if not exists idx_production_orders_active_branch_date_doc
  on public.production_orders (branch_id, date desc, doc_no desc)
  where branch_id is not null
    and status <> 'Cancelled';

create index if not exists idx_production_orders_active_machine_date_doc
  on public.production_orders (machine_id, date desc, doc_no desc)
  where machine_id is not null
    and status <> 'Cancelled';

create index if not exists idx_production_orders_status_date_doc
  on public.production_orders (status, date desc, doc_no desc)
  where status is not null;

create index if not exists idx_production_inputs_order_status
  on public.production_inputs (order_id, status);

create index if not exists idx_production_outputs_order_status
  on public.production_outputs (order_id, status);

create index if not exists idx_process_costs_order_status_include
  on public.process_costs (production_order_id, status, include_in_production);
