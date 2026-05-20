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
  requireDelivery: boolean
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
  summary: { costingOnly: number; delivery: number; open: number; remainingAmount: number; remainingQty: number; totalAmount: number; totalRows: number }
}

type PoBuyItem = {
  productId: string
  productName: string
  qty: number
  remainingQty: number
  unitPrice: number
}

type PoBuyRow = {
  createdBy: string
  date: string
  docNo: string
  expectedDelivery: string
  id: string
  itemCount: number
  items: PoBuyItem[]
  productName: string
  purpose: string
  purposeLabel: string
  qty: number
  remainingAmount: number
  remainingQty: number
  requireDelivery: boolean
  status: string
  supplierName: string
  totalAmount: number
}

type FieldErrors = Record<string, string>

function blankItem(): PoBuyFormItem {
  return { productId: '', qty: 0, unitPrice: 0 }
}

function blankForm(): PoBuyFormState {
  return {
    branchId: '',
    expectedDelivery: '',
    items: [blankItem()],
    notes: '',
    requireDelivery: true,
    supplierId: '',
  }
}

function flattenClientErrors(values: PoBuyFormState) {
  const parsed = poBuyFormSchema.safeParse({
    ...values,
    expectedDelivery: values.requireDelivery ? values.expectedDelivery || null : null,
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

export function PoBuyPageClient() {
  const [data, setData] = useState<PoBuyPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [filter, setFilter] = useState<'all' | 'delivery' | 'costing'>('all')
  const [form, setForm] = useState<PoBuyFormState>(() => blankForm())
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<PoBuyRow | null>(null)
  const [showForm, setShowForm] = useState(false)
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
    setForm(blankForm())
    setFieldErrors({})
    setError(null)
    setShowForm(true)
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
        body: JSON.stringify(payload),
        method: 'POST',
      })
      setShowForm(false)
      setSearch(created.docNo)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึก PO Buy ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      if (filter === 'delivery' && !row.requireDelivery) return false
      if (filter === 'costing' && row.requireDelivery) return false
      if (status !== 'all' && row.status !== status) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      if (!query) return true
      return `${row.docNo} ${row.supplierName} ${row.productName} ${row.status} ${row.purposeLabel}`.toLowerCase().includes(query)
    })
  }, [data?.rows, filter, fromDate, search, status, toDate])

  const openRows = (data?.rows ?? []).filter((row) => row.status.toLowerCase().includes('open'))
  const partialRows = (data?.rows ?? []).filter((row) => row.status.toLowerCase().includes('partial'))
  const receivedRows = (data?.rows ?? []).filter((row) => row.status.toLowerCase().includes('received'))
  const outstandingRows = (data?.rows ?? [])
    .filter((row) => row.requireDelivery && row.remainingQty > 0 && !row.status.toLowerCase().includes('cancel'))
    .sort((left, right) => (left.expectedDelivery || '9999-12-31').localeCompare(right.expectedDelivery || '9999-12-31'))
    .slice(0, 8)
  const topSuppliers = Array.from((data?.rows ?? []).reduce((map, row) => {
    const current = map.get(row.supplierName) ?? { count: 0, name: row.supplierName, outstanding: 0, value: 0 }
    current.count += 1
    current.outstanding += row.remainingAmount
    current.value += row.totalAmount
    map.set(row.supplierName, current)
    return map
  }, new Map<string, { count: number; name: string; outstanding: number; value: number }>()).values()).sort((left, right) => right.value - left.value).slice(0, 5)
  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (search.trim()) params.set('q', search.trim())
    if (status !== 'all') params.set('status', status)
    if (filter !== 'all') params.set('purpose', filter)
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return `/api/purchase/po-buy?${params.toString()}`
  }, [filter, fromDate, search, status, toDate])

  const resetFilters = () => {
    setFilter('all')
    setFromDate('')
    setSearch('')
    setStatus('all')
    setToDate('')
  }

  const hasFilters = filter !== 'all' || status !== 'all' || fromDate || toDate || search.trim()

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <strong>📥 PO Buy = จองซื้อล่วงหน้า</strong> — ยังไม่นับเป็น Stock จริง แต่เข้า Cost Pool ใช้ Match กับ PO Sell ได้ทันที · 1 บิลรองรับหลายรายการ
      </div>
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
        <Metric box color="amber" label="⏳ น้ำหนักรอรับ" sublabel={`${outstandingRows.length} รายการ` } value={formatMoney(data?.summary.remainingQty ?? 0)} />
        <Metric box color="red" label="💰 มูลค่ารอรับ" sublabel={`${data?.summary.delivery ?? 0} PO`} value={formatMoney(data?.summary.remainingAmount ?? 0)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 Supplier (ยอดสั่งซื้อ)</div>
          <BarList rows={topSuppliers.map((supplier) => ({ label: supplier.name, note: `${supplier.count} PO`, subnote: supplier.outstanding > 0 ? `⏳ รอรับ ${formatMoney(supplier.outstanding)}` : '', value: supplier.value }))} />
        </div>
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between text-sm font-bold text-slate-700">
            <span>📋 PO ค้างรับสินค้า ({outstandingRows.length})</span>
            <span className="text-xs font-normal text-amber-700">เรียงตามวันส่งมอบ</span>
          </div>
          {outstandingRows.length === 0 ? <div className="py-4 text-center text-xs text-emerald-600">✅ ไม่มี PO ค้างรับ</div> : (
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-50"><tr><th className="p-1 text-left">เลขที่</th><th className="p-1 text-left">Supplier</th><th className="p-1 text-left">สินค้า</th><th className="p-1 text-right">รอรับ</th><th className="p-1 text-right">มูลค่า</th><th className="p-1 text-left">วันส่ง</th></tr></thead>
                <tbody>{outstandingRows.map((row) => <tr key={row.id} className="border-t hover:bg-amber-50"><td className="p-1 font-mono">{row.docNo}</td><td className="max-w-28 truncate p-1">{row.supplierName}</td><td className="max-w-28 truncate p-1">{row.productName}</td><td className="p-1 text-right font-bold text-amber-700">{formatMoney(row.remainingQty)}</td><td className="p-1 text-right text-blue-700">{formatMoney(row.remainingAmount)}</td><td className="p-1">{row.expectedDelivery || '-'}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 rounded-xl bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[260px] flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="🔍 ค้นหาเลข PO / ชื่อ Supplier / ชื่อสินค้า / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="text-xs text-slate-500">วันที่:</label>
          <input aria-label="วันที่เริ่มต้น" className="rounded-lg border px-2 py-2 text-sm" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <span className="text-slate-400">→</span>
          <input aria-label="วันที่สิ้นสุด" className="rounded-lg border px-2 py-2 text-sm" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          {hasFilters ? <button className="rounded bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={resetFilters}>✕ ล้าง</button> : null}
          <button className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="button" onClick={openCreateForm}>+ PO Buy ใหม่</button>
          <a className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={exportHref}>Export XLSX</a>
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
          <span className="ml-auto text-xs text-slate-500">📊 พบ <b className="text-slate-700">{rows.length}</b> PO</span>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <PurposeCard active={filter === 'delivery'} count={data?.summary.delivery ?? 0} description="PO ที่ supplier ต้องส่งของ · เข้า PO Outstanding · ตัดบิลรับซื้อ" label="📦 ส่งของจริง" onClick={() => setFilter('delivery')} tone="indigo" />
        <PurposeCard active={filter === 'costing'} count={data?.summary.costingOnly ?? 0} description="Imported · ไม่เข้า PO Outstanding · matching กับ PO Sell เท่านั้น" label="💰 Cost Pool / Deal Costing" onClick={() => setFilter('costing')} tone="emerald" />
        <PurposeCard active={filter === 'all'} count={data?.summary.totalRows ?? 0} description="รวมทั้ง 2 ประเภท" label="📋 ทั้งหมด" onClick={() => setFilter('all')} tone="slate" />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-center">เลือก</th><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">Supplier</th><th className="p-2 text-left">รายการ</th><th className="p-2 text-right">จำนวนรวม</th><th className="p-2 text-right">มูลค่ารวม</th><th className="p-2 text-right">รอรับรวม</th><th className="p-2 text-left">Delivery</th><th className="p-2 text-center">สถานะ</th><th className="p-2 text-right">Actions</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && rows.length === 0 ? <tr><td className="py-10 text-center text-slate-400" colSpan={11}>ยังไม่มี PO Buy</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr key={row.id} className={`border-t hover:bg-blue-50/30 ${!row.requireDelivery ? 'bg-emerald-50/30' : ''}`}>
                <td className="p-2 text-center"><input aria-label={`เลือก ${row.docNo}`} type="checkbox" disabled /></td>
                <td className="p-2 font-mono text-xs">{row.docNo}{!row.requireDelivery ? <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">💰 Costing</span> : null}</td>
                <td className="p-2">{row.date}</td>
                <td className="p-2">{row.supplierName}</td>
                <td className="max-w-72 truncate p-2 text-xs">{row.productName}</td>
                <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                <td className="p-2 text-right font-medium">{formatMoney(row.totalAmount)}</td>
                <td className="p-2 text-right text-amber-700">{formatMoney(row.remainingQty)}</td>
                <td className="p-2">{row.expectedDelivery || '-'}</td>
                <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge(row.status)}`}>{row.status}</span></td>
                <td className="whitespace-nowrap p-2 text-right">
                  <button className="mr-2 text-xs text-blue-600 hover:underline" type="button" onClick={() => setSelectedRow(row)}>ดู</button>
                  <button className="mr-2 text-xs text-amber-600 opacity-50" type="button" disabled>ย้าย</button>
                  <button className="text-xs text-red-600 opacity-50" type="button" disabled>ยกเลิก</button>
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
          isSaving={isSaving}
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
      {selectedRow ? <PoBuyDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function Metric({ box, color, label, sublabel, value }: { box?: boolean; color: 'amber' | 'blue' | 'emerald' | 'red'; label: string; sublabel: string; value: string }) {
  const colorClass = color === 'red' ? 'border-red-300 bg-red-50 text-red-700' : color === 'amber' ? `${box ? 'border-amber-300 bg-amber-50' : 'border-amber-500 bg-white'} text-amber-700` : color === 'emerald' ? 'border-emerald-500 bg-white text-emerald-700' : 'border-blue-500 bg-white text-blue-700'
  return <div className={`rounded-xl p-4 shadow ${box ? 'border-2' : 'border-l-4'} ${colorClass}`}><div className="text-xs">{label}</div><div className="text-2xl font-bold">{value}</div><div className="text-xs text-slate-400">{sublabel}</div></div>
}

function BarList({ rows }: { rows: { label: string; note: string; subnote: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  if (rows.length === 0) return <div className="text-xs text-slate-400">ไม่มีข้อมูล</div>
  return <div className="space-y-2">{rows.map((row, index) => <div key={row.label} className="text-xs"><div className="mb-0.5 flex items-center gap-2"><span className="w-4 text-center font-bold text-slate-400">{index + 1}</span><span className="flex-1 truncate">{row.label}</span><span className="text-slate-500">{row.note}</span><span className="w-24 text-right font-bold text-blue-700">{formatMoney(row.value)}</span></div><div className="ml-6 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500" style={{ width: `${Math.min(100, row.value / max * 100)}%` }} /></div>{row.subnote ? <div className="ml-6 text-xs text-amber-600">{row.subnote}</div> : null}</div>)}</div>
}

function PurposeCard({ active, count, description, label, onClick, tone }: { active: boolean; count: number; description: string; label: string; onClick: () => void; tone: 'emerald' | 'indigo' | 'slate' }) {
  const activeClass = tone === 'emerald' ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-200' : tone === 'indigo' ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-700 bg-slate-100 ring-2 ring-slate-300'
  const countClass = tone === 'emerald' ? 'text-emerald-700' : tone === 'indigo' ? 'text-indigo-700' : 'text-slate-700'
  return <button className={`rounded-xl border-2 p-3 text-left shadow-sm transition ${active ? activeClass : 'border-slate-200 bg-white hover:border-slate-400'}`} type="button" onClick={onClick}><div className="flex items-center justify-between"><div className="text-sm font-bold">{label}</div><div className={`text-2xl font-extrabold ${active ? countClass : 'text-slate-700'}`}>{count}</div></div><div className="mt-0.5 text-xs text-slate-500">{description}</div></button>
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
  isSaving,
  products,
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
  isSaving: boolean
  products: Option[]
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
          <h3 id="po-buy-form-title" className="font-semibold">สร้าง PO Buy (จองซื้อ / ตั้งต้นทุน)</h3>
          <button className="text-2xl text-slate-400 hover:text-slate-600" type="button" onClick={onClose}>×</button>
        </div>
        <div className="space-y-3 p-5 text-sm">
          <div className="rounded border-l-4 border-amber-500 bg-amber-50 p-3">
            <label className="mb-2 block text-xs font-bold text-amber-800">🎯 วัตถุประสงค์ของ PO Buy นี้</label>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-2 rounded border-2 bg-white p-2 ${form.requireDelivery ? 'border-blue-500' : 'border-transparent'}`}>
                <input checked={form.requireDelivery} className="mt-1" type="radio" onChange={() => onUpdate('requireDelivery', true)} />
                <span>
                  <span className="block text-sm font-bold text-blue-700">📦 ต้องส่งของจริง</span>
                  <span className="text-xs text-slate-500">เข้า PO Outstanding Report · รอรับสินค้าตามเวลา</span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-2 rounded border-2 bg-white p-2 ${!form.requireDelivery ? 'border-emerald-500' : 'border-transparent'}`}>
                <input checked={!form.requireDelivery} className="mt-1" type="radio" onChange={() => onUpdate('requireDelivery', false)} />
                <span>
                  <span className="block text-sm font-bold text-emerald-700">💰 ตั้งต้นทุน Dual Costing เท่านั้น</span>
                  <span className="text-xs text-slate-500">ส่งของหมดแล้ว / ใช้คำนวณต้นทุน · <b>ไม่เข้า PO Outstanding Report</b></span>
                </span>
              </label>
            </div>
          </div>

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
              <label className="mb-1 block text-xs">สาขา *</label>
              <select className="w-full rounded border px-2 py-1.5" value={form.branchId} onChange={(event) => onUpdate('branchId', event.target.value)}>
                <option value="">เลือกสาขา</option>
                {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              {fieldError('branchId')}
            </div>
            {form.requireDelivery ? (
              <div>
                <label className="mb-1 block text-xs">วันส่งมอบ</label>
                <input className="w-full rounded border px-2 py-1.5" type="date" value={form.expectedDelivery} onChange={(event) => onUpdate('expectedDelivery', event.target.value)} />
                {fieldError('expectedDelivery')}
              </div>
            ) : null}
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
          <button className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={onSubmit}>{isSaving ? 'กำลังบันทึก...' : 'บันทึก PO Buy'}</button>
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
          <Detail label="ประเภท" value={row.purposeLabel} />
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
