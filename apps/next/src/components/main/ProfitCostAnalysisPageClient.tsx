'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type Option = { active: boolean; code?: string; creditTerm?: number; id: string; name: string }
type ProductRow = {
  avgBuy: number
  avgSell: number
  buyAmount: number
  buyBillCount: number
  buyQty: number
  code: string
  cogs: number
  gp: number
  gpPct: number
  id: string
  metalGroup: string
  name: string
  profitPerKg: number
  revenue: number
  sellBillCount: number
  sellQty: number
  stockQty: number
  stockValue: number
}
type ProfitCostPayload = {
  alerts: { amount: number; label: string; severity: string; type: string }[]
  filters: {
    branches: Option[]
    customers: Option[]
    dateFrom: string
    dateTo: string
    metalGroups: string[]
    purchaseChannels: Option[]
    salesChannels: Option[]
    selectedMetalGroups: string[]
    suppliers: Option[]
  }
  rows: {
    channels: { amount: number; billCount: number; gp: number; gpPct: number; group: string; name: string; qty: number }[]
    customers: { amount: number; billCount: number; cogs: number; gp: number; gpPct: number; name: string; receivable: number; received: number; qty: number }[]
    products: ProductRow[]
    suppliers: { amount: number; billCount: number; name: string; paid: number; payable: number; qty: number }[]
    trend: { buyAmount: number; buyQty: number; cogs: number; date: string; gp: number; revenue: number; sellQty: number }[]
  }
  sourceState: { limitations: string[]; writeActionsEnabled: false }
  summary: Record<string, number>
  top: { byGp: ProductRow[]; byRevenue: ProductRow[]; byStockValue: ProductRow[] }
}

