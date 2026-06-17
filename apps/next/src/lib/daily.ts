import { z } from 'zod'
import { ApiError } from '@/lib/api-client'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const businessTextPattern = /^[\p{L}\p{M}\p{N}\s.&,()/'"+#%:-]+$/u
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u
const docNoPattern = /^[A-Za-z0-9_/-]+$/

const optionalDocNo = z.preprocess(
  blankToNull,
  z.string().trim().max(40, 'เลขที่เอกสารยาวเกินไป').regex(docNoPattern, 'เลขที่เอกสารใช้ได้เฉพาะอังกฤษ ตัวเลข / ขีดกลาง และ underscore').nullable().default(null),
)

const requiredDocNo = (label: string) => z.string()
  .trim()
  .min(1, `เลือก${label}`)
  .max(40, `${label}ยาวเกินไป`)
  .regex(docNoPattern, `${label}ใช้ได้เฉพาะอังกฤษ ตัวเลข / ขีดกลาง และ underscore`)

const optionalBusinessText = (label: string, maxLength = 180) => z.preprocess(
  blankToNull,
  z.string().trim().max(maxLength, `${label}ยาวเกินไป`).regex(businessTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)

const optionalGeneralText = (label: string, maxLength = 500) => z.preprocess(
  blankToNull,
  z.string().trim().max(maxLength, `${label}ยาวเกินไป`).regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)

const optionalSafeId = (label: string) => z.preprocess(
  blankToNull,
  z.string().trim().max(80, `${label}ยาวเกินไป`).regex(/^[A-Za-z0-9_.:-]+$/, `${label}มีรูปแบบไม่ถูกต้อง`).nullable().default(null),
)

const requiredDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD')
const money = (label: string) => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).min(0, `${label}ต้องไม่ติดลบ`)
const positiveMoney = (label: string) => money(label).gt(0, `${label}ต้องมากกว่า 0`)

export const transferFormSchema = z.object({
  id: optionalSafeId('รหัสรายการ'),
  docNo: optionalDocNo,
  date: requiredDate,
  fromAccountId: z.string().trim().min(1, 'เลือกบัญชีต้นทาง'),
  toAccountId: z.string().trim().min(1, 'เลือกบัญชีปลายทาง'),
  amount: positiveMoney('จำนวนเงิน'),
  fee: money('ค่าธรรมเนียม').default(0),
  byPerson: optionalBusinessText('ผู้ทำรายการ', 160),
  notes: optionalGeneralText('หมายเหตุ', 500),
}).refine((value) => value.fromAccountId !== value.toAccountId, {
  message: 'บัญชีต้นทางและปลายทางต้องไม่ซ้ำกัน',
  path: ['toAccountId'],
})

export type TransferFormValues = z.infer<typeof transferFormSchema>

export const expenseLineFormSchema = z.object({
  id: optionalSafeId('รหัสบรรทัดค่าใช้จ่าย'),
  categoryId: optionalSafeId('หมวดค่าใช้จ่าย'),
  description: optionalGeneralText('รายละเอียด', 500),
  amount: positiveMoney('จำนวน'),
  hasVat: z.boolean().default(false),
  vatAmount: money('VAT').default(0),
  whtPct: z.coerce.number({ invalid_type_error: 'WHT % ต้องเป็นตัวเลข' }).finite('WHT % ต้องเป็นตัวเลข').min(0, 'WHT % ต้องไม่ติดลบ').max(100, 'WHT % ต้องไม่เกิน 100').default(0),
  whtAmount: money('ภาษีหัก ณ ที่จ่าย').default(0),
})

export const expenseFormSchema = z.object({
  id: optionalSafeId('รหัสรายการ'),
  docNo: optionalDocNo,
  date: requiredDate,
  dueDate: z.preprocess(blankToNull, requiredDate.nullable().default(null)),
  refDocNo: optionalDocNo,
  categoryId: optionalSafeId('หมวดค่าใช้จ่าย'),
  supplierId: z.string().trim().min(1, 'เลือกผู้รับเงิน').max(80, 'ผู้รับเงินยาวเกินไป').regex(/^[A-Za-z0-9_.:-]+$/, 'ผู้รับเงินมีรูปแบบไม่ถูกต้อง'),
  payee: z.string().trim().min(1, 'กรอกผู้รับเงิน').max(180, 'ผู้รับเงินยาวเกินไป').regex(businessTextPattern, 'ผู้รับเงินมีรูปแบบไม่ถูกต้อง'),
  description: optionalGeneralText('รายละเอียด', 500),
  amount: money('ยอดก่อน VAT').default(0),
  hasVat: z.boolean().default(false),
  hasWht: z.boolean().default(false),
  accountId: optionalSafeId('บัญชีจ่าย'),
  bankFee: money('Bank fee').default(0),
  branchId: optionalSafeId('สาขา'),
  discount: money('ส่วนลด').default(0),
  paymentAction: z.enum(['submit_approval', 'pay_now']).default('submit_approval'),
  supplierPaymentDestinationId: optionalSafeId('ช่องทางรับเงิน Supplier'),
  taxInvoiceNo: optionalDocNo,
  status: z.enum(['pending_approval', 'approved', 'paid', 'cancelled']).default('pending_approval'),
  notes: optionalGeneralText('หมายเหตุ', 500),
  lines: z.array(expenseLineFormSchema).min(1, 'เพิ่มรายการค่าใช้จ่ายอย่างน้อย 1 รายการ').max(50, 'รายการค่าใช้จ่ายมากเกินไป').optional(),
}).superRefine((value, context) => {
  if ((!value.lines || value.lines.length === 0) && value.amount <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'ยอดก่อน VAT ต้องมากกว่า 0',
      path: ['amount'],
    })
  }
  if (value.paymentAction === 'pay_now') {
    if (!value.accountId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'เลือกบัญชีที่จ่ายของบริษัท',
        path: ['accountId'],
      })
    }
    if (!value.supplierPaymentDestinationId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'เลือกช่องทางรับเงินของ Supplier',
        path: ['supplierPaymentDestinationId'],
      })
    }
  }
}).refine((value) => value.status !== 'paid' || value.paymentAction === 'pay_now' || Boolean(value.accountId), {
  message: 'เลือกบัญชีจ่ายเมื่อสถานะเป็นจ่ายแล้ว',
  path: ['accountId'],
})

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>
export type ExpenseLineFormValues = z.infer<typeof expenseLineFormSchema>

