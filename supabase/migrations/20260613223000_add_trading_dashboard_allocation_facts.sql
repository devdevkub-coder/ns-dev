-- Add allocation facts for the Trading Dashboard target read model.
-- This table stores the line/product attribution used by dashboard Matched COGS.
-- Runtime dashboard code must read these facts and must not silently invent cost.

create table if not exists public.trading_allocation_facts (
  id bigserial primary key,
  allocation_no text not null,
  date date not null,
  trading_deal_id bigint references public.trading_deals(id) on delete set null,
  purchase_bill_id bigint references public.purchase_bills(id) on delete set null,
  sales_bill_id bigint references public.sales_bills(id) on delete set null,
  supplier_id bigint references public.suppliers(id) on delete set null,
  customer_id bigint references public.customers(id) on delete set null,
  product_id bigint references public.products(id) on delete set null,
  source_type text not null default 'TRADING_PURCHASE_BILL',
  source_doc_no text,
  source_line_no integer,
  sales_doc_no text,
  sales_line_no integer,
  product_code_snapshot text,
  product_name_snapshot text,
  supplier_name_snapshot text,
  customer_name_snapshot text,
  qty numeric not null default 0,
  sales_amount numeric not null default 0,
  matched_cogs numeric not null default 0,
  allocation_method text not null default 'RECORDED_LINE',
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by text,
  updated_by text,
  constraint uq_trading_allocation_facts_allocation_no unique (allocation_no),
  constraint chk_trading_allocation_facts_amounts_non_negative check (qty >= 0 and sales_amount >= 0 and matched_cogs >= 0),
  constraint chk_trading_allocation_facts_status check (status in ('active', 'reversed', 'cancelled')),
  constraint chk_trading_allocation_facts_method check (allocation_method in ('RECORDED_LINE', 'PROPORTIONAL_SALES_AMOUNT', 'MANUAL_ADJUSTMENT'))
);

alter table public.trading_allocation_facts enable row level security;

create index if not exists idx_trading_allocation_facts_date
  on public.trading_allocation_facts (date desc, id desc)
  where status = 'active';

create index if not exists idx_trading_allocation_facts_sales
  on public.trading_allocation_facts (sales_bill_id, sales_line_no, product_id)
  where status = 'active';

create index if not exists idx_trading_allocation_facts_purchase
  on public.trading_allocation_facts (purchase_bill_id, product_id)
  where status = 'active';

create index if not exists idx_trading_allocation_facts_product_date
  on public.trading_allocation_facts (product_id, date desc, id desc)
  where status = 'active' and product_id is not null;

create index if not exists idx_trading_allocation_facts_supplier_date
  on public.trading_allocation_facts (supplier_id, date desc, id desc)
  where status = 'active' and supplier_id is not null;

create index if not exists idx_trading_allocation_facts_customer_date
  on public.trading_allocation_facts (customer_id, date desc, id desc)
  where status = 'active' and customer_id is not null;

create index if not exists idx_trading_allocation_facts_source_doc
  on public.trading_allocation_facts (source_doc_no text_pattern_ops)
  where source_doc_no is not null;

create index if not exists idx_trading_allocation_facts_sales_doc
  on public.trading_allocation_facts (sales_doc_no text_pattern_ops)
  where sales_doc_no is not null;

