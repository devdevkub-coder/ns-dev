-- Split PO Buy and PO Sell visibility/actions from the legacy
-- finance.cash.view permission. Existing role grants and direct overrides are
-- copied so current access remains unchanged until an administrator narrows it.
insert into public.app_permissions (code, module, resource, action, description)
values
  ('purchase.po_buy.view', 'purchase', 'po_buy', 'view', 'ดู PO Buy (จองซื้อ)'),
  ('purchase.po_buy.create', 'purchase', 'po_buy', 'create', 'สร้าง PO Buy (จองซื้อ)'),
  ('purchase.po_buy.update', 'purchase', 'po_buy', 'update', 'แก้ไข PO Buy (จองซื้อ)'),
  ('purchase.po_buy.cancel', 'purchase', 'po_buy', 'cancel', 'ยกเลิก PO Buy (จองซื้อ)'),
  ('purchase.po_buy.short_close', 'purchase', 'po_buy', 'short_close', 'ปิดรับ PO Buy ไม่ครบ'),
  ('sales.po_sell.view', 'sales', 'po_sell', 'view', 'ดู PO Sell (จองขาย)'),
  ('sales.po_sell.create', 'sales', 'po_sell', 'create', 'สร้าง PO Sell (จองขาย)'),
  ('sales.po_sell.update', 'sales', 'po_sell', 'update', 'แก้ไข PO Sell (จองขาย)'),
  ('sales.po_sell.cancel', 'sales', 'po_sell', 'cancel', 'ยกเลิก PO Sell (จองขาย)'),
  ('sales.po_sell.short_close', 'sales', 'po_sell', 'short_close', 'ปิดส่ง PO Sell ไม่ครบ')
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
    'purchase.po_buy.view',
    'purchase.po_buy.create',
    'purchase.po_buy.update',
    'purchase.po_buy.cancel',
    'purchase.po_buy.short_close',
    'sales.po_sell.view',
    'sales.po_sell.create',
    'sales.po_sell.update',
    'sales.po_sell.cancel',
    'sales.po_sell.short_close'
  )
where legacy_permission.code = 'finance.cash.view'
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
    'purchase.po_buy.view',
    'purchase.po_buy.create',
    'purchase.po_buy.update',
    'purchase.po_buy.cancel',
    'purchase.po_buy.short_close',
    'sales.po_sell.view',
    'sales.po_sell.create',
    'sales.po_sell.update',
    'sales.po_sell.cancel',
    'sales.po_sell.short_close'
  )
where legacy_permission.code = 'finance.cash.view'
on conflict (user_id, permission_id) do nothing;
