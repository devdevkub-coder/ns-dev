-- Redesign audit/activity logging into two append-only app-owned streams.
-- Existing app_auth_events/audit_logs/deletion_log tables are kept for compatibility/history.

create table if not exists public.app_audit_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  event_key text not null,
  action text not null,
  outcome text not null default 'success',
  severity text not null default 'info',
  actor_app_user_id uuid references public.app_users(id) on delete set null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_username text,
  actor_display_name text,
  target_type text,
  target_id text,
  target_label text,
  entity_schema text,
  entity_table text,
  entity_id text,
  entity_label text,
  http_method text,
  request_path text,
  request_id text,
  ip_address inet,
  user_agent text,
  before_data jsonb,
  after_data jsonb,
  diff jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint app_audit_logs_event_key_chk check (event_key ~ '^[a-z0-9_.:-]+$'),
  constraint app_audit_logs_action_chk check (action in (
    'create',
    'update',
    'delete',
    'status',
    'invite',
    'reset',
    'login',
    'logout',
    'permission',
    'role',
    'import',
    'export',
    'approve',
    'post',
    'reverse',
    'system'
  )),
  constraint app_audit_logs_outcome_chk check (outcome in ('success', 'failure', 'blocked')),
  constraint app_audit_logs_severity_chk check (severity in ('debug', 'info', 'warning', 'error', 'critical'))
);

comment on table public.app_audit_logs is 'Append-only audit stream for security, permission, data-change, approval, import/export, and other trace-critical events.';
comment on column public.app_audit_logs.metadata is 'Non-secret contextual metadata. Do not store passwords, tokens, service keys, or raw sensitive exports.';

create table if not exists public.app_activity_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  activity_key text not null,
  activity_type text not null,
  title text,
  description text,
  actor_app_user_id uuid references public.app_users(id) on delete set null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_username text,
  actor_display_name text,
  route_path text,
  referrer text,
  http_method text,
  request_path text,
  request_id text,
  target_type text,
  target_id text,
  target_label text,
  status text not null default 'success',
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint app_activity_logs_activity_key_chk check (activity_key ~ '^[a-z0-9_.:-]+$'),
  constraint app_activity_logs_activity_type_chk check (activity_type in (
    'session',
    'page_view',
    'navigation',
    'action',
    'search',
    'filter',
    'export',
    'system'
  )),
  constraint app_activity_logs_status_chk check (status in ('success', 'failure', 'blocked'))
);

comment on table public.app_activity_logs is 'Append-only activity stream for user/session/page/action telemetry that is useful for support and usage review but is not the primary audit record.';
comment on column public.app_activity_logs.metadata is 'Non-secret contextual metadata. Do not store passwords, tokens, service keys, or raw sensitive exports.';

create index if not exists idx_app_audit_logs_occurred_at on public.app_audit_logs(occurred_at desc);
create index if not exists idx_app_audit_logs_actor_app_user_id on public.app_audit_logs(actor_app_user_id);
create index if not exists idx_app_audit_logs_actor_auth_user_id on public.app_audit_logs(actor_auth_user_id);
create index if not exists idx_app_audit_logs_event_key on public.app_audit_logs(event_key);
create index if not exists idx_app_audit_logs_action on public.app_audit_logs(action);
create index if not exists idx_app_audit_logs_target on public.app_audit_logs(target_type, target_id);
create index if not exists idx_app_audit_logs_entity on public.app_audit_logs(entity_table, entity_id);
create index if not exists idx_app_audit_logs_metadata_gin on public.app_audit_logs using gin (metadata);

