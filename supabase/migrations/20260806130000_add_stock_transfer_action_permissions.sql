-- Split stock transfer mutations from the stock ledger read permission.
insert into public.app_permissions (code, module, resource, action, description)
values
  ('stock.transfer.create', 'stock', 'transfer', 'create', 'สร้างและแก้ไขแบบร่างโอนสินค้าระหว่างสาขา'),
  ('stock.transfer.post', 'stock', 'transfer', 'post', 'ยืนยันโอนสินค้าเข้าสต๊อก'),
  ('stock.transfer.cancel', 'stock', 'transfer', 'cancel', 'ยกเลิกการโอนสินค้าและสร้างรายการตีกลับ')
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

-- Preserve the current operational access for roles that already had stock ledger access.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct legacy_assignment.role_id, action_permission.id, 'migration'
from public.app_role_permissions legacy_assignment
join public.app_permissions view_permission
  on view_permission.id = legacy_assignment.permission_id
 and view_permission.code = 'stock.ledger.view'
cross join public.app_permissions action_permission
where action_permission.code in (
  'stock.transfer.create',
  'stock.transfer.post',
  'stock.transfer.cancel'
)
on conflict (role_id, permission_id) do nothing;

-- Preserve explicit user-level allow/deny overrides while exposing the new actions separately.
insert into public.app_user_permission_overrides (
  user_id,
  permission_id,
  effect,
  created_by,
  updated_by
)
select
  view_override.user_id,
  action_permission.id,
  view_override.effect,
  'migration',
  'migration'
from public.app_user_permission_overrides view_override
join public.app_permissions view_permission
  on view_permission.id = view_override.permission_id
 and view_permission.code = 'stock.ledger.view'
cross join public.app_permissions action_permission
where action_permission.code in (
  'stock.transfer.create',
  'stock.transfer.post',
  'stock.transfer.cancel'
)
on conflict (user_id, permission_id) do nothing;
