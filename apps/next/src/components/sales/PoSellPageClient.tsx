'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Plus, Printer } from 'lucide-react'
import { openPoSellPrint, openPoSellPrintWindow, type PoSellPrintDocument } from '@/lib/po-sell-print'
import { Button as UiButton } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input as UiInput } from '@/components/ui/Input'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select as UiSelect } from '@/components/ui/Select'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { poSellFormSchema, type PoSellFormValues } from '@/lib/sales'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { TableNumberCell } from '@/components/ui/TableNumberCell'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { CollapsedList } from '@/components/ui/CollapsedList'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'

type Option = {
  active?: boolean | null
  branchIds?: string[]
  code?: string | null
  id: string
  marketScope?: string | null
  name: string
  unit?: string | null
}

type PoSellRow = {
  branchId: string | null
  branchName: string
  canCancel: boolean
  canEdit: boolean
  cancelDisabledReason: string
  channelId: string | null
  channelName: string
  createdAt: string
  customerId: string | null
  customerName: string
  customerAddress?: string | null
  customerTaxId?: string | null
  customerPhone?: string | null
  docNo: string
  editDisabledReason: string
  expectedDelivery: string
  id: string
  items: Array<{
    discount: number
    note: string | null
    price: number
    productId: string
    productName: string
    qty: number
    remainingQty: number
    totalAmount: number
    unitPrice: number
    unit?: string | null
  }>
  itemCount: number
  margin: number
  marginPct: number
  documentStatus: string
  documentStatusLabel: string
  matchStatus: string
  matchStatusLabel: string
  matchedCost: number
  matchedPct: number
  matchedQty: number
  note: string | null
  productName: string
  qty: number
  remainingAmount: number
  remainingQty: number
  requireDelivery: boolean
  status: string
  totalAmount: number
  unitPrice: number
  updatedAt: string
  updatedBy: string
  createdBy: string
  hasVat: boolean
  vatRatePercent: number
  vatAmount: number
  vatType: string
  subtotal: number
}

function canShortClosePoSell(row: PoSellRow) {
  return (row.documentStatus === 'open' || row.documentStatus === 'partial') && row.remainingQty > 0
}

type StatusFilterOption = {
  label: string
  value: string
}

type PoSellPayload = {
  filters: { matchStatuses: StatusFilterOption[]; statuses: StatusFilterOption[] }
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
  tradingCostSourceId: null,
})

const initialPoSellForm = (): PoSellFormValues => ({
  branchId: null,
  channelId: null,
  customerId: '',
  expectedDelivery: '',
  hasVat: false,
  items: [blankPoSellItem()],
  note: null,
  salesPlanId: null,
})

const SALES_PLAN_DEFAULT_BRANCH_NAME = 'สมุทรสาคร'

const poSellColumns: ResizableColumnDefinition<string>[] = [
  { key: 'docNo', minWidth: 120, defaultWidth: 140 },
  { key: 'createdAt', minWidth: 100, defaultWidth: 110 },
  { key: 'expectedDelivery', minWidth: 100, defaultWidth: 110 },
  { key: 'customerName', minWidth: 120, defaultWidth: 260 },
  { key: 'productName', minWidth: 100, defaultWidth: 180 },
  { key: 'qty', minWidth: 90, defaultWidth: 110 },
  { key: 'totalAmount', minWidth: 110, defaultWidth: 135 },
  { key: 'matchedQty', minWidth: 90, defaultWidth: 110 },
  { key: 'remainingQty', minWidth: 90, defaultWidth: 110 },
  { key: 'margin', minWidth: 110, defaultWidth: 135 },
  { key: 'marginPct', minWidth: 70, defaultWidth: 85 },
  { key: 'documentStatus', minWidth: 120, defaultWidth: 140 },
  { key: 'matchStatus', minWidth: 150, defaultWidth: 170 },
  { key: 'updatedAt', minWidth: 150, defaultWidth: 180 },
  { key: 'action', minWidth: 180, defaultWidth: 200 },
]

