'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Download } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Field, InputField, ProductSearchCombobox, SelectField, SupplierSearchCombobox, SummaryLine } from '@/components/daily/TransactionBillsFieldHelpers'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { TableNumberCell } from '@/components/ui/TableNumberCell'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/Table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import { SELECTED_BRANCH_KEY } from '@/lib/branch-selection'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { purchaseBillCancelSchema, purchaseBillFormSchema, type PurchaseBillCancelValues, type PurchaseBillFormValues } from '@/lib/purchase-bill'
import { salesBillFormSchema, type SalesBillFormValues } from '@/lib/sales'

type BillRow = {
  branchId?: string
  branchName?: string
  createdAt?: string
  createdBy?: string
  customerName?: string
  date: string
  discountTotal?: number
  docNo: string
  grossProfit?: number
  hasVat?: boolean
  id: string
  items?: Array<Partial<PurchaseBillFormValues['items'][number]> & {
    amount?: number
    netAmount?: number
    netWeight?: number
    productCode?: string
    productName?: string
    unit?: string
  }>
  itemCount: number
  licensePlate?: string
  note?: string
  paidAmount?: number
  paymentDocNos?: string[]
  payableBalance?: number
  purchaseSource?: string
  receivableBalance?: number
  receivedAmount?: number
  refNo?: string
  poBuyId?: string
  salesId?: string
  status: string
  supplierId?: string
  supplierName?: string
  totalAmount?: number
  transactionMode?: string
  updatedAt?: string
  updatedBy?: string
  vatInvoiceNo?: string
  vatInvoiceDate?: string
  vatInvoiceReceived?: boolean
  vatInvoiceIssued?: boolean
  vatRatePercent?: number
  warehouseId?: string
  warehouseName?: string
}

type StockIssueRow = {
  branchName: string
  convertedToBillId: string
  customerName: string
  date: string
  docNo: string
  id: string
  itemCount: number
  status: string
  totalCost: number
  totalEstAmount: number
  totalQty?: number
  warehouseName: string
}

type Option = {
  active?: boolean | null
  branch_id?: string | null
  code?: string | null
  id: string
  label?: string | null
  name: string
  remainingQty?: number | null
  sales_id?: string | null
  supplier_id?: string | null
  unit?: string | null
}

type PurchasePayload = {
  branches: Option[]
  poBuys: Option[]
  products: Option[]
  rows: BillRow[]
  salespersons: Option[]
  suppliers: Option[]
  totalAmount?: number
  totalRows?: number
  vatRatePercent?: number
  warehouses: Option[]
}

type OptionsPayload = Omit<PurchasePayload, 'rows'> & {
  customers: Option[]
  salesChannels: Option[]
}

type TransactionPayload = {
  rows: Array<BillRow | StockIssueRow>
  totalAmount?: number
  totalRows?: number
}

type SalesPayload = TransactionPayload & {
  branches: Option[]
  customers: Option[]
  products: Option[]
  salesChannels: Option[]
  vatRatePercent?: number
  warehouses: Option[]
}

type TransactionBillsPageClientProps = {
  mode: 'purchase' | 'sales' | 'stock-issue'
}

type SortKey = 'date' | 'docNo' | 'itemCount' | 'name' | 'outstanding' | 'refNo' | 'status' | 'totalAmount' | 'transactionMode' | 'updatedBy' | 'warehouse'
type SortDirection = 'asc' | 'desc'

const blankItem = (): PurchaseBillFormValues['items'][number] => ({
  deductWeight: 0,
  discount: 0,
  displayName: null,
  grossWeight: 0,
  lotNo: null,
  note: null,
  poBuyId: null,
  price: 0,
  productId: '',
  qty: 0,
  salesPrice: 0,
})

function formatPercent(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: value % 1 === 0 ? 0 : 2 })
}

function poQtyVariance(poQty: number, itemQty: number) {
  const diff = poQty - itemQty
  if (Math.abs(diff) < 0.001) return { className: 'text-emerald-700', text: 'ตรงกับ PO' }
  if (diff > 0) return { className: 'text-amber-700', text: `ขาด ${formatMoney(diff)} กก.` }
  return { className: 'text-red-700', text: `เกิน ${formatMoney(Math.abs(diff))} กก.` }
}

const numberInputClass = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

