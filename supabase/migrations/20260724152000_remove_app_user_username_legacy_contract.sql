-- app_users uses email as the only login identifier.
-- Remove the reintroduced legacy username column so the database matches the Prisma schema and admin user flow.
drop index if exists public.app_users_username_lower_key;

alter table public.app_users
  drop column if exists username;
