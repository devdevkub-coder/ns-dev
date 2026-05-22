import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, masterDataListJson, normalizeCode, parseMasterDataForm, toIso } from '@/lib/server/master-data'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type WarehouseRow = Prisma.warehousesGetPayload<{ include: { branches: true } }>

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
    branchName: row.branches?.name ?? null,
    address: null,
    commissionPct: null,
    baseSalary: null,
    createdAt: toIso(row.created_at),
    updatedAt: null,
  }
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await prisma.warehouses.findMany({
      include: { branches: true },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    })
    return masterDataListJson(rows.map(mapWarehouse))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'โหลดข้อมูลคลังไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = parseMasterDataForm(await request.json())
    const code = normalizeCode(values.code, values.id || '')
    const id = values.id || code
    const row = await prisma.warehouses.upsert({
      where: { id },
      create: {
        active: values.active,
        branch_id: values.branchId || null,
        code,
        id,
        name: values.name,
      },
      update: {
        active: values.active,
        branch_id: values.branchId || null,
        code,
        name: values.name,
      },
      include: { branches: true },
    })
    return masterDataJson(mapWarehouse(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'บันทึกข้อมูลคลังไม่ได้')
  }
}
