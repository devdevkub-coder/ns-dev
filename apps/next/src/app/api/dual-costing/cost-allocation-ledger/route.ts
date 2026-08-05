import { NextResponse } from 'next/server'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { canAccessBranchId, getAllowedBranchIds } from '@/lib/server/branch-scope'
import { getDualCostingBranch } from '@/lib/server/dual-costing-branch'
import { buildDualCostingManagement } from '@/lib/server/dual-costing-management'

export const runtime = 'nodejs'

type LedgerExportRow = Awaited<ReturnType<typeof buildDualCostingManagement>>['ledgerRows'][number]

const LEDGER_PAGE_SIZES = [10, 25] as const
type LedgerPageSize = (typeof LEDGER_PAGE_SIZES)[number]
type LedgerSortKey = Exclude<keyof LedgerExportRow, 'canReallocate' | 'canReverse' | 'costPoolLotNo' | 'dealId' | 'id' | 'productId' | 'sourceNo' | 'targetLineNo' | 'targetRefId' | 'targetSourceType'>
type LedgerSortDirection = 'asc' | 'desc'

const LEDGER_SORT_KEYS = new Set<LedgerSortKey>([
  'allocatedAt',
  'allocatedBy',
  'allocatedQty',
  'allocatedRevenue',
  'costPerKg',
  'costPoolNo',
  'date',
  'gpPct',
  'grossProfit',
  'matchId',
  'productCategory',
  'productName',
  'saleDocNo',
  'saleQty',
  'status',
  'targetType',
  'totalCost',
])

type LedgerMatchGroup = {
  matchId: string
  rows: LedgerExportRow[]
}

function compareLedgerSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

function groupLedgerRows(rows: LedgerExportRow[]) {
  const grouped = new Map<string, LedgerExportRow[]>()
  rows.forEach((row) => {
    const current = grouped.get(row.matchId) ?? []
    current.push(row)
    grouped.set(row.matchId, current)
  })
  return Array.from(grouped.entries()).map(([matchId, matchRows]) => ({ matchId, rows: matchRows }))
}

function getLedgerGroupSortValue(group: LedgerMatchGroup, key: LedgerSortKey): string | number {
  const first = group.rows[0]
  const totalCost = group.rows.reduce((sum, row) => sum + row.totalCost, 0)
  const allocatedQty = group.rows.reduce((sum, row) => sum + row.allocatedQty, 0)
  const allocatedRevenue = group.rows.reduce((sum, row) => sum + row.allocatedRevenue, 0)
  const grossProfit = group.rows.reduce((sum, row) => sum + row.grossProfit, 0)

  switch (key) {
    case 'allocatedQty': return allocatedQty
    case 'allocatedRevenue': return allocatedRevenue
    case 'costPerKg': return allocatedQty > 0 ? totalCost / allocatedQty : 0
    case 'grossProfit': return grossProfit
    case 'gpPct': return allocatedRevenue > 0 ? (grossProfit / allocatedRevenue) * 100 : 0
    case 'saleQty': return group.rows.reduce((sum, row) => sum + row.saleQty, 0)
    case 'totalCost': return totalCost
    case 'allocatedAt': return first.allocatedAt
    case 'allocatedBy': return first.allocatedBy
    case 'costPoolNo': return first.costPoolNo
    case 'date': return first.date
    case 'matchId': return group.matchId
    case 'productCategory': return first.productCategory
    case 'productName': return first.productName
    case 'saleDocNo': return first.saleDocNo
    case 'status': return first.status
    case 'targetType': return first.targetType
  }
}

function sortLedgerGroups(groups: LedgerMatchGroup[], sortBy: LedgerSortKey | null, sortDir: LedgerSortDirection) {
  if (!sortBy) return groups
  return [...groups].sort((left, right) => {
    const result = compareLedgerSortValues(getLedgerGroupSortValue(left, sortBy), getLedgerGroupSortValue(right, sortBy))
    return sortDir === 'asc' ? result : -result
  })
}

function parsePositiveInteger(value: string | null, fallback: number) {
  if (value == null || value === '') return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null
}

function parsePageSize(value: string | null): LedgerPageSize | null {
  if (value == null || value === '') return 25
  const parsed = Number(value)
  return LEDGER_PAGE_SIZES.includes(parsed as LedgerPageSize) ? parsed as LedgerPageSize : null
}

function filterLedgerRows(rows: LedgerExportRow[], filters: {
  category: string | null
  from: string | null
  q: string | undefined
  status: string | null
  targetType: string | null
  to: string | null
}) {
  const { category, from, q, status, targetType, to } = filters

  const filteredRows = rows
    .filter((row) => !from || row.date >= from)
    .filter((row) => !to || row.date <= to)
    .filter((row) => !status || status === 'all' || row.status === status)
    .filter((row) => !category || category === 'all' || row.productCategory === category)
    .filter((row) => !targetType || targetType === 'all' || row.targetType === targetType)

  if (!q) return filteredRows

  const matchingMatchIds = new Set(
    filteredRows
      .filter((row) => `${row.matchId} ${row.saleDocNo} ${row.sourceNo} ${row.productId} ${row.productName}`.toLowerCase().includes(q))
      .map((row) => row.matchId),
  )

  return filteredRows.filter((row) => matchingMatchIds.has(row.matchId))
}

