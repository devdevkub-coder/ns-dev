'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit3, Plus, Send, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { TableActionButton, TableActionMenuItem } from '@/components/ui/TableActionButton'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { useActionConfirmation, useUnsavedChangesGuard } from '@/components/ui/FormSafetyProvider'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney, stockTransferFormSchema, todayDateInput, type StockTransferFormValues } from '@/lib/daily'
import { firstErrorKeyFromZodIssues, focusFieldError, issueMapFromZodIssues } from '@/lib/form-errors'
import { formatDateDisplay, formatThaiDateCE } from '@/lib/format'

type Option = { active: boolean | null; branch_id?: string | null; code?: string | null; id: string; name: string }
type SourceStock = { productId: string; productCode: string; productName: string; qty: number; readyQty: number; sourceUnitCost: number; sourceValue: number }
type Row = {
  canCancel: boolean
  canEdit: boolean
  canPost: boolean
  createdAt: string
  date: string
  transferDate: string
  docNo: string
  from: string
  fromBranchId: string
  fromWarehouseId: string
  id: string
  itemCount: number
  items: Array<{ lineValue: number; productId: string; productName: string; qty: number; sourceUnitCost: number }>
  notes: string
  status: 'draft' | 'posted' | 'cancelled'
  to: string
  toBranchId: string
  toWarehouseId: string
  totalQty: number
  totalValue: number
  updatedAt: string
  updatedBy: string
}
type Payload = {
  branches: Option[]
  page: number
  pageSize: number
  permissions: { canCancel: boolean; canCreate: boolean; canPost: boolean }
  products: Option[]
  rows: Row[]
  sourceStock: SourceStock[]
  summary: { totalQty: number; totalRows: number; totalValue: number }
  totalRows: number
  warehouses: Option[]
}
type StockTransferColumnKey = 'action' | 'date' | 'transferDate' | 'docNo' | 'from' | 'itemCount' | 'product' | 'status' | 'to' | 'totalQty' | 'totalValue' | 'updated'
type StockTransferSortKey = Exclude<StockTransferColumnKey, 'action'>
type SortDirection = 'asc' | 'desc'

const numberInputClass = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
const stockTransferColumns: Array<ResizableColumnDefinition<StockTransferColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'transferDate', defaultWidth: 120, minWidth: 100 },
  { key: 'product', defaultWidth: 220, minWidth: 160 },
  { key: 'from', defaultWidth: 220, minWidth: 160 },
  { key: 'to', defaultWidth: 220, minWidth: 160 },
  { key: 'itemCount', defaultWidth: 80, minWidth: 70 },
  { key: 'totalQty', defaultWidth: 120, minWidth: 95 },
  { key: 'totalValue', defaultWidth: 140, minWidth: 110 },
  { key: 'updated', defaultWidth: 180, minWidth: 150 },
  { key: 'status', defaultWidth: 110, minWidth: 95 },
  { key: 'action', defaultWidth: 72, minWidth: 64, maxWidth: 88 },
]

function compareSortValues(left: string | number, right: string | number) {
  return typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), 'th', { numeric: true })
}

function getStockTransferSortValue(row: Row, key: StockTransferSortKey) {
  if (key === 'updated') return row.updatedAt
  if (key === 'product') return formatStockTransferProductSummary(row.items)
  return row[key]
}

export function formatStockTransferProductSummary(items: Row['items']) {
  const names = items.map((item) => item.productName.trim()).filter(Boolean)
  if (names.length === 0) return '-'
  if (names.length === 1) return names[0]
  return `${names[0]} และอีก ${names.length - 1} รายการ`
}
const emptyForm: StockTransferFormValues = {
  date: todayDateInput(),
  transferDate: todayDateInput(),
  docNo: null,
  fromBranchId: '',
  fromWarehouseId: '',
  items: [{ productId: '', qty: 0 }],
  notes: null,
  submitMode: 'post',
  toBranchId: '',
  toWarehouseId: '',
}

export function isBlankStockTransferItem(
  item: Pick<StockTransferFormValues['items'][number], 'productId' | 'qty'>,
) {
  return !item.productId.trim() && Number(item.qty) === 0
}

function formSafetySnapshot(form: StockTransferFormValues) {
  return JSON.stringify(form)
}

function canManageStockTransferRow(row: Pick<Row, 'canCancel' | 'canEdit' | 'canPost' | 'status'>) {
  return row.status !== 'cancelled' && (row.canEdit || row.canPost || row.canCancel)
}

