import { Prisma } from '../../../../generated/prisma/client'
import {
  appendImpurityProductMeta,
  calculateWeightTicketLineTotals,
  isOtherProductImpurityId,
  roundWeight,
  type DeductionMode,
} from '@/lib/weight-tickets'
import { parseInternalBigIntId } from '@/lib/business-code'
import { toNumber } from '@/lib/server/daily'
import {
  buildWeightTicketProductSummaryRows,
  type WeightTicketRow,
} from '@/lib/server/weight-tickets'

type TxClient = Prisma.TransactionClient

export type WtiDraftLineInput = {
  containerDeductionWeight: number
  deductionMode: DeductionMode
  deductionValue: number
  grossWeight: number
  imageNames: string[]
  impurityId: string
  impurityProductId?: string
  impuritySourceLineId?: string | null
  note: string
  parentId?: string | null
  productId: string
}

export type WtiDraftOperationInput = {
  action: 'add' | 'update' | 'delete'
  actor: string
  documentId: bigint
  expectedLineVersion?: number | null
  lineId?: bigint | null
  operationId: string
}

export type WtiDraftOperationResult = {
  action: WtiDraftOperationInput['action']
  changedLineId: string | null
  documentVersion: number
  lineVersion: number | null
  operationId: string
}

export class WtiDraftOperationError extends Error {
  readonly code: 'CONFLICT' | 'DOCUMENT_LOCKED' | 'NOT_FOUND' | 'INVALID_OPERATION'
  readonly status: number
  readonly latest?: WtiDraftOperationResult

  constructor(
    code: WtiDraftOperationError['code'],
    message: string,
    status: number,
    latest?: WtiDraftOperationResult,
  ) {
    super(message)
    this.name = 'WtiDraftOperationError'
    this.code = code
    this.status = status
    this.latest = latest
  }
}

type DraftLineRow = {
  id: bigint
  line_no: number
  product_id: bigint
  product_name: string
  gross_weight: Prisma.Decimal
  container_deduction_weight: Prisma.Decimal
  deduct_weight: Prisma.Decimal
  net_weight: Prisma.Decimal
  deduction_mode: string
  deduction_value: Prisma.Decimal | null
  impurity_id: bigint | null
  image_count: number
  image_names: string[]
  note: string | null
  parent_line_no: number | null
  impurity_source_line_no: number | null
  weight_ticket_id: bigint
  draft_version: number
}

async function lockWtiDraft(tx: TxClient, documentId: bigint) {
  const rows = await tx.$queryRaw<Array<{ id: bigint; status: string; doc_type: string; draft_version: number }>>`
    select id, status, doc_type, draft_version
    from public.weight_tickets
    where id = ${documentId}
    for update
  `
  const ticket = rows[0]
  if (!ticket) throw new WtiDraftOperationError('NOT_FOUND', 'ไม่พบใบรับของ WTI', 404)
  if (ticket.doc_type !== 'WTI') throw new WtiDraftOperationError('INVALID_OPERATION', 'operation นี้ใช้ได้เฉพาะ WTI', 400)
  if (ticket.status !== 'draft') {
    throw new WtiDraftOperationError('DOCUMENT_LOCKED', 'ใบรับของนี้ถูกยืนยันหรือยกเลิกแล้ว ไม่สามารถแก้ไขได้', 409)
  }
  return ticket
}

async function findExistingOperation(tx: TxClient, input: WtiDraftOperationInput) {
  return tx.weight_ticket_draft_operations.findUnique({
    where: {
      weight_ticket_id_operation_id: {
        operation_id: input.operationId,
        weight_ticket_id: input.documentId,
      },
    },
  })
}

async function nextLineNo(tx: TxClient, documentId: bigint) {
  const row = await tx.weight_ticket_lines.aggregate({
    _max: { line_no: true },
    where: { weight_ticket_id: documentId },
  })
  return (row._max.line_no ?? 0) + 1
}

