import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { poSellFormSchema, type PoSellFormValues } from '@/lib/sales'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { findActiveSalesChannelReferenceByCode } from '@/lib/server/sales-channel-reference'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type PoSellItem = {
  productCode?: string
  productId?: string
  productName?: string
  qty?: number | string
  remainingQty?: number | string
  totalAmount?: number | string
  totalRevenue?: number | string
  unitPrice?: number | string
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function outwardProductCode(value: string | undefined) {
  if (!value) return ''
  const normalized = value.trim()
  if (!normalized || /^\d+$/.test(normalized)) return ''
  return normalized
}

function itemRows(
  row: { items: unknown; product_id: bigint | null; qty: unknown; remaining_qty: unknown; unit_price: unknown },
  fallbackProductCode: string,
  productName: string,
) {
  if (Array.isArray(row.items) && row.items.length) {
    return row.items
      .filter((item): item is PoSellItem => typeof item === 'object' && item !== null)
      .map((item) => ({
        productId: outwardProductCode(item.productCode) || outwardProductCode(item.productId) || fallbackProductCode,
        productName: item.productName ?? item.productCode ?? productName,
        qty: jsonNumber(item.qty),
        remainingQty: jsonNumber(item.remainingQty ?? item.qty),
        totalAmount: jsonNumber(item.totalRevenue ?? item.totalAmount),
        unitPrice: jsonNumber(item.unitPrice),
      }))
  }

  return [{
    productId: fallbackProductCode,
    productName,
    qty: jsonNumber(row.qty),
    remainingQty: jsonNumber(row.remaining_qty ?? row.qty),
    totalAmount: 0,
    unitPrice: jsonNumber(row.unit_price),
  }]
}

function matchStatus(matchedQty: number, qty: number) {
  if (matchedQty <= 0) return 'Not Matched'
  if (qty > 0 && matchedQty > qty + 0.001) return 'Over Matched'
  if (qty > 0 && matchedQty >= qty - 0.001) return 'Fully Matched'
  return 'Partially Matched'
}

function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'PO Sell')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

function poSellItems(
  values: PoSellFormValues,
  parsedProductIds: bigint[],
  productById: Map<bigint, { code: string | null; name: string; unit: string | null }>,
) {
  return values.items.map((item, index) => {
    const productId = parsedProductIds[index]
    const product = productById.get(productId)
    const totalRevenue = Math.max(0, item.qty * item.price - item.discount)
    return {
      discount: item.discount,
      id: `${String(index + 1).padStart(2, '0')}`,
      note: item.note,
      productCode: requireBusinessCode(product?.code, `สินค้า ${productId}`),
      productId: requireBusinessCode(product?.code, `สินค้า ${productId}`),
      productName: product?.name ?? '',
      qty: item.qty,
      remainingQty: item.qty,
      totalRevenue,
      unit: product?.unit ?? 'กก.',
      unitPrice: item.price,
    }
  })
}

async function nextPoSellDocNo(date: Date) {
  const year = String(date.getFullYear() + 543).slice(-2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const prefix = `POS${year}${month}-`
  const latest = await prisma.po_sells.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith: prefix } },
  })
  const running = Number(latest?.doc_no?.slice(prefix.length) ?? '0') || 0
  return `${prefix}${String(running + 1).padStart(4, '0')}`
}

