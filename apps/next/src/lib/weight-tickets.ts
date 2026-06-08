import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'

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

export type WeightTicketRecordLine = WeightTicketLine & {
  deductionWeight: number
  grossWeightValue: number
  imageCount: number
  imageNames: string[]
  impurityName: string
  netWeight: number
  productName: string
}

export type WeightTicketProductSummary = {
  billedWeight: number
  deductWeight: number
  grossWeight: number
  hasMixedDeductionProfiles: boolean
  id: string
  lineCount: number
  netWeight: number
  productId: string
  productName: string
  remainingWeight: number
}

export type WeightTicketRecord = {
  branchId: string
  branchName: string
  canCancel: boolean
  canEdit: boolean
  cancelNote: string
  cancelledAt: string | null
  createdAt: string
  documentDate: string
  documentNo: string
  enteredBy: string
  id: string
  imageCount: number
  imageNames: string[]
  lines: WeightTicketRecordLine[]
  partyId: string
  partyName: string
  productSummaries: WeightTicketProductSummary[]
  remark: string
  status: WeightTicketStatus
  totals: {
    deductionWeight: number
    grossWeight: number
    netWeight: number
  }
  type: WeightTicketType
  timeline: WeightTicketTimelineEvent[]
  updatedAt: string | null
  updatedBy: string
  usageTimeline: WeightTicketUsageTimelineEvent[]
  usedInPurchaseBillCount: number
  usedInPurchaseBillDocNos: string[]
  usedInSalesBillCount: number
  usedInSalesBillDocNos: string[]
  vehicleImageCount: number
  vehicleImageNames: string[]
  vehicleNo: string
}

export type OptionItem = {
  category?: string
  code?: string
  description?: string
  id: string
  imageUrl?: string
  label: string
  name?: string
}

export type WeightTicketSortBy = 'createdAt' | 'documentNo' | 'partyName' | 'netWeight'
export type WeightTicketSortDir = 'asc' | 'desc'

export type StoredImageAsset = {
  fileName: string
  rawValue: string
  url: string | null
}

export type WeightTicketTimelineEvent = {
  action: string
  actorName: string
  eventKey: string
  id: string
  metadata: Record<string, unknown>
  occurredAt: string
  outcome: 'blocked' | 'failure' | 'success'
}

export type WeightTicketUsageTimelineEvent = {
  action: string
  allocatedDeductWeight: number
  allocatedGrossWeight: number
  allocatedNetWeight: number
  allocatedQty: number
  createdAt: string
  createdBy: string
  eventKey: string
  fromRemainingWeight: number | null
  id: string
  meta: Record<string, unknown>
  note: string
  productCode: string
  productName: string
  targetDocNo: string
  targetLineNo: number | null
  targetType: string
  toRemainingWeight: number | null
}

const typeEnum = z.enum(['WTI', 'WTO'])
const statusEnum = z.enum(['received', 'delivered', 'partially_billed', 'billed', 'cancelled'])
const deductionModeEnum = z.enum(['none', 'kg', 'percent'])
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u

const blankToEmpty = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const attachmentValueSchema = z.string().trim().min(1).max(4_000_000, 'ข้อมูลรูปภาพใหญ่เกินไป')

const weightTicketLinePayloadSchema = z.object({
  deductionMode: deductionModeEnum,
  deductionValue: z.coerce.number().finite().min(0).default(0),
  grossWeight: z.coerce.number().finite().gt(0, 'กรอกน้ำหนักมากกว่า 0'),
  id: z.string().trim().min(1).max(80),
  imageNames: z.array(attachmentValueSchema).min(1, 'รูปภาพสินค้าอย่างน้อย 1 รูป'),
  impurityId: z.preprocess(blankToEmpty, z.string().max(80).default('')),
  note: z.preprocess(blankToEmpty, z.string().max(160, 'หมายเหตุรายการยาวเกินไป').default('')),
  productId: z.string().trim().min(1, 'เลือกสินค้า'),
}).superRefine((value, ctx) => {
  if (value.deductionMode !== 'none' && !value.impurityId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'เลือกสิ่งเจือปน',
      path: ['impurityId'],
    })
  }
  if (value.deductionMode === 'percent' && value.deductionValue > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'หัก % ต้องไม่เกิน 100',
      path: ['deductionValue'],
    })
  }
  if (value.deductionMode === 'kg' && value.deductionValue > value.grossWeight) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'น้ำหนักหักต้องไม่เกินน้ำหนักรวม',
      path: ['deductionValue'],
    })
  }
})

