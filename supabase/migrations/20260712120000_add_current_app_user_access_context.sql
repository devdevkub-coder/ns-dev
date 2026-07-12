create or replace function public.current_app_user_access_context()
returns table (
  app_user_id bigint,
  must_change_password boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    au.id as app_user_id,
    au.must_change_password
  from public.app_users au
  where au.auth_user_id = auth.uid()
    and au.active = true
  limit 1;
$$;

revoke all on function public.current_app_user_access_context() from public;
revoke all on function public.current_app_user_access_context() from anon;
grant execute on function public.current_app_user_access_context() to authenticated;
