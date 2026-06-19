import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { errorJson, masterDataJson, type MasterDataRouteProps, updateMasterDataStatusSchema, toIso, toNumber } from '@/lib/server/master-data'
import { outwardBranchReference } from '@/lib/server/branch-reference'

export const runtime = 'nodejs'

function paymentMethodGroupForName(
  paymentMethodTypes: Map<string, 'cash' | 'bank'>,
  paymentMethodName: string | null | undefined,
) {
  if (!paymentMethodName) return null
  return paymentMethodTypes.get(String(paymentMethodName).trim()) ?? null
}

function normalizeSubtype(
  row: { currency?: string | null; od_limit?: unknown; subtype?: string | null; type?: string | null },
  paymentMethodTypes: Map<string, 'cash' | 'bank'>,
) {
  if (row.subtype === 'savings' || row.subtype === 'current' || row.subtype === 'cash' || row.subtype === 'fcd' || row.subtype === 'od') return row.subtype
  if (row.subtype === 'bank' || row.subtype === 'other') return 'savings'
  if (paymentMethodGroupForName(paymentMethodTypes, row.type) === 'cash') return 'cash'
  if (Number(row.od_limit ?? 0) > 0) return 'od'
  if (String(row.currency ?? 'THB').toUpperCase() !== 'THB') return 'fcd'
  if (paymentMethodGroupForName(paymentMethodTypes, row.type) === 'bank') return 'savings'
  return 'savings'
}

export async function PATCH(request: Request, { params }: MasterDataRouteProps) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const { id } = await params
    const values = updateMasterDataStatusSchema.parse(await request.json())
    const paymentMethodRows = await prisma.payment_methods.findMany({
      select: { name: true, type: true },
      where: { active: true },
    })
    const paymentMethodTypes = new Map(paymentMethodRows.map((row) => [row.name, row.type === 'cash' ? 'cash' : 'bank'] as const))
    const resolved = await prisma.accounts.findFirst({
      select: { id: true },
      where: {
        OR: [{ code: id.toUpperCase() }, ...(parseInternalBigIntId(id) != null ? [{ id: parseInternalBigIntId(id) as bigint }] : [])],
      } as any,
    })
    if (!resolved) throw new Error('ไม่พบบัญชีเงินที่ต้องการอัปเดต')
    const [row, statementSum] = await Promise.all([
      prisma.accounts.update({ where: { id: resolved.id }, data: { active: values.active }, include: { branches: true } }),
      prisma.bank_statement.aggregate({
        _sum: {
          amount_in: true,
          amount_out: true,
        },
        where: { account_id: resolved.id },
      }),
    ])
    const branch = outwardBranchReference(row.branches, row.branch_id)
    const outwardId = requireBusinessCode(row.code, `บัญชีเงิน ${row.id}`)

    const realBalance = (toNumber(row.opening_balance) ?? 0) + ((toNumber(statementSum._sum?.amount_in) ?? 0) - (toNumber(statementSum._sum?.amount_out) ?? 0))
    const odLimit = toNumber(row.od_limit) ?? 0
    const odUsed = Math.max(0, -realBalance)
    const odRemaining = Math.max(0, odLimit - odUsed)
    const availableToPay = realBalance + odLimit

    return masterDataJson({
      id: outwardId,
      code: outwardId,
      name: row.name,
      active: row.active ?? true,
      type: row.type,
      subtype: normalizeSubtype(row, paymentMethodTypes),
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
      openingBalance: toNumber(row.opening_balance),
      odLimit,
      realBalance,
      odUsed,
      odRemaining,
      availableToPay,
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
