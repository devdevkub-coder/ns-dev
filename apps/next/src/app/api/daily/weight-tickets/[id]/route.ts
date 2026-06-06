import { NextResponse } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { weightTicketCancelSchema, weightTicketFormSchema } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, toDateOnly } from '@/lib/server/daily'
import { findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { prisma } from '@/lib/server/prisma'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import {
  branchScopeIds,
  buildWeightTicketLineRows,
  buildWeightTicketProductSummaryRows,
  canMutateWeightTicket,
  defaultTicketStatus,
  getWeightTicketTimeline,
  getWeightTicketUsageTimeline,
  getWeightTicketUsageCounts,
  mapWeightTicketRow,
  mutableTicketErrorMessage,
  nextWeightTicketDocNo,
  type WeightTicketRow,
  weightTicketAuditSnapshot,
} from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

const ticketInclude = {
  branches: true,
  customers: true,
  suppliers: true,
  weight_ticket_product_summaries: {
    include: {
      products: {
        select: { code: true, id: true },
      },
    },
    orderBy: { product_name: 'asc' },
  },
  weight_ticket_lines: {
    include: {
      products: {
        select: { code: true, id: true },
      },
    },
    orderBy: { line_no: 'asc' },
  },
} as const

async function findScopedTicket(documentNo: string, scopedBranchIds: string[]) {
  return prisma.weight_tickets.findFirst({
    include: ticketInclude,
    where: {
      doc_no: documentNo,
      ...(scopedBranchIds.length ? { branches: { code: { in: scopedBranchIds } } } : {}),
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
    const mapped = mapWeightTicketRow(ticket as WeightTicketRow, usage)
    const [timeline, usageTimeline] = await Promise.all([
      getWeightTicketTimeline(prisma, ticket.id),
      getWeightTicketUsageTimeline(prisma, ticket.id),
    ])
    return NextResponse.json({
      ...mapped,
      timeline,
      usageTimeline,
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

    const usage = await getWeightTicketUsageCounts(prisma, existing.id)
    if (!canMutateWeightTicket(existing, usage)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: mutableTicketErrorMessage('edit') }, { status: 400 })
    }
    const beforeSnapshot = weightTicketAuditSnapshot(mapWeightTicketRow(existing as WeightTicketRow, usage))

    const parsedImpurityIds = values.lines.map((line) => parseInternalBigIntId(line.impurityId))
    const productCodes = [...new Set(values.lines.map((line) => line.productId.trim().toUpperCase()).filter(Boolean))]
    const impurityIds = [...new Set(parsedImpurityIds.filter((value): value is bigint => value != null))]
    const [scopedBranches, branch, supplier, customer, products, impurities] = await Promise.all([
      findActiveBranchReferencesByCodes(scopedBranchIds),
      prisma.branches.findFirst({
        select: { code: true, id: true, name: true },
        where: {
          active: true,
          code: values.branchId.toUpperCase(),
        },
      }),
      values.type === 'WTI'
        ? findActiveSupplierReferenceByCodeOrId(values.partyId)
        : Promise.resolve(null),
      values.type === 'WTO'
        ? findActiveCustomerReferenceByCodeOrId(values.partyId)
        : Promise.resolve(null),
      prisma.products.findMany({ select: { code: true, id: true, name: true }, where: { active: true, code: { in: productCodes } } }),
      impurityIds.length
        ? prisma.impurities.findMany({ select: { active: true, id: true, name: true }, where: { active: true, id: { in: impurityIds } } })
        : Promise.resolve([]),
    ])

    if (!branch || (scopedBranchIds.length && !scopedBranches.some((item) => item.id === branch.id))) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    }
    if (values.type === 'WTI' && !supplier) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { partyId: ['เลือกผู้ขาย'] } }, { status: 400 })
    }
    if (values.type === 'WTO' && !customer) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { partyId: ['เลือกลูกค้า'] } }, { status: 400 })
    }

    const productByCode = new Map(products.map((product) => [product.code.trim().toUpperCase(), product] as const))
    const missingProductIndex = values.lines.findIndex((_, index) => {
      const productCode = values.lines[index]?.productId.trim().toUpperCase() ?? ''
      return !productCode || !productByCode.has(productCode)
    })
    if (missingProductIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingProductIndex + 1}: สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`lines.${missingProductIndex}.productId`]: ['สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }

    const impurityById = new Map(impurities.map((impurity) => [impurity.id, impurity] as const))
    const missingImpurityIndex = values.lines.findIndex((line, index) => {
      const impurityId = parsedImpurityIds[index]
      return Boolean(line.impurityId) && (impurityId == null || !impurityById.has(impurityId))
    })
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
          image_count: values.vehicleImageNames.length,
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
      await tx.weight_ticket_product_summary_lines.deleteMany({
        where: {
          weight_ticket_product_summaries: {
            weight_ticket_id: existing.id,
          },
        },
      })
      await tx.weight_ticket_product_summaries.deleteMany({ where: { weight_ticket_id: existing.id } })
      await tx.weight_ticket_lines.deleteMany({ where: { weight_ticket_id: existing.id } })
      const lineRows = buildWeightTicketLineRows(existing.id, values, productByCode, impurityById)
      const createdLines = await Promise.all(lineRows.map((data) => tx.weight_ticket_lines.create({ data })))
      const imageCount = values.vehicleImageNames.length + createdLines.reduce((sum, line) => sum + (line.image_count ?? 0), 0)
      const { summaryRows } = buildWeightTicketProductSummaryRows(existing.id, createdLines)
      const createdSummaries = await Promise.all(summaryRows.map(({ lineIds, ...data }) => tx.weight_ticket_product_summaries.create({ data })))
      const summaryIdByProductId = new Map(createdSummaries.map((summary) => [String(summary.product_id), summary.id] as const))
      const bridgeRows = summaryRows.flatMap(({ lineIds, product_id }) => {
        const summaryId = summaryIdByProductId.get(String(product_id))
        if (summaryId == null) return []
        return lineIds.map((lineId) => ({
          created_at: new Date(),
          summary_id: summaryId,
          weight_ticket_line_id: lineId,
        }))
      })
      if (bridgeRows.length) {
        await tx.weight_ticket_product_summary_lines.createMany({ data: bridgeRows })
      }
      await tx.weight_tickets.update({
        data: { image_count: imageCount },
        where: { id: existing.id },
      })

      return tx.weight_tickets.findUniqueOrThrow({
        include: ticketInclude,
        where: { id: existing.id },
      })
    })

    const updatedUsage = await getWeightTicketUsageCounts(prisma, updated.id)
    const mapped = mapWeightTicketRow(updated as WeightTicketRow, updatedUsage)
    await recordAuditLog({
      action: 'update',
      afterData: weightTicketAuditSnapshot(mapped),
      beforeData: beforeSnapshot,
      context: auth,
      entityId: String(updated.id),
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
      targetId: String(updated.id),
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

    const usage = await getWeightTicketUsageCounts(prisma, existing.id)
    if (!canMutateWeightTicket(existing, usage)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: mutableTicketErrorMessage('cancel') }, { status: 400 })
    }
    const beforeSnapshot = weightTicketAuditSnapshot(mapWeightTicketRow(existing as WeightTicketRow, usage))

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

    const mapped = mapWeightTicketRow(updated as WeightTicketRow, usage)
    await recordAuditLog({
      action: 'status',
      afterData: weightTicketAuditSnapshot(mapped),
      beforeData: beforeSnapshot,
      context: auth,
      entityId: String(updated.id),
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
      targetId: String(updated.id),
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
