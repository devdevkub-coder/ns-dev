import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema, toIso } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.branches.update({ where: { id }, data: { active: values.active } })
    return masterDataJson({ id: row.id, code: row.code, name: row.name, active: row.active ?? true, type: null, phone: row.phone, email: null, note: null, symbol: null, rateToThb: null, parentId: null, channelType: null, bankName: null, accountNo: null, currency: null, openingBalance: null, odLimit: null, branchId: row.id, branchName: row.name, address: row.address, commissionPct: null, baseSalary: null, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) })
  } catch (caught) {
    return errorJson(caught, 'อัปเดตสถานะสาขาไม่ได้')
  }
}
