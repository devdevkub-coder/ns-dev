-- ผู้ดูแลระบบเป็น Role ไม่ใช่ฝ่าย: ย้ายผู้ใช้งานของ DEP-006 ไปฝ่ายผู้บริหาร
-- ก่อนลบ master row เพื่อให้เหลือฝ่าย DEP-001 ถึง DEP-005 เท่านั้น
do $$
declare
  executive_department_id bigint;
  admin_department_id bigint;
begin
  select id
  into executive_department_id
  from public.departments
  where code = 'DEP-001';

  if executive_department_id is null then
    raise exception 'Missing required department DEP-001';
  end if;

  select id
  into admin_department_id
  from public.departments
  where code = 'DEP-006';

  if admin_department_id is null then
    return;
  end if;

  update public.app_users
  set department_id = executive_department_id,
      updated_at = now(),
      updated_by = 'migration:retire_admin_department'
  where department_id = admin_department_id;

  delete from public.departments
  where id = admin_department_id;
end
$$;
