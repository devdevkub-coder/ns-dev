import { NextResponse } from 'next/server'
import { weightTicketCancelSchema, weightTicketFormSchema } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, toDateOnly } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import {
  branchScopeIds,
  buildWeightTicketLineRows,
  buildWeightTicketProductSummaryRows,
  canMutateWeightTicket,
  defaultTicketStatus,
  getWeightTicketTimeline,
  getWeightTicketUsageCounts,
  mapWeightTicketRow,
  mutableTicketErrorMessage,
  nextWeightTicketDocNo,
  weightTicketAuditSnapshot,
} from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

const ticketInclude = {
  branches: true,
  customers: true,
  suppliers: true,
  weight_ticket_product_summaries: {
    orderBy: { product_name: 'asc' },
  },
  weight_ticket_lines: {
    orderBy: { line_no: 'asc' },
  },
} as const

async function findScopedTicket(idOrDocumentNo: string, scopedBranchIds: string[]) {
  return prisma.weight_tickets.findFirst({
    include: ticketInclude,
    where: {
      OR: [
        { id: idOrDocumentNo },
        { doc_no: idOrDocumentNo },
      ],
      ...(scopedBranchIds.length ? { branch_id: { in: scopedBranchIds } } : {}),
    },
  })
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const ticket = await findScopedTicket(id, branchScopeIds(auth))
    if (!ticket) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 })

    const usage = await getWeightTicketUsageCounts(prisma, ticket.id)
    const mapped = mapWeightTicketRow(ticket, usage)
    const timeline = await getWeightTicketTimeline(prisma, ticket.id)
    return NextResponse.json({
      ...mapped,
      timeline,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดใบรับ-ส่งของไม่ได้', 500)
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const values = weightTicketFormSchema.parse(await request.json())
    const scopedBranchIds = branchScopeIds(auth)
    const existing = await findScopedTicket(id, scopedBranchIds)
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของที่ต้องการแก้ไข' }, { status: 404 })

    const usage = await getWeightTicketUsageCounts(prisma, id)
    if (!canMutateWeightTicket(existing, usage)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: mutableTicketErrorMessage('edit') }, { status: 400 })
    }
    const beforeSnapshot = weightTicketAuditSnapshot(mapWeightTicketRow(existing, usage))

    const productIds = [...new Set(values.lines.map((line) => line.productId))]
    const impurityIds = [...new Set(values.lines.map((line) => line.impurityId).filter(Boolean))]
    const [branch, supplier, customer, products, impurities] = await Promise.all([
      prisma.branches.findFirst({
        select: { code: true, id: true, name: true },
        where: {
          active: true,
          id: values.branchId,
          ...(scopedBranchIds.length ? { id: { in: scopedBranchIds } } : {}),
        },
      }),
      values.type === 'WTI'
        ? prisma.suppliers.findFirst({ select: { id: true, name: true }, where: { active: true, id: values.partyId } })
        : Promise.resolve(null),
      values.type === 'WTO'
        ? prisma.customers.findFirst({ select: { id: true, name: true }, where: { active: true, id: values.partyId } })
        : Promise.resolve(null),
      prisma.products.findMany({ select: { id: true, name: true }, where: { active: true, id: { in: productIds } } }),
      impurityIds.length
        ? prisma.impurities.findMany({ select: { active: true, id: true, name: true }, where: { active: true, id: { in: impurityIds } } })
        : Promise.resolve([]),
    ])

    if (!branch) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    }
    if (values.type === 'WTI' && !supplier) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { partyId: ['เลือกผู้ขาย'] } }, { status: 400 })
    }
    if (values.type === 'WTO' && !customer) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { partyId: ['เลือกลูกค้า'] } }, { status: 400 })
    }

    const productById = new Map(products.map((product) => [product.id, product]))
    const missingProductIndex = values.lines.findIndex((line) => !productById.has(line.productId))
    if (missingProductIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingProductIndex + 1}: สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`lines.${missingProductIndex}.productId`]: ['สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }

    const impurityById = new Map(impurities.map((impurity) => [impurity.id, impurity]))
    const missingImpurityIndex = values.lines.findIndex((line) => line.impurityId && !impurityById.has(line.impurityId))
    if (missingImpurityIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingImpurityIndex + 1}: สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`lines.${missingImpurityIndex}.impurityId`]: ['สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }

    const actor = currentActor(auth)
    const documentDate = toDateOnly(existing.document_date)
    const totals = values.lines.reduce((summary, line) => {
      const grossWeight = Number(line.grossWeight)
      const deductionWeight = line.deductionMode === 'percent'
        ? grossWeight * Number(line.deductionValue) / 100
        : line.deductionMode === 'kg'
          ? Number(line.deductionValue)
          : 0
      summary.grossWeight += grossWeight
      summary.deductionWeight += Math.min(deductionWeight, grossWeight)
      summary.netWeight += Math.max(0, grossWeight - Math.min(deductionWeight, grossWeight))
      return summary
    }, { deductionWeight: 0, grossWeight: 0, netWeight: 0 })

    const updated = await prisma.$transaction(async (tx) => {
      const branchCode = String(branch.code ?? '').replace(/\D/g, '').slice(-2).padStart(2, '0')
      const mustRenumber = existing.branch_id !== branch.id || existing.doc_type !== values.type
      const docNo = mustRenumber
        ? await (async () => {
          await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('weight_tickets.doc_no'))`
          return nextWeightTicketDocNo(tx, values.type, branchCode, documentDate)
        })()
        : existing.doc_no
      const lineRows = buildWeightTicketLineRows(existing.id, values, productById, impurityById)
      const { bridgeRows, summaryRows } = buildWeightTicketProductSummaryRows(existing.id, lineRows)
      const imageCount = values.vehicleImageNames.length + lineRows.reduce((sum, line) => sum + line.image_count, 0)

      await tx.weight_tickets.update({
        data: {
          branch_id: branch.id,
          cancel_note: null,
          cancelled_at: null,
          cancelled_by: null,
          customer_id: values.type === 'WTO' ? customer?.id ?? null : null,
          deduct_weight: totals.deductionWeight,
          doc_no: docNo,
          doc_type: values.type,
          gross_weight: totals.grossWeight,
          image_count: imageCount,
          net_weight: totals.netWeight,
          party_name: values.type === 'WTI' ? supplier?.name ?? '' : customer?.name ?? '',
          remark: values.remark || null,
          status: existing.status === 'partially_billed' || existing.status === 'billed'
            ? existing.status
            : defaultTicketStatus(values.type),
          supplier_id: values.type === 'WTI' ? supplier?.id ?? null : null,
          updated_at: new Date(),
          updated_by: actor,
          vehicle_image_count: values.vehicleImageNames.length,
          vehicle_image_names: values.vehicleImageNames,
          vehicle_no: values.vehicleNo,
        },
        where: { id: existing.id },
      })
      await tx.weight_ticket_product_summaries.deleteMany({ where: { weight_ticket_id: existing.id } })
      await tx.weight_ticket_lines.deleteMany({ where: { weight_ticket_id: existing.id } })
      await tx.weight_ticket_lines.createMany({ data: lineRows })
      await tx.weight_ticket_product_summaries.createMany({ data: summaryRows })
      await tx.weight_ticket_product_summary_lines.createMany({ data: bridgeRows })

      return tx.weight_tickets.findUniqueOrThrow({
        include: ticketInclude,
        where: { id: existing.id },
      })
    })

    const updatedUsage = await getWeightTicketUsageCounts(prisma, updated.id)
    const mapped = mapWeightTicketRow(updated, updatedUsage)
    await recordAuditLog({
      action: 'update',
      afterData: weightTicketAuditSnapshot(mapped),
      beforeData: beforeSnapshot,
      context: auth,
      entityId: updated.id,
      entityLabel: updated.doc_no,
      entitySchema: 'public',
      entityTable: 'weight_tickets',
      eventKey: 'daily.weight-ticket.updated',
      metadata: {
        branchName: mapped.branchName,
        documentNo: mapped.documentNo,
        type: mapped.type,
      },
      request,
      targetId: updated.id,
      targetLabel: updated.doc_no,
      targetType: 'weight_ticket',
    })
    const timeline = await getWeightTicketTimeline(prisma, updated.id)
    return NextResponse.json({
      ...mapped,
      timeline,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'แก้ไขใบรับ-ส่งของไม่ได้', 400)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'finance.cash.view')

    const { id } = await context.params
    const values = weightTicketCancelSchema.parse(await request.json())
    const existing = await findScopedTicket(id, branchScopeIds(auth))
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของที่ต้องการยกเลิก' }, { status: 404 })

    const usage = await getWeightTicketUsageCounts(prisma, id)
    if (!canMutateWeightTicket(existing, usage)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: mutableTicketErrorMessage('cancel') }, { status: 400 })
    }
    const beforeSnapshot = weightTicketAuditSnapshot(mapWeightTicketRow(existing, usage))

    const actor = currentActor(auth)
    const cancelledAt = new Date()
    const updated = await prisma.weight_tickets.update({
      data: {
        cancel_note: values.note,
        cancelled_at: cancelledAt,
        cancelled_by: actor,
        status: 'cancelled',
        updated_at: cancelledAt,
        updated_by: actor,
      },
      include: ticketInclude,
      where: { id: existing.id },
    })

    const mapped = mapWeightTicketRow(updated, usage)
    await recordAuditLog({
      action: 'status',
      afterData: weightTicketAuditSnapshot(mapped),
      beforeData: beforeSnapshot,
      context: auth,
      entityId: updated.id,
      entityLabel: updated.doc_no,
      entitySchema: 'public',
      entityTable: 'weight_tickets',
      eventKey: 'daily.weight-ticket.cancelled',
      metadata: {
        cancelNote: values.note,
        documentNo: mapped.documentNo,
        status: mapped.status,
      },
      request,
      targetId: updated.id,
      targetLabel: updated.doc_no,
      targetType: 'weight_ticket',
    })
    const timeline = await getWeightTicketTimeline(prisma, updated.id)
    return NextResponse.json({
      ...mapped,
      timeline,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกใบรับ-ส่งของไม่ได้', 400)
  }
}
