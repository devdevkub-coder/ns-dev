import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, parseMasterDataForm } from '@/lib/server/master-data'

export const runtime = 'nodejs'

type ExpenseCategoryRow = Awaited<ReturnType<typeof prisma.expense_categories.findMany>>[number] & {
  expense_types?: {
    code: string
    name: string
    active: boolean | null
  } | null
}

function mapExpenseCategory(row: ExpenseCategoryRow) {
  return {
    id: row.code,
    code: row.code,
    name: row.name,
    active: row.active ?? true,
    type: row.expense_types?.code ?? null,
    typeLabel: row.expense_types?.name ?? null,
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
    createdAt: null,
    updatedAt: null,
  }
}

async function getNextId() {
  const last = await prisma.expense_categories.findFirst({ where: { code: { startsWith: 'EXC-' } }, orderBy: { code: 'desc' }, select: { code: true } })
  return nextSequentialCode(last?.code, 'EXC-')
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await prisma.expense_categories.findMany({
      include: { expense_types: { select: { code: true, name: true, active: true } } },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    })
    return masterDataListJson(rows.map(mapExpenseCategory))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลหมวดค่าใช้จ่ายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    let expenseTypeId: bigint | null = null
    if (values.type) {
      const expenseType = await prisma.expense_types.findFirst({
        where: { active: true, code: values.type },
        select: { id: true },
      })
      if (!expenseType) throw new Error('ประเภทค่าใช้จ่ายที่เลือกไม่ถูกต้องหรือถูกปิดใช้งาน')
      expenseTypeId = expenseType.id
    }
    const code = values.code || values.id || await getNextId()
    const existing = await prisma.expense_categories.findUnique({ select: { id: true }, where: { code } })
    const row = existing
      ? await prisma.expense_categories.update({
          data: { active: values.active, code, expense_type_id: expenseTypeId, name: values.name },
          include: { expense_types: { select: { code: true, name: true, active: true } } },
          where: { id: existing.id },
        })
      : await prisma.expense_categories.create({
          data: { active: values.active, code, expense_type_id: expenseTypeId, name: values.name },
          include: { expense_types: { select: { code: true, name: true, active: true } } },
        })
    return masterDataJson(mapExpenseCategory(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลหมวดค่าใช้จ่ายไม่ได้')
  }
}
