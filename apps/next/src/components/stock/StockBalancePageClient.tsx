'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
}

type BalancePayload = {
  byStatus: Array<{ count: number; qty: number; status: string; value: number }>
  reference: { branches: StockOption[]; products: StockOption[]; warehouses: StockOption[] }
  rows: BalanceRow[]
  summary: { availableQty: number; availableValue: number; count: number; negativeRows: number; notAvailableQty: number; notAvailableValue: number; onHoldQty: number; qty: number; readyQty: number; value: number }
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

const ON_HOLD_STATUS = 'ON_HOLD'

export function StockBalancePageClient() {
  const [branchId, setBranchId] = useState('')
  const [data, setData] = useState<BalancePayload | null>(null)
  const [detailRow, setDetailRow] = useState<BalanceRow | null>(null)
  const [detailData, setDetailData] = useState<BalanceDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [group, setGroup] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [productId, setProductId] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [viewMode, setViewMode] = useState<'detail' | 'summary'>('summary')
  const [warehouseId, setWarehouseId] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

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
    setQ('')
    setBranchId('')
    setProductId('')
    setWarehouseId('')
    setStatus('')
    setGroup('')
  }, [])

  const hasFilters = useMemo(() => {
    return Boolean(q.trim() || branchId || productId || warehouseId || status || group)
  }, [q, branchId, productId, warehouseId, status, group])

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      
      {/* Metric Cards */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-6 text-sm">
        <Metric emoji="⚖️" iconBg="bg-blue-100 text-blue-700" label="น้ำหนักสต๊อกรวม" value={`${formatMoney(summary.qty)} กก.`} tone="blue" />
        <Metric emoji="💰" iconBg="bg-emerald-100 text-emerald-700" label="มูลค่าสต๊อกรวม" value={formatMoney(summary.value)} tone="emerald" />
        <Metric emoji="⏳" iconBg="bg-amber-100 text-amber-700" label="จองไว้" sub="จาก WTO ที่ยังไม่ออกบิล" value={`${formatMoney(summary.onHoldQty)} กก.`} tone="amber" />
        <Metric emoji="✅" iconBg="bg-emerald-100 text-emerald-700" label="พร้อมส่ง" sub={`${summary.availableQty > 0 ? (summary.readyQty / summary.availableQty * 100).toFixed(1) : '0'}% ของ Stock ที่พร้อมขาย`} value={`${formatMoney(summary.readyQty)} กก.`} tone="emerald" />
        <Metric emoji="⚠️" iconBg="bg-red-100 text-red-700" label="ไม่พร้อมขาย" sub={`${summary.value > 0 ? (summary.notAvailableValue / summary.value * 100).toFixed(1) : '0'}% ของ Stock`} value={formatMoney(summary.notAvailableValue)} tone="red" />
        <Metric emoji="📊" iconBg="bg-slate-100 text-slate-700" label="ราคา/กก. เฉลี่ย" value={formatMoney(averageCost)} />
      </div>

      {/* Status Cards */}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
        {byStatus.map((item, index) => (
          <div key={item.status} className={index === 2 ? 'col-span-2 md:col-span-1' : ''}>
            <StatusCard item={item} />
          </div>
        ))}
      </div>

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden md:block mb-3 space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input 
            className="min-w-[200px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm h-9" 
            placeholder="ค้นหารหัส/ชื่อสินค้า/Lot/สาขา/คลัง/หมวด..." 
            type="search" 
            value={q} 
            onChange={(event) => setQ(event.target.value)} 
          />
          
          <div className="min-w-64">
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
          {productId ? (
            <button className="rounded-md bg-slate-100 px-2 py-1.5 text-xs hover:bg-slate-200 h-9 flex items-center" type="button" onClick={() => setProductId('')}>
              ✕ ล้างสินค้า
            </button>
          ) : null}

          {hasFilters ? (
            <button className="rounded-md bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200 h-9" type="button" onClick={resetFilters}>
              ✕ ล้างทั้งหมด
            </button>
          ) : null}
          
          <button className="h-9 rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={() => void loadData()}>
            โหลดใหม่
          </button>
          
          <button className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 h-9 flex items-center" type="button" onClick={exportXlsx}>
            ส่งออก Excel
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500">รูปแบบแสดงผล:</span>
          <MatchButton active={viewMode === 'summary'} label="Matrix (กลุ่ม × คลัง)" onClick={() => setViewMode('summary')} />
          <MatchButton active={viewMode === 'detail'} label="รายสินค้า" onClick={() => setViewMode('detail')} />

          <span className="text-xs text-slate-500 ml-4">หมวดสินค้า:</span>
          <select className="h-7 rounded-md border border-slate-300 px-2 py-0.5 text-xs bg-white text-slate-800" value={group} onChange={(event) => setGroup(event.target.value)}>
            <option value="">ทุกหมวด</option>
            {groupOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>

          <span className="text-xs text-slate-500 ml-4">คลังสินค้า:</span>
          <select className="h-7 rounded-md border border-slate-300 px-2 py-0.5 text-xs bg-white text-slate-800" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">ทุกประเภท</option>
            <option value="RM">📦 RM</option>
            <option value="WIP">⚙️ WIP</option>
            <option value="FG">✅ FG</option>
            <option value={ON_HOLD_STATUS}>On Hold</option>
          </select>

          <span className="text-xs text-slate-500 ml-4">สาขา:</span>
          <select className="h-7 rounded-md border border-slate-300 px-2 py-0.5 text-xs bg-white text-slate-800" value={branchId} onChange={(event) => { setBranchId(event.target.value); setWarehouseId('') }}>
            <option value="">ทุกสาขา</option>
            {data?.reference.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>

          <span className="text-xs text-slate-500 ml-4">คลัง:</span>
          <select className="h-7 rounded-md border border-slate-300 px-2 py-0.5 text-xs bg-white text-slate-800" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
            <option value="">ทุกคลัง</option>
            {data?.reference.warehouses.filter((item) => !branchId || item.branchId === branchId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-3 space-y-2 rounded-md bg-white p-3 shadow md:hidden">
        <div className="flex gap-2 items-center">
          <input 
            className="min-w-[150px] flex-1 rounded-md border border-slate-300 px-3 h-9 text-sm" 
            placeholder="ค้นหาด่วน..." 
            type="search" 
            value={q} 
            onChange={(event) => setQ(event.target.value)} 
          />
          <button className="h-9 rounded-md bg-slate-100 px-2.5 text-xs text-slate-700" type="button" onClick={() => void loadData()}>
            โหลดใหม่
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {hasFilters ? '(มี)' : ''}
          </button>
        </div>
        
        <div className="flex gap-2 border-t border-slate-100 pt-2">
          <button 
            className={`flex-1 h-8 rounded-md text-xs font-semibold ${viewMode === 'summary' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`} 
            onClick={() => setViewMode('summary')}
          >
             Matrix
          </button>
          <button 
            className={`flex-1 h-8 rounded-md text-xs font-semibold ${viewMode === 'detail' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`} 
            onClick={() => setViewMode('detail')}
          >
             รายสินค้า
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 md:hidden">
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
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ค้นหาสินค้า</span>
                <SearchCombobox
                  hideLabel
                  inputClassName="h-10 text-sm"
                  inputId="stock-balance-product-search-mobile"
                  label="สินค้า"
                  options={productOptions}
                  placeholder="ค้นหารหัสหรือชื่อสินค้า"
                  value={productId}
                  onChange={setProductId}
                />
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">หมวดสินค้า</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={group} onChange={(event) => setGroup(event.target.value)}>
                  <option value="">ทุกหมวด</option>
                  {groupOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">ประเภทคลัง</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={status} onChange={(event) => setStatus(event.target.value)}>
                  <option value="">ทุกประเภท</option>
                  <option value="RM">📦 RM</option>
                  <option value="WIP">⚙️ WIP</option>
                  <option value="FG">✅ FG</option>
                  <option value={ON_HOLD_STATUS}>On Hold</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">สาขา</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={branchId} onChange={(event) => { setBranchId(event.target.value); setWarehouseId('') }}>
                  <option value="">ทุกสาขา</option>
                  {data?.reference.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">คลังย่อย</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                  <option value="">ทุกคลัง</option>
                  {data?.reference.warehouses.filter((item) => !branchId || item.branchId === branchId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  resetFilters()
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                className="h-11 rounded-md bg-slate-900 text-sm font-semibold text-white hover:bg-slate-850"
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

      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>พบทั้งหมด {filteredRows.length} รายการ / สต๊อกติดลบ {summary.negativeRows} รายการ</span>
      </div>

      {viewMode === 'summary' ? (
        <>
          <StockCharts byStatus={byStatus} matrixRows={matrixRows} totalValue={summary.value} />
          <MatrixTable byStatus={byStatus} isLoading={isLoading} matrixRows={matrixRows} totalQty={summary.qty} totalValue={summary.value} />
        </>
      ) : (
        <DetailTable isLoading={isLoading} onOpen={setDetailRow} rows={filteredRows} />
      )}

      <Dialog open={!!detailRow} onOpenChange={(open) => { if (!open) setDetailRow(null) }}>
        <DialogContent className="max-w-xl !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 animate-fade-in" hideClose>
          <div className="flex items-center justify-between bg-slate-900 text-white px-5 py-4 shrink-0 border-b border-slate-800">
            <h3 className="font-bold text-slate-100 text-[16px]">รายละเอียดสต๊อกคงเหลือ</h3>
            <button className="text-2xl text-slate-400 hover:text-white" type="button" onClick={() => setDetailRow(null)}>&times;</button>
          </div>
          
          {detailRow ? (
            <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-5 space-y-4 text-sm">
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-2">ข้อมูลสินค้า</h4>
                <Info label="สินค้า" value={`${detailRow.productCode} - ${detailRow.productName}`} />
                <Info label="ประเภทคลัง" value={stockStatusText(detailRow)} />
                <Info label="สาขา / คลัง" value={`${detailRow.branchName} / ${detailRow.warehouseName}`} />
                <Info label="Lot" value={detailRow.lotNo || '-'} mono />
                <Info label="วันที่ล่าสุด" value={detailRow.lastDate} />
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-2">จำนวนและมูลค่าสต๊อก</h4>
                <Info label="คงเหลือสุทธิ" value={`${formatMoney(detailRow.qty)} กก.`} tone={detailRow.qty < 0 ? 'red' : 'emerald'} />
                <Info label="จองไว้ (WTO)" value={`${formatMoney(detailRow.onHoldQty)} กก.`} tone="amber" />
                <Info label="พร้อมส่ง / พร้อมขาย" value={`${formatMoney(detailRow.readyQty)} กก.`} tone="emerald" />
                <Info label="ต้นทุนเฉลี่ย (WAC)" value={`${formatMoney(detailRow.avgCost)} บาท`} />
                <Info label="มูลค่ารวม" value={`${formatMoney(detailRow.value)} บาท`} tone="emerald" />
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <h4 className="text-sm font-bold text-slate-800">Drilldown</h4>
                  <a className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800" href={ledgerLinkFor(detailRow)}>
                    เปิด Stock Ledger
                  </a>
                </div>
                {isDetailLoading ? <div className="py-4 text-center text-xs text-slate-500">กำลังโหลดรายละเอียด</div> : null}
                {detailError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{detailError}</div> : null}
                {!isDetailLoading && !detailError ? (
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 text-xs font-bold text-amber-700">WTO Hold ที่ยัง active ({detailData?.holds.length ?? 0})</div>
                      <div className="max-h-40 overflow-auto rounded-md border border-slate-100">
                        <table className="w-full text-xs">
                          <thead className="bg-amber-50 text-slate-600"><tr><th className="p-2 text-left">WTO</th><th className="p-2 text-left">ลูกค้า</th><th className="p-2 text-right">Qty</th><th className="p-2 text-left">Held</th></tr></thead>
                          <tbody>
                            {detailData?.holds.map((hold) => (
                              <tr key={hold.holdKey} className="border-t">
                                <td className="p-2 font-mono">{hold.sourceDocNo}{hold.sourceLineNo ? ` #${hold.sourceLineNo}` : ''}</td>
                                <td className="p-2">{hold.customerCode ? `${hold.customerCode} · ` : ''}{hold.customerName}</td>
                                <td className="p-2 text-right font-semibold text-amber-700">{formatMoney(hold.qty)}</td>
                                <td className="p-2">{formatDateTime(hold.heldAt)}</td>
                              </tr>
                            ))}
                            {!detailData?.holds.length ? <tr><td className="p-3 text-center text-slate-400" colSpan={4}>ไม่มี active hold ใน bucket นี้</td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-xs font-bold text-slate-700">Movement ล่าสุด ({detailData?.ledgerRows.length ?? 0})</div>
                      <div className="max-h-48 overflow-auto rounded-md border border-slate-100">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-600"><tr><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">Ref</th><th className="p-2 text-right">เข้า</th><th className="p-2 text-right">ออก</th><th className="p-2 text-left">วันที่ทำ</th></tr></thead>
                          <tbody>
                            {detailData?.ledgerRows.map((ledger) => (
                              <tr key={ledger.id} className="border-t">
                                <td className="p-2">{ledger.date}</td>
                                <td className="p-2 font-mono">{ledger.refType}:{ledger.refNo || '-'}</td>
                                <td className="p-2 text-right text-emerald-700">{ledger.qtyIn ? formatMoney(ledger.qtyIn) : '-'}</td>
                                <td className="p-2 text-right text-red-700">{ledger.qtyOut ? formatMoney(ledger.qtyOut) : '-'}</td>
                                <td className="p-2">{formatDateTime(ledger.createdAt)}</td>
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

          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
            <button 
              className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50 animate-fade-in" 
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

type StatusSummary = { count: number; qty: number; status: string; value: number }

type MatrixRow = { fgQty: number; fgVal: number; group: string; rmQty: number; rmVal: number; wipQty: number; wipVal: number }

function Info({
  label,
  mono,
  tone,
  value,
}: {
  label: string
  mono?: boolean
  tone?: string
  value: string
}) {
  const valueColor = tone === 'red'
    ? 'text-red-600 font-bold'
    : tone === 'emerald'
      ? 'text-emerald-700 font-bold'
      : tone === 'amber'
        ? 'text-amber-700 font-bold'
        : 'text-slate-900 font-medium'
  const fontClass = mono ? 'font-mono' : ''
  return (
    <div className="flex border-b py-1.5">
      <span className="w-36 text-slate-500 shrink-0">{label}</span>
      <span className={`${valueColor} ${fontClass} break-all`}>{value}</span>
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
  const idleClass = tone === 'amber' ? 'border-slate-300 bg-white hover:bg-amber-50' : tone === 'emerald' ? 'border-slate-300 bg-white hover:bg-emerald-50' : tone === 'red' ? 'border-slate-300 bg-white hover:bg-red-50' : 'border-slate-300 bg-white hover:bg-slate-100'
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? activeClass : idleClass}`} type="button" onClick={onClick}>{label}</button>
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
          <div className="flex h-[180px] w-[180px] items-center justify-center rounded-full" style={{ background: totalValue > 0 ? `conic-gradient(#3b82f6 0deg ${rmDeg}deg, #f59e0b ${rmDeg}deg ${rmDeg + wipDeg}deg, #10b981 ${rmDeg + wipDeg}deg 360deg)` : '#e5e7eb' }}>
            <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white text-center">
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
                <div className="h-2 w-full rounded-full bg-slate-100"><div className={`h-2 rounded-full bg-gradient-to-r ${colors[index % colors.length]}`} style={{ width: `${Math.max(2, value / maxGroup * 100)}%` }} /></div>
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
