import { NextResponse } from 'next/server'
import type { Prisma } from '../../../../../generated/prisma/client'
import { calculateCustomerAdvanceTaxBreakdown, customerAdvanceFormSchema, customerAdvanceVatTypeLabel } from '@/lib/customer-advance'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { isCustomerEligibleForBranch } from '@/lib/server/party-branch-eligibility'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { prisma } from '@/lib/server/prisma'
import { requiredActiveVatRatePercent } from '@/lib/server/tax-settings'

export const runtime = 'nodejs'

type CustomerAdvanceRow = Prisma.customer_advancesGetPayload<{
  include: {
    branches: true
    customer_advance_items: true
    customer_advance_statuses: true
  }
}>

function parsePositiveInt(value: string | null, defaultValue: number, maximum: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultValue
  return Math.min(parsed, maximum)
}

function parseSortDirection(value: string | null): Prisma.SortOrder {
  return value === 'asc' ? 'asc' : 'desc'
}

function parseSortKey(value: string | null) {
  const allowed = new Set(['customerName', 'documentDate', 'docNo', 'status', 'targetAmount'])
  return allowed.has(value ?? '') ? value! : 'documentDate'
}

function orderByFor(sortKey: string, direction: Prisma.SortOrder): Prisma.customer_advancesOrderByWithRelationInput[] {
  const primary: Prisma.customer_advancesOrderByWithRelationInput = (() => {
    switch (sortKey) {
      case 'customerName': return { customer_name_snapshot: direction }
      case 'docNo': return { doc_no: direction }
      case 'status': return { customer_advance_statuses: { sort_order: direction } }
      case 'targetAmount': return { target_amount: direction }
      case 'documentDate':
      default: return { document_date: direction }
    }
  })()
  return [primary, { created_at: 'desc' }, { doc_no: direction }]
}

function rowJson(row: CustomerAdvanceRow) {
  return {
    allocatedAmount: toNumber(row.allocated_amount),
    availableAmount: toNumber(row.available_amount),
    branchId: row.branches.code,
    branchName: row.branches.name,
    contractNo: row.contract_no ?? '',
    currencyCode: row.currency_code,
    customerCode: row.customer_code_snapshot,
    customerName: row.customer_name_snapshot,
    documentDate: toDateOnly(row.document_date),
    docNo: row.doc_no,
    id: row.id.toString(),
    invoiceNo: row.invoice_no ?? '',
    itemCount: row.customer_advance_items.length,
    receivedAmount: toNumber(row.received_amount),
    status: row.customer_advance_statuses.code,
    statusLabel: row.customer_advance_statuses.name,
    subtotalAmount: toNumber(row.subtotal_amount),
    targetAmount: toNumber(row.target_amount),
    totalGrossWeight: row.customer_advance_items.reduce((total, item) => total + toNumber(item.gross_weight), 0),
    totalNetWeight: row.customer_advance_items.reduce((total, item) => total + toNumber(item.net_weight), 0),
    vatAmount: toNumber(row.vat_amount),
    vatRatePercent: toNumber(row.vat_rate_percent),
    vatType: row.vat_type,
    vatTypeLabel: customerAdvanceVatTypeLabel(row.vat_type),
  }
}

function actorEmail(context: Awaited<ReturnType<typeof getCurrentAuthContext>>) {
  const email = context.appUser?.email ?? context.authUser.email
  if (!email) throw new Error('ไม่พบอีเมลผู้ใช้งานสำหรับบันทึกเอกสาร')
  return email
}

