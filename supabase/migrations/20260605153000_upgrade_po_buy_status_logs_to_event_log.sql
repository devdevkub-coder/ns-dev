do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'po_buy_status_logs'
      and column_name = 'status'
  ) then
    execute 'alter table public.po_buy_status_logs rename column status to to_status';
  end if;
end
$$;

alter table public.po_buy_status_logs
  add column if not exists event_key text,
  add column if not exists action text,
  add column if not exists from_status text,
  add column if not exists po_buy_doc_no text;

with ordered as (
  select
    logs.id,
    po.doc_no,
    logs.to_status,
    logs.note,
    logs.meta,
    row_number() over (
      partition by logs.po_buy_id
      order by logs.created_at asc, logs.id asc
    ) as seq,
    lag(logs.to_status) over (
      partition by logs.po_buy_id
      order by logs.created_at asc, logs.id asc
    ) as previous_status
  from public.po_buy_status_logs logs
  join public.po_buys po on po.id = logs.po_buy_id
)
update public.po_buy_status_logs logs
set
  po_buy_doc_no = ordered.doc_no,
  from_status = case
    when ordered.seq = 1 then null
    else ordered.previous_status
  end,
  action = case
    when coalesce(logs.meta ->> 'reason', '') = 'create' then 'created'
    when coalesce(logs.meta ->> 'reason', '') = 'cancel_action' then 'cancelled'
    when coalesce(logs.meta ->> 'reason', '') = 'short_close_action' then 'short_closed'
    when ordered.to_status = 'Partially Received' then 'received_partial'
    when ordered.to_status = 'Received' then 'received_full'
    when ordered.to_status = 'Cancelled' then 'cancelled'
    when ordered.to_status = 'Short Closed' then 'short_closed'
    when ordered.seq = 1 then 'created'
    else 'status_synced'
  end,
  event_key = format('POBLOG-%s-%s', ordered.doc_no, lpad(ordered.seq::text, 4, '0'))
from ordered
where ordered.id = logs.id;

alter table public.po_buy_status_logs
  alter column event_key set not null,
  alter column action set not null,
  alter column to_status set not null,
  alter column po_buy_doc_no set not null;

create unique index if not exists po_buy_status_logs_event_key_key
  on public.po_buy_status_logs (event_key);
