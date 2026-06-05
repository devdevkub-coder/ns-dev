import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, parseMasterDataForm } from '@/lib/server/master-data'

export const runtime = 'nodejs'

function mapExpenseType(row: {
  active: boolean | null
  code: string
  created_at: Date | null
  name: string
  updated_at: Date | null
}) {
  return {
    id: row.code,
    code: row.code,
    name: row.name,
    active: row.active ?? true,
    type: null,
    typeLabel: null,
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
    branchName: null,
    address: null,
    commissionPct: null,
    baseSalary: null,
    createdAt: row.created_at?.toISOString() ?? null,
    updatedAt: row.updated_at?.toISOString() ?? null,
  }
}

async function getNextCode() {
  const last = await prisma.expense_types.findFirst({
    orderBy: { code: 'desc' },
    select: { code: true },
    where: { code: { startsWith: 'EXT-' } },
  })
  return nextSequentialCode(last?.code, 'EXT-')
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await prisma.expense_types.findMany({
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      select: { active: true, code: true, created_at: true, name: true, updated_at: true },
    })
    return masterDataListJson(rows.map(mapExpenseType))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลประเภทค่าใช้จ่ายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    const code = values.code || values.id || await getNextCode()
    const existing = await prisma.expense_types.findUnique({ select: { id: true }, where: { code } })
    const row = existing
      ? await prisma.expense_types.update({
          data: { active: values.active, name: values.name },
          select: { active: true, code: true, created_at: true, name: true, updated_at: true },
          where: { id: existing.id },
        })
      : await prisma.expense_types.create({
          data: { active: values.active, code, name: values.name },
          select: { active: true, code: true, created_at: true, name: true, updated_at: true },
        })
    return masterDataJson(mapExpenseType(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลประเภทค่าใช้จ่ายไม่ได้')
  }
}