async function buildWorkbook(rows: LedgerExportRow[]) {
  const workbook = XLSX.utils.book_new()
  const dataRows = rows.map((row) => ({
    MatchId: row.matchId,
    Type: row.targetType,
    SaleDoc: row.saleDocNo,
    Product: row.productName,
    Category: row.productCategory,
    SaleQty: row.saleQty,
    AllocatedQty: row.allocatedQty,
    CostPool: row.costPoolNo,
    CostPerKg: row.costPerKg,
    TotalCost: row.totalCost,
    Revenue: row.allocatedRevenue,
    GrossProfit: row.grossProfit,
    GpPct: row.gpPct,
    AllocatedBy: row.allocatedBy,
    AllocatedAt: row.allocatedAt,
    Status: row.status,
  }))
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  const headers = dataRows[0] ? Object.keys(dataRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, String(header).length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Allocation Ledger')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const branch = await getDualCostingBranch()
    const allowedBranchIds = await getAllowedBranchIds(context)
    if (!canAccessBranchId(allowedBranchIds, branch.id, { allowNull: false })) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงสมุดรายวันจัดสรรต้นทุนของสาขานี้' }, { status: 403 })
    }

    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const from = url.searchParams.get('from')
    const format = url.searchParams.get('format')
    const to = url.searchParams.get('to')
    const status = url.searchParams.get('status')
    const category = url.searchParams.get('category')
    const targetType = url.searchParams.get('targetType')
    const parsedPage = parsePositiveInteger(url.searchParams.get('page'), 1)
    const parsedPageSize = parsePageSize(url.searchParams.get('pageSize'))
    const rawSortBy = url.searchParams.get('sortBy')
    const rawSortDir = url.searchParams.get('sortDir')
    const sortBy = rawSortBy ? rawSortBy as LedgerSortKey : null
    const sortDir = (rawSortDir || 'asc') as LedgerSortDirection

    if (parsedPage == null || parsedPageSize == null || (rawSortBy != null && (sortBy == null || !LEDGER_SORT_KEYS.has(sortBy))) || !['asc', 'desc'].includes(sortDir)) {
      return NextResponse.json(
        { error: 'พารามิเตอร์การแบ่งหน้าหรือเรียงลำดับไม่ถูกต้อง' },
        { headers: { 'Cache-Control': 'private, no-store' }, status: 400 },
      )
    }

    const payload = await buildDualCostingManagement()
    const rows = filterLedgerRows(payload.ledgerRows, { category, from, q, status, targetType, to })

    if (format === 'xlsx') {
      return xlsxResponse(await buildWorkbook(rows), 'cost_allocation_ledger.xlsx')
    }

    const activeRows = rows.filter((row) => row.status === 'approved')
    const revenue = activeRows.reduce((sum, row) => sum + row.allocatedRevenue, 0)
    const cost = activeRows.reduce((sum, row) => sum + row.totalCost, 0)
    const gp = revenue - cost
    const sortedGroups = sortLedgerGroups(groupLedgerRows(rows), sortBy, sortDir)
    const totalGroups = sortedGroups.length
    const totalPages = Math.max(1, Math.ceil(totalGroups / parsedPageSize))
    const safePage = Math.min(parsedPage, totalPages)
    const pageRows = sortedGroups
      .slice((safePage - 1) * parsedPageSize, safePage * parsedPageSize)
      .flatMap((group) => group.rows)

    return NextResponse.json({
      filters: {
        categories: Array.from(new Set(payload.ledgerRows.map((row) => row.productCategory))).sort(),
        statuses: ['approved', 'reversed'],
        targetTypes: Array.from(new Set(payload.ledgerRows.map((row) => row.targetType))).sort(),
      },
      rows: pageRows,
      pagination: {
        page: safePage,
        pageSize: parsedPageSize,
        totalGroups,
        totalPages,
        totalRows: rows.length,
      },
      summary: {
        active: activeRows.length,
        cost,
        gp,
        gpPct: revenue > 0 ? (gp / revenue) * 100 : 0,
        poCount: activeRows.filter((row) => row.targetType === 'PO_SELL').length,
        revenue,
        reversed: rows.length - activeRows.length,
        rows: rows.length,
        spotCount: activeRows.filter((row) => row.targetType === 'SPOT_SELL').length,
        totalQty: activeRows.reduce((sum, row) => sum + row.allocatedQty, 0),
      },
      writeDeferred: false,
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดสมุดรายวันจัดสรรต้นทุนไม่ได้', 500)
  }
}
