'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { poSellFormSchema, type PoSellFormValues } from '@/lib/sales'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { TableNumberCell } from '@/components/ui/TableNumberCell'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { CollapsedList } from '@/components/ui/CollapsedList'

type Option = {
  active?: boolean | null
  code?: string | null
  id: string
  name: string
  unit?: string | null
}

type PoSellRow = {
  branchName: string
  channelName: string
  customerName: string
  date: string
  docNo: string
  expectedDelivery: string
  id: string
  itemCount: number
  margin: number
  marginPct: number
  documentStatus: string
  documentStatusLabel: string
  matchStatus: string
  matchedCost: number
  matchedPct: number
  matchedQty: number
  productName: string
  qty: number
  remainingAmount: number
  remainingQty: number
  requireDelivery: boolean
  status: string
  totalAmount: number
  unitPrice: number
}

type StatusFilterOption = {
  label: string
  value: string
}

type PoSellPayload = {
  filters: { matchStatuses: string[]; statuses: StatusFilterOption[] }
  options: {
    branches: Option[]
    customers: Option[]
    products: Option[]
    salesChannels: Option[]
  }
  rows: PoSellRow[]
  summary: {
    fullyMatched: number
    margin: number
    open: number
    overMatched: number
    partiallyMatched: number
    qty: number
    remainingAmount: number
    remainingQty: number
    totalAmount: number
    totalRows: number
    unmatched: number
  }
}

const blankPoSellItem = (): PoSellFormValues['items'][number] => ({
  deliveryLineId: null,
  deliverySummaryId: null,
  deliveryTicketDocNo: null,
  deliveryTicketId: null,
  discount: 0,
  note: null,
  price: 0,
  productId: '',
  qty: 0,
})

const initialPoSellForm = (): PoSellFormValues => ({
  branchId: null,
  channelId: null,
  customerId: '',
  expectedDelivery: '',
  items: [blankPoSellItem()],
  note: null,
})

const poSellColumns: ResizableColumnDefinition<string>[] = [
  { key: 'docNo', minWidth: 90, defaultWidth: 110 },
  { key: 'date', minWidth: 80, defaultWidth: 90 },
  { key: 'customerName', minWidth: 120, defaultWidth: 420 },
  { key: 'productName', minWidth: 100, defaultWidth: 280 },
  { key: 'qty', minWidth: 70, defaultWidth: 75 },
  { key: 'totalAmount', minWidth: 80, defaultWidth: 80 },
  { key: 'matchedQty', minWidth: 70, defaultWidth: 75 },
  { key: 'remainingQty', minWidth: 70, defaultWidth: 75 },
  { key: 'margin', minWidth: 80, defaultWidth: 80 },
  { key: 'marginPct', minWidth: 50, defaultWidth: 55 },
  { key: 'documentStatus', minWidth: 80, defaultWidth: 90 },
  { key: 'matchStatus', minWidth: 80, defaultWidth: 90 },
  { key: 'action', minWidth: 80, defaultWidth: 90 },
]

