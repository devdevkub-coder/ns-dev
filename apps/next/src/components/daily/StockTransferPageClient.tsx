'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit3, Plus, Send, XCircle } from 'lucide-react'
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
type SourceStock = { productId: string; productCode: string; productName: string; qty: number; readyQty: number; sourceUnitCost: number; sourceValue: number }
type Row = {
  canCancel: boolean
  canEdit: boolean
  canPost: boolean
  date: string
  docNo: string
  from: string
  fromBranchId: string
  fromWarehouseId: string
  id: string
  itemCount: number
  items: Array<{ lineValue: number; productId: string; productName: string; qty: number; sourceUnitCost: number }>
  notes: string
  status: 'draft' | 'posted' | 'cancelled'
  to: string
  toBranchId: string
  toWarehouseId: string
  totalQty: number
  totalValue: number
  updatedAt: string
  updatedBy: string
}
type Payload = {
  branches: Option[]
  page: number
  pageSize: number
  products: Option[]
  rows: Row[]
  sourceStock: SourceStock[]
  summary: { totalQty: number; totalRows: number; totalValue: number }
  totalRows: number
  warehouses: Option[]
}
type StockTransferColumnKey = 'action' | 'date' | 'docNo' | 'from' | 'itemCount' | 'status' | 'to' | 'totalQty' | 'totalValue' | 'updated'

const numberInputClass = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
const stockTransferColumns: Array<ResizableColumnDefinition<StockTransferColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'from', defaultWidth: 240, minWidth: 160 },
  { key: 'to', defaultWidth: 240, minWidth: 160 },
  { key: 'itemCount', defaultWidth: 80, minWidth: 70 },
  { key: 'totalQty', defaultWidth: 110, minWidth: 95 },
  { key: 'totalValue', defaultWidth: 130, minWidth: 110 },
  { key: 'updated', defaultWidth: 180, minWidth: 150 },
  { key: 'status', defaultWidth: 110, minWidth: 95 },
  { key: 'action', defaultWidth: 170, minWidth: 150 },
]

const emptyForm: StockTransferFormValues = {
  date: todayDateInput(),
  docNo: null,
  fromBranchId: '',
  fromWarehouseId: '',
  items: [{ productId: '', qty: 0 }],
  notes: null,
  submitMode: 'post',
  toBranchId: '',
  toWarehouseId: '',
}

