import { z } from 'zod'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { accountMasterDataFormSchema } from '@/lib/master-data'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, normalizeCode, toIso, toNumber } from '@/lib/server/master-data'
import { findActiveBranchReferenceByCodeOrId, outwardBranchReference } from '@/lib/server/branch-reference'

export const runtime = 'nodejs'

type AccountRow = Awaited<ReturnType<typeof prisma.accounts.findMany>>[number] & {
  branches?: { code: string; name: string } | null
}

const accountTypeSchema = z.string().trim().min(1, 'เลือกประเภท')
const accountSubtypeSchema = z.enum(['cash', 'savings', 'current', 'fcd', 'od'])

function accountTypeLabel(type: string | null | undefined) {
  return type ? String(type) : null
}

function paymentMethodGroupForName(
  paymentMethodTypes: Map<string, 'cash' | 'bank'>,
  paymentMethodName: string | null | undefined,
) {
  if (!paymentMethodName) return null
  return paymentMethodTypes.get(String(paymentMethodName).trim()) ?? null
}

function normalizeAccountSubtype(
  row: { currency?: string | null; od_limit?: unknown; subtype?: string | null; type?: string | null },
  paymentMethodTypes: Map<string, 'cash' | 'bank'>,
) {
  if (row.subtype === 'savings' || row.subtype === 'current' || row.subtype === 'cash' || row.subtype === 'fcd' || row.subtype === 'od') return row.subtype
  if (row.subtype === 'bank' || row.subtype === 'other') return 'savings'
  if (paymentMethodGroupForName(paymentMethodTypes, row.type) === 'cash') return 'cash'
  if (Number(row.od_limit ?? 0) > 0) return 'od'
  if (String(row.currency ?? 'THB').toUpperCase() !== 'THB') return 'fcd'
  if (paymentMethodGroupForName(paymentMethodTypes, row.type) === 'bank') return 'savings'
  return 'savings'
}

function accountSubtypeLabel(
  row: { currency?: string | null; od_limit?: unknown; subtype?: string | null; type?: string | null },
  paymentMethodTypes: Map<string, 'cash' | 'bank'>,
) {
  const subtype = normalizeAccountSubtype(row, paymentMethodTypes)
  if (subtype === 'cash') return 'เงินสด'
  if (subtype === 'savings') return 'ออมทรัพย์'
  if (subtype === 'current') return 'กระแสรายวัน'
  if (subtype === 'fcd') return 'FCD'
  if (subtype === 'od') return 'OD'
  return subtype
}

function validateAccountBusinessRules(values: {
  accountNo: string | null
  bankName: string | null
  branchId: string | null
  currency: string | null
  odLimit: number | null
  subtype: z.infer<typeof accountSubtypeSchema>
}) {
  const currency = String(values.currency ?? '').trim().toUpperCase()

  if (!values.branchId) {
    throw new Error('เลือกสาขา')
  }

  if (!values.currency) {
    throw new Error('กรอกสกุลเงิน')
  }

  if (values.subtype !== 'cash') {
    if (!values.bankName) throw new Error('เลือกธนาคาร')
    if (!values.accountNo) throw new Error('กรอกเลขที่บัญชี')
  }

  if (values.subtype === 'fcd' && currency === 'THB') {
    throw new Error('บัญชี FCD ต้องใช้สกุลเงินที่ไม่ใช่ THB')
  }

  if ((values.subtype === 'savings' || values.subtype === 'current' || values.subtype === 'od') && currency && currency !== 'THB') {
    throw new Error('บัญชีประเภทนี้ต้องใช้สกุลเงิน THB')
  }

  if (values.subtype === 'od' && (!values.odLimit || values.odLimit <= 0)) {
    throw new Error('กรอกวงเงิน OD มากกว่า 0')
  }
}

