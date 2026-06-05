alter table public.customers
  alter column code set not null;

alter table public.salespersons
  alter column code set not null;

alter table public.suppliers
  alter column code set not null;

alter table public.products
  alter column code set not null;

alter table public.accounts
  alter column code set not null;

alter table public.currencies
  alter column code set not null;

alter table public.purchase_channels
  alter column code set not null;

alter table public.sales_channels
  alter column code set not null;

create unique index if not exists uq_customers_code
  on public.customers (code);

create unique index if not exists uq_salespersons_code
  on public.salespersons (code);

create unique index if not exists uq_suppliers_code
  on public.suppliers (code);

create unique index if not exists uq_products_code
  on public.products (code);

alter table public.users
  drop column if exists password;

alter table public.user_profiles
  drop column if exists branch_ids;
