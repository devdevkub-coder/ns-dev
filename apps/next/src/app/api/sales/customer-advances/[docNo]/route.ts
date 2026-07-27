import { NextResponse } from 'next/server'
import { calculateCustomerAdvancePaidBaseCapacity, calculateCustomerAdvanceTaxBreakdown, customerAdvanceCancelSchema, customerAdvanceFormSchema, customerAdvanceVatTypeLabel } from '@/lib/customer-advance'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { isCustomerEligibleForBranch } from '@/lib/server/party-branch-eligibility'
import { prisma } from '@/lib/server/prisma'
import { requiredActiveVatRatePercent } from '@/lib/server/tax-settings'

export const runtime = 'nodejs'

const CUSTOMER_ADVANCE_CURRENCY_CODE = 'THB'

const customerAdvanceInclude = {
  branches: true,
  customer_advance_items: {
    include: { products: { select: { unit: true } } },
    orderBy: { line_no: 'asc' },
  },
  customer_advance_status_logs: {
    include: {
      customer_advance_statuses_from_status_idTocustomer_advance_statuses: { select: { name: true } },
      customer_advance_statuses_to_status_idTocustomer_advance_statuses: { select: { name: true } },
    },
    orderBy: { created_at: 'desc' },
  },
  customer_advance_statuses: true,
} as const

function actorEmail(context: Awaited<ReturnType<typeof getCurrentAuthContext>>) {
  const email = context.appUser?.email ?? context.authUser.email
  if (!email) throw new Error('ไม่พบอีเมลผู้ใช้งานสำหรับบันทึกเอกสาร')
  return email
}

async function findCustomerAdvance(docNo: string) {
  return prisma.customer_advances.findUnique({
    include: customerAdvanceInclude,
    where: { doc_no: docNo },
  })
}

async function assertCanMutateCustomerAdvance(advance: NonNullable<Awaited<ReturnType<typeof findCustomerAdvance>>>) {
  const activeSalesBillAllocation = await prisma.sales_bill_customer_advance_allocations.findFirst({
    select: { id: true },
    where: {
      customer_advance_doc_no: advance.doc_no,
      status: 'active',
    },
  })

  if (
    advance.customer_advance_statuses.code !== 'pending_receipt'
    || toNumber(advance.received_amount) !== 0
    || toNumber(advance.allocated_amount) !== 0
    || activeSalesBillAllocation
  ) {
    throw new Error('แก้ไขหรือยกเลิก CADV ไม่ได้ เพราะเอกสารถูกนำไปใช้ในขั้นตอนรับเงินหรือบิลขายแล้ว')
  }
}

function toDetailJson(advance: NonNullable<Awaited<ReturnType<typeof findCustomerAdvance>>>) {
  const subtotalAmount = toNumber(advance.subtotal_amount)
  const targetAmount = toNumber(advance.target_amount)
  const receivedAmount = toNumber(advance.received_amount)
  const remainingReceiptAmount = Math.max(0, targetAmount - receivedAmount)
  const canMutate = advance.customer_advance_statuses.code === 'pending_receipt'
    && receivedAmount === 0
    && toNumber(advance.allocated_amount) === 0

  return {
    allocatedAmount: toNumber(advance.allocated_amount),
    availableAmount: toNumber(advance.available_amount),
    branchId: advance.branches.code,
    branchName: advance.branches.name,
    canCancel: canMutate,
    canEdit: canMutate,
    contractNo: advance.contract_no ?? '',
    customerCode: advance.customer_code_snapshot,
    customerId: advance.customer_id.toString(),
    customerName: advance.customer_name_snapshot,
    documentDate: toDateOnly(advance.document_date),
    docNo: advance.doc_no,
    id: advance.id.toString(),
    invoiceNo: advance.invoice_no ?? '',
    lines: advance.customer_advance_items.map((line) => ({
      grossWeight: toNumber(line.gross_weight),
      lineNo: line.line_no,
      productCode: line.product_code_snapshot,
      productId: line.product_id.toString(),
      productName: line.product_name_snapshot,
      quantity: toNumber(line.quantity),
      unit: line.products.unit,
    })),
    remark: advance.remark ?? '',
    receivedAmount,
    remainingReceiptAmount,
    status: advance.customer_advance_statuses.code,
    statusLabel: advance.customer_advance_statuses.name,
    subtotalAmount,
    targetAmount,
    timeline: advance.customer_advance_status_logs.map((log) => ({
      action: log.action,
      allocatedAmount: toNumber(log.allocated_amount_snapshot),
      availableAmount: toNumber(log.available_amount_snapshot),
      createdAt: log.created_at.toISOString(),
      createdBy: log.created_by,
      fromStatus: log.customer_advance_statuses_from_status_idTocustomer_advance_statuses?.name ?? null,
      note: log.note ?? '',
      receivedAmount: toNumber(log.received_amount_snapshot),
      targetAmount: toNumber(log.target_amount_snapshot),
      toStatus: log.customer_advance_statuses_to_status_idTocustomer_advance_statuses.name,
    })),
    vatAmount: toNumber(advance.vat_amount),
    vatRatePercent: toNumber(advance.vat_rate_percent),
    vatType: advance.vat_type,
    vatTypeLabel: customerAdvanceVatTypeLabel(advance.vat_type),
    usableCreditAmount: calculateCustomerAdvancePaidBaseCapacity({
      receivedGrossAmount: receivedAmount,
      subtotalAmount,
      targetAmount,
    }),
    version: advance.version,
  }
}

