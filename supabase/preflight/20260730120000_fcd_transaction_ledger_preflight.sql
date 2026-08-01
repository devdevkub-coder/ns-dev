-- Read-only preflight for FCD transaction ledger rollout.
-- Any non-zero result must be reconciled explicitly; this script never infers
-- a currency, a rate, or a carrying amount from legacy transaction data.

select
  'finance_currency_policy' as check_name,
  count(*)::bigint as issue_count
from public.finance_currency_policies
having count(*) <> 1

union all

select
  'legacy_bank_statement_rows',
  count(*)::bigint
from public.bank_statement
where coalesce(amount_in, 0) <> 0
   or coalesce(amount_out, 0) <> 0

union all

select
  'legacy_customer_receipt_rows',
  count(*)::bigint
from public.customer_receipts
where status in ('active', 'pending')

union all

select
  'legacy_fcd_opening_balances_without_ledger',
  count(*)::bigint
from public.account_currency_balances balances
join public.accounts account on account.id = balances.account_id
where account.is_fcd = true
  and balances.opening_balance <> 0;
