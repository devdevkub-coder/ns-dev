import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, masterDataListJson, normalizeCode, parseMasterDataForm, toIso } from '@/lib/server/master-data'

export const runtime = 'nodejs'

type WarehouseRow = Awaited<ReturnType<typeof prisma.warehouses.findMany>>[number] & {
  branches?: { name: string } | null
}

function mapWarehouse(row: WarehouseRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active ?? true,
    type: null,
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
    branchId: row.branch_id,
    branchName: row.branches?.name ?? row.branch_id,
    address: null,
    commissionPct: null,
    baseSalary: null,
    createdAt: toIso(row.created_at),
    updatedAt: null,
  }
}

export async function GET() {
  try {
    const rows = await prisma.warehouses.findMany({ include: { branches: true }, orderBy: [{ code: 'asc' }, { name: 'asc' }] })
    return masterDataListJson(rows.map(mapWarehouse))
  } catch (caught) {
    return errorJson(caught, 'โหลดข้อมูลคลังสินค้าไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const values = parseMasterDataForm(await request.json())
    const code = normalizeCode(values.code, values.id || '')
    const row = await prisma.warehouses.upsert({
      where: { id: values.id || code },
      create: { id: values.id || code, code, name: values.name, branch_id: values.branchId || null, active: values.active },
      update: { code, name: values.name, branch_id: values.branchId || null, active: values.active },
      include: { branches: true },
    })
    return masterDataJson(mapWarehouse(row))
  } catch (caught) {
    return errorJson(caught, 'บันทึกข้อมูลคลังสินค้าไม่ได้')
  }
}
