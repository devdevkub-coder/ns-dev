-- Keep roles and user overrides that still use the legacy report permission
-- aligned with the page-level permissions introduced by the split migration.

insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct legacy.role_id, split_permission.id, 'migration:sync-split-report-permissions'
from public.app_role_permissions legacy
join public.app_permissions old_permission
  on old_permission.id = legacy.permission_id
 and old_permission.code = 'reports.reports.view'
join public.app_permissions split_permission
  on split_permission.code in (
    'reports.owner_daily.view',
    'reports.daily_report.view',
    'reports.analytics_dashboard.view',
    'reports.dashboard.view',
    'reports.profit_cost.view',
    'reports.sales_plan.view',
    'reports.sales_plan_analysis.view',
    'reports.sales_tracking.view',
    'reports.cash_flow_calendar.view',
    'reports.business_calendar.view',
    'reports.cash_others_summary.view'
  )
on conflict do nothing;

insert into public.app_user_permission_overrides (
  user_id,
  permission_id,
  effect,
  created_by,
  updated_by
)
select distinct
  legacy_override.user_id,
  split_permission.id,
  legacy_override.effect,
  'migration:sync-split-report-permissions',
  'migration:sync-split-report-permissions'
from public.app_user_permission_overrides legacy_override
join public.app_permissions old_permission
  on old_permission.id = legacy_override.permission_id
 and old_permission.code = 'reports.reports.view'
join public.app_permissions split_permission
  on split_permission.code in (
    'reports.owner_daily.view',
    'reports.daily_report.view',
    'reports.analytics_dashboard.view',
    'reports.dashboard.view',
    'reports.profit_cost.view',
    'reports.sales_plan.view',
    'reports.sales_plan_analysis.view',
    'reports.sales_tracking.view',
    'reports.cash_flow_calendar.view',
    'reports.business_calendar.view',
    'reports.cash_others_summary.view'
  )
on conflict (user_id, permission_id) do nothing;
