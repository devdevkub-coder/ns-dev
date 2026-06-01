'use client'

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
  sourceDocNo: string
  totalAmount: number
}

type ApprovalPayload = {
  apRows: ApprovalApRow[]
  expenseRows: ApprovalExpenseRow[]
}

type ApprovalTab = 'advance' | 'ap' | 'expense'
type ApprovalFilter = 'all' | 'pending' | 'approved'
type ApprovalSortDirection = 'asc' | 'desc'
type ApprovalSortKey = 'bankAccount' | 'date' | 'docNo' | 'dueDate' | 'paidAmount' | 'partyName' | 'payableBalance' | 'totalAmount'
type ApprovalDetailState =
  | { row: ApprovalApRow; tab: 'ap' }
  | { row: ApprovalExpenseRow; tab: 'expense' }
type SplitDraft = {
  amount: number
  destinationId: string
  id: string
}

const pageSizeOptions = [10, 25, 50, 100]
const approvalFilterOptions: Array<{ label: string; value: ApprovalFilter }> = [
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'ยังไม่อนุมัติ', value: 'pending' },
  { label: 'อนุมัติแล้ว', value: 'approved' },
]

function formatDecimalWithGrouping(value: number) {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function normalizeMoneyDraft(value: string) {
  return value.replace(/,/g, '')
}

function isValidMoneyDraft(value: string) {
  return /^\d*(\.\d{0,2})?$/.test(value)
}

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

function newSplitDraft(optionId: string, amount: number): SplitDraft {
  return {
    amount,
    destinationId: optionId,
    id: `SPLIT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  }
}

function defaultDestinationId(row: ApprovalApRow) {
  return row.bankAccounts[0]?.id ?? ''
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
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false)
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('pending')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [sortDirection, setSortDirection] = useState<ApprovalSortDirection>('desc')
  const [sortKey, setSortKey] = useState<ApprovalSortKey>('date')
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>([])
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

  useEffect(() => {
    if (detail?.tab !== 'ap' || detail.row.approvalStatus !== 'pending') return
    setSplitDrafts((current) => {
      if (current.length > 0) return current
      return [newSplitDraft(defaultDestinationId(detail.row), detail.row.payableBalance)]
    })
  }, [detail])

  const purchaseApprovalRows = useMemo(() => data.apRows.filter((row) => row.sourceType === 'purchase_bill'), [data.apRows])
  const advanceApprovalRows = useMemo(() => data.apRows.filter((row) => row.sourceType === 'advance_payment'), [data.apRows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source = tab === 'ap'
      ? purchaseApprovalRows
      : tab === 'advance'
        ? advanceApprovalRows
        : data.expenseRows
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
  }, [advanceApprovalRows, approvalFilter, data.expenseRows, dateFrom, dateTo, purchaseApprovalRows, search, tab])

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

  const splitTotal = splitDrafts.reduce((sum, split) => sum + split.amount, 0)
  const currentDetailRow = detail?.tab === 'ap' ? detail.row : null
  const splitDiff = currentDetailRow ? currentDetailRow.payableBalance - splitTotal : 0

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
    setInputDrafts({})
    setDetail(nextDetail)
    if (nextDetail.tab === 'ap' && nextDetail.row.approvalStatus === 'pending') {
      setSplitDrafts([newSplitDraft(defaultDestinationId(nextDetail.row), nextDetail.row.payableBalance)])
    } else {
      setSplitDrafts([])
    }
  }

  function closeDetail() {
    setDetail(null)
    setInputDrafts({})
    setSplitDrafts([])
  }

  function addSplit() {
    if (!currentDetailRow) return
    setSplitDrafts((current) => [...current, newSplitDraft(defaultDestinationId(currentDetailRow), 0)])
  }

  function removeSplit(splitId: string) {
    setSplitDrafts((current) => current.length <= 1 ? current : current.filter((split) => split.id !== splitId))
    setInputDrafts((current) => {
      const next = { ...current }
      delete next[splitId]
      return next
    })
  }

  function updateSplit(splitId: string, patch: Partial<SplitDraft>) {
    setSplitDrafts((current) => current.map((split) => split.id === splitId ? { ...split, ...patch } : split))
  }

  function handleSplitAmountFocus(split: SplitDraft) {
    setInputDrafts((current) => ({
      ...current,
      [split.id]: normalizeMoneyDraft(current[split.id] ?? formatDecimalWithGrouping(split.amount)),
    }))
  }

  function handleSplitAmountChange(split: SplitDraft, value: string) {
    const normalized = normalizeMoneyDraft(value)
    if (!isValidMoneyDraft(normalized)) return
    setInputDrafts((current) => ({
      ...current,
      [split.id]: normalized,
    }))
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) updateSplit(split.id, { amount: parsed })
  }

  function handleSplitAmountBlur(split: SplitDraft) {
    setInputDrafts((current) => ({
      ...current,
      [split.id]: formatDecimalWithGrouping(split.amount),
    }))
  }

  function splitValidationMessage(row: ApprovalApRow | null) {
    if (!row) return 'ไม่พบรายการที่ต้องการอนุมัติ'
    if (splitDrafts.length === 0) return 'เพิ่มอย่างน้อย 1 รายการอนุมัติ'
    for (const split of splitDrafts) {
      if (!split.destinationId) return 'เลือกช่องทางจ่ายปลายทางให้ครบทุกบรรทัด'
      if (!Number.isFinite(split.amount) || split.amount <= 0) return 'ยอดอนุมัติย่อยต้องมากกว่า 0'
    }
    if (splitTotal - row.payableBalance > 0.01) {
      return `ยอดรวมรายการอนุมัติต้องไม่เกิน ${formatMoney(row.payableBalance)} บาท`
    }
    return null
  }

  async function approveCurrentDetail() {
    if (!currentDetailRow) return
    const validationError = splitValidationMessage(currentDetailRow)
    if (validationError) {
      setError(validationError)
      return
    }
    setIsSubmittingApproval(true)
    setError(null)
    try {
      await dailyFetchJson('/api/daily/payment-approval', {
        body: JSON.stringify({
          sourceId: currentDetailRow.id,
          sourceType: currentDetailRow.sourceType,
          splits: splitDrafts.map((split) => ({
            approvedAmount: split.amount,
            destinationId: split.destinationId,
          })),
        }),
        method: 'POST',
      })
      closeDetail()
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'อนุมัติจ่ายเงินไม่ได้')
    } finally {
      setIsSubmittingApproval(false)
    }
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
            ต้นทุน / Supplier <span className="ml-2 rounded-md-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{purchaseApprovalRows.length}</span>
          </button>
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'advance' ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('advance')}>
            จ่ายเงินล่วงหน้า / มัดจำ <span className="ml-2 rounded-md-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{advanceApprovalRows.length}</span>
          </button>
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'expense' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('expense')}>
            ค่าใช้จ่าย <span className="ml-2 rounded-md-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{data.expenseRows.length}</span>
          </button>
        </div>

        <div className="space-y-3 border-b p-3">
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
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
        {tab === 'ap' || tab === 'advance' ? (
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
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
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
                  </TableRow>
                ))}
                {!isLoading && totalRows === 0 ? (
                  <TableRow>
                    <TableCell className="p-6 text-center text-slate-500" colSpan={8}>
                      {tab === 'advance' ? 'ไม่มีรายการจ่ายเงินล่วงหน้า / มัดจำรออนุมัติ' : 'ไม่มีรายการต้นทุน / Supplier รออนุมัติ'}
                    </TableCell>
                  </TableRow>
                ) : null}
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
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={6}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
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
                    </TableRow>
                  )
                })}
                {!isLoading && totalRows === 0 ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={6}>ไม่มีค่าใช้จ่ายค้างจ่าย</TableCell></TableRow> : null}
              </TableBody>
          </Table>
        )}
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

              {detail.row.approvalStatus === 'pending' ? (
                <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">แบ่งรายการอนุมัติจ่าย</div>
                      <div className="text-xs text-slate-500">1 source document สามารถแตก approval items หลายรายการได้</div>
                    </div>
                    <Button size="sm" type="button" onClick={addSplit}>+ เพิ่มรายการย่อย</Button>
                  </div>

                  <div className="space-y-2">
                    {splitDrafts.map((split, index) => (
                      <div key={split.id} className="grid grid-cols-12 gap-2 rounded-md border border-slate-200 bg-white p-3">
                        <div className="col-span-12 text-xs font-semibold text-slate-500 md:col-span-1 md:pt-2">#{index + 1}</div>
                        <div className="col-span-12 md:col-span-6">
                          <label className="block text-xs text-slate-600">
                            ช่องทางจ่าย / บัญชีปลายทาง
                            <Select className="mt-1 h-9" value={split.destinationId} onChange={(event) => updateSplit(split.id, { destinationId: event.target.value })}>
                              <option value="">เลือกช่องทางจ่าย</option>
                              {detail.row.bankAccounts.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                            </Select>
                          </label>
                        </div>
                        <div className="col-span-10 md:col-span-4">
                          <label className="block text-xs text-slate-600">
                            ยอดอนุมัติ
                            <Input
                              className="mt-1 h-9 text-right"
                              inputMode="decimal"
                              type="text"
                              value={inputDrafts[split.id] ?? formatDecimalWithGrouping(split.amount)}
                              onBlur={() => handleSplitAmountBlur(split)}
                              onChange={(event) => handleSplitAmountChange(split, event.target.value)}
                              onFocus={() => handleSplitAmountFocus(split)}
                            />
                          </label>
                        </div>
                        <div className="col-span-2 flex items-end justify-end md:col-span-1">
                          <Button disabled={splitDrafts.length <= 1} size="sm" type="button" variant="outline" onClick={() => removeSplit(split.id)}>ลบ</Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-md bg-white p-3 shadow-sm">
                      <div className="text-xs text-slate-500">รวมอนุมัติรอบนี้</div>
                      <div className="text-lg font-bold text-slate-900">{formatMoney(splitTotal)}</div>
                    </div>
                    <div className="rounded-md bg-white p-3 shadow-sm">
                      <div className="text-xs text-slate-500">ยอดคงเหลือที่อนุมัติได้</div>
                      <div className="text-lg font-bold text-red-700">{formatMoney(detail.row.payableBalance)}</div>
                    </div>
                    <div className={`rounded-md p-3 shadow-sm ${splitDiff >= -0.01 ? 'bg-white' : 'bg-red-50'}`}>
                      <div className="text-xs text-slate-500">คงเหลือหลังแตก approval</div>
                      <div className={`text-lg font-bold ${splitDiff >= -0.01 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(splitDiff)}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <DetailItem label="เลขที่อนุมัติ" value={detail.row.approvalDisplayDocNo ?? detail.row.docNo} />
                  <DetailItem label="ช่องทางจ่าย / ปลายทาง" value={detail.row.destinationLabel || '-'} />
                  <DetailItem label="ยอดอนุมัติ" value={formatMoney(detail.row.approvedAmount)} />
                  <DetailItem label="สถานะ" value={approvalStatusLabel(detail.row.approvalStatus)} />
                </div>
              )}
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
            {currentDetailRow && currentDetailRow.approvalStatus === 'pending' ? (
              <Button disabled={isSubmittingApproval || Boolean(splitValidationMessage(currentDetailRow))} onClick={() => void approveCurrentDetail()}>
                {isSubmittingApproval ? 'กำลังอนุมัติ...' : 'ยืนยันอนุมัติรายการนี้'}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={closeDetail}>ปิด</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
