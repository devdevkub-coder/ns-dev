begin;

do $$
begin
  if exists (
    select 1
    from public.stock_ledger
    where date is null
      or qty_in is null
      or qty_out is null
      or value_in is null
      or value_out is null
  ) then
    raise exception 'STOCK_LEDGER_MOVEMENT_FACT_PREFLIGHT_FAILED';
  end if;
end;
$$;

alter table public.stock_ledger
  alter column date set not null,
  alter column qty_in set not null,
  alter column qty_out set not null,
  alter column value_in set not null,
  alter column value_out set not null;

commit;
