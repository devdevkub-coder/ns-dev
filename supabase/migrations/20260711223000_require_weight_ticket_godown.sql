alter table public.weight_tickets
  rename column warehouse_name to godown_name;

comment on column public.weight_tickets.godown_name is
  'Required physical godown name snapshot for WTI and WTO headers. This is separate from the WTO stock warehouse stored in weight_ticket_lines.warehouse_id.';

update public.weight_tickets
set godown_name = 'ข้อมูลเดิมไม่ระบุโกดัง'
where nullif(btrim(godown_name), '') is null;

alter table public.weight_tickets
  alter column godown_name set not null;

alter table public.weight_tickets
  drop constraint if exists weight_tickets_godown_name_required_check;

alter table public.weight_tickets
  add constraint weight_tickets_godown_name_required_check
  check (nullif(btrim(godown_name), '') is not null);
