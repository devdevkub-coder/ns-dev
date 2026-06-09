import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { salesBillFormSchema, type SalesBillFormValues } from '@/lib/sales'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { currentActor, nextDailyDocNo, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { findActiveSalesChannelReferenceByCode } from '@/lib/server/sales-channel-reference'
import { activeVatRatePercent } from '@/lib/server/tax-settings'
import { findActiveWarehouseReferenceByCodeOrId } from '@/lib/server/warehouse-reference'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type BillQuery = {
  dateFrom?: string
  dateTo?: string
  filterMode?: string
  page: number
  pageSize: number
  search?: string
  sortDirection: Prisma.SortOrder
  sortKey: string
  statuses?: string[]
}

type SalesBillRow = Prisma.sales_billsGetPayload<{
  include: {
    branches: true
    customers: true
    sales_channels: true
    warehouses: true
  }
}>

function parseBillQuery(url: URL, includePaging = true): BillQuery {
  return {
    dateFrom: url.searchParams.get('dateFrom') || undefined,
    dateTo: url.searchParams.get('dateTo') || undefined,
    filterMode: url.searchParams.get('filterMode') || undefined,
    page: Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1),
    pageSize: includePaging ? Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 10) || 10)) : 10000,
    search: url.searchParams.get('search')?.trim() || undefined,
    sortDirection: url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc',
    sortKey: url.searchParams.get('sortKey') || 'date',
    statuses: url.searchParams.get('status')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) || undefined,
  }
}

function billJson(row: SalesBillRow) {
  return {
    branchId: row.branches?.code ?? '',
    branchName: row.branches?.name ?? '-',
    channelId: row.sales_channels?.code ?? '',
    channelName: row.sales_channels?.name ?? '-',
    createdAt: row.created_at?.toISOString(),
    createdBy: row.created_by ?? '',
    customerName: row.customers?.name ?? '-',
    date: toDateOnly(row.date),
    docNo: row.doc_no,
    grossProfit: toNumber(row.gross_profit),
    id: row.doc_no,
    itemCount: Array.isArray(row.items) ? row.items.length : 0,
    receivableBalance: toNumber(row.receivable_balance),
    receivedAmount: toNumber(row.received_amount),
    refNo: row.ref_no ?? '',
    status: row.status ?? 'open',
    totalAmount: toNumber(row.total_amount),
    transactionMode: row.transaction_mode ?? 'STOCK',
    updatedAt: row.updated_at?.toISOString(),
    updatedBy: row.updated_by ?? '',
    vatInvoiceDate: row.vat_invoice_date ? toDateOnly(row.vat_invoice_date) : '',
    vatInvoiceIssued: row.vat_invoice_issued ?? false,
    vatInvoiceNo: row.vat_invoice_no ?? '',
    warehouseId: row.warehouses?.code ?? '',
    warehouseName: row.warehouses?.name ?? '-',
  }
}

