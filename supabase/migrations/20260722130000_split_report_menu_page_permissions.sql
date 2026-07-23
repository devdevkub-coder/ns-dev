-- Split the four Reports sidebar pages from the legacy reports.reports.view grant.
-- Existing grants are copied as defaults so administrators can narrow visibility
-- without unexpectedly removing current access.
insert into public.app_permissions (code, module, resource, action, description)
values
  ('reports.expense_dashboard.view', 'reports', 'expense_dashboard', 'view', 'เห็น Dashboard ค่าใช้จ่าย'),
  ('reports.trading_dashboard.view', 'reports', 'trading_dashboard', 'view', 'เห็น Trading Dashboard'),
  ('reports.po_outstanding.view', 'reports', 'po_outstanding', 'view', 'เห็นรายงาน PO ซื้อ/ขายคงเหลือ'),
  ('reports.reports_index.view', 'reports', 'reports_index', 'view', 'เห็นรายงานทั้งหมด')
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct legacy_assignment.role_id, target_permission.id, 'migration'
from public.app_role_permissions legacy_assignment
join public.app_permissions legacy_permission
  on legacy_permission.id = legacy_assignment.permission_id
join public.app_permissions target_permission
  on target_permission.code in (
    'reports.expense_dashboard.view',
    'reports.trading_dashboard.view',
    'reports.po_outstanding.view',
    'reports.reports_index.view'
  )
where legacy_permission.code = 'reports.reports.view'
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
    'reports.expense_dashboard.view',
    'reports.trading_dashboard.view',
    'reports.po_outstanding.view',
    'reports.reports_index.view'
  )
where legacy_permission.code = 'reports.reports.view'
on conflict (user_id, permission_id) do nothing;
