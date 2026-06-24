import { NextResponse } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { calculateTicketTotals, weightTicketCancelSchema, weightTicketFormSchema } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, toDateOnly } from '@/lib/server/daily'
import { findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { prisma } from '@/lib/server/prisma'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import {
  closeActiveWtoStockHolds,
  createActiveWtoStockHolds,
  resolveWtoWarehousesForLines,
  validateWtoStockAvailability,
  WtoStockHoldError,
} from '@/lib/server/stock-holds'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import {
  branchScopeIds,
  buildWeightTicketLineRows,
  buildWeightTicketProductSummaryRows,
  canMutateWeightTicket,
  defaultTicketStatus,
  getWeightTicketTimeline,
  getWeightTicketDownstreamAllocations,
  getWeightTicketUsageTimeline,
  getWeightTicketUsageCounts,
  mapWeightTicketRow,
  mutableTicketErrorMessage,
  nextWeightTicketDocNo,
  type WeightTicketRow,
  weightTicketAuditSnapshot,
} from '@/lib/server/weight-tickets'
import { syncWeightTicketToGoogleSheets } from '@/lib/server/google-sheets-sync'
import { notifyWeightTicketLine } from '@/lib/server/weight-ticket-line-notification'

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
      warehouses: {
        select: { code: true, id: true, name: true, type: true },
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
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const ticket = await findScopedTicket(id, branchScopeIds(auth))
    if (!ticket) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 })

    const usage = await getWeightTicketUsageCounts(prisma, ticket.id)
    const mapped = mapWeightTicketRow(ticket as WeightTicketRow, usage)
    const [timeline, usageTimeline, downstreamAllocations] = await Promise.all([
      getWeightTicketTimeline(prisma, ticket.id),
      getWeightTicketUsageTimeline(prisma, ticket.id),
      getWeightTicketDownstreamAllocations(prisma, ticket.id),
    ])
    return NextResponse.json({
      ...mapped,
      downstreamAllocations,
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
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const values = weightTicketFormSchema.parse(await request.json())
    const scopedBranchIds = branchScopeIds(auth)
    const existing = await findScopedTicket(id, scopedBranchIds)
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของที่ต้องการแก้ไข' }, { status: 404 })

    const usage = await getWeightTicketUsageCounts(prisma, existing.id)
    if (!canMutateWeightTicket(existing, usage)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: mutableTicketErrorMessage('edit') }, { status: 400 })
    }
    if (values.type !== existing.doc_type) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'ไม่สามารถเปลี่ยนประเภทเอกสารหลังสร้างแล้ว',
        fieldErrors: { type: ['ไม่สามารถเปลี่ยนประเภทเอกสารหลังสร้างแล้ว'] },
      }, { status: 400 })
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
    const nextStatus = existing.status === 'billed'
      ? existing.status
      : defaultTicketStatus(values.type)
    const totals = calculateTicketTotals(values.lines.map((line) => ({
      containerDeductionWeight: String(line.containerDeductionWeight),
      deductionMode: line.deductionMode,
      deductionValue: String(line.deductionValue),
      grossWeight: String(line.grossWeight),
      id: line.id,
      impuritySourceLineId: line.impuritySourceLineId,
      parentId: line.parentId,
      impurityId: line.impurityId,
    })))

    const updated = await prisma.$transaction(async (tx) => {
      const branchCode = String(branch.code ?? '').replace(/\D/g, '').slice(-2).padStart(2, '0')
      const mustRenumber = existing.branch_id !== branch.id
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
          container_deduction_weight: totals.containerDeductionWeight,
          customer_id: values.type === 'WTO' ? customer?.id ?? null : null,
          deduct_weight: totals.deductionWeight,
          doc_no: docNo,
          doc_type: values.type,
          gross_weight: totals.grossWeight,
          image_count: values.vehicleImageNames.length,
          net_weight: totals.netWeight,
          party_name: values.type === 'WTI' ? supplier?.name ?? '' : customer?.name ?? '',
          remark: values.remark || null,
          status: nextStatus,
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
      await closeActiveWtoStockHolds(tx, {
        actor,
        reason: 'edit',
        weightTicketId: existing.id,
      })
      await tx.weight_ticket_product_summaries.deleteMany({ where: { weight_ticket_id: existing.id } })
      await tx.weight_ticket_lines.deleteMany({ where: { weight_ticket_id: existing.id } })
      const warehouseByCode = values.type === 'WTO'
        ? await resolveWtoWarehousesForLines(tx, { branchId: branch.id, lines: values.lines })
        : new Map()
      const lineRows = buildWeightTicketLineRows(existing.id, values, productByCode, impurityById, warehouseByCode)
      if (values.type === 'WTO') {
        await validateWtoStockAvailability(tx, {
          branchId: branch.id,
          lines: lineRows.map((line, index) => ({
            index,
            netWeight: Number(line.net_weight),
            productId: line.product_id,
            productName: line.product_name,
            warehouseId: line.warehouse_id,
          })),
        })
      }
      const createdLines = await Promise.all(lineRows.map((data) => tx.weight_ticket_lines.create({ data })))
      if (values.type === 'WTO') {
        await createActiveWtoStockHolds(tx, {
          actor,
          branchId: branch.id,
          documentNo: docNo,
          lines: createdLines,
          weightTicketId: existing.id,
        })
      }
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
      const warehouseName = values.warehouseName || null

      await tx.weight_tickets.update({
        data: { 
          image_count: imageCount,
          warehouse_name: warehouseName,
        },
        where: { id: existing.id },
      })
      await appendWeightTicketStatusLog(tx, {
        action: WEIGHT_TICKET_STATUS_ACTION.EDITED,
        actor,
        fromStatus: existing.status,
        meta: {
          previousDocumentNo: existing.doc_no,
          reason: 'weight_ticket_edit',
          type: values.type,
        },
        toStatus: nextStatus,
        weightTicketId: existing.id,
      })

      return tx.weight_tickets.findUniqueOrThrow({
        include: ticketInclude,
        where: { id: existing.id },
      })
    })

    const updatedUsage = await getWeightTicketUsageCounts(prisma, updated.id)
    const mapped = mapWeightTicketRow(updated as WeightTicketRow, updatedUsage)
    await syncWeightTicketToGoogleSheets('update', mapped)
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

    // Trigger auto-send to LINE if enabled for this document type on edit
    const autoSendKey = mapped.type === 'WTI' ? 'LINE_AUTO_SEND_WTI' : 'LINE_AUTO_SEND_WTO'
    const autoSendConfig = await prisma.system_settings.findUnique({
      where: { key: autoSendKey },
    })
    if (autoSendConfig?.value === 'true') {
      const requestOrigin = (req: Request) => {
        const forwardedProto = req.headers.get('x-forwarded-proto') || 'https'
        const forwardedHost = req.headers.get('x-forwarded-host') || req.headers.get('host')
        const configured = process.env.NEXT_PUBLIC_APP_URL
        if (configured) return configured.replace(/\/$/, '')
        if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
        return new URL(req.url).origin
      }

      void notifyWeightTicketLine(mapped.documentNo, {
        origin: requestOrigin(request),
        requestedBy: actor,
        scopedBranchIds,
        force: true,
      }).catch((err) => {
        console.error('[weight-ticket-auto-send] failed to auto send LINE notification on update:', err)
      })
    }

    const timeline = await getWeightTicketTimeline(prisma, updated.id)
    return NextResponse.json({
      ...mapped,
      timeline,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WtoStockHoldError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'แก้ไขใบรับ-ส่งของไม่ได้', 400)
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

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
    const updated = await prisma.$transaction(async (tx) => {
      await closeActiveWtoStockHolds(tx, {
        actor,
        reason: 'cancel',
        weightTicketId: existing.id,
      })
      await tx.weight_tickets.update({
        data: {
          cancel_note: values.note,
          cancelled_at: cancelledAt,
          cancelled_by: actor,
          status: 'cancelled',
          updated_at: cancelledAt,
          updated_by: actor,
        },
        where: { id: existing.id },
      })
      await appendWeightTicketStatusLog(tx, {
        action: WEIGHT_TICKET_STATUS_ACTION.CANCELLED,
        actor,
        createdAt: cancelledAt,
        fromStatus: existing.status,
        meta: {
          reason: 'weight_ticket_cancel',
        },
        note: values.note,
        toStatus: 'cancelled',
        weightTicketId: existing.id,
      })
      return tx.weight_tickets.findUniqueOrThrow({
        include: ticketInclude,
        where: { id: existing.id },
      })
    })

    const mapped = mapWeightTicketRow(updated as WeightTicketRow, usage)
    await syncWeightTicketToGoogleSheets('cancel', mapped)
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
    if (caught instanceof WtoStockHoldError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'ยกเลิกใบรับ-ส่งของไม่ได้', 400)
  }
}
