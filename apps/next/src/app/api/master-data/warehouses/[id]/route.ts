import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema, toIso } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.warehouses.update({ where: { id }, data: { active: values.active }, include: { branches: true } })
    return masterDataJson({ id: row.id, code: row.code, name: row.name, active: row.active ?? true, type: null, phone: null, email: null, note: null, symbol: null, rateToThb: null, parentId: null, channelType: null, bankName: null, accountNo: null, currency: null, openingBalance: null, odLimit: null, branchId: row.branch_id, branchName: row.branches?.name ?? row.branch_id, address: null, commissionPct: null, baseSalary: null, createdAt: toIso(row.created_at), updatedAt: null })
  } catch (caught) {
    return errorJson(caught, 'อัปเดตสถานะคลังสินค้าไม่ได้')
  }
}
