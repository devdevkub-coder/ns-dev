-- Split Dashboard & Reports from one broad permission into page-level view permissions.
-- Existing role grants and direct overrides are copied so this migration is
-- backward-compatible; administrators can then change each page independently.

insert into public.app_permissions (code, module, resource, action, description)
values
  ('reports.owner_daily.view', 'reports', 'owner_daily', 'view', 'ดู Owner Daily Control'),
  ('reports.daily_report.view', 'reports', 'daily_report', 'view', 'ดู Daily Report'),
  ('reports.analytics_dashboard.view', 'reports', 'analytics_dashboard', 'view', 'ดู Analytics Dashboard'),
  ('reports.dashboard.view', 'reports', 'dashboard', 'view', 'ดู Dashboard Overview'),
  ('reports.profit_cost.view', 'reports', 'profit_cost', 'view', 'ดู Profit & Cost Analysis'),
  ('reports.sales_plan.view', 'reports', 'sales_plan', 'view', 'ดูรายการรอขายและวางแผนการขาย LME'),
  ('reports.sales_plan_analysis.view', 'reports', 'sales_plan_analysis', 'view', 'ดูวางแผนสต๊อกเทียบ PO Sell'),
  ('reports.sales_tracking.view', 'reports', 'sales_tracking', 'view', 'ดู Sales Tracking Dashboard'),
  ('reports.cash_flow_calendar.view', 'reports', 'cash_flow_calendar', 'view', 'ดู Cash Flow Calendar'),
  ('reports.business_calendar.view', 'reports', 'business_calendar', 'view', 'ดู Business Calendar'),
  ('reports.cash_others_summary.view', 'reports', 'cash_others_summary', 'view', 'ดู Cash & Others Summary')
on conflict (code) do nothing;

-- Roles that had the old report permission retain access to every split page.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct legacy.role_id, split_permission.id, 'migration:split-main-report-pages'
from public.app_role_permissions legacy
join public.app_permissions old_permission
  on old_permission.id = legacy.permission_id
 and old_permission.code = 'reports.reports.view'
cross join public.app_permissions split_permission
where split_permission.code in (
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

-- Preserve existing per-user allow/deny decisions until an administrator edits
-- the newly split rows in Users & Permissions.
insert into public.app_user_permission_overrides (user_id, permission_id, effect, created_by, updated_by)
select distinct legacy_override.user_id, split_permission.id, legacy_override.effect,
  'migration:split-main-report-pages', 'migration:split-main-report-pages'
from public.app_user_permission_overrides legacy_override
join public.app_permissions old_permission
  on old_permission.id = legacy_override.permission_id
 and old_permission.code = 'reports.reports.view'
cross join public.app_permissions split_permission
where split_permission.code in (
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
