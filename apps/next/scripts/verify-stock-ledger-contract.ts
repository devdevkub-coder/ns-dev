import { prisma } from '../src/lib/server/prisma'
import { buildProductionReconciliationReport } from '../src/lib/server/production-reconciliation'
import { buildStockReconciliationReport } from '../src/lib/server/stock-reconciliation'

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

function assertNoProductionIssues(report: Awaited<ReturnType<typeof buildProductionReconciliationReport>>) {
  if (!report.summary.hasIssues) return
  const preview = report.issues
    .slice(0, 10)
    .map((row) => `${row.issue}:${row.refType}:${row.docNo || '-'}:${row.orderDocNo || '-'}`)
    .join(', ')
  throw new Error(`production reconciliation failed with ${report.summary.issueCount} issue(s): ${preview}`)
}

async function main() {
  const [report, productionReport] = await Promise.all([
    buildStockReconciliationReport(),
    buildProductionReconciliationReport(),
  ])
  const reportIssues = Object.entries(report.groups).flatMap(([group, rows]) => rows.map((row) => ({
    doc_no: row.docNo ?? row.refNo ?? null,
    issue: `${group}.${row.issue}`,
    ref_no: row.refNo ?? null,
  })))
  assertNoRows('stock reconciliation report', reportIssues)
  assertNoProductionIssues(productionReport)

  const duplicateOrMissingReversals = await prisma.$queryRaw<IssueRow[]>`
    with psale_counts as (
      select
        si.doc_no,
        count(sl.*) filter (where sl.ref_type = 'PSALE') as psale_rows,
        count(sl.*) filter (where sl.ref_type = 'PSALE-CANCEL') as reversal_rows,
        sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) filter (where sl.ref_type in ('PSALE', 'PSALE-CANCEL')) as net_qty
      from public.stock_issues si
      left join public.stock_ledger sl
        on si.doc_no in (sl.ref_no, sl.ref_id)
       and sl.ref_type in ('PSALE', 'PSALE-CANCEL')
      group by si.doc_no, si.status
      having coalesce(si.status, '') = 'cancelled'
    )
    select
      'cancelled_psale_reversal_count_mismatch'::text as issue,
      doc_no,
      null::text as ref_no
    from psale_counts
    where psale_rows <> reversal_rows
       or abs(coalesce(net_qty, 0)) > 0.000001
    order by doc_no
    limit 100
  `
  assertNoRows('cancelled PSALE reversal parity', duplicateOrMissingReversals)

  const duplicateSbStockOutFromPendingSale = await prisma.$queryRaw<IssueRow[]>`
    select
      'sb_from_psale_has_sb_stock_ledger'::text as issue,
      sb.doc_no,
      si.doc_no as ref_no
    from public.sales_bills sb
    join public.stock_issues si
      on si.converted_to_bill_id = sb.id
      or si.id = sb.from_p_sale_id
      or si.doc_no = sb.from_p_sale_no
    where coalesce(sb.transaction_mode, 'STOCK') = 'STOCK'
      and exists (
        select 1
        from public.stock_ledger sl
        where sl.ref_type in ('SB', 'SB-CANCEL')
          and sb.doc_no in (sl.ref_no, sl.ref_id)
      )
    order by sb.doc_no
    limit 100
  `
  assertNoRows('SB-from-PSALE duplicate stock ledger', duplicateSbStockOutFromPendingSale)

  const consumedHoldsAfterReversal = await prisma.$queryRaw<IssueRow[]>`
    select
      'cancelled_psale_hold_still_consumed'::text as issue,
      si.doc_no,
      sh.hold_key as ref_no
    from public.stock_issues si
    join public.stock_holds sh
      on sh.consumed_by_ref_type = 'PSALE'
     and sh.consumed_by_ref_no = si.doc_no
    where coalesce(si.status, '') = 'cancelled'
      and sh.status = 'consumed'
    order by si.doc_no
    limit 100
  `
  assertNoRows('cancelled PSALE consumed hold cleanup', consumedHoldsAfterReversal)

  const productionReversalParity = await prisma.$queryRaw<IssueRow[]>`
    with input_reversal_counts as (
      select
        pi.doc_no,
        pi.reversal_doc_no,
        count(sl.*) filter (where sl.ref_type = 'PI') as source_rows,
        count(rev.*) filter (where rev.ref_type = 'PI-REV') as reversal_rows,
        sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) filter (where sl.ref_type = 'PI') as source_net_qty,
        sum(coalesce(rev.qty_in, 0) - coalesce(rev.qty_out, 0)) filter (where rev.ref_type = 'PI-REV') as reversal_net_qty
      from public.production_inputs pi
      left join public.stock_ledger sl
        on pi.doc_no in (sl.ref_no, sl.ref_id)
       and sl.ref_type = 'PI'
      left join public.stock_ledger rev
        on pi.reversal_doc_no in (rev.ref_no, rev.ref_id)
       and rev.ref_type = 'PI-REV'
      where coalesce(pi.status, '') = 'reversed'
      group by pi.doc_no, pi.reversal_doc_no
    ),
    output_reversal_counts as (
      select
        po.doc_no,
        po.reversal_doc_no,
        count(sl.*) filter (where sl.ref_type = 'PO2') as source_rows,
        count(rev.*) filter (where rev.ref_type = 'PO2-REV') as reversal_rows,
        sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) filter (where sl.ref_type = 'PO2') as source_net_qty,
        sum(coalesce(rev.qty_in, 0) - coalesce(rev.qty_out, 0)) filter (where rev.ref_type = 'PO2-REV') as reversal_net_qty
      from public.production_outputs po
      left join public.stock_ledger sl
        on po.doc_no in (sl.ref_no, sl.ref_id)
       and sl.ref_type = 'PO2'
      left join public.stock_ledger rev
        on po.reversal_doc_no in (rev.ref_no, rev.ref_id)
       and rev.ref_type = 'PO2-REV'
      where coalesce(po.status, '') = 'reversed'
      group by po.doc_no, po.reversal_doc_no
    )
    select
      'reversed_pi_reversal_missing_or_unbalanced'::text as issue,
      doc_no,
      reversal_doc_no as ref_no
    from input_reversal_counts
    where reversal_doc_no is null
       or reversal_rows = 0
       or abs(coalesce(source_net_qty, 0) + coalesce(reversal_net_qty, 0)) > 0.000001

    union all

    select
      'reversed_po2_reversal_missing_or_unbalanced'::text as issue,
      doc_no,
      reversal_doc_no as ref_no
    from output_reversal_counts
    where reversal_doc_no is null
       or reversal_rows = 0
       or abs(coalesce(source_net_qty, 0) + coalesce(reversal_net_qty, 0)) > 0.000001

    order by issue, doc_no
    limit 100
  `
  assertNoRows('production reversal parity', productionReversalParity)

  const duplicateProductionReversalDocNo = await prisma.$queryRaw<IssueRow[]>`
    select
      'duplicate_pi_reversal_doc_no'::text as issue,
      reversal_doc_no as doc_no,
      string_agg(distinct doc_no, ', ' order by doc_no)::text as ref_no
    from public.production_inputs
    where reversal_doc_no is not null
    group by reversal_doc_no
    having count(distinct doc_no) > 1

    union all

    select
      'duplicate_po2_reversal_doc_no'::text as issue,
      reversal_doc_no as doc_no,
      string_agg(distinct doc_no, ', ' order by doc_no)::text as ref_no
    from public.production_outputs
    where reversal_doc_no is not null
    group by reversal_doc_no
    having count(distinct doc_no) > 1

    order by issue, doc_no
    limit 100
  `
  assertNoRows('production reversal doc number uniqueness', duplicateProductionReversalDocNo)

  console.log(JSON.stringify({
    generatedAt: report.generatedAt,
    ok: true,
    production: productionReport.summary,
    totals: report.totals,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
