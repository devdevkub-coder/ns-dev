import { z } from 'zod'

const nullableString = z.string().nullable().default(null)
const nullableNumber = z.number().nullable().default(null)
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value)
const codePattern = /^[A-Za-z0-9_-]+$/
const generalTextPattern = /^[^\u0000-\u001F\u007F]+$/u
const businessTextPattern = /^[\p{L}\p{M}\p{N}\s.&,()/'"+#%-]+$/u
const phonePattern = /^\+?[0-9][0-9\s().-]{7,24}$/

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

const optionalPhone = z.preprocess(
  blankToNull,
  z.string().trim()
    .regex(phonePattern, 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง')
    .nullable()
    .default(null),
)

const nonNegativeNumber = (label: string) => z.number({ invalid_type_error: `${label}ต้องเป็นตัวเลข` }).min(0, `${label}ต้องไม่ติดลบ`).nullable().default(null)

export const masterDataRecordSchema = z.object({
  id: z.string().min(1),
  code: nullableString,
  name: z.string().min(1),
  active: z.boolean().default(true),
  type: nullableString,
  phone: nullableString,
  email: nullableString,
  note: nullableString,
  symbol: nullableString,
  rateToThb: nullableNumber,
  parentId: nullableString,
  channelType: nullableString,
  bankName: nullableString,
  accountNo: nullableString,
  currency: nullableString,
  openingBalance: nullableNumber,
  odLimit: nullableNumber,
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
  maintenanceStatus: nullableString,
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
    active: true,
    type: true,
    phone: true,
    email: true,
    note: true,
    symbol: true,
    rateToThb: true,
    parentId: true,
    channelType: true,
    bankName: true,
    accountNo: true,
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
    maintenanceStatus: true,
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
    email: z.preprocess(blankToNull, z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').regex(/^[\x20-\x7E]+$/, 'อีเมลต้องใช้ตัวอักษรอังกฤษ ตัวเลข หรือสัญลักษณ์มาตรฐาน').nullable().default(null)),
    phone: optionalPhone,
    note: optionalGeneralText('หมายเหตุ', 500),
    symbol: optionalGeneralText('สัญลักษณ์', 20),
    rateToThb: nonNegativeNumber('อัตราเทียบบาท'),
    parentId: optionalCode('รหัสหมวดแม่'),
    channelType: optionalGeneralText('ประเภทช่องทาง', 80),
    bankName: optionalBusinessText('ธนาคาร', 120),
    accountNo: optionalGeneralText('เลขบัญชี', 80),
    currency: optionalCode('สกุลเงิน'),
    openingBalance: nonNegativeNumber('ยอดยกมา'),
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
    maintenanceStatus: optionalGeneralText('สถานะบำรุงรักษา', 80),
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

export type MasterDataFormValues = z.infer<typeof masterDataFormSchema>

export type MasterDataFieldType = 'text' | 'number' | 'select'

export type MasterDataField = {
  key: keyof MasterDataFormValues
  label: string
  type?: MasterDataFieldType
  options?: Array<{ label: string; value: string }>
  required?: boolean
}

export type MasterDataColumn = {
  key: keyof MasterDataRecord
  label: string
  align?: 'left' | 'right' | 'center'
  format?: 'money' | 'number' | 'status'
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
  active: true,
  type: null,
  phone: null,
  email: null,
  note: null,
  symbol: null,
  rateToThb: null,
  parentId: null,
  channelType: null,
  bankName: null,
  accountNo: null,
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
  maintenanceStatus: null,
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
