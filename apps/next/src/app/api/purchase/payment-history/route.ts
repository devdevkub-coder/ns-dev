import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { listDailyAccounts, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const [accounts, bills, payments] = await Promise.all([
      listDailyAccounts(),
      prisma.purchase_bills.findMany({
        orderBy: [{ date: 'desc' }],
        select: { doc_no: true, id: true },
        take: 5000,
      }),
      prisma.payments.findMany({
        include: { accounts: true, suppliers: true },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 5000,
      }),
    ])
    const billDocNoById = new Map(bills.map((bill) => [bill.id, bill.doc_no]))
    const voucherIds = [...new Set(payments.map((payment) => payment.voucher_id).filter((voucherId): voucherId is string => Boolean(voucherId)))]
    const bankStatements = voucherIds.length > 0 ? await prisma.bank_statement.findMany({
      include: { accounts: true },
      orderBy: [{ created_at: 'asc' }, { date: 'asc' }],
      where: {
        ref_id: { in: voucherIds },
        ref_type: 'PMT',
      },
    }) : []
    const bankStatementsByVoucherId = new Map<string, typeof bankStatements>()
    bankStatements.forEach((row) => {
      const voucherId = row.ref_id ?? ''
      if (!voucherId) return
      bankStatementsByVoucherId.set(voucherId, [...(bankStatementsByVoucherId.get(voucherId) ?? []), row])
    })

    const voucherRows = new Map<string, {
      accountId: string
      accountName: string
      accountNames: string[]
      accountSummaries: string[]
      approvalIds: string[]
      amount: number
      billDocNo: string
      billDocNos: string[]
      date: string
      docNo: string
      fee: number
      id: string
      method: string
      netAmount: number
      notes: string
      partyName: string
      status: string
      supplierId: string
      withholdingTax: number
    }>()

    payments.forEach((payment) => {
      const voucherKey = payment.voucher_id ?? payment.doc_no ?? payment.id
      const existing = voucherRows.get(voucherKey)
      const billDocNo = payment.bill_id ? (billDocNoById.get(payment.bill_id) ?? payment.bill_id) : ''
      if (!existing) {
        const statementRows = bankStatementsByVoucherId.get(voucherKey) ?? []
        const accountEntries = statementRows.length > 0
          ? statementRows.map((row) => ({
              accountId: row.account_id ?? '',
              accountName: row.accounts?.name ?? row.account_id ?? '-',
              amount: toNumber(row.amount_out),
            }))
          : [{
              accountId: payment.account_id ?? '',
              accountName: payment.accounts?.name ?? payment.account_id ?? '-',
              amount: toNumber(payment.net_amount),
            }]
        const uniqueAccountEntries = accountEntries.filter((entry, index, entries) => (
          entries.findIndex((candidate) => candidate.accountId === entry.accountId && candidate.accountName === entry.accountName) === index
        ))
        voucherRows.set(voucherKey, {
          accountId: uniqueAccountEntries[0]?.accountId ?? payment.account_id ?? '',
          accountName: uniqueAccountEntries[0]?.accountName ?? payment.accounts?.name ?? '-',
          accountNames: uniqueAccountEntries.map((entry) => entry.accountName),
          accountSummaries: uniqueAccountEntries.map((entry) => `${entry.accountName} · ${toNumber(entry.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`),
          approvalIds: payment.payment_approval_id ? [payment.payment_approval_id] : [],
          amount: 0,
          billDocNo,
          billDocNos: billDocNo ? [billDocNo] : [],
          date: toDateOnly(payment.date),
          docNo: payment.doc_no,
          fee: 0,
          id: voucherKey,
          method: payment.method ?? '',
          netAmount: 0,
          notes: payment.notes ?? '',
          partyName: payment.suppliers?.name ?? payment.supplier_id ?? '-',
          status: payment.status ?? 'active',
          supplierId: payment.supplier_id ?? '',
          withholdingTax: 0,
        })
      }

      const row = voucherRows.get(voucherKey)
      if (!row) return
      row.amount += toNumber(payment.amount)
      row.fee += toNumber(payment.fee ?? payment.bank_fee)
      row.netAmount += toNumber(payment.net_amount)
      row.withholdingTax += toNumber(payment.withholding_tax)
      if (payment.payment_approval_id && !row.approvalIds.includes(payment.payment_approval_id)) row.approvalIds.push(payment.payment_approval_id)
      if (billDocNo && !row.billDocNos.includes(billDocNo)) row.billDocNos.push(billDocNo)
      if (!row.billDocNo && billDocNo) row.billDocNo = billDocNo
      if (payment.status === 'cancelled') row.status = 'cancelled'
    })
    return NextResponse.json({
      accounts,
      bills: bills.map((bill) => ({
        docNo: bill.doc_no,
        id: bill.id,
      })),
      rows: Array.from(voucherRows.values()),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดประวัติการจ่ายเงินไม่ได้', 500)
  }
}
