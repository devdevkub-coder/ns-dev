import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, parseMasterDataForm } from '@/lib/server/master-data'

export const runtime = 'nodejs'

function mapDepartment(row: {
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
  const last = await prisma.departments.findFirst({
    orderBy: { code: 'desc' },
    select: { code: true },
    where: { code: { startsWith: 'DEP-' } },
  })
  return nextSequentialCode(last?.code, 'DEP-')
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await prisma.departments.findMany({
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
      select: { active: true, code: true, created_at: true, name: true, updated_at: true },
    })
    return masterDataListJson(rows.map(mapDepartment))
  } catch (caught) {
    console.error('API GET Departments Error:', caught)
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลฝ่ายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    const code = values.code || values.id || await getNextCode()
    const existing = await prisma.departments.findUnique({ select: { id: true }, where: { code } })
    const row = existing
      ? await prisma.departments.update({
          data: { active: values.active, name: values.name },
          select: { active: true, code: true, created_at: true, name: true, updated_at: true },
          where: { id: existing.id },
        })
      : await prisma.departments.create({
          data: { active: values.active, code, name: values.name },
          select: { active: true, code: true, created_at: true, name: true, updated_at: true },
        })
    return masterDataJson(mapDepartment(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลฝ่ายไม่ได้')
  }
}
