'use client'
import { Skeleton } from '@/components/ui/Skeleton'

import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Download, Plus, Printer, RotateCcw, Search, Share2, SquarePen, XCircle } from 'lucide-react'
import { getErrorMessage } from '@/lib/api-client'
import { formatThaiDateCE } from '@/lib/format'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useActionConfirmation, useUnsavedChangesGuard } from '@/components/ui/FormSafetyProvider'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns } from '@/components/ui/useResizableColumns'
import { openWeightTicketPrintWindow, openWeightTicketReceiptPrint } from '@/lib/weight-ticket-print'
import {
  invalidateWeightTicketForPrintCache,
  prefetchPrintAssets,
  prefetchPrintFonts,
} from '@/lib/print-asset-prefetch'
import { cn } from '@/lib/utils'
import { cachedWeightTicketReferences } from '@/lib/weight-ticket-reference-cache'
import { invalidatePurchaseBillOptionsCache } from '@/lib/purchase-bill-options-cache'
import { WeightTicketDetailModal } from './WeightTicketDetailModal'
import { WeightTicketStockReturnDialog } from './WeightTicketStockReturnDialog'
import { WeightTicketsPageClient } from './WeightTicketsPageClient'
import { useWeightTicketRealtime } from './useWeightTicketRealtime'
import {
  WEIGHT_TICKET_COLUMN_STORAGE_KEY,
  WEIGHT_TICKET_TABLE_COLUMN_COUNT,
  weightTicketColumns,
} from './weight-ticket-table-layout'
import {
  cancelWeightTicket,
  canConfirmWeightTicket,
  canPrintWeightTicket,
  canReturnWeightTicket,
  canShareWeightTicket,
  confirmWeightTicket,
  displayWeightTicketStatus,
  formatWeight,
  getWeightTicket,
  listWeightTickets,
  notifyWeightTicketLine,
  type OptionItem,
  type WeightTicketRecord,
  type WeightTicketStatus,
  type WeightTicketSortBy,
  type WeightTicketSortDir,
  type WeightTicketType,
  weightTicketStatusBadgeClass,
} from '@/lib/weight-tickets'

type TypeFilter = WeightTicketType
type StatusFilter = WeightTicketStatus

const pageSizeOptions = [10, 25, 50, 100] as const

