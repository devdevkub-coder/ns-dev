import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, normalizeCode, parseMasterDataForm, toIso, toNumber } from '@/lib/server/master-data'

export const runtime = 'nodejs'

type AccountRow = Awaited<ReturnType<typeof prisma.accounts.findMany>>[number] & {
  branches?: { name: string } | null
}

function mapAccount(row: AccountRow) {
  return {
    id: row.id,
    code: row.code ?? row.id,
    name: row.name,
    active: row.active ?? true,
    type: row.type,
    phone: null,
    email: null,
    note: null,
    symbol: null,
    rateToThb: null,
    parentId: null,
    channelType: null,
    bankName: row.bank_name ?? row.bank,
    accountNo: row.account_no,
    currency: row.currency,
    openingBalance: toNumber(row.opening_balance),
    odLimit: toNumber(row.od_limit),
    branchId: row.branch_id,
    branchName: row.branches?.name ?? row.branch_id,
    address: null,
    commissionPct: null,
    baseSalary: null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

async function getNextCode() {
  const last = await prisma.accounts.findFirst({ where: { code: { startsWith: 'ACC' } }, orderBy: { code: 'desc' }, select: { code: true } })
  return nextSequentialCode(last?.code, 'ACC')
}

export async function GET() {
  try {
    const rows = await prisma.accounts.findMany({ include: { branches: true }, orderBy: [{ code: 'asc' }, { name: 'asc' }] })
    return masterDataListJson(rows.map(mapAccount))
  } catch (caught) {
    return errorJson(caught, 'โหลดข้อมูลบัญชีเงินไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const values = parseMasterDataForm(await request.json())
    const code = normalizeCode(values.code, values.id || await getNextCode())
    const row = await prisma.accounts.upsert({
      where: { id: values.id || code },
      create: {
        id: values.id || code,
        code,
        name: values.name,
        type: values.type || 'bank',
        bank_name: values.bankName || null,
        bank: values.bankName || null,
        account_no: values.accountNo || null,
        currency: values.currency || 'THB',
        opening_balance: values.openingBalance,
        od_limit: values.odLimit,
        branch_id: values.branchId || null,
        active: values.active,
      },
      update: {
        code,
        name: values.name,
        type: values.type || 'bank',
        bank_name: values.bankName || null,
        bank: values.bankName || null,
        account_no: values.accountNo || null,
        currency: values.currency || 'THB',
        opening_balance: values.openingBalance,
        od_limit: values.odLimit,
        branch_id: values.branchId || null,
        active: values.active,
      },
      include: { branches: true },
    })
    return masterDataJson(mapAccount(row))
  } catch (caught) {
    return errorJson(caught, 'บันทึกข้อมูลบัญชีเงินไม่ได้')
  }
}
