import { after, NextResponse } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { calculateTicketTotals, isOtherProductImpurityLabel, isWeightTicketDraftLotSkeleton, OTHER_PRODUCT_IMPURITY_ID, parseImpurityProductMeta, weightTicketCancelSchema, weightTicketConfirmSchema, weightTicketDeleteLinesSchema, weightTicketIncrementalPatchSchema, weightTicketUpdateSchema, type WeightTicketFormValues, type WeightTicketIncrementalPatch } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission, type AppAuthContext } from '@/lib/server/auth-context'
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
  assignWeightTicketLotSequences,
  buildWeightTicketDerivedFacts,
  buildWeightTicketLineRows,
  buildWeightTicketProductSummaryRows,
  buildWeightTicketRenumberedLineReferences,
  rebuildWeightTicketProductSummaries,
  canEditWeightTicket,
  canMutateWeightTicket,
  getWeightTicketTimeline,
  getWeightTicketDownstreamAllocations,
  getWeightTicketUsageTimeline,
  getWeightTicketUsageCounts,
  mapWeightTicketRow,
  mergeWeightTicketSectionLinesByChangeSet,
  resolveWeightTicketActorDisplayNames,
  selectWeightTicketRemoteDeletedChangedLineIds,
  selectWeightTicketRemovedLineIds,
  selectWeightTicketUnresolvedChangedLineIds,
  resolveWeightTicketLineClientIds,
  resolveWeightTicketDeleteClientIds,
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
  readonly details: WeightTicketCollaborationConflictDetails

  constructor(
    readonly lineIds: string[],
    readonly headerFields: string[] = [],
    details: Partial<WeightTicketCollaborationConflictDetails> = {},
  ) {
    super(headerFields.length ? 'มีผู้ใช้อื่นแก้ไขข้อมูลส่วนหัวแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก' : 'มีผู้ใช้อื่นแก้ไขเต๋าเดียวกันแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก')
    this.name = 'WeightTicketCollaborationConflictError'
    this.details = {
      baseLineVersions: {},
      baseUpdatedAt: null,
      changedLineIds: lineIds,
      currentLineVersions: {},
      deletedLineIds: [],
      headerFields,
      operation: 'update',
      scope: 'document',
      ...details,
    }
  }
}

type WeightTicketCollaborationConflictDetails = {
  baseLineVersions: Record<string, number>
  baseUpdatedAt: string | null
  changedLineIds: string[]
  currentLineVersions: Record<string, number>
  deletedLineIds: string[]
  headerFields: string[]
  operation: 'delete_lines' | 'update'
  scope: 'document' | 'header' | 'lines' | 'section'
}

async function recordWeightTicketCollaborationConflict({
  auth,
  conflict,
  documentId,
  documentNo,
  request,
}: {
  auth: AppAuthContext | null
  conflict: WeightTicketCollaborationConflictError
  documentId: string
  documentNo: string | null
  request: Request
}) {
  if (!auth) {
    console.error('[weight-ticket-collaboration-conflict-log] missing auth context', { documentId, documentNo })
    return
  }
  try {
    await recordAuditLog({
      action: conflict.details.operation === 'delete_lines' ? 'delete' : 'update',
      context: auth,
      diff: {
        ...conflict.details,
        conflictingLineIds: conflict.lineIds,
      },
      entityId: documentId,
      entityLabel: documentNo,
      entitySchema: 'public',
      entityTable: 'weight_tickets',
      eventKey: 'daily.weight-ticket.collaboration-conflict',
      metadata: {
        conflictingLineCount: conflict.lineIds.length,
        documentNo,
        headerFieldCount: conflict.headerFields.length,
        operation: conflict.details.operation,
        requestId: request.headers.get('x-vercel-id') ?? request.headers.get('x-request-id'),
        scope: conflict.details.scope,
      },
      outcome: 'blocked',
      request,
      severity: 'warning',
      targetId: documentId,
      targetLabel: documentNo,
      targetType: 'weight_ticket',
    })
  } catch (caught) {
    // Conflict response must remain 409 even if the diagnostic sink is unavailable.
    console.error('[weight-ticket-collaboration-conflict-log] failed', {
      documentId,
      documentNo,
      error: caught instanceof Error ? caught.message : String(caught),
    })
  }
}

function logWeightTicketValidationFailure(context: {
  documentId: string
  documentNo?: string
  code?: string
  message: string
  fieldKeys?: string[]
  lineIds?: string[]
  draftLineIds?: string[]
  changedLineIds?: string[]
}) {
  // Keep diagnostics useful without logging weights, image names, party data,
  // or any other business payload. This is intentionally structured so the
  // same case can be correlated in local/Vercel function logs.
  console.warn('[weight-ticket-validation]', {
    changedLineIds: context.changedLineIds ?? [],
    code: context.code ?? 'BAD_REQUEST',
    documentId: context.documentId,
    documentNo: context.documentNo,
    draftLineIds: context.draftLineIds ?? [],
    fieldKeys: context.fieldKeys ?? [],
    lineIds: context.lineIds ?? [],
    message: context.message,
  })
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
    version: line.version,
    imageNames: line.image_names ?? [],
    impurityId: line.impurity_id == null
      ? isOtherProductImpurityLabel(line.impurity_name) ? OTHER_PRODUCT_IMPURITY_ID : ''
      : String(line.impurity_id),
    impurityProductId: impurityMeta.impurityProductId,
    impuritySourceLineId: line.impurity_source_line_no == null ? undefined : lineIdByLineNo.get(line.impurity_source_line_no),
    lotSeq: line.lot_seq ?? null,
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
  const clientLineIdMap = new Map(
    existing.weight_ticket_lines
      .filter((line) => Boolean(line.client_line_id))
      .map((line) => [line.client_line_id as string, String(line.id)] as const),
  )
  const resolveId = (lineId: string) => clientLineIdMap.get(lineId) ?? lineId
  const patchLines = resolveWeightTicketLineClientIds(patch.lines, clientLineIdMap).lines
  const lineIdByLineNo = new Map(existing.weight_ticket_lines.map((line) => [line.line_no, String(line.id)] as const))
  const currentLines = existing.weight_ticket_lines.map((line) => persistedLineToFormLine(line, lineIdByLineNo))
  const deletedIds = new Set(patch.deletedLineIds.map(resolveId))
  const changedById = new Map(patchLines.map((line) => [line.id, line] as const))
  const mergedLines = currentLines
    .filter((line) => !deletedIds.has(line.id))
    .map((line) => changedById.get(line.id) ?? line)
  patchLines.forEach((line) => {
    if (!currentLines.some((current) => current.id === line.id) && !deletedIds.has(line.id)) mergedLines.push(line)
  })

  const partyId = existing.doc_type === 'WTI' ? existing.suppliers?.code : existing.customers?.code
  if (!partyId) throw new Error('ข้อมูลคู่ค้าในเอกสารไม่ครบ')
  const currentBranchId = existing.branches?.code
  if (!currentBranchId) throw new WeightTicketDataContractError('ข้อมูลสาขาเดิมของใบรับ-ส่งของไม่ครบ')
  const currentVehicleNo = existing.vehicle_no
  if (!currentVehicleNo) throw new WeightTicketDataContractError('ข้อมูลทะเบียนรถเดิมของใบรับ-ส่งของไม่ครบ')
  const header = patch.header
  const baseLineIds = patch.collaborationBaseLineIds.map(resolveId)
  const changedLineIds = patch.collaborationChangedLineIds.map(resolveId)
  const sectionLineIds = patch.scope === 'section' ? patch.sectionLineIds?.map(resolveId) : undefined
  if (patch.scope === 'section' && (!sectionLineIds || sectionLineIds.length === 0)) {
    throw new Error('ต้องระบุรายการของ section ที่กำลังบันทึก')
  }
  const scopedLines = patch.scope === 'section'
    ? mergedLines.filter((line) => new Set(sectionLineIds).has(line.id))
    : patch.scope === 'header'
      ? []
      : mergedLines
  const currentHeader = {
    branchId: currentBranchId,
    partyId,
    remark: existing.remark ?? '',
    vehicleImageNames: existing.vehicle_image_names ?? [],
    vehicleNo: currentVehicleNo,
    godownName: existing.godown_name ?? '',
  }
  const effectiveHeader = { ...currentHeader, ...header }
  return {
    branchId: effectiveHeader.branchId,
    collaborationBaseLineIds: baseLineIds,
    collaborationBaseLineVersions: Object.fromEntries(Object.entries(patch.collaborationBaseLineVersions).map(([lineId, version]) => [resolveId(lineId), version])),
    collaborationChangedLineIds: changedLineIds,
    collaborationDeletedLineIds: patch.deletedLineIds.map(resolveId),
    collaborationBaseUpdatedAt: patch.collaborationBaseUpdatedAt,
    draftLineIds: patch.draftLineIds.map(resolveId),
    collaborationBaseHeader: patch.collaborationBaseHeader,
    collaborationChangedHeaderFields: Object.keys(header) as Array<'branchId' | 'partyId' | 'remark' | 'vehicleImageNames' | 'vehicleNo' | 'godownName'>,
    id: String(existing.id),
    lines: scopedLines,
    allowEmptyProductImages: true,
    partyId: effectiveHeader.partyId,
    remark: effectiveHeader.remark,
    saveScope: patch.scope,
    sectionLineIds,
    type: existing.doc_type as 'WTI' | 'WTO',
    vehicleImageNames: effectiveHeader.vehicleImageNames,
    vehicleNo: effectiveHeader.vehicleNo,
    godownName: effectiveHeader.godownName,
  }
}