export function PoSellPageClient() {
  const handledSalesPlanQueryRef = useRef<string | null>(null)
  const latestLoadRequestRef = useRef(0)
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const salesPlanIdFromQuery = searchParams.get('salesPlanId')
  const [cancelNote, setCancelNote] = useState('')
  const [cancelNoteError, setCancelNoteError] = useState('')
  const [cancelingRow, setCancelingRow] = useState<PoSellRow | null>(null)
  const [data, setData] = useState<PoSellPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingDocNo, setEditingDocNo] = useState<string | null>(null)
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
  const [printingPoDocNo, setPrintingPoDocNo] = useState<string | null>(null)
  const [shortCloseNote, setShortCloseNote] = useState('')
  const [shortCloseNoteError, setShortCloseNoteError] = useState('')
  const [shortClosingRow, setShortClosingRow] = useState<PoSellRow | null>(null)

  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection('asc')
    }
  }

  const printPoSell = async (row: PoSellRow) => {
    if (printingPoDocNo) return
    let printWindow: Window | null = null
    setPrintingPoDocNo(row.docNo)
    try {
      printWindow = openPoSellPrintWindow()
      await openPoSellPrint(row satisfies PoSellPrintDocument, printWindow)
    } catch (err) {
      printWindow?.close()
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการพิมพ์')
    } finally {
      setPrintingPoDocNo(null)
    }
  }

  const columnResize = useResizableColumns('sales.po-sell.v5', poSellColumns)

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
      return `${row.docNo} ${row.customerName} ${row.channelName} ${row.branchName} ${row.productName} ${row.documentStatusLabel} ${row.status} ${row.matchStatus} ${row.matchStatusLabel}`.toLowerCase().includes(query)
    })
  }, [data?.rows, documentStatus, matchStatus, search])

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      let aVal: any = ''
      let bVal: any = ''

      if (sortKey === 'marginPct') {
        aVal = a.marginPct ?? 0
        bVal = b.marginPct ?? 0
      } else if (sortKey === 'qty') {
        aVal = a.qty ?? 0
        bVal = b.qty ?? 0
      } else if (sortKey === 'totalAmount') {
        aVal = a.totalAmount ?? 0
        bVal = b.totalAmount ?? 0
      } else if (sortKey === 'matchedQty') {
        aVal = a.matchedQty ?? 0
        bVal = b.matchedQty ?? 0
      } else if (sortKey === 'remainingQty') {
        aVal = a.remainingQty ?? 0
        bVal = b.remainingQty ?? 0
      } else if (sortKey === 'margin') {
        aVal = a.margin ?? 0
        bVal = b.margin ?? 0
      } else if (sortKey === 'documentStatus') {
        aVal = a.documentStatusLabel ?? ''
        bVal = b.documentStatusLabel ?? ''
      } else if (sortKey === 'matchStatus') {
        aVal = a.matchStatusLabel ?? ''
        bVal = b.matchStatusLabel ?? ''
      } else {
        aVal = a[sortKey as keyof PoSellRow] ?? ''
        bVal = b[sortKey as keyof PoSellRow] ?? ''
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal, 'th')
          : bVal.localeCompare(aVal, 'th')
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }, [rows, sortKey, sortDirection])

  useEffect(() => {
    setPage(1)
  }, [documentStatus, fromDate, matchStatus, pageSize, search, toDate])

  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const activeBranches = (data?.options.branches ?? []).filter((option) => option.active !== false)
  const salesPlanDefaultBranchId = useMemo(
    () => activeBranches.find((option) => option.name.trim() === SALES_PLAN_DEFAULT_BRANCH_NAME)?.id ?? null,
    [activeBranches],
  )
  const activeChannels = useMemo(() => (data?.options.salesChannels ?? []).filter((option) => option.active !== false), [data?.options.salesChannels])
  const allActiveCustomers = useMemo(
    () => (data?.options.customers ?? []).filter((option) => option.active !== false),
    [data?.options.customers],
  )
  const activeCustomers = useMemo(() => {
    if (form.branchId) {
      return allActiveCustomers.filter((option) => option.branchIds?.includes(form.branchId ?? ''))
    }
    if (form.customerId) {
      return allActiveCustomers.filter((option) => option.id === form.customerId)
    }
    return []
  }, [allActiveCustomers, form.branchId, form.customerId])
  const activeProducts = (data?.options.products ?? []).filter((option) => option.active !== false)
  const defaultSalesChannelForCustomer = useCallback((customerId: string) => {
    const customer = allActiveCustomers.find((option) => option.id === customerId)
    const targetScope = customer?.marketScope === 'ต่างประเทศ' ? 'ต่างประเทศ' : customer?.marketScope === 'ในประเทศ' ? 'ในประเทศ' : null
    if (!targetScope) return null
    return activeChannels.find((channel) => [channel.name, channel.code, channel.id].some((value) => String(value ?? '').trim() === targetScope))?.id ?? null
  }, [activeChannels, allActiveCustomers])
  const selectedCustomer = form.customerId
    ? allActiveCustomers.find((customer) => customer.id === form.customerId) ?? null
    : null
  const selectedChannel = form.channelId
    ? (data?.options.salesChannels ?? []).find((channel) => channel.id === form.channelId) ?? null
    : null
  const selectedChannelLabel = selectedChannel
    ? selectedChannel.code ? `${selectedChannel.code} — ${selectedChannel.name}` : selectedChannel.name
    : form.customerId
      ? `ไม่พบช่องทางขาย${selectedCustomer?.marketScope ? `สำหรับ ${selectedCustomer.marketScope}` : ''}`
      : 'เลือกลูกค้าก่อน'
  const formSubtotal = form.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const formQty = form.items.reduce((sum, item) => sum + item.qty, 0)
  const vatRatePercent = 7
  const vatAmount = form.hasVat ? Math.round((formSubtotal * vatRatePercent / 100 + Number.EPSILON) * 100) / 100 : 0
  const formTotalCost = formSubtotal + vatAmount

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
    setEditingDocNo(null)
    setForm(initialPoSellForm())
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  function openEditForm(row: PoSellRow) {
    if (!row.canEdit) {
      setError(row.editDisabledReason || 'รายการนี้ยังไม่สามารถแก้ไขได้')
      return
    }
    setEditingDocNo(row.docNo)
    setForm({
      branchId: row.branchId ?? null,
      channelId: row.channelId ?? null,
      customerId: row.customerId ?? '',
      expectedDelivery: row.expectedDelivery,
      hasVat: row.hasVat,
      items: row.items.length ? row.items.map((item) => ({
        ...blankPoSellItem(),
        discount: item.discount,
        note: item.note,
        price: item.price,
        productId: item.productId,
        qty: item.qty,
      })) : [blankPoSellItem()],
      note: row.note ?? null,
      salesPlanId: null,
    })
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  useEffect(() => {
    setForm((current) => {
      if (current.salesPlanId) return current
      const nextChannelId = current.customerId ? defaultSalesChannelForCustomer(current.customerId) : null
      if ((current.channelId ?? null) === nextChannelId) return current
      return { ...current, channelId: nextChannelId }
    })
  }, [defaultSalesChannelForCustomer])

  useEffect(() => {
    if (!salesPlanIdFromQuery) {
      handledSalesPlanQueryRef.current = null
      return
    }
    if (handledSalesPlanQueryRef.current === salesPlanIdFromQuery) return
    if (!salesPlanIdFromQuery || !data) return
    let cancelled = false
    const today = new Date().toISOString().slice(0, 10)
    setError(null)
    dailyFetchJson<{ planRow: Record<string, string | number | null> }>(`/api/sales-plan?planId=${encodeURIComponent(salesPlanIdFromQuery)}`)
      .then(({ planRow }) => {
        if (cancelled) return
        handledSalesPlanQueryRef.current = salesPlanIdFromQuery
        setEditingDocNo(null)
        setForm({
          branchId: salesPlanDefaultBranchId,
          channelId: String(planRow.channelId ?? planRow.channel ?? '') || null,
          customerId: String(planRow.customerId ?? ''),
          expectedDelivery: today,
          hasVat: false,
          items: [{
            ...blankPoSellItem(),
            price: Number(planRow.sellPrice ?? 0),
            productId: String(planRow.productId ?? planRow.productCode ?? ''),
            qty: Number(planRow.totalKg ?? 0),
          }],
          note: `สร้างจาก Sales Plan ${String(planRow.planNo ?? salesPlanIdFromQuery)}`,
          salesPlanId: salesPlanIdFromQuery,
        })
        setFieldErrors({})
        setShowForm(true)
      })
      .catch((caught) => {
        if (cancelled) return
        setError(caught instanceof Error ? caught.message : 'โหลดแผนขายเพื่อเปิด PO Sell ไม่ได้')
      })
    return () => {
      cancelled = true
    }
  }, [data, salesPlanDefaultBranchId, salesPlanIdFromQuery])

  function openCancelDialog(row: PoSellRow) {
    if (!row.canCancel) {
      setError(row.cancelDisabledReason || 'รายการนี้ยังไม่สามารถยกเลิกได้')
      return
    }
    setCancelingRow(row)
    setCancelNote('')
    setCancelNoteError('')
    setError(null)
  }

  function openShortCloseDialog(row: PoSellRow) {
    if (!canShortClosePoSell(row)) {
      setError('รายการนี้ยังไม่สามารถปิดส่งไม่ครบได้')
      return
    }
    setShortClosingRow(row)
    setShortCloseNote('')
    setShortCloseNoteError('')
    setError(null)
  }

  function updateForm<K extends keyof PoSellFormValues>(key: K, value: PoSellFormValues[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'customerId') {
        const nextChannelId = defaultSalesChannelForCustomer(typeof value === 'string' ? value : '')
        next.channelId = nextChannelId ?? null
      }
      if (key === 'branchId') {
        const branchId = typeof value === 'string' ? value : ''
        const customerStillEligible = (data?.options.customers ?? []).some((customer) => (
          customer.id === current.customerId
          && customer.active !== false
          && customer.branchIds?.includes(branchId)
        ))
        if (!customerStillEligible) {
          next.customerId = ''
          next.channelId = null
        }
      }
      return next
    })
    setFieldErrors((current) => ({
      ...current,
      [key]: '',
      ...(key === 'customerId' ? { channelId: '' } : {}),
    }))
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
      const saved = await dailyFetchJson<{ docNo: string }>('/api/sales/po-sell', {
        body: JSON.stringify(editingDocNo ? { ...parsed.data, action: 'update', docNo: editingDocNo } : parsed.data),
        method: editingDocNo ? 'PATCH' : 'POST',
      })
      setEditingDocNo(null)
      setShowForm(false)
      setForm(initialPoSellForm())
      if (!editingDocNo && parsed.data.salesPlanId && salesPlanIdFromQuery) {
        handledSalesPlanQueryRef.current = salesPlanIdFromQuery
        router.replace(pathname, { scroll: false })
      }
      setSearch(saved.docNo)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึก PO Sell ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function submitCancel() {
    if (!cancelingRow) return
    const note = cancelNote.trim()
    if (!note) {
      setCancelNoteError('กรอกหมายเหตุการยกเลิก')
      return
    }

    setIsSaving(true)
    setError(null)
    setCancelNoteError('')
    try {
      await dailyFetchJson<{ docNo: string }>('/api/sales/po-sell', {
        body: JSON.stringify({ action: 'cancel', docNo: cancelingRow.docNo, note }),
        method: 'PATCH',
      })
      setSearch(cancelingRow.docNo)
      setCancelingRow(null)
      setCancelNote('')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิก PO Sell ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function submitShortClose() {
    if (!shortClosingRow) return
    const note = shortCloseNote.trim()
    if (!note) {
      setShortCloseNoteError('กรอกเหตุผลการปิดส่งไม่ครบ')
      return
    }

    setIsSaving(true)
    setError(null)
    setShortCloseNoteError('')
    try {
      await dailyFetchJson<{ docNo: string }>('/api/sales/po-sell', {
        body: JSON.stringify({ action: 'shortClose', docNo: shortClosingRow.docNo, note }),
        method: 'PATCH',
      })
      setSearch(shortClosingRow.docNo)
      setShortClosingRow(null)
      setShortCloseNote('')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ปิดส่งไม่ครบไม่สำเร็จ')
    } finally {
      setIsSaving(false)
    }
  }

  const listControls = (
    <>
      <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
      <div className="flex items-center gap-2">
        {columnResize.hasCustomWidths ? (
          <UiButton
            size="xs"
            variant="outline"
            type="button"
            onClick={columnResize.resetColumnWidths}
          >
            คืนค่าเดิมตาราง
          </UiButton>
        ) : null}
        <PageSizeDropdown value={pageSize} onChange={setPageSize} />
        <UiButton disabled={currentPage <= 1} size="xs" variant="outline" type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</UiButton>
        <span className="px-1">หน้า {currentPage} / {totalPages}</span>
        <UiButton disabled={currentPage >= totalPages} size="xs" variant="outline" type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</UiButton>
      </div>
    </>
  )

  return (
    <section>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="mb-4 grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2 sm:gap-4">
        <Metric
          emoji="⏳"
          iconBg="bg-amber-100 text-amber-700"
          label="ยอดรอส่ง"
          subLabel={`มูลค่ารอส่ง ${formatMoney(data?.summary.remainingAmount ?? 0)} บาท`}
          value={`${formatMoney(data?.summary.remainingQty ?? 0)} กก.`}
        />
        <Metric
          emoji="⚙️"
          iconBg="bg-emerald-100 text-emerald-700"
          label="สถานะจับคู่ต้นทุน"
          subLabel="ยังไม่จับคู่ / บางส่วน / ครบ"
          value={`${data?.summary.unmatched ?? 0} / ${data?.summary.partiallyMatched ?? 0} / ${data?.summary.fullyMatched ?? 0}`}
        />
      </div>

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="mb-4 hidden space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap items-center gap-2">
          <input autoComplete="off" className="min-w-[260px] flex-1 rounded-md border px-3 py-2 text-sm" placeholder="ค้นหาเลข PO / ชื่อ Customer / ชื่อสินค้า / หมายเหตุ..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="text-sm text-slate-500">วันที่สร้างรายการ:</label>
          <DatePickerInput ariaLabel="จากวันที่" className="w-[130px]" title="จากวันที่" value={fromDate} onChange={setFromDate} />
          <span className="text-slate-400">→</span>
          <DatePickerInput ariaLabel="ถึงวันที่" className="w-[130px]" title="ถึงวันที่" value={toDate} onChange={setToDate} />
          {hasFilters ? <button className="rounded-md bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={resetFilters}>✕ ล้าง</button> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-500">สถานะเอกสาร:</span>
          <MatchButton active={documentStatus === 'all'} label="ทั้งหมด" onClick={() => setDocumentStatus('all')} />
          {(data?.filters.statuses ?? []).map((item) => (
            <MatchButton key={item.value} active={documentStatus === item.value} label={item.label} tone={documentStatusTone(item.value)} onClick={() => setDocumentStatus(item.value)} />
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <a className="inline-flex h-9 items-center rounded-md bg-emerald-600 px-4 text-sm text-white hover:bg-emerald-700" href={exportHref}>ส่งออก Excel</a>
            <button className="inline-flex h-9 items-center rounded-md bg-blue-600 px-4 text-sm text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={openCreateForm}>+ PO Sell ใหม่</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-500">สถานะ Match:</span>
          <MatchButton active={matchStatus === 'all'} label="ทั้งหมด" onClick={() => setMatchStatus('all')} />
          {(data?.filters.matchStatuses ?? []).map((item) => (
            <MatchButton key={item.value} active={matchStatus === item.value} label={item.label} onClick={() => setMatchStatus(item.value)} />
          ))}
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex gap-2 items-center">
          <input autoComplete="off" className="min-w-[200px] flex-1 rounded-md border px-3 py-2 text-sm h-9" placeholder="ค้นหาเลข PO / Customer / สินค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {hasFilters ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรองรายการจองขาย"
          onClose={() => setShowMobileFilters(false)}
          footer={(
            <>
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
            </>
          )}
        >
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
                <div className="flex items-center gap-2">
                  <DatePickerInput className="flex-1" value={fromDate} onChange={setFromDate} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput className="flex-1" value={toDate} onChange={setToDate} />
                </div>
              </div>

              <div>
                <span className="mb-1 block text-sm font-semibold text-slate-600">สถานะเอกสาร</span>
                <div className="flex flex-wrap gap-3">
                  <MatchButton active={documentStatus === 'all'} label="ทั้งหมด" onClick={() => setDocumentStatus('all')} />
                  {(data?.filters.statuses ?? []).map((item) => (
                    <MatchButton key={item.value} active={documentStatus === item.value} label={item.label} tone={documentStatusTone(item.value)} onClick={() => setDocumentStatus(item.value)} />
                  ))}
                </div>
              </div>

              <div>
                <span className="mb-1 block text-sm font-semibold text-slate-600">สถานะ Match Cost</span>
                <div className="flex flex-wrap gap-3">
                  <MatchButton active={matchStatus === 'all'} label="ทั้งหมด" onClick={() => setMatchStatus('all')} />
                  {(data?.filters.matchStatuses ?? []).map((item) => (
                    <MatchButton key={item.value} active={matchStatus === item.value} label={item.label} onClick={() => setMatchStatus(item.value)} />
                  ))}
                </div>
              </div>
        </MobileFilterSheet>
      ) : null}

      <div className="flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between lg:hidden">
        {listControls}
      </div>

      {/* Mobile Card List (Hidden on Desktop) */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}

        {!isLoading && pageRows.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
            onClick={() => setSelectedRow(row)}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
              <span className="text-xs text-slate-500">{formatDateDisplay(row.createdAt)}</span>
            </div>

            <div className="text-xs text-slate-600 mb-3 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">ลูกค้า: </span>
                <span className="text-slate-800">{row.customerName}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">สินค้า: </span>
                <span className="text-slate-800">{row.productName || '-'}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">วันที่ส่งมอบ: </span>
                <span className="text-slate-800">{formatDateDisplay(row.expectedDelivery)}</span>
              </div>
            </div>

            <div className="flex justify-between items-end pt-2 border-t border-slate-100">
              <div className="flex flex-wrap gap-1">
                <StatusPill label={row.documentStatusLabel} tone={documentStatusPillTone(row.documentStatus)} />
                <StatusPill label={row.matchStatusLabel} tone="match" />
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">จำนวนรวม / รายได้รวม</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums">
                  {formatMoney(row.qty)} กก. / <span className="text-emerald-700">{formatMoney(row.totalAmount)}</span>
                </span>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && totalRows === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
            ยังไม่มี PO Sell
          </div>
        ) : null}
      </div>

      {/* Desktop Table (Hidden on Mobile) */}
      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          {listControls}
        </div>
        <Table className="min-w-full divide-y divide-slate-200" style={{ tableLayout: 'fixed', minWidth: columnResize.tableMinWidth }}>
        <colgroup>
          {poSellColumns.map((column) => (
            <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
          ))}
        </colgroup>
        <TableHeader>
          <tr>
            <ResizableTableHead label="เลขที่จองขาย" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่จองขาย')} />
            <ResizableTableHead label="วันที่สร้าง" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="createdAt" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('createdAt', 'วันที่สร้าง')} />
            <ResizableTableHead label="วันที่ส่งมอบ" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="expectedDelivery" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('expectedDelivery', 'วันที่ส่งมอบ')} />
            <ResizableTableHead label="ลูกค้า" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="customerName" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('customerName', 'ลูกค้า')} />
            <ResizableTableHead label="สินค้า" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="productName" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('productName', 'สินค้า')} />
            <ResizableTableHead align="right" label="จำนวนรวม" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="qty" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('qty', 'จำนวนรวม')} />
            <ResizableTableHead align="right" label="รายได้รวม" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="totalAmount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('totalAmount', 'รายได้รวม')} />
            <ResizableTableHead align="right" label="จับคู่แล้ว" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="matchedQty" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('matchedQty', 'จับคู่แล้ว')} />
            <ResizableTableHead align="right" label="เหลือ" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="remainingQty" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('remainingQty', 'เหลือ')} />
            <ResizableTableHead align="right" label="กำไรดีล" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="margin" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('margin', 'กำไรดีล')} />
            <ResizableTableHead align="right" label="% Margin" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="marginPct" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('marginPct', '% Margin')} />
            <ResizableTableHead align="center" label="สถานะเอกสาร" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="documentStatus" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('documentStatus', 'สถานะเอกสาร')} />
            <ResizableTableHead align="center" label="สถานะจับคู่ต้นทุน" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="matchStatus" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('matchStatus', 'สถานะจับคู่ต้นทุน')} />
            <ResizableTableHead label="อัปเดตล่าสุด" activeSortKey={sortKey || undefined} direction={sortDirection} sortKey="updatedAt" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('updatedAt', 'อัปเดตล่าสุด')} />
            <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={poSellColumns.length}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
          {!isLoading && !error && rows.length === 0 ? <TableRow><TableCell className="py-10 text-center text-slate-400" colSpan={poSellColumns.length}>ยังไม่มี PO Sell</TableCell></TableRow> : null}
          {!isLoading && pageRows.map((row) => (
            <TableRow key={row.id} className="border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedRow(row)}>
              <TableCell className="whitespace-nowrap font-mono">{row.docNo}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateDisplay(row.createdAt)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateDisplay(row.expectedDelivery)}</TableCell>
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
              <TableCell className="text-center"><StatusPill label={row.matchStatusLabel} tone="match" /></TableCell>
              <TableCell className="w-32 whitespace-nowrap text-xs text-slate-600">
                <div className="truncate font-semibold text-slate-700">{row.updatedBy || '-'}</div>
                <div className="font-mono text-xs text-slate-400">{formatTimestampDisplay(row.updatedAt)}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right">
                <div className="flex justify-end gap-1">
                  {row.canEdit ? (
                    <button
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
                      disabled={isSaving}
                      title={`แก้ไข ${row.docNo}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        openEditForm(row)
                      }}
                    >
                      แก้ไข
                    </button>
                  ) : null}
                  <button
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-1"
                    disabled={printingPoDocNo === row.docNo}
                    title={`พิมพ์ ${row.docNo}`}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      void printPoSell(row)
                    }}
                  >
                    <Printer className="size-3" />
                    {printingPoDocNo === row.docNo ? 'เตรียม...' : 'พิมพ์'}
                  </button>
                  {canShortClosePoSell(row) ? (
                    <button
                      className="rounded-md border border-amber-200 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:cursor-wait disabled:opacity-50"
                      disabled={isSaving}
                      title={`ปิดส่งไม่ครบ ${row.docNo}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        openShortCloseDialog(row)
                      }}
                    >
                      ปิดส่งไม่ครบ
                    </button>
                  ) : null}
                  {row.canCancel ? (
                    <button
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"
                      disabled={isSaving}
                      title={`ยกเลิก ${row.docNo}`}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        openCancelDialog(row)
                      }}
                    >
                      ยกเลิก
                    </button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden">
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
        <PoSellDetailModal
          isPrinting={printingPoDocNo === selectedRow.docNo}
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onShortClose={(rowToShortClose) => {
            setSelectedRow(null)
            openShortCloseDialog(rowToShortClose)
          }}
          onPrint={(rowToPrint) => void printPoSell(rowToPrint)}
        />
      ) : null}

      {showForm ? (
        <PoSellFormModal
          branches={activeBranches}
          customers={activeCustomers}
          errors={fieldErrors}
          form={form}
          isSaving={isSaving}
          products={activeProducts}
          selectedChannelLabel={selectedChannelLabel}
          subtotal={formSubtotal}
          title={editingDocNo ? `แก้ไข PO Sell ${editingDocNo}` : 'สร้าง PO Sell (จองขาย)'}
          totalQty={formQty}
          vatAmount={vatAmount}
          vatRatePercent={vatRatePercent}
          totalCost={formTotalCost}
          onAddItem={() => setForm((current) => ({ ...current, items: [...current.items, blankPoSellItem()] }))}
          onClose={() => {
            if (!editingDocNo && salesPlanIdFromQuery) {
              handledSalesPlanQueryRef.current = salesPlanIdFromQuery
              router.replace(pathname, { scroll: false })
            }
            setEditingDocNo(null)
            setShowForm(false)
          }}
          onRemoveItem={removeItem}
          onSubmit={savePoSell}
          onUpdate={updateForm}
          onUpdateItem={updateItem}
        />
      ) : null}
      {cancelingRow ? (
        <PoSellCancelModal
          error={cancelNoteError}
          isSaving={isSaving}
          note={cancelNote}
          row={cancelingRow}
          onChangeNote={(value) => {
            setCancelNote(value)
            setCancelNoteError('')
          }}
          onClose={() => {
            if (isSaving) return
            setCancelingRow(null)
            setCancelNote('')
            setCancelNoteError('')
          }}
          onSubmit={submitCancel}
        />
      ) : null}
      {shortClosingRow ? (
        <PoSellShortCloseModal
          error={shortCloseNoteError}
          isSaving={isSaving}
          note={shortCloseNote}
          row={shortClosingRow}
          onChangeNote={(value) => {
            setShortCloseNote(value)
            setShortCloseNoteError('')
          }}
          onClose={() => {
            if (isSaving) return
            setShortClosingRow(null)
            setShortCloseNote('')
            setShortCloseNoteError('')
          }}
          onSubmit={submitShortClose}
        />
      ) : null}
    </section>
  )
}

