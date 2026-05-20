import { Prisma } from '../../../generated/prisma/client'
import { supplierFormSchema, supplierSchema, type Supplier, type SupplierFormValues } from '@/lib/supplier'

type PrismaSupplier = {
  id: string
  code: string | null
  name: string
  name_title: string | null
  first_name: string | null
  last_name: string | null
  type: string | null
  market_scope: string
  tax_id: string | null
  phone: string | null
  address: string | null
  address_no: string | null
  address_moo: string | null
  address_village: string | null
  address_road: string | null
  address_subdistrict: string | null
  address_district: string | null
  address_province: string | null
  address_postal_code: string | null
  address_country: string | null
  bank_name: string | null
  bank_account: string | null
  bank_account_name: string | null
  branch_id: string | null
  sales_id: string | null
  sales_rep: string | null
  credit_term: number | null
  credit_limit: Prisma.Decimal | null
  notes: string | null
  active: boolean | null
  created_at: Date | null
  updated_at: Date | null
  branches?: { name: string } | null
}

export function mapPrismaSupplier(row: PrismaSupplier): Supplier {
  return supplierSchema.parse({
    id: row.id,
    code: row.code ?? row.id,
    name: row.name,
    nameTitle: row.name_title,
    firstName: row.first_name,
    lastName: row.last_name,
    type: row.type === 'บุคคล' ? 'บุคคล' : 'นิติบุคคล',
    marketScope: row.market_scope === 'ต่างประเทศ' ? 'ต่างประเทศ' : 'ในประเทศ',
    taxId: row.tax_id,
    phone: row.phone,
    address: row.address,
    addressNo: row.address_no,
    addressMoo: row.address_moo,
    addressVillage: row.address_village,
    addressRoad: row.address_road,
    addressSubdistrict: row.address_subdistrict,
    addressDistrict: row.address_district,
    addressProvince: row.address_province,
    addressPostalCode: row.address_postal_code,
    addressCountry: row.address_country,
    bankName: row.bank_name,
    accountNo: row.bank_account,
    bankAccount: row.bank_account_name,
    branchId: row.branch_id,
    branchName: row.branches?.name ?? row.branch_id,
    salesId: row.sales_id,
    salesName: row.sales_rep,
    creditTerm: row.credit_term,
    creditLimit: row.credit_limit === null ? null : row.credit_limit.toNumber(),
    notes: row.notes,
    active: row.active ?? true,
    createdAt: row.created_at?.toISOString() ?? null,
    updatedAt: row.updated_at?.toISOString() ?? null,
  })
}

function compactAddress(values: SupplierFormValues) {
  const parts = [
    values.addressNo,
    values.addressMoo ? `หมู่ ${values.addressMoo}` : null,
    values.addressVillage,
    values.addressRoad ? `ถ.${values.addressRoad}` : null,
    values.addressSubdistrict ? `ต.${values.addressSubdistrict}` : null,
    values.addressDistrict ? `อ.${values.addressDistrict}` : null,
    values.addressProvince ? `จ.${values.addressProvince}` : null,
    values.addressPostalCode,
    values.addressCountry && values.addressCountry !== 'ไทย' ? values.addressCountry : null,
  ]

  return parts.map((part) => part?.trim()).filter(Boolean).join(' ') || values.address || null
}

export function toSupplierWriteInput(values: SupplierFormValues) {
  const parsed = supplierFormSchema.parse(values)
  const code = (parsed.code || parsed.id || '').toUpperCase()
  const personName = [parsed.nameTitle, parsed.firstName, parsed.lastName].map((part) => part?.trim()).filter(Boolean).join(' ')
  const name = parsed.type === 'บุคคล' ? personName : parsed.name

  return {
    id: parsed.id || code,
    code,
    name: name || code,
    name_title: parsed.type === 'บุคคล' ? parsed.nameTitle || null : null,
    first_name: parsed.type === 'บุคคล' ? parsed.firstName || null : null,
    last_name: parsed.type === 'บุคคล' ? parsed.lastName || null : null,
    type: parsed.type,
    market_scope: parsed.marketScope,
    tax_id: parsed.taxId || null,
    phone: parsed.phone || null,
    address: compactAddress(parsed),
    address_no: parsed.addressNo || null,
    address_moo: parsed.addressMoo || null,
    address_village: parsed.addressVillage || null,
    address_road: parsed.addressRoad || null,
    address_subdistrict: parsed.addressSubdistrict || null,
    address_district: parsed.addressDistrict || null,
    address_province: parsed.addressProvince || null,
    address_postal_code: parsed.addressPostalCode || null,
    address_country: parsed.addressCountry || 'ไทย',
    bank_name: parsed.bankName || null,
    bank_account: parsed.accountNo || null,
    bank_account_name: parsed.bankAccount || null,
    branch_id: parsed.branchId || null,
    sales_id: parsed.salesId || null,
    sales_rep: parsed.salesName || null,
    credit_term: parsed.creditTerm,
    credit_limit: parsed.creditLimit,
    notes: parsed.notes || null,
    active: parsed.active,
  }
}