function resolveWeightTicketCollaborationValues(
  values: WeightTicketFormValues,
  clientLineIdMap: ReadonlyMap<string, string>,
): WeightTicketFormValues {
  const resolveId = (lineId: string) => clientLineIdMap.get(lineId) ?? lineId
  const resolvedLines = resolveWeightTicketLineClientIds(values.lines, clientLineIdMap).lines
  const baseLineVersions = values.collaborationBaseLineVersions
    ? Object.fromEntries(Object.entries(values.collaborationBaseLineVersions).map(([lineId, version]) => [resolveId(lineId), version]))
    : undefined
  return {
    ...values,
    collaborationBaseLineIds: values.collaborationBaseLineIds?.map(resolveId),
    collaborationBaseLineVersions: baseLineVersions,
    collaborationChangedLineIds: values.collaborationChangedLineIds?.map(resolveId),
    collaborationDeletedLineIds: values.collaborationDeletedLineIds?.map(resolveId),
    draftLineIds: values.draftLineIds?.map(resolveId),
    lines: resolvedLines,
    sectionLineIds: values.sectionLineIds?.map(resolveId),
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const ticket = await findScopedTicket(id, branchScopeIds(auth))
    if (!ticket) return withAuthNoStore(NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 }))

    const searchParams = new URL(request.url).searchParams
    const includeImagePreviews = searchParams.get('includeImagePreviews') !== 'false'
    const includeHistory = searchParams.get('includeHistory') !== 'false'
    const historyPromise = includeHistory
      ? Promise.all([
        getWeightTicketTimeline(prisma, ticket.id),
        getWeightTicketUsageTimeline(prisma, ticket.id),
        getWeightTicketDownstreamAllocations(prisma, ticket.id),
        getWeightTicketPendingOutEvents(prisma, ticket.id),
      ])
      : getWeightTicketTimeline(prisma, ticket.id).then((timeline) => [timeline, [], [], []] as const)
    const [usage, [timeline, usageTimeline, downstreamAllocations, pendingOutEvents]] = await Promise.all([
      getWeightTicketUsageCounts(prisma, ticket.id),
      historyPromise,
    ])
    const mapped = mapWeightTicketRow(ticket as WeightTicketRow, usage)
    const responseMapped = includeImagePreviews
      ? await attachWeightTicketImagePreviewUrls(mapped, await resolveWeightTicketImageBucket())
      : mapped
    const actorDisplayNames = includeHistory
      ? await resolveWeightTicketActorDisplayNames([
        responseMapped.createdBy,
        responseMapped.enteredBy,
        responseMapped.updatedBy,
        ...downstreamAllocations.map((event) => event.createdBy),
        ...timeline.map((event) => event.actorName),
        ...usageTimeline.map((event) => event.createdBy),
      ])
      : new Map<string, string>()
    return withAuthNoStore(NextResponse.json({
      ...responseMapped,
      createdBy: weightTicketActorDisplayName(responseMapped.createdBy, actorDisplayNames),
      downstreamAllocations: downstreamAllocations.map((event) => ({ ...event, createdBy: weightTicketActorDisplayName(event.createdBy, actorDisplayNames) })),
      enteredBy: responseMapped.enteredBy == null ? null : weightTicketActorDisplayName(responseMapped.enteredBy, actorDisplayNames),
      pendingOutEvents,
      serverNow: new Date().toISOString(),
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
  options: { allowEmptyProductImages?: boolean } = {},
) {
  const { id } = await context.params
  let authForConflictLog: AppAuthContext | null = null
  let conflictDocumentId = id
  let conflictDocumentNo: string | null = null
  try {
    const auth = await getCurrentAuthContext()
    authForConflictLog = auth
    requirePermission(auth, 'daily.weight_tickets.update')

    const rawBody = await request.json()
    const parsedValues = weightTicketUpdateSchema.parse(
      options.allowEmptyProductImages
        ? rawBody
        : (() => {
          if (!rawBody || typeof rawBody !== 'object' || !('allowEmptyProductImages' in rawBody)) return rawBody
          const { allowEmptyProductImages: _ignored, ...publicBody } = rawBody as Record<string, unknown>
          return publicBody
        })(),
    )
    const draftLineIds = new Set(parsedValues.draftLineIds)
    const baselineLineIds = new Set(parsedValues.collaborationBaseLineIds)
    const changedLineIds = new Set(parsedValues.collaborationChangedLineIds)
    const unmarkedDraftLot = parsedValues.lines.find((line) => (
      isWeightTicketDraftLotSkeleton(line) && !draftLineIds.has(line.id)
      && (!baselineLineIds.has(line.id) || changedLineIds.has(line.id))
    ))
    if (unmarkedDraftLot) {
      logWeightTicketValidationFailure({
        changedLineIds: [...changedLineIds],
        documentId: id,
        draftLineIds: [...draftLineIds],
        lineIds: [unmarkedDraftLot.id],
        message: 'เต๋าใหม่ต้องกรอกน้ำหนักและแนบรูปภาพก่อนบันทึก',
      })
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
    conflictDocumentId = String(existing.id)
    conflictDocumentNo = existing.doc_no
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
    const parsedImpurityIds = values.lines.map((line) => parseInternalBigIntId(line.impurityId))
    const productCodes = [...new Set(values.lines.flatMap((line) => [
      line.productId.trim().toUpperCase(),
      line.impurityProductId?.trim().toUpperCase() ?? '',
    ]).filter(Boolean))]
    const impurityIds = [...new Set(parsedImpurityIds.filter((value): value is bigint => value != null))]
    const changedHeaderFields = new Set(values.collaborationChangedHeaderFields)
    const requestOwnsBranch = changedHeaderFields.has('branchId')
    const requestOwnsParty = changedHeaderFields.has('partyId')
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

    const collaborationBaseUpdatedAt = values.collaborationBaseUpdatedAt
    const collaborationBaseLineIds = new Set(values.collaborationBaseLineIds)
    const collaborationBaseLineVersions = values.collaborationBaseLineVersions
    const collaborationChangedLineIds = new Set(values.collaborationChangedLineIds)
    const collaborationDeletedLineIds = new Set(values.collaborationDeletedLineIds)
    console.info('[weight-ticket-realtime] patch.received', {
      documentId: id,
      changedLineIds: [...collaborationChangedLineIds],
      deletedLineIds: [...collaborationDeletedLineIds],
      submittedLineIds: values.lines.map((line) => line.id),
      changedHeaderFields: [...changedHeaderFields],
    })
    const ticketId = existing.id
    const submittedValues = values
    const updateResult = await prisma.$transaction(async (tx) => {
      // Every ticket mutation uses the same lock and then re-reads lifecycle
      // state. PUT must not continue from a draft snapshot after confirm,
      // cancel, or downstream usage has already changed the ticket.
      await tx.$executeRaw`select pg_advisory_xact_lock(${ticketId})`
      const existing = await tx.weight_tickets.findUniqueOrThrow({ include: ticketInclude, where: { id: ticketId } })
      const persistedClientLineIdMap = new Map(
        existing.weight_ticket_lines
          .filter((line) => Boolean(line.client_line_id))
          .map((line) => [line.client_line_id as string, String(line.id)] as const),
      )
      const values = resolveWeightTicketCollaborationValues(submittedValues, persistedClientLineIdMap)
      if (
        values.collaborationDeletedLineIds == null
        || values.collaborationChangedHeaderFields == null
        || values.collaborationBaseHeader == null
      ) {
        throw new WeightTicketDataContractError('ข้อมูล collaboration ของใบรับ-ส่งของไม่ครบ')
      }
      const collaborationChangedHeaderFields = values.collaborationChangedHeaderFields
      const collaborationBaseHeader = values.collaborationBaseHeader
      const collaborationBaseUpdatedAt = values.collaborationBaseUpdatedAt
      const collaborationBaseLineIds = new Set(values.collaborationBaseLineIds)
      const collaborationBaseLineVersions = values.collaborationBaseLineVersions
      const collaborationChangedLineIds = new Set(values.collaborationChangedLineIds)
      const collaborationDeletedLineIds = new Set(values.collaborationDeletedLineIds)
      const lockedUsage = await getWeightTicketUsageCounts(tx, existing.id)
      if (!canEditWeightTicket({ docType: existing.doc_type, status: existing.status }, lockedUsage)) {
        throw new WeightTicketWriteValidationError(mutableTicketErrorMessage('edit', lockedUsage), {})
      }
      const previousBranchId = existing.branches?.code
      if (!previousBranchId) throw new WeightTicketDataContractError('ข้อมูลสาขาเดิมของใบรับ-ส่งของไม่ครบ')
      if (scopedBranchIds !== null && !scopedBranchIds.includes(previousBranchId)) {
        throw new WeightTicketWriteValidationError('ไม่มีสิทธิ์แก้ไขใบรับ-ส่งของสาขานี้', { branchId: ['ไม่มีสิทธิ์แก้ไขใบรับ-ส่งของสาขานี้'] })
      }
      const previousDocumentNo = existing.doc_no
      conflictDocumentNo = previousDocumentNo
      const beforeSnapshot = weightTicketAuditSnapshot(mapWeightTicketRow(existing as WeightTicketRow, lockedUsage))
      // Realtime consumers only need to refresh signed image URLs when an
      // attachment actually changed. Compare against the locked row so a
      // concurrent write cannot make the event scope depend on a stale read.
      const existingLineById = new Map<string, (typeof existing.weight_ticket_lines)[number]>()
      existing.weight_ticket_lines.forEach((line) => {
        existingLineById.set(String(line.id), line)
      })
      const remoteDeletedChangedLineIds = selectWeightTicketRemoteDeletedChangedLineIds(
        collaborationChangedLineIds,
        collaborationBaseLineIds,
        new Set(existingLineById.keys()),
      )
      const effectiveCollaborationChangedLineIds = new Set(
        [...collaborationChangedLineIds].filter((lineId) => !remoteDeletedChangedLineIds.has(lineId)),
      )
      const imageNamesChanged = (before: string[] | null | undefined, after: string[]) => JSON.stringify(before ?? []) !== JSON.stringify(after)
      const imageChanged = changedHeaderFields.has('vehicleImageNames')
        || values.lines.some((line) => {
          if (!effectiveCollaborationChangedLineIds.has(line.id)) return false
          const existingLine = existingLineById.get(line.id)
          return !existingLine || imageNamesChanged(existingLine.image_names, line.imageNames)
        })
        || [...collaborationDeletedLineIds].some((lineId) => (existingLineById.get(lineId)?.image_names?.length ?? 0) > 0)
      const sectionExistingLineIds = new Set<string>()
      if (values.saveScope === 'section') {
        const sectionLineIds = new Set(values.sectionLineIds)
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
            ...values.collaborationDeletedLineIds,
          ])
          const baselineLineIds = new Set(values.collaborationBaseLineIds)
          const missingSectionIds = expectedSectionIds.filter((lineId) => (
            baselineLineIds.has(lineId) && !submittedSectionIds.has(lineId)
          ))
          if (missingSectionIds.length) {
            throw new WeightTicketWriteValidationError('ข้อมูล section ไม่ครบ กรุณาโหลดข้อมูลล่าสุดแล้วบันทึกใหม่', {})
          }
        }
      }
      const collaborationCurrentUpdatedAt = existing.updated_at
      // The server compares the submitted baseline with the locked row for
      // every actor. A same-user tab or background request is still a separate
      // write and must not bypass stale-baseline detection.
      const hasStaleCollaborationBaseline = collaborationBaseUpdatedAt !== collaborationCurrentUpdatedAt.toISOString()
      let createdLines: Awaited<ReturnType<typeof prisma.weight_ticket_lines.findMany>>
      let lineIdMap: Record<string, string> = {}
      let resolvedDeletedLineIds: string[] = []
      let effectiveValues = values
      let effectiveTotals = totals
      // Collaboration-aware saves keep immutable line IDs so another user's
      // in-progress line edits remain addressable after this write.
      const headerFields = ['branchId', 'partyId', 'remark', 'vehicleImageNames', 'vehicleNo', 'godownName'] as const
      const currentPartyId = existing.doc_type === 'WTI' ? existing.suppliers?.code : existing.customers?.code
      if (!currentPartyId) {
        throw new WeightTicketDataContractError('ข้อมูลคู่ค้าเดิมของใบรับ-ส่งของไม่ครบ')
      }
      const currentVehicleNo = existing.vehicle_no?.trim()
      if (!currentVehicleNo) {
        throw new WeightTicketDataContractError('ข้อมูลทะเบียนรถเดิมของใบรับ-ส่งของไม่ครบ')
      }
      const currentGodownName = existing.godown_name?.trim() ?? ''
      if (values.type === 'WTO' && !currentGodownName) {
        throw new WeightTicketDataContractError('ข้อมูลโกดังเดิมของใบรับ-ส่งของไม่ครบ')
      }
      const currentHeader = {
        branchId: previousBranchId,
        partyId: currentPartyId,
        remark: existing.remark ?? '',
        vehicleImageNames: existing.vehicle_image_names ?? [],
        vehicleNo: currentVehicleNo,
        godownName: currentGodownName,
      }
      const conflictingHeaderFields = hasStaleCollaborationBaseline
        ? headerFields.filter((field) => collaborationChangedHeaderFields.includes(field) && JSON.stringify(currentHeader[field]) !== JSON.stringify(collaborationBaseHeader[field]))
        : []
      if (conflictingHeaderFields.length) throw new WeightTicketCollaborationConflictError([], conflictingHeaderFields, {
        baseLineVersions: collaborationBaseLineVersions,
        baseUpdatedAt: collaborationBaseUpdatedAt,
        changedLineIds: [...collaborationChangedLineIds],
        currentLineVersions: Object.fromEntries(existing.weight_ticket_lines.map((line) => [String(line.id), line.version])),
        scope: values.saveScope === 'header' ? 'header' : values.saveScope,
      })
      effectiveValues = {
        ...effectiveValues,
        branchId: changedHeaderFields.has('branchId') ? effectiveValues.branchId : currentHeader.branchId,
        partyId: changedHeaderFields.has('partyId') ? effectiveValues.partyId : currentHeader.partyId,
        remark: changedHeaderFields.has('remark') ? effectiveValues.remark : currentHeader.remark,
        vehicleImageNames: changedHeaderFields.has('vehicleImageNames') ? effectiveValues.vehicleImageNames : currentHeader.vehicleImageNames,
        vehicleNo: changedHeaderFields.has('vehicleNo') ? effectiveValues.vehicleNo : currentHeader.vehicleNo,
        godownName: changedHeaderFields.has('godownName') ? effectiveValues.godownName : currentHeader.godownName,
      }
      const effectiveBranch = requestOwnsBranch
        ? await tx.branches.findFirst({
          select: { code: true, id: true, name: true },
          where: { active: true, code: effectiveValues.branchId.toUpperCase() },
        })
        : existing.branches
      if (!effectiveBranch) {
        throw new WeightTicketWriteValidationError('ไม่พบสาขาของใบรับ-ส่งของ', { branchId: ['เลือกสาขา'] })
      }
      if (scopedBranchIds !== null && !scopedBranchIds.includes(effectiveBranch.code)) {
        throw new WeightTicketWriteValidationError('ไม่มีสิทธิ์แก้ไขใบรับ-ส่งของสาขานี้', { branchId: ['ไม่มีสิทธิ์แก้ไขใบรับ-ส่งของสาขานี้'] })
      }
      const effectiveSupplier = values.type === 'WTI' && requestOwnsParty ? supplier : existing.suppliers
      const effectiveCustomer = values.type === 'WTO' && requestOwnsParty ? customer : existing.customers
      await assertWeightTicketPartyForType({
        branchId: effectiveBranch.id,
        customer: effectiveCustomer,
        supplier: effectiveSupplier,
        type: values.type,
      })
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
      if (isDeliveredWtoEdit && hasStaleCollaborationBaseline) {
        throw new WeightTicketCollaborationConflictError(Array.from(collaborationChangedLineIds), [], {
          baseLineVersions: collaborationBaseLineVersions,
          baseUpdatedAt: collaborationBaseUpdatedAt,
          changedLineIds: [...collaborationChangedLineIds],
          currentLineVersions: Object.fromEntries(existing.weight_ticket_lines.map((line) => [String(line.id), line.version])),
          scope: values.saveScope === 'section' ? 'section' : 'document',
        })
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
      if (
        !isDeliveredWtoEdit &&
        !shouldRebuildWtoPendingOut
      ) {
        // Multiple users may be editing the same draft. Persisted DB line ids
        // are the only identity accepted for collaboration merging. The
        // request's changed/deleted IDs are its exact write set: the latest
        // transaction wins for those rows, while untouched current rows are
        // retained from the locked database snapshot.
        const latestLines = existing.weight_ticket_lines
        const latestLineByClientId = new Map<string, (typeof latestLines)[number]>()
        latestLines.forEach((line) => {
          latestLineByClientId.set(String(line.id), line)
          if (line.client_line_id) latestLineByClientId.set(line.client_line_id, line)
        })
        const lineIdByLineNo = new Map(latestLines.map((line) => {
          const incomingLine = values.lines.find((valueLine) => latestLineByClientId.get(valueLine.id)?.id === line.id)
          return [line.line_no, incomingLine?.id ?? String(line.id)] as const
        }))
        const latestLineById = new Map(latestLines.map((line) => [String(line.id), line] as const))
        const mergeLine = (valueLine: (typeof values.lines)[number]) => {
          if (effectiveCollaborationChangedLineIds.has(valueLine.id)) return valueLine
          const latestLine = latestLineById.get(valueLine.id)
          return latestLine ? persistedLineToFormLine(latestLine, lineIdByLineNo) : null
        }
        const incomingExistingIds = new Set(
          values.lines
            .map((line) => latestLineByClientId.get(line.id)?.id)
            .filter((lineId): lineId is bigint => lineId != null),
        )
        const wasInBase = (line: (typeof latestLines)[number]) => collaborationBaseLineIds.has(String(line.id))
        const submittedLines = values.lines
          .map(mergeLine)
          .filter((line): line is (typeof values.lines)[number] => line != null && !collaborationDeletedLineIds.has(line.id))
        const persistedLines = latestLines.map((line) => persistedLineToFormLine(line, lineIdByLineNo))
        const remoteOnlyLines = latestLines.filter((line) => !incomingExistingIds.has(line.id) && !wasInBase(line))
        effectiveValues = {
          ...effectiveValues,
          lines: values.saveScope === 'section'
            ? mergeWeightTicketSectionLinesByChangeSet(
                persistedLines,
                submittedLines,
                sectionExistingLineIds,
                collaborationBaseLineIds,
                effectiveCollaborationChangedLineIds,
                collaborationDeletedLineIds,
              )
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
        resolvedDeletedLineIds = removedLineIds.map((lineId) => String(lineId))
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
                isChanged: effectiveCollaborationChangedLineIds.has(String(currentLine.id)),
                kind: 'update' as const,
              }
            : { clientId: valueLine.id, data, kind: 'create' as const }
        })
        const sequencedLineRows = await assignWeightTicketLotSequences(
          tx,
          existing.id,
          lineWriteSteps.map((step) => ({ data: step.data, existingLotSeq: step.kind === 'update' ? latestLineByClientId.get(step.clientId)?.lot_seq : undefined })),
        )
        const maxCurrentLineNo = latestLines.reduce((max, line) => Math.max(max, line.line_no), 0)
        for (const [index, step] of lineWriteSteps.entries()) {
          if (step.kind === 'update') {
            await tx.weight_ticket_lines.update({
              data: { line_no: maxCurrentLineNo + index + 1 },
              where: { id: step.currentLineId },
            })
          }
        }
        const persistedLinePairs: Array<readonly [string, string]> = []
        for (const [index, step] of lineWriteSteps.entries()) {
          if (step.kind === 'update') {
            await tx.weight_ticket_lines.update({
              data: {
                ...sequencedLineRows[index],
                line_no: index + 1,
                ...(step.isChanged ? { updated_at: new Date(), updated_by: actor, version: { increment: 1 } } : {}),
              },
              where: { id: step.currentLineId },
            })
            persistedLinePairs.push([step.clientId, String(step.currentLineId)])
          } else {
            const createdLine = await tx.weight_ticket_lines.create({
              data: {
                ...sequencedLineRows[index],
                client_line_id: step.clientId,
                line_no: index + 1,
              },
            })
            persistedLinePairs.push([step.clientId, String(createdLine.id)])
          }
        }
        lineIdMap = {
          ...Object.fromEntries(persistedClientLineIdMap),
          ...Object.fromEntries(persistedLinePairs),
        }
        createdLines = await tx.weight_ticket_lines.findMany({ orderBy: { line_no: 'asc' }, where: { weight_ticket_id: existing.id } })
      } else if (isDeliveredWtoEdit && !shouldRebuildWtoPendingOut) {
        const existingLineByLineNo = new Map(existing.weight_ticket_lines.map((line) => [line.line_no, line] as const))
        const retainedLineNos = new Set(lineRows.map((line) => line.line_no))
        const removedLineIds = existing.weight_ticket_lines
          .filter((line) => !retainedLineNos.has(line.line_no))
          .map((line) => line.id)
        resolvedDeletedLineIds = removedLineIds.map((lineId) => String(lineId))
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
        const sequencedDeliveredLineRows = await assignWeightTicketLotSequences(
          tx,
          existing.id,
          deliveredLineWriteSteps.map((step) => ({ data: step.data, existingLotSeq: step.kind === 'update' ? existingLineByLineNo.get(step.data.line_no)?.lot_seq : undefined })),
        )
        const deliveredMaxLineNo = existing.weight_ticket_lines.reduce((max, line) => Math.max(max, line.line_no), 0)
        for (const [index, step] of deliveredLineWriteSteps.entries()) {
          if (step.kind === 'update') {
            await tx.weight_ticket_lines.update({
              data: { line_no: deliveredMaxLineNo + index + 1 },
              where: { id: step.currentLineId },
            })
          }
        }
        const persistedLinePairs: Array<readonly [string, string]> = []
        for (const [index, step] of deliveredLineWriteSteps.entries()) {
          if (step.kind === 'update') {
            await tx.weight_ticket_lines.update({
              data: {
                ...sequencedDeliveredLineRows[index],
                line_no: index + 1,
                ...(step.isChanged ? { updated_at: new Date(), updated_by: actor, version: { increment: 1 } } : {}),
              },
              where: { id: step.currentLineId },
            })
            persistedLinePairs.push([step.clientId, String(step.currentLineId)])
          } else {
            const createdLine = await tx.weight_ticket_lines.create({
              data: {
                ...sequencedDeliveredLineRows[index],
                client_line_id: step.clientId,
                line_no: index + 1,
              },
            })
            persistedLinePairs.push([step.clientId, String(createdLine.id)])
          }
        }
        lineIdMap = {
          ...Object.fromEntries(persistedClientLineIdMap),
          ...Object.fromEntries(persistedLinePairs),
        }
        createdLines = await tx.weight_ticket_lines.findMany({ orderBy: { line_no: 'asc' }, where: { weight_ticket_id: existing.id } })
      } else {
        resolvedDeletedLineIds = [...collaborationDeletedLineIds]
        const existingLineById = new Map(existing.weight_ticket_lines.map((line) => [String(line.id), line] as const))
        const sequencedLineRows = await assignWeightTicketLotSequences(
          tx,
          existing.id,
          lineRows.map((data, index) => ({ data, existingLotSeq: existingLineById.get(effectiveValues.lines[index].id)?.lot_seq })),
        )
        await tx.weight_ticket_lines.deleteMany({ where: { weight_ticket_id: existing.id } })
        const rebuildLineRows = sequencedLineRows.map((data, index) => {
          const line = effectiveValues.lines[index]
          const existingLine = existingLineById.get(line.id)
          return {
            ...data,
            client_line_id: existingLine?.client_line_id ?? (existingLine ? null : line.id),
          }
        })
        createdLines = []
        for (const data of rebuildLineRows) {
          createdLines.push(await tx.weight_ticket_lines.create({ data }))
        }
        lineIdMap = Object.fromEntries(effectiveValues.lines.flatMap((line, index) => {
          const newId = String(createdLines[index].id)
          const existingLine = existingLineById.get(line.id)
          const durableClientId = existingLine?.client_line_id ?? (existingLine ? null : line.id)
          return [
            [line.id, newId] as const,
            ...(durableClientId && durableClientId !== line.id ? [[durableClientId, newId] as const] : []),
          ]
        }))
      }
      // Keep the request's delete set for write-set validation (a line that
      // was already deleted remotely must not remain as an unresolved local
      // change), but broadcast only the IDs that this transaction actually
      // removed.
      const requestedDeletedLineIds = new Set(collaborationDeletedLineIds)
      const unresolvedChangedLineIds = selectWeightTicketUnresolvedChangedLineIds(
        effectiveCollaborationChangedLineIds,
        requestedDeletedLineIds,
        collaborationBaseLineIds,
        lineIdMap,
      )
      if (unresolvedChangedLineIds.length) {
        throw new WeightTicketDataContractError(`ไม่สามารถระบุรายการที่เปลี่ยนแปลงหลังบันทึก: ${unresolvedChangedLineIds.join(', ')}`)
      }
      const resolvedChangedLineIds = [...new Set(
        [...effectiveCollaborationChangedLineIds]
          .filter((lineId) => !requestedDeletedLineIds.has(lineId) && Boolean(lineIdMap[lineId]))
          .map((lineId) => lineIdMap[lineId] as string),
      )]
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
        customerName: effectiveValues.type === 'WTO' ? partySnapshot.partyName : '',
        docNo,
        existing: existing as WeightTicketRow,
        lineRows: effectiveLineRows,
        supplierName: effectiveValues.type === 'WTI' ? partySnapshot.partyName : '',
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
      await rebuildWeightTicketProductSummaries(tx, existing.id, buildWeightTicketProductSummaryRows(existing.id, createdLines).summaryRows)
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
      return {
        beforeSnapshot,
        eventDeletedLineIds: resolvedDeletedLineIds,
        eventLineIds: resolvedChangedLineIds,
        ignoredRemoteDeletedLineIds: [...remoteDeletedChangedLineIds],
        imageChanged,
        lineIdMap,
        previousDocumentNo,
        previousHeader: currentHeader,
        ticket,
      }
    })

    const updated = updateResult.ticket
    const updatedUsage = await getWeightTicketUsageCounts(prisma, updated.id)
    const mapped = mapWeightTicketRow(updated as WeightTicketRow, updatedUsage)
    const beforeSnapshot = updateResult.beforeSnapshot
    const eventDeletedLineIds = updateResult.eventDeletedLineIds
    const eventLineIds = updateResult.eventLineIds
    if (updateResult.ignoredRemoteDeletedLineIds.length) {
      console.info('[weight-ticket-realtime] patch.remote_delete_noop', {
        documentNo: mapped.documentNo,
        ignoredLineIds: updateResult.ignoredRemoteDeletedLineIds,
      })
    }
    const imageChanged = updateResult.imageChanged
    const eventHeaderFields = (['branchId', 'partyId', 'remark', 'vehicleImageNames', 'vehicleNo', 'godownName'] as const).filter((field) => {
      if (!changedHeaderFields.has(field)) return false
      const beforeValue = updateResult.previousHeader[field]
      const afterValue = field === 'branchId'
        ? mapped.branchId
        : field === 'partyId'
          ? mapped.partyId
          : field === 'remark'
            ? mapped.remark
            : field === 'vehicleImageNames'
              ? mapped.vehicleImageNames
              : field === 'vehicleNo'
                ? mapped.vehicleNo ?? ''
                : mapped.godownName ?? ''
      return JSON.stringify(beforeValue) !== JSON.stringify(afterValue)
    })
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
    const realtimeEvent = {
      changeType: 'updated' as const,
      updatedAt: mapped.updatedAt,
      lineIds: eventLineIds,
      deletedLineIds: eventDeletedLineIds,
      changedHeaderFields: eventHeaderFields,
      imageChanged,
    }
    console.info('[weight-ticket-realtime] patch.broadcast', {
      documentNo: mapped.documentNo,
      changedLineIds: [...collaborationChangedLineIds],
      eventLineIds,
      deletedLineIds: eventDeletedLineIds,
      changedHeaderFields: eventHeaderFields,
    })
    const previousBranchId = updateResult.previousHeader.branchId
    const previousDocumentNo = updateResult.previousDocumentNo
    after(() => Promise.all([
      publishWeightTicketChange({ ...realtimeEvent, branchId: mapped.branchId, documentNo: mapped.documentNo }),
      ...(previousBranchId !== mapped.branchId || previousDocumentNo !== mapped.documentNo
        ? [publishWeightTicketChange({ ...realtimeEvent, branchId: previousBranchId, documentNo: previousDocumentNo })]
        : []),
    ]).then(() => undefined))
    const actorDisplayNames = await resolveWeightTicketActorDisplayNames([mapped.createdBy, mapped.enteredBy, mapped.updatedBy])
    return NextResponse.json({
      ...mapped,
      createdBy: weightTicketActorDisplayName(mapped.createdBy, actorDisplayNames),
      enteredBy: mapped.enteredBy == null ? null : weightTicketActorDisplayName(mapped.enteredBy, actorDisplayNames),
      lineIdMap: updateResult.lineIdMap,
      serverNow: new Date().toISOString(),
      updatedBy: mapped.updatedBy == null ? null : weightTicketActorDisplayName(mapped.updatedBy, actorDisplayNames),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WeightTicketDataContractError) return apiErrorResponse(caught, 'ข้อมูลประวัติใบรับ-ส่งของไม่ครบ กรุณาแจ้งผู้ดูแลระบบ', caught.status)
    if (caught instanceof WtoPendingOutError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    if (caught instanceof WeightTicketWriteValidationError) {
      logWeightTicketValidationFailure({
        documentId: conflictDocumentId,
        message: caught.message,
        fieldKeys: Object.keys(caught.fieldErrors),
      })
    }
    if (caught instanceof WeightTicketCollaborationConflictError) {
      await recordWeightTicketCollaborationConflict({
        auth: authForConflictLog,
        conflict: caught,
        documentId: id,
        documentNo: conflictDocumentNo,
        request: auditRequest,
      })
      return NextResponse.json({ code: caught.code, error: caught.message, headerFields: caught.headerFields, lineIds: caught.lineIds }, { status: caught.status })
    }
    return apiErrorResponse(caught, 'แก้ไขใบรับ-ส่งของไม่ได้', 400)
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  return updateWeightTicket(request, context)
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  let authForConflictLog: AppAuthContext | null = null
  let conflictDocumentId = ''
  let conflictDocumentNo: string | null = null
  try {
    const auth = await getCurrentAuthContext()
    authForConflictLog = auth
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    conflictDocumentId = id
    const rawValues = await request.json()
    const scopedBranchIds = branchScopeIds(auth)
    const existing = await findScopedTicket(id, scopedBranchIds)
    if (!existing) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของที่ต้องการยกเลิก' }, { status: 404 })
    conflictDocumentNo = existing.doc_no

    const deleteLines = weightTicketDeleteLinesSchema.safeParse(rawValues)
    if (deleteLines.success) {
      requirePermission(auth, 'daily.weight_tickets.update')
      const usage = await getWeightTicketUsageCounts(prisma, existing.id)
      if (!canEditWeightTicket({ docType: existing.doc_type, status: existing.status }, usage)) {
        return NextResponse.json({ code: 'BAD_REQUEST', error: mutableTicketErrorMessage('edit', usage) }, { status: 400 })
      }
      const missingBaseLineVersions = deleteLines.data.deletedLineIds.filter((lineId) => deleteLines.data.collaborationBaseLineVersions[lineId] == null)
      if (missingBaseLineVersions.length) {
        return NextResponse.json({
          code: 'BAD_REQUEST',
          error: 'ข้อมูล baseline ของเต๋าที่ต้องการลบไม่ครบ กรุณาโหลดข้อมูลล่าสุดก่อนลบ',
        }, { status: 400 })
      }
      const actor = currentActor(auth)
      const updateResult = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select pg_advisory_xact_lock(${existing.id})`
        const locked = await tx.weight_tickets.findUniqueOrThrow({ include: ticketInclude, where: { id: existing.id } })
        const lockedBranchId = locked.branches?.code
        if (!lockedBranchId) throw new WeightTicketDataContractError('ข้อมูลสาขาเดิมของใบรับ-ส่งของไม่ครบ')
        if (scopedBranchIds !== null && !scopedBranchIds.includes(lockedBranchId)) {
          throw new WeightTicketWriteValidationError('ไม่มีสิทธิ์แก้ไขใบรับ-ส่งของสาขานี้', { branchId: ['ไม่มีสิทธิ์แก้ไขใบรับ-ส่งของสาขานี้'] })
        }
        const lockedUsage = await getWeightTicketUsageCounts(tx, locked.id)
        if (!canEditWeightTicket({ docType: locked.doc_type, status: locked.status }, lockedUsage)) {
          throw new WeightTicketWriteValidationError(mutableTicketErrorMessage('edit', lockedUsage), {})
        }
        conflictDocumentNo = locked.doc_no
        const persistedClientLineIdMap = new Map(
          locked.weight_ticket_lines
            .filter((line) => Boolean(line.client_line_id))
            .map((line) => [line.client_line_id as string, String(line.id)] as const),
        )
        const resolvedDelete = resolveWeightTicketDeleteClientIds(
          deleteLines.data.deletedLineIds,
          deleteLines.data.collaborationBaseLineVersions,
          persistedClientLineIdMap,
        )
        const deletedIds = new Set(resolvedDelete.deletedLineIds)
        const baseLineVersions = resolvedDelete.collaborationBaseLineVersions
        const isDeliveredWtoDelete = locked.doc_type === 'WTO' && locked.status === 'delivered'
        if (isDeliveredWtoDelete && deleteLines.data.collaborationBaseUpdatedAt !== locked.updated_at.toISOString()) {
          throw new WeightTicketCollaborationConflictError([...deletedIds], [], {
            baseLineVersions,
            baseUpdatedAt: deleteLines.data.collaborationBaseUpdatedAt,
            changedLineIds: [...deletedIds],
            currentLineVersions: Object.fromEntries(locked.weight_ticket_lines.map((line) => [String(line.id), line.version])),
            deletedLineIds: [...deletedIds],
            operation: 'delete_lines',
            scope: 'lines',
          })
        }
        const lockedLines = new Map(locked.weight_ticket_lines.map((line) => [String(line.id), line] as const))
        if (isDeliveredWtoDelete) {
          const lockedConflicts = [...deletedIds].filter((lineId) => {
            const line = lockedLines.get(lineId)
            const expected = baseLineVersions[lineId]
            return !line || (expected != null && line.version !== expected)
          })
          if (lockedConflicts.length) throw new WeightTicketCollaborationConflictError(lockedConflicts, [], {
            baseLineVersions,
            baseUpdatedAt: deleteLines.data.collaborationBaseUpdatedAt,
            changedLineIds: lockedConflicts,
            currentLineVersions: Object.fromEntries(locked.weight_ticket_lines.map((line) => [String(line.id), line.version])),
            deletedLineIds: [...deletedIds],
            operation: 'delete_lines',
            scope: 'lines',
          })
        }
        // Draft line deletes are idempotent last-writer-wins operations. A
        // line removed by another user is already in the requested final
        // state, while a line that still exists is deleted by this request
        // regardless of its newer version.
        const lockedDeletedIds = [...deletedIds].filter((lineId) => lockedLines.has(lineId))
        const remainingBeforeDelete = locked.weight_ticket_lines.filter((line) => !deletedIds.has(String(line.id)))
        const deletedLineNumbers = new Set(
          lockedDeletedIds
            .map((lineId) => lockedLines.get(lineId)?.line_no)
            .filter((lineNo): lineNo is number => lineNo != null),
        )
        const danglingReferences = remainingBeforeDelete.filter((line) => (
          (line.parent_line_no != null && deletedLineNumbers.has(line.parent_line_no))
          || (line.impurity_source_line_no != null && deletedLineNumbers.has(line.impurity_source_line_no))
        ))
        if (danglingReferences.length) {
          throw new WeightTicketWriteValidationError(
            'ไม่สามารถลบรายการที่มีรายการย่อยหรือสิ่งเจือปนอ้างถึงอยู่ กรุณาลบรายการที่เกี่ยวข้องทั้งหมดก่อน',
            { lines: danglingReferences.map((line) => `รายการที่ ${line.line_no}`) },
          )
        }
        const shouldRebuildWtoPendingOut = isDeliveredWtoDelete && lockedDeletedIds.length > 0
        const releasedPendingOutHolds = shouldRebuildWtoPendingOut
          ? await tx.stock_holds.findMany({
            select: { id: true, qty: true },
            where: { status: 'active', weight_ticket_id: locked.id },
          })
          : []
        if (shouldRebuildWtoPendingOut) {
          await releaseActiveWtoPendingOut(tx, {
            actor,
            reason: 'edit',
            weightTicketId: locked.id,
          })
        }
        let ticket = locked
        if (lockedDeletedIds.length) {
          await tx.weight_ticket_lines.deleteMany({ where: { id: { in: lockedDeletedIds.map((lineId) => BigInt(lineId)) }, weight_ticket_id: existing.id } })
          const remaining = await tx.weight_ticket_lines.findMany({ orderBy: { line_no: 'asc' }, where: { weight_ticket_id: existing.id } })
          const derivedFacts = buildWeightTicketDerivedFacts(locked.id, locked.vehicle_image_count ?? 0, remaining)
          const renumberedReferences = buildWeightTicketRenumberedLineReferences(remaining)
          const derivedLineById = new Map(derivedFacts.derivedLineRows.map((line) => [String(line.id), line] as const))
          const remainingById = new Map(remaining.map((line) => [line.id, line] as const))
          const updatedAt = new Date()
          if (remaining.length) {
            await tx.weight_ticket_lines.updateMany({ data: { line_no: { increment: 1000000 } }, where: { weight_ticket_id: existing.id } })
            for (const reference of renumberedReferences) {
              const line = remainingById.get(reference.id)
              const derivedLine = derivedLineById.get(String(reference.id))
              if (!line || !derivedLine) {
                throw new WeightTicketDataContractError(`ไม่พบข้อมูลเต๋า ${reference.id.toString()} หลังลบข้อมูล`)
              }
              const changed = line.line_no !== reference.line_no
                || line.parent_line_no !== reference.parent_line_no
                || line.impurity_source_line_no !== reference.impurity_source_line_no
                || Number(line.container_deduction_weight) !== Number(derivedLine.container_deduction_weight)
                || Number(line.deduct_weight) !== Number(derivedLine.deduct_weight)
                || Number(line.net_weight) !== Number(derivedLine.net_weight)
              await tx.weight_ticket_lines.update({
                data: {
                  container_deduction_weight: derivedLine.container_deduction_weight,
                  deduct_weight: derivedLine.deduct_weight,
                  impurity_source_line_no: reference.impurity_source_line_no,
                  line_no: reference.line_no,
                  net_weight: derivedLine.net_weight,
                  parent_line_no: reference.parent_line_no,
                  ...(changed ? { updated_at: updatedAt, updated_by: actor, version: { increment: 1 } } : {}),
                },
                where: { id: reference.id },
              })
            }
          }
          const persistedRemaining = await tx.weight_ticket_lines.findMany({ orderBy: { line_no: 'asc' }, where: { weight_ticket_id: existing.id } })
          if (isDeliveredWtoDelete) {
            await validateWeightTicketStockForWrite(tx, {
              branchId: locked.branch_id,
              excludeWeightTicketId: locked.id,
              lineRows: derivedFacts.derivedLineRows,
              type: 'WTO',
            })
          }
          await rebuildWeightTicketProductSummaries(tx, locked.id, derivedFacts.summaryRows)
          await tx.weight_tickets.update({
            data: {
              container_deduction_weight: derivedFacts.totals.containerDeductionWeight,
              deduct_weight: derivedFacts.totals.deductionWeight,
              gross_weight: derivedFacts.totals.grossWeight,
              image_count: derivedFacts.imageCount,
              net_weight: derivedFacts.totals.netWeight,
              updated_at: updatedAt,
              updated_by: actor,
            },
            where: { id: locked.id },
          })
          const statusLogEventKey = await appendWeightTicketStatusLog(tx, {
            action: WEIGHT_TICKET_STATUS_ACTION.EDITED,
            actor,
            createdAt: updatedAt,
            fromStatus: locked.status,
            meta: {
              deletedLineIds: lockedDeletedIds,
              previousDocumentNo: locked.doc_no,
              reason: 'weight_ticket_delete_lines',
              type: locked.doc_type,
            },
            note: `ลบรายการ ${lockedDeletedIds.length.toLocaleString('th-TH')} รายการ`,
            toStatus: locked.status,
            weightTicketId: locked.id,
          })
          if (shouldRebuildWtoPendingOut) {
            const createdPendingOutHoldIds = await applyWeightTicketEditSideEffects(tx, {
              actor,
              branchId: locked.branch_id,
              createdLines: persistedRemaining,
              documentNo: locked.doc_no,
              preservedCostSnapshots: [],
              shouldSnapshotCost: true,
              type: 'WTO',
              weightTicketId: locked.id,
            })
            const releaseOccurredAt = new Date(updatedAt.getTime() + 1)
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
              weightTicketId: locked.id,
            })
            if (createdPendingOutHoldIds.length) await appendWtoPendingOutEventsFromHolds(tx, {
              actor,
              eventTypeForHold: () => 'edit_rebuild',
              holdIds: createdPendingOutHoldIds,
              occurredAt: new Date(releaseOccurredAt.getTime() + 1),
              statusLogEventKey,
              weightTicketId: locked.id,
            })
          }
          ticket = await tx.weight_tickets.findUniqueOrThrow({
            include: ticketInclude,
            where: { id: locked.id },
          })
        }
        return {
          deletedLineIds: lockedDeletedIds,
          imageChanged: lockedDeletedIds.some((lineId) => (lockedLines.get(lineId)?.image_names?.length ?? 0) > 0),
          ticket,
        }
      })
      const updated = updateResult.ticket
      const updatedUsage = await getWeightTicketUsageCounts(prisma, updated.id)
      const mapped = mapWeightTicketRow(updated as WeightTicketRow, updatedUsage)
      const actorDisplayNames = await resolveWeightTicketActorDisplayNames([mapped.createdBy, mapped.updatedBy])
      if (updateResult.deletedLineIds.length) {
        after(() => publishWeightTicketChange({
          branchId: mapped.branchId,
          changeType: 'deleted_lines',
          documentNo: mapped.documentNo,
          updatedAt: mapped.updatedAt,
          deletedLineIds: updateResult.deletedLineIds,
          imageChanged: updateResult.imageChanged,
        }))
      }
      return NextResponse.json({ ...mapped, createdBy: weightTicketActorDisplayName(mapped.createdBy, actorDisplayNames), lineIdMap: {}, serverNow: new Date().toISOString(), updatedBy: mapped.updatedBy == null ? null : weightTicketActorDisplayName(mapped.updatedBy, actorDisplayNames) })
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
      return updateWeightTicket(delegatedRequest, context, request, { allowEmptyProductImages: true })
    }
    if (rawValues && typeof rawValues === 'object' && rawValues.operation === 'save_changes') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'รูปแบบข้อมูลบันทึกการเปลี่ยนแปลงไม่ถูกต้อง' }, { status: 400 })
    }
    if (rawValues && typeof rawValues === 'object' && rawValues.operation === 'delete_lines') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'รูปแบบข้อมูลลบรายการไม่ถูกต้อง' }, { status: 400 })
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
      after(() => publishWeightTicketChange({ branchId: mapped.branchId, changeType: 'confirmed', documentNo: mapped.documentNo, updatedAt: mapped.updatedAt }))
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
        serverNow: new Date().toISOString(),
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
    after(() => publishWeightTicketChange({ branchId: mapped.branchId, changeType: 'cancelled', documentNo: mapped.documentNo, updatedAt: mapped.updatedAt }))
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
      serverNow: new Date().toISOString(),
      timeline: timeline.map((event) => ({ ...event, actorName: weightTicketActorDisplayName(event.actorName, actorDisplayNames) })),
      updatedBy: responseMapped.updatedBy == null ? null : weightTicketActorDisplayName(responseMapped.updatedBy, actorDisplayNames),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WeightTicketDataContractError) return apiErrorResponse(caught, 'ข้อมูลประวัติใบรับ-ส่งของไม่ครบ กรุณาแจ้งผู้ดูแลระบบ', caught.status)
    if (caught instanceof WeightTicketCollaborationConflictError) {
      await recordWeightTicketCollaborationConflict({
        auth: authForConflictLog,
        conflict: caught,
        documentId: conflictDocumentId,
        documentNo: conflictDocumentNo,
        request,
      })
      return NextResponse.json({ code: caught.code, error: caught.message, headerFields: caught.headerFields, lineIds: caught.lineIds }, { status: caught.status })
    }
    if (caught instanceof WtoPendingOutError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'ยกเลิกใบรับ-ส่งของไม่ได้', 400)
  }
}
