create table if not exists public.weight_ticket_pending_out_events (
  id bigserial primary key,
  event_key text not null unique default ('WTPEND-' || gen_random_uuid()::text),
  weight_ticket_id bigint not null references public.weight_tickets(id) on delete cascade,
  weight_ticket_doc_no text not null,
  status_log_event_key text references public.weight_ticket_status_logs(event_key) on delete set null,
  usage_log_event_key text references public.weight_ticket_usage_logs(event_key) on delete set null,
  event_type text not null,
  source_hold_key text,
  source_line_no integer,
  weight_ticket_line_id bigint references public.weight_ticket_lines(id) on delete set null,
  product_id bigint references public.products(id) on delete set null,
  product_code_snapshot text,
  product_name_snapshot text not null default '',
  warehouse_id bigint references public.warehouses(id) on delete set null,
  warehouse_code_snapshot text,
  warehouse_name_snapshot text not null default '',
  qty numeric not null default 0,
  qty_before numeric,
  qty_after numeric,
  unit_cost_snapshot numeric,
  value_snapshot numeric,
  cost_snapshot_at timestamptz,
  cost_snapshot_source text,
  status_snapshot text not null default 'active',
  reference_doc_no text,
  reference_doc_type text,
  occurred_at timestamptz not null default now(),
  actor text,
  note text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_weight_ticket_pending_out_events_ticket_time
  on public.weight_ticket_pending_out_events (weight_ticket_id, occurred_at desc, id desc);

create index if not exists idx_weight_ticket_pending_out_events_status_log
  on public.weight_ticket_pending_out_events (status_log_event_key);

create index if not exists idx_weight_ticket_pending_out_events_usage_log
  on public.weight_ticket_pending_out_events (usage_log_event_key);

create index if not exists idx_weight_ticket_pending_out_events_hold
  on public.weight_ticket_pending_out_events (source_hold_key);

create unique index if not exists uq_weight_ticket_pending_out_events_status_hold_type
  on public.weight_ticket_pending_out_events (status_log_event_key, source_hold_key, event_type)
  where status_log_event_key is not null and source_hold_key is not null;

create unique index if not exists uq_weight_ticket_pending_out_events_ref_hold_type
  on public.weight_ticket_pending_out_events (reference_doc_no, source_hold_key, event_type)
  where reference_doc_no is not null and source_hold_key is not null;

insert into public.weight_ticket_pending_out_events (
  weight_ticket_id,
  weight_ticket_doc_no,
  status_log_event_key,
  event_type,
  source_hold_key,
  source_line_no,
  weight_ticket_line_id,
  product_id,
  product_code_snapshot,
  product_name_snapshot,
  warehouse_id,
  warehouse_code_snapshot,
  warehouse_name_snapshot,
  qty,
  qty_after,
  unit_cost_snapshot,
  value_snapshot,
  cost_snapshot_at,
  cost_snapshot_source,
  status_snapshot,
  reference_doc_no,
  reference_doc_type,
  occurred_at,
  actor,
  note,
  meta
)
select
  sh.weight_ticket_id,
  wt.doc_no,
  matched_status.event_key,
  case
    when sh.cost_snapshot_source = 'WTO_CONFIRM' then 'confirm_snapshot'
    when sh.cost_snapshot_source = 'WTO_EDIT_INCREASE' then 'edit_snapshot'
    else 'hold_snapshot'
  end,
  sh.hold_key,
  sh.source_line_no,
  sh.weight_ticket_line_id,
  sh.product_id,
  p.code,
  coalesce(p.name, ''),
  sh.warehouse_id,
  w.code,
  coalesce(w.name, ''),
  sh.qty,
  sh.qty,
  sh.unit_cost_snapshot,
  sh.value_snapshot,
  sh.cost_snapshot_at,
  sh.cost_snapshot_source,
  case
    when sh.cost_snapshot_source in ('WTO_CONFIRM', 'WTO_EDIT_INCREASE') then 'active'
    else sh.status
  end,
  coalesce(sh.consumed_by_ref_no, sh.source_doc_no, wt.doc_no),
  case when sh.consumed_by_ref_no is not null then sh.consumed_by_ref_type else sh.source_type end,
  coalesce(matched_status.created_at, sh.cost_snapshot_at, sh.held_at, sh.updated_at, sh.created_at),
  coalesce(matched_status.created_by, sh.updated_by, sh.created_by),
  sh.cost_snapshot_note,
  jsonb_build_object('backfilledFrom', 'stock_holds')
from public.stock_holds sh
join public.weight_tickets wt on wt.id = sh.weight_ticket_id
left join public.products p on p.id = sh.product_id
left join public.warehouses w on w.id = sh.warehouse_id
left join lateral (
  select l.event_key, l.created_at, l.created_by
  from public.weight_ticket_status_logs l
  where l.weight_ticket_id = sh.weight_ticket_id
    and (
      (sh.cost_snapshot_source = 'WTO_CONFIRM' and l.action = 'confirmed')
      or (sh.cost_snapshot_source = 'WTO_EDIT_INCREASE' and l.action = 'edited')
    )
  order by abs(extract(epoch from (l.created_at - coalesce(sh.held_at, sh.cost_snapshot_at, sh.updated_at, sh.created_at)))) asc,
    l.id desc
  limit 1
) matched_status on true
where wt.doc_type = 'WTO'
  and sh.cost_snapshot_source in ('WTO_CONFIRM', 'WTO_EDIT_INCREASE')
  and matched_status.event_key is not null
  and (
    (
      sh.cost_snapshot_source = 'WTO_CONFIRM'
      and sh.held_at <= matched_status.created_at + interval '1 minute'
    )
    or (
      sh.cost_snapshot_source = 'WTO_EDIT_INCREASE'
      and abs(extract(epoch from (coalesce(sh.cost_snapshot_at, sh.held_at) - matched_status.created_at))) <= 300
      and sh.held_at <= matched_status.created_at + interval '5 minutes'
    )
  )
  and not exists (
    select 1
    from public.weight_ticket_pending_out_events existing
    where existing.source_hold_key = sh.hold_key
      and existing.event_type in ('confirm_snapshot', 'edit_snapshot', 'hold_snapshot')
  );

with classified_edit_snapshots as (
  select
    e.id,
    case
      when exists (
        select 1
        from public.weight_ticket_pending_out_events previous
        where previous.weight_ticket_id = e.weight_ticket_id
          and previous.source_line_no = e.source_line_no
          and (previous.occurred_at, previous.id) < (e.occurred_at, e.id)
      ) then 'edit_update_scale'
      else 'edit_add_scale'
    end as event_type
  from public.weight_ticket_pending_out_events e
  where e.event_type = 'edit_snapshot'
    and e.source_line_no is not null
)
update public.weight_ticket_pending_out_events e
set event_type = classified.event_type
from classified_edit_snapshots classified
where classified.id = e.id;