create index if not exists idx_app_activity_logs_occurred_at on public.app_activity_logs(occurred_at desc);
create index if not exists idx_app_activity_logs_actor_app_user_id on public.app_activity_logs(actor_app_user_id);
create index if not exists idx_app_activity_logs_actor_auth_user_id on public.app_activity_logs(actor_auth_user_id);
create index if not exists idx_app_activity_logs_activity_key on public.app_activity_logs(activity_key);
create index if not exists idx_app_activity_logs_activity_type on public.app_activity_logs(activity_type);
create index if not exists idx_app_activity_logs_route_path on public.app_activity_logs(route_path);
create index if not exists idx_app_activity_logs_target on public.app_activity_logs(target_type, target_id);
create index if not exists idx_app_activity_logs_metadata_gin on public.app_activity_logs using gin (metadata);

create or replace function public.app_prevent_log_update_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'app log tables are append-only and do not allow %', tg_op;
end;
$$;

drop trigger if exists app_audit_logs_append_only on public.app_audit_logs;
create trigger app_audit_logs_append_only
before update or delete on public.app_audit_logs
for each row execute function public.app_prevent_log_update_delete();

drop trigger if exists app_activity_logs_append_only on public.app_activity_logs;
create trigger app_activity_logs_append_only
before update or delete on public.app_activity_logs
for each row execute function public.app_prevent_log_update_delete();

alter table public.app_audit_logs enable row level security;
alter table public.app_activity_logs enable row level security;

drop policy if exists app_audit_logs_select_audit on public.app_audit_logs;
create policy app_audit_logs_select_audit
on public.app_audit_logs
for select
to authenticated
using (public.has_app_permission('system.audit.view'));

drop policy if exists app_activity_logs_select_activity on public.app_activity_logs;
create policy app_activity_logs_select_activity
on public.app_activity_logs
for select
to authenticated
using (
  public.has_app_permission('system.activity.view')
  or public.has_app_permission('system.audit.view')
);

revoke all on table public.app_audit_logs from anon;
revoke all on table public.app_activity_logs from anon;
grant select on table public.app_audit_logs to authenticated;
grant select on table public.app_activity_logs to authenticated;

insert into public.app_permissions (code, module, resource, action, description)
values
  ('system.activity.view', 'system', 'activity', 'view', 'ดู activity log')
on conflict (code) do update
set
  description = excluded.description,
  active = true,
  updated_at = now();

insert into public.app_role_permissions (role_id, permission_id, created_by)
select existing_audit_roles.role_id, activity_permission.id, 'migration:20260520132541'
from public.app_role_permissions existing_audit_roles
join public.app_permissions audit_permission
  on audit_permission.id = existing_audit_roles.permission_id
  and audit_permission.code = 'system.audit.view'
cross join public.app_permissions activity_permission
where activity_permission.code = 'system.activity.view'
on conflict do nothing;

insert into public.app_audit_logs (
  occurred_at,
  event_key,
  action,
  actor_app_user_id,
  actor_auth_user_id,
  target_type,
  target_id,
  metadata,
  ip_address,
  user_agent
)
select
  created_at,
  event_type,
  case
    when event_type like '%invite%' then 'invite'
    when event_type like '%reset%' then 'reset'
    when event_type like '%status%' then 'status'
    when event_type like '%created%' then 'create'
    when event_type like '%updated%' then 'update'
    when event_type like '%permission%' then 'permission'
    when event_type like '%role%' then 'role'
    when event_type like '%login%' then 'login'
    else 'system'
  end,
  actor_app_user_id,
  actor_auth_user_id,
  case when target_app_user_id is not null then 'app_user' else null end,
  target_app_user_id::text,
  metadata,
  ip_address,
  user_agent
from public.app_auth_events
where not exists (
  select 1
  from public.app_audit_logs existing
  where existing.event_key = public.app_auth_events.event_type
    and existing.occurred_at = public.app_auth_events.created_at
    and existing.actor_auth_user_id is not distinct from public.app_auth_events.actor_auth_user_id
    and existing.metadata = public.app_auth_events.metadata
);

comment on table public.app_auth_events is 'Legacy auth-event table kept for compatibility. New writes should use app_audit_logs/app_activity_logs.';
