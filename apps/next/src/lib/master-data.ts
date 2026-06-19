import { z } from 'zod'

const nullableString = z.string().nullable().default(null)
const nullableNumber = z.number().nullable().default(null)
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const codePattern = /^[A-Za-z0-9_-]+$/
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u
const businessTextPattern = /^[\p{L}\p{M}\p{N}\s.&,()/'"+#%-]+$/u
const personNamePattern = /^[\p{L}\p{M}.' -]+$/u
const phonePattern = /^\+?[0-9][0-9\s().-]{7,24}$/
const accountNoPattern = /^\d{2,40}$/

const optionalCode = (label: string) => z.preprocess(
  blankToNull,
  z.string().trim()
    .max(60, `${label}ยาวเกินไป`)
    .regex(codePattern, `${label}ใช้ได้เฉพาะอังกฤษ ตัวเลข ขีดกลาง และ underscore`)
    .nullable()
    .default(null),
)

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

const optionalPersonName = (label: string, maxLength = 80) => z.preprocess(
  blankToNull,
  z.string().trim()
    .max(maxLength, `${label}ยาวเกินไป`)
    .regex(personNamePattern, `${label}ใช้ได้เฉพาะตัวอักษร ช่องว่าง จุด ขีด และ apostrophe`)
    .nullable()
    .default(null),
)

const optionalAccountNo = z.preprocess(
  blankToNull,
  z.string().trim()
    .max(40, 'เลขบัญชียาวเกินไป')
    .regex(accountNoPattern, 'เลขบัญชีใช้ได้เฉพาะตัวเลข')
    .nullable()
    .default(null),
)

const optionalPhone = z.preprocess(
  blankToNull,
  z.string().trim()
    .regex(phonePattern, 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง')
    .refine((value) => {
      const digits = value.replace(/\D/g, '')
      return digits.length >= 9 && digits.length <= 15
    }, 'เบอร์โทรศัพท์ต้องมีตัวเลข 9-15 หลัก')
    .nullable()
    .default(null),
)

const nonNegativeNumber = (label: string) => z.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).min(0, `${label}ต้องไม่ติดลบ`).nullable().default(null)

export const masterDataRecordSchema = z.object({
  id: z.string().min(1),
  code: nullableString,
  name: z.string().min(1),
  nameTitle: nullableString,
  firstName: nullableString,
  lastName: nullableString,
  active: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  type: nullableString,
  typeLabel: nullableString,
  subtypeLabel: nullableString,
  subtype: nullableString,
  phone: nullableString,
  email: nullableString,
  note: nullableString,
  symbol: nullableString,
  ratePercent: nullableNumber,
  rateToThb: nullableNumber,
  sortOrder: nullableNumber,
  parentId: nullableString,
  channelType: nullableString,
  stockEffect: nullableString,
  availableForSale: z.boolean().default(false),
  bankName: nullableString,
  bankBranch: nullableString,
  accountNo: nullableString,
  accountName: nullableString,
  currency: nullableString,
  openingBalance: nullableNumber,
  odLimit: nullableNumber,
  realBalance: nullableNumber,
  odUsed: nullableNumber,
  odRemaining: nullableNumber,
  availableToPay: nullableNumber,
  branchId: nullableString,
  branchName: nullableString,
  address: nullableString,
  commissionPct: nullableNumber,
  baseSalary: nullableNumber,
  accountCurrency: nullableString,
  bankAccount: nullableString,
  capacityKgPerHr: nullableNumber,
  contact: nullableString,
  country: nullableString,
  creditLimit: nullableNumber,
  creditTerm: nullableNumber,
  grade: nullableString,
  itemStatus: nullableString,
  metalGroup: nullableString,
  normalYieldPct: nullableNumber,
  requiredDoc: nullableString,
  responsiblePerson: nullableString,
  stdCost: nullableNumber,
  stdPrice: nullableNumber,
  stdProcessCostPerHr: nullableNumber,
  swift: nullableString,
  taxId: nullableString,
  unit: nullableString,
  createdAt: nullableString,
  updatedAt: nullableString,
})

export const masterDataRecordListSchema = z.array(masterDataRecordSchema)
export type MasterDataRecord = z.infer<typeof masterDataRecordSchema>

export const masterDataFormSchema = masterDataRecordSchema
  .pick({
    id: true,
    code: true,
    name: true,
    nameTitle: true,
    firstName: true,
    lastName: true,
    active: true,
    type: true,
    subtype: true,
    phone: true,
    email: true,
    note: true,
    symbol: true,
    ratePercent: true,
    rateToThb: true,
    sortOrder: true,
    parentId: true,
    channelType: true,
    stockEffect: true,
    availableForSale: true,
    bankName: true,
    bankBranch: true,
    accountNo: true,
    accountName: true,
    currency: true,
    openingBalance: true,
    odLimit: true,
    branchId: true,
    address: true,
    commissionPct: true,
    baseSalary: true,
    accountCurrency: true,
    bankAccount: true,
    capacityKgPerHr: true,
    contact: true,
    country: true,
    creditLimit: true,
    creditTerm: true,
    grade: true,
    itemStatus: true,
    metalGroup: true,
    normalYieldPct: true,
    requiredDoc: true,
    responsiblePerson: true,
    stdCost: true,
    stdPrice: true,
    stdProcessCostPerHr: true,
    swift: true,
    taxId: true,
    unit: true,
  })
  .extend({
    id: z.string().trim().optional(),
    code: optionalCode('รหัส'),
    name: z.string().trim().min(1, 'กรอกชื่อรายการ').max(180, 'ชื่อรายการยาวเกินไป').regex(businessTextPattern, 'ชื่อรายการมีรูปแบบไม่ถูกต้อง'),
    nameTitle: optionalPersonName('คำนำหน้าชื่อ', 40),
    firstName: optionalPersonName('ชื่อ'),
    lastName: optionalPersonName('นามสกุล'),
    email: z.preprocess(blankToNull, z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').regex(/^[\x20-\x7E]+$/, 'อีเมลต้องใช้ตัวอักษรอังกฤษ ตัวเลข หรือสัญลักษณ์มาตรฐาน').nullable().default(null)),
    phone: optionalPhone,
    note: optionalGeneralText('หมายเหตุ', 500),
    symbol: optionalGeneralText('สัญลักษณ์', 20),
    ratePercent: z.number().min(0, 'อัตราต้องไม่ติดลบ').max(100, 'อัตราต้องไม่เกิน 100%').nullable().default(null),
    rateToThb: nonNegativeNumber('อัตราเทียบบาท'),
    sortOrder: z.number({ invalid_type_error: 'ลำดับต้องเป็นตัวเลข' }).int('ลำดับต้องเป็นจำนวนเต็ม').min(0, 'ลำดับต้องไม่ติดลบ').nullable().default(null),
    parentId: optionalCode('รหัสหมวดแม่'),
    channelType: optionalGeneralText('ประเภทช่องทาง', 80),
    stockEffect: optionalCode('ผลต่อสต๊อก'),
    availableForSale: z.boolean().default(false),
    bankName: optionalBusinessText('ธนาคาร', 120),
    bankBranch: optionalBusinessText('สาขาธนาคาร', 160),
    accountNo: optionalAccountNo,
    accountName: optionalBusinessText('ชื่อบัญชี', 180),
    currency: optionalCode('สกุลเงิน'),
    openingBalance: nonNegativeNumber('ยอดเงินคงเหลือ'),
    odLimit: nonNegativeNumber('วงเงิน OD'),
    branchId: optionalCode('รหัสสาขา'),
    address: optionalGeneralText('ที่อยู่', 500),
    commissionPct: z.number().min(0, 'ค่าคอมมิชชันต้องไม่ติดลบ').max(100, 'ค่าคอมมิชชันต้องไม่เกิน 100%').nullable().default(null),
    baseSalary: nonNegativeNumber('เงินเดือนฐาน'),
    accountCurrency: optionalCode('สกุลเงินบัญชี'),
    bankAccount: optionalGeneralText('บัญชีธนาคาร', 160),
    capacityKgPerHr: nonNegativeNumber('กำลังผลิต'),
    contact: optionalBusinessText('ผู้ติดต่อ', 160),
    country: optionalBusinessText('ประเทศ', 120),
    creditLimit: nonNegativeNumber('วงเงินเครดิต'),
    creditTerm: nonNegativeNumber('เครดิตเทอม'),
    grade: optionalBusinessText('เกรด', 80),
    itemStatus: optionalCode('สถานะสินค้า'),
    metalGroup: optionalBusinessText('กลุ่มโลหะ', 120),
    normalYieldPct: z.number().min(0, 'Yield ต้องไม่ติดลบ').max(100, 'Yield ต้องไม่เกิน 100%').nullable().default(null),
    requiredDoc: optionalGeneralText('เอกสารที่ต้องใช้', 500),
    responsiblePerson: optionalBusinessText('ผู้รับผิดชอบ', 160),
    stdCost: nonNegativeNumber('ต้นทุนมาตรฐาน'),
    stdPrice: nonNegativeNumber('ราคามาตรฐาน'),
    stdProcessCostPerHr: nonNegativeNumber('ค่า Process ต่อชั่วโมง'),
    swift: z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}([A-Z0-9]{3})?$/, 'SWIFT ต้องเป็นตัวอักษร/ตัวเลข 8 หรือ 11 ตัว').nullable().default(null)),
    taxId: z.preprocess(blankToNull, z.string().trim().regex(/^\d{10,13}$/, 'เลขผู้เสียภาษีต้องเป็นตัวเลข 10-13 หลัก').nullable().default(null)),
    unit: optionalBusinessText('หน่วย', 40),
  })