function mapAccount(row: AccountRow, paymentMethodTypes: Map<string, 'cash' | 'bank'>) {
  const outwardId = requireBusinessCode(row.code, `บัญชีเงิน ${row.id}`)
  return {
    id: outwardId,
    code: outwardId,
    name: row.name,
    active: row.active ?? true,
    type: row.type,
    typeLabel: accountTypeLabel(row.type),
    subtype: normalizeAccountSubtype(row, paymentMethodTypes),
    subtypeLabel: accountSubtypeLabel(row, paymentMethodTypes),
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
    openingBalance: toNumber(row.opening_balance),
    odLimit: toNumber(row.od_limit),
    ...outwardBranchReference(row.branches, row.branch_id),
    address: null,
    commissionPct: null,
    baseSalary: null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

async function getPaymentMethodTypes() {
  const rows = await prisma.payment_methods.findMany({
    select: { name: true, type: true },
    where: { active: true },
  })
  return new Map(rows.map((row) => [row.name, row.type === 'cash' ? 'cash' : 'bank'] as const))
}

async function getNextAccountCode() {
  const rows = await prisma.accounts.findMany({
    orderBy: { code: 'desc' },
    select: { code: true },
    where: { code: { startsWith: 'ACC' } },
  })
  const lastNumber = rows.reduce((max, row) => {
    const matched = String(row.code ?? '').match(/^ACC(\d+)$/i)
    const value = matched ? Number(matched[1]) : 0
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return `ACC${String(lastNumber + 1).padStart(3, '0')}`
}

async function assertActiveBankName(bankName: string | null) {
  if (!bankName) return

  const bank = await prisma.bank_names.findFirst({
    select: { id: true },
    where: {
      active: true,
      name: bankName,
    },
  })

  if (!bank) {
    throw new Error('ชื่อธนาคารที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }
}

async function assertActivePaymentMethod(paymentMethodName: string | null) {
  const paymentMethod = String(paymentMethodName ?? '').trim()

  if (!paymentMethod) {
    throw new Error('เลือกประเภท')
  }

  const row = await prisma.payment_methods.findFirst({
    select: { id: true, type: true },
    where: {
      active: true,
      name: paymentMethod,
    },
  })

  if (!row) {
    throw new Error('ประเภทที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
  }

  return row.type === 'cash' ? 'cash' : 'bank'
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const paymentMethodTypes = await getPaymentMethodTypes()
    const rows = await prisma.accounts.findMany({ include: { branches: true }, orderBy: [{ code: 'asc' }, { name: 'asc' }, { account_no: 'asc' }] })
    return masterDataListJson(rows.map((row) => mapAccount(row, paymentMethodTypes)))
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
        select: { id: true },
        where: {
          OR: [
            { code: values.id.toUpperCase() },
            ...(parseInternalBigIntId(values.id) != null ? [{ id: parseInternalBigIntId(values.id) as bigint }] : []),
          ],
        } as any,
      })
      : null
    const code = normalizeCode(values.code, values.id || await getNextAccountCode())
    const accountType = accountTypeSchema.parse(values.type)
    const paymentMethodGroup = await assertActivePaymentMethod(accountType)
    const accountSubtype = paymentMethodGroup === 'cash'
      ? 'cash'
      : accountSubtypeSchema.parse(values.subtype || 'savings')
    validateAccountBusinessRules({
      accountNo: values.accountNo,
      bankName: values.bankName,
      branchId: values.branchId,
      currency: values.currency,
      odLimit: values.odLimit,
      subtype: accountSubtype,
    })
    await assertActiveBankName(values.bankName)
    const branch = await findActiveBranchReferenceByCodeOrId(values.branchId)
    if (!branch) {
      throw new Error('สาขาที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
    }
    const data = {
      code,
      name: values.name,
      type: accountType,
      subtype: accountSubtype,
      bank_name: values.bankName || null,
      bank_branch: values.bankBranch || null,
      bank: values.bankName || null,
      account_no: values.accountNo || null,
      currency: values.currency || 'THB',
      opening_balance: values.openingBalance,
      od_limit: values.odLimit,
      branch_id: branch.id,
      active: values.active,
    }
    const row = existing
      ? await prisma.accounts.update({
        where: { id: existing.id },
        data,
        include: { branches: true },
      })
      : await prisma.accounts.create({
        data,
        include: { branches: true },
      })
    const paymentMethodTypes = await getPaymentMethodTypes()
    return masterDataJson(mapAccount(row, paymentMethodTypes))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลบัญชีเงินไม่ได้')
  }
}
