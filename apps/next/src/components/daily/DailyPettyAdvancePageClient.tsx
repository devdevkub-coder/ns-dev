'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ApiError } from '@/lib/api-client'
import { dailyFetchJson, formatMoney, pettyAdvanceFormSchema, pettyAdvanceReturnFormSchema, todayDateInput, type DailyAccountOption, type PettyAdvanceFormValues } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type PettyAdvanceRow = PettyAdvanceFormValues & {
  accountName: string
  docNo: string
  id: string
  pendingReturn: number
  remaining: number
  recipientAccountLabel: string
  recipientAccountNo: string
  recipientBankAccountName: string
  recipientBankBranch: string
  recipientBankName: string
  returns?: PettyReturnRow[]
  returned: number
  spent: number
}

type PettyReturnRow = {
  accountId: string
  accountName: string
  amount: number
  date: string
  id: string
  notes: string
}

type PettyPayload = {
  accounts: DailyAccountOption[]
  recipientOptions: PettyAdvanceRecipientOption[]
  rows: PettyAdvanceRow[]
}
type PettyAdvanceRecipientOption = SearchComboboxOption & {
  accountNo: string
  bankAccountLabel: string
  bankAccountName: string
  bankBranch: string
  bankName: string
  type: string
}
type PettyAdvanceColumnKey = 'action' | 'amount' | 'date' | 'docNo' | 'recipientName' | 'remaining' | 'returned' | 'spent' | 'status' | 'type'
type PettyAdvanceSortKey = Exclude<PettyAdvanceColumnKey, 'action'>
type SortDirection = 'asc' | 'desc'

const pettyAdvanceColumns: Array<ResizableColumnDefinition<PettyAdvanceColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'type', defaultWidth: 150, minWidth: 120 },
  { key: 'recipientName', defaultWidth: 260, minWidth: 130 },
  { key: 'amount', defaultWidth: 110, minWidth: 90 },
  { key: 'spent', defaultWidth: 110, minWidth: 90 },
  { key: 'returned', defaultWidth: 110, minWidth: 90 },
  { key: 'remaining', defaultWidth: 110, minWidth: 90 },
  { key: 'status', defaultWidth: 120, minWidth: 100 },
  { key: 'action', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

const emptyForm: PettyAdvanceFormValues = {
  accountId: '',
  amount: 0,
  date: todayDateInput(),
  docNo: null,
  id: null,
  notes: null,
  recipientId: '',
  recipientName: '',
  status: 'active',
  type: 'DIRECTOR_LOAN',
}

function flattenApiFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
  return Object.fromEntries(Object.entries(fieldErrors).map(([key, value]) => [key, value?.[0] ?? 'ข้อมูลไม่ถูกต้อง']))
}

function sanitizeMoneyDraft(value: string) {
  const cleaned = value.replace(/[^\d.]/g, '')
  const [integerPart, ...decimalParts] = cleaned.split('.')
  if (!decimalParts.length) return integerPart
  return `${integerPart}.${decimalParts.join('').slice(0, 2)}`
}

function formatMoneyInput(value: number) {
  return value > 0 ? value.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) : ''
}

function typeLabel(value: PettyAdvanceFormValues['type']) {
  return value === 'DIRECTOR_LOAN' ? 'กู้กรรมการ' : 'เงินสำรองจ่าย'
}

function compareSortValues(left: string | number, right: string | number) {
  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), 'th', { numeric: true })
}

function getPettyAdvanceSortValue(row: PettyAdvanceRow, key: PettyAdvanceSortKey) {
  if (key === 'type') return typeLabel(row.type)
  return row[key]
}

