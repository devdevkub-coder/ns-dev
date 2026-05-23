import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, toIso, updateMasterDataStatusSchema } from '@/lib/server/master-data'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type WarehouseRow = Prisma.warehousesGetPayload<{ include: { branches: true } }>

function mapWarehouse(row: WarehouseRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active ?? true,
    type: row.type ?? null,
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

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.warehouses.update({
      data: { active: values.active },
      include: { branches: true },
      where: { id },
    })
    return masterDataJson(mapWarehouse(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะคลังไม่ได้')
  }
}
