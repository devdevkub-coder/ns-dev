'use client'

import { useEffect, useMemo, useState, type ButtonHTMLAttributes } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Download, Plus, Printer, RotateCcw, Search, Share2, SquarePen, XCircle } from 'lucide-react'
import { getErrorMessage } from '@/lib/api-client'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns } from '@/components/ui/useResizableColumns'
import { openWeightTicketPrintWindow, openWeightTicketReceiptPrint } from '@/lib/weight-ticket-print'
import { openWeightTicketLineShare } from '@/lib/weight-ticket-share'
import { cn } from '@/lib/utils'
import { WeightTicketDetailModal } from './WeightTicketDetailModal'
import { WeightTicketStockReturnDialog } from './WeightTicketStockReturnDialog'
import { WeightTicketsPageClient } from './WeightTicketsPageClient'
import {
  WEIGHT_TICKET_COLUMN_STORAGE_KEY,
  WEIGHT_TICKET_TABLE_COLUMN_COUNT,
  weightTicketColumns,
} from './weight-ticket-table-layout'
import {
  cancelWeightTicket,
  confirmWeightTicket,
  displayWeightTicketStatus,
  formatWeight,
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

const rowActionButtonClass = 'inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const rowDestructiveActionButtonClass = 'inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50'

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
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
  const dateStr = d.toLocaleDateString('th-TH', {
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
  direction,
  label,
  onSort,
  resizeProps,
  sortKey,
}: {
  activeKey: WeightTicketSortBy
  align: 'center' | 'left' | 'right'
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
      direction={direction}
      label={label}
      resizeProps={resizeProps}
      sortKey={sortKey}
      onSort={onSort}
    />
  )
}

function SegmentMulti({
  current,
  label,
  onClick,
  values,
}: {
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
      className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
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

function canOpenPurchaseBillFromTicket(ticket: WeightTicketRecord) {
  return ticket.type === 'WTI' && ticket.status === 'received' && ticket.usedInPurchaseBillCount === 0
}

function canOpenSalesBillFromTicket(ticket: WeightTicketRecord) {
  return ticket.type === 'WTO' && ticket.status === 'delivered' && ticket.usedInSalesBillCount === 0
}

function canConfirmTicket(ticket: WeightTicketRecord) {
  return ticket.status === 'draft'
    && ticket.usedInPurchaseBillCount === 0
    && ticket.usedInSalesBillCount === 0
}

function confirmTicketLabel(ticket: WeightTicketRecord) {
  return ticket.type === 'WTI' ? 'ยืนยันรับของ' : 'ยืนยันส่งของ'
}

function canReturnWtoStock(ticket: WeightTicketRecord) {
  return ticket.type === 'WTO'
    && ticket.usedInSalesBillCount > 0
    && ticket.productSummaries.some((summary) => summary.remainingWeight > 0.0001)
}

export function WeightTicketListPageClient() {
  const router = useRouter()
  const [tickets, setTickets] = useState<WeightTicketRecord[]>([])
  const [activeDetailId, setActiveDetailId] = useState<string | null>(null)
  const [activeForm, setActiveForm] = useState<{ id?: string; type: WeightTicketType } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [branches, setBranches] = useState<OptionItem[]>([])
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('WTI')
  const [statusFilter, setStatusFilter] = useState<StatusFilter[]>([])
  const [sortBy, setSortBy] = useState<WeightTicketSortBy>('createdAt')
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
  const [shareNote, setShareNote] = useState('')
  const [shareError, setShareError] = useState('')
  const [isSendingLine, setIsSendingLine] = useState(false)
  const [stockReturnTicket, setStockReturnTicket] = useState<WeightTicketRecord | null>(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [successModalMessage, setSuccessModalMessage] = useState('')

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = Math.min(page, totalPages)
  const activeFilters = Boolean(query || statusFilter.length > 0 || branchFilter !== 'all' || dateFrom || dateTo)
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
        const response = await fetch('/api/branches', { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json() as { branches?: Array<{ code?: string | null; id: string; name: string }> }
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
    const type = new URLSearchParams(window.location.search).get('type')
    if (type === 'WTO') {
      setTypeFilter('WTO')
      setStatusFilter([])
      setPage(1)
      return
    }
    if (type === 'WTI') {
      setTypeFilter('WTI')
      setStatusFilter([])
      setPage(1)
    }
  }, [])

  useEffect(() => {
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
  }, [branchFilter, dateFrom, dateTo, page, pageSize, query, sortBy, sortDir, statusFilter, typeFilter, refreshKey])

  function clearFilters() {
    setQuery('')
    setStatusFilter([])
    setSortBy('createdAt')
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

  async function handleCancelTicket() {
    if (!cancelTicket) return
    setIsCanceling(true)
    setCancelError('')
    try {
      const updated = await cancelWeightTicket(cancelTicket.id, cancelNote)
      setTickets((current) => current.map((ticket) => ticket.id === updated.id ? updated : ticket))
      setCancelTicket(null)
      setCancelNote('')
    } catch (caught) {
      setCancelError(getErrorMessage(caught, 'ยกเลิกใบรับ-ส่งของไม่ได้'))
    } finally {
      setIsCanceling(false)
    }
  }

  async function handleConfirmTicket(ticket: WeightTicketRecord) {
    setConfirmingTicketId(ticket.id)
    setLoadError('')
    try {
      const updated = await confirmWeightTicket(ticket.id)
      setTickets((current) => current.map((row) => row.id === updated.id ? updated : row))
    } catch (caught) {
      setLoadError(getErrorMessage(caught, 'ยืนยันใบรับ-ส่งของไม่ได้'))
    } finally {
      setConfirmingTicketId(null)
    }
  }

  async function handlePrintTicket(ticket: WeightTicketRecord) {
    setPrintingTicketId(ticket.id)
    let printWindow: Window | null = null
    try {
      printWindow = openWeightTicketPrintWindow(ticket)
      await openWeightTicketReceiptPrint(ticket, printWindow)
    } catch (caught) {
      printWindow?.close()
      window.alert(getErrorMessage(caught, 'เปิดใบพิมพ์ใบรับ-ส่งสินค้าไม่สำเร็จ'))
    } finally {
      setPrintingTicketId(null)
    }
  }

  function openShareDialog(ticket: WeightTicketRecord) {
    setShareTicket(ticket)
    setShareNote('')
    setShareError('')
  }

  async function handleSendLineNotification() {
    if (!shareTicket) return
    setIsSendingLine(true)
    setShareError('')
    try {
      await notifyWeightTicketLine(shareTicket.id, { customMessage: shareNote.trim() || undefined })
      setShareTicket(null)
      setShareNote('')
      setShareError('')
      setSuccessModalMessage('แชร์สำเร็จ')
    } catch (caught) {
      setShareError(getErrorMessage(caught, 'ส่ง LINE ใบรับ-ส่งของไม่สำเร็จ'))
    } finally {
      setIsSendingLine(false)
    }
  }

  function handleManualLineShare() {
    if (!shareTicket) return
    openWeightTicketLineShare(shareTicket)
    setShareTicket(null)
    setShareNote('')
    setShareError('')
  }

  function openBillFromTicket(ticket: WeightTicketRecord) {
    if (canOpenPurchaseBillFromTicket(ticket)) {
      router.push(`/purchase/bills?new=1&wti=${encodeURIComponent(ticket.documentNo)}`)
      return
    }
    if (canOpenSalesBillFromTicket(ticket)) {
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
          <TabsTrigger value="WTI" variant="line">ใบรับของ WTI</TabsTrigger>
          <TabsTrigger value="WTO" variant="line">ใบส่งของ WTO</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Desktop Filters (Hidden on Mobile) */}
      <Card className="hidden md:block p-4">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative block min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="ค้นหาเลขที่, ผู้ขาย/ลูกค้า, ทะเบียนรถ, สินค้า, สิ่งเจือปน"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
              />
            </label>
            <label className="text-xs text-slate-500">วันที่:</label>
            <DatePickerInput value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
            <span className="text-slate-400">→</span>
            <DatePickerInput value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
            <BranchSelectCombobox
              allOptionLabel="ทุกสาขา"
              branches={branches.map((branch) => ({ id: branch.id, name: branch.label }))}
              className="w-[12rem]"
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">สถานะเอกสาร:</span>
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
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
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
        <Button asChild className="w-full gap-2" size="sm" variant="export">
          <a href={exportHref}>
            <Download className="size-4" />
            <span>ส่งออก Excel</span>
          </a>
        </Button>
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
              <DatePickerInput className="flex-1" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
              <span className="text-slate-400">→</span>
              <DatePickerInput className="flex-1" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
            </div>
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">สาขา</span>
            <BranchSelectCombobox
              allOptionLabel="ทุกสาขา"
              branches={branches.map((branch) => ({ id: branch.id, name: branch.label }))}
              className="w-full"
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

          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะเอกสาร</span>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <SegmentMulti
                  current={statusFilter}
                  key={`mobile-${typeFilter}-${option.label}`}
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
        </MobileFilterSheet>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-sm text-slate-600">
        <div>{summaryText}</div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? <Button className="hidden lg:inline-flex" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
          <Select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto px-2 py-1"
            disabled={isLoading}
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof pageSizeOptions)[number])
              setPage(1)
            }}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option} / หน้า</option>
            ))}
          </Select>
          <Button disabled={safePage <= 1 || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {safePage} / {totalPages}</span>
          <Button disabled={safePage >= totalPages || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</Button>
        </div>
      </div>

      {/* Mobile Card List (Hidden on Desktop) */}
      <div className="block md:hidden space-y-3">
        {isLoading ? (
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
                <span className="font-bold text-slate-900 text-base">{ticket.documentNo}</span>
                <span className="text-sm text-slate-500">{formatDateTime(ticket.createdAt)}</span>
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
                    'inline-flex items-center gap-1.5 text-sm font-semibold px-2 py-0.5 rounded',
                    isCancelled
                      ? 'bg-red-100 text-red-800 ring-1 ring-red-200'
                      : weightTicketStatusBadgeClass(ticket.type, ticket.status),
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

              <div className={cn(
                'mt-3 flex flex-wrap items-center justify-end gap-2 border-t pt-2.5',
                isCancelled ? 'border-red-200' : 'border-slate-100/50',
              )} onClick={(e) => e.stopPropagation()}>
                {canOpenPurchaseBillFromTicket(ticket) ? (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    type="button"
                    onClick={() => openBillFromTicket(ticket)}
                  >
                    เปิดบิลซื้อ
                  </button>
                ) : null}
                {canOpenSalesBillFromTicket(ticket) ? (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                    type="button"
                    onClick={() => openBillFromTicket(ticket)}
                  >
                    เปิดบิลขาย
                  </button>
                ) : null}
                {canConfirmTicket(ticket) ? (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                    disabled={confirmingTicketId === ticket.id}
                    type="button"
                    onClick={() => void handleConfirmTicket(ticket)}
                  >
                    {confirmingTicketId === ticket.id ? 'ยืนยัน...' : confirmTicketLabel(ticket)}
                  </button>
                ) : null}
                {canReturnWtoStock(ticket) ? (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-50"
                    type="button"
                    onClick={() => setStockReturnTicket(ticket)}
                  >
                    <RotateCcw className="size-3.5" />
                    รับของคืน
                  </button>
                ) : null}
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                  type="button"
                  onClick={() => void handlePrintTicket(ticket)}
                >
                  <Printer className="size-3.5" />
                  {printingTicketId === ticket.id ? 'เตรียม...' : 'พิมพ์'}
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  type="button"
                  onClick={() => openShareDialog(ticket)}
                >
                  <Share2 className="size-3.5" />
                  แชร์
                </button>
                {ticket.canEdit ? (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => setActiveForm({ id: ticket.id, type: ticket.type })}
                    type="button"
                  >
                    <SquarePen className="size-3.5" />
                    แก้ไข
                  </button>
                ) : null}
                {ticket.canCancel ? (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
                    type="button"
                    onClick={() => {
                      setCancelTicket(ticket)
                      setCancelError('')
                      setCancelNote(ticket.cancelNote ?? '')
                    }}
                  >
                    <XCircle className="size-3.5" />
                    ยกเลิก
                  </button>
                ) : null}
              </div>
            </div>
          )
          })
        )}
      </div>

      {/* Desktop Tables (Hidden on Mobile) */}
      <div className="hidden md:block overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {weightTicketColumns.map((column) => (
                <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
              <tr>
                <SortHeader activeKey={sortBy} align="left" direction={sortDir} label="เลขที่" resizeProps={columnResize.getResizeHandleProps('documentNo', 'เลขที่')} onSort={toggleSort} sortKey="documentNo" />
                <SortHeader activeKey={sortBy} align="left" direction={sortDir} label="วันที่สร้าง" resizeProps={columnResize.getResizeHandleProps('createdAt', 'วันที่สร้าง')} onSort={toggleSort} sortKey="createdAt" />
                <SortHeader activeKey={sortBy} align="left" direction={sortDir} label={typeFilter === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'} resizeProps={columnResize.getResizeHandleProps('partyName', typeFilter === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า')} onSort={toggleSort} sortKey="partyName" />
                <ResizableTableHead label="สาขา" resizeProps={columnResize.getResizeHandleProps('branch', 'สาขา')} />
                <ResizableTableHead label="ทะเบียนรถ" resizeProps={columnResize.getResizeHandleProps('vehicleNo', 'ทะเบียนรถ')} />
                <SortHeader activeKey={sortBy} align="right" direction={sortDir} label="น้ำหนักสุทธิ" resizeProps={columnResize.getResizeHandleProps('netWeight', 'น้ำหนักสุทธิ')} onSort={toggleSort} sortKey="netWeight" />
                <ResizableTableHead align="right" label="น้ำหนักหักภาชนะ" resizeProps={columnResize.getResizeHandleProps('containerDeductionWeight', 'น้ำหนักหักภาชนะ')} />
                <ResizableTableHead label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
                <ResizableTableHead label="อัปเดตล่าสุด" resizeProps={columnResize.getResizeHandleProps('updatedAt', 'อัปเดตล่าสุด')} />
                <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={WEIGHT_TICKET_TABLE_COLUMN_COUNT}>กำลังโหลดข้อมูล</td>
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
                      'relative whitespace-nowrap px-3 py-3 text-slate-900',
                      isCancelled ? 'font-semibold text-red-900' : '',
                    )}>
                      {isCancelled ? <span aria-hidden className="absolute inset-y-0 left-0 w-2 bg-red-600" /> : null}
                      <span className={isCancelled ? 'pl-2' : undefined}>{ticket.documentNo}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                      <div>{ticketDate}</div>
                      {ticketTime ? <div className="text-xs text-slate-400 mt-0.5">{ticketTime}</div> : null}
                    </td>
                    <td className="px-3 py-3 text-slate-900">{ticket.partyName}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{ticket.branchName}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{ticket.vehicleNo}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatWeight(ticket.totals.netWeight)} กก.</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatWeight(ticket.totals.containerDeductionWeight)} กก.</td>
                    <td className="box-border h-[39px] w-[140px] px-3 py-2">
                      <div className="flex min-h-[23px] flex-col items-start justify-center">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 text-xs font-medium',
                          isCancelled
                            ? 'rounded-md bg-red-100 px-2 py-0.5 font-semibold text-red-800 ring-1 ring-red-200'
                            : weightTicketStatusBadgeClass(ticket.type, ticket.status),
                        )}
                        >
                          <span className="size-1.5 rounded-full bg-current" />
                          {displayWeightTicketStatus(ticket.type, ticket.status)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      <div className="truncate">{ticket.updatedBy}</div>
                      <div className="text-xs text-slate-400">{formatDateTime(ticket.updatedAt || ticket.createdAt)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canOpenPurchaseBillFromTicket(ticket) ? (
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openBillFromTicket(ticket)
                            }}
                          >
                            เปิดบิลซื้อ
                          </button>
                        ) : null}
                        {canOpenSalesBillFromTicket(ticket) ? (
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openBillFromTicket(ticket)
                            }}
                          >
                            เปิดบิลขาย
                          </button>
                        ) : null}
                        {canConfirmTicket(ticket) ? (
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                            disabled={confirmingTicketId === ticket.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void handleConfirmTicket(ticket)
                            }}
                          >
                            {confirmingTicketId === ticket.id ? 'ยืนยัน...' : confirmTicketLabel(ticket)}
                          </button>
                        ) : null}
                        {canReturnWtoStock(ticket) ? (
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setStockReturnTicket(ticket)
                            }}
                          >
                            <RotateCcw className="size-3" />
                            รับของคืน
                          </button>
                        ) : null}
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            void handlePrintTicket(ticket)
                          }}
                        >
                          <Printer className="size-3" />
                          {printingTicketId === ticket.id ? 'เตรียม...' : 'พิมพ์'}
                        </button>
                        <button
                          className={rowActionButtonClass}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            openShareDialog(ticket)
                          }}
                        >
                          <Share2 className="size-3" />
                          แชร์
                        </button>
                        {ticket.canEdit ? (
                          <button
                            className={rowActionButtonClass}
                            onClick={(event) => {
                              event.stopPropagation()
                              setActiveForm({ id: ticket.id, type: ticket.type })
                            }}
                            type="button"
                          >
                            <SquarePen className="size-3" />
                            แก้ไข
                          </button>
                        ) : null}
                        {ticket.canCancel ? (
                          <button
                            className={rowDestructiveActionButtonClass}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setCancelTicket(ticket)
                              setCancelError('')
                              setCancelNote(ticket.cancelNote ?? '')
                            }}
                          >
                            <XCircle className="size-3" />
                            ยกเลิก
                          </button>
                        ) : null}
                      </div>
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
          setShareNote('')
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
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                ข้อความเสริมใน LINE
              </label>
              <textarea
                className="block min-h-[88px] w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 sm:text-sm"
                maxLength={500}
                placeholder="เช่น ส่งเข้ากลุ่มคลัง / แจ้งบัญชีตรวจเอกสาร"
                value={shareNote}
                onChange={(event) => setShareNote(event.target.value)}
              />
              {shareError ? <div className="mt-1 text-xs text-red-600">{shareError}</div> : null}
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setShareTicket(null)}>ปิด</Button>
            <Button disabled={isSendingLine} type="button" variant="outline" onClick={handleManualLineShare}>
              <Share2 className="mr-2 size-4" />
              แชร์เองผ่าน LINE
            </Button>
            <Button disabled={isSendingLine} type="button" onClick={handleSendLineNotification}>
              <Share2 className="mr-2 size-4" />
              {isSendingLine ? 'กำลังส่ง...' : 'ส่งเข้ากลุ่มหลัก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(cancelTicket)} onOpenChange={(open) => {
        if (!open) {
          setCancelTicket(null)
          setCancelNote('')
          setCancelError('')
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
                className="block min-h-[88px] w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 transition-colors placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 sm:text-sm"
                placeholder="ระบุเหตุผลการยกเลิก"
                value={cancelNote}
                onChange={(event) => setCancelNote(event.target.value)}
              />
              {cancelError ? <div className="mt-1 text-xs text-red-600">{cancelError}</div> : null}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="secondary" onClick={() => setCancelTicket(null)}>ปิด</Button>
            <Button disabled={isCanceling} type="button" variant="outline" onClick={handleCancelTicket}>
              <XCircle className="mr-2 size-4" />
              {isCanceling ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeDetailId && (
        <WeightTicketDetailModal
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
          if (!open) setActiveForm(null)
        }}>
          <DialogContent hideClose aria-labelledby="weight-ticket-form-title" className="max-h-[95vh] max-w-7xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0" data-combobox-portal-root="true">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50 p-0">
              <WeightTicketsPageClient
                embeddedModal
                initialType={activeForm.type}
                lockType
                ticketId={activeForm.id}
                onClose={() => setActiveForm(null)}
                onSaveSuccess={() => {
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
          className="share-success-modal max-w-sm rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 outline-none focus:outline-none"
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
          <DialogFooter className="bg-transparent border-t-0 justify-center">
            <Button onClick={() => setSuccessModalMessage('')} className="min-w-[120px]">ตกลง</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
