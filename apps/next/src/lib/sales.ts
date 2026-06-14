import { z } from 'zod'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const safeIdPattern = /^[A-Za-z0-9_.:-]+$/
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u

const optionalSafeId = (label: string) => z.preprocess(
  blankToNull,
  z.string().trim().max(80, `${label}ยาวเกินไป`).regex(safeIdPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)

const requiredSafeId = (label: string) => z.string()
  .trim()
  .min(1, `เลือก${label}`)
  .max(80, `${label}ยาวเกินไป`)
  .regex(safeIdPattern, `${label}มีรูปแบบไม่ถูกต้อง`)

const optionalGeneralText = (label: string, maxLength = 500) => z.preprocess(
  blankToNull,
  z.string().trim().max(maxLength, `${label}ยาวเกินไป`).regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)

const requiredDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD')
const positiveNumber = (label: string) => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).gt(0, `${label}ต้องมากกว่า 0`)
const money = (label: string) => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).min(0, `${label}ต้องไม่ติดลบ`)

export const salesLineItemSchema = z.object({
  deliveryLineId: optionalSafeId('รายการใบส่งของ'),
  deliverySummaryId: optionalSafeId('สรุปใบส่งของ'),
  deliveryTicketDocNo: optionalGeneralText('เลขใบส่งของ', 80),
  deliveryTicketId: optionalSafeId('ใบส่งของ'),
  deductWeight: money('หัก').default(0),
  discount: money('ส่วนลด').default(0),
  grossWeight: money('Gross').default(0),
  netWeight: money('น้ำหนักสุทธิ').default(0),
  note: optionalGeneralText('หมายเหตุรายการ', 200),
  poSellId: optionalSafeId('PO Sell'),
  price: positiveNumber('ราคา/หน่วย'),
  productId: z.string().trim().min(1, 'เลือกสินค้า').max(80, 'รหัสสินค้ายาวเกินไป').regex(safeIdPattern, 'รหัสสินค้ามีรูปแบบไม่ถูกต้อง'),
  qty: positiveNumber('จำนวน'),
  tradingCostSourceId: optionalSafeId('Trading cost source'),
})

