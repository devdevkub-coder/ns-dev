'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
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
  summary: { due7: number; due30: number; dueThisMonth: number; interestThisMonth: number; overdueAmount: number; principalThisMonth: number; totalOutstanding: number }
  upcomingDue: DueRow[]
}

type EquityPayload = {
  row: { ownerEquityAdjustment: number; paidUpCapital: number; registeredCapital: number; retainedEarnings: number; totalEquity: number; updatedAt: string }
}

type OpeningPayload = {
  accounts: { branchCode: string; branchName: string; code: string; currency: string; name: string; odLimit: number; openingBalance: number; type: string }[]
  row: { updatedAt: string; updatedBy: string }
  summary: { apCost: number; apExpense: number; ar: number; netOther: number; stock: number }
}

type HistoricalPayload = {
  months: { label: string; month: number; year: number }[]
  rows: { amount: number; categoryId: string; categoryLabel: string; metricType: string; month: number; refNo: string; year: number }[]
  summary: { cashflow: number; expense: number; pnl: number; total: number }
}

type DueColumnKey = 'amount' | 'contractNo' | 'dueDate' | 'lenderName'
type LoanContractColumnKey = 'actions' | 'asset' | 'contractNo' | 'duePaid' | 'installment' | 'lenderName' | 'loanType' | 'nextDue' | 'outstanding' | 'overdue' | 'principalAmount' | 'status'
type OpeningAccountColumnKey = 'branch' | 'code' | 'currency' | 'name' | 'odLimit' | 'openingBalance' | 'type'
type SortDirection = 'asc' | 'desc'
type HistoricalDisplayRow = { category: string; total: number; values: Record<string, number> }

