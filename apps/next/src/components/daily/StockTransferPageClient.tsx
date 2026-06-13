'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney, stockTransferFormSchema, todayDateInput, type StockTransferFormValues } from '@/lib/daily'
import { firstErrorKeyFromZodIssues, focusFieldError, issueMapFromZodIssues } from '@/lib/form-errors'
import { formatDateDisplay } from '@/lib/format'

type Option = { active: boolean | null; branch_id?: string | null; code?: string | null; id: string; name: string }
type Row = { date: string; docNo: string; from: string; id: string; itemCount: number; notes: string; to: string; totalQty: number }
type Payload = { branches: Option[]; products: Option[]; rows: Row[]; warehouses: Option[] }
type Period = '' | 'today' | 'week' | 'month'
type StockTransferColumnKey = 'action' | 'date' | 'docNo' | 'from' | 'itemCount' | 'notes' | 'to' | 'totalQty'

const numberInputClass = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
const stockTransferColumns: Array<ResizableColumnDefinition<StockTransferColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'from', defaultWidth: 280, minWidth: 140 },
  { key: 'to', defaultWidth: 280, minWidth: 140 },
  { key: 'itemCount', defaultWidth: 75, minWidth: 60 },
  { key: 'totalQty', defaultWidth: 85, minWidth: 80 },
  { key: 'notes', defaultWidth: 180, minWidth: 160 },
  { key: 'action', defaultWidth: 120, minWidth: 100 },
]

const emptyForm: StockTransferFormValues = {
  date: todayDateInput(),
  docNo: null,
  fromBranchId: '',
  fromWarehouseId: '',
  items: [{ lotNo: null, productId: '', qty: 0 }],
  notes: null,
  receiver: null,
  sender: null,
  toBranchId: '',
  toWarehouseId: '',
}

