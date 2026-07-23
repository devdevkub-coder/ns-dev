import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'

export type WeightTicketType = 'WTI' | 'WTO'
export type DeductionMode = 'none' | 'kg' | 'percent'
export type WeightTicketStatus = 'draft' | 'received' | 'delivered' | 'partially_billed' | 'billed' | 'cancelled'

export const WEIGHT_TICKET_TYPE = {
  WTI: 'WTI',
  WTO: 'WTO',
} as const satisfies Record<string, WeightTicketType>

export const WEIGHT_TICKET_STATUS = {
  BILLED: 'billed',
  CANCELLED: 'cancelled',
  DELIVERED: 'delivered',
  DRAFT: 'draft',
  PARTIALLY_BILLED: 'partially_billed',
  RECEIVED: 'received',
} as const satisfies Record<string, WeightTicketStatus>

export type WeightTicketLine = {
  containerDeductionWeight: string
  deductionMode: DeductionMode
  deductionValue: string
  draftVersion?: number
  grossWeight: string
  id: string
  imageNames: string[]
  impurityId: string
  impurityProductId?: string
  impurityProductName?: string
  impuritySourceLineId?: string | null
  impuritySourceLineNo?: number | null
  lineNo?: number
  note: string
  parentLineNo?: number | null
  productId: string
  warehouseId: string
  parentId?: string
}

export type WeightTicketRecordLine = WeightTicketLine & {
  containerDeductionWeightValue: number
  deductionWeight: number
  grossWeightValue: number
  imageCount: number
  imageNames: string[]
  impurityName: string
  impurityProductId?: string
  impurityProductName?: string
  netWeight: number
  productName: string
  warehouseName: string
  warehouseType: string
}

export type WeightTicketProductSummary = {
  billedWeight: number
  containerDeductionWeight: number
  costSnapshotStatus: 'locked' | 'none' | 'pending'
  deductWeight: number
  grossWeight: number
  hasMixedDeductionProfiles: boolean
  id: string
  lineCount: number
  netWeight: number
  pendingOutQty: number
  pendingOutValue: number
  productId: string
  productName: string
  categoryName: string
  remainingWeight: number
  unitCostSnapshot: number | null
}

export type WeightTicketPendingOutHistory = {
  costSnapshotAt: string | null
  costSnapshotNote: string
  costSnapshotSource: string
  eventKey?: string
  eventType?: string
  heldAt: string | null
  holdKey: string
  pendingOutValue: number | null
  productId: string
  productName: string
  qty: number
  qtyAfter: number | null
  qtyBefore: number | null
  referenceDocNo: string
  releasedAt: string | null
  sourceLineNo: number | null
  status: string
  statusLogEventKey?: string | null
  unitCostSnapshot: number | null
  warehouseId: string
  warehouseName: string
}

export type WeightTicketDownstreamAllocation = {
  allocatedDeductWeight: number
  allocatedGrossWeight: number
  allocatedNetWeight: number
  allocatedQty: number
  createdAt: string | null
  createdBy: string
  id: string
  productCode: string
  productName: string
  status: string
  summaryId: string
  targetDocNo: string
  targetLineNo: number | null
  targetType: 'PURCHASE_BILL' | 'SALES_BILL'
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
  draftVersion?: number
  enteredBy: string
  id: string
  imageCount: number
  imageNames: string[]
  lines: WeightTicketRecordLine[]
  partyId: string
  partyName: string
  pendingOutEvents: WeightTicketPendingOutHistory[]
  pendingOutHistory: WeightTicketPendingOutHistory[]
  productSummaries: WeightTicketProductSummary[]
  remark: string
  status: WeightTicketStatus
  totals: {
    containerDeductionWeight: number
    deductionWeight: number
    grossWeight: number
    netWeight: number
  }
  downstreamAllocations: WeightTicketDownstreamAllocation[]
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
  godownName: string
}

export type OptionItem = {
  branchIds?: string[]
  category?: string
  code?: string
  description?: string
  id: string
  imageUrl?: string
  label: string
  name?: string
  searchText?: string
}

