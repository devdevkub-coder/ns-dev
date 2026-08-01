export const productionEventKinds = {
  input: 'input',
  inputReturn: 'input-return',
  output: 'output',
  outputVoid: 'output-void',
  loss: 'loss',
} as const

export type ProductionEventKind = typeof productionEventKinds[keyof typeof productionEventKinds]

export type ProductionEventRef = {
  documentNo: string
  eventId: string
  kind: ProductionEventKind
  displayNo: string
}

const productionOrderDocumentPattern = /^PO[A-Z0-9]+\d{4}-\d{4}$/

export function assertProductionOrderDocumentNo(documentNo: string) {
  const normalized = documentNo.trim().toUpperCase()
  if (!productionOrderDocumentPattern.test(normalized)) {
    throw new Error('เลขที่ใบสั่งผลิตไม่ถูกต้อง')
  }
  return normalized
}

export function formatProductionOutputRound(documentNo: string, roundNo: number) {
  const orderDocumentNo = assertProductionOrderDocumentNo(documentNo)
  if (!Number.isInteger(roundNo) || roundNo < 1 || roundNo > 9999) {
    throw new Error('ลำดับรอบรับผลผลิตไม่ถูกต้อง')
  }
  return `${orderDocumentNo}/${String(roundNo).padStart(2, '0')}`
}

export function formatProductionInputEvent(documentNo: string, eventId: string) {
  const orderDocumentNo = assertProductionOrderDocumentNo(documentNo)
  const normalizedEventId = eventId.trim()
  if (!normalizedEventId) throw new Error('ไม่พบรหัส event การเบิกวัตถุดิบ')
  return `${orderDocumentNo}/IN/${normalizedEventId}`
}

export function createProductionEventRef(documentNo: string, kind: ProductionEventKind, eventId: string, roundNo?: number): ProductionEventRef {
  const orderDocumentNo = assertProductionOrderDocumentNo(documentNo)
  const normalizedEventId = eventId.trim()
  if (!normalizedEventId) throw new Error('ไม่พบรหัส event การผลิต')
  const displayNo = kind === productionEventKinds.output || kind === productionEventKinds.loss
    ? formatProductionOutputRound(orderDocumentNo, roundNo ?? 0)
    : orderDocumentNo
  if (kind === productionEventKinds.output || kind === productionEventKinds.loss) {
    if (roundNo == null) throw new Error('ไม่พบลำดับรอบรับผลผลิต')
  }
  return { documentNo: orderDocumentNo, displayNo, eventId: normalizedEventId, kind }
}
