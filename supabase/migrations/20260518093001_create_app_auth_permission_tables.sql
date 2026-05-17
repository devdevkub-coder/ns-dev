-- Target auth/permission schema for Next app.
-- Additive/non-destructive: keeps legacy public.users, public.user_profiles, roles, and roles_config untouched.

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  username text not null,
  display_name text,
  email text,
  active boolean not null default true,
  must_change_password boolean not null default false,
  last_login_at timestamptz,
  legacy_user_id text,
  legacy_profile_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text
);

comment on table public.app_users is 'Application user profiles linked to Supabase auth.users. Does not store passwords.';
comment on column public.app_users.auth_user_id is 'Supabase Auth user id. Nullable to preserve app user/audit row if auth user is removed.';
comment on column public.app_users.legacy_user_id is 'Reference to legacy public.users.id during migration only.';
comment on column public.app_users.legacy_profile_id is 'Reference to legacy public.user_profiles.id during migration only.';

create unique index if not exists app_users_username_lower_key
  on public.app_users (lower(username));

create unique index if not exists app_users_email_lower_key
  on public.app_users (lower(email))
  where email is not null;

create index if not exists idx_app_users_auth_user_id on public.app_users(auth_user_id);
create index if not exists idx_app_users_active on public.app_users(active);
create index if not exists idx_app_users_legacy_user_id on public.app_users(legacy_user_id);

create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  branch_scope text not null default 'all',
  can_see_cost boolean not null default false,
  can_see_profit boolean not null default false,
  can_see_cash boolean not null default false,
  can_see_financials boolean not null default false,
  can_edit_opening_balance boolean not null default false,
  active boolean not null default true,
  legacy_role_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  constraint app_roles_branch_scope_chk check (branch_scope in ('all', 'own', 'custom'))
);

comment on table public.app_roles is 'Normalized application roles for Next permission model.';
comment on column public.app_roles.legacy_role_id is 'Reference to legacy role id/code during migration only.';

create index if not exists idx_app_roles_active on public.app_roles(active);
create index if not exists idx_app_roles_legacy_role_id on public.app_roles(legacy_role_id);

create table if not exists public.app_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  module text not null,
  resource text not null,
  action text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_permissions_code_chk check (code = module || '.' || resource || '.' || action)
);

comment on table public.app_permissions is 'Action-level permission catalog. Example: master.customers.view.';

create index if not exists idx_app_permissions_module on public.app_permissions(module);
create index if not exists idx_app_permissions_resource on public.app_permissions(resource);
create index if not exists idx_app_permissions_active on public.app_permissions(active);

create table if not exists public.app_role_permissions (
  role_id uuid not null references public.app_roles(id) on delete cascade,
  permission_id uuid not null references public.app_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by text,
  primary key (role_id, permission_id)
);

create index if not exists idx_app_role_permissions_permission_id
  on public.app_role_permissions(permission_id);