export function StockTransferPageClient() {
  const { requestConfirmation } = useActionConfirmation()
  const [data, setData] = useState<Payload>({ branches: [], page: 1, pageSize: 10, permissions: { canCancel: false, canCreate: false, canPost: false }, products: [], rows: [], sourceStock: [], summary: { totalQty: 0, totalRows: 0, totalValue: 0 }, totalRows: 0, warehouses: [] })
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [docNo, setDocNo] = useState('')
  const [detailRow, setDetailRow] = useState<Row | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelReasonError, setCancelReasonError] = useState('')
  const [editingDocNo, setEditingDocNo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<StockTransferFormValues>(emptyForm)
  const [formBaseline, setFormBaseline] = useState(() => formSafetySnapshot(emptyForm))
  const [formOpen, setFormOpen] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortKey, setSortKey] = useState<StockTransferSortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sourceStock, setSourceStock] = useState<SourceStock[]>([])
  const [sourceStockLoading, setSourceStockLoading] = useState(false)
  const [totalQtyFrom, setTotalQtyFrom] = useState('')
  const [totalQtyTo, setTotalQtyTo] = useState('')
  const columnResize = useResizableColumns('daily.stock-transfer.v5', stockTransferColumns)
  const isFormDirty = formOpen && formSafetySnapshot(form) !== formBaseline
  const { requestDiscard } = useUnsavedChangesGuard(isFormDirty)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      if (docNo.trim()) params.set('docNo', docNo.trim())
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (totalQtyFrom.trim()) params.set('totalQtyFrom', totalQtyFrom.trim())
      if (totalQtyTo.trim()) params.set('totalQtyTo', totalQtyTo.trim())
      setData(await dailyFetchJson<Payload>(`/api/stock/transfer?${params.toString()}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายการโอนสินค้าไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [dateFrom, dateTo, docNo, page, pageSize, totalQtyFrom, totalQtyTo])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, docNo, pageSize, totalQtyFrom, totalQtyTo])

  const selectedProductIds = useMemo(
    () => Array.from(new Set(form.items.map((item) => item.productId).filter(Boolean))),
    [form.items],
  )

  useEffect(() => {
    if (!formOpen || !form.fromBranchId || !form.fromWarehouseId) {
      setSourceStock([])
      return
    }
    const controller = new AbortController()
    setSourceStockLoading(true)
    const params = new URLSearchParams({
      mode: 'source-stock',
      sourceBranchId: form.fromBranchId,
      sourceWarehouseId: form.fromWarehouseId,
    })
    if (selectedProductIds.length === 1) params.set('sourceProductId', selectedProductIds[0] ?? '')
    void dailyFetchJson<{ sourceStock: SourceStock[] }>(`/api/stock/transfer?${params.toString()}`, { signal: controller.signal })
      .then((payload) => setSourceStock(payload.sourceStock))
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : 'โหลด stock ต้นทางไม่ได้')
      })
      .finally(() => {
        if (!controller.signal.aborted) setSourceStockLoading(false)
      })
    return () => controller.abort()
  }, [form.fromBranchId, form.fromWarehouseId, formOpen, selectedProductIds])

  const branchOptions = useMemo(() => data.branches.filter((item) => item.active !== false), [data.branches])
  const destinationBranchOptions = useMemo(() => {
    return branchOptions.filter((branch) => branch.id !== form.fromBranchId)
  }, [branchOptions, form.fromBranchId])
  const productOptions = useMemo(() => data.products.filter((product) => product.active !== false), [data.products])
  const sourceWarehouseOptions = form.fromBranchId
    ? data.warehouses.filter((item) => item.active !== false && item.branch_id === form.fromBranchId)
    : []
  const destinationWarehouseOptions = form.toBranchId
    ? data.warehouses.filter((item) => item.active !== false && item.branch_id === form.toBranchId)
    : []
  const canChooseProducts = Boolean(form.fromBranchId && form.fromWarehouseId && form.toBranchId && form.toWarehouseId)
  const sourceStockByProductId = useMemo(() => new Map(sourceStock.map((row) => [row.productId, row])), [sourceStock])

  const totalPages = Math.max(1, Math.ceil(data.totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const sortedRows = useMemo(() => {
    if (!sortKey) return data.rows

    return [...data.rows].sort((left, right) => {
      const result = compareSortValues(getStockTransferSortValue(left, sortKey), getStockTransferSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [data.rows, sortDirection, sortKey])
  const hasRowActions = useMemo(
    () => sortedRows.some((row) => canManageStockTransferRow(row)),
    [sortedRows],
  )
  const visibleColumns = useMemo(
    () => stockTransferColumns.filter((column) => hasRowActions || column.key !== 'action'),
    [hasRowActions],
  )
  const hasFilters = Boolean(docNo.trim() || dateFrom || dateTo || totalQtyFrom.trim() || totalQtyTo.trim())

  function clearFilters() {
    setDocNo('')
    setDateFrom('')
    setDateTo('')
    setTotalQtyFrom('')
    setTotalQtyTo('')
  }

  function handleSort(key: StockTransferSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  function openDetail(row: Row) {
    setDetailRow(row)
  }

  function handleRowKeyDown(event: React.KeyboardEvent, row: Row) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openDetail(row)
  }
  function updateForm<K extends keyof StockTransferFormValues>(key: K, value: StockTransferFormValues[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'fromBranchId') next.fromWarehouseId = ''
      if (key === 'toBranchId') next.toWarehouseId = ''
      if (key === 'fromBranchId' || key === 'fromWarehouseId' || key === 'toBranchId' || key === 'toWarehouseId') {
        next.items = [{ productId: '', qty: 0 }]
      }
      return next
    })
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  function updateItem(index: number, key: keyof StockTransferFormValues['items'][number], value: string | number) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setFieldErrors((current) => ({ ...current, [`items.${index}.${key}`]: '' }))
  }

  function requestRemoveItem(index: number) {
    if (form.items.length <= 1) return
    const target = form.items[index]
    if (!target) return
    const remove = () => {
      setForm((current) => ({
        ...current,
        items: current.items.filter((_entry, entryIndex) => entryIndex !== index),
      }))
    }
    if (isBlankStockTransferItem(target)) {
      remove()
      return
    }
    requestConfirmation({
      confirmLabel: 'ยืนยันลบรายการ',
      description: 'ต้องการลบรายการโอนสินค้านี้หรือไม่? สินค้าและจำนวนที่กรอกในแถวนี้จะหายไป',
      destructive: true,
      onConfirm: remove,
      title: 'ยืนยันการลบรายการโอนสินค้า',
    })
  }

  function openCreateForm() {
    if (!data.permissions.canCreate) return
    const nextForm = { ...emptyForm, date: todayDateInput(), transferDate: todayDateInput(), items: [{ productId: '', qty: 0 }] }
    setEditingDocNo(null)
    setForm(nextForm)
    setFormBaseline(formSafetySnapshot(nextForm))
    setFieldErrors({})
    setError(null)
    setFormOpen(true)
  }

  function openEditForm(row: Row) {
    const nextForm: StockTransferFormValues = {
      date: row.date,
      transferDate: row.transferDate || '',
      docNo: row.docNo,
      fromBranchId: row.fromBranchId,
      fromWarehouseId: row.fromWarehouseId,
      items: row.items.map((item) => ({ productId: item.productId, qty: item.qty })),
      notes: row.notes || null,
      submitMode: 'draft',
      toBranchId: row.toBranchId,
      toWarehouseId: row.toWarehouseId,
    }
    setEditingDocNo(row.docNo)
    setForm(nextForm)
    setFormBaseline(formSafetySnapshot(nextForm))
    setFieldErrors({})
    setError(null)
    setFormOpen(true)
  }

  const closeForm = useCallback(() => {
    if (isSaving) return
    requestDiscard(() => {
      setFormOpen(false)
      setEditingDocNo(null)
    })
  }, [isSaving, requestDiscard])

  useEffect(() => {
    if (!formOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('[role="dialog"]')) return
      event.preventDefault()
      closeForm()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [closeForm, formOpen])

  async function submitForm(mode: 'draft' | 'post') {
    const parsed = stockTransferFormSchema.safeParse({ ...form, submitMode: mode })
    if (!parsed.success) {
      const nextFieldErrors = issueMapFromZodIssues(parsed.error.issues)
      setFieldErrors(nextFieldErrors)
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      focusFieldError(firstErrorKeyFromZodIssues(parsed.error.issues))
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      if (editingDocNo) {
        await dailyFetchJson('/api/stock/transfer', {
          body: JSON.stringify({ ...parsed.data, action: mode === 'post' ? 'post' : 'edit', docNo: editingDocNo }),
          method: 'PATCH',
        })
      } else {
        await dailyFetchJson('/api/stock/transfer', { body: JSON.stringify(parsed.data), method: 'POST' })
      }
      setFormBaseline(formSafetySnapshot(parsed.data))
      setFormOpen(false)
      setEditingDocNo(null)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกโอนสินค้าไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  function cancelDraft(row: Row) {
    if (!row.canCancel) return
    setCancelTarget(row)
    setCancelReason('')
    setCancelReasonError('')
  }

  async function cancelDraftConfirmed(row: Row, reason: string) {
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/stock/transfer', {
        body: JSON.stringify({ action: 'cancel', docNo: row.docNo, reason }),
        method: 'PATCH',
      })
      setCancelTarget(null)
      setCancelReason('')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิกเอกสารไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  function submitCancel() {
    const reason = cancelReason.trim()
    if (!reason) {
      setCancelReasonError('กรุณาระบุเหตุผลการยกเลิก')
      return
    }
    if (!cancelTarget) return
    void cancelDraftConfirmed(cancelTarget, reason)
  }

  async function postDraft(row: Row) {
    if (!row.canPost) return
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/stock/transfer', {
        body: JSON.stringify({
          action: 'post',
          date: row.date,
          transferDate: row.transferDate || row.date,
          docNo: row.docNo,
          fromBranchId: row.fromBranchId,
          fromWarehouseId: row.fromWarehouseId,
          items: row.items.map((item) => ({ productId: item.productId, qty: item.qty })),
          notes: row.notes || null,
          toBranchId: row.toBranchId,
          toWarehouseId: row.toWarehouseId,
        }),
        method: 'PATCH',
      })
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ส่งเข้าสต๊อกไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const formTotalQty = form.items.reduce((sum, item) => sum + item.qty, 0)
  const formTotalValue = form.items.reduce((sum, item) => {
    const source = sourceStockByProductId.get(item.productId)
    return sum + item.qty * (source?.sourceUnitCost ?? 0)
  }, 0)

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden md:block rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="h-9 min-w-[260px] flex-1"
            placeholder="ค้นหาเลขที่เอกสาร..."
            type="search"
            value={docNo}
            onChange={(event) => setDocNo(event.target.value)}
          />
          <label className="text-xs text-slate-500">วันที่:</label>
          <DatePickerInput className="w-[130px] h-9" value={dateFrom} onChange={setDateFrom} />
          <span className="text-slate-400">→</span>
          <DatePickerInput className="w-[130px] h-9" value={dateTo} onChange={setDateTo} />
          <label className="text-xs text-slate-500">น้ำหนัก:</label>
          <Input
            className={`h-9 w-[100px] text-right tabular-nums ${numberInputClass}`}
            inputMode="decimal"
            placeholder="นน. จาก"
            value={totalQtyFrom}
            onChange={(event) => setTotalQtyFrom(event.target.value)}
          />
          <span className="text-slate-400">→</span>
          <Input
            className={`h-9 w-[100px] text-right tabular-nums ${numberInputClass}`}
            inputMode="decimal"
            placeholder="นน. ถึง"
            value={totalQtyTo}
            onChange={(event) => setTotalQtyTo(event.target.value)}
          />
          {hasFilters ? (
            <Button size="sm" type="button" variant="secondary" className="h-9" onClick={clearFilters}>✕ ล้าง</Button>
          ) : null}
        </div>
        <div className="mt-2 hidden justify-end md:flex">
          {data.permissions.canCreate ? <Button size="sm" type="button" className="h-9 bg-emerald-600 font-normal text-white hover:bg-emerald-700" onClick={openCreateForm}>
            <Plus className="mr-1 h-4 w-4" />โอนสินค้า
          </Button> : null}
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm md:hidden">
        <div className="flex gap-2 items-center">
          <Input
            className="min-w-[200px] flex-1 h-9"
            placeholder="ค้นหาเลขที่เอกสาร..."
            type="search"
            value={docNo}
            onChange={(event) => setDocNo(event.target.value)}
          />
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
          title="ตัวกรองรายการโอนสินค้า"
          visibleClassName="md:hidden"
          onClose={() => setShowMobileFilters(false)}
          footer={(
            <>
              <Button
                type="button"
                variant="outline"
                className="h-11 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  clearFilters()
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </Button>
              <Button type="button" className="h-11 bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700" onClick={() => setShowMobileFilters(false)}>
                ใช้ตัวกรอง
              </Button>
            </>
          )}
        >
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
                <div className="flex items-center gap-2">
                  <DatePickerInput className="h-9 flex-1" value={dateFrom} onChange={setDateFrom} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput className="h-9 flex-1" value={dateTo} onChange={setDateTo} />
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ช่วงน้ำหนัก (กก.)</span>
                <div className="flex items-center gap-2">
                  <Input
                    className={`h-9 flex-1 text-right tabular-nums ${numberInputClass}`}
                    inputMode="decimal"
                    placeholder="นน. จาก"
                    value={totalQtyFrom}
                    onChange={(event) => setTotalQtyFrom(event.target.value)}
                  />
                  <span className="text-slate-400">→</span>
                  <Input
                    className={`h-9 flex-1 text-right tabular-nums ${numberInputClass}`}
                    inputMode="decimal"
                    placeholder="นน. ถึง"
                    value={totalQtyTo}
                    onChange={(event) => setTotalQtyTo(event.target.value)}
                  />
                </div>
              </div>
        </MobileFilterSheet>
      ) : null}

      {/* FAB for mobile creation */}
      {data.permissions.canCreate ? <button
        aria-label="โอนสินค้า"
        className="h-14 w-14 rounded-full bg-emerald-600 text-white shadow-lg fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 md:hidden flex items-center justify-center hover:bg-emerald-700"
        type="button"
        onClick={openCreateForm}
      >
        <Plus className="h-6 w-6" />
      </button> : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{data.summary.totalRows.toLocaleString('th-TH')}</span> รายการ
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? <Button className="h-9" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
          <PageSizeDropdown value={pageSize} onChange={setPageSize} />
          <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
        </div>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 animate-fade-in" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm() }}>
          <form noValidate data-combobox-portal-root="true" className="relative my-auto w-full max-w-5xl overflow-hidden rounded-md border-0 bg-slate-900 shadow-xl outline-none focus:outline-none flex flex-col max-h-[90vh]" onSubmit={(event) => event.preventDefault()}>
            <div data-ns-dialog-header className="flex flex-wrap items-start justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4 text-white shrink-0">
              <div>
                <h3 className="font-bold text-slate-100 text-lg">{editingDocNo ? 'แก้ไขรายการโอนสินค้า' : 'โอนสินค้าระหว่างสาขา'}</h3>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Button disabled={isSaving} size="sm" type="button" variant="outline" className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" onClick={closeForm}>ยกเลิก</Button>
                {data.permissions.canCreate ? <Button disabled={isSaving} size="sm" type="button" variant="outline" className="h-9 border-slate-700 bg-slate-800 font-normal text-white hover:bg-slate-700 hover:text-white" onClick={() => submitForm('draft')}>{isSaving ? 'กำลังบันทึก...' : 'บันทึกแบบร่าง'}</Button> : null}
                {data.permissions.canPost ? <Button disabled={isSaving} size="sm" type="button" className="h-9 bg-emerald-600 px-5 font-normal text-white hover:bg-emerald-700" onClick={() => submitForm('post')}><Send className="mr-1 h-4 w-4" />{isSaving ? 'กำลังส่ง...' : 'ส่งเข้าสต๊อก'}</Button> : null}
              </div>
            </div>

            <div className="max-h-[76vh] overflow-y-auto bg-slate-50 p-4 sm:p-5 space-y-4 text-sm flex flex-col flex-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm col-span-2 md:col-span-1">
                  <h4 className="mb-3 font-bold text-slate-700">1. ต้นทาง</h4>
                  <div className="grid gap-3">
                    <SelectField displayMode="name" error={fieldErrors.fromBranchId} errorKey="fromBranchId" label="สาขาต้นทาง *" options={branchOptions} placeholder="เลือกสาขาต้นทาง" value={form.fromBranchId} onChange={(value) => updateForm('fromBranchId', value)} />
                    <SelectField
                      disabled={!form.fromBranchId}
                      displayMode="name"
                      error={fieldErrors.fromWarehouseId}
                      errorKey="fromWarehouseId"
                      label="คลังต้นทาง *"
                      options={sourceWarehouseOptions}
                      placeholder={form.fromBranchId ? 'เลือกคลังต้นทาง' : 'เลือกสาขาต้นทางก่อน'}
                      value={form.fromWarehouseId}
                      onChange={(value) => updateForm('fromWarehouseId', value)}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm col-span-2 md:col-span-1">
                  <h4 className="mb-3 font-bold text-slate-700">2. ปลายทาง</h4>
                  <div className="grid gap-3">
                    <SelectField displayMode="name" error={fieldErrors.toBranchId} errorKey="toBranchId" label="สาขาปลายทาง *" options={destinationBranchOptions} placeholder="เลือกสาขาปลายทาง" value={form.toBranchId} onChange={(value) => updateForm('toBranchId', value)} />
                    <SelectField
                      disabled={!form.toBranchId}
                      displayMode="name"
                      error={fieldErrors.toWarehouseId}
                      errorKey="toWarehouseId"
                      label="คลังปลายทาง *"
                      options={destinationWarehouseOptions}
                      placeholder={form.toBranchId ? 'เลือกคลังปลายทาง' : 'เลือกสาขาปลายทางก่อน'}
                      value={form.toWarehouseId}
                      onChange={(value) => updateForm('toWarehouseId', value)}
                    />
                  </div>
                </div>
              </div>

              <div className="order-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-slate-700">3. รายการสินค้า ({form.items.length})</h4>
                    <p className="mt-1 text-xs text-slate-500">{sourceStockLoading ? 'กำลังโหลด stock ต้นทาง' : 'คงเหลือจริงหลังหักรายการรอออก · ไม่รวม WTI รอเข้า'}</p>
                  </div>
                  <Button disabled={!canChooseProducts} size="sm" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, { productId: '', qty: 0 }] }))}>+ เพิ่มรายการ</Button>
                </div>
                {fieldErrors.items ? <div className="mb-2 text-xs text-red-600">{fieldErrors.items}</div> : null}
                {/* Desktop View (Table) */}
                <div className="hidden md:block overflow-x-auto rounded-md border border-slate-200/60 bg-white shadow-sm overflow-hidden">
                  <table className="ns-table w-full min-w-[920px] text-sm">
                    <thead className="border-b border-slate-100 bg-slate-100 text-slate-600">
                      <tr>
                        <th className="p-2 text-left">สินค้า</th>
                        <th className="p-2 text-right">คงเหลือจริงต้นทาง</th>
                        <th className="p-2 text-right">มูลค่า/kg</th>
                        <th className="p-2 text-right">น้ำหนัก</th>
                        <th className="p-2 text-right">มูลค่ารวม</th>
                        <th className="p-2 text-center">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {form.items.map((item, index) => {
                        const source = sourceStockByProductId.get(item.productId)
                        const lineValue = item.qty * (source?.sourceUnitCost ?? 0)
                        return (
                          <tr key={index} className="align-top hover:bg-slate-50">
                            <td className="p-2">
                              <SearchableProductField
                                error={fieldErrors[`items.${index}.productId`]}
                                errorKey={`items.${index}.productId`}
                                options={productOptions}
                                disabled={!canChooseProducts}
                                value={item.productId}
                                onChange={(value) => updateItem(index, 'productId', value)}
                              />
                            </td>
                            <td className="p-2 pt-4 text-right tabular-nums text-slate-700">{source ? `${formatMoney(source.readyQty)} กก.` : '-'}</td>
                            <td className="p-2 pt-4 text-right tabular-nums text-slate-700">{source ? formatMoney(source.sourceUnitCost) : '-'}</td>
                            <td className="p-2">
                              <InputField
                                error={fieldErrors[`items.${index}.qty`]}
                                errorKey={`items.${index}.qty`}
                                inputClassName={`text-right tabular-nums ${numberInputClass}`}
                                label="น้ำหนัก *"
                                type="number"
                                value={item.qty ? String(item.qty) : ''}
                                onChange={(value) => updateItem(index, 'qty', Number(value || 0))}
                                hideLabel={true}
                              />
                            </td>
                            <td className="p-2 pt-4 text-right tabular-nums font-medium text-emerald-700">{formatMoney(lineValue)}</td>
                            <td className="p-2 text-center">
                              <TableActionButton
                                disabled={form.items.length <= 1}
                                label="ลบรายการ"
                                menu={<TableActionMenuItem onSelect={() => requestRemoveItem(index)}>ลบรายการ</TableActionMenuItem>}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 font-semibold">
                      <tr>
                        <td className="p-2 text-right text-slate-600" colSpan={3}>รวม</td>
                        <td className="p-2 text-right tabular-nums text-blue-700">{formatMoney(formTotalQty)} กก.</td>
                        <td className="p-2 text-right tabular-nums text-emerald-700">{formatMoney(formTotalValue)}</td>
                        <td className="p-2" />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Mobile View (Stacked Cards) */}
                <div className="md:hidden space-y-3">
                  {form.items.map((item, index) => {
                    const source = sourceStockByProductId.get(item.productId)
                    const lineValue = item.qty * (source?.sourceUnitCost ?? 0)
                    return (
                      <div key={index} className="rounded-xl border border-slate-200 p-4 space-y-3 relative bg-slate-50/50">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                          <span className="font-semibold text-slate-700 text-xs">รายการที่ {index + 1}</span>
                          <Button
                            disabled={form.items.length <= 1}
                            size="xs"
                            type="button"
                            variant="outline"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 h-7 px-2.5"
                            onClick={() => requestRemoveItem(index)}
                          >
                            ลบ
                          </Button>
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1">สินค้า *</label>
                            <SearchableProductField
                              error={fieldErrors[`items.${index}.productId`]}
                              errorKey={`items.${index}.productId`}
                              options={productOptions}
                              disabled={!canChooseProducts}
                              value={item.productId}
                              onChange={(value) => updateItem(index, 'productId', value)}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <span className="block text-xs font-semibold text-slate-500 mb-1">คงเหลือจริงต้นทาง</span>
                              <span className="text-xs font-medium text-slate-700 tabular-nums block bg-white border border-slate-200 rounded px-2.5 py-1.5 h-8 truncate">
                                {source ? `${formatMoney(source.readyQty)} กก.` : '-'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-xs font-semibold text-slate-500 mb-1">มูลค่า / กก.</span>
                              <span className="text-xs font-medium text-slate-700 tabular-nums block bg-white border border-slate-200 rounded px-2.5 py-1.5 h-8 truncate">
                                {source ? `${formatMoney(source.sourceUnitCost)} บ.` : '-'}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <span className="block text-xs font-semibold text-slate-500 mb-1">น้ำหนัก *</span>
                              <InputField
                                error={fieldErrors[`items.${index}.qty`]}
                                errorKey={`items.${index}.qty`}
                                inputClassName={`text-right tabular-nums h-8 text-xs ${numberInputClass}`}
                                label="น้ำหนัก *"
                                type="number"
                                value={item.qty ? String(item.qty) : ''}
                                onChange={(value) => updateItem(index, 'qty', Number(value || 0))}
                                hideLabel={true}
                              />
                            </div>
                            <div>
                              <span className="block text-xs font-semibold text-slate-500 mb-1">มูลค่ารวม</span>
                              <span className="text-xs font-bold text-emerald-700 tabular-nums block bg-white border border-slate-200 rounded px-2.5 py-1.5 h-8 truncate">
                                {formatMoney(lineValue)} บ.
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Mobile Footer (Totals) */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1.5 font-semibold">
                    <div className="flex justify-between">
                      <span className="text-slate-500">น้ำหนักรวม:</span>
                      <span className="text-blue-700 tabular-nums">{formatMoney(formTotalQty)} กก.</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-200/60 pt-1.5">
                      <span className="text-slate-500">มูลค่ารวม:</span>
                      <span className="text-emerald-700 tabular-nums">{formatMoney(formTotalValue)} บาท</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="order-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h4 className="mb-3 font-bold text-slate-700">4. หมายเหตุ</h4>
                <FormField error={fieldErrors.notes} errorKey="notes" label="หมายเหตุ">
                  <textarea
                    data-error-key="notes"
                    className={`w-full rounded-md border px-3 py-2 ${fieldErrors.notes ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-300 bg-white'}`}
                    rows={3}
                    value={form.notes ?? ''}
                    onChange={(event) => updateForm('notes', event.target.value || null)}
                  />
                </FormField>
              </div>

              {form.fromBranchId && form.fromWarehouseId && form.items.some(item => item.productId) ? (
                <div className="order-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm">
                  <h5 className="mb-3 font-bold text-indigo-800 text-xs flex items-center gap-1.5">
                    📦 ข้อมูล Stock ปัจจุบันของสินค้าที่จะโอนย้าย
                  </h5>
                  {sourceStockLoading ? (
                    <div className="text-center py-4 text-xs text-slate-500">กำลังโหลด stock ต้นทาง...</div>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-indigo-100 bg-white">
                      <table className="ns-table w-full text-xs">
                        <thead className="bg-indigo-50 text-indigo-700">
                          <tr>
                            <th className="p-2 text-left">สินค้า</th>
                            <th className="p-2 text-right">จำนวนคงเหลือจริง (กก.)</th>
                            <th className="p-2 text-right">ราคาเฉลี่ย/กก.</th>
                            <th className="p-2 text-right">รวมมูลค่า</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-indigo-50/50">
                          {Array.from(new Set(form.items.map(item => item.productId).filter(Boolean))).map((productId, index) => {
                            const stockItem = sourceStockByProductId.get(productId)
                            const prod = productOptions.find(p => p.id === productId)
                            const name = prod?.name ?? stockItem?.productName ?? 'ไม่ระบุสินค้า'
                            const code = prod?.code ?? stockItem?.productCode ?? ''
                            return (
                              <tr key={index} className="hover:bg-indigo-50/10">
                                <td className="p-2 font-medium text-slate-700">
                                  {code ? `${code} - ${name}` : name}
                                </td>
                                <td className="p-2 text-right font-bold text-slate-900 tabular-nums">
                                  {stockItem ? `${formatMoney(stockItem.readyQty)} กก.` : '0 กก.'}
                                </td>
                                <td className="p-2 text-right text-slate-500 tabular-nums">
                                  {stockItem ? `${formatMoney(stockItem.sourceUnitCost)} บ.` : '-'}
                                </td>
                                <td className="p-2 text-right font-bold text-indigo-700 tabular-nums">
                                  {stockItem ? `${formatMoney(stockItem.sourceValue)} บ.` : '-'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

          </form>
        </div>
      ) : null}

      {detailRow ? (
        <Dialog open onOpenChange={(open) => { if (!open) setDetailRow(null) }}>
          <DialogContent hideClose mobileAppShell={false} aria-labelledby="stock-transfer-detail-title" className="max-w-5xl rounded-md !p-0 overflow-hidden flex max-h-[90vh] flex-col bg-slate-900 border-0 outline-none focus:outline-none">
            <DialogHeader className="shrink-0 rounded-t-md bg-slate-900 px-5 py-4 text-white">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <DialogTitle id="stock-transfer-detail-title" className="text-lg text-white">รายละเอียดโอนสินค้าระหว่างสาขา {detailRow.docNo}</DialogTitle>
                  <DialogDescription className="text-slate-300">ข้อมูลเอกสาร การเคลื่อนไหวสินค้า และต้นทุนจากรายการโอน</DialogDescription>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {detailRow.status !== 'cancelled' ? (
                    <>
                      <Button className="h-9 border-slate-700 bg-slate-800 font-normal text-white hover:bg-slate-700 hover:text-white" disabled={!detailRow.canEdit || isSaving} type="button" variant="outline" onClick={() => {
                        const row = detailRow
                        setDetailRow(null)
                        openEditForm(row)
                      }}>แก้ไข</Button>
                      <Button className="h-9 border-slate-700 bg-slate-800 font-normal text-white hover:bg-slate-700 hover:text-white" disabled={!detailRow.canPost || isSaving} type="button" variant="outline" onClick={() => {
                        const row = detailRow
                        setDetailRow(null)
                        void postDraft(row)
                      }}>ยืนยันโอนสินค้า</Button>
                      <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" disabled={!detailRow.canCancel || isSaving} type="button" variant="outline" onClick={() => {
                        const row = detailRow
                        setDetailRow(null)
                        cancelDraft(row)
                      }}>ยกเลิก</Button>
                    </>
                  ) : null}
                  <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => setDetailRow(null)}>ปิด</Button>
                </div>
              </div>
            </DialogHeader>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 sm:p-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h4 className="font-bold text-slate-700">ข้อมูลเอกสาร</h4>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                  <SummaryCell label="เลขที่เอกสาร" value={detailRow.docNo} />
                  <SummaryCell label="สถานะ" value={statusLabel(detailRow.status)} />
                  <SummaryCell label="วันที่เอกสาร" value={formatDateDisplay(detailRow.date)} />
                  <SummaryCell label="วันที่โอนย้าย" value={detailRow.transferDate ? formatDateDisplay(detailRow.transferDate) : '-'} />
                  <SummaryCell label="สร้างรายการเมื่อ" value={formatDateTime(detailRow.createdAt)} />
                  <SummaryCell label="แก้ไขล่าสุดเมื่อ" value={formatDateTime(detailRow.updatedAt)} />
                  <SummaryCell label="แก้ไขล่าสุดโดย" value={detailRow.updatedBy || '-'} />
                  <SummaryCell label="อ้างอิง Stock Ledger" value={`ST / ${detailRow.docNo}`} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 shadow-sm">
                  <div className="text-xs font-semibold text-red-700">ต้นทาง</div>
                  <div className="mt-1 font-semibold text-slate-800">{detailRow.from}</div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
                  <div className="text-xs font-semibold text-emerald-700">ปลายทาง</div>
                  <div className="mt-1 font-semibold text-slate-800">{detailRow.to}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3 sm:px-5">
                  <h4 className="font-bold text-slate-700">รายละเอียดสินค้า ({detailRow.itemCount} รายการ)</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="ns-table w-full min-w-[680px] text-sm">
                    <thead className="border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
                      <tr>
                        <th className="p-3 text-left">สินค้า</th>
                        <th className="p-3 text-right">จำนวน</th>
                        <th className="p-3 text-right">ต้นทุน/กก.</th>
                        <th className="p-3 text-right">มูลค่ารวม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detailRow.items.map((item, index) => (
                        <tr key={`${item.productId}-${index}`}>
                          <td className="p-3 font-medium text-slate-800">{item.productName}</td>
                          <td className="p-3 text-right tabular-nums text-slate-700">{formatMoney(item.qty)} กก.</td>
                          <td className="p-3 text-right tabular-nums text-slate-700">{formatMoney(item.sourceUnitCost)}</td>
                          <td className="p-3 text-right tabular-nums font-semibold text-emerald-700">{formatMoney(item.lineValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
                      <tr>
                        <td className="p-3 text-right text-slate-600">รวม</td>
                        <td className="p-3 text-right tabular-nums text-slate-800">{formatMoney(detailRow.totalQty)} กก.</td>
                        <td className="p-3" />
                        <td className="p-3 text-right tabular-nums text-emerald-700">{formatMoney(detailRow.totalValue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">การเคลื่อนไหว Stock</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    <div>ต้นทาง: ตัดออก {formatMoney(detailRow.totalQty)} กก.</div>
                    <div>ปลายทาง: เพิ่มเข้า {formatMoney(detailRow.totalQty)} กก.</div>
                    <div className="text-xs text-slate-500">Ledger ref: ST / {detailRow.docNo}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">หมายเหตุ</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{detailRow.notes || '-'}</div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

      {cancelTarget ? (
        <Dialog open onOpenChange={(open) => { if (!open && !isSaving) setCancelTarget(null) }}>
          <DialogContent hideClose mobileAppShell={false} aria-labelledby="stock-transfer-cancel-title" className="max-w-lg rounded-md !p-0 overflow-hidden flex bg-slate-900 border-0 outline-none focus:outline-none">
            <DialogHeader className="rounded-t-md bg-slate-900 px-5 py-4 text-white">
              <DialogTitle id="stock-transfer-cancel-title" className="text-lg text-white">ยกเลิกการโอนสินค้า {cancelTarget.docNo}</DialogTitle>
              <DialogDescription className="text-slate-300">
                {cancelTarget.status === 'posted'
                  ? 'ระบบจะตีกลับ Stock จากปลายทางกลับต้นทางทันที และไม่สามารถย้อนกลับการยกเลิกได้'
                  : 'เอกสารแบบร่างยังไม่มีผลกับ Stock'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 bg-slate-50 p-4 sm:p-5" data-ns-field-scope="entry">
              <label className="block text-sm font-semibold text-slate-700" htmlFor="stock-transfer-cancel-reason">
                เหตุผลการยกเลิก <span className="text-red-600">*</span>
              </label>
              <textarea
                id="stock-transfer-cancel-reason"
                aria-invalid={Boolean(cancelReasonError)}
                className={`min-h-[100px] w-full resize-y rounded-md border bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 ${cancelReasonError ? 'border-red-400' : 'border-slate-300'}`}
                maxLength={500}
                placeholder="ระบุเหตุผลการยกเลิก"
                value={cancelReason}
                onChange={(event) => {
                  setCancelReason(event.target.value)
                  if (cancelReasonError) setCancelReasonError('')
                }}
              />
              {cancelReasonError ? <div className="text-xs text-red-700">{cancelReasonError}</div> : null}
              <div className="text-right text-xs text-slate-400">{cancelReason.length}/500</div>
            </div>
            <DialogFooter className="shrink-0 bg-white">
              <Button disabled={isSaving} type="button" variant="secondary" onClick={() => setCancelTarget(null)}>ปิด</Button>
              <Button disabled={isSaving} type="button" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={submitCancel}>
                {isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <div className="block space-y-3 md:hidden">
        {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && sortedRows.map((row) => (
          <div
            key={row.id}
            aria-label={`เปิดรายละเอียด ${row.docNo}`}
            className="cursor-pointer rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={() => openDetail(row)}
            onKeyDown={(event) => handleRowKeyDown(event, row)}
            role="button"
            tabIndex={0}
          >
            <div className="mb-2 flex items-start justify-between">
              <span className="text-center font-mono font-bold text-slate-800 whitespace-nowrap">{row.docNo}</span>
              <StatusBadge status={row.status} />
            </div>
            <div className="text-center text-xs text-slate-500 whitespace-nowrap">
              วันที่เอกสาร: {formatDateDisplay(row.date)}
              {row.transferDate ? ` · วันที่โอน: ${formatDateDisplay(row.transferDate)}` : ''}
            </div>
            <div className="my-3 text-xs text-slate-600">
              <span className="font-semibold text-red-600">{row.from}</span>
              <span className="mx-1 text-slate-400">→</span>
              <span className="font-semibold text-emerald-700">{row.to}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
              <SummaryCell label="สินค้า" value={formatStockTransferProductSummary(row.items)} />
              <SummaryCell label="น้ำหนักรวม" value={`${formatMoney(row.totalQty)} กก.`} />
              <SummaryCell label="มูลค่ารวม" value={`${formatMoney(row.totalValue)} บาท`} />
              <SummaryCell label="รายการ" value={`${row.itemCount.toLocaleString('th-TH')} รายการ`} />
              <SummaryCell label="วันที่สร้างรายการ" value={formatDateTime(row.createdAt)} />
            </div>
            {canManageStockTransferRow(row) ? (
              <div className="mt-3 flex justify-end gap-2" onClick={(event) => event.stopPropagation()}>
                <TableActionButton mobileLabel menu={(
                  <>
                    <TableActionMenuItem disabled={!row.canEdit || isSaving} onSelect={() => openEditForm(row)}>แก้ไข</TableActionMenuItem>
                    <TableActionMenuItem disabled={!row.canPost || isSaving} onSelect={() => postDraft(row)}>ยืนยันโอนสินค้า</TableActionMenuItem>
                    <TableActionMenuItem disabled={!row.canCancel || isSaving} onSelect={() => cancelDraft(row)}>ยกเลิก</TableActionMenuItem>
                  </>
                )} />
              </div>
            ) : null}
          </div>
        ))}
        {!isLoading && data.rows.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 shadow">ยังไม่มีรายการ</div> : null}
      </div>

      <div className="hidden md:block">
        <Table style={{ minWidth: columnResize.tableMinWidth, maxWidth: columnResize.tableMaxWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {visibleColumns.map((column) => {
              const style = columnResize.getColumnStyle(column.key)
              return <col key={column.key} style={style} />
            })}
          </colgroup>
          <TableHeader>
            <tr>
              <ResizableTableHead align="center" label="เลขที่" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="docNo" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} />
              <ResizableTableHead align="center" label="วันที่เอกสาร" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="date" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('date', 'วันที่เอกสาร')} />
              <ResizableTableHead align="center" label="วันที่โอนย้าย" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="transferDate" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('transferDate', 'วันที่โอนย้าย')} />
              <ResizableTableHead label="สินค้า" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="product" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('product', 'สินค้า')} />
              <ResizableTableHead label="จาก" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="from" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('from', 'จาก')} />
              <ResizableTableHead label="ไป" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="to" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('to', 'ไป')} />
              <ResizableTableHead align="right" label="รายการ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="itemCount" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('itemCount', 'รายการ')} />
              <ResizableTableHead align="right" label="น้ำหนักรวม" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="totalQty" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('totalQty', 'น้ำหนักรวม')} />
              <ResizableTableHead align="right" label="มูลค่ารวม" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="totalValue" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('totalValue', 'มูลค่ารวม')} />
              <ResizableTableHead align="center" label="วันที่สร้างรายการ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="updated" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('updated', 'วันที่สร้างรายการ')} />
              <ResizableTableHead align="center" label="สถานะ" activeSortKey={sortKey ?? undefined} direction={sortDirection} sortKey="status" onSort={handleSort} resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
              {hasRowActions ? <ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} /> : null}
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={visibleColumns.length}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
            {!isLoading && sortedRows.map((row) => (
              <TableRow
                key={row.id}
                aria-label={`เปิดรายละเอียด ${row.docNo}`}
                className="cursor-pointer hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                onClick={() => openDetail(row)}
                onKeyDown={(event) => handleRowKeyDown(event, row)}
                role="button"
                tabIndex={0}
              >
                <TableCell className="whitespace-nowrap text-center font-mono text-xs font-semibold text-slate-700">{row.docNo}</TableCell>
                <TableCell className="whitespace-nowrap text-center text-xs font-semibold text-slate-700">{formatDateDisplay(row.date)}</TableCell>
                <TableCell className="whitespace-nowrap text-center text-xs font-semibold text-slate-700">{row.transferDate ? formatDateDisplay(row.transferDate) : '-'}</TableCell>
                <TableCell className="text-xs text-slate-700" title={row.items.map((item) => item.productName).join(', ')}>{formatStockTransferProductSummary(row.items)}</TableCell>
                <TableCell className="text-xs font-semibold text-red-600">{row.from}</TableCell>
                <TableCell className="text-xs font-semibold text-emerald-700">{row.to}</TableCell>
                <TableCell className="whitespace-nowrap pr-4 text-right text-xs font-semibold tabular-nums text-slate-700">{row.itemCount.toLocaleString('th-TH')}</TableCell>
                <TableCell className="whitespace-nowrap pr-4 text-right text-xs font-semibold tabular-nums text-slate-700">{formatMoney(row.totalQty)} กก.</TableCell>
                <TableCell className="whitespace-nowrap pr-4 text-right text-xs font-semibold tabular-nums text-emerald-700">{formatMoney(row.totalValue)}</TableCell>
                <TableCell className="text-center text-xs text-slate-600">
                  <div className="truncate font-semibold text-slate-700">{row.updatedBy || '-'}</div>
                  <div className="whitespace-nowrap text-slate-400">{formatDateTime(row.updatedAt)}</div>
                </TableCell>
                <TableCell className="text-center"><StatusBadge status={row.status} /></TableCell>
                {hasRowActions ? (
                  <TableCell className="whitespace-nowrap text-center" onClick={(event) => event.stopPropagation()}>
                    {canManageStockTransferRow(row) ? <div className="flex justify-center gap-1">
                      <RowActionButton
                        menu={(
                          <>
                            <TableActionMenuItem disabled={!row.canEdit || isSaving} onSelect={() => openEditForm(row)}>แก้ไข</TableActionMenuItem>
                            <TableActionMenuItem disabled={!row.canPost || isSaving} onSelect={() => postDraft(row)}>ยืนยันโอนสินค้า</TableActionMenuItem>
                            <TableActionMenuItem disabled={!row.canCancel || isSaving} onSelect={() => cancelDraft(row)}>ยกเลิก</TableActionMenuItem>
                          </>
                        )}
                        label="จัดการ"
                        onClick={() => undefined}
                      />
                    </div> : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
            {!isLoading && data.rows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-400" colSpan={visibleColumns.length}>ยังไม่มีรายการ</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function formatDateTime(value: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return formatThaiDateCE(date, { dateStyle: 'short', timeStyle: 'short' })
}

function statusLabel(status: Row['status']) {
  if (status === 'draft') return 'แบบร่าง'
  if (status === 'posted') return 'ส่งแล้ว'
  return 'ยกเลิก'
}

function StatusBadge(props: { status: Row['status'] }) {
  const className = props.status === 'posted'
    ? 'text-emerald-700'
    : props.status === 'draft'
      ? 'text-amber-700'
      : 'text-slate-500'
  const dotClassName = props.status === 'posted'
    ? 'bg-emerald-500'
    : props.status === 'draft'
      ? 'bg-amber-500'
      : 'bg-slate-400'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${className}`}>
      <span className={`size-1.5 rounded-full ${dotClassName}`} />
      {statusLabel(props.status)}
    </span>
  )
}

function SummaryCell(props: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-400">{props.label}</div>
      <div className="font-semibold text-slate-800">{props.value}</div>
    </div>
  )
}

function RowActionButton(props: { destructive?: boolean; disabled?: boolean; label: string; menu?: React.ReactNode; onClick: () => void }) {
  return <TableActionButton aria-label={props.label} className={props.destructive ? 'border-red-200 text-red-700' : undefined} label={props.label} menu={props.menu} title={props.label} onClick={props.onClick} />
}

function FormField(props: { children: React.ReactNode; className?: string; error?: string; errorKey?: string; label: string; hideLabel?: boolean }) {
  const hasInlineRequired = props.label.trim().endsWith('*')
  return (
    <label className={props.className} data-field-invalid={props.error ? 'true' : undefined} data-manual-required={hasInlineRequired ? 'true' : undefined}>
      {!props.hideLabel ? <span className="mb-1 block text-xs font-medium text-slate-600">{props.label}</span> : null}
      {props.errorKey ? <div data-error-key={props.errorKey}>{props.children}</div> : props.children}
      {props.error ? <span className="mt-1 block text-xs text-red-700">{props.error}</span> : null}
    </label>
  )
}

function InputField(props: {
  error?: string
  errorKey?: string
  inputClassName?: string
  label: string
  onChange: (value: string) => void
  type?: string
  value: string
  hideLabel?: boolean
}) {
  return (
    <FormField error={props.error} errorKey={props.errorKey} label={props.label} hideLabel={props.hideLabel}>
      <Input
        data-error-key={props.errorKey}
        className={`h-9 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : ''} ${props.inputClassName ?? ''}`.trim()}
        type={props.type ?? 'text'}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </FormField>
  )
}

function SelectField(props: {
  disabled?: boolean
  displayMode?: 'code-name' | 'name'
  error?: string
  errorKey?: string
  label: string
  onChange: (value: string) => void
  options: Option[]
  placeholder: string
  value: string
}) {
  return (
    <FormField error={props.error} errorKey={props.errorKey} label={props.label}>
      <Select
        data-error-key={props.errorKey}
        className={`h-10 w-full px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400 ${props.error ? 'border-red-400 bg-red-50 text-red-700' : `border-slate-300 bg-white ${props.value ? 'text-slate-900' : 'text-slate-400'}`}`}
        disabled={props.disabled}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option disabled value="">{props.placeholder}</option>
        {props.options.map((option) => <option key={option.id} value={option.id}>{props.displayMode === 'name' ? option.name : optionLabel(option)}</option>)}
      </Select>
    </FormField>
  )
}

function SearchableProductField(props: {
  disabled?: boolean
  error?: string
  errorKey: string
  onChange: (value: string) => void
  options: Option[]
  value: string
}) {
  const mappedOptions = useMemo(() => {
    return props.options.map((option) => ({
      id: option.id,
      label: option.code ? `${option.code} - ${option.name}` : option.name,
      searchText: option.code ? `${option.code} ${option.name}` : option.name,
    }))
  }, [props.options])

  return (
    <SearchCombobox
      error={props.error}
      errorKey={props.errorKey}
      disabled={props.disabled}
      inputId={`product-select-${props.errorKey}`}
      label="สินค้า *"
      hideLabel={true}
      options={mappedOptions}
      placeholder={props.disabled ? 'เลือกสาขาและคลังให้ครบก่อน' : 'พิมพ์รหัส/ชื่อสินค้า...'}
      value={props.value}
      onChange={props.onChange}
    />
  )
}

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}
