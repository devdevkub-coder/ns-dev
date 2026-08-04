-- Read-only FCD reconciliation. Every row returned is an exception that must
-- be resolved from persisted facts; this query does not infer any currency,
-- FX rate, opening balance, or source document.
with ledger_balance as (
  select
    account_id,
    currency_code,
    sum(native_amount_in - native_amount_out) as native_balance,
    sum(carrying_thb_in - carrying_thb_out) as carrying_thb_balance
  from public.fcd_ledger_entries
  group by account_id, currency_code
),
account_currency as (
  select account_id, currency_code
  from public.account_currency_balances
  where active = true
)
select
  'ledger_currency_not_active_on_account' as check_name,
  ledger.account_id::text || ':' || ledger.currency_code as reference,
  null::text as detail
from ledger_balance ledger
left join account_currency currency on currency.account_id = ledger.account_id and currency.currency_code = ledger.currency_code
where currency.account_id is null

union all

select
  'ledger_bank_statement_missing_or_not_reconciled',
  ledger.id::text,
  ledger.source_event_key
from public.fcd_ledger_entries ledger
left join public.bank_statement statement on statement.id = ledger.bank_statement_id
where ledger.bank_statement_id is not null
  and (
    statement.id is null
    or statement.movement_currency_code <> ledger.currency_code
    or statement.native_amount_in <> ledger.native_amount_in
    or statement.native_amount_out <> ledger.native_amount_out
    or statement.book_amount_in <> ledger.carrying_thb_in
    or statement.book_amount_out <> ledger.carrying_thb_out
  )

union all

select
  'customer_receipt_split_link_missing',
  split.receipt_id::text || ':' || split.line_no::text,
  split.account_code_snapshot
from public.customer_receipt_account_splits split
left join public.fcd_ledger_entries ledger on ledger.id = split.fcd_ledger_entry_id
left join public.bank_statement statement on statement.id = split.bank_statement_id
where split.fcd_ledger_entry_id is null
   or split.bank_statement_id is null
   or ledger.id is null
   or statement.id is null
   or ledger.account_id <> split.account_id
   or ledger.currency_code <> split.currency_code
   or ledger.native_amount_in <> split.received_native_amount
   or ledger.carrying_thb_in <> split.carrying_thb_amount
   or statement.native_amount_in <> split.received_native_amount
   or statement.book_amount_in <> split.carrying_thb_amount

union all

select
  'conversion_line_link_missing',
  conversion.doc_no,
  line.line_no::text
from public.fcd_conversions conversion
join public.fcd_conversion_lines line on line.conversion_id = conversion.id
left join public.fcd_ledger_entries ledger on ledger.id = line.source_fcd_ledger_entry_id
left join public.bank_statement source_statement on source_statement.id = line.source_bank_statement_id
left join public.bank_statement destination_statement on destination_statement.id = line.destination_bank_statement_id
where ledger.id is null
   or source_statement.id is null
   or destination_statement.id is null
   or ledger.native_amount_out <> line.native_amount
   or ledger.carrying_thb_out <> line.carrying_thb_out
   or source_statement.native_amount_out <> line.native_amount
   or source_statement.book_amount_out <> line.carrying_thb_out
   or destination_statement.book_amount_in <> line.actual_thb_received;
