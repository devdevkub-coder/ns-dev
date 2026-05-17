import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, masterDataListJson, normalizeCode, parseMasterDataForm, toIso } from '@/lib/server/master-data'

export const runtime = 'nodejs'

function mapBranch(row: Awaited<ReturnType<typeof prisma.branches.findMany>>[number]) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active ?? true,
    type: null,
    phone: row.phone,
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
    branchId: row.id,
    branchName: row.name,
    address: row.address,
    commissionPct: null,
    baseSalary: null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

export async function GET() {
  try {
    const rows = await prisma.branches.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }] })
    return masterDataListJson(rows.map(mapBranch))
  } catch (caught) {
    return errorJson(caught, 'โหลดข้อมูลสาขาไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const values = parseMasterDataForm(await request.json())
    const code = normalizeCode(values.code, values.id || '')
    const row = await prisma.branches.upsert({
      where: { id: values.id || code },
      create: { id: values.id || code, code, name: values.name, phone: values.phone || null, address: values.address || null, active: values.active },
      update: { code, name: values.name, phone: values.phone || null, address: values.address || null, active: values.active },
    })
    return masterDataJson(mapBranch(row))
  } catch (caught) {
    return errorJson(caught, 'บันทึกข้อมูลสาขาไม่ได้')
  }
}
