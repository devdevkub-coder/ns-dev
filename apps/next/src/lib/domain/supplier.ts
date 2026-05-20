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
  country_code: string | null
  address_line1: string | null
  address_line2: string | null
  address_city: string | null
  address_state_region: string | null
  address_postal_code_intl: string | null
  bank_name: string | null
  bank_account: string | null
  bank_account_name: string | null
  branch_id: string | null
  sales_id: string | null
  sales_rep: string | null
  active: boolean | null
  created_at: Date | null
  updated_at: Date | null
  branches?: { name: string } | null
  supplier_bank_accounts?: Array<{
    id: string
    payment_method: string | null
    bank_name: string | null
    account_no: string | null
    account_name: string | null
    is_primary: boolean | null
    active: boolean | null
  }>
}

type SupplierBankAccountWriteRow = {
  id: string
  supplier_id: string
  payment_method: 'เงินสด' | 'โอนเงิน'
  bank_name: string | null
  account_no: string | null
  account_name: string | null
  is_primary: boolean
  active: boolean
}

function normalizeAccountNo(value: string | null | undefined) {
  return value?.replace(/\D/g, '') || null
}

function normalizeBankName(value: string | null | undefined) {
  const normalized = value
    ?.replace(/เงินสด/g, '')
    .replace(/^[\s/\\\-–—:]+|[\s/\\\-–—:]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return normalized || null
}

function primaryBankAccount(values: SupplierFormValues) {
  const accounts = values.bankAccounts
    .map((account) => ({
      ...account,
      bankName: normalizeBankName(account.bankName),
      accountNo: normalizeAccountNo(account.accountNo),
    }))
    .filter((account): account is typeof account & { accountNo: string } => account.paymentMethod === 'โอนเงิน' && Boolean(account.accountNo))
  return accounts.find((account) => account.isPrimary) ?? accounts[0] ?? null
}

export function supplierBankAccountRows(values: SupplierFormValues, supplierId: string) {
  const parsed = supplierFormSchema.parse(values)
  const seenAccountNos = new Set<string>()
  const rows: SupplierBankAccountWriteRow[] = []
  parsed.bankAccounts.forEach((account, index) => {
    if (account.paymentMethod === 'เงินสด') {
      rows.push({
        id: account.id || `${supplierId}-CASH-${index + 1}`,
        supplier_id: supplierId,
        payment_method: 'เงินสด',
        bank_name: null,
        account_no: null,
        account_name: null,
        is_primary: index === 0 || account.isPrimary,
        active: account.active,
      })
      return
    }

    const accountNo = normalizeAccountNo(account.accountNo)
    if (!accountNo || seenAccountNos.has(accountNo)) return
    seenAccountNos.add(accountNo)

    rows.push({
      id: account.id || `${supplierId}-${accountNo}`,
      supplier_id: supplierId,
      payment_method: 'โอนเงิน',
      bank_name: normalizeBankName(account.bankName),
      account_no: accountNo,
      account_name: account.bankAccount || null,
      is_primary: index === 0 || account.isPrimary,
      active: account.active,
    })
  })

  if (!rows.some((row) => row.is_primary) && rows[0]) rows[0].is_primary = true
  return rows
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
    countryCode: row.country_code,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    addressCity: row.address_city,
    addressStateRegion: row.address_state_region,
    addressPostalCodeIntl: row.address_postal_code_intl,
    bankName: row.bank_name,
    accountNo: normalizeAccountNo(row.bank_account),
    bankAccount: row.bank_account_name,
    bankAccounts: (row.supplier_bank_accounts ?? []).map((account) => ({
      id: account.id,
      paymentMethod: account.payment_method === 'โอนเงิน' ? 'โอนเงิน' : 'เงินสด',
      bankName: normalizeBankName(account.bank_name),
      accountNo: normalizeAccountNo(account.account_no),
      bankAccount: account.account_name,
      isPrimary: account.is_primary ?? false,
      active: account.active ?? true,
    })),
    branchId: row.branch_id,
    branchName: row.branches?.name ?? row.branch_id,
    salesId: row.sales_id,
    salesName: row.sales_rep,
    active: row.active ?? true,
    createdAt: row.created_at?.toISOString() ?? null,
    updatedAt: row.updated_at?.toISOString() ?? null,
  })
}

function compactAddress(values: SupplierFormValues) {
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

function domesticAddressLine1(values: SupplierFormValues) {
  return [
    values.addressNo,
    values.addressMoo ? `หมู่ ${values.addressMoo}` : null,
    values.addressVillage,
    values.addressRoad,
  ].map((part) => part?.trim()).filter(Boolean).join(' ') || null
}

export function toSupplierWriteInput(values: SupplierFormValues) {
  const parsed = supplierFormSchema.parse(values)
  const code = (parsed.code || parsed.id || '').toUpperCase()
  const personName = [parsed.nameTitle, parsed.firstName, parsed.lastName].map((part) => part?.trim()).filter(Boolean).join(' ')
  const name = parsed.type === 'บุคคล' ? personName || parsed.name : parsed.name
  const isDomestic = parsed.marketScope === 'ในประเทศ'
  const countryCode = isDomestic ? 'TH' : parsed.countryCode?.toUpperCase() ?? null
  const primaryAccount = primaryBankAccount(parsed) ?? (normalizeAccountNo(parsed.accountNo)
    ? { accountNo: normalizeAccountNo(parsed.accountNo), bankName: normalizeBankName(parsed.bankName), bankAccount: parsed.bankAccount }
    : null)

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
    address_no: isDomestic ? parsed.addressNo || null : null,
    address_moo: isDomestic ? parsed.addressMoo || null : null,
    address_village: isDomestic ? parsed.addressVillage || null : null,
    address_road: isDomestic ? parsed.addressRoad || null : null,
    address_subdistrict: isDomestic ? parsed.addressSubdistrict || null : null,
    address_district: isDomestic ? parsed.addressDistrict || null : null,
    address_province: isDomestic ? parsed.addressProvince || null : null,
    address_postal_code: isDomestic ? parsed.addressPostalCode || null : null,
    address_country: isDomestic ? 'ไทย' : parsed.addressCountry || null,
    country_code: countryCode,
    address_line1: isDomestic ? parsed.addressLine1 || domesticAddressLine1(parsed) : parsed.addressLine1 || null,
    address_line2: isDomestic ? parsed.addressLine2 || null : parsed.addressLine2 || null,
    address_city: isDomestic ? parsed.addressCity || parsed.addressDistrict || null : parsed.addressCity || null,
    address_state_region: isDomestic ? parsed.addressStateRegion || parsed.addressProvince || null : parsed.addressStateRegion || null,
    address_postal_code_intl: isDomestic ? parsed.addressPostalCodeIntl || parsed.addressPostalCode || null : parsed.addressPostalCodeIntl || null,
    bank_name: normalizeBankName(primaryAccount?.bankName) || null,
    bank_account: primaryAccount?.accountNo || null,
    bank_account_name: primaryAccount?.bankAccount || null,
    branch_id: parsed.branchId || null,
    sales_id: parsed.salesId || null,
    sales_rep: parsed.salesName || null,
    active: parsed.active,
  }
}
