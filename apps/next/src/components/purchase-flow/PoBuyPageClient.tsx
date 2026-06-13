'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ButtonHTMLAttributes, Dispatch, SetStateAction } from 'react'
import { Download, Plus, Printer } from 'lucide-react'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { Button as UiButton } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input as UiInput } from '@/components/ui/Input'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select as UiSelect } from '@/components/ui/Select'
import { TableNumberCell } from '@/components/ui/TableNumberCell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import { ApiError } from '@/lib/api-client'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { poBuyFormSchema, type PoBuyFormValues } from '@/lib/po-buy'
import { openPoBuyPrint, openPoBuyPrintWindow, type PoBuyPrintDocument } from '@/lib/po-buy-print'

type Option = {
  active?: boolean | null
  branchId?: string | null
  branchName?: string | null
  code?: string | null
  id: string
  name: string
  unit?: string | null
}

type PoBuyFormItem = {
  productId: string
  qty: number
  unitPrice: number
}

type PoBuyFormState = {
  branchId: string
  expectedDelivery: string
  hasVat: boolean
  items: PoBuyFormItem[]
  notes: string
  supplierId: string
}

type PoBuyPayload = {
  filters: { statuses: string[] }
  options: {
    branches: Option[]
    products: Option[]
    suppliers: Option[]
  }
  rows: PoBuyRow[]
  summary: {
    open: number
    partial: number
    received: number
    remainingAmount: number
    remainingQty: number
    shortClosed: number
    totalAmount: number
    totalRows: number
  }
  vatRatePercent: number
}

type PoBuyItem = {
  productId: string
  productName: string
  qty: number
  remainingQty: number
  unit?: string | null
  unitPrice: number
}

type PoBuyRow = {
  branchId: string
  branchName?: string | null
  createdAt: string
  createdBy: string
  date: string
  docNo: string
  expectedDelivery: string
  id: string
  itemCount: number
  items: PoBuyItem[]
  notes: string
  productName: string
  qty: number
  remainingAmount: number
  remainingQty: number
  shortClosedAt: string
  shortClosedBy: string
  shortClosedNote: string
  shortClosedQty: number
  status: string
  allocationLogs: Array<{
    action: string
    allocatedAmount: number
    allocatedQty: number
    createdAt: string
    createdBy: string
    eventKey: string
    fromRemainingQty: number
    id: string
    meta: unknown
    note: string
    poBuyDocNo: string
    productCode: string
    productName: string
    purchaseBillDocNo: string
    purchaseBillLineNo: number | null
    toRemainingQty: number
    unitPrice: number
  }>
  statusLogs: Array<{
    action: string
    createdAt: string
    createdBy: string
    eventKey: string
    fromStatus: string
    id: string
    meta: unknown
    note: string
    poBuyDocNo: string
    toStatus: string
  }>
  supplierId: string
  supplierAddress: string
  supplierName: string
  hasVat: boolean
  subtotal: number
  totalAmount: number
  updatedAt: string
  updatedBy: string
  vatAmount: number
  vatRatePercent: number
  vatType: string
}

type FieldErrors = Record<string, string>
type PoBuySortDirection = 'asc' | 'desc'
type PoBuySortKey = 'date' | 'docNo' | 'expectedDelivery' | 'itemCount' | 'productName' | 'qty' | 'remainingQty' | 'status' | 'supplierName' | 'totalAmount' | 'updatedAt'
type PoBuyStatusKey = 'cancelled' | 'open' | 'partial' | 'received' | 'shortClosed'

function blankItem(): PoBuyFormItem {
  return { productId: '', qty: 0, unitPrice: 0 }
}

function todayIsoDate() {
  const now = new Date()
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60_000))
  return localDate.toISOString().slice(0, 10)
}

function blankForm(): PoBuyFormState {
  return {
    branchId: '',
    expectedDelivery: todayIsoDate(),
    hasVat: false,
    items: [blankItem()],
    notes: '',
    supplierId: '',
  }
}

function flattenClientErrors(values: PoBuyFormState) {
  const parsed = poBuyFormSchema.safeParse({
    ...values,
    expectedDelivery: values.expectedDelivery || null,
    notes: values.notes || null,
  })
  if (parsed.success) return { data: parsed.data, errors: {} }

  const errors: FieldErrors = {}
  parsed.error.issues.forEach((issue) => {
    const path = issue.path.join('.')
    if (!errors[path]) errors[path] = issue.message
  })
  return { data: null, errors }
}

function flattenApiFieldErrors(fieldErrors: Record<string, string[] | undefined>): FieldErrors {
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .map(([key, value]) => [key, value?.[0] ?? 'ข้อมูลไม่ถูกต้อง'])
      .filter(([, value]) => Boolean(value)),
  )
}

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}

function searchableText(option: Option) {
  return `${option.code ?? ''} ${option.name} ${option.id}`.toLowerCase()
}

function sanitizeMoneyInput(value: string) {
  return value
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1')
}

function formatMoneyInput(value: number) {
  if (!Number.isFinite(value)) return ''
  return value.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: '2-digit',
  })
}

function poBuyStatusKey(status: string): PoBuyStatusKey {
  const normalized = status.trim().toLowerCase()
  if (normalized.includes('cancel')) return 'cancelled'
  if (normalized.includes('short')) return 'shortClosed'
  if (normalized.includes('partial')) return 'partial'
  if (normalized.includes('received')) return 'received'
  return 'open'
}

function poBuyStatusLabel(status: string) {
  const key = poBuyStatusKey(status)
  if (key === 'cancelled') return 'ยกเลิก'
  if (key === 'shortClosed') return 'ปิดรับไม่ครบ'
  if (key === 'partial') return 'รับบางส่วน'
  if (key === 'received') return 'รับครบ'
  return 'ยังไม่รับ'
}

function canShortClosePoBuy(row: PoBuyRow) {
  return poBuyStatusKey(row.status) === 'partial' && row.remainingQty > 0
}

function shouldShowShortCloseButton(row: PoBuyRow) {
  const statusKey = poBuyStatusKey(row.status)
  return (statusKey === 'open' || statusKey === 'partial') && row.remainingQty > 0
}

function poBuyStatusActionLabel(action: string) {
  switch (action) {
    case 'created':
      return 'สร้างเอกสาร'
    case 'edited':
      return 'แก้ไขเอกสาร'
    case 'received_partial':
      return 'ตัดรับบางส่วน'
    case 'received_full':
      return 'ตัดรับครบ'
    case 'short_closed':
      return 'ปิดรับไม่ครบ'
    case 'cancelled':
      return 'ยกเลิกเอกสาร'
    default:
      return 'อัปเดตสถานะ'
  }
}

const rowActionButtonClass = 'rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const rowDangerActionButtonClass = 'rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50'
const rowWarningActionButtonClass = 'rounded-md border border-amber-200 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50'

type PoBuyColumnKey = 'action' | 'checkbox' | 'date' | 'docNo' | 'expectedDelivery' | 'note' | 'productName' | 'qty' | 'remainingQty' | 'status' | 'supplierName' | 'totalAmount' | 'updatedAt'

const poBuyColumns: Array<ResizableColumnDefinition<PoBuyColumnKey>> = [
  { key: 'checkbox', defaultWidth: 40, minWidth: 40 },
  { key: 'docNo', defaultWidth: 120, minWidth: 90 },
  { key: 'date', defaultWidth: 90, minWidth: 80 },
  { key: 'supplierName', defaultWidth: 420, minWidth: 120 },
  { key: 'productName', defaultWidth: 280, minWidth: 100 },
  { key: 'qty', defaultWidth: 75, minWidth: 70 },
  { key: 'totalAmount', defaultWidth: 80, minWidth: 80 },
  { key: 'remainingQty', defaultWidth: 75, minWidth: 70 },
  { key: 'expectedDelivery', defaultWidth: 95, minWidth: 80 },
  { key: 'note', defaultWidth: 70, minWidth: 60 },
  { key: 'status', defaultWidth: 90, minWidth: 90 },
  { key: 'updatedAt', defaultWidth: 90, minWidth: 90 },
  { key: 'action', defaultWidth: 110, minWidth: 100 },
]

