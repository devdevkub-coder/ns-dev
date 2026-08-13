import { NextResponse } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { calculateTicketTotals, isOtherProductImpurityLabel, isWeightTicketDraftLotSkeleton, OTHER_PRODUCT_IMPURITY_ID, parseImpurityProductMeta, weightTicketCancelSchema, weightTicketConfirmSchema, weightTicketDeleteLinesSchema, weightTicketFormSchema, weightTicketIncrementalPatchSchema, type WeightTicketFormValues, type WeightTicketIncrementalPatch } from '@/lib/weight-tickets'
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
import { buildWeightTicketEditChanges, shouldAppendWeightTicketEditTimeline } from '@/lib/server/weight-ticket-write/edit-audit'
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
  mergeWeightTicketSectionLines,
  resolveWeightTicketActorDisplayNames,
  selectWeightTicketRemovedLineIds,
  WeightTicketDataContractError,
  weightTicketActorDisplayName,
  mutableTicketErrorMessage,
  nextWeightTicketDocNo,
  requireWeightTicketBranchDocumentCode,
  type WeightTicketRow,
  weightTicketAuditSnapshot,
} from '@/lib/server/weight-tickets'
import { assertWeightTicketImageAssetOwnership, attachWeightTicketImageAssets, attachWeightTicketImagePreviewUrls, normalizeWeightTicketImageReferences, resolveWeightTicketImageBucket } from '@/lib/server/weight-ticket-storage'
import { publishWeightTicketChange } from '@/lib/server/weight-ticket-realtime'
import { enqueueNotificationJob, executeNotificationJob } from '@/lib/server/line-notification-jobs'

export const runtime = 'nodejs'

class WeightTicketCollaborationConflictError extends Error {
  readonly status = 409
  readonly code = 'CONFLICT'

  constructor(readonly lineIds: string[], readonly headerFields: string[] = []) {
    super(headerFields.length ? 'มีผู้ใช้อื่นแก้ไขข้อมูลส่วนหัวแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก' : 'มีผู้ใช้อื่นแก้ไขเต๋าเดียวกันแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')
    this.name = 'WeightTicketCollaborationConflictError'
  }
}

function weightTicketLineWriteFingerprint(line: {
  container_deduction_weight: unknown
  deduction_mode: unknown
  deduction_value: unknown
  gross_weight: unknown
  image_names: unknown
  impurity_id: unknown
  impurity_source_line_no: unknown
  line_no: unknown
  note: unknown
  parent_line_no: unknown
  product_id: unknown
  product_name: unknown
  warehouse_id: unknown
}) {
  return JSON.stringify({
    container_deduction_weight: String(line.container_deduction_weight ?? 0),
    deduction_mode: line.deduction_mode,
    deduction_value: String(line.deduction_value ?? 0),
    gross_weight: String(line.gross_weight ?? 0),
    image_names: line.image_names ?? [],
    impurity_id: line.impurity_id == null ? null : String(line.impurity_id),
    impurity_source_line_no: line.impurity_source_line_no ?? null,
    line_no: line.line_no,
    note: line.note ?? null,
    parent_line_no: line.parent_line_no ?? null,
    product_id: line.product_id == null ? null : String(line.product_id),
    product_name: line.product_name ?? null,
    warehouse_id: line.warehouse_id == null ? null : String(line.warehouse_id),
  })
}

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
    version: line.version ?? 1,
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