async function resolveLineInput(tx: TxClient, documentId: bigint, input: WtiDraftLineInput, lineNo: number) {
  const productCode = input.productId.trim().toUpperCase()
  const impurityProductCode = input.impurityProductId?.trim().toUpperCase() ?? ''
  const [product, impurityProduct] = await Promise.all([
    tx.products.findFirst({ where: { active: true, code: productCode }, select: { id: true, name: true } }),
    impurityProductCode
      ? tx.products.findFirst({ where: { active: true, code: impurityProductCode }, select: { id: true, name: true } })
      : Promise.resolve(null),
  ])
  if (!product) throw new WtiDraftOperationError('INVALID_OPERATION', 'สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน', 400)

  const impurityId = isOtherProductImpurityId(input.impurityId)
    ? null
    : parseInternalBigIntId(input.impurityId)
  const impurity = impurityId == null
    ? null
    : await tx.impurities.findFirst({ where: { active: true, id: impurityId }, select: { id: true, name: true } })
  if (input.impurityId && !isOtherProductImpurityId(input.impurityId) && !impurity) {
    throw new WtiDraftOperationError('INVALID_OPERATION', 'สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน', 400)
  }
  if (isOtherProductImpurityId(input.impurityId) && !impurityProduct) {
    throw new WtiDraftOperationError('INVALID_OPERATION', 'กรุณาเลือกสินค้าที่ปนมา', 400)
  }

  const existingLines = await tx.weight_ticket_lines.findMany({
    orderBy: { line_no: 'asc' },
    where: { weight_ticket_id: documentId },
  })
  const lineIdByNo = new Map(existingLines.map((line) => [line.line_no, String(line.id)]))
  const calculation = calculateWeightTicketLineTotals([
    ...existingLines
      .filter((line) => line.line_no !== lineNo)
      .map((line) => ({
        containerDeductionWeight: line.container_deduction_weight.toString(),
        deductionMode: line.deduction_mode as DeductionMode,
        deductionValue: line.deduction_value?.toString() ?? '0',
        grossWeight: line.gross_weight.toString(),
        id: String(line.id),
        impurityId: line.impurity_id == null ? undefined : String(line.impurity_id),
        parentId: line.parent_line_no == null ? undefined : lineIdByNo.get(line.parent_line_no),
        productId: String(line.product_id),
        impuritySourceLineId: line.impurity_source_line_no == null
          ? undefined
          : lineIdByNo.get(line.impurity_source_line_no),
      })),
    {
    containerDeductionWeight: String(Math.max(0, input.containerDeductionWeight)),
    deductionMode: input.deductionMode,
    deductionValue: String(Math.max(0, input.deductionValue)),
    grossWeight: String(Math.max(0, input.grossWeight)),
    id: String(lineNo),
    impurityId: input.impurityId,
    parentId: input.parentId ?? undefined,
    impuritySourceLineId: input.impuritySourceLineId ?? undefined,
    productId: String(product.id),
    },
  ])
  const lineTotals = calculation.lineTotalsById.get(String(lineNo))
  if (!lineTotals) throw new WtiDraftOperationError('INVALID_OPERATION', 'คำนวณน้ำหนักรายการไม่สำเร็จ', 400)

  const lineNoById = new Map(existingLines.map((line) => [String(line.id), line.line_no]))
  const parentLineNo = input.parentId ? lineNoById.get(input.parentId) ?? null : null
  const impuritySourceLineNo = input.impuritySourceLineId ? lineNoById.get(input.impuritySourceLineId) ?? null : null
  if (input.parentId && parentLineNo == null) throw new WtiDraftOperationError('INVALID_OPERATION', 'ไม่พบรายการหลักที่อ้างถึง', 400)
  if (input.impuritySourceLineId && impuritySourceLineNo == null) throw new WtiDraftOperationError('INVALID_OPERATION', 'ไม่พบรายการสิ่งเจือปนต้นทาง', 400)

  return {
    container_deduction_weight: roundWeight(lineTotals.containerDeductionWeight),
    deduct_weight: roundWeight(lineTotals.deductionWeight),
    deduction_mode: input.deductionMode,
    deduction_value: input.deductionMode === 'none' ? 0 : roundWeight(input.deductionValue),
    gross_weight: roundWeight(lineTotals.grossWeight),
    image_count: input.imageNames.length,
    image_names: input.imageNames,
    impurity_id: impurityId,
    impurity_name: isOtherProductImpurityId(input.impurityId) ? 'สินค้าอื่น' : impurity?.name ?? null,
    impurity_source_line_no: impuritySourceLineNo,
    line_no: lineNo,
    net_weight: roundWeight(lineTotals.netWeight),
    note: appendImpurityProductMeta(input.note, {
      id: isOtherProductImpurityId(input.impurityId) ? (input.impurityProductId ?? '') : '',
      name: isOtherProductImpurityId(input.impurityId) ? (impurityProduct?.name ?? '') : '',
    }) || null,
    parent_line_no: parentLineNo,
    product_id: product.id,
    product_name: product.name,
    weight_ticket_id: documentId,
  }
}

