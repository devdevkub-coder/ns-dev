begin;

-- The approved organization now has four departments. Codes stay stable so
-- existing references do not need to be rewritten outside the retired unit.
update public.departments
set name = case code
    when 'DEP-001' then 'บริหาร'
    when 'DEP-002' then 'บัญชีและการเงิน'
    when 'DEP-003' then 'ประสานงาน'
    when 'DEP-004' then 'ผลิต'
    else name
  end,
  updated_at = now()
where code in ('DEP-001', 'DEP-002', 'DEP-003', 'DEP-004');

create temporary table latest_employee_directory (
  email text primary key,
  first_name text,
  last_name text,
  department_code text not null,
  role_code text not null
) on commit drop;

insert into latest_employee_directory (email, first_name, last_name, department_code, role_code)
values
  ('apinunnuyyan@gmail.com', 'อภินันท์', 'นุ้ยเย็น', 'DEP-003', 'staff'),
  ('kayyaphakhxungchang@gmail.com', 'กัญญาภัค', 'อุ่งช้าง', 'DEP-003', 'staff'),
  ('rungnapajan1011@gmail.com', 'รุ่งนภา', 'จันทร์กระจ่าง', 'DEP-003', 'staff'),
  ('tik.jamnian27@gmail.com', 'จำเนียร', 'ไทรเล็กทิม', 'DEP-003', 'staff'),
  ('duangkamol.iwow@gmail.com', 'ดวงกมล', 'สออนรัมย์', 'DEP-004', 'staff'),
  ('jajassm2549@gmail.com', 'เกียรติศักดิ์', 'ปลั่งกลาง', 'DEP-004', 'staff'),
  ('nsscrappd@gmail.com', 'THI DAR SOE', null, 'DEP-004', 'staff'),
  ('superballtza@gmail.com', 'THANT ZIN AUNG', null, 'DEP-004', 'staff'),
  ('kwantlar@gmail.com', 'ขวัญตา', 'แตรสวัสดิ์', 'DEP-004', 'supervisor'),
  ('import.export@newsolutionsth.com', 'ปภังกร', 'น้อมสูงเนิน', 'DEP-004', 'supervisor'),
  ('aueampron15@gmail.com', 'เอื้อมพร', 'ทองนรินทร์', 'DEP-004', 'supervisor'),
  ('maysomboon@gmail.com', 'ศิริมาศ', 'ธนเลิศลาภ', 'DEP-001', 'system_admin'),
  ('guntapit@metalcom.co.th', 'กันตพิชญ์', 'ธนเลิศลาภ', 'DEP-001', 'system_admin'),
  ('daww1201@gmail.com', 'ดาว', null, 'DEP-002', 'staff'),
  ('panitanantong@gmail.com', 'พนิตนันท์', 'จิระธนานันต์', 'DEP-002', 'staff'),
  ('nejune656@gmail.com', 'จูน', null, 'DEP-002', 'staff'),
  ('jutamasns2022@gmail.com', 'จุฑามาศ', 'เนียมจันทร์', 'DEP-002', 'supervisor'),
  ('watcharathat@gmail.com', 'watcharathat', 's', 'DEP-001', 'system_admin'),
  ('photsathon.spd1@gmail.com', 'photsathon', 's', 'DEP-001', 'system_admin'),
  ('cpangtip@gmail.com', 'pangtip', 'c', 'DEP-001', 'system_admin'),
  ('peach@admin.com', 'Peach', null, 'DEP-001', 'system_admin');

-- Keep the employee dropdown backed by the persisted standard-role marker.
update public.app_roles
set is_employee_role = code in ('staff', 'supervisor', 'executive', 'system_admin'),
    updated_at = now(),
    updated_by = 'migration:sync_latest_employee_directory';

with resolved_directory as (
  select
    directory.*,
    departments.id as department_id,
    trim(concat_ws(' ', 'คุณ', directory.first_name, directory.last_name)) as display_name
  from latest_employee_directory directory
  join public.departments departments on departments.code = directory.department_code
), updated_users as (
  update public.app_users users
  set active = true,
      name_prefix = 'คุณ',
      first_name = directory.first_name,
      last_name = directory.last_name,
      display_name = directory.display_name,
      department_id = directory.department_id,
      updated_at = now(),
      updated_by = 'migration:sync_latest_employee_directory'
  from resolved_directory directory
  where lower(users.email) = lower(directory.email)
  returning users.id
)
insert into public.app_users (
  email,
  active,
  must_change_password,
  name_prefix,
  first_name,
  last_name,
  display_name,
  department_id,
  created_by,
  updated_by
)
select
  directory.email,
  true,
  true,
  'คุณ',
  directory.first_name,
  directory.last_name,
  directory.display_name,
  directory.department_id,
  'migration:sync_latest_employee_directory',
  'migration:sync_latest_employee_directory'
from resolved_directory directory
where not exists (
  select 1
  from public.app_users users
  where lower(users.email) = lower(directory.email)
);

-- All listed employees have access to every branch, represented by no
-- restrictive branch rows.
delete from public.app_user_branch_access branch_access
using public.app_users users, latest_employee_directory directory
where branch_access.user_id = users.id
  and lower(users.email) = lower(directory.email);

-- The submitted job function is authoritative: exactly one standard role and
-- no old direct override survives for a listed employee.
delete from public.app_user_permission_overrides overrides
using public.app_users users, latest_employee_directory directory
where overrides.user_id = users.id
  and lower(users.email) = lower(directory.email);

delete from public.app_user_roles user_roles
using public.app_users users, latest_employee_directory directory
where user_roles.user_id = users.id
  and lower(users.email) = lower(directory.email);

insert into public.app_user_roles (user_id, role_id, created_by)
select users.id, roles.id, 'migration:sync_latest_employee_directory'
from latest_employee_directory directory
join public.app_users users on lower(users.email) = lower(directory.email)
join public.app_roles roles on roles.code = directory.role_code
on conflict do nothing;

-- The retired sorting department is merged into production before deleting
-- the master row, including any non-directory account that still references it.
update public.app_users users
set department_id = production.id,
    updated_at = now(),
    updated_by = 'migration:merge_sorting_into_production'
from public.departments sorting, public.departments production
where sorting.code = 'DEP-005'
  and production.code = 'DEP-004'
  and users.department_id = sorting.id;

delete from public.departments
where code = 'DEP-005';

-- These directory rows were explicitly removed. Supabase Auth is separate and
-- is not modified by this employee-directory migration.
delete from public.app_users
where lower(email) in ('ns-kwan@nsscrap.com', 'ns-or@nsscrap.com');

commit;
