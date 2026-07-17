import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema } from '@/lib/server/master-data'
import { invalidateExpenseTypeReferenceCache } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.expense_types.update({
      data: { active: values.active },
      select: { active: true, code: true, created_at: true, name: true, updated_at: true },
      where: { code: id },
    })
    await invalidateExpenseTypeReferenceCache()
    return masterDataJson({
      id: row.code,
      code: row.code,
      name: row.name,
      active: row.active ?? true,
      type: null,
      typeLabel: null,
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
      branchId: null,
      branchName: null,
      address: null,
      commissionPct: null,
      baseSalary: null,
      createdAt: row.created_at?.toISOString() ?? null,
      updatedAt: row.updated_at?.toISOString() ?? null,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะประเภทค่าใช้จ่ายไม่ได้')
  }
}
