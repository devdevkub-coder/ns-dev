import type { Prisma } from '../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listActiveBranches } from '@/lib/server/reference-master-cache'

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
  vatApplicable?: boolean
  vatAnomaly?: boolean
  vatType?: string | null
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

type CustomerReceipt = Prisma.customer_receiptsGetPayload<Record<string, never>>

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

export function isSalesVatApplicable(input: { has_vat?: boolean | null; vat_type?: string | null }) {
  const vatType = input.vat_type?.trim().toUpperCase()
  if (vatType === 'NONE') return false
  if (vatType === 'INCLUDE' || vatType === 'EXCLUDE') return true
  return input.has_vat === true
}

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function dueDate(year: number, month: number, day: number) {
  const dueMonth = month === 12 ? 1 : month + 1
  const dueYear = month === 12 ? year + 1 : year
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function listBranches() {
  const branches = await listActiveBranches()
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
    prisma.customer_receipts.findMany({
      orderBy: [{ date: 'asc' }, { doc_no: 'asc' }],
      take: 20000,
      where: { ...notCancelledWhere(), ...where },
    }),
  ])
}

function salesVatOutput(rows: SalesBill[]): TaxItem[] {
  return rows.map((bill) => {
    const vat = toNumber(bill.vat_amount)
    const vatApplicable = isSalesVatApplicable(bill)
    return {
      base: toNumber(bill.subtotal) || exVat(bill.total_amount, bill.vat_amount),
      date: dateOnly(bill.date),
      no: bill.doc_no,
      party: bill.customers?.name ?? bill.contact_name ?? '-',
      source: 'sales_bills',
      vatApplicable,
      vatAnomaly: vatApplicable && vat <= 0,
      vatType: bill.vat_type,
      vat,
    }
  }).filter((item) => item.vatApplicable)
}

function purchaseVatInput(rows: PurchaseBill[]): TaxItem[] {
  return rows.map((bill) => {
    const vat = toNumber(bill.vat_amount)
    return {
      base: toNumber(bill.subtotal) || exVat(bill.total_amount, bill.vat_amount),
      date: dateOnly(bill.date),
      hasDoc: Boolean(bill.vat_invoice_received || hasText(bill.vat_invoice_no) || hasText(bill.tax_invoice_no)),
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

function receiptWht(rows: CustomerReceipt[]): TaxItem[] {
  return rows.map((receipt) => {
    const wht = toNumber(receipt.withholding_tax_total)
    return {
      // Receipt settlement is a book-THB fact. Native FCD currency and rate are audit data,
      // so they must never enter the tax base directly.
      base: toNumber(receipt.settlement_book_amount) + wht + toNumber(receipt.discount_total),
      date: dateOnly(receipt.date),
      no: receipt.doc_no,
      party: receipt.customer_name_snapshot,
      source: 'customer_receipts',
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
  const receipts = receiptsRaw as CustomerReceipt[]
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
  const receipts = receiptsRaw as CustomerReceipt[]
  const vatOutputItems = salesVatOutput(sales)
  const vatInputItems = [...purchaseVatInput(purchases), ...expenseVatInput(expenses)].sort((left, right) => left.date.localeCompare(right.date) || left.no.localeCompare(right.no))
  const whtChargedItems = [...paymentWht(payments), ...expenseWht(expenses)].sort((left, right) => left.date.localeCompare(right.date) || left.no.localeCompare(right.no))
  const whtWithheldItems = receiptWht(receipts)
  const vatOut = sum(vatOutputItems, 'vat')
  const vatIn = sum(vatInputItems, 'vat')
  const salesRevenueBase = sales.reduce((total, bill) => total + exVat(bill.total_amount, bill.vat_amount), 0)
  const vatSalesBase = vatOutputItems.reduce((total, item) => total + item.base, 0)
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
      basis: 'Transaction tax source from transaction tax fields. Not a statutory filing ledger.',
      limitations: [
        'ยังไม่มี normalized tax ledger, PP30/PND filing state, approval/locking, หรือ GL payable posting',
        'VAT ขายใช้ vat_amount จริง; เอกสาร taxable ที่ VAT เป็นศูนย์จะถูกแสดงเป็นรายการต้องตรวจสอบ ไม่คำนวณแทนจากรายได้',
        'VAT input ใช้ purchase_bills และ expenses ที่มี VAT amount; เอกสารครบอ้างอิง vat_invoice/tax_invoice fields เท่านั้น',
        'WHT ใช้ payments/customer_receipts/expenses withholding fields แบบ transaction-derived; customer receipt ใช้ยอด settlement THB ที่บันทึกแล้ว',
      ],
      writeActionsEnabled: false,
    },
    summary: {
      missingCount: vatInputItems.filter((item) => !item.hasDoc).length,
      salesRevenueBase,
      vatSalesBase,
      vatOutputAnomalyCount: vatOutputItems.filter((item) => item.vatAnomaly).length,
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
