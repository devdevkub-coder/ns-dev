'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type CostPoolRow = {
  availableQty: number
  availableValue: number
  branchName: string
  costPoolId: string
  costType: string
  counterparty: string
  date: string
  productId: string
  productName: string
  qty: number
  sourceNo: string
  sourceType: string
  status: string
  totalCost: number
  unitCost: number
  usedQty: number
}

type CostPoolPayload = {
  filters: {
    costTypes: string[]
    products: Array<{ id: string; name: string }>
    sourceTypes: string[]
    statuses: string[]
  }
  rows: CostPoolRow[]
  summary: {
    availableQty: number
    availableValue: number
    originalQty: number
    originalValue: number
    rows: number
    usedQty: number
  }
  summaryByCostType: Array<{ availableQty: number; availableValue: number; count: number; costType: string }>
}

export function CostPoolPageClient() {
  const [availableOnly, setAvailableOnly] = useState(true)
  const [costType, setCostType] = useState('all')
  const [data, setData] = useState<CostPoolPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [productId, setProductId] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('FIFO')
  const [sourceType, setSourceType] = useState('all')
  const [status, setStatus] = useState('all')
  const [toDate, setToDate] = useState('')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('availableOnly', String(availableOnly))
    if (costType !== 'all') params.set('costType', costType)
    if (fromDate) params.set('from', fromDate)
    if (productId !== 'all') params.set('productId', productId)
    if (search.trim()) params.set('q', search.trim())
    if (sort !== 'FIFO') params.set('sort', sort)
    if (sourceType !== 'all') params.set('sourceType', sourceType)
    if (status !== 'all') params.set('status', status)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [availableOnly, costType, fromDate, productId, search, sort, sourceType, status, toDate])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<CostPoolPayload>(`/api/dual-costing/cost-pool?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Cost Pool ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const exportHref = `/api/dual-costing/cost-pool?${queryString ? `${queryString}&` : ''}format=xlsx`

  const resetFilters = () => {
    setAvailableOnly(true)
    setCostType('all')
    setFromDate('')
    setProductId('all')
    setSearch('')
    setSort('FIFO')
    setSourceType('all')
    setStatus('all')
    setToDate('')
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <strong>💰 Cost Pool</strong> — ต้นทุนที่ <b>เหลือรอขาย</b> (ไม่ใช่ Stock จริง) ใช้สำหรับ <b>Match กับ PO Sell</b> เท่านั้น<br />
        <span className="text-xs">⚠ Cost Pool ≠ Stock จริง — Stock ใช้ WAC ลง P/L · Pool ใช้ต้นทุนจริงต่อ lot สำหรับ Match Deal</span>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        {costTypeCards.map((card) => {
          const row = data?.summaryByCostType.find((item) => item.costType === card.costType)
          return (
            <CostTypeCard
              key={card.costType}
              availableQty={row?.availableQty ?? 0}
              availableValue={row?.availableValue ?? 0}
              count={row?.count ?? 0}
              {...card}
            />
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="Original Qty" value={formatMoney(data?.summary.originalQty ?? 0)} />
        <Metric label="Matched Qty" value={formatMoney(data?.summary.usedQty ?? 0)} tone="amber" />
        <Metric label="Available Qty" value={formatMoney(data?.summary.availableQty ?? 0)} tone="emerald" />
        <Metric label="มูลค่ารวม" value={formatMoney(data?.summary.originalValue ?? 0)} />
        <Metric label="Available Value" value={formatMoney(data?.summary.availableValue ?? 0)} tone="emerald" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
          <select aria-label="สินค้า" className="rounded-lg border px-3 py-2 text-sm" value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="all">ทุกสินค้า</option>
            {(data?.filters.products ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          <select aria-label="Cost Type" className="rounded-lg border bg-amber-50 px-3 py-2 text-sm font-medium" value={costType} onChange={(event) => setCostType(event.target.value)}>
            <option value="all">ทุก Cost Type</option>
            {(data?.filters.costTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select aria-label="Source Type" className="rounded-lg border px-3 py-2 text-sm" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
            <option value="all">ทุก Source</option>
            {(data?.filters.sourceTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select aria-label="สถานะ" className="rounded-lg border px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select aria-label="เรียงลำดับ" className="rounded-lg border px-3 py-2 text-sm" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="FIFO">เรียง FIFO</option>
            <option value="LIFO">เรียง LIFO</option>
            <option value="Cheap">ต้นทุนถูกก่อน</option>
            <option value="Expensive">ต้นทุนแพงก่อน</option>
          </select>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-emerald-700"><input checked={availableOnly} className="h-4 w-4" type="checkbox" onChange={(event) => setAvailableOnly(event.target.checked)} /> แสดงเฉพาะ Available</label>
          {(fromDate || toDate || search) ? <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={resetFilters}>ล้าง</button> : null}
          <a className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={exportHref}>Export XLSX</a>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">Cost Type</th><th className="p-2 text-left">Source</th><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">Counterparty</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">Original</th><th className="p-2 text-right">Matched</th><th className="bg-emerald-50 p-2 text-right">Available</th><th className="p-2 text-right">฿/หน่วย</th><th className="bg-emerald-50 p-2 text-right">Available Value</th><th className="p-2 text-center">สถานะ</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && !error && (data?.rows.length ?? 0) === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={12}>Cost Pool ว่าง — ไม่มี lot ตามตัวกรอง</td></tr> : null}
            {!isLoading && (data?.rows ?? []).map((row) => (
              <tr key={row.costPoolId} className="border-t">
                <td className="p-2"><span className={`rounded px-2 py-0.5 text-[10px] font-medium ${costTypeBadgeClass(row.costType)}`}>{row.costType}</span></td>
                <td className="p-2"><span className={`rounded px-2 py-0.5 text-[10px] ${sourceBadgeClass(row.sourceType)}`}>{row.sourceType}</span></td>
                <td className="p-2 font-mono text-xs">{row.sourceNo}</td>
                <td className="p-2 text-xs">{row.date}</td>
                <td className="p-2 text-xs">{row.counterparty}</td>
                <td className="p-2 text-xs">{row.productName}</td>
                <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                <td className="p-2 text-right text-amber-700">{formatMoney(row.usedQty)}</td>
                <td className="bg-emerald-50/30 p-2 text-right font-bold text-emerald-700">{formatMoney(row.availableQty)}</td>
                <td className="p-2 text-right">{formatMoney(row.unitCost)}</td>
                <td className="bg-emerald-50/30 p-2 text-right font-medium text-emerald-700">{formatMoney(row.availableValue)}</td>
                <td className="p-2 text-center"><span className={`rounded px-2 py-0.5 text-[10px] ${statusBadgeClass(row.status)}`}>{row.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({ label, tone = 'normal', value }: { label: string; tone?: 'amber' | 'emerald' | 'normal'; value: string }) {
  const toneClass = { amber: 'text-amber-700', emerald: 'text-emerald-700', normal: 'text-slate-900' }[tone]
  const bgClass = tone === 'emerald' ? 'bg-emerald-50' : 'bg-white'
  const labelClass = tone === 'amber' ? 'text-amber-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-500'
  return <div className={`rounded-xl p-3 shadow ${bgClass}`}><div className={`text-xs ${labelClass}`}>{label}</div><div className={`mt-1 text-base font-bold ${toneClass}`}>{value}</div></div>
}

const costTypeCards = [
  { costType: 'Purchase', label: 'Purchase Cost (PO/Spot Buy)', tone: 'blue' },
  { costType: 'Production', label: 'Production Cost', tone: 'orange' },
  { costType: 'Regrade', label: 'Regrade / Conversion Cost', tone: 'purple' },
] as const

function CostTypeCard({
  availableQty,
  availableValue,
  count,
  costType,
  label,
  tone,
}: {
  availableQty: number
  availableValue: number
  count: number
  costType: string
  label: string
  tone: 'blue' | 'orange' | 'purple'
}) {
  const classes = {
    blue: 'border-blue-500 bg-blue-50 text-blue-700',
    orange: 'border-orange-500 bg-orange-50 text-orange-700',
    purple: 'border-purple-500 bg-purple-50 text-purple-700',
  }[tone]
  return (
    <div className={`rounded-lg border-l-4 p-3 ${classes}`}>
      <div className="text-xs font-bold">{label}</div>
      <div className="mt-1 text-lg font-bold">{formatMoney(availableQty)} กก.</div>
      <div className="text-xs">{formatMoney(availableValue)} ฿ · {count} lots · {costType}</div>
    </div>
  )
}

function costTypeBadgeClass(type: string) {
  if (type === 'Production') return 'bg-orange-100 text-orange-700'
  if (type === 'Regrade') return 'bg-purple-100 text-purple-700'
  return 'bg-blue-100 text-blue-700'
}

function sourceBadgeClass(type: string) {
  if (type === 'Production') return 'bg-orange-100 text-orange-700'
  if (type === 'Regrade') return 'bg-purple-100 text-purple-700'
  if (type === 'PO_Buy') return 'bg-cyan-100 text-cyan-700'
  return 'bg-blue-100 text-blue-700'
}

function statusBadgeClass(status: string) {
  if (status === 'Available') return 'bg-emerald-100 text-emerald-700'
  if (status === 'Partially Used') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-200 text-slate-600'
}
