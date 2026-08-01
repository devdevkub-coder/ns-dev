begin;

-- This singleton is the only runtime source for the company's functional
-- currency. It is intentionally not seeded: writers must fail closed until
-- finance configures real master data.
create table if not exists public.finance_currency_policies (
  id boolean primary key default true,
  functional_currency_code text not null references public.currencies(code),
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint finance_currency_policies_singleton_chk check (id)
);

create or replace function public.set_finance_currency_policies_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_finance_currency_policies_updated_at on public.finance_currency_policies;
create trigger set_finance_currency_policies_updated_at
before update on public.finance_currency_policies
for each row execute function public.set_finance_currency_policies_updated_at();

alter table public.finance_currency_policies enable row level security;

commit;
