'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney, todayDateInput, transferFormSchema, type DailyAccountOption, type TransferFormValues } from '@/lib/daily'
import { firstErrorKeyFromZodIssues, focusFieldError, issueMapFromZodIssues } from '@/lib/form-errors'
import { formatDateDisplay } from '@/lib/format'

type TransferRow = TransferFormValues & {
  docNo: string
  fromAccountName: string
  id: string
  status: string
  toAccountName: string
}

type TransferPayload = {
  accounts: DailyAccountOption[]
  rows: TransferRow[]
}
type TransferColumnKey = 'action' | 'amount' | 'byPerson' | 'date' | 'docNo' | 'fee' | 'from' | 'to'
type Period = '' | 'month' | 'today' | 'week'

const pageSizeOptions = [10, 25, 50, 100]
const transferColumns: Array<ResizableColumnDefinition<TransferColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'from', defaultWidth: 280, minWidth: 150 },
  { key: 'to', defaultWidth: 280, minWidth: 150 },
  { key: 'amount', defaultWidth: 85, minWidth: 80 },
  { key: 'fee', defaultWidth: 80, minWidth: 70 },
  { key: 'byPerson', defaultWidth: 160, minWidth: 120 },
  { key: 'action', defaultWidth: 150, minWidth: 140 },
]

const emptyForm: TransferFormValues = {
  amount: 0,
  byPerson: null,
  date: todayDateInput(),
  docNo: null,
  fee: 0,
  fromAccountId: '',
  id: null,
  notes: null,
  toAccountId: '',
}

