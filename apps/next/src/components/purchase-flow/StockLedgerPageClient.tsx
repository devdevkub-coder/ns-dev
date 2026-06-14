'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/Dialog'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AlertTriangle, Download, RotateCcw, Search, X } from 'lucide-react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { stockMovementTypeLabel } from '@/lib/stock-movement-types'
import type { StockOption } from '@/lib/stock'

type StockLedgerSortDirection = 'asc' | 'desc'
type StockLedgerSortKey = 'counterpartyName' | 'date' | 'movementType' | 'productName' | 'qtyIn' | 'qtyOut' | 'refNo' | 'runningBalanceByProduct' | 'unitCost' | 'valueIn' | 'valueOut'

const stockLedgerPageSizes = [25, 50, 80, 100]

const stockLedgerColumns: Array<ResizableColumnDefinition<StockLedgerColumnKey>> = [
  { defaultWidth: 92, key: 'date', minWidth: 82 },
  { defaultWidth: 132, key: 'refNo', minWidth: 110 },
  { defaultWidth: 320, key: 'counterpartyName', minWidth: 150 },
  { defaultWidth: 132, key: 'movementType', minWidth: 110 },
  { defaultWidth: 280, key: 'productName', minWidth: 160 },
  { defaultWidth: 92, key: 'qtyIn', minWidth: 80 },
  { defaultWidth: 92, key: 'qtyOut', minWidth: 80 },
  { defaultWidth: 112, key: 'runningBalanceByProduct', minWidth: 96 },
  { defaultWidth: 104, key: 'unitCost', minWidth: 90 },
  { defaultWidth: 112, key: 'valueIn', minWidth: 96 },
  { defaultWidth: 112, key: 'valueOut', minWidth: 96 },
]

