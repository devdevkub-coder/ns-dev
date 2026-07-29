begin;

-- Legacy NULL means that no OD facility was configured. Normalize the absence
-- before making the canonical zero-or-positive contract mandatory.
update public.accounts
set od_limit = 0
where od_limit is null;

do $$
declare
  invalid_count bigint;
begin
  select count(*)
  into invalid_count
  from public.accounts a
  where a.currency is null
     or btrim(a.currency) = ''
     or a.opening_balance is null
     or a.opening_balance < 0
     or a.od_limit is null
     or a.od_limit < 0
     or not (
       (
         a.account_group = 'bank'
         and a.bank_account_type in ('savings', 'current')
         and (a.od_limit = 0 or a.bank_account_type = 'current')
       )
       or (
         a.account_group in ('cash', 'virtual')
         and a.bank_account_type is null
         and a.is_fcd = false
         and a.od_limit = 0
         and a.bank_name is null
         and a.bank is null
         and a.bank_branch is null
         and a.account_no is null
       )
     );

  if invalid_count > 0 then
    raise exception 'Cannot enforce company account guards: % invalid account row(s)', invalid_count;
  end if;

  select count(*)
  into invalid_count
  from public.accounts a
  left join public.currencies c on c.code = a.currency
  where c.code is null;

  if invalid_count > 0 then
    raise exception 'Cannot enforce company account currency FK: % account row(s) reference an unknown currency', invalid_count;
  end if;
end
$$;

alter table public.accounts
  alter column currency set not null,
  alter column opening_balance set not null,
  alter column od_limit set not null;

alter table public.accounts
  drop constraint if exists accounts_currency_fkey,
  add constraint accounts_currency_fkey
    foreign key (currency) references public.currencies(code),
  drop constraint if exists accounts_company_account_shape_chk,
  add constraint accounts_company_account_shape_chk check (
    btrim(currency) <> ''
    and opening_balance >= 0
    and od_limit >= 0
    and (
      (
        account_group = 'bank'
        and bank_account_type in ('savings', 'current')
        and (od_limit = 0 or bank_account_type = 'current')
      )
      or (
        account_group in ('cash', 'virtual')
        and bank_account_type is null
        and is_fcd = false
        and od_limit = 0
        and bank_name is null
        and bank is null
        and bank_branch is null
        and account_no is null
      )
    )
  );

alter table public.account_currency_balances
  drop constraint if exists account_currency_balances_opening_balance_chk,
  add constraint account_currency_balances_opening_balance_chk
    check (opening_balance >= 0);

create or replace function public.assert_company_account_integrity(p_account_id bigint)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  account_row public.accounts%rowtype;
  active_currency_count integer;
begin
  select *
  into account_row
  from public.accounts
  where id = p_account_id;

  if not found then
    return;
  end if;

  select count(*)
  into active_currency_count
  from public.account_currency_balances
  where account_id = p_account_id
    and active = true;

  if not exists (
    select 1
    from public.account_currency_balances
    where account_id = p_account_id
      and currency_code = account_row.currency
      and active = true
  ) then
    raise exception 'Account % must have an active balance row for primary currency %', account_row.code, account_row.currency;
  end if;

  if account_row.account_group = 'bank' and account_row.is_fcd then
    if active_currency_count < 2 then
      raise exception 'FCD account % must have at least two active currencies', account_row.code;
    end if;
  elsif active_currency_count <> 1 then
    raise exception 'Non-FCD account % must have exactly one active currency', account_row.code;
  end if;

  if account_row.account_group <> 'bank' and exists (
    select 1
    from public.bank_statement
    where account_id = p_account_id
  ) then
    raise exception 'Non-bank account % cannot be linked to Bank Statement', account_row.code;
  end if;
end
$$;

create or replace function public.enforce_company_account_row_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  perform public.assert_company_account_integrity(new.id);
  return new;
end
$$;

create or replace function public.enforce_company_account_currency_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.assert_company_account_integrity(old.account_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.account_id <> new.account_id then
    perform public.assert_company_account_integrity(old.account_id);
  end if;

  perform public.assert_company_account_integrity(new.account_id);
  return new;
end
$$;

create or replace function public.enforce_bank_statement_account_integrity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.account_id is not null and not exists (
    select 1
    from public.accounts
    where id = new.account_id
      and account_group = 'bank'
  ) then
    raise exception 'Bank Statement account must be a bank account';
  end if;

  return new;
end
$$;

drop trigger if exists company_account_row_integrity_guard on public.accounts;
create constraint trigger company_account_row_integrity_guard
after insert or update on public.accounts
deferrable initially deferred
for each row execute function public.enforce_company_account_row_integrity();

drop trigger if exists company_account_currency_integrity_guard on public.account_currency_balances;
create constraint trigger company_account_currency_integrity_guard
after insert or update or delete on public.account_currency_balances
deferrable initially deferred
for each row execute function public.enforce_company_account_currency_integrity();

drop trigger if exists bank_statement_account_integrity_guard on public.bank_statement;
create constraint trigger bank_statement_account_integrity_guard
after insert or update of account_id on public.bank_statement
deferrable initially deferred
for each row execute function public.enforce_bank_statement_account_integrity();

do $$
declare
  account_id_to_validate bigint;
begin
  for account_id_to_validate in select id from public.accounts loop
    perform public.assert_company_account_integrity(account_id_to_validate);
  end loop;
end
$$;

commit;