async function rebuildWtiDraftSummaries(tx: TxClient, documentId: bigint) {
  const lines = await tx.weight_ticket_lines.findMany({
    orderBy: { line_no: 'asc' },
    where: { weight_ticket_id: documentId },
  })
  await tx.weight_ticket_product_summary_lines.deleteMany({
    where: { weight_ticket_product_summaries: { weight_ticket_id: documentId } },
  })
  await tx.weight_ticket_product_summaries.deleteMany({ where: { weight_ticket_id: documentId } })

  const { summaryRows } = buildWeightTicketProductSummaryRows(documentId, lines)
  const createdSummaries = await Promise.all(summaryRows.map(({ lineIds: _lineIds, ...data }) => (
    tx.weight_ticket_product_summaries.create({ data })
  )))
  const summaryIdByProductId = new Map(createdSummaries.map((summary) => [String(summary.product_id), summary.id] as const))
  const bridgeRows = summaryRows.flatMap(({ lineIds, product_id }) => {
    const summaryId = summaryIdByProductId.get(String(product_id))
    return summaryId == null ? [] : lineIds.map((lineId) => ({
      created_at: new Date(),
      summary_id: summaryId,
      weight_ticket_line_id: lineId,
    }))
  })
  if (bridgeRows.length) await tx.weight_ticket_product_summary_lines.createMany({ data: bridgeRows })

  const totals = lines.reduce((result, line) => ({
    container: result.container + toNumber(line.container_deduction_weight),
    deduct: result.deduct + toNumber(line.deduct_weight),
    gross: result.gross + toNumber(line.gross_weight),
    net: result.net + toNumber(line.net_weight),
  }), { container: 0, deduct: 0, gross: 0, net: 0 })
  return {
    lines,
    totals,
    summaryRows,
  }
}

