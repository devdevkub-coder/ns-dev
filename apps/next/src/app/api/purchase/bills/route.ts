import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import * as XLSX from 'xlsx'
import { purchaseBillFormSchema, type PurchaseBillFormValues } from '@/lib/purchase-bill'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type PurchaseBillRow = Prisma.purchase_billsGetPayload<{
  include: {
    branches: true
    purchase_channels: true
    suppliers: true
    warehouses: true
  }
}>

type BillQuery = {
  dateFrom?: string
  dateTo?: string
  filterMode?: string
  filterSource?: string
  page: number
  pageSize: number
  search?: string
  sortDirection: Prisma.SortOrder
  sortKey: string
}

function billJson(row: PurchaseBillRow) {
  return {
    branchId: row.branch_id ?? '',
    branchName: row.branches?.name ?? '-',
    channelId: row.channel_id ?? '',
    channelName: row.purchase_channels?.name ?? '-',
    contactPhone: row.contact_phone ?? '',
    createdAt: row.created_at?.toISOString() ?? '',
    createdBy: row.created_by ?? '-',
    date: toDateOnly(row.date),
    discountTotal: toNumber(row.discount_total ?? row.discount),
    docNo: row.doc_no,
    hasVat: row.has_vat ?? false,
    id: row.id,
    itemCount: Array.isArray(row.items) ? row.items.length : 0,
    licensePlate: row.license_plate ?? '',
    note: row.note ?? row.notes ?? '',
    paidAmount: toNumber(row.paid_amount),
    payableBalance: toNumber(row.payable_balance),
    poBuyId: row.po_buy_id ?? '',
    purchaseSource: row.purchase_source ?? 'SPOT_BUY',
    refNo: row.ref_no ?? '',
    salesId: row.sales_id ?? '',
    status: row.status ?? 'open',
    supplierId: row.supplier_id ?? '',
    supplierName: row.suppliers?.name ?? row.supplier_id ?? '-',
    totalAmount: toNumber(row.total_amount),
    transactionMode: row.transaction_mode ?? 'STOCK',
    updatedAt: row.updated_at?.toISOString() ?? '',
    updatedBy: row.updated_by ?? '',
    vatInvoiceNo: row.vat_invoice_no ?? '',
    vatInvoiceDate: row.vat_invoice_date ? toDateOnly(row.vat_invoice_date) : '',
    vatInvoiceReceived: row.vat_invoice_received ?? false,
    warehouseId: row.warehouse_id ?? '',
    warehouseName: row.warehouses?.name ?? '-',
  }
}

function calculateTotals(values: PurchaseBillFormValues) {
  const subtotal = values.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const afterDiscount = Math.max(0, subtotal - values.discountTotal)
  const vatAmount = !values.hasVat || values.vatType === 'NONE'
    ? 0
    : values.vatType === 'INCLUDE'
      ? afterDiscount * 7 / 107
      : afterDiscount * 0.07
  const totalAmount = values.hasVat && values.vatType === 'EXCLUDE' ? afterDiscount + vatAmount : afterDiscount

  return { afterDiscount, subtotal, totalAmount, vatAmount }
}

function isDocNoConflict(caught: unknown) {
  if (!(caught instanceof Error) || !('code' in caught) || caught.code !== 'P2002') return false
  if (!('meta' in caught) || typeof caught.meta !== 'object' || caught.meta === null) return false
  if (!('target' in caught.meta) || !Array.isArray(caught.meta.target)) return false
  return caught.meta.target.includes('doc_no')
}

async function nextPurchaseBillDocNo(tx: Prisma.TransactionClient, date: string) {
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `PB${compactDate}-`
  const last = await tx.purchase_bills.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith } },
  })
  const lastNumber = Number(String(last?.doc_no ?? '').slice(startsWith.length))
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1
  return `${startsWith}${String(nextNumber).padStart(4, '0')}`
}

async function optionsPayload() {
  const [branches, channels, poBuys, products, salespersons, suppliers, warehouses] = await Promise.all([
    prisma.branches.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, id: true, name: true } }),
    prisma.purchase_channels.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, id: true, name: true } }),
    prisma.po_buys.findMany({
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      select: { doc_no: true, id: true, remaining_amount: true, status: true, supplier_id: true },
      take: 500,
      where: { status: { notIn: ['closed', 'Closed', 'cancelled', 'Cancelled'] } },
    }),
    prisma.products.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true, unit: true } }),
    prisma.salespersons.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.suppliers.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, id: true, name: true } }),
    prisma.warehouses.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, branch_id: true, id: true, name: true } }),
  ])

  return {
    branches,
    channels,
    poBuys: poBuys.map((po) => ({
      active: !['closed', 'Closed', 'cancelled', 'Cancelled'].includes(po.status ?? ''),
      id: po.id,
      label: `${po.doc_no}${po.remaining_amount ? ` · คงเหลือ ${toNumber(po.remaining_amount).toLocaleString('th-TH')}` : ''}`,
      name: po.doc_no,
      supplier_id: po.supplier_id,
    })),
    products,
    salespersons,
    suppliers,
    warehouses,
  }
}

