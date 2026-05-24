'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney, stockTransferFormSchema, todayDateInput, type StockTransferFormValues } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type Option = { active: boolean | null; branch_id?: string | null; code?: string | null; id: string; name: string }
type Row = { date: string; docNo: string; from: string; id: string; itemCount: number; notes: string; to: string; totalQty: number }
type Payload = { branches: Option[]; products: Option[]; rows: Row[]; warehouses: Option[] }
type Period = '' | 'today' | 'week' | 'month'

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
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<StockTransferFormValues>(emptyForm)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [fromBranchId, setFromBranchId] = useState('')
  const [period, setPeriod] = useState<Period>('')
  const [search, setSearch] = useState('')
  const [toBranchId, setToBranchId] = useState('')

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

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const fromBranch = data.branches.find((branch) => branch.id === fromBranchId)?.name.toLowerCase() ?? ''
    const toBranch = data.branches.find((branch) => branch.id === toBranchId)?.name.toLowerCase() ?? ''
    return data.rows.filter((row) => {
      if (dateFrom && row.date < dateFrom) return false
      if (dateTo && row.date > dateTo) return false
      if (fromBranch && !row.from.toLowerCase().includes(fromBranch)) return false
      if (toBranch && !row.to.toLowerCase().includes(toBranch)) return false
      if (query && !`${row.docNo} ${row.from} ${row.to} ${row.notes}`.toLowerCase().includes(query)) return false
      return true
    })
  }, [data.branches, data.rows, dateFrom, dateTo, fromBranchId, search, toBranchId])

  const branchOptions = useMemo(() => data.branches.filter((item) => item.active !== false), [data.branches])
  const productOptions = useMemo(() => data.products.filter((product) => product.active !== false), [data.products])
  const totalWeight = useMemo(() => rows.reduce((sum, row) => sum + row.totalQty, 0), [rows])

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

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = stockTransferFormSchema.safeParse(form)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
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

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[220px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="ค้นหาเลขที่ / ต้นทาง / ปลายทาง / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <DatePickerInput className="w-[130px]" value={dateFrom} onChange={(value) => { setDateFrom(value); setPeriod('') }} />
          <span className="text-slate-400">→</span>
          <DatePickerInput className="w-[130px]" value={dateTo} onChange={(value) => { setDateTo(value); setPeriod('') }} />
          <select className="rounded-md border border-slate-300 px-2 py-2 text-sm" value={fromBranchId} onChange={(event) => setFromBranchId(event.target.value)}>
            <option value="">ทุกสาขาต้นทาง</option>
            {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <select className="rounded-md border border-slate-300 px-2 py-2 text-sm" value={toBranchId} onChange={(event) => setToBranchId(event.target.value)}>
            <option value="">ทุกสาขาปลายทาง</option>
            {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          {search || dateFrom || dateTo || fromBranchId || toBranchId ? (
            <button className="rounded-md bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={clearFilters}>ล้าง</button>
          ) : null}
          <button className="ml-auto rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" type="button" onClick={() => { setForm({ ...emptyForm, date: todayDateInput() }); setFormOpen(true) }}>+ โอนใหม่</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">ช่วง:</span>
          <PeriodButton active={period === ''} label="ทั้งหมด" tone="slate" onClick={() => applyPeriod('')} />
          <PeriodButton active={period === 'today'} label="วันนี้" tone="blue" onClick={() => applyPeriod('today')} />
          <PeriodButton active={period === 'week'} label="7 วัน" tone="emerald" onClick={() => applyPeriod('week')} />
          <PeriodButton active={period === 'month'} label="เดือนนี้" tone="amber" onClick={() => applyPeriod('month')} />
          <span className="ml-auto text-xs text-slate-500">พบ <b className="text-slate-700">{rows.length}</b> รายการ · รวม <b className="text-blue-700">{formatMoney(totalWeight)}</b> กก.</span>
        </div>
      </div>
      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <form className="w-full max-w-3xl overflow-hidden rounded-md bg-white shadow-xl" onSubmit={save}>
            <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-4"><h3 className="font-bold">โอนสินค้าระหว่างสาขา</h3><button className="text-2xl text-slate-400" type="button" onClick={() => setFormOpen(false)}>&times;</button></div>
            <div className="space-y-4 p-5 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600">เลขที่<input className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-sm" placeholder="สร้างอัตโนมัติ" readOnly value={form.docNo ?? ''} /></label>
                <Field compact label="วันที่" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 rounded-md bg-red-50 p-3">
                  <div className="text-xs font-medium text-red-700">ต้นทาง</div>
                  <Select compact label="สาขาต้นทาง" value={form.fromBranchId} options={branchOptions} onChange={(value) => setForm({ ...form, fromBranchId: value, fromWarehouseId: '' })} />
                  <Select compact label="คลังต้นทาง" value={form.fromWarehouseId} options={data.warehouses.filter((item) => item.active !== false && (!form.fromBranchId || item.branch_id === form.fromBranchId))} onChange={(value) => setForm({ ...form, fromWarehouseId: value })} />
                </div>
                <div className="space-y-2 rounded-md bg-emerald-50 p-3">
                  <div className="text-xs font-medium text-emerald-700">ปลายทาง</div>
                  <Select compact label="สาขาปลายทาง" value={form.toBranchId} options={branchOptions} onChange={(value) => setForm({ ...form, toBranchId: value, toWarehouseId: '' })} />
                  <Select compact label="คลังปลายทาง" value={form.toWarehouseId} options={data.warehouses.filter((item) => item.active !== false && (!form.toBranchId || item.branch_id === form.toBranchId))} onChange={(value) => setForm({ ...form, toWarehouseId: value })} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><h4 className="font-medium">รายการสินค้า</h4><button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white" type="button" onClick={() => setForm({ ...form, items: [...form.items, { lotNo: null, productId: '', qty: 0 }] })}>+ เพิ่ม</button></div>
                {form.items.map((item, index) => (
                  <div key={index} className="grid gap-2 rounded-md border border-slate-200 p-2 md:grid-cols-[1fr_120px_120px_40px]">
                    <Select compact label="สินค้า" value={item.productId} options={productOptions} onChange={(value) => setForm({ ...form, items: form.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, productId: value } : entry) })} />
                    <Field compact label="น้ำหนัก" type="number" value={String(item.qty)} onChange={(value) => setForm({ ...form, items: form.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, qty: Number(value) } : entry) })} />
                    <Field compact label="Lot" value={item.lotNo ?? ''} onChange={(value) => setForm({ ...form, items: form.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, lotNo: value } : entry) })} />
                    <button className="self-end rounded-md bg-red-50 px-2 py-2 text-red-700" type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, entryIndex) => entryIndex !== index) })}>×</button>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field compact label="ผู้ส่ง" value={form.sender ?? ''} onChange={(value) => setForm({ ...form, sender: value })} />
                <Field compact label="ผู้รับ" value={form.receiver ?? ''} onChange={(value) => setForm({ ...form, receiver: value })} />
              </div>
              <label className="block text-xs font-medium text-slate-600">หมายเหตุ<textarea className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" rows={3} value={form.notes ?? ''} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-4"><button className="rounded-md px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" type="button" onClick={() => setFormOpen(false)}>ยกเลิก</button><button className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white disabled:opacity-60" disabled={isSaving} type="submit">บันทึก</button></div>
          </form>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-md bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">จาก</th><th className="p-2 text-left">ไป</th><th className="p-2 text-left">รายการ</th><th className="p-2 text-right">น้ำหนักรวม</th><th className="p-2 text-right"></th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row) => <tr key={row.id} className="border-t hover:bg-slate-50"><td className="p-2 font-mono text-xs">{row.docNo}</td><td className="p-2">{formatDateDisplay(row.date)}</td><td className="p-2 text-red-600">{row.from}</td><td className="p-2 text-emerald-600">{row.to}</td><td className="p-2">{row.itemCount} รายการ</td><td className="p-2 text-right font-semibold">{formatMoney(row.totalQty)} กก.</td><td className="p-2 text-right"><button className="text-xs text-slate-400" disabled title="รอออกแบบ cancel/tombstone flow" type="button">ยกเลิก</button></td></tr>)}
            {!isLoading && rows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={7}>ยังไม่มีรายการ</td></tr> : null}
          </tbody>
        </table>
      </div>
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
  const inactiveClass = {
    amber: 'border-slate-300 bg-white hover:bg-amber-50',
    blue: 'border-slate-300 bg-white hover:bg-blue-50',
    emerald: 'border-slate-300 bg-white hover:bg-emerald-50',
    slate: 'border-slate-300 bg-white',
  }[props.tone]
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${props.active ? activeClass : inactiveClass}`} type="button" onClick={props.onClick}>{props.label}</button>
}

function Field(props: { compact?: boolean; label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className={`${props.compact ? 'text-xs text-slate-600' : 'text-sm'} block font-medium`}>{props.label}{props.type === 'date' ? <DatePickerInput className={`${props.compact ? 'mt-1' : 'mt-1.5'} w-full`} value={props.value} onChange={props.onChange} /> : <input className={`${props.compact ? 'mt-1 rounded-md px-2 py-1.5 text-sm' : 'mt-1.5 rounded-md px-3 py-2'} w-full border border-slate-300`} type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} />}</label>
}

function Select(props: { compact?: boolean; label: string; onChange: (value: string) => void; options: Option[]; value: string }) {
  return <label className={`${props.compact ? 'text-xs text-slate-600' : 'text-sm'} block font-medium`}>{props.label}<select className={`${props.compact ? 'mt-1 rounded-md px-2 py-1.5 text-sm' : 'mt-1.5 rounded-md px-3 py-2'} w-full border border-slate-300`} value={props.value} onChange={(event) => props.onChange(event.target.value)}><option value="">ไม่ระบุ</option>{props.options.map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}</select></label>
}
