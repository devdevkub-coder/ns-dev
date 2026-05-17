import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, normalizeCode, parseMasterDataForm } from '@/lib/server/master-data'

export const runtime = 'nodejs'

function mapExpenseCategory(row: Awaited<ReturnType<typeof prisma.expense_categories.findMany>>[number]) {
  return {
    id: row.id,
    code: row.id,
    name: row.name,
    active: row.active ?? true,
    type: null,
    phone: null,
    email: null,
    note: null,
    symbol: null,
    rateToThb: null,
    parentId: row.parent_id,
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

async function getNextCode() {
  const last = await prisma.expense_categories.findFirst({ where: { id: { startsWith: 'EXP' } }, orderBy: { id: 'desc' }, select: { id: true } })
  return nextSequentialCode(last?.id, 'EXP')
}

export async function GET() {
  try {
    const rows = await prisma.expense_categories.findMany({ orderBy: { name: 'asc' } })
    return masterDataListJson(rows.map(mapExpenseCategory))
  } catch (caught) {
    return errorJson(caught, 'โหลดข้อมูลหมวดค่าใช้จ่ายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const values = parseMasterDataForm(await request.json())
    const id = normalizeCode(values.code, values.id || await getNextCode())
    const row = await prisma.expense_categories.upsert({
      where: { id: values.id || id },
      create: { id, name: values.name, parent_id: values.parentId || null, active: values.active },
      update: { name: values.name, parent_id: values.parentId || null, active: values.active },
    })
    return masterDataJson(mapExpenseCategory(row))
  } catch (caught) {
    return errorJson(caught, 'บันทึกข้อมูลหมวดค่าใช้จ่ายไม่ได้')
  }
}
