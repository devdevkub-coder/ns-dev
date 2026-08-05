import { isOtherProductImpurityId, isOtherProductImpurityLabel, type WeightTicketFormValues } from '@/lib/weight-tickets'
import { toNumber } from '@/lib/server/daily'
import { assertCustomerEligibleForBranch, PartyBranchEligibilityError } from '@/lib/server/party-branch-eligibility'
import { WeightTicketWriteValidationError } from '@/lib/server/weight-ticket-write/shared'
import { buildWeightTicketLineRows, type WeightTicketRow } from '@/lib/server/weight-tickets'

type CustomerReference = {
  id: bigint
  name: string
} | null
type DecimalLike = Parameters<typeof toNumber>[0]
type WeightTicketLineRows = ReturnType<typeof buildWeightTicketLineRows>
type WeightTicketLineRow = WeightTicketLineRows[number]
type ExistingWeightTicketLine = WeightTicketRow['weight_ticket_lines'][number]

const EPSILON_QTY = 0.0001

type StockAffectingWeightTicketLine = {
  line_no: number
  net_weight: DecimalLike
  product_id: bigint
  warehouse_id: bigint | null
}

export function shouldRebuildWtoPendingOutOnEdit(input: {
  branchChanged: boolean
  existingLines: StockAffectingWeightTicketLine[]
  newLines: StockAffectingWeightTicketLine[]
}) {
  if (input.branchChanged) return true

  const oldByLineNo = new Map(input.existingLines.map((line) => [line.line_no, line] as const))
  const newByLineNo = new Map(input.newLines.map((line) => [line.line_no, line] as const))
  const lineNumbers = new Set([...oldByLineNo.keys(), ...newByLineNo.keys()])
  for (const lineNo of lineNumbers) {
    const oldLine = oldByLineNo.get(lineNo)
    const newLine = newByLineNo.get(lineNo)
    if (!oldLine || !newLine) {
      if ((oldLine ? toNumber(oldLine.net_weight) : 0) > EPSILON_QTY || (newLine ? toNumber(newLine.net_weight) : 0) > EPSILON_QTY) return true
      continue
    }
    if (oldLine.product_id !== newLine.product_id || (oldLine.warehouse_id ?? null) !== (newLine.warehouse_id ?? null)) return true
    if (Math.abs(toNumber(oldLine.net_weight) - toNumber(newLine.net_weight)) > EPSILON_QTY) return true
  }
  return false
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
