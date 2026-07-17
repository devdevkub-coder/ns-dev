import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listAllAccounts, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')

    const [row, accounts] = await Promise.all([
      prisma.opening_balance.findFirst({ orderBy: { id: 'asc' } }),
      listAllAccounts(),
    ])
    return NextResponse.json({
      accounts: accounts.map((account: AccountReferenceRecord) => ({
        branchCode: account.branchCode ?? '',
        branchName: account.branchName ?? '',
        code: account.accountNo ?? '',
        currency: account.currency ?? 'THB',
        name: account.name,
        odLimit: account.odLimit == null ? 0 : Number(account.odLimit),
        openingBalance: account.openingBalance == null ? 0 : Number(account.openingBalance),
        type: account.type,
      })),
      designState: {
        applyWrite: 'disabled_until_opening_balance_lock_and_gl_design',
        saveWrite: 'disabled_until_cutover_approval',
        targetModel: 'opening_balance_entries',
      },
      row: {
        data: row?.data ?? null,
        id: row?.id?.toString() ?? '',
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