export type WeightTicketSortBy = 'createdAt' | 'documentNo' | 'partyName' | 'netWeight' | 'branchName' | 'vehicleNo' | 'godownName' | 'deductionWeight' | 'impurityDeduction' | 'status' | 'updatedAt'
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
const statusEnum = z.enum(['draft', 'received', 'delivered', 'partially_billed', 'billed', 'cancelled'])
const deductionModeEnum = z.enum(['none', 'kg', 'percent'])
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u
export const OTHER_PRODUCT_IMPURITY_ID = '__OTHER_PRODUCT__'
export const OTHER_PRODUCT_IMPURITY_LABEL = 'สินค้าอื่น'
export const OTHER_PRODUCT_IMPURITY_LABELS = [OTHER_PRODUCT_IMPURITY_LABEL, 'อื่นๆ', 'อย่างอื่น'] as const

export function isOtherProductImpurityId(value: string | null | undefined) {
  return value === OTHER_PRODUCT_IMPURITY_ID
}

export function isOtherProductImpurityLabel(value: string | null | undefined) {
  const label = value?.trim()
  return OTHER_PRODUCT_IMPURITY_LABELS.some((candidate) => candidate === label)
}

const blankToEmpty = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const impurityProductIdPattern = /\[impurity_product_id:([^\]]+)\]/i
const impurityProductNamePattern = /\[impurity_product_name:([^\]]+)\]/i

const attachmentValueSchema = z.string().trim().min(1).max(4_000_000, 'ข้อมูลรูปภาพใหญ่เกินไป')
const weightNumberSchema = z.coerce.number().finite().min(0).multipleOf(0.01, 'กรอกทศนิยมได้ไม่เกิน 2 ตำแหน่ง')

