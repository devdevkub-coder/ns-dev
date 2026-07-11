-- Runs after the 2026-07-11 shared dev migration batch; 20260711103000 is
-- reserved by retire_admin_department in new-origin/dev.
-- Some permissions were added after the baseline admin/owner "all current
-- permissions" grant. Backfill all active catalog permissions so data-driven
-- proxy checks do not send authenticated admin/owner users back to /login.
insert into public.app_permissions (code, module, resource, action, description) values
  ('daily.weight_tickets.view', 'daily', 'weight_tickets', 'view', 'ดูและทำรายการใบรับ-ส่งของ')
on conflict (code) do update set
  active = true,
  description = excluded.description,
  updated_at = now();

insert into public.app_role_permissions (role_id, permission_id, created_by)
select roles.id, permissions.id, 'migration'
from public.app_roles roles
cross join public.app_permissions permissions
where roles.code in ('admin', 'owner')
  and roles.active = true
  and permissions.active = true
on conflict do nothing;
