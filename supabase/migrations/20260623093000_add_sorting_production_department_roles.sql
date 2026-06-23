insert into public.app_permissions (code, module, resource, action, description) values
  ('daily.weight_tickets.view', 'daily', 'weight_tickets', 'view', 'ดูและทำรายการใบชั่งสินค้าเข้า/ออก'),
  ('production.orders.view', 'production', 'orders', 'view', 'ดูและทำรายการใบชั่งผลิต/ใบสั่งผลิต'),
  ('production.reports.view', 'production', 'reports', 'view', 'ดูรายงานการผลิต')
on conflict (code) do update set
  description = excluded.description,
  active = true,
  updated_at = now();

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
  created_by,
  updated_by
) values
  (
    'sorting_department',
    'ฝ่ายคัดแยก',
    'เห็นเฉพาะใบชั่งสินค้าเข้า/ออก',
    false,
    'all',
    false,
    false,
    false,
    false,
    false,
    'migration',
    'migration'
  ),
  (
    'production_department',
    'ฝ่ายผลิต',
    'เห็นใบชั่งสินค้าเข้า/ออก ใบชั่งผลิต/ใบสั่งผลิต และรายงานการผลิต',
    false,
    'all',
    false,
    false,
    false,
    false,
    false,
    'migration',
    'migration'
  )
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  active = true,
  updated_at = now(),
  updated_by = 'migration';

insert into public.app_role_permissions (role_id, permission_id, created_by)
select r.id, p.id, 'migration'
from public.app_roles r
join public.app_permissions p on p.code in (
  'daily.weight_tickets.view'
)
where r.code = 'sorting_department'
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_id, created_by)
select r.id, p.id, 'migration'
from public.app_roles r
join public.app_permissions p on p.code in (
  'daily.weight_tickets.view',
  'production.orders.view',
  'production.reports.view'
)
where r.code = 'production_department'
on conflict do nothing;

with requested_users(username, display_name, email) as (
  values
    ('paphangkorn.nomsungnoen', 'Paphangkorn Nomsungnoen', 'import.export@newsolutionsth.com'),
    ('ueamporn.thongnarin', 'Ueamporn Thongnarin', 'aueampron15@gmail.com'),
    ('khwanta.traesawat', 'Khwanta Traesawat', 'kwantlar@gmail.com')
),
upserted_users as (
  insert into public.app_users (
    username,
    display_name,
    email,
    active,
    must_change_password,
    created_by,
    updated_by
  )
  select
    requested_users.username,
    requested_users.display_name,
    requested_users.email,
    true,
    false,
    'migration',
    'migration'
  from requested_users
  where not exists (
    select 1
    from public.app_users existing
    where lower(existing.email) = lower(requested_users.email)
       or lower(existing.username) = lower(requested_users.username)
  )
  returning id, email
),
target_users as (
  select existing.id, existing.email
  from public.app_users existing
  join requested_users on lower(existing.email) = lower(requested_users.email)
  union
  select id, email from upserted_users
),
target_role as (
  select id
  from public.app_roles
  where code = 'production_department'
)
insert into public.app_user_roles (user_id, role_id, created_by)
select target_users.id, target_role.id, 'migration'
from target_users
cross join target_role
on conflict do nothing;
