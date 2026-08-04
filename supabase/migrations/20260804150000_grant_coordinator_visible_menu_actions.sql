-- Grant only actions exposed by the coordinator's current visible menus.
-- Keep the grants resource-scoped; do not use master.reference.view/manage as
-- a workaround for product type/unit or salesperson access.
with desired_permissions(code, module, resource, action, description) as (
  values
    ('daily.weight_tickets.open_bill', 'daily', 'weight_tickets', 'open_bill', 'เปิดบิลจากใบรับ/ส่งของ'),
    ('master.product_types.create', 'master', 'product_types', 'create', 'สร้างประเภทสินค้า'),
    ('master.product_types.update', 'master', 'product_types', 'update', 'แก้ไขประเภทสินค้า'),
    ('master.product_types.status', 'master', 'product_types', 'status', 'เปิด/ปิดประเภทสินค้า'),
    ('master.product_units.create', 'master', 'product_units', 'create', 'สร้างหน่วยสินค้า'),
    ('master.product_units.update', 'master', 'product_units', 'update', 'แก้ไขหน่วยสินค้า'),
    ('master.product_units.status', 'master', 'product_units', 'status', 'เปิด/ปิดหน่วยสินค้า'),
    ('master.salespersons.create', 'master', 'salespersons', 'create', 'สร้างพนักงานขาย'),
    ('master.salespersons.update', 'master', 'salespersons', 'update', 'แก้ไขพนักงานขาย'),
    ('master.salespersons.status', 'master', 'salespersons', 'status', 'เปิด/ปิดพนักงานขาย')
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
join public.app_permissions permission on permission.code in (
  'daily.weight_tickets.open_bill',
  'master.product_types.create', 'master.product_types.update', 'master.product_types.status',
  'master.product_units.create', 'master.product_units.update', 'master.product_units.status',
  'master.salespersons.create', 'master.salespersons.update', 'master.salespersons.status'
)
where role.code = 'coordinator'
  and permission.active = true
on conflict do nothing;

do $$
declare
  missing text[];
begin
  select coalesce(array_agg(required.code order by required.code), '{}')
    into missing
  from (values
    ('daily.weight_tickets.open_bill'),
    ('master.product_types.create'), ('master.product_types.update'), ('master.product_types.status'),
    ('master.product_units.create'), ('master.product_units.update'), ('master.product_units.status'),
    ('master.salespersons.create'), ('master.salespersons.update'), ('master.salespersons.status')
  ) as required(code)
  where not exists (
    select 1
    from public.app_role_permissions role_permission
    join public.app_roles role on role.id = role_permission.role_id
    join public.app_permissions permission on permission.id = role_permission.permission_id
    where role.code = 'coordinator'
      and permission.code = required.code
      and permission.active = true
  );

  if cardinality(missing) > 0 then
    raise exception 'Coordinator visible-menu permissions missing: %', missing;
  end if;
end $$;
