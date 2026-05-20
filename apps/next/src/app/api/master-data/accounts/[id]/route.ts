import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema, toIso, toNumber } from '@/lib/server/master-data'

export const runtime = 'nodejs'

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const row = await prisma.accounts.update({ where: { id }, data: { active: values.active }, include: { branches: true } })
    return masterDataJson({ id: row.id, code: null, name: row.name, active: row.active ?? true, type: row.type, phone: null, email: null, note: null, symbol: null, rateToThb: null, parentId: null, channelType: null, bankName: row.bank_name ?? row.bank, accountNo: row.account_no, currency: row.currency, openingBalance: toNumber(row.opening_balance), odLimit: toNumber(row.od_limit), branchId: row.branch_id, branchName: row.branches?.name ?? row.branch_id, address: null, commissionPct: null, baseSalary: null, createdAt: toIso(row.created_at), updatedAt: toIso(row.updated_at) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะบัญชีเงินไม่ได้')
  }
}
