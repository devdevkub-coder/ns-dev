-- Replace the legacy broad admin permissions with explicit grants while
-- keeping existing role and user access behavior during the code migration.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct legacy_assignment.role_id, target_permission.id, 'migration'
from public.app_role_permissions legacy_assignment
join public.app_permissions legacy_permission
  on legacy_permission.id = legacy_assignment.permission_id
join public.app_permissions target_permission
  on target_permission.code in (
    'system.users.view',
    'system.users.create',
    'system.users.update',
    'system.users.activate',
    'system.users.credentials_manage'
  )
where legacy_permission.code = 'system.users.manage'
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct legacy_assignment.role_id, target_permission.id, 'migration'
from public.app_role_permissions legacy_assignment
join public.app_permissions legacy_permission
  on legacy_permission.id = legacy_assignment.permission_id
join public.app_permissions target_permission
  on target_permission.code in (
    'system.users.view',
    'system.roles.view',
    'system.roles.create',
    'system.roles.update',
    'system.roles.activate',
    'system.permissions.view',
    'system.permissions.update'
  )
where legacy_permission.code = 'system.roles.manage'
on conflict do nothing;

insert into public.app_user_permission_overrides (
  user_id,
  permission_id,
  effect,
  created_by,
  updated_by
)
select distinct legacy_override.user_id, target_permission.id, legacy_override.effect, 'migration', 'migration'
from public.app_user_permission_overrides legacy_override
join public.app_permissions legacy_permission
  on legacy_permission.id = legacy_override.permission_id
join public.app_permissions target_permission
  on target_permission.code in (
    'system.users.view',
    'system.users.create',
    'system.users.update',
    'system.users.activate',
    'system.users.credentials_manage'
  )
where legacy_permission.code = 'system.users.manage'
on conflict (user_id, permission_id) do nothing;

insert into public.app_user_permission_overrides (
  user_id,
  permission_id,
  effect,
  created_by,
  updated_by
)
select distinct legacy_override.user_id, target_permission.id, legacy_override.effect, 'migration', 'migration'
from public.app_user_permission_overrides legacy_override
join public.app_permissions legacy_permission
  on legacy_permission.id = legacy_override.permission_id
join public.app_permissions target_permission
  on target_permission.code in (
    'system.users.view',
    'system.roles.view',
    'system.roles.create',
    'system.roles.update',
    'system.roles.activate',
    'system.permissions.view',
    'system.permissions.update'
  )
where legacy_permission.code = 'system.roles.manage'
on conflict (user_id, permission_id) do nothing;