export function PoSellPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [data, setData] = useState<PoSellPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<PoSellFormValues>(initialPoSellForm())
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [matchStatus, setMatchStatus] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [selectedRow, setSelectedRow] = useState<PoSellRow | null>(null)
  const [documentStatus, setDocumentStatus] = useState('all')
  const [toDate, setToDate] = useState('')
  const columnResize = useResizableColumns('sales.po-sell', poSellColumns)

  const dateQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [fromDate, toDate])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<PoSellPayload>(`/api/sales/po-sell${dateQuery ? `?${dateQuery}` : ''}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด PO Sell ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [dateQuery])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      if (matchStatus !== 'all' && row.matchStatus !== matchStatus) return false
      if (documentStatus !== 'all' && row.documentStatus !== documentStatus) return false
      if (!query) return true
      return `${row.docNo} ${row.customerName} ${row.channelName} ${row.branchName} ${row.productName} ${row.documentStatusLabel} ${row.status} ${row.matchStatus}`.toLowerCase().includes(query)
    })
  }, [data?.rows, documentStatus, matchStatus, search])

  useEffect(() => {
    setPage(1)
  }, [documentStatus, fromDate, matchStatus, pageSize, search, toDate])

  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const activeBranches = (data?.options.branches ?? []).filter((option) => option.active !== false)
  const activeChannels = (data?.options.salesChannels ?? []).filter((option) => option.active !== false)
  const activeCustomers = (data?.options.customers ?? []).filter((option) => option.active !== false)
  const activeProducts = (data?.options.products ?? []).filter((option) => option.active !== false)
  const formSubtotal = form.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const formQty = form.items.reduce((sum, item) => sum + item.qty, 0)

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (search.trim()) params.set('q', search.trim())
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (documentStatus !== 'all') params.set('status', documentStatus)
    if (matchStatus !== 'all') params.set('matchStatus', matchStatus)
    return `/api/sales/po-sell?${params.toString()}`
  }, [documentStatus, fromDate, matchStatus, search, toDate])

  const hasFilters = Boolean(search.trim() || fromDate || toDate || matchStatus !== 'all' || documentStatus !== 'all')
  const resetFilters = () => {
    setSearch('')
    setFromDate('')
    setToDate('')
    setMatchStatus('all')
    setDocumentStatus('all')
  }

  function openCreateForm() {
    setForm(initialPoSellForm())
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  function updateForm<K extends keyof PoSellFormValues>(key: K, value: PoSellFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  function updateItem(index: number, key: keyof PoSellFormValues['items'][number], value: string | number | null) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setFieldErrors({})
  }

  function removeItem(index: number) {
    setForm((current) => ({ ...current, items: current.items.filter((_item, itemIndex) => itemIndex !== index) }))
  }

  async function savePoSell() {
    const parsed = poSellFormSchema.safeParse(form)
    if (!parsed.success) {
      const flattened = parsed.error.flatten()
      setFieldErrors(Object.fromEntries(Object.entries(flattened.fieldErrors).map(([key, value]) => [key, value?.[0] ?? 'ข้อมูลไม่ถูกต้อง'])))
      setError(flattened.formErrors[0] ?? 'กรุณาตรวจสอบข้อมูลในฟอร์ม')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const created = await dailyFetchJson<{ docNo: string }>('/api/sales/po-sell', {
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
      setShowForm(false)
      setSearch(created.docNo)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึก PO Sell ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Metric className="rounded-md bg-gradient-to-br from-emerald-500 to-teal-700 p-4 text-white shadow" label="📋 PO ทั้งหมด" subLabel={`รายได้รวม ${formatMoney(data?.summary.totalAmount ?? 0)}`} value={`${data?.summary.totalRows ?? 0}`} valueClassName="text-2xl font-bold" />
        <Metric className="rounded-md border-l-4 border-slate-500 bg-white p-4 shadow" label="⚪ Not Matched" subLabel="รอ Match Cost" value={`${data?.summary.unmatched ?? 0}`} valueClassName="text-2xl font-bold text-slate-700" />
        <Metric className="rounded-md border-l-4 border-amber-500 bg-white p-4 shadow" label="⚙ Partial" subLabel="Match บางส่วน" value={`${data?.summary.partiallyMatched ?? 0}`} valueClassName="text-2xl font-bold text-amber-700" />
        <Metric className="rounded-md border-l-4 border-emerald-500 bg-white p-4 shadow" label="✓ Fully Matched" subLabel="พร้อมขาย" value={`${data?.summary.fullyMatched ?? 0}`} valueClassName="text-2xl font-bold text-emerald-700" />
        <Metric className="rounded-md border-2 border-amber-300 bg-amber-50 p-4 shadow" label="⏳ น้ำหนักรอส่ง" subLabel={`จาก ${formatMoney(data?.summary.qty ?? 0)} กก.`} value={formatMoney(data?.summary.remainingQty ?? 0)} valueClassName="text-xl font-bold text-amber-700" />
        <Metric className="rounded-md border-2 border-emerald-300 bg-emerald-50 p-4 shadow" label="💰 มูลค่ารอส่ง" subLabel="รายได้รอรับ" value={formatMoney(data?.summary.remainingAmount ?? 0)} valueClassName="text-xl font-bold text-emerald-700" />
      </div>

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden md:block mb-4 space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[260px] flex-1 rounded-md border px-3 py-2 text-sm" placeholder="ค้นหาเลข PO / ชื่อ Customer / ชื่อสินค้า / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="text-xs text-slate-500">วันที่:</label>
          <DatePickerInput ariaLabel="จากวันที่" className="w-[130px]" title="จากวันที่" value={fromDate} onChange={setFromDate} />
          <span className="text-slate-400">→</span>
          <DatePickerInput ariaLabel="ถึงวันที่" className="w-[130px]" title="ถึงวันที่" value={toDate} onChange={setToDate} />
          {hasFilters ? <button className="rounded-md bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={resetFilters}>✕ ล้าง</button> : null}
          <a className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700" href={exportHref}>Export Excel</a>
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={openCreateForm}>+ PO Sell ใหม่</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">สถานะเอกสาร:</span>
          <MatchButton active={documentStatus === 'all'} label="ทั้งหมด" onClick={() => setDocumentStatus('all')} />
          {(data?.filters.statuses ?? []).map((item) => (
            <MatchButton key={item.value} active={documentStatus === item.value} label={item.label} tone={documentStatusTone(item.value)} onClick={() => setDocumentStatus(item.value)} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">สถานะ Match:</span>
          <MatchButton active={matchStatus === 'all'} label="ทั้งหมด" onClick={() => setMatchStatus('all')} />
          <MatchButton active={matchStatus === 'Not Matched'} label="ยังไม่ Match" tone="slate" onClick={() => setMatchStatus('Not Matched')} />
          <MatchButton active={matchStatus === 'Partially Matched'} label="Partial" tone="amber" onClick={() => setMatchStatus('Partially Matched')} />
          <MatchButton active={matchStatus === 'Fully Matched'} label="Full" tone="emerald" onClick={() => setMatchStatus('Fully Matched')} />
          <MatchButton active={matchStatus === 'Over Matched'} label="Over" tone="red" onClick={() => setMatchStatus('Over Matched')} />
          <MatchButton active={matchStatus === 'Cancelled'} label="Cancelled" tone="slate" onClick={() => setMatchStatus('Cancelled')} />
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-2 rounded-md bg-white p-3 shadow md:hidden">
        <div className="flex gap-2 items-center">
          <input className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-sm h-9" placeholder="ค้นหาเลข PO / Customer / สินค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {hasFilters ? '(มี)' : ''}
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? (
            <button
              className="rounded-md border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              Set col to default
            </button>
          ) : null}
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="rounded-md border border-slate-300 px-2 py-1"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={10}>10 / หน้า</option>
            <option value={25}>25 / หน้า</option>
            <option value={50}>50 / หน้า</option>
            <option value={100}>100 / หน้า</option>
          </select>
          <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={currentPage <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={currentPage >= totalPages} type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 md:hidden">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองรายการจองขาย</h4>
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
                  <DatePickerInput className="flex-1" value={fromDate} onChange={setFromDate} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput className="flex-1" value={toDate} onChange={setToDate} />
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะเอกสาร</span>
                <div className="flex flex-wrap gap-2">
                  <MatchButton active={documentStatus === 'all'} label="ทั้งหมด" onClick={() => setDocumentStatus('all')} />
                  {(data?.filters.statuses ?? []).map((item) => (
                    <MatchButton key={item.value} active={documentStatus === item.value} label={item.label} tone={documentStatusTone(item.value)} onClick={() => setDocumentStatus(item.value)} />
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะ Match Cost</span>
                <div className="flex flex-wrap gap-2">
                  <MatchButton active={matchStatus === 'all'} label="ทั้งหมด" onClick={() => setMatchStatus('all')} />
                  <MatchButton active={matchStatus === 'Not Matched'} label="ยังไม่ Match" tone="slate" onClick={() => setMatchStatus('Not Matched')} />
                  <MatchButton active={matchStatus === 'Partially Matched'} label="Partial" tone="amber" onClick={() => setMatchStatus('Partially Matched')} />
                  <MatchButton active={matchStatus === 'Fully Matched'} label="Full" tone="emerald" onClick={() => setMatchStatus('Fully Matched')} />
                  <MatchButton active={matchStatus === 'Over Matched'} label="Over" tone="red" onClick={() => setMatchStatus('Over Matched')} />
                  <MatchButton active={matchStatus === 'Cancelled'} label="Cancelled" tone="slate" onClick={() => setMatchStatus('Cancelled')} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  resetFilters()
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

      {/* Mobile Card List (Hidden on Desktop) */}
      <div className="block md:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}
        
        {!isLoading && pageRows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
            onClick={() => setSelectedRow(row)}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
              <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
            </div>
            
            <div className="text-xs text-slate-600 mb-3 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">Customer: </span>
                <span className="text-slate-800">{row.customerName}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">สินค้า: </span>
                <span className="text-slate-800">{row.productName || '-'}</span>
              </div>
            </div>

            <div className="flex justify-between items-end pt-2 border-t border-slate-100">
              <div className="flex flex-wrap gap-1">
                <StatusPill label={row.documentStatusLabel} tone={documentStatusPillTone(row.documentStatus)} />
                <StatusPill label={row.matchStatus} tone="match" />
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">จำนวนรวม / รายได้รวม</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums">
                  {formatMoney(row.qty)} กก. / <span className="text-emerald-700">{formatMoney(row.totalAmount)}</span>
                </span>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && totalRows === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
            ยังไม่มี PO Sell
          </div>
        ) : null}
      </div>

      {/* Desktop Table (Hidden on Mobile) */}
      <div className="hidden md:block overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <Table style={{ tableLayout: 'fixed', minWidth: columnResize.tableMinWidth }}>
        <colgroup>
          {poSellColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}
        </colgroup>
        <TableHeader>
          <tr>
            <ResizableTableHead label="เลขที่" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} />
            <ResizableTableHead label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
            <ResizableTableHead label="Customer" resizeProps={columnResize.getResizeHandleProps('customerName', 'Customer')} />
            <ResizableTableHead label="รายการ" resizeProps={columnResize.getResizeHandleProps('productName', 'รายการ')} />
            <ResizableTableHead align="right" label="จำนวนรวม" resizeProps={columnResize.getResizeHandleProps('qty', 'จำนวนรวม')} />
            <ResizableTableHead align="right" label="รายได้รวม" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'รายได้รวม')} />
            <ResizableTableHead align="right" label="Matched" resizeProps={columnResize.getResizeHandleProps('matchedQty', 'Matched')} />
            <ResizableTableHead align="right" label="เหลือ" resizeProps={columnResize.getResizeHandleProps('remainingQty', 'เหลือ')} />
            <ResizableTableHead align="right" label="Deal Margin" resizeProps={columnResize.getResizeHandleProps('margin', 'Deal Margin')} />
            <ResizableTableHead align="right" label="%" resizeProps={columnResize.getResizeHandleProps('marginPct', '%')} />
            <ResizableTableHead align="center" label="สถานะเอกสาร" resizeProps={columnResize.getResizeHandleProps('documentStatus', 'สถานะเอกสาร')} />
            <ResizableTableHead align="center" label="สถานะ Match" resizeProps={columnResize.getResizeHandleProps('matchStatus', 'สถานะ Match')} />
            <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={13}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
          {!isLoading && !error && rows.length === 0 ? <TableRow><TableCell className="py-10 text-center text-slate-400" colSpan={13}>ยังไม่มี PO Sell</TableCell></TableRow> : null}
          {!isLoading && pageRows.map((row) => (
            <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedRow(row)}>
              <TableCell className="whitespace-nowrap font-mono">{row.docNo}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateDisplay(row.date)}</TableCell>
              <TableCell className="truncate">{row.customerName}</TableCell>
              <TableCell className="text-xs font-semibold text-slate-700">
                <CollapsedList
                  inline
                  items={row.productName ? row.productName.split(',').map((item) => item.trim()).filter(Boolean) : []}
                  fallbackText="-"
                />
              </TableCell>
              <TableNumberCell value={formatMoney(row.qty)} />
              <TableCell className="whitespace-nowrap text-right pr-4 font-semibold text-emerald-700 tabular-nums">{formatMoney(row.totalAmount)}</TableCell>
              <TableCell className="whitespace-nowrap text-right pr-4 text-blue-700 tabular-nums">{formatMoney(row.matchedQty)}</TableCell>
              <TableNumberCell tone="amber" value={formatMoney(row.remainingQty)} />
              <TableCell className={`text-right pr-4 font-bold tabular-nums ${row.margin < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(row.margin)}</TableCell>
              <TableCell className={`text-right pr-4 tabular-nums ${row.marginPct < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatPercent(row.marginPct)}</TableCell>
              <TableCell className="text-center"><StatusPill label={row.documentStatusLabel} tone={documentStatusPillTone(row.documentStatus)} /></TableCell>
              <TableCell className="text-center"><StatusPill label={row.matchStatus} tone="match" /></TableCell>
              <TableCell className="whitespace-nowrap text-right"><div className="flex justify-end gap-1"><button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50" disabled title="รอออกแบบ write permission/audit ก่อนเปิดใช้งาน" type="button">แก้ไข</button><button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50" disabled title="รอออกแบบ cancel/reconciliation ก่อนเปิดใช้งาน" type="button">ยกเลิก</button></div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 md:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform"
          onClick={openCreateForm}
          type="button"
          aria-label="สร้าง PO Sell ใหม่"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {selectedRow ? (
        <PoSellDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      ) : null}

      {showForm ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="po-sell-form-title">
          <div className="mx-auto my-4 max-w-2xl rounded-md bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <h3 id="po-sell-form-title" className="font-semibold">สร้าง PO Sell (จองขาย)</h3>
              <button className="text-2xl text-slate-400 hover:text-slate-600" type="button" onClick={() => setShowForm(false)}>×</button>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <SelectField className="col-span-2" error={fieldErrors.customerId} label="Customer *" options={activeCustomers} value={form.customerId} onChange={(value) => updateForm('customerId', value)} />
                <SelectField error={fieldErrors.branchId} label="สาขา/คลัง *" options={activeBranches} value={form.branchId ?? ''} onChange={(value) => updateForm('branchId', value || null)} />
                <SelectField error={fieldErrors.channelId} label="ช่องทางขาย" options={activeChannels} value={form.channelId ?? ''} onChange={(value) => updateForm('channelId', value || null)} />
                <Field error={fieldErrors.expectedDelivery} label="วันส่งมอบ *"><DatePickerInput className="w-full" required value={form.expectedDelivery} onChange={(value) => updateForm('expectedDelivery', value)} /></Field>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="font-medium">📋 รายการสินค้า ({form.items.length})</label>
                  <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, blankPoSellItem()] }))}>+ เพิ่มรายการ</button>
                </div>
                {fieldErrors.items ? <div className="mb-2 text-xs text-red-600">{fieldErrors.items}</div> : null}
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr><th className="p-2 text-left">สินค้า / Grade *</th><th className="w-32 p-2 text-right">จำนวน (กก.) *</th><th className="w-32 p-2 text-right">ราคา/หน่วย *</th><th className="w-32 p-2 text-right">มูลค่ารวม</th><th className="w-8 p-2" /></tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-1 align-top"><ProductSelect inputId={`po-sell-product-${index}`} options={activeProducts} value={item.productId} onChange={(value) => updateItem(index, 'productId', value)} /></td>
                          <td className="p-1 align-top"><input className="w-full rounded-md border px-2 py-1.5 text-right" min={0} step="0.01" type="number" value={item.qty || ''} onChange={(event) => updateItem(index, 'qty', Number(event.target.value))} /></td>
                          <td className="p-1 align-top"><input className="w-full rounded-md border px-2 py-1.5 text-right" min={0} step="0.01" type="number" value={item.price || ''} onChange={(event) => updateItem(index, 'price', Number(event.target.value))} /></td>
                          <td className="bg-blue-50 p-1 px-2 text-right font-bold text-blue-700">{formatMoney(Math.max(0, item.qty * item.price - item.discount))}</td>
                          <td className="p-1 text-center">{form.items.length > 1 ? <button className="px-2 text-red-500" type="button" onClick={() => removeItem(index)}>×</button> : null}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold">
                      <tr><td className="p-2 text-right">รวม {form.items.length} รายการ</td><td className="p-2 text-right">{formatMoney(formQty)}</td><td /><td className="p-2 text-right text-base text-blue-700">{formatMoney(formSubtotal)}</td><td /></tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs">หมายเหตุ</label>
                <textarea className="w-full rounded-md border px-2 py-1.5" rows={2} value={form.note ?? ''} onChange={(event) => updateForm('note', event.target.value || null)} />
                {fieldErrors.note ? <div className="mt-1 text-xs text-red-600">{fieldErrors.note}</div> : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">
              <button className="px-4 py-2 text-sm" disabled={isSaving} type="button" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={() => void savePoSell()}>{isSaving ? 'กำลังบันทึก...' : 'บันทึก PO Sell'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function formatPercent(value: number | null | undefined) {
  return `${formatMoney(value ?? 0)}%`
}

function documentStatusTone(value: string): 'amber' | 'dark' | 'emerald' | 'red' | 'slate' {
  if (value === 'cancelled') return 'slate'
  if (value === 'closed') return 'emerald'
  return 'dark'
}

function documentStatusPillTone(value: string): 'cancelled' | 'closed' | 'match' | 'open' | 'status' {
  if (value === 'cancelled') return 'cancelled'
  if (value === 'closed') return 'closed'
  return 'open'
}

function Metric({ className, label, subLabel, value, valueClassName }: { className: string; label: string; subLabel?: string; value: string; valueClassName: string }) {
  return <div className={className}><div className="text-xs opacity-80">{label}</div><div className={valueClassName}>{value}</div>{subLabel ? <div className="mt-1 text-xs opacity-80">{subLabel}</div> : null}</div>
}

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

function StatusPill({ label, tone = 'status' }: { label: string; tone?: 'cancelled' | 'closed' | 'match' | 'open' | 'status' }) {
  const color = {
    cancelled: 'bg-slate-100 text-slate-700',
    closed: 'bg-emerald-50 text-emerald-700',
    match: 'bg-cyan-50 text-cyan-700',
    open: 'bg-amber-50 text-amber-700',
    status: 'bg-slate-100 text-slate-700',
  }[tone]
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${color}`}>{label || '-'}</span>
}

