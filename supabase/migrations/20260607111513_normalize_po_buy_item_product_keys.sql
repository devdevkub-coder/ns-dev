-- Normalize PO Buy item snapshots so allocation reconciliation uses the same
-- canonical internal product id as purchase_bill_po_allocations.
--
-- This intentionally backfills only rows that can be resolved from current
-- product master data. Legacy values such as P### that no longer exist in
-- products.code are not guessed here.

with normalized as (
  select
    po.id,
    jsonb_agg(
      case
        when resolved.product_id is null then item.value
        else item.value
          || jsonb_build_object('productIdInternal', resolved.product_id::text)
          || case
            when resolved.product_code is null then '{}'::jsonb
            else jsonb_build_object('productCode', resolved.product_code)
          end
      end
      order by item.ordinality
    ) as next_items
  from public.po_buys po
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(po.items::jsonb) = 'array' then po.items::jsonb
      else '[]'::jsonb
    end
  ) with ordinality as item(value, ordinality)
  left join lateral (
    select p.id as product_id, p.code as product_code
    from public.products p
    where
      (
        (item.value->>'productIdInternal') ~ '^[0-9]+$'
        and p.id = (item.value->>'productIdInternal')::bigint
      )
      or upper(p.code) = upper(coalesce(nullif(item.value->>'productCode', ''), nullif(item.value->>'productId', '')))
    order by
      case
        when (item.value->>'productIdInternal') ~ '^[0-9]+$'
          and p.id = (item.value->>'productIdInternal')::bigint then 0
        else 1
      end
    limit 1
  ) resolved on true
  group by po.id
)
update public.po_buys po
set items = normalized.next_items
from normalized
where po.id = normalized.id
  and po.items is distinct from normalized.next_items;
