import { z } from 'zod'

const nullableString = z.string().nullable().default(null)
const nullableNumber = z.number().nullable().default(null)

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
    code: z.string().trim().nullable().default(null),
    name: z.string().trim().min(1, 'กรอกชื่อรายการ'),
    email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').or(z.literal('')).nullable().default(null),
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
