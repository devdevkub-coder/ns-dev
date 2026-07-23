insert into public.app_permissions (code, module, resource, action, description)
values ('production.orders.input_return', 'production', 'orders', 'input_return', 'คืนวัตถุดิบจากใบสั่งผลิต')
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
where r.code in ('admin', 'owner', 'production_department')
  and r.active = true
  and p.code = 'production.orders.input_return'
on conflict (role_id, permission_id) do nothing;
