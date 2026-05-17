import { Prisma } from '../../../generated/prisma/client'
import { customerFormSchema, customerSchema, type Customer, type CustomerFormValues } from '@/lib/customer'

type PrismaCustomer = {
  id: string
  code: string | null
  name: string
  type: string | null
  tax_id: string | null
  phone: string | null
  email: string | null
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
  contact: string | null
  credit_term: number | null
  credit_limit: Prisma.Decimal | null
  sales_id: string | null
  notes: string | null
  active: boolean | null
  created_at: Date | null
  updated_at: Date | null
}

export function mapPrismaCustomer(row: PrismaCustomer): Customer {
  return customerSchema.parse({
    id: row.id,
    code: row.code ?? row.id,
    name: row.name,
    type: row.type,
    taxId: row.tax_id,
    phone: row.phone,
    email: row.email,
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
    contact: row.contact,
    creditTerm: row.credit_term,
    creditLimit: row.credit_limit === null ? null : row.credit_limit.toNumber(),
    salesId: row.sales_id,
    notes: row.notes,
    active: row.active ?? true,
    createdAt: row.created_at?.toISOString() ?? null,
    updatedAt: row.updated_at?.toISOString() ?? null,
  })
}

function compactAddress(values: CustomerFormValues) {
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

export function toCustomerWriteInput(values: CustomerFormValues) {
  const parsed = customerFormSchema.parse(values)
  const code = parsed.code?.toUpperCase() || parsed.id || ''

  return {
    id: parsed.id || code,
    code,
    name: parsed.name,
    type: parsed.type || null,
    tax_id: parsed.taxId || null,
    phone: parsed.phone || null,
    email: parsed.email || null,
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
    contact: parsed.contact || null,
    credit_term: parsed.creditTerm,
    credit_limit: parsed.creditLimit,
    sales_id: parsed.salesId || null,
    notes: parsed.notes || null,
    active: parsed.active,
  }
}
