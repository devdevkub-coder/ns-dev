'use client'

import { useCallback, useEffect, useMemo, useState, type ButtonHTMLAttributes } from 'react'
import { FileText, Coins, CheckCircle, AlertCircle, FileCheck2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { openPmaBatchPrint } from '@/lib/payment-approval-print'

type ApprovalDestinationOption = {
  accountNo: string
  bankName: string
  id: string
  kind: 'bank' | 'cash'
  label: string
  paymentMethod: string
}

type ApprovalStatus = 'approved' | 'pending' | 'voided'

type ApprovalApRow = {
  approvalDisplayDocNo: string | null
  approvalId: string | null
  approvalStatus: ApprovalStatus
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
  voidReason?: string | null
  voidedAt?: string | null
}

type ApprovalExpenseRow = {
  accountId: string
  accountName: string
  approvalDisplayDocNo: string | null
  approvalId: string | null
  approvalStatus: ApprovalStatus
  approvedAmount: number
  date: string
  destinationLabel: string
  destinationOptions: ApprovalDestinationOption[]
  docNo: string
  dueDate: string
  id: string
  payee: string
  refDocNo: string
  sourceDocNo: string
  sourceType: 'expense' | 'petty_advance_return'
  totalAmount: number
  voidReason?: string | null
  voidedAt?: string | null
}

type ApprovalPayload = {
  apRows: ApprovalApRow[]
  expenseRows: ApprovalExpenseRow[]
  pettyReturnRows: ApprovalExpenseRow[]
}

type ApprovalTab = 'advance' | 'ap' | 'expense' | 'pettyReturn'
type ApprovalSortDirection = 'asc' | 'desc'
type ApprovalSortKey = 'bankAccount' | 'date' | 'docNo' | 'dueDate' | 'paidAmount' | 'partyName' | 'payableBalance' | 'totalAmount'
type PaymentApprovalApColumnKey = 'bankAccount' | 'date' | 'docNo' | 'paidAmount' | 'partyName' | 'payableBalance' | 'sourceDocNo' | 'status' | 'totalAmount'
type PaymentApprovalExpenseColumnKey = 'docNo' | 'dueDate' | 'partyName' | 'refDocNo' | 'sourceDocNo' | 'status' | 'totalAmount'
type ApprovalDetailState =
  | { row: ApprovalApRow; tab: 'ap' }
  | { row: ApprovalExpenseRow; tab: 'expense' }
  | { row: ApprovalExpenseRow; tab: 'pettyReturn' }
type SplitDraft = {
  amount: number
  destinationId: string
  id: string
}

const pageSizeOptions = [10, 25, 50, 100]
const paymentApprovalApColumns: Array<ResizableColumnDefinition<PaymentApprovalApColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'sourceDocNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'partyName', defaultWidth: 260, minWidth: 140 },
  { key: 'bankAccount', defaultWidth: 220, minWidth: 180 },
  { key: 'totalAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'paidAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'payableBalance', defaultWidth: 110, minWidth: 90 },
  { key: 'status', defaultWidth: 130, minWidth: 110 },
]
const paymentApprovalExpenseColumns: Array<ResizableColumnDefinition<PaymentApprovalExpenseColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'sourceDocNo', defaultWidth: 150, minWidth: 120 },
  { key: 'dueDate', defaultWidth: 120, minWidth: 100 },
  { key: 'partyName', defaultWidth: 260, minWidth: 140 },
  { key: 'refDocNo', defaultWidth: 150, minWidth: 130 },
  { key: 'totalAmount', defaultWidth: 120, minWidth: 95 },
  { key: 'status', defaultWidth: 130, minWidth: 110 },
]
const approvalFilterOptions: Array<{ label: string; values: ApprovalStatus[] }> = [
  { label: 'ทั้งหมด', values: [] },
  { label: 'ยังไม่อนุมัติ', values: ['pending'] },
  { label: 'อนุมัติแล้ว', values: ['approved'] },
  { label: 'ยกเลิกแล้ว', values: ['voided'] },
]
const defaultApprovalStatusFilter: ApprovalStatus[] = ['pending']

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

function expenseDestinationSummaryLabel(row: ApprovalExpenseRow) {
  if (row.approvalStatus !== 'pending') return row.destinationLabel || row.accountName || '-'
  if (row.destinationOptions.length === 0) return 'ยังไม่มีบัญชีจ่ายปลายทาง'
  return row.destinationOptions.map((option) => option.label).join(', ')
}

function approvalStatusLabel(status: ApprovalApRow['approvalStatus']) {
  if (status === 'approved') return 'อนุมัติแล้ว'
  if (status === 'voided') return 'ยกเลิกแล้ว'
  return 'ยังไม่อนุมัติ'
}

function approvalStatusTone(status: ApprovalApRow['approvalStatus']) {
  if (status === 'approved') return 'text-emerald-700'
  if (status === 'voided') return 'text-red-700'
  return 'text-slate-500'
}

function approvalStatusDot(status: ApprovalApRow['approvalStatus']) {
  if (status === 'approved') return 'bg-emerald-500'
  if (status === 'voided') return 'bg-red-500'
  return 'bg-slate-300'
}

function approvalRowKindLabel(status: ApprovalStatus) {
  if (status === 'pending') return 'source รออนุมัติ'
  if (status === 'voided') return 'PMA ยกเลิกแล้ว'
  return 'PMA approved'
}

