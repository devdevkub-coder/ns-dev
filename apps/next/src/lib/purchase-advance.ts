import { z } from 'zod'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const businessTextPattern = /^[\p{L}\p{M}\p{N}\s.&,()/'"+#%:-]+$/u
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u
const docNoPattern = /^[A-Za-z0-9_-]+$/
const invoiceNoPattern = /^[A-Za-z0-9_.\\/-]+$/
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

const invoiceNo = z.preprocess(
  blankToNull,
  z.string().trim().max(60, 'เลข invoice ยาวเกินไป').regex(invoiceNoPattern, 'เลข invoice ใช้ได้เฉพาะอังกฤษ ตัวเลข จุด ขีดกลาง slash และ underscore').nullable().default(null),
)

const attachmentValueSchema = z.string().trim().min(1, 'ไฟล์รูปภาพไม่ถูกต้อง').max(255, 'ชื่อไฟล์รูปภาพยาวเกินไป').regex(generalTextPattern, 'ชื่อไฟล์รูปภาพมีรูปแบบไม่ถูกต้อง')

const requiredDateTime = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'วันที่และเวลาต้องเป็นรูปแบบ YYYY-MM-DDTHH:mm')
const optionalDateTime = z.preprocess(blankToNull, requiredDateTime.nullable().default(null))
const money = (label: string) => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).min(0, `${label}ต้องไม่ติดลบ`)
const positiveMoney = (label: string) => money(label).gt(0, `${label}ต้องมากกว่า 0`)

export const supplierAdvanceTypeValues = ['WAITING_SORT', 'ADVANCE_INVOICE'] as const
export const supplierAdvanceVatTypeValues = ['NONE', 'INCLUDE'] as const

export type SupplierAdvanceType = typeof supplierAdvanceTypeValues[number]
export type SupplierAdvanceVatType = typeof supplierAdvanceVatTypeValues[number]

export function supplierAdvanceTypeLabel(value: string | null | undefined) {
  if (value === 'ADVANCE_INVOICE') return 'มัดจำล่วงหน้ายังไม่ส่งของ'
  return 'มัดจำส่งของรอคัดแยก'
}

export function supplierAdvanceVatTypeLabel(value: string | null | undefined) {
  if (value === 'INCLUDE') return 'มี VAT'
  return 'ไม่มี VAT'
}

export function calculateSupplierAdvanceTaxBreakdown(params: {
  amount: number
  vatRatePercent?: number | null
  vatType: SupplierAdvanceVatType
}) {
  const amount = Math.max(0, Number.isFinite(params.amount) ? params.amount : 0)
  const rate = Math.max(0, Math.min(100, Number(params.vatRatePercent ?? 7) || 0))
  if (params.vatType === 'NONE' || rate <= 0 || amount <= 0) {
    return {
      subtotalAmount: roundMoney(amount),
      totalAmount: roundMoney(amount),
      vatAmount: 0,
      vatRatePercent: rate,
      vatType: 'NONE' as const,
    }
  }

  const subtotalAmount = roundMoney(amount)
  const vatAmount = roundMoney(subtotalAmount * rate / 100)
  return {
    subtotalAmount,
    totalAmount: roundMoney(subtotalAmount + vatAmount),
    vatAmount,
    vatRatePercent: rate,
    vatType: 'INCLUDE' as const,
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export const supplierAdvancePaymentStatusValues = [
  'pending_approval',
  'partially_approved',
  'approved',
  'partially_paid',
  'paid',
  'partially_allocated',
  'allocated',
  'cancelled',
] as const

export const supplierAdvancePaymentFormSchema = z.object({
  advanceType: z.enum(supplierAdvanceTypeValues).default('WAITING_SORT'),
  amount: positiveMoney('ยอดมัดจำ'),
  branchId: z.string().trim().min(1, 'เลือกสาขา').max(80, 'สาขายาวเกินไป').regex(safeIdPattern, 'สาขามีรูปแบบไม่ถูกต้อง'),
  customerName: optionalBusinessText('ชื่อลูกค้า', 180),
  docNo: optionalDocNo,
  driverName: optionalBusinessText('พนักงานขับรถ', 160),
  fundingAccountId: z.preprocess(blankToNull, z.string().trim().max(80, 'บัญชีที่จ่ายยาวเกินไป').regex(safeIdPattern, 'บัญชีที่จ่ายมีรูปแบบไม่ถูกต้อง').nullable().default(null)),
  inDate: optionalDateTime,
  invoiceNo,
  largeScaleDocNo: optionalDocNo,
  netWeight: money('น้ำหนักสุทธิ'),
  outDate: optionalDateTime,
  paymentMethod: optionalBusinessText('วิธีจ่าย', 80),
  plateNo: optionalBusinessText('ทะเบียนรถ', 60),
  pricePerKg: money('ราคา/กก.'),
  productName: optionalBusinessText('ชื่อสินค้า', 180),
  remark: optionalGeneralText('หมายเหตุ', 500),
  scaleOperator: optionalBusinessText('ผู้ชั่งน้ำหนัก', 160),
  senderName: optionalBusinessText('ผู้ส่ง', 160),
  supplierId: z.string().trim().min(1, 'เลือก Supplier').max(80, 'Supplier ยาวเกินไป').regex(safeIdPattern, 'Supplier มีรูปแบบไม่ถูกต้อง'),
  vatType: z.enum(supplierAdvanceVatTypeValues).default('NONE'),
  vehiclePhotoNames: z.array(attachmentValueSchema).max(10, 'อัปโหลดรูปภาพรถได้ไม่เกิน 10 รูป').default([]),
  weightIn: money('น้ำหนักเข้า'),
  weightOut: money('น้ำหนักออก'),
}).refine((value) => {
  if (!value.inDate || !value.outDate) return true
  return new Date(`${value.outDate}:00+07:00`).getTime() >= new Date(`${value.inDate}:00+07:00`).getTime()
}, {
  message: 'วันที่ออกต้องไม่ก่อนวันที่เข้า',
  path: ['outDate'],
}).superRefine((value, ctx) => {
  if (value.advanceType === 'ADVANCE_INVOICE' && !value.invoiceNo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'กรอกเลข invoice',
      path: ['invoiceNo'],
    })
  }
})

export type SupplierAdvancePaymentFormValues = z.infer<typeof supplierAdvancePaymentFormSchema>

export const supplierAdvancePaymentCancelSchema = z.object({
  note: z.string().trim().min(1, 'กรุณาระบุเหตุผลการยกเลิก').max(1000, 'เหตุผลการยกเลิกยาวเกินไป').regex(generalTextPattern, 'เหตุผลการยกเลิกมีรูปแบบไม่ถูกต้อง'),
})

export type SupplierAdvancePaymentCancelValues = z.infer<typeof supplierAdvancePaymentCancelSchema>
