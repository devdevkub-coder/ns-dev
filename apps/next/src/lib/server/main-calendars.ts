import type { Prisma } from '../../../generated/prisma/client'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemQty } from '@/lib/server/purchase-bill-items'

type JsonItem = Prisma.JsonObject

function validMonth(value?: string | null) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) ? value : toDateOnly(new Date()).slice(0, 7)
}

function monthBounds(monthValue?: string | null) {
  const month = validMonth(monthValue)
  const [year, monthIndex] = month.split('-').map(Number)
  const start = new Date(Date.UTC(year, monthIndex - 1, 1))
  const end = new Date(Date.UTC(year, monthIndex, 0))
  const next = new Date(Date.UTC(year, monthIndex, 1))
  return { daysInMonth: end.getUTCDate(), end, month, next, start, year }
}

function activeStatus(status?: string | null) {
  return !['cancelled', 'void', 'reversed'].includes((status ?? '').toLowerCase())
}

function jsonNumber(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') return value.toNumber()
  return 0
}

function isJsonItem(value: unknown): value is JsonItem {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function itemQty(item: JsonItem) {
  return jsonNumber(item.qty ?? item.quantity ?? item.netWeight ?? item.weight)
}

function dayId(date: Date) {
  return toDateOnly(date)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function calendarWeeks<T extends { date: string }>(days: T[], start: Date) {
  const firstWeekday = start.getUTCDay()
  const padded: Array<T | null> = [...Array.from({ length: firstWeekday }, () => null), ...days]
  while (padded.length % 7 !== 0) padded.push(null)
  const weeks: Array<Array<T | null>> = []
  for (let index = 0; index < padded.length; index += 7) weeks.push(padded.slice(index, index + 7))
  return weeks
}

function cashAccountText(account: { bank: string | null; bank_name: string | null; name: string; type: string }) {
  return [account.type, account.name, account.bank_name, account.bank].filter(Boolean).join(' ').toLowerCase()
}

function isCashAccount(account: { bank: string | null; bank_name: string | null; name: string; type: string }) {
  const value = cashAccountText(account)
  return ['เงินสด', 'ธนาคาร', 'od', 'cash', 'bank'].some((term) => value.includes(term))
}

export async function buildCashFlowCalendar(monthValue?: string | null) {
  const { daysInMonth, month, next, start } = monthBounds(monthValue)
  const accounts = await prisma.accounts.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }, { account_no: 'asc' }],
    select: { active: true, account_no: true, bank: true, bank_name: true, code: true, id: true, name: true, opening_balance: true, type: true },
    where: { active: { not: false } },
  })
  const cashAccounts = accounts.filter(isCashAccount)
  const scopedAccounts = cashAccounts.length ? cashAccounts : accounts
  const accountIds = scopedAccounts.map((account) => account.id)
  const accountNames = new Map(scopedAccounts.map((account) => [account.id, account.name]))

  const [openingRows, monthRows] = await Promise.all([
    prisma.bank_statement.findMany({
      orderBy: [{ date: 'asc' }],
      select: { amount_in: true, amount_out: true },
      where: { account_id: { in: accountIds }, date: { lt: start } },
    }),
    prisma.bank_statement.findMany({
      orderBy: [{ date: 'asc' }, { ref_no: 'asc' }],
      select: { account_id: true, amount_in: true, amount_out: true, date: true, desc: true, description: true, id: true, ref_no: true, type: true },
      where: { account_id: { in: accountIds }, date: { gte: start, lt: next } },
    }),
  ])

  const openingCash = scopedAccounts.reduce((sum, account) => sum + toNumber(account.opening_balance), 0)
    + openingRows.reduce((sum, row) => sum + toNumber(row.amount_in) - toNumber(row.amount_out), 0)

  const entriesByDay = new Map<string, Array<{ account: string; date: string; description: string; id: string; in: number; out: number; refNo: string; type: string }>>()
  monthRows.forEach((row) => {
    const key = dayId(row.date)
    if (!entriesByDay.has(key)) entriesByDay.set(key, [])
    entriesByDay.get(key)!.push({
      account: row.account_id != null ? (accountNames.get(row.account_id) ?? '-') : '-',
      date: key,
      description: row.description ?? row.desc ?? '-',
      id: row.ref_no ?? '-',
      in: toNumber(row.amount_in),
      out: toNumber(row.amount_out),
      refNo: row.ref_no ?? '-',
      type: row.type ?? 'Bank Statement',
    })
  })

  let running = openingCash
  const today = toDateOnly(new Date())
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const date = dayId(addDays(start, index))
    const entries = entriesByDay.get(date) ?? []
    const cashIn = entries.reduce((sum, entry) => sum + entry.in, 0)
    const cashOut = entries.reduce((sum, entry) => sum + entry.out, 0)
    const begin = running
    running += cashIn - cashOut
    return {
      begin,
      cashIn,
      cashOut,
      date,
      day: index + 1,
      ending: running,
      entries,
      entryCount: entries.length,
      isNegative: running < 0,
      isToday: date === today,
      net: cashIn - cashOut,
      weekday: addDays(start, index).getUTCDay(),
    }
  })

  return {
    accounts: scopedAccounts.map((account) => ({
      code: account.account_no,
      id: account.code,
      name: account.name,
      type: account.type,
    })),
    days,
    month,
    sourceState: {
      limitations: [
        'Cash Flow Calendar เป็น read-only baseline จาก accounts และ bank_statement; legacy floating export/auto-sync ไม่เปิดใน batch นี้',
      ],
      writeActionsEnabled: false,
    },
    summary: {
      accountCount: scopedAccounts.length,
      endingCash: running,
      openingCash,
      totalIn: days.reduce((sum, day) => sum + day.cashIn, 0),
      totalOut: days.reduce((sum, day) => sum + day.cashOut, 0),
      totalRows: monthRows.length,
    },
    weeks: calendarWeeks(days, start),
  }
}

