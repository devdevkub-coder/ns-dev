import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { DealMarginDataIntegrityError, indexDealMarginAllocations } from '@/lib/server/deal-margin-allocation'
import { buildDealMarginWorkbook } from '@/lib/server/deal-margin-export'
import { getDualCostingBranch } from '@/lib/server/dual-costing-branch'
import { prisma } from '@/lib/server/prisma'

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
    const salesBillIdByDocNo = new Map(salesBills.map((bill) => [bill.doc_no, bill.id.toString()]))
    const salesBillMetaById = new Map(salesBills.map((bill) => [bill.id.toString(), {
      channel: bill.sales_channels?.name ?? bill.sales_channels?.code ?? 'Trading Deal',
      date: toDateOnly(bill.date),
      docNo: bill.doc_no,
    }]))
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

    const { allocationByLine, unlinkedAllocations } = indexDealMarginAllocations(allocations.map((allocation) => {
      const billKey = allocation.sales_bill_id?.toString()
        ?? (allocation.sales_doc_no ? salesBillIdByDocNo.get(allocation.sales_doc_no) ?? allocation.sales_doc_no : null)
      const billMeta = billKey ? salesBillMetaById.get(billKey) : undefined
      return {
        allocationNo: allocation.allocation_no,
        billKey,
        salesDocNo: allocation.sales_doc_no ?? billMeta?.docNo ?? null,
        date: billMeta?.date ?? null,
        channel: billMeta?.channel ?? null,
        salesLineNo: allocation.sales_line_no,
        matchedCost: toNumber(allocation.matched_cogs),
        matchedQty: toNumber(allocation.qty),
      }
    }))
    const scopedUnlinkedAllocations = unlinkedAllocations.filter((allocation) => (
      (!from || !allocation.date || allocation.date >= from)
      && (!to || !allocation.date || allocation.date <= to)
      && (!channel || channel === 'all' || !allocation.channel || allocation.channel === channel)
    ))
    const unlinkedBillKeys = new Set(scopedUnlinkedAllocations.map((allocation) => allocation.billKey).filter((key): key is string => Boolean(key)))
    const candidateRows: DealMarginRow[] = salesBills.flatMap((bill) => bill.sales_bill_lines.map((line) => {
        const productGroup = line.products?.metal_group ?? line.product_name_snapshot ?? line.products?.name
        if (!isDualCostingGroup(productGroup)) return null

        const sellQty = toNumber(line.qty) || toNumber(line.net_weight)
        const key = `${bill.id.toString()}:${line.line_no}`
        const docKey = `${bill.doc_no}:${line.line_no}`
        const allocation = allocationByLine.get(key) ?? allocationByLine.get(docKey)
        if (unlinkedBillKeys.has(bill.id.toString()) && !allocation) return null
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
    const availableChannels = [
      ...candidateRows.map((row) => row.channel),
      ...scopedUnlinkedAllocations.map((allocation) => allocation.channel).filter((value): value is string => Boolean(value)),
    ]
    const rows = candidateRows.filter((row) => !channel || channel === 'all' || row.channel === channel)

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(await buildDealMarginWorkbook(rows, scopedUnlinkedAllocations), 'deal_margin.xlsx')
    }

    const revenue = rows.reduce((sum, row) => sum + row.totalRevenue, 0)
    const cost = rows.reduce((sum, row) => sum + row.matchedCost, 0)
    const margin = revenue - cost

    return NextResponse.json({
      filters: {
        channels: Array.from(new Set(availableChannels)).sort(),
      },
      unlinkedAllocations: scopedUnlinkedAllocations.map(({ billKey, date, channel, ...allocation }) => allocation),
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
    if (caught instanceof DealMarginDataIntegrityError) {
      return NextResponse.json({
        code: caught.code,
        details: caught.details,
        error: caught.message,
      }, { status: 409 })
    }
    return apiErrorResponse(caught, 'โหลด Deal Margin ไม่ได้', 500)
  }
}
