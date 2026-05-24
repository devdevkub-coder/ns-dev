'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button as UiButton } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input as UiInput } from '@/components/ui/Input'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Select as UiSelect } from '@/components/ui/Select'
import { TableNumberCell } from '@/components/ui/TableNumberCell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { poBuyFormSchema, type PoBuyFormValues } from '@/lib/po-buy'

type Option = {
  active?: boolean | null
  branchId?: string | null
  branchName?: string | null
  code?: string | null
  id: string
  name: string
  unit?: string | null
}

type PoBuyFormItem = {
  productId: string
  qty: number
  unitPrice: number
}

type PoBuyFormState = {
  branchId: string
  expectedDelivery: string
  items: PoBuyFormItem[]
  notes: string
  supplierId: string
}

type PoBuyPayload = {
  filters: { statuses: string[] }
  options: {
    branches: Option[]
    products: Option[]
    suppliers: Option[]
  }
  rows: PoBuyRow[]
  summary: { open: number; remainingAmount: number; remainingQty: number; totalAmount: number; totalRows: number }
}

type PoBuyItem = {
  productId: string
  productName: string
  qty: number
  remainingQty: number
  unitPrice: number
}

type PoBuyRow = {
  branchId: string
  createdAt: string
  createdBy: string
  date: string
  docNo: string
  expectedDelivery: string
  id: string
  itemCount: number
  items: PoBuyItem[]
  notes: string
  productName: string
  qty: number
  remainingAmount: number
  remainingQty: number
  status: string
  supplierId: string
  supplierName: string
  totalAmount: number
  updatedAt: string
  updatedBy: string
}

type FieldErrors = Record<string, string>
type PoBuySortDirection = 'asc' | 'desc'
type PoBuySortKey = 'date' | 'docNo' | 'expectedDelivery' | 'itemCount' | 'productName' | 'qty' | 'remainingQty' | 'status' | 'supplierName' | 'totalAmount' | 'updatedAt'

function blankItem(): PoBuyFormItem {
  return { productId: '', qty: 0, unitPrice: 0 }
}

function blankForm(): PoBuyFormState {
  return {
    branchId: '',
    expectedDelivery: '',
    items: [blankItem()],
    notes: '',
    supplierId: '',
  }
}

function flattenClientErrors(values: PoBuyFormState) {
  const parsed = poBuyFormSchema.safeParse({
    ...values,
    expectedDelivery: values.expectedDelivery || null,
    notes: values.notes || null,
  })
  if (parsed.success) return { data: parsed.data, errors: {} }

  const errors: FieldErrors = {}
  parsed.error.issues.forEach((issue) => {
    const path = issue.path.join('.')
    if (!errors[path]) errors[path] = issue.message
  })
  return { data: null, errors }
}

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}

function searchableText(option: Option) {
  return `${option.code ?? ''} ${option.name} ${option.id}`.toLowerCase()
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: '2-digit',
  })
}

function ExportButton({ href }: { href: string }) {
  return (
    <UiButton asChild className="ml-auto gap-2" variant="export">
      <a href={href}>
        <Download className="h-4 w-4 shrink-0" />
        <span>ส่งออก Excel</span>
      </a>
    </UiButton>
  )
}

