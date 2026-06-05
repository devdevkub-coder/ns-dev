import { NextResponse } from 'next/server'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

function accountLabel(account: { account_no: string | null; currency: string | null; name: string; type: string }) {
  const prefix = account.account_no ? `${account.account_no} - ` : ''
  return `${prefix}${account.name} (${account.type} - ${(account.currency || 'THB').toUpperCase()})`
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    const [accounts, customers, salesBills, currencies, fxRates, statementRows] = await Promise.all([
      prisma.accounts.findMany({
        orderBy: [{ name: 'asc' }, { account_no: 'asc' }],
        select: { account_no: true, active: true, code: true, currency: true, id: true, name: true, type: true },
        where: { active: true },
      }),
      prisma.customers.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: { active: true, code: true, id: true, market_scope: true, name: true },
        take: 1000,
        where: { active: true },
      }),
      prisma.sales_bills.findMany({
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        select: { customer_id: true, customers: { select: { code: true } }, doc_no: true, id: true, receivable_balance: true, total_amount: true },
        take: 1000,
        where: { receivable_balance: { gt: 0 } },
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
          ref_type: { in: ['ORC', 'ORC-FEE'] },
          ...(from || to ? {
            date: {
              ...(from ? { gte: normalizeDate(from) } : {}),
              ...(to ? { lte: normalizeDate(to) } : {}),
            },
          } : {}),
        },
      }),
    ])

    const receiptAccounts = accounts.filter((account) => {
      const type = account.type.toLowerCase()
      const currency = (account.currency || 'THB').toUpperCase()
      return type.includes('bank') || type.includes('ธนาคาร') || type === 'fcd' || type === 'od' || currency !== 'THB'
    })

    return NextResponse.json({
      designState: {
        sourceTable: 'not_available',
        writeBehavior: 'read_form_only_no_bank_statement_or_fx_gain_loss_mutation',
      },
      filters: {
        accounts: receiptAccounts.map((account) => ({
          code: account.account_no,
          currency: (account.currency || 'THB').toUpperCase(),
          id: requireBusinessCode(account.code, `บัญชีเงิน ${account.id}`),
          label: accountLabel(account),
          name: account.name,
          type: account.type,
        })),
        currencies: currencies.map((currency) => ({
          code: (currency.symbol ?? '').trim().toUpperCase(),
          name: currency.name,
          rateToThb: toNumber(currency.rate_to_thb),
          symbol: currency.symbol,
        })),
        customers: customers.map((customer) => ({
          code: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
          id: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`),
          label: customer.code ? `${customer.code} - ${customer.name}` : customer.name,
          marketScope: customer.market_scope,
          name: customer.name,
        })),
        latestFxRates: fxRates.map((rate) => ({
          date: toDateOnly(rate.rate_date),
          fromCurrency: rate.from_currency,
          rate: toNumber(rate.rate),
          rateType: rate.rate_type,
          toCurrency: rate.to_currency,
        })),
        salesBills: salesBills.map((bill) => ({
          customerId: bill.customers?.code ? requireBusinessCode(bill.customers.code, `ลูกค้าบิลขาย ${bill.id}`) : '',
          docNo: bill.doc_no,
          id: bill.doc_no,
          receivableBalance: toNumber(bill.receivable_balance),
          totalAmount: toNumber(bill.total_amount),
        })),
      },
      rows: statementRows.map((row) => ({
        amountThb: toNumber(row.amount_in) - toNumber(row.amount_out),
        date: toDateOnly(row.date),
        description: row.description ?? row.desc ?? '',
        docNo: row.ref_no || row.ref_type || '-',
        feeThb: row.ref_type === 'ORC-FEE' ? toNumber(row.amount_out) : 0,
        id: row.doc_no,
        status: 'Posted Bank Row',
        type: row.ref_type || row.type || 'ORC',
      })),
      summary: {
        postedRows: statementRows.length,
        totalFeeThb: statementRows.reduce((sum, row) => sum + (row.ref_type === 'ORC-FEE' ? toNumber(row.amount_out) : 0), 0),
        totalReceivedThb: statementRows.reduce((sum, row) => sum + (row.ref_type === 'ORC' ? toNumber(row.amount_in) : 0), 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Overseas Receipt ไม่ได้', 500)
  }
}
