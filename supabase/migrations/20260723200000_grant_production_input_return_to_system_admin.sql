-- System admins must be able to return production inputs through the same
-- production action permission boundary as input, output, and completion.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select r.id, p.id, 'migration'
from public.app_roles r
cross join public.app_permissions p
where r.code = 'system_admin'
  and r.active = true
  and p.code = 'production.orders.input_return'
on conflict (role_id, permission_id) do nothing;
