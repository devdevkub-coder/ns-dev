alter table public.petty_advance_returns
  add column if not exists doc_no text;

with numbered_returns as (
  select
    par.id,
    'PRET'
    || to_char(par.date, 'YYMM')
    || '-'
    || lpad(row_number() over (
      partition by date_trunc('month', par.date)
      order by par.date asc, par.id asc
    )::text, 4, '0') as generated_doc_no
  from public.petty_advance_returns par
)
update public.petty_advance_returns par
set doc_no = numbered_returns.generated_doc_no
from numbered_returns
where par.id = numbered_returns.id
  and (par.doc_no is null or btrim(par.doc_no) = '');

alter table public.petty_advance_returns
  alter column doc_no set not null;

create unique index if not exists uq_petty_advance_returns_doc_no
  on public.petty_advance_returns (doc_no);

create index if not exists idx_petty_advance_returns_doc_no
  on public.petty_advance_returns (doc_no);

alter table public.supplier_bank_accounts
  add column if not exists code text;

with numbered_accounts as (
  select
    sba.id,
    s.code as supplier_code,
    row_number() over (
      partition by sba.supplier_id
      order by coalesce(sba.is_primary, false) desc, sba.id asc
    ) as seq
  from public.supplier_bank_accounts sba
  join public.suppliers s on s.id = sba.supplier_id
)
update public.supplier_bank_accounts sba
set code = numbered_accounts.supplier_code || '-BA' || lpad(numbered_accounts.seq::text, 2, '0')
from numbered_accounts
where sba.id = numbered_accounts.id
  and (sba.code is null or btrim(sba.code) = '');

alter table public.supplier_bank_accounts
  alter column code set not null;

create unique index if not exists uq_supplier_bank_accounts_code
  on public.supplier_bank_accounts (code);

create index if not exists idx_supplier_bank_accounts_code
  on public.supplier_bank_accounts (code);
