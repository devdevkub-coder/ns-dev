alter table public.app_users
  add column if not exists account_status text,
  add column if not exists activation_source text,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by text,
  add column if not exists invitation_sent_at timestamptz,
  add column if not exists password_link_sent_at timestamptz,
  add column if not exists password_set_at timestamptz,
  add column if not exists temporary_password_issued_at timestamptz;

update public.app_users
set
  account_status = case when active then 'active' else 'disabled' end,
  activation_source = case when active then 'existing' else null end,
  activated_at = case when active then coalesce(last_login_at, updated_at, created_at) else null end,
  activated_by = case when active then coalesce(updated_by, created_by, 'migration') else null end
where account_status is null;

update public.app_users as app_user
set password_set_at = coalesce(app_user.last_login_at, auth_user.updated_at)
from auth.users as auth_user
where app_user.auth_user_id = auth_user.id
  and app_user.password_set_at is null
  and coalesce(auth_user.encrypted_password, '') <> '';

alter table public.app_users
  alter column active set default false,
  alter column account_status set default 'pending',
  alter column account_status set not null;

alter table public.app_users
  drop constraint if exists app_users_account_status_check,
  add constraint app_users_account_status_check
    check (account_status in ('pending', 'active', 'disabled'));

alter table public.app_users
  drop constraint if exists app_users_activation_source_check,
  add constraint app_users_activation_source_check
    check (activation_source is null or activation_source in ('admin', 'invitation', 'existing'));

alter table public.app_users
  drop constraint if exists app_users_account_status_active_check,
  add constraint app_users_account_status_active_check
    check ((account_status = 'active') = active);

create index if not exists idx_app_users_account_status
  on public.app_users(account_status);

comment on column public.app_users.account_status is
  'Application account lifecycle: pending invitation, active, or disabled.';
comment on column public.app_users.activation_source is
  'How the account was first activated: invitation, admin, or existing-data backfill.';
