'use client'

import { Download, Plus, Printer } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { KpiCard as SharedKpiCard, type KpiCardTone } from '@/components/ui/KpiCard'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { paymentMethodGroupFromValue, type PaymentMethodGroup } from '@/lib/account-payment-method'
import { dailyFetchJson, expenseFormSchema, formatMoney, todayDateInput, type DailyAccountOption, type ExpenseFormValues, type ExpenseLineFormValues } from '@/lib/daily'
import { formatDateDisplay, formatDecimalDisplay, formatDecimalDraft, sanitizeDecimalInput } from '@/lib/format'
import { openExpenseReceiptPrint } from '@/lib/expense-print'
import { listMasterDataRecords, type MasterDataRecord } from '@/lib/master-data'

type CategoryOption = { active: boolean | null; id: string; name: string; typeId?: string | null; typeName?: string | null }
type ExpenseLineDraft = Omit<ExpenseLineFormValues, 'id'> & { categoryName?: string; id: string; lineNo?: number; vatPct?: number }
type ExpenseRow = Omit<ExpenseFormValues, 'lines'> & {
  accountName: string
  categoryName: string
  docNo: string
  id: string
  lines: ExpenseLineDraft[]
  netAmount: number
  vat: number
  wht: number
}

type PayeeOption = {
  bankAccounts?: Array<{
    accountName: string | null
    accountNo: string | null
    active: boolean | null
    bankName: string | null
    code: string
    isPrimary: boolean | null
    paymentMethod: string | null
  }>
  code: string
  name: string
  source: 'customer' | 'supplier' | 'salesperson' | 'employee'
  sourceLabel: string
}

type ExpensePayload = {
  accounts: DailyAccountOption[]
  categories: CategoryOption[]
  payeeOptions?: PayeeOption[]
  rows: ExpenseRow[]
  settings?: {
    vatRatePercent: number
    whtRatePercent: number
  }
}

type ExpenseHeatmapRow = {
  anomaly: 'high' | 'low' | null
  avg: number
  byMonth: Record<string, number>
  deviation: number
  id: string
  latest: number
  name: string
  total: number
}

type ExpenseDashboardData = {
  anomalies: ExpenseHeatmapRow[]
  avg: number
  grandByMonth: Record<string, number>
  heatmapRows: ExpenseHeatmapRow[]
  latest: number
  monthList: string[]
  prev: number
  total: number
  vsAvg: number
}

type MultiSegmentOption = {
  label: string
  values: ExpenseFormValues['status'][]
}
type ExpenseDashboardColumnKey = 'avg' | 'category' | 'latest' | 'status' | 'total' | `month:${string}`
type ExpenseDashboardSortKey = ExpenseDashboardColumnKey
type ExpenseColumnKey = 'account' | 'action' | 'amountSummary' | 'category' | 'date' | 'docNo' | 'dueDate' | 'netAmount' | 'payee' | 'refDocNo' | 'status'
type ExpenseSortDirection = 'asc' | 'desc'
type ExpenseSortKey = Exclude<ExpenseColumnKey, 'action'>

const whtRateOptions = [
  { label: '1% (ขนส่ง/รับเหมา)', value: 1 },
  { label: '2% (โฆษณา)', value: 2 },
  { label: '3% (บริการ)', value: 3 },
  { label: '5% (ค่าเช่า)', value: 5 },
  { label: '10% (ต่างชาติ)', value: 10 },
  { label: '15% (ดอกเบี้ย/เงินปันผล)', value: 15 },
]

const emptyForm: ExpenseFormValues = {
  accountId: null,
  amount: 0,
  branchId: null,
  bankFee: 0,
  categoryId: null,
  date: todayDateInput(),
  description: null,
  discount: 0,
  docNo: null,
  dueDate: todayDateInput(),
  hasVat: false,
  hasWht: false,
  id: null,
  lines: [],
  notes: null,
  payee: '',
  paymentAction: 'submit_approval',
  refDocNo: null,
  status: 'pending_approval',
  supplierId: '',
  supplierPaymentDestinationId: null,
  taxInvoiceNo: null,
}

const expenseStatusOptions: MultiSegmentOption[] = [
  { label: 'ทุกสถานะ', values: [] },
  { label: 'ยังไม่อนุมัติ', values: ['pending_approval'] },
  { label: 'อนุมัติแล้ว', values: ['approved'] },
  { label: 'เสร็จสิ้น', values: ['paid'] },
  { label: 'ยกเลิกแล้ว', values: ['cancelled'] },
]
const expenseColumns: Array<ResizableColumnDefinition<ExpenseColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'dueDate', defaultWidth: 120, minWidth: 100 },
  { key: 'refDocNo', defaultWidth: 140, minWidth: 110 },
  { key: 'payee', defaultWidth: 260, minWidth: 130 },
  { key: 'category', defaultWidth: 160, minWidth: 120 },
  { key: 'account', defaultWidth: 180, minWidth: 130 },
  { key: 'status', defaultWidth: 130, minWidth: 110 },
  { key: 'netAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'amountSummary', defaultWidth: 120, minWidth: 95 },
  { key: 'action', defaultWidth: 180, minWidth: 150 },
]

function expenseStatusLabel(status: ExpenseFormValues['status']) {
  if (status === 'approved') return 'อนุมัติแล้ว'
  if (status === 'paid') return 'เสร็จสิ้น'
  if (status === 'cancelled') return 'ยกเลิกแล้ว'
  return 'ยังไม่อนุมัติ'
}

function paymentMethodOptionGroup(value: string, paymentMethods: Array<Pick<MasterDataRecord, 'name' | 'type'>>) {
  return paymentMethodGroupFromValue(value, paymentMethods) ?? 'bank'
}

function accountMatchesPaymentMethod(account: DailyAccountOption, methodGroup: PaymentMethodGroup, paymentMethods: Array<Pick<MasterDataRecord, 'name' | 'type'>>) {
  const accountGroup = paymentMethodGroupFromValue(account.type, paymentMethods) ?? (String(account.type ?? '').toLowerCase().includes('cash') || String(account.type ?? '').includes('เงินสด') ? 'cash' : 'bank')
  return accountGroup === methodGroup
}

function expenseStatusTextClass(status: ExpenseFormValues['status']) {
  if (status === 'approved') return 'text-blue-700'
  if (status === 'paid') return 'text-emerald-700'
  if (status === 'cancelled') return 'text-slate-500'
  return 'text-amber-700'
}

function expenseStatusDotClass(status: ExpenseFormValues['status']) {
  if (status === 'approved') return 'bg-blue-500'
  if (status === 'paid') return 'bg-emerald-500'
  if (status === 'cancelled') return 'bg-slate-400'
  return 'bg-amber-500'
}

function expenseRowTone(status: ExpenseFormValues['status']) {
  if (status === 'approved') return 'bg-blue-50/30'
  if (status === 'cancelled') return 'bg-slate-50 text-slate-500'
  if (status === 'pending_approval') return 'bg-amber-50/30'
  return ''
}

function canMutateExpense(status: ExpenseFormValues['status']) {
  return status === 'pending_approval'
}

function expenseSortValue(row: ExpenseRow, key: ExpenseSortKey) {
  switch (key) {
    case 'account':
      return row.accountName
    case 'amountSummary':
      return row.amount
    case 'category':
      return row.categoryName
    case 'date':
      return row.date
    case 'docNo':
      return row.docNo
    case 'dueDate':
      return row.dueDate ?? ''
    case 'netAmount':
      return row.netAmount
    case 'payee':
      return row.payee
    case 'refDocNo':
      return row.refDocNo ?? ''
    case 'status':
      return expenseStatusLabel(row.status)
  }
}