function buildIncrementalFormValues(
  existing: Awaited<ReturnType<typeof findScopedTicket>>,
  patch: WeightTicketIncrementalPatch,
): WeightTicketFormValues {
  if (!existing) throw new Error('ไม่พบใบรับ-ส่งของ')
  const lineIdByLineNo = new Map(existing.weight_ticket_lines.map((line) => [line.line_no, String(line.id)] as const))
  const currentLines = existing.weight_ticket_lines.map((line) => persistedLineToFormLine(line, lineIdByLineNo))
  const deletedIds = new Set(patch.deletedLineIds)
  const changedById = new Map(patch.lines.map((line) => [line.id, line] as const))
  const mergedLines = currentLines
    .filter((line) => !deletedIds.has(line.id))
    .map((line) => changedById.get(line.id) ?? line)
  patch.lines.forEach((line) => {
    if (!currentLines.some((current) => current.id === line.id) && !deletedIds.has(line.id)) mergedLines.push(line)
  })

  const partyId = existing.doc_type === 'WTI' ? existing.suppliers?.code : existing.customers?.code
  if (!partyId) throw new Error('ข้อมูลคู่ค้าในเอกสารไม่ครบ')
  const header = patch.header
  const baseLineIds = patch.collaborationBaseLineIds ?? currentLines.map((line) => line.id)
  const changedLineIds = patch.collaborationChangedLineIds ?? patch.lines.map((line) => line.id)
  const scopedLines = patch.scope === 'section'
    ? mergedLines.filter((line) => new Set(patch.sectionLineIds ?? []).has(line.id))
    : patch.scope === 'header'
      ? []
      : mergedLines
  return {
    branchId: header.branchId ?? existing.branches.code,
    collaborationBaseDocumentNo: patch.collaborationBaseDocumentNo ?? existing.doc_no,
    collaborationBaseLineIds: baseLineIds,
    collaborationBaseLineVersions: patch.collaborationBaseLineVersions,
    collaborationChangedLineIds: changedLineIds,
    collaborationDeletedLineIds: patch.deletedLineIds,
    collaborationBaseUpdatedAt: patch.collaborationBaseUpdatedAt ?? existing.updated_at.toISOString(),
    draftLineIds: patch.draftLineIds,
    collaborationBaseHeader: patch.collaborationBaseHeader,
    collaborationChangedHeaderFields: Object.keys(header) as Array<'branchId' | 'partyId' | 'remark' | 'vehicleImageNames' | 'vehicleNo' | 'godownName'>,
    id: String(existing.id),
    lines: scopedLines,
    partyId: header.partyId ?? partyId,
    remark: header.remark ?? existing.remark ?? '',
    saveScope: patch.scope,
    sectionLineIds: patch.scope === 'section' ? patch.sectionLineIds : undefined,
    type: existing.doc_type as 'WTI' | 'WTO',
    vehicleImageNames: header.vehicleImageNames ?? existing.vehicle_image_names ?? [],
    vehicleNo: header.vehicleNo ?? existing.vehicle_no,
    godownName: header.godownName ?? existing.godown_name,
  }
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
    const actorDisplayNames = await resolveWeightTicketActorDisplayNames([
      responseMapped.createdBy,
      responseMapped.enteredBy,
      responseMapped.updatedBy,
      ...downstreamAllocations.map((event) => event.createdBy),
      ...timeline.map((event) => event.actorName),
      ...usageTimeline.map((event) => event.createdBy),
    ])
    return withAuthNoStore(NextResponse.json({
      ...responseMapped,
      createdBy: weightTicketActorDisplayName(responseMapped.createdBy, actorDisplayNames),
      downstreamAllocations: downstreamAllocations.map((event) => ({ ...event, createdBy: weightTicketActorDisplayName(event.createdBy, actorDisplayNames) })),
      enteredBy: responseMapped.enteredBy == null ? null : weightTicketActorDisplayName(responseMapped.enteredBy, actorDisplayNames),
      pendingOutEvents,
      timeline: timeline.map((event) => ({ ...event, actorName: weightTicketActorDisplayName(event.actorName, actorDisplayNames) })),
      updatedBy: responseMapped.updatedBy == null ? null : weightTicketActorDisplayName(responseMapped.updatedBy, actorDisplayNames),
      usageTimeline: usageTimeline.map((event) => ({ ...event, createdBy: weightTicketActorDisplayName(event.createdBy, actorDisplayNames) })),
    }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return withAuthNoStore(authContextErrorResponse(caught))
    if (caught instanceof WeightTicketDataContractError) return withAuthNoStore(apiErrorResponse(caught, 'ข้อมูลประวัติใบรับ-ส่งของไม่ครบ กรุณาแจ้งผู้ดูแลระบบ', caught.status))
    return withAuthNoStore(apiErrorResponse(caught, 'โหลดใบรับ-ส่งของไม่ได้', 500))
  }
}

async function updateWeightTicket(
  request: Request,
  context: { params: Promise<{ id: string }> },
  auditRequest: Request = request,
) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.update')

    const { id } = await context.params
    const rawBody = await request.json()
    const parsedValues = weightTicketFormSchema.parse(rawBody)
    const draftLineIds = new Set(parsedValues.draftLineIds ?? [])
    const unmarkedDraftLot = parsedValues.lines.find((line) => (
      isWeightTicketDraftLotSkeleton(line) && !draftLineIds.has(line.id)
    ))
    if (unmarkedDraftLot) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'เต๋าใหม่ต้องกรอกน้ำหนักและแนบรูปภาพก่อนบันทึก',
        fieldErrors: {
          [`lines.${parsedValues.lines.findIndex((line) => line.id === unmarkedDraftLot.id)}.grossWeight`]: ['กรอกน้ำหนักรวม'],
        },
      }, { status: 400 })
    }
    const imageBucket = await resolveWeightTicketImageBucket()
    const values = normalizeWeightTicketImageReferences(parsedValues, imageBucket)
    const scopedBranchIds = branchScopeIds(auth)
    const existing = await findScopedTicket(id, scopedBranchIds)
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของที่ต้องการแก้ไข' }, { status: 404 })
    const imageStorageKeys = await assertWeightTicketImageAssetOwnership({
      authUserId: auth.authUser.id,
      bucket: imageBucket,
      record: values,
      ticketId: existing.id,
    })

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
    if (values.saveScope === 'section' && existing.status === 'delivered' && values.type === 'WTO') {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'WTO ที่ยืนยันส่งของแล้วต้องบันทึกทั้งเอกสาร เพื่อคำนวณและตรวจ stock พร้อมกัน',
      }, { status: 400 })
    }
    const beforeSnapshot = weightTicketAuditSnapshot(mapWeightTicketRow(existing as WeightTicketRow, usage))

    const parsedImpurityIds = values.lines.map((line) => parseInternalBigIntId(line.impurityId))
    const productCodes = [...new Set(values.lines.flatMap((line) => [
      line.productId.trim().toUpperCase(),
      line.impurityProductId?.trim().toUpperCase() ?? '',
    ]).filter(Boolean))]
    const impurityIds = [...new Set(parsedImpurityIds.filter((value): value is bigint => value != null))]
    const hasCollaborationBaseline = values.collaborationBaseLineVersions !== undefined
    const changedHeaderFields = new Set(values.collaborationChangedHeaderFields ?? [])
    const requestOwnsBranch = !hasCollaborationBaseline || changedHeaderFields.has('branchId')
    const requestOwnsParty = !hasCollaborationBaseline || changedHeaderFields.has('partyId')
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

    const validationBranch = requestOwnsBranch ? branch : existing.branches
    const validationSupplier = values.type === 'WTI' && requestOwnsParty ? supplier : existing.suppliers
    const validationCustomer = values.type === 'WTO' && requestOwnsParty ? customer : existing.customers
    if (!validationBranch || (scopedBranchIds !== null && !scopedBranches.some((item) => item.id === validationBranch.id))) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    }
    try {
      await assertWeightTicketPartyForType({ branchId: validationBranch.id, customer: validationCustomer, supplier: validationSupplier, type: values.type })
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
    const collaborationBaseLineVersions = values.collaborationBaseLineVersions ?? {}
    const collaborationChangedLineIds = new Set(values.collaborationChangedLineIds ?? values.lines.map((line) => line.id))
    const collaborationDeletedLineIds = new Set(values.collaborationDeletedLineIds ?? [])
    const ticketId = existing.id
    const updateResult = await prisma.$transaction(async (tx) => {
      // Every ticket mutation uses the same lock and then re-reads lifecycle
      // state. PUT must not continue from a draft snapshot after confirm,
      // cancel, or downstream usage has already changed the ticket.
      await tx.$executeRaw`select pg_advisory_xact_lock(${ticketId})`
      const existing = await tx.weight_tickets.findUniqueOrThrow({ include: ticketInclude, where: { id: ticketId } })
      const lockedUsage = await getWeightTicketUsageCounts(tx, existing.id)
      if (!canEditWeightTicket({ docType: existing.doc_type, status: existing.status }, lockedUsage)) {
        throw new WeightTicketWriteValidationError(mutableTicketErrorMessage('edit', lockedUsage), {})
      }
      const sectionExistingLineIds = new Set<string>()
      if (values.saveScope === 'section') {
        const sectionLineIds = new Set(values.sectionLineIds ?? [])
        const lineById = new Map(existing.weight_ticket_lines.map((line) => [String(line.id), line] as const))
        const rootIdById = new Map<string, string>()
        const rootId = (lineId: string, visiting = new Set<string>()): string => {
          const cached = rootIdById.get(lineId)
          if (cached) return cached
          const line = lineById.get(lineId)
          if (!line?.parent_line_no || visiting.has(lineId)) {
            rootIdById.set(lineId, lineId)
            return lineId
          }
          const parent = existing.weight_ticket_lines.find((candidate) => candidate.line_no === line.parent_line_no)
          const nextVisiting = new Set(visiting)
          nextVisiting.add(lineId)
          const root = parent ? rootId(String(parent.id), nextVisiting) : lineId
          rootIdById.set(lineId, root)
          return root
        }
        const existingSectionRoots = new Set(
          [...sectionLineIds]
            .map((lineId) => lineById.has(lineId) ? rootId(lineId) : null)
            .filter((lineId): lineId is string => lineId !== null),
        )
        if (existingSectionRoots.size > 1) {
          throw new WeightTicketWriteValidationError('บันทึกได้ครั้งละ section เดียว และห้ามส่งรายการข้ามสินค้า', {})
        }
        if (existingSectionRoots.size === 1) {
          const sectionRoot = [...existingSectionRoots][0]
          const expectedSectionIds = existing.weight_ticket_lines
            .filter((line) => rootId(String(line.id)) === sectionRoot)
            .map((line) => String(line.id))
          expectedSectionIds.forEach((lineId) => sectionExistingLineIds.add(lineId))
          const submittedSectionIds = new Set([
            ...values.lines.map((line) => line.id),
            ...(values.collaborationDeletedLineIds ?? []),
          ])
          const missingSectionIds = expectedSectionIds.filter((lineId) => !submittedSectionIds.has(lineId))
          if (missingSectionIds.length) {
            throw new WeightTicketWriteValidationError('ข้อมูล section ไม่ครบ กรุณาโหลดข้อมูลล่าสุดแล้วบันทึกใหม่', {})
          }
        }
      }
      const collaborationCurrentUpdatedAt = existing.updated_at
      // A stale updatedAt only matters when another user changed the ticket
      // after the client's baseline. Background auto-saves from the same
      // session bump updated_at between the baseline capture and the explicit
      // save, so a mismatch with the current actor as the last writer is
      // self-inflicted and must not surface as a false-positive 409.
      const hasRemoteLineChanges = Boolean(
        collaborationBaseUpdatedAt
        && collaborationBaseUpdatedAt !== (collaborationCurrentUpdatedAt?.toISOString() ?? null)
        && existing.updated_by !== actor,
      )
      await tx.weight_ticket_product_summary_lines.deleteMany({
        where: {
          weight_ticket_product_summaries: {
            weight_ticket_id: existing.id,
          },
        },
      })
      let createdLines: Awaited<ReturnType<typeof prisma.weight_ticket_lines.findMany>>
      let lineIdMap: Record<string, string> = {}
      let effectiveValues = values
      let effectiveTotals = totals
      // Collaboration-aware saves must keep immutable line IDs even when this
      // request is the first writer after the shared baseline. Falling back to
      // delete-and-recreate here would invalidate another user's in-progress
      // line IDs and make the next save unable to merge safely.
      const headerFields = ['branchId', 'partyId', 'remark', 'vehicleImageNames', 'vehicleNo', 'godownName'] as const
      const currentPartyId = existing.doc_type === 'WTI' ? existing.suppliers?.code ?? '' : existing.customers?.code ?? ''
      const currentHeader = {
        branchId: existing.branches?.code ?? '',
        partyId: currentPartyId,
        remark: existing.remark ?? '',
        vehicleImageNames: existing.vehicle_image_names ?? [],
        vehicleNo: existing.vehicle_no ?? '',
        godownName: existing.godown_name ?? '',
      }
      const conflictingHeaderFields = hasRemoteLineChanges && values.collaborationBaseHeader
        ? headerFields.filter((field) => values.collaborationChangedHeaderFields?.includes(field) && JSON.stringify(currentHeader[field]) !== JSON.stringify(values.collaborationBaseHeader?.[field]))
        : []
      if (conflictingHeaderFields.length) throw new WeightTicketCollaborationConflictError([], conflictingHeaderFields)
      if (hasCollaborationBaseline) {
        effectiveValues = {
          ...effectiveValues,
          branchId: changedHeaderFields.has('branchId') ? effectiveValues.branchId : currentHeader.branchId,
          partyId: changedHeaderFields.has('partyId') ? effectiveValues.partyId : currentHeader.partyId,
          remark: changedHeaderFields.has('remark') ? effectiveValues.remark : currentHeader.remark,
          vehicleImageNames: changedHeaderFields.has('vehicleImageNames') ? effectiveValues.vehicleImageNames : currentHeader.vehicleImageNames,
          vehicleNo: changedHeaderFields.has('vehicleNo') ? effectiveValues.vehicleNo : currentHeader.vehicleNo,
          godownName: changedHeaderFields.has('godownName') ? effectiveValues.godownName : currentHeader.godownName,
        }
      }
      const effectiveBranch = requestOwnsBranch ? branch : existing.branches
      if (!effectiveBranch) {
        throw new WeightTicketWriteValidationError('ไม่พบสาขาของใบรับ-ส่งของ', { branchId: ['เลือกสาขา'] })
      }
      const effectiveSupplier = values.type === 'WTI' && requestOwnsParty ? supplier : existing.suppliers
      const effectiveCustomer = values.type === 'WTO' && requestOwnsParty ? customer : existing.customers
      const partySnapshot = weightTicketPartySnapshot({ customer: effectiveCustomer, supplier: effectiveSupplier, type: values.type })
      const documentDate = toDateOnly(existing.document_date)
      const nextStatus = existing.status
      const branchCode = requireWeightTicketBranchDocumentCode(effectiveBranch.code)
      const mustRenumber = existing.branch_id !== effectiveBranch.id
      const docNo = mustRenumber
        ? await (async () => {
          await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('weight_tickets.doc_no'))`
          return nextWeightTicketDocNo(tx, values.type, branchCode, documentDate)
        })()
        : existing.doc_no
      let warehouseByCode = await resolveWeightTicketWarehousesForWrite(tx, { branchId: effectiveBranch.id, lines: effectiveValues.lines, type: values.type })
      const warehouseNameById = new Map([...warehouseByCode.values()].map((warehouse) => [warehouse.id, warehouse.name] as const))
      existing.weight_ticket_lines.forEach((line) => {
        if (line.warehouses) warehouseNameById.set(line.warehouses.id, line.warehouses.name)
      })
      const lineRows = buildWeightTicketLineRows(existing.id, effectiveValues, productByCode, impurityById, warehouseByCode)
      let effectiveLineRows = lineRows
      const isDeliveredWtoEdit = existing.status === 'delivered' && values.type === 'WTO'
      if (isDeliveredWtoEdit && hasRemoteLineChanges && values.collaborationBaseLineVersions !== undefined) {
        throw new WeightTicketCollaborationConflictError(Array.from(collaborationChangedLineIds))
      }
      const shouldRebuildWtoPendingOut = isDeliveredWtoEdit && shouldRebuildWtoPendingOutOnEdit({
        branchChanged: existing.branch_id !== effectiveBranch.id,
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
      if (
        !isDeliveredWtoEdit &&
        !shouldRebuildWtoPendingOut &&
        (hasRemoteLineChanges || hasCollaborationBaseline)
      ) {
        // Multiple users may be editing the same draft. Use immutable DB line
        // ids when available, while accepting the previous docNo:lineNo ids
        // from an already-open tab during the transition.
        const latestLines = existing.weight_ticket_lines
        const latestLineIds = new Set(latestLines.map((line) => String(line.id)))
        const missingChangedLineIds = Object.keys(collaborationBaseLineVersions)
          .filter((lineId) => collaborationChangedLineIds.has(lineId) && !latestLineIds.has(lineId))
        if (missingChangedLineIds.length) throw new WeightTicketCollaborationConflictError(missingChangedLineIds)
        // A version mismatch only blocks the save when another user was the
        // last writer of the line. Lines the current actor created (never
        // updated) or updated with an earlier save are self-inflicted baseline
        // drift: background auto-saves bump versions/updated_at after the
        // client captured its baseline, so the merge below reconciles them
        // instead of failing with a false-positive 409. A genuine conflict
        // still surfaces when the line was last written by someone else.
        const isRealLineConflict = (line: (typeof latestLines)[number]) => (
          line.updated_by !== actor
          && (line.version > 1 || line.updated_by != null)
        )
        const conflictingLineIds = latestLines
          .filter((line) => collaborationChangedLineIds.has(String(line.id)))
          .filter((line) => {
            const baseVersion = collaborationBaseLineVersions[String(line.id)]
            return baseVersion == null || line.version !== baseVersion
          })
          .filter(isRealLineConflict)
          .map((line) => String(line.id))
        if (conflictingLineIds.length) throw new WeightTicketCollaborationConflictError(conflictingLineIds)
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
        const latestLineById = new Map(latestLines.map((line) => [String(line.id), line] as const))
        const mergeLine = (valueLine: (typeof values.lines)[number]) => {
          if (collaborationChangedLineIds.has(valueLine.id)) return valueLine
          const latestLine = latestLineById.get(valueLine.id)
          return latestLine ? persistedLineToFormLine(latestLine, lineIdByLineNo) : null
        }
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
        const submittedLines = values.lines.map(mergeLine).filter((line): line is (typeof values.lines)[number] => line != null)
        const persistedLines = latestLines.map((line) => persistedLineToFormLine(line, lineIdByLineNo))
        const remoteOnlyLines = latestLines.filter((line) => !incomingExistingIds.has(line.id) && !wasInBase(line))
        effectiveValues = {
          ...effectiveValues,
          lines: values.saveScope === 'section'
            ? mergeWeightTicketSectionLines(persistedLines, submittedLines, sectionExistingLineIds)
            : [
                ...submittedLines,
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
        warehouseByCode = await resolveWeightTicketWarehousesForWrite(tx, { branchId: effectiveBranch.id, lines: effectiveValues.lines, type: effectiveValues.type })
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
        const removedLineIds = selectWeightTicketRemovedLineIds(latestLines, {
          explicitlyDeletedLineIds: collaborationDeletedLineIds,
          incomingExistingIds,
          saveScope: values.saveScope,
          wasInBase,
        })
        if (removedLineIds.length) await tx.weight_ticket_lines.deleteMany({ where: { id: { in: removedLineIds } } })
        // Two-phase write: line_no is unique per ticket, so updates that
        // renumber rows (a deletion or reorder shifts every following line)
        // must first vacate their old line numbers before any row takes a
        // slot another row still occupies. A single Promise.all raced those
        // updates against each other and produced P2002 "ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว".
        const lineWriteSteps = effectiveLineRows.map((data, index) => {
          const valueLine = effectiveValues.lines[index]
          const currentLine = latestLineByClientId.get(valueLine.id)
          return currentLine
            ? {
                clientId: valueLine.id,
                currentLineId: currentLine.id,
                data,
                isChanged: collaborationChangedLineIds.has(String(currentLine.id)),
                kind: 'update' as const,
              }
            : { clientId: valueLine.id, data, kind: 'create' as const }
        })
        const maxCurrentLineNo = latestLines.reduce((max, line) => Math.max(max, line.line_no), 0)
        await Promise.all(lineWriteSteps.map((step, index) => (
          step.kind === 'update'
            ? tx.weight_ticket_lines.update({
                data: { line_no: maxCurrentLineNo + index + 1 },
                where: { id: step.currentLineId },
              })
            : Promise.resolve()
        )))
        const persistedLinePairs: Array<readonly [string, string]> = []
        for (const [index, step] of lineWriteSteps.entries()) {
          if (step.kind === 'update') {
            await tx.weight_ticket_lines.update({
              data: {
                ...step.data,
                line_no: index + 1,
                ...(step.isChanged ? { updated_at: new Date(), updated_by: actor, version: { increment: 1 } } : {}),
              },
              where: { id: step.currentLineId },
            })
            persistedLinePairs.push([step.clientId, String(step.currentLineId)])
          } else {
            const createdLine = await tx.weight_ticket_lines.create({ data: { ...step.data, line_no: index + 1 } })
            persistedLinePairs.push([step.clientId, String(createdLine.id)])
          }
        }
        lineIdMap = Object.fromEntries(persistedLinePairs)
        createdLines = await tx.weight_ticket_lines.findMany({ orderBy: { line_no: 'asc' }, where: { weight_ticket_id: existing.id } })
      } else if (isDeliveredWtoEdit && !shouldRebuildWtoPendingOut) {
        const existingLineByLineNo = new Map(existing.weight_ticket_lines.map((line) => [line.line_no, line] as const))
        const retainedLineNos = new Set(lineRows.map((line) => line.line_no))
        const removedLineIds = existing.weight_ticket_lines
          .filter((line) => !retainedLineNos.has(line.line_no))
          .map((line) => line.id)
        if (removedLineIds.length) await tx.weight_ticket_lines.deleteMany({ where: { id: { in: removedLineIds } } })
        // Two-phase write so renumbering cannot violate the (ticket, line_no)
        // unique constraint mid-flight (see the collaboration branch above).
        const deliveredLineWriteSteps = lineRows.map((data, index) => {
          const existingLine = existingLineByLineNo.get(data.line_no)
          return existingLine
            ? {
                clientId: effectiveValues.lines[index].id,
                currentLineId: existingLine.id,
                data,
                isChanged: weightTicketLineWriteFingerprint(existingLine) !== weightTicketLineWriteFingerprint(data),
                kind: 'update' as const,
              }
            : { clientId: effectiveValues.lines[index].id, data, kind: 'create' as const }
        })
        const deliveredMaxLineNo = existing.weight_ticket_lines.reduce((max, line) => Math.max(max, line.line_no), 0)
        await Promise.all(deliveredLineWriteSteps.map((step, index) => (
          step.kind === 'update'
            ? tx.weight_ticket_lines.update({
                data: { line_no: deliveredMaxLineNo + index + 1 },
                where: { id: step.currentLineId },
              })
            : Promise.resolve()
        )))
        const persistedLinePairs: Array<readonly [string, string]> = []
        for (const [index, step] of deliveredLineWriteSteps.entries()) {
          if (step.kind === 'update') {
            await tx.weight_ticket_lines.update({
              data: {
                ...step.data,
                line_no: index + 1,
                ...(step.isChanged ? { updated_at: new Date(), updated_by: actor, version: { increment: 1 } } : {}),
              },
              where: { id: step.currentLineId },
            })
            persistedLinePairs.push([step.clientId, String(step.currentLineId)])
          } else {
            const createdLine = await tx.weight_ticket_lines.create({ data: { ...step.data, line_no: index + 1 } })
            persistedLinePairs.push([step.clientId, String(createdLine.id)])
          }
        }
        lineIdMap = Object.fromEntries(persistedLinePairs)
        createdLines = await tx.weight_ticket_lines.findMany({ orderBy: { line_no: 'asc' }, where: { weight_ticket_id: existing.id } })
      } else {
        await tx.weight_ticket_lines.deleteMany({ where: { weight_ticket_id: existing.id } })
        createdLines = await Promise.all(lineRows.map((data) => tx.weight_ticket_lines.create({ data })))
        lineIdMap = Object.fromEntries(effectiveValues.lines.map((line, index) => [line.id, String(createdLines[index].id)]))
      }
      if (effectiveValues.type === 'WTO' && effectiveValues.saveScope !== 'header') {
        await validateWeightTicketStockForWrite(tx, {
          branchId: effectiveBranch.id,
          excludeWeightTicketId: existing.status === 'delivered' ? existing.id : undefined,
          lineRows: effectiveLineRows,
          type: effectiveValues.type,
        })
      }
      const editChanges = buildWeightTicketEditChanges({
        branchName: effectiveBranch.name,
        customerName: customer?.name ?? '',
        docNo,
        existing: existing as WeightTicketRow,
        lineRows: effectiveLineRows,
        supplierName: supplier?.name ?? '',
        totals: effectiveTotals,
        values: effectiveValues,
        warehouseNameById,
      })
      const hasDirectEditChanges = editChanges.length > 0
      const imageCount = effectiveValues.vehicleImageNames.length + createdLines.reduce((sum, line) => sum + (line.image_count ?? 0), 0)
      await tx.weight_tickets.update({
        data: {
          branch_id: effectiveBranch.id,
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
          updated_at: hasDirectEditChanges ? new Date() : existing.updated_at,
          updated_by: hasDirectEditChanges ? actor : existing.updated_by,
          vehicle_image_count: effectiveValues.vehicleImageNames.length,
          vehicle_image_names: effectiveValues.vehicleImageNames,
          vehicle_no: effectiveValues.vehicleNo,
        },
        where: { id: existing.id },
      })
      await attachWeightTicketImageAssets(tx, {
        authUserId: auth.authUser.id,
        bucket: imageBucket,
        storageKeys: imageStorageKeys,
        ticketId: existing.id,
      })
      const createdPendingOutHoldIds = shouldRebuildWtoPendingOut
        ? await applyWeightTicketEditSideEffects(tx, {
          actor,
          branchId: effectiveBranch.id,
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
      const hasPendingOutTimelineChanges = shouldRebuildWtoPendingOut
        && (createdPendingOutHoldIds.length || releasedPendingOutHolds.length) > 0
      const statusLogEventKey = shouldAppendWeightTicketEditTimeline(editChanges, hasPendingOutTimelineChanges)
        ? await appendWeightTicketStatusLog(tx, {
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
        : null
      if (hasPendingOutTimelineChanges) {
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

      const ticket = await tx.weight_tickets.findUniqueOrThrow({
        include: ticketInclude,
        where: { id: existing.id },
      })
      return { lineIdMap, ticket }
    })

    const updated = updateResult.ticket
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
        request: auditRequest,
        targetId: String(updated.id),
        targetLabel: updated.doc_no,
        targetType: 'weight_ticket',
    })
    void publishWeightTicketChange({ branchId: mapped.branchId, changeType: 'updated', documentNo: mapped.documentNo, updatedAt: mapped.updatedAt, lineIds: mapped.lines.map((line) => line.id) })
    const actorDisplayNames = await resolveWeightTicketActorDisplayNames([mapped.createdBy, mapped.enteredBy, mapped.updatedBy])
    return NextResponse.json({
      ...mapped,
      createdBy: weightTicketActorDisplayName(mapped.createdBy, actorDisplayNames),
      enteredBy: mapped.enteredBy == null ? null : weightTicketActorDisplayName(mapped.enteredBy, actorDisplayNames),
      lineIdMap: updateResult.lineIdMap,
      updatedBy: mapped.updatedBy == null ? null : weightTicketActorDisplayName(mapped.updatedBy, actorDisplayNames),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WeightTicketDataContractError) return apiErrorResponse(caught, 'ข้อมูลประวัติใบรับ-ส่งของไม่ครบ กรุณาแจ้งผู้ดูแลระบบ', caught.status)
    if (caught instanceof WtoPendingOutError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    if (caught instanceof WeightTicketCollaborationConflictError) {
      return NextResponse.json({ code: caught.code, error: caught.message, headerFields: caught.headerFields, lineIds: caught.lineIds }, { status: caught.status })
    }
    return apiErrorResponse(caught, 'แก้ไขใบรับ-ส่งของไม่ได้', 400)
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return updateWeightTicket(request, context)
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const rawValues = await request.json()
    const existing = await findScopedTicket(id, branchScopeIds(auth))
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของที่ต้องการยกเลิก' }, { status: 404 })

    const deleteLines = weightTicketDeleteLinesSchema.safeParse(rawValues)
    if (deleteLines.success) {
      requirePermission(auth, 'daily.weight_tickets.update')
      const usage = await getWeightTicketUsageCounts(prisma, existing.id)
      if (!canEditWeightTicket({ docType: existing.doc_type, status: existing.status }, usage)) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: mutableTicketErrorMessage('edit', usage) }, { status: 400 })
      }
      const deletedIds = new Set(deleteLines.data.deletedLineIds)
      const existingIds = new Set(existing.weight_ticket_lines.map((line) => String(line.id)))
      const missingIds = [...deletedIds].filter((lineId) => !existingIds.has(lineId))
      if (missingIds.length) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบเต๋าที่ต้องการลบ' }, { status: 404 })
      const versionConflicts = [...deletedIds].filter((lineId) => {
        const line = existing.weight_ticket_lines.find((entry) => String(entry.id) === lineId)
        const expected = deleteLines.data.collaborationBaseLineVersions[String(line?.id)]
        return line && expected != null && (line.version ?? 1) !== expected
      })
      if (versionConflicts.length) return NextResponse.json({ code: 'CONFLICT', error: 'มีผู้ใช้อื่นแก้ไขเต๋าที่กำลังลบแล้ว กรุณาโหลดข้อมูลล่าสุด', lineIds: versionConflicts }, { status: 409 })
      const actor = currentActor(auth)
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select pg_advisory_xact_lock(${existing.id})`
        const locked = await tx.weight_tickets.findUniqueOrThrow({ include: ticketInclude, where: { id: existing.id } })
        const lockedLines = new Map(locked.weight_ticket_lines.map((line) => [String(line.id), line] as const))
        const lockedConflicts = [...deletedIds].filter((lineId) => {
          const line = lockedLines.get(lineId)
          const expected = deleteLines.data.collaborationBaseLineVersions[lineId]
          return !line || (expected != null && (line.version ?? 1) !== expected)
        })
        if (lockedConflicts.length) throw new WeightTicketCollaborationConflictError(lockedConflicts)
        await tx.weight_ticket_lines.deleteMany({ where: { id: { in: [...deletedIds].map((lineId) => BigInt(lineId)) }, weight_ticket_id: existing.id } })
        const remaining = await tx.weight_ticket_lines.findMany({ orderBy: { line_no: 'asc' }, where: { weight_ticket_id: existing.id } })
        if (remaining.length) {
          await tx.weight_ticket_lines.updateMany({ data: { line_no: { increment: 1000000 } }, where: { weight_ticket_id: existing.id } })
          for (const [index, line] of remaining.entries()) await tx.weight_ticket_lines.update({ data: { line_no: index + 1 }, where: { id: line.id } })
        }
        return tx.weight_tickets.update({ data: { updated_at: new Date(), updated_by: actor }, include: ticketInclude, where: { id: locked.id } })
      })
      const updatedUsage = await getWeightTicketUsageCounts(prisma, updated.id)
      const mapped = mapWeightTicketRow(updated as WeightTicketRow, updatedUsage)
      const actorDisplayNames = await resolveWeightTicketActorDisplayNames([mapped.createdBy, mapped.updatedBy])
      return NextResponse.json({ ...mapped, createdBy: weightTicketActorDisplayName(mapped.createdBy, actorDisplayNames), lineIdMap: {}, updatedBy: mapped.updatedBy == null ? null : weightTicketActorDisplayName(mapped.updatedBy, actorDisplayNames) })
    }

    const incrementalPatch = weightTicketIncrementalPatchSchema.safeParse(rawValues)
    if (incrementalPatch.success) {
      const values = buildIncrementalFormValues(existing, incrementalPatch.data)
      const delegatedRequest = new Request(request.url, {
        body: JSON.stringify(values),
        headers: new Headers(request.headers),
        method: 'PUT',
      })
      delegatedRequest.headers.set('content-type', 'application/json')
      return updateWeightTicket(delegatedRequest, context, request)
    }
    if (rawValues && typeof rawValues === 'object' && rawValues.operation === 'save_changes') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'รูปแบบข้อมูลบันทึกการเปลี่ยนแปลงไม่ถูกต้อง' }, { status: 400 })
    }

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
      void publishWeightTicketChange({ branchId: mapped.branchId, changeType: 'confirmed', documentNo: mapped.documentNo, updatedAt: mapped.updatedAt })
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
      const actorDisplayNames = await resolveWeightTicketActorDisplayNames([
        responseMapped.createdBy,
        responseMapped.enteredBy,
        responseMapped.updatedBy,
        ...timeline.map((event) => event.actorName),
      ])
      return NextResponse.json({
        ...responseMapped,
        createdBy: weightTicketActorDisplayName(responseMapped.createdBy, actorDisplayNames),
        enteredBy: responseMapped.enteredBy == null ? null : weightTicketActorDisplayName(responseMapped.enteredBy, actorDisplayNames),
        pendingOutEvents,
        timeline: timeline.map((event) => ({ ...event, actorName: weightTicketActorDisplayName(event.actorName, actorDisplayNames) })),
        updatedBy: responseMapped.updatedBy == null ? null : weightTicketActorDisplayName(responseMapped.updatedBy, actorDisplayNames),
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
    void publishWeightTicketChange({ branchId: mapped.branchId, changeType: 'cancelled', documentNo: mapped.documentNo, updatedAt: mapped.updatedAt })
    const [timeline, pendingOutEvents] = await Promise.all([
      getWeightTicketTimeline(prisma, updated.id),
      getWeightTicketPendingOutEvents(prisma, updated.id),
    ])
    const actorDisplayNames = await resolveWeightTicketActorDisplayNames([
      responseMapped.createdBy,
      responseMapped.enteredBy,
      responseMapped.updatedBy,
      ...timeline.map((event) => event.actorName),
    ])
    return NextResponse.json({
      ...responseMapped,
      createdBy: weightTicketActorDisplayName(responseMapped.createdBy, actorDisplayNames),
      enteredBy: responseMapped.enteredBy == null ? null : weightTicketActorDisplayName(responseMapped.enteredBy, actorDisplayNames),
      pendingOutEvents,
      timeline: timeline.map((event) => ({ ...event, actorName: weightTicketActorDisplayName(event.actorName, actorDisplayNames) })),
      updatedBy: responseMapped.updatedBy == null ? null : weightTicketActorDisplayName(responseMapped.updatedBy, actorDisplayNames),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WeightTicketDataContractError) return apiErrorResponse(caught, 'ข้อมูลประวัติใบรับ-ส่งของไม่ครบ กรุณาแจ้งผู้ดูแลระบบ', caught.status)
    if (caught instanceof WtoPendingOutError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'ยกเลิกใบรับ-ส่งของไม่ได้', 400)
  }
}
