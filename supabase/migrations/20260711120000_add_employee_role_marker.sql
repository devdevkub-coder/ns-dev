-- Employee directory supports exactly one work function selected from a
-- controlled list. Other app_roles remain reusable permission templates.
alter table public.app_roles
  add column if not exists is_employee_role boolean not null default false;

comment on column public.app_roles.is_employee_role is
  'True when this role is selectable as the single work function in the employee directory.';

insert into public.app_roles (
  code,
  name,
  description,
  is_system,
  is_employee_role,
  branch_scope,
  active,
  created_by,
  updated_by
) values
  ('supervisor', 'หัวหน้างาน', 'หน้าที่งานมาตรฐานสำหรับหัวหน้างาน', false, true, 'all', true, 'migration:add_employee_role_marker', 'migration:add_employee_role_marker'),
  ('executive', 'ผู้บริหาร', 'หน้าที่งานมาตรฐานสำหรับผู้บริหาร', false, true, 'all', true, 'migration:add_employee_role_marker', 'migration:add_employee_role_marker')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_employee_role = true,
  active = true,
  updated_at = now(),
  updated_by = excluded.updated_by;

update public.app_roles
set is_employee_role = code in ('staff', 'supervisor', 'executive', 'system_admin'),
    updated_at = now(),
    updated_by = 'migration:add_employee_role_marker';
