begin;

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
  select id, receipt_currency_code into receipt_row from public.customer_receipts where id = new.receipt_id;
  if not found or receipt_row.receipt_currency_code is null then raise exception 'Customer receipt account split requires a foreign receipt header'; end if;
  if new.currency_code <> receipt_row.receipt_currency_code then raise exception 'Customer receipt split currency must equal its receipt currency'; end if;
  if not exists (
    select 1 from public.accounts account join public.account_currency_balances balance on balance.account_id = account.id and balance.currency_code = new.currency_code and balance.active = true
    where account.id = new.account_id and account.active = true and account.account_group = 'bank' and account.is_fcd = true
  ) then raise exception 'Customer receipt foreign split requires an active FCD account supporting its currency'; end if;
  if new.bank_statement_id is null or new.fcd_ledger_entry_id is null then raise exception 'Customer receipt foreign split requires linked Bank Statement and FCD ledger entry'; end if;

  select account_id, currency_code, native_amount_in, native_amount_out, carrying_thb_in, carrying_thb_out, bank_statement_id, source_event_type
    into ledger_row from public.fcd_ledger_entries where id = new.fcd_ledger_entry_id;
  if not found then raise exception 'Customer receipt foreign split FCD ledger entry does not exist'; end if;
  select account_id, movement_currency_code as currency_code, native_amount_in, native_amount_out, book_amount_in, book_amount_out, source_event_type
    into statement_row from public.bank_statement where id = new.bank_statement_id;
  if not found then raise exception 'Customer receipt foreign split Bank Statement does not exist'; end if;
  if ledger_row.account_id <> new.account_id or ledger_row.currency_code <> new.currency_code
    or ledger_row.native_amount_in <> new.received_native_amount or ledger_row.native_amount_out <> 0
    or ledger_row.carrying_thb_in <> new.carrying_thb_amount or ledger_row.carrying_thb_out <> 0
    or ledger_row.bank_statement_id <> new.bank_statement_id or ledger_row.source_event_type <> 'customer_receipt_fcd_settlement'
    or statement_row.account_id <> new.account_id or statement_row.currency_code <> new.currency_code
    or statement_row.native_amount_in <> new.received_native_amount or statement_row.native_amount_out <> 0
    or statement_row.book_amount_in <> new.carrying_thb_amount or statement_row.book_amount_out <> 0
    or statement_row.source_event_type <> 'customer_receipt_fcd_settlement' then
    raise exception 'Customer receipt foreign split links do not match Bank Statement and FCD ledger facts';
  end if;
  return new;
end;
$$;

commit;
