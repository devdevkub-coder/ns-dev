'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
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
  awaitingBillQty: number
}

type DisplayBalanceRow = BalanceRow & {
  sourceRows?: BalanceRow[]
}

type BalancePayload = {
  byStatus: Array<{ count: number; qty: number; status: string; value: number }>
  reference: { branches: StockOption[]; products: StockOption[]; warehouses: StockOption[] }
  rows: BalanceRow[]
  summary: { availableQty: number; availableValue: number; awaitingBillQty: number; count: number; negativeRows: number; notAvailableQty: number; notAvailableValue: number; onHandRows: number; onHoldQty: number; pendingInRows: number; pendingOutRows: number; qty: number; readyQty: number; value: number }
}

type BalanceDetail = {
  holds: Array<{
    customerCode: string
    customerName: string
    heldAt: string
    holdKey: string
    lotNo: string
    qty: number
    sourceDocNo: string
    sourceLineNo: number | null
    status: string
    weightTicketDate: string
  }>
  ledgerRows: Array<{
    createdAt: string
    date: string
    id: string
    movementType: string
    note: string
    qtyIn: number
    qtyOut: number
    refNo: string
    refType: string
    unitCost: number
    valueIn: number
    valueOut: number
  }>
}

type StockStateFilter = '' | 'on_hand' | 'pending_in' | 'pending_out'

const STOCK_STATE_OPTIONS: Array<{ label: string; value: StockStateFilter }> = [
  { label: 'ทุกสถานะ', value: '' },
  { label: 'คงเหลือ', value: 'on_hand' },
  { label: 'รอเข้า', value: 'pending_in' },
  { label: 'รอออก', value: 'pending_out' },
]

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

