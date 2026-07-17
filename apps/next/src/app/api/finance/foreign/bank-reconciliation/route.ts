import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const accountId = url.searchParams.get('accountId')
    const accountReference = await findActiveAccountReferenceByCode(accountId)
    const internalAccountId = accountReference?.id ?? null
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const accounts = await listActiveAccounts()
    const selectedAccount = accounts.find((account) => account.id === internalAccountId) ?? accounts[0] ?? null

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
      erpRows: erpRows.map((row: Awaited<ReturnType<typeof prisma.bank_statement.findMany>>[number]) => ({
        date: toDateOnly(row.date),
        id: row.doc_no,
        in: toNumber(row.amount_in),
        out: toNumber(row.amount_out),
        refNo: row.ref_no || row.ref_type || '-',
        type: row.ref_type || row.type || '-',
      })),
      filters: {
        accounts: accounts.map((account: AccountReferenceRecord) => ({
          accountNo: account.accountNo,
          bankName: account.bankName,
          code: account.code,
          currency: account.currency,
          id: account.code,
          label: account.accountNo ? `${account.accountNo} - ${account.name}` : account.name,
          name: account.name,
          type: account.type,
        })),
      },
      importedRows: [],
      selectedAccount: selectedAccount ? {
        id: selectedAccount.code,
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
