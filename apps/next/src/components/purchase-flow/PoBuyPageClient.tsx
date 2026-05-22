'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
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
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 p-4 text-white shadow">
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

      <div className="space-y-2 rounded-xl bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[260px] flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="🔍 ค้นหาเลข PO / ชื่อ Supplier / ชื่อสินค้า / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="text-xs text-slate-500">วันที่:</label>
          <input aria-label="วันที่เริ่มต้น" className="rounded-lg border px-2 py-2 text-sm" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <span className="text-slate-400">→</span>
          <input aria-label="วันที่สิ้นสุด" className="rounded-lg border px-2 py-2 text-sm" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          {hasFilters ? <button className="rounded bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={resetFilters}>✕ ล้าง</button> : null}
          <a className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700" href={exportHref}>Export Excel</a>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" type="button" onClick={openCreateForm}>+ PO Buy ใหม่</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">สถานะ:</span>
          <button className={`rounded border px-3 py-1 text-xs font-medium ${status === 'all' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`} type="button" onClick={() => setStatus('all')}>ทั้งหมด</button>
          {['Open', 'Partially Received', 'Received', 'Cancelled'].map((item) => (
            <button key={item} className={`rounded border px-3 py-1 text-xs font-medium ${status === item ? statusButtonClass(item, true) : statusButtonClass(item, false)}`} type="button" onClick={() => setStatus(item)}>{item === 'Partially Received' ? 'Partial' : item}</button>
          ))}
          <select aria-label="สถานะ" className="rounded-lg border px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ จาก <span className="font-semibold text-slate-900">{totalPages}</span> หน้า</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="rounded border border-slate-300 px-2 py-1"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={10}>10 / หน้า</option>
            <option value={25}>25 / หน้า</option>
            <option value={50}>50 / หน้า</option>
            <option value={100}>100 / หน้า</option>
          </select>
          <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={currentPage <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={currentPage >= totalPages} type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-center font-semibold text-slate-700"><input aria-label="เลือก PO ทั้งหมดในตาราง" checked={allVisibleSelected} disabled={rows.length === 0} type="checkbox" onChange={toggleVisibleSelection} /></th><PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="เลขที่" sortKey="docNo" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="วันที่" sortKey="date" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="Supplier" sortKey="supplierName" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="รายการ" sortKey="productName" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} align="right" direction={sortDirection} label="จำนวนรวม" sortKey="qty" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} align="right" direction={sortDirection} label="มูลค่ารวม" sortKey="totalAmount" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} align="right" direction={sortDirection} label="รอรับรวม" sortKey="remainingQty" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="กำหนดส่ง" sortKey="expectedDelivery" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} align="center" direction={sortDirection} label="สถานะ" sortKey="status" onSort={changeSort} /><PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="อัพเดตล่าสุด" sortKey="updatedAt" onSort={changeSort} /><th className="p-2 text-right font-semibold text-slate-700">จัดการ</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && rows.length === 0 ? <tr><td className="py-10 text-center text-slate-400" colSpan={12}>ยังไม่มี PO Buy</td></tr> : null}
            {!isLoading && pageRows.map((row, index) => (
              <tr key={row.id} className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${index % 2 === 1 ? 'bg-slate-50/40' : ''}`} onClick={() => setSelectedRow(row)}>
                <td className="p-2 text-center"><input aria-label={`เลือก ${row.docNo}`} checked={selectedPoIds.includes(row.id)} type="checkbox" onChange={() => toggleRowSelection(row.id)} onClick={(event) => event.stopPropagation()} /></td>
                <td className="p-2 font-mono text-xs">{row.docNo}</td>
                <td className="p-2">{row.date}</td>
                <td className="p-2">{row.supplierName}</td>
                <td className="max-w-72 truncate p-2 text-xs">{row.productName}</td>
                <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                <td className="p-2 text-right font-medium">{formatMoney(row.totalAmount)}</td>
                <td className="p-2 text-right text-amber-700">{formatMoney(row.remainingQty)}</td>
                <td className="p-2">{row.expectedDelivery || '-'}</td>
                <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge(row.status)}`}>{row.status}</span></td>
                <td className="p-2 text-xs text-slate-600"><div>{row.updatedBy || row.createdBy || '-'}</div><div className="font-mono text-[10px] text-slate-400">{formatDateTime(row.updatedAt || row.createdAt)}</div></td>
                <td className="whitespace-nowrap p-2 text-right">
                  <button className="mr-2 rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={(event) => { event.stopPropagation(); openEditForm(row) }}>แก้ไข</button>
                  <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={(event) => { event.stopPropagation(); openCancelDialog(row) }}>ยกเลิก</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  return <div className={`rounded-xl p-4 shadow ${box ? 'border-2' : 'border-l-4'} ${colorClass}`}><div className="text-xs">{label}</div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-slate-400">{sublabel}</div></div>
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
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 md:items-center md:justify-center md:p-4" role="dialog" aria-modal="true" aria-labelledby="po-buy-cancel-title">
      <div className="w-full rounded-t-lg bg-white shadow-xl md:max-w-lg md:rounded-lg">
        <div className="border-b p-4">
          <h2 id="po-buy-cancel-title" className="font-semibold">ยกเลิก PO Buy {row.docNo}</h2>
          <p className="mt-1 text-sm text-slate-500">{row.supplierName}</p>
        </div>
        <div className="space-y-2 p-4 text-sm">
          <label className="block text-xs font-medium text-slate-600" htmlFor="po-buy-cancel-note">หมายเหตุการยกเลิก *</label>
          <textarea
            id="po-buy-cancel-note"
            className="w-full rounded border px-3 py-2"
            maxLength={500}
            rows={3}
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
          />
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 px-4 py-3">
          <button className="px-4 py-2 text-sm" disabled={isSaving} type="button" onClick={onClose}>ปิด</button>
          <button className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={onSubmit}>{isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}</button>
        </div>
      </div>
    </div>
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
  direction,
  label,
  sortKey,
  onSort,
}: {
  activeKey: PoBuySortKey
  align?: 'center' | 'left' | 'right'
  direction: PoBuySortDirection
  label: string
  sortKey: PoBuySortKey
  onSort: (key: PoBuySortKey) => void
}) {
  const active = activeKey === sortKey
  const alignClass = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left'
  return (
    <th className="p-0">
      <button className={`flex w-full items-center gap-1 p-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 ${alignClass}`} type="button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="text-slate-400">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

function statusButtonClass(status: string, active: boolean) {
  if (status === 'Open') return active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white hover:bg-blue-50'
  if (status === 'Partially Received') return active ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white hover:bg-amber-50'
  if (status === 'Received') return active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white hover:bg-emerald-50'
  return active ? 'border-slate-500 bg-slate-500 text-white' : 'border-slate-300 bg-white hover:bg-slate-100'
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
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedSupplier = useMemo(() => options.find((supplier) => supplier.id === value) ?? null, [options, value])
  const selectedLabel = selectedSupplier ? optionLabel(selectedSupplier) : ''
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(selectedLabel)

  useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const rows = normalizedQuery
      ? options.filter((supplier) => searchableText(supplier).includes(normalizedQuery))
      : options
    return rows.slice(0, 80)
  }, [options, query])

  const selectSupplier = (supplier: Option) => {
    onChange(supplier.id)
    setQuery(optionLabel(supplier))
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-xs" htmlFor="po-buy-supplier-search">Supplier *</label>
      <input
        ref={inputRef}
        aria-autocomplete="list"
        aria-controls="po-buy-supplier-options"
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        className={`w-full rounded border px-2 py-1.5 outline-none focus:border-blue-600 ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
        id="po-buy-supplier-search"
        placeholder="🔍 พิมพ์ชื่อ Supplier..."
        role="combobox"
        type="search"
        value={query}
        onBlur={() => {
          window.setTimeout(() => {
            const exactMatch = options.find((supplier) => optionLabel(supplier).toLowerCase() === query.trim().toLowerCase())
            if (exactMatch) {
              onChange(exactMatch.id)
              setQuery(optionLabel(exactMatch))
            } else if (selectedSupplier) {
              setQuery(optionLabel(selectedSupplier))
            }
            setOpen(false)
          }, 120)
        }}
        onChange={(event) => {
          const nextQuery = event.target.value
          setQuery(nextQuery)
          setOpen(true)
          if (value && nextQuery !== selectedLabel) onChange('')
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            return
          }
          if (event.key === 'Enter' && open && filteredOptions[0]) {
            event.preventDefault()
            selectSupplier(filteredOptions[0])
          }
        }}
      />
      {open ? (
        <div id="po-buy-supplier-options" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl" role="listbox">
          {filteredOptions.length > 0 ? filteredOptions.map((supplier) => (
            <button
              key={supplier.id}
              className={`block w-full px-3 py-2 text-left hover:bg-blue-50 ${supplier.id === value ? 'bg-blue-100 text-blue-800' : ''}`}
              role="option"
              type="button"
              aria-selected={supplier.id === value}
              onMouseDown={(event) => {
                event.preventDefault()
                selectSupplier(supplier)
              }}
            >
              <span className="block font-medium">{supplier.name}</span>
              <span className="block text-xs text-slate-500">{supplier.code ? `${supplier.code} · ` : ''}{supplier.id}</span>
            </button>
          )) : <div className="px-3 py-2 text-sm text-slate-500">ไม่พบ Supplier ที่ตรงกับคำค้นหา</div>}
        </div>
      ) : null}
    </div>
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="po-buy-form-title">
      <div className="mx-auto my-4 max-w-2xl rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 id="po-buy-form-title" className="font-semibold">{heading}</h3>
          <button className="text-2xl text-slate-400 hover:text-slate-600" type="button" onClick={onClose}>×</button>
        </div>
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
              <select className="w-full rounded border px-2 py-1.5" value={form.branchId} onChange={(event) => onUpdate('branchId', event.target.value)}>
                <option value="">เลือกสาขา/คลัง</option>
                {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              {fieldError('branchId')}
            </div>
            <div>
              <label className="mb-1 block text-xs">วันส่งมอบ *</label>
              <input className="w-full rounded border px-2 py-1.5" required type="date" value={form.expectedDelivery} onChange={(event) => onUpdate('expectedDelivery', event.target.value)} />
              {fieldError('expectedDelivery')}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="font-medium">📋 รายการสินค้า ({form.items.length})</label>
              <button className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700" type="button" onClick={onAddItem}>+ เพิ่มรายการ</button>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-100">
                  <tr><th className="p-2 text-left">สินค้า / Grade *</th><th className="w-32 p-2 text-right">จำนวน (กก.) *</th><th className="w-32 p-2 text-right">ราคา/หน่วย *</th><th className="w-32 p-2 text-right">มูลค่ารวม</th><th className="w-8 p-2" /></tr>
                </thead>
                <tbody>
                  {form.items.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-1 align-top">
                        <select className="w-full rounded border px-2 py-1.5" value={item.productId} onChange={(event) => onUpdateItem(index, 'productId', event.target.value)}>
                          <option value="">🔍 พิมพ์รหัส/ชื่อสินค้า...</option>
                          {activeProducts.map((product) => <option key={product.id} value={product.id}>{optionLabel(product)}</option>)}
                        </select>
                        {fieldError(`items.${index}.productId`)}
                      </td>
                      <td className="p-1 align-top">
                        <input className="w-full rounded border px-2 py-1.5 text-right" min="0" step="0.01" type="number" value={item.qty} onChange={(event) => onUpdateItem(index, 'qty', Number(event.target.value))} />
                        {fieldError(`items.${index}.qty`)}
                      </td>
                      <td className="p-1 align-top">
                        <input className="w-full rounded border px-2 py-1.5 text-right" min="0" step="0.01" type="number" value={item.unitPrice} onChange={(event) => onUpdateItem(index, 'unitPrice', Number(event.target.value))} />
                        {fieldError(`items.${index}.unitPrice`)}
                      </td>
                      <td className="bg-blue-50 p-1 px-2 text-right font-bold text-blue-700">{formatMoney(item.qty * item.unitPrice)}</td>
                      <td className="p-1 text-center">{form.items.length > 1 ? <button className="px-2 text-red-500" type="button" onClick={() => onRemoveItem(index)}>×</button> : null}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-bold">
                  <tr><td className="p-2 text-right">รวม {formTotals.lineCount} รายการ</td><td className="p-2 text-right">{formatMoney(formTotals.totalQty)}</td><td /><td className="p-2 text-right text-base text-blue-700">{formatMoney(formTotals.totalCost)}</td><td /></tr>
                </tfoot>
              </table>
            </div>
            {fieldError('items')}
          </div>

          <div>
            <label className="mb-1 block text-xs">หมายเหตุ</label>
            <textarea className="w-full rounded border px-2 py-1.5" rows={2} value={form.notes} onChange={(event) => onUpdate('notes', event.target.value)} />
            {fieldError('notes')}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">
          <button className="px-4 py-2 text-sm" disabled={isSaving} type="button" onClick={onClose}>ยกเลิก</button>
          <button className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={onSubmit}>{isSaving ? 'กำลังบันทึก...' : submitLabel}</button>
        </div>
      </div>
    </div>
  )
}

function PoBuyDetailModal({ onClose, row }: { onClose: () => void; row: PoBuyRow }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 p-0 md:items-center md:justify-center md:p-4" role="dialog" aria-modal="true" aria-labelledby="po-buy-detail-title">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-lg bg-white shadow-xl md:max-w-3xl md:rounded-lg">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 id="po-buy-detail-title" className="font-semibold">รายละเอียด {row.docNo}</h2>
            <p className="text-sm text-slate-500">{row.supplierName}</p>
          </div>
          <button className="rounded-lg border px-3 py-1.5 text-sm" type="button" onClick={onClose}>ปิด</button>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <Detail label="วันที่" value={row.date || '-'} />
          <Detail label="กำหนดส่ง" value={row.expectedDelivery || '-'} />
          <Detail label="สถานะ" value={row.status} />
          <Detail label="Qty" value={formatMoney(row.qty)} />
          <Detail label="คงเหลือ" value={formatMoney(row.remainingQty)} />
        </div>
        <div className="px-4 pb-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-slate-100"><tr><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">คงเหลือ</th><th className="p-2 text-right">ราคา</th></tr></thead>
              <tbody>
                {row.items.map((item, index) => (
                  <tr key={`${item.productId}-${index}`} className="border-t">
                    <td className="p-2">{item.productName || '-'}</td>
                    <td className="p-2 text-right">{formatMoney(item.qty)}</td>
                    <td className="p-2 text-right">{formatMoney(item.remainingQty)}</td>
                    <td className="p-2 text-right">{formatMoney(item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium">{value}</div></div>
}