-- Backfill existing legacy/current deal data into explicit facts.
-- Existing data only has document-level deal cost, so the backfill records the
-- proportional basis as data (`allocation_method = PROPORTIONAL_SALES_AMOUNT`)
-- instead of leaving the dashboard to guess at runtime.
with deal_rows as (
  select
    td.id as trading_deal_id,
    td.deal_no,
    td.date::date as deal_date,
    td.purchase_bill_id,
    td.sales_bill_id,
    td.purchase_bill_no,
    td.sales_bill_no,
    td.supplier_id,
    td.customer_id,
    td.product_id as deal_product_id,
    coalesce(td.matched_qty, 0)::numeric as matched_qty,
    coalesce(td.matched_purchase_amount, 0)::numeric as matched_cogs,
    coalesce(td.matched_sales_amount, 0)::numeric as matched_sales,
    pb.doc_no as pb_doc_no,
    sb.doc_no as sb_doc_no,
    sb.items as sales_items,
    coalesce(sb.subtotal, sb.total_amount, 0)::numeric as sales_bill_total,
    s.name as supplier_name,
    c.name as customer_name
  from public.trading_deals td
  left join public.purchase_bills pb on pb.id = td.purchase_bill_id
  left join public.sales_bills sb on sb.id = td.sales_bill_id
  left join public.suppliers s on s.id = td.supplier_id
  left join public.customers c on c.id = td.customer_id
  where coalesce(td.status, '') <> 'Cancelled'
    and coalesce(td.status, '') <> 'cancelled'
),
sales_lines as (
  select
    dr.*,
    (line.ordinality)::integer as sales_line_no,
    line.item,
    coalesce(
      nullif(line.item ->> 'productCode', ''),
      nullif(line.item ->> 'code', '')
    ) as item_product_code,
    case
      when coalesce(line.item ->> 'productId', line.item ->> 'product_id', '') ~ '^[0-9]+$'
        then (coalesce(line.item ->> 'productId', line.item ->> 'product_id'))::bigint
      else null
    end as item_product_id,
    case
      when coalesce(line.item ->> 'netWeight', line.item ->> 'weight', line.item ->> 'qty', line.item ->> 'quantity', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (coalesce(line.item ->> 'netWeight', line.item ->> 'weight', line.item ->> 'qty', line.item ->> 'quantity'))::numeric
      else 0
    end as item_qty,
    case
      when coalesce(line.item ->> 'netAmount', line.item ->> 'amount', line.item ->> 'totalAmount', line.item ->> 'total', line.item ->> 'lineTotal', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (coalesce(line.item ->> 'netAmount', line.item ->> 'amount', line.item ->> 'totalAmount', line.item ->> 'total', line.item ->> 'lineTotal'))::numeric
      else null
    end as explicit_line_amount,
    case
      when coalesce(line.item ->> 'price', line.item ->> 'unitPrice', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (coalesce(line.item ->> 'price', line.item ->> 'unitPrice'))::numeric
      else 0
    end as item_price
  from deal_rows dr
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(dr.sales_items::jsonb) = 'array' then dr.sales_items::jsonb
      else '[]'::jsonb
    end
  ) with ordinality as line(item, ordinality)
  where dr.sales_bill_id is not null
),
resolved_lines as (
  select
    sl.*,
    coalesce(sl.explicit_line_amount, sl.item_qty * sl.item_price, 0)::numeric as line_sales_amount,
    coalesce(p_by_id.id, p_by_code.id, sl.deal_product_id) as resolved_product_id,
    coalesce(p_by_id.code, p_by_code.code, sl.item_product_code) as product_code,
    coalesce(p_by_id.name, p_by_code.name, nullif(sl.item ->> 'productName', ''), nullif(sl.item ->> 'name', ''), 'ไม่ระบุสินค้า') as product_name
  from sales_lines sl
  left join public.products p_by_id on p_by_id.id = sl.item_product_id
  left join public.products p_by_code on p_by_code.code = sl.item_product_code
),
allocated_lines as (
  select
    rl.*,
    case
      when rl.sales_bill_total > 0 then rl.line_sales_amount / rl.sales_bill_total
      when rl.matched_sales > 0 then rl.line_sales_amount / rl.matched_sales
      else 0
    end as allocation_share
  from resolved_lines rl
  where rl.line_sales_amount > 0
),
inserted as (
  insert into public.trading_allocation_facts (
    allocation_no,
    date,
    trading_deal_id,
    purchase_bill_id,
    sales_bill_id,
    supplier_id,
    customer_id,
    product_id,
    source_type,
    source_doc_no,
    source_line_no,
    sales_doc_no,
    sales_line_no,
    product_code_snapshot,
    product_name_snapshot,
    supplier_name_snapshot,
    customer_name_snapshot,
    qty,
    sales_amount,
    matched_cogs,
    allocation_method,
    status,
    notes,
    created_by,
    updated_by
  )
  select
    concat('TAF-', al.deal_no, '-', al.sales_line_no),
    al.deal_date,
    al.trading_deal_id,
    al.purchase_bill_id,
    al.sales_bill_id,
    al.supplier_id,
    al.customer_id,
    al.resolved_product_id,
    'TRADING_PURCHASE_BILL',
    coalesce(al.pb_doc_no, al.purchase_bill_no),
    null,
    coalesce(al.sb_doc_no, al.sales_bill_no),
    al.sales_line_no,
    al.product_code,
    al.product_name,
    al.supplier_name,
    al.customer_name,
    al.item_qty * al.allocation_share,
    al.matched_sales * al.allocation_share,
    al.matched_cogs * al.allocation_share,
    'PROPORTIONAL_SALES_AMOUNT',
    'active',
    'Backfilled from legacy/current trading_deals document-level amounts. Cost was allocated by sales line amount ratio.',
    'migration',
    'migration'
  from allocated_lines al
  where al.allocation_share > 0
  on conflict (allocation_no) do nothing
  returning id
)
select count(*) from inserted;
