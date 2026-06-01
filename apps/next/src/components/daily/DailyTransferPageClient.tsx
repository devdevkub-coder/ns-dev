'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { dailyFetchJson, formatMoney, todayDateInput, transferFormSchema, type DailyAccountOption, type TransferFormValues } from '@/lib/daily'
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
  const [rows, setRows] = useState<TransferRow[]>([])
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [period, setPeriod] = useState('')
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

  function applyPeriod(nextPeriod: '' | 'month' | 'today' | 'week') {
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
    setFormOpen(true)
  }

  async function saveForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = transferFormSchema.safeParse(form)
    if (!parsed.success) {
      setFieldErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
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
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-9 min-w-[260px] flex-1" placeholder="ค้นหาเลขที่ / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <DatePickerInput className="w-[130px]" value={dateFrom} onChange={(value) => { setDateFrom(value); setPeriod('') }} />
          <span className="text-slate-400">→</span>
          <DatePickerInput className="w-[130px]" value={dateTo} onChange={(value) => { setDateTo(value); setPeriod('') }} />
          <select className="h-9 rounded-md border border-slate-300 px-2 py-2 text-sm" value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)}>
            <option value="">ทุกบัญชีต้นทาง</option>
            {accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <select className="h-9 rounded-md border border-slate-300 px-2 py-2 text-sm" value={toAccountId} onChange={(event) => setToAccountId(event.target.value)}>
            <option value="">ทุกบัญชีปลายทาง</option>
            {accounts.filter((account) => account.active).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
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
          <span className="ml-auto text-xs text-slate-500">พบ <b className="text-slate-700">{filteredRows.length}</b> รายการ · รวม <b className="text-blue-700">{formatMoney(totalAmount)}</b></span>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <form noValidate className="w-full max-w-2xl overflow-hidden rounded-md bg-white shadow-xl" onSubmit={saveForm}>
            <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-4">
              <h3 className="font-bold">{form.id ? 'แก้ไขรายการโอนเงิน' : 'โอนเงินระหว่างบัญชี'}</h3>
              <button className="text-2xl text-slate-400" type="button" onClick={() => setFormOpen(false)}>&times;</button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <TextField label="เลขที่" readOnly value={form.docNo ?? 'ระบบจะออกเลขให้'} />
              <TextField error={fieldErrors.date} label="วันที่" required type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
              <SelectField error={fieldErrors.fromAccountId} label="จากบัญชี" required value={form.fromAccountId} onChange={(value) => setForm({ ...form, fromAccountId: value })} options={accounts.filter((account) => account.active)} />
              <SelectField error={fieldErrors.toAccountId} label="เข้าบัญชี" required value={form.toAccountId} onChange={(value) => setForm({ ...form, toAccountId: value })} options={accounts.filter((account) => account.active)} />
              <TextField error={fieldErrors.amount} label="จำนวน" required type="number" value={String(form.amount)} onChange={(value) => setForm({ ...form, amount: Number(value) })} />
              <TextField error={fieldErrors.fee} label="ค่าธรรมเนียม" type="number" value={String(form.fee)} onChange={(value) => setForm({ ...form, fee: Number(value) })} />
              <TextField error={fieldErrors.byPerson} label="ผู้ทำรายการ" value={form.byPerson ?? ''} onChange={(value) => setForm({ ...form, byPerson: value })} />
              <TextField error={fieldErrors.notes} label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => setForm({ ...form, notes: value })} />
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-4">
              <Button size="sm" type="button" variant="ghost" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
              <Button disabled={isSaving} size="sm" type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
            </div>
          </form>
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
            <TableHead>ผู้ทำ</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && filteredRows.map((row) => (
            <TableRow key={row.id} className="hover:bg-slate-50">
              <TableCell className="font-mono text-xs">{row.docNo}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateDisplay(row.date)}</TableCell>
              <TableCell className="text-red-600">{row.fromAccountName}</TableCell>
              <TableCell className="text-emerald-700">{row.toAccountName}</TableCell>
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">{formatMoney(row.amount)}</TableCell>
              <TableCell className="whitespace-nowrap text-right text-amber-700 tabular-nums">{formatMoney(row.fee)}</TableCell>
              <TableCell>{row.byPerson || '-'}</TableCell>
              <TableCell className="space-x-2 whitespace-nowrap text-right">
                <Button size="xs" type="button" variant="outline" onClick={() => openEditForm(row)}>จัดการ</Button>
                <button className="text-xs text-red-300" disabled type="button">ลบ</button>
              </TableCell>
            </TableRow>
          ))}
          {!isLoading && filteredRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={8}>ยังไม่มีรายการ</td></tr> : null}
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

function TextField(props: { error?: string; label: string; onChange?: (value: string) => void; readOnly?: boolean; required?: boolean; type?: string; value: string }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {props.label}{props.required ? <span className="text-red-600"> *</span> : null}
      {props.type === 'date'
        ? <DatePickerInput className="mt-1.5 w-full" readOnly={props.readOnly} required={props.required} value={props.value} onChange={(value) => props.onChange?.(value)} />
        : <Input className={`mt-1.5 h-9 ${props.error ? 'border-red-400 bg-red-50' : ''} ${props.readOnly ? 'bg-slate-50' : ''}`} readOnly={props.readOnly} type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange?.(event.target.value)} />}
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function SelectField(props: { error?: string; label: string; onChange: (value: string) => void; options: DailyAccountOption[]; required?: boolean; value: string }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {props.label}{props.required ? <span className="text-red-600"> *</span> : null}
      <select className={`mt-1.5 h-9 w-full rounded-md border px-3 py-2 text-sm outline-none ${props.error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} value={props.value} onChange={(event) => props.onChange(event.target.value)}>
        <option value="">ไม่ระบุ</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}
