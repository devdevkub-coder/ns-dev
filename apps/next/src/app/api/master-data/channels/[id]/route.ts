import { prisma } from '@/lib/server/prisma'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema } from '@/lib/server/master-data'

export const runtime = 'nodejs'

function channelId(value: string) {
  const [type, ...rest] = value.split(':')
  return { type: type === 'sales' ? 'sales' : 'purchase', id: rest.join(':') || value }
}

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const parsed = channelId(id)

    if (parsed.type === 'sales') {
      const row = await prisma.sales_channels.update({ where: { id: parsed.id }, data: { active: values.active } })
      return masterDataJson({ id: `sales:${row.id}`, code: row.code ?? row.id, name: row.name, active: row.active ?? true, type: null, phone: null, email: null, note: null, symbol: null, rateToThb: null, parentId: null, channelType: 'sales', bankName: null, accountNo: null, currency: null, openingBalance: null, odLimit: null, branchId: null, branchName: null, address: null, commissionPct: null, baseSalary: null, createdAt: null, updatedAt: null })
    }

    const row = await prisma.purchase_channels.update({ where: { id: parsed.id }, data: { active: values.active } })
    return masterDataJson({ id: `purchase:${row.id}`, code: row.code ?? row.id, name: row.name, active: row.active ?? true, type: null, phone: null, email: null, note: null, symbol: null, rateToThb: null, parentId: null, channelType: 'purchase', bankName: null, accountNo: null, currency: null, openingBalance: null, odLimit: null, branchId: null, branchName: null, address: null, commissionPct: null, baseSalary: null, createdAt: null, updatedAt: null })
  } catch (caught) {
    return errorJson(caught, 'อัปเดตสถานะช่องทางไม่ได้')
  }
}
