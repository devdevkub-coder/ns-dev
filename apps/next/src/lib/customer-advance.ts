import { z } from 'zod'

const blankToNull = (value: unknown) => typeof value === 'string' && value.trim() === '' ? null : value
const codePattern = /^[A-Za-z0-9_-]+$/
const documentTextPattern = /^[\p{L}\p{M}\p{N}\s.&,()/'"+#%:-]+$/u
const referencePattern = /^[A-Za-z0-9_.\/-]+$/

const requiredCode = (label: string) => z.string().trim().min(1, `เลือก${label}`).max(80, `${label}ยาวเกินไป`).regex(codePattern, `${label}มีรูปแบบไม่ถูกต้อง`)
const requiredMasterId = (label: string) => z.string().trim().regex(/^[1-9]\d*$/, `เลือก${label}`).max(20, `${label}ไม่ถูกต้อง`)
const optionalReference = (label: string) => z.preprocess(blankToNull, z.string().trim().max(80, `${label}ยาวเกินไป`).regex(referencePattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable())
const optionalText = (label: string, maximum: number) => z.preprocess(blankToNull, z.string().trim().max(maximum, `${label}ยาวเกินไป`).regex(documentTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`).nullable())
const positiveDecimal = (label: string) => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).gt(0, `${label}ต้องมากกว่า 0`).refine((value) => Number.isInteger(value * 100), `${label}ใช้ทศนิยมได้ไม่เกิน 2 ตำแหน่ง`)
const nonNegativeDecimal = (label: string) => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).finite(`${label}ต้องเป็นตัวเลข`).min(0, `${label}ต้องไม่ติดลบ`).refine((value) => Number.isInteger(value * 100), `${label}ใช้ทศนิยมได้ไม่เกิน 2 ตำแหน่ง`)

export const customerAdvanceVatTypeValues = ['NONE', 'INCLUDE'] as const
export type CustomerAdvanceVatType = typeof customerAdvanceVatTypeValues[number]

export function customerAdvanceVatTypeLabel(value: string) {
  if (value === 'INCLUDE') return 'มี VAT'
  if (value === 'NONE') return 'ไม่มี VAT'
  throw new Error(`ประเภท VAT ของ CADV ไม่ถูกต้อง: ${value}`)
}

export function roundCustomerAdvanceMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function calculateCustomerAdvanceTaxBreakdown(params: {
  amount: number
  vatRatePercent: number
  vatType: CustomerAdvanceVatType
}) {
  const subtotalAmount = roundCustomerAdvanceMoney(Math.max(0, params.amount))
  const vatRatePercent = params.vatType === 'INCLUDE'
    ? Math.max(0, Math.min(100, params.vatRatePercent))
    : 0
  const vatAmount = params.vatType === 'INCLUDE'
    ? roundCustomerAdvanceMoney(subtotalAmount * vatRatePercent / 100)
    : 0

  return {
    subtotalAmount,
    targetAmount: roundCustomerAdvanceMoney(subtotalAmount + vatAmount),
    vatAmount,
    vatRatePercent,
    vatType: params.vatType,
  }
}

export function calculateCustomerAdvancePaidBaseCapacity(params: {
  receivedGrossAmount: number
  subtotalAmount: number
  targetAmount: number
}) {
  const receivedGrossAmount = Math.max(0, Number.isFinite(params.receivedGrossAmount) ? params.receivedGrossAmount : 0)
  const subtotalAmount = Math.max(0, Number.isFinite(params.subtotalAmount) ? params.subtotalAmount : 0)
  const targetAmount = Math.max(0, Number.isFinite(params.targetAmount) ? params.targetAmount : 0)
  if (subtotalAmount <= 0 || receivedGrossAmount <= 0) return 0
  if (targetAmount <= 0) throw new Error('ยอดรวม CADV ต้องมากกว่า 0')

  return roundCustomerAdvanceMoney(Math.min(
    subtotalAmount,
    receivedGrossAmount * subtotalAmount / targetAmount,
  ))
}

export function calculateCustomerAdvanceAllocation(params: {
  availableBaseAmount: number
  billSubtotalAmount: number
  billTotalAmount: number
  billVatAmount: number
}) {
  const availableBaseAmount = Math.max(0, Number.isFinite(params.availableBaseAmount) ? params.availableBaseAmount : 0)
  const billSubtotalAmount = Math.max(0, Number.isFinite(params.billSubtotalAmount) ? params.billSubtotalAmount : 0)
  const billTotalAmount = Math.max(0, Number.isFinite(params.billTotalAmount) ? params.billTotalAmount : 0)
  const billVatAmount = Math.max(0, Number.isFinite(params.billVatAmount) ? params.billVatAmount : 0)
  const allocatedSubtotalAmount = roundCustomerAdvanceMoney(Math.min(availableBaseAmount, billSubtotalAmount))
  const billVatRatio = billSubtotalAmount > 0 ? billVatAmount / billSubtotalAmount : 0
  const allocatedVatAmount = roundCustomerAdvanceMoney(allocatedSubtotalAmount * billVatRatio)
  const allocatedTotalAmount = roundCustomerAdvanceMoney(Math.min(
    billTotalAmount,
    allocatedSubtotalAmount + allocatedVatAmount,
  ))

  return {
    allocatedAmount: allocatedSubtotalAmount,
    allocatedSubtotalAmount,
    allocatedTotalAmount,
    allocatedVatAmount,
    remainingBaseAmount: roundCustomerAdvanceMoney(Math.max(0, availableBaseAmount - allocatedSubtotalAmount)),
  }
}

export function calculateSalesBillPostCustomerAdvanceTotals(params: {
  advanceBaseAllocatedAmount: number
  discountAmount?: number
  hasVat: boolean
  subtotalAmount: number
  vatRatePercent: number
  vatType?: 'NONE' | 'EXCLUDE' | 'INCLUDE' | string | null
}) {
  const subtotalAmount = Math.max(0, roundCustomerAdvanceMoney(params.subtotalAmount))
  const discountAmount = Math.max(0, roundCustomerAdvanceMoney(params.discountAmount ?? 0))
  const advanceBaseAllocatedAmount = Math.max(0, roundCustomerAdvanceMoney(params.advanceBaseAllocatedAmount))
  const vatRatePercent = Math.max(0, Math.min(100, Number(params.vatRatePercent) || 0))
  const vatType = params.vatType ?? (params.hasVat ? 'EXCLUDE' : 'NONE')
  const afterDiscountAmount = Math.max(0, roundCustomerAdvanceMoney(subtotalAmount - discountAmount))
  const hasVat = Boolean(params.hasVat) && vatType !== 'NONE' && vatRatePercent > 0
  const vatBeforeAdvance = hasVat
    ? vatType === 'INCLUDE'
      ? roundCustomerAdvanceMoney(afterDiscountAmount * vatRatePercent / (100 + vatRatePercent))
      : roundCustomerAdvanceMoney(afterDiscountAmount * vatRatePercent / 100)
    : 0
  const taxableBaseBeforeAdvance = hasVat && vatType === 'INCLUDE'
    ? Math.max(0, roundCustomerAdvanceMoney(afterDiscountAmount - vatBeforeAdvance))
    : afterDiscountAmount
  const taxableBaseAmount = Math.max(0, roundCustomerAdvanceMoney(taxableBaseBeforeAdvance - advanceBaseAllocatedAmount))
  const vatAmount = hasVat
    ? roundCustomerAdvanceMoney(taxableBaseAmount * vatRatePercent / 100)
    : 0
  const totalAmount = hasVat
    ? roundCustomerAdvanceMoney(taxableBaseAmount + vatAmount)
    : taxableBaseAmount

  return {
    advanceBaseAppliedAmount: Math.min(advanceBaseAllocatedAmount, taxableBaseBeforeAdvance),
    afterDiscountAmount,
    taxableBaseAmount,
    totalAmount,
    vatAmount,
    vatBeforeAdvance,
  }
}

export const customerAdvanceFormSchema = z.object({
  amount: positiveDecimal('ยอดเงินล่วงหน้าที่ต้องรับ'),
  branchId: requiredCode('สาขา'),
  contractNo: optionalReference('เลขที่ Contract'),
  currencyCode: requiredCode('สกุลเงิน'),
  customerId: requiredMasterId('ลูกค้า'),
  documentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่เอกสารต้องเป็นรูปแบบ YYYY-MM-DD'),
  invoiceNo: optionalReference('เลขที่ Invoice'),
  lines: z.array(z.object({
    grossWeight: nonNegativeDecimal('น้ำหนักรวม'),
    netWeight: nonNegativeDecimal('น้ำหนักสุทธิ'),
    productId: requiredMasterId('สินค้า'),
    quantity: positiveDecimal('จำนวน'),
  })).min(1, 'ต้องมีรายการสินค้าอย่างน้อย 1 รายการ').max(100, 'รายการสินค้าเกิน 100 รายการ'),
  remark: optionalText('หมายเหตุ', 500),
  vatType: z.enum(customerAdvanceVatTypeValues),
}).superRefine((value, context) => {
  const productIds = new Set<string>()
  value.lines.forEach((line, index) => {
    if (line.netWeight > line.grossWeight) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'น้ำหนักสุทธิต้องไม่เกินน้ำหนักรวม', path: ['lines', index, 'netWeight'] })
    }
    if (productIds.has(line.productId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'สินค้าในรายการซ้ำกัน', path: ['lines', index, 'productId'] })
    }
    productIds.add(line.productId)
  })
})

export type CustomerAdvanceFormValues = z.infer<typeof customerAdvanceFormSchema>
