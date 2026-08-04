-- Keep the coordinator role operationally useful without granting finance,
-- approval, payment, or broad shared-reference access.
-- This migration is intentionally role-scoped. User overrides remain explicit
-- and are not silently rewritten here.

with desired_permissions(code, module, resource, action, description) as (
  values
    ('daily.weight_tickets.update', 'daily', 'weight_tickets', 'update', 'แก้ไขใบรับ-ส่งของ'),
    ('daily.weight_tickets.cancel', 'daily', 'weight_tickets', 'cancel', 'ยกเลิกใบรับ-ส่งของ'),
    ('purchase.po_buy.cancel', 'purchase', 'po_buy', 'cancel', 'ยกเลิก PO Buy'),
    ('sales.po_sell.cancel', 'sales', 'po_sell', 'cancel', 'ยกเลิก PO Sell'),
    ('master.product_types.view', 'master', 'product_types', 'view', 'ดูประเภทสินค้า'),
    ('master.product_units.view', 'master', 'product_units', 'view', 'ดูหน่วยสินค้า'),
    ('master.salespersons.view', 'master', 'salespersons', 'view', 'ดูพนักงานขาย')
)
insert into public.app_permissions (code, module, resource, action, description)
select code, module, resource, action, description
from desired_permissions
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

insert into public.app_role_permissions (role_id, permission_id, created_by)
select role.id, permission.id, 'migration'
from public.app_roles role
cross join public.app_permissions permission
where role.code = 'coordinator'
  and permission.code in (
    'daily.weight_tickets.update',
    'daily.weight_tickets.cancel',
    'purchase.po_buy.cancel',
    'sales.po_sell.cancel',
    'master.product_types.view',
    'master.product_units.view',
    'master.salespersons.view'
  )
  and permission.active = true
on conflict do nothing;

delete from public.app_role_permissions role_permission
using public.app_roles role, public.app_permissions permission
where role_permission.role_id = role.id
  and role_permission.permission_id = permission.id
  and role.code = 'coordinator'
  and permission.code in (
    'finance.cash.view',
    'reports.reports.view',
    'purchase.bills.approve',
    'purchase.bills.pay',
    'sales.bills.approve',
    'sales.bills.receive',
    'master.impurities.delete'
  );

-- Do not switch branch_scope to own here. All current coordinator users have
-- zero app_user_branch_access rows; doing so would hide every branch-scoped
-- record until branch assignments are configured deliberately.

do $$
declare
  missing_required text[];
  forbidden_remaining text[];
begin
  select coalesce(array_agg(permission.code order by permission.code), '{}')
    into missing_required
  from public.app_permissions permission
  where permission.code in (
    'daily.weight_tickets.update',
    'daily.weight_tickets.cancel',
    'purchase.po_buy.cancel',
    'sales.po_sell.cancel',
    'master.product_types.view',
    'master.product_units.view',
    'master.salespersons.view'
  )
  and not exists (
    select 1
    from public.app_role_permissions role_permission
    join public.app_roles role on role.id = role_permission.role_id
    where role.code = 'coordinator'
      and role_permission.permission_id = permission.id
  );

  if cardinality(missing_required) > 0 then
    raise exception 'Coordinator required permissions missing: %', missing_required;
  end if;

  select coalesce(array_agg(permission.code order by permission.code), '{}')
    into forbidden_remaining
  from public.app_role_permissions role_permission
  join public.app_roles role on role.id = role_permission.role_id
  join public.app_permissions permission on permission.id = role_permission.permission_id
  where role.code = 'coordinator'
    and permission.code in (
      'finance.cash.view',
      'reports.reports.view',
      'purchase.bills.approve',
      'purchase.bills.pay',
      'sales.bills.approve',
      'sales.bills.receive',
      'master.impurities.delete',
      'daily.weight_tickets.open_bill'
    );

  if cardinality(forbidden_remaining) > 0 then
    raise exception 'Coordinator forbidden permissions remain: %', forbidden_remaining;
  end if;
end $$;
