begin;

alter table public.customer_receipts
  add column if not exists fx_rate_type text;

alter table public.customer_receipts
  drop constraint if exists customer_receipts_foreign_fx_rate_type_chk,
  add constraint customer_receipts_foreign_fx_rate_type_chk check (
    receipt_currency_code is null
    or nullif(btrim(fx_rate_type), '') is not null
  );

commit;
