-- `line_no` is presentation order and may change after insert/delete.  Keep a
-- separate immutable sequence for physical lots so concurrent editors cannot
-- make the visible lot identity point at a different row.
alter table public.weight_ticket_lines
  add column if not exists lot_seq integer;

with ranked_lots as (
  select
    id,
    row_number() over (
      partition by weight_ticket_id
      order by created_at asc, id asc
    )::integer as next_lot_seq
  from public.weight_ticket_lines
  where deduction_mode = 'none'
)
update public.weight_ticket_lines as lines
set lot_seq = ranked_lots.next_lot_seq
from ranked_lots
where lines.id = ranked_lots.id
  and lines.lot_seq is null;

create unique index if not exists uq_weight_ticket_lines_ticket_lot_seq
  on public.weight_ticket_lines (weight_ticket_id, lot_seq)
  where lot_seq is not null;
