-- Do not silently choose or remove an Allocation when enforcing the business key.
-- Reconcile existing source data before this migration is allowed to proceed.
do $$
begin
  if exists (
    select 1
    from public.trading_allocation_facts
    where status = 'active'
      and sales_bill_id is not null
      and sales_line_no is not null
    group by sales_bill_id, sales_line_no
    having count(*) > 1
  ) then
    raise exception 'Cannot enforce one active trading allocation per sales line: duplicate active allocations exist';
  end if;

  if exists (
    select 1
    from public.trading_allocation_facts
    where status = 'active'
      and sales_bill_id is null
      and sales_line_no is not null
  ) then
    raise exception 'Cannot enforce one active trading allocation per sales line: linked allocations are missing sales_bill_id';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.trading_allocation_facts'::regclass
      and conname = 'trading_allocation_facts_sales_line_requires_bill'
  ) then
    alter table public.trading_allocation_facts
      add constraint trading_allocation_facts_sales_line_requires_bill
      check (sales_line_no is null or sales_bill_id is not null);
  end if;
end $$;

create unique index if not exists uq_trading_allocation_facts_active_sales_line
  on public.trading_allocation_facts (sales_bill_id, sales_line_no)
  where status = 'active'
    and sales_bill_id is not null
    and sales_line_no is not null;