function ExportButton({ isExporting, onClick }: { isExporting: boolean; onClick: () => void }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button aria-label="Export" className="ml-auto gap-2" disabled={isExporting} type="button" variant="export" onClick={onClick}>
            <Download aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{isExporting ? 'กำลัง Export...' : 'ส่งออก Excel'}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>ส่งออกข้อมูลตาม filter ปัจจุบัน</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

const initialPurchaseForm = (): PurchaseBillFormValues => ({
  branchId: '',
  discountTotal: 0,
  hasVat: false,
  items: [blankItem()],
  note: null,
  notes: null,
  poBuyId: null,
  purchaseSource: 'SPOT_BUY',
  refNo: null,
  salesId: null,
  supplierId: '',
  transactionMode: 'STOCK',
  vatInvoiceDate: null,
  vatInvoiceNo: null,
  vatInvoiceReceived: false,
  vatType: 'NONE',
  warehouseId: null,
})

const blankSalesItem = (): SalesBillFormValues['items'][number] => ({
  discount: 0,
  note: null,
  price: 0,
  productId: '',
  qty: 0,
})

const initialSalesForm = (): SalesBillFormValues => ({
  branchId: null,
  channelId: null,
  customerId: '',
  discountTotal: 0,
  hasVat: false,
  items: [blankSalesItem()],
  licensePlate: null,
  note: null,
  poSellId: null,
  refNo: null,
  transactionMode: 'STOCK',
  vatInvoiceDate: null,
  vatInvoiceIssued: false,
  vatInvoiceNo: null,
  vatType: 'NONE',
  warehouseId: null,
})

export function TransactionBillsPageClient({ mode }: TransactionBillsPageClientProps) {
  const router = useRouter()
  const [cancelNote, setCancelNote] = useState('')
  const [cancelNoteError, setCancelNoteError] = useState('')
  const [cancelingBill, setCancelingBill] = useState<BillRow | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [filterMode, setFilterMode] = useState(mode === 'stock-issue' ? 'pending' : '')
  const [form, setForm] = useState<PurchaseBillFormValues>(initialPurchaseForm())
  const [editingBillId, setEditingBillId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [options, setOptions] = useState<OptionsPayload>({ branches: [], customers: [], poBuys: [], products: [], salesChannels: [], salespersons: [], suppliers: [], warehouses: [] })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [preferredBranchId, setPreferredBranchId] = useState<string | null>(null)
  const [rows, setRows] = useState<Array<BillRow | StockIssueRow>>([])
  const [search, setSearch] = useState('')
  const [salesFieldErrors, setSalesFieldErrors] = useState<Record<string, string>>({})
  const [salesForm, setSalesForm] = useState<SalesBillFormValues>(initialSalesForm())
  const [showSalesForm, setShowSalesForm] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [statusFilter, setStatusFilter] = useState('')
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [vatRatePercent, setVatRatePercent] = useState(7)
  const latestLoadRequestRef = useRef(0)
  const apiPath = mode === 'purchase' ? '/api/purchase/bills' : mode === 'sales' ? '/api/sales/bills' : '/api/sales/stock-issue'
  const requestPath = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortDirection,
      sortKey,
    })
    if (search.trim()) params.set('search', search.trim())
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if ((mode === 'purchase' || mode === 'sales') && filterMode) params.set('filterMode', filterMode)
    if ((mode === 'purchase' || mode === 'sales') && statusFilter) params.set('status', statusFilter)
    if (mode === 'stock-issue' && filterMode) params.set('status', filterMode)
    return `${apiPath}?${params.toString()}`
  }, [apiPath, dateFrom, dateTo, filterMode, mode, page, pageSize, search, sortDirection, sortKey, statusFilter])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setIsLoading(true)
    setError(null)
    try {
      if (mode === 'purchase') {
        const payload = await dailyFetchJson<PurchasePayload>(requestPath)
        if (latestLoadRequestRef.current !== requestId) return
        setRows(payload.rows)
        setTotalAmount(payload.totalAmount ?? 0)
        setTotalRows(payload.totalRows ?? payload.rows.length)
        setVatRatePercent(payload.vatRatePercent ?? 7)
        setOptions({
          branches: payload.branches,
          customers: [],
          poBuys: payload.poBuys,
          products: payload.products,
          salesChannels: [],
          salespersons: payload.salespersons,
          suppliers: payload.suppliers,
          warehouses: payload.warehouses,
        })
      } else if (mode === 'sales') {
        const payload = await dailyFetchJson<SalesPayload>(requestPath)
        if (latestLoadRequestRef.current !== requestId) return
        setRows(payload.rows)
        setTotalAmount(payload.totalAmount ?? 0)
        setTotalRows(payload.totalRows ?? payload.rows.length)
        setVatRatePercent(payload.vatRatePercent ?? 7)
        setOptions((current) => ({
          ...current,
          branches: payload.branches,
          customers: payload.customers,
          products: payload.products,
          salesChannels: payload.salesChannels,
          warehouses: payload.warehouses,
        }))
      } else {
        const payload = await dailyFetchJson<TransactionPayload>(requestPath)
        if (latestLoadRequestRef.current !== requestId) return
        setRows(payload.rows)
        setTotalAmount(payload.totalAmount ?? 0)
        setTotalRows(payload.totalRows ?? payload.rows.length)
      }
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [mode, requestPath])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const savedBranchId = window.localStorage.getItem(SELECTED_BRANCH_KEY)
    if (!savedBranchId || savedBranchId === 'all') return
    setPreferredBranchId(savedBranchId)
  }, [])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, filterMode, pageSize, search, sortDirection, sortKey, statusFilter])

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows
  const total = totalAmount
  const title = mode === 'purchase' ? 'บิลรับซื้อ' : mode === 'sales' ? 'บิลขาย' : 'เบิกออกรอบิล'
  const activeBranches = options.branches.filter((option) => option.active !== false)
  const resolvedPreferredBranchId = preferredBranchId && activeBranches.some((branch) => branch.id === preferredBranchId) ? preferredBranchId : null
  const activePoBuys = options.poBuys.filter((option) => option.active !== false && (!form.supplierId || option.supplier_id === form.supplierId))
  const activeCustomers = options.customers.filter((option) => option.active !== false)
  const activeProducts = options.products.filter((option) => option.active !== false)
  const activeSalesChannels = options.salesChannels.filter((option) => option.active !== false)
  const activeSuppliers = options.suppliers.filter((option) => option.active !== false)
  const editingBill = editingBillId ? rows.find((row): row is BillRow => !isStockIssueRow(row) && row.id === editingBillId) : null
  const formVatRatePercent = editingBill?.vatRatePercent ?? vatRatePercent
  const formSubtotal = form.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const formTotalWeight = form.items.reduce((sum, item) => sum + item.qty, 0)
  const formAfterDiscount = Math.max(0, formSubtotal - form.discountTotal)
  const formVat = !form.hasVat || form.vatType === 'NONE' ? 0 : form.vatType === 'INCLUDE' ? formAfterDiscount * formVatRatePercent / (100 + formVatRatePercent) : formAfterDiscount * (formVatRatePercent / 100)
  const formTotal = form.hasVat && form.vatType === 'EXCLUDE' ? formAfterDiscount + formVat : formAfterDiscount
  const salesSubtotal = salesForm.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const salesAfterDiscount = Math.max(0, salesSubtotal - salesForm.discountTotal)
  const salesVat = !salesForm.hasVat || salesForm.vatType === 'NONE' ? 0 : salesForm.vatType === 'INCLUDE' ? salesAfterDiscount * formVatRatePercent / (100 + formVatRatePercent) : salesAfterDiscount * (formVatRatePercent / 100)
  const salesTotal = salesForm.hasVat && salesForm.vatType === 'EXCLUDE' ? salesAfterDiscount + salesVat : salesAfterDiscount
  const vatLabel = `VAT ${formatPercent(formVatRatePercent)}%`
  const visibleBills = pageRows.filter((row): row is BillRow => !isStockIssueRow(row))
  const visibleTotal = visibleBills.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0)
  const visibleOutstanding = visibleBills.reduce((sum, row) => sum + (mode === 'purchase' ? row.payableBalance ?? 0 : row.receivableBalance ?? 0), 0)
  const visiblePaid = visibleBills.reduce((sum, row) => sum + (mode === 'purchase' ? row.paidAmount ?? 0 : row.receivedAmount ?? 0), 0)
  const visibleGp = visibleBills.reduce((sum, row) => sum + (row.grossProfit ?? 0), 0)
  const visibleStockCount = visibleBills.filter((row) => (row.transactionMode ?? 'STOCK') === 'STOCK').length
  const visibleTradingCount = visibleBills.filter((row) => row.transactionMode === 'TRADING').length
  const visibleMarginPct = visibleTotal > 0 ? visibleGp / visibleTotal * 100 : 0
  const stockIssueRows = pageRows.filter(isStockIssueRow)
  const stockIssueQty = stockIssueRows.reduce((sum, row) => sum + (row.totalQty ?? 0), 0)
  const stockIssueCost = stockIssueRows.reduce((sum, row) => sum + row.totalCost, 0)
  const stockIssueEst = stockIssueRows.reduce((sum, row) => sum + row.totalEstAmount, 0)
  const tableColSpan = mode === 'purchase' ? 10 : mode === 'sales' ? 15 : 10

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setFilterMode('')
    setStatusFilter('')
  }

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'date' || nextKey === 'totalAmount' || nextKey === 'outstanding' ? 'desc' : 'asc')
  }

  function openRow(row: BillRow | StockIssueRow) {
    if (mode !== 'purchase' || isStockIssueRow(row)) return
    router.push(`/purchase/bills/${row.id}`)
  }

  function openPurchaseForm() {
    setEditingBillId(null)
    setForm({ ...initialPurchaseForm(), branchId: resolvedPreferredBranchId ?? '' })
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  function openSalesForm() {
    setSalesForm({ ...initialSalesForm(), branchId: resolvedPreferredBranchId })
    setSalesFieldErrors({})
    setError(null)
    setShowSalesForm(true)
  }

  function purchaseFormFromRow(row: BillRow): PurchaseBillFormValues {
    const items = (row.items?.length ? row.items : [blankItem()]).map((item) => ({
      deductWeight: Number(item.deductWeight ?? 0),
      discount: Number(item.discount ?? 0),
      displayName: item.displayName ?? null,
      grossWeight: Number(item.grossWeight ?? item.qty ?? ('netWeight' in item ? item.netWeight : 0) ?? 0),
      lotNo: item.lotNo ?? null,
      note: item.note ?? null,
      poBuyId: item.poBuyId ?? null,
      price: Number(item.price ?? 0),
      productId: String(item.productId ?? ''),
      qty: Number(item.qty ?? ('netWeight' in item ? item.netWeight : 0) ?? 0),
      salesPrice: Number(item.salesPrice ?? 0),
    }))

    return {
      branchId: row.branchId ?? '',
      discountTotal: row.discountTotal ?? 0,
      hasVat: row.hasVat ?? false,
      items,
      note: row.note || null,
      notes: row.note || null,
      poBuyId: row.poBuyId || null,
      purchaseSource: (row.purchaseSource === 'PO_RECEIPT' || row.purchaseSource === 'MIXED') ? row.purchaseSource : 'SPOT_BUY',
      refNo: row.refNo || null,
      salesId: row.salesId || null,
      supplierId: row.supplierId ?? '',
      transactionMode: row.transactionMode === 'TRADING' ? 'TRADING' : 'STOCK',
      vatInvoiceDate: row.vatInvoiceDate || null,
      vatInvoiceNo: row.vatInvoiceNo || null,
      vatInvoiceReceived: row.vatInvoiceReceived ?? false,
      vatType: row.hasVat ? 'EXCLUDE' : 'NONE',
      warehouseId: row.warehouseId || null,
    }
  }

  function openEditPurchaseForm(row: BillRow) {
    setEditingBillId(row.id)
    setForm(purchaseFormFromRow(row))
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  function openCancelPurchaseBill(row: BillRow) {
    setCancelingBill(row)
    setCancelNote('')
    setCancelNoteError('')
    setError(null)
  }

  function updateForm<K extends keyof PurchaseBillFormValues>(key: K, value: PurchaseBillFormValues[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'supplierId' ? { salesId: activeSuppliers.find((supplier) => supplier.id === value)?.sales_id ?? null } : {}),
      ...(key === 'branchId' ? { warehouseId: null } : {}),
      ...(key === 'hasVat' ? { vatType: value ? 'EXCLUDE' : 'NONE' } : {}),
      ...(key === 'vatInvoiceReceived' && value === false ? { vatInvoiceDate: null, vatInvoiceNo: null } : {}),
    }))
    if (key === 'branchId' && typeof window !== 'undefined') {
      const nextBranchId = typeof value === 'string' && value ? value : null
      setPreferredBranchId(nextBranchId)
      if (nextBranchId) window.localStorage.setItem(SELECTED_BRANCH_KEY, nextBranchId)
      else window.localStorage.removeItem(SELECTED_BRANCH_KEY)
    }
    setFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  function updateItem(index: number, key: keyof PurchaseBillFormValues['items'][number], value: string | number | null) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setFieldErrors({})
  }

  function updateItemWeights(index: number, key: 'deductWeight' | 'grossWeight', value: number) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const next = { ...item, [key]: value }
        return { ...next, qty: Math.max(0, next.grossWeight - next.deductWeight) }
      }),
    }))
    setFieldErrors({})
  }

  function removeItem(index: number) {
    setForm((current) => ({ ...current, items: current.items.filter((_item, itemIndex) => itemIndex !== index) }))
  }

  function updateSalesForm<K extends keyof SalesBillFormValues>(key: K, value: SalesBillFormValues[K]) {
    setSalesForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'branchId' ? { warehouseId: null } : {}),
      ...(key === 'hasVat' ? { vatType: value ? 'EXCLUDE' : 'NONE' } : {}),
      ...(key === 'vatInvoiceIssued' && value === false ? { vatInvoiceDate: null, vatInvoiceNo: null } : {}),
    }))
    if (key === 'branchId' && typeof window !== 'undefined') {
      const nextBranchId = typeof value === 'string' && value ? value : null
      setPreferredBranchId(nextBranchId)
      if (nextBranchId) window.localStorage.setItem(SELECTED_BRANCH_KEY, nextBranchId)
      else window.localStorage.removeItem(SELECTED_BRANCH_KEY)
    }
    setSalesFieldErrors((current) => ({ ...current, [key]: '' }))
  }

  function updateSalesItem(index: number, key: keyof SalesBillFormValues['items'][number], value: string | number | null) {
    setSalesForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setSalesFieldErrors({})
  }

  function removeSalesItem(index: number) {
    setSalesForm((current) => ({ ...current, items: current.items.filter((_item, itemIndex) => itemIndex !== index) }))
  }

  async function savePurchaseBill() {
    const parsed = purchaseBillFormSchema.safeParse(form)
    if (!parsed.success) {
      const flattened = parsed.error.flatten()
      setFieldErrors(Object.fromEntries(Object.entries(flattened.fieldErrors).map(([key, value]) => [key, value?.[0] ?? 'ข้อมูลไม่ถูกต้อง'])))
      setError(flattened.formErrors[0] ?? 'กรุณาตรวจสอบข้อมูลในฟอร์ม')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/purchase/bills', {
        body: JSON.stringify(editingBillId ? { ...parsed.data, id: editingBillId } : parsed.data),
        method: editingBillId ? 'PATCH' : 'POST',
      })
      setEditingBillId(null)
      setShowForm(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกบิลรับซื้อไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function saveSalesBill() {
    const parsed = salesBillFormSchema.safeParse(salesForm)
    if (!parsed.success) {
      const flattened = parsed.error.flatten()
      setSalesFieldErrors(Object.fromEntries(Object.entries(flattened.fieldErrors).map(([key, value]) => [key, value?.[0] ?? 'ข้อมูลไม่ถูกต้อง'])))
      setError(flattened.formErrors[0] ?? 'กรุณาตรวจสอบข้อมูลในฟอร์ม')
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const created = await dailyFetchJson<{ docNo: string }>('/api/sales/bills', {
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
      setShowSalesForm(false)
      setSearch(created.docNo)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกบิลขายไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function cancelPurchaseBill() {
    if (!cancelingBill) return
    const parsed = purchaseBillCancelSchema.safeParse({ action: 'cancel', id: cancelingBill.id, note: cancelNote })
    if (!parsed.success) {
      setCancelNoteError(parsed.error.flatten().fieldErrors.note?.[0] ?? 'กรอกหมายเหตุการยกเลิก')
      return
    }

    setIsSaving(true)
    setError(null)
    setCancelNoteError('')
    try {
      const payload: PurchaseBillCancelValues & { action: 'cancel' } = { ...parsed.data, action: 'cancel' }
      await dailyFetchJson('/api/purchase/bills', {
        body: JSON.stringify(payload),
        method: 'PATCH',
      })
      setCancelingBill(null)
      setCancelNote('')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิกบิลรับซื้อไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function exportExcel() {
    setIsExporting(true)
    setError(null)
    try {
      const params = new URLSearchParams({ format: 'xlsx', sortDirection, sortKey })
      if (search.trim()) params.set('search', search.trim())
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (filterMode) params.set('filterMode', filterMode)
      if (statusFilter) params.set('status', statusFilter)
      const response = await fetch(`${apiPath}?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Export Excel ไม่สำเร็จ')
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') ?? ''
      const filenamePrefix = mode === 'sales' ? 'sales_bills' : 'purchase_bills'
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.xlsx`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export Excel ไม่สำเร็จ')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="space-y-4">
      {mode === 'stock-issue' ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <TransactionKpi label="⏰ Pending / รายการ" tone="amber" value={`${totalRows.toLocaleString('th-TH')} ใบ`} />
            <TransactionKpi label="น้ำหนักรวมในหน้า" tone="blue" value={`${formatMoney(stockIssueQty)} กก.`} />
            <TransactionKpi label="ต้นทุน (WAC)" tone="red" value={formatMoney(stockIssueCost)} />
            <TransactionKpi label="ยอดขายคาด" tone="emerald" value={formatMoney(stockIssueEst || total)} />
          </div>
        </>
      ) : null}

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[260px] flex-1 rounded-md"
            placeholder={mode === 'purchase' ? 'ค้นหาเลขบิล / เลขอ้างอิง / ชื่อ Supplier...' : mode === 'sales' ? 'ค้นหาเลขบิล / เลขอ้างอิง / ชื่อลูกค้า...' : 'ค้นหาเลขที่ / ชื่อ / สาขา / คลัง'}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="text-xs text-slate-500">วันที่:</label>
          <DatePickerInput id="purchase-bills-date-from" value={dateFrom} onChange={setDateFrom} />
          <span className="text-slate-400">→</span>
          <DatePickerInput id="purchase-bills-date-to" value={dateTo} onChange={setDateTo} />
          {(search || dateFrom || dateTo || filterMode || statusFilter) ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
          {mode === 'purchase' ? <ExportButton isExporting={isExporting} onClick={() => void exportExcel()} /> : null}
          {mode === 'purchase' ? <Button type="button" onClick={openPurchaseForm}>+ บิลรับซื้อใหม่</Button> : null}
          {mode === 'sales' ? <ExportButton isExporting={isExporting} onClick={() => void exportExcel()} /> : null}
          {mode === 'sales' ? <Button disabled={isSaving} type="button" onClick={openSalesForm}>+ บิลขายใหม่</Button> : null}
          {mode === 'stock-issue' ? (
            <>
              <Select className="w-auto" value={filterMode} onChange={(event) => setFilterMode(event.target.value)}>
                <option value="">ทุกสถานะ</option>
                <option value="pending">⏰ Pending</option>
                <option value="converted">✓ เปิดบิลแล้ว</option>
                <option value="cancelled">⊘ ยกเลิก</option>
              </Select>
              <Button className="ml-auto bg-amber-600 hover:bg-amber-700" disabled type="button">+ เบิกออกใหม่</Button>
            </>
          ) : null}
        </div>
        {mode === 'purchase' || mode === 'sales' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">ประเภท:</span>
            <Segment value="" current={filterMode} label="ทุกประเภท" onClick={setFilterMode} />
            <Segment value="STOCK" current={filterMode} label="📦 STOCK" onClick={setFilterMode} />
            <Segment value="TRADING" current={filterMode} label="🔄 TRADING" onClick={setFilterMode} />
          </div>
        ) : null}
        {mode === 'purchase' || mode === 'sales' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">สถานะ:</span>
            <Segment value="" current={statusFilter} label="ทุกสถานะ" onClick={setStatusFilter} />
            <Segment value={mode === 'purchase' ? 'open' : 'unreceived'} current={statusFilter} label={mode === 'purchase' ? 'ยังไม่จ่าย' : 'เปิดอยู่'} onClick={setStatusFilter} />
            <Segment value="partial" current={statusFilter} label={mode === 'purchase' ? 'จ่ายบางส่วน' : 'บางส่วน'} onClick={setStatusFilter} />
            <Segment value={mode === 'purchase' ? 'paid' : 'received'} current={statusFilter} label={mode === 'purchase' ? 'เสร็จสิ้น' : 'รับครบ'} onClick={setStatusFilter} />
            <Segment value="cancelled" current={statusFilter} label="ยกเลิก" onClick={setStatusFilter} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto px-2 py-1"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={10}>10 / หน้า</option>
            <option value={25}>25 / หน้า</option>
            <option value={50}>50 / หน้า</option>
            <option value={100}>100 / หน้า</option>
          </Select>
          <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
        </div>
      </div>
      <Table>
          <TableHeader>
            <tr>
              <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label={mode === 'purchase' ? 'เลขที่บิลซื้อ' : 'เลขที่'} sortKey="docNo" onSort={changeSort} />
              {mode === 'sales' ? <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="เลขที่อ้างอิง" sortKey="refNo" onSort={changeSort} /> : null}
              <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label={mode === 'purchase' ? 'วันที่สร้างรายการ' : 'วันที่'} sortKey="date" onSort={changeSort} />
              <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label={mode === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า'} sortKey="name" onSort={changeSort} />
              {mode !== 'purchase' ? <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="สาขา / คลัง" sortKey="warehouse" onSort={changeSort} /> : null}
              {mode !== 'stock-issue' ? <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="ประเภท" sortKey="transactionMode" onSort={changeSort} /> : null}
              <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label={mode === 'purchase' ? 'สถานะชำระเงิน' : 'สถานะ'} sortKey="status" onSort={changeSort} />
              {mode === 'purchase' ? <th className="p-2 text-left">เลขที่การชำระเงิน</th> : null}
              {mode !== 'purchase' ? <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="รายการ" sortKey="itemCount" onSort={changeSort} /> : null}
              {mode === 'stock-issue' ? <th className="p-2 text-right">น้ำหนัก</th> : null}
              {mode === 'stock-issue' ? <th className="p-2 text-right">ต้นทุน</th> : null}
              <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label={mode === 'stock-issue' ? 'ยอดคาด' : 'ยอดรวม'} sortKey="totalAmount" onSort={changeSort} />
              {mode === 'sales' ? <th className="p-2 text-right">GP / Margin</th> : null}
              {mode === 'sales' ? <th className="p-2 text-right">รับแล้ว</th> : null}
              {mode !== 'stock-issue' ? <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ค้างชำระ" sortKey="outstanding" onSort={changeSort} /> : null}
              {mode === 'sales' ? <th className="p-2 text-center">VAT</th> : null}
              {mode !== 'stock-issue' ? <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="อัพเดตล่าสุด" sortKey="updatedBy" onSort={changeSort} /> : null}
              {mode === 'purchase' ? <th className="p-2 text-right">จัดการ</th> : null}
              {mode === 'sales' ? <th className="p-2 text-right">จัดการ</th> : null}
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><td className="p-6 text-center text-slate-500" colSpan={tableColSpan}>กำลังโหลดข้อมูล</td></TableRow> : null}
            {!isLoading && pageRows.map((row) => (
              <TableRow key={row.id} className={`hover:bg-slate-50 ${mode === 'purchase' && !isStockIssueRow(row) ? 'cursor-pointer' : ''}`} onClick={() => openRow(row)}>
                <td className="p-2 font-mono text-xs">{row.docNo}</td>
                {mode === 'sales' && !isStockIssueRow(row) ? <td className="p-2 font-mono text-xs text-slate-600">{row.refNo || '-'}</td> : null}
                <td className="p-2">{formatDateDisplay(row.date)}</td>
                <td className="p-2">{'supplierName' in row ? row.supplierName : row.customerName}</td>
                {mode !== 'purchase' ? <td className="p-2">{formatBranchWarehouse(row)}</td> : null}
                {mode !== 'stock-issue' && !isStockIssueRow(row) ? <td className="p-2 text-center"><span className={`rounded-md-full px-2 py-0.5 text-xs font-semibold ${row.transactionMode === 'TRADING' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>{row.transactionMode ?? '-'}</span></td> : null}
                <td className="p-2 text-center"><span className={`rounded-md-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}>{statusText(row.status)}</span></td>
                {mode === 'purchase' && !isStockIssueRow(row) ? <td className="p-2 text-xs">{row.paymentDocNos?.length ? <div className="space-y-0.5">{row.paymentDocNos.map((docNo: string) => <div key={`${row.id}-${docNo}`} className="font-mono text-slate-700">{docNo}</div>)}</div> : <span className="text-slate-400">-</span>}</td> : null}
                {mode !== 'purchase' ? <td className="p-2 text-right">{row.itemCount}</td> : null}
                {mode === 'stock-issue' && isStockIssueRow(row) ? <TableNumberCell value={formatMoney(row.totalQty ?? 0)} /> : null}
                {mode === 'stock-issue' && isStockIssueRow(row) ? <TableNumberCell tone="amber" value={formatMoney(row.totalCost)} /> : null}
                <TableNumberCell strong value={formatMoney(isStockIssueRow(row) ? row.totalEstAmount : row.totalAmount ?? 0)} />
                {mode === 'sales' && !isStockIssueRow(row) ? <td className={`p-2 text-right font-semibold ${(row.grossProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}><div>{formatMoney(row.grossProfit ?? 0)}</div><div className="text-xs text-slate-500">{formatMoney((row.totalAmount ?? 0) > 0 ? (row.grossProfit ?? 0) / (row.totalAmount ?? 1) * 100 : 0)}%</div></td> : null}
                {mode === 'sales' && !isStockIssueRow(row) ? <TableNumberCell value={formatMoney(row.receivedAmount ?? 0)} /> : null}
                {mode !== 'stock-issue' && !isStockIssueRow(row) ? <TableNumberCell tone="amber" value={formatMoney(mode === 'purchase' ? row.payableBalance ?? 0 : row.receivableBalance ?? 0)} /> : null}
                {mode === 'sales' && !isStockIssueRow(row) ? <td className="p-2 text-center"><span className={`rounded-md-full px-2 py-0.5 text-xs font-semibold ${row.vatInvoiceIssued ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.vatInvoiceIssued ? 'ออกแล้ว' : 'ยังไม่ออก'}</span>{row.vatInvoiceNo ? <div className="mt-1 font-mono text-[10px] text-slate-500">{row.vatInvoiceNo}</div> : null}</td> : null}
                {mode !== 'stock-issue' && !isStockIssueRow(row) ? <td className="p-2 text-xs text-slate-600"><div>{row.updatedBy || row.createdBy || '-'}</div><div className="font-mono text-[10px] text-slate-400">{formatDateTime(row.updatedAt || row.createdAt)}</div></td> : null}
                {mode === 'purchase' && !isStockIssueRow(row) ? <td className="p-2 text-right"><div className="flex justify-end gap-1"><Button className="px-2 py-1 text-xs" disabled={row.status.toLowerCase().includes('cancel')} size="xs" type="button" variant="outline" onClick={(event) => { event.stopPropagation(); openEditPurchaseForm(row) }}>แก้ไข</Button><Button className="px-2 py-1 text-xs" disabled={row.status.toLowerCase().includes('cancel')} size="xs" type="button" variant="outline" onClick={(event) => { event.stopPropagation(); openCancelPurchaseBill(row) }}>ยกเลิก</Button></div></td> : null}
                {mode === 'sales' && !isStockIssueRow(row) ? <td className="p-2 text-right"><div className="flex justify-end gap-1"><Button className="px-2 py-1 text-xs" disabled size="xs" title="รอเปิด flow แก้ไขบิลขาย" type="button" variant="outline">แก้ไข</Button><Button className="px-2 py-1 text-xs" disabled size="xs" title="รอเปิด flow ยกเลิกบิลขาย" type="button" variant="outline">ยกเลิก</Button></div></td> : null}
                {mode === 'stock-issue' && isStockIssueRow(row) ? <td className="p-2 text-right"><div className="flex justify-end gap-1 whitespace-nowrap"><Button className="bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100" disabled={row.status !== 'pending'} size="xs" type="button" variant="ghost">→ เปิดบิลขาย</Button><Button className="px-2 py-1 text-xs text-slate-400 hover:bg-slate-100" disabled size="xs" type="button" variant="ghost">แก้</Button><Button className="px-2 py-1 text-xs text-slate-400 hover:bg-slate-100" disabled size="xs" type="button" variant="ghost">ยกเลิก</Button></div></td> : null}
              </TableRow>
            ))}
            {!isLoading && totalRows === 0 ? <TableRow><td className="p-6 text-center text-slate-500" colSpan={tableColSpan}>ยังไม่มีรายการ</td></TableRow> : null}
          </TableBody>
      </Table>

      {showForm && mode === 'purchase' ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="mx-auto my-4 flex max-h-[94vh] max-w-5xl flex-col rounded-md bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-md-t-md border-b bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 text-white">
              <div>
                <h3 className="text-xl font-bold">📥 {editingBillId ? 'แก้ไขบิลรับซื้อ' : 'สร้างบิลรับซื้อใหม่'}</h3>
                <p className="mt-1 text-xs opacity-80">{editingBillId ? 'แก้ไขได้แม้มีการชำระแล้ว ระบบจะคำนวณยอดค้างและ stock ledger ใหม่' : 'บันทึก header และรายการสินค้าในบิลรับซื้อ'}</p>
              </div>
              <button className="text-3xl leading-none text-white/80 hover:text-white" type="button" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-6 text-sm">
              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="amber">1</StepBadge>ประเภทบิล</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <RadioCard active={form.transactionMode === 'STOCK'} label="📦 STOCK" note="ซื้อเข้าสต๊อก · เข้า Stock + คำนวณ WAC ภายหลัง" onClick={() => updateForm('transactionMode', 'STOCK')} />
                  <RadioCard active={form.transactionMode === 'TRADING'} label="🔄 TRADING" note="ซื้อขายผ่านมือ · ไม่เข้า Stock ไม่กระทบ WAC" onClick={() => updateForm('transactionMode', 'TRADING')} />
                </div>
                {form.transactionMode === 'TRADING' ? (
                  <div className="mt-3 rounded-md border border-purple-200 bg-purple-50 p-2 text-xs text-purple-700">รายการ Trading ไม่เข้า Stock และจะใช้สำหรับจับคู่ขายใน Trading Matching ภายหลัง</div>
                ) : null}
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="blue">2</StepBadge>ข้อมูลบิล</h4>
                <div className="grid gap-3 md:grid-cols-[160px_420px] md:justify-start">
                  <BranchSelectCombobox branches={activeBranches} error={fieldErrors.branchId} inputId="purchase-bill-branch-search" label="สาขา *" placeholder="เลือกสาขา" value={form.branchId} widthClassName="max-w-[160px]" onChange={(branchId) => updateForm('branchId', branchId ?? '')} />
                  <SupplierSearchCombobox className="md:max-w-[420px]" error={fieldErrors.supplierId} options={activeSuppliers} value={form.supplierId} onChange={(value) => updateForm('supplierId', value)} />
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="emerald">3</StepBadge>รายการสินค้า ({form.items.length})</h4>
                  <button className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, blankItem()] }))}>+ เพิ่มรายการ</button>
                </div>
                {fieldErrors.items ? <div className="mb-2 text-xs text-red-600">{fieldErrors.items}</div> : null}
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[780px] text-sm">
                    <tbody>
                      {form.items.map((item, index) => (
                        <Fragment key={index}>
                          <tr className="border-t align-top hover:bg-blue-50/30">
                            <td className="p-2" colSpan={4}>
                              <ProductSearchCombobox inputId={`purchase-bill-product-search-${index}`} options={activeProducts} value={item.productId} onChange={(value) => updateItem(index, 'productId', value)} />
                              <input className="mt-1.5 w-full rounded-md border bg-yellow-50 px-2 py-1 text-xs" placeholder="ชื่อสำหรับโชว์ในบิล (ว่าง = ใช้ชื่อ Master)" value={item.displayName ?? ''} onChange={(event) => updateItem(index, 'displayName', event.target.value || null)} />
                            </td>
                            <td className="p-2" colSpan={form.salesId ? 3 : 2}>
                              <div className="mb-1 text-[11px] font-semibold text-indigo-700">อ้างอิง PO</div>
                              <select className="w-full rounded-md border bg-blue-50 px-2 py-2 text-xs" value={item.poBuyId ?? ''} onChange={(event) => updateItem(index, 'poBuyId', event.target.value || null)}>
                                <option value="">Spot Buy</option>
                                {activePoBuys.map((po) => <option key={po.id} value={po.id}>{po.label ?? po.name}</option>)}
                              </select>
                              {(() => {
                                const remainingQty = activePoBuys.find((po) => po.id === item.poBuyId)?.remainingQty
                                if (remainingQty === null || remainingQty === undefined) return null
                                const variance = poQtyVariance(remainingQty, item.qty)
                                return <div className={`mt-1 text-[11px] font-semibold ${variance.className}`}>{variance.text}</div>
                              })()}
                            </td>
                            <td className="p-2 align-middle" rowSpan={2}><button className="rounded-md px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-40" disabled={form.items.length <= 1} type="button" onClick={() => removeItem(index)}>ลบ</button></td>
                          </tr>
                          <tr className="border-t border-slate-100 align-top hover:bg-blue-50/30">
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-slate-500">Gross</div>
                              <input className={`w-full rounded-md border bg-slate-50 px-2 py-2 text-right font-mono ${numberInputClass}`} min="0" step="0.01" type="number" value={item.grossWeight || ''} onChange={(event) => updateItemWeights(index, 'grossWeight', Number(event.target.value || 0))} />
                            </td>
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-amber-700">หัก</div>
                              <input className={`w-full rounded-md border bg-amber-50 px-2 py-2 text-right font-mono ${numberInputClass}`} min="0" step="0.01" type="number" value={item.deductWeight || ''} onChange={(event) => updateItemWeights(index, 'deductWeight', Number(event.target.value || 0))} />
                            </td>
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-emerald-700">สุทธิ</div>
                              <input className={`w-full rounded-md border bg-emerald-50 px-2 py-2 text-right font-mono font-bold text-emerald-700 ${numberInputClass}`} min="0" step="0.01" type="number" value={item.qty || ''} onChange={(event) => updateItem(index, 'qty', Number(event.target.value || 0))} />
                            </td>
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-slate-500">ราคา/กก.</div>
                              <input className={`w-full rounded-md border px-2 py-2 text-right font-mono ${numberInputClass}`} min="0" step="0.01" type="number" value={item.price || ''} onChange={(event) => updateItem(index, 'price', Number(event.target.value || 0))} />
                            </td>
                            {form.salesId ? (
                              <td className="p-2">
                                <div className="mb-1 text-[11px] font-semibold text-purple-700">ราคาหน้าใบ</div>
                                <input className={`w-full rounded-md border bg-purple-50 px-2 py-2 text-right font-mono ${numberInputClass}`} min="0" step="0.01" type="number" value={item.salesPrice || ''} onChange={(event) => updateItem(index, 'salesPrice', Number(event.target.value || 0))} />
                              </td>
                            ) : null}
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-slate-500">ส่วนลด</div>
                              <input className={`w-full rounded-md border px-2 py-2 text-right font-mono ${numberInputClass}`} min="0" step="0.01" type="number" value={item.discount || ''} onChange={(event) => updateItem(index, 'discount', Number(event.target.value || 0))} />
                            </td>
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-blue-700">ยอดรวม</div>
                              <div className="rounded-md border border-blue-100 bg-blue-50 px-2 py-2 text-right font-mono font-bold text-blue-700">{formatMoney(Math.max(0, item.qty * item.price - item.discount))}</div>
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-emerald-50 font-bold">
                      <tr>
                        <td className="p-2 text-right font-mono"><span className="mr-2 text-slate-700">รวม</span>{formatMoney(form.items.reduce((sum, item) => sum + item.grossWeight, 0))}</td>
                        <td className="p-2 text-right font-mono text-amber-700">{formatMoney(form.items.reduce((sum, item) => sum + item.deductWeight, 0))}</td>
                        <td className="p-2 text-right font-mono text-emerald-700">{formatMoney(formTotalWeight)}</td>
                        <td></td>
                        {form.salesId ? <td></td> : null}
                        <td></td>
                        <td className="p-2 text-right font-mono text-blue-700">{formatMoney(formSubtotal)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="purple">4</StepBadge>VAT & ยอดรวม</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <label className={`flex cursor-pointer items-center gap-3 rounded-md border-2 p-3 ${form.hasVat ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                      <input checked={form.hasVat} className="size-5" type="checkbox" onChange={(event) => updateForm('hasVat', event.target.checked)} />
                      <span className="font-bold text-slate-700">มี {vatLabel}</span>
                    </label>
                    <InputField error={fieldErrors.discountTotal} inputClassName="text-right font-mono" label="ส่วนลดท้ายบิล (บาท)" type="number" value={form.discountTotal ? String(form.discountTotal) : ''} onChange={(value) => updateForm('discountTotal', Number(value || 0))} />
                  </div>
                  <div className="rounded-md border-2 border-blue-200 bg-blue-50 p-4">
                    <div className="mb-2 flex justify-between rounded-md border border-emerald-300 bg-emerald-100 p-2 font-bold text-emerald-800"><span>น้ำหนักรวมที่ซื้อ</span><span className="font-mono">{formatMoney(formTotalWeight)} กก.</span></div>
                    <SummaryLine label="ยอดรวมรายการ" value={formatMoney(formSubtotal)} />
                    {form.discountTotal > 0 ? <SummaryLine label="หักส่วนลด" tone="red" value={`-${formatMoney(form.discountTotal)}`} /> : null}
                    <SummaryLine label="หลังส่วนลด" value={formatMoney(formAfterDiscount)} />
                    {form.hasVat ? <SummaryLine label={vatLabel} value={formatMoney(formVat)} /> : null}
                    <div className="mt-2 flex justify-between border-t-2 border-blue-400 pt-2 text-lg font-bold"><span>ยอดสุทธิ</span><span className="font-mono text-blue-700">{formatMoney(formTotal)}</span></div>
                  </div>
                </div>
              </div>

              {form.hasVat ? (
                <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-4">
                  <label className="mb-2 flex cursor-pointer items-center gap-2">
                    <input checked={form.vatInvoiceReceived} className="size-5" type="checkbox" onChange={(event) => updateForm('vatInvoiceReceived', event.target.checked)} />
                    <span className="font-bold text-amber-700">ได้รับใบกำกับภาษีตัวจริงแล้ว</span>
                  </label>
                  {form.vatInvoiceReceived ? (
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <InputField error={fieldErrors.vatInvoiceNo} inputClassName="font-mono" label="เลขที่ใบกำกับภาษี" placeholder="เช่น TI-001" value={form.vatInvoiceNo ?? ''} onChange={(value) => updateForm('vatInvoiceNo', value || null)} />
                      <InputField error={fieldErrors.vatInvoiceDate} label="วันที่ใบกำกับภาษี" type="date" value={form.vatInvoiceDate ?? ''} onChange={(value) => updateForm('vatInvoiceDate', value || null)} />
                    </div>
                  ) : <div className="mt-1 text-xs text-amber-700">ยังไม่ได้รับใบกำกับภาษีตัวจริง ต้องติดตามเพื่อใช้เครดิต VAT ซื้อ</div>}
                </div>
              ) : null}

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <Field error={fieldErrors.note ?? fieldErrors.notes} label="หมายเหตุ"><textarea className="w-full rounded-md border px-3 py-2" rows={2} value={form.note ?? form.notes ?? ''} onChange={(event) => {
                  const value = event.target.value || null
                  updateForm('note', value)
                  updateForm('notes', value)
                }} /></Field>
              </div>
            </div>
            <div className="flex justify-end gap-2 rounded-md-b-md border-t bg-white p-4">
              <button className="rounded-md border px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button className="rounded-md bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={() => void savePurchaseBill()}>{isSaving ? 'กำลังบันทึก...' : editingBillId ? 'บันทึกการแก้ไข' : 'บันทึกบิลรับซื้อ'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {showSalesForm && mode === 'sales' ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="mx-auto my-4 flex max-h-[94vh] max-w-5xl flex-col rounded-md bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-md-t-md border-b bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white">
              <div>
                <h3 className="text-xl font-bold">สร้างบิลขายใหม่</h3>
                <p className="mt-1 text-xs opacity-80">บันทึกบิลขายแบบ Stock / Trading พร้อม VAT และข้อมูลรับเงิน</p>
              </div>
              <button className="text-3xl leading-none text-white/80 hover:text-white" type="button" onClick={() => setShowSalesForm(false)}>&times;</button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-6 text-sm">
              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="emerald">1</StepBadge>ประเภทบิล</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <RadioCard active={salesForm.transactionMode === 'STOCK'} label="📦 STOCK" note="ขายจากสต๊อกจริง" onClick={() => updateSalesForm('transactionMode', 'STOCK')} />
                  <RadioCard active={salesForm.transactionMode === 'TRADING'} label="🔄 TRADING" note="ขายแบบจับคู่ต้นทุนผ่าน Trading" onClick={() => updateSalesForm('transactionMode', 'TRADING')} />
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="blue">2</StepBadge>ข้อมูลบิล</h4>
                <div className="grid gap-3 md:grid-cols-4">
                  <SelectField className="md:col-span-2" error={salesFieldErrors.customerId} label="ลูกค้า *" options={activeCustomers} value={salesForm.customerId} onChange={(value) => updateSalesForm('customerId', value)} />
                  <BranchSelectCombobox branches={activeBranches} error={salesFieldErrors.branchId} inputId="sales-bill-branch-search" label="สาขา/คลัง" placeholder="เลือกสาขา/คลัง" value={salesForm.branchId} onChange={(branchId) => updateSalesForm('branchId', branchId)} />
                  <SelectField error={salesFieldErrors.channelId} label="ช่องทางขาย" options={activeSalesChannels} value={salesForm.channelId ?? ''} onChange={(value) => updateSalesForm('channelId', value || null)} />
                  <InputField error={salesFieldErrors.refNo} inputClassName="font-mono" label="เลขที่อ้างอิง" value={salesForm.refNo ?? ''} onChange={(value) => updateSalesForm('refNo', value || null)} />
                  <InputField error={salesFieldErrors.licensePlate} inputClassName="uppercase" label="ทะเบียนรถ" value={salesForm.licensePlate ?? ''} onChange={(value) => updateSalesForm('licensePlate', value.toUpperCase() || null)} />
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="emerald">3</StepBadge>รายการสินค้า ({salesForm.items.length})</h4>
                  <button className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700" type="button" onClick={() => setSalesForm((current) => ({ ...current, items: [...current.items, blankSalesItem()] }))}>+ เพิ่มรายการ</button>
                </div>
                {salesFieldErrors.items ? <div className="mb-2 text-xs text-red-600">{salesFieldErrors.items}</div> : null}
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[780px] text-sm">
                    <tbody>
                      {salesForm.items.map((item, index) => (
                        <tr key={index} className="border-t align-top hover:bg-blue-50/30">
                          <td className="p-2" colSpan={3}>
                            <ProductSearchCombobox inputId={`sales-bill-product-${index}`} options={activeProducts} value={item.productId} onChange={(value) => updateSalesItem(index, 'productId', value)} />
                          </td>
                          <td className="p-2">
                            <div className="mb-1 text-[11px] font-semibold text-emerald-700">จำนวนสุทธิ</div>
                            <input className="w-full rounded-md border px-2 py-2 text-right font-mono" min={0} step="0.01" type="number" value={item.qty || ''} onChange={(event) => updateSalesItem(index, 'qty', Number(event.target.value))} />
                          </td>
                          <td className="p-2">
                            <div className="mb-1 text-[11px] font-semibold text-slate-500">ราคา/หน่วย</div>
                            <input className="w-full rounded-md border px-2 py-2 text-right font-mono" min={0} step="0.01" type="number" value={item.price || ''} onChange={(event) => updateSalesItem(index, 'price', Number(event.target.value))} />
                          </td>
                          <td className="p-2">
                            <div className="mb-1 text-[11px] font-semibold text-slate-500">ส่วนลด</div>
                            <input className="w-full rounded-md border px-2 py-2 text-right font-mono" min={0} step="0.01" type="number" value={item.discount || ''} onChange={(event) => updateSalesItem(index, 'discount', Number(event.target.value))} />
                          </td>
                          <td className="p-2">
                            <div className="mb-1 text-[11px] font-semibold text-blue-700">ยอดรวม</div>
                            <div className="rounded-md border border-blue-100 bg-blue-50 px-2 py-2 text-right font-mono font-bold text-blue-700">{formatMoney(Math.max(0, item.qty * item.price - item.discount))}</div>
                          </td>
                          <td className="p-2 text-right"><button className="rounded-md border px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40" disabled={salesForm.items.length <= 1} type="button" onClick={() => removeSalesItem(index)}>ลบ</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-emerald-50 font-bold">
                      <tr>
                        <td className="p-2 text-right font-mono text-emerald-700" colSpan={4}><span className="mr-2 text-slate-700">น้ำหนักรวม</span>{formatMoney(salesForm.items.reduce((sum, item) => sum + item.qty, 0))}</td>
                        <td></td>
                        <td></td>
                        <td className="p-2 text-right font-mono text-blue-700">{formatMoney(salesSubtotal)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="purple">4</StepBadge>VAT & ยอดรวม</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <label className={`flex cursor-pointer items-center gap-3 rounded-md border-2 p-3 ${salesForm.hasVat ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                      <input checked={salesForm.hasVat} className="size-5" type="checkbox" onChange={(event) => updateSalesForm('hasVat', event.target.checked)} />
                      <span className="font-bold text-slate-700">มี {vatLabel}</span>
                    </label>
                    {salesForm.hasVat ? (
                      <div className="flex flex-wrap gap-2">
                        <Segment current={salesForm.vatType} label="ไม่คิด VAT" value="NONE" onClick={(value) => updateSalesForm('vatType', value as SalesBillFormValues['vatType'])} />
                        <Segment current={salesForm.vatType} label="VAT แยก" value="EXCLUDE" onClick={(value) => updateSalesForm('vatType', value as SalesBillFormValues['vatType'])} />
                        <Segment current={salesForm.vatType} label="รวม VAT" value="INCLUDE" onClick={(value) => updateSalesForm('vatType', value as SalesBillFormValues['vatType'])} />
                      </div>
                    ) : null}
                    <InputField error={salesFieldErrors.discountTotal} inputClassName="text-right font-mono" label="ส่วนลดท้ายบิล (บาท)" type="number" value={salesForm.discountTotal ? String(salesForm.discountTotal) : ''} onChange={(value) => updateSalesForm('discountTotal', Number(value || 0))} />
                  </div>
                  <div className="rounded-md border-2 border-blue-200 bg-blue-50 p-4">
                    <div className="mb-2 flex justify-between rounded-md border border-emerald-300 bg-emerald-100 p-2 font-bold text-emerald-800"><span>น้ำหนักรวมที่ขาย</span><span className="font-mono">{formatMoney(salesForm.items.reduce((sum, item) => sum + item.qty, 0))} กก.</span></div>
                    <SummaryLine label="ยอดรวมรายการ" value={formatMoney(salesSubtotal)} />
                    {salesForm.discountTotal > 0 ? <SummaryLine label="หักส่วนลด" tone="red" value={`-${formatMoney(salesForm.discountTotal)}`} /> : null}
                    <SummaryLine label="หลังส่วนลด" value={formatMoney(salesAfterDiscount)} />
                    {salesForm.hasVat ? <SummaryLine label={vatLabel} value={formatMoney(salesVat)} /> : null}
                    <div className="mt-2 flex justify-between border-t-2 border-blue-400 pt-2 text-lg font-bold"><span>ยอดสุทธิ</span><span className="font-mono text-blue-700">{formatMoney(salesTotal)}</span></div>
                  </div>
                </div>
              </div>

              {salesForm.hasVat ? (
                <div className="rounded-md border-2 border-amber-300 bg-amber-50 p-4">
                  <label className="mb-2 flex cursor-pointer items-center gap-2">
                    <input checked={salesForm.vatInvoiceIssued} className="size-5" type="checkbox" onChange={(event) => updateSalesForm('vatInvoiceIssued', event.target.checked)} />
                    <span className="font-bold text-amber-700">ออกใบกำกับภาษีแล้ว</span>
                  </label>
                  {salesForm.vatInvoiceIssued ? (
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <InputField error={salesFieldErrors.vatInvoiceNo} inputClassName="font-mono" label="เลขที่ใบกำกับภาษี" value={salesForm.vatInvoiceNo ?? ''} onChange={(value) => updateSalesForm('vatInvoiceNo', value || null)} />
                      <InputField error={salesFieldErrors.vatInvoiceDate} label="วันที่ใบกำกับภาษี" type="date" value={salesForm.vatInvoiceDate ?? ''} onChange={(value) => updateSalesForm('vatInvoiceDate', value || null)} />
                    </div>
                  ) : <div className="mt-1 text-xs text-amber-700">ยังไม่ได้ออกใบกำกับภาษี ต้องติดตามเพื่อใช้เอกสารขาย</div>}
                </div>
              ) : null}

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <Field error={salesFieldErrors.note} label="หมายเหตุ"><textarea className="w-full rounded-md border px-3 py-2" rows={2} value={salesForm.note ?? ''} onChange={(event) => updateSalesForm('note', event.target.value || null)} /></Field>
              </div>
            </div>
            <div className="flex justify-end gap-2 rounded-md-b-md border-t bg-white p-4">
              <button className="rounded-md border px-4 py-2 text-sm hover:bg-slate-50" disabled={isSaving} type="button" onClick={() => setShowSalesForm(false)}>ยกเลิก</button>
              <button className="rounded-md bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={() => void saveSalesBill()}>{isSaving ? 'กำลังบันทึก...' : 'บันทึกบิลขาย'}</button>
            </div>
          </div>
        </div>
      ) : null}
      {cancelingBill ? (
        <Dialog open={Boolean(cancelingBill)} onOpenChange={(open) => {
          if (open || isSaving) return
          setCancelingBill(null)
          setCancelNote('')
          setCancelNoteError('')
        }}>
          <DialogContent hideClose className="w-full rounded-md-t-md p-0 md:rounded-md">
            <DialogHeader className="border-b">
              <DialogTitle id="purchase-bill-cancel-title">ยกเลิกบิลรับซื้อ {cancelingBill.docNo}</DialogTitle>
              <DialogDescription>{cancelingBill.supplierName ?? '-'}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 p-4 text-sm">
              <label className="block text-xs font-medium text-slate-600" htmlFor="purchase-bill-cancel-note">หมายเหตุการยกเลิก *</label>
              <textarea
                id="purchase-bill-cancel-note"
                className="w-full rounded-md border px-3 py-2"
                maxLength={500}
                rows={3}
                value={cancelNote}
                onChange={(event) => {
                  setCancelNote(event.target.value)
                  setCancelNoteError('')
                }}
              />
              {cancelNoteError ? <div className="text-xs text-red-600">{cancelNoteError}</div> : null}
            </div>
            <DialogFooter>
              <Button disabled={isSaving} type="button" variant="ghost" onClick={() => {
                if (isSaving) return
                setCancelingBill(null)
                setCancelNote('')
                setCancelNoteError('')
              }}>ปิด</Button>
              <Button className="bg-red-600 hover:bg-red-700" disabled={isSaving} type="button" onClick={() => void cancelPurchaseBill()}>{isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  )
}

function Segment({ current, label, onClick, value }: { current: string; label: string; onClick: (value: string) => void; value: string }) {
  const active = current === value
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`} type="button" onClick={() => onClick(value)}>{label}</button>
}

function TransactionKpi({ label, tone, value }: { label: string; tone: 'amber' | 'blue' | 'emerald' | 'red' | 'slate'; value: string }) {
  const className = {
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-white text-slate-700',
  }[tone]
  return <div className={`rounded-md border p-3 shadow-sm ${className}`}><div className="text-xs opacity-75">{label}</div><div className="mt-1 break-words text-xl font-bold">{value}</div></div>
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase()
  if (['paid', 'received', 'complete', 'completed'].includes(normalized)) return 'bg-emerald-100 text-emerald-700'
  if (['partial', 'partially_paid'].includes(normalized)) return 'bg-blue-100 text-blue-700'
  if (['cancelled', 'void', 'reversed'].includes(normalized)) return 'bg-slate-200 text-slate-500'
  if (['unpaid', 'unreceived', 'open', 'draft'].includes(normalized)) return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-700'
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    cancelled: 'ยกเลิก',
    complete: 'เสร็จสิ้น',
    completed: 'เสร็จสิ้น',
    converted: 'เปิดบิลแล้ว',
    draft: 'Draft',
    open: 'ยังไม่จ่าย',
    paid: 'เสร็จสิ้น',
    partial: 'จ่ายบางส่วน',
    partially_paid: 'จ่ายบางส่วน',
    received: 'รับครบ',
    unreceived: 'ยังไม่รับเงิน',
    unpaid: 'ยังไม่จ่าย',
  }
  return labels[status.toLowerCase()] ?? status
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

function SortHeader({ activeKey, align, direction, label, onSort, sortKey }: { activeKey: SortKey; align: 'center' | 'left' | 'right'; direction: SortDirection; label: string; onSort: (key: SortKey) => void; sortKey: SortKey }) {
  const active = activeKey === sortKey
  const alignClass = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left'
  return (
    <th className={`p-2 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
      <button className={`inline-flex w-full items-center gap-1 ${alignClass} rounded-md px-1 py-0.5 hover:bg-slate-200`} type="button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className={`text-[10px] ${active ? 'text-slate-900' : 'text-slate-400'}`}>{active ? direction === 'asc' ? '▲' : '▼' : '↕'}</span>
      </button>
    </th>
  )
}

function formatBranchWarehouse(row: BillRow | StockIssueRow) {
  const branch = row.branchName?.trim()
  const warehouse = row.warehouseName?.trim()

  if (!branch) return warehouse || '-'
  if (!warehouse || warehouse === '-') return branch

  const normalizedBranch = normalizeBranchWarehouseName(branch)
  const normalizedWarehouse = normalizeBranchWarehouseName(warehouse)
  const normalizedWarehouseWithoutPrefix = normalizeBranchWarehouseName(warehouse.replace(/^คลัง/, ''))

  if (normalizedWarehouse === normalizedBranch || normalizedWarehouseWithoutPrefix === normalizedBranch) return branch

  return `${branch} / ${warehouse}`
}

function normalizeBranchWarehouseName(value: string) {
  return value.replace(/\s+/g, '').toLowerCase()
}

function StepBadge({ children, tone }: { children: ReactNode; tone: 'amber' | 'blue' | 'emerald' | 'purple' }) {
  const className = {
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    purple: 'bg-purple-100 text-purple-700',
  }[tone]
  return <span className={`flex size-6 items-center justify-center rounded-md-full text-xs ${className}`}>{children}</span>
}

function RadioCard({ active, label, note, onClick }: { active: boolean; label: string; note: string; onClick: () => void }) {
  return (
    <button className={`rounded-md border-2 p-3 text-left transition ${active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`} type="button" onClick={onClick}>
      <div className="font-bold">{label}</div>
      <div className="text-xs text-slate-500">{note}</div>
    </button>
  )
}

function isStockIssueRow(row: BillRow | StockIssueRow): row is StockIssueRow {
  return 'totalEstAmount' in row
}
