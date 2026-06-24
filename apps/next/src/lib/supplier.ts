import { z } from 'zod'
import { paymentMethodGroupFromRecord, paymentMethodGroupFromValue, type PaymentMethodGroup } from '@/lib/account-payment-method'
import type { MasterDataRecord } from '@/lib/master-data'
import { readBlobResponse, readJsonResponse } from '@/lib/api-client'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const businessTextPattern = /^[\p{L}\p{M}\p{N}\s.&,()/'"-]+$/u
const compactDigits = (value: string) => value.replace(/\D/g, '')
const stripCashMarker = (value: string | null | undefined) => value?.replace(/เงินสด/g, '').trim() || null
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u
const personNamePattern = /^[\p{L}\p{M}.' -]+$/u
const accountNoPattern = /^\d{2,40}$/
const internationalPostalCodePattern = /^[A-Za-z0-9][A-Za-z0-9\s-]{0,31}$/

export type SupplierPaymentMethod = string
export type SupplierPaymentMethodRecord = Pick<MasterDataRecord, 'name' | 'type'>

function normalizedPaymentMethodText(value: string | null | undefined) {
  return String(value ?? '').trim()
}

export function legacySupplierPaymentMethodGroup(value: string | null | undefined): PaymentMethodGroup | null {
  const normalized = normalizedPaymentMethodText(value)
  if (!normalized) return null
  const lower = normalized.toLowerCase()
  if (normalized.includes('เงินสด') || lower.includes('cash')) return 'cash'
  if (
    normalized.includes('เงินโอน')
    || normalized.includes('โอนเงิน')
    || normalized.includes('พร้อมเพย์')
    || normalized.includes('เช็ค')
    || lower.includes('bank transfer')
    || lower.includes('promptpay')
    || lower.includes('cheque')
    || lower.includes('check')
  ) {
    return 'bank'
  }
  return null
}

export function defaultSupplierPaymentMethodName(
  paymentMethods: SupplierPaymentMethodRecord[],
  group: PaymentMethodGroup,
) {
  const methodsInGroup = paymentMethods.filter((method) => paymentMethodGroupFromRecord(method) === group)
  if (!methodsInGroup.length) return null

  const preferred = methodsInGroup.find((method) => legacySupplierPaymentMethodGroup(method.name) === group)
  return preferred?.name ?? methodsInGroup[0]?.name ?? null
}

export function resolveSupplierPaymentMethodName(
  value: string | null | undefined,
  paymentMethods: SupplierPaymentMethodRecord[],
) {
  const normalized = normalizedPaymentMethodText(value)
  if (!normalized) return null

  const exactMatch = paymentMethods.find((method) => method.name === normalized)
  if (exactMatch) return exactMatch.name

  const legacyGroup = legacySupplierPaymentMethodGroup(normalized)
  return legacyGroup ? defaultSupplierPaymentMethodName(paymentMethods, legacyGroup) : null
}

export function supplierPaymentMethodGroup(
  value: string | null | undefined,
  paymentMethods: SupplierPaymentMethodRecord[],
) {
  const exactGroup = paymentMethodGroupFromValue(value, paymentMethods)
  if (exactGroup) return exactGroup

  const resolvedName = resolveSupplierPaymentMethodName(value, paymentMethods)
  if (resolvedName) return paymentMethodGroupFromValue(resolvedName, paymentMethods)

  return legacySupplierPaymentMethodGroup(value)
}

const optionalBusinessText = (label: string, maxLength = 160) => z.preprocess(
  blankToNull,
  z.string().trim()
    .max(maxLength, `${label}ยาวเกินไป`)
    .regex(businessTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`)
    .nullable()
    .default(null),
)

const optionalGeneralText = (label: string, maxLength = 255) => z.preprocess(
  blankToNull,
  z.string().trim()
    .max(maxLength, `${label}ยาวเกินไป`)
    .regex(generalTextPattern, `${label}มีรูปแบบไม่ถูกต้อง`)
    .nullable()
    .default(null),
)

const optionalPersonName = (label: string) => z.preprocess(
  blankToNull,
  z.string().trim()
    .max(80, `${label}ยาวเกินไป`)
    .regex(personNamePattern, `${label}ใช้ได้เฉพาะตัวอักษร ช่องว่าง จุด ขีด และ apostrophe`)
    .nullable()
    .default(null),
)

const optionalTaxIdSchema = z.preprocess(
  blankToNull,
  z.string().trim()
    .regex(/^\d{13}$/, 'เลขผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก')
    .nullable()
    .default(null),
)

const optionalPostalCodeSchema = z.preprocess(
  blankToNull,
  z.string().trim()
    .regex(/^\d{5}$/, 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก')
    .nullable()
    .default(null),
)

const optionalCountryCodeSchema = z.preprocess(
  (value) => {
    const normalized = blankToNull(value)
    return typeof normalized === 'string' ? normalized.trim().toUpperCase() : normalized
  },
  z.string()
    .regex(/^[A-Z]{2}$/, 'รหัสประเทศต้องเป็น ISO 3166-1 alpha-2 เช่น TH, JP, US')
    .nullable()
    .default(null),
)

const optionalInternationalPostalCodeSchema = z.preprocess(
  blankToNull,
  z.string().trim()
    .max(32, 'รหัสไปรษณีย์สากลยาวเกินไป')
    .regex(internationalPostalCodePattern, 'รหัสไปรษณีย์สากลใช้ได้เฉพาะตัวอักษร ตัวเลข ช่องว่าง และขีด')
    .nullable()
    .default(null),
)

const optionalMooSchema = z.preprocess(
  blankToNull,
  z.string().trim()
    .regex(/^\d{1,3}[A-Za-z]?$/, 'หมู่ต้องเป็นตัวเลข 1-3 หลัก')
    .nullable()
    .default(null),
)

const optionalAccountNoSchema = z.preprocess(
  (value) => {
    const normalized = blankToNull(value)
    return typeof normalized === 'string' ? normalized.replace(/\D/g, '') : normalized
  },
  z.string().trim()
    .max(40, 'เลขบัญชียาวเกินไป')
    .regex(accountNoPattern, 'เลขบัญชีใช้ได้เฉพาะตัวเลข')
    .nullable()
    .default(null),
)

const supplierPaymentMethodSchema = z.preprocess(
  blankToNull,
  z.string({ required_error: 'เลือกวิธีจ่าย/รับเงิน' })
    .trim()
    .min(1, 'เลือกวิธีจ่าย/รับเงิน'),
)

export const supplierBankAccountSchema = z.object({
  id: z.preprocess(blankToNull, z.string().trim().max(80, 'รหัสบัญชียาวเกินไป').nullable().default(null)),
  paymentMethod: supplierPaymentMethodSchema,
  bankName: optionalGeneralText('ธนาคารรับเงิน', 120),
  accountNo: optionalAccountNoSchema,
  bankAccount: optionalGeneralText('ชื่อบัญชีรับเงิน', 160),
  branchCode: optionalGeneralText('รหัสสาขา', 80),
  isPrimary: z.boolean().default(false),
  active: z.boolean().default(true),
})

const optionalPhoneSchema = z.preprocess(
  blankToNull,
  z.string().trim()
    .regex(/^\+?[0-9][0-9\s().-]{7,24}$/, 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง')
    .refine((value) => {
      const digits = compactDigits(value)
      return digits.length >= 9 && digits.length <= 15
    }, 'เบอร์โทรศัพท์ต้องมีตัวเลข 9-15 หลัก')
    .nullable()
    .default(null),
)

export const supplierSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  nameTitle: z.string().nullable().default(null),
  firstName: z.string().nullable().default(null),
  lastName: z.string().nullable().default(null),
  type: z.enum(['บุคคล', 'นิติบุคคล']).default('บุคคล'),
  marketScope: z.enum(['ในประเทศ', 'ต่างประเทศ']).default('ในประเทศ'),
  taxId: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
  addressNo: z.string().nullable().default(null),
  addressMoo: z.string().nullable().default(null),
  addressVillage: z.string().nullable().default(null),
  addressRoad: z.string().nullable().default(null),
  addressSubdistrict: z.string().nullable().default(null),
  addressDistrict: z.string().nullable().default(null),
  addressProvince: z.string().nullable().default(null),
  addressPostalCode: z.string().nullable().default(null),
  addressCountry: z.string().nullable().default(null),
  countryCode: z.string().nullable().default(null),
  addressLine1: z.string().nullable().default(null),
  addressLine2: z.string().nullable().default(null),
  addressCity: z.string().nullable().default(null),
  addressStateRegion: z.string().nullable().default(null),
  addressPostalCodeIntl: z.string().nullable().default(null),
  bankName: z.string().nullable().default(null),
  accountNo: z.string().nullable().default(null),
  bankAccount: z.string().nullable().default(null),
  bankAccounts: z.array(supplierBankAccountSchema).default([]),
  branchId: z.string().nullable().default(null),
  branchName: z.string().nullable().default(null),
  branchIds: z.array(z.string()).default([]),
  branchNames: z.array(z.string()).default([]),
  primaryBranchId: z.string().nullable().default(null),
  primaryBranchName: z.string().nullable().default(null),
  salesId: z.string().nullable().default(null),
  salesName: z.string().nullable().default(null),
  active: z.boolean().default(true),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
})

export const supplierListSchema = z.array(supplierSchema)
export const supplierListResultSchema = z.object({
  rows: supplierListSchema,
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(1),
})
export const supplierImportResultSchema = z.object({
  inserted: z.number().int().min(0),
  totalRows: z.number().int().min(0),
  updated: z.number().int().min(0),
})
export type Supplier = z.infer<typeof supplierSchema>
export type SupplierImportResult = z.infer<typeof supplierImportResultSchema>
export type SupplierListResult = z.infer<typeof supplierListResultSchema>

export type SupplierListOptions = {
  active?: string
  all?: boolean
  direction?: 'asc' | 'desc'
  marketScope?: string
  page?: number
  pageSize?: number
  q?: string
  salesId?: string
  sort?: string
  supplierType?: string
}

export const supplierFormSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]+$/, 'รหัสผู้ขายมีรูปแบบไม่ถูกต้อง').optional(),
  code: z.preprocess(blankToNull, z.string().trim().regex(/^[A-Za-z0-9_-]+$/, 'รหัสผู้ขายมีรูปแบบไม่ถูกต้อง').nullable().default(null)),
  name: optionalBusinessText('ชื่อผู้ขาย'),
  nameTitle: optionalPersonName('คำนำหน้าชื่อ'),
  firstName: optionalPersonName('ชื่อ'),
  lastName: optionalPersonName('นามสกุล'),
  type: z.enum(['บุคคล', 'นิติบุคคล'], { required_error: 'เลือกประเภทผู้ขาย' }),
  marketScope: z.enum(['ในประเทศ', 'ต่างประเทศ']).default('ในประเทศ'),
  taxId: optionalTaxIdSchema,
  phone: optionalPhoneSchema,
  address: optionalGeneralText('ที่อยู่เต็ม/หมายเหตุที่อยู่', 500),
  addressNo: optionalGeneralText('บ้านเลขที่', 40),
  addressMoo: optionalMooSchema,
  addressVillage: optionalGeneralText('หมู่บ้าน/อาคาร', 160),
  addressRoad: optionalGeneralText('ถนน', 120),
  addressSubdistrict: optionalGeneralText('ตำบล/แขวง', 120),
  addressDistrict: optionalGeneralText('อำเภอ/เขต', 120),
  addressProvince: optionalGeneralText('จังหวัด', 120),
  addressPostalCode: optionalPostalCodeSchema,
  addressCountry: optionalGeneralText('ประเทศ', 80),
  countryCode: optionalCountryCodeSchema,
  addressLine1: optionalGeneralText('ที่อยู่บรรทัด 1', 255),
  addressLine2: optionalGeneralText('ที่อยู่บรรทัด 2', 255),
  addressCity: optionalGeneralText('เมือง', 120),
  addressStateRegion: optionalGeneralText('รัฐ/จังหวัด/ภูมิภาค', 120),
  addressPostalCodeIntl: optionalInternationalPostalCodeSchema,
  bankName: optionalGeneralText('ธนาคารรับเงิน', 120),
  accountNo: optionalAccountNoSchema,
  bankAccount: optionalGeneralText('ชื่อบัญชีรับเงิน', 160),
  bankAccounts: z.array(supplierBankAccountSchema).default([]),
  branchId: optionalGeneralText('รหัสสาขา', 80),
  branchIds: z.array(z.string().trim().regex(/^[A-Za-z0-9_-]+$/, 'รหัสสาขามีรูปแบบไม่ถูกต้อง')).default([]),
  primaryBranchId: z.preprocess(blankToNull, z.string().trim().regex(/^[A-Za-z0-9_-]+$/, 'สาขาหลักมีรูปแบบไม่ถูกต้อง').nullable().default(null)),
  salesId: z.preprocess(blankToNull, z.string().trim().regex(/^[A-Za-z0-9_-]+$/, 'ผู้ดูแลมีรูปแบบไม่ถูกต้อง').nullable().default(null)),
  salesName: optionalBusinessText('ชื่อผู้ดูแล', 160),
  active: z.boolean().default(true),
}).superRefine((values, context) => {
  if (values.type === 'บุคคล') {
    if (!values.name && (!values.nameTitle || !values.firstName || !values.lastName)) {
      if (!values.nameTitle) context.addIssue({ code: z.ZodIssueCode.custom, message: 'เลือกคำนำหน้าชื่อ', path: ['nameTitle'] })
      if (!values.firstName) context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกชื่อ', path: ['firstName'] })
      if (!values.lastName) context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกนามสกุล', path: ['lastName'] })
    }
  } else if (!values.name) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกชื่อบริษัท', path: ['name'] })
  }

  if (!values.salesId) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'เลือกผู้ดูแล', path: ['salesId'] })
  }

  if (values.marketScope === 'ในประเทศ') {
    if (values.countryCode && values.countryCode !== 'TH') {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'ผู้ขายในประเทศต้องใช้รหัสประเทศ TH', path: ['countryCode'] })
    }
    if (values.addressCountry && values.addressCountry !== 'ไทย') {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'ผู้ขายในประเทศต้องใช้ประเทศ ไทย', path: ['addressCountry'] })
    }
    return
  }

  if (!values.addressCountry) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกประเทศ', path: ['addressCountry'] })
  }
  if (!values.addressLine1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกที่อยู่บรรทัด 1', path: ['addressLine1'] })
  }
  if (!values.addressCity) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกเมือง', path: ['addressCity'] })
  }
})

export type SupplierFormValues = z.infer<typeof supplierFormSchema>

type SupplierPaymentMethodIssue = {
  message: string
  path: Array<string | number>
}

export function supplierBankAccountValidationIssues(
  values: Pick<SupplierFormValues, 'bankAccounts'>,
  paymentMethods: SupplierPaymentMethodRecord[],
) {
  const issues: SupplierPaymentMethodIssue[] = []
  const seenAccountNos = new Set<string>()

  values.bankAccounts.forEach((account, index) => {
    const resolvedName = resolveSupplierPaymentMethodName(account.paymentMethod, paymentMethods)
    const group = supplierPaymentMethodGroup(account.paymentMethod, paymentMethods)
    if (!resolvedName || !group) {
      issues.push({ message: 'เลือกวิธีจ่าย/รับเงินที่ถูกต้อง', path: ['bankAccounts', index, 'paymentMethod'] })
      return
    }

    if (group === 'cash') return

    if (!stripCashMarker(account.bankName)) {
      issues.push({ message: 'เลือกธนาคารรับเงิน', path: ['bankAccounts', index, 'bankName'] })
    }
    if (!account.accountNo) {
      issues.push({ message: 'กรอกเลขที่บัญชีรับเงิน', path: ['bankAccounts', index, 'accountNo'] })
      return
    }
    if (seenAccountNos.has(account.accountNo)) {
      issues.push({ message: 'เลขที่บัญชีรับเงินซ้ำ', path: ['bankAccounts', index, 'accountNo'] })
      return
    }
    seenAccountNos.add(account.accountNo)
  })

  return issues
}

export function throwSupplierBankAccountValidationError(
  values: Pick<SupplierFormValues, 'bankAccounts'>,
  paymentMethods: SupplierPaymentMethodRecord[],
) {
  const issues = supplierBankAccountValidationIssues(values, paymentMethods)
  if (!issues.length) return

  throw new z.ZodError(
    issues.map((issue) => ({
      code: z.ZodIssueCode.custom,
      message: issue.message,
      path: issue.path,
    })),
  )
}

export async function listSuppliers(options: SupplierListOptions = {}): Promise<SupplierListResult> {
  const params = new URLSearchParams()
  if (options.active) params.set('active', options.active)
  if (options.all) params.set('all', '1')
  if (options.supplierType) params.set('type', options.supplierType)
  if (options.marketScope) params.set('marketScope', options.marketScope)
  if (options.salesId) params.set('salesId', options.salesId)
  if (options.q) params.set('q', options.q)
  if (options.sort) params.set('sort', options.sort)
  if (options.direction) params.set('direction', options.direction)
  if (options.page) params.set('page', String(options.page))
  if (options.pageSize) params.set('pageSize', String(options.pageSize))

  const query = params.toString()
  const response = await fetch(`/api/master-data/suppliers${query ? `?${query}` : ''}`, { cache: 'no-store' })
  return readJsonResponse(response, supplierListResultSchema, 'โหลดข้อมูลผู้ขายไม่ได้')
}

export async function exportSuppliers(options: SupplierListOptions = {}): Promise<{ blob: Blob; filename: string }> {
  const params = new URLSearchParams()
  if (options.active) params.set('active', options.active)
  if (options.supplierType) params.set('type', options.supplierType)
  if (options.marketScope) params.set('marketScope', options.marketScope)
  if (options.salesId) params.set('salesId', options.salesId)
  if (options.q) params.set('q', options.q)
  if (options.sort) params.set('sort', options.sort)
  if (options.direction) params.set('direction', options.direction)

  const query = params.toString()
  const response = await fetch(`/api/master-data/suppliers/export${query ? `?${query}` : ''}`, { cache: 'no-store' })

  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `suppliers_${new Date().toISOString().slice(0, 10)}.xlsx`
  return {
    blob: await readBlobResponse(response, 'Export Excel ไม่สำเร็จ'),
    filename,
  }
}

export async function importSuppliers(file: File): Promise<SupplierImportResult> {
  const body = new FormData()
  body.append('file', file)

  const response = await fetch('/api/master-data/suppliers/import', {
    method: 'POST',
    body,
  })
  return readJsonResponse(response, supplierImportResultSchema, 'Import Excel ไม่สำเร็จ')
}

export async function saveSupplier(values: SupplierFormValues): Promise<Supplier> {
  const response = await fetch('/api/master-data/suppliers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })
  return readJsonResponse(response, supplierSchema, 'บันทึกข้อมูลผู้ขายไม่ได้')
}

export async function setSupplierActive(supplierId: string, active: boolean): Promise<Supplier> {
  const response = await fetch(`/api/master-data/suppliers/${encodeURIComponent(supplierId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  })
  return readJsonResponse(response, supplierSchema, 'อัปเดตสถานะผู้ขายไม่ได้')
}
