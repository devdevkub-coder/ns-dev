-- Email is the only login identifier. Historical audit/activity snapshots keep
-- their existing actor_username columns so prior evidence is not rewritten.
drop function if exists public.lookup_app_login_email(text);

drop index if exists public.app_users_username_lower_key;

alter table public.app_users
  drop column if exists username;
