'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { poSellFormSchema, type PoSellFormValues } from '@/lib/sales'

type Option = {
  active?: boolean | null
  code?: string | null
  id: string
  name: string
  unit?: string | null
}

type PoSellRow = {
  branchName: string
  channelName: string
  customerName: string
  date: string
  docNo: string
  expectedDelivery: string
  id: string
  itemCount: number
  margin: number
  marginPct: number
  matchStatus: string
  matchedCost: number
  matchedPct: number
  matchedQty: number
  productName: string
  qty: number
  remainingAmount: number
  remainingQty: number
  requireDelivery: boolean
  status: string
  totalAmount: number
  unitPrice: number
}

type PoSellPayload = {
  filters: { matchStatuses: string[]; statuses: string[] }
  options: {
    branches: Option[]
    customers: Option[]
    products: Option[]
    salesChannels: Option[]
  }
  rows: PoSellRow[]
  summary: {
    fullyMatched: number
    margin: number
    open: number
    overMatched: number
    partiallyMatched: number
    qty: number
    remainingAmount: number
    remainingQty: number
    totalAmount: number
    totalRows: number
    unmatched: number
  }
}

const blankPoSellItem = (): PoSellFormValues['items'][number] => ({
  discount: 0,
  note: null,
  price: 0,
  productId: '',
  qty: 0,
})

const initialPoSellForm = (): PoSellFormValues => ({
  branchId: null,
  channelId: null,
  customerId: '',
  expectedDelivery: '',
  items: [blankPoSellItem()],
  note: null,
})

