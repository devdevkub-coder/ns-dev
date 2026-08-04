-- Separate Dual Costing read access from its financial mutations.
insert into public.app_permissions (code, module, resource, action, description)
values
  ('finance.dual_costing.allocate', 'finance', 'dual_costing', 'allocate', 'จัดสรรต้นทุน Dual Costing'),
  ('finance.dual_costing.reverse', 'finance', 'dual_costing', 'reverse', 'ย้อนกลับการจัดสรรต้นทุน Dual Costing')
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

-- Only finance administrators and accountants receive mutation access by default.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select r.id, p.id, 'migration'
from public.app_roles r
cross join public.app_permissions p
where r.code in ('admin', 'owner', 'accountant')
  and p.code in ('finance.dual_costing.allocate', 'finance.dual_costing.reverse')
on conflict (role_id, permission_id) do nothing;
