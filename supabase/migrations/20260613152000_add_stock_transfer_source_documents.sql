create table if not exists public.stock_transfers (
  id bigserial primary key,
  doc_no text not null unique,
  date date not null,
  from_branch_id bigint not null references public.branches(id) on delete restrict,
  from_warehouse_id bigint not null references public.warehouses(id) on delete restrict,
  to_branch_id bigint not null references public.branches(id) on delete restrict,
  to_warehouse_id bigint not null references public.warehouses(id) on delete restrict,
  status text not null default 'draft',
  notes text,
  total_qty numeric not null default 0,
  total_value numeric not null default 0,
  posted_at timestamptz,
  posted_by text,
  cancelled_at timestamptz,
  cancelled_by text,
  cancel_reason text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  version integer not null default 1,
  constraint stock_transfers_status_check check (status in ('draft', 'posted', 'cancelled')),
  constraint stock_transfers_distinct_warehouse_check check (from_warehouse_id <> to_warehouse_id),
  constraint stock_transfers_total_qty_check check (total_qty >= 0),
  constraint stock_transfers_total_value_check check (total_value >= 0)
);

create table if not exists public.stock_transfer_items (
  id bigserial primary key,
  transfer_id bigint not null references public.stock_transfers(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete restrict,
  qty numeric not null,
  source_unit_cost numeric not null default 0,
  line_value numeric not null default 0,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  constraint stock_transfer_items_qty_check check (qty > 0),
  constraint stock_transfer_items_source_unit_cost_check check (source_unit_cost >= 0),
  constraint stock_transfer_items_line_value_check check (line_value >= 0)
);

create index if not exists idx_stock_transfers_date_doc
  on public.stock_transfers (date desc, doc_no desc);

create index if not exists idx_stock_transfers_doc_no
  on public.stock_transfers (doc_no);

create index if not exists idx_stock_transfers_doc_no_pattern
  on public.stock_transfers (doc_no text_pattern_ops);

create index if not exists idx_stock_transfers_status_date_doc
  on public.stock_transfers (status, date desc, doc_no desc);

create index if not exists idx_stock_transfers_total_qty
  on public.stock_transfers (total_qty);

create index if not exists idx_stock_transfer_items_transfer_product
  on public.stock_transfer_items (transfer_id, product_id);

create index if not exists idx_stock_transfer_items_product
  on public.stock_transfer_items (product_id);

create index if not exists idx_stock_ledger_st_ref
  on public.stock_ledger (ref_type, ref_no, ref_id)
  where ref_type = 'ST';

create index if not exists idx_stock_ledger_st_source_lookup
  on public.stock_ledger (branch_id, warehouse_id, product_id, date)
  where ref_type = 'ST';

with grouped_st as (
  select
    sl.ref_no as doc_no,
    min(sl.date)::date as date,
    (array_agg(sl.branch_id order by sl.id) filter (where coalesce(sl.qty_out, 0) > 0))[1] as from_branch_id,
    (array_agg(sl.warehouse_id order by sl.id) filter (where coalesce(sl.qty_out, 0) > 0))[1] as from_warehouse_id,
    (array_agg(sl.branch_id order by sl.id) filter (where coalesce(sl.qty_in, 0) > 0))[1] as to_branch_id,
    (array_agg(sl.warehouse_id order by sl.id) filter (where coalesce(sl.qty_in, 0) > 0))[1] as to_warehouse_id,
    (array_agg(nullif(sl.notes, '') order by sl.id) filter (where nullif(sl.notes, '') is not null))[1] as notes,
    sum(coalesce(sl.qty_out, 0)) as total_qty,
    sum(coalesce(sl.value_out, 0)) as total_value,
    min(sl.created_at) as created_at,
    (array_agg(sl.created_by order by sl.id) filter (where nullif(sl.created_by, '') is not null))[1] as created_by
  from public.stock_ledger sl
  where sl.ref_type = 'ST'
    and nullif(sl.ref_no, '') is not null
  group by sl.ref_no
)
insert into public.stock_transfers (
  doc_no,
  date,
  from_branch_id,
  from_warehouse_id,
  to_branch_id,
  to_warehouse_id,
  status,
  notes,
  total_qty,
  total_value,
  posted_at,
  posted_by,
  created_at,
  created_by
)
select
  doc_no,
  date,
  from_branch_id,
  from_warehouse_id,
  to_branch_id,
  to_warehouse_id,
  'posted',
  notes,
  total_qty,
  total_value,
  created_at,
  created_by,
  coalesce(created_at, now()),
  created_by
from grouped_st
where from_branch_id is not null
  and from_warehouse_id is not null
  and to_branch_id is not null
  and to_warehouse_id is not null
  and from_warehouse_id <> to_warehouse_id
on conflict (doc_no) do nothing;

with legacy_items as (
  select
    st.id as transfer_id,
    sl.product_id,
    sum(coalesce(sl.qty_out, 0)) as qty,
    case
      when sum(coalesce(sl.qty_out, 0)) > 0 then sum(coalesce(sl.value_out, 0)) / sum(coalesce(sl.qty_out, 0))
      else max(coalesce(sl.unit_cost, 0))
    end as source_unit_cost,
    sum(coalesce(sl.value_out, 0)) as line_value,
    min(sl.created_at) as created_at,
    (array_agg(sl.created_by order by sl.id) filter (where nullif(sl.created_by, '') is not null))[1] as created_by
  from public.stock_ledger sl
  join public.stock_transfers st on st.doc_no = sl.ref_no
  where sl.ref_type = 'ST'
    and coalesce(sl.qty_out, 0) > 0
    and sl.product_id is not null
  group by st.id, sl.product_id
)
insert into public.stock_transfer_items (
  transfer_id,
  product_id,
  qty,
  source_unit_cost,
  line_value,
  created_at,
  created_by
)
select
  legacy_items.transfer_id,
  legacy_items.product_id,
  legacy_items.qty,
  legacy_items.source_unit_cost,
  legacy_items.line_value,
  coalesce(legacy_items.created_at, now()),
  legacy_items.created_by
from legacy_items
where legacy_items.qty > 0
  and not exists (
    select 1
    from public.stock_transfer_items existing
    where existing.transfer_id = legacy_items.transfer_id
  );
