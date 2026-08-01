-- Promote the existing system_admin role to the application-wide Super Admin.
-- Authorization code treats this role as an admin bypass so future permission
-- catalog entries do not require a separate grant migration.
update public.app_roles
set
  name = 'Super Admin',
  description = 'สิทธิ์สูงสุดของระบบ ใช้งานได้ทุกเมนู ทุกสิทธิ์ และทุกสาขา',
  branch_scope = 'all',
  can_see_cost = true,
  can_see_profit = true,
  can_see_cash = true,
  can_see_financials = true,
  can_edit_opening_balance = true,
  active = true,
  updated_at = now(),
  updated_by = 'migration:promote_system_admin_to_super_admin'
where code = 'system_admin';

-- Keep the normalized role-permission view complete for admin screens and
-- data-driven consumers, including permissions added before this migration.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select roles.id, permissions.id, 'migration:promote_system_admin_to_super_admin'
from public.app_roles roles
cross join public.app_permissions permissions
where roles.code = 'system_admin'
  and roles.active = true
  and permissions.active = true
on conflict (role_id, permission_id) do nothing;
