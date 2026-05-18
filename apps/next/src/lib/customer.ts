import { z } from 'zod'
import { readBlobResponse, readJsonResponse } from '@/lib/api-client'

const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const businessTextPattern = /^[\p{L}\p{M}\p{N}\s.&,()/'"-]+$/u
const compactDigits = (value: string) => value.replace(/\D/g, '')
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u
const personNamePattern = /^[\p{L}\p{M}.' -]+$/u

const asciiEmailSchema = z.preprocess(blankToNull, z.string().trim()
  .email('รูปแบบอีเมลไม่ถูกต้อง')
  .regex(/^[\x20-\x7E]+$/, 'อีเมลต้องใช้ตัวอักษรอังกฤษ ตัวเลข หรือสัญลักษณ์มาตรฐาน')
  .nullable()
  .default(null))

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

const optionalMooSchema = z.preprocess(
  blankToNull,
  z.string().trim()
    .regex(/^\d{1,3}[A-Za-z]?$/, 'หมู่ต้องเป็นตัวเลข 1-3 หลัก')
    .nullable()
    .default(null),
)

const phoneSchema = z.string().trim()
  .min(1, 'กรอกเบอร์โทรศัพท์')
  .regex(/^\+?[0-9][0-9\s().-]{7,24}$/, 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง')
  .refine((value) => {
    const digits = compactDigits(value)
    return digits.length >= 9 && digits.length <= 15
  }, 'เบอร์โทรศัพท์ต้องมีตัวเลข 9-15 หลัก')

export const customerSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  nameTitle: z.string().nullable().default(null),
  firstName: z.string().nullable().default(null),
  lastName: z.string().nullable().default(null),
  type: z.enum(['บุคคล', 'นิติบุคคล']).default('นิติบุคคล'),
  marketScope: z.enum(['ในประเทศ', 'ต่างประเทศ']).default('ในประเทศ'),
  taxId: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  email: z.string().nullable().default(null),
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
  contact: z.string().nullable().default(null),
  contactTitle: z.string().nullable().default(null),
  contactFirstName: z.string().nullable().default(null),
  contactLastName: z.string().nullable().default(null),
  creditTerm: z.number().int().nullable().default(null),
  creditLimit: z.number().nullable().default(null),
  salesId: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  active: z.boolean().default(true),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
})

export const customerListSchema = z.array(customerSchema)
export const customerListResultSchema = z.object({
  rows: customerListSchema,
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(1),
})
export type Customer = z.infer<typeof customerSchema>
export type CustomerListResult = z.infer<typeof customerListResultSchema>

export type CustomerListOptions = {
  all?: boolean
  customerType?: string
  direction?: 'asc' | 'desc'
  marketScope?: string
  page?: number
  pageSize?: number
  q?: string
  sort?: string
}

export const customerFormSchema = z.object({
  id: z.string().trim().regex(/^[A-Za-z0-9_-]+$/, 'รหัสลูกค้ามีรูปแบบไม่ถูกต้อง').optional(),
  code: z.preprocess(blankToNull, z.string().trim().regex(/^[A-Za-z0-9_-]+$/, 'รหัสลูกค้ามีรูปแบบไม่ถูกต้อง').nullable().default(null)),
  name: optionalBusinessText('ชื่อบริษัท'),
  nameTitle: optionalPersonName('คำนำหน้าชื่อ'),
  firstName: optionalPersonName('ชื่อ'),
  lastName: optionalPersonName('นามสกุล'),
  type: z.enum(['บุคคล', 'นิติบุคคล'], { required_error: 'เลือกประเภทลูกค้า' }),
  marketScope: z.enum(['ในประเทศ', 'ต่างประเทศ']).default('ในประเทศ'),
  taxId: optionalTaxIdSchema,
  phone: phoneSchema,
  email: asciiEmailSchema,
  address: optionalGeneralText('ที่อยู่เต็ม/หมายเหตุที่อยู่', 500),
  addressNo: optionalGeneralText('บ้านเลขที่', 40),
  addressMoo: optionalMooSchema,
  addressVillage: optionalGeneralText('หมู่บ้าน/อาคาร', 160),
  addressRoad: optionalGeneralText('ถนน', 120),
  addressSubdistrict: optionalGeneralText('ตำบล/แขวง', 120),
  addressDistrict: optionalGeneralText('อำเภอ/เขต', 120),
  addressProvince: optionalGeneralText('จังหวัด', 120),
  addressPostalCode: optionalPostalCodeSchema,
  addressCountry: z.preprocess(blankToNull, z.string().trim().max(80, 'ประเทศยาวเกินไป').regex(personNamePattern, 'ประเทศมีรูปแบบไม่ถูกต้อง').nullable().default('ไทย')),
  contact: optionalGeneralText('ผู้ติดต่อ'),
  contactTitle: optionalPersonName('คำนำหน้าผู้ติดต่อ'),
  contactFirstName: optionalPersonName('ชื่อผู้ติดต่อ'),
  contactLastName: optionalPersonName('นามสกุลผู้ติดต่อ'),
  creditTerm: z.number().int().min(0).nullable().default(null),
  creditLimit: z.number().min(0).nullable().default(null),
  salesId: z.string().trim().nullable().default(null),
  notes: z.string().trim().nullable().default(null),
  active: z.boolean().default(true),
}).superRefine((values, context) => {
  if (values.type === 'บุคคล') {
    if (!values.nameTitle) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'เลือกคำนำหน้าชื่อ', path: ['nameTitle'] })
    }
    if (!values.firstName) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกชื่อ', path: ['firstName'] })
    }
    if (!values.lastName) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกนามสกุล', path: ['lastName'] })
    }
  } else if (!values.name) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกชื่อบริษัท', path: ['name'] })
  }

  if (!values.contactTitle) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'เลือกคำนำหน้าผู้ติดต่อ', path: ['contactTitle'] })
  }
  if (!values.contactFirstName) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกชื่อผู้ติดต่อ', path: ['contactFirstName'] })
  }
  if (!values.contactLastName) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'กรอกนามสกุลผู้ติดต่อ', path: ['contactLastName'] })
  }
})

