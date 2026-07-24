alter table public.app_users
  add column if not exists default_landing_path text;

alter table public.app_users
  drop constraint if exists app_users_default_landing_path_check,
  add constraint app_users_default_landing_path_check
    check (
      default_landing_path is null
      or (
        default_landing_path like '/%'
        and default_landing_path not like '//%'
        and length(default_landing_path) <= 240
      )
    );

comment on column public.app_users.default_landing_path is
  'Optional per-user landing route. Runtime accepts it only when the route is registered in navigation and the user has its required permission.';
