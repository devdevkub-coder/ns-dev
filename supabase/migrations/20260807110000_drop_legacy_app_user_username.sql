-- app_users uses email as the only login identifier.
-- Reconcile environments where the legacy NOT NULL username column survived
-- an earlier migration-history-only repair and still blocks new user inserts.
alter table public.app_users
  drop column if exists username;
