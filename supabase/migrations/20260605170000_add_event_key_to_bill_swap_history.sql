alter table public.bill_swap_history
  add column if not exists event_key text;

update public.bill_swap_history
set event_key = 'BSH-' || gen_random_uuid()::text
where event_key is null;

alter table public.bill_swap_history
  alter column event_key set default ('BSH-'::text || gen_random_uuid()::text),
  alter column event_key set not null;

create unique index if not exists bill_swap_history_event_key_key
  on public.bill_swap_history (event_key);
