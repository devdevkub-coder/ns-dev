-- Production orders mutations have separate permission boundaries from read access.
insert into public.app_permissions (code, module, resource, action, description)
values
  ('production.orders.create', 'production', 'orders', 'create', 'สร้างใบสั่งผลิต'),
  ('production.orders.input', 'production', 'orders', 'input', 'เบิกวัตถุดิบเข้าใบสั่งผลิต'),
  ('production.orders.output', 'production', 'orders', 'output', 'รับผลผลิตจากใบสั่งผลิต'),
  ('production.orders.reverse', 'production', 'orders', 'reverse', 'ย้อนรายการใบสั่งผลิต'),
  ('production.orders.complete', 'production', 'orders', 'complete', 'จบงานใบสั่งผลิต'),
  ('production.orders.cancel', 'production', 'orders', 'cancel', 'ยกเลิกใบสั่งผลิต'),
  ('production.orders.export', 'production', 'orders', 'export', 'ส่งออกใบสั่งผลิต')
on conflict (code) do update
set module = excluded.module,
    resource = excluded.resource,
    action = excluded.action,
    description = excluded.description,
    active = true,
    updated_at = now();

insert into public.app_role_permissions (role_id, permission_id, created_by)
select r.id, p.id, 'migration'
from public.app_roles r
cross join public.app_permissions p
where r.code = 'production_department'
  and p.code in (
    'production.orders.create',
    'production.orders.input',
    'production.orders.output',
    'production.orders.reverse',
    'production.orders.complete',
    'production.orders.cancel',
    'production.orders.export'
  )
on conflict (role_id, permission_id) do nothing;

-- Admin and owner roles retain catalog-wide access to newly introduced actions.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select r.id, p.id, 'migration'
from public.app_roles r
cross join public.app_permissions p
where r.code in ('admin', 'owner')
  and r.active = true
  and p.code in (
    'production.orders.create',
    'production.orders.input',
    'production.orders.output',
    'production.orders.reverse',
    'production.orders.complete',
    'production.orders.cancel',
    'production.orders.export'
  )
on conflict (role_id, permission_id) do nothing;