async function validateReferences(values: ReturnType<typeof customerAdvanceFormSchema.parse>) {
  const [branch, customer, products, vatRatePercent] = await Promise.all([
    findActiveBranchReferenceByCodeOrId(values.branchId),
    prisma.customers.findFirst({
      select: { code: true, id: true, name: true },
      where: { active: true, id: BigInt(values.customerId) },
    }),
    prisma.products.findMany({
      select: { code: true, id: true, name: true },
      where: { active: true, id: { in: values.lines.map((line) => BigInt(line.productId)) } },
    }),
    values.vatType === 'INCLUDE'
      ? requiredActiveVatRatePercent(normalizeDate(values.documentDate))
      : Promise.resolve(0),
  ])

  if (!branch) throw new Error('สาขาไม่ถูกต้องหรือถูกปิดใช้งาน')
  if (!customer) throw new Error('ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน')
  if (!(await isCustomerEligibleForBranch({ branchId: branch.id, customerId: customer.id }))) {
    throw new Error('ลูกค้าไม่ได้ถูกกำหนดให้ใช้งานกับสาขานี้')
  }

  const productsById = new Map(products.map((product) => [product.id.toString(), product]))
  const invalidLineIndex = values.lines.findIndex((line) => !productsById.has(line.productId))
  if (invalidLineIndex >= 0) throw new Error(`สินค้าในรายการที่ ${invalidLineIndex + 1} ไม่ถูกต้องหรือถูกปิดใช้งาน`)

  return { branch, customer, productsById, vatRatePercent }
}

