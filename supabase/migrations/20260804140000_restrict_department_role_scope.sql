-- Keep sorting and production department roles limited to their own work.
-- User permission overrides remain explicit and are intentionally not rewritten.

delete from public.app_role_permissions role_permission
using public.app_roles role, public.app_permissions permission
where role_permission.role_id = role.id
  and role_permission.permission_id = permission.id
  and role.code in ('sorting_department', 'production_department')
  and (
    permission.code = 'daily.weight_tickets.open_bill'
    or permission.code like 'purchase.bills.%'
    or permission.code like 'sales.bills.%'
    or (role.code in ('sorting_department', 'production_department') and permission.code = 'stock.ledger.view')
    or (role.code = 'sorting_department' and permission.code like 'production.%')
  );

do $$
declare
  missing_required text[];
  forbidden_remaining text[];
begin
  select coalesce(array_agg(required.role_code || ':' || required.permission_code order by required.role_code, required.permission_code), '{}')
    into missing_required
  from (values
    ('sorting_department', 'daily.weight_tickets.view'),
    ('sorting_department', 'daily.weight_tickets.create'),
    ('sorting_department', 'daily.weight_tickets.update'),
    ('sorting_department', 'daily.weight_tickets.confirm'),
    ('sorting_department', 'daily.weight_tickets.cancel'),
    ('sorting_department', 'daily.weight_tickets.share'),
    ('production_department', 'daily.weight_tickets.view'),
    ('production_department', 'daily.weight_tickets.create'),
    ('production_department', 'daily.weight_tickets.update'),
    ('production_department', 'daily.weight_tickets.confirm'),
    ('production_department', 'daily.weight_tickets.cancel'),
    ('production_department', 'daily.weight_tickets.share'),
    ('production_department', 'production.operations.view'),
    ('production_department', 'production.orders.view'),
    ('production_department', 'production.orders.create'),
    ('production_department', 'production.orders.input'),
    ('production_department', 'production.orders.input_return'),
    ('production_department', 'production.orders.output'),
    ('production_department', 'production.orders.reverse'),
    ('production_department', 'production.orders.complete'),
    ('production_department', 'production.orders.cancel'),
    ('production_department', 'production.orders.export'),
    ('production_department', 'production.reports.view')
  ) as required(role_code, permission_code)
  where not exists (
    select 1
    from public.app_role_permissions role_permission
    join public.app_roles role on role.id = role_permission.role_id and role.code = required.role_code
    join public.app_permissions permission on permission.id = role_permission.permission_id and permission.code = required.permission_code and permission.active
  );

  if cardinality(missing_required) > 0 then
    raise exception 'Department role permissions missing: %', missing_required;
  end if;

  select coalesce(array_agg(role.code || ':' || permission.code order by role.code, permission.code), '{}')
    into forbidden_remaining
  from public.app_role_permissions role_permission
  join public.app_roles role on role.id = role_permission.role_id
  join public.app_permissions permission on permission.id = role_permission.permission_id
  where role.code in ('sorting_department', 'production_department')
    and (
      permission.code = 'stock.ledger.view'
      or permission.code = 'daily.weight_tickets.open_bill'
      or permission.code like 'purchase.bills.%'
      or permission.code like 'sales.bills.%'
      or (role.code = 'sorting_department' and permission.code like 'production.%')
    );

  if cardinality(forbidden_remaining) > 0 then
    raise exception 'Department role forbidden permissions remain: %', forbidden_remaining;
  end if;
end $$;
