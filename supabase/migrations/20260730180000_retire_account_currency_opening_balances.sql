begin;

-- Account currency rows declare supported currencies only. Balances are derived
-- from persisted Bank Statement and FCD ledger events, so the legacy value is
-- deliberately retired with the column rather than copied into a new ledger.
alter table public.account_currency_balances
  drop constraint if exists account_currency_balances_opening_balance_chk,
  drop column opening_balance;

commit;