const statusOptionsByType: Record<WeightTicketType, Array<{ label: string; values: StatusFilter[] }>> = {
  WTI: [
    { label: 'ทุกสถานะ', values: [] },
    { label: 'แบบร่าง', values: ['draft'] },
    { label: 'รับของแล้ว', values: ['received'] },
    { label: 'เสร็จสิ้น', values: ['billed'] },
    { label: 'ยกเลิก', values: ['cancelled'] },
  ],
  WTO: [
    { label: 'ทุกสถานะ', values: [] },
    { label: 'แบบร่าง', values: ['draft'] },
    { label: 'ส่งของแล้ว', values: ['delivered'] },
    { label: 'ออกบิลแล้วบางส่วน', values: ['partially_billed'] },
    { label: 'ออกบิลแล้ว', values: ['billed'] },
    { label: 'ยกเลิก', values: ['cancelled'] },
  ],
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatThaiDateCE(date, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDateTimeSplit(value?: string | null) {
  if (!value) return { date: '-', time: '' }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return { date: value, time: '' }
  const dateStr = formatThaiDateCE(d, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const timeStr = d.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return { date: dateStr, time: timeStr }
}

function SortHeader({
  activeKey,
  align,
  className,
  direction,
  label,
  onSort,
  resizeProps,
  sortKey,
}: {
  activeKey: WeightTicketSortBy
  align: 'center' | 'left' | 'right'
  className?: string
  direction: WeightTicketSortDir
  label: string
  onSort: (key: WeightTicketSortBy) => void
  resizeProps?: ButtonHTMLAttributes<HTMLButtonElement>
  sortKey: WeightTicketSortBy
}) {
  return (
    <ResizableTableHead
      activeSortKey={activeKey}
      align={align}
      className={className}
      direction={direction}
      label={label}
      resizeProps={resizeProps}
      sortKey={sortKey}
      onSort={onSort}
    />
  )
}

function SegmentMulti({
  className = '',
  current,
  label,
  onClick,
  values,
}: {
  className?: string
  current: string[]
  label: string
  onClick: (value: string[]) => void
  values: string[]
}) {
  const active = values.length === 0
    ? current.length === 0
    : values.every((value) => current.includes(value))
  return (
    <button
      className={`min-w-fit flex-1 justify-center rounded-md border px-3 py-1 text-center text-xs font-medium sm:flex-none ${className} ${active ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : 'border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
      type="button"
      onClick={() => {
        if (values.length === 0) {
          onClick([])
          return
        }
        onClick(active ? current.filter((item) => !values.includes(item)) : Array.from(new Set([...current, ...values])))
      }}
    >
      {label}
    </button>
  )
}

function canOpenPurchaseBillFromTicket(ticket: WeightTicketRecord, canOpenBill: boolean) {
  return canOpenBill && ticket.type === 'WTI' && ticket.status === 'received' && ticket.usedInPurchaseBillCount === 0
}

function canOpenSalesBillFromTicket(ticket: WeightTicketRecord, canOpenBill: boolean) {
  return canOpenBill && ticket.type === 'WTO' && ticket.status === 'delivered' && ticket.usedInSalesBillCount === 0
}

function canConfirmTicket(ticket: WeightTicketRecord) {
  return canConfirmWeightTicket(ticket)
}

function confirmTicketLabel(ticket: WeightTicketRecord) {
  return ticket.type === 'WTI' ? 'ยืนยันรับของ' : 'ยืนยันส่งของ'
}

function canReturnWtoStock(ticket: WeightTicketRecord) {
  return canReturnWeightTicket(ticket)
}

export function WeightTicketListPageClient() {
  const router = useRouter()
  const { requestConfirmation } = useActionConfirmation()
  const guardedFormCloseRef = useRef<() => void>(() => {})
  const autoOpenDetailRef = useRef('')
  const realtimeRefreshEventRef = useRef('')
  const realtimeRefreshTimeoutRef = useRef<number | null>(null)
  const [tickets, setTickets] = useState<WeightTicketRecord[]>([])
  const [canOpenPurchaseBill, setCanOpenPurchaseBill] = useState(false)
  const [canOpenSalesBill, setCanOpenSalesBill] = useState(false)
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null)
  const [activeForm, setActiveForm] = useState<{ id?: string; type: WeightTicketType } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [branches, setBranches] = useState<OptionItem[]>([])
  const [query, setQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [isUrlStateReady, setIsUrlStateReady] = useState(false)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('WTI')
  const [statusFilter, setStatusFilter] = useState<StatusFilter[]>([])
  const [sortBy, setSortBy] = useState<WeightTicketSortBy>('documentNo')
  const [sortDir, setSortDir] = useState<WeightTicketSortDir>('desc')
  const [branchFilter, setBranchFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(10)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [cancelTicket, setCancelTicket] = useState<WeightTicketRecord | null>(null)
  const columnResize = useResizableColumns(WEIGHT_TICKET_COLUMN_STORAGE_KEY, weightTicketColumns)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [isCanceling, setIsCanceling] = useState(false)
  const [confirmingTicketId, setConfirmingTicketId] = useState<string | null>(null)
  const [printingTicketId, setPrintingTicketId] = useState<string | null>(null)
  const [shareTicket, setShareTicket] = useState<WeightTicketRecord | null>(null)
  const [shareError, setShareError] = useState('')
  const [isSendingLine, setIsSendingLine] = useState(false)
  const [stockReturnTicket, setStockReturnTicket] = useState<WeightTicketRecord | null>(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [successModalMessage, setSuccessModalMessage] = useState('')
  const { requestDiscard: requestDiscardCancelNote } = useUnsavedChangesGuard(Boolean(cancelTicket && cancelNote.trim()))

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = Math.min(page, totalPages)
  const activeDetailTicket = activeDetailId
    ? tickets.find((ticket) => ticket.id === activeDetailId)
    : undefined
  const activeFilters = Boolean(searchInput || statusFilter.length > 0 || branchFilter !== 'all' || dateFrom || dateTo)
  const realtimeBranchIds = useMemo(() => branches.map((branch) => branch.id), [branches])
  const statusOptions = useMemo(() => statusOptionsByType[typeFilter], [typeFilter])
  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx', sortBy, sortDir, type: typeFilter })
    if (branchFilter !== 'all') params.set('branchId', branchFilter)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (query.trim()) params.set('search', query.trim())
    if (statusFilter.length > 0) params.set('status', statusFilter.join(','))
    return `/api/daily/weight-tickets?${params.toString()}`
  }, [branchFilter, dateFrom, dateTo, query, sortBy, sortDir, statusFilter, typeFilter])

  useEffect(() => {
    let cancelled = false

    async function loadBranches() {
      try {
        const data = await cachedWeightTicketReferences<{ branches?: Array<{ code?: string | null; id: string; name: string }> }>('/api/branches')
        const nextBranches = (data.branches ?? []).map((branch) => ({
          code: branch.code ?? undefined,
          description: branch.code ? `รหัสสาขา ${branch.code}` : undefined,
          id: branch.id,
          label: branch.name,
        }))
        if (!cancelled) setBranches(nextBranches)
      } catch {
        if (!cancelled) setBranches([])
      }
    }

    void loadBranches()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const type = params.get('type')
    const search = params.get('search')
    const detail = params.get('detail')
    const nextSearch = detail || search || ''
    setSearchInput(nextSearch)
    setQuery(nextSearch)
    if (type === 'WTO') {
      setTypeFilter('WTO')
      setStatusFilter([])
      setPage(1)
    } else if (type === 'WTI') {
      setTypeFilter('WTI')
      setStatusFilter([])
      setPage(1)
    }
    setIsUrlStateReady(true)
  }, [])

  useEffect(() => {
    if (!isUrlStateReady) return
    let cancelled = false

    async function loadRows() {
      setIsLoading(true)
      setLoadError('')
      try {
        const result = await listWeightTickets({
          branchId: branchFilter,
          dateFrom,
          dateTo,
          page,
          pageSize,
          search: query.trim(),
          sortBy,
          sortDir,
          status: statusFilter,
          type: typeFilter,
        })
        if (cancelled) return
        setTickets(result.rows)
        setTotalRows(result.totalRows)
        setCanOpenPurchaseBill(result.canOpenPurchaseBill)
        setCanOpenSalesBill(result.canOpenSalesBill)
      } catch (caught) {
        if (cancelled) return
        setTickets([])
        setTotalRows(0)
        setLoadError(getErrorMessage(caught, 'โหลดรายการใบรับ-ส่งของไม่ได้'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadRows()
    return () => {
      cancelled = true
    }
  }, [branchFilter, dateFrom, dateTo, isUrlStateReady, page, pageSize, query, sortBy, sortDir, statusFilter, typeFilter, refreshKey])

  const scheduleRealtimeRefresh = useCallback((event: { documentNo: string; updatedAt: string | null; changeType: string }) => {
    const eventKey = `${event.documentNo}:${event.updatedAt ?? ''}:${event.changeType}`
    if (realtimeRefreshEventRef.current === eventKey) return
    realtimeRefreshEventRef.current = eventKey
    if (realtimeRefreshTimeoutRef.current !== null) return
    realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null
      setRefreshKey((previous) => previous + 1)
    }, 250)
  }, [])

  useEffect(() => () => {
    if (realtimeRefreshTimeoutRef.current !== null) window.clearTimeout(realtimeRefreshTimeoutRef.current)
  }, [])

  // Warm the Noto Sans Thai webfonts in the browser cache on mount so the
  // print popup (which loads the same fonts) can render on first paint.
  // Idempotent and best-effort: failures fall back to the popup's own loader.
  useEffect(() => {
    void prefetchPrintFonts()
  }, [])

  useWeightTicketRealtime(scheduleRealtimeRefresh, isUrlStateReady, realtimeBranchIds)

  useEffect(() => {
    if (!isUrlStateReady || searchInput === query) return
    const timeoutId = window.setTimeout(() => {
      setQuery(searchInput)
      setPage(1)
    }, 350)
    return () => window.clearTimeout(timeoutId)
  }, [isUrlStateReady, query, searchInput])

  useEffect(() => {
    if (isLoading || tickets.length === 0 || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const detail = params.get('detail')?.trim()
    if (!detail) return
    const key = `${typeFilter}:${detail}`
    if (autoOpenDetailRef.current === key) return
    const ticket = tickets.find((row) => row.documentNo === detail)
    if (!ticket) return
    autoOpenDetailRef.current = key
    setActiveDetailId(ticket.id)
  }, [isLoading, tickets, typeFilter])

  function clearFilters() {
    setSearchInput('')
    setQuery('')
    setStatusFilter([])
    setSortBy('documentNo')
    setSortDir('desc')
    setBranchFilter('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  function toggleSort(nextSortBy: WeightTicketSortBy) {
    setPage(1)
    if (sortBy === nextSortBy) {
      setSortDir((current) => current === 'desc' ? 'asc' : 'desc')
      return
    }
    setSortBy(nextSortBy)
    setSortDir('desc')
  }

  function handleCancelTicket() {
    if (!cancelTicket) return
    const note = cancelNote.trim()
    if (!note) {
      setCancelError('กรุณากรอกเหตุผลการยกเลิก')
      return
    }

    setCancelError('')
    requestConfirmation({
      confirmLabel: 'ยืนยันยกเลิก',
      description: `เอกสาร ${cancelTicket.documentNo} จะเปลี่ยนสถานะเป็นยกเลิก และเก็บประวัติการทำรายการไว้`,
      destructive: true,
      onConfirm: () => cancelTicketConfirmed(cancelTicket, note),
      title: 'ยืนยันการยกเลิกเอกสารหรือไม่?',
    })
  }

  function closeCancelTicket() {
    if (isCanceling) return
    requestDiscardCancelNote(() => {
      setCancelTicket(null)
      setCancelNote('')
      setCancelError('')
    })
  }

  async function cancelTicketConfirmed(ticket: WeightTicketRecord, note: string) {
    setIsCanceling(true)
    setCancelError('')
    try {
      const updated = await cancelWeightTicket(ticket.id, note)
      invalidatePurchaseBillOptionsCache()
      invalidateWeightTicketForPrintCache(ticket.id)
      setTickets((current) => current.map((ticket) => ticket.id === updated.id ? updated : ticket))
      setCancelTicket(null)
      setCancelNote('')
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(getErrorMessage(caught, 'ยกเลิกใบรับ-ส่งของไม่ได้'))
      setCancelError(error.message)
      throw error
    } finally {
      setIsCanceling(false)
    }
  }

  async function handleConfirmTicket(ticket: WeightTicketRecord) {
    setConfirmingTicketId(ticket.id)
    setLoadError('')
    try {
      const updated = await confirmWeightTicket(ticket.id)
      invalidatePurchaseBillOptionsCache()
      invalidateWeightTicketForPrintCache(ticket.id)
      setTickets((current) => current.map((row) => row.id === updated.id ? updated : row))
    } catch (caught) {
      setLoadError(getErrorMessage(caught, 'ยืนยันใบรับ-ส่งของไม่ได้'))
    } finally {
      setConfirmingTicketId(null)
    }
  }

  async function handlePrintTicket(ticket: WeightTicketRecord) {
    if (!canPrintWeightTicket(ticket.status)) return
    setPrintingTicketId(ticket.id)
    let printWindow: Window | null = null
    try {
      printWindow = openWeightTicketPrintWindow(ticket)
      // Open the popup, fetch the ticket detail, and warm the company profile
      // cache in parallel so the print builder can skip its own profile fetch.
      // The prefetch is best-effort: a failure here only means the builder
      // refetches (it always fetches when the cache is empty).
      void prefetchPrintAssets(ticket.branchId)
      // The list/prefetch cache can contain an older line snapshot after an
      // edit. Printing is a document fact, so always re-read the ticket at the
      // moment the user clicks Print; the prefetch above only warms assets.
      invalidateWeightTicketForPrintCache(ticket.id)
      const detailTicket: WeightTicketRecord = await getWeightTicket(ticket.id)
      await openWeightTicketReceiptPrint(detailTicket, printWindow)
    } catch (caught) {
      printWindow?.close()
      window.alert(getErrorMessage(caught, 'เปิดใบพิมพ์ใบรับ-ส่งสินค้าไม่สำเร็จ'))
    } finally {
      setPrintingTicketId(null)
    }
  }

  function openShareDialog(ticket: WeightTicketRecord) {
    if (!canShareWeightTicket(ticket.status)) return
    setShareTicket(ticket)
    setShareError('')
  }

  async function handleSendLineNotification() {
    if (!shareTicket || !canShareWeightTicket(shareTicket.status)) return
    setIsSendingLine(true)
    setShareError('')
    try {
      await notifyWeightTicketLine(shareTicket.id)
      setShareTicket(null)
      setShareError('')
      setSuccessModalMessage('แชร์สำเร็จ')
    } catch (caught) {
      setShareError(getErrorMessage(caught, 'ส่ง LINE ใบรับ-ส่งของไม่สำเร็จ'))
    } finally {
      setIsSendingLine(false)
    }
  }

  function openBillFromTicket(ticket: WeightTicketRecord) {
    if (canOpenPurchaseBillFromTicket(ticket, canOpenPurchaseBill)) {
      router.push(`/purchase/bills?new=1&wti=${encodeURIComponent(ticket.documentNo)}`)
      return
    }
    if (canOpenSalesBillFromTicket(ticket, canOpenSalesBill)) {
      router.push(`/sales/bills?new=1&wto=${encodeURIComponent(ticket.documentNo)}`)
    }
  }

  const summaryText = useMemo(() => `พบทั้งหมด ${totalRows.toLocaleString('th-TH')} รายการ`, [totalRows])

  return (
    <div className="space-y-5">
      {/* Floating Action Button (Mobile Only) */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 md:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform"
          onClick={() => setActiveForm({ type: typeFilter })}
          type="button"
          aria-label="สร้างใบรับ-ส่งของ"
        >
          <Plus className="size-6 text-white" />
        </button>
      </div>

      <Tabs
        className="gap-0"
        value={typeFilter}
        onValueChange={(value) => {
          const nextType = value as WeightTicketType
          setTypeFilter(nextType)
          setStatusFilter([])
          setPage(1)
        }}
      >
        <TabsList className="w-full" variant="line">
          <TabsTrigger className="flex-1 sm:flex-none" value="WTI" variant="line">ใบรับของ WTI</TabsTrigger>
          <TabsTrigger className="flex-1 sm:flex-none" value="WTO" variant="line">ใบส่งของ WTO</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Desktop Filters (Hidden on Mobile) */}
      <Card className="hidden md:block p-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative block min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-9 pl-9"
                placeholder="ค้นหาเลขที่, ผู้ขาย/ลูกค้า, ทะเบียนรถ, สินค้า, สิ่งเจือปน"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </label>
            <label className="text-xs text-slate-500">วันที่:</label>
            <DatePickerInput className="h-9" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
            <span className="text-slate-400">→</span>
            <DatePickerInput className="h-9" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
            <BranchSelectCombobox
              allOptionLabel="ทุกสาขา"
              branches={branches.map((branch) => ({ id: branch.id, name: branch.label }))}
              className="w-[12rem]"
              controlSize="filter"
              includeAllOption
              inputId="weight-ticket-branch-filter"
              label=""
              placeholder="เลือกสาขา"
              value={branchFilter === 'all' ? null : branchFilter}
              onChange={(branchId) => {
                setBranchFilter(branchId ?? 'all')
                setPage(1)
              }}
            />
            <Button disabled={!activeFilters} type="button" variant="secondary" onClick={clearFilters}>ล้างตัวกรอง</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <span className="shrink-0 text-xs text-slate-500">สถานะเอกสาร:</span>
              {statusOptions.map((option) => (
                <SegmentMulti
                  current={statusFilter}
                  key={`${typeFilter}-${option.label}`}
                  label={option.label}
                  onClick={(values) => {
                    setStatusFilter(values as WeightTicketStatus[])
                    setPage(1)
                  }}
                  values={option.values}
                />
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Button asChild className="gap-2" variant="export">
                <a href={exportHref}>
                  <Download className="size-4" />
                  <span>ส่งออก Excel</span>
                </a>
              </Button>
              <Button onClick={() => setActiveForm({ type: typeFilter })}>
                <Plus className="mr-2 size-4" />
                สร้างใบรับ-ส่งของ
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Mobile Filters Toolbar (Hidden on Desktop) */}
      <div className="space-y-2 p-3 border border-slate-200 bg-white rounded-xl md:hidden">
        <div className="flex gap-2 items-center">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9 h-9 text-slate-800"
              placeholder="ค้นหาเลขที่, คู่ค้า, ทะเบียน..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {activeFilters ? '(มี)' : ''}
          </button>
        </div>
        <Button asChild className="h-10 w-full gap-2" variant="export">
          <a href={exportHref}>
            <Download className="size-4" />
            <span>ส่งออก Excel</span>
          </a>
        </Button>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-500">สถานะเอกสาร:</span>
          {statusOptions.map((option) => (
            <SegmentMulti
              current={statusFilter}
              key={`mobile-toolbar-${typeFilter}-${option.label}`}
              label={option.label}
              onClick={(values) => {
                setStatusFilter(values as WeightTicketStatus[])
                setPage(1)
              }}
              values={option.values}
            />
          ))}
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <MobileFilterSheet
          footer={(
            <>
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
            </>
          )}
          onClose={() => setShowMobileFilters(false)}
          title="ตัวกรองใบรับ-ส่งของ"
          visibleClassName="md:hidden"
        >
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
            <div className="flex items-center gap-2">
              <DatePickerInput className="h-9 flex-1" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
              <span className="text-slate-400">→</span>
              <DatePickerInput className="h-9 flex-1" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">สาขา</span>
            <BranchSelectCombobox
              allOptionLabel="ทุกสาขา"
              branches={branches.map((branch) => ({ id: branch.id, name: branch.label }))}
              className="w-full"
              controlSize="filter"
              includeAllOption
              inputId="weight-ticket-branch-filter-mobile"
              label=""
              placeholder="เลือกสาขา"
              value={branchFilter === 'all' ? null : branchFilter}
              onChange={(branchId) => {
                setBranchFilter(branchId ?? 'all')
                setPage(1)
              }}
            />
          </div>

        </MobileFilterSheet>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-sm text-slate-600">
        <div>
          {summaryText}
          {isLoading && tickets.length > 0 ? <span className="ml-2 text-xs text-slate-400" role="status">กำลังอัปเดต...</span> : null}
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto">
          {columnResize.hasCustomWidths ? <Button className="hidden lg:inline-flex" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
          <PageSizeDropdown disabled={isLoading} options={pageSizeOptions} value={pageSize} onChange={(size) => {
            setPageSize(size as (typeof pageSizeOptions)[number])
            setPage(1)
          }} />
          <div className="flex items-center gap-2"><Button disabled={safePage <= 1 || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {safePage} / {totalPages}</span>
          <Button disabled={safePage >= totalPages || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</Button></div>
        </div>
      </div>

      {/* Mobile Card List (Hidden on Desktop) */}
      <div className="block md:hidden space-y-3">
        {isLoading && tickets.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : loadError ? (
          <div className="rounded-xl bg-white p-8 text-center text-red-600 shadow-sm border border-slate-200">{loadError}</div>
        ) : tickets.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">ยังไม่มีรายการตามเงื่อนไข</div>
        ) : (
          tickets.map((ticket) => {
            const isCancelled = ticket.status === 'cancelled'
            return (
            <div
              key={ticket.id}
              className={cn(
                'cursor-pointer space-y-3 rounded-md border p-4 shadow-sm transition-colors',
                isCancelled
                  ? 'border-red-300 border-l-8 border-l-red-600 bg-red-100/80 ring-1 ring-red-200 active:bg-red-200/70'
                  : 'border-slate-200 bg-white active:bg-slate-50',
              )}
              onClick={() => setActiveDetailId(ticket.id)}
            >
              <div className="flex justify-between items-start">
                <span className="whitespace-nowrap font-bold text-slate-900 text-base">{ticket.documentNo}</span>
                <span className="whitespace-nowrap text-sm text-slate-500">{formatDateTime(ticket.createdAt)}</span>
              </div>

              <div className={cn(
                'space-y-1.5 rounded-md border p-3 text-sm text-slate-700',
                isCancelled ? 'border-red-200 bg-white/80' : 'border-slate-100 bg-slate-50',
              )}>
                <div>
                  <span className="font-semibold text-slate-500">{typeFilter === 'WTI' ? 'ผู้ขาย: ' : 'ลูกค้า: '}</span>
                  <span className="text-slate-900">{ticket.partyName}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">ทะเบียนรถ: </span>
                  <span className="text-slate-900">{ticket.vehicleNo}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">สาขา: </span>
                  <span className="text-slate-900">{ticket.branchName}</span>
                </div>
              </div>

              <div className={cn(
                'flex items-center justify-between border-t pt-2.5',
                isCancelled ? 'border-red-200' : 'border-slate-100',
              )}>
                <div>
                  <span className={cn(
                    'inline-flex items-center gap-1.5 text-sm font-semibold',
                    weightTicketStatusBadgeClass(ticket.type, ticket.status),
                  )}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {displayWeightTicketStatus(ticket.type, ticket.status)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">น้ำหนักสุทธิ</span>
                  <span className="font-bold text-emerald-700 text-base tabular-nums">{formatWeight(ticket.totals.netWeight)} กก.</span>
                  <span className="text-xs text-slate-400 block mt-0.5">หักภาชนะ {formatWeight(ticket.totals.containerDeductionWeight)} กก.</span>
                </div>
              </div>

              {!isCancelled ? <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100/50 pt-2.5" onClick={(e) => e.stopPropagation()}>
                <TableActionButton
                  aria-label={`จัดการ ${ticket.documentNo}`}
                  busy={confirmingTicketId === ticket.id || printingTicketId === ticket.id}
                  mobileLabel
                  menu={(
                    <>
                      <TableActionMenuItem onSelect={() => setActiveDetailId(ticket.id)}>รายละเอียด</TableActionMenuItem>
                      {canOpenPurchaseBillFromTicket(ticket, canOpenPurchaseBill) ? <TableActionMenuItem onSelect={() => openBillFromTicket(ticket)}>เปิดบิลซื้อ</TableActionMenuItem> : null}
                      {canOpenSalesBillFromTicket(ticket, canOpenSalesBill) ? <TableActionMenuItem onSelect={() => openBillFromTicket(ticket)}>เปิดบิลขาย</TableActionMenuItem> : null}
                      {canConfirmTicket(ticket) ? <TableActionMenuItem disabled={confirmingTicketId === ticket.id} onSelect={() => void handleConfirmTicket(ticket)}>{confirmingTicketId === ticket.id ? 'กำลังยืนยัน...' : confirmTicketLabel(ticket)}</TableActionMenuItem> : null}
                      {canReturnWtoStock(ticket) ? <TableActionMenuItem onSelect={() => setStockReturnTicket(ticket)}>รับของคืน</TableActionMenuItem> : null}
                      {canPrintWeightTicket(ticket.status) ? <TableActionMenuItem disabled={printingTicketId === ticket.id} onSelect={() => void handlePrintTicket(ticket)} onMouseEnter={() => { void prefetchPrintAssets(ticket.branchId) }} onFocus={() => { void prefetchPrintAssets(ticket.branchId) }}>{printingTicketId === ticket.id ? 'กำลังเตรียมพิมพ์...' : 'พิมพ์'}</TableActionMenuItem> : null}
                      {canShareWeightTicket(ticket.status) ? <TableActionMenuItem onSelect={() => openShareDialog(ticket)}>แชร์</TableActionMenuItem> : null}
                      {ticket.canEdit ? <TableActionMenuItem onSelect={() => setActiveForm({ id: ticket.id, type: ticket.type })}>แก้ไข</TableActionMenuItem> : null}
                      {ticket.canCancel ? (
                        <TableActionMenuItem onSelect={() => {
                          setCancelTicket(ticket)
                          setCancelError('')
                          setCancelNote(ticket.cancelNote ?? '')
                        }}>
                          ยกเลิก
                        </TableActionMenuItem>
                      ) : null}
                    </>
                  )}
                />
              </div> : null}
            </div>
          )
          })
        )}
      </div>

      {/* Desktop Tables (Hidden on Mobile) */}
      <div className="hidden md:block overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, maxWidth: columnResize.tableMaxWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {weightTicketColumns.map((column) => (
                <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
              <tr>
                <SortHeader activeKey={sortBy} align="center" direction={sortDir} label="เลขที่" resizeProps={columnResize.getResizeHandleProps('documentNo', 'เลขที่')} onSort={toggleSort} sortKey="documentNo" />
                <SortHeader activeKey={sortBy} align="center" direction={sortDir} label="วันที่สร้าง" resizeProps={columnResize.getResizeHandleProps('createdAt', 'วันที่สร้าง')} onSort={toggleSort} sortKey="createdAt" />
                <SortHeader activeKey={sortBy} align="left" className="ns-table-textual-column" direction={sortDir} label={typeFilter === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'} resizeProps={columnResize.getResizeHandleProps('partyName', typeFilter === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า')} onSort={toggleSort} sortKey="partyName" />
                <ResizableTableHead label="สาขา" resizeProps={columnResize.getResizeHandleProps('branch', 'สาขา')} />
                <ResizableTableHead align="center" label="ทะเบียนรถ" resizeProps={columnResize.getResizeHandleProps('vehicleNo', 'ทะเบียนรถ')} />
                <SortHeader activeKey={sortBy} align="right" direction={sortDir} label="น้ำหนักสุทธิ" resizeProps={columnResize.getResizeHandleProps('netWeight', 'น้ำหนักสุทธิ')} onSort={toggleSort} sortKey="netWeight" />
                <ResizableTableHead align="right" label="น้ำหนักหักภาชนะ" resizeProps={columnResize.getResizeHandleProps('containerDeductionWeight', 'น้ำหนักหักภาชนะ')} />
                <ResizableTableHead align="center" label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
                <ResizableTableHead align="center" label="อัปเดตล่าสุด" resizeProps={columnResize.getResizeHandleProps('updatedAt', 'อัปเดตล่าสุด')} />
                <ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
              </tr>
            </thead>
            <tbody>
              {isLoading && tickets.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={WEIGHT_TICKET_TABLE_COLUMN_COUNT}><div className="flex items-center justify-center gap-3 py-1"><Skeleton className="h-4 w-44" /><Skeleton className="h-4 w-28" /><span className="sr-only">กำลังโหลดข้อมูล</span></div></td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td className="px-3 py-10 text-center text-red-600" colSpan={WEIGHT_TICKET_TABLE_COLUMN_COUNT}>{loadError}</td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={WEIGHT_TICKET_TABLE_COLUMN_COUNT}>ยังไม่มีรายการตามเงื่อนไข</td>
                </tr>
              ) : tickets.map((ticket) => {
                const { date: ticketDate, time: ticketTime } = formatDateTimeSplit(ticket.createdAt)
                const isCancelled = ticket.status === 'cancelled'
                return (
                  <tr
                    className={cn(
                      'cursor-pointer transition-colors',
                      isCancelled ? 'bg-red-100/70 hover:bg-red-200/70' : 'hover:bg-slate-50',
                    )}
                    key={ticket.id}
                    onClick={() => setActiveDetailId(ticket.id)}
                  >
                    <td className={cn(
                      'relative whitespace-nowrap px-3 py-3 text-center font-mono text-slate-900',
                      isCancelled ? 'font-semibold text-red-900' : '',
                    )}>
                      {isCancelled ? <span aria-hidden className="absolute inset-y-0 left-0 w-2 bg-red-600" /> : null}
                      <span className={isCancelled ? 'pl-2' : undefined}>{ticket.documentNo}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-center text-slate-600">
                      <div>{ticketDate}</div>
                      {ticketTime ? <div className="text-xs text-slate-400 mt-0.5">{ticketTime}</div> : null}
                    </td>
                    <td className="ns-table-textual-column px-3 py-3 text-left text-slate-900">{ticket.partyName}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{ticket.branchName}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-center text-slate-600">{ticket.vehicleNo}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatWeight(ticket.totals.netWeight)} กก.</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatWeight(ticket.totals.containerDeductionWeight)} กก.</td>
                    <td className="box-border h-[39px] w-[140px] whitespace-nowrap px-3 py-2 text-center">
                      <div className="flex min-h-[23px] flex-col items-center justify-center">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-medium',
                          weightTicketStatusBadgeClass(ticket.type, ticket.status),
                        )}
                        >
                          <span className="size-1.5 rounded-full bg-current" />
                          {displayWeightTicketStatus(ticket.type, ticket.status)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600">
                      <div className="mx-auto max-w-[180px] truncate font-semibold text-slate-800" title={ticket.updatedBy ?? ''}>{ticket.updatedBy}</div>
                      <div className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(ticket.updatedAt || ticket.createdAt)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-center">
                      {isCancelled ? null : <TableActionButton
                        aria-label={`จัดการ ${ticket.documentNo}`}
                        busy={confirmingTicketId === ticket.id || printingTicketId === ticket.id}
                        menu={(
                          <>
                            <TableActionMenuItem onSelect={() => setActiveDetailId(ticket.id)}>รายละเอียด</TableActionMenuItem>
                            {canOpenPurchaseBillFromTicket(ticket, canOpenPurchaseBill) ? <TableActionMenuItem onSelect={() => openBillFromTicket(ticket)}>เปิดบิลซื้อ</TableActionMenuItem> : null}
                            {canOpenSalesBillFromTicket(ticket, canOpenSalesBill) ? <TableActionMenuItem onSelect={() => openBillFromTicket(ticket)}>เปิดบิลขาย</TableActionMenuItem> : null}
                            {canConfirmTicket(ticket) ? <TableActionMenuItem disabled={confirmingTicketId === ticket.id} onSelect={() => void handleConfirmTicket(ticket)}>{confirmingTicketId === ticket.id ? 'กำลังยืนยัน...' : confirmTicketLabel(ticket)}</TableActionMenuItem> : null}
                            {canReturnWtoStock(ticket) ? <TableActionMenuItem onSelect={() => setStockReturnTicket(ticket)}>รับของคืน</TableActionMenuItem> : null}
                            {canPrintWeightTicket(ticket.status) ? <TableActionMenuItem disabled={printingTicketId === ticket.id} onSelect={() => void handlePrintTicket(ticket)} onMouseEnter={() => { void prefetchPrintAssets(ticket.branchId) }} onFocus={() => { void prefetchPrintAssets(ticket.branchId) }}>{printingTicketId === ticket.id ? 'กำลังเตรียมพิมพ์...' : 'พิมพ์'}</TableActionMenuItem> : null}
                            {canShareWeightTicket(ticket.status) ? <TableActionMenuItem onSelect={() => openShareDialog(ticket)}>แชร์</TableActionMenuItem> : null}
                            {ticket.canEdit ? <TableActionMenuItem onSelect={() => setActiveForm({ id: ticket.id, type: ticket.type })}>แก้ไข</TableActionMenuItem> : null}
                            {ticket.canCancel ? (
                              <TableActionMenuItem onSelect={() => {
                                setCancelTicket(ticket)
                                setCancelError('')
                                setCancelNote(ticket.cancelNote ?? '')
                              }}>
                                ยกเลิก
                              </TableActionMenuItem>
                            ) : null}
                          </>
                        )}
                        onClick={(event) => event.stopPropagation()}
                      />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>



      <Dialog open={Boolean(shareTicket)} onOpenChange={(open) => {
        if (!open) {
          setShareTicket(null)
          setShareError('')
        }
      }}
      >
        <DialogContent hideClose mobileAppShell={false} className="max-w-lg rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 outline-none focus:outline-none">
          <DialogHeader>
            <DialogTitle>แชร์ใบรับ-ส่งของ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 bg-slate-50 p-4">
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <div className="font-semibold text-slate-900">{shareTicket?.documentNo}</div>
              <div className="mt-1 text-xs text-slate-500">{shareTicket?.partyName} · {shareTicket ? `${formatWeight(shareTicket.totals.netWeight)} กก.` : ''}</div>
            </div>
            {shareError ? <div className="mt-1 text-xs text-red-600">{shareError}</div> : null}
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setShareTicket(null)}>ปิด</Button>
            <Button disabled={isSendingLine} type="button" onClick={handleSendLineNotification}>
              <Share2 className="mr-2 size-4" />
              {isSendingLine ? 'กำลังส่ง...' : 'ส่งเข้ากลุ่มหลัก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelTicket)} onOpenChange={(open) => {
        if (!open) {
          closeCancelTicket()
        }
      }}
      >
        <DialogContent hideClose mobileAppShell={false} className="max-w-lg rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 outline-none focus:outline-none">
          <DialogHeader>
            <DialogTitle>ยกเลิกใบรับ-ส่งของ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 bg-slate-50 p-4">
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <div className="text-sm text-slate-900">{cancelTicket?.documentNo}</div>
              {cancelTicket ? (
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-slate-500">สถานะเอกสาร:</span>
                  <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', weightTicketStatusBadgeClass(cancelTicket.type, cancelTicket.status))}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {displayWeightTicketStatus(cancelTicket.type, cancelTicket.status)}
                  </span>
                </div>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                เหตุผลการยกเลิก<span className="ml-1 text-red-600">*</span>
              </label>
              <textarea
                aria-invalid={Boolean(cancelError && !cancelNote.trim())}
                className="block min-h-[88px] w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 sm:text-sm"
                placeholder="ระบุเหตุผลการยกเลิก"
                maxLength={500}
                required
                value={cancelNote}
                onChange={(event) => {
                  setCancelNote(event.target.value)
                  if (cancelError && !cancelNote.trim()) setCancelError('')
                }}
              />
              {cancelError ? <div className="mt-1 text-xs text-red-600">{cancelError}</div> : null}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button disabled={isCanceling} type="button" variant="secondary" onClick={closeCancelTicket}>ปิด</Button>
            <Button disabled={isCanceling} type="button" variant="outline" onClick={handleCancelTicket}>
              <XCircle className="mr-2 size-4" />
              {isCanceling ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeDetailId && (
        <WeightTicketDetailModal
          initialTicket={activeDetailTicket}
          ticketId={activeDetailId}
          onClose={() => {
            setActiveDetailId(null)
            setRefreshKey((prev) => prev + 1)
          }}
          onEdit={(id, type) => {
            setActiveDetailId(null)
            setActiveForm({ id, type })
          }}
        />
      )}

      {stockReturnTicket ? (
        <WeightTicketStockReturnDialog
          open={Boolean(stockReturnTicket)}
          ticketDocNo={stockReturnTicket.documentNo}
          onClose={() => setStockReturnTicket(null)}
          onCompleted={() => {
            setStockReturnTicket(null)
            setRefreshKey((prev) => prev + 1)
          }}
        />
      ) : null}

      {activeForm && (
        <Dialog open onOpenChange={(open) => {
          if (!open) guardedFormCloseRef.current()
        }}>
          <DialogContent hideClose aria-labelledby="weight-ticket-form-title" className="max-h-[95vh] max-w-7xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0" data-combobox-portal-root="true">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50 p-0">
              <WeightTicketsPageClient
                embeddedModal
                initialType={activeForm.type}
                lockType
                ticketId={activeForm.id}
                onRequestClose={(requestClose) => { guardedFormCloseRef.current = requestClose }}
                onClose={() => setActiveForm(null)}
                onSaveSuccess={() => {
                  // The print prefetch cache can outlive the form; drop it so
                  // the next print re-reads the freshly saved ticket.
                  invalidateWeightTicketForPrintCache(activeForm.id)
                  setActiveForm(null)
                  setRefreshKey((prev) => prev + 1)
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!successModalMessage}>
        <DialogContent
          hideClose
          mobileAppShell={false}
          className="share-success-modal max-w-sm rounded-md !p-0 overflow-hidden flex flex-col bg-white border-0 outline-none focus:outline-none"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="flex flex-col items-center justify-center space-y-4 bg-white p-6">
            <div className="share-success-icon-wrap rounded-full bg-emerald-100 p-3">
              <CheckCircle2 className="share-success-icon h-8 w-8 text-emerald-600" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-slate-800">{successModalMessage}</h3>
            </div>
          </div>
          <DialogFooter className="bg-white border-t-0 justify-center">
            <Button onClick={() => setSuccessModalMessage('')} className="min-w-[120px]">ตกลง</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
