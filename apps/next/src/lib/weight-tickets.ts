export type WeightTicketType = 'WTI' | 'WTO'
export type DeductionMode = 'none' | 'kg' | 'percent'
export type WeightTicketStatus = 'received' | 'delivered' | 'partially_billed' | 'billed' | 'cancelled'

export type WeightTicketLine = {
  deductionMode: DeductionMode
  deductionValue: string
  grossWeight: string
  id: string
  impurityId: string
  note: string
  productId: string
}

export type StoredWeightTicketLine = WeightTicketLine & {
  deductionWeight: number
  grossWeightValue: number
  imageCount: number
  imageNames: string[]
  impurityName: string
  netWeight: number
  productName: string
}

export type StoredWeightTicket = {
  branchId: string
  branchName: string
  createdAt: string
  documentDate: string
  documentNo: string
  enteredBy: string
  id: string
  imageCount: number
  imageNames: string[]
  lines: StoredWeightTicketLine[]
  partyId: string
  partyName: string
  remark: string
  status: WeightTicketStatus
  totals: {
    deductionWeight: number
    grossWeight: number
    netWeight: number
  }
  type: WeightTicketType
  vehicleNo: string
}

export type OptionItem = {
  code?: string
  description?: string
  id: string
  label: string
}

export const weightTicketStorageKey = 'ns-scrap-erp.weight-tickets.v1'

export const branchOptions: OptionItem[] = [
  { code: '01', description: 'สาขารับซื้อและคลังวัตถุดิบ', id: 'BR001', label: 'สมุทรสาคร' },
  { code: '02', description: 'สาขาผลิตและคลังสินค้า', id: 'BR002', label: 'นครสวรรค์' },
]

export const supplierOptions: OptionItem[] = [
  { description: 'Supplier · ซื้อสด', id: 'SUP-001', label: 'บริษัท รุ่งเศษโลหะ' },
  { description: 'Supplier · ตาม PO', id: 'SUP-002', label: 'หจก. โชคไพบูลย์รีไซเคิล' },
  { description: 'Supplier · หน้างาน', id: 'SUP-003', label: 'คุณสมชาย รถคอก' },
]

export const customerOptions: OptionItem[] = [
  { description: 'Customer · ส่งขายตรง', id: 'CUS-001', label: 'บริษัท ไทยเมททัลเทรด' },
  { description: 'Customer · โรงหล่อ', id: 'CUS-002', label: 'โรงหล่อสยามอินดัสเทรียล' },
  { description: 'Customer · ลานปลายทาง', id: 'CUS-003', label: 'บริษัท ยูไนเต็ดคอปเปอร์' },
]

export const productOptions: OptionItem[] = [
  { description: 'RM · ทองแดงเบอร์ 1', id: 'PROD-CU1', label: 'ทองแดงเบอร์ 1' },
  { description: 'RM · ทองแดงเบอร์ 2', id: 'PROD-CU2', label: 'ทองแดงเบอร์ 2' },
  { description: 'RM · ทองเหลืองป่น', id: 'PROD-BRASS', label: 'ทองเหลืองป่น' },
  { description: 'FG · อินกอตทองแดง', id: 'PROD-INGOT', label: 'อินกอตทองแดง' },
]

export const statusLabels: Record<WeightTicketStatus, string> = {
  billed: 'ออกบิลแล้ว',
  cancelled: 'ยกเลิก',
  delivered: 'ส่งของแล้ว',
  partially_billed: 'ออกบิลบางส่วน',
  received: 'รับของแล้ว',
}

export const typeLabels: Record<WeightTicketType, string> = {
  WTI: 'ใบรับของ WTI',
  WTO: 'ใบส่งของ WTO',
}

export function createWeightTicketLine(id = crypto.randomUUID()): WeightTicketLine {
  return {
    deductionMode: 'none',
    deductionValue: '',
    grossWeight: '',
    id,
    impurityId: '',
    note: '',
    productId: '',
  }
}

export function toNumber(value: string) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

export function normalizeDecimalInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  const [first, ...rest] = cleaned.split('.')
  const integerPart = first.slice(0, 10)
  const decimalPart = rest.join('').slice(0, 3)
  return rest.length > 0 ? `${integerPart}.${decimalPart}` : integerPart
}

export function normalizeVehicleNo(value: string) {
  return value
    .replace(/[^\u0E00-\u0E7Fa-zA-Z0-9 .-]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 24)
    .toUpperCase()
}