function newSplitDraft(optionId: string, amount: number): SplitDraft {
  return {
    amount,
    destinationId: optionId,
    id: `SPLIT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  }
}

function destinationOptionsForRow(row: ApprovalApRow | ApprovalExpenseRow) {
  return 'bankAccounts' in row ? row.bankAccounts : row.destinationOptions
}

function approvalBalanceForRow(row: ApprovalApRow | ApprovalExpenseRow) {
  return 'payableBalance' in row ? row.payableBalance : row.totalAmount
}

function defaultDestinationId(row: ApprovalApRow | ApprovalExpenseRow) {
  if ('bankAccounts' in row) return row.bankAccounts[0]?.id ?? ''
  return row.destinationOptions.some((option) => option.id === row.accountId) ? row.accountId : row.destinationOptions[0]?.id ?? ''
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
      return 'bankAccounts' in row ? destinationSummaryLabel(row) : expenseDestinationSummaryLabel(row)
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
    <div className="flex flex-col py-1">
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

function SortableHead({
  align,
  currentKey,
  direction,
  label,
  onSort,
  resizeProps,
  sortKey,
}: {
  align: 'left' | 'right'
  currentKey: ApprovalSortKey
  direction: ApprovalSortDirection
  label: string
  onSort: (key: ApprovalSortKey) => void
  resizeProps?: ButtonHTMLAttributes<HTMLButtonElement>
  sortKey: ApprovalSortKey
}) {
  return (
    <ResizableTableHead
      activeSortKey={currentKey}
      align={align}
      direction={direction}
      label={label}
      resizeProps={resizeProps}
      sortKey={sortKey}
      onSort={onSort}
    />
  )
}

export function PaymentApprovalPageClient() {
  const [data, setData] = useState<ApprovalPayload>({ apRows: [], expenseRows: [], pettyReturnRows: [] })
  const [detail, setDetail] = useState<ApprovalDetailState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inputDrafts, setInputDrafts] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false)
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<ApprovalStatus[]>(defaultApprovalStatusFilter)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [sortDirection, setSortDirection] = useState<ApprovalSortDirection>('desc')
  const [sortKey, setSortKey] = useState<ApprovalSortKey>('date')
  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>([])
  const [tab, setTab] = useState<ApprovalTab>('ap')
  const apColumnResize = useResizableColumns('daily.payment-approval.ap.v5', paymentApprovalApColumns)
  const expenseColumnResize = useResizableColumns('daily.payment-approval.expense.v5', paymentApprovalExpenseColumns)
  const activeColumnResize = tab === 'expense' || tab === 'pettyReturn' ? expenseColumnResize : apColumnResize
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<ApprovalPayload>('/api/daily/payment-approval')
      setData({ ...payload, pettyReturnRows: payload.pettyReturnRows ?? [] })
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
    if (!detail || detail.row.approvalStatus !== 'pending') return
    setSplitDrafts((current) => {
      if (current.length > 0) return current
      return [newSplitDraft(defaultDestinationId(detail.row), approvalBalanceForRow(detail.row))]
    })
  }, [detail])

  const purchaseApprovalRows = useMemo(() => data.apRows.filter((row) => row.sourceType === 'purchase_bill'), [data.apRows])
  const advanceApprovalRows = useMemo(() => data.apRows.filter((row) => row.sourceType === 'advance_payment'), [data.apRows])
  const pendingTabCounts = useMemo(() => ({
    advance: advanceApprovalRows.filter((row) => row.approvalStatus === 'pending').length,
    ap: purchaseApprovalRows.filter((row) => row.approvalStatus === 'pending').length,
    expense: data.expenseRows.filter((row) => row.approvalStatus === 'pending').length,
    pettyReturn: data.pettyReturnRows.filter((row) => row.approvalStatus === 'pending').length,
  }), [advanceApprovalRows, data.expenseRows, data.pettyReturnRows, purchaseApprovalRows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source = tab === 'ap'
      ? purchaseApprovalRows
      : tab === 'advance'
        ? advanceApprovalRows
        : tab === 'pettyReturn'
          ? data.pettyReturnRows
          : data.expenseRows
    return source.filter((row) => {
      const rowDate = row.date || ''
      const haystack = `${row.docNo} ${row.sourceDocNo} ${'supplierName' in row ? row.supplierName : row.payee} ${'bankAccounts' in row ? destinationSummaryLabel(row) : `${row.accountName} ${row.destinationLabel} ${row.refDocNo}`}`.toLowerCase()
      if (query && !haystack.includes(query)) return false
      if (dateFrom && rowDate < dateFrom) return false
      if (dateTo && rowDate > dateTo) return false
      if (approvalStatusFilter.length > 0 && !approvalStatusFilter.includes(row.approvalStatus)) return false
      return true
    })
  }, [advanceApprovalRows, approvalStatusFilter, data.expenseRows, data.pettyReturnRows, dateFrom, dateTo, purchaseApprovalRows, search, tab])

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

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedRowIds(new Set())
  }, [tab])

  const isPrintable = useCallback((row: ApprovalApRow | ApprovalExpenseRow) => {
    return row.approvalStatus === 'approved'
  }, [])

  const printablePageRows = useMemo(() => {
    return pageRows.filter(isPrintable)
  }, [pageRows, isPrintable])

  const isAllPageSelected = useMemo(() => {
    return printablePageRows.length > 0 && printablePageRows.every((row) => selectedRowIds.has(row.id))
  }, [printablePageRows, selectedRowIds])

  const toggleAllPageRows = useCallback(() => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      if (isAllPageSelected) {
        printablePageRows.forEach((row) => next.delete(row.id))
      } else {
        printablePageRows.forEach((row) => next.add(row.id))
      }
      return next
    })
  }, [isAllPageSelected, printablePageRows])

  const toggleRowSelection = useCallback((rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }, [])

  const handlePrintSelected = useCallback(() => {
    const rowsToPrint = rows.filter((row) => selectedRowIds.has(row.id))
    if (rowsToPrint.length === 0) return
    const modeLabel = tab === 'ap' ? 'ต้นทุน (AP/บิลซื้อ)' : tab === 'advance' ? 'ต้นทุน (จ่ายเงินล่วงหน้า/มัดจำ)' : tab === 'pettyReturn' ? 'คืนเงินสำรองจ่าย / คืนเงินกู้กรรมการ' : 'ค่าใช้จ่าย'
    void openPmaBatchPrint(rowsToPrint, modeLabel)
  }, [rows, selectedRowIds, tab])

  const summary = useMemo(() => {
    return filteredRows.reduce((totals, row) => {
      if (row.approvalStatus !== 'voided') {
        const totalFull = row.totalAmount
        const totalPaid = 'paidAmount' in row ? row.paidAmount : 0
        const totalRemain = 'payableBalance' in row ? row.payableBalance : row.totalAmount
        totals.totalFull += totalFull
        totals.totalPaid += totalPaid
        totals.totalRemain += totalRemain
      }
      if (row.approvalStatus === 'pending') totals.pendingCount += 1
      if (row.approvalStatus === 'approved') totals.approvedCount += 1
      if (row.approvalStatus === 'voided') totals.voidedCount += 1
      return totals
    }, { approvedCount: 0, pendingCount: 0, totalFull: 0, totalPaid: 0, totalRemain: 0, voidedCount: 0 })
  }, [filteredRows])

  const splitTotal = splitDrafts.reduce((sum, split) => sum + split.amount, 0)
  const currentDetailRow = detail?.tab === 'ap' ? detail.row : null
  const currentExpenseDetailRow = detail?.tab === 'expense' || detail?.tab === 'pettyReturn' ? detail.row : null
  const currentSplitRow = detail?.row.approvalStatus === 'pending' ? detail.row : null
  const splitDiff = currentSplitRow ? approvalBalanceForRow(currentSplitRow) - splitTotal : 0
  const isDefaultApprovalStatusFilter = approvalStatusFilter.length === defaultApprovalStatusFilter.length
    && defaultApprovalStatusFilter.every((status) => approvalStatusFilter.includes(status))
  const hasCustomFilters = Boolean(search || dateFrom || dateTo || !isDefaultApprovalStatusFilter || sortKey !== 'date' || sortDirection !== 'desc')

  useEffect(() => {
    setPage(1)
  }, [approvalStatusFilter, dateFrom, dateTo, pageSize, search, sortDirection, sortKey, tab])

  function clearFilters() {
    setApprovalStatusFilter(defaultApprovalStatusFilter)
    setDateFrom('')
    setDateTo('')
    setSearch('')
    setSortDirection('desc')
    setSortKey('date')
  }

  function toggleApprovalStatusFilter(values: ApprovalStatus[]) {
    if (values.length === 0) {
      setApprovalStatusFilter([])
      return
    }
    setApprovalStatusFilter((current) => {
      const allSelected = values.every((value) => current.includes(value))
      if (allSelected) return current.filter((value) => !values.includes(value))
      return Array.from(new Set([...current, ...values]))
    })
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
    if (nextDetail.row.approvalStatus === 'pending') {
      setSplitDrafts([newSplitDraft(defaultDestinationId(nextDetail.row), approvalBalanceForRow(nextDetail.row))])
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
    if (!currentSplitRow) return
    setSplitDrafts((current) => [...current, newSplitDraft(defaultDestinationId(currentSplitRow), 0)])
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

  function splitValidationMessage(row: ApprovalApRow | ApprovalExpenseRow | null) {
    if (!row) return 'ไม่พบรายการที่ต้องการอนุมัติ'
    if (destinationOptionsForRow(row).length === 0) return 'ไม่มีช่องทางจ่ายปลายทางให้เลือก'
    if (splitDrafts.length === 0) return 'เพิ่มอย่างน้อย 1 รายการอนุมัติ'
    for (const split of splitDrafts) {
      if (!split.destinationId) return 'เลือกช่องทางจ่ายปลายทางให้ครบทุกบรรทัด'
      if (!Number.isFinite(split.amount) || split.amount <= 0) return 'ยอดอนุมัติย่อยต้องมากกว่า 0'
    }
    const approvalBalance = approvalBalanceForRow(row)
    if (row.sourceType === 'petty_advance_return' && Math.abs(splitTotal - approvalBalance) > 0.01) {
      return `ยอดอนุมัติคืนเงินต้องเท่ากับ ${formatMoney(approvalBalance)} บาท`
    }
    if (splitTotal - approvalBalance > 0.01) {
      return `ยอดรวมรายการอนุมัติต้องไม่เกิน ${formatMoney(approvalBalance)} บาท`
    }
    return null
  }

  async function approveCurrentDetail() {
    if (!currentSplitRow) {
      return
    }

    const validationError = splitValidationMessage(currentSplitRow)
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSubmittingApproval(true)
    setError(null)
    try {
      const payload = {
        approvalId: currentSplitRow.approvalId ?? currentSplitRow.docNo,
        sourceType: currentSplitRow.sourceType,
        splits: splitDrafts.map((split) => ({
          approvedAmount: split.amount,
          destinationId: split.destinationId,
        })),
      }

      await dailyFetchJson('/api/daily/payment-approval', {
        body: JSON.stringify(payload),
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

  function renderSplitApprovalSection(row: ApprovalApRow | ApprovalExpenseRow) {
    const destinationOptions = destinationOptionsForRow(row)
    const approvalBalance = approvalBalanceForRow(row)

    return (
      <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-slate-900">{row.sourceType === 'petty_advance_return' ? 'แบ่งบัญชีรับคืน' : 'แบ่งรายการอนุมัติจ่าย'}</div>
            <div className="text-xs text-slate-500">{row.sourceType === 'petty_advance_return' ? 'รายการคืนเงินสามารถแยกรับคืนได้หลายบัญชี ยอดรวมต้องเท่ากับยอดคืน' : '1 source document สามารถแตก approval items หลายรายการได้'}</div>
          </div>
          <Button size="sm" type="button" onClick={addSplit}>+ เพิ่มรายการย่อย</Button>
        </div>

        <div className="space-y-2">
          {splitDrafts.map((split, index) => (
            <div key={split.id} className="grid grid-cols-12 gap-2 rounded-md border border-slate-200 bg-white p-3">
              <div className="col-span-12 text-xs font-semibold text-slate-500 md:col-span-1 md:pt-2">#{index + 1}</div>
              <div className="col-span-12 md:col-span-6">
                <label className="block text-xs text-slate-600">
                  {row.sourceType === 'petty_advance_return' ? 'บัญชีรับคืนของบริษัท' : 'ช่องทางจ่าย / บัญชีปลายทาง'}
                  <Select className="mt-1 h-9" value={split.destinationId} onChange={(event) => updateSplit(split.id, { destinationId: event.target.value })}>
                    <option value="">เลือกช่องทางจ่าย</option>
                    {destinationOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
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
            <div className="text-lg font-bold text-red-700">{formatMoney(approvalBalance)}</div>
          </div>
          <div className={`rounded-md p-3 shadow-sm ${splitDiff >= -0.01 ? 'bg-white' : 'bg-red-50'}`}>
            <div className="text-xs text-slate-500">คงเหลือหลังแตก approval</div>
            <div className={`text-lg font-bold ${splitDiff >= -0.01 ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(splitDiff)}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5 text-sm">
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-lg sm:text-xl shrink-0">
            📋
          </div>
          <div>
            <div className="text-xs text-slate-500">รายการทั้งหมด</div>
            <div className="font-mono text-lg sm:text-2xl font-bold text-slate-900">{filteredRows.length}</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-lg sm:text-xl shrink-0">
            💰
          </div>
          <div>
            <div className="text-xs text-blue-600">ยอดเต็ม</div>
            <div className="font-mono text-lg sm:text-2xl font-bold text-blue-700">{formatMoney(summary.totalFull)}</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-lg sm:text-xl shrink-0">
            ✅
          </div>
          <div>
            <div className="text-xs text-emerald-600">ชำระแล้ว</div>
            <div className="font-mono text-lg sm:text-2xl font-bold text-emerald-700">{formatMoney(summary.totalPaid)}</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-lg sm:text-xl shrink-0">
            🚨
          </div>
          <div>
            <div className="text-xs text-red-600">คงเหลือ</div>
            <div className="font-mono text-lg sm:text-2xl font-bold text-red-700">{formatMoney(summary.totalRemain)}</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4 col-span-2 lg:col-span-1">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-lg sm:text-xl shrink-0">
            ⏱️
          </div>
          <div>
            <div className="text-xs text-amber-600">อนุมัติ / รอ / ยกเลิก</div>
            <div className="font-mono text-lg sm:text-2xl font-bold text-amber-700">
              {summary.approvedCount} / {summary.pendingCount} / {summary.voidedCount}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-md bg-white shadow">
        <div className="flex border-b border-slate-100">
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'ap' ? 'border-red-600 text-red-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('ap')}>
            ต้นทุน / Supplier <span className="ml-2 rounded-md-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{pendingTabCounts.ap}</span>
          </button>
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'advance' ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('advance')}>
            จ่ายเงินล่วงหน้า / มัดจำ <span className="ml-2 rounded-md-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{pendingTabCounts.advance}</span>
          </button>
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'expense' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('expense')}>
            ค่าใช้จ่าย <span className="ml-2 rounded-md-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{pendingTabCounts.expense}</span>
          </button>
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'pettyReturn' ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('pettyReturn')}>
            การคืนเงินสำรองจ่าย / คืนเงินกู้กรรมการ <span className="ml-2 rounded-md-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{pendingTabCounts.pettyReturn}</span>
          </button>
        </div>

        {/* Desktop Filters (Hidden on Mobile) */}
        <div className="hidden lg:block space-y-3 border-b border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="min-w-[260px] flex-1 rounded-md" placeholder="ค้นหาเลขที่ / ชื่อ / ช่องทางจ่าย..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="text-xs text-slate-500">วันที่:</label>
            <DatePickerInput id="payment-approval-date-from" value={dateFrom} onChange={setDateFrom} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="payment-approval-date-to" value={dateTo} onChange={setDateTo} />
            {hasCustomFilters ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">สถานะ:</span>
            {approvalFilterOptions.map((option) => {
              const active = option.values.length === 0
                ? approvalStatusFilter.length === 0
                : option.values.every((value) => approvalStatusFilter.includes(value))
              return (
                <button
                  key={option.label}
                  className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
                  type="button"
                  onClick={() => toggleApprovalStatusFilter(option.values)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Mobile Toolbar (Hidden on Desktop) */}
        <div className="space-y-2 border-b border-slate-100 p-3 lg:hidden">
          <div className="flex gap-2 items-center">
            <Input className="min-w-[200px] flex-1 rounded-md h-9" placeholder="ค้นหาเลขที่ / ชื่อ / ช่องทาง..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => setShowMobileFilters(true)}
            >
              ตัวกรอง {hasCustomFilters ? '(มี)' : ''}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedRowIds.size > 0 && (
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs py-1 h-9 gap-1 flex items-center"
              size="sm"
              type="button"
              onClick={handlePrintSelected}
            >
              🖨 พิมพ์ใบอนุมัติที่เลือก ({selectedRowIds.size})
            </Button>
          )}
          {activeColumnResize.hasCustomWidths ? <Button size="sm" type="button" variant="outline" onClick={activeColumnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
          <Select aria-label="จำนวนรายการต่อหน้า" className="h-9 w-auto px-2 py-1" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </Select>
          <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองรายการอนุมัติ</h4>
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
                <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
                <div className="flex items-center gap-2">
                  <DatePickerInput className="flex-1" value={dateFrom} onChange={setDateFrom} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput className="flex-1" value={dateTo} onChange={setDateTo} />
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะการอนุมัติ</span>
                <div className="flex flex-wrap gap-2">
                  {approvalFilterOptions.map((option) => {
                    const active = option.values.length === 0
                      ? approvalStatusFilter.length === 0
                      : option.values.every((value) => approvalStatusFilter.includes(value))
                    return (
                      <button
                        key={option.label}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
                        type="button"
                        onClick={() => toggleApprovalStatusFilter(option.values)}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  clearFilters()
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                className="h-11 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Mobile Card List */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}

        {/* AP / Advance Card List */}
        {!isLoading && (tab === 'ap' || tab === 'advance') && apRows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
            onClick={() => openDetail({ row, tab: 'ap' })}
          >
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                {isPrintable(row) ? (
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 size-4 accent-amber-600 cursor-pointer"
                    checked={selectedRowIds.has(row.id)}
                    onChange={() => toggleRowSelection(row.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : null}
                <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
              </div>
              <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
            </div>

            <div className="text-xs text-slate-600 mb-3 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">ผู้ขาย: </span>
                <span className="text-slate-800">{row.supplierName}</span>
              </div>
              <div className="text-xs text-slate-500">
                อ้างอิง: {row.sourceDocNo} ({row.sourceLabel})
              </div>
              <div className="text-xs text-slate-500">
                ช่องทางจ่าย: {row.approvalStatus === 'approved' ? row.destinationLabel : destinationSummaryLabel(row)}
              </div>
            </div>

            <div className="flex justify-between items-end pt-2 border-t border-slate-100">
              <div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${approvalStatusTone(row.approvalStatus)}`}>
                  <span className={`size-1.5 rounded-full ${approvalStatusDot(row.approvalStatus)}`} />
                  {approvalStatusLabel(row.approvalStatus)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">คงเหลือ / อนุมัติ</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums">{formatMoney(row.payableBalance)}</span>
              </div>
            </div>
          </div>
        ))}

        {/* Expense Card List */}
        {!isLoading && (tab === 'expense' || tab === 'pettyReturn') && expenseRows.map((row) => {
          const overdue = row.dueDate ? row.dueDate < new Date().toISOString().slice(0, 10) : false
          const isPettyReturn = row.sourceType === 'petty_advance_return'
          return (
            <div
              key={row.id}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
              onClick={() => openDetail({ row, tab: isPettyReturn ? 'pettyReturn' : 'expense' })}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  {isPrintable(row) ? (
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 size-4 accent-amber-600 cursor-pointer"
                      checked={selectedRowIds.has(row.id)}
                      onChange={() => toggleRowSelection(row.id)}
                      onClick={(e) => e.stopPropagation()}
                  />
                  ) : null}
                  <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
                </div>
                <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
              </div>

              <div className="text-xs text-slate-600 mb-3 space-y-1">
                <div>
                  <span className="font-semibold text-slate-500">{isPettyReturn ? 'ผู้คืนเงิน: ' : 'ผู้รับเงิน: '}</span>
                  <span className="text-slate-800">{row.payee}</span>
                </div>
                <div className="text-xs text-slate-500">
                  อ้างอิง: {row.sourceDocNo} ({isPettyReturn ? 'เงินสำรองจ่าย / กู้กรรมการ' : 'ค่าใช้จ่าย'})
                </div>
                <div className="text-xs text-slate-500">
                  {isPettyReturn ? 'หมายเหตุ: ' : 'รายละเอียด / อ้างอิง: '}{row.refDocNo || '-'}
                </div>
                {row.dueDate ? (
                  <div className="text-xs">
                    <span className="text-slate-500">ครบกำหนด: </span>
                    <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-700'}>
                      {formatDateDisplay(row.dueDate)}
                      {overdue ? ' (เลยกำหนด)' : ''}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-between items-end pt-2 border-t border-slate-100">
                <div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${approvalStatusTone(row.approvalStatus)}`}>
                    <span className={`size-1.5 rounded-full ${approvalStatusDot(row.approvalStatus)}`} />
                    {approvalStatusLabel(row.approvalStatus)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">{isPettyReturn ? 'ยอดคืน' : 'ยอดรวม'}</span>
                  <span className="font-bold text-red-700 text-sm tabular-nums">{formatMoney(row.totalAmount)}</span>
                </div>
              </div>
            </div>
          )
        })}

        {!isLoading && totalRows === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
            {tab === 'ap' ? 'ไม่มีรายการต้นทุน / Supplier รออนุมัติ' : tab === 'advance' ? 'ไม่มีรายการจ่ายเงินล่วงหน้า / มัดจำรออนุมัติ' : tab === 'pettyReturn' ? 'ไม่มีรายการคืนเงินสำรองจ่าย / คืนเงินกู้กรรมการรออนุมัติ' : 'ไม่มีค่าใช้จ่ายค้างจ่าย'}
          </div>
        ) : null}
      </div>

      {/* Desktop Tables (Hidden on Mobile) */}
      <div className="hidden lg:block">
        {tab === 'ap' || tab === 'advance' ? (
          <div className="overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
            <Table className="text-xs" style={{ minWidth: apColumnResize.tableMinWidth + 40, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '40px' }} />
                {paymentApprovalApColumns.map((column) => {
                  const style = apColumnResize.getColumnStyle(column.key);
                  return <col key={column.key} style={style} />;
                })}
              </colgroup>
              <TableHeader>
                <tr>
                  <th className="w-10 text-center py-2 px-1">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 size-3.5 accent-amber-600 cursor-pointer"
                      checked={isAllPageSelected}
                      onChange={toggleAllPageRows}
                    />
                  </th>
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="เลขที่เอกสาร" resizeProps={apColumnResize.getResizeHandleProps('docNo', 'เลขที่เอกสาร')} sortKey="docNo" onSort={changeSort} />
                  <ResizableTableHead label="เอกสารอ้างอิง" resizeProps={apColumnResize.getResizeHandleProps('sourceDocNo', 'เอกสารอ้างอิง')} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="วันที่" resizeProps={apColumnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="ผู้ขาย" resizeProps={apColumnResize.getResizeHandleProps('partyName', 'ผู้ขาย')} sortKey="partyName" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="ช่องทางจ่าย / ปลายทาง" resizeProps={apColumnResize.getResizeHandleProps('bankAccount', 'ช่องทางจ่าย / ปลายทาง')} sortKey="bankAccount" onSort={changeSort} />
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="ยอด" resizeProps={apColumnResize.getResizeHandleProps('totalAmount', 'ยอด')} sortKey="totalAmount" onSort={changeSort} />
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="ชำระแล้ว" resizeProps={apColumnResize.getResizeHandleProps('paidAmount', 'ชำระแล้ว')} sortKey="paidAmount" onSort={changeSort} />
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="คงเหลือ / อนุมัติ" resizeProps={apColumnResize.getResizeHandleProps('payableBalance', 'คงเหลือ / อนุมัติ')} sortKey="payableBalance" onSort={changeSort} />
                  <ResizableTableHead align="center" label="สถานะ" resizeProps={apColumnResize.getResizeHandleProps('status', 'สถานะ')} />
                </tr>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                {!isLoading && apRows.map((row) => {
                  const isVoided = row.approvalStatus === 'voided'
                  return (
                    <TableRow
                      key={row.id}
                      className={`cursor-pointer ${isVoided ? 'bg-red-100/60 hover:bg-red-200/60 text-slate-400' : 'hover:bg-slate-50'}`}
                      onClick={() => openDetail({ row, tab: 'ap' })}
                    >
                      <TableCell className="w-10 text-center py-2 px-1" onClick={(e) => e.stopPropagation()}>
                        {isPrintable(row) ? (
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 size-3.5 accent-amber-600 cursor-pointer"
                            checked={selectedRowIds.has(row.id)}
                            onChange={() => toggleRowSelection(row.id)}
                          />
                        ) : (
                          <input
                            type="checkbox"
                            disabled
                            className="rounded border-slate-200 size-3.5 text-slate-300 opacity-30 cursor-not-allowed"
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        <div className="whitespace-nowrap">{row.docNo}</div>
                        <div className="text-xs text-slate-500">{approvalRowKindLabel(row.approvalStatus)}</div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        <div className="whitespace-nowrap">{row.sourceDocNo}</div>
                        <div className="text-xs text-slate-500">{row.sourceLabel}</div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{formatDateDisplay(row.date)}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{row.supplierName}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        {row.approvalStatus === 'approved'
                          ? <div className="whitespace-normal text-slate-700">{row.destinationLabel || '-'}</div>
                          : <div className="whitespace-normal text-slate-500">{destinationSummaryLabel(row)}</div>}
                      </TableCell>
                      <TableCell className="text-right pr-4 text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.totalAmount)}</TableCell>
                      <TableCell className="text-right pr-4 text-xs font-semibold text-emerald-700 tabular-nums">{formatMoney(row.paidAmount)}</TableCell>
                      <TableCell className="text-right pr-4 text-xs font-semibold text-red-700 tabular-nums">{formatMoney(row.payableBalance)}</TableCell>
                      <TableCell className="text-center text-xs">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${approvalStatusTone(row.approvalStatus)}`}>
                          <span className={`size-1.5 rounded-full ${approvalStatusDot(row.approvalStatus)}`} />
                          {approvalStatusLabel(row.approvalStatus)}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!isLoading && totalRows === 0 ? (
                  <TableRow>
                    <TableCell className="p-6 text-center text-slate-500" colSpan={10}>
                      {tab === 'advance' ? 'ไม่มีรายการจ่ายเงินล่วงหน้า / มัดจำรออนุมัติ' : 'ไม่มีรายการต้นทุน / Supplier รออนุมัติ'}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
              <Table className="text-xs" style={{ minWidth: expenseColumnResize.tableMinWidth + 40, tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '40px' }} />
                {paymentApprovalExpenseColumns.map((column) => {
                  const style = expenseColumnResize.getColumnStyle(column.key);
                  return <col key={column.key} style={style} />;
                })}
              </colgroup>
              <TableHeader>
                <tr>
                  <th className="w-10 text-center py-2 px-1">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 size-3.5 accent-amber-600 cursor-pointer"
                      checked={isAllPageSelected}
                      onChange={toggleAllPageRows}
                    />
                  </th>
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label={tab === 'pettyReturn' ? 'เลขที่เอกสาร' : 'เลขที่/วันที่'} resizeProps={expenseColumnResize.getResizeHandleProps('docNo', tab === 'pettyReturn' ? 'เลขที่เอกสาร' : 'เลขที่/วันที่')} sortKey="docNo" onSort={changeSort} />
                  <ResizableTableHead label="เอกสารอ้างอิง" resizeProps={expenseColumnResize.getResizeHandleProps('sourceDocNo', 'เอกสารอ้างอิง')} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="ครบกำหนด" resizeProps={expenseColumnResize.getResizeHandleProps('dueDate', 'ครบกำหนด')} sortKey="dueDate" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label={tab === 'pettyReturn' ? 'ผู้คืนเงิน' : 'ผู้รับเงิน'} resizeProps={expenseColumnResize.getResizeHandleProps('partyName', tab === 'pettyReturn' ? 'ผู้คืนเงิน' : 'ผู้รับเงิน')} sortKey="partyName" onSort={changeSort} />
                  <ResizableTableHead label={tab === 'pettyReturn' ? 'หมายเหตุ' : 'รายละเอียด / อ้างอิง'} resizeProps={expenseColumnResize.getResizeHandleProps('refDocNo', tab === 'pettyReturn' ? 'หมายเหตุ' : 'รายละเอียด / อ้างอิง')} />
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label={tab === 'pettyReturn' ? 'ยอดคืน' : 'ยอดเต็ม'} resizeProps={expenseColumnResize.getResizeHandleProps('totalAmount', tab === 'pettyReturn' ? 'ยอดคืน' : 'ยอดเต็ม')} sortKey="totalAmount" onSort={changeSort} />
                  <ResizableTableHead align="center" label="สถานะ" resizeProps={expenseColumnResize.getResizeHandleProps('status', 'สถานะ')} />
                </tr>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                {!isLoading && expenseRows.map((row) => {
                  const overdue = row.dueDate ? row.dueDate < new Date().toISOString().slice(0, 10) : false
                  const isPettyReturn = row.sourceType === 'petty_advance_return'
                  const isVoided = row.approvalStatus === 'voided'
                  return (
                    <TableRow
                      key={row.id}
                      className={`cursor-pointer ${isVoided ? 'bg-red-100/60 hover:bg-red-200/60 text-slate-400' : 'hover:bg-slate-50'}`}
                      onClick={() => openDetail({ row, tab: isPettyReturn ? 'pettyReturn' : 'expense' })}
                    >
                      <TableCell className="w-10 text-center py-2 px-1" onClick={(e) => e.stopPropagation()}>
                        {isPrintable(row) ? (
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 size-3.5 accent-amber-600 cursor-pointer"
                            checked={selectedRowIds.has(row.id)}
                            onChange={() => toggleRowSelection(row.id)}
                          />
                        ) : (
                          <input
                            type="checkbox"
                            disabled
                            className="rounded border-slate-200 size-3.5 text-slate-300 opacity-30 cursor-not-allowed"
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        <div className="whitespace-nowrap">{row.docNo}</div>
                        <div className="text-slate-500">{approvalRowKindLabel(row.approvalStatus)}</div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        <div className="whitespace-nowrap">{row.sourceDocNo}</div>
                        <div className="text-slate-500">{isPettyReturn ? 'คืนเงินสำรองจ่าย' : 'ค่าใช้จ่าย'}</div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{row.dueDate ? <span className={overdue ? 'text-red-600' : 'text-slate-700'}>{formatDateDisplay(row.dueDate)}{overdue ? <span className="block text-xs text-red-500">เลยกำหนด</span> : null}</span> : <span className="text-slate-300">-</span>}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{row.payee}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{row.refDocNo ? <div className="text-slate-700">{row.refDocNo}</div> : <span className="text-slate-300">-</span>}</TableCell>
                      <TableCell className="text-right pr-4 text-xs font-semibold text-red-700 tabular-nums">{formatMoney(row.totalAmount)}</TableCell>
                      <TableCell className="text-center text-xs">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${approvalStatusTone(row.approvalStatus)}`}>
                          <span className={`size-1.5 rounded-full ${approvalStatusDot(row.approvalStatus)}`} />
                          {approvalStatusLabel(row.approvalStatus)}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!isLoading && totalRows === 0 ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={8}>{tab === 'pettyReturn' ? 'ไม่มีรายการคืนเงินสำรองจ่าย / คืนเงินกู้กรรมการ' : 'ไม่มีค่าใช้จ่ายค้างจ่าย'}</TableCell></TableRow> : null}
              </TableBody>
          </Table>
          </div>
        )}
      </div>

      <Dialog open={Boolean(detail)} onOpenChange={(open) => { if (!open) closeDetail() }}>
        <DialogContent className="max-h-[90vh] max-w-3xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0" fallbackTitle="รายละเอียดการอนุมัติ" hideClose>
          <DialogHeader className="p-4 bg-slate-900 text-white shrink-0">
            <DialogTitle>{detail ? detail.row.docNo : 'รายละเอียดการอนุมัติ'}</DialogTitle>
            <DialogDescription>รายละเอียดรายการในคิวอนุมัติจ่ายเงิน</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto bg-slate-50">

          {detail?.tab === 'ap' ? (
            <div className="space-y-4 px-6 pb-6 pt-2">
              {/* Reference Document Section */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">ข้อมูลเอกสารอ้างอิง</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailItem label="เลขที่เอกสารอ้างอิง" value={detail.row.sourceDocNo} />
                  <DetailItem label="ประเภทเอกสารอ้างอิง" value={detail.row.sourceLabel} />
                  <DetailItem label="วันที่" value={formatDateDisplay(detail.row.date)} />
                  <DetailItem label="ผู้ขาย" value={detail.row.supplierName} />
                </div>
              </div>

              {/* Financial Section */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">รายละเอียดการเงิน</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailItem label="ยอดเต็ม" value={formatMoney(detail.row.totalAmount)} />
                  <DetailItem label="ชำระแล้ว" value={formatMoney(detail.row.paidAmount)} />
                  <DetailItem label="คงเหลือสุทธิ" value={formatMoney(detail.row.payableBalance)} />
                  <DetailItem label="สถานะ" value={approvalStatusLabel(detail.row.approvalStatus)} />
                </div>
              </div>

              {detail.row.approvalStatus === 'pending' ? renderSplitApprovalSection(detail.row) : (
                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">รายละเอียดการอนุมัติ</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <DetailItem label="เลขที่อนุมัติ" value={detail.row.approvalDisplayDocNo ?? detail.row.docNo} />
                    <DetailItem label="ช่องทางจ่าย / ปลายทาง" value={detail.row.destinationLabel || '-'} />
                    <DetailItem label="ยอดอนุมัติ" value={formatMoney(detail.row.approvedAmount)} />
                    <DetailItem label="สถานะ" value={approvalStatusLabel(detail.row.approvalStatus)} />
                    {detail.row.voidedAt ? <DetailItem label="วันที่ยกเลิก" value={formatDateDisplay(detail.row.voidedAt)} /> : null}
                    {detail.row.voidReason ? <DetailItem label="เหตุผลยกเลิก" value={detail.row.voidReason} /> : null}
                  </div>
                </div>
              )}
            </div>
          ) : detail?.tab === 'expense' || detail?.tab === 'pettyReturn' ? (
            <div className="space-y-4 px-6 pb-6 pt-2">
              {/* Reference Document Section */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">ข้อมูลเอกสารอ้างอิง</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailItem label="เลขที่อนุมัติ" value={detail.row.docNo} />
                  <DetailItem label="เลขที่เอกสารอ้างอิง" value={detail.row.sourceDocNo} />
                  <DetailItem label="วันที่" value={formatDateDisplay(detail.row.date)} />
                  <DetailItem label={detail.row.sourceType === 'petty_advance_return' ? 'วันที่คืน' : 'ครบกำหนด'} value={detail.row.dueDate ? formatDateDisplay(detail.row.dueDate) : '-'} />
                  <DetailItem label={detail.row.sourceType === 'petty_advance_return' ? 'ผู้คืนเงิน' : 'ผู้รับเงิน'} value={detail.row.payee} />
                  <DetailItem label={detail.row.sourceType === 'petty_advance_return' ? 'หมายเหตุ' : 'อ้างอิง'} value={detail.row.refDocNo || '-'} />
                </div>
              </div>

              {/* Financial Section */}
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">รายละเอียดการเงิน</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DetailItem label={detail.row.sourceType === 'petty_advance_return' ? 'บัญชีรับคืน' : 'ช่องทางจ่าย'} value={detail.row.destinationLabel || detail.row.accountName || '-'} />
                  <DetailItem label={detail.row.sourceType === 'petty_advance_return' ? 'ยอดคืน' : 'ยอดเต็ม'} value={formatMoney(detail.row.totalAmount)} />
                  <DetailItem label="สถานะ" value={approvalStatusLabel(detail.row.approvalStatus)} />
                </div>
              </div>

              {detail.row.approvalStatus === 'pending' ? renderSplitApprovalSection(detail.row) : (
                <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-4">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">รายละเอียดการอนุมัติ</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <DetailItem label="เลขที่อนุมัติ" value={detail.row.approvalDisplayDocNo ?? detail.row.docNo} />
                    <DetailItem label="ยอดอนุมัติ" value={formatMoney(detail.row.approvedAmount)} />
                    {detail.row.voidedAt ? <DetailItem label="วันที่ยกเลิก" value={formatDateDisplay(detail.row.voidedAt)} /> : null}
                    {detail.row.voidReason ? <DetailItem label="เหตุผลยกเลิก" value={detail.row.voidReason} /> : null}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          </div>

          <DialogFooter className="flex flex-wrap gap-2 justify-end p-4 border-t bg-slate-50 shrink-0">
            {detail && isPrintable(detail.row) ? (
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1"
                type="button"
                onClick={() => {
                  const modeLabel = tab === 'ap' ? 'ต้นทุน (AP/บิลซื้อ)' : tab === 'advance' ? 'ต้นทุน (จ่ายเงินล่วงหน้า/มัดจำ)' : tab === 'pettyReturn' ? 'คืนเงินสำรองจ่าย / คืนเงินกู้กรรมการ' : 'ค่าใช้จ่าย'
                  void openPmaBatchPrint([detail.row], modeLabel)
                }}
              >
                🖨 พิมพ์ใบอนุมัตินี้
              </Button>
            ) : null}
            {(currentDetailRow?.approvalStatus === 'pending' || currentExpenseDetailRow?.approvalStatus === 'pending') ? (
              <Button
                disabled={
                  isSubmittingApproval
                  || (currentSplitRow != null ? Boolean(splitValidationMessage(currentSplitRow)) : false)
                }
                onClick={() => void approveCurrentDetail()}
              >
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
