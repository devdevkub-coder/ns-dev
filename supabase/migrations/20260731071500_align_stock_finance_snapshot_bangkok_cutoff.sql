begin;

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
      on sl.date < ((days.snapshot_date + 1)::timestamp at time zone 'Asia/Bangkok')
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

commit;
