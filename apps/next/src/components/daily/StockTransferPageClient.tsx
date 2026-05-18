'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney, stockTransferFormSchema, todayDateInput, type StockTransferFormValues } from '@/lib/daily'

type Option = { active: boolean | null; branch_id?: string | null; code?: string | null; id: string; name: string }
type Row = { date: string; docNo: string; from: string; id: string; itemCount: number; to: string; totalQty: number }
type Payload = { branches: Option[]; products: Option[]; rows: Row[]; warehouses: Option[] }

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
  const [search, setSearch] = useState('')

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
    return data.rows.filter((row) => !query || `${row.docNo} ${row.from} ${row.to}`.toLowerCase().includes(query))
  }, [data.rows, search])

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
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-56 flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="ค้นหาเลขที่ / ต้นทาง / ปลายทาง" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white" type="button" onClick={() => { setForm({ ...emptyForm, date: todayDateInput() }); setFormOpen(true) }}>+ โอนใหม่</button>
        </div>
      </div>
      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
          <form className="w-full max-w-3xl overflow-hidden rounded-lg bg-white shadow-xl" onSubmit={save}>
            <div className="flex items-center justify-between border-b bg-slate-50 px-5 py-4"><h3 className="font-bold">โอนสินค้าระหว่างสาขา</h3><button className="text-2xl text-slate-400" type="button" onClick={() => setFormOpen(false)}>&times;</button></div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="วันที่" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
              <Select label="สาขาต้นทาง" value={form.fromBranchId} options={data.branches.filter((item) => item.active !== false)} onChange={(value) => setForm({ ...form, fromBranchId: value, fromWarehouseId: '' })} />
              <Select label="คลังต้นทาง" value={form.fromWarehouseId} options={data.warehouses.filter((item) => item.active !== false && (!form.fromBranchId || item.branch_id === form.fromBranchId))} onChange={(value) => setForm({ ...form, fromWarehouseId: value })} />
              <Select label="สาขาปลายทาง" value={form.toBranchId} options={data.branches.filter((item) => item.active !== false)} onChange={(value) => setForm({ ...form, toBranchId: value, toWarehouseId: '' })} />
              <Select label="คลังปลายทาง" value={form.toWarehouseId} options={data.warehouses.filter((item) => item.active !== false && (!form.toBranchId || item.branch_id === form.toBranchId))} onChange={(value) => setForm({ ...form, toWarehouseId: value })} />
              <div className="md:col-span-2 space-y-2">
                {form.items.map((item, index) => (
                  <div key={index} className="grid gap-2 rounded border p-2 md:grid-cols-[1fr_120px_120px_40px]">
                    <Select label="สินค้า" value={item.productId} options={data.products.filter((product) => product.active !== false)} onChange={(value) => setForm({ ...form, items: form.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, productId: value } : entry) })} />
                    <Field label="น้ำหนัก" type="number" value={String(item.qty)} onChange={(value) => setForm({ ...form, items: form.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, qty: Number(value) } : entry) })} />
                    <Field label="Lot" value={item.lotNo ?? ''} onChange={(value) => setForm({ ...form, items: form.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, lotNo: value } : entry) })} />
                    <button className="self-end rounded bg-red-50 px-2 py-2 text-red-700" type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, entryIndex) => entryIndex !== index) })}>×</button>
                  </div>
                ))}
                <button className="rounded bg-slate-100 px-3 py-2 text-sm" type="button" onClick={() => setForm({ ...form, items: [...form.items, { lotNo: null, productId: '', qty: 0 }] })}>+ เพิ่มสินค้า</button>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4"><button className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100" type="button" onClick={() => setFormOpen(false)}>ยกเลิก</button><button className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={isSaving} type="submit">บันทึก</button></div>
          </form>
        </div>
      ) : null}
      <div className="flex text-sm text-slate-600">พบทั้งหมด <span className="mx-1 font-semibold text-slate-900">{rows.length}</span> รายการ · น้ำหนักรวม <span className="ml-1 font-semibold text-blue-700">{formatMoney(rows.reduce((sum, row) => sum + row.totalQty, 0))}</span></div>
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">จาก</th><th className="p-2 text-left">ไป</th><th className="p-2 text-right">รายการ</th><th className="p-2 text-right">น้ำหนักรวม</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={6}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row) => <tr key={row.id} className="border-t hover:bg-slate-50"><td className="p-2 font-mono text-xs">{row.docNo}</td><td className="p-2">{row.date}</td><td className="p-2 text-red-700">{row.from}</td><td className="p-2 text-emerald-700">{row.to}</td><td className="p-2 text-right">{row.itemCount}</td><td className="p-2 text-right font-semibold">{formatMoney(row.totalQty)}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Field(props: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className="block text-sm font-medium">{props.label}<input className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2" type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} /></label>
}

function Select(props: { label: string; onChange: (value: string) => void; options: Option[]; value: string }) {
  return <label className="block text-sm font-medium">{props.label}<select className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2" value={props.value} onChange={(event) => props.onChange(event.target.value)}><option value="">ไม่ระบุ</option>{props.options.map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}</select></label>
}
