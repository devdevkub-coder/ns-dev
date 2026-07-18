'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
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
type TransferColumnKey = 'index' | 'action' | 'amount' | 'byPerson' | 'date' | 'docNo' | 'fee' | 'from' | 'to' | 'notes'
type Period = '' | 'month' | 'today' | 'week'
type SortKey = 'docNo' | 'date' | 'from' | 'to' | 'amount' | 'fee' | 'byPerson' | 'notes'

const pageSizeOptions = [10, 25, 50, 100]
const transferColumns: Array<ResizableColumnDefinition<TransferColumnKey>> = [
  { key: 'index', defaultWidth: 70, minWidth: 50 },
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'from', defaultWidth: 240, minWidth: 150 },
  { key: 'to', defaultWidth: 240, minWidth: 150 },
  { key: 'amount', defaultWidth: 130, minWidth: 110 },
  { key: 'fee', defaultWidth: 130, minWidth: 110 },
  { key: 'byPerson', defaultWidth: 180, minWidth: 140 },
  { key: 'notes', defaultWidth: 240, minWidth: 160 },
  { key: 'action', defaultWidth: 180, minWidth: 150 },
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
  const columnResize = useResizableColumns('daily.transfer.v6', transferColumns)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const changeSort = useCallback((nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'date' || nextKey === 'amount' || nextKey === 'fee' ? 'desc' : 'asc')
  }, [sortKey])

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
      .sort((left, right) => {
        let leftValue: string | number = ''
        let rightValue: string | number = ''

        if (sortKey === 'docNo') {
          leftValue = left.docNo || ''
          rightValue = right.docNo || ''
        } else if (sortKey === 'date') {
          leftValue = left.date || ''
          rightValue = right.date || ''
        } else if (sortKey === 'from') {
          leftValue = left.fromAccountName || ''
          rightValue = right.fromAccountName || ''
        } else if (sortKey === 'to') {
          leftValue = left.toAccountName || ''
          rightValue = right.toAccountName || ''
        } else if (sortKey === 'amount') {
          leftValue = left.amount || 0
          rightValue = right.amount || 0
        } else if (sortKey === 'fee') {
          leftValue = left.fee || 0
          rightValue = right.fee || 0
        } else if (sortKey === 'byPerson') {
          leftValue = left.byPerson || ''
          rightValue = right.byPerson || ''
        } else if (sortKey === 'notes') {
          leftValue = left.notes || ''
          rightValue = right.notes || ''
        }

        let comparison = 0
        if (typeof leftValue === 'number' && typeof rightValue === 'number') {
          comparison = leftValue - rightValue
        } else {
          comparison = String(leftValue).localeCompare(String(rightValue))
        }

        if (comparison === 0) {
          comparison = (left.docNo || '').localeCompare(right.docNo || '')
        }

        return sortDirection === 'asc' ? comparison : -comparison
      })
  }, [dateFrom, dateTo, fromAccountId, rows, search, toAccountId, sortKey, sortDirection])

  const totalAmount = filteredRows.reduce((sum, row) => sum + row.amount, 0)
  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const activeAccounts = useMemo(() => accounts.filter((account) => account.active), [accounts])
  const activeMobileFilterCount = [dateFrom || dateTo, fromAccountId, toAccountId].filter(Boolean).length

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

      <div className="space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <Input className="h-9 min-w-[260px] flex-1" placeholder="ค้นหาเลขที่ TRF / ผู้ทำรายการ / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />

            {/* Mobile Filter Button */}
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:hidden"
              onClick={() => setShowMobileFilters(true)}
            >
              ตัวกรอง{activeMobileFilterCount ? ` (${activeMobileFilterCount})` : ''}
            </button>

            {/* Desktop Filters */}
            <div className="hidden lg:flex flex-wrap items-center gap-2">
              <DatePickerInput className="w-[130px]" value={dateFrom} onChange={(value) => { setDateFrom(value); setPeriod('') }} />
              <span className="text-slate-400">→</span>
              <DatePickerInput className="w-[130px]" value={dateTo} onChange={(value) => { setDateTo(value); setPeriod('') }} />
              <Select className="h-9 w-auto" value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}>
                <option value="">ทุกบัญชีต้นทาง</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </Select>
              <Select className="h-9 w-auto" value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>
                <option value="">ทุกบัญชีปลายทาง</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </Select>
              {search || dateFrom || dateTo || fromAccountId || toAccountId ? <Button size="sm" type="button" variant="secondary" onClick={clearFilters}>ล้างตัวกรอง</Button> : null}
            </div>
          </div>
        </div>

        {/* Desktop Period Buttons */}
        <div className="hidden lg:flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">ช่วงเวลา:</span>
          <PeriodButton active={period === ''} label="ทั้งหมด" onClick={() => applyPeriod('')} />
          <PeriodButton active={period === 'today'} label="วันนี้" onClick={() => applyPeriod('today')} />
          <PeriodButton active={period === 'week'} label="7 วัน" onClick={() => applyPeriod('week')} />
          <PeriodButton active={period === 'month'} label="เดือนนี้" onClick={() => applyPeriod('month')} />
          <Button className="ml-auto" size="sm" type="button" onClick={openCreateForm}>+ โอนเงินใหม่</Button>
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden">
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
        <MobileFilterSheet
          title="ตัวกรองเพิ่มเติม"
          onClose={() => setShowMobileFilters(false)}
          footer={(
            <>
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
            </>
          )}
        >
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
                <Select
                  aria-label="บัญชีต้นทางมือถือ"
                  className="h-9 w-full"
                  value={fromAccountId}
                  onChange={(event) => setFromAccountId(event.target.value)}
                >
                  <option value="">ทุกบัญชีต้นทาง</option>
                  {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </Select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">บัญชีปลายทาง</span>
                <Select
                  aria-label="บัญชีปลายทางมือถือ"
                  className="h-9 w-full"
                  value={toAccountId}
                  onChange={(event) => setToAccountId(event.target.value)}
                >
                  <option value="">ทุกบัญชีปลายทาง</option>
                  {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </Select>
              </label>
        </MobileFilterSheet>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
          <span className="ml-2 text-slate-500">· ยอดโอนรวม <span className="font-semibold text-slate-900">{formatMoney(totalAmount)}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? <Button className="font-normal" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
          <PageSizeDropdown options={pageSizeOptions} value={pageSize} onChange={setPageSize} />
          <Button className="font-normal" disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <Button className="font-normal" disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <form noValidate className="mx-auto my-4 w-full max-w-3xl overflow-hidden rounded-md bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-150" onSubmit={saveForm}>
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4 text-white">
              <h3 className="font-bold text-white">{form.id ? 'แก้ไขรายการโอนเงิน' : 'โอนเงินระหว่างบัญชี'}</h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" size="sm" type="button" variant="outline" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
                <Button className="h-9 bg-emerald-600 font-medium text-white hover:bg-emerald-700" disabled={isSaving} size="sm" type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
              </div>
            </div>
            {error ? <div className="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-5">
              <div className="col-span-2 sm:col-span-1">
                <SelectField error={fieldErrors.fromAccountId} label="บัญชีต้นทาง" required value={form.fromAccountId} onChange={(value) => updateForm('fromAccountId', value)} options={activeAccounts} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <SelectField error={fieldErrors.toAccountId} label="บัญชีปลายทาง" required value={form.toAccountId} onChange={(value) => updateForm('toAccountId', value)} options={activeAccounts} />
              </div>
              <div className="col-span-2 sm:col-span-1">
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
              </div>
              <div className="col-span-2 sm:col-span-1">
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
              </div>
              <TextAreaField className="col-span-2" error={fieldErrors.notes} label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => updateForm('notes', value)} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4">
              <SummaryBox label="ยอดโอน" value={formatMoney(form.amount)} />
              <SummaryBox label="ค่าธรรมเนียม" value={formatMoney(form.fee)} />
              <div className="col-span-2 sm:col-span-1">
                <SummaryBox label="ยอดออกจากบัญชีต้นทาง" value={formatMoney(form.amount + form.fee)} />
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {selectedRow ? (
        <Dialog open={true} onOpenChange={(open) => { if (!open) closeDetail() }}>
          <DialogContent className="max-h-[90vh] max-w-3xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none" hideClose>
            <DialogHeader className="p-4 bg-slate-900 text-white rounded-t-md shrink-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <DialogTitle className="truncate text-lg font-bold text-white">รายละเอียด {selectedRow.docNo}</DialogTitle>
                  <DialogDescription className="mt-1 truncate text-xs text-slate-300">{selectedRow.fromAccountName} → {selectedRow.toAccountName}</DialogDescription>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button className="h-9 border-slate-700 bg-slate-800 font-normal text-white hover:bg-slate-700 hover:text-white" size="sm" type="button" variant="outline" onClick={() => openEditFromDetail(selectedRow)}>แก้ไข</Button>
                  <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" size="sm" type="button" variant="outline" onClick={closeDetail}>ปิด</Button>
                </div>
              </div>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-5 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 sm:grid-cols-3 text-sm">
                <SummaryBox label="ยอดโอน" value={formatMoney(selectedRow.amount)} />
                <SummaryBox label="ค่าธรรมเนียม" value={formatMoney(selectedRow.fee)} />
                <div className="col-span-2 sm:col-span-1">
                  <SummaryBox label="ยอดออกจากบัญชีต้นทาง" value={formatMoney(selectedRow.amount + selectedRow.fee)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="col-span-2 sm:col-span-1">
                  <DetailItem label="วันที่" value={formatDateDisplay(selectedRow.date)} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <DetailItem label="ผู้ทำรายการ" value={selectedRow.byPerson || '-'} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <DetailItem label="บัญชีต้นทาง" tone="red" value={selectedRow.fromAccountName} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <DetailItem label="บัญชีปลายทาง" tone="emerald" value={selectedRow.toAccountName} />
                </div>
                <DetailItem className="col-span-2" label="หมายเหตุ" value={selectedRow.notes || '-'} />
              </div>
              <div className="rounded-md border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">ผลกระทบ Bank Statement</div>
                <div className="grid grid-cols-2 gap-0 text-sm">
                  <div className="border-r border-slate-100 px-4 py-3">
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
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Mobile Card List */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && pagedRows.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
            onClick={() => openDetail(row)}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
              <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
            </div>
            <div className="text-xs text-slate-600 mb-3 flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-red-600">{row.fromAccountName}</span>
              <span className="text-slate-400">→</span>
              <span className="font-semibold text-emerald-700">{row.toAccountName}</span>
            </div>
            {row.notes ? (
              <div className="mb-3 text-xs text-slate-600">
                <span className="font-medium text-slate-500">หมายเหตุ: </span>{row.notes}
              </div>
            ) : null}
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
          <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">ยังไม่มีรายการ</div>
        ) : null}
      </div>

      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <Table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {transferColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <TableHeader>
            <tr>
              <ResizableTableHead label="ลำดับ" resizeProps={columnResize.getResizeHandleProps('index', 'ลำดับ')} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เลขที่ TRF" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่ TRF')} sortKey="docNo" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="วันที่โอน" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่โอน')} sortKey="date" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="บัญชีต้นทาง" resizeProps={columnResize.getResizeHandleProps('from', 'บัญชีต้นทาง')} sortKey="from" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="บัญชีปลายทาง" resizeProps={columnResize.getResizeHandleProps('to', 'บัญชีปลายทาง')} sortKey="to" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} align="right" label="ยอดโอน" resizeProps={columnResize.getResizeHandleProps('amount', 'ยอดโอน')} sortKey="amount" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} align="right" label="ค่าธรรมเนียม" resizeProps={columnResize.getResizeHandleProps('fee', 'ค่าธรรมเนียม')} sortKey="fee" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ผู้ทำรายการ" resizeProps={columnResize.getResizeHandleProps('byPerson', 'ผู้ทำรายการ')} sortKey="byPerson" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="หมายเหตุ" resizeProps={columnResize.getResizeHandleProps('notes', 'หมายเหตุ')} sortKey="notes" onSort={changeSort} />
              <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'Action')} />
            </tr>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100">
            {isLoading ? <TableRow><td className="p-8 text-center text-slate-500" colSpan={transferColumns.length}>กำลังโหลดข้อมูล</td></TableRow> : null}
            {!isLoading && pagedRows.map((row, index) => (
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
                <TableCell className="whitespace-nowrap text-xs font-semibold text-slate-500 font-mono text-left">{(currentPage - 1) * pageSize + index + 1}</TableCell>
                <TableCell className="whitespace-nowrap text-xs font-semibold text-slate-700">{row.docNo}</TableCell>
                <TableCell className="whitespace-nowrap text-xs font-semibold text-slate-700">{formatDateDisplay(row.date)}</TableCell>
                <TableCell className="text-xs font-semibold text-red-600">{row.fromAccountName}</TableCell>
                <TableCell className="text-xs font-semibold text-emerald-700">{row.toAccountName}</TableCell>
                <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.amount)}</TableCell>
                <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-amber-700 tabular-nums">{formatMoney(row.fee)}</TableCell>
                <TableCell className="text-xs font-semibold text-slate-700">{row.byPerson || '-'}</TableCell>
                <TableCell className="text-xs font-semibold text-slate-700 truncate max-w-[200px]" title={row.notes ?? ''}>{row.notes || '-'}</TableCell>
                <TableCell className="space-x-2 whitespace-nowrap text-right">
                  <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={(event) => { event.stopPropagation(); openEditForm(row) }}>แก้ไข</button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && pagedRows.length === 0 ? <TableRow><td className="p-8 text-center text-slate-400" colSpan={transferColumns.length}>ยังไม่มีรายการ</td></TableRow> : null}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function PeriodButton(props: { active: boolean; label: string; onClick: () => void }) {
  const activeClass = 'border-slate-700 bg-slate-700 text-white'
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
  const isZero = !props.value || props.value === '0' || props.value === '0.00' || parseFloat(props.value.replace(/[^0-9.-]/g, '')) === 0;

  let cardClass = 'bg-white border-slate-200 shadow-sm rounded-xl';
  let labelClass = 'text-slate-500';
  let valueClass = 'text-slate-900';

  if (isZero) {
    cardClass = 'bg-slate-50 border-slate-200/60 shadow-sm rounded-xl';
    labelClass = 'text-slate-400';
    valueClass = 'text-slate-400';
  }

  return (
    <div className={`border p-3 sm:p-4 transition-all ${cardClass}`}>
      <div className={`text-xs font-semibold ${labelClass}`}>{props.label}</div>
      <div className={`mt-1 text-sm sm:text-base font-bold tabular-nums ${valueClass}`}>{props.value}</div>
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
        aria-invalid={Boolean(props.error)}
        className={`mt-1.5 h-9 text-right tabular-nums ${props.error ? 'border-red-400 bg-red-50' : ''}`}
        inputMode="decimal"
        required={props.required}
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
        aria-invalid={Boolean(props.error)}
        className={`mt-1.5 min-h-20 w-full rounded-md border px-3 py-2 text-sm outline-none ${props.error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
        required={props.required}
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
      <Select aria-invalid={Boolean(props.error)} className="mt-1.5 h-10 w-full" required={props.required} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option disabled value="">เลือก{props.label}</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{accountOptionLabel(option)}</option>)}
      </Select>
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}
