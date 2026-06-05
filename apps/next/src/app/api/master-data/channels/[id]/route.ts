import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
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
    const resolved = await prisma.sales_channels.findFirst({
      select: { id: true },
      where: {
        OR: [{ code: id.toUpperCase() }, ...(parseInternalBigIntId(id) != null ? [{ id: parseInternalBigIntId(id) as bigint }] : [])],
      } as any,
    })
    if (!resolved) throw new Error('ไม่พบช่องทางขายที่ต้องการอัปเดต')
    const row = await prisma.sales_channels.update({ where: { id: resolved.id }, data: { active: values.active } })
    const outwardId = requireBusinessCode(row.code, `ช่องทางขาย ${row.id}`)
    return masterDataJson({ id: outwardId, code: outwardId, name: row.name, active: row.active ?? true, type: null, phone: null, email: null, note: null, symbol: null, rateToThb: null, parentId: null, channelType: null, bankName: null, accountNo: null, currency: null, openingBalance: null, odLimit: null, branchId: null, branchName: null, address: null, commissionPct: null, baseSalary: null, createdAt: null, updatedAt: null })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะช่องทางไม่ได้')
  }
}
