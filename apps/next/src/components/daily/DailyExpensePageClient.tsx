'use client'

import { Download } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, expenseFormSchema, formatMoney, todayDateInput, type DailyAccountOption, type ExpenseFormValues, type ExpenseLineFormValues } from '@/lib/daily'
import { formatDateDisplay, formatDecimalDisplay, formatDecimalDraft, sanitizeDecimalInput } from '@/lib/format'

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
  categoryId: null,
  date: todayDateInput(),
  description: null,
  docNo: null,
  dueDate: todayDateInput(),
  hasVat: false,
  hasWht: false,
  id: null,
  lines: [],
  notes: null,
  payee: '',
  refDocNo: null,
  status: 'pending_approval',
  taxInvoiceNo: null,
}

const expenseStatusOptions: MultiSegmentOption[] = [
  { label: 'ทุกสถานะ', values: [] },
  { label: 'ยังไม่อนุมัติ', values: ['pending_approval'] },
  { label: 'อนุมัติแล้ว', values: ['approved'] },
  { label: 'เสร็จสิ้น', values: ['paid'] },
  { label: 'ยกเลิกแล้ว', values: ['cancelled'] },
]

function expenseStatusLabel(status: ExpenseFormValues['status']) {
  if (status === 'approved') return 'อนุมัติแล้ว'
  if (status === 'paid') return 'เสร็จสิ้น'
  if (status === 'cancelled') return 'ยกเลิกแล้ว'
  return 'ยังไม่อนุมัติ'
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
  const router = useRouter()
  const [accounts, setAccounts] = useState<DailyAccountOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<ExpenseFormValues>(emptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
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
  const [vatRatePercent, setVatRatePercent] = useState(7)
  const [whtRatePercent, setWhtRatePercent] = useState(3)
  const formRef = useRef<HTMLFormElement | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<ExpensePayload>('/api/daily/expenses')
      setAccounts(payload.accounts)
      setCategories(payload.categories)
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
      .sort((left, right) => right.date.localeCompare(left.date) || right.docNo.localeCompare(left.docNo))
  }, [accountId, categoryId, dateFrom, dateTo, rows, search, statusFilter])

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

  const dashboard = useMemo(() => buildLegacyExpenseDashboard(rows, categories, periodMonths), [categories, periodMonths, rows])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [currentPage, filteredRows, pageSize])

  useEffect(() => {
    setPage(1)
  }, [accountId, categoryId, dateFrom, dateTo, pageSize, search, statusFilter])

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
    setForm({ ...emptyForm, date: today, dueDate: today, lines: [createExpenseLine()] })
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
      branchId: row.branchId,
      categoryId: row.categoryId,
      date: row.date,
      description: row.description,
      docNo: row.docNo,
      dueDate: row.dueDate,
      hasVat: row.hasVat,
      hasWht: row.hasWht,
      id: row.id,
      notes: row.notes,
      payee: row.payee,
      refDocNo: row.refDocNo,
      status: row.status,
      taxInvoiceNo: row.taxInvoiceNo,
    }, nextLines))
    setError(null)
    setFieldErrors({})
    setFormOpen(true)
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
    const payload = syncFormLines({ ...form, status: 'pending_approval' }, totals.lines)
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
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 text-sm shadow">
            <span className="text-slate-600">📅 ดูย้อนหลัง:</span>
            {[3, 6, 12].map((months) => (
              <button key={months} className={`rounded-md px-3 py-1.5 text-xs ${periodMonths === months ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`} type="button" onClick={() => setPeriodMonths(months)}>
                {months} เดือน
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md bg-white p-3 shadow"><div className="text-xs text-slate-500">💸 รวม {periodMonths} เดือน</div><div className="text-2xl font-bold">{formatMoney(dashboard.total)}</div></div>
            <div className="rounded-md bg-blue-50 p-3 shadow"><div className="text-xs text-blue-700">📈 เฉลี่ย/เดือน</div><div className="text-2xl font-bold text-blue-700">{formatMoney(dashboard.avg)}</div></div>
            <div className="rounded-md bg-amber-50 p-3 shadow"><div className="text-xs text-amber-700">📅 เดือนนี้</div><div className="text-2xl font-bold text-amber-700">{formatMoney(dashboard.latest)}</div></div>
            <div className={`rounded-md p-3 shadow ${Math.abs(dashboard.vsAvg) > 20 ? dashboard.vsAvg > 0 ? 'bg-red-50' : 'bg-emerald-50' : 'bg-slate-50'}`}>
              <div className={`text-xs ${dashboard.vsAvg > 20 ? 'text-red-700' : dashboard.vsAvg < -20 ? 'text-emerald-700' : 'text-slate-700'}`}>เทียบเฉลี่ย</div>
              <div className={`text-2xl font-bold ${dashboard.vsAvg > 20 ? 'text-red-700' : dashboard.vsAvg < -20 ? 'text-emerald-700' : 'text-slate-700'}`}>{dashboard.vsAvg > 0 ? '+' : ''}{dashboard.vsAvg.toFixed(1)}%</div>
            </div>
          </div>

          {dashboard.anomalies.length > 0 ? (
            <div className="rounded-md border-2 border-red-300 bg-gradient-to-r from-red-50 to-amber-50 p-4">
              <h3 className="mb-2 font-bold text-red-700">🚨 ตรวจพบความผิดปกติ {dashboard.anomalies.length} หมวด</h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {dashboard.anomalies.map((item) => (
                  <div key={item.id} className={`rounded-md border p-3 ${item.anomaly === 'high' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={`font-bold ${item.anomaly === 'high' ? 'text-red-700' : 'text-amber-700'}`}>{item.anomaly === 'high' ? '⬆ สูงผิดปกติ' : '⬇ ต่ำผิดปกติ'}: {item.name}</div>
                        <div className="mt-1 text-xs text-slate-600">เดือนนี้: <b>{formatMoney(item.latest)}</b> · เฉลี่ย: <b>{formatMoney(item.avg)}</b></div>
                      </div>
                      <div className={`text-2xl font-bold ${item.anomaly === 'high' ? 'text-red-700' : 'text-amber-700'}`}>{item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(0)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">✓ ไม่พบความผิดปกติ — ค่าใช้จ่ายแต่ละหมวดอยู่ในช่วงค่าเฉลี่ย</div>
          )}

          <div className="overflow-x-auto rounded-md bg-white shadow">
            <table className="w-full text-xs">
              <thead className="bg-slate-100">
                <tr>
                  <th className="sticky left-0 bg-slate-100 p-2 text-left">หมวด</th>
                  {dashboard.monthList.map((month) => <th key={month} className="p-2 text-right">{formatMonthLabel(month)}</th>)}
                  <th className="bg-blue-100 p-2 text-right">เฉลี่ย</th>
                  <th className="bg-rose-100 p-2 text-right">รวม</th>
                  <th className="p-2 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td className="py-8 text-center text-slate-400" colSpan={dashboard.monthList.length + 4}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && dashboard.heatmapRows.map((item) => (
                  <tr key={item.id} className="border-t hover:bg-slate-50">
                    <td className="sticky left-0 bg-white p-2 font-medium">{item.name}</td>
                    {dashboard.monthList.map((month) => {
                      const value = item.byMonth[month] ?? 0
                      const hot = item.avg > 0 && value > item.avg * 1.5
                      const low = item.avg > 0 && value > 0 && value < item.avg * 0.5
                      return <td key={month} className={`p-2 text-right ${hot ? 'bg-red-100 font-bold text-red-700' : low ? 'bg-emerald-50 text-emerald-700' : ''}`}>{value > 0 ? formatMoney(value) : '-'}</td>
                    })}
                    <td className="bg-blue-50 p-2 text-right text-blue-700">{formatMoney(item.avg)}</td>
                    <td className="bg-rose-50 p-2 text-right font-bold text-rose-700">{formatMoney(item.total)}</td>
                    <td className="p-2 text-center">
                      {item.anomaly === 'high' ? <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-700">⬆ สูง</span> : item.anomaly === 'low' ? <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700">⬇ ต่ำ</span> : <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">✓ ปกติ</span>}
                    </td>
                  </tr>
                ))}
                {!isLoading && dashboard.heatmapRows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={dashboard.monthList.length + 4}>ยังไม่มีข้อมูลค่าใช้จ่าย</td></tr> : null}
              </tbody>
              {dashboard.heatmapRows.length > 0 ? (
                <tfoot className="bg-slate-100 font-bold">
                  <tr>
                    <td className="sticky left-0 bg-slate-100 p-2">รวมทุกหมวด</td>
                    {dashboard.monthList.map((month) => <td key={month} className="p-2 text-right">{formatMoney(dashboard.grandByMonth[month] ?? 0)}</td>)}
                    <td className="p-2 text-right text-blue-700">{formatMoney(dashboard.avg)}</td>
                    <td className="p-2 text-right text-rose-700">{formatMoney(dashboard.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <b>📋 หมายเหตุ:</b> ความผิดปกติ = เดือนนี้ <b>มากกว่า 1.5×</b> ค่าเฉลี่ยและเกิน 5,000 บาท (สูง) หรือ <b>น้อยกว่า 30%</b> ของค่าเฉลี่ย (ต่ำ — อาจลืมบันทึก)
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-md bg-white p-3 shadow">
              <div className="text-xs text-slate-500">ค่าใช้จ่ายเดือนนี้</div>
              <div className="text-lg font-bold text-slate-900">{formatMoney(summary.monthlyTotal)}</div>
              <div className="text-xs text-slate-500">{summary.monthlyCount} รายการ</div>
            </div>
            <div className="rounded-md bg-white p-3 shadow">
              <div className="text-xs text-slate-500">รอจ่าย</div>
              <div className="text-lg font-bold text-amber-700">{formatMoney(summary.pendingTotal)}</div>
              <div className="text-xs text-slate-500">ตามสถานะเอกสาร</div>
            </div>
            <div className="rounded-md bg-white p-3 shadow">
              <div className="text-xs text-slate-500">เสร็จสิ้น</div>
              <div className="text-lg font-bold text-emerald-700">{formatMoney(summary.paidTotal)}</div>
              <div className="text-xs text-slate-500">รวมทั้งระบบ</div>
            </div>
            <div className="rounded-md bg-white p-3 shadow">
              <div className="text-xs text-slate-500">ตามเงื่อนไขที่กรอง</div>
              <div className="text-lg font-bold text-slate-900">{formatMoney(filteredSummary.netAmount)}</div>
              <div className="text-xs text-slate-500">{filteredSummary.count} รายการ</div>
            </div>
          </div>

          <div className="rounded-md bg-white p-3 shadow">
            <div className="flex flex-wrap items-center gap-2">
              <input className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="ค้นหาเลข Voucher / ผู้รับ / อ้างอิง..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
              <label className="text-xs text-slate-500">วันที่:</label>
              <DatePickerInput className="h-9 w-[130px]" title="จากวันที่" value={dateFrom} onChange={setDateFrom} />
              <span className="text-slate-400">→</span>
              <DatePickerInput className="h-9 w-[130px]" title="ถึงวันที่" value={dateTo} onChange={setDateTo} />
              <select className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">ทุกหมวด</option>
                {categories.filter((category) => category.active !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <select className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">ทุกบัญชี</option>
                {accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              {search || dateFrom || dateTo || categoryId || accountId || statusFilter.length > 0 ? (
                <Button className="h-9" size="sm" type="button" variant="outline" onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setCategoryId(''); setAccountId(''); setStatusFilter([]) }}>ล้าง</Button>
              ) : null}
              <Button className="ml-auto h-9" size="sm" type="button" onClick={openCreateForm}>+ เพิ่มค่าใช้จ่าย</Button>
              <a className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700" href={exportHref}>
                <Download className="h-4 w-4" aria-hidden="true" />
                ส่งออก Excel
              </a>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">สถานะ:</span>
              {expenseStatusOptions.map((option) => (
                <SegmentMulti key={option.label} current={statusFilter} label={option.label} onClick={setStatusFilter} values={option.values} />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <div>พบทั้งหมด {filteredSummary.count} รายการ</div>
            <div className="flex flex-wrap items-center gap-2">
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
              <form ref={formRef} noValidate className="w-full max-w-6xl overflow-hidden rounded-md bg-white shadow-xl" onSubmit={saveForm}>
                <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-4">
                  <h3 className="font-bold">{form.id ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย'}</h3>
                  <button className="text-2xl text-slate-400" type="button" onClick={() => setFormOpen(false)}>&times;</button>
                </div>
                <div className="space-y-4 bg-slate-50 p-4">
                  <div className="rounded-md bg-white p-4 shadow">
                    <div className="mb-3 text-sm font-semibold text-slate-900">ข้อมูลหลัก</div>
                    <div className="grid gap-3 md:grid-cols-4">
                      <div className="md:col-span-2">
                        <PayeeField error={fieldErrors.payee} options={payeeOptions} value={form.payee} onChange={(value) => setForm({ ...form, payee: value })} />
                      </div>
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

                  <div className="rounded-md bg-white p-4 shadow">
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

                  <div className="rounded-md bg-white p-4 shadow">
                    <div className="mb-3 text-sm font-semibold text-slate-900">เอกสารอ้างอิงและหมายเหตุ</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <TextField error={fieldErrors.refDocNo} fieldName="refDocNo" label="เลขอ้างอิง" value={form.refDocNo ?? ''} onChange={(value) => setForm({ ...form, refDocNo: value })} />
                      <TextField error={fieldErrors.taxInvoiceNo} fieldName="taxInvoiceNo" label="เลขใบกำกับภาษี" value={form.taxInvoiceNo ?? ''} onChange={(value) => setForm({ ...form, taxInvoiceNo: value })} />
                      <div className="md:col-span-3">
                        <TextAreaField error={fieldErrors.notes} fieldName="notes" label="หมายเหตุ" rows={3} value={form.notes ?? ''} onChange={(value) => setForm({ ...form, notes: value })} />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-white p-4 shadow">
                    <div className="mb-3 text-sm font-semibold text-slate-800">สรุปก่อนบันทึก</div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <SummaryTile label="ยอดก่อน VAT" value={formatMoney(formTotals.amount)} />
                      <SummaryTile label="+ VAT" value={formatMoney(formTotals.vatAmount)} />
                      <SummaryTile label="- WHT" value={formatMoney(formTotals.whtAmount)} />
                      <SummaryTile emphasize label="ยอดสุทธิ" value={formatMoney(formTotals.netAmount)} />
                    </div>
                    {form.id ? (
                      <div className="mt-4 rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
                        สถานะปัจจุบัน: <span className={`font-semibold ${expenseStatusTextClass(form.status)}`}>{expenseStatusLabel(form.status)}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t px-5 py-4">
                  <Button className="h-9" type="button" variant="outline" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
                  <Button className="h-9" disabled={isSaving} type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md bg-white shadow">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">เลขที่</th>
                  <th className="p-2 text-left">วันที่จ่าย</th>
                  <th className="p-2 text-left">ครบกำหนด</th>
                  <th className="p-2 text-left">อ้างอิง</th>
                  <th className="p-2 text-left">ผู้รับ</th>
                  <th className="p-2 text-left">หมวด</th>
                  <th className="p-2 text-left">บัญชี</th>
                  <th className="p-2 text-center">สถานะ</th>
                  <th className="bg-red-50 p-2 text-right text-red-700">Net Pay<br /><span className="text-[10px] font-normal">ยอดจ่ายจริง</span></th>
                  <th className="p-2 text-right text-slate-500"><span className="text-[10px]">ยอด/VAT/WHT</span></th>
                  <th className="p-2 text-center">การกระทำ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && pagedRows.map((row) => {
                  const overdue = row.status !== 'paid' && row.status !== 'cancelled' && row.dueDate ? row.dueDate < todayDateInput() : false
                  return (
                    <tr
                      key={row.id}
                      className={`cursor-pointer hover:bg-slate-50 ${expenseRowTone(row.status)}`}
                      onClick={() => router.push(`/daily/expense/${encodeURIComponent(row.docNo)}`)}
                    >
                      <td className="p-2 font-mono text-xs">{row.docNo}</td>
                      <td className="p-2">{formatDateDisplay(row.date)}</td>
                      <td className="p-2 text-xs">{row.dueDate ? <span className={overdue ? 'font-bold text-red-600' : 'text-slate-700'}>{formatDateDisplay(row.dueDate)}{overdue ? <span className="block text-[10px] text-red-500">เลยกำหนด</span> : null}</span> : <span className="text-slate-300">-</span>}</td>
                      <td className="p-2 font-mono text-xs text-slate-600">{row.refDocNo || '-'}</td>
                      <td className="p-2 font-medium">{row.payee}</td>
                      <td className="p-2 text-sm text-slate-600">{row.categoryName}</td>
                      <td className="p-2">{row.accountName}</td>
                      <td className="p-2 text-center text-xs"><span className={`inline-flex items-center gap-1 ${expenseStatusTextClass(row.status)}`}><span className={`h-2 w-2 rounded-full ${expenseStatusDotClass(row.status)}`} />{expenseStatusLabel(row.status)}</span></td>
                      <td className={`bg-red-50/60 p-2 text-right text-base font-bold ${row.status === 'paid' ? 'text-emerald-700' : row.status === 'approved' ? 'text-blue-700' : row.status === 'cancelled' ? 'text-slate-500' : 'text-amber-700'}`}>{formatMoney(row.netAmount)}</td>
                      <td className="whitespace-nowrap p-2 text-right text-xs text-slate-600">
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
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {!isLoading && filteredRows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={11}>ยังไม่มีรายการ</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function ExpenseRankingPanel({ color, emptyText, label, rows, total }: { color: 'blue' | 'purple'; emptyText: string; label: string; rows: Array<{ name: string; total: number }>; total?: number }) {
  const barClass = color === 'purple' ? 'bg-gradient-to-r from-purple-400 to-fuchsia-500' : 'bg-gradient-to-r from-blue-400 to-indigo-500'
  const textClass = color === 'purple' ? 'text-purple-700' : 'text-blue-700'
  const denominator = rows[0]?.total || 1

  return (
    <div className="rounded-md bg-white p-4 shadow">
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
    return month.toISOString().slice(0, 7)
  })
}

function formatMonthLabel(month: string) {
  return new Intl.DateTimeFormat('th-TH', { month: 'short', year: '2-digit' }).format(new Date(`${month}-01T00:00:00`))
}

function SummaryTile({ emphasize = false, label, value }: { emphasize?: boolean; label: string; value: string }) {
  return (
    <div className={`rounded-md border p-3 ${emphasize ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className={`text-xs font-medium ${emphasize ? 'text-red-700' : 'text-slate-500'}`}>{label}</div>
      <div className={`mt-1 text-right text-base font-semibold tabular-nums ${emphasize ? 'text-red-700' : 'text-slate-900'}`}>
        {value}
      </div>
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
    <label className="block" data-field="payee">
      <span className="mb-1 block text-xs font-medium text-slate-600">ผู้รับเงิน{renderRequiredMark(true)}</span>
      <input
        aria-invalid={Boolean(props.error)}
        autoComplete="off"
        className={`h-9 w-full rounded-md border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-100 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white text-slate-900'}`}
        list="expense-payee-options"
        placeholder="ค้นหา Supplier หรือกรอกเอง"
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
      <span className="mt-1 block text-[11px] text-slate-500">เลือกจาก Supplier master ได้ หรือพิมพ์ชื่อผู้รับเงินใหม่ได้โดยตรง</span>
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
        <table className="w-full min-w-[940px] text-xs">
          <thead className="bg-slate-100">
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
                <tr key={line.id} className="border-t">
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
        className={`w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-100 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 text-slate-900'}`}
        rows={props.rows ?? 3}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}