function billWhere(query: BillQuery): Prisma.sales_billsWhereInput {
  const where: Prisma.sales_billsWhereInput = {}

  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: normalizeDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: normalizeDate(query.dateTo) } : {}),
    }
  }
  if (query.filterMode) where.transaction_mode = query.filterMode
  if (query.statuses?.length) where.status = { in: query.statuses }
  if (query.search) {
    where.OR = [
      { doc_no: { contains: query.search, mode: 'insensitive' } },
      { ref_no: { contains: query.search, mode: 'insensitive' } },
      { customers: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { branches: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { warehouses: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
    ]
  }

  return where
}

function billOrderBy(query: BillQuery): Prisma.sales_billsOrderByWithRelationInput[] {
  const direction = query.sortDirection
  const primary: Prisma.sales_billsOrderByWithRelationInput = (() => {
    switch (query.sortKey) {
      case 'docNo':
        return { doc_no: direction }
      case 'name':
        return { customer_id: direction }
      case 'outstanding':
        return { receivable_balance: direction }
      case 'status':
        return { status: direction }
      case 'totalAmount':
        return { total_amount: direction }
      case 'warehouse':
        return { branch_id: direction }
      case 'date':
      default:
        return { date: direction }
    }
  })()

  return [primary, { doc_no: direction }]
}

function calculateSalesTotals(values: SalesBillFormValues, vatRatePercent: number) {
  const subtotal = values.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const afterDiscount = Math.max(0, subtotal - values.discountTotal)
  const rate = Math.max(0, Math.min(100, vatRatePercent))
  const vatAmount = !values.hasVat || values.vatType === 'NONE'
    ? 0
    : values.vatType === 'INCLUDE'
      ? afterDiscount * rate / (100 + rate)
      : afterDiscount * (rate / 100)
  const totalAmount = values.hasVat && values.vatType === 'EXCLUDE' ? afterDiscount + vatAmount : afterDiscount
  return { subtotal, totalAmount, vatAmount }
}

function salesItems(
  values: SalesBillFormValues,
  parsedProductIds: bigint[],
  productById: Map<bigint, { code: string | null; name: string; unit: string | null }>,
) {
  return values.items.map((item, index) => {
    const productId = parsedProductIds[index]
    const product = productById.get(productId)
    const amount = Math.max(0, item.qty * item.price - item.discount)
    return {
      amount,
      discount: item.discount,
      id: `${String(index + 1).padStart(2, '0')}`,
      note: item.note,
      productCode: requireBusinessCode(product?.code, `สินค้า ${productId}`),
      productId: requireBusinessCode(product?.code, `สินค้า ${productId}`),
      productName: product?.name ?? '',
      qty: item.qty,
      unit: product?.unit ?? 'กก.',
      unitPrice: item.price,
    }
  })
}

type SalesItemSnapshot = ReturnType<typeof salesItems>[number]

type PoSellSnapshotItem = {
  discount?: unknown
  id?: unknown
  note?: unknown
  productCode?: unknown
  productId?: unknown
  productName?: unknown
  qty?: unknown
  remainingQty?: unknown
  totalAmount?: unknown
  totalRevenue?: unknown
  unit?: unknown
  unitPrice?: unknown
  [key: string]: unknown
}

type PoSellForAllocation = {
  items: unknown
  qty: unknown
  remaining_amount: unknown
  remaining_qty: unknown
  total_amount: unknown
  unit_price: unknown
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function productCodeFromItem(item: PoSellSnapshotItem) {
  const value = item.productCode ?? item.productId
  return typeof value === 'string' ? value.trim() : ''
}

function isInactivePoSellStatus(status: string | null | undefined) {
  const normalized = (status ?? '').trim().toLowerCase()
  return ['cancelled', 'canceled', 'closed', 'completed', 'fully matched', 'received', 'void'].includes(normalized)
}

function allocatePoSellForSalesBill(poSell: PoSellForAllocation, billItems: SalesItemSnapshot[]) {
  const hasItemRows = Array.isArray(poSell.items) && poSell.items.length > 0
  const poItems: PoSellSnapshotItem[] = hasItemRows
    ? (poSell.items as unknown[]).filter((item): item is PoSellSnapshotItem => typeof item === 'object' && item !== null)
    : [{
        productCode: '',
        productId: '',
        qty: jsonNumber(poSell.qty),
        remainingQty: jsonNumber(poSell.remaining_qty ?? poSell.qty),
        totalRevenue: jsonNumber(poSell.total_amount),
        unitPrice: jsonNumber(poSell.unit_price),
      }]

  const nextItems = poItems.map((item) => ({
    ...item,
    remainingQty: jsonNumber(item.remainingQty ?? item.qty),
  }))

  let usedAmount = 0
  let usedQty = 0

  for (const billItem of billItems) {
    let needQty = jsonNumber(billItem.qty)
    if (needQty <= 0) continue
    const candidates = nextItems.filter((item) => {
      const poProductCode = productCodeFromItem(item)
      return !poProductCode || poProductCode === billItem.productCode || poProductCode === billItem.productId
    })
    if (!candidates.length) return { error: `สินค้า ${billItem.productCode} ไม่อยู่ใน PO Sell ที่เลือก` }

    for (const candidate of candidates) {
      if (needQty <= 0.001) break
      const availableQty = jsonNumber(candidate.remainingQty)
      if (availableQty <= 0) continue
      const qtyToUse = Math.min(availableQty, needQty)
      candidate.remainingQty = availableQty - qtyToUse
      needQty -= qtyToUse
      usedQty += qtyToUse
      usedAmount += qtyToUse * jsonNumber(candidate.unitPrice)
    }

    if (needQty > 0.001) return { error: `จำนวนสินค้า ${billItem.productCode} เกินยอดคงเหลือใน PO Sell` }
  }

  const remainingQty = nextItems.reduce((sum, item) => sum + Math.max(0, jsonNumber(item.remainingQty)), 0)
  const remainingAmount = hasItemRows
    ? nextItems.reduce((sum, item) => sum + Math.max(0, jsonNumber(item.remainingQty)) * jsonNumber(item.unitPrice), 0)
    : Math.max(0, jsonNumber(poSell.remaining_amount ?? poSell.total_amount) - usedAmount)

  return {
    items: hasItemRows ? nextItems : null,
    remainingAmount,
    remainingQty,
    usedAmount,
    usedQty,
  }
}

async function salesOptionsPayload() {
  const [branches, customers, products, salesChannels, warehouses, vatRatePercent] = await Promise.all([
    prisma.branches.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.customers.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.products.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true, unit: true } }),
    prisma.sales_channels.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.warehouses.findMany({
      orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }],
      select: {
        active: true,
        branches: { select: { code: true } },
        branch_id: true,
        code: true,
        id: true,
        name: true,
      },
    }),
    activeVatRatePercent(new Date()),
  ])

  return {
    branches: branches.map((branch) => ({
      ...branch,
      id: branch.code,
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
    vatRatePercent,
    warehouses: warehouses.map((warehouse) => ({
      active: warehouse.active,
      branch_id: warehouse.branches ? requireBusinessCode(warehouse.branches.code, `สาขาคลัง ${warehouse.branch_id ?? warehouse.id}`) : null,
      code: warehouse.code,
      id: warehouse.code,
      name: warehouse.name,
    })),
  }
}

function buildWorkbook(rows: ReturnType<typeof billJson>[]) {
  const dataRows = rows.map((row) => ({
    'เลขที่': row.docNo,
    'เลขที่อ้างอิง': row.refNo,
    'วันที่': row.date,
    'ลูกค้า': row.customerName,
    'สาขา/คลัง': row.warehouseName,
    'ประเภท': row.transactionMode,
    'สถานะ': row.status,
    'จำนวนรายการ': row.itemCount,
    'ยอดรวม': row.totalAmount,
    'รับแล้ว': row.receivedAmount,
    'ค้างรับ': row.receivableBalance,
    'Gross Profit': row.grossProfit,
    'อัพเดตโดย': row.updatedBy || row.createdBy,
    'อัพเดตเมื่อ': row.updatedAt || row.createdAt,
  }))
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  sheet['!cols'] = [
    { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 22 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 22 },
  ]
  applyWorksheetTableLayout(sheet, 14, dataRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'บิลขาย')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const url = new URL(request.url)
    const includePaging = url.searchParams.get('format') !== 'xlsx'
    const query = parseBillQuery(url, includePaging)
    const where = billWhere(query)

    const [rows, totalRows, totals] = await Promise.all([
      prisma.sales_bills.findMany({
        include: {
          branches: true,
          customers: true,
          sales_channels: true,
          warehouses: true,
        },
        orderBy: billOrderBy(query),
        skip: includePaging ? (query.page - 1) * query.pageSize : 0,
        take: query.pageSize,
        where,
      }),
      prisma.sales_bills.count({ where }),
      prisma.sales_bills.aggregate({ _sum: { total_amount: true }, where }),
    ])
    const jsonRows = rows.map(billJson)

    if (url.searchParams.get('format') === 'xlsx') {
      const body = buildWorkbook(jsonRows)
      const filename = `sales_bills_${new Date().toISOString().slice(0, 10)}.xlsx`

      return new NextResponse(new Uint8Array(body), {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      })
    }

    return NextResponse.json({
      rows: jsonRows,
      totalAmount: toNumber(totals._sum.total_amount),
      totalRows,
      ...await salesOptionsPayload(),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดบิลขายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = salesBillFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const createdAt = new Date()
    const billDate = createdAt.toISOString().slice(0, 10)
    const vatRatePercent = await activeVatRatePercent(normalizeDate(billDate))
    const totals = calculateSalesTotals(values, vatRatePercent)
    const parsedPoSellId = values.poSellId ? parseInternalBigIntId(values.poSellId) : null
    const requestedProductCodes = values.items.map((item) => item.productId?.trim() ?? '')
    const invalidProductIndex = requestedProductCodes.findIndex((productCode) => !productCode)
    if (invalidProductIndex >= 0) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้อง' }, { status: 400 })
    }
    const productCodes = [...new Set(requestedProductCodes)]
    const [branch, warehouse] = await Promise.all([
      values.branchId ? findActiveBranchReferenceByCodeOrId(values.branchId) : Promise.resolve(null),
      values.warehouseId ? findActiveWarehouseReferenceByCodeOrId(values.warehouseId) : Promise.resolve(null),
    ])

    const [customer, channel, products] = await Promise.all([
      findActiveCustomerReferenceByCodeOrId(values.customerId),
      values.channelId ? findActiveSalesChannelReferenceByCode(values.channelId) : Promise.resolve(null),
      prisma.products.findMany({ where: { active: true, code: { in: productCodes } }, select: { code: true, id: true, name: true, unit: true } }),
    ])

    if (!customer) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (values.branchId && !branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (values.channelId && !channel) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ช่องทางขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (values.warehouseId && !warehouse) return NextResponse.json({ code: 'BAD_REQUEST', error: 'คลังไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (branch?.code && warehouse?.branchCode && warehouse.branchCode !== branch.code) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาและคลังไม่ตรงกัน' }, { status: 400 })

    if (values.poSellId && !parsedPoSellId) return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Sell ไม่ถูกต้อง' }, { status: 400 })

    const poSell = parsedPoSellId
      ? await prisma.po_sells.findUnique({
          select: {
            branch_id: true,
            customer_id: true,
            id: true,
            items: true,
            qty: true,
            remaining_amount: true,
            remaining_qty: true,
            status: true,
            total_amount: true,
            unit_price: true,
          },
          where: { id: parsedPoSellId },
        })
      : null
    if (parsedPoSellId && !poSell) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบ PO Sell ที่เลือก' }, { status: 400 })
    if (poSell && isInactivePoSellStatus(poSell.status)) return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Sell นี้ถูกปิดหรือยกเลิกแล้ว' }, { status: 400 })
    if (poSell?.customer_id && poSell.customer_id !== customer.id) return NextResponse.json({ code: 'BAD_REQUEST', error: 'Customer ของบิลขายไม่ตรงกับ PO Sell' }, { status: 400 })
    if (poSell?.branch_id && branch?.id && poSell.branch_id !== branch.id) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาของบิลขายไม่ตรงกับ PO Sell' }, { status: 400 })

    const productByCode = new Map(products.map((product) => [requireBusinessCode(product.code, `สินค้า ${product.id}`), product]))
    const parsedProductIds = requestedProductCodes.map((productCode) => productByCode.get(productCode)?.id ?? null)
    const missingProduct = requestedProductCodes.find((productCode) => !productByCode.has(productCode))
    if (missingProduct || parsedProductIds.some((productId) => productId == null)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    const productById = new Map(products.map((product) => [product.id, product]))

    const docNo = await nextDailyDocNo('sales_bills', 'SB', billDate)
    const items = salesItems(values, parsedProductIds as bigint[], productById)
    const poSellAllocation = poSell ? allocatePoSellForSalesBill(poSell, items) : null
    if (poSellAllocation && 'error' in poSellAllocation) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: poSellAllocation.error }, { status: 400 })
    }
    const totalCost = 0

    const created = await prisma.$transaction(async (tx) => {
      const createdBill = await tx.sales_bills.create({
        data: {
          branch_id: branch?.id ?? null,
          channel_id: channel?.id ?? null,
          created_at: createdAt,
          created_by: actor,
          customer_id: customer.id,
          date: normalizeDate(billDate),
          discount: values.discountTotal,
          discount_total: values.discountTotal,
          doc_no: docNo,
          gross_profit: totals.totalAmount - totalCost,
          has_vat: values.hasVat,
          items: items as Prisma.InputJsonValue,
          license_plate: values.licensePlate,
          note: values.note,
          notes: values.note,
          po_sell_id: parsedPoSellId,
          receivable_balance: totals.totalAmount,
          received_amount: 0,
          ref_no: values.refNo,
          status: 'unreceived',
          subtotal: totals.subtotal,
          total_amount: totals.totalAmount,
          total_cost: totalCost,
          transaction_mode: values.transactionMode,
          updated_at: createdAt,
          updated_by: actor,
          vat_amount: totals.vatAmount,
          vat_invoice_date: values.vatInvoiceDate ? normalizeDate(values.vatInvoiceDate) : null,
          vat_invoice_issued: values.vatInvoiceIssued,
          vat_invoice_no: values.vatInvoiceNo,
          vat_type: values.vatType,
          warehouse_id: warehouse?.id ?? null,
        },
        select: { doc_no: true, id: true },
      })

      if (poSell && poSellAllocation && !('error' in poSellAllocation)) {
        await tx.po_sells.update({
          data: {
            ...(poSellAllocation.items ? { items: poSellAllocation.items as Prisma.InputJsonValue } : {}),
            cut_amount: { increment: poSellAllocation.usedAmount },
            remaining_amount: poSellAllocation.remainingAmount,
            remaining_qty: poSellAllocation.remainingQty,
            status: poSellAllocation.remainingQty <= 0.001 ? 'Completed' : poSell.status ?? 'Open',
            updated_at: createdAt,
            updated_by: actor,
          },
          where: { id: poSell.id },
        })
      }

      return createdBill
    })

    return NextResponse.json({ docNo: created.doc_no, id: created.doc_no }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกบิลขายไม่ได้', 500)
  }
}
