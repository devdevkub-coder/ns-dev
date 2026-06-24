import { Prisma } from '../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { customerFormSchema, customerSchema, type Customer, type CustomerFormValues } from '@/lib/customer'

type PrismaCustomer = {
  id: bigint
  code: string | null
  name: string
  name_title: string | null
  first_name: string | null
  last_name: string | null
  type: string | null
  legal_entity_type: string | null
  market_scope: string
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
  country_code: string | null
  address_line1: string | null
  address_line2: string | null
  address_city: string | null
  address_state_region: string | null
  address_postal_code_intl: string | null
  credit_term: number | null
  credit_limit: Prisma.Decimal | null
  sales_id: bigint | null
  active: boolean | null
  created_at: Date | null
  updated_at: Date | null
  customer_branches?: Array<{
    active: boolean
    is_primary: boolean
    branches: { code: string | null; name: string } | null
  }>
}

export function mapPrismaCustomer(
  row: PrismaCustomer,
  overrides?: {
    salesId?: string | null
  },
): Customer {
  const outwardId = requireBusinessCode(row.code, `ลูกค้า ${row.id}`)
  const activeBranches = (row.customer_branches ?? [])
    .filter((mapping) => mapping.active && mapping.branches?.code)
    .map((mapping) => ({
      code: requireBusinessCode(mapping.branches?.code ?? null, `สาขาลูกค้า ${row.id}`),
      isPrimary: mapping.is_primary,
      name: mapping.branches?.name ?? '',
    }))
  const primaryBranch = activeBranches.find((branch) => branch.isPrimary) ?? activeBranches[0] ?? null
  return customerSchema.parse({
    id: outwardId,
    code: outwardId,
    name: row.name,
    nameTitle: row.name_title,
    firstName: row.first_name,
    lastName: row.last_name,
    type: row.type === 'บุคคล' ? 'บุคคล' : 'นิติบุคคล',
    legalEntityType: row.legal_entity_type,
    marketScope: row.market_scope === 'ต่างประเทศ' ? 'ต่างประเทศ' : 'ในประเทศ',
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
    countryCode: row.country_code,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    addressCity: row.address_city,
    addressStateRegion: row.address_state_region,
    addressPostalCodeIntl: row.address_postal_code_intl,
    creditTerm: row.credit_term,
    creditLimit: row.credit_limit === null ? null : row.credit_limit.toNumber(),
    branchIds: activeBranches.map((branch) => branch.code),
    branchNames: activeBranches.map((branch) => branch.name),
    primaryBranchId: primaryBranch?.code ?? null,
    primaryBranchName: primaryBranch?.name ?? null,
    salesId: overrides?.salesId ?? null,
    active: row.active ?? true,
    createdAt: row.created_at?.toISOString() ?? null,
    updatedAt: row.updated_at?.toISOString() ?? null,
  })
}

function compactAddress(values: CustomerFormValues) {
  if (values.marketScope === 'ต่างประเทศ') {
    const parts = [
      values.addressLine1,
      values.addressLine2,
      values.addressCity,
      values.addressStateRegion,
      values.addressPostalCodeIntl,
      values.addressCountry,
    ]

    return parts.map((part) => part?.trim()).filter(Boolean).join(', ') || values.address || null
  }

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

function domesticAddressLine1(values: CustomerFormValues) {
  return [
    values.addressNo,
    values.addressMoo ? `หมู่ ${values.addressMoo}` : null,
    values.addressVillage,
    values.addressRoad,
  ].map((part) => part?.trim()).filter(Boolean).join(' ') || null
}

export function toCustomerWriteInput(
  values: CustomerFormValues,
  overrides?: {
    salesId?: bigint | null
  },
) {
  const parsed = customerFormSchema.parse(values)
  const code = parsed.code?.toUpperCase() || parsed.id || ''
  const personName = [parsed.nameTitle, parsed.firstName, parsed.lastName].map((part) => part?.trim()).filter(Boolean).join(' ')
  const name = parsed.type === 'บุคคล' ? personName : parsed.name
  const isDomestic = parsed.marketScope === 'ในประเทศ'

  return {
    code,
    name: name || code,
    name_title: parsed.type === 'บุคคล' ? parsed.nameTitle || null : null,
    first_name: parsed.type === 'บุคคล' ? parsed.firstName || null : null,
    last_name: parsed.type === 'บุคคล' ? parsed.lastName || null : null,
    type: parsed.type,
    legal_entity_type: parsed.type === 'นิติบุคคล' ? parsed.legalEntityType || null : null,
    market_scope: parsed.marketScope,
    tax_id: parsed.taxId || null,
    phone: parsed.phone || null,
    email: parsed.email || null,
    address: compactAddress(parsed),
    address_no: isDomestic ? parsed.addressNo || null : null,
    address_moo: isDomestic ? parsed.addressMoo || null : null,
    address_village: isDomestic ? parsed.addressVillage || null : null,
    address_road: isDomestic ? parsed.addressRoad || null : null,
    address_subdistrict: isDomestic ? parsed.addressSubdistrict || null : null,
    address_district: isDomestic ? parsed.addressDistrict || null : null,
    address_province: isDomestic ? parsed.addressProvince || null : null,
    address_postal_code: isDomestic ? parsed.addressPostalCode || null : null,
    address_country: isDomestic ? 'ไทย' : parsed.addressCountry || null,
    country_code: isDomestic ? 'TH' : parsed.countryCode?.toUpperCase() ?? null,
    address_line1: isDomestic ? parsed.addressLine1 || domesticAddressLine1(parsed) : parsed.addressLine1 || null,
    address_line2: parsed.addressLine2 || null,
    address_city: isDomestic ? parsed.addressCity || parsed.addressDistrict || null : parsed.addressCity || null,
    address_state_region: isDomestic ? parsed.addressStateRegion || parsed.addressProvince || null : parsed.addressStateRegion || null,
    address_postal_code_intl: isDomestic ? parsed.addressPostalCodeIntl || parsed.addressPostalCode || null : parsed.addressPostalCodeIntl || null,
    credit_term: parsed.creditTerm,
    credit_limit: parsed.creditLimit,
    sales_id: overrides?.salesId ?? null,
    active: parsed.active,
  }
}