export const pettyAdvanceFormSchema = z.object({
  id: optionalSafeId('รหัสรายการ'),
  docNo: optionalDocNo,
  date: requiredDate,
  type: z.enum(['DIRECTOR_LOAN', 'PETTY_CASH'], { errorMap: () => ({ message: 'ประเภทไม่ถูกต้อง' }) }),
  recipientId: z.string().trim().min(1, 'เลือกผู้รับเงินจากรายชื่อกรรมการ/พนักงาน').max(80, 'ผู้รับเงินยาวเกินไป').regex(/^[A-Za-z0-9_.:-]+$/, 'ผู้รับเงินมีรูปแบบไม่ถูกต้อง'),
  recipientName: z.string().trim().min(1, 'เลือกผู้รับเงิน').max(180, 'ผู้รับเงินยาวเกินไป').regex(businessTextPattern, 'ผู้รับเงินมีรูปแบบไม่ถูกต้อง'),
  amount: positiveMoney('จำนวนเงิน'),
  accountId: optionalSafeId('บัญชีจ่าย'),
  status: z.enum(['active', 'closed', 'cancelled']).default('active'),
  notes: optionalGeneralText('หมายเหตุ', 500),
})

export type PettyAdvanceFormValues = z.infer<typeof pettyAdvanceFormSchema>

export const pettyAdvanceReturnFormSchema = z.object({
  advanceId: z.string().trim().min(1, 'ไม่พบรายการเงินสำรอง'),
  date: requiredDate,
  amount: positiveMoney('จำนวนเงินคืน'),
  accountId: z.string().trim().min(1, 'เลือกบัญชีรับคืน'),
  notes: optionalGeneralText('หมายเหตุ', 500),
})

export type PettyAdvanceReturnFormValues = z.infer<typeof pettyAdvanceReturnFormSchema>

const supplierPaymentLineSchema = z.object({
  approvalId: optionalDocNo,
  amount: positiveMoney('ยอดจ่าย'),
  billId: requiredDocNo('เอกสารต้นทาง'),
  discount: money('ส่วนลด').default(0),
  fee: money('ค่าธรรมเนียม').default(0),
  id: optionalSafeId('รหัสบรรทัดจ่าย'),
  supplierId: z.string().trim().min(1, 'เลือกผู้รับเงิน'),
  withholdingTax: money('ภาษีหัก ณ ที่จ่าย').default(0),
})

export const supplierPaymentFormSchema = z.object({
  id: optionalSafeId('รหัสรายการ'),
  docNo: optionalDocNo,
  date: requiredDate,
  billId: requiredDocNo('เอกสารต้นทาง'),
  supplierId: z.string().trim().min(1, 'เลือกผู้รับเงิน'),
  accountId: z.string().trim().min(1, 'เลือกบัญชีจ่าย'),
  amount: positiveMoney('ยอดจ่าย'),
  withholdingTax: money('ภาษีหัก ณ ที่จ่าย').default(0),
  discount: money('ส่วนลด').default(0),
  fee: money('ค่าธรรมเนียม').default(0),
  method: z.string().trim().min(1, 'เลือกวิธีจ่าย').max(80, 'วิธีจ่ายยาวเกินไป').regex(businessTextPattern, 'วิธีจ่ายมีรูปแบบไม่ถูกต้อง'),
  notes: optionalGeneralText('หมายเหตุ', 500),
  lines: z.array(supplierPaymentLineSchema).optional(),
  splits: z.array(z.object({
    accountId: z.string().trim().min(1, 'เลือกบัญชีจ่าย').max(80, 'บัญชีจ่ายยาวเกินไป').regex(/^[A-Za-z0-9_.:-]+$/, 'บัญชีจ่ายมีรูปแบบไม่ถูกต้อง'),
    amount: positiveMoney('ยอดแยกบัญชี'),
    id: optionalSafeId('รหัสแยกบัญชี'),
  })).min(1, 'เลือกบัญชีจ่ายอย่างน้อย 1 รายการ'),
})