function renderFieldLabel(label: string) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label
  return <>{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}</>
}

function Field({ children, className, error, label }: { children: ReactNode; className?: string; error?: string; label: string }) {
  return <label className={className}><span className="mb-1 block text-xs font-bold text-slate-700">{renderFieldLabel(label)}</span>{children}{error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}</label>
}

function SelectField({ className, error, label, onChange, options, placeholder = 'เลือก', value }: { className?: string; error?: string; label: string; onChange: (value: string) => void; options: Option[]; placeholder?: string; value: string }) {
  return (
    <Field className={className} error={error} label={label}>
      <select className="w-full rounded-md border px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ` : ''}{option.name}</option>)}
      </select>
    </Field>
  )
}

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}

function ProductSelect({ inputId, onChange, options, value }: { inputId: string; onChange: (productId: string) => void; options: Option[]; value: string }) {
  return (
    <select id={inputId} className="w-full rounded-md border px-2 py-1.5" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">พิมพ์รหัส/ชื่อสินค้า...</option>
      {options.map((option) => <option key={option.id} value={option.id}>{optionLabel(option)}</option>)}
    </select>
  )
}

function PoSellDetailModal({
  onClose,
  row,
}: {
  onClose: () => void
  row: PoSellRow
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="po-sell-detail-title">
      <div className="mx-auto my-4 max-w-lg rounded-md bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3 bg-slate-50">
          <div>
            <h3 id="po-sell-detail-title" className="font-bold text-slate-900">รายละเอียด PO Sell</h3>
            <div className="text-xs text-slate-500 font-mono mt-0.5">{row.docNo}</div>
          </div>
          <button className="text-2xl text-slate-400 hover:text-slate-600" type="button" onClick={onClose}>×</button>
        </div>
        <div className="space-y-4 p-5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <DetailItem label="วันที่สร้างเอกสาร" value={formatDateDisplay(row.date)} />
            <DetailItem label="วันที่กำหนดส่ง" value={formatDateDisplay(row.expectedDelivery)} />
            <DetailItem className="col-span-2" label="Customer" value={row.customerName} />
            <DetailItem label="สาขา/คลัง" value={row.branchName || '-'} />
            <DetailItem label="ช่องทางขาย" value={row.channelName || '-'} />
          </div>

          <div className="rounded-md border border-slate-100 bg-slate-50 p-3 space-y-2">
            <div className="text-xs font-semibold text-slate-500">สถานะรายการ</div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">เอกสาร:</span>
                <StatusPill label={row.documentStatusLabel} tone={documentStatusPillTone(row.documentStatus)} />
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500">Match Cost:</span>
                <StatusPill label={row.matchStatus} tone="match" />
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-100 p-3 space-y-2">
            <div className="text-xs font-semibold text-slate-500">จำนวนและรายได้</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-slate-500">จำนวนจองรวม</span>
                <div className="font-semibold text-slate-800">{formatMoney(row.qty)} กก.</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">รายได้รวม</span>
                <div className="font-semibold text-emerald-700">{formatMoney(row.totalAmount)} บาท</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">จำนวน Matched</span>
                <div className="font-semibold text-blue-700">{formatMoney(row.matchedQty)} กก.</div>
              </div>
              <div>
                <span className="text-xs text-slate-500">จำนวนรอส่ง</span>
                <div className="font-semibold text-amber-700">{formatMoney(row.remainingQty)} กก.</div>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-100 p-3 space-y-2 bg-emerald-50/30">
            <div className="text-xs font-semibold text-emerald-800">Deal Margin</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-emerald-600/80"> Deal Margin </span>
                <div className={`font-bold ${row.margin < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(row.margin)} บาท</div>
              </div>
              <div>
                <span className="text-xs text-emerald-600/80"> Margin % </span>
                <div className={`font-bold ${row.marginPct < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatPercent(row.marginPct)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-100 p-3">
            <div className="text-xs font-semibold text-slate-500 mb-1">รายการสินค้า</div>
            <div className="text-slate-800 font-medium">{row.productName || '-'}</div>
          </div>
        </div>
        <div className="flex justify-end border-t bg-slate-50 px-5 py-3">
          <button className="rounded-md border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={onClose}>ปิด</button>
        </div>
      </div>
    </div>
  )
}

function DetailItem({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return <div className={`rounded-md bg-slate-50 p-2.5 ${className}`}><div className="text-xs text-slate-500">{label}</div><div className="mt-0.5 font-semibold text-slate-800">{value}</div></div>
}
