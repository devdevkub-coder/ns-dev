-- Split the shared master.reference permission into one catalog per master-data
-- resource. This changes role configuration granularity only; existing API
-- enforcement remains backward-compatible until each route adopts its resource
-- permission contract.
with resources(resource, label) as (
  values
    ('account_subtypes', 'ประเภทบัญชีธนาคาร'),
    ('accounts', 'บัญชีเงินบริษัท'),
    ('asset_categories', 'หมวดสินทรัพย์'),
    ('bank_names', 'ชื่อธนาคาร'),
    ('beneficiaries', 'ผู้รับเงินต่างประเทศ'),
    ('branches', 'สาขา'),
    ('channels', 'ช่องทางขาย'),
    ('currencies', 'สกุลเงิน'),
    ('customers', 'ลูกค้า'),
    ('departments', 'ฝ่าย'),
    ('directors', 'บุคคล'),
    ('expense_categories', 'หมวดค่าใช้จ่าย'),
    ('expense_types', 'ประเภทค่าใช้จ่าย'),
    ('impurities', 'สิ่งเจือปน'),
    ('machine_types', 'ประเภทเครื่องจักร'),
    ('machines', 'เครื่องจักร'),
    ('payment_methods', 'วิธีจ่าย/รับเงิน'),
    ('product_types', 'ประเภทสินค้า'),
    ('product_units', 'หน่วยสินค้า'),
    ('production_lines', 'Production Line'),
    ('products', 'สินค้า'),
    ('remittance_purposes', 'วัตถุประสงค์การโอนเงิน'),
    ('salespersons', 'พนักงานขาย'),
    ('suppliers', 'ผู้ขาย'),
    ('warehouses', 'คลัง')
)
insert into public.app_permissions (code, module, resource, action, description)
select
  'master.' || resources.resource || '.' || actions.action,
  'master',
  resources.resource,
  actions.action,
  actions.label || resources.label
from resources
cross join (values
  ('view', 'ดู'),
  ('create', 'สร้าง'),
  ('update', 'แก้ไข'),
  ('delete', 'ลบ'),
  ('status', 'เปิด/ปิด'),
  ('export', 'ส่งออก')
) as actions(action, label)
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

-- Preserve the existing shared reference grants while making each resource
-- independently configurable. Do not grant delete by default.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select distinct
  role_permissions.role_id,
  target_permission.id,
  'migration'
from public.app_role_permissions role_permissions
join public.app_permissions source_permission
  on source_permission.id = role_permissions.permission_id
 and source_permission.code in ('master.reference.view', 'master.reference.manage')
join public.app_permissions target_permission
  on target_permission.module = 'master'
 and target_permission.resource <> 'reference'
 and target_permission.action in (
   'view',
   case when source_permission.action = 'manage' then 'create' else null end,
   case when source_permission.action = 'manage' then 'update' else null end,
   case when source_permission.action = 'manage' then 'status' else null end,
   case when source_permission.action = 'manage' then 'export' else null end
 )
where target_permission.active = true
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_id, created_by)
select roles.id, permissions.id, 'migration'
from public.app_roles roles
cross join public.app_permissions permissions
where roles.code in ('admin', 'owner')
  and permissions.module = 'master'
  and permissions.resource <> 'reference'
  and permissions.active = true
on conflict do nothing;