async function optionsPayload() {
  const [branches, customers, products, salesChannels] = await Promise.all([
    prisma.branches.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.customers.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.products.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true, unit: true } }),
    prisma.sales_channels.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
  ])
  return {
    branches: branches.map((branch) => ({
      ...branch,
      id: requireBusinessCode(branch.code, `สาขา ${branch.id}`),
    })),
    customers: customers.map((customer) => ({
      ...customer,
      id: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
    })),
    products: products.map((product) => ({
      ...product,
      id: requireBusinessCode(product.code, `สินค้า ${product.id}`),
    })),
    salesChannels: salesChannels.map((channel) => ({
      ...channel,
      id: requireBusinessCode(channel.code, `ช่องทางขาย ${channel.id}`),
    })),
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const statusFilter = url.searchParams.get('status')
    const matchStatusFilter = url.searchParams.get('matchStatus')
    const activeStatusFilter = statusFilter && statusFilter !== 'all' ? statusFilter : null
    const activeMatchStatusFilter = matchStatusFilter && matchStatusFilter !== 'all' ? matchStatusFilter : null
    const dateWhere = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }

    const [poSells, branches, channels, products, salesBills, tradingDeals] = await Promise.all([
      prisma.po_sells.findMany({
        include: { customers: true },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: from || to ? { date: dateWhere } : undefined,
      }),
      prisma.branches.findMany({ select: { code: true, id: true, name: true } }),
      prisma.sales_channels.findMany({ select: { id: true, name: true } }),
      prisma.products.findMany({ select: { code: true, id: true, name: true } }),
      prisma.sales_bills.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { NOT: { status: 'cancelled' }, po_sell_id: { not: null } },
      }),
      prisma.trading_deals.findMany({
        orderBy: [{ date: 'desc' }],
        take: 10000,
        where: { NOT: { status: { in: ['Cancelled', 'cancelled'] } } },
      }),
    ])

    const branchById = new Map(branches.map((branch) => [branch.id, branch]))
    const channelById = new Map(channels.map((channel) => [channel.id, channel]))
    const productById = new Map(products.map((product) => [product.id, product]))

    const salesBillIdsByPoSellId = new Map<bigint, Set<bigint>>()
    salesBills.forEach((bill) => {
      if (!bill.po_sell_id) return
      const current = salesBillIdsByPoSellId.get(bill.po_sell_id) ?? new Set<bigint>()
      current.add(bill.id)
      salesBillIdsByPoSellId.set(bill.po_sell_id, current)
    })

    const tradingDealsBySalesBillId = new Map<bigint, typeof tradingDeals>()
    tradingDeals.forEach((deal) => {
      if (!deal.sales_bill_id) return
      const current = tradingDealsBySalesBillId.get(deal.sales_bill_id) ?? []
      current.push(deal)
      tradingDealsBySalesBillId.set(deal.sales_bill_id, current)
    })

    const matchedByPoSellId = new Map<bigint, { cost: number; qty: number; salesAmount: number }>()
    poSells.forEach((po) => {
      const billIds = salesBillIdsByPoSellId.get(po.id) ?? new Set<bigint>()
      let cost = 0
      let qty = 0
      let salesAmount = 0
      billIds.forEach((billId) => {
        const deals = tradingDealsBySalesBillId.get(billId) ?? []
        deals.forEach((deal) => {
          cost += toNumber(deal.matched_purchase_amount)
          qty += toNumber(deal.matched_qty)
          salesAmount += toNumber(deal.matched_sales_amount)
        })
      })
      matchedByPoSellId.set(po.id, { cost, qty, salesAmount })
    })

    const rows = poSells.map((po) => {
      const fallbackProduct = po.product_id ? productById.get(po.product_id) : null
      const fallbackProductCode = fallbackProduct?.code ? requireBusinessCode(fallbackProduct.code, `สินค้า ${po.product_id}`) : ''
      const fallbackProductName = fallbackProduct?.name ?? ''
      const items = itemRows(po, fallbackProductCode, fallbackProductName)
      const qty = items.reduce((sum, item) => sum + item.qty, 0) || toNumber(po.qty)
      const remainingQty = items.reduce((sum, item) => sum + item.remainingQty, 0) || toNumber(po.remaining_qty)
      const totalAmount = toNumber(po.total_amount) || items.reduce((sum, item) => sum + (item.totalAmount || item.qty * item.unitPrice), 0)
      const remainingAmount = toNumber(po.remaining_amount) || items.reduce((sum, item) => sum + item.remainingQty * item.unitPrice, 0)
      const matched = matchedByPoSellId.get(po.id) ?? { cost: 0, qty: 0, salesAmount: 0 }
      const margin = matched.salesAmount > 0 ? matched.salesAmount - matched.cost : totalAmount - matched.cost
      const status = po.status ?? 'Open'
      const currentMatchStatus = matchStatus(matched.qty, qty)

      return {
        branchName: po.branch_id ? branchById.get(po.branch_id)?.name ?? '-' : '-',
        channelName: po.channel_id ? channelById.get(po.channel_id)?.name ?? '-' : '-',
        customerName: po.customers?.name ?? '-',
        date: toDateOnly(po.date),
        docNo: po.doc_no,
        expectedDelivery: toDateOnly(po.expected_delivery),
        id: po.doc_no,
        itemCount: items.length,
        margin,
        marginPct: totalAmount > 0 ? (margin / totalAmount) * 100 : 0,
        matchStatus: currentMatchStatus,
        matchedCost: matched.cost,
        matchedPct: qty > 0 ? (matched.qty / qty) * 100 : 0,
        matchedQty: matched.qty,
        productName: items.map((item) => item.productName).filter(Boolean).join(', ') || fallbackProductName || '-',
        qty,
        remainingAmount,
        remainingQty,
        requireDelivery: po.require_delivery !== false,
        status,
        totalAmount,
        unitPrice: qty > 0 ? totalAmount / qty : toNumber(po.unit_price),
      }
    })
      .filter((row) => !activeStatusFilter || row.status === activeStatusFilter)
      .filter((row) => !activeMatchStatusFilter || row.matchStatus === activeMatchStatusFilter)
      .filter((row) => !q || `${row.docNo} ${row.customerName} ${row.channelName} ${row.branchName} ${row.productName} ${row.status} ${row.matchStatus}`.toLowerCase().includes(q))

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(rows.map((row) => ({
        Branch: row.branchName,
        Channel: row.channelName,
        Customer: stringifyBusinessValue(row.customerName),
        Date: row.date,
        DocNo: row.docNo,
        ExpectedDelivery: row.expectedDelivery,
        Margin: row.margin,
        MarginPct: row.marginPct,
        MatchStatus: row.matchStatus,
        MatchedCost: row.matchedCost,
        MatchedPct: row.matchedPct,
        MatchedQty: row.matchedQty,
        Product: row.productName,
        Qty: row.qty,
        RemainingAmount: row.remainingAmount,
        RemainingQty: row.remainingQty,
        Status: row.status,
        TotalAmount: row.totalAmount,
      }))), 'po_sell.xlsx')
    }

    return NextResponse.json({
      filters: {
        matchStatuses: Array.from(new Set(rows.map((row) => row.matchStatus))).sort(),
        statuses: Array.from(new Set(poSells.map((row) => row.status ?? 'Open'))).sort(),
      },
      options: await optionsPayload(),
      rows,
      summary: {
        fullyMatched: rows.filter((row) => row.matchStatus === 'Fully Matched').length,
        margin: rows.reduce((sum, row) => sum + row.margin, 0),
        open: rows.filter((row) => !['Cancelled', 'cancelled', 'Received', 'received'].includes(row.status)).length,
        overMatched: rows.filter((row) => row.matchStatus === 'Over Matched').length,
        partiallyMatched: rows.filter((row) => row.matchStatus === 'Partially Matched').length,
        qty: rows.reduce((sum, row) => sum + row.qty, 0),
        remainingAmount: rows.reduce((sum, row) => sum + row.remainingAmount, 0),
        remainingQty: rows.reduce((sum, row) => sum + row.remainingQty, 0),
        totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
        totalRows: rows.length,
        unmatched: rows.filter((row) => row.matchStatus === 'Not Matched').length,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด PO Sell ไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = poSellFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const createdAt = new Date()
    const expectedDelivery = normalizeDate(values.expectedDelivery)
    const requestedProductCodes = values.items.map((item) => item.productId?.trim() ?? '')
    const invalidProductIndex = requestedProductCodes.findIndex((productCode) => !productCode)
    if (invalidProductIndex >= 0) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้อง' }, { status: 400 })
    }
    const productCodes = [...new Set(requestedProductCodes)]

    const [customer, branch, channel, products] = await Promise.all([
      findActiveCustomerReferenceByCodeOrId(values.customerId),
      values.branchId ? findActiveBranchReferenceByCodeOrId(values.branchId) : Promise.resolve(null),
      values.channelId ? findActiveSalesChannelReferenceByCode(values.channelId) : Promise.resolve(null),
      prisma.products.findMany({ where: { active: true, code: { in: productCodes } }, select: { code: true, id: true, name: true, unit: true } }),
    ])

    if (!customer) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (values.branchId && !branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (values.channelId && !channel) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ช่องทางขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })

    const productByCode = new Map(products.map((product) => [requireBusinessCode(product.code, `สินค้า ${product.id}`), product]))
    const parsedProductIds = requestedProductCodes.map((productCode) => productByCode.get(productCode)?.id ?? null)
    const missingProduct = requestedProductCodes.find((productCode) => !productByCode.has(productCode))
    if (missingProduct || parsedProductIds.some((productId) => productId == null)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    const productById = new Map(products.map((product) => [product.id, product]))

    const items = poSellItems(values, parsedProductIds as bigint[], productById)
    const qty = items.reduce((sum, item) => sum + item.qty, 0)
    const totalAmount = items.reduce((sum, item) => sum + item.totalRevenue, 0)
    const docNo = await nextPoSellDocNo(createdAt)
    const created = await prisma.po_sells.create({
      data: {
        branch_id: branch?.id ?? null,
        channel_id: channel?.id ?? null,
        created_at: createdAt,
        created_by: actor,
        customer_id: customer.id,
        date: createdAt,
        delivery_date: expectedDelivery,
        doc_no: docNo,
        expected_delivery: expectedDelivery,
        items: items as Prisma.InputJsonValue,
        note: values.note,
        notes: values.note,
        product_id: parsedProductIds[0] ?? null,
        qty,
        remaining_amount: totalAmount,
        remaining_qty: qty,
        require_delivery: true,
        status: 'Open',
        total_amount: totalAmount,
        unit_price: qty > 0 ? totalAmount / qty : 0,
        updated_at: createdAt,
        updated_by: actor,
        version: 1,
      },
      select: { doc_no: true, id: true },
    })

    return NextResponse.json({ docNo: created.doc_no, id: created.doc_no }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึก PO Sell ไม่ได้', 500)
  }
}