export async function applyWtiDraftLineOperation(
  tx: TxClient,
  input: WtiDraftOperationInput,
  lineInput?: WtiDraftLineInput,
): Promise<WtiDraftOperationResult> {
  const ticket = await lockWtiDraft(tx, input.documentId)
  const prior = await findExistingOperation(tx, input)
  if (prior) return prior.result as unknown as WtiDraftOperationResult

  let changedLineId: bigint | null = input.lineId ?? null
  let lineVersionBefore: number | null = null
  let lineVersionAfter: number | null = null

  if (input.action === 'add') {
    if (!lineInput) throw new WtiDraftOperationError('INVALID_OPERATION', 'ข้อมูลเต๋าไม่ครบ', 400)
    const lineNo = await nextLineNo(tx, input.documentId)
    const data = await resolveLineInput(tx, input.documentId, lineInput, lineNo)
    const created = await tx.weight_ticket_lines.create({ data: { ...data, draft_version: 0 } })
    changedLineId = created.id
    lineVersionAfter = 0
  } else {
    if (!input.lineId) throw new WtiDraftOperationError('INVALID_OPERATION', 'ไม่พบรายการเต๋า', 400)
    const existing = await tx.weight_ticket_lines.findFirst({ where: { id: input.lineId, weight_ticket_id: input.documentId } })
    if (!existing) throw new WtiDraftOperationError('NOT_FOUND', 'ไม่พบรายการเต๋าในเอกสารนี้', 404)
    lineVersionBefore = existing.draft_version
    if (input.expectedLineVersion != null && existing.draft_version !== input.expectedLineVersion) {
      throw new WtiDraftOperationError('CONFLICT', 'รายการเต๋าถูกแก้ไขโดยตราชั่งอื่นแล้ว กรุณาโหลดข้อมูลล่าสุด', 409)
    }
    if (input.action === 'delete') {
      await tx.weight_ticket_lines.deleteMany({
        where: {
          weight_ticket_id: input.documentId,
          OR: [
            { parent_line_no: existing.line_no },
            { impurity_source_line_no: existing.line_no },
          ],
        },
      })
      await tx.weight_ticket_lines.delete({ where: { id: existing.id } })
      lineVersionAfter = null
    } else {
      if (!lineInput) throw new WtiDraftOperationError('INVALID_OPERATION', 'ข้อมูลเต๋าไม่ครบ', 400)
      const data = await resolveLineInput(tx, input.documentId, lineInput, existing.line_no)
      const updated = await tx.weight_ticket_lines.update({
        data: { ...data, draft_version: { increment: 1 } },
        where: { id: existing.id },
      })
      lineVersionAfter = updated.draft_version
    }
  }

  const nextDocumentVersion = ticket.draft_version + 1
  const rebuilt = await rebuildWtiDraftSummaries(tx, input.documentId)
  await tx.weight_tickets.update({
    data: {
      container_deduction_weight: rebuilt.totals.container,
      deduct_weight: rebuilt.totals.deduct,
      draft_version: nextDocumentVersion,
      gross_weight: rebuilt.totals.gross,
      image_count: rebuilt.lines.reduce((sum, line) => sum + line.image_count, 0),
      net_weight: rebuilt.totals.net,
      updated_by: input.actor,
    },
    where: { id: input.documentId },
  })

  const result: WtiDraftOperationResult = {
    action: input.action,
    changedLineId: changedLineId == null ? null : String(changedLineId),
    documentVersion: nextDocumentVersion,
    lineVersion: lineVersionAfter,
    operationId: input.operationId,
  }
  await tx.weight_ticket_draft_operations.create({
    data: {
      action: input.action,
      actor: input.actor,
      document_version_after: nextDocumentVersion,
      document_version_before: ticket.draft_version,
      line_version_after: lineVersionAfter,
      line_version_before: lineVersionBefore,
      operation_id: input.operationId,
      result,
      weight_ticket_id: input.documentId,
      weight_ticket_line_id: changedLineId,
    },
  })
  return result
}

export async function getWtiDraftRow(tx: TxClient, documentId: bigint) {
  const row = await tx.weight_tickets.findUnique({
    include: {
      branches: true,
      customers: true,
      suppliers: true,
      weight_ticket_lines: { orderBy: { line_no: 'asc' }, include: { products: { select: { code: true, id: true, metal_group: true } }, warehouses: { select: { code: true, id: true, name: true, type: true } } } },
      weight_ticket_product_summaries: { orderBy: { product_name: 'asc' }, include: { products: { select: { code: true, id: true, metal_group: true } } } },
      stock_holds: { select: { cost_snapshot_at: true, cost_snapshot_note: true, cost_snapshot_source: true, consumed_at: true, consumed_by_ref_no: true, hold_key: true, held_at: true, product_id: true, qty: true, released_at: true, source_doc_no: true, source_line_no: true, status: true, unit_cost_snapshot: true, value_snapshot: true, warehouse_id: true, warehouses: { select: { code: true, id: true, name: true, type: true } } }, orderBy: { source_line_no: 'asc' } },
    },
    where: { id: documentId },
  })
  return row as unknown as WeightTicketRow | null
}
