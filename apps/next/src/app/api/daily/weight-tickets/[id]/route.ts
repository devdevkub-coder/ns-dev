import { NextResponse } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { calculateTicketTotals, weightTicketCancelSchema, weightTicketConfirmSchema, weightTicketFormSchema } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, toDateOnly } from '@/lib/server/daily'
import { findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { prisma } from '@/lib/server/prisma'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { appendWtoPendingOutEventsFromHolds, getWeightTicketPendingOutEvents } from '@/lib/server/weight-ticket-pending-out-events'
import { buildWeightTicketEditChanges } from '@/lib/server/weight-ticket-write/edit-audit'
import { assertWeightTicketImpurityRules, assertWeightTicketPartyForType, WeightTicketWriteValidationError } from '@/lib/server/weight-ticket-write/type-guards'
import { applyWeightTicketEditSideEffects, resolveWeightTicketWarehousesForWrite, validateWeightTicketStockForWrite, weightTicketPartySnapshot } from '@/lib/server/weight-ticket-write/handlers'
import { buildWtoEditTimelineNote, prepareWtoEditPendingOutPlan } from '@/lib/server/weight-ticket-write/wto'
import {
  releaseActiveWtoPendingOut,
  snapshotActiveWtoPendingOutCosts,
  WtoPendingOutError,
} from '@/lib/server/stock-holds'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import {
  branchScopeIds,
  buildWeightTicketLineRows,
  buildWeightTicketProductSummaryRows,
  canMutateWeightTicket,
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
import { enqueueNotificationJob, executeNotificationJob } from '@/lib/server/line-notification-jobs'

export const runtime = 'nodejs'

const ticketInclude = {
  branches: true,
  customers: true,
  suppliers: true,
  weight_ticket_product_summaries: {
    include: {
      products: {
        select: { code: true, id: true, metal_group: true },
      },
    },
    orderBy: { product_name: 'asc' },
  },
  weight_ticket_lines: {
    include: {
      products: {
        select: { code: true, id: true, metal_group: true },
      },
      warehouses: {
        select: { code: true, id: true, name: true, type: true },
      },
    },
    orderBy: { line_no: 'asc' },
  },
  stock_holds: {
    select: {
      cost_snapshot_at: true,
      cost_snapshot_note: true,
      cost_snapshot_source: true,
      consumed_at: true,
      consumed_by_ref_no: true,
      hold_key: true,
      held_at: true,
      product_id: true,
      qty: true,
      released_at: true,
      source_doc_no: true,
      source_line_no: true,
      status: true,
      unit_cost_snapshot: true,
      value_snapshot: true,
      warehouse_id: true,
      warehouses: {
        select: { code: true, id: true, name: true, type: true },
      },
    },
    orderBy: { source_line_no: 'asc' },
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
    const [timeline, usageTimeline, downstreamAllocations, pendingOutEvents] = await Promise.all([
      getWeightTicketTimeline(prisma, ticket.id),
      getWeightTicketUsageTimeline(prisma, ticket.id),
      getWeightTicketDownstreamAllocations(prisma, ticket.id),
      getWeightTicketPendingOutEvents(prisma, ticket.id),
    ])
    return NextResponse.json({
      ...mapped,
      downstreamAllocations,
      pendingOutEvents,
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
    requirePermission(auth, 'daily.weight_tickets.update')

    const { id } = await context.params
    const values = weightTicketFormSchema.parse(await request.json())
    const scopedBranchIds = branchScopeIds(auth)
    const existing = await findScopedTicket(id, scopedBranchIds)
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของที่ต้องการแก้ไข' }, { status: 404 })

    const usage = await getWeightTicketUsageCounts(prisma, existing.id)
    if (!canMutateWeightTicket(existing, usage)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: mutableTicketErrorMessage('edit', usage) }, { status: 400 })
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
    const productCodes = [...new Set(values.lines.flatMap((line) => [
      line.productId.trim().toUpperCase(),
      line.impurityProductId?.trim().toUpperCase() ?? '',
    ]).filter(Boolean))]
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
    try {
      await assertWeightTicketPartyForType({ branchId: branch.id, customer, supplier, type: values.type })
    } catch (caught) {
      if (caught instanceof WeightTicketWriteValidationError) {
        return NextResponse.json({
          code: caught.code,
          error: caught.message,
          fieldErrors: caught.fieldErrors,
        }, { status: caught.status })
      }
      throw caught
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
    const missingImpurityProductIndex = values.lines.findIndex((line) => {
      const productCode = line.impurityProductId?.trim().toUpperCase() ?? ''
      return Boolean(productCode) && !productByCode.has(productCode)
    })
    if (missingImpurityProductIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingImpurityProductIndex + 1}: สินค้าที่ปนมาไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`lines.${missingImpurityProductIndex}.impurityProductId`]: ['สินค้าที่ปนมาไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }

    const impurityById = new Map(impurities.map((impurity) => [impurity.id, impurity] as const))
    try {
      assertWeightTicketImpurityRules({ impurityById, parsedImpurityIds, values })
    } catch (caught) {
      if (caught instanceof WeightTicketWriteValidationError) {
        return NextResponse.json({
          code: caught.code,
          error: caught.message,
          fieldErrors: caught.fieldErrors,
        }, { status: caught.status })
      }
      throw caught
    }

    const actor = currentActor(auth)
    const documentDate = toDateOnly(existing.document_date)
    const nextStatus = existing.status
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
      const partySnapshot = weightTicketPartySnapshot({ customer, supplier, type: values.type })

      await tx.weight_tickets.update({
        data: {
          branch_id: branch.id,
          cancel_note: null,
          cancelled_at: null,
          cancelled_by: null,
          container_deduction_weight: totals.containerDeductionWeight,
          customer_id: partySnapshot.customerId,
          deduct_weight: totals.deductionWeight,
          doc_no: docNo,
          doc_type: values.type,
          gross_weight: totals.grossWeight,
          image_count: values.vehicleImageNames.length,
          net_weight: totals.netWeight,
          party_name: partySnapshot.partyName,
          remark: values.remark || null,
          status: nextStatus,
          supplier_id: partySnapshot.supplierId,
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
      const warehouseByCode = await resolveWeightTicketWarehousesForWrite(tx, { branchId: branch.id, lines: values.lines, type: values.type })
      const warehouseNameById = new Map([...warehouseByCode.values()].map((warehouse) => [warehouse.id, warehouse.name] as const))
      const lineRows = buildWeightTicketLineRows(existing.id, values, productByCode, impurityById, warehouseByCode)
      const editChanges = buildWeightTicketEditChanges({
        branchName: branch.name,
        customerName: customer?.name ?? '',
        docNo,
        existing: existing as WeightTicketRow,
        lineRows,
        supplierName: supplier?.name ?? '',
        totals,
        values,
        warehouseNameById,
      })
      const {
        auditLineEventTypeByLineNo,
        auditQtyBeforeByLineNo,
        preservedCostSnapshots,
      } = await prepareWtoEditPendingOutPlan(tx, {
        existing: existing as WeightTicketRow,
        lineRows,
        type: values.type,
      })

      await releaseActiveWtoPendingOut(tx, {
        actor,
        reason: 'edit',
        weightTicketId: existing.id,
      })
      await tx.weight_ticket_product_summaries.deleteMany({ where: { weight_ticket_id: existing.id } })
      await tx.weight_ticket_lines.deleteMany({ where: { weight_ticket_id: existing.id } })
      await validateWeightTicketStockForWrite(tx, { branchId: branch.id, lineRows, type: values.type })
      const createdLines = await Promise.all(lineRows.map((data) => tx.weight_ticket_lines.create({ data })))
      const createdPendingOutHoldIds = await applyWeightTicketEditSideEffects(tx, {
        actor,
        branchId: branch.id,
        createdLines,
        documentNo: docNo,
        preservedCostSnapshots,
        shouldSnapshotCost: existing.status === 'delivered',
        type: values.type,
        weightTicketId: existing.id,
      })
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
      const statusLogEventKey = await appendWeightTicketStatusLog(tx, {
        action: WEIGHT_TICKET_STATUS_ACTION.EDITED,
        actor,
        fromStatus: existing.status,
        meta: {
          changes: editChanges,
          previousDocumentNo: existing.doc_no,
          reason: 'weight_ticket_edit',
          type: values.type,
        },
        note: buildWtoEditTimelineNote({
          newLines: lineRows,
          oldLines: existing.weight_ticket_lines,
        }),
        toStatus: nextStatus,
        weightTicketId: existing.id,
      })
      if (values.type === 'WTO' && existing.status === 'delivered' && createdPendingOutHoldIds.length && auditLineEventTypeByLineNo.size) {
        const auditHoldIds = (await tx.stock_holds.findMany({
          select: { id: true },
          where: {
            id: { in: createdPendingOutHoldIds },
            source_line_no: { in: [...auditLineEventTypeByLineNo.keys()] },
            weight_ticket_id: existing.id,
          },
        })).map((hold) => hold.id)
        await appendWtoPendingOutEventsFromHolds(tx, {
          actor,
          eventTypeForHold: (hold) => hold.source_line_no == null ? 'edit_update_scale' : auditLineEventTypeByLineNo.get(hold.source_line_no) ?? 'edit_update_scale',
          holdIds: auditHoldIds,
          occurredAt: new Date(),
          qtyBeforeForHold: (hold) => (hold.source_line_no == null ? null : auditQtyBeforeByLineNo.get(hold.source_line_no) ?? null),
          statusLogEventKey,
          weightTicketId: existing.id,
        })
      }

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

    const [timeline, pendingOutEvents] = await Promise.all([
      getWeightTicketTimeline(prisma, updated.id),
      getWeightTicketPendingOutEvents(prisma, updated.id),
    ])
    return NextResponse.json({
      ...mapped,
      pendingOutEvents,
      timeline,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WtoPendingOutError) {
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
    const rawValues = await request.json()
    const existing = await findScopedTicket(id, branchScopeIds(auth))
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของที่ต้องการยกเลิก' }, { status: 404 })

    const usage = await getWeightTicketUsageCounts(prisma, existing.id)
    if (!canMutateWeightTicket(existing, usage)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: mutableTicketErrorMessage('cancel', usage) }, { status: 400 })
    }
    const beforeSnapshot = weightTicketAuditSnapshot(mapWeightTicketRow(existing as WeightTicketRow, usage))

    const actor = currentActor(auth)
    const confirmParsed = weightTicketConfirmSchema.safeParse(rawValues)
    if (confirmParsed.success) {
      requirePermission(auth, 'daily.weight_tickets.confirm')
      if (existing.status !== 'draft') {
        return NextResponse.json({ code: 'BAD_REQUEST', error: 'ยืนยันได้เฉพาะเอกสารสถานะแบบร่าง' }, { status: 400 })
      }

      const confirmedAt = new Date()
      const nextStatus = existing.doc_type === 'WTO' ? 'delivered' : 'received'
      const updated = await prisma.$transaction(async (tx) => {
        const confirmedHoldIds = existing.doc_type === 'WTO'
          ? await snapshotActiveWtoPendingOutCosts(tx, {
            actor,
            branchId: existing.branch_id,
            source: 'WTO_CONFIRM',
            weightTicketId: existing.id,
          })
          : []
        await tx.weight_tickets.update({
          data: {
            status: nextStatus,
            updated_at: confirmedAt,
            updated_by: actor,
          },
          where: { id: existing.id },
        })
        const statusLogEventKey = await appendWeightTicketStatusLog(tx, {
          action: WEIGHT_TICKET_STATUS_ACTION.CONFIRMED,
          actor,
          createdAt: confirmedAt,
          fromStatus: existing.status,
          meta: {
            reason: existing.doc_type === 'WTO' ? 'wto_confirm_cost_snapshot' : 'wti_confirm_receipt',
          },
          toStatus: nextStatus,
          weightTicketId: existing.id,
        })
        if (existing.doc_type === 'WTO') {
          await appendWtoPendingOutEventsFromHolds(tx, {
            actor,
            eventTypeForHold: () => 'confirm_snapshot',
            holdIds: confirmedHoldIds,
            occurredAt: confirmedAt,
            statusLogEventKey,
            weightTicketId: existing.id,
          })
        }
        return tx.weight_tickets.findUniqueOrThrow({
          include: ticketInclude,
          where: { id: existing.id },
        })
      })

      const mapped = mapWeightTicketRow(updated as WeightTicketRow, usage)
      await syncWeightTicketToGoogleSheets('update', mapped)
      await recordAuditLog({
        action: 'status',
        afterData: weightTicketAuditSnapshot(mapped),
        beforeData: beforeSnapshot,
        context: auth,
        entityId: String(updated.id),
        entityLabel: updated.doc_no,
        entitySchema: 'public',
        entityTable: 'weight_tickets',
        eventKey: 'daily.weight-ticket.confirmed',
        metadata: {
          documentNo: mapped.documentNo,
          status: mapped.status,
        },
        request,
        targetId: String(updated.id),
        targetLabel: updated.doc_no,
        targetType: 'weight_ticket',
      })
      const autoSendKey = mapped.type === 'WTI' ? 'LINE_AUTO_SEND_WTI' : 'LINE_AUTO_SEND_WTO'
      const autoSendConfig = await prisma.system_settings.findUnique({ where: { key: autoSendKey } })
      if (autoSendConfig?.value === 'true') {
        try {
          const enqueueResult = await enqueueNotificationJob(mapped.documentNo, {
            requestedBy: actor,
            force: false,
          })
          for (const job of enqueueResult.jobs) {
            try {
              await executeNotificationJob(job.id, { force: false })
            } catch (caught) {
              console.error('[weight-ticket-auto-send] failed to execute confirmed job:', job.id, caught)
            }
          }
        } catch (caught) {
          console.error('[weight-ticket-auto-send] failed to enqueue confirmed document:', caught)
        }
      }
      const [timeline, pendingOutEvents] = await Promise.all([
        getWeightTicketTimeline(prisma, updated.id),
        getWeightTicketPendingOutEvents(prisma, updated.id),
      ])
      return NextResponse.json({
        ...mapped,
        pendingOutEvents,
        timeline,
      })
    }

    requirePermission(auth, 'daily.weight_tickets.cancel')
    const values = weightTicketCancelSchema.parse(rawValues)
    const cancelledAt = new Date()
    const updated = await prisma.$transaction(async (tx) => {
      const cancellingHoldIds = existing.doc_type === 'WTO'
        ? (await tx.stock_holds.findMany({
          select: { id: true },
          where: {
            status: 'active',
            weight_ticket_id: existing.id,
          },
        })).map((hold) => hold.id)
        : []
      await releaseActiveWtoPendingOut(tx, {
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
      const statusLogEventKey = await appendWeightTicketStatusLog(tx, {
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
      if (cancellingHoldIds.length) {
        await appendWtoPendingOutEventsFromHolds(tx, {
          actor,
          eventTypeForHold: () => 'cancel_release',
          holdIds: cancellingHoldIds,
          occurredAt: cancelledAt,
          statusLogEventKey,
          statusSnapshot: 'released',
          weightTicketId: existing.id,
        })
      }
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
    const [timeline, pendingOutEvents] = await Promise.all([
      getWeightTicketTimeline(prisma, updated.id),
      getWeightTicketPendingOutEvents(prisma, updated.id),
    ])
    return NextResponse.json({
      ...mapped,
      pendingOutEvents,
      timeline,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WtoPendingOutError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'ยกเลิกใบรับ-ส่งของไม่ได้', 400)
  }
}
