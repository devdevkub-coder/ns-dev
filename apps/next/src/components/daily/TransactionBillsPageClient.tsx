'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Download, Plus, Printer } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { CustomerSearchCombobox, Field, InputField, MoneyInputField, ProductSearchCombobox, SupplierSearchCombobox, SummaryLine } from '@/components/daily/TransactionBillsFieldHelpers'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { SegmentedFilterButton } from '@/components/ui/SegmentedFilterButton'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
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
import { salesBillCancelSchema, salesBillFormSchema, type SalesBillCancelValues, type SalesBillFormValues } from '@/lib/sales'
import { openSalesBillPrint, openSalesBillPrintWindow } from '@/lib/sales-bill-print'
import type { SalesBillDetail } from '@/lib/server/sales-bill-detail'

type BillRow = {
  advanceAllocatedAmount?: number
  advanceAllocatedSubtotalAmount?: number
  advanceConsumedAmount?: number
  advancePaymentDocNo?: string
  advancePaymentId?: string
  branchId?: string
  branchName?: string
  canCancel?: boolean
  canEdit?: boolean
  createdAt?: string
  createdBy?: string
  customerAdvanceDocNo?: string
  customerName?: string
  date: string
  discountTotal?: number
  docNo: string
  editLockedReason?: string | null
  grossProfit?: number
  hasVat?: boolean
  id: string
  subtotal?: number
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
  advanceConsumedAmount: number
  advanceAllocatedSubtotalAmount: number
  advanceAllocatedVatAmount: number
  advancePaymentDocNo: string
  advancePaymentInvoiceNo: string
  advancePaymentVatType: string
  advancePaymentVatTypeLabel: string
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

type Option = {
  active?: boolean | null
  bankAccounts?: Array<{
    accountName: string
    accountNo: string
    bankName: string
    branchCode: string
    code: string
    isPrimary: boolean
    paymentMethod: string
  }>
  branchIds?: string[]
  advanceDate?: string | null
  amount?: number | null
  branch_id?: string | null
  code?: string | null
  customer_id?: string | null
  id: string
  label?: string | null
  line_id?: string | null
  lockedAmount?: number | null
  lockedQty?: number | null
  marketScope?: string | null
  name: string
  product_id?: string | null
  remainingAmount?: number | null
  remainingQty?: number | null
  sales_id?: string | null
  sales_name?: string | null
  sourceLineNo?: number | null
  status?: string | null
  subtotalAmount?: number | null
  supplier_id?: string | null
  supplier_name?: string | null
  type?: string | null
  unitPrice?: number | null
  unit?: string | null
  vatAmount?: number | null
  vatType?: string | null
}

type TradingPurchaseBillOption = {
  id: string
  docNo: string
  label: string
  lineCount: number
  lines: Option[]
  remainingAmount: number
  remainingQty: number
  searchText: string
  supplierName: string | null
  unit: string | null
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
  poSells: Option[]
  salesChannels: Option[]
  tradingCostSources: Option[]
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
    unitCostSnapshot?: number | null
    stockPreview?: {
      afterQty: number
      availableQty: number
      issueQty: number
      onHandQty: number
      reservedQty: number
    }
  }>
  status: string
  vehicleNo: string
}

type TransactionPayload = {
  rows: BillRow[]
  totalAmount?: number
  totalRows?: number
}

type SalesPayload = TransactionPayload & {
  branches: Option[]
  customers: Option[]
  customerAdvancePayments: Option[]
  deliveries: DeliveryOption[]
  poSells: Option[]
  products: Option[]
  salesChannels: Option[]
  tradingCostSources: Option[]
  vatRatePercent?: number
  warehouses: Option[]
}

type TransactionBillsPageClientProps = {
  mode: 'purchase' | 'sales'
}

type SortKey = 'date' | 'docNo' | 'itemCount' | 'name' | 'outstanding' | 'refNo' | 'status' | 'totalAmount' | 'transactionMode' | 'updatedBy' | 'warehouse'
type SortDirection = 'asc' | 'desc'
type TransactionBillColumnKey = 'action' | 'date' | 'docNo' | 'gp' | 'itemCount' | 'outstanding' | 'paidAmount' | 'partyName' | 'paymentDocs' | 'receiptDocs' | 'refNo' | 'status' | 'totalAmount' | 'transactionMode' | 'updatedBy' | 'vat' | 'warehouse'

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
  { key: 'partyName', defaultWidth: 260, minWidth: 140 },
  { key: 'transactionMode', defaultWidth: 120, minWidth: 100 },
  { key: 'status', defaultWidth: 140, minWidth: 120 },
  { key: 'paymentDocs', defaultWidth: 150, minWidth: 120 },
  { key: 'totalAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'outstanding', defaultWidth: 110, minWidth: 90 },
  { key: 'updatedBy', defaultWidth: 170, minWidth: 130 },
  { key: 'action', defaultWidth: 240, minWidth: 210 },
]