export type CustomerFormValues = z.infer<typeof customerFormSchema>

export async function listCustomers(options: CustomerListOptions = {}): Promise<CustomerListResult> {
  const params = new URLSearchParams()
  if (options.all) params.set('all', '1')
  if (options.customerType) params.set('type', options.customerType)
  if (options.marketScope) params.set('marketScope', options.marketScope)
  if (options.q) params.set('q', options.q)
  if (options.sort) params.set('sort', options.sort)
  if (options.direction) params.set('direction', options.direction)
  if (options.page) params.set('page', String(options.page))
  if (options.pageSize) params.set('pageSize', String(options.pageSize))

  const query = params.toString()
  const response = await fetch(`/api/master-data/customers${query ? `?${query}` : ''}`, { cache: 'no-store' })
  return readJsonResponse(response, customerListResultSchema, 'โหลดข้อมูลลูกค้าไม่ได้')
}

export async function exportCustomers(options: CustomerListOptions = {}): Promise<{ blob: Blob; filename: string }> {
  const params = new URLSearchParams()
  if (options.customerType) params.set('type', options.customerType)
  if (options.marketScope) params.set('marketScope', options.marketScope)
  if (options.q) params.set('q', options.q)
  if (options.sort) params.set('sort', options.sort)
  if (options.direction) params.set('direction', options.direction)

  const query = params.toString()
  const response = await fetch(`/api/master-data/customers/export${query ? `?${query}` : ''}`, { cache: 'no-store' })

  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `customers_${new Date().toISOString().slice(0, 10)}.xlsx`
  return {
    blob: await readBlobResponse(response, 'Export Excel ไม่สำเร็จ'),
    filename,
  }
}

export async function saveCustomer(values: CustomerFormValues): Promise<Customer> {
  const response = await fetch('/api/master-data/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })

  return readJsonResponse(response, customerSchema, 'บันทึกข้อมูลลูกค้าไม่ได้')
}

export async function setCustomerActive(customerId: string, active: boolean): Promise<Customer> {
  const response = await fetch(`/api/master-data/customers/${encodeURIComponent(customerId)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  })

  return readJsonResponse(response, customerSchema, 'อัปเดตสถานะลูกค้าไม่ได้')
}