export const accountMasterDataFormSchema = masterDataFormSchema.extend({
  name: z.string().trim().min(1, 'กรอกชื่อบัญชี').max(180, 'ชื่อบัญชียาวเกินไป'),
})

export type MasterDataFormValues = z.infer<typeof masterDataFormSchema>

export type MasterDataFieldType = 'text' | 'number' | 'select'
export type MasterDataFieldInputFormat = 'money'

export type MasterDataField = {
  key: keyof MasterDataFormValues
  label: string
  optionsApiPath?: string
  optionValueKey?: keyof MasterDataRecord
  section?: string
  type?: MasterDataFieldType
  inputFormat?: MasterDataFieldInputFormat
  options?: Array<{ label: string; value: string }>
  required?: boolean
}

export type MasterDataColumn = {
  key: keyof MasterDataRecord
  label: string
  align?: 'left' | 'right' | 'center'
  format?: 'money' | 'number' | 'status'
  maxWidth?: number
  minWidth?: number
  width?: number
}

export type MasterDataPageConfig = {
  apiPath: string
  createLabel: string
  description?: string
  emptyMessage: string
  entityName: string
  fields: MasterDataField[]
  columns: MasterDataColumn[]
  supportsActive?: boolean
}

export const emptyMasterDataForm: MasterDataFormValues = {
  id: undefined,
  code: null,
  name: '',
  nameTitle: null,
  firstName: null,
  lastName: null,
  active: true,
  type: null,
  subtype: null,
  phone: null,
  email: null,
  note: null,
  symbol: null,
  ratePercent: null,
  rateToThb: null,
  sortOrder: null,
  parentId: null,
  channelType: null,
  stockEffect: null,
  availableForSale: false,
  bankName: null,
  bankBranch: null,
  accountNo: null,
  accountName: null,
  currency: null,
  openingBalance: null,
  odLimit: null,
  branchId: null,
  address: null,
  commissionPct: null,
  baseSalary: null,
  accountCurrency: null,
  bankAccount: null,
  capacityKgPerHr: null,
  contact: null,
  country: null,
  creditLimit: null,
  creditTerm: null,
  grade: null,
  itemStatus: null,
  metalGroup: null,
  normalYieldPct: null,
  requiredDoc: null,
  responsiblePerson: null,
  stdCost: null,
  stdPrice: null,
  stdProcessCostPerHr: null,
  swift: null,
  taxId: null,
  unit: null,
}

async function readJson<TSchema extends z.ZodTypeAny>(response: Response, schema: TSchema): Promise<z.output<TSchema>> {
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(payload?.error ?? 'Request failed')
  }

  return schema.parse(payload)
}

export async function listMasterDataRecords(apiPath: string): Promise<MasterDataRecord[]> {
  const response = await fetch(apiPath, { cache: 'no-store' })
  return readJson(response, masterDataRecordListSchema)
}

export async function saveMasterDataRecord(apiPath: string, values: MasterDataFormValues): Promise<MasterDataRecord> {
  const response = await fetch(apiPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  })

  return readJson(response, masterDataRecordSchema)
}

export async function setMasterDataRecordActive(apiPath: string, id: string, active: boolean): Promise<MasterDataRecord> {
  const response = await fetch(`${apiPath}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  })

  return readJson(response, masterDataRecordSchema)
}
