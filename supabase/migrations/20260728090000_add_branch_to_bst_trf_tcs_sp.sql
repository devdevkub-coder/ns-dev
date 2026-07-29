alter table public.bank_statement
  add column if not exists branch_id bigint references public.branches(id);

alter table public.transfers
  add column if not exists branch_id bigint references public.branches(id);

alter table public.trading_cost_sources
  add column if not exists branch_id bigint references public.branches(id);

alter table public.sales_plans
  add column if not exists branch_id bigint references public.branches(id);

create index if not exists idx_bank_statement_branch
  on public.bank_statement (branch_id, date desc, doc_no desc);

create index if not exists idx_transfers_branch
  on public.transfers (branch_id, date desc, doc_no desc);

create index if not exists idx_trading_cost_sources_branch_status
  on public.trading_cost_sources (branch_id, status, date desc);

create index if not exists idx_sales_plans_branch_month
  on public.sales_plans (branch_id, plan_month desc, plan_no desc);
