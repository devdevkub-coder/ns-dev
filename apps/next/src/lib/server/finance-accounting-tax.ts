import type { Prisma } from '../../../generated/prisma/client'
import { requireBusinessCode } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

const CANCELLED_STATUSES = ['cancelled', 'void', 'ยกเลิก']
const DAY_MS = 86_400_000
const MISSING_TAX_DOC_WARNING_DAYS = 60

type TaxFilter = {
  branchId?: string
  month: number
  year: number
}

type TaxItem = {
  agedMissingDoc?: boolean
  base: number
  date: string
  documentAgeDays?: number
  hasDoc?: boolean
  no: string
  party: string
  source: string
  sourceHref?: string
  vat?: number
  warning?: string
  wht?: number
}

type OpeningTaxBalance = {
  applied: boolean
  cutoffDate: string
  goLiveDate: string
  locked: boolean
  reason: string
  updatedAt: string
  vatInputCredit: number
  vatOutputAccrued: number
  whtCreditCarried: number
  whtPayableCarried: number
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

function sourceHref(source: string, docNo: string) {
  const encoded = encodeURIComponent(docNo)
  if (source === 'sales_bills') return `/sales/bills/${encoded}`
  if (source === 'purchase_bills') return `/purchase/bills/${encoded}`
  if (source === 'expenses') return `/daily/expense/${encoded}`
  return undefined
}

function startOfDate(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function ageInDays(date: Date, asOf: Date) {
  return Math.max(0, Math.floor((startOfDate(asOf).getTime() - startOfDate(date).getTime()) / DAY_MS))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  return toNumber(value as number | { toNumber: () => number } | null | undefined)
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key]
  if (value instanceof Date) return dateOnly(value)
  if (typeof value === 'string') return value.slice(0, 10)
  return ''
}

function booleanFromRecord(record: Record<string, unknown>, key: string) {
  return record[key] === true
}

async function loadOpeningTaxBalance(filter: TaxFilter): Promise<OpeningTaxBalance> {
  const row = await prisma.opening_balance.findFirst({
    orderBy: { id: 'asc' },
    select: { data: true, updated_at: true },
  })
  const data = isRecord(row?.data) ? row.data : {}
  const source = isRecord(data.openingBalance) ? data.openingBalance : data
  const vatInputCredit = numberFromRecord(source, 'vatInputCredit')
  const vatOutputAccrued = numberFromRecord(source, 'vatOutputAccrued')
  const whtCreditCarried = numberFromRecord(source, 'whtCreditCarried')
  const whtPayableCarried = numberFromRecord(source, 'whtPayableCarried')
  const cutoffDate = stringFromRecord(source, 'cutoffDate')
  const goLiveDate = stringFromRecord(source, 'goLiveDate')
  const periodLabel = `${filter.year}-${String(filter.month).padStart(2, '0')}`
  const goLivePeriod = goLiveDate ? goLiveDate.slice(0, 7) : ''
  const hasAmount = [vatInputCredit, vatOutputAccrued, whtCreditCarried, whtPayableCarried].some((value) => value !== 0)

  let applied = false
  let reason = 'ไม่มี VAT/WHT opening balance ที่บันทึกไว้'
  if (hasAmount && filter.branchId) {
    reason = 'ยอดยกมาเป็นข้อมูล global จึงไม่รวมเมื่อกรองสาขา'
  } else if (hasAmount && goLivePeriod && goLivePeriod !== periodLabel) {
    reason = `ยอดยกมาใช้กับงวดเริ่มระบบ ${goLivePeriod} เท่านั้น`
  } else if (hasAmount) {
    applied = true
    reason = goLivePeriod ? `รวมยอดยกมาตามงวดเริ่มระบบ ${goLivePeriod}` : 'รวมยอดยกมาเพราะไม่มี go-live month ใน opening_balance'
  }

  return {
    applied,
    cutoffDate,
    goLiveDate,
    locked: booleanFromRecord(source, 'locked'),
    reason,
    updatedAt: row?.updated_at ? row.updated_at.toISOString() : '',
    vatInputCredit,
    vatOutputAccrued,
    whtCreditCarried,
    whtPayableCarried,
  }
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
      sourceHref: sourceHref('sales_bills', bill.doc_no),
      vat,
    }
  }).filter((item) => item.vat && item.vat > 0)
}

function purchaseVatInput(rows: PurchaseBill[]): TaxItem[] {
  return rows.map((bill) => {
    const vat = toNumber(bill.vat_amount)
    const hasDoc = Boolean(bill.vat_invoice_received || bill.vat_invoice_no)
    const documentAgeDays = ageInDays(bill.date, new Date())
    const agedMissingDoc = !hasDoc && vat > 0 && documentAgeDays > MISSING_TAX_DOC_WARNING_DAYS
    return {
      agedMissingDoc,
      base: toNumber(bill.subtotal) || exVat(bill.total_amount, bill.vat_amount),
      date: dateOnly(bill.date),
      documentAgeDays,
      hasDoc,
      no: bill.doc_no,
      party: bill.suppliers?.name ?? bill.contact_name ?? '-',
      source: 'purchase_bills',
      sourceHref: sourceHref('purchase_bills', bill.doc_no),
      vat,
      warning: agedMissingDoc ? `มี VAT แต่ยังไม่ได้ใบกำกับภาษีเกิน ${MISSING_TAX_DOC_WARNING_DAYS} วัน` : undefined,
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
      sourceHref: sourceHref('expenses', expense.doc_no),
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
      sourceHref: sourceHref('expenses', expense.doc_no),
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
  const [periodRows, branches, openingBalance] = await Promise.all([loadPeriod(filter), listBranches(), loadOpeningTaxBalance(filter)])
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
  const whtChargedBeforeOpening = sum(whtChargedItems, 'wht')
  const whtWithheldBeforeOpening = sum(whtWithheldItems, 'wht')
  const vatPayableBeforeOpening = vatOut - vatIn
  const vatInputCredit = openingBalance.applied ? openingBalance.vatInputCredit : 0
  const vatOutputAccrued = openingBalance.applied ? openingBalance.vatOutputAccrued : 0
  const whtCreditCarried = openingBalance.applied ? openingBalance.whtCreditCarried : 0
  const whtPayableCarried = openingBalance.applied ? openingBalance.whtPayableCarried : 0
  const agedMissingCount = vatInputItems.filter((item) => item.agedMissingDoc).length
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
        'ยอด VAT/WHT opening balance เป็น global และรวมเฉพาะงวด go-live เมื่อไม่ได้กรองสาขา',
        'Drilldown link เปิดเฉพาะ source document ที่มี route รายละเอียดแล้ว',
      ],
      writeActionsEnabled: false,
    },
    openingBalance,
    summary: {
      agedMissingCount,
      missingCount: vatInputItems.filter((item) => !item.hasDoc).length,
      vatIn,
      vatInputCredit,
      vatOut,
      vatOutputAccrued,
      vatPayable: vatPayableBeforeOpening + vatOutputAccrued - vatInputCredit,
      vatPayableBeforeOpening,
      whtChargedBeforeOpening,
      whtChargedNet: whtChargedBeforeOpening + whtPayableCarried,
      whtCreditCarried,
      whtPayableCarried,
      whtWithheldBeforeOpening,
      whtWithheldNet: whtWithheldBeforeOpening + whtCreditCarried,
    },
    taxCalendar,
    vatInput: { items: vatInputItems },
    vatOutput: { items: vatOutputItems },
    whtCharged: { items: whtChargedItems },
    whtWithheld: { items: whtWithheldItems },
  }
}
