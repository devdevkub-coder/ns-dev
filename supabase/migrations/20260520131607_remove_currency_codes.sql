create schema if not exists maintenance;

create table if not exists maintenance.currency_code_removal_backup_20260520131607 as
select *
from public.currencies;

create table if not exists maintenance.remittance_purpose_code_removal_backup_20260520131607 as
select *
from public.overseas_remittance_purposes;

alter table public.currencies
  add column if not exists id text;

update public.currencies
set id = upper(coalesce(nullif(trim(symbol), ''), code))
where id is null or trim(id) = '';

alter table public.currencies
  alter column id set not null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'currencies'
      and constraint_type = 'PRIMARY KEY'
  ) then
    alter table public.currencies drop constraint currencies_pkey;
  end if;
end $$;

alter table public.currencies
  add constraint currencies_pkey primary key (id);

create unique index if not exists currencies_symbol_unique
  on public.currencies (upper(symbol))
  where symbol is not null;

alter table public.currencies
  drop column if exists code;

alter table public.overseas_remittance_purposes
  drop constraint if exists remittance_purposes_code_key;

alter table public.overseas_remittance_purposes
  drop column if exists code;
