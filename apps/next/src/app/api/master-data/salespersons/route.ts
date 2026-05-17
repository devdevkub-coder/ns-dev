import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, masterDataListJson, nextSequentialCode, normalizeCode, parseMasterDataForm, toIso, toNumber } from '@/lib/server/master-data'

export const runtime = 'nodejs'

function mapSalesperson(row: Awaited<ReturnType<typeof prisma.salespersons.findMany>>[number]) {
  return {
    id: row.id,
    code: row.code ?? row.id,
    name: row.name,
    active: row.active ?? true,
    type: null,
    phone: row.phone,
    email: row.email,
    note: row.note,
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
    commissionPct: toNumber(row.commission_pct),
    baseSalary: toNumber(row.base_salary),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

async function getNextCode() {
  const last = await prisma.salespersons.findFirst({ where: { code: { startsWith: 'SAL' } }, orderBy: { code: 'desc' }, select: { code: true } })
  return nextSequentialCode(last?.code, 'SAL')
}

export async function GET() {
  try {
    const rows = await prisma.salespersons.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }] })
    return masterDataListJson(rows.map(mapSalesperson))
  } catch (caught) {
    return errorJson(caught, 'โหลดข้อมูลพนักงานขายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const values = parseMasterDataForm(await request.json())
    const code = normalizeCode(values.code, values.id || await getNextCode())
    const row = await prisma.salespersons.upsert({
      where: { id: values.id || code },
      create: {
        id: values.id || code,
        code,
        name: values.name,
        phone: values.phone || null,
        email: values.email || null,
        commission_pct: values.commissionPct,
        base_salary: values.baseSalary,
        note: values.note || null,
        active: values.active,
      },
      update: {
        code,
        name: values.name,
        phone: values.phone || null,
        email: values.email || null,
        commission_pct: values.commissionPct,
        base_salary: values.baseSalary,
        note: values.note || null,
        active: values.active,
      },
    })
    return masterDataJson(mapSalesperson(row))
  } catch (caught) {
    return errorJson(caught, 'บันทึกข้อมูลพนักงานขายไม่ได้')
  }
}
