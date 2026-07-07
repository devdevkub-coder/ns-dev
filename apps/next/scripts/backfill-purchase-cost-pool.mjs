import pg from 'pg'

const COST_EPSILON = 0.0001

function requireDatabaseUrl() {
  const value = process.env.DATABASE_RUNTIME_URL ?? process.env.DATABASE_PRISMA_URL ?? process.env.DATABASE_URL
  if (!value) throw new Error('DATABASE_URL is required')
  const url = new URL(value)
  const isSupabasePooler = url.hostname.endsWith('.pooler.supabase.com') && url.username.startsWith('postgres.')
  if (isSupabasePooler && (!url.port || url.port === '5432')) url.port = '6543'
  return url.toString()
}

const client = new pg.Client({ connectionString: requireDatabaseUrl() })

const ELIGIBLE_METAL_SQL = `
  lower(coalesce(p.metal_group, '')) like '%ทองแดง%'
  or lower(coalesce(p.metal_group, '')) like '%ทองเหลือง%'
  or lower(coalesce(p.metal_group, '')) like '%copper%'
  or lower(coalesce(p.metal_group, '')) like '%brass%'
`

async function main() {
  await client.connect()
  await client.query('begin')

  const purchaseCandidateResult = await client.query(`
    select count(*)::int as count
    from public.purchase_bills pb
    join public.purchase_bill_items pbi on pbi.purchase_bill_id = pb.id
    join public.products p on p.id = pbi.product_id
    where pb.transaction_mode = 'STOCK'
      and coalesce(pb.status, '') not in ('cancelled', 'Cancelled')
      and pbi.item_status = 'active'
      and pbi.product_id is not null
      and coalesce(pbi.qty, 0) > $1
      and (${ELIGIBLE_METAL_SQL})
  `, [COST_EPSILON])

  const purchaseInsertResult = await client.query(`
    insert into public.stock_cost_pool_entries (
      source_type,
      source_ref_type,
      source_ref_id,
      source_ref_no,
      source_line_id,
      date,
      branch_id,
      warehouse_id,
      product_id,
      lot_no,
      original_qty,
      unit_cost,
      original_value,
      status,
      notes,
      created_by
    )
    select
      'Purchase' as source_type,
      'PB' as source_ref_type,
      pb.id::text as source_ref_id,
      pb.doc_no as source_ref_no,
      pbi.line_no::text as source_line_id,
      pb.created_at,
      pb.branch_id,
      pb.warehouse_id,
      pbi.product_id,
      pbi.lot_no,
      pbi.qty as original_qty,
      case
        when coalesce(pbi.qty, 0) > $1 then
          case
            when coalesce(pbi.amount, 0) > 0 then pbi.amount / nullif(pbi.qty, 0)
            else coalesce(pbi.price, 0)
          end
        else 0
      end as unit_cost,
      case
        when coalesce(pbi.amount, 0) > 0 then pbi.amount
        else coalesce(pbi.qty, 0) * coalesce(pbi.price, 0)
      end as original_value,
      'Available' as status,
      coalesce(pb.note, pb.notes) as notes,
      coalesce(pb.updated_by, pb.created_by) as created_by
    from public.purchase_bills pb
    join public.purchase_bill_items pbi on pbi.purchase_bill_id = pb.id
    join public.products p on p.id = pbi.product_id
    where pb.transaction_mode = 'STOCK'
      and coalesce(pb.status, '') not in ('cancelled', 'Cancelled')
      and pbi.item_status = 'active'
      and pbi.product_id is not null
      and coalesce(pbi.qty, 0) > $1
      and (${ELIGIBLE_METAL_SQL})
      and (
        case
          when coalesce(pbi.qty, 0) > $1 then
            case
              when coalesce(pbi.amount, 0) > 0 then pbi.amount / nullif(pbi.qty, 0)
              else coalesce(pbi.price, 0)
            end
          else 0
        end
      ) > 0
      and not exists (
        select 1
        from public.stock_cost_pool_entries e
        where e.source_ref_type = 'PB'
          and e.source_ref_id = pb.id::text
          and e.source_line_id = pbi.line_no::text
      )
  `, [COST_EPSILON])

  const poCandidateResult = await client.query(`
    with po_items as (
      select
        po.id,
        po.doc_no,
        po.date,
        po.branch_id,
        po.warehouse_id,
        coalesce(po.note, po.notes) as notes,
        coalesce(po.updated_by, po.created_by) as actor,
        p.id as product_id,
        p.metal_group,
        coalesce(nullif(trim(item.value ->> 'productId'), ''), p.code, concat('line-', item.ord::text)) as source_line_id,
        coalesce(nullif(item.value ->> 'remainingQty', '')::numeric, coalesce(nullif(item.value ->> 'qty', '')::numeric, 0)) as remaining_qty,
        coalesce(nullif(item.value ->> 'unitPrice', '')::numeric, coalesce(po.unit_price, 0)) as unit_cost
      from public.po_buys po
      join lateral jsonb_array_elements(coalesce(po.items::jsonb, '[]'::jsonb)) with ordinality as item(value, ord) on true
      join public.products p on p.id = nullif(item.value ->> 'productIdInternal', '')::bigint
      where coalesce(po.status, '') not in ('Cancelled', 'cancelled')
    ),
    po_header as (
      select
        po.id,
        po.doc_no,
        po.date,
        po.branch_id,
        po.warehouse_id,
        coalesce(po.note, po.notes) as notes,
        coalesce(po.updated_by, po.created_by) as actor,
        po.product_id,
        p.metal_group,
        'header'::text as source_line_id,
        coalesce(po.remaining_qty, po.qty, 0) as remaining_qty,
        coalesce(po.unit_price, 0) as unit_cost
      from public.po_buys po
      join public.products p on p.id = po.product_id
      where coalesce(po.status, '') not in ('Cancelled', 'cancelled')
        and (po.items is null or jsonb_typeof(po.items::jsonb) <> 'array' or jsonb_array_length(po.items::jsonb) = 0)
    )
    select count(*)::int as count
    from (
      select * from po_items
      union all
      select * from po_header
    ) src
    where src.remaining_qty > $1
      and src.unit_cost > 0
      and (
        lower(coalesce(src.metal_group, '')) like '%ทองแดง%'
        or lower(coalesce(src.metal_group, '')) like '%ทองเหลือง%'
        or lower(coalesce(src.metal_group, '')) like '%copper%'
        or lower(coalesce(src.metal_group, '')) like '%brass%'
      )
  `, [COST_EPSILON])

  const poInsertResult = await client.query(`
    with po_items as (
      select
        po.id,
        po.doc_no,
        po.date,
        po.branch_id,
        po.warehouse_id,
        coalesce(po.note, po.notes) as notes,
        coalesce(po.updated_by, po.created_by) as actor,
        p.id as product_id,
        p.metal_group,
        coalesce(nullif(trim(item.value ->> 'productId'), ''), p.code, concat('line-', item.ord::text)) || '-' || (item.ord - 1)::text as source_line_id,
        coalesce(nullif(item.value ->> 'remainingQty', '')::numeric, coalesce(nullif(item.value ->> 'qty', '')::numeric, 0)) as remaining_qty,
        coalesce(nullif(item.value ->> 'unitPrice', '')::numeric, coalesce(po.unit_price, 0)) as unit_cost
      from public.po_buys po
      join lateral jsonb_array_elements(coalesce(po.items::jsonb, '[]'::jsonb)) with ordinality as item(value, ord) on true
      join public.products p on p.id = nullif(item.value ->> 'productIdInternal', '')::bigint
      where coalesce(po.status, '') not in ('Cancelled', 'cancelled')
    ),
    po_header as (
      select
        po.id,
        po.doc_no,
        po.date,
        po.branch_id,
        po.warehouse_id,
        coalesce(po.note, po.notes) as notes,
        coalesce(po.updated_by, po.created_by) as actor,
        po.product_id,
        p.metal_group,
        'header'::text as source_line_id,
        coalesce(po.remaining_qty, po.qty, 0) as remaining_qty,
        coalesce(po.unit_price, 0) as unit_cost
      from public.po_buys po
      join public.products p on p.id = po.product_id
      where coalesce(po.status, '') not in ('Cancelled', 'cancelled')
        and (po.items is null or jsonb_typeof(po.items::jsonb) <> 'array' or jsonb_array_length(po.items::jsonb) = 0)
    )
    insert into public.stock_cost_pool_entries (
      source_type,
      source_ref_type,
      source_ref_id,
      source_ref_no,
      source_line_id,
      date,
      branch_id,
      warehouse_id,
      product_id,
      original_qty,
      unit_cost,
      original_value,
      status,
      notes,
      created_by
    )
    select
      'Purchase' as source_type,
      'POB' as source_ref_type,
      src.id::text as source_ref_id,
      src.doc_no as source_ref_no,
      src.source_line_id,
      src.date,
      src.branch_id,
      src.warehouse_id,
      src.product_id,
      src.remaining_qty as original_qty,
      src.unit_cost,
      src.remaining_qty * src.unit_cost as original_value,
      'Available' as status,
      src.notes,
      src.actor
    from (
      select * from po_items
      union all
      select * from po_header
    ) src
    where src.remaining_qty > $1
      and src.unit_cost > 0
      and (
        lower(coalesce(src.metal_group, '')) like '%ทองแดง%'
        or lower(coalesce(src.metal_group, '')) like '%ทองเหลือง%'
        or lower(coalesce(src.metal_group, '')) like '%copper%'
        or lower(coalesce(src.metal_group, '')) like '%brass%'
      )
      and not exists (
        select 1
        from public.stock_cost_pool_entries e
        where e.source_ref_type = 'POB'
          and e.source_ref_id = src.id::text
          and e.source_line_id = src.source_line_id
      )
  `, [COST_EPSILON])

  const summaryResult = await client.query(`
    select
      count(*) filter (
        where exists (
          select 1
          from public.purchase_bill_items pbi
          where pbi.purchase_bill_id::text = e.source_ref_id
            and pbi.line_no::text = e.source_line_id
            and nullif(trim(coalesce(pbi.source_snapshot ->> 'poBuyId', '')), '') is not null
        )
      )::int as po_buy_entries,
      count(*) filter (
        where exists (
          select 1
          from public.purchase_bill_items pbi
          where pbi.purchase_bill_id::text = e.source_ref_id
            and pbi.line_no::text = e.source_line_id
            and nullif(trim(coalesce(pbi.source_snapshot ->> 'poBuyId', '')), '') is null
        )
      )::int as spot_buy_entries,
      count(*) filter (where e.source_ref_type = 'POB')::int as po_open_entries,
      count(*)::int as total_entries
    from public.stock_cost_pool_entries e
    where e.source_ref_type in ('PB', 'POB')
  `)

  await client.query('commit')

  console.log(JSON.stringify({
    candidateLines: {
      poBuy: poCandidateResult.rows[0]?.count ?? 0,
      purchaseBill: purchaseCandidateResult.rows[0]?.count ?? 0,
    },
    insertedEntries: {
      poBuy: poInsertResult.rowCount ?? 0,
      purchaseBill: purchaseInsertResult.rowCount ?? 0,
    },
    summary: summaryResult.rows[0] ?? null,
  }, null, 2))
}

main()
  .catch(async (error) => {
    try {
      await client.query('rollback')
    } catch {}
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await client.end().catch(() => {})
  })