function dashboardSortValue(row: ExpenseHeatmapRow, key: ExpenseDashboardSortKey) {
  if (key.startsWith('month:')) return row.byMonth[key.slice('month:'.length)] ?? 0
  switch (key) {
    case 'avg':
      return row.avg
    case 'category':
      return row.name
    case 'latest':
      return row.latest
    case 'status':
      return row.anomaly === 'high' ? 2 : row.anomaly === 'low' ? 1 : 0
    case 'total':
      return row.total
  }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function createExpenseLine(seed: Partial<ExpenseLineDraft> = {}): ExpenseLineDraft {
  return {
    amount: seed.amount ?? 0,
    categoryId: seed.categoryId ?? null,
    categoryName: seed.categoryName ?? '',
    description: seed.description ?? null,
    hasVat: seed.hasVat ?? false,
    id: seed.id ?? `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lineNo: seed.lineNo,
    vatAmount: seed.vatAmount ?? 0,
    vatPct: seed.vatPct ?? 0,
    whtAmount: seed.whtAmount ?? 0,
    whtPct: seed.whtPct ?? 0,
  }
}

function normalizeLookupText(value: string | null | undefined) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function findSupplierPayeeOption(options: PayeeOption[], value: string) {
  const normalizedValue = normalizeLookupText(value)
  if (!normalizedValue) return null
  return options.find((option) => option.source === 'supplier' && normalizeLookupText(option.name) === normalizedValue) ?? null
}

function supplierPaymentDestinationLabel(account: NonNullable<PayeeOption['bankAccounts']>[number]) {
  return [account.paymentMethod, account.bankName, account.accountNo, account.accountName].filter(Boolean).join(' / ') || account.code
}

function normalizeExpenseLines(lines: ExpenseFormValues['lines'] | ExpenseLineDraft[] | undefined, fallback?: Partial<ExpenseFormValues>): ExpenseLineDraft[] {
  if (lines && lines.length > 0) {
    return lines.map((line, index) => createExpenseLine({
      ...line,
      id: line.id ?? `line-${index + 1}`,
      lineNo: 'lineNo' in line && typeof line.lineNo === 'number' ? line.lineNo : index + 1,
    }))
  }

  if (fallback && fallback.amount && fallback.amount > 0) {
    return [createExpenseLine({
      amount: fallback.amount,
      categoryId: fallback.categoryId ?? null,
      description: fallback.description ?? null,
      hasVat: fallback.hasVat ?? false,
      id: 'line-1',
      lineNo: 1,
      vatAmount: 0,
      whtAmount: 0,
      whtPct: fallback.hasWht ? 3 : 0,
    })]
  }

  return [createExpenseLine()]
}

function calculateExpenseLine(line: ExpenseLineDraft, vatRatePercent: number) {
  const amount = roundMoney(line.amount)
  const vatAmount = line.hasVat ? roundMoney(amount * vatRatePercent / 100) : 0
  const whtPct = roundMoney(line.whtPct)
  const whtAmount = whtPct > 0 ? roundMoney(amount * whtPct / 100) : 0
  return { ...line, amount, vatAmount, vatPct: line.hasVat ? vatRatePercent : 0, whtAmount, whtPct }
}

function calculateExpenseTotals(lines: ExpenseLineDraft[], vatRatePercent: number) {
  const calculatedLines = lines.map((line) => calculateExpenseLine(line, vatRatePercent))
  const amount = roundMoney(calculatedLines.reduce((sum, line) => sum + line.amount, 0))
  const vatAmount = roundMoney(calculatedLines.reduce((sum, line) => sum + line.vatAmount, 0))
  const whtAmount = roundMoney(calculatedLines.reduce((sum, line) => sum + line.whtAmount, 0))
  return {
    amount,
    lines: calculatedLines,
    netAmount: amount + vatAmount - whtAmount,
    vatAmount,
    whtAmount,
  }
}

function buildLegacyExpenseDashboard(rows: ExpenseRow[], categories: CategoryOption[], periodMonths: number): ExpenseDashboardData {
  const monthList = getRecentMonths(periodMonths)
  const byCategory = new Map<string, ExpenseHeatmapRow>()

  for (const category of categories.filter((item) => item.active !== false)) {
    byCategory.set(category.id, {
      anomaly: null,
      avg: 0,
      byMonth: Object.fromEntries(monthList.map((month) => [month, 0])),
      deviation: 0,
      id: category.id,
      latest: 0,
      name: category.name || category.id,
      total: 0,
    })
  }

  byCategory.set('_uncat', {
    anomaly: null,
    avg: 0,
    byMonth: Object.fromEntries(monthList.map((month) => [month, 0])),
    deviation: 0,
    id: '_uncat',
    latest: 0,
    name: 'ไม่ระบุหมวด',
    total: 0,
  })

  for (const row of rows) {
    if (!row.date) continue
    const month = row.date.slice(0, 7)
    if (!monthList.includes(month)) continue
    const key = row.categoryId && byCategory.has(row.categoryId) ? row.categoryId : '_uncat'
    const target = byCategory.get(key)
    if (!target) continue
    const amount = (Number(row.amount) || 0) + (Number(row.vat) || 0)
    target.byMonth[month] = (target.byMonth[month] ?? 0) + amount
    target.total += amount
  }

  const heatmapRows = Array.from(byCategory.values())
    .map((item) => {
      const latest = item.byMonth[monthList[monthList.length - 1]] ?? 0
      const avg = item.total / periodMonths
      const anomaly: ExpenseHeatmapRow['anomaly'] = avg > 0 && latest > Math.max(avg * 1.5, 5000)
        ? 'high'
        : avg > 0 && latest > 0 && latest < avg * 0.3
          ? 'low'
          : null
      const deviation = avg > 0 ? ((latest - avg) / avg) * 100 : 0
      return { ...item, anomaly, avg, deviation, latest }
    })
    .filter((item) => item.total > 0)
    .sort((left, right) => right.total - left.total)

  const grandByMonth = Object.fromEntries(monthList.map((month) => [month, 0]))
  for (const item of heatmapRows) {
    for (const month of monthList) {
      grandByMonth[month] = (grandByMonth[month] ?? 0) + (item.byMonth[month] ?? 0)
    }
  }

  const monthlyTotals = monthList.map((month) => grandByMonth[month] ?? 0)
  const total = monthlyTotals.reduce((sum, value) => sum + value, 0)
  const avg = monthlyTotals.length > 0 ? total / monthlyTotals.length : 0
  const latest = monthlyTotals[monthlyTotals.length - 1] ?? 0
  const prev = monthlyTotals[monthlyTotals.length - 2] ?? 0
  const vsAvg = avg > 0 ? ((latest - avg) / avg) * 100 : 0

  return {
    anomalies: heatmapRows.filter((item) => item.anomaly),
    avg,
    grandByMonth,
    heatmapRows,
    latest,
    monthList,
    prev,
    total,
    vsAvg,
  }
}

export function DailyExpensePageClient({ dashboardOnly = false }: { dashboardOnly?: boolean }) {
  const [accounts, setAccounts] = useState<DailyAccountOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [detailRow, setDetailRow] = useState<ExpenseRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<ExpenseFormValues>(emptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentMethods, setPaymentMethods] = useState<MasterDataRecord[]>([])
  const [payeeOptions, setPayeeOptions] = useState<PayeeOption[]>([])
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [accountId, setAccountId] = useState('')
  const [statusFilter, setStatusFilter] = useState<ExpenseFormValues['status'][]>([])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [periodMonths, setPeriodMonths] = useState(6)
  const [dashboardSortDirection, setDashboardSortDirection] = useState<ExpenseSortDirection>('desc')
  const [dashboardSortKey, setDashboardSortKey] = useState<ExpenseDashboardSortKey>('total')
  const [sortDirection, setSortDirection] = useState<ExpenseSortDirection>('desc')
  const [sortKey, setSortKey] = useState<ExpenseSortKey>('date')
  const [vatRatePercent, setVatRatePercent] = useState(7)
  const [whtRatePercent, setWhtRatePercent] = useState(3)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [anomaliesExpanded, setAnomaliesExpanded] = useState(false)
  const [selectedCategoryRow, setSelectedCategoryRow] = useState<ExpenseHeatmapRow | null>(null)
  const [showDashboardMobileFilters, setShowDashboardMobileFilters] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  const columnResize = useResizableColumns('daily.expense.v5', expenseColumns)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [payload, paymentMethodRows] = await Promise.all([
        dailyFetchJson<ExpensePayload>('/api/daily/expenses'),
        listMasterDataRecords('/api/master-data/payment-methods'),
      ])
      const activePaymentMethods = paymentMethodRows.filter((method) => method.active)
      setAccounts(payload.accounts)
      setCategories(payload.categories)
      setPaymentMethods(activePaymentMethods)
      setPaymentMethod((current) => current || activePaymentMethods[0]?.name || '')
      setPayeeOptions(payload.payeeOptions ?? [])
      setRows(payload.rows)
      setVatRatePercent(payload.settings?.vatRatePercent ?? 7)
      setWhtRatePercent(payload.settings?.whtRatePercent ?? 3)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายการค่าใช้จ่ายไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows
      .filter((row) => !categoryId || row.categoryId === categoryId || row.lines.some((line) => line.categoryId === categoryId))
      .filter((row) => !dateFrom || row.date >= dateFrom)
      .filter((row) => !dateTo || row.date <= dateTo)
      .filter((row) => !accountId || row.accountId === accountId)
      .filter((row) => statusFilter.length === 0 || statusFilter.includes(row.status))
      .filter((row) => {
        const lineText = row.lines.map((line) => `${line.categoryName ?? ''} ${line.description ?? ''}`).join(' ')
        return !query || `${row.docNo} ${row.payee} ${row.refDocNo ?? ''} ${row.description ?? ''} ${lineText}`.toLowerCase().includes(query)
      })
      .sort((left, right) => {
        const leftValue = expenseSortValue(left, sortKey)
        const rightValue = expenseSortValue(right, sortKey)
        const base = typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : String(leftValue).localeCompare(String(rightValue), 'th', { numeric: true })
        const directed = sortDirection === 'asc' ? base : -base
        return directed || right.date.localeCompare(left.date) || right.docNo.localeCompare(left.docNo)
      })
  }, [accountId, categoryId, dateFrom, dateTo, rows, search, sortDirection, sortKey, statusFilter])

  const summary = useMemo(() => {
    const month = todayDateInput().slice(0, 7)
    const monthly = rows.filter((row) => row.date.startsWith(month))
    const byCategory = new Map<string, number>()
    const byPayee = new Map<string, number>()
    for (const row of monthly) {
      const lines = normalizeExpenseLines(row.lines, row)
      for (const line of lines) {
        const categoryName = line.categoryName || row.categoryName || 'ไม่ระบุหมวด'
        const lineNet = line.amount + line.vatAmount - line.whtAmount
        byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + lineNet)
      }
      byPayee.set(row.payee || 'ไม่ระบุผู้รับเงิน', (byPayee.get(row.payee || 'ไม่ระบุผู้รับเงิน') ?? 0) + row.netAmount)
    }
    const trend = getRecentMonths(6).map((trendMonth) => ({
      month: trendMonth,
      total: rows.filter((row) => row.date.startsWith(trendMonth)).reduce((sum, row) => sum + row.netAmount, 0),
    }))
    const topCategories = Array.from(byCategory, ([name, total]) => ({ name, total })).sort((left, right) => right.total - left.total).slice(0, 8)
    return {
      catTotal: topCategories.reduce((sum, item) => sum + item.total, 0),
      monthlyCount: monthly.length,
      monthlyTotal: monthly.reduce((sum, row) => sum + row.netAmount, 0),
      paidTotal: rows.filter((row) => row.status === 'paid').reduce((sum, row) => sum + row.netAmount, 0),
      pendingTotal: rows.filter((row) => row.status !== 'paid' && row.status !== 'cancelled').reduce((sum, row) => sum + row.netAmount, 0),
      topCategories,
      topPayees: Array.from(byPayee, ([name, total]) => ({ name, total })).sort((left, right) => right.total - left.total).slice(0, 5),
      trend,
    }
  }, [rows])

  const filteredSummary = useMemo(() => ({
    count: filteredRows.length,
    netAmount: filteredRows.reduce((sum, row) => sum + row.netAmount, 0),
  }), [filteredRows])

  const filteredFormCategoryOptions = useMemo(() => categories
    .filter((category) => category.active !== false)
    .map((category) => ({
      description: category.typeName ?? undefined,
      id: category.id,
      label: category.name,
      searchText: `${category.id} ${category.name} ${category.typeName ?? ''}`,
    })), [categories])

  const formLines = useMemo(() => normalizeExpenseLines(form.lines, form), [form])
  const formTotals = useMemo(() => calculateExpenseTotals(formLines, vatRatePercent), [formLines, vatRatePercent])
  const selectedSupplier = useMemo(() => payeeOptions.find((option) => option.source === 'supplier' && option.code === form.supplierId) ?? null, [form.supplierId, payeeOptions])
  const supplierPaymentDestinations = useMemo(() => selectedSupplier?.bankAccounts?.filter((account) => account.active !== false) ?? [], [selectedSupplier])
  const selectedPaymentMethodGroup = useMemo(() => paymentMethodOptionGroup(paymentMethod, paymentMethods), [paymentMethod, paymentMethods])
  const paymentAccountOptions = useMemo(() => accounts.filter((account) => account.active && accountMatchesPaymentMethod(account, selectedPaymentMethodGroup, paymentMethods)), [accounts, paymentMethods, selectedPaymentMethodGroup])
  const formPaymentAmount = useMemo(() => Math.max(0, formTotals.netAmount - (Number(form.discount) || 0)), [form.discount, formTotals.netAmount])
  const formCashOutAmount = useMemo(() => formPaymentAmount + (selectedPaymentMethodGroup === 'cash' ? 0 : Number(form.bankFee) || 0), [form.bankFee, formPaymentAmount, selectedPaymentMethodGroup])

  const exportHref = useMemo(() => {
    const params = new URLSearchParams()
    if (search) params.set('q', search)
    if (categoryId) params.set('categoryId', categoryId)
    if (accountId) params.set('accountId', accountId)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (statusFilter.length > 0) params.set('status', statusFilter.join(','))
    params.set('format', 'xlsx')
    return `/api/daily/expenses?${params.toString()}`
  }, [accountId, categoryId, dateFrom, dateTo, search, statusFilter])

  const dashboard = useMemo(() => buildLegacyExpenseDashboard(filteredRows, categories, periodMonths), [categories, periodMonths, filteredRows])
  const dashboardColumns = useMemo<Array<ResizableColumnDefinition<ExpenseDashboardColumnKey>>>(() => [
    { key: 'category', defaultWidth: 200, minWidth: 150 },
    ...dashboard.monthList.map((month) => ({ key: `month:${month}` as const, defaultWidth: 130, minWidth: 110 })),
    { key: 'avg', defaultWidth: 130, minWidth: 110 },
    { key: 'total', defaultWidth: 140, minWidth: 120 },
    { key: 'status', defaultWidth: 130, minWidth: 110 },
  ], [dashboard.monthList])
  const dashboardColumnResize = useResizableColumns('daily.expense-dashboard.heatmap', dashboardColumns)
  const dashboardTabletColumns = useMemo<Array<ResizableColumnDefinition<ExpenseDashboardSortKey>>>(() => [
    { key: 'category', defaultWidth: 240, minWidth: 160 },
    { key: 'latest', defaultWidth: 180, minWidth: 130 },
    { key: 'avg', defaultWidth: 160, minWidth: 120 },
    { key: 'status', defaultWidth: 150, minWidth: 120 },
  ], [])
  const dashboardTabletColumnResize = useResizableColumns('daily.expense-dashboard.tablet.v1', dashboardTabletColumns)
  const dashboardRows = useMemo(() => [...dashboard.heatmapRows].sort((left, right) => {
    const leftValue = dashboardSortValue(left, dashboardSortKey)
    const rightValue = dashboardSortValue(right, dashboardSortKey)
    const base = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'th', { numeric: true })
    const directed = dashboardSortDirection === 'asc' ? base : -base
    return directed || right.total - left.total || left.name.localeCompare(right.name, 'th')
  }), [dashboard.heatmapRows, dashboardSortDirection, dashboardSortKey])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [currentPage, filteredRows, pageSize])
  const activeMobileFilterCount = [dateFrom || dateTo, categoryId, accountId, statusFilter.length > 0].filter(Boolean).length

  useEffect(() => {
    setPage(1)
  }, [accountId, categoryId, dateFrom, dateTo, pageSize, search, sortDirection, sortKey, statusFilter])

  function changeSort(nextKey: ExpenseSortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'payee' || nextKey === 'category' || nextKey === 'account' || nextKey === 'status' ? 'asc' : 'desc')
  }

  function changeDashboardSort(nextKey: ExpenseDashboardSortKey) {
    if (nextKey === dashboardSortKey) {
      setDashboardSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setDashboardSortKey(nextKey)
    setDashboardSortDirection(nextKey === 'category' ? 'asc' : 'desc')
  }

  function syncFormLines(current: ExpenseFormValues, lines: ExpenseLineDraft[]) {
    const totals = calculateExpenseTotals(lines, vatRatePercent)
    const description = totals.lines.map((line) => line.description).filter(Boolean).join(' / ').slice(0, 500) || null
    return {
      ...current,
      amount: totals.amount,
      categoryId: totals.lines.find((line) => line.categoryId)?.categoryId ?? null,
      description,
      hasVat: totals.vatAmount > 0,
      hasWht: totals.whtAmount > 0,
      lines: totals.lines,
    }
  }

  function openCreateForm() {
    const today = todayDateInput()
    setForm({ ...emptyForm, date: today, dueDate: today, lines: [createExpenseLine()], paymentAction: 'submit_approval' })
    setPaymentMethod((current) => current || paymentMethods[0]?.name || '')
    setFieldErrors({})
    setFormOpen(true)
  }

  function openEditForm(row: ExpenseRow) {
    if (!canMutateExpense(row.status)) {
      setError('แก้ไขได้เฉพาะรายการค่าใช้จ่ายที่ยังไม่อนุมัติ')
      return
    }
    const nextLines = normalizeExpenseLines(row.lines, row)
    setForm(syncFormLines({
      accountId: row.accountId,
      amount: row.amount,
      bankFee: 0,
      branchId: row.branchId,
      categoryId: row.categoryId,
      date: row.date,
      description: row.description,
      discount: 0,
      docNo: row.docNo,
      dueDate: row.dueDate,
      hasVat: row.hasVat,
      hasWht: row.hasWht,
      id: row.id,
      notes: row.notes,
      payee: row.payee,
      paymentAction: 'submit_approval',
      refDocNo: row.refDocNo,
      status: row.status,
      supplierId: row.supplierId,
      supplierPaymentDestinationId: null,
      taxInvoiceNo: row.taxInvoiceNo,
    }, nextLines))
    setError(null)
    setPaymentMethod((current) => current || paymentMethods[0]?.name || '')
    setFieldErrors({})
    setFormOpen(true)
  }

  function updatePaymentMethod(nextMethod: string) {
    const nextGroup = paymentMethodOptionGroup(nextMethod, paymentMethods)
    setPaymentMethod(nextMethod)
    setForm((current) => {
      const selectedAccount = accounts.find((account) => account.id === current.accountId)
      return {
        ...current,
        accountId: selectedAccount && accountMatchesPaymentMethod(selectedAccount, nextGroup, paymentMethods) ? current.accountId : null,
        bankFee: nextGroup === 'cash' ? 0 : current.bankFee,
      }
    })
  }

  function updateExpenseLine(index: number, patch: Partial<ExpenseLineDraft>) {
    setForm((current) => {
      const nextLines = normalizeExpenseLines(current.lines, current).map((line, lineIndex) => (
        lineIndex === index ? { ...line, ...patch } : line
      ))
      return syncFormLines(current, nextLines)
    })
  }

  function addExpenseLine() {
    setForm((current) => syncFormLines(current, [...normalizeExpenseLines(current.lines, current), createExpenseLine()]))
  }

  function removeExpenseLine(index: number) {
    setForm((current) => {
      const currentLines = normalizeExpenseLines(current.lines, current)
      const nextLines = currentLines.filter((_, lineIndex) => lineIndex !== index)
      return syncFormLines(current, nextLines.length > 0 ? nextLines : [createExpenseLine()])
    })
  }

  async function cancelExpense(row: ExpenseRow) {
    if (!canMutateExpense(row.status)) {
      setError('ยกเลิกได้เฉพาะรายการค่าใช้จ่ายที่ยังไม่อนุมัติ')
      return
    }
    if (!window.confirm(`ยืนยันยกเลิกรายการ ${row.docNo} ?`)) return

    setError(null)
    try {
      await dailyFetchJson(`/api/daily/expenses/${row.id}`, {
        method: 'PATCH',
      })
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิกรายการค่าใช้จ่ายไม่ได้')
    }
  }

  async function saveForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const totals = calculateExpenseTotals(normalizeExpenseLines(form.lines, form), vatRatePercent)
    const payload = syncFormLines({
      ...form,
      bankFee: selectedPaymentMethodGroup === 'cash' ? 0 : form.bankFee,
      status: form.paymentAction === 'pay_now' ? 'paid' : 'pending_approval',
    }, totals.lines)
    const parsed = expenseFormSchema.safeParse(payload)
    if (!parsed.success) {
      const nextFieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
      setFieldErrors(nextFieldErrors)
      const firstField = parsed.error.issues[0]?.path.join('.') ?? ''
      if (firstField) {
        requestAnimationFrame(() => {
          const container = formRef.current?.querySelector<HTMLElement>(`[data-field="${firstField}"]`)
          container?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          const target = container?.querySelector<HTMLElement>('input, select, textarea, button')
          target?.focus()
        })
      }
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/daily/expenses', {
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกค่าใช้จ่ายไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {dashboardOnly ? (
        <>
          {/* 💸 KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <ExpenseMetric
              label={`ยอดรวม ${periodMonths} เดือน`}
              value={formatMoney(dashboard.total)}
              unit="บาท"
              icon="📊"
              iconBg="bg-indigo-50 text-indigo-600 border border-indigo-100/50"
            />
            <ExpenseMetric
              label="เฉลี่ยรายเดือน"
              value={formatMoney(dashboard.avg)}
              unit="บาท"
              icon="🧮"
              iconBg="bg-purple-50 text-purple-600 border border-purple-100/50"
            />
            <ExpenseMetric
              label="ยอดใช้จ่ายเดือนนี้"
              value={formatMoney(dashboard.latest)}
              unit="บาท"
              icon="💸"
              iconBg="bg-blue-50 text-blue-600 border border-blue-100/50"
            />
            {(() => {
              const isHigh = dashboard.vsAvg > 20;
              const isLow = dashboard.vsAvg < -20;
              const icon = isHigh ? '📈' : isLow ? '📉' : '⚖️';
              const iconBg = isHigh
                ? 'bg-red-50 text-red-600 border border-red-100/50'
                : isLow
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100/50'
                : 'bg-slate-100 text-slate-600 border border-slate-200/50';
              const valueClass = isHigh ? 'text-red-600' : isLow ? 'text-emerald-600' : 'text-slate-900';
              const subLabel = isHigh ? 'สูงกว่าปกติ' : isLow ? 'ต่ำกว่าปกติ' : 'ใกล้เคียงปกติ';
              const subLabelClass = isHigh ? 'text-red-600' : isLow ? 'text-emerald-600' : 'text-slate-500';
              return (
                <ExpenseMetric
                  label="เทียบค่าเฉลี่ย"
                  value={`${dashboard.vsAvg > 0 ? '+' : ''}${dashboard.vsAvg.toFixed(1)}%`}
                  icon={icon}
                  iconBg={iconBg}
                  valueClass={valueClass}
                  subLabel={subLabel}
                  subLabelClass={subLabelClass}
                />
              );
            })()}
          </div>

          {/* 🚨 Anomaly Panel */}
          {dashboard.anomalies.length > 0 ? (
            !anomaliesExpanded ? (
              <div className="rounded-xl border border-red-100 bg-red-50/10 px-4 py-2.5 shadow-sm flex items-center justify-between text-xs text-red-800">
                <div className="flex items-center gap-2 font-medium">
                  <span>🚨</span>
                  <span>ตรวจพบความผิดปกติของยอดใช้จ่ายจำนวน {dashboard.anomalies.length} หมวด</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAnomaliesExpanded(true)}
                  className="text-xs font-bold text-red-700 hover:text-red-900 transition-colors underline"
                >
                  ดูรายละเอียด →
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-red-100 bg-red-50/10 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-red-800">
                    <span>🚨</span>
                    <h3 className="font-bold text-xs">ระบบตรวจพบความผิดปกติจำนวน {dashboard.anomalies.length} หมวด</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnomaliesExpanded(false)}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors underline"
                  >
                    ซ่อนรายละเอียด
                  </button>
                </div>
                
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {dashboard.anomalies.map((item) => {
                    const isHigh = item.anomaly === 'high';
                    const border = isHigh ? 'border-red-100/60 bg-white' : 'border-amber-100/60 bg-white';
                    const text = isHigh ? 'text-red-600' : 'text-amber-600';
                    const icon = isHigh ? '📈 สูงกว่าปกติ' : '📉 ต่ำกว่าปกติ';
                    return (
                      <div key={item.id} className={`rounded-xl border p-3 transition-all duration-200 hover:shadow-sm ${border}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-bold tracking-wider ${isHigh ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>
                              {icon}
                            </span>
                            <div className="text-xs font-bold text-slate-800 mt-0.5">{item.name}</div>
                            <div className="text-xs text-slate-500">
                              เดือนนี้: <span className="font-semibold text-slate-900 tabular-nums">{formatMoney(item.latest)}</span> · 
                              เฉลี่ย: <span className="font-semibold text-slate-900 tabular-nums">{formatMoney(item.avg)}</span>
                            </div>
                          </div>
                          <div className={`text-base font-extrabold ${text} tabular-nums`}>
                            {item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(0)}%
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white px-4 py-2.5 text-xs text-slate-600 shadow-sm">
              <span className="text-sm">🌿</span>
              <span>ไม่พบความผิดปกติของยอดใช้จ่ายในแต่ละหมวด</span>
            </div>
          )}

          {/* 📊 Heatmap Table */}
          <div className="space-y-3">
            {/* Table Toolbar & Filters */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
              {/* Category SearchCombobox (visible on Desktop/Tablet) / native select (visible on Mobile) */}
              <div className="hidden lg:block w-full max-w-[240px]">
                <SearchCombobox
                  hideLabel
                  inputClassName="h-9 text-xs"
                  inputId="dashboard-category-filter"
                  label="หมวดค่าใช้จ่าย"
                  placeholder="📁 ทุกหมวดค่าใช้จ่าย..."
                  options={filteredFormCategoryOptions}
                  value={categoryId}
                  onChange={(val) => setCategoryId(val || '')}
                />
              </div>
              <div className="block lg:hidden flex-1 max-w-[200px]">
                <select
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">📁 ทุกหมวดค่าใช้จ่าย</option>
                  {categories.filter((cat) => cat.active !== false).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Mobile Filter Button (visible only on mobile < md) */}
              <button
                type="button"
                onClick={() => setShowDashboardMobileFilters(true)}
                className="lg:hidden flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors"
              >
                <span>ตัวกรอง</span>
                {(categoryId || periodMonths !== 6) ? (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-xs font-bold text-white">
                    {(categoryId ? 1 : 0) + (periodMonths !== 6 ? 1 : 0)}
                  </span>
                ) : null}
              </button>

              {/* Desktop & Tablet Filters (hidden on mobile < md) */}
              <div className="hidden lg:flex items-center gap-3 flex-1 justify-end">
                {/* Period Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">📅 ย้อนหลัง:</span>
                  <div className="flex flex-wrap gap-2">
                    {[3, 6, 12].map((months) => {
                      const active = periodMonths === months;
                      return (
                        <button
                          key={months}
                          className={`rounded-md border px-3 py-1 text-xs font-medium transition-all duration-200 ${
                            active
                              ? 'border-slate-700 bg-slate-700 text-white'
                              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                          type="button"
                          onClick={() => setPeriodMonths(months)}
                        >
                          {months} เดือน
                        </button>
                      );
                    })}
                  </div>
                </div>

                {(dashboardColumnResize.hasCustomWidths || dashboardTabletColumnResize.hasCustomWidths) && (
                  <Button
                    className="h-8 rounded-md text-xs"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      dashboardColumnResize.resetColumnWidths()
                      dashboardTabletColumnResize.resetColumnWidths()
                    }}
                  >
                    รีเซ็ตขนาด
                  </Button>
                )}
              </div>
            </div>

            {/* 1. Desktop Layout (Large Heatmap Table) - Visible on lg screens */}
            <div className="expense-dashboard-heatmap hidden lg:block overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
              <table className="ns-table w-full text-xs" style={{ minWidth: dashboardColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {dashboardColumns.map((column) => {
                    const style = dashboardColumnResize.getColumnStyle(column.key);
                    return <col key={column.key} style={style} />;
                  })}
                </colgroup>
                <thead className="bg-slate-50/75 border-b border-slate-200/60">
                  <tr>
                    <ResizableTableHead activeSortKey={dashboardSortKey} direction={dashboardSortDirection} label="หมวดค่าใช้จ่าย" resizeProps={dashboardColumnResize.getResizeHandleProps('category', 'หมวดค่าใช้จ่าย')} sortKey="category" onSort={changeDashboardSort} />
                    {dashboard.monthList.map((month) => (
                      <ResizableTableHead key={month} activeSortKey={dashboardSortKey} align="right" direction={dashboardSortDirection} label={formatMonthLabel(month)} resizeProps={dashboardColumnResize.getResizeHandleProps(`month:${month}`, formatMonthLabel(month))} sortKey={`month:${month}` as ExpenseDashboardSortKey} onSort={changeDashboardSort} />
                    ))}
                    <ResizableTableHead activeSortKey={dashboardSortKey} align="right" direction={dashboardSortDirection} label="เฉลี่ยรายเดือน" resizeProps={dashboardColumnResize.getResizeHandleProps('avg', 'เฉลี่ยรายเดือน')} sortKey="avg" onSort={changeDashboardSort} />
                    <ResizableTableHead activeSortKey={dashboardSortKey} align="right" direction={dashboardSortDirection} label="ยอดรวม" resizeProps={dashboardColumnResize.getResizeHandleProps('total', 'ยอดรวม')} sortKey="total" onSort={changeDashboardSort} />
                    <ResizableTableHead activeSortKey={dashboardSortKey} align="center" direction={dashboardSortDirection} label="สถานะ" resizeProps={dashboardColumnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeDashboardSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {isLoading ? (
                    <tr>
                      <td className="py-12 text-center text-slate-400" colSpan={dashboard.monthList.length + 4}>
                        <div className="flex flex-col items-center justify-center gap-2">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
                          <span>กำลังโหลดข้อมูลวิเคราะห์...</span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {!isLoading && dashboardRows.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="expense-dashboard-sticky sticky left-0 bg-white/95 backdrop-blur-sm px-4 py-3 font-semibold text-slate-900 border-r border-slate-200/60 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        {item.name}
                      </td>
                      {dashboard.monthList.map((month) => {
                        const value = item.byMonth[month] ?? 0;
                        const hot = item.avg > 0 && value > item.avg * 1.5;
                        const low = item.avg > 0 && value > 0 && value < item.avg * 0.5;
                        
                        return (
                          <td key={month} className="px-3 py-3 text-right tabular-nums">
                            {value > 0 ? (
                              <span className={`expense-dashboard-amount inline-block px-1.5 py-0.5 rounded transition-colors ${
                                hot 
                                  ? 'bg-rose-50 text-rose-700 font-bold' 
                                  : low 
                                    ? 'bg-emerald-50 text-emerald-700 font-medium' 
                                    : 'text-slate-700 font-medium'
                              }`}>
                                {formatMoney(value)}
                              </span>
                            ) : (
                              <span className="expense-dashboard-muted text-slate-300 font-light">-</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="expense-dashboard-average-cell bg-blue-50/30 px-3 py-3 text-right text-blue-700 font-semibold tabular-nums">
                        {formatMoney(item.avg)}
                      </td>
                      <td className="expense-dashboard-total-cell bg-violet-50/20 px-3 py-3 text-right font-bold text-violet-700 tabular-nums">
                        {formatMoney(item.total)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {item.anomaly === 'high' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-600" /> สูง
                          </span>
                        ) : item.anomaly === 'low' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> ต่ำ
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ปกติ
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && dashboardRows.length === 0 ? (
                    <tr>
                      <td className="py-12 text-center text-slate-400" colSpan={dashboard.monthList.length + 4}>
                        ยังไม่มีข้อมูลบันทึกค่าใช้จ่ายในช่วงเวลานี้
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {dashboardRows.length > 0 ? (
                  <tfoot className="bg-slate-50/50 font-bold border-t border-slate-200/60">
                    <tr className="divide-y divide-slate-100">
                      <td className="expense-dashboard-sticky sticky left-0 bg-slate-50/90 backdrop-blur-sm px-4 py-3.5 text-slate-900 border-r border-slate-200/60 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                        รวมทุกหมวด
                      </td>
                      {dashboard.monthList.map((month) => (
                        <td key={month} className="expense-dashboard-amount px-3 py-3.5 text-right text-slate-900 tabular-nums">
                          {formatMoney(dashboard.grandByMonth[month] ?? 0)}
                        </td>
                      ))}
                      <td className="expense-dashboard-average-cell px-3 py-3.5 text-right text-blue-700 tabular-nums">{formatMoney(dashboard.avg)}</td>
                      <td className="expense-dashboard-total-cell px-3 py-3.5 text-right text-violet-700 tabular-nums">{formatMoney(dashboard.total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            {/* 2. Tablet Layout (Simplified Table) - Visible on md & lg screens */}
            <div className="expense-dashboard-heatmap hidden md:block lg:hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
              <table className="ns-table w-full text-xs" style={{ minWidth: dashboardTabletColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {dashboardTabletColumns.map((column) => {
                    const style = dashboardTabletColumnResize.getColumnStyle(column.key)
                    return <col key={column.key} style={style} />
                  })}
                </colgroup>
                <thead className="bg-slate-50/75 border-b border-slate-200/60">
                  <tr>
                    <ResizableTableHead activeSortKey={dashboardSortKey} direction={dashboardSortDirection} label="หมวดค่าใช้จ่าย" resizeProps={dashboardTabletColumnResize.getResizeHandleProps('category', 'หมวดค่าใช้จ่าย')} sortKey="category" onSort={changeDashboardSort} />
                    <ResizableTableHead activeSortKey={dashboardSortKey} align="right" direction={dashboardSortDirection} label={`เดือนล่าสุด (${formatMonthLabel(dashboard.monthList[dashboard.monthList.length - 1])})`} resizeProps={dashboardTabletColumnResize.getResizeHandleProps('latest', 'เดือนล่าสุด')} sortKey="latest" onSort={changeDashboardSort} />
                    <ResizableTableHead activeSortKey={dashboardSortKey} align="right" direction={dashboardSortDirection} label="เฉลี่ยรายเดือน" resizeProps={dashboardTabletColumnResize.getResizeHandleProps('avg', 'เฉลี่ยรายเดือน')} sortKey="avg" onSort={changeDashboardSort} />
                    <ResizableTableHead activeSortKey={dashboardSortKey} align="center" direction={dashboardSortDirection} label="สถานะ" resizeProps={dashboardTabletColumnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeDashboardSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <tr>
                      <td className="py-8 text-center text-slate-400" colSpan={dashboardTabletColumns.length}>
                        กำลังโหลดข้อมูลวิเคราะห์...
                      </td>
                    </tr>
                  ) : null}
                  {!isLoading && dashboardRows.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {item.name}
                      </td>
                      <td className="expense-dashboard-amount px-3 py-3 text-right tabular-nums font-medium text-slate-700">
                        {formatMoney(item.latest)}
                      </td>
                      <td className="expense-dashboard-average-cell px-3 py-3 text-right font-semibold text-blue-700 tabular-nums">
                        {formatMoney(item.avg)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {item.anomaly === 'high' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/10">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-600" /> สูง
                          </span>
                        ) : item.anomaly === 'low' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/10">
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> ต่ำ
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> ปกติ
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!isLoading && dashboardRows.length === 0 ? (
                    <tr>
                      <td className="py-8 text-center text-slate-400" colSpan={dashboardTabletColumns.length}>
                        ยังไม่มีข้อมูลบันทึกค่าใช้จ่ายในช่วงเวลานี้
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* 3. Mobile Layout (Expense Analytics Cards) - Visible on mobile < md */}
            <div className="expense-dashboard-heatmap block md:hidden space-y-3">
              {isLoading ? (
                <div className="py-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600" />
                    <span>กำลังโหลดข้อมูลวิเคราะห์...</span>
                  </div>
                </div>
              ) : null}
              {!isLoading && dashboardRows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedCategoryRow(item)}
                  className="w-full text-left rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 active:scale-[0.98] hover:shadow-md space-y-3 block"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{getCategoryIcon(item.name)}</span>
                      <span className="font-bold text-slate-900 text-sm">{item.name}</span>
                    </div>
                    {item.anomaly === 'high' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 ring-1 ring-inset ring-rose-600/10">
                        สูงผิดปกติ
                      </span>
                    ) : item.anomaly === 'low' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/10">
                        ต่ำผิดปกติ
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                        ปกติ
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-1.5 pt-2 border-t border-slate-50 text-xs text-slate-600">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">เดือนล่าสุด ({formatMonthLabelShort(dashboard.monthList[dashboard.monthList.length - 1])})</span>
                      <span className="expense-dashboard-amount font-bold text-slate-800 tabular-nums">
                        {formatMoney(item.latest)} บาท
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">เฉลี่ยรายเดือน</span>
                      <span className="expense-dashboard-average-cell rounded px-1.5 py-0.5 font-semibold text-blue-700 tabular-nums">
                        {formatMoney(item.avg)} บาท
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">รวม {periodMonths} เดือน</span>
                      <span className="expense-dashboard-total-cell rounded px-1.5 py-0.5 font-semibold text-violet-700 tabular-nums">
                        {formatMoney(item.total)} บาท
                      </span>
                    </div>
                  </div>
                </button>
              ))}
              {!isLoading && dashboardRows.length === 0 ? (
                <div className="py-8 text-center text-slate-400 bg-white border border-slate-200/60 rounded-xl text-xs">
                  ยังไม่มีข้อมูลบันทึกค่าใช้จ่ายในช่วงเวลานี้
                </div>
              ) : null}
            </div>

            {/* 4. Mobile Category Detail Bottom Sheet */}
            {selectedCategoryRow ? (
              <MobileFilterSheet
                bodyClassName="expense-dashboard-heatmap p-5"
                footer={
                  <button
                    type="button"
                    className="col-span-2 h-10 rounded-md bg-slate-800 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
                    onClick={() => setSelectedCategoryRow(null)}
                  >
                    ปิดหน้าต่าง
                  </button>
                }
                onClose={() => setSelectedCategoryRow(null)}
                title={selectedCategoryRow.name}
              >
                  <div className="space-y-4">
                    {/* Summary section */}
                    <div className="space-y-3 bg-slate-50/70 rounded-xl p-4 border border-slate-100">
                      <div>
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">เดือนล่าสุด ({formatMonthLabelShort(dashboard.monthList[dashboard.monthList.length - 1])})</div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="expense-dashboard-amount text-2xl font-extrabold text-slate-900 tabular-nums">
                            {formatMoney(selectedCategoryRow.latest)}
                          </span>
                          <span className="text-sm font-semibold text-slate-500">บาท</span>
                          {selectedCategoryRow.anomaly === 'high' ? (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700 ring-1 ring-inset ring-rose-600/10">
                              สูงผิดปกติ
                            </span>
                          ) : selectedCategoryRow.anomaly === 'low' ? (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-inset ring-amber-600/10">
                              ต่ำผิดปกติ
                            </span>
                          ) : (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                              ปกติ
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200/60">
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">เฉลี่ยรายเดือน</div>
                          <div className="expense-dashboard-average-cell mt-0.5 inline-block rounded px-2 py-1 text-base font-extrabold text-blue-700 tabular-nums">
                            {formatMoney(selectedCategoryRow.avg)} <span className="text-xs font-normal text-slate-400">บาท</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ยอดรวม {periodMonths} เดือน</div>
                          <div className="expense-dashboard-total-cell mt-0.5 inline-block rounded px-2 py-1 text-base font-extrabold text-violet-700 tabular-nums">
                            {formatMoney(selectedCategoryRow.total)} <span className="text-xs font-normal text-slate-400">บาท</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sparkline / Bar Chart */}
                    <div className="space-y-2">
                      <span className="block text-xs font-semibold text-slate-600">แนวโน้มรายเดือน (บาท)</span>
                      <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                        {/* Bar chart container */}
                        <div className="flex items-end justify-between h-24 px-1">
                          {(() => {
                            const values = dashboard.monthList.map(m => selectedCategoryRow.byMonth[m] ?? 0);
                            const maxValue = Math.max(...values, 100);
                            return dashboard.monthList.map((month) => {
                              const val = selectedCategoryRow.byMonth[month] ?? 0;
                              const heightPct = (val / maxValue) * 100;
                              const isMonthAnomaly = selectedCategoryRow.avg > 0 && val > selectedCategoryRow.avg * 1.5;
                              const barColor = val === 0 ? 'bg-slate-200' : isMonthAnomaly ? 'bg-rose-500' : 'bg-emerald-500';
                              
                              return (
                                <div key={month} className="flex flex-col items-center flex-1 group relative">
                                  {/* Tooltip on hover */}
                                  <div className="absolute bottom-full mb-1 hidden group-hover:block bg-slate-800 text-white text-xs rounded px-1 py-0.5 whitespace-nowrap z-10 tabular-nums">
                                    {formatMoney(val)}
                                  </div>
                                  {/* The bar */}
                                  <div 
                                    className={`w-3.5 rounded-t-sm transition-all duration-300 ${barColor}`} 
                                    style={{ height: `${Math.max(heightPct, 2)}%` }} 
                                  />
                                  {/* Label */}
                                  <span className="text-xs text-slate-400 mt-1 scale-90">
                                    {formatMonthLabelShort(month)}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Anomaly Analysis Info */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 space-y-1.5">
                      <span className="block text-xs font-semibold text-slate-600">การวิเคราะห์ความผิดปกติ</span>
                      <div className="flex items-start gap-2">
                        <span className="text-sm">
                          {selectedCategoryRow.anomaly === 'high' ? '⚠️' : selectedCategoryRow.anomaly === 'low' ? 'ℹ️' : '✅'}
                        </span>
                        <p className="text-xs text-slate-600 leading-normal">
                          {selectedCategoryRow.anomaly === 'high' ? (
                            <>
                              ค่าใช้จ่ายในหมวด <b>{selectedCategoryRow.name}</b> ในเดือนล่าสุดมีปริมาณ
                              <span className="text-red-600 font-bold"> สูงกว่าปกติ (+{selectedCategoryRow.deviation.toFixed(0)}%)</span> เมื่อเทียบกับค่าเฉลี่ยย้อนหลัง
                              ควรตรวจสอบความจำเป็นหรือเอกสารที่บันทึก
                            </>
                          ) : selectedCategoryRow.anomaly === 'low' ? (
                            <>
                              ค่าใช้จ่ายในหมวด <b>{selectedCategoryRow.name}</b> ในเดือนล่าสุดมีปริมาณ
                              <span className="text-amber-600 font-bold"> ต่ำกว่าปกติ (-{Math.abs(selectedCategoryRow.deviation).toFixed(0)}%)</span> เมื่อเทียบกับค่าเฉลี่ยย้อนหลัง
                              อาจเกิดจากความล่าช้าในการส่งบิลหรือลงบัญชี
                            </>
                          ) : (
                            <>
                              ค่าใช้จ่ายในหมวด <b>{selectedCategoryRow.name}</b> มีความสม่ำเสมอเป็นปกติและสอดคล้องกับค่าเฉลี่ยย้อนหลัง
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
              </MobileFilterSheet>
            ) : null}

            {/* 5. Mobile Filter Bottom Sheet */}
            {showDashboardMobileFilters ? (
              <MobileFilterSheet
                bodyClassName="p-5"
                footer={
                  <>
                    <button
                      type="button"
                      className="h-10 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                      onClick={() => {
                        setCategoryId('');
                        setPeriodMonths(6);
                        setShowDashboardMobileFilters(false);
                      }}
                    >
                      ล้างตัวกรอง
                    </button>
                    <button
                      type="button"
                      className="h-10 rounded-md bg-slate-800 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
                      onClick={() => setShowDashboardMobileFilters(false)}
                    >
                      ค้นหา
                    </button>
                  </>
                }
                onClose={() => setShowDashboardMobileFilters(false)}
                title="ตัวกรองข้อมูลวิเคราะห์"
              >
                    <div>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">หมวดค่าใช้จ่าย</span>
                      <select
                        className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none"
                        value={categoryId}
                        onChange={(e) => setCategoryId(e.target.value)}
                      >
                        <option value="">📁 ทุกหมวดค่าใช้จ่าย</option>
                        {categories.filter((cat) => cat.active !== false).map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="mb-1.5 block text-xs font-semibold text-slate-600">ช่วงเวลาดูย้อนหลัง</span>
                      <div className="grid grid-cols-3 gap-2">
                        {[3, 6, 12].map((months) => {
                          const active = periodMonths === months;
                          return (
                            <button
                              key={months}
                              type="button"
                              onClick={() => setPeriodMonths(months)}
                              className={`h-10 rounded-md border text-xs font-medium transition-all ${
                                active
                                  ? 'border-slate-700 bg-slate-700 text-white'
                                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              {months} เดือน
                            </button>
                          );
                        })}
                      </div>
                    </div>
              </MobileFilterSheet>
            ) : null}
          </div>

        {/* 📋 Footer Notes */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-xs leading-relaxed text-slate-500">
            <div className="font-semibold text-slate-700 flex items-center gap-1 mb-1">
              <span>📋</span> วิธีประเมินความผิดปกติ (Anomaly Thresholds):
            </div>
            <ul className="list-disc list-inside space-y-1 ml-1">
              <li><b>สูงผิดปกติ</b>: ยอดใช้จ่ายเดือนล่าสุด <b>มากกว่า 1.5 เท่า (1.5x)</b> ของค่าเฉลี่ยรายเดือน และมียอดรวมในเดือนนั้นเกิน 5,000 บาท</li>
              <li><b>ต่ำผิดปกติ</b>: ยอดใช้จ่ายเดือนล่าสุด <b>น้อยกว่า 30% (0.3x)</b> ของค่าเฉลี่ยรายเดือน (ซึ่งอาจระบุถึงการหลงลืมหรือบันทึกช้า)</li>
            </ul>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 text-sm">
            <SharedKpiCard icon="📅" label="ค่าใช้จ่ายเดือนนี้" note={`${summary.monthlyCount} รายการ`} tone="slate" value={formatMoney(summary.monthlyTotal)} />
            <SharedKpiCard icon="⏱️" label="รอจ่าย" note="ตามสถานะเอกสาร" tone="amber" value={formatMoney(summary.pendingTotal)} />
            <SharedKpiCard icon="✅" label="เสร็จสิ้น" note="รวมทั้งระบบ" tone="emerald" value={formatMoney(summary.paidTotal)} />
            <SharedKpiCard icon="📋" label="ตามเงื่อนไขที่กรอง" note={`${filteredSummary.count} รายการ`} tone="blue" value={formatMoney(filteredSummary.netAmount)} />
          </div>

          <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <input autoComplete="off" className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="ค้นหาเลข Voucher / ผู้รับ / อ้างอิง..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />

              {/* Mobile Filter Button */}
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:hidden"
                onClick={() => setShowMobileFilters(true)}
              >
                ตัวกรอง{activeMobileFilterCount ? ` (${activeMobileFilterCount})` : ''}
              </button>

              <div className="hidden lg:flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-500">วันที่:</label>
                <DatePickerInput className="h-9 w-[130px]" title="จากวันที่" value={dateFrom} onChange={setDateFrom} />
                <span className="text-slate-400">→</span>
                <DatePickerInput className="h-9 w-[130px]" title="ถึงวันที่" value={dateTo} onChange={setDateTo} />
                <select className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm bg-white" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="">ทุกหมวด</option>
                  {categories.filter((category) => category.active !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <select className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm bg-white" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                  <option value="">ทุกบัญชี</option>
                  {accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </div>

              {search || dateFrom || dateTo || categoryId || accountId || statusFilter.length > 0 ? (
                <Button className="h-9" size="sm" type="button" variant="outline" onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setCategoryId(''); setAccountId(''); setStatusFilter([]) }}>ล้างตัวกรอง</Button>
              ) : null}
            </div>

            {/* Desktop Status Filters */}
            <div className="mt-1 flex-wrap items-center gap-2 border-t border-slate-100 pt-3 hidden lg:flex">
              <span className="text-xs text-slate-500">สถานะ:</span>
              {expenseStatusOptions.map((option) => (
                <SegmentMulti key={option.label} current={statusFilter} label={option.label} onClick={setStatusFilter} values={option.values} />
              ))}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button className="h-9" size="sm" type="button" onClick={openCreateForm}>+ เพิ่มค่าใช้จ่าย</Button>
                <a className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700" href={exportHref}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  ส่งออก Excel
                </a>
              </div>
            </div>
          </div>

          {/* Floating Action Button (FAB) for Mobile */}
          <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden">
            <button
              className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-600 text-white shadow-lg active:scale-95 transition-transform"
              onClick={openCreateForm}
              type="button"
              aria-label="เพิ่มค่าใช้จ่าย"
            >
              <Plus className="h-6 w-6" />
            </button>
          </div>

          {/* Bottom Sheet Filter for Mobile */}
          {showMobileFilters ? (
            <MobileFilterSheet
              footer={
                <>
                  <button
                    type="button"
                    className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => {
                      setSearch('')
                      setDateFrom('')
                      setDateTo('')
                      setCategoryId('')
                      setAccountId('')
                      setStatusFilter([])
                      setShowMobileFilters(false)
                    }}
                  >
                    ล้างตัวกรอง
                  </button>
                  <button
                    type="button"
                    className="h-11 rounded-md bg-slate-800 text-sm font-semibold text-white hover:bg-slate-700"
                    onClick={() => setShowMobileFilters(false)}
                  >
                    ใช้ตัวกรอง
                  </button>
                </>
              }
              onClose={() => setShowMobileFilters(false)}
              title="ตัวกรองเพิ่มเติม"
            >
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
                    <div className="flex items-center gap-2">
                      <DatePickerInput className="flex-1" value={dateFrom} onChange={setDateFrom} />
                      <span className="text-slate-400">→</span>
                      <DatePickerInput className="flex-1" value={dateTo} onChange={setDateTo} />
                    </div>
                  </div>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">หมวดหมู่</span>
                    <select className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm bg-white" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                      <option value="">ทุกหมวด</option>
                      {categories.filter((category) => category.active !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">บัญชี</span>
                    <select className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm bg-white" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                      <option value="">ทุกบัญชี</option>
                      {accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  </label>

                  <div>
                    <span className="mb-2 block text-xs font-semibold text-slate-600">สถานะ</span>
                    <div className="grid grid-cols-2 gap-2">
                      {expenseStatusOptions.map((option) => {
                        const active = option.values.length === 0
                          ? statusFilter.length === 0
                          : option.values.every((value) => statusFilter.includes(value))
                        return (
                          <button
                            key={option.label}
                            type="button"
                            className={`rounded-md border px-3 py-1.5 text-xs font-medium h-11 ${
                              active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                            }`}
                            onClick={() => {
                              if (option.values.length === 0) {
                                setStatusFilter([])
                              } else {
                                setStatusFilter(active ? statusFilter.filter((item) => !option.values.includes(item)) : Array.from(new Set([...statusFilter, ...option.values])))
                              }
                            }}
                          >
                            {option.label}
                          </button>
                      )
                    })}
                  </div>
                </div>
            </MobileFilterSheet>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <div>พบทั้งหมด {filteredSummary.count} รายการ</div>
            <div className="flex flex-wrap items-center gap-2">
              {columnResize.hasCustomWidths ? <Button className="h-9" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
              <select className="h-9 w-auto rounded-md border border-slate-300 px-2 py-1" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
              </select>
              <Button className="h-9" disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
              <span className="px-1">หน้า {currentPage} / {totalPages}</span>
              <Button className="h-9" disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
            </div>
          </div>

          {formOpen ? (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
              <form ref={formRef} noValidate className="w-full max-w-6xl overflow-hidden rounded-md bg-slate-900 shadow-xl" onSubmit={saveForm}>
                <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 px-5 py-4 text-white rounded-t-md shrink-0">
                  <h3 className="font-bold text-white text-base">{form.id ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย'}</h3>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
                    <Button className="h-9 rounded-md bg-emerald-600 px-5 font-medium text-white transition-colors hover:bg-emerald-700 outline-none focus:ring-0" disabled={isSaving} type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
                  </div>
                </div>
                <div className="space-y-4 bg-slate-50 p-4">
                  <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                    <div className="mb-3 text-sm font-semibold text-slate-900">วิธีดำเนินการ</div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { description: 'สร้าง EXP แล้วส่งเข้าอนุมัติจ่ายเงิน', label: 'ส่งอนุมัติ', value: 'submit_approval' as const },
                        { description: 'สร้าง EXP และ PMT ทันที โดยไม่สร้าง PMA', label: 'จ่ายเลย', value: 'pay_now' as const },
                      ].map((option) => {
                        const active = form.paymentAction === option.value
                        return (
                          <button
                            key={option.value}
                            className={`rounded-xl border px-3 py-2 text-left text-sm ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                            type="button"
                            onClick={() => setForm((current) => ({ ...current, paymentAction: option.value, status: option.value === 'pay_now' ? 'paid' : 'pending_approval' }))}
                          >
                            <span className="block font-semibold">{option.label}</span>
                            <span className={`block text-xs ${active ? 'text-slate-200' : 'text-slate-500'}`}>{option.description}</span>
                          </button>
                        )
                      })}
                    </div>
                    {form.paymentAction === 'pay_now' ? (
                      <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                        ระบบจะสร้าง EXP และ PMT ทันทีโดยไม่สร้าง PMA
                      </div>
                    ) : (
                      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        ระบบจะสร้าง EXP เป็น `ยังไม่อนุมัติ` แล้วส่งไปหน้าอนุมัติจ่ายเงินก่อนออก PMT
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                    <div className="mb-3 text-sm font-semibold text-slate-900">ข้อมูลหลัก</div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="col-span-2 md:col-span-2">
                        <PayeeField
                          error={fieldErrors.supplierId ?? fieldErrors.payee}
                          options={payeeOptions}
                          value={form.payee}
                          onChange={(value) => {
                            const supplier = findSupplierPayeeOption(payeeOptions, value)
                            setForm({
                              ...form,
                              payee: value,
                              supplierId: supplier?.code ?? '',
                              supplierPaymentDestinationId: supplier?.bankAccounts?.find((account) => account.isPrimary)?.code ?? supplier?.bankAccounts?.[0]?.code ?? null,
                            })
                          }}
                        />
                      </div>
                      {form.paymentAction === 'pay_now' ? (
                        <label className="block col-span-2 md:col-span-2" data-field="supplierPaymentDestinationId">
                          <span className="mb-1 block text-xs font-medium text-slate-600">ช่องทางรับเงินของ Supplier{renderRequiredMark(true)}</span>
                          <select
                            aria-invalid={Boolean(fieldErrors.supplierPaymentDestinationId)}
                            className={`h-9 w-full rounded-md border px-3 text-sm outline-none ${fieldErrors.supplierPaymentDestinationId ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-slate-900'}`}
                            value={form.supplierPaymentDestinationId ?? ''}
                            onChange={(event) => setForm({ ...form, supplierPaymentDestinationId: event.target.value || null })}
                          >
                            <option value="">{form.supplierId ? 'เลือกช่องทางรับเงิน' : 'เลือก Supplier ก่อน'}</option>
                            {supplierPaymentDestinations.map((account) => <option key={account.code} value={account.code}>{supplierPaymentDestinationLabel(account)}</option>)}
                          </select>
                          {fieldErrors.supplierPaymentDestinationId ? <span className="mt-1 block text-xs text-red-700">{fieldErrors.supplierPaymentDestinationId}</span> : null}
                        </label>
                      ) : null}
                      <TextField error={fieldErrors.date} fieldName="date" label="วันที่จ่าย" required type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
                      <TextField error={fieldErrors.dueDate} fieldName="dueDate" label="ครบกำหนด" type="date" value={form.dueDate ?? ''} onChange={(value) => setForm({ ...form, dueDate: value })} />
                      {form.id ? (
                        <div data-field="status">
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            สถานะเอกสาร
                          </label>
                          <div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                            {expenseStatusLabel(form.status)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">สถานะจะเปลี่ยนผ่าน flow อนุมัติจ่ายเงินเท่านั้น</div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                    <ExpenseLineTable
                      categoryOptions={filteredFormCategoryOptions}
                      errors={fieldErrors}
                      lines={formTotals.lines}
                      netAmount={formTotals.netAmount}
                      totalAmount={formTotals.amount}
                      totalVatAmount={formTotals.vatAmount}
                      totalWhtAmount={formTotals.whtAmount}
                      vatRatePercent={vatRatePercent}
                      whtRatePercent={whtRatePercent}
                      onAddLine={addExpenseLine}
                      onLineChange={updateExpenseLine}
                      onRemoveLine={removeExpenseLine}
                    />
                  </div>

                  {form.paymentAction === 'pay_now' ? (
                    <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                      <div className="mb-3 text-sm font-semibold text-slate-900">วิธีการจ่าย</div>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <label className="block col-span-2 sm:col-span-1" data-field="paymentMethod">
                          <span className="mb-1 block text-xs font-medium text-slate-600">วิธีจ่าย{renderRequiredMark(true)}</span>
                          <select
                            className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none"
                            value={paymentMethod}
                            onChange={(event) => updatePaymentMethod(event.target.value)}
                          >
                            {paymentMethods.length === 0 ? <option value="">ไม่มีวิธีจ่ายที่เปิดใช้งาน</option> : null}
                            {paymentMethods.map((method) => <option key={method.id} value={method.name}>{method.name}</option>)}
                          </select>
                        </label>
                        <label className="block col-span-2 md:col-span-2" data-field="accountId">
                          <span className="mb-1 block text-xs font-medium text-slate-600">บัญชีที่จ่ายของบริษัท{renderRequiredMark(true)}</span>
                          <select
                            aria-invalid={Boolean(fieldErrors.accountId)}
                            className={`h-9 w-full rounded-md border px-3 text-sm outline-none ${fieldErrors.accountId ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-slate-900'}`}
                            value={form.accountId ?? ''}
                            onChange={(event) => setForm({ ...form, accountId: event.target.value || null })}
                          >
                            <option value="">{paymentMethod ? 'เลือกบัญชีที่จ่าย' : 'เลือกวิธีจ่ายก่อน'}</option>
                            {paymentAccountOptions.map((account) => <option key={account.id} value={account.id}>{account.name} ({formatMoney(account.balance)})</option>)}
                          </select>
                          {fieldErrors.accountId ? <span className="mt-1 block text-xs text-red-700">{fieldErrors.accountId}</span> : null}
                        </label>
                        <label className="block" data-field="discount">
                          <span className="mb-1 block text-xs font-medium text-slate-600">Discount</span>
                          <MoneyInputControl className="h-9 text-sm" error={fieldErrors.discount} value={Number(form.discount) || 0} onChange={(value) => setForm({ ...form, discount: value })} />
                          {fieldErrors.discount ? <span className="mt-1 block text-xs text-red-700">{fieldErrors.discount}</span> : null}
                        </label>
                        {selectedPaymentMethodGroup === 'cash' ? null : (
                          <label className="block" data-field="bankFee">
                            <span className="mb-1 block text-xs font-medium text-slate-600">Bank fee</span>
                            <MoneyInputControl className="h-9 text-sm" error={fieldErrors.bankFee} value={Number(form.bankFee) || 0} onChange={(value) => setForm({ ...form, bankFee: value })} />
                            {fieldErrors.bankFee ? <span className="mt-1 block text-xs text-red-700">{fieldErrors.bankFee}</span> : null}
                          </label>
                        )}
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 col-span-2">
                          <div>ยอด EXP: <b>{formatMoney(formTotals.netAmount)}</b></div>
                          <div>ยอดจ่าย Supplier หลัง Discount: <b>{formatMoney(formPaymentAmount)}</b></div>
                          <div>เงินออกจากบัญชีรวม Bank fee: <b className="text-red-700">{formatMoney(formCashOutAmount)}</b></div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
                    <div className="mb-3 text-sm font-semibold text-slate-900">เอกสารอ้างอิงและหมายเหตุ</div>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="col-span-2 sm:col-span-1">
                        <TextField error={fieldErrors.refDocNo} fieldName="refDocNo" label="เลขอ้างอิง" value={form.refDocNo ?? ''} onChange={(value) => setForm({ ...form, refDocNo: value })} />
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <TextField error={fieldErrors.taxInvoiceNo} fieldName="taxInvoiceNo" label="เลขใบกำกับภาษี" value={form.taxInvoiceNo ?? ''} onChange={(value) => setForm({ ...form, taxInvoiceNo: value })} />
                      </div>
                      <div className="col-span-2 lg:col-span-3">
                        <TextAreaField error={fieldErrors.notes} fieldName="notes" label="หมายเหตุ" rows={3} value={form.notes ?? ''} onChange={(value) => setForm({ ...form, notes: value })} />
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-md border border-slate-100 bg-white shadow">
                    <div className="border-b border-slate-100 bg-slate-900 px-4 py-3 text-white">
                      <div className="text-sm font-semibold">สรุปก่อนบันทึก</div>
                      <div className="text-xs text-slate-300">{form.paymentAction === 'pay_now' ? 'ตรวจยอดเอกสารและยอดเงินออกจากบัญชี' : 'ตรวจยอด EXP ก่อนส่งอนุมัติจ่ายเงิน'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 p-4">
                      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 col-span-2 lg:col-span-1">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-800">ยอดเอกสาร EXP</div>
                            <div className="text-xs text-slate-500">คำนวณจากรายการค่าใช้จ่าย VAT และ WHT</div>
                          </div>
                          <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600">{formTotals.lines.length} รายการ</div>
                        </div>
                        <div className="space-y-2 text-sm">
                          <SummaryRow label="ยอดก่อน VAT" value={formatMoney(formTotals.amount)} />
                          <SummaryRow label="+ VAT" value={formatMoney(formTotals.vatAmount)} />
                          <SummaryRow label="- WHT" value={formatMoney(formTotals.whtAmount)} />
                          <div className="border-t border-slate-200 pt-2">
                            <SummaryRow strong label="ยอดสุทธิ EXP" value={formatMoney(formTotals.netAmount)} />
                          </div>
                        </div>
                      </div>

                      <div className={`rounded-md border p-4 col-span-2 lg:col-span-1 ${form.paymentAction === 'pay_now' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                        {form.paymentAction === 'pay_now' ? (
                          <>
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-red-900">ยอดจ่ายจริง</div>
                                <div className="text-xs text-red-700">วิธีจ่าย: {paymentMethod || '-'}</div>
                              </div>
                              <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-red-700">{selectedPaymentMethodGroup === 'cash' ? 'ไม่มี Bank fee' : 'รวม Bank fee'}</div>
                            </div>
                            <div className="space-y-2 text-sm">
                              <SummaryRow label="ยอดสุทธิ EXP" tone="red" value={formatMoney(formTotals.netAmount)} />
                              <SummaryRow label="- Discount" tone="red" value={formatMoney(Number(form.discount) || 0)} />
                              {selectedPaymentMethodGroup === 'cash' ? null : <SummaryRow label="+ Bank fee" tone="red" value={formatMoney(Number(form.bankFee) || 0)} />}
                              <div className="border-t border-red-200 pt-3">
                                <div className="text-xs font-medium text-red-700">เงินออกจากบัญชี</div>
                                <div className="mt-1 text-right text-2xl font-bold tabular-nums text-red-700">{formatMoney(formCashOutAmount)}</div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full min-h-[170px] flex-col justify-center text-center">
                            <div className="text-sm font-semibold text-amber-900">ส่งอนุมัติจ่ายเงิน</div>
                            <div className="mt-2 text-xs leading-5 text-amber-800">
                              รอบนี้จะสร้าง EXP เป็นสถานะ `ยังไม่อนุมัติ` และยังไม่เกิดเงินออกจากบัญชีจนกว่าจะอนุมัติ PMA และออก PMT
                            </div>
                            <div className="mt-4 rounded-md bg-white px-3 py-2 text-sm font-semibold text-amber-900">
                              ยอดที่จะส่งอนุมัติ: {formatMoney(formTotals.netAmount)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {form.id ? (
                      <div className="mx-4 mb-4 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                        สถานะปัจจุบัน: <span className={`font-semibold ${expenseStatusTextClass(form.status)}`}>{expenseStatusLabel(form.status)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </form>
            </div>
          ) : null}

          {detailRow ? (
            <ExpenseDetailModal
              row={detailRow}
              onClose={() => setDetailRow(null)}
              onEdit={(row) => {
                setDetailRow(null)
                openEditForm(row)
              }}
            />
          ) : null}

          {/* Mobile Card List */}
          <div className="block lg:hidden space-y-3">
            {isLoading ? (
              <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow border border-slate-200">กำลังโหลดข้อมูล</div>
            ) : null}
            {!isLoading && pagedRows.map((row) => {
              const overdue = row.status !== 'paid' && row.status !== 'cancelled' && row.dueDate ? row.dueDate < todayDateInput() : false
              return (
                <div
                  key={row.id}
                  className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors ${expenseRowTone(row.status)}`}
                  onClick={() => setDetailRow(row)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
                    <span className={`inline-flex items-center gap-1.5 font-semibold text-xs ${expenseStatusTextClass(row.status)}`}>
                      <span className={`size-1.5 rounded-full ${expenseStatusDotClass(row.status)}`} />
                      {expenseStatusLabel(row.status)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-500 mb-3">
                    <span className="font-semibold text-slate-700">{row.categoryName}</span>
                    <span>วันที่จ่าย: {formatDateDisplay(row.date)}</span>
                  </div>
                  {row.dueDate ? (
                    <div className="text-xs mb-2">
                      <span className="text-slate-500">ครบกำหนด: </span>
                      <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-700 font-semibold'}>
                        {formatDateDisplay(row.dueDate)}
                        {overdue ? ' (เลยกำหนด)' : ''}
                      </span>
                    </div>
                  ) : null}
                  <div className="text-sm font-semibold text-slate-700 mb-3">
                    ผู้รับ: {row.payee}
                  </div>
                  <div className="flex justify-between items-end border-t border-slate-100 pt-2.5">
                    <div className="text-xs text-slate-500">
                      <span>ยอดก่อน VAT: {formatMoney(row.amount)}</span>
                      {row.vat > 0 ? <span className="block text-emerald-700">+VAT: {formatMoney(row.vat)}</span> : null}
                      {row.wht > 0 ? <span className="block text-amber-700">-WHT: {formatMoney(row.wht)}</span> : null}
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">ยอดจ่ายจริง</span>
                      <span className={`font-bold text-sm tabular-nums ${row.status === 'paid' ? 'text-emerald-700' : row.status === 'approved' ? 'text-blue-700' : row.status === 'cancelled' ? 'text-slate-500' : 'text-amber-700'}`}>
                        {formatMoney(row.netAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
            {!isLoading && pagedRows.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow border border-slate-200">ยังไม่มีรายการ</div>
            ) : null}
          </div>

          <div className="hidden lg:block overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {expenseColumns.map((column, index) => {
                  const style = columnResize.getColumnStyle(column.key);
                  if (index === expenseColumns.length - 1) {
                    return <col key={column.key} style={{ minWidth: column.minWidth }} />;
                  }
                  return <col key={column.key} style={style} />;
                })}
              </colgroup>
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-medium">
                <tr>
                  <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เลขที่ EXP" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่ EXP')} sortKey="docNo" onSort={changeSort} />
                  <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="วันที่จ่าย" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่จ่าย')} sortKey="date" onSort={changeSort} />
                  <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ครบกำหนด" resizeProps={columnResize.getResizeHandleProps('dueDate', 'ครบกำหนด')} sortKey="dueDate" onSort={changeSort} />
                  <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เลขอ้างอิง" resizeProps={columnResize.getResizeHandleProps('refDocNo', 'เลขอ้างอิง')} sortKey="refDocNo" onSort={changeSort} />
                  <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ผู้รับเงิน" resizeProps={columnResize.getResizeHandleProps('payee', 'ผู้รับเงิน')} sortKey="payee" onSort={changeSort} />
                  <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="หมวดค่าใช้จ่าย" resizeProps={columnResize.getResizeHandleProps('category', 'หมวดค่าใช้จ่าย')} sortKey="category" onSort={changeSort} />
                  <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="บัญชีจ่าย" resizeProps={columnResize.getResizeHandleProps('account', 'บัญชีจ่าย')} sortKey="account" onSort={changeSort} />
                  <ResizableTableHead activeSortKey={sortKey} align="center" direction={sortDirection} label="สถานะเอกสาร" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะเอกสาร')} sortKey="status" onSort={changeSort} />
                  <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ยอดจ่ายจริง" resizeProps={columnResize.getResizeHandleProps('netAmount', 'ยอดจ่ายจริง')} sortKey="netAmount" onSort={changeSort} />
                  <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ยอด/VAT/WHT" resizeProps={columnResize.getResizeHandleProps('amountSummary', 'ยอด/VAT/WHT')} sortKey="amountSummary" onSort={changeSort} />
                  <ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={expenseColumns.length}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && pagedRows.map((row) => {
                  const overdue = row.status !== 'paid' && row.status !== 'cancelled' && row.dueDate ? row.dueDate < todayDateInput() : false
                  return (
                    <tr
                      key={row.id}
                      className={`cursor-pointer hover:bg-slate-50 ${expenseRowTone(row.status)}`}
                      tabIndex={0}
                      onClick={() => setDetailRow(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setDetailRow(row)
                        }
                      }}
                    >
                      <td className="p-2 text-xs font-semibold text-slate-700">{row.docNo}</td>
                      <td className="p-2 text-xs font-semibold text-slate-700">{formatDateDisplay(row.date)}</td>
                      <td className="p-2 text-xs font-semibold">{row.dueDate ? <span className={overdue ? 'text-red-600' : 'text-slate-700'}>{formatDateDisplay(row.dueDate)}{overdue ? <span className="block text-xs font-normal text-red-500">เลยกำหนด</span> : null}</span> : <span className="text-slate-300">-</span>}</td>
                      <td className="p-2 text-xs font-semibold text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.refDocNo || ''}>{row.refDocNo || '-'}</div></td>
                      <td className="p-2 text-xs font-semibold text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.payee || ''}>{row.payee}</div></td>
                      <td className="p-2 text-xs font-semibold text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.categoryName || ''}>{row.categoryName}</div></td>
                      <td className="p-2 text-xs font-semibold text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.accountName || ''}>{row.accountName}</div></td>
                      <td className="p-2 text-center text-xs"><span className={`inline-flex items-center gap-1.5 font-semibold ${expenseStatusTextClass(row.status)}`}><span className={`size-1.5 rounded-full ${expenseStatusDotClass(row.status)}`} />{expenseStatusLabel(row.status)}</span></td>
                      <td className={`bg-red-50/60 p-2 pl-4 pr-4 text-right text-xs font-semibold tabular-nums whitespace-nowrap ${row.status === 'paid' ? 'text-emerald-700' : row.status === 'approved' ? 'text-blue-700' : row.status === 'cancelled' ? 'text-slate-500' : 'text-amber-700'}`}>{formatMoney(row.netAmount)}</td>
                      <td className="whitespace-nowrap p-2 pr-4 text-right text-xs font-semibold text-slate-700 tabular-nums">
                        <div>ยอด: <b>{formatMoney(row.amount)}</b></div>
                        {row.vat > 0 ? <div className="text-emerald-700">+VAT: {formatMoney(row.vat)}</div> : null}
                        {row.wht > 0 ? <div className="text-amber-700">-WHT: {formatMoney(row.wht)}</div> : null}
                      </td>
                      <td className="p-2 text-center">
                        {canMutateExpense(row.status) ? (
                          <div className="flex items-center justify-center gap-2">
                            <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={(event) => { event.stopPropagation(); openEditForm(row) }}>แก้ไข</button>
                            <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50" type="button" onClick={(event) => { event.stopPropagation(); void cancelExpense(row) }}>ยกเลิก</button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
                {!isLoading && filteredRows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={expenseColumns.length}>ยังไม่มีรายการ</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function ExpenseDetailModal({ onClose, onEdit, row }: { onClose: () => void; onEdit: (row: ExpenseRow) => void; row: ExpenseRow }) {
  const lines = normalizeExpenseLines(row.lines, row)
  const canEdit = canMutateExpense(row.status)
  const [isPrinting, setIsPrinting] = useState(false)

  const handlePrint = async () => {
    setIsPrinting(true)
    try {
      await openExpenseReceiptPrint({ ...row, lines })
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'เปิดใบสำคัญจ่ายไม่สำเร็จ')
    } finally {
      setIsPrinting(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent hideClose className="max-h-[90vh] max-w-4xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none">
        <DialogHeader className="px-5 py-4 bg-slate-900 text-white shrink-0 rounded-t-md">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle id="expense-detail-title" className="truncate text-lg font-bold text-white">รายละเอียด {row.docNo}</DialogTitle>
              <span className="inline-flex items-center gap-1.5 rounded bg-white/10 px-2 py-0.5 text-xs font-semibold text-white">
                <span className={`size-1.5 rounded-full ${expenseStatusDotClass(row.status)}`} />
                {expenseStatusLabel(row.status)}
              </span>
            </div>
            <DialogDescription className="mt-1 truncate text-xs text-slate-300">{row.payee || 'ไม่ระบุผู้รับเงิน'}</DialogDescription>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button className="h-9 gap-2 border-emerald-600 bg-emerald-600 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white" disabled={isPrinting} type="button" variant="outline" onClick={handlePrint}>
              <Printer className="size-4" />
              {isPrinting ? 'กำลังเตรียม...' : 'พิมพ์'}
            </Button>
            {canEdit ? <Button className="h-9 border-slate-700 bg-slate-800 font-normal text-white hover:bg-slate-700 hover:text-white" type="button" variant="outline" onClick={() => onEdit(row)}>แก้ไข</Button> : null}
            <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onClose}>ปิด</Button>
          </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-5 space-y-4 text-sm">
          {/* Summary Band */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 sm:grid-cols-4">
            <SummaryTile emphasize label="Net Pay" value={formatMoney(row.netAmount)} />
            <SummaryTile label="ยอดก่อน VAT" value={formatMoney(row.amount)} />
            <SummaryTile label="VAT" value={formatMoney(row.vat)} />
            <SummaryTile label="WHT" value={formatMoney(row.wht)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            {/* ข้อมูลเอกสาร */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">ข้อมูลเอกสาร</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <DetailLine label="เลขที่เอกสาร" value={row.docNo} mono />
                <DetailLine label="วันที่จ่าย" value={formatDateDisplay(row.date)} />
                <DetailLine label="ครบกำหนด" value={row.dueDate ? formatDateDisplay(row.dueDate) : '-'} />
                <DetailLine label="เลขอ้างอิง" value={row.refDocNo || '-'} mono />
                <DetailLine label="ผู้รับเงิน" value={row.payee || '-'} />
                <DetailLine label="หมวดหลัก" value={row.categoryName || '-'} />
                <DetailLine label="บัญชีจ่าย" value={row.accountName || '-'} />
                <DetailLine label="เลขใบกำกับภาษี" value={row.taxInvoiceNo || '-'} mono />
              </div>
            </div>

            {/* สรุปยอด */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">สรุปยอด</div>
              <div className="space-y-3 pt-1">
                <SummaryRow label="ยอดก่อน VAT" value={formatMoney(row.amount)} />
                <SummaryRow label="+ VAT" value={formatMoney(row.vat)} />
                <SummaryRow label="- WHT" value={formatMoney(row.wht)} />
                <div className="border-t border-slate-100 pt-3">
                  <SummaryRow strong label="ยอดสุทธิ" value={formatMoney(row.netAmount)} />
                </div>
              </div>
            </div>
          </div>

          {/* รายการค่าใช้จ่าย */}
          <div className="rounded-md border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">รายการค่าใช้จ่าย</div>
            <div className="overflow-x-auto">
              <table className="ns-table w-full min-w-[820px] text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                  <tr>
                    <th className="p-2.5 text-left font-semibold">หมวด</th>
                    <th className="p-2.5 text-left font-semibold">รายละเอียด</th>
                    <th className="p-2.5 text-right font-semibold">ยอดก่อน VAT</th>
                    <th className="p-2.5 text-right font-semibold">VAT</th>
                    <th className="p-2.5 text-right font-semibold">WHT</th>
                    <th className="p-2.5 text-right font-semibold">ยอดสุทธิ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {lines.map((line) => {
                    const lineNet = line.amount + line.vatAmount - line.whtAmount
                    return (
                      <tr key={line.id} className="hover:bg-slate-50/50">
                        <td className="p-2.5 align-top font-semibold text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={line.categoryName || row.categoryName || ''}>{line.categoryName || row.categoryName || '-'}</div></td>
                        <td className="p-2.5 align-top text-slate-600 min-w-0 overflow-hidden"><div className="line-clamp-2" title={line.description || ''}>{line.description || '-'}</div></td>
                        <td className="p-2.5 text-right font-semibold tabular-nums text-slate-700 whitespace-nowrap pl-4">{formatMoney(line.amount)}</td>
                        <td className="p-2.5 text-right font-semibold tabular-nums text-emerald-700 whitespace-nowrap pl-4">{line.vatAmount > 0 ? formatMoney(line.vatAmount) : '-'}</td>
                        <td className="p-2.5 text-right font-semibold tabular-nums text-amber-700 whitespace-nowrap pl-4">{line.whtAmount > 0 ? formatMoney(line.whtAmount) : '-'}</td>
                        <td className="p-2.5 text-right font-semibold tabular-nums text-red-700 whitespace-nowrap pl-4">{formatMoney(lineNet)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* รายละเอียดรวมและหมายเหตุ */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100">รายละเอียดเพิ่มเติมและหมายเหตุ</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">รายละเอียดรวม</div>
                <div className="whitespace-pre-wrap text-xs sm:text-sm text-slate-700 bg-slate-50 rounded-md border border-slate-100 p-3 min-h-[60px]">{row.description || '-'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">หมายเหตุ</div>
                <div className="whitespace-pre-wrap text-xs sm:text-sm text-slate-700 bg-slate-50 rounded-md border border-slate-100 p-3 min-h-[60px]">{row.notes || '-'}</div>
              </div>
            </div>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  )
}

function ExpenseRankingPanel({ color, emptyText, label, rows, total }: { color: 'blue' | 'purple'; emptyText: string; label: string; rows: Array<{ name: string; total: number }>; total?: number }) {
  const barClass = color === 'purple' ? 'bg-gradient-to-r from-purple-400 to-fuchsia-500' : 'bg-gradient-to-r from-blue-400 to-indigo-500'
  const textClass = color === 'purple' ? 'text-purple-700' : 'text-blue-700'
  const denominator = rows[0]?.total || 1

  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm font-bold text-slate-700">{label}</div>
      {rows.length === 0 ? <div className="text-xs text-slate-400">{emptyText}</div> : null}
      <div className="space-y-1.5">
        {rows.map((item, index) => (
          <div key={item.name} className="text-xs">
            <div className="mb-0.5 flex items-center gap-2">
              <span className="w-4 text-center font-bold text-slate-400">{index + 1}</span>
              <span className="flex-1 truncate">{item.name}</span>
              <span className={`font-bold ${textClass}`}>{formatMoney(item.total)}</span>
              {total ? <span className="w-12 text-right text-xs text-slate-400">{((item.total / total) * 100).toFixed(0)}%</span> : null}
            </div>
            <div className="h-2 overflow-hidden rounded-md-full bg-slate-100">
              <div className={`h-full ${barClass}`} style={{ width: `${Math.max(3, (item.total / denominator) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function getRecentMonths(count: number) {
  const current = new Date(`${todayDateInput().slice(0, 7)}-01T00:00:00`)
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(current)
    month.setMonth(current.getMonth() - (count - 1 - index))
    const yyyy = month.getFullYear()
    const mm = String(month.getMonth() + 1).padStart(2, '0')
    return `${yyyy}-${mm}`
  })
}

function formatMonthLabel(month: string) {
  return new Intl.DateTimeFormat('th-TH', { month: 'short', year: '2-digit' }).format(new Date(`${month}-01T00:00:00`))
}

function formatMonthLabelShort(month: string) {
  return new Intl.DateTimeFormat('th-TH', { month: 'short' }).format(new Date(`${month}-01T00:00:00`))
}

function getCategoryIcon(name: string): string {
  const normalized = String(name ?? '').toLowerCase();
  if (normalized.includes('ขนส่ง') || normalized.includes('รถ') || normalized.includes('ค่าส่ง')) return '🚚';
  if (normalized.includes('โฆษณา') || normalized.includes('การตลาด') || normalized.includes('ประชาสัมพันธ์')) return '📢';
  if (normalized.includes('จ้างทำของ') || normalized.includes('บริการ') || normalized.includes('ซ่อม')) return '🛠️';
  if (normalized.includes('น้ำมัน') || normalized.includes('เชื้อเพลิง')) return '⛽';
  if (normalized.includes('น้ำ') || normalized.includes('ไฟ') || normalized.includes('สาธารณูปโภค')) return '⚡';
  if (normalized.includes('โทรศัพท์') || normalized.includes('เน็ต') || normalized.includes('สื่อสาร')) return '📞';
  if (normalized.includes('เงินเดือน') || normalized.includes('จ้าง') || normalized.includes('สวัสดิการ')) return '💼';
  if (normalized.includes('อาหาร') || normalized.includes('รับรอง') || normalized.includes('เลี้ยง')) return '🍽️';
  if (normalized.includes('เครื่องพิมพ์') || normalized.includes('กระดาษ') || normalized.includes('สำนักงาน')) return '📝';
  if (normalized.includes('ภาษี') || normalized.includes('ธรรมเนียม')) return '🏦';
  return '📁';
}

function SummaryTile({ emphasize = false, label, value }: { emphasize?: boolean; label: string; value: string }) {
  const isZero = !value || value === '0' || value === '0.00' || parseFloat(value.replace(/[^0-9.-]/g, '')) === 0;
  
  let cardClass = 'bg-white border-slate-200 shadow-sm rounded-xl';
  let labelClass = 'text-slate-500';
  let valueClass = 'text-slate-900';

  if (isZero) {
    cardClass = 'bg-slate-50 border-slate-200/60 shadow-sm rounded-xl';
    labelClass = 'text-slate-400';
    valueClass = 'text-slate-400';
  } else if (emphasize) {
    cardClass = 'bg-red-50/50 border-red-200 shadow-sm rounded-xl';
    labelClass = 'text-red-700';
    valueClass = 'text-red-700';
  }

  return (
    <div className={`border p-3 sm:p-4 transition-all ${cardClass}`}>
      <div className={`text-xs font-bold uppercase tracking-wider ${labelClass}`}>{label}</div>
      <div className={`mt-1 text-right text-sm sm:text-base font-semibold tabular-nums ${valueClass}`}>
        {value}
      </div>
    </div>
  )
}

function SummaryRow({ label, strong = false, tone = 'slate', value }: { label: string; strong?: boolean; tone?: 'red' | 'slate'; value: string }) {
  const labelClass = tone === 'red' ? 'text-red-800 font-medium' : 'text-slate-500 font-medium'
  const valueClass = tone === 'red' ? 'text-red-700 font-semibold' : 'text-slate-800 font-semibold'

  return (
    <div className={`flex items-center justify-between gap-3 text-xs ${strong ? 'text-sm font-semibold' : ''}`}>
      <span className={labelClass}>{label}</span>
      <span className={`text-right tabular-nums ${strong ? 'text-base font-bold text-slate-900' : valueClass}`}>{value}</span>
    </div>
  )
}

function DetailLine({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div className="flex flex-col py-1">
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className={`mt-0.5 text-xs sm:text-sm font-semibold text-slate-800 ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-2 whitespace-pre-wrap text-xs sm:text-sm text-slate-700">{value}</div>
    </div>
  )
}

function SegmentMulti({
  current,
  label,
  onClick,
  values,
}: {
  current: ExpenseFormValues['status'][]
  label: string
  onClick: (next: ExpenseFormValues['status'][]) => void
  values: ExpenseFormValues['status'][]
}) {
  const active = values.length === 0
    ? current.length === 0
    : values.every((value) => current.includes(value))

  return (
    <button
      className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
      type="button"
      onClick={() => {
        if (values.length === 0) {
          onClick([])
          return
        }
        onClick(active ? current.filter((item) => !values.includes(item)) : Array.from(new Set([...current, ...values])))
      }}
    >
      {label}
    </button>
  )
}

function renderRequiredMark(required?: boolean) {
  return required ? <span className="ml-1 text-red-600">*</span> : null
}

function PayeeField(props: { error?: string; onChange: (value: string) => void; options: PayeeOption[]; value: string }) {
  return (
    <label className="block" data-field="supplierId">
      <span className="mb-1 block text-xs font-medium text-slate-600">ผู้รับเงิน{renderRequiredMark(true)}</span>
      <input
        aria-invalid={Boolean(props.error)}
        autoComplete="off"
        className={`h-9 w-full rounded-md border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-100 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-slate-900'}`}
        list="expense-payee-options"
        placeholder="ค้นหา Supplier"
        required
        type="search"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <datalist id="expense-payee-options">
        {props.options.map((option) => (
          <option key={`${option.source}-${option.code}-${option.name}`} label={`${option.sourceLabel} · ${option.code}`} value={option.name} />
        ))}
      </datalist>
      <span className="mt-1 block text-xs text-slate-500">เลือกผู้รับเงินจาก Supplier master</span>
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function TextField(props: { error?: string; fieldName?: string; label: string; onChange?: (value: string) => void; readOnly?: boolean; required?: boolean; type?: string; value: string }) {
  return (
    <label className="block" data-field={props.fieldName}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{props.label}{renderRequiredMark(props.required)}</span>
      {props.type === 'date'
        ? <DatePickerInput className={`h-9 w-full ${props.error ? 'border-red-400 bg-red-50' : ''}`} readOnly={props.readOnly} required={props.required} value={props.value} onChange={(value) => props.onChange?.(value)} />
        : <input aria-invalid={Boolean(props.error)} className={`h-9 w-full rounded-md border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-100 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300'} ${props.readOnly ? 'bg-slate-50 text-slate-500' : 'bg-white text-slate-900'}`} readOnly={props.readOnly} required={props.required} type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange?.(event.target.value)} />}
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function MoneyInputControl(props: { className?: string; error?: string; onChange: (value: number) => void; value: number }) {
  const [draftValue, setDraftValue] = useState<string | null>(null)

  return (
    <input
      aria-invalid={Boolean(props.error)}
      className={`h-8 w-full rounded-md border bg-white px-2 py-1 text-right text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-100 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 text-slate-900'} ${props.className ?? ''}`}
      inputMode="decimal"
      placeholder="0.00"
      type="text"
      value={draftValue ?? (props.value > 0 ? formatDecimalDisplay(props.value, 2) : '')}
      onBlur={(event) => {
        const nextValue = sanitizeDecimalInput(event.target.value, 2)
        if (!nextValue.trim() || nextValue.trim() === '.') {
          setDraftValue(null)
          props.onChange(0)
          return
        }
        const parsed = Number(nextValue)
        setDraftValue(null)
        props.onChange(Number.isFinite(parsed) ? roundMoney(parsed) : 0)
      }}
      onChange={(event) => {
        const nextValue = sanitizeDecimalInput(event.target.value, 2)
        setDraftValue(nextValue)
        if (!nextValue.trim() || nextValue.trim() === '.') {
          props.onChange(0)
          return
        }
        const parsed = Number(nextValue)
        props.onChange(Number.isFinite(parsed) ? parsed : 0)
      }}
      onFocus={(event: FocusEvent<HTMLInputElement>) => {
        setDraftValue(props.value > 0 ? formatDecimalDraft(props.value, 2) : '')
        requestAnimationFrame(() => {
          const end = event.target.value.length
          event.target.setSelectionRange(end, end)
        })
      }}
    />
  )
}

function ExpenseLineTable(props: {
  categoryOptions: SearchComboboxOption[]
  errors: Record<string, string>
  lines: ExpenseLineDraft[]
  netAmount: number
  onAddLine: () => void
  onLineChange: (index: number, patch: Partial<ExpenseLineDraft>) => void
  onRemoveLine: (index: number) => void
  totalAmount: number
  totalVatAmount: number
  totalWhtAmount: number
  vatRatePercent: number
  whtRatePercent: number
}) {
  const categoryPlaceholder = props.categoryOptions.length > 0 ? 'พิมพ์ค้นหาหมวดค่าใช้จ่าย...' : 'ไม่มีหมวดค่าใช้จ่าย'

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">รายการค่าใช้จ่าย ({props.lines.length})</h4>
          {props.errors.lines ? <div className="mt-1 text-xs text-red-700">{props.errors.lines}</div> : null}
        </div>
        <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700" type="button" onClick={props.onAddLine}>
          + เพิ่มบรรทัด
        </button>
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="ns-table w-full min-w-[940px] text-xs">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
            <tr>
              <th className="w-48 p-2 text-left">หมวด</th>
              <th className="p-2 text-left">รายละเอียด</th>
              <th className="w-28 p-2 text-right">จำนวน</th>
              <th className="w-14 p-2 text-center">VAT</th>
              <th className="w-24 p-2 text-right">VAT {props.vatRatePercent.toFixed(2)}%</th>
              <th className="w-28 bg-amber-50 p-2 text-center text-amber-800">WHT %</th>
              <th className="w-28 bg-amber-50 p-2 text-right text-amber-800">หัก ณ ที่จ่าย</th>
              <th className="w-12 p-2" />
            </tr>
          </thead>
          <tbody>
            {props.lines.map((line, index) => {
              const categoryError = props.errors[`lines.${index}.categoryId`]
              const descriptionError = props.errors[`lines.${index}.description`]
              const amountError = props.errors[`lines.${index}.amount`]
              const whtPctError = props.errors[`lines.${index}.whtPct`]
              const hasSelectedCustomWht = line.whtPct > 0 && !whtRateOptions.some((option) => option.value === line.whtPct)
              const showCurrentWhtRate = props.whtRatePercent > 0 && !whtRateOptions.some((option) => option.value === props.whtRatePercent)
              return (
                <tr key={line.id} className="border-t border-slate-200">
                  <td className="p-1 align-top" data-field={`lines.${index}.categoryId`}>
                    <SearchCombobox
                      error={categoryError}
                      errorKey={`lines.${index}.categoryId`}
                      hideLabel
                      inputClassName="h-8 px-2 py-1 text-xs"
                      inputId={`expense-line-category-${index}`}
                      label="หมวดค่าใช้จ่าย"
                      options={props.categoryOptions}
                      placeholder={categoryPlaceholder}
                      value={line.categoryId ?? ''}
                      onChange={(value) => props.onLineChange(index, { categoryId: value || null })}
                    />
                    {categoryError ? <span className="mt-1 block text-xs text-red-700">{categoryError}</span> : null}
                  </td>
                  <td className="p-1 align-top" data-field={`lines.${index}.description`}>
                    <input
                      aria-invalid={Boolean(descriptionError)}
                      className={`h-8 w-full rounded-md border bg-white px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-100 ${descriptionError ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 text-slate-900'}`}
                      value={line.description ?? ''}
                      onChange={(event) => props.onLineChange(index, { description: event.target.value || null })}
                    />
                    {descriptionError ? <span className="mt-1 block text-xs text-red-700">{descriptionError}</span> : null}
                  </td>
                  <td className="p-1 align-top" data-field={`lines.${index}.amount`}>
                    <MoneyInputControl error={amountError} value={line.amount} onChange={(value) => props.onLineChange(index, { amount: value })} />
                    {amountError ? <span className="mt-1 block text-right text-xs text-red-700">{amountError}</span> : null}
                  </td>
                  <td className="p-1 text-center align-middle" data-field={`lines.${index}.hasVat`}>
                    <input className="h-4 w-4 rounded border-slate-300" checked={line.hasVat} type="checkbox" onChange={(event) => props.onLineChange(index, { hasVat: event.target.checked })} />
                  </td>
                  <td className={`p-2 text-right align-middle tabular-nums ${line.hasVat ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    {line.hasVat ? formatMoney(line.vatAmount) : '-'}
                  </td>
                  <td className="bg-amber-50 p-1 align-top" data-field={`lines.${index}.whtPct`}>
                    <select
                      aria-invalid={Boolean(whtPctError)}
                      className={`h-8 w-full rounded-md border bg-white px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-100 ${whtPctError ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300'}`}
                      value={line.whtPct > 0 ? String(line.whtPct) : '0'}
                      onChange={(event) => props.onLineChange(index, { whtPct: Number(event.target.value) })}
                    >
                      <option value="0">- ไม่หัก -</option>
                      {showCurrentWhtRate ? <option value={props.whtRatePercent}>{props.whtRatePercent.toFixed(2)}% (อัตราปัจจุบัน)</option> : null}
                      {whtRateOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      {hasSelectedCustomWht ? <option value={line.whtPct}>{line.whtPct.toFixed(2)}% (เดิม)</option> : null}
                    </select>
                    {whtPctError ? <span className="mt-1 block text-xs text-red-700">{whtPctError}</span> : null}
                  </td>
                  <td className="bg-amber-50 p-1 align-top">
                    <input className={`h-8 w-full rounded-md border border-slate-300 px-2 py-1 text-right text-xs tabular-nums ${line.whtPct > 0 ? 'bg-amber-100 font-semibold text-amber-800' : 'bg-white text-slate-400'}`} readOnly value={line.whtPct > 0 ? formatMoney(line.whtAmount) : '-'} />
                  </td>
                  <td className="p-1 text-center align-middle">
                    <button className="rounded-md px-2 py-1 text-lg leading-none text-red-500 hover:bg-red-50 disabled:text-slate-300 disabled:hover:bg-transparent" disabled={props.lines.length <= 1} type="button" onClick={() => props.onRemoveLine(index)}>
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-slate-50 font-semibold">
            <tr>
              <td className="p-2 text-right" colSpan={2}>รวม</td>
              <td className="p-2 text-right text-red-700 tabular-nums">{formatMoney(props.totalAmount)}</td>
              <td />
              <td className="p-2 text-right tabular-nums">{formatMoney(props.totalVatAmount)}</td>
              <td />
              <td className="p-2 text-right text-amber-800 tabular-nums">{formatMoney(props.totalWhtAmount)}</td>
              <td />
            </tr>
            <tr>
              <td className="p-2 text-right" colSpan={8}>
                Net Pay: <span className="text-base font-bold text-red-700 tabular-nums">{formatMoney(props.netAmount)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function SelectField(props: { error?: string; fieldName?: string; label: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; placeholder?: string; required?: boolean; value: string }) {
  const placeholder = props.placeholder ?? (props.required ? `เลือก${props.label}` : 'ไม่ระบุ')

  return (
    <label className="block" data-field={props.fieldName}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{props.label}{renderRequiredMark(props.required)}</span>
      <select
        aria-invalid={Boolean(props.error)}
        className={`h-9 w-full rounded-md border bg-white px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-100 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300'} ${props.value ? 'text-slate-900' : 'text-slate-400'}`}
        required={props.required}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option disabled={props.required} value="">{placeholder}</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function TextAreaField(props: { error?: string; fieldName?: string; label: string; onChange: (value: string) => void; rows?: number; value: string }) {
  return (
    <label className="block" data-field={props.fieldName}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{props.label}</span>
      <textarea
        aria-invalid={Boolean(props.error)}
        className={`w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-100 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 text-slate-900'}`}
        rows={props.rows ?? 3}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function ExpenseMetric({
  label,
  value,
  unit,
  icon,
  iconBg,
  valueClass = 'text-slate-900',
  subLabel,
}: {
  label: string
  value: string
  unit?: string
  icon: string
  iconBg: string
  valueClass?: string
  subLabel?: string
  subLabelClass?: string
}) {
  const tone: KpiCardTone = valueClass.includes('red') || iconBg.includes('red')
    ? 'red'
    : valueClass.includes('emerald') || iconBg.includes('emerald')
      ? 'emerald'
      : iconBg.includes('purple')
        ? 'purple'
        : iconBg.includes('blue')
          ? 'blue'
          : iconBg.includes('indigo')
            ? 'indigo'
            : 'slate'

  return <SharedKpiCard icon={icon} label={label} note={subLabel} tone={tone} value={unit ? `${value} ${unit}` : value} />
}

