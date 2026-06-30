'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
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

function SegmentedButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`rounded-md border px-3.5 py-1.5 text-sm font-semibold ${
        active ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
      } outline-none focus:outline-none`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
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
    lotNo: string
    pendingOutKey: string
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
  const [isLoading, setIsLoading] = useState(true)
  const [productId, setProductId] = useState('')
  const [stockTypes, setStockTypes] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'detail' | 'summary'>('summary')
  const [detailPage, setDetailPage] = useState(1)
  const [detailPageSize, setDetailPageSize] = useState(25)
  const [matrixPage, setMatrixPage] = useState(1)
  const [matrixPageSize, setMatrixPageSize] = useState(25)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [detailSortKey, setDetailSortKey] = useState<string>('')
  const [detailSortDirection, setDetailSortDirection] = useState<'asc' | 'desc'>('desc')
  const [matrixSortKey, setMatrixSortKey] = useState<string>('')
  const [matrixSortDirection, setMatrixSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleDetailSort = useCallback((key: string) => {
    if (detailSortKey === key) {
      setDetailSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setDetailSortKey(key)
      setDetailSortDirection('desc')
    }
  }, [detailSortKey])

  const handleMatrixSort = useCallback((key: string) => {
    if (matrixSortKey === key) {
      setMatrixSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setMatrixSortKey(key)
      setMatrixSortDirection('desc')
    }
  }, [matrixSortKey])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (branchId) params.set('branchId', branchId)
      if (productId) params.set('productId', productId)
      if (stockTypes.length > 0) params.set('status', stockTypes.join(','))
      setData(await dailyFetchJson<BalancePayload>(`/api/stock/balance?${params.toString()}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดสต๊อกคงเหลือไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [branchId, productId, stockTypes])

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
  }, [data?.rows, group])

  const displayRows = useMemo<DisplayBalanceRow[]>(() => {
    const grouped = new Map<string, DisplayBalanceRow>()

    for (const row of filteredRows) {
      const groupKey = [
        row.productId,
        row.branchId,
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
    const groups = new Map<string, MatrixRow>()
    for (const row of filteredRows) {
      const key = row.productMetalGroup || 'อื่นๆ'
      const current = groups.get(key) ?? { fgQty: 0, fgVal: 0, group: key, products: [], rmQty: 0, rmVal: 0, wipQty: 0, wipVal: 0 }
      let product = current.products.find((item) => item.productId === row.productId)
      if (!product) {
        product = {
          fgQty: 0,
          fgVal: 0,
          productCode: row.productCode,
          productId: row.productId,
          productName: row.productName,
          rmQty: 0,
          rmVal: 0,
          wipQty: 0,
          wipVal: 0,
        }
        current.products.push(product)
      }      if (row.status === 'FG') {
        current.fgQty += row.qty
        current.fgVal += row.value
        product.fgQty += row.qty
        product.fgVal += row.value
      } else if (row.status === 'WIP') {
        current.wipQty += row.qty
        current.wipVal += row.value
        product.wipQty += row.qty
        product.wipVal += row.value
      } else {
        current.rmQty += row.qty
        current.rmVal += row.value
        product.rmQty += row.qty
        product.rmVal += row.value
      }
      groups.set(key, current)
    }
    return Array.from(groups.values())
      .map((row) => ({
        ...row,
        products: row.products.sort((a, b) => matrixProductValue(b) - matrixProductValue(a)),
      }))
      .sort((a, b) => matrixRowValue(b) - matrixRowValue(a))
  }, [filteredRows])

  const sortedDisplayRows = useMemo(() => {
    if (!detailSortKey) return displayRows

    return [...displayRows].sort((a, b) => {
      let valA: any
      let valB: any

      switch (detailSortKey) {
        case 'product':
          valA = `${a.productCode ?? ''} ${a.productName ?? ''}`
          valB = `${b.productCode ?? ''} ${b.productName ?? ''}`
          break
        case 'group':
          valA = a.productMetalGroup ?? ''
          valB = b.productMetalGroup ?? ''
          break
        case 'warehouse':
          valA = a.status ?? ''
          valB = b.status ?? ''
          break
        case 'branch':
          valA = a.branchName ?? ''
          valB = b.branchName ?? ''
          break
        case 'qty':
          valA = a.qty
          valB = b.qty
          break
        case 'awaitingBill':
          valA = a.awaitingBillQty
          valB = b.awaitingBillQty
          break
        case 'onHold':
          valA = a.onHoldQty
          valB = b.onHoldQty
          break
        case 'ready':
          valA = a.readyQty
          valB = b.readyQty
          break
        case 'avgCost':
          valA = a.avgCost
          valB = b.avgCost
          break
        case 'value':
          valA = a.value
          valB = b.value
          break
        default:
          return 0
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return detailSortDirection === 'asc'
          ? valA.localeCompare(valB, 'th')
          : valB.localeCompare(valA, 'th')
      } else {
        const numA = Number(valA) || 0
        const numB = Number(valB) || 0
        return detailSortDirection === 'asc' ? numA - numB : numB - numA
      }
    })
  }, [displayRows, detailSortKey, detailSortDirection])

  const sortedMatrixRows = useMemo(() => {
    const sortProducts = (products: MatrixProductRow[]) => {
      if (!matrixSortKey) {
        return [...products].sort((a, b) => matrixProductValue(b) - matrixProductValue(a))
      }
      return [...products].sort((a, b) => {
        let valA: any
        let valB: any

        switch (matrixSortKey) {
          case 'group':
          case 'product':
            valA = a.productName
            valB = b.productName
            break
          case 'rmQty':
            valA = a.rmQty
            valB = b.rmQty
            break
          case 'rmVal':
            valA = a.rmVal
            valB = b.rmVal
            break
          case 'rmAvgCost':
            valA = a.rmQty !== 0 ? a.rmVal / a.rmQty : 0
            valB = b.rmQty !== 0 ? b.rmVal / b.rmQty : 0
            break
          case 'wipQty':
            valA = a.wipQty
            valB = b.wipQty
            break
          case 'wipVal':
            valA = a.wipVal
            valB = b.wipVal
            break
          case 'wipAvgCost':
            valA = a.wipQty !== 0 ? a.wipVal / a.wipQty : 0
            valB = b.wipQty !== 0 ? b.wipVal / b.wipQty : 0
            break
          case 'fgQty':
            valA = a.fgQty
            valB = b.fgQty
            break
          case 'fgVal':
            valA = a.fgVal
            valB = b.fgVal
            break
          case 'fgAvgCost':
            valA = a.fgQty !== 0 ? a.fgVal / a.fgQty : 0
            valB = b.fgQty !== 0 ? b.fgVal / b.fgQty : 0
            break
          case 'totalQty':
            valA = matrixProductQty(a)
            valB = matrixProductQty(b)
            break
          case 'totalValue':
            valA = matrixProductValue(a)
            valB = matrixProductValue(b)
            break
          case 'totalAvgCost':
            valA = matrixProductQty(a) !== 0 ? matrixProductValue(a) / matrixProductQty(a) : 0
            valB = matrixProductQty(b) !== 0 ? matrixProductValue(b) / matrixProductQty(b) : 0
            break
          default:
            return 0
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
          return matrixSortDirection === 'asc'
            ? valA.localeCompare(valB, 'th')
            : valB.localeCompare(valA, 'th')
        } else {
          const numA = Number(valA) || 0
          const numB = Number(valB) || 0
          return matrixSortDirection === 'asc' ? numA - numB : numB - numA
        }
      })
    }

    const mappedRows = matrixRows.map((row) => ({
      ...row,
      products: sortProducts(row.products),
    }))

    if (!matrixSortKey) return mappedRows

    return mappedRows.sort((a, b) => {
      let valA: any
      let valB: any

      switch (matrixSortKey) {
        case 'group':
          valA = a.group
          valB = b.group
          break
        case 'rmQty':
          valA = a.rmQty
          valB = b.rmQty
          break
        case 'rmVal':
          valA = a.rmVal
          valB = b.rmVal
          break
        case 'rmAvgCost':
          valA = a.rmQty !== 0 ? a.rmVal / a.rmQty : 0
          valB = b.rmQty !== 0 ? b.rmVal / b.rmQty : 0
          break
        case 'wipQty':
          valA = a.wipQty
          valB = b.wipQty
          break
        case 'wipVal':
          valA = a.wipVal
          valB = b.wipVal
          break
        case 'wipAvgCost':
          valA = a.wipQty !== 0 ? a.wipVal / a.wipQty : 0
          valB = b.wipQty !== 0 ? b.wipVal / b.wipQty : 0
          break
        case 'fgQty':
          valA = a.fgQty
          valB = b.fgQty
          break
        case 'fgVal':
          valA = a.fgVal
          valB = b.fgVal
          break
        case 'fgAvgCost':
          valA = a.fgQty !== 0 ? a.fgVal / a.fgQty : 0
          valB = b.fgQty !== 0 ? b.fgVal / b.fgQty : 0
          break
        case 'totalQty':
          valA = matrixRowQty(a)
          valB = matrixRowQty(b)
          break
        case 'totalValue':
          valA = matrixRowValue(a)
          valB = matrixRowValue(b)
          break
        case 'totalAvgCost':
          valA = matrixRowQty(a) !== 0 ? matrixRowValue(a) / matrixRowQty(a) : 0
          valB = matrixRowQty(b) !== 0 ? matrixRowValue(b) / matrixRowQty(b) : 0
          break
        default:
          return 0
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        return matrixSortDirection === 'asc'
          ? valA.localeCompare(valB, 'th')
          : valB.localeCompare(valA, 'th')
      } else {
        const numA = Number(valA) || 0
        const numB = Number(valB) || 0
        return matrixSortDirection === 'asc' ? numA - numB : numB - numA
      }
    })
  }, [matrixRows, matrixSortKey, matrixSortDirection])

  const detailTotalPages = Math.max(1, Math.ceil(displayRows.length / detailPageSize))
  const detailCurrentPage = Math.min(detailPage, detailTotalPages)
  const pagedDetailRows = useMemo(() => {
    const start = (detailCurrentPage - 1) * detailPageSize
    return sortedDisplayRows.slice(start, start + detailPageSize)
  }, [detailCurrentPage, detailPageSize, sortedDisplayRows])

  const matrixTotalPages = Math.max(1, Math.ceil(matrixRows.length / matrixPageSize))
  const matrixCurrentPage = Math.min(matrixPage, matrixTotalPages)
  const pagedMatrixRows = useMemo(() => {
    const start = (matrixCurrentPage - 1) * matrixPageSize
    return sortedMatrixRows.slice(start, start + matrixPageSize)
  }, [matrixCurrentPage, matrixPageSize, sortedMatrixRows])

  useEffect(() => {
    setDetailPage(1)
    setMatrixPage(1)
  }, [branchId, group, productId, stockTypes])
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
  const categoryOptions = useMemo<SearchComboboxOption[]>(() => groupOptions.map((cat) => ({
    id: cat,
    label: cat,
    searchText: cat,
  })), [groupOptions])
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
    if (stockTypes.length > 0) params.set('status', stockTypes.join(','))
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
    setStockTypes([])
    setGroup('')
  }, [])

  const toggleStockType = useCallback((type: string) => {
    if (type === '') {
      setStockTypes([])
    } else {
      setStockTypes((prev) =>
        prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
      )
    }
  }, [])

  const hasFilters = useMemo(() => {
    return Boolean(branchId || productId || stockTypes.length > 0 || group)
  }, [branchId, productId, stockTypes, group])
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

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
            <span className="text-sm text-slate-500">หมวดสินค้า:</span>
            <div className="min-w-[180px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 rounded-md border-slate-300 text-sm outline-none focus:border-slate-400 focus:ring-0"
                inputId="stock-balance-category-search"
                label="หมวดสินค้า"
                options={categoryOptions}
                placeholder="ค้นหาหมวดสินค้า"
                value={group}
                onChange={setGroup}
              />
            </div>
            {group ? (
              <button className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:ring-0" type="button" onClick={() => setGroup('')}>
                ✕
              </button>
            ) : null}

            <span className="ml-4 text-sm text-slate-500 mr-2">ประเภทคลัง:</span>
            <div className="flex items-center gap-3">
              <SegmentedButton active={stockTypes.length === 0} label="ทั้งหมด" onClick={() => toggleStockType('')} />
              <SegmentedButton active={stockTypes.includes('RM')} label="📦 RM" onClick={() => toggleStockType('RM')} />
              <SegmentedButton active={stockTypes.includes('WIP')} label="⚙️ WIP" onClick={() => toggleStockType('WIP')} />
              <SegmentedButton active={stockTypes.includes('FG')} label="✅ FG" onClick={() => toggleStockType('FG')} />
            </div>

            <span className="ml-4 text-sm text-slate-500">สาขา:</span>
            <select className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400 focus:ring-0" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">ทุกสาขา</option>
              {data?.reference.branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
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
              <div className="block">
                <span className="mb-1 block text-xs text-slate-500">หมวดสินค้า</span>
                <SearchCombobox
                  hideLabel
                  inputClassName="h-9 w-full rounded-md border-slate-300 text-sm outline-none focus:border-slate-400 focus:ring-0 animate-fade-in"
                  inputId="stock-balance-category-search-mobile"
                  label="หมวดสินค้า"
                  options={categoryOptions}
                  placeholder="ค้นหาหมวดสินค้า"
                  value={group}
                  onChange={setGroup}
                />
              </div>

              <div className="block">
                <span className="mb-1.5 block text-xs text-slate-500">ประเภทคลัง</span>
                <div className="flex flex-wrap gap-1.5">
                  <SegmentedButton active={stockTypes.length === 0} label="ทั้งหมด" onClick={() => toggleStockType('')} />
                  <SegmentedButton active={stockTypes.includes('RM')} label="📦 RM" onClick={() => toggleStockType('RM')} />
                  <SegmentedButton active={stockTypes.includes('WIP')} label="⚙️ WIP" onClick={() => toggleStockType('WIP')} />
                  <SegmentedButton active={stockTypes.includes('FG')} label="✅ FG" onClick={() => toggleStockType('FG')} />
                </div>
              </div>

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
          <MatrixTable byStatus={byStatus} isLoading={isLoading} matrixRows={pagedMatrixRows} sortDirection={matrixSortDirection} sortKey={matrixSortKey} totalMatrixRows={matrixRows.length} totalQty={summary.qty} totalValue={summary.value} onSort={handleMatrixSort} />
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
          <DetailTable isLoading={isLoading} rows={pagedDetailRows} sortDirection={detailSortDirection} sortKey={detailSortKey} onOpen={setDetailRow} onSort={handleDetailSort} />
        </>
      )}

      <Dialog open={!!detailRow} onOpenChange={(open) => { if (!open) setDetailRow(null) }}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-5xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 dark:bg-[#0f172a] border-0 animate-fade-in sm:w-[calc(100vw-2rem)] lg:min-w-[900px]" hideClose>
          <div className="flex items-center justify-between bg-slate-900 dark:bg-[#0f172a] text-white px-5 py-3 shrink-0 border-b border-slate-800 dark:border-slate-200">
            <h3 className="font-bold text-white text-[16px]">รายละเอียดสต๊อกคงเหลือ</h3>
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
                      <div className="mb-2 text-xs font-bold text-amber-700">pending_out จาก WTO ที่ยัง active ({detailData?.holds.length ?? 0})</div>
                      <div className="max-h-36 overflow-auto rounded-md border border-slate-100">
                        <table className="w-full text-xs">
                          <thead className="bg-amber-50 text-slate-600"><tr><th className="p-1.5 text-left">WTO</th><th className="p-1.5 text-left">ลูกค้า</th><th className="p-1.5 text-right">Qty</th><th className="p-1.5 text-left">Held</th></tr></thead>
                          <tbody>
                            {detailData?.holds.map((hold) => (
                              <tr key={hold.pendingOutKey} className="border-t">
                                <td className="p-1.5 font-mono">{hold.sourceDocNo}{hold.sourceLineNo ? ` #${hold.sourceLineNo}` : ''}</td>
                                <td className="p-1.5">{hold.customerCode ? `${hold.customerCode} · ` : ''}{hold.customerName}</td>
                                <td className="p-1.5 text-right font-semibold text-amber-700">{formatMoney(hold.qty)}</td>
                                <td className="p-1.5">{formatDateTime(hold.heldAt)}</td>
                              </tr>
                            ))}
                            {!detailData?.holds.length ? <tr><td className="p-3 text-center text-slate-400" colSpan={4}>ไม่มี active pending_out ใน bucket นี้</td></tr> : null}
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

