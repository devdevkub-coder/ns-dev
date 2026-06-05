import { requireBusinessCode } from '@/lib/business-code'
import {
  resolveSupplierPaymentMethodName,
  supplierFormSchema,
  supplierPaymentMethodGroup,
  supplierSchema,
  type Supplier,
  type SupplierFormValues,
  type SupplierPaymentMethodRecord,
} from '@/lib/supplier'
import { z } from 'zod'

type PrismaSupplier = {
  id: bigint
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
  branch_id: bigint | null
  sales_id: bigint | null
  sales_rep: string | null
  active: boolean | null
  created_at: Date | null
  updated_at: Date | null
  branches?: { code: string | null; name: string } | null
  supplier_bank_accounts?: Array<{
    code: string | null
    id: bigint
    payment_method: string | null
    account_no: string | null
    account_name: string | null
    branch_code: string | null
    is_primary: boolean | null
    active: boolean | null
    bank_name_id: bigint | null
    bank_names?: {
      code: string | null
      name: string
    } | null
  }>
}

type SupplierBankAccountWriteRow = {
  code: string
  supplier_id: bigint
  payment_method: string
  bank_name_id: bigint | null
  account_no: string | null
  account_name: string | null
  branch_code: string | null
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

type BankNameReference = {
  id: bigint
  name: string
}

function primarySupplierBankAccount(row: PrismaSupplier) {
  const accounts = row.supplier_bank_accounts ?? []
  return accounts.find((account) => account.is_primary) ?? accounts[0] ?? null
}

function primaryBankAccount(values: SupplierFormValues, paymentMethods: SupplierPaymentMethodRecord[]) {
  const accounts = values.bankAccounts
    .map((account) => ({
      ...account,
      bankName: normalizeBankName(account.bankName),
      accountNo: normalizeAccountNo(account.accountNo),
      paymentMethod: resolveSupplierPaymentMethodName(account.paymentMethod, paymentMethods),
      paymentMethodGroup: supplierPaymentMethodGroup(account.paymentMethod, paymentMethods),
    }))
    .filter((account): account is typeof account & { accountNo: string; paymentMethod: string } => account.paymentMethodGroup === 'bank' && Boolean(account.accountNo) && Boolean(account.paymentMethod))
  return accounts.find((account) => account.isPrimary) ?? accounts[0] ?? null
}

export function supplierBankAccountRows(
  values: SupplierFormValues,
  supplierId: bigint,
  supplierCode: string,
  paymentMethods: SupplierPaymentMethodRecord[],
  bankNamesByName: Map<string, BankNameReference>,
) {
  const parsed = supplierFormSchema.parse(values)
  const seenAccountNos = new Set<string>()
  const rows: SupplierBankAccountWriteRow[] = []
  parsed.bankAccounts.forEach((account, index) => {
    const paymentMethod = resolveSupplierPaymentMethodName(account.paymentMethod, paymentMethods)
    const paymentMethodGroup = supplierPaymentMethodGroup(account.paymentMethod, paymentMethods)
    if (!paymentMethod || !paymentMethodGroup) return

    if (paymentMethodGroup === 'cash') {
      rows.push({
        code: `${supplierCode}-BA${String(rows.length + 1).padStart(2, '0')}`,
        supplier_id: supplierId,
        payment_method: paymentMethod,
        bank_name_id: null,
        account_no: null,
        account_name: null,
        branch_code: null,
        is_primary: index === 0 || account.isPrimary,
        active: account.active,
      })
      return
    }

    const accountNo = normalizeAccountNo(account.accountNo)
    const bankName = normalizeBankName(account.bankName)
    const bankNameReference = bankName ? bankNamesByName.get(bankName) ?? null : null
    if (!accountNo || seenAccountNos.has(accountNo)) return
    if (!bankNameReference) {
      throw new z.ZodError([{
        code: 'custom',
        message: `ไม่พบธนาคาร "${bankName ?? ''}" ใน master bank names`,
        path: ['bankAccounts', index, 'bankName'],
      }])
    }
    seenAccountNos.add(accountNo)

    rows.push({
      code: `${supplierCode}-BA${String(rows.length + 1).padStart(2, '0')}`,
      supplier_id: supplierId,
      payment_method: paymentMethod,
      bank_name_id: bankNameReference?.id ?? null,
      account_no: accountNo,
      account_name: account.bankAccount || null,
      branch_code: account.branchCode || null,
      is_primary: index === 0 || account.isPrimary,
      active: account.active,
    })
  })

  if (!rows.some((row) => row.is_primary) && rows[0]) rows[0].is_primary = true
  return rows
}

export function mapPrismaSupplier(
  row: PrismaSupplier,
  paymentMethods: SupplierPaymentMethodRecord[] = [],
  overrides?: {
    salesId?: string | null
  },
): Supplier {
  const outwardId = requireBusinessCode(row.code, `ผู้ขาย ${row.id}`)
  const primaryAccount = primarySupplierBankAccount(row)
  return supplierSchema.parse({
    id: outwardId,
    code: outwardId,
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
    bankName: normalizeBankName(primaryAccount?.bank_names?.name),
    accountNo: normalizeAccountNo(primaryAccount?.account_no),
    bankAccount: primaryAccount?.account_name ?? null,
    bankAccounts: (row.supplier_bank_accounts ?? []).map((account) => ({
      id: requireBusinessCode(account.code, `บัญชีรับเงินผู้ขาย ${account.id}`),
      paymentMethod: resolveSupplierPaymentMethodName(account.payment_method, paymentMethods) ?? (String(account.payment_method ?? '').trim() || 'เงินสด'),
      bankName: normalizeBankName(account.bank_names?.name),
      accountNo: normalizeAccountNo(account.account_no),
      bankAccount: account.account_name,
      branchCode: account.branch_code,
      isPrimary: account.is_primary ?? false,
      active: account.active ?? true,
    })),
    branchId: row.branches?.code ?? null,
    branchName: row.branches?.name ?? null,
    salesId: overrides?.salesId ?? null,
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

export function toSupplierWriteInput(
  values: SupplierFormValues,
  paymentMethods: SupplierPaymentMethodRecord[],
  branchId?: bigint | null,
  overrides?: {
    salesId?: bigint | null
    salesName?: string | null
  },
) {
  const parsed = supplierFormSchema.parse(values)
  const code = (parsed.code || parsed.id || '').toUpperCase()
  const personName = [parsed.nameTitle, parsed.firstName, parsed.lastName].map((part) => part?.trim()).filter(Boolean).join(' ')
  const name = parsed.type === 'บุคคล' ? personName || parsed.name : parsed.name
  const isDomestic = parsed.marketScope === 'ในประเทศ'
  const countryCode = isDomestic ? 'TH' : parsed.countryCode?.toUpperCase() ?? null

  return {
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
    branch_id: branchId ?? null,
    sales_id: overrides?.salesId ?? null,
    sales_rep: overrides?.salesName ?? (parsed.salesName || null),
    active: parsed.active,
  }
}
