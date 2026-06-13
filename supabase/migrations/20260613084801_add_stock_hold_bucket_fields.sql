alter table public.stock_holds
  add column if not exists output_category text,
  add column if not exists lot_no text,
  add column if not exists not_available_for_sale boolean not null default false;

update public.stock_holds sh
set
  output_category = coalesce(sh.output_category, w.type),
  not_available_for_sale = coalesce(sh.not_available_for_sale, false)
from public.warehouses w
where w.id = sh.warehouse_id
  and (sh.output_category is null or sh.not_available_for_sale is null)
  and w.type in ('RM', 'FG');

with consumed_hold_bucket as (
  select
    sh.consumed_by_ref_type,
    sh.consumed_by_ref_no,
    sh.product_id,
    sh.warehouse_id,
    min(sh.output_category) as output_category,
    min(sh.lot_no) as lot_no,
    bool_or(sh.not_available_for_sale) as not_available_for_sale,
    count(distinct coalesce(sh.output_category, '-')) as output_category_count,
    count(distinct coalesce(sh.lot_no, '-')) as lot_no_count,
    count(distinct coalesce(sh.not_available_for_sale::text, 'false')) as not_available_count
  from public.stock_holds sh
  where sh.consumed_by_ref_type in ('SB', 'PSALE')
    and sh.consumed_by_ref_no is not null
  group by
    sh.consumed_by_ref_type,
    sh.consumed_by_ref_no,
    sh.product_id,
    sh.warehouse_id
)
update public.stock_ledger sl
set
  output_category = coalesce(sl.output_category, chb.output_category),
  lot_no = coalesce(sl.lot_no, chb.lot_no),
  not_available_for_sale = coalesce(sl.not_available_for_sale, chb.not_available_for_sale, false)
from consumed_hold_bucket chb
where sl.ref_type = chb.consumed_by_ref_type
  and (sl.ref_no = chb.consumed_by_ref_no or sl.ref_id = chb.consumed_by_ref_no)
  and sl.product_id = chb.product_id
  and sl.warehouse_id = chb.warehouse_id
  and chb.output_category_count = 1
  and chb.lot_no_count = 1
  and chb.not_available_count = 1
  and (
    sl.output_category is null
    or sl.lot_no is null
    or sl.not_available_for_sale is null
  );

drop index if exists public.idx_stock_holds_active_lookup;
create index if not exists idx_stock_holds_active_lookup
  on public.stock_holds (branch_id, product_id, warehouse_id, output_category);
