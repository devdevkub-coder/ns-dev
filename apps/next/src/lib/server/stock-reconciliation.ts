import { prisma } from '@/lib/server/prisma'

type RawIssueRow = Record<string, unknown>

type StockReconciliationIssue = {
  docNo?: string
  expected?: number
  issue: string
  netQty?: number
  productCode?: string
  refNo?: string
  refType?: string
  sourceType?: string
  status?: string
  warehouseCode?: string
}

function text(value: unknown) {
  return typeof value === 'string' ? value : value == null ? undefined : String(value)
}

function num(value: unknown) {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber()
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function issue(row: RawIssueRow): StockReconciliationIssue {
  return {
    docNo: text(row.doc_no),
    expected: 'expected' in row ? num(row.expected) : undefined,
    issue: text(row.issue) ?? 'unknown',
    netQty: 'net_qty' in row ? num(row.net_qty) : undefined,
    productCode: text(row.product_code),
    refNo: text(row.ref_no),
    refType: text(row.ref_type),
    sourceType: text(row.source_type),
    status: text(row.status),
    warehouseCode: text(row.warehouse_code),
  }
}

export async function buildStockReconciliationReport() {
  const [
    orphanLedgerRows,
    missingSourceLedgerRows,
    cancelledDocumentNetRows,
    cancelledSalesHoldRows,
    negativeBalanceRows,
    pendingSaleIntegrityRows,
  ] = await Promise.all([
    prisma.$queryRaw<RawIssueRow[]>`
      select *
      from (
        select 'orphan_ledger_row'::text as issue, sl.ref_type, coalesce(sl.ref_no, sl.ref_id) as ref_no
        from public.stock_ledger sl
        where sl.ref_type in ('PB', 'PB-CANCEL', 'PB-EDIT-REV')
          and coalesce(sl.ref_no, sl.ref_id) is not null
          and not exists (
            select 1 from public.purchase_bills pb
            where pb.doc_no in (sl.ref_no, sl.ref_id)
          )
        group by sl.ref_type, coalesce(sl.ref_no, sl.ref_id)

        union all

        select 'orphan_ledger_row'::text as issue, sl.ref_type, coalesce(sl.ref_no, sl.ref_id) as ref_no
        from public.stock_ledger sl
        where sl.ref_type in ('SB', 'SB-CANCEL')
          and coalesce(sl.ref_no, sl.ref_id) is not null
          and not exists (
            select 1 from public.sales_bills sb
            where sb.doc_no in (sl.ref_no, sl.ref_id)
          )
        group by sl.ref_type, coalesce(sl.ref_no, sl.ref_id)

        union all

        select 'orphan_ledger_row'::text as issue, sl.ref_type, coalesce(sl.ref_no, sl.ref_id) as ref_no
        from public.stock_ledger sl
        where sl.ref_type in ('PSALE', 'PSALE-CANCEL')
          and coalesce(sl.ref_no, sl.ref_id) is not null
          and not exists (
            select 1 from public.stock_issues si
            where si.doc_no in (sl.ref_no, sl.ref_id)
          )
        group by sl.ref_type, coalesce(sl.ref_no, sl.ref_id)

        union all

        select 'orphan_ledger_row'::text as issue, sl.ref_type, coalesce(sl.ref_no, sl.ref_id) as ref_no
        from public.stock_ledger sl
        where sl.ref_type in ('PI', 'PI-REV')
          and coalesce(sl.ref_no, sl.ref_id) is not null
          and not exists (
            select 1 from public.production_inputs pi
            where pi.doc_no in (sl.ref_no, sl.ref_id) or pi.reversal_doc_no in (sl.ref_no, sl.ref_id)
          )
        group by sl.ref_type, coalesce(sl.ref_no, sl.ref_id)

        union all

        select 'orphan_ledger_row'::text as issue, sl.ref_type, coalesce(sl.ref_no, sl.ref_id) as ref_no
        from public.stock_ledger sl
        where sl.ref_type in ('PO2', 'PO2-REV')
          and coalesce(sl.ref_no, sl.ref_id) is not null
          and not exists (
            select 1 from public.production_outputs po2
            where po2.doc_no in (sl.ref_no, sl.ref_id) or po2.reversal_doc_no in (sl.ref_no, sl.ref_id)
          )
        group by sl.ref_type, coalesce(sl.ref_no, sl.ref_id)
      ) issues
      order by ref_type, ref_no
      limit 500
    `,
    prisma.$queryRaw<RawIssueRow[]>`
      select *
      from (
        select 'missing_source_ledger'::text as issue, 'PB'::text as ref_type, pb.doc_no, pb.status
        from public.purchase_bills pb
        where coalesce(pb.transaction_mode, 'STOCK') = 'STOCK'
          and coalesce(pb.status, '') not in ('cancelled', 'cancelled_supplier_swap')
          and not exists (
            select 1 from public.stock_ledger sl
            where sl.ref_type in ('PB', 'PB-CANCEL', 'PB-EDIT-REV')
              and pb.doc_no in (sl.ref_no, sl.ref_id)
          )

        union all

        select 'missing_source_ledger'::text as issue, 'SB'::text as ref_type, sb.doc_no, sb.status
        from public.sales_bills sb
        where coalesce(sb.transaction_mode, 'STOCK') = 'STOCK'
          and coalesce(sb.status, '') <> 'cancelled'
          and sb.from_p_sale_id is null
          and nullif(trim(coalesce(sb.from_p_sale_no, '')), '') is null
          and not exists (
            select 1 from public.stock_ledger sl
            where sl.ref_type in ('SB', 'SB-CANCEL')
              and sb.doc_no in (sl.ref_no, sl.ref_id)
          )

        union all

        select 'missing_source_ledger'::text as issue, 'PSALE'::text as ref_type, si.doc_no, si.status
        from public.stock_issues si
        where not exists (
          select 1 from public.stock_ledger sl
          where sl.ref_type = 'PSALE'
            and si.doc_no in (sl.ref_no, sl.ref_id)
        )

        union all

        select 'missing_source_ledger'::text as issue, 'PI'::text as ref_type, pi.doc_no, pi.status
        from public.production_inputs pi
        where coalesce(pi.status, '') = 'active'
          and not exists (
            select 1 from public.stock_ledger sl
            where sl.ref_type = 'PI'
              and pi.doc_no in (sl.ref_no, sl.ref_id)
          )

        union all

        select 'missing_source_ledger'::text as issue, 'PO2'::text as ref_type, po2.doc_no, po2.status
        from public.production_outputs po2
        where coalesce(po2.status, '') = 'active'
          and not exists (
            select 1 from public.stock_ledger sl
            where sl.ref_type = 'PO2'
              and po2.doc_no in (sl.ref_no, sl.ref_id)
          )
      ) issues
      order by ref_type, doc_no
      limit 500
    `,
    prisma.$queryRaw<RawIssueRow[]>`
      with pb_net as (
        select coalesce(sl.ref_no, sl.ref_id) as doc_no, sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) as net_qty
        from public.stock_ledger sl
        where sl.ref_type in ('PB', 'PB-CANCEL', 'PB-EDIT-REV')
        group by coalesce(sl.ref_no, sl.ref_id)
      ),
      sb_net as (
        select coalesce(sl.ref_no, sl.ref_id) as doc_no, sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) as net_qty
        from public.stock_ledger sl
        where sl.ref_type in ('SB', 'SB-CANCEL')
        group by coalesce(sl.ref_no, sl.ref_id)
      ),
      psale_net as (
        select coalesce(sl.ref_no, sl.ref_id) as doc_no, sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) as net_qty
        from public.stock_ledger sl
        where sl.ref_type in ('PSALE', 'PSALE-CANCEL')
        group by coalesce(sl.ref_no, sl.ref_id)
      )
      select 'cancelled_document_net_not_zero'::text as issue, 'PB'::text as ref_type, pb.doc_no, pb.status, coalesce(pb_net.net_qty, 0) as net_qty
      from public.purchase_bills pb
      left join pb_net on pb_net.doc_no = pb.doc_no
      where coalesce(pb.transaction_mode, 'STOCK') = 'STOCK'
        and coalesce(pb.status, '') in ('cancelled', 'cancelled_supplier_swap')
        and abs(coalesce(pb_net.net_qty, 0)) > 0.000001

      union all

      select 'cancelled_document_net_not_zero'::text as issue, 'SB'::text as ref_type, sb.doc_no, sb.status, coalesce(sb_net.net_qty, 0) as net_qty
      from public.sales_bills sb
      left join sb_net on sb_net.doc_no = sb.doc_no
      where coalesce(sb.transaction_mode, 'STOCK') = 'STOCK'
        and coalesce(sb.status, '') = 'cancelled'
        and abs(coalesce(sb_net.net_qty, 0)) > 0.000001

      union all

      select 'cancelled_document_net_not_zero'::text as issue, 'PSALE'::text as ref_type, si.doc_no, si.status, coalesce(psale_net.net_qty, 0) as net_qty
      from public.stock_issues si
      left join psale_net on psale_net.doc_no = si.doc_no
      where coalesce(si.status, '') = 'cancelled'
        and abs(coalesce(psale_net.net_qty, 0)) > 0.000001
      order by ref_type, doc_no
      limit 500
    `,
    prisma.$queryRaw<RawIssueRow[]>`
      select
        'cancelled_sales_hold_still_consumed'::text as issue,
        'SB'::text as ref_type,
        sb.doc_no,
        sb.status,
        sh.consumed_by_ref_no as ref_no,
        count(*)::numeric as expected
      from public.stock_holds sh
      join public.sales_bills sb on sb.doc_no = sh.consumed_by_ref_no
      where sh.consumed_by_ref_type = 'SB'
        and sh.status = 'consumed'
        and coalesce(sb.status, '') = 'cancelled'
      group by sb.doc_no, sb.status, sh.consumed_by_ref_no
      order by sb.doc_no
      limit 500
    `,
    prisma.$queryRaw<RawIssueRow[]>`
      with ledger_balance as (
        select
          sl.branch_id,
          sl.warehouse_id,
          sl.product_id,
          sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) as ledger_qty
        from public.stock_ledger sl
        group by sl.branch_id, sl.warehouse_id, sl.product_id
      ),
      active_holds as (
        select
          sh.branch_id,
          sh.warehouse_id,
          sh.product_id,
          sum(sh.qty) as hold_qty
        from public.stock_holds sh
        where sh.status = 'active'
        group by sh.branch_id, sh.warehouse_id, sh.product_id
      ),
      combined as (
        select
          coalesce(lb.branch_id, ah.branch_id) as branch_id,
          coalesce(lb.warehouse_id, ah.warehouse_id) as warehouse_id,
          coalesce(lb.product_id, ah.product_id) as product_id,
          coalesce(lb.ledger_qty, 0) + coalesce(ah.hold_qty, 0) as net_qty
        from ledger_balance lb
        full outer join active_holds ah
          on ah.branch_id = lb.branch_id
         and ah.warehouse_id = lb.warehouse_id
         and ah.product_id = lb.product_id
      )
      select
        'negative_stock_balance'::text as issue,
        p.code as product_code,
        w.code as warehouse_code,
        combined.net_qty
      from combined
      left join public.products p on p.id = combined.product_id
      left join public.warehouses w on w.id = combined.warehouse_id
      where combined.net_qty < -0.000001
      order by combined.net_qty asc
      limit 500
    `,
    prisma.$queryRaw<RawIssueRow[]>`
      select *
      from (
        select
          'pending_sale_converted_missing_bill'::text as issue,
          'PSALE'::text as ref_type,
          si.doc_no,
          si.status,
          si.converted_to_bill_id::text as ref_no
        from public.stock_issues si
        left join public.sales_bills sb on sb.id = si.converted_to_bill_id
        where coalesce(si.status, '') = 'converted'
          and (si.converted_to_bill_id is null or sb.id is null)

        union all

        select
          'pending_sale_cancel_missing_reversal'::text as issue,
          'PSALE-CANCEL'::text as ref_type,
          si.doc_no,
          si.status,
          null::text as ref_no
        from public.stock_issues si
        where coalesce(si.status, '') = 'cancelled'
          and not exists (
            select 1
            from public.stock_ledger sl
            where sl.ref_type = 'PSALE-CANCEL'
              and si.doc_no in (sl.ref_no, sl.ref_id)
          )

        union all

        select
          'pending_sale_converted_has_duplicate_sb_stock_out'::text as issue,
          'SB'::text as ref_type,
          si.doc_no,
          si.status,
          sb.doc_no as ref_no
        from public.stock_issues si
        join public.sales_bills sb on sb.id = si.converted_to_bill_id
        where coalesce(si.status, '') = 'converted'
          and exists (
            select 1
            from public.stock_ledger sl
            where sl.ref_type = 'SB'
              and sb.doc_no in (sl.ref_no, sl.ref_id)
          )

        union all

        select
          'pending_sale_cancel_hold_still_consumed'::text as issue,
          'PSALE'::text as ref_type,
          si.doc_no,
          si.status,
          sh.hold_key as ref_no
        from public.stock_issues si
        join public.stock_holds sh
          on sh.consumed_by_ref_type = 'PSALE'
         and sh.consumed_by_ref_no = si.doc_no
        where coalesce(si.status, '') = 'cancelled'
          and sh.status = 'consumed'

        union all

        select
          'pending_sale_active_without_consumed_hold'::text as issue,
          'PSALE'::text as ref_type,
          si.doc_no,
          si.status,
          null::text as ref_no
        from public.stock_issues si
        where coalesce(si.status, '') in ('pending', 'converted')
          and not exists (
            select 1
            from public.stock_holds sh
            where sh.consumed_by_ref_type = 'PSALE'
              and sh.consumed_by_ref_no = si.doc_no
          )
      ) issues
      order by issue, doc_no
      limit 500
    `,
  ])

  const groups = {
    cancelledDocumentNet: cancelledDocumentNetRows.map(issue),
    cancelledSalesHolds: cancelledSalesHoldRows.map(issue),
    missingSourceLedger: missingSourceLedgerRows.map(issue),
    negativeStockBalance: negativeBalanceRows.map(issue),
    orphanLedger: orphanLedgerRows.map(issue),
    pendingSaleIntegrity: pendingSaleIntegrityRows.map(issue),
  }

  return {
    generatedAt: new Date().toISOString(),
    groups,
    totals: Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, rows.length])),
  }
}
