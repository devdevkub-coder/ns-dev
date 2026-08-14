'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { useActionConfirmation, useUnsavedChangesGuard } from '@/components/ui/FormSafetyProvider'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type LoanContractRow = {
  contractNo: string
  duePaid: number
  dueTotal: number
  endDate: string
  installmentAmount: number
  interestRate: number
  lenderName: string
  loanType: string
  nextDue: string
  outstanding: number
  overdue: number
  principalAmount: number
  startDate: string
  status: string
  termMonths: number
}

type LoanContractsPayload = {
  filters: { statuses: string[]; types: string[] }
  rows: LoanContractRow[]
  summary: { count: number; financed: number; outstanding: number; overdue: number }
}

type DueRow = {
  contractNo: string
  daysOverdue?: number
  dueDate: string
  id: string
  interestAmount: number
  lenderName: string
  loanType: string
  paidAmount: number
  principalAmount: number
  totalDueAmount: number
}

type LoanDashboardPayload = {
  byType: { label: string; value: number }[]
  overdueList: DueRow[]
  summary: { due7: number; due30: number; dueThisMonth: number; interestThisMonth: number; odAvailable: number; odLimit: number; odUsed: number; overdueAmount: number; principalThisMonth: number; totalOutstanding: number }
  upcomingDue: DueRow[]
}

type EquityPayload = {
  row: { ownerEquityAdjustment: number; paidUpCapital: number; registeredCapital: number; retainedEarnings: number; totalEquity: number; updatedAt: string }
}

type OpeningPayload = {
  accounts: { branchCode: string; branchName: string; code: string; currency: string; name: string; odLimit: number; openingBalance: number; type: string }[]
  row: { updatedAt: string; updatedBy: string }
  summary: { apCost: number; apExpense: number; ar: number; netOther: number; stock: number }
  stock: { cutoffDate: string; goLiveDate: string; items: OpeningStockItem[]; locked: boolean; references: { branches: { code: string; id: string; name: string }[]; products: { code: string; id: string; name: string; status: string | null }[]; suppliers: { code: string; id: string; name: string }[]; warehouses: { branchId: string | null; code: string; id: string; name: string }[] }; summary: { paidValue: number; qty: number; unpaidValue: number; value: number } }
}

type OpeningStockItem = { applied: boolean; appliedApRefId?: string | null; appliedAt?: string | null; appliedRefId?: string | null; branchId: string; id: string; itemStatus: 'RM' | 'WIP' | 'FG'; linkedBillNo?: string | null; lotNo: string; note?: string | null; paid: boolean; productId: string; qty: number; supplierId?: string | null; unitCost: number; warehouseId: string }
type OpeningImportPreview = { cutoffDate: string; errors: string[]; items: OpeningStockItem[]; summary: { errorRows: number; itemRows: number; totalQty: number; totalValue: number; warnings: string[] } }

type OpeningBillImportRow = { contractNo?: string; date: string; docNo: string; error?: string; lineAmount: number; partyName: string; productCode: string; productName: string; productType?: string; quantity: number; status: 'error' | 'ready'; totalAmount: number; vatAmount: number; unitPrice: number; warning?: string }
type OpeningBillImportPreview = { branchCode: string; importType: 'purchase' | 'sales'; rows: OpeningBillImportRow[]; summary: { billCount: number; errorRows: number; inputRows: number; readyRows: number; totalValue: number } }
type OpeningPartyBalanceImportRow = { date: string; docNo: string; partyName: string; totalAmount: number; outstandingAmount: number; vatAmount: number; error?: string; status: 'error' | 'ready' }
type OpeningPartyBalanceImportPreview = { branchCode: string; importType: 'receivable' | 'payable'; rows: OpeningPartyBalanceImportRow[]; summary: { errorRows: number; inputRows: number; readyRows: number; totalValue: number } }
type OpeningCostPoolImportType = 'purchase_bill' | 'opening_po' | 'regrade'
type OpeningCostPoolImportRow = { availableQty: number; availableValue: number; category: string; date: string; docNo: string; error?: string; importType: OpeningCostPoolImportType; lineKey: string; partyName: string; productName: string; quantity: number; status: 'error' | 'ready'; unitCost: number }
type OpeningCostPoolImportPreview = { branchCode: string; importType: OpeningCostPoolImportType; rows: OpeningCostPoolImportRow[]; summary: { errorRows: number; inputRows: number; readyRows: number; totalValue: number; warehouseCode: string }; warehouseCode: string }

type HistoricalPayload = {
  months: { label: string; month: number; year: number }[]
  rows: { amount: number; categoryId: string; categoryLabel: string; metricType: string; month: number; refNo: string; year: number }[]
  summary: { cashflow: number; expense: number; pnl: number; total: number }
}

type DueColumnKey = 'amount' | 'contractNo' | 'dueDate' | 'lenderName'
type LoanContractColumnKey = 'asset' | 'contractNo' | 'duePaid' | 'installment' | 'lenderName' | 'loanType' | 'nextDue' | 'outstanding' | 'overdue' | 'principalAmount' | 'status'
type OpeningAccountColumnKey = 'branch' | 'code' | 'currency' | 'name' | 'odLimit' | 'openingBalance' | 'type'
type SortDirection = 'asc' | 'desc'
type HistoricalDisplayRow = { category: string; total: number; values: Record<string, number> }

const loanContractColumns: Array<ResizableColumnDefinition<LoanContractColumnKey>> = [
  { key: 'contractNo', defaultWidth: 145, minWidth: 120 },
  { key: 'lenderName', defaultWidth: 210, minWidth: 150 },
  { key: 'loanType', defaultWidth: 120, minWidth: 100 },
  { key: 'asset', defaultWidth: 175, minWidth: 150 },
  { key: 'principalAmount', defaultWidth: 155, minWidth: 130 },
  { key: 'outstanding', defaultWidth: 155, minWidth: 130 },
  { key: 'installment', defaultWidth: 145, minWidth: 120 },
  { key: 'duePaid', defaultWidth: 110, minWidth: 95 },
  { key: 'nextDue', defaultWidth: 125, minWidth: 105 },
  { key: 'overdue', defaultWidth: 135, minWidth: 115 },
  { key: 'status', defaultWidth: 115, minWidth: 95 },
]

const loanStatusLabels: Record<string, string> = {
  active: 'ใช้งาน',
  closed: 'ปิดสัญญา',
  overdue: 'เกินกำหนด',
}

const dueColumns: Array<ResizableColumnDefinition<DueColumnKey>> = [
  { key: 'dueDate', defaultWidth: 120, minWidth: 100 },
  { key: 'contractNo', defaultWidth: 145, minWidth: 120 },
  { key: 'lenderName', defaultWidth: 220, minWidth: 150 },
  { key: 'amount', defaultWidth: 150, minWidth: 125 },
]

const openingAccountColumns: Array<ResizableColumnDefinition<OpeningAccountColumnKey>> = [
  { key: 'code', defaultWidth: 125, minWidth: 100 },
  { key: 'name', defaultWidth: 240, minWidth: 160 },
  { key: 'type', defaultWidth: 130, minWidth: 105 },
  { key: 'branch', defaultWidth: 170, minWidth: 130 },
  { key: 'currency', defaultWidth: 110, minWidth: 90 },
  { key: 'openingBalance', defaultWidth: 170, minWidth: 135 },
  { key: 'odLimit', defaultWidth: 145, minWidth: 120 },
]

function compareSortValues(left: string | number, right: string | number) {
  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), 'th', { numeric: true })
}