export const weightTicketFormSchema = z.object({
  branchId: z.string().trim().min(1, 'เลือกสาขา'),
  id: z.string().trim().max(80).optional(),
  lines: z.array(weightTicketLinePayloadSchema).min(1, 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ'),
  partyId: z.string().trim().min(1, 'เลือกคู่ค้า'),
  remark: z.preprocess(blankToEmpty, z.string().max(500, 'หมายเหตุยาวเกินไป').default('')),
  type: typeEnum,
  vehicleImageNames: z.array(attachmentValueSchema).default([]),
  vehicleNo: z
    .string()
    .trim()
    .min(2, 'กรอกทะเบียนรถ')
    .max(24, 'ทะเบียนรถยาวเกินไป')
    .regex(/^[\p{L}\p{M}\p{N}\s.-]+$/u, 'ทะเบียนรถมีรูปแบบไม่ถูกต้อง'),
})

const weightTicketRecordLineSchema = z.object({
  deductionMode: deductionModeEnum,
  deductionValue: z.string(),
  deductionWeight: z.number(),
  grossWeight: z.string(),
  grossWeightValue: z.number(),
  id: z.string(),
  imageCount: z.number().int().nonnegative(),
  imageNames: z.array(z.string()),
  impurityId: z.string(),
  impurityName: z.string(),
  netWeight: z.number(),
  note: z.string(),
  productId: z.string(),
  productName: z.string(),
})

const weightTicketTimelineSchema = z.object({
  action: z.string(),
  actorName: z.string(),
  eventKey: z.string(),
  id: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  occurredAt: z.string(),
  outcome: z.enum(['blocked', 'failure', 'success']),
})

const weightTicketUsageTimelineSchema = z.object({
  action: z.string(),
  allocatedDeductWeight: z.number(),
  allocatedGrossWeight: z.number(),
  allocatedNetWeight: z.number(),
  allocatedQty: z.number(),
  createdAt: z.string(),
  createdBy: z.string(),
  eventKey: z.string(),
  fromRemainingWeight: z.number().nullable(),
  id: z.string(),
  meta: z.record(z.string(), z.unknown()).default({}),
  note: z.string(),
  productCode: z.string(),
  productName: z.string(),
  targetDocNo: z.string(),
  targetLineNo: z.number().int().nullable(),
  targetType: z.string(),
  toRemainingWeight: z.number().nullable(),
})

const weightTicketProductSummarySchema = z.object({
  billedWeight: z.number(),
  deductWeight: z.number(),
  grossWeight: z.number(),
  hasMixedDeductionProfiles: z.boolean(),
  id: z.string(),
  lineCount: z.number().int().nonnegative(),
  netWeight: z.number(),
  productId: z.string(),
  productName: z.string(),
  remainingWeight: z.number(),
})

export const weightTicketRecordSchema = z.object({
  branchId: z.string(),
  branchName: z.string(),
  canCancel: z.boolean(),
  canEdit: z.boolean(),
  cancelNote: z.string().default(''),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  documentDate: z.string(),
  documentNo: z.string(),
  enteredBy: z.string(),
  id: z.string(),
  imageCount: z.number().int().nonnegative(),
  imageNames: z.array(z.string()),
  lines: z.array(weightTicketRecordLineSchema),
  partyId: z.string(),
  partyName: z.string(),
  productSummaries: z.array(weightTicketProductSummarySchema).default([]),
  remark: z.string(),
  status: statusEnum,
  totals: z.object({
    deductionWeight: z.number(),
    grossWeight: z.number(),
    netWeight: z.number(),
  }),
  timeline: z.array(weightTicketTimelineSchema).default([]),
  type: typeEnum,
  updatedAt: z.string().nullable(),
  updatedBy: z.string(),
  usageTimeline: z.array(weightTicketUsageTimelineSchema).default([]),
  usedInPurchaseBillCount: z.number().int().nonnegative(),
  usedInPurchaseBillDocNos: z.array(z.string()).default([]),
  usedInSalesBillCount: z.number().int().nonnegative(),
  usedInSalesBillDocNos: z.array(z.string()).default([]),
  vehicleImageCount: z.number().int().nonnegative(),
  vehicleImageNames: z.array(z.string()),
  vehicleNo: z.string(),
})

const weightTicketListResultSchema = z.object({
  rows: z.array(weightTicketRecordSchema),
  totalRows: z.number().int().nonnegative(),
})

export const weightTicketCancelSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, 'กรอกหมายเหตุการยกเลิก')
    .max(500, 'หมายเหตุการยกเลิกยาวเกินไป')
    .regex(generalTextPattern, 'หมายเหตุการยกเลิกมีรูปแบบไม่ถูกต้อง'),
})

export type WeightTicketFormValues = z.infer<typeof weightTicketFormSchema>

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

export function encodeStoredImageAsset(fileName: string, dataUrl: string) {
  return JSON.stringify({ dataUrl, fileName })
}

export function decodeStoredImageAsset(rawValue: string): StoredImageAsset {
  const trimmed = rawValue.trim()

  if (trimmed.startsWith('data:image/')) {
    const mimeType = trimmed.slice('data:'.length, trimmed.indexOf(';') > -1 ? trimmed.indexOf(';') : undefined)
    return {
      fileName: mimeType || trimmed.slice(0, 32),
      rawValue,
      url: trimmed,
    }
  }

  try {
    const parsed = JSON.parse(trimmed) as { dataUrl?: unknown; fileName?: unknown }
    if (typeof parsed.fileName === 'string' && typeof parsed.dataUrl === 'string' && parsed.dataUrl.startsWith('data:image/')) {
      return {
        fileName: parsed.fileName,
        rawValue,
        url: parsed.dataUrl,
      }
    }
  } catch {
    // fallback to filename-only payload
  }

  return {
    fileName: trimmed,
    rawValue,
    url: null,
  }
}

