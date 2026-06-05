import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, toIso, toNumber } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(_request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const row = await prisma.currencies.findFirstOrThrow({
      where: {
        OR: [{ code: id.toUpperCase() }, ...(parseInternalBigIntId(id) != null ? [{ id: parseInternalBigIntId(id) as bigint }] : [])],
      } as any,
    })
    const outwardId = requireBusinessCode(row.code, `สกุลเงิน ${row.id}`)
    return masterDataJson({
      id: outwardId,
      code: outwardId,
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
