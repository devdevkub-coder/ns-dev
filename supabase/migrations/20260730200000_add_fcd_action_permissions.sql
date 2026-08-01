-- FCD writers post atomically and have no separate approval state.  Their
-- permission boundary is therefore view, post, and reverse per event type.
insert into public.app_permissions (code, module, resource, action, description)
values
  ('finance.fcd_conversions.view', 'finance', 'fcd_conversions', 'view', 'ดูรายการแลกเงิน FCD'),
  ('finance.fcd_conversions.post', 'finance', 'fcd_conversions', 'post', 'บันทึกรายการแลกเงิน FCD'),
  ('finance.fcd_conversions.reverse', 'finance', 'fcd_conversions', 'reverse', 'ยกเลิกรายการแลกเงิน FCD'),
  ('finance.fcd_revaluations.view', 'finance', 'fcd_revaluations', 'view', 'ดูรายการตีมูลค่า FCD'),
  ('finance.fcd_revaluations.post', 'finance', 'fcd_revaluations', 'post', 'บันทึกรายการตีมูลค่า FCD'),
  ('finance.fcd_revaluations.reverse', 'finance', 'fcd_revaluations', 'reverse', 'ยกเลิกรายการตีมูลค่า FCD')
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

-- Preserve the existing cash permission surface at rollout.  New grants are
-- independently removable after this migration.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct legacy_assignment.role_id, target_permission.id, 'migration'
from public.app_role_permissions legacy_assignment
join public.app_permissions legacy_permission
  on legacy_permission.id = legacy_assignment.permission_id
join public.app_permissions target_permission
  on target_permission.code in (
    'finance.fcd_conversions.view',
    'finance.fcd_conversions.post',
    'finance.fcd_conversions.reverse',
    'finance.fcd_revaluations.view',
    'finance.fcd_revaluations.post',
    'finance.fcd_revaluations.reverse'
  )
where legacy_permission.code = 'finance.cash.view'
on conflict (role_id, permission_id) do nothing;

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
    'finance.fcd_conversions.view',
    'finance.fcd_conversions.post',
    'finance.fcd_conversions.reverse',
    'finance.fcd_revaluations.view',
    'finance.fcd_revaluations.post',
    'finance.fcd_revaluations.reverse'
  )
where legacy_permission.code = 'finance.cash.view'
on conflict (user_id, permission_id) do nothing;
