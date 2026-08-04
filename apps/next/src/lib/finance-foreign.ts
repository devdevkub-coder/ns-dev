import { z } from 'zod'
import { FINANCE_MONEY_POLICY, roundFinanceFxRate } from '@/lib/finance-money'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const currencyPattern = /^[A-Z0-9]{3,6}$/
const rateTypePattern = /^[\p{L}\p{M}\p{N}\s./_-]+$/u
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u

const requiredCurrency = (label: string) => z.string()
  .trim()
  .min(1, `${label}จำเป็น`)
  .max(6, `${label}ยาวเกินไป`)
  .transform((value) => value.toUpperCase())
  .refine((value) => currencyPattern.test(value), `${label}ใช้ได้เฉพาะรหัสสกุลเงิน`)

const optionalText = (label: string, maxLength = 160) => z.preprocess(
  blankToNull,
  z.string()
    .trim()
    .max(maxLength, `${label}ยาวเกินไป`)
    .regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`)
    .nullable()
    .default(null),
)

export const fxRateFormSchema = z.object({
  active: z.boolean().default(true),
  fromCurrency: requiredCurrency('สกุลต้นทาง'),
  id: z.preprocess(blankToNull, z.string().trim().max(80, 'รหัสยาวเกินไป').nullable().default(null)),
  note: optionalText('หมายเหตุ', 500),
  rate: z.coerce.number({ invalid_type_error: 'Rate ต้องเป็นตัวเลข' })
    .finite('Rate ต้องเป็นตัวเลข')
    .gt(0, 'Rate ต้องมากกว่า 0')
    .refine((value) => roundFinanceFxRate(value) === value, `Rate ใช้ทศนิยมได้ไม่เกิน ${FINANCE_MONEY_POLICY.fxRateScale} ตำแหน่ง`),
  rateDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  rateType: z.string().trim().min(1, 'ประเภท Rate จำเป็น').max(60, 'ประเภท Rate ยาวเกินไป').regex(rateTypePattern, 'ประเภท Rate มีรูปแบบไม่ถูกต้อง').default('BOT Rate'),
  source: optionalText('แหล่งที่มา', 120),
  toCurrency: requiredCurrency('สกุลปลายทาง').default('THB'),
}).refine((value) => value.fromCurrency !== value.toCurrency, {
  message: 'สกุลต้นทางและปลายทางต้องไม่ซ้ำกัน',
  path: ['toCurrency'],
})

export type FxRateFormValues = z.infer<typeof fxRateFormSchema>

const optionalDocText = (label: string, maxLength = 120) => z.preprocess(
  blankToNull,
  z.string()
    .trim()
    .max(maxLength, `${label}ยาวเกินไป`)
    .regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`)
    .nullable()
    .default(null),
)

const positiveMoney = (label: string) => z.coerce
  .number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` })
  .finite(`${label}ต้องเป็นตัวเลข`)
  .gt(0, `${label}ต้องมากกว่า 0`)

const nonNegativeMoney = (label: string) => z.coerce
  .number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` })
  .finite(`${label}ต้องเป็นตัวเลข`)
  .min(0, `${label}ต้องไม่ติดลบ`)

export const intlTransferPreviewSchema = z.object({
  amountSourceCcy: positiveMoney('จำนวนโอน'),
  bankFeeDest: nonNegativeMoney('Receiving Bank Fee').default(0),
  bankFeeSource: nonNegativeMoney('Bank Fee').default(0),
  beneficiaryId: z.string().trim().min(1, 'ผู้รับจำเป็น'),
  chargeBearer: z.enum(['OUR', 'SHA', 'BEN']),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  destCurrency: requiredCurrency('สกุลปลายทาง'),
  expectedValueDate: optionalDocText('Value Date', 20),
  fromAccountId: z.string().trim().min(1, 'บัญชีต้นทางจำเป็น'),
  fxRate: positiveMoney('FX Rate'),
  intermediaryFee: nonNegativeMoney('Intermediary Fee').default(0),
  notes: optionalDocText('หมายเหตุ', 500),
  purposeId: optionalDocText('วัตถุประสงค์', 80),
  sourceCurrency: requiredCurrency('สกุลต้นทาง'),
  swiftRef: optionalDocText('SWIFT Reference', 80),
  transferType: z.string().trim().min(1, 'ประเภทจำเป็น').max(80, 'ประเภทยาวเกินไป'),
})

export const overseasReceiptPreviewSchema = z.object({
  bankFeeForeign: nonNegativeMoney('Bank Fee').default(0),
  billId: optionalDocText('บิลขาย', 80),
  chargeBearer: z.enum(['OUR', 'SHA', 'BEN']),
  customerId: z.string().trim().min(1, 'Customer จำเป็น'),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  fxRate: positiveMoney('FX Rate'),
  invoiceAmountForeign: nonNegativeMoney('ยอดตาม invoice').default(0),
  invoiceCurrency: requiredCurrency('สกุล invoice'),
  notes: optionalDocText('หมายเหตุ', 500),
  payerCountry: optionalDocText('ประเทศต้นทาง', 80),
  receivedAccountId: z.string().trim().min(1, 'บัญชีรับเงินจำเป็น'),
  receivedAmountForeign: positiveMoney('ยอดรับ'),
  receivedCurrency: requiredCurrency('สกุลที่รับ'),
  swiftRef: optionalDocText('SWIFT Reference', 80),
  valueDate: optionalDocText('Value Date', 20),
})

export type IntlTransferPreviewValues = z.infer<typeof intlTransferPreviewSchema>
export type OverseasReceiptPreviewValues = z.infer<typeof overseasReceiptPreviewSchema>
