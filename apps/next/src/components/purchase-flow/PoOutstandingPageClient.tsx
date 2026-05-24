'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type OutstandingRow = { date: string; docNo: string; expectedDelivery: string; id: string; partnerName: string; productId: string; productName: string; qty: number; receivedQty?: number; remainingQty: number; remainingValue: number; soldQty?: number; status: string; unitPrice: number }
type OutstandingPayload = {
  buyRows: OutstandingRow[]
  sellRows: OutstandingRow[]
  summary: { buyCount: number; buyRemainingQty: number; buyRemainingValue: number; sellCount: number; sellRemainingQty: number; sellRemainingValue: number }
}

export function PoOutstandingPageClient() {
  const [data, setData] = useState<OutstandingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [productFilter, setProductFilter] = useState('')
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<OutstandingPayload>('/api/po-reports/outstanding'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด PO Outstanding ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source = tab === 'buy' ? data?.buyRows ?? [] : data?.sellRows ?? []
    return source
      .filter((row) => !partnerFilter || row.partnerName === partnerFilter)
      .filter((row) => !productFilter || row.productId === productFilter)
      .filter((row) => !query || `${row.docNo} ${row.partnerName} ${row.productName}`.toLowerCase().includes(query))
  }, [data?.buyRows, data?.sellRows, partnerFilter, productFilter, search, tab])

  const totals = useMemo(() => ({
    lines: rows.length,
    remainingQty: rows.reduce((sum, row) => sum + row.remainingQty, 0),
    remainingValue: rows.reduce((sum, row) => sum + row.remainingValue, 0),
    totalQty: rows.reduce((sum, row) => sum + row.qty, 0),
  }), [rows])

  const partnerOptions = useMemo(() => [...new Set((tab === 'buy' ? data?.buyRows ?? [] : data?.sellRows ?? []).map((row) => row.partnerName).filter(Boolean))].sort(), [data?.buyRows, data?.sellRows, tab])
  const productOptions = useMemo(() => [...new Map((tab === 'buy' ? data?.buyRows ?? [] : data?.sellRows ?? []).filter((row) => row.productId).map((row) => [row.productId, row.productName || row.productId])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [data?.buyRows, data?.sellRows, tab])

  function exportCsv() {
    const header = tab === 'buy'
      ? ['เลขที่', 'วันที่', 'Supplier', 'สินค้า', 'จำนวน', 'ราคา', 'รับแล้ว', 'รอรับ', 'มูลค่ารอรับ', 'สถานะ']
      : ['เลขที่', 'วันที่', 'Customer', 'สินค้า', 'จำนวน', 'ราคาขาย', 'ขายแล้ว', 'รอส่ง', 'มูลค่ารอส่ง', 'สถานะ']
    const body = rows.map((row) => tab === 'buy'
      ? [row.docNo, row.date, row.partnerName, row.productName, row.qty, row.unitPrice, row.receivedQty ?? row.qty - row.remainingQty, row.remainingQty, row.remainingValue, row.status]
      : [row.docNo, row.date, row.partnerName, row.productName, row.qty, row.unitPrice, row.soldQty ?? row.qty - row.remainingQty, row.remainingQty, row.remainingValue, row.status])
    const csv = [header, ...body].map((line) => line.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `po_${tab}_outstanding_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md bg-gradient-to-r from-purple-700 to-indigo-700 p-5 text-white shadow">
        <h1 className="text-2xl font-bold">รายงาน PO ซื้อ / PO ขาย คงเหลือ</h1>
        <p className="mt-1 text-sm opacity-80">PO Buy ที่ยังไม่ได้รับของ + PO Sell ที่ยังไม่ได้ส่งของ เรียงตามวันที่</p>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="flex gap-1 rounded-md bg-white p-2 shadow">
        <button className={`rounded-md px-5 py-2 text-sm font-medium ${tab === 'buy' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`} type="button" onClick={() => { setTab('buy'); setPartnerFilter(''); setProductFilter('') }}>PO ซื้อ คงเหลือ ({data?.summary.buyCount ?? 0})</button>
        <button className={`rounded-md px-5 py-2 text-sm font-medium ${tab === 'sell' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`} type="button" onClick={() => { setTab('sell'); setPartnerFilter(''); setProductFilter('') }}>PO ขาย คงเหลือ ({data?.summary.sellCount ?? 0})</button>
        <span className="flex-1" />
        <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white" type="button" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="รายการคงเหลือ" tone={tab === 'buy' ? 'blue' : 'emerald'} value={`${totals.lines}`} />
        <Metric label="น้ำหนักรวม" value={`${formatMoney(totals.totalQty)} กก.`} />
        <Metric label={tab === 'buy' ? 'รอรับของ' : 'รอส่งของ'} tone="amber" value={`${formatMoney(totals.remainingQty)} กก.`} />
        <Metric label={tab === 'buy' ? 'มูลค่ารอรับ' : 'มูลค่ารอส่ง'} tone={tab === 'buy' ? 'blue' : 'emerald'} value={formatMoney(totals.remainingValue)} />
      </div>

      <div className="flex flex-wrap gap-2 rounded-md bg-white p-3 shadow">
        <input className="min-w-[220px] flex-1 rounded-md border px-3 py-2 text-sm" placeholder="ค้นหา PO / คู่ค้า / สินค้า" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="rounded-md border px-3 py-2 text-sm" value={partnerFilter} onChange={(event) => setPartnerFilter(event.target.value)}>
          <option value="">ทุก {tab === 'buy' ? 'Supplier' : 'Customer'}</option>
          {partnerOptions.map((partner) => <option key={partner} value={partner}>{partner}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
          <option value="">ทุกสินค้า</option>
          {productOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {tab === 'buy' ? (
        <div className="overflow-x-auto rounded-md bg-white shadow">
          <div className="border-l-4 border-amber-500 bg-amber-50 p-2 text-xs text-amber-700">
            ตัดต้นทุนเป็น write/cost-pool side effect ใน legacy จึงแสดงเป็นคอลัมน์อ่านอย่างเดียวใน Next จนกว่าจะออกแบบ audit และ permission
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="w-20 p-2 text-center">ตัดต้นทุน</th><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">Supplier</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">จำนวนสั่ง</th><th className="p-2 text-right">ราคา/หน่วย</th><th className="p-2 text-right">รับแล้ว</th><th className="p-2 text-right">รอรับ</th><th className="p-2 text-right">มูลค่ารอรับ</th><th className="p-2 text-left">วันส่งมอบ</th><th className="p-2 text-center">สถานะ</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && rows.map((row) => <tr key={row.id} className="border-t hover:bg-blue-50/30"><td className="p-2 text-center"><input className="h-5 w-5" disabled type="checkbox" title="รอออกแบบ cost-pool write/audit" /></td><td className="p-2 font-mono text-xs">{row.docNo}</td><td className="p-2">{formatDateDisplay(row.date)}</td><td className="p-2">{row.partnerName}</td><td className="p-2">{row.productName || '-'}</td><td className="p-2 text-right">{formatMoney(row.qty)}</td><td className="p-2 text-right">{formatMoney(row.unitPrice)}</td><td className="p-2 text-right text-emerald-700">{formatMoney(row.receivedQty ?? row.qty - row.remainingQty)}</td><td className="p-2 text-right font-bold text-amber-700">{formatMoney(row.remainingQty)}</td><td className="p-2 text-right font-bold text-blue-700">{formatMoney(row.remainingValue)}</td><td className="p-2 text-xs">{formatDateDisplay(row.expectedDelivery)}</td><td className="p-2 text-center text-xs">{row.status}</td></tr>)}
              {!isLoading && rows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={12}>ไม่มี PO ซื้อค้างรับ</td></tr> : null}
            </tbody>
            {rows.length ? <tfoot className="bg-slate-100 font-bold"><tr><td /><td className="p-2 text-right" colSpan={7}>รวม {rows.length} รายการ</td><td className="p-2 text-right text-amber-700">{formatMoney(totals.remainingQty)}</td><td className="p-2 text-right text-blue-700">{formatMoney(totals.remainingValue)}</td><td colSpan={2} /></tr></tfoot> : null}
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">Customer</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">จำนวนขาย</th><th className="p-2 text-right">ราคาขาย</th><th className="p-2 text-right">ขายแล้ว</th><th className="p-2 text-right">รอส่ง</th><th className="p-2 text-right">มูลค่ารอส่ง</th><th className="p-2 text-left">วันส่งมอบ</th><th className="p-2 text-center">สถานะ</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && rows.map((row) => <tr key={row.id} className="border-t hover:bg-emerald-50/30"><td className="p-2 font-mono text-xs">{row.docNo}</td><td className="p-2">{formatDateDisplay(row.date)}</td><td className="p-2">{row.partnerName}</td><td className="p-2">{row.productName || '-'}</td><td className="p-2 text-right">{formatMoney(row.qty)}</td><td className="p-2 text-right">{formatMoney(row.unitPrice)}</td><td className="p-2 text-right text-blue-700">{formatMoney(row.soldQty ?? row.qty - row.remainingQty)}</td><td className="p-2 text-right font-bold text-amber-700">{formatMoney(row.remainingQty)}</td><td className="p-2 text-right font-bold text-emerald-700">{formatMoney(row.remainingValue)}</td><td className="p-2 text-xs">{formatDateDisplay(row.expectedDelivery)}</td><td className="p-2 text-center text-xs">{row.status}</td></tr>)}
              {!isLoading && rows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={11}>ไม่มี PO ขายค้างส่ง</td></tr> : null}
            </tbody>
            {rows.length ? <tfoot className="bg-slate-100 font-bold"><tr><td className="p-2 text-right" colSpan={7}>รวม {rows.length} รายการ</td><td className="p-2 text-right text-amber-700">{formatMoney(totals.remainingQty)}</td><td className="p-2 text-right text-emerald-700">{formatMoney(totals.remainingValue)}</td><td colSpan={2} /></tr></tfoot> : null}
          </table>
        </div>
      )}
    </section>
  )
}

function Metric({ label, tone, value }: { label: string; tone?: 'amber' | 'blue' | 'emerald'; value: string }) {
  const className = tone === 'amber' ? 'border-l-4 border-amber-500 bg-amber-50 text-amber-700' : tone === 'blue' ? 'border-l-4 border-blue-500 bg-blue-50 text-blue-700' : tone === 'emerald' ? 'border-l-4 border-emerald-500 bg-emerald-50 text-emerald-700' : 'bg-white text-slate-900'
  return <div className={`rounded-md p-3 shadow ${className}`}><div className="text-xs opacity-80">{label}</div><div className="mt-1 text-xl font-bold">{value}</div></div>
}
