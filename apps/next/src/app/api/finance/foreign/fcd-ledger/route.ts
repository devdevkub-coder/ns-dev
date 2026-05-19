import type { Prisma } from '../../../../../../generated/prisma/client'
import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

type StatementRow = Awaited<ReturnType<typeof prisma.bank_statement.findMany>>[number]
type FxRateRow = Awaited<ReturnType<typeof prisma.fx_rates.findMany>>[number]

function displayCurrency(value: string | null | undefined) {
  return (value || 'THB').trim().toUpperCase()
}

function accountLabel(account: { code: string | null; name: string }) {
  return account.code ? `${account.code} - ${account.name}` : account.name
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
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const [allAccounts, fxRates] = await Promise.all([
      prisma.accounts.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          account_no: true,
          active: true,
          bank: true,
          bank_name: true,
          branches: { select: { id: true, name: true } },
          code: true,
          currency: true,
          id: true,
          name: true,
          opening_balance: true,
          type: true,
        },
        where: { active: true },
      }),
      prisma.fx_rates.findMany({
        orderBy: [{ rate_date: 'desc' }, { updated_at: 'desc' }],
        take: 5000,
        where: { active: true, to_currency: 'THB' },
      }),
    ])

    const accounts = allAccounts.filter((account) => {
      const currency = displayCurrency(account.currency)
      return account.type === 'FCD' || (currency !== 'THB' && currency.length > 0)
    })
    const selectedAccount = accounts.find((account) => account.id === accountId) ?? accounts[0] ?? null

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
    let foreignBal = selectedAccount ? toNumber(selectedAccount.opening_balance) : 0
    let thbBal = 0
    const rows = selectedAccount ? [{
      date: '-',
      description: 'Opening',
      foreignBal,
      foreignIn: 0,
      foreignOut: 0,
      fxRate: 0,
      id: `${selectedAccount.id}:opening`,
      refNo: '-',
      thbBal,
      thbIn: 0,
      thbOut: 0,
      type: 'ยอดยกมา',
    }] : []

    statementRows.forEach((row) => {
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
        id: row.id,
        refNo: row.ref_no || row.ref_type || '-',
        thbBal,
        thbIn,
        thbOut,
        type: movementType(row),
      })
    })

    return NextResponse.json({
      account: selectedAccount ? {
        accountNo: selectedAccount.account_no,
        bankName: selectedAccount.bank_name ?? selectedAccount.bank ?? '',
        branchName: selectedAccount.branches?.name ?? '',
        code: selectedAccount.code,
        currency: selectedCurrency,
        id: selectedAccount.id,
        name: selectedAccount.name,
        openingBalance: toNumber(selectedAccount.opening_balance),
        type: selectedAccount.type,
      } : null,
      filters: {
        accounts: accounts.map((account) => ({
          accountNo: account.account_no,
          bankName: account.bank_name ?? account.bank ?? '',
          branchName: account.branches?.name ?? '',
          code: account.code,
          currency: displayCurrency(account.currency),
          id: account.id,
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
