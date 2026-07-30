begin;

-- A posted revaluation fixes the carrying amount through its period end.
-- New economic events must not be inserted back into that closed scope, or the
-- weighted carrying rate that was valued would silently change.
create or replace function public.enforce_fcd_revaluation_period_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.source_event_type in ('fcd_revaluation', 'fcd_revaluation_reversal') then
    return new;
  end if;

  if exists (
    select 1
    from public.fcd_revaluation_lines line
    join public.fcd_revaluation_batches batch on batch.id = line.batch_id
    where line.account_id = new.account_id
      and line.currency_code = new.currency_code
      and line.posted is true
      and batch.status = 'posted'
      and new.entry_date <= line.period_end
  ) then
    raise exception 'FCD period is locked by a posted revaluation for account %, currency %, entry date %', new.account_id, new.currency_code, new.entry_date;
  end if;

  return new;
end
$$;

drop trigger if exists fcd_revaluation_period_lock_guard on public.fcd_ledger_entries;
create trigger fcd_revaluation_period_lock_guard
before insert on public.fcd_ledger_entries
for each row execute function public.enforce_fcd_revaluation_period_lock();

commit;