export function PoBuyPageClient() {
  const [cancelNote, setCancelNote] = useState('')
  const [cancelNoteError, setCancelNoteError] = useState('')
  const [cancelingRow, setCancelingRow] = useState<PoBuyRow | null>(null)
  const [data, setData] = useState<PoBuyPayload | null>(null)
  const [editingPoId, setEditingPoId] = useState<string | null>(null)
  const [editingPoNo, setEditingPoNo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [form, setForm] = useState<PoBuyFormState>(() => blankForm())
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [selectedPoIds, setSelectedPoIds] = useState<string[]>([])
  const [selectedRow, setSelectedRow] = useState<PoBuyRow | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [sortDirection, setSortDirection] = useState<PoBuySortDirection>('desc')
  const [sortKey, setSortKey] = useState<PoBuySortKey>('date')
  const [status, setStatus] = useState('all')
  const [toDate, setToDate] = useState('')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<PoBuyPayload>('/api/purchase/po-buy'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด PO Buy ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const formTotals = useMemo(() => {
    const totalQty = form.items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
    const totalCost = form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0)
    return { lineCount: form.items.length, totalCost, totalQty }
  }, [form.items])

  const openCreateForm = () => {
    setEditingPoId(null)
    setEditingPoNo(null)
    setForm(blankForm())
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  const openEditForm = (row: PoBuyRow) => {
    setEditingPoId(row.id)
    setEditingPoNo(row.docNo)
    setSelectedRow(null)
    setForm({
      branchId: row.branchId,
      expectedDelivery: row.expectedDelivery,
      items: row.items.map((item) => ({
        productId: item.productId,
        qty: item.qty,
        unitPrice: item.unitPrice,
      })),
      notes: row.notes ?? '',
      supplierId: row.supplierId,
    })
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  const openCancelDialog = (row: PoBuyRow) => {
    setCancelingRow(row)
    setCancelNote('')
    setCancelNoteError('')
    setError(null)
  }

  const updateForm = <Key extends keyof PoBuyFormState>(key: Key, value: PoBuyFormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const updateItem = <Key extends keyof PoBuyFormItem>(index: number, key: Key, value: PoBuyFormItem[Key]) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[`items.${index}.${key}`]
      return next
    })
  }

  const addItem = () => {
    setForm((current) => ({ ...current, items: [...current.items, blankItem()] }))
  }

  const removeItem = (index: number) => {
    setForm((current) => current.items.length <= 1
      ? current
      : { ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) })
  }

  const submitForm = async () => {
    const parsed = flattenClientErrors(form)
    if (!parsed.data) {
      setFieldErrors(parsed.errors)
      setError('ตรวจข้อมูลในฟอร์มก่อนบันทึก')
      return
    }

    setError(null)
    setFieldErrors({})
    setIsSaving(true)
    try {
      const payload: PoBuyFormValues = parsed.data
      const created = await dailyFetchJson<{ docNo: string; id: string }>('/api/purchase/po-buy', {
        body: JSON.stringify(editingPoId ? { ...payload, id: editingPoId } : payload),
        method: editingPoId ? 'PUT' : 'POST',
      })
      setShowForm(false)
      setEditingPoId(null)
      setEditingPoNo(null)
      setSearch(created.docNo)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึก PO Buy ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const submitCancel = async () => {
    if (!cancelingRow) return
    const note = cancelNote.trim()
    if (!note) {
      setCancelNoteError('กรอกหมายเหตุการยกเลิก')
      return
    }

    setError(null)
    setCancelNoteError('')
    setIsSaving(true)
    try {
      const cancelled = await dailyFetchJson<{ docNo: string; id: string }>('/api/purchase/po-buy', {
        body: JSON.stringify({ id: cancelingRow.id, note }),
        method: 'PATCH',
      })
      setCancelingRow(null)
      setCancelNote('')
      setSearch(cancelled.docNo)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิก PO Buy ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filteredRows = (data?.rows ?? []).filter((row) => {
      if (status !== 'all' && row.status !== status) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      if (!query) return true
      return `${row.docNo} ${row.supplierName} ${row.productName} ${row.status}`.toLowerCase().includes(query)
    })
    return [...filteredRows].sort((left, right) => {
      const leftValue = poBuySortValue(left, sortKey)
      const rightValue = poBuySortValue(right, sortKey)
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'th')
      return sortDirection === 'asc' ? result : -result
    })
  }, [data?.rows, fromDate, search, sortDirection, sortKey, status, toDate])

  useEffect(() => {
    setPage(1)
  }, [fromDate, pageSize, search, sortDirection, sortKey, status, toDate])

  const openRows = (data?.rows ?? []).filter((row) => row.status.toLowerCase().includes('open'))
  const partialRows = (data?.rows ?? []).filter((row) => row.status.toLowerCase().includes('partial'))
  const receivedRows = (data?.rows ?? []).filter((row) => row.status.toLowerCase().includes('received'))
  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (selectedPoIds.length > 0) params.set('ids', selectedPoIds.join(','))
    return `/api/purchase/po-buy?${params.toString()}`
  }, [fromDate, search, selectedPoIds, status, toDate])

  const resetFilters = () => {
    setFromDate('')
    setSearch('')
    setStatus('all')
    setToDate('')
  }

  const changeSort = (nextKey: PoBuySortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'date' ? 'desc' : 'asc')
  }

  const hasFilters = status !== 'all' || fromDate || toDate || search.trim()
  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const allVisibleSelected = pageRows.length > 0 && pageRows.every((row) => selectedPoIds.includes(row.id))

  const toggleVisibleSelection = () => {
    setSelectedPoIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !pageRows.some((row) => row.id === id))
      return [...new Set([...current, ...pageRows.map((row) => row.id)])]
    })
  }

  const toggleRowSelection = (id: string) => {
    setSelectedPoIds((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id])
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-md bg-gradient-to-br from-blue-500 to-indigo-700 p-4 text-white shadow">
          <div className="text-xs opacity-80">📋 PO ทั้งหมด</div>
          <div className="text-2xl font-bold">{data?.summary.totalRows ?? 0}</div>
          <div className="mt-1 text-xs opacity-80">มูลค่ารวม {formatMoney(data?.summary.totalAmount ?? 0)}</div>
        </div>
        <Metric color="blue" label="🆕 Open" sublabel="รอรับ 100%" value={`${openRows.length || data?.summary.open || 0}`} />
        <Metric color="amber" label="⚙ Partial" sublabel="รับบางส่วน" value={`${partialRows.length}`} />
        <Metric color="emerald" label="✓ Received" sublabel="รับครบแล้ว" value={`${receivedRows.length}`} />
        <Metric box color="amber" label="⏳ น้ำหนักรอรับ" sublabel={`${data?.summary.totalRows ?? 0} PO`} value={formatMoney(data?.summary.remainingQty ?? 0)} />
        <Metric box color="red" label="💰 มูลค่ารอรับ" sublabel={`${data?.summary.totalRows ?? 0} PO`} value={formatMoney(data?.summary.remainingAmount ?? 0)} />
      </div>

      <div className="space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <UiInput className="min-w-[260px] flex-1 rounded-md" placeholder="ค้นหาเลข PO / ชื่อ Supplier / ชื่อสินค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="text-xs text-slate-500">วันที่:</label>
          <DatePickerInput id="po-buy-date-from" value={fromDate} onChange={setFromDate} />
          <span className="text-slate-400">→</span>
          <DatePickerInput id="po-buy-date-to" value={toDate} onChange={setToDate} />
          {hasFilters ? <UiButton size="xs" type="button" variant="secondary" onClick={resetFilters}>✕ ล้าง</UiButton> : null}
          <ExportButton href={exportHref} />
          <UiButton type="button" onClick={openCreateForm}>+ PO Buy ใหม่</UiButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">สถานะ:</span>
          <PoBuySegment current={status} label="ทุกสถานะ" value="all" onClick={setStatus} />
          <PoBuySegment current={status} label="เปิดอยู่" value="Open" onClick={setStatus} />
          <PoBuySegment current={status} label="บางส่วน" value="Partially Received" onClick={setStatus} />
          <PoBuySegment current={status} label="รับครบ" value="Received" onClick={setStatus} />
          <PoBuySegment current={status} label="ยกเลิก" value="Cancelled" onClick={setStatus} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          <UiSelect
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto min-w-[96px] px-2"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={10}>10 / หน้า</option>
            <option value={25}>25 / หน้า</option>
            <option value={50}>50 / หน้า</option>
            <option value={100}>100 / หน้า</option>
          </UiSelect>
          <UiButton className="font-normal" disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</UiButton>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <UiButton className="font-normal" disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</UiButton>
        </div>
      </div>

      <Table className="min-w-[1240px]">
        <TableHeader><tr><TableHead className="text-center font-semibold text-slate-700"><input aria-label="เลือก PO ทั้งหมดในตาราง" checked={allVisibleSelected} disabled={rows.length === 0} type="checkbox" onChange={toggleVisibleSelection} /></TableHead><PoBuySortHeader activeKey={sortKey} className="w-36" direction={sortDirection} label="เลขที่" sortKey="docNo" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} className="w-28" direction={sortDirection} label="วันที่สร้างเอกสาร" sortKey="date" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} className="w-36" direction={sortDirection} label="Supplier" sortKey="supplierName" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="รายการ" sortKey="productName" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} align="right" direction={sortDirection} label="จำนวนรวม" sortKey="qty" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} align="right" direction={sortDirection} label="มูลค่ารวม" sortKey="totalAmount" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} align="right" direction={sortDirection} label="รอรับรวม" sortKey="remainingQty" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} className="w-28" direction={sortDirection} label="วันที่กำหนดส่ง" sortKey="expectedDelivery" onSort={changeSort} /><TableHead className="w-16 text-center font-semibold text-slate-700">หมายเหตุ</TableHead><PoBuySortHeader activeKey={sortKey} align="center" className="w-28" direction={sortDirection} label="สถานะ" sortKey="status" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} className="w-28" direction={sortDirection} label="อัพเดตล่าสุด" sortKey="updatedAt" onSort={changeSort} /><TableHead className="text-right font-semibold text-slate-700">จัดการ</TableHead></tr></TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={13}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
          {!isLoading && !error && rows.length === 0 ? <TableRow><TableCell className="py-10 text-center text-slate-400" colSpan={13}>ยังไม่มี PO Buy</TableCell></TableRow> : null}
          {!isLoading && pageRows.map((row, index) => (
            <TableRow key={row.id} className={`cursor-pointer border-slate-100 hover:bg-slate-50 ${index % 2 === 1 ? 'bg-slate-50/40' : ''}`} onClick={() => setSelectedRow(row)}>
                <TableCell className="text-center"><input aria-label={`เลือก ${row.docNo}`} checked={selectedPoIds.includes(row.id)} type="checkbox" onChange={() => toggleRowSelection(row.id)} onClick={(event) => event.stopPropagation()} /></TableCell>
                <TableCell className="w-36 whitespace-nowrap font-mono">{row.docNo}</TableCell>
                <TableCell className="w-28 whitespace-nowrap">{formatDateDisplay(row.date)}</TableCell>
                <TableCell className="w-36">{row.supplierName}</TableCell>
                <TableCell>
                  <PoBuyTruncatedText text={row.productName} />
                </TableCell>
                <TableNumberCell value={formatMoney(row.qty)} />
                <TableNumberCell strong value={formatMoney(row.totalAmount)} widthClass="w-32 max-w-32" />
                <TableNumberCell tone="amber" value={formatMoney(row.remainingQty)} />
                <TableCell className="w-28 whitespace-nowrap">{formatDateDisplay(row.expectedDelivery)}</TableCell>
                <TableCell className="text-center"><PoBuyNoteIndicator note={row.notes} poNo={row.docNo} /></TableCell>
                <TableCell className="w-28 whitespace-nowrap text-center"><span className={`rounded-full px-2 py-0.5 ${statusBadge(row.status)}`}>{row.status}</span></TableCell>
                <TableCell className="w-28 whitespace-nowrap text-xs text-slate-600"><div className="truncate">{row.updatedBy || row.createdBy || '-'}</div><div className="font-mono text-[10px] text-slate-400">{formatDateTime(row.updatedAt || row.createdAt)}</div></TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <UiButton className="mr-2 font-normal" size="xs" type="button" variant="outline" onClick={(event) => { event.stopPropagation(); openEditForm(row) }}>แก้ไข</UiButton>
                  <UiButton className="font-normal" size="xs" type="button" variant="outline" onClick={(event) => { event.stopPropagation(); openCancelDialog(row) }}>ยกเลิก</UiButton>
                </TableCell>
              </TableRow>
          ))}
        </TableBody>
      </Table>
      {showForm ? (
        <PoBuyFormModal
          branches={data?.options.branches ?? []}
          errors={fieldErrors}
          form={form}
          formTotals={formTotals}
          heading={editingPoNo ? `แก้ไข PO Buy ${editingPoNo}` : 'สร้าง PO Buy (จองซื้อ)'}
          isSaving={isSaving}
          submitLabel={editingPoId ? 'บันทึกการแก้ไข' : 'บันทึก PO Buy'}
          products={data?.options.products ?? []}
          suppliers={data?.options.suppliers ?? []}
          onAddItem={addItem}
          onClose={() => setShowForm(false)}
          onRemoveItem={removeItem}
          onSubmit={submitForm}
          onUpdate={updateForm}
          onUpdateItem={updateItem}
        />
      ) : null}
      {cancelingRow ? (
        <PoBuyCancelModal
          error={cancelNoteError}
          isSaving={isSaving}
          note={cancelNote}
          row={cancelingRow}
          onChangeNote={(value) => {
            setCancelNote(value)
            setCancelNoteError('')
          }}
          onClose={() => {
            if (isSaving) return
            setCancelingRow(null)
            setCancelNote('')
            setCancelNoteError('')
          }}
          onSubmit={submitCancel}
        />
      ) : null}
      {selectedRow ? <PoBuyDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function Metric({ box, color, label, sublabel, value }: { box?: boolean; color: 'amber' | 'blue' | 'emerald' | 'red'; label: string; sublabel: string; value: string }) {
  const colorClass = color === 'red' ? 'border-red-300 bg-red-50 text-red-700' : color === 'amber' ? `${box ? 'border-amber-300 bg-amber-50' : 'border-amber-500 bg-white'} text-amber-700` : color === 'emerald' ? 'border-emerald-500 bg-white text-emerald-700' : 'border-blue-500 bg-white text-blue-700'
  return <div className={`rounded-md p-4 shadow ${box ? 'border-2' : 'border-l-4'} ${colorClass}`}><div className="text-xs">{label}</div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-slate-400">{sublabel}</div></div>
}

function PoBuyNoteIndicator({ note, poNo }: { note: string; poNo: string }) {
  const text = note.trim()
  if (!text) return <span className="text-slate-300">-</span>

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={`ดูหมายเหตุ ${poNo}`}
            className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold leading-none text-slate-600 hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
            type="button"
            onClick={(event) => event.stopPropagation()}
          >
            i
          </button>
        </TooltipTrigger>
        <TooltipContent className="w-72 whitespace-pre-wrap p-3 text-left leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function PoBuyTruncatedText({ text }: { text: string }) {
  if (!text) return <span>-</span>
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block min-w-0 truncate" tabIndex={0}>{text}</span>
        </TooltipTrigger>
        <TooltipContent align="start" className="w-80 whitespace-normal p-2 leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function PoBuyCancelModal({
  error,
  isSaving,
  note,
  onChangeNote,
  onClose,
  onSubmit,
  row,
}: {
  error: string
  isSaving: boolean
  note: string
  onChangeNote: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  row: PoBuyRow
}) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !isSaving) onClose()
    }}>
      <DialogContent className="top-auto bottom-0 w-full max-w-lg translate-x-[-50%] translate-y-0 rounded-t-md md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-md" hideClose>
        <DialogHeader className="border-b">
          <DialogTitle id="po-buy-cancel-title">ยกเลิก PO Buy {row.docNo}</DialogTitle>
          <DialogDescription>{row.supplierName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 p-4 text-sm">
          <label className="block text-xs font-medium text-slate-600" htmlFor="po-buy-cancel-note">หมายเหตุการยกเลิก *</label>
          <textarea
            id="po-buy-cancel-note"
            className="w-full rounded-md border px-3 py-2"
            maxLength={500}
            rows={3}
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
          />
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
        </div>
        <DialogFooter>
          <UiButton className="font-normal" disabled={isSaving} type="button" variant="ghost" onClick={onClose}>ปิด</UiButton>
          <UiButton className="bg-red-600 font-normal hover:bg-red-700" disabled={isSaving} type="button" variant="default" onClick={onSubmit}>{isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function poBuySortValue(row: PoBuyRow, key: PoBuySortKey) {
  if (key === 'date') return row.date
  if (key === 'docNo') return row.docNo
  if (key === 'expectedDelivery') return row.expectedDelivery || '9999-12-31'
  if (key === 'itemCount') return row.itemCount
  if (key === 'productName') return row.productName
  if (key === 'qty') return row.qty
  if (key === 'remainingQty') return row.remainingQty
  if (key === 'status') return row.status
  if (key === 'supplierName') return row.supplierName
  if (key === 'updatedAt') return row.updatedAt || row.createdAt || ''
  return row.totalAmount
}

function PoBuySortHeader({
  activeKey,
  align = 'left',
  className = '',
  direction,
  label,
  sortKey,
  onSort,
}: {
  activeKey: PoBuySortKey
  align?: 'center' | 'left' | 'right'
  className?: string
  direction: PoBuySortDirection
  label: string
  sortKey: PoBuySortKey
  onSort: (key: PoBuySortKey) => void
}) {
  const active = activeKey === sortKey
  const alignClass = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left'
  return (
    <th className={`p-0 ${className}`}>
      <button className={`flex w-full items-center gap-1 p-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 ${alignClass}`} type="button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="text-slate-400">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

function PoBuySegment({
  current,
  label,
  onClick,
  value,
}: {
  current: string
  label: string
  onClick: (value: string) => void
  value: string
}) {
  const active = current === value
  const className = value === 'Open'
    ? active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white hover:bg-blue-50'
    : value === 'Partially Received'
      ? active ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white hover:bg-amber-50'
      : value === 'Received'
        ? active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white hover:bg-emerald-50'
        : value === 'Cancelled'
          ? active ? 'border-slate-500 bg-slate-500 text-white' : 'border-slate-300 bg-white hover:bg-slate-100'
          : active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-100'

  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${className}`} type="button" onClick={() => onClick(value)}>{label}</button>
}

function statusBadge(status: string) {
  const normalized = status.toLowerCase()
  if (normalized.includes('received')) return 'bg-emerald-100 text-emerald-700'
  if (normalized.includes('partial')) return 'bg-amber-100 text-amber-700'
  if (normalized.includes('cancel')) return 'bg-slate-100 text-slate-500'
  return 'bg-blue-100 text-blue-700'
}

function SupplierSearchCombobox({
  error,
  options,
  value,
  onChange,
}: {
  error?: string
  options: Option[]
  value: string
  onChange: (supplierId: string) => void
}) {
  return (
    <SearchCombobox
      error={error}
      inputId="po-buy-supplier-search"
      label="Supplier *"
      options={options.map((supplier) => ({
        description: `${supplier.code ? `${supplier.code} · ` : ''}${supplier.id}`,
        id: supplier.id,
        label: optionLabel(supplier),
        searchText: searchableText(supplier),
      }))}
      placeholder="🔍 พิมพ์ชื่อ Supplier..."
      value={value}
      onChange={onChange}
    />
  )
}

function PoBuyFormModal({
  branches,
  errors,
  form,
  formTotals,
  heading,
  isSaving,
  products,
  submitLabel,
  suppliers,
  onAddItem,
  onClose,
  onRemoveItem,
  onSubmit,
  onUpdate,
  onUpdateItem,
}: {
  branches: Option[]
  errors: FieldErrors
  form: PoBuyFormState
  formTotals: { lineCount: number; totalCost: number; totalQty: number }
  heading: string
  isSaving: boolean
  products: Option[]
  submitLabel: string
  suppliers: Option[]
  onAddItem: () => void
  onClose: () => void
  onRemoveItem: (index: number) => void
  onSubmit: () => void
  onUpdate: <Key extends keyof PoBuyFormState>(key: Key, value: PoBuyFormState[Key]) => void
  onUpdateItem: <Key extends keyof PoBuyFormItem>(index: number, key: Key, value: PoBuyFormItem[Key]) => void
}) {
  const activeBranches = branches.filter((branch) => branch.active !== false)
  const activeSuppliers = suppliers.filter((supplier) => supplier.active !== false)
  const activeProducts = products.filter((product) => product.active !== false)
  const fieldError = (name: string) => errors[name] ? <div className="mt-1 text-xs text-red-600">{errors[name]}</div> : null

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !isSaving) onClose()
    }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-md p-0" hideClose>
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle id="po-buy-form-title">{heading}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 p-5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <SupplierSearchCombobox
                error={errors.supplierId}
                options={activeSuppliers}
                value={form.supplierId}
                onChange={(supplierId) => onUpdate('supplierId', supplierId)}
              />
              {fieldError('supplierId')}
            </div>
            <div>
              <label className="mb-1 block text-xs">สาขา/คลัง *</label>
              <UiSelect className="h-9 w-full px-2 py-1.5" value={form.branchId} onChange={(event) => onUpdate('branchId', event.target.value)}>
                <option value="">เลือกสาขา/คลัง</option>
                {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </UiSelect>
              {fieldError('branchId')}
            </div>
            <div>
              <label className="mb-1 block text-xs">วันส่งมอบ *</label>
              <DatePickerInput className="h-9 w-full" required value={form.expectedDelivery} onChange={(value) => onUpdate('expectedDelivery', value)} />
              {fieldError('expectedDelivery')}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="font-medium">📋 รายการสินค้า ({form.items.length})</label>
              <UiButton className="bg-emerald-600 font-normal hover:bg-emerald-700" size="xs" type="button" variant="default" onClick={onAddItem}>+ เพิ่มรายการ</UiButton>
            </div>
            <Table>
              <TableHeader>
                <tr><TableHead>สินค้า / Grade *</TableHead><TableHead className="w-32 text-right">จำนวน (กก.) *</TableHead><TableHead className="w-32 text-right">ราคา/หน่วย *</TableHead><TableHead className="w-32 text-right">มูลค่ารวม</TableHead><TableHead className="w-8" /></tr>
              </TableHeader>
              <TableBody>
                {form.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="p-1 align-top">
                        <UiSelect className="h-9 w-full px-2 py-1.5" value={item.productId} onChange={(event) => onUpdateItem(index, 'productId', event.target.value)}>
                          <option value="">🔍 พิมพ์รหัส/ชื่อสินค้า...</option>
                          {activeProducts.map((product) => <option key={product.id} value={product.id}>{optionLabel(product)}</option>)}
                        </UiSelect>
                        {fieldError(`items.${index}.productId`)}
                      </TableCell>
                      <TableCell className="p-1 align-top">
                        <UiInput className="h-9 w-full px-2 py-1.5 text-right" min="0" step="0.01" type="number" value={item.qty} onChange={(event) => onUpdateItem(index, 'qty', Number(event.target.value))} />
                        {fieldError(`items.${index}.qty`)}
                      </TableCell>
                      <TableCell className="p-1 align-top">
                        <UiInput className="h-9 w-full px-2 py-1.5 text-right" min="0" step="0.01" type="number" value={item.unitPrice} onChange={(event) => onUpdateItem(index, 'unitPrice', Number(event.target.value))} />
                        {fieldError(`items.${index}.unitPrice`)}
                      </TableCell>
                      <TableCell className="bg-blue-50 p-1 px-2 text-right font-bold text-blue-700">{formatMoney(item.qty * item.unitPrice)}</TableCell>
                      <TableCell className="p-1 text-center">{form.items.length > 1 ? <UiButton className="h-8 w-8 px-0 text-red-500" size="icon" type="button" variant="ghost" onClick={() => onRemoveItem(index)}>×</UiButton> : null}</TableCell>
                    </TableRow>
                ))}
              </TableBody>
              <tfoot className="bg-slate-50 font-bold">
                <tr><td className="p-2 text-right">รวม {formTotals.lineCount} รายการ</td><td className="p-2 text-right">{formatMoney(formTotals.totalQty)}</td><td /><td className="p-2 text-right text-base text-blue-700">{formatMoney(formTotals.totalCost)}</td><td /></tr>
              </tfoot>
            </Table>
            {fieldError('items')}
          </div>

          <div>
            <label className="mb-1 block text-xs">หมายเหตุ</label>
            <textarea className="w-full rounded-md border px-2 py-1.5" rows={2} value={form.notes} onChange={(event) => onUpdate('notes', event.target.value)} />
            {fieldError('notes')}
          </div>
        </div>
        <DialogFooter className="px-5">
          <UiButton className="font-normal" disabled={isSaving} type="button" variant="ghost" onClick={onClose}>ยกเลิก</UiButton>
          <UiButton className="bg-blue-600 font-normal hover:bg-blue-700" disabled={isSaving} type="button" variant="default" onClick={onSubmit}>{isSaving ? 'กำลังบันทึก...' : submitLabel}</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PoBuyDetailModal({ onClose, row }: { onClose: () => void; row: PoBuyRow }) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto rounded-md p-0" hideClose>
        <DialogHeader className="border-b p-4">
          <div>
            <DialogTitle id="po-buy-detail-title">รายละเอียด {row.docNo}</DialogTitle>
            <DialogDescription>{row.supplierName}</DialogDescription>
          </div>
        </DialogHeader>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <Detail label="วันที่สร้างเอกสาร" value={formatDateDisplay(row.date)} />
          <Detail label="วันที่กำหนดส่ง" value={formatDateDisplay(row.expectedDelivery)} />
          <Detail label="สถานะ" value={row.status} />
          <Detail label="Qty" value={formatMoney(row.qty)} />
          <Detail label="คงเหลือ" value={formatMoney(row.remainingQty)} />
        </div>
        {row.notes.trim() ? (
          <div className="px-4 pb-4">
            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <div className="text-xs text-slate-500">หมายเหตุ</div>
              <div className="mt-1 whitespace-pre-wrap text-slate-700">{row.notes}</div>
            </div>
          </div>
        ) : null}
        <div className="px-4 pb-4">
          <Table>
            <TableHeader><tr><TableHead>สินค้า</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">คงเหลือ</TableHead><TableHead className="text-right">ราคา</TableHead></tr></TableHeader>
            <TableBody>
                {row.items.map((item, index) => (
                  <TableRow key={`${item.productId}-${index}`}>
                    <TableCell>{item.productName || '-'}</TableCell>
                    <TableCell className="text-right">{formatMoney(item.qty)}</TableCell>
                    <TableCell className="text-right">{formatMoney(item.remainingQty)}</TableCell>
                    <TableCell className="text-right">{formatMoney(item.unitPrice)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter>
          <UiButton className="font-normal" type="button" variant="outline" onClick={onClose}>ปิด</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium">{value}</div></div>
}