const loanContractColumns: Array<ResizableColumnDefinition<LoanContractColumnKey>> = [
  { key: 'contractNo', defaultWidth: 145, minWidth: 120 },
  { key: 'lenderName', defaultWidth: 210, minWidth: 150 },
  { key: 'loanType', defaultWidth: 120, minWidth: 100 },
  { key: 'asset', defaultWidth: 100, minWidth: 80 },
  { key: 'principalAmount', defaultWidth: 155, minWidth: 130 },
  { key: 'outstanding', defaultWidth: 155, minWidth: 130 },
  { key: 'installment', defaultWidth: 145, minWidth: 120 },
  { key: 'duePaid', defaultWidth: 110, minWidth: 95 },
  { key: 'nextDue', defaultWidth: 125, minWidth: 105 },
  { key: 'overdue', defaultWidth: 135, minWidth: 115 },
  { key: 'status', defaultWidth: 115, minWidth: 95 },
  { key: 'actions', defaultWidth: 210, minWidth: 160 },
]

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
  if (key === 'asset' || key === 'actions') return ''
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
      {/* Desktop Actions */}
      <div className="hidden lg:flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <DisabledButton>📥 Template</DisabledButton>
        <DisabledButton>📤 Import Excel</DisabledButton>
        <div className="ml-auto">
          <button 
            type="button" 
            disabled
            className="h-9 px-4 rounded-lg bg-blue-600/50 text-white text-sm font-semibold opacity-60 cursor-not-allowed outline-none"
          >
            + เพิ่มสัญญา
          </button>
        </div>
      </div>
      {error ? <ErrorBox message={error} /> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="จำนวนสัญญา" value={data?.summary.count ?? 0} />
        <StatCard label="วงเงินรวม" value={formatMoney(data?.summary.financed)} tone="blue" />
        <StatCard label="หนี้คงเหลือ" value={formatMoney(data?.summary.outstanding)} tone="cyan" />
        <StatCard label="เกินกำหนด" value={formatMoney(data?.summary.overdue)} tone="red" />
      </div>

      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm border border-slate-200">
        <input autoComplete="off" className="min-w-0 flex-1 h-9 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-400 transition" placeholder="ค้นหา loanNo/contractNo/lender..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400 transition cursor-pointer" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="all">Type: ทั้งหมด</option>
          {(data?.filters.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400 transition cursor-pointer" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Status: ทั้งหมด</option>
          {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm lg:hidden space-y-3">
        <div className="flex gap-2 items-center">
          <input 
            autoComplete="off" className="flex-1 h-9 rounded-lg border border-slate-300 px-3 text-xs outline-none bg-white placeholder-slate-400 focus:border-slate-400 transition" 
            placeholder="ค้นหา loanNo/contractNo/lender..." 
            type="search" 
            value={search} 
            onChange={(event) => setSearch(event.target.value)} 
          />
          <button
            type="button"
            className="h-9 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition outline-none"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {(type !== 'all' || status !== 'all') ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden">
          <div className="w-full rounded-t-2xl bg-white p-5 shadow-xl border-t border-slate-200 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-800 text-sm">ตัวกรองเพิ่มเติม</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-2xl font-bold focus:outline-none"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">ประเภทสัญญา</label>
                <select
                  aria-label="Type select"
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="all">Type: ทั้งหมด</option>
                  {(data?.filters.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">สถานะสัญญา</label>
                <select
                  aria-label="Status select"
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">Status: ทั้งหมด</option>
                  {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled
                  className="w-full h-10 rounded-lg bg-slate-100 text-slate-400 font-semibold text-xs cursor-not-allowed flex items-center justify-center gap-1.5 opacity-60"
                >
                  📥 Template
                </button>
                <button
                  type="button"
                  disabled
                  className="w-full h-10 rounded-lg bg-slate-100 text-slate-400 font-semibold text-xs cursor-not-allowed flex items-center justify-center gap-1.5 opacity-60"
                >
                  📤 Import Excel
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setType('all')
                  setStatus('all')
                }}
                className="flex-1 h-10 rounded-lg border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Pagination Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? (
            <button
              className="hidden h-9 rounded-md bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 lg:inline-flex"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              รีเซ็ตความกว้างตาราง
            </button>
          ) : null}
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
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

      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="max-h-[60vh] overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {loanContractColumns.map((column, index) => {
                  if (index === loanContractColumns.length - 1) {
                    return <col key={column.key} style={{ minWidth: column.minWidth }} />
                  }
                  return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                })}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <ResizableTableHead label="เลขสัญญา" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="contractNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('contractNo', 'เลขสัญญา')} />
                  <ResizableTableHead label="ผู้ให้กู้" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="lenderName" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('lenderName', 'ผู้ให้กู้')} />
                  <ResizableTableHead label="ประเภท" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="loanType" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('loanType', 'ประเภท')} />
                  <ResizableTableHead label="Asset" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="asset" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('asset', 'Asset')} />
                  <ResizableTableHead align="right" label="วงเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="principalAmount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('principalAmount', 'วงเงิน')} />
                  <ResizableTableHead align="right" label="หนี้คงเหลือ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="outstanding" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('outstanding', 'หนี้คงเหลือ')} />
                  <ResizableTableHead align="right" label="งวดผ่อน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="installment" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('installment', 'งวดผ่อน')} />
                  <ResizableTableHead align="center" label="จ่ายแล้ว" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="duePaid" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('duePaid', 'จ่ายแล้ว')} />
                  <ResizableTableHead label="งวดถัดไป" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="nextDue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('nextDue', 'งวดถัดไป')} />
                  <ResizableTableHead align="right" label="เกินกำหนด" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="overdue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('overdue', 'เกินกำหนด')} />
                  <ResizableTableHead align="center" label="สถานะ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="status" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
                  <ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('actions', 'จัดการ')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <LoadingOrEmpty colSpan={loanContractColumns.length} isLoading={isLoading} rows={rows.length} />
                {pagedRows.map((row) => (
                  <tr key={row.contractNo} className="transition-colors hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-3 py-3 font-mono font-semibold text-blue-700">{row.contractNo}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{row.lenderName}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.loanType}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-400">-</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.principalAmount)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900">{formatMoney(row.outstanding)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.installmentAmount)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-center font-mono tabular-nums text-slate-700">{row.duePaid}/{row.dueTotal}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.nextDue || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-red-700">{formatMoney(row.overdue)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-center"><StatusPill status={row.status} /></td>
                    <td className="px-3 py-3 text-right"><div className="flex justify-end gap-2"><InlineDisabledButton>Generate Schedule</InlineDisabledButton><InlineDisabledButton>Schedule</InlineDisabledButton></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 text-xs font-semibold text-slate-500 bg-slate-50">รายการสัญญาเงินกู้</div>
        {isLoading && <div className="p-4 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>}
        {!isLoading && rows.length === 0 && <div className="p-4 text-center text-slate-400 text-xs">ไม่มีสัญญา</div>}
        {!isLoading && pagedRows.map((row) => (
          <div key={row.contractNo} className="p-4 space-y-2 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="font-mono text-blue-700 font-semibold text-sm block">{row.contractNo}</span>
                <span className="text-slate-400 block mt-0.5">{row.lenderName} · {row.loanType}</span>
              </div>
              <StatusPill status={row.status} />
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50">
              <div><span className="text-slate-400 block">วงเงิน (Financed)</span><span className="font-semibold text-slate-800">{formatMoney(row.principalAmount)}</span></div>
              <div><span className="text-slate-400 block">ยอดคงเหลือ</span><span className="font-bold text-slate-900">{formatMoney(row.outstanding)}</span></div>
              <div><span className="text-slate-400 block">งวดผ่อนชำระ</span><span className="font-semibold text-slate-800">{formatMoney(row.installmentAmount)}</span></div>
              <div><span className="text-slate-400 block">ชำระแล้ว</span><span className="font-medium text-slate-700">{row.duePaid}/{row.dueTotal} งวด</span></div>
              <div><span className="text-slate-400 block">งวดถัดไป</span><span className="font-medium text-slate-700">{row.nextDue || '-'}</span></div>
              <div><span className="text-slate-400 block">เกินกำหนด</span><span className="font-bold text-red-600">{formatMoney(row.overdue)}</span></div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <InlineDisabledButton>Generate Schedule</InlineDisabledButton>
              <InlineDisabledButton>Schedule</InlineDisabledButton>
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
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-700 p-6 text-white shadow-lg lg:col-span-2">
          <div className="text-sm uppercase opacity-80">💼 ภาระหนี้รวม Total Outstanding</div>
          <div className="mt-2 text-4xl font-bold md:text-5xl">{formatMoney(data?.summary.totalOutstanding)}</div>
          <div className="mt-1 text-sm opacity-90">บาท · ทุกประเภทสินเชื่อ</div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/20 pt-4 text-sm"><MiniHero label="ครบเดือนนี้" value={formatMoney(data?.summary.dueThisMonth)} /><MiniHero label="เกินกำหนด" value={formatMoney(data?.summary.overdueAmount)} tone="red" /><MiniHero label="ดอกเบี้ยเดือนนี้" value={formatMoney(data?.summary.interestThisMonth)} tone="amber" /></div>
        </div>
        <Panel title="🥧 สัดส่วนหนี้ตามประเภท">{(data?.byType ?? []).map((row) => <Bar key={row.label} color="bg-blue-500" label={row.label} max={maxType} value={row.value} />)} {!isLoading && (data?.byType.length ?? 0) === 0 ? <EmptyText>ยังไม่มีข้อมูลสินเชื่อ</EmptyText> : null}</Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Outstanding" value={formatMoney(data?.summary.totalOutstanding)} tone="blue" />
        <StatCard label="ครบเดือนนี้" value={formatMoney(data?.summary.dueThisMonth)} tone="amber" />
        <StatCard label="เกินกำหนด" value={formatMoney(data?.summary.overdueAmount)} tone="red" />
        <StatCard label="ดอกเบี้ยเดือนนี้" value={formatMoney(data?.summary.interestThisMonth)} tone="amber" />
        <StatCard label="งวดใน 7 วัน" value={data?.summary.due7 ?? 0} tone="cyan" />
        <StatCard label="งวดใน 30 วัน" value={data?.summary.due30 ?? 0} tone="blue" />
      </div>
      <Panel title="📊 ภาระหนี้แยกตามประเภท">{(data?.byType ?? []).map((row) => <Bar key={row.label} color="bg-cyan-500" label={row.label} max={data?.summary.totalOutstanding ?? 0} value={row.value} />)} {!isLoading && (data?.byType.length ?? 0) === 0 ? <EmptyText>ยังไม่มีข้อมูลสินเชื่อ</EmptyText> : null}</Panel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="💰 จ่ายเดือนนี้: เงินต้น vs ดอกเบี้ย"><div className="grid grid-cols-2 gap-3"><StatCard label="เงินต้น" value={formatMoney(data?.summary.principalThisMonth)} tone="blue" /><StatCard label="ดอกเบี้ย" value={formatMoney(data?.summary.interestThisMonth)} tone="amber" /></div><div className="mt-2 text-center text-xs text-slate-500">งวดใน 7 วัน: <b className="text-amber-700">{data?.summary.due7 ?? 0}</b> · 30 วัน: <b className="text-blue-700">{data?.summary.due30 ?? 0}</b></div></Panel>
        <Panel title="🚨 Status สรุป"><div className="space-y-3"><AlertLine label="ยอดเกินกำหนด" tone="red" value={formatMoney(data?.summary.overdueAmount)} /><AlertLine label="ครบเดือนนี้" tone="amber" value={formatMoney(data?.summary.dueThisMonth)} /><AlertLine label="งวดที่ต้องจ่าย 30 วัน" tone="blue" value={data?.summary.due30 ?? 0} /></div></Panel>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><DueTable isLoading={isLoading} rows={data?.upcomingDue ?? []} title="⏰ งวดที่จะครบใน 30 วัน" tone="amber" /><DueTable isLoading={isLoading} rows={data?.overdueList ?? []} title="⚠ งวดเกินกำหนด" tone="red" /></div>
    </section>
  )
}

export function EquityMaintenancePageClient() {
  const { data, error, isLoading } = useApi<EquityPayload>('/api/finance-accounting/equity-maint')
  const row = data?.row
  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <div className="max-w-xl rounded-md bg-white p-5 shadow">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ReadField label="ทุนจดทะเบียน" value={formatMoney(row?.registeredCapital)} />
          <ReadField label="ทุนชำระแล้ว (Paid-up)" value={formatMoney(row?.paidUpCapital)} />
          <ReadField label="กำไรสะสม (ปีก่อน)" value={formatMoney(row?.retainedEarnings)} />
          <ReadField label="Owner Adjustment" value={formatMoney(row?.ownerEquityAdjustment)} />
        </div>
        <div className="mt-4 rounded-md bg-purple-50 p-3 text-sm text-purple-800">Total Equity: <b>{formatMoney(row?.totalEquity)}</b></div>
        <button className="mt-4 rounded-md bg-purple-600 px-5 py-2 font-bold text-white opacity-60" disabled type="button">{isLoading ? 'กำลังโหลด' : 'บันทึก'}</button>
      </div>
    </section>
  )
}

export function OpeningBalancePageClient() {
  const { data, error } = useApi<OpeningPayload>('/api/finance-accounting/opening-balance')
  const columnResize = useResizableColumns('finance-accounting.opening-balance.accounts.v1', openingAccountColumns)
  const accounts = useMemo(() => data?.accounts ?? [], [data?.accounts])
  const { handleSort, sortDirection, sortedRows, sortKey } = useLocalTableSort<OpeningPayload['accounts'][number], OpeningAccountColumnKey>(accounts, getOpeningAccountSortValue)
  const tabs = ['⚙️ Setup', '💵 Cash/Bank/FCD/OD', '📥 AR ลูกหนี้', '📦 AP ต้นทุน', '💸 AP ค่าใช้จ่าย', '📦 Stock', '🏗️ Fixed Asset', '🏦 Loan', '🧾 VAT/WHT', '➕ Other', '👑 Equity/YTD', '⚖️ BS Check + Lock']
  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <div className="flex flex-wrap gap-2 rounded-md bg-white p-3 shadow"><DisabledButton strong>💾 Save ทันที</DisabledButton><DisabledButton>☁️ ⬆ Push to Cloud</DisabledButton>{tabs.map((tab, index) => <span key={tab} className={`rounded-md px-3 py-2 text-sm ${index === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{tab}</span>)}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><StatCard label="AR" value={formatMoney(data?.summary.ar)} tone="blue" /><StatCard label="AP Cost" value={formatMoney(data?.summary.apCost)} tone="red" /><StatCard label="AP Expense" value={formatMoney(data?.summary.apExpense)} tone="red" /><StatCard label="Stock" value={formatMoney(data?.summary.stock)} tone="amber" /><StatCard label="Net Other" value={formatMoney(data?.summary.netOther)} /></div>
      <Panel title="⚙️ Setup ข้อมูลพื้นฐาน"><div className="grid grid-cols-2 gap-3 text-sm"><ReadField label="Cutoff Date" value="2026-04-30" /><ReadField label="Go-Live Date" value="2026-05-01" /></div><div className="mt-3 text-xs text-slate-400">Updated: {data?.row.updatedAt || '-'}</div></Panel>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {columnResize.hasCustomWidths ? (
            <div className="flex justify-end border-b border-slate-100 bg-white px-3 py-2">
              <button
                className="h-8 rounded-md bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                type="button"
                onClick={columnResize.resetColumnWidths}
              >
                รีเซ็ตความกว้างตาราง
              </button>
            </div>
          ) : null}
          <div className="max-h-[60vh] overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {openingAccountColumns.map((column, index) => {
                  if (index === openingAccountColumns.length - 1) {
                    return <col key={column.key} style={{ minWidth: column.minWidth }} />
                  }
                  return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                })}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <ResizableTableHead label="เลขที่บัญชี" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="code" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('code', 'เลขที่บัญชี')} />
                  <ResizableTableHead label="ชื่อบัญชี" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="name" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('name', 'ชื่อบัญชี')} />
                  <ResizableTableHead label="ประเภท" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="type" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} />
                  <ResizableTableHead label="สาขา/คลัง" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="branch" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('branch', 'สาขาหรือคลัง')} />
                  <ResizableTableHead label="สกุลเงิน" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="currency" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('currency', 'สกุลเงิน')} />
                  <ResizableTableHead align="right" label="ยอดเปิดบัญชี" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="openingBalance" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('openingBalance', 'ยอดเปิดบัญชี')} />
                  <ResizableTableHead align="right" label="OD Limit" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="odLimit" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('odLimit', 'OD Limit')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <LoadingOrEmpty colSpan={openingAccountColumns.length} isLoading={false} rows={accounts.length} />
                {sortedRows.map((account) => (
                  <tr key={`${account.code || account.name}-${account.name}`} className="transition-colors hover:bg-slate-50/50">
                    <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">{account.code || '-'}</td>
                    <td className="px-3 py-3 font-medium text-slate-900">{account.name}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{account.type}</td>
                    <td className="px-3 py-3 text-slate-600">{account.branchName || account.branchCode || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{account.currency}</td>
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
      <div className="block lg:hidden divide-y divide-slate-100 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
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
              <div><span className="text-slate-400">OD Limit:</span> {formatMoney(account.odLimit)}</div>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-slate-100/50">
              <span className="text-slate-400 font-medium">Opening Balance</span>
              <span className="font-bold text-slate-900 text-sm">{formatMoney(account.openingBalance)}</span>
            </div>
          </div>
        ))}
      </div>
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
      <div className="rounded-md border-l-4 border-blue-400 bg-blue-50 p-4">
        <h1 className="mb-2 text-xl font-bold text-slate-900">📅 ข้อมูลย้อนหลัง ม.ค.-เม.ย. 2026 (ก่อน Go-Live)</h1>
        <p className="text-sm text-gray-700">ใช้คีย์ตัวเลขย้อนหลังเป็น baseline เพื่อเปรียบเทียบกับข้อมูลจริงตั้งแต่ พ.ค. 2026 (Go-Live)</p>
        <div className="mt-2 text-xs text-blue-700">📊 มีข้อมูลแล้ว: Expense {data?.summary.expense ?? 0} cells · P&amp;L {data?.summary.pnl ?? 0} cells · CashFlow {data?.summary.cashflow ?? 0} cells (รวม {data?.summary.total ?? 0})</div>
      </div>
      {error ? <ErrorBox message={error} /> : null}
      <div className="flex flex-wrap gap-2"><TabButton active={tab === 'expense'} onClick={() => setTab('expense')}>💰 ค่าใช้จ่าย (Expenses)</TabButton><TabButton active={tab === 'pnl'} onClick={() => setTab('pnl')}>📈 งบกำไรขาดทุน (P&amp;L)</TabButton><TabButton active={tab === 'cashflow'} onClick={() => setTab('cashflow')}>💵 งบกระแสเงินสด (Cash Flow)</TabButton></div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600"><span>{tab === 'expense' ? 'กรอกค่าใช้จ่ายแต่ละหมวด — แต่ละเดือน' : tab === 'pnl' ? 'กรอกตัวเลขสรุป P&L แต่ละเดือน' : 'กรอก Cash Flow แต่ละเดือน'}</span><div className="flex gap-2"><DisabledButton>🗑 ล้าง tab นี้</DisabledButton><DisabledButton strong>💾 บันทึก + Sync Cloud</DisabledButton></div></div>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {columnResize.hasCustomWidths ? (
            <div className="flex justify-end border-b border-slate-100 bg-white px-3 py-2">
              <button
                className="h-8 rounded-md bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                type="button"
                onClick={columnResize.resetColumnWidths}
              >
                รีเซ็ตความกว้างตาราง
              </button>
            </div>
          ) : null}
          <div className="max-h-[60vh] overflow-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {historicalColumns.map((column, index) => {
                  if (index === historicalColumns.length - 1) {
                    return <col key={column.key} style={{ minWidth: column.minWidth }} />
                  }
                  return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
                })}
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
      <div className="block lg:hidden divide-y divide-slate-100 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
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

function DisabledButton({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <button className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${strong ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-50 border border-slate-100 text-slate-400 opacity-60'} outline-none focus:ring-0`} disabled type="button">{children}</button>
}

function InlineDisabledButton({ children }: { children: ReactNode }) {
  return <button className="whitespace-nowrap text-xs font-semibold text-blue-500 hover:text-blue-700 opacity-50 outline-none focus:ring-0" disabled type="button">{children}</button>
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">{children}</div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><h2 className="mb-3 text-xs font-bold text-slate-800">{title}</h2>{children}</div>
}

function StatCard({ label, tone, value }: { label: string; tone?: 'amber' | 'blue' | 'cyan' | 'red'; value: number | string }) {
  const toneStyles = {
    blue: { text: 'text-blue-600', bg: 'bg-blue-50', icon: '💰' },
    cyan: { text: 'text-cyan-600', bg: 'bg-cyan-50', icon: '📊' },
    amber: { text: 'text-amber-600', bg: 'bg-amber-50', icon: '📈' },
    red: { text: 'text-red-600', bg: 'bg-red-50', icon: '📉' },
    default: { text: 'text-slate-600', bg: 'bg-slate-50', icon: '📋' }
  }
  const current = toneStyles[tone ?? 'default']
  return (
    <div className="bg-white p-3.5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full ${current.bg} ${current.text} flex items-center justify-center text-lg shrink-0`}>
        {current.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-500 truncate uppercase">{label}</div>
        <div className="mt-0.5 text-sm sm:text-base font-bold text-slate-900 tracking-tight">{value}</div>
      </div>
    </div>
  )
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
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 font-bold text-xs ${heading}`}>
        <span>{title} ({rows.length})</span>
        {columnResize.hasCustomWidths ? (
          <button
            className="hidden h-8 rounded-md bg-white/70 px-3 text-xs font-semibold text-slate-700 hover:bg-white lg:inline-flex"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            รีเซ็ตความกว้างตาราง
          </button>
        ) : null}
      </div>
      
      {/* Desktop Table View */}
      <div className="hidden lg:block max-h-96 overflow-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {dueColumns.map((column, index) => {
              if (index === dueColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            })}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-100">
            <tr>
              <ResizableTableHead label="วันครบกำหนด" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="dueDate" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('dueDate', 'วันครบกำหนด')} />
              <ResizableTableHead label="เลขสัญญา" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="contractNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('contractNo', 'เลขสัญญา')} />
              <ResizableTableHead label="ผู้ให้กู้" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="lenderName" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('lenderName', 'ผู้ให้กู้')} />
              <ResizableTableHead align="right" label="ยอดต้องจ่าย" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="amount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('amount', 'ยอดต้องจ่าย')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <LoadingOrEmpty colSpan={dueColumns.length} isLoading={isLoading} rows={rows.length} emptyText="ไม่มี" />
            {sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50/50">
                <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.dueDate}</td>
                <td className="whitespace-nowrap px-3 py-3 font-mono font-semibold text-blue-700">{row.contractNo}</td>
                <td className="px-3 py-3 font-medium text-slate-900">{row.lenderName}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums text-slate-900">{formatMoney(row.totalDueAmount - row.paidAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-slate-100 max-h-96 overflow-auto">
        {isLoading && <div className="p-4 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>}
        {!isLoading && rows.length === 0 && <div className="p-4 text-center text-slate-400 text-xs">ไม่มีงวดที่ต้องชำระ</div>}
        {!isLoading && sortedRows.map((row) => (
          <div key={row.id} className="p-3 space-y-1.5 text-xs hover:bg-slate-50/50 transition">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-900">{row.dueDate}</span>
              <span className="font-mono text-blue-700 font-semibold">{row.contractNo}</span>
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
    <div className={`rounded-xl border p-3.5 shadow-sm ${map[tone]} text-xs`}>
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
      <input className="w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-right text-xs outline-none focus:ring-0" readOnly value={value} />
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
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50 text-slate-650">
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

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={`rounded-lg px-4 py-2 text-xs font-bold transition outline-none focus:ring-0 ${active ? 'bg-[#0F172A] text-white hover:bg-slate-800 shadow-sm' : 'bg-slate-50 border border-slate-100 text-slate-650 hover:bg-slate-100'}`}
      type="button" 
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function LoadingOrEmpty({ colSpan, emptyText = 'ยังไม่มีข้อมูล', isLoading, rows }: { colSpan: number; emptyText?: string; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>{emptyText}</td></tr>
  return null
}

function StatusPill({ status }: { status: string }) {
  const color = status === 'Active' ? 'bg-emerald-50 text-emerald-700' : status === 'Closed' ? 'bg-blue-50 text-blue-700' : status === 'Overdue' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>{status}</span>
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="text-xs text-slate-400 font-medium py-4 text-center">{children}</div>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
