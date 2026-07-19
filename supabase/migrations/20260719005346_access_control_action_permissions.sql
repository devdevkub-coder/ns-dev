-- Access-control catalog for the next authorization batches.
-- This migration only introduces the canonical actions and preserves current
-- access until the corresponding route checks are migrated.
insert into public.app_permissions (code, module, resource, action, description)
values
  ('system.users.view', 'system', 'users', 'view', 'ดูรายชื่อและข้อมูลผู้ใช้'),
  ('system.users.create', 'system', 'users', 'create', 'สร้างผู้ใช้'),
  ('system.users.update', 'system', 'users', 'update', 'แก้ไขข้อมูลผู้ใช้'),
  ('system.users.activate', 'system', 'users', 'activate', 'เปิด/ปิดการใช้งานผู้ใช้'),
  ('system.users.credentials_manage', 'system', 'users', 'credentials_manage', 'จัดการ credential และการบังคับเปลี่ยนรหัสผ่าน'),
  ('system.roles.view', 'system', 'roles', 'view', 'ดู role และสิทธิ์'),
  ('system.roles.create', 'system', 'roles', 'create', 'สร้าง role'),
  ('system.roles.update', 'system', 'roles', 'update', 'แก้ไข role และสิทธิ์'),
  ('system.roles.activate', 'system', 'roles', 'activate', 'เปิด/ปิดการใช้งาน role'),
  ('system.permissions.view', 'system', 'permissions', 'view', 'ดู permission catalog'),
  ('system.permissions.update', 'system', 'permissions', 'update', 'แก้ไข permission assignment'),
  ('warehouse.receipts.open_bill', 'warehouse', 'receipts', 'open_bill', 'เปิดบิลจากใบรับของ'),
  ('warehouse.deliveries.open_bill', 'warehouse', 'deliveries', 'open_bill', 'เปิดบิลจากใบส่งของ'),
  ('daily.weight_tickets.open_bill', 'daily', 'weight_tickets', 'open_bill', 'เปิดบิลจากใบรับ/ส่งของ'),
  ('daily.petty_advances.view', 'daily', 'petty_advances', 'view', 'ดูรายการเงินสำรองจ่าย/กู้ยืม'),
  ('daily.petty_advances.create', 'daily', 'petty_advances', 'create', 'สร้างรายการเงินสำรองจ่าย/กู้ยืม'),
  ('daily.petty_advances.update', 'daily', 'petty_advances', 'update', 'แก้ไขรายการเงินสำรองจ่าย/กู้ยืม'),
  ('daily.petty_advances.cancel', 'daily', 'petty_advances', 'cancel', 'ยกเลิกรายการเงินสำรองจ่าย/กู้ยืม'),
  ('daily.petty_advances.return', 'daily', 'petty_advances', 'return', 'บันทึกการคืนเงินสำรองจ่าย/กู้ยืม'),
  ('daily.payment_approval.view', 'daily', 'payment_approval', 'view', 'ดูรายการรออนุมัติจ่าย'),
  ('daily.payment_approval.approve', 'daily', 'payment_approval', 'approve', 'อนุมัติรายการจ่าย'),
  ('daily.payment_approval.pay', 'daily', 'payment_approval', 'pay', 'บันทึกการจ่ายเงินจริง'),
  ('purchase.bills.view', 'purchase', 'bills', 'view', 'ดูบิลซื้อ'),
  ('purchase.bills.create', 'purchase', 'bills', 'create', 'สร้างบิลซื้อ'),
  ('purchase.bills.update', 'purchase', 'bills', 'update', 'แก้ไขบิลซื้อ'),
  ('purchase.bills.cancel', 'purchase', 'bills', 'cancel', 'ยกเลิกบิลซื้อ'),
  ('purchase.bills.approve', 'purchase', 'bills', 'approve', 'อนุมัติบิลซื้อ'),
  ('purchase.bills.pay', 'purchase', 'bills', 'pay', 'จ่ายเงินตามบิลซื้อ'),
  ('sales.bills.view', 'sales', 'bills', 'view', 'ดูบิลขาย'),
  ('sales.bills.create', 'sales', 'bills', 'create', 'สร้างบิลขาย'),
  ('sales.bills.update', 'sales', 'bills', 'update', 'แก้ไขบิลขาย'),
  ('sales.bills.cancel', 'sales', 'bills', 'cancel', 'ยกเลิกบิลขาย'),
  ('sales.bills.approve', 'sales', 'bills', 'approve', 'อนุมัติบิลขาย'),
  ('sales.bills.receive', 'sales', 'bills', 'receive', 'รับเงินตามบิลขาย')
on conflict (code) do update set
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  active = true,
  updated_at = now();

-- Admin and owner retain the current data-driven "all catalog" behavior when
-- new actions are added before their route checks are migrated.
insert into public.app_role_permissions (role_id, permission_id, created_by)
select roles.id, permissions.id, 'migration'
from public.app_roles roles
cross join public.app_permissions permissions
where roles.code in ('admin', 'owner')
  and roles.active = true
  and permissions.active = true
on conflict do nothing;
