import { NextResponse } from 'next/server'
import { XLSX } from '@/lib/server/xlsx'
import { requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getDualCostingBranch } from '@/lib/server/dual-costing-branch'
import { getCostPoolAvailableQty, getCostPoolStatus } from '@/lib/server/dual-costing-allocation-contract'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

export type CostPoolRow = {
  availableQty: number
  availableValue: number
  branchName: string
  costPoolId: string
  costType: 'Production' | 'Purchase' | 'Regrade'
  counterparty: string
  date: string
  productId: string
  productName: string
  qty: number
  sourceId: string
  sourceLineId: string
  sourceNo: string
  sourceType: 'PO_Buy' | 'Production' | 'Grade Adjustment' | 'Spot_Buy' | 'Opening_Purchase' | 'Opening_PO' | 'Opening_Regrade'
  status: 'Available' | 'Fully' | 'Partial'
  totalCost: number
  unitCost: number
  usedQty: number
}

function isCostPoolEligibleProduct(metalGroup: string | null | undefined) {
  const normalized = (metalGroup ?? '').trim().toLowerCase()
  if (!normalized) return false
  return normalized.includes('ทองแดง') || normalized.includes('ทองเหลือง') || normalized.includes('copper') || normalized.includes('brass')
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function statusFromQty(qty: number, allocatedQty: number, releasedQty: number): CostPoolRow['status'] {
  const status = getCostPoolStatus(qty, allocatedQty, releasedQty)
  if (status === 'Available') return 'Available'
  if (status === 'Partially Used') return 'Partial'
  return 'Fully'
}

function readSnapshot(snapshot: unknown) {
  return snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
    ? snapshot as Record<string, unknown>
    : {}
}

function purchaseSourceMeta(snapshot: unknown, fallbackSourceNo: string) {
  const sourceSnapshot = readSnapshot(snapshot)
  const poBuyId = typeof sourceSnapshot.poBuyId === 'string' ? sourceSnapshot.poBuyId.trim() : ''
  return poBuyId
    ? { sourceNo: poBuyId, sourceType: 'PO_Buy' as const }
    : { sourceNo: fallbackSourceNo, sourceType: 'Spot_Buy' as const }
}

function sourceTypeFromPoolEntry(
  sourceType: string | null | undefined,
  sourceRefType: string | null | undefined,
  purchaseMeta?: { sourceType: 'PO_Buy' | 'Spot_Buy' } | null,
): CostPoolRow['sourceType'] | null {
  const normalizedSourceType = (sourceType ?? '').trim().toLowerCase()
  const normalizedRefType = (sourceRefType ?? '').trim().toLowerCase()
  if (normalizedRefType === 'opening_cost_pool') {
    if (normalizedSourceType === 'opening_purchase') return 'Opening_Purchase'
    if (normalizedSourceType === 'opening_po') return 'Opening_PO'
    if (normalizedSourceType === 'opening_regrade') return 'Opening_Regrade'
  }
  if (normalizedSourceType === 'purchase') return purchaseMeta?.sourceType ?? 'Spot_Buy'
  if (normalizedRefType === 'pob') return 'PO_Buy'
  if (normalizedSourceType === 'po_buy') return 'PO_Buy'
  if (normalizedSourceType === 'spot_buy') return 'Spot_Buy'
  if (normalizedSourceType.includes('regrade') || normalizedSourceType.includes('grade')) return 'Grade Adjustment'
  if (normalizedSourceType.includes('production')) return 'Production'
  if (normalizedRefType === 'po2' || normalizedRefType.includes('production')) return 'Production'
  return null
}

function costTypeFromSourceType(sourceType: CostPoolRow['sourceType']): CostPoolRow['costType'] {
  if (sourceType === 'PO_Buy' || sourceType === 'Spot_Buy' || sourceType === 'Opening_Purchase' || sourceType === 'Opening_PO') return 'Purchase'
  if (sourceType === 'Grade Adjustment' || sourceType === 'Opening_Regrade') return 'Regrade'
  return 'Production'
}

function defaultCounterparty(sourceType: CostPoolRow['sourceType']) {
  if (sourceType === 'Production') return 'Production Output'
  if (sourceType === 'Grade Adjustment') return 'Regrade / Conversion'
  if (sourceType === 'Opening_Purchase' || sourceType === 'Opening_PO' || sourceType === 'Opening_Regrade') return 'Opening Cost Pool'
  return 'Purchase Receipt'
}

function sortRows(rows: CostPoolRow[], sort: string | null) {
  const nextRows = [...rows]
  const incomingAsc = (left: CostPoolRow, right: CostPoolRow) =>
    left.date.localeCompare(right.date) ||
    left.sourceNo.localeCompare(right.sourceNo, undefined, { numeric: true }) ||
    left.costPoolId.localeCompare(right.costPoolId, undefined, { numeric: true })
  if (sort === 'LIFO') return nextRows.sort((left, right) => right.date.localeCompare(left.date) || left.sourceNo.localeCompare(right.sourceNo, undefined, { numeric: true }) || left.costPoolId.localeCompare(right.costPoolId, undefined, { numeric: true }))
  if (sort === 'Cheap') return nextRows.sort((left, right) => left.unitCost - right.unitCost || incomingAsc(left, right))
  if (sort === 'Expensive') return nextRows.sort((left, right) => right.unitCost - left.unitCost || incomingAsc(left, right))
  return nextRows.sort(incomingAsc)
}

async function buildWorkbook(rows: CostPoolRow[]) {
  const workbook = XLSX.utils.book_new()
  const dataRows = rows.map((row) => ({
    AvailableQty: row.availableQty,
    AvailableValue: row.availableValue,
    Branch: row.branchName,
    CostPoolId: row.costPoolId,
    CostType: row.costType,
    Counterparty: row.counterparty,
    Date: row.date,
    OriginalQty: row.qty,
    Product: row.productName,
    SourceNo: row.sourceNo,
    SourceType: row.sourceType,
    Status: row.status,
    TotalCost: row.totalCost,
    UnitCost: row.unitCost,
    UsedQty: row.usedQty,
  }))
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  const headers = dataRows[0] ? Object.keys(dataRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, String(header).length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Cost Pool')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

export async function getCostPoolRowsData(options: {
  showAvailableOnly?: boolean
  costType?: string | null
  sourceType?: string | null
  status?: string | null
  productId?: string | null
  from?: string | null
  to?: string | null
  q?: string | null
  sort?: string | null
}) {
  const {
    showAvailableOnly = true,
    costType,
    sourceType,
    status,
    productId,
    from,
    to,
    q,
    sort = 'FIFO',
  } = options
  const branch = await getDualCostingBranch()

  const [stockPoolEntries] = await Promise.all([
    prisma.stock_cost_pool_entries.findMany({
      select: {
        allocated_qty: true,
        branch_id: true,
        branches: {
          select: {
            name: true,
          },
        },
        date: true,
        id: true,
        original_qty: true,
        original_value: true,
        pool_key: true,
        products: {
          select: {
            code: true,
            id: true,
            metal_group: true,
            name: true,
          },
        },
        source_line_id: true,
        source_ref_id: true,
        source_ref_no: true,
        source_ref_type: true,
        source_type: true,
        status: true,
        released_qty: true,
        unit_cost: true,
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 5000,
      where: {
        branch_id: branch.id,
        NOT: { status: { in: ['Cancelled', 'cancelled', 'Reversed', 'reversed', 'Void', 'void'] } },
      },
    }),
  ])

  const rows: CostPoolRow[] = []
  const purchaseEntryRefs = stockPoolEntries
    .filter((entry) => entry.source_ref_type === 'PB' && entry.source_ref_id && entry.source_line_id)
    .map((entry) => ({
      purchaseBillId: BigInt(entry.source_ref_id as string),
      sourceLineId: entry.source_line_id as string,
    }))
  const purchaseBillIds = [...new Set(purchaseEntryRefs.map((entry) => entry.purchaseBillId))]
  const purchaseBillItems = purchaseBillIds.length > 0
    ? await prisma.purchase_bill_items.findMany({
      select: {
        line_no: true,
        purchase_bill_id: true,
        source_snapshot: true,
      },
      where: {
        purchase_bill_id: { in: purchaseBillIds },
      },
    })
    : []
  const purchaseLineMetas = purchaseBillItems.map((item) => ({
    key: `${item.purchase_bill_id.toString()}:${String(item.line_no ?? '')}`,
    meta: purchaseSourceMeta(item.source_snapshot, ''),
  }))
  const purchaseMetaByKey = new Map(
    purchaseLineMetas.map((item) => [item.key, item.meta] as const),
  )
  const poBuyDocNos = [...new Set(
    [
      ...purchaseLineMetas.map((item) => item.meta.sourceNo.trim()),
      ...stockPoolEntries.map((entry) => entry.source_ref_no?.trim() ?? ''),
    ]
      .filter((docNo) => /^POB/i.test(docNo))
      .filter(Boolean),
  )]
  const purchaseBillDocNos = [...new Set(
    stockPoolEntries
      .filter((entry) => entry.source_ref_type === 'PB' && entry.source_ref_no?.trim())
      .map((entry) => entry.source_ref_no!.trim()),
  )]
  const purchaseBillRows = purchaseBillDocNos.length > 0
    ? await prisma.purchase_bills.findMany({
      select: {
        doc_no: true,
        suppliers: {
          select: { name: true },
        },
      },
      where: {
        doc_no: { in: purchaseBillDocNos },
      },
    })
    : []
  const poBuyRows = poBuyDocNos.length > 0
    ? await prisma.po_buys.findMany({
      select: {
        doc_no: true,
        suppliers: {
          select: { name: true },
        },
      },
      where: {
        doc_no: { in: poBuyDocNos },
      },
    })
    : []
  const purchaseBillSupplierByDocNo = new Map(
    purchaseBillRows.map((row) => [row.doc_no?.trim() || '', row.suppliers?.name?.trim() || ''] as const),
  )
  const poBuySupplierByDocNo = new Map(
    poBuyRows.map((row) => [row.doc_no?.trim() || '', row.suppliers?.name?.trim() || ''] as const),
  )

  stockPoolEntries.forEach((entry) => {
    const purchaseMeta = entry.source_ref_type === 'PB' && entry.source_ref_id && entry.source_line_id
      ? purchaseMetaByKey.get(`${entry.source_ref_id}:${entry.source_line_id}`) ?? null
      : null
    const sourceTypeValue = sourceTypeFromPoolEntry(entry.source_type, entry.source_ref_type, purchaseMeta)
    if (!sourceTypeValue) return
    if (!isCostPoolEligibleProduct(entry.products.metal_group)) return
    const qty = jsonNumber(entry.original_qty)
    const allocatedQty = Math.max(0, jsonNumber(entry.allocated_qty))
    const releasedQty = Math.max(0, jsonNumber(entry.released_qty))
    const usedQty = allocatedQty + releasedQty
    const unitCost = jsonNumber(entry.unit_cost)
    if (qty <= 0 || unitCost <= 0) return
    const productCode = requireBusinessCode(entry.products.code, `สินค้า ${entry.products.id}`)
    const availableQty = getCostPoolAvailableQty(qty, allocatedQty, releasedQty)
    const costTypeValue = costTypeFromSourceType(sourceTypeValue)
    const resolvedSourceNo = purchaseMeta?.sourceNo || entry.source_ref_no || entry.pool_key
    const purchaseBillSupplier = (entry.source_ref_no ? purchaseBillSupplierByDocNo.get(entry.source_ref_no.trim()) : '')
      || ''
    const poBuySupplier = resolvedSourceNo ? poBuySupplierByDocNo.get(resolvedSourceNo.trim()) || '' : ''
    const counterparty = sourceTypeValue === 'PO_Buy' || sourceTypeValue === 'Spot_Buy'
      ? poBuySupplier || purchaseBillSupplier || defaultCounterparty(sourceTypeValue)
      : defaultCounterparty(sourceTypeValue)
    rows.push({
      availableQty,
      availableValue: availableQty * unitCost,
      branchName: entry.branches?.name ?? '-',
      costPoolId: entry.pool_key,
      costType: costTypeValue,
      counterparty,
      date: toDateOnly(entry.date),
      productId: productCode,
      productName: entry.products.name,
      qty,
      sourceId: entry.source_ref_id ?? stringifyBusinessValue(entry.id),
      sourceLineId: entry.source_line_id ?? stringifyBusinessValue(entry.id),
      sourceNo: resolvedSourceNo,
      sourceType: sourceTypeValue,
      status: statusFromQty(qty, allocatedQty, releasedQty),
      totalCost: jsonNumber(entry.original_value) || qty * unitCost,
      unitCost,
      usedQty,
    })
  })

  const withUsage = rows
    .filter((row) => !showAvailableOnly || row.availableQty > 0)
    .filter((row) => !costType || costType === 'all' || row.costType === costType)
    .filter((row) => !sourceType || sourceType === 'all' || row.sourceType === sourceType)
    .filter((row) => !status || status === 'all' || row.status === status)
    .filter((row) => !productId || productId === 'all' || row.productId === productId)
    .filter((row) => !from || row.date >= from)
    .filter((row) => !to || row.date <= to)
    .filter((row) => !q || `${row.sourceNo} ${row.counterparty} ${row.productName} ${row.sourceType} ${row.costType} ${row.status}`.toLowerCase().includes(q))

  const filteredRows = sortRows(withUsage, sort)

  const summaryByCostType = ['Purchase', 'Production', 'Regrade'].map((type) => {
    const costRows = withUsage.filter((row) => row.costType === type)
    return {
      availableQty: costRows.reduce((sum, row) => sum + row.availableQty, 0),
      availableValue: costRows.reduce((sum, row) => sum + row.availableValue, 0),
      count: costRows.length,
      costType: type,
    }
  })

  return {
    rows: filteredRows,
    summaryByCostType,
    rowsWithUsage: rows,
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const costType = url.searchParams.get('costType')
    const productId = url.searchParams.get('productId')
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const showAvailableOnly = url.searchParams.get('availableOnly') !== 'false'
    const sort = url.searchParams.get('sort') ?? 'FIFO'
    const sourceType = url.searchParams.get('sourceType')
    const status = url.searchParams.get('status')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const { rows: filteredRows, summaryByCostType, rowsWithUsage } = await getCostPoolRowsData({
      showAvailableOnly,
      costType,
      sourceType,
      status,
      productId,
      from,
      to,
      q,
      sort,
    })

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(filteredRows), 'cost_pool.xlsx')
    }

    return NextResponse.json({
      filters: {
        costTypes: Array.from(new Set(rowsWithUsage.map((row) => row.costType))).sort(),
        products: Array.from(new Map(rowsWithUsage.filter((row) => row.productId).map((row) => [row.productId, { id: row.productId, name: row.productName }])).values()).sort((left, right) => left.name.localeCompare(right.name)),
        sourceTypes: Array.from(new Set(rowsWithUsage.map((row) => row.sourceType))).sort(),
        statuses: Array.from(new Set(rowsWithUsage.map((row) => row.status))).sort(),
      },
      rows: filteredRows,
      summary: {
        availableQty: filteredRows.reduce((sum, row) => sum + row.availableQty, 0),
        availableValue: filteredRows.reduce((sum, row) => sum + row.availableValue, 0),
        originalQty: filteredRows.reduce((sum, row) => sum + row.qty, 0),
        originalValue: filteredRows.reduce((sum, row) => sum + row.totalCost, 0),
        rows: filteredRows.length,
        usedQty: filteredRows.reduce((sum, row) => sum + row.usedQty, 0),
      },
      summaryByCostType,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Cost Pool ไม่ได้', 500)
  }
}