export function StockBalancePageClient() {
  const [branchId, setBranchId] = useState('')
  const [data, setData] = useState<BalancePayload | null>(null)
  const [detailRow, setDetailRow] = useState<BalanceRow | null>(null)
  const [detailData, setDetailData] = useState<BalanceDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])

  const toggleGroup = useCallback((cat: string) => {
    setSelectedGroups((prev) =>
      prev.includes(cat) ? prev.filter((g) => g !== cat) : [...prev, cat]
    )
  }, [])
  const [isLoading, setIsLoading] = useState(true)
  const [productId, setProductId] = useState('')
  const [stockState, setStockState] = useState<StockStateFilter>('')
  const [stockType, setStockType] = useState('')
  const [viewMode, setViewMode] = useState<'detail' | 'summary'>('summary')
  const [detailPage, setDetailPage] = useState(1)
  const [detailPageSize, setDetailPageSize] = useState(25)
  const [matrixPage, setMatrixPage] = useState(1)
  const [matrixPageSize, setMatrixPageSize] = useState(25)
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (branchId) params.set('branchId', branchId)
      if (productId) params.set('productId', productId)
      if (stockType) params.set('status', stockType)
      if (stockState) params.set('stockState', stockState)
      setData(await dailyFetchJson<BalancePayload>(`/api/stock/balance?${params.toString()}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดสต๊อกคงเหลือไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [branchId, productId, stockState, stockType])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!detailRow) {
      setDetailData(null)
      setDetailError(null)
      setIsDetailLoading(false)
      return
    }
    const row = detailRow
    const controller = new AbortController()
    async function loadDetail() {
      setDetailError(null)
      setDetailData(null)
      setIsDetailLoading(true)
      try {
        const params = new URLSearchParams({
          branchId: row.branchId,
          detail: '1',
          productId: row.productId,
          warehouseId: row.warehouseId,
        })
        if (row.status) params.set('status', row.status)
        if (row.lotNo) params.set('lotNo', row.lotNo)
        if (row.notAvailable) params.set('notAvailable', '1')
        const payload = await dailyFetchJson<{ detail: BalanceDetail }>(`/api/stock/balance?${params.toString()}`, { signal: controller.signal })
        setDetailData(payload.detail)
      } catch (caught) {
        if (controller.signal.aborted) return
        setDetailError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดสต๊อกไม่ได้')
      } finally {
        if (!controller.signal.aborted) setIsDetailLoading(false)
      }
    }
    void loadDetail()
    return () => controller.abort()
  }, [detailRow])

  const filteredRows = useMemo(() => {
    return (data?.rows ?? [])
      .filter((row) => !group || row.productMetalGroup === group)
      .filter((row) => selectedGroups.length === 0 || selectedGroups.includes(row.productMetalGroup))
      .filter((row) => stockState !== 'on_hand' || row.qty > 0)
      .filter((row) => stockState !== 'pending_in' || row.awaitingBillQty > 0)
      .filter((row) => stockState !== 'pending_out' || row.onHoldQty > 0)
  }, [data?.rows, group, selectedGroups, stockState])

  const displayRows = useMemo<DisplayBalanceRow[]>(() => {
    const grouped = new Map<string, DisplayBalanceRow>()

    for (const row of filteredRows) {
      const groupKey = [
        row.productId,
        row.branchId,
        row.warehouseId,
        row.status,
        row.notAvailable ? 'not-available' : 'available',
      ].join('|')
      const existing = grouped.get(groupKey)

      if (!existing) {
        grouped.set(groupKey, { ...row, sourceRows: [row] })
        continue
      }

      existing.qty += row.qty
      existing.value += row.value
      existing.awaitingBillQty += row.awaitingBillQty
      existing.onHoldQty += row.onHoldQty
      existing.readyQty += row.readyQty
      existing.avgCost = existing.qty > 0 ? existing.value / existing.qty : 0
      existing.lastDate = latestDateOnly(existing.lastDate, row.lastDate)
      existing.lotNo = existing.lotNo && row.lotNo && existing.lotNo === row.lotNo ? existing.lotNo : ''
      existing.sourceRows?.push(row)
    }

    return Array.from(grouped.values())
  }, [filteredRows])

  const summary = useMemo(() => filteredRows.reduce((acc, row) => {
    acc.qty += row.qty
    acc.value += row.value
    acc.awaitingBillQty += row.awaitingBillQty
    if (row.qty > 0) acc.onHandRows += 1
    if (row.awaitingBillQty > 0) acc.pendingInRows += 1
    if (row.onHoldQty > 0) acc.pendingOutRows += 1
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
  }, { availableQty: 0, availableValue: 0, awaitingBillQty: 0, negativeRows: 0, notAvailableQty: 0, notAvailableValue: 0, onHandRows: 0, onHoldQty: 0, pendingInRows: 0, pendingOutRows: 0, qty: 0, readyQty: 0, value: 0 }), [filteredRows])

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

  const detailTotalPages = Math.max(1, Math.ceil(displayRows.length / detailPageSize))
  const detailCurrentPage = Math.min(detailPage, detailTotalPages)
  const pagedDetailRows = useMemo(() => {
    const start = (detailCurrentPage - 1) * detailPageSize
    return displayRows.slice(start, start + detailPageSize)
  }, [detailCurrentPage, detailPageSize, displayRows])

  const matrixTotalPages = Math.max(1, Math.ceil(matrixRows.length / matrixPageSize))
  const matrixCurrentPage = Math.min(matrixPage, matrixTotalPages)
  const pagedMatrixRows = useMemo(() => {
    const start = (matrixCurrentPage - 1) * matrixPageSize
    return matrixRows.slice(start, start + matrixPageSize)
  }, [matrixCurrentPage, matrixPageSize, matrixRows])

  useEffect(() => {
    setDetailPage(1)
    setMatrixPage(1)
  }, [branchId, group, productId, selectedGroups, stockState, stockType])

  useEffect(() => {
    if (detailPage > detailTotalPages) setDetailPage(detailTotalPages)
  }, [detailPage, detailTotalPages])

  useEffect(() => {
    if (matrixPage > matrixTotalPages) setMatrixPage(matrixTotalPages)
  }, [matrixPage, matrixTotalPages])

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
    return displayRows.filter((row) => row.productId === productId)
  }, [displayRows, productId])

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
  function exportXlsx() {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (branchId) params.set('branchId', branchId)
    if (productId) params.set('productId', productId)
    if (stockType) params.set('status', stockType)
    if (stockState) params.set('stockState', stockState)
    window.location.href = `/api/stock/balance?${params.toString()}`
  }

  function ledgerLinkFor(row: BalanceRow) {
    const params = new URLSearchParams({
      balanceMode: 'warehouse',
      branchId: row.branchId,
      productId: row.productId,
      warehouseId: row.warehouseId,
    })
    if (row.status) params.set('status', row.status)
    if (row.lotNo) params.set('lotNo', row.lotNo)
    return `/stock/ledger?${params.toString()}`
  }

  const resetFilters = useCallback(() => {
    setBranchId('')
    setProductId('')
    setStockState('')
    setStockType('')
    setGroup('')
    setSelectedGroups([])
  }, [])

  const hasFilters = useMemo(() => {
    return Boolean(branchId || productId || stockState || stockType || group || selectedGroups.length > 0)
  }, [branchId, productId, stockState, stockType, group, selectedGroups])

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      
      {/* Metric Cards */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-5 text-sm">
        <Metric emoji="⚖️" iconBg="bg-blue-100 text-blue-700" label="น้ำหนักสต๊อกรวม" sub={`คงเหลือ ${summary.onHandRows.toLocaleString('th-TH')} รายการ`} value={`${formatMoney(summary.qty)} กก.`} tone="blue" />
        <Metric emoji="💰" iconBg="bg-emerald-100 text-emerald-700" label="มูลค่าสต๊อกรวม" value={formatMoney(summary.value)} tone="emerald" />
        <Metric emoji="📥" iconBg="bg-sky-100 text-sky-700" label="รอเข้า" sub={`${summary.pendingInRows.toLocaleString('th-TH')} รายการ จาก WTI`} value={`${formatMoney(summary.awaitingBillQty)} กก.`} tone="blue" />
        <Metric emoji="⏳" iconBg="bg-amber-100 text-amber-700" label="รอออก" sub={`${summary.pendingOutRows.toLocaleString('th-TH')} รายการ จาก WTO`} value={`${formatMoney(summary.onHoldQty)} กก.`} tone="amber" />
        <Metric emoji="✅" iconBg="bg-emerald-100 text-emerald-700" label="พร้อมส่ง" sub={`${summary.qty > 0 ? (summary.readyQty / summary.qty * 100).toFixed(1) : '0'}% ของ Stock`} value={`${formatMoney(summary.readyQty)} กก.`} tone="emerald" />
      </div>

      {/* Status Cards */}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        {byStatus.map((item, index) => (
          <div key={item.status} className={index === 2 ? 'col-span-2 md:col-span-1' : ''}>
            <StatusCard item={item} />
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-md bg-white shadow">
        <StockViewTabs
          detailCount={displayRows.length}
          matrixCount={matrixRows.length}
          value={viewMode}
          onChange={setViewMode}
        />

        {/* Desktop Toolbar (Hidden on Mobile) */}
        <div className="hidden space-y-3 border-b border-slate-100 p-3 lg:block">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-[260px] flex-1">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 rounded-md border-slate-300 text-sm outline-none focus:border-slate-400 focus:ring-0"
                inputId="stock-balance-product-search"
                label="สินค้า"
                options={productOptions}
                placeholder="ค้นหารหัสหรือชื่อสินค้า"
                value={productId}
                onChange={setProductId}
              />
            </div>
            {productId ? (
              <button className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:ring-0" type="button" onClick={() => setProductId('')}>
                ✕ ล้างสินค้า
              </button>
            ) : null}

            {hasFilters ? (
              <button className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:ring-0" type="button" onClick={resetFilters}>
                ✕ ล้างทั้งหมด
              </button>
            ) : null}
            <button className="ml-auto inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white outline-none transition-colors hover:bg-emerald-700 focus:ring-0" type="button" onClick={exportXlsx}>
              <Download className="size-4" aria-hidden="true" />
              ส่งออก Excel
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">หมวดสินค้า:</span>
            <select className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400 focus:ring-0" value={group} onChange={(event) => setGroup(event.target.value)}>
              <option value="">ทุกหมวด</option>
              {groupOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>

            <span className="ml-4 text-xs text-slate-500">สถานะสินค้า:</span>
            <select className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400 focus:ring-0" value={stockState} onChange={(event) => setStockState(event.target.value as StockStateFilter)}>
              {STOCK_STATE_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>{option.label}</option>
              ))}
            </select>

            <span className="ml-4 text-xs text-slate-500">ประเภทคลัง:</span>
            <select className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400 focus:ring-0" value={stockType} onChange={(event) => setStockType(event.target.value)}>
              <option value="">ทุกประเภท</option>
              <option value="RM">📦 RM</option>
              <option value="WIP">⚙️ WIP</option>
              <option value="FG">✅ FG</option>
            </select>

            <span className="ml-4 text-xs text-slate-500">สาขา:</span>
            <select className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400 focus:ring-0" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">ทุกสาขา</option>
              {data?.reference.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">หมวดหมู่ด่วน:</span>
            {['ทองแดง', 'ทองเหลือง', 'อลูมิเนียม', 'กระดาษ', 'พลาสติก'].map((cat) => (
              <MatchButton
                key={cat}
                active={selectedGroups.includes(cat)}
                label={cat}
                onClick={() => toggleGroup(cat)}
                tone="dark"
              />
            ))}
          </div>
        </div>

        {/* Mobile Toolbar (Hidden on Desktop) */}
        <div className="space-y-3 p-3.5 lg:hidden animate-fade-in">
          <div className="flex gap-2 items-center">
            <div className="min-w-[150px] flex-1">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 rounded-md border-slate-300 text-sm outline-none focus:border-slate-400 focus:ring-0"
                inputId="stock-balance-product-search-mobile-toolbar"
                label="สินค้า"
                options={productOptions}
                placeholder="ค้นหารหัสหรือชื่อสินค้า"
                value={productId}
                onChange={setProductId}
              />
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none hover:bg-slate-50 focus:ring-0"
              onClick={() => setShowMobileFilters(true)}
            >
              ตัวกรอง {hasFilters ? '(มี)' : ''}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
            <span className="mr-1 text-xs text-slate-500">หมวดหมู่ด่วน:</span>
            {['ทองแดง', 'ทองเหลือง', 'อลูมิเนียม', 'กระดาษ', 'พลาสติก'].map((cat) => (
              <button
                key={cat}
                type="button"
                className={`rounded-md border px-3 py-1 text-xs font-medium transition outline-none focus:ring-0 ${
                  selectedGroups.includes(cat)
                    ? 'border-slate-700 bg-slate-700 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                onClick={() => toggleGroup(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto animate-slide-up">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองสต๊อก</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-xl font-bold"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">หมวดสินค้า</span>
                <select className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800" value={group} onChange={(event) => setGroup(event.target.value)}>
                  <option value="">ทุกหมวด</option>
                  {groupOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">สถานะสินค้า</span>
                <select className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800" value={stockState} onChange={(event) => setStockState(event.target.value as StockStateFilter)}>
                  {STOCK_STATE_OPTIONS.map((option) => (
                    <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">ประเภทคลัง</span>
                <select className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800" value={stockType} onChange={(event) => setStockType(event.target.value)}>
                  <option value="">ทุกประเภท</option>
                  <option value="RM">📦 RM</option>
                  <option value="WIP">⚙️ WIP</option>
                  <option value="FG">✅ FG</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">สาขา</span>
                <select className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                  <option value="">ทุกสาขา</option>
                  {data?.reference.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-9 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  resetFilters()
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                className="h-9 rounded-md bg-slate-900 text-sm font-medium text-white hover:bg-slate-850"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {productId && selectedProductInfo ? (
        <ProductPanel averageCost={selectedProductInfo.qty > 0 ? selectedProductInfo.value / selectedProductInfo.qty : 0} info={selectedProductInfo} rows={selectedProductRows} onClose={() => setProductId('')} onOpen={setDetailRow} />
      ) : null}

      {viewMode === 'summary' ? (
        <>
          <StockCharts byStatus={byStatus} matrixRows={matrixRows} totalValue={summary.value} />
          <PaginationControls
            currentPage={matrixCurrentPage}
            label="หมวด"
            pageSize={matrixPageSize}
            totalItems={matrixRows.length}
            totalPages={matrixTotalPages}
            onPageChange={setMatrixPage}
            onPageSizeChange={(size) => {
              setMatrixPageSize(size)
              setMatrixPage(1)
            }}
          />
          <MatrixTable byStatus={byStatus} isLoading={isLoading} matrixRows={pagedMatrixRows} totalMatrixRows={matrixRows.length} totalQty={summary.qty} totalValue={summary.value} />
        </>
      ) : (
        <>
          <PaginationControls
            currentPage={detailCurrentPage}
            label="รายการ"
            pageSize={detailPageSize}
            totalItems={displayRows.length}
            totalPages={detailTotalPages}
            onPageChange={setDetailPage}
            onPageSizeChange={(size) => {
              setDetailPageSize(size)
              setDetailPage(1)
            }}
          />
          <DetailTable isLoading={isLoading} onOpen={setDetailRow} rows={pagedDetailRows} />
        </>
      )}

      <Dialog open={!!detailRow} onOpenChange={(open) => { if (!open) setDetailRow(null) }}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-5xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 animate-fade-in sm:w-[calc(100vw-2rem)] lg:min-w-[900px]" hideClose>
          <div className="flex items-center justify-between bg-slate-900 text-white px-5 py-3 shrink-0 border-b border-slate-800">
            <h3 className="font-bold text-slate-100 text-[16px]">รายละเอียดสต๊อกคงเหลือ</h3>
            <button className="text-2xl text-slate-400 hover:text-white transition-colors outline-none focus:outline-none focus:ring-0" type="button" onClick={() => setDetailRow(null)}>&times;</button>
          </div>
          
          {detailRow ? (
            <div className="flex-1 overflow-y-auto bg-slate-50 p-3 sm:p-4 space-y-3 text-sm">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ข้อมูลสินค้า</h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <StockDetailField className="col-span-2 sm:col-span-3" label="สินค้า" value={`${detailRow.productCode} - ${detailRow.productName}`} />
                  <StockDetailField label="ประเภทคลัง" value={stockStatusText(detailRow)} />
                  <StockDetailField label="สถานะสินค้า" value={stockStateText(detailRow)} />
                  <StockDetailField label="วันที่ล่าสุด" value={detailRow.lastDate} />
                  <StockDetailField className="col-span-2" label="สาขา / คลัง" value={`${detailRow.branchName} / ${detailRow.warehouseName}`} />
                  <StockDetailField label="Lot" mono value={detailRow.lotNo || '-'} />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">จำนวนและมูลค่าสต๊อก</h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <StockMetric label="คงเหลือสุทธิ" value={`${formatMoney(detailRow.qty)} กก.`} tone={detailRow.qty < 0 ? 'red' : 'emerald'} />
                  <StockMetric label="รอเข้า (WTI)" value={`${formatMoney(detailRow.awaitingBillQty)} กก.`} />
                  <StockMetric label="รอออก (WTO)" value={`${formatMoney(detailRow.onHoldQty)} กก.`} tone="amber" />
                  <StockMetric label="พร้อมส่ง" value={`${formatMoney(detailRow.readyQty)} กก.`} tone="emerald" />
                  <StockMetric label="ต้นทุนเฉลี่ย" value={`${formatMoney(detailRow.avgCost)} บ./กก.`} />
                  <StockMetric label="มูลค่ารวม" value={`${formatMoney(detailRow.value)} บาท`} tone="emerald" />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <h4 className="text-sm font-bold text-slate-800">Drilldown</h4>
                  <a className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800" href={ledgerLinkFor(detailRow)}>
                    เปิด Stock Ledger
                  </a>
                </div>
                {isDetailLoading ? <div className="py-4 text-center text-xs text-slate-500">กำลังโหลดรายละเอียด</div> : null}
                {detailError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{detailError}</div> : null}
                {!isDetailLoading && !detailError ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div>
                      <div className="mb-2 text-xs font-bold text-amber-700">WTO Hold ที่ยัง active ({detailData?.holds.length ?? 0})</div>
                      <div className="max-h-36 overflow-auto rounded-md border border-slate-100">
                        <table className="w-full text-xs">
                          <thead className="bg-amber-50 text-slate-600"><tr><th className="p-1.5 text-left">WTO</th><th className="p-1.5 text-left">ลูกค้า</th><th className="p-1.5 text-right">Qty</th><th className="p-1.5 text-left">Held</th></tr></thead>
                          <tbody>
                            {detailData?.holds.map((hold) => (
                              <tr key={hold.holdKey} className="border-t">
                                <td className="p-1.5 font-mono">{hold.sourceDocNo}{hold.sourceLineNo ? ` #${hold.sourceLineNo}` : ''}</td>
                                <td className="p-1.5">{hold.customerCode ? `${hold.customerCode} · ` : ''}{hold.customerName}</td>
                                <td className="p-1.5 text-right font-semibold text-amber-700">{formatMoney(hold.qty)}</td>
                                <td className="p-1.5">{formatDateTime(hold.heldAt)}</td>
                              </tr>
                            ))}
                            {!detailData?.holds.length ? <tr><td className="p-3 text-center text-slate-400" colSpan={4}>ไม่มี active hold ใน bucket นี้</td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-bold text-slate-700">Movement ล่าสุด ({detailData?.ledgerRows.length ?? 0})</div>
                      <div className="max-h-36 overflow-auto rounded-md border border-slate-100">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-600"><tr><th className="p-1.5 text-left">วันที่</th><th className="p-1.5 text-left">Ref</th><th className="p-1.5 text-right">เข้า</th><th className="p-1.5 text-right">ออก</th><th className="p-1.5 text-left">วันที่ทำ</th></tr></thead>
                          <tbody>
                            {detailData?.ledgerRows.map((ledger) => (
                              <tr key={ledger.id} className="border-t">
                                <td className="p-1.5">{ledger.date}</td>
                                <td className="p-1.5 font-mono">{ledger.refType}:{ledger.refNo || '-'}</td>
                                <td className="p-1.5 text-right text-emerald-700">{ledger.qtyIn ? formatMoney(ledger.qtyIn) : '-'}</td>
                                <td className="p-1.5 text-right text-red-700">{ledger.qtyOut ? formatMoney(ledger.qtyOut) : '-'}</td>
                                <td className="p-1.5">{formatDateTime(ledger.createdAt)}</td>
                              </tr>
                            ))}
                            {!detailData?.ledgerRows.length ? <tr><td className="p-3 text-center text-slate-400" colSpan={5}>ไม่มี movement ใน bucket นี้</td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 shrink-0">
            <button
              className="rounded-md bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm px-5 py-2 transition-colors outline-none focus:ring-0 animate-fade-in"
              type="button"
              onClick={() => setDetailRow(null)}
            >
              ปิด
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function formatDateTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

function latestDateOnly(current: string, next: string) {
  if (!current) return next
  if (!next) return current
  return next > current ? next : current
}

function primarySourceRow(row: DisplayBalanceRow) {
  return row.sourceRows?.[0] ?? row
}

type StatusSummary = { count: number; qty: number; status: string; value: number }

type MatrixRow = { fgQty: number; fgVal: number; group: string; rmQty: number; rmVal: number; wipQty: number; wipVal: number }

function StockDetailField({ className = '', label, mono, value }: { className?: string; label: string; mono?: boolean; value: string }) {
  return (
    <div className={`min-w-0 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 ${className}`}>
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-medium text-slate-900 ${mono ? 'font-mono' : ''}`} title={value}>{value}</div>
    </div>
  )
}

function StockMetric({ label, tone, value }: { label: string; tone?: string; value: string }) {
  const valueColor = tone === 'red'
    ? 'text-red-600'
    : tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : 'text-slate-900'
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${valueColor}`}>{value}</div>
    </div>
  )
}

function StockViewTabs({ detailCount, matrixCount, onChange, value }: {
  detailCount: number
  matrixCount: number
  onChange: (value: 'detail' | 'summary') => void
  value: 'detail' | 'summary'
}) {
  const tabs: Array<{ activeClass: string; badgeClass: string; count: number; label: string; value: 'detail' | 'summary' }> = [
    { activeClass: 'border-blue-600 text-blue-700', badgeClass: 'bg-blue-100 text-blue-700', count: matrixCount, label: 'Matrix', value: 'summary' },
    { activeClass: 'border-emerald-600 text-emerald-700', badgeClass: 'bg-emerald-100 text-emerald-700', count: detailCount, label: 'รายสินค้า', value: 'detail' },
  ]
  return (
    <div className="flex border-b border-slate-100">
      {tabs.map((tab) => {
        const active = value === tab.value
        return (
          <button
            key={tab.value}
            className={`border-b-2 px-5 py-3 text-sm font-medium ${active ? tab.activeClass : 'border-transparent text-slate-500'}`}
            type="button"
            onClick={() => onChange(tab.value)}
          >
            {tab.label}
            <span className={`ml-2 rounded-md-full px-2 py-0.5 text-xs ${tab.badgeClass}`}>
              {tab.count.toLocaleString('th-TH')}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function MatchButton({ active, label, onClick, tone = 'dark' }: { active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'dark' | 'emerald' | 'red' | 'slate' }) {
  const activeClass = {
    amber: 'border-amber-600 bg-amber-600 text-white',
    dark: 'border-slate-700 bg-slate-700 text-white',
    emerald: 'border-emerald-600 bg-emerald-600 text-white',
    red: 'border-red-600 bg-red-600 text-white',
    slate: 'border-slate-500 bg-slate-500 text-white',
  }[tone]
  const idleClass = tone === 'amber' ? 'border-slate-300 bg-white hover:bg-amber-50' : tone === 'emerald' ? 'border-slate-300 bg-white hover:bg-emerald-50' : tone === 'red' ? 'border-slate-300 bg-white hover:bg-red-50' : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium transition outline-none focus:ring-0 ${active ? activeClass : idleClass}`} type="button" onClick={onClick}>{label}</button>
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
    <div className="bg-white p-4 border border-slate-200 rounded-xl shadow-sm flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full ${iconBg} flex items-center justify-center text-lg shrink-0`}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider truncate">{label}</div>
        <div className={`text-base font-bold ${color} mt-0.5 tabular-nums`}>{value}</div>
        {sub ? <div className="text-[10px] text-slate-400 mt-0.5 truncate leading-tight">{sub}</div> : null}
      </div>
    </div>
  )
}

function StatusCard({ item }: { item: StatusSummary }) {
  const meta = item.status === 'FG'
    ? { border: 'border-emerald-200', bg: 'bg-emerald-50/30', text: 'text-emerald-700', iconBg: 'bg-emerald-100/60 text-emerald-600', emoji: '✅', label: 'FG (สินค้าสำเร็จรูป)' }
    : item.status === 'WIP'
      ? { border: 'border-amber-200', bg: 'bg-amber-50/30', text: 'text-amber-700', iconBg: 'bg-amber-100/60 text-amber-600', emoji: '⚙️', label: 'WIP (กำลังผลิต)' }
      : { border: 'border-blue-200', bg: 'bg-blue-50/30', text: 'text-blue-700', iconBg: 'bg-blue-100/60 text-blue-600', emoji: '📦', label: 'RM (วัตถุดิบ)' }
  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm flex items-center gap-3.5 ${meta.border}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${meta.iconBg}`}>
        {meta.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{meta.label} — {item.count} รายการ</div>
        <div className={`text-lg font-bold mt-0.5 ${meta.text}`}>{formatMoney(item.qty)} กก.</div>
        <div className="text-[10px] text-slate-400 font-medium mt-0.5">มูลค่า {formatMoney(item.value)} บาท</div>
      </div>
    </div>
  )
}


function ProductPanel({ averageCost, info, onClose, onOpen, rows }: {
  averageCost: number
  info: { available: number; onHold: number; product: StockOption; qty: number; ready: number; value: number }
  onClose: () => void
  onOpen: (row: BalanceRow) => void
  rows: DisplayBalanceRow[]
}) {
  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/10 p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-indigo-900">📦 {info.product.name}</h3>
          <p className="font-mono text-xs text-slate-500 mt-0.5">{info.product.code ?? '-'} · {info.product.metalGroup ?? '-'} · {info.product.status ?? 'RM'}</p>
        </div>
        <button 
          className="text-slate-400 hover:text-slate-650 text-xs font-semibold outline-none focus:ring-0" 
          type="button" 
          onClick={onClose}
        >
          ✕ ปิด
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">📊 คงเหลือ</div>
          <div className={`text-lg font-bold mt-1 tabular-nums ${info.qty > 0 ? 'text-emerald-700' : 'text-red-650'}`}>{formatMoney(info.qty)} <span className="text-xs font-normal">กก.</span></div>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">💰 มูลค่ารวม (WAC)</div>
          <div className="text-lg font-bold mt-1 text-blue-700 tabular-nums">{formatMoney(info.value)} <span className="text-xs font-normal">บาท</span></div>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">⚖ ราคาเฉลี่ย/กก.</div>
          <div className="text-lg font-bold mt-1 text-amber-700 tabular-nums">{formatMoney(averageCost)} <span className="text-xs font-normal">บ./กก.</span></div>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">รอออก</div>
          <div className="text-lg font-bold mt-1 text-amber-700 tabular-nums">{formatMoney(info.onHold)} <span className="text-xs font-normal">กก.</span></div>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">พร้อมส่ง</div>
          <div className="text-lg font-bold mt-1 text-emerald-700 tabular-nums">{formatMoney(info.ready)} <span className="text-xs font-normal">กก.</span></div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">📜 รายการสต๊อกของสินค้านี้ ({rows.length} รายการ)</h4>
          <span className="text-[10px] text-slate-400 font-medium">กดรายการเพื่อดูข้อมูลย่อย</span>
        </div>
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-xs text-slate-750">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200/60 text-slate-600 font-semibold z-10">
              <tr>
                <th className="p-3 text-left">วันที่ล่าสุด</th>
                <th className="p-3 text-center">ประเภทคลัง</th>
                <th className="p-3 text-left">สถานะสินค้า</th>
                <th className="p-3 text-left">สาขา</th>
                <th className="p-3 text-left">Lot</th>
                <th className="p-3 text-right">คงเหลือ</th>
                <th className="p-3 text-right">รอเข้า</th>
                <th className="p-3 text-right">รอออก</th>
                <th className="p-3 text-right">พร้อมส่ง</th>
                <th className="p-3 text-right">มูลค่า</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-semibold">
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className="cursor-pointer transition-colors hover:bg-slate-50/50 focus-visible:bg-slate-50 focus-visible:outline-none"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpen(primarySourceRow(row))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpen(primarySourceRow(row))
                    }
                  }}
                >
                  <td className="p-3 text-slate-500">{row.lastDate}</td>
                  <td className="p-3 text-center"><StockStatusCell row={row} /></td>
                  <td className="p-3"><StockStateCell row={row} /></td>
                  <td className="p-3 text-slate-500">{row.branchName}</td>
                  <td className="p-3 font-mono text-slate-600">{row.lotNo || '-'}</td>
                  <td className={`p-3 text-right tabular-nums ${row.qty < 0 ? 'text-red-650' : 'text-slate-800'}`}>{formatMoney(row.qty)}</td>
                  <td className="p-3 text-right text-slate-800 tabular-nums">{row.awaitingBillQty ? formatMoney(row.awaitingBillQty) : '-'}</td>
                  <td className="p-3 text-right text-amber-700 tabular-nums">{row.onHoldQty ? formatMoney(row.onHoldQty) : '-'}</td>
                  <td className="p-3 text-right text-emerald-700 tabular-nums">{formatMoney(row.readyQty)}</td>
                  <td className="p-3 text-right font-mono text-slate-600">{formatMoney(row.value)}</td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td className="py-6 text-center text-slate-400" colSpan={10}>ยังไม่มีรายการ</td></tr> : null}
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
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold text-sm text-slate-800 uppercase tracking-wider">🥧 สัดส่วน Stock RM/WIP/FG (มูลค่า)</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-[180px] w-[180px] items-center justify-center rounded-full shadow-inner" style={{ background: totalValue > 0 ? `conic-gradient(#3b82f6 0deg ${rmDeg}deg, #f59e0b ${rmDeg}deg ${rmDeg + wipDeg}deg, #10b981 ${rmDeg + wipDeg}deg 360deg)` : '#e5e7eb' }}>
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white text-center border border-slate-100 shadow-sm leading-tight">
              <span className="text-[10px] text-slate-500 font-semibold uppercase">รวม</span>
              <span className="text-xs font-extrabold text-slate-900 mt-0.5">{formatMoney(totalValue)}</span>
            </div>
          </div>
          <div className="min-w-[220px] flex-1 space-y-2 text-xs text-slate-700">
            <LegendRow color="bg-blue-500" label="📦 RM" value={rm} />
            <LegendRow color="bg-amber-500" label="⚙️ WIP" value={wip} />
            <LegendRow color="bg-emerald-500" label="✅ FG" value={fg} />
            <div className="flex justify-between border-t border-slate-100 pt-2 font-bold text-slate-800"><span>รวม</span><span>{formatMoney(totalValue)}</span></div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold text-sm text-slate-800 uppercase tracking-wider">📊 Top หมวดสินค้า (มูลค่าสต๊อก)</h3>
        {matrixRows.length === 0 ? <div className="py-8 text-center text-slate-400 text-xs">ไม่มีข้อมูล</div> : null}
        <div className="space-y-3">
          {matrixRows.slice(0, 8).map((row, index) => {
            const value = row.rmVal + row.wipVal + row.fgVal
            const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-pink-500', 'bg-lime-500']
            return (
              <div key={row.group}>
                <div className="mb-1 flex justify-between text-xs text-slate-700">
                  <span className="font-semibold text-slate-800">{row.group} <span className="text-[10px] text-slate-400 font-normal">({formatMoney(row.rmQty + row.wipQty + row.fgQty)} กก.)</span></span>
                  <span className="font-mono font-bold">{formatMoney(value)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div className={`h-2 rounded-full ${colors[index % colors.length]} transition-all`} style={{ width: `${Math.max(2, value / maxGroup * 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return <div className="flex justify-between items-center"><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-sm ${color}`} />{label}</span><span className="font-bold text-slate-900 font-mono">{formatMoney(value)}</span></div>
}


function MatrixTable({ byStatus, isLoading, matrixRows, totalMatrixRows, totalQty, totalValue }: { byStatus: StatusSummary[]; isLoading: boolean; matrixRows: MatrixRow[]; totalMatrixRows: number; totalQty: number; totalValue: number }) {
  const valueFor = (status: string) => byStatus.find((item) => item.status === status) ?? { count: 0, qty: 0, status, value: 0 }
  return (
    <>
      {/* Desktop View (Table) */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200/85 bg-white shadow-sm">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-600 font-medium">
            <tr>
              <th className="p-3.5 text-left">หมวดสินค้า</th>
              <th className="bg-blue-50/40 p-3.5 text-right text-blue-800 border-x border-slate-100">📦 RM (กก.)</th>
              <th className="bg-blue-50/40 p-3.5 text-right text-blue-800 border-r border-slate-100">RM มูลค่า</th>
              <th className="bg-amber-50/40 p-3.5 text-right text-amber-800 border-r border-slate-100">⚙️ WIP (กก.)</th>
              <th className="bg-amber-50/40 p-3.5 text-right text-amber-800 border-r border-slate-100">WIP มูลค่า</th>
              <th className="bg-emerald-50/40 p-3.5 text-right text-emerald-800 border-r border-slate-100">✅ FG (กก.)</th>
              <th className="bg-emerald-50/40 p-3.5 text-right text-emerald-800 border-r border-slate-100">FG มูลค่า</th>
              <th className="p-3.5 text-right">รวม กก.</th>
              <th className="p-3.5 text-right">รวมมูลค่า</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
            {isLoading ? <tr><td className="p-8 text-center text-slate-400" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && matrixRows.map((row) => (
              <tr key={row.group} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-3.5 text-slate-800">{row.group}</td>
                <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-x border-slate-100">{row.rmQty ? formatMoney(row.rmQty) : '-'}</td>
                <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-r border-slate-100">{row.rmVal ? formatMoney(row.rmVal) : '-'}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100">{row.wipQty ? formatMoney(row.wipQty) : '-'}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100">{row.wipVal ? formatMoney(row.wipVal) : '-'}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100">{row.fgQty ? formatMoney(row.fgQty) : '-'}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100">{row.fgVal ? formatMoney(row.fgVal) : '-'}</td>
                <td className="p-3.5 text-right">{formatMoney(row.rmQty + row.wipQty + row.fgQty)}</td>
                <td className="p-3.5 text-right text-emerald-700">{formatMoney(row.rmVal + row.wipVal + row.fgVal)}</td>
              </tr>
            ))}
            {!isLoading && matrixRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={9}>ไม่มีสต๊อก</td></tr> : null}
          </tbody>
          {matrixRows.length ? (
            <tfoot className="bg-slate-50 border-t border-slate-200/80 font-bold text-slate-800">
              <tr>
                <td className="p-3.5">รวมทั้งหมด ({totalMatrixRows} หมวด)</td>
                <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-x border-slate-100">{formatMoney(valueFor('RM').qty)}</td>
                <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-r border-slate-100">{formatMoney(valueFor('RM').value)}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100">{formatMoney(valueFor('WIP').qty)}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100">{formatMoney(valueFor('WIP').value)}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100">{formatMoney(valueFor('FG').qty)}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100">{formatMoney(valueFor('FG').value)}</td>
                <td className="p-3.5 text-right">{formatMoney(totalQty)}</td>
                <td className="p-3.5 text-right text-base text-emerald-700 font-mono">{formatMoney(totalValue)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {/* Mobile View (Card List) */}
      <div className="lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm text-xs">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && matrixRows.map((row) => {
          const totalRowQty = row.rmQty + row.wipQty + row.fgQty
          const totalRowVal = row.rmVal + row.wipVal + row.fgVal
          return (
            <div key={row.group} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <div className="border-b border-slate-100 pb-2">
                <span className="font-semibold text-slate-800 text-sm">{row.group}</span>
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between items-center bg-blue-50/50 p-2 rounded-lg">
                  <span className="font-medium text-blue-800">📦 RM (วัตถุดิบ)</span>
                  <span className="font-semibold text-right text-blue-700 tabular-nums">
                    {row.rmQty ? `${formatMoney(row.rmQty)} กก.` : '-'} {row.rmVal ? `(${formatMoney(row.rmVal)} บ.)` : ''}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-amber-50/50 p-2 rounded-lg">
                  <span className="font-medium text-amber-800">⚙️ WIP (ระหว่างผลิต)</span>
                  <span className="font-semibold text-right text-amber-700 tabular-nums">
                    {row.wipQty ? `${formatMoney(row.wipQty)} กก.` : '-'} {row.wipVal ? `(${formatMoney(row.wipVal)} บ.)` : ''}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-emerald-50/50 p-2 rounded-lg">
                  <span className="font-medium text-emerald-800">✅ FG (สินค้าสำเร็จรูป)</span>
                  <span className="font-semibold text-right text-emerald-700 tabular-nums">
                    {row.fgQty ? `${formatMoney(row.fgQty)} กก.` : '-'} {row.fgVal ? `(${formatMoney(row.fgVal)} บ.)` : ''}
                  </span>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs font-bold text-slate-800">
                <span>รวมทั้งสิ้น</span>
                <span className="tabular-nums">
                  {formatMoney(totalRowQty)} กก. | <span className="text-emerald-700">{formatMoney(totalRowVal)} บาท</span>
                </span>
              </div>
            </div>
          )
        })}
        {!isLoading && matrixRows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm text-xs">ไม่มีสต๊อก</div>
        ) : null}

        {/* Mobile Footer Summary */}
        {!isLoading && matrixRows.length ? (
          <div className="rounded-xl border border-slate-200 bg-slate-900 text-white p-4 shadow-sm space-y-2.5">
            <div className="border-b border-slate-800 pb-2 text-xs font-bold text-slate-400">
              รวมทั้งหมด ({totalMatrixRows} หมวด)
            </div>
            <div className="text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-400">RM:</span>
                <span className="font-semibold text-blue-300 tabular-nums">{formatMoney(valueFor('RM').qty)} กก. ({formatMoney(valueFor('RM').value)} บ.)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">WIP:</span>
                <span className="font-semibold text-amber-300 tabular-nums">{formatMoney(valueFor('WIP').qty)} กก. ({formatMoney(valueFor('WIP').value)} บ.)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">FG:</span>
                <span className="font-semibold text-emerald-300 tabular-nums">{formatMoney(valueFor('FG').qty)} กก. ({formatMoney(valueFor('FG').value)} บ.)</span>
              </div>
            </div>
            <div className="border-t border-slate-800 pt-2 flex justify-between text-xs font-bold">
              <span>รวมสะสมสุทธิ</span>
              <span className="tabular-nums text-emerald-400">{formatMoney(totalQty)} กก. | {formatMoney(totalValue)} บาท</span>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

function DetailTable({ isLoading, onOpen, rows }: { isLoading: boolean; onOpen: (row: BalanceRow) => void; rows: DisplayBalanceRow[] }) {
  return (
    <>
      {/* Mobile View */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm text-xs">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && rows.map((row) => (
          <div 
            key={row.key} 
            className={`space-y-3 rounded-xl border p-4 shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${row.qty < 0 ? 'border-red-200 bg-red-50/10' : 'border-slate-200 bg-white'}`}
            role="button"
            tabIndex={0}
            onClick={() => onOpen(primarySourceRow(row))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onOpen(primarySourceRow(row))
              }
            }}
          >
            <div className="flex justify-between items-start border-b border-slate-100 pb-2">
              <div>
                <span className="text-[10px] text-slate-400 block">{row.productCode}</span>
                <span className="font-bold text-slate-800 text-xs">{row.productName}</span>
                {row.lotNo && row.lotNo !== '-' ? (
                  <div className="text-[10px] text-slate-400 mt-0.5">Lot: {row.lotNo}</div>
                ) : null}
              </div>
              <StockStatusCell row={row} />
            </div>
            <div className="flex items-center justify-between gap-3 text-[11px] text-slate-650">
              <span>สถานะสินค้า:</span>
              <StockStateCell className="justify-end" row={row} />
            </div>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-slate-650">
              <div className="flex justify-between">
                <span>หมวด:</span>
                <span className="font-semibold text-slate-800">{row.productMetalGroup || 'อื่นๆ'}</span>
              </div>
              <div className="flex justify-between">
                <span>สาขา:</span>
                <span className="font-semibold text-slate-850 truncate max-w-[100px]">{row.branchName}</span>
              </div>
              <div className="flex justify-between">
                <span>คงเหลือ:</span>
                <span className={`font-semibold tabular-nums ${row.qty < 0 ? 'text-red-650' : 'text-slate-800'}`}>{formatMoney(row.qty)} กก.</span>
              </div>
              <div className="flex justify-between">
                <span>รอเข้า:</span>
                <span className="font-semibold text-slate-800 tabular-nums">{row.awaitingBillQty ? `${formatMoney(row.awaitingBillQty)} กก.` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>รอออก:</span>
                <span className="font-semibold text-amber-700 tabular-nums">{row.onHoldQty ? `${formatMoney(row.onHoldQty)} กก.` : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span>พร้อมส่ง:</span>
                <span className="font-semibold text-emerald-750 tabular-nums">{formatMoney(row.readyQty)} กก.</span>
              </div>
              <div className="flex justify-between">
                <span>ต้นทุน/กก.:</span>
                <span className="font-semibold text-slate-700 font-mono">{formatMoney(row.avgCost)} บ.</span>
              </div>
            </div>
            
            <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs">
              <span className="font-bold text-slate-850">มูลค่า: <span className="text-emerald-700 font-mono font-bold">{formatMoney(row.value)} บาท</span></span>
              <span className="text-[10px] text-slate-400">กดเพื่อดูรายละเอียด</span>
            </div>
          </div>
        ))}
        {!isLoading && rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm text-xs">ไม่มีสต๊อก</div>
        ) : null}
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200/85 bg-white shadow-sm">
        <table className="w-full min-w-[1400px] text-sm text-slate-700">
          <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-650 font-medium">
            <tr>
              <th className="p-3.5 text-left">สินค้า</th>
              <th className="p-3.5 text-left">หมวด</th>
              <th className="p-3.5 text-center">ประเภทคลัง</th>
              <th className="p-3.5 text-left">สถานะสินค้า</th>
              <th className="p-3.5 text-left">สาขา</th>
              <th className="p-3.5 text-right">คงเหลือ (กก.)</th>
              <th className="p-3.5 text-right border-r border-slate-100">รอเข้า</th>
              <th className="bg-amber-50/40 p-3.5 text-right text-amber-805 border-r border-slate-100">รอออก</th>
              <th className="bg-emerald-50/40 p-3.5 text-right text-emerald-805 border-r border-slate-100">พร้อมส่ง</th>
              <th className="p-3.5 text-right">ต้นทุน/กก.</th>
              <th className="p-3.5 text-right">มูลค่า</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-semibold">
            {isLoading ? <tr><td className="p-8 text-center text-slate-400" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr
                key={row.key}
                className={`cursor-pointer transition-colors focus-visible:outline-none ${row.qty < 0 ? 'bg-red-50/30 hover:bg-red-50/60 focus-visible:bg-red-50/60' : 'hover:bg-slate-50/50 focus-visible:bg-slate-50'}`}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(primarySourceRow(row))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpen(primarySourceRow(row))
                  }
                }}
              >
                <td className="p-3.5 text-slate-800">
                  <span className="text-slate-500">{row.productCode}</span> {row.productName}
                  {row.lotNo && row.lotNo !== '-' ? (
                    <div className="mt-0.5 text-xs font-normal text-slate-400">Lot: {row.lotNo}</div>
                  ) : null}
                </td>
                <td className="p-3.5 text-slate-800">{row.productMetalGroup || 'อื่นๆ'}</td>
                <td className="p-3.5 text-center"><StockStatusCell row={row} /></td>
                <td className="p-3.5"><StockStateCell row={row} /></td>
                <td className="p-3.5 text-slate-650 max-w-[160px] truncate" title={row.branchName}>
                  {row.branchName}
                </td>
                <td className={`p-3.5 text-right ${row.qty < 0 ? 'text-red-650' : ''}`}>{formatMoney(row.qty)}</td>
                <td className="p-3.5 text-right border-r border-slate-100 text-slate-800">{row.awaitingBillQty ? formatMoney(row.awaitingBillQty) : '-'}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100">{row.onHoldQty ? formatMoney(row.onHoldQty) : '-'}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100">{formatMoney(row.readyQty)}</td>
                <td className="p-3.5 text-right text-slate-500 font-mono">{formatMoney(row.avgCost)}</td>
                <td className="p-3.5 text-right text-emerald-700 font-mono">{formatMoney(row.value)}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={11}>ไม่มีสต๊อก</td></tr> : null}
          </tbody>
          {rows.length ? (
            <tfoot className="bg-slate-50 border-t border-slate-200/80 font-bold text-slate-800">
              <tr>
                <td className="p-3.5" colSpan={5}>รวมหน้านี้ ({rows.length} รายการ)</td>
                <td className="p-3.5 text-right font-mono">{formatMoney(rows.reduce((sum, row) => sum + row.qty, 0))}</td>
                <td className="p-3.5 text-right border-r border-slate-100 font-mono text-slate-800">{formatMoney(rows.reduce((sum, row) => sum + row.awaitingBillQty, 0))}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100 font-mono">{formatMoney(rows.reduce((sum, row) => sum + row.onHoldQty, 0))}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100 font-mono">{formatMoney(rows.reduce((sum, row) => sum + row.readyQty, 0))}</td>
                <td />
                <td className="p-3.5 text-right text-emerald-700 font-mono">{formatMoney(rows.reduce((sum, row) => sum + row.value, 0))}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </>
  )
}

function PaginationControls({
  currentPage,
  label,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number
  label: string
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}) {
  if (totalItems === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
      <span>
        พบทั้งหมด {totalItems.toLocaleString('th-TH')} {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="จำนวนรายการต่อหน้า"
          className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
        </select>
        <button
          className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          disabled={currentPage <= 1}
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          ก่อนหน้า
        </button>
        <span className="px-1 text-sm font-medium">
          หน้า {currentPage.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}
        </span>
        <button
          className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          disabled={currentPage >= totalPages}
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          ถัดไป
        </button>
      </div>
    </div>
  )
}

function StockTypeText({ status }: { status: string }) {
  return <span className="text-xs font-semibold text-slate-700">{status || '-'}</span>
}

function StockStateIndicator({ state }: { state: 'on_hand' | 'pending_in' | 'pending_out' }) {
  const meta = state === 'on_hand'
    ? { className: 'text-emerald-700', label: 'คงเหลือ' }
    : state === 'pending_in'
      ? { className: 'text-sky-700', label: 'รอเข้า' }
      : { className: 'text-amber-700', label: 'รอออก' }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${meta.className}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  )
}

function StockStatusCell({ row }: { row: BalanceRow }) {
  return (
    <div className="flex flex-wrap justify-center gap-1 shrink-0">
      <StockTypeText status={row.status} />
    </div>
  )
}

function StockStateCell({ className = '', row }: { className?: string; row: BalanceRow }) {
  const states = stockStatesForRow(row)
  if (!states.length) return <span className="text-xs text-slate-400">-</span>
  return (
    <div className={`flex flex-wrap gap-x-2 gap-y-1 ${className}`}>
      {states.map((state) => <StockStateIndicator key={state} state={state} />)}
    </div>
  )
}

function stockStatusText(row: BalanceRow) {
  return row.status || '-'
}

function stockStateText(row: BalanceRow) {
  const states = stockStatesForRow(row)
  if (!states.length) return '-'
  return states.map((state) => state === 'pending_out' ? 'รอออก' : state === 'pending_in' ? 'รอเข้า' : 'คงเหลือ').join(' / ')
}

function stockStatesForRow(row: BalanceRow): Array<'on_hand' | 'pending_in' | 'pending_out'> {
  const states: Array<'on_hand' | 'pending_in' | 'pending_out'> = []
  if (row.qty > 0) states.push('on_hand')
  if (row.onHoldQty > 0) states.push('pending_out')
  if (row.awaitingBillQty > 0) states.push('pending_in')
  return states
}
