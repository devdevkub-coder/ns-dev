-- Seed canonical legacy users into the normalized app user model.
-- Passwords from legacy public.users are intentionally not migrated.
-- These rows are inactive-auth placeholders until each person is invited or linked to Supabase Auth.

with legacy_users (legacy_user_id, legacy_profile_id, username, display_name, email, role_code, active) as (
  values
    ('USR-AOM', 'f5414290-c502-47e3-93f3-faabf693a4cf'::uuid, 'ns-aom', 'Aom', 'ns-aom@nsscrap.com', 'coordinator', true),
    ('USR-DAO', 'dba40ac8-67ae-49a9-92f1-d23977e68370'::uuid, 'ns-dao', 'Dao', 'ns-dao@nsscrap.com', 'accountant', true),
    ('USR-JUNE', '8d593c91-e684-43c3-aed6-2eba726931de'::uuid, 'ns-june', 'June', 'ns-june@nsscrap.com', 'account_expense', true),
    ('USR-KWAN', '637d1081-bdf0-4837-ae3e-130953ac2071'::uuid, 'ns-kwan', 'Kwan', 'ns-kwan@nsscrap.com', 'coordinator', true),
    ('USR-MINT', '641091cb-7cfc-4ff2-9b7c-f1ba1859ed78'::uuid, 'ns-mint', 'Mint', 'ns-mint@nsscrap.com', 'coordinator', true),
    ('USR-OR', 'add29219-0026-465f-aea3-972e7d70a079'::uuid, 'ns-or', 'Or', 'ns-or@nsscrap.com', 'warehouse', true),
    ('USR-PLOY', '1b265a7b-7b6c-4b5d-9969-a7d9e50ab1ca'::uuid, 'ns-ploy', 'Ploy', 'ns-ploy@nsscrap.com', 'coordinator', true),
    ('USR-POOPAE', 'f7700e44-abeb-4545-bc94-86df931e9a43'::uuid, 'ns-poopae', 'Poopae', 'ns-poopae@nsscrap.com', 'poopae', true),
    ('USR-TIK', '9ea64aa2-6c3c-458f-a6a8-27a13e302666'::uuid, 'ns-tik', 'Tik', 'ns-tik@nsscrap.com', 'coordinator', true),
    ('USR-TONG', '717d766d-d03e-4502-a9e3-026bf27ed0f8'::uuid, 'ns-tong', 'Tong', 'ns-tong@nsscrap.com', 'accountant', true)
),
upserted_users as (
  insert into public.app_users (
    username,
    display_name,
    email,
    active,
    must_change_password,
    legacy_user_id,
    legacy_profile_id,
    created_by,
    updated_by
  )
  select
    username,
    display_name,
    email,
    active,
    true,
    legacy_user_id,
    legacy_profile_id,
    'migration:legacy-users',
    'migration:legacy-users'
  from legacy_users
  on conflict ((lower(username))) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    active = excluded.active,
    legacy_user_id = excluded.legacy_user_id,
    legacy_profile_id = excluded.legacy_profile_id,
    updated_by = 'migration:legacy-users',
    updated_at = now()
  returning id, username
)
insert into public.app_user_roles (user_id, role_id, created_by)
select
  au.id,
  ar.id,
  'migration:legacy-users'
from legacy_users lu
join upserted_users au on lower(au.username) = lower(lu.username)
join public.app_roles ar on ar.code = lu.role_code
on conflict (user_id, role_id) do nothing;
