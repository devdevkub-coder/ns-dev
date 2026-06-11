'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Download, Printer, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CustomerSearchCombobox, Field, InputField, MoneyInputField, ProductSearchCombobox, SelectField, SupplierSearchCombobox, SummaryLine } from '@/components/daily/TransactionBillsFieldHelpers'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { TableNumberCell } from '@/components/ui/TableNumberCell'
import { CollapsedList } from '@/components/ui/CollapsedList'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/Table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { SELECTED_BRANCH_KEY } from '@/lib/branch-selection'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { firstErrorKeyFromZodIssues, focusFieldError, issueMapFromZodIssues } from '@/lib/form-errors'
import { formatDateDisplay, formatDecimalDisplay, formatDecimalDraft, sanitizeDecimalInput } from '@/lib/format'
import { purchaseBillCancelSchema, purchaseBillFormSchema, type PurchaseBillCancelValues, type PurchaseBillFormValues } from '@/lib/purchase-bill'
import { openPurchaseBillPrint, openPurchaseBillPrintWindow } from '@/lib/purchase-bill-print'
import { salesBillFormSchema, type SalesBillFormValues } from '@/lib/sales'
import { openSalesBillPrint, openSalesBillPrintWindow } from '@/lib/sales-bill-print'
import type { SalesBillDetail } from '@/lib/server/sales-bill-detail'

type BillRow = {
  advanceAllocatedAmount?: number
  advancePaymentDocNo?: string
  advancePaymentId?: string
  branchId?: string
  branchName?: string
  canEdit?: boolean
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
  hasActiveApproval?: boolean
  hasActivePayment?: boolean
  licensePlate?: string
  lockedReason?: string | null
  note?: string
  paidAmount?: number
  paymentWorkflowStatus?: string
  paymentDocNos?: string[]
  payableBalance?: number
  purchaseSource?: string
  receiptDocNos?: string[]
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

type PurchaseBillDetailTimelineEvent = {
  action: string
  actor: string
  createdAt: string
  details: string[]
  id: string
  status: string
  statusLabel: string
  title: string
  tone: 'amber' | 'blue' | 'emerald' | 'rose' | 'slate'
  transitionText: string
}

type PurchaseBillDetail = {
  advanceAllocatedAmount: number
  advancePaymentDocNo: string
  allocationRows: Array<{
    amount: number
    deductWeight: number
    grossWeight: number
    lineId: string
    lineNo: number
    note: string
    poDocNo: string | null
    price: number
    productCode: string
    productId: string
    productName: string
    qty: number
    receiptSummaryLabel: string
    receiptTicketDocNo: string
    receiptVehicleNo: string
    sourceLabel: string
    sourceType: string
    unit: string
  }>
  branchId: string
  branchName: string
  createdBy: string
  date: string
  discount: number
  docNo: string
  licensePlate: string
  note: string
  paidAmount: number
  payableBalance: number
  productSummaries: Array<{
    amount: number
    deductWeight: number
    grossWeight: number
    lineCount: number
    poDocNos: string[]
    productCode: string
    productId: string
    productName: string
    qty: number
    receiptDocNos: string[]
    sourceKinds: string[]
    unit: string
  }>
  receiptDocNos: string[]
  status: string
  statusLabel: string
  subtotal: number
  supplierAddress: string
  supplierCode: string
  supplierTaxId: string
  supplierName: string
  timeline: PurchaseBillDetailTimelineEvent[]
  totalAmount: number
  transactionMode: string
  vatAmount: number
  vatInvoiceDate: string
  vatInvoiceNo: string
  vatInvoiceReceived: boolean
  warehouseName: string
  refNo: string
  salesName: string
}

function isPurchaseBillDetail(row: BillRow | PurchaseBillDetail): row is PurchaseBillDetail {
  return Array.isArray((row as PurchaseBillDetail).allocationRows)
}

function isSalesBillDetail(row: BillRow | SalesBillDetail): row is SalesBillDetail {
  return typeof (row as SalesBillDetail).customerCode === 'string'
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
  advanceDate?: string | null
  amount?: number | null
  branch_id?: string | null
  code?: string | null
  customer_id?: string | null
  id: string
  label?: string | null
  name: string
  product_id?: string | null
  remainingAmount?: number | null
  remainingQty?: number | null
  sales_id?: string | null
  sales_name?: string | null
  status?: string | null
  supplier_id?: string | null
  type?: string | null
  unitPrice?: number | null
  unit?: string | null
}

type PurchasePayload = {
  advancePayments: Option[]
  branches: Option[]
  poBuys: Option[]
  products: Option[]
  receipts: ReceiptOption[]
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
  customerAdvancePayments: Option[]
  deliveries: DeliveryOption[]
  salesChannels: Option[]
}

type ReceiptOption = {
  branchId: string
  branchName: string
  documentDate: string
  documentNo: string
  id: string
  lines: Array<{
    deductWeight: number
    grossWeight: number
    id: string
    lineNo: number
    netWeight: number
    note: string
    productId: string
    productName: string
    remainingQty: number
    usedQty: number
  }>
  productSummaries: Array<{
    billedWeight: number
    deductWeight: number
    grossWeight: number
    hasMixedDeductionProfiles: boolean
    id: string
    lineCount: number
    netWeight: number
    productId: string
    productName: string
    remainingWeight: number
    sourceLineIds: string[]
  }>
  partyName: string
  status: string
  supplierId: string
  vehicleNo: string
}

type DeliveryOption = {
  branchId: string
  branchName: string
  customerId: string
  documentDate: string
  documentNo: string
  id: string
  lines: Array<{
    deductWeight: number
    grossWeight: number
    id: string
    lineNo: number
    netWeight: number
    note: string
    productId: string
    productName: string
    remainingQty: number
    usedQty: number
  }>
  partyName: string
  productSummaries: Array<{
    billedWeight: number
    deductWeight: number
    grossWeight: number
    hasMixedDeductionProfiles: boolean
    id: string
    lineCount: number
    netWeight: number
    productId: string
    productName: string
    remainingWeight: number
    sourceLineIds: string[]
  }>
  status: string
  vehicleNo: string
}

type TransactionPayload = {
  rows: Array<BillRow | StockIssueRow>
  totalAmount?: number
  totalRows?: number
}

type SalesPayload = TransactionPayload & {
  branches: Option[]
  customers: Option[]
  customerAdvancePayments: Option[]
  deliveries: DeliveryOption[]
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
type TransactionBillColumnKey = 'action' | 'date' | 'docNo' | 'gp' | 'itemCount' | 'outstanding' | 'paidAmount' | 'partyName' | 'paymentDocs' | 'receiptDocs' | 'refNo' | 'status' | 'stockCost' | 'stockQty' | 'totalAmount' | 'transactionMode' | 'updatedBy' | 'vat' | 'warehouse'

type MultiSegmentOption = {
  label: string
  values: string[]
}

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
  receiptLineId: null,
  receiptLineIds: [],
  receiptSummaryId: null,
  receiptTicketDocNo: null,
  receiptTicketId: null,
  salesPrice: 0,
})

const purchaseBillColumns: Array<ResizableColumnDefinition<TransactionBillColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'receiptDocs', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 140, minWidth: 110 },
  { key: 'partyName', defaultWidth: 320, minWidth: 140 },
  { key: 'transactionMode', defaultWidth: 120, minWidth: 100 },
  { key: 'status', defaultWidth: 140, minWidth: 120 },
  { key: 'paymentDocs', defaultWidth: 150, minWidth: 120 },
  { key: 'totalAmount', defaultWidth: 85, minWidth: 80 },
  { key: 'outstanding', defaultWidth: 85, minWidth: 80 },
  { key: 'updatedBy', defaultWidth: 170, minWidth: 130 },
  { key: 'action', defaultWidth: 210, minWidth: 190 },
]

const salesBillColumns: Array<ResizableColumnDefinition<TransactionBillColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'refNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'partyName', defaultWidth: 320, minWidth: 140 },
  { key: 'warehouse', defaultWidth: 160, minWidth: 120 },
  { key: 'transactionMode', defaultWidth: 120, minWidth: 100 },
  { key: 'status', defaultWidth: 140, minWidth: 120 },
  { key: 'itemCount', defaultWidth: 75, minWidth: 60 },
  { key: 'totalAmount', defaultWidth: 85, minWidth: 80 },
  { key: 'gp', defaultWidth: 85, minWidth: 80 },
  { key: 'paidAmount', defaultWidth: 85, minWidth: 80 },
  { key: 'outstanding', defaultWidth: 85, minWidth: 80 },
  { key: 'vat', defaultWidth: 85, minWidth: 80 },
  { key: 'updatedBy', defaultWidth: 170, minWidth: 130 },
  { key: 'action', defaultWidth: 150, minWidth: 140 },
]

const stockIssueColumns: Array<ResizableColumnDefinition<TransactionBillColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'partyName', defaultWidth: 320, minWidth: 140 },
  { key: 'warehouse', defaultWidth: 160, minWidth: 120 },
  { key: 'status', defaultWidth: 140, minWidth: 120 },
  { key: 'itemCount', defaultWidth: 75, minWidth: 60 },
  { key: 'stockQty', defaultWidth: 85, minWidth: 80 },
  { key: 'stockCost', defaultWidth: 85, minWidth: 80 },
  { key: 'totalAmount', defaultWidth: 85, minWidth: 80 },
  { key: 'action', defaultWidth: 230, minWidth: 200 },
]

function formatPercent(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: value % 1 === 0 ? 0 : 2 })
}

function poQtyVariance(poQty: number, itemQty: number) {
  const diff = poQty - itemQty
  if (Math.abs(diff) < 0.001) return { className: 'text-emerald-700', text: 'ตรงกับ PO' }
  if (diff > 0) return { className: 'text-amber-700', text: `ขาด ${formatMoney(diff)} กก.` }
  return { className: 'text-red-700', text: `เกิน ${formatMoney(Math.abs(diff))} กก.` }
}

function summaryQtyVariance(expectedQty: number, allocatedQty: number) {
  const diff = expectedQty - allocatedQty
  if (Math.abs(diff) < 0.001) return { className: 'text-emerald-700', text: 'จัดสรรในบิลนี้ครบแล้ว' }
  if (diff > 0) return { className: 'text-amber-700', text: `ค้างจัดสรรในบิลนี้ ${formatMoney(diff)} กก.` }
  return { className: 'text-red-700', text: `จัดสรรในบิลนี้เกิน ${formatMoney(Math.abs(diff))} กก.` }
}

