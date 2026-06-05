import { NextResponse } from 'next/server'
import { supplierAdvancePaymentCancelSchema, supplierAdvancePaymentFormSchema } from '@/lib/purchase-advance'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import {
  advancePaymentMutationReason,
  advancePaymentStatusLabel,
  canMutateAdvancePayment,
  getAdvancePaymentTimeline,
  mapAdvancePaymentRow,
  parseBangkokDateTimeInput,
} from '@/lib/server/advance-payments'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'

export const runtime = 'nodejs'

const advancePaymentInclude = {
  accounts: true,
  branches: true,
  suppliers: true,
  supplier_advance_allocations: {
    select: {
      allocation_key: true,
      allocated_amount: true,
      allocated_at: true,
      allocated_by: true,
      id: true,
      purchase_bills: {
        select: {
          doc_no: true,
          id: true,
        },
      },
      status: true,
      void_reason: true,
      voided_at: true,
      voided_by: true,
    },
  },
} as const

async function findAdvancePayment(docNo: string) {
  return prisma.supplier_advance_payments.findFirst({
    include: advancePaymentInclude,
    where: { doc_no: docNo },
  })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const advancePayment = await findAdvancePayment(id)
    if (!advancePayment) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบรายการจ่ายเงินล่วงหน้าที่ต้องการ' }, { status: 404 })
    }

    return NextResponse.json({
      ...mapAdvancePaymentRow(advancePayment),
      timeline: await getAdvancePaymentTimeline(prisma, advancePayment.id.toString()),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายละเอียด ADV ไม่ได้', 500)
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const values = supplierAdvancePaymentFormSchema.parse(await request.json())
    const existing = await findAdvancePayment(id)
    if (!existing) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบรายการ ADV ที่ต้องการแก้ไข' }, { status: 404 })
    }
    if (!canMutateAdvancePayment(existing)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: advancePaymentMutationReason(existing, 'edit') }, { status: 400 })
    }

    const [branch, fundingAccount, paymentMethod, product, supplier] = await Promise.all([
      findActiveBranchReferenceByCodeOrId(values.branchId),
      findActiveAccountReferenceByCode(values.fundingAccountId),
      prisma.payment_methods.findFirst({ select: { id: true, name: true, type: true }, where: { active: true, name: values.paymentMethod } }),
      values.productName
        ? prisma.products.findFirst({ select: { id: true, name: true }, where: { active: true, name: values.productName } })
        : Promise.resolve(null),
      findActiveSupplierReferenceByCodeOrId(values.supplierId),
    ])

    if (!branch) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    }
    if (!supplier) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { supplierId: ['เลือกผู้ขาย'] } }, { status: 400 })
    }
    if (!paymentMethod) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'วิธีจ่ายไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { paymentMethod: ['เลือกวิธีจ่าย'] } }, { status: 400 })
    }
    if (!fundingAccount) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'บัญชีที่จ่ายไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { fundingAccountId: ['เลือกบัญชีที่จ่าย'] } }, { status: 400 })
    }
    if (String(fundingAccount.type ?? '').trim().toLowerCase() !== String(paymentMethod.type ?? '').trim().toLowerCase()) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'บัญชีที่จ่ายไม่รองรับวิธีจ่ายที่เลือก', fieldErrors: { fundingAccountId: ['เลือกบัญชีที่รองรับวิธีจ่ายนี้'] } }, { status: 400 })
    }
    if (values.productName && !product) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { productName: ['สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน'] } }, { status: 400 })
    }

    const actor = currentActor(auth)
    const updatedAt = new Date()
    const updated = await prisma.supplier_advance_payments.update({
      data: {
        amount: values.amount,
        branch_id: branch.id,
        customer_name: values.customerName,
        driver_name: values.driverName,
        funding_account_id: fundingAccount.id,
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
        supplier_id: supplier.id,
        updated_at: updatedAt,
        updated_by: actor,
        vehicle_photo_names: values.vehiclePhotoNames,
        weight_in: values.weightIn,
        weight_out: values.weightOut,
      },
      include: advancePaymentInclude,
      where: { id: existing.id },
    })

    const mapped = mapAdvancePaymentRow(updated)
    await recordAuditLog({
      afterData: mapped,
      beforeData: mapAdvancePaymentRow(existing),
      context: auth,
      entityId: updated.id.toString(),
      entityLabel: updated.doc_no,
      entitySchema: 'public',
      entityTable: 'supplier_advance_payments',
      eventKey: 'purchase.advance-payment.updated',
      metadata: {
        status: advancePaymentStatusLabel(updated.status),
      },
      request,
    })

    return NextResponse.json({
      ...mapped,
      timeline: await getAdvancePaymentTimeline(prisma, updated.id.toString()),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'แก้ไขรายการ ADV ไม่ได้', 400)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const values = supplierAdvancePaymentCancelSchema.parse(await request.json())
    const existing = await findAdvancePayment(id)
    if (!existing) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบรายการ ADV ที่ต้องการยกเลิก' }, { status: 404 })
    }
    if (!canMutateAdvancePayment(existing)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: advancePaymentMutationReason(existing, 'cancel') }, { status: 400 })
    }

    const actor = currentActor(auth)
    const cancelledAt = new Date()
    const updated = await prisma.supplier_advance_payments.update({
      data: {
        cancel_reason: values.note,
        cancelled_at: cancelledAt,
        cancelled_by: actor,
        status: 'cancelled',
        updated_at: cancelledAt,
        updated_by: actor,
      },
      include: advancePaymentInclude,
      where: { id: existing.id },
    })

    const mapped = mapAdvancePaymentRow(updated)
    await recordAuditLog({
      afterData: mapped,
      beforeData: mapAdvancePaymentRow(existing),
      context: auth,
      entityId: updated.id.toString(),
      entityLabel: updated.doc_no,
      entitySchema: 'public',
      entityTable: 'supplier_advance_payments',
      eventKey: 'purchase.advance-payment.cancelled',
      metadata: {
        cancelReason: values.note,
        status: advancePaymentStatusLabel(updated.status),
      },
      request,
    })

    return NextResponse.json({
      ...mapped,
      timeline: await getAdvancePaymentTimeline(prisma, updated.id.toString()),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกรายการ ADV ไม่ได้', 400)
  }
}
