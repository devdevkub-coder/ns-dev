-- Allow the coordinator to use the Excel actions shown on the operational
-- master-data pages. Keep this scoped to export only; do not grant shared
-- reference management or any finance permission.
with desired_permissions(code, module, resource, action, description) as (
  values
    ('master.customers.export', 'master', 'customers', 'export', 'ส่งออกลูกค้า'),
    ('master.products.export', 'master', 'products', 'export', 'ส่งออกสินค้า'),
    ('master.suppliers.export', 'master', 'suppliers', 'export', 'ส่งออกผู้ขาย')
)
insert into public.app_permissions (code, module, resource, action, description)
select code, module, resource, action, description
from desired_permissions
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

insert into public.app_role_permissions (role_id, permission_id, created_by)
select role.id, permission.id, 'migration'
from public.app_roles role
join public.app_permissions permission
  on permission.code in (
    'master.customers.export',
    'master.products.export',
    'master.suppliers.export'
  )
where role.code = 'coordinator'
  and permission.active = true
on conflict do nothing;

do $$
declare
  missing text[];
begin
  select coalesce(array_agg(required.code order by required.code), '{}')
    into missing
  from (values
    ('master.customers.export'),
    ('master.products.export'),
    ('master.suppliers.export')
  ) as required(code)
  where not exists (
    select 1
    from public.app_role_permissions role_permission
    join public.app_roles role on role.id = role_permission.role_id
    join public.app_permissions permission on permission.id = role_permission.permission_id
    where role.code = 'coordinator'
      and permission.code = required.code
      and permission.active = true
  );

  if cardinality(missing) > 0 then
    raise exception 'Coordinator export permissions missing: %', missing;
  end if;
end $$;
