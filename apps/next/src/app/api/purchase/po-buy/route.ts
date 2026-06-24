import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { parseInternalBigIntId, requireBusinessCode, stringifyBusinessValue } from '@/lib/business-code'
import { poBuyCancelSchema, poBuyFormSchema, poBuyShortCloseSchema, poBuyUpdateSchema, type PoBuyFormValues } from '@/lib/po-buy'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission, getBranchCodeIntersection } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { appendPoBuyStatusLog, createInitialPoBuyStatusLog, PO_BUY_STATUS, reconcilePoBuys } from '@/lib/server/po-buy-reconciliation'
import { prisma } from '@/lib/server/prisma'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { isSupplierEligibleForBranch } from '@/lib/server/party-branch-eligibility'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { activeVatRatePercent } from '@/lib/server/tax-settings'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type PoItem = {
  productId?: string
  productName?: string
  qty?: number | string
  unitPrice?: number | string
  remainingQty?: number | string
  unit?: string | null
}

type ProductOption = {
  active: boolean | null
  code: string
  id: string
  name: string
  unit: string | null
}

type ProductRow = {
  active: boolean | null
  code: string | null
  id: bigint
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function calculatePoBuyTotals(params: {
  hasVat: boolean
  items: ReturnType<typeof poItems>
  vatRatePercent: number
}) {
  const subtotal = roundMoney(params.items.reduce((sum, item) => sum + item.totalCost, 0))
  const vatAmount = params.hasVat ? roundMoney(subtotal * params.vatRatePercent / 100) : 0
  const totalAmount = roundMoney(subtotal + vatAmount)
  return {
    hasVat: params.hasVat,
    remainingAmount: totalAmount,
    subtotal,
    totalAmount,
    vatAmount,
    vatRatePercent: params.vatRatePercent,
    vatType: params.hasVat ? 'EXCLUDE' : 'NONE',
  }
}

function itemsFromPo(row: {
  items: unknown
  product_id: bigint | null
  qty: unknown
  remaining_qty: unknown
  unit_price: unknown
}, productById: Map<bigint, { code: string | null; id: bigint; name: string | null; unit: string | null }>, productName: string) {
  if (Array.isArray(row.items) && row.items.length) {
    return row.items
      .filter((item): item is PoItem => typeof item === 'object' && item !== null)
      .map((item) => ({
        productId: item.productId ?? '',
        productName: item.productName ?? productName,
        qty: jsonNumber(item.qty),
        remainingQty: jsonNumber(item.remainingQty ?? item.qty),
        unit: item.unit ?? null,
        unitPrice: jsonNumber(item.unitPrice),
      }))
  }

  const product = row.product_id != null ? productById.get(row.product_id) : null

  return [{
    productId: row.product_id != null ? requireBusinessCode(product?.code, `สินค้า ${row.product_id}`) : '',
    productName,
    qty: jsonNumber(row.qty),
    remainingQty: jsonNumber(row.remaining_qty ?? row.qty),
    unit: product?.unit ?? null,
    unitPrice: jsonNumber(row.unit_price),
  }]
}

function buildWorkbook(rows: Array<Record<string, string | number>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'PO ซื้อ')
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

function stringifyComparable(value: unknown) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function supplierAddress(supplier: {
  address?: string | null
  address_line1?: string | null
  address_no?: string | null
  address_moo?: string | null
  address_village?: string | null
  address_road?: string | null
  address_subdistrict?: string | null
  address_district?: string | null
  address_province?: string | null
  address_postal_code?: string | null
} | null | undefined) {
  if (!supplier) return '-'
  const structured = [
    supplier.address_no,
    supplier.address_moo ? `หมู่ ${supplier.address_moo}` : null,
    supplier.address_village,
    supplier.address_road,
    supplier.address_subdistrict ? `ต.${supplier.address_subdistrict}` : null,
    supplier.address_district ? `อ.${supplier.address_district}` : null,
    supplier.address_province ? `จ.${supplier.address_province}` : null,
    supplier.address_postal_code,
  ].filter(Boolean).join(' ')
  return supplier.address || supplier.address_line1 || structured || '-'
}

function buildPoBuyEditMeta(params: {
  branchCode: string
  existing: {
    branch_id: bigint | null
    doc_no: string
    expected_delivery: Date | null
    items: Prisma.JsonValue | null
    notes: string | null
    qty: Prisma.Decimal | null
    remaining_amount: Prisma.Decimal | null
    remaining_qty: Prisma.Decimal | null
    subtotal: Prisma.Decimal | null
    supplier_id: bigint | null
    total_amount: Prisma.Decimal | null
    vat_amount: Prisma.Decimal | null
    vat_rate_percent: Prisma.Decimal
    vat_type: string | null
  }
  items: ReturnType<typeof poItems>
  previousBranchCode: string
  previousSupplierCode: string
  issuedDate: string
  supplierCode: string
  values: { expectedDelivery: string; hasVat: boolean; notes: string | null }
}) {
  const nextItemSnapshots = params.items.map((item) => ({
    productCode: item.productId,
    productName: item.productName,
    qty: item.qty,
    remainingQty: item.remainingQty,
    unitPrice: item.unitPrice,
  }))
  const existingItems = Array.isArray(params.existing.items)
    ? (params.existing.items as unknown[]).map((item) => {
        const record = typeof item === 'object' && item !== null ? item as Record<string, unknown> : {}
        return {
          productCode: stringifyComparable(record.productId),
          productName: stringifyComparable(record.productName),
          qty: jsonNumber(record.qty),
          remainingQty: jsonNumber(record.remainingQty),
          unitPrice: jsonNumber(record.unitPrice),
        }
      })
    : []
  const beforeSnapshot = {
    branchCode: params.previousBranchCode,
    docNo: params.existing.doc_no,
    expectedDelivery: toDateOnly(params.existing.expected_delivery),
    itemCount: existingItems.length,
    items: existingItems,
    notes: params.existing.notes ?? '',
    remainingAmount: toNumber(params.existing.remaining_amount),
    remainingQty: toNumber(params.existing.remaining_qty),
    subtotal: toNumber(params.existing.subtotal),
    supplierCode: params.previousSupplierCode,
    totalAmount: toNumber(params.existing.total_amount),
    totalQty: toNumber(params.existing.qty),
    vatAmount: toNumber(params.existing.vat_amount),
    vatRatePercent: toNumber(params.existing.vat_rate_percent),
    vatType: params.existing.vat_type ?? 'NONE',
  }
  const afterTotals = calculatePoBuyTotals({
    hasVat: params.values.hasVat,
    items: params.items,
    vatRatePercent: toNumber(params.existing.vat_rate_percent) || 7,
  })
  const afterSnapshot = {
    branchCode: params.branchCode,
    docNo: params.existing.doc_no,
    expectedDelivery: params.values.expectedDelivery || params.issuedDate,
    itemCount: nextItemSnapshots.length,
    items: nextItemSnapshots,
    notes: params.values.notes ?? '',
    remainingAmount: afterTotals.remainingAmount,
    remainingQty: params.items.reduce((sum, item) => sum + item.remainingQty, 0),
    subtotal: afterTotals.subtotal,
    supplierCode: params.supplierCode,
    totalAmount: afterTotals.totalAmount,
    totalQty: params.items.reduce((sum, item) => sum + item.qty, 0),
    vatAmount: afterTotals.vatAmount,
    vatRatePercent: afterTotals.vatRatePercent,
    vatType: afterTotals.vatType,
  }
  const changedFields = Object.keys(afterSnapshot).filter((key) => {
    const beforeValue = beforeSnapshot[key as keyof typeof beforeSnapshot]
    const afterValue = afterSnapshot[key as keyof typeof afterSnapshot]
    return stringifyComparable(beforeValue) !== stringifyComparable(afterValue)
  })

  return {
    after: afterSnapshot,
    before: beforeSnapshot,
    changedFields,
    reason: 'edit',
  } satisfies Prisma.InputJsonValue
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

async function resolveProductsByCodeOrId(productRefs: string[]) {
  const normalizedRefs = [...new Set(productRefs.map((value) => value.trim()).filter(Boolean))]
  const internalIds = normalizedRefs
    .map((value) => parseInternalBigIntId(value))
    .filter((value): value is bigint => value != null)
  const products = await prisma.products.findMany({
    select: { active: true, code: true, id: true, name: true, unit: true },
    where: {
      OR: [
        ...(normalizedRefs.length > 0 ? [{ code: { in: normalizedRefs } }] : []),
        ...(internalIds.length > 0 ? [{ id: { in: internalIds } }] : []),
      ],
    },
  })
  return {
    byInternalId: new Map(products.map((product) => [product.id, product])),
    byRef: new Map(products.flatMap((product) => {
      const outwardId = requireBusinessCode(product.code, `สินค้า ${product.id}`)
      return [
        [outwardId, product] as const,
        [stringifyBusinessValue(product.id), product] as const,
      ]
    })),
    rows: products,
  }
}

async function resolvePoBuyByDocNoOrId(idOrDocNo: string, client: Pick<typeof prisma, 'po_buys'> = prisma) {
  const internalId = parseInternalBigIntId(idOrDocNo)
  return client.po_buys.findFirst({
    where: {
      OR: [
        { doc_no: idOrDocNo },
        ...(internalId != null ? [{ id: internalId }] : []),
      ],
    },
  })
}

async function optionsPayload(allowedBranchCodes?: string[] | null) {
  const [branches, products, suppliers] = await Promise.all([
    prisma.branches.findMany({
      where: {
        ...(allowedBranchCodes ? { code: { in: allowedBranchCodes } } : {}),
      },
      orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }],
      select: { active: true, code: true, id: true, name: true },
    }),
    prisma.products.findMany({ orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true, unit: true } }),
    prisma.suppliers.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: {
        active: true,
        code: true,
        id: true,
        name: true,
        supplier_branches: {
          select: {
            branches: { select: { code: true } },
          },
          where: { active: true },
        },
      },
    }),
  ])

  return {
    branches: branches.map((branch) => ({ ...branch, id: branch.code })),
    products: products.map((product) => ({
      active: product.active,
      code: requireBusinessCode(product.code, `สินค้า ${product.id}`),
      id: requireBusinessCode(product.code, `สินค้า ${product.id}`),
      name: product.name,
      unit: product.unit,
    })),
    suppliers: suppliers.map((supplier) => ({
      active: supplier.active,
      branchIds: supplier.supplier_branches
        .map((mapping) => mapping.branches?.code)
        .filter((branchCode): branchCode is string => Boolean(branchCode)),
      code: supplier.code,
      id: requireBusinessCode(supplier.code, `ผู้ขาย ${supplier.id}`),
      name: supplier.name,
    })),
  }
}