type MatrixProductRow = { fgQty: number; fgVal: number; productCode: string; productId: string; productName: string; rmQty: number; rmVal: number; wipQty: number; wipVal: number }

type MatrixRow = { fgQty: number; fgVal: number; group: string; products: MatrixProductRow[]; rmQty: number; rmVal: number; wipQty: number; wipVal: number }

function matrixProductQty(row: MatrixProductRow) {
  return row.rmQty + row.wipQty + row.fgQty
}

function matrixProductValue(row: MatrixProductRow) {
  return row.rmVal + row.wipVal + row.fgVal
}

function matrixRowQty(row: MatrixRow) {
  return row.rmQty + row.wipQty + row.fgQty
}

function matrixRowValue(row: MatrixRow) {
  return row.rmVal + row.wipVal + row.fgVal
}

function StockDetailField({ className = '', label, mono, value }: { className?: string; label: string; mono?: boolean; value: string }) {
  return (
    <div className={`min-w-0 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 ${className}`}>
      <div className="text-xs text-slate-500">{label}</div>
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
      <div className="text-xs text-slate-500">{label}</div>
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
  return <button className={`rounded-md border px-3.5 py-1.5 text-sm font-medium transition outline-none focus:ring-0 ${active ? activeClass : idleClass}`} type="button" onClick={onClick}>{label}</button>
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
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider truncate">{label}</div>
        <div className={`text-base font-bold ${color} mt-0.5 tabular-nums`}>{value}</div>
        {sub ? <div className="text-xs text-slate-400 mt-0.5 truncate leading-tight">{sub}</div> : null}
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
        <div className="text-xs text-slate-400 font-medium mt-0.5">
          มูลค่า {formatMoney(item.value)} บาท {item.qty !== 0 ? `| เฉลี่ย ${formatMoney(item.value / item.qty)} บ./กก.` : ''}
        </div>
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
          <div className="text-xs text-slate-400 font-semibold uppercase">📊 คงเหลือ</div>
          <div className={`text-lg font-bold mt-1 tabular-nums ${info.qty > 0 ? 'text-emerald-700' : 'text-red-650'}`}>{formatMoney(info.qty)} <span className="text-xs font-normal">กก.</span></div>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-400 font-semibold uppercase">💰 มูลค่ารวม (WAC)</div>
          <div className="text-lg font-bold mt-1 text-blue-700 tabular-nums">{formatMoney(info.value)} <span className="text-xs font-normal">บาท</span></div>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-400 font-semibold uppercase">⚖ ราคาเฉลี่ย/กก.</div>
          <div className="text-lg font-bold mt-1 text-amber-700 tabular-nums">{formatMoney(averageCost)} <span className="text-xs font-normal">บ./กก.</span></div>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-400 font-semibold uppercase">รอออก</div>
          <div className="text-lg font-bold mt-1 text-amber-700 tabular-nums">{formatMoney(info.onHold)} <span className="text-xs font-normal">กก.</span></div>
        </div>
        <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-sm">
          <div className="text-xs text-slate-400 font-semibold uppercase">พร้อมส่ง</div>
          <div className="text-lg font-bold mt-1 text-emerald-700 tabular-nums">{formatMoney(info.ready)} <span className="text-xs font-normal">กก.</span></div>
        </div>
      </div>
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">📜 รายการสต๊อกของสินค้านี้ ({rows.length} รายการ)</h4>
          <span className="text-xs text-slate-400 font-medium">กดรายการเพื่อดูข้อมูลย่อย</span>
        </div>
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-xs text-slate-750">
            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200/60 text-slate-600 font-semibold z-10">
              <tr>
                <th className="p-3 text-left">วันที่ล่าสุด</th>
                <th className="p-3 text-center">ประเภทคลัง</th>
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
                  <td className="p-3 text-slate-500">{row.branchName}</td>
                  <td className="p-3 font-mono text-slate-600">{row.lotNo || '-'}</td>
                  <td className={`p-3 text-right tabular-nums ${row.qty < 0 ? 'text-red-650' : 'text-slate-800'}`}>{formatMoney(row.qty)}</td>
                  <td className="p-3 text-right text-slate-800 tabular-nums">{row.awaitingBillQty ? formatMoney(row.awaitingBillQty) : '-'}</td>
                  <td className="p-3 text-right text-amber-700 tabular-nums">{row.onHoldQty ? formatMoney(row.onHoldQty) : '-'}</td>
                  <td className="p-3 text-right text-emerald-700 tabular-nums">{formatMoney(row.readyQty)}</td>
                  <td className="p-3 text-right font-mono text-slate-600">{formatMoney(row.value)}</td>
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
  const rmItem = byStatus.find((item) => item.status === 'RM')
  const wipItem = byStatus.find((item) => item.status === 'WIP')
  const fgItem = byStatus.find((item) => item.status === 'FG')

  const rmVal = rmItem?.value ?? 0
  const rmQty = rmItem?.qty ?? 0
  const wipVal = wipItem?.value ?? 0
  const wipQty = wipItem?.qty ?? 0
  const fgVal = fgItem?.value ?? 0
  const fgQty = fgItem?.qty ?? 0

  const rmDeg = totalValue > 0 ? rmVal / totalValue * 360 : 0
  const wipDeg = totalValue > 0 ? wipVal / totalValue * 360 : 0
  const maxGroup = Math.max(1, ...matrixRows.map((row) => row.rmVal + row.wipVal + row.fgVal))
  return (
    <div className="mb-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold text-sm text-slate-800 uppercase tracking-wider">🥧 สัดส่วน Stock RM/WIP/FG (มูลค่า)</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-[180px] w-[180px] items-center justify-center rounded-full shadow-inner" style={{ background: totalValue > 0 ? `conic-gradient(#3b82f6 0deg ${rmDeg}deg, #f59e0b ${rmDeg}deg ${rmDeg + wipDeg}deg, #10b981 ${rmDeg + wipDeg}deg 360deg)` : '#e5e7eb' }}>
            <div className="flex h-[6.5rem] w-[6.5rem] flex-col items-center justify-center rounded-full bg-white text-center border border-slate-100 shadow-sm leading-tight">
              <span className="text-xs text-slate-500 font-semibold uppercase">รวม</span>
              <span className="text-xs font-extrabold text-slate-900 mt-0.5">{formatMoney(totalValue)}</span>
            </div>
          </div>
          <div className="min-w-[220px] flex-1 space-y-2 text-xs text-slate-700">
            <LegendRow color="bg-blue-500" label="📦 RM" value={rmVal} qty={rmQty} />
            <LegendRow color="bg-amber-500" label="⚙️ WIP" value={wipVal} qty={wipQty} />
            <LegendRow color="bg-emerald-500" label="✅ FG" value={fgVal} qty={fgQty} />
            <div className="flex justify-between border-t border-slate-100 pt-2 font-bold text-slate-800">
              <span>รวม</span>
              <div className="text-right">
                <div>{formatMoney(totalValue)}</div>
                {byStatus.reduce((sum, item) => sum + item.qty, 0) !== 0 ? (
                  <span className="text-xs font-normal text-slate-400 block leading-none mt-0.5">
                    เฉลี่ย {formatMoney(totalValue / byStatus.reduce((sum, item) => sum + item.qty, 0))} บ./กก.
                  </span>
                ) : null}
              </div>
            </div>
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
                  <span className="font-semibold text-slate-800">{row.group} <span className="text-xs text-slate-400 font-normal">({formatMoney(row.rmQty + row.wipQty + row.fgQty)} กก.)</span></span>
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

function LegendRow({ color, label, value, qty }: { color: string; label: string; value: number; qty?: number }) {
  const avg = qty && qty !== 0 ? value / qty : 0
  return (
    <div className="flex justify-between items-start">
      <span className="flex items-center gap-2 mt-0.5">
        <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
        {label}
      </span>
      <div className="text-right font-mono">
        <div className="font-bold text-slate-900">{formatMoney(value)}</div>
        {qty && qty !== 0 ? (
          <span className="text-xs font-normal text-slate-400 block leading-none mt-0.5">
            เฉลี่ย {formatMoney(avg)} บ./กก.
          </span>
        ) : null}
      </div>
    </div>
  )
}


const matrixColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'group', defaultWidth: 150 },
  { key: 'rmQty', defaultWidth: 100 },
  { key: 'rmVal', defaultWidth: 110 },
  { key: 'rmAvgCost', defaultWidth: 110 },
  { key: 'wipQty', defaultWidth: 100 },
  { key: 'wipVal', defaultWidth: 110 },
  { key: 'wipAvgCost', defaultWidth: 110 },
  { key: 'fgQty', defaultWidth: 100 },
  { key: 'fgVal', defaultWidth: 110 },
  { key: 'fgAvgCost', defaultWidth: 110 },
  { key: 'totalQty', defaultWidth: 100 },
  { key: 'totalValue', defaultWidth: 110 },
  { key: 'totalAvgCost', defaultWidth: 120 },
]

function MatrixTable({
  byStatus,
  isLoading,
  matrixRows,
  sortDirection,
  sortKey,
  totalMatrixRows,
  totalQty,
  totalValue,
  onSort,
}: {
  byStatus: StatusSummary[]
  isLoading: boolean
  matrixRows: MatrixRow[]
  sortDirection?: 'asc' | 'desc'
  sortKey?: string
  totalMatrixRows: number
  totalQty: number
  totalValue: number
  onSort?: (key: string) => void
}) {
  const valueFor = (status: string) => byStatus.find((item) => item.status === status) ?? { count: 0, qty: 0, status, value: 0 }
  const columnResize = useResizableColumns('stock.balance.matrix.v7', matrixColumns)
  return (
    <>
      {/* Desktop View (Table) */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200/85 bg-white shadow-sm overflow-hidden">
        <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
          {columnResize.hasCustomWidths ? (
            <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        <table className="w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {matrixColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-600 font-medium">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="หมวดสินค้า" resizeProps={columnResize.getResizeHandleProps('group', 'หมวดสินค้า')} sortKey="group" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="📦 RM (กก.)" resizeProps={columnResize.getResizeHandleProps('rmQty', '📦 RM (กก.)')} sortKey="rmQty" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="RM มูลค่า" resizeProps={columnResize.getResizeHandleProps('rmVal', 'RM มูลค่า')} sortKey="rmVal" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ต้นทุน RM เฉลี่ย" resizeProps={columnResize.getResizeHandleProps('rmAvgCost', 'ต้นทุน RM เฉลี่ย')} sortKey="rmAvgCost" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="⚙️ WIP (กก.)" resizeProps={columnResize.getResizeHandleProps('wipQty', '⚙️ WIP (กก.)')} sortKey="wipQty" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="WIP มูลค่า" resizeProps={columnResize.getResizeHandleProps('wipVal', 'WIP มูลค่า')} sortKey="wipVal" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ต้นทุน WIP เฉลี่ย" resizeProps={columnResize.getResizeHandleProps('wipAvgCost', 'ต้นทุน WIP เฉลี่ย')} sortKey="wipAvgCost" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="✅ FG (กก.)" resizeProps={columnResize.getResizeHandleProps('fgQty', '✅ FG (กก.)')} sortKey="fgQty" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="FG มูลค่า" resizeProps={columnResize.getResizeHandleProps('fgVal', 'FG มูลค่า')} sortKey="fgVal" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ต้นทุน FG เฉลี่ย" resizeProps={columnResize.getResizeHandleProps('fgAvgCost', 'ต้นทุน FG เฉลี่ย')} sortKey="fgAvgCost" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="รวม กก." resizeProps={columnResize.getResizeHandleProps('totalQty', 'รวม กก.')} sortKey="totalQty" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="รวมมูลค่า" resizeProps={columnResize.getResizeHandleProps('totalValue', 'รวมมูลค่า')} sortKey="totalValue" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ต้นทุนเฉลี่ยรวม" resizeProps={columnResize.getResizeHandleProps('totalAvgCost', 'ต้นทุนเฉลี่ยรวม')} sortKey="totalAvgCost" onSort={onSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
            {isLoading ? <tr><td className="p-8 text-center text-slate-400" colSpan={13}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && matrixRows.map((row) => (
              <Fragment key={row.group}>
                <tr className="bg-slate-50/70 transition-colors hover:bg-slate-100/70">
                  <td className="p-3.5 text-slate-855 min-w-0 max-w-0 overflow-hidden">
                    <div className="truncate font-bold" title={row.group}>{row.group}</div>
                    <div className="mt-0.5 truncate text-xs font-medium text-slate-500">{row.products.length.toLocaleString('th-TH')} รายการสินค้า</div>
                  </td>
                  <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-x border-slate-100">{row.rmQty ? formatMoney(row.rmQty) : '-'}</td>
                  <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-r border-slate-100">{row.rmVal ? formatMoney(row.rmVal) : '-'}</td>
                  <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-r border-slate-100">{row.rmQty !== 0 ? `${formatMoney(row.rmVal / row.rmQty)} บ.` : '-'}</td>
                  <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100">{row.wipQty ? formatMoney(row.wipQty) : '-'}</td>
                  <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100">{row.wipVal ? formatMoney(row.wipVal) : '-'}</td>
                  <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100">{row.wipQty !== 0 ? `${formatMoney(row.wipVal / row.wipQty)} บ.` : '-'}</td>
                  <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100">{row.fgQty ? formatMoney(row.fgQty) : '-'}</td>
                  <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100">{row.fgVal ? formatMoney(row.fgVal) : '-'}</td>
                  <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100">{row.fgQty !== 0 ? `${formatMoney(row.fgVal / row.fgQty)} บ.` : '-'}</td>
                  <td className="p-3.5 text-right">{formatMoney(matrixRowQty(row))}</td>
                  <td className="p-3.5 text-right text-emerald-700">{formatMoney(matrixRowValue(row))}</td>
                  <td className="p-3.5 text-right text-emerald-700">{matrixRowQty(row) !== 0 ? `${formatMoney(matrixRowValue(row) / matrixRowQty(row))} บ.` : '-'}</td>
                </tr>
                {row.products.map((product) => (
                  <tr key={`${row.group}-${product.productId}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3.5 pl-8 text-slate-700 min-w-0 max-w-0 overflow-hidden">
                      <div className="flex items-start gap-2 min-w-0 w-full">
                        <span className="mt-1.5 h-px w-4 shrink-0 bg-slate-300" />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <div className="truncate font-semibold text-slate-800" title={`${product.productCode} ${product.productName}`}>
                            {product.productCode} {product.productName}
                          </div>
                          <div className="mt-0.5 truncate text-xs font-medium text-slate-400" title={`สินค้าในหมวด ${row.group}`}>
                            สินค้าในหมวด {row.group}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-x border-slate-100 whitespace-nowrap pl-4 tabular-nums">{product.rmQty ? formatMoney(product.rmQty) : '-'}</td>
                    <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-r border-slate-100 whitespace-nowrap pl-4 tabular-nums">{product.rmVal ? formatMoney(product.rmVal) : '-'}</td>
                    <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-r border-slate-100 whitespace-nowrap pl-4 tabular-nums">{product.rmQty !== 0 ? `${formatMoney(product.rmVal / product.rmQty)} บ.` : '-'}</td>
                    <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100 whitespace-nowrap pl-4 tabular-nums">{product.wipQty ? formatMoney(product.wipQty) : '-'}</td>
                    <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100 whitespace-nowrap pl-4 tabular-nums">{product.wipVal ? formatMoney(product.wipVal) : '-'}</td>
                    <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100 whitespace-nowrap pl-4 tabular-nums">{product.wipQty !== 0 ? `${formatMoney(product.wipVal / product.wipQty)} บ.` : '-'}</td>
                    <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100 whitespace-nowrap pl-4 tabular-nums">{product.fgQty ? formatMoney(product.fgQty) : '-'}</td>
                    <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100 whitespace-nowrap pl-4 tabular-nums">{product.fgVal ? formatMoney(product.fgVal) : '-'}</td>
                    <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100 whitespace-nowrap pl-4 tabular-nums">{product.fgQty !== 0 ? `${formatMoney(product.fgVal / product.fgQty)} บ.` : '-'}</td>
                    <td className="p-3.5 text-right whitespace-nowrap pl-4 tabular-nums">{formatMoney(matrixProductQty(product))}</td>
                    <td className="p-3.5 text-right text-emerald-700 whitespace-nowrap pl-4 tabular-nums">{formatMoney(matrixProductValue(product))}</td>
                    <td className="p-3.5 text-right text-emerald-700 whitespace-nowrap pl-4 tabular-nums">{matrixProductQty(product) !== 0 ? `${formatMoney(matrixProductValue(product) / matrixProductQty(product))} บ.` : '-'}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {!isLoading && matrixRows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={13}>ไม่มีสต๊อก</td></tr> : null}
          </tbody>
          {matrixRows.length ? (
            <tfoot className="bg-slate-50 border-t border-slate-200/80 font-bold text-slate-800">
              <tr>
                <td className="p-3.5 overflow-hidden truncate">รวมทั้งหมด ({totalMatrixRows} หมวด)</td>
                <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-x border-slate-100 overflow-hidden truncate">{formatMoney(valueFor('RM').qty)}</td>
                <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-r border-slate-100 overflow-hidden truncate">{formatMoney(valueFor('RM').value)}</td>
                <td className="p-3.5 text-right text-blue-700 bg-blue-50/10 border-r border-slate-100 overflow-hidden truncate">{valueFor('RM').qty !== 0 ? `${formatMoney(valueFor('RM').value / valueFor('RM').qty)} บ.` : '-'}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100 overflow-hidden truncate">{formatMoney(valueFor('WIP').qty)}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100 overflow-hidden truncate">{formatMoney(valueFor('WIP').value)}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100 overflow-hidden truncate">{valueFor('WIP').qty !== 0 ? `${formatMoney(valueFor('WIP').value / valueFor('WIP').qty)} บ.` : '-'}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100 overflow-hidden truncate">{formatMoney(valueFor('FG').qty)}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100 overflow-hidden truncate">{formatMoney(valueFor('FG').value)}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100 overflow-hidden truncate">{valueFor('FG').qty !== 0 ? `${formatMoney(valueFor('FG').value / valueFor('FG').qty)} บ.` : '-'}</td>
                <td className="p-3.5 text-right overflow-hidden truncate">{formatMoney(totalQty)}</td>
                <td className="p-3.5 text-right text-emerald-700 overflow-hidden truncate">{formatMoney(totalValue)}</td>
                <td className="p-3.5 text-right text-emerald-700 overflow-hidden truncate">{totalQty !== 0 ? `${formatMoney(totalValue / totalQty)} บ.` : '-'}</td>
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
                <span className="ml-2 text-xs font-medium text-slate-400">{row.products.length.toLocaleString('th-TH')} รายการสินค้า</span>
              </div>
              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between items-center bg-blue-50/50 p-2 rounded-lg">
                  <span className="font-medium text-blue-800">📦 RM (วัตถุดิบ)</span>
                  <span className="font-semibold text-right text-blue-700 tabular-nums flex flex-col items-end">
                    <span>{row.rmQty ? `${formatMoney(row.rmQty)} กก.` : '-'} {row.rmVal ? `(${formatMoney(row.rmVal)} บ.)` : ''}</span>
                    {row.rmQty && row.rmVal ? (
                      <span className="text-xs text-slate-400 font-normal mt-0.5">เฉลี่ย {formatMoney(row.rmQty !== 0 ? row.rmVal / row.rmQty : 0)} บ./กก.</span>
                    ) : null}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-amber-50/50 p-2 rounded-lg">
                  <span className="font-medium text-amber-800">⚙️ WIP (ระหว่างผลิต)</span>
                  <span className="font-semibold text-right text-amber-700 tabular-nums flex flex-col items-end">
                    <span>{row.wipQty ? `${formatMoney(row.wipQty)} กก.` : '-'} {row.wipVal ? `(${formatMoney(row.wipVal)} บ.)` : ''}</span>
                    {row.wipQty && row.wipVal ? (
                      <span className="text-xs text-slate-400 font-normal mt-0.5">เฉลี่ย {formatMoney(row.wipQty !== 0 ? row.wipVal / row.wipQty : 0)} บ./กก.</span>
                    ) : null}
                  </span>
                </div>
                <div className="flex justify-between items-center bg-emerald-50/50 p-2 rounded-lg">
                  <span className="font-medium text-emerald-800">✅ FG (สินค้าสำเร็จรูป)</span>
                  <span className="font-semibold text-right text-emerald-700 tabular-nums flex flex-col items-end">
                    <span>{row.fgQty ? `${formatMoney(row.fgQty)} กก.` : '-'} {row.fgVal ? `(${formatMoney(row.fgVal)} บ.)` : ''}</span>
                    {row.fgQty && row.fgVal ? (
                      <span className="text-xs text-slate-400 font-normal mt-0.5">เฉลี่ย {formatMoney(row.fgQty !== 0 ? row.fgVal / row.fgQty : 0)} บ./กก.</span>
                    ) : null}
                  </span>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-2 flex justify-between items-center text-xs font-bold text-slate-800">
                <span>รวมทั้งสิ้น</span>
                <span className="tabular-nums text-right flex flex-col items-end">
                  <span>{formatMoney(totalRowQty)} กก. | <span className="text-emerald-700">{formatMoney(totalRowVal)} บาท</span></span>
                  {totalRowQty !== 0 ? (
                    <span className="text-xs text-slate-400 font-normal mt-0.5">เฉลี่ย {formatMoney(totalRowVal / totalRowQty)} บ./กก.</span>
                  ) : null}
                </span>
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-2">
                {row.products.map((product) => (
                  <div key={`${row.group}-${product.productId}`} className="rounded-lg bg-slate-50/80 p-2.5 text-xs min-w-0 overflow-hidden">
                    <div className="truncate font-semibold text-slate-800" title={`${product.productCode} ${product.productName}`}>
                      {product.productCode} {product.productName}
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-2 text-xs font-semibold tabular-nums">
                      <div className="rounded-md bg-blue-50 px-2 py-1 text-blue-700">RM {product.rmQty ? formatMoney(product.rmQty) : '-'}</div>
                      <div className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">WIP {product.wipQty ? formatMoney(product.wipQty) : '-'}</div>
                      <div className="rounded-md bg-emerald-50 px-2 py-1 text-emerald-700">FG {product.fgQty ? formatMoney(product.fgQty) : '-'}</div>
                    </div>
                    <div className="mt-1 text-right text-xs font-bold text-emerald-700 tabular-nums">
                      รวม {formatMoney(matrixProductQty(product))} กก. | {formatMoney(matrixProductValue(product))} บ.
                    </div>
                  </div>
                ))}
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
              <div className="flex justify-between items-center">
                <span className="text-slate-400">RM:</span>
                <span className="font-semibold text-blue-300 tabular-nums text-right flex flex-col items-end">
                  <span>{formatMoney(valueFor('RM').qty)} กก. ({formatMoney(valueFor('RM').value)} บ.)</span>
                  {valueFor('RM').qty !== 0 ? (
                    <span className="text-xs text-slate-500 font-normal mt-0.5">เฉลี่ย {formatMoney(valueFor('RM').value / valueFor('RM').qty)} บ./กก.</span>
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">WIP:</span>
                <span className="font-semibold text-amber-300 tabular-nums text-right flex flex-col items-end">
                  <span>{formatMoney(valueFor('WIP').qty)} กก. ({formatMoney(valueFor('WIP').value)} บ.)</span>
                  {valueFor('WIP').qty !== 0 ? (
                    <span className="text-xs text-slate-500 font-normal mt-0.5">เฉลี่ย {formatMoney(valueFor('WIP').value / valueFor('WIP').qty)} บ./กก.</span>
                  ) : null}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">FG:</span>
                <span className="font-semibold text-emerald-300 tabular-nums text-right flex flex-col items-end">
                  <span>{formatMoney(valueFor('FG').qty)} กก. ({formatMoney(valueFor('FG').value)} บ.)</span>
                  {valueFor('FG').qty !== 0 ? (
                    <span className="text-xs text-slate-500 font-normal mt-0.5">เฉลี่ย {formatMoney(valueFor('FG').value / valueFor('FG').qty)} บ./กก.</span>
                  ) : null}
                </span>
              </div>
            </div>
            <div className="border-t border-slate-800 pt-2 flex justify-between items-center text-xs font-bold">
              <span>รวมสะสมสุทธิ</span>
              <span className="tabular-nums text-right flex flex-col items-end">
                <span className="text-emerald-400">{formatMoney(totalQty)} กก. | {formatMoney(totalValue)} บาท</span>
                {totalQty !== 0 ? (
                  <span className="text-xs text-slate-500 font-normal mt-0.5">เฉลี่ย {formatMoney(totalValue / totalQty)} บ./กก.</span>
                ) : null}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

const detailColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'product', defaultWidth: 200 },
  { key: 'group', defaultWidth: 100 },
  { key: 'warehouse', defaultWidth: 110 },
  { key: 'branch', defaultWidth: 120 },
  { key: 'qty', defaultWidth: 110 },
  { key: 'awaitingBill', defaultWidth: 90 },
  { key: 'onHold', defaultWidth: 90 },
  { key: 'ready', defaultWidth: 90 },
  { key: 'avgCost', defaultWidth: 100 },
  { key: 'value', defaultWidth: 120 },
]

function DetailTable({
  isLoading,
  rows,
  sortDirection,
  sortKey,
  onOpen,
  onSort,
}: {
  isLoading: boolean
  rows: DisplayBalanceRow[]
  sortDirection?: 'asc' | 'desc'
  sortKey?: string
  onOpen: (row: BalanceRow) => void
  onSort?: (key: string) => void
}) {
  const columnResize = useResizableColumns('stock.balance.detail.v5', detailColumns)
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
                <span className="text-xs text-slate-400 block leading-tight">{row.productCode}</span>
                <span className="font-bold text-slate-800 text-xs">{row.productName}</span>
                {row.lotNo && row.lotNo !== '-' ? (
                  <div className="text-xs text-slate-400 mt-0.5">Lot: {row.lotNo}</div>
                ) : null}
              </div>
              <StockStatusCell row={row} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-650">
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
              <span className="font-bold text-slate-855">มูลค่า: <span className="text-emerald-700 font-mono font-bold">{formatMoney(row.value)} บาท</span></span>
              <span className="text-xs text-slate-400">กดเพื่อดูรายละเอียด</span>
            </div>
          </div>
        ))}
        {!isLoading && rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm text-xs">ไม่มีสต๊อก</div>
        ) : null}
      </div>

      {/* Desktop View */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-200/85 bg-white shadow-sm overflow-hidden">
        <div className="p-2 bg-slate-50 border-b border-slate-100 flex justify-end">
          {columnResize.hasCustomWidths ? (
            <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        <table className="w-full text-sm text-slate-700" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {detailColumns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-200/60 text-slate-655 font-medium">
            <tr>
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="สินค้า" resizeProps={columnResize.getResizeHandleProps('product', 'สินค้า')} sortKey="product" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="หมวด" resizeProps={columnResize.getResizeHandleProps('group', 'หมวด')} sortKey="group" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="center" direction={sortDirection} label="ประเภทคลัง" resizeProps={columnResize.getResizeHandleProps('warehouse', 'ประเภทคลัง')} sortKey="warehouse" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="สาขา" resizeProps={columnResize.getResizeHandleProps('branch', 'สาขา')} sortKey="branch" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="คงเหลือ (กก.)" resizeProps={columnResize.getResizeHandleProps('qty', 'คงเหลือ (กก.)')} sortKey="qty" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="รอเข้า" resizeProps={columnResize.getResizeHandleProps('awaitingBill', 'รอเข้า')} sortKey="awaitingBill" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="รอออก" resizeProps={columnResize.getResizeHandleProps('onHold', 'รอออก')} sortKey="onHold" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="พร้อมส่ง" resizeProps={columnResize.getResizeHandleProps('ready', 'พร้อมส่ง')} sortKey="ready" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="ต้นทุน/กก." resizeProps={columnResize.getResizeHandleProps('avgCost', 'ต้นทุน/กก.')} sortKey="avgCost" onSort={onSort} />
              <ResizableTableHead activeSortKey={sortKey} align="right" direction={sortDirection} label="มูลค่า" resizeProps={columnResize.getResizeHandleProps('value', 'มูลค่า')} sortKey="value" onSort={onSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-semibold">
            {isLoading ? <tr><td className="p-8 text-center text-slate-400" colSpan={10}>กำลังโหลดข้อมูล</td></tr> : null}
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
                <td className="p-3.5 text-slate-800 min-w-0 overflow-hidden">
                  <div className="truncate" title={`${row.productCode} ${row.productName}`}>
                    <span className="text-slate-500">{row.productCode}</span> {row.productName}
                  </div>
                  {row.lotNo && row.lotNo !== '-' ? (
                    <div className="mt-0.5 truncate text-xs font-normal text-slate-400" title={`Lot: ${row.lotNo}`}>Lot: {row.lotNo}</div>
                  ) : null}
                </td>
                <td className="p-3.5 text-slate-800 overflow-hidden truncate">{row.productMetalGroup || 'อื่นๆ'}</td>
                <td className="p-3.5 text-center overflow-hidden truncate"><StockStatusCell row={row} /></td>
                <td className="p-3.5 text-slate-655 overflow-hidden truncate" title={row.branchName}>
                  {row.branchName}
                </td>
                <td className={`p-3.5 text-right overflow-hidden truncate ${row.qty < 0 ? 'text-red-655' : ''}`}>{formatMoney(row.qty)}</td>
                <td className="p-3.5 text-right border-r border-slate-105 text-slate-800 overflow-hidden truncate">{row.awaitingBillQty ? formatMoney(row.awaitingBillQty) : '-'}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-105 overflow-hidden truncate">{row.onHoldQty ? formatMoney(row.onHoldQty) : '-'}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-105 overflow-hidden truncate">{formatMoney(row.readyQty)}</td>
                <td className="p-3.5 text-right text-slate-505 font-mono overflow-hidden truncate">{formatMoney(row.avgCost)}</td>
                <td className="p-3.5 text-right text-emerald-700 font-mono overflow-hidden truncate">{formatMoney(row.value)}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={10}>ไม่มีสต๊อก</td></tr> : null}
          </tbody>
          {rows.length ? (
            <tfoot className="bg-slate-50 border-t border-slate-200/80 font-bold text-slate-800">
              <tr>
                <td className="p-3.5 overflow-hidden truncate" colSpan={4}>รวมหน้านี้ ({rows.length} รายการ)</td>
                <td className="p-3.5 text-right font-mono overflow-hidden truncate">{formatMoney(rows.reduce((sum, row) => sum + row.qty, 0))}</td>
                <td className="p-3.5 text-right border-r border-slate-100 font-mono text-slate-800 overflow-hidden truncate">{formatMoney(rows.reduce((sum, row) => sum + row.awaitingBillQty, 0))}</td>
                <td className="p-3.5 text-right text-amber-700 bg-amber-50/10 border-r border-slate-100 font-mono overflow-hidden truncate">{formatMoney(rows.reduce((sum, row) => sum + row.onHoldQty, 0))}</td>
                <td className="p-3.5 text-right text-emerald-700 bg-emerald-50/10 border-r border-slate-100 font-mono overflow-hidden truncate">{formatMoney(rows.reduce((sum, row) => sum + row.readyQty, 0))}</td>
                <td className="overflow-hidden truncate" />
                <td className="p-3.5 text-right text-emerald-700 font-mono overflow-hidden truncate">{formatMoney(rows.reduce((sum, row) => sum + row.value, 0))}</td>
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

function StockStatusCell({ row }: { row: BalanceRow }) {
  return (
    <div className="flex flex-wrap justify-center gap-1 shrink-0">
      <StockTypeText status={row.status} />
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
