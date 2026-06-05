alter table public.stock_ledger
  add column ledger_key text;

update public.stock_ledger
set ledger_key = 'SLG-' || gen_random_uuid()::text
where ledger_key is null;

alter table public.stock_ledger
  alter column ledger_key set not null,
  alter column ledger_key set default ('SLG-'::text || gen_random_uuid()::text);

alter table public.stock_ledger
  add constraint stock_ledger_ledger_key_key unique (ledger_key);
