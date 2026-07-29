alter table public.payment_approvals
  add column if not exists branch_id bigint references public.branches(id);

create index if not exists idx_payment_approvals_branch_approved_doc
  on public.payment_approvals (branch_id, approved_at desc, doc_no desc);
