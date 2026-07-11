-- Permission resolution is data-driven: role templates provide a baseline and
-- per-user overrides can explicitly allow or deny a specific catalog permission.
create table if not exists public.app_user_permission_overrides (
  user_id bigint not null references public.app_users(id) on delete cascade,
  permission_id bigint not null references public.app_permissions(id) on delete cascade,
  effect text not null,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (user_id, permission_id),
  constraint app_user_permission_overrides_effect_chk check (effect in ('allow', 'deny'))
);

comment on table public.app_user_permission_overrides is
  'Per-user permission overrides. Allow adds a catalog permission; deny removes it even when a role template grants it.';

create index if not exists idx_app_user_permission_overrides_permission_id
  on public.app_user_permission_overrides(permission_id);

drop trigger if exists app_user_permission_overrides_set_updated_at on public.app_user_permission_overrides;
create trigger app_user_permission_overrides_set_updated_at
before update on public.app_user_permission_overrides
for each row execute function public.app_set_updated_at();

alter table public.app_user_permission_overrides enable row level security;

create or replace function public.current_app_permission_codes()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  with active_app_user as (
    select au.id
    from public.app_users au
    where au.auth_user_id = auth.uid()
      and au.active = true
    limit 1
  ), role_permissions as (
    select distinct ap.id, ap.code
    from active_app_user cu
    join public.app_user_roles aur on aur.user_id = cu.id
    join public.app_roles ar on ar.id = aur.role_id and ar.active = true
    join public.app_role_permissions arp on arp.role_id = ar.id
    join public.app_permissions ap on ap.id = arp.permission_id and ap.active = true
  ), direct_overrides as (
    select upo.permission_id, upo.effect
    from active_app_user cu
    join public.app_user_permission_overrides upo on upo.user_id = cu.id
    join public.app_permissions ap on ap.id = upo.permission_id and ap.active = true
  ), effective_permissions as (
    select rp.code
    from role_permissions rp
    where not exists (
      select 1
      from direct_overrides override_row
      where override_row.permission_id = rp.id
        and override_row.effect = 'deny'
    )
    union
    select ap.code
    from direct_overrides override_row
    join public.app_permissions ap on ap.id = override_row.permission_id and ap.active = true
    where override_row.effect = 'allow'
  )
  select coalesce(array_agg(code order by code), array[]::text[])
  from effective_permissions;
$$;

drop function if exists public.is_app_admin();

create or replace function public.has_app_permission(_permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _permission_code = any(public.current_app_permission_codes());
$$;

grant execute on function public.current_app_permission_codes() to authenticated;
grant execute on function public.has_app_permission(text) to authenticated;