function useLocalTableSort<TRow, TKey extends string>(rows: TRow[], getSortValue: (row: TRow, key: TKey) => string | number) {
  const [sortKey, setSortKey] = useState<TKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(getSortValue(left, sortKey), getSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [getSortValue, rows, sortDirection, sortKey])

  function handleSort(key: TKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  return { handleSort, sortDirection, sortedRows, sortKey }
}

function getLoanContractSortValue(row: LoanContractRow, key: LoanContractColumnKey) {
  if (key === 'asset') return ''
  if (key === 'duePaid') return row.duePaid
  if (key === 'installment') return row.installmentAmount
  return row[key]
}

function getDueSortValue(row: DueRow, key: DueColumnKey) {
  if (key === 'amount') return row.totalDueAmount - row.paidAmount
  return row[key]
}

function getOpeningAccountSortValue(row: OpeningPayload['accounts'][number], key: OpeningAccountColumnKey) {
  if (key === 'branch') return row.branchName || row.branchCode || ''
  return row[key]
}

function getHistoricalSortValue(row: HistoricalDisplayRow, key: string) {
  if (key === 'category') return row.category
  if (key === 'total') return row.total
  return row.values[key] ?? 0
}

function buildHistoricalDisplayRows(rows: HistoricalPayload['rows'], months: HistoricalPayload['months']): HistoricalDisplayRow[] {
  return Array.from(new Set(rows.map((row) => row.categoryLabel))).sort().map((category) => {
    const values = Object.fromEntries(months.map((month) => {
      const key = historicalMonthKey(month)
      const amount = rows.find((row) => row.categoryLabel === category && row.month === month.month && row.year === month.year)?.amount ?? 0
      return [key, amount]
    }))
    const total = Object.values(values).reduce((sum, value) => sum + value, 0)
    return { category, total, values }
  })
}

export function LoanContractsPageClient() {
  const { data, error, isLoading } = useApi<LoanContractsPayload>('/api/finance-accounting/loan-contracts')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const columnResize = useResizableColumns('finance-accounting.loan-contracts.list.v1', loanContractColumns)

  useEffect(() => {
    setPage(1)
  }, [search, status, type])
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      const matchesSearch = !needle || [row.contractNo, row.lenderName, row.loanType].join(' ').toLowerCase().includes(needle)
      return matchesSearch && (status === 'all' || row.status === status) && (type === 'all' || row.loanType === type)
    })
  }, [data?.rows, search, status, type])
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<LoanContractRow, LoanContractColumnKey>(rows, getLoanContractSortValue)

  const totalRows = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <StatCard label="วงเงินรวม" value={formatMoney(data?.summary.financed)} tone="blue" />
        <StatCard label="หนี้คงเหลือ" value={formatMoney(data?.summary.outstanding)} tone="cyan" />
        <StatCard label="เกินกำหนด" value={formatMoney(data?.summary.overdue)} tone="red" />
      </div>

      {/* Desktop Filter Panel */}
      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap items-center gap-2">
          <input autoComplete="off" className="min-w-[260px] flex-1 max-w-[340px] h-9 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-400 transition" placeholder="ค้นหาเลขที่สัญญา / ผู้ให้กู้..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select className="h-9 w-44 px-3 py-1.5 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="all">ทุกประเภท</option>
          {(data?.filters.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
          <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition hover:bg-slate-50" type="button" onClick={() => { setSearch(''); setType('all'); setStatus('all') }}>ล้างตัวกรอง</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">สถานะสัญญา:</span>
          <button aria-pressed={status === 'all'} className={`rounded-md border px-3 py-1 text-xs font-medium ${status === 'all' ? 'border-slate-500 bg-slate-600 text-white' : 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-200'}`} type="button" onClick={() => setStatus('all')}>ทุกสถานะ</button>
          {(data?.filters.statuses ?? []).map((item) => (
            <button aria-pressed={status === item} key={item} className={`rounded-md border px-3 py-1 text-xs font-medium ${status === item ? 'border-slate-500 bg-slate-600 text-white' : 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-200'}`} type="button" onClick={() => setStatus(item)}>{loanStatusLabel(item)}</button>
          ))}
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex gap-2 items-center">
          <input 
            autoComplete="off" className="h-9 flex-1 rounded-md border border-slate-300 bg-white px-3 text-xs outline-none placeholder-slate-400 transition focus:border-slate-400"
            placeholder="ค้นหาเลขที่สัญญา / ผู้ให้กู้..."
            type="search" 
            value={search} 
            onChange={(event) => setSearch(event.target.value)} 
          />
          <button
            type="button"
            className="h-9 items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 text-xs font-normal text-slate-700 hover:bg-slate-50 transition outline-none"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {(type !== 'all' || status !== 'all') ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <MobileFilterSheet
          bodyClassName="space-y-3"
          footer={(
            <>
              <button
                type="button"
                onClick={() => {
                  setType('all')
                  setStatus('all')
                }}
                className="flex-1 h-10 rounded-md border border-slate-200 text-slate-600 font-normal text-sm hover:bg-slate-50 transition"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 h-10 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-normal text-sm transition"
              >
                ตกลง
              </button>
            </>
          )}
          onClose={() => setShowMobileFilters(false)}
          title="ตัวกรองเพิ่มเติม"
        >
          <div>
            <label className="mb-1 block font-semibold text-slate-600 text-xs">ประเภทสัญญา</label>
            <Select
              aria-label="Type select"
              className="h-9 w-full px-3 py-1 text-sm"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="all">ทุกประเภท</option>
              {(data?.filters.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
          </div>

          <div>
            <label className="mb-1 block font-semibold text-slate-600 text-xs">สถานะสัญญา</label>
            <div aria-label="กรองสถานะสัญญา" className="flex flex-wrap gap-2" role="group">
              <button
                aria-pressed={status === 'all'}
                className={`rounded-md border px-3 py-1 text-xs font-medium ${status === 'all' ? 'border-slate-500 bg-slate-600 text-white' : 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-200'}`}
                onClick={() => setStatus('all')}
                type="button"
              >
                ทุกสถานะ
              </button>
              {(data?.filters.statuses ?? []).map((item) => (
                <button
                  aria-pressed={status === item}
                  className={`rounded-md border px-3 py-1 text-xs font-medium ${status === item ? 'border-slate-500 bg-slate-600 text-white' : 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-200'}`}
                  key={item}
                  onClick={() => setStatus(item)}
                  type="button"
                >
                  {loanStatusLabel(item)}
                </button>
              ))}
            </div>
          </div>
        </MobileFilterSheet>
      ) : null}
      {/* Pagination Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-200 shadow-sm mb-4">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? (
            <button
              className="hidden h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 lg:inline-flex"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              รีเซ็ตความกว้างตาราง
            </button>
          ) : null}
          <PageSizeDropdown value={pageSize} onChange={setPageSize} />
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

      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, maxWidth: columnResize.tableMaxWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {loanContractColumns.map((column) => (
                  <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <ResizableTableHead align="center" label="เลขสัญญา" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="contractNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('contractNo', 'เลขสัญญา')} />
                  <ResizableTableHead align="left" className="ns-table-textual-column" label="ผู้ให้กู้" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="lenderName" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('lenderName', 'ผู้ให้กู้')} />
                  <ResizableTableHead align="left" className="ns-table-textual-column" label="ประเภท" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="loanType" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('loanType', 'ประเภท')} />
                  <ResizableTableHead align="left" className="ns-table-textual-column" label="หลักทรัพย์/ทรัพย์สิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="asset" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('asset', 'หลักทรัพย์/ทรัพย์สิน')} />
                  <ResizableTableHead align="right" label="วงเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="principalAmount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('principalAmount', 'วงเงิน')} />
                  <ResizableTableHead align="right" label="หนี้คงเหลือ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="outstanding" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('outstanding', 'หนี้คงเหลือ')} />
                  <ResizableTableHead align="right" label="งวดผ่อน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="installment" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('installment', 'งวดผ่อน')} />
                  <ResizableTableHead align="right" label="จ่ายแล้ว" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="duePaid" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('duePaid', 'จ่ายแล้ว')} />
                  <ResizableTableHead align="center" label="งวดถัดไป" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="nextDue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('nextDue', 'งวดถัดไป')} />
                  <ResizableTableHead align="right" label="เกินกำหนด" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="overdue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('overdue', 'เกินกำหนด')} />
                  <ResizableTableHead align="center" label="สถานะ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="status" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <LoadingOrEmpty colSpan={loanContractColumns.length} isLoading={isLoading} rows={rows.length} />
                {pagedRows.map((row) => (
                  <tr key={row.contractNo} className="transition-colors hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-3 py-3 text-center font-mono font-semibold text-blue-700">{row.contractNo}</td>
                    <td className="ns-table-textual-column px-3 py-3 text-left font-medium text-slate-900">{row.lenderName}</td>
                    <td className="ns-table-textual-column break-words px-3 py-3 text-left text-slate-600">{row.loanType}</td>
                    <td className="ns-table-textual-column whitespace-nowrap px-3 py-3 text-left text-slate-400">-</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.principalAmount)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900">{formatMoney(row.outstanding)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.installmentAmount)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{row.duePaid}/{row.dueTotal}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-center text-slate-700">{row.nextDue || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-red-700">{formatMoney(row.overdue)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-center"><StatusPill status={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-white border border-slate-100 rounded-md overflow-hidden shadow-sm">
        <div className="p-4 text-xs font-semibold text-slate-500 bg-slate-50">รายการสัญญาเงินกู้</div>
        {isLoading && <div className="p-4 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>}
        {!isLoading && rows.length === 0 && <div className="p-4 text-center text-slate-400 text-xs">ไม่มีสัญญา</div>}
        {!isLoading && pagedRows.map((row) => (
          <div key={row.contractNo} className="p-4 space-y-2 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="block whitespace-nowrap font-mono text-sm font-semibold text-blue-700">{row.contractNo}</span>
                <span className="text-slate-400 block mt-0.5">{row.lenderName} · {row.loanType}</span>
              </div>
              <StatusPill status={row.status} />
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50/50 p-2.5 rounded-xl border border-slate-100/50">
              <div><span className="text-slate-400 block">วงเงิน (Financed)</span><span className="font-semibold text-slate-800">{formatMoney(row.principalAmount)}</span></div>
              <div><span className="text-slate-400 block">ยอดคงเหลือ</span><span className="font-bold text-slate-900">{formatMoney(row.outstanding)}</span></div>
              <div><span className="text-slate-400 block">งวดผ่อนชำระ</span><span className="font-semibold text-slate-800">{formatMoney(row.installmentAmount)}</span></div>
              <div><span className="text-slate-400 block">ชำระแล้ว</span><span className="font-medium text-slate-700">{row.duePaid}/{row.dueTotal} งวด</span></div>
              <div><span className="text-slate-400 block">งวดถัดไป</span><span className="font-medium text-slate-700">{row.nextDue || '-'}</span></div>
              <div><span className="text-slate-400 block">เกินกำหนด</span><span className="font-bold text-red-600">{formatMoney(row.overdue)}</span></div>
            </div>
          </div>
        ))}
      </div>


    </section>
  )
}

export function LoanDashboardPageClient() {
  const { data, error, isLoading } = useApi<LoanDashboardPayload>('/api/finance-accounting/loan-dashboard')
  const maxType = Math.max(...(data?.byType ?? []).map((row) => row.value), 0)
  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <SharedKpiCard icon="💳" label="ภาระหนี้รวม" note="บาท · ทุกประเภทสินเชื่อ" tone="blue" value={formatMoney(data?.summary.totalOutstanding)} />
          <div className="grid grid-cols-3 gap-3 text-sm">
            <MiniHero label="ครบเดือนนี้" value={formatMoney(data?.summary.dueThisMonth)} />
            <MiniHero label="เกินกำหนด" value={formatMoney(data?.summary.overdueAmount)} tone="red" />
            <MiniHero label="ดอกเบี้ยเดือนนี้" value={formatMoney(data?.summary.interestThisMonth)} tone="amber" />
            <MiniHero label="วงเงิน OD" value={formatMoney(data?.summary.odLimit)} />
            <MiniHero label="OD ใช้ไป" value={formatMoney(data?.summary.odUsed)} tone="amber" />
            <MiniHero label="OD เหลือใช้" value={formatMoney(data?.summary.odAvailable)} />
          </div>
        </div>
        <Panel title=" สัดส่วนหนี้ตามประเภท">{(data?.byType ?? []).map((row) => <Bar key={row.label} color="bg-blue-500" label={row.label} max={maxType} value={row.value} />)} {!isLoading && (data?.byType.length ?? 0) === 0 ? <EmptyText>ยังไม่มีข้อมูลสินเชื่อ</EmptyText> : null}</Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="หนี้คงเหลือ" value={formatMoney(data?.summary.totalOutstanding)} tone="blue" />
        <StatCard label="ครบเดือนนี้" value={formatMoney(data?.summary.dueThisMonth)} tone="amber" />
        <StatCard label="เกินกำหนด" value={formatMoney(data?.summary.overdueAmount)} tone="red" />
        <StatCard label="ดอกเบี้ยเดือนนี้" value={formatMoney(data?.summary.interestThisMonth)} tone="amber" />
        <StatCard label="งวดใน 7 วัน" value={data?.summary.due7 ?? 0} tone="cyan" />
        <StatCard label="งวดใน 30 วัน" value={data?.summary.due30 ?? 0} tone="blue" />
        <StatCard label="วงเงิน OD" value={formatMoney(data?.summary.odLimit)} tone="cyan" />
        <StatCard label="OD ใช้ไป" value={formatMoney(data?.summary.odUsed)} tone="amber" />
        <StatCard label="OD เหลือใช้" value={formatMoney(data?.summary.odAvailable)} tone="blue" />
      </div>
      <Panel title=" ภาระหนี้แยกตามประเภท">{(data?.byType ?? []).map((row) => <Bar key={row.label} color="bg-cyan-500" label={row.label} max={data?.summary.totalOutstanding ?? 0} value={row.value} />)} {!isLoading && (data?.byType.length ?? 0) === 0 ? <EmptyText>ยังไม่มีข้อมูลสินเชื่อ</EmptyText> : null}</Panel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title=" จ่ายเดือนนี้: เงินต้น vs ดอกเบี้ย"><div className="grid grid-cols-2 gap-3"><StatCard label="เงินต้น" value={formatMoney(data?.summary.principalThisMonth)} tone="blue" /><StatCard label="ดอกเบี้ย" value={formatMoney(data?.summary.interestThisMonth)} tone="amber" /></div><div className="mt-2 text-center text-xs text-slate-500">งวดใน 7 วัน: <b className="text-amber-700">{data?.summary.due7 ?? 0}</b> · 30 วัน: <b className="text-blue-700">{data?.summary.due30 ?? 0}</b></div></Panel>
        <Panel title="สรุปสถานะ"><div className="space-y-3"><AlertLine label="ยอดเกินกำหนด" tone="red" value={formatMoney(data?.summary.overdueAmount)} /><AlertLine label="ครบเดือนนี้" tone="amber" value={formatMoney(data?.summary.dueThisMonth)} /><AlertLine label="งวดที่ต้องจ่าย 30 วัน" tone="blue" value={data?.summary.due30 ?? 0} /></div></Panel>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><DueTable isLoading={isLoading} rows={data?.upcomingDue ?? []} title=" งวดที่จะครบใน 30 วัน" tone="amber" /><DueTable isLoading={isLoading} rows={data?.overdueList ?? []} title=" งวดเกินกำหนด" tone="red" /></div>
    </section>
  )
}

export function EquityMaintenancePageClient() {
  const { data, error, isLoading } = useApi<EquityPayload>('/api/finance-accounting/equity-maint')
  const row = data?.row
  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <div className="max-w-xl rounded-xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ReadField label="ทุนจดทะเบียน" value={formatMoney(row?.registeredCapital)} />
          <ReadField label="ทุนชำระแล้ว (Paid-up)" value={formatMoney(row?.paidUpCapital)} />
          <ReadField label="กำไรสะสม (ปีก่อน)" value={formatMoney(row?.retainedEarnings)} />
          <ReadField label="รายการปรับปรุงส่วนทุน" value={formatMoney(row?.ownerEquityAdjustment)} />
        </div>
        <div className="mt-4 rounded-md bg-purple-50 p-3 text-sm text-purple-800">ส่วนทุนรวม: <b>{formatMoney(row?.totalEquity)}</b></div>
      </div>
    </section>
  )
}

export function OpeningBalancePageClient() {
  const { requestConfirmation } = useActionConfirmation()
  const { data, error } = useApi<OpeningPayload>('/api/finance-accounting/opening-balance')
  const columnResize = useResizableColumns('finance-accounting.opening-balance.accounts.v1', openingAccountColumns)
  const accounts = useMemo(() => data?.accounts ?? [], [data?.accounts])
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<OpeningPayload['accounts'][number], OpeningAccountColumnKey>(accounts, getOpeningAccountSortValue)
  const tabs = ['ตั้งค่า', 'เงินสด/ธนาคาร/FCD/OD', 'AR ลูกหนี้', 'AP ต้นทุน', 'AP ค่าใช้จ่าย', 'สต็อก', 'Cost Pool', 'ทรัพย์สินถาวร', 'เงินกู้', 'VAT/WHT', 'อื่นๆ', 'ส่วนทุน/YTD', 'ตรวจงบดุล + ล็อก']
  const [activeTab, setActiveTab] = useState(tabs[0])
  const [stockItems, setStockItems] = useState<OpeningStockItem[]>([])
  const [stockItemsBaseline, setStockItemsBaseline] = useState<OpeningStockItem[]>([])
  const [stockMessage, setStockMessage] = useState<string | null>(null)
  const [stockError, setStockError] = useState<string | null>(null)
  const [stockBusy, setStockBusy] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importDate, setImportDate] = useState('2026-04-30')
  const [importBranch, setImportBranch] = useState('')
  const [importPreview, setImportPreview] = useState<OpeningImportPreview | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [billImportBranch, setBillImportBranch] = useState('')
  const [billImportType, setBillImportType] = useState<'purchase' | 'sales'>('purchase')
  const [billImportFile, setBillImportFile] = useState<File | null>(null)
  const [billImportPreview, setBillImportPreview] = useState<OpeningBillImportPreview | null>(null)
  const [billImportError, setBillImportError] = useState<string | null>(null)
  const [billImportMessage, setBillImportMessage] = useState<string | null>(null)
  const [billImportBusy, setBillImportBusy] = useState(false)
  const [balanceImportFile, setBalanceImportFile] = useState<File | null>(null)
  const [balanceImportPreview, setBalanceImportPreview] = useState<OpeningPartyBalanceImportPreview | null>(null)
  const [balanceImportError, setBalanceImportError] = useState<string | null>(null)
  const [balanceImportMessage, setBalanceImportMessage] = useState<string | null>(null)
  const [balanceImportBusy, setBalanceImportBusy] = useState(false)
  const stockItemsHydratedRef = useRef(false)
  const stockItemsSnapshot = useMemo(() => JSON.stringify(stockItems), [stockItems])
  const stockItemsBaselineSnapshot = useMemo(() => JSON.stringify(stockItemsBaseline), [stockItemsBaseline])
  const stockItemsAreDirty = stockItemsSnapshot !== stockItemsBaselineSnapshot
  useUnsavedChangesGuard(stockItemsAreDirty)
  useEffect(() => {
    if (!data?.stock.items || stockItemsHydratedRef.current) return
    stockItemsHydratedRef.current = true
    if (stockItemsSnapshot !== stockItemsBaselineSnapshot) {
      const serverItemIds = new Set(data.stock.items.map((item) => item.id))
      setStockItems([...data.stock.items, ...stockItems.filter((item) => !serverItemIds.has(item.id))])
      setStockItemsBaseline(data.stock.items)
      return
    }
    setStockItems(data.stock.items)
    setStockItemsBaseline(data.stock.items)
  }, [data?.stock.items, stockItems, stockItemsBaselineSnapshot, stockItemsSnapshot])
  const [costPoolImportBranch, setCostPoolImportBranch] = useState('')
  const [costPoolImportWarehouse, setCostPoolImportWarehouse] = useState('')
  const [costPoolImportType, setCostPoolImportType] = useState<OpeningCostPoolImportType>('purchase_bill')
  const [costPoolImportFile, setCostPoolImportFile] = useState<File | null>(null)
  const [costPoolImportPreview, setCostPoolImportPreview] = useState<OpeningCostPoolImportPreview | null>(null)
  const [costPoolImportError, setCostPoolImportError] = useState<string | null>(null)
  const [costPoolImportMessage, setCostPoolImportMessage] = useState<string | null>(null)
  const [costPoolImportBusy, setCostPoolImportBusy] = useState(false)
  useEffect(() => { if (data?.stock.cutoffDate) setImportDate(data.stock.cutoffDate); if (!importBranch && data?.stock.references.branches[0]) setImportBranch(data.stock.references.branches[0].code) }, [data?.stock.cutoffDate, data?.stock.references.branches, importBranch])
  function updateStockItem(id: string, patch: Partial<OpeningStockItem>) { setStockItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item)); setStockMessage(null); setStockError(null) }
  async function saveStockItems(
    items: OpeningStockItem[],
    successMessage: string,
    { cutoffDate, rethrow = false }: { cutoffDate?: string; rethrow?: boolean } = {},
  ) {
    stockItemsHydratedRef.current = true
    setStockBusy(true); setStockMessage(null); setStockError(null)
    try { const payload = await dailyFetchJson<{ stock: OpeningStockItem[] }>('/api/finance-accounting/opening-balance', { body: JSON.stringify({ action: 'save', ...(cutoffDate ? { cutoffDate } : {}), stockItems: items }), method: 'POST' }); setStockItems(payload.stock); setStockItemsBaseline(payload.stock); setStockMessage(successMessage) }
    catch (caught) { setStockError(caught instanceof Error ? caught.message : 'บันทึกรายการยกยอดไม่ได้'); if (rethrow) throw caught } finally { setStockBusy(false) }
  }
  async function previewStockImport() {
    if (!importFile) { setStockError('เลือกไฟล์ Excel ก่อนตรวจสอบ'); return }
    if (!importBranch) { setStockError('เลือกสาขาก่อนตรวจสอบไฟล์'); return }
    setImportBusy(true); setStockMessage(null); setStockError(null); setImportPreview(null)
    try {
      const form = new FormData()
      form.append('branchCode', importBranch); form.append('cutoffDate', importDate); form.append('file', importFile)
      const response = await fetch('/api/finance-accounting/opening-balance', { body: form, method: 'POST' })
      const payload = await response.json() as OpeningImportPreview & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'ตรวจสอบไฟล์นำเข้าไม่ได้')
      setImportPreview(payload); setStockMessage(payload.errors.length ? 'ตรวจสอบไฟล์แล้ว พบรายการที่ต้องแก้ไข' : 'ตรวจสอบไฟล์ผ่าน สามารถนำเข้ารายการ Pending ได้')
    } catch (caught) { setStockError(caught instanceof Error ? caught.message : 'ตรวจสอบไฟล์นำเข้าไม่ได้') } finally { setImportBusy(false) }
  }
  async function saveImportedStock() {
    if (!importPreview || importPreview.errors.length) { setStockError('ต้องแก้ไขข้อผิดพลาดในไฟล์ก่อนนำเข้า'); return }
    const existingIds = new Set(stockItems.map((item) => item.id))
    const merged = [...stockItems, ...importPreview.items.filter((item) => !existingIds.has(item.id))]
    try {
      await saveStockItems(merged, `นำเข้า Stock Opening ${importPreview.items.length} รายการแล้ว`, { cutoffDate: importPreview.cutoffDate, rethrow: true })
    } catch {
      return
    }
    setImportPreview(null); setImportFile(null)
  }
  async function applyStockItem(item: OpeningStockItem) {
    if (!item.productId || !item.branchId || !item.warehouseId || item.qty <= 0 || item.unitCost <= 0) { setStockError('กรอกสินค้า สาขา คลัง จำนวน และต้นทุนให้ครบก่อน Apply'); return }
    if (!item.paid && !item.supplierId) { setStockError('ถ้ายังไม่จ่าย ต้องเลือก Supplier เพื่อสร้าง AP ก่อน Apply'); return }
    stockItemsHydratedRef.current = true
    setStockBusy(true); setStockMessage(null); setStockError(null)
    try { const payload = await dailyFetchJson<{ item: OpeningStockItem }>('/api/finance-accounting/opening-balance', { body: JSON.stringify({ action: 'apply', item }), method: 'POST' }); const updateItem = (items: OpeningStockItem[]) => items.some((candidate) => candidate.id === payload.item.id) ? items.map((candidate) => candidate.id === payload.item.id ? payload.item : candidate) : [...items, payload.item]; setStockItems(updateItem); setStockItemsBaseline(updateItem); setStockMessage(`Apply รายการ ${item.lotNo || 'OPENING'} แล้ว — สร้าง OPENING_STOCK_IN ใน Stock Ledger เรียบร้อย`) }
    catch (caught) { setStockError(caught instanceof Error ? caught.message : 'Apply ยอดสต็อกไม่ได้') } finally { setStockBusy(false) }
  }
  async function unapplyStockItem(item: OpeningStockItem) {
    stockItemsHydratedRef.current = true
    setStockBusy(true); setStockMessage(null); setStockError(null)
    try { await dailyFetchJson('/api/finance-accounting/opening-balance', { body: JSON.stringify({ action: 'unapply', itemId: item.id }), method: 'POST' }); const updateItem = (items: OpeningStockItem[]) => items.map((candidate) => candidate.id === item.id ? { ...candidate, applied: false, appliedAt: null, appliedRefId: null, appliedApRefId: null } : candidate); setStockItems(updateItem); setStockItemsBaseline(updateItem); setStockMessage('ยกเลิก Apply แล้ว สามารถแก้ไขรายการได้') }
    catch (caught) { setStockError(caught instanceof Error ? caught.message : 'ยกเลิก Apply ไม่ได้'); throw caught } finally { setStockBusy(false) }
  }
  function requestUnapplyStockItem(item: OpeningStockItem) {
    requestConfirmation({
      confirmLabel: 'ยืนยัน Unapply',
      description: `ต้องการ Unapply รายการ ${item.lotNo || 'OPENING'} หรือไม่? ระบบจะนำรายการนี้ออกจาก Stock Ledger และ AP ที่ระบบสร้างไว้`,
      destructive: true,
      onConfirm: () => unapplyStockItem(item),
      title: 'ยืนยันการ Unapply ยอดสต็อก',
    })
  }
  function addStockItem() { const firstBranch = data?.stock.references.branches[0]; const firstWarehouse = data?.stock.references.warehouses.find((warehouse) => warehouse.branchId === firstBranch?.id); setStockItems((current) => [...current, { applied: false, branchId: firstBranch?.id ?? '', id: `OB-ST-${Date.now()}`, itemStatus: 'RM', lotNo: 'OPENING', paid: true, productId: '', qty: 0, unitCost: 0, warehouseId: firstWarehouse?.id ?? '' }]); setStockMessage(null); setStockError(null) }
  function requestRemoveStockItem(item: OpeningStockItem) {
    if (item.applied) {
      setStockError('รายการนี้ Apply แล้ว ให้กด Unapply ก่อนลบ')
      return
    }
    requestConfirmation({
      confirmLabel: 'ยืนยันลบ',
      description: `ต้องการลบรายการยกยอด ${item.lotNo || 'OPENING'} หรือไม่?`,
      destructive: true,
      onConfirm: () => saveStockItems(stockItems.filter((candidate) => candidate.id !== item.id), 'ลบรายการยกยอดแล้ว', { rethrow: true }),
      title: 'ยืนยันการลบรายการยกยอด',
    })
  }
  const stockValue = stockItems.reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  const stockPaidValue = stockItems.filter((item) => item.paid).reduce((sum, item) => sum + item.qty * item.unitCost, 0)
  const stockRefs = data?.stock.references
  async function previewOpeningBillImport() {
    setBillImportError(null); setBillImportMessage(null); setBillImportPreview(null)
    if (!billImportBranch || !billImportFile) { setBillImportError('เลือกสาขาและไฟล์ Excel บิลก่อนตรวจสอบ'); return }
    setBillImportBusy(true)
    try {
      const form = new FormData(); form.set('branchCode', billImportBranch); form.set('importType', billImportType); form.set('file', billImportFile)
      const response = await fetch('/api/finance-accounting/opening-balance/bills', { body: form, method: 'POST' }); const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'อ่านไฟล์บิลไม่สำเร็จ')
      setBillImportPreview(payload as OpeningBillImportPreview)
    } catch (caught) { setBillImportError(caught instanceof Error ? caught.message : 'อ่านไฟล์บิลไม่สำเร็จ') } finally { setBillImportBusy(false) }
  }
  async function commitOpeningBillImport() {
    if (!billImportPreview || billImportPreview.summary.errorRows > 0) return
    setBillImportError(null); setBillImportMessage(null); setBillImportBusy(true)
    try {
      const response = await fetch('/api/finance-accounting/opening-balance/bills', { body: JSON.stringify({ action: 'commit', branchCode: billImportPreview.branchCode, importType: billImportPreview.importType, rows: billImportPreview.rows }), headers: { 'Content-Type': 'application/json' }, method: 'POST' }); const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'ยืนยันนำเข้าบิลไม่สำเร็จ')
      setBillImportMessage(`นำเข้าสำเร็จ ${payload.billCount} บิล ${formatMoney(payload.inputRows)} รายการ`); setBillImportPreview(null); setBillImportFile(null)
    } catch (caught) { setBillImportError(caught instanceof Error ? caught.message : 'ยืนยันนำเข้าบิลไม่สำเร็จ') } finally { setBillImportBusy(false) }
  }
  async function previewOpeningPartyBalanceImport() {
    setBalanceImportError(null); setBalanceImportMessage(null); setBalanceImportPreview(null)
    if (!billImportBranch || !balanceImportFile) { setBalanceImportError('เลือกสาขาและไฟล์ Excel ลูกหนี้/เจ้าหนี้ก่อนตรวจสอบ'); return }
    setBalanceImportBusy(true)
    try {
      const form = new FormData(); form.set('branchCode', billImportBranch); form.set('importType', billImportType === 'purchase' ? 'payable' : 'receivable'); form.set('file', balanceImportFile)
      const response = await fetch('/api/finance-accounting/opening-balance/balances', { body: form, method: 'POST' }); const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'อ่านไฟล์ยอดคงค้างไม่สำเร็จ')
      setBalanceImportPreview(payload as OpeningPartyBalanceImportPreview)
    } catch (caught) { setBalanceImportError(caught instanceof Error ? caught.message : 'อ่านไฟล์ยอดคงค้างไม่สำเร็จ') } finally { setBalanceImportBusy(false) }
  }
  async function commitOpeningPartyBalanceImport() {
    if (!balanceImportPreview || balanceImportPreview.summary.errorRows > 0) return
    setBalanceImportError(null); setBalanceImportMessage(null); setBalanceImportBusy(true)
    try {
      const response = await fetch('/api/finance-accounting/opening-balance/balances', { body: JSON.stringify({ action: 'commit', branchCode: balanceImportPreview.branchCode, importType: balanceImportPreview.importType, rows: balanceImportPreview.rows }), headers: { 'Content-Type': 'application/json' }, method: 'POST' }); const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'ยืนยันนำเข้ายอดคงค้างไม่สำเร็จ')
      setBalanceImportMessage(`นำเข้าสำเร็จ ${payload.inputRows} รายการ`); setBalanceImportPreview(null); setBalanceImportFile(null)
    } catch (caught) { setBalanceImportError(caught instanceof Error ? caught.message : 'ยืนยันนำเข้ายอดคงค้างไม่สำเร็จ') } finally { setBalanceImportBusy(false) }
  }
  const costPoolWarehouses = (data?.stock.references.warehouses ?? []).filter((warehouse) => warehouse.branchId === (data?.stock.references.branches ?? []).find((branch) => branch.code === costPoolImportBranch)?.id)
  async function previewOpeningCostPoolImport() {
    setCostPoolImportError(null); setCostPoolImportMessage(null); setCostPoolImportPreview(null)
    if (!costPoolImportBranch || !costPoolImportWarehouse || !costPoolImportFile) { setCostPoolImportError('เลือกสาขา คลัง ประเภท และไฟล์ Excel Cost Pool ก่อนตรวจสอบ'); return }
    setCostPoolImportBusy(true)
    try {
      const form = new FormData(); form.set('branchCode', costPoolImportBranch); form.set('warehouseCode', costPoolImportWarehouse); form.set('importType', costPoolImportType); form.set('file', costPoolImportFile)
      const response = await fetch('/api/finance-accounting/opening-balance/cost-pool', { body: form, method: 'POST' }); const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'อ่านไฟล์ Cost Pool ไม่สำเร็จ')
      setCostPoolImportPreview(payload as OpeningCostPoolImportPreview)
    } catch (caught) { setCostPoolImportError(caught instanceof Error ? caught.message : 'อ่านไฟล์ Cost Pool ไม่สำเร็จ') } finally { setCostPoolImportBusy(false) }
  }
  async function commitOpeningCostPoolImport() {
    if (!costPoolImportPreview || costPoolImportPreview.summary.errorRows > 0) return
    setCostPoolImportError(null); setCostPoolImportMessage(null); setCostPoolImportBusy(true)
    try {
      const response = await fetch('/api/finance-accounting/opening-balance/cost-pool', { body: JSON.stringify({ action: 'commit', branchCode: costPoolImportPreview.branchCode, importType: costPoolImportPreview.importType, rows: costPoolImportPreview.rows, warehouseCode: costPoolImportPreview.warehouseCode }), headers: { 'Content-Type': 'application/json' }, method: 'POST' }); const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'ยืนยันนำเข้า Cost Pool ไม่สำเร็จ')
      setCostPoolImportMessage(`นำเข้าสำเร็จ ${payload.inputRows} รายการ เปิดดูได้ที่หน้า Cost Pool`); setCostPoolImportPreview(null); setCostPoolImportFile(null)
    } catch (caught) { setCostPoolImportError(caught instanceof Error ? caught.message : 'ยืนยันนำเข้า Cost Pool ไม่สำเร็จ') } finally { setCostPoolImportBusy(false) }
  }
  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); if (value === 'AP ต้นทุน') setBillImportType('purchase'); if (value === 'AR ลูกหนี้') setBillImportType('sales') }} className="gap-0">
        <TabsList variant="line" className="w-full flex-wrap overflow-x-auto">
          {tabs.map((tab) => <TabsTrigger key={tab} value={tab} variant="line">{tab}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {activeTab === 'สต็อก' ? <section className="space-y-4">
        {stockError ? <ErrorBox message={stockError} /> : null}
        {stockMessage ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{stockMessage}</div> : null}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="mb-2 text-sm font-bold text-blue-900">นำเข้า Stock Opening จาก Excel</div>
          <div className="mb-3 text-xs text-blue-800">ระบบจะตรวจสอบสินค้า/ประเภท/คลังกับ Master ก่อนสร้างรายการ Pending ในตารางด้านล่าง จากนั้นกด Apply ตาม flow เดิมเพื่อบันทึกเข้า Stock Ledger</div>
          <div className="grid gap-3 md:grid-cols-[180px_180px_1fr_auto] md:items-end">
            <label className="text-xs font-semibold text-slate-700">สาขา<Select className="mt-1 h-10 w-full" value={importBranch} onChange={(event) => setImportBranch(event.target.value)}><option value="">เลือกสาขา</option>{(stockRefs?.branches ?? []).map((branch) => <option key={branch.id} value={branch.code}>{branch.code} - {branch.name}</option>)}</Select></label>
            <label className="text-xs font-semibold text-slate-700">วันที่ยกยอด<input className="mt-1 h-10 w-full rounded-md border border-slate-300 px-2" type="date" value={importDate} onChange={(event) => setImportDate(event.target.value)} /></label>
            <label className="text-xs font-semibold text-slate-700">ไฟล์ Excel (.xlsx)<input className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs" accept=".xlsx" type="file" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportPreview(null) }} /></label>
            <button className="h-9 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={importBusy || stockBusy || data?.stock.locked} onClick={previewStockImport} type="button">{importBusy ? 'กำลังตรวจสอบ...' : 'ตรวจสอบไฟล์'}</button>
          </div>
          {importPreview ? <div className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-xs">
            <div className="flex flex-wrap gap-x-5 gap-y-1 font-semibold text-slate-700"><span>แถวที่นำเข้าได้: {importPreview.summary.itemRows}</span><span>จำนวนรวม: {importPreview.summary.totalQty.toLocaleString('th-TH')}</span><span>มูลค่า: {formatMoney(importPreview.summary.totalValue)}</span><span className={importPreview.errors.length ? 'text-red-700' : 'text-emerald-700'}>ข้อผิดพลาด: {importPreview.summary.errorRows}</span></div>
            {importPreview.errors.length ? <div className="mt-2 space-y-1 text-red-700">{importPreview.errors.slice(0, 20).map((message) => <div key={message}>• {message}</div>)}{importPreview.errors.length > 20 ? <div>และอีก {importPreview.errors.length - 20} รายการ</div> : null}</div> : null}
            {importPreview.summary.warnings.length ? <div className="mt-2 space-y-1 text-amber-700">{importPreview.summary.warnings.slice(0, 10).map((message) => <div key={message}>• {message}</div>)}</div> : null}
            <button className="mt-3 h-9 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={importBusy || stockBusy || importPreview.errors.length > 0 || data?.stock.locked} onClick={saveImportedStock} type="button">นำเข้ารายการเข้าตาราง</button>
          </div> : null}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4"><StatCard label="จำนวนรวม" value={`${formatMoney(stockItems.reduce((sum, item) => sum + item.qty, 0))} กก.`} tone="blue" /><StatCard label="มูลค่ารวม" value={formatMoney(stockValue)} tone="amber" /><StatCard label="จ่ายแล้ว" value={formatMoney(stockPaidValue)} tone="cyan" /><StatCard label="ยังไม่จ่าย" value={formatMoney(stockValue - stockPaidValue)} tone="red" /></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">ยกยอด ณ วันที่ <b>{data?.stock.cutoffDate || '-'}</b> และเริ่มใช้งานวันที่ <b>{data?.stock.goLiveDate || '-'}</b> · กด Apply ทีละรายการเพื่อสร้าง <b>OPENING_STOCK_IN</b> ใน Stock Ledger · ถ้าไม่ติ๊ก “จ่ายแล้ว” และเลือก Supplier ระบบจะสร้าง AP เจ้าหนี้ยกมาให้อัตโนมัติ</div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold text-slate-800">📦 Stock Opening — Inventory ยกมา</h2><div className="flex gap-2"><button className="h-9 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={stockBusy || data?.stock.locked} onClick={addStockItem} type="button">+ เพิ่มรายการ</button><button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50" disabled={stockBusy || data?.stock.locked} onClick={() => saveStockItems(stockItems, 'บันทึกรายการยกยอดแล้ว')} type="button">{stockBusy ? 'กำลังบันทึก...' : 'บันทึก'}</button></div></div>
          <div className="overflow-x-auto"><table className="ns-table min-w-[1250px] w-full text-xs"><thead className="bg-slate-100 text-slate-600"><tr><th className="ns-table-textual-column p-2 text-left">สินค้า</th><th className="whitespace-nowrap p-2 text-center">Status</th><th className="ns-table-textual-column p-2 text-left">สาขา</th><th className="ns-table-textual-column p-2 text-left">คลัง</th><th className="whitespace-nowrap p-2 text-center">Lot</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">WAC/หน่วย</th><th className="p-2 text-right">มูลค่า</th><th className="whitespace-nowrap p-2 text-center">จ่ายแล้ว</th><th className="ns-table-textual-column p-2 text-left">Supplier</th><th className="whitespace-nowrap p-2 text-center">เลขบิลซื้อ</th><th className="whitespace-nowrap p-2 text-center">สถานะ</th><th className="whitespace-nowrap p-2 text-center"><span className="sr-only">จัดการ</span></th></tr></thead><tbody className="divide-y divide-slate-100">
            {stockItems.map((item) => { const warehouses = (stockRefs?.warehouses ?? []).filter((warehouse) => warehouse.branchId === item.branchId); return <tr className={item.applied ? 'bg-emerald-50/50' : undefined} key={item.id}>
              <td className="ns-table-textual-column p-2 text-left"><Select className="h-9 min-w-[220px]" disabled={item.applied || stockBusy} value={item.productId} onChange={(event) => updateStockItem(item.id, { productId: event.target.value })}><option value="">เลือกสินค้า</option>{(stockRefs?.products ?? []).map((product) => <option key={product.id} value={product.id}>{product.code} - {product.name}</option>)}</Select></td><td className="whitespace-nowrap p-2 text-center"><Select className="h-9" disabled={item.applied || stockBusy} value={item.itemStatus} onChange={(event) => updateStockItem(item.id, { itemStatus: event.target.value as OpeningStockItem['itemStatus'] })}><option value="RM">RM</option><option value="WIP">WIP</option><option value="FG">FG</option></Select></td><td className="ns-table-textual-column p-2 text-left"><Select className="h-9" disabled={item.applied || stockBusy} value={item.branchId} onChange={(event) => updateStockItem(item.id, { branchId: event.target.value, warehouseId: '' })}><option value="">เลือกสาขา</option>{(stockRefs?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.code}</option>)}</Select></td><td className="ns-table-textual-column p-2 text-left"><Select className="h-9" disabled={item.applied || stockBusy} value={item.warehouseId} onChange={(event) => updateStockItem(item.id, { warehouseId: event.target.value })}><option value="">เลือกคลัง</option>{warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} - {warehouse.name}</option>)}</Select></td><td className="whitespace-nowrap p-2 text-center"><input className="h-9 w-28 rounded-md border border-slate-300 px-2 text-center font-mono" disabled={item.applied || stockBusy} value={item.lotNo} onChange={(event) => updateStockItem(item.id, { lotNo: event.target.value })} /></td><td className="p-2 text-right"><input className="h-9 w-24 rounded-md border border-slate-300 px-2 text-right tabular-nums" disabled={item.applied || stockBusy} min="0" step="0.001" type="number" value={item.qty || ''} onChange={(event) => updateStockItem(item.id, { qty: Number(event.target.value) || 0 })} /></td><td className="p-2 text-right"><input className="h-9 w-24 rounded-md border border-slate-300 px-2 text-right tabular-nums" disabled={item.applied || stockBusy} min="0.01" step="0.01" type="number" value={item.unitCost || ''} onChange={(event) => updateStockItem(item.id, { unitCost: Number(event.target.value) || 0 })} /></td><td className="p-2 text-right font-semibold tabular-nums">{formatMoney(item.qty * item.unitCost)}</td><td className="whitespace-nowrap p-2 text-center"><input checked={item.paid} disabled={item.applied || stockBusy} type="checkbox" onChange={(event) => updateStockItem(item.id, { paid: event.target.checked })} /></td><td className="ns-table-textual-column p-2 text-left"><Select className="h-9 min-w-[170px]" disabled={item.applied || item.paid || stockBusy} value={item.supplierId ?? ''} onChange={(event) => updateStockItem(item.id, { supplierId: event.target.value || null })}><option value="">เลือก Supplier</option>{(stockRefs?.suppliers ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code} - {supplier.name}</option>)}</Select></td><td className="whitespace-nowrap p-2 text-center"><input className="h-9 w-32 rounded-md border border-slate-300 px-2 text-center font-mono" disabled={item.applied || item.paid || stockBusy} value={item.linkedBillNo ?? ''} onChange={(event) => updateStockItem(item.id, { linkedBillNo: event.target.value || null })} /></td><td className="whitespace-nowrap p-2 text-center">{item.applied ? <span className="rounded bg-emerald-100 px-2 py-1 font-bold text-emerald-700">✓ Applied</span> : <span className="rounded bg-amber-100 px-2 py-1 text-amber-700">Pending</span>}</td><td className="whitespace-nowrap p-2 text-center"><div className="flex justify-center gap-1">{item.applied ? <button className="rounded bg-slate-100 px-2 py-1 text-slate-700" disabled={stockBusy || data?.stock.locked} onClick={() => requestUnapplyStockItem(item)} type="button">Unapply</button> : <button className="rounded bg-emerald-600 px-2 py-1 font-bold text-white" disabled={stockBusy || data?.stock.locked} onClick={() => applyStockItem(item)} type="button">Apply</button>}<button className="px-1 py-1 text-red-600" disabled={stockBusy || data?.stock.locked || item.applied} onClick={() => requestRemoveStockItem(item)} type="button">✕</button></div></td>
            </tr> })}
            {!stockItems.length ? <tr><td className="p-8 text-center text-slate-400" colSpan={13}>ยังไม่มีรายการยกยอด กด “+ เพิ่มรายการ” เพื่อเริ่มต้น</td></tr> : null}
          </tbody></table></div>
        </div>
      </section> : null}
      {activeTab === 'Cost Pool' ? <section className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4 lg:grid-cols-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xl sm:size-12">💰</div><div><div className="text-xs text-purple-700">Opening Cost Pool</div><div className="font-bold text-slate-900">นำเข้าต้นทุนตั้งต้น</div></div></div>
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl sm:size-12">🔎</div><div><div className="text-xs text-slate-600">ขั้นตอน</div><div className="font-bold text-slate-900">ตรวจสอบก่อนยืนยัน</div></div></div>
          <div className="col-span-2 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:col-span-1 sm:gap-4 sm:p-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl sm:size-12">✅</div><div><div className="text-xs text-emerald-700">ผลกระทบ</div><div className="font-bold text-slate-900">ไม่สร้างบิลหรือ Stock Ledger</div></div></div>
        </div>
        <Panel title="นำเข้า Cost Pool Opening จาก Excel">
          <div className="rounded-md border border-purple-200 bg-purple-50 p-3 text-xs leading-5 text-purple-900">รองรับชีต <b>COST POOL 13.07</b> แยกเป็น บิลซื้อ, เปิด PO และ ปรับเกรด ระบบจะใช้ยอด <b>รอขาย</b> เป็นจำนวน Cost Pool และเก็บเป็น Opening Cost Pool เพื่อไม่สร้างบิลหรือสต็อกซ้ำ</div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="text-xs font-semibold text-slate-600">ประเภท<select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal" value={costPoolImportType} onChange={(event) => { setCostPoolImportType(event.target.value as OpeningCostPoolImportType); setCostPoolImportPreview(null) }}><option value="purchase_bill">บิลซื้อ</option><option value="opening_po">เปิด PO</option><option value="regrade">ปรับเกรด</option></select></label>
            <label className="text-xs font-semibold text-slate-600">สาขา<select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal" value={costPoolImportBranch} onChange={(event) => { setCostPoolImportBranch(event.target.value); setCostPoolImportWarehouse(''); setCostPoolImportPreview(null) }}><option value="">เลือกสาขา</option>{(data?.stock.references.branches ?? []).map((branch) => <option key={branch.code} value={branch.code}>{branch.code} - {branch.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">คลัง<select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal" value={costPoolImportWarehouse} onChange={(event) => { setCostPoolImportWarehouse(event.target.value); setCostPoolImportPreview(null) }}><option value="">เลือกคลัง</option>{costPoolWarehouses.map((warehouse) => <option key={warehouse.code} value={warehouse.code}>{warehouse.code} - {warehouse.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-600">ไฟล์ Excel (.xlsx)<input className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-normal" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" type="file" onChange={(event) => { setCostPoolImportFile(event.target.files?.[0] ?? null); setCostPoolImportPreview(null) }} /></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><button className="h-9 rounded-md bg-slate-800 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={costPoolImportBusy || !costPoolImportBranch || !costPoolImportWarehouse || !costPoolImportFile} onClick={() => void previewOpeningCostPoolImport()} type="button">{costPoolImportBusy ? 'กำลังตรวจสอบ...' : 'ตรวจสอบไฟล์ Cost Pool'}</button>{costPoolImportPreview ? <button className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={costPoolImportBusy || costPoolImportPreview.summary.errorRows > 0} onClick={() => void commitOpeningCostPoolImport()} type="button">ยืนยันนำเข้า Cost Pool</button> : null}{costPoolImportError ? <span className="text-sm font-semibold text-red-700">{costPoolImportError}</span> : null}{costPoolImportMessage ? <span className="text-sm font-semibold text-emerald-700">{costPoolImportMessage}</span> : null}</div>
          {costPoolImportPreview ? <div className="mt-4 overflow-x-auto rounded-md border border-slate-200"><div className="grid min-w-[720px] grid-cols-4 gap-2 border-b border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><span>รายการ <b>{costPoolImportPreview.summary.inputRows}</b></span><span>พร้อมนำเข้า <b>{costPoolImportPreview.summary.readyRows}</b></span><span>ผิดพลาด <b className={costPoolImportPreview.summary.errorRows ? 'text-red-700' : ''}>{costPoolImportPreview.summary.errorRows}</b></span><span>มูลค่าต้นทุน <b>{formatMoney(costPoolImportPreview.summary.totalValue)}</b></span></div><table className="ns-table min-w-[720px] w-full text-xs"><thead className="bg-slate-100"><tr><th className="whitespace-nowrap p-2 text-center">เลขที่</th><th className="whitespace-nowrap p-2 text-center">วันที่</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">รอขาย</th><th className="p-2 text-right">ต้นทุน/หน่วย</th><th className="whitespace-nowrap p-2 text-center">ผลตรวจ</th></tr></thead><tbody>{costPoolImportPreview.rows.slice(0, 100).map((row) => <tr key={`${row.lineKey}-${row.docNo}`} className="border-t border-slate-100"><td className="whitespace-nowrap p-2 text-center font-mono">{row.docNo || '-'}</td><td className="whitespace-nowrap p-2 text-center">{row.date}</td><td className="p-2 text-left">{row.productName}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{formatMoney(row.availableQty)}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{formatMoney(row.unitCost)}</td><td className={`whitespace-nowrap p-2 text-center ${row.status === 'error' ? 'font-semibold text-red-700' : 'text-emerald-700'}`}>{row.error ?? 'พร้อมนำเข้า'}</td></tr>)}</tbody></table></div> : null}
        </Panel>
      </section> : null}
      {activeTab !== 'สต็อก' ? <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><StatCard label="AR" value={formatMoney(data?.summary.ar)} tone="blue" /><StatCard label="AP ต้นทุน" value={formatMoney(data?.summary.apCost)} tone="red" /><StatCard label="AP ค่าใช้จ่าย" value={formatMoney(data?.summary.apExpense)} tone="red" /><StatCard label="สต็อก" value={formatMoney(data?.summary.stock)} tone="amber" /><StatCard label="สุทธิอื่นๆ" value={formatMoney(data?.summary.netOther)} /></div>
      <Panel title="ข้อมูลพื้นฐาน"><div className="grid grid-cols-2 gap-3 text-sm"><ReadField label="วันที่ตัดยอด" value="2026-04-30" /><ReadField label="วันเริ่มใช้งาน" value="2026-05-01" /></div><div className="mt-3 text-xs text-slate-400">อัปเดตล่าสุด: {data?.row.updatedAt || '-'}</div></Panel>
      {activeTab === 'AP ต้นทุน' || activeTab === 'AR ลูกหนี้' ? <>
        <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4 lg:grid-cols-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-5"><div className={`flex size-10 shrink-0 items-center justify-center rounded-full text-xl sm:size-12 ${billImportType === 'purchase' ? 'bg-red-100' : 'bg-blue-100'}`}>{billImportType === 'purchase' ? '📤' : '📥'}</div><div><div className={`text-xs ${billImportType === 'purchase' ? 'text-red-600' : 'text-blue-600'}`}>{billImportType === 'purchase' ? 'AP ต้นทุนคงเหลือ' : 'AR ลูกหนี้คงเหลือ'}</div><div className="font-bold tabular-nums text-slate-900">{formatMoney(billImportType === 'purchase' ? data?.summary.apCost : data?.summary.ar)}</div></div></div>
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-5"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xl sm:size-12">🔎</div><div><div className="text-xs text-slate-600">ขั้นตอน</div><div className="font-bold text-slate-900">ตรวจสอบก่อนยืนยัน</div></div></div>
          <div className="col-span-2 flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-5 lg:col-span-1"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xl sm:size-12">🧾</div><div><div className="text-xs text-emerald-600">เอกสารที่รองรับ</div><div className="font-bold text-slate-900">{billImportType === 'purchase' ? 'บิลซื้อ / เจ้าหนี้' : 'บิลขาย / ลูกหนี้'}</div></div></div>
        </div>
      <Panel title={`นำเข้า Opening ${billImportType === 'purchase' ? 'บิลซื้อ (AP)' : 'บิลขาย (AR)'} จาก Excel`}>
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">แท็บนี้ใช้สำหรับนำเข้า {billImportType === 'purchase' ? 'บิลซื้อ' : 'บิลขาย'} โดยเฉพาะ บิลที่ยืนยันจะถูกบันทึกเป็นเอกสารย้อนหลังสถานะ Opening และไม่สร้าง Stock Ledger หรือรายการรับเงิน/จ่ายเงินซ้ำอัตโนมัติ</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">สาขา<select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-sm font-normal" value={billImportBranch} onChange={(event) => setBillImportBranch(event.target.value)}><option value="">เลือกสาขา</option>{(data?.stock.references.branches ?? []).map((branch) => <option key={branch.code} value={branch.code}>{branch.code} - {branch.name}</option>)}</select></label>
          <label className="text-xs font-semibold text-slate-600 md:col-span-2">ไฟล์ Excel (.xlsx)<input className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-normal" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" type="file" onChange={(event) => { setBillImportFile(event.target.files?.[0] ?? null); setBillImportPreview(null) }} /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><button className="h-9 rounded-md bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={billImportBusy || !billImportBranch || !billImportFile} onClick={() => void previewOpeningBillImport()} type="button">{billImportBusy ? 'กำลังตรวจสอบ...' : 'ตรวจสอบไฟล์บิล'}</button>{billImportPreview ? <button className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50" disabled={billImportBusy || billImportPreview.summary.errorRows > 0} onClick={() => void commitOpeningBillImport()} type="button">ยืนยันนำเข้าบิล</button> : null}{billImportError ? <span className="text-sm font-semibold text-red-700">{billImportError}</span> : null}{billImportMessage ? <span className="text-sm font-semibold text-emerald-700">{billImportMessage}</span> : null}</div>
        {billImportPreview ? <div className="mt-4 overflow-x-auto rounded-md border border-slate-200"><div className="grid min-w-[720px] grid-cols-4 gap-2 border-b border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><span>จำนวนบิล <b>{billImportPreview.summary.billCount}</b></span><span>พร้อมนำเข้า <b>{billImportPreview.summary.readyRows}</b></span><span>ผิดพลาด <b className={billImportPreview.summary.errorRows ? 'text-red-700' : ''}>{billImportPreview.summary.errorRows}</b></span><span>มูลค่ารวม <b>{formatMoney(billImportPreview.summary.totalValue)} บาท</b></span></div><table className="ns-table min-w-[720px] w-full text-xs"><thead className="bg-slate-100"><tr><th className="whitespace-nowrap p-2 text-center">เลขที่</th><th className="whitespace-nowrap p-2 text-center">วันที่</th><th className="p-2 text-left">คู่ค้า</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">จำนวน</th><th className="p-2 text-right">รวม</th><th className="whitespace-nowrap p-2 text-center">ผลตรวจ</th></tr></thead><tbody>{billImportPreview.rows.slice(0, 100).map((row, index) => <tr key={`${row.docNo}-${row.productName}-${index}`} className="border-t border-slate-100"><td className="whitespace-nowrap p-2 text-center font-mono">{row.docNo}</td><td className="whitespace-nowrap p-2 text-center">{row.date}</td><td className="p-2 text-left">{row.partyName}</td><td className="p-2 text-left">{row.productName}<div className="text-[10px] text-slate-500">{row.productCode || 'ไม่พบรหัส'}</div></td><td className="whitespace-nowrap p-2 text-right tabular-nums">{formatMoney(row.quantity)}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{formatMoney(row.totalAmount)}</td><td className={`whitespace-nowrap p-2 text-center ${row.status === 'error' ? 'font-semibold text-red-700' : 'text-emerald-700'}`}>{row.error ?? row.warning ?? 'พร้อมนำเข้า'}</td></tr>)}</tbody></table></div> : null}
      </Panel>
      <Panel title={`นำเข้า Opening ${billImportType === 'purchase' ? 'เจ้าหนี้คงค้าง' : 'ลูกหนี้คงค้าง'} จาก Excel`}>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">ใช้กับชีต <b>{billImportType === 'purchase' ? 'เจ้าหนี้ 13.07' : 'ลูกหนี้ 13.07'}</b> สำหรับยอดคงค้างที่ไม่มีรายละเอียดบิล ห้ามนำเข้าเลขที่เอกสารซ้ำกับบิลซื้อ/บิลขาย</div>
        <div className="mt-3 grid gap-3 md:grid-cols-3"><div className="text-xs font-semibold text-slate-600"><span className="block">สาขา</span><div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal">{billImportBranch || 'เลือกสาขาจากส่วน Import บิลด้านบน'}</div></div><label className="text-xs font-semibold text-slate-600 md:col-span-2">ไฟล์ Excel (.xlsx)<input className="mt-1 block h-9 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-normal" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" type="file" onChange={(event) => { setBalanceImportFile(event.target.files?.[0] ?? null); setBalanceImportPreview(null) }} /></label></div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><button className="h-9 rounded-md bg-slate-800 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={balanceImportBusy || !billImportBranch || !balanceImportFile} onClick={() => void previewOpeningPartyBalanceImport()} type="button">{balanceImportBusy ? 'กำลังตรวจสอบ...' : 'ตรวจสอบยอดคงค้าง'}</button>{balanceImportPreview ? <button className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={balanceImportBusy || balanceImportPreview.summary.errorRows > 0} onClick={() => void commitOpeningPartyBalanceImport()} type="button">ยืนยันนำเข้ายอดคงค้าง</button> : null}{balanceImportError ? <span className="text-sm font-semibold text-red-700">{balanceImportError}</span> : null}{balanceImportMessage ? <span className="text-sm font-semibold text-emerald-700">{balanceImportMessage}</span> : null}</div>
        {balanceImportPreview ? <div className="mt-4 overflow-x-auto rounded-md border border-slate-200"><div className="grid min-w-[620px] grid-cols-4 gap-2 border-b border-slate-200 bg-slate-50 p-3 text-xs text-slate-700"><span>รายการ <b>{balanceImportPreview.summary.inputRows}</b></span><span>พร้อมนำเข้า <b>{balanceImportPreview.summary.readyRows}</b></span><span>ผิดพลาด <b className={balanceImportPreview.summary.errorRows ? 'text-red-700' : ''}>{balanceImportPreview.summary.errorRows}</b></span><span>ยอดค้างรวม <b>{formatMoney(balanceImportPreview.summary.totalValue)}</b></span></div><table className="ns-table min-w-[620px] w-full text-xs"><thead className="bg-slate-100"><tr><th className="whitespace-nowrap p-2 text-center">เลขที่</th><th className="whitespace-nowrap p-2 text-center">วันที่</th><th className="p-2 text-left">คู่ค้า</th><th className="p-2 text-right">ยอดรวม</th><th className="p-2 text-right">ยอดค้าง</th><th className="whitespace-nowrap p-2 text-center">ผลตรวจ</th></tr></thead><tbody>{balanceImportPreview.rows.slice(0, 100).map((row, index) => <tr key={`${row.docNo}-${index}`} className="border-t border-slate-100"><td className="whitespace-nowrap p-2 text-center font-mono">{row.docNo}</td><td className="whitespace-nowrap p-2 text-center">{row.date}</td><td className="p-2 text-left">{row.partyName}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{formatMoney(row.totalAmount)}</td><td className="whitespace-nowrap p-2 text-right tabular-nums">{formatMoney(row.outstandingAmount)}</td><td className={`whitespace-nowrap p-2 text-center ${row.status === 'error' ? 'font-semibold text-red-700' : 'text-emerald-700'}`}>{row.error ?? 'พร้อมนำเข้า'}</td></tr>)}</tbody></table></div> : null}
      </Panel>
      </> : null}
      {activeTab !== 'AR ลูกหนี้' && activeTab !== 'AP ต้นทุน' && activeTab !== 'Cost Pool' ? <>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          {columnResize.hasCustomWidths ? (
            <div className="flex justify-end border-b border-slate-100 bg-white px-3 py-2">
              <button
                className="h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={columnResize.resetColumnWidths}
              >
                รีเซ็ตความกว้างตาราง
              </button>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, maxWidth: columnResize.tableMaxWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {openingAccountColumns.map((column) => (
                  <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <ResizableTableHead align="center" label="เลขที่บัญชี" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="code" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('code', 'เลขที่บัญชี')} />
                  <ResizableTableHead align="left" className="ns-table-textual-column" label="ชื่อบัญชี" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="name" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('name', 'ชื่อบัญชี')} />
                  <ResizableTableHead align="left" className="ns-table-textual-column" label="ประเภท" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="type" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} />
                  <ResizableTableHead align="left" className="ns-table-textual-column" label="สาขา/คลัง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="branch" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('branch', 'สาขาหรือคลัง')} />
                  <ResizableTableHead align="center" label="สกุลเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="currency" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('currency', 'สกุลเงิน')} />
                  <ResizableTableHead align="right" label="ยอดเปิดบัญชี" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="openingBalance" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('openingBalance', 'ยอดเปิดบัญชี')} />
                  <ResizableTableHead align="right" label="วงเงิน OD" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="odLimit" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('odLimit', 'วงเงิน OD')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <LoadingOrEmpty colSpan={openingAccountColumns.length} isLoading={false} rows={accounts.length} />
                {sortedRows.map((account) => (
                  <tr key={`${account.code || account.name}-${account.name}`} className="transition-colors hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-3 py-3 text-center font-mono text-slate-700">{account.code || '-'}</td>
                    <td className="ns-table-textual-column px-3 py-3 text-left font-medium text-slate-900">{account.name}</td>
                    <td className="ns-table-textual-column break-words px-3 py-3 text-left text-slate-600">{account.type}</td>
                    <td className="ns-table-textual-column px-3 py-3 text-left text-slate-600">{account.branchName || account.branchCode || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-center text-slate-600">{account.currency}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-900">{formatMoney(account.openingBalance)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(account.odLimit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-white border border-slate-100 rounded-md overflow-hidden shadow-sm">
        <div className="p-4 text-xs font-semibold text-slate-500 bg-slate-50">บัญชีและยอดเปิดบัญชี</div>
        {accounts.length === 0 && <div className="p-4 text-center text-slate-400 text-xs">ไม่มีข้อมูล</div>}
        {sortedRows.map((account) => (
          <div key={`${account.code || account.name}-${account.name}`} className="p-4 space-y-2 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="font-semibold text-slate-900 text-sm block">{account.name}</span>
                <span className="font-mono text-slate-500 block text-xs mt-0.5">{account.code || '-'} · {account.type}</span>
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{account.currency}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50/50 p-2.5 text-slate-600 rounded">
              <div><span className="text-slate-400">สาขา/คลัง:</span> {account.branchName || account.branchCode || '-'}</div>
              <div><span className="text-slate-400">วงเงิน OD:</span> {formatMoney(account.odLimit)}</div>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-slate-100/50">
              <span className="text-slate-400 font-medium">ยอดเปิดบัญชี</span>
              <span className="font-bold text-slate-900 text-sm">{formatMoney(account.openingBalance)}</span>
            </div>
          </div>
        ))}
      </div>
      </> : null}
      </> : null}
    </section>
  )
}

function historicalMonthKey(month: HistoricalPayload['months'][number]) {
  return `month-${month.year}-${month.month}`
}

export function HistoricalDataPageClient() {
  const { data, error, isLoading } = useApi<HistoricalPayload>('/api/finance-accounting/historical-data')
  const [tab, setTab] = useState<'expense' | 'pnl' | 'cashflow'>('expense')
  const months = useMemo(() => data?.months ?? [], [data?.months])
  const rows = useMemo(() => (data?.rows ?? []).filter((row) => row.metricType === tab), [data?.rows, tab])
  const historicalRows = useMemo(() => buildHistoricalDisplayRows(rows, months), [months, rows])
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<HistoricalDisplayRow, string>(historicalRows, getHistoricalSortValue)
  const historicalColumns = useMemo<Array<ResizableColumnDefinition<string>>>(() => [
    { key: 'category', defaultWidth: 260, minWidth: 170 },
    ...months.map((month) => ({ key: historicalMonthKey(month), defaultWidth: 130, minWidth: 105 })),
    { key: 'total', defaultWidth: 160, minWidth: 130 },
  ], [months])
  const columnResize = useResizableColumns(`finance-accounting.historical-data.${tab}.v1`, historicalColumns)

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <Tabs className="gap-0" value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList className="w-full flex-nowrap overflow-x-auto" variant="line">
          <TabsTrigger value="expense" variant="line">ค่าใช้จ่าย (Expenses)</TabsTrigger>
          <TabsTrigger value="pnl" variant="line">งบกำไรขาดทุน (P&amp;L)</TabsTrigger>
          <TabsTrigger value="cashflow" variant="line">งบกระแสเงินสด</TabsTrigger>
        </TabsList>
      </Tabs>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          {columnResize.hasCustomWidths ? (
            <div className="flex justify-end border-b border-slate-100 bg-white px-3 py-2">
              <button
                className="h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={columnResize.resetColumnWidths}
              >
                รีเซ็ตความกว้างตาราง
              </button>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, maxWidth: columnResize.tableMaxWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {historicalColumns.map((column) => (
                  <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <ResizableTableHead label="รายการ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="category" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('category', 'รายการ')} />
                  {months.map((month) => (
                    <ResizableTableHead key={month.label} align="right" label={month.label} activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey={historicalMonthKey(month)} onSort={handleSort} resizeProps={columnResize.getResizeHandleProps(historicalMonthKey(month), month.label)} />
                  ))}
                  <ResizableTableHead align="right" label="รวม 4 เดือน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="total" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('total', 'รวม 4 เดือน')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <HistoricalRows isLoading={isLoading} months={months} rows={sortedRows} />
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-white border border-slate-100 rounded-md overflow-hidden shadow-sm">
        <div className="p-4 text-xs font-semibold text-slate-500 bg-slate-50">ประวัติข้อมูลย้อนหลัง</div>
        <HistoricalRowsMobile isLoading={isLoading} months={months} rows={sortedRows} />
      </div>
    </section>
  )
}

function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    dailyFetchJson<T>(url)
      .then((payload) => { if (mounted) setData(payload) })
      .catch((caught) => { if (mounted) setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้') })
      .finally(() => { if (mounted) setIsLoading(false) })
    return () => { mounted = false }
  }, [url])
  return { data, error, isLoading }
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">{children}</div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><h2 className="mb-3 text-xs font-bold text-slate-800">{title}</h2>{children}</div>
}

function StatCard({ label, tone = 'slate', value }: { label: string; tone?: 'amber' | 'blue' | 'cyan' | 'red' | 'slate'; value: number | string }) {
  return <SharedKpiCard label={label} tone={tone} value={value} />
}

function MiniHero({ label, tone, value }: { label: string; tone?: 'amber' | 'red'; value: string }) {
  const color = tone === 'red' ? 'text-red-600 font-bold' : tone === 'amber' ? 'text-amber-600 font-bold' : 'text-slate-800 font-bold'
  return (
    <div>
      <div className="text-xs text-slate-400 font-medium">{label}</div>
      <div className={`text-sm ${color}`}>{value}</div>
    </div>
  )
}

function Bar({ color, label, max, value }: { color: string; label: string; max: number; value: number }) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="mb-3.5 text-xs">
      <div className="mb-1 flex justify-between">
        <span className="text-slate-650 font-medium">{label}</span>
        <b className="text-slate-800">{formatMoney(value)}</b>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function DueTable({ isLoading, rows, title, tone }: { isLoading: boolean; rows: DueRow[]; title: string; tone: 'amber' | 'red' }) {
  const heading = tone === 'red' ? 'border-red-105 bg-red-50/50 text-red-700' : 'border-amber-105 bg-amber-50/50 text-amber-700'
  const columnResize = useResizableColumns(`finance-accounting.loan-dashboard.due-${tone}.v1`, dueColumns)
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<DueRow, DueColumnKey>(rows, getDueSortValue)

  return (
    <div className="overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 font-bold text-xs ${heading}`}>
        <span>{title} ({rows.length})</span>
        {columnResize.hasCustomWidths ? (
          <button
            className="hidden h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 lg:inline-flex"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            รีเซ็ตความกว้างตาราง
          </button>
        ) : null}
      </div>
      
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, maxWidth: columnResize.tableMaxWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {dueColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              <ResizableTableHead align="center" label="วันครบกำหนด" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="dueDate" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('dueDate', 'วันครบกำหนด')} />
              <ResizableTableHead align="center" label="เลขสัญญา" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="contractNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('contractNo', 'เลขสัญญา')} />
              <ResizableTableHead align="left" className="ns-table-textual-column" label="ผู้ให้กู้" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="lenderName" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('lenderName', 'ผู้ให้กู้')} />
              <ResizableTableHead align="right" label="ยอดต้องจ่าย" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'ยอดต้องจ่าย')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <LoadingOrEmpty colSpan={dueColumns.length} isLoading={isLoading} rows={rows.length} emptyText="ไม่มี" />
            {sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50/50">
                <td className="whitespace-nowrap px-3 py-3 text-center text-slate-700">{row.dueDate}</td>
                <td className="whitespace-nowrap px-3 py-3 text-center font-mono font-semibold text-blue-700">{row.contractNo}</td>
                <td className="ns-table-textual-column px-3 py-3 text-left font-medium text-slate-900">{row.lenderName}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900">{formatMoney(row.totalDueAmount - row.paidAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-slate-100">
        {isLoading && <div className="p-4 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>}
        {!isLoading && rows.length === 0 && <div className="p-4 text-center text-slate-400 text-xs">ไม่มีงวดที่ต้องชำระ</div>}
        {!isLoading && sortedRows.map((row) => (
          <div key={row.id} className="p-3 space-y-1.5 text-xs hover:bg-slate-50/50 transition">
            <div className="flex justify-between items-center">
              <span className="whitespace-nowrap font-semibold text-slate-900">{row.dueDate}</span>
              <span className="whitespace-nowrap font-mono font-semibold text-blue-700">{row.contractNo}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>ผู้ให้กู้: {row.lenderName}</span>
              <span>ยอด: <b className="text-slate-800 font-bold">{formatMoney(row.totalDueAmount - row.paidAmount)}</b></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AlertLine({ label, tone, value }: { label: string; tone: 'amber' | 'blue' | 'red'; value: number | string }) {
  const map = {
    red: 'border-red-200 bg-red-50/30 text-red-800',
    amber: 'border-amber-200 bg-amber-50/30 text-amber-800',
    blue: 'border-blue-200 bg-blue-50/30 text-blue-800'
  }
  return (
    <div className={`rounded-md border p-3.5 shadow-sm ${map[tone]} text-xs`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="text-sm font-bold tracking-tight text-slate-900">{value}</span>
      </div>
    </div>
  )
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      <span className="mb-1 block">{label}</span>
      <input className="w-full rounded-md border border-slate-100 bg-slate-50 px-3 py-1.5 text-right text-xs outline-none focus:ring-0" readOnly value={value} />
    </label>
  )
}

function HistoricalRows({ isLoading, months, rows }: { isLoading: boolean; months: HistoricalPayload['months']; rows: HistoricalDisplayRow[] }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={months.length + 2}>กำลังโหลดข้อมูล</td></tr>
  if (rows.length === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={months.length + 2}>ยังไม่มีข้อมูลย้อนหลัง</td></tr>
  return rows.map((row) => (
    <tr key={row.category} className="transition-colors hover:bg-slate-50/50">
      <td className="px-3 py-3 font-medium text-slate-900">{row.category}</td>
      {months.map((month) => (
        <td key={month.label} className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.values[historicalMonthKey(month)])}</td>
      ))}
      <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900">{formatMoney(row.total)}</td>
    </tr>
  ))
}

function HistoricalRowsMobile({ isLoading, months, rows }: { isLoading: boolean; months: HistoricalPayload['months']; rows: HistoricalDisplayRow[] }) {
  if (isLoading) return <div className="p-8 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>
  if (rows.length === 0) return <div className="p-8 text-center text-slate-400 text-xs">ยังไม่มีข้อมูลย้อนหลัง</div>
  return rows.map((row) => (
    <div key={row.category} className="p-4 space-y-2 text-xs hover:bg-slate-50/50 transition">
      <div className="font-semibold text-slate-900 text-sm">{row.category}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-slate-50/50 p-2.5 rounded-xl border border-slate-100/50 text-slate-650">
        {months.map((month) => (
          <div key={month.label} className="flex justify-between">
            <span>{month.label}:</span>
            <span className="font-medium text-slate-800">{formatMoney(row.values[historicalMonthKey(month)])}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between items-center pt-1.5 border-t border-slate-100/50">
        <span className="text-slate-400 font-medium">รวม 4 เดือน</span>
        <span className="font-bold text-slate-950">{formatMoney(row.total)}</span>
      </div>
    </div>
  ))
}

function LoadingOrEmpty({ colSpan, emptyText = 'ยังไม่มีข้อมูล', isLoading, rows }: { colSpan: number; emptyText?: string; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>{emptyText}</td></tr>
  return null
}

function StatusPill({ status }: { status: string }) {
  const normalizedStatus = status.toLowerCase()
  const color = normalizedStatus === 'active' ? 'bg-emerald-50 text-emerald-700' : normalizedStatus === 'closed' ? 'bg-blue-50 text-blue-700' : normalizedStatus === 'overdue' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>{loanStatusLabel(status)}</span>
}

function loanStatusLabel(status: string) {
  return loanStatusLabels[status.toLowerCase()] ?? status
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="text-xs text-slate-400 font-medium py-4 text-center">{children}</div>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
