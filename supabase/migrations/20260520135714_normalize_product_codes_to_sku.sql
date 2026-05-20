create schema if not exists maintenance;

create table if not exists maintenance.products_sku_code_backup_20260520135714 as
select *
from public.products;

with ordered_products as (
  select
    id,
    row_number() over (order by code nulls last, name, id) as sequence_no
  from public.products
)
update public.products as product
set code = 'SKU' || lpad(ordered_products.sequence_no::text, 3, '0'),
    updated_at = now()
from ordered_products
where product.id = ordered_products.id;
