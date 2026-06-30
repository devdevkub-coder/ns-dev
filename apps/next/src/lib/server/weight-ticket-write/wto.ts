import { isOtherProductImpurityId, isOtherProductImpurityLabel, type WeightTicketFormValues } from '@/lib/weight-tickets'
import { toNumber } from '@/lib/server/daily'
import { assertCustomerEligibleForBranch, PartyBranchEligibilityError } from '@/lib/server/party-branch-eligibility'
import { WtoPendingOutError, type WtoPreservedCostSnapshot } from '@/lib/server/stock-holds'
import { WeightTicketWriteValidationError } from '@/lib/server/weight-ticket-write/shared'
import { buildWeightTicketLineRows, type WeightTicketRow } from '@/lib/server/weight-tickets'
import type { Prisma } from '../../../../generated/prisma/client'

type CustomerReference = {
  id: bigint
  name: string
} | null
type TxClient = Prisma.TransactionClient
type DecimalLike = Parameters<typeof toNumber>[0]
type WeightTicketLineRows = ReturnType<typeof buildWeightTicketLineRows>
type WeightTicketLineRow = WeightTicketLineRows[number]
type ExistingWeightTicketLine = WeightTicketRow['weight_ticket_lines'][number]
type WtoAuditLineEventType = 'edit_add_scale' | 'edit_update_scale'

const EPSILON_QTY = 0.0001

function lineQty(value: DecimalLike) {
  return toNumber(value)
}

function sameNullableBigInt(left: bigint | null | undefined, right: bigint | null | undefined) {
  return (left ?? null) === (right ?? null)
}

function sameNullableString(left: string | null | undefined, right: string | null | undefined) {
  return String(left ?? '') === String(right ?? '')
}

function sameNullableNumber(left: DecimalLike, right: DecimalLike) {
  return Math.abs(toNumber(left) - toNumber(right)) <= EPSILON_QTY
}

function getPreservableWtoCostQty(input: {
  oldLine: ExistingWeightTicketLine
  newLine: WeightTicketLineRow
}) {
  if (input.oldLine.product_id !== input.newLine.product_id) return 0
  if (!sameNullableBigInt(input.oldLine.warehouse_id, input.newLine.warehouse_id)) return 0

  const oldNet = lineQty(input.oldLine.net_weight)
  const newNet = lineQty(input.newLine.net_weight)
  if (oldNet <= EPSILON_QTY || newNet <= EPSILON_QTY) return 0

  const sameNet = Math.abs(oldNet - newNet) <= EPSILON_QTY
  if (!sameNet) return Math.min(oldNet, newNet)

  const sameScaleInputs =
    sameNullableNumber(input.oldLine.gross_weight, input.newLine.gross_weight)
    && sameNullableNumber(input.oldLine.container_deduction_weight, input.newLine.container_deduction_weight)
    && sameNullableNumber(input.oldLine.deduct_weight, input.newLine.deduct_weight)
    && sameNullableNumber(input.oldLine.deduction_value, input.newLine.deduction_value)
    && sameNullableString(input.oldLine.deduction_mode, input.newLine.deduction_mode)

  return sameScaleInputs ? oldNet : 0
}

function isSameWtoScaleLineForAudit(input: {
  oldLine: ExistingWeightTicketLine
  newLine: WeightTicketLineRow
}) {
  return input.oldLine.product_id === input.newLine.product_id
    && sameNullableBigInt(input.oldLine.warehouse_id, input.newLine.warehouse_id)
    && sameNullableNumber(input.oldLine.gross_weight, input.newLine.gross_weight)
    && sameNullableNumber(input.oldLine.container_deduction_weight, input.newLine.container_deduction_weight)
    && sameNullableNumber(input.oldLine.deduct_weight, input.newLine.deduct_weight)
    && sameNullableNumber(input.oldLine.deduction_value, input.newLine.deduction_value)
    && sameNullableNumber(input.oldLine.net_weight, input.newLine.net_weight)
    && sameNullableString(input.oldLine.deduction_mode, input.newLine.deduction_mode)
}

type EditTimelineLine = {
  gross_weight: DecimalLike
  impurity_source_line_no?: number | null
  net_weight: DecimalLike
}

function isRealScaleLine(line: EditTimelineLine) {
  return toNumber(line.gross_weight) > EPSILON_QTY
    && toNumber(line.net_weight) > EPSILON_QTY
    && line.impurity_source_line_no == null
}

