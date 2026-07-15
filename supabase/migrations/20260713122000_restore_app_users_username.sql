alter table public.app_users
  add column if not exists username text;

update public.app_users
set username = lower(email)
where username is null
  and email is not null;

update public.app_users
set username = 'user-' || id::text
where username is null;

alter table public.app_users
  alter column username set not null;

create unique index if not exists app_users_username_lower_key
  on public.app_users (lower(username));
