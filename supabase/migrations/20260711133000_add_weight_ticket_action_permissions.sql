insert into public.app_permissions (code, module, resource, action, description) values
  ('daily.weight_tickets.create', 'daily', 'weight_tickets', 'create', 'สร้างใบรับของและใบส่งของ'),
  ('daily.weight_tickets.update', 'daily', 'weight_tickets', 'update', 'แก้ไขใบรับของและใบส่งของ'),
  ('daily.weight_tickets.confirm', 'daily', 'weight_tickets', 'confirm', 'ยืนยันรับของและยืนยันส่งของ'),
  ('daily.weight_tickets.cancel', 'daily', 'weight_tickets', 'cancel', 'ยกเลิกใบรับของและใบส่งของ'),
  ('daily.weight_tickets.share', 'daily', 'weight_tickets', 'share', 'ส่งหรือแชร์ใบรับของและใบส่งของผ่าน LINE')
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct existing_role_permission.role_id, action_permission.id, 'migration'
from public.app_role_permissions existing_role_permission
join public.app_permissions view_permission
  on view_permission.id = existing_role_permission.permission_id
 and view_permission.code = 'daily.weight_tickets.view'
cross join public.app_permissions action_permission
where action_permission.code in (
  'daily.weight_tickets.create',
  'daily.weight_tickets.update',
  'daily.weight_tickets.confirm',
  'daily.weight_tickets.cancel',
  'daily.weight_tickets.share'
)
on conflict do nothing;

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
 and view_permission.code = 'daily.weight_tickets.view'
cross join public.app_permissions action_permission
where action_permission.code in (
  'daily.weight_tickets.create',
  'daily.weight_tickets.update',
  'daily.weight_tickets.confirm',
  'daily.weight_tickets.cancel',
  'daily.weight_tickets.share'
)
on conflict (user_id, permission_id) do nothing;