function formatSignedWeight(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toLocaleString('th-TH', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} กก.`
}

export function buildWtoEditTimelineNote(input: {
  newLines: WeightTicketLineRows
  oldLines: WeightTicketRow['weight_ticket_lines']
}) {
  const oldScaleLines = input.oldLines.filter(isRealScaleLine)
  const newScaleLines = input.newLines.filter(isRealScaleLine)
  const oldScaleLineByLineNo = new Map(oldScaleLines.map((line) => [line.line_no, line] as const))
  const scaleDelta = newScaleLines.length - oldScaleLines.length
  const changedExistingScaleCount = newScaleLines.reduce((count, newLine) => {
    const oldLine = oldScaleLineByLineNo.get(newLine.line_no)
    if (!oldLine) return count
    return isSameWtoScaleLineForAudit({ newLine, oldLine }) ? count : count + 1
  }, 0)
  const oldNetWeight = oldScaleLines.reduce((sum, line) => sum + toNumber(line.net_weight), 0)
  const newNetWeight = newScaleLines.reduce((sum, line) => sum + toNumber(line.net_weight), 0)
  const netWeightDelta = newNetWeight - oldNetWeight
  const parts: string[] = []

  if (scaleDelta > 0) parts.push(`เพิ่มเต๋า ${scaleDelta.toLocaleString('th-TH')} รายการ`)
  if (scaleDelta < 0) parts.push(`ลบเต๋า ${Math.abs(scaleDelta).toLocaleString('th-TH')} รายการ`)
  if (changedExistingScaleCount > 0) parts.push(`แก้ไขเต๋าเดิม ${changedExistingScaleCount.toLocaleString('th-TH')} รายการ`)
  if (Math.abs(netWeightDelta) > EPSILON_QTY) parts.push(`น้ำหนักสุทธิ ${formatSignedWeight(netWeightDelta)}`)

  return parts.length ? parts.join(', ') : 'มีการแก้ไขรายการสินค้า/เต๋า'
}

export async function prepareWtoEditPendingOutPlan(tx: TxClient, input: {
  existing: WeightTicketRow
  lineRows: WeightTicketLineRows
  type: WeightTicketFormValues['type']
}) {
  const auditLineEventTypeByLineNo = new Map<number, WtoAuditLineEventType>()
  const auditQtyBeforeByLineNo = new Map(input.existing.weight_ticket_lines
    .filter(isRealScaleLine)
    .map((line) => [line.line_no, toNumber(line.net_weight)] as const))
  const preservedCostSnapshots: WtoPreservedCostSnapshot[] = []

  if (input.type !== 'WTO' || input.existing.status !== 'delivered') {
    return {
      auditLineEventTypeByLineNo,
      auditQtyBeforeByLineNo,
      preservedCostSnapshots,
    }
  }

  const oldRealLineByLineNo = new Map(input.existing.weight_ticket_lines.filter(isRealScaleLine).map((line) => [line.line_no, line] as const))
  input.lineRows.filter(isRealScaleLine).forEach((newLine) => {
    const oldLine = oldRealLineByLineNo.get(newLine.line_no)
    if (!oldLine) {
      auditLineEventTypeByLineNo.set(newLine.line_no, 'edit_add_scale')
      return
    }
    if (!isSameWtoScaleLineForAudit({ newLine, oldLine })) {
      auditLineEventTypeByLineNo.set(newLine.line_no, 'edit_update_scale')
    }
  })

  const oldLineByLineNo = new Map(input.existing.weight_ticket_lines.map((line) => [line.line_no, line] as const))
  const remainingPreservableQtyByLineNo = new Map<number, number>()
  input.lineRows.forEach((newLine) => {
    const oldLine = oldLineByLineNo.get(newLine.line_no)
    if (!oldLine) return
    const preservableQty = getPreservableWtoCostQty({ newLine, oldLine })
    if (preservableQty > EPSILON_QTY) {
      remainingPreservableQtyByLineNo.set(newLine.line_no, preservableQty)
    }
  })

  const activeHolds = await tx.stock_holds.findMany({
    orderBy: [{ source_line_no: 'asc' }, { id: 'asc' }],
    select: {
      cost_snapshot_at: true,
      cost_snapshot_note: true,
      cost_snapshot_source: true,
      hold_key: true,
      lot_no: true,
      not_available_for_sale: true,
      output_category: true,
      product_id: true,
      qty: true,
      source_line_no: true,
      unit_cost_snapshot: true,
      value_snapshot: true,
      warehouse_id: true,
      weight_ticket_line_id: true,
    },
    where: {
      status: 'active',
      weight_ticket_id: input.existing.id,
    },
  })
  for (const hold of activeHolds) {
    if (hold.unit_cost_snapshot == null) {
      throw new WtoPendingOutError(`pending_out ${hold.hold_key} ยังไม่มีราคาต้นทุนเฉลี่ยที่บันทึกไว้ ไม่สามารถแก้ไขใบส่งของหลังยืนยันได้`)
    }
    const sourceLineNo = hold.source_line_no ?? null
    if (sourceLineNo == null) continue
    const remainingPreservableQty = remainingPreservableQtyByLineNo.get(sourceLineNo) ?? 0
    if (remainingPreservableQty <= EPSILON_QTY) continue
    const preservedQty = Math.min(toNumber(hold.qty), remainingPreservableQty)
    remainingPreservableQtyByLineNo.set(sourceLineNo, Number((remainingPreservableQty - preservedQty).toFixed(6)))
    preservedCostSnapshots.push({
      costSnapshotAt: hold.cost_snapshot_at,
      costSnapshotNote: hold.cost_snapshot_note,
      costSnapshotSource: hold.cost_snapshot_source,
      lotNo: hold.lot_no,
      notAvailableForSale: hold.not_available_for_sale,
      outputCategory: hold.output_category,
      productId: hold.product_id,
      qty: preservedQty,
      sourceLineNo,
      unitCostSnapshot: hold.unit_cost_snapshot,
      valueSnapshot: hold.value_snapshot,
      warehouseId: hold.warehouse_id,
      weightTicketLineId: hold.weight_ticket_line_id,
    })
  }

  return {
    auditLineEventTypeByLineNo,
    auditQtyBeforeByLineNo,
    preservedCostSnapshots,
  }
}

export async function assertWtoCustomer(input: {
  branchId: bigint
  customer: CustomerReference
}) {
  if (!input.customer) {
    throw new WeightTicketWriteValidationError('ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน', { partyId: ['เลือกลูกค้า'] })
  }
  try {
    await assertCustomerEligibleForBranch({ branchId: input.branchId, customerId: input.customer.id })
  } catch (caught) {
    if (caught instanceof PartyBranchEligibilityError) {
      throw new WeightTicketWriteValidationError(caught.message, { partyId: [caught.message] })
    }
    throw caught
  }
}

export function assertWtoImpurityRules(input: {
  values: WeightTicketFormValues
}) {
  const wtoOtherProductImpurityIndex = input.values.lines.findIndex((line) => isOtherProductImpurityId(line.impurityId))
  if (wtoOtherProductImpurityIndex >= 0) {
    throw new WeightTicketWriteValidationError(
      `รายการที่ ${wtoOtherProductImpurityIndex + 1}: ใบส่งของไม่รองรับสิ่งเจือปนแบบสินค้าอื่น`,
      { [`lines.${wtoOtherProductImpurityIndex}.impurityId`]: ['ใบส่งของไม่รองรับสิ่งเจือปนแบบสินค้าอื่น'] },
    )
  }
}

export function assertNoLegacyOtherProductImpurity(input: {
  impurityById: Map<bigint, { name: string }>
  parsedImpurityIds: Array<bigint | null>
  values: WeightTicketFormValues
}) {
  const legacyOtherProductImpurityIndex = input.values.lines.findIndex((line, index) => {
    const impurityId = input.parsedImpurityIds[index]
    if (!line.impurityId || isOtherProductImpurityId(line.impurityId) || impurityId == null) return false
    return isOtherProductImpurityLabel(input.impurityById.get(impurityId)?.name)
  })
  if (legacyOtherProductImpurityIndex >= 0) {
    throw new WeightTicketWriteValidationError(
      `รายการที่ ${legacyOtherProductImpurityIndex + 1}: สินค้าอื่นเป็นตัวเลือกของระบบสำหรับ WTI เท่านั้น ไม่ใช่ master สิ่งเจือปน`,
      { [`lines.${legacyOtherProductImpurityIndex}.impurityId`]: ['เลือกตัวเลือกสินค้าอื่นของระบบแทน master data'] },
    )
  }
}