function poBuyAllocationActionLabel(action: string) {
  switch (action) {
    case 'allocated_to_purchase_bill':
      return 'ตัดยอดเข้า PB'
    case 'released_from_purchase_bill':
      return 'คืนยอดจาก PB'
    default:
      return action || 'ประวัติการจัดสรร'
  }
}

function poBuyAllocationDescription(log: PoBuyRow['allocationLogs'][number]) {
  const billText = log.purchaseBillDocNo ? `บิล ${log.purchaseBillDocNo}` : 'ไม่พบเลขบิล'
  const lineText = log.purchaseBillLineNo ? `บรรทัด ${log.purchaseBillLineNo}` : ''
  const productText = log.productName || log.productCode || '-'
  return [billText, lineText, productText].filter(Boolean).join(' · ')
}

function poBuyStatusTransitionLabel(log: PoBuyRow['statusLogs'][number]) {
  if (!log.fromStatus) return poBuyStatusLabel(log.toStatus)
  if (log.fromStatus === log.toStatus) return poBuyStatusLabel(log.toStatus)
  return `${poBuyStatusLabel(log.fromStatus)} -> ${poBuyStatusLabel(log.toStatus)}`
}

function poBuyStatusMetaText(meta: unknown) {
  if (!meta || typeof meta !== 'object') return ''
  const record = meta as Record<string, unknown>
  if (Array.isArray(record.changedFields) && record.changedFields.length > 0) {
    const changedFields = record.changedFields
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(', ')
    return changedFields ? `แก้ไขฟิลด์: ${changedFields}` : ''
  }
  if (typeof record.reason === 'string' && record.reason.length > 0) {
    if (record.reason === 'short_close_action') return 'เหตุการณ์: ปิดรับไม่ครบ'
    if (record.reason === 'cancel_action') return 'เหตุการณ์: ยกเลิกเอกสาร'
    if (record.reason === 'create') return 'เหตุการณ์: สร้างเอกสาร'
    if (record.reason === 'edit') return 'เหตุการณ์: แก้ไขเอกสาร'
    return `เหตุการณ์: ${record.reason}`
  }
  return ''
}

