'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, expenseFormSchema, formatMoney, todayDateInput, type DailyAccountOption, type ExpenseFormValues } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type CategoryOption = { active: boolean | null; id: string; name: string }
type ExpenseRow = ExpenseFormValues & {
  accountName: string
  categoryName: string
  docNo: string
  id: string
  netAmount: number
  status: string
}

type ExpensePayload = {
  accounts: DailyAccountOption[]
  categories: CategoryOption[]
  rows: ExpenseRow[]
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

const emptyForm: ExpenseFormValues = {
  accountId: null,
  amount: 0,
  branchId: null,
  categoryId: null,
  date: todayDateInput(),
  description: null,
  docNo: null,
  dueDate: null,
  id: null,
  notes: null,
  paidStatus: 'pending',
  payee: '',
  refDocNo: null,
  taxInvoiceNo: null,
  vat: 0,
  wht: 0,
}

export function DailyExpensePageClient({ dashboardOnly = false }: { dashboardOnly?: boolean }) {
  const [accounts, setAccounts] = useState<DailyAccountOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<ExpenseFormValues>(emptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [rows, setRows] = useState<ExpenseRow[]>([])
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [payeeFilter, setPayeeFilter] = useState('')
  const [accountId, setAccountId] = useState('')
  const [paidStatus, setPaidStatus] = useState('all')
  const [periodMonths, setPeriodMonths] = useState(6)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<ExpensePayload>('/api/daily/expenses')
      setAccounts(payload.accounts)
      setCategories(payload.categories)
      setRows(payload.rows)
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
      .filter((row) => !categoryId || row.categoryId === categoryId)
      .filter((row) => !dateFrom || row.date >= dateFrom)
      .filter((row) => !dateTo || row.date <= dateTo)
      .filter((row) => !payeeFilter.trim() || row.payee.toLowerCase().includes(payeeFilter.trim().toLowerCase()))
      .filter((row) => !accountId || row.accountId === accountId)
      .filter((row) => paidStatus === 'all' || row.paidStatus === paidStatus)
      .filter((row) => !query || `${row.docNo} ${row.payee} ${row.refDocNo ?? ''} ${row.description ?? ''}`.toLowerCase().includes(query))
      .sort((left, right) => right.date.localeCompare(left.date) || right.docNo.localeCompare(left.docNo))
  }, [accountId, categoryId, dateFrom, dateTo, paidStatus, payeeFilter, rows, search])

  const summary = useMemo(() => {
    const month = todayDateInput().slice(0, 7)
    const monthly = rows.filter((row) => row.date.startsWith(month))
    const byCategory = new Map<string, number>()
    const byPayee = new Map<string, number>()
    for (const row of monthly) {
      byCategory.set(row.categoryName || 'ไม่ระบุหมวด', (byCategory.get(row.categoryName || 'ไม่ระบุหมวด') ?? 0) + row.netAmount)
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
      paidTotal: rows.filter((row) => row.paidStatus === 'paid').reduce((sum, row) => sum + row.netAmount, 0),
      pendingTotal: rows.filter((row) => row.paidStatus !== 'paid').reduce((sum, row) => sum + row.netAmount, 0),
      topCategories,
      topPayees: Array.from(byPayee, ([name, total]) => ({ name, total })).sort((left, right) => right.total - left.total).slice(0, 5),
      trend,
    }
  }, [rows])

  const dashboard = useMemo(() => {
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
      const month = row.date.slice(0, 7)
      if (!monthList.includes(month)) continue
      const key = row.categoryId && byCategory.has(row.categoryId) ? row.categoryId : '_uncat'
      const target = byCategory.get(key)
      if (!target) continue
      const amount = row.amount + row.vat
      target.byMonth[month] = (target.byMonth[month] ?? 0) + amount
      target.total += amount
    }

    const heatmapRows = Array.from(byCategory.values())
      .map((item) => {
        const latest = item.byMonth[monthList[monthList.length - 1]] ?? 0
        const avg = item.total / periodMonths
        const deviation = avg > 0 ? ((latest - avg) / avg) * 100 : 0
        const anomaly = avg > 0 && latest > Math.max(avg * 1.5, 5000) ? 'high' : avg > 0 && latest > 0 && latest < avg * 0.3 ? 'low' : null
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
    const vsAvg = avg > 0 ? ((latest - avg) / avg) * 100 : 0

    return {
      anomalies: heatmapRows.filter((item) => item.anomaly),
      avg,
      grandByMonth,
      heatmapRows,
      latest,
      monthList,
      total,
      vsAvg,
    }
  }, [categories, periodMonths, rows])

  function openCreateForm() {
    setForm({ ...emptyForm, date: todayDateInput() })
    setFieldErrors({})
    setFormOpen(true)
  }

  function openEditForm(row: ExpenseRow) {
    setForm({
      accountId: row.accountId,
      amount: row.amount,
      branchId: row.branchId,
      categoryId: row.categoryId,
      date: row.date,
      description: row.description,
      docNo: row.docNo,
      dueDate: row.dueDate,
      id: row.id,
      notes: row.notes,
      paidStatus: row.paidStatus,
      payee: row.payee,
      refDocNo: row.refDocNo,
      taxInvoiceNo: row.taxInvoiceNo,
      vat: row.vat,
      wht: row.wht,
    })
    setFieldErrors({})
    setFormOpen(true)
  }

  async function saveForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = expenseFormSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
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
          <div className="rounded-md bg-gradient-to-r from-rose-700 to-orange-600 p-5 text-white shadow">
            <h1 className="text-2xl font-bold">Dashboard ค่าใช้จ่าย</h1>
            <p className="mt-1 text-sm opacity-90">สรุปแต่ละหมวดเทียบเดือนย้อนหลัง และตรวจหาความผิดปกติเทียบค่าเฉลี่ย</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 text-sm shadow">
            <span className="text-slate-600">ดูย้อนหลัง:</span>
            {[3, 6, 12].map((months) => (
              <button key={months} className={`rounded-md px-3 py-1.5 text-xs ${periodMonths === months ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`} type="button" onClick={() => setPeriodMonths(months)}>
                {months} เดือน
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md bg-white p-3 shadow"><div className="text-xs text-slate-500">รวม {periodMonths} เดือน</div><div className="text-2xl font-bold">{formatMoney(dashboard.total)}</div></div>
            <div className="rounded-md bg-blue-50 p-3 shadow"><div className="text-xs text-blue-700">เฉลี่ย/เดือน</div><div className="text-2xl font-bold text-blue-700">{formatMoney(dashboard.avg)}</div></div>
            <div className="rounded-md bg-amber-50 p-3 shadow"><div className="text-xs text-amber-700">เดือนนี้</div><div className="text-2xl font-bold text-amber-700">{formatMoney(dashboard.latest)}</div></div>
            <div className={`rounded-md p-3 shadow ${Math.abs(dashboard.vsAvg) > 20 ? dashboard.vsAvg > 0 ? 'bg-red-50' : 'bg-emerald-50' : 'bg-slate-50'}`}>
              <div className={`text-xs ${dashboard.vsAvg > 20 ? 'text-red-700' : dashboard.vsAvg < -20 ? 'text-emerald-700' : 'text-slate-700'}`}>เทียบเฉลี่ย</div>
              <div className={`text-2xl font-bold ${dashboard.vsAvg > 20 ? 'text-red-700' : dashboard.vsAvg < -20 ? 'text-emerald-700' : 'text-slate-700'}`}>{dashboard.vsAvg > 0 ? '+' : ''}{dashboard.vsAvg.toFixed(1)}%</div>
            </div>
          </div>

          {dashboard.anomalies.length > 0 ? (
            <div className="rounded-md border-2 border-red-300 bg-gradient-to-r from-red-50 to-amber-50 p-4">
              <h3 className="mb-2 font-bold text-red-700">ตรวจพบความผิดปกติ {dashboard.anomalies.length} หมวด</h3>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {dashboard.anomalies.map((item) => (
                  <div key={item.id} className={`rounded-md border p-3 ${item.anomaly === 'high' ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={`font-bold ${item.anomaly === 'high' ? 'text-red-700' : 'text-amber-700'}`}>{item.anomaly === 'high' ? 'สูงผิดปกติ' : 'ต่ำผิดปกติ'}: {item.name}</div>
                        <div className="mt-1 text-xs text-slate-600">เดือนนี้: <b>{formatMoney(item.latest)}</b> · เฉลี่ย: <b>{formatMoney(item.avg)}</b></div>
                      </div>
                      <div className={`text-2xl font-bold ${item.anomaly === 'high' ? 'text-red-700' : 'text-amber-700'}`}>{item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(0)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">ไม่พบความผิดปกติ ค่าใช้จ่ายแต่ละหมวดอยู่ในช่วงค่าเฉลี่ย</div>
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
                      {item.anomaly === 'high' ? <span className="rounded-md bg-red-100 px-2 py-0.5 text-xs text-red-700">สูง</span> : item.anomaly === 'low' ? <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700">ต่ำ</span> : <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">ปกติ</span>}
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
            <b>หมายเหตุ:</b> ความผิดปกติ = เดือนนี้มากกว่า 1.5 เท่าของค่าเฉลี่ยและเกิน 5,000 บาท หรือ น้อยกว่า 30% ของค่าเฉลี่ย
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-[280px] flex-1 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <strong>ค่าใช้จ่าย Expense Voucher</strong> — บันทึกใบแจ้งหนี้ก่อน จ่ายภายหลังก็ได้ พร้อม VAT/WHT และวันครบกำหนด
            </div>
            <button className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md hover:bg-blue-700" type="button" onClick={openCreateForm}>เพิ่มค่าใช้จ่าย</button>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md bg-gradient-to-br from-purple-500 to-fuchsia-600 p-4 text-white shadow">
              <div className="text-xs opacity-90">ค่าใช้จ่ายเดือนนี้</div>
              <div className="text-2xl font-bold">{formatMoney(summary.monthlyTotal)}</div>
              <div className="mt-1 text-xs opacity-80">{summary.monthlyCount} รายการ · Net Pay</div>
            </div>
            <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-4 shadow">
              <div className="text-xs text-amber-700">รอจ่าย</div>
              <div className="text-2xl font-bold text-amber-700">{formatMoney(summary.pendingTotal)}</div>
              <div className="mt-1 text-xs text-amber-600">ยอดค้างตามสถานะ</div>
            </div>
            <div className="rounded-md border-2 border-emerald-300 bg-emerald-50 p-4 shadow">
              <div className="text-xs text-emerald-700">จ่ายแล้ว</div>
              <div className="text-2xl font-bold text-emerald-700">{formatMoney(summary.paidTotal)}</div>
              <div className="mt-1 text-xs text-emerald-600">รายการที่ปิดจ่ายแล้ว</div>
            </div>
            <div className="rounded-md bg-white p-4 shadow">
              <div className="mb-1 text-xs text-slate-600">6 เดือนล่าสุด</div>
              <div className="flex h-[52px] items-end gap-1">
                {summary.trend.map((item) => {
                  const max = Math.max(1, ...summary.trend.map((trend) => trend.total))
                  const height = Math.max(4, (item.total / max) * 44)
                  return <div key={item.month} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-md-t bg-purple-400" style={{ height }} /><span className="text-[10px] text-slate-400">{item.month.slice(5)}</span></div>
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ExpenseRankingPanel color="purple" emptyText="ยังไม่มีข้อมูลเดือนนี้" label="หมวดค่าใช้จ่าย (เดือนนี้)" total={summary.catTotal} rows={summary.topCategories} />
            <ExpenseRankingPanel color="blue" emptyText="ยังไม่มีข้อมูลเดือนนี้" label="Top 5 ผู้รับเงิน (เดือนนี้)" rows={summary.topPayees} />
          </div>

          <div className="rounded-md bg-white p-3 shadow">
            <div className="flex flex-wrap items-center gap-2">
              <input className="min-w-[220px] flex-1 rounded-md border px-3 py-2 text-sm" placeholder="ค้นหาเลข Voucher / ผู้รับ / อ้างอิง..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
              <label className="text-xs text-slate-500">วันที่:</label>
              <DatePickerInput className="w-[130px]" title="จากวันที่" value={dateFrom} onChange={setDateFrom} />
              <span className="text-slate-400">→</span>
              <DatePickerInput className="w-[130px]" title="ถึงวันที่" value={dateTo} onChange={setDateTo} />
              <select className="rounded-md border px-3 py-2 text-sm" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">ทุกหมวด</option>
                {categories.filter((category) => category.active !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <input className="w-44 rounded-md border px-3 py-2 text-sm" placeholder="ผู้รับ/Supplier..." type="search" value={payeeFilter} onChange={(event) => setPayeeFilter(event.target.value)} />
              <select className="rounded-md border px-3 py-2 text-sm" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                <option value="">ทุกบัญชี</option>
                {accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <div className="flex gap-1 rounded-md border p-0.5">
                {[
                  ['pending', 'รอจ่าย', 'amber'],
                  ['paid', 'จ่ายแล้ว', 'emerald'],
                  ['all', 'ทั้งหมด', 'slate'],
                ].map(([value, label, tone]) => (
                  <button key={value} className={`rounded-md px-2 py-1 text-xs ${paidStatus === value ? tone === 'amber' ? 'bg-amber-500 text-white' : tone === 'emerald' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`} type="button" onClick={() => setPaidStatus(value)}>
                    {label}
                  </button>
                ))}
              </div>
              {search || dateFrom || dateTo || categoryId || payeeFilter || accountId || paidStatus !== 'all' ? (
                <button className="rounded-md bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setCategoryId(''); setPayeeFilter(''); setAccountId(''); setPaidStatus('all') }}>ล้าง</button>
              ) : null}
              <button className="ml-auto rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-300" disabled title="รอออกแบบ export field contract ก่อนเปิดใช้งาน" type="button">Export Excel ({filteredRows.length})</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
              <span className="rounded-md bg-blue-50 px-2 py-1">พบ <b className="text-blue-700">{filteredRows.length}</b> Voucher</span>
              <span className="rounded-md bg-amber-50 px-2 py-1">รวม Net Pay <b className="text-amber-700">{formatMoney(filteredRows.reduce((sum, row) => sum + row.netAmount, 0))}</b></span>
            </div>
          </div>

          {formOpen ? (
            <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
              <form noValidate className="w-full max-w-3xl overflow-hidden rounded-md bg-white shadow-xl" onSubmit={saveForm}>
                <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-4">
                  <h3 className="font-bold">{form.id ? 'แก้ไขค่าใช้จ่าย' : 'เพิ่มค่าใช้จ่าย'}</h3>
                  <button className="text-2xl text-slate-400" type="button" onClick={() => setFormOpen(false)}>&times;</button>
                </div>
                <div className="grid gap-4 p-5 md:grid-cols-3">
                  <TextField label="เลขที่" readOnly value={form.docNo ?? 'ระบบจะออกเลขให้'} />
                  <TextField error={fieldErrors.date} label="วันที่" required type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
                  <TextField error={fieldErrors.dueDate} label="ครบกำหนด" type="date" value={form.dueDate ?? ''} onChange={(value) => setForm({ ...form, dueDate: value })} />
                  <TextField error={fieldErrors.payee} label="ผู้รับเงิน" required value={form.payee} onChange={(value) => setForm({ ...form, payee: value })} />
                  <SelectField error={fieldErrors.categoryId} label="หมวด" value={form.categoryId ?? ''} onChange={(value) => setForm({ ...form, categoryId: value })} options={categories.filter((category) => category.active !== false).map((category) => ({ id: category.id, name: category.name }))} />
                  <SelectField error={fieldErrors.accountId} label="บัญชีจ่าย" value={form.accountId ?? ''} onChange={(value) => setForm({ ...form, accountId: value })} options={accounts.filter((account) => account.active)} />
                  <TextField error={fieldErrors.amount} label="ยอดก่อน VAT" required type="number" value={String(form.amount)} onChange={(value) => setForm({ ...form, amount: Number(value) })} />
                  <TextField error={fieldErrors.vat} label="VAT" type="number" value={String(form.vat)} onChange={(value) => setForm({ ...form, vat: Number(value) })} />
                  <TextField error={fieldErrors.wht} label="WHT" type="number" value={String(form.wht)} onChange={(value) => setForm({ ...form, wht: Number(value) })} />
                  <TextField error={fieldErrors.refDocNo} label="เลขอ้างอิง" value={form.refDocNo ?? ''} onChange={(value) => setForm({ ...form, refDocNo: value })} />
                  <TextField error={fieldErrors.taxInvoiceNo} label="เลขใบกำกับภาษี" value={form.taxInvoiceNo ?? ''} onChange={(value) => setForm({ ...form, taxInvoiceNo: value })} />
                  <label className="block text-sm font-medium">
                    สถานะ
                    <select className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2" value={form.paidStatus} onChange={(event) => setForm({ ...form, paidStatus: event.target.value as 'pending' | 'paid' })}>
                      <option value="pending">รอจ่าย</option>
                      <option value="paid">จ่ายแล้ว</option>
                    </select>
                  </label>
                  <div className="md:col-span-3">
                    <TextField error={fieldErrors.description} label="รายละเอียด" value={form.description ?? ''} onChange={(value) => setForm({ ...form, description: value })} />
                  </div>
                </div>
                <div className="flex justify-end gap-2 border-t px-5 py-4">
                  <button className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" type="button" onClick={() => setFormOpen(false)}>ยกเลิก</button>
                  <button className="rounded-md bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isSaving} type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
                </div>
              </form>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md bg-white shadow">
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">เลขที่</th>
                  <th className="p-2 text-left">วันที่</th>
                  <th className="p-2 text-left">ครบกำหนด</th>
                  <th className="p-2 text-left">อ้างอิง</th>
                  <th className="p-2 text-left">ผู้รับ</th>
                  <th className="p-2 text-left">บัญชี</th>
                  <th className="p-2 text-center">สถานะ</th>
                  <th className="bg-red-50 p-2 text-right text-red-700">Net Pay<br /><span className="text-[10px] font-normal">ยอดจ่ายจริง</span></th>
                  <th className="p-2 text-right text-slate-500"><span className="text-[10px]">ยอด/VAT/WHT</span></th>
                  <th className="p-2 text-center">การกระทำ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && filteredRows.map((row) => {
                  const overdue = row.paidStatus !== 'paid' && row.dueDate ? row.dueDate < todayDateInput() : false
                  return (
                    <tr key={row.id} className={`border-t hover:bg-slate-50 ${row.paidStatus === 'pending' ? 'bg-amber-50/40' : ''}`}>
                      <td className="p-2 font-mono text-xs">{row.docNo}</td>
                      <td className="p-2">{formatDateDisplay(row.date)}</td>
                      <td className="p-2 text-xs">{row.dueDate ? <span className={overdue ? 'font-bold text-red-600' : 'text-slate-700'}>{formatDateDisplay(row.dueDate)}{overdue ? <span className="block text-[10px] text-red-500">เลยกำหนด</span> : null}</span> : <span className="text-slate-300">-</span>}</td>
                      <td className="p-2 font-mono text-xs text-slate-600">{row.refDocNo || '-'}</td>
                      <td className="p-2"><div className="font-medium">{row.payee}</div><div className="text-xs text-slate-500">{row.categoryName}</div></td>
                      <td className="p-2">{row.accountName}</td>
                      <td className="p-2 text-center"><span className={`rounded-md-full px-2 py-0.5 text-xs ${row.paidStatus === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.paidStatus === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย'}</span></td>
                      <td className={`bg-red-50/60 p-2 text-right text-base font-bold ${row.paidStatus === 'pending' ? 'text-amber-700' : 'text-red-700'}`}>{formatMoney(row.netAmount)}</td>
                      <td className="whitespace-nowrap p-2 text-right text-xs text-slate-600">
                        <div>ยอด: <b>{formatMoney(row.amount)}</b></div>
                        {row.vat > 0 ? <div className="text-emerald-700">+VAT: {formatMoney(row.vat)}</div> : null}
                        {row.wht > 0 ? <div className="text-amber-700">-WHT: {formatMoney(row.wht)}</div> : null}
                      </td>
                      <td className="p-2 text-center"><button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={() => openEditForm(row)}>จัดการ</button></td>
                    </tr>
                  )
                })}
                {!isLoading && filteredRows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>ยังไม่มีรายการ</td></tr> : null}
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

function TextField(props: { error?: string; label: string; onChange?: (value: string) => void; readOnly?: boolean; required?: boolean; type?: string; value: string }) {
  return (
    <label className="block text-sm font-medium">
      {props.label}{props.required ? <span className="text-red-600"> *</span> : null}
      {props.type === 'date'
        ? <DatePickerInput className="mt-1.5 w-full" readOnly={props.readOnly} required={props.required} value={props.value} onChange={(value) => props.onChange?.(value)} />
        : <input className={`mt-1.5 w-full rounded-md border px-3 py-2 outline-none ${props.error ? 'border-red-400 bg-red-50' : 'border-slate-300'} ${props.readOnly ? 'bg-slate-50' : ''}`} readOnly={props.readOnly} type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange?.(event.target.value)} />}
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function SelectField(props: { error?: string; label: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; value: string }) {
  return (
    <label className="block text-sm font-medium">
      {props.label}
      <select className={`mt-1.5 w-full rounded-md border px-3 py-2 outline-none ${props.error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">ไม่ระบุ</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}