export function StockTransferPageClient() {
  const [data, setData] = useState<Payload>({ branches: [], page: 1, pageSize: 10, products: [], rows: [], sourceStock: [], summary: { totalQty: 0, totalRows: 0, totalValue: 0 }, totalRows: 0, warehouses: [] })
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [docNo, setDocNo] = useState('')
  const [editingDocNo, setEditingDocNo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<StockTransferFormValues>(emptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sourceStock, setSourceStock] = useState<SourceStock[]>([])
  const [sourceStockLoading, setSourceStockLoading] = useState(false)
  const [totalQtyFrom, setTotalQtyFrom] = useState('')
  const [totalQtyTo, setTotalQtyTo] = useState('')
  const columnResize = useResizableColumns('daily.stock-transfer.v2', stockTransferColumns)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (docNo.trim()) params.set('docNo', docNo.trim())
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (totalQtyFrom.trim()) params.set('totalQtyFrom', totalQtyFrom.trim())
      if (totalQtyTo.trim()) params.set('totalQtyTo', totalQtyTo.trim())
      setData(await dailyFetchJson<Payload>(`/api/stock/transfer?${params.toString()}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายการโอนสินค้าไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [dateFrom, dateTo, docNo, page, pageSize, totalQtyFrom, totalQtyTo])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, docNo, pageSize, totalQtyFrom, totalQtyTo])

  useEffect(() => {
    if (!formOpen || !form.fromBranchId || !form.fromWarehouseId) {
      setSourceStock([])
      return
    }
    const controller = new AbortController()
    setSourceStockLoading(true)
    const params = new URLSearchParams({
      mode: 'source-stock',
      sourceBranchId: form.fromBranchId,
      sourceWarehouseId: form.fromWarehouseId,
    })
    void dailyFetchJson<{ sourceStock: SourceStock[] }>(`/api/stock/transfer?${params.toString()}`, { signal: controller.signal })
      .then((payload) => setSourceStock(payload.sourceStock))
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'โหลด stock ต้นทางไม่ได้')
      })
      .finally(() => {
        if (!controller.signal.aborted) setSourceStockLoading(false)
      })
    return () => controller.abort()
  }, [form.fromBranchId, form.fromWarehouseId, formOpen])

  const branchOptions = useMemo(() => data.branches.filter((item) => item.active !== false), [data.branches])
  const productOptions = useMemo(() => data.products.filter((product) => product.active !== false), [data.products])
  const sourceWarehouseOptions = form.fromBranchId
    ? data.warehouses.filter((item) => item.active !== false && item.branch_id === form.fromBranchId)
    : []
  const destinationWarehouseOptions = form.toBranchId
    ? data.warehouses.filter((item) => item.active !== false && item.branch_id === form.toBranchId)
    : []
  const sourceStockByProductId = useMemo(() => new Map(sourceStock.map((row) => [row.productId, row])), [sourceStock])

  const totalPages = Math.max(1, Math.ceil(data.totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)

  function clearFilters() {
    setDocNo('')
    setDateFrom('')
    setDateTo('')
    setTotalQtyFrom('')
    setTotalQtyTo('')
  }

  function updateForm<K extends keyof StockTransferFormValues>(key: K, value: StockTransferFormValues[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'fromBranchId') next.fromWarehouseId = ''
      if (key === 'toBranchId') next.toWarehouseId = ''
      return next
    })
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  function updateItem(index: number, key: keyof StockTransferFormValues['items'][number], value: string | number) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setFieldErrors((current) => ({ ...current, [`items.${index}.${key}`]: '' }))
  }

  function openCreateForm() {
    setEditingDocNo(null)
    setForm({ ...emptyForm, date: todayDateInput(), items: [{ productId: '', qty: 0 }] })
    setFieldErrors({})
    setError(null)
    setFormOpen(true)
  }

  function openEditForm(row: Row) {
    setEditingDocNo(row.docNo)
    setForm({
      date: row.date,
      docNo: row.docNo,
      fromBranchId: row.fromBranchId,
      fromWarehouseId: row.fromWarehouseId,
      items: row.items.map((item) => ({ productId: item.productId, qty: item.qty })),
      notes: row.notes || null,
      submitMode: 'draft',
      toBranchId: row.toBranchId,
      toWarehouseId: row.toWarehouseId,
    })
    setFieldErrors({})
    setError(null)
    setFormOpen(true)
  }

  async function submitForm(mode: 'draft' | 'post') {
    const parsed = stockTransferFormSchema.safeParse({ ...form, submitMode: mode })
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
      if (editingDocNo) {
        await dailyFetchJson('/api/stock/transfer', {
          body: JSON.stringify({ ...parsed.data, action: mode === 'post' ? 'post' : 'edit', docNo: editingDocNo }),
          method: 'PATCH',
        })
      } else {
        await dailyFetchJson('/api/stock/transfer', { body: JSON.stringify(parsed.data), method: 'POST' })
      }
      setFormOpen(false)
      setEditingDocNo(null)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกโอนสินค้าไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function cancelDraft(row: Row) {
    if (!row.canCancel) return
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/stock/transfer', {
        body: JSON.stringify({ action: 'cancel', docNo: row.docNo }),
        method: 'PATCH',
      })
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิกเอกสารไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function postDraft(row: Row) {
    if (!row.canPost) return
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/stock/transfer', {
        body: JSON.stringify({
          action: 'post',
          date: row.date,
          docNo: row.docNo,
          fromBranchId: row.fromBranchId,
          fromWarehouseId: row.fromWarehouseId,
          items: row.items.map((item) => ({ productId: item.productId, qty: item.qty })),
          notes: row.notes || null,
          toBranchId: row.toBranchId,
          toWarehouseId: row.toWarehouseId,
        }),
        method: 'PATCH',
      })
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ส่งเข้าสต๊อกไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const formTotalQty = form.items.reduce((sum, item) => sum + item.qty, 0)
  const formTotalValue = form.items.reduce((sum, item) => {
    const source = sourceStockByProductId.get(item.productId)
    return sum + item.qty * (source?.sourceUnitCost ?? 0)
  }, 0)

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-md bg-white p-3 shadow">
        <div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_150px_150px_130px_130px_auto_auto]">
          <Input
            className="h-9"
            placeholder="เลขที่เอกสาร"
            type="search"
            value={docNo}
            onChange={(event) => setDocNo(event.target.value)}
          />
          <DatePickerInput className="w-full" value={dateFrom} onChange={setDateFrom} />
          <DatePickerInput className="w-full" value={dateTo} onChange={setDateTo} />
          <Input
            className={`h-9 text-right tabular-nums ${numberInputClass}`}
            inputMode="decimal"
            placeholder="นน. จาก"
            value={totalQtyFrom}
            onChange={(event) => setTotalQtyFrom(event.target.value)}
          />
          <Input
            className={`h-9 text-right tabular-nums ${numberInputClass}`}
            inputMode="decimal"
            placeholder="นน. ถึง"
            value={totalQtyTo}
            onChange={(event) => setTotalQtyTo(event.target.value)}
          />
          {(docNo || dateFrom || dateTo || totalQtyFrom || totalQtyTo) ? (
            <Button size="sm" type="button" variant="secondary" onClick={clearFilters}>ล้าง</Button>
          ) : <span />}
          <Button size="sm" type="button" onClick={openCreateForm}><Plus className="mr-1 h-4 w-4" />โอนใหม่</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{data.summary.totalRows}</span> รายการ
          <span className="ml-2 text-slate-500">· น้ำหนักรวม <span className="font-semibold text-blue-700">{formatMoney(data.summary.totalQty)}</span> กก.</span>
          <span className="ml-2 text-slate-500">· มูลค่ารวม <span className="font-semibold text-emerald-700">{formatMoney(data.summary.totalValue)}</span> บาท</span>
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8 animate-fade-in">
          <form noValidate className="w-full max-w-5xl overflow-hidden rounded-md bg-slate-900 shadow-xl flex flex-col max-h-[90vh]" onSubmit={(event) => event.preventDefault()}>
            <div className="flex items-center justify-between bg-slate-900 text-white px-5 py-4 shrink-0">
              <div>
                <h3 className="font-bold text-slate-100 text-lg">{editingDocNo ? 'แก้ไขรายการโอนสินค้า' : 'โอนสินค้าระหว่างสาขา'}</h3>
                <p className="mt-1 text-xs text-slate-400">ระบบจะตัด stock ต้นทางและรับเข้าปลายทางเมื่อส่งเข้าสต๊อกเท่านั้น</p>
              </div>
              <button className="text-2xl text-slate-400 hover:text-white" type="button" onClick={() => setFormOpen(false)}>&times;</button>
            </div>

            <div className="max-h-[76vh] overflow-y-auto bg-slate-50 p-4 sm:p-5 space-y-4 text-sm flex-1">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="mb-3 font-bold text-slate-700">1. ต้นทาง</h4>
                  <div className="grid gap-3">
                    <SelectField displayMode="name" error={fieldErrors.fromBranchId} errorKey="fromBranchId" label="สาขาต้นทาง *" options={branchOptions} placeholder="เลือกสาขาต้นทาง" value={form.fromBranchId} onChange={(value) => updateForm('fromBranchId', value)} />
                    <SelectField
                      disabled={!form.fromBranchId}
                      error={fieldErrors.fromWarehouseId}
                      errorKey="fromWarehouseId"
                      label="คลังต้นทาง *"
                      options={sourceWarehouseOptions}
                      placeholder={form.fromBranchId ? 'เลือกคลังต้นทาง' : 'เลือกสาขาต้นทางก่อน'}
                      value={form.fromWarehouseId}
                      onChange={(value) => updateForm('fromWarehouseId', value)}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h4 className="mb-3 font-bold text-slate-700">2. ปลายทาง</h4>
                  <div className="grid gap-3">
                    <SelectField displayMode="name" error={fieldErrors.toBranchId} errorKey="toBranchId" label="สาขาปลายทาง *" options={branchOptions} placeholder="เลือกสาขาปลายทาง" value={form.toBranchId} onChange={(value) => updateForm('toBranchId', value)} />
                    <SelectField
                      disabled={!form.toBranchId}
                      error={fieldErrors.toWarehouseId}
                      errorKey="toWarehouseId"
                      label="คลังปลายทาง *"
                      options={destinationWarehouseOptions}
                      placeholder={form.toBranchId ? 'เลือกคลังปลายทาง' : 'เลือกสาขาปลายทางก่อน'}
                      value={form.toWarehouseId}
                      onChange={(value) => updateForm('toWarehouseId', value)}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-slate-700">3. รายการสินค้า ({form.items.length})</h4>
                    <p className="mt-1 text-xs text-slate-500">{sourceStockLoading ? 'กำลังโหลด stock ต้นทาง' : 'คงเหลือและมูลค่า/kg อ่านจาก stock ต้นทาง'}</p>
                  </div>
                  <Button size="sm" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, { productId: '', qty: 0 }] }))}>+ เพิ่มรายการ</Button>
                </div>
                {fieldErrors.items ? <div className="mb-2 text-xs text-red-600">{fieldErrors.items}</div> : null}
                <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                  <table className="w-full min-w-[920px] text-sm">
                    <thead className="border-b border-slate-300/80 bg-slate-200/80">
                      <tr>
                        <th className="p-2 text-left">สินค้า</th>
                        <th className="p-2 text-right">คงเหลือต้นทาง</th>
                        <th className="p-2 text-right">มูลค่า/kg</th>
                        <th className="p-2 text-right">น้ำหนัก</th>
                        <th className="p-2 text-right">มูลค่ารวม</th>
                        <th className="p-2 text-right">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {form.items.map((item, index) => {
                        const source = sourceStockByProductId.get(item.productId)
                        const lineValue = item.qty * (source?.sourceUnitCost ?? 0)
                        return (
                          <tr key={index} className="align-top hover:bg-slate-50">
                            <td className="p-2">
                              <SearchableProductField
                                error={fieldErrors[`items.${index}.productId`]}
                                errorKey={`items.${index}.productId`}
                                options={productOptions}
                                value={item.productId}
                                onChange={(value) => updateItem(index, 'productId', value)}
                              />
                            </td>
                            <td className="p-2 pt-8 text-right tabular-nums text-slate-700">{source ? `${formatMoney(source.readyQty)} กก.` : '-'}</td>
                            <td className="p-2 pt-8 text-right tabular-nums text-slate-700">{source ? formatMoney(source.sourceUnitCost) : '-'}</td>
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
                            <td className="p-2 pt-8 text-right tabular-nums font-medium text-emerald-700">{formatMoney(lineValue)}</td>
                            <td className="p-2 text-right">
                              <Button className="mt-6" disabled={form.items.length <= 1} size="xs" type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, items: current.items.filter((_entry, entryIndex) => entryIndex !== index) }))}>
                                ลบ
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 font-semibold">
                      <tr>
                        <td className="p-2 text-right text-slate-600" colSpan={3}>รวม</td>
                        <td className="p-2 text-right tabular-nums text-blue-700">{formatMoney(formTotalQty)} กก.</td>
                        <td className="p-2 text-right tabular-nums text-emerald-700">{formatMoney(formTotalValue)}</td>
                        <td className="p-2" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="mb-3 font-bold text-slate-700">4. หมายเหตุ</h4>
                <FormField error={fieldErrors.notes} errorKey="notes" label="หมายเหตุ">
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

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
              <Button size="sm" type="button" variant="outline" onClick={() => setFormOpen(false)}>ยกเลิก</Button>
              <Button disabled={isSaving} size="sm" type="button" variant="outline" onClick={() => submitForm('draft')}>{isSaving ? 'กำลังบันทึก...' : 'บันทึกแบบร่าง'}</Button>
              <Button disabled={isSaving} size="sm" type="button" onClick={() => submitForm('post')}><Send className="mr-1 h-4 w-4" />{isSaving ? 'กำลังส่ง...' : 'ส่งเข้าสต๊อก'}</Button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="block space-y-3 md:hidden">
        {isLoading ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && data.rows.map((row) => (
          <div key={row.id} className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-start justify-between">
              <span className="font-bold text-slate-800">{row.docNo}</span>
              <StatusBadge status={row.status} />
            </div>
            <div className="text-xs text-slate-500">{formatDateDisplay(row.date)}</div>
            <div className="my-3 text-xs text-slate-600">
              <span className="font-semibold text-red-600">{row.from}</span>
              <span className="mx-1 text-slate-400">→</span>
              <span className="font-semibold text-emerald-700">{row.to}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
              <SummaryCell label="น้ำหนักรวม" value={`${formatMoney(row.totalQty)} กก.`} />
              <SummaryCell label="มูลค่ารวม" value={`${formatMoney(row.totalValue)} บาท`} />
              <SummaryCell label="รายการ" value={`${row.itemCount.toLocaleString('th-TH')} รายการ`} />
              <SummaryCell label="แก้ไขล่าสุด" value={row.updatedBy ? `${row.updatedBy} · ${formatDateTime(row.updatedAt)}` : formatDateTime(row.updatedAt)} />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button disabled={!row.canEdit || isSaving} size="xs" type="button" variant="outline" onClick={() => openEditForm(row)}><Edit3 className="mr-1 h-3.5 w-3.5" />แก้ไข</Button>
              <Button disabled={!row.canPost || isSaving} size="xs" type="button" onClick={() => postDraft(row)}><Send className="mr-1 h-3.5 w-3.5" />ส่ง</Button>
              <Button disabled={!row.canCancel || isSaving} size="xs" type="button" variant="outline" onClick={() => cancelDraft(row)}><XCircle className="mr-1 h-3.5 w-3.5" />ยกเลิก</Button>
            </div>
          </div>
        ))}
        {!isLoading && data.rows.length === 0 ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-400 shadow">ยังไม่มีรายการ</div> : null}
      </div>

      <div className="hidden overflow-x-auto rounded-md bg-white shadow md:block">
        <Table style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {stockTransferColumns.map((column, index) => {
              const style = columnResize.getColumnStyle(column.key)
              if (index === stockTransferColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={style} />
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
              <ResizableTableHead align="right" label="มูลค่ารวม" resizeProps={columnResize.getResizeHandleProps('totalValue', 'มูลค่ารวม')} />
              <ResizableTableHead label="แก้ไขล่าสุด" resizeProps={columnResize.getResizeHandleProps('updated', 'แก้ไขล่าสุด')} />
              <ResizableTableHead label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
              <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
            {!isLoading && data.rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-slate-50">
                <TableCell className="font-mono text-xs">{row.docNo}</TableCell>
                <TableCell className="whitespace-nowrap">{formatDateDisplay(row.date)}</TableCell>
                <TableCell className="text-red-600">{row.from}</TableCell>
                <TableCell className="text-emerald-700">{row.to}</TableCell>
                <TableCell className="whitespace-nowrap pr-4 text-right tabular-nums">{row.itemCount.toLocaleString('th-TH')}</TableCell>
                <TableCell className="whitespace-nowrap pr-4 text-right font-medium tabular-nums">{formatMoney(row.totalQty)} กก.</TableCell>
                <TableCell className="whitespace-nowrap pr-4 text-right font-medium tabular-nums text-emerald-700">{formatMoney(row.totalValue)}</TableCell>
                <TableCell className="text-xs text-slate-600">
                  <div className="truncate">{row.updatedBy || '-'}</div>
                  <div className="text-slate-400">{formatDateTime(row.updatedAt)}</div>
                </TableCell>
                <TableCell><StatusBadge status={row.status} /></TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <IconButton disabled={!row.canEdit || isSaving} label="แก้ไข" onClick={() => openEditForm(row)}><Edit3 className="h-3.5 w-3.5" /></IconButton>
                    <IconButton disabled={!row.canPost || isSaving} label="ส่งเข้าสต๊อก" onClick={() => postDraft(row)}><Send className="h-3.5 w-3.5" /></IconButton>
                    <IconButton disabled={!row.canCancel || isSaving} label="ยกเลิก" onClick={() => cancelDraft(row)}><XCircle className="h-3.5 w-3.5" /></IconButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && data.rows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-400" colSpan={10}>ยังไม่มีรายการ</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function formatDateTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

function statusLabel(status: Row['status']) {
  if (status === 'draft') return 'แบบร่าง'
  if (status === 'posted') return 'ส่งแล้ว'
  return 'ยกเลิก'
}

function StatusBadge(props: { status: Row['status'] }) {
  const className = props.status === 'posted'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : props.status === 'draft'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-slate-200 bg-slate-50 text-slate-500'
  return <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${className}`}>{statusLabel(props.status)}</span>
}

function SummaryCell(props: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-400">{props.label}</div>
      <div className="font-semibold text-slate-800">{props.value}</div>
    </div>
  )
}

function IconButton(props: { children: React.ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={props.label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={props.disabled}
      title={props.label}
      type="button"
      onClick={props.onClick}
    >
      {props.children}
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
      <Input
        data-error-key={props.errorKey}
        className={`h-9 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : ''} ${props.inputClassName ?? ''}`.trim()}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FormField>
  )
}

function SelectField(props: {
  disabled?: boolean
  displayMode?: 'code-name' | 'name'
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
        className={`h-9 w-full rounded-md border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : `border-slate-300 bg-white ${props.value ? 'text-slate-900' : 'text-slate-400'}`}`}
        disabled={props.disabled}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option disabled value="">{props.placeholder}</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{props.displayMode === 'name' ? option.name : optionLabel(option)}</option>)}
      </select>
    </FormField>
  )
}

