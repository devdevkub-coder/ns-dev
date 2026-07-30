import { z } from 'zod'
import { FINANCE_MONEY_POLICY } from '@/lib/finance-money'

const date = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD')
const accountCode = z.string().trim().min(1, 'ต้องเลือกบัญชี').max(80, 'รหัสบัญชียาวเกินไป').transform((value) => value.toUpperCase())
const currencyCode = z.string().trim().regex(/^[A-Za-z0-9]{3,6}$/, 'รหัสสกุลเงินไม่ถูกต้อง').transform((value) => value.toUpperCase())
const idempotencyKey = z.string().trim().uuid('idempotency key ไม่ถูกต้อง')
const money = (label: string, minimum: number) => z.coerce.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` })
  .finite(`${label}ต้องเป็นตัวเลข`)
  .min(minimum, `${label}${minimum === 0 ? 'ต้องไม่ติดลบ' : 'ต้องมากกว่า 0'}`)
  .refine((value) => Number(value.toFixed(FINANCE_MONEY_POLICY.calculationScale)) === value, `${label}ใช้ทศนิยมได้ไม่เกิน 2 ตำแหน่ง`)
const fxRate = z.coerce.number({ invalid_type_error: 'อัตราแลกเปลี่ยนต้องเป็นตัวเลข' })
  .finite('อัตราแลกเปลี่ยนต้องเป็นตัวเลข')
  .gt(0, 'อัตราแลกเปลี่ยนต้องมากกว่า 0')
  .refine((value) => Number(value.toFixed(FINANCE_MONEY_POLICY.fxRateScale)) === value, 'อัตราแลกเปลี่ยนใช้ทศนิยมได้ไม่เกิน 3 ตำแหน่ง')
const optionalText = (label: string, maxLength: number) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(maxLength, `${label}ยาวเกินไป`).nullable().optional(),
)

export const fcdConversionPostSchema = z.object({
  actualThbReceived: money('ยอดเงินบาทที่ได้รับจริง', 0.01),
  bankFeeThb: money('ค่าธรรมเนียมธนาคาร', 0).default(0),
  bankReference: optionalText('เลขอ้างอิงธนาคาร', 120),
  branchCode: z.string().trim().min(1, 'ต้องเลือกสาขา').max(40, 'รหัสสาขายาวเกินไป').transform((value) => value.toUpperCase()),
  conversionDate: date,
  destinationAccountCode: accountCode,
  idempotencyKey,
  nativeAmount: money('ยอดเงินต่างประเทศที่แลก', 0.01),
  sourceAccountCode: accountCode,
  sourceCurrencyCode: currencyCode,
})

export const fcdConversionReverseSchema = z.object({
  conversionDate: date,
  idempotencyKey,
  originalDocNo: z.string().trim().min(1, 'ต้องระบุเลขที่เอกสารเดิม').max(80, 'เลขที่เอกสารยาวเกินไป').transform((value) => value.toUpperCase()),
})

export const fcdRevaluationPostSchema = z.object({
  accountCode,
  branchCode: z.string().trim().min(1, 'ต้องเลือกสาขา').max(40, 'รหัสสาขายาวเกินไป').transform((value) => value.toUpperCase()),
  closingFxRate: fxRate,
  currencyCode,
  idempotencyKey,
  periodEnd: date,
  rateOverrideReason: optionalText('เหตุผลการกำหนดอัตราเอง', 500),
  rateType: z.string().trim().min(1, 'ต้องเลือกประเภทอัตราแลกเปลี่ยน').max(60, 'ประเภทอัตรายาวเกินไป'),
})

export const fcdRevaluationReverseSchema = z.object({
  idempotencyKey,
  originalDocNo: z.string().trim().min(1, 'ต้องระบุเลขที่เอกสารเดิม').max(80, 'เลขที่เอกสารยาวเกินไป').transform((value) => value.toUpperCase()),
  reversalDate: date,
})
