import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { poBuyFormSchema, type PoBuyFormValues } from '@/lib/po-buy'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type PoItem = {
  productId?: string
  productName?: string
  qty?: number | string
  unitPrice?: number | string
  remainingQty?: number | string
}

type ProductOption = {
  active: boolean | null
  code: string
  id: string
  name: string
  unit: string | null
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as { toNumber: () => number } | null | undefined)
}

function itemsFromPo(row: {
  items: unknown
  product_id: string | null
  qty: unknown
  remaining_qty: unknown
  unit_price: unknown
}, productById: Map<string, { id: string; name: string | null }>, productName: string) {
  if (Array.isArray(row.items) && row.items.length) {
    return row.items
      .filter((item): item is PoItem => typeof item === 'object' && item !== null)
      .map((item) => ({
        productId: item.productId ?? '',
        productName: item.productName ?? (item.productId ? productById.get(item.productId)?.name : null) ?? productName,
        qty: jsonNumber(item.qty),
        remainingQty: jsonNumber(item.remainingQty ?? item.qty),
        unitPrice: jsonNumber(item.unitPrice),
      }))
  }

  return [{
    productId: row.product_id ?? '',
    productName,
    qty: jsonNumber(row.qty),
    remainingQty: jsonNumber(row.remaining_qty ?? row.qty),
    unitPrice: jsonNumber(row.unit_price),
  }]
}

function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'PO Buy')
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

function dateInRange(date: string, from: string | null, to: string | null) {
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

function bangkokDateInput(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(value)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

async function optionsPayload() {
  const [branches, products, suppliers] = await Promise.all([
    prisma.branches.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.products.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true, unit: true } }),
    prisma.suppliers.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
  ])

  return {
    branches,
    products,
    suppliers,
  }
}

async function nextPoBuyDocNo(tx: Prisma.TransactionClient, date: string, branchCode: string) {
  const compactDate = branchCode + date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `POB${compactDate}-`
  const rows = await tx.$queryRaw<Array<{ doc_no: string }>>`
    select doc_no
    from public.po_buys
    where doc_no like ${`${startsWith}%`}
  `
  const lastNumber = rows.reduce((max, row) => {
    const running = Number(row.doc_no.split('-').at(-1))
    return Number.isFinite(running) && running > max ? running : max
  }, 0)

  return `${startsWith}${String(lastNumber + 1).padStart(4, '0')}`
}

