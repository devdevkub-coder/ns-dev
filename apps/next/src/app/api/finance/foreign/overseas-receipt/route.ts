import type { Prisma } from '../../../../../../generated/prisma/client'
import { NextResponse } from 'next/server'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import {
  listActiveAccounts,
  listActiveCustomers,
  listCurrencies,
  type AccountReferenceRecord,
  type CurrencyReferenceRecord,
  type CustomerReferenceRecord,
} from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

type SalesBillReceiptOptionRow = Prisma.sales_billsGetPayload<{
  select: {
    customer_id: true
    customers: { select: { code: true } }
    doc_no: true
    id: true
    receivable_balance: true
    total_amount: true
  }
}>

function accountLabel(account: { accountNo: string | null; currency: string | null; name: string; type: string }) {
  const prefix = account.accountNo ? `${account.accountNo} - ` : ''
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
      listActiveAccounts(),
      listActiveCustomers(),
      prisma.sales_bills.findMany({
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        select: { customer_id: true, customers: { select: { code: true } }, doc_no: true, id: true, receivable_balance: true, total_amount: true },
        take: 1000,
        where: { receivable_balance: { gt: 0 } },
      }),
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

    const receiptAccounts = accounts.filter((account: AccountReferenceRecord) => {
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
        accounts: receiptAccounts.map((account: AccountReferenceRecord) => ({
          code: account.accountNo,
          currency: (account.currency || 'THB').toUpperCase(),
          id: account.code,
          label: accountLabel(account),
          name: account.name,
          type: account.type,
        })),
        currencies: currencies.map((currency: CurrencyReferenceRecord) => ({
          code: (currency.symbol ?? '').trim().toUpperCase(),
          name: currency.name,
          rateToThb: currency.rateToThb == null ? 0 : Number(currency.rateToThb),
          symbol: currency.symbol,
        })),
        customers: customers.map((customer: CustomerReferenceRecord) => ({
          code: customer.code,
          id: customer.code,
          label: customer.code ? `${customer.code} - ${customer.name}` : customer.name,
          marketScope: customer.marketScope,
          name: customer.name,
        })),
        latestFxRates: fxRates.map((rate: Awaited<ReturnType<typeof prisma.fx_rates.findMany>>[number]) => ({
          date: toDateOnly(rate.rate_date),
          fromCurrency: rate.from_currency,
          rate: toNumber(rate.rate),
          rateType: rate.rate_type,
          toCurrency: rate.to_currency,
        })),
        salesBills: salesBills.map((bill: SalesBillReceiptOptionRow) => ({
          customerId: bill.customers?.code ? requireBusinessCode(bill.customers.code, `ลูกค้าบิลขาย ${bill.id}`) : '',
          docNo: bill.doc_no,
          id: bill.doc_no,
          receivableBalance: toNumber(bill.receivable_balance),
          totalAmount: toNumber(bill.total_amount),
        })),
      },
      rows: statementRows.map((row: Awaited<ReturnType<typeof prisma.bank_statement.findMany>>[number]) => ({
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
        totalFeeThb: statementRows.reduce((sum: number, row: Awaited<ReturnType<typeof prisma.bank_statement.findMany>>[number]) => sum + (row.ref_type === 'ORC-FEE' ? toNumber(row.amount_out) : 0), 0),
        totalReceivedThb: statementRows.reduce((sum: number, row: Awaited<ReturnType<typeof prisma.bank_statement.findMany>>[number]) => sum + (row.ref_type === 'ORC' ? toNumber(row.amount_in) : 0), 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Overseas Receipt ไม่ได้', 500)
  }
}
