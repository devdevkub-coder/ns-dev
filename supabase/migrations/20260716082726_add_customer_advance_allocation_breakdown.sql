begin;

alter table public.sales_bill_customer_advance_allocations
  add column if not exists allocated_subtotal_amount numeric(18, 2) not null default 0,
  add column if not exists allocated_vat_amount numeric(18, 2) not null default 0,
  add column if not exists allocated_total_amount numeric(18, 2) not null default 0;

update public.sales_bill_customer_advance_allocations
set
  allocated_amount = round(coalesce(allocated_amount, 0)::numeric, 2),
  allocated_subtotal_amount = case
    when coalesce(allocated_subtotal_amount, 0) = 0
    then round(coalesce(allocated_amount, 0)::numeric, 2)
    else round(allocated_subtotal_amount::numeric, 2)
  end,
  allocated_vat_amount = round(coalesce(allocated_vat_amount, 0)::numeric, 2),
  allocated_total_amount = case
    when coalesce(allocated_total_amount, 0) = 0
    then round((coalesce(allocated_amount, 0) + coalesce(allocated_vat_amount, 0))::numeric, 2)
    else round(allocated_total_amount::numeric, 2)
  end;

alter table public.sales_bill_customer_advance_allocations
  alter column allocated_amount type numeric(18, 2) using round(allocated_amount::numeric, 2),
  alter column outstanding_before type numeric(18, 2) using round(outstanding_before::numeric, 2),
  alter column outstanding_after type numeric(18, 2) using round(outstanding_after::numeric, 2);

alter table public.sales_bill_customer_advance_allocations
  drop constraint if exists sales_bill_customer_advance_allocations_breakdown_nonnegative,
  drop constraint if exists sales_bill_customer_advance_allocations_base_amount_check,
  drop constraint if exists sales_bill_customer_advance_allocations_total_breakdown_check,
  add constraint sales_bill_customer_advance_allocations_breakdown_nonnegative
    check (
      allocated_amount >= 0
      and allocated_subtotal_amount >= 0
      and allocated_vat_amount >= 0
      and allocated_total_amount >= 0
      and outstanding_before >= 0
      and outstanding_after >= 0
    ),
  add constraint sales_bill_customer_advance_allocations_base_amount_check
    check (abs(allocated_amount - allocated_subtotal_amount) <= 0.01),
  add constraint sales_bill_customer_advance_allocations_total_breakdown_check
    check (abs((allocated_subtotal_amount + allocated_vat_amount) - allocated_total_amount) <= 0.01);

commit;
