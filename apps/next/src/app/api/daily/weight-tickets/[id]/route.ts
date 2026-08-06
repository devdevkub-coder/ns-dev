import { NextResponse } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { calculateTicketTotals, isOtherProductImpurityLabel, OTHER_PRODUCT_IMPURITY_ID, parseImpurityProductMeta, weightTicketCancelSchema, weightTicketConfirmSchema, weightTicketFormSchema, type WeightTicketFormValues } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { withAuthNoStore } from '@/lib/server/auth-response'
import { currentActor, toDateOnly } from '@/lib/server/daily'
import { findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { prisma } from '@/lib/server/prisma'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { appendWtoPendingOutEventsFromHolds, getWeightTicketPendingOutEvents } from '@/lib/server/weight-ticket-pending-out-events'
import { buildWeightTicketEditChanges } from '@/lib/server/weight-ticket-write/edit-audit'
import { assertWeightTicketImpurityRules, assertWeightTicketPartyForType, WeightTicketWriteValidationError } from '@/lib/server/weight-ticket-write/type-guards'
import { applyWeightTicketCreateSideEffects, applyWeightTicketEditSideEffects, resolveWeightTicketWarehousesForWrite, validateWeightTicketStockForWrite, weightTicketPartySnapshot } from '@/lib/server/weight-ticket-write/handlers'
import { buildWtoEditTimelineNote, shouldRebuildWtoPendingOutOnEdit } from '@/lib/server/weight-ticket-write/wto'
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
  canEditWeightTicket,
  canMutateWeightTicket,
  getWeightTicketTimeline,
  getWeightTicketDownstreamAllocations,
  getWeightTicketUsageTimeline,
  getWeightTicketUsageCounts,
  mapWeightTicketRow,
  mutableTicketErrorMessage,
  nextWeightTicketDocNo,
  requireWeightTicketBranchDocumentCode,
  type WeightTicketRow,
  weightTicketAuditSnapshot,
} from '@/lib/server/weight-tickets'
import { attachWeightTicketImagePreviewUrls, normalizeWeightTicketImageReferences, resolveWeightTicketImageBucket } from '@/lib/server/weight-ticket-storage'
import { publishWeightTicketChange } from '@/lib/server/weight-ticket-realtime'
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

function persistedLineToFormLine(
  line: WeightTicketRow['weight_ticket_lines'][number],
  lineIdByLineNo: Map<number, string>,
): WeightTicketFormValues['lines'][number] {
  const impurityMeta = parseImpurityProductMeta(line.note)
  return {
    containerDeductionWeight: Number(line.container_deduction_weight),
    deductionMode: line.deduction_mode as 'none' | 'kg' | 'percent',
    deductionValue: Number(line.deduction_value),
    grossWeight: Number(line.gross_weight),
    id: String(line.id),
    imageNames: line.image_names ?? [],
    impurityId: line.impurity_id == null
      ? isOtherProductImpurityLabel(line.impurity_name) ? OTHER_PRODUCT_IMPURITY_ID : ''
      : String(line.impurity_id),
    impurityProductId: impurityMeta.impurityProductId,
    impuritySourceLineId: line.impurity_source_line_no == null ? undefined : lineIdByLineNo.get(line.impurity_source_line_no),
    note: impurityMeta.note,
    parentId: line.parent_line_no == null ? undefined : lineIdByLineNo.get(line.parent_line_no),
    productId: line.products.code ?? '',
    warehouseId: line.warehouses?.code ?? '',
  }
}