function nextCustomerAdvanceDocNo(branch: { code: string }, date: string, tx: Prisma.TransactionClient) {
  const branchDigits = branch.code.replace(/\D/g, '')
  if (!/^\d{1,2}$/.test(branchDigits)) {
    throw new Error('รหัสสาขาไม่รองรับการออกเลข CADV')
  }
  const branchCode = branchDigits.padStart(2, '0')
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `CADV${branchCode}${compactDate}-`
  return tx.customer_advances.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith } },
  }).then((last) => {
    const lastNumber = Number(String(last?.doc_no ?? '').slice(startsWith.length))
    const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1
    return `${startsWith}${String(nextNumber).padStart(4, '0')}`
  })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const page = parsePositiveInt(url.searchParams.get('page'), 1, 10000)
    const pageSize = parsePositiveInt(url.searchParams.get('pageSize'), 25, 100)
    const q = url.searchParams.get('q')?.trim()
    const branchId = url.searchParams.get('branchId')?.trim()
    const status = url.searchParams.get('status')?.trim()
    const dateFrom = url.searchParams.get('dateFrom')?.trim()
    const dateTo = url.searchParams.get('dateTo')?.trim()
    const sortDirection = parseSortDirection(url.searchParams.get('sortDirection'))
    const sortKey = parseSortKey(url.searchParams.get('sortKey'))

    const where: Prisma.customer_advancesWhereInput = {
      ...(branchId ? { branches: { code: branchId } } : {}),
      ...(status ? { customer_advance_statuses: { code: status } } : {}),
      ...(dateFrom || dateTo ? {
        document_date: {
          ...(dateFrom ? { gte: normalizeDate(dateFrom) } : {}),
          ...(dateTo ? { lte: normalizeDate(dateTo) } : {}),
        },
      } : {}),
      ...(q ? {
        OR: [
          { doc_no: { contains: q, mode: 'insensitive' } },
          { customer_code_snapshot: { contains: q, mode: 'insensitive' } },
          { customer_name_snapshot: { contains: q, mode: 'insensitive' } },
          { invoice_no: { contains: q, mode: 'insensitive' } },
          { contract_no: { contains: q, mode: 'insensitive' } },
          { customer_advance_items: { some: { product_code_snapshot: { contains: q, mode: 'insensitive' } } } },
          { customer_advance_items: { some: { product_name_snapshot: { contains: q, mode: 'insensitive' } } } },
        ],
      } : {}),
    }

    const [branches, rows, totalRows, customers, products, currencies, statuses, vatRates] = await Promise.all([
      prisma.branches.findMany({
        orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
      }),
      prisma.customer_advances.findMany({
        include: {
          branches: true,
          customer_advance_items: { orderBy: { line_no: 'asc' } },
          customer_advance_statuses: true,
        },
        orderBy: orderByFor(sortKey, sortDirection),
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.customer_advances.count({ where }),
      prisma.customers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          code: true,
          customer_branches: {
            select: { branches: { select: { code: true } } },
            where: { active: true },
          },
          id: true,
          name: true,
        },
        where: { active: true },
      }),
      prisma.products.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { code: true, id: true, name: true, unit: true },
        where: { active: true },
      }),
      prisma.currencies.findMany({ orderBy: { code: 'asc' }, select: { code: true, name: true, symbol: true } }),
      prisma.customer_advance_statuses.findMany({
        orderBy: { sort_order: 'asc' },
        select: { code: true, name: true },
        where: { active: true },
      }),
      prisma.vat_settings.findMany({
        orderBy: [{ is_default: 'desc' }, { effective_from: 'desc' }, { updated_at: 'desc' }, { id: 'asc' }],
        select: { effective_from: true, effective_to: true, is_default: true, rate_percent: true },
        where: { active: true },
      }),
    ])

    return NextResponse.json({
      branches: branches.map((branch) => ({ active: branch.active, code: branch.code, id: branch.code, name: branch.name })),
      customers: customers.map((customer) => ({
        branchIds: customer.customer_branches
          .map((mapping) => mapping.branches?.code)
          .filter((branchCode): branchCode is string => Boolean(branchCode)),
        code: customer.code,
        id: customer.id.toString(),
        name: customer.name,
      })),
      currencies,
      filters: { statuses: statuses.map((statusOption) => ({ label: statusOption.name, value: statusOption.code })) },
      pagination: { page, pageSize, totalPages: Math.max(1, Math.ceil(totalRows / pageSize)), totalRows },
      products: products.map((product) => ({ code: product.code, id: product.id.toString(), name: product.name, unit: product.unit })),
      rows: rows.map(rowJson),
      settings: {
        vatRates: vatRates.map((rate) => ({
          effectiveFrom: toDateOnly(rate.effective_from),
          effectiveTo: rate.effective_to ? toDateOnly(rate.effective_to) : null,
          isDefault: rate.is_default,
          ratePercent: toNumber(rate.rate_percent),
        })),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการรับเงินล่วงหน้าไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const values = customerAdvanceFormSchema.parse(await request.json())
    const actor = actorEmail(context)

    const [branch, customer, currency, initialStatuses, products, vatRatePercent] = await Promise.all([
      findActiveBranchReferenceByCodeOrId(values.branchId),
      prisma.customers.findFirst({ select: { code: true, id: true, name: true }, where: { active: true, id: BigInt(values.customerId) } }),
      prisma.currencies.findUnique({ select: { code: true }, where: { code: values.currencyCode } }),
      prisma.customer_advance_statuses.findMany({ select: { id: true }, where: { active: true, is_initial: true } }),
      prisma.products.findMany({
        select: { code: true, id: true, name: true },
        where: { active: true, id: { in: values.lines.map((line) => BigInt(line.productId)) } },
      }),
      values.vatType === 'INCLUDE'
        ? requiredActiveVatRatePercent(normalizeDate(values.documentDate))
        : Promise.resolve(0),
    ])

    if (!branch) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    if (!customer) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { customerId: ['เลือกลูกค้า'] } }, { status: 400 })
    if (!currency) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สกุลเงินไม่ถูกต้อง', fieldErrors: { currencyCode: ['เลือกสกุลเงิน'] } }, { status: 400 })
    if (initialStatuses.length !== 1) throw new Error('กำหนดสถานะเริ่มต้นของ CADV ไม่ถูกต้อง')
    if (!(await isCustomerEligibleForBranch({ branchId: branch.id, customerId: customer.id }))) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'ลูกค้าไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้',
        fieldErrors: { customerId: ['ลูกค้าไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้'] },
      }, { status: 400 })
    }

    const productsById = new Map(products.map((product) => [product.id.toString(), product]))
    const invalidLineIndex = values.lines.findIndex((line) => !productsById.has(line.productId))
    if (invalidLineIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน',
        fieldErrors: { [`lines.${invalidLineIndex}.productId`]: ['เลือกสินค้า'] },
      }, { status: 400 })
    }

    const taxBreakdown = calculateCustomerAdvanceTaxBreakdown({
      amount: values.amount,
      vatRatePercent,
      vatType: values.vatType,
    })

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('customer_advances.doc_no'))`
      const docNo = await nextCustomerAdvanceDocNo(branch, values.documentDate, tx)
      const advance = await tx.customer_advances.create({
        data: {
          allocated_amount: 0,
          available_amount: 0,
          branch_id: branch.id,
          contract_no: values.contractNo,
          created_by: actor,
          currency_code: currency.code,
          customer_code_snapshot: customer.code,
          customer_id: customer.id,
          customer_name_snapshot: customer.name,
          document_date: normalizeDate(values.documentDate),
          doc_no: docNo,
          invoice_no: values.invoiceNo,
          received_amount: 0,
          remark: values.remark,
          status_id: initialStatuses[0].id,
          subtotal_amount: taxBreakdown.subtotalAmount,
          target_amount: taxBreakdown.targetAmount,
          updated_by: actor,
          vat_amount: taxBreakdown.vatAmount,
          vat_rate_percent: taxBreakdown.vatRatePercent,
          vat_type: taxBreakdown.vatType,
          customer_advance_items: {
            create: values.lines.map((line, index) => {
              const product = productsById.get(line.productId)
              if (!product) throw new Error('สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน')
              return {
                created_by: actor,
                gross_weight: line.grossWeight,
                line_no: index + 1,
                net_weight: line.netWeight,
                product_code_snapshot: product.code,
                product_id: product.id,
                product_name_snapshot: product.name,
                quantity: line.quantity,
                updated_by: actor,
              }
            }),
          },
        },
        select: { doc_no: true, id: true },
      })

      await tx.customer_advance_status_logs.create({
        data: {
          action: 'created',
          allocated_amount_snapshot: 0,
          available_amount_snapshot: 0,
          created_by: actor,
          customer_advance_doc_no: advance.doc_no,
          customer_advance_id: advance.id,
          event_key: `customer-advance.created.${advance.doc_no}`,
          received_amount_snapshot: 0,
          target_amount_snapshot: taxBreakdown.targetAmount,
          to_status_id: initialStatuses[0].id,
        },
      })
      return advance
    })

    await recordAuditLog({
      afterData: {
        docNo: created.doc_no,
        subtotalAmount: taxBreakdown.subtotalAmount,
        targetAmount: taxBreakdown.targetAmount,
        vatAmount: taxBreakdown.vatAmount,
        vatRatePercent: taxBreakdown.vatRatePercent,
        vatType: taxBreakdown.vatType,
      },
      context,
      entityId: created.id.toString(),
      entityLabel: created.doc_no,
      entitySchema: 'public',
      entityTable: 'customer_advances',
      eventKey: 'sales.customer-advance.created',
      request,
    })

    return NextResponse.json({ docNo: created.doc_no, id: created.id.toString() })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกรายการรับเงินล่วงหน้าไม่ได้', 400)
  }
}
