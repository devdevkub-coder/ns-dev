-- Additive account classification for the canonical company-account form.
-- Legacy type/subtype values remain in place until downstream consumers migrate.
alter table public.accounts
  add column if not exists account_group text not null default 'bank',
  add column if not exists counterparty_person_code text,
  add column if not exists bank_account_type text,
  add column if not exists is_fcd boolean not null default false,
  add column if not exists supports_cheque boolean not null default false;

update public.accounts a
set account_group = case
  when lower(coalesce(pm.type, '')) = 'cash' then 'cash'
  else 'bank'
end
from public.payment_methods pm
where pm.name = a.type;

update public.accounts
set account_group = 'cash'
where subtype = 'cash';

update public.accounts
set bank_account_type = case
  when subtype in ('savings', 'current') then subtype
  when subtype = 'od' then 'current'
  else null
end
where account_group = 'bank';

update public.accounts
set is_fcd = account_group = 'bank'
  and upper(coalesce(currency, 'THB')) <> 'THB'
where account_group = 'bank';

create index if not exists idx_accounts_branch_group_currency
  on public.accounts (branch_id, account_group, currency);

create index if not exists idx_accounts_counterparty_person_code
  on public.accounts (counterparty_person_code);

alter table public.accounts
  drop constraint if exists accounts_counterparty_person_code_fkey;

alter table public.accounts
  add constraint accounts_counterparty_person_code_fkey
  foreign key (counterparty_person_code) references public.director_employees(code);