const compactDate = (branchCode: string, date: string) => branchCode + date.slice(2, 4) + date.slice(5, 7)

async function nextPoBuyDocNo(tx: Prisma.TransactionClient, date: string, branchCode: string) {
  const startsWith = `POB${compactDate(branchCode, date)}-`
  await tx.$executeRaw`
    select pg_advisory_xact_lock(hashtext(${`po_buys:${startsWith}`}))
  `
  const rows = await tx.$queryRaw<Array<{ doc_no: string }>>`
    select doc_no
    from public.po_buys
    where doc_no like ${`${startsWith}%`}
    order by doc_no desc
    limit 1
  `
  const parsedLastNumber = Number(rows[0]?.doc_no.split('-').at(-1) ?? 0)
  const lastNumber = Number.isFinite(parsedLastNumber) ? parsedLastNumber : 0

  return `${startsWith}${String(lastNumber + 1).padStart(4, '0')}`
}

function poItems(values: PoBuyFormValues, products: ProductRow[], docNo: string) {
  const productById = new Map(products.map((product) => {
    const outwardId = requireBusinessCode(product.code, `สินค้า ${product.id}`)
    return [outwardId, product] as const
  }))
  return values.items.map((item, index) => {
    const product = productById.get(item.productId)
    return {
      productCode: product?.code ? requireBusinessCode(product.code, `สินค้า ${product.id}`) : '',
      productId: item.productId,
      productIdInternal: product ? stringifyBusinessValue(product.id) : '',
      productName: product?.name ?? item.productId ?? '-',
      qty: item.qty,
      remainingQty: item.qty,
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

    const allowedBranchCodes = getBranchCodeIntersection(context)
    let allowedBranchIds: bigint[] | undefined = undefined

    if (allowedBranchCodes) {
      const matchingBranches = await prisma.branches.findMany({
        where: { code: { in: allowedBranchCodes } },
        select: { id: true },
      })
      allowedBranchIds = matchingBranches.map((b) => b.id)
    }

    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.trim().toLowerCase()
    const statusFilter = url.searchParams.get('status')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const selectedIds = new Set((url.searchParams.get('ids') ?? '').split(',').map((id) => id.trim()).filter(Boolean))
    const activeStatusFilters = (statusFilter ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value && value !== 'all')

    const [poRows, vatRatePercent] = await Promise.all([
      prisma.po_buys.findMany({
        select: {
          branch_id: true,
          cancelled_at: true,
          cancelled_by: true,
          cancel_note: true,
          created_at: true,
          created_by: true,
          date: true,
          delivery_date: true,
          doc_no: true,
          expected_delivery: true,
          has_vat: true,
          id: true,
          items: true,
          note: true,
          notes: true,
          po_buy_allocation_logs: {
            orderBy: [{ created_at: 'desc' }],
            select: {
              action: true,
              allocated_amount: true,
              allocated_qty: true,
              created_at: true,
              created_by: true,
              event_key: true,
              from_remaining_qty: true,
              meta: true,
              note: true,
              po_buy_doc_no: true,
              product_code_snapshot: true,
              product_name_snapshot: true,
              purchase_bill_doc_no: true,
              purchase_bill_line_no: true,
              to_remaining_qty: true,
              unit_price_snapshot: true,
            },
            take: 50,
          },
          po_buy_status_logs: {
            orderBy: [{ created_at: 'desc' }],
            select: {
              action: true,
              created_at: true,
              created_by: true,
              event_key: true,
              from_status: true,
              meta: true,
              note: true,
              po_buy_doc_no: true,
              to_status: true,
            },
            take: 20,
          },
          product_id: true,
          qty: true,
          remaining_amount: true,
          remaining_qty: true,
          short_closed_at: true,
          short_closed_by: true,
          short_closed_note: true,
          short_closed_qty: true,
          status: true,
          subtotal: true,
          suppliers: {
            select: {
              address: true,
              address_district: true,
              address_line1: true,
              address_moo: true,
              address_no: true,
              address_postal_code: true,
              address_province: true,
              address_road: true,
              address_subdistrict: true,
              address_village: true,
              code: true,
              name: true,
            },
          },
          supplier_id: true,
          total_amount: true,
          unit_price: true,
          updated_at: true,
          updated_by: true,
          vat_amount: true,
          vat_rate_percent: true,
          vat_type: true,
        },
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        take: 5000,
        where: {
          ...(allowedBranchIds ? { branch_id: { in: allowedBranchIds } } : {}),
        },
      }),
      activeVatRatePercent(new Date()),
    ])
    const productIds = [...new Set(poRows.map((row) => row.product_id).filter((value): value is bigint => value != null))]
    const branchIds = [...new Set(poRows.map((row) => row.branch_id).filter((id): id is bigint => id !== null))]
    const [branches, products] = await Promise.all([
      branchIds.length ? prisma.branches.findMany({ where: { id: { in: branchIds } }, select: { code: true, id: true, name: true } }) : Promise.resolve([]),
      productIds.length ? prisma.products.findMany({ where: { id: { in: productIds } }, select: { code: true, id: true, name: true, unit: true } }) : Promise.resolve([]),
    ])
    const branchById = new Map(branches.map((branch) => [branch.id, branch]))
    const productById = new Map(products.map((product) => [product.id, product]))

    const rows = poRows.map((po) => {
      const productName = po.product_id ? productById.get(po.product_id)?.name ?? '-' : '-'
      const items = itemsFromPo(po, productById, productName)
      const qty = items.reduce((sum, item) => sum + item.qty, 0) || toNumber(po.qty)
      const remainingQty = items.reduce((sum, item) => sum + item.remainingQty, 0) || toNumber(po.remaining_qty)
      const itemSubtotal = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0)
      const subtotal = toNumber(po.subtotal) || itemSubtotal
      const vatAmount = toNumber(po.vat_amount)
      const hasVat = Boolean(po.has_vat) || vatAmount > 0
      const totalAmount = toNumber(po.total_amount) || subtotal + vatAmount
      const remainingAmount = toNumber(po.remaining_amount) || items.reduce((sum, item) => sum + item.remainingQty * item.unitPrice, 0)
      const status = po.status ?? 'Open'

      return {
        createdAt: po.created_at?.toISOString() ?? '',
        createdBy: po.created_by ?? '',
        branchId: po.branch_id ? branchById.get(po.branch_id)?.code ?? '' : '',
        branchName: po.branch_id ? branchById.get(po.branch_id)?.name ?? '' : '',
        date: toDateOnly(po.date),
        docNo: po.doc_no,
        expectedDelivery: toDateOnly(po.expected_delivery),
        id: po.doc_no,
        itemCount: items.length,
        items,
        notes: po.notes ?? po.note ?? '',
        productName: items.map((item) => item.productName).filter(Boolean).join(', ') || productName || '-',
        qty,
        remainingAmount,
        remainingQty,
        shortClosedAt: po.short_closed_at?.toISOString() ?? '',
        shortClosedBy: po.short_closed_by ?? '',
        shortClosedNote: po.short_closed_note ?? '',
        shortClosedQty: toNumber(po.short_closed_qty),
        status,
        allocationLogs: po.po_buy_allocation_logs.map((log) => ({
          action: log.action,
          allocatedAmount: toNumber(log.allocated_amount),
          allocatedQty: toNumber(log.allocated_qty),
          createdAt: log.created_at?.toISOString() ?? '',
          createdBy: log.created_by ?? '',
          eventKey: log.event_key,
          fromRemainingQty: toNumber(log.from_remaining_qty),
          id: log.event_key,
          meta: log.meta,
          note: log.note ?? '',
          poBuyDocNo: log.po_buy_doc_no,
          productCode: log.product_code_snapshot ?? '',
          productName: log.product_name_snapshot ?? '',
          purchaseBillDocNo: log.purchase_bill_doc_no ?? '',
          purchaseBillLineNo: log.purchase_bill_line_no ?? null,
          toRemainingQty: toNumber(log.to_remaining_qty),
          unitPrice: toNumber(log.unit_price_snapshot),
        })),
        statusLogs: po.po_buy_status_logs.map((log) => ({
          action: log.action,
          createdAt: log.created_at?.toISOString() ?? '',
          createdBy: log.created_by ?? '',
          eventKey: log.event_key,
          fromStatus: log.from_status ?? '',
          id: log.event_key,
          meta: log.meta,
          note: log.note ?? '',
          poBuyDocNo: log.po_buy_doc_no,
          toStatus: log.to_status,
        })),
        supplierId: po.suppliers?.code ?? '',
        supplierAddress: supplierAddress(po.suppliers),
        supplierName: po.suppliers?.name ?? '-',
        hasVat,
        subtotal,
        totalAmount,
        updatedAt: po.updated_at?.toISOString() ?? '',
        updatedBy: po.updated_by ?? '',
        vatAmount,
        vatRatePercent: toNumber(po.vat_rate_percent) || vatRatePercent,
        vatType: po.vat_type ?? (hasVat ? 'EXCLUDE' : 'NONE'),
      }
    })
      .filter((row) => selectedIds.size === 0 || selectedIds.has(row.id))
      .filter((row) => activeStatusFilters.length === 0 || activeStatusFilters.includes(row.status))
      .filter((row) => dateInRange(row.date, from, to))
      .filter((row) => {
        if (!q) return true
        const productText = row.items.map((item) => item.productName).join(' ')
        return `${row.docNo} ${row.supplierName} ${productText} ${row.status} ${row.notes}`.toLowerCase().includes(q)
      })

    if (url.searchParams.get('format') === 'xlsx') {
      return xlsxResponse(buildWorkbook(rows.map((row) => ({
        เลขที่: row.docNo,
        วันที่: row.date,
        ผู้ขาย: row.supplierName,
        สาขา: row.branchId || '-',
        สินค้า: row.productName,
        จำนวนรายการ: row.itemCount,
        จำนวนรวม: row.qty,
        'ยอดก่อน VAT': row.subtotal,
        VAT: row.vatAmount,
        ยอดรวม: row.totalAmount,
        รอรับรวม: row.remainingQty,
        มูลค่าคงเหลือ: row.remainingAmount,
        วันที่กำหนดส่ง: row.expectedDelivery,
        สถานะ: row.status,
        หมายเหตุ: row.notes,
        อัปเดตล่าสุด: row.updatedAt || row.createdAt,
        อัปเดตโดย: row.updatedBy || row.createdBy,
        สร้างโดย: row.createdBy,
      }))), `po_buy_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    return NextResponse.json({
      filters: {
        statuses: Array.from(new Set(poRows.map((row) => row.status ?? 'Open'))).sort(),
      },
      options: await optionsPayload(allowedBranchCodes),
      rows,
      summary: {
        open: rows.filter((row) => row.status === PO_BUY_STATUS.OPEN).length,
        partial: rows.filter((row) => row.status === PO_BUY_STATUS.PARTIAL).length,
        received: rows.filter((row) => row.status === PO_BUY_STATUS.RECEIVED).length,
        shortClosed: rows.filter((row) => row.status === PO_BUY_STATUS.SHORT_CLOSED).length,
        remainingAmount: rows.reduce((sum, row) => sum + row.remainingAmount, 0),
        remainingQty: rows.reduce((sum, row) => sum + row.remainingQty, 0),
        totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
        totalRows: rows.length,
      },
      vatRatePercent,
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
    const [branch, supplier, resolvedProducts, vatRatePercent] = await Promise.all([
      findActiveBranchReferenceByCodeOrId(values.branchId),
      findActiveSupplierReferenceByCodeOrId(values.supplierId),
      resolveProductsByCodeOrId(productIds),
      activeVatRatePercent(normalizeDate(issuedDate)),
    ])

    if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    const allowedBranchCodes = getBranchCodeIntersection(context)
    if (allowedBranchCodes && !allowedBranchCodes.includes(branch.code)) {
      return NextResponse.json({ code: 'FORBIDDEN', error: 'ไม่มีสิทธิ์ทำรายการในสาขานี้' }, { status: 403 })
    }
    if (!/^\d{2}$/.test(branch.code)) return NextResponse.json({ code: 'BAD_REQUEST', error: 'รหัสสาขาต้องเป็นตัวเลข 2 หลักเพื่อออกเลข PO', fieldErrors: { branchId: ['รหัสสาขาต้องเป็นตัวเลข 2 หลัก'] } }, { status: 400 })
    if (!supplier) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { supplierId: ['เลือกผู้ขาย'] } }, { status: 400 })
    if (!(await isSupplierEligibleForBranch({ branchId: branch.id, supplierId: supplier.id }))) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'ผู้ขายไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้',
        fieldErrors: { supplierId: ['ผู้ขายไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้'] },
      }, { status: 400 })
    }
    if (values.expectedDelivery < issuedDate) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'วันส่งมอบต้องไม่ก่อนวันที่ออก PO',
        fieldErrors: { expectedDelivery: ['วันส่งมอบต้องไม่ก่อนวันที่ออก PO'] },
      }, { status: 400 })
    }

    const missingProductIndex = values.items.findIndex((item) => !resolvedProducts.byRef.has(item.productId))
    if (missingProductIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingProductIndex + 1}: สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`items.${missingProductIndex}.productId`]: ['สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }

    const created = await prisma.$transaction(async (tx) => {
      const docNo = await nextPoBuyDocNo(tx, issuedDate, branch.code)
      const items = poItems(values, resolvedProducts.rows, docNo)
      const qty = items.reduce((sum, item) => sum + item.qty, 0)
      const remainingQty = items.reduce((sum, item) => sum + item.remainingQty, 0)
      const totals = calculatePoBuyTotals({ hasVat: values.hasVat, items, vatRatePercent })
      const firstItem = items[0]
      const deliveryDate = normalizeDate(values.expectedDelivery)

      const createdRow = await tx.po_buys.create({
        data: {
          branch_id: branch.id,
          channel_id: null,
          created_by: actor,
          created_at: issuedAt,
          date: normalizeDate(issuedDate),
          delivery_date: deliveryDate,
          doc_no: docNo,
          expected_delivery: deliveryDate,
          is_opening_pool: false,
          items,
          has_vat: totals.hasVat,
          note: values.notes,
          notes: values.notes,
          product_id: parseInternalBigIntId(firstItem.productIdInternal),
          qty,
          remaining_amount: totals.remainingAmount,
          remaining_qty: remainingQty,
          status: 'Open',
          subtotal: totals.subtotal,
          supplier_id: supplier.id,
          total_amount: totals.totalAmount,
          unit_price: firstItem.unitPrice,
          updated_at: issuedAt,
          updated_by: actor,
          vat_amount: totals.vatAmount,
          vat_rate_percent: totals.vatRatePercent,
          vat_type: totals.vatType,
          version: 1,
          warehouse_id: null,
        },
        select: { doc_no: true, id: true },
      })
      await createInitialPoBuyStatusLog(tx, { actor, poBuyDocNo: createdRow.doc_no, poBuyId: createdRow.id })
      return createdRow
    })

    return NextResponse.json({ docNo: created.doc_no, id: created.doc_no }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึก PO Buy ไม่ได้', 500)
  }
}

export async function PUT(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = poBuyUpdateSchema.parse(await request.json())
    const actor = currentActor(context)
    const productIds = [...new Set(values.items.map((item) => item.productId))]
    const [existing, branch, supplier, products] = await Promise.all([
      resolvePoBuyByDocNoOrId(values.id),
      findActiveBranchReferenceByCodeOrId(values.branchId),
      findActiveSupplierReferenceByCodeOrId(values.supplierId),
      resolveProductsByCodeOrId(productIds),
    ])

    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบ PO Buy ที่ต้องการแก้ไข' }, { status: 404 })
    const allowedBranchCodes = getBranchCodeIntersection(context)

    if (existing.branch_id != null) {
      const existingBranch = await prisma.branches.findUnique({
        where: { id: existing.branch_id }
      })
      if (allowedBranchCodes && (!existingBranch || !allowedBranchCodes.includes(existingBranch.code))) {
        return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบ PO Buy ที่ต้องการแก้ไข' }, { status: 404 })
      }
    }

    const existingQty = toNumber(existing.qty)
    const existingRemainingQty = toNumber(existing.remaining_qty)
    const existingTotalAmount = toNumber(existing.total_amount)
    const existingRemainingAmount = toNumber(existing.remaining_amount)
    const isUnreceived = existing.status === PO_BUY_STATUS.OPEN && existingQty === existingRemainingQty && existingTotalAmount === existingRemainingAmount && !existing.short_closed_at
    if (!isUnreceived) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'แก้ไขได้เฉพาะ PO Buy ที่ยังไม่ถูกตัดรับสินค้า' }, { status: 400 })
    }
    if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    if (allowedBranchCodes && !allowedBranchCodes.includes(branch.code)) {
      return NextResponse.json({ code: 'FORBIDDEN', error: 'ไม่มีสิทธิ์ทำรายการในสาขาปลายทางที่เลือก' }, { status: 403 })
    }
    if (!supplier) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { supplierId: ['เลือกผู้ขาย'] } }, { status: 400 })
    if (!(await isSupplierEligibleForBranch({ branchId: branch.id, supplierId: supplier.id }))) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'ผู้ขายไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้',
        fieldErrors: { supplierId: ['ผู้ขายไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้'] },
      }, { status: 400 })
    }
    const [previousBranch, previousSupplier] = await Promise.all([
      existing.branch_id != null ? findActiveBranchReferenceByCodeOrId(stringifyBusinessValue(existing.branch_id)) : Promise.resolve(null),
      existing.supplier_id != null ? findActiveSupplierReferenceByCodeOrId(stringifyBusinessValue(existing.supplier_id)) : Promise.resolve(null),
    ])

    const issuedDate = bangkokDateInput(existing.created_at ?? new Date())
    if (values.expectedDelivery < issuedDate) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'วันส่งมอบต้องไม่ก่อนวันที่ออก PO',
        fieldErrors: { expectedDelivery: ['วันส่งมอบต้องไม่ก่อนวันที่ออก PO'] },
      }, { status: 400 })
    }

    const missingProductIndex = values.items.findIndex((item) => !products.byRef.has(item.productId))
    if (missingProductIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingProductIndex + 1}: สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`items.${missingProductIndex}.productId`]: ['สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }

    const items = poItems(values, products.rows, existing.doc_no)
    const qty = items.reduce((sum, item) => sum + item.qty, 0)
    const remainingQty = items.reduce((sum, item) => sum + item.remainingQty, 0)
    const vatRatePercent = toNumber(existing.vat_rate_percent) || await activeVatRatePercent(normalizeDate(issuedDate))
    const totals = calculatePoBuyTotals({ hasVat: values.hasVat, items, vatRatePercent })
    const firstItem = items[0]
    const deliveryDate = normalizeDate(values.expectedDelivery)

    const updatedAt = new Date()
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.po_buys.update({
        where: { id: existing.id },
        data: {
          branch_id: branch.id,
          delivery_date: deliveryDate,
          expected_delivery: deliveryDate,
          has_vat: totals.hasVat,
          items,
          note: values.notes,
          notes: values.notes,
          product_id: parseInternalBigIntId(firstItem.productIdInternal),
          qty,
          remaining_amount: totals.remainingAmount,
          remaining_qty: remainingQty,
          subtotal: totals.subtotal,
          supplier_id: supplier.id,
          total_amount: totals.totalAmount,
          unit_price: firstItem.unitPrice,
          updated_at: updatedAt,
          updated_by: actor,
          vat_amount: totals.vatAmount,
          vat_rate_percent: totals.vatRatePercent,
          vat_type: totals.vatType,
          version: { increment: 1 },
        },
        select: { doc_no: true, id: true, status: true },
      })
      await appendPoBuyStatusLog(tx, {
        actor,
        createdAt: updatedAt,
        fromStatus: existing.status ?? PO_BUY_STATUS.OPEN,
        meta: buildPoBuyEditMeta({
          branchCode: branch.code,
          existing,
          items,
          previousBranchCode: previousBranch?.code ?? '',
          previousSupplierCode: previousSupplier?.code ?? '',
          issuedDate,
          supplierCode: supplier.code,
          values: { expectedDelivery: values.expectedDelivery, hasVat: values.hasVat, notes: values.notes },
        }),
        poBuyDocNo: existing.doc_no,
        poBuyId: existing.id,
        reason: 'edit',
        toStatus: row.status ?? PO_BUY_STATUS.OPEN,
      })
      return row
    })

    return NextResponse.json({ docNo: updated.doc_no, id: updated.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'แก้ไข PO Buy ไม่ได้', 500)
  }
}

export async function PATCH(request: Request) {
  let action = 'cancel'
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const raw = await request.json()
    const actor = currentActor(context)
    action = typeof raw?.action === 'string' ? raw.action : 'cancel'

    if (action === 'shortClose') {
      const values = poBuyShortCloseSchema.parse(raw)
      const existing = await resolvePoBuyByDocNoOrId(values.id)
      if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบ PO Buy ที่ต้องการปิดรับไม่ครบ' }, { status: 404 })

      const allowedBranchCodes = getBranchCodeIntersection(context)
      if (existing.branch_id != null) {
        const existingBranch = await prisma.branches.findUnique({
          where: { id: existing.branch_id }
        })
        if (allowedBranchCodes && (!existingBranch || !allowedBranchCodes.includes(existingBranch.code))) {
          return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบ PO Buy ที่ต้องการปิดรับไม่ครบ' }, { status: 404 })
        }
      }
      if (existing.status === PO_BUY_STATUS.CANCELLED) return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Buy นี้ถูกยกเลิกแล้ว' }, { status: 400 })
      if (existing.status === PO_BUY_STATUS.SHORT_CLOSED) return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Buy นี้ถูกปิดรับไม่ครบแล้ว' }, { status: 400 })
      if (existing.status === PO_BUY_STATUS.RECEIVED || toNumber(existing.remaining_qty) <= 0.0001) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Buy นี้รับครบแล้ว ไม่สามารถปิดรับไม่ครบได้' }, { status: 400 })
      }
      if (existing.status !== PO_BUY_STATUS.PARTIAL) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'ปิดรับไม่ครบได้เฉพาะ PO Buy ที่รับบางส่วนแล้ว' }, { status: 400 })
      }

      const shortClosedAt = new Date()
      const updated = await prisma.$transaction(async (tx) => {
        const current = await resolvePoBuyByDocNoOrId(values.id, tx)
        if (!current) throw new Error('NOT_FOUND')
        const updatedRow = await tx.po_buys.update({
          where: { id: current.id },
          data: {
            short_closed_amount: toNumber(current.remaining_amount),
            short_closed_at: shortClosedAt,
            short_closed_by: actor,
            short_closed_note: values.note,
            short_closed_qty: toNumber(current.remaining_qty),
            updated_at: shortClosedAt,
            updated_by: actor,
            version: { increment: 1 },
          },
          select: { doc_no: true, id: true },
        })
        await reconcilePoBuys(tx, [current.id], {
          actor,
          statusMetaByPoId: new Map([[current.id, { reason: 'short_close_action' }]]),
          statusNoteByPoId: new Map([[current.id, values.note]]),
        })
        return updatedRow
      })

      return NextResponse.json({ docNo: updated.doc_no, id: updated.doc_no, status: PO_BUY_STATUS.SHORT_CLOSED })
    }

    const values = poBuyCancelSchema.parse(raw)
    const existing = await resolvePoBuyByDocNoOrId(values.id)
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบ PO Buy ที่ต้องการยกเลิก' }, { status: 404 })

    const allowedBranchCodes = getBranchCodeIntersection(context)
    if (existing.branch_id != null) {
      const existingBranch = await prisma.branches.findUnique({
        where: { id: existing.branch_id }
      })
      if (allowedBranchCodes && (!existingBranch || !allowedBranchCodes.includes(existingBranch.code))) {
        return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบ PO Buy ที่ต้องการยกเลิก' }, { status: 404 })
      }
    }
    if (String(existing.status ?? '').toLowerCase().includes('cancel')) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'PO Buy นี้ถูกยกเลิกแล้ว' }, { status: 400 })
    }

    const existingQty = toNumber(existing.qty)
    const existingRemainingQty = toNumber(existing.remaining_qty)
    const existingTotalAmount = toNumber(existing.total_amount)
    const existingRemainingAmount = toNumber(existing.remaining_amount)
    const isUnreceived = existing.status === PO_BUY_STATUS.OPEN && existingQty === existingRemainingQty && existingTotalAmount === existingRemainingAmount && !existing.short_closed_at
    if (!isUnreceived) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ยกเลิกได้เฉพาะ PO Buy ที่ยังไม่ถูกตัดรับสินค้า' }, { status: 400 })
    }

    const cancelledAt = new Date()
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.po_buys.update({
        where: { id: existing.id },
        data: {
          cancel_note: values.note,
          cancelled_at: cancelledAt,
          cancelled_by: actor,
          remaining_amount: 0,
          remaining_qty: 0,
          status: PO_BUY_STATUS.CANCELLED,
          updated_at: cancelledAt,
          updated_by: actor,
          version: { increment: 1 },
        },
        select: { doc_no: true, id: true },
      })
      await appendPoBuyStatusLog(tx, {
        actor,
        createdAt: cancelledAt,
        fromStatus: existing.status ?? PO_BUY_STATUS.OPEN,
        meta: { reason: 'cancel_action' },
        note: values.note,
        poBuyDocNo: existing.doc_no,
        poBuyId: existing.id,
        reason: 'cancel_action',
        toStatus: PO_BUY_STATUS.CANCELLED,
      })
      return row
    })

    return NextResponse.json({ docNo: updated.doc_no, id: updated.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, action === 'shortClose' ? 'ปิดรับไม่ครบไม่สำเร็จ' : 'ยกเลิก PO Buy ไม่ได้', 500)
  }
}
