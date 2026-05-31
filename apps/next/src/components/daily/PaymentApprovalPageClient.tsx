'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type ApprovalDestinationOption = {
  accountNo: string
  bankName: string
  id: string
  kind: 'bank' | 'cash'
  label: string
  paymentMethod: string
}

type ApprovalApRow = {
  approvalDisplayDocNo: string | null
  approvalId: string | null
  approvalStatus: 'approved' | 'pending'
  approvedAmount: number
  bankAccount: string
  bankAccounts: ApprovalDestinationOption[]
  bankName: string
  date: string
  destinationLabel: string
  docNo: string
  id: string
  paidAmount: number
  payableBalance: number
  sourceId: string
  sourceDocNo: string
  sourceLabel: string
  sourceType: 'advance_payment' | 'purchase_bill'
  supplierName: string
  totalAmount: number
}

type ApprovalExpenseRow = {
  accountName: string
  approvalDisplayDocNo: string | null
  approvalId: string | null
  approvalStatus: 'approved' | 'pending'
  approvedAmount: number
  date: string
  destinationLabel: string
  docNo: string
  dueDate: string
  id: string
  payee: string
  refDocNo: string
  sourceId: string
  sourceDocNo: string
  sourceType: 'expense'
  totalAmount: number
}

type ApprovalPayload = {
  apRows: ApprovalApRow[]
  expenseRows: ApprovalExpenseRow[]
}

type ApprovalTab = 'ap' | 'expense'
type ApprovalFilter = 'all' | 'pending' | 'approved'
type ApprovalSortDirection = 'asc' | 'desc'
type ApprovalSortKey = 'bankAccount' | 'date' | 'docNo' | 'dueDate' | 'paidAmount' | 'partyName' | 'payableBalance' | 'totalAmount'
type ApprovalDetailState =
  | { row: ApprovalApRow; tab: 'ap' }
  | { row: ApprovalExpenseRow; tab: 'expense' }

const pageSizeOptions = [10, 25, 50, 100]
const approvalFilterOptions: Array<{ label: string; value: ApprovalFilter }> = [
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'ยังไม่อนุมัติ', value: 'pending' },
  { label: 'อนุมัติแล้ว', value: 'approved' },
]

function destinationSummaryLabel(row: ApprovalApRow) {
  if (row.approvalStatus !== 'pending') return row.destinationLabel || '-'
  if (row.bankAccounts.length === 0) return 'ยังไม่มีช่องทางจ่ายปลายทาง'
  return row.bankAccounts.map((option) => option.label).join(', ')
}

function approvalStatusLabel(status: ApprovalApRow['approvalStatus']) {
  if (status === 'approved') return 'อนุมัติแล้ว'
  return 'ยังไม่อนุมัติ'
}

function approvalStatusTone(status: ApprovalApRow['approvalStatus']) {
  if (status === 'approved') return 'text-emerald-700'
  return 'text-slate-500'
}

function approvalStatusDot(status: ApprovalApRow['approvalStatus']) {
  if (status === 'approved') return 'bg-emerald-500'
  return 'bg-slate-300'
}

function sourceDetailHref(row: ApprovalApRow | ApprovalExpenseRow) {
  if (row.sourceType === 'purchase_bill') return `/purchase/bills/${row.sourceId}`
  if (row.sourceType === 'advance_payment') return `/purchase/advance-payments/${row.sourceId}`
  return `/daily/expense/${row.sourceId}`
}

function approvalSortValue(
  row: ApprovalApRow | ApprovalExpenseRow,
  sortKey: ApprovalSortKey,
) {
  switch (sortKey) {
    case 'docNo':
      return row.docNo ?? ''
    case 'date':
      return row.date ?? ''
    case 'partyName':
      return 'supplierName' in row ? row.supplierName ?? '' : row.payee ?? ''
    case 'bankAccount':
      return 'bankAccounts' in row ? destinationSummaryLabel(row) : row.accountName ?? ''
    case 'totalAmount':
      return row.totalAmount ?? 0
    case 'paidAmount':
      return 'paidAmount' in row ? row.paidAmount ?? 0 : 0
    case 'payableBalance':
      return 'payableBalance' in row ? row.payableBalance ?? 0 : row.totalAmount ?? 0
    case 'dueDate':
      return 'dueDate' in row ? row.dueDate ?? '' : row.date ?? ''
    default:
      return ''
  }
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
    </div>
  )
}

function SortableHead({
  align,
  currentKey,
  direction,
  label,
  onSort,
  sortKey,
}: {
  align: 'left' | 'right'
  currentKey: ApprovalSortKey
  direction: ApprovalSortDirection
  label: string
  onSort: (key: ApprovalSortKey) => void
  sortKey: ApprovalSortKey
}) {
  const active = currentKey === sortKey
  const alignClass = align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button className={`inline-flex w-full items-center gap-1 rounded-md px-1 py-0.5 hover:bg-slate-200 ${alignClass}`} type="button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="text-xs text-slate-400">{active ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </TableHead>
  )
}