const weightTicketLinePayloadSchema = z.object({
  containerDeductionWeight: weightNumberSchema.default(0),
  deductionMode: deductionModeEnum,
  deductionValue: weightNumberSchema.default(0),
  grossWeight: weightNumberSchema,
  id: z.string().trim().min(1).max(80),
  imageNames: z.array(attachmentValueSchema).default([]),
  impurityId: z.preprocess(blankToEmpty, z.string().max(80).default('')),
  impurityProductId: z.preprocess(blankToEmpty, z.string().max(80).default('')),
  impuritySourceLineId: z.string().trim().optional(),
  note: z.preprocess(blankToEmpty, z.string().max(160, 'หมายเหตุรายการยาวเกินไป').default('')),
  productId: z.string().trim().min(1, 'เลือกสินค้า'),
  warehouseId: z.preprocess(blankToEmpty, z.string().max(80).default('')),
  parentId: z.string().trim().optional(),
}).superRefine((value, ctx) => {
  const containerDeductionWeight = Math.min(value.containerDeductionWeight, value.grossWeight)
  const netBeforeImpurityWeight = Math.max(0, value.grossWeight - containerDeductionWeight)
  const impurityDeductionWeight = value.deductionMode === 'percent'
    ? netBeforeImpurityWeight * value.deductionValue / 100
    : value.deductionMode === 'kg'
      ? value.deductionValue
      : 0

  const isImpurityOnly = value.grossWeight === 0
  const isImpurityPurchase = Boolean(value.impuritySourceLineId)

  if (!isImpurityOnly) {
    if (value.containerDeductionWeight > value.grossWeight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'หักภาชนะต้องไม่เกินน้ำหนักรวม',
        path: ['containerDeductionWeight'],
      })
    }
    if (value.deductionMode === 'kg' && value.deductionValue > value.grossWeight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'น้ำหนักหักต้องไม่เกินน้ำหนักรวม',
        path: ['deductionValue'],
      })
    }
    if (containerDeductionWeight + impurityDeductionWeight > value.grossWeight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ยอดหักรวมต้องไม่เกินน้ำหนักรวม',
        path: ['deductionValue'],
      })
    }
    if (!isImpurityPurchase && value.imageNames.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'รูปภาพสินค้าอย่างน้อย 1 รูป',
        path: ['imageNames'],
      })
    }
  } else {
    if (value.deductionMode === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'เลือกสิ่งเจือปน',
        path: ['impurityId'],
      })
    }
  }

  if (value.deductionMode !== 'none' && value.deductionValue > 0 && !value.impurityId) {
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
  godownName: z.string().trim().min(1, 'กรอกโกดัง').max(100, 'ชื่อโกดังยาวเกินไป'),
}).superRefine((value, ctx) => {
  const lineById = new Map<string, (typeof value.lines)[number]>()
  value.lines.forEach((line, index) => {
    if (lineById.has(line.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'รหัสรายการซ้ำกัน',
        path: ['lines', index, 'id'],
      })
      return
    }
    lineById.set(line.id, line)
  })
  value.lines.forEach((line, index) => {
    if (!line.parentId) return
    if (line.parentId === line.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'รายการไม่สามารถอ้างตัวเองเป็นรายการหลักได้',
        path: ['lines', index, 'parentId'],
      })
    } else if (!lineById.has(line.parentId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ไม่พบรายการหลักที่อ้างถึง',
        path: ['lines', index, 'parentId'],
      })
    } else {
      const ancestorIds = new Set([line.id])
      let ancestorId: string | undefined = line.parentId
      while (ancestorId) {
        if (ancestorIds.has(ancestorId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'รายการหลักและรายการย่อยอ้างอิงกันเป็นวงจร',
            path: ['lines', index, 'parentId'],
          })
          break
        }
        ancestorIds.add(ancestorId)
        ancestorId = lineById.get(ancestorId)?.parentId
      }
    }
  })

  const calculation = calculateWeightTicketLineTotals(value.lines)
  value.lines.forEach((line, index) => {
    if (calculation.invalidChildProductLineIds.has(line.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'สินค้าของรายการย่อยต้องตรงกับสินค้าของรายการหลัก',
        path: ['lines', index, 'productId'],
      })
    }
    if (calculation.overflowingChildImpurityLineIds.has(line.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ยอดหักรวมต้องไม่เกินน้ำหนักรวม',
        path: ['lines', index, 'deductionValue'],
      })
    }
  })
  if (value.type !== 'WTO') return
  const parentBucketByKey = new Map<string, number>()
  value.lines.forEach((line, index) => {
    if (!line.warehouseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'เลือกคลัง',
        path: ['lines', index, 'warehouseId'],
      })
    }
    if (isOtherProductImpurityId(line.impurityId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ใบส่งของไม่รองรับสิ่งเจือปนแบบสินค้าอื่น',
        path: ['lines', index, 'impurityId'],
      })
    }
    if (!line.parentId && line.productId && line.warehouseId) {
      const key = `${line.productId.trim().toUpperCase()}::${line.warehouseId.trim().toUpperCase()}`
      const firstIndex = parentBucketByKey.get(key)
      if (firstIndex != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'สินค้านี้ในคลังนี้มีรายการหลักอยู่แล้ว ให้เพิ่มเป็นเต๋าในรายการเดิม',
          path: ['lines', index, 'warehouseId'],
        })
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'สินค้านี้ในคลังนี้มีรายการหลักอยู่แล้ว',
          path: ['lines', firstIndex, 'warehouseId'],
        })
      } else {
        parentBucketByKey.set(key, index)
      }
    }
  })
})

