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
type WeightTicketColumnKey = 'action' | 'branch' | 'createdAt' | 'documentNo' | 'netWeight' | 'partyName' | 'status' | 'updatedAt' | 'vehicleNo'

const pageSize = 10
const weightTicketColumns: Array<ResizableColumnDefinition<WeightTicketColumnKey>> = [
  { key: 'documentNo', defaultWidth: 150, minWidth: 120 },
  { key: 'createdAt', defaultWidth: 170, minWidth: 130 },
  { key: 'partyName', defaultWidth: 210, minWidth: 150 },
  { key: 'branch', defaultWidth: 140, minWidth: 110 },
  { key: 'vehicleNo', defaultWidth: 130, minWidth: 110 },
  { key: 'netWeight', defaultWidth: 150, minWidth: 120 },
  { key: 'status', defaultWidth: 160, minWidth: 130 },
  { key: 'updatedAt', defaultWidth: 170, minWidth: 130 },
  { key: 'action', defaultWidth: 300, minWidth: 240 },
]

const statusOptionsByType: Record<WeightTicketType, Array<{ label: string; values: StatusFilter[] }>> = {
  WTI: [
    { label: 'ทุกสถานะ', values: [] },
    { label: 'รับของแล้ว', values: ['received'] },
    { label: 'ออกบิลแล้วบางส่วน', values: ['partially_billed'] },
    { label: 'เสร็จสิ้น', values: ['billed'] },
    { label: 'ยกเลิก', values: ['cancelled'] },
  ],
  WTO: [
    { label: 'ทุกสถานะ', values: [] },
    { label: 'ส่งของแล้ว', values: ['delivered'] },
    { label: 'ออกบิลแล้ว', values: ['partially_billed', 'billed'] },
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
  const columnResize = useResizableColumns('daily.weight-ticket-list', weightTicketColumns)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [isCanceling, setIsCanceling] = useState(false)
  const [printingTicketId, setPrintingTicketId] = useState<string | null>(null)

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
  }, [branchFilter, dateFrom, dateTo, page, query, sortBy, sortDir, statusFilter, typeFilter])

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
      <div className="flex justify-end">
        <Button asChild>
          <Link href="/daily/weight-tickets">
            <Plus className="mr-2 size-4" />
            สร้างใบรับ-ส่งของ
          </Link>
        </Button>
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

      <Card className="p-4">
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

      <div className="flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>{summaryText}</div>
        <div className="flex items-center gap-2">
          {columnResize.hasCustomWidths ? <Button size="xs" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>Set col to default</Button> : null}
          <Button disabled={safePage <= 1 || isLoading} size="xs" type="button" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</Button>
          <span>หน้า {safePage} / {totalPages}</span>
          <Button disabled={safePage >= totalPages || isLoading} size="xs" type="button" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {weightTicketColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}
            </colgroup>
            <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
              <tr>
                <SortHeader activeKey={sortBy} align="left" direction={sortDir} label="เลขที่" resizeProps={columnResize.getResizeHandleProps('documentNo', 'เลขที่')} onSort={toggleSort} sortKey="documentNo" />
                <SortHeader activeKey={sortBy} align="left" direction={sortDir} label="วันที่/เวลา" resizeProps={columnResize.getResizeHandleProps('createdAt', 'วันที่/เวลา')} onSort={toggleSort} sortKey="createdAt" />
                <SortHeader activeKey={sortBy} align="left" direction={sortDir} label={typeFilter === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'} resizeProps={columnResize.getResizeHandleProps('partyName', typeFilter === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า')} onSort={toggleSort} sortKey="partyName" />
                <ResizableTableHead label="สาขา" resizeProps={columnResize.getResizeHandleProps('branch', 'สาขา')} />
                <ResizableTableHead label="ทะเบียนรถ" resizeProps={columnResize.getResizeHandleProps('vehicleNo', 'ทะเบียนรถ')} />
                <SortHeader activeKey={sortBy} align="right" direction={sortDir} label="น้ำหนักสุทธิ" resizeProps={columnResize.getResizeHandleProps('netWeight', 'น้ำหนักสุทธิ')} onSort={toggleSort} sortKey="netWeight" />
                <ResizableTableHead label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
                <ResizableTableHead label="อัปเดตล่าสุด" resizeProps={columnResize.getResizeHandleProps('updatedAt', 'อัปเดตล่าสุด')} />
                <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td className="px-3 py-10 text-center text-red-600" colSpan={10}>{loadError}</td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td className="px-3 py-10 text-center text-slate-500" colSpan={10}>ยังไม่มีรายการตามเงื่อนไข</td>
                </tr>
              ) : tickets.map((ticket) => (
                <tr
                  className="cursor-pointer hover:bg-slate-50"
                  key={ticket.id}
                  onClick={() => router.push(`/daily/weight-ticket-list/${encodeURIComponent(ticket.documentNo)}`)}
                >
                  <td className="whitespace-nowrap px-3 py-3 text-slate-900">{ticket.documentNo}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateTime(ticket.createdAt)}</td>
                  <td className="px-3 py-3 text-slate-900">{ticket.partyName}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{ticket.branchName}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{ticket.vehicleNo}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatWeight(ticket.totals.netWeight)} กก.</td>
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
                        <Link
                          className={rowActionButtonClass}
                          href={`/daily/weight-tickets?id=${encodeURIComponent(ticket.id)}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <SquarePen className="size-3" />
                          แก้ไข
                        </Link>
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
    </div>
  )
}
