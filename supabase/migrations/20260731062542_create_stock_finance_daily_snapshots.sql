begin;

create table if not exists public.report_stock_finance_daily_snapshots (
  id bigint generated always as identity primary key,
  snapshot_date date not null,
  branch_id bigint not null references public.branches(id) on update no action on delete restrict,
  warehouse_id bigint references public.warehouses(id) on update no action on delete restrict,
  product_id bigint not null references public.products(id) on update no action on delete restrict,
  lot_no text,
  output_category text not null,
  not_available_for_sale boolean not null,
  qty numeric(18,3) not null,
  value numeric(18,2) not null,
  wac numeric(18,8) generated always as (
    case when qty <> 0 then value / qty else 0 end
  ) stored,
  source_ledger_max_updated_at timestamptz,
  source_ledger_rows_count integer not null,
  refreshed_at timestamptz not null default now(),
  constraint report_stock_finance_daily_snapshots_qty_value_nonzero_check
    check (abs(qty) > 0.001 or abs(value) > 0.01),
  constraint report_stock_finance_daily_snapshots_dimension_unique
    unique nulls not distinct (
      snapshot_date, branch_id, warehouse_id, product_id,
      lot_no, output_category, not_available_for_sale
    )
);

create index if not exists idx_report_stock_finance_daily_snapshots_date_branch
  on public.report_stock_finance_daily_snapshots (snapshot_date, branch_id);
create index if not exists idx_report_stock_finance_daily_snapshots_product_date
  on public.report_stock_finance_daily_snapshots (product_id, snapshot_date);
create index if not exists idx_report_stock_finance_daily_snapshots_warehouse_date
  on public.report_stock_finance_daily_snapshots (warehouse_id, snapshot_date)
  where warehouse_id is not null;

create table if not exists public.report_stock_finance_snapshot_invalidations (
  id bigint generated always as identity primary key,
  affected_date date not null,
  branch_id bigint references public.branches(id) on update no action on delete restrict,
  source_ledger_id bigint,
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint report_stock_finance_snapshot_invalidations_reason_check
    check (reason in ('stock_ledger_insert', 'stock_ledger_update', 'stock_ledger_delete'))
);

create index if not exists idx_report_stock_finance_snapshot_invalidations_open
  on public.report_stock_finance_snapshot_invalidations (affected_date, branch_id, created_at)
  where resolved_at is null;

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
    where sl.date <= p_to
      and (p_branch_ids is null or sl.branch_id = any(p_branch_ids))
      and (sl.branch_id is null or sl.product_id is null)
    limit 1
  ) then
    raise exception 'STOCK_LEDGER_MISSING_REQUIRED_BRANCH_OR_PRODUCT';
  end if;

  delete from public.report_stock_finance_daily_snapshots snap
  where snap.snapshot_date between p_from and p_to
    and (p_branch_ids is null or snap.branch_id = any(p_branch_ids));

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
      coalesce(sl.output_category, 'OTHER') as output_category,
      coalesce(sl.not_available_for_sale, false) as not_available_for_sale,
      sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) as qty,
      sum(coalesce(sl.value_in, 0) - coalesce(sl.value_out, 0)) as value,
      max(coalesce(sl.updated_at, sl.created_at)) as source_ledger_max_updated_at,
      count(*)::integer as source_ledger_rows_count
    from days
    join public.stock_ledger sl
      on sl.date <= days.snapshot_date
    where p_branch_ids is null or sl.branch_id = any(p_branch_ids)
    group by
      days.snapshot_date,
      sl.branch_id,
      sl.warehouse_id,
      sl.product_id,
      sl.lot_no,
      coalesce(sl.output_category, 'OTHER'),
      coalesce(sl.not_available_for_sale, false)
    having abs(sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0))) > 0.001
        or abs(sum(coalesce(sl.value_in, 0) - coalesce(sl.value_out, 0))) > 0.01
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

  update public.report_stock_finance_snapshot_invalidations inv
  set resolved_at = now()
  where inv.resolved_at is null
    and inv.affected_date <= p_to
    and (p_branch_ids is null or inv.branch_id is null or inv.branch_id = any(p_branch_ids));
end;
$$;

create or replace function public.mark_stock_finance_snapshot_invalidated()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_affected_date date;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    v_affected_date := new.date;
    v_reason := 'stock_ledger_insert';
    insert into public.report_stock_finance_snapshot_invalidations (
      affected_date, branch_id, source_ledger_id, reason
    )
    values (v_affected_date, new.branch_id, new.id, v_reason);
    return new;
  elsif tg_op = 'UPDATE' then
    v_affected_date := least(old.date, new.date);
    v_reason := 'stock_ledger_update';
    insert into public.report_stock_finance_snapshot_invalidations (
      affected_date, branch_id, source_ledger_id, reason
    )
    values (v_affected_date, new.branch_id, new.id, v_reason);
    if old.branch_id is distinct from new.branch_id then
      insert into public.report_stock_finance_snapshot_invalidations (
        affected_date, branch_id, source_ledger_id, reason
      )
      values (v_affected_date, old.branch_id, old.id, v_reason);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    v_affected_date := old.date;
    v_reason := 'stock_ledger_delete';
    insert into public.report_stock_finance_snapshot_invalidations (
      affected_date, branch_id, source_ledger_id, reason
    )
    values (v_affected_date, old.branch_id, old.id, v_reason);
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_stock_ledger_mark_stock_finance_snapshot_invalidated
  on public.stock_ledger;

create trigger trg_stock_ledger_mark_stock_finance_snapshot_invalidated
after insert or update or delete on public.stock_ledger
for each row
execute function public.mark_stock_finance_snapshot_invalidated();

commit;