function poItems(values: PoBuyFormValues, products: ProductOption[], docNo: string) {
  const productById = new Map(products.map((product) => [product.id, product]))
  return values.items.map((item, index) => {
    const product = productById.get(item.productId)
    const remainingQty = values.requireDelivery ? item.qty : 0
    return {
      id: `${docNo}-${String(index + 1).padStart(2, '0')}`,
      productCode: product?.code ?? '',
      productId: item.productId,
      productName: product?.name ?? item.productId,
      qty: item.qty,
      remainingQty,
      totalCost: item.qty * item.unitPrice,
      unit: product?.unit ?? 'กก.',
      unitPrice: item.unitPrice,
    }
  })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const statusFilter = url.searchParams.get('status')
    const purposeFilter = url.searchParams.get('purpose')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const activeStatusFilter = statusFilter && statusFilter !== 'all' ? statusFilter : null
    const activePurposeFilter = purposeFilter && purposeFilter !== 'all' ? purposeFilter : null

    const poRows = await prisma.po_buys.findMany({
      include: { suppliers: true },
      orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
      take: 5000,
    })
    const itemProductIds = poRows.flatMap((row) => Array.isArray(row.items)
      ? row.items
        .filter((item): item is PoItem => typeof item === 'object' && item !== null)
        .map((item) => item.productId)
        .filter(Boolean)
      : [])
    const productIds = [...new Set([...poRows.map((row) => row.product_id).filter(Boolean), ...itemProductIds] as string[])]
    const products = productIds.length ? await prisma.products.findMany({ where: { id: { in: productIds } } }) : []
    const productById = new Map(products.map((product) => [product.id, product]))

    const rows = poRows.map((po) => {
      const productName = po.product_id ? productById.get(po.product_id)?.name ?? po.product_id : ''
      const items = itemsFromPo(po, productById, productName)
      const qty = items.reduce((sum, item) => sum + item.qty, 0) || toNumber(po.qty)
      const remainingQty = items.reduce((sum, item) => sum + item.remainingQty, 0) || toNumber(po.remaining_qty)
      const totalAmount = toNumber(po.total_amount) || items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
      const remainingAmount = toNumber(po.remaining_amount) || items.reduce((sum, item) => sum + item.remainingQty * item.unitPrice, 0)
      const requireDelivery = po.require_delivery !== false
      const status = po.status ?? 'Open'

      return {
        createdBy: po.created_by ?? '',
        date: toDateOnly(po.date),
        docNo: po.doc_no,
        expectedDelivery: toDateOnly(po.expected_delivery),
        id: po.id,
        itemCount: items.length,
        items,
        productName: items.map((item) => item.productName).filter(Boolean).join(', ') || productName || '-',
        purpose: po.purpose ?? '',
        purposeLabel: requireDelivery ? 'Delivery' : 'Costing',
        qty,
        remainingAmount,
        remainingQty,
        requireDelivery,
        status,
        supplierId: po.supplier_id ?? '',
        supplierName: po.suppliers?.name ?? po.supplier_id ?? '-',
        totalAmount,
      }
    })
      .filter((row) => !activeStatusFilter || row.status === activeStatusFilter)
      .filter((row) => !activePurposeFilter || (activePurposeFilter === 'delivery' ? row.requireDelivery : !row.requireDelivery))
      .filter((row) => dateInRange(row.date, from, to))
      .filter((row) => {
        if (!q) return true
        const productText = row.items.map((item) => item.productName).join(' ')
        return `${row.docNo} ${row.supplierName} ${productText} ${row.status} ${row.purpose} ${row.purposeLabel}`.toLowerCase().includes(q)
      })

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(rows.map((row) => ({
        CreatedBy: row.createdBy,
        Date: row.date,
        DocNo: row.docNo,
        ExpectedDelivery: row.expectedDelivery,
        ItemCount: row.itemCount,
        Product: row.productName,
        Purpose: row.purposeLabel,
        Qty: row.qty,
        RemainingAmount: row.remainingAmount,
        RemainingQty: row.remainingQty,
        Status: row.status,
        Supplier: row.supplierName,
        TotalAmount: row.totalAmount,
      }))), 'po_buy.xlsx')
    }

    return NextResponse.json({
      filters: {
        statuses: Array.from(new Set(poRows.map((row) => row.status ?? 'Open'))).sort(),
      },
      options: await optionsPayload(),
      rows,
      summary: {
        costingOnly: rows.filter((row) => !row.requireDelivery).length,
        delivery: rows.filter((row) => row.requireDelivery).length,
        open: rows.filter((row) => !['Cancelled', 'cancelled', 'Received', 'received'].includes(row.status)).length,
        remainingAmount: rows.reduce((sum, row) => sum + row.remainingAmount, 0),
        remainingQty: rows.reduce((sum, row) => sum + row.remainingQty, 0),
        totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
        totalRows: rows.length,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด PO Buy ไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = poBuyFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const issuedAt = new Date()
    const issuedDate = bangkokDateInput(issuedAt)
    const productIds = [...new Set(values.items.map((item) => item.productId))]
    const [branch, supplier, products] = await Promise.all([
      prisma.branches.findFirst({ where: { active: true, id: values.branchId }, select: { code: true, id: true, name: true } }),
      prisma.suppliers.findFirst({ where: { active: true, id: values.supplierId } }),
      prisma.products.findMany({ where: { active: true, id: { in: productIds } }, select: { active: true, code: true, id: true, name: true, unit: true } }),
    ])

    if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    if (!/^\d{2}$/.test(branch.code)) return NextResponse.json({ code: 'BAD_REQUEST', error: 'รหัสสาขาต้องเป็นตัวเลข 2 หลักเพื่อออกเลข PO', fieldErrors: { branchId: ['รหัสสาขาต้องเป็นตัวเลข 2 หลัก'] } }, { status: 400 })
    if (!supplier) return NextResponse.json({ code: 'BAD_REQUEST', error: 'Supplier ไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { supplierId: ['เลือก Supplier'] } }, { status: 400 })
    if (values.requireDelivery && values.expectedDelivery && values.expectedDelivery < issuedDate) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'วันส่งมอบต้องไม่ก่อนวันที่ออก PO',
        fieldErrors: { expectedDelivery: ['วันส่งมอบต้องไม่ก่อนวันที่ออก PO'] },
      }, { status: 400 })
    }

    const productById = new Map(products.map((product) => [product.id, product]))
    const missingProductIndex = values.items.findIndex((item) => !productById.has(item.productId))
    if (missingProductIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingProductIndex + 1}: สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`items.${missingProductIndex}.productId`]: ['สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('po_buys.doc_no'))`
      const docNo = await nextPoBuyDocNo(tx, issuedDate, branch.code)
      const items = poItems(values, products, docNo)
      const qty = items.reduce((sum, item) => sum + item.qty, 0)
      const remainingQty = items.reduce((sum, item) => sum + item.remainingQty, 0)
      const totalAmount = items.reduce((sum, item) => sum + item.totalCost, 0)
      const remainingAmount = values.requireDelivery ? items.reduce((sum, item) => sum + item.remainingQty * item.unitPrice, 0) : 0
      const firstItem = items[0]
      const deliveryDate = values.requireDelivery && values.expectedDelivery ? normalizeDate(values.expectedDelivery) : null

      return tx.po_buys.create({
        data: {
          branch_id: branch.id,
          channel_id: null,
          created_by: actor,
          created_at: issuedAt,
          date: normalizeDate(issuedDate),
          delivery_date: deliveryDate,
          doc_no: docNo,
          expected_delivery: deliveryDate,
          id: docNo,
          is_opening_pool: !values.requireDelivery,
          items,
          note: values.notes,
          notes: values.notes,
          product_id: firstItem.productId,
          purpose: values.requireDelivery ? 'FULL' : 'COSTING',
          qty,
          remaining_amount: remainingAmount,
          remaining_qty: remainingQty,
          require_delivery: values.requireDelivery,
          status: values.requireDelivery ? 'Open' : 'Received',
          supplier_id: values.supplierId,
          total_amount: totalAmount,
          unit_price: firstItem.unitPrice,
          updated_at: issuedAt,
          updated_by: actor,
          version: 1,
          warehouse_id: null,
        },
        select: { doc_no: true, id: true },
      })
    })

    return NextResponse.json({ docNo: created.doc_no, id: created.id }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึก PO Buy ไม่ได้', 500)
  }
}
