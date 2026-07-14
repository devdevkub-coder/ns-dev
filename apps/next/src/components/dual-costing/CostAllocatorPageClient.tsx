'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import type { SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import {
  DualCostingErrorBox,
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

type TargetColumnKey = 'action' | 'customerName' | 'date' | 'docNo' | 'matchedQty' | 'productName' | 'qty' | 'remainingQty' | 'unitPrice'
type PoolColumnKey = 'availableQty' | 'availableValue' | 'counterparty' | 'date' | 'sourceNo' | 'sourceType' | 'unitCost'
type PreviewColumnKey = 'availableQty' | 'counterparty' | 'qtyToUse' | 'sourceNo' | 'sourceType' | 'totalCostUse' | 'unitCost'
type SortDirection = 'asc' | 'desc'

const targetColumns: Array<ResizableColumnDefinition<TargetColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 125 },
  { key: 'date', defaultWidth: 115, minWidth: 100 },
  { key: 'customerName', defaultWidth: 220, minWidth: 160 },
  { key: 'productName', defaultWidth: 210, minWidth: 150 },
  { key: 'qty', defaultWidth: 130, minWidth: 105 },
  { key: 'matchedQty', defaultWidth: 130, minWidth: 105 },
  { key: 'remainingQty', defaultWidth: 135, minWidth: 110 },
  { key: 'unitPrice', defaultWidth: 130, minWidth: 105 },
  { key: 'action', defaultWidth: 115, minWidth: 100 },
]

const poolColumns: Array<ResizableColumnDefinition<PoolColumnKey>> = [
  { key: 'sourceType', defaultWidth: 120, minWidth: 105 },
  { key: 'sourceNo', defaultWidth: 150, minWidth: 125 },
  { key: 'date', defaultWidth: 115, minWidth: 100 },
  { key: 'counterparty', defaultWidth: 230, minWidth: 160 },
  { key: 'availableQty', defaultWidth: 140, minWidth: 115 },
  { key: 'unitCost', defaultWidth: 130, minWidth: 105 },
  { key: 'availableValue', defaultWidth: 155, minWidth: 130 },
]

const previewColumns: Array<ResizableColumnDefinition<PreviewColumnKey>> = [
  { key: 'sourceType', defaultWidth: 120, minWidth: 105 },
  { key: 'sourceNo', defaultWidth: 150, minWidth: 125 },
  { key: 'counterparty', defaultWidth: 230, minWidth: 160 },
  { key: 'availableQty', defaultWidth: 140, minWidth: 115 },
  { key: 'unitCost', defaultWidth: 140, minWidth: 115 },
  { key: 'qtyToUse', defaultWidth: 135, minWidth: 110 },
  { key: 'totalCostUse', defaultWidth: 155, minWidth: 130 },
]

