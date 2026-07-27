begin;

alter table public.trading_allocation_facts
  add column if not exists cost_pool_entry_id bigint;

alter table public.trading_allocation_facts
  add column if not exists target_ref_id text;

alter table public.trading_allocation_facts
  drop constraint if exists trading_allocation_facts_cost_pool_entry_id_fkey;

alter table public.trading_allocation_facts
  add constraint trading_allocation_facts_cost_pool_entry_id_fkey
  foreign key (cost_pool_entry_id)
  references public.stock_cost_pool_entries(id)
  on update no action
  on delete restrict;

create index if not exists idx_trading_allocation_facts_cost_pool_entry
  on public.trading_allocation_facts(cost_pool_entry_id)
  where cost_pool_entry_id is not null;

create index if not exists idx_trading_allocation_facts_target_ref
  on public.trading_allocation_facts(target_ref_id)
  where target_ref_id is not null;

comment on column public.trading_allocation_facts.cost_pool_entry_id is
  'Exact Cost Pool lot consumed by this allocation fact. Historical rows remain null when the source lot cannot be proved uniquely.';

comment on column public.trading_allocation_facts.target_ref_id is
  'Exact allocator target reference. PO Sell facts use the persisted PO Sell line key so reallocation never guesses a line.';

commit;
