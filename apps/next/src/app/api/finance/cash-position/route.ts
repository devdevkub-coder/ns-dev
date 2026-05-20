import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

function ageBucket(days: number) {
  if (days <= 0) return 'current'
  if (days <= 30) return 'b30'
  if (days <= 60) return 'b60'
  if (days <= 90) return 'b90'
  return 'gt90'
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const [accounts, bankRows, salesBills, receipts, purchaseBills, payments] = await Promise.all([
      prisma.accounts.findMany({
        include: { branches: { select: { id: true, name: true } } },
        orderBy: [{ type: 'asc' }, { code: 'asc' }, { name: 'asc' }],
        where: { active: true },
      }),
      prisma.bank_statement.findMany({
        orderBy: [{ account_id: 'asc' }, { date: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
        take: 20000,
      }),
      prisma.sales_bills.findMany({
        include: { customers: { select: { credit_term: true, id: true, name: true } } },
        take: 10000,
        where: { NOT: { status: 'cancelled' } },
      }),
      prisma.receipts.findMany({
        select: { amount: true, bill_id: true, discount: true, withholding_tax: true },
        take: 10000,
        where: { NOT: { status: 'cancelled' } },
      }),
      prisma.purchase_bills.findMany({
        include: { suppliers: { select: { id: true, name: true } } },
        take: 10000,
        where: { NOT: { status: 'cancelled' } },
      }),
      prisma.payments.findMany({
        select: { amount: true, bill_id: true, discount: true, withholding_tax: true },
        take: 10000,
        where: { NOT: { status: 'cancelled' } },
      }),
    ])

    const balances = new Map<string, number>()
    accounts.forEach((account) => balances.set(account.id, toNumber(account.opening_balance)))
    bankRows.forEach((row) => {
      if (!row.account_id) return
      const previous = balances.get(row.account_id) ?? 0
      const next = row.balance === null || row.balance === undefined ? previous + toNumber(row.amount_in) - toNumber(row.amount_out) : toNumber(row.balance)
      balances.set(row.account_id, next)
    })

    const accountRows = accounts.map((account) => ({
      accountNo: account.account_no ?? '',
      balance: balances.get(account.id) ?? 0,
      bankName: account.bank_name ?? account.bank ?? '',
      branchName: account.branches?.name ?? '-',
      code: account.code ?? '',
      currency: account.currency ?? 'THB',
      id: account.id,
      name: account.name,
      odLimit: toNumber(account.od_limit),
      type: account.type,
    }))

    const byType = Array.from(accountRows.reduce((map, row) => {
      const current = map.get(row.type) ?? { accounts: 0, balance: 0, type: row.type }
      current.accounts += 1
      current.balance += row.balance
      map.set(row.type, current)
      return map
    }, new Map<string, { accounts: number; balance: number; type: string }>()).values()).sort((left, right) => right.balance - left.balance)

    const receiptMap = new Map<string, number>()
    receipts.forEach((receipt) => {
      if (!receipt.bill_id) return
      receiptMap.set(receipt.bill_id, (receiptMap.get(receipt.bill_id) ?? 0) + toNumber(receipt.amount) + toNumber(receipt.withholding_tax) + toNumber(receipt.discount))
    })
    const paymentMap = new Map<string, number>()
    payments.forEach((payment) => {
      if (!payment.bill_id) return
      paymentMap.set(payment.bill_id, (paymentMap.get(payment.bill_id) ?? 0) + toNumber(payment.amount) + toNumber(payment.withholding_tax) + toNumber(payment.discount))
    })

    const today = new Date()
    const arRows = salesBills.map((bill) => {
      const total = toNumber(bill.total_amount)
      const received = receiptMap.get(bill.id) ?? toNumber(bill.received_amount)
      const balance = Math.max(0, total - received)
      const due = bill.due_date ? new Date(bill.due_date) : new Date(bill.date)
      if (!bill.due_date) due.setDate(due.getDate() + (bill.credit_term ?? bill.customers?.credit_term ?? 0))
      const aging = Math.floor((today.getTime() - due.getTime()) / 86400000)
      return { aging, balance, bucket: ageBucket(aging), dueDate: toDateOnly(due), partyName: bill.customers?.name ?? '-', refNo: bill.doc_no }
    }).filter((row) => row.balance > 0.01)

    const apRows = purchaseBills.map((bill) => {
      const total = toNumber(bill.total_amount)
      const paid = paymentMap.get(bill.id) ?? toNumber(bill.paid_amount)
      const balance = Math.max(0, total - paid)
      const due = new Date(bill.date)
      const aging = Math.floor((today.getTime() - due.getTime()) / 86400000)
      return { aging, balance, bucket: ageBucket(aging), dueDate: toDateOnly(due), partyName: bill.suppliers?.name ?? '-', refNo: bill.doc_no }
    }).filter((row) => row.balance > 0.01)

    return NextResponse.json({
      accounts: accountRows.sort((left, right) => right.balance - left.balance),
      byType,
      exposure: {
        ap: {
          overdue: apRows.filter((row) => row.aging > 0).reduce((sum, row) => sum + row.balance, 0),
          total: apRows.reduce((sum, row) => sum + row.balance, 0),
          upcoming7: apRows.filter((row) => row.aging >= -7 && row.aging <= 0).reduce((sum, row) => sum + row.balance, 0),
        },
        ar: {
          overdue: arRows.filter((row) => row.aging > 0).reduce((sum, row) => sum + row.balance, 0),
          total: arRows.reduce((sum, row) => sum + row.balance, 0),
          upcoming7: arRows.filter((row) => row.aging >= -7 && row.aging <= 0).reduce((sum, row) => sum + row.balance, 0),
        },
      },
      nearDue: {
        ap: apRows.filter((row) => row.aging >= -7 && row.aging <= 30).sort((left, right) => right.balance - left.balance).slice(0, 10),
        ar: arRows.filter((row) => row.aging >= -7 && row.aging <= 30).sort((left, right) => right.balance - left.balance).slice(0, 10),
      },
      summary: {
        accountBalance: accountRows.reduce((sum, row) => sum + row.balance, 0),
        accounts: accountRows.length,
        netAfterAp: accountRows.reduce((sum, row) => sum + row.balance, 0) - apRows.reduce((sum, row) => sum + row.balance, 0),
        netExposure: arRows.reduce((sum, row) => sum + row.balance, 0) - apRows.reduce((sum, row) => sum + row.balance, 0),
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Cash Position ไม่ได้', 500)
  }
}
