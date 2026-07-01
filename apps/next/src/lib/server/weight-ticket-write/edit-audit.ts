import { calculateTicketTotals, type WeightTicketFormValues } from '@/lib/weight-tickets'
import { toNumber } from '@/lib/server/daily'
import { buildWeightTicketLineRows, type WeightTicketRow } from '@/lib/server/weight-tickets'

type DecimalLike = Parameters<typeof toNumber>[0]

type TimelineFieldChange = {
  after: string
  before: string
  field: string
  scope: string
}

function displayText(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value).trim()
  return text || '-'
}

function displayWeightValue(value: DecimalLike | null | undefined) {
  return `${toNumber(value ?? 0).toLocaleString('th-TH', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} กก.`
}

function displayDeductionMode(value: string | null | undefined) {
  if (value === 'kg') return 'กิโลกรัม'
  if (value === 'percent') return 'เปอร์เซ็นต์'
  if (value === 'none') return 'ไม่หัก'
  return displayText(value)
}

function addTimelineChange(changes: TimelineFieldChange[], input: TimelineFieldChange) {
  if (input.before === input.after) return
  changes.push(input)
}

function isRealScaleLine(line: { gross_weight: DecimalLike; impurity_source_line_no?: number | null; line_no: number; net_weight: DecimalLike }) {
  return toNumber(line.gross_weight) > 0.0001
    && toNumber(line.net_weight) > 0.0001
    && line.impurity_source_line_no == null
}

function lineScope(line: { gross_weight: DecimalLike; impurity_source_line_no?: number | null; line_no: number; net_weight: DecimalLike }) {
  return isRealScaleLine(line) ? `เต๋าที่ ${line.line_no}` : `รายการที่ ${line.line_no}`
}