export function PoSellPageClient() {
  const [data, setData] = useState<PoSellPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<PoSellFormValues>(initialPoSellForm())
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [matchStatus, setMatchStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [status, setStatus] = useState('all')
  const [toDate, setToDate] = useState('')

  const dateQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [fromDate, toDate])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<PoSellPayload>(`/api/sales/po-sell${dateQuery ? `?${dateQuery}` : ''}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด PO Sell ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [dateQuery])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      if (matchStatus !== 'all' && row.matchStatus !== matchStatus) return false
      if (status !== 'all' && row.status !== status) return false
      if (!query) return true
      return `${row.docNo} ${row.customerName} ${row.channelName} ${row.branchName} ${row.productName} ${row.status} ${row.matchStatus}`.toLowerCase().includes(query)
    })
  }, [data?.rows, matchStatus, search, status])

  useEffect(() => {
    setPage(1)
  }, [fromDate, matchStatus, pageSize, search, status, toDate])

  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const activeBranches = (data?.options.branches ?? []).filter((option) => option.active !== false)
  const activeChannels = (data?.options.salesChannels ?? []).filter((option) => option.active !== false)
  const activeCustomers = (data?.options.customers ?? []).filter((option) => option.active !== false)
  const activeProducts = (data?.options.products ?? []).filter((option) => option.active !== false)
  const formSubtotal = form.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const formQty = form.items.reduce((sum, item) => sum + item.qty, 0)

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (search.trim()) params.set('q', search.trim())
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (status !== 'all') params.set('status', status)
    if (matchStatus !== 'all') params.set('matchStatus', matchStatus)
    return `/api/sales/po-sell?${params.toString()}`
  }, [fromDate, matchStatus, search, status, toDate])

  const hasFilters = Boolean(search.trim() || fromDate || toDate || matchStatus !== 'all' || status !== 'all')
  const resetFilters = () => {
    setSearch('')
    setFromDate('')
    setToDate('')
    setMatchStatus('all')
    setStatus('all')
  }

  function openCreateForm() {
    setForm(initialPoSellForm())
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  function updateForm<K extends keyof PoSellFormValues>(key: K, value: PoSellFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  function updateItem(index: number, key: keyof PoSellFormValues['items'][number], value: string | number | null) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setFieldErrors({})
  }

  function removeItem(index: number) {
    setForm((current) => ({ ...current, items: current.items.filter((_item, itemIndex) => itemIndex !== index) }))
  }

  async function savePoSell() {
    const parsed = poSellFormSchema.safeParse(form)
    if (!parsed.success) {
      const flattened = parsed.error.flatten()
      setFieldErrors(Object.fromEntries(Object.entries(flattened.fieldErrors).map(([key, value]) => [key, value?.[0] ?? 'ข้อมูลไม่ถูกต้อง'])))
      setError(flattened.formErrors[0] ?? 'กรุณาตรวจสอบข้อมูลในฟอร์ม')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const created = await dailyFetchJson<{ docNo: string }>('/api/sales/po-sell', {
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
      setShowForm(false)
      setSearch(created.docNo)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึก PO Sell ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section>
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Metric className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 p-4 text-white shadow" label="📋 PO ทั้งหมด" subLabel={`รายได้รวม ${formatMoney(data?.summary.totalAmount ?? 0)}`} value={`${data?.summary.totalRows ?? 0}`} valueClassName="text-2xl font-bold" />
        <Metric className="rounded-xl border-l-4 border-slate-500 bg-white p-4 shadow" label="⚪ Not Matched" subLabel="รอ Match Cost" value={`${data?.summary.unmatched ?? 0}`} valueClassName="text-2xl font-bold text-slate-700" />
        <Metric className="rounded-xl border-l-4 border-amber-500 bg-white p-4 shadow" label="⚙ Partial" subLabel="Match บางส่วน" value={`${data?.summary.partiallyMatched ?? 0}`} valueClassName="text-2xl font-bold text-amber-700" />
        <Metric className="rounded-xl border-l-4 border-emerald-500 bg-white p-4 shadow" label="✓ Fully Matched" subLabel="พร้อมขาย" value={`${data?.summary.fullyMatched ?? 0}`} valueClassName="text-2xl font-bold text-emerald-700" />
        <Metric className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 shadow" label="⏳ น้ำหนักรอส่ง" subLabel={`จาก ${formatMoney(data?.summary.qty ?? 0)} กก.`} value={formatMoney(data?.summary.remainingQty ?? 0)} valueClassName="text-xl font-bold text-amber-700" />
        <Metric className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow" label="💰 มูลค่ารอส่ง" subLabel="รายได้รอรับ" value={formatMoney(data?.summary.remainingAmount ?? 0)} valueClassName="text-xl font-bold text-emerald-700" />
      </div>

      <div className="mb-4 space-y-2 rounded-xl bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[260px] flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="🔍 ค้นหาเลข PO / ชื่อ Customer / ชื่อสินค้า / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="text-xs text-slate-500">วันที่:</label>
          <input aria-label="จากวันที่" className="rounded-lg border px-2 py-2 text-sm" title="จากวันที่" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <span className="text-slate-400">→</span>
          <input aria-label="ถึงวันที่" className="rounded-lg border px-2 py-2 text-sm" title="ถึงวันที่" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          {hasFilters ? <button className="rounded bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={resetFilters}>✕ ล้าง</button> : null}
          <a className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700" href={exportHref}>Export Excel</a>
          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={openCreateForm}>+ PO Sell ใหม่</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">สถานะ:</span>
          <MatchButton active={status === 'all'} label="ทั้งหมด" onClick={() => setStatus('all')} />
          {(data?.filters.statuses ?? []).map((item) => (
            <MatchButton key={item} active={status === item} label={item} tone={item.toLowerCase().includes('cancel') ? 'slate' : 'emerald'} onClick={() => setStatus(item)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">สถานะ Match:</span>
          <MatchButton active={matchStatus === 'all'} label="ทั้งหมด" onClick={() => setMatchStatus('all')} />
          <MatchButton active={matchStatus === 'Not Matched'} label="ยังไม่ Match" tone="slate" onClick={() => setMatchStatus('Not Matched')} />
          <MatchButton active={matchStatus === 'Partially Matched'} label="Partial" tone="amber" onClick={() => setMatchStatus('Partially Matched')} />
          <MatchButton active={matchStatus === 'Fully Matched'} label="Full" tone="emerald" onClick={() => setMatchStatus('Fully Matched')} />
          <MatchButton active={matchStatus === 'Over Matched'} label="Over" tone="red" onClick={() => setMatchStatus('Over Matched')} />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
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

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">เลขที่</th>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">Customer</th>
              <th className="p-2 text-left">รายการ</th>
              <th className="p-2 text-right">จำนวนรวม</th>
              <th className="p-2 text-right">รายได้รวม</th>
              <th className="p-2 text-right">Matched</th>
              <th className="p-2 text-right">เหลือ</th>
              <th className="p-2 text-right">Deal Margin</th>
              <th className="p-2 text-right">%</th>
              <th className="p-2 text-center">สถานะ Match</th>
              <th className="p-2 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && rows.length === 0 ? <tr><td className="py-10 text-center text-slate-400" colSpan={12}>ยังไม่มี PO Sell</td></tr> : null}
            {!isLoading && pageRows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-slate-50">
                <td className="p-2 font-mono">{row.docNo}</td>
                <td className="p-2">{row.date}</td>
                <td className="p-2">{row.customerName}</td>
                <td className="p-2 text-xs"><div>{row.productName || '-'}</div>{row.itemCount > 1 ? <div className="text-slate-400">+ อีก {row.itemCount - 1} รายการ</div> : null}</td>
                <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                <td className="p-2 text-right font-medium text-emerald-700">{formatMoney(row.totalAmount)}</td>
                <td className="p-2 text-right text-blue-700">{formatMoney(row.matchedQty)}</td>
                <td className="p-2 text-right text-amber-700">{formatMoney(row.remainingQty)}</td>
                <td className={`p-2 text-right font-bold ${row.margin < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(row.margin)}</td>
                <td className={`p-2 text-right ${row.marginPct < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatPercent(row.marginPct)}</td>
                <td className="p-2 text-center"><StatusPill label={row.matchStatus} tone="match" /></td>
                <td className="whitespace-nowrap p-2 text-right"><div className="flex justify-end gap-1"><button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50" disabled title="รอออกแบบ write permission/audit ก่อนเปิดใช้งาน" type="button">แก้ไข</button><button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50" disabled title="รอออกแบบ cancel/reconciliation ก่อนเปิดใช้งาน" type="button">ยกเลิก</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="po-sell-form-title">
          <div className="mx-auto my-4 max-w-2xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 id="po-sell-form-title" className="font-semibold">สร้าง PO Sell (จองขาย)</h3>
              <button className="text-2xl text-slate-400 hover:text-slate-600" type="button" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <SelectField className="col-span-2" error={fieldErrors.customerId} label="Customer *" options={activeCustomers} value={form.customerId} onChange={(value) => updateForm('customerId', value)} />
                <SelectField error={fieldErrors.branchId} label="สาขา/คลัง *" options={activeBranches} value={form.branchId ?? ''} onChange={(value) => updateForm('branchId', value || null)} />
                <SelectField error={fieldErrors.channelId} label="ช่องทางขาย" options={activeChannels} value={form.channelId ?? ''} onChange={(value) => updateForm('channelId', value || null)} />
                <Field error={fieldErrors.expectedDelivery} label="วันส่งมอบ *"><input className="w-full rounded border px-2 py-1.5" required type="date" value={form.expectedDelivery} onChange={(event) => updateForm('expectedDelivery', event.target.value)} /></Field>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="font-medium">📋 รายการสินค้า ({form.items.length})</label>
                  <button className="rounded bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, blankPoSellItem()] }))}>+ เพิ่มรายการ</button>
                </div>
                {fieldErrors.items ? <div className="mb-2 text-xs text-red-600">{fieldErrors.items}</div> : null}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr><th className="p-2 text-left">สินค้า / Grade *</th><th className="w-32 p-2 text-right">จำนวน (กก.) *</th><th className="w-32 p-2 text-right">ราคา/หน่วย *</th><th className="w-32 p-2 text-right">มูลค่ารวม</th><th className="w-8 p-2" /></tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-1 align-top"><ProductSelect inputId={`po-sell-product-${index}`} options={activeProducts} value={item.productId} onChange={(value) => updateItem(index, 'productId', value)} /></td>
                          <td className="p-1 align-top"><input className="w-full rounded border px-2 py-1.5 text-right" min={0} step="0.01" type="number" value={item.qty || ''} onChange={(event) => updateItem(index, 'qty', Number(event.target.value))} /></td>
                          <td className="p-1 align-top"><input className="w-full rounded border px-2 py-1.5 text-right" min={0} step="0.01" type="number" value={item.price || ''} onChange={(event) => updateItem(index, 'price', Number(event.target.value))} /></td>
                          <td className="bg-blue-50 p-1 px-2 text-right font-bold text-blue-700">{formatMoney(Math.max(0, item.qty * item.price - item.discount))}</td>
                          <td className="p-1 text-center">{form.items.length > 1 ? <button className="px-2 text-red-500" type="button" onClick={() => removeItem(index)}>×</button> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold">
                      <tr><td className="p-2 text-right">รวม {form.items.length} รายการ</td><td className="p-2 text-right">{formatMoney(formQty)}</td><td /><td className="p-2 text-right text-base text-blue-700">{formatMoney(formSubtotal)}</td><td /></tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs">หมายเหตุ</label>
                <textarea className="w-full rounded border px-2 py-1.5" rows={2} value={form.note ?? ''} onChange={(event) => updateForm('note', event.target.value || null)} />
                {fieldErrors.note ? <div className="mt-1 text-xs text-red-600">{fieldErrors.note}</div> : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">
              <button className="px-4 py-2 text-sm" disabled={isSaving} type="button" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={() => void savePoSell()}>{isSaving ? 'กำลังบันทึก...' : 'บันทึก PO Sell'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function formatPercent(value: number | null | undefined) {
  return `${formatMoney(value ?? 0)}%`
}

function Metric({ className, label, subLabel, value, valueClassName }: { className: string; label: string; subLabel?: string; value: string; valueClassName: string }) {
  return <div className={className}><div className="text-xs opacity-80">{label}</div><div className={valueClassName}>{value}</div>{subLabel ? <div className="mt-1 text-xs opacity-80">{subLabel}</div> : null}</div>
}

function MatchButton({ active, label, onClick, tone = 'dark' }: { active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'dark' | 'emerald' | 'red' | 'slate' }) {
  const activeClass = {
    amber: 'border-amber-600 bg-amber-600 text-white',
    dark: 'border-slate-700 bg-slate-700 text-white',
    emerald: 'border-emerald-600 bg-emerald-600 text-white',
    red: 'border-red-600 bg-red-600 text-white',
    slate: 'border-slate-500 bg-slate-500 text-white',
  }[tone]
  const idleClass = tone === 'amber' ? 'border-slate-300 bg-white hover:bg-amber-50' : tone === 'emerald' ? 'border-slate-300 bg-white hover:bg-emerald-50' : tone === 'red' ? 'border-slate-300 bg-white hover:bg-red-50' : 'border-slate-300 bg-white hover:bg-slate-100'
  return <button className={`rounded border px-3 py-1 text-xs font-medium ${active ? activeClass : idleClass}`} type="button" onClick={onClick}>{label}</button>
}

function StatusPill({ label, tone = 'status' }: { label: string; tone?: 'match' | 'status' }) {
  const color = tone === 'match' ? 'bg-cyan-50 text-cyan-700' : 'bg-slate-100 text-slate-700'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${color}`}>{label || '-'}</span>
}

function Field({ children, className, error, label }: { children: ReactNode; className?: string; error?: string; label: string }) {
  return <label className={className}><span className="mb-1 block text-xs font-bold text-slate-700">{label}</span>{children}{error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}</label>
}

function SelectField({ className, error, label, onChange, options, placeholder = 'เลือก', value }: { className?: string; error?: string; label: string; onChange: (value: string) => void; options: Option[]; placeholder?: string; value: string }) {
  return (
    <Field className={className} error={error} label={label}>
      <select className="w-full rounded border px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ` : ''}{option.name}</option>)}
      </select>
    </Field>
  )
}

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}

function ProductSelect({ inputId, onChange, options, value }: { inputId: string; onChange: (productId: string) => void; options: Option[]; value: string }) {
  return (
    <select id={inputId} className="w-full rounded border px-2 py-1.5" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">พิมพ์รหัส/ชื่อสินค้า...</option>
      {options.map((option) => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}
    </select>
  )
}
