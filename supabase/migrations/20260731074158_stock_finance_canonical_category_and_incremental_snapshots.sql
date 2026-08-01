begin;

-- A warehouse code identifies its location; output_category identifies the
-- canonical stock bucket. Legacy rows incorrectly copied the warehouse code.
update public.stock_ledger sl
set
  output_category = w.type,
  updated_at = now()
from public.warehouses w
where w.id = sl.warehouse_id
  and w.type in ('RM', 'WIP', 'FG')
  and sl.output_category = w.code
  and sl.output_category is distinct from w.type;

-- Legacy nulls represent the established false fact, not a report-time default.
update public.stock_ledger
set
  not_available_for_sale = false,
  updated_at = now()
where not_available_for_sale is null;

do $$
begin
  if exists (
    select 1
    from public.stock_ledger
    where output_category is null
      or output_category not in ('RM', 'WIP', 'FG')
      or not_available_for_sale is null
  ) then
    raise exception 'STOCK_LEDGER_CANONICAL_BUCKET_PREFLIGHT_FAILED';
  end if;
end;
$$;

alter table public.stock_ledger
  alter column output_category set not null,
  alter column not_available_for_sale set not null;

alter table public.stock_ledger
  drop constraint if exists stock_ledger_output_category_check;

alter table public.stock_ledger
  add constraint stock_ledger_output_category_check
  check (output_category in ('RM', 'WIP', 'FG'));

create table if not exists public.report_stock_finance_daily_snapshot_refreshes (
  snapshot_date date not null,
  branch_id bigint not null references public.branches(id) on update no action on delete restrict,
  refreshed_at timestamptz not null default now(),
  primary key (snapshot_date, branch_id)
);

create index if not exists idx_report_stock_finance_daily_snapshot_refreshes_date_branch
  on public.report_stock_finance_daily_snapshot_refreshes (snapshot_date, branch_id);

create or replace function public.rebuild_stock_finance_daily_snapshots(
  p_from date,
  p_to date,
  p_branch_ids bigint[] default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_STOCK_FINANCE_SNAPSHOT_RANGE';
  end if;

  if exists (
    select 1
    from public.stock_ledger sl
    where sl.date < ((p_to + 1)::timestamp at time zone 'Asia/Bangkok')
      and (p_branch_ids is null or sl.branch_id = any(p_branch_ids))
      and (
        sl.branch_id is null
        or sl.warehouse_id is null
        or sl.product_id is null
        or sl.output_category not in ('RM', 'WIP', 'FG')
        or sl.not_available_for_sale is null
        or sl.qty_in is null
        or sl.qty_out is null
        or sl.value_in is null
        or sl.value_out is null
      )
    limit 1
  ) then
    raise exception 'STOCK_LEDGER_SNAPSHOT_CONTRACT_FAILED';
  end if;

  delete from public.report_stock_finance_daily_snapshots snap
  where snap.snapshot_date between p_from and p_to
    and (p_branch_ids is null or snap.branch_id = any(p_branch_ids));

  delete from public.report_stock_finance_daily_snapshot_refreshes refresh
  where refresh.snapshot_date between p_from and p_to
    and (p_branch_ids is null or refresh.branch_id = any(p_branch_ids));

  insert into public.report_stock_finance_daily_snapshots (
    snapshot_date,
    branch_id,
    warehouse_id,
    product_id,
    lot_no,
    output_category,
    not_available_for_sale,
    qty,
    value,
    source_ledger_max_updated_at,
    source_ledger_rows_count,
    refreshed_at
  )
  with days as (
    select generate_series(p_from, p_to, interval '1 day')::date as snapshot_date
  ),
  daily_bucket as (
    select
      days.snapshot_date,
      sl.branch_id,
      sl.warehouse_id,
      sl.product_id,
      sl.lot_no,
      sl.output_category,
      sl.not_available_for_sale,
      sum(sl.qty_in - sl.qty_out) as qty,
      sum(sl.value_in - sl.value_out) as value,
      max(coalesce(sl.updated_at, sl.created_at)) as source_ledger_max_updated_at,
      count(*)::integer as source_ledger_rows_count
    from days
    join public.stock_ledger sl
      on sl.date < ((days.snapshot_date + 1)::timestamp at time zone 'Asia/Bangkok')
    where p_branch_ids is null or sl.branch_id = any(p_branch_ids)
    group by
      days.snapshot_date,
      sl.branch_id,
      sl.warehouse_id,
      sl.product_id,
      sl.lot_no,
      sl.output_category,
      sl.not_available_for_sale
    having abs(sum(sl.qty_in - sl.qty_out)) > 0.001
        or abs(sum(sl.value_in - sl.value_out)) > 0.01
  )
  select
    snapshot_date,
    branch_id,
    warehouse_id,
    product_id,
    lot_no,
    output_category,
    not_available_for_sale,
    qty,
    value,
    source_ledger_max_updated_at,
    source_ledger_rows_count,
    now()
  from daily_bucket;

  insert into public.report_stock_finance_daily_snapshot_refreshes (
    snapshot_date,
    branch_id,
    refreshed_at
  )
  select
    days.snapshot_at::date,
    branch.branch_id,
    now()
  from generate_series(p_from, p_to, interval '1 day') as days(snapshot_at)
  cross join (
    select distinct sl.branch_id
    from public.stock_ledger sl
    where sl.date < ((p_to + 1)::timestamp at time zone 'Asia/Bangkok')
      and (p_branch_ids is null or sl.branch_id = any(p_branch_ids))
  ) branch;

  update public.report_stock_finance_snapshot_invalidations inv
  set resolved_at = now()
  where inv.resolved_at is null
    and inv.affected_date between p_from and p_to
    and (p_branch_ids is null or inv.branch_id = any(p_branch_ids));
end;
$$;

delete from public.report_stock_finance_daily_snapshots;
delete from public.report_stock_finance_daily_snapshot_refreshes;

commit;
