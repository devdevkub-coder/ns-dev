import nextEnv from '@next/env'

const projectDir = new URL('..', import.meta.url).pathname
const { loadEnvConfig } = nextEnv
loadEnvConfig(projectDir)

type IssueRow = {
  doc_no: string | null
  issue: string
  ref_no: string | null
}

function assertNoRows(label: string, rows: IssueRow[]) {
  if (rows.length === 0) return
  const preview = rows.slice(0, 10).map((row) => `${row.issue}:${row.doc_no ?? '-'}:${row.ref_no ?? '-'}`).join(', ')
  throw new Error(`${label} failed with ${rows.length} issue(s): ${preview}`)
}

async function main() {
  const { prisma } = await import('../src/lib/server/prisma')

  const requiredTables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ('stock_transfers', 'stock_transfer_items')
    order by table_name
  `
  const tableNames = new Set(requiredTables.map((row) => row.table_name))
  for (const tableName of ['stock_transfer_items', 'stock_transfers']) {
    if (!tableNames.has(tableName)) throw new Error(`missing table ${tableName}`)
  }

  const requiredIndexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'idx_stock_transfers_date_doc',
        'idx_stock_transfers_doc_no_pattern',
        'idx_stock_transfers_status_date_doc',
        'idx_stock_transfers_total_qty',
        'idx_stock_transfer_items_transfer_product',
        'idx_stock_ledger_st_ref',
        'idx_stock_ledger_st_source_lookup'
      )
    order by indexname
  `
  const indexNames = new Set(requiredIndexes.map((row) => row.indexname))
  for (const indexName of [
    'idx_stock_transfers_date_doc',
    'idx_stock_transfers_doc_no_pattern',
    'idx_stock_transfers_status_date_doc',
    'idx_stock_transfers_total_qty',
    'idx_stock_transfer_items_transfer_product',
    'idx_stock_ledger_st_ref',
    'idx_stock_ledger_st_source_lookup',
  ]) {
    if (!indexNames.has(indexName)) throw new Error(`missing index ${indexName}`)
  }

  const invalidStatuses = await prisma.$queryRaw<IssueRow[]>`
    select 'invalid_stock_transfer_status'::text as issue, doc_no, null::text as ref_no
    from public.stock_transfers
    where status not in ('draft', 'posted', 'cancelled')
    order by doc_no
    limit 100
  `
  assertNoRows('stock transfer statuses', invalidStatuses)

  const draftLedgerRows = await prisma.$queryRaw<IssueRow[]>`
    select 'draft_has_stock_ledger'::text as issue, st.doc_no, sl.ref_no
    from public.stock_transfers st
    join public.stock_ledger sl
      on sl.ref_type = 'ST'
     and (sl.ref_no = st.doc_no or sl.ref_id = 'ST-' || st.id::text)
    where st.status = 'draft'
    order by st.doc_no
    limit 100
  `
  assertNoRows('draft stock transfer ledger absence', draftLedgerRows)

  const postedWithoutLedger = await prisma.$queryRaw<IssueRow[]>`
    select 'posted_missing_stock_ledger'::text as issue, st.doc_no, null::text as ref_no
    from public.stock_transfers st
    where st.status = 'posted'
      and not exists (
        select 1
        from public.stock_ledger sl
        where sl.ref_type = 'ST'
          and (sl.ref_no = st.doc_no or sl.ref_id = 'ST-' || st.id::text)
      )
    order by st.doc_no
    limit 100
  `
  assertNoRows('posted stock transfer ledger presence', postedWithoutLedger)

  const postedLedgerParity = await prisma.$queryRaw<IssueRow[]>`
    with transfer_totals as (
      select
        st.doc_no,
        st.id,
        st.total_qty,
        st.total_value,
        coalesce(sum(sl.qty_out) filter (where sl.ref_type = 'ST'), 0) as ledger_qty_out,
        coalesce(sum(sl.qty_in) filter (where sl.ref_type = 'ST'), 0) as ledger_qty_in,
        coalesce(sum(sl.value_out) filter (where sl.ref_type = 'ST'), 0) as ledger_value_out,
        coalesce(sum(sl.value_in) filter (where sl.ref_type = 'ST'), 0) as ledger_value_in
      from public.stock_transfers st
      left join public.stock_ledger sl
        on sl.ref_type = 'ST'
       and (sl.ref_no = st.doc_no or sl.ref_id = 'ST-' || st.id::text)
      where st.status = 'posted'
      group by st.doc_no, st.id, st.total_qty, st.total_value
    )
    select 'posted_ledger_total_mismatch'::text as issue, doc_no, null::text as ref_no
    from transfer_totals
    where abs(coalesce(total_qty, 0) - ledger_qty_out) > 0.000001
       or abs(coalesce(total_qty, 0) - ledger_qty_in) > 0.000001
       or abs(coalesce(total_value, 0) - ledger_value_out) > 0.000001
       or abs(coalesce(total_value, 0) - ledger_value_in) > 0.000001
    order by doc_no
    limit 100
  `
  assertNoRows('posted stock transfer ledger totals', postedLedgerParity)

  const itemTotalMismatch = await prisma.$queryRaw<IssueRow[]>`
    with item_totals as (
      select
        st.doc_no,
        coalesce(sum(sti.qty), 0) as item_qty,
        coalesce(sum(sti.line_value), 0) as item_value,
        st.total_qty,
        st.total_value
      from public.stock_transfers st
      left join public.stock_transfer_items sti on sti.transfer_id = st.id
      group by st.doc_no, st.total_qty, st.total_value
    )
    select 'stock_transfer_item_total_mismatch'::text as issue, doc_no, null::text as ref_no
    from item_totals
    where abs(coalesce(total_qty, 0) - item_qty) > 0.000001
       or abs(coalesce(total_value, 0) - item_value) > 0.000001
    order by doc_no
    limit 100
  `
  assertNoRows('stock transfer item totals', itemTotalMismatch)

  const zeroCostPostedLedger = await prisma.$queryRaw<IssueRow[]>`
    select 'posted_st_zero_unit_cost_or_value'::text as issue, ref_no as doc_no, ref_id as ref_no
    from public.stock_ledger
    where ref_type = 'ST'
      and (coalesce(unit_cost, 0) <= 0 or coalesce(value_in, 0) + coalesce(value_out, 0) <= 0)
    order by ref_no
    limit 100
  `
  assertNoRows('posted ST cost/value', zeroCostPostedLedger)

  console.log(JSON.stringify({
    checked: {
      indexes: requiredIndexes.length,
      tables: requiredTables.length,
    },
    ok: true,
  }))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    const { prisma } = await import('../src/lib/server/prisma')
    await prisma.$disconnect()
  })