function advancePaymentStatusLabel(status: string | null | undefined) {
  const labels: Record<string, string> = {
    allocated: 'ใช้หักบิลแล้ว',
    approved: 'อนุมัติแล้ว รอจ่ายเงินจริง',
    cancelled: 'ยกเลิก',
    paid: 'พร้อมใช้หักบิล',
    partially_allocated: 'ใช้หักบิลบางส่วน',
    partially_approved: 'อนุมัติแล้วบางส่วน',
    pending_approval: 'ยังไม่อนุมัติ',
  }
  return labels[status ?? ''] ?? (status || '-')
}

const numberInputClass = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

function InlineMoneyInput({
  disabled = false,
  error,
  errorKey,
  inputClassName,
  value,
  onChange,
}: {
  disabled?: boolean
  error?: string
  errorKey?: string
  inputClassName?: string
  value: number
  onChange: (value: number) => void
}) {
  const [draftValue, setDraftValue] = useState<string | null>(null)

  return (
    <>
      <Input
        data-error-key={errorKey}
        inputMode="decimal"
        className={`w-full text-right tabular-nums ${error ? 'border-red-400 bg-red-50 text-red-700' : ''} ${disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''} ${inputClassName ?? ''}`}
        disabled={disabled}
        type="text"
        value={draftValue ?? formatDecimalDisplay(value || null, 2)}
        onBlur={(event) => {
          const nextValue = sanitizeDecimalInput(event.target.value, 2)
          if (nextValue.trim() === '' || nextValue.trim() === '.') {
            setDraftValue(null)
            onChange(0)
            return
          }
          const parsed = Number(nextValue)
          setDraftValue(null)
          onChange(Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0)
        }}
        onChange={(event) => {
          const nextValue = sanitizeDecimalInput(event.target.value, 2)
          setDraftValue(nextValue)
          if (nextValue.trim() === '' || nextValue.trim() === '.') {
            onChange(0)
            return
          }
          const parsed = Number(nextValue)
          onChange(Number.isFinite(parsed) ? parsed : 0)
        }}
        onFocus={(event) => {
          setDraftValue(value > 0 ? formatDecimalDraft(value, 2) : '')
          requestAnimationFrame(() => {
            const end = event.target.value.length
            event.target.setSelectionRange(end, end)
          })
        }}
      />
      {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
    </>
  )
}

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
  advancePaymentId: null,
  branchId: '',
  discountTotal: 0,
  hasVat: false,
  items: [],
  note: null,
  notes: null,
  poBuyId: null,
  purchaseSource: 'SPOT_BUY',
  receiptTicketId: null,
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

const initialSalesForm = (): SalesBillFormValues => ({
  branchId: null,
  channelId: null,
  customerAdvanceId: null,
  customerId: '',
  deliveryTicketId: null,
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

const purchaseStatusOptions: MultiSegmentOption[] = [
  { label: 'ทุกสถานะ', values: [] },
  { label: 'ยังไม่อนุมัติ', values: ['pending_approval'] },
  { label: 'รอจ่าย', values: ['pending_payment'] },
  { label: 'ชำระบางส่วน', values: ['partial_paid'] },
  { label: 'เสร็จสิ้น', values: ['paid'] },
  { label: 'ยกเลิก', values: ['cancelled'] },
  { label: 'ยกเลิก/เปลี่ยน Supplier', values: ['cancelled_supplier_swap'] },
]

const salesStatusOptions: MultiSegmentOption[] = [
  { label: 'ทุกสถานะ', values: [] },
  { label: 'ยังไม่รับเงิน', values: ['unreceived'] },
  { label: 'รับเงินบางส่วน', values: ['partial'] },
  { label: 'เสร็จสิ้น', values: ['received'] },
  { label: 'ยกเลิก', values: ['cancelled'] },
]

export function TransactionBillsPageClient({ mode }: TransactionBillsPageClientProps) {
  const [cancelNote, setCancelNote] = useState('')
  const [cancelNoteError, setCancelNoteError] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [cancelingBill, setCancelingBill] = useState<BillRow | null>(null)
  const [detailBill, setDetailBill] = useState<PurchaseBillDetail | null>(null)
  const [detailBillDocNo, setDetailBillDocNo] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [branchFilter, setBranchFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [filterMode, setFilterMode] = useState(mode === 'stock-issue' ? 'pending' : '')
  const [form, setForm] = useState<PurchaseBillFormValues>(initialPurchaseForm())
  const [editingBillId, setEditingBillId] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [options, setOptions] = useState<OptionsPayload>({ advancePayments: [], branches: [], customers: [], customerAdvancePayments: [], deliveries: [], poBuys: [], products: [], receipts: [], salesChannels: [], salespersons: [], suppliers: [], warehouses: [] })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [preferredBranchId, setPreferredBranchId] = useState<string | null>(null)
  const [printingBillDocNo, setPrintingBillDocNo] = useState<string | null>(null)
  const [rows, setRows] = useState<Array<BillRow | StockIssueRow>>([])
  const [search, setSearch] = useState('')
  const [salesFieldErrors, setSalesFieldErrors] = useState<Record<string, string>>({})
  const [salesForm, setSalesForm] = useState<SalesBillFormValues>(initialSalesForm())
  const [showSalesForm, setShowSalesForm] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [supplierSwapMode, setSupplierSwapMode] = useState(false)
  const [supplierSwapSupplierId, setSupplierSwapSupplierId] = useState('')
  const [lockedReceiptSnapshot, setLockedReceiptSnapshot] = useState<ReceiptOption | null>(null)
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [vatRatePercent, setVatRatePercent] = useState(7)
  const latestLoadRequestRef = useRef(0)
  const latestDetailRequestRef = useRef(0)
  const tableColumns = useMemo(() => {
    if (mode === 'purchase') return purchaseBillColumns
    if (mode === 'sales') return salesBillColumns
    return stockIssueColumns
  }, [mode])
  const columnResize = useResizableColumns(`daily.transaction-bills.${mode}`, tableColumns)
  const apiPath = mode === 'purchase' ? '/api/purchase/bills' : mode === 'sales' ? '/api/sales/bills' : '/api/sales/stock-issue'
  const requestPath = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortDirection,
      sortKey,
    })
    if (mode === 'purchase' && branchFilter) params.set('branchId', branchFilter)
    if (search.trim()) params.set('search', search.trim())
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if ((mode === 'purchase' || mode === 'sales') && filterMode) params.set('filterMode', filterMode)
    if ((mode === 'purchase' || mode === 'sales') && statusFilter.length > 0) params.set('status', statusFilter.join(','))
    if (mode === 'stock-issue' && filterMode) params.set('status', filterMode)
    return `${apiPath}?${params.toString()}`
  }, [apiPath, branchFilter, dateFrom, dateTo, filterMode, mode, page, pageSize, search, sortDirection, sortKey, statusFilter])

  const activeFilters = Boolean(
    search.trim() !== '' ||
    branchFilter !== '' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    filterMode !== (mode === 'stock-issue' ? 'pending' : '') ||
    statusFilter.length > 0
  )

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
          advancePayments: payload.advancePayments,
          branches: payload.branches,
          customers: [],
          customerAdvancePayments: [],
          deliveries: [],
          poBuys: payload.poBuys,
          products: payload.products,
          receipts: payload.receipts,
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
          customerAdvancePayments: payload.customerAdvancePayments ?? [],
          deliveries: payload.deliveries ?? [],
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
  }, [branchFilter, dateFrom, dateTo, filterMode, pageSize, search, sortDirection, sortKey, statusFilter])

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows
  const total = totalAmount
  const title = mode === 'purchase' ? 'บิลรับซื้อ' : mode === 'sales' ? 'บิลขาย' : 'เบิกออกรอบิล'
  const activeBranches = options.branches.filter((option) => option.active !== false)
  const resolvedPreferredBranchId = preferredBranchId && activeBranches.some((branch) => branch.id === preferredBranchId) ? preferredBranchId : null
  const activePoBuys = options.poBuys.filter((option) => option.active !== false && (!form.supplierId || option.supplier_id === form.supplierId))
  const advanceLookupSupplierId = supplierSwapMode ? supplierSwapSupplierId : form.supplierId
  const matchingAdvancePayments = options.advancePayments.filter((option) => {
    if (!advanceLookupSupplierId || option.supplier_id !== advanceLookupSupplierId) return false
    if (form.branchId && option.branch_id && option.branch_id !== form.branchId) return false
    return true
  })
  const activeAdvancePayments = matchingAdvancePayments.filter((option) => {
    const isSelected = option.id === form.advancePaymentId
    return isSelected || (option.active !== false && (option.remainingAmount ?? 0) > 0.01)
  })
  const inactiveAdvancePayments = matchingAdvancePayments.filter((option) => !activeAdvancePayments.some((activeOption) => activeOption.id === option.id))
  const activeCustomers = options.customers.filter((option) => option.active !== false)
  const matchingCustomerAdvancePayments = (options.customerAdvancePayments ?? []).filter((option) => {
    if (!salesForm.customerId || option.customer_id !== salesForm.customerId) return false
    return true
  })
  const activeCustomerAdvancePayments = matchingCustomerAdvancePayments.filter((option) => {
    const isSelected = option.id === salesForm.customerAdvanceId
    return isSelected || (option.active !== false && (option.remainingAmount ?? 0) > 0.01)
  })
  const activeProducts = options.products.filter((option) => option.active !== false)
  const activeReceipts = options.receipts.filter((receipt) => {
    if (form.transactionMode !== 'STOCK') return false
    if (form.branchId && receipt.branchId !== form.branchId) return false
    if (form.supplierId && receipt.supplierId !== form.supplierId) return false
    return true
  })
  const activeDeliveries = (options.deliveries ?? []).filter((delivery) => {
    if (salesForm.transactionMode !== 'STOCK') return false
    if (salesForm.branchId && delivery.branchId !== salesForm.branchId) return false
    if (salesForm.customerId && delivery.customerId !== salesForm.customerId) return false
    return true
  })
  const activeSalesChannels = options.salesChannels.filter((option) => option.active !== false)
  const activeSuppliers = options.suppliers.filter((option) => option.active !== false)
  const defaultPurchaseWarehouse = useCallback((branchId: string) => options.warehouses.find((warehouse) => warehouse.active !== false && warehouse.branch_id === branchId && warehouse.type?.toUpperCase() === 'RM') ?? null, [options.warehouses])
  const defaultPurchaseWarehouseId = useCallback((branchId: string) => defaultPurchaseWarehouse(branchId)?.id ?? null, [defaultPurchaseWarehouse])
  const selectedPurchaseWarehouse = form.warehouseId ? options.warehouses.find((warehouse) => warehouse.id === form.warehouseId) ?? null : null
  const purchaseWarehouseDisplayValue = form.branchId
    ? selectedPurchaseWarehouse?.name ?? 'ไม่พบคลัง RM ของสาขานี้'
    : 'เลือกสาขาก่อน'
  const selectedSupplier = form.supplierId
    ? activeSuppliers.find((supplier) => supplier.id === form.supplierId) ?? null
    : null
  const selectedSupplierCaretakerName = selectedSupplier?.sales_name
    ?? (selectedSupplier?.sales_id
      ? options.salespersons.find((salesperson) => salesperson.id === selectedSupplier.sales_id)?.name ?? null
      : null)
  const editingBill = editingBillId ? rows.find((row): row is BillRow => !isStockIssueRow(row) && row.id === editingBillId) : null
  const formVatRatePercent = editingBill?.vatRatePercent ?? vatRatePercent
  const formSubtotal = form.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price), 0)
  const formTotalWeight = form.items.reduce((sum, item) => sum + item.qty, 0)
  const formAfterDiscount = Math.max(0, formSubtotal - form.discountTotal)
  const formVat = !form.hasVat || form.vatType === 'NONE' ? 0 : form.vatType === 'INCLUDE' ? formAfterDiscount * formVatRatePercent / (100 + formVatRatePercent) : formAfterDiscount * (formVatRatePercent / 100)
  const formTotal = form.hasVat && form.vatType === 'EXCLUDE' ? formAfterDiscount + formVat : formAfterDiscount
  const selectedAdvancePayment = form.advancePaymentId
    ? activeAdvancePayments.find((option) => option.id === form.advancePaymentId)
      ?? null
    : null
  const editingAdvanceCarry = editingBill && editingBill.advancePaymentId === form.advancePaymentId
    ? editingBill.advanceAllocatedAmount ?? 0
    : 0
  const availableAdvanceAmount = selectedAdvancePayment
    ? Math.max(0, (selectedAdvancePayment.remainingAmount ?? 0) + editingAdvanceCarry)
    : 0
  const formAdvanceApplied = Math.min(formTotal, availableAdvanceAmount)
  const formNetPayable = Math.max(0, formTotal - formAdvanceApplied)
  const salesSubtotal = salesForm.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const salesAfterDiscount = Math.max(0, salesSubtotal - salesForm.discountTotal)
  const salesVat = !salesForm.hasVat || salesForm.vatType === 'NONE' ? 0 : salesForm.vatType === 'INCLUDE' ? salesAfterDiscount * formVatRatePercent / (100 + formVatRatePercent) : salesAfterDiscount * (formVatRatePercent / 100)
  const salesTotal = salesForm.hasVat && salesForm.vatType === 'EXCLUDE' ? salesAfterDiscount + salesVat : salesAfterDiscount
  const selectedCustomerAdvancePayment = salesForm.customerAdvanceId
    ? activeCustomerAdvancePayments.find((option) => option.id === salesForm.customerAdvanceId) ?? null
    : null
  const salesCustomerAdvanceApplied = selectedCustomerAdvancePayment ? Math.min(salesTotal, selectedCustomerAdvancePayment.remainingAmount ?? 0) : 0
  const salesReceivableBalance = Math.max(0, salesTotal - salesCustomerAdvanceApplied)
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
  const tableColSpan = mode === 'purchase' ? 11 : mode === 'sales' ? 15 : 10
  const statusOptions = mode === 'purchase' ? purchaseStatusOptions : salesStatusOptions
  const selectedReceipt = (() => {
    if (!form.receiptTicketId) return null
    if (lockedReceiptSnapshot?.id === form.receiptTicketId) return lockedReceiptSnapshot
    const option = options.receipts.find((receipt) => receipt.id === form.receiptTicketId)
    if (option) return option
    if (form.items.length === 0) return null
    const fallbackSummaries = new Map<string, ReceiptOption['productSummaries'][number]>()
    form.items.forEach((item, index) => {
      const summaryId = item.receiptSummaryId ?? item.receiptLineId ?? `${index + 1}`
      const current = fallbackSummaries.get(summaryId)
      if (current) {
        current.netWeight += item.qty
        current.remainingWeight += item.qty
        current.billedWeight += item.qty
        current.sourceLineIds = [...new Set([...current.sourceLineIds, ...item.receiptLineIds])]
        return
      }
      fallbackSummaries.set(summaryId, {
        billedWeight: item.qty,
        deductWeight: item.deductWeight,
        grossWeight: item.grossWeight,
        hasMixedDeductionProfiles: false,
        id: summaryId,
        lineCount: Math.max(1, item.receiptLineIds.length || 1),
        netWeight: item.qty,
        productId: item.productId,
        productName: activeProducts.find((product) => product.id === item.productId)?.name ?? item.productId,
        remainingWeight: item.qty,
        sourceLineIds: item.receiptLineIds,
      })
    })
    return {
      branchId: form.branchId,
      branchName: activeBranches.find((branch) => branch.id === form.branchId)?.name ?? '-',
      documentDate: '',
      documentNo: form.items[0]?.receiptTicketDocNo ?? '',
      id: form.receiptTicketId,
      lines: form.items.map((item, index) => ({
        deductWeight: item.deductWeight,
        grossWeight: item.grossWeight,
        id: item.receiptLineId ?? item.receiptSummaryId ?? `${index + 1}`,
        lineNo: index + 1,
        netWeight: item.qty,
        note: item.note ?? '',
        productId: item.productId,
        productName: activeProducts.find((product) => product.id === item.productId)?.name ?? item.productId,
        remainingQty: item.qty,
        usedQty: 0,
      })),
      productSummaries: [...fallbackSummaries.values()],
      partyName: activeSuppliers.find((supplier) => supplier.id === form.supplierId)?.name ?? '-',
      status: '',
      supplierId: form.supplierId,
      vehicleNo: '',
    } satisfies ReceiptOption
  })()
  const stockReceiptPrerequisiteReady = form.transactionMode !== 'STOCK' || (Boolean(form.branchId) && Boolean(form.supplierId))
  const stockReceiptLocked = form.transactionMode === 'STOCK' && Boolean(form.receiptTicketId)
  const supplierLockedByReceipt = stockReceiptLocked
  const stockReceiptSelected = form.transactionMode !== 'STOCK' || Boolean(selectedReceipt)
  const receiptOptionsForSelect = selectedReceipt && !activeReceipts.some((receipt) => receipt.id === selectedReceipt.id)
    ? [selectedReceipt, ...activeReceipts]
    : activeReceipts
  const selectedDelivery = salesForm.deliveryTicketId
    ? (options.deliveries ?? []).find((delivery) => delivery.id === salesForm.deliveryTicketId) ?? null
    : null
  const stockDeliveryPrerequisiteReady = salesForm.transactionMode !== 'STOCK' || (Boolean(salesForm.branchId) && Boolean(salesForm.customerId))
  const deliveryOptionsForSelect = selectedDelivery && !activeDeliveries.some((delivery) => delivery.id === selectedDelivery.id)
    ? [selectedDelivery, ...activeDeliveries]
    : activeDeliveries
  const salesPriceEditable = Boolean(form.supplierId && form.salesId)
  const supplierSwapOptions = activeSuppliers.map((supplier) => ({
    id: supplier.id,
    label: `${supplier.code ? `${supplier.code} — ` : ''}${supplier.name}`,
    searchText: `${supplier.code ?? ''} ${supplier.name} ${supplier.id}`.toLowerCase(),
  }))
  const receiptSummaryById = new Map((selectedReceipt?.productSummaries ?? []).map((summary) => [summary.id, summary]))
  const stockSummaryDraft = (() => {
    const map = new Map<string, {
      allocatedQty: number
      expectedQty: number
      rowIndices: number[]
      summary: ReceiptOption['productSummaries'][number] | null
    }>()
    form.items.forEach((item, index) => {
      const summaryId = item.receiptSummaryId ?? item.receiptLineId ?? ''
      if (!summaryId) return
      const current = map.get(summaryId)
      const summary = receiptSummaryById.get(summaryId) ?? null
      if (current) {
        current.allocatedQty += item.qty
        current.rowIndices.push(index)
        return
      }
      map.set(summaryId, {
        allocatedQty: item.qty,
        expectedQty: summary?.remainingWeight ?? item.qty,
        rowIndices: [index],
        summary,
      })
    })
    return map
  })()

  useEffect(() => {
    if (mode !== 'purchase') return
    if (form.transactionMode !== 'STOCK') return
    if (!form.branchId) return

    const nextWarehouseId = defaultPurchaseWarehouseId(form.branchId)
    if (nextWarehouseId === form.warehouseId) return

    setForm((current) => {
      if (current.transactionMode !== 'STOCK' || !current.branchId) return current
      const nextWarehouseId = defaultPurchaseWarehouseId(current.branchId)
      if (nextWarehouseId === current.warehouseId) return current
      return { ...current, warehouseId: nextWarehouseId }
    })
  }, [defaultPurchaseWarehouseId, form.branchId, form.transactionMode, form.warehouseId, mode])

  function summaryAvailableForRow(summaryId: string | null, index: number) {
    if (!summaryId) return 0
    const summary = receiptSummaryById.get(summaryId)
    if (!summary) return 0
    const allocatedOtherRows = form.items.reduce((sum, item, itemIndex) => {
      if (itemIndex === index) return sum
      return (item.receiptSummaryId ?? item.receiptLineId) === summaryId ? sum + item.qty : sum
    }, 0)
    return Math.max(0, summary.remainingWeight - allocatedOtherRows)
  }

  function poOptionForProduct(poBuyId: string | null | undefined, productId: string | null | undefined) {
    if (!poBuyId) return null
    const productMatched = productId
      ? activePoBuys.find((option) => option.id === poBuyId && option.product_id === productId)
      : null
    return productMatched
      ?? activePoBuys.find((option) => option.id === poBuyId && !option.product_id)
      ?? activePoBuys.find((option) => option.id === poBuyId)
      ?? null
  }

  function poAvailableForRow(poBuyId: string | null, index: number) {
    if (!poBuyId) return 0
    const currentItem = form.items[index]
    const currentProductId = currentItem?.productId ?? null
    const po = poOptionForProduct(poBuyId, currentProductId)
    if (!po) return 0
    const allocatedOtherRows = form.items.reduce((sum, item, itemIndex) => {
      if (itemIndex === index) return sum
      if (item.poBuyId !== poBuyId) return sum
      if (currentProductId && item.productId !== currentProductId) return sum
      return sum + item.qty
    }, 0)
    return Math.max(0, (po.remainingQty ?? 0) - allocatedOtherRows)
  }

  const stockAllocationIssues = (() => {
    if (form.transactionMode !== 'STOCK' || !selectedReceipt) return []
    return selectedReceipt.productSummaries.flatMap((summary) => {
      const state = stockSummaryDraft.get(summary.id)
      const allocatedQty = state?.allocatedQty ?? 0
      const variance = summaryQtyVariance(summary.remainingWeight, allocatedQty)
      if (Math.abs(summary.remainingWeight - allocatedQty) < 0.001) return []
      return [{
        className: variance.className,
        message: `${summary.productName}: ${variance.text}`,
        rowIndex: state?.rowIndices[0] ?? null,
        summaryId: summary.id,
      }]
    })
  })()

  function receiptToBillItems(receipt: ReceiptOption): PurchaseBillFormValues['items'] {
    return receipt.productSummaries.map((summary) => ({
      deductWeight: summary.deductWeight,
      discount: 0,
      displayName: null,
      grossWeight: summary.grossWeight,
      lotNo: null,
      note: null,
      poBuyId: null,
      price: 0,
      productId: summary.productId,
      qty: summary.remainingWeight,
      receiptLineId: summary.sourceLineIds[0] ?? null,
      receiptLineIds: summary.sourceLineIds,
      receiptSummaryId: summary.id,
      receiptTicketDocNo: receipt.documentNo,
      receiptTicketId: receipt.id,
      salesPrice: 0,
    }))
  }

  function deliveryToSalesItems(delivery: DeliveryOption): SalesBillFormValues['items'] {
    return delivery.productSummaries.map((summary) => ({
      deliveryLineId: summary.sourceLineIds[0] ?? null,
      deliverySummaryId: summary.id,
      deliveryTicketDocNo: delivery.documentNo,
      deliveryTicketId: delivery.id,
      discount: 0,
      note: null,
      price: 0,
      productId: summary.productId,
      qty: summary.remainingWeight,
    }))
  }

  function clearFilters() {
    setBranchFilter('')
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setFilterMode('')
    setStatusFilter([])
  }

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'date' || nextKey === 'totalAmount' || nextKey === 'outstanding' ? 'desc' : 'asc')
  }

  async function openRow(row: BillRow | StockIssueRow) {
    if (mode !== 'purchase' || isStockIssueRow(row)) return
    const docNo = row.docNo || row.id
    const requestId = latestDetailRequestRef.current + 1
    latestDetailRequestRef.current = requestId
    setDetailBillDocNo(docNo)
    setDetailBill(null)
    setDetailError(null)
    setIsDetailLoading(true)
    try {
      const detail = await dailyFetchJson<PurchaseBillDetail>(`/api/purchase/bills/${encodeURIComponent(docNo)}`)
      if (latestDetailRequestRef.current !== requestId) return
      setDetailBill(detail)
    } catch (caught) {
      if (latestDetailRequestRef.current !== requestId) return
      setDetailError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดบิลรับซื้อไม่ได้')
    } finally {
      if (latestDetailRequestRef.current !== requestId) return
      setIsDetailLoading(false)
    }
  }

  async function printPurchaseBill(rowOrDetail: BillRow | PurchaseBillDetail) {
    const docNo = rowOrDetail.docNo
    setPrintingBillDocNo(docNo)
    setError(null)
    let printWindow: Window | null = null
    try {
      printWindow = openPurchaseBillPrintWindow()
      const detail = isPurchaseBillDetail(rowOrDetail)
        ? rowOrDetail
        : await dailyFetchJson<PurchaseBillDetail>(`/api/purchase/bills/${encodeURIComponent(docNo)}`)
      await openPurchaseBillPrint(detail, printWindow)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'เปิดใบพิมพ์บิลรับซื้อไม่ได้')
      printWindow?.close()
    } finally {
      setPrintingBillDocNo(null)
    }
  }

  async function printSalesBill(rowOrDetail: BillRow | SalesBillDetail) {
    const docNo = rowOrDetail.docNo
    setPrintingBillDocNo(docNo)
    setError(null)
    let printWindow: Window | null = null
    try {
      printWindow = openSalesBillPrintWindow()
      const detail = isSalesBillDetail(rowOrDetail)
        ? rowOrDetail
        : await dailyFetchJson<SalesBillDetail>(`/api/sales/bills/${encodeURIComponent(docNo)}`)
      await openSalesBillPrint(detail, printWindow)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'เปิดใบพิมพ์บิลขายไม่ได้')
      printWindow?.close()
    } finally {
      setPrintingBillDocNo(null)
    }
  }

  function openPurchaseForm() {
    setEditingBillId(null)
    setSupplierSwapMode(false)
    setSupplierSwapSupplierId('')
    setLockedReceiptSnapshot(null)
    setForm({ ...initialPurchaseForm(), branchId: resolvedPreferredBranchId ?? '' })
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  function openSalesForm() {
    setLockedReceiptSnapshot(null)
    setSalesForm({ ...initialSalesForm(), branchId: resolvedPreferredBranchId })
    setSalesFieldErrors({})
    setError(null)
    setShowSalesForm(true)
  }

  function purchaseFormFromRow(row: BillRow): PurchaseBillFormValues {
    const items = (row.items?.length ? row.items : []).map((item) => ({
      deductWeight: Number(item.deductWeight ?? 0),
      discount: 0,
      displayName: item.displayName ?? null,
      grossWeight: Number(item.grossWeight ?? item.qty ?? ('netWeight' in item ? item.netWeight : 0) ?? 0),
      lotNo: item.lotNo ?? null,
      note: item.note ?? null,
      poBuyId: item.poBuyId ?? null,
      price: Number(item.price ?? 0),
      productId: String(item.productId ?? ''),
      qty: Number(item.qty ?? ('netWeight' in item ? item.netWeight : 0) ?? 0),
      receiptLineId: 'receiptLineId' in item && typeof item.receiptLineId === 'string' ? item.receiptLineId : null,
      receiptLineIds: 'receiptLineIds' in item && Array.isArray(item.receiptLineIds)
        ? item.receiptLineIds.filter((value): value is string => typeof value === 'string')
        : [],
      receiptSummaryId: 'receiptSummaryId' in item && typeof item.receiptSummaryId === 'string' ? item.receiptSummaryId : null,
      receiptTicketDocNo: 'receiptTicketDocNo' in item && typeof item.receiptTicketDocNo === 'string' ? item.receiptTicketDocNo : null,
      receiptTicketId: 'receiptTicketId' in item && typeof item.receiptTicketId === 'string' ? item.receiptTicketId : null,
      salesPrice: Number(item.salesPrice ?? 0),
    }))

    return {
      advancePaymentId: row.advancePaymentId || null,
      branchId: row.branchId ?? '',
      discountTotal: row.discountTotal ?? 0,
      hasVat: row.hasVat ?? false,
      items,
      note: row.note || null,
      notes: row.note || null,
      poBuyId: row.poBuyId || null,
      purchaseSource: (row.purchaseSource === 'PO_RECEIPT' || row.purchaseSource === 'MIXED') ? row.purchaseSource : 'SPOT_BUY',
      receiptTicketId: items[0]?.receiptTicketId ?? null,
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

  function receiptSnapshotFromPurchaseForm(row: BillRow, sourceForm: PurchaseBillFormValues): ReceiptOption | null {
    if (!sourceForm.receiptTicketId || sourceForm.items.length === 0) return null
    const fallbackSummaries = new Map<string, ReceiptOption['productSummaries'][number]>()
    sourceForm.items.forEach((item, index) => {
      const summaryId = item.receiptSummaryId ?? item.receiptLineId ?? `${index + 1}`
      const productName = item.displayName
        ?? row.items?.[index]?.productName
        ?? activeProducts.find((product) => product.id === item.productId)?.name
        ?? item.productId
      const current = fallbackSummaries.get(summaryId)
      if (current) {
        current.netWeight += item.qty
        current.remainingWeight += item.qty
        current.billedWeight += item.qty
        current.sourceLineIds = [...new Set([...current.sourceLineIds, ...item.receiptLineIds])]
        return
      }
      fallbackSummaries.set(summaryId, {
        billedWeight: item.qty,
        deductWeight: item.deductWeight,
        grossWeight: item.grossWeight,
        hasMixedDeductionProfiles: false,
        id: summaryId,
        lineCount: Math.max(1, item.receiptLineIds.length || 1),
        netWeight: item.qty,
        productId: item.productId,
        productName,
        remainingWeight: item.qty,
        sourceLineIds: item.receiptLineIds,
      })
    })

    return {
      branchId: sourceForm.branchId,
      branchName: row.branchName ?? activeBranches.find((branch) => branch.id === sourceForm.branchId)?.name ?? '-',
      documentDate: row.date,
      documentNo: sourceForm.items[0]?.receiptTicketDocNo ?? row.receiptDocNos?.[0] ?? '',
      id: sourceForm.receiptTicketId,
      lines: sourceForm.items.map((item, index) => ({
        deductWeight: item.deductWeight,
        grossWeight: item.grossWeight,
        id: item.receiptLineId ?? item.receiptSummaryId ?? `${index + 1}`,
        lineNo: index + 1,
        netWeight: item.qty,
        note: item.note ?? '',
        productId: item.productId,
        productName: item.displayName
          ?? row.items?.[index]?.productName
          ?? activeProducts.find((product) => product.id === item.productId)?.name
          ?? item.productId,
        remainingQty: item.qty,
        usedQty: 0,
      })),
      partyName: row.supplierName ?? activeSuppliers.find((supplier) => supplier.id === row.supplierId)?.name ?? '-',
      productSummaries: [...fallbackSummaries.values()],
      status: '',
      supplierId: row.supplierId ?? sourceForm.supplierId,
      vehicleNo: row.licensePlate ?? '',
    }
  }

  function openEditPurchaseForm(row: BillRow) {
    if (row.canEdit === false) {
      setError(row.lockedReason ?? 'บิลนี้ยังแก้ไขไม่ได้')
      return
    }
    setEditingBillId(row.id)
    setSupplierSwapMode(false)
    setSupplierSwapSupplierId('')
    const nextForm = purchaseFormFromRow(row)
    setLockedReceiptSnapshot(receiptSnapshotFromPurchaseForm(row, nextForm))
    setForm(nextForm)
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  function openCancelPurchaseBill(row: BillRow) {
    if (row.canEdit === false) {
      setError(row.lockedReason ?? 'บิลนี้ยังยกเลิกไม่ได้')
      return
    }
    setCancelingBill(row)
    setCancelNote('')
    setCancelNoteError('')
    setError(null)
  }

  function enterSupplierSwapMode() {
    setLockedReceiptSnapshot((current) => current ?? selectedReceipt)
    setSupplierSwapSupplierId('')
    setSupplierSwapMode(true)
    setForm((current) => ({
      ...current,
      advancePaymentId: null,
      poBuyId: null,
      purchaseSource: 'SPOT_BUY',
      items: current.items.map((item) => ({
        ...item,
        poBuyId: null,
      })),
    }))
    setFieldErrors((current) => ({
      ...current,
      advancePaymentId: '',
      supplierSwapSupplierId: '',
    }))
    setError(null)
  }

  function resetStockDependentFields(next: PurchaseBillFormValues) {
    next.discountTotal = 0
    next.hasVat = false
    next.items = []
    next.note = null
    next.notes = null
    next.receiptTicketId = null
    next.vatInvoiceDate = null
    next.vatInvoiceNo = null
    next.vatInvoiceReceived = false
    next.vatType = 'NONE'
  }

  function clearSelectedStockReceipt() {
    setForm((current) => {
      const next = { ...current }
      resetStockDependentFields(next)
      return next
    })
    setFieldErrors((current) => ({
      ...current,
      items: '',
      note: '',
      notes: '',
      receiptTicketId: '',
    }))
  }

  function updateForm<K extends keyof PurchaseBillFormValues>(key: K, value: PurchaseBillFormValues[K]) {
    setForm((current) => {
      const stockContextLocked = current.transactionMode === 'STOCK' && Boolean(current.receiptTicketId)
      if (current.transactionMode === 'STOCK' && key === 'warehouseId') return current
      if (
        stockContextLocked
        && (
          (key === 'branchId' && value !== current.branchId)
          || (key === 'supplierId' && value !== current.supplierId)
          || (key === 'warehouseId' && value !== current.warehouseId)
          || (key === 'receiptTicketId' && value !== current.receiptTicketId)
          || (key === 'transactionMode' && value !== current.transactionMode)
        )
      ) {
        return current
      }

      const nextBranchId = key === 'branchId' && typeof value === 'string' ? value : current.branchId
      const next: PurchaseBillFormValues = {
        ...current,
        [key]: value,
        ...(key === 'supplierId' ? { salesId: activeSuppliers.find((supplier) => supplier.id === value)?.sales_id ?? null } : {}),
        ...(key === 'branchId' ? { warehouseId: current.transactionMode === 'STOCK' ? defaultPurchaseWarehouseId(nextBranchId) : null } : {}),
        ...(key === 'hasVat' ? { vatType: (value ? 'EXCLUDE' : 'NONE') as PurchaseBillFormValues['vatType'] } : {}),
        ...(key === 'vatInvoiceReceived' && value === false ? { vatInvoiceDate: null, vatInvoiceNo: null } : {}),
      }

      if (key === 'transactionMode') {
        if (value === 'TRADING') {
          next.warehouseId = null
          next.receiptTicketId = null
          next.items = current.items.length > 0 ? current.items.map((item) => ({
            ...item,
            receiptLineId: null,
            receiptLineIds: [],
            receiptSummaryId: null,
            receiptTicketDocNo: null,
            receiptTicketId: null,
          })) : [blankItem()]
        } else {
          resetStockDependentFields(next)
          next.warehouseId = next.branchId ? defaultPurchaseWarehouseId(next.branchId) : null
        }
      }

      if (key === 'branchId' || key === 'supplierId') {
        if (key === 'supplierId' && value !== current.supplierId) {
          next.advancePaymentId = null
        }
        if (key === 'branchId' && value !== current.branchId) {
          next.advancePaymentId = null
        }
        if (next.transactionMode === 'STOCK') {
          resetStockDependentFields(next)
          next.warehouseId = next.branchId ? defaultPurchaseWarehouseId(next.branchId) : null
        }
      }

      if (key === 'receiptTicketId') {
        const receiptId = typeof value === 'string' ? value : ''
        const receipt = options.receipts.find((option) => option.id === receiptId)
        next.discountTotal = 0
        next.hasVat = false
        next.items = receipt ? receiptToBillItems(receipt) : []
        next.note = null
        next.notes = null
        next.vatInvoiceDate = null
        next.vatInvoiceNo = null
        next.vatInvoiceReceived = false
        next.vatType = 'NONE'
      }

      return next
    })
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

  function updateItemPoBuy(index: number, poBuyId: string | null) {
    setForm((current) => {
      const items = current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const po = poOptionForProduct(poBuyId, item.productId)
        if (current.transactionMode === 'STOCK') {
          const summaryId = item.receiptSummaryId ?? item.receiptLineId ?? null
          const summary = summaryId ? receiptSummaryById.get(summaryId) : null
          const allocatedOtherSummaryRows = current.items.reduce((sum, row, rowIndex) => {
            if (rowIndex === index) return sum
            return (row.receiptSummaryId ?? row.receiptLineId) === summaryId ? sum + row.qty : sum
          }, 0)
          const summaryCapacity = Math.max(0, (summary?.remainingWeight ?? item.qty) - allocatedOtherSummaryRows)
          const allocatedOtherPoRows = poBuyId
            ? current.items.reduce((sum, row, rowIndex) => {
              if (rowIndex === index) return sum
              if (row.poBuyId !== poBuyId) return sum
              if (item.productId && row.productId !== item.productId) return sum
              return sum + row.qty
            }, 0)
            : 0
          const poCapacity = poBuyId ? Math.max(0, (po?.remainingQty ?? 0) - allocatedOtherPoRows) : summaryCapacity
          return {
            ...item,
            poBuyId,
            price: poBuyId ? (po?.unitPrice ?? 0) : 0,
            qty: Math.min(summaryCapacity, poCapacity),
          }
        }
        return {
          ...item,
          poBuyId,
          price: poBuyId ? (po?.unitPrice ?? 0) : 0,
        }
      })
      return {
        ...current,
        items,
      }
    })
    setFieldErrors({})
  }

  function addStockAllocationRow(index: number) {
    setForm((current) => {
      const source = current.items[index]
      if (!source) return current
      const summaryId = source.receiptSummaryId ?? source.receiptLineId ?? null
      if (!summaryId) return current
      const summary = receiptSummaryById.get(summaryId)
      if (!summary) return current
      const allocatedQty = current.items.reduce((sum, item) => (
        (item.receiptSummaryId ?? item.receiptLineId) === summaryId ? sum + item.qty : sum
      ), 0)
      const remainingQty = Math.max(0, summary.remainingWeight - allocatedQty)
      if (remainingQty <= 0.0001) return current
      const insertIndex = current.items.reduce((lastIndex, item, itemIndex) => (
        (item.receiptSummaryId ?? item.receiptLineId) === summaryId ? itemIndex : lastIndex
      ), index) + 1
      const nextItem: PurchaseBillFormValues['items'][number] = {
        ...source,
        note: null,
        poBuyId: null,
        price: 0,
        qty: source.poBuyId ? remainingQty : 0,
        salesPrice: source.salesPrice ?? 0,
      }
      const items = [...current.items]
      items.splice(insertIndex, 0, nextItem)
      return { ...current, items }
    })
    setFieldErrors({})
  }

  function removeStockAllocationRow(index: number) {
    setForm((current) => {
      const source = current.items[index]
      if (!source) return current
      const summaryId = source.receiptSummaryId ?? source.receiptLineId ?? null
      if (!summaryId) return current
      const summaryRowCount = current.items.filter((item) => (item.receiptSummaryId ?? item.receiptLineId) === summaryId).length
      if (summaryRowCount <= 1) return current
      return { ...current, items: current.items.filter((_item, itemIndex) => itemIndex !== index) }
    })
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
    setSalesForm((current) => {
      const next: SalesBillFormValues = {
        ...current,
        [key]: value,
        ...(key === 'branchId' ? { warehouseId: null } : {}),
        ...(key === 'hasVat' ? { vatType: (value ? 'EXCLUDE' : 'NONE') as SalesBillFormValues['vatType'] } : {}),
        ...(key === 'vatInvoiceIssued' && value === false ? { vatInvoiceDate: null, vatInvoiceNo: null } : {}),
      }

      if (key === 'branchId' || key === 'customerId' || key === 'transactionMode') {
        next.deliveryTicketId = null
        if (key === 'customerId') next.customerAdvanceId = null
        if (key === 'transactionMode' && value === 'STOCK') {
          next.items = [blankSalesItem()]
        } else {
          next.items = current.items.map((item) => ({
            ...item,
            deliveryLineId: null,
            deliverySummaryId: null,
            deliveryTicketDocNo: null,
            deliveryTicketId: null,
          }))
        }
      }

      if (key === 'deliveryTicketId') {
        const deliveryId = typeof value === 'string' ? value : ''
        const delivery = (options.deliveries ?? []).find((option) => option.id === deliveryId)
        next.discountTotal = 0
        next.items = delivery ? deliveryToSalesItems(delivery) : [blankSalesItem()]
        next.note = null
      }

      return next
    })
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
      const nextFieldErrors = issueMapFromZodIssues(parsed.error.issues)
      setFieldErrors(nextFieldErrors)
      setError(parsed.error.issues[0]?.message ?? 'กรุณาตรวจสอบข้อมูลในฟอร์ม')
      focusFieldError(firstErrorKeyFromZodIssues(parsed.error.issues))
      return
    }

    if (stockAllocationIssues.length > 0) {
      const nextFieldErrors = stockAllocationIssues.reduce<Record<string, string>>((errors, issue) => {
        if (issue.rowIndex != null) {
          errors[`items.${issue.rowIndex}.qty`] = issue.message
        }
        return errors
      }, { items: 'ใบรับของ WTI ที่เลือกต้องจัดสรรน้ำหนักคงเหลือให้ครบก่อนบันทึก' })
      const firstIssue = stockAllocationIssues[0]
      const firstErrorKey = firstIssue?.rowIndex != null ? `items.${firstIssue.rowIndex}.qty` : 'items'
      setFieldErrors(nextFieldErrors)
      setError(firstIssue?.message ?? 'ใบรับของ WTI ที่เลือกต้องจัดสรรน้ำหนักคงเหลือให้ครบก่อนบันทึก')
      focusFieldError(firstErrorKey)
      return
    }
    if (supplierSwapMode) {
      if (!supplierSwapSupplierId) {
        setFieldErrors((current) => ({ ...current, supplierSwapSupplierId: 'กรุณาเลือก Supplier ใหม่' }))
        setError('กรุณาเลือก Supplier ใหม่')
        focusFieldError('supplierSwapSupplierId')
        return
      }
      if (supplierSwapSupplierId === form.supplierId) {
        setFieldErrors((current) => ({ ...current, supplierSwapSupplierId: 'Supplier ใหม่ต้องต่างจาก Supplier เดิม' }))
        setError('Supplier ใหม่ต้องต่างจาก Supplier เดิม')
        focusFieldError('supplierSwapSupplierId')
        return
      }
    }

    setIsSaving(true)
    setError(null)
    try {
      const saveData = supplierSwapMode
        ? {
          ...parsed.data,
          poBuyId: null,
          purchaseSource: 'SPOT_BUY' as const,
          salesId: activeSuppliers.find((supplier) => supplier.id === supplierSwapSupplierId)?.sales_id ?? null,
          supplierId: supplierSwapSupplierId,
          items: parsed.data.items.map((item) => ({ ...item, poBuyId: null })),
        }
        : parsed.data
      const payload = editingBillId
        ? { ...saveData, action: supplierSwapMode ? 'supplier_swap' : undefined, id: editingBillId }
        : saveData
      await dailyFetchJson('/api/purchase/bills', {
        body: JSON.stringify(payload),
        method: editingBillId ? 'PATCH' : 'POST',
      })
      setEditingBillId(null)
      setSupplierSwapMode(false)
      setSupplierSwapSupplierId('')
      setLockedReceiptSnapshot(null)
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
      const nextFieldErrors = issueMapFromZodIssues(parsed.error.issues)
      setSalesFieldErrors(nextFieldErrors)
      setError(parsed.error.issues[0]?.message ?? 'กรุณาตรวจสอบข้อมูลในฟอร์ม')
      focusFieldError(firstErrorKeyFromZodIssues(parsed.error.issues))
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
      setSupplierSwapMode(false)
      setSupplierSwapSupplierId('')
      setLockedReceiptSnapshot(null)
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
      if (mode === 'purchase' && branchFilter) params.set('branchId', branchFilter)
      if (search.trim()) params.set('search', search.trim())
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (filterMode) params.set('filterMode', filterMode)
      if (statusFilter.length > 0) params.set('status', statusFilter.join(','))
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

      {/* Floating Action Button (FAB) for Mobile */}
      {(mode === 'purchase' || mode === 'sales') ? (
        <div className="fixed bottom-6 right-6 z-40 md:hidden">
          <button
            className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform animate-bounce-short"
            onClick={() => {
              if (mode === 'purchase') openPurchaseForm()
              if (mode === 'sales') openSalesForm()
            }}
            type="button"
            aria-label={mode === 'purchase' ? 'สร้างบิลรับซื้อใหม่' : 'สร้างบิลขายใหม่'}
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      ) : null}

      <div className="space-y-2 rounded-md bg-white p-3 shadow">
        <div className="flex gap-2 items-center">
          <Input
            className="min-w-[260px] flex-1 rounded-md h-9"
            placeholder={mode === 'purchase' ? 'ค้นหาเลขบิล / เลขอ้างอิง / ชื่อ Supplier...' : mode === 'sales' ? 'ค้นหาเลขบิล / เลขอ้างอิง / ชื่อลูกค้า...' : 'ค้นหาเลขที่ / ชื่อ / สาขา / คลัง'}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 md:hidden"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {activeFilters ? '(มี)' : ''}
          </button>
          
          {/* Desktop Toolbar Right Actions */}
          <div className="hidden md:flex gap-2 ml-auto">
            {mode === 'purchase' ? <ExportButton isExporting={isExporting} onClick={() => void exportExcel()} /> : null}
            {mode === 'purchase' ? <Button type="button" onClick={openPurchaseForm}>+ บิลรับซื้อใหม่</Button> : null}
            {mode === 'sales' ? <ExportButton isExporting={isExporting} onClick={() => void exportExcel()} /> : null}
            {mode === 'sales' ? <Button disabled={isSaving} type="button" onClick={openSalesForm}>+ บิลขายใหม่</Button> : null}
          </div>
        </div>

        {/* Desktop Filters */}
        <div className="hidden md:flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500">วันที่:</label>
          <DatePickerInput id="purchase-bills-date-from" value={dateFrom} onChange={setDateFrom} />
          <span className="text-slate-400">→</span>
          <DatePickerInput id="purchase-bills-date-to" value={dateTo} onChange={setDateTo} />
          {mode === 'purchase' ? (
            <BranchSelectCombobox
              allOptionLabel="ทุกสาขา"
              branches={activeBranches}
              className="w-[12rem]"
              includeAllOption
              inputId="purchase-bills-branch-filter"
              label=""
              placeholder="เลือกสาขา"
              value={branchFilter || null}
              onChange={(branchId) => setBranchFilter(branchId ?? '')}
            />
          ) : null}
          {(search || branchFilter || dateFrom || dateTo || filterMode || statusFilter.length > 0) ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
          {mode === 'stock-issue' ? (
            <>
              <Select className="w-auto h-9" value={filterMode} onChange={(event) => setFilterMode(event.target.value)}>
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
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">ประเภท:</span>
            <Segment value="" current={filterMode} label="ทุกประเภท" onClick={setFilterMode} />
            <Segment value="STOCK" current={filterMode} label="📦 STOCK" onClick={setFilterMode} />
            <Segment value="TRADING" current={filterMode} label="🔄 TRADING" onClick={setFilterMode} />
          </div>
        ) : null}
        {mode === 'purchase' || mode === 'sales' ? (
          <div className="hidden md:flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">สถานะ:</span>
            {statusOptions.map((option) => (
              <SegmentMulti key={option.label} current={statusFilter} label={option.label} onClick={setStatusFilter} values={option.values} />
            ))}
          </div>
        ) : null}
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 md:hidden">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองเพิ่มเติม</h4>
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
                  <DatePickerInput className="flex-1" value={dateFrom} onChange={(val) => { setDateFrom(val) }} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput className="flex-1" value={dateTo} onChange={(val) => { setDateTo(val) }} />
                </div>
              </div>

              {mode === 'purchase' ? (
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600">สาขา</span>
                  <BranchSelectCombobox
                    allOptionLabel="ทุกสาขา"
                    branches={activeBranches}
                    className="w-full"
                    includeAllOption
                    inputId="purchase-bills-branch-filter-mobile"
                    label=""
                    placeholder="เลือกสาขา"
                    value={branchFilter || null}
                    onChange={(branchId) => setBranchFilter(branchId ?? '')}
                  />
                </div>
              ) : null}

              {mode === 'stock-issue' ? (
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะ</span>
                  <select
                    className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm bg-white"
                    value={filterMode}
                    onChange={(event) => setFilterMode(event.target.value)}
                  >
                    <option value="">ทุกสถานะ</option>
                    <option value="pending">⏰ Pending</option>
                    <option value="converted">✓ เปิดบิลแล้ว</option>
                    <option value="cancelled">⊘ ยกเลิก</option>
                  </select>
                </div>
              ) : null}

              {(mode === 'purchase' || mode === 'sales') ? (
                <>
                  <div>
                    <span className="mb-2 block text-xs font-semibold text-slate-600">ประเภทบิล</span>
                    <div className="flex flex-wrap gap-2">
                      <Segment value="" current={filterMode} label="ทุกประเภท" onClick={setFilterMode} />
                      <Segment value="STOCK" current={filterMode} label="📦 STOCK" onClick={setFilterMode} />
                      <Segment value="TRADING" current={filterMode} label="🔄 TRADING" onClick={setFilterMode} />
                    </div>
                  </div>

                  <div>
                    <span className="mb-2 block text-xs font-semibold text-slate-600">สถานะบิล</span>
                    <div className="flex flex-wrap gap-2">
                      {statusOptions.map((option) => (
                        <SegmentMulti key={`mobile-${option.label}`} current={statusFilter} label={option.label} onClick={setStatusFilter} values={option.values} />
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
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

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? <Button size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>Set col to default</Button> : null}
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

      {/* Mobile Card List */}
      <div className="block md:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && pageRows.map((row) => (
          <div
            key={row.id}
            className="rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
            onClick={() => openRow(row)}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
              <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
            </div>
            <div className="text-xs text-slate-600 mb-3 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">{mode === 'purchase' ? 'ผู้ขาย: ' : 'ลูกค้า: '}</span>
                <span className="text-slate-800">{'supplierName' in row ? row.supplierName : row.customerName}</span>
              </div>
              {mode !== 'purchase' ? (
                <div className="text-[11px] text-slate-500">
                  สาขา / คลัง: {formatBranchWarehouse(row)}
                </div>
              ) : null}
              {mode === 'purchase' && !isStockIssueRow(row) && row.receiptDocNos && row.receiptDocNos.length > 0 ? (
                <div className="text-[11px] text-slate-500 truncate">
                  ใบรับของ: {row.receiptDocNos.join(', ')}
                </div>
              ) : null}
            </div>
            <div className="flex justify-between items-end pt-2 border-t border-slate-100">
              <div>
                <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${mode === 'purchase' && !isStockIssueRow(row) ? workflowStatusBadgeClass(row.paymentWorkflowStatus ?? 'pending_approval') : statusBadgeClass(row.status)}`}>
                  <span className="size-1.5 rounded-full bg-current" />
                  {mode === 'purchase' && !isStockIssueRow(row) ? workflowStatusText(row.paymentWorkflowStatus ?? 'pending_approval') : statusText(row.status)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">{mode === 'stock-issue' ? 'ยอดคาด' : 'ยอดรวม'}</span>
                <span className="font-bold text-slate-900 text-sm tabular-nums">{formatMoney(isStockIssueRow(row) ? row.totalEstAmount : row.totalAmount ?? 0)}</span>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && totalRows === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">ยังไม่มีรายการ</div>
        ) : null}
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table className="text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {tableColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}
            </colgroup>
            <TableHeader>
              <tr>
                <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label={mode === 'purchase' ? 'เลขที่บิลซื้อ' : 'เลขที่'} resizeProps={columnResize.getResizeHandleProps('docNo', mode === 'purchase' ? 'เลขที่บิลซื้อ' : 'เลขที่')} sortKey="docNo" onSort={changeSort} />
                {mode === 'purchase' ? <ResizableTableHead label="เลขที่ใบรับของ" resizeProps={columnResize.getResizeHandleProps('receiptDocs', 'เลขที่ใบรับของ')} /> : null}
                {mode === 'sales' ? <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="เลขที่อ้างอิง" resizeProps={columnResize.getResizeHandleProps('refNo', 'เลขที่อ้างอิง')} sortKey="refNo" onSort={changeSort} /> : null}
                <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label={mode === 'purchase' ? 'วันที่สร้างรายการ' : 'วันที่'} resizeProps={columnResize.getResizeHandleProps('date', mode === 'purchase' ? 'วันที่สร้างรายการ' : 'วันที่')} sortKey="date" onSort={changeSort} />
                <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label={mode === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า'} resizeProps={columnResize.getResizeHandleProps('partyName', mode === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า')} sortKey="name" onSort={changeSort} />
                {mode !== 'purchase' ? <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="สาขา / คลัง" resizeProps={columnResize.getResizeHandleProps('warehouse', 'สาขา / คลัง')} sortKey="warehouse" onSort={changeSort} /> : null}
                {mode !== 'stock-issue' ? <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('transactionMode', 'ประเภท')} sortKey="transactionMode" onSort={changeSort} /> : null}
                <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label={mode === 'purchase' ? 'สถานะเอกสาร' : 'สถานะรับเงิน'} resizeProps={columnResize.getResizeHandleProps('status', mode === 'purchase' ? 'สถานะเอกสาร' : 'สถานะรับเงิน')} sortKey="status" onSort={changeSort} />
                {mode === 'purchase' ? <ResizableTableHead label="PMA / PMT" resizeProps={columnResize.getResizeHandleProps('paymentDocs', 'PMA / PMT')} /> : null}
                {mode !== 'purchase' ? <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="รายการ" resizeProps={columnResize.getResizeHandleProps('itemCount', 'รายการ')} sortKey="itemCount" onSort={changeSort} /> : null}
                {mode === 'stock-issue' ? <ResizableTableHead align="right" label="น้ำหนัก" resizeProps={columnResize.getResizeHandleProps('stockQty', 'น้ำหนัก')} /> : null}
                {mode === 'stock-issue' ? <ResizableTableHead align="right" label="ต้นทุน" resizeProps={columnResize.getResizeHandleProps('stockCost', 'ต้นทุน')} /> : null}
                <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label={mode === 'stock-issue' ? 'ยอดคาด' : 'ยอดรวม'} resizeProps={columnResize.getResizeHandleProps('totalAmount', mode === 'stock-issue' ? 'ยอดคาด' : 'ยอดรวม')} sortKey="totalAmount" onSort={changeSort} />
                {mode === 'sales' ? <ResizableTableHead align="right" label="GP / Margin" resizeProps={columnResize.getResizeHandleProps('gp', 'GP / Margin')} /> : null}
                {mode === 'sales' ? <ResizableTableHead align="right" label="รับแล้ว" resizeProps={columnResize.getResizeHandleProps('paidAmount', 'รับแล้ว')} /> : null}
                {mode !== 'stock-issue' ? <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ค้างชำระ" resizeProps={columnResize.getResizeHandleProps('outstanding', 'ค้างชำระ')} sortKey="outstanding" onSort={changeSort} /> : null}
                {mode === 'sales' ? <ResizableTableHead align="center" label="VAT" resizeProps={columnResize.getResizeHandleProps('vat', 'VAT')} /> : null}
                {mode !== 'stock-issue' ? <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="อัพเดตล่าสุด" resizeProps={columnResize.getResizeHandleProps('updatedBy', 'อัพเดตล่าสุด')} sortKey="updatedBy" onSort={changeSort} /> : null}
                {mode === 'purchase' ? <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} /> : null}
                {mode === 'sales' ? <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} /> : null}
                {mode === 'stock-issue' ? <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} /> : null}
              </tr>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {isLoading ? <TableRow><td className="p-6 text-center text-slate-500" colSpan={tableColSpan}>กำลังโหลดข้อมูล</td></TableRow> : null}
              {!isLoading && pageRows.map((row) => (
                <TableRow key={row.id} className={`hover:bg-slate-50 ${mode === 'purchase' && !isStockIssueRow(row) ? 'cursor-pointer' : ''}`} onClick={() => openRow(row)}>
                  <td className="whitespace-nowrap p-2 text-xs font-semibold text-slate-700">{row.docNo}</td>
                  {mode === 'purchase' && !isStockIssueRow(row) ? (
                    <td className="p-2 text-xs font-semibold text-slate-700">
                      <CollapsedList items={row.receiptDocNos} splitItems={true} />
                    </td>
                  ) : null}
                  {mode === 'sales' && !isStockIssueRow(row) ? <td className="whitespace-nowrap p-2 text-xs font-semibold text-slate-700">{row.refNo || '-'}</td> : null}
                  <td className="p-2 text-xs font-semibold text-slate-700">{formatDateDisplay(row.date)}</td>
                  <td className="p-2 text-xs font-semibold text-slate-700">{'supplierName' in row ? row.supplierName : row.customerName}</td>
                  {mode !== 'purchase' ? <td className="p-2 text-xs font-semibold text-slate-700">{formatBranchWarehouse(row)}</td> : null}
                  {mode !== 'stock-issue' && !isStockIssueRow(row) ? <td className="p-2 text-center"><span className={`rounded-md-full px-2 py-0.5 text-xs font-semibold ${row.transactionMode === 'TRADING' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>{row.transactionMode ?? '-'}</span></td> : null}
                  <td className="p-2 text-center">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${mode === 'purchase' && !isStockIssueRow(row) ? workflowStatusBadgeClass(row.paymentWorkflowStatus ?? 'pending_approval') : statusBadgeClass(row.status)}`}>
                      <span className="size-1.5 rounded-full bg-current" />
                      {mode === 'purchase' && !isStockIssueRow(row) ? workflowStatusText(row.paymentWorkflowStatus ?? 'pending_approval') : statusText(row.status)}
                    </span>
                  </td>
                  {mode === 'purchase' && !isStockIssueRow(row) ? <td className="p-2 text-xs font-semibold text-slate-700"><CollapsedList items={row.paymentDocNos} splitItems={true} /></td> : null}
                  {mode !== 'purchase' ? <td className="p-2 pr-4 text-right text-xs font-semibold text-slate-700 tabular-nums">{row.itemCount}</td> : null}
                  {mode === 'stock-issue' && isStockIssueRow(row) ? <TableNumberCell value={formatMoney(row.totalQty ?? 0)} /> : null}
                  {mode === 'stock-issue' && isStockIssueRow(row) ? <TableNumberCell tone="amber" value={formatMoney(row.totalCost)} /> : null}
                  <TableNumberCell strong value={formatMoney(isStockIssueRow(row) ? row.totalEstAmount : row.totalAmount ?? 0)} />
                  {mode === 'sales' && !isStockIssueRow(row) ? <td className={`p-2 pr-4 text-right font-semibold tabular-nums ${(row.grossProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}><div>{formatMoney(row.grossProfit ?? 0)}</div><div className="text-xs text-slate-500">{formatMoney((row.totalAmount ?? 0) > 0 ? (row.grossProfit ?? 0) / (row.totalAmount ?? 1) * 100 : 0)}%</div></td> : null}
                  {mode === 'sales' && !isStockIssueRow(row) ? <TableNumberCell value={formatMoney(row.receivedAmount ?? 0)} /> : null}
                  {mode !== 'stock-issue' && !isStockIssueRow(row) ? <TableNumberCell tone="amber" value={formatMoney(mode === 'purchase' ? row.payableBalance ?? 0 : row.receivableBalance ?? 0)} /> : null}
                  {mode === 'sales' && !isStockIssueRow(row) ? <td className="p-2 text-center"><span className={`rounded-md-full px-2 py-0.5 text-xs font-semibold ${row.vatInvoiceIssued ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.vatInvoiceIssued ? 'ออกแล้ว' : 'ยังไม่ออก'}</span>{row.vatInvoiceNo ? <div className="mt-1 text-[10px] text-slate-500">{row.vatInvoiceNo}</div> : null}</td> : null}
                  {mode !== 'stock-issue' && !isStockIssueRow(row) ? <td className="p-2 text-xs font-semibold text-slate-700"><div>{row.updatedBy || row.createdBy || '-'}</div><div className="text-[10px] font-normal text-slate-400">{formatDateTime(row.updatedAt || row.createdAt)}</div></td> : null}
                  {mode === 'purchase' && !isStockIssueRow(row) ? (
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                          disabled={printingBillDocNo === row.docNo}
                          type="button"
                          onClick={(event) => { event.stopPropagation(); void printPurchaseBill(row) }}
                        >
                          {printingBillDocNo === row.docNo ? 'เตรียม...' : 'พิมพ์'}
                        </button>
                        <button
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={row.canEdit === false}
                          title={row.canEdit === false ? (row.lockedReason ?? 'บิลนี้ยังแก้ไขไม่ได้') : undefined}
                          type="button"
                          onClick={(event) => { event.stopPropagation(); openEditPurchaseForm(row) }}
                        >
                          แก้ไข
                        </button>
                        <button
                          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={row.canEdit === false}
                          title={row.canEdit === false ? (row.lockedReason ?? 'บิลนี้ยังยกเลิกไม่ได้') : undefined}
                          type="button"
                          onClick={(event) => { event.stopPropagation(); openCancelPurchaseBill(row) }}
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </td>
                  ) : null}
                  {mode === 'sales' && !isStockIssueRow(row) ? (
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
                          disabled={printingBillDocNo === row.docNo}
                          type="button"
                          onClick={(event) => { event.stopPropagation(); void printSalesBill(row) }}
                        >
                          {printingBillDocNo === row.docNo ? 'เตรียม...' : 'พิมพ์'}
                        </button>
                        <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" disabled title="รอเปิด flow แก้ไขบิลขาย" type="button">แก้ไข</button>
                        <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" disabled title="รอเปิด flow ยกเลิกบิลขาย" type="button">ยกเลิก</button>
                      </div>
                    </td>
                  ) : null}
                  {mode === 'stock-issue' && isStockIssueRow(row) ? (
                    <td className="p-2 text-right">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <button className="rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={row.status !== 'pending'} type="button">เปิดบิลขาย</button>
                        <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" disabled type="button">แก้ไข</button>
                        <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" disabled type="button">ยกเลิก</button>
                      </div>
                    </td>
                  ) : null}
                </TableRow>
              ))}
              {!isLoading && totalRows === 0 ? <TableRow><td className="p-6 text-center text-slate-500" colSpan={tableColSpan}>ยังไม่มีรายการ</td></TableRow> : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  )
}


function PurchaseBillDetailModal({
  detail,
  docNo,
  error,
  isLoading,
  isPrinting,
  onClose,
  onPrint,
}: {
  detail: PurchaseBillDetail | null
  docNo: string
  error: string | null
  isLoading: boolean
  isPrinting: boolean
  onClose: () => void
  onPrint: (detail: PurchaseBillDetail) => void
}) {
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent aria-labelledby="purchase-bill-detail-title" className="max-h-[90vh] max-w-6xl overflow-y-auto rounded-md p-0" hideClose>
        <DialogHeader className="border-b border-slate-200 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <DialogTitle id="purchase-bill-detail-title">รายละเอียดบิลรับซื้อ {detail?.docNo ?? docNo}</DialogTitle>
              <DialogDescription>{detail?.supplierName ?? 'กำลังโหลดข้อมูล'}</DialogDescription>
            </div>
            {detail ? (
              <Button className="gap-2 font-normal" disabled={isPrinting} type="button" variant="outline" onClick={() => onPrint(detail)}>
                <Printer className="size-4" />
                {isPrinting ? 'กำลังเตรียม...' : 'พิมพ์บิลรับซื้อ'}
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">กำลังโหลดรายละเอียดบิลรับซื้อ</div>
        ) : error ? (
          <div className="p-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          </div>
        ) : detail ? (
          <div className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Detail label="ยอดรวม" value={formatMoney(detail.totalAmount)} />
              <Detail label="ค้างชำระ" value={formatMoney(detail.payableBalance)} />
              <Detail label="ชำระแล้ว" value={formatMoney(detail.paidAmount)} />
              <Detail label="สถานะ" value={detail.statusLabel} />
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <PlainDetail label="เลขที่บิล" value={detail.docNo} />
                <PlainDetail label="วันที่สร้างรายการ" value={formatDateDisplay(detail.date)} />
                <PlainDetail label="ผู้ขาย" value={detail.supplierName} />
                <PlainDetail label="รหัสผู้ขาย" value={detail.supplierCode} />
                <PlainDetail label="สาขา/คลัง" value={detail.branchName} />
                <PlainDetail label="ประเภทบิล" value={detail.transactionMode} />
                <PlainDetail label="ผู้ทำ" value={detail.createdBy} />
                <PlainDetail label="ใบรับของ" value={detail.receiptDocNos.join(', ') || '-'} />
                <PlainDetail label="ADV/มัดจำ" value={detail.advancePaymentDocNo ? `${detail.advancePaymentDocNo} (${formatMoney(detail.advanceAllocatedAmount)})` : '-'} />
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">สรุปต่อสินค้า</div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[880px] text-sm">
                  <thead className="bg-slate-200/80 border-b border-slate-300/80 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                      <th className="px-3 py-2 text-left font-medium">ใบรับของ</th>
                      <th className="px-3 py-2 text-left font-medium">ที่มา</th>
                      <th className="px-3 py-2 text-right font-medium">น้ำหนัก</th>
                      <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.productSummaries.map((item) => (
                      <tr key={item.productId || item.productName} className="border-t border-slate-200">
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-slate-900">{item.productName}</div>
                          <div className="text-xs text-slate-500">{[item.productCode || null, `${item.lineCount} allocation`].filter(Boolean).join(' · ')}</div>
                        </td>
                        <td className="px-3 py-2 align-top text-slate-700">{item.receiptDocNos.join(', ') || '-'}</td>
                        <td className="px-3 py-2 align-top text-slate-700">
                          <div>{item.sourceKinds.join(' + ') || '-'}</div>
                          <div className="text-xs text-slate-500">{item.poDocNos.join(', ') || 'Spot Buy'}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(item.qty)} {item.unit}</td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{formatMoney(item.amount)}</td>
                      </tr>
                    ))}
                    {detail.productSummaries.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={5}>ไม่มีรายการสินค้าในบิล</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">รายละเอียด allocation รายแถว</div>
              <div className="overflow-x-auto rounded-md border border-slate-200">
                <table className="w-full min-w-[1100px] text-sm">
                  <thead className="bg-slate-200/80 border-b border-slate-300/80 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                      <th className="px-3 py-2 text-left font-medium">ใบรับของ WTI</th>
                      <th className="px-3 py-2 text-left font-medium">PO / ที่มา</th>
                      <th className="px-3 py-2 text-right font-medium">Gross</th>
                      <th className="px-3 py-2 text-right font-medium">หัก</th>
                      <th className="px-3 py-2 text-right font-medium">น้ำหนัก</th>
                      <th className="px-3 py-2 text-right font-medium">ราคา/กก.</th>
                      <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.allocationRows.map((item) => (
                      <tr key={item.lineId} className="border-t border-slate-200">
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium text-slate-900">{item.productName}</div>
                          <div className="text-xs text-slate-500">{[item.productCode || null, `line ${item.lineNo}`].filter(Boolean).join(' · ')}</div>
                          {item.note ? <div className="mt-1 text-xs text-slate-500">{item.note}</div> : null}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-slate-900">{item.receiptTicketDocNo}</div>
                          <div className="text-xs text-slate-500">{item.receiptSummaryLabel}</div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-slate-900">{item.sourceLabel}</div>
                          <div className="text-xs text-slate-500">{item.poDocNo ? 'ตัดตาม PO' : 'รับแบบ Spot Buy'}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.grossWeight)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.deductWeight)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(item.qty)} {item.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.price)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{formatMoney(item.amount)}</td>
                      </tr>
                    ))}
                    {detail.allocationRows.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={8}>ไม่มีรายการ allocation ในบิล</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">VAT / ยอดรวม</div>
                <div className="space-y-2 text-sm">
                  <SummaryLine label="ยอดก่อนส่วนลด" value={formatMoney(detail.subtotal)} />
                  <SummaryLine label="ส่วนลดท้ายบิล" tone="red" value={`-${formatMoney(detail.discount)}`} />
                  <SummaryLine label="VAT" value={formatMoney(detail.vatAmount)} />
                  <SummaryLine label="ยอดสุทธิ" value={formatMoney(detail.totalAmount)} />
                </div>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">ใบกำกับภาษี / หมายเหตุ</div>
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <PlainDetail label="ได้รับใบกำกับภาษี" value={detail.vatInvoiceReceived ? 'ได้รับแล้ว' : 'ยังไม่ได้รับ'} />
                  <PlainDetail label="เลขที่ใบกำกับภาษี" value={detail.vatInvoiceNo} />
                  <PlainDetail label="วันที่ใบกำกับภาษี" value={detail.vatInvoiceDate} />
                  <PlainDetail label="หมายเหตุ" value={detail.note || '-'} />
                </div>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-700">ประวัติ PB</div>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${workflowStatusBadgeClass(detail.status)}`}>
                  <span className="size-1.5 rounded-full bg-current" />
                  ล่าสุด: {detail.statusLabel}
                </span>
              </div>
              <PurchaseBillDetailTimeline detail={detail} />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          {detail ? (
            <Button className="gap-2 font-normal" disabled={isPrinting} type="button" variant="outline" onClick={() => onPrint(detail)}>
              <Printer className="size-4" />
              {isPrinting ? 'กำลังเตรียม...' : 'พิมพ์'}
            </Button>
          ) : null}
          <Button className="font-normal" type="button" variant="outline" onClick={onClose}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PurchaseBillDetailTimeline({ detail }: { detail: PurchaseBillDetail }) {
  const timelineEvents = detail.timeline.length > 0
    ? detail.timeline
    : [{
        action: 'current_status',
        actor: '-',
        createdAt: '',
        details: [`สถานะ ${detail.statusLabel}`],
        id: 'current-status',
        status: detail.status,
        statusLabel: detail.statusLabel,
        title: 'สถานะปัจจุบัน',
        tone: 'slate' as const,
        transitionText: detail.statusLabel,
      }]

  return (
    <div className="space-y-3">
      {timelineEvents.map((event, index) => (
        <div key={event.id} className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[128px_1fr]">
          <div className="pt-1 text-right text-xs text-slate-500">
            <div>{formatDateTime(event.createdAt)}</div>
            <div className="mt-1 truncate text-[11px]">{event.actor}</div>
          </div>
          <div className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
            <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${index === 0 ? purchaseBillTimelineDotClass(event.tone) : 'bg-slate-300'}`} />
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium text-slate-800">{event.title}</div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${workflowStatusBadgeClass(event.status)}`}>
                <span className="size-1.5 rounded-full bg-current" />
                {event.statusLabel}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">{event.transitionText}</div>
            <div className="mt-2 grid gap-1 rounded-md bg-white px-3 py-2 text-xs text-slate-600">
              {event.details.map((detailLine) => <div key={detailLine}>{detailLine}</div>)}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function purchaseBillTimelineDotClass(tone: PurchaseBillDetailTimelineEvent['tone']) {
  if (tone === 'blue') return 'bg-blue-500'
  if (tone === 'emerald') return 'bg-emerald-500'
  if (tone === 'amber') return 'bg-amber-500'
  if (tone === 'rose') return 'bg-rose-500'
  return 'bg-slate-500'
}

function PlainDetail({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium text-slate-900">{value}</div></div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-medium">{value}</div></div>
}

function Segment({ current, label, onClick, value }: { current: string; label: string; onClick: (value: string) => void; value: string }) {
  const active = current === value
  return <button className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`} type="button" onClick={() => onClick(value)}>{label}</button>
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
  if (['paid', 'received', 'complete', 'completed'].includes(normalized)) return 'text-emerald-700'
  if (['partial', 'partially_paid'].includes(normalized)) return 'text-blue-700'
  if (['cancelled', 'cancelled_supplier_swap', 'void', 'reversed'].includes(normalized)) return 'text-slate-500'
  if (['unpaid', 'unreceived', 'open', 'draft'].includes(normalized)) return 'text-amber-700'
  return 'text-slate-700'
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    cancelled: 'ยกเลิก',
    cancelled_supplier_swap: 'ยกเลิก/เปลี่ยน Supplier',
    complete: 'เสร็จสิ้น',
    completed: 'เสร็จสิ้น',
    converted: 'เปิดบิลแล้ว',
    draft: 'Draft',
    paid: 'เสร็จสิ้น',
    partial: 'ชำระเงินบางส่วน',
    partially_paid: 'ชำระเงินบางส่วน',
    received: 'เสร็จสิ้น',
    unreceived: 'ยังไม่รับเงิน',
    unpaid: 'ยังไม่ชำระเงิน',
  }
  return labels[status.toLowerCase()] ?? status
}

function workflowStatusBadgeClass(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'paid') return 'text-emerald-700'
  if (normalized === 'partial_paid') return 'text-cyan-700'
  if (normalized === 'pending_payment') return 'text-blue-700'
  if (['cancelled', 'cancelled_supplier_swap'].includes(normalized)) return 'text-slate-500'
  return 'text-amber-700'
}

function workflowStatusText(status: string) {
  const labels: Record<string, string> = {
    cancelled: 'ยกเลิก',
    cancelled_supplier_swap: 'ยกเลิก/เปลี่ยน Supplier',
    paid: 'เสร็จสิ้น',
    partial_paid: 'ชำระบางส่วน',
    pending_approval: 'ยังไม่อนุมัติ',
    pending_payment: 'รอจ่าย',
  }
  return labels[status.toLowerCase()] ?? status
}

function formatDateTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

function SortHeader({ activeKey, align, direction, label, onSort, resizeProps, sortKey }: { activeKey: SortKey; align: 'center' | 'left' | 'right'; direction: SortDirection; label: string; onSort: (key: SortKey) => void; resizeProps?: ButtonHTMLAttributes<HTMLButtonElement>; sortKey: SortKey }) {
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

function RadioCard({ active, disabled = false, label, note, onClick }: { active: boolean; disabled?: boolean; label: string; note: string; onClick: () => void }) {
  return (
    <button className={`rounded-md border-2 p-3 text-left transition ${active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`} disabled={disabled} type="button" onClick={onClick}>
      <div className="font-bold">{label}</div>
      <div className="text-xs text-slate-500">{note}</div>
    </button>
  )
}

function isStockIssueRow(row: BillRow | StockIssueRow): row is StockIssueRow {
  return 'totalEstAmount' in row
}
