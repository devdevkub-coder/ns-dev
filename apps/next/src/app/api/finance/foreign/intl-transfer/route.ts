import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import {
  listActiveAccounts,
  listActiveOverseasRecipients,
  listActiveOverseasRemittancePurposes,
  listCurrencies,
  type AccountReferenceRecord,
  type CurrencyReferenceRecord,
  type OverseasRecipientReferenceRecord,
  type OverseasRemittancePurposeReferenceRecord,
} from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

function accountLabel(account: { accountNo: string | null; currency: string | null; name: string }) {
  const prefix = account.accountNo ? `${account.accountNo} - ` : ''
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
      listActiveAccounts(),
      listActiveOverseasRecipients(),
      listActiveOverseasRemittancePurposes(),
      listCurrencies(),
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
        accounts: accounts.map((account: AccountReferenceRecord) => ({
          code: account.code,
          currency: (account.currency || 'THB').toUpperCase(),
          id: account.code,
          label: accountLabel(account),
          name: account.name,
          type: account.type,
        })),
        beneficiaries: beneficiaries.map((beneficiary: OverseasRecipientReferenceRecord) => ({
          code: beneficiary.code,
          country: beneficiary.country,
          currency: (beneficiary.currency || 'USD').toUpperCase(),
          id: beneficiary.code,
          label: beneficiary.country ? `${beneficiary.code} - ${beneficiary.name} (${beneficiary.country})` : `${beneficiary.code} - ${beneficiary.name}`,
          name: beneficiary.name,
        })),
        currencies: currencies.map((currency: CurrencyReferenceRecord) => ({
          code: (currency.symbol ?? '').trim().toUpperCase(),
          name: currency.name,
          rateToThb: currency.rateToThb == null ? 0 : Number(currency.rateToThb),
          symbol: currency.symbol,
        })),
        latestFxRates: fxRates.map((rate: Awaited<ReturnType<typeof prisma.fx_rates.findMany>>[number]) => ({
          date: toDateOnly(rate.rate_date),
          fromCurrency: rate.from_currency,
          rate: toNumber(rate.rate),
          rateType: rate.rate_type,
          toCurrency: rate.to_currency,
        })),
        purposes: purposes.map((purpose: OverseasRemittancePurposeReferenceRecord) => ({
          code: purpose.code,
          id: purpose.code,
          label: `${purpose.code} - ${purpose.name}`,
          name: purpose.name,
        })),
      },
      rows: statementRows.map((row: Awaited<ReturnType<typeof prisma.bank_statement.findMany>>[number]) => ({
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
        totalThb: statementRows.reduce((sum: number, row: Awaited<ReturnType<typeof prisma.bank_statement.findMany>>[number]) => sum + toNumber(row.amount_out), 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด International Transfer ไม่ได้', 500)
  }
}
