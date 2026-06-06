alter table public.payment_approvals
  alter column status set default 'pending';

alter table public.payment_approvals
  drop constraint if exists payment_approvals_status_chk;

alter table public.payment_approvals
  add constraint payment_approvals_status_chk
  check (status in ('pending', 'approved', 'paid', 'voided'));
