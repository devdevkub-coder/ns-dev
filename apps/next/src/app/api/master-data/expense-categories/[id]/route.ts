import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.expense_categories.update({ where: { id }, data: { active: values.active } })
    return masterDataJson({
      id: row.id,
      code: row.id,
      name: row.name,
      active: row.active ?? true,
      type: null,
      phone: null,
      email: null,
      note: null,
      symbol: null,
      rateToThb: null,
      parentId: row.parent_id,
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
    return errorJson(caught, 'อัปเดตสถานะหมวดค่าใช้จ่ายไม่ได้')
  }
}