export function DailyPettyAdvancePageClient() {
  const [accounts, setAccounts] = useState<DailyAccountOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<PettyAdvanceFormValues>(emptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [detailRow, setDetailRow] = useState<PettyAdvanceRow | null>(null)
  const [returnForm, setReturnForm] = useState({ accountId: '', amount: '', date: todayDateInput(), notes: '' })
  const [returningRow, setReturningRow] = useState<PettyAdvanceRow | null>(null)
  const [recipientOptions, setRecipientOptions] = useState<PettyAdvanceRecipientOption[]>([])
  const [rows, setRows] = useState<PettyAdvanceRow[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('active')
  const [type, setType] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortKey, setSortKey] = useState<PettyAdvanceSortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  useEffect(() => {
    setPage(1)
  }, [search, status, type])
  const formRef = useRef<HTMLFormElement>(null)
  const columnResize = useResizableColumns('daily.petty-advance.v5', pettyAdvanceColumns)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<PettyPayload>('/api/daily/petty-advances')
      setAccounts(payload.accounts)
      setRecipientOptions(payload.recipientOptions ?? [])
      setRows(payload.rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดเงินสำรองจ่ายไม่ได้')
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
      .filter((row) => !status || row.status === status)
      .filter((row) => !type || row.type === type)
      .filter((row) => !query || `${row.docNo} ${row.recipientName} ${row.notes ?? ''}`.toLowerCase().includes(query))
  }, [rows, search, status, type])

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((left, right) => {
      if (!sortKey) return right.date.localeCompare(left.date) || right.docNo.localeCompare(left.docNo)

      const result = compareSortValues(getPettyAdvanceSortValue(left, sortKey), getPettyAdvanceSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [filteredRows, sortDirection, sortKey])

  const totalRows = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const summary = {
    active: rows.filter((row) => row.status === 'active').length,
    count: rows.filter((row) => row.status !== 'cancelled').length,
    remaining: rows.filter((row) => row.status === 'active').reduce((sum, row) => sum + row.remaining, 0),
    returned: rows.reduce((sum, row) => sum + row.returned, 0),
    spent: rows.reduce((sum, row) => sum + row.spent, 0),
    total: rows.reduce((sum, row) => sum + row.amount, 0),
  }

  const topRecipients = useMemo(() => {
    const byRecipient = new Map<string, { active: number; count: number; name: string; remaining: number; total: number }>()
    rows.filter((row) => row.status !== 'cancelled').forEach((row) => {
      const current = byRecipient.get(row.recipientName) ?? { active: 0, count: 0, name: row.recipientName, remaining: 0, total: 0 }
      current.count += 1
      current.total += row.amount
      if (row.status === 'active') {
        current.active += 1
        current.remaining += row.remaining
      }
      byRecipient.set(row.recipientName, current)
    })
    return Array.from(byRecipient.values()).sort((left, right) => right.remaining - left.remaining).slice(0, 10)
  }, [rows])


  const activeAccounts = useMemo(() => accounts.filter((account) => account.active), [accounts])
  const hasActiveFilters = Boolean(search.trim() || type || status !== 'active')

  function handleSort(key: PettyAdvanceSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  function focusFirstField(field: string) {
    requestAnimationFrame(() => {
      const container = formRef.current?.querySelector<HTMLElement>(`[data-field="${field}"], [data-error-key="${field}"]`)
      container?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const target = container?.querySelector<HTMLElement>('input, select, textarea, button')
      target?.focus()
    })
  }

  function updateRecipient(recipientId: string) {
    const recipient = recipientOptions.find((option) => option.id === recipientId) ?? null
    setForm((current) => ({
      ...current,
      recipientId,
      recipientName: recipient?.label ?? '',
    }))
  }

  function openCreateForm() {
    setForm({ ...emptyForm, date: todayDateInput(), recipientId: '' })
    setFieldErrors({})
    setFormOpen(true)
  }

  function openEditForm(row: PettyAdvanceRow) {
    setForm({
      accountId: '',
      amount: row.amount,
      date: row.date,
      docNo: row.docNo,
      id: row.id,
      notes: row.notes,
      recipientId: row.recipientId,
      recipientName: row.recipientName,
      status: row.status,
      type: row.type,
    })
    setFieldErrors({})
    setFormOpen(true)
  }

  function openReturnForm(row: PettyAdvanceRow) {
    setDetailRow(null)
    setReturningRow(row)
    const defaultAccountId = row.accountId ?? activeAccounts[0]?.id ?? ''
    setReturnForm({ accountId: defaultAccountId, amount: String(Math.max(0, row.remaining)), date: todayDateInput(), notes: '' })
  }

  async function saveForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = pettyAdvanceFormSchema.safeParse(form)
    if (!parsed.success) {
      const nextFieldErrors = Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message]))
      setFieldErrors(nextFieldErrors)
      const firstField = parsed.error.issues[0]?.path[0]
      if (firstField) focusFirstField(String(firstField))
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/daily/petty-advances', {
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
        const nextFieldErrors = flattenApiFieldErrors(caught.fieldErrors)
        setFieldErrors(nextFieldErrors)
        const firstField = Object.keys(nextFieldErrors)[0]
        if (firstField) focusFirstField(firstField)
      }
      setError(caught instanceof Error ? caught.message : 'บันทึกเงินสำรองจ่ายไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function saveReturn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!returningRow) return
    const parsed = pettyAdvanceReturnFormSchema.safeParse({
      accountId: returnForm.accountId,
      advanceId: returningRow.id,
      amount: Number(returnForm.amount),
      date: returnForm.date,
      notes: returnForm.notes || null,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลคืนเงินไม่ถูกต้อง')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/daily/petty-advances/returns', {
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
      setReturningRow(null)
      setReturnForm({ accountId: '', amount: '', date: todayDateInput(), notes: '' })
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกคืนเงินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4 text-sm">
        <SummaryCard label="ค้างคืน" tone="amber" value={String(summary.active)} />
        <SummaryCard label="ยอดยืมทั้งหมด" tone="blue" value={formatMoney(summary.total)} />
        <SummaryCard label="ใช้จ่าย/คืนแล้ว" tone="emerald" value={formatMoney(summary.spent + summary.returned)} />
        <SummaryCard label="ยอดคงค้าง" tone="red" value={formatMoney(summary.remaining)} />
      </div>

      {topRecipients.length ? (
        <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
          <div className="mb-2 font-bold text-slate-700">Top 10 ผู้รับเงินที่ค้างคืน</div>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            {topRecipients.map((recipient) => (
              <div key={recipient.name} className="flex justify-between rounded-md border border-slate-100 bg-slate-50 p-2">
                <div><b>{recipient.name}</b> · <span className="text-xs text-slate-500">{recipient.count} ครั้ง</span></div>
                <div className={recipient.remaining > 0 ? 'font-bold text-red-700' : 'text-emerald-600'}>{formatMoney(recipient.remaining)} ค้าง</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <input autoComplete="off" className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-100" placeholder="ค้นหาเลขที่ / ผู้รับเงิน / หมายเหตุ" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />

          {/* Mobile Filter Button */}
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:hidden"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {(type || status !== 'active') ? '(1)' : ''}
          </button>

          {hasActiveFilters ? (
            <button className="h-9 rounded-md border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={() => { setSearch(''); setType(''); setStatus('active') }}>
              ล้าง filter
            </button>
          ) : null}
        </div>

        {/* Desktop Filters */}
        <div className="mt-3 space-y-2 hidden lg:block">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 w-14 inline-block shrink-0">ประเภท:</span>
            <SegmentFilterButton active={!type} label="ทุกประเภท" onClick={() => setType('')} />
            <SegmentFilterButton active={type === 'DIRECTOR_LOAN'} label="กู้กรรมการ" onClick={() => setType(type === 'DIRECTOR_LOAN' ? '' : 'DIRECTOR_LOAN')} />
            <SegmentFilterButton active={type === 'PETTY_CASH'} label="เงินสำรองจ่าย" onClick={() => setType(type === 'PETTY_CASH' ? '' : 'PETTY_CASH')} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500 w-14 inline-block shrink-0">สถานะ:</span>
            <SegmentFilterButton active={!status} label="ทั้งหมด" onClick={() => setStatus('')} />
            <SegmentFilterButton active={status === 'active'} label="ค้างคืน" onClick={() => setStatus(status === 'active' ? '' : 'active')} />
            <SegmentFilterButton active={status === 'closed'} label="ปิดแล้ว" onClick={() => setStatus(status === 'closed' ? '' : 'closed')} />
            <SegmentFilterButton active={status === 'cancelled'} label="ยกเลิก" onClick={() => setStatus(status === 'cancelled' ? '' : 'cancelled')} />
            <button className="ml-auto inline-flex h-9 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700" type="button" onClick={openCreateForm}>+ ยืมเงินใหม่</button>
          </div>
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform hover:bg-blue-700"
          onClick={openCreateForm}
          type="button"
          aria-label="ยืมเงินใหม่"
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
                  setSearch('')
                  setType('')
                  setStatus('active')
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
          )}
        >
              <div>
                <span className="mb-2 block text-xs font-semibold text-slate-600">ประเภท</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium flex-1 h-11 ${
                      !type ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => setType('')}
                  >
                    ทุกประเภท
                  </button>
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium flex-1 h-11 ${
                      type === 'DIRECTOR_LOAN' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => setType('DIRECTOR_LOAN')}
                  >
                    กู้กรรมการ
                  </button>
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium flex-1 h-11 ${
                      type === 'PETTY_CASH' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => setType('PETTY_CASH')}
                  >
                    เงินสำรองจ่าย
                  </button>
                </div>
              </div>

              <div>
                <span className="mb-2 block text-xs font-semibold text-slate-600">สถานะ</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium h-11 ${
                      !status ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => setStatus('')}
                  >
                    ทั้งหมด
                  </button>
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium h-11 ${
                      status === 'active' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => setStatus('active')}
                  >
                    ค้างคืน
                  </button>
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium h-11 ${
                      status === 'closed' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => setStatus('closed')}
                  >
                    ปิดแล้ว
                  </button>
                  <button
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium h-11 ${
                      status === 'cancelled' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                    }`}
                    type="button"
                    onClick={() => setStatus('cancelled')}
                  >
                    ยกเลิก
                  </button>
                </div>
              </div>
        </MobileFilterSheet>
      ) : null}

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <form ref={formRef} noValidate className="w-full max-w-3xl overflow-hidden rounded-md bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-150" onSubmit={saveForm}>
            <div data-ns-dialog-header className="flex flex-wrap items-center justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4">
              <h3 className="font-bold text-white">{form.id ? 'แก้ไขรายการยืมเงิน' : 'บันทึกรายการยืมเงิน'}</h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700" type="button" onClick={() => setFormOpen(false)}>ยกเลิก</button>
                <button className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60" disabled={isSaving} type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
              </div>
            </div>
            <div className="space-y-5 bg-slate-50 p-5">
              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900">ข้อมูลการจ่าย</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <label className="block col-span-2 sm:col-span-1" data-field="type">
                    <span className="mb-1 block text-xs font-medium text-slate-600">ประเภท <span className="text-red-600">*</span></span>
                    <Select className="h-10 w-full px-3 text-sm" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as 'DIRECTOR_LOAN' | 'PETTY_CASH' })}>
                      <option value="DIRECTOR_LOAN">กู้กรรมการ</option>
                      <option value="PETTY_CASH">เงินสำรองจ่าย</option>
                    </Select>
                  </label>
                  <div className="col-span-2 sm:col-span-1">
                    <TextField error={fieldErrors.date} fieldName="date" label="วันที่จ่าย" required type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <MoneyField error={fieldErrors.amount} fieldName="amount" label="จำนวนเงิน" required value={form.amount} onChange={(value) => setForm({ ...form, amount: value })} />
                  </div>
                </div>
              </section>

              <section className="space-y-3 border-t border-slate-100 pt-4">
                <div data-field="recipientId">
                  <SearchCombobox
                     error={fieldErrors.recipientId ?? fieldErrors.recipientName}
                     errorKey="recipientId"
                     inputClassName="h-9 text-sm"
                     inputId="petty-advance-recipient"
                     label="ผู้จ่าย *"
                     options={recipientOptions}
                     optionsPanelClassName="max-h-72"
                     placeholder="ค้นหากรรมการ/พนักงาน"
                     value={form.recipientId}
                     onChange={updateRecipient}
                  />
                </div>
              </section>

              <div className="border-t border-slate-100 pt-4">
                <TextAreaField error={fieldErrors.notes} fieldName="notes" label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => setForm({ ...form, notes: value })} />
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {returningRow ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <form noValidate className="w-full max-w-md overflow-hidden rounded-md bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-150" onSubmit={saveReturn}>
            <div data-ns-dialog-header className="flex flex-wrap items-center justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4">
              <h3 className="font-bold text-white">คืนเงิน — {returningRow.docNo} / {returningRow.recipientName}</h3>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700" type="button" onClick={() => setReturningRow(null)}>ยกเลิก</button>
                <button className="h-9 rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60" disabled={isSaving} type="submit">{isSaving ? 'กำลังส่งอนุมัติ...' : 'ส่งอนุมัติคืนเงิน'}</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 bg-slate-50 p-5 text-sm">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 col-span-2">ยอดยืม: <b>{formatMoney(returningRow.amount)}</b> · ใช้ไปแล้ว: <b>{formatMoney(returningRow.spent)}</b> · คืนแล้ว: <b>{formatMoney(returningRow.returned)}</b> · <span className="font-bold text-red-700">คงค้าง: {formatMoney(returningRow.remaining)}</span></div>
              <div className="col-span-2 sm:col-span-1">
                <TextField label="วันที่คืน" required type="date" value={returnForm.date} onChange={(value) => setReturnForm({ ...returnForm, date: value })} />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <MoneyField label="จำนวนเงินคืน" required value={Number(returnForm.amount) || 0} onChange={(value) => setReturnForm({ ...returnForm, amount: String(value) })} />
              </div>
              <div className="col-span-2">
                <SelectField
                  label="บัญชีรับคืน"
                  required
                  options={activeAccounts}
                  value={returnForm.accountId}
                  onChange={(value) => setReturnForm({ ...returnForm, accountId: value })}
                />
              </div>
              <div className="col-span-2">
                <TextAreaField label="หมายเหตุ" value={returnForm.notes} onChange={(value) => setReturnForm({ ...returnForm, notes: value })} />
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {detailRow ? <DetailModal row={detailRow} onClose={() => setDetailRow(null)} onReturn={openReturnForm} /> : null}

      {/* Table Card Controls */}
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <span>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</span>
            {columnResize.hasCustomWidths ? (
              <button className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>
                คืนค่าเดิมตาราง
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PageSizeDropdown value={pageSize} onChange={setPageSize} />
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              disabled={currentPage <= 1}
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              ก่อนหน้า
            </button>
            <span className="px-1">หน้า {currentPage} / {totalPages}</span>
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              disabled={currentPage >= totalPages}
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              ถัดไป
            </button>
          </div>
        </div>

        {/* Mobile Card List */}
        <div className="block divide-y divide-slate-100/60 lg:hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-500">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && pagedRows.map((row) => (
          <div
            key={row.id}
            className="cursor-pointer p-4 transition-colors active:bg-slate-50"
            onClick={() => setDetailRow(row)}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
              <StatusBadge status={row.status} />
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500 mb-3">
              <span className={row.type === 'DIRECTOR_LOAN' ? 'text-purple-700 font-semibold' : 'text-amber-700 font-semibold'}>
                {typeLabel(row.type)}
              </span>
              <span>วันที่จ่าย: {formatDateDisplay(row.date)}</span>
            </div>
            <div className="text-sm font-semibold text-slate-700 mb-3">
              {row.recipientName}
            </div>
            <div className="flex justify-between items-end border-t border-slate-100 pt-2.5">
              <div className="text-xs text-slate-500">
                {row.spent > 0 ? (
                  <span className="block">ใช้ไปแล้ว: <span className="font-semibold text-blue-700">{formatMoney(row.spent)}</span></span>
                ) : null}
                {row.pendingReturn > 0 ? (
                  <span className="block">รออนุมัติคืน: <span className="font-semibold text-amber-700">{formatMoney(row.pendingReturn)}</span></span>
                ) : null}
                {row.returned > 0 ? (
                  <span className="block">คืนแล้ว: <span className="font-semibold text-emerald-700">{formatMoney(row.returned)}</span></span>
                ) : null}
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">
                  ยอดยืม: <span className="font-semibold text-slate-700">{formatMoney(row.amount)}</span>
                </div>
                <div className="mt-0.5">
                  <span className="text-xs text-slate-500">คงค้าง: </span>
                  <span className={`font-bold text-sm tabular-nums ${row.remaining > 1 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {formatMoney(row.remaining)}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end border-t border-slate-100 pt-2" onClick={(event) => event.stopPropagation()}>
              <TableActionButton mobileLabel menu={(
                <>
                  <TableActionMenuItem onSelect={() => setDetailRow(row)}>ดูรายละเอียด</TableActionMenuItem>
                  {row.status === 'active' && row.remaining > 0 && row.pendingReturn <= 0 ? <TableActionMenuItem onSelect={() => openReturnForm(row)}>คืนเงิน</TableActionMenuItem> : null}
                  {row.status === 'active' ? <TableActionMenuItem onSelect={() => openEditForm(row)}>แก้ไข</TableActionMenuItem> : null}
                </>
              )} />
            </div>
          </div>
        ))}
        {!isLoading && filteredRows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">ยังไม่มีรายการ</div>
        ) : null}
        </div>

        <div className="hidden overflow-x-auto lg:block">
        <table className="ns-table w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {pettyAdvanceColumns.map((column) => {
              const style = columnResize.getColumnStyle(column.key);
              return <col key={column.key} style={style} />;
            })}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
            <tr>
              <ResizableTableHead label="เลขที่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} />
              <ResizableTableHead label="วันที่จ่าย" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่จ่าย')} />
              <ResizableTableHead label="ประเภท" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="type" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} />
              <ResizableTableHead label="ผู้รับเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="recipientName" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('recipientName', 'ผู้รับเงิน')} />
              <ResizableTableHead align="right" label="ยอดยืม" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'ยอดยืม')} />
              <ResizableTableHead align="right" label="ใช้ไปแล้ว" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="spent" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('spent', 'ใช้ไปแล้ว')} />
              <ResizableTableHead align="right" label="คืนแล้ว" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="returned" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('returned', 'คืนแล้ว')} />
              <ResizableTableHead align="right" label="คงค้าง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="remaining" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('remaining', 'คงค้าง')} />
              <ResizableTableHead align="center" label="สถานะ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="status" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
              <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'Action')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-semibold">
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && pagedRows.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetailRow(row)}>
                <td className="p-2 font-mono text-xs">{row.docNo}</td>
                <td className="p-2">{formatDateDisplay(row.date)}</td>
                <td className="p-2"><span className={row.type === 'DIRECTOR_LOAN' ? 'text-purple-700' : 'text-amber-700'}>{typeLabel(row.type)}</span></td>
                <td className="p-2 font-medium">{row.recipientName}</td>
                <td className="p-2 pr-4 text-right tabular-nums">{formatMoney(row.amount)}</td>
                <td className="p-2 pr-4 text-right text-blue-700 tabular-nums">{row.spent > 0 ? <button className="hover:underline" type="button" onClick={(event) => { event.stopPropagation(); setDetailRow(row) }}>{formatMoney(row.spent)}</button> : '-'}</td>
                <td className="p-2 pr-4 text-right text-emerald-700 tabular-nums">{formatMoney(row.returned)}</td>
                <td className={`p-2 pr-4 text-right font-bold tabular-nums ${row.remaining > 1 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(row.remaining)}</td>
                <td className="p-2 text-center"><StatusBadge status={row.status} /></td>
                <td className="whitespace-nowrap p-2 text-right">
                  <TableActionButton
                    menu={(
                      <>
                        <TableActionMenuItem onSelect={() => setDetailRow(row)}>ดูรายละเอียด</TableActionMenuItem>
                        {row.status === 'active' && row.remaining > 0 && row.pendingReturn <= 0 ? <TableActionMenuItem onSelect={() => openReturnForm(row)}>คืนเงิน</TableActionMenuItem> : null}
                        {row.status === 'active' ? <TableActionMenuItem onSelect={() => openEditForm(row)}>แก้ไข</TableActionMenuItem> : null}
                      </>
                    )}
                  />
                </td>
              </tr>
            ))}
            {!isLoading && filteredRows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>ยังไม่มีรายการ</td></tr> : null}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  )
}

function DetailModal({ onClose, onReturn, row }: { onClose: () => void; onReturn: (row: PettyAdvanceRow) => void; row: PettyAdvanceRow }) {
  const returns = row.returns ?? []
  const canReturn = row.status === 'active' && row.remaining > 0 && row.pendingReturn <= 0
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-4xl overflow-hidden rounded-md bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-150" onClick={(event) => event.stopPropagation()}>
        <div data-ns-dialog-header className="flex flex-wrap items-start justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">รายละเอียด {row.docNo} — {row.recipientName}</h3>
            <p className="mt-0.5 text-xs">{typeLabel(row.type)} · วันที่จ่าย {formatDateDisplay(row.date)} · จำนวน {formatMoney(row.amount)} บาท</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canReturn ? (
              <button className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-normal text-white outline-none hover:bg-emerald-700" type="button" onClick={() => onReturn(row)}>
                คืนเงิน
              </button>
            ) : null}
            <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700" type="button" onClick={onClose}>ปิด</button>
          </div>
        </div>
        <div className="space-y-4 bg-slate-50 p-5 text-sm">
          {/* สรุปยอดเงิน */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3 text-center">
              <div className="text-xs text-blue-700 font-semibold">ยอดยืม</div>
              <div className="text-lg font-bold mt-1 text-blue-900">{formatMoney(row.amount)}</div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-center">
              <div className="text-xs text-amber-700 font-semibold">ใช้ไปแล้ว</div>
              <div className="text-lg font-bold mt-1 text-amber-900">{formatMoney(row.spent)}</div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-center">
              <div className="text-xs text-emerald-700 font-semibold">คืนแล้ว</div>
              <div className="text-lg font-bold mt-1 text-emerald-900">{formatMoney(row.returned)}</div>
            </div>
            <div className="rounded-xl border border-red-100 bg-red-50/50 p-3 text-center">
              <div className="text-xs text-red-700 font-semibold">คงค้าง</div>
              <div className="text-lg font-bold mt-1 text-red-900">{formatMoney(row.remaining)}</div>
            </div>
          </div>

          {/* ข้อมูลบัญชีและผู้รับ */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">ข้อมูลการยืมและผู้รับ</div>
            <div className="grid grid-cols-1 gap-y-3">
              <DetailItem label="บัญชีรับเงินของกรรมการ/พนักงาน" value={row.recipientAccountLabel || '-'} />
              {row.pendingReturn > 0 ? <DetailItem label="ยอดรออนุมัติคืน" value={`${formatMoney(row.pendingReturn)} บาท`} /> : null}
              <DetailItem label="หมายเหตุการยืม" value={row.notes || '-'} />
            </div>
          </div>

          <div>
            <div className="mb-2 font-bold text-slate-800">บิลค่าใช้จ่ายที่จ่ายจากเงินก้อนนี้</div>
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center text-slate-400">ยังไม่มีบิลที่ link อยู่ใน payload ปัจจุบัน</div>
          </div>

          <div>
            <div className="mb-2 font-bold text-emerald-700">ประวัติการคืนเงิน ({returns.length} ครั้ง)</div>
            {returns.length ? (
              <div className="overflow-x-auto rounded-md border border-slate-100 bg-white">
                <table className="ns-table w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="p-2 text-left">วันที่</th>
                      <th className="p-2 text-right">จำนวน</th>
                      <th className="p-2 text-left">บัญชีรับ</th>
                      <th className="p-2 text-left">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((entry) => (
                      <tr key={entry.id} className="border-t border-slate-100">
                        <td className="p-2 font-mono">{entry.date}</td>
                        <td className="p-2 text-right font-bold text-emerald-700 tabular-nums">{formatMoney(entry.amount)}</td>
                        <td className="p-2 text-slate-700">{entry.accountName}</td>
                        <td className="p-2 text-slate-600">{entry.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 py-4 text-center text-slate-400">ยังไม่มีประวัติคืนเงิน</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailItem({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`flex flex-col py-1 ${className}`}>
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function SegmentFilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') return <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700"><span className="size-1.5 rounded-full bg-amber-500" />ค้างคืน</span>
  if (status === 'closed') return <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><span className="size-1.5 rounded-full bg-emerald-500" />ปิดแล้ว</span>
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><span className="size-1.5 rounded-full bg-slate-400" />ยกเลิก</span>
}

function SummaryCard({ label, tone = 'slate', value, className = '' }: { label: string; tone?: 'amber' | 'blue' | 'emerald' | 'red' | 'slate'; value: string; className?: string }) {
  return <SharedKpiCard className={className} label={label} tone={tone} value={value} />
}

function ReadOnlyField(props: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-600">{props.label}</span>
      <div className="min-h-9 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">{props.value || '-'}</div>
    </div>
  )
}

function TextField(props: { error?: string; fieldName?: string; label: string; onChange?: (value: string) => void; readOnly?: boolean; required?: boolean; type?: string; value: string }) {
  return (
    <label className="block" data-field={props.fieldName}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{props.label}{props.required ? <span className="ml-1 text-red-600">*</span> : null}</span>
      {props.type === 'date'
        ? <DatePickerInput ariaInvalid={Boolean(props.error)} className={`h-9 w-full ${props.error ? 'border-red-400 bg-red-50' : ''}`} readOnly={props.readOnly} required={props.required} value={props.value} onChange={(value) => props.onChange?.(value)} />
        : <input aria-invalid={Boolean(props.error)} className={`h-9 w-full rounded-md border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-100 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300'} ${props.readOnly ? 'bg-slate-50 text-slate-500' : 'bg-white text-slate-900'}`} readOnly={props.readOnly} required={props.required} type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange?.(event.target.value)} />}
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function MoneyField(props: { error?: string; fieldName?: string; label: string; onChange: (value: number) => void; required?: boolean; value: number }) {
  const [draftValue, setDraftValue] = useState<string | null>(null)

  return (
    <label className="block" data-field={props.fieldName}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{props.label}{props.required ? <span className="ml-1 text-red-600">*</span> : null}</span>
      <input
        aria-invalid={Boolean(props.error)}
        className={`h-9 w-full rounded-md border bg-white px-3 text-right text-sm tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-100 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 text-slate-900'}`}
        inputMode="decimal"
        placeholder="0.00"
        required={props.required}
        type="text"
        value={draftValue ?? formatMoneyInput(props.value)}
        onBlur={(event) => {
          const nextValue = sanitizeMoneyDraft(event.target.value)
          setDraftValue(null)
          props.onChange(nextValue ? Number(nextValue) : 0)
        }}
        onChange={(event) => {
          const nextValue = sanitizeMoneyDraft(event.target.value)
          setDraftValue(nextValue)
          props.onChange(nextValue ? Number(nextValue) : 0)
        }}
        onFocus={() => setDraftValue(props.value > 0 ? String(props.value) : '')}
      />
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function SelectField(props: { error?: string; fieldName?: string; label: string; onChange: (value: string) => void; options: DailyAccountOption[]; required?: boolean; value: string }) {
  return (
    <label className="block" data-field={props.fieldName}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{props.label}{props.required ? <span className="ml-1 text-red-600">*</span> : null}</span>
      <Select
        aria-invalid={Boolean(props.error)}
        className={`h-10 w-full px-3 text-sm ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300'} ${props.value ? 'text-slate-900' : 'text-slate-400'}`}
        required={props.required}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option disabled={props.required} value="">{props.required ? `เลือก${props.label}` : 'ไม่ระบุ'}</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </Select>
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
