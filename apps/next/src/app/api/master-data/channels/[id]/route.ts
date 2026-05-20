import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema } from '@/lib/server/master-data'

export const runtime = 'nodejs'

function channelId(value: string) {
  const [type, ...rest] = value.split(':')
  return { type: type === 'sales' ? 'sales' : 'purchase', id: rest.join(':') || value }
}

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const parsed = channelId(id)

    if (parsed.type === 'sales') {
      const row = await prisma.sales_channels.update({ where: { id: parsed.id }, data: { active: values.active } })
      return masterDataJson({ id: `sales:${row.id}`, code: null, name: row.name, active: row.active ?? true, type: null, phone: null, email: null, note: null, symbol: null, rateToThb: null, parentId: null, channelType: 'sales', bankName: null, accountNo: null, currency: null, openingBalance: null, odLimit: null, branchId: null, branchName: null, address: null, commissionPct: null, baseSalary: null, createdAt: null, updatedAt: null })
    }

    const row = await prisma.purchase_channels.update({ where: { id: parsed.id }, data: { active: values.active } })
    return masterDataJson({ id: `purchase:${row.id}`, code: null, name: row.name, active: row.active ?? true, type: null, phone: null, email: null, note: null, symbol: null, rateToThb: null, parentId: null, channelType: 'purchase', bankName: null, accountNo: null, currency: null, openingBalance: null, odLimit: null, branchId: null, branchName: null, address: null, commissionPct: null, baseSalary: null, createdAt: null, updatedAt: null })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะช่องทางไม่ได้')
  }
}
