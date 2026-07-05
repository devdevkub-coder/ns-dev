alter table public.supplier_advance_payments
  add column if not exists advance_type text not null default 'WAITING_SORT',
  add column if not exists invoice_no text,
  add column if not exists vat_type text not null default 'NONE',
  add column if not exists vat_rate_percent numeric(5,2) not null default 7.00,
  add column if not exists subtotal_amount numeric not null default 0,
  add column if not exists vat_amount numeric not null default 0,
  add column if not exists total_amount numeric not null default 0;

update public.supplier_advance_payments
set
  advance_type = coalesce(nullif(advance_type, ''), 'WAITING_SORT'),
  vat_type = coalesce(nullif(vat_type, ''), 'NONE'),
  subtotal_amount = case
    when coalesce(subtotal_amount, 0) = 0 then coalesce(amount, 0)
    else subtotal_amount
  end,
  vat_amount = coalesce(vat_amount, 0),
  total_amount = case
    when coalesce(total_amount, 0) = 0 then coalesce(amount, 0)
    else total_amount
  end;

alter table public.supplier_advance_payments
  add constraint supplier_advance_payments_advance_type_check
    check (advance_type in ('WAITING_SORT', 'ADVANCE_INVOICE')) not valid,
  add constraint supplier_advance_payments_vat_type_check
    check (vat_type in ('NONE', 'INCLUDE')) not valid,
  add constraint supplier_advance_payments_invoice_required_for_advance_invoice
    check (advance_type <> 'ADVANCE_INVOICE' or nullif(trim(invoice_no), '') is not null) not valid,
  add constraint supplier_advance_payments_vat_breakdown_nonnegative
    check (subtotal_amount >= 0 and vat_amount >= 0 and total_amount >= 0) not valid;

create index if not exists idx_supplier_advance_payments_advance_type
  on public.supplier_advance_payments (advance_type);

create index if not exists idx_supplier_advance_payments_invoice_no
  on public.supplier_advance_payments (invoice_no)
  where invoice_no is not null;

alter table public.supplier_advance_allocations
  add column if not exists allocated_subtotal_amount numeric not null default 0,
  add column if not exists allocated_vat_amount numeric not null default 0,
  add column if not exists allocated_total_amount numeric not null default 0;

update public.supplier_advance_allocations
set
  allocated_subtotal_amount = case
    when coalesce(allocated_subtotal_amount, 0) = 0 then coalesce(allocated_amount, 0)
    else allocated_subtotal_amount
  end,
  allocated_vat_amount = coalesce(allocated_vat_amount, 0),
  allocated_total_amount = case
    when coalesce(allocated_total_amount, 0) = 0 then coalesce(allocated_amount, 0)
    else allocated_total_amount
  end;

alter table public.supplier_advance_allocations
  add constraint supplier_advance_allocations_breakdown_nonnegative
    check (allocated_subtotal_amount >= 0 and allocated_vat_amount >= 0 and allocated_total_amount >= 0) not valid;
