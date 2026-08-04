begin;

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
  allocation_native_total numeric;
begin
  if new.source_type = 'SB' and exists (
    select 1 from public.customer_receipt_advance_allocations allocation
    where allocation.receipt_id = new.id and allocation.status = 'active'
  ) then
    raise exception 'Sales bill receipt cannot contain CADV allocations';
  end if;
  if new.source_type = 'CADV' and exists (
    select 1 from public.customer_receipt_allocations allocation
    where allocation.receipt_id = new.id and allocation.status = 'active'
  ) then
    raise exception 'CADV receipt cannot contain sales bill allocations';
  end if;
  if new.status = 'cancelled' or new.receipt_currency_code is null then
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
  if new.source_type not in ('SB', 'CADV') then
    raise exception 'Foreign receipt source type must be SB or CADV';
  end if;
  if new.customer_transferred_native_amount is null
    or new.received_native_amount is null
    or new.settlement_book_amount is null
    or new.carrying_thb_amount is null
    or new.fx_rate is null
    or new.fx_rate_date is null then
    raise exception 'Foreign receipt requires native amount, settlement/book amounts and FX snapshot';
  end if;
  if new.customer_transferred_native_amount <= 0
    or new.received_native_amount <= 0
    or new.customer_transferred_native_amount <> new.received_native_amount
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
    or new.carrying_thb_amount <> new.settlement_book_amount - new.bank_fee_total
    or new.carrying_thb_amount <= 0
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
    or split_native_total <> new.customer_transferred_native_amount
    or split_carrying_total <> new.carrying_thb_amount then
    raise exception 'Foreign receipt splits do not reconcile with the receipt header';
  end if;
  if exists (
    select 1 from public.customer_receipt_account_splits split
    where split.receipt_id = new.id and split.currency_code <> new.receipt_currency_code
  ) then
    raise exception 'Foreign receipt splits must use the receipt currency';
  end if;

  if new.source_type = 'SB' then
    select coalesce(sum(allocation.settlement_book_amount), 0),
           coalesce(sum(allocation.receipt_amount + allocation.settlement_fx_difference), 0)
      into allocation_settlement_total, allocation_booked_total
    from public.customer_receipt_allocations allocation
    where allocation.receipt_id = new.id and allocation.status = 'active';
    if allocation_settlement_total <> new.settlement_book_amount
      or allocation_booked_total <> new.settlement_book_amount then
      raise exception 'Foreign sales bill receipt cash allocations do not reconcile with settlement THB';
    end if;
  else
    select coalesce(sum(allocation.settlement_book_amount), 0),
           coalesce(sum(allocation.receipt_amount), 0),
           coalesce(sum(allocation.native_amount_allocated), 0)
      into allocation_settlement_total, allocation_booked_total, allocation_native_total
    from public.customer_receipt_advance_allocations allocation
    where allocation.receipt_id = new.id and allocation.status = 'active';
    if allocation_settlement_total <> new.settlement_book_amount
      or allocation_booked_total <> new.settlement_book_amount
      or allocation_native_total <> new.customer_transferred_native_amount then
      raise exception 'Foreign CADV receipt allocations do not reconcile with settlement THB';
    end if;
  end if;
  return new;
end;
$$;

commit;
