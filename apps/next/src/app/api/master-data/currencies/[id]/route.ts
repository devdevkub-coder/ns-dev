import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, toIso, toNumber } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(_request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const row = await prisma.currencies.findUniqueOrThrow({ where: { id } })
    return masterDataJson({
      id: row.id,
      code: null,
      name: row.name,
      active: true,
      type: null,
      phone: null,
      email: null,
      note: null,
      symbol: row.symbol,
      rateToThb: toNumber(row.rate_to_thb),
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
      updatedAt: toIso(row.updated_at),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'สกุลเงินไม่มีสถานะใช้งานให้ปรับ')
  }
}
