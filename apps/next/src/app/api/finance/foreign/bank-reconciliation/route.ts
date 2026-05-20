import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const accountId = url.searchParams.get('accountId')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const accounts = await prisma.accounts.findMany({
      orderBy: [{ name: 'asc' }, { account_no: 'asc' }],
      select: {
        account_no: true,
        bank_name: true,
        currency: true,
        id: true,
        name: true,
        type: true,
      },
      where: { active: true },
    })
    const selectedAccount = accounts.find((account) => account.id === accountId) ?? accounts[0] ?? null

    const erpRows = selectedAccount ? await prisma.bank_statement.findMany({
      orderBy: [{ date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
      take: 500,
      where: {
        account_id: selectedAccount.id,
        ...(from || to ? {
          date: {
            ...(from ? { gte: normalizeDate(from) } : {}),
            ...(to ? { lte: normalizeDate(to) } : {}),
          },
        } : {}),
      },
    }) : []

    return NextResponse.json({
      designState: {
        importTable: 'not_available',
        matchState: 'not_available',
        writeBehavior: 'read_only_no_import_no_match',
      },
      erpRows: erpRows.map((row) => ({
        date: toDateOnly(row.date),
        id: row.id,
        in: toNumber(row.amount_in),
        out: toNumber(row.amount_out),
        refNo: row.ref_no || row.ref_type || '-',
        type: row.ref_type || row.type || '-',
      })),
      filters: {
        accounts: accounts.map((account) => ({
          accountNo: account.account_no,
          bankName: account.bank_name,
          code: account.account_no,
          currency: account.currency,
          id: account.id,
          label: account.account_no ? `${account.account_no} - ${account.name}` : account.name,
          name: account.name,
          type: account.type,
        })),
      },
      importedRows: [],
      selectedAccount: selectedAccount ? {
        id: selectedAccount.id,
        name: selectedAccount.name,
      } : null,
      stats: {
        erpUnmatched: erpRows.length,
        ignored: 0,
        matched: 0,
        total: 0,
        unmatched: 0,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Bank Reconciliation ไม่ได้', 500)
  }
}
