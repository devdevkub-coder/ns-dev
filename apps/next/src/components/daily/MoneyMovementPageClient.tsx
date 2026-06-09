'use client'

import { Check, Copy, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { paymentMethodGroupFromValue, type PaymentMethodGroup } from '@/lib/account-payment-method'
import { BillSelect, Field, SelectField, SummaryPill } from '@/components/daily/MoneyMovementFieldHelpers'
import { PaymentLinesSection, PaymentSplitsSection } from '@/components/daily/MoneyMovementFormSections'
import { Button as UiButton } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input as UiInput } from '@/components/ui/Input'
import { Select as UiSelect } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { customerReceiptFormSchema, dailyFetchJson, formatMoney, supplierPaymentFormSchema, todayDateInput, type CustomerReceiptFormValues, type DailyAccountOption, type SupplierPaymentFormValues } from '@/lib/daily'
import { formatAccountNoDisplay, formatDateDisplay } from '@/lib/format'

type PartyBankAccount = {
  accountNo?: string | null
  active?: boolean | null
  bankName?: string | null
  paymentMethod?: string | null
}
type Party = { active: boolean | null; bankAccount?: string | null; bankAccounts?: PartyBankAccount[]; id: string; name: string }
type Bill = {
  approvalAccountNo?: string
  approvalBankName?: string
  approvalId?: string
  approvalPaymentMethod?: string
  approvedAmount?: number
  customerId?: string | null
  date?: string
  docNo: string
  id: string
  paidAmount?: number
  payableBalance?: number
  receivableBalance?: number
  sourceDocNo?: string
  sourceType?: 'advance_payment' | 'expense' | 'purchase_bill'
  status?: string
  supplierId?: string | null
  totalAmount: number
}
type MoneyRow = {
  accountId?: string
  accountName: string
  accountNames?: string[]
  accountSummaries?: string[]
  approvalId?: string
  approvalIds?: string[]
  amount: number
  billId?: string
  billDocNo?: string
  billDocNos?: string[]
  customerId?: string
  date: string
  docNo: string
  fee?: number
  id: string
  method?: string
  netAmount: number
  notes: string
  partyName: string
  status?: string
  supplierId?: string
  withholdingTax?: number
}
type Payload = {
  accounts: DailyAccountOption[]
  bills: Bill[]
  customers?: Party[]
  paymentMethods?: Array<{ name: string; type: PaymentMethodGroup }>
  rows: MoneyRow[]
  settings?: { whtRatePercent?: number }
  suppliers?: Party[]
}
type PaymentHistoryTone = 'amber' | 'blue' | 'emerald' | 'rose' | 'slate'
type PaymentHistoryDetail = {
  accountRows: Array<{ accountName: string; amount: number; bankStatementDocNo: string }>
  approvalRows: Array<{ amount: number; docNo: string; sourceDocNo: string }>
  detailCards: Array<{ label: string; value: string }>
  docNo: string
  heading: string
  latestStatusLabel: string
  latestTone: PaymentHistoryTone
  summary: {
    amount: number
    approvedAt?: string | null
    closedAt?: string | null
    fee: number
    netAmount: number
    statusLabel: string
    withholdingTax: number
  }
  timeline: Array<{
    actor?: string
    at: string
    details: string[]
    pillLabel: string
    tone: PaymentHistoryTone
    title: string
    transition: string
  }>
  timelineTitle: string
  type: 'approval' | 'payment'
}

type MoneyForm = SupplierPaymentFormValues | CustomerReceiptFormValues
type PaymentLine = NonNullable<SupplierPaymentFormValues['lines']>[number] & { billText?: string }
type PaymentSplit = SupplierPaymentFormValues['splits'][number]
type PaymentBillSort = 'age_asc' | 'age_desc' | 'balance_asc' | 'balance_desc' | 'date_asc' | 'date_desc' | 'doc_asc' | 'doc_desc' | 'paid_asc' | 'paid_desc' | 'supplier_asc' | 'supplier_desc' | 'total_asc' | 'total_desc'
type PaymentBillSortField = 'age' | 'balance' | 'date' | 'docNo' | 'paidAmount' | 'supplier' | 'totalAmount'
type HistorySortField = 'accountName' | 'amount' | 'date' | 'docNo' | 'netAmount' | 'partyName'
type PaymentHistoryStatusFilter = 'active' | 'all' | 'cancelled'
type ReceiptTab = 'entry' | 'history'
const pageSizeOptions = [10, 25, 50, 100]

