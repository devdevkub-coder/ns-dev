begin;

-- A foreign receipt owns one receipt currency.  Its detail rows are written
-- after the header in the same transaction, so validation is deferred until
-- commit rather than relying on a partial intermediate state.
create or replace function public.validate_foreign_customer_receipt_contract()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  functional_currency text;
  functional_currency_count integer;
  split_count integer;
  split_currency_count integer;
  split_native_total numeric;
  split_carrying_total numeric;
  allocation_settlement_total numeric;
  allocation_booked_total numeric;
begin
  if new.source_type = 'SB' and exists (
    select 1
    from public.customer_receipt_advance_allocations allocation
    where allocation.receipt_id = new.id
      and allocation.status = 'active'
  ) then
    raise exception 'Sales bill receipt cannot contain CADV allocations';
  end if;
  if new.source_type = 'CADV' and exists (
    select 1
    from public.customer_receipt_allocations allocation
    where allocation.receipt_id = new.id
      and allocation.status = 'active'
  ) then
    raise exception 'CADV receipt cannot contain sales bill allocations';
  end if;
  if new.receipt_currency_code is null then
    return new;
  end if;

  select count(*), min(functional_currency_code)
    into functional_currency_count, functional_currency
  from public.finance_currency_policies;
  if functional_currency_count <> 1 or functional_currency is null then
    raise exception 'Finance functional currency policy must contain exactly one configured currency';
  end if;

  if new.receipt_currency_code = functional_currency then
    raise exception 'Foreign receipt currency must differ from the functional currency';
  end if;
  if new.source_type <> 'SB' then
    raise exception 'Foreign receipt source type must be SB until CADV foreign settlement is implemented';
  end if;
  if new.customer_transferred_native_amount is null
    or new.received_native_amount is null
    or new.settlement_book_amount is null
    or new.carrying_thb_amount is null
    or new.fx_rate is null
    or new.fx_rate_date is null
    or nullif(btrim(new.fx_rate_type), '') is null then
    raise exception 'Foreign receipt requires native amounts, settlement/book amounts and FX snapshot';
  end if;
  if new.customer_transferred_native_amount <= 0
    or new.received_native_amount <= 0
    or new.received_native_amount > new.customer_transferred_native_amount
    or new.fx_rate <= 0 then
    raise exception 'Foreign receipt native amount or FX rate is invalid';
  end if;
  if new.fx_rate <> round(new.fx_rate, 3)
    or new.customer_transferred_native_amount <> round(new.customer_transferred_native_amount, 2)
    or new.received_native_amount <> round(new.received_native_amount, 2)
    or new.settlement_book_amount <> round(new.settlement_book_amount, 2)
    or new.carrying_thb_amount <> round(new.carrying_thb_amount, 2) then
    raise exception 'Foreign receipt amounts must use 2 decimals and FX rate 3 decimals';
  end if;
  if new.settlement_book_amount <> round(new.customer_transferred_native_amount * new.fx_rate, 2)
    or new.carrying_thb_amount <> round(new.received_native_amount * new.fx_rate, 2)
    or new.bank_fee_total <> new.settlement_book_amount - new.carrying_thb_amount
    or new.gross_amount <> new.settlement_book_amount
    or new.net_cash_in <> new.carrying_thb_amount then
    raise exception 'Foreign receipt settlement, carrying amount and bank fee do not reconcile';
  end if;

  select count(*), count(distinct split.currency_code),
         coalesce(sum(split.received_native_amount), 0),
         coalesce(sum(split.carrying_thb_amount), 0)
    into split_count, split_currency_count, split_native_total, split_carrying_total
  from public.customer_receipt_account_splits split
  where split.receipt_id = new.id;
  if split_count = 0
    or split_currency_count <> 1
    or split_native_total <> new.received_native_amount
    or split_carrying_total <> new.carrying_thb_amount then
    raise exception 'Foreign receipt splits do not reconcile with the receipt header';
  end if;
  if exists (
    select 1
    from public.customer_receipt_account_splits split
    where split.receipt_id = new.id
      and split.currency_code <> new.receipt_currency_code
  ) then
    raise exception 'Foreign receipt splits must use the receipt currency';
  end if;

  select coalesce(sum(allocation.settlement_book_amount), 0),
         coalesce(sum(allocation.allocated_ar_amount + allocation.settlement_fx_difference), 0)
    into allocation_settlement_total, allocation_booked_total
  from public.customer_receipt_allocations allocation
  where allocation.receipt_id = new.id
    and allocation.status = 'active';
  if allocation_settlement_total <> new.settlement_book_amount
    or allocation_booked_total <> new.settlement_book_amount then
    raise exception 'Foreign receipt allocations do not reconcile with settlement THB';
  end if;

  return new;
