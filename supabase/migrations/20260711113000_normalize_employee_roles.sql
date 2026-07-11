-- Reset the approved employee directory to standard role assignments.
insert into public.app_roles (
  code,
  name,
  description,
  is_system,
  branch_scope,
  can_see_cost,
  can_see_profit,
  can_see_cash,
  can_see_financials,
  can_edit_opening_balance,
  active,
  created_by,
  updated_by
) values
  ('staff', 'เจ้าหน้าที่', 'หน้าที่งานมาตรฐานสำหรับพนักงาน', false, 'all', false, false, false, false, false, true, 'migration:normalize_employee_roles', 'migration:normalize_employee_roles'),
  ('system_admin', 'ผู้ดูแลระบบ', 'จัดการผู้ใช้ สิทธิ์ ข้อมูลหลัก และตั้งค่าระบบ', true, 'all', true, true, true, true, true, true, 'migration:normalize_employee_roles', 'migration:normalize_employee_roles')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  active = true,
  updated_at = now(),
  updated_by = excluded.updated_by;

-- เจ้าหน้าที่เริ่มต้นจากไม่มีสิทธิ์จนกว่าจะกำหนดผ่านฝ่าย + Role
delete from public.app_role_permissions role_permissions
using public.app_roles staff_role
where role_permissions.role_id = staff_role.id
  and staff_role.code = 'staff';

-- ผู้ดูแลระบบได้รับทุก permission ที่ active ผ่าน role grant ที่บันทึกจริง
insert into public.app_role_permissions (role_id, permission_id, created_by)
select system_admin.id, permission.id, 'migration:normalize_employee_roles'
from public.app_roles system_admin
join public.app_permissions permission on permission.active = true
where system_admin.code = 'system_admin'
on conflict do nothing;

with target_users(email, target_role_code) as (
  values
    ('apinunnuyyan@gmail.com', 'staff'),
    ('ns-kwan@nsscrap.com', 'staff'),
    ('kayyaphakhxungchang@gmail.com', 'staff'),
    ('rungnapajan1011@gmail.com', 'staff'),
    ('tik.jamnian27@gmail.com', 'staff'),
    ('duangkamol.iwow@gmail.com', 'staff'),
    ('jajassm2549@gmail.com', 'staff'),
    ('nsscrappd@gmail.com', 'staff'),
    ('superballtza@gmail.com', 'staff'),
    ('kwantlar@gmail.com', 'staff'),
    ('import.export@newsolutionsth.com', 'staff'),
    ('aueampron15@gmail.com', 'staff'),
    ('daww1201@gmail.com', 'staff'),
    ('panitanantong@gmail.com', 'staff'),
    ('nejune656@gmail.com', 'staff'),
    ('jutamasns2022@gmail.com', 'staff'),
    ('maysomboon@gmail.com', 'system_admin'),
    ('watcharathat@gmail.com', 'system_admin'),
    ('photsathon.spd1@gmail.com', 'system_admin'),
    ('cpangtip@gmail.com', 'system_admin')
), resolved_targets as (
  select users.id as user_id, target_users.target_role_code
  from target_users
  join public.app_users users on lower(users.email) = lower(target_users.email)
)
delete from public.app_user_permission_overrides overrides
using resolved_targets targets
where overrides.user_id = targets.user_id;

with target_users(email, target_role_code) as (
  values
    ('apinunnuyyan@gmail.com', 'staff'),
    ('ns-kwan@nsscrap.com', 'staff'),
    ('kayyaphakhxungchang@gmail.com', 'staff'),
    ('rungnapajan1011@gmail.com', 'staff'),
    ('tik.jamnian27@gmail.com', 'staff'),
    ('duangkamol.iwow@gmail.com', 'staff'),
    ('jajassm2549@gmail.com', 'staff'),
    ('nsscrappd@gmail.com', 'staff'),
    ('superballtza@gmail.com', 'staff'),
    ('kwantlar@gmail.com', 'staff'),
    ('import.export@newsolutionsth.com', 'staff'),
    ('aueampron15@gmail.com', 'staff'),
    ('daww1201@gmail.com', 'staff'),
    ('panitanantong@gmail.com', 'staff'),
    ('nejune656@gmail.com', 'staff'),
    ('jutamasns2022@gmail.com', 'staff'),
    ('maysomboon@gmail.com', 'system_admin'),
    ('watcharathat@gmail.com', 'system_admin'),
    ('photsathon.spd1@gmail.com', 'system_admin'),
    ('cpangtip@gmail.com', 'system_admin')
), resolved_targets as (
  select users.id as user_id, target_users.target_role_code
  from target_users
  join public.app_users users on lower(users.email) = lower(target_users.email)
), removed_roles as (
  delete from public.app_user_roles user_roles
  using resolved_targets targets
  where user_roles.user_id = targets.user_id
  returning user_roles.user_id
)
insert into public.app_user_roles (user_id, role_id, created_by)
select targets.user_id, roles.id, 'migration:normalize_employee_roles'
from resolved_targets targets
join public.app_roles roles on roles.code = targets.target_role_code
on conflict do nothing;
