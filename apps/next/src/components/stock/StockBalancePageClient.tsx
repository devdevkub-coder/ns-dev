'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import type { StockOption } from '@/lib/stock'

type BalanceRow = {
  avgCost: number
  branchId: string
  branchName: string
  key: string
  lastDate: string
  lotNo: string
  notAvailable: boolean
  onHoldQty: number
  productCode: string
  productId: string
  productMetalGroup: string
  productName: string
  qty: number
  readyQty: number
  status: string
  value: number
  warehouseId: string
  warehouseName: string
}

type BalancePayload = {
  byStatus: Array<{ count: number; qty: number; status: string; value: number }>
  reference: { branches: StockOption[]; products: StockOption[]; warehouses: StockOption[] }
  rows: BalanceRow[]
  summary: { availableQty: number; availableValue: number; count: number; negativeRows: number; notAvailableQty: number; notAvailableValue: number; onHoldQty: number; qty: number; readyQty: number; value: number }
}

const ON_HOLD_STATUS = 'ON_HOLD'

export function StockBalancePageClient() {
  const [branchId, setBranchId] = useState('')
  const [data, setData] = useState<BalancePayload | null>(null)
  const [detailRow, setDetailRow] = useState<BalanceRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [productId, setProductId] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [viewMode, setViewMode] = useState<'detail' | 'summary'>('summary')
  const [warehouseId, setWarehouseId] = useState('')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (branchId) params.set('branchId', branchId)
      if (productId) params.set('productId', productId)
      if (warehouseId) params.set('warehouseId', warehouseId)
      if (status && status !== ON_HOLD_STATUS) params.set('status', status)
      if (status === ON_HOLD_STATUS) params.set('onHold', '1')
      setData(await dailyFetchJson<BalancePayload>(`/api/stock/balance?${params.toString()}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดสต๊อกคงเหลือไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [branchId, productId, q, status, warehouseId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredRows = useMemo(() => {
    return (data?.rows ?? [])
      .filter((row) => !group || row.productMetalGroup === group)
      .filter((row) => status !== ON_HOLD_STATUS || row.onHoldQty > 0)
  }, [data?.rows, group, status])

  const summary = useMemo(() => filteredRows.reduce((acc, row) => {
    acc.qty += row.qty
    acc.value += row.value
    if (row.notAvailable) {
      acc.notAvailableQty += row.qty
      acc.notAvailableValue += row.value
    } else {
      acc.availableQty += row.qty
      acc.availableValue += row.value
      acc.onHoldQty += row.onHoldQty
      acc.readyQty += row.readyQty
    }
    if (row.qty < 0) acc.negativeRows += 1
    return acc
  }, { availableQty: 0, availableValue: 0, negativeRows: 0, notAvailableQty: 0, notAvailableValue: 0, onHoldQty: 0, qty: 0, readyQty: 0, value: 0 }), [filteredRows])

  const byStatus = useMemo(() => ['RM', 'WIP', 'FG'].map((itemStatus) => {
    const rows = filteredRows.filter((row) => row.status === itemStatus)
    return {
      count: rows.length,
      qty: rows.reduce((sum, row) => sum + row.qty, 0),
      status: itemStatus,
      value: rows.reduce((sum, row) => sum + row.value, 0),
    }
  }), [filteredRows])

  const matrixRows = useMemo(() => {
    const groups = new Map<string, { fgQty: number; fgVal: number; group: string; rmQty: number; rmVal: number; wipQty: number; wipVal: number }>()
    for (const row of filteredRows) {
      const key = row.productMetalGroup || 'อื่นๆ'
      const current = groups.get(key) ?? { fgQty: 0, fgVal: 0, group: key, rmQty: 0, rmVal: 0, wipQty: 0, wipVal: 0 }
      if (row.status === 'FG') {
        current.fgQty += row.qty
        current.fgVal += row.value
      } else if (row.status === 'WIP') {
        current.wipQty += row.qty
        current.wipVal += row.value
      } else {
        current.rmQty += row.qty
        current.rmVal += row.value
      }
      groups.set(key, current)
    }
    return Array.from(groups.values()).sort((a, b) => (b.rmVal + b.wipVal + b.fgVal) - (a.rmVal + a.wipVal + a.fgVal))
  }, [filteredRows])

  const groupOptions = useMemo(() => Array.from(new Set([
    ...((data?.reference.products ?? []).map((item) => item.metalGroup).filter(Boolean) as string[]),
    ...((data?.rows ?? []).map((row) => row.productMetalGroup).filter(Boolean)),
  ])).sort(), [data?.reference.products, data?.rows])
  const productOptions = useMemo<SearchComboboxOption[]>(() => (data?.reference.products ?? []).map((item) => ({
    description: item.metalGroup || undefined,
    id: item.id,
    label: item.code ? `${item.code} - ${item.name}` : item.name,
    searchText: `${item.code ?? ''} ${item.name} ${item.metalGroup ?? ''}`,
  })), [data?.reference.products])

  const selectedProductRows = useMemo(() => {
    if (!productId) return []
    return filteredRows.filter((row) => row.productId === productId)
  }, [filteredRows, productId])

  const selectedProduct = data?.reference.products.find((item) => item.id === productId) ?? null
  const selectedProductInfo = selectedProduct && selectedProductRows.length
    ? selectedProductRows.reduce((acc, row) => {
        acc.qty += row.qty
        acc.value += row.value
        if (!row.notAvailable) {
          acc.available += row.qty
          acc.onHold += row.onHoldQty
          acc.ready += row.readyQty
        }
        return acc
      }, { available: 0, onHold: 0, product: selectedProduct, qty: 0, ready: 0, value: 0 })
    : null
  const averageCost = summary.qty > 0 ? summary.value / summary.qty : 0

  function exportXlsx() {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (q.trim()) params.set('q', q.trim())
    if (branchId) params.set('branchId', branchId)
    if (productId) params.set('productId', productId)
    if (warehouseId) params.set('warehouseId', warehouseId)
    if (status && status !== ON_HOLD_STATUS) params.set('status', status)
    if (status === ON_HOLD_STATUS) params.set('onHold', '1')
    window.location.href = `/api/stock/balance?${params.toString()}`
  }

  return (
    <section>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 shadow-sm grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-6 text-sm">
        <Metric emoji="⚖️" iconBg="bg-blue-100 text-blue-700" label="น้ำหนักสต๊อกรวม" value={`${formatMoney(summary.qty)} กก.`} tone="blue" />
        <Metric emoji="💰" iconBg="bg-emerald-100 text-emerald-700" label="มูลค่าสต๊อกรวม" value={formatMoney(summary.value)} tone="emerald" />
        <Metric emoji="⏳" iconBg="bg-amber-100 text-amber-700" label="จองไว้" sub="จาก WTO ที่ยังไม่ออกบิล" value={`${formatMoney(summary.onHoldQty)} กก.`} tone="amber" />
        <Metric emoji="✅" iconBg="bg-emerald-100 text-emerald-700" label="พร้อมส่ง" sub={`${summary.availableQty > 0 ? (summary.readyQty / summary.availableQty * 100).toFixed(1) : '0'}% ของ Stock ที่พร้อมขาย`} value={`${formatMoney(summary.readyQty)} กก.`} tone="emerald" />
        <Metric emoji="⚠️" iconBg="bg-red-100 text-red-700" label="ไม่พร้อมขาย" sub={`${summary.value > 0 ? (summary.notAvailableValue / summary.value * 100).toFixed(1) : '0'}% ของ Stock`} value={formatMoney(summary.notAvailableValue)} tone="red" />
        <Metric emoji="📊" iconBg="bg-slate-100 text-slate-700" label="ราคา/กก. เฉลี่ย" value={formatMoney(averageCost)} />
      </div>
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {byStatus.map((item) => <StatusCard key={item.status} item={item} />)}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border">
          <button className={`px-4 py-2 text-sm ${viewMode === 'summary' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`} type="button" onClick={() => setViewMode('summary')}>📊 Matrix (กลุ่ม × คลัง)</button>
          <button className={`border-l px-4 py-2 text-sm ${viewMode === 'detail' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600'}`} type="button" onClick={() => setViewMode('detail')}>📄 รายสินค้า</button>
        </div>
        <select className="rounded-md border px-3 py-2 text-sm" value={group} onChange={(event) => setGroup(event.target.value)}>
          <option value="">ทุกหมวด</option>{groupOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">ทุกคลัง</option><option value="RM">📦 RM</option><option value="WIP">⚙️ WIP</option><option value="FG">✅ FG</option><option value={ON_HOLD_STATUS}>On Hold</option>
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={branchId} onChange={(event) => { setBranchId(event.target.value); setWarehouseId('') }}>
          <option value="">ทุกสาขา</option>{data?.reference.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div className="min-w-72">
          <SearchCombobox
            hideLabel
            inputClassName="h-9 text-sm"
            inputId="stock-balance-product-search"
            label="สินค้า"
            options={productOptions}
            placeholder="ค้นหารหัสหรือชื่อสินค้า"
            value={productId}
            onChange={setProductId}
          />
        </div>
        {productId ? <button className="rounded-md bg-slate-100 px-2 py-1.5 text-xs hover:bg-slate-200" type="button" onClick={() => setProductId('')}>✕ ล้าง</button> : null}
        <button className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm text-white" type="button" onClick={exportXlsx}>ส่งออก Excel</button>
      </div>
      {productId && selectedProductInfo ? (
        <ProductPanel averageCost={selectedProductInfo.qty > 0 ? selectedProductInfo.value / selectedProductInfo.qty : 0} info={selectedProductInfo} rows={selectedProductRows} onClose={() => setProductId('')} onOpen={setDetailRow} />
      ) : null}
      <div className="mb-3 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-56 flex-1 rounded-md border px-3 py-2 text-sm" placeholder="ค้นหารหัส/ชื่อสินค้า/Lot/สาขา/คลัง/หมวด" type="search" value={q} onChange={(event) => setQ(event.target.value)} />
          <select className="rounded-md border px-3 py-2 text-sm" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
            <option value="">ทุกคลัง</option>{data?.reference.warehouses.filter((item) => !branchId || item.branchId === branchId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={() => void loadData()}>Refresh</button>
          <span className="text-xs text-slate-500">พบ {filteredRows.length} รายการ / ติดลบ {summary.negativeRows} รายการ</span>
        </div>
      </div>
      {viewMode === 'summary' ? (
        <>
          <StockCharts byStatus={byStatus} matrixRows={matrixRows} totalValue={summary.value} />
          <MatrixTable byStatus={byStatus} isLoading={isLoading} matrixRows={matrixRows} totalQty={summary.qty} totalValue={summary.value} />
        </>
      ) : <DetailTable isLoading={isLoading} onOpen={setDetailRow} rows={filteredRows} />}
      {detailRow ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-10">
          <div className="w-full max-w-xl overflow-hidden rounded-md bg-slate-900 shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between bg-slate-900 px-5 py-4 shrink-0">
              <h3 className="font-bold text-slate-100">รายละเอียดสต๊อก</h3>
              <button className="text-2xl text-slate-400 hover:text-slate-200" type="button" onClick={() => setDetailRow(null)}>&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-5 space-y-2 text-sm">
              <Info label="สินค้า" value={`${detailRow.productCode} ${detailRow.productName}`} />
              <Info label="คลัง" value={stockStatusText(detailRow)} />
              <Info label="สาขา/คลัง" value={`${detailRow.branchName} / ${detailRow.warehouseName}`} />
              <Info label="Lot" value={detailRow.lotNo || '-'} />
              <Info label="คงเหลือ" value={`${formatMoney(detailRow.qty)} กก.`} />
              <Info label="จองไว้" value={`${formatMoney(detailRow.onHoldQty)} กก.`} />
              <Info label="พร้อมส่ง" value={`${formatMoney(detailRow.readyQty)} กก.`} />
              <Info label="มูลค่า" value={formatMoney(detailRow.value)} />
              <Info label="ต้นทุนเฉลี่ย" value={formatMoney(detailRow.avgCost)} />
              <Info label="วันที่ล่าสุด" value={detailRow.lastDate} />
            </div>
            <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
              <button className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50" type="button" onClick={() => setDetailRow(null)}>ปิด</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

type StatusSummary = { count: number; qty: number; status: string; value: number }

type MatrixRow = { fgQty: number; fgVal: number; group: string; rmQty: number; rmVal: number; wipQty: number; wipVal: number }

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex border-b py-1"><span className="w-32 text-slate-500">{label}</span><span className="font-medium text-slate-900">{value}</span></div>
}

function Metric({
  emoji,
  iconBg = 'bg-slate-100',
  label,
  sub,
  tone,
  value,
}: {
  emoji: string
  iconBg?: string
  label: string
  sub?: string
  tone?: 'amber' | 'blue' | 'emerald' | 'red' | 'slate'
  value: string
}) {
  const color = tone === 'blue'
    ? 'text-blue-600'
    : tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'red'
          ? 'text-red-600'
          : 'text-slate-900'
  return (
    <div className="bg-white p-3 sm:p-4 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-3">
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${iconBg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-500 truncate">{label}</div>
        <div className={`text-sm font-bold ${color} mt-0.5 tabular-nums`}>{value}</div>
        {sub ? <div className="text-[10px] text-slate-400 mt-0.5 truncate">{sub}</div> : null}
      </div>
    </div>
  )
}

function StatusCard({ item }: { item: StatusSummary }) {
  const meta = item.status === 'FG'
    ? { border: 'border-emerald-500', icon: '✅', label: 'FG (พร้อมขาย)', text: 'text-emerald-700', bg: 'bg-emerald-50' }
    : item.status === 'WIP'
      ? { border: 'border-amber-500', icon: '⚙️', label: 'WIP (กำลังผลิต)', text: 'text-amber-700', bg: 'bg-amber-50' }
      : { border: 'border-blue-500', icon: '📦', label: 'RM (วัตถุดิบ)', text: 'text-blue-700', bg: 'bg-blue-50' }
  return (
    <div className={`rounded-md border-l-4 p-4 shadow ${meta.bg} ${meta.border}`}>
      <div className={`text-xs ${meta.text}`}>{meta.icon} {meta.label} — {item.count} รายการ</div>
      <div className={`text-xl font-bold ${meta.text}`}>{formatMoney(item.qty)} กก.</div>
      <div className="text-sm text-slate-600">มูลค่า {formatMoney(item.value)}</div>
    </div>
  )
}

function ProductPanel({ averageCost, info, onClose, onOpen, rows }: {
  averageCost: number
  info: { available: number; onHold: number; product: StockOption; qty: number; ready: number; value: number }
  onClose: () => void
  onOpen: (row: BalanceRow) => void
  rows: BalanceRow[]
}) {
  return (
    <div className="mb-3 rounded-md border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-4 shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold text-indigo-700">📦 {info.product.name}</h3>
          <p className="font-mono text-sm text-slate-600">{info.product.code ?? '-'} · {info.product.metalGroup ?? '-'} · {info.product.status ?? 'RM'}</p>
        </div>
        <button className="text-sm text-slate-500 hover:text-slate-800" type="button" onClick={onClose}>✕ ปิด</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-md bg-white p-3 shadow"><div className="text-xs text-slate-500">📊 คงเหลือ</div><div className={`text-2xl font-bold ${info.qty > 0 ? 'text-emerald-700' : 'text-red-600'}`}>{formatMoney(info.qty)} <span className="text-sm font-normal">กก.</span></div></div>
        <div className="rounded-md bg-white p-3 shadow"><div className="text-xs text-slate-500">💰 มูลค่ารวม (WAC)</div><div className="text-2xl font-bold text-blue-700">{formatMoney(info.value)} <span className="text-sm font-normal">บาท</span></div></div>
        <div className="rounded-md bg-white p-3 shadow"><div className="text-xs text-slate-500">⚖ ราคาเฉลี่ย/กก.</div><div className="text-2xl font-bold text-amber-700">{formatMoney(averageCost)} <span className="text-sm font-normal">บ./กก.</span></div></div>
        <div className="rounded-md bg-white p-3 shadow"><div className="text-xs text-slate-500">จองไว้</div><div className="text-2xl font-bold text-amber-700">{formatMoney(info.onHold)} <span className="text-sm font-normal">กก.</span></div></div>
        <div className="rounded-md bg-white p-3 shadow"><div className="text-xs text-slate-500">พร้อมส่ง</div><div className="text-2xl font-bold text-emerald-600">{formatMoney(info.ready)} <span className="text-sm font-normal">กก.</span></div></div>
      </div>
      <div className="mt-3 rounded-md bg-white shadow">
        <div className="flex items-center justify-between border-b bg-slate-50 p-3">
          <h4 className="font-bold text-slate-700">📜 รายการสต๊อกของสินค้านี้ ({rows.length} รายการ)</h4>
          <span className="text-xs text-slate-500">กด Detail เพื่อดู row ปัจจุบัน</span>
        </div>
        <div className="max-h-[400px] overflow-x-auto overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-100">
              <tr><th className="p-2 text-left">วันที่ล่าสุด</th><th className="p-2 text-left">คลัง</th><th className="p-2 text-left">สาขา/คลัง</th><th className="p-2 text-left">Lot</th><th className="p-2 text-right">คงเหลือ</th><th className="p-2 text-right">จองไว้</th><th className="p-2 text-right">พร้อมส่ง</th><th className="p-2 text-right">มูลค่า</th><th className="p-2 text-center">Action</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-t hover:bg-blue-50/30">
                  <td className="p-2">{row.lastDate}</td>
                  <td className="p-2"><StockStatusCell row={row} /></td>
                  <td className="p-2 text-slate-500">{row.branchName} / {row.warehouseName}</td>
                  <td className="p-2 font-mono">{row.lotNo || '-'}</td>
                  <td className={`p-2 text-right font-medium ${row.qty < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(row.qty)}</td>
                  <td className="p-2 text-right text-amber-700">{row.onHoldQty ? formatMoney(row.onHoldQty) : '-'}</td>
                  <td className="p-2 text-right text-emerald-700">{formatMoney(row.readyQty)}</td>
                  <td className="p-2 text-right">{formatMoney(row.value)}</td>
                  <td className="p-2 text-center"><button className="rounded-md bg-blue-50 px-2 py-1 text-blue-700" type="button" onClick={() => onOpen(row)}>Detail</button></td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td className="py-6 text-center text-slate-400" colSpan={9}>ยังไม่มีรายการ</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StockCharts({ byStatus, matrixRows, totalValue }: { byStatus: StatusSummary[]; matrixRows: MatrixRow[]; totalValue: number }) {
  const rm = byStatus.find((item) => item.status === 'RM')?.value ?? 0
  const wip = byStatus.find((item) => item.status === 'WIP')?.value ?? 0
  const fg = byStatus.find((item) => item.status === 'FG')?.value ?? 0
  const rmDeg = totalValue > 0 ? rm / totalValue * 360 : 0
  const wipDeg = totalValue > 0 ? wip / totalValue * 360 : 0
  const maxGroup = Math.max(1, ...matrixRows.map((row) => row.rmVal + row.wipVal + row.fgVal))
  return (
    <div className="mb-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-md bg-white p-4 shadow">
        <h3 className="mb-2 font-bold text-slate-800">🥧 สัดส่วน Stock RM/WIP/FG (มูลค่า)</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-[180px] w-[180px] items-center justify-center rounded-md-full" style={{ background: totalValue > 0 ? `conic-gradient(#3b82f6 0deg ${rmDeg}deg, #f59e0b ${rmDeg}deg ${rmDeg + wipDeg}deg, #10b981 ${rmDeg + wipDeg}deg 360deg)` : '#e5e7eb' }}>
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-md-full bg-white text-center">
              <span className="text-xs text-slate-500">รวม</span>
              <span className="text-xs font-bold text-slate-900">{formatMoney(totalValue)}</span>
            </div>
          </div>
          <div className="min-w-56 flex-1 space-y-2 text-sm">
            <LegendRow color="bg-blue-500" label="📦 RM" value={rm} />
            <LegendRow color="bg-amber-500" label="⚙️ WIP" value={wip} />
            <LegendRow color="bg-emerald-500" label="✅ FG" value={fg} />
            <div className="flex justify-between border-t pt-2 font-bold"><span>รวม</span><span>{formatMoney(totalValue)}</span></div>
          </div>
        </div>
      </div>
      <div className="rounded-md bg-white p-4 shadow">
        <h3 className="mb-2 font-bold text-slate-800">📊 Top หมวดสินค้า (มูลค่าสต๊อก)</h3>
        {matrixRows.length === 0 ? <div className="py-8 text-center text-slate-400">ไม่มีข้อมูล</div> : null}
        <div className="space-y-2">
          {matrixRows.slice(0, 8).map((row, index) => {
            const value = row.rmVal + row.wipVal + row.fgVal
            const colors = ['from-blue-500 to-blue-400', 'from-emerald-500 to-emerald-400', 'from-amber-500 to-amber-400', 'from-red-500 to-red-400', 'from-indigo-500 to-indigo-400', 'from-cyan-500 to-cyan-400', 'from-pink-500 to-pink-400', 'from-lime-500 to-lime-400']
            return (
              <div key={row.group}>
                <div className="mb-0.5 flex justify-between text-sm"><span className="font-medium">{row.group} <span className="text-xs text-slate-400">({formatMoney(row.rmQty + row.wipQty + row.fgQty)} กก.)</span></span><span className="font-mono font-bold">{formatMoney(value)}</span></div>
                <div className="h-2 w-full rounded-md-full bg-slate-100"><div className={`h-2 rounded-md-full bg-gradient-to-r ${colors[index % colors.length]}`} style={{ width: `${Math.max(2, value / maxGroup * 100)}%` }} /></div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return <div className="flex justify-between"><span className="flex items-center gap-2"><span className={`h-3 w-3 rounded-md ${color}`} />{label}</span><span className="font-bold">{formatMoney(value)}</span></div>
}

function MatrixTable({ byStatus, isLoading, matrixRows, totalQty, totalValue }: { byStatus: StatusSummary[]; isLoading: boolean; matrixRows: MatrixRow[]; totalQty: number; totalValue: number }) {
  const valueFor = (status: string) => byStatus.find((item) => item.status === status) ?? { count: 0, qty: 0, status, value: 0 }
  return (
    <div className="overflow-x-auto rounded-md bg-white shadow">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="bg-slate-100"><tr><th className="p-2 text-left">หมวดสินค้า</th><th className="bg-blue-50 p-2 text-right">📦 RM (กก.)</th><th className="bg-blue-50 p-2 text-right">RM มูลค่า</th><th className="bg-amber-50 p-2 text-right">⚙️ WIP (กก.)</th><th className="bg-amber-50 p-2 text-right">WIP มูลค่า</th><th className="bg-emerald-50 p-2 text-right">✅ FG (กก.)</th><th className="bg-emerald-50 p-2 text-right">FG มูลค่า</th><th className="p-2 text-right">รวม กก.</th><th className="p-2 text-right">รวมมูลค่า</th></tr></thead>
        <tbody>
          {isLoading ? <tr><td className="p-8 text-center text-slate-400" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && matrixRows.map((row) => (
            <tr key={row.group} className="border-t hover:bg-slate-50">
              <td className="p-2 font-bold">{row.group}</td>
              <td className="p-2 text-right text-blue-700">{row.rmQty ? formatMoney(row.rmQty) : '-'}</td>
              <td className="p-2 text-right text-blue-700">{row.rmVal ? formatMoney(row.rmVal) : '-'}</td>
              <td className="p-2 text-right text-amber-700">{row.wipQty ? formatMoney(row.wipQty) : '-'}</td>
              <td className="p-2 text-right text-amber-700">{row.wipVal ? formatMoney(row.wipVal) : '-'}</td>
              <td className="p-2 text-right text-emerald-700">{row.fgQty ? formatMoney(row.fgQty) : '-'}</td>
              <td className="p-2 text-right text-emerald-700">{row.fgVal ? formatMoney(row.fgVal) : '-'}</td>
              <td className="p-2 text-right font-bold">{formatMoney(row.rmQty + row.wipQty + row.fgQty)}</td>
              <td className="p-2 text-right font-bold text-emerald-700">{formatMoney(row.rmVal + row.wipVal + row.fgVal)}</td>
            </tr>
          ))}
          {!isLoading && matrixRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={9}>ไม่มีสต๊อก</td></tr> : null}
        </tbody>
        {matrixRows.length ? (
          <tfoot className="bg-slate-100 font-bold">
            <tr><td className="p-2">รวมทั้งหมด ({matrixRows.length} หมวด)</td><td className="p-2 text-right text-blue-700">{formatMoney(valueFor('RM').qty)}</td><td className="p-2 text-right text-blue-700">{formatMoney(valueFor('RM').value)}</td><td className="p-2 text-right text-amber-700">{formatMoney(valueFor('WIP').qty)}</td><td className="p-2 text-right text-amber-700">{formatMoney(valueFor('WIP').value)}</td><td className="p-2 text-right text-emerald-700">{formatMoney(valueFor('FG').qty)}</td><td className="p-2 text-right text-emerald-700">{formatMoney(valueFor('FG').value)}</td><td className="p-2 text-right">{formatMoney(totalQty)}</td><td className="p-2 text-right text-base text-emerald-700">{formatMoney(totalValue)}</td></tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  )
}

function DetailTable({ isLoading, onOpen, rows }: { isLoading: boolean; onOpen: (row: BalanceRow) => void; rows: BalanceRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md bg-white shadow">
      <table className="w-full min-w-[1260px] text-sm">
        <thead className="bg-slate-100"><tr><th className="p-2 text-left">สินค้า</th><th className="p-2 text-left">หมวด</th><th className="p-2 text-center">คลัง</th><th className="p-2 text-left">สาขา</th><th className="p-2 text-right">คงเหลือ (กก.)</th><th className="bg-amber-50 p-2 text-right">จองไว้</th><th className="bg-emerald-50 p-2 text-right">พร้อมส่ง</th><th className="p-2 text-right">ต้นทุน/กก.</th><th className="p-2 text-right">มูลค่า</th><th className="bg-red-50 p-2 text-right">ไม่พร้อมขาย</th><th className="p-2 text-center">Action</th></tr></thead>
        <tbody>
          {isLoading ? <tr><td className="p-8 text-center text-slate-400" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.map((row) => (
            <tr key={row.key} className={`border-t ${row.qty < 0 ? 'bg-red-50/60' : 'hover:bg-slate-50'}`}>
              <td className="p-2"><span className="font-mono text-xs text-slate-500">{row.productCode}</span> {row.productName}<div className="text-xs text-slate-400">Lot: {row.lotNo || '-'}</div></td>
              <td className="p-2">{row.productMetalGroup || 'อื่นๆ'}</td>
              <td className="p-2 text-center"><StockStatusCell row={row} /></td>
              <td className="p-2">{row.branchName}<div className="text-xs text-slate-500">{row.warehouseName}</div></td>
              <td className={`p-2 text-right font-medium ${row.qty < 0 ? 'text-red-600' : ''}`}>{formatMoney(row.qty)}</td>
              <td className="p-2 text-right text-amber-700">{row.onHoldQty ? formatMoney(row.onHoldQty) : '-'}</td>
              <td className="p-2 text-right text-emerald-700">{formatMoney(row.readyQty)}</td>
              <td className="p-2 text-right text-slate-500">{formatMoney(row.avgCost)}</td>
              <td className="p-2 text-right font-bold text-emerald-700">{formatMoney(row.value)}</td>
              <td className={`p-2 text-right ${row.notAvailable ? 'font-medium text-red-600' : 'text-slate-400'}`}>{row.notAvailable ? formatMoney(row.qty) : '-'}</td>
              <td className="p-2 text-center"><button className="rounded-md bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700" type="button" onClick={() => onOpen(row)}>Detail</button></td>
            </tr>
          ))}
          {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={11}>ไม่มีสต๊อก</td></tr> : null}
        </tbody>
        {rows.length ? <tfoot className="bg-slate-100 font-bold"><tr><td className="p-2" colSpan={4}>รวม</td><td className="p-2 text-right">{formatMoney(rows.reduce((sum, row) => sum + row.qty, 0))}</td><td className="p-2 text-right text-amber-700">{formatMoney(rows.reduce((sum, row) => sum + row.onHoldQty, 0))}</td><td className="p-2 text-right text-emerald-700">{formatMoney(rows.reduce((sum, row) => sum + row.readyQty, 0))}</td><td /><td className="p-2 text-right text-emerald-700">{formatMoney(rows.reduce((sum, row) => sum + row.value, 0))}</td><td className="p-2 text-right text-red-700">{formatMoney(rows.filter((row) => row.notAvailable).reduce((sum, row) => sum + row.qty, 0))}</td><td /></tr></tfoot> : null}
      </table>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const className = status === 'FG' ? 'bg-emerald-100 text-emerald-700' : status === 'WIP' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
  return <span className={`rounded-md px-2 py-0.5 text-xs ${className}`}>{status || '-'}</span>
}

function HoldBadge() {
  return <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-800">On Hold</span>
}

function StockStatusCell({ row }: { row: BalanceRow }) {
  return (
    <div className="flex flex-wrap justify-center gap-1">
      <StatusBadge status={row.status} />
      {row.onHoldQty > 0 ? <HoldBadge /> : null}
    </div>
  )
}

function stockStatusText(row: BalanceRow) {
  return row.onHoldQty > 0 ? `${row.status || '-'} / On Hold` : row.status || '-'
}
