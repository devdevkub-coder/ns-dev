import { requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, toIso, updateMasterDataStatusSchema } from '@/lib/server/master-data'
import { outwardBranchReference } from '@/lib/server/branch-reference'
import type { Prisma } from '../../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type WarehouseRow = Prisma.warehousesGetPayload<{ include: { branches: true } }>

function mapWarehouse(row: WarehouseRow) {
  const outwardId = requireBusinessCode(row.code, `คลัง ${row.id}`)
  return {
    id: outwardId,
    code: outwardId,
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
    ...outwardBranchReference(row.branches, row.branch_id),
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
    const resolved = await prisma.warehouses.findFirst({
      select: { id: true },
      where: {
        OR: [
          { code: id.toUpperCase() },
          ...(id.match(/^\d+$/) ? [{ id: BigInt(id) }] : []),
        ],
      },
    })
    if (!resolved) throw new Error('ไม่พบคลังที่ต้องการอัปเดต')
    const row = await prisma.warehouses.update({
      data: { active: values.active },
      include: { branches: true },
      where: { id: resolved.id },
    })
    return masterDataJson(mapWarehouse(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะคลังไม่ได้')
  }
}