const weightTicketRecordLineSchema = z.object({
  containerDeductionWeight: z.string().default(''),
  containerDeductionWeightValue: z.number().default(0),
  deductionMode: deductionModeEnum,
  deductionValue: z.string(),
  deductionWeight: z.number(),
  draftVersion: z.number().int().nonnegative().default(0),
  grossWeight: z.string(),
  grossWeightValue: z.number(),
  id: z.string(),
  imageCount: z.number().int().nonnegative(),
  imageNames: z.array(z.string()),
  impurityId: z.string(),
  impurityProductId: z.string().default(''),
  impurityProductName: z.string().default(''),
  impuritySourceLineNo: z.number().int().positive().nullable().default(null),
  impurityName: z.string(),
  lineNo: z.number().int().positive(),
  netWeight: z.number(),
  note: z.string(),
  parentLineNo: z.number().int().positive().nullable().default(null),
  productId: z.string(),
  productName: z.string(),
  warehouseId: z.string(),
  warehouseName: z.string(),
  warehouseType: z.string(),
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
  containerDeductionWeight: z.number().default(0),
  costSnapshotStatus: z.enum(['locked', 'none', 'pending']).default('none'),
  deductWeight: z.number(),
  grossWeight: z.number(),
  hasMixedDeductionProfiles: z.boolean(),
  id: z.string(),
  lineCount: z.number().int().nonnegative(),
  netWeight: z.number(),
  pendingOutQty: z.number().default(0),
  pendingOutValue: z.number().default(0),
  productId: z.string(),
  productName: z.string(),
  categoryName: z.string(),
  remainingWeight: z.number(),
  unitCostSnapshot: z.number().nullable().default(null),
})

const weightTicketPendingOutHistorySchema = z.object({
  costSnapshotAt: z.string().nullable(),
  costSnapshotNote: z.string(),
  costSnapshotSource: z.string(),
  eventKey: z.string().optional(),
  eventType: z.string().optional(),
  heldAt: z.string().nullable(),
  holdKey: z.string(),
  pendingOutValue: z.number().nullable(),
  productId: z.string(),
  productName: z.string(),
  qty: z.number(),
  qtyAfter: z.number().nullable().optional().default(null),
  qtyBefore: z.number().nullable().optional().default(null),
  referenceDocNo: z.string(),
  releasedAt: z.string().nullable(),
  sourceLineNo: z.number().int().positive().nullable(),
  status: z.string(),
  statusLogEventKey: z.string().nullable().optional(),
  unitCostSnapshot: z.number().nullable(),
  warehouseId: z.string(),
  warehouseName: z.string(),
})

const weightTicketDownstreamAllocationSchema = z.object({
  allocatedDeductWeight: z.number(),
  allocatedGrossWeight: z.number(),
  allocatedNetWeight: z.number(),
  allocatedQty: z.number(),
  createdAt: z.string().nullable(),
  createdBy: z.string(),
  id: z.string(),
  productCode: z.string(),
  productName: z.string(),
  status: z.string(),
  summaryId: z.string(),
  targetDocNo: z.string(),
  targetLineNo: z.number().int().nullable(),
  targetType: z.enum(['PURCHASE_BILL', 'SALES_BILL']),
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
  draftVersion: z.number().int().nonnegative().default(0),
  enteredBy: z.string(),
  id: z.string(),
  imageCount: z.number().int().nonnegative(),
  imageNames: z.array(z.string()),
  lines: z.array(weightTicketRecordLineSchema),
  partyId: z.string(),
  partyName: z.string(),
  pendingOutEvents: z.array(weightTicketPendingOutHistorySchema).default([]),
  pendingOutHistory: z.array(weightTicketPendingOutHistorySchema).default([]),
  productSummaries: z.array(weightTicketProductSummarySchema).default([]),
  remark: z.string(),
  status: statusEnum,
  totals: z.object({
    containerDeductionWeight: z.number().default(0),
    deductionWeight: z.number(),
    grossWeight: z.number(),
    netWeight: z.number(),
  }),
  downstreamAllocations: z.array(weightTicketDownstreamAllocationSchema).default([]),
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
  godownName: z.string(),
})

const weightTicketListResultSchema = z.object({
  canOpenPurchaseBill: z.boolean(),
  canOpenSalesBill: z.boolean(),
  rows: z.array(weightTicketRecordSchema),
  totalRows: z.number().int().nonnegative(),
})

