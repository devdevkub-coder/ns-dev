'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/Dialog'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AlertTriangle, Download, RotateCcw, Search } from 'lucide-react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { stockMovementTypeLabel } from '@/lib/stock-movement-types'
import type { StockOption } from '@/lib/stock'

type StockLedgerSortDirection = 'asc' | 'desc'
type StockLedgerSortKey = 'counterpartyName' | 'date' | 'movementType' | 'productName' | 'qtyIn' | 'qtyOut' | 'refNo' | 'runningBalanceByProduct' | 'unitCost' | 'valueIn' | 'valueOut' | 'warehouseName'

const stockLedgerPageSizes = [25, 50, 80, 100]
const warehouseTypeOptions = [
  { label: 'RM', value: 'RM' },
  { label: 'WIP', value: 'WIP' },
  { label: 'FG', value: 'FG' },
]

const stockLedgerColumns: Array<ResizableColumnDefinition<StockLedgerColumnKey>> = [
  { defaultWidth: 92, key: 'date', minWidth: 82 },
  { defaultWidth: 132, key: 'refNo', minWidth: 110 },
  { defaultWidth: 200, key: 'counterpartyName', minWidth: 140 },
  { defaultWidth: 170, key: 'movementType', minWidth: 140 },
  { defaultWidth: 180, key: 'productName', minWidth: 140 },
  { defaultWidth: 170, key: 'warehouseName', minWidth: 130 },
  { defaultWidth: 110, key: 'qtyIn', minWidth: 90 },
  { defaultWidth: 110, key: 'qtyOut', minWidth: 90 },
  { defaultWidth: 120, key: 'runningBalanceByProduct', minWidth: 100 },
  { defaultWidth: 120, key: 'unitCost', minWidth: 100 },
  { defaultWidth: 130, key: 'valueIn', minWidth: 110 },
  { defaultWidth: 130, key: 'valueOut', minWidth: 110 },
]

type StockLedgerColumnKey = StockLedgerSortKey