export function DailyTransferPageClient() {
  const [accounts, setAccounts] = useState<DailyAccountOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<TransferFormValues>(emptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [moneyDrafts, setMoneyDrafts] = useState<Record<string, string>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [rows, setRows] = useState<TransferRow[]>([])
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<TransferRow | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [period, setPeriod] = useState<Period>('')
  const [fromAccountId, setFromAccountId] = useState('')
  const [toAccountId, setToAccountId] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const columnResize = useResizableColumns('daily.transfer', transferColumns)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<TransferPayload>('/api/daily/transfers')
      setAccounts(payload.accounts)
      setRows(payload.rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายการโอนเงินไม่ได้')
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
      .filter((row) => !dateFrom || row.date >= dateFrom)
      .filter((row) => !dateTo || row.date <= dateTo)
      .filter((row) => !fromAccountId || row.fromAccountId === fromAccountId)
      .filter((row) => !toAccountId || row.toAccountId === toAccountId)
      .filter((row) => !query || `${row.docNo} ${row.notes ?? ''} ${row.byPerson ?? ''}`.toLowerCase().includes(query))
      .sort((left, right) => right.date.localeCompare(left.date) || right.docNo.localeCompare(left.docNo))
  }, [dateFrom, dateTo, fromAccountId, rows, search, toAccountId])

  const totalAmount = filteredRows.reduce((sum, row) => sum + row.amount, 0)
  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const activeAccounts = useMemo(() => accounts.filter((account) => account.active), [accounts])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, fromAccountId, pageSize, period, search, toAccountId])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function applyPeriod(nextPeriod: Period) {
    setPeriod(nextPeriod)
    const today = todayDateInput()
    const start = new Date(`${today}T00:00:00.000Z`)
    if (nextPeriod === 'today') {
      setDateFrom(today)
      setDateTo(today)
    } else if (nextPeriod === 'week') {
      start.setDate(start.getDate() - 6)
      setDateFrom(start.toISOString().slice(0, 10))
      setDateTo(today)
    } else if (nextPeriod === 'month') {
      setDateFrom(`${today.slice(0, 7)}-01`)
      setDateTo(today)
    } else {
      setDateFrom('')
      setDateTo('')
    }
  }

  function clearFilters() {
    setSearch('')
    setFromAccountId('')
    setToAccountId('')
    applyPeriod('')
  }

  function openCreateForm() {
    setForm({ ...emptyForm, date: todayDateInput() })
    setFieldErrors({})
    setMoneyDrafts({})
    setError(null)
    setFormOpen(true)
  }

  function openEditForm(row: TransferRow) {
    setForm({
      amount: row.amount,
      byPerson: row.byPerson,
      date: row.date,
      docNo: row.docNo,
      fee: row.fee,
      fromAccountId: row.fromAccountId,
      id: row.id,
      notes: row.notes,
      toAccountId: row.toAccountId,
    })
    setFieldErrors({})
    setMoneyDrafts({})
    setError(null)
    setFormOpen(true)
  }

  function openDetail(row: TransferRow) {
    setSelectedRow(row)
  }

  function closeDetail() {
    setSelectedRow(null)
  }

  function openEditFromDetail(row: TransferRow) {
    closeDetail()
    openEditForm(row)
  }

  function updateForm<K extends keyof TransferFormValues>(key: K, value: TransferFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  function moneyInputValue(key: string, value: number) {
    if (Object.prototype.hasOwnProperty.call(moneyDrafts, key)) return moneyDrafts[key]
    return value ? formatMoney(value) : ''
  }

  function startMoneyInput(key: string, value: number) {
    setMoneyDrafts((current) => ({ ...current, [key]: value ? String(value) : '' }))
  }

  function changeMoneyInput(key: string, rawValue: string, onValue: (value: number) => void) {
    const nextValue = sanitizeMoneyInput(rawValue)
    setMoneyDrafts((current) => ({ ...current, [key]: nextValue }))
    onValue(parseMoneyInput(nextValue))
  }

  function finishMoneyInput(key: string) {
    setMoneyDrafts((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  async function saveForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = transferFormSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(issueMapFromZodIssues(parsed.error.issues))
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      focusFieldError(firstErrorKeyFromZodIssues(parsed.error.issues))
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/daily/transfers', {
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกรายการโอนเงินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      {error && !formOpen ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input className="h-9 min-w-[260px] flex-1" placeholder="ค้นหาเลขที่ / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />

            {/* Mobile Filter Button */}
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 md:hidden"
              onClick={() => setShowMobileFilters(true)}
            >
              <span className="text-slate-500">🔍</span> ตัวกรอง {(dateFrom || dateTo || fromAccountId || toAccountId) ? '(1)' : ''}
            </button>

            {/* Desktop Filters */}
            <div className="hidden md:flex flex-wrap items-center gap-2">
              <DatePickerInput className="w-[130px]" value={dateFrom} onChange={(value) => { setDateFrom(value); setPeriod('') }} />
              <span className="text-slate-400">→</span>
              <DatePickerInput className="w-[130px]" value={dateTo} onChange={(value) => { setDateTo(value); setPeriod('') }} />
              <select className="h-9 rounded-md border border-slate-300 px-2 py-2 text-sm bg-white" value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}>
                <option value="">ทุกบัญชีต้นทาง</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              <select className="h-9 rounded-md border border-slate-300 px-2 py-2 text-sm bg-white" value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>
                <option value="">ทุกบัญชีปลายทาง</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
              {search || dateFrom || dateTo || fromAccountId || toAccountId ? <Button size="sm" type="button" variant="secondary" onClick={clearFilters}>ล้าง</Button> : null}
            </div>
          </div>
          <Button className="hidden md:inline-flex ml-auto" size="sm" type="button" onClick={openCreateForm}>+ โอนใหม่</Button>
        </div>

        {/* Desktop Period Buttons */}
        <div className="hidden md:flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">ช่วง:</span>
          <PeriodButton active={period === ''} label="ทั้งหมด" tone="slate" onClick={() => applyPeriod('')} />
          <PeriodButton active={period === 'today'} label="วันนี้" tone="blue" onClick={() => applyPeriod('today')} />
          <PeriodButton active={period === 'week'} label="7 วัน" tone="emerald" onClick={() => applyPeriod('week')} />
          <PeriodButton active={period === 'month'} label="เดือนนี้" tone="amber" onClick={() => applyPeriod('month')} />
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 md:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform"
          onClick={openCreateForm}
          type="button"
          aria-label="โอนเงินใหม่"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 md:hidden">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 animate-slide-up max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองเพิ่มเติม</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-xl font-bold"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ช่วงเวลา</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium flex-1 h-11 ${
                      period === '' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => applyPeriod('')}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium flex-1 h-11 ${
                      period === 'today' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => applyPeriod('today')}
                  >
                    วันนี้
                  </button>
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium flex-1 h-11 ${
                      period === 'week' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => applyPeriod('week')}
                  >
                    7 วัน
                  </button>
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium flex-1 h-11 ${
                      period === 'month' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => applyPeriod('month')}
                  >
                    เดือนนี้
                  </button>
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
                <div className="flex items-center gap-2">
                  <DatePickerInput className="flex-1" value={dateFrom} onChange={(value) => { setDateFrom(value); setPeriod('') }} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput className="flex-1" value={dateTo} onChange={(value) => { setDateTo(value); setPeriod('') }} />
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">บัญชีต้นทาง</span>
                <select
                  aria-label="บัญชีต้นทางมือถือ"
                  className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                  value={fromAccountId}
                  onChange={(event) => setFromAccountId(event.target.value)}
                >
                  <option value="">ทุกบัญชีต้นทาง</option>
                  {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">บัญชีปลายทาง</span>
                <select
                  aria-label="บัญชีปลายทางมือถือ"
                  className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                  value={toAccountId}
                  onChange={(event) => setToAccountId(event.target.value)}
                >
                  <option value="">ทุกบัญชีปลายทาง</option>
                  {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  clearFilters()
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                className="h-11 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
          <span className="ml-2 text-slate-500">· รวม <span className="font-semibold text-blue-700">{formatMoney(totalAmount)}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? <Button className="font-normal" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>Set col to default</Button> : null}
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </select>
          <Button className="font-normal" disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <Button className="font-normal" disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <form noValidate className="mx-auto my-4 w-full max-w-3xl overflow-hidden rounded-md bg-white shadow-xl" onSubmit={saveForm}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <h3 className="font-bold text-slate-900">{form.id ? 'แก้ไขรายการโอนเงิน' : 'โอนเงินระหว่างบัญชี'}</h3>
              <button className="text-3xl leading-none text-slate-400 hover:text-slate-700" type="button" onClick={() => setFormOpen(false)}>&times;</button>
            </div>
            {error ? <div className="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <SelectField error={fieldErrors.fromAccountId} label="บัญชีต้นทาง" required value={form.fromAccountId} onChange={(value) => updateForm('fromAccountId', value)} options={activeAccounts} />
              <SelectField error={fieldErrors.toAccountId} label="บัญชีปลายทาง" required value={form.toAccountId} onChange={(value) => updateForm('toAccountId', value)} options={activeAccounts} />
              <MoneyField
                error={fieldErrors.amount}
                inputKey="amount"
                label="จำนวนเงิน"
                required
                value={form.amount}
                valueText={moneyInputValue('amount', form.amount)}
                onChange={(value) => updateForm('amount', value)}
                onChangeMoneyInput={changeMoneyInput}
                onFinishMoneyInput={finishMoneyInput}
                onStartMoneyInput={startMoneyInput}
              />
              <MoneyField
                error={fieldErrors.fee}
                inputKey="fee"
                label="ค่าธรรมเนียม"
                value={form.fee}
                valueText={moneyInputValue('fee', form.fee)}
                onChange={(value) => updateForm('fee', value)}
                onChangeMoneyInput={changeMoneyInput}
                onFinishMoneyInput={finishMoneyInput}
                onStartMoneyInput={startMoneyInput}
              />
              <TextAreaField className="md:col-span-2" error={fieldErrors.notes} label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => updateForm('notes', value)} />
            </div>
            <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 md:grid-cols-3">
              <SummaryBox label="ยอดโอน" value={formatMoney(form.amount)} />
              <SummaryBox label="ค่าธรรมเนียม" value={formatMoney(form.fee)} />
              <SummaryBox label="ยอดออกจากบัญชีต้นทาง" value={formatMoney(form.amount + form.fee)} />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <Button className="font-normal" size="sm" type="button" variant="outline" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
              <Button disabled={isSaving} size="sm" type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
            </div>
          </form>
        </div>
      ) : null}

      {selectedRow ? (
        <Dialog open={true} onOpenChange={(open) => { if (!open) closeDetail() }}>
          <DialogContent className="max-h-[90vh] max-w-3xl !p-0 overflow-hidden flex flex-col bg-slate-900 border-none">
            <DialogHeader className="p-4 bg-slate-900 text-white shrink-0 flex flex-row items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-lg font-bold text-white">รายละเอียดรายการโอนเงิน</DialogTitle>
                <DialogDescription className="mt-1 font-mono text-xs text-slate-400">{selectedRow.docNo}</DialogDescription>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-5 space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-3 bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                <SummaryBox label="ยอดโอน" value={formatMoney(selectedRow.amount)} />
                <SummaryBox label="ค่าธรรมเนียม" value={formatMoney(selectedRow.fee)} />
                <SummaryBox label="ยอดออกจากบัญชีต้นทาง" value={formatMoney(selectedRow.amount + selectedRow.fee)} />
              </div>
              <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
                <DetailItem label="วันที่" value={formatDateDisplay(selectedRow.date)} />
                <DetailItem label="ผู้ทำรายการ" value={selectedRow.byPerson || '-'} />
                <DetailItem label="บัญชีต้นทาง" tone="red" value={selectedRow.fromAccountName} />
                <DetailItem label="บัญชีปลายทาง" tone="emerald" value={selectedRow.toAccountName} />
                <DetailItem className="md:col-span-2" label="หมายเหตุ" value={selectedRow.notes || '-'} />
              </div>
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">ผลกระทบ Bank Statement</div>
                <div className="grid gap-0 text-sm md:grid-cols-2">
                  <div className="border-b border-slate-200 px-4 py-3 md:border-b-0 md:border-r">
                    <div className="text-xs font-medium text-slate-500">เงินออกจากบัญชีต้นทาง</div>
                    <div className="mt-1 font-semibold text-red-700">{selectedRow.fromAccountName}</div>
                    <div className="mt-2 text-right font-mono text-base font-bold text-slate-900">-{formatMoney(selectedRow.amount + selectedRow.fee)}</div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="text-xs font-medium text-slate-500">เงินเข้าบัญชีปลายทาง</div>
                    <div className="mt-1 font-semibold text-emerald-700">{selectedRow.toAccountName}</div>
                    <div className="mt-2 text-right font-mono text-base font-bold text-slate-900">+{formatMoney(selectedRow.amount)}</div>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
              <Button className="font-normal" size="sm" type="button" variant="outline" onClick={closeDetail}>ปิด</Button>
              <Button size="sm" type="button" onClick={() => openEditFromDetail(selectedRow)}>แก้ไข</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Mobile Card List */}
      <div className="block md:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && pagedRows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
            onClick={() => openDetail(row)}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
              <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
            </div>
            <div className="text-xs text-slate-600 mb-3 flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-red-600">{row.fromAccountName}</span>
              <span className="text-slate-400">➡️</span>
              <span className="font-semibold text-emerald-700">{row.toAccountName}</span>
            </div>
            <div className="flex justify-between items-end">
              <div className="text-xs text-slate-500">
                {row.fee > 0 ? (
                  <span>ค่าธรรมเนียม: <span className="font-semibold text-amber-700">{formatMoney(row.fee)}</span></span>
                ) : null}
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">ยอดโอน</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums">{formatMoney(row.amount)}</span>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && pagedRows.length === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">ยังไม่มีรายการ</div>
        ) : null}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <Table className="text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {transferColumns.map((column, index) => {
              const style = columnResize.getColumnStyle(column.key);
              if (index === transferColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />;
              }
              return <col key={column.key} style={style} />;
            })}
          </colgroup>
          <TableHeader>
            <tr>
              <ResizableTableHead label="เลขที่" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} />
              <ResizableTableHead label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
              <ResizableTableHead label="จาก" resizeProps={columnResize.getResizeHandleProps('from', 'จาก')} />
              <ResizableTableHead label="เข้า" resizeProps={columnResize.getResizeHandleProps('to', 'เข้า')} />
              <ResizableTableHead align="right" label="จำนวน" resizeProps={columnResize.getResizeHandleProps('amount', 'จำนวน')} />
              <ResizableTableHead align="right" label="ค่าธรรมเนียม" resizeProps={columnResize.getResizeHandleProps('fee', 'ค่าธรรมเนียม')} />
              <ResizableTableHead label="ผู้ทำรายการ" resizeProps={columnResize.getResizeHandleProps('byPerson', 'ผู้ทำรายการ')} />
              <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'Action')} />
            </tr>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && pagedRows.map((row) => (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-slate-50"
                tabIndex={0}
                onClick={() => openDetail(row)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openDetail(row)
                  }
                }}
              >
                <TableCell className="whitespace-nowrap text-xs font-semibold text-slate-700">{row.docNo}</TableCell>
                <TableCell className="whitespace-nowrap text-xs font-semibold text-slate-700">{formatDateDisplay(row.date)}</TableCell>
                <TableCell className="text-xs font-semibold text-red-600">{row.fromAccountName}</TableCell>
                <TableCell className="text-xs font-semibold text-emerald-700">{row.toAccountName}</TableCell>
                <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.amount)}</TableCell>
                <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-amber-700 tabular-nums">{formatMoney(row.fee)}</TableCell>
                <TableCell className="text-xs font-semibold text-slate-700">{row.byPerson || '-'}</TableCell>
                <TableCell className="space-x-2 whitespace-nowrap text-right">
                  <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={(event) => { event.stopPropagation(); openEditForm(row) }}>แก้ไข</button>
                  <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" disabled type="button" onClick={(event) => event.stopPropagation()}>ยกเลิก</button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && pagedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={8}>ยังไม่มีรายการ</td></tr> : null}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function PeriodButton(props: { active: boolean; label: string; onClick: () => void; tone: 'amber' | 'blue' | 'emerald' | 'slate' }) {
  const activeClass = {
    amber: 'border-amber-600 bg-amber-600 text-white',
    blue: 'border-blue-600 bg-blue-600 text-white',
    emerald: 'border-emerald-600 bg-emerald-600 text-white',
    slate: 'border-slate-700 bg-slate-700 text-white',
  }[props.tone]
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${props.active ? activeClass : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`} type="button" onClick={props.onClick}>{props.label}</button>
}

function sanitizeMoneyInput(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^\d.]/g, '')
  const [whole = '', ...decimalParts] = normalized.split('.')
  if (decimalParts.length === 0) return whole
  return `${whole}.${decimalParts.join('').slice(0, 2)}`
}

function parseMoneyInput(value: string) {
  const parsed = Number(sanitizeMoneyInput(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function SummaryBox(props: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{props.label}</div>
      <div className="mt-1 text-lg font-bold text-slate-900">{props.value}</div>
    </div>
  )
}

function DetailItem(props: { className?: string; label: string; tone?: 'emerald' | 'red'; value: string }) {
  const toneClass = props.tone === 'red' ? 'text-red-700' : props.tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return (
    <div className={props.className}>
      <div className="text-xs font-medium text-slate-500">{props.label}</div>
      <div className={`mt-1 text-sm font-semibold ${toneClass}`}>{props.value}</div>
    </div>
  )
}

function MoneyField(props: {
  error?: string
  inputKey: string
  label: string
  onChange: (value: number) => void
  onChangeMoneyInput: (key: string, rawValue: string, onValue: (value: number) => void) => void
  onFinishMoneyInput: (key: string) => void
  onStartMoneyInput: (key: string, value: number) => void
  required?: boolean
  value: number
  valueText: string
}) {
  return (
    <label className="block text-xs font-medium text-slate-600" data-error-key={props.inputKey}>
      {props.label}{props.required ? <span className="text-red-600"> *</span> : null}
      <Input
        className={`mt-1.5 h-9 text-right tabular-nums ${props.error ? 'border-red-400 bg-red-50' : ''}`}
        inputMode="decimal"
        type="text"
        value={props.valueText}
        onBlur={() => props.onFinishMoneyInput(props.inputKey)}
        onChange={(event) => props.onChangeMoneyInput(props.inputKey, event.target.value, props.onChange)}
        onFocus={() => props.onStartMoneyInput(props.inputKey, props.value)}
      />
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function TextAreaField(props: { className?: string; error?: string; label: string; onChange?: (value: string) => void; required?: boolean; value: string }) {
  return (
    <label className={`block text-xs font-medium text-slate-600 ${props.className ?? ''}`} data-error-key="notes">
      {props.label}{props.required ? <span className="text-red-600"> *</span> : null}
      <textarea
        className={`mt-1.5 min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none ${props.error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
        rows={3}
        value={props.value}
        onChange={(event) => props.onChange?.(event.target.value)}
      />
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function accountOptionLabel(account: DailyAccountOption) {
  return `${account.name} (คงเหลือ ${formatMoney(account.balance ?? 0)})`
}

function SelectField(props: { error?: string; label: string; onChange: (value: string) => void; options: DailyAccountOption[]; required?: boolean; value: string }) {
  const errorKey = props.label === 'บัญชีต้นทาง' ? 'fromAccountId' : 'toAccountId'
  return (
    <label className="block text-xs font-medium text-slate-600" data-error-key={errorKey}>
      {props.label}{props.required ? <span className="text-red-600"> *</span> : null}
      <select className={`mt-1.5 h-9 w-full rounded-md border px-3 py-2 text-sm outline-none ${props.error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">เลือก{props.label}</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{accountOptionLabel(option)}</option>)}
      </select>
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}