create table if not exists public.app_user_roles (
  user_id uuid not null references public.app_users(id) on delete cascade,
  role_id uuid not null references public.app_roles(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by text,
  primary key (user_id, role_id)
);

create index if not exists idx_app_user_roles_role_id on public.app_user_roles(role_id);

create table if not exists public.app_user_branch_access (
  user_id uuid not null references public.app_users(id) on delete cascade,
  branch_id text not null references public.branches(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by text,
  primary key (user_id, branch_id)
);

create index if not exists idx_app_user_branch_access_branch_id
  on public.app_user_branch_access(branch_id);

create or replace function public.app_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.app_set_updated_at();

drop trigger if exists app_roles_set_updated_at on public.app_roles;
create trigger app_roles_set_updated_at
before update on public.app_roles
for each row execute function public.app_set_updated_at();

drop trigger if exists app_permissions_set_updated_at on public.app_permissions;
create trigger app_permissions_set_updated_at
before update on public.app_permissions
for each row execute function public.app_set_updated_at();

alter table public.app_users enable row level security;
alter table public.app_roles enable row level security;
alter table public.app_permissions enable row level security;
alter table public.app_role_permissions enable row level security;
alter table public.app_user_roles enable row level security;
alter table public.app_user_branch_access enable row level security;

insert into public.app_roles (
  code,
  name,
  description,
  is_system,
  branch_scope,
  can_see_cost,
  can_see_profit,
  can_see_cash,
  can_see_financials,
  can_edit_opening_balance,
  legacy_role_id
) values
  ('admin', 'Admin', 'ผู้ดูแลระบบ เข้าได้ทุกเมนู', true, 'all', true, true, true, true, true, 'R-ADMIN'),
  ('owner', 'Owner', 'เจ้าของกิจการ เห็นทุกอย่าง', true, 'all', true, true, true, true, true, 'R-OWNER'),
  ('accountant', 'บัญชี', 'บัญชี งบการเงิน AR/AP ภาษี และบิลซื้อ/ขาย', false, 'all', true, true, true, true, false, 'R-ACCOUNTANT'),
  ('account_expense', 'บัญชีค่าใช้จ่าย', 'บัญชีค่าใช้จ่าย ค่าใช้จ่าย และ petty advance', false, 'all', true, true, true, true, false, 'R-ACCOUNT-EXPENSE'),
  ('coordinator', 'ประสานงาน', 'กรอกบิลซื้อ/ขาย Stock Trading PO และงานประสานงาน', false, 'all', true, false, false, false, false, 'R-COORDINATOR'),
  ('poopae', 'Poopae', 'Role พิเศษตาม legacy baseline', false, 'all', true, true, true, true, true, 'R-POOPAE'),
  ('warehouse', 'คลัง', 'คลังสินค้าและ production เฉพาะสาขาตัวเอง', false, 'own', false, false, false, false, false, 'R-WAREHOUSE')
on conflict (code) do nothing;

insert into public.app_permissions (code, module, resource, action, description) values
  ('system.users.manage', 'system', 'users', 'manage', 'จัดการผู้ใช้'),
  ('system.roles.manage', 'system', 'roles', 'manage', 'จัดการ role และ permission'),
  ('system.audit.view', 'system', 'audit', 'view', 'ดู audit/user activity'),
  ('system.backup.manage', 'system', 'backup', 'manage', 'จัดการ migration/backup tools'),
  ('master.customers.view', 'master', 'customers', 'view', 'ดูข้อมูลลูกค้า'),
  ('master.customers.create', 'master', 'customers', 'create', 'เพิ่มลูกค้า'),
  ('master.customers.update', 'master', 'customers', 'update', 'แก้ไขลูกค้า'),
  ('master.customers.status', 'master', 'customers', 'status', 'เปิด/ปิดสถานะลูกค้า'),
  ('master.customers.export', 'master', 'customers', 'export', 'Export ลูกค้า'),
  ('master.suppliers.view', 'master', 'suppliers', 'view', 'ดูข้อมูลผู้ขาย'),
  ('master.suppliers.create', 'master', 'suppliers', 'create', 'เพิ่มผู้ขาย'),
  ('master.suppliers.update', 'master', 'suppliers', 'update', 'แก้ไขผู้ขาย'),
  ('master.suppliers.status', 'master', 'suppliers', 'status', 'เปิด/ปิดสถานะผู้ขาย'),
  ('master.suppliers.export', 'master', 'suppliers', 'export', 'Export ผู้ขาย'),
  ('master.products.view', 'master', 'products', 'view', 'ดูสินค้า'),
  ('master.products.create', 'master', 'products', 'create', 'เพิ่มสินค้า'),
  ('master.products.update', 'master', 'products', 'update', 'แก้ไขสินค้า'),
  ('master.products.status', 'master', 'products', 'status', 'เปิด/ปิดสถานะสินค้า'),
  ('master.products.export', 'master', 'products', 'export', 'Export สินค้า'),
  ('master.reference.view', 'master', 'reference', 'view', 'ดู master/reference data อื่น'),
  ('master.reference.manage', 'master', 'reference', 'manage', 'จัดการ master/reference data อื่น'),
  ('finance.cash.view', 'finance', 'cash', 'view', 'เห็นเงินสด/ธนาคาร'),
  ('finance.financials.view', 'finance', 'financials', 'view', 'เห็นงบการเงิน'),
  ('finance.opening_balance.manage', 'finance', 'opening_balance', 'manage', 'แก้ Opening Balance'),
  ('stock.ledger.view', 'stock', 'ledger', 'view', 'ดู stock ledger'),
  ('production.operations.view', 'production', 'operations', 'view', 'ดูงาน production'),
  ('reports.reports.view', 'reports', 'reports', 'view', 'ดูรายงาน')
on conflict (code) do nothing;

insert into public.app_role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
cross join public.app_permissions p
where r.code in ('admin', 'owner')
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.app_permissions p on p.code in (
  'master.customers.view',
  'master.customers.create',
  'master.customers.update',
  'master.customers.export',
  'master.suppliers.view',
  'master.suppliers.create',
  'master.suppliers.update',
  'master.suppliers.export',
  'master.products.view',
  'master.products.create',
  'master.products.update',
  'master.products.export',
  'master.reference.view',
  'finance.cash.view',
  'finance.financials.view',
  'stock.ledger.view',
  'reports.reports.view'
)
where r.code in ('accountant', 'account_expense')
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.app_permissions p on p.code in (
  'master.customers.view',
  'master.customers.create',
  'master.customers.update',
  'master.suppliers.view',
  'master.suppliers.create',
  'master.suppliers.update',
  'master.products.view',
  'master.products.create',
  'master.products.update',
  'master.reference.view',
  'stock.ledger.view',
  'reports.reports.view'
)
where r.code = 'coordinator'
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
join public.app_permissions p on p.code in (
  'master.products.view',
  'master.products.update',
  'master.reference.view',
  'stock.ledger.view',
  'production.operations.view'
)
where r.code = 'warehouse'
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_id)
select r.id, p.id
from public.app_roles r
cross join public.app_permissions p
where r.code = 'poopae'
on conflict do nothing;