function PoBuyStatusTimeline({ row }: { row: PoBuyRow }) {
  const events = [
    ...row.statusLogs.map((log) => ({
      createdAt: log.createdAt,
      createdBy: log.createdBy,
      id: `status:${log.id}`,
      log,
      type: 'status' as const,
    })),
    ...row.allocationLogs.map((log) => ({
      createdAt: log.createdAt,
      createdBy: log.createdBy,
      id: `allocation:${log.id}`,
      log,
      type: 'allocation' as const,
    })),
  ].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime()
    const rightTime = new Date(right.createdAt).getTime()
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime - rightTime
    if (left.type !== right.type) return left.type === 'status' ? -1 : 1
    return left.id.localeCompare(right.id)
  })

  const timelineEvents = events.length > 0
    ? events
    : [{
        createdAt: row.updatedAt || row.createdAt,
        createdBy: row.updatedBy || row.createdBy,
        id: `status:${row.id}:current-status`,
        log: {
          action: 'current_status',
          createdAt: row.updatedAt || row.createdAt,
          createdBy: row.updatedBy || row.createdBy,
          eventKey: `${row.docNo}:current-status`,
          fromStatus: '',
          id: `${row.id}:current-status`,
          meta: null,
          note: '',
          poBuyDocNo: row.docNo,
          toStatus: row.status,
        },
        type: 'status' as const,
      }]
  const renderedTimelineEvents = [...timelineEvents].reverse()

  return (
    <div className="space-y-3">
      {renderedTimelineEvents.map((event, index) => {
        const isLatest = index === 0
        const statusLog = event.type === 'status' ? event.log : null
        const allocationLog = event.type === 'allocation' ? event.log : null
        const metaText = statusLog ? poBuyStatusMetaText(statusLog.meta) : ''
        const transitionText = statusLog
          ? poBuyStatusTransitionLabel(statusLog)
          : allocationLog
            ? poBuyAllocationDescription(allocationLog)
            : ''
        const statusTone = statusLog
          ? statusBadge(statusLog.toStatus || row.status)
          : allocationLog?.action === 'released_from_purchase_bill'
            ? 'text-slate-600'
            : 'text-indigo-700'
        const actionLabel = statusLog
          ? statusLog.action === 'current_status' ? 'สถานะปัจจุบัน' : poBuyStatusActionLabel(statusLog.action)
          : allocationLog
            ? poBuyAllocationActionLabel(allocationLog.action)
            : 'อัปเดต PO'
        const pillText = statusLog ? poBuyStatusLabel(statusLog.toStatus || row.status) : 'จัดสรร PO'

        return (
          <div key={event.id} className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[128px_1fr]">
            <div className="pt-1 text-right text-xs text-slate-500">
              <div>{formatDateTime(event.createdAt)}</div>
              <div className="mt-1 truncate text-[11px]">{event.createdBy || '-'}</div>
            </div>
            <div className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
              <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${isLatest ? 'bg-slate-700' : 'bg-slate-300'}`} />
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-medium text-slate-800">{actionLabel}</div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusTone}`}>
                  <span className="size-1.5 rounded-full bg-current" />
                  {pillText}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{transitionText}</div>
              {metaText ? <div className="mt-1 text-xs text-slate-500">{metaText}</div> : null}
              {allocationLog ? (
                <div className="mt-2 grid gap-2 rounded-md bg-white px-3 py-2 text-xs text-slate-600 sm:grid-cols-4">
                  <div>จำนวน: <span className="font-medium text-slate-800">{formatMoney(allocationLog.allocatedQty)}</span></div>
                  <div>มูลค่า: <span className="font-medium text-slate-800">{formatMoney(allocationLog.allocatedAmount)}</span></div>
                  <div>ก่อน: <span className="font-medium text-slate-800">{formatMoney(allocationLog.fromRemainingQty)}</span></div>
                  <div>หลัง: <span className="font-medium text-slate-800">{formatMoney(allocationLog.toRemainingQty)}</span></div>
                </div>
              ) : null}
              {(statusLog?.note || allocationLog?.note) ? <div className="mt-2 whitespace-pre-wrap rounded-md bg-white px-3 py-2 text-sm text-slate-700">{statusLog?.note || allocationLog?.note}</div> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ExportButton({ href }: { href: string }) {
  return (
    <UiButton asChild className="ml-auto gap-2" variant="export">
      <a href={href}>
        <Download className="h-4 w-4 shrink-0" />
        <span>ส่งออก Excel</span>
      </a>
    </UiButton>
  )
}

export function PoBuyPageClient() {
  const columnResize = useResizableColumns('daily.po-buy', poBuyColumns)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelNoteError, setCancelNoteError] = useState('')
  const [cancelingRow, setCancelingRow] = useState<PoBuyRow | null>(null)
  const [data, setData] = useState<PoBuyPayload | null>(null)
  const [editingPoId, setEditingPoId] = useState<string | null>(null)
  const [editingPoNo, setEditingPoNo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [form, setForm] = useState<PoBuyFormState>(() => blankForm())
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [printingPoDocNo, setPrintingPoDocNo] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedPoIds, setSelectedPoIds] = useState<string[]>([])
  const [selectedRow, setSelectedRow] = useState<PoBuyRow | null>(null)
  const [shortCloseNote, setShortCloseNote] = useState('')
  const [shortCloseNoteError, setShortCloseNoteError] = useState('')
  const [shortClosingRow, setShortClosingRow] = useState<PoBuyRow | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortDirection, setSortDirection] = useState<PoBuySortDirection>('desc')
  const [sortKey, setSortKey] = useState<PoBuySortKey>('docNo')
  const [statuses, setStatuses] = useState<string[]>([])
  const [toDate, setToDate] = useState('')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<PoBuyPayload>('/api/purchase/po-buy'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด PO Buy ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const formTotals = useMemo(() => {
    const totalQty = form.items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
    const subtotal = form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0)
    const vatRatePercent = data?.vatRatePercent ?? 7
    const vatAmount = form.hasVat ? Math.round((subtotal * vatRatePercent / 100 + Number.EPSILON) * 100) / 100 : 0
    const totalCost = subtotal + vatAmount
    return { lineCount: form.items.length, subtotal, totalCost, totalQty, vatAmount, vatRatePercent }
  }, [data?.vatRatePercent, form.hasVat, form.items])

  const openCreateForm = () => {
    setEditingPoId(null)
    setEditingPoNo(null)
    setForm(blankForm())
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  const openEditForm = (row: PoBuyRow) => {
    setEditingPoId(row.id)
    setEditingPoNo(row.docNo)
    setSelectedRow(null)
    setForm({
      branchId: row.branchId,
      expectedDelivery: row.expectedDelivery,
      hasVat: row.hasVat,
      items: row.items.map((item) => ({
        productId: item.productId,
        qty: item.qty,
        unitPrice: item.unitPrice,
      })),
      notes: row.notes ?? '',
      supplierId: row.supplierId,
    })
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  const openCancelDialog = (row: PoBuyRow) => {
    setCancelingRow(row)
    setCancelNote('')
    setCancelNoteError('')
    setError(null)
  }

  const openShortCloseDialog = (row: PoBuyRow) => {
    setShortClosingRow(row)
    setShortCloseNote('')
    setShortCloseNoteError('')
    setError(null)
  }

  const updateForm = <Key extends keyof PoBuyFormState>(key: Key, value: PoBuyFormState[Key]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  const updateItem = <Key extends keyof PoBuyFormItem>(index: number, key: Key, value: PoBuyFormItem[Key]) => {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setFieldErrors((current) => {
      const next = { ...current }
      delete next[`items.${index}.${key}`]
      return next
    })
  }

  const addItem = () => {
    setForm((current) => ({ ...current, items: [...current.items, blankItem()] }))
  }

  const removeItem = (index: number) => {
    setForm((current) => current.items.length <= 1
      ? current
      : { ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) })
  }

  const submitForm = async () => {
    const parsed = flattenClientErrors(form)
    if (!parsed.data) {
      setFieldErrors(parsed.errors)
      setError('ตรวจข้อมูลในฟอร์มก่อนบันทึก')
      return
    }

    setError(null)
    setFieldErrors({})
    setIsSaving(true)
    try {
      const payload: PoBuyFormValues = parsed.data
      await dailyFetchJson<{ docNo: string; id: string }>('/api/purchase/po-buy', {
        body: JSON.stringify(editingPoId ? { ...payload, id: editingPoId } : payload),
        method: editingPoId ? 'PUT' : 'POST',
      })
      setShowForm(false)
      setEditingPoId(null)
      setEditingPoNo(null)
      await loadData()
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
        setFieldErrors(flattenApiFieldErrors(caught.fieldErrors))
      }
      setError(caught instanceof Error ? caught.message : 'บันทึก PO Buy ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const submitCancel = async () => {
    if (!cancelingRow) return
    const note = cancelNote.trim()
    if (!note) {
      setCancelNoteError('กรอกหมายเหตุการยกเลิก')
      return
    }

    setError(null)
    setCancelNoteError('')
    setIsSaving(true)
    try {
      await dailyFetchJson<{ docNo: string; id: string }>('/api/purchase/po-buy', {
        body: JSON.stringify({ id: cancelingRow.id, note }),
        method: 'PATCH',
      })
      setCancelingRow(null)
      setCancelNote('')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิก PO Buy ไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const submitShortClose = async () => {
    if (!shortClosingRow) return
    const note = shortCloseNote.trim()
    if (!note) {
      setShortCloseNoteError('กรอกเหตุผลการปิดรับไม่ครบ')
      return
    }

    setError(null)
    setShortCloseNoteError('')
    setIsSaving(true)
    try {
      await dailyFetchJson<{ docNo: string; id: string }>('/api/purchase/po-buy', {
        body: JSON.stringify({ action: 'shortClose', id: shortClosingRow.id, note }),
        method: 'PATCH',
      })
      setShortClosingRow(null)
      setShortCloseNote('')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ปิดรับไม่ครบไม่สำเร็จ')
    } finally {
      setIsSaving(false)
    }
  }

  const printPoBuy = async (row: PoBuyRow) => {
    if (printingPoDocNo) return
    let printWindow: Window | null = null
    setError(null)
    setPrintingPoDocNo(row.docNo)
    try {
      printWindow = openPoBuyPrintWindow()
      await openPoBuyPrint(row satisfies PoBuyPrintDocument, printWindow)
    } catch (caught) {
      printWindow?.close()
      setError(caught instanceof Error ? caught.message : 'เปิดใบพิมพ์ PO Buy ไม่ได้')
    } finally {
      setPrintingPoDocNo(null)
    }
  }

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filteredRows = (data?.rows ?? []).filter((row) => {
      if (statuses.length > 0 && !statuses.includes(row.status)) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      if (!query) return true
      return `${row.docNo} ${row.supplierName} ${row.productName} ${row.status}`.toLowerCase().includes(query)
    })
    return [...filteredRows].sort((left, right) => {
      const leftValue = poBuySortValue(left, sortKey)
      const rightValue = poBuySortValue(right, sortKey)
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'th')
      return sortDirection === 'asc' ? result : -result
    })
  }, [data?.rows, fromDate, search, sortDirection, sortKey, statuses, toDate])

  useEffect(() => {
    setPage(1)
  }, [fromDate, pageSize, search, sortDirection, sortKey, statuses, toDate])

  const openRows = (data?.rows ?? []).filter((row) => poBuyStatusKey(row.status) === 'open')
  const partialRows = (data?.rows ?? []).filter((row) => poBuyStatusKey(row.status) === 'partial')
  const receivedRows = (data?.rows ?? []).filter((row) => poBuyStatusKey(row.status) === 'received')
  const shortClosedRows = (data?.rows ?? []).filter((row) => poBuyStatusKey(row.status) === 'shortClosed')
  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (search.trim()) params.set('q', search.trim())
    if (statuses.length > 0) params.set('status', statuses.join(','))
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    if (selectedPoIds.length > 0) params.set('ids', selectedPoIds.join(','))
    return `/api/purchase/po-buy?${params.toString()}`
  }, [fromDate, search, selectedPoIds, statuses, toDate])

  const resetFilters = () => {
    setFromDate('')
    setSearch('')
    setStatuses([])
    setToDate('')
  }

  const changeSort = (nextKey: PoBuySortKey) => {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'date' || nextKey === 'docNo' ? 'desc' : 'asc')
  }

  const hasFilters = statuses.length > 0 || fromDate || toDate || search.trim()
  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const allVisibleSelected = pageRows.length > 0 && pageRows.every((row) => selectedPoIds.includes(row.id))

  const toggleVisibleSelection = () => {
    setSelectedPoIds((current) => {
      if (allVisibleSelected) return current.filter((id) => !pageRows.some((row) => row.id === id))
      return [...new Set([...current, ...pageRows.map((row) => row.id)])]
    })
  }

  const toggleRowSelection = (id: string) => {
    setSelectedPoIds((current) => current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id])
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 shadow-sm grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3 text-sm">
        <SummaryCard
          label="ภาพรวม PO"
          sublabel={`มูลค่ารวม ${formatMoney(data?.summary.totalAmount ?? 0)}`}
          tone="blue"
          value={`${data?.summary.totalRows ?? 0}`}
        />
        <SummaryCard
          label="สถานะการรับ"
          sublabel="ยังไม่รับ / บางส่วน / รับครบ / ปิดรับไม่ครบ"
          tone="amber"
          value={`${openRows.length || data?.summary.open || 0} / ${partialRows.length} / ${receivedRows.length} / ${shortClosedRows.length || data?.summary.shortClosed || 0}`}
        />
        <SummaryCard
          className="col-span-2 lg:col-span-1"
          label="ยอดคงเหลือ"
          sublabel={`น้ำหนักรอรับ ${formatMoney(data?.summary.remainingQty ?? 0)}`}
          tone="emerald"
          value={formatMoney(data?.summary.remainingAmount ?? 0)}
        />
      </div>

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden md:block space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <UiInput className="min-w-[260px] flex-1 rounded-md" placeholder="ค้นหาเลข PO / ชื่อผู้ขาย / ชื่อสินค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="text-xs text-slate-500">วันที่:</label>
          <DatePickerInput id="po-buy-date-from" value={fromDate} onChange={setFromDate} />
          <span className="text-slate-400">→</span>
          <DatePickerInput id="po-buy-date-to" value={toDate} onChange={setToDate} />
          {hasFilters ? <UiButton size="xs" type="button" variant="secondary" onClick={resetFilters}>✕ ล้าง</UiButton> : null}
          <ExportButton href={exportHref} />
          <UiButton type="button" onClick={openCreateForm}>+ PO Buy ใหม่</UiButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">สถานะ:</span>
          <PoBuySegment
            active={statuses.length === 0}
            label="ทุกสถานะ"
            onClick={() => setStatuses([])}
          />
          <PoBuySegment
            active={statuses.includes('Open')}
            label="ยังไม่รับ"
            onClick={() => toggleStatusFilter('Open', setStatuses)}
            tone="open"
          />
          <PoBuySegment
            active={statuses.includes('Partially Received')}
            label="บางส่วน"
            onClick={() => toggleStatusFilter('Partially Received', setStatuses)}
            tone="partial"
          />
          <PoBuySegment
            active={statuses.includes('Received')}
            label="รับครบ"
            onClick={() => toggleStatusFilter('Received', setStatuses)}
            tone="received"
          />
          <PoBuySegment
            active={statuses.includes('Short Closed')}
            label="ปิดรับไม่ครบ"
            onClick={() => toggleStatusFilter('Short Closed', setStatuses)}
            tone="shortClosed"
          />
          <PoBuySegment
            active={statuses.includes('Cancelled')}
            label="ยกเลิก"
            onClick={() => toggleStatusFilter('Cancelled', setStatuses)}
            tone="cancelled"
          />
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="space-y-2 rounded-md bg-white p-3 shadow md:hidden">
        <div className="flex gap-2 items-center">
          <UiInput className="min-w-[200px] flex-1 rounded-md h-9" placeholder="ค้นหาเลข PO / ผู้ขาย / สินค้า..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {hasFilters ? '(มี)' : ''}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? (
            <UiButton
              className="h-9 font-normal hidden md:inline-flex"
              size="sm"
              type="button"
              variant="outline"
              onClick={columnResize.resetColumnWidths}
            >
              Set col to default
            </UiButton>
          ) : null}
          <UiSelect
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto min-w-[96px] px-2"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={10}>10 / หน้า</option>
            <option value={25}>25 / หน้า</option>
            <option value={50}>50 / หน้า</option>
            <option value={100}>100 / หน้า</option>
          </UiSelect>
          <UiButton className="font-normal" disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</UiButton>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <UiButton className="font-normal" disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</UiButton>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 md:hidden">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองรายการจองซื้อ</h4>
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
                <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะ</span>
                <div className="flex flex-wrap gap-2">
                  <PoBuySegment
                    active={statuses.length === 0}
                    label="ทุกสถานะ"
                    onClick={() => setStatuses([])}
                  />
                  <PoBuySegment
                    active={statuses.includes('Open')}
                    label="ยังไม่รับ"
                    onClick={() => toggleStatusFilter('Open', setStatuses)}
                    tone="open"
                  />
                  <PoBuySegment
                    active={statuses.includes('Partially Received')}
                    label="บางส่วน"
                    onClick={() => toggleStatusFilter('Partially Received', setStatuses)}
                    tone="partial"
                  />
                  <PoBuySegment
                    active={statuses.includes('Received')}
                    label="รับครบ"
                    onClick={() => toggleStatusFilter('Received', setStatuses)}
                    tone="received"
                  />
                  <PoBuySegment
                    active={statuses.includes('Short Closed')}
                    label="ปิดรับไม่ครบ"
                    onClick={() => toggleStatusFilter('Short Closed', setStatuses)}
                    tone="shortClosed"
                  />
                  <PoBuySegment
                    active={statuses.includes('Cancelled')}
                    label="ยกเลิก"
                    onClick={() => toggleStatusFilter('Cancelled', setStatuses)}
                    tone="cancelled"
                  />
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
            className="rounded-md border border-slate-100 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
            onClick={() => setSelectedRow(row)}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
              <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
            </div>
            
            <div className="text-xs text-slate-600 mb-3 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">ผู้ขาย: </span>
                <span className="text-slate-800">{row.supplierName}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">สินค้า: </span>
                <span className="text-slate-800">{row.productName}</span>
              </div>
              {row.notes.trim() ? (
                <div className="text-[11px] text-slate-400 truncate">
                  หมายเหตุ: {row.notes}
                </div>
              ) : null}
            </div>

            <div className="flex justify-between items-end pt-2 border-t border-slate-100">
              <div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadge(row.status)}`}>
                  <span className="size-1.5 rounded-full bg-current" />
                  {poBuyStatusLabel(row.status)}
                </span>
                <div className="mt-1 text-[11px] font-bold text-blue-700">
                  {formatMoney(row.totalAmount)} บาท
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">จำนวนรวม / ยอดคงเหลือ</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums">
                  {formatMoney(row.qty)} / <span className="text-amber-600">{formatMoney(row.remainingQty)}</span> กก.
                </span>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && totalRows === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
            ยังไม่มี PO Buy
          </div>
        ) : null}
      </div>

      {/* Desktop Table (Hidden on Mobile) */}
      <div className="hidden md:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
        <Table className="text-xs font-semibold" style={{ fontFamily: "'Noto Sans Thai', Arial, sans-serif", tableLayout: 'fixed', minWidth: columnResize.tableMinWidth }}>
          <colgroup>
            {poBuyColumns.map((column) => {
              const style = columnResize.getColumnStyle(column.key)
              if (column.key === 'action') {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={style} />
            })}
          </colgroup>
          <TableHeader>
            <tr>
              <ResizableTableHead align="center" label={<input aria-label="เลือก PO ทั้งหมดในตาราง" checked={allVisibleSelected} disabled={rows.length === 0} type="checkbox" onChange={toggleVisibleSelection} />} resizeProps={columnResize.getResizeHandleProps('checkbox', 'เลือก')} />
              <PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="เลขที่ PO ซื้อ" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่ PO ซื้อ')} sortKey="docNo" onSort={changeSort} />
              <PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="วันที่สร้างเอกสาร" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่สร้างเอกสาร')} sortKey="date" onSort={changeSort} />
              <PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="ผู้ขาย" resizeProps={columnResize.getResizeHandleProps('supplierName', 'ผู้ขาย')} sortKey="supplierName" onSort={changeSort} />
              <PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="รายการสินค้า" resizeProps={columnResize.getResizeHandleProps('productName', 'รายการสินค้า')} sortKey="productName" onSort={changeSort} />
              <PoBuySortHeader activeKey={sortKey} align="right" direction={sortDirection} label="จำนวนรวม" resizeProps={columnResize.getResizeHandleProps('qty', 'จำนวนรวม')} sortKey="qty" onSort={changeSort} />
              <PoBuySortHeader activeKey={sortKey} align="right" direction={sortDirection} label="มูลค่ารวม" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'มูลค่ารวม')} sortKey="totalAmount" onSort={changeSort} />
              <PoBuySortHeader activeKey={sortKey} align="right" direction={sortDirection} label="รอรับรวม" resizeProps={columnResize.getResizeHandleProps('remainingQty', 'รอรับรวม')} sortKey="remainingQty" onSort={changeSort} />
              <PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="วันที่กำหนดส่ง" resizeProps={columnResize.getResizeHandleProps('expectedDelivery', 'วันที่กำหนดส่ง')} sortKey="expectedDelivery" onSort={changeSort} />
              <ResizableTableHead align="center" label="หมายเหตุ" resizeProps={columnResize.getResizeHandleProps('note', 'หมายเหตุ')} />
              <PoBuySortHeader activeKey={sortKey} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeSort} />
              <PoBuySortHeader activeKey={sortKey} direction={sortDirection} label="อัพเดตล่าสุด" resizeProps={columnResize.getResizeHandleProps('updatedAt', 'อัพเดตล่าสุด')} sortKey="updatedAt" onSort={changeSort} />
              <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={13}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
            {!isLoading && !error && rows.length === 0 ? <TableRow><TableCell className="py-10 text-center text-slate-400" colSpan={13}>ยังไม่มี PO Buy</TableCell></TableRow> : null}
            {!isLoading && pageRows.map((row, index) => (
              <TableRow key={row.id} className={`cursor-pointer border-slate-100 hover:bg-slate-50 ${index % 2 === 1 ? 'bg-slate-50/40' : ''}`} onClick={() => setSelectedRow(row)}>
                <TableCell className="text-center"><input aria-label={`เลือก ${row.docNo}`} checked={selectedPoIds.includes(row.id)} type="checkbox" onChange={() => toggleRowSelection(row.id)} onClick={(event) => event.stopPropagation()} /></TableCell>
                <TableCell className="w-36 whitespace-nowrap font-mono">{row.docNo}</TableCell>
                <TableCell className="w-28 whitespace-nowrap">{formatDateDisplay(row.date)}</TableCell>
                <TableCell className="w-36">{row.supplierName}</TableCell>
                <TableCell className="w-[280px] max-w-[280px]">
                  <PoBuyItemSummary fallbackText={row.productName} items={row.items} />
                </TableCell>
                <TableNumberCell value={formatMoney(row.qty)} />
                <TableNumberCell strong value={formatMoney(row.totalAmount)} />
                <TableNumberCell tone="amber" value={formatMoney(row.remainingQty)} />
                <TableCell className="w-28 whitespace-nowrap">{formatDateDisplay(row.expectedDelivery)}</TableCell>
                <TableCell className="text-center"><PoBuyNoteIndicator note={row.notes} poNo={row.docNo} /></TableCell>
                <TableCell className="w-28 whitespace-nowrap text-center">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadge(row.status)}`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {poBuyStatusLabel(row.status)}
                  </span>
                </TableCell>
                <TableCell className="w-28 whitespace-nowrap text-xs text-slate-600"><div className="truncate">{row.updatedBy || row.createdBy || '-'}</div><div className="font-mono text-[10px] text-slate-400">{formatDateTime(row.updatedAt || row.createdAt)}</div></TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  {row.status === 'Open' && row.qty === row.remainingQty ? (
                    <>
                      <button className={`${rowActionButtonClass} mr-1.5`} type="button" onClick={(event) => { event.stopPropagation(); openEditForm(row) }}>แก้ไข</button>
                      <button className={`${rowDangerActionButtonClass} mr-1.5`} type="button" onClick={(event) => { event.stopPropagation(); openCancelDialog(row) }}>ยกเลิก</button>
                    </>
                  ) : null}
                  <button
                    className={`inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60 ${row.status === 'Open' && row.qty === row.remainingQty ? '' : 'mr-1.5'}`}
                    disabled={printingPoDocNo === row.docNo}
                    type="button"
                    onClick={(event) => { event.stopPropagation(); void printPoBuy(row) }}
                  >
                    <Printer className="size-3" />
                    {printingPoDocNo === row.docNo ? 'เตรียม...' : 'พิมพ์'}
                  </button>
                  {shouldShowShortCloseButton(row) ? (
                    <button
                      className={`${rowWarningActionButtonClass} ml-1.5 disabled:cursor-not-allowed disabled:opacity-50`}
                      disabled={!canShortClosePoBuy(row)}
                      title={canShortClosePoBuy(row) ? undefined : 'เปิดใช้ได้เมื่อรับสินค้าบางส่วนแล้ว'}
                      type="button"
                      onClick={(event) => { event.stopPropagation(); openShortCloseDialog(row) }}
                    >
                      ปิดรับไม่ครบ
                    </button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="fixed bottom-6 right-6 md:hidden">
        <button
          className="flex size-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-transform"
          onClick={openCreateForm}
          type="button"
        >
          <Plus className="size-8" />
        </button>
      </div>

      {showForm ? (
        <PoBuyFormModal
          branches={data?.options.branches ?? []}
          errors={fieldErrors}
          form={form}
          formTotals={formTotals}
          heading={editingPoNo ? `แก้ไข PO Buy ${editingPoNo}` : 'สร้าง PO Buy (จองซื้อ)'}
          isSaving={isSaving}
          submitLabel={editingPoId ? 'บันทึกการแก้ไข' : 'บันทึก PO Buy'}
          products={data?.options.products ?? []}
          suppliers={data?.options.suppliers ?? []}
          onAddItem={addItem}
          onClose={() => setShowForm(false)}
          onRemoveItem={removeItem}
          onSubmit={submitForm}
          onUpdate={updateForm}
          onUpdateItem={updateItem}
        />
      ) : null}
      {cancelingRow ? (
        <PoBuyCancelModal
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
        <PoBuyShortCloseModal
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
      {selectedRow ? (
        <PoBuyDetailModal
          isPrinting={printingPoDocNo === selectedRow.docNo}
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onEdit={openEditForm}
          onCancel={openCancelDialog}
          onShortClose={openShortCloseDialog}
          onPrint={(rowToPrint) => void printPoBuy(rowToPrint)}
        />
      ) : null}
    </section>
  )
}

function SummaryCard({
  className = '',
  label,
  sublabel,
  tone = 'slate',
  value,
}: {
  className?: string
  label: string
  sublabel?: string
  tone?: 'blue' | 'amber' | 'emerald' | 'slate'
  value: string
}) {
  const configs = {
    slate: {
      bg: 'bg-slate-100 text-slate-600',
      emoji: '📋',
      labelColor: 'text-slate-500',
      valueColor: 'text-slate-900',
    },
    blue: {
      bg: 'bg-blue-100 text-blue-600',
      emoji: '📋',
      labelColor: 'text-blue-600',
      valueColor: 'text-blue-700',
    },
    amber: {
      bg: 'bg-amber-100 text-amber-600',
      emoji: '⏱️',
      labelColor: 'text-amber-600',
      valueColor: 'text-amber-700',
    },
    emerald: {
      bg: 'bg-emerald-100 text-emerald-600',
      emoji: '💰',
      labelColor: 'text-emerald-600',
      valueColor: 'text-emerald-700',
    },
  }

  const config = configs[tone]

  return (
    <div className={`bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4 ${className}`}>
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${config.bg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {config.emoji}
      </div>
      <div>
        <div className={`text-xs ${config.labelColor}`}>{label}</div>
        <div className={`font-bold ${config.valueColor}`}>{value}</div>
        {sublabel ? <div className="text-[10px] text-slate-400 font-medium mt-0.5">{sublabel}</div> : null}
      </div>
    </div>
  )
}

function PoBuyNoteIndicator({ note, poNo }: { note: string; poNo: string }) {
  const text = note.trim()
  if (!text) return <span className="text-slate-300">-</span>

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={`ดูหมายเหตุ ${poNo}`}
            className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold leading-none text-slate-600 hover:border-slate-400 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
            type="button"
            onClick={(event) => event.stopPropagation()}
          >
            i
          </button>
        </TooltipTrigger>
        <TooltipContent className="w-72 whitespace-pre-wrap p-3 text-left leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const poBuyVisibleItemLimit = 2
const poBuyHiddenItemExactLimit = 10

function poBuyItemSummaryText(item: PoBuyItem) {
  const productName = item.productName || '-'
  const unit = item.unit?.trim() || ''
  const quantity = Number.isFinite(item.qty) && item.qty > 0
    ? ` (${formatMoney(item.qty)}${unit ? ` ${unit}` : ''})`
    : ''
  return `${productName}${quantity}`
}

function poBuyHiddenItemText(hiddenCount: number) {
  if (hiddenCount <= 0) return ''
  if (hiddenCount > poBuyHiddenItemExactLimit) return 'และอีกมากกว่า 10 รายการ'
  return `และอีก ${hiddenCount} รายการ`
}

function PoBuyItemSummary({ fallbackText, items }: { fallbackText: string; items: PoBuyItem[] }) {
  const normalizedItems = items.filter((item) => item.productName || item.productId)
  const fallback = fallbackText.trim()
  if (normalizedItems.length === 0) return fallback ? <span className="block truncate">{fallback}</span> : <span>-</span>

  const visibleItems = normalizedItems.slice(0, poBuyVisibleItemLimit)
  const hiddenCount = Math.max(0, normalizedItems.length - visibleItems.length)
  const hiddenText = poBuyHiddenItemText(hiddenCount)
  const fullText = normalizedItems.map(poBuyItemSummaryText).join('\n')

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="min-w-0 space-y-0.5 text-xs leading-5" tabIndex={0}>
            {visibleItems.map((item, index) => (
              <div key={`${item.productId || item.productName}-${index}`} className="truncate">
                {poBuyItemSummaryText(item)}
              </div>
            ))}
            {hiddenText ? <div className="truncate font-semibold text-slate-500">{hiddenText}</div> : null}
          </div>
        </TooltipTrigger>
        <TooltipContent align="start" className="max-h-80 w-96 overflow-y-auto whitespace-pre-wrap p-3 leading-relaxed">
          {fullText}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function PoBuyCancelModal({
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
  row: PoBuyRow
}) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !isSaving) onClose()
    }}>
      <DialogContent aria-labelledby="po-buy-cancel-title" className="top-auto bottom-0 w-full max-w-lg translate-x-[-50%] translate-y-0 rounded-t-md md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-md" hideClose>
        <DialogHeader className="">
          <DialogTitle id="po-buy-cancel-title">ยกเลิก PO Buy {row.docNo}</DialogTitle>
          <DialogDescription>{row.supplierName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 p-4 text-sm">
          <label className="block text-xs font-medium text-slate-600" htmlFor="po-buy-cancel-note">หมายเหตุการยกเลิก *</label>
          <textarea
            id="po-buy-cancel-note"
            className="w-full rounded-md border px-3 py-2"
            maxLength={500}
            rows={3}
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
          />
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
        </div>
        <DialogFooter>
          <UiButton className="font-normal" disabled={isSaving} type="button" variant="ghost" onClick={onClose}>ปิด</UiButton>
          <UiButton className="bg-red-600 font-normal hover:bg-red-700" disabled={isSaving} type="button" variant="default" onClick={onSubmit}>{isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PoBuyShortCloseModal({
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
  row: PoBuyRow
}) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !isSaving) onClose()
    }}>
      <DialogContent aria-labelledby="po-buy-short-close-title" className="top-auto bottom-0 w-full max-w-lg translate-x-[-50%] translate-y-0 rounded-t-md md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-md" hideClose>
        <DialogHeader className="">
          <DialogTitle id="po-buy-short-close-title">ปิดรับไม่ครบ {row.docNo}</DialogTitle>
          <DialogDescription>{row.supplierName} · คงเหลือ {formatMoney(row.remainingQty)} กก.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 p-4 text-sm">
          <label className="block text-xs font-medium text-slate-600" htmlFor="po-buy-short-close-note">เหตุผลการปิดรับไม่ครบ *</label>
          <textarea
            id="po-buy-short-close-note"
            className="w-full rounded-md border px-3 py-2"
            maxLength={500}
            rows={3}
            value={note}
            onChange={(event) => onChangeNote(event.target.value)}
          />
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
        </div>
        <DialogFooter>
          <UiButton className="font-normal" disabled={isSaving} type="button" variant="ghost" onClick={onClose}>ปิด</UiButton>
          <UiButton className="bg-amber-600 font-normal hover:bg-amber-700" disabled={isSaving} type="button" variant="default" onClick={onSubmit}>{isSaving ? 'กำลังบันทึก...' : 'ยืนยันปิดรับไม่ครบ'}</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function poBuySortValue(row: PoBuyRow, key: PoBuySortKey) {
  if (key === 'date') return row.date
  if (key === 'docNo') return row.docNo
  if (key === 'expectedDelivery') return row.expectedDelivery || '9999-12-31'
  if (key === 'itemCount') return row.itemCount
  if (key === 'productName') return row.productName
  if (key === 'qty') return row.qty
  if (key === 'remainingQty') return row.remainingQty
  if (key === 'status') return row.status
  if (key === 'supplierName') return row.supplierName
  if (key === 'updatedAt') return row.updatedAt || row.createdAt || ''
  return row.totalAmount
}

function PoBuySortHeader({
  activeKey,
  align = 'left',
  className = '',
  direction,
  label,
  resizeProps,
  sortKey,
  onSort,
}: {
  activeKey: PoBuySortKey
  align?: 'center' | 'left' | 'right'
  className?: string
  direction: PoBuySortDirection
  label: string
  resizeProps?: ButtonHTMLAttributes<HTMLButtonElement>
  sortKey: PoBuySortKey
  onSort: (key: PoBuySortKey) => void
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

function PoBuySegment({
  active,
  label,
  onClick,
  tone = 'default',
}: {
  active: boolean
  label: string
  onClick: () => void
  tone?: 'cancelled' | 'default' | 'open' | 'partial' | 'received' | 'shortClosed'
}) {
  const className = tone === 'open'
    ? active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white hover:bg-blue-50'
    : tone === 'partial'
      ? active ? 'border-amber-600 bg-amber-600 text-white' : 'border-slate-300 bg-white hover:bg-amber-50'
      : tone === 'received'
        ? active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white hover:bg-emerald-50'
        : tone === 'shortClosed'
          ? active ? 'border-red-600 bg-red-600 text-white' : 'border-slate-300 bg-white hover:bg-red-50'
        : tone === 'cancelled'
          ? active ? 'border-slate-500 bg-slate-500 text-white' : 'border-slate-300 bg-white hover:bg-slate-100'
          : active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-100'

  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${className}`} type="button" onClick={onClick}>{label}</button>
}

function toggleStatusFilter(value: string, setStatuses: Dispatch<SetStateAction<string[]>>) {
  setStatuses((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])
}

function statusBadge(status: string) {
  const normalized = poBuyStatusKey(status)
  if (normalized === 'received') return 'text-emerald-700'
  if (normalized === 'partial') return 'text-cyan-700'
  if (normalized === 'shortClosed') return 'text-rose-700'
  if (normalized === 'cancelled') return 'text-slate-500'
  return 'text-amber-700'
}

function SupplierSearchCombobox({
  error,
  options,
  value,
  onChange,
}: {
  error?: string
  options: Option[]
  value: string
  onChange: (supplierId: string) => void
}) {
  return (
    <SearchCombobox
      error={error}
      inputId="po-buy-supplier-search"
      label="ผู้ขาย *"
      inputClassName="!h-9 px-2 py-1.5"
      options={options.map((supplier) => ({
        id: supplier.id,
        label: optionLabel(supplier),
        searchText: searchableText(supplier),
      }))}
      optionsPanelClassName="max-h-[280px]"
      placeholder="พิมพ์ชื่อผู้ขาย..."
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

function MoneyPatternInput({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const [isFocused, setIsFocused] = useState(false)
  const [rawValue, setRawValue] = useState('')

  useEffect(() => {
    if (!isFocused) setRawValue(formatMoneyInput(value))
  }, [isFocused, value])

  return (
    <UiInput
      className="!h-9 w-full px-2 py-1.5 text-right"
      inputMode="decimal"
      type="text"
      value={isFocused ? rawValue : formatMoneyInput(value)}
      onBlur={() => {
        setIsFocused(false)
        setRawValue(formatMoneyInput(value))
      }}
      onChange={(event) => {
        const nextRawValue = sanitizeMoneyInput(event.target.value)
        setRawValue(nextRawValue)
        onChange(nextRawValue ? Number(nextRawValue) : 0)
      }}
      onFocus={() => {
        setIsFocused(true)
        setRawValue(value > 0 ? sanitizeMoneyInput(String(value)) : '')
      }}
    />
  )
}

function QuantityPatternInput({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const [rawValue, setRawValue] = useState('')

  useEffect(() => {
    setRawValue(value > 0 ? sanitizeMoneyInput(String(value)) : '')
  }, [value])

  return (
    <UiInput
      className="!h-9 w-full px-2 py-1.5 text-right"
      inputMode="decimal"
      type="text"
      value={rawValue}
      onChange={(event) => {
        const nextRawValue = sanitizeMoneyInput(event.target.value)
        setRawValue(nextRawValue)
        onChange(nextRawValue ? Number(nextRawValue) : 0)
      }}
    />
  )
}

function PoBuyFormModal({
  branches,
  errors,
  form,
  formTotals,
  heading,
  isSaving,
  products,
  submitLabel,
  suppliers,
  onAddItem,
  onClose,
  onRemoveItem,
  onSubmit,
  onUpdate,
  onUpdateItem,
}: {
  branches: Option[]
  errors: FieldErrors
  form: PoBuyFormState
  formTotals: { lineCount: number; subtotal: number; totalCost: number; totalQty: number; vatAmount: number; vatRatePercent: number }
  heading: string
  isSaving: boolean
  products: Option[]
  submitLabel: string
  suppliers: Option[]
  onAddItem: () => void
  onClose: () => void
  onRemoveItem: (index: number) => void
  onSubmit: () => void
  onUpdate: <Key extends keyof PoBuyFormState>(key: Key, value: PoBuyFormState[Key]) => void
  onUpdateItem: <Key extends keyof PoBuyFormItem>(index: number, key: Key, value: PoBuyFormItem[Key]) => void
}) {
  const activeBranches = branches.filter((branch) => branch.active !== false)
  const activeSuppliers = suppliers.filter((supplier) => supplier.active !== false)
  const activeProducts = products.filter((product) => product.active !== false)
  const productOptions = useMemo<SearchComboboxOption[]>(() => activeProducts.map((product) => ({
    description: undefined,
    id: product.id,
    label: optionLabel(product),
    searchText: searchableText(product),
  })), [activeProducts])
  const fieldError = (name: string) => errors[name] ? <div className="mt-1 text-xs text-red-600">{errors[name]}</div> : null

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open && !isSaving) onClose()
    }}>
      <DialogContent aria-labelledby="po-buy-form-title" className="max-h-[90vh] max-w-5xl overflow-y-auto rounded-md p-0" data-combobox-portal-root="true" hideClose>
        <DialogHeader className="px-5 py-3">
          <DialogTitle id="po-buy-form-title">{heading}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 p-5 text-sm">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <SupplierSearchCombobox
                error={errors.supplierId}
                options={activeSuppliers}
                value={form.supplierId}
                onChange={(supplierId) => onUpdate('supplierId', supplierId)}
              />
              {fieldError('supplierId')}
            </div>
            <div>
              <label className="mb-1 block text-xs">สาขา <span className="text-red-600">*</span></label>
              <UiSelect className={`!h-9 w-full px-2 py-1.5 text-sm ${form.branchId ? '' : 'text-slate-400'}`} value={form.branchId} onChange={(event) => onUpdate('branchId', event.target.value)}>
                <option disabled value="">เลือกสาขา</option>
                {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </UiSelect>
              {fieldError('branchId')}
            </div>
            <div>
              <label className="mb-1 block text-xs">วันส่งมอบ <span className="text-red-600">*</span></label>
              <DatePickerInput className="!h-9 w-full" required value={form.expectedDelivery} onChange={(value) => onUpdate('expectedDelivery', value)} />
              {fieldError('expectedDelivery')}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="font-medium">📋 รายการสินค้า ({form.items.length})</label>
              <UiButton className="bg-emerald-600 font-normal hover:bg-emerald-700" size="xs" type="button" variant="default" onClick={onAddItem}>+ เพิ่มรายการ</UiButton>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[820px] border-0">
                <TableHeader>
                  <tr><TableHead>สินค้า</TableHead><TableHead className="w-36 text-right">จำนวน (กก.) *</TableHead><TableHead className="w-36 text-right">ราคา/หน่วย *</TableHead><TableHead className="w-36 text-right">มูลค่ารวม</TableHead><TableHead className="w-10" /></tr>
                </TableHeader>
                <TableBody>
                  {form.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="p-1 align-top">
                        <ProductSearchCombobox
                          error={errors[`items.${index}.productId`]}
                          inputId={`po-buy-product-${index}`}
                          options={productOptions}
                          value={item.productId}
                          onChange={(productId) => onUpdateItem(index, 'productId', productId)}
                        />
                        {fieldError(`items.${index}.productId`)}
                      </TableCell>
                      <TableCell className="p-1 align-top">
                        <QuantityPatternInput value={item.qty} onChange={(value) => onUpdateItem(index, 'qty', value)} />
                        {fieldError(`items.${index}.qty`)}
                      </TableCell>
                      <TableCell className="p-1 align-top">
                        <MoneyPatternInput value={item.unitPrice} onChange={(value) => onUpdateItem(index, 'unitPrice', value)} />
                        {fieldError(`items.${index}.unitPrice`)}
                      </TableCell>
                      <TableCell className="bg-blue-50 p-1 px-2 text-right font-bold text-blue-700">{formatMoney(item.qty * item.unitPrice)}</TableCell>
                      <TableCell className="p-1 text-center">{form.items.length > 1 ? <UiButton className="h-8 w-8 px-0 text-red-500" size="icon" type="button" variant="ghost" onClick={() => onRemoveItem(index)}>×</UiButton> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot className="bg-slate-50 font-bold">
                  <tr><td className="p-2 text-right">รวม {formTotals.lineCount} รายการ</td><td className="p-2 text-right">{formatMoney(formTotals.totalQty)}</td><td /><td className="p-2 text-right text-base text-blue-700">{formatMoney(formTotals.subtotal)}</td><td /></tr>
                </tfoot>
              </Table>
            </div>
            {fieldError('items')}
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_320px]">
            <label className={`flex cursor-pointer items-center gap-3 rounded-md border-2 p-3 ${form.hasVat ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <input
                checked={form.hasVat}
                className="size-5"
                type="checkbox"
                onChange={(event) => onUpdate('hasVat', event.target.checked)}
              />
              <span className="font-bold text-slate-700">มี VAT</span>
            </label>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <SummaryLine label="ยอดก่อน VAT" value={formatMoney(formTotals.subtotal)} />
              <SummaryLine label={`VAT ${formatMoney(formTotals.vatRatePercent)}%`} value={formatMoney(formTotals.vatAmount)} />
              <SummaryLine label="ยอดรวม" strong value={formatMoney(formTotals.totalCost)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs">หมายเหตุ</label>
            <textarea className="min-h-16 w-full rounded-md border px-2 py-1.5 text-sm" rows={2} value={form.notes} onChange={(event) => onUpdate('notes', event.target.value)} />
            {fieldError('notes')}
          </div>
        </div>
        <DialogFooter className="px-5">
          <UiButton className="font-normal" disabled={isSaving} type="button" variant="outline" onClick={onClose}>ยกเลิก</UiButton>
          <UiButton className="bg-blue-600 font-normal hover:bg-blue-700" disabled={isSaving} type="button" variant="default" onClick={onSubmit}>{isSaving ? 'กำลังบันทึก...' : submitLabel}</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PoBuyDetailModal({
  isPrinting,
  onClose,
  onEdit,
  onCancel,
  onShortClose,
  onPrint,
  row,
}: {
  isPrinting: boolean
  onClose: () => void
  onEdit?: (row: PoBuyRow) => void
  onCancel?: (row: PoBuyRow) => void
  onShortClose?: (row: PoBuyRow) => void
  onPrint: (row: PoBuyRow) => void
  row: PoBuyRow
}) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent aria-labelledby="po-buy-detail-title" className="max-h-[90vh] max-w-3xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-none" hideClose>
        <DialogHeader className="p-4 bg-slate-900 text-white shrink-0">
          <div>
            <DialogTitle id="po-buy-detail-title" className="text-white">รายละเอียด {row.docNo}</DialogTitle>
            <DialogDescription className="text-slate-300">{row.supplierName}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 space-y-4 text-sm">
          {/* Card 1: ข้อมูลหลัก */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">ข้อมูลหลัก</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-5">
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">วันที่สร้างเอกสาร</div>
                <div className="text-sm font-semibold text-slate-900">{formatDateDisplay(row.date)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">วันที่กำหนดส่ง</div>
                <div className="text-sm font-semibold text-slate-900">{formatDateDisplay(row.expectedDelivery)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">สถานะ PO</div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadge(row.status)}`}>
                  <span className="size-1.5 rounded-full bg-current" />
                  {poBuyStatusLabel(row.status)}
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: ยอดเงินและจำนวน */}
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4">ยอดเงินและจำนวน</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-5">
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">Qty (จำนวน)</div>
                <div className="text-sm font-semibold text-slate-900">{formatMoney(row.qty)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">คงเหลือ</div>
                <div className="text-sm font-semibold text-slate-900">{formatMoney(row.remainingQty)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">ปิดรับไม่ครบ</div>
                <div className="text-sm font-semibold text-slate-900">{row.shortClosedQty > 0 ? formatMoney(row.shortClosedQty) : '-'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">ยอดก่อน VAT</div>
                <div className="text-sm font-semibold text-slate-900">{formatMoney(row.subtotal)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">VAT {formatMoney(row.vatRatePercent)}%</div>
                <div className="text-sm font-semibold text-slate-900">{formatMoney(row.vatAmount)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 mb-0.5">ยอดรวมสุทธิ</div>
                <div className="text-sm font-bold text-blue-700">{formatMoney(row.totalAmount)}</div>
              </div>
            </div>
          </div>
          {row.notes.trim() ? (
            <div className="px-4 pb-4">
              <div className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="text-xs text-slate-500">หมายเหตุ</div>
                <div className="mt-1 whitespace-pre-wrap text-slate-700">{row.notes}</div>
              </div>
            </div>
          ) : null}
          {row.shortClosedNote.trim() ? (
            <div className="px-4 pb-4">
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
                <div className="text-xs text-red-600">เหตุผลการปิดรับไม่ครบ</div>
                <div className="mt-1 whitespace-pre-wrap text-red-800">{row.shortClosedNote}</div>
                <div className="mt-1 text-xs text-red-600">{row.shortClosedBy || '-'} · {formatDateTime(row.shortClosedAt)}</div>
              </div>
            </div>
          ) : null}
          <div className="px-4 pb-4">
            <Table>
              <TableHeader><tr><TableHead>สินค้า</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">คงเหลือ</TableHead><TableHead className="text-right">ราคา</TableHead></tr></TableHeader>
              <TableBody>
                  {row.items.map((item, index) => (
                    <TableRow key={`${item.productId}-${index}`}>
                      <TableCell>{item.productName || '-'}</TableCell>
                      <TableCell className="text-right">{formatMoney(item.qty)}</TableCell>
                      <TableCell className="text-right">{formatMoney(item.remainingQty)}</TableCell>
                      <TableCell className="text-right">{formatMoney(item.unitPrice)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 pb-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-slate-700">ประวัติ POB</div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadge(row.status)}`}>
                <span className="size-1.5 rounded-full bg-current" />
                ล่าสุด: {poBuyStatusLabel(row.status)}
              </span>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <PoBuyStatusTimeline row={row} />
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-wrap gap-2 justify-end p-4 border-t bg-slate-50 shrink-0">
          {onEdit && onCancel && row.status === 'Open' && row.qty === row.remainingQty ? (
            <>
              <UiButton
                className="font-normal border-red-200 text-red-700 hover:bg-red-50"
                type="button"
                variant="outline"
                onClick={() => {
                  onClose()
                  onCancel(row)
                }}
              >
                ยกเลิก PO
              </UiButton>
              <UiButton
                className="font-normal"
                type="button"
                variant="outline"
                onClick={() => {
                  onClose()
                  onEdit(row)
                }}
              >
                แก้ไข
              </UiButton>
            </>
          ) : null}
          {onShortClose && shouldShowShortCloseButton(row) ? (
            <UiButton
              className="font-normal border-amber-200 text-amber-700 hover:bg-amber-50"
              disabled={!canShortClosePoBuy(row)}
              title={canShortClosePoBuy(row) ? undefined : 'เปิดใช้ได้เมื่อรับสินค้าบางส่วนแล้ว'}
              type="button"
              variant="outline"
              onClick={() => {
                onClose()
                onShortClose(row)
              }}
            >
              ปิดรับไม่ครบ
            </UiButton>
          ) : null}
          <UiButton className="font-normal" disabled={isPrinting} type="button" variant="outline" onClick={() => onPrint(row)}>
            {isPrinting ? 'กำลังเตรียม...' : 'พิมพ์ PO Buy'}
          </UiButton>
          <UiButton className="font-normal" type="button" variant="outline" onClick={onClose}>ปิด</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium">{value}</div></div>
}

function SummaryLine({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1 text-sm ${strong ? 'border-t border-slate-200 pt-2 font-bold text-blue-700' : 'text-slate-700'}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
