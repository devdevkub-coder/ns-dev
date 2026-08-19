import { NextResponse } from 'next/server'
import { XLSX } from '@/lib/server/xlsx'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { getDualCostingBranch } from '@/lib/server/dual-costing-branch'
import { prisma } from '@/lib/server/prisma'
import { isTradingMatchingAllocationFact } from '@/lib/server/trading-matching'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type DealMarginRow = {
  allocationNo: string
  avgCost: number
  channel: string
  customer: string
  date: string
  docNo: string
  id: string
  margin: number
  marginPct: number
  matchedCost: number
  matchedQty: number
  product: string
  sellQty: number
  statusMatch: 'Fully' | 'None' | 'Partial'
  totalRevenue: number
  unitPrice: number
}

async function buildWorkbook(rows: DealMarginRow[]) {
  const workbook = XLSX.utils.book_new()
  const dataRows = rows.map((row) => ({
    AvgCost: row.avgCost,
    Channel: row.channel,
    Customer: row.customer,
    Date: row.date,
    DealNo: row.docNo,
    Margin: row.margin,
    MarginPct: row.marginPct,
    MatchedCost: row.matchedCost,
    MatchedQty: row.matchedQty,
    Product: row.product,
    Revenue: row.totalRevenue,
    SellQty: row.sellQty,
    StatusMatch: row.statusMatch,
    UnitPrice: row.unitPrice,
  }))
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  const headers = dataRows[0] ? Object.keys(dataRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, String(header).length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Deal Margin')
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

function statusMatch(sellQty: number, matchedQty: number): DealMarginRow['statusMatch'] {
  if (matchedQty <= 0) return 'None'
  if (sellQty > 0 && matchedQty >= sellQty - 0.001) return 'Fully'
  return 'Partial'
}

function isDualCostingGroup(group: string | null | undefined) {
  const normalized = (group ?? '').trim().toLowerCase()
  return normalized.includes('ทองแดง')
    || normalized.includes('ทองเหลือง')
    || normalized.includes('copper')
    || normalized.includes('brass')
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const channel = url.searchParams.get('channel')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const branch = await getDualCostingBranch()
    const salesBills = await prisma.sales_bills.findMany({
      include: {
        customers: true,
        sales_bill_lines: {
          include: { products: true },
          orderBy: { line_no: 'asc' },
          where: { status: 'active' },
        },
        sales_channels: true,
      },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 10000,
      where: {
        branch_id: branch.id,
        OR: [
          { transaction_mode: 'TRADING' },
          { po_sell_id: { not: null } },
          { trading_from_purchase_id: { not: null } },
        ],
        NOT: { status: { in: ['cancelled', 'Cancelled', 'canceled', 'Canceled'] } },
      },
    })

    const salesBillIds = salesBills.map((bill) => bill.id)
    const salesDocNos = salesBills.map((bill) => bill.doc_no)
    const allocations = salesBillIds.length
      ? await prisma.trading_allocation_facts.findMany({
        where: {
          status: 'active',
          OR: [
            { sales_bill_id: { in: salesBillIds } },
            { sales_doc_no: { in: salesDocNos } },
          ],
        },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        take: 10000,
      })
      : []

    const allocationByLine = new Map<string, { allocationNo: string; matchedCost: number; matchedQty: number }>()
    allocations.forEach((allocation) => {
      if (!isTradingMatchingAllocationFact(allocation)) return
      if (allocation.sales_line_no == null) return
      const billKey = allocation.sales_bill_id?.toString() ?? allocation.sales_doc_no ?? ''
      if (!billKey) return
      const key = `${billKey}:${allocation.sales_line_no}`
      const current = allocationByLine.get(key) ?? { allocationNo: allocation.allocation_no, matchedCost: 0, matchedQty: 0 }
      current.matchedCost += toNumber(allocation.matched_cogs)
      current.matchedQty += toNumber(allocation.qty)
      allocationByLine.set(key, current)
    })

    const rows: DealMarginRow[] = salesBills.flatMap((bill) => bill.sales_bill_lines.map((line) => {
        const productGroup = line.products?.metal_group ?? line.product_name_snapshot ?? line.products?.name
        if (!isDualCostingGroup(productGroup)) return null

        const sellQty = toNumber(line.qty) || toNumber(line.net_weight)
        const key = `${bill.id.toString()}:${line.line_no}`
        const docKey = `${bill.doc_no}:${line.line_no}`
        const allocation = allocationByLine.get(key) ?? allocationByLine.get(docKey)
        const matchedQty = allocation?.matchedQty ?? 0
        const matchedCost = allocation?.matchedCost ?? 0
        const totalRevenue = toNumber(line.line_amount)
        const margin = totalRevenue - matchedCost
        const customer = bill.customers?.name ?? '-'
        const product = line.product_name_snapshot ?? line.products?.name ?? '-'
        const date = toDateOnly(bill.date)
        const docNo = bill.doc_no
        const channelName = bill.sales_channels?.name ?? bill.sales_channels?.code ?? 'Trading Deal'
        const rowStatusMatch = statusMatch(sellQty, matchedQty)
        return {
          allocationNo: allocation?.allocationNo ?? '-',
          avgCost: matchedQty > 0 ? matchedCost / matchedQty : 0,
          channel: channelName,
          customer,
          date,
          docNo,
          id: `${docNo}:${line.line_no}`,
          margin,
          marginPct: totalRevenue > 0 ? (margin / totalRevenue) * 100 : 0,
          matchedCost,
          matchedQty,
          product,
          sellQty,
          statusMatch: rowStatusMatch,
          totalRevenue,
          unitPrice: toNumber(line.unit_price),
        }
      }).filter((row): row is DealMarginRow => row !== null))
      .filter((row) => !from || row.date >= from)
      .filter((row) => !to || row.date <= to)
      .filter((row) => !channel || channel === 'all' || row.channel === channel)

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(await buildWorkbook(rows), 'deal_margin.xlsx')
    }

    const revenue = rows.reduce((sum, row) => sum + row.totalRevenue, 0)
    const cost = rows.reduce((sum, row) => sum + row.matchedCost, 0)
    const margin = revenue - cost

    return NextResponse.json({
      filters: {
        channels: Array.from(new Set(rows.map((row) => row.channel))).sort(),
      },
      rows,
      summary: {
        cost,
        fullyMatched: rows.filter((row) => row.statusMatch === 'Fully').length,
        margin,
        marginPct: revenue > 0 ? (margin / revenue) * 100 : 0,
        none: rows.filter((row) => row.statusMatch === 'None').length,
        partial: rows.filter((row) => row.statusMatch === 'Partial').length,
        revenue,
        rows: rows.length,
      },
      topDeals: [...rows].sort((left, right) => right.margin - left.margin).slice(0, 5),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Deal Margin ไม่ได้', 500)
  }
}
