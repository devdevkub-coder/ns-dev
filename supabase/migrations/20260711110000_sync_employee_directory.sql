-- Sync the approved employee directory only. Role and permission assignments
-- intentionally remain unchanged until the department-role permission batch.
with employee_directory(email, first_name, last_name, department_code) as (
  values
    ('apinunnuyyan@gmail.com', 'อภินันท์', 'นุ้ยเย็น', 'DEP-003'),
    ('ns-kwan@nsscrap.com', 'Kwan', null, 'DEP-003'),
    ('kayyaphakhxungchang@gmail.com', 'กัญญาภัค', 'อุ่งช้าง', 'DEP-003'),
    ('rungnapajan1011@gmail.com', 'รุ่งนภา', 'จันทร์กระจ่าง', 'DEP-003'),
    ('tik.jamnian27@gmail.com', 'จำเนียร', 'ไทรเล็กทิม', 'DEP-003'),
    ('duangkamol.iwow@gmail.com', 'ดวงกมล', 'สออนรัมย์', 'DEP-005'),
    ('jajassm2549@gmail.com', 'เกียรติศักดิ์', 'ปลั่งกลาง', 'DEP-005'),
    ('nsscrappd@gmail.com', 'THI DAR SOE', null, 'DEP-005'),
    ('superballtza@gmail.com', 'THANT ZIN AUNG', null, 'DEP-005'),
    ('kwantlar@gmail.com', 'ขวัญตา', 'แตรสวัสดิ์', 'DEP-004'),
    ('import.export@newsolutionsth.com', 'ปภังกร', 'น้อมสูงเนิน', 'DEP-004'),
    ('aueampron15@gmail.com', 'เอื้อมพร', 'ทองนรินทร์', 'DEP-004'),
    ('maysomboon@gmail.com', 'ศิริมาศ', 'ธนเลิศลาภ', 'DEP-001'),
    ('daww1201@gmail.com', 'ดาว', null, 'DEP-002'),
    ('panitanantong@gmail.com', 'พนิตนันท์', 'จิระ', 'DEP-002'),
    ('nejune656@gmail.com', 'จูน', null, 'DEP-002'),
    ('jutamasns2022@gmail.com', 'จุฑามาศ', 'เนียมจันทร์', 'DEP-002'),
    ('watcharathat@gmail.com', 'watcharathat', 's', 'DEP-001'),
    ('photsathon.spd1@gmail.com', 'photsathon', 's', 'DEP-001'),
    ('cpangtip@gmail.com', 'pangtip', 'c', 'DEP-001')
), resolved_directory as (
  select
    directory.*,
    departments.id as department_id,
    trim(concat_ws(' ', directory.first_name, directory.last_name)) as display_name
  from employee_directory directory
  join public.departments on departments.code = directory.department_code
), updated_users as (
  update public.app_users users
  set
    name_prefix = null,
    first_name = directory.first_name,
    last_name = directory.last_name,
    display_name = directory.display_name,
    department_id = directory.department_id,
    updated_at = now(),
    updated_by = 'migration:sync_employee_directory'
  from resolved_directory directory
  where lower(users.email) = lower(directory.email)
  returning users.id
), inserted_users as (
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
    null,
    directory.first_name,
    directory.last_name,
    directory.display_name,
    directory.department_id,
    'migration:sync_employee_directory',
    'migration:sync_employee_directory'
  from resolved_directory directory
  where not exists (
    select 1
    from public.app_users users
    where lower(users.email) = lower(directory.email)
  )
  returning id
), directory_users as (
  select users.id
  from public.app_users users
  join resolved_directory directory on lower(directory.email) = lower(users.email)
)
delete from public.app_user_branch_access branch_access
using directory_users
where branch_access.user_id = directory_users.id;
