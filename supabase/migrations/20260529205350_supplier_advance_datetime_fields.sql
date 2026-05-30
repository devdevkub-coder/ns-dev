alter table public.supplier_advance_payments
  alter column in_date type timestamptz
  using case
    when in_date is null then null
    else (in_date::timestamp at time zone 'Asia/Bangkok')
  end;

alter table public.supplier_advance_payments
  alter column out_date type timestamptz
  using case
    when out_date is null then null
    else (out_date::timestamp at time zone 'Asia/Bangkok')
  end;
