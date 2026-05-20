import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema, toIso } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.salespersons.update({ where: { id }, data: { active: values.active } })
    return masterDataJson({
      id: row.id,
      code: row.code ?? row.id,
      name: row.name,
      active: row.active ?? true,
      type: null,
      phone: row.phone,
      email: row.email,
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
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะพนักงานขายไม่ได้')
  }
}