function formatPercent(value: number | null | undefined) {
  return `${formatMoney(value ?? 0)}%`
}

function formatTimestampDisplay(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

function documentStatusTone(value: string): 'amber' | 'dark' | 'emerald' | 'red' | 'rose' | 'slate' {
  if (value === 'cancelled') return 'slate'
  if (value === 'closed') return 'emerald'
  if (value === 'short_closed') return 'rose'
  if (value === 'partial') return 'amber'
  return 'dark'
}

function documentStatusPillTone(value: string): 'cancelled' | 'closed' | 'match' | 'open' | 'partial' | 'shortClosed' | 'status' {
  if (value === 'cancelled') return 'cancelled'
  if (value === 'closed') return 'closed'
  if (value === 'short_closed') return 'shortClosed'
  if (value === 'partial') return 'partial'
  return 'open'
}

function Metric({
  emoji,
  label,
  subLabel,
  value,
  className = '',
}: {
  emoji: string
  iconBg?: string
  label: string
  subLabel?: string
  value: string
  className?: string
}) {
  return <SharedKpiCard className={className} icon={emoji} label={label} note={subLabel} tone="slate" value={value} />
}

function MatchButton({ active, label, onClick, tone = 'dark' }: { active: boolean; label: string; onClick: () => void; tone?: 'amber' | 'dark' | 'emerald' | 'red' | 'rose' | 'slate' }) {
  void tone
  const activeClass = 'border-slate-700 bg-slate-700 text-white'
  const idleClass = 'border-slate-300 bg-white hover:bg-slate-50'
  return <button className={`rounded-md border px-3.5 py-1.5 text-sm font-medium ${active ? activeClass : idleClass}`} type="button" onClick={onClick}>{label}</button>
}

function StatusPill({ label, tone = 'status' }: { label: string; tone?: 'cancelled' | 'closed' | 'match' | 'open' | 'partial' | 'shortClosed' | 'status' }) {
  const color = {
    cancelled: 'text-slate-500',
    closed: 'text-emerald-700',
    match: 'text-cyan-700',
    open: 'text-amber-700',
    partial: 'text-cyan-700',
    shortClosed: 'text-rose-700',
    status: 'text-slate-700',
  }[tone]
  if (tone === 'match') return <span className={`text-xs font-semibold ${color}`}>{label || '-'}</span>
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${color}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {label || '-'}
    </span>
  )
}

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}

