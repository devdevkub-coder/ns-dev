alter table public.weight_ticket_lines
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by text;

create index if not exists idx_weight_ticket_lines_ticket_version
  on public.weight_ticket_lines (weight_ticket_id, id, version);
