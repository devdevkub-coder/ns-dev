create table if not exists public.customer_branches (
  id bigserial primary key,
  customer_id bigint not null references public.customers(id) on update no action on delete restrict,
  branch_id bigint not null references public.branches(id) on update no action on delete restrict,
  active boolean not null default true,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  constraint customer_branches_customer_branch_unique unique (customer_id, branch_id)
);

create unique index if not exists uq_customer_branches_primary_active
  on public.customer_branches(customer_id)
  where active is true and is_primary is true;

create index if not exists idx_customer_branches_branch_active_customer
  on public.customer_branches(branch_id, customer_id)
  where active is true;

create index if not exists idx_customer_branches_customer_active_branch
  on public.customer_branches(customer_id, branch_id)
  where active is true;

create table if not exists public.supplier_branches (
  id bigserial primary key,
  supplier_id bigint not null references public.suppliers(id) on update no action on delete restrict,
  branch_id bigint not null references public.branches(id) on update no action on delete restrict,
  active boolean not null default true,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  constraint supplier_branches_supplier_branch_unique unique (supplier_id, branch_id)
);

create unique index if not exists uq_supplier_branches_primary_active
  on public.supplier_branches(supplier_id)
  where active is true and is_primary is true;

create index if not exists idx_supplier_branches_branch_active_supplier
  on public.supplier_branches(branch_id, supplier_id)
  where active is true;

create index if not exists idx_supplier_branches_supplier_active_branch
  on public.supplier_branches(supplier_id, branch_id)
  where active is true;

insert into public.supplier_branches (
  supplier_id,
  branch_id,
  active,
  is_primary,
  created_at,
  updated_at,
  created_by,
  updated_by
)
select
  s.id,
  s.branch_id,
  coalesce(s.active, true),
  true,
  coalesce(s.created_at, now()),
  coalesce(s.updated_at, now()),
  'migration:20260624203000',
  'migration:20260624203000'
from public.suppliers s
where s.branch_id is not null
on conflict (supplier_id, branch_id) do update
set
  active = excluded.active,
  is_primary = true,
  updated_at = now(),
  updated_by = 'migration:20260624203000';