function newPaymentLine(): PaymentLine {
  return { amount: 0, approvalId: null, billId: '', billText: '', discount: 0, fee: 0, id: `PL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, supplierId: '', withholdingTax: 0 }
}

function newPaymentSplit(): PaymentSplit {
  return { accountId: '', amount: 0, id: `SP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function parseMoneyInput(value: string) {
  const normalized = sanitizeMoneyInput(value).trim()
  if (!normalized) return 0
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function sanitizeMoneyInput(value: string) {
  const normalized = value.replace(/,/g, '').replace(/[^\d.]/g, '')
  const [whole = '', ...decimalParts] = normalized.split('.')
  if (decimalParts.length === 0) return whole
  return `${whole}.${decimalParts.join('')}`
}

function ageInDays(dateValue: string | undefined) {
  if (!dateValue) return 0
  const start = new Date(`${dateValue.slice(0, 10)}T00:00:00.000Z`).getTime()
  const today = new Date(`${todayDateInput()}T00:00:00.000Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(today)) return 0
  return Math.max(0, Math.floor((today - start) / 86_400_000))
}

function sanitizeAccountNo(value: string | null | undefined) {
  return value?.replace(/\D/g, '') || ''
}

function supplierBankAccountLines(
  party: Party | undefined,
  paymentMethods: Array<{ name: string; type: PaymentMethodGroup }>,
) {
  const lines = (party?.bankAccounts ?? [])
    .filter((account) => account.active !== false && paymentMethodGroupFromValue(account.paymentMethod, paymentMethods) !== 'cash')
    .map((account) => ({
      accountNo: sanitizeAccountNo(account.accountNo),
      bankName: account.bankName?.trim() || '-',
    }))
    .filter((account) => Boolean(account.accountNo))
  if (lines.length > 0) {
    const seen = new Set<string>()
    return lines.filter((account) => {
      if (seen.has(account.accountNo)) return false
      seen.add(account.accountNo)
      return true
    })
  }

  const primary = sanitizeAccountNo(party?.bankAccount)
  return primary ? [{ accountNo: primary, bankName: '-' }] : []
}

function approvalBankAccountLines(bill: Bill) {
  const accountNo = sanitizeAccountNo(bill.approvalAccountNo)
  if (accountNo || bill.approvalBankName || bill.approvalPaymentMethod) {
    return [{
      accountNo,
      bankName: bill.approvalBankName?.trim() || bill.approvalPaymentMethod?.trim() || '-',
    }]
  }
  return []
}

function paymentSelectionId(bill: Bill) {
  return bill.approvalId ?? bill.id
}

function paymentBillLabel(bill: Bill, partyName: string) {
  const sourceLabel = bill.sourceDocNo && bill.sourceDocNo !== bill.docNo ? ` / อ้างอิง ${bill.sourceDocNo}` : ''
  return `${bill.docNo}${sourceLabel} | ${partyName} | ค้าง ${formatMoney(bill.payableBalance ?? 0)}`
}

function normalizedPaymentMethod(value: string | null | undefined) {
  return String(value ?? '').trim()
}

const paymentTheme = {
  action: 'bg-rose-600 hover:bg-rose-700',
  banner: 'from-rose-600 via-red-600 to-orange-500',
  chip: 'bg-rose-100 text-rose-700',
  muted: 'bg-rose-50 text-rose-700',
  strong: 'text-rose-700',
  table: 'bg-rose-700',
}

const receiptTheme = {
  action: 'bg-emerald-600 hover:bg-emerald-700',
  banner: 'from-emerald-600 via-green-600 to-teal-500',
  chip: 'bg-emerald-100 text-emerald-700',
  muted: 'bg-emerald-50 text-emerald-700',
  strong: 'text-emerald-700',
  table: 'bg-emerald-700',
}

function initialForm(mode: 'payment' | 'receipt'): MoneyForm {
  return {
    accountId: '',
    amount: 0,
    billId: mode === 'payment' ? '' : null,
    date: todayDateInput(),
    discount: 0,
    docNo: null,
    fee: 0,
    id: null,
    method: mode === 'payment' ? '' : null,
    notes: null,
    ...(mode === 'payment' ? { lines: [newPaymentLine()], splits: [newPaymentSplit()], supplierId: '' } : { customerId: '' }),
    withholdingTax: 0,
  } as MoneyForm
}

function paymentHistoryStatusLabel(status: string | undefined) {
  return status === 'cancelled' ? 'ยกเลิก' : 'จ่ายแล้ว'
}

function paymentHistoryStatusTone(status: string | undefined) {
  return status === 'cancelled'
    ? 'text-slate-500'
    : 'text-emerald-700'
}

function paymentHistoryStatusDot(status: string | undefined) {
  return status === 'cancelled'
    ? 'bg-slate-400'
    : 'bg-emerald-500'
}

function detailToneTextClass(tone: PaymentHistoryTone) {
  if (tone === 'blue') return 'text-blue-700'
  if (tone === 'emerald') return 'text-emerald-700'
  if (tone === 'amber') return 'text-amber-700'
  if (tone === 'rose') return 'text-rose-700'
  return 'text-slate-600'
}

function detailDotClass(tone: PaymentHistoryTone) {
  if (tone === 'blue') return 'bg-blue-500'
  if (tone === 'emerald') return 'bg-emerald-500'
  if (tone === 'amber') return 'bg-amber-500'
  if (tone === 'rose') return 'bg-rose-500'
  return 'bg-slate-500'
}

function formatTimelineDate(value: string) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

function TableSortHeader<TSortKey extends string>({
  activeKey,
  align,
  direction,
  label,
  onSort,
  sortKey,
}: {
  activeKey: TSortKey
  align: 'center' | 'left' | 'right'
  direction: 'asc' | 'desc'
  label: string
  onSort: (key: TSortKey) => void
  sortKey: TSortKey
}) {
  const active = activeKey === sortKey
  const alignClass = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left'
  return (
    <TableHead className="p-0">
      <button className={`flex w-full items-center gap-1 p-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 ${alignClass}`} type="button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="text-slate-400">{active ? direction === 'asc' ? '▲' : '▼' : '↕'}</span>
      </button>
    </TableHead>
  )
}

export function MoneyMovementPageClient({
  entryOnly = false,
  historyOnly = false,
  initialTab = 'entry',
  mode,
}: {
  entryOnly?: boolean
  historyOnly?: boolean
  initialTab?: ReceiptTab
  mode: 'payment' | 'receipt'
}) {
  const [data, setData] = useState<Payload>({ accounts: [], bills: [], rows: [] })
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const isSavingRef = useRef(false)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [billSearch, setBillSearch] = useState('')
  const [billPage, setBillPage] = useState(1)
  const [billPageSize, setBillPageSize] = useState(25)
  const [billSort, setBillSort] = useState<PaymentBillSort>('date_desc')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(10)
  const [historySortField, setHistorySortField] = useState<HistorySortField>(mode === 'payment' ? 'date' : 'docNo')
  const [historySortDirection, setHistorySortDirection] = useState<'asc' | 'desc'>('desc')
  const [paymentHistoryStatusFilter, setPaymentHistoryStatusFilter] = useState<PaymentHistoryStatusFilter>('all')
  const [moneyTab, setMoneyTab] = useState<ReceiptTab>(initialTab)
  const [form, setForm] = useState<MoneyForm>(() => initialForm(mode))
  const [isBillLocked, setIsBillLocked] = useState(false)
  const [moneyDrafts, setMoneyDrafts] = useState<Record<string, string>>({})
  const [copiedAccountKey, setCopiedAccountKey] = useState<string | null>(null)
  const [cancelApprovalReason, setCancelApprovalReason] = useState('')
  const [cancelApprovalTarget, setCancelApprovalTarget] = useState<Bill | null>(null)
  const [isCancellingApproval, setIsCancellingApproval] = useState(false)
  const [paymentDetailOpen, setPaymentDetailOpen] = useState(false)
  const [paymentDetailRow, setPaymentDetailRow] = useState<MoneyRow | null>(null)
  const [paymentDetail, setPaymentDetail] = useState<PaymentHistoryDetail | null>(null)
  const [isPaymentDetailLoading, setIsPaymentDetailLoading] = useState(false)
  const [paymentDetailError, setPaymentDetailError] = useState<string | null>(null)

  const showReceiptTabs = mode === 'receipt' && !entryOnly && !historyOnly
  const showPaymentTabs = mode === 'payment' && !entryOnly && !historyOnly
  const showMoneyTabs = showReceiptTabs || showPaymentTabs
  const apiPath = mode === 'payment'
    ? (historyOnly || (showPaymentTabs && moneyTab === 'history') ? '/api/purchase/payment-history' : '/api/purchase/payments')
    : '/api/sales/receipts'
  const partyKey = mode === 'payment' ? 'supplierId' : 'customerId'
  const parties = useMemo(() => (mode === 'payment' ? data.suppliers ?? [] : data.customers ?? []), [data.customers, data.suppliers, mode])
  const paymentMethods = useMemo(() => data.paymentMethods ?? [], [data.paymentMethods])
  const theme = mode === 'payment' ? paymentTheme : receiptTheme
  const title = mode === 'payment' ? 'จ่ายเงินผู้รับเงิน' : 'รับเงิน Customer'
  const subtitle = mode === 'payment' ? 'Payment Voucher' : 'Receipt Voucher'
  const amountLabel = mode === 'payment' ? 'ยอดจ่าย' : 'ยอดรับ'
  const accountLabel = mode === 'payment' ? 'บัญชีจ่าย' : 'บัญชีรับ'
  const partyLabel = mode === 'payment' ? 'ผู้รับเงิน' : 'ลูกค้า'
  const balanceLabel = mode === 'payment' ? 'ค้างจ่าย' : 'ค้างรับ'
  const partyValue = mode === 'payment'
    ? (form as SupplierPaymentFormValues).supplierId
    : (form as CustomerReceiptFormValues).customerId
  const showEntrySection = !historyOnly && (!showMoneyTabs || moneyTab === 'entry')
  const showHistorySection = !entryOnly && (!showMoneyTabs || moneyTab === 'history')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await dailyFetchJson<Payload>(apiPath))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [apiPath])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activeAccounts = useMemo(() => data.accounts.filter((account) => account.active), [data.accounts])
  const partyMap = useMemo(() => new Map(parties.map((party) => [party.id, party.name])), [parties])
  const supplierMap = useMemo(() => new Map((data.suppliers ?? []).map((supplier) => [supplier.id, supplier])), [data.suppliers])
  const billMap = useMemo(() => new Map(data.bills.map((bill) => [bill.id, bill])), [data.bills])
  const paymentLines = useMemo(() => (mode === 'payment' ? (form as SupplierPaymentFormValues).lines ?? [] : []), [form, mode])
  const selectedBill = form.billId ? billMap.get(form.billId) : null
  const selectedBillBalance = selectedBill ? (mode === 'payment' ? selectedBill.payableBalance ?? 0 : selectedBill.receivableBalance ?? 0) : 0
  const paymentLineBalanceTotal = paymentLines.reduce((sum, line) => sum + (billMap.get(line.billId)?.payableBalance ?? 0), 0)
  const formNetAmount = mode === 'payment'
    ? form.amount + form.fee
    : form.amount - form.fee - form.withholdingTax - form.discount
  const paymentSplits = mode === 'payment' ? (form as SupplierPaymentFormValues).splits ?? [] : []
  const paymentSplitTotal = paymentSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0)

  const outstandingBills = useMemo(() => data.bills
    .filter((bill) => (mode === 'payment' ? (bill.payableBalance ?? 0) > 0 : (bill.receivableBalance ?? 0) > 0))
    .slice(0, 500), [data.bills, mode])
  const paymentSupplierId = mode === 'payment'
    ? paymentLines.find((line) => line.supplierId)?.supplierId ?? (form as SupplierPaymentFormValues).supplierId
    : ''
  const paymentMethodFilter = mode === 'payment'
    ? paymentLines
      .map((line) => billMap.get(line.billId)?.approvalPaymentMethod)
      .map(normalizedPaymentMethod)
      .find(Boolean) ?? normalizedPaymentMethod(form.method)
    : ''
  const paymentSelectableBills = useMemo(() => {
    if (mode !== 'payment') return outstandingBills
    return outstandingBills.filter((bill) => {
      const matchesSupplier = !paymentSupplierId || bill.supplierId === paymentSupplierId
      const matchesPaymentMethod = !paymentMethodFilter || normalizedPaymentMethod(bill.approvalPaymentMethod) === paymentMethodFilter
      return matchesSupplier && matchesPaymentMethod
    })
  }, [mode, outstandingBills, paymentMethodFilter, paymentSupplierId])
  const selectedPaymentBillIds = useMemo(() => new Set(paymentLines.map((line) => line.approvalId || line.billId).filter(Boolean)), [paymentLines])
  const supplierBills = useMemo(() => {
    if (mode !== 'payment') return []
    const query = billSearch.trim().toLowerCase()
    return data.bills.filter((bill) => {
      const supplierName = partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? ''
      const balance = bill.payableBalance ?? 0
      const status = paymentBillStatus(bill)
      const supplier = supplierMap.get(bill.supplierId ?? '')
      const supplierBankAccounts = supplierBankAccountLines(supplier, paymentMethods)
      const searchHaystack = [
        bill.id,
        bill.docNo,
        bill.approvalId ?? '',
        bill.sourceDocNo ?? '',
        supplierName,
        bill.date ?? '',
        supplierBankAccounts.map((account) => `${account.bankName} ${account.accountNo}`).join(' '),
      ].join(' ').toLowerCase()
      const matchesSearch = !query || searchHaystack.includes(query)
      const matchesStatus = balance > 0 && status !== 'cancelled'
      return matchesSearch && matchesStatus
    }).sort((left, right) => {
      const leftSupplierName = partyMap.get(left.supplierId ?? '') ?? left.supplierId ?? ''
      const rightSupplierName = partyMap.get(right.supplierId ?? '') ?? right.supplierId ?? ''
      switch (billSort) {
        case 'age_asc':
          return ageInDays(left.date) - ageInDays(right.date)
        case 'age_desc':
          return ageInDays(right.date) - ageInDays(left.date)
        case 'balance_asc':
          return (left.payableBalance ?? 0) - (right.payableBalance ?? 0)
        case 'balance_desc':
          return (right.payableBalance ?? 0) - (left.payableBalance ?? 0)
        case 'date_asc':
          return String(left.date ?? '').localeCompare(String(right.date ?? ''))
        case 'date_desc':
          return String(right.date ?? '').localeCompare(String(left.date ?? ''))
        case 'doc_asc':
          return left.docNo.localeCompare(right.docNo)
        case 'doc_desc':
          return right.docNo.localeCompare(left.docNo)
        case 'paid_asc':
          return (left.paidAmount ?? 0) - (right.paidAmount ?? 0)
        case 'paid_desc':
          return (right.paidAmount ?? 0) - (left.paidAmount ?? 0)
        case 'supplier_asc':
          return leftSupplierName.localeCompare(rightSupplierName, 'th')
        case 'supplier_desc':
          return rightSupplierName.localeCompare(leftSupplierName, 'th')
        case 'total_asc':
          return (left.totalAmount ?? 0) - (right.totalAmount ?? 0)
        case 'total_desc':
          return (right.totalAmount ?? 0) - (left.totalAmount ?? 0)
        default:
          return String(right.date ?? '').localeCompare(String(left.date ?? ''))
      }
    })
  }, [billSearch, billSort, data.bills, mode, partyMap, paymentMethods, supplierMap])

  const supplierBillTotalRows = supplierBills.length
  const supplierBillTotalPages = Math.max(1, Math.ceil(supplierBillTotalRows / billPageSize))
  const supplierBillCurrentPage = Math.min(billPage, supplierBillTotalPages)
  const supplierBillPageRows = supplierBills.slice((supplierBillCurrentPage - 1) * billPageSize, supplierBillCurrentPage * billPageSize)
  const hasActiveBillFilters = billSearch.trim() !== '' || billSort !== 'date_desc'
  useEffect(() => {
    setBillPage(1)
  }, [billSearch, billPageSize, billSort])

  useEffect(() => {
    if (billPage > supplierBillTotalPages) setBillPage(supplierBillTotalPages)
  }, [billPage, supplierBillTotalPages])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.rows.filter((row) => {
      const searchHaystack = [
        row.id,
        row.docNo,
        row.partyName,
        row.accountName,
        ...(row.accountNames ?? []),
        row.billDocNo ?? '',
        ...(row.billDocNos ?? []),
        row.approvalId ?? '',
        ...(row.approvalIds ?? []),
        row.notes,
      ].join(' ').toLowerCase()
      const matchesSearch = !query || searchHaystack.includes(query)
      const matchesAccount = !accountFilter || row.accountId === accountFilter || row.accountName === accountFilter
      const matchesFrom = !dateFrom || row.date >= dateFrom
      const matchesTo = !dateTo || row.date <= dateTo
      const matchesPaymentStatus = mode !== 'payment'
        || paymentHistoryStatusFilter === 'all'
        || (paymentHistoryStatusFilter === 'active' ? row.status !== 'cancelled' : row.status === 'cancelled')
      return matchesSearch && matchesAccount && matchesFrom && matchesTo && matchesPaymentStatus
    })
  }, [accountFilter, data.rows, dateFrom, dateTo, mode, paymentHistoryStatusFilter, search])

  const historyRows = useMemo(() => {
    return [...rows].sort((left, right) => {
      const leftValue = left[historySortField]
      const rightValue = right[historySortField]
      const base = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'th')
      return historySortDirection === 'asc' ? base : -base
    })
  }, [historySortDirection, historySortField, rows])

  const historyTotalRows = historyRows.length
  const historyTotalPages = Math.max(1, Math.ceil(historyTotalRows / historyPageSize))
  const historyCurrentPage = Math.min(historyPage, historyTotalPages)
  const historyPageRows = historyRows.slice((historyCurrentPage - 1) * historyPageSize, historyCurrentPage * historyPageSize)
  const hasActiveHistoryFilters = search.trim() !== ''
    || dateFrom !== ''
    || dateTo !== ''
    || accountFilter !== ''
    || (mode === 'payment' && paymentHistoryStatusFilter !== 'all')

  const metrics = useMemo(() => {
    const rowAmount = rows.reduce((sum, row) => sum + row.amount, 0)
    const rowNet = rows.reduce((sum, row) => sum + row.netAmount, 0)
    const rowWht = rows.reduce((sum, row) => sum + (row.withholdingTax ?? 0), 0)
    const rowFee = rows.reduce((sum, row) => sum + (row.fee ?? 0), 0)
    const outstanding = outstandingBills.reduce((sum, bill) => sum + (mode === 'payment' ? bill.payableBalance ?? 0 : bill.receivableBalance ?? 0), 0)
    return { outstanding, rowAmount, rowFee, rowNet, rowWht }
  }, [mode, outstandingBills, rows])

  useEffect(() => {
    setHistoryPage(1)
  }, [search, dateFrom, dateTo, accountFilter, historyPageSize, historySortField, historySortDirection, paymentHistoryStatusFilter])

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages)
  }, [historyPage, historyTotalPages])

  function openForm() {
    setForm(initialForm(mode))
    setMoneyDrafts({})
    setIsBillLocked(false)
    setError(null)
    setFormOpen(true)
  }

  function openFormForBill(bill: Bill) {
    const balance = bill.payableBalance ?? 0
    const settlementAmount = balance > 0 ? balance : bill.totalAmount
    const paymentAmount = roundMoney(settlementAmount)
    const netAmount = roundMoney(paymentAmount)
    setForm({
      ...initialForm(mode),
      amount: paymentAmount,
      billId: bill.id,
      lines: [{
        ...newPaymentLine(),
        amount: paymentAmount,
        approvalId: bill.approvalId ?? null,
        billText: paymentBillLabel(bill, partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'),
        billId: bill.id,
        supplierId: bill.supplierId ?? '',
        withholdingTax: 0,
      }],
      method: bill.approvalPaymentMethod ?? '',
      splits: [{ ...newPaymentSplit(), amount: netAmount }],
      supplierId: bill.supplierId ?? '',
    } as unknown as MoneyForm)
    setMoneyDrafts({})
    setIsBillLocked(true)
    setError(null)
    setFormOpen(true)
  }

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setAccountFilter('')
    setPaymentHistoryStatusFilter('all')
  }

  function switchMoneyTab(value: ReceiptTab) {
    setMoneyTab(value)
    setError(null)
    setFormOpen(false)
    setCancelApprovalTarget(null)
    setPaymentDetailOpen(false)
    setPaymentDetail(null)
    setPaymentDetailRow(null)
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setAccountFilter('')
    setPaymentHistoryStatusFilter('all')
    setBillSearch('')
    setBillSort('date_desc')
    setBillPage(1)
    setHistoryPage(1)
    if (mode === 'payment' && typeof window !== 'undefined') {
      window.history.replaceState(null, '', value === 'history' ? '/purchase/payments?tab=history' : '/purchase/payments')
    }
  }

  function billSortParts(): { direction: 'asc' | 'desc'; field: PaymentBillSortField } {
    const [rawField, rawDirection] = billSort.split('_') as [string, 'asc' | 'desc']
    const fieldMap: Record<string, PaymentBillSortField> = {
      age: 'age',
      balance: 'balance',
      date: 'date',
      doc: 'docNo',
      paid: 'paidAmount',
      supplier: 'supplier',
      total: 'totalAmount',
    }
    return { direction: rawDirection, field: fieldMap[rawField] ?? 'date' }
  }

  function billSortValue(field: PaymentBillSortField, direction: 'asc' | 'desc'): PaymentBillSort {
    const fieldMap: Record<PaymentBillSortField, string> = {
      age: 'age',
      balance: 'balance',
      date: 'date',
      docNo: 'doc',
      paidAmount: 'paid',
      supplier: 'supplier',
      totalAmount: 'total',
    }
    return `${fieldMap[field]}_${direction}` as PaymentBillSort
  }

  function toggleBillSort(field: PaymentBillSortField) {
    const current = billSortParts()
    if (current.field === field) {
      setBillSort(billSortValue(field, current.direction === 'asc' ? 'desc' : 'asc'))
      return
    }
    setBillSort(billSortValue(field, field === 'supplier' ? 'asc' : 'desc'))
  }

  async function openPaymentHistoryRow(row: MoneyRow) {
    if (mode !== 'payment') return
    setPaymentDetailOpen(true)
    setPaymentDetailRow(row)
    setPaymentDetail(null)
    setPaymentDetailError(null)
    setIsPaymentDetailLoading(true)
    try {
      setPaymentDetail(await dailyFetchJson<PaymentHistoryDetail>(`/api/purchase/payment-history/${encodeURIComponent(row.docNo)}`))
    } catch (caught) {
      setPaymentDetailError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดการจ่ายเงินไม่ได้')
    } finally {
      setIsPaymentDetailLoading(false)
    }
  }

  async function copyAccountNo(accountKey: string, accountNo: string) {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(accountNo)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = accountNo
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      }
      setCopiedAccountKey(accountKey)
      window.setTimeout(() => setCopiedAccountKey((current) => current === accountKey ? null : current), 1200)
    } catch {
      setError('คัดลอกเลขบัญชีไม่ได้')
    }
  }

  function toggleHistorySort(field: HistorySortField) {
    if (historySortField === field) {
      setHistorySortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setHistorySortField(field)
    setHistorySortDirection(field === 'date' ? 'desc' : 'asc')
  }

  function selectBill(billId: string) {
    const bill = billMap.get(billId)
    if (!bill) {
      setForm({ ...form, billId: '' })
      return
    }
    const balance = mode === 'payment' ? bill.payableBalance ?? 0 : bill.receivableBalance ?? 0
    const nextPartyId = mode === 'payment' ? bill.supplierId ?? '' : bill.customerId ?? ''
    setForm({
      ...form,
      [partyKey]: nextPartyId,
      amount: mode === 'payment'
        ? roundMoney(balance > 0 ? balance : bill.totalAmount)
        : balance > 0 ? balance : bill.totalAmount,
      billId,
    } as MoneyForm)
  }

  function paymentLineFromBill(bill: Bill): PaymentLine {
    const balance = bill.payableBalance ?? 0
    const settlementAmount = balance > 0 ? balance : bill.totalAmount
    const amount = roundMoney(settlementAmount)
    return {
      ...newPaymentLine(),
      amount,
      approvalId: bill.approvalId ?? null,
      billText: paymentBillLabel(bill, partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'),
      billId: bill.id,
      supplierId: bill.supplierId ?? '',
      withholdingTax: 0,
    }
  }

  function syncPaymentLines(nextLines: PaymentLine[]) {
    const normalizedLines = nextLines.length > 0 ? nextLines.map((line) => ({
      ...line,
      amount: Number(line.amount) || 0,
      discount: 0,
      fee: 0,
      withholdingTax: 0,
    })) : [newPaymentLine()]
    const firstLine = normalizedLines[0]
    const firstLinePaymentMethod = normalizedPaymentMethod(billMap.get(firstLine?.billId ?? '')?.approvalPaymentMethod)
    const nextBalanceTotal = roundMoney(normalizedLines.reduce((sum, line) => sum + (billMap.get(line.billId)?.payableBalance ?? (Number(line.amount) || 0)), 0))
    const nextDiscount = Math.min(Number(form.discount) || 0, Math.max(0, nextBalanceTotal - 0.01))
    const nextAmount = roundMoney(Math.max(0, nextBalanceTotal - nextDiscount))
    const nextFee = Number(form.fee) || 0
    const nextNetAmount = roundMoney(nextAmount + nextFee)
    const nextSplits = ((form as SupplierPaymentFormValues).splits ?? []).map((split, splitIndex, splits) => (
      splitIndex === 0 && splits.length === 1 ? { ...split, amount: nextNetAmount } : split
    ))
    setForm({
      ...form,
      amount: nextAmount,
      billId: firstLine?.billId ?? '',
      discount: nextDiscount,
      fee: nextFee,
      lines: normalizedLines,
      method: firstLinePaymentMethod || form.method,
      splits: nextSplits,
      supplierId: firstLine?.supplierId ?? '',
      withholdingTax: 0,
    } as MoneyForm)
  }

  function updatePaymentForm(patch: Partial<SupplierPaymentFormValues>) {
    setError(null)
    const nextDiscount = 'discount' in patch ? Number(patch.discount) || 0 : Number(form.discount) || 0
    const nextFee = 'fee' in patch ? Number(patch.fee) || 0 : Number(form.fee) || 0
    const cappedDiscount = Math.min(nextDiscount, Math.max(0, paymentLineBalanceTotal - 0.01))
    const nextAmount = roundMoney(Math.max(0, paymentLineBalanceTotal - cappedDiscount))
    const nextNetAmount = roundMoney(nextAmount + nextFee)
    const nextSplits = paymentSplits.map((split, splitIndex, splits) => (
      splitIndex === 0 && splits.length === 1 ? { ...split, amount: nextNetAmount } : split
    ))
    setForm({
      ...form,
      ...patch,
      amount: nextAmount,
      discount: roundMoney(cappedDiscount),
      fee: roundMoney(nextFee),
      splits: nextSplits,
      withholdingTax: 0,
    } as MoneyForm)
  }

  function addPaymentLine() {
    syncPaymentLines([...paymentLines, newPaymentLine()])
  }

  function removePaymentLine(index: number) {
    if (paymentLines.length <= 1) return
    syncPaymentLines(paymentLines.filter((_, lineIndex) => lineIndex !== index))
  }

  function updatePaymentLine(index: number, patch: Partial<PaymentLine>) {
    setError(null)
    syncPaymentLines(paymentLines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)))
  }

  function selectPaymentLineBill(index: number, rawValue: string) {
    const bill = paymentSelectableBillsForLine(index).find((candidate) => (
      candidate.id === rawValue || rawValue.startsWith(candidate.docNo)
    ))
    if (!bill) {
      updatePaymentLine(index, { amount: 0, approvalId: null, billId: '', billText: rawValue, supplierId: '', withholdingTax: 0 })
      return
    }
    updatePaymentLine(index, paymentLineFromBill(bill))
  }

  function paymentSelectableBillsForLine(index: number) {
    const currentSelectionId = paymentLines[index]?.approvalId || paymentLines[index]?.billId || ''
    return paymentSelectableBills.filter((bill) => {
      const selectionId = paymentSelectionId(bill)
      return selectionId === currentSelectionId || !selectedPaymentBillIds.has(selectionId)
    })
  }

  function paymentLineInputValue(line: PaymentLine) {
    if (line.billText !== undefined) return line.billText
    const bill = billMap.get(line.billId)
    if (!bill) return ''
    return paymentBillLabel(bill, partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-')
  }

  function syncPaymentSplits(nextSplits: PaymentSplit[]) {
    const firstAccountId = nextSplits[0]?.accountId ?? ''
    setForm({ ...form, accountId: firstAccountId, splits: nextSplits } as MoneyForm)
  }

  function addPaymentSplit() {
    syncPaymentSplits([...paymentSplits, newPaymentSplit()])
  }

  function removePaymentSplit(index: number) {
    if (paymentSplits.length <= 1) return
    syncPaymentSplits(paymentSplits.filter((_, splitIndex) => splitIndex !== index))
  }

  function updatePaymentSplit(index: number, patch: Partial<PaymentSplit>) {
    setError(null)
    syncPaymentSplits(paymentSplits.map((split, splitIndex) => {
      if (splitIndex !== index) return split
      const nextSplit = { ...split, ...patch }
      if ('accountId' in patch && paymentSplits.length === 1 && (Number(nextSplit.amount) || 0) <= 0) {
        nextSplit.amount = formNetAmount
      }
      return nextSplit
    }))
  }

  function moneyInputValue(key: string, value: number) {
    if (Object.prototype.hasOwnProperty.call(moneyDrafts, key)) return moneyDrafts[key]
    return value ? formatMoney(value) : ''
  }

  function startMoneyInput(key: string, value: number) {
    setMoneyDrafts((current) => ({ ...current, [key]: value ? String(value) : '' }))
  }

  function changeMoneyInput(key: string, rawValue: string, onValue: (value: number) => void) {
    const nextValue = sanitizeMoneyInput(rawValue)
    setMoneyDrafts((current) => ({ ...current, [key]: nextValue }))
    onValue(parseMoneyInput(nextValue))
  }

  function finishMoneyInput(key: string) {
    setMoneyDrafts((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function normalizedPaymentForm() {
    const paymentForm = form as SupplierPaymentFormValues
    const normalizedSplits = (paymentForm.splits ?? []).map((split) => ({ ...split }))
    let remainingDiscount = Math.min(Number(paymentForm.discount) || 0, Math.max(0, paymentLineBalanceTotal - 0.01))
    const normalizedLines = (paymentForm.lines ?? []).filter((line) => {
      const lineBalance = billMap.get(line.billId)?.payableBalance ?? (Number(line.amount) || 0)
      return line.billId && lineBalance > 0
    })
    const payloadLines = normalizedLines.map((line, lineIndex) => {
      const selectedPma = billMap.get(line.billId)
      const lineBalance = roundMoney(selectedPma?.payableBalance ?? (Number(line.amount) || 0))
      const allocatedDiscount = roundMoney(Math.min(lineBalance - 0.01, remainingDiscount))
      remainingDiscount = roundMoney(remainingDiscount - allocatedDiscount)
      return {
        ...line,
        amount: roundMoney(lineBalance - allocatedDiscount),
        billId: selectedPma?.sourceDocNo ?? '',
        discount: allocatedDiscount,
        fee: lineIndex === 0 ? roundMoney(Number(paymentForm.fee) || 0) : 0,
        withholdingTax: 0,
      }
    })
    return {
      ...paymentForm,
      amount: roundMoney(payloadLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)),
      accountId: normalizedSplits[0]?.accountId ?? paymentForm.accountId,
      billId: payloadLines[0]?.billId ?? '',
      discount: roundMoney(payloadLines.reduce((sum, line) => sum + (Number(line.discount) || 0), 0)),
      fee: roundMoney(payloadLines.reduce((sum, line) => sum + (Number(line.fee) || 0), 0)),
      lines: payloadLines,
      method: paymentForm.method ?? '',
      splits: normalizedSplits,
      supplierId: payloadLines[0]?.supplierId ?? paymentForm.supplierId,
      withholdingTax: 0,
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSavingRef.current) return
    const payload = mode === 'payment' ? normalizedPaymentForm() : form
    const parsed = (mode === 'payment' ? supplierPaymentFormSchema : customerReceiptFormSchema).safeParse(payload)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      return
    }
    if (mode === 'payment' && Math.abs(paymentSplitTotal - formNetAmount) > 0.01) {
      setError('รวมยอดแยกบัญชีต้องเท่ากับยอดสุทธิที่ต้องจ่าย')
      return
    }
    isSavingRef.current = true
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson(apiPath, { body: JSON.stringify(parsed.data), method: 'POST' })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลไม่ได้')
    } finally {
      isSavingRef.current = false
      setIsSaving(false)
    }
  }

  async function cancelApprovedPaymentQueue() {
    if (!cancelApprovalTarget?.approvalId) return
    if (!cancelApprovalReason.trim()) {
      setError('กรุณาระบุเหตุผลการยกเลิก')
      return
    }
    setIsCancellingApproval(true)
    setError(null)
    try {
      await dailyFetchJson('/api/purchase/payments/cancel-approved', {
        body: JSON.stringify({
          approvalId: cancelApprovalTarget.approvalId,
          reason: cancelApprovalReason.trim(),
        }),
        method: 'POST',
      })
      setCancelApprovalTarget(null)
      setCancelApprovalReason('')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิกรายการรอจ่ายไม่ได้')
    } finally {
      setIsCancellingApproval(false)
    }
  }

  const billSortState = billSortParts()

  return (
    <section className="space-y-5">
      {error && !formOpen ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-5">
        <KpiCard label={mode === 'payment' ? 'จำนวนรายการ' : 'จำนวน Voucher'} value={rows.length.toLocaleString('th-TH')} tone="slate" />
        <KpiCard label={amountLabel} value={formatMoney(metrics.rowAmount)} tone={mode === 'payment' ? 'rose' : 'emerald'} />
        <KpiCard label="ยอดสุทธิ" value={formatMoney(metrics.rowNet)} tone="blue" />
        {mode === 'payment'
          ? <KpiCard label="Bank Fee" value={formatMoney(metrics.rowFee)} tone="amber" />
          : <KpiCard label="WHT / Fee" value={`${formatMoney(metrics.rowWht)} / ${formatMoney(metrics.rowFee)}`} tone="amber" />}
        <KpiCard label={balanceLabel} value={formatMoney(metrics.outstanding)} tone="violet" />
      </div>

      {showMoneyTabs ? (
        <Tabs
          className="gap-0"
          value={moneyTab}
          onValueChange={(value) => switchMoneyTab(value as ReceiptTab)}
        >
          <TabsList className="w-full" variant="line">
            <TabsTrigger value="entry" variant="line">{mode === 'payment' ? 'จ่ายเงิน Supplier' : 'รับเงิน Customer'}</TabsTrigger>
            <TabsTrigger value="history" variant="line">{mode === 'payment' ? 'ประวัติ' : 'ประวัติการรับเงิน'}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {mode === 'receipt' && showEntrySection ? (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-md bg-white p-3 shadow">
          <UiButton className="font-bold shadow" type="button" variant="default" onClick={openForm}>
            + รับเงิน Customer
          </UiButton>
        </div>
      ) : null}

      {mode === 'payment' && showEntrySection ? (
        <>
          <div className="space-y-2 rounded-md bg-white p-3 shadow">
            <div className="flex flex-wrap items-center gap-2">
              <UiInput
                className="h-9 min-w-[260px] flex-1 rounded-md"
                placeholder="ค้นหา PMA / บิล / เงินมัดจำ / ค่าใช้จ่าย / ผู้รับเงิน / ธนาคาร / เลขบัญชี"
                type="search"
                value={billSearch}
                onChange={(event) => setBillSearch(event.target.value)}
              />
              {hasActiveBillFilters ? (
                <UiButton
                  className="h-9 font-normal"
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setBillSearch('')
                    setBillSort('date_desc')
                  }}
                >
                  <X aria-hidden="true" className="mr-1 h-4 w-4" />
                  ล้าง
                </UiButton>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <div>พบทั้งหมด <span className="font-semibold text-slate-900">{supplierBillTotalRows}</span> รายการ</div>
            <div className="flex flex-wrap items-center gap-2">
              <UiSelect
                aria-label="จำนวนรายการต่อหน้า"
                className="h-9 w-auto min-w-[96px] px-2"
                value={billPageSize}
                onChange={(event) => setBillPageSize(Number(event.target.value))}
              >
                {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
              </UiSelect>
              <UiButton className="h-9 font-normal" disabled={supplierBillCurrentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setBillPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</UiButton>
              <span className="px-1">หน้า {supplierBillCurrentPage} / {supplierBillTotalPages}</span>
              <UiButton className="h-9 font-normal" disabled={supplierBillCurrentPage >= supplierBillTotalPages} size="sm" type="button" variant="outline" onClick={() => setBillPage((value) => Math.min(supplierBillTotalPages, value + 1))}>ถัดไป</UiButton>
            </div>
          </div>
          <Table className="min-w-[1220px] text-xs">
            <TableHeader className="text-slate-700">
              <tr>
                <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="เลขที่รายการ" sortKey="docNo" onSort={toggleBillSort} />
                <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="วันที่" sortKey="date" onSort={toggleBillSort} />
                <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="ผู้รับเงิน" sortKey="supplier" onSort={toggleBillSort} />
                <TableHead className="w-36 p-2 text-left text-xs font-semibold text-slate-700">ธนาคาร</TableHead>
                <TableHead className="p-2 text-left text-xs font-semibold text-slate-700">เลขบัญชี</TableHead>
                <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="ยอดรวม" sortKey="totalAmount" onSort={toggleBillSort} />
                <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="จ่ายแล้ว" sortKey="paidAmount" onSort={toggleBillSort} />
                <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="คงเหลือรอออก PMT" sortKey="balance" onSort={toggleBillSort} />
                <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="อายุ(วัน)" sortKey="age" onSort={toggleBillSort} />
                <TableHead className="w-28 p-2 text-center text-xs font-semibold text-slate-700" />
              </tr>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                {!isLoading && supplierBillPageRows.map((bill) => {
                  const balance = bill.payableBalance ?? 0
                  const supplier = supplierMap.get(bill.supplierId ?? '')
                  const supplierBankAccounts = approvalBankAccountLines(bill).length > 0 ? approvalBankAccountLines(bill) : supplierBankAccountLines(supplier, paymentMethods)
                  return (
                    <TableRow key={`${bill.id}:${bill.approvalId ?? 'no-approval'}`} className="cursor-pointer hover:bg-slate-50" onClick={() => openFormForBill(bill)}>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        <div>{bill.docNo}</div>
                        {bill.sourceDocNo && bill.sourceDocNo !== bill.docNo ? <div className="mt-1 font-sans text-[11px] font-normal text-slate-500">อ้างอิง {bill.sourceDocNo}</div> : null}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{formatDateDisplay(bill.date)}</TableCell>
                      <TableCell className="max-w-72 truncate text-xs font-semibold text-slate-700">{partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'}</TableCell>
                      <TableCell className="w-36 text-xs font-semibold text-slate-700">
                        {supplierBankAccounts.length > 0 ? (
                          <div className="space-y-1">
                            {supplierBankAccounts.map((account, index) => {
                              const accountKey = `${bill.id}-${account.accountNo}-${index}`
                              const bankLabel = account.bankName || '-'
                              return (
                                <div key={accountKey} className="whitespace-nowrap">
                                  {bankLabel}
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </TableCell>
                      <TableCell className="w-52 text-xs font-semibold text-slate-700">
                        {supplierBankAccounts.length > 0 ? (
                          <div className="space-y-1">
                            {supplierBankAccounts.map((account, index) => {
                              const accountKey = `${bill.id}-${account.accountNo}-${index}`
                              const copied = copiedAccountKey === accountKey
                              const label = formatAccountNoDisplay(account.accountNo) || account.accountNo
                              return (
                                <div key={accountKey} className="flex items-center gap-1">
                                  <span className="whitespace-nowrap">{label}</span>
                                  <button
                                    aria-label={`คัดลอกเลขบัญชี ${label}`}
                                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${copied ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-100'}`}
                                    title={copied ? 'คัดลอกแล้ว' : 'คัดลอกเลขบัญชี'}
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      void copyAccountNo(accountKey, account.accountNo)
                                    }}
                                  >
                                    <span className="sr-only">{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</span>
                                    {copied ? <Check aria-hidden="true" className="h-3 w-3" /> : <Copy aria-hidden="true" className="h-3 w-3" />}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </TableCell>
                      <TableCell className="w-40 whitespace-nowrap text-right text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(bill.totalAmount)}</TableCell>
                      <TableCell className="w-40 whitespace-nowrap text-right text-xs font-semibold text-blue-700 tabular-nums">{formatMoney(bill.paidAmount)}</TableCell>
                      <TableCell className={`w-40 whitespace-nowrap text-right text-xs font-semibold tabular-nums ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatMoney(balance)}</TableCell>
                      <TableCell className="w-20 whitespace-nowrap text-right text-xs font-semibold text-slate-700 tabular-nums">{ageInDays(bill.date)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openFormForBill(bill)
                            }}
                          >
                            ทำจ่าย
                          </button>
                          <button
                            className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={(bill.paidAmount ?? 0) > 0.01 || !bill.approvalId}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              setCancelApprovalTarget(bill)
                              setCancelApprovalReason('')
                              setError(null)
                            }}
                          >
                            ยกเลิก
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              {!isLoading && supplierBillPageRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={10}>ไม่พบ PMA ค้างจ่ายตามเงื่อนไข</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </>
      ) : null}

      {formOpen && showEntrySection ? (
        <Dialog open onOpenChange={(open) => {
          if (!open && !isSaving) setFormOpen(false)
        }}>
          <DialogContent className={`top-[max(2rem,50%)] max-h-[90vh] overflow-y-auto p-0 ${mode === 'payment' ? 'max-w-5xl' : 'max-w-4xl'}`} hideClose>
            <form noValidate onSubmit={save}>
            <DialogHeader className={`${mode === 'payment' ? 'bg-white text-slate-900' : theme.muted} flex-row items-center justify-between border-b px-5 py-4`}>
              <div>
                <DialogTitle className="font-bold">{mode === 'payment' ? 'สร้าง Payment Voucher' : title}</DialogTitle>
                {mode === 'payment' ? null : <p className="text-xs opacity-80">{subtitle}</p>}
              </div>
              <UiButton className="h-8 w-8 px-0 text-2xl text-slate-500" size="icon" type="button" variant="ghost" onClick={() => setFormOpen(false)}>&times;</UiButton>
            </DialogHeader>
            {error ? <div className="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
            {mode === 'payment' ? (
              <div className="flex flex-col gap-4 p-5 text-sm">
                <PaymentSplitsSection
                  activeAccounts={activeAccounts}
                  form={form}
                  formNetAmount={formNetAmount}
                  moneyInputValue={moneyInputValue}
                  paymentSplitTotal={paymentSplitTotal}
                  paymentSplits={paymentSplits}
                  onAddPaymentSplit={addPaymentSplit}
                  onChangeMoneyInput={changeMoneyInput}
                  onFinishMoneyInput={finishMoneyInput}
                  onRemovePaymentSplit={removePaymentSplit}
                  onStartMoneyInput={startMoneyInput}
                  onUpdatePaymentForm={updatePaymentForm}
                  onUpdatePaymentSplit={updatePaymentSplit}
                />

                <PaymentLinesSection
                  billMap={billMap}
                  isBillLocked={isBillLocked}
                  partyMap={partyMap}
                  paymentLineBalanceTotal={paymentLineBalanceTotal}
                  paymentLines={paymentLines}
                  paymentSelectableBills={paymentSelectableBills}
                  paymentSelectableBillsForLine={paymentSelectableBillsForLine}
                  paymentLineInputValue={paymentLineInputValue}
                  selectedBill={selectedBill ?? null}
                  onAddPaymentLine={addPaymentLine}
                  onRemovePaymentLine={removePaymentLine}
                  onSelectPaymentLineBill={selectPaymentLineBill}
                />

                <div className="order-4">
                  <Field label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => setForm({ ...form, notes: value })} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-4 p-5 md:grid-cols-2">
                  <Field label="วันที่" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} />
                  <BillSelect
                    bills={outstandingBills}
                    label="บิลขาย"
                    mode={mode}
                    partyMap={partyMap}
                    value={form.billId ?? ''}
                    onChange={selectBill}
                  />
                  <SelectField label={partyLabel} value={partyValue} onChange={(value) => setForm({ ...form, [partyKey]: value } as MoneyForm)} options={parties.filter((party) => party.active !== false)} />
                  <SelectField label={accountLabel} value={form.accountId} onChange={(value) => setForm({ ...form, accountId: value })} options={activeAccounts} />
                  <Field label={amountLabel} type="number" value={String(form.amount)} onChange={(value) => setForm({ ...form, amount: Number(value) })} />
                  <Field label="WHT" type="number" value={String(form.withholdingTax)} onChange={(value) => setForm({ ...form, withholdingTax: Number(value) })} />
                  <Field label="ส่วนลด" type="number" value={String(form.discount)} onChange={(value) => setForm({ ...form, discount: Number(value) })} />
                  <Field label="ค่าธรรมเนียม" type="number" value={String(form.fee)} onChange={(value) => setForm({ ...form, fee: Number(value) })} />
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-600">วิธีจ่าย/รับเงิน</span>
                    <UiSelect className="h-9 rounded-md border px-2 py-1.5 text-sm" value={form.method ?? ''} onChange={(event) => setForm({ ...form, method: event.target.value })}>
                      <option value="">ไม่ระบุ</option>
                      {paymentMethods.map((method) => (
                        <option key={method.name} value={method.name}>{method.name}</option>
                      ))}
                    </UiSelect>
                  </label>
                  <Field label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => setForm({ ...form, notes: value })} />
                </div>
                <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 md:grid-cols-4">
                  <SummaryPill label={amountLabel} value={formatMoney(form.amount)} />
                  <SummaryPill label="WHT" value={formatMoney(form.withholdingTax)} />
                  <SummaryPill label="Fee / Discount" value={`${formatMoney(form.fee)} / ${formatMoney(form.discount)}`} />
                  <SummaryPill label="Net" value={formatMoney(formNetAmount)} />
                </div>
              </>
            )}
            <DialogFooter className="border-t px-5 py-4">
              <UiButton className="font-normal text-slate-600" type="button" variant="ghost" onClick={() => setFormOpen(false)}>ยกเลิก</UiButton>
              <UiButton className={`px-5 font-semibold text-white disabled:opacity-60 ${theme.action}`} disabled={isSaving} type="submit" variant="default">บันทึก</UiButton>
            </DialogFooter>
          </form>
        </DialogContent>
        </Dialog>
      ) : null}

      {showHistorySection ? (
        <>
          <div className="space-y-2 rounded-md bg-white p-3 shadow">
            <div className="flex flex-wrap items-center gap-2">
              <UiInput
                className="h-9 min-w-[260px] flex-1 rounded-md"
                placeholder={mode === 'payment' ? 'ค้นหาเลข PMT / PMA / บิล / ผู้รับเงิน / บัญชี / หมายเหตุ' : 'ค้นหาเลขที่ / ชื่อ / บัญชี / หมายเหตุ'}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {mode === 'receipt' && !showReceiptTabs ? (
                <UiButton className="h-9 font-bold shadow" size="sm" type="button" variant="default" onClick={openForm}>
                  + รับเงิน Customer
                </UiButton>
              ) : null}
              <label className="text-xs text-slate-500">วันที่:</label>
              <DatePickerInput className="h-9 w-[130px]" id={`${mode}-history-date-from`} value={dateFrom} onChange={setDateFrom} />
              <span className="text-slate-400">→</span>
              <DatePickerInput className="h-9 w-[130px]" id={`${mode}-history-date-to`} value={dateTo} onChange={setDateTo} />
              <span className="text-xs text-slate-500">บัญชี:</span>
              <UiSelect className="h-9 w-auto min-w-[180px] px-2 py-1" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                <option value="">ทุกบัญชี</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </UiSelect>
              {hasActiveHistoryFilters ? (
                <UiButton className="h-9 font-normal" size="sm" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</UiButton>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {mode === 'payment' ? (
                <>
                  <span className="text-xs text-slate-500">สถานะ:</span>
                  {([
                    { label: 'ทั้งหมด', value: 'all' },
                    { label: 'จ่ายแล้ว', value: 'active' },
                    { label: 'ยกเลิก', value: 'cancelled' },
                  ] as Array<{ label: string; value: PaymentHistoryStatusFilter }>).map((option) => {
                    const active = paymentHistoryStatusFilter === option.value
                    return (
                      <button
                        key={option.value}
                        className={`rounded-md border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                        type="button"
                        onClick={() => setPaymentHistoryStatusFilter(option.value)}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </>
              ) : null}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <div>พบทั้งหมด <span className="font-semibold text-slate-900">{historyTotalRows}</span> รายการ</div>
              <div className="flex flex-wrap items-center gap-2">
                <UiSelect
                  aria-label="จำนวนรายการต่อหน้าประวัติ"
                  className="h-9 w-auto min-w-[96px] px-2"
                  value={historyPageSize}
                  onChange={(event) => setHistoryPageSize(Number(event.target.value))}
                >
                  {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
                </UiSelect>
                <UiButton className="font-normal" disabled={historyCurrentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setHistoryPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</UiButton>
                <span className="px-1">หน้า {historyCurrentPage} / {historyTotalPages}</span>
                <UiButton className="font-normal" disabled={historyCurrentPage >= historyTotalPages} size="sm" type="button" variant="outline" onClick={() => setHistoryPage((value) => Math.min(historyTotalPages, value + 1))}>ถัดไป</UiButton>
              </div>
            </div>

            <Table className={mode === 'payment' ? 'min-w-[1180px] text-xs' : 'min-w-[1260px] text-xs'}>
              <TableHeader className="text-slate-700">
                <tr>
                  <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label="เลขที่รายการ" sortKey="docNo" onSort={toggleHistorySort} />
                  <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label="วันที่สร้างรายการ" sortKey="date" onSort={toggleHistorySort} />
                  <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label={partyLabel} sortKey="partyName" onSort={toggleHistorySort} />
                  <TableHead className="p-2 text-left text-xs font-semibold text-slate-700">บิลอ้างอิง</TableHead>
                  <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label="บัญชีที่ใช้ทำจ่าย" sortKey="accountName" onSort={toggleHistorySort} />
                  <TableSortHeader activeKey={historySortField} align="right" direction={historySortDirection} label={amountLabel} sortKey="amount" onSort={toggleHistorySort} />
                  <TableHead className="w-40 p-2 text-right text-xs font-semibold text-slate-700">WHT</TableHead>
                  <TableHead className="w-40 p-2 text-right text-xs font-semibold text-slate-700">Bank Fee</TableHead>
                  <TableSortHeader activeKey={historySortField} align="right" direction={historySortDirection} label="สุทธิ" sortKey="netAmount" onSort={toggleHistorySort} />
                  {mode === 'payment' ? <TableHead className="p-2 text-left text-xs font-semibold text-slate-700">สถานะ</TableHead> : null}
                  <TableHead className="p-2 text-left text-xs font-semibold text-slate-700">หมายเหตุ</TableHead>
                  {mode === 'receipt' ? <TableHead className="p-2 text-center text-xs font-semibold text-slate-700">Action</TableHead> : null}
                </tr>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                  {!isLoading && historyPageRows.map((row) => {
                    const billDocNos = row.billDocNos?.length ? row.billDocNos : [row.billId ? (billMap.get(row.billId)?.docNo ?? row.billDocNo ?? row.billId) : (row.billDocNo ?? '-')]
                    const accountSummaries = row.accountSummaries?.length ? row.accountSummaries : [row.accountName]
                    const clickable = mode === 'payment'
                    return (
                      <TableRow
                        key={row.id}
                        className={`hover:bg-slate-50 ${clickable ? 'cursor-pointer' : ''}`}
                        onClick={clickable ? () => void openPaymentHistoryRow(row) : undefined}
                      >
                        <TableCell className="text-xs font-semibold text-slate-700">{row.docNo}</TableCell>
                        <TableCell className="text-xs font-semibold text-slate-700">{formatDateDisplay(row.date)}</TableCell>
                        <TableCell className="text-xs font-semibold text-slate-700">{row.partyName}</TableCell>
                        <TableCell className="text-xs font-semibold text-slate-700">
                          <div className="space-y-1">
                            <div className="font-semibold text-slate-700">{billDocNos.length.toLocaleString('th-TH')} บิล</div>
                            {billDocNos.map((docNo) => <div key={`${row.id}-bill-${docNo}`} className="text-slate-700">{docNo}</div>)}
                            {mode === 'payment' && row.approvalIds?.length ? (
                              <div className="pt-1 text-[11px] text-slate-500">
                                PMA: {row.approvalIds.map((approvalId, index) => (
                                  <span key={`${row.id}-approval-${approvalId}`}>
                                    {index > 0 ? ', ' : ''}
                                    <span className="text-slate-700">{approvalId}</span>
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-slate-700">
                          <div className="space-y-1">
                            <div className="font-semibold text-slate-700">{accountSummaries.length.toLocaleString('th-TH')} บัญชี</div>
                            {accountSummaries.map((summary) => <div key={`${row.id}-account-${summary}`} className="whitespace-nowrap">{summary}</div>)}
                          </div>
                        </TableCell>
                        <TableCell className="w-44 whitespace-nowrap text-right text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.amount)}</TableCell>
                        <TableCell className="w-40 whitespace-nowrap text-right text-xs font-semibold text-amber-700 tabular-nums">{formatMoney(row.withholdingTax)}</TableCell>
                        <TableCell className="w-40 whitespace-nowrap text-right text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.fee)}</TableCell>
                        <TableCell className={`w-44 whitespace-nowrap text-right text-xs font-semibold tabular-nums ${theme.strong}`}>{formatMoney(row.netAmount)}</TableCell>
                        {mode === 'payment' ? (
                          <TableCell>
                            <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${paymentHistoryStatusTone(row.status)}`}>
                              <span className={`size-1.5 rounded-full ${paymentHistoryStatusDot(row.status)}`} />
                              <span>{paymentHistoryStatusLabel(row.status)}</span>
                            </div>
                          </TableCell>
                        ) : null}
                        <TableCell className="max-w-56 truncate text-xs font-semibold text-slate-700">{row.notes || '-'}</TableCell>
                        {mode === 'receipt' ? (
                          <TableCell className="text-center">
                            <UiButton className="font-normal text-slate-400" disabled size="xs" type="button" variant="outline">ดู/พิมพ์</UiButton>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })}
                {!isLoading && historyPageRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={11}>ยังไม่มีรายการ</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}

      {mode === 'payment' ? (
        <PaymentHistoryDetailDialog
          detail={paymentDetail}
          error={paymentDetailError}
          isLoading={isPaymentDetailLoading}
          open={paymentDetailOpen}
          row={paymentDetailRow}
          onOpenChange={(open) => {
            setPaymentDetailOpen(open)
            if (!open) {
              setPaymentDetailRow(null)
              setPaymentDetail(null)
              setPaymentDetailError(null)
            }
          }}
        />
      ) : null}

      {mode === 'payment' && !historyOnly && cancelApprovalTarget ? (
        <Dialog open onOpenChange={(open) => {
          if (!open && !isCancellingApproval) {
            setCancelApprovalTarget(null)
            setCancelApprovalReason('')
          }
        }}>
          <DialogContent className="max-w-lg p-0" hideClose>
            <DialogHeader className="border-b px-5 py-4">
              <DialogTitle className="font-bold text-slate-900">ยกเลิกรายการรอจ่าย</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 px-5 py-4 text-sm">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
                <div><span className="font-semibold">เลขที่รายการ:</span> {cancelApprovalTarget.docNo}</div>
                {cancelApprovalTarget.sourceDocNo && cancelApprovalTarget.sourceDocNo !== cancelApprovalTarget.docNo ? (
                  <div><span className="font-semibold">เอกสารต้นทาง:</span> {cancelApprovalTarget.sourceDocNo}</div>
                ) : null}
                <div><span className="font-semibold">{partyLabel}:</span> {partyMap.get(cancelApprovalTarget.supplierId ?? '') ?? cancelApprovalTarget.supplierId ?? '-'}</div>
                <div><span className="font-semibold">ยอดคงเหลือ:</span> {formatMoney(cancelApprovalTarget.payableBalance ?? 0)}</div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">เหตุผลการยกเลิก</span>
                <textarea
                  className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
                  placeholder="ระบุเหตุผลการยกเลิกรายการรอจ่าย"
                  value={cancelApprovalReason}
                  onChange={(event) => setCancelApprovalReason(event.target.value)}
                />
              </label>
            </div>
            <DialogFooter className="border-t px-5 py-4">
              <UiButton
                className="font-normal text-slate-600"
                disabled={isCancellingApproval}
                type="button"
                variant="ghost"
                onClick={() => {
                  setCancelApprovalTarget(null)
                  setCancelApprovalReason('')
                }}
              >
                ปิด
              </UiButton>
              <UiButton
                className="bg-rose-600 px-5 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                disabled={isCancellingApproval || !cancelApprovalReason.trim()}
                type="button"
                variant="default"
                onClick={() => void cancelApprovedPaymentQueue()}
              >
                ยืนยันยกเลิกรายการรอจ่าย
              </UiButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

    </section>
  )
}

function PaymentHistoryDetailDialog({
  detail,
  error,
  isLoading,
  onOpenChange,
  open,
  row,
}: {
  detail: PaymentHistoryDetail | null
  error: string | null
  isLoading: boolean
  onOpenChange: (open: boolean) => void
  open: boolean
  row: MoneyRow | null
}) {
  const summary = detail?.summary
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto bg-slate-50 p-0" fallbackTitle="รายละเอียดการจ่ายเงิน" hideClose>
        <DialogHeader className="flex-row items-center justify-between gap-3 border-b bg-white px-5 py-4">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-bold text-slate-900">{detail?.heading ?? 'รายละเอียดการจ่ายเงิน'}</DialogTitle>
            <div className="mt-1 truncate font-mono text-xs text-slate-500">{detail?.docNo ?? row?.docNo ?? '-'}</div>
          </div>
          <UiButton
            aria-label="ปิดรายละเอียด"
            className="h-9 w-9 shrink-0 px-0 text-slate-600"
            size="icon"
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </UiButton>
        </DialogHeader>

        <div className="space-y-4 p-5 text-sm">
          {isLoading ? <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow">กำลังโหลดรายละเอียด</div> : null}
          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> : null}
          {!isLoading && !error && detail && summary ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-md bg-white p-3 shadow">
                  <div className="text-xs text-slate-500">{detail.type === 'approval' ? 'ยอดอนุมัติ' : 'ยอดจ่าย'}</div>
                  <div className="text-lg font-bold text-slate-900">{formatMoney(summary.amount)}</div>
                </div>
                <div className="rounded-md bg-white p-3 shadow">
                  <div className="text-xs text-slate-500">สถานะ</div>
                  <div className={`text-lg font-bold ${detailToneTextClass(detail.latestTone)}`}>{detail.latestStatusLabel}</div>
                </div>
                {detail.type === 'approval' ? (
                  <>
                    <div className="rounded-md bg-white p-3 shadow">
                      <div className="text-xs text-slate-500">วันที่อนุมัติ</div>
                      <div className="text-lg font-bold text-slate-900">{summary.approvedAt ?? '-'}</div>
                    </div>
                    <div className="rounded-md bg-white p-3 shadow">
                      <div className="text-xs text-slate-500">วันที่ปิดรายการ</div>
                      <div className={`text-lg font-bold ${detailToneTextClass(detail.latestTone)}`}>{summary.closedAt ?? '-'}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-md bg-white p-3 shadow">
                      <div className="text-xs text-slate-500">WHT / Bank Fee</div>
                      <div className="text-lg font-bold text-slate-900">{formatMoney(summary.withholdingTax)} / {formatMoney(summary.fee)}</div>
                    </div>
                    <div className="rounded-md bg-white p-3 shadow">
                      <div className="text-xs text-slate-500">สุทธิ</div>
                      <div className={`text-lg font-bold ${detailToneTextClass(detail.latestTone)}`}>{formatMoney(summary.netAmount)}</div>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {detail.detailCards.map((card) => (
                  <div key={`${card.label}-${card.value}`} className="rounded-md border border-slate-200 bg-white p-3">
                    <div className="text-xs text-slate-500">{card.label}</div>
                    <div className="mt-1 text-sm font-medium text-slate-900">{card.value}</div>
                  </div>
                ))}
              </div>

              <div className="overflow-hidden rounded-md bg-white shadow">
                <div className="border-b px-4 py-3">
                  <h2 className="font-semibold text-slate-900">{detail.type === 'approval' ? 'PMT ที่ใช้รายการนี้' : 'รายการที่ทำจ่าย'}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="p-2 text-left">{detail.type === 'approval' ? 'PMT' : 'PMA'}</th>
                        <th className="p-2 text-left">เอกสารต้นทาง</th>
                        <th className="p-2 text-right">ยอดจัดสรร</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.approvalRows.map((approval) => (
                        <tr key={`${approval.docNo}-${approval.sourceDocNo}`} className="border-t">
                          <td className="p-2 font-mono text-slate-800">{approval.docNo}</td>
                          <td className="p-2 font-mono">{approval.sourceDocNo}</td>
                          <td className="p-2 text-right font-medium tabular-nums">{formatMoney(approval.amount)}</td>
                        </tr>
                      ))}
                      {detail.approvalRows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={3}>ยังไม่มีรายการทำจ่าย</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>

              {detail.type === 'payment' ? (
                <div className="overflow-hidden rounded-md bg-white shadow">
                  <div className="border-b px-4 py-3">
                    <h2 className="font-semibold text-slate-900">บัญชีที่ใช้ทำจ่าย</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100">
                        <tr>
                          <th className="p-2 text-left">บัญชี</th>
                          <th className="p-2 text-left">รายการธนาคาร</th>
                          <th className="p-2 text-right">ยอด</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.accountRows.map((account) => (
                          <tr key={`${account.accountName}-${account.bankStatementDocNo}-${account.amount}`} className="border-t">
                            <td className="p-2">{account.accountName}</td>
                            <td className="p-2 font-mono">{account.bankStatementDocNo}</td>
                            <td className="p-2 text-right font-medium tabular-nums">{formatMoney(account.amount)}</td>
                          </tr>
                        ))}
                        {detail.accountRows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={3}>ยังไม่มีข้อมูลบัญชีจ่าย</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <section className="rounded-md bg-white p-4 shadow">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-medium text-slate-700">{detail.timelineTitle}</h2>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${detailToneTextClass(detail.latestTone)}`}>
                    <span className="size-1.5 rounded-full bg-current" />
                    ล่าสุด: {detail.latestStatusLabel}
                  </span>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  {detail.timeline.length === 0 ? (
                    <div className="text-sm text-slate-500">ยังไม่มีประวัติ</div>
                  ) : (
                    <div className="space-y-3">
                      {[...detail.timeline].reverse().map((event, index) => {
                        const isLatest = index === 0
                        return (
                          <div key={`${event.title}-${event.at}-${index}`} className="grid grid-cols-[88px_1fr] gap-3 sm:grid-cols-[128px_1fr]">
                            <div className="pt-1 text-right text-xs text-slate-500">
                              <div>{formatTimelineDate(event.at)}</div>
                              <div className="mt-1 truncate text-[11px]">{event.actor || '-'}</div>
                            </div>
                            <div className="relative border-l border-slate-200 pb-4 pl-4 last:pb-0">
                              <span className={`absolute -left-1.5 top-1 h-3 w-3 rounded-full border-2 border-white ${isLatest ? detailDotClass(event.tone) : 'bg-slate-300'}`} />
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-medium text-slate-800">{event.title}</div>
                                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${detailToneTextClass(event.tone)}`}>
                                  <span className="size-1.5 rounded-full bg-current" />
                                  {event.pillLabel}
                                </span>
                              </div>
                              {event.transition ? <div className="mt-1 text-xs text-slate-500">{event.transition}</div> : null}
                              {event.details.length > 0 ? (
                                <div className="mt-2 grid gap-1 rounded-md bg-white px-3 py-2 text-xs text-slate-600">
                                  {event.details.map((line) => <div key={line}>{line}</div>)}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </section>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function paymentBillStatus(bill: Bill) {
  const rawStatus = String(bill.status ?? '').toLowerCase()
  if (rawStatus.includes('cancel')) return 'cancelled'
  const paid = bill.paidAmount ?? 0
  const balance = bill.payableBalance ?? 0
  if (balance <= 0.01 && paid > 0) return 'paid'
  if (paid > 0 && balance > 0.01) return 'partial'
  return 'open'
}

function KpiCard({ label, tone, value }: { label: string; tone: 'amber' | 'blue' | 'emerald' | 'rose' | 'slate' | 'violet'; value: string }) {
  const tones = {
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    rose: 'text-rose-700',
    slate: 'text-slate-900',
    violet: 'text-violet-700',
  }
  return <div className="rounded-md bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 break-words text-lg font-bold ${tones[tone]}`}>{value}</div></div>
}
