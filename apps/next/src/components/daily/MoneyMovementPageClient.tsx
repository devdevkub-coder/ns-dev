'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { paymentMethodGroupFromValue, type PaymentMethodGroup } from '@/lib/account-payment-method'
import { BillSelect, Field, SelectField, SummaryPill } from '@/components/daily/MoneyMovementFieldHelpers'
import { PaymentLinesSection, PaymentSplitsSection } from '@/components/daily/MoneyMovementFormSections'
import { Button as UiButton } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input as UiInput } from '@/components/ui/Input'
import { Select as UiSelect } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
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
  voucherId?: string
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

type MoneyForm = SupplierPaymentFormValues | CustomerReceiptFormValues
type PaymentLine = NonNullable<SupplierPaymentFormValues['lines']>[number] & { billText?: string }
type PaymentSplit = SupplierPaymentFormValues['splits'][number]
type HistorySortField = 'accountName' | 'amount' | 'date' | 'docNo' | 'netAmount' | 'partyName'
type PaymentHistoryStatusFilter = 'active' | 'all' | 'cancelled'
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

function paymentCashAmountFromSettlement(totalAmount: number, ratePercent: number) {
  if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent >= 100) return roundMoney(totalAmount)
  return roundMoney(totalAmount * (100 - ratePercent) / 100)
}

function withholdingTaxFromCashAmount(amount: number, ratePercent: number) {
  if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent >= 100) return 0
  return roundMoney(amount * ratePercent / (100 - ratePercent))
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

