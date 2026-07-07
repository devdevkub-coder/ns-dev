import { z } from 'zod'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const docNoPattern = /^[A-Za-z0-9_-]+$/
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u

const requiredDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD')
const optionalDocNo = z.preprocess(
  blankToNull,
  z.string().trim().max(40, 'เลขที่เอกสารยาวเกินไป').regex(docNoPattern, 'เลขที่เอกสารใช้ได้เฉพาะอังกฤษ ตัวเลข ขีดกลาง และ underscore').nullable().default(null),
)
const optionalGeneralText = (label: string, maxLength = 500) => z.preprocess(
  blankToNull,
  z.string().trim().max(maxLength, `${label}ยาวเกินไป`).regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)
const positiveQty = (label = 'จำนวน') => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).gt(0, `${label}ต้องมากกว่า 0`)
const nonNegativeQty = (label = 'จำนวน') => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).min(0, `${label}ต้องไม่ติดลบ`)
const stockConvertAllocationMethodSchema = z.enum(['FIFO', 'LIFO', 'HIGHEST_COST', 'LOWEST_COST', 'MANUAL'])
const stockConvertTargetCostPolicySchema = z.enum(['SOURCE_MATCHED', 'CUSTOM_UNIT_COST'])

export const stockStatusSchema = z.enum(['RM', 'WIP', 'FG'])
export const stockStateSchema = z.enum(['on_hand', 'pending_in', 'pending_out'])
export const statusConvertStatusSchema = z.enum(['RM', 'FG'])

