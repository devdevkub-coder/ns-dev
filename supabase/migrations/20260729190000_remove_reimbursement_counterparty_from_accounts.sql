BEGIN;

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_counterparty_person_code_fkey;

DROP INDEX IF EXISTS public.idx_accounts_counterparty_person_code;

ALTER TABLE public.accounts
  DROP COLUMN IF EXISTS counterparty_person_code;

ALTER TABLE public.account_categories
  DROP COLUMN IF EXISTS requires_counterparty;

COMMIT;