function LedgerViewTab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`border-b-2 px-5 py-3 text-sm font-medium transition-colors outline-none focus:outline-none focus:ring-0 ${active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}



type StockLedgerPayload = {
  movementTypes: string[]
  page: number
  pageSize: number
  reference: { branches: StockOption[]; products: StockOption[]; warehouses: StockOption[] }
  rows: StockLedgerRow[]
  summary: { count: number; negativeCount: number; pageCount: number; qtyIn: number; qtyOut: number; valueIn: number; valueOut: number }
  total: number
}

type StockLedgerRow = {
  branchName: string
  counterpartyName: string
  date: string
  id: string
  lotNo: string
  movementType: string
  notAvailableForSale: boolean
  note: string
  outputCategory: string
  productCode: string
  productId: string
  productName: string
  qtyIn: number
  qtyOut: number
  refId: string
  refNo: string
  refType: string
  runningBalanceByProduct: number
  sourcePath: string
  unitCost: number
  valueIn: number
  valueOut: number
  warehouseName: string
}

export function StockLedgerPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [balanceMode, setBalanceMode] = useState<'product' | 'warehouse'>('warehouse')
  const [branchId, setBranchId] = useState('')
  const [data, setData] = useState<StockLedgerPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [movementType, setMovementType] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(80)
  const [productId, setProductId] = useState('')
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<StockLedgerRow | null>(null)
  const [sortDirection, setSortDirection] = useState<StockLedgerSortDirection>('desc')
  const [sortKey, setSortKey] = useState<StockLedgerSortKey>('date')
  const [toDate, setToDate] = useState('')
  const [warehouseType, setWarehouseType] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const columnResize = useResizableColumns('stock.ledger.v5', stockLedgerColumns)

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ balanceMode, direction: sortDirection, page: String(page), pageSize: String(pageSize), sort: sortKey })
      if (branchId) params.set('branchId', branchId)
      if (fromDate) params.set('from', fromDate)
      if (movementType) params.set('movementType', movementType)
      if (productId) params.set('productId', productId)
      if (search.trim()) params.set('q', search.trim())
      if (toDate) params.set('to', toDate)
      if (warehouseType) params.set('warehouseType', warehouseType)
      const payload = await dailyFetchJson<StockLedgerPayload>(`/api/stock/ledger?${params.toString()}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด Stock Ledger ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [balanceMode, branchId, fromDate, movementType, page, pageSize, productId, search, sortDirection, sortKey, toDate, warehouseType])

  useEffect(() => {
    void loadData()
  }, [loadData])



  const rows = useMemo(() => {
    return (data?.rows ?? [])
      .sort((left, right) => compareStockLedgerRows(left, right, sortKey, sortDirection))
  }, [data?.rows, sortDirection, sortKey])

  const productOptions = useMemo<SearchComboboxOption[]>(() => (data?.reference.products ?? [])
    .filter((item) => item.active !== false)
    .map((item) => ({
      description: item.code ? `รหัส ${item.code}` : undefined,
      id: item.id,
      label: item.code ? `${item.code} - ${item.name}` : item.name,
      searchText: `${item.code ?? ''} ${item.name} ${item.metalGroup ?? ''}`,
    })), [data?.reference.products])

  function changeSort(nextKey: StockLedgerSortKey) {
    setPage(1)
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'date' ? 'desc' : 'asc')
  }

  function exportXlsx() {
    const params = new URLSearchParams({ balanceMode, direction: sortDirection, format: 'xlsx', page: '1', pageSize: '500', sort: sortKey })
    if (branchId) params.set('branchId', branchId)
    if (fromDate) params.set('from', fromDate)
    if (movementType) params.set('movementType', movementType)
    if (productId) params.set('productId', productId)
    if (search.trim()) params.set('q', search.trim())
    if (toDate) params.set('to', toDate)
    if (warehouseType) params.set('warehouseType', warehouseType)
    window.location.href = `/api/stock/ledger?${params.toString()}`
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? pageSize)))
  const filtersActive = Boolean(productId || branchId || movementType || fromDate || toDate || search || warehouseType)

  return (
    <section>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}


      
      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block mb-4 space-y-3 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              className="h-9 w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-slate-400 focus:ring-0"
              placeholder="ค้นหาเลขเอกสาร / ผู้ขาย/ผู้ซื้อ / สาขา / คลัง..." 
              type="search" 
              value={search} 
              onChange={(event) => { setPage(1); setSearch(event.target.value); }}
            />
          </div>

          <div className="min-w-[260px]">
            <SearchCombobox
              hideLabel
              inputClassName="h-9 text-sm rounded-md border-slate-300 focus:border-slate-400 focus:ring-0 outline-none"
              inputId="stock-ledger-product-filter"
              label="สินค้า"
              options={productOptions}
              placeholder="ทุกสินค้า"
              value={productId}
              onChange={(value) => {
                setPage(1)
                setProductId(value)
              }}
            />
          </div>

          {filtersActive ? (
            <button 
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 outline-none focus:ring-0"
              type="button" 
              onClick={() => { setBranchId(''); setFromDate(''); setMovementType(''); setPage(1); setProductId(''); setSearch(''); setToDate(''); setWarehouseType('') }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> ล้างตัวกรอง
            </button>
          ) : null}

          <button 
            className="flex h-9 items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 outline-none focus:ring-0"
            type="button" 
            onClick={exportXlsx}
          >
            <Download className="h-3.5 w-3.5" /> ส่งออก Excel
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500 font-medium">สาขา:</span>
          <select className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400 focus:ring-0" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
            <option value="">ทุกสาขา</option>
            {(data?.reference.branches ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>

          <span className="text-xs text-slate-500 ml-4 font-medium">ประเภท:</span>
          <select className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400 focus:ring-0" value={movementType} onChange={(event) => { setPage(1); setMovementType(event.target.value) }}>
            <option value="">ทุกประเภท</option>
            {(data?.movementTypes ?? []).map((item) => <option key={item} value={item}>{stockMovementTypeLabel(item)}</option>)}
          </select>

          <span className="text-xs text-slate-500 ml-4 font-medium">ประเภทคลัง:</span>
          <select className="h-9 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm text-slate-800 outline-none transition-colors focus:border-slate-400 focus:ring-0" value={warehouseType} onChange={(event) => { setPage(1); setWarehouseType(event.target.value) }}>
            <option value="">ทุกประเภทคลัง</option>
            {warehouseTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>

          <span className="text-xs text-slate-500 ml-4 font-medium">ช่วงเวลา:</span>
          <DatePickerInput className="w-[130px] !h-9 rounded-md border-slate-300 text-xs outline-none" title="จากวันที่" value={fromDate} onChange={(value) => { setPage(1); setFromDate(value) }} />
          <span className="text-slate-400 font-medium">→</span>
          <DatePickerInput className="w-[130px] !h-9 rounded-md border-slate-300 text-xs outline-none" title="ถึงวันที่" value={toDate} onChange={(value) => { setPage(1); setToDate(value) }} />
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-3 rounded-md bg-white p-3 shadow lg:hidden animate-fade-in">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              className="h-9 w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-slate-400 focus:ring-0"
              placeholder="ค้นหา..." 
              type="search" 
              value={search} 
              onChange={(event) => { setPage(1); setSearch(event.target.value); }}
            />
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 outline-none focus:ring-0"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {filtersActive ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden animate-fade-in">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรอง Stock Ledger</h4>
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
                <span className="mb-1 block text-xs font-semibold text-slate-600">สินค้า</span>
                <SearchCombobox
                  hideLabel
                  inputClassName="h-10 text-sm"
                  inputId="stock-ledger-product-search-mobile"
                  label="สินค้า"
                  options={productOptions}
                  placeholder="ทุกสินค้า"
                  value={productId}
                  onChange={(value) => {
                    setPage(1)
                    setProductId(value)
                  }}
                />
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">สาขา</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
                  <option value="">ทุกสาขา</option>
                  {(data?.reference.branches ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">ประเภท</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={movementType} onChange={(event) => { setPage(1); setMovementType(event.target.value) }}>
                  <option value="">ทุกประเภท</option>
                  {(data?.movementTypes ?? []).map((item) => <option key={item} value={item}>{stockMovementTypeLabel(item)}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">ประเภทคลัง</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={warehouseType} onChange={(event) => { setPage(1); setWarehouseType(event.target.value) }}>
                  <option value="">ทุกประเภทคลัง</option>
                  {warehouseTypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600">จากวันที่</span>
                  <DatePickerInput className="w-full h-10 text-sm" title="จากวันที่" value={fromDate} onChange={(value) => { setPage(1); setFromDate(value) }} />
                </div>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600">ถึงวันที่</span>
                  <DatePickerInput className="w-full h-10 text-sm" title="ถึงวันที่" value={toDate} onChange={(value) => { setPage(1); setToDate(value) }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setBranchId('')
                  setFromDate('')
                  setMovementType('')
                  setPage(1)
                  setProductId('')
                  setSearch('')
                  setToDate('')
                  setWarehouseType('')
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                className="h-11 rounded-md bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {movementType ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 animate-fade-in">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div><b>คุณกำลังกรองประเภท {stockMovementTypeLabel(movementType)}</b> — <b>คงเหลือ</b> เป็นยอดสะสมจากทุกประเภท เพื่อให้ตรง ledger running balance</div>
        </div>
      ) : null}

      <div className="mb-3 flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between lg:hidden">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{data?.total ?? 0}</span> รายการ</div>
        <div className="flex items-center gap-2">
          <select aria-label="จำนวนรายการต่อหน้า" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
            {stockLedgerPageSizes.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </select>
          <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={page <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
          <span className="px-1">หน้า {page} / {totalPages}</span>
          <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={page >= totalPages} type="button" onClick={() => setPage((value) => value + 1)}>ถัดไป</button>
        </div>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}
        
        {!isLoading && rows.map((row) => (
          <div
            key={row.id}
            className={`rounded-md border p-4 shadow-sm space-y-2 active:bg-slate-50 cursor-pointer ${row.runningBalanceByProduct < 0 ? 'border-red-200 bg-red-50/60' : 'border-slate-100 bg-white'}`}
            onClick={() => setSelectedRow(row)}
          >
            <div className="flex justify-between items-start">
              <span className="font-bold text-slate-800 text-sm">{row.refNo || '-'}</span>
              <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
            </div>
            
            <div className="text-xs text-slate-600 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">สินค้า: </span>
                <span className="text-slate-800">{row.productCode ? `${row.productCode} · ` : ''}{row.productName}</span>
                {row.lotNo && row.lotNo !== 'OPENING' ? <span className="ml-1 text-xs font-medium text-slate-400">[{row.lotNo}]</span> : null}
              </div>
              <div>
                <span className="font-semibold text-slate-500">คลัง/สาขา: </span>
                <span className="text-slate-800">{row.warehouseName || '-'} / {row.branchName || '-'}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">ประเภทการโอน: </span>
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${row.qtyIn > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {stockMovementTypeLabel(row.movementType)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <span className="font-semibold text-slate-500 block">ปริมาณ: </span>
                  <span className={`font-bold ${row.qtyIn > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {row.qtyIn ? `+${formatMoney(row.qtyIn)}` : `-${formatMoney(row.qtyOut)}`} กก.
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500 block">ยอดคงเหลือสะสม: </span>
                  <span className={`font-bold tabular-nums ${row.runningBalanceByProduct < 0 ? 'text-red-700' : 'text-blue-700'}`}>
                    {formatMoney(row.runningBalanceByProduct)} กก.
                  </span>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-400 pt-1 border-t border-slate-100/60 mt-1">
                <span>ต้นทุน/น.: {formatMoney(row.runningBalanceByProduct < 0 ? 0 : row.unitCost)} บาท</span>
                <span className="truncate max-w-[150px]">{row.counterpartyName && row.counterpartyName !== '-' ? row.counterpartyName : ''}</span>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && rows.length === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
            ยังไม่มี Stock Movement
          </div>
        ) : null}
      </div>

      {/* Desktop Table View */}
      <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div>พบทั้งหมด <span className="font-semibold text-slate-900">{data?.total ?? 0}</span> รายการ</div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="จำนวนรายการต่อหน้า" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
              {stockLedgerPageSizes.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
            </select>
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={page <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
            <span className="px-1">หน้า {page} / {totalPages}</span>
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={page >= totalPages} type="button" onClick={() => setPage((value) => value + 1)}>ถัดไป</button>
            {columnResize.hasCustomWidths ? (
              <button className="h-9 rounded-md bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={columnResize.resetColumnWidths}>
                คืนค่าตาราง
              </button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full divide-y divide-slate-200 text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {stockLedgerColumns.map((column) => {
              const style = columnResize.getColumnStyle(column.key);
              return <col key={column.key} style={style} />;
            })}
          </colgroup>
          <thead className="border-b border-slate-100 bg-slate-100 text-slate-600">
            <tr>
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="วันที่เอกสาร" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่เอกสาร')} sortKey="date" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="เลขที่เอกสาร" resizeProps={columnResize.getResizeHandleProps('refNo', 'เลขที่เอกสาร')} sortKey="refNo" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="ผู้ขาย/ผู้ซื้อ" resizeProps={columnResize.getResizeHandleProps('counterpartyName', 'ผู้ขาย/ผู้ซื้อ')} sortKey="counterpartyName" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('movementType', 'ประเภท')} sortKey="movementType" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="สินค้า" resizeProps={columnResize.getResizeHandleProps('productName', 'สินค้า')} sortKey="productName" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="คลัง/สาขา" resizeProps={columnResize.getResizeHandleProps('warehouseName', 'คลัง/สาขา')} sortKey="warehouseName" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="เข้า" resizeProps={columnResize.getResizeHandleProps('qtyIn', 'เข้า')} sortKey="qtyIn" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ออก" resizeProps={columnResize.getResizeHandleProps('qtyOut', 'ออก')} sortKey="qtyOut" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="คงเหลือ" resizeProps={columnResize.getResizeHandleProps('runningBalanceByProduct', 'คงเหลือ')} sortKey="runningBalanceByProduct" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ต้นทุน/น." resizeProps={columnResize.getResizeHandleProps('unitCost', 'ต้นทุน/น.')} sortKey="unitCost" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="มูลค่าเข้า" resizeProps={columnResize.getResizeHandleProps('valueIn', 'มูลค่าเข้า')} sortKey="valueIn" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="มูลค่าออก" resizeProps={columnResize.getResizeHandleProps('valueOut', 'มูลค่าออก')} sortKey="valueOut" onSort={changeSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr
                key={row.id}
                className={row.runningBalanceByProduct < 0 ? 'cursor-pointer border-t border-red-200 bg-red-50/15 dark:bg-red-50/10 hover:bg-red-100/25 dark:hover:bg-red-50/25 focus:outline-none' : 'cursor-pointer border-t hover:bg-slate-50 dark:hover:bg-slate-800/40 focus:bg-slate-50 focus:outline-none'}
                tabIndex={0}
                onClick={() => setSelectedRow(row)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedRow(row)
                  }
                }}
              >
                <td className="whitespace-nowrap p-2 text-xs font-semibold text-slate-700 tabular-nums">{formatDateDisplay(row.date)}</td>
                <td className="truncate whitespace-nowrap p-2 text-xs font-semibold text-slate-700 tabular-nums">{row.refNo || '-'}</td>
                <td className="p-2"><Counterparty name={row.counterpartyName} refType={row.refType} /></td>
                <td className="p-2 overflow-hidden max-w-[170px]"><span className={`inline-block truncate max-w-full rounded-md px-2 py-0.5 text-xs font-medium ${row.qtyIn > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`} title={stockMovementTypeLabel(row.movementType)}>{stockMovementTypeLabel(row.movementType)}</span></td>
                <td className="truncate p-2 text-xs font-semibold text-slate-700"><span>{row.productCode ? `${row.productCode} · ` : ''}{row.productName}</span>{row.lotNo && row.lotNo !== 'OPENING' ? <span className="ml-1 text-xs font-medium text-slate-400">[{row.lotNo}]</span> : null}</td>
                <td className="p-2 text-xs font-semibold text-slate-700">
                  <div className="truncate">{row.warehouseName || '-'}</div>
                  <div className="truncate text-xs font-medium text-slate-500">{row.branchName || '-'}</div>
                </td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-emerald-600 tabular-nums">{row.qtyIn ? formatMoney(row.qtyIn) : '-'}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-red-600 tabular-nums">{row.qtyOut ? formatMoney(row.qtyOut) : '-'}</td>
                <td className={`p-2 pr-4 text-right text-xs font-semibold tabular-nums ${row.runningBalanceByProduct < 0 ? 'bg-red-100 text-red-700' : 'bg-blue-50/40 text-blue-700'}`} title="ยอดสะสม IN-OUT ทุกประเภท">{formatMoney(row.runningBalanceByProduct)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.unitCost)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-emerald-700 tabular-nums">{row.valueIn ? formatMoney(row.valueIn) : '-'}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-red-700 tabular-nums">{row.valueOut ? formatMoney(row.valueOut) : '-'}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={12}>ยังไม่มี Stock Movement</td></tr> : null}
          </tbody>
        </table>
        </div>
      </div>
      
      {selectedRow ? <StockLedgerDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function Counterparty({ name, refType }: { name: string; refType: string }) {
  if (name && name !== '-') {
    const isSupplier = refType === 'PB' || refType === 'PB-CANCEL'
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold ${isSupplier ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{isSupplier ? 'ผู้ขาย' : 'ผู้ซื้อ'}</span>
        <span className={`truncate text-xs font-medium ${isSupplier ? 'text-emerald-800' : 'text-blue-800'}`}>{name}</span>
      </div>
    )
  }
  const labelMap: Record<string, string> = { ADJ: 'นับสต๊อก', CR: 'รับคืนสินค้า', GA: 'ปรับเกรด', OB: 'ยอดยกมา', SC: 'แปลง Status', ST: 'โอนระหว่างสาขา' }
  return <span className="text-xs italic text-slate-500">{labelMap[refType] ?? refType ?? '-'}</span>
}

function stockLedgerSortValue(row: StockLedgerRow, sortKey: StockLedgerSortKey) {
  switch (sortKey) {
    case 'counterpartyName':
      return row.counterpartyName
    case 'date':
      return row.date
    case 'movementType':
      return row.movementType
    case 'productName':
      return `${row.productCode} ${row.productName}`
    case 'qtyIn':
      return row.qtyIn
    case 'qtyOut':
      return row.qtyOut
    case 'refNo':
      return row.refNo
    case 'runningBalanceByProduct':
      return row.runningBalanceByProduct
    case 'unitCost':
      return row.unitCost
    case 'valueIn':
      return row.valueIn
    case 'valueOut':
      return row.valueOut
  }
}

function compareStockLedgerRows(left: StockLedgerRow, right: StockLedgerRow, sortKey: StockLedgerSortKey, direction: StockLedgerSortDirection) {
  const leftValue = stockLedgerSortValue(left, sortKey)
  const rightValue = stockLedgerSortValue(right, sortKey)
  const base = typeof leftValue === 'number' && typeof rightValue === 'number'
    ? leftValue - rightValue
    : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'th', { numeric: true, sensitivity: 'base' })
  return direction === 'asc' ? base : -base
}

function StockLedgerSortHeader({
  activeKey,
  align = 'left',
  direction,
  label,
  onSort,
  resizeProps,
  sortKey,
}: {
  activeKey: StockLedgerSortKey
  align?: 'left' | 'right'
  direction: StockLedgerSortDirection
  label: string
  onSort: (key: StockLedgerSortKey) => void
  resizeProps?: ButtonHTMLAttributes<HTMLButtonElement>
  sortKey: StockLedgerSortKey
}) {
  return (
    <ResizableTableHead
      activeSortKey={activeKey}
      align={align}
      direction={direction}
      label={label}
      resizeProps={resizeProps}
      sortKey={sortKey}
      onSort={onSort}
    />
  )
}

function StockLedgerDetailModal({ onClose, row }: { onClose: () => void; row: StockLedgerRow }) {
  const netQty = row.qtyIn - row.qtyOut
  const netValue = row.valueIn - row.valueOut
  const productLabel = `${row.productCode ? `${row.productCode} · ` : ''}${row.productName || '-'}`

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden rounded-md border-0 bg-slate-900 dark:bg-[#0f172a] !p-0 animate-fade-in" hideClose>
        <div className="shrink-0 rounded-t-md border-b border-slate-800 dark:border-slate-200 bg-slate-900 dark:bg-[#0f172a] px-5 py-4 text-white">
          <div>
            <DialogTitle className="text-lg font-bold text-white">รายละเอียด {row.refNo || 'Stock Ledger'}</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-slate-400">
              {productLabel} · {stockMovementTypeLabel(row.movementType)}
            </DialogDescription>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 text-sm sm:p-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <DetailMetric label="เข้า" tone="emerald" value={row.qtyIn ? `${formatMoney(row.qtyIn)} กก.` : '-'} />
            <DetailMetric label="ออก" tone="red" value={row.qtyOut ? `${formatMoney(row.qtyOut)} กก.` : '-'} />
            <DetailMetric label="สุทธิ" tone={netQty >= 0 ? 'emerald' : 'red'} value={`${formatMoney(netQty)} กก.`} />
            <DetailMetric label="คงเหลือสะสม" tone={row.runningBalanceByProduct < 0 ? 'red' : 'blue'} value={`${formatMoney(row.runningBalanceByProduct)} กก.`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
            <DetailPanel title="เอกสารและที่มา">
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <DetailRow label="วันที่เอกสาร" value={row.date || '-'} />
                <DetailRow label="เลขที่เอกสาร" value={row.refNo || '-'} mono />
                <DetailRow label="ประเภท" value={stockMovementTypeLabel(row.movementType)} />
                <DetailRow className="sm:col-span-2" label="ผู้ขาย/ผู้ซื้อ" value={row.counterpartyName || '-'} />
                <div className="sm:col-span-2">
                  <div className="text-xs font-medium text-slate-500">เอกสารต้นทาง</div>
                  {row.sourcePath ? (
                    <a className="mt-1 inline-flex rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800" href={row.sourcePath}>
                      เปิดเอกสารต้นทาง
                    </a>
                  ) : (
                    <div className="mt-1 text-sm font-semibold text-slate-800">ยังไม่มี route สำหรับ ref type นี้</div>
                  )}
                </div>
              </div>
            </DetailPanel>

            <DetailPanel title="สินค้าและคลัง">
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <DetailRow className="sm:col-span-2" label="สินค้า" value={productLabel} />
                <DetailRow label="สาขา" value={row.branchName || '-'} />
                <DetailRow label="คลัง" value={row.warehouseName || '-'} />
              </div>
            </DetailPanel>
          </div>

          <DetailPanel title="มูลค่าและต้นทุน">
            <div className="grid gap-x-4 gap-y-3 sm:grid-cols-4">
              <DetailRow label="ต้นทุน/หน่วย" value={`${formatMoney(row.unitCost)} บาท`} />
              <DetailRow label="มูลค่าเข้า" value={row.valueIn ? `${formatMoney(row.valueIn)} บาท` : '-'} tone="emerald" />
              <DetailRow label="มูลค่าออก" value={row.valueOut ? `${formatMoney(row.valueOut)} บาท` : '-'} tone="red" />
              <DetailRow label="มูลค่าสุทธิ" value={`${formatMoney(netValue)} บาท`} tone={netValue >= 0 ? 'emerald' : 'red'} />
            </div>
          </DetailPanel>

          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="text-sm font-semibold text-slate-700">หมายเหตุ</div>
            <div className="mt-2 min-h-10 whitespace-pre-wrap rounded-md bg-slate-50 px-3 py-2 text-slate-600">{row.note || '-'}</div>
            {row.notAvailableForSale ? <div className="mt-3 text-xs font-semibold text-red-700">รายการนี้ถูกทำเครื่องหมายว่าไม่พร้อมขายใน ledger source</div> : null}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
          <button 
            className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-normal text-slate-700 transition-colors hover:bg-slate-50 outline-none focus:ring-0 animate-fade-in"
            type="button" 
            onClick={onClose}
          >
            ปิด
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 border-b border-slate-100 pb-1 text-xs font-bold text-slate-600 sm:text-sm">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function DetailMetric({ label, tone = 'normal', value }: { label: string; tone?: 'blue' | 'emerald' | 'normal' | 'red'; value: string }) {
  const toneClass = {
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    normal: 'text-slate-900',
    red: 'text-red-700',
  }[tone]
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-base font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}

function DetailRow({ className = '', label, mono = false, tone = 'normal', value }: { className?: string; label: string; mono?: boolean; tone?: 'blue' | 'emerald' | 'normal' | 'red'; value: string }) {
  const toneClass = {
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    normal: 'text-slate-800',
    red: 'text-red-700',
  }[tone]
  return (
    <div className={`flex flex-col py-0.5 ${className}`}>
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${mono ? 'font-mono' : ''} ${toneClass}`}>{value}</div>
    </div>
  )
}