async function findScopedTicket(documentNo: string, scopedBranchIds: string[] | null) {
  if (scopedBranchIds !== null && !scopedBranchIds.length) return null
  return prisma.weight_tickets.findFirst({
    include: ticketInclude,
    where: {
      doc_no: documentNo,
      ...(scopedBranchIds !== null ? { branches: { code: { in: scopedBranchIds } } } : {}),
    },
  })
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const ticket = await findScopedTicket(id, branchScopeIds(auth))
    if (!ticket) return withAuthNoStore(NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 }))

    const usage = await getWeightTicketUsageCounts(prisma, ticket.id)
    const mapped = mapWeightTicketRow(ticket as WeightTicketRow, usage)
    const includeImagePreviews = new URL(request.url).searchParams.get('includeImagePreviews') !== 'false'
    const responseMapped = includeImagePreviews
      ? await attachWeightTicketImagePreviewUrls(mapped, await resolveWeightTicketImageBucket())
      : mapped
    const [timeline, usageTimeline, downstreamAllocations, pendingOutEvents] = await Promise.all([
      getWeightTicketTimeline(prisma, ticket.id),
      getWeightTicketUsageTimeline(prisma, ticket.id),
      getWeightTicketDownstreamAllocations(prisma, ticket.id),
      getWeightTicketPendingOutEvents(prisma, ticket.id),
    ])
    return withAuthNoStore(NextResponse.json({
      ...responseMapped,
      downstreamAllocations,
      pendingOutEvents,
      timeline,
      usageTimeline,
    }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return withAuthNoStore(authContextErrorResponse(caught))
    return withAuthNoStore(apiErrorResponse(caught, 'โหลดใบรับ-ส่งของไม่ได้', 500))
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.update')

    const { id } = await context.params
    const parsedValues = weightTicketFormSchema.parse(await request.json())
    const imageBucket = await resolveWeightTicketImageBucket()
    const values = normalizeWeightTicketImageReferences(parsedValues, imageBucket)
    const scopedBranchIds = branchScopeIds(auth)
    const existing = await findScopedTicket(id, scopedBranchIds)
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของที่ต้องการแก้ไข' }, { status: 404 })

    const usage = await getWeightTicketUsageCounts(prisma, existing.id)
    if (!canEditWeightTicket({ docType: existing.doc_type, status: existing.status }, usage)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: mutableTicketErrorMessage('edit', usage) }, { status: 400 })
    }
    if (values.type !== existing.doc_type) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'ไม่สามารถเปลี่ยนประเภทเอกสารหลังสร้างแล้ว',
        fieldErrors: { type: ['ไม่สามารถเปลี่ยนประเภทเอกสารหลังสร้างแล้ว'] },
      }, { status: 400 })
    }
    if (values.saveScope === 'header' && existing.weight_ticket_lines.length > 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'บันทึกเฉพาะหัวเอกสารได้ก่อนมีรายการสินค้าเท่านั้น',
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
      scopedBranchIds === null ? Promise.resolve([]) : findActiveBranchReferencesByCodes(scopedBranchIds),
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

    if (!branch || (scopedBranchIds !== null && !scopedBranches.some((item) => item.id === branch.id))) {
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
    const totals = calculateTicketTotals(values.lines.map((line) => ({
      containerDeductionWeight: String(line.containerDeductionWeight),
      deductionMode: line.deductionMode,
      deductionValue: String(line.deductionValue),
      grossWeight: String(line.grossWeight),
      id: line.id,
      impuritySourceLineId: line.impuritySourceLineId,
      parentId: line.parentId,
      impurityId: line.impurityId,
      productId: line.productId,
    })))

    const collaborationBaseUpdatedAt = values.collaborationBaseUpdatedAt ?? null
    const collaborationBaseLineIds = new Set(values.collaborationBaseLineIds ?? [])
    const ticketId = existing.id
    const updated = await prisma.$transaction(async (tx) => {
      // Every ticket mutation uses the same lock and then re-reads lifecycle
      // state. PUT must not continue from a draft snapshot after confirm,
      // cancel, or downstream usage has already changed the ticket.
      await tx.$executeRaw`select pg_advisory_xact_lock(${ticketId})`
      const existing = await tx.weight_tickets.findUniqueOrThrow({ include: ticketInclude, where: { id: ticketId } })
      const lockedUsage = await getWeightTicketUsageCounts(tx, existing.id)
      if (!canEditWeightTicket({ docType: existing.doc_type, status: existing.status }, lockedUsage)) {
        throw new WeightTicketWriteValidationError(mutableTicketErrorMessage('edit', lockedUsage), {})
      }
      const collaborationCurrentUpdatedAt = existing.updated_at
      const documentDate = toDateOnly(existing.document_date)
      const nextStatus = existing.status
      const branchCode = requireWeightTicketBranchDocumentCode(branch.code)
      const mustRenumber = existing.branch_id !== branch.id
      const docNo = mustRenumber
        ? await (async () => {
          await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('weight_tickets.doc_no'))`
          return nextWeightTicketDocNo(tx, values.type, branchCode, documentDate)
        })()
        : existing.doc_no
      const partySnapshot = weightTicketPartySnapshot({ customer, supplier, type: values.type })

      await tx.weight_ticket_product_summary_lines.deleteMany({
        where: {
          weight_ticket_product_summaries: {
            weight_ticket_id: existing.id,
          },
        },
      })
      let warehouseByCode = await resolveWeightTicketWarehousesForWrite(tx, { branchId: branch.id, lines: values.lines, type: values.type })
      const warehouseNameById = new Map([...warehouseByCode.values()].map((warehouse) => [warehouse.id, warehouse.name] as const))
      existing.weight_ticket_lines.forEach((line) => {
        if (line.warehouses) warehouseNameById.set(line.warehouses.id, line.warehouses.name)
      })
      const lineRows = buildWeightTicketLineRows(existing.id, values, productByCode, impurityById, warehouseByCode)
      const isDeliveredWtoEdit = existing.status === 'delivered' && values.type === 'WTO'
      const shouldRebuildWtoPendingOut = isDeliveredWtoEdit && shouldRebuildWtoPendingOutOnEdit({
        branchChanged: existing.branch_id !== branch.id,
        existingLines: existing.weight_ticket_lines,
        newLines: lineRows,
      })
      const releasedPendingOutHolds = shouldRebuildWtoPendingOut
        ? await tx.stock_holds.findMany({
          select: { id: true, qty: true },
          where: { status: 'active', weight_ticket_id: existing.id },
        })
        : []
      if (shouldRebuildWtoPendingOut) {
        await releaseActiveWtoPendingOut(tx, {
          actor,
          reason: 'edit',
          weightTicketId: existing.id,
        })
      }
      await tx.weight_ticket_product_summaries.deleteMany({ where: { weight_ticket_id: existing.id } })
      let createdLines
      let effectiveValues = values
      let effectiveLineRows = lineRows
      let effectiveTotals = totals
      // The request may have read the ticket before another save committed;
      // compare against the locked version, not the outer request snapshot.
      const hasRemoteLineChanges = Boolean(
        collaborationBaseUpdatedAt
        && collaborationBaseUpdatedAt !== (collaborationCurrentUpdatedAt?.toISOString() ?? null),
      )
      if (hasRemoteLineChanges && !isDeliveredWtoEdit && !shouldRebuildWtoPendingOut) {
        // Multiple users may be editing the same draft. Use immutable DB line
        // ids when available, while accepting the previous docNo:lineNo ids
        // from an already-open tab during the transition.
        const latestLines = existing.weight_ticket_lines
        const latestLineByClientId = new Map<string, (typeof latestLines)[number]>()
        latestLines.forEach((line) => {
          latestLineByClientId.set(String(line.id), line)
          latestLineByClientId.set(`${existing.doc_no}:${line.line_no}`, line)
          if (values.collaborationBaseDocumentNo) {
            latestLineByClientId.set(`${values.collaborationBaseDocumentNo}:${line.line_no}`, line)
          }
        })
        const lineIdByLineNo = new Map(latestLines.map((line) => {
          const incomingLine = values.lines.find((valueLine) => latestLineByClientId.get(valueLine.id)?.id === line.id)
          return [line.line_no, incomingLine?.id ?? String(line.id)] as const
        }))
        const incomingExistingIds = new Set(
          values.lines
            .map((line) => latestLineByClientId.get(line.id)?.id)
            .filter((lineId): lineId is bigint => lineId != null),
        )
        const wasInBase = (line: (typeof latestLines)[number]) => [
          String(line.id),
          `${existing.doc_no}:${line.line_no}`,
          values.collaborationBaseDocumentNo ? `${values.collaborationBaseDocumentNo}:${line.line_no}` : '',
        ].some((key) => key && collaborationBaseLineIds.has(key))
        const remoteOnlyLines = latestLines.filter((line) => !incomingExistingIds.has(line.id) && !wasInBase(line))
        effectiveValues = {
          ...values,
          lines: [
            ...values.lines,
            ...remoteOnlyLines.map((line) => persistedLineToFormLine(line, lineIdByLineNo)),
          ],
        }
        const effectiveProductCodes = [...new Set(effectiveValues.lines.flatMap((line) => [
          line.productId.trim().toUpperCase(),
          line.impurityProductId?.trim().toUpperCase() ?? '',
        ]).filter(Boolean))]
        const missingEffectiveProductCodes = effectiveProductCodes.filter((code) => !productByCode.has(code))
        if (missingEffectiveProductCodes.length) {
          const persistedProducts = await tx.products.findMany({
            select: { code: true, id: true, name: true },
            where: { code: { in: missingEffectiveProductCodes } },
          })
          persistedProducts.forEach((product) => productByCode.set(product.code.trim().toUpperCase(), product))
        }
        const effectiveImpurityIds = [...new Set(effectiveValues.lines
          .map((line) => parseInternalBigIntId(line.impurityId))
          .filter((value): value is bigint => value != null))]
        const missingEffectiveImpurityIds = effectiveImpurityIds.filter((id) => !impurityById.has(id))
        if (missingEffectiveImpurityIds.length) {
          const persistedImpurities = await tx.impurities.findMany({
            select: { active: true, id: true, name: true },
            where: { id: { in: missingEffectiveImpurityIds } },
          })
          persistedImpurities.forEach((impurity) => impurityById.set(impurity.id, impurity))
        }
        warehouseByCode = await resolveWeightTicketWarehousesForWrite(tx, { branchId: branch.id, lines: effectiveValues.lines, type: effectiveValues.type })
        warehouseByCode.forEach((warehouse) => warehouseNameById.set(warehouse.id, warehouse.name))
        effectiveLineRows = buildWeightTicketLineRows(existing.id, effectiveValues, productByCode, impurityById, warehouseByCode)
        effectiveTotals = calculateTicketTotals(effectiveValues.lines.map((line) => ({
          containerDeductionWeight: line.containerDeductionWeight,
          deductionMode: line.deductionMode,
          deductionValue: line.deductionValue,
          grossWeight: line.grossWeight,
          id: line.id,
          impurityId: line.impurityId,
          impuritySourceLineId: line.impuritySourceLineId,
          parentId: line.parentId,
          productId: line.productId,
        })))
        const removedLineIds = latestLines
          .filter((line) => wasInBase(line) && !incomingExistingIds.has(line.id))
          .map((line) => line.id)
        if (removedLineIds.length) await tx.weight_ticket_lines.deleteMany({ where: { id: { in: removedLineIds } } })
        await Promise.all(effectiveLineRows.map(async (data, index) => {
          const valueLine = effectiveValues.lines[index]
          const currentLine = latestLineByClientId.get(valueLine.id)
          if (currentLine) {
            await tx.weight_ticket_lines.update({ data, where: { id: currentLine.id } })
          } else {
            await tx.weight_ticket_lines.create({ data })
          }
        }))
        createdLines = await tx.weight_ticket_lines.findMany({ orderBy: { line_no: 'asc' }, where: { weight_ticket_id: existing.id } })
      } else if (isDeliveredWtoEdit && !shouldRebuildWtoPendingOut) {
        const existingLineByLineNo = new Map(existing.weight_ticket_lines.map((line) => [line.line_no, line] as const))
        const retainedLineNos = new Set(lineRows.map((line) => line.line_no))
        await Promise.all(lineRows.map(async (data) => {
          const existingLine = existingLineByLineNo.get(data.line_no)
          if (existingLine) {
            await tx.weight_ticket_lines.update({ data, where: { id: existingLine.id } })
          } else {
            await tx.weight_ticket_lines.create({ data })
          }
        }))
        const removedLineIds = existing.weight_ticket_lines
          .filter((line) => !retainedLineNos.has(line.line_no))
          .map((line) => line.id)
        if (removedLineIds.length) await tx.weight_ticket_lines.deleteMany({ where: { id: { in: removedLineIds } } })
        createdLines = await tx.weight_ticket_lines.findMany({ orderBy: { line_no: 'asc' }, where: { weight_ticket_id: existing.id } })
      } else {
        await tx.weight_ticket_lines.deleteMany({ where: { weight_ticket_id: existing.id } })
        createdLines = await Promise.all(lineRows.map((data) => tx.weight_ticket_lines.create({ data })))
      }
      if (effectiveValues.type === 'WTO' && effectiveValues.saveScope !== 'header') {
        await validateWeightTicketStockForWrite(tx, {
          branchId: branch.id,
          excludeWeightTicketId: existing.status === 'delivered' ? existing.id : undefined,
          lineRows: effectiveLineRows,
          type: effectiveValues.type,
        })
      }
      const editChanges = buildWeightTicketEditChanges({
        branchName: branch.name,
        customerName: customer?.name ?? '',
        docNo,
        existing: existing as WeightTicketRow,
        lineRows: effectiveLineRows,
        supplierName: supplier?.name ?? '',
        totals: effectiveTotals,
        values: effectiveValues,
        warehouseNameById,
      })
      const imageCount = effectiveValues.vehicleImageNames.length + createdLines.reduce((sum, line) => sum + (line.image_count ?? 0), 0)
      await tx.weight_tickets.update({
        data: {
          branch_id: branch.id,
          cancel_note: null,
          cancelled_at: null,
          cancelled_by: null,
          container_deduction_weight: effectiveTotals.containerDeductionWeight,
          customer_id: partySnapshot.customerId,
          deduct_weight: effectiveTotals.deductionWeight,
          doc_no: docNo,
          doc_type: effectiveValues.type,
          gross_weight: effectiveTotals.grossWeight,
          godown_name: effectiveValues.godownName,
          image_count: imageCount,
          net_weight: effectiveTotals.netWeight,
          party_name: partySnapshot.partyName,
          remark: effectiveValues.remark || null,
          status: nextStatus,
          supplier_id: partySnapshot.supplierId,
          updated_at: new Date(),
          updated_by: actor,
          vehicle_image_count: effectiveValues.vehicleImageNames.length,
          vehicle_image_names: effectiveValues.vehicleImageNames,
          vehicle_no: effectiveValues.vehicleNo,
        },
        where: { id: existing.id },
      })
      const createdPendingOutHoldIds = shouldRebuildWtoPendingOut
        ? await applyWeightTicketEditSideEffects(tx, {
          actor,
          branchId: branch.id,
          createdLines,
          documentNo: docNo,
          preservedCostSnapshots: [],
          shouldSnapshotCost: true,
          type: 'WTO',
          weightTicketId: existing.id,
        })
        : []
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
      const statusLogEventKey = await appendWeightTicketStatusLog(tx, {
        action: WEIGHT_TICKET_STATUS_ACTION.EDITED,
        actor,
        fromStatus: existing.status,
        meta: {
          changes: editChanges,
          previousDocumentNo: existing.doc_no,
          reason: 'weight_ticket_edit',
          type: effectiveValues.type,
        },
        note: buildWtoEditTimelineNote({
          newLines: effectiveLineRows,
          oldLines: existing.weight_ticket_lines,
        }),
        toStatus: nextStatus,
        weightTicketId: existing.id,
      })
      if (shouldRebuildWtoPendingOut && (createdPendingOutHoldIds.length || releasedPendingOutHolds.length)) {
        const releaseOccurredAt = new Date()
        if (releasedPendingOutHolds.length) await appendWtoPendingOutEventsFromHolds(tx, {
          actor,
          eventTypeForHold: () => 'edit_release',
          holdIds: releasedPendingOutHolds.map((hold) => hold.id),
          occurredAt: releaseOccurredAt,
          qtyAfterForHold: () => 0,
          qtyBeforeForHold: (hold) => {
            const released = releasedPendingOutHolds.find((item) => item.id === hold.id)
            return released == null ? null : Number(released.qty)
          },
          statusLogEventKey,
          weightTicketId: existing.id,
        })
        if (createdPendingOutHoldIds.length) await appendWtoPendingOutEventsFromHolds(tx, {
          actor,
          eventTypeForHold: () => 'edit_rebuild',
          holdIds: createdPendingOutHoldIds,
          occurredAt: new Date(releaseOccurredAt.getTime() + 1),
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
    void publishWeightTicketChange({ changeType: 'updated', documentNo: mapped.documentNo, updatedAt: mapped.updatedAt })
    return NextResponse.json({
      ...mapped,
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
      if (existing.weight_ticket_lines.length === 0) {
        return NextResponse.json({
          code: 'BAD_REQUEST',
          error: 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการก่อนยืนยันเอกสาร',
        }, { status: 400 })
      }

      const confirmedAt = new Date()
      const ticketId = existing.id
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select pg_advisory_xact_lock(${ticketId})`
        const existing = await tx.weight_tickets.findUniqueOrThrow({ include: ticketInclude, where: { id: ticketId } })
        const lockedUsage = await getWeightTicketUsageCounts(tx, existing.id)
        if (existing.status !== 'draft' || !canMutateWeightTicket(existing, lockedUsage)) {
          throw new WeightTicketWriteValidationError('เอกสารถูกเปลี่ยนสถานะหรือถูกใช้งานแล้ว กรุณาโหลดข้อมูลล่าสุด', {})
        }
        if (existing.weight_ticket_lines.length === 0) {
          throw new WeightTicketWriteValidationError('เพิ่มรายการสินค้าอย่างน้อย 1 รายการก่อนยืนยันเอกสาร', {
            lines: ['เพิ่มรายการสินค้าอย่างน้อย 1 รายการก่อนยืนยันเอกสาร'],
          })
        }
        const nextStatus = existing.doc_type === 'WTO' ? 'delivered' : 'received'
        let confirmedHoldIds: bigint[] = []
        if (existing.doc_type === 'WTO') {
          await validateWeightTicketStockForWrite(tx, {
            branchId: existing.branch_id,
            lineRows: existing.weight_ticket_lines,
            type: 'WTO',
          })
          const createdHoldIds = await applyWeightTicketCreateSideEffects(tx, {
            actor,
            branchId: existing.branch_id,
            createdLines: existing.weight_ticket_lines,
            documentNo: existing.doc_no,
            type: 'WTO',
            weightTicketId: existing.id,
          })
          confirmedHoldIds = createdHoldIds.length
            ? await snapshotActiveWtoPendingOutCosts(tx, {
              actor,
              branchId: existing.branch_id,
              source: 'WTO_CONFIRM',
              weightTicketId: existing.id,
            })
            : []
        }
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

      const updatedUsage = await getWeightTicketUsageCounts(prisma, updated.id)
      const mapped = mapWeightTicketRow(updated as WeightTicketRow, updatedUsage)
      const responseMapped = await attachWeightTicketImagePreviewUrls(mapped, await resolveWeightTicketImageBucket())
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
      void publishWeightTicketChange({ changeType: 'confirmed', documentNo: mapped.documentNo, updatedAt: mapped.updatedAt })
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
        ...responseMapped,
        pendingOutEvents,
        timeline,
      })
    }

    requirePermission(auth, 'daily.weight_tickets.cancel')
    const values = weightTicketCancelSchema.parse(rawValues)
    const cancelledAt = new Date()
    const ticketId = existing.id
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(${ticketId})`
      const existing = await tx.weight_tickets.findUniqueOrThrow({ include: ticketInclude, where: { id: ticketId } })
      const lockedUsage = await getWeightTicketUsageCounts(tx, existing.id)
      if (!canMutateWeightTicket(existing, lockedUsage)) {
        throw new WeightTicketWriteValidationError(mutableTicketErrorMessage('cancel', lockedUsage), {})
      }
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
          statusSnapshot: 'cancelled',
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
    const responseMapped = await attachWeightTicketImagePreviewUrls(mapped, await resolveWeightTicketImageBucket())
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
    void publishWeightTicketChange({ changeType: 'cancelled', documentNo: mapped.documentNo, updatedAt: mapped.updatedAt })
    const [timeline, pendingOutEvents] = await Promise.all([
      getWeightTicketTimeline(prisma, updated.id),
      getWeightTicketPendingOutEvents(prisma, updated.id),
    ])
    return NextResponse.json({
      ...responseMapped,
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