function createClientUuid() {
  if (typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export const weightTicketCancelSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, 'กรอกหมายเหตุการยกเลิก')
    .max(500, 'หมายเหตุการยกเลิกยาวเกินไป')
    .regex(generalTextPattern, 'หมายเหตุการยกเลิกมีรูปแบบไม่ถูกต้อง'),
})

export const weightTicketConfirmSchema = z.object({
  action: z.literal('confirm'),
})

export type WeightTicketFormValues = z.infer<typeof weightTicketFormSchema>

export function createWeightTicketLine(id = createClientUuid()): WeightTicketLine {
  return {
    containerDeductionWeight: '',
    deductionMode: 'none',
    deductionValue: '',
    grossWeight: '',
    id,
    imageNames: [],
    impurityId: '',
    impurityProductId: '',
    impurityProductName: '',
    note: '',
    productId: '',
    warehouseId: '',
  }
}

export function stripImpurityProductMeta(note: string | null | undefined) {
  return String(note ?? '')
    .replace(impurityProductIdPattern, '')
    .replace(impurityProductNamePattern, '')
    .trim()
}

export function parseImpurityProductMeta(note: string | null | undefined) {
  const rawNote = String(note ?? '')
  const impurityProductId = rawNote.match(impurityProductIdPattern)?.[1]?.trim() ?? ''
  const impurityProductName = rawNote.match(impurityProductNamePattern)?.[1]?.trim() ?? ''
  return {
    impurityProductId,
    impurityProductName,
    note: stripImpurityProductMeta(rawNote),
  }
}

export function appendImpurityProductMeta(
  note: string | null | undefined,
  impurityProduct: { id?: string | null; name?: string | null },
) {
  const baseNote = stripImpurityProductMeta(note)
  const productId = impurityProduct.id?.trim() ?? ''
  const productName = impurityProduct.name?.trim() ?? ''
  if (!productId && !productName) return baseNote
  return `${baseNote}[impurity_product_id:${productId}][impurity_product_name:${productName}]`
}

export function weightTicketImpurityDisplayName(line: Pick<WeightTicketRecordLine, 'impurityId' | 'impurityName' | 'impurityProductName'>) {
  if (isOtherProductImpurityId(line.impurityId) && line.impurityProductName?.trim()) {
    return line.impurityProductName.trim()
  }
  return line.impurityName?.trim() || 'สิ่งเจือปน'
}

