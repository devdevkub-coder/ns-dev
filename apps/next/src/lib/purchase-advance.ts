import { z } from 'zod'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const businessTextPattern = /^[\p{L}\p{M}\p{N}\s.&,()/'"+#%:-]+$/u
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u
const docNoPattern = /^[A-Za-z0-9_-]+$/
const safeIdPattern = /^[A-Za-z0-9_.:-]+$/

const optionalBusinessText = (label: string, maxLength = 180) => z.preprocess(
  blankToNull,
  z.string().trim().max(maxLength, `${label}ยาวเกินไป`).regex(businessTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)

const optionalGeneralText = (label: string, maxLength = 500) => z.preprocess(
  blankToNull,
  z.string().trim().max(maxLength, `${label}ยาวเกินไป`).regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)

const optionalDocNo = z.preprocess(
  blankToNull,
  z.string().trim().max(40, 'เลขที่เอกสารยาวเกินไป').regex(docNoPattern, 'เลขที่เอกสารใช้ได้เฉพาะอังกฤษ ตัวเลข ขีดกลาง และ underscore').nullable().default(null),
)

const attachmentValueSchema = z.string().trim().min(1, 'ไฟล์รูปภาพไม่ถูกต้อง').max(255, 'ชื่อไฟล์รูปภาพยาวเกินไป').regex(generalTextPattern, 'ชื่อไฟล์รูปภาพมีรูปแบบไม่ถูกต้อง')

const requiredDateTime = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'วันที่และเวลาต้องเป็นรูปแบบ YYYY-MM-DDTHH:mm')
const optionalDateTime = z.preprocess(blankToNull, requiredDateTime.nullable().default(null))
const money = (label: string) => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).min(0, `${label}ต้องไม่ติดลบ`)
const positiveMoney = (label: string) => money(label).gt(0, `${label}ต้องมากกว่า 0`)

export const supplierAdvancePaymentStatusValues = [
  'pending_approval',
  'approved',
  'paid',
  'partially_allocated',
  'allocated',
  'refunding',
  'refunded',
  'cancelled',
] as const

export const supplierAdvancePaymentFormSchema = z.object({
  amount: positiveMoney('ยอดมัดจำ'),
  branchId: z.string().trim().min(1, 'เลือกสาขา').max(80, 'สาขายาวเกินไป').regex(safeIdPattern, 'สาขามีรูปแบบไม่ถูกต้อง'),
  customerName: optionalBusinessText('ชื่อลูกค้า', 180),
  docNo: optionalDocNo,
  driverName: optionalBusinessText('พนักงานขับรถ', 160),
  fundingAccountId: z.string().trim().min(1, 'เลือกบัญชีที่จ่าย').max(80, 'บัญชีที่จ่ายยาวเกินไป').regex(safeIdPattern, 'บัญชีที่จ่ายมีรูปแบบไม่ถูกต้อง'),
  inDate: optionalDateTime,
  largeScaleDocNo: optionalDocNo,
  netWeight: money('น้ำหนักสุทธิ'),
  outDate: optionalDateTime,
  paymentMethod: z.string().trim().min(1, 'เลือกวิธีจ่าย').max(80, 'วิธีจ่ายยาวเกินไป').regex(businessTextPattern, 'วิธีจ่ายมีรูปแบบไม่ถูกต้อง'),
  plateNo: optionalBusinessText('ทะเบียนรถ', 60),
  pricePerKg: money('ราคา/กก.'),
  productName: optionalBusinessText('ชื่อสินค้า', 180),
  remark: optionalGeneralText('หมายเหตุ', 500),
  scaleOperator: optionalBusinessText('ผู้ชั่งน้ำหนัก', 160),
  senderName: optionalBusinessText('ผู้ส่ง', 160),
  supplierId: z.string().trim().min(1, 'เลือก Supplier').max(80, 'Supplier ยาวเกินไป').regex(safeIdPattern, 'Supplier มีรูปแบบไม่ถูกต้อง'),
  vehiclePhotoNames: z.array(attachmentValueSchema).max(10, 'อัปโหลดรูปภาพรถได้ไม่เกิน 10 รูป').default([]),
  weightIn: money('น้ำหนักเข้า'),
  weightOut: money('น้ำหนักออก'),
}).refine((value) => {
  if (!value.inDate || !value.outDate) return true
  return new Date(`${value.outDate}:00+07:00`).getTime() >= new Date(`${value.inDate}:00+07:00`).getTime()
}, {
  message: 'วันที่ออกต้องไม่ก่อนวันที่เข้า',
  path: ['outDate'],
})

export type SupplierAdvancePaymentFormValues = z.infer<typeof supplierAdvancePaymentFormSchema>

export const supplierAdvancePaymentCancelSchema = z.object({
  note: z.string().trim().min(1, 'กรุณาระบุเหตุผลการยกเลิก').max(1000, 'เหตุผลการยกเลิกยาวเกินไป').regex(generalTextPattern, 'เหตุผลการยกเลิกมีรูปแบบไม่ถูกต้อง'),
})

export type SupplierAdvancePaymentCancelValues = z.infer<typeof supplierAdvancePaymentCancelSchema>