export function MoneyMovementPageClient({
  entryOnly = false,
  historyOnly = false,
  mode,
}: {
  entryOnly?: boolean
  historyOnly?: boolean
  mode: 'payment' | 'receipt'
}) {
  const [data, setData] = useState<Payload>({ accounts: [], bills: [], rows: [] })
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const [billSearch, setBillSearch] = useState('')
  const [billPage, setBillPage] = useState(1)
  const [billPageSize, setBillPageSize] = useState(25)
  const [billSort, setBillSort] = useState<'age_desc' | 'balance_desc' | 'date_desc' | 'date_asc' | 'doc_desc' | 'supplier_asc'>('age_desc')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(10)
  const [historySortField, setHistorySortField] = useState<HistorySortField>(mode === 'payment' ? 'date' : 'docNo')
  const [historySortDirection, setHistorySortDirection] = useState<'asc' | 'desc'>('desc')
  const [paymentHistoryStatusFilter, setPaymentHistoryStatusFilter] = useState<PaymentHistoryStatusFilter>('all')
  const [form, setForm] = useState<MoneyForm>(() => initialForm(mode))
  const [isBillLocked, setIsBillLocked] = useState(false)
  const [moneyDrafts, setMoneyDrafts] = useState<Record<string, string>>({})
  const [copiedAccountKey, setCopiedAccountKey] = useState<string | null>(null)
  const [cancelApprovalReason, setCancelApprovalReason] = useState('')
  const [cancelApprovalTarget, setCancelApprovalTarget] = useState<Bill | null>(null)
  const [isCancellingApproval, setIsCancellingApproval] = useState(false)

  const apiPath = historyOnly && mode === 'payment'
    ? '/api/purchase/payment-history'
    : mode === 'payment'
      ? '/api/purchase/payments'
      : '/api/sales/receipts'
  const partyKey = mode === 'payment' ? 'supplierId' : 'customerId'
  const parties = useMemo(() => (mode === 'payment' ? data.suppliers ?? [] : data.customers ?? []), [data.customers, data.suppliers, mode])
  const paymentMethods = useMemo(() => data.paymentMethods ?? [], [data.paymentMethods])
  const theme = mode === 'payment' ? paymentTheme : receiptTheme
  const title = mode === 'payment' ? 'จ่ายเงิน Supplier' : 'รับเงิน Customer'
  const subtitle = mode === 'payment' ? 'Payment Voucher' : 'Receipt Voucher'
  const amountLabel = mode === 'payment' ? 'ยอดจ่าย' : 'ยอดรับ'
  const accountLabel = mode === 'payment' ? 'บัญชีจ่าย' : 'บัญชีรับ'
  const partyLabel = mode === 'payment' ? 'ผู้ขาย' : 'ลูกค้า'
  const balanceLabel = mode === 'payment' ? 'ค้างจ่าย' : 'ค้างรับ'
  const whtRatePercent = mode === 'payment' ? data.settings?.whtRatePercent ?? 0 : 0
  const partyValue = mode === 'payment'
    ? (form as SupplierPaymentFormValues).supplierId
    : (form as CustomerReceiptFormValues).customerId
  const showEntrySection = !historyOnly
  const showHistorySection = !entryOnly

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
  const formNetAmount = mode === 'payment'
    ? form.amount + form.fee
    : form.amount - form.fee - form.withholdingTax - form.discount
  const paymentSplits = mode === 'payment' ? (form as SupplierPaymentFormValues).splits ?? [] : []
  const paymentSplitTotal = paymentSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0)
  const paymentLineBalanceTotal = paymentLines.reduce((sum, line) => sum + (billMap.get(line.billId)?.payableBalance ?? 0), 0)

  const outstandingBills = useMemo(() => data.bills
    .filter((bill) => (mode === 'payment' ? (bill.payableBalance ?? 0) > 0 : (bill.receivableBalance ?? 0) > 0))
    .slice(0, 500), [data.bills, mode])
  const paymentSupplierId = mode === 'payment'
    ? paymentLines.find((line) => line.supplierId)?.supplierId ?? (form as SupplierPaymentFormValues).supplierId
    : ''
  const paymentSelectableBills = useMemo(() => {
    if (mode !== 'payment' || !paymentSupplierId) return outstandingBills
    return outstandingBills.filter((bill) => bill.supplierId === paymentSupplierId)
  }, [mode, outstandingBills, paymentSupplierId])
  const selectedPaymentBillIds = useMemo(() => new Set(paymentLines.map((line) => line.billId).filter(Boolean)), [paymentLines])
  const supplierBills = useMemo(() => {
    if (mode !== 'payment') return []
    const query = billSearch.trim().toLowerCase()
    return data.bills.filter((bill) => {
      const supplierName = partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? ''
      const balance = bill.payableBalance ?? 0
      const status = paymentBillStatus(bill)
      const supplier = supplierMap.get(bill.supplierId ?? '')
      const supplierBankAccounts = supplierBankAccountLines(supplier, paymentMethods)
      const searchHaystack = `${bill.docNo} ${supplierName} ${bill.date ?? ''} ${supplierBankAccounts.map((account) => `${account.bankName} ${account.accountNo}`).join(' ')}`.toLowerCase()
      const matchesSearch = !query || searchHaystack.includes(query)
      const matchesStatus = balance > 0 && status !== 'cancelled'
      return matchesSearch && matchesStatus
    }).sort((left, right) => {
      const leftSupplierName = partyMap.get(left.supplierId ?? '') ?? left.supplierId ?? ''
      const rightSupplierName = partyMap.get(right.supplierId ?? '') ?? right.supplierId ?? ''
      switch (billSort) {
        case 'date_asc':
          return String(left.date ?? '').localeCompare(String(right.date ?? ''))
        case 'date_desc':
          return String(right.date ?? '').localeCompare(String(left.date ?? ''))
        case 'balance_desc':
          return (right.payableBalance ?? 0) - (left.payableBalance ?? 0)
        case 'doc_desc':
          return right.docNo.localeCompare(left.docNo)
        case 'supplier_asc':
          return leftSupplierName.localeCompare(rightSupplierName, 'th')
        case 'age_desc':
        default:
          return ageInDays(right.date) - ageInDays(left.date)
      }
    })
  }, [billSearch, billSort, data.bills, mode, partyMap, paymentMethods, supplierMap])

  const supplierBillTotalRows = supplierBills.length
  const supplierBillTotalPages = Math.max(1, Math.ceil(supplierBillTotalRows / billPageSize))
  const supplierBillCurrentPage = Math.min(billPage, supplierBillTotalPages)
  const supplierBillPageRows = supplierBills.slice((supplierBillCurrentPage - 1) * billPageSize, supplierBillCurrentPage * billPageSize)
  useEffect(() => {
    setBillPage(1)
  }, [billSearch, billPageSize, billSort])

  useEffect(() => {
    if (billPage > supplierBillTotalPages) setBillPage(supplierBillTotalPages)
  }, [billPage, supplierBillTotalPages])

  useEffect(() => {
    if (mode !== 'payment') return
    setForm((current) => {
      const nextWithholdingTax = withholdingTaxFromCashAmount(current.amount, whtRatePercent)
      if (Math.abs(current.withholdingTax - nextWithholdingTax) < 0.005) return current
      return { ...current, withholdingTax: nextWithholdingTax } as MoneyForm
    })
  }, [form.amount, mode, whtRatePercent])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.rows.filter((row) => {
      const matchesSearch = !query || `${row.docNo} ${row.partyName} ${row.accountName} ${(row.accountNames ?? []).join(' ')} ${(row.billDocNos ?? []).join(' ')} ${row.notes}`.toLowerCase().includes(query)
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
    setForm({
      ...initialForm(mode),
      amount: paymentCashAmountFromSettlement(settlementAmount, whtRatePercent),
      billId: bill.id,
      lines: [{
        ...newPaymentLine(),
        amount: paymentCashAmountFromSettlement(settlementAmount, whtRatePercent),
        approvalId: bill.approvalId ?? null,
        billText: `${bill.docNo} | ${partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'} | ค้าง ${formatMoney(balance)}`,
        billId: bill.id,
        supplierId: bill.supplierId ?? '',
        withholdingTax: withholdingTaxFromCashAmount(paymentCashAmountFromSettlement(settlementAmount, whtRatePercent), whtRatePercent),
      }],
      method: bill.approvalPaymentMethod ?? '',
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

  function historySortLabel(field: HistorySortField) {
    if (historySortField !== field) return ' ↕'
    return historySortDirection === 'asc' ? ' ↑' : ' ↓'
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
        ? paymentCashAmountFromSettlement(balance > 0 ? balance : bill.totalAmount, whtRatePercent)
        : balance > 0 ? balance : bill.totalAmount,
      billId,
    } as MoneyForm)
  }

  function paymentLineFromBill(bill: Bill): PaymentLine {
    const balance = bill.payableBalance ?? 0
    const settlementAmount = balance > 0 ? balance : bill.totalAmount
    const amount = paymentCashAmountFromSettlement(settlementAmount, whtRatePercent)
    return {
      ...newPaymentLine(),
      amount,
      approvalId: bill.approvalId ?? null,
      billText: `${bill.docNo} | ${partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'} | ค้าง ${formatMoney(bill.payableBalance ?? 0)}`,
      billId: bill.id,
      supplierId: bill.supplierId ?? '',
      withholdingTax: withholdingTaxFromCashAmount(amount, whtRatePercent),
    }
  }

  function syncPaymentLines(nextLines: PaymentLine[]) {
    const normalizedLines = nextLines.length > 0 ? nextLines.map((line) => ({
      ...line,
      amount: Number(line.amount) || 0,
      discount: Number(line.discount) || 0,
      fee: Number(line.fee) || 0,
      withholdingTax: withholdingTaxFromCashAmount(Number(line.amount) || 0, whtRatePercent),
    })) : [newPaymentLine()]
    const firstLine = normalizedLines[0]
    setForm({
      ...form,
      amount: roundMoney(normalizedLines.reduce((sum, line) => sum + line.amount, 0)),
      billId: firstLine?.billId ?? '',
      discount: roundMoney(normalizedLines.reduce((sum, line) => sum + line.discount, 0)),
      fee: roundMoney(normalizedLines.reduce((sum, line) => sum + line.fee, 0)),
      lines: normalizedLines,
      supplierId: firstLine?.supplierId ?? '',
      withholdingTax: roundMoney(normalizedLines.reduce((sum, line) => sum + line.withholdingTax, 0)),
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
    syncPaymentLines(paymentLines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)))
  }

  function selectPaymentLineBill(index: number, rawValue: string) {
    const docNo = rawValue.split('|')[0]?.trim()
    const bill = paymentSelectableBillsForLine(index).find((candidate) => candidate.id === rawValue || candidate.docNo === docNo)
    if (!bill) {
      updatePaymentLine(index, { amount: 0, approvalId: null, billId: '', billText: rawValue, supplierId: '', withholdingTax: 0 })
      return
    }
    updatePaymentLine(index, paymentLineFromBill(bill))
  }

  function paymentSelectableBillsForLine(index: number) {
    const currentBillId = paymentLines[index]?.billId ?? ''
    return paymentSelectableBills.filter((bill) => bill.id === currentBillId || !selectedPaymentBillIds.has(bill.id))
  }

  function paymentLineInputValue(line: PaymentLine) {
    if (line.billText !== undefined) return line.billText
    const bill = billMap.get(line.billId)
    if (!bill) return ''
    return `${bill.docNo} | ${partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'} | ค้าง ${formatMoney(bill.payableBalance ?? 0)}`
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
    syncPaymentSplits(paymentSplits.map((split, splitIndex) => (splitIndex === index ? { ...split, ...patch } : split)))
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
    const normalizedLines = (paymentForm.lines ?? []).filter((line) => line.billId && (Number(line.amount) || 0) > 0)
    if (normalizedSplits.length === 1 && normalizedSplits[0]?.accountId && (Number(normalizedSplits[0].amount) || 0) <= 0) {
      normalizedSplits[0].amount = formNetAmount
    }
    return {
      ...paymentForm,
      amount: roundMoney(normalizedLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0)),
      accountId: normalizedSplits[0]?.accountId ?? paymentForm.accountId,
      billId: normalizedLines[0]?.billId ?? paymentForm.billId,
      discount: roundMoney(normalizedLines.reduce((sum, line) => sum + (Number(line.discount) || 0), 0)),
      fee: roundMoney(normalizedLines.reduce((sum, line) => sum + (Number(line.fee) || 0), 0)),
      lines: normalizedLines,
      method: paymentForm.method ?? '',
      splits: normalizedSplits,
      supplierId: normalizedLines[0]?.supplierId ?? paymentForm.supplierId,
      withholdingTax: roundMoney(normalizedLines.reduce((sum, line) => sum + (Number(line.withholdingTax) || 0), 0)),
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload = mode === 'payment' ? normalizedPaymentForm() : form
    const parsed = (mode === 'payment' ? supplierPaymentFormSchema : customerReceiptFormSchema).safeParse(payload)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson(apiPath, { body: JSON.stringify(parsed.data), method: 'POST' })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  function paymentStatusLabel(status: string | undefined) {
    return status === 'cancelled' ? 'ยกเลิกแล้ว' : 'เสร็จสิ้น'
  }

  function paymentStatusTone(status: string | undefined) {
    return status === 'cancelled'
      ? 'text-slate-500'
      : 'text-emerald-700'
  }

  function paymentStatusDot(status: string | undefined) {
    return status === 'cancelled'
      ? 'bg-slate-400'
      : 'bg-emerald-500'
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

  return (
    <section className="space-y-5">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid gap-3 md:grid-cols-5">
        <KpiCard label="จำนวน Voucher" value={rows.length.toLocaleString('th-TH')} tone="slate" />
        <KpiCard label={amountLabel} value={formatMoney(metrics.rowAmount)} tone={mode === 'payment' ? 'rose' : 'emerald'} />
        <KpiCard label="ยอดสุทธิ" value={formatMoney(metrics.rowNet)} tone="blue" />
        <KpiCard label="WHT / Fee" value={`${formatMoney(metrics.rowWht)} / ${formatMoney(metrics.rowFee)}`} tone="amber" />
        <KpiCard label={balanceLabel} value={formatMoney(metrics.outstanding)} tone="violet" />
      </div>

      {mode === 'payment' && showEntrySection ? (
        <>
          <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-lg font-bold text-slate-900">รายการรอออก PMT</h2>
              <p className="mt-1 text-sm text-slate-500">แสดงเฉพาะ approval items ที่อนุมัติแล้วและพร้อมสร้าง Payment Voucher</p>
            </div>
          </div>
          <div className="space-y-2 rounded-md bg-white p-3 shadow">
            <div className="flex flex-wrap items-center gap-2">
              <UiInput
                className="min-w-[260px] flex-1 rounded-md"
                placeholder="ค้นหาเลขบิล / Supplier / ธนาคาร / เลขบัญชี"
                type="search"
                value={billSearch}
                onChange={(event) => setBillSearch(event.target.value)}
              />
              <UiButton
                size="xs"
                type="button"
                variant="secondary"
                onClick={() => {
                  setBillSearch('')
                  setBillSort('age_desc')
                }}
              >
                ✕ ล้าง
              </UiButton>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">เรียง:</span>
              <UiSelect className="w-auto min-w-[180px]" value={billSort} onChange={(event) => setBillSort(event.target.value as typeof billSort)}>
                <option value="age_desc">อายุค้างมากสุด</option>
                <option value="balance_desc">ยอดคงเหลือมากสุด</option>
                <option value="date_desc">วันที่ล่าสุด</option>
                <option value="date_asc">วันที่เก่าสุด</option>
                <option value="doc_desc">เลขบิลล่าสุด</option>
                <option value="supplier_asc">Supplier A-Z</option>
              </UiSelect>
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
              <UiButton className="font-normal" disabled={supplierBillCurrentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setBillPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</UiButton>
              <span className="px-1">หน้า {supplierBillCurrentPage} / {supplierBillTotalPages}</span>
              <UiButton className="font-normal" disabled={supplierBillCurrentPage >= supplierBillTotalPages} size="sm" type="button" variant="outline" onClick={() => setBillPage((value) => Math.min(supplierBillTotalPages, value + 1))}>ถัดไป</UiButton>
            </div>
          </div>
          <Table className="min-w-[1220px]">
            <TableHeader className="text-slate-700">
              <tr>
                <TableHead>เลขที่รายการ</TableHead>
                <TableHead>วันที่</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="w-36">ธนาคาร</TableHead>
                <TableHead>เลขบัญชี</TableHead>
                <TableHead className="w-40 text-right">ยอดรวม</TableHead>
                <TableHead className="w-40 text-right">จ่ายแล้ว</TableHead>
                <TableHead className="w-40 text-right">คงเหลือรอออก PMT</TableHead>
                <TableHead className="w-20 text-right">อายุ(วัน)</TableHead>
                <TableHead className="w-28 text-center" />
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                {!isLoading && supplierBillPageRows.map((bill) => {
                  const balance = bill.payableBalance ?? 0
                  const supplier = supplierMap.get(bill.supplierId ?? '')
                  const supplierBankAccounts = approvalBankAccountLines(bill).length > 0 ? approvalBankAccountLines(bill) : supplierBankAccountLines(supplier, paymentMethods)
                  return (
                    <TableRow key={`${bill.id}:${bill.approvalId ?? 'no-approval'}`} className="cursor-pointer hover:bg-slate-50" onClick={() => openFormForBill(bill)}>
                      <TableCell className="font-mono text-xs font-semibold text-slate-700">
                        <div>{bill.docNo}</div>
                        {bill.sourceDocNo && bill.sourceDocNo !== bill.docNo ? <div className="mt-1 font-sans text-[11px] font-normal text-slate-500">อ้างอิง {bill.sourceDocNo}</div> : null}
                      </TableCell>
                      <TableCell>{formatDateDisplay(bill.date)}</TableCell>
                      <TableCell className="max-w-72 truncate font-medium text-slate-800">{partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'}</TableCell>
                      <TableCell className="w-36 text-xs text-slate-600">
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
                      <TableCell className="w-52 text-xs text-slate-600">
                        {supplierBankAccounts.length > 0 ? (
                          <div className="space-y-1">
                            {supplierBankAccounts.map((account, index) => {
                              const accountKey = `${bill.id}-${account.accountNo}-${index}`
                              const copied = copiedAccountKey === accountKey
                              const label = formatAccountNoDisplay(account.accountNo) || account.accountNo
                              return (
                                <div key={accountKey} className="flex items-center gap-1">
                                  <span className="whitespace-nowrap font-mono">{label}</span>
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
                                    {copied ? (
                                      <svg aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                                        <path d="M20 6 9 17l-5-5" />
                                      </svg>
                                    ) : (
                                      <svg aria-hidden="true" className="h-3 w-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
                                        <rect height="14" rx="2" width="14" x="8" y="8" />
                                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <span>-</span>
                        )}
                      </TableCell>
                      <TableCell className="w-40 whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(bill.totalAmount)}</TableCell>
                      <TableCell className="w-40 whitespace-nowrap text-right text-blue-700 tabular-nums">{formatMoney(bill.paidAmount)}</TableCell>
                      <TableCell className={`w-40 whitespace-nowrap text-right font-bold tabular-nums ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatMoney(balance)}</TableCell>
                      <TableCell className="w-20 whitespace-nowrap text-right tabular-nums">{ageInDays(bill.date)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <UiButton
                            className="font-normal"
                            size="xs"
                            type="button"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation()
                              openFormForBill(bill)
                            }}
                          >
                            ทำจ่าย
                          </UiButton>
                          <UiButton
                            className="font-normal text-rose-700"
                            disabled={(bill.paidAmount ?? 0) > 0.01 || !bill.approvalId}
                            size="xs"
                            type="button"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation()
                              setCancelApprovalTarget(bill)
                              setCancelApprovalReason('')
                              setError(null)
                            }}
                          >
                            ยกเลิก
                          </UiButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              {!isLoading && supplierBillPageRows.length === 0 ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={10}>ไม่พบบิลค้างจ่ายตามเงื่อนไข</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </>
      ) : null}

      {formOpen && showEntrySection ? (
        <Dialog open onOpenChange={(open) => {
          if (!open && !isSaving) setFormOpen(false)
        }}>
          <DialogContent className={`top-[max(2rem,50%)] max-h-[90vh] overflow-y-auto p-0 ${mode === 'payment' ? 'max-w-5xl' : 'max-w-4xl'}`} hideClose>
            <form onSubmit={save}>
            <DialogHeader className={`${mode === 'payment' ? 'bg-white text-slate-900' : theme.muted} flex-row items-center justify-between border-b px-5 py-4`}>
              <div>
                <DialogTitle className="font-bold">{mode === 'payment' ? 'สร้าง Payment Voucher' : title}</DialogTitle>
                {mode === 'payment' ? null : <p className="text-xs opacity-80">{subtitle}</p>}
              </div>
              <UiButton className="h-8 w-8 px-0 text-2xl text-slate-500" size="icon" type="button" variant="ghost" onClick={() => setFormOpen(false)}>&times;</UiButton>
            </DialogHeader>
            {mode === 'payment' ? (
              <div className="flex flex-col gap-4 p-5 text-sm">
                <div className="order-1 max-w-xs">
                  <label className="block">
                    <span className="mb-1 block text-xs">วิธีจ่าย</span>
                    <UiSelect className="h-9 rounded-md border px-2 py-1.5 text-sm" required value={form.method ?? ''} onChange={(event) => setForm({ ...form, method: event.target.value })}>
                      <option disabled value="">เลือกวิธีจ่าย/รับเงิน</option>
                      {paymentMethods.map((method) => (
                        <option key={method.name} value={method.name}>{method.name}</option>
                      ))}
                    </UiSelect>
                  </label>
                </div>

                <PaymentSplitsSection
                  activeAccounts={activeAccounts}
                  formNetAmount={formNetAmount}
                  moneyInputValue={moneyInputValue}
                  paymentSplitTotal={paymentSplitTotal}
                  paymentSplits={paymentSplits}
                  onAddPaymentSplit={addPaymentSplit}
                  onChangeMoneyInput={changeMoneyInput}
                  onFinishMoneyInput={finishMoneyInput}
                  onRemovePaymentSplit={removePaymentSplit}
                  onStartMoneyInput={startMoneyInput}
                  onUpdatePaymentSplit={updatePaymentSplit}
                />

                <PaymentLinesSection
                  billMap={billMap}
                  form={form}
                  formNetAmount={formNetAmount}
                  isBillLocked={isBillLocked}
                  moneyInputValue={moneyInputValue}
                  partyMap={partyMap}
                  paymentLineBalanceTotal={paymentLineBalanceTotal}
                  paymentLines={paymentLines}
                  paymentSelectableBills={paymentSelectableBills}
                  paymentSelectableBillsForLine={paymentSelectableBillsForLine}
                  paymentLineInputValue={paymentLineInputValue}
                  selectedBill={selectedBill ?? null}
                  onAddPaymentLine={addPaymentLine}
                  onChangeMoneyInput={changeMoneyInput}
                  onFinishMoneyInput={finishMoneyInput}
                  onRemovePaymentLine={removePaymentLine}
                  onSelectPaymentLineBill={selectPaymentLineBill}
                  onStartMoneyInput={startMoneyInput}
                  onUpdatePaymentLine={updatePaymentLine}
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
              <UiInput className="h-9 min-w-[260px] flex-1 rounded-md" placeholder="ค้นหาเลขที่ / ชื่อ / บัญชี / หมายเหตุ" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
              {mode === 'receipt' ? (
                <UiButton className="font-bold shadow" type="button" variant="default" onClick={openForm}>
                  + รับเงิน Customer
                </UiButton>
              ) : null}
              <label className="text-xs text-slate-500">วันที่:</label>
              <DatePickerInput id={`${mode}-history-date-from`} value={dateFrom} onChange={setDateFrom} />
              <span className="text-slate-400">→</span>
              <DatePickerInput id={`${mode}-history-date-to`} value={dateTo} onChange={setDateTo} />
              <UiButton size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</UiButton>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">เรียง:</span>
              <UiSelect
                className="h-9 w-auto min-w-[220px]"
                value={`${historySortField}:${historySortDirection}`}
                onChange={(event) => {
                  const [field, direction] = event.target.value.split(':') as [HistorySortField, 'asc' | 'desc']
                  setHistorySortField(field)
                  setHistorySortDirection(direction)
                }}
              >
                <option value="docNo:desc">เลขที่รายการ ล่าสุด</option>
                <option value="docNo:asc">เลขที่รายการ เก่าสุด</option>
                <option value="date:desc">วันที่ ล่าสุด</option>
                <option value="date:asc">วันที่ เก่าสุด</option>
                <option value="partyName:asc">{partyLabel} A-Z</option>
                <option value="partyName:desc">{partyLabel} Z-A</option>
                <option value="accountName:asc">บัญชี A-Z</option>
                <option value="accountName:desc">บัญชี Z-A</option>
                <option value="amount:desc">{amountLabel} มากสุด</option>
                <option value="amount:asc">{amountLabel} น้อยสุด</option>
                <option value="netAmount:desc">สุทธิ มากสุด</option>
                <option value="netAmount:asc">สุทธิ น้อยสุด</option>
              </UiSelect>
              <span className="text-xs text-slate-500">บัญชี:</span>
              <UiSelect className="h-9 w-auto min-w-[180px]" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                <option value="">ทุกบัญชี</option>
                {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </UiSelect>
            </div>
            {mode === 'payment' ? (
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { label: 'ทั้งหมด', value: 'all' },
                  { label: 'เสร็จสิ้น', value: 'active' },
                  { label: 'ยกเลิกแล้ว', value: 'cancelled' },
                ] as Array<{ label: string; value: PaymentHistoryStatusFilter }>).map((option) => {
                  const active = paymentHistoryStatusFilter === option.value
                  return (
                    <UiButton
                      key={option.value}
                      className={active ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : 'font-normal'}
                      size="sm"
                      type="button"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => setPaymentHistoryStatusFilter(option.value)}
                    >
                      {option.label}
                    </UiButton>
                  )
                })}
              </div>
            ) : null}
          </div>

          <div className={mode === 'receipt' ? 'overflow-hidden rounded-md bg-white shadow' : ''}>
            <div className={`flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600 ${mode === 'receipt' ? 'border-b border-slate-200 px-3 py-3' : ''}`}>
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

            <Table className="min-w-[1260px]">
              <TableHeader className="text-slate-700">
                <tr>
                  <TableHead><button className="font-semibold" type="button" onClick={() => toggleHistorySort('docNo')}>เลขที่รายการ{historySortLabel('docNo')}</button></TableHead>
                  <TableHead><button className="font-semibold" type="button" onClick={() => toggleHistorySort('date')}>วันที่สร้างรายการ{historySortLabel('date')}</button></TableHead>
                  <TableHead><button className="font-semibold" type="button" onClick={() => toggleHistorySort('partyName')}>{partyLabel}{historySortLabel('partyName')}</button></TableHead>
                  <TableHead>บิลอ้างอิง</TableHead>
                  <TableHead><button className="font-semibold" type="button" onClick={() => toggleHistorySort('accountName')}>บัญชีที่ใช้ทำจ่าย{historySortLabel('accountName')}</button></TableHead>
                  <TableHead className="w-44 text-right"><button className="font-semibold" type="button" onClick={() => toggleHistorySort('amount')}>{amountLabel}{historySortLabel('amount')}</button></TableHead>
                  <TableHead className="w-40 text-right">WHT</TableHead>
                  <TableHead className="w-40 text-right">Bank Fee</TableHead>
                  <TableHead className="w-44 text-right"><button className="font-semibold" type="button" onClick={() => toggleHistorySort('netAmount')}>สุทธิ{historySortLabel('netAmount')}</button></TableHead>
                  {mode === 'payment' ? <TableHead>สถานะ</TableHead> : null}
                  <TableHead>หมายเหตุ</TableHead>
                  <TableHead className="text-center">Action</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={mode === 'payment' ? 12 : 11}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                  {!isLoading && historyPageRows.map((row) => {
                    const billDocNos = row.billDocNos?.length ? row.billDocNos : [row.billId ? (billMap.get(row.billId)?.docNo ?? row.billDocNo ?? row.billId) : (row.billDocNo ?? '-')]
                    const accountSummaries = row.accountSummaries?.length ? row.accountSummaries : [row.accountName]
                    return (
                      <TableRow key={row.id} className="hover:bg-slate-50">
                        <TableCell className="font-mono text-xs font-semibold text-slate-700">{row.docNo}</TableCell>
                        <TableCell>{formatDateDisplay(row.date)}</TableCell>
                        <TableCell className="font-medium text-slate-800">{row.partyName}</TableCell>
                        <TableCell className="text-xs">
                          <div className="space-y-1">
                            <div className="font-semibold text-slate-700">{billDocNos.length.toLocaleString('th-TH')} บิล</div>
                            {billDocNos.map((docNo) => <div key={`${row.id}-bill-${docNo}`} className="font-mono text-slate-700">{docNo}</div>)}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-slate-800">
                          <div className="space-y-1">
                            <div className="font-semibold text-slate-700">{accountSummaries.length.toLocaleString('th-TH')} บัญชี</div>
                            {accountSummaries.map((summary) => <div key={`${row.id}-account-${summary}`} className="whitespace-nowrap">{summary}</div>)}
                          </div>
                        </TableCell>
                        <TableCell className="w-44 whitespace-nowrap text-right font-semibold tabular-nums">{formatMoney(row.amount)}</TableCell>
                        <TableCell className="w-40 whitespace-nowrap text-right text-amber-700 tabular-nums">{formatMoney(row.withholdingTax)}</TableCell>
                        <TableCell className="w-40 whitespace-nowrap text-right text-slate-600 tabular-nums">{formatMoney(row.fee)}</TableCell>
                        <TableCell className={`w-44 whitespace-nowrap text-right font-bold tabular-nums ${theme.strong}`}>{formatMoney(row.netAmount)}</TableCell>
                        {mode === 'payment' ? (
                          <TableCell>
                            <div className={`inline-flex items-center gap-2 text-sm font-medium ${paymentStatusTone(row.status)}`}>
                              <span className={`h-2 w-2 rounded-full ${paymentStatusDot(row.status)}`} />
                              <span>{paymentStatusLabel(row.status)}</span>
                            </div>
                          </TableCell>
                        ) : null}
                        <TableCell className="max-w-56 truncate text-slate-600">{row.notes || '-'}</TableCell>
                        {mode === 'payment' ? (
                          <TableCell className="text-center">
                            <span className="text-xs text-slate-400">ไม่มี action</span>
                          </TableCell>
                        ) : (
                          <TableCell className="text-center">
                            <UiButton className="font-normal text-slate-400" disabled size="xs" type="button" variant="outline">ดู/พิมพ์</UiButton>
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                {!isLoading && historyPageRows.length === 0 ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={mode === 'payment' ? 12 : 11}>ยังไม่มีรายการ</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </>
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
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    slate: 'border-slate-200 bg-white text-slate-800',
    violet: 'border-violet-200 bg-violet-50 text-violet-700',
  }
  return <div className={`rounded-md border p-4 shadow-sm ${tones[tone]}`}><div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div><div className="mt-2 text-xl font-bold">{value}</div></div>
}