export type SupplierPaymentFormValues = z.infer<typeof supplierPaymentFormSchema>

export const customerReceiptLineFormSchema = z.object({
  id: optionalSafeId('รหัสบรรทัดรับเงิน'),
  salesBillDocNo: requiredDocNo('บิลขาย'),
  receiptAmount: positiveMoney('ยอดรับ'),
  withholdingTaxAmount: money('ภาษีหัก ณ ที่จ่าย').default(0),
  discountAmount: money('ส่วนลด').default(0),
})

export const customerReceiptFormSchema = z.object({
  id: optionalSafeId('รหัสรายการ'),
  docNo: optionalDocNo,
  date: requiredDate,
  billId: optionalSafeId('บิลขาย'),
  customerId: z.string().trim().min(1, 'เลือกลูกค้า'),
  accountId: z.string().trim().min(1, 'เลือกบัญชีรับเงิน'),
  amount: positiveMoney('ยอดรับ'),
  withholdingTax: money('ภาษีหัก ณ ที่จ่าย').default(0),
  discount: money('ส่วนลด').default(0),
  fee: money('ค่าธรรมเนียม').default(0),
  method: z.string().trim().min(1, 'เลือกวิธีรับเงิน').max(80, 'วิธีรับเงินยาวเกินไป').regex(businessTextPattern, 'วิธีรับเงินมีรูปแบบไม่ถูกต้อง'),
  notes: optionalGeneralText('หมายเหตุ', 500),
  lines: z.array(customerReceiptLineFormSchema).optional(),
  splits: z.array(z.object({
    accountId: z.string().trim().min(1, 'เลือกบัญชีรับเงิน').max(80, 'บัญชีรับเงินยาวเกินไป').regex(/^[A-Za-z0-9_.:-]+$/, 'บัญชีรับเงินมีรูปแบบไม่ถูกต้อง'),
    amount: positiveMoney('ยอดแยกบัญชีรับเงิน'),
    id: optionalSafeId('รหัสแยกบัญชีรับเงิน'),
  })).min(1, 'เลือกบัญชีรับเงินอย่างน้อย 1 รายการ').optional(),
}).superRefine((value, context) => {
  if (value.lines && value.lines.length > 0) return
  if (!value.billId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'เลือกบิลขายอย่างน้อย 1 รายการ',
      path: ['billId'],
    })
  }
})

export type CustomerReceiptFormValues = z.infer<typeof customerReceiptFormSchema>

export const stockTransferFormSchema = z.object({
  date: requiredDate,
  docNo: optionalDocNo,
  fromBranchId: z.string().trim().min(1, 'เลือกสาขาต้นทาง'),
  fromWarehouseId: z.string().trim().min(1, 'เลือกคลังต้นทาง'),
  toBranchId: z.string().trim().min(1, 'เลือกสาขาปลายทาง'),
  toWarehouseId: z.string().trim().min(1, 'เลือกคลังปลายทาง'),
  notes: optionalGeneralText('หมายเหตุ', 500),
  submitMode: z.enum(['draft', 'post']).default('post'),
  items: z.array(z.object({
    productId: z.string().trim().min(1, 'เลือกสินค้า'),
    qty: positiveMoney('น้ำหนัก'),
  })).min(1, 'เพิ่มรายการสินค้าอย่างน้อย 1 รายการ'),
}).refine((value) => value.fromBranchId !== value.toBranchId || value.fromWarehouseId !== value.toWarehouseId, {
  message: 'ต้นทางและปลายทางต้องไม่เหมือนกัน',
  path: ['toWarehouseId'],
})

export type StockTransferFormValues = z.infer<typeof stockTransferFormSchema>

export type DailyAccountOption = {
  active: boolean
  balance?: number
  code: string | null
  id: string
  name: string
  type: string
}

export async function dailyFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(payload?.error ?? 'โหลดหรือบันทึกข้อมูลไม่สำเร็จ', {
      code: payload?.code,
      fieldErrors: payload?.fieldErrors,
      status: response.status,
    })
  }

  return payload as T
}

export function formatMoney(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

export function todayDateInput() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(new Date())
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${valueByType.year}-${valueByType.month}-${valueByType.day}`
}
