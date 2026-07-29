import { z } from 'zod'
import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { accountMasterDataFormSchema } from '@/lib/master-data'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, toIso, toNumber } from '@/lib/server/master-data'
import { findActiveBranchReferenceByCodeOrId, outwardBranchReference } from '@/lib/server/branch-reference'
import { findActiveBankNameReferenceByName, invalidateAccountReferenceCache } from '@/lib/server/reference-master-cache'
import { buildCompanyAccountCurrencyBalances } from '@/lib/company-account-currency'

export const runtime = 'nodejs'

type AccountRow = Awaited<ReturnType<typeof prisma.accounts.findMany>>[number] & {
  branches?: { code: string; name: string } | null
  account_categories?: { name: string } | null
  account_currency_balances?: Array<{ currency_code: string; opening_balance: unknown; active: boolean }>
}

const accountGroupSchema = z.string().trim().min(1, 'เลือกประเภทบัญชี')
const bankAccountTypeSchema = z.enum(['savings', 'current'])

function accountTypeLabel(type: string | null | undefined) {
  if (type === 'cash') return 'เงินสด'
  if (type === 'bank') return 'บัญชีธนาคาร'
  if (type === 'virtual') return 'บัญชีเจ้าหนี้เงินทดรองจ่าย'
  return type ? String(type) : null
}

function normalizeAccountSubtype(
  row: { account_group: string; bank_account_type?: string | null },
) {
  if (row.account_group === 'cash') return 'cash'
  if (row.account_group === 'virtual') return 'virtual'
  if (row.bank_account_type === 'savings' || row.bank_account_type === 'current') return row.bank_account_type
  throw new Error(`บัญชีธนาคาร ${row.account_group} ไม่มีประเภทบัญชีธนาคารที่ถูกต้อง`)
}

function accountSubtypeLabel(
  row: { account_group: string; bank_account_type?: string | null },
) {
  const subtype = normalizeAccountSubtype(row)
  if (subtype === 'cash') return 'เงินสด'
  if (subtype === 'virtual') return 'เจ้าหนี้เงินทดรองจ่าย'
  if (subtype === 'savings') return 'ออมทรัพย์'
  if (subtype === 'current') return 'กระแสรายวัน'
  return subtype
}

function validateAccountBusinessRules(values: {
  accountGroup: z.infer<typeof accountGroupSchema>
  accountNo: string | null
  bankName: string | null
  bankAccountType: z.infer<typeof bankAccountTypeSchema> | null
  branchId: string | null
  currency: string | null
  isFcd: boolean
  hasOd: boolean
  openingBalance: number | null
  odLimit: number | null
}) {
  const currency = String(values.currency ?? '').trim().toUpperCase()

  if (!values.branchId) {
    throw new Error('เลือกสาขา')
  }

  if (values.openingBalance !== null && values.openingBalance < 0) {
    throw new Error('ยอดตั้งต้นบัญชีนี้ต้องไม่ติดลบ')
  }

  if (values.accountGroup !== 'bank' && !values.currency) throw new Error('กรอกสกุลเงิน')

  if (values.accountGroup === 'bank') {
    if (!values.bankName) throw new Error('เลือกธนาคาร')
    if (!values.accountNo) throw new Error('กรอกเลขที่บัญชี')
    if (!values.bankAccountType) throw new Error('เลือกประเภทบัญชีธนาคาร')
  } else if (values.accountGroup === 'virtual') {
    if (values.isFcd || (values.odLimit ?? 0) > 0) throw new Error('บัญชีเจ้าหนี้เงินทดรองจ่ายไม่รองรับ FCD หรือ OD')
  } else if (values.isFcd || values.hasOd || (values.odLimit ?? 0) > 0) {
    throw new Error('บัญชีเงินสดไม่รองรับ FCD หรือ OD')
  }

  if (values.bankAccountType !== 'current' && values.odLimit && values.odLimit > 0) {
    throw new Error('เฉพาะบัญชีกระแสรายวันเท่านั้นที่สามารถมีวงเงิน OD ได้')
  }

  if (values.hasOd && values.bankAccountType !== 'current') {
    throw new Error('วงเงิน OD ใช้ได้เฉพาะบัญชีกระแสรายวัน')
  }
  if (values.hasOd && (!values.odLimit || values.odLimit <= 0)) {
    throw new Error('กรอกวงเงิน OD มากกว่า 0')
  }

}