export function StockTransferPageClient() {
  const [data, setData] = useState<Payload>({ branches: [], products: [], rows: [], warehouses: [] })
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<StockTransferFormValues>(emptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [fromBranchId, setFromBranchId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [period, setPeriod] = useState<Period>('')
  const [search, setSearch] = useState('')
  const [toBranchId, setToBranchId] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const columnResize = useResizableColumns('daily.stock-transfer', stockTransferColumns)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await dailyFetchJson<Payload>('/api/stock/transfer'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายการโอนสินค้าไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, fromBranchId, pageSize, period, search, toBranchId])

  const branchOptions = useMemo(() => data.branches.filter((item) => item.active !== false), [data.branches])
  const productOptions = useMemo(() => data.products.filter((product) => product.active !== false), [data.products])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const fromBranch = data.branches.find((branch) => branch.id === fromBranchId)?.name.toLowerCase() ?? ''
    const toBranch = data.branches.find((branch) => branch.id === toBranchId)?.name.toLowerCase() ?? ''
    return data.rows
      .filter((row) => (!dateFrom || row.date >= dateFrom))
      .filter((row) => (!dateTo || row.date <= dateTo))
      .filter((row) => (!fromBranch || row.from.toLowerCase().includes(fromBranch)))
      .filter((row) => (!toBranch || row.to.toLowerCase().includes(toBranch)))
      .filter((row) => (!query || `${row.docNo} ${row.from} ${row.to} ${row.notes}`.toLowerCase().includes(query)))
      .sort((left, right) => right.date.localeCompare(left.date) || right.docNo.localeCompare(left.docNo))
  }, [data.branches, data.rows, dateFrom, dateTo, fromBranchId, search, toBranchId])

  const totalRows = filteredRows.length
  const totalWeight = filteredRows.reduce((sum, row) => sum + row.totalQty, 0)
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function applyPeriod(nextPeriod: Period) {
    setPeriod(nextPeriod)
    const today = todayDateInput()
    if (nextPeriod === 'today') {
      setDateFrom(today)
      setDateTo(today)
      return
    }
    if (nextPeriod === 'week') {
      const start = new Date(`${today}T00:00:00`)
      start.setDate(start.getDate() - 6)
      setDateFrom(start.toISOString().slice(0, 10))
      setDateTo(today)
      return
    }
    if (nextPeriod === 'month') {
      setDateFrom(`${today.slice(0, 7)}-01`)
      setDateTo(today)
      return
    }
    setDateFrom('')
    setDateTo('')
  }

  function clearFilters() {
    setSearch('')
    setFromBranchId('')
    setToBranchId('')
    applyPeriod('')
  }

  function updateForm<K extends keyof StockTransferFormValues>(key: K, value: StockTransferFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  function updateItem(index: number, key: keyof StockTransferFormValues['items'][number], value: string | number | null) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setFieldErrors((current) => ({
      ...current,
      [`items.${index}.${key}`]: '',
    }))
  }

  function openCreateForm() {
    setForm({ ...emptyForm, date: todayDateInput() })
    setFieldErrors({})
    setError(null)
    setFormOpen(true)
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = stockTransferFormSchema.safeParse(form)
    if (!parsed.success) {
      const nextFieldErrors = issueMapFromZodIssues(parsed.error.issues)
      setFieldErrors(nextFieldErrors)
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      focusFieldError(firstErrorKeyFromZodIssues(parsed.error.issues))
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/stock/transfer', { body: JSON.stringify(parsed.data), method: 'POST' })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกโอนสินค้าไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const sourceWarehouseOptions = data.warehouses.filter((item) => item.active !== false && (!form.fromBranchId || item.branch_id === form.fromBranchId))
  const destinationWarehouseOptions = data.warehouses.filter((item) => item.active !== false && (!form.toBranchId || item.branch_id === form.toBranchId))

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-9 min-w-[260px] flex-1"
            placeholder="ค้นหาเลขที่ / ต้นทาง / ปลายทาง / หมายเหตุ..."
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {/* Mobile Filter Button */}
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 md:hidden"
            onClick={() => setShowMobileFilters(true)}
          >
            <span>🔍</span> ตัวกรอง {(dateFrom || dateTo || fromBranchId || toBranchId) ? '(1)' : ''}
          </button>

          <div className="hidden md:flex flex-wrap items-center gap-2">
            <DatePickerInput className="w-[130px]" value={dateFrom} onChange={(value) => { setDateFrom(value); setPeriod('') }} />
            <span className="text-slate-400">→</span>
            <DatePickerInput className="w-[130px]" value={dateTo} onChange={(value) => { setDateTo(value); setPeriod('') }} />
            <select className="h-9 rounded-md border border-slate-300 px-2 py-2 text-sm bg-white" value={fromBranchId} onChange={(event) => setFromBranchId(event.target.value)}>
              <option value="">ทุกสาขาต้นทาง</option>
              {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
            <select className="h-9 rounded-md border border-slate-300 px-2 py-2 text-sm bg-white" value={toBranchId} onChange={(event) => setToBranchId(event.target.value)}>
              <option value="">ทุกสาขาปลายทาง</option>
              {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </div>

          {(search || dateFrom || dateTo || fromBranchId || toBranchId) ? (
            <Button size="sm" type="button" variant="secondary" onClick={clearFilters}>ล้าง</Button>
          ) : null}
          <Button className="hidden md:inline-flex ml-auto" size="sm" type="button" onClick={openCreateForm}>+ โอนใหม่</Button>
        </div>

        {/* Desktop Period Filters */}
        <div className="hidden md:flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">ช่วง:</span>
          <PeriodButton active={period === ''} label="ทั้งหมด" onClick={() => applyPeriod('')} />
          <PeriodButton active={period === 'today'} label="วันนี้" onClick={() => applyPeriod('today')} />
          <PeriodButton active={period === 'week'} label="7 วัน" onClick={() => applyPeriod('week')} />
          <PeriodButton active={period === 'month'} label="เดือนนี้" onClick={() => applyPeriod('month')} />
        </div>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 md:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-white shadow-lg active:scale-95 transition-transform"
          onClick={openCreateForm}
          type="button"
          aria-label="โอนใหม่"
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
                  {['', 'today', 'week', 'month'].map((p) => {
                    const labels: Record<string, string> = { '': 'ทั้งหมด', today: 'วันนี้', week: '7 วัน', month: 'เดือนนี้' }
                    return (
                      <button
                        key={p}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium flex-1 h-11 ${
                          period === p ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
                        }`}
                        type="button"
                        onClick={() => applyPeriod(p as Period)}
                      >
                        {labels[p]}
                      </button>
                    )
                  })}
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
                <span className="mb-1 block text-xs font-semibold text-slate-600">สาขาต้นทาง</span>
                <select className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm bg-white" value={fromBranchId} onChange={(event) => setFromBranchId(event.target.value)}>
                  <option value="">ทุกสาขาต้นทาง</option>
                  {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">สาขาปลายทาง</span>
                <select className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm bg-white" value={toBranchId} onChange={(event) => setToBranchId(event.target.value)}>
                  <option value="">ทุกสาขาปลายทาง</option>
                  {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
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
                className="h-11 rounded-md bg-slate-800 text-sm font-semibold text-white hover:bg-slate-700"
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
          <span className="ml-2 text-slate-500">· น้ำหนักรวม <span className="font-semibold text-blue-700">{formatMoney(totalWeight)}</span> กก.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? <Button size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>Set col to default</Button> : null}
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto rounded-md border border-slate-300 px-2 py-1 text-sm"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={10}>10 / หน้า</option>
            <option value={25}>25 / หน้า</option>
            <option value={50}>50 / หน้า</option>
            <option value={100}>100 / หน้า</option>
          </select>
          <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <form noValidate className="mx-auto my-4 w-full max-w-5xl overflow-hidden rounded-md bg-white shadow-xl" onSubmit={save}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800">โอนสินค้าระหว่างสาขา</h3>
                <p className="mt-1 text-xs text-slate-500">บันทึกการย้ายสินค้าระหว่างต้นทางและปลายทางโดยเก็บรายการน้ำหนักรายสินค้า</p>
              </div>
              <button className="text-3xl leading-none text-slate-400 hover:text-slate-700" type="button" onClick={() => setFormOpen(false)}>&times;</button>
            </div>

            <div className="space-y-4 bg-slate-50 p-6 text-sm">
              <div className="rounded-md bg-white p-4 shadow">
                <h4 className="mb-3 font-bold text-slate-700">1. ข้อมูลเอกสาร</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField label="เลขที่เอกสาร">
                    <Input className="h-9 bg-slate-50 font-mono text-sm" placeholder="ระบบจะออกเลขให้อัตโนมัติ" readOnly value={form.docNo ?? ''} />
                  </FormField>
                  <FormField error={fieldErrors.date} errorKey="date" label="วันที่ *">
                    <DatePickerInput className={`${fieldErrors.date ? '[&_input]:border-red-400 [&_input]:bg-red-50 [&_[data-slot="input-group"]]:border-red-400' : ''} w-full`} value={form.date} onChange={(value) => updateForm('date', value)} />
                  </FormField>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-md border border-red-200 bg-white p-4 shadow">
                  <h4 className="mb-3 font-bold text-red-700">2. ต้นทาง</h4>
                  <div className="grid gap-3">
                    <SelectField
                      error={fieldErrors.fromBranchId}
                      errorKey="fromBranchId"
                      label="สาขาต้นทาง *"
                      options={branchOptions}
                      placeholder="เลือกสาขาต้นทาง"
                      value={form.fromBranchId}
                      onChange={(value) => updateForm('fromBranchId', value)}
                    />
                    <SelectField
                      error={fieldErrors.fromWarehouseId}
                      errorKey="fromWarehouseId"
                      label="คลังต้นทาง *"
                      options={sourceWarehouseOptions}
                      placeholder="เลือกคลังต้นทาง"
                      value={form.fromWarehouseId}
                      onChange={(value) => updateForm('fromWarehouseId', value)}
                    />
                  </div>
                </div>

                <div className="rounded-md border border-emerald-200 bg-white p-4 shadow">
                  <h4 className="mb-3 font-bold text-emerald-700">3. ปลายทาง</h4>
                  <div className="grid gap-3">
                    <SelectField
                      error={fieldErrors.toBranchId}
                      errorKey="toBranchId"
                      label="สาขาปลายทาง *"
                      options={branchOptions}
                      placeholder="เลือกสาขาปลายทาง"
                      value={form.toBranchId}
                      onChange={(value) => updateForm('toBranchId', value)}
                    />
                    <SelectField
                      error={fieldErrors.toWarehouseId}
                      errorKey="toWarehouseId"
                      label="คลังปลายทาง *"
                      options={destinationWarehouseOptions}
                      placeholder="เลือกคลังปลายทาง"
                      value={form.toWarehouseId}
                      onChange={(value) => updateForm('toWarehouseId', value)}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-md bg-white p-4 shadow">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-700">4. รายการสินค้า ({form.items.length})</h4>
                  <Button size="sm" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, { lotNo: null, productId: '', qty: 0 }] }))}>+ เพิ่มรายการ</Button>
                </div>
                {fieldErrors.items ? <div className="mb-2 text-xs text-red-600">{fieldErrors.items}</div> : null}
                <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="bg-slate-200/80 border-b border-slate-300/80">
                      <tr>
                        <th className="p-2 text-left">สินค้า</th>
                        <th className="p-2 text-left">Lot</th>
                        <th className="p-2 text-right">น้ำหนัก</th>
                        <th className="p-2 text-right">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {form.items.map((item, index) => (
                        <tr key={index} className="align-top hover:bg-slate-50">
                          <td className="p-2">
                            <SelectField
                              error={fieldErrors[`items.${index}.productId`]}
                              errorKey={`items.${index}.productId`}
                              label="สินค้า *"
                              options={productOptions}
                              placeholder="เลือกสินค้า"
                              value={item.productId}
                              onChange={(value) => updateItem(index, 'productId', value)}
                            />
                          </td>
                          <td className="p-2">
                            <InputField
                              error={fieldErrors[`items.${index}.lotNo`]}
                              errorKey={`items.${index}.lotNo`}
                              label="Lot"
                              value={item.lotNo ?? ''}
                              onChange={(value) => updateItem(index, 'lotNo', value || null)}
                            />
                          </td>
                          <td className="p-2">
                            <InputField
                              error={fieldErrors[`items.${index}.qty`]}
                              errorKey={`items.${index}.qty`}
                              inputClassName={`text-right tabular-nums ${numberInputClass}`}
                              label="น้ำหนัก *"
                              type="number"
                              value={item.qty ? String(item.qty) : ''}
                              onChange={(value) => updateItem(index, 'qty', Number(value || 0))}
                            />
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              className="mt-6"
                              disabled={form.items.length <= 1}
                              size="xs"
                              type="button"
                              variant="outline"
                              onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_entry, entryIndex) => entryIndex !== index) }))}
                            >
                              ลบ
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-semibold">
                      <tr>
                        <td className="p-2 text-right text-slate-600" colSpan={2}>น้ำหนักรวม</td>
                        <td className="p-2 text-right tabular-nums text-blue-700">{formatMoney(form.items.reduce((sum, item) => sum + item.qty, 0))}</td>
                        <td className="p-2" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="rounded-md bg-white p-4 shadow">
                <h4 className="mb-3 font-bold text-slate-700">5. ผู้รับผิดชอบและหมายเหตุ</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <InputField
                    error={fieldErrors.sender}
                    errorKey="sender"
                    label="ผู้ส่ง"
                    value={form.sender ?? ''}
                    onChange={(value) => updateForm('sender', value || null)}
                  />
                  <InputField
                    error={fieldErrors.receiver}
                    errorKey="receiver"
                    label="ผู้รับ"
                    value={form.receiver ?? ''}
                    onChange={(value) => updateForm('receiver', value || null)}
                  />
                </div>
                <FormField className="mt-3" error={fieldErrors.notes} errorKey="notes" label="หมายเหตุ">
                  <textarea
                    data-error-key="notes"
                    className={`w-full rounded-md border px-3 py-2 ${fieldErrors.notes ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white'}`}
                    rows={3}
                    value={form.notes ?? ''}
                    onChange={(event) => updateForm('notes', event.target.value || null)}
                  />
                </FormField>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
              <Button size="sm" type="button" variant="ghost" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
              <Button disabled={isSaving} size="sm" type="submit">{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Mobile Card List */}
      <div className="block md:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && pagedRows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-default transition-colors"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
              <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
            </div>
            <div className="text-xs text-slate-600 mb-3 flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-red-600">{row.from}</span>
              <span className="text-slate-400">➡️</span>
              <span className="font-semibold text-emerald-700">{row.to}</span>
            </div>
            {row.notes ? (
              <p className="text-xs text-slate-500 italic mb-3">หมายเหตุ: {row.notes}</p>
            ) : null}
            <div className="flex justify-between items-end border-t border-slate-100 pt-2.5">
              <div className="text-xs text-slate-500">
                <span>รายการสินค้า: <span className="font-semibold text-slate-700">{row.itemCount}</span> รายการ</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500 block">น้ำหนักรวม</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums">{formatMoney(row.totalQty)} กก.</span>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && pagedRows.length === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-200">ยังไม่มีรายการ</div>
        ) : null}
      </div>

      <div className="hidden md:block overflow-x-auto rounded-md bg-white shadow">
        <Table style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {stockTransferColumns.map((column, index) => {
              const style = columnResize.getColumnStyle(column.key);
              if (index === stockTransferColumns.length - 1) {
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
              <ResizableTableHead label="ไป" resizeProps={columnResize.getResizeHandleProps('to', 'ไป')} />
              <ResizableTableHead align="right" label="รายการ" resizeProps={columnResize.getResizeHandleProps('itemCount', 'รายการ')} />
              <ResizableTableHead align="right" label="น้ำหนักรวม" resizeProps={columnResize.getResizeHandleProps('totalQty', 'น้ำหนักรวม')} />
              <ResizableTableHead label="หมายเหตุ" resizeProps={columnResize.getResizeHandleProps('notes', 'หมายเหตุ')} />
              <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
            {!isLoading && pagedRows.map((row) => (
              <TableRow key={row.id} className="hover:bg-slate-50">
                <TableCell className="font-mono text-xs">{row.docNo}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDateDisplay(row.date)}</TableCell>
                <TableCell className="text-red-600">{row.from}</TableCell>
                <TableCell className="text-emerald-700">{row.to}</TableCell>
                <TableCell className="whitespace-nowrap text-right pr-4 tabular-nums">{row.itemCount.toLocaleString('th-TH')}</TableCell>
                <TableCell className="whitespace-nowrap text-right pr-4 font-medium tabular-nums">{formatMoney(row.totalQty)} กก.</TableCell>
                <TableCell className="max-w-[280px] truncate text-slate-600">{row.notes || '-'}</TableCell>
                <TableCell className="text-right">
                  <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" disabled title="รอออกแบบ cancel/tombstone flow" type="button">ยกเลิก</button>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && pagedRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-400" colSpan={8}>ยังไม่มีรายการ</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function PeriodButton(props: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`rounded-md border px-3 py-1 text-xs font-medium ${props.active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
      type="button"
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}

function FormField(props: { children: React.ReactNode; className?: string; error?: string; errorKey?: string; label: string }) {
  return (
    <label className={props.className}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{props.label}</span>
      {props.errorKey ? <div data-error-key={props.errorKey}>{props.children}</div> : props.children}
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function InputField(props: {
  error?: string
  errorKey?: string
  inputClassName?: string
  label: string
  onChange: (value: string) => void
  type?: string
  value: string
}) {
  return (
    <FormField error={props.error} errorKey={props.errorKey} label={props.label}>
      {props.type === 'date' ? (
        <DatePickerInput className={`${props.error ? '[&_input]:border-red-400 [&_input]:bg-red-50 [&_[data-slot="input-group"]]:border-red-400' : ''} w-full`} value={props.value} onChange={props.onChange} />
      ) : (
        <Input
          data-error-key={props.errorKey}
          className={`h-9 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : ''} ${props.inputClassName ?? ''}`.trim()}
          type={props.type ?? 'text'}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
    </FormField>
  )
}

function SelectField(props: {
  error?: string
  errorKey?: string
  label: string
  onChange: (value: string) => void
  options: Option[]
  placeholder: string
  value: string
}) {
  return (
    <FormField error={props.error} errorKey={props.errorKey} label={props.label}>
      <select
        data-error-key={props.errorKey}
        className={`h-9 w-full rounded-md border px-3 py-2 text-sm outline-none ${props.error ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white'}`}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">{props.placeholder}</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}
      </select>
    </FormField>
  )
}
