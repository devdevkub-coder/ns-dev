-- System admins already have production read access; grant the matching write actions.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select r.id, p.id, 'migration'
from public.app_roles r
cross join public.app_permissions p
where r.code = 'system_admin'
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
