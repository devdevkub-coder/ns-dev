import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')

    const [row, accounts] = await Promise.all([
      prisma.opening_balance.findUnique({ where: { id: 'SINGLETON' } }),
      prisma.accounts.findMany({
        include: { branches: { select: { code: true, name: true } } },
        orderBy: [{ name: 'asc' }, { account_no: 'asc' }],
        take: 5000,
      }),
    ])
    return NextResponse.json({
      accounts: accounts.map((account) => ({
        branchCode: account.branches?.code || '',
        branchName: account.branches?.name || '',
        code: account.account_no || '',
        currency: account.currency || 'THB',
        name: account.name,
        odLimit: toNumber(account.od_limit),
        openingBalance: toNumber(account.opening_balance),
        type: account.type,
      })),
      designState: {
        applyWrite: 'disabled_until_opening_balance_lock_and_gl_design',
        saveWrite: 'disabled_until_cutover_approval',
        targetModel: 'opening_balance_entries',
      },
      row: {
        data: row?.data ?? null,
        id: row?.id ?? 'SINGLETON',
        updatedAt: row?.updated_at?.toISOString() || '',
        updatedBy: row?.updated_by || '',
      },
      summary: {
        apCost: 0,
        apExpense: 0,
        ar: 0,
        netOther: 0,
        stock: 0,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Opening Balance ไม่ได้', 500)
  }
}
