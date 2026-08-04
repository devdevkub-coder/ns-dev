-- Reconcile SIT/target schemas where the earlier email-only migration was
-- recorded in migration history but the legacy NOT NULL username column
-- remained physically present.
-- app_users uses email as the only login identifier.
drop index if exists public.app_users_username_lower_key;

alter table public.app_users
  drop column if exists username;
