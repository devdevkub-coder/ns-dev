import type { Prisma } from '../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

const CANCELLED_STATUSES = ['cancelled', 'void', 'ยกเลิก']

type TaxFilter = {
  branchId?: string
  month: number
  year: number
}

type TaxItem = {
  base: number
  date: string
  hasDoc?: boolean
  no: string
  party: string
  source: string
  vat?: number
  wht?: number
}

type SalesBill = Prisma.sales_billsGetPayload<{
  include: { customers: { select: { name: true } } }
}>

type PurchaseBill = Prisma.purchase_billsGetPayload<{
  include: { suppliers: { select: { name: true } } }
}>

type Expense = Prisma.expensesGetPayload<{
  include: { expense_categories: { select: { name: true } } }
}>

type Payment = Prisma.paymentsGetPayload<{
  include: { suppliers: { select: { name: true } } }
}>

type Receipt = Prisma.receiptsGetPayload<{
  include: { customers: { select: { name: true } } }
}>

function periodBounds(year: number, month: number) {
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { end, start }
}

function dateOnly(date: Date) {
  return toDateOnly(date)
}

function notCancelledWhere() {
  return { NOT: { status: { in: CANCELLED_STATUSES } } }
}

function branchWhere(branchId?: bigint | null) {
  return branchId ? { branch_id: branchId } : {}
}

function exVat(total: number | { toNumber: () => number } | null | undefined, vat: number | { toNumber: () => number } | null | undefined) {
  return Math.max(0, toNumber(total) - toNumber(vat))
}

