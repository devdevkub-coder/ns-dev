-- Split purchase bill line items from purchase_bills.items JSONB into a relational line table.
-- Additive: keeps purchase_bills.items for compatibility while new code reads/writes purchase_bill_items.

create table if not exists public.purchase_bill_items (
  id text primary key,
  purchase_bill_id text not null references public.purchase_bills(id) on delete cascade,
  line_no integer not null,
  product_id text references public.products(id) on delete restrict,
  product_code text,
  product_name text,
  display_name text,
  unit text,
  lot_no text,
  po_buy_id text references public.po_buys(id) on delete set null,
  gross_weight numeric not null default 0,
  deduct_weight numeric not null default 0,
  qty numeric not null default 0,
  price numeric not null default 0,
  sales_price numeric not null default 0,
  discount numeric not null default 0,
  amount numeric not null default 0,
  note text,
  source_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_bill_items_line_no_chk check (line_no > 0),
  constraint purchase_bill_items_non_negative_qty_chk check (
    gross_weight >= 0
    and deduct_weight >= 0
    and qty >= 0
    and price >= 0
    and sales_price >= 0
    and discount >= 0
    and amount >= 0
  ),
  constraint purchase_bill_items_weight_chk check (gross_weight = 0 or gross_weight >= deduct_weight)
);

create unique index if not exists uq_purchase_bill_items_bill_line
on public.purchase_bill_items (purchase_bill_id, line_no);

create index if not exists idx_purchase_bill_items_bill
on public.purchase_bill_items (purchase_bill_id);

create index if not exists idx_purchase_bill_items_product
on public.purchase_bill_items (product_id);

create index if not exists idx_purchase_bill_items_po_buy
on public.purchase_bill_items (po_buy_id);

drop trigger if exists purchase_bill_items_set_updated_at on public.purchase_bill_items;
create trigger purchase_bill_items_set_updated_at
before update on public.purchase_bill_items
for each row execute function public.app_set_updated_at();

comment on table public.purchase_bill_items is 'Relational line items for purchase_bills; split from purchase_bills.items JSONB for reporting, audit, and PO/product joins.';
comment on column public.purchase_bill_items.purchase_bill_id is 'Header purchase_bills.id.';
comment on column public.purchase_bill_items.line_no is '1-based line number within the purchase bill.';
comment on column public.purchase_bill_items.product_id is 'Referenced product master id where available.';
comment on column public.purchase_bill_items.po_buy_id is 'Optional row-level PO Buy reference; null means Spot Buy.';
comment on column public.purchase_bill_items.source_snapshot is 'Original JSON item snapshot from purchase_bills.items during backfill or compatibility write.';

insert into public.purchase_bill_items (
  id,
  purchase_bill_id,
  line_no,
  product_id,
  product_code,
  product_name,
  display_name,
  unit,
  lot_no,
  po_buy_id,
  gross_weight,
  deduct_weight,
  qty,
  price,
  sales_price,
  discount,
  amount,
  note,
  source_snapshot,
  created_at,
  updated_at
)
select
  pb.id || '-ITEM-' || lpad(item.ordinality::text, 4, '0') as id,
  pb.id as purchase_bill_id,
  item.ordinality::integer as line_no,
  case
    when exists (select 1 from public.products p where p.id = nullif(item.value->>'productId', ''))
    then nullif(item.value->>'productId', '')
    else null
  end as product_id,
  nullif(item.value->>'productCode', '') as product_code,
  nullif(item.value->>'productName', '') as product_name,
  nullif(item.value->>'displayName', '') as display_name,
  nullif(item.value->>'unit', '') as unit,
  nullif(item.value->>'lotNo', '') as lot_no,
  case
    when exists (select 1 from public.po_buys po where po.id = nullif(item.value->>'poBuyId', ''))
    then nullif(item.value->>'poBuyId', '')
    else null
  end as po_buy_id,
  case when coalesce(item.value->>'grossWeight', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item.value->>'grossWeight')::numeric else 0 end as gross_weight,
  case when coalesce(item.value->>'deductWeight', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item.value->>'deductWeight')::numeric else 0 end as deduct_weight,
  case when coalesce(item.value->>'qty', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item.value->>'qty')::numeric else 0 end as qty,
  case when coalesce(item.value->>'price', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item.value->>'price')::numeric else 0 end as price,
  case when coalesce(item.value->>'salesPrice', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item.value->>'salesPrice')::numeric else 0 end as sales_price,
  case when coalesce(item.value->>'discount', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item.value->>'discount')::numeric else 0 end as discount,
  case when coalesce(item.value->>'amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then (item.value->>'amount')::numeric else 0 end as amount,
  nullif(item.value->>'note', '') as note,
  item.value as source_snapshot,
  coalesce(pb.created_at, now()) as created_at,
  coalesce(pb.updated_at, pb.created_at, now()) as updated_at
from public.purchase_bills pb
cross join lateral jsonb_array_elements(pb.items) with ordinality as item(value, ordinality)
where jsonb_typeof(pb.items) = 'array'
on conflict (id) do nothing;

alter table public.purchase_bill_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'purchase_bill_items'
      and policyname = 'authenticated can read purchase bill items'
  ) then
    create policy "authenticated can read purchase bill items"
      on public.purchase_bill_items
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'purchase_bill_items'
      and policyname = 'authenticated can write purchase bill items'
  ) then
    create policy "authenticated can write purchase bill items"
      on public.purchase_bill_items
      for all
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;