export const salesBillFormSchema = z.object({
  branchId: requiredSafeId('สาขา'),
  channelId: requiredSafeId('ช่องทางขาย'),
  customerAdvanceId: optionalSafeId('รับเงินล่วงหน้า Customer'),
  customerId: z.string().trim().min(1, 'เลือกลูกค้า').max(80, 'รหัสลูกค้ายาวเกินไป').regex(safeIdPattern, 'รหัสลูกค้ามีรูปแบบไม่ถูกต้อง'),
  deliveryTicketId: optionalSafeId('ใบส่งของ'),
  discountTotal: money('ส่วนลดท้ายบิล').default(0),
  hasVat: z.boolean().default(false),
  items: z.array(salesLineItemSchema).min(1, 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ').max(50, 'รายการสินค้ามากเกินไป'),
  licensePlate: optionalGeneralText('ทะเบียนรถ', 40),
  note: optionalGeneralText('หมายเหตุ', 500),
  pendingStockIssueId: optionalSafeId('เบิกออกรอบิล'),
  poSellId: optionalSafeId('PO Sell'),
  refNo: z.preprocess(
    blankToNull,
    z.string().trim().max(50, 'เลขที่อ้างอิงยาวเกินไป').regex(/^[A-Za-z0-9_-]+$/, 'เลขที่อ้างอิงใช้ได้เฉพาะอังกฤษ ตัวเลข ขีดกลาง และ underscore').nullable().default(null),
  ),
  fromPsaleNo: optionalSafeId('ใบเบิกออก'),
  fromPsaleId: optionalSafeId('รหัสใบเบิกออก'),
  transactionMode: z.enum(['STOCK', 'TRADING']).default('STOCK'),
  vatInvoiceDate: z.preprocess(
    blankToNull,
    z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ใบกำกับภาษีต้องเป็นรูปแบบ YYYY-MM-DD').nullable().default(null),
  ),
  vatInvoiceNo: z.preprocess(
    blankToNull,
    z.string().trim().max(50, 'เลขที่ใบกำกับภาษียาวเกินไป').regex(/^[A-Za-z0-9_-]+$/, 'เลขที่ใบกำกับภาษีใช้ได้เฉพาะอังกฤษ ตัวเลข ขีดกลาง และ underscore').nullable().default(null),
  ),
  vatInvoiceIssued: z.boolean().default(false),
  vatType: z.enum(['NONE', 'EXCLUDE', 'INCLUDE']).default('NONE'),
  warehouseId: optionalSafeId('คลัง'),
}).refine((value) => !value.vatInvoiceIssued || Boolean(value.vatInvoiceNo), {
  message: 'กรอกเลขที่ใบกำกับภาษีเมื่อระบุว่าออกแล้ว',
  path: ['vatInvoiceNo'],
}).refine((value) => !value.vatInvoiceIssued || Boolean(value.vatInvoiceDate), {
  message: 'กรอกวันที่ใบกำกับภาษีเมื่อระบุว่าออกแล้ว',
  path: ['vatInvoiceDate'],
}).refine((value) => value.transactionMode !== 'STOCK' || Boolean(value.deliveryTicketId) || Boolean(value.pendingStockIssueId) || Boolean(value.fromPsaleNo), {
  message: 'เลือกใบส่งของ WTO หรือระบุใบเบิกออก PSALE',
  path: ['deliveryTicketId'],
}).refine((value) => value.transactionMode !== 'TRADING' || value.items.every((item) => Boolean(item.tradingCostSourceId)), {
  message: 'บิลขาย Trading ต้องเลือกต้นทุน Trading PB/Cost Source ให้ครบทุกแถว',
  path: ['items'],
})

export const salesBillCancelSchema = z.object({
  note: z.string()
    .trim()
    .min(1, 'กรอกเหตุผลการยกเลิก')
    .max(500, 'เหตุผลการยกเลิกยาวเกินไป')
    .regex(generalTextPattern, 'เหตุผลการยกเลิกมีรูปแบบไม่ถูกต้อง'),
})

export const poSellFormSchema = z.object({
  branchId: optionalSafeId('สาขา'),
  channelId: optionalSafeId('ช่องทางขาย'),
  customerId: z.string().trim().min(1, 'เลือกลูกค้า').max(80, 'รหัสลูกค้ายาวเกินไป').regex(safeIdPattern, 'รหัสลูกค้ามีรูปแบบไม่ถูกต้อง'),
  expectedDelivery: requiredDate,
  items: z.array(salesLineItemSchema.omit({ deductWeight: true, discount: true, grossWeight: true, netWeight: true, poSellId: true }).extend({ discount: money('ส่วนลด').default(0) })).min(1, 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ').max(50, 'รายการสินค้ามากเกินไป'),
  note: optionalGeneralText('หมายเหตุ', 500),
})

export const stockIssueLineItemSchema = z.object({
  productId: z.string().trim().min(1, 'เลือกสินค้า').max(80, 'รหัสสินค้ายาวเกินไป').regex(safeIdPattern, 'รหัสสินค้ามีรูปแบบไม่ถูกต้อง'),
  qty: positiveNumber('จำนวน'),
  price: money('ราคาคาดการณ์').default(0),
  note: optionalGeneralText('หมายเหตุรายการ', 200),
})

export const stockIssueFormSchema = z.object({
  branchId: requiredSafeId('สาขา'),
  warehouseId: requiredSafeId('คลัง'),
  customerId: z.string().trim().min(1, 'เลือกลูกค้า').max(80, 'รหัสลูกค้ายาวเกินไป').regex(safeIdPattern, 'รหัสลูกค้ามีรูปแบบไม่ถูกต้อง'),
  date: requiredDate,
  notes: optionalGeneralText('หมายเหตุ', 500),
  items: z.array(stockIssueLineItemSchema).min(1, 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ').max(50, 'รายการสินค้ามากเกินไป'),
})

export type SalesBillFormValues = z.infer<typeof salesBillFormSchema>
export type SalesBillCancelValues = z.infer<typeof salesBillCancelSchema>
export type PoSellFormValues = z.infer<typeof poSellFormSchema>
export type StockIssueFormValues = z.infer<typeof stockIssueFormSchema>