function dueDate(year: number, month: number, day: number) {
  const dueMonth = month === 12 ? 1 : month + 1
  const dueYear = month === 12 ? year + 1 : year
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function listBranches() {
  const branches = await prisma.branches.findMany({
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
    select: { code: true, id: true, name: true },
    where: { active: true },
  })
  return branches.map((branch) => {
    const code = requireBusinessCode(branch.code, `สาขา ${branch.id}`)
    return { code, id: code, name: branch.name }
  })
}

async function loadPeriod(filter: TaxFilter) {
  const { end, start } = periodBounds(filter.year, filter.month)
  const branch = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const where = { ...branchWhere(branch?.id ?? null), date: { gte: start, lte: end } }
  return Promise.all([
    prisma.sales_bills.findMany({
      include: { customers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...where },
    }),
    prisma.purchase_bills.findMany({
      include: { suppliers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...where },
    }),
    prisma.expenses.findMany({
      include: { expense_categories: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...where },
    }),
    prisma.payments.findMany({
      include: { suppliers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...where },
    }),
    prisma.receipts.findMany({
      include: { customers: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...where },
    }),
  ])
}

function salesVatOutput(rows: SalesBill[]): TaxItem[] {
  return rows.map((bill) => {
    const vat = toNumber(bill.vat_amount)
    return {
      base: toNumber(bill.subtotal) || exVat(bill.total_amount, bill.vat_amount),
      date: dateOnly(bill.date),
      no: bill.doc_no,
      party: bill.customers?.name ?? bill.contact_name ?? '-',
      source: 'sales_bills',
      vat,
    }
  }).filter((item) => item.vat && item.vat > 0)
}

function purchaseVatInput(rows: PurchaseBill[]): TaxItem[] {
  return rows.map((bill) => {
    const vat = toNumber(bill.vat_amount)
    return {
      base: toNumber(bill.subtotal) || exVat(bill.total_amount, bill.vat_amount),
      date: dateOnly(bill.date),
      hasDoc: Boolean(bill.vat_invoice_received || bill.vat_invoice_no),
      no: bill.doc_no,
      party: bill.suppliers?.name ?? bill.contact_name ?? '-',
      source: 'purchase_bills',
      vat,
    }
  }).filter((item) => item.vat && item.vat > 0)
}

function expenseVatInput(rows: Expense[]): TaxItem[] {
  return rows.map((expense) => {
    const vat = toNumber(expense.vat_amount) || toNumber(expense.vat)
    return {
      base: toNumber(expense.amount),
      date: dateOnly(expense.date),
      hasDoc: Boolean(expense.tax_invoice_no),
      no: expense.doc_no,
      party: expense.payee ?? expense.expense_categories?.name ?? '-',
      source: 'expenses',
      vat,
    }
  }).filter((item) => item.vat && item.vat > 0)
}

function paymentWht(rows: Payment[]): TaxItem[] {
  return rows.map((payment) => {
    const wht = toNumber(payment.withholding_tax)
    return {
      base: toNumber(payment.amount) + wht + toNumber(payment.discount),
      date: dateOnly(payment.date),
      no: payment.doc_no,
      party: payment.suppliers?.name ?? '-',
      source: 'payments',
      wht,
    }
  }).filter((item) => item.wht && item.wht > 0)
}

function expenseWht(rows: Expense[]): TaxItem[] {
  return rows.map((expense) => {
    const wht = toNumber(expense.wht_amount) || toNumber(expense.wht)
    return {
      base: toNumber(expense.amount),
      date: dateOnly(expense.date),
      no: expense.doc_no,
      party: expense.payee ?? expense.expense_categories?.name ?? '-',
      source: 'expenses',
      wht,
    }
  }).filter((item) => item.wht && item.wht > 0)
}

function receiptWht(rows: Receipt[]): TaxItem[] {
  return rows.map((receipt) => {
    const wht = toNumber(receipt.withholding_tax)
    return {
      base: toNumber(receipt.amount) + wht + toNumber(receipt.discount),
      date: dateOnly(receipt.date),
      no: receipt.doc_no,
      party: receipt.customers?.name ?? '-',
      source: 'receipts',
      wht,
    }
  }).filter((item) => item.wht && item.wht > 0)
}

function sum(items: TaxItem[], key: 'vat' | 'wht') {
  return items.reduce((total, item) => total + (item[key] ?? 0), 0)
}

async function monthlySummary(year: number, month: number, branchId?: string) {
  const [salesRaw, purchasesRaw, expensesRaw, paymentsRaw, receiptsRaw] = await loadPeriod({ branchId, month, year })
  const sales = salesRaw as SalesBill[]
  const purchases = purchasesRaw as PurchaseBill[]
  const expenses = expensesRaw as Expense[]
  const payments = paymentsRaw as Payment[]
  const receipts = receiptsRaw as Receipt[]
  const vatOutput = salesVatOutput(sales)
  const vatInput = [...purchaseVatInput(purchases), ...expenseVatInput(expenses)]
  const whtCharged = [...paymentWht(payments), ...expenseWht(expenses)]
  const whtWithheld = receiptWht(receipts)
  const vatOut = sum(vatOutput, 'vat')
  const vatIn = sum(vatInput, 'vat')
  return {
    periodLabel: `${year}-${String(month).padStart(2, '0')}`,
    vIn: vatIn,
    vOut: vatOut,
    vatDue: dueDate(year, month, 15),
    vatPayable: vatOut - vatIn,
    wC: sum(whtCharged, 'wht'),
    wW: sum(whtWithheld, 'wht'),
    whtDue: dueDate(year, month, 7),
  }
}

export async function buildTaxVatWht(filter: TaxFilter) {
  const [periodRows, branches] = await Promise.all([loadPeriod(filter), listBranches()])
  const [salesRaw, purchasesRaw, expensesRaw, paymentsRaw, receiptsRaw] = periodRows
  const sales = salesRaw as SalesBill[]
  const purchases = purchasesRaw as PurchaseBill[]
  const expenses = expensesRaw as Expense[]
  const payments = paymentsRaw as Payment[]
  const receipts = receiptsRaw as Receipt[]
  const vatOutputItems = salesVatOutput(sales)
  const vatInputItems = [...purchaseVatInput(purchases), ...expenseVatInput(expenses)].sort((left, right) => left.date.localeCompare(right.date) || left.no.localeCompare(right.no))
  const whtChargedItems = [...paymentWht(payments), ...expenseWht(expenses)].sort((left, right) => left.date.localeCompare(right.date) || left.no.localeCompare(right.no))
  const whtWithheldItems = receiptWht(receipts)
  const vatOut = sum(vatOutputItems, 'vat')
  const vatIn = sum(vatInputItems, 'vat')
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(filter.year, filter.month - 1 - (5 - index), 1)
    return { month: date.getMonth() + 1, year: date.getFullYear() }
  })
  const taxCalendar = await Promise.all(months.map((period) => monthlySummary(period.year, period.month, filter.branchId)))

  return {
    branches,
    filters: {
      branchId: filter.branchId ?? 'ALL',
      month: String(filter.month).padStart(2, '0'),
      periodEnd: dateOnly(periodBounds(filter.year, filter.month).end),
      periodStart: dateOnly(periodBounds(filter.year, filter.month).start),
      year: String(filter.year),
    },
    sourceState: {
      basis: 'Read/design baseline from transaction tax fields. Not a statutory filing ledger.',
      limitations: [
        'ยังไม่มี normalized tax ledger, PP30/PND filing state, approval/locking, หรือ GL payable posting',
        'VAT input ใช้ purchase_bills และ expenses ที่มี VAT amount; เอกสารครบอ้างอิง vat_invoice/tax_invoice fields เท่านั้น',
        'WHT ใช้ payments/receipts/expenses withholding fields แบบ transaction-derived',
      ],
      writeActionsEnabled: false,
    },
    summary: {
      missingCount: vatInputItems.filter((item) => !item.hasDoc).length,
      vatIn,
      vatOut,
      vatPayable: vatOut - vatIn,
      whtChargedNet: sum(whtChargedItems, 'wht'),
      whtWithheldNet: sum(whtWithheldItems, 'wht'),
    },
    taxCalendar,
    vatInput: { items: vatInputItems },
    vatOutput: { items: vatOutputItems },
    whtCharged: { items: whtChargedItems },
    whtWithheld: { items: whtWithheldItems },
  }
}
