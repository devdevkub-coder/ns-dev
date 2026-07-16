alter table public.customer_advances
  add column vat_type text,
  add column vat_rate_percent numeric(5, 2),
  add column subtotal_amount numeric(18, 2),
  add column vat_amount numeric(18, 2);

update public.customer_advances
set
  vat_type = 'NONE',
  vat_rate_percent = 0,
  subtotal_amount = target_amount,
  vat_amount = 0;

alter table public.customer_advances
  alter column vat_type set not null,
  alter column vat_type set default 'NONE',
  alter column vat_rate_percent set not null,
  alter column vat_rate_percent set default 0,
  alter column subtotal_amount set not null,
  alter column vat_amount set not null,
  alter column vat_amount set default 0,
  add constraint customer_advances_vat_type_check
    check (vat_type in ('NONE', 'INCLUDE')),
  add constraint customer_advances_vat_rate_check
    check (vat_rate_percent >= 0 and vat_rate_percent <= 100),
  add constraint customer_advances_tax_breakdown_check
    check (
      subtotal_amount > 0
      and vat_amount >= 0
      and target_amount = subtotal_amount + vat_amount
      and (
        (vat_type = 'NONE' and vat_rate_percent = 0 and vat_amount = 0)
        or
        (
          vat_type = 'INCLUDE'
          and vat_rate_percent > 0
          and vat_amount = round(subtotal_amount * vat_rate_percent / 100, 2)
        )
      )
    );