export function CostAllocatorPageClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [allocationMode, setAllocationMode] = useState('FIFO')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPoSellId, setSelectedPoSellId] = useState(searchParams.get('poSellId') ?? '')
  const [selectedProductId, setSelectedProductId] = useState(searchParams.get('productId') ?? '')
  const [selectedProductOption, setSelectedProductOption] = useState<SearchComboboxOption | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [sourceType, setSourceType] = useState(searchParams.get('sourceType') ?? 'spot-sell')
  const [targetCost, setTargetCost] = useState(0)
  const [targetCostInput, setTargetCostInput] = useState('0')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [collapsedSections, setCollapsedSections] = useState<Record<'step0' | 'step1' | 'step2' | 'step3' | 'step4', boolean>>({
    step0: false,
    step1: false,
    step2: false,
    step3: false,
    step4: false,
  })
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [targetSortKey, setTargetSortKey] = useState<TargetColumnKey | null>(null)
  const [targetSortDirection, setTargetSortDirection] = useState<SortDirection>('asc')
  const [poolSortKey, setPoolSortKey] = useState<PoolColumnKey | null>(null)
  const [poolSortDirection, setPoolSortDirection] = useState<SortDirection>('asc')
  const [previewSortKey, setPreviewSortKey] = useState<PreviewColumnKey | null>(null)
  const [previewSortDirection, setPreviewSortDirection] = useState<SortDirection>('asc')
  const targetColumnResize = useResizableColumns('dual-costing.cost-allocator.targets.v1', targetColumns)
  const poolColumnResize = useResizableColumns('dual-costing.cost-allocator.pool.v1', poolColumns)
  const previewColumnResize = useResizableColumns('dual-costing.cost-allocator.preview.v1', previewColumns)

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
        if (mounted) setError(caught instanceof Error ? caught.message : 'โหลดหน้าจัดสรรต้นทุนไม่ได้')
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    void loadData()
    return () => { mounted = false }
  }, [queryString, reloadTrigger])

  const poSells = useMemo(() => data?.poSells ?? [], [data?.poSells])
  const sortedPoSells = useMemo(() => sortRows(poSells, targetSortKey, targetSortDirection, getTargetSortValue), [poSells, targetSortDirection, targetSortKey])
  const poolRows = useMemo(() => data?.pool ?? [], [data?.pool])
  const sortedPoolRows = useMemo(() => sortRows(poolRows, poolSortKey, poolSortDirection, getPoolSortValue), [poolRows, poolSortDirection, poolSortKey])
  const previewRows = useMemo(() => data?.candidates ?? [], [data?.candidates])
  const sortedPreviewRows = useMemo(() => sortRows(previewRows, previewSortKey, previewSortDirection, getPreviewSortValue), [previewRows, previewSortDirection, previewSortKey])
  const totalRows = sortedPoSells.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedPoSells = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedPoSells.slice(start, start + pageSize)
  }, [sortedPoSells, currentPage, pageSize])

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    const options = (data?.filters.products ?? []).map((product) => ({
      id: product.id,
      label: product.code ? `${product.code} - ${product.name}` : product.name,
      searchText: `${product.code ?? ''} ${product.name} ${product.metalGroup ?? ''}`.toLowerCase(),
    }))

    if (selectedProductOption && !options.some((option) => option.id === selectedProductOption.id)) {
      return [selectedProductOption, ...options]
    }

    return options
  }, [data?.filters.products, selectedProductOption])

  const selectedProduct = data?.filters.products.find((product) => product.id === selectedProductId)
  const hasSelection = Boolean(selectedProductId)
  const hasPoSell = Boolean(data?.selectedPoSell)
  const hasCandidates = (data?.candidates.length ?? 0) > 0
  const isManualMode = allocationMode === 'Manual'
  const shouldShowPreview = isManualMode ? showPreview : hasPoSell
  const sourceTypeButtons = data?.filters.sourceTypes ?? ['po-sell', 'spot-sell']
  const sourceTypeLabel = sourceType === 'po-sell' ? 'PO Sell' : sourceType === 'production' ? 'การผลิต' : 'Spot Sell / บิลขายไม่มี PO'
  const allocationModes = data?.filters.modes?.length ? data.filters.modes : ['FIFO', 'LIFO', 'Cheap', 'Expensive']

  useEffect(() => {
    if (!selectedProductId) {
      setSelectedProductOption(null)
      return
    }

    const matchedOption = productSearchOptions.find((option) => option.id === selectedProductId)
    if (matchedOption && selectedProductOption?.id !== matchedOption.id) {
      setSelectedProductOption(matchedOption)
    }
  }, [productSearchOptions, selectedProductId, selectedProductOption?.id])

  useEffect(() => {
    setCollapsedSections((current) => ({
      ...current,
      step2: hasSelection ? current.step2 : false,
      step3: hasSelection ? current.step3 : false,
      step4: shouldShowPreview && hasCandidates ? current.step4 : false,
    }))
  }, [hasCandidates, hasSelection, shouldShowPreview])

  function resetSale() {
    setSelectedPoSellId('')
    setShowPreview(false)
  }

  function handleTargetSort(key: TargetColumnKey) {
    setPage(1)
    if (targetSortKey === key) {
      setTargetSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setTargetSortKey(key)
    setTargetSortDirection('asc')
  }

  function handlePoolSort(key: PoolColumnKey) {
    if (poolSortKey === key) {
      setPoolSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setPoolSortKey(key)
    setPoolSortDirection('asc')
  }

  function handlePreviewSort(key: PreviewColumnKey) {
    if (previewSortKey === key) {
      setPreviewSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setPreviewSortKey(key)
    setPreviewSortDirection('asc')
  }

  function toggleSection(section: keyof typeof collapsedSections) {
    setCollapsedSections((current) => ({ ...current, [section]: !current[section] }))
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
      <DualCostingErrorBox error={error} />

      <DualCostingPanel title="⓪ เลือกประเภทปลายทางที่จะจับคู่ต้นทุน" titleAction={<PanelToggleButton collapsed={collapsedSections.step0} onClick={() => toggleSection('step0')} />}>
        {!collapsedSections.step0 ? (
        <div className="flex flex-wrap gap-2">
          {sourceTypeButtons.map((item) => {
            const active = sourceType === item
            return (
              <button
                key={item}
                className={
                  active
                    ? 'rounded-md bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300'
                    : 'rounded-xl border border-slate-100 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-100'
                }
                type="button"
                onClick={() => {
                  setSourceType(item)
                  setSelectedProductId('')
                  resetSale()
                }}
              >
                {item === 'po-sell' ? 'PO Sell' : item === 'production' ? 'การผลิต' : 'Spot Sell / ไม่มี PO'}
              </button>
            )
          })}
        </div>
        ) : null}
      </DualCostingPanel>

      <DualCostingPanel title="① เลือกสินค้าที่ต้องการจับคู่ต้นทุน" titleAction={<PanelToggleButton collapsed={collapsedSections.step1} onClick={() => toggleSection('step1')} />}>
        {!collapsedSections.step1 ? (
        <>
        <div className="w-full">
          <SearchCombobox
            inputId="cost-allocator-product"
            label="สินค้า"
            hideLabel={true}
            options={productSearchOptions}
            placeholder="พิมพ์รหัส/ชื่อสินค้าเพื่อค้นหา..."
            value={selectedProductId}
            onChange={(value) => {
              const nextOption = productSearchOptions.find((option) => option.id === value) ?? null
              setSelectedProductOption(nextOption)
              setSelectedProductId(value)
              resetSale()
            }}
          />
        </div>
        {hasSelection ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mt-3">
            <DualCostingStatCard icon="📦" label="กลุ่มต้นทุนของสินค้านี้" tone="slate" value={`${data?.summary.poolCount ?? 0} รายการ`} />
            <DualCostingStatCard icon="⚖️" label="น้ำหนักพร้อมจัดสรร" tone="blue" value={`${formatMoney(data?.summary.poolQty ?? 0)} กก.`} />
            <DualCostingStatCard icon="💰" label="มูลค่าต้นทุนรวม" tone="slate" value={formatMoney(data?.summary.poolValue ?? 0)} />
            <DualCostingStatCard icon="📈" label="ต้นทุนเฉลี่ย/กก." tone="emerald" value={formatMoney(data?.summary.poolAvgCost ?? 0)} />
          </div>
        ) : null}
        {hasSelection && !isLoading && (data?.summary.poolCount ?? 0) === 0 ? <div className="mt-3 rounded-xl border border-amber-200/70 bg-amber-50/50 p-3.5 text-xs text-amber-700 leading-relaxed">ยังไม่มีต้นทุนในกลุ่มต้นทุนสำหรับสินค้านี้</div> : null}
        </>
        ) : null}
      </DualCostingPanel>

      {hasSelection ? (
        <DualCostingPanel title={`② เลือก ${sourceTypeLabel} ที่ต้องการจับคู่ต้นทุน`} titleAction={<PanelToggleButton collapsed={collapsedSections.step2} onClick={() => toggleSection('step2')} />}>
          {!collapsedSections.step2 ? (
          <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-500">{sourceTypeLabel} *</label>
              <Select
                className="focus-visible:ring-emerald-100 border-slate-300"
                value={selectedPoSellId}
                onChange={(event) => {
                  setSelectedPoSellId(event.target.value)
                  setShowPreview(isManualMode ? false : Boolean(event.target.value))
                }}
              >
                <option value="">{sourceType === 'po-sell' ? '-- เลือก PO ขาย --' : sourceType === 'production' ? '-- เลือกใบสั่งผลิต --' : '-- เลือกบิลขายไม่มี PO --'}</option>
                {(data?.poSells ?? []).map((po) => <option key={po.id} value={po.id}>{po.docNo} | {po.customerName === '-' ? 'ภายในโรงงาน' : po.customerName} | {sourceType === 'production' ? 'ผลิต' : 'ขาย'} {formatMoney(po.qty)} กก. · เหลือต้องจับคู่ {formatMoney(po.remainingQty)} กก. · ฿{formatMoney(po.unitPrice)}/กก.</option>)}
              </Select>
              {!isLoading && (data?.poSells.length ?? 0) === 0 ? <div className="mt-1.5 text-xs text-amber-700 font-medium">ไม่มี {sourceTypeLabel} ของสินค้านี้ที่ยังไม่จับคู่</div> : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">วิธีจัดสรรต้นทุน</label>
              <Select
                className="focus-visible:ring-emerald-100 border-slate-300"
                value={allocationMode}
                onChange={(event) => {
                  const nextMode = event.target.value
                  setAllocationMode(nextMode)
                  setShowPreview(nextMode === 'Manual' ? false : Boolean(selectedPoSellId))
                }}
              >
                {allocationModes.map((mode) => <option key={mode} value={mode}>{allocationModeLabel(mode)}</option>)}
              </Select>
            </div>
          </div>

          {isManualMode && (
            <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/20 p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                <span>⚙️</span>
                <span>กำหนดเอง – ตั้งราคาต้นทุนเป้าหมาย</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-500">
                ระบบจะเลือก lot ผลผลิต (หรือผัน inventory เก่า) และ/หรือ lot ซื้อล่าสุด ให้ weighted average ได้ ราคาเป้าหมายที่ตั้ง (หลีกเลี่ยงลอทเกินจำเป็น)
              </p>
              <div className="flex flex-wrap items-end gap-2.5">
                <div className="flex-1 min-w-[200px]">
                  <label className="mb-1 block text-xs font-semibold text-slate-500">ราคาต้นทุนเป้าหมาย (บาท/กก.) *</label>
                  <Input
                    className="h-10 rounded-md border-slate-300 text-sm font-mono tabular-nums focus-visible:ring-emerald-100"
                    inputMode="decimal"
                    placeholder="0.00"
                    type="text"
                    value={targetCostInput}
                    onChange={(event) => {
                      const sanitized = event.target.value
                        .replace(/[^\d.]/g, '')
                        .replace(/(\..*)\./g, '$1')
                      setTargetCostInput(sanitized)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleCalculateManualMatch()
                    }}
                  />
                </div>
                <Button
                  className="rounded-md h-10 px-4 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors focus-visible:outline-none"
                  type="button"
                  onClick={handleCalculateManualMatch}
                >
                  ⚡ คำนวณการจับคู่อัตโนมัติ
                </Button>
              </div>
              <div className="text-xs font-medium text-amber-800/80">
                💡 Pool WAC ปัจจุบัน = {formatMoney(data?.summary.poolAvgCost ?? 0)} บาท/กก. · ช่วง {formatMoney(minUnitCost)} - {formatMoney(maxUnitCost)}
              </div>
            </div>
          )}

          {/* Target Table Card */}
          <div className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <div>
                พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {targetColumnResize.hasCustomWidths ? (
                  <Button className="h-9 text-sm font-normal" size="sm" type="button" variant="outline" onClick={targetColumnResize.resetColumnWidths}>
                    คืนค่าเดิมตาราง
                  </Button>
                ) : null}
                <select
                  aria-label="จำนวนรายการต่อหน้า"
                  className="h-9 w-auto rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  {[5, 10, 25, 50].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
                </select>
                <button
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  disabled={currentPage <= 1}
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  ก่อนหน้า
                </button>
                <span className="px-1">หน้า {currentPage} / {totalPages}</span>
                <button
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  disabled={currentPage >= totalPages}
                  type="button"
                  onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                >
                  ถัดไป
                </button>
              </div>
            </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ tableLayout: 'fixed', minWidth: targetColumnResize.tableMinWidth }}>
              <colgroup>
                {targetColumns.map((column) => (
                  <col key={column.key} style={targetColumnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  <ResizableTableHead label={sourceType === 'production' ? 'เลขที่ใบสั่งผลิต' : 'เลขที่เอกสารขาย'} activeSortKey={targetSortKey ?? undefined} direction={targetSortDirection} sortKey="docNo" onSort={handleTargetSort} resizeProps={targetColumnResize.getResizeHandleProps('docNo', sourceType === 'production' ? 'เลขที่ใบสั่งผลิต' : 'เลขที่เอกสารขาย')} />
                  <ResizableTableHead label="วันที่เอกสาร" activeSortKey={targetSortKey ?? undefined} direction={targetSortDirection} sortKey="date" onSort={handleTargetSort} resizeProps={targetColumnResize.getResizeHandleProps('date', 'วันที่เอกสาร')} />
                  <ResizableTableHead label={sourceType === 'production' ? 'ผู้ผลิต' : 'ลูกค้า'} activeSortKey={targetSortKey ?? undefined} direction={targetSortDirection} sortKey="customerName" onSort={handleTargetSort} resizeProps={targetColumnResize.getResizeHandleProps('customerName', sourceType === 'production' ? 'ผู้ผลิต' : 'ลูกค้า')} />
                  <ResizableTableHead label="สินค้า" activeSortKey={targetSortKey ?? undefined} direction={targetSortDirection} sortKey="productName" onSort={handleTargetSort} resizeProps={targetColumnResize.getResizeHandleProps('productName', 'สินค้า')} />
                  <ResizableTableHead align="right" label={sourceType === 'production' ? 'จำนวนผลิต (กก.)' : 'จำนวนขาย (กก.)'} activeSortKey={targetSortKey ?? undefined} direction={targetSortDirection} sortKey="qty" onSort={handleTargetSort} resizeProps={targetColumnResize.getResizeHandleProps('qty', sourceType === 'production' ? 'จำนวนผลิต' : 'จำนวนขาย')} />
                  <ResizableTableHead align="right" label="จับคู่แล้ว" activeSortKey={targetSortKey ?? undefined} direction={targetSortDirection} sortKey="matchedQty" onSort={handleTargetSort} resizeProps={targetColumnResize.getResizeHandleProps('matchedQty', 'จับคู่แล้ว')} />
                  <ResizableTableHead align="right" label="ค้างจับคู่" activeSortKey={targetSortKey ?? undefined} direction={targetSortDirection} sortKey="remainingQty" onSort={handleTargetSort} resizeProps={targetColumnResize.getResizeHandleProps('remainingQty', 'ค้างจับคู่')} />
                  <ResizableTableHead align="right" label={sourceType === 'production' ? 'ต้นทุน/กก.' : 'ราคาขาย/หน่วย'} activeSortKey={targetSortKey ?? undefined} direction={targetSortDirection} sortKey="unitPrice" onSort={handleTargetSort} resizeProps={targetColumnResize.getResizeHandleProps('unitPrice', sourceType === 'production' ? 'ต้นทุนต่อกิโลกรัม' : 'ราคาขายต่อหน่วย')} />
                  <ResizableTableHead align="right" label="เลือก" resizeProps={targetColumnResize.getResizeHandleProps('action', 'เลือก')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={targetColumns.length}>กำลังโหลด target candidates</td></tr> : null}
                {!isLoading && (data?.poSells.length ?? 0) === 0 ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={targetColumns.length}>ไม่มี {sourceTypeLabel} ของสินค้านี้ที่ยังไม่ match</td></tr> : null}
                {pagedPoSells.map((target) => {
                  const active = selectedPoSellId === target.id
                  return (
                    <tr key={target.id} className={active ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-slate-50'}>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-900">{target.docNo}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{target.date}</td>
                      <td className="px-3 py-3 font-medium text-slate-900">{target.customerName === '-' ? 'ภายในโรงงาน' : target.customerName}</td>
                      <td className="px-3 py-3 text-slate-700">{target.productName}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(target.qty)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-700">{formatMoney(target.matchedQty)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-amber-700">{formatMoney(target.remainingQty)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(target.unitPrice)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
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
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 p-3 md:hidden">
            {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">กำลังโหลด target candidates</div> : null}
            {!isLoading && (data?.poSells.length ?? 0) === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">ไม่มี {sourceTypeLabel} ของสินค้านี้ที่ยังไม่ match</div> : null}
            {pagedPoSells.map((target) => {
              const active = selectedPoSellId === target.id
              return (
                <div key={target.id} className={`rounded-xl border p-4 shadow-sm ${active ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-mono text-base font-bold text-slate-900">{target.docNo}</div>
                    <div className="shrink-0 text-sm font-medium text-slate-500">{target.date}</div>
                  </div>
                  <div className="mt-3 space-y-1.5 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                    <div><span className="font-semibold text-slate-500">{sourceType === 'production' ? 'ผู้ผลิต' : 'ลูกค้า'}: </span><span className="text-slate-900">{target.customerName === '-' ? 'ภายในโรงงาน' : target.customerName}</span></div>
                    <div><span className="font-semibold text-slate-500">สินค้า: </span><span className="text-slate-900">{target.productName}</span></div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                    <div><span className="block text-xs text-slate-500">{sourceType === 'production' ? 'จำนวนผลิต' : 'จำนวนขาย'}</span><span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatMoney(target.qty)} กก.</span></div>
                    <div className="text-right"><span className="block text-xs text-slate-500">ค้างจับคู่</span><span className="mt-0.5 block font-bold tabular-nums text-amber-700">{formatMoney(target.remainingQty)} กก.</span></div>
                    <div><span className="block text-xs text-slate-500">จับคู่แล้ว</span><span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatMoney(target.matchedQty)} กก.</span></div>
                    <div className="text-right"><span className="block text-xs text-slate-500">{sourceType === 'production' ? 'ต้นทุน/กก.' : 'ราคาขาย/หน่วย'}</span><span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatMoney(target.unitPrice)}</span></div>
                  </div>
                  <Button
                    className="mt-3 w-full"
                    type="button"
                    variant={active ? 'default' : 'secondary'}
                    onClick={() => {
                      setSelectedPoSellId(target.id)
                      setShowPreview(false)
                    }}
                  >
                    {active ? 'เลือกแล้ว' : 'เลือก'}
                  </Button>
                </div>
              )
            })}
          </div>
          </div>
          </>
          ) : null}
        </DualCostingPanel>
      ) : null}

      {hasSelection ? (
        <DualCostingPanel title="③ ล็อตต้นทุนในกลุ่มต้นทุนของสินค้าที่เลือก" titleAction={<PanelToggleButton collapsed={collapsedSections.step3} onClick={() => toggleSection('step3')} />}>
          {!collapsedSections.step3 ? (
          <>
          <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm md:block">
            {poolColumnResize.hasCustomWidths ? (
              <div className="flex justify-end border-b border-slate-100 px-3 py-3">
                <Button className="h-8 text-xs" size="sm" type="button" variant="outline" onClick={poolColumnResize.resetColumnWidths}>
                  คืนค่าเดิมตาราง
                </Button>
              </div>
            ) : null}
            <div className="overflow-x-auto">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ tableLayout: 'fixed', minWidth: poolColumnResize.tableMinWidth, width: '100%' }}>
              <colgroup>
                {poolColumns.map((column) => (
                  <col key={column.key} style={poolColumnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  <ResizableTableHead label="แหล่งต้นทุน" activeSortKey={poolSortKey ?? undefined} direction={poolSortDirection} sortKey="sourceType" onSort={handlePoolSort} resizeProps={poolColumnResize.getResizeHandleProps('sourceType', 'แหล่งต้นทุน')} />
                  <ResizableTableHead label="เลขที่เอกสารต้นทุน" activeSortKey={poolSortKey ?? undefined} direction={poolSortDirection} sortKey="sourceNo" onSort={handlePoolSort} resizeProps={poolColumnResize.getResizeHandleProps('sourceNo', 'เลขที่เอกสารต้นทุน')} />
                  <ResizableTableHead label="วันที่เอกสาร" activeSortKey={poolSortKey ?? undefined} direction={poolSortDirection} sortKey="date" onSort={handlePoolSort} resizeProps={poolColumnResize.getResizeHandleProps('date', 'วันที่เอกสาร')} />
                  <ResizableTableHead label="คู่ค้า" activeSortKey={poolSortKey ?? undefined} direction={poolSortDirection} sortKey="counterparty" onSort={handlePoolSort} resizeProps={poolColumnResize.getResizeHandleProps('counterparty', 'คู่ค้า')} />
                  <ResizableTableHead align="right" label="คงเหลือพร้อมใช้" activeSortKey={poolSortKey ?? undefined} direction={poolSortDirection} sortKey="availableQty" onSort={handlePoolSort} resizeProps={poolColumnResize.getResizeHandleProps('availableQty', 'คงเหลือพร้อมใช้')} />
                  <ResizableTableHead align="right" label="ต้นทุน/หน่วย" activeSortKey={poolSortKey ?? undefined} direction={poolSortDirection} sortKey="unitCost" onSort={handlePoolSort} resizeProps={poolColumnResize.getResizeHandleProps('unitCost', 'ต้นทุนต่อหน่วย')} />
                  <ResizableTableHead align="right" label="มูลค่าคงเหลือ" activeSortKey={poolSortKey ?? undefined} direction={poolSortDirection} sortKey="availableValue" onSort={handlePoolSort} resizeProps={poolColumnResize.getResizeHandleProps('availableValue', 'มูลค่าคงเหลือ')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={poolColumns.length}>กำลังโหลดกลุ่มต้นทุน</td></tr> : null}
                {!isLoading && (data?.pool.length ?? 0) === 0 ? <tr><td className="px-3 py-10 text-center text-amber-700" colSpan={poolColumns.length}>ยังไม่มีล็อตต้นทุนสำหรับสินค้านี้</td></tr> : null}
                {sortedPoolRows.slice(0, 12).map((row) => (
                  <tr key={row.costPoolId} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-3"><span className={`rounded border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>{poolSourceLabel(row.sourceType)}</span></td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-900">{row.sourceNo}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.date}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{row.counterparty}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-emerald-700">{formatMoney(row.availableQty)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.unitCost)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(row.availableValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">กำลังโหลดกลุ่มต้นทุน</div> : null}
            {!isLoading && (data?.pool.length ?? 0) === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm text-amber-700 shadow-sm">ยังไม่มีล็อตต้นทุนสำหรับสินค้านี้</div> : null}
            {sortedPoolRows.slice(0, 12).map((row) => (
              <div key={row.costPoolId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>{poolSourceLabel(row.sourceType)}</span>
                    <div className="mt-2 font-mono text-base font-bold text-slate-900">{row.sourceNo}</div>
                  </div>
                  <div className="shrink-0 text-sm font-medium text-slate-500">{row.date}</div>
                </div>
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="font-semibold text-slate-500">คู่ค้า: </span>
                  <span className="text-slate-900">{row.counterparty}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                  <div><span className="block text-xs text-slate-500">คงเหลือพร้อมใช้</span><span className="mt-0.5 block font-bold tabular-nums text-emerald-700">{formatMoney(row.availableQty)} กก.</span></div>
                  <div className="text-right"><span className="block text-xs text-slate-500">ต้นทุน/หน่วย</span><span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatMoney(row.unitCost)}</span></div>
                  <div className="col-span-2 text-right"><span className="block text-xs text-slate-500">มูลค่าคงเหลือ</span><span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatMoney(row.availableValue)}</span></div>
                </div>
              </div>
            ))}
          </div>
          {(data?.pool.length ?? 0) > 12 ? <div className="mt-2 text-xs text-slate-500">แสดง 12 lot แรกตาม sort ปัจจุบันจากทั้งหมด {data?.pool.length ?? 0} lot</div> : null}
          </>
          ) : null}
        </DualCostingPanel>
      ) : null}

      {shouldShowPreview && hasCandidates ? (
        <DualCostingPanel title="④ ตัวอย่างการจับคู่ต้นทุน" titleAction={<PanelToggleButton collapsed={collapsedSections.step4} onClick={() => toggleSection('step4')} />}>
          {!collapsedSections.step4 ? (
          <>
          <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm md:block">
            {previewColumnResize.hasCustomWidths ? (
              <div className="flex justify-end border-b border-slate-100 px-3 py-3">
                <Button className="h-8 text-xs" size="sm" type="button" variant="outline" onClick={previewColumnResize.resetColumnWidths}>
                  คืนค่าเดิมตาราง
                </Button>
              </div>
            ) : null}
            <div className="overflow-x-auto">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ tableLayout: 'fixed', minWidth: previewColumnResize.tableMinWidth, width: '100%' }}>
              <colgroup>
                {previewColumns.map((column) => (
                  <col key={column.key} style={previewColumnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  <ResizableTableHead label="แหล่งต้นทุน" activeSortKey={previewSortKey ?? undefined} direction={previewSortDirection} sortKey="sourceType" onSort={handlePreviewSort} resizeProps={previewColumnResize.getResizeHandleProps('sourceType', 'แหล่งต้นทุน')} />
                  <ResizableTableHead label="เลขที่เอกสารต้นทุน" activeSortKey={previewSortKey ?? undefined} direction={previewSortDirection} sortKey="sourceNo" onSort={handlePreviewSort} resizeProps={previewColumnResize.getResizeHandleProps('sourceNo', 'เลขที่เอกสารต้นทุน')} />
                  <ResizableTableHead label="คู่ค้า" activeSortKey={previewSortKey ?? undefined} direction={previewSortDirection} sortKey="counterparty" onSort={handlePreviewSort} resizeProps={previewColumnResize.getResizeHandleProps('counterparty', 'คู่ค้า')} />
                  <ResizableTableHead align="right" label="คงเหลือพร้อมใช้" activeSortKey={previewSortKey ?? undefined} direction={previewSortDirection} sortKey="availableQty" onSort={handlePreviewSort} resizeProps={previewColumnResize.getResizeHandleProps('availableQty', 'คงเหลือพร้อมใช้')} />
                  <ResizableTableHead align="right" label="ต้นทุน/หน่วย" activeSortKey={previewSortKey ?? undefined} direction={previewSortDirection} sortKey="unitCost" onSort={handlePreviewSort} resizeProps={previewColumnResize.getResizeHandleProps('unitCost', 'ต้นทุนต่อหน่วย')} />
                  <ResizableTableHead align="right" label="จำนวนที่ใช้" activeSortKey={previewSortKey ?? undefined} direction={previewSortDirection} sortKey="qtyToUse" onSort={handlePreviewSort} resizeProps={previewColumnResize.getResizeHandleProps('qtyToUse', 'จำนวนที่ใช้')} />
                  <ResizableTableHead align="right" label="มูลค่าที่ใช้" activeSortKey={previewSortKey ?? undefined} direction={previewSortDirection} sortKey="totalCostUse" onSort={handlePreviewSort} resizeProps={previewColumnResize.getResizeHandleProps('totalCostUse', 'มูลค่าที่ใช้')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedPreviewRows.map((row) => (
                  <tr key={row.costPoolId} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-3"><span className={`rounded border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>{poolSourceLabel(row.sourceType)}</span></td>
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-900">{row.sourceNo}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{row.counterparty}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.availableQty)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.unitCost)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-blue-700">{formatMoney(row.qtyToUse)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(row.totalCostUse)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {sortedPreviewRows.map((row) => (
              <div key={row.costPoolId} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>{poolSourceLabel(row.sourceType)}</span>
                    <div className="mt-2 font-mono text-base font-bold text-slate-900">{row.sourceNo}</div>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                  <span className="font-semibold text-slate-500">คู่ค้า: </span>
                  <span className="text-slate-900">{row.counterparty}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                  <div><span className="block text-xs text-slate-500">คงเหลือพร้อมใช้</span><span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatMoney(row.availableQty)} กก.</span></div>
                  <div className="text-right"><span className="block text-xs text-slate-500">จำนวนที่ใช้</span><span className="mt-0.5 block font-bold tabular-nums text-blue-700">{formatMoney(row.qtyToUse)} กก.</span></div>
                  <div><span className="block text-xs text-slate-500">ต้นทุน/หน่วย</span><span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatMoney(row.unitCost)}</span></div>
                  <div className="text-right"><span className="block text-xs text-slate-500">มูลค่าที่ใช้</span><span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatMoney(row.totalCostUse)}</span></div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 mt-4">
            <DualCostingStatCard icon="🔗" label="รวมที่จะจับคู่" tone="blue" value={`${formatMoney(data?.summary.totalToMatch ?? 0)} กก.`} />
            <DualCostingStatCard icon="💰" label="รายได้คาดการณ์" tone="emerald" value={formatMoney(data?.summary.expectedRevenue ?? 0)} />
            <DualCostingStatCard icon="💳" label="ต้นทุนที่จะตัด" tone="red" value={formatMoney(data?.summary.totalCostMatch ?? 0)} />
            <DualCostingStatCard icon="📈" label="กำไรคาดการณ์" tone={(data?.summary.expectedMargin ?? 0) >= 0 ? 'purple' : 'red'} value={formatMoney(data?.summary.expectedMargin ?? 0)} />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {isManualMode ? (
              <Button className="rounded-md h-10 px-4 text-sm font-semibold focus-visible:ring-slate-100" type="button" variant="secondary" onClick={() => setShowPreview(false)} disabled={isSubmitting}>ปิดตัวอย่าง</Button>
            ) : null}
            <Button
              className="rounded-md h-10 px-4 text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white transition-colors focus-visible:outline-none"
              type="button"
              onClick={handleConfirmMatch}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'กำลังบันทึก...' : 'ยืนยันการจับคู่'}
            </Button>
          </div>
          </>
          ) : null}
        </DualCostingPanel>
      ) : null}
    </DualCostingPageSection>
  )
}

function sortRows<TRow, TKey extends string>(
  rows: TRow[],
  sortKey: TKey | null,
  sortDirection: SortDirection,
  getValue: (row: TRow, key: TKey) => string | number,
) {
  if (!sortKey) return rows

  return [...rows].sort((left, right) => {
    const result = compareSortValues(getValue(left, sortKey), getValue(right, sortKey))
    return sortDirection === 'asc' ? result : -result
  })
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

function getTimestamp(value: string | undefined) {
  const timestamp = Date.parse(value ?? '')
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function PanelToggleButton({
  collapsed,
  onClick,
}: {
  collapsed: boolean
  onClick: () => void
}) {
  return (
    <button
      aria-expanded={!collapsed}
      className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
      type="button"
      onClick={onClick}
    >
      <span>{collapsed ? 'แสดง' : 'ซ่อน'}</span>
      <span className="text-slate-400">{collapsed ? '▾' : '▴'}</span>
    </button>
  )
}

function getTargetSortValue(row: PoSellOption, key: TargetColumnKey): string | number {
  if (key === 'action') return ''
  if (key === 'date') return getTimestamp(row.date)

  return row[key] ?? ''
}

function getPoolSortValue(row: PoolRow, key: PoolColumnKey): string | number {
  if (key === 'date') return getTimestamp(row.date)

  return row[key] ?? ''
}

function getPreviewSortValue(row: CandidateRow, key: PreviewColumnKey): string | number {
  return row[key] ?? ''
}

function allocationModeLabel(mode: string) {
  if (mode === 'LIFO') return 'LIFO - ต้นทุนใหม่ก่อน'
  if (mode === 'Cheap') return 'ต้นทุนต่ำก่อน'
  if (mode === 'Expensive') return 'ต้นทุนสูงก่อน'
  if (mode === 'Manual') return 'กำหนดเอง'
  return 'FIFO - ต้นทุนเก่าก่อน'
}

function sourceBadgeClass(type: string) {
  if (type === 'Production') return 'bg-orange-50 text-orange-700 border border-orange-200/50'
  if (type === 'Regrade' || type === 'Grade Adjustment') return 'bg-purple-50 text-purple-700 border border-purple-200/50'
  if (type === 'PO_Buy') return 'bg-cyan-50 text-cyan-700 border border-cyan-200/50'
  return 'bg-blue-50 text-blue-700 border border-blue-200/50'
}

function poolSourceLabel(type: string) {
  if (type === 'Production') return 'การผลิต'
  if (type === 'Regrade' || type === 'Grade Adjustment') return 'ปรับเกรด'
  if (type === 'PO_Buy') return 'PO ซื้อ'
  return type
}
