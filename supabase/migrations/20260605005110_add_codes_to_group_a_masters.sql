alter table public.bank_names
  add column if not exists code text;

update public.bank_names
set code = upper(id)
where code is null or btrim(code) = '';

alter table public.bank_names
  alter column code set not null;

create unique index if not exists bank_names_code_key
  on public.bank_names (code);

alter table public.payment_methods
  add column if not exists code text;

update public.payment_methods
set code = upper(id)
where code is null or btrim(code) = '';

alter table public.payment_methods
  alter column code set not null;

create unique index if not exists payment_methods_code_key
  on public.payment_methods (code);

alter table public.product_units
  add column if not exists code text;

update public.product_units
set code = upper(id)
where code is null or btrim(code) = '';

alter table public.product_units
  alter column code set not null;

create unique index if not exists product_units_code_key
  on public.product_units (code);

alter table public.product_types
  add column if not exists code text;

update public.product_types
set code = upper(id)
where code is null or btrim(code) = '';

alter table public.product_types
  alter column code set not null;

create unique index if not exists product_types_code_key
  on public.product_types (code);

alter table public.expense_types
  add column if not exists code text;

with numbered as (
  select
    id,
    row_number() over (order by id) as seq
  from public.expense_types
  where code is null or btrim(code) = ''
)
update public.expense_types et
set code = case
  when upper(et.id) like 'EXT-%' then upper(et.id)
  else 'EXT-' || lpad(numbered.seq::text, 3, '0')
end
from numbered
where et.id = numbered.id;

alter table public.expense_types
  alter column code set not null;

create unique index if not exists expense_types_code_key
  on public.expense_types (code);

alter table public.expense_categories
  add column if not exists code text;

with numbered as (
  select
    id,
    row_number() over (order by id) as seq
  from public.expense_categories
  where code is null or btrim(code) = ''
)
update public.expense_categories ec
set code = case
  when upper(ec.id) like 'EXC-%' then upper(ec.id)
  else 'EXC-' || lpad(numbered.seq::text, 3, '0')
end
from numbered
where ec.id = numbered.id;

alter table public.expense_categories
  alter column code set not null;

create unique index if not exists expense_categories_code_key
  on public.expense_categories (code);