async function resolveAccountCurrencyBalances(values: z.infer<typeof accountMasterDataFormSchema>, accountGroup: string) {
  const unique = buildCompanyAccountCurrencyBalances({
    accountGroup,
    additionalBalances: values.accountCurrencyBalances ?? [],
    isFcd: values.isFcd,
    openingBalance: values.openingBalance,
    primaryCurrency: values.currency,
  })
  const currencyRows = await prisma.currencies.findMany({ select: { code: true }, where: { code: { in: unique.map((entry) => entry.currency) } } })
  if (currencyRows.length !== unique.length) throw new Error('มีสกุลเงินที่ไม่ถูกต้องหรือถูกปิดใช้งาน')
  return unique
}

function mapAccount(row: AccountRow) {
  const outwardId = requireBusinessCode(row.code, `บัญชีเงิน ${row.id}`)
  const odLimit = toNumber(row.od_limit) ?? 0
  const currencyDisplay = Array.from(new Set([
    ...(row.account_currency_balances ?? []).map((balance) => balance.currency_code),
    row.currency,
  ].filter((currency): currency is string => Boolean(currency))))
    .sort((left, right) => {
      if (left === row.currency) return -1
      if (right === row.currency) return 1
      return left.localeCompare(right)
    })
    .join(', ')

  return {
    id: outwardId,
    code: outwardId,
    name: row.name,
    active: row.active ?? true,
    type: row.account_group,
  typeLabel: row.account_categories?.name ?? accountTypeLabel(row.account_group),
    subtype: normalizeAccountSubtype(row),
    subtypeLabel: accountSubtypeLabel(row),
    accountGroup: row.account_group,
    bankAccountType: row.bank_account_type,
    isFcd: row.is_fcd,
    phone: null,
    email: null,
    note: null,
    symbol: null,
    rateToThb: null,
    parentId: null,
    channelType: null,
    bankName: row.bank_name ?? row.bank,
    bankBranch: row.bank_branch,
    accountNo: row.account_no,
    currency: row.currency,
    currencyDisplay: currencyDisplay || null,
    openingBalance: toNumber(row.opening_balance),
    hasOd: odLimit > 0,
    accountCurrencyBalances: (row.account_currency_balances ?? []).map((balance) => ({
      currency: balance.currency_code,
      openingBalance: toNumber(balance.opening_balance as number | null),
    })),
    odLimit,
    ...outwardBranchReference(row.branches, row.branch_id),
    address: null,
    commissionPct: null,
    baseSalary: null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

function accountCodePrefix(branchCode: string) {
  const normalizedBranchCode = String(branchCode).trim().toUpperCase()
  if (!normalizedBranchCode || !/^[A-Z0-9_-]+$/.test(normalizedBranchCode)) {
    throw new Error('สาขาที่เลือกไม่มีรหัสสาขา')
  }
  return `ACC${normalizedBranchCode}-`
}

async function getNextAccountCode(branchCode: string) {
  const prefix = accountCodePrefix(branchCode)
  const rows = await prisma.accounts.findMany({
    orderBy: { code: 'desc' },
    select: { code: true },
    where: { code: { startsWith: prefix } },
  })
  const lastNumber = rows.reduce((max: number, row: { code: string | null }) => {
    const matched = String(row.code ?? '').match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`, 'i'))
    const value = matched ? Number(matched[1]) : 0
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  const nextNumber = lastNumber + 1
  if (nextNumber > 999) {
    throw new Error(`รหัสบัญชีสาขา ${branchCode} เกินลำดับสูงสุด 999`)
  }
  return `${prefix}${String(nextNumber).padStart(3, '0')}`
}

async function resolveAccountCode(branchCode: string, currentCode: string | null | undefined) {
  const prefix = accountCodePrefix(branchCode)
  const normalizedCurrentCode = String(currentCode ?? '').trim().toUpperCase()
  if (new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d{3}$`, 'i').test(normalizedCurrentCode)) {
    return normalizedCurrentCode
  }
  return getNextAccountCode(branchCode)
}

async function assertActiveBankName(bankName: string | null) {
  if (!bankName) return

  const bank = await findActiveBankNameReferenceByName(bankName)

  if (!bank) {
    throw new Error('ชื่อธนาคารที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await prisma.accounts.findMany({ include: { account_categories: true, branches: true, account_currency_balances: true }, orderBy: [{ code: 'asc' }, { name: 'asc' }, { account_no: 'asc' }] })
    return masterDataListJson(rows.map((row: Awaited<ReturnType<typeof prisma.accounts.findMany>>[number]) => mapAccount(row)))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลบัญชีเงินไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = accountMasterDataFormSchema.parse(await request.json())
    const existing = values.id
      ? await prisma.accounts.findFirst({
        select: { code: true, id: true },
        where: { code: values.id.toUpperCase() },
      })
      : null
    const accountGroup = accountGroupSchema.parse(values.accountGroup)
    const accountCategory = await prisma.account_categories.findFirst({
      select: { account_group: true, code: true },
      where: { active: true, code: accountGroup },
    })
    if (!accountCategory) throw new Error('ประเภทบัญชีไม่ถูกต้องหรือถูกปิดใช้งาน')
    if (accountCategory.account_group !== accountGroup) throw new Error('ประเภทบัญชีมีการตั้งค่าไม่ถูกต้อง')
    const bankAccountType = accountGroup === 'bank'
      ? bankAccountTypeSchema.parse(values.bankAccountType)
      : null
    const currencyBalances = await resolveAccountCurrencyBalances(values, accountGroup)
    validateAccountBusinessRules({
      accountGroup,
      accountNo: values.accountNo,
      bankName: values.bankName,
      bankAccountType,
      branchId: values.branchId,
      currency: values.currency,
    isFcd: values.isFcd,
      hasOd: values.hasOd,
      openingBalance: values.openingBalance,
      odLimit: values.odLimit,
    })
    await assertActiveBankName(values.bankName)
    const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
    if (!branch) {
      throw new Error('สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
    }
    const code = await resolveAccountCode(branch.code, existing?.code)
    const primaryCurrency = String(values.currency).trim().toUpperCase()
    const primaryBalance = currencyBalances.find((entry) => entry.currency === primaryCurrency)?.openingBalance ?? 0
    const data = {
      code,
      name: values.name,
      type: accountGroup,
      account_group: accountGroup,
      bank_account_type: bankAccountType,
      is_fcd: accountGroup === 'bank' ? values.isFcd : false,
      subtype: accountGroup === 'cash' ? 'cash' : accountGroup === 'virtual' ? 'reimbursement_payable' : bankAccountType,
      bank_name: accountGroup === 'bank' ? values.bankName || null : null,
      bank_branch: accountGroup === 'bank' ? values.bankBranch || null : null,
      bank: accountGroup === 'bank' ? values.bankName || null : null,
      account_no: accountGroup === 'bank' ? values.accountNo || null : null,
      currency: primaryCurrency,
      opening_balance: primaryBalance,
      od_limit: values.hasOd && bankAccountType === 'current' ? values.odLimit ?? 0 : 0,
      branch_id: branch.id,
      active: values.active,
    }
    const row = existing
      ? await prisma.accounts.update({
        where: { id: existing.id },
        data: { ...data, account_currency_balances: { deleteMany: {}, create: currencyBalances.map((entry) => ({ currency_code: entry.currency, opening_balance: entry.openingBalance })) } },
        include: { branches: true, account_currency_balances: true },
      })
      : await prisma.accounts.create({
        data: { ...data, account_currency_balances: { create: currencyBalances.map((entry) => ({ currency_code: entry.currency, opening_balance: entry.openingBalance })) } },
        include: { branches: true, account_currency_balances: true },
      })
    await invalidateAccountReferenceCache()
    return masterDataJson(mapAccount(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลบัญชีเงินไม่ได้')
  }
}