function SearchableProductField(props: {
  error?: string
  errorKey: string
  onChange: (value: string) => void
  options: Option[]
  value: string
}) {
  const selectedOption = props.options.find((option) => option.id === props.value)
  const selectedLabel = selectedOption ? optionLabel(selectedOption) : ''
  const [query, setQuery] = useState(selectedLabel)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = props.options
    .filter((option) => {
      if (!normalizedQuery) return true
      return optionLabel(option).toLowerCase().includes(normalizedQuery)
    })
    .slice(0, 30)

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function selectOption(option: Option) {
    props.onChange(option.id)
    setQuery(optionLabel(option))
    setOpen(false)
  }

  return (
    <FormField error={props.error} errorKey={props.errorKey} label="สินค้า *">
      <div className="relative">
        <Input
          aria-expanded={open}
          autoComplete="off"
          className={`h-9 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : ''}`}
          data-error-key={props.errorKey}
          placeholder="พิมพ์รหัส/ชื่อสินค้า..."
          role="combobox"
          value={query}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={(event) => {
            const nextQuery = event.target.value
            setQuery(nextQuery)
            setOpen(true)
            if (props.value && nextQuery !== selectedLabel) props.onChange('')
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setOpen(true)
              setActiveIndex((current) => filteredOptions.length > 0 ? Math.min(filteredOptions.length - 1, current + 1) : 0)
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
              setActiveIndex((current) => Math.max(0, current - 1))
              return
            }
            if (event.key === 'Enter' && open && filteredOptions[activeIndex]) {
              event.preventDefault()
              selectOption(filteredOptions[activeIndex])
            }
            if (event.key === 'Escape') setOpen(false)
          }}
        />
        {open ? (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
              <button
                key={option.id}
                className={`block w-full px-3 py-2 text-left text-xs focus:outline-none ${index === activeIndex ? 'bg-slate-100' : 'hover:bg-slate-50 focus:bg-slate-50'}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
              >
                <span className="font-mono text-slate-700">{option.code ?? option.id}</span>
                <span className="ml-2 text-slate-600">{option.name}</span>
              </button>
            )) : (
              <div className="px-3 py-2 text-xs text-slate-400">ไม่พบสินค้า</div>
            )}
          </div>
        ) : null}
      </div>
    </FormField>
  )
}

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}
