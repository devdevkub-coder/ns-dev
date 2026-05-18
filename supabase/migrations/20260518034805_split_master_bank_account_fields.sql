alter table public.director_employees
  add column if not exists bank_name text,
  add column if not exists account_no text;

alter table public.payment_methods
  add column if not exists bank_name text,
  add column if not exists account_no text;

update public.director_employees
set account_no = bank_account
where account_no is null
  and bank_account is not null
  and btrim(bank_account) <> '';
