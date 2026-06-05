import { NextResponse } from 'next/server'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

function accountLabel(account: { account_no: string | null; currency: string | null; name: string }) {
  const prefix = account.account_no ? `${account.account_no} - ` : ''
  return `${prefix}${account.name} (${(account.currency || 'THB').toUpperCase()})`
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const [accounts, beneficiaries, purposes, currencies, fxRates, statementRows] = await Promise.all([
      prisma.accounts.findMany({
        orderBy: [{ name: 'asc' }, { account_no: 'asc' }],
        select: { account_no: true, active: true, code: true, currency: true, id: true, name: true, type: true },
        where: { active: true },
      }),
      prisma.overseas_recipients.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, code: true, country: true, currency: true, id: true, name: true },
        where: { active: true },
      }),
      prisma.overseas_remittance_purposes.findMany({
        orderBy: [{ name: 'asc' }],
        select: { active: true, code: true, id: true, name: true },
        where: { active: true },
      }),
      prisma.currencies.findMany({ orderBy: [{ symbol: 'asc' }, { name: 'asc' }] }),
      prisma.fx_rates.findMany({
        orderBy: [{ rate_date: 'desc' }, { updated_at: 'desc' }],
        take: 100,
        where: { active: true, to_currency: 'THB' },
      }),
      prisma.bank_statement.findMany({
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 200,
        where: {
          ref_type: 'ITF',
          ...(from || to ? {
            date: {
              ...(from ? { gte: normalizeDate(from) } : {}),
              ...(to ? { lte: normalizeDate(to) } : {}),
            },
          } : {}),
        },
      }),
    ])

    return NextResponse.json({
      designState: {
        sourceTable: 'not_available',
        writeBehavior: 'read_form_only_no_bank_statement_mutation',
      },
      filters: {
        accounts: accounts.map((account) => ({
          code: requireBusinessCode(account.code, `บัญชี ${account.id}`),
          currency: (account.currency || 'THB').toUpperCase(),
          id: requireBusinessCode(account.code, `บัญชี ${account.id}`),
          label: accountLabel(account),
          name: account.name,
          type: account.type,
        })),
        beneficiaries: beneficiaries.map((beneficiary) => ({
          code: beneficiary.code,
          country: beneficiary.country,
          currency: (beneficiary.currency || 'USD').toUpperCase(),
          id: requireBusinessCode(beneficiary.code, `ผู้รับเงินต่างประเทศ ${beneficiary.id}`),
          label: beneficiary.country ? `${beneficiary.code} - ${beneficiary.name} (${beneficiary.country})` : `${beneficiary.code} - ${beneficiary.name}`,
          name: beneficiary.name,
        })),
        currencies: currencies.map((currency) => ({
          code: (currency.symbol ?? '').trim().toUpperCase(),
          name: currency.name,
          rateToThb: toNumber(currency.rate_to_thb),
          symbol: currency.symbol,
        })),
        latestFxRates: fxRates.map((rate) => ({
          date: toDateOnly(rate.rate_date),
          fromCurrency: rate.from_currency,
          rate: toNumber(rate.rate),
          rateType: rate.rate_type,
          toCurrency: rate.to_currency,
        })),
        purposes: purposes.map((purpose) => ({
          code: requireBusinessCode(purpose.code, `วัตถุประสงค์โอน ${purpose.id}`),
          id: requireBusinessCode(purpose.code, `วัตถุประสงค์โอน ${purpose.id}`),
          label: `${requireBusinessCode(purpose.code, `วัตถุประสงค์โอน ${purpose.id}`)} - ${purpose.name}`,
          name: purpose.name,
        })),
      },
      rows: statementRows.map((row) => ({
        amountThb: toNumber(row.amount_out),
        date: toDateOnly(row.date),
        description: row.description ?? row.desc ?? '',
        docNo: row.ref_no || row.ref_type || '-',
        fee: 0,
        id: row.doc_no,
        status: 'Posted Bank Row',
        type: row.type || 'โอนเงินต่างประเทศ',
      })),
      summary: {
        postedRows: statementRows.length,
        totalThb: statementRows.reduce((sum, row) => sum + toNumber(row.amount_out), 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด International Transfer ไม่ได้', 500)
  }
}
