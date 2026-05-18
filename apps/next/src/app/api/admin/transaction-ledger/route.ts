import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import { toNumber } from '@/lib/server/master-data'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(10000).default(5000),
})

type LinkedBill = {
  billId: string
  docNo: string
  type: 'PB' | 'SB'
}

function toDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function duplicateKey(row: {
  account_id: string | null
  amount_in: Parameters<typeof toNumber>[0]
  amount_out: Parameters<typeof toNumber>[0]
  date: Date
  ref_id: string | null
  ref_no: string | null
  ref_type: string | null
}) {
  return [
    row.ref_type ?? '-',
    row.ref_no ?? row.ref_id ?? '-',
    toDate(row.date) ?? '-',
    row.account_id ?? '-',
    (toNumber(row.amount_in) ?? 0).toFixed(2),
    (toNumber(row.amount_out) ?? 0).toFixed(2),
  ].join('|')
}

async function ledgerPayload(limit: number) {
  const [accounts, movements, balanceGroups] = await Promise.all([
    prisma.accounts.findMany({
      orderBy: [{ active: 'desc' }, { code: 'asc' }, { name: 'asc' }],
    }),
    prisma.bank_statement.findMany({
      include: { accounts: true },
      orderBy: [{ date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
      take: limit,
    }),
    prisma.bank_statement.groupBy({
      _sum: { amount_in: true, amount_out: true },
      by: ['account_id'],
      where: { account_id: { not: null } },
    }),
  ])

  const refIds = uniqueStrings(movements.map((row) => row.ref_id))
  const [payments, receipts, expenses, transfers, pettyAdvances, pettyReturns] = await Promise.all([
    prisma.payments.findMany({
      include: { suppliers: true },
      where: { OR: [{ id: { in: refIds } }, { voucher_id: { in: refIds } }] },
    }),
    prisma.receipts.findMany({
      include: { customers: true },
      where: { OR: [{ id: { in: refIds } }, { voucher_id: { in: refIds } }] },
    }),
    prisma.expenses.findMany({
      include: { expense_categories: true },
      where: { OR: [{ id: { in: refIds } }, { voucher_id: { in: refIds } }, { doc_no: { in: refIds } }] },
    }),
    prisma.transfers.findMany({
      include: {
        accounts_transfers_from_account_idToaccounts: true,
        accounts_transfers_to_account_idToaccounts: true,
      },
      where: { id: { in: refIds } },
    }),
    prisma.petty_advances.findMany({
      where: { id: { in: refIds } },
    }),
    prisma.petty_advance_returns.findMany({
      include: { petty_advances: true },
      where: { id: { in: refIds } },
    }),
  ])

  const purchaseBills = await prisma.purchase_bills.findMany({
    where: { id: { in: uniqueStrings(payments.map((payment) => payment.bill_id)) } },
  })
  const salesBills = await prisma.sales_bills.findMany({
    where: { id: { in: uniqueStrings(receipts.map((receipt) => receipt.bill_id)) } },
  })

  const purchaseBillById = new Map(purchaseBills.map((bill) => [bill.id, bill]))
  const salesBillById = new Map(salesBills.map((bill) => [bill.id, bill]))

  const paymentByKey = new Map<string, (typeof payments)[number]>()
  for (const payment of payments) {
    paymentByKey.set(payment.id, payment)
    if (payment.voucher_id) paymentByKey.set(payment.voucher_id, payment)
  }
  const receiptByKey = new Map<string, (typeof receipts)[number]>()
  for (const receipt of receipts) {
    receiptByKey.set(receipt.id, receipt)
    if (receipt.voucher_id) receiptByKey.set(receipt.voucher_id, receipt)
  }
  const expenseByKey = new Map<string, (typeof expenses)[number]>()
  for (const expense of expenses) {
    expenseByKey.set(expense.id, expense)
    expenseByKey.set(expense.doc_no, expense)
    if (expense.voucher_id) expenseByKey.set(expense.voucher_id, expense)
  }
  const transferById = new Map(transfers.map((transfer) => [transfer.id, transfer]))
  const pettyAdvanceById = new Map(pettyAdvances.map((advance) => [advance.id, advance]))
  const pettyReturnById = new Map(pettyReturns.map((entry) => [entry.id, entry]))

  const balanceTotals = new Map<string, number>()
  for (const group of balanceGroups) {
    if (!group.account_id) continue
    balanceTotals.set(group.account_id, (toNumber(group._sum.amount_in) ?? 0) - (toNumber(group._sum.amount_out) ?? 0))
  }

  const openingBalanceByAccount = new Map(accounts.map((account) => [account.id, toNumber(account.opening_balance) ?? 0]))
  const runningByAccount = new Map(openingBalanceByAccount)
  const runningBalanceById = new Map<string, number>()
  for (const row of [...movements].sort((left, right) => {
    const dateOrder = left.date.getTime() - right.date.getTime()
    if (dateOrder !== 0) return dateOrder
    const createdOrder = (left.created_at?.getTime() ?? 0) - (right.created_at?.getTime() ?? 0)
    if (createdOrder !== 0) return createdOrder
    return left.id.localeCompare(right.id)
  })) {
    if (!row.account_id) continue
    const nextBalance = (runningByAccount.get(row.account_id) ?? 0) + (toNumber(row.amount_in) ?? 0) - (toNumber(row.amount_out) ?? 0)
    runningByAccount.set(row.account_id, nextBalance)
    runningBalanceById.set(row.id, nextBalance)
  }

  const duplicateMap = new Map<string, typeof movements>()
  for (const row of movements) {
    const key = duplicateKey(row)
    duplicateMap.set(key, [...(duplicateMap.get(key) ?? []), row])
  }
  const duplicateGroups = Array.from(duplicateMap.values())
    .filter((group) => group.length > 1)
    .map((group) => ({
      accountName: group[0].accounts?.name ?? group[0].account_id ?? '-',
      count: group.length,
      ids: group.map((row) => row.id),
      refNo: group[0].ref_no ?? group[0].ref_id ?? '-',
      refType: group[0].ref_type ?? group[0].type ?? 'BANK',
      totalIn: group.reduce((sum, row) => sum + (toNumber(row.amount_in) ?? 0), 0),
      totalOut: group.reduce((sum, row) => sum + (toNumber(row.amount_out) ?? 0), 0),
    }))

  const rows = movements.map((row) => {
    const refType = row.ref_type ?? row.type ?? 'BANK'
    const refId = row.ref_id
    const linkedBills: LinkedBill[] = []
    let payee = ''
    let sourceLabel = ''

    if (refType === 'PMT' && refId) {
      const payment = paymentByKey.get(refId)
      payee = payment?.suppliers?.name ?? payment?.supplier_id ?? ''
      sourceLabel = payment?.doc_no ?? ''
      if (payment?.bill_id) {
        const bill = purchaseBillById.get(payment.bill_id)
        linkedBills.push({ billId: payment.bill_id, docNo: bill?.doc_no ?? payment.bill_id, type: 'PB' })
      }
    } else if (refType === 'RCP' && refId) {
      const receipt = receiptByKey.get(refId)
      payee = receipt?.customers?.name ?? receipt?.customer_id ?? ''
      sourceLabel = receipt?.doc_no ?? ''
      if (receipt?.bill_id) {
        const bill = salesBillById.get(receipt.bill_id)
        linkedBills.push({ billId: receipt.bill_id, docNo: bill?.doc_no ?? receipt.bill_id, type: 'SB' })
      }
    } else if (refType === 'EXP' && refId) {
      const expense = expenseByKey.get(refId)
      payee = expense?.payee ?? ''
      sourceLabel = expense?.expense_categories?.name ?? expense?.doc_no ?? ''
    } else if (refType === 'TRF' && refId) {
      const transfer = transferById.get(refId)
      const fromName = transfer?.accounts_transfers_from_account_idToaccounts?.name ?? transfer?.from_account_id ?? '-'
      const toName = transfer?.accounts_transfers_to_account_idToaccounts?.name ?? transfer?.to_account_id ?? '-'
      payee = `${fromName} → ${toName}`
      sourceLabel = transfer?.doc_no ?? ''
    } else if (refType === 'PADV' && refId) {
      const advance = pettyAdvanceById.get(refId)
      payee = advance?.recipient_name ?? ''
      sourceLabel = advance?.doc_no ?? ''
    } else if (refType === 'PRET' && refId) {
      const entry = pettyReturnById.get(refId)
      payee = entry?.petty_advances.recipient_name ?? ''
      sourceLabel = entry?.petty_advances.doc_no ?? ''
    }

    return {
      accountId: row.account_id,
      accountName: row.accounts?.name ?? row.account_id ?? '-',
      amountIn: toNumber(row.amount_in) ?? 0,
      amountOut: toNumber(row.amount_out) ?? 0,
      date: toDate(row.date) ?? '',
      description: row.description ?? row.desc ?? row.note ?? '',
      id: row.id,
      linkedBills,
      note: row.note ?? '',
      payee,
      refId,
      refNo: row.ref_no ?? sourceLabel ?? row.id,
      refType,
      runningBalance: runningBalanceById.get(row.id) ?? null,
      sourceLabel,
    }
  })

  return {
    accounts: accounts.map((account) => {
      const openingBalance = toNumber(account.opening_balance) ?? 0
      return {
        accountNo: account.account_no,
        active: account.active ?? true,
        balance: openingBalance + (balanceTotals.get(account.id) ?? 0),
        code: account.code ?? account.id,
        currency: account.currency ?? 'THB',
        id: account.id,
        name: account.name,
        odLimit: toNumber(account.od_limit) ?? 0,
        openingBalance,
        type: account.type,
      }
    }),
    duplicateGroups,
    rows,
  }
}

function buildWorkbook(payload: Awaited<ReturnType<typeof ledgerPayload>>) {
  const generatedAt = new Date()
  const summaryRows = [
    ['Export ณ', generatedAt.toLocaleString('th-TH')],
    ['จำนวนรายการ', payload.rows.length.toLocaleString('th-TH')],
    ['จำนวนบัญชี', payload.accounts.length.toLocaleString('th-TH')],
    ['กลุ่มยอดซ้ำที่ตรวจพบ', payload.duplicateGroups.length.toLocaleString('th-TH')],
  ]
  const dataRows = payload.rows.map((row) => ({
    'วันที่': row.date,
    'บัญชี': row.accountName,
    'ประเภท': row.refType,
    'เลขที่': row.refNo,
    'บิลที่เกี่ยวข้อง': row.linkedBills.map((bill) => `${bill.type}:${bill.docNo}`).join(', '),
    'ผู้รับ/ส่ง': row.payee,
    'รายละเอียด': row.description || row.note,
    'เงินเข้า': row.amountIn,
    'เงินออก': row.amountOut,
    'คงเหลือหลังรายการ': row.runningBalance ?? '',
  }))
  const workbook = XLSX.utils.book_new()
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  const ledgerSheet = XLSX.utils.json_to_sheet(dataRows)
  summarySheet['!cols'] = [{ wch: 24 }, { wch: 28 }]
  ledgerSheet['!cols'] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 10 },
    { wch: 18 },
    { wch: 28 },
    { wch: 28 },
    { wch: 40 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
  ]
  applyWorksheetTableLayout(ledgerSheet, 10, dataRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'สรุป')
  XLSX.utils.book_append_sheet(workbook, ledgerSheet, 'Transaction Ledger')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const url = new URL(request.url)
    const values = querySchema.parse({
      limit: url.searchParams.get('limit') ?? undefined,
    })
    const payload = await ledgerPayload(values.limit)

    if (url.searchParams.get('format') === 'xlsx') {
      const body = buildWorkbook(payload)
      const filename = `transaction_ledger_${new Date().toISOString().slice(0, 10)}.xlsx`

      return new NextResponse(new Uint8Array(body), {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      })
    }

    return NextResponse.json(payload)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Transaction Ledger ไม่สำเร็จ', 500)
  }
}
