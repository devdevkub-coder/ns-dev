create table if not exists public.expense_types (
  id text primary key,
  name text not null,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.expense_categories
  add column if not exists expense_type_id text;

insert into public.expense_types (id, name, active)
select distinct ec.type, ec.type, true
from public.expense_categories ec
where ec.type is not null
  and btrim(ec.type) <> ''
  and not exists (
    select 1
    from public.expense_types et
    where et.id = ec.type
  );

update public.expense_categories
set expense_type_id = type
where expense_type_id is null
  and type is not null
  and btrim(type) <> '';

create index if not exists idx_expense_categories_expense_type_id
  on public.expense_categories (expense_type_id);