export const stockQuerySchema = z.object({
  asOf: z.preprocess(blankToNull, requiredDate.nullable().default(null)),
  branchId: z.preprocess(blankToNull, z.string().trim().nullable().default(null)),
  format: z.enum(['json', 'xlsx']).default('json'),
  lotNo: z.preprocess(blankToNull, z.string().trim().max(80).nullable().default(null)),
  onHold: z.preprocess((value) => value === '1' || value === 'true', z.boolean().default(false)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(500).default(50),
  productId: z.preprocess(blankToNull, z.string().trim().nullable().default(null)),
  q: z.preprocess(blankToNull, z.string().trim().max(120).nullable().default(null)),
  refType: z.preprocess(blankToNull, z.string().trim().max(20).nullable().default(null)),
  sort: z.string().trim().max(40).default('date'),
  status: z.preprocess(blankToNull, z.string().trim().nullable().default(null)),
  stockState: z.preprocess(blankToNull, stockStateSchema.nullable().default(null)),
  warehouseId: z.preprocess(blankToNull, z.string().trim().nullable().default(null)),
  from: z.preprocess(blankToNull, requiredDate.nullable().default(null)),
  to: z.preprocess(blankToNull, requiredDate.nullable().default(null)),
})

export const statusConvertFormSchema = z.object({
  branchId: z.string().trim().min(1, 'เลือกสาขา'),
  date: requiredDate,
  docNo: optionalDocNo,
  fromStatus: statusConvertStatusSchema.default('RM'),
  lotNo: optionalGeneralText('Lot', 80),
  notes: optionalGeneralText('หมายเหตุ', 500),
  productId: z.string().trim().min(1, 'เลือกสินค้า'),
  qty: positiveQty('น้ำหนัก'),
  reason: z.string().trim().min(3, 'กรอกเหตุผลอย่างน้อย 3 ตัวอักษร').max(240, 'เหตุผลยาวเกินไป').regex(generalTextPattern, 'เหตุผลมีรูปแบบไม่ถูกต้อง'),
  toStatus: statusConvertStatusSchema.default('FG'),
  warehouseId: z.string().trim().min(1, 'เลือกคลังต้นทาง'),
  targetWarehouseId: z.string().trim().min(1, 'เลือกคลังปลายทาง'),
}).refine((value) => value.fromStatus !== value.toStatus, {
  message: 'สถานะต้นทางและปลายทางต้องไม่ซ้ำกัน',
  path: ['toStatus'],
}).refine((value) => (value.fromStatus === 'RM' && value.toStatus === 'FG') || (value.fromStatus === 'FG' && value.toStatus === 'RM'), {
  message: 'ปรับสถานะได้เฉพาะ RM -> FG หรือ FG -> RM',
  path: ['toStatus'],
})

export type StatusConvertFormValues = z.infer<typeof statusConvertFormSchema>

export const stockConvertFormSchema = z.object({
  allocationMethod: stockConvertAllocationMethodSchema.default('FIFO'),
  branchId: z.string().trim().min(1, 'เลือกสาขา'),
  date: requiredDate,
  docNo: optionalDocNo,
  lotNo: optionalGeneralText('Lot', 80),
  manualAllocations: z.array(z.object({
    poolEntryId: z.string().trim().min(1, 'เลือก Cost Pool lot'),
    qty: positiveQty('จำนวนที่เลือกจาก Cost Pool'),
  })).default([]),
  notes: optionalGeneralText('หมายเหตุ', 500),
  reason: optionalGeneralText('เหตุผล', 240),
  sourceProductId: z.string().trim().min(1, 'เลือกสินค้าต้นทาง'),
  sourceQty: positiveQty('น้ำหนักต้นทาง'),
  targetCostPolicy: stockConvertTargetCostPolicySchema.default('SOURCE_MATCHED'),
  targetLotNo: optionalGeneralText('Lot ปลายทาง', 80),
  targetProductId: z.string().trim().min(1, 'เลือกสินค้าปลายทาง'),
  targetQty: positiveQty('น้ำหนักปลายทาง'),
  targetUnitCost: z.preprocess(blankToNull, positiveQty('Custom unit cost').nullable().default(null)),
  targetUnitCostReason: optionalGeneralText('เหตุผล override ต้นทุน', 240),
  warehouseId: z.string().trim().min(1, 'เลือกคลัง'),
}).refine((value) => value.sourceProductId !== value.targetProductId || value.lotNo !== value.targetLotNo, {
  message: 'สินค้าหรือ Lot ปลายทางต้องต่างจากต้นทาง',
  path: ['targetProductId'],
}).refine((value) => value.targetQty <= value.sourceQty, {
  message: 'น้ำหนักปลายทางต้องน้อยกว่าหรือเท่ากับน้ำหนักต้นทาง',
  path: ['targetQty'],
}).refine((value) => value.allocationMethod !== 'MANUAL' || value.manualAllocations.length > 0, {
  message: 'Manual ต้องเลือก Cost Pool lot อย่างน้อย 1 รายการ',
  path: ['manualAllocations'],
}).refine((value) => value.targetCostPolicy !== 'CUSTOM_UNIT_COST' || value.targetUnitCost !== null, {
  message: 'Custom unit cost ต้องมากกว่า 0',
  path: ['targetUnitCost'],
}).refine((value) => value.targetCostPolicy !== 'CUSTOM_UNIT_COST' || Boolean(value.targetUnitCostReason && value.targetUnitCostReason.length >= 3), {
  message: 'กรอกเหตุผล override ต้นทุนอย่างน้อย 3 ตัวอักษร',
  path: ['targetUnitCostReason'],
})

export type StockConvertFormValues = z.infer<typeof stockConvertFormSchema>

export const stockAdjustReasonOptions = [
  'หาของไม่เจอ (Missing)',
  'นับจริง 0 แต่ระบบมี (Lost/Damaged)',
  'นับได้เกินระบบ (Found Excess)',
  'สูญหาย (Lost)',
  'เสียหาย (Damaged)',
  'ผิดสาขา/คลัง (Wrong Branch)',
  'อื่นๆ (Other)',
] as const

export const stockAdjustReasonSchema = z.enum(stockAdjustReasonOptions)

export const stockAdjustFormSchema = z.object({
  branchId: z.string().trim().min(1, 'เลือกสาขา'),
  countedQty: nonNegativeQty('นับจริง'),
  date: requiredDate,
  docNo: optionalDocNo,
  lotNo: optionalGeneralText('Lot', 80),
  productId: z.string().trim().min(1, 'เลือกสินค้า'),
  reason: stockAdjustReasonSchema,
  remark: optionalGeneralText('หมายเหตุ', 500),
  status: stockStatusSchema,
  systemQty: nonNegativeQty('ยอดในระบบ'),
  totalValue: z.number().optional(),
  unitPricePerKg: z.number().nonnegative().optional(),
  warehouseId: z.string().trim().min(1, 'เลือกคลัง'),
})

export type StockAdjustFormValues = z.infer<typeof stockAdjustFormSchema>

export const stockAdjustCorrectionSchema = z.object({
  countedQty: nonNegativeQty('นับจริง'),
  docNo: z.string().trim().min(1, 'ระบุเลขที่เอกสาร'),
  reason: stockAdjustReasonSchema,
  remark: optionalGeneralText('หมายเหตุ', 500),
})

export type StockAdjustCorrectionValues = z.infer<typeof stockAdjustCorrectionSchema>

export type StockOption = {
  active: boolean | null
  branchId?: string | null
  code?: string | null
  id: string
  metalGroup?: string | null
  name: string
  status?: string | null
}

export type StockCostPoolOption = {
  availableQty: number
  availableValue: number
  branchId: string | null
  date: string
  id: string
  lotNo: string | null
  originalQty: number
  productId: string
  sourceRefNo: string | null
  sourceType: string
  status: string
  unitCost: number
  warehouseId: string | null
}

export type StockBalanceOption = {
  branchId: string | null
  metalGroup?: string | null
  onHandQty: number
  productId: string
  readyQty: number
  warehouseId: string | null
}
