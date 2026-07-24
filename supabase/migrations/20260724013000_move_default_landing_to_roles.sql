alter table public.app_roles
  add column if not exists default_landing_path text;

alter table public.app_roles
  drop constraint if exists app_roles_default_landing_path_check,
  add constraint app_roles_default_landing_path_check
    check (
      default_landing_path is null
      or (
        default_landing_path like '/%'
        and default_landing_path not like '//%'
        and length(default_landing_path) <= 240
      )
    );

update public.app_roles
set
  default_landing_path = '/production/dashboard',
  updated_by = 'migration:20260724013000'
where code = 'production_department';

alter table public.app_users
  drop constraint if exists app_users_default_landing_path_check;

alter table public.app_users
  drop column if exists default_landing_path;

comment on column public.app_roles.default_landing_path is
  'Optional role landing route. Runtime accepts it only when the route is registered in navigation and the user has its required permission.';