end;
$$;

create or replace function public.validate_foreign_customer_receipt_split_contract()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  receipt_row record;
  ledger_row record;
  statement_row record;
begin
  select id, receipt_currency_code
    into receipt_row
  from public.customer_receipts
  where id = new.receipt_id;
  if not found or receipt_row.receipt_currency_code is null then
    raise exception 'Customer receipt account split requires a foreign receipt header';
  end if;
  if new.currency_code <> receipt_row.receipt_currency_code then
    raise exception 'Customer receipt split currency must equal its receipt currency';
  end if;
  if not exists (
    select 1
    from public.accounts account
    join public.account_currency_balances balance
      on balance.account_id = account.id
     and balance.currency_code = new.currency_code
     and balance.active = true
    where account.id = new.account_id
      and account.active = true
      and account.account_group = 'bank'
      and account.is_fcd = true
  ) then
    raise exception 'Customer receipt foreign split requires an active FCD account supporting its currency';
  end if;
  if new.bank_statement_id is null or new.fcd_ledger_entry_id is null then
    raise exception 'Customer receipt foreign split requires linked Bank Statement and FCD ledger entry';
  end if;

  select account_id, currency_code, native_amount_in, native_amount_out,
         carrying_thb_in, carrying_thb_out, bank_statement_id, source_event_type
    into ledger_row
  from public.fcd_ledger_entries
  where id = new.fcd_ledger_entry_id;
  if not found then
    raise exception 'Customer receipt foreign split FCD ledger entry does not exist';
  end if;
  select account_id, currency_code, native_amount_in, native_amount_out,
         book_amount_in, book_amount_out, source_event_type
    into statement_row
  from public.bank_statement
  where id = new.bank_statement_id;
  if not found then
    raise exception 'Customer receipt foreign split Bank Statement does not exist';
  end if;
  if ledger_row.account_id <> new.account_id
    or ledger_row.currency_code <> new.currency_code
    or ledger_row.native_amount_in <> new.received_native_amount
    or ledger_row.native_amount_out <> 0
    or ledger_row.carrying_thb_in <> new.carrying_thb_amount
    or ledger_row.carrying_thb_out <> 0
    or ledger_row.bank_statement_id <> new.bank_statement_id
    or ledger_row.source_event_type <> 'customer_receipt_fcd_settlement'
    or statement_row.account_id <> new.account_id
    or statement_row.currency_code <> new.currency_code
    or statement_row.native_amount_in <> new.received_native_amount
    or statement_row.native_amount_out <> 0
    or statement_row.book_amount_in <> new.carrying_thb_amount
    or statement_row.book_amount_out <> 0
    or statement_row.source_event_type <> 'customer_receipt_fcd_settlement' then
    raise exception 'Customer receipt foreign split links do not match Bank Statement and FCD ledger facts';
  end if;
  return new;
end;
$$;

drop trigger if exists customer_receipts_foreign_contract_guard on public.customer_receipts;
create constraint trigger customer_receipts_foreign_contract_guard
after insert or update on public.customer_receipts
deferrable initially deferred
for each row execute function public.validate_foreign_customer_receipt_contract();

drop trigger if exists customer_receipt_account_splits_foreign_contract_guard on public.customer_receipt_account_splits;
create constraint trigger customer_receipt_account_splits_foreign_contract_guard
after insert or update on public.customer_receipt_account_splits
deferrable initially deferred
for each row execute function public.validate_foreign_customer_receipt_split_contract();

commit;
