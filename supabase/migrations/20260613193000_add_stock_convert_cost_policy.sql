alter table public.grade_adjustments
  add column if not exists target_cost_policy text not null default 'SOURCE_MATCHED',
  add column if not exists source_unit_cost numeric,
  add column if not exists target_unit_cost numeric,
  add column if not exists cost_variance numeric not null default 0,
  add column if not exists cost_override_reason text;

alter table public.grade_adjustments
  drop constraint if exists grade_adjustments_target_cost_policy_check,
  add constraint grade_adjustments_target_cost_policy_check
    check (target_cost_policy in ('SOURCE_MATCHED', 'CUSTOM_UNIT_COST'));

alter table public.grade_adjustments
  drop constraint if exists grade_adjustments_cost_policy_values_check,
  add constraint grade_adjustments_cost_policy_values_check
    check (
      (source_unit_cost is null or source_unit_cost >= 0)
      and (target_unit_cost is null or target_unit_cost >= 0)
      and (
        target_cost_policy <> 'CUSTOM_UNIT_COST'
        or (
          target_unit_cost is not null
          and length(trim(coalesce(cost_override_reason, ''))) >= 3
        )
      )
    );

update public.grade_adjustments ga
set
  source_unit_cost = coalesce(ga.source_unit_cost, (
    select sum(coalesce(sl.value_out, 0)) / nullif(sum(coalesce(sl.qty_out, 0)), 0)
    from public.stock_ledger sl
    where sl.ref_type = 'GA'
      and sl.ref_no = ga.doc_no
      and coalesce(sl.qty_out, 0) > 0
  )),
  target_unit_cost = coalesce(ga.target_unit_cost, (
    select sum(coalesce(sl.value_in, 0)) / nullif(sum(coalesce(sl.qty_in, 0)), 0)
    from public.stock_ledger sl
    where sl.ref_type = 'GA'
      and sl.ref_no = ga.doc_no
      and coalesce(sl.qty_in, 0) > 0
  ), (
    select sum(coalesce(sl.value_out, 0)) / nullif(sum(coalesce(sl.qty_out, 0)), 0)
    from public.stock_ledger sl
    where sl.ref_type = 'GA'
      and sl.ref_no = ga.doc_no
      and coalesce(sl.qty_out, 0) > 0
  )),
  cost_variance = coalesce(ga.cost_variance, 0),
  target_cost_policy = coalesce(ga.target_cost_policy, 'SOURCE_MATCHED')
where ga.source_unit_cost is null
   or ga.target_unit_cost is null;

create index if not exists idx_grade_adjustments_cost_status_date
  on public.grade_adjustments (cost_status, date desc, created_at desc, id desc);