export function buildWeightTicketEditChanges(input: {
  branchName: string
  customerName: string
  docNo: string
  existing: WeightTicketRow
  lineRows: ReturnType<typeof buildWeightTicketLineRows>
  supplierName: string
  totals: ReturnType<typeof calculateTicketTotals>
  values: WeightTicketFormValues
  warehouseNameById: Map<bigint, string>
}) {
  const changes: TimelineFieldChange[] = []
  const partyLabel = input.values.type === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'
  const newPartyName = input.values.type === 'WTI' ? input.supplierName : input.customerName
  const oldLineByLineNo = new Map(input.existing.weight_ticket_lines.map((line) => [line.line_no, line] as const))
  const newLineByLineNo = new Map(input.lineRows.map((line) => [line.line_no, line] as const))

  addTimelineChange(changes, {
    after: displayText(input.docNo),
    before: displayText(input.existing.doc_no),
    field: 'เลขที่เอกสาร',
    scope: 'เอกสาร',
  })
  addTimelineChange(changes, {
    after: displayText(input.branchName),
    before: displayText(input.existing.branches?.name),
    field: 'สาขา',
    scope: 'เอกสาร',
  })
  addTimelineChange(changes, {
    after: displayText(newPartyName),
    before: displayText(input.existing.party_name),
    field: partyLabel,
    scope: 'เอกสาร',
  })
  addTimelineChange(changes, {
    after: displayText(input.values.vehicleNo),
    before: displayText(input.existing.vehicle_no),
    field: 'ทะเบียนรถ',
    scope: 'เอกสาร',
  })
  addTimelineChange(changes, {
    after: displayText(input.values.remark),
    before: displayText(input.existing.remark),
    field: 'หมายเหตุ',
    scope: 'เอกสาร',
  })
  addTimelineChange(changes, {
    after: `${input.values.vehicleImageNames.length.toLocaleString('th-TH')} รูป`,
    before: `${(input.existing.vehicle_image_names?.length ?? 0).toLocaleString('th-TH')} รูป`,
    field: 'รูปเอกสาร',
    scope: 'เอกสาร',
  })
  addTimelineChange(changes, {
    after: displayWeightValue(input.totals.grossWeight),
    before: displayWeightValue(input.existing.gross_weight),
    field: 'น้ำหนักรวม',
    scope: 'เอกสาร',
  })
  addTimelineChange(changes, {
    after: displayWeightValue(input.totals.containerDeductionWeight),
    before: displayWeightValue(input.existing.container_deduction_weight),
    field: 'หักภาชนะ',
    scope: 'เอกสาร',
  })
  addTimelineChange(changes, {
    after: displayWeightValue(input.totals.deductionWeight),
    before: displayWeightValue(input.existing.deduct_weight),
    field: 'หักสิ่งเจือปน',
    scope: 'เอกสาร',
  })
  addTimelineChange(changes, {
    after: displayWeightValue(input.totals.netWeight),
    before: displayWeightValue(input.existing.net_weight),
    field: 'น้ำหนักสุทธิ',
    scope: 'เอกสาร',
  })

  input.lineRows.forEach((newLine) => {
    const oldLine = oldLineByLineNo.get(newLine.line_no)
    const scope = lineScope(newLine)
    if (!oldLine) {
      changes.push({
        after: `${newLine.product_name} ${displayWeightValue(newLine.net_weight)}`,
        before: '-',
        field: 'เพิ่มรายการ',
        scope,
      })
      return
    }

    addTimelineChange(changes, {
      after: displayText(newLine.product_name),
      before: displayText(oldLine.product_name),
      field: 'สินค้า',
      scope,
    })
    addTimelineChange(changes, {
      after: displayText(newLine.warehouse_id == null ? '' : input.warehouseNameById.get(newLine.warehouse_id)),
      before: displayText(oldLine.warehouses?.name ?? oldLine.warehouses?.code),
      field: 'คลัง',
      scope,
    })
    addTimelineChange(changes, {
      after: displayWeightValue(newLine.gross_weight),
      before: displayWeightValue(oldLine.gross_weight),
      field: 'น้ำหนักรวม',
      scope,
    })
    addTimelineChange(changes, {
      after: displayWeightValue(newLine.container_deduction_weight),
      before: displayWeightValue(oldLine.container_deduction_weight),
      field: 'หักภาชนะ',
      scope,
    })
    addTimelineChange(changes, {
      after: displayDeductionMode(newLine.deduction_mode),
      before: displayDeductionMode(oldLine.deduction_mode),
      field: 'ประเภทการหัก',
      scope,
    })
    addTimelineChange(changes, {
      after: displayText(newLine.deduction_value == null ? null : toNumber(newLine.deduction_value).toLocaleString('th-TH', { maximumFractionDigits: 2 })),
      before: displayText(oldLine.deduction_value == null ? null : toNumber(oldLine.deduction_value).toLocaleString('th-TH', { maximumFractionDigits: 2 })),
      field: 'ค่าหัก',
      scope,
    })
    addTimelineChange(changes, {
      after: displayWeightValue(newLine.deduct_weight),
      before: displayWeightValue(oldLine.deduct_weight),
      field: 'หักสิ่งเจือปน',
      scope,
    })
    addTimelineChange(changes, {
      after: displayWeightValue(newLine.net_weight),
      before: displayWeightValue(oldLine.net_weight),
      field: 'น้ำหนักสุทธิ',
      scope,
    })
    addTimelineChange(changes, {
      after: displayText(newLine.impurity_name),
      before: displayText(oldLine.impurity_name),
      field: 'สิ่งเจือปน',
      scope,
    })
    addTimelineChange(changes, {
      after: `${newLine.image_names.length.toLocaleString('th-TH')} รูป`,
      before: `${oldLine.image_names.length.toLocaleString('th-TH')} รูป`,
      field: 'รูปสินค้า',
      scope,
    })
    addTimelineChange(changes, {
      after: displayText(newLine.note),
      before: displayText(oldLine.note),
      field: 'หมายเหตุรายการ',
      scope,
    })
  })

  input.existing.weight_ticket_lines.forEach((oldLine) => {
    if (newLineByLineNo.has(oldLine.line_no)) return
    changes.push({
      after: '-',
      before: `${oldLine.product_name} ${displayWeightValue(oldLine.net_weight)}`,
      field: 'ลบรายการ',
      scope: lineScope(oldLine),
    })
  })

  return changes
}
