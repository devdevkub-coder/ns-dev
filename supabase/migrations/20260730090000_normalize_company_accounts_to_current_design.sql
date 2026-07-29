-- Normalize existing company accounts to the current account design.
-- No transaction rows are rewritten. Virtual reimbursement accounts start at zero.
begin;

-- FCD is a bank account with an ordinary bank subtype plus the explicit FCD flag.
update public.accounts
set bank_account_type = 'savings',
    subtype = 'savings',
    is_fcd = true,
    account_group = 'bank',
    type = 'bank',
    currency = 'USD',
    opening_balance = 0,
    od_limit = 0
where code = 'ACC01-002';

insert into public.account_currency_balances (account_id, currency_code, opening_balance)
select a.id, 'THB', 0
from public.accounts a
where a.code = 'ACC01-002'
  and not exists (
    select 1
    from public.account_currency_balances b
    where b.account_id = a.id
      and b.currency_code = 'THB'
  );

-- Reimbursement payable is a company-level virtual account. It has no bank identity,
-- no OD, and no opening liability; the future advance/loan flow creates the negative balance.
update public.accounts
set account_group = 'virtual',
    type = 'virtual',
    subtype = 'reimbursement_payable',
    bank_account_type = null,
    is_fcd = false,
    bank_name = null,
    bank = null,
    bank_branch = null,
    account_no = null,
    currency = 'THB',
    opening_balance = 0,
    od_limit = 0
where code in ('ACC01-009', 'ACC01-011');

insert into public.account_currency_balances (account_id, currency_code, opening_balance)
select a.id, 'THB', 0
from public.accounts a
where a.code in ('ACC01-009', 'ACC01-011')
on conflict (account_id, currency_code)
do update set opening_balance = excluded.opening_balance;

insert into supabase_migrations.schema_migrations (version, name)
select '20260730090000', 'normalize_company_accounts_to_current_design'
where not exists (
  select 1
  from supabase_migrations.schema_migrations
  where version = '20260730090000'
);

commit;
