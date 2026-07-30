import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema, toIso, toNumber } from '@/lib/server/master-data'
import { outwardBranchReference } from '@/lib/server/branch-reference'
import { invalidateAccountReferenceCache } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

function normalizeSubtype(
  row: { account_group: string; bank_account_type?: string | null },
) {
  if (row.account_group === 'cash') return 'cash'
  if (row.account_group === 'virtual') return 'virtual'
  if (row.bank_account_type === 'savings' || row.bank_account_type === 'current') return row.bank_account_type
  throw new Error(`บัญชีธนาคาร ${row.account_group} ไม่มีประเภทบัญชีธนาคารที่ถูกต้อง`)
}

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const resolved = await prisma.accounts.findFirst({
      select: { id: true },
      where: {
        OR: [{ code: id.toUpperCase() }, ...(parseInternalBigIntId(id) != null ? [{ id: parseInternalBigIntId(id) as bigint }] : [])],
      } as any,
    })
    if (!resolved) throw new Error('ไม่พบบัญชีเงินที่ต้องการอัปเดต')
    const row = await prisma.accounts.update({ where: { id: resolved.id }, data: { active: values.active }, include: { branches: true } })
    await invalidateAccountReferenceCache()
    const branch = outwardBranchReference(row.branches, row.branch_id)
    const outwardId = requireBusinessCode(row.code, `บัญชีเงิน ${row.id}`)

    const odLimit = toNumber(row.od_limit) ?? 0

    return masterDataJson({
      id: outwardId,
      code: outwardId,
      name: row.name,
      active: row.active ?? true,
      type: row.type,
      subtype: normalizeSubtype(row),
      phone: null,
      email: null,
      note: null,
      symbol: null,
      rateToThb: null,
      parentId: null,
      channelType: null,
      bankName: row.bank_name ?? row.bank,
      bankBranch: row.bank_branch,
      accountNo: row.account_no,
      currency: row.currency,
      odLimit,
      branchId: branch.branchId,
      branchName: branch.branchName,
      address: null,
      commissionPct: null,
      baseSalary: null,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return errorJson(caught, 'อัปเดตสถานะบัญชีเงินไม่ได้')
  }
}
