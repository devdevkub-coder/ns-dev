'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type ProductOption = {
  code: string
  id: string
  metalGroup: string
  name: string
  poolCount?: number
  poolQty?: number
  poSellCount?: number
}

type PoSellOption = {
  customerName: string
  date: string
  docNo: string
  id: string
  matchedQty: number
  productId: string
  productName: string
  qty: number
  remainingQty: number
  unitPrice: number
}

type CandidateRow = {
  availableQty: number
  costPoolId: string
  counterparty: string
  qtyToUse: number
  sourceNo: string
  sourceType: string
  totalCostUse: number
  unitCost: number
}

type Payload = {
  candidates: CandidateRow[]
  filters: {
    modes: string[]
    products: ProductOption[]
    sourceTypes: string[]
  }
  pool: Array<{ availableQty: number; availableValue: number }>
  poSells: PoSellOption[]
  selectedPoSell: PoSellOption | null
  summary: {
    expectedMargin: number
    expectedRevenue: number
    poolAvgCost: number
    poolCount: number
    poolQty: number
    poolValue: number
    remainingAfterPreview: number
    totalCostMatch: number
    totalToMatch: number
  }
  writeDeferred: boolean
}

export function CostAllocatorPageClient() {
  const [allocationMode, setAllocationMode] = useState('FIFO')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPoSellId, setSelectedPoSellId] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')
  const [showPreview, setShowPreview] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('mode', allocationMode)
    if (selectedProductId) params.set('productId', selectedProductId)
    if (selectedPoSellId) params.set('poSellId', selectedPoSellId)
    return params.toString()
  }, [allocationMode, selectedPoSellId, selectedProductId])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<Payload>(`/api/dual-costing/cost-allocator?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Cost Allocator ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const selectedProduct = data?.filters.products.find((product) => product.id === selectedProductId)
  const hasSelection = Boolean(selectedProductId)
  const hasPoSell = Boolean(data?.selectedPoSell)
  const hasCandidates = (data?.candidates.length ?? 0) > 0

  const resetSale = () => {
    setSelectedPoSellId('')
    setShowPreview(false)
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-800">
        <strong>Cost Allocator</strong> — เลือก<strong>สินค้า</strong> → เลือก<strong>PO ขาย</strong> → Auto/Manual Match ต้นทุนจาก Cost Pool
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-xl bg-white p-4 shadow">
        <h3 className="mb-3 font-semibold">① เลือกสินค้าที่ต้องการ Match ต้นทุน</h3>
        <select className="w-full rounded border px-3 py-2 text-base" value={selectedProductId} onChange={(event) => { setSelectedProductId(event.target.value); resetSale() }}>
          <option value="">— เลือกสินค้า —</option>
          {(data?.filters.products ?? []).map((product) => <option key={product.id} value={product.id}>{product.code ? `${product.code} - ` : ''}{product.name}{product.metalGroup ? ` · ${product.metalGroup}` : ''}</option>)}
        </select>
        {hasSelection ? (
          <div className="mt-3 grid grid-cols-2 gap-3 rounded bg-purple-50 p-3 text-sm md:grid-cols-4">
            <SummaryItem label="Cost Pool ของสินค้านี้" value={`${data?.summary.poolCount ?? 0} รายการ`} />
            <SummaryItem label="น้ำหนักพร้อมจัดสรร" tone="blue" value={`${formatMoney(data?.summary.poolQty ?? 0)} กก.`} />
            <SummaryItem label="มูลค่าต้นทุนรวม" value={formatMoney(data?.summary.poolValue ?? 0)} />
            <SummaryItem label="ต้นทุนเฉลี่ย/กก." tone="emerald" value={formatMoney(data?.summary.poolAvgCost ?? 0)} />
          </div>
        ) : null}
        {hasSelection && !isLoading && (data?.summary.poolCount ?? 0) === 0 ? <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">ยังไม่มีต้นทุนใน Cost Pool สำหรับสินค้านี้ - สร้าง PO Buy หรือบันทึกบิลซื้อสินค้านี้ก่อน</div> : null}
      </div>

      {hasSelection ? (
        <div className="rounded-xl bg-white p-4 shadow">
          <h3 className="mb-3 font-semibold">② เลือก PO ขาย ของสินค้านี้ที่จะ Match ต้นทุน</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs">PO Sell *</label>
              <select className="w-full rounded border px-2 py-2" value={selectedPoSellId} onChange={(event) => { setSelectedPoSellId(event.target.value); setShowPreview(false) }}>
                <option value="">-- เลือก PO ขาย --</option>
                {(data?.poSells ?? []).map((po) => <option key={po.id} value={po.id}>{po.docNo} | {po.customerName} | จองขาย {formatMoney(po.qty)} กก. · เหลือต้อง match {formatMoney(po.remainingQty)} กก. · ฿{formatMoney(po.unitPrice)}/กก.</option>)}
              </select>
              {!isLoading && (data?.poSells.length ?? 0) === 0 ? <div className="mt-1 text-xs text-amber-700">⚠ ไม่มี PO ขาย ของสินค้านี้ที่ยังไม่ match — สร้าง PO Sell ก่อน</div> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs">Allocation Mode</label>
              <select className="w-full rounded border px-2 py-2" value={allocationMode} onChange={(event) => setAllocationMode(event.target.value)}>
                <option value="FIFO">FIFO - ต้นทุนเก่าก่อน</option>
                <option value="Cheap">Cheap First - ต้นทุนถูกก่อน (Max Margin)</option>
                <option value="Expensive">Expensive First - ต้นทุนแพงก่อน (Conservative)</option>
                <option value="Manual">Manual - เลือกเอง</option>
              </select>
            </div>
          </div>

          {hasPoSell ? (
            <div className="mt-3 grid grid-cols-2 gap-3 rounded bg-slate-50 p-3 text-sm md:grid-cols-5">
              <SummaryItem label="Customer" value={data?.selectedPoSell?.customerName ?? '-'} />
              <SummaryItem label="สินค้า" value={selectedProduct?.name ?? data?.selectedPoSell?.productName ?? '-'} />
              <SummaryItem label="จำนวนรวม" value={`${formatMoney(data?.selectedPoSell?.qty ?? 0)} กก.`} />
              <SummaryItem label="ราคาขาย" value={formatMoney(data?.selectedPoSell?.unitPrice ?? 0)} />
              <SummaryItem label="ต้อง Match อีก" tone="amber" value={`${formatMoney(data?.selectedPoSell?.remainingQty ?? 0)} กก.`} />
            </div>
          ) : null}
          {hasPoSell ? (
            <div className="mt-3">
              <button className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700" type="button" onClick={() => setShowPreview(true)}>🎯 Auto Match จาก Cost Pool</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showPreview && hasCandidates ? (
        <div className="rounded-xl bg-white p-4 shadow">
          <h3 className="mb-3 font-semibold">2. Preview การ Match (ปรับ qty_to_use ได้สำหรับ Manual)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100"><tr><th className="p-2 text-left">Source</th><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">Counterparty</th><th className="p-2 text-right">Available</th><th className="p-2 text-right">ต้นทุน/หน่วย</th><th className="p-2 text-right">qty ที่ใช้</th><th className="p-2 text-right">มูลค่าใช้</th></tr></thead>
              <tbody>
                {(data?.candidates ?? []).map((row) => (
                  <tr key={row.costPoolId} className="border-t">
                    <td className="p-2"><span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{row.sourceType}</span></td>
                    <td className="p-2 font-mono text-xs">{row.sourceNo}</td>
                    <td className="p-2">{row.counterparty}</td>
                    <td className="p-2 text-right">{formatMoney(row.availableQty)}</td>
                    <td className="p-2 text-right">{formatMoney(row.unitCost)}</td>
                    <td className="p-2 text-right"><input className="w-24 rounded border px-2 py-1 text-right" disabled type="number" value={row.qtyToUse} readOnly /></td>
                    <td className="p-2 text-right font-medium">{formatMoney(row.totalCostUse)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-center md:grid-cols-4">
            <MetricBox label="รวมที่จะ Match" tone="blue" value={`${formatMoney(data?.summary.totalToMatch ?? 0)} กก.`} />
            <MetricBox label="รายได้คาดการณ์" tone="emerald" value={formatMoney(data?.summary.expectedRevenue ?? 0)} />
            <MetricBox label="ต้นทุนที่จะตัด" tone="red" value={formatMoney(data?.summary.totalCostMatch ?? 0)} />
            <MetricBox label="Expected Margin" tone={(data?.summary.expectedMargin ?? 0) >= 0 ? 'purple' : 'red'} value={formatMoney(data?.summary.expectedMargin ?? 0)} />
          </div>
          <div className="mt-4 flex justify-end gap-2"><button className="px-4 py-2 text-sm" type="button" onClick={() => setShowPreview(false)}>ยกเลิก</button><button className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white opacity-60" disabled type="button">✓ ยืนยัน Match → สร้าง Match Log</button></div>
        </div>
      ) : null}
    </section>
  )
}

function SummaryItem({ label, tone = 'normal', value }: { label: string; tone?: 'amber' | 'blue' | 'emerald' | 'normal'; value: string }) {
  const valueClass = { amber: 'text-amber-700', blue: 'text-blue-700', emerald: 'text-emerald-700', normal: 'text-slate-900' }[tone]
  return <div><div className="text-xs text-slate-500">{label}</div><div className={`font-bold ${valueClass}`}>{value}</div></div>
}

function MetricBox({ label, tone, value }: { label: string; tone: 'blue' | 'emerald' | 'purple' | 'red'; value: string }) {
  const classes = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    purple: 'bg-purple-50 text-purple-700',
    red: 'bg-red-50 text-red-700',
  }[tone]
  return <div className={`rounded p-3 ${classes}`}><div className="text-xs opacity-80">{label}</div><div className="font-bold">{value}</div></div>
}
