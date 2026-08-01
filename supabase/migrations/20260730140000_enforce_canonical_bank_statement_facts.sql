begin;

-- Every new Bank Statement is an immutable booking fact. The legacy amount
-- columns remain as the functional-currency book view and must agree with it.
alter table public.bank_statement
  drop constraint if exists bank_statement_fcd_movement_contract_chk,
  add constraint bank_statement_canonical_movement_chk check (
    amount_in is not null
    and amount_out is not null
    and native_amount_in is not null
    and native_amount_out is not null
    and book_amount_in is not null
    and book_amount_out is not null
    and amount_in >= 0
    and amount_out >= 0
    and native_amount_in >= 0
    and native_amount_out >= 0
    and book_amount_in >= 0
    and book_amount_out >= 0
    and (amount_in = round(amount_in, 2))
    and (amount_out = round(amount_out, 2))
    and (native_amount_in = round(native_amount_in, 2))
    and (native_amount_out = round(native_amount_out, 2))
    and (book_amount_in = round(book_amount_in, 2))
    and (book_amount_out = round(book_amount_out, 2))
    and (book_fx_rate is null or (book_fx_rate > 0 and book_fx_rate = round(book_fx_rate, 3)))
    and not (native_amount_in > 0 and native_amount_out > 0)
    and not (book_amount_in > 0 and book_amount_out > 0)
    and (native_amount_in > 0 or native_amount_out > 0)
    and ((native_amount_in > 0) = (book_amount_in > 0))
    and ((native_amount_out > 0) = (book_amount_out > 0))
    and amount_in = book_amount_in
    and amount_out = book_amount_out
    and nullif(btrim(movement_currency_code), '') is not null
    and nullif(btrim(source_event_type), '') is not null
    and nullif(btrim(source_event_key), '') is not null
    and nullif(btrim(idempotency_key), '') is not null
  );

alter table public.bank_statement
  alter column movement_currency_code set not null,
  alter column native_amount_in set not null,
  alter column native_amount_out set not null,
  alter column book_amount_in set not null,
  alter column book_amount_out set not null,
  alter column source_event_type set not null,
  alter column source_event_key set not null,
  alter column idempotency_key set not null;

create or replace function public.enforce_bank_statement_account_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  account_row record;
  functional_currency text;
  functional_currency_count integer;
begin
  if new.account_id is null then
    raise exception 'Bank Statement must reference an account';
  end if;
  if new.branch_id is null then
    raise exception 'Bank Statement must reference a branch';
  end if;

  select id, active, account_group, is_fcd
    into account_row
  from public.accounts
  where id = new.account_id;

  if not found or account_row.account_group <> 'bank' or coalesce(account_row.active, false) is not true then
    raise exception 'Bank Statement account must be an active bank account';
  end if;

  if not exists (
    select 1
    from public.account_currency_balances balance
    where balance.account_id = new.account_id
      and balance.currency_code = new.movement_currency_code
      and balance.active = true
  ) then
    raise exception 'Bank Statement account % does not support active currency %', new.account_id, new.movement_currency_code;
  end if;

  select count(*), min(functional_currency_code)
    into functional_currency_count, functional_currency
  from public.finance_currency_policies;
  if functional_currency_count <> 1 or functional_currency is null then
    raise exception 'Finance functional currency policy must contain exactly one configured currency';
  end if;

  if new.movement_currency_code <> functional_currency then
    if account_row.is_fcd is not true then
      raise exception 'Non-functional currency Bank Statement requires an FCD account';
    end if;
    if new.book_fx_rate is null then
      raise exception 'Non-functional currency Bank Statement requires a persisted book FX rate';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists bank_statement_account_integrity_guard on public.bank_statement;
create constraint trigger bank_statement_account_integrity_guard
after insert or update of account_id, branch_id, movement_currency_code, book_fx_rate on public.bank_statement
deferrable initially deferred
for each row execute function public.enforce_bank_statement_account_integrity();

commit;