export function calculateLineTotals(line: Pick<WeightTicketLine, 'deductionMode' | 'deductionValue' | 'grossWeight'>) {
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

export function calculateTicketTotals(lines: Array<Pick<WeightTicketLine, 'deductionMode' | 'deductionValue' | 'grossWeight'>>) {
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

export const statusLabels: Record<WeightTicketStatus, string> = {
  billed: 'ออกบิลแล้ว',
  cancelled: 'ยกเลิก',
  delivered: 'ส่งของแล้ว',
  partially_billed: 'ออกบิลบางส่วน',
  received: 'รับของแล้ว',
}

export function displayWeightTicketStatus(type: WeightTicketType, status: WeightTicketStatus) {
  if (type === 'WTI') {
    if (status === 'partially_billed') return 'ออกบิลแล้วบางส่วน'
    if (status === 'billed') return 'เสร็จสิ้น'
    if (status === 'cancelled') return 'ยกเลิก'
    return 'รับของแล้ว'
  }

  if (type === 'WTO') {
    if (status === 'cancelled') return 'ยกเลิก'
    if (status === 'delivered') return 'ส่งของแล้ว'
    return 'ออกบิลแล้ว'
  }

  return statusLabels[status]
}

export function weightTicketStatusBadgeClass(type: WeightTicketType, status: WeightTicketStatus) {
  if (status === 'cancelled') return 'text-rose-700'
  if (type === 'WTI') {
    if (status === 'partially_billed') return 'text-amber-700'
    if (status === 'billed') return 'text-blue-700'
    return 'text-emerald-700'
  }
  if (type === 'WTO') {
    if (status === 'delivered') return 'text-amber-700'
    return 'text-blue-700'
  }
  return 'text-slate-700'
}

export const typeLabels: Record<WeightTicketType, string> = {
  WTI: 'ใบรับของ WTI',
  WTO: 'ใบส่งของ WTO',
}

export async function listWeightTickets(params: {
  branchId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
  search?: string
  sortBy?: WeightTicketSortBy
  sortDir?: WeightTicketSortDir
  status?: WeightTicketStatus[] | 'all'
  type?: WeightTicketType | 'all'
} = {}) {
  const query = new URLSearchParams()
  if (params.branchId && params.branchId !== 'all') query.set('branchId', params.branchId)
  if (params.dateFrom) query.set('dateFrom', params.dateFrom)
  if (params.dateTo) query.set('dateTo', params.dateTo)
  if (params.page) query.set('page', String(params.page))
  if (params.pageSize) query.set('pageSize', String(params.pageSize))
  if (params.search) query.set('search', params.search)
  if (params.sortBy) query.set('sortBy', params.sortBy)
  if (params.sortDir) query.set('sortDir', params.sortDir)
  if (params.status && params.status !== 'all' && params.status.length > 0) query.set('status', params.status.join(','))
  if (params.type && params.type !== 'all') query.set('type', params.type)

  const response = await fetch(`/api/daily/weight-tickets?${query.toString()}`, { cache: 'no-store' })
  return readJsonResponse(response, weightTicketListResultSchema, 'โหลดรายการใบรับ-ส่งของไม่ได้')
}

export async function getWeightTicket(id: string) {
  const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(id)}`, { cache: 'no-store' })
  return readJsonResponse(response, weightTicketRecordSchema, 'โหลดใบรับ-ส่งของไม่ได้')
}

function payloadFromForm(values: WeightTicketFormValues) {
  return {
    ...values,
    lines: values.lines.map((line) => ({
      ...line,
      deductionValue: line.deductionMode === 'none' ? 0 : Number(line.deductionValue),
      grossWeight: Number(line.grossWeight),
    })),
  }
}

export async function saveWeightTicket(values: WeightTicketFormValues) {
  const parsed = weightTicketFormSchema.parse(values)
  const method = parsed.id ? 'PUT' : 'POST'
  const path = parsed.id ? `/api/daily/weight-tickets/${encodeURIComponent(parsed.id)}` : '/api/daily/weight-tickets'
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payloadFromForm(parsed)),
  })
  return readJsonResponse(response, weightTicketRecordSchema, parsed.id ? 'แก้ไขใบรับ-ส่งของไม่ได้' : 'บันทึกใบรับ-ส่งของไม่ได้')
}

export async function cancelWeightTicket(id: string, note: string) {
  const values = weightTicketCancelSchema.parse({ note })
  const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  return readJsonResponse(response, weightTicketRecordSchema, 'ยกเลิกใบรับ-ส่งของไม่ได้')
}
