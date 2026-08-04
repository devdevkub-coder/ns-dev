BEGIN;

ALTER TABLE public.accounts
  DROP COLUMN IF EXISTS supports_cheque;

COMMIT;
