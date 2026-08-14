-- BUG #27: ทำให้ role สูงสุด (system_admin/admin/owner) เป็น wildcard ใน proxy gate
-- และแก้ is_app_admin() ให้ครอบคลุม system_admin ให้ตรงกับฝั่ง app (auth-context.ts)
-- กันปัญหาสิทธิ์ drift เมื่อ catalog มีสิทธิ์ใหม่เพิ่มทีหลัง (Super Admin 238 < Admin 261 < Owner 265)

create or replace function public.current_app_permission_codes()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from unnest(public.current_app_role_codes()) as role_code
      where role_code in ('system_admin', 'admin', 'owner')
    ) then
      (
        select coalesce(array_agg(distinct ap.code order by ap.code), array[]::text[])
        from public.app_permissions ap
        where ap.active = true
      )
    else
      (
        select coalesce(array_agg(distinct ap.code order by ap.code), array[]::text[])
        from public.app_users au
        join public.app_user_roles aur on aur.user_id = au.id
        join public.app_roles ar on ar.id = aur.role_id
        join public.app_role_permissions arp on arp.role_id = ar.id
        join public.app_permissions ap on ap.id = arp.permission_id
        where au.auth_user_id = auth.uid()
          and au.active = true
          and ar.active = true
          and ap.active = true
      )
  end;
$$;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from unnest(public.current_app_role_codes()) as role_code
    where role_code in ('admin', 'owner', 'system_admin')
  );
$$;

-- เติมสิทธิ์ย้อนหลังให้ Super Admin เพื่อให้จำนวนสิทธิ์ที่แสดงในหน้า roles/permissions
-- ตรงกับ catalog ทั้งหมด (การอนุญาตจริงใช้ wildcard ด้านบนอยู่แล้ว)
insert into public.app_role_permissions (role_id, permission_id, created_by)
select roles.id, permissions.id, 'migration:super_admin_wildcard_2026-08-13'
from public.app_roles roles
cross join public.app_permissions permissions
where roles.code = 'system_admin'
  and roles.active = true
  and permissions.active = true
on conflict (role_id, permission_id) do nothing;
