-- Give Transaction Ledger its own visibility permission so it can be hidden
-- without removing access to other finance and debt pages.
insert into public.app_permissions (code, module, resource, action, description)
values (
  'finance.transaction_ledger.view',
  'finance',
  'transaction_ledger',
  'view',
  'เห็น Transaction Ledger'
)
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

-- Preserve existing effective access as the initial default. Administrators can
-- then remove this page grant independently from finance.cash.view.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct legacy_assignment.role_id, target_permission.id, 'migration'
from public.app_role_permissions legacy_assignment
join public.app_permissions legacy_permission
  on legacy_permission.id = legacy_assignment.permission_id
join public.app_permissions target_permission
  on target_permission.code = 'finance.transaction_ledger.view'
where legacy_permission.code = 'finance.cash.view'
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
  on target_permission.code = 'finance.transaction_ledger.view'
where legacy_permission.code = 'finance.cash.view'
on conflict (user_id, permission_id) do nothing;
