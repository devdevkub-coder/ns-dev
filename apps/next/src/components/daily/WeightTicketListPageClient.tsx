'use client'

import { useEffect, useMemo, useState, type ButtonHTMLAttributes } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Printer, Search, Share2, SquarePen, XCircle } from 'lucide-react'
import { getErrorMessage } from '@/lib/api-client'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { openWeightTicketPrintWindow, openWeightTicketReceiptPrint } from '@/lib/weight-ticket-print'
import { openWeightTicketLineShare } from '@/lib/weight-ticket-share'
import { cn } from '@/lib/utils'
import { WeightTicketDetailModal } from './WeightTicketDetailModal'
import { WeightTicketsPageClient } from './WeightTicketsPageClient'
import {
  cancelWeightTicket,
  displayWeightTicketStatus,
  formatWeight,
  listWeightTickets,
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
type WeightTicketColumnKey = 'index' | 'action' | 'branch' | 'createdAt' | 'deductionWeight' | 'documentNo' | 'impurityDeduction' | 'netWeight' | 'partyName' | 'status' | 'updatedAt' | 'vehicleNo'

const pageSize = 10
const weightTicketColumns: Array<ResizableColumnDefinition<WeightTicketColumnKey>> = [
  { key: 'index', defaultWidth: 70, minWidth: 50 },
  { key: 'documentNo', defaultWidth: 150, minWidth: 120 },
  { key: 'createdAt', defaultWidth: 170, minWidth: 130 },
  { key: 'partyName', defaultWidth: 200, minWidth: 150 },
  { key: 'branch', defaultWidth: 140, minWidth: 110 },
  { key: 'vehicleNo', defaultWidth: 130, minWidth: 110 },
  { key: 'netWeight', defaultWidth: 130, minWidth: 100 },
  { key: 'deductionWeight', defaultWidth: 130, minWidth: 100 },
  { key: 'impurityDeduction', defaultWidth: 140, minWidth: 110 },
  { key: 'status', defaultWidth: 160, minWidth: 130 },
  { key: 'updatedAt', defaultWidth: 170, minWidth: 130 },
  { key: 'action', defaultWidth: 320, minWidth: 260 },
]

const statusOptionsByType: Record<WeightTicketType, Array<{ label: string; values: StatusFilter[] }>> = {
  WTI: [
    { label: 'ทุกสถานะ', values: [] },
    { label: 'รับของแล้ว', values: ['received'] },
    { label: 'เสร็จสิ้น', values: ['billed'] },
    { label: 'ยกเลิก', values: ['cancelled'] },
  ],
  WTO: [
    { label: 'ทุกสถานะ', values: [] },
    { label: 'ส่งของแล้ว', values: ['delivered'] },
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

function formatImpurityDeduction(ticket: WeightTicketRecord) {
  return `${formatWeight(ticket.totals.deductionWeight)} กก.`
}

function formatContainerDeduction(ticket: WeightTicketRecord) {
  return `${formatWeight(ticket.totals.containerDeductionWeight)} กก.`
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
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [cancelTicket, setCancelTicket] = useState<WeightTicketRecord | null>(null)
  const columnResize = useResizableColumns('daily.weight-ticket-list.v5', weightTicketColumns)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [isCanceling, setIsCanceling] = useState(false)
  const [printingTicketId, setPrintingTicketId] = useState<string | null>(null)
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = Math.min(page, totalPages)
  const activeFilters = Boolean(query || statusFilter.length > 0 || branchFilter !== 'all' || dateFrom || dateTo)
  const statusOptions = useMemo(() => statusOptionsByType[typeFilter], [typeFilter])

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
  }, [branchFilter, dateFrom, dateTo, page, query, sortBy, sortDir, statusFilter, typeFilter, refreshKey])

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

  const summaryText = useMemo(() => `พบทั้งหมด ${totalRows.toLocaleString('th-TH')} รายการ`, [totalRows])

  return (
    <div className="space-y-5">
      {/* Floating Action Button (Mobile Only) */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
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
      <Card className="hidden lg:block p-4">
        <div className="space-y-3">
          <label className="relative block">
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
          <div className="flex flex-wrap items-center gap-3">
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
            <div className="ml-auto">
              <Button onClick={() => setActiveForm({ type: typeFilter })}>
                <Plus className="mr-2 size-4" />
                สร้างใบรับ-ส่งของ
              </Button>
            </div>
          </div>
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
        </div>
      </Card>

      {/* Mobile Filters Toolbar (Hidden on Desktop) */}
      <div className="space-y-2 p-3 border border-slate-200 bg-white rounded-md lg:hidden">
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
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-955/40 lg:hidden">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองใบรับ-ส่งของ</h4>
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

      <div className="flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>{summaryText}</div>
        <div className="flex items-center gap-2">
          {columnResize.hasCustomWidths ? <Button size="xs" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
          <Button disabled={safePage <= 1 || isLoading} size="xs" type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
          <span>หน้า {safePage} / {totalPages}</span>
          <Button disabled={safePage >= totalPages || isLoading} size="xs" type="button" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</Button>
        </div>
      </div>

      {/* Mobile Card List (Hidden on Desktop) */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : loadError ? (
          <div className="rounded-md bg-white p-8 text-center text-red-600 shadow-sm border border-slate-200">{loadError}</div>
        ) : tickets.length === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">ยังไม่มีรายการตามเงื่อนไข</div>
        ) : (
          tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
              onClick={() => setActiveDetailId(ticket.id)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-slate-800 text-sm">{ticket.documentNo}</span>
                <span className="text-xs text-slate-500">{formatDateTime(ticket.createdAt)}</span>
              </div>

              <div className="text-xs text-slate-600 mb-3 space-y-1">
                <div>
                  <span className="font-semibold text-slate-500">{typeFilter === 'WTI' ? 'ผู้ขาย: ' : 'ลูกค้า: '}</span>
                  <span className="text-slate-800">{ticket.partyName}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">ทะเบียนรถ: </span>
                  <span className="text-slate-800">{ticket.vehicleNo}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">สาขา: </span>
                  <span className="text-slate-800">{ticket.branchName}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">หักสิ่งเจือปน: </span>
                  <span className="text-slate-800">{formatImpurityDeduction(ticket)}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">หักภาชนะ: </span>
                  <span className="text-slate-800">{formatContainerDeduction(ticket)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <div>
                  <span className={cn(
                    'inline-flex items-center gap-1.5 text-xs font-semibold',
                    weightTicketStatusBadgeClass(ticket.type, ticket.status),
                  )}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {displayWeightTicketStatus(ticket.type, ticket.status)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">น้ำหนักสุทธิ</span>
                  <span className="font-bold text-slate-900 text-sm tabular-nums">{formatWeight(ticket.totals.netWeight)} กก.</span>
                  <span className="mt-0.5 block text-[10px] text-amber-700 tabular-nums">หักรวม {formatWeight(ticket.totals.containerDeductionWeight + ticket.totals.deductionWeight)} กก.</span>
                </div>
              </div>

              <div className="flex justify-end items-center gap-1.5 mt-3 pt-2 border-t border-slate-100/50" onClick={(e) => e.stopPropagation()}>
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                  type="button"
                  onClick={() => void handlePrintTicket(ticket)}
                >
                  <Printer className="size-3" />
                  {printingTicketId === ticket.id ? 'เตรียม...' : 'พิมพ์'}
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                  type="button"
                  onClick={() => openWeightTicketLineShare(ticket)}
                >
                  <Share2 className="size-3" />
                  แชร์
                </button>
                {ticket.canEdit ? (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    onClick={() => setActiveForm({ id: ticket.id, type: ticket.type })}
                    type="button"
                  >
                    <SquarePen className="size-3" />
                    แก้ไข
                  </button>
                ) : null}
                {ticket.canCancel ? (
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    type="button"
                    onClick={() => {
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
            </div>
          ))
        )}
      </div>

      {/* Desktop Tables (Hidden on Mobile) */}
      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {weightTicketColumns.map((column) => {
                const style = columnResize.getColumnStyle(column.key);
                return <col key={column.key} style={style} />;
              })}
            </colgroup>
            <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500">
              <tr>
                <ResizableTableHead label="ลำดับ" resizeProps={columnResize.getResizeHandleProps('index', 'ลำดับ')} />
                <SortHeader activeKey={sortBy} align="left" direction={sortDir} label="เลขที่" resizeProps={columnResize.getResizeHandleProps('documentNo', 'เลขที่')} onSort={toggleSort} sortKey="documentNo" />
                <SortHeader activeKey={sortBy} align="left" direction={sortDir} label="วันที่/เวลา" resizeProps={columnResize.getResizeHandleProps('createdAt', 'วันที่/เวลา')} onSort={toggleSort} sortKey="createdAt" />
                <SortHeader activeKey={sortBy} align="left" direction={sortDir} label={typeFilter === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'} resizeProps={columnResize.getResizeHandleProps('partyName', typeFilter === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า')} onSort={toggleSort} sortKey="partyName" />
                <ResizableTableHead label="สาขา" resizeProps={columnResize.getResizeHandleProps('branch', 'สาขา')} />
                <ResizableTableHead label="ทะเบียนรถ" resizeProps={columnResize.getResizeHandleProps('vehicleNo', 'ทะเบียนรถ')} />
                <SortHeader activeKey={sortBy} align="right" direction={sortDir} label="น้ำหนักสุทธิ" resizeProps={columnResize.getResizeHandleProps('netWeight', 'น้ำหนักสุทธิ')} onSort={toggleSort} sortKey="netWeight" />
                <ResizableTableHead align="right" label="หักภาชนะ(กก.)" resizeProps={columnResize.getResizeHandleProps('deductionWeight', 'หักภาชนะ(กก.)')} />
                <ResizableTableHead label="หักสิ่งเจือปน" resizeProps={columnResize.getResizeHandleProps('impurityDeduction', 'หักสิ่งเจือปน')} />
                <ResizableTableHead label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
                <ResizableTableHead label="อัปเดตล่าสุด" resizeProps={columnResize.getResizeHandleProps('updatedAt', 'อัปเดตล่าสุด')} />
                <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td className="px-3 py-10 text-center text-red-600" colSpan={11}>{loadError}</td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={11}>ยังไม่มีรายการตามเงื่อนไข</td>
                </tr>
              ) : tickets.map((ticket, index) => (
                <tr
                  className="cursor-pointer hover:bg-slate-50"
                  key={ticket.id}
                  onClick={() => setActiveDetailId(ticket.id)}
                >
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500 font-mono text-xs text-left">{(page - 1) * pageSize + index + 1}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-900">{ticket.documentNo}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateTime(ticket.createdAt)}</td>
                  <td className="px-3 py-3 text-slate-900">{ticket.partyName}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{ticket.branchName}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{ticket.vehicleNo}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatWeight(ticket.totals.netWeight)} กก.</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-amber-700">{formatContainerDeduction(ticket)}</td>
                  <td className="px-3 py-3 text-slate-600">
                    <div className="truncate">{formatImpurityDeduction(ticket)}</div>
                  </td>
                  <td className="box-border h-[39px] w-[140px] px-3 py-2">
                    <div className="flex min-h-[23px] flex-col items-start justify-center">
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
                  <td className="px-3 py-3 text-slate-600">
                    <div className="truncate">{ticket.updatedBy}</div>
                    <div className="text-[11px] text-slate-400">{formatDateTime(ticket.updatedAt || ticket.createdAt)}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
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
                          openWeightTicketLineShare(ticket)
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
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={Boolean(cancelTicket)} onOpenChange={(open) => {
        if (!open) {
          setCancelTicket(null)
          setCancelNote('')
          setCancelError('')
        }
      }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>ยกเลิกใบรับ-ส่งของ</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-4">
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

      {activeForm && (
        <Dialog open onOpenChange={(open) => {
          if (!open) setActiveForm(null)
        }}>
          <DialogContent aria-labelledby="weight-ticket-form-title" className="max-h-[95vh] max-w-7xl !p-0 overflow-hidden flex flex-col bg-slate-900 border-0" data-combobox-portal-root="true" hideClose>
            <DialogHeader className="px-5 py-3 bg-slate-900 text-white shrink-0">
              <DialogTitle id="weight-ticket-form-title">
                {activeForm.id ? 'แก้ไขใบรับ-ส่งของ' : activeForm.type === 'WTI' ? 'สร้างใบรับของ WTI' : 'สร้างใบส่งของ WTO'}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto bg-slate-50 p-0">
              <WeightTicketsPageClient
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
    </div>
  )
}
