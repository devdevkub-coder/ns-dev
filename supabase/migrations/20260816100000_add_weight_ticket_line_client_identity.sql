-- A client line ID is the durable identity for a newly-added lot while the
-- browser is retrying a PATCH whose response may have been lost.  Existing
-- rows remain nullable; new rows receive the client-generated UUID.
alter table public.weight_ticket_lines
  add column if not exists client_line_id text;

create index if not exists idx_weight_ticket_lines_ticket_client_line
  on public.weight_ticket_lines (weight_ticket_id, client_line_id);

create unique index if not exists uq_weight_ticket_lines_ticket_client_line
  on public.weight_ticket_lines (weight_ticket_id, client_line_id)
  where client_line_id is not null;
