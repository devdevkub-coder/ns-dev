'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
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
type Period = '' | 'month' | 'today' | 'week'

const pageSizeOptions = [10, 25, 50, 100]

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
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-9 min-w-[260px] flex-1" placeholder="ค้นหาเลขที่ / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <DatePickerInput className="w-[130px]" value={dateFrom} onChange={(value) => { setDateFrom(value); setPeriod('') }} />
          <span className="text-slate-400">→</span>
          <DatePickerInput className="w-[130px]" value={dateTo} onChange={(value) => { setDateTo(value); setPeriod('') }} />
          <select className="h-9 rounded-md border border-slate-300 px-2 py-2 text-sm" value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}>
            <option value="">ทุกบัญชีต้นทาง</option>
            {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <select className="h-9 rounded-md border border-slate-300 px-2 py-2 text-sm" value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>
            <option value="">ทุกบัญชีปลายทาง</option>
            {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          {search || dateFrom || dateTo || fromAccountId || toAccountId ? <Button size="sm" type="button" variant="secondary" onClick={clearFilters}>ล้าง</Button> : null}
          <Button className="ml-auto" size="sm" type="button" onClick={openCreateForm}>+ โอนใหม่</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">ช่วง:</span>
          <PeriodButton active={period === ''} label="ทั้งหมด" tone="slate" onClick={() => applyPeriod('')} />
          <PeriodButton active={period === 'today'} label="วันนี้" tone="blue" onClick={() => applyPeriod('today')} />
          <PeriodButton active={period === 'week'} label="7 วัน" tone="emerald" onClick={() => applyPeriod('week')} />
          <PeriodButton active={period === 'month'} label="เดือนนี้" tone="amber" onClick={() => applyPeriod('month')} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
          <span className="ml-2 text-slate-500">· รวม <span className="font-semibold text-blue-700">{formatMoney(totalAmount)}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
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
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-4">
              <Button className="font-normal" size="sm" type="button" variant="outline" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
              <Button disabled={isSaving} size="sm" type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
            </div>
          </form>
        </div>
      ) : null}

      {selectedRow ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <div className="mx-auto my-4 w-full max-w-3xl overflow-hidden rounded-md bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4">
              <div>
                <h3 className="font-bold text-slate-900">รายละเอียดรายการโอนเงิน</h3>
                <p className="mt-1 font-mono text-xs text-slate-500">{selectedRow.docNo}</p>
              </div>
              <button className="text-3xl leading-none text-slate-400 hover:text-slate-700" type="button" onClick={closeDetail}>&times;</button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <SummaryBox label="ยอดโอน" value={formatMoney(selectedRow.amount)} />
                <SummaryBox label="ค่าธรรมเนียม" value={formatMoney(selectedRow.fee)} />
                <SummaryBox label="ยอดออกจากบัญชีต้นทาง" value={formatMoney(selectedRow.amount + selectedRow.fee)} />
              </div>
              <div className="grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                <DetailItem label="วันที่" value={formatDateDisplay(selectedRow.date)} />
                <DetailItem label="ผู้ทำรายการ" value={selectedRow.byPerson || '-'} />
                <DetailItem label="บัญชีต้นทาง" tone="red" value={selectedRow.fromAccountName} />
                <DetailItem label="บัญชีปลายทาง" tone="emerald" value={selectedRow.toAccountName} />
                <DetailItem className="md:col-span-2" label="หมายเหตุ" value={selectedRow.notes || '-'} />
              </div>
              <div className="rounded-md border border-slate-200">
                <div className="border-b bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">ผลกระทบ Bank Statement</div>
                <div className="grid gap-0 text-sm md:grid-cols-2">
                  <div className="border-b px-4 py-3 md:border-b-0 md:border-r">
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
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-4">
              <Button className="font-normal" size="sm" type="button" variant="outline" onClick={closeDetail}>ปิด</Button>
              <Button size="sm" type="button" onClick={() => openEditFromDetail(selectedRow)}>แก้ไข</Button>
            </div>
          </div>
        </div>
      ) : null}

      <Table>
        <TableHeader>
          <tr>
            <TableHead>เลขที่</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>จาก</TableHead>
            <TableHead>เข้า</TableHead>
            <TableHead className="text-right">จำนวน</TableHead>
            <TableHead className="text-right">ค่าธรรมเนียม</TableHead>
            <TableHead>ผู้ทำรายการ</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
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
              <TableCell className="font-mono text-xs">{row.docNo}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateDisplay(row.date)}</TableCell>
              <TableCell className="text-red-600">{row.fromAccountName}</TableCell>
              <TableCell className="text-emerald-700">{row.toAccountName}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatMoney(row.amount)}</TableCell>
              <TableCell className="whitespace-nowrap text-right text-amber-700 tabular-nums">{formatMoney(row.fee)}</TableCell>
              <TableCell>{row.byPerson || '-'}</TableCell>
              <TableCell className="space-x-2 whitespace-nowrap text-right">
                <Button size="xs" type="button" variant="outline" onClick={(event) => { event.stopPropagation(); openEditForm(row) }}>แก้ไข</Button>
                <button className="text-xs text-red-300" disabled type="button" onClick={(event) => event.stopPropagation()}>ยกเลิก</button>
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && pagedRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={8}>ยังไม่มีรายการ</td></tr> : null}
        </TableBody>
      </Table>
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