function searchableText(option: Option) {
  return `${option.code ?? ''} ${option.name} ${option.id}`.toLowerCase()
}

function sanitizeDecimalInput(value: string) {
  return value
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1')
}

function formatDecimalInput(value: number) {
  if (!Number.isFinite(value) || value <= 0) return ''
  return value.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function CustomerSearchCombobox({
  disabled = false,
  error,
  options,
  placeholder = 'พิมพ์ชื่อ Customer...',
  value,
  onChange,
}: {
  disabled?: boolean
  error?: string
  options: Option[]
  placeholder?: string
  value: string
  onChange: (customerId: string) => void
}) {
  return (
    <SearchCombobox
      disabled={disabled}
      error={error}
      inputId="po-sell-customer-search"
      inputClassName="!h-9 px-2 py-1.5"
      label="Customer *"
      options={options.map((customer) => ({
        id: customer.id,
        label: optionLabel(customer),
        searchText: searchableText(customer),
      }))}
      optionsPanelClassName="max-h-[280px]"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  )
}

function ProductSearchCombobox({
  error,
  inputId,
  options,
  value,
  onChange,
}: {
  error?: string
  inputId: string
  options: SearchComboboxOption[]
  value: string
  onChange: (productId: string) => void
}) {
  return (
    <SearchCombobox
      error={error}
      hideLabel
      inputId={inputId}
      inputClassName="!h-9 px-2 py-1.5"
      label="สินค้า *"
      options={options}
      optionsPanelClassName="max-h-[280px]"
      placeholder="พิมพ์รหัส/ชื่อสินค้า..."
      value={value}
      onChange={onChange}
    />
  )
}

function DecimalPatternInput({
  formatOnBlur = false,
  value,
  onChange,
}: {
  formatOnBlur?: boolean
  value: number
  onChange: (value: number) => void
}) {
  const [isFocused, setIsFocused] = useState(false)
  const [rawValue, setRawValue] = useState('')

  useEffect(() => {
    if (!isFocused) setRawValue(formatOnBlur ? formatDecimalInput(value) : value > 0 ? sanitizeDecimalInput(String(value)) : '')
  }, [formatOnBlur, isFocused, value])

  return (
    <UiInput
      className="!h-9 w-full px-2 py-1.5 text-right"
      inputMode="decimal"
      type="text"
      value={isFocused ? rawValue : formatOnBlur ? formatDecimalInput(value) : rawValue}
      onBlur={() => {
        setIsFocused(false)
        setRawValue(formatOnBlur ? formatDecimalInput(value) : value > 0 ? sanitizeDecimalInput(String(value)) : '')
      }}
      onChange={(event) => {
        const nextRawValue = sanitizeDecimalInput(event.target.value)
        setRawValue(nextRawValue)
        onChange(nextRawValue ? Number(nextRawValue) : 0)
      }}
      onFocus={() => {
        setIsFocused(true)
        setRawValue(value > 0 ? sanitizeDecimalInput(String(value)) : '')
      }}
    />
  )
}

function PoSellFormModal({
  branches,
  customers,
  errors,
  form,
  isSaving,
  products,
  selectedChannelLabel,
  subtotal,
  title,
  totalQty,
  vatAmount,
  vatRatePercent,
  totalCost,
  onAddItem,
  onClose,
  onRemoveItem,
  onSubmit,
  onUpdate,
  onUpdateItem,
}: {
  branches: Option[]
  customers: Option[]
  errors: Record<string, string>
  form: PoSellFormValues
  isSaving: boolean
  products: Option[]
  selectedChannelLabel: string
  subtotal: number
  title: string
  totalQty: number
  vatAmount: number
  vatRatePercent: number
  totalCost: number
  onAddItem: () => void
  onClose: () => void
  onRemoveItem: (index: number) => void
  onSubmit: () => void
  onUpdate: <Key extends keyof PoSellFormValues>(key: Key, value: PoSellFormValues[Key]) => void
  onUpdateItem: (index: number, key: keyof PoSellFormValues['items'][number], value: string | number | null) => void
}) {
  const productOptions = useMemo<SearchComboboxOption[]>(() => products.map((product) => ({
    description: undefined,
    id: product.id,
    label: optionLabel(product),
    searchText: searchableText(product),
  })), [products])
  const fieldError = (name: string) => errors[name] ? <div className="mt-1 text-xs text-red-600">{errors[name]}</div> : null

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !isSaving) onClose()
    }}>
      <DialogContent aria-labelledby="po-sell-form-title" className="max-h-[90vh] max-w-5xl overflow-hidden rounded-md border-0 bg-slate-900 shadow-2xl !p-0 flex flex-col outline-none focus:outline-none" data-combobox-portal-root="true" hideClose>
        <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md shrink-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <DialogTitle id="po-sell-form-title" className="truncate text-white">{title}</DialogTitle>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <UiButton className="h-9 border-emerald-600 bg-emerald-600 px-4 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white disabled:opacity-60" disabled={isSaving} type="button" variant="outline" onClick={() => void onSubmit()}>{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</UiButton>
              <UiButton className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" disabled={isSaving} type="button" variant="outline" onClick={onClose}>ยกเลิก</UiButton>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-5 text-sm space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow">
            <div className="mb-3 text-sm font-bold text-slate-800">ข้อมูลเอกสาร</div>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <div className="col-span-1">
                <label className="mb-1 block text-xs font-medium text-slate-600">สาขา/คลัง <span className="text-red-600">*</span></label>
                <UiSelect className={`!h-9 w-full px-2 py-1.5 text-sm ${form.branchId ? '' : 'text-slate-400'} rounded-md border-slate-300 focus:border-slate-400 focus:ring-0 outline-none`} value={form.branchId ?? ''} onChange={(event) => onUpdate('branchId', event.target.value || null)}>
                  <option value="">เลือกสาขา/คลัง</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </UiSelect>
                {fieldError('branchId')}
              </div>
              <div className="col-span-2">
                <CustomerSearchCombobox
                  disabled={!form.branchId}
                  error={errors.customerId}
                  options={customers}
                  placeholder={form.branchId ? 'พิมพ์ชื่อ Customer...' : 'เลือกสาขา/คลังก่อน'}
                  value={form.customerId}
                  onChange={(customerId) => onUpdate('customerId', customerId)}
                />
                {fieldError('customerId')}
              </div>
              <div className="col-span-1">
                <label className="mb-1 block text-xs font-medium text-slate-600">วันส่งมอบ <span className="text-red-600">*</span></label>
                <DatePickerInput className="!h-9 w-full rounded-md border-slate-300 focus:border-slate-400 focus:ring-0 outline-none" required value={form.expectedDelivery} onChange={(value) => onUpdate('expectedDelivery', value)} />
                {fieldError('expectedDelivery')}
              </div>
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">ช่องทางขาย</label>
                <UiInput
                  readOnly
                  className={`!h-9 w-full rounded-md px-2 py-1.5 text-sm outline-none focus:ring-0 ${errors.channelId ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-slate-100 text-slate-700'}`}
                  value={selectedChannelLabel}
                />
                {fieldError('channelId')}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow">
            <div className="mb-2 flex items-center justify-between gap-3">
              <label className="font-medium text-slate-800">📋 รายการสินค้า ({form.items.length})</label>
              <UiButton className="h-9 rounded-md bg-emerald-600 font-normal hover:bg-emerald-700 text-white transition-colors outline-none focus:ring-0" size="xs" type="button" variant="default" onClick={onAddItem}>+ เพิ่มรายการ</UiButton>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-100">
              <Table className="min-w-[820px] border-0">
                <TableHeader>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <TableHead className="text-slate-700">สินค้า / Grade *</TableHead>
                    <TableHead className="w-36 text-right text-slate-700">จำนวน (กก.) *</TableHead>
                    <TableHead className="w-36 text-right text-slate-700">ราคา/หน่วย *</TableHead>
                    <TableHead className="w-36 text-right text-slate-700">มูลค่ารวม</TableHead>
                    <TableHead className="w-10" />
                  </tr>
                </TableHeader>
                <TableBody>
                  {form.items.map((item, index) => (
                    <TableRow key={index} className="border-b border-slate-100/60">
                      <TableCell className="p-1.5 align-top">
                         <ProductSearchCombobox
                           error={errors[`items.${index}.productId`]}
                           inputId={`po-sell-product-${index}`}
                           options={productOptions}
                           value={item.productId}
                           onChange={(productId) => onUpdateItem(index, 'productId', productId)}
                         />
                         {fieldError(`items.${index}.productId`)}
                       </TableCell>
                       <TableCell className="p-1.5 align-top">
                         <DecimalPatternInput value={item.qty} onChange={(value) => onUpdateItem(index, 'qty', value)} />
                         {fieldError(`items.${index}.qty`)}
                       </TableCell>
                       <TableCell className="p-1.5 align-top">
                         <DecimalPatternInput formatOnBlur value={item.price} onChange={(value) => onUpdateItem(index, 'price', value)} />
                         {fieldError(`items.${index}.price`)}
                       </TableCell>
                       <TableCell className="bg-blue-50/50 p-1.5 px-2 text-right font-bold text-blue-700">{formatMoney(Math.max(0, item.qty * item.price - item.discount))}</TableCell>
                       <TableCell className="p-1.5 text-center">{form.items.length > 1 ? <UiButton className="h-8 w-8 px-0 text-red-500 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors outline-none focus:ring-0" size="icon" type="button" variant="ghost" onClick={() => onRemoveItem(index)}>×</UiButton> : null}</TableCell>
                     </TableRow>
                   ))}
                 </TableBody>
                 <tfoot className="bg-slate-50 font-bold border-t border-slate-100 text-slate-800">
                   <tr><td className="p-3 text-right">รวม {form.items.length} รายการ</td><td className="p-3 text-right">{formatMoney(totalQty)}</td><td /><td className="p-3 text-right text-base text-blue-700">{formatMoney(subtotal)}</td><td /></tr>
                 </tfoot>
               </Table>
             </div>
             {fieldError('items')}
           </div>
 
           <div className="grid gap-3 grid-cols-1 md:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex flex-col gap-3">
                <label className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer select-none transition-colors ${form.hasVat ? 'border-amber-500 bg-amber-50/50' : 'border-slate-300 bg-white'}`}>
                  <input
                    checked={form.hasVat}
                    className="h-5 w-5 rounded border-slate-300 text-amber-600 focus:ring-0 outline-none"
                    type="checkbox"
                    onChange={(event) => onUpdate('hasVat', event.target.checked)}
                  />
                  <span className="font-bold text-slate-700">มี VAT</span>
                </label>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow flex-1 flex flex-col">
                  <label className="mb-1 block text-xs font-medium text-slate-600">หมายเหตุ</label>
                  <textarea className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline-none focus:border-slate-400 focus:ring-0 outline-none transition-colors flex-1" rows={2} value={form.note ?? ''} onChange={(event) => onUpdate('note', event.target.value || null)} />
                  {fieldError('note')}
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50/50 p-4 shadow flex flex-col justify-center">
                <SummaryLine label="จำนวนรวม" value={`${formatMoney(totalQty)} กก.`} />
                <SummaryLine label="ยอดก่อน VAT" value={formatMoney(subtotal)} />
                <SummaryLine label={`VAT ${formatMoney(vatRatePercent)}%`} value={formatMoney(vatAmount)} />
                <SummaryLine label="ยอดรวมสุทธิ" strong value={formatMoney(totalCost)} />
              </div>
            </div>
         </div>
 
       </DialogContent>
     </Dialog>
  )
}

function PoSellCancelModal({
  error,
  isSaving,
  note,
  onChangeNote,
  onClose,
  onSubmit,
  row,
}: {
  error: string
  isSaving: boolean
  note: string
  onChangeNote: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  row: PoSellRow
}) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !isSaving) onClose()
    }}>
      <DialogContent aria-labelledby="po-sell-cancel-title" className="top-auto bottom-0 w-full max-w-lg translate-x-[-50%] translate-y-0 rounded-t-md md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-md border-0 bg-slate-900 shadow-2xl !p-0 overflow-hidden outline-none focus:outline-none" hideClose>
        <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md flex flex-row items-center shrink-0">
          <div>
            <DialogTitle id="po-sell-cancel-title" className="text-white">ยกเลิก PO Sell {row.docNo}</DialogTitle>
            <DialogDescription className="text-slate-300">{row.customerName}</DialogDescription>
          </div>
        </DialogHeader>
        <div className="space-y-2 bg-slate-50 p-5 text-sm">
          <label className="block text-xs font-medium text-slate-600" htmlFor="po-sell-cancel-note">หมายเหตุการยกเลิก *</label>
          <textarea
            id="po-sell-cancel-note"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:ring-0 outline-none transition-colors"
            maxLength={500}
            rows={3}
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
          />
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
        </div>
        <DialogFooter className="px-5 py-4 border-t border-slate-100 bg-white flex justify-end gap-2 shrink-0 md:rounded-b-md">
          <UiButton className="font-normal transition-colors outline-none focus:ring-0" disabled={isSaving} type="button" variant="outline" onClick={onClose}>ปิด</UiButton>
          <UiButton className="rounded-md bg-red-600 hover:bg-red-700 text-white font-medium transition-colors outline-none focus:ring-0 px-5" disabled={isSaving} type="button" variant="default" onClick={onSubmit}>{isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PoSellShortCloseModal({
  error,
  isSaving,
  note,
  onChangeNote,
  onClose,
  onSubmit,
  row,
}: {
  error: string
  isSaving: boolean
  note: string
  onChangeNote: (value: string) => void
  onClose: () => void
  onSubmit: () => void
  row: PoSellRow
}) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !isSaving) onClose()
    }}>
      <DialogContent aria-labelledby="po-sell-short-close-title" className="top-auto bottom-0 w-full max-w-lg translate-x-[-50%] translate-y-0 rounded-t-md md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-md border-0 bg-slate-900 shadow-2xl !p-0 overflow-hidden outline-none focus:outline-none" hideClose>
        <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md flex flex-row items-center shrink-0">
          <div>
            <DialogTitle id="po-sell-short-close-title" className="text-white">ปิดส่งไม่ครบ {row.docNo}</DialogTitle>
            <DialogDescription className="text-slate-300">{row.customerName} · คงเหลือ {formatMoney(row.remainingQty)} กก.</DialogDescription>
          </div>
        </DialogHeader>
        <div className="space-y-2 bg-slate-50 p-5 text-sm">
          <label className="block text-xs font-medium text-slate-600" htmlFor="po-sell-short-close-note">เหตุผลการปิดส่งไม่ครบ *</label>
          <textarea
            id="po-sell-short-close-note"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:ring-0 outline-none transition-colors"
            maxLength={500}
            rows={3}
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
          />
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
        </div>
        <DialogFooter className="px-5 py-4 border-t border-slate-100 bg-white flex justify-end gap-2 shrink-0 md:rounded-b-md">
          <UiButton className="font-normal transition-colors outline-none focus:ring-0" disabled={isSaving} type="button" variant="outline" onClick={onClose}>ปิด</UiButton>
          <UiButton className="rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors outline-none focus:ring-0 px-5" disabled={isSaving} type="button" variant="default" onClick={onSubmit}>{isSaving ? 'กำลังบันทึก...' : 'ยืนยันปิดส่งไม่ครบ'}</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PoSellDetailModal({
  onClose,
  row,
  isPrinting,
  onShortClose,
  onPrint,
}: {
  onClose: () => void
  row: PoSellRow
  isPrinting: boolean
  onShortClose: (row: PoSellRow) => void
  onPrint: (row: PoSellRow) => void
}) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent aria-labelledby="po-sell-detail-title" className="max-h-[90vh] max-w-3xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 dark:bg-[#0f172a] border-0 shadow-2xl outline-none focus:outline-none" hideClose>
        <DialogHeader className="px-5 py-4 bg-slate-900 dark:bg-[#0f172a] text-white shrink-0 rounded-t-md">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <DialogTitle id="po-sell-detail-title" className="truncate text-white">รายละเอียด {row.docNo}</DialogTitle>
            <DialogDescription className="truncate text-slate-300">{row.customerName}</DialogDescription>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {canShortClosePoSell(row) ? (
              <UiButton
                className="h-9 border-slate-700 bg-slate-800 font-normal text-white hover:bg-slate-700 hover:text-white"
                type="button"
                variant="outline"
                onClick={() => onShortClose(row)}
              >
                ปิดส่งไม่ครบ
              </UiButton>
            ) : null}
            <UiButton
              className="h-9 gap-2 border-emerald-600 bg-emerald-600 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white"
              disabled={isPrinting}
              type="button"
              variant="outline"
              onClick={() => onPrint(row)}
            >
              <Printer className="size-4" />
              {isPrinting ? 'กำลังเตรียม...' : 'พิมพ์'}
            </UiButton>
            <UiButton className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onClose}>ปิด</UiButton>
          </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-4 text-sm">
          {/* ข้อมูลเอกสาร */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow">
            <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">ข้อมูลเอกสาร</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-5">
              <DetailItem label="วันที่สร้างรายการ" value={formatDateDisplay(row.createdAt)} />
              <DetailItem label="วันที่ส่งมอบ" value={formatDateDisplay(row.expectedDelivery)} />
              <DetailItem label="อัพเดตล่าสุด" value={`${row.updatedBy || '-'} · ${formatTimestampDisplay(row.updatedAt)}`} />
              <DetailItem label="สาขา/คลัง" value={row.branchName || '-'} />
              <DetailItem label="ช่องทางขาย" value={row.channelName || '-'} />
            </div>
          </div>

          {/* สถานะรายการ */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow">
            <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">สถานะรายการ</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-5">
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">เอกสาร</div>
                <div className="mt-1"><StatusPill label={row.documentStatusLabel} tone={documentStatusPillTone(row.documentStatus)} /></div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">Match Cost</div>
                <div className="mt-1"><StatusPill label={row.matchStatusLabel} tone="match" /></div>
              </div>
            </div>
          </div>

          {/* จำนวนและรายได้ */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow">
            <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">จำนวนและรายได้</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-5">
              <DetailItem label="จำนวนจองรวม" value={`${formatMoney(row.qty)} กก.`} />
              <DetailItem label="จำนวน Matched" value={`${formatMoney(row.matchedQty)} กก.`} />
              <DetailItem label="จำนวนรอส่ง" value={`${formatMoney(row.remainingQty)} กก.`} />
              <DetailItem label="ยอดก่อน VAT" value={`${formatMoney(row.subtotal)} บาท`} />
              <DetailItem label={`VAT ${formatMoney(row.vatRatePercent)}%`} value={`${formatMoney(row.vatAmount)} บาท`} />
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">ยอดรวมสุทธิ</div>
                <div className="text-sm font-bold text-blue-700">{formatMoney(row.totalAmount)} บาท</div>
              </div>
            </div>
          </div>

          {/* Deal Margin */}
          <div className="rounded-md border border-slate-200 bg-emerald-50/10 p-5 shadow">
            <h4 className="text-sm font-bold text-emerald-800 border-b border-emerald-100 pb-2 mb-4">Deal Margin</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-5">
              <DetailItem label="Deal Margin" value={`${formatMoney(row.margin)} บาท`} />
              <DetailItem label="Margin %" value={formatPercent(row.marginPct)} />
            </div>
          </div>

          {/* รายการสินค้า */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow">
            <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">รายการสินค้า</h4>
            <div className="text-sm font-semibold text-slate-900 mt-1">{row.productName || '-'}</div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailItem({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={className}>
      <div className="text-xs font-medium text-slate-500 mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function SummaryLine({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1 text-sm ${strong ? 'border-t border-slate-200 pt-2 font-bold text-blue-700' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