export async function GET(_request: Request, context: { params: Promise<{ docNo: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')
    const { docNo } = await context.params
    const advance = await findCustomerAdvance(docNo)
    if (!advance) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบรายการ CADV ที่ต้องการ' }, { status: 404 })
    return NextResponse.json(toDetailJson(advance))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายละเอียด CADV ไม่ได้', 500)
  }
}

export async function PUT(request: Request, context: { params: Promise<{ docNo: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')
    const { docNo } = await context.params
    const values = customerAdvanceFormSchema.parse(await request.json())
    const existing = await findCustomerAdvance(docNo)
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบรายการ CADV ที่ต้องการแก้ไข' }, { status: 404 })
    await assertCanMutateCustomerAdvance(existing)

    const { branch, customer, productsById, vatRatePercent } = await validateReferences(values)
    const actor = actorEmail(auth)
    const updatedAt = new Date()
    const taxBreakdown = calculateCustomerAdvanceTaxBreakdown({
      amount: values.amount,
      vatRatePercent,
      vatType: values.vatType,
    })

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.customer_advances.update({
        data: {
          branch_id: branch.id,
          contract_no: values.contractNo,
          currency_code: CUSTOMER_ADVANCE_CURRENCY_CODE,
          customer_code_snapshot: customer.code,
          customer_id: customer.id,
          customer_name_snapshot: customer.name,
          document_date: normalizeDate(values.documentDate),
          invoice_no: values.invoiceNo,
          remark: values.remark,
          subtotal_amount: taxBreakdown.subtotalAmount,
          target_amount: taxBreakdown.targetAmount,
          updated_at: updatedAt,
          updated_by: actor,
          vat_amount: taxBreakdown.vatAmount,
          vat_rate_percent: taxBreakdown.vatRatePercent,
          vat_type: taxBreakdown.vatType,
          version: { increment: 1 },
        },
        where: { id: existing.id },
      })

      await tx.customer_advance_items.deleteMany({ where: { customer_advance_id: existing.id } })
      await tx.customer_advance_items.createMany({
        data: values.lines.map((line, index) => {
          const product = productsById.get(line.productId)
          if (!product) throw new Error('สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน')
          return {
            created_by: actor,
            customer_advance_id: existing.id,
            gross_weight: line.grossWeight,
            line_no: index + 1,
            net_weight: line.grossWeight,
            product_code_snapshot: product.code,
            product_id: product.id,
            product_name_snapshot: product.name,
            quantity: line.quantity,
            updated_by: actor,
          }
        }),
      })
      await tx.customer_advance_status_logs.create({
        data: {
          action: 'edited',
          allocated_amount_snapshot: toNumber(existing.allocated_amount),
          available_amount_snapshot: toNumber(existing.available_amount),
          created_by: actor,
          customer_advance_doc_no: existing.doc_no,
          customer_advance_id: existing.id,
          event_key: `customer-advance.edited.${existing.doc_no}.${row.version}`,
          from_status_id: existing.status_id,
          meta: { reason: 'edit' },
          received_amount_snapshot: toNumber(existing.received_amount),
          target_amount_snapshot: taxBreakdown.targetAmount,
          to_status_id: existing.status_id,
        },
      })
      return row
    })

    const result = await findCustomerAdvance(updated.doc_no)
    if (!result) throw new Error('ไม่พบ CADV หลังบันทึกการแก้ไข')
    await recordAuditLog({
      afterData: toDetailJson(result),
      beforeData: toDetailJson(existing),
      context: auth,
      entityId: result.id.toString(),
      entityLabel: result.doc_no,
      entitySchema: 'public',
      entityTable: 'customer_advances',
      eventKey: 'sales.customer-advance.updated',
      request,
    })
    return NextResponse.json(toDetailJson(result))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'แก้ไขรายการ CADV ไม่ได้', 400)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ docNo: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')
    const { docNo } = await context.params
    const { reason } = customerAdvanceCancelSchema.parse(await request.json())
    const existing = await findCustomerAdvance(docNo)
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบรายการ CADV ที่ต้องการยกเลิก' }, { status: 404 })
    await assertCanMutateCustomerAdvance(existing)

    const cancelledStatus = await prisma.customer_advance_statuses.findFirst({
      select: { id: true },
      where: { active: true, code: 'cancelled' },
    })
    if (!cancelledStatus) throw new Error('ไม่พบสถานะยกเลิกของ CADV')

    const actor = actorEmail(auth)
    const cancelledAt = new Date()
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.customer_advances.update({
        data: {
          cancel_reason: reason,
          cancelled_at: cancelledAt,
          cancelled_by: actor,
          status_id: cancelledStatus.id,
          updated_at: cancelledAt,
          updated_by: actor,
          version: { increment: 1 },
        },
        where: { id: existing.id },
      })
      await tx.customer_advance_status_logs.create({
        data: {
          action: 'cancelled',
          allocated_amount_snapshot: 0,
          available_amount_snapshot: 0,
          created_by: actor,
          customer_advance_doc_no: existing.doc_no,
          customer_advance_id: existing.id,
          event_key: `customer-advance.cancelled.${existing.doc_no}.${row.version}`,
          from_status_id: existing.status_id,
          meta: { cancelReason: reason },
          note: reason,
          received_amount_snapshot: 0,
          target_amount_snapshot: toNumber(existing.target_amount),
          to_status_id: cancelledStatus.id,
        },
      })
      return row
    })

    const result = await findCustomerAdvance(updated.doc_no)
    if (!result) throw new Error('ไม่พบ CADV หลังยกเลิก')
    await recordAuditLog({
      afterData: toDetailJson(result),
      beforeData: toDetailJson(existing),
      context: auth,
      entityId: result.id.toString(),
      entityLabel: result.doc_no,
      entitySchema: 'public',
      entityTable: 'customer_advances',
      eventKey: 'sales.customer-advance.cancelled',
      metadata: { cancelReason: reason },
      request,
    })
    return NextResponse.json(toDetailJson(result))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกรายการ CADV ไม่ได้', 400)
  }
}
