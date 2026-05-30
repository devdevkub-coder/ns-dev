import * as XLSX from 'xlsx'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { supplierAdvancePaymentFormSchema } from '@/lib/purchase-advance'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { advancePaymentStatusLabel, mapAdvancePaymentRow, parseBangkokDateTimeInput } from '@/lib/server/advance-payments'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, listDailyAccounts, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type AdvancePaymentRow = Prisma.supplier_advance_paymentsGetPayload<{
  include: {
    accounts: true
    branches: true
    suppliers: true
    supplier_advance_allocations: {
      include: {
        purchase_bills: {
          select: {
            doc_no: true
            id: true
          }
        }
      }
    }
  }
}>

type PaymentMethodOption = {
  active: boolean
  id: string
  name: string
  type: string
}

function rowJson(row: AdvancePaymentRow) {
  return mapAdvancePaymentRow(row)
}

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

function parseSortDirection(value: string | null): Prisma.SortOrder {
  return value === 'asc' ? 'asc' : 'desc'
}

function parseSortKey(value: string | null) {
  const allowed = new Set(['accountName', 'advanceDate', 'allocatedAmount', 'amount', 'docNo', 'largeScaleDocNo', 'netWeight', 'productName', 'remainingAmount', 'status', 'supplierName'])
  return allowed.has(value ?? '') ? value! : 'advanceDate'
}

function orderByFor(sortKey: string, direction: Prisma.SortOrder): Prisma.supplier_advance_paymentsOrderByWithRelationInput[] {
  const primary: Prisma.supplier_advance_paymentsOrderByWithRelationInput = (() => {
    switch (sortKey) {
      case 'accountName':
        return { accounts: { name: direction } }
      case 'allocatedAmount':
        return { allocated_amount: direction }
      case 'amount':
        return { amount: direction }
      case 'docNo':
        return { doc_no: direction }
      case 'largeScaleDocNo':
        return { large_scale_doc_no: direction }
      case 'netWeight':
        return { net_weight: direction }
      case 'productName':
        return { product_name: direction }
      case 'remainingAmount':
        return { remaining_amount: direction }
      case 'status':
        return { status: direction }
      case 'supplierName':
        return { suppliers: { name: direction } }
      case 'advanceDate':
      default:
        return { advance_date: direction }
    }
  })()

  return [primary, { created_at: 'desc' }, { doc_no: direction }]
}

