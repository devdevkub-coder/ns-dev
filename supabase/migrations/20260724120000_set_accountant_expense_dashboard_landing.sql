do $$
declare
  accountant_role_id bigint;
  expense_dashboard_permission_id bigint;
begin
  select id
  into accountant_role_id
  from public.app_roles
  where code = 'accountant'
    and active = true;

  if accountant_role_id is null then
    raise exception 'Active accountant role is required before setting its landing page';
  end if;

  select id
  into expense_dashboard_permission_id
  from public.app_permissions
  where code = 'reports.expense_dashboard.view'
    and active = true;

  if expense_dashboard_permission_id is null then
    raise exception 'Active reports.expense_dashboard.view permission is required before setting the accountant landing page';
  end if;

  if not exists (
    select 1
    from public.app_role_permissions
    where role_id = accountant_role_id
      and permission_id = expense_dashboard_permission_id
  ) then
    raise exception 'Accountant role must have reports.expense_dashboard.view before it can be the landing page';
  end if;

  update public.app_roles
  set
    default_landing_path = '/daily/expense-dashboard',
    updated_at = now(),
    updated_by = 'migration:20260724120000'
  where id = accountant_role_id;
end
$$;
