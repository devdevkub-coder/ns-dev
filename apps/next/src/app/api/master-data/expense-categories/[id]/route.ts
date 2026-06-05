import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.expense_categories.update({
      where: { code: id },
      data: { active: values.active },
      include: { expense_types: { select: { code: true, name: true } } },
    })
    return masterDataJson({
      id: row.code,
      code: row.code,
      name: row.name,
      active: row.active ?? true,
      type: row.expense_types?.code ?? null,
      typeLabel: row.expense_types?.name ?? null,
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
      createdAt: null,
      updatedAt: null,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะหมวดค่าใช้จ่ายไม่ได้')
  }
}