type StockLedgerColumnKey = StockLedgerSortKey

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
  const [balanceMode, setBalanceMode] = useState<'product' | 'warehouse'>('product')
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
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const columnResize = useResizableColumns('stock.ledger', stockLedgerColumns)

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
  }, [balanceMode, branchId, fromDate, movementType, page, pageSize, productId, search, sortDirection, sortKey, toDate])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    const savedMode = window.localStorage.getItem('ns_erp_sl_balance_mode')
    if (savedMode === 'product' || savedMode === 'warehouse') setBalanceMode(savedMode)
  }, [])

  useEffect(() => {
    window.localStorage.setItem('ns_erp_sl_balance_mode', balanceMode)
  }, [balanceMode])

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
    window.location.href = `/api/stock/ledger?${params.toString()}`
  }

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? pageSize)))
  const filtersActive = Boolean(productId || branchId || movementType || fromDate || toDate || search)

  return (
    <section>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      
      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden md:block mb-3 space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              className="h-9 w-full rounded-md border py-2 pl-9 pr-3 text-sm" 
              placeholder="ค้นหาเลขเอกสาร / ผู้ขาย/ผู้ซื้อ / สาขา / คลัง..." 
              type="search" 
              value={search} 
              onChange={(event) => { setPage(1); setSearch(event.target.value); }}
            />
          </div>

          <div className="min-w-[260px]">
            <SearchCombobox
              hideLabel
              inputClassName="h-9 text-sm"
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
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-slate-100 px-3 text-xs hover:bg-slate-200" 
              type="button" 
              onClick={() => { setBranchId(''); setFromDate(''); setMovementType(''); setPage(1); setProductId(''); setSearch(''); setToDate('') }}
            >
              <RotateCcw className="h-3.5 w-3.5" /> ล้างตัวกรอง
            </button>
          ) : null}

          <button 
            className="h-9 rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200" 
            type="button" 
            onClick={() => void loadData()}
          >
            Refresh
          </button>

          <button 
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 h-9 flex items-center gap-1.5" 
            type="button" 
            onClick={exportXlsx}
          >
            <Download className="h-3.5 w-3.5" /> ส่งออก Excel
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500">Running Balance:</span>
          <MatchButton active={balanceMode === 'product'} label="ต่อสินค้า" onClick={() => { setPage(1); setBalanceMode('product') }} />
          <MatchButton active={balanceMode === 'warehouse'} label="ต่อคลัง" onClick={() => { setPage(1); setBalanceMode('warehouse') }} />

          <span className="text-xs text-slate-500 ml-4">สาขา:</span>
          <select className="h-7 rounded-md border border-slate-300 px-2 py-0.5 text-xs bg-white text-slate-800" value={branchId} onChange={(event) => { setPage(1); setBranchId(event.target.value) }}>
            <option value="">ทุกสาขา</option>
            {(data?.reference.branches ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>

          <span className="text-xs text-slate-500 ml-4">ประเภท:</span>
          <select className="h-7 rounded-md border border-slate-300 px-2 py-0.5 text-xs bg-white text-slate-800" value={movementType} onChange={(event) => { setPage(1); setMovementType(event.target.value) }}>
            <option value="">ทุกประเภท</option>
            {(data?.movementTypes ?? []).map((item) => <option key={item} value={item}>{stockMovementTypeLabel(item)}</option>)}
          </select>

          <span className="text-xs text-slate-500 ml-4">ช่วงเวลา:</span>
          <DatePickerInput className="w-[130px] !h-7 text-xs" title="จากวันที่" value={fromDate} onChange={(value) => { setPage(1); setFromDate(value) }} />
          <span className="text-slate-400">→</span>
          <DatePickerInput className="w-[130px] !h-7 text-xs" title="ถึงวันที่" value={toDate} onChange={(value) => { setPage(1); setToDate(value) }} />
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-3 space-y-2 rounded-md bg-white p-3 shadow md:hidden">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input 
              className="h-9 w-full rounded-md border py-2 pl-9 pr-3 text-sm" 
              placeholder="ค้นหา..." 
              type="search" 
              value={search} 
              onChange={(event) => { setPage(1); setSearch(event.target.value); }}
            />
          </div>
          <button className="h-9 rounded-md bg-slate-100 px-2.5 text-xs text-slate-700" type="button" onClick={() => void loadData()}>
            Refresh
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {filtersActive ? '(มี)' : ''}
          </button>
        </div>
        
        <div className="flex gap-2 border-t border-slate-100 pt-2">
          <button 
            className={`flex-1 h-8 rounded-md text-xs font-semibold ${balanceMode === 'product' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`} 
            type="button"
            onClick={() => { setPage(1); setBalanceMode('product') }}
          >
            ต่อสินค้า
          </button>
          <button 
            className={`flex-1 h-8 rounded-md text-xs font-semibold ${balanceMode === 'warehouse' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`} 
            type="button"
            onClick={() => { setPage(1); setBalanceMode('warehouse') }}
          >
            ต่อคลัง
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 md:hidden animate-fade-in">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800 font-sans">ตัวกรอง Stock Ledger</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-xl font-bold font-sans"
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
                <span className="mb-1 block text-xs font-semibold text-slate-600">ประเภทการโอน</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={movementType} onChange={(event) => { setPage(1); setMovementType(event.target.value) }}>
                  <option value="">ทุกประเภท</option>
                  {(data?.movementTypes ?? []).map((item) => <option key={item} value={item}>{stockMovementTypeLabel(item)}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600 font-sans">จากวันที่</span>
                  <DatePickerInput className="w-full h-10 text-sm" title="จากวันที่" value={fromDate} onChange={(value) => { setPage(1); setFromDate(value) }} />
                </div>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600 font-sans">ถึงวันที่</span>
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

      {movementType ? (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 animate-fade-in">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <div><b>คุณกำลังกรองประเภท {stockMovementTypeLabel(movementType)}</b> — <b>คงเหลือ</b> เป็นยอดสะสมจากทุกประเภท เพื่อให้ตรง ledger running balance</div>
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>พบทั้งหมด <span className="font-semibold text-slate-900">{data?.total ?? 0}</span> รายการ</span>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? <button className="hidden md:inline-flex h-9 rounded-md border px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button> : null}
          <select aria-label="จำนวนรายการต่อหน้า" className="h-9 rounded-md border px-2 text-sm bg-white text-slate-800" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
            {stockLedgerPageSizes.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </select>
          <button className="h-9 rounded-md border px-3 text-sm disabled:opacity-40 bg-white text-slate-700 hover:bg-slate-50" disabled={page <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
          <span className="px-1 text-sm font-medium">หน้า {page} / {totalPages}</span>
          <button className="h-9 rounded-md border px-3 text-sm disabled:opacity-40 bg-white text-slate-700 hover:bg-slate-50" disabled={page >= totalPages} type="button" onClick={() => setPage((value) => value + 1)}>ถัดไป</button>
        </div>
      </div>

      {/* Mobile Card list */}
      <div className="block md:hidden space-y-3">
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
                <span className="font-semibold text-slate-500 font-sans">สินค้า: </span>
                <span className="text-slate-800">{row.productCode ? `${row.productCode} · ` : ''}{row.productName}</span>
                {row.lotNo && row.lotNo !== 'OPENING' ? <span className="ml-1 text-[11px] font-medium text-slate-400">[{row.lotNo}]</span> : null}
              </div>
              <div>
                <span className="font-semibold text-slate-500 font-sans">ประเภทการโอน: </span>
                <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${row.qtyIn > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
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
              <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1 border-t border-slate-100/60 mt-1">
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
      <div className="hidden md:block overflow-x-auto rounded-md bg-white shadow">
        <table className="w-full text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {stockLedgerColumns.map((column, index) => {
              const style = columnResize.getColumnStyle(column.key);
              if (index === stockLedgerColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />;
              }
              return <col key={column.key} style={style} />;
            })}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="เลขบิล" resizeProps={columnResize.getResizeHandleProps('refNo', 'เลขบิล')} sortKey="refNo" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="ผู้ขาย/ผู้ซื้อ" resizeProps={columnResize.getResizeHandleProps('counterpartyName', 'ผู้ขาย/ผู้ซื้อ')} sortKey="counterpartyName" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('movementType', 'ประเภท')} sortKey="movementType" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} direction={sortDirection} label="สินค้า" resizeProps={columnResize.getResizeHandleProps('productName', 'สินค้า')} sortKey="productName" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="เข้า" resizeProps={columnResize.getResizeHandleProps('qtyIn', 'เข้า')} sortKey="qtyIn" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ออก" resizeProps={columnResize.getResizeHandleProps('qtyOut', 'ออก')} sortKey="qtyOut" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="คงเหลือ" resizeProps={columnResize.getResizeHandleProps('runningBalanceByProduct', 'คงเหลือ')} sortKey="runningBalanceByProduct" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ต้นทุน/น." resizeProps={columnResize.getResizeHandleProps('unitCost', 'ต้นทุน/น.')} sortKey="unitCost" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="มูลค่าเข้า" resizeProps={columnResize.getResizeHandleProps('valueIn', 'มูลค่าเข้า')} sortKey="valueIn" onSort={changeSort} />
              <StockLedgerSortHeader activeKey={sortKey} align="right" direction={sortDirection} label="มูลค่าออก" resizeProps={columnResize.getResizeHandleProps('valueOut', 'มูลค่าออก')} sortKey="valueOut" onSort={changeSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row) => (
              <tr
                key={row.id}
                className={row.runningBalanceByProduct < 0 ? 'cursor-pointer border-t border-red-200 bg-red-50/60 font-sans hover:bg-red-100/70 focus:bg-red-100/70 focus:outline-none' : 'cursor-pointer border-t font-sans hover:bg-slate-50 focus:bg-slate-50 focus:outline-none'}
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
                <td className="whitespace-nowrap p-2"><span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${row.qtyIn > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{stockMovementTypeLabel(row.movementType)}</span></td>
                <td className="truncate p-2 text-xs font-semibold text-slate-700"><span>{row.productCode ? `${row.productCode} · ` : ''}{row.productName}</span>{row.lotNo && row.lotNo !== 'OPENING' ? <span className="ml-1 text-[11px] font-medium text-slate-400">[{row.lotNo}]</span> : null}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-emerald-600 tabular-nums">{row.qtyIn ? formatMoney(row.qtyIn) : '-'}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-red-600 tabular-nums">{row.qtyOut ? formatMoney(row.qtyOut) : '-'}</td>
                <td className={`p-2 pr-4 text-right text-xs font-semibold tabular-nums ${row.runningBalanceByProduct < 0 ? 'bg-red-100 text-red-700' : 'bg-blue-50/40 text-blue-700'}`} title="ยอดสะสม IN-OUT ทุกประเภท">{formatMoney(row.runningBalanceByProduct)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.unitCost)}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-emerald-700 tabular-nums">{row.valueIn ? formatMoney(row.valueIn) : '-'}</td>
                <td className="p-2 pr-4 text-right text-xs font-semibold text-red-700 tabular-nums">{row.valueOut ? formatMoney(row.valueOut) : '-'}</td>
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={11}>ยังไม่มี Stock Movement</td></tr> : null}
          </tbody>
        </table>
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
        <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${isSupplier ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{isSupplier ? 'ผู้ขาย' : 'ผู้ซื้อ'}</span>
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

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-3xl !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 animate-fade-in" hideClose>
        <div className="flex items-center justify-between bg-slate-900 text-white px-5 py-4 shrink-0 border-b border-slate-800">
          <div>
            <DialogTitle className="text-lg font-bold text-white">รายละเอียด Stock Ledger</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-slate-400">
              อ่านอย่างเดียวจากรายการ ledger ที่แสดงในตาราง
            </DialogDescription>
          </div>
          <button className="text-2xl text-slate-400 hover:text-white" type="button" onClick={onClose}>&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-5 space-y-4 text-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <DetailPanel title="เอกสารอ้างอิง">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailRow label="วันที่" value={row.date || '-'} />
                <DetailRow label="เลขบิล" value={row.refNo || '-'} mono />
                <DetailRow className="col-span-2" label="ผู้ขาย/ผู้ซื้อ" value={row.counterpartyName || '-'} />
                <DetailRow label="Ref Type" value={row.refType || '-'} />
                <DetailRow label="Ref No" value={row.refId || '-'} mono />
                <DetailRow className="col-span-2" label="Movement" value={stockMovementTypeLabel(row.movementType)} />
                <div className="col-span-2">
                  {row.sourcePath ? (
                    <a className="inline-flex rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800" href={row.sourcePath}>
                      เปิดเอกสารต้นทาง
                    </a>
                  ) : (
                    <DetailRow label="เอกสารต้นทาง" value="ยังไม่มี route สำหรับ ref type นี้" />
                  )}
                </div>
              </div>
            </DetailPanel>

            <DetailPanel title="สินค้า / ที่เก็บ">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailRow className="col-span-2" label="สินค้า" value={`${row.productCode ? `${row.productCode} · ` : ''}${row.productName}`} />
                <DetailRow className="col-span-2" label="Product ID" value={row.productId || '-'} mono />
                <DetailRow label="Lot" value={row.lotNo || '-'} />
                <DetailRow label="สาขา" value={row.branchName || '-'} />
                <DetailRow className="col-span-2" label="คลัง" value={row.warehouseName || '-'} />
              </div>
            </DetailPanel>

            <DetailPanel title="จำนวน / ต้นทุน">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailRow label="เข้า" value={row.qtyIn ? `${formatMoney(row.qtyIn)} กก.` : '-'} tone="emerald" />
                <DetailRow label="ออก" value={row.qtyOut ? `${formatMoney(row.qtyOut)} กก.` : '-'} tone="red" />
                <DetailRow label="สุทธิ" value={`${formatMoney(netQty)} กก.`} tone={netQty >= 0 ? 'emerald' : 'red'} />
                <DetailRow label="ต้นทุน/หน่วย" value={`${formatMoney(row.unitCost)} บาท`} />
                <DetailRow className="col-span-2" label="คงเหลือสะสม" value={`${formatMoney(row.runningBalanceByProduct)} กก.`} tone={row.runningBalanceByProduct < 0 ? 'red' : 'blue'} />
              </div>
            </DetailPanel>

            <DetailPanel title="มูลค่า / สถานะ">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailRow label="มูลค่าเข้า" value={row.valueIn ? `${formatMoney(row.valueIn)} บาท` : '-'} tone="emerald" />
                <DetailRow label="มูลค่าออก" value={row.valueOut ? `${formatMoney(row.valueOut)} บาท` : '-'} tone="red" />
                <DetailRow label="มูลค่าสุทธิ" value={`${formatMoney(netValue)} บาท`} tone={netValue >= 0 ? 'emerald' : 'red'} />
                <DetailRow label="พร้อมขาย" value={row.notAvailableForSale ? 'No' : 'Yes'} tone={row.notAvailableForSale ? 'red' : 'emerald'} />
                <DetailRow className="col-span-2" label="สถานะสินค้า" value={row.outputCategory || '-'} />
              </div>
            </DetailPanel>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="font-semibold text-slate-700">หมายเหตุ</div>
            <div className="mt-1 whitespace-pre-wrap text-slate-600">{row.note || '-'}</div>
            <div className="mt-3 text-xs text-slate-500">คู่ค้า/ที่มา: {row.counterpartyName || '-'}</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
          <button 
            className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50 animate-fade-in" 
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
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 text-xs sm:text-sm font-bold text-slate-600 pb-1 border-b border-slate-100">{title}</div>
      <div className="space-y-2">{children}</div>
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