function buildWorkbook(rows: ReturnType<typeof rowJson>[]) {
  const workbookRows = rows.map((row) => ({
    เลขที่: row.docNo,
    วันที่: row.advanceDate,
    ผู้ขาย: row.supplierName,
    รหัสผู้ขาย: row.supplierCode,
    สาขา: row.branchName,
    ใบชั่งใหญ่: row.largeScaleDocNo || '-',
    ทะเบียนรถ: row.plateNo || '-',
    สินค้า: row.productName || '-',
    น้ำหนักสุทธิ: row.netWeight,
    ราคา_ต่อ_กก: row.pricePerKg,
    ยอดมัดจำ: row.amount,
    ใช้แล้ว: row.allocatedAmount,
    คงเหลือ: row.remainingAmount,
    วิธีจ่าย: row.paymentMethod,
    บัญชีจ่าย: row.accountName,
    สถานะ: row.statusLabel,
  }))
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(workbookRows)
  const headers = workbookRows[0] ? Object.keys(workbookRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, workbookRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Advance Payments')
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

function bangkokDateString(date: Date) {
  const formatter = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

async function nextAdvanceDocNo(branchId: string, date: string) {
  const branch = await prisma.branches.findUnique({
    select: { code: true },
    where: { id: branchId },
  })
  const branchCode = (branch?.code ?? '00').replace(/\D/g, '').padStart(2, '0').slice(0, 2)
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `ADV${branchCode}${compactDate}-`
  const last = await prisma.supplier_advance_payments.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith } },
  })
  const lastNumber = Number(String(last?.doc_no ?? '').slice(startsWith.length))
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1
  return `${startsWith}${String(nextNumber).padStart(4, '0')}`
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const page = parsePositiveInt(url.searchParams.get('page'), 1, 10000)
    const pageSize = parsePositiveInt(url.searchParams.get('pageSize'), 25, 100)
    const q = url.searchParams.get('q')?.trim()
    const sortDirection = parseSortDirection(url.searchParams.get('sortDirection'))
    const sortKey = parseSortKey(url.searchParams.get('sortKey'))
    const statuses = (url.searchParams.get('statuses') ?? url.searchParams.get('status') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const dateFrom = url.searchParams.get('dateFrom')?.trim()
    const dateTo = url.searchParams.get('dateTo')?.trim()

    const where: Prisma.supplier_advance_paymentsWhereInput = {
      ...(statuses.length > 0 ? { status: { in: statuses } } : {}),
      ...(dateFrom || dateTo
        ? {
            advance_date: {
              ...(dateFrom ? { gte: normalizeDate(dateFrom) } : {}),
              ...(dateTo ? { lte: normalizeDate(dateTo) } : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { doc_no: { contains: q, mode: 'insensitive' } },
              { large_scale_doc_no: { contains: q, mode: 'insensitive' } },
              { plate_no: { contains: q, mode: 'insensitive' } },
              { product_name: { contains: q, mode: 'insensitive' } },
              { customer_name: { contains: q, mode: 'insensitive' } },
              { suppliers: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    }

    const [accounts, branches, paymentMethods, products, rows, summaryRows, suppliers, totalRows] = await Promise.all([
      listDailyAccounts(),
      prisma.branches.findMany({
        orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
      }),
      prisma.payment_methods.findMany({
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: { active: true, id: true, name: true, type: true },
      }),
      prisma.products.findMany({
        orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, name: true, unit: true },
        take: 5000,
      }),
      prisma.supplier_advance_payments.findMany({
        include: {
          accounts: true,
          branches: true,
          suppliers: true,
          supplier_advance_allocations: {
            include: {
              purchase_bills: {
                select: { doc_no: true, id: true },
              },
            },
          },
        },
        orderBy: orderByFor(sortKey, sortDirection),
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.supplier_advance_payments.findMany({
        select: {
          allocated_amount: true,
          amount: true,
          remaining_amount: true,
          status: true,
        },
        take: 10000,
        where,
      }),
      prisma.suppliers.findMany({
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
        take: 5000,
      }),
      prisma.supplier_advance_payments.count({ where }),
    ])

    const mappedRows = rows.map(rowJson)
    const summary = summaryRows.reduce((accumulator, row) => ({
      pendingCount: accumulator.pendingCount + (row.status === 'pending_approval' ? 1 : 0),
      totalAdvance: accumulator.totalAdvance + toNumber(row.amount),
      totalAllocated: accumulator.totalAllocated + toNumber(row.allocated_amount),
      totalRemaining: accumulator.totalRemaining + Math.max(0, toNumber(row.remaining_amount)),
    }), {
      pendingCount: 0,
      totalAdvance: 0,
      totalAllocated: 0,
      totalRemaining: 0,
    })

    if (url.searchParams.get('format') === 'xlsx') {
      const exportRows = await prisma.supplier_advance_payments.findMany({
        include: {
          accounts: true,
          branches: true,
          suppliers: true,
          supplier_advance_allocations: {
            include: {
              purchase_bills: {
                select: { doc_no: true, id: true },
              },
            },
          },
        },
        orderBy: orderByFor(sortKey, sortDirection),
        take: 10000,
        where,
      })
      return xlsxResponse(buildWorkbook(exportRows.map(rowJson)), `purchase_advance_payments_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    return NextResponse.json({
      accounts,
      branches,
      filters: {
        statuses: [
          { label: 'ทั้งหมด', value: 'all' },
          { label: 'ยังไม่อนุมัติ', value: 'pending_approval' },
          { label: 'อนุมัติแล้ว', value: 'approved' },
          { label: 'จ่ายแล้ว', value: 'paid' },
          { label: 'ใช้หักบิลบางส่วน', value: 'partially_allocated' },
          { label: 'ใช้หักบิลแล้ว', value: 'allocated' },
          { label: 'รอคืนเงิน', value: 'refunding' },
          { label: 'คืนเงินแล้ว', value: 'refunded' },
          { label: 'ยกเลิก', value: 'cancelled' },
        ],
      },
      pagination: {
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
        totalRows,
      },
      paymentMethods: paymentMethods.map((method): PaymentMethodOption => ({
        active: method.active,
        id: method.id,
        name: method.name,
        type: method.type,
      })),
      products: products.map((product) => ({
        active: product.active,
        code: product.code,
        id: product.id,
        name: product.name,
        unit: product.unit,
      })),
      rows: mappedRows,
      summary,
      suppliers,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการจ่ายเงินล่วงหน้าไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = supplierAdvancePaymentFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const createdAt = new Date()
    const advanceDate = bangkokDateString(createdAt)
    const id = `ADV-${randomUUID()}`
    const docNo = values.docNo ?? await nextAdvanceDocNo(values.branchId, advanceDate)

    const result = await prisma.supplier_advance_payments.create({
      data: {
        advance_date: normalizeDate(advanceDate),
        allocated_amount: 0,
        amount: values.amount,
        branch_id: values.branchId,
        created_by: actor,
        customer_name: values.customerName,
        doc_no: docNo,
        driver_name: values.driverName,
        funding_account_id: values.fundingAccountId,
        id,
        in_date: values.inDate ? parseBangkokDateTimeInput(values.inDate) : null,
        large_scale_doc_no: values.largeScaleDocNo,
        net_weight: values.netWeight,
        out_date: values.outDate ? parseBangkokDateTimeInput(values.outDate) : null,
        payment_method: values.paymentMethod,
        plate_no: values.plateNo,
        price_per_kg: values.pricePerKg,
        product_name: values.productName,
        remaining_amount: values.amount,
        remark: values.remark,
        scale_operator: values.scaleOperator,
        sender_name: values.senderName,
        status: 'pending_approval',
        supplier_id: values.supplierId,
        updated_at: createdAt,
        updated_by: actor,
        vehicle_photo_names: values.vehiclePhotoNames,
        weight_in: values.weightIn,
        weight_out: values.weightOut,
      },
      select: { doc_no: true, id: true },
    })

    await recordAuditLog({
      afterData: { docNo: result.doc_no, id: result.id },
      context,
      entityId: result.id,
      entityLabel: result.doc_no,
      entitySchema: 'public',
      entityTable: 'supplier_advance_payments',
      eventKey: 'purchase.advance-payment.created',
      metadata: {
        status: advancePaymentStatusLabel('pending_approval'),
      },
      request,
    })

    return NextResponse.json({ docNo: result.doc_no, id: result.id })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกรายการจ่ายเงินล่วงหน้าไม่ได้', 400)
  }
}