export function formatWeight(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

export function formatDateDisplay(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

export function calculateLineTotals(line: WeightTicketLine) {
  const grossWeight = Math.max(0, toNumber(line.grossWeight))
  const rawDeduction = line.deductionMode === 'percent'
    ? grossWeight * Math.max(0, toNumber(line.deductionValue)) / 100
    : line.deductionMode === 'kg'
      ? Math.max(0, toNumber(line.deductionValue))
      : 0
  const deductionWeight = Math.min(rawDeduction, grossWeight)
  return {
    deductionWeight,
    grossWeight,
    netWeight: Math.max(0, grossWeight - deductionWeight),
  }
}

export function calculateTicketTotals(lines: WeightTicketLine[]) {
  return lines.reduce((summary, line) => {
    const totals = calculateLineTotals(line)
    summary.grossWeight += totals.grossWeight
    summary.deductionWeight += totals.deductionWeight
    summary.netWeight += totals.netWeight
    return summary
  }, { deductionWeight: 0, grossWeight: 0, netWeight: 0 })
}

export function findOptionLabel(options: OptionItem[], id: string) {
  return options.find((option) => option.id === id)?.label ?? id
}

export function getPartyOptions(type: WeightTicketType) {
  return type === 'WTI' ? supplierOptions : customerOptions
}

export function getBranchCode(branchId: string, branches: OptionItem[] = branchOptions) {
  const branch = branches.find((option) => option.id === branchId)
  const rawCode = String(branch?.code ?? '').trim()
  const digits = rawCode.replace(/\D/g, '')
  if (digits) return digits.slice(-2).padStart(2, '0')

  const matchedDigits = branchId.match(/\d+/g)?.join('') ?? ''
  if (matchedDigits) return matchedDigits.slice(-2).padStart(2, '0')
  return '00'
}

export function currentDocumentDate() {
  return new Date().toISOString().slice(0, 10)
}

export function currentCreatedTime() {
  return new Date().toTimeString().slice(0, 5)
}

export function documentPeriod(date = new Date()) {
  const year = String(date.getFullYear()).slice(-2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}${month}`
}

export function generateDocumentNo(type: WeightTicketType, branchId: string, existingTickets: StoredWeightTicket[], branches: OptionItem[] = branchOptions) {
  const branchCode = getBranchCode(branchId, branches)
  const period = documentPeriod()
  const prefix = `${type}${branchCode}${period}-`
  const maxSequence = existingTickets
    .filter((ticket) => ticket.documentNo.startsWith(prefix))
    .reduce((max, ticket) => {
      const sequence = Number(ticket.documentNo.slice(prefix.length))
      return Number.isFinite(sequence) ? Math.max(max, sequence) : max
    }, 0)
  return `${prefix}${String(maxSequence + 1).padStart(4, '0')}`
}

export function loadStoredWeightTickets() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(weightTicketStorageKey)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as StoredWeightTicket[] : []
  } catch {
    return []
  }
}

export function saveStoredWeightTicket(ticket: StoredWeightTicket) {
  if (typeof window === 'undefined') return
  const current = loadStoredWeightTickets()
  window.localStorage.setItem(weightTicketStorageKey, JSON.stringify([ticket, ...current]))
}

export const sampleWeightTickets: StoredWeightTicket[] = [
  {
    branchId: 'BR001',
    branchName: 'สมุทรสาคร',
    createdAt: '2026-05-25T08:42:00.000+07:00',
    documentDate: '2026-05-25',
    documentNo: 'WTI012605-0001',
    enteredBy: 'อ้อม · เครื่องชั่ง A',
    id: 'sample-wti-1',
    imageCount: 2,
    imageNames: ['vehicle-front.jpg', 'copper-pile.jpg'],
    lines: [
      {
        deductionMode: 'percent',
        deductionValue: '1.5',
        deductionWeight: 7.5,
        grossWeight: '500',
        grossWeightValue: 500,
        id: 'sample-wti-line-1',
        imageCount: 2,
        imageNames: ['vehicle-front.jpg', 'copper-pile.jpg'],
        impurityId: 'IMP-001',
        impurityName: 'ดิน/ฝุ่น',
        netWeight: 492.5,
        note: 'หักสิ่งเจือปนตามสภาพสินค้า',
        productId: 'PROD-CU1',
        productName: 'ทองแดงเบอร์ 1',
      },
    ],
    partyId: 'SUP-001',
    partyName: 'บริษัท รุ่งเศษโลหะ',
    remark: 'ตัวอย่างใบรับของจาก flow ใหม่',
    status: 'received',
    totals: { deductionWeight: 7.5, grossWeight: 500, netWeight: 492.5 },
    type: 'WTI',
    vehicleNo: '83-5476',
  },
  {
    branchId: 'BR001',
    branchName: 'สมุทรสาคร',
    createdAt: '2026-05-25T11:15:00.000+07:00',
    documentDate: '2026-05-25',
    documentNo: 'WTO012605-0001',
    enteredBy: 'กวาง · หัวหน้าคลัง',
    id: 'sample-wto-1',
    imageCount: 1,
    imageNames: ['outbound-truck.jpg'],
    lines: [
      {
        deductionMode: 'none',
        deductionValue: '',
        deductionWeight: 0,
        grossWeight: '320',
        grossWeightValue: 320,
        id: 'sample-wto-line-1',
        imageCount: 1,
        imageNames: ['outbound-truck.jpg'],
        impurityId: '',
        impurityName: '',
        netWeight: 320,
        note: '',
        productId: 'PROD-INGOT',
        productName: 'อินกอตทองแดง',
      },
    ],
    partyId: 'CUS-001',
    partyName: 'บริษัท ไทยเมททัลเทรด',
    remark: 'ตัวอย่างใบส่งของขาออก',
    status: 'delivered',
    totals: { deductionWeight: 0, grossWeight: 320, netWeight: 320 },
    type: 'WTO',
    vehicleNo: '70-1122',
  },
]