export async function buildBusinessCalendar(monthValue?: string | null) {
  const { daysInMonth, month, next, start } = monthBounds(monthValue)
  const [purchaseBills, salesBills, expenses, receipts, payments] = await Promise.all([
    prisma.purchase_bills.findMany({
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } } },
      where: { date: { gte: start, lt: next } },
    }),
    prisma.sales_bills.findMany({
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      select: { cogs_amount: true, date: true, doc_no: true, gross_profit: true, id: true, items: true, receivable_balance: true, status: true, total_amount: true, total_cost: true },
      where: { date: { gte: start, lt: next } },
    }),
    prisma.expenses.findMany({
      include: { expense_categories: true },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      where: { date: { gte: start, lt: next } },
    }),
    prisma.receipts.findMany({
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      select: { amount: true, date: true, doc_no: true, id: true, net_amount: true, status: true },
      where: { date: { gte: start, lt: next } },
    }),
    prisma.payments.findMany({
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      select: { amount: true, date: true, doc_no: true, id: true, net_amount: true, status: true },
      where: { date: { gte: start, lt: next } },
    }),
  ])

  const daily = new Map<string, {
    apIncrease: number
    arIncrease: number
    cogs: number
    date: string
    day: number
    expenseAmount: number
    expenseDocs: Array<{ amount: number; category: string; docNo: string; id: string; payee: string }>
    gp: number
    isToday: boolean
    isWeekend: boolean
    netCash: number
    paymentAmount: number
    paymentDocs: Array<{ amount: number; docNo: string; id: string }>
    purchaseAmount: number
    purchaseDocs: Array<{ amount: number; docNo: string; id: string; qty: number }>
    purchaseQty: number
    receiptAmount: number
    receiptDocs: Array<{ amount: number; docNo: string; id: string }>
    saleAmount: number
    saleDocs: Array<{ amount: number; cogs: number; docNo: string; gp: number; id: string; qty: number }>
    saleQty: number
    weekday: number
  }>()
  const today = toDateOnly(new Date())
  Array.from({ length: daysInMonth }, (_, index) => {
    const date = dayId(addDays(start, index))
    const weekday = addDays(start, index).getUTCDay()
    daily.set(date, {
      apIncrease: 0,
      arIncrease: 0,
      cogs: 0,
      date,
      day: index + 1,
      expenseAmount: 0,
      expenseDocs: [],
      gp: 0,
      isToday: date === today,
      isWeekend: weekday === 0 || weekday === 6,
      netCash: 0,
      paymentAmount: 0,
      paymentDocs: [],
      purchaseAmount: 0,
      purchaseDocs: [],
      purchaseQty: 0,
      receiptAmount: 0,
      receiptDocs: [],
      saleAmount: 0,
      saleDocs: [],
      saleQty: 0,
      weekday,
    })
  })

  purchaseBills.filter((bill) => activeStatus(bill.status)).forEach((bill) => {
    const row = daily.get(dayId(bill.date))
    if (!row) return
    const qty = purchaseBillItemQty(bill)
    const amount = toNumber(bill.total_amount)
    row.purchaseAmount += amount
    row.purchaseQty += qty
    row.apIncrease += toNumber(bill.payable_balance) || amount
    row.purchaseDocs.push({ amount, docNo: bill.doc_no, id: bill.doc_no, qty })
  })

  salesBills.filter((bill) => activeStatus(bill.status)).forEach((bill) => {
    const row = daily.get(dayId(bill.date))
    if (!row) return
    const qty = Array.isArray(bill.items) ? bill.items.filter(isJsonItem).reduce((sum, item) => sum + itemQty(item), 0) : 0
    const amount = toNumber(bill.total_amount)
    const cogs = toNumber(bill.cogs_amount) || toNumber(bill.total_cost)
    const gp = toNumber(bill.gross_profit) || amount - cogs
    row.saleAmount += amount
    row.saleQty += qty
    row.cogs += cogs
    row.gp += gp
    row.arIncrease += toNumber(bill.receivable_balance) || amount
    row.saleDocs.push({ amount, cogs, docNo: bill.doc_no, gp, id: bill.doc_no, qty })
  })

  expenses.filter((expense) => activeStatus(expense.status)).forEach((expense) => {
    const row = daily.get(dayId(expense.date))
    if (!row) return
    const amount = toNumber(expense.net_amount) || toNumber(expense.amount)
    row.expenseAmount += amount
    row.expenseDocs.push({ amount, category: expense.expense_categories?.name ?? '-', docNo: expense.doc_no, id: expense.doc_no, payee: expense.payee ?? '-' })
  })

  receipts.filter((receipt) => activeStatus(receipt.status)).forEach((receipt) => {
    const row = daily.get(dayId(receipt.date))
    if (!row) return
    const amount = toNumber(receipt.net_amount) || toNumber(receipt.amount)
    row.receiptAmount += amount
    row.receiptDocs.push({ amount, docNo: receipt.doc_no, id: receipt.doc_no })
  })

  payments.filter((payment) => activeStatus(payment.status)).forEach((payment) => {
    const row = daily.get(dayId(payment.date))
    if (!row) return
    const amount = toNumber(payment.net_amount) || toNumber(payment.amount)
    row.paymentAmount += amount
    row.paymentDocs.push({ amount, docNo: payment.doc_no, id: payment.doc_no })
  })

  const days = Array.from(daily.values()).map((row) => ({ ...row, netCash: row.receiptAmount - row.paymentAmount - row.expenseAmount }))
  return {
    days,
    month,
    sourceState: {
      limitations: [
        'Business Calendar เป็น read-only baseline จาก purchase_bills, sales_bills, expenses, receipts และ payments; export/auto-sync/write actions ยังปิดไว้',
      ],
      writeActionsEnabled: false,
    },
    summary: {
      apIncrease: days.reduce((sum, day) => sum + day.apIncrease, 0),
      arIncrease: days.reduce((sum, day) => sum + day.arIncrease, 0),
      cogs: days.reduce((sum, day) => sum + day.cogs, 0),
      expenseAmount: days.reduce((sum, day) => sum + day.expenseAmount, 0),
      gp: days.reduce((sum, day) => sum + day.gp, 0),
      netCash: days.reduce((sum, day) => sum + day.netCash, 0),
      paymentAmount: days.reduce((sum, day) => sum + day.paymentAmount, 0),
      purchaseAmount: days.reduce((sum, day) => sum + day.purchaseAmount, 0),
      purchaseQty: days.reduce((sum, day) => sum + day.purchaseQty, 0),
      receiptAmount: days.reduce((sum, day) => sum + day.receiptAmount, 0),
      saleAmount: days.reduce((sum, day) => sum + day.saleAmount, 0),
      saleQty: days.reduce((sum, day) => sum + day.saleQty, 0),
    },
  }
}