export function toNumber(value: number | string) {
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

export function encodeStoredImageReference(fileName: string, url: string, storageKey: string) {
  return JSON.stringify({ fileName, storageKey, url })
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

  // Support pipe separator: "filename|dataUrl" or "filename|https://..."
  const pipeIndex = trimmed.indexOf('|')
  if (pipeIndex > 0) {
    const fileName = trimmed.slice(0, pipeIndex)
    const url = trimmed.slice(pipeIndex + 1)
    if (url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://')) {
      return {
        fileName,
        rawValue,
        url,
      }
    }
  }

  try {
    const parsed = JSON.parse(trimmed) as { dataUrl?: unknown; fileName?: unknown; url?: unknown }
    if (typeof parsed.fileName === 'string' && typeof parsed.dataUrl === 'string' && parsed.dataUrl.startsWith('data:image/')) {
      return {
        fileName: parsed.fileName,
        rawValue,
        url: parsed.dataUrl,
      }
    }
    if (
      typeof parsed.fileName === 'string'
      && typeof parsed.url === 'string'
      && (parsed.url.startsWith('http://') || parsed.url.startsWith('https://'))
    ) {
      return {
        fileName: parsed.fileName,
        rawValue,
        url: parsed.url,
      }
    }
  } catch {
    // Keep legacy filename-only payloads readable.
  }

  return {
    fileName: trimmed,
    rawValue,
    url: null,
  }
}

export function isPreviewableStoredImageAsset(
  image: StoredImageAsset,
): image is StoredImageAsset & { url: string } {
  if (!image.url) return false

  try {
    const url = new URL(image.url)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function calculateLineTotals(line: Pick<WeightTicketLine, 'containerDeductionWeight' | 'deductionMode' | 'deductionValue' | 'grossWeight'>) {
  const grossWeight = roundWeight(Math.max(0, toNumber(line.grossWeight)))
  const containerDeductionWeight = roundWeight(Math.min(Math.max(0, toNumber(line.containerDeductionWeight)), grossWeight))
  const netBeforeImpurityWeight = roundWeight(Math.max(0, grossWeight - containerDeductionWeight))
  const rawDeduction = line.deductionMode === 'percent'
    ? netBeforeImpurityWeight * Math.max(0, toNumber(line.deductionValue)) / 100
    : line.deductionMode === 'kg'
      ? Math.max(0, toNumber(line.deductionValue))
      : 0
  const deductionWeight = roundWeight(Math.min(rawDeduction, netBeforeImpurityWeight))
  return {
    containerDeductionWeight,
    deductionWeight,
    grossWeight,
    netWeight: roundWeight(Math.max(0, grossWeight - containerDeductionWeight - deductionWeight)),
  }
}

export function roundWeight(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

type WeightTicketCalculationLine = Pick<WeightTicketLine, 'deductionMode' | 'id' | 'productId'> & {
  containerDeductionWeight: number | string
  deductionValue: number | string
  grossWeight: number | string
  impurityId?: string
  impuritySourceLineId?: string | null
  parentId?: string
}

function isChildImpurityLine(line: WeightTicketCalculationLine) {
  return Boolean(
    line.parentId
    && toNumber(line.grossWeight) === 0
    && line.impurityId
    && line.deductionMode !== 'none',
  )
}

export function calculateWeightTicketLineTotals(lines: WeightTicketCalculationLine[]) {
  const lineTotalsById = new Map(lines.map((line) => [line.id, calculateLineTotals({
    containerDeductionWeight: String(line.containerDeductionWeight),
    deductionMode: line.deductionMode,
    deductionValue: String(line.deductionValue),
    grossWeight: String(line.grossWeight),
  })]))
  const lineById = new Map(lines.map((line) => [line.id, line]))
  const childrenByParentId = new Map<string, WeightTicketCalculationLine[]>()
  const invalidChildProductLineIds = new Set<string>()
  const overflowingChildImpurityLineIds = new Set<string>()

  lines.forEach((line) => {
    if (!line.parentId) return
    const parent = lineById.get(line.parentId)
    if (!parent) return
    if (parent.productId.trim().toUpperCase() !== line.productId.trim().toUpperCase()) {
      invalidChildProductLineIds.add(line.id)
      return
    }
    const children = childrenByParentId.get(line.parentId) ?? []
    children.push(line)
    childrenByParentId.set(line.parentId, children)
  })

  childrenByParentId.forEach((children, parentId) => {
    const parent = lineById.get(parentId)
    const impurityLines = children.filter(isChildImpurityLine)
    if (!parent || impurityLines.length === 0) return

    const sourceLots = [
      parent,
      ...children.filter((line) => !isChildImpurityLine(line) && !line.impuritySourceLineId),
    ]
    const netBeforeImpurityWeight = sourceLots.reduce((sum, line) => {
      const grossWeight = Math.max(0, toNumber(line.grossWeight))
      const containerDeductionWeight = Math.min(
        Math.max(0, toNumber(line.containerDeductionWeight)),
        grossWeight,
      )
      return sum + Math.max(0, grossWeight - containerDeductionWeight)
    }, 0)
    let availableNetWeight = sourceLots.reduce(
      (sum, line) => sum + (lineTotalsById.get(line.id)?.netWeight ?? 0),
      0,
    )

    impurityLines.forEach((line) => {
      const childTotals = lineTotalsById.get(line.id)
      if (!childTotals) return
      const rawDeduction = line.deductionMode === 'percent'
        ? netBeforeImpurityWeight * Math.max(0, toNumber(line.deductionValue)) / 100
        : Math.max(0, toNumber(line.deductionValue))
      if (roundWeight(rawDeduction) > roundWeight(availableNetWeight)) {
        overflowingChildImpurityLineIds.add(line.id)
      }
      const deductionWeight = roundWeight(Math.min(rawDeduction, availableNetWeight))

      childTotals.deductionWeight = deductionWeight
      childTotals.netWeight = 0

      let remainingDeduction = deductionWeight
      sourceLots.forEach((sourceLot) => {
        if (remainingDeduction <= 0) return
        const sourceTotals = lineTotalsById.get(sourceLot.id)
        if (!sourceTotals) return
        const appliedDeduction = Math.min(sourceTotals.netWeight, remainingDeduction)
        sourceTotals.netWeight = roundWeight(sourceTotals.netWeight - appliedDeduction)
        remainingDeduction = roundWeight(remainingDeduction - appliedDeduction)
      })
      availableNetWeight = roundWeight(availableNetWeight - deductionWeight)
    })
  })

  const sourceTotalsByLineId = new Map<string, ReturnType<typeof calculateLineTotals>>()
  lines.forEach((line) => {
    if (line.parentId) return
    const children = childrenByParentId.get(line.id) ?? []
    const groupedLines = [line, ...children]
    const sourceTotals = groupedLines.reduce(
      (totals, groupedLine) => {
        const lineTotals = lineTotalsById.get(groupedLine.id)
        if (!lineTotals) return totals
        totals.containerDeductionWeight += lineTotals.containerDeductionWeight
        totals.deductionWeight += lineTotals.deductionWeight
        totals.grossWeight += lineTotals.grossWeight
        totals.netWeight += lineTotals.netWeight
        return totals
      },
      { containerDeductionWeight: 0, deductionWeight: 0, grossWeight: 0, netWeight: 0 },
    )
    sourceTotalsByLineId.set(line.id, {
      containerDeductionWeight: roundWeight(sourceTotals.containerDeductionWeight),
      deductionWeight: roundWeight(sourceTotals.deductionWeight),
      grossWeight: roundWeight(sourceTotals.grossWeight),
      netWeight: roundWeight(sourceTotals.netWeight),
    })
  })

  const totals = [...lineTotalsById.values()].reduce(
    (summary, lineTotals) => ({
      containerDeductionWeight: summary.containerDeductionWeight + lineTotals.containerDeductionWeight,
      deductionWeight: summary.deductionWeight + lineTotals.deductionWeight,
      grossWeight: summary.grossWeight + lineTotals.grossWeight,
      netWeight: summary.netWeight + lineTotals.netWeight,
    }),
    { containerDeductionWeight: 0, deductionWeight: 0, grossWeight: 0, netWeight: 0 },
  )

  return {
    invalidChildProductLineIds,
    lineTotalsById,
    overflowingChildImpurityLineIds,
    sourceTotalsByLineId,
    totals: {
      containerDeductionWeight: roundWeight(totals.containerDeductionWeight),
      deductionWeight: roundWeight(totals.deductionWeight),
      grossWeight: roundWeight(totals.grossWeight),
      netWeight: roundWeight(totals.netWeight),
    },
  }
}

export function calculateTicketTotals(lines: WeightTicketCalculationLine[]) {
  return calculateWeightTicketLineTotals(lines).totals
}

export function findOptionLabel(options: OptionItem[], id: string) {
  return options.find((option) => option.id === id)?.label ?? id
}

export const statusLabels: Record<WeightTicketStatus, string> = {
  draft: 'แบบร่าง',
  billed: 'ออกบิลแล้ว',
  cancelled: 'ยกเลิก',
  delivered: 'ส่งของแล้ว',
  partially_billed: 'ออกบิลบางส่วน',
  received: 'รับของแล้ว',
}

export function displayWeightTicketStatus(type: WeightTicketType, status: WeightTicketStatus) {
  if (status === 'draft') {
    return type === 'WTO' ? 'ร่าง' : 'แบบร่าง'
  }
  if (type === 'WTI') {
    if (status === 'partially_billed') return 'ออกบิลแล้วบางส่วน'
    if (status === 'billed') return 'เสร็จสิ้น'
    if (status === 'cancelled') return 'ยกเลิก'
    return 'รับของแล้ว'
  }

  if (type === 'WTO') {
    if (status === 'cancelled') return 'ยกเลิก'
    if (status === 'delivered') return 'ส่งของแล้ว'
    if (status === 'partially_billed') return 'ออกบิลแล้วบางส่วน'
    return 'ออกบิลแล้ว'
  }

  return statusLabels[status]
}

export function weightTicketStatusBadgeClass(type: WeightTicketType, status: WeightTicketStatus) {
  if (status === 'draft') {
    return type === 'WTO' ? 'text-slate-700' : 'text-slate-500'
  }
  if (status === 'cancelled') return 'text-rose-700'
  if (type === 'WTI') {
    if (status === 'partially_billed') return 'text-amber-700'
    if (status === 'billed') return 'text-blue-700'
    return 'text-emerald-700'
  }
  if (type === 'WTO') {
    if (status === 'delivered') return 'text-amber-700'
    if (status === 'partially_billed') return 'text-orange-700'
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
      containerDeductionWeight: Number(line.containerDeductionWeight),
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

export async function createWeightTicketDraft(values: {
  branchId: string
  godownName: string
  partyId: string
  productId: string
  remark: string
  vehicleImageNames: string[]
  vehicleNo: string
}) {
  const response = await fetch('/api/daily/weight-tickets/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  return readJsonResponse(response, weightTicketRecordSchema, 'สร้าง draft ใบรับของไม่ได้')
}

export type WeightTicketLineDraftAction = 'add' | 'update' | 'delete'

export async function saveWeightTicketLineDraft(input: {
  action: WeightTicketLineDraftAction
  documentNo: string
  expectedLineVersion?: number | null
  line?: WeightTicketLine
  lineId?: string | null
}) {
  if (!input.documentNo) throw new Error('ยังไม่มีเลขที่เอกสารสำหรับบันทึกรายการ')
  const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(input.documentNo)}/lines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: input.action,
      expectedLineVersion: input.expectedLineVersion ?? null,
      line: input.line ? {
        containerDeductionWeight: Number(input.line.containerDeductionWeight),
        deductionMode: input.line.deductionMode,
        deductionValue: input.line.deductionMode === 'none' ? 0 : Number(input.line.deductionValue),
        grossWeight: Number(input.line.grossWeight),
        imageNames: input.line.imageNames,
        impurityId: input.line.impurityId,
        impurityProductId: input.line.impurityProductId,
        impuritySourceLineId: input.line.impuritySourceLineId == null ? null : input.line.impuritySourceLineId,
        note: input.line.note,
        parentId: input.line.parentId ?? null,
        productId: input.line.productId,
      } : undefined,
      lineId: input.lineId ?? null,
      operationId: createClientUuid(),
    }),
  })
  return readJsonResponse(response, weightTicketRecordSchema, 'บันทึกรายการ WTI ไม่ได้')
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

export async function confirmWeightTicket(id: string) {
  const values = weightTicketConfirmSchema.parse({ action: 'confirm' })
  const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  return readJsonResponse(response, weightTicketRecordSchema, 'ยืนยันใบรับ-ส่งของไม่ได้')
}

const weightTicketLineNotifyResultSchema = z.object({
  code: z.string(),
  detailUrl: z.string().optional(),
  lineRequestId: z.string().nullable().optional(),
  pdfUrl: z.string().optional(),
  status: z.number().optional(),
})

export async function notifyWeightTicketLine(id: string, values: { customMessage?: string; targetId?: string } = {}) {
  const response = await fetch(`/api/daily/weight-tickets/${encodeURIComponent(id)}/notify-line`, {
    body: JSON.stringify(values),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  return readJsonResponse(response, weightTicketLineNotifyResultSchema, 'ส่ง LINE ใบรับ-ส่งของไม่สำเร็จ')
}
