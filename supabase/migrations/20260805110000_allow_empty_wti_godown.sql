-- WTI may be created before products are received or sorted, so its header
-- godown is optional. WTO remains an outbound document and still requires it.
alter table public.weight_tickets
  drop constraint if exists weight_tickets_godown_name_required_check;

alter table public.weight_tickets
  add constraint weight_tickets_godown_name_required_check
  check (
    doc_type = 'WTI'
    or nullif(btrim(godown_name), '') is not null
  );

comment on constraint weight_tickets_godown_name_required_check on public.weight_tickets is
  'WTI header godown is optional; WTO header godown is required. WTO stock warehouse remains required per line.';