export function PaymentApprovalPageClient() {
  const [data, setData] = useState<ApprovalPayload>({ apRows: [], expenseRows: [] })
  const [detail, setDetail] = useState<ApprovalDetailState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('pending')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [sortDirection, setSortDirection] = useState<ApprovalSortDirection>('desc')
  const [sortKey, setSortKey] = useState<ApprovalSortKey>('date')
  const [tab, setTab] = useState<ApprovalTab>('ap')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await dailyFetchJson<ApprovalPayload>('/api/daily/payment-approval'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายการอนุมัติไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source = tab === 'ap' ? data.apRows : data.expenseRows
    return source.filter((row) => {
      const rowDate = row.date || ''
      const haystack = `${row.docNo} ${row.sourceDocNo} ${'supplierName' in row ? row.supplierName : row.payee} ${'bankAccounts' in row ? destinationSummaryLabel(row) : `${row.accountName} ${row.destinationLabel} ${row.refDocNo}`}`.toLowerCase()
      if (query && !haystack.includes(query)) return false
      if (dateFrom && rowDate < dateFrom) return false
      if (dateTo && rowDate > dateTo) return false
      if (approvalFilter === 'approved' && row.approvalStatus !== 'approved') return false
      if (approvalFilter === 'pending' && row.approvalStatus !== 'pending') return false
      return true
    })
  }, [approvalFilter, data.apRows, data.expenseRows, dateFrom, dateTo, search, tab])

  const rows = useMemo(() => {
    const collator = new Intl.Collator('th-TH', { numeric: true, sensitivity: 'base' })
    return [...filteredRows].sort((left, right) => {
      const leftValue = approvalSortValue(left, sortKey)
      const rightValue = approvalSortValue(right, sortKey)
      const base = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : collator.compare(String(leftValue), String(rightValue))
      return sortDirection === 'asc' ? base : -base
    })
  }, [filteredRows, sortDirection, sortKey])

  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = useMemo(() => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [currentPage, pageSize, rows])
  const apRows = useMemo(() => pageRows.filter((row): row is ApprovalApRow => 'bankAccounts' in row), [pageRows])
  const expenseRows = useMemo(() => pageRows.filter((row): row is ApprovalExpenseRow => !('bankAccounts' in row)), [pageRows])

  const summary = useMemo(() => {
    return filteredRows.reduce((totals, row) => {
      const totalFull = row.totalAmount
      const totalPaid = 'paidAmount' in row ? row.paidAmount : 0
      const totalRemain = 'payableBalance' in row ? row.payableBalance : row.totalAmount
      totals.totalFull += totalFull
      totals.totalPaid += totalPaid
      totals.totalRemain += totalRemain
      if (row.approvalStatus === 'pending') totals.pendingCount += 1
      if (row.approvalStatus === 'approved') totals.approvedCount += 1
      return totals
    }, { approvedCount: 0, pendingCount: 0, totalFull: 0, totalPaid: 0, totalRemain: 0 })
  }, [filteredRows])

  useEffect(() => {
    setPage(1)
  }, [approvalFilter, dateFrom, dateTo, pageSize, search, sortDirection, sortKey, tab])

  function clearFilters() {
    setApprovalFilter('all')
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setSortDirection('desc')
    setSortKey('date')
  }

  function changeSort(nextKey: ApprovalSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'partyName' || nextKey === 'bankAccount' ? 'asc' : 'desc')
  }

  function openDetail(nextDetail: ApprovalDetailState) {
    setError(null)
    setDetail(nextDetail)
  }

  function closeDetail() {
    setDetail(null)
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
        <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">รายการทั้งหมด</div><div className="font-bold">{filteredRows.length}</div></div>
        <div className="rounded-md bg-blue-50 p-2"><div className="text-xs text-blue-600">ยอดเต็ม</div><div className="font-bold text-blue-700">{formatMoney(summary.totalFull)}</div></div>
        <div className="rounded-md bg-emerald-50 p-2"><div className="text-xs text-emerald-600">ชำระแล้ว</div><div className="font-bold text-emerald-700">{formatMoney(summary.totalPaid)}</div></div>
        <div className="rounded-md bg-red-50 p-2"><div className="text-xs text-red-600">คงเหลือ</div><div className="font-bold text-red-700">{formatMoney(summary.totalRemain)}</div></div>
        <div className="rounded-md bg-amber-50 p-2"><div className="text-xs text-amber-600">อนุมัติแล้ว / รออนุมัติ</div><div className="font-bold text-amber-700">{summary.approvedCount} / {summary.pendingCount}</div></div>
      </div>

      <div className="overflow-hidden rounded-md bg-white shadow">
        <div className="flex border-b">
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'ap' ? 'border-red-600 text-red-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('ap')}>
            ต้นทุน / Supplier <span className="ml-2 rounded-md-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{data.apRows.length}</span>
          </button>
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'expense' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('expense')}>
            ค่าใช้จ่าย <span className="ml-2 rounded-md-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{data.expenseRows.length}</span>
          </button>
        </div>

        <div className="space-y-3 border-b px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="min-w-[260px] flex-1 rounded-md" placeholder="ค้นหาเลขที่ / ชื่อ / ช่องทางจ่าย..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="text-xs text-slate-500">วันที่:</label>
            <DatePickerInput id="payment-approval-date-from" value={dateFrom} onChange={setDateFrom} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="payment-approval-date-to" value={dateTo} onChange={setDateTo} />
            {(search || dateFrom || dateTo || approvalFilter !== 'all' || sortKey !== 'date' || sortDirection !== 'desc') ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {approvalFilterOptions.map((option) => {
              const active = approvalFilter === option.value
              return (
                <button
                  key={option.value}
                  className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${active ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}
                  type="button"
                  onClick={() => setApprovalFilter(option.value)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm text-slate-600">
          <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="จำนวนรายการต่อหน้า" className="h-9 w-auto px-2 py-1" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
            </Select>
            <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
            <span className="px-1">หน้า {currentPage} / {totalPages}</span>
            <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
          </div>
        </div>

        <div>
          {tab === 'ap' ? (
            <Table>
              <TableHeader>
                <tr>
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="เลขที่เอกสาร" sortKey="docNo" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="วันที่" sortKey="date" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="ผู้ขาย" sortKey="partyName" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="ช่องทางจ่าย / ปลายทาง" sortKey="bankAccount" onSort={changeSort} />
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="ยอด" sortKey="totalAmount" onSort={changeSort} />
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="ชำระแล้ว" sortKey="paidAmount" onSort={changeSort} />
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="คงเหลือ / อนุมัติ" sortKey="payableBalance" onSort={changeSort} />
                  <TableHead className="text-center">สถานะ</TableHead>
                  <TableHead className="text-center">รายละเอียด</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                {!isLoading && apRows.map((row) => (
                  <TableRow key={row.id} className="cursor-pointer border-0 hover:bg-slate-50" onClick={() => openDetail({ row, tab: 'ap' })}>
                    <TableCell className="text-xs">
                      <div className="font-medium whitespace-nowrap">{row.docNo}</div>
                      <div className="text-[11px] text-slate-500">{row.approvalStatus === 'pending' ? row.sourceLabel : `อ้างอิง ${row.sourceDocNo}`}</div>
                    </TableCell>
                    <TableCell className="text-xs">{formatDateDisplay(row.date)}</TableCell>
                    <TableCell className="font-semibold">{row.supplierName}</TableCell>
                    <TableCell className="text-xs">
                      {row.approvalStatus === 'approved'
                        ? <div className="whitespace-normal text-slate-700">{row.destinationLabel || '-'}</div>
                        : <div className="whitespace-normal text-slate-500">{destinationSummaryLabel(row)}</div>}
                    </TableCell>
                    <TableCell className="text-right">{formatMoney(row.totalAmount)}</TableCell>
                    <TableCell className="text-right text-emerald-700">{formatMoney(row.paidAmount)}</TableCell>
                    <TableCell className="text-right font-bold text-red-700">{formatMoney(row.payableBalance)}</TableCell>
                    <TableCell className="text-center text-xs">
                      <span className={`inline-flex items-center gap-1 ${approvalStatusTone(row.approvalStatus)}`}>
                        <span className={`h-2 w-2 rounded-full ${approvalStatusDot(row.approvalStatus)}`} />
                        {approvalStatusLabel(row.approvalStatus)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      <Link
                        className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
                        href={sourceDetailHref(row)}
                        onClick={(event) => event.stopPropagation()}
                      >
                        เปิดเอกสาร
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {!isLoading && totalRows === 0 ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={9}>ไม่มีรายการรออนุมัติจ่ายเงิน</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="เลขที่/วันที่" sortKey="docNo" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="ครบกำหนด" sortKey="dueDate" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="ผู้รับเงิน" sortKey="partyName" onSort={changeSort} />
                  <TableHead>รายละเอียด / อ้างอิง</TableHead>
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="ยอดเต็ม" sortKey="totalAmount" onSort={changeSort} />
                  <TableHead className="text-center">สถานะ</TableHead>
                  <TableHead className="text-center">รายละเอียด</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                {!isLoading && expenseRows.map((row) => {
                  const overdue = row.dueDate ? row.dueDate < new Date().toISOString().slice(0, 10) : false
                  return (
                    <TableRow key={row.id} className="cursor-pointer border-0 hover:bg-slate-50" onClick={() => openDetail({ row, tab: 'expense' })}>
                      <TableCell className="text-xs">
                        <div className="font-medium whitespace-nowrap">{row.docNo}</div>
                        <div className="text-slate-500">{row.approvalStatus === 'pending' ? formatDateDisplay(row.date) : `อ้างอิง ${row.sourceDocNo}`}</div>
                      </TableCell>
                      <TableCell className="text-xs">{row.dueDate ? <span className={overdue ? 'font-bold text-red-600' : 'text-slate-700'}>{formatDateDisplay(row.dueDate)}{overdue ? <span className="block text-[10px] text-red-500">เลยกำหนด</span> : null}</span> : <span className="text-slate-300">-</span>}</TableCell>
                      <TableCell className="font-semibold">{row.payee}</TableCell>
                      <TableCell className="text-xs">{row.refDocNo ? <div className="text-slate-700">{row.refDocNo}</div> : <span className="text-slate-300">-</span>}</TableCell>
                      <TableCell className="text-right font-bold text-red-700">{formatMoney(row.totalAmount)}</TableCell>
                      <TableCell className="text-center text-xs">
                        <span className={`inline-flex items-center gap-1 ${approvalStatusTone(row.approvalStatus)}`}>
                          <span className={`h-2 w-2 rounded-full ${approvalStatusDot(row.approvalStatus)}`} />
                          {approvalStatusLabel(row.approvalStatus)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        <Link
                          className="rounded-md border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50"
                          href={sourceDetailHref(row)}
                          onClick={(event) => event.stopPropagation()}
                        >
                          เปิดเอกสาร
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!isLoading && totalRows === 0 ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={7}>ไม่มีค่าใช้จ่ายค้างจ่าย</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) closeDetail() }}>
        <DialogContent className="max-w-3xl" fallbackTitle="รายละเอียดการอนุมัติ">
          <DialogHeader>
            <DialogTitle>{detail ? detail.row.docNo : 'รายละเอียดการอนุมัติ'}</DialogTitle>
            <DialogDescription>รายละเอียดรายการในคิวอนุมัติจ่ายเงิน</DialogDescription>
          </DialogHeader>

          {detail?.tab === 'ap' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DetailItem label="เลขที่เอกสารต้นทาง" value={detail.row.sourceDocNo} />
                <DetailItem label="ประเภทเอกสาร" value={detail.row.sourceLabel} />
                <DetailItem label="วันที่" value={formatDateDisplay(detail.row.date)} />
                <DetailItem label="ผู้ขาย" value={detail.row.supplierName} />
                <DetailItem label="ยอดเต็ม" value={formatMoney(detail.row.totalAmount)} />
                <DetailItem label="ชำระแล้ว" value={formatMoney(detail.row.paidAmount)} />
                <DetailItem label="คงเหลือสุทธิ" value={formatMoney(detail.row.payableBalance)} />
                <DetailItem label="สถานะ" value={approvalStatusLabel(detail.row.approvalStatus)} />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <DetailItem label="เลขที่อนุมัติ" value={detail.row.approvalDisplayDocNo ?? '-'} />
                <DetailItem label="ช่องทางจ่าย / ปลายทาง" value={detail.row.destinationLabel || destinationSummaryLabel(detail.row)} />
                <DetailItem label="ยอดอนุมัติ" value={detail.row.approvalStatus === 'approved' ? formatMoney(detail.row.approvedAmount) : '-'} />
                <DetailItem label="เปิดเอกสารต้นทาง" value={detail.row.sourceDocNo} />
              </div>
            </div>
          ) : detail?.tab === 'expense' ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <DetailItem label="เลขที่เอกสาร" value={detail.row.sourceDocNo} />
              <DetailItem label="เลขที่อนุมัติ" value={detail.row.approvalDisplayDocNo ?? '-'} />
              <DetailItem label="วันที่" value={formatDateDisplay(detail.row.date)} />
              <DetailItem label="ครบกำหนด" value={detail.row.dueDate ? formatDateDisplay(detail.row.dueDate) : '-'} />
              <DetailItem label="ผู้รับเงิน" value={detail.row.payee} />
              <DetailItem label="อ้างอิง" value={detail.row.refDocNo || '-'} />
              <DetailItem label="ช่องทางจ่าย" value={detail.row.destinationLabel || detail.row.accountName || '-'} />
              <DetailItem label="ยอดเต็ม" value={formatMoney(detail.row.totalAmount)} />
              <DetailItem label="สถานะ" value={approvalStatusLabel(detail.row.approvalStatus)} />
            </div>
          ) : null}

          <DialogFooter>
            {detail ? (
              <Button asChild>
                <Link href={sourceDetailHref(detail.row)}>เปิดเอกสารต้นทาง</Link>
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={closeDetail}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
