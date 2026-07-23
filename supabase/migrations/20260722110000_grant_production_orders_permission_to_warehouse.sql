-- Keep warehouse users able to load production orders after the route moved
-- from the legacy production.operations.view permission to the dedicated
-- production.orders.view permission.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select r.id, p.id, 'migration'
from public.app_roles r
join public.app_permissions p on p.code = 'production.orders.view'
where r.code = 'warehouse'
on conflict do nothing;