type Tab = 'alerts' | 'channels' | 'customers' | 'products' | 'suppliers' | 'trend'

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function monthStart() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export function ProfitCostAnalysisPageClient() {
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [branchId, setBranchId] = useState('')
  const [purchaseChannelId, setPurchaseChannelId] = useState('')
  const [salesChannelId, setSalesChannelId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [selectedMetalGroups, setSelectedMetalGroups] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('products')
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null)
  const [data, setData] = useState<ProfitCostPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const query = useMemo(() => {
    const params = new URLSearchParams({ from, to })
    if (branchId) params.set('branchId', branchId)
    if (purchaseChannelId) params.set('purchaseChannelId', purchaseChannelId)
    if (salesChannelId) params.set('salesChannelId', salesChannelId)
    if (supplierId) params.set('supplierId', supplierId)
    if (customerId) params.set('customerId', customerId)
    selectedMetalGroups.forEach((group) => params.append('metalGroup', group))
    return params.toString()
  }, [branchId, customerId, from, purchaseChannelId, salesChannelId, selectedMetalGroups, supplierId, to])

  useEffect(() => {
    setError(null)
    setIsLoading(true)
    dailyFetchJson<ProfitCostPayload>(`/api/profit-cost-analysis?${query}`)
      .then((payload) => {
        setData(payload)
        if (selectedMetalGroups.length === 0 && payload.filters.selectedMetalGroups.length > 0) {
          setSelectedMetalGroups(payload.filters.selectedMetalGroups)
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [query, selectedMetalGroups.length])

  const summary = data?.summary ?? {}
  const metalGroups = data?.filters.metalGroups ?? []

  function toggleMetalGroup(group: string) {
    setSelectedMetalGroups((current) => current.includes(group) ? current.filter((value) => value !== group) : [...current, group])
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md bg-white p-4 shadow-lg">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <Field label="จากวันที่"><input className={controlClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field label="ถึงวันที่"><input className={controlClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          <Field label="สาขา"><Select options={data?.filters.branches ?? []} value={branchId} onChange={setBranchId} /></Field>
          <Field label="ช่องทางซื้อ"><Select options={data?.filters.purchaseChannels ?? []} value={purchaseChannelId} onChange={setPurchaseChannelId} /></Field>
          <Field label="ช่องทางขาย"><Select options={data?.filters.salesChannels ?? []} value={salesChannelId} onChange={setSalesChannelId} /></Field>
          <Field label="Supplier"><Select options={data?.filters.suppliers ?? []} value={supplierId} onChange={setSupplierId} /></Field>
          <Field label="Customer"><Select options={data?.filters.customers ?? []} value={customerId} onChange={setCustomerId} /></Field>
        </div>
        <div className="mt-4 border-t pt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold text-slate-700">
            <span>หมวดสินค้า ({selectedMetalGroups.length ? selectedMetalGroups.length : 'ทุกหมวด'})</span>
            <button className={`${chipClass} bg-slate-900 text-white`} type="button" onClick={() => setSelectedMetalGroups(metalGroups)}>เลือกทั้งหมด</button>
            <button className={`${chipClass} bg-slate-100 text-slate-700`} type="button" onClick={() => setSelectedMetalGroups([])}>ไม่เลือก</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {metalGroups.map((group) => <button key={group} className={`${chipClass} ${selectedMetalGroups.includes(group) ? 'bg-purple-600 text-white' : 'bg-purple-50 text-purple-700'}`} type="button" onClick={() => toggleMetalGroup(group)}>{group}</button>)}
            {metalGroups.length === 0 ? <span className="text-sm text-slate-400">ไม่มีหมวดสินค้า</span> : null}
          </div>
        </div>
        <div className="mt-4 flex justify-end border-t pt-3">
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white opacity-70" disabled type="button">Export CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Metric label="ซื้อรวม" tone="blue" value={money(summary.purchaseAmount)} sub={`${money(summary.purchaseQty)} กก.`} />
        <Metric label="ขายรวม" tone="emerald" value={money(summary.revenue)} sub={`${money(summary.salesQty)} กก.`} />
        <Metric label="COGS" tone="orange" value={money(summary.cogs)} sub="ต้นทุนขาย" />
        <Metric label="GP" tone={(summary.gp ?? 0) >= 0 ? 'purple' : 'red'} value={money(summary.gp)} sub={`${pct(summary.gpPct)}%`} />
        <Metric label="Stock Qty" tone="amber" value={money(summary.stockQty)} sub="คงเหลือ กก." />
        <Metric label="Stock Value" tone="slate" value={money(summary.stockValue)} sub="มูลค่าสต๊อก" />
        <Metric label="ซื้อเฉลี่ย/กก." tone="cyan" value={money(summary.avgBuy)} sub="Avg buy" />
        <Metric label="ขายเฉลี่ย/กก." tone="emerald" value={money(summary.avgSell)} sub="Avg sell" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="เจ้าหนี้คงเหลือ" tone="red" value={money(summary.ap)} sub="AP" />
        <Metric label="ลูกหนี้คงเหลือ" tone="cyan" value={money(summary.ar)} sub="AR" />
        <Metric label="Supplier ที่ซื้อ" tone="blue" value={String(summary.supplierCount ?? 0)} sub="ราย" />
        <Metric label="Customer ที่ขาย" tone="purple" value={String(summary.customerCount ?? 0)} sub="ราย" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Revenue / GP">
          <div className="grid gap-3 md:grid-cols-2">
            <BigNumber label="Revenue" tone="from-emerald-600 to-teal-700" value={money(summary.revenue)} />
            <BigNumber label="Gross Profit" tone="from-purple-600 to-indigo-700" value={money(summary.gp)} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <SmallStat label="ซื้อเฉลี่ย" value={money(summary.avgBuy)} />
            <SmallStat label="ขายเฉลี่ย" value={money(summary.avgSell)} />
            <SmallStat label="จำนวนสินค้า" value={String(summary.productCount ?? 0)} />
          </div>
        </Panel>
        <Panel title="Top 10 Product ยอดขาย">
          <BarRows rows={(data?.top.byRevenue ?? []).map((row) => ({ label: row.name, value: row.revenue }))} />
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="รายได้ vs ต้นทุน vs กำไร">
          <BarRows rows={[{ label: 'รายได้', value: summary.revenue ?? 0 }, { label: 'COGS', value: summary.cogs ?? 0 }, { label: 'GP', value: summary.gp ?? 0 }]} />
        </Panel>
        <Panel title="Top 10 Product GP">
          <BarRows rows={(data?.top.byGp ?? []).map((row) => ({ label: row.name, value: row.gp }))} />
        </Panel>
      </div>

      <div className="overflow-hidden rounded-md bg-white shadow-lg">
        <div className="flex flex-wrap gap-2 border-b bg-slate-50 p-3">
          {[
            ['products', 'Product'],
            ['suppliers', 'Supplier'],
            ['customers', 'Customer'],
            ['channels', 'Channel'],
            ['trend', 'Trend'],
            ['alerts', 'Alerts'],
          ].map(([key, label]) => <button key={key} className={`rounded-md px-3 py-2 text-sm font-bold ${activeTab === key ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 shadow-sm'}`} type="button" onClick={() => setActiveTab(key as Tab)}>{label}</button>)}
        </div>
        <div className="p-3">
          {activeTab === 'products' ? <ProductTable rows={data?.rows.products ?? []} onSelect={setSelectedProduct} /> : null}
          {activeTab === 'suppliers' ? <SimpleTable rows={(data?.rows.suppliers ?? []).map((row) => [row.name, money(row.qty), money(row.amount), money(row.paid), money(row.payable), String(row.billCount)])} headers={['Supplier', 'กก.', 'ซื้อ', 'จ่ายแล้ว', 'ค้างจ่าย', 'บิล']} /> : null}
          {activeTab === 'customers' ? <SimpleTable rows={(data?.rows.customers ?? []).map((row) => [row.name, money(row.qty), money(row.amount), money(row.gp), `${pct(row.gpPct)}%`, money(row.receivable)])} headers={['Customer', 'กก.', 'ขาย', 'GP', 'GP %', 'ค้างรับ']} /> : null}
          {activeTab === 'channels' ? <SimpleTable rows={(data?.rows.channels ?? []).map((row) => [row.group, row.name, money(row.qty), money(row.amount), money(row.gp), String(row.billCount)])} headers={['Group', 'Channel', 'กก.', 'ยอด', 'GP', 'บิล']} /> : null}
          {activeTab === 'trend' ? <SimpleTable rows={(data?.rows.trend ?? []).map((row) => [row.date, money(row.buyAmount), money(row.revenue), money(row.cogs), money(row.gp), money(row.sellQty)])} headers={['Date', 'ซื้อ', 'ขาย', 'COGS', 'GP', 'ขาย กก.']} /> : null}
          {activeTab === 'alerts' ? <SimpleTable rows={(data?.alerts ?? []).map((row) => [row.severity, row.type, row.label, money(row.amount)])} headers={['Severity', 'Type', 'รายการ', 'ค่า']} /> : null}
        </div>
      </div>

      <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
        <b>Profit & Cost read baseline</b><span className="ml-2">{data?.sourceState.limitations[0] ?? 'ไม่มี write/posting action ใน baseline นี้'}</span>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {isLoading ? <div className="rounded-md bg-white p-4 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
      {selectedProduct ? <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} /> : null}
    </section>
  )
}

const controlClass = 'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-100'
const chipClass = 'rounded-md-full px-3 py-1.5 text-xs font-bold shadow-sm'

function Select({ onChange, options, value }: { onChange: (value: string) => void; options: Option[]; value: string }) {
  return <select className={controlClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทั้งหมด</option>{options.map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}</select>
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="space-y-1 text-xs font-bold text-slate-600"><span>{label}</span>{children}</label>
}

function money(value?: number) {
  return formatMoney(value ?? 0)
}

function pct(value?: number) {
  return (value ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 1 })
}

function toneClass(tone: string) {
  const map: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    orange: 'bg-orange-50 text-orange-700',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-50 text-slate-700',
  }
  return map[tone] ?? map.slate
}

function Metric({ label, sub, tone, value }: { label: string; sub: string; tone: string; value: string }) {
  return <div className={`rounded-md p-4 shadow ${toneClass(tone)}`}><div className="text-xs opacity-75">{label}</div><div className="mt-1 text-xl font-bold">{value}</div><div className="text-xs opacity-70">{sub}</div></div>
}

function BigNumber({ label, tone, value }: { label: string; tone: string; value: string }) {
  return <div className={`rounded-md bg-gradient-to-br ${tone} p-5 text-white shadow`}><div className="text-sm opacity-80">{label}</div><div className="mt-1 text-3xl font-bold">{value}</div></div>
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="font-bold text-slate-800">{value}</div></div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="overflow-hidden rounded-md bg-white shadow-lg"><div className="border-b bg-slate-50 p-3 font-bold">{title}</div><div className="p-4">{children}</div></div>
}

function BarRows({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)))
  return <div className="space-y-2">{rows.map((row) => <div key={row.label}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{row.label}</span><b>{money(row.value)}</b></div><div className="h-3 rounded-md bg-slate-100"><div className="h-3 rounded-md bg-gradient-to-r from-purple-500 to-indigo-600" style={{ width: `${Math.min(100, Math.abs(row.value) / max * 100)}%` }} /></div></div>)}</div>
}

function ProductTable({ onSelect, rows }: { onSelect: (row: ProductRow) => void; rows: ProductRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1180px] w-full text-sm">
        <thead className="bg-slate-900 text-white">
          <tr>
            {['Code', 'Product', 'Metal', 'ซื้อ', 'มูลค่าซื้อ', 'ซื้อเฉลี่ย', 'ขาย', 'รายได้', 'ขายเฉลี่ย', 'COGS', 'GP', 'GP %', '฿/กก.', 'Stock', 'Stock Value'].map((header) => <th key={header} className="p-2 text-left last:text-right">{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <tr key={row.id} className="cursor-pointer border-t hover:bg-purple-50" onClick={() => onSelect(row)}>
            <td className="p-2 font-mono text-xs">{row.code || '-'}</td>
            <td className="p-2 font-semibold">{row.name}</td>
            <td className="p-2">{row.metalGroup || '-'}</td>
            <td className="p-2 text-right">{money(row.buyQty)}</td>
            <td className="p-2 text-right">{money(row.buyAmount)}</td>
            <td className="p-2 text-right">{money(row.avgBuy)}</td>
            <td className="p-2 text-right">{money(row.sellQty)}</td>
            <td className="p-2 text-right">{money(row.revenue)}</td>
            <td className="p-2 text-right">{money(row.avgSell)}</td>
            <td className="p-2 text-right">{money(row.cogs)}</td>
            <td className={`p-2 text-right font-bold ${row.gp >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{money(row.gp)}</td>
            <td className="p-2 text-right">{pct(row.gpPct)}%</td>
            <td className="p-2 text-right">{money(row.profitPerKg)}</td>
            <td className="p-2 text-right">{money(row.stockQty)}</td>
            <td className="p-2 text-right font-bold">{money(row.stockValue)}</td>
          </tr>)}
          {rows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={15}>ไม่มีข้อมูล</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}

function ProductModal({ onClose, product }: { onClose: () => void; product: ProductRow }) {
  const lines = [
    ['ซื้อ', money(product.buyQty), money(product.buyAmount), '-', '-'],
    ['ขาย', money(product.sellQty), money(product.revenue), money(product.cogs), money(product.gp)],
    ['Stock', money(product.stockQty), money(product.stockValue), '-', '-'],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b bg-slate-900 p-4 text-white">
          <div>
            <h2 className="text-xl font-bold">{product.name}</h2>
            <p className="text-sm text-slate-300">{product.code || '-'} · {product.metalGroup || '-'}</p>
          </div>
          <button className="rounded-md bg-white/10 px-3 py-1.5 text-sm font-bold" type="button" onClick={onClose}>ปิด</button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-slate-100"><tr>{['เอกสาร', 'จำนวน', 'มูลค่า', 'COGS', 'GP'].map((header) => <th key={header} className="p-2 text-left">{header}</th>)}</tr></thead>
            <tbody>{lines.map((line) => <tr key={line[0]} className="border-t">{line.map((cell, index) => <td key={`${line[0]}-${index}`} className={`p-2 ${index > 0 ? 'text-right' : 'font-bold'}`}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-[720px] w-full text-sm">
        <thead className="bg-slate-900 text-white"><tr>{headers.map((header) => <th key={header} className="p-2 text-left">{header}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t hover:bg-purple-50">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={`p-2 ${cellIndex > 1 ? 'text-right' : ''}`}>{cell}</td>)}</tr>)}
          {rows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={headers.length}>ไม่มีข้อมูล</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}