function parseBillQuery(url: URL, includePaging = true): BillQuery {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = includePaging ? Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 10) || 10)) : 10000
  const sortDirection = url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc'

  return {
    dateFrom: url.searchParams.get('dateFrom') || undefined,
    dateTo: url.searchParams.get('dateTo') || undefined,
    filterMode: url.searchParams.get('filterMode') || undefined,
    filterSource: url.searchParams.get('filterSource') || undefined,
    page,
    pageSize,
    search: url.searchParams.get('search')?.trim() || undefined,
    sortDirection,
    sortKey: url.searchParams.get('sortKey') || 'date',
  }
}

function billWhere(query: BillQuery): Prisma.purchase_billsWhereInput {
  const where: Prisma.purchase_billsWhereInput = {}

  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: normalizeDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: normalizeDate(query.dateTo) } : {}),
    }
  }
  if (query.filterMode) where.transaction_mode = query.filterMode
  if (query.filterSource) where.purchase_source = query.filterSource
  if (query.search) {
    where.OR = [
      { doc_no: { contains: query.search, mode: 'insensitive' } },
      { ref_no: { contains: query.search, mode: 'insensitive' } },
      { suppliers: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { branches: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { warehouses: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
    ]
  }

  return where
}

function billOrderBy(query: BillQuery): Prisma.purchase_billsOrderByWithRelationInput[] {
  const direction = query.sortDirection
  const primary: Prisma.purchase_billsOrderByWithRelationInput = (() => {
    switch (query.sortKey) {
      case 'docNo':
        return { doc_no: direction }
      case 'refNo':
        return { ref_no: direction }
      case 'name':
        return { supplier_id: direction }
      case 'outstanding':
        return { payable_balance: direction }
      case 'status':
        return { status: direction }
      case 'totalAmount':
        return { total_amount: direction }
      case 'transactionMode':
        return { transaction_mode: direction }
      case 'warehouse':
        return { branch_id: direction }
      case 'date':
      default:
        return { date: direction }
    }
  })()

  return [primary, { doc_no: direction }]
}

async function rowsPayload(query: BillQuery, includePaging = true) {
  const where = billWhere(query)
  const [rows, totalRows, totals] = await Promise.all([
    prisma.purchase_bills.findMany({
      include: {
        branches: true,
        purchase_channels: true,
        suppliers: true,
        warehouses: true,
      },
      orderBy: billOrderBy(query),
      skip: includePaging ? (query.page - 1) * query.pageSize : 0,
      take: includePaging ? query.pageSize : 10000,
      where,
    }),
    prisma.purchase_bills.count({ where }),
    prisma.purchase_bills.aggregate({
      _sum: { total_amount: true },
      where,
    }),
  ])

  return {
    rows: rows.map(billJson),
    totalAmount: toNumber(totals._sum.total_amount),
    totalRows,
  }
}

function buildWorkbook(rows: ReturnType<typeof billJson>[]) {
  const dataRows = rows.map((row) => ({
    'เลขที่': row.docNo,
    'เลขที่อ้างอิง': row.refNo,
    'วันที่': row.date,
    'ผู้ขาย': row.supplierName,
    'สาขา': row.branchName,
    'คลัง': row.warehouseName,
    'ประเภท': row.transactionMode,
    'ที่มา': row.purchaseSource,
    'ทะเบียนรถ': row.licensePlate,
    'เบอร์โทร': row.contactPhone,
    'เซลที่ดูแล': row.salesId,
    'จำนวนรายการ': row.itemCount,
    'ส่วนลดท้ายบิล': row.discountTotal,
    'ยอดรวม': row.totalAmount,
    'ชำระแล้ว': row.paidAmount,
    'ค้างจ่าย': row.payableBalance,
    'สถานะ': row.status,
    'ใบกำกับ VAT': row.hasVat ? row.vatInvoiceReceived ? 'รับแล้ว' : 'รอรับ' : 'No VAT',
    'สร้างโดย': row.createdBy,
    'สร้างเมื่อ': row.createdAt,
  }))
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(dataRows)
  sheet['!cols'] = [
    { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 18 }, { wch: 18 },
    { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 22 },
  ]
  applyWorksheetTableLayout(sheet, 20, dataRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'บิลรับซื้อ')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const query = parseBillQuery(url, url.searchParams.get('format') !== 'xlsx')
    const payload = await rowsPayload(query, url.searchParams.get('format') !== 'xlsx')

    if (url.searchParams.get('format') === 'xlsx') {
      const body = buildWorkbook(payload.rows)
      const filename = `purchase_bills_${new Date().toISOString().slice(0, 10)}.xlsx`

      return new NextResponse(new Uint8Array(body), {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      })
    }

    return NextResponse.json({
      rows: payload.rows,
      totalAmount: payload.totalAmount,
      totalRows: payload.totalRows,
      ...await optionsPayload(),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดบิลรับซื้อไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = purchaseBillFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const totals = calculateTotals(values)

    const productIds = [...new Set(values.items.map((item) => item.productId))]
    const poBuyIds = [...new Set([values.poBuyId, ...values.items.map((item) => item.poBuyId)].filter(Boolean) as string[])]
    const [supplier, branch, warehouse, channel, salesperson, poBuys, products] = await Promise.all([
      prisma.suppliers.findFirst({ where: { active: true, id: values.supplierId } }),
      values.branchId ? prisma.branches.findFirst({ where: { active: true, id: values.branchId } }) : Promise.resolve(null),
      values.warehouseId ? prisma.warehouses.findFirst({ where: { active: true, id: values.warehouseId } }) : Promise.resolve(null),
      values.channelId ? prisma.purchase_channels.findFirst({ where: { active: true, id: values.channelId } }) : Promise.resolve(null),
      values.salesId ? prisma.salespersons.findFirst({ where: { active: true, id: values.salesId } }) : Promise.resolve(null),
      poBuyIds.length ? prisma.po_buys.findMany({ where: { id: { in: poBuyIds } } }) : Promise.resolve([]),
      prisma.products.findMany({ where: { active: true, id: { in: productIds } } }),
    ])

    if (!supplier) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (values.branchId && !branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (values.warehouseId && !warehouse) return NextResponse.json({ code: 'BAD_REQUEST', error: 'คลังไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (values.channelId && !channel) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ช่องทางไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (values.salesId && !salesperson) return NextResponse.json({ code: 'BAD_REQUEST', error: 'เซลที่ดูแลไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })

    const poBuyById = new Map(poBuys.map((po) => [po.id, po]))
    const missingPoBuy = poBuyIds.find((poBuyId) => !poBuyById.has(poBuyId))
    if (missingPoBuy) return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Buy ที่เลือกไม่ถูกต้อง' }, { status: 400 })

    const productById = new Map(products.map((product) => [product.id, product]))
    const missingProduct = values.items.find((item) => !productById.has(item.productId))
    if (missingProduct) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })

    const items = values.items.map((item) => {
      const product = productById.get(item.productId)
      const amount = Math.max(0, item.qty * item.price - item.discount)
      return {
        amount,
        deductWeight: item.deductWeight,
        discount: item.discount,
        displayName: item.displayName,
        grossWeight: item.grossWeight,
        lotNo: item.lotNo,
        note: item.note,
        poBuyId: item.poBuyId,
        price: item.price,
        productCode: product?.code ?? '',
        productId: item.productId,
        productName: product?.name ?? item.productId,
        qty: item.qty,
        salesPrice: item.salesPrice,
        unit: product?.unit ?? 'กก.',
      }
    })

    let bill: { doc_no: string; id: string } | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        bill = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('purchase_bills.doc_no'))`
          const id = `PB-${randomUUID()}`
          const docNo = await nextPurchaseBillDocNo(tx, values.date)

          return tx.purchase_bills.create({
            data: {
              branch_id: values.branchId,
              channel_id: values.channelId,
              contact_phone: values.contactPhone,
              created_by: actor,
              date: normalizeDate(values.date),
              discount: values.discountTotal,
              discount_total: values.discountTotal,
              doc_no: docNo,
              has_vat: values.hasVat,
              id,
              items,
              license_plate: values.licensePlate,
              note: values.note ?? values.notes,
              notes: values.notes,
              paid_amount: 0,
              payable_balance: totals.totalAmount,
              po_buy_id: values.poBuyId,
              purchase_source: values.purchaseSource,
              ref_no: values.refNo,
              sales_id: values.salesId,
              status: 'open',
              subtotal: totals.subtotal,
              supplier_id: values.supplierId,
              total_amount: totals.totalAmount,
              transaction_mode: values.transactionMode,
              updated_at: new Date(),
              updated_by: actor,
              vat_amount: totals.vatAmount,
              vat_invoice_date: values.vatInvoiceDate ? normalizeDate(values.vatInvoiceDate) : null,
              vat_invoice_no: values.vatInvoiceNo,
              vat_invoice_received: values.vatInvoiceReceived,
              vat_invoice_received_at: values.vatInvoiceReceived ? new Date() : null,
              vat_type: values.vatType,
              warehouse_id: values.warehouseId,
            },
            select: { doc_no: true, id: true },
          })
        })
        break
      } catch (caught) {
        if (!isDocNoConflict(caught) || attempt === 2) throw caught
      }
    }

    if (!bill) throw new Error('สร้างเลขที่บิลไม่สำเร็จ')

    return NextResponse.json({ docNo: bill.doc_no, id: bill.id })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกบิลรับซื้อไม่ได้', 400)
  }
}
