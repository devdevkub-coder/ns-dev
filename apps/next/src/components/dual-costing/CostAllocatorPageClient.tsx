'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import {
  DualCostingErrorBox,
  DualCostingHint,
  DualCostingPageSection,
  DualCostingPanel,
  DualCostingStatCard,
} from './DualCostingPageShell'

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
  const [sourceType, setSourceType] = useState('po-sell')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('mode', allocationMode)
    params.set('sourceType', sourceType)
    if (selectedProductId) params.set('productId', selectedProductId)
    if (selectedPoSellId) params.set('poSellId', selectedPoSellId)
    return params.toString()
  }, [allocationMode, selectedPoSellId, selectedProductId, sourceType])

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
  const sourceTypeButtons = data?.filters.sourceTypes ?? ['po-sell', 'spot-sell']
  const sourceTypeLabel = sourceType === 'po-sell' ? 'PO Sell' : 'Spot Sell'
  const sourceTypeReady = sourceType === 'po-sell'

  function resetSale() {
    setSelectedPoSellId('')
    setShowPreview(false)
  }

  return (
    <DualCostingPageSection>
      <DualCostingHint tone="purple">
        <strong>Cost Allocator</strong> ใช้เลือกดีลขาย จากนั้น preview การหยิบต้นทุนจริงจาก Cost Pool ตามลำดับที่กำหนด โดย batch นี้ยังเป็น read-only และยังไม่เขียน match log จริง
      </DualCostingHint>

      <DualCostingErrorBox error={error} />

      <DualCostingPanel title="⓪ เลือกประเภทปลายทางที่จะ Match ต้นทุน">
        <div className="flex flex-wrap gap-2">
          {sourceTypeButtons.map((item) => {
            const active = sourceType === item
            return (
              <button
                key={item}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                type="button"
                onClick={() => {
                  setSourceType(item)
                  setSelectedProductId('')
                  resetSale()
                }}
              >
                {item === 'po-sell' ? 'PO Sell' : 'Spot Sell'}
              </button>
            )
          })}
        </div>
        {!sourceTypeReady ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Spot Sell allocator ยังเป็น shell ตาม design เดิม แต่ data source / write flow ยังไม่เปิดใน batch นี้ จึงแสดงผล read-only เพื่อให้ layout ตรงกับหมวด dual costing ก่อน
          </div>
        ) : null}
      </DualCostingPanel>

      <DualCostingPanel title="① เลือกสินค้าที่ต้องการ Match ต้นทุน">
        <Select
          className="w-full rounded-md"
          value={selectedProductId}
          onChange={(event) => {
            setSelectedProductId(event.target.value)
            resetSale()
          }}
        >
          <option value="">— เลือกสินค้า —</option>
          {(data?.filters.products ?? []).map((product) => <option key={product.id} value={product.id}>{product.code ? `${product.code} - ` : ''}{product.name}{product.metalGroup ? ` · ${product.metalGroup}` : ''}</option>)}
        </Select>
        {hasSelection ? (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <DualCostingStatCard label="Cost Pool ของสินค้านี้" value={`${data?.summary.poolCount ?? 0} รายการ`} />
            <DualCostingStatCard label="น้ำหนักพร้อมจัดสรร" tone="blue" value={`${formatMoney(data?.summary.poolQty ?? 0)} กก.`} />
            <DualCostingStatCard label="มูลค่าต้นทุนรวม" value={formatMoney(data?.summary.poolValue ?? 0)} />
            <DualCostingStatCard label="ต้นทุนเฉลี่ย/กก." tone="emerald" value={formatMoney(data?.summary.poolAvgCost ?? 0)} />
          </div>
        ) : null}
        {hasSelection && !isLoading && (data?.summary.poolCount ?? 0) === 0 ? <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-700">ยังไม่มีต้นทุนใน Cost Pool สำหรับสินค้านี้</div> : null}
      </DualCostingPanel>

      {hasSelection ? (
        <DualCostingPanel title={`② เลือก ${sourceTypeLabel} ที่ต้องการ Match ต้นทุน`}>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-slate-500">{sourceTypeLabel} *</label>
              <Select
                disabled={!sourceTypeReady}
                value={selectedPoSellId}
                onChange={(event) => {
                  setSelectedPoSellId(event.target.value)
                  setShowPreview(false)
                }}
              >
                <option value="">{sourceTypeReady ? '-- เลือก PO ขาย --' : '-- ยังไม่พร้อมใช้งาน --'}</option>
                {(data?.poSells ?? []).map((po) => <option key={po.id} value={po.id}>{po.docNo} | {po.customerName} | จองขาย {formatMoney(po.qty)} กก. · เหลือต้อง match {formatMoney(po.remainingQty)} กก. · ฿{formatMoney(po.unitPrice)}/กก.</option>)}
              </Select>
              {!isLoading && sourceTypeReady && (data?.poSells.length ?? 0) === 0 ? <div className="mt-1 text-xs text-amber-700">ไม่มี PO ขาย ของสินค้านี้ที่ยังไม่ match</div> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Allocation Mode</label>
              <Select value={allocationMode} onChange={(event) => setAllocationMode(event.target.value)}>
                <option value="FIFO">FIFO - ต้นทุนเก่าก่อน</option>
                <option value="LIFO">LIFO - ต้นทุนใหม่ก่อน</option>
                <option value="Cheap">Cheap First - ต้นทุนถูกก่อน</option>
                <option value="Expensive">Expensive First - ต้นทุนแพงก่อน</option>
                <option value="Manual">Manual - เลือกเอง</option>
              </Select>
            </div>
          </div>

          {hasPoSell ? (
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
              <DualCostingStatCard label="Customer" value={data?.selectedPoSell?.customerName ?? '-'} />
              <DualCostingStatCard label="สินค้า" value={selectedProduct?.name ?? data?.selectedPoSell?.productName ?? '-'} />
              <DualCostingStatCard label="จำนวนรวม" value={`${formatMoney(data?.selectedPoSell?.qty ?? 0)} กก.`} />
              <DualCostingStatCard label="ราคาขาย" tone="emerald" value={formatMoney(data?.selectedPoSell?.unitPrice ?? 0)} />
              <DualCostingStatCard label="ต้อง Match อีก" tone="amber" value={`${formatMoney(data?.selectedPoSell?.remainingQty ?? 0)} กก.`} />
            </div>
          ) : null}

          {hasPoSell ? (
            <div className="mt-3 flex justify-end">
              <Button type="button" onClick={() => setShowPreview(true)}>Preview Auto Match</Button>
            </div>
          ) : null}
        </DualCostingPanel>
      ) : null}

      {showPreview && hasCandidates ? (
        <DualCostingPanel title="③ Preview การ Match">
          <Table className="[&_tbody_tr]:border-slate-100">
            <TableHeader>
              <tr>
                <TableHead>Source</TableHead>
                <TableHead>เลขที่</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">ต้นทุน/หน่วย</TableHead>
                <TableHead className="text-right">qty ที่ใช้</TableHead>
                <TableHead className="text-right">มูลค่าใช้</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {(data?.candidates ?? []).map((row) => (
                <TableRow key={row.costPoolId} className="hover:bg-slate-50">
                  <TableCell><span className="rounded-md bg-blue-100 px-2 py-0.5 text-xs text-blue-700">{row.sourceType}</span></TableCell>
                  <TableCell className="font-mono text-xs">{row.sourceNo}</TableCell>
                  <TableCell>{row.counterparty}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.availableQty)}</TableCell>
                  <TableCell className="text-right">{formatMoney(row.unitCost)}</TableCell>
                  <TableCell className="text-right font-medium text-blue-700">{formatMoney(row.qtyToUse)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(row.totalCostUse)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <DualCostingStatCard label="รวมที่จะ Match" tone="blue" value={`${formatMoney(data?.summary.totalToMatch ?? 0)} กก.`} />
            <DualCostingStatCard label="รายได้คาดการณ์" tone="emerald" value={formatMoney(data?.summary.expectedRevenue ?? 0)} />
            <DualCostingStatCard label="ต้นทุนที่จะตัด" tone="red" value={formatMoney(data?.summary.totalCostMatch ?? 0)} />
            <DualCostingStatCard label="Expected Margin" tone={(data?.summary.expectedMargin ?? 0) >= 0 ? 'purple' : 'red'} value={formatMoney(data?.summary.expectedMargin ?? 0)} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowPreview(false)}>ปิด Preview</Button>
            <Button disabled type="button">ยืนยัน Match</Button>
          </div>
        </DualCostingPanel>
      ) : null}
    </DualCostingPageSection>
  )
}
