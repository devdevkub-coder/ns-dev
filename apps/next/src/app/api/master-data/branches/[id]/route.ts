import { requireBusinessCode } from '@/lib/business-code'
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
    const resolved = await prisma.branches.findFirst({
      select: { id: true },
      where: {
        OR: [
          { code: id.toUpperCase() },
          ...(id.match(/^\d+$/) ? [{ id: BigInt(id) }] : []),
        ],
      },
    })
    if (!resolved) throw new Error('ไม่พบสาขาที่ต้องการอัปเดต')
    const row = await prisma.branches.update({ where: { id: resolved.id }, data: { active: values.active } })
    const outwardId = requireBusinessCode(row.code, `สาขา ${row.id}`)
    return masterDataJson({ id: outwardId, code: outwardId, name: row.name, active: row.active ?? true, type: null, phone: row.phone, email: null, note: null, symbol: null, rateToThb: null, parentId: null, channelType: null, bankName: null, accountNo: null, currency: null, openingBalance: null, odLimit: null, branchId: outwardId, branchName: row.name, address: row.address, commissionPct: null, baseSalary: null, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะสาขาไม่ได้')
  }
}
