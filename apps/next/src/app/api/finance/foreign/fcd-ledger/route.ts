import type { Prisma } from '../../../../../../generated/prisma/client'
import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { findActiveAccountReferenceByCode } from '@/lib/server/account-reference'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts, type AccountReferenceRecord } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

type StatementRow = Awaited<ReturnType<typeof prisma.bank_statement.findMany>>[number]
type FxRateRow = Awaited<ReturnType<typeof prisma.fx_rates.findMany>>[number]

function displayCurrency(value: string | null | undefined) {
  return (value || 'THB').trim().toUpperCase()
}

function accountLabel(account: { accountNo: string | null; name: string }) {
  return account.accountNo ? `${account.accountNo} - ${account.name}` : account.name
}

function cachedAmount(value: string | null) {
  return value == null ? 0 : Number(value)
}

function movementType(row: StatementRow) {
  if (row.ref_type === 'ORC') return 'Overseas Receipt In'
  if (row.ref_type === 'ORC-FEE') return 'Overseas Receipt Fee'
  if (row.ref_type === 'ITF') return 'Overseas Payment Out'
  if (row.ref_type === 'ITF-FEE') return 'Overseas Transfer Fee'
  return row.ref_type || row.type || 'Bank Movement'
}

function buildRateLookup(fxRates: FxRateRow[]) {
  return (currency: string, date: string) => {
    const matched = fxRates.find((rate) => rate.from_currency === currency && toDateOnly(rate.rate_date) <= date)
    return matched ? toNumber(matched.rate) : 0
  }
}

function dateWhere(from: string | null, to: string | null): Prisma.bank_statementWhereInput['date'] | undefined {
  if (!from && !to) return undefined
  return {
    ...(from ? { gte: normalizeDate(from) } : {}),
    ...(to ? { lte: normalizeDate(to) } : {}),
  }
}

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

    const [allAccounts, fxRates] = await Promise.all([
      listActiveAccounts(),
      prisma.fx_rates.findMany({
        orderBy: [{ rate_date: 'desc' }, { updated_at: 'desc' }],
        take: 5000,
        where: { active: true, to_currency: 'THB' },
      }),
    ])

    const accounts = allAccounts.filter((account: AccountReferenceRecord) => {
      const currency = displayCurrency(account.currency)
      return account.type === 'FCD' || (currency !== 'THB' && currency.length > 0)
    })
    const selectedAccount = accounts.find((account: AccountReferenceRecord) => account.id === internalAccountId) ?? accounts[0] ?? null

    const rateFor = buildRateLookup(fxRates)

    const statementRows = selectedAccount ? await prisma.bank_statement.findMany({
      orderBy: [{ date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
      take: 5000,
      where: {
        account_id: selectedAccount.id,
        ...(dateWhere(from, to) ? { date: dateWhere(from, to) } : {}),
      },
    }) : []

    const selectedCurrency = selectedAccount ? displayCurrency(selectedAccount.currency) : ''
    let foreignBal = selectedAccount ? cachedAmount(selectedAccount.openingBalance) : 0
    let thbBal = 0
    const rows = selectedAccount ? [{
      date: '-',
      description: 'Opening',
      foreignBal,
      foreignIn: 0,
      foreignOut: 0,
      fxRate: 0,
      id: `opening-${selectedAccount.code}`,
      refNo: '-',
      thbBal,
      thbIn: 0,
      thbOut: 0,
      type: 'ยอดยกมา',
    }] : []

    statementRows.forEach((row: StatementRow) => {
      const date = toDateOnly(row.date)
      const fxRate = rateFor(selectedCurrency, date)
      const thbIn = toNumber(row.amount_in)
      const thbOut = toNumber(row.amount_out)
      const foreignIn = 0
      const foreignOut = 0
      thbBal += thbIn - thbOut
      rows.push({
        date,
        description: row.description ?? row.desc ?? row.note ?? '',
        foreignBal,
        foreignIn,
        foreignOut,
        fxRate,
        id: row.doc_no,
        refNo: row.ref_no || row.ref_type || '-',
        thbBal,
        thbIn,
        thbOut,
        type: movementType(row),
      })
    })

    return NextResponse.json({
      account: selectedAccount ? {
        accountNo: selectedAccount.accountNo,
        bankName: selectedAccount.bankName ?? selectedAccount.bank ?? '',
        branchName: selectedAccount.branchName ?? '',
        code: selectedAccount.code,
        currency: selectedCurrency,
        id: selectedAccount.code,
        name: selectedAccount.name,
        openingBalance: cachedAmount(selectedAccount.openingBalance),
        type: selectedAccount.type,
      } : null,
      filters: {
        accounts: accounts.map((account: AccountReferenceRecord) => ({
          accountNo: account.accountNo,
          bankName: account.bankName ?? account.bank ?? '',
          branchName: account.branchName ?? '',
          code: account.code,
          currency: displayCurrency(account.currency),
          id: account.code,
          label: accountLabel(account),
          name: account.name,
          type: account.type,
        })),
      },
      rows,
      summary: {
        accountCount: accounts.length,
        currency: selectedCurrency,
        foreignBalance: foreignBal,
        rows: rows.length,
        thbBalance: thbBal,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด FCD Ledger ไม่ได้', 500)
  }
}