const salesBillColumns: Array<ResizableColumnDefinition<TransactionBillColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'refNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'partyName', defaultWidth: 260, minWidth: 140 },
  { key: 'warehouse', defaultWidth: 160, minWidth: 120 },
  { key: 'transactionMode', defaultWidth: 120, minWidth: 100 },
  { key: 'status', defaultWidth: 140, minWidth: 120 },
  { key: 'itemCount', defaultWidth: 75, minWidth: 60 },
  { key: 'totalAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'gp', defaultWidth: 110, minWidth: 90 },
  { key: 'paidAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'outstanding', defaultWidth: 110, minWidth: 90 },
  { key: 'vat', defaultWidth: 110, minWidth: 90 },
  { key: 'updatedBy', defaultWidth: 170, minWidth: 130 },
  { key: 'action', defaultWidth: 180, minWidth: 150 },
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

function salesStockQtyVariance(sentQty: number, acceptedQty: number) {
  const diff = sentQty - acceptedQty
  if (Math.abs(diff) < 0.001) return { className: 'text-emerald-700', text: 'ขายครบตามใบส่งของ' }
  if (diff > 0) return { className: 'text-amber-700', text: `เหลือรอรับคืน ${formatMoney(diff)} กก.` }
  return { className: 'text-sky-700', text: `ลูกค้าชั่งเกิน ${formatMoney(Math.abs(diff))} กก. ตัด stock เท่าใบส่งของ` }
}

function salesItemSourceGroupKey(item: SalesBillFormValues['items'][number]) {
  if (item.deliveryTicketId) return `WTO:${item.deliveryTicketId}:${item.deliverySummaryId ?? item.deliveryLineId ?? ''}`
  if (!item.tradingCostSourceId) return `MANUAL:${item.productId}`
  const parts = item.tradingCostSourceId.split(':')
  if (parts[0] === 'PB' && parts[1]) return `PB:${parts[1]}`
  return item.tradingCostSourceId
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

function InlineDecimalInput({
  disabled = false,
  error,
  errorKey,
  inputClassName,
  max,
  value,
  onChange,
}: {
  disabled?: boolean
  error?: string
  errorKey?: string
  inputClassName?: string
  max?: number
  value: number
  onChange: (value: number) => void
}) {
  const [draftValue, setDraftValue] = useState<string | null>(null)

  return (
    <>
      <Input
        data-error-key={errorKey}
        inputMode="decimal"
        className={`w-full text-right font-bold tabular-nums text-slate-900 ${error ? 'border-red-400 bg-red-50 text-red-700' : ''} ${disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''} ${inputClassName ?? ''}`}
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
          const capped = max === undefined ? parsed : Math.min(parsed, max)
          setDraftValue(null)
          onChange(Number.isFinite(capped) ? capped : 0)
        }}
        onChange={(event) => {
          const nextValue = sanitizeDecimalInput(event.target.value, 2)
          setDraftValue(nextValue)
          const parsed = Number(nextValue)
          if (Number.isFinite(parsed)) onChange(max === undefined ? parsed : Math.min(parsed, max))
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
          <Button aria-label="Export" className="hidden lg:inline-flex ml-auto gap-2" disabled={isExporting} type="button" variant="export" onClick={onClick}>
            <Download aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{isExporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}</span>
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
  deductWeight: 0,
  discount: 0,
  grossWeight: 0,
  netWeight: 0,
  note: null,
  poSellId: null,
  price: 0,
  productId: '',
  qty: 0,
  tradingCostSourceId: null,
})

const initialSalesForm = (): SalesBillFormValues => ({
  branchId: '',
  channelId: '',
  customerAdvanceId: null,
  customerId: '',
  deliveryTicketId: null,
  discountTotal: 0,
  exportOrderNo: null,
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
  { label: 'ยกเลิก/เปลี่ยนผู้ขาย', values: ['cancelled_supplier_swap'] },
]

const salesStatusOptions: MultiSegmentOption[] = [
  { label: 'ทุกสถานะ', values: [] },
  { label: 'ยังไม่รับเงิน', values: ['unreceived'] },
  { label: 'รับเงินบางส่วน', values: ['partial'] },
  { label: 'เสร็จสิ้น', values: ['received'] },
  { label: 'ยกเลิก', values: ['cancelled'] },
]

export function TransactionBillsPageClient({ mode }: TransactionBillsPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [cancelNote, setCancelNote] = useState('')
  const [cancelNoteError, setCancelNoteError] = useState('')
  const [cancelingBill, setCancelingBill] = useState<BillRow | null>(null)
  const [detailBill, setDetailBill] = useState<PurchaseBillDetail | null>(null)
  const [salesDetailBill, setSalesDetailBill] = useState<SalesBillDetail | null>(null)
  const [detailBillDocNo, setDetailBillDocNo] = useState<string | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [branchFilter, setBranchFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [filterMode, setFilterMode] = useState('')
  const [form, setForm] = useState<PurchaseBillFormValues>(initialPurchaseForm())
  const [editingBillId, setEditingBillId] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [options, setOptions] = useState<OptionsPayload>({ advancePayments: [], branches: [], customers: [], customerAdvancePayments: [], deliveries: [], poBuys: [], poSells: [], products: [], receipts: [], salesChannels: [], salespersons: [], suppliers: [], tradingCostSources: [], warehouses: [] })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [preferredBranchId, setPreferredBranchId] = useState<string | null>(null)
  const [printingBillDocNo, setPrintingBillDocNo] = useState<string | null>(null)
  const [rows, setRows] = useState<BillRow[]>([])
  const [search, setSearch] = useState('')
  const [salesFieldErrors, setSalesFieldErrors] = useState<Record<string, string>>({})
  const [editingSalesBillId, setEditingSalesBillId] = useState<string | null>(null)
  const [salesForm, setSalesForm] = useState<SalesBillFormValues>(initialSalesForm())
  const [tradingPurchaseSelectorIds, setTradingPurchaseSelectorIds] = useState<string[]>([''])
  const [lockedDeliverySnapshot, setLockedDeliverySnapshot] = useState<DeliveryOption | null>(null)
  const [lockedPoSellOptions, setLockedPoSellOptions] = useState<Option[]>([])
  const [showSalesForm, setShowSalesForm] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
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
  const handledAutoOpenRef = useRef<string | null>(null)
  const tableColumns = useMemo(() => {
    if (mode === 'purchase') return purchaseBillColumns
    return salesBillColumns
  }, [mode])
  const columnResize = useResizableColumns(`daily.transaction-bills.${mode}.v5`, tableColumns)
  const apiPath = mode === 'purchase' ? '/api/purchase/bills' : '/api/sales/bills'
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
    if (filterMode) params.set('filterMode', filterMode)
    if (statusFilter.length > 0) params.set('status', statusFilter.join(','))
    return `${apiPath}?${params.toString()}`
  }, [apiPath, branchFilter, dateFrom, dateTo, filterMode, mode, page, pageSize, search, sortDirection, sortKey, statusFilter])

  const activeFilters = Boolean(
    search.trim() !== '' ||
    branchFilter !== '' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    filterMode !== '' ||
    statusFilter.length > 0
  )
  const mobileFilterCount =
    (mode === 'purchase' && branchFilter ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0) +
    (filterMode ? 1 : 0) +
    (statusFilter.length > 0 ? 1 : 0)

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
          poSells: [],
          products: payload.products,
          receipts: payload.receipts,
          salesChannels: [],
          salespersons: payload.salespersons,
          suppliers: payload.suppliers,
          tradingCostSources: [],
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
          poSells: payload.poSells ?? [],
          products: payload.products,
          salesChannels: payload.salesChannels,
          tradingCostSources: payload.tradingCostSources ?? [],
          warehouses: payload.warehouses,
        }))
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
  const title = mode === 'purchase' ? 'บิลรับซื้อ' : 'บิลขาย'
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
  const activeCustomers = useMemo(() => options.customers.filter((option) => (
    option.active !== false
    && Boolean(salesForm.branchId)
    && option.branchIds?.includes(salesForm.branchId)
  )), [options.customers, salesForm.branchId])
  const activeSalesChannels = useMemo(() => options.salesChannels.filter((option) => option.active !== false), [options.salesChannels])
  const defaultSalesChannelForCustomer = useCallback((customerId: string) => {
    const customer = options.customers.find((option) => option.id === customerId)
    const targetScope = customer?.marketScope === 'ต่างประเทศ' ? 'ต่างประเทศ' : customer?.marketScope === 'ในประเทศ' ? 'ในประเทศ' : null
    if (!targetScope) return null
    return activeSalesChannels.find((channel) => [channel.name, channel.code, channel.id].some((value) => String(value ?? '').trim() === targetScope))?.id ?? null
  }, [activeSalesChannels, options.customers])
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
    if (salesForm.transactionMode !== 'STOCK' && salesForm.transactionMode !== 'TRADING') return false
    if (salesForm.branchId && delivery.branchId !== salesForm.branchId) return false
    if (salesForm.customerId && delivery.customerId !== salesForm.customerId) return false
    return true
  })
  const selectedSalesPoSellIds = new Set(salesForm.items.map((item) => item.poSellId).filter((poSellId): poSellId is string => Boolean(poSellId)))
  const poSellOptionsByKey = new Map<string, Option>()
  const allPoSellOptions = [...lockedPoSellOptions, ...(options.poSells ?? [])]
  allPoSellOptions.forEach((option) => {
    const key = `${option.id}:${option.product_id ?? ''}`
    const current = poSellOptionsByKey.get(key)
    if (!current) {
      poSellOptionsByKey.set(key, { ...option })
      return
    }
    const currentLockedQty = current.lockedQty ?? (current.status === 'locked' ? current.remainingQty ?? 0 : 0)
    const incomingLockedQty = option.lockedQty ?? (option.status === 'locked' ? option.remainingQty ?? 0 : 0)
    const currentLockedAmount = current.lockedAmount ?? (current.status === 'locked' ? current.remainingAmount ?? 0 : 0)
    const incomingLockedAmount = option.lockedAmount ?? (option.status === 'locked' ? option.remainingAmount ?? 0 : 0)
    const existingQty = current.remainingQty ?? 0
    const incomingQty = option.remainingQty ?? 0
    current.remainingAmount = (current.remainingAmount ?? 0) + (option.remainingAmount ?? 0)
    current.remainingQty = existingQty + incomingQty
    current.lockedAmount = currentLockedAmount + incomingLockedAmount
    current.lockedQty = currentLockedQty + incomingLockedQty
    current.active = current.active !== false || option.active !== false
    if (current.status === 'locked' || option.status === 'locked') {
      const unit = current.unit ?? option.unit ?? 'กก.'
      const unitPrice = current.unitPrice ?? option.unitPrice ?? 0
      const lockedQty = current.lockedQty ?? 0
      const liveRemainingQty = Math.max(0, (current.remainingQty ?? 0) - lockedQty)
      current.label = `${current.id} · ใช้ในบิลนี้ ${formatMoney(lockedQty)}${unit ? ` ${unit}` : ''}${liveRemainingQty > 0.0001 ? ` · คงเหลือ ${formatMoney(liveRemainingQty)}${unit ? ` ${unit}` : ''}` : ''} · ${formatMoney(unitPrice)} บาท`
    }
  })
  const activePoSells = [...poSellOptionsByKey.values()].filter((option) => {
    if (salesForm.customerId && option.customer_id && option.customer_id !== salesForm.customerId) return false
    if (salesForm.branchId && option.branch_id && option.branch_id !== salesForm.branchId) return false
    return selectedSalesPoSellIds.has(option.id) || (option.active !== false && (option.remainingQty ?? 0) > 0.0001)
  })
  const activeTradingCostSources = (options.tradingCostSources ?? []).filter((option) => option.active !== false && ((option.remainingQty ?? 0) > 0.0001 || (option.remainingAmount ?? 0) > 0.01))
  const activeTradingPurchaseSources = activeTradingCostSources.filter((option) => option.id.startsWith('PB:'))
  const activeTradingPurchaseBills: TradingPurchaseBillOption[] = (() => {
    const groups = new Map<string, Option[]>()
    activeTradingPurchaseSources.forEach((source) => {
      const parts = source.id.split(':')
      const docNo = parts[1] || source.name
      if (!docNo) return
      const current = groups.get(docNo) ?? []
      current.push(source)
      groups.set(docNo, current)
    })
    return [...groups.entries()].map(([docNo, lines]) => {
      const sortedLines = [...lines].sort((left, right) => (left.sourceLineNo ?? 0) - (right.sourceLineNo ?? 0))
      const supplierName = sortedLines.find((line) => line.supplier_name)?.supplier_name ?? null
      const remainingQty = sortedLines.reduce((sum, line) => sum + (line.remainingQty ?? 0), 0)
      const remainingAmount = sortedLines.reduce((sum, line) => sum + (line.remainingAmount ?? 0), 0)
      const units = [...new Set(sortedLines.map((line) => line.unit ?? 'กก.').filter(Boolean))]
      const unit = units.length === 1 ? units[0] ?? null : null
      const lineCount = sortedLines.length
      return {
        docNo,
        id: `PB:${docNo}`,
        label: `${docNo} · ${supplierName ?? 'ไม่ระบุผู้ขาย'} · ${lineCount.toLocaleString('th-TH')} รายการ · คงเหลือ ${formatMoney(remainingQty)}${unit ? ` ${unit}` : ''} · ${formatMoney(remainingAmount)} บาท`,
        lineCount,
        lines: sortedLines,
        remainingAmount,
        remainingQty,
        searchText: [docNo, supplierName, ...sortedLines.map((line) => line.product_id), ...sortedLines.map((line) => line.code)].filter(Boolean).join(' ').toLowerCase(),
        supplierName,
        unit,
      }
    }).sort((left, right) => left.docNo.localeCompare(right.docNo, 'th'))
  })()
  const selectedTradingPurchaseSourceIds = new Set(tradingPurchaseSelectorIds.filter(Boolean))
  const availableTradingPurchaseSources = activeTradingPurchaseBills.filter((source) => !selectedTradingPurchaseSourceIds.has(source.id))
  const activeSuppliers = options.suppliers.filter((option) => option.active !== false && Boolean(form.branchId) && option.branchIds?.includes(form.branchId))
  const selectedSalesChannel = salesForm.channelId
    ? options.salesChannels.find((channel) => channel.id === salesForm.channelId) ?? null
    : null
  const selectedCustomer = salesForm.customerId
    ? activeCustomers.find((customer) => customer.id === salesForm.customerId) ?? null
    : null
  const selectedSalesChannelLabel = selectedSalesChannel
    ? selectedSalesChannel.code ? `${selectedSalesChannel.code} — ${selectedSalesChannel.name}` : selectedSalesChannel.name
    : salesForm.customerId
      ? `ไม่พบช่องทางขาย${selectedCustomer?.marketScope ? `สำหรับ ${selectedCustomer.marketScope}` : ''}`
      : 'เลือกลูกค้าก่อน'
  const isExportSalesBill = selectedCustomer?.marketScope === 'ต่างประเทศ'
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
  const editingBill = editingBillId ? rows.find((row) => row.id === editingBillId) ?? null : null
  const formVatRatePercent = editingBill?.vatRatePercent ?? vatRatePercent
  const formSubtotal = form.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price), 0)
  const formTotalWeight = form.items.reduce((sum, item) => sum + item.qty, 0)
  const formAfterDiscount = Math.max(0, formSubtotal - form.discountTotal)
  const formVat = !form.hasVat || form.vatType === 'NONE' ? 0 : form.vatType === 'INCLUDE' ? formAfterDiscount * formVatRatePercent / (100 + formVatRatePercent) : formAfterDiscount * (formVatRatePercent / 100)
  const formTotal = form.hasVat && form.vatType === 'EXCLUDE' ? formAfterDiscount + formVat : formAfterDiscount
  const formTaxableBase = form.hasVat && form.vatType === 'INCLUDE' ? Math.max(0, formAfterDiscount - formVat) : formAfterDiscount
  const selectedAdvancePayment = form.advancePaymentId
    ? activeAdvancePayments.find((option) => option.id === form.advancePaymentId)
      ?? null
    : null
  const editingAdvanceCarry = editingBill && editingBill.advancePaymentId === form.advancePaymentId
    ? editingBill.advanceConsumedAmount ?? editingBill.advanceAllocatedSubtotalAmount ?? editingBill.advanceAllocatedAmount ?? 0
    : 0
  const availableAdvanceAmount = selectedAdvancePayment
    ? Math.max(0, (selectedAdvancePayment.remainingAmount ?? 0) + editingAdvanceCarry)
    : 0
  const selectedAdvanceSubtotal = selectedAdvancePayment?.subtotalAmount ?? selectedAdvancePayment?.amount ?? 0
  const selectedAdvanceVat = selectedAdvancePayment?.vatAmount ?? 0
  const selectedAdvanceBaseCapacity = selectedAdvancePayment?.vatType && selectedAdvancePayment.vatType !== 'NONE'
    ? availableAdvanceAmount * (selectedAdvanceSubtotal / Math.max(selectedAdvanceSubtotal + selectedAdvanceVat, 0.000001))
    : availableAdvanceAmount
  const formAdvanceConsumed = Math.min(formTaxableBase, selectedAdvanceBaseCapacity)
  const formTaxableBaseAfterAdvance = Math.max(0, formTaxableBase - formAdvanceConsumed)
  const formAdvanceVatRelief = formTaxableBase > 0 ? formAdvanceConsumed * (formVat / formTaxableBase) : 0
  const formAdvanceApplied = Math.min(formTotal, formAdvanceConsumed + formAdvanceVatRelief)
  const formAdvanceGrossConsumed = selectedAdvancePayment?.vatType && selectedAdvancePayment.vatType !== 'NONE'
    ? Math.min(
      availableAdvanceAmount,
      formAdvanceConsumed * ((selectedAdvanceSubtotal + selectedAdvanceVat) / Math.max(selectedAdvanceSubtotal, 0.000001)),
    )
    : formAdvanceConsumed
  const formAdvanceRemainingAfterApply = Math.max(0, availableAdvanceAmount - formAdvanceGrossConsumed)
  const formNetPayable = Math.max(0, formTotal - formAdvanceApplied)
  const salesSubtotal = salesForm.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - (salesForm.transactionMode === 'TRADING' ? 0 : item.discount)), 0)
  const salesAfterDiscount = Math.max(0, salesSubtotal - salesForm.discountTotal)
  const salesVat = !salesForm.hasVat || salesForm.vatType === 'NONE' ? 0 : salesForm.vatType === 'INCLUDE' ? salesAfterDiscount * formVatRatePercent / (100 + formVatRatePercent) : salesAfterDiscount * (formVatRatePercent / 100)
  const salesTotal = salesForm.hasVat && salesForm.vatType === 'EXCLUDE' ? salesAfterDiscount + salesVat : salesAfterDiscount
  const selectedCustomerAdvancePayment = salesForm.customerAdvanceId
    ? activeCustomerAdvancePayments.find((option) => option.id === salesForm.customerAdvanceId) ?? null
    : null
  const editingSalesBill = editingSalesBillId ? rows.find((row) => row.id === editingSalesBillId || row.docNo === editingSalesBillId) ?? null : null
  const salesEditingAdvanceCarry = editingSalesBill && salesForm.customerAdvanceId && salesForm.customerAdvanceId === editingSalesBill.customerAdvanceDocNo
    ? editingSalesBill.receivedAmount ?? 0
    : 0
  const salesCustomerAdvanceAvailable = selectedCustomerAdvancePayment
    ? Math.max(0, (selectedCustomerAdvancePayment.remainingAmount ?? 0) + salesEditingAdvanceCarry)
    : salesEditingAdvanceCarry
  const salesCustomerAdvanceApplied = salesForm.customerAdvanceId ? Math.min(salesTotal, salesCustomerAdvanceAvailable) : 0
  const salesReceivableBalance = Math.max(0, salesTotal - salesCustomerAdvanceApplied)
  const vatLabel = `VAT ${formatPercent(formVatRatePercent)}%`
  const visibleTotal = pageRows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0)
  const visibleOutstanding = pageRows.reduce((sum, row) => sum + (mode === 'purchase' ? row.payableBalance ?? 0 : row.receivableBalance ?? 0), 0)
  const visiblePaid = pageRows.reduce((sum, row) => sum + (mode === 'purchase' ? row.paidAmount ?? 0 : row.receivedAmount ?? 0), 0)
  const visibleGp = pageRows.reduce((sum, row) => sum + (row.grossProfit ?? 0), 0)
  const visibleStockCount = pageRows.filter((row) => (row.transactionMode ?? 'STOCK') === 'STOCK').length
  const visibleTradingCount = pageRows.filter((row) => row.transactionMode === 'TRADING').length
  const visibleMarginPct = visibleTotal > 0 ? visibleGp / visibleTotal * 100 : 0
  const cancelDialogPartyName = (() => {
    if (!cancelingBill) return '-'
    return mode === 'sales' ? cancelingBill.customerName ?? '-' : cancelingBill.supplierName ?? '-'
  })()
  const tableColSpan = mode === 'purchase' ? 11 : 15
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
    ? (lockedDeliverySnapshot?.id === salesForm.deliveryTicketId
      ? lockedDeliverySnapshot
      : (options.deliveries ?? []).find((delivery) => delivery.id === salesForm.deliveryTicketId) ?? null)
    : null
  const stockDeliveryPrerequisiteReady = (salesForm.transactionMode !== 'STOCK' && salesForm.transactionMode !== 'TRADING') || (Boolean(salesForm.branchId) && Boolean(salesForm.customerId))
  const salesIdentityLocked = Boolean(editingSalesBillId)
  const stockDeliveryLocked = salesForm.transactionMode === 'STOCK' && Boolean(salesForm.deliveryTicketId)
  const customerLockedByDelivery = stockDeliveryLocked
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
  const deliverySummaryById = new Map((selectedDelivery?.productSummaries ?? []).map((summary) => [summary.id, summary]))
  const salesStockSummaryDraft = (() => {
    const map = new Map<string, {
      allocatedQty: number
      expectedQty: number
      rowIndices: number[]
      summary: DeliveryOption['productSummaries'][number] | null
    }>()
    salesForm.items.forEach((item, index) => {
      const summaryId = item.deliverySummaryId ?? item.deliveryLineId ?? ''
      if (!summaryId) return
      const current = map.get(summaryId)
      const summary = deliverySummaryById.get(summaryId) ?? null
      if (current) {
        current.allocatedQty += item.netWeight
        current.rowIndices.push(index)
        return
      }
      map.set(summaryId, {
        allocatedQty: item.netWeight,
        expectedQty: summary?.remainingWeight ?? item.netWeight ?? item.qty,
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

  useEffect(() => {
    if (mode !== 'sales') return

    setSalesForm((current) => {
      const nextChannelId = current.customerId ? defaultSalesChannelForCustomer(current.customerId) ?? '' : ''
      if ((current.channelId ?? '') === nextChannelId) return current
      return { ...current, channelId: nextChannelId }
    })
  }, [defaultSalesChannelForCustomer, mode])

  useEffect(() => {
    if (mode !== 'sales') return
    if (salesForm.transactionMode !== 'TRADING') return
    if (!salesForm.items.some((item) => !item.tradingCostSourceId && !item.deliveryTicketId)) return

    setSalesForm((current) => {
      if (current.transactionMode !== 'TRADING') return current
      const sourceItems = current.items.filter((item) => item.tradingCostSourceId || item.deliveryTicketId)
      if (sourceItems.length === current.items.length) return current
      return { ...current, items: sourceItems }
    })
  }, [mode, salesForm.items, salesForm.transactionMode])

  const clearAutoOpenSearchParams = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('new')
    params.delete('wti')
    params.delete('wto')
    const nextQuery = params.toString()
    router.replace(nextQuery ? `?${nextQuery}` : mode === 'purchase' ? '/purchase/bills' : '/sales/bills')
  }, [searchParams, router, mode])

  const openPurchaseFormFromReceipt = useCallback((receipt: ReceiptOption) => {
    const branchId = receipt.branchId ?? resolvedPreferredBranchId ?? ''
    const supplierId = receipt.supplierId ?? ''
    const supplier = options.suppliers.find((option) => option.id === supplierId) ?? null
    setEditingBillId(null)
    setSupplierSwapMode(false)
    setSupplierSwapSupplierId('')
    setLockedReceiptSnapshot(receipt)
    setForm({
      ...initialPurchaseForm(),
      branchId,
      items: receiptToBillItems(receipt),
      receiptTicketId: receipt.id,
      salesId: supplier?.sales_id ?? null,
      supplierId,
      warehouseId: branchId ? defaultPurchaseWarehouseId(branchId) : null,
    })
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }, [resolvedPreferredBranchId, options.suppliers, defaultPurchaseWarehouseId])

  const openSalesFormFromDelivery = useCallback((delivery: DeliveryOption) => {
    const branchId = delivery.branchId ?? resolvedPreferredBranchId ?? ''
    const customerId = delivery.customerId ?? ''
    setEditingSalesBillId(null)
    setLockedDeliverySnapshot(delivery)
    setLockedPoSellOptions([])
    setLockedReceiptSnapshot(null)
    setSalesForm({
      ...initialSalesForm(),
      branchId,
      channelId: defaultSalesChannelForCustomer(customerId) ?? '',
      customerId,
      deliveryTicketId: delivery.id,
      items: deliveryToSalesItems(delivery),
    })
    setTradingPurchaseSelectorIds([''])
    setSalesFieldErrors({})
    setError(null)
    setShowSalesForm(true)
  }, [resolvedPreferredBranchId, defaultSalesChannelForCustomer])

  useEffect(() => {
    const shouldOpen = searchParams.get('new') === '1'
    if (!shouldOpen || isLoading) return

    const targetDocNo = mode === 'purchase'
      ? searchParams.get('wti')?.trim() ?? ''
      : searchParams.get('wto')?.trim() ?? ''
    if (!targetDocNo) return

    const autoOpenKey = `${mode}:${targetDocNo}`
    if (handledAutoOpenRef.current === autoOpenKey) return
    handledAutoOpenRef.current = autoOpenKey

    if (mode === 'purchase') {
      const receipt = options.receipts.find((option) => option.id === targetDocNo || option.documentNo === targetDocNo)
      if (!receipt) {
        setError(`ไม่พบ WTI ${targetDocNo} หรือเอกสารถูกนำไปเปิดบิลแล้ว`)
        clearAutoOpenSearchParams()
        return
      }
      openPurchaseFormFromReceipt(receipt)
      clearAutoOpenSearchParams()
      return
    }

    const delivery = options.deliveries.find((option) => option.id === targetDocNo || option.documentNo === targetDocNo)
    if (!delivery) {
      setError(`ไม่พบ WTO ${targetDocNo} หรือเอกสารถูกนำไปเปิดบิลแล้ว`)
      clearAutoOpenSearchParams()
      return
    }
    openSalesFormFromDelivery(delivery)
    clearAutoOpenSearchParams()
  }, [
    clearAutoOpenSearchParams,
    isLoading,
    mode,
    openPurchaseFormFromReceipt,
    openSalesFormFromDelivery,
    options.deliveries,
    options.receipts,
    searchParams,
  ])

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

  function poSellOptionForProduct(poSellId: string | null | undefined, productId: string | null | undefined) {
    if (!poSellId) return null
    const productMatched = productId
      ? activePoSells.find((option) => option.id === poSellId && option.product_id === productId)
      : null
    return productMatched
      ?? activePoSells.find((option) => option.id === poSellId && !option.product_id)
      ?? activePoSells.find((option) => option.id === poSellId)
      ?? null
  }

  function poSellAvailableForRow(poSellId: string | null, index: number) {
    if (!poSellId) return 0
    const currentItem = salesForm.items[index]
    const currentProductId = currentItem?.productId ?? null
    const po = poSellOptionForProduct(poSellId, currentProductId)
    if (!po) return 0
    const allocatedOtherRows = salesForm.items.reduce((sum, item, itemIndex) => {
      if (itemIndex === index) return sum
      if (item.poSellId !== poSellId) return sum
      if (currentProductId && item.productId !== currentProductId) return sum
      return sum + item.qty
    }, 0)
    return Math.max(0, (po.remainingQty ?? 0) - allocatedOtherRows)
  }

  function poSellVarianceForRow(poSellId: string | null, index: number) {
    if (!poSellId) return null
    const currentItem = salesForm.items[index]
    const po = poSellOptionForProduct(poSellId, currentItem?.productId ?? null)
    if (!po) return null
    const availableQty = poSellAvailableForRow(poSellId, index)
    if (currentItem.qty > availableQty + 0.001) {
      return { className: 'text-red-700', text: `เกิน ${formatMoney(currentItem.qty - availableQty)} กก.` }
    }
    return null
  }

  function poSellDetailText(option: Option | null, index: number) {
    if (!option) return null
    const currentItem = salesForm.items[index]
    if (!currentItem) return null
    const productUnit = activeProducts.find((product) => product.id === currentItem.productId)?.unit
    const unit = option.unit ?? productUnit ?? 'กก.'
    const currentQty = Math.max(0, currentItem.qty)
    const remainingAfterCurrentRow = Math.max(0, poSellAvailableForRow(option.id, index) - currentQty)
    return `ใช้ในบิลนี้ ${formatMoney(currentQty)}${unit ? ` ${unit}` : ''} · คงเหลือ ${formatMoney(remainingAfterCurrentRow)}${unit ? ` ${unit}` : ''} · ${formatMoney(option.unitPrice ?? 0)} บาท`
  }

  function tradingCostSourceOptionForProduct(sourceId: string | null | undefined, productId: string | null | undefined) {
    if (!sourceId) return null
    const productMatched = productId
      ? activeTradingCostSources.find((option) => option.id === sourceId && option.product_id === productId)
      : null
    return productMatched
      ?? activeTradingCostSources.find((option) => option.id === sourceId)
      ?? null
  }

  function tradingCostSourceAvailableForRow(sourceId: string | null, index: number) {
    if (!sourceId) return 0
    const currentItem = salesForm.items[index]
    const currentProductId = currentItem?.productId ?? null
    const source = tradingCostSourceOptionForProduct(sourceId, currentProductId)
    if (!source) return 0
    const allocatedOtherRows = salesForm.items.reduce((sum, item, itemIndex) => {
      if (itemIndex === index) return sum
      if (item.tradingCostSourceId !== sourceId) return sum
      if (currentProductId && item.productId !== currentProductId) return sum
      return sum + item.qty
    }, 0)
    return Math.max(0, (source.remainingQty ?? 0) - allocatedOtherRows)
  }

  const salesStockAllocationIssues = (() => {
    if (!selectedDelivery) return []
    if (!salesForm.items.some((item) => item.deliveryTicketId)) return []
    return selectedDelivery.productSummaries.flatMap((summary) => {
      const state = salesStockSummaryDraft.get(summary.id)
      const acceptedQty = state?.allocatedQty ?? 0
      const overQty = acceptedQty - summary.remainingWeight
      if (overQty <= 0.001) return []
      return [{
        className: 'text-red-700',
        message: `${summary.productName}: ขายเกินใบส่งของ ${formatMoney(overQty)} กก.`,
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
      deductWeight: 0,
      discount: 0,
      grossWeight: summary.remainingWeight,
      netWeight: summary.remainingWeight,
      note: null,
      poSellId: null,
      price: 0,
      productId: summary.productId,
      qty: summary.remainingWeight,
      tradingCostSourceId: null,
    }))
  }

  function tradingSourceToSalesItem(source: Option): SalesBillFormValues['items'][number] {
    const remainingQty = source.remainingQty ?? 0
    return {
      deliveryLineId: null,
      deliverySummaryId: null,
      deliveryTicketDocNo: null,
      deliveryTicketId: null,
      deductWeight: 0,
      discount: 0,
      grossWeight: remainingQty,
      netWeight: remainingQty,
      note: null,
      poSellId: null,
      price: 0,
      productId: source.product_id ?? '',
      qty: remainingQty,
      tradingCostSourceId: source.id,
    }
  }

  function tradingPurchaseBillToSalesItems(source: TradingPurchaseBillOption): SalesBillFormValues['items'] {
    return source.lines.map((line) => tradingSourceToSalesItem(line))
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

  async function openRow(row: BillRow) {
    const docNo = row.docNo || row.id
    const requestId = latestDetailRequestRef.current + 1
    latestDetailRequestRef.current = requestId
    setDetailBillDocNo(docNo)
    setDetailBill(null)
    setSalesDetailBill(null)
    setDetailError(null)
    setIsDetailLoading(true)
    try {
      if (mode === 'sales') {
        const detail = await dailyFetchJson<SalesBillDetail>(`/api/sales/bills/${encodeURIComponent(docNo)}`)
        if (latestDetailRequestRef.current !== requestId) return
        setSalesDetailBill(detail)
        return
      }
      const detail = await dailyFetchJson<PurchaseBillDetail>(`/api/purchase/bills/${encodeURIComponent(docNo)}`)
      if (latestDetailRequestRef.current !== requestId) return
      setDetailBill(detail)
    } catch (caught) {
      if (latestDetailRequestRef.current !== requestId) return
      setDetailError(caught instanceof Error ? caught.message : mode === 'sales' ? 'โหลดรายละเอียดบิลขายไม่ได้' : 'โหลดรายละเอียดบิลรับซื้อไม่ได้')
    } finally {
      if (latestDetailRequestRef.current !== requestId) return
      setIsDetailLoading(false)
    }
  }

  function openListRow(row: BillRow) {
    void openRow(row)
  }

  async function reloadSalesDetail(docNo: string) {
    const requestId = latestDetailRequestRef.current + 1
    latestDetailRequestRef.current = requestId
    setDetailError(null)
    setIsDetailLoading(true)
    try {
      const detail = await dailyFetchJson<SalesBillDetail>(`/api/sales/bills/${encodeURIComponent(docNo)}`)
      if (latestDetailRequestRef.current !== requestId) return
      setSalesDetailBill(detail)
    } catch (caught) {
      if (latestDetailRequestRef.current !== requestId) return
      setDetailError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดบิลขายไม่ได้')
    } finally {
      if (latestDetailRequestRef.current !== requestId) return
      setIsDetailLoading(false)
    }
  }

  async function correctTradingAllocations(docNo: string, allocations: Array<{ salesLineNo: number; tradingCostSourceId: string }>, note: string) {
    await dailyFetchJson(`/api/sales/bills/${encodeURIComponent(docNo)}`, {
      body: JSON.stringify({
        action: 'correct_trading_allocations',
        allocations,
        note,
      }),
      method: 'PATCH',
    })
    await Promise.all([loadData(), reloadSalesDetail(docNo)])
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
    setEditingSalesBillId(null)
    setLockedDeliverySnapshot(null)
    setLockedPoSellOptions([])
    setLockedReceiptSnapshot(null)
    setSalesForm({ ...initialSalesForm(), branchId: resolvedPreferredBranchId ?? '' })
    setTradingPurchaseSelectorIds([''])
    setSalesFieldErrors({})
    setError(null)
    setShowSalesForm(true)
  }

  function salesDeliverySnapshotFromDetail(detail: SalesBillDetail): DeliveryOption | null {
    const deliveryItems = detail.items.filter((item) => item.deliveryTicketDocNo)
    if (deliveryItems.length === 0) return null
    const documentNo = detail.deliveryDocNos[0] ?? deliveryItems[0]?.deliveryTicketDocNo ?? ''
    if (!documentNo) return null
    const summaryById = new Map<string, DeliveryOption['productSummaries'][number]>()
    deliveryItems.forEach((item) => {
      const summaryId = item.deliverySummaryId || `${documentNo}:${item.deliveryLineId || item.lineNo}`
      const sourceProductId = item.sourceProductCode || item.productCode || item.productId
      const sourceProductName = item.sourceProductName || item.productName
      const current = summaryById.get(summaryId)
      const sourceGrossWeight = item.sourceGrossWeight || item.grossWeight
      const sourceDeductWeight = item.sourceDeductWeight || item.deductWeight
      const sourceNetWeight = item.sourceNetWeight || item.netWeight
      const sourceLineIds = item.deliveryLineId ? [item.deliveryLineId] : []
      if (current) {
        current.billedWeight = Math.max(current.billedWeight, sourceNetWeight)
        current.grossWeight = Math.max(current.grossWeight, sourceGrossWeight)
        current.netWeight = Math.max(current.netWeight, sourceNetWeight)
        current.remainingWeight = Math.max(current.remainingWeight, sourceNetWeight)
        current.sourceLineIds = Array.from(new Set([...current.sourceLineIds, ...sourceLineIds]))
        current.lineCount = Math.max(current.lineCount, item.sourceLineCount || current.sourceLineIds.length || 1)
        if (current.unitCostSnapshot == null && item.unitCostSnapshot != null) current.unitCostSnapshot = item.unitCostSnapshot
        return
      }
      summaryById.set(summaryId, {
        billedWeight: sourceNetWeight,
        deductWeight: sourceDeductWeight,
        grossWeight: sourceGrossWeight,
        hasMixedDeductionProfiles: false,
        id: summaryId,
        lineCount: item.sourceLineCount || 1,
        netWeight: sourceNetWeight,
        productId: sourceProductId,
        productName: sourceProductName,
        remainingWeight: sourceNetWeight,
        sourceLineIds,
        unitCostSnapshot: item.unitCostSnapshot,
      })
    })

    return {
      branchId: detail.branchId,
      branchName: detail.branchName,
      customerId: detail.customerCode,
      documentDate: detail.date,
      documentNo,
      id: documentNo,
      lines: deliveryItems.map((item) => ({
        deductWeight: item.deductWeight,
        grossWeight: item.grossWeight,
        id: item.deliveryLineId || `${documentNo}:${item.lineNo}`,
        lineNo: item.lineNo,
        netWeight: item.sourceNetWeight || (detail.transactionMode === 'STOCK' ? Number(((item.qty ?? item.netWeight) + item.deductWeight).toFixed(2)) : item.netWeight),
        note: item.note,
        productId: item.sourceProductCode || item.productCode || item.productId,
        productName: item.sourceProductName || item.productName,
        remainingQty: item.sourceNetWeight || item.netWeight,
        usedQty: 0,
      })),
      partyName: detail.customerName,
      productSummaries: [...summaryById.values()],
      status: '',
      vehicleNo: deliveryItems[0]?.deliveryVehicleNo ?? '',
    }
  }

  function salesPoSellOptionsFromDetail(detail: SalesBillDetail): Option[] {
    const optionsByKey = new Map<string, Option>()
    detail.items.forEach((item) => {
      const poSellDocNo = item.poSellDocNo?.trim()
      if (!poSellDocNo) return
      const productId = item.productCode || item.productId || null
      const key = `${poSellDocNo}:${productId ?? ''}`
      const current = optionsByKey.get(key)
      const qty = item.qty
      const amount = item.amount || item.price * qty
      if (current) {
        current.lockedAmount = (current.lockedAmount ?? 0) + amount
        current.lockedQty = (current.lockedQty ?? 0) + qty
        current.remainingAmount = (current.remainingAmount ?? 0) + amount
        current.remainingQty = (current.remainingQty ?? 0) + qty
        current.label = `${poSellDocNo} · ใช้ในบิลนี้ ${formatMoney(current.lockedQty ?? 0)}${item.unit ? ` ${item.unit}` : ' กก.'} · ${item.price.toLocaleString('th-TH')} บาท`
        return
      }
      optionsByKey.set(key, {
        active: true,
        branch_id: detail.branchId,
        customer_id: detail.customerCode === '-' ? null : detail.customerCode,
        id: poSellDocNo,
        label: `${poSellDocNo} · ใช้ในบิลนี้ ${formatMoney(qty)}${item.unit ? ` ${item.unit}` : ' กก.'} · ${item.price.toLocaleString('th-TH')} บาท`,
        line_id: `${poSellDocNo}:locked:${productId ?? 'all'}`,
        lockedAmount: amount,
        lockedQty: qty,
        name: poSellDocNo,
        product_id: productId,
        remainingAmount: amount,
        remainingQty: qty,
        status: 'locked',
        unit: item.unit || 'กก.',
        unitPrice: item.price,
      })
    })
    return [...optionsByKey.values()]
  }

  function salesFormFromDetail(detail: SalesBillDetail, row: BillRow): SalesBillFormValues {
    const transactionMode = detail.transactionMode === 'TRADING' ? 'TRADING' : 'STOCK'
    const channelId = options.salesChannels.find((channel) => (
      channel.name === detail.channelName ||
      channel.code === detail.channelName
    ))?.id ?? ''
    const warehouseId = options.warehouses.find((warehouse) => warehouse.name === detail.warehouseName)?.id ?? null
    const deliveryDocNo = detail.deliveryDocNos[0] ?? detail.items.find((item) => item.deliveryTicketDocNo)?.deliveryTicketDocNo ?? null
    const tradingSourceByDocLine = new Map(
      options.tradingCostSources.map((source) => {
        const parts = source.id.split(':')
        const sourceDocNo = parts[1] ?? ''
        const parsedLineNo = parts[2] ? Number(parts[2]) : null
        const sourceLineNo = source.sourceLineNo ?? parsedLineNo ?? ''
        return [`${sourceDocNo}:${sourceLineNo}`, source.id] as const
      }),
    )

    return {
      branchId: detail.branchId,
      channelId,
      customerAdvanceId: detail.customerAdvanceDocNo || null,
      customerId: detail.customerCode === '-' ? '' : detail.customerCode,
      deliveryTicketId: transactionMode === 'STOCK' ? deliveryDocNo : null,
      discountTotal: detail.discount,
      exportOrderNo: detail.exportOrderNo || null,
      hasVat: detail.hasVat,
      items: detail.items.map((item) => ({
        deliveryLineId: item.deliveryLineId || null,
        deliverySummaryId: item.deliverySummaryId || null,
        deliveryTicketDocNo: item.deliveryTicketDocNo || null,
        deliveryTicketId: item.deliveryTicketDocNo || null,
        deductWeight: item.deductWeight,
        discount: item.discount,
        grossWeight: item.grossWeight,
        netWeight: item.netWeight,
        note: item.note || null,
        poSellId: item.poSellDocNo || null,
        price: item.price,
        productId: item.productCode || item.productId,
        qty: item.qty,
        salesBillLineNo: item.lineNo,
        tradingCostSourceId: item.tradingSourceDocNo
          ? tradingSourceByDocLine.get(`${item.tradingSourceDocNo}:${item.tradingSourceLineNo ?? ''}`) ?? null
          : null,
      })),
      licensePlate: detail.items.find((item) => item.deliveryVehicleNo)?.deliveryVehicleNo || null,
      note: detail.note || null,
      poSellId: null,
      refNo: row.refNo || null,
      transactionMode,
      vatInvoiceDate: detail.vatInvoiceDate || null,
      vatInvoiceIssued: detail.vatInvoiceIssued,
      vatInvoiceNo: detail.vatInvoiceNo || null,
      vatType: detail.vatType === 'EXCLUDE' || detail.vatType === 'INCLUDE' ? detail.vatType : 'NONE',
      warehouseId,
    }
  }

  async function openEditSalesForm(row: BillRow) {
    if (row.canEdit === false) {
      setError(row.editLockedReason ?? row.lockedReason ?? 'บิลขายนี้แก้ไขไม่ได้')
      return
    }
    const docNo = row.docNo || row.id
    setIsDetailLoading(true)
    setError(null)
    try {
      const detail = await dailyFetchJson<SalesBillDetail>(`/api/sales/bills/${encodeURIComponent(docNo)}`)
      setEditingSalesBillId(docNo)
      setLockedDeliverySnapshot(salesDeliverySnapshotFromDetail(detail))
      setLockedPoSellOptions(salesPoSellOptionsFromDetail(detail))
      setSalesForm(salesFormFromDetail(detail, row))
      setTradingPurchaseSelectorIds([''])
      setSalesFieldErrors({})
      setShowSalesForm(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลบิลขายเพื่อแก้ไขไม่ได้')
    } finally {
      setIsDetailLoading(false)
    }
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

  function openCancelSalesBill(row: BillRow) {
    if (row.canCancel === false) {
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
          if (!options.suppliers.some((supplier) => supplier.id === current.supplierId && supplier.active !== false && supplier.branchIds?.includes(nextBranchId))) {
            next.supplierId = ''
            next.salesId = null
          }
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
      const identityKeys: Array<keyof SalesBillFormValues> = ['branchId', 'customerId', 'deliveryTicketId', 'transactionMode']
      if (editingSalesBillId && identityKeys.includes(key) && value !== current[key]) {
        return current
      }
      const stockContextLocked = current.transactionMode === 'STOCK' && Boolean(current.deliveryTicketId)
      if (
        stockContextLocked
        && (
          (key === 'branchId' && value !== current.branchId)
          || (key === 'customerId' && value !== current.customerId)
          || (key === 'deliveryTicketId' && value !== current.deliveryTicketId)
          || (key === 'transactionMode' && value !== current.transactionMode)
        )
      ) {
        return current
      }

      const next: SalesBillFormValues = {
        ...current,
        [key]: value,
        ...(key === 'branchId' ? { warehouseId: null } : {}),
        ...(key === 'hasVat' ? { vatType: (value ? 'EXCLUDE' : 'NONE') as SalesBillFormValues['vatType'] } : {}),
        ...(key === 'vatInvoiceIssued' && value === false ? { vatInvoiceDate: null, vatInvoiceNo: null } : {}),
      }

      if (key === 'branchId' || key === 'customerId' || key === 'transactionMode') {
        next.deliveryTicketId = null
        if (key === 'branchId') {
          const nextBranchId = typeof value === 'string' ? value : ''
          if (!options.customers.some((customer) => customer.id === current.customerId && customer.active !== false && customer.branchIds?.includes(nextBranchId))) {
            next.customerId = ''
            next.customerAdvanceId = null
            next.channelId = ''
            next.exportOrderNo = null
          }
        }
        if (key === 'customerId') {
          next.customerAdvanceId = null
          next.channelId = defaultSalesChannelForCustomer(typeof value === 'string' ? value : '') ?? ''
          next.exportOrderNo = null
        }
        if (key === 'transactionMode' && value === 'STOCK') {
          next.items = [blankSalesItem()]
        } else if (key === 'transactionMode' && value === 'TRADING') {
          next.items = []
        } else {
          next.items = current.items.map((item) => ({
            ...item,
            deliveryLineId: null,
            deliverySummaryId: null,
            deliveryTicketDocNo: null,
            deliveryTicketId: null,
            deductWeight: 0,
            grossWeight: 0,
            netWeight: 0,
            poSellId: null,
          }))
        }
      }

      if (key === 'deliveryTicketId') {
        const deliveryId = typeof value === 'string' ? value : ''
        const delivery = (options.deliveries ?? []).find((option) => option.id === deliveryId)
        next.discountTotal = 0
        if (current.transactionMode === 'TRADING') {
          const nonDeliveryItems = current.items.filter((item) => !item.deliveryTicketId)
          next.items = delivery ? [...nonDeliveryItems, ...deliveryToSalesItems(delivery)] : nonDeliveryItems
        } else {
          next.items = delivery ? deliveryToSalesItems(delivery) : [blankSalesItem()]
        }
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
    if (key === 'branchId' || key === 'customerId' || key === 'transactionMode') {
      setTradingPurchaseSelectorIds([''])
    }
    setSalesFieldErrors((current) => ({
      ...current,
      [key]: '',
      ...(key === 'customerId' ? { channelId: '' } : {}),
    }))
  }

  function updateSalesItem(index: number, key: keyof SalesBillFormValues['items'][number], value: string | number | null) {
    setSalesForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item),
    }))
    setSalesFieldErrors({})
  }

  function updateSalesSplitProduct(index: number, productId: string) {
    setSalesForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const selectedPoSell = item.poSellId ? poSellOptionForProduct(item.poSellId, productId) : null
        const selectedTradingCostSource = item.tradingCostSourceId ? tradingCostSourceOptionForProduct(item.tradingCostSourceId, productId) : null
        return {
          ...item,
          poSellId: selectedPoSell ? item.poSellId : null,
          price: selectedPoSell ? selectedPoSell.unitPrice ?? item.price : item.poSellId ? 0 : item.price,
          productId,
          tradingCostSourceId: selectedTradingCostSource ? item.tradingCostSourceId : item.deliveryTicketId ? item.tradingCostSourceId : null,
        }
      }),
    }))
    setSalesFieldErrors({})
  }

  function updateSalesItemWeights(index: number, key: 'deductWeight' | 'grossWeight', value: number) {
    setSalesForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const next = { ...item, [key]: value }
        const qty = Number(Math.max(0, next.grossWeight - next.deductWeight).toFixed(2))
        return { ...next, netWeight: qty, qty }
      }),
    }))
    setSalesFieldErrors({})
  }

  function updateSalesStockSaleWeight(index: number, key: 'deductWeight' | 'netWeight', value: number) {
    setSalesForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const next = { ...item, [key]: value }
        const qty = Number(Math.max(0, next.netWeight).toFixed(2))
        return { ...next, qty }
      }),
    }))
    setSalesFieldErrors({})
  }

  function updateSalesItemPoSell(index: number, poSellId: string | null) {
    setSalesForm((current) => {
      const items: SalesBillFormValues['items'] = []
      for (let itemIndex = 0; itemIndex < current.items.length; itemIndex += 1) {
        const item = current.items[itemIndex]
        if (itemIndex !== index) {
          items.push(item)
          continue
        }
        const nextRow = current.items[itemIndex + 1]
        const mergeNextSpotSplit = current.transactionMode === 'TRADING'
          && Boolean(item.poSellId)
          && Boolean(item.tradingCostSourceId)
          && Boolean(nextRow)
          && !nextRow?.poSellId
          && nextRow?.tradingCostSourceId === item.tradingCostSourceId
          && nextRow?.productId === item.productId
          && !nextRow?.deliveryTicketId
        const mergedSplitQty = mergeNextSpotSplit ? (nextRow?.qty ?? 0) : 0
        const selectedPoSell = poSellId ? poSellOptionForProduct(poSellId, item.productId) : null
        const selectedTradingCostSource = item.tradingCostSourceId ? tradingCostSourceOptionForProduct(item.tradingCostSourceId, item.productId) : null
        const summaryId = item.deliverySummaryId ?? item.deliveryLineId ?? null
        const summary = summaryId ? deliverySummaryById.get(summaryId) : null
        const allocatedOtherSummaryRows = current.items.reduce((sum, row, rowIndex) => {
          if (rowIndex === index) return sum
          return (row.deliverySummaryId ?? row.deliveryLineId) === summaryId ? sum + row.qty : sum
        }, 0)
        const tradingRequestedQty = item.qty > 0 ? item.qty : selectedPoSell?.remainingQty ?? 0
        const summaryCapacity = current.transactionMode === 'STOCK'
          ? Math.max(0, (summary?.remainingWeight ?? item.netWeight ?? item.qty) - allocatedOtherSummaryRows)
          : Math.max(0, tradingRequestedQty)
        const allocatedOtherPoRows = poSellId
          ? current.items.reduce((sum, row, rowIndex) => {
            if (rowIndex === index) return sum
            if (row.poSellId !== poSellId) return sum
            if (item.productId && row.productId !== item.productId) return sum
            return sum + row.qty
          }, 0)
          : 0
        const poCapacity = poSellId ? Math.max(0, (selectedPoSell?.remainingQty ?? 0) - allocatedOtherPoRows) : summaryCapacity
        const allocatedOtherCostSourceRows = item.tradingCostSourceId
          ? current.items.reduce((sum, row, rowIndex) => {
            if (rowIndex === index) return sum
            if (row.tradingCostSourceId !== item.tradingCostSourceId) return sum
            if (item.productId && row.productId !== item.productId) return sum
            return sum + row.qty
          }, 0)
          : 0
        const costSourceCapacity = item.tradingCostSourceId
          ? Math.max(0, (selectedTradingCostSource?.remainingQty ?? 0) - allocatedOtherCostSourceRows)
          : Number.POSITIVE_INFINITY
        const requestedQty = Number((item.qty + mergedSplitQty).toFixed(2))
        if (!poSellId) {
          const nextDeductWeight = item.deductWeight
          const nextSaleWeight = Number((requestedQty + nextDeductWeight).toFixed(2))
          items.push({
            ...item,
            grossWeight: nextSaleWeight,
            netWeight: nextSaleWeight,
            poSellId: null,
            price: 0,
            qty: requestedQty,
          })
          if (mergeNextSpotSplit) itemIndex += 1
          continue
        }
        const sourceAllowedQty = Math.min(requestedQty, summaryCapacity, costSourceCapacity)
        const nextQty = Math.min(sourceAllowedQty, poCapacity)
        const nextItem = {
          ...item,
          ...(nextQty < requestedQty ? { deductWeight: 0, grossWeight: nextQty, netWeight: nextQty } : { netWeight: nextQty }),
          poSellId,
          price: poSellId ? (selectedPoSell?.unitPrice ?? 0) : item.price,
          qty: nextQty,
        }
        items.push(nextItem)

        const leftoverQty = sourceAllowedQty - nextQty
        if (current.transactionMode === 'TRADING' && poSellId && leftoverQty > 0.0001) {
          items.push({
            ...item,
            deductWeight: 0,
            grossWeight: Number(leftoverQty.toFixed(2)),
            netWeight: Number(leftoverQty.toFixed(2)),
            poSellId: null,
            price: 0,
            qty: Number(leftoverQty.toFixed(2)),
          })
        }
        if (mergeNextSpotSplit) itemIndex += 1
      }
      return { ...current, items }
    })
    setSalesFieldErrors({})
  }

  function updateSalesItemTradingCostSource(index: number, tradingCostSourceId: string | null) {
    setSalesForm((current) => {
      const items = current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item
        const selectedSource = tradingCostSourceId ? tradingCostSourceOptionForProduct(tradingCostSourceId, item.productId) : null
        const allocatedOtherRows = tradingCostSourceId
          ? current.items.reduce((sum, row, rowIndex) => {
              if (rowIndex === index) return sum
              if (row.tradingCostSourceId !== tradingCostSourceId) return sum
              if (item.productId && row.productId !== item.productId) return sum
              return sum + row.qty
            }, 0)
          : 0
        const sourceCapacity = tradingCostSourceId ? Math.max(0, (selectedSource?.remainingQty ?? 0) - allocatedOtherRows) : 0
        const nextQty = tradingCostSourceId && item.qty <= 0.0001 ? sourceCapacity : item.qty
        return {
          ...item,
          qty: tradingCostSourceId ? Math.min(nextQty, sourceCapacity) : item.qty,
          tradingCostSourceId,
        }
      })
      return { ...current, items }
    })
    setSalesFieldErrors({})
  }

  function updateTradingPurchaseSelector(selectorIndex: number, sourceId: string) {
    if (editingSalesBillId) return
    const previousSourceId = tradingPurchaseSelectorIds[selectorIndex] ?? ''
    const source = sourceId ? activeTradingPurchaseBills.find((option) => option.id === sourceId) ?? null : null
    if (sourceId && (!source || (sourceId !== previousSourceId && selectedTradingPurchaseSourceIds.has(sourceId)))) return
    setTradingPurchaseSelectorIds((current) => current.map((value, index) => (index === selectorIndex ? sourceId : value)))
    setSalesForm((current) => {
      const deliveryItems = current.items.filter((item) => item.deliveryTicketId)
      const previousLineIds = previousSourceId
        ? activeTradingPurchaseBills.find((option) => option.id === previousSourceId)?.lines.map((line) => line.id) ?? []
        : []
      const previousLineIdSet = new Set(previousLineIds)
      const tradingItems = current.items.filter((item) => {
        if (item.deliveryTicketId) return false
        if (!item.tradingCostSourceId || !previousSourceId) return true
        if (previousLineIdSet.has(item.tradingCostSourceId)) return false
        return !item.tradingCostSourceId.startsWith(`${previousSourceId}:`)
      })
      return {
        ...current,
        items: source ? [...tradingItems, ...tradingPurchaseBillToSalesItems(source), ...deliveryItems] : [...tradingItems, ...deliveryItems],
      }
    })
    setSalesFieldErrors({})
  }

  function addTradingPurchaseSelector() {
    if (editingSalesBillId) return
    setTradingPurchaseSelectorIds((current) => (current.some((sourceId) => !sourceId) ? current : [...current, '']))
  }

  function removeTradingPurchaseSelector(selectorIndex: number) {
    if (editingSalesBillId) return
    const sourceId = tradingPurchaseSelectorIds[selectorIndex] ?? ''
    const lineIds = sourceId
      ? activeTradingPurchaseBills.find((option) => option.id === sourceId)?.lines.map((line) => line.id) ?? []
      : []
    const lineIdSet = new Set(lineIds)
    setTradingPurchaseSelectorIds((current) => {
      const next = current.filter((_value, index) => index !== selectorIndex)
      return next.length > 0 ? next : ['']
    })
    setSalesForm((current) => ({
      ...current,
      items: current.items.filter((item) => {
        if (!item.tradingCostSourceId || !sourceId) return true
        if (lineIdSet.has(item.tradingCostSourceId)) return false
        return !item.tradingCostSourceId.startsWith(`${sourceId}:`)
      }),
    }))
    setSalesFieldErrors({})
  }

  function addSalesStockAllocationRow(index: number) {
    setSalesForm((current) => {
      const source = current.items[index]
      if (!source) return current
      const summaryId = source.deliverySummaryId ?? source.deliveryLineId ?? null
      if (!summaryId) return current
      const summary = deliverySummaryById.get(summaryId)
      if (!summary) return current
      const allocatedQty = current.items.reduce((sum, item) => (
        (item.deliverySummaryId ?? item.deliveryLineId) === summaryId ? sum + item.netWeight : sum
      ), 0)
      const remainingQty = Math.max(0, summary.remainingWeight - allocatedQty)
      if (remainingQty <= 0.0001) return current
      const insertIndex = current.items.reduce((lastIndex, item, itemIndex) => (
        (item.deliverySummaryId ?? item.deliveryLineId) === summaryId ? itemIndex : lastIndex
      ), index) + 1
      const nextItem: SalesBillFormValues['items'][number] = {
        ...source,
        discount: 0,
        note: null,
        poSellId: null,
        price: 0,
        deductWeight: 0,
        grossWeight: 0,
        netWeight: source.poSellId ? remainingQty : 0,
        qty: source.poSellId ? remainingQty : 0,
        salesBillLineNo: null,
      }
      const items = [...current.items]
      items.splice(insertIndex, 0, nextItem)
      return { ...current, items }
    })
    setSalesFieldErrors({})
  }

  function removeSalesStockAllocationRow(index: number) {
    setSalesForm((current) => {
      const source = current.items[index]
      if (!source) return current
      const summaryId = source.deliverySummaryId ?? source.deliveryLineId ?? null
      if (!summaryId) return current
      const summaryRowCount = current.items.filter((item) => (item.deliverySummaryId ?? item.deliveryLineId) === summaryId).length
      if (summaryRowCount <= 1) return current
      return { ...current, items: current.items.filter((_item, itemIndex) => itemIndex !== index) }
    })
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

    if (isExportSalesBill && !parsed.data.exportOrderNo?.trim()) {
      setSalesFieldErrors((current) => ({ ...current, exportOrderNo: 'กรอกเลขที่ order ส่งออก' }))
      setError('กรอกเลขที่ order ส่งออกสำหรับบิลขายต่างประเทศ')
      focusFieldError('exportOrderNo')
      return
    }

    if (salesStockAllocationIssues.length > 0) {
      const nextFieldErrors = salesStockAllocationIssues.reduce<Record<string, string>>((errors, issue) => {
        if (issue.rowIndex != null) {
          errors[`items.${issue.rowIndex}.qty`] = issue.message
        }
        return errors
      }, { items: 'รายการจากใบส่งของ WTO ต้องไม่ขายเกินน้ำหนักคงเหลือ' })
      const firstIssue = salesStockAllocationIssues[0]
      const firstErrorKey = firstIssue?.rowIndex != null ? `items.${firstIssue.rowIndex}.qty` : 'items'
      setSalesFieldErrors(nextFieldErrors)
      setError(firstIssue?.message ?? 'รายการจากใบส่งของ WTO ต้องไม่ขายเกินน้ำหนักคงเหลือ')
      focusFieldError(firstErrorKey)
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson<{ docNo: string }>('/api/sales/bills', {
        body: JSON.stringify(editingSalesBillId ? { ...parsed.data, id: editingSalesBillId } : parsed.data),
        method: editingSalesBillId ? 'PATCH' : 'POST',
      })
      setEditingSalesBillId(null)
      setLockedDeliverySnapshot(null)
      setLockedPoSellOptions([])
      setShowSalesForm(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกบิลขายไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function cancelBill() {
    if (!cancelingBill) return
    const parsed = mode === 'sales'
      ? salesBillCancelSchema.safeParse({ note: cancelNote })
      : purchaseBillCancelSchema.safeParse({ action: 'cancel', id: cancelingBill.id, note: cancelNote })
    if (!parsed.success) {
      setCancelNoteError(parsed.error.flatten().fieldErrors.note?.[0] ?? 'กรอกหมายเหตุการยกเลิก')
      return
    }

    setIsSaving(true)
    setError(null)
    setCancelNoteError('')
    try {
      if (mode === 'sales') {
        const payload: SalesBillCancelValues & { action: 'cancel' } = { ...(parsed.data as SalesBillCancelValues), action: 'cancel' }
        await dailyFetchJson(`/api/sales/bills/${encodeURIComponent(cancelingBill.docNo)}`, {
          body: JSON.stringify(payload),
          method: 'PATCH',
        })
      } else {
        const payload: PurchaseBillCancelValues & { action: 'cancel' } = { ...(parsed.data as PurchaseBillCancelValues), action: 'cancel' }
        await dailyFetchJson('/api/purchase/bills', {
          body: JSON.stringify(payload),
          method: 'PATCH',
        })
      }
      setCancelingBill(null)
      setSupplierSwapMode(false)
      setSupplierSwapSupplierId('')
      setLockedReceiptSnapshot(null)
      setCancelNote('')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : mode === 'sales' ? 'ยกเลิกบิลขายไม่ได้' : 'ยกเลิกบิลรับซื้อไม่ได้')
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
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden space-y-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[260px] flex-1 rounded-md"
            placeholder={mode === 'purchase' ? 'ค้นหาเลขบิล / เลขอ้างอิง / ชื่อ Supplier...' : 'ค้นหาเลขบิล / เลขอ้างอิง / ชื่อลูกค้า...'}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
          {activeFilters ? <Button size="sm" type="button" variant="secondary" onClick={clearFilters}>ล้างตัวกรอง</Button> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-slate-500">ประเภท:</span>
          <Segment value="" current={filterMode} label="ทุกประเภท" onClick={setFilterMode} />
          <Segment value="STOCK" current={filterMode} label="📦 สต็อก" onClick={setFilterMode} />
          <Segment value="TRADING" current={filterMode} label="🔄 ซื้อมาขายไป" onClick={setFilterMode} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-14 shrink-0 text-xs text-slate-500">สถานะ:</span>
          {statusOptions.map((option) => (
            <SegmentMulti key={option.label} current={statusFilter} label={option.label} onClick={setStatusFilter} values={option.values} />
          ))}
          <div className="ml-auto flex items-center gap-2">
            {mode === 'purchase' ? <ExportButton isExporting={isExporting} onClick={() => void exportExcel()} /> : null}
            {mode === 'purchase' ? <Button type="button" className="hidden lg:inline-flex" onClick={openPurchaseForm}>+ บิลรับซื้อใหม่</Button> : null}
            {mode === 'sales' ? <ExportButton isExporting={isExporting} onClick={() => void exportExcel()} /> : null}
            {mode === 'sales' ? <Button disabled={isSaving} type="button" className="hidden lg:inline-flex" onClick={openSalesForm}>+ บิลขายใหม่</Button> : null}
          </div>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex gap-2 items-center">
          <Input
            className="min-w-[200px] flex-1 rounded-md h-9"
            placeholder={mode === 'purchase' ? 'ค้นหาเลขบิล / ผู้ขาย...' : 'ค้นหาเลขบิล / ลูกค้า...'}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {mobileFilterCount > 0 ? `(${mobileFilterCount})` : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรองรายการ"
          onClose={() => setShowMobileFilters(false)}
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
        >
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
                <div className="flex items-center gap-2">
                  <DatePickerInput className="flex-1" value={dateFrom} onChange={setDateFrom} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput className="flex-1" value={dateTo} onChange={setDateTo} />
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
                    inputId="mobile-purchase-bills-branch-filter"
                    label=""
                    placeholder="เลือกสาขา"
                    value={branchFilter || null}
                    onChange={(branchId) => setBranchFilter(branchId ?? '')}
                  />
                </div>
              ) : null}

                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600">ประเภท</span>
                  <div className="flex flex-wrap gap-2">
                    <Segment value="" current={filterMode} label="ทุกประเภท" onClick={setFilterMode} />
                    <Segment value="STOCK" current={filterMode} label="📦 สต็อก" onClick={setFilterMode} />
                    <Segment value="TRADING" current={filterMode} label="🔄 ซื้อมาขายไป" onClick={setFilterMode} />
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะ</span>
                  <div className="flex flex-wrap gap-2">
                    {statusOptions.map((option) => (
                      <SegmentMulti key={option.label} current={statusFilter} label={option.label} onClick={setStatusFilter} values={option.values} />
                    ))}
                  </div>
                </div>
        </MobileFilterSheet>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? <Button size="sm" type="button" variant="outline" className="hidden lg:inline-flex" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
          <PageSizeDropdown value={pageSize} onChange={setPageSize} />
          <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
        </div>
      </div>

      {/* Mobile Card List (Hidden on Desktop) */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
        ) : null}
        
        {!isLoading && pageRows.map((row) => {
          const name = mode === 'purchase' ? row.supplierName : row.customerName
          const subValue = mode === 'purchase' ? row.payableBalance : row.receivableBalance
          const totalVal = row.totalAmount ?? 0

          return (
            <div
              key={row.id}
              className={`rounded-xl border border-slate-100 p-4 shadow-sm transition-colors ${row.status === 'cancelled' ? 'bg-red-100/60 active:bg-red-200/60 text-slate-400' : 'bg-white active:bg-slate-50'} cursor-pointer`}
              onClick={() => openListRow(row)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
                <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
              </div>
              
              <div className="text-xs text-slate-600 mb-3 space-y-1">
                <div>
                  <span className="font-semibold text-slate-500">{mode === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า'}: </span>
                  <span className="text-slate-800">{name}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">ประเภท: </span>
                  <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold ${row.transactionMode === 'TRADING' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>
                    {transactionModeLabel(row.transactionMode)}
                  </span>
                </div>
                {row.note?.trim() ? (
                  <div className="text-xs text-slate-400 truncate">
                    หมายเหตุ: {row.note}
                  </div>
                ) : null}
              </div>

              <div className="flex justify-between items-end pt-2 border-t border-slate-100">
                <div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${mode === 'purchase' ? workflowStatusBadgeClass(row.paymentWorkflowStatus ?? 'pending_approval') : statusBadgeClass(row.status)}`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {mode === 'purchase' ? workflowStatusText(row.paymentWorkflowStatus ?? 'pending_approval') : statusText(row.status)}
                  </span>
                  <div className="mt-1 text-xs font-bold text-blue-700">
                    {formatMoney(totalVal)} บาท
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">ค้างจ่าย/ค้างรับ</span>
                  <span className="font-bold text-amber-600 text-sm tabular-nums">
                    {formatMoney(subValue ?? 0)} บาท
                  </span>
                </div>
              </div>

              {/* Mobile Action Buttons (Inline in Card) */}
              <div className="flex justify-end gap-2 mt-3 pt-2 border-t border-slate-100/60" onClick={(e) => e.stopPropagation()}>
                {mode === 'purchase' ? (
                  <>
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                      disabled={printingBillDocNo === row.docNo}
                      type="button"
                      onClick={() => void printPurchaseBill(row)}
                    >
                      พิมพ์
                    </button>
                    {row.canEdit !== false ? (
                      <>
                        <button
                          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"
                          type="button"
                          onClick={() => openEditPurchaseForm(row)}
                        >
                          แก้ไข
                        </button>
                        <button
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                          type="button"
                          onClick={() => openCancelPurchaseBill(row)}
                        >
                          ยกเลิก
                        </button>
                      </>
                    ) : null}
                  </>
                ) : null}

                {mode === 'sales' ? (
                  <>
                    <button
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                      disabled={printingBillDocNo === row.docNo}
                      type="button"
                      onClick={() => void printSalesBill(row)}
                    >
                      พิมพ์
                    </button>
                    {row.canEdit !== false ? (
                      <button
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
                        disabled={isDetailLoading}
                        type="button"
                        onClick={() => void openEditSalesForm(row)}
                      >
                        แก้ไข
                      </button>
                    ) : null}
                    {row.canCancel !== false ? (
                      <button
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
                        type="button"
                        onClick={() => openCancelSalesBill(row)}
                      >
                        ยกเลิก
                      </button>
                    ) : null}
                  </>
                ) : null}

              </div>
            </div>
          )
        })}

        {!isLoading && totalRows === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
            ยังไม่มีรายการ
          </div>
        ) : null}
      </div>

      {/* Desktop Table (Hidden on Mobile) */}
      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
        <Table className="text-xs" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {tableColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <TableHeader>
            <tr>
              <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label={mode === 'purchase' ? 'เลขที่บิลซื้อ' : 'เลขที่บิลขาย'} resizeProps={columnResize.getResizeHandleProps('docNo', mode === 'purchase' ? 'เลขที่บิลซื้อ' : 'เลขที่บิลขาย')} sortKey="docNo" onSort={changeSort} />
              {mode === 'purchase' ? <ResizableTableHead align="center" label="เลขที่ใบรับของ" resizeProps={columnResize.getResizeHandleProps('receiptDocs', 'เลขที่ใบรับของ')} /> : null}
              {mode === 'sales' ? <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="เลขที่อ้างอิง" resizeProps={columnResize.getResizeHandleProps('refNo', 'เลขที่อ้างอิง')} sortKey="refNo" onSort={changeSort} /> : null}
              <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="วันที่สร้าง" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่สร้าง')} sortKey="date" onSort={changeSort} />
              <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label={mode === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า'} resizeProps={columnResize.getResizeHandleProps('partyName', mode === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า')} sortKey="name" onSort={changeSort} />
              {mode !== 'purchase' ? <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="สาขา / คลัง" resizeProps={columnResize.getResizeHandleProps('warehouse', 'สาขา / คลัง')} sortKey="warehouse" onSort={changeSort} /> : null}
              <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('transactionMode', 'ประเภท')} sortKey="transactionMode" onSort={changeSort} />
              <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label={mode === 'purchase' ? 'สถานะเอกสาร' : 'สถานะรับเงิน'} resizeProps={columnResize.getResizeHandleProps('status', mode === 'purchase' ? 'สถานะเอกสาร' : 'สถานะรับเงิน')} sortKey="status" onSort={changeSort} />
              {mode === 'purchase' ? <ResizableTableHead align="center" label="PMA / PMT" resizeProps={columnResize.getResizeHandleProps('paymentDocs', 'PMA / PMT')} /> : null}
              {mode !== 'purchase' ? <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="รายการ" resizeProps={columnResize.getResizeHandleProps('itemCount', 'รายการ')} sortKey="itemCount" onSort={changeSort} /> : null}
              <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ยอดรวม" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'ยอดรวม')} sortKey="totalAmount" onSort={changeSort} />
              {mode === 'sales' ? <ResizableTableHead align="right" label="GP / Margin" resizeProps={columnResize.getResizeHandleProps('gp', 'GP / Margin')} /> : null}
              {mode === 'sales' ? <ResizableTableHead align="right" label="รับแล้ว" resizeProps={columnResize.getResizeHandleProps('paidAmount', 'รับแล้ว')} /> : null}
              <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ค้างชำระ" resizeProps={columnResize.getResizeHandleProps('outstanding', 'ค้างชำระ')} sortKey="outstanding" onSort={changeSort} />
              {mode === 'sales' ? <ResizableTableHead align="center" label="VAT" resizeProps={columnResize.getResizeHandleProps('vat', 'VAT')} /> : null}
              <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="อัพเดตล่าสุด" resizeProps={columnResize.getResizeHandleProps('updatedBy', 'อัพเดตล่าสุด')} sortKey="updatedBy" onSort={changeSort} />
              <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
            </tr>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100">
            {isLoading ? <TableRow><td className="p-6 text-center text-slate-500" colSpan={tableColSpan}>กำลังโหลดข้อมูล</td></TableRow> : null}
            {!isLoading && pageRows.map((row) => (
              <TableRow key={row.id} className={`${row.status === 'cancelled' ? 'bg-red-100/60 hover:bg-red-200/60 text-slate-400' : 'hover:bg-slate-50'} cursor-pointer`} onClick={() => openListRow(row)}>
                <td className="whitespace-nowrap p-2 text-xs font-semibold text-slate-700">{row.docNo}</td>
                {mode === 'purchase' ? (
                  <td className="p-2 text-xs font-semibold text-slate-700">
                    <CollapsedList items={row.receiptDocNos} splitItems={true} />
                  </td>
                ) : null}
                {mode === 'sales' ? <td className="whitespace-nowrap p-2 text-xs font-semibold text-slate-700">{row.refNo || '-'}</td> : null}
                <td className="p-2 text-center text-xs font-semibold text-slate-700">{formatDateDisplay(row.date)}</td>
                <td className="p-2 text-xs font-semibold text-slate-700">{'supplierName' in row ? row.supplierName : row.customerName}</td>
                {mode !== 'purchase' ? <td className="p-2 text-xs font-semibold text-slate-700">{formatBranchWarehouse(row)}</td> : null}
                <td className="p-2 text-center"><span className={`rounded-md-full px-2 py-0.5 text-xs font-semibold ${row.transactionMode === 'TRADING' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>{transactionModeLabel(row.transactionMode)}</span></td>
                <td className="p-2 text-center">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${mode === 'purchase' ? workflowStatusBadgeClass(row.paymentWorkflowStatus ?? 'pending_approval') : statusBadgeClass(row.status)}`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    {mode === 'purchase' ? workflowStatusText(row.paymentWorkflowStatus ?? 'pending_approval') : statusText(row.status)}
                  </span>
                </td>
                {mode === 'purchase' ? <td className="p-2 text-center text-xs font-semibold text-slate-700"><CollapsedList items={row.paymentDocNos} splitItems={true} /></td> : null}
                {mode !== 'purchase' ? <td className="p-2 pr-4 text-right text-xs font-semibold text-slate-700 tabular-nums">{row.itemCount}</td> : null}
                <TableNumberCell strong value={formatMoney(row.totalAmount ?? 0)} />
                {mode === 'sales' ? <td className={`p-2 pr-4 text-right font-semibold tabular-nums ${(row.grossProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}><div>{formatMoney(row.grossProfit ?? 0)}</div><div className="text-xs text-slate-500">{formatMoney((row.subtotal ?? row.totalAmount ?? 0) > 0 ? (row.grossProfit ?? 0) / (row.subtotal ?? row.totalAmount ?? 1) * 100 : 0)}%</div></td> : null}
                {mode === 'sales' ? <TableNumberCell value={formatMoney(row.receivedAmount ?? 0)} /> : null}
                <TableNumberCell tone="amber" value={formatMoney(mode === 'purchase' ? row.payableBalance ?? 0 : row.receivableBalance ?? 0)} />
                {mode === 'sales' ? (
                  <td className="p-2 text-center">
                    {row.vatInvoiceIssued ? (
                      <span className="font-mono text-xs font-semibold text-slate-700">{row.vatInvoiceNo || '-'}</span>
                    ) : (
                      <span className="rounded-md-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">ยังไม่ออก</span>
                    )}
                  </td>
                ) : null}
                <td className="p-2 text-xs font-semibold text-slate-700"><div>{row.updatedBy || row.createdBy || '-'}</div><div className="text-xs font-normal text-slate-400">{formatDateTime(row.updatedAt || row.createdAt)}</div></td>
                {mode === 'purchase' ? (
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
                      {row.canEdit !== false ? (
                        <>
                          <button
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                            type="button"
                            onClick={(event) => { event.stopPropagation(); openEditPurchaseForm(row) }}
                          >
                            แก้ไข
                          </button>
                          <button
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                            type="button"
                            onClick={(event) => { event.stopPropagation(); openCancelPurchaseBill(row) }}
                          >
                            ยกเลิก
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                ) : null}
                {mode === 'sales' ? (
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
                      {row.canEdit !== false ? (
                        <button
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
                          disabled={isDetailLoading}
                          type="button"
                          onClick={(event) => { event.stopPropagation(); void openEditSalesForm(row) }}
                        >
                          แก้ไข
                        </button>
                      ) : null}
                      {row.canCancel !== false ? (
                        <button
                          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                          type="button"
                          onClick={(event) => { event.stopPropagation(); openCancelSalesBill(row) }}
                        >
                          ยกเลิก
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </TableRow>
            ))}
            {!isLoading && totalRows === 0 ? <TableRow><td className="p-6 text-center text-slate-500" colSpan={tableColSpan}>ยังไม่มีรายการ</td></TableRow> : null}
          </TableBody>
        </Table>
      </div>

      {/* Floating Action Button for Mobile */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden">
        <button
          className="flex size-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 active:scale-95 transition-transform"
          onClick={mode === 'purchase' ? openPurchaseForm : openSalesForm}
          type="button"
        >
          <Plus className="size-8" />
        </button>
      </div>

      {showForm && mode === 'purchase' ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <div className="mx-auto my-4 flex max-h-[94vh] w-full max-w-[1280px] flex-col overflow-hidden rounded-md border-0 bg-slate-900 shadow-2xl outline-none focus:outline-none">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-t-md border-b border-slate-800 bg-slate-900 px-6 py-4 text-white">
              <div className="min-w-0">
                <h3 className="text-xl font-bold">📥 {editingBillId ? 'แก้ไขบิลรับซื้อ' : 'สร้างบิลรับซื้อใหม่'}</h3>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button className="h-9 rounded-md border border-emerald-600 bg-emerald-600 px-5 text-sm font-normal text-white outline-none hover:border-emerald-700 hover:bg-emerald-700 focus:outline-none disabled:opacity-60" disabled={isSaving || !stockReceiptSelected} type="button" onClick={() => void savePurchaseBill()}>{isSaving ? 'กำลังบันทึก...' : supplierSwapMode ? 'บันทึกและสร้าง PB ใหม่' : editingBillId ? 'บันทึกการแก้ไข' : 'บันทึก'}</button>
                <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white outline-none hover:border-rose-700 hover:bg-rose-700 focus:outline-none" type="button" onClick={() => { setError(null); setSupplierSwapMode(false); setSupplierSwapSupplierId(''); setLockedReceiptSnapshot(null); setShowForm(false) }}>ยกเลิก</button>
              </div>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-6 text-sm">
              {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
              <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="amber">1</StepBadge>ประเภทบิล</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <RadioCard active={form.transactionMode === 'STOCK'} disabled={stockReceiptLocked} label="📦 สต็อก" note="ซื้อเข้าสต็อก · เข้าสต็อกและคำนวณ WAC ภายหลัง" onClick={() => updateForm('transactionMode', 'STOCK')} />
                  <RadioCard active={form.transactionMode === 'TRADING'} disabled={stockReceiptLocked} label="🔄 ซื้อมาขายไป" note="ซื้อขายผ่านมือ · ไม่เข้าสต็อกและไม่กระทบ WAC" onClick={() => updateForm('transactionMode', 'TRADING')} />
                </div>
                {form.transactionMode === 'TRADING' ? (
                  <div className="mt-3 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600">รายการ Trading ไม่เข้า Stock และจะใช้สำหรับจับคู่ขายใน Trading Matching ภายหลัง</div>
                ) : null}
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                <h4 className="mb-2 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="blue">2</StepBadge>ข้อมูลบิล</h4>
                <div className="grid gap-x-4 gap-y-2 md:grid-cols-[120px_170px_340px_320px] md:justify-start">
                  <BranchSelectCombobox branches={activeBranches} disabled={stockReceiptLocked} error={fieldErrors.branchId} errorKey="branchId" inputId="purchase-bill-branch-search" label="สาขา *" placeholder="เลือกสาขา" value={form.branchId} widthClassName="max-w-[120px]" onChange={(branchId) => updateForm('branchId', branchId ?? '')} />
                  {form.transactionMode === 'STOCK' ? (
                    <label className="block text-xs font-medium text-slate-600">
                      คลัง <span className="ml-1 text-red-600">*</span>
                      <Input
                        data-error-key="warehouseId"
                        className={`mt-1 w-full cursor-not-allowed bg-slate-100 ${fieldErrors.warehouseId ? 'border-red-400 bg-red-50 text-red-700' : form.warehouseId ? 'text-slate-900' : 'text-slate-400'}`}
                        readOnly
                        required
                        value={purchaseWarehouseDisplayValue}
                      />
                      {fieldErrors.warehouseId ? <div className="mt-1 text-xs text-red-600">{fieldErrors.warehouseId}</div> : null}
                    </label>
                  ) : null}
                  <div className="space-y-1 md:max-w-[340px]">
                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        {supplierSwapMode ? (
                          <label className="block text-xs font-medium text-slate-600">
                            Supplier เดิม <span className="ml-1 text-red-600">*</span>
                            <Input className="mt-1 w-full cursor-not-allowed bg-slate-100 text-slate-700" readOnly value={selectedSupplier ? `${selectedSupplier.code ? `${selectedSupplier.code} — ` : ''}${selectedSupplier.name}` : '-'} />
                          </label>
                        ) : (
                          <SupplierSearchCombobox className="w-full" disabled={supplierLockedByReceipt || !form.branchId} error={fieldErrors.supplierId} errorKey="supplierId" options={activeSuppliers} placeholder={form.branchId ? 'ค้นหาชื่อหรือรหัสผู้ขาย' : 'เลือกสาขาก่อน'} value={form.supplierId} onChange={(value) => updateForm('supplierId', value)} />
                        )}
                      </div>
                      {editingBillId && stockReceiptLocked && !supplierSwapMode ? (
                        <Button
                          className="h-9 whitespace-nowrap px-3"
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={enterSupplierSwapMode}
                        >
                          เปลี่ยน Supplier
                        </Button>
                      ) : null}
                    </div>
                    {supplierSwapMode ? (
                      <>
                        <SearchCombobox
                          error={fieldErrors.supplierSwapSupplierId}
                          errorKey="supplierSwapSupplierId"
                          inputId="purchase-bill-supplier-swap-search"
                          label="Supplier ใหม่ *"
                          options={supplierSwapOptions}
                          placeholder="ค้นหา Supplier ใหม่"
                          value={supplierSwapSupplierId}
                          onChange={(value) => {
                            setSupplierSwapSupplierId(value)
                            setForm((current) => ({ ...current, advancePaymentId: null }))
                            setFieldErrors((current) => ({ ...current, advancePaymentId: '', supplierSwapSupplierId: '' }))
                          }}
                        />
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          โหมดเปลี่ยน Supplier จะ void บิลเดิมและสร้าง PB ใหม่เมื่อกดบันทึก ระบบจะคืน ADV เดิมของบิลเก่าและไม่นำ ADV เดิมไปใช้กับบิลใหม่อัตโนมัติ
                        </div>
                      </>
                    ) : null}
                  </div>
                  {form.transactionMode === 'STOCK' ? (
                    <SearchCombobox
                      disabled={stockReceiptLocked || !stockReceiptPrerequisiteReady}
                      error={fieldErrors.receiptTicketId}
                      errorKey="receiptTicketId"
                      inputId="purchase-bill-receipt-search"
                      label="ใบรับของ WTI *"
                      options={receiptOptionsForSelect.map((receipt) => ({
                        description: `${receipt.partyName} · ${receipt.documentDate} · ${receipt.lines.length} รายการ`,
                        id: receipt.id,
                        label: receipt.documentNo,
                        searchText: `${receipt.documentNo} ${receipt.partyName} ${receipt.vehicleNo} ${receipt.branchName}`.toLowerCase(),
                      }))}
                      placeholder={stockReceiptLocked ? 'ล็อกใบรับของเดิม' : stockReceiptPrerequisiteReady ? 'ค้นหาเลขที่ใบรับของ' : 'เลือกสาขาและผู้ขายก่อน'}
                      value={form.receiptTicketId ?? ''}
                      onChange={(value) => updateForm('receiptTicketId', value || null)}
                    />
                  ) : null}
                </div>
                {form.transactionMode === 'STOCK' ? (
                  <div className="mt-2">
                    {selectedReceipt ? (
                      <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700">
                        <div className="grid gap-x-4 gap-y-1 md:grid-cols-[120px_170px_340px_320px]">
                        <div className="min-w-0"></div>
                        <div className="min-w-0"><span className="font-semibold text-slate-500">ผู้ดูแล: </span><span className="text-slate-900">{selectedSupplierCaretakerName || '-'}</span></div>
                        <div className="min-w-0 whitespace-nowrap"><span className="font-semibold text-slate-500">วันที่ใบรับของ: </span><span className="text-slate-900">{formatDateDisplay(selectedReceipt.documentDate)}</span></div>
                        <div className="min-w-0 whitespace-nowrap"><span className="font-semibold text-slate-500">ทะเบียนรถส่งของ: </span><span className="text-slate-900">{selectedReceipt.vehicleNo || '-'}</span></div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-red-600"><span className="font-bold">*</span> เลือกใบรับของแล้ว ระบบล็อกสาขา คลัง ผู้ขาย และใบรับของเพื่อกันข้อมูลไม่ตรงกัน{supplierSwapMode ? ' ยกเว้น Supplier ในโหมดเปลี่ยน Supplier' : ''}</div>
                          {editingBillId || supplierSwapMode ? null : <Button size="xs" type="button" variant="outline" onClick={clearSelectedStockReceipt}>ล้างใบรับของ</Button>}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="emerald">3</StepBadge>{form.transactionMode === 'STOCK' ? `รายการจากใบรับของ (${form.items.length})` : `รายการสินค้า (${form.items.length})`}</h4>
                  {form.transactionMode === 'TRADING' ? <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, blankItem()] }))}>+ เพิ่มรายการ</button> : null}
                </div>
                {fieldErrors.items ? <div className="mb-2 text-xs text-red-600">{fieldErrors.items}</div> : null}
                {form.transactionMode === 'STOCK' ? (
                  selectedReceipt ? (
                    <div className="space-y-3">
                      <div className="overflow-x-auto rounded-md border border-slate-200/60">
                      <table className="ns-table w-full min-w-[1180px] table-fixed text-sm">
                        <colgroup>
                          <col className="w-[170px]" />
                          <col className="w-[92px]" />
                          <col className="w-[56px]" />
                          <col className="w-[92px]" />
                          <col className="w-[116px]" />
                          <col className="w-[260px]" />
                          <col className="w-[112px]" />
                          <col className="w-[112px]" />
                          <col className="w-[118px]" />
                          <col className="w-[52px]" />
                        </colgroup>
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                          <tr>
                            <th className="p-2 text-left">สินค้า</th>
                            <th className="p-2 text-right">น้ำหนักรวม</th>
                            <th className="p-2 text-right">หัก</th>
                            <th className="p-2 text-right">น้ำหนักสุทธิ</th>
                            <th className="p-2 text-right">จำนวนตัดบิล</th>
                            <th className="p-2 text-left">อ้างอิง PO</th>
                            <th className="p-2 text-right">ราคา/กก.</th>
                            <th className="p-2 text-right">ราคาหน้าใบ</th>
                            <th className="p-2 text-right">ยอดรวม</th>
                            <th className="p-2 text-right"><span className="sr-only">จัดการ</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.items.map((item, index) => {
                            const summaryId = item.receiptSummaryId ?? item.receiptLineId ?? null
                            const sourceSummary = summaryId ? selectedReceipt.productSummaries.find((summary) => summary.id === summaryId) : null
                            const summaryState = summaryId ? stockSummaryDraft.get(summaryId) : null
                            const summaryVariance = sourceSummary ? summaryQtyVariance(sourceSummary.remainingWeight, summaryState?.allocatedQty ?? 0) : null
                            const isFirstRowOfSummary = summaryState ? summaryState.rowIndices[0] === index : true
                            const isLastRowOfSummary = summaryState ? summaryState.rowIndices[summaryState.rowIndices.length - 1] === index : false
                            const summaryUnallocatedQty = sourceSummary
                              ? Math.max(0, sourceSummary.remainingWeight - (summaryState?.allocatedQty ?? 0))
                              : 0
                            const itemPoOptions = supplierSwapMode ? [] : activePoBuys.filter((po) => {
                              if (po.product_id && po.product_id !== item.productId) return false
                              if (item.poBuyId === po.id) return true
                              return poAvailableForRow(po.id, index) > 0.0001
                            })
                            const selectedPo = poOptionForProduct(item.poBuyId, item.productId)
                            const rowSummaryCapacity = summaryAvailableForRow(summaryId, index)
                            const rowPoCapacity = item.poBuyId ? poAvailableForRow(item.poBuyId, index) : null
                            return (
                              <Fragment key={`${item.receiptSummaryId ?? item.receiptLineId ?? 'row'}-${index}`}>
                              <tr className={`${isFirstRowOfSummary ? 'border-t border-slate-200' : ''} align-top`}>
                                <td className="p-2">
                                  {isFirstRowOfSummary ? (
                                    <>
                                      <div className="font-medium text-slate-900">{sourceSummary?.productName ?? activeProducts.find((product) => product.id === item.productId)?.name ?? item.productId}</div>
                                      <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                                        <div>{selectedReceipt.documentNo}</div>
                                        {sourceSummary ? <div>รวม {sourceSummary.lineCount} เต๋า</div> : null}
                                      </div>
                                      {sourceSummary && summaryVariance ? (
                                        <div className={`mt-1 text-xs font-semibold ${summaryVariance.className}`}>
                                          {summaryVariance.text}
                                        </div>
                                      ) : null}
                                    </>
                                  ) : <span className="text-slate-300">-</span>}
                                </td>
                                <td className="p-2 text-right tabular-nums">
                                  <div className="flex flex-col items-end gap-1">
                                    {isFirstRowOfSummary ? <span>{formatMoney(sourceSummary?.grossWeight ?? item.grossWeight)}</span> : null}
                                  </div>
                                </td>
                                <td className="p-2 text-right tabular-nums text-slate-700">{isFirstRowOfSummary ? formatMoney(sourceSummary?.deductWeight ?? item.deductWeight) : ''}</td>
                                <td className="p-2 text-right tabular-nums text-slate-900">{isFirstRowOfSummary ? formatMoney(sourceSummary?.remainingWeight ?? sourceSummary?.netWeight ?? item.qty) : ''}</td>
                                <td className="p-2 text-right">
                                  <InlineDecimalInput
                                    disabled={Boolean(item.poBuyId) || supplierSwapMode}
                                    error={fieldErrors[`items.${index}.qty`]}
                                    errorKey={`items.${index}.qty`}
                                    inputClassName={item.poBuyId || supplierSwapMode ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}
                                    max={rowPoCapacity === null ? rowSummaryCapacity : Math.min(rowSummaryCapacity, rowPoCapacity)}
                                    value={item.qty}
                                    onChange={(value) => updateItem(index, 'qty', value)}
                                  />
                                </td>
                                <td className="p-2">
                                  {supplierSwapMode ? (
                                    <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs font-semibold text-amber-800">Spot Buy เท่านั้น</div>
                                  ) : (
                                    <select className="h-10 w-full rounded-md border bg-white px-2 py-2 text-sm" value={item.poBuyId ?? ''} onChange={(event) => updateItemPoBuy(index, event.target.value || null)}>
                                      <option value="">Spot Buy</option>
                                      {itemPoOptions.map((po) => <option key={`${po.id}-${po.product_id ?? 'all'}`} value={po.id}>{po.label ?? po.name}</option>)}
                                    </select>
                                  )}
                                  {(() => {
                                    if (!item.poBuyId) return null
                                    if (rowPoCapacity === null || rowPoCapacity === undefined) return null
                                    const variance = poQtyVariance(rowPoCapacity, item.qty)
                                    return <div className={`mt-1 text-xs font-semibold ${variance.className}`}>{variance.text}</div>
                                  })()}
                                </td>
                                <td className="p-2 text-right">
                                  <InlineMoneyInput
                                    disabled={Boolean(selectedPo)}
                                    error={fieldErrors[`items.${index}.price`]}
                                    errorKey={`items.${index}.price`}
                                    inputClassName={selectedPo ? 'bg-slate-100 text-slate-500' : ''}
                                    value={item.price}
                                    onChange={(value) => updateItem(index, 'price', value)}
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <InlineMoneyInput
                                    disabled={!salesPriceEditable}
                                    inputClassName={salesPriceEditable ? 'bg-white' : 'bg-slate-100 text-slate-500'}
                                    value={item.salesPrice}
                                    onChange={(value) => updateItem(index, 'salesPrice', value)}
                                  />
                                </td>
                                <td className="p-2 text-right">
                                  <div className="w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-right font-bold tabular-nums text-slate-900">{formatMoney(Math.max(0, item.qty * item.price))}</div>
                                </td>
                                <td className="p-2">
                                  <div className="flex justify-end gap-1">
                                    {!supplierSwapMode && summaryState && summaryState.rowIndices.length > 1 ? (
                                      <Button
                                        size="xs"
                                        type="button"
                                        variant="outline"
                                        onClick={() => removeStockAllocationRow(index)}
                                      >
                                        ลบ
                                      </Button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                              {isLastRowOfSummary ? (
                                <tr>
                                  <td />
                                  <td className="px-2 pb-2 pt-0 text-right">
                                    <Button
                                      disabled={supplierSwapMode || summaryUnallocatedQty <= 0.0001}
                                      size="xs"
                                      type="button"
                                      variant="outline"
                                      onClick={() => addStockAllocationRow(index)}
                                    >
                                      + เพิ่มแถว
                                    </Button>
                                  </td>
                                  <td colSpan={8} />
                                </tr>
                              ) : null}
                              </Fragment>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      เลือกใบรับของ WTI เพื่อดึงรายการสินค้าและน้ำหนักมาออกบิล
                    </div>
                  )
                ) : (
                  <div className="overflow-x-auto rounded-md border border-slate-200/60">
                    <table className="ns-table w-full min-w-[1040px] text-sm">
                      <colgroup>
                        <col className="w-[132px]" />
                        <col className="w-[132px]" />
                        <col className="w-[132px]" />
                        <col className="w-[160px]" />
                        <col className="w-[160px]" />
                        <col className="w-[170px]" />
                        <col className="w-[80px]" />
                      </colgroup>
                      <tbody>
                        {form.items.map((item, index) => (
                          <Fragment key={index}>
                            <tr className="border-t align-top hover:bg-slate-50">
                              <td className="p-2" colSpan={4}>
                                <ProductSearchCombobox error={fieldErrors[`items.${index}.productId`]} errorKey={`items.${index}.productId`} inputId={`purchase-bill-product-search-${index}`} options={activeProducts} value={item.productId} onChange={(value) => updateItem(index, 'productId', value)} />
                                <input className="mt-1.5 w-full rounded-md border bg-white px-2 py-1 text-xs" placeholder="ชื่อสำหรับโชว์ในบิล (ว่าง = ใช้ชื่อ Master)" value={item.displayName ?? ''} onChange={(event) => updateItem(index, 'displayName', event.target.value || null)} />
                              </td>
                              <td className="p-2" colSpan={2}>
                                <div className="mb-1 text-xs font-semibold text-slate-600">อ้างอิง PO</div>
                                <select className="w-full rounded-md border bg-white px-2 py-2 text-xs" value={item.poBuyId ?? ''} onChange={(event) => updateItemPoBuy(index, event.target.value || null)}>
                                  <option value="">Spot Buy</option>
                                  {activePoBuys
                                    .filter((po) => item.productId && (!po.product_id || po.product_id === item.productId))
                                    .map((po) => <option key={`${po.id}-${po.product_id ?? 'all'}`} value={po.id}>{po.label ?? po.name}</option>)}
                                </select>
                                {(() => {
                                  const remainingQty = poOptionForProduct(item.poBuyId, item.productId)?.remainingQty
                                  if (remainingQty === null || remainingQty === undefined) return null
                                  const variance = poQtyVariance(remainingQty, item.qty)
                                  return <div className={`mt-1 text-xs font-semibold ${variance.className}`}>{variance.text}</div>
                                })()}
                              </td>
                              <td className="w-[80px] p-2 text-center align-middle" rowSpan={2}><button className="rounded-md px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-40" disabled={form.items.length <= 1} type="button" onClick={() => removeItem(index)}>ลบ</button></td>
                            </tr>
                            <tr className="border-t border-slate-100 align-top hover:bg-slate-50">
                              <td className="w-[132px] p-2 text-right">
                                <div className="mb-1 text-xs font-semibold text-slate-500">น้ำหนักรวม</div>
                                <InlineDecimalInput
                                  error={fieldErrors[`items.${index}.grossWeight`]}
                                  errorKey={`items.${index}.grossWeight`}
                                  inputClassName="ml-auto !w-[12ch] font-normal"
                                  value={item.grossWeight}
                                  onChange={(value) => updateItemWeights(index, 'grossWeight', value)}
                                />
                              </td>
                              <td className="w-[132px] p-2 text-right">
                                <div className="mb-1 text-xs font-semibold text-slate-600">หัก</div>
                                <InlineDecimalInput
                                  error={fieldErrors[`items.${index}.deductWeight`]}
                                  errorKey={`items.${index}.deductWeight`}
                                  inputClassName="ml-auto !w-[12ch] font-normal"
                                  value={item.deductWeight}
                                  onChange={(value) => updateItemWeights(index, 'deductWeight', value)}
                                />
                              </td>
                              <td className="w-[132px] p-2 text-right">
                                <div className="mb-1 text-xs font-semibold text-slate-600">สุทธิ</div>
                                <InlineDecimalInput
                                  error={fieldErrors[`items.${index}.qty`]}
                                  errorKey={`items.${index}.qty`}
                                  inputClassName="ml-auto !w-[12ch]"
                                  value={item.qty}
                                  onChange={(value) => updateItem(index, 'qty', value)}
                                />
                              </td>
                              <td className="p-2">
                                <div className="mb-1 text-xs font-semibold text-slate-500">ราคา/กก.</div>
                                <InlineMoneyInput
                                  error={fieldErrors[`items.${index}.price`]}
                                  errorKey={`items.${index}.price`}
                                  value={item.price}
                                  onChange={(value) => updateItem(index, 'price', value)}
                                />
                              </td>
                              <td className="p-2">
                                <div className="mb-1 text-xs font-semibold text-slate-600">ราคาหน้าใบ</div>
                                <InlineMoneyInput
                                  disabled={!salesPriceEditable}
                                  inputClassName={salesPriceEditable ? 'bg-white' : 'bg-slate-100 text-slate-500'}
                                  value={item.salesPrice}
                                  onChange={(value) => updateItem(index, 'salesPrice', value)}
                                />
                              </td>
                              <td className="p-2">
                                <div className="mb-1 whitespace-nowrap text-xs font-semibold text-slate-600">ยอดรวม</div>
                                <div className="whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-2 text-right font-bold tabular-nums text-slate-900">{formatMoney(Math.max(0, item.qty * item.price))}</div>
                              </td>
                            </tr>
                          </Fragment>
                        ))}
                      </tbody>
                      <tfoot className="border-t bg-white font-bold">
                        <tr>
                          <td className="p-2 text-right tabular-nums"><span className="mr-2 text-slate-700">รวม</span>{formatMoney(form.items.reduce((sum, item) => sum + item.grossWeight, 0))}</td>
                          <td className="p-2 text-right tabular-nums text-slate-700">{formatMoney(form.items.reduce((sum, item) => sum + item.deductWeight, 0))}</td>
                          <td className="p-2 text-right tabular-nums text-slate-900">{formatMoney(formTotalWeight)}</td>
                          <td></td>
                          <td></td>
                          <td className="p-2 text-right tabular-nums text-slate-900">{formatMoney(formSubtotal)}</td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <h4 className="mb-2.5 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="purple">4</StepBadge>VAT & ยอดรวม</h4>
                {!stockReceiptSelected ? (
                  <div className="mb-4 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    เลือกใบรับของก่อน แล้วค่อยกรอกราคา VAT และบันทึกบิลรับซื้อ
                  </div>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <label className={`flex cursor-pointer items-center gap-3 rounded-md border-2 px-3 py-2.5 ${form.hasVat ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                      <input checked={form.hasVat} className="size-5" disabled={!stockReceiptSelected} type="checkbox" onChange={(event) => updateForm('hasVat', event.target.checked)} />
                      <span className="font-bold text-slate-700">มี {vatLabel}</span>
                    </label>
                    <MoneyInputField disabled={!stockReceiptSelected} error={fieldErrors.discountTotal} errorKey="discountTotal" label="ส่วนลดท้ายบิล (บาท)" value={form.discountTotal} onChange={(value) => updateForm('discountTotal', value)} />
                    <div className="pt-2">
                      <SearchCombobox
                        disabled={!advanceLookupSupplierId}
                        error={fieldErrors.advancePaymentId}
                        errorKey="advancePaymentId"
                        inputId="purchase-bill-advance-payment-search"
                        label="เอกสารจ่ายเงินล่วงหน้า/มัดจำ"
                        options={activeAdvancePayments.map((option) => ({
                          id: option.id,
                          label: option.label ?? option.name,
                          searchText: `${option.label ?? ''} ${option.name} ${option.id}`.toLowerCase(),
                        }))}
                        placeholder={advanceLookupSupplierId ? 'ค้นหาเลขที่เอกสาร ADV' : supplierSwapMode ? 'เลือก Supplier ใหม่ก่อน' : 'เลือกผู้ขายก่อน'}
                        value={form.advancePaymentId ?? ''}
                        onChange={(value) => updateForm('advancePaymentId', value || null)}
                      />
                    </div>
                    {advanceLookupSupplierId && activeAdvancePayments.length === 0 ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {matchingAdvancePayments.length === 0 ? (
                          <span>{supplierSwapMode ? 'ไม่พบ ADV ของ Supplier ใหม่และสาขานี้' : 'ไม่พบ ADV ของผู้ขายและสาขานี้'}</span>
                        ) : (
                          <div className="space-y-1">
                            <div>มี ADV ของผู้ขายนี้ แต่ยังไม่พร้อมใช้หักบิล ต้องอนุมัติและจ่ายเงินจริงให้เป็นสถานะพร้อมใช้ก่อน</div>
                            <div className="text-amber-700">
                              {inactiveAdvancePayments.slice(0, 3).map((option) => `${option.name} (${advancePaymentStatusLabel(option.status)})`).join(', ')}
                              {inactiveAdvancePayments.length > 3 ? ` และอีก ${inactiveAdvancePayments.length - 3} รายการ` : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}
                    {selectedAdvancePayment ? (
                      <div className="-mt-1.5 px-1 text-xs text-slate-600">เงินมัดจำเหลือหลังหัก: {formatMoney(formAdvanceRemainingAfterApply)} บาท</div>
                    ) : null}
                  </div>
                  <div className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <SummaryLine label="ยอดรวมรายการ" value={formatMoney(formSubtotal)} />
                    {form.discountTotal > 0 ? <SummaryLine label="หักส่วนลด" tone="red" value={`-${formatMoney(form.discountTotal)}`} /> : null}
                    {formAdvanceApplied > 0 ? <SummaryLine label="หัก ADV/มัดจำ" tone="red" value={`-${formatMoney(formAdvanceApplied)}`} /> : null}
                    {form.hasVat ? <SummaryLine label="ยอดสุทธิก่อน VAT" value={formatMoney(formTaxableBaseAfterAdvance)} /> : null}
                    {form.hasVat ? <SummaryLine label={`ยอด ${vatLabel}`} value={formatMoney(formVat)} /> : null}
                    <SummaryLine label="ยอดสุทธิรวม VAT" value={formatMoney(formTotal)} />
                    <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-lg font-bold"><span>ยอดสุทธิที่ต้องจ่าย</span><span className="tabular-nums text-slate-900">{formatMoney(formNetPayable)}</span></div>
                    <div className="mt-3 flex justify-between rounded-md border border-slate-200 bg-white p-2 text-sm font-bold text-slate-800"><span>น้ำหนักรวมที่ซื้อ</span><span className="tabular-nums">{formatMoney(formTotalWeight)} กก.</span></div>
                  </div>
                </div>
              </div>

              {selectedSupplier?.bankAccounts && selectedSupplier.bankAccounts.length > 0 ? (
                <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="blue">5</StepBadge>ข้อมูลการชำระเงิน</h4>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    <Field className="col-span-2 md:col-span-1" label="วิธีชำระเงิน">
                      <select
                        className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                        value={(() => {
                          const matched = selectedSupplier.bankAccounts?.find((account) => `${account.paymentMethod} บช.${account.accountNo}` === (form.note ?? ''))
                          return matched ? `${matched.paymentMethod} บช.${matched.accountNo}` : selectedSupplier.bankAccounts?.[0] ? `${selectedSupplier.bankAccounts[0].paymentMethod} บช.${selectedSupplier.bankAccounts[0].accountNo}` : ''
                        })()}
                        disabled={!stockReceiptSelected}
                        onChange={(event) => {
                          updateForm('note', event.target.value || null)
                          updateForm('notes', event.target.value || null)
                        }}
                      >
                        {selectedSupplier.bankAccounts.map((account) => (
                          <option key={account.code} value={`${account.paymentMethod} บช.${account.accountNo}`}>
                            {account.paymentMethod}{account.bankName ? ` · ${account.bankName}` : ''}{account.accountNo ? ` · ${account.accountNo}` : ''}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {(() => {
                      const current = selectedSupplier.bankAccounts.find((account) => `${account.paymentMethod} บช.${account.accountNo}` === (form.note ?? '')) ?? selectedSupplier.bankAccounts[0]
                      return (
                        <>
                          <Field label="ธนาคาร"><div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-800">{current?.bankName || '-'}</div></Field>
                          <Field label="เลขบัญชี"><div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-sm font-semibold tabular-nums text-slate-900">{current?.accountNo || '-'}</div></Field>
                          <Field label="ชื่อบัญชี"><div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-800 truncate">{current?.accountName || '-'}</div></Field>
                          <Field label="สาขา"><div className="flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-800">{current?.branchCode || '-'}</div></Field>
                        </>
                      )
                    })()}
                  </div>
                </div>
              ) : null}

              <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="purple">6</StepBadge>หมายเหตุ</h4>
                <Field error={fieldErrors.note ?? fieldErrors.notes} label="หมายเหตุ"><textarea data-error-key={fieldErrors.note ? 'note' : fieldErrors.notes ? 'notes' : undefined} className={`w-full rounded-md border px-3 py-2 ${(fieldErrors.note ?? fieldErrors.notes) ? 'border-red-400 bg-red-50 text-red-700' : ''}`} disabled={!stockReceiptSelected} rows={2} value={form.note ?? form.notes ?? ''} onChange={(event) => {
                  const value = event.target.value || null
                  updateForm('note', value)
                  updateForm('notes', value)
                }} /></Field>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showSalesForm && mode === 'sales' ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <div className="relative mx-auto my-4 flex max-h-[94vh] w-full max-w-[1480px] flex-col overflow-hidden rounded-md border-0 bg-slate-900 shadow-2xl outline-none focus:outline-none" data-combobox-portal-root="true">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-t-md border-b border-slate-800 bg-slate-900 px-6 py-4 text-white">
              <div className="min-w-0">
                <h3 className="text-xl font-bold">{editingSalesBillId ? `แก้ไขบิลขาย ${editingSalesBillId}` : 'สร้างบิลขายใหม่'}</h3>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button className="h-9 rounded-md border border-emerald-600 bg-emerald-600 px-5 text-sm font-normal text-white outline-none hover:border-emerald-700 hover:bg-emerald-700 focus:outline-none disabled:opacity-60" disabled={isSaving} type="button" onClick={() => void saveSalesBill()}>{isSaving ? 'กำลังบันทึก...' : editingSalesBillId ? 'บันทึกการแก้ไข' : 'บันทึก'}</button>
                <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white outline-none hover:border-rose-700 hover:bg-rose-700 focus:outline-none disabled:opacity-60" disabled={isSaving} type="button" onClick={() => { setError(null); setLockedPoSellOptions([]); setShowSalesForm(false) }}>ยกเลิก</button>
              </div>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-6 text-sm">
              {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="emerald">1</StepBadge>ประเภทบิล</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <RadioCard active={salesForm.transactionMode === 'STOCK'} disabled={salesIdentityLocked || stockDeliveryLocked} label="📦 สต็อก" note="ขายจากสต็อกจริง" onClick={() => updateSalesForm('transactionMode', 'STOCK')} />
                  <RadioCard active={salesForm.transactionMode === 'TRADING'} disabled={salesIdentityLocked || stockDeliveryLocked} label="🔄 ซื้อมาขายไป" note="ขายจากบิลซื้อแบบซื้อมาขายไป และพ่วง WTO ได้" onClick={() => updateSalesForm('transactionMode', 'TRADING')} />
                </div>
                {salesIdentityLocked ? (
                  <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">โหมดแก้ไขจะคงประเภทบิล สาขา ลูกค้า และแหล่งที่มาเดิม เพื่อให้ข้อมูล Stock/Trading และ audit ต่อเนื่อง</div>
                ) : null}
                {salesForm.transactionMode === 'TRADING' ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-600">รายการจากบิลซื้อ Trading จะเข้า Trading Matching และไม่ตัด Stock; ถ้าเลือก WTO พ่วง รายการจาก WTO จะตัด Stock ตาม flow บิลขาย Stock ในบิลเดียวกัน</div>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="blue">2</StepBadge>ข้อมูลบิล</h4>
                <div className={`grid gap-3 ${isExportSalesBill ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
                  <BranchSelectCombobox branches={activeBranches} disabled={salesIdentityLocked || stockDeliveryLocked} error={salesFieldErrors.branchId} errorKey="branchId" inputId="sales-bill-branch-search" label="สาขา/คลัง *" placeholder="เลือกสาขา/คลัง" value={salesForm.branchId} onChange={(branchId) => updateSalesForm('branchId', branchId ?? '')} />
                  <CustomerSearchCombobox className="md:col-span-2" disabled={salesIdentityLocked || customerLockedByDelivery || !salesForm.branchId} error={salesFieldErrors.customerId} errorKey="customerId" options={activeCustomers} placeholder={salesForm.branchId ? 'ค้นหารหัสหรือชื่อลูกค้า' : 'เลือกสาขา/คลังก่อน'} value={salesForm.customerId} onChange={(value) => updateSalesForm('customerId', value)} />
                  <Field className="block" error={salesFieldErrors.channelId} label="ช่องทางขาย *">
                    <Input
                      data-error-key="channelId"
                      readOnly
                      className={salesFieldErrors.channelId ? 'border-red-400 bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'}
                      value={selectedSalesChannelLabel}
                    />
                  </Field>
                  {isExportSalesBill ? (
                    <InputField
                      error={salesFieldErrors.exportOrderNo}
                      errorKey="exportOrderNo"
                      label="เลขที่ order ส่งออก *"
                      value={salesForm.exportOrderNo ?? ''}
                      onChange={(value) => updateSalesForm('exportOrderNo', value || null)}
                    />
                  ) : null}
                </div>
                {salesForm.transactionMode === 'TRADING' ? (
                  <div className="mt-3 max-w-sm">
                    <InputField
                      error={salesFieldErrors.licensePlate}
                      errorKey="licensePlate"
                      label="เลขทะเบียนรถ"
                      value={salesForm.licensePlate ?? ''}
                      onChange={(value) => updateSalesForm('licensePlate', value)}
                    />
                  </div>
                ) : null}
                {salesForm.transactionMode === 'STOCK' ? (
                  <div className="mt-4">
                  <SearchCombobox
                    disabled={salesIdentityLocked || stockDeliveryLocked || !stockDeliveryPrerequisiteReady}
                    error={salesFieldErrors.deliveryTicketId}
                    errorKey="deliveryTicketId"
                    inputId="sales-bill-delivery-search"
                    label="ใบส่งของ WTO *"
                    options={deliveryOptionsForSelect.map((delivery) => ({
                      description: `${delivery.partyName} · ${delivery.documentDate} · ${delivery.productSummaries.length} รายการ`,
                      id: delivery.id,
                      label: delivery.documentNo,
                      searchText: `${delivery.documentNo} ${delivery.partyName} ${delivery.vehicleNo} ${delivery.branchName}`.toLowerCase(),
                    }))}
		                    placeholder={stockDeliveryPrerequisiteReady ? 'ค้นหาเลขที่ใบส่งของ' : 'เลือกสาขาและลูกค้าก่อน'}
                    value={salesForm.deliveryTicketId ?? ''}
                    onChange={(value) => updateSalesForm('deliveryTicketId', value || null)}
                  />
                  {selectedDelivery ? (
                    <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs md:grid-cols-4">
                      <div><div className="font-semibold text-slate-500">เลขที่ใบส่งของ</div><div className="text-slate-900">{selectedDelivery.documentNo}</div></div>
                      <div><div className="font-semibold text-slate-500">ลูกค้า</div><div className="text-slate-900">{selectedDelivery.partyName}</div></div>
                      <div><div className="font-semibold text-slate-500">สาขา</div><div className="text-slate-900">{selectedDelivery.branchName}</div></div>
                      <div><div className="font-semibold text-slate-500">วันที่</div><div className="text-slate-900">{formatDateDisplay(selectedDelivery.documentDate)}</div></div>
                    </div>
                  ) : null}
                </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="emerald">3</StepBadge>{salesForm.transactionMode === 'STOCK' ? `รายการจากใบส่งของ (${selectedDelivery ? salesForm.items.length : 0})` : `แหล่งสินค้าและรายการ (${salesForm.items.length})`}</h4>
                </div>
                {salesFieldErrors.items ? <div className="mb-2 text-xs text-red-600">{salesFieldErrors.items}</div> : null}
                {salesForm.transactionMode === 'TRADING' ? (
                  <div className="mb-4 space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 text-xs font-bold text-slate-700">เลือกบิลซื้อ Trading</div>
                      {activeTradingPurchaseBills.length > 0 ? (
                        <div className="space-y-3">
                          <div className="space-y-2">
                            {tradingPurchaseSelectorIds.map((sourceId, selectorIndex) => {
                              const sourceOptions = activeTradingPurchaseBills.filter((source) => source.id === sourceId || !selectedTradingPurchaseSourceIds.has(source.id))
                              return (
                                <div key={`trading-purchase-selector-${selectorIndex}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
	                                  <SearchCombobox
	                                    disabled={salesIdentityLocked}
	                                    hideSelectedOptionFromList
	                                    inputClassName="h-9 text-sm"
                                    inputId={`sales-bill-trading-purchase-source-search-${selectorIndex}`}
                                    label={`บิลซื้อ Trading ${selectorIndex + 1}`}
                                    options={sourceOptions.map((source) => ({
                                      description: `${source.supplierName ?? '-'} · ${source.lineCount.toLocaleString('th-TH')} รายการ`,
                                      id: source.id,
                                      label: source.label,
                                      searchText: source.searchText,
                                    }))}
                                    placeholder={sourceOptions.length > 0 ? 'ค้นหาเลขที่บิลซื้อ / Supplier' : 'เลือกครบทุกบิลซื้อที่เปิดอยู่แล้ว'}
                                    value={sourceId}
                                    onChange={(nextSourceId) => updateTradingPurchaseSelector(selectorIndex, nextSourceId)}
                                  />
	                                  <Button
	                                    className="h-9 px-3 text-xs font-normal"
	                                    disabled={salesIdentityLocked || (tradingPurchaseSelectorIds.length <= 1 && !sourceId)}
                                    type="button"
                                    variant="ghost"
                                    onClick={() => removeTradingPurchaseSelector(selectorIndex)}
                                  >
                                    ลบ
                                  </Button>
                                </div>
                              )
                            })}
	                            <Button className="h-9 gap-2 px-3 text-xs font-normal" disabled={salesIdentityLocked || availableTradingPurchaseSources.length === 0} type="button" variant="outline" onClick={addTradingPurchaseSelector}>
                              <Plus className="size-4" />
                              เพิ่มบิลซื้อ
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-500">ไม่พบบิลซื้อ Trading ที่ยังมียอดคงเหลือ</div>
                      )}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="mb-2 text-xs font-bold text-slate-700">ใบส่งของ WTO พ่วงในบิล</div>
                      <SearchCombobox
	                        disabled={salesIdentityLocked || !stockDeliveryPrerequisiteReady}
                        error={salesFieldErrors.deliveryTicketId}
                        errorKey="deliveryTicketId"
                        inputId="sales-bill-trading-delivery-search"
                        label="ใบส่งของ WTO"
                        options={deliveryOptionsForSelect.map((delivery) => ({
                          description: `${delivery.partyName} · ${delivery.documentDate} · ${delivery.productSummaries.length} รายการ`,
                          id: delivery.id,
                          label: delivery.documentNo,
                          searchText: `${delivery.documentNo} ${delivery.partyName} ${delivery.vehicleNo} ${delivery.branchName}`.toLowerCase(),
                        }))}
                        placeholder={stockDeliveryPrerequisiteReady ? 'เลือก WTO ถ้าต้องพ่วงรายการจาก Stock' : 'เลือกสาขาและลูกค้าก่อน'}
                        value={salesForm.deliveryTicketId ?? ''}
                        onChange={(value) => updateSalesForm('deliveryTicketId', value || null)}
                      />
                      {selectedDelivery ? (
                        <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs md:grid-cols-4">
                          <div><div className="font-semibold text-slate-500">เลขที่ใบส่งของ</div><div className="text-slate-900">{selectedDelivery.documentNo}</div></div>
                          <div><div className="font-semibold text-slate-500">ลูกค้า</div><div className="text-slate-900">{selectedDelivery.partyName}</div></div>
                          <div><div className="font-semibold text-slate-500">สาขา</div><div className="text-slate-900">{selectedDelivery.branchName}</div></div>
                          <div><div className="font-semibold text-slate-500">วันที่</div><div className="text-slate-900">{formatDateDisplay(selectedDelivery.documentDate)}</div></div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
	                {salesForm.transactionMode === 'STOCK' ? (
	                  selectedDelivery ? (
	                    <div className="space-y-3">
	                      {salesStockAllocationIssues.length > 0 ? (
	                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs">
	                          {salesStockAllocationIssues.map((issue) => (
	                            <div key={issue.summaryId} className={issue.className}>{issue.message}</div>
	                          ))}
	                        </div>
	                      ) : null}
	                      <div className="overflow-x-auto rounded-md border border-slate-200/60">
	                      <table className="ns-table w-full min-w-[1300px] text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                          <tr>
                            <th className="p-2 text-left">สินค้า</th>
                            <th className="p-2 text-right">น้ำหนักสุทธิที่ส่ง</th>
                            <th className="p-2 text-right">จำนวนที่ขายได้</th>
                            <th className="p-2 text-right">หักสิ่งเจือปน</th>
                            <th className="p-2 text-right">น้ำหนักขายสุทธิ</th>
                            <th className="w-[260px] p-2 text-left">อ้างอิง</th>
	                            <th className="p-2 text-right">ราคาต้นทุนเฉลี่ย</th>
	                            <th className="p-2 text-right">ราคาขาย/หน่วย</th>
	                            <th className="p-2 text-right">ส่วนลด</th>
	                            <th className="p-2 text-right">ยอดรวม</th>
	                            <th className="p-2 text-right">จัดการ</th>
	                          </tr>
	                        </thead>
	                        <tbody>
	                          {salesForm.items.map((item, index) => {
	                            const summaryId = item.deliverySummaryId ?? item.deliveryLineId ?? null
	                            const sourceSummary = summaryId ? selectedDelivery.productSummaries.find((summary) => summary.id === summaryId) : null
	                            const summaryState = summaryId ? salesStockSummaryDraft.get(summaryId) : null
	                            const summaryVariance = sourceSummary ? salesStockQtyVariance(sourceSummary.remainingWeight, summaryState?.allocatedQty ?? 0) : null
	                            const isFirstRowOfSummary = summaryState ? summaryState.rowIndices[0] === index : true
	                            const isLastRowOfSummary = summaryState ? summaryState.rowIndices[summaryState.rowIndices.length - 1] === index : false
	                            const summaryUnallocatedQty = sourceSummary
	                              ? Math.max(0, sourceSummary.remainingWeight - (summaryState?.allocatedQty ?? 0))
	                              : 0
	                            const productName = activeProducts.find((product) => product.id === item.productId)?.name ?? item.productId
	                            const itemPoSellOptions = activePoSells.filter((po) => {
	                              if (po.product_id && po.product_id !== item.productId) return false
	                              if (item.poSellId === po.id) return true
	                              return poSellAvailableForRow(po.id, index) > 0.0001
	                            })
	                            const selectedPoSell = poSellOptionForProduct(item.poSellId, item.productId)
	                            const hasSelectedPoSell = Boolean(item.poSellId && selectedPoSell)
	                            const selectedPoSellDetail = hasSelectedPoSell ? poSellDetailText(selectedPoSell, index) : null
	                            const poSellVariance = hasSelectedPoSell ? poSellVarianceForRow(item.poSellId, index) : null
	                            const rowKey = `${item.deliverySummaryId ?? item.deliveryLineId ?? item.productId}-${index}`
	                            return (
	                              <Fragment key={rowKey}>
	                              <tr className={`${isFirstRowOfSummary ? 'border-t border-slate-200' : ''} align-top hover:bg-slate-50`}>
	                                <td className="p-2" colSpan={isFirstRowOfSummary ? undefined : 2}>
	                                  {isFirstRowOfSummary ? (
	                                    <>
	                                      <div className="font-medium text-slate-900">{sourceSummary?.productName ?? productName}</div>
	                                      <div className="mt-1 text-xs text-slate-500">{sourceSummary?.productId ?? item.productId}</div>
	                                      {sourceSummary ? <div className="mt-1 text-xs text-slate-500">รวม {sourceSummary.lineCount} เต๋า</div> : null}
	                                    </>
	                                  ) : (
                                      <div className="min-w-[360px]">
                                        <ProductSearchCombobox
                                          error={salesFieldErrors[`items.${index}.productId`]}
                                          errorKey={`items.${index}.productId`}
                                          hideLabel
                                          inputId={`sales-bill-split-product-search-${index}`}
                                          options={activeProducts}
                                          value={item.productId}
                                          onChange={(value) => updateSalesSplitProduct(index, value)}
                                        />
                                      </div>
                                    )}
	                                </td>
	                                {isFirstRowOfSummary ? (
	                                  <td className="p-2 text-right tabular-nums text-slate-900">
	                                    <div>{formatMoney(sourceSummary?.remainingWeight ?? item.netWeight ?? item.qty)}</div>
	                                    {sourceSummary && summaryVariance ? (
	                                      <div className={`ml-auto mt-1 max-w-24 whitespace-normal text-right text-xs font-semibold leading-snug [overflow-wrap:anywhere] ${summaryVariance.className}`}>
	                                        {summaryVariance.text}
	                                      </div>
	                                    ) : null}
	                                  </td>
	                                ) : null}
	                                <td className="p-2">
	                                  <div className="ml-auto w-17">
	                                    <input data-error-key={`items.${index}.netWeight`} className={`w-full rounded-md border bg-white px-2 py-2 text-right font-bold tabular-nums text-slate-900 ${salesFieldErrors[`items.${index}.netWeight`] || salesFieldErrors[`items.${index}.qty`] ? 'border-red-400 bg-red-50 text-red-700' : ''} ${numberInputClass}`} min="0" step="0.01" type="number" value={item.netWeight || ''} onChange={(event) => updateSalesStockSaleWeight(index, 'netWeight', Number(event.target.value || 0))} />
	                                  </div>
	                                  {salesFieldErrors[`items.${index}.netWeight`] ? <div className="mt-1 text-xs text-red-600">{salesFieldErrors[`items.${index}.netWeight`]}</div> : null}
	                                  {salesFieldErrors[`items.${index}.qty`] ? <div className="mt-1 text-xs text-red-600">{salesFieldErrors[`items.${index}.qty`]}</div> : null}
	                                </td>
	                                <td className="p-2">
	                                  <div className="ml-auto w-17">
	                                    <input data-error-key={`items.${index}.deductWeight`} className={`w-full rounded-md border bg-white px-2 py-2 text-right font-bold tabular-nums text-slate-900 ${salesFieldErrors[`items.${index}.deductWeight`] ? 'border-red-400 bg-red-50 text-red-700' : ''} ${numberInputClass}`} min="0" step="0.01" type="number" value={item.deductWeight || ''} onChange={(event) => updateSalesStockSaleWeight(index, 'deductWeight', Number(event.target.value || 0))} />
	                                  </div>
	                                  {salesFieldErrors[`items.${index}.deductWeight`] ? <div className="mt-1 text-xs text-red-600">{salesFieldErrors[`items.${index}.deductWeight`]}</div> : null}
	                                </td>
	                                <td className="p-2">
	                                  <div data-error-key={`items.${index}.qty`} className={`rounded-xl border px-2 py-2 text-right font-bold tabular-nums ${salesFieldErrors[`items.${index}.qty`] ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-900'}`}>{formatMoney(item.qty)}</div>
	                                </td>
                                <td className="p-2">
                                  <select className="h-10 w-2/3 rounded-md border bg-white px-2 text-xs" value={hasSelectedPoSell ? item.poSellId ?? '' : ''} onChange={(event) => updateSalesItemPoSell(index, event.target.value || null)}>
                                    <option value="">Spot Sale</option>
                                    {hasSelectedPoSell && selectedPoSell ? <option hidden value={item.poSellId ?? ''}>{selectedPoSell.name || selectedPoSell.id}</option> : null}
                                    {itemPoSellOptions.map((po) => <option key={`${po.id}-${po.line_id ?? po.product_id ?? 'all'}`} value={po.id}>{po.label ?? po.name}</option>)}
                                  </select>
                                  {selectedPoSellDetail ? <div className="mt-1 max-w-[260px] text-xs font-semibold leading-snug text-slate-600">{selectedPoSellDetail}</div> : null}
                                  {poSellVariance ? <div className={`mt-1 text-xs font-semibold ${poSellVariance.className}`}>{poSellVariance.text}</div> : null}
                                </td>
                                <td className="p-2">
                                  <div className="flex h-10 items-center justify-end rounded-md border border-slate-200 bg-slate-50 px-2 text-right font-semibold tabular-nums text-slate-700">
                                    {sourceSummary?.unitCostSnapshot == null ? '-' : formatMoney(sourceSummary.unitCostSnapshot)}
                                  </div>
                                </td>
                                <td className="p-2">
                                  <InlineMoneyInput
                                    disabled={hasSelectedPoSell}
                                    error={salesFieldErrors[`items.${index}.price`]}
                                    errorKey={`items.${index}.price`}
                                    inputClassName="ml-auto w-20"
                                    value={item.price}
                                    onChange={(value) => updateSalesItem(index, 'price', value)}
                                  />
                                </td>
                                <td className="p-2">
                                  <InlineMoneyInput
                                    error={salesFieldErrors[`items.${index}.discount`]}
                                    errorKey={`items.${index}.discount`}
                                    inputClassName="ml-auto w-14"
                                    value={item.discount}
                                    onChange={(value) => updateSalesItem(index, 'discount', value)}
                                  />
                                </td>
	                                <td className="p-2">
	                                  <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-right font-bold tabular-nums text-slate-900">{formatMoney(Math.max(0, item.qty * item.price - item.discount))}</div>
	                                </td>
	                                <td className="p-2">
	                                  <div className="flex justify-end gap-1">
	                                    <Button disabled={!summaryState || summaryState.rowIndices.length <= 1} size="xs" type="button" variant="outline" onClick={() => removeSalesStockAllocationRow(index)}>
	                                      ลบ
	                                    </Button>
	                                  </div>
	                                </td>
	                              </tr>
	                              {isLastRowOfSummary ? (
	                                <tr className="border-t border-dashed border-slate-100">
	                                  <td className="p-2"></td>
	                                  <td className="p-2 text-right">
	                                    <Button disabled={summaryUnallocatedQty <= 0.0001} size="xs" type="button" variant="outline" onClick={() => addSalesStockAllocationRow(index)}>
	                                      + เพิ่มแถว
	                                    </Button>
	                                  </td>
	                                  <td colSpan={9}></td>
	                                </tr>
	                              ) : null}
	                              </Fragment>
	                            )
	                          })}
                        </tbody>
                        <tfoot className="border-t bg-white font-bold">
                          <tr>
                            <td className="p-2 text-right text-slate-700">รวม</td>
	                            <td className="p-2 text-right tabular-nums text-slate-900">{formatMoney((selectedDelivery?.productSummaries ?? []).reduce((sum, summary) => sum + summary.remainingWeight, 0))}</td>
	                            <td className="p-2 text-right tabular-nums">{formatMoney(salesForm.items.reduce((sum, item) => sum + item.netWeight, 0))}</td>
	                            <td className="p-2 text-right tabular-nums text-slate-700">{formatMoney(salesForm.items.reduce((sum, item) => sum + item.deductWeight, 0))}</td>
	                            <td className="p-2 text-right tabular-nums text-slate-900">{formatMoney(salesForm.items.reduce((sum, item) => sum + item.qty, 0))}</td>
	                            <td></td>
	                            <td></td>
	                            <td></td>
	                            <td></td>
	                            <td className="p-2 text-right tabular-nums text-slate-900">{formatMoney(salesSubtotal)}</td>
	                            <td></td>
	                          </tr>
	                        </tfoot>
	                      </table>
	                      </div>
	                    </div>
	                  ) : (
                    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                      เลือกใบส่งของ WTO เพื่อดึงรายการสินค้าและน้ำหนักมาออกบิล
                    </div>
                  )
                ) : salesForm.items.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    เลือกบิลซื้อ Trading หรือใบส่งของ WTO เพื่อดึงรายการสินค้าและน้ำหนักมาออกบิล
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-slate-200/60">
                    <table className="ns-table w-full min-w-[1360px] text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium text-xs">
                        <tr>
                          <th className="p-2 text-left">สินค้า</th>
                          <th className="p-2 text-left">แหล่งสินค้า</th>
                          <th className="p-2 text-left">อ้างอิง</th>
                          <th className="p-2 text-right">ราคาต้นทุนเฉลี่ย</th>
                          <th className="p-2 text-right">น้ำหนักที่ขาย</th>
                          <th className="p-2 text-right">หัก</th>
                          <th className="p-2 text-right">น้ำหนักสุทธิขาย</th>
                          <th className="p-2 text-right">ราคาขาย/หน่วย</th>
                          <th className="p-2 text-right">ยอดรายการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {salesForm.items.map((item, index) => {
                          const isWtoLine = Boolean(item.deliveryTicketId)
                          const wtoSummaryId = item.deliverySummaryId ?? item.deliveryLineId ?? null
                          const wtoSourceSummary = isWtoLine && wtoSummaryId
                            ? selectedDelivery?.productSummaries.find((summary) => summary.id === wtoSummaryId) ?? null
                            : null
                          const itemPoSellOptions = activePoSells.filter((po) => {
                            if (po.product_id && po.product_id !== item.productId) return false
                            if (item.poSellId === po.id) return true
                            return poSellAvailableForRow(po.id, index) > 0.0001
                          })
                          const selectedPoSell = poSellOptionForProduct(item.poSellId, item.productId)
                          const hasSelectedPoSell = Boolean(item.poSellId && selectedPoSell)
                          const selectedPoSellDetail = hasSelectedPoSell ? poSellDetailText(selectedPoSell, index) : null
                          const poSellVariance = hasSelectedPoSell ? poSellVarianceForRow(item.poSellId, index) : null
                          const selectedTradingCostSource = tradingCostSourceOptionForProduct(item.tradingCostSourceId, item.productId)
                          const rowCostSourceCapacity = item.tradingCostSourceId ? tradingCostSourceAvailableForRow(item.tradingCostSourceId, index) : null
                          const costSourceVariance = !isWtoLine && rowCostSourceCapacity != null ? poQtyVariance(rowCostSourceCapacity, item.qty) : null
                          const productName = activeProducts.find((product) => product.id === item.productId)?.name ?? item.productId
                          const sourceLabel = isWtoLine
                            ? item.deliveryTicketDocNo ?? item.deliveryTicketId ?? 'WTO'
                            : selectedTradingCostSource?.name ?? item.tradingCostSourceId ?? 'PB Trading'
                          const tradingSourceWeightLabel = !isWtoLine && selectedTradingCostSource?.remainingQty != null
                            ? `น้ำหนักบิลซื้อ ${formatMoney(selectedTradingCostSource.remainingQty)}${selectedTradingCostSource.unit ? ` ${selectedTradingCostSource.unit}` : ''}`
                            : null
                          const previousItem = salesForm.items[index - 1] ?? null
                          const isSameSourceProductGroup = previousItem
                            ? previousItem.productId === item.productId && salesItemSourceGroupKey(previousItem) === salesItemSourceGroupKey(item)
                            : false
                          return (
                            <tr key={index} className={`${isSameSourceProductGroup ? '' : 'border-t'} align-top hover:bg-slate-50`}>
                              <td className="p-2">
                                {isSameSourceProductGroup ? <span className="sr-only">{productName}</span> : (
                                  <>
                                    <div className="font-medium text-slate-900">{productName}</div>
                                    <div className="mt-1 text-xs text-slate-500">{item.productId}</div>
                                  </>
                                )}
                              </td>
                              <td className="p-2">
                                <div className="flex h-10 items-center justify-end rounded-md border border-slate-200 bg-slate-50 px-2 text-right font-semibold tabular-nums text-slate-700">
                                  {wtoSourceSummary?.unitCostSnapshot == null ? '-' : formatMoney(wtoSourceSummary.unitCostSnapshot)}
                                </div>
                              </td>
                              <td className="p-2">
                                {isSameSourceProductGroup ? <span className="sr-only">{sourceLabel}</span> : (
                                  <>
                                    <div className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                                      {isWtoLine ? 'WTO / Stock' : 'บิลซื้อ Trading'}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">{sourceLabel}</div>
                                    {tradingSourceWeightLabel ? <div className="mt-1 text-xs font-semibold text-slate-700">{tradingSourceWeightLabel}</div> : null}
                                    {!isWtoLine && selectedTradingCostSource ? <div className="mt-1 text-xs text-slate-500">{selectedTradingCostSource.supplier_name ?? ''}</div> : null}
                                  </>
                                )}
                              </td>
                              <td className="p-2">
                                <select className="h-10 w-full rounded-md border bg-white px-2 text-xs" value={hasSelectedPoSell ? item.poSellId ?? '' : ''} onChange={(event) => updateSalesItemPoSell(index, event.target.value || null)}>
                                  <option value="">Spot Sale</option>
                                  {hasSelectedPoSell && selectedPoSell ? <option hidden value={item.poSellId ?? ''}>{selectedPoSell.name || selectedPoSell.id}</option> : null}
                                  {itemPoSellOptions.map((po) => <option key={`${po.id}-${po.line_id ?? po.product_id ?? 'all'}`} value={po.id}>{po.label ?? po.name}</option>)}
                                </select>
                                {selectedPoSellDetail ? <div className="mt-1 text-xs font-semibold leading-snug text-slate-600">{selectedPoSellDetail}</div> : null}
                                {poSellVariance ? <div className={`mt-1 text-xs font-semibold ${poSellVariance.className}`}>{poSellVariance.text}</div> : null}
                              </td>
                              <td className="p-2">
                                <div className="flex h-10 items-center justify-end rounded-md border border-slate-200 bg-slate-50 px-2 text-right font-semibold tabular-nums text-slate-700">
                                  {wtoSourceSummary?.unitCostSnapshot == null ? '-' : formatMoney(wtoSourceSummary.unitCostSnapshot)}
                                </div>
                              </td>
                              <td className="p-2">
                                <div className="ml-auto w-17">
                                  <input data-error-key={`items.${index}.grossWeight`} className={`w-full rounded-md border bg-white px-2 py-2 text-right font-bold tabular-nums text-slate-900 ${salesFieldErrors[`items.${index}.grossWeight`] ? 'border-red-400 bg-red-50 text-red-700' : ''} ${numberInputClass}`} min="0" step="0.01" type="number" value={item.grossWeight || ''} onChange={(event) => updateSalesItemWeights(index, 'grossWeight', Number(event.target.value || 0))} />
                                </div>
                                {salesFieldErrors[`items.${index}.grossWeight`] ? <div className="mt-1 text-xs text-red-600">{salesFieldErrors[`items.${index}.grossWeight`]}</div> : null}
                              </td>
                              <td className="p-2">
                                <div className="ml-auto w-17">
                                  <input data-error-key={`items.${index}.deductWeight`} className={`w-full rounded-md border bg-white px-2 py-2 text-right font-bold tabular-nums text-slate-900 ${salesFieldErrors[`items.${index}.deductWeight`] ? 'border-red-400 bg-red-50 text-red-700' : ''} ${numberInputClass}`} min="0" step="0.01" type="number" value={item.deductWeight || ''} onChange={(event) => updateSalesItemWeights(index, 'deductWeight', Number(event.target.value || 0))} />
                                </div>
                                {salesFieldErrors[`items.${index}.deductWeight`] ? <div className="mt-1 text-xs text-red-600">{salesFieldErrors[`items.${index}.deductWeight`]}</div> : null}
                              </td>
                              <td className="p-2">
                                <div data-error-key={`items.${index}.qty`} className={`rounded-xl border px-2 py-2 text-right font-bold tabular-nums ${salesFieldErrors[`items.${index}.qty`] ? 'border-red-400 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-900'}`}>{formatMoney(item.qty)}</div>
                                {salesFieldErrors[`items.${index}.qty`] ? <div className="mt-1 text-xs text-red-600">{salesFieldErrors[`items.${index}.qty`]}</div> : null}
                                {costSourceVariance ? <div className={`mt-1 text-xs font-semibold ${costSourceVariance.className}`}>{costSourceVariance.text}</div> : null}
                              </td>
                              <td className="p-2">
                                <InlineMoneyInput
                                  disabled={hasSelectedPoSell}
                                  error={salesFieldErrors[`items.${index}.price`]}
                                  errorKey={`items.${index}.price`}
                                  value={item.price}
                                  onChange={(value) => updateSalesItem(index, 'price', value)}
                                />
                              </td>
                              <td className="p-2">
                                <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-right font-bold tabular-nums text-slate-900">{formatMoney(Math.max(0, item.qty * item.price))}</div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="border-t bg-white font-bold">
                        <tr>
                          <td className="p-2 text-right text-slate-700" colSpan={4}>รวม</td>
                          <td className="p-2 text-right tabular-nums text-slate-700">{formatMoney(salesForm.items.reduce((sum, item) => sum + item.grossWeight, 0))}</td>
                          <td className="p-2 text-right tabular-nums text-slate-700">{formatMoney(salesForm.items.reduce((sum, item) => sum + item.deductWeight, 0))}</td>
                          <td className="p-2 text-right tabular-nums text-slate-900">{formatMoney(salesForm.items.reduce((sum, item) => sum + item.qty, 0))}</td>
                          <td></td>
                          <td className="p-2 text-right tabular-nums text-slate-900">{formatMoney(salesSubtotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="purple">4</StepBadge>VAT & ยอดรวม</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-3 ${salesForm.hasVat ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                      <input checked={salesForm.hasVat} className="size-5" type="checkbox" onChange={(event) => updateSalesForm('hasVat', event.target.checked)} />
                      <span className="font-bold text-slate-700">มี {vatLabel}</span>
                    </label>
                    <SearchCombobox
                      disabled={!salesForm.customerId}
                      error={salesFieldErrors.customerAdvanceId}
                      errorKey="customerAdvanceId"
                      inputId="sales-bill-customer-advance-search"
                      label="รับเงินล่วงหน้า/มัดจำ Customer"
                      options={activeCustomerAdvancePayments.map((option) => ({
                        description: `${option.name} · คงเหลือ ${formatMoney(option.remainingAmount ?? 0)} บาท`,
                        id: option.id,
                        label: option.label ?? option.name,
                        searchText: `${option.label ?? ''} ${option.name} ${option.id}`.toLowerCase(),
                      }))}
                      placeholder={salesForm.customerId ? 'ค้นหาเอกสารรับเงินล่วงหน้า' : 'เลือกลูกค้าก่อน'}
                      value={salesForm.customerAdvanceId ?? ''}
                      onChange={(value) => updateSalesForm('customerAdvanceId', value || null)}
                    />
                    {salesForm.customerId && activeCustomerAdvancePayments.length === 0 ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        ไม่พบเอกสารรับเงินล่วงหน้าของลูกค้านี้ที่มียอดคงเหลือพร้อมใช้
                      </div>
                    ) : null}
                    {selectedCustomerAdvancePayment ? (
                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                        <div>เอกสาร: {selectedCustomerAdvancePayment.name}</div>
                        <div>ยอดคงเหลือที่ใช้ได้: {formatMoney(selectedCustomerAdvancePayment.remainingAmount ?? 0)} บาท</div>
                      </div>
                    ) : null}
                    <MoneyInputField error={salesFieldErrors.discountTotal} errorKey="discountTotal" label="ส่วนลดท้ายบิล (บาท)" value={salesForm.discountTotal} onChange={(value) => updateSalesForm('discountTotal', value)} />
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex justify-between rounded-xl border border-slate-200 bg-white p-2 font-bold text-slate-800"><span>น้ำหนักรวมที่ขาย</span><span className="tabular-nums">{formatMoney(salesForm.items.reduce((sum, item) => sum + item.qty, 0))} กก.</span></div>
                    <SummaryLine label="ยอดรวมรายการ" value={formatMoney(salesSubtotal)} />
                    {salesForm.discountTotal > 0 ? <SummaryLine label="หักส่วนลด" tone="red" value={`-${formatMoney(salesForm.discountTotal)}`} /> : null}
                    <SummaryLine label="หลังส่วนลด" value={formatMoney(salesAfterDiscount)} />
                    {salesForm.hasVat ? <SummaryLine label={vatLabel} value={formatMoney(salesVat)} /> : null}
                    {salesCustomerAdvanceApplied > 0 ? <SummaryLine label="หักมัดจำ Customer" tone="red" value={`-${formatMoney(salesCustomerAdvanceApplied)}`} /> : null}
                    <SummaryLine label="ยอดสุทธิก่อนหักมัดจำ" value={formatMoney(salesTotal)} />
                    <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-lg font-bold"><span>ยอดลูกหนี้สุทธิ</span><span className="tabular-nums text-slate-900">{formatMoney(salesReceivableBalance)}</span></div>
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
                      <InputField error={salesFieldErrors.vatInvoiceNo} errorKey="vatInvoiceNo" label="เลขที่ใบกำกับภาษี *" required value={salesForm.vatInvoiceNo ?? ''} onChange={(value) => updateSalesForm('vatInvoiceNo', value || null)} />
                      <InputField error={salesFieldErrors.vatInvoiceDate} errorKey="vatInvoiceDate" label="วันที่ใบกำกับภาษี *" required type="date" value={salesForm.vatInvoiceDate ?? ''} onChange={(value) => updateSalesForm('vatInvoiceDate', value || null)} />
                    </div>
                  ) : <div className="mt-1 text-xs text-amber-700">ยังไม่ได้ออกใบกำกับภาษี ต้องติดตามเพื่อใช้เอกสารขาย</div>}
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <Field error={salesFieldErrors.note} label="หมายเหตุ"><textarea data-error-key="note" className={`w-full rounded-md border px-3 py-2 ${salesFieldErrors.note ? 'border-red-400 bg-red-50' : ''}`} rows={2} value={salesForm.note ?? ''} onChange={(event) => updateSalesForm('note', event.target.value || null)} /></Field>
              </div>
            </div>
          </div>
        </div>
      ) : null}
	      {detailBillDocNo && mode === 'purchase' ? (
	        <PurchaseBillDetailModal
          detail={detailBill}
          docNo={detailBillDocNo}
          error={detailError}
          isLoading={isDetailLoading}
          isPrinting={printingBillDocNo === detailBillDocNo}
          onClose={() => {
            latestDetailRequestRef.current += 1
            setDetailBillDocNo(null)
            setDetailBill(null)
            setSalesDetailBill(null)
            setDetailError(null)
            setIsDetailLoading(false)
          }}
          onPrint={(detail) => void printPurchaseBill(detail)}
	        />
	      ) : null}
	      {detailBillDocNo && mode === 'sales' ? (
	        <SalesBillDetailModal
          detail={salesDetailBill}
          docNo={detailBillDocNo}
          error={detailError}
          isLoading={isDetailLoading}
          isPrinting={printingBillDocNo === detailBillDocNo}
          tradingCostSources={options.tradingCostSources ?? []}
          onClose={() => {
            latestDetailRequestRef.current += 1
            setDetailBillDocNo(null)
            setDetailBill(null)
            setSalesDetailBill(null)
            setDetailError(null)
            setIsDetailLoading(false)
          }}
          onCorrectTradingAllocations={correctTradingAllocations}
          onPrint={(detail) => void printSalesBill(detail)}
	        />
	      ) : null}
	      {cancelingBill ? (
        <Dialog open={Boolean(cancelingBill)} onOpenChange={(open) => {
          if (open || isSaving) return
          setCancelingBill(null)
          setCancelNote('')
          setCancelNoteError('')
        }}>
          <DialogContent aria-labelledby={`${mode}-bill-cancel-title`} hideClose className="top-auto bottom-0 w-full max-w-lg translate-x-[-50%] translate-y-0 rounded-t-md bg-slate-900 md:top-1/2 md:bottom-auto md:-translate-y-1/2 md:rounded-md border-0 shadow-2xl !p-0 overflow-hidden outline-none focus:outline-none">
            <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md flex flex-row items-center shrink-0">
              <div>
                <DialogTitle id={`${mode}-bill-cancel-title`} className="text-white">ยกเลิก{mode === 'sales' ? 'บิลขาย' : 'บิลรับซื้อ'} {cancelingBill.docNo}</DialogTitle>
                <DialogDescription className="text-slate-300">{cancelDialogPartyName}</DialogDescription>
              </div>
            </DialogHeader>
            <div className="space-y-2 bg-slate-50 p-5 text-sm">
              <label className="block text-xs font-medium text-slate-600" htmlFor={`${mode}-bill-cancel-note`}>หมายเหตุการยกเลิก *</label>
              <textarea
                id={`${mode}-bill-cancel-note`}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:ring-0 outline-none transition-colors"
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
            <DialogFooter className="px-5 py-4 border-t border-slate-100 bg-white flex justify-end gap-2 shrink-0 rounded-b-md">
              <Button disabled={isSaving} type="button" variant="ghost" className="font-normal border-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors outline-none focus:ring-0" onClick={() => {
                if (isSaving) return
                setCancelingBill(null)
                setCancelNote('')
                setCancelNoteError('')
              }}>ปิด</Button>
              <Button className="rounded-md bg-red-600 hover:bg-red-700 text-white font-medium transition-colors outline-none focus:ring-0 px-5" disabled={isSaving} type="button" onClick={() => void cancelBill()}>{isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
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
  const detailTitle = detail?.docNo ?? docNo
  const detailPartyName = detail ? `${detail.supplierCode ? `[${detail.supplierCode}] ` : ''}${detail.supplierName}` : '-'
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent aria-labelledby="purchase-bill-detail-title" className="max-h-[90vh] max-w-6xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none" hideClose>
        <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md shrink-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <DialogTitle id="purchase-bill-detail-title" className="truncate text-white">รายละเอียดบิลรับซื้อ {detailTitle}</DialogTitle>
            <DialogDescription className="truncate text-xs text-slate-300">{detailPartyName}</DialogDescription>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {detail ? (
              <Button className="h-9 gap-2 border-emerald-600 bg-emerald-600 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white" disabled={isPrinting} type="button" variant="outline" onClick={() => onPrint(detail)}>
                <Printer className="size-4" />
                {isPrinting ? 'กำลังเตรียม...' : 'พิมพ์'}
              </Button>
            ) : null}
            <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onClose}>ปิด</Button>
          </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50">

        {isLoading ? (
          <div className="p-8 text-center text-sm text-slate-500">กำลังโหลดรายละเอียดบิลรับซื้อ</div>
        ) : error ? (
          <div className="p-4">
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          </div>
        ) : detail ? (
          <div className="space-y-4 p-4 text-sm">
            {/* ข้อมูลทั่วไป */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">ข้อมูลเอกสาร</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <DetailItem label="เลขที่บิล" value={detail.docNo} />
                <DetailItem label="วันที่สร้างรายการ" value={formatDateDisplay(detail.date)} />
                <DetailItem label="สาขา/คลัง" value={detail.branchName || '-'} />
                <DetailItem label="ประเภทบิล" value={detail.transactionMode || '-'} />
                <DetailItem label="ผู้ทำรายการ" value={detail.createdBy || '-'} />
                <DetailItem className="col-span-2 sm:col-span-3" label="อ้างอิงใบรับของ WTI" value={detail.receiptDocNos.join(', ') || '-'} />
              </div>
            </div>

            {/* สถานะและการชำระเงิน */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1 border-b border-slate-100/80">สถานะและการชำระเงิน</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <div className="flex flex-col py-1">
                  <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">สถานะบิล</div>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${workflowStatusBadgeClass(detail.status)}`}>
                      <span className="size-1.5 rounded-full bg-current" />
                      {detail.statusLabel}
                    </span>
                  </div>
                </div>
                <DetailItem label="ยอดเงินสุทธิ" value={`${formatMoney(detail.totalAmount)} บาท`} />
                <DetailItem label="ชำระแล้ว" value={`${formatMoney(detail.paidAmount)} บาท`} />
                <DetailItem label="ยอดคงเหลือค้างจ่าย" value={`${formatMoney(detail.payableBalance)} บาท`} />
                {detail.advancePaymentDocNo ? (
                  <>
                    <DetailItem className="col-span-2 sm:col-span-4" label="หักเงินล่วงหน้า / มัดจำ" value={`${detail.advancePaymentDocNo}${detail.advancePaymentInvoiceNo ? ` · INV ${detail.advancePaymentInvoiceNo}` : ''} (ผลหักรวม ${formatMoney(detail.advanceAllocatedAmount)} บาท)`} />
                    <DetailItem className="col-span-2 sm:col-span-4" label="ยอดหัก ADV ก่อน VAT" value={`ฐาน ${formatMoney(detail.advanceAllocatedSubtotalAmount)} บาท / ลด VAT ${formatMoney(detail.advanceAllocatedVatAmount)} บาท / ใช้ ADV จริง ${formatMoney(detail.advanceConsumedAmount)} บาท`} />
                  </>
                ) : null}
              </div>
            </div>

            {/* สรุปต่อสินค้า */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">สรุปต่อสินค้า</div>
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="ns-table w-full min-w-[880px] text-sm">
                  <thead className="bg-slate-50 text-slate-600">
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

            {/* รายละเอียด allocation */}
            <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">รายละเอียด allocation รายแถว</div>
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="ns-table w-full min-w-[1100px] text-sm">
                  <thead className="bg-slate-50 text-slate-600">
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

        </div>

      </DialogContent>
    </Dialog>
  )
}

function SalesBillDetailModal({
  detail,
  docNo,
  error,
  isLoading,
  isPrinting,
  tradingCostSources,
  onClose,
  onCorrectTradingAllocations,
  onPrint,
}: {
  detail: SalesBillDetail | null
  docNo: string
  error: string | null
  isLoading: boolean
  isPrinting: boolean
  tradingCostSources: Option[]
  onClose: () => void
  onCorrectTradingAllocations: (docNo: string, allocations: Array<{ salesLineNo: number; tradingCostSourceId: string }>, note: string) => Promise<void>
  onPrint: (detail: SalesBillDetail) => void
}) {
  const [correctionError, setCorrectionError] = useState<string | null>(null)
  const [correctionNote, setCorrectionNote] = useState('')
  const [correctionSources, setCorrectionSources] = useState<Record<number, string>>({})
  const [isCorrecting, setIsCorrecting] = useState(false)
  const [showCorrection, setShowCorrection] = useState(false)

  useEffect(() => {
    if (!detail || detail.transactionMode !== 'TRADING') {
      setShowCorrection(false)
      setCorrectionSources({})
      setCorrectionNote('')
      setCorrectionError(null)
      return
    }
    setCorrectionSources(Object.fromEntries(detail.items.map((item) => {
      const sourceType = item.sourceType.toUpperCase()
      const sourceDocNo = item.tradingSourceDocNo
      const sourceLineNo = item.tradingSourceLineNo ?? 1
      const sourceId = !sourceDocNo
        ? ''
        : sourceType.includes('COST SOURCE')
          ? `SRC:${sourceDocNo}:1`
          : `PB:${sourceDocNo}:${sourceLineNo}`
      return [item.lineNo, sourceId]
    })))
    setCorrectionError(null)
  }, [detail])

  const submitCorrection = async () => {
    if (!detail) return
    setCorrectionError(null)
    const allocations = detail.items.map((item) => ({
      salesLineNo: item.lineNo,
      tradingCostSourceId: correctionSources[item.lineNo] ?? '',
    }))
    if (allocations.some((allocation) => !allocation.tradingCostSourceId)) {
      setCorrectionError('เลือก Trading Cost Source ให้ครบทุกแถว')
      return
    }
    if (!correctionNote.trim()) {
      setCorrectionError('กรอกเหตุผลการแก้ไข allocation')
      return
    }
    setIsCorrecting(true)
    try {
      await onCorrectTradingAllocations(detail.docNo, allocations, correctionNote.trim())
      setShowCorrection(false)
      setCorrectionNote('')
    } catch (caught) {
      setCorrectionError(caught instanceof Error ? caught.message : 'แก้ไข Trading allocation ไม่สำเร็จ')
    } finally {
      setIsCorrecting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent aria-labelledby="sales-bill-detail-title" className="max-h-[90vh] max-w-6xl overflow-hidden rounded-md !p-0 flex flex-col bg-slate-900 border-0 outline-none focus:outline-none" hideClose>
        <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md shrink-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <DialogTitle id="sales-bill-detail-title" className="truncate text-white">รายละเอียดบิลขาย {detail?.docNo ?? docNo}</DialogTitle>
            <DialogDescription className="truncate text-xs text-slate-300">
              {detail ? `${detail.customerCode ? `[${detail.customerCode}] ` : ''}${detail.customerName}` : docNo}
            </DialogDescription>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {detail ? (
              <Button className="h-9 gap-2 border-emerald-600 bg-emerald-600 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white" disabled={isPrinting} type="button" variant="outline" onClick={() => onPrint(detail)}>
                <Printer className="size-4" />
                {isPrinting ? 'กำลังเตรียม...' : 'พิมพ์'}
              </Button>
            ) : null}
            <Button className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={onClose}>ปิด</Button>
          </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-slate-500">กำลังโหลดรายละเอียดบิลขาย</div>
          ) : error ? (
            <div className="p-4">
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            </div>
          ) : detail ? (
            <div className="space-y-4 p-4 text-sm">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ข้อมูลเอกสาร</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <DetailItem label="เลขที่บิล" value={detail.docNo} />
                <DetailItem label="วันที่เอกสาร" value={formatDateDisplay(detail.date)} />
                <DetailItem label="วันที่ครบกำหนด" value={detail.dueDate ? formatDateDisplay(detail.dueDate) : '-'} />
                <DetailItem label="สาขา/คลัง" value={[detail.branchName, detail.warehouseName].filter((value) => value && value !== '-').join(' / ') || '-'} />
                <DetailItem label="ช่องทางขาย" value={detail.channelName || '-'} />
                {detail.exportOrderNo ? <DetailItem label="เลขที่ order ส่งออก" value={detail.exportOrderNo} /> : null}
                <DetailItem label="ประเภทบิล" value={detail.transactionMode || '-'} />
                <DetailItem label="ผู้ขาย" value={detail.salesName || '-'} />
                <DetailItem label="ผู้ทำรายการ" value={detail.createdBy || '-'} />
                <DetailItem className="col-span-2 sm:col-span-3" label="อ้างอิงใบส่งของ WTO" value={detail.deliveryDocNos.join(', ') || '-'} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">สถานะและการรับเงิน</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <div className="flex flex-col py-1">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-400">สถานะรับเงิน</div>
                  <div className="mt-1">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadgeClass(detail.status)}`}>
                      <span className="size-1.5 rounded-full bg-current" />
                      {detail.statusLabel}
                    </span>
                  </div>
                </div>
                <DetailItem label="ยอดเงินสุทธิ" value={`${formatMoney(detail.totalAmount)} บาท`} />
                <DetailItem label="รับแล้ว" value={`${formatMoney(detail.receivedAmount || detail.paidAmount)} บาท`} />
                <DetailItem label="ยอดคงเหลือค้างรับ" value={`${formatMoney(detail.receivableBalance)} บาท`} />
                {detail.customerAdvanceDocNo ? (
                  <DetailItem className="col-span-2 sm:col-span-4" label="หักมัดจำ / เงินล่วงหน้า Customer" value={detail.customerAdvanceDocNo} />
                ) : null}
              </div>
            </div>

            {detail.readModelWarning ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {detail.readModelWarning}
              </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-bold text-slate-800">รายการสินค้า / Source</div>
                {detail.transactionMode === 'TRADING' ? (
                  <Button className="h-9 px-3 text-xs font-normal" type="button" variant="outline" onClick={() => setShowCorrection((current) => !current)}>
                    {showCorrection ? 'ซ่อนแก้ allocation' : 'แก้ Trading allocation'}
                  </Button>
                ) : null}
              </div>
              {detail.transactionMode === 'TRADING' && showCorrection ? (
                <div className="mb-3 rounded-md border border-purple-100 bg-purple-50 p-3">
                  <div className="grid gap-3">
                    <div className="text-xs font-semibold text-purple-800">แก้เฉพาะ Cost Source ของบิลขาย Trading</div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {detail.items.map((item) => {
                        const selectedSourceId = correctionSources[item.lineNo] ?? ''
                        const sourceOptions = tradingCostSources.filter((source) => {
                          if (selectedSourceId === source.id) return true
                          if (source.active === false) return false
                          const sameProduct = source.product_id === item.productId || source.product_id === item.productCode
                          return sameProduct && ((source.remainingQty ?? 0) > 0.0001 || (source.remainingAmount ?? 0) > 0.01)
                        })
                        const comboboxOptions = sourceOptions.map((source) => ({
                          id: source.id,
                          label: source.label ?? source.name,
                          searchText: [source.name, source.label, source.supplier_name].filter(Boolean).join(' '),
                        }))
                        if (selectedSourceId && !comboboxOptions.some((source) => source.id === selectedSourceId)) {
                          comboboxOptions.unshift({
                            id: selectedSourceId,
                            label: item.sourceLabel || selectedSourceId,
                            searchText: [item.sourceLabel, item.productCode, item.productName].filter(Boolean).join(' '),
                          })
                        }
                        return (
                          <div key={`correction-${item.lineNo}`} className="rounded-md bg-white p-2">
                            <div className="mb-1 text-xs font-semibold text-slate-700">Line {item.lineNo}: {item.productName}</div>
                            <SearchCombobox
                              hideLabel
                              inputClassName="h-9 text-sm"
                              inputId={`sales-bill-correction-source-${item.lineNo}`}
                              label={`Trading Cost Source line ${item.lineNo}`}
                              options={comboboxOptions}
                              placeholder="เลือก Trading PB / Cost Source"
                              value={selectedSourceId}
                              onChange={(value) => setCorrectionSources((current) => ({ ...current, [item.lineNo]: value }))}
                            />
                          </div>
                        )
                      })}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="sales-bill-correction-note">เหตุผลการแก้ไข</label>
                      <textarea
                        className="min-h-20 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                        id="sales-bill-correction-note"
                        value={correctionNote}
                        onChange={(event) => setCorrectionNote(event.target.value)}
                      />
                    </div>
                    {correctionError ? <div className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{correctionError}</div> : null}
                    <div className="flex justify-end">
                      <Button className="font-normal" disabled={isCorrecting} type="button" onClick={() => void submitCorrection()}>
                        {isCorrecting ? 'กำลังบันทึก...' : 'บันทึก allocation correction'}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="ns-table w-full min-w-[1100px] text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">สินค้า</th>
                      <th className="px-3 py-2 text-left font-medium">ใบส่งของ WTO</th>
                      <th className="px-3 py-2 text-left font-medium">PO / ที่มา</th>
                      <th className="px-3 py-2 text-right font-medium">Gross</th>
                      <th className="px-3 py-2 text-right font-medium">หัก</th>
                      <th className="px-3 py-2 text-right font-medium">จำนวนสุทธิ</th>
                      <th className="px-3 py-2 text-right font-medium">ราคาขาย/หน่วย</th>
                      <th className="px-3 py-2 text-right font-medium">ส่วนลด</th>
                      <th className="px-3 py-2 text-right font-medium">ยอดรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item) => {
                      const sourceProductCode = item.sourceProductCode?.trim() ?? ''
                      const salesProductCode = item.productCode?.trim() ?? ''
                      const isSeparatedFromSource = Boolean(sourceProductCode && salesProductCode && sourceProductCode !== salesProductCode)
                      return (
                        <tr key={`${item.lineNo}-${item.productCode}-${item.deliveryLineId}`} className="border-t border-slate-200">
                          <td className="px-3 py-2 align-top">
                            <div className="font-medium text-slate-900">{item.productName}</div>
                            <div className="text-xs text-slate-500">{[item.productCode || null, `line ${item.lineNo}`].filter(Boolean).join(' · ')}</div>
                            {isSeparatedFromSource ? (
                              <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold leading-snug text-amber-800">
                                คัดแยกจาก: {item.sourceProductName} ({item.sourceProductCode})
                              </div>
                            ) : null}
                            {item.note ? <div className="mt-1 text-xs text-slate-500">{item.note}</div> : null}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="text-slate-900">{item.deliveryTicketDocNo || '-'}</div>
                            <div className="text-xs text-slate-500">{item.deliveryVehicleNo || '-'}</div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="text-slate-900">{item.sourceLabel || '-'}</div>
                            <div className="text-xs text-slate-500">{item.sourceType || '-'}</div>
                            {item.matchedCogs > 0 ? <div className="mt-1 text-xs text-red-600">Matched COGS {formatMoney(item.matchedCogs)}</div> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.grossWeight)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.deductWeight)}</td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">{formatMoney(item.qty || item.netWeight)} {item.unit}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.price)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(item.discount)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700 tabular-nums">{formatMoney(item.amount)}</td>
                        </tr>
                      )
                    })}
                    {detail.items.length === 0 ? <tr><td className="px-6 py-6 text-center text-slate-500" colSpan={9}>ไม่มีรายการสินค้าในบิล</td></tr> : null}
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
                  <PlainDetail label="ออกใบกำกับภาษี" value={detail.vatInvoiceIssued ? 'ออกแล้ว' : 'ยังไม่ได้ออก'} />
                  <PlainDetail label="เลขที่ใบกำกับภาษี" value={detail.vatInvoiceNo || '-'} />
                  <PlainDetail label="วันที่ใบกำกับภาษี" value={detail.vatInvoiceDate ? formatDateDisplay(detail.vatInvoiceDate) : '-'} />
                  <PlainDetail label="หมายเหตุ" value={detail.note || '-'} />
                </div>
              </div>
            </div>

            <div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-slate-700">ประวัติสถานะ SB</div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadgeClass(detail.status)}`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    ล่าสุด: {detail.statusLabel}
                  </span>
                </div>
                <SalesBillDetailTimeline detail={detail} />
              </div>
            </div>
          </div>
        ) : null}
        </div>

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
            <div className="mt-1 truncate text-xs">{event.actor}</div>
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

function SalesBillDetailTimeline({ detail }: { detail: SalesBillDetail }) {
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
  const sourceFactsEventIndex = timelineEvents.length - 1

  return (
    <div className="space-y-3">
      {timelineEvents.map((event, index) => (
        <div key={event.id} className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[128px_1fr]">
          <div className="pt-1 text-right text-xs text-slate-500">
            <div>{formatDateTime(event.createdAt)}</div>
            <div className="mt-1 truncate text-xs">{event.actor}</div>
          </div>
          <div className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
            <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${index === 0 ? purchaseBillTimelineDotClass(event.tone) : 'bg-slate-300'}`} />
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-medium text-slate-800">{event.title}</div>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${statusBadgeClass(event.status)}`}>
                <span className="size-1.5 rounded-full bg-current" />
                {event.statusLabel}
              </span>
            </div>
            <div className="mt-1 text-xs text-slate-500">{event.transitionText}</div>
            <div className="mt-2 grid gap-1 rounded-md bg-white px-3 py-2 text-xs text-slate-600">
              {event.details.map((detailLine) => <div key={detailLine}>{detailLine}</div>)}
            </div>
            {index === sourceFactsEventIndex ? <SalesBillSourceUsageTimelineTable facts={detail.sourceUsageFacts} /> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function SalesBillSourceUsageTimelineTable({ facts }: { facts: SalesBillDetail['sourceUsageFacts'] }) {
  return (
    <details className="mt-3 rounded-md border border-slate-200 bg-white">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-blue-700">
        ต้นทางสินค้าและต้นทุน {facts.length > 0 ? `${facts.length} รายการ` : ''}
      </summary>
      {facts.length === 0 ? (
        <div className="border-t border-slate-100 px-3 py-3 text-center text-xs text-slate-500">ยังไม่มีข้อมูลต้นทางสินค้าและต้นทุนสำหรับบิลนี้</div>
      ) : (
        <div className="max-h-[360px] overflow-auto border-t border-slate-100">
          <table className="ns-table w-full min-w-[760px] text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">รายการ</th>
                <th className="px-3 py-2 text-left font-medium">ต้นทาง</th>
                <th className="px-3 py-2 text-right font-medium">จำนวน</th>
                <th className="px-3 py-2 text-right font-medium">ต้นทุน/COGS</th>
                <th className="px-3 py-2 text-left font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {facts.map((fact) => (
                <tr key={fact.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-slate-900">{fact.title}</div>
                    <div className="text-slate-500">{[fact.type, fact.productName !== '-' ? fact.productName : null, fact.lineNo ? `line ${fact.lineNo}` : null].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-xs text-slate-700">{fact.docNo || '-'}</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums">{fact.qty ? `${formatMoney(fact.qty)} ${fact.unit}` : '-'}</td>
                  <td className="px-3 py-2 text-right align-top tabular-nums">{fact.amount ? formatMoney(fact.amount) : '-'}</td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${fact.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{fact.status}</span>
                    <div className="mt-1 text-xs text-slate-400">{formatDateTime(fact.createdAt)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
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
  return <SegmentedFilterButton active={active} type="button" onClick={() => onClick(value)}>{label}</SegmentedFilterButton>
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
    <SegmentedFilterButton
      active={active}
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
    </SegmentedFilterButton>
  )
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase()
  if (['paid', 'received', 'complete', 'completed'].includes(normalized)) return 'text-emerald-700'
  if (['partial', 'partially_paid'].includes(normalized)) return 'text-blue-700'
  if (['cancelled', 'cancelled_supplier_swap', 'void', 'reversed'].includes(normalized)) return 'text-slate-500'
  if (['pending', 'unpaid', 'unreceived', 'open', 'draft'].includes(normalized)) return 'text-amber-700'
  return 'text-slate-700'
}

function statusText(status: string) {
  const labels: Record<string, string> = {
    cancelled: 'ยกเลิก',
    cancelled_supplier_swap: 'ยกเลิก/เปลี่ยนผู้ขาย',
    complete: 'เสร็จสิ้น',
    completed: 'เสร็จสิ้น',
    converted: 'เปิดบิลแล้ว',
    draft: 'Draft',
    paid: 'เสร็จสิ้น',
    pending: 'รอเปิดบิล',
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
    cancelled_supplier_swap: 'ยกเลิก/เปลี่ยนผู้ขาย',
    paid: 'เสร็จสิ้น',
    partial_paid: 'ชำระบางส่วน',
    pending_approval: 'ยังไม่อนุมัติ',
    pending_payment: 'รอจ่าย',
  }
  return labels[status.toLowerCase()] ?? status
}

function transactionModeLabel(mode: string | null | undefined) {
  if (mode === 'STOCK') return 'สต็อก'
  if (mode === 'TRADING') return 'ซื้อมาขายไป'
  return mode || '-'
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



function formatBranchWarehouse(row: BillRow) {
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

function StepBadge({ children }: { children: ReactNode; tone: 'amber' | 'blue' | 'emerald' | 'purple' }) {
  return <span className="flex size-6 items-center justify-center rounded-md-full border border-slate-200 bg-white text-xs text-slate-700">{children}</span>
}

function RadioCard({ active, disabled = false, label, note, onClick }: { active: boolean; disabled?: boolean; label: string; note: string; onClick: () => void }) {
  return (
    <button className={`rounded-md border-2 p-3 text-left transition ${active ? 'border-slate-700 bg-white shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`} disabled={disabled} type="button" onClick={onClick}>
      <div className="font-bold">{label}</div>
      <div className="text-xs text-slate-500">{note}</div>
    </button>
  )
}

function DetailItem({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`flex flex-col py-1 ${className}`}>
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}
