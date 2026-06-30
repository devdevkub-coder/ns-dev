'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import type { SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import {
  DualCostingErrorBox,
  DualCostingHint,
  DualCostingPageSection,
  DualCostingPanel,
  DualCostingStatCard,
  DualCostingWorkflowStrip,
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
  date?: string
  qtyToUse: number
  sourceNo: string
  sourceType: string
  totalCostUse: number
  unitCost: number
}

type PoolRow = {
  availableQty: number
  availableValue: number
  costPoolId: string
  counterparty: string
  date: string
  sourceNo: string
  sourceType: string
  unitCost: number
}

type Payload = {
  candidates: CandidateRow[]
  filters: {
    modes: string[]
    products: ProductOption[]
    sourceTypes: string[]
  }
  pool: PoolRow[]
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
  const searchParams = useSearchParams()
  const router = useRouter()
  const [allocationMode, setAllocationMode] = useState('FIFO')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPoSellId, setSelectedPoSellId] = useState(searchParams.get('poSellId') ?? '')
  const [selectedProductId, setSelectedProductId] = useState(searchParams.get('productId') ?? '')
  const [showPreview, setShowPreview] = useState(false)
  const [sourceType, setSourceType] = useState(searchParams.get('sourceType') ?? 'spot-sell')
  const [targetCost, setTargetCost] = useState(0)
  const [targetCostInput, setTargetCostInput] = useState('0')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setPage(1)
  }, [selectedProductId, sourceType])

  useEffect(() => {
    const poSellIdParam = searchParams.get('poSellId')
    const productIdParam = searchParams.get('productId')
    const sourceTypeParam = searchParams.get('sourceType')

    if (poSellIdParam !== null) setSelectedPoSellId(poSellIdParam)
    if (productIdParam !== null) setSelectedProductId(productIdParam)
    if (sourceTypeParam !== null) setSourceType(sourceTypeParam)
  }, [searchParams])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('mode', allocationMode)
    params.set('sourceType', sourceType)
    if (selectedProductId) params.set('productId', selectedProductId)
    if (selectedPoSellId) params.set('poSellId', selectedPoSellId)
    if (allocationMode === 'Manual') params.set('targetCost', String(targetCost))
    return params.toString()
  }, [allocationMode, selectedPoSellId, selectedProductId, sourceType, targetCost])

  useEffect(() => {
    let mounted = true
    async function loadData() {
      setError(null)
      setIsLoading(true)
      try {
        const payload = await dailyFetchJson<Payload>(`/api/dual-costing/cost-allocator?${queryString}`)
        if (mounted) setData(payload)
      } catch (caught) {
        if (mounted) setError(caught instanceof Error ? caught.message : 'โหลด Cost Allocator ไม่ได้')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void loadData()
    return () => { mounted = false }
  }, [queryString, reloadTrigger])

  const poSells = useMemo(() => data?.poSells ?? [], [data?.poSells])
  const totalRows = poSells.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedPoSells = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return poSells.slice(start, start + pageSize)
  }, [poSells, currentPage, pageSize])

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filters.products ?? []).map((product) => ({
      id: product.id,
      label: product.code ? `${product.code} - ${product.name}` : product.name,
      searchText: `${product.code ?? ''} ${product.name} ${product.metalGroup ?? ''}`.toLowerCase(),
    }))
  }, [data?.filters.products])

  const selectedProduct = data?.filters.products.find((product) => product.id === selectedProductId)
  const hasSelection = Boolean(selectedProductId)
  const hasPoSell = Boolean(data?.selectedPoSell)
  const hasCandidates = (data?.candidates.length ?? 0) > 0
  const sourceTypeButtons = data?.filters.sourceTypes ?? ['po-sell', 'spot-sell']
  const sourceTypeLabel = sourceType === 'po-sell' ? 'PO Sell' : sourceType === 'production' ? 'Production' : 'Spot Sell / บิลขายไม่มี PO'
  const allocationModes = data?.filters.modes?.length ? data.filters.modes : ['FIFO', 'LIFO', 'Cheap', 'Expensive']

  function resetSale() {
    setSelectedPoSellId('')
    setShowPreview(false)
  }

  const handleConfirmMatch = async () => {
    if (!selectedProductId || !selectedPoSellId || !data?.candidates.length) return
    setIsSubmitting(true)
    setError(null)
    try {
      const response = await dailyFetchJson<{ success: boolean; message: string }>(
        '/api/dual-costing/cost-allocator',
        {
          method: 'POST',
          body: JSON.stringify({
            productId: selectedProductId,
            poSellId: selectedPoSellId,
            sourceType,
            candidates: data.candidates,
            notes: `Matched via Cost Allocator (${allocationMode})`
          })
        }
      )
      if (response.success) {
        alert(response.message || 'จัดสรรต้นทุนสำเร็จ')
        setSelectedPoSellId('')
        setShowPreview(false)
        setReloadTrigger((prev) => prev + 1)
        router.push('/dual-costing/waiting-allocations')
      } else {
        setError(response.message || 'เกิดข้อผิดพลาดในการบันทึก')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยืนยันการจัดสรรต้นทุนไม่สำเร็จ')
    } finally {
      setIsSubmitting(false)
    }
  }

  const minUnitCost = data?.pool && data.pool.length > 0 ? Math.min(...data.pool.map((row) => row.unitCost)) : 0
  const maxUnitCost = data?.pool && data.pool.length > 0 ? Math.max(...data.pool.map((row) => row.unitCost)) : 0

  const handleCalculateManualMatch = () => {
    const parsed = Number(targetCostInput)
    if (Number.isFinite(parsed) && parsed >= 0) {
      setTargetCost(parsed)
      setShowPreview(true)
    } else {
      setError('กรุณากรอกราคาต้นทุนเป้าหมายที่ถูกต้อง')
    }
  }

  return (
    <DualCostingPageSection>
      <DualCostingHint tone="purple">
        <strong>Cost Allocator</strong> ใช้เลือกบิลขายไม่มี PO หรือ PO Sell จากนั้น preview การหยิบต้นทุนจริงจาก Cost Pool ตามลำดับที่กำหนด โดย batch นี้ยังเป็น read-only และยังไม่เขียน match log จริง
      </DualCostingHint>

      <DualCostingErrorBox error={error} />
      <DualCostingWorkflowStrip active="allocator" />

      <DualCostingPanel title="⓪ เลือกประเภทปลายทางที่จะ Match ต้นทุน">
        <div className="flex flex-wrap gap-2">
          {sourceTypeButtons.map((item) => {
            const active = sourceType === item
            return (
              <button
                key={item}
                className={
                  active
                    ? 'rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300'
                    : 'rounded-lg border border-slate-100 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-100'
                }
                type="button"
                onClick={() => {
                  setSourceType(item)
                  setSelectedProductId('')
                  resetSale()
                }}
              >
                {item === 'po-sell' ? 'PO Sell' : item === 'production' ? 'Production' : 'Spot Sell / ไม่มี PO'}
              </button>
            )
          })}
        </div>
        <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/50 p-3 text-xs leading-relaxed text-amber-800">
          Scope ล่าสุดใช้ Spot Sell / Sales Bill ไม่มี PO เป็น target หลักสำหรับทองแดงและทองเหลือง ส่วนการยืนยัน Match ยังปิดไว้จนกว่าจะมี durable allocation ledger
        </div>
      </DualCostingPanel>

      <DualCostingPanel title="① เลือกสินค้าที่ต้องการ Match ต้นทุน">
        <div className="w-full">
          <SearchCombobox
            inputId="cost-allocator-product"
            label="สินค้า"
            hideLabel={true}
            options={productSearchOptions}
            placeholder="พิมพ์รหัส/ชื่อสินค้าเพื่อค้นหา..."
            value={selectedProductId}
            onChange={(value) => {
              setSelectedProductId(value)
              resetSale()
            }}
          />
        </div>
        {hasSelection ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mt-3">
            <DualCostingStatCard icon="📦" label="Cost Pool ของสินค้านี้" tone="slate" value={`${data?.summary.poolCount ?? 0} รายการ`} />
            <DualCostingStatCard icon="⚖️" label="น้ำหนักพร้อมจัดสรร" tone="blue" value={`${formatMoney(data?.summary.poolQty ?? 0)} กก.`} />
            <DualCostingStatCard icon="💰" label="มูลค่าต้นทุนรวม" tone="slate" value={formatMoney(data?.summary.poolValue ?? 0)} />
            <DualCostingStatCard icon="📈" label="ต้นทุนเฉลี่ย/กก." tone="emerald" value={formatMoney(data?.summary.poolAvgCost ?? 0)} />
          </div>
        ) : null}
        {hasSelection && !isLoading && (data?.summary.poolCount ?? 0) === 0 ? <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/50 p-3.5 text-xs text-amber-700 leading-relaxed">ยังไม่มีต้นทุนใน Cost Pool สำหรับสินค้านี้</div> : null}
      </DualCostingPanel>

      {hasSelection ? (
        <DualCostingPanel title={`② เลือก ${sourceTypeLabel} ที่ต้องการ Match ต้นทุน`}>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">{sourceTypeLabel} *</label>
              <Select
                className="focus-visible:ring-emerald-100 border-slate-300"
                value={selectedPoSellId}
                onChange={(event) => {
                  setSelectedPoSellId(event.target.value)
                  setShowPreview(false)
                }}
              >
                <option value="">{sourceType === 'po-sell' ? '-- เลือก PO ขาย --' : sourceType === 'production' ? '-- เลือกใบสั่งผลิต --' : '-- เลือกบิลขายไม่มี PO --'}</option>
                {(data?.poSells ?? []).map((po) => <option key={po.id} value={po.id}>{po.docNo} | {po.customerName === '-' ? 'ภายในโรงงาน' : po.customerName} | {sourceType === 'production' ? 'ผลิต' : 'ขาย'} {formatMoney(po.qty)} กก. · เหลือต้อง match {formatMoney(po.remainingQty)} กก. · ฿{formatMoney(po.unitPrice)}/กก.</option>)}
              </Select>
              {!isLoading && (data?.poSells.length ?? 0) === 0 ? <div className="mt-1.5 text-xs text-amber-700 font-medium">ไม่มี {sourceTypeLabel} ของสินค้านี้ที่ยังไม่ match</div> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">Allocation Mode</label>
              <Select className="focus-visible:ring-emerald-100 border-slate-300" value={allocationMode} onChange={(event) => setAllocationMode(event.target.value)}>
                {allocationModes.map((mode) => <option key={mode} value={mode}>{allocationModeLabel(mode)}</option>)}
              </Select>
            </div>
          </div>

          {allocationMode === 'Manual' && (
            <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/20 p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                <span>⚙️</span>
                <span>Manual Mode – ตั้งราคาต้นทุนเป้าหมาย</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                ระบบจะเลือก lot ผลผลิต (หรือผัน inventory เก่า) และ/หรือ lot ซื้อล่าสุด ให้ weighted average ได้ ราคาเป้าหมายที่ตั้ง (หลีกเลี่ยงลอทเกินจำเป็น)
              </p>
              <div className="flex flex-wrap items-end gap-2.5">
                <div className="flex-1 min-w-[200px]">
                  <label className="mb-1 block text-xs font-semibold text-slate-500">ราคาต้นทุนเป้าหมาย (บาท/กก.) *</label>
                  <Input
                    className="h-10 rounded-md border-slate-300 focus-visible:ring-emerald-100 text-sm font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    type="number"
                    placeholder="0.00"
                    value={targetCostInput}
                    onChange={(event) => setTargetCostInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleCalculateManualMatch()
                    }}
                  />
                </div>
                <Button
                  className="rounded-lg h-10 px-4 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors focus-visible:outline-none font-sans"
                  type="button"
                  onClick={handleCalculateManualMatch}
                >
                  ⚡ คำนวณ Match อัตโนมัติ
                </Button>
              </div>
              <div className="text-xs font-medium text-amber-800/80">
                💡 Pool WAC ปัจจุบัน = {formatMoney(data?.summary.poolAvgCost ?? 0)} บาท/กก. · ช่วง {formatMoney(minUnitCost)} - {formatMoney(maxUnitCost)}
              </div>
            </div>
          )}

          {/* Pagination Controls */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-3">
            <div>
              พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="จำนวนรายการต่อหน้า"
                className="h-8 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {[5, 10, 25, 50].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
              </select>
              <button
                className="h-8 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                disabled={currentPage <= 1}
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                ก่อนหน้า
              </button>
              <span className="px-1">หน้า {currentPage} / {totalPages}</span>
              <button
                className="h-8 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                disabled={currentPage >= totalPages}
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                ถัดไป
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <Table className="text-xs">
              <TableHeader className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                <tr>
                  <TableHead className="p-3 pl-4">{sourceType === 'production' ? 'ใบสั่งผลิต' : 'เอกสารขาย'}</TableHead>
                  <TableHead className="p-3">วันที่</TableHead>
                  <TableHead className="p-3">{sourceType === 'production' ? 'ผู้ผลิต' : 'Customer'}</TableHead>
                  <TableHead className="p-3">สินค้า</TableHead>
                  <TableHead className="p-3 text-right">{sourceType === 'production' ? 'ผลิต (กก.)' : 'ขาย (กก.)'}</TableHead>
                  <TableHead className="p-3 text-right">Matched</TableHead>
                  <TableHead className="p-3 text-right">ค้าง Match</TableHead>
                  <TableHead className="p-3 text-right">{sourceType === 'production' ? 'ต้นทุน/กก.' : 'ราคา/หน่วย'}</TableHead>
                  <TableHead className="p-3 pr-4 text-center">เลือก</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell className="py-6 text-center text-slate-500" colSpan={9}>กำลังโหลด target candidates</TableCell></TableRow> : null}
                {!isLoading && (data?.poSells.length ?? 0) === 0 ? <TableRow><TableCell className="py-6 text-center text-slate-400" colSpan={9}>ไม่มี {sourceTypeLabel} ของสินค้านี้ที่ยังไม่ match</TableCell></TableRow> : null}
                {pagedPoSells.map((target) => {
                  const active = selectedPoSellId === target.id
                  return (
                    <TableRow key={target.id} className={active ? 'bg-purple-50/50 border-t border-slate-100 hover:bg-purple-50/60 transition-colors' : 'border-t border-slate-100 hover:bg-slate-50/30 transition-colors'}>
                      <TableCell className="p-3 pl-4 font-mono text-xs text-slate-700">{target.docNo}</TableCell>
                      <TableCell className="p-3 whitespace-nowrap text-xs text-slate-600">{target.date}</TableCell>
                      <TableCell className="p-3 text-slate-800 font-medium">{target.customerName === '-' ? 'ภายในโรงงาน' : target.customerName}</TableCell>
                      <TableCell className="p-3 text-xs text-slate-700">{target.productName}</TableCell>
                      <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(target.qty)}</TableCell>
                      <TableCell className="p-3 text-right font-mono text-emerald-700 font-semibold">{formatMoney(target.matchedQty)}</TableCell>
                      <TableCell className="p-3 text-right font-mono font-bold text-amber-700">{formatMoney(target.remainingQty)}</TableCell>
                      <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(target.unitPrice)}</TableCell>
                      <TableCell className="p-3 pr-4 text-center">
                        <Button
                          size="xs"
                          type="button"
                          className="focus-visible:ring-2 focus-visible:ring-emerald-100"
                          variant={active ? 'default' : 'secondary'}
                          onClick={() => {
                            setSelectedPoSellId(target.id)
                            setShowPreview(false)
                          }}
                        >
                          {active ? 'เลือกแล้ว' : 'เลือก'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>



          {hasPoSell ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5 mt-3">
              <DualCostingStatCard icon="👥" label={sourceType === 'production' ? 'ผู้ผลิต' : 'Customer'} tone="slate" value={data?.selectedPoSell?.customerName === '-' ? 'ภายในโรงงาน' : (data?.selectedPoSell?.customerName ?? '-')} />
              <DualCostingStatCard icon="📦" label="สินค้า" tone="slate" value={selectedProduct?.name ?? data?.selectedPoSell?.productName ?? '-'} />
              <DualCostingStatCard icon="⚖️" label="จำนวนรวม" tone="slate" value={`${formatMoney(data?.selectedPoSell?.qty ?? 0)} กก.`} />
              <DualCostingStatCard icon="💰" label={sourceType === 'production' ? 'ต้นทุน/กก.' : 'ราคาขาย'} tone="emerald" value={formatMoney(data?.selectedPoSell?.unitPrice ?? 0)} />
              <DualCostingStatCard icon="⏳" label="ต้อง Match อีก" tone="amber" value={`${formatMoney(data?.selectedPoSell?.remainingQty ?? 0)} กก.`} />
            </div>
          ) : null}

          {hasPoSell ? (
            <div className="mt-3 flex justify-end">
              <Button type="button" className="rounded-lg h-10 px-4 text-sm font-semibold focus-visible:ring-emerald-100" onClick={() => setShowPreview(true)}>Preview Auto Match</Button>
            </div>
          ) : null}
        </DualCostingPanel>
      ) : null}

      {hasSelection ? (
        <DualCostingPanel title="③ Cost Pool Lots ของสินค้าที่เลือก">
          <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <Table className="[&_tbody_tr]:border-slate-100 text-xs">
              <TableHeader className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                <tr>
                  <TableHead className="p-3 pl-4">Source</TableHead>
                  <TableHead className="p-3">เลขที่</TableHead>
                  <TableHead className="p-3">วันที่</TableHead>
                  <TableHead className="p-3">Counterparty</TableHead>
                  <TableHead className="p-3 text-right bg-emerald-50/50">Available</TableHead>
                  <TableHead className="p-3 text-right">฿/หน่วย</TableHead>
                  <TableHead className="p-3 pr-4 text-right bg-emerald-50/50">Available Value</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell className="py-6 text-center text-slate-500" colSpan={7}>กำลังโหลด Cost Pool</TableCell></TableRow> : null}
                {!isLoading && (data?.pool.length ?? 0) === 0 ? <TableRow><TableCell className="py-6 text-center text-amber-700" colSpan={7}>ยังไม่มี Cost Pool lot สำหรับสินค้านี้</TableCell></TableRow> : null}
                {(data?.pool ?? []).slice(0, 12).map((row) => (
                  <TableRow key={row.costPoolId} className="hover:bg-slate-50/30 transition-colors border-t border-slate-100">
                    <TableCell className="p-3 pl-4"><span className={`rounded border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>{row.sourceType}</span></TableCell>
                    <TableCell className="p-3 font-mono text-xs text-slate-700">{row.sourceNo}</TableCell>
                    <TableCell className="p-3 whitespace-nowrap text-xs text-slate-600">{row.date}</TableCell>
                    <TableCell className="p-3 text-xs text-slate-800 font-medium">{row.counterparty}</TableCell>
                    <TableCell className="p-3 bg-emerald-50/20 text-right font-mono font-bold text-emerald-700">{formatMoney(row.availableQty)}</TableCell>
                    <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(row.unitCost)}</TableCell>
                    <TableCell className="p-3 pr-4 bg-emerald-50/20 text-right font-mono font-semibold text-emerald-700">{formatMoney(row.availableValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {(data?.pool.length ?? 0) > 12 ? <div className="mt-2 text-xs text-slate-500">แสดง 12 lot แรกตาม sort ปัจจุบันจากทั้งหมด {data?.pool.length ?? 0} lot</div> : null}
        </DualCostingPanel>
      ) : null}

      {showPreview && hasCandidates ? (
        <DualCostingPanel title="④ Preview การ Match">
          <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
            <Table className="[&_tbody_tr]:border-slate-100 text-xs">
              <TableHeader className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
                <tr>
                  <TableHead className="p-3 pl-4">Source</TableHead>
                  <TableHead className="p-3">เลขที่</TableHead>
                  <TableHead className="p-3">Counterparty</TableHead>
                  <TableHead className="p-3 text-right">Available</TableHead>
                  <TableHead className="p-3 text-right">ต้นทุน/หน่วย</TableHead>
                  <TableHead className="p-3 text-right bg-blue-50/50">qty ที่ใช้</TableHead>
                  <TableHead className="p-3 pr-4 text-right bg-emerald-50/50">มูลค่าใช้</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {(data?.candidates ?? []).map((row) => (
                  <TableRow key={row.costPoolId} className="hover:bg-slate-50/30 transition-colors border-t border-slate-100">
                    <TableCell className="p-3 pl-4"><span className={`rounded border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>{row.sourceType}</span></TableCell>
                    <TableCell className="p-3 font-mono text-xs text-slate-700">{row.sourceNo}</TableCell>
                    <TableCell className="p-3 text-slate-800 font-medium">{row.counterparty}</TableCell>
                    <TableCell className="p-3 text-right font-mono text-slate-600">{formatMoney(row.availableQty)}</TableCell>
                    <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(row.unitCost)}</TableCell>
                    <TableCell className="p-3 bg-blue-50/20 text-right font-mono font-bold text-blue-700">{formatMoney(row.qtyToUse)}</TableCell>
                    <TableCell className="p-3 pr-4 bg-emerald-50/20 text-right font-mono font-semibold text-emerald-700">{formatMoney(row.totalCostUse)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mt-4">
            <DualCostingStatCard icon="🔗" label="รวมที่จะ Match" tone="blue" value={`${formatMoney(data?.summary.totalToMatch ?? 0)} กก.`} />
            <DualCostingStatCard icon="💰" label="รายได้คาดการณ์" tone="emerald" value={formatMoney(data?.summary.expectedRevenue ?? 0)} />
            <DualCostingStatCard icon="💳" label="ต้นทุนที่จะตัด" tone="red" value={formatMoney(data?.summary.totalCostMatch ?? 0)} />
            <DualCostingStatCard icon="📈" label="Expected Margin" tone={(data?.summary.expectedMargin ?? 0) >= 0 ? 'purple' : 'red'} value={formatMoney(data?.summary.expectedMargin ?? 0)} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button className="rounded-lg h-10 px-4 text-sm font-semibold focus-visible:ring-slate-100" type="button" variant="secondary" onClick={() => setShowPreview(false)} disabled={isSubmitting}>ปิด Preview</Button>
            <Button
              className="rounded-lg h-10 px-4 text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors focus-visible:outline-none"
              type="button"
              onClick={handleConfirmMatch}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'กำลังบันทึก...' : 'ยืนยัน Match'}
            </Button>
          </div>
        </DualCostingPanel>
      ) : null}
    </DualCostingPageSection>
  )
}

function allocationModeLabel(mode: string) {
  if (mode === 'LIFO') return 'LIFO - ต้นทุนใหม่ก่อน'
  if (mode === 'Cheap') return 'Cheap First - ต้นทุนถูกก่อน'
  if (mode === 'Expensive') return 'Expensive First - ต้นทุนแพงก่อน'
  if (mode === 'Manual') return 'Manual - เลือกเอง'
  return 'FIFO - ต้นทุนเก่าก่อน'
}

function sourceBadgeClass(type: string) {
  if (type === 'Production') return 'bg-orange-50 text-orange-700 border border-orange-200/50'
  if (type === 'Regrade' || type === 'Grade Adjustment') return 'bg-purple-50 text-purple-700 border border-purple-200/50'
  if (type === 'PO_Buy') return 'bg-cyan-50 text-cyan-700 border border-cyan-200/50'
  return 'bg-blue-50 text-blue-700 border border-blue-200/50'
}
