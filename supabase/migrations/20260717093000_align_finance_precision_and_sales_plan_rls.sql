begin;

alter table public.supplier_advance_payments
  alter column amount type numeric(18,2) using round(amount::numeric, 2),
  alter column allocated_amount type numeric(18,2) using round(allocated_amount::numeric, 2),
  alter column remaining_amount type numeric(18,2) using round(remaining_amount::numeric, 2),
  alter column subtotal_amount type numeric(18,2) using round(subtotal_amount::numeric, 2),
  alter column vat_amount type numeric(18,2) using round(vat_amount::numeric, 2),
  alter column total_amount type numeric(18,2) using round(total_amount::numeric, 2);

alter table public.supplier_advance_allocations
  alter column allocated_amount type numeric(18,2) using round(allocated_amount::numeric, 2),
  alter column allocated_subtotal_amount type numeric(18,2) using round(allocated_subtotal_amount::numeric, 2),
  alter column allocated_vat_amount type numeric(18,2) using round(allocated_vat_amount::numeric, 2),
  alter column allocated_total_amount type numeric(18,2) using round(allocated_total_amount::numeric, 2);

alter table public.sales_plans enable row level security;

comment on column public.app_users.account_status is
  'Application account lifecycle: pending invitation, active, or disabled.';
comment on column public.app_users.activation_source is
  'How the account was first activated: invitation, admin, or existing-data backfill.';

commit;
