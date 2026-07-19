'use client'

import { Check, Copy, X, Plus, Printer } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { z } from 'zod'
import { paymentMethodGroupFromValue, type PaymentMethodGroup } from '@/lib/account-payment-method'
import { Field, SelectField } from '@/components/daily/MoneyMovementFieldHelpers'
import { PaymentLinesSection, PaymentSplitsSection } from '@/components/daily/MoneyMovementFormSections'
import { matchesMoneyAccountFilter, summarizeActiveReceiptRows } from '@/components/daily/money-movement-metrics'
import { Button as UiButton } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input as UiInput } from '@/components/ui/Input'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { CollapsedList } from '@/components/ui/CollapsedList'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select as UiSelect } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'
import { customerReceiptFormSchema, dailyFetchJson, formatMoney, supplierPaymentFormSchema, todayDateInput, type CustomerReceiptFormValues, type DailyAccountOption, type SupplierPaymentFormValues } from '@/lib/daily'
import { formatAccountNoDisplay, formatDateDisplay } from '@/lib/format'
import { normalizePaymentMethod, paymentDestinationKey } from '@/lib/payment-destination'

type PartyBankAccount = {
  accountNo?: string | null
  active?: boolean | null
  bankName?: string | null
  paymentMethod?: string | null
}
type Party = { active: boolean | null; bankAccount?: string | null; bankAccounts?: PartyBankAccount[]; id: string; name: string }
type Bill = {
  activeReceiptDocNos?: string[]
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
  receiptStatus?: string
  sourceDocNo?: string
  sourceType?: 'advance_payment' | 'expense' | 'petty_advance_return' | 'purchase_bill'
  status?: string
  supplierId?: string | null
  totalAmount: number
}
type CustomerAdvance = {
  availableAmount: number
  customerId?: string | null
  date?: string
  docNo: string
  id: string
  receivedAmount: number
  status?: string
  targetAmount: number
}
type MoneyRow = {
  accountId?: string
  accountName: string
  accountNames?: string[]
  accountSplits?: Array<{
    accountId: string
    amount: number
    id?: string | null
  }>
  accountSummaries?: string[]
  approvalId?: string
  approvalIds?: string[]
  amount: number
  billId?: string
  billDocNo?: string
  billDocNos?: string[]
  customerId?: string
  customerAdvanceDocNos?: string[]
  date: string
  docNo: string
  discount?: number
  fee?: number
  id: string
  method?: string
  netAmount: number
  notes: string
  partyName: string
  receiptLines?: Array<{
    discountAmount: number
    lineNo: number
    receiptAmount: number
    salesBillDocNo: string
    withholdingTaxAmount: number
  }>
  customerAdvanceLines?: Array<{
    customerAdvanceDocNo: string
    lineNo: number
    receiptAmount: number
  }>
  sourceType?: 'SB' | 'CADV'
  status?: string
  supplierId?: string
  withholdingTax?: number
}
type Payload = {
  accounts: DailyAccountOption[]
  bills: Bill[]
  customerAdvances?: CustomerAdvance[]
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
type ReceiptLine = NonNullable<CustomerReceiptFormValues['salesBillLines']>[number]
type CustomerAdvanceReceiptLine = NonNullable<CustomerReceiptFormValues['customerAdvanceLines']>[number]
type ReceiptSplit = NonNullable<CustomerReceiptFormValues['splits']>[number]
type PaymentBillSort = 'age_asc' | 'age_desc' | 'balance_asc' | 'balance_desc' | 'date_asc' | 'date_desc' | 'doc_asc' | 'doc_desc' | 'paid_asc' | 'paid_desc' | 'source_asc' | 'source_desc' | 'supplier_asc' | 'supplier_desc' | 'total_asc' | 'total_desc'
type PaymentBillSortField = 'age' | 'balance' | 'date' | 'docNo' | 'paidAmount' | 'sourceDocNo' | 'supplier' | 'totalAmount'
type PaymentQueueSourceFilter = 'all' | NonNullable<Bill['sourceType']>
type HistorySortField = 'accountName' | 'amount' | 'bankFee' | 'billRefs' | 'date' | 'docNo' | 'netAmount' | 'notes' | 'partyName' | 'status' | 'wht'
type PaymentHistoryStatusFilter = 'active' | 'all' | 'cancelled'
type ReceiptTab = 'entry' | 'history'
type PaymentQueueColumnKey = 'accountNo' | 'action' | 'age' | 'balance' | 'date' | 'destination' | 'docNo' | 'paidAmount' | 'partyName' | 'totalAmount'
type MoneyHistoryColumnKey = 'accountName' | 'action' | 'amount' | 'bankFee' | 'billRefs' | 'date' | 'docNo' | 'netAmount' | 'notes' | 'partyName' | 'status' | 'wht'
const pageSizeOptions = [10, 25, 50, 100]
const paymentQueueSourceOptions = [
  { label: 'ทุกประเภท', value: 'all' },
  { label: 'บิลซื้อ', value: 'purchase_bill' },
  { label: 'เงินมัดจำ', value: 'advance_payment' },
  { label: 'ค่าใช้จ่าย', value: 'expense' },
  { label: 'คืนเงินสำรองจ่าย', value: 'petty_advance_return' },
] satisfies Array<{ label: string; value: PaymentQueueSourceFilter }>
const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})
const paymentQueueColumns: Array<ResizableColumnDefinition<PaymentQueueColumnKey>> = [
  { key: 'docNo', defaultWidth: 180, minWidth: 150 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'partyName', defaultWidth: 220, minWidth: 150 },
  { key: 'destination', defaultWidth: 250, minWidth: 190 },
  { key: 'totalAmount', defaultWidth: 125, minWidth: 105 },
  { key: 'balance', defaultWidth: 135, minWidth: 115 },
  { key: 'age', defaultWidth: 145, minWidth: 135 },
  { key: 'action', defaultWidth: 150, minWidth: 140 },
]
const receiptQueueColumns: Array<ResizableColumnDefinition<PaymentQueueColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 140, minWidth: 120 },
  { key: 'partyName', defaultWidth: 260, minWidth: 160 },
  { key: 'accountNo', defaultWidth: 170, minWidth: 140 },
  { key: 'totalAmount', defaultWidth: 120, minWidth: 100 },
  { key: 'paidAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'balance', defaultWidth: 110, minWidth: 90 },
  { key: 'action', defaultWidth: 150, minWidth: 145 },
]
const paymentHistoryColumns: Array<ResizableColumnDefinition<MoneyHistoryColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 150, minWidth: 120 },
  { key: 'partyName', defaultWidth: 260, minWidth: 140 },
  { key: 'billRefs', defaultWidth: 220, minWidth: 160 },
  { key: 'accountName', defaultWidth: 220, minWidth: 160 },
  { key: 'amount', defaultWidth: 110, minWidth: 90 },
  { key: 'wht', defaultWidth: 100, minWidth: 80 },
  { key: 'bankFee', defaultWidth: 100, minWidth: 80 },
  { key: 'netAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'status', defaultWidth: 130, minWidth: 110 },
  { key: 'notes', defaultWidth: 180, minWidth: 130 },
  { key: 'action', defaultWidth: 150, minWidth: 135 },
]
const receiptHistoryColumns: Array<ResizableColumnDefinition<MoneyHistoryColumnKey>> = [
  { key: 'docNo', defaultWidth: 140, minWidth: 120 },
  { key: 'date', defaultWidth: 130, minWidth: 120 },
  { key: 'partyName', defaultWidth: 220, minWidth: 160 },
  { key: 'billRefs', defaultWidth: 170, minWidth: 160 },
  { key: 'accountName', defaultWidth: 210, minWidth: 180 },
  { key: 'amount', defaultWidth: 100, minWidth: 90 },
  { key: 'wht', defaultWidth: 150, minWidth: 140 },
  { key: 'bankFee', defaultWidth: 160, minWidth: 150 },
  { key: 'netAmount', defaultWidth: 100, minWidth: 90 },
  { key: 'status', defaultWidth: 110, minWidth: 100 },
  { key: 'notes', defaultWidth: 140, minWidth: 120 },
  { key: 'action', defaultWidth: 210, minWidth: 190 },
]

function newPaymentLine(): PaymentLine {
  return { amount: 0, approvalId: null, billId: '', billText: '', discount: 0, fee: 0, id: `PL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, supplierId: '', withholdingTax: 0 }
}

function newPaymentSplit(): PaymentSplit {
  return { accountId: '', amount: 0, id: `SP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
}

function newReceiptSplit(): ReceiptSplit {
  return { accountId: '', amount: 0, method: '', id: `RS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
}

function newReceiptLine(): ReceiptLine {
  return { discountAmount: 0, id: `RL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, receiptAmount: 0, salesBillDocNo: '', withholdingTaxAmount: 0 }
}

function newCustomerAdvanceReceiptLine(): CustomerAdvanceReceiptLine {
  return { customerAdvanceDocNo: '', id: `CAL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, receiptAmount: 0 }
}

function receiptLineMoneyKey(line: ReceiptLine, index: number, field: 'discountAmount' | 'receiptAmount' | 'withholdingTaxAmount') {
  return `receipt-line:${line.id ?? index}:${field}`
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

function paymentBillDestinationKey(bill: Bill) {
  return paymentDestinationKey({
    accountNo: bill.approvalAccountNo,
    bankName: bill.approvalBankName,
    paymentMethod: bill.approvalPaymentMethod,
  })
}

function paymentSourceTypeLabel(sourceType: Bill['sourceType']) {
  switch (sourceType) {
    case 'purchase_bill': return 'บิลซื้อ'
    case 'advance_payment': return 'เงินมัดจำ'
    case 'expense': return 'ค่าใช้จ่าย'
    case 'petty_advance_return': return 'คืนเงินสำรองจ่าย'
    default: return 'รายการจ่าย'
  }
}

function paymentSelectionId(bill: Bill) {
  return bill.approvalId ?? bill.id
}

function paymentBillLabel(bill: Bill, partyName: string) {
  const sourceLabel = bill.sourceDocNo && bill.sourceDocNo !== bill.docNo ? ` / อ้างอิง ${bill.sourceDocNo}` : ''
  return `${bill.docNo}${sourceLabel} | ${partyName} | ค้าง ${formatMoney(bill.payableBalance ?? 0)}`
}

function normalizedPaymentMethod(value: string | null | undefined) {
  return normalizePaymentMethod(value)
}

const paymentTheme = {
  action: 'bg-blue-600 hover:bg-blue-700',
  banner: 'from-rose-600 via-red-600 to-orange-500',
  chip: 'bg-rose-100 text-rose-700',
  muted: 'bg-rose-50 text-rose-700',
  strong: 'text-rose-700',
  table: 'bg-rose-700',
}

const receiptTheme = {
  action: 'bg-blue-600 hover:bg-blue-700',
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
    method: '',
    notes: null,
    ...(mode === 'payment' ? { lines: [newPaymentLine()], splits: [newPaymentSplit()], supplierId: '' } : { customerId: '', sourceType: 'SB', salesBillLines: [newReceiptLine()], customerAdvanceLines: [], splits: [newReceiptSplit()] }),
    withholdingTax: 0,
  } as MoneyForm
}

function paymentHistoryStatusLabel(status: string | undefined, mode?: 'payment' | 'receipt') {
  if (status === 'cancelled') return 'ยกเลิก'
  return mode === 'receipt' ? 'รับเงินแล้ว' : 'จ่ายแล้ว'
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

function moneyHistoryBillRefs(row: MoneyRow) {
  if (row.billDocNos?.length) return row.billDocNos.join(', ')
  return row.billDocNo ?? row.billId ?? ''
}

function moneyHistorySortValue(row: MoneyRow, field: HistorySortField, mode: 'payment' | 'receipt') {
  switch (field) {
    case 'bankFee':
      return row.fee ?? 0
    case 'billRefs':
      return moneyHistoryBillRefs(row)
    case 'notes':
      return row.notes ?? ''
    case 'status':
      return paymentHistoryStatusLabel(row.status, mode)
    case 'wht':
      return row.withholdingTax ?? 0
    default:
      return row[field]
  }
}

function moneyHistoryStatusOptions(mode: 'payment' | 'receipt'): Array<{ label: string; value: PaymentHistoryStatusFilter }> {
  return [
    { label: 'ทั้งหมด', value: 'all' },
    { label: mode === 'payment' ? 'จ่ายแล้ว' : 'รับเงินแล้ว', value: 'active' },
    { label: 'ยกเลิก', value: 'cancelled' },
  ]
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function missingCompanyData(value: string | null | undefined) {
  return value?.trim() || 'ไม่มีข้อมูล'
}

function companyInfoForPrint(profile: CompanyProfilePrintValues) {
  return [
    missingCompanyData(profile.address),
    `โทร ${missingCompanyData(profile.phone)}`,
    profile.fax ? `แฟกซ์ ${profile.fax}` : '',
    `เลขประจำตัวผู้เสียภาษี ${missingCompanyData(profile.taxId)}`,
    profile.email ? `Email: ${profile.email}` : '',
    profile.website ? `Website: ${profile.website}` : '',
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

function printEmptyRows(columnCount: number, count: number) {
  const cells = Array.from({ length: columnCount }, (_, index) => (index === 0 ? '<td>&nbsp;</td>' : '<td></td>')).join('')
  return Array.from({ length: Math.max(0, count) }, () => `<tr class="empty-row">${cells}</tr>`).join('')
}

function paymentDailyReportDateRangeLabel(dateFrom: string, dateTo: string) {
  const today = todayDateInput()
  const from = dateFrom || today
  const to = dateTo || dateFrom || today
  return from === to ? formatDateDisplay(from) : `${formatDateDisplay(from)} - ${formatDateDisplay(to)}`
}

function buildPaymentDailyReportHtml(rows: MoneyRow[], profile: CompanyProfilePrintValues, params: { dateFrom: string; dateTo: string; kind: 'payment' | 'receipt'; printedAt: Date }) {
  const isReceipt = params.kind === 'receipt'
  const reportTitle = isReceipt ? 'รายงานประวัติการรับเงินประจำวัน' : 'รายงานประวัติการจ่ายเงินประจำวัน'
  const docLabel = isReceipt ? 'RCP' : 'PMT'
  const partyLabel = isReceipt ? 'ลูกค้า' : 'ผู้รับเงิน'
  const accountLabel = isReceipt ? 'บัญชีที่รับเงิน' : 'บัญชีที่จ่าย'
  const amountLabel = isReceipt ? 'ยอดรับ' : 'ยอดจ่าย'
  const netLabel = isReceipt ? 'เงินเข้าสุทธิ' : 'เงินออกสุทธิ'
  const activeLabel = isReceipt ? 'รับเงินแล้ว' : 'จ่ายแล้ว'
  const grossSummaryLabel = isReceipt ? 'ยอดรับแล้วก่อน fee' : 'ยอดจ่ายแล้วก่อน fee'
  const feeSummaryLabel = isReceipt ? 'ค่าธรรมเนียมธนาคารของรายการรับเงินแล้ว' : 'ค่าธรรมเนียมธนาคารของรายการจ่ายแล้ว'
  const noteText = isReceipt ? 'เงินเข้าสุทธินับเฉพาะ RCP รับเงินแล้ว' : 'เงินออกสุทธินับเฉพาะ PMT จ่ายแล้ว'
  const emptyText = isReceipt ? 'ไม่พบรายการรับเงิน RCP ในวันที่เลือก' : 'ไม่พบรายการจ่าย PMT ในวันที่เลือก'
  const cancelledSummaryLabel = isReceipt ? 'ยอดรายการยกเลิก ไม่รวมเงินเข้า' : 'ยอดรายการยกเลิก ไม่รวมเงินออก'
  const footerText = isReceipt
    ? 'รายงานนี้เป็นเอกสารตรวจรายการรับเงินประจำวันจาก RCP history เท่านั้น ไม่รวมบิลขายที่ยังไม่เกิด RCP'
    : 'รายงานนี้เป็นเอกสารตรวจรายการจ่ายประจำวันจาก PMT history เท่านั้น ไม่รวม PMA ที่ยังไม่เกิด PMT'
  const paidRows = rows.filter((row) => row.status !== 'cancelled')
  const cancelledRows = rows.filter((row) => row.status === 'cancelled')
  const paidAmount = paidRows.reduce((sum, row) => sum + row.amount, 0)
  const paidFee = paidRows.reduce((sum, row) => sum + (row.fee ?? 0), 0)
  const paidNet = paidRows.reduce((sum, row) => sum + row.netAmount, 0)
  const cancelledAmount = cancelledRows.reduce((sum, row) => sum + row.amount, 0)
  const rowHtml = rows.map((row, index) => {
    const billRefs = row.billDocNos?.length ? row.billDocNos.join(', ') : row.billDocNo || '-'
    const accounts = (row.accountSummaries?.length ? row.accountSummaries : [row.accountName || '-'])
      .map(escapeHtml)
      .join('<br>')
    return `<tr class="${row.status === 'cancelled' ? 'cancelled' : ''}">
      <td class="c">${index + 1}</td>
      <td class="mono">${escapeHtml(row.docNo)}</td>
      <td>${escapeHtml(formatDateDisplay(row.date))}</td>
      <td>${escapeHtml(row.partyName || '-')}</td>
      <td class="mono small">${escapeHtml(billRefs)}</td>
      <td class="small">${accounts}</td>
      <td class="r">${escapeHtml(formatMoney(row.amount))}</td>
      <td class="r">${escapeHtml(formatMoney(row.fee ?? 0))}</td>
      <td class="r strong">${escapeHtml(formatMoney(row.status === 'cancelled' ? 0 : row.netAmount))}</td>
      <td>${escapeHtml(paymentHistoryStatusLabel(row.status))}</td>
      <td>${escapeHtml(row.notes || '-')}</td>
    </tr>`
  }).join('')
  const emptyRow = `<tr class="empty-row"><td class="empty" colspan="11">${escapeHtml(emptyText)}</td></tr>`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(reportTitle)}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      body { font-family: 'Noto Sans Thai', Arial, sans-serif; color: #0f172a; font-size: 12px; margin: 0; }
      .toolbar { background: #f1f5f9; border-bottom: 1px solid #cbd5e1; padding: 8px; text-align: center; }
      .toolbar button { background: #0f172a; border: 0; border-radius: 6px; color: white; cursor: pointer; font-size: 13px; margin: 0 4px; padding: 7px 14px; }
      .page { padding: 10px; }
      .header { display: grid; grid-template-columns: minmax(0, 1fr) max-content; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
      .logo { max-height: 52px; max-width: 180px; object-fit: contain; margin-bottom: 4px; }
      .no-logo { display: flex; align-items: center; justify-content: center; width: 120px; height: 52px; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 12px; font-weight: 800; text-align: center; }
      .co-name { font-size: 18px; font-weight: 800; }
      .co-info { color: #475569; line-height: 1.45; margin-top: 3px; }
      .doc-title { text-align: right; }
      .doc-title h1 { font-size: 20px; margin: 0 0 4px; white-space: nowrap; }
      .doc-title .range { color: #be123c; font-size: 15px; font-weight: 800; }
      .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 12px 0; }
      .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; background: #fff; }
      .card .label { color: #64748b; font-size: 12px; }
      .card .value { font-size: 16px; font-weight: 800; margin-top: 2px; }
      .green { color: #047857; }
      .rose { color: #be123c; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; font-size: 12px; font-weight: 900; padding: 6px 5px; text-align: left; }
      td { border: 1px solid #dbe3ea; padding: 6px 5px; vertical-align: top; }
      tfoot td { background: #ecfdf5; color: #0f172a; font-weight: 900; }
      tr.cancelled td { color: #64748b; }
      .r { text-align: right; }
      .c { text-align: center; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .small { font-size: 12px; }
      .strong { font-weight: 800; }
      .empty { color: #64748b; padding: 24px; text-align: center; }
      .empty-row td { height: 24px; }
      .final-amount { color: #047857; font-weight: 900; }
      .footer { border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 12px; margin-top: 12px; padding-top: 8px; }
      @media print { .toolbar { display: none; } .page { padding: 0; } }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button onclick="window.close()" style="background:#64748b">ปิด</button>
    </div>
    <div class="page">
      <div class="header">
        <div>
          ${profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo no-logo">ไม่มีข้อมูล</div>'}
          <div class="co-name">${escapeHtml(missingCompanyData(profile.name))}</div>
          ${profile.nameEn ? `<div>${escapeHtml(profile.nameEn)}</div>` : ''}
          <div class="co-info">${companyInfoForPrint(profile)}</div>
        </div>
        <div class="doc-title">
          <h1>${escapeHtml(reportTitle)}</h1>
          <div class="range">${escapeHtml(paymentDailyReportDateRangeLabel(params.dateFrom, params.dateTo))}</div>
          <div>พิมพ์เมื่อ ${escapeHtml(params.printedAt.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }))}</div>
        </div>
      </div>
      <div class="summary">
        <div class="card"><div class="label">รายการ ${escapeHtml(docLabel)} ทั้งหมด</div><div class="value">${rows.length.toLocaleString('th-TH')}</div></div>
        <div class="card"><div class="label">${escapeHtml(activeLabel)}</div><div class="value green">${paidRows.length.toLocaleString('th-TH')}</div></div>
        <div class="card"><div class="label">ยกเลิก</div><div class="value rose">${cancelledRows.length.toLocaleString('th-TH')}</div></div>
        <div class="card"><div class="label">${escapeHtml(grossSummaryLabel)}</div><div class="value">${escapeHtml(formatMoney(paidAmount))}</div></div>
        <div class="card"><div class="label">${escapeHtml(netLabel)}</div><div class="value green">${escapeHtml(formatMoney(paidNet))}</div></div>
      </div>
      <div class="summary" style="grid-template-columns: repeat(3, 1fr);">
        <div class="card"><div class="label">${escapeHtml(feeSummaryLabel)}</div><div class="value">${escapeHtml(formatMoney(paidFee))}</div></div>
        <div class="card"><div class="label">${escapeHtml(cancelledSummaryLabel)}</div><div class="value rose">${escapeHtml(formatMoney(cancelledAmount))}</div></div>
        <div class="card"><div class="label">หมายเหตุการนับยอด</div><div class="value" style="font-size:12px">${escapeHtml(noteText)}</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="c">#</th>
            <th>${escapeHtml(docLabel)}</th>
            <th>วันที่</th>
            <th>${escapeHtml(partyLabel)}</th>
            <th>เอกสารอ้างอิง</th>
            <th>${escapeHtml(accountLabel)}</th>
            <th class="r">${escapeHtml(amountLabel)}</th>
            <th class="r">ค่าธรรมเนียมธนาคาร</th>
            <th class="r">${escapeHtml(netLabel)}</th>
            <th>สถานะ</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>${rowHtml || emptyRow}</tbody>
        <tfoot>
          <tr>
            <td colspan="6" class="r">รวมทั้งสิ้น</td>
            <td class="r">${escapeHtml(formatMoney(paidAmount))}</td>
            <td class="r">${escapeHtml(formatMoney(paidFee))}</td>
            <td class="r final-amount">${escapeHtml(formatMoney(paidNet))}</td>
            <td></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <div class="footer">${escapeHtml(footerText)}</div>
    </div>
  </body></html>`
}

function buildCustomerReceiptPrintHtml(row: MoneyRow) {
  const billDocNos = row.billDocNos?.length ? row.billDocNos : [row.billDocNo || row.billId || '-']
  const accountSummaries = row.accountSummaries?.length ? row.accountSummaries : [row.accountName || '-']
  const receiptLines = row.receiptLines?.length ? row.receiptLines : billDocNos.map((docNo, index) => ({
    discountAmount: index === 0 ? row.discount ?? 0 : 0,
    lineNo: index + 1,
    receiptAmount: index === 0 ? row.amount : 0,
    salesBillDocNo: docNo,
    withholdingTaxAmount: index === 0 ? row.withholdingTax ?? 0 : 0,
  }))
  const lineRows = receiptLines.map((line, index) => `<tr>
    <td class="c">${index + 1}</td>
    <td class="mono">${escapeHtml(line.salesBillDocNo || '-')}</td>
    <td class="r">${escapeHtml(formatMoney(line.receiptAmount))}</td>
    <td class="r">${escapeHtml(formatMoney(line.withholdingTaxAmount))}</td>
    <td class="r">${escapeHtml(formatMoney(line.discountAmount))}</td>
  </tr>`).join('')
  const fillerRows = printEmptyRows(5, 10 - receiptLines.length)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(row.docNo)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: 'Noto Sans Thai', Arial, sans-serif; color: #0f172a; font-size: 12px; margin: 0; }
      .toolbar { background: #f1f5f9; border-bottom: 1px solid #cbd5e1; padding: 8px; text-align: center; }
      .toolbar button { background: #0f172a; border: 0; border-radius: 6px; color: white; cursor: pointer; font-size: 13px; margin: 0 4px; padding: 7px 14px; }
      .page { padding: 10px; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .muted { color: #64748b; }
      .header { border-bottom: 2px solid #0f172a; display: flex; justify-content: space-between; gap: 16px; padding-bottom: 12px; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 16px; margin: 14px 0; }
      .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; }
      .label { color: #64748b; font-size: 12px; }
      .value { font-weight: 800; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
      th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; font-weight: 900; padding: 6px 5px; text-align: left; }
      td { border: 1px solid #dbe3ea; padding: 6px 5px; vertical-align: top; }
      tfoot td { background: #ecfdf5; color: #0f172a; font-weight: 900; }
      .empty-row td { height: 24px; color: transparent; }
      .r { text-align: right; }
      .c { text-align: center; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
      .green { color: #047857; }
      .final-amount { color: #047857; font-weight: 900; }
      @media print { .toolbar { display: none; } .page { padding: 0; } }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button onclick="window.close()" style="background:#64748b">ปิด</button>
    </div>
    <div class="page">
      <div class="header">
        <div>
          <h1>Receipt Voucher</h1>
          <div class="muted">ใบสำคัญรับเงินลูกค้า</div>
        </div>
        <div style="text-align:right">
          <div class="label">เลขที่เอกสาร</div>
          <div class="value mono">${escapeHtml(row.docNo)}</div>
          <div class="label" style="margin-top:6px">วันที่</div>
          <div class="value">${escapeHtml(formatDateDisplay(row.date))}</div>
        </div>
      </div>
      <div class="grid">
        <div class="box"><div class="label">ลูกค้า</div><div class="value">${escapeHtml(row.partyName || '-')}</div></div>
        <div class="box"><div class="label">บัญชีรับเงิน</div><div class="value">${accountSummaries.map(escapeHtml).join('<br>')}</div></div>
        <div class="box"><div class="label">วิธีรับเงิน</div><div class="value">${escapeHtml(row.method || '-')}</div></div>
        <div class="box"><div class="label">สถานะ</div><div class="value">${escapeHtml(row.status === 'cancelled' ? 'ยกเลิก' : 'รับเงินแล้ว')}</div></div>
      </div>
      <table>
        <thead><tr><th class="c">#</th><th>บิลขาย</th><th class="r">ยอดรับ</th><th class="r">ภาษีหัก ณ ที่จ่าย</th><th class="r">ส่วนลด</th></tr></thead>
        <tbody>${lineRows}${fillerRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" class="r">รวมทั้งสิ้น</td>
            <td class="r final-amount">${escapeHtml(formatMoney(row.amount))}</td>
            <td class="r">${escapeHtml(formatMoney(row.withholdingTax ?? 0))}</td>
            <td class="r">${escapeHtml(formatMoney(row.discount ?? 0))}</td>
          </tr>
        </tfoot>
      </table>
      <div class="summary">
        <div class="box"><div class="label">ยอดรับ</div><div class="value">${escapeHtml(formatMoney(row.amount))}</div></div>
        <div class="box"><div class="label">ภาษีหัก ณ ที่จ่าย</div><div class="value">${escapeHtml(formatMoney(row.withholdingTax ?? 0))}</div></div>
        <div class="box"><div class="label">ค่าธรรมเนียมธนาคาร</div><div class="value">${escapeHtml(formatMoney(row.fee ?? 0))}</div></div>
        <div class="box"><div class="label">ยอดสุทธิ</div><div class="value green">${escapeHtml(formatMoney(row.netAmount))}</div></div>
      </div>
      <div class="box" style="margin-top:12px"><div class="label">หมายเหตุ</div><div>${escapeHtml(row.notes || '-')}</div></div>
    </div>
  </body></html>`
}

function buildBatchReceiptPrintHtml(rows: MoneyRow[]) {
  const pagesHtml = rows.map((row) => {
    const billDocNos = row.billDocNos?.length ? row.billDocNos : [row.billDocNo || row.billId || '-']
    const accountSummaries = row.accountSummaries?.length ? row.accountSummaries : [row.accountName || '-']
    const receiptLines = row.receiptLines?.length ? row.receiptLines : billDocNos.map((docNo, index) => ({
      discountAmount: index === 0 ? row.discount ?? 0 : 0,
      lineNo: index + 1,
      receiptAmount: index === 0 ? row.amount : 0,
      salesBillDocNo: docNo,
      withholdingTaxAmount: index === 0 ? row.withholdingTax ?? 0 : 0,
    }))
    const lineRows = receiptLines.map((line, index) => `<tr>
      <td class="c">${index + 1}</td>
      <td class="mono">${escapeHtml(line.salesBillDocNo || '-')}</td>
      <td class="r">${escapeHtml(formatMoney(line.receiptAmount))}</td>
      <td class="r">${escapeHtml(formatMoney(line.withholdingTaxAmount))}</td>
      <td class="r">${escapeHtml(formatMoney(line.discountAmount))}</td>
    </tr>`).join('')
    const fillerRows = printEmptyRows(5, 10 - receiptLines.length)

    return `<div class="page">
      <div class="header">
        <div>
          <h1>Receipt Voucher</h1>
          <div class="muted">ใบสำคัญรับเงินลูกค้า</div>
        </div>
        <div style="text-align:right">
          <div class="label">เลขที่เอกสาร</div>
          <div class="value mono">${escapeHtml(row.docNo)}</div>
          <div class="label" style="margin-top:6px">วันที่</div>
          <div class="value">${escapeHtml(formatDateDisplay(row.date))}</div>
        </div>
      </div>
      <div class="grid">
        <div class="box"><div class="label">ลูกค้า</div><div class="value">${escapeHtml(row.partyName || '-')}</div></div>
        <div class="box"><div class="label">บัญชีรับเงิน</div><div class="value">${accountSummaries.map(escapeHtml).join('<br>')}</div></div>
        <div class="box"><div class="label">วิธีรับเงิน</div><div class="value">${escapeHtml(row.method || '-')}</div></div>
        <div class="box"><div class="label">สถานะ</div><div class="value">${escapeHtml(row.status === 'cancelled' ? 'ยกเลิก' : 'รับเงินแล้ว')}</div></div>
      </div>
      <table>
        <thead><tr><th class="c">#</th><th>บิลขาย</th><th class="r">ยอดรับ</th><th class="r">ภาษีหัก ณ ที่จ่าย</th><th class="r">ส่วนลด</th></tr></thead>
        <tbody>${lineRows}${fillerRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" class="r">รวมทั้งสิ้น</td>
            <td class="r final-amount">${escapeHtml(formatMoney(row.amount))}</td>
            <td class="r">${escapeHtml(formatMoney(row.withholdingTax ?? 0))}</td>
            <td class="r">${escapeHtml(formatMoney(row.discount ?? 0))}</td>
          </tr>
        </tfoot>
      </table>
      <div class="summary">
        <div class="box"><div class="label">ยอดรับ</div><div class="value">${escapeHtml(formatMoney(row.amount))}</div></div>
        <div class="box"><div class="label">ภาษีหัก ณ ที่จ่าย</div><div class="value">${escapeHtml(formatMoney(row.withholdingTax ?? 0))}</div></div>
        <div class="box"><div class="label">ค่าธรรมเนียมธนาคาร</div><div class="value">${escapeHtml(formatMoney(row.fee ?? 0))}</div></div>
        <div class="box"><div class="label">ยอดสุทธิ</div><div class="value green">${escapeHtml(formatMoney(row.netAmount))}</div></div>
      </div>
      <div class="box" style="margin-top:12px"><div class="label">หมายเหตุ</div><div>${escapeHtml(row.notes || '-')}</div></div>
    </div>`
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>พิมพ์ใบเสร็จรับเงินหลายรายการ</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: 'Noto Sans Thai', Arial, sans-serif; color: #0f172a; font-size: 12px; margin: 0; }
      .toolbar { background: #f1f5f9; border-bottom: 1px solid #cbd5e1; padding: 8px; text-align: center; }
      .toolbar button { background: #0f172a; border: 0; border-radius: 6px; color: white; cursor: pointer; font-size: 13px; margin: 0 4px; padding: 7px 14px; }
      .page { padding: 10px; page-break-after: always; }
      .page:last-child { page-break-after: avoid; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .muted { color: #64748b; }
      .header { border-bottom: 2px solid #0f172a; display: flex; justify-content: space-between; gap: 16px; padding-bottom: 12px; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 16px; margin: 14px 0; }
      .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; }
      .label { color: #64748b; font-size: 12px; }
      .value { font-weight: 800; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; table-layout: fixed; }
      th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; font-weight: 900; padding: 6px 5px; text-align: left; }
      td { border: 1px solid #dbe3ea; padding: 6px 5px; vertical-align: top; }
      tfoot td { background: #ecfdf5; color: #0f172a; font-weight: 900; }
      .empty-row td { height: 24px; color: transparent; }
      .r { text-align: right; }
      .c { text-align: center; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
      .green { color: #047857; }
      .final-amount { color: #047857; font-weight: 900; }
      @media print { .toolbar { display: none; } .page { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button onclick="window.close()">ปิดหน้าต่าง</button>
    </div>
    ${pagesHtml}
  </body></html>`
}

function receiptQueueDocNo(bill: Bill) {
  return bill.activeReceiptDocNos?.[0] ?? '-'
}

function receiptQueueStatusLabel(bill: Bill) {
  const status = String(bill.receiptStatus ?? '').toLowerCase()
  if (status === 'pending') return 'รอรับเงิน'
  if (status === 'active') return 'รับเงินแล้ว'
  return bill.activeReceiptDocNos?.length ? 'รับเงินแล้ว' : 'รอรับเงิน'
}

function buildReceivableBillPrintHtml(bill: Bill, customerName: string) {
  const balance = bill.receivableBalance ?? 0
  const receivedAmount = Math.max(0, (bill.totalAmount ?? 0) - balance)
  const receiptDocNo = receiptQueueDocNo(bill)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(receiptDocNo)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      body { font-family: 'Noto Sans Thai', Arial, sans-serif; color: #0f172a; font-size: 12px; margin: 0; }
      .toolbar { background: #f1f5f9; border-bottom: 1px solid #cbd5e1; padding: 8px; text-align: center; }
      .toolbar button { background: #0f172a; border: 0; border-radius: 6px; color: white; cursor: pointer; font-size: 13px; margin: 0 4px; padding: 7px 14px; }
      .page { padding: 10px; }
      h1 { font-size: 22px; margin: 0 0 4px; }
      .muted { color: #64748b; }
      .header { border-bottom: 2px solid #0f172a; display: flex; justify-content: space-between; gap: 16px; padding-bottom: 12px; }
      .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 16px; margin: 14px 0; }
      .box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; }
      .label { color: #64748b; font-size: 12px; }
      .value { font-weight: 800; margin-top: 2px; }
      .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 14px; }
      .green { color: #047857; }
      .blue { color: #1d4ed8; }
      @media print { .toolbar { display: none; } .page { padding: 0; } }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button onclick="window.close()" style="background:#64748b">ปิด</button>
    </div>
    <div class="page">
      <div class="header">
        <div>
          <h1>Receipt Voucher Queue</h1>
          <div class="muted">ใบรับเงินลูกค้ารอดำเนินการ</div>
        </div>
        <div style="text-align:right">
          <div class="label">เลขที่ใบรับเงิน</div>
          <div class="value">${escapeHtml(receiptDocNo)}</div>
          <div class="label" style="margin-top:6px">วันที่</div>
          <div class="value">${escapeHtml(formatDateDisplay(bill.date))}</div>
        </div>
      </div>
      <div class="grid">
        <div class="box"><div class="label">ลูกค้า</div><div class="value">${escapeHtml(customerName || '-')}</div></div>
        <div class="box"><div class="label">บิลขายอ้างอิง</div><div class="value">${escapeHtml(bill.docNo)}</div></div>
        <div class="box"><div class="label">เอกสารอ้างอิง</div><div class="value">${escapeHtml(bill.sourceDocNo || bill.docNo)}</div></div>
        <div class="box"><div class="label">สถานะใบรับเงิน</div><div class="value">${escapeHtml(receiptQueueStatusLabel(bill))}</div></div>
      </div>
      <div class="summary">
        <div class="box"><div class="label">ยอดรวมบิล</div><div class="value">${escapeHtml(formatMoney(bill.totalAmount))}</div></div>
        <div class="box"><div class="label">รับแล้ว</div><div class="value blue">${escapeHtml(formatMoney(receivedAmount))}</div></div>
        <div class="box"><div class="label">ค้างรับ</div><div class="value green">${escapeHtml(formatMoney(balance))}</div></div>
      </div>
      <div class="box" style="margin-top:12px"><div class="label">อายุเอกสาร</div><div class="value">${escapeHtml(String(ageInDays(bill.date)))} วัน</div></div>
    </div>
  </body></html>`
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
  resizeProps,
  sortKey,
}: {
  activeKey: TSortKey
  align: 'center' | 'left' | 'right'
  direction: 'asc' | 'desc'
  label: string
  onSort: (key: TSortKey) => void
  resizeProps?: ButtonHTMLAttributes<HTMLButtonElement>
  sortKey: TSortKey
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
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isPrintingDailyReport, setIsPrintingDailyReport] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const isSavingRef = useRef(false)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState(() => mode === 'payment' ? todayDateInput() : '')
  const [dateTo, setDateTo] = useState(() => mode === 'payment' ? todayDateInput() : '')
  const [accountFilter, setAccountFilter] = useState('')
  const [billSearch, setBillSearch] = useState('')
  const [billPage, setBillPage] = useState(1)
  const [billPageSize, setBillPageSize] = useState(25)
  const [billSort, setBillSort] = useState<PaymentBillSort>('date_desc')
  const [billSourceFilter, setBillSourceFilter] = useState<PaymentQueueSourceFilter>('all')
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(10)
  const [historySortField, setHistorySortField] = useState<HistorySortField>(mode === 'payment' ? 'date' : 'docNo')
  const [historySortDirection, setHistorySortDirection] = useState<'asc' | 'desc'>('desc')
  const [paymentHistoryStatusFilter, setPaymentHistoryStatusFilter] = useState<PaymentHistoryStatusFilter>('all')
  const [selectedReceiptIds, setSelectedReceiptIds] = useState<string[]>([])
  const [moneyTab, setMoneyTab] = useState<ReceiptTab>(initialTab)
  const [form, setForm] = useState<MoneyForm>(() => initialForm(mode))
  const [isBillLocked, setIsBillLocked] = useState(false)
  const [moneyDrafts, setMoneyDrafts] = useState<Record<string, string>>({})
  const [copiedAccountKey, setCopiedAccountKey] = useState<string | null>(null)
  const [cancelApprovalReason, setCancelApprovalReason] = useState('')
  const [cancelApprovalTarget, setCancelApprovalTarget] = useState<Bill | null>(null)
  const [isCancellingApproval, setIsCancellingApproval] = useState(false)
  const [cancelReceiptReason, setCancelReceiptReason] = useState('')
  const [cancelReceiptTarget, setCancelReceiptTarget] = useState<MoneyRow | null>(null)
  const [isCancellingReceipt, setIsCancellingReceipt] = useState(false)
  const [cancelPaymentReason, setCancelPaymentReason] = useState('')
  const [cancelPaymentTarget, setCancelPaymentTarget] = useState<MoneyRow | null>(null)
  const [isCancellingPayment, setIsCancellingPayment] = useState(false)
  const [invalidCancelReason, setInvalidCancelReason] = useState<'approval' | 'payment' | 'receipt' | null>(null)
  const [receiptBillDetailBill, setReceiptBillDetailBill] = useState<Bill | null>(null)
  const [receiptBillDetailOpen, setReceiptBillDetailOpen] = useState(false)
  const [receiptDetailOpen, setReceiptDetailOpen] = useState(false)
  const [receiptDetailRow, setReceiptDetailRow] = useState<MoneyRow | null>(null)
  const [paymentDetailOpen, setPaymentDetailOpen] = useState(false)
  const [paymentDetailRow, setPaymentDetailRow] = useState<MoneyRow | null>(null)
  const [paymentDetail, setPaymentDetail] = useState<PaymentHistoryDetail | null>(null)
  const [isPaymentDetailLoading, setIsPaymentDetailLoading] = useState(false)
  const [paymentDetailError, setPaymentDetailError] = useState<string | null>(null)
  const paymentQueueColumnResize = useResizableColumns(`daily.money-movement.${mode}.queue.v6`, paymentQueueColumns)
  const receiptQueueColumnResize = useResizableColumns('daily.money-movement.receipt.queue.compact.v2', receiptQueueColumns)
  const historyColumns = useMemo(() => mode === 'payment' ? paymentHistoryColumns : receiptHistoryColumns, [mode])
  const historyColumnResize = useResizableColumns(
    mode === 'receipt' ? 'daily.money-movement.receipt.history.v7' : 'daily.money-movement.payment.history.v6',
    historyColumns,
  )
  const historyTableColumnCount = historyColumns.length + (mode === 'receipt' && paymentHistoryStatusFilter === 'active' ? 1 : 0)

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
  const title = mode === 'payment' ? 'จ่ายเงินผู้รับเงิน' : 'รับเงินลูกค้า'
  const subtitle = mode === 'payment' ? 'Payment Voucher' : 'Receipt Voucher'
  const amountLabel = mode === 'payment' ? 'ยอดจ่าย' : 'ยอดรับ'
  const accountLabel = mode === 'payment' ? 'บัญชีที่จ่าย' : 'บัญชีที่รับเงิน'
  const partyLabel = mode === 'payment' ? 'ผู้รับเงิน' : 'ลูกค้า'
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
  const customerSearchOptions = useMemo<SearchComboboxOption[]>(() => (data.customers ?? [])
    .filter((customer) => customer.active !== false)
    .map((customer) => ({
      id: customer.id,
      label: customer.name,
      searchText: `${customer.id} ${customer.name}`.toLowerCase(),
    })), [data.customers])
  const supplierMap = useMemo(() => new Map((data.suppliers ?? []).map((supplier) => [supplier.id, supplier])), [data.suppliers])
  const billMap = useMemo(() => new Map(data.bills.map((bill) => [bill.id, bill])), [data.bills])
  const customerAdvanceMap = useMemo(() => new Map((data.customerAdvances ?? []).map((advance) => [advance.id, advance])), [data.customerAdvances])
  const paymentLines = useMemo(() => (mode === 'payment' ? (form as SupplierPaymentFormValues).lines ?? [] : []), [form, mode])
  const receiptLines = useMemo(() => (mode === 'receipt' ? (form as CustomerReceiptFormValues).salesBillLines ?? [] : []), [form, mode])
  const customerAdvanceReceiptLines = useMemo(() => (mode === 'receipt' ? (form as CustomerReceiptFormValues).customerAdvanceLines ?? [] : []), [form, mode])
  const receiptSourceType = mode === 'receipt' ? (form as CustomerReceiptFormValues).sourceType : 'SB'
  const selectedBill = form.billId ? billMap.get(form.billId) : null
  const selectedBillBalance = selectedBill ? (mode === 'payment' ? selectedBill.payableBalance ?? 0 : selectedBill.receivableBalance ?? 0) : 0
  const paymentLineBalanceTotal = paymentLines.reduce((sum, line) => sum + (billMap.get(line.billId)?.payableBalance ?? 0), 0)
  const formNetAmount = mode === 'payment'
    ? form.amount + form.fee
    : form.amount - form.fee - (receiptSourceType === 'SB' ? form.withholdingTax : 0)
  const paymentSplits = mode === 'payment' ? (form as SupplierPaymentFormValues).splits ?? [] : []
  const receiptSplits = mode === 'receipt' ? (form as CustomerReceiptFormValues).splits ?? [] : []
  const paymentSplitTotal = paymentSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0)
  const receiptSplitTotal = receiptSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0)

  const outstandingBills = useMemo(() => data.bills
    .filter((bill) => (mode === 'payment' ? (bill.payableBalance ?? 0) > 0 : (bill.receivableBalance ?? 0) > 0)), [data.bills, mode])
  const paymentSupplierId = mode === 'payment'
    ? paymentLines.find((line) => line.supplierId)?.supplierId ?? (form as SupplierPaymentFormValues).supplierId
    : ''
  const paymentMethodFilter = mode === 'payment'
    ? paymentLines
      .map((line) => billMap.get(line.billId)?.approvalPaymentMethod)
      .map(normalizedPaymentMethod)
      .find(Boolean) ?? normalizedPaymentMethod(form.method)
    : ''
  const paymentDestinationBill = mode === 'payment'
    ? paymentLines.map((line) => billMap.get(line.billId)).find((bill): bill is Bill => Boolean(bill))
    : undefined
  const paymentDestinationFilter = paymentDestinationBill ? paymentBillDestinationKey(paymentDestinationBill) : ''
  const paymentSelectableBills = useMemo(() => {
    if (mode !== 'payment') return outstandingBills
    return outstandingBills.filter((bill) => {
      const matchesSupplier = !paymentSupplierId || bill.supplierId === paymentSupplierId
      const matchesPaymentMethod = !paymentMethodFilter || normalizedPaymentMethod(bill.approvalPaymentMethod) === paymentMethodFilter
      const matchesDestination = !paymentDestinationFilter || paymentBillDestinationKey(bill) === paymentDestinationFilter
      return matchesSupplier && matchesPaymentMethod && matchesDestination
    })
  }, [mode, outstandingBills, paymentDestinationFilter, paymentMethodFilter, paymentSupplierId])
  const selectedPaymentBillIds = useMemo(() => new Set(paymentLines.map((line) => line.approvalId || line.billId).filter(Boolean)), [paymentLines])
  const selectedReceiptBillDocNos = useMemo(() => new Set(receiptLines.map((line) => line.salesBillDocNo).filter(Boolean)), [receiptLines])
  const selectedCustomerAdvanceDocNos = useMemo(() => new Set(customerAdvanceReceiptLines.map((line) => line.customerAdvanceDocNo).filter(Boolean)), [customerAdvanceReceiptLines])
  const receiptSelectableBills = useMemo(() => {
    if (mode !== 'receipt') return []
    const customerId = (form as CustomerReceiptFormValues).customerId
    return data.bills.filter((bill) => !customerId || bill.customerId === customerId)
  }, [data.bills, form, mode])
  const receiptSelectableCustomerAdvances = useMemo(() => {
    if (mode !== 'receipt') return []
    const customerId = (form as CustomerReceiptFormValues).customerId
    return (data.customerAdvances ?? []).filter((advance) => !customerId || advance.customerId === customerId)
  }, [data.customerAdvances, form, mode])
  const supplierBills = useMemo(() => {
    if (mode !== 'payment') return []
    const query = billSearch.trim().toLowerCase()
    const accountQuery = query && /^[\d\s./\\_-]+$/.test(query) ? sanitizeAccountNo(query) : ''
    return data.bills.filter((bill) => {
      const supplierName = partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? ''
      const balance = bill.payableBalance ?? 0
      const status = paymentBillStatus(bill)
      const supplier = supplierMap.get(bill.supplierId ?? '')
      const approvalAccounts = approvalBankAccountLines(bill)
      const supplierBankAccounts = approvalAccounts.length > 0 ? approvalAccounts : supplierBankAccountLines(supplier, paymentMethods)
      const searchHaystack = [
        bill.id,
        bill.docNo,
        bill.approvalId ?? '',
        bill.sourceDocNo ?? '',
        supplierName,
        bill.date ?? '',
        bill.approvalPaymentMethod ?? '',
        paymentSourceTypeLabel(bill.sourceType),
        supplierBankAccounts.map((account) => `${account.bankName} ${account.accountNo}`).join(' '),
      ].join(' ').toLowerCase()
      const matchesSearch = !query
        || searchHaystack.includes(query)
        || Boolean(accountQuery && supplierBankAccounts.some((account) => account.accountNo.includes(accountQuery)))
      const matchesStatus = balance > 0 && status !== 'cancelled'
      const matchesSource = billSourceFilter === 'all' || bill.sourceType === billSourceFilter
      return matchesSearch && matchesSource && matchesStatus
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
        case 'source_asc':
          return String(left.sourceDocNo ?? left.docNo).localeCompare(String(right.sourceDocNo ?? right.docNo), 'th')
        case 'source_desc':
          return String(right.sourceDocNo ?? right.docNo).localeCompare(String(left.sourceDocNo ?? left.docNo), 'th')
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
  }, [billSearch, billSort, billSourceFilter, data.bills, mode, partyMap, paymentMethods, supplierMap])

  const receiptBills = useMemo(() => {
    if (mode !== 'receipt') return []
    const query = billSearch.trim().toLowerCase()
    return data.bills.filter((bill) => {
      const customerName = partyMap.get(bill.customerId ?? '') ?? bill.customerId ?? ''
      const balance = bill.receivableBalance ?? 0
      const searchHaystack = [
        receiptQueueDocNo(bill),
        ...(bill.activeReceiptDocNos ?? []),
        bill.id,
        bill.docNo,
        customerName,
        bill.customerId ?? '',
        bill.date ?? '',
      ].join(' ').toLowerCase()
      const matchesSearch = !query || searchHaystack.includes(query)
      return matchesSearch && balance > 0
    }).sort((left, right) => {
      const leftCustomerName = partyMap.get(left.customerId ?? '') ?? left.customerId ?? ''
      const rightCustomerName = partyMap.get(right.customerId ?? '') ?? right.customerId ?? ''
      switch (billSort) {
        case 'age_asc':
          return ageInDays(left.date) - ageInDays(right.date)
        case 'age_desc':
          return ageInDays(right.date) - ageInDays(left.date)
        case 'balance_asc':
          return (left.receivableBalance ?? 0) - (right.receivableBalance ?? 0)
        case 'balance_desc':
          return (right.receivableBalance ?? 0) - (left.receivableBalance ?? 0)
        case 'date_asc':
          return String(left.date ?? '').localeCompare(String(right.date ?? ''))
        case 'date_desc':
          return String(right.date ?? '').localeCompare(String(left.date ?? ''))
        case 'doc_asc':
          return receiptQueueDocNo(left).localeCompare(receiptQueueDocNo(right), 'th')
        case 'doc_desc':
          return receiptQueueDocNo(right).localeCompare(receiptQueueDocNo(left), 'th')
        case 'paid_asc':
          return (left.paidAmount ?? 0) - (right.paidAmount ?? 0)
        case 'paid_desc':
          return (right.paidAmount ?? 0) - (left.paidAmount ?? 0)
        case 'source_asc':
          return left.docNo.localeCompare(right.docNo, 'th')
        case 'source_desc':
          return right.docNo.localeCompare(left.docNo, 'th')
        case 'supplier_asc':
          return leftCustomerName.localeCompare(rightCustomerName, 'th')
        case 'supplier_desc':
          return rightCustomerName.localeCompare(leftCustomerName, 'th')
        case 'total_asc':
          return (left.totalAmount ?? 0) - (right.totalAmount ?? 0)
        case 'total_desc':
          return (right.totalAmount ?? 0) - (left.totalAmount ?? 0)
        default:
          return String(right.date ?? '').localeCompare(String(left.date ?? ''))
      }
    })
  }, [billSearch, billSort, data.bills, mode, partyMap])

  const supplierBillTotalRows = supplierBills.length
  const supplierBillTotalPages = Math.max(1, Math.ceil(supplierBillTotalRows / billPageSize))
  const supplierBillCurrentPage = Math.min(billPage, supplierBillTotalPages)
  const supplierBillPageRows = supplierBills.slice((supplierBillCurrentPage - 1) * billPageSize, supplierBillCurrentPage * billPageSize)
  const receiptBillTotalRows = receiptBills.length
  const receiptBillTotalPages = Math.max(1, Math.ceil(receiptBillTotalRows / billPageSize))
  const receiptBillCurrentPage = Math.min(billPage, receiptBillTotalPages)
  const receiptBillPageRows = receiptBills.slice((receiptBillCurrentPage - 1) * billPageSize, receiptBillCurrentPage * billPageSize)
  const entryBillTotalPages = mode === 'payment' ? supplierBillTotalPages : receiptBillTotalPages
  const hasActiveBillFilters = billSearch.trim() !== '' || billSort !== 'date_desc' || billSourceFilter !== 'all'
  useEffect(() => {
    setBillPage(1)
  }, [billPageSize, billSearch, billSort, billSourceFilter])

  useEffect(() => {
    if (billPage > entryBillTotalPages) setBillPage(entryBillTotalPages)
  }, [billPage, entryBillTotalPages])

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
      const matchesAccount = matchesMoneyAccountFilter(row, accountFilter)
      const matchesFrom = !dateFrom || row.date >= dateFrom
      const matchesTo = !dateTo || row.date <= dateTo
      const matchesHistoryStatus = paymentHistoryStatusFilter === 'all'
        || (paymentHistoryStatusFilter === 'active' ? row.status !== 'cancelled' : row.status === 'cancelled')
      return matchesSearch && matchesAccount && matchesFrom && matchesTo && matchesHistoryStatus
    })
  }, [accountFilter, data.rows, dateFrom, dateTo, paymentHistoryStatusFilter, search])

  const historyRows = useMemo(() => {
    return [...rows].sort((left, right) => {
      const leftValue = moneyHistorySortValue(left, historySortField, mode)
      const rightValue = moneyHistorySortValue(right, historySortField, mode)
      const base = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'th')
      return historySortDirection === 'asc' ? base : -base
    })
  }, [historySortDirection, historySortField, mode, rows])

  const historyTotalRows = historyRows.length
  const historyTotalPages = Math.max(1, Math.ceil(historyTotalRows / historyPageSize))
  const historyCurrentPage = Math.min(historyPage, historyTotalPages)
  const historyPageRows = historyRows.slice((historyCurrentPage - 1) * historyPageSize, historyCurrentPage * historyPageSize)
  const hasActiveHistoryFilters = search.trim() !== ''
    || (mode === 'payment' ? dateFrom !== todayDateInput() || dateTo !== todayDateInput() : dateFrom !== '' || dateTo !== '')
    || accountFilter !== ''
    || paymentHistoryStatusFilter !== 'all'

  const receiptHistoryMetrics = useMemo(() => summarizeActiveReceiptRows(rows), [rows])
  const receiptOutstandingAmount = useMemo(
    () => outstandingBills.reduce((sum, bill) => sum + (bill.receivableBalance ?? 0), 0),
    [outstandingBills],
  )

  const paymentQueueMetrics = useMemo(() => ({
    maxAgeDays: outstandingBills.reduce((maxAge, bill) => Math.max(maxAge, ageInDays(bill.date)), 0),
    outstanding: outstandingBills.reduce((sum, bill) => sum + (bill.payableBalance ?? 0), 0),
  }), [outstandingBills])

  const paymentHistoryMetrics = useMemo(() => {
    const pmtRows = rows.filter((row) => row.docNo.trim().toUpperCase().startsWith('PMT'))
    const paidRows = pmtRows.filter((row) => row.status !== 'cancelled')
    return {
      approvalOnlyCount: rows.length - pmtRows.length,
      cancelledCount: pmtRows.length - paidRows.length,
      fee: paidRows.reduce((sum, row) => sum + (row.fee ?? 0), 0),
      grossOut: paidRows.reduce((sum, row) => sum + row.amount, 0),
      netOut: paidRows.reduce((sum, row) => sum + row.netAmount, 0),
      paidCount: paidRows.length,
      totalCount: pmtRows.length,
    }
  }, [rows])

  useEffect(() => {
    setHistoryPage(1)
  }, [search, dateFrom, dateTo, accountFilter, historyPageSize, historySortField, historySortDirection, paymentHistoryStatusFilter])

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages)
  }, [historyPage, historyTotalPages])

  useEffect(() => {
    setSelectedReceiptIds([])
  }, [paymentHistoryStatusFilter, moneyTab, mode, dateFrom, dateTo, search, accountFilter])

  const isAllPageSelected = useMemo(() => {
    return historyPageRows.length > 0 && historyPageRows.every((row) => selectedReceiptIds.includes(row.id))
  }, [historyPageRows, selectedReceiptIds])

  const toggleAllPageRows = useCallback(() => {
    if (isAllPageSelected) {
      setSelectedReceiptIds((prev) => prev.filter((id) => !historyPageRows.some((row) => row.id === id)))
    } else {
      setSelectedReceiptIds((prev) => {
        const next = [...prev]
        historyPageRows.forEach((row) => {
          if (!next.includes(row.id)) {
            next.push(row.id)
          }
        })
        return next
      })
    }
  }, [isAllPageSelected, historyPageRows])

  const toggleRowSelection = useCallback((rowId: string) => {
    setSelectedReceiptIds((prev) =>
      prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
    )
  }, [])

  function openForm() {
    setForm(initialForm(mode))
    setMoneyDrafts({})
    setIsBillLocked(false)
    setError(null)
    setFormOpen(true)
  }

  function openFormForBill(bill: Bill) {
    if (mode === 'receipt') {
      const amount = roundMoney(bill.receivableBalance && bill.receivableBalance > 0 ? bill.receivableBalance : bill.totalAmount)
      setForm({
        ...initialForm(mode),
        amount,
        billId: bill.id,
        customerId: bill.customerId ?? '',
        docNo: bill.activeReceiptDocNos?.[0] ?? null,
        salesBillLines: [{
          ...newReceiptLine(),
          receiptAmount: amount,
          salesBillDocNo: bill.docNo,
        }],
        splits: [{ ...newReceiptSplit(), amount }],
      } as MoneyForm)
      setMoneyDrafts({})
      setIsBillLocked(true)
      setError(null)
      setFormOpen(true)
      return
    }

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
      method: normalizePaymentMethod(bill.approvalPaymentMethod),
      splits: [{ ...newPaymentSplit(), amount: netAmount }],
      supplierId: bill.supplierId ?? '',
    } as unknown as MoneyForm)
    setMoneyDrafts({})
    setIsBillLocked(true)
    setError(null)
    setFormOpen(true)
  }

  function openFormForReceipt(row: MoneyRow) {
    if (mode !== 'receipt' || row.status === 'cancelled') return
    const lines = (row.receiptLines?.length ? row.receiptLines : [{
      discountAmount: row.discount ?? 0,
      receiptAmount: row.amount,
      salesBillDocNo: row.billId,
      withholdingTaxAmount: row.withholdingTax ?? 0,
    }]).map((line) => ({
      ...newReceiptLine(),
      discountAmount: line.discountAmount,
      receiptAmount: line.receiptAmount,
      salesBillDocNo: line.salesBillDocNo,
      withholdingTaxAmount: line.withholdingTaxAmount,
    }))
    setForm({
      ...initialForm(mode),
      accountId: row.accountId,
      amount: row.amount,
      billId: lines[0]?.salesBillDocNo ?? null,
      customerId: row.customerId ?? '',
      date: row.date,
      discount: roundMoney(lines.reduce((sum, line) => sum + line.discountAmount, 0)),
      fee: row.fee ?? 0,
      id: row.docNo,
      sourceType: row.sourceType ?? 'SB',
      salesBillLines: row.sourceType === 'CADV' ? [] : lines,
      customerAdvanceLines: row.customerAdvanceLines?.map((line) => ({
        ...newCustomerAdvanceReceiptLine(),
        customerAdvanceDocNo: line.customerAdvanceDocNo,
        receiptAmount: line.receiptAmount,
        id: `${row.docNo}-cadv-${line.lineNo}`,
      })) ?? [],
      method: row.method ?? '',
      notes: row.notes ?? null,
      splits: row.accountSplits?.length
        ? row.accountSplits.map((split) => {
          const nextSplit = newReceiptSplit()
          return {
            ...nextSplit,
            accountId: split.accountId,
            amount: split.amount,
            id: split.id ?? nextSplit.id,
          }
        })
        : [{ ...newReceiptSplit(), accountId: row.accountId ?? '', amount: row.netAmount }],
      withholdingTax: roundMoney(lines.reduce((sum, line) => sum + line.withholdingTaxAmount, 0)),
    } as MoneyForm)
    setMoneyDrafts({})
    setIsBillLocked(false)
    setError(null)
    setFormOpen(true)
    setMoneyTab('entry')
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
    setCancelReceiptTarget(null)
    setReceiptBillDetailBill(null)
    setReceiptBillDetailOpen(false)
    setReceiptDetailOpen(false)
    setReceiptDetailRow(null)
    setPaymentDetailOpen(false)
    setPaymentDetail(null)
    setPaymentDetailRow(null)
    setSearch('')
    setDateFrom(mode === 'payment' && value === 'history' ? todayDateInput() : '')
    setDateTo(mode === 'payment' && value === 'history' ? todayDateInput() : '')
    setAccountFilter('')
    setPaymentHistoryStatusFilter('all')
    setBillSearch('')
    setBillSort('date_desc')
    setBillSourceFilter('all')
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
      source: 'sourceDocNo',
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
      sourceDocNo: 'source',
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

  function getDailyMoneyPrintRows() {
    const query = search.trim().toLowerCase()
    const printDateFrom = dateFrom || todayDateInput()
    const printDateTo = dateTo || dateFrom || todayDateInput()
    const docPrefix = mode === 'receipt' ? 'RCP' : 'PMT'
    return data.rows
      .filter((row) => row.docNo.startsWith(docPrefix))
      .filter((row) => {
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
        const matchesFrom = row.date >= printDateFrom
        const matchesTo = row.date <= printDateTo
        const matchesPaymentStatus = paymentHistoryStatusFilter === 'all'
          || (paymentHistoryStatusFilter === 'active' ? row.status !== 'cancelled' : row.status === 'cancelled')
        return matchesSearch && matchesAccount && matchesFrom && matchesTo && matchesPaymentStatus
      })
      .sort((left, right) => `${left.date}-${left.docNo}`.localeCompare(`${right.date}-${right.docNo}`, 'th'))
  }

  async function printDailyMoneyReport() {
    const reportTitle = mode === 'receipt' ? 'รายงานประวัติการรับเงินประจำวัน' : 'รายงานประวัติการจ่ายเงินประจำวัน'
    const printWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
    if (!printWindow) {
      setError('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
      return
    }
    printWindow.document.open()
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมรายงาน</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียม${escapeHtml(reportTitle)}...</body></html>`)
    printWindow.document.close()
    printWindow.focus()
    setIsPrintingDailyReport(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/company-profile', { cache: 'no-store' })
      const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
      const profile = companyProfileForPrint(payload)
      const printRows = getDailyMoneyPrintRows()
      printWindow.document.open()
      printWindow.document.write(buildPaymentDailyReportHtml(printRows, profile, {
        dateFrom: dateFrom || todayDateInput(),
        dateTo: dateTo || dateFrom || todayDateInput(),
        kind: mode,
        printedAt: new Date(),
      }))
      printWindow.document.close()
      printWindow.focus()
    } catch (caught) {
      printWindow.close()
      setError(caught instanceof Error ? caught.message : 'พิมพ์รายงานประจำวันไม่ได้')
    } finally {
      setIsPrintingDailyReport(false)
    }
  }

  function printSelectedReceipts() {
    const rowsToPrint = rows.filter((row) => selectedReceiptIds.includes(row.id))
    if (rowsToPrint.length === 0) return
    const printWindow = window.open('', '_blank', 'width=960,height=900,scrollbars=yes')
    if (!printWindow) {
      setError('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
      return
    }
    printWindow.document.open()
    printWindow.document.write(buildBatchReceiptPrintHtml(rowsToPrint))
    printWindow.document.close()
    printWindow.focus()
  }

  function openReceiptDetail(row: MoneyRow) {
    if (mode !== 'receipt') return
    setReceiptDetailRow(row)
    setReceiptDetailOpen(true)
  }

  function printCustomerReceipt(row: MoneyRow) {
    const printWindow = window.open('', '_blank', 'width=960,height=900,scrollbars=yes')
    if (!printWindow) {
      setError('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
      return
    }
    printWindow.document.open()
    printWindow.document.write(buildCustomerReceiptPrintHtml(row))
    printWindow.document.close()
    printWindow.focus()
  }

  function openReceivableBillDetail(bill: Bill) {
    setReceiptBillDetailBill(bill)
    setReceiptBillDetailOpen(true)
  }

  function printReceivableBill(bill: Bill) {
    const printWindow = window.open('', '_blank', 'width=960,height=900,scrollbars=yes')
    if (!printWindow) {
      setError('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
      return
    }
    const customerName = partyMap.get(bill.customerId ?? '') ?? bill.customerId ?? '-'
    printWindow.document.open()
    printWindow.document.write(buildReceivableBillPrintHtml(bill, customerName))
    printWindow.document.close()
    printWindow.focus()
  }

  function findActiveReceiptForBill(bill: Bill) {
    const billDocNo = bill.docNo
    const activeReceiptDocNos = bill.activeReceiptDocNos ?? []
    const matchedRow = data.rows.find((row) => {
      const status = String(row.status ?? '').toLowerCase()
      if (status === 'cancelled' || status === 'canceled') return false
      if (activeReceiptDocNos.includes(row.docNo)) return true
      if (row.billId === billDocNo || row.billDocNo === billDocNo) return true
      if (row.billDocNos?.includes(billDocNo)) return true
      return row.receiptLines?.some((line) => line.salesBillDocNo === billDocNo) ?? false
    })
    if (matchedRow) return matchedRow
    const receiptDocNo = activeReceiptDocNos[0]
    if (!receiptDocNo) return null
    const customerName = partyMap.get(bill.customerId ?? '') ?? bill.customerId ?? '-'
    const amount = bill.receivableBalance ?? bill.totalAmount ?? 0
    const receiptStatus = bill.receiptStatus ?? 'pending'
    return {
      accountName: '-',
      amount,
      billDocNos: [billDocNo],
      billId: billDocNo,
      customerId: bill.customerId ?? undefined,
      date: bill.date ?? todayDateInput(),
      docNo: receiptDocNo,
      fee: 0,
      id: receiptDocNo,
      method: '-',
      netAmount: amount,
      notes: '',
      partyName: customerName,
      receiptLines: [{
        discountAmount: 0,
        lineNo: 1,
        receiptAmount: amount,
        salesBillDocNo: billDocNo,
        withholdingTaxAmount: 0,
      }],
      status: receiptStatus,
      withholdingTax: 0,
    } satisfies MoneyRow
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

  function syncReceiptLines(nextLines: ReceiptLine[], patch: Partial<CustomerReceiptFormValues> = {}) {
    const normalizedLines = nextLines.length > 0 ? nextLines.map((line) => ({
      ...line,
      discountAmount: roundMoney(Number(line.discountAmount) || 0),
      receiptAmount: roundMoney(Number(line.receiptAmount) || 0),
      salesBillDocNo: line.salesBillDocNo,
      withholdingTaxAmount: roundMoney(Number(line.withholdingTaxAmount) || 0),
    })) : [newReceiptLine()]
    const firstBill = billMap.get(normalizedLines.find((line) => line.salesBillDocNo)?.salesBillDocNo ?? '')
    const nextAmount = roundMoney(normalizedLines.reduce((sum, line) => sum + line.receiptAmount, 0))
    const nextDiscount = roundMoney(normalizedLines.reduce((sum, line) => sum + line.discountAmount, 0))
    const nextWithholdingTax = roundMoney(normalizedLines.reduce((sum, line) => sum + line.withholdingTaxAmount, 0))
    const nextFee = Number((form as CustomerReceiptFormValues).fee) || 0
    const nextNetAmount = roundMoney(nextAmount - nextFee - (receiptSourceType === 'SB' ? nextWithholdingTax : 0))
    const nextSplits = ((form as CustomerReceiptFormValues).splits ?? []).map((split, splitIndex, splits) => (
      splitIndex === 0 && splits.length === 1 ? { ...split, amount: nextNetAmount } : split
    ))
    const nextCustomerId = patch.customerId ?? ((form as CustomerReceiptFormValues).customerId || firstBill?.customerId || '')
    setForm({
      ...form,
      ...patch,
      amount: nextAmount,
      billId: normalizedLines.find((line) => line.salesBillDocNo)?.salesBillDocNo ?? null,
      customerId: nextCustomerId,
      discount: nextDiscount,
      salesBillLines: normalizedLines,
      splits: nextSplits,
      withholdingTax: nextWithholdingTax,
    } as MoneyForm)
  }

  function updateReceiptForm(patch: Partial<CustomerReceiptFormValues>) {
    setError(null)
    const nextAmount = Number(form.amount) || 0
    const nextWithholdingTax = Number(form.withholdingTax) || 0
    const nextFee = 'fee' in patch ? Number(patch.fee) || 0 : Number(form.fee) || 0
    const nextNetAmount = roundMoney(nextAmount - nextFee - (receiptSourceType === 'SB' ? nextWithholdingTax : 0))
    const nextSplits = receiptSplits.map((split, splitIndex, splits) => (
      splitIndex === 0 && splits.length === 1 ? { ...split, amount: nextNetAmount } : split
    ))
    setForm({
      ...form,
      ...patch,
      fee: nextFee,
      splits: nextSplits,
    } as MoneyForm)
  }

  function syncCustomerAdvanceReceiptLines(nextLines: CustomerAdvanceReceiptLine[], patch: Partial<CustomerReceiptFormValues> = {}) {
    const normalizedLines = nextLines.length > 0 ? nextLines.map((line) => ({
      ...line,
      customerAdvanceDocNo: line.customerAdvanceDocNo,
      receiptAmount: roundMoney(Number(line.receiptAmount) || 0),
    })) : [newCustomerAdvanceReceiptLine()]
    const firstAdvance = customerAdvanceMap.get(normalizedLines.find((line) => line.customerAdvanceDocNo)?.customerAdvanceDocNo ?? '')
    const nextAmount = roundMoney(normalizedLines.reduce((sum, line) => sum + line.receiptAmount, 0))
    const nextFee = Number((form as CustomerReceiptFormValues).fee) || 0
    const nextSplits = ((form as CustomerReceiptFormValues).splits ?? []).map((split, splitIndex, splits) => (
      splitIndex === 0 && splits.length === 1 ? { ...split, amount: roundMoney(nextAmount - nextFee) } : split
    ))
    setForm({
      ...form,
      ...patch,
      amount: nextAmount,
      billId: null,
      customerId: patch.customerId ?? ((form as CustomerReceiptFormValues).customerId || firstAdvance?.customerId || ''),
      customerAdvanceLines: normalizedLines,
      salesBillLines: [],
      discount: 0,
      sourceType: 'CADV',
      splits: nextSplits,
      withholdingTax: 0,
    } as MoneyForm)
  }

  function selectCustomerAdvanceLine(index: number, docNo: string) {
    const advance = customerAdvanceMap.get(docNo)
    const nextLines = customerAdvanceReceiptLines.map((line, lineIndex) => {
      if (lineIndex !== index) return line
      return {
        ...line,
        customerAdvanceDocNo: docNo,
        receiptAmount: advance?.availableAmount ?? 0,
      }
    })
    syncCustomerAdvanceReceiptLines(nextLines, { customerId: advance?.customerId ?? (form as CustomerReceiptFormValues).customerId })
  }

  function updateCustomerAdvanceReceiptLine(index: number, patch: Partial<CustomerAdvanceReceiptLine>) {
    setError(null)
    syncCustomerAdvanceReceiptLines(customerAdvanceReceiptLines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
  }

  function addCustomerAdvanceReceiptLine() {
    syncCustomerAdvanceReceiptLines([...customerAdvanceReceiptLines, newCustomerAdvanceReceiptLine()])
  }

  function removeCustomerAdvanceReceiptLine(index: number) {
    if (customerAdvanceReceiptLines.length <= 1) return
    syncCustomerAdvanceReceiptLines(customerAdvanceReceiptLines.filter((_, lineIndex) => lineIndex !== index))
  }

  function changeReceiptSourceType(sourceType: 'SB' | 'CADV') {
    const receiptForm = form as CustomerReceiptFormValues
    setError(null)
    setForm({
      ...receiptForm,
      amount: 0,
      billId: null,
      customerAdvanceLines: sourceType === 'CADV' ? [newCustomerAdvanceReceiptLine()] : [],
      discount: 0,
      salesBillLines: sourceType === 'SB' ? [newReceiptLine()] : [],
      sourceType,
      splits: [{ ...newReceiptSplit(), accountId: receiptForm.accountId, method: receiptForm.method, amount: 0 }],
      withholdingTax: 0,
    })
  }

  function receiptSelectableBillsForLine(index: number) {
    const currentDocNo = receiptLines[index]?.salesBillDocNo ?? ''
    return receiptSelectableBills.filter((bill) => (
      bill.docNo === currentDocNo
      || ((bill.receivableBalance ?? 0) > 0 && !selectedReceiptBillDocNos.has(bill.docNo))
    ))
  }

  function selectReceiptLineBill(index: number, docNo: string) {
    const bill = billMap.get(docNo)
    if (!bill) {
      syncReceiptLines(receiptLines.map((line, lineIndex) => lineIndex === index ? { ...line, receiptAmount: 0, salesBillDocNo: docNo } : line))
      return
    }
    const amount = roundMoney(bill.receivableBalance && bill.receivableBalance > 0 ? bill.receivableBalance : bill.totalAmount)
    syncReceiptLines(receiptLines.map((line, lineIndex) => (
      lineIndex === index
        ? { ...line, discountAmount: 0, receiptAmount: amount, salesBillDocNo: bill.docNo, withholdingTaxAmount: 0 }
        : line
    )), { customerId: bill.customerId ?? (form as CustomerReceiptFormValues).customerId })
  }

  function updateReceiptLine(index: number, patch: Partial<ReceiptLine>) {
    setError(null)
    syncReceiptLines(receiptLines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)))
  }

  function addReceiptLine() {
    syncReceiptLines([...receiptLines, newReceiptLine()])
  }

  function removeReceiptLine(index: number) {
    if (receiptLines.length <= 1) return
    syncReceiptLines(receiptLines.filter((_, lineIndex) => lineIndex !== index))
  }

  function changeReceiptCustomer(customerId: string) {
    if (receiptSourceType === 'CADV') {
      const nextLines = customerAdvanceReceiptLines.map((line) => {
        const advance = customerAdvanceMap.get(line.customerAdvanceDocNo)
        return advance && advance.customerId !== customerId ? newCustomerAdvanceReceiptLine() : line
      })
      syncCustomerAdvanceReceiptLines(nextLines, { customerId })
      return
    }
    const nextLines = receiptLines.map((line) => {
      const bill = billMap.get(line.salesBillDocNo)
      return bill && bill.customerId !== customerId ? newReceiptLine() : line
    })
    syncReceiptLines(nextLines, { customerId })
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

  function syncReceiptSplits(nextSplits: ReceiptSplit[]) {
    const firstAccountId = nextSplits[0]?.accountId ?? ''
    setForm({ ...form, accountId: firstAccountId, splits: nextSplits } as MoneyForm)
  }

  function addReceiptSplit() {
    syncReceiptSplits([...receiptSplits, newReceiptSplit()])
  }

  function removeReceiptSplit(index: number) {
    if (receiptSplits.length <= 1) return
    syncReceiptSplits(receiptSplits.filter((_, splitIndex) => splitIndex !== index))
  }

  function updateReceiptSplit(index: number, patch: Partial<ReceiptSplit>) {
    setError(null)
    syncReceiptSplits(receiptSplits.map((split, splitIndex) => {
      if (splitIndex !== index) return split
      const nextSplit = { ...split, ...patch }
      if ('accountId' in patch && receiptSplits.length === 1 && (Number(nextSplit.amount) || 0) <= 0) {
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

  function normalizedReceiptForm() {
    const receiptForm = form as CustomerReceiptFormValues
    const normalizedSplits = (receiptForm.splits ?? []).map((split) => ({ ...split }))
    const payloadLines = (receiptForm.salesBillLines ?? [])
      .filter((line) => line.salesBillDocNo && Number(line.receiptAmount) > 0)
      .map((line) => ({
        ...line,
        discountAmount: roundMoney(Number(line.discountAmount) || 0),
        receiptAmount: roundMoney(Number(line.receiptAmount) || 0),
        withholdingTaxAmount: roundMoney(Number(line.withholdingTaxAmount) || 0),
      }))
    return {
      ...receiptForm,
      amount: roundMoney(payloadLines.reduce((sum, line) => sum + line.receiptAmount, 0)),
      billId: payloadLines[0]?.salesBillDocNo ?? null,
      discount: roundMoney(payloadLines.reduce((sum, line) => sum + line.discountAmount, 0)),
      accountId: normalizedSplits[0]?.accountId ?? receiptForm.accountId,
      method: normalizedSplits[0]?.method ?? receiptForm.method ?? '',
      sourceType: receiptForm.sourceType,
      salesBillLines: receiptForm.sourceType === 'SB' ? payloadLines : [],
      customerAdvanceLines: receiptForm.sourceType === 'CADV'
        ? (receiptForm.customerAdvanceLines ?? []).filter((line) => line.customerAdvanceDocNo && Number(line.receiptAmount) > 0).map((line) => ({
          ...line,
          receiptAmount: roundMoney(Number(line.receiptAmount) || 0),
        }))
        : [],
      splits: normalizedSplits,
      withholdingTax: roundMoney(payloadLines.reduce((sum, line) => sum + line.withholdingTaxAmount, 0)),
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSavingRef.current) return
    const payload = mode === 'payment' ? normalizedPaymentForm() : normalizedReceiptForm()
    const parsed = (mode === 'payment' ? supplierPaymentFormSchema : customerReceiptFormSchema).safeParse(payload)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง')
      return
    }
    if (mode === 'payment' && Math.abs(paymentSplitTotal - formNetAmount) > 0.01) {
      setError('รวมยอดแยกบัญชีต้องเท่ากับยอดสุทธิที่ต้องจ่าย')
      return
    }
    if (mode === 'payment') {
      const paymentPayload = payload as SupplierPaymentFormValues
      for (const split of paymentPayload.splits) {
        const account = activeAccounts.find((a) => a.id === split.accountId)
        if (account) {
          const splitAmount = Number(split.amount) || 0
          const available = (account.balance ?? 0) + (account.subtype === 'current' ? (account.odLimit ?? 0) : 0)
          if (splitAmount > available + 0.01) {
            setError('ยอดจ่ายเกินยอดเงินคงเหลือและวงเงิน OD ที่ใช้ได้ กรุณาลดจำนวนหรือเพิ่มบัญชีจ่าย')
            return
          }
        }
      }
    }
    if (mode === 'receipt' && Math.abs(receiptSplitTotal - formNetAmount) > 0.01) {
      setError('รวมยอดแยกบัญชีรับเงินต้องเท่ากับยอดสุทธิที่ต้องรับ')
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
      setInvalidCancelReason('approval')
      setError('กรุณาระบุเหตุผลการยกเลิก')
      return
    }
    setInvalidCancelReason(null)
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

  async function cancelCustomerReceiptRow() {
    if (!cancelReceiptTarget) return
    if (!cancelReceiptReason.trim()) {
      setInvalidCancelReason('receipt')
      setError('กรุณาระบุเหตุผลการยกเลิก')
      return
    }
    setInvalidCancelReason(null)
    setIsCancellingReceipt(true)
    setError(null)
    try {
      await dailyFetchJson('/api/sales/receipts', {
        body: JSON.stringify({
          action: 'cancel',
          docNo: cancelReceiptTarget.docNo,
          reason: cancelReceiptReason.trim(),
        }),
        method: 'PATCH',
      })
      setCancelReceiptTarget(null)
      setCancelReceiptReason('')
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิกรับเงินลูกค้าไม่ได้')
    } finally {
      setIsCancellingReceipt(false)
    }
  }

  async function cancelPaymentRow() {
    if (!cancelPaymentTarget) return
    if (!cancelPaymentReason.trim()) {
      setInvalidCancelReason('payment')
      setError('กรุณาระบุเหตุผลการยกเลิก')
      return
    }
    setInvalidCancelReason(null)
    setIsCancellingPayment(true)
    setError(null)
    try {
      await dailyFetchJson('/api/purchase/payments/cancel', {
        body: JSON.stringify({
          voucherId: cancelPaymentTarget.id,
          reason: cancelPaymentReason.trim(),
        }),
        method: 'POST',
      })
      setCancelPaymentTarget(null)
      setCancelPaymentReason('')
      setPaymentDetailOpen(false)
      setPaymentDetailRow(null)
      setPaymentDetail(null)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ยกเลิกจ่ายเงินไม่ได้')
    } finally {
      setIsCancellingPayment(false)
    }
  }

  const billSortState = billSortParts()

  return (
    <section className="space-y-5">
      {error && !formOpen ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      {mode === 'payment' && showEntrySection ? (
        <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4">
          <KpiCard label="ยอดรอจ่าย" value={formatMoney(paymentQueueMetrics.outstanding)} tone="violet" />
          <KpiCard label="อายุเอกสารสูงสุด" value={`${paymentQueueMetrics.maxAgeDays.toLocaleString('th-TH')} วัน`} tone="amber" />
        </div>
      ) : mode === 'payment' ? (
        <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4 lg:grid-cols-3">
          <KpiCard label="ยอดจ่ายแล้ว" value={formatMoney(paymentHistoryMetrics.grossOut)} tone="emerald" />
          <KpiCard label="ค่าธรรมเนียมธนาคาร" value={formatMoney(paymentHistoryMetrics.fee)} tone="amber" />
          <div className="col-span-2 lg:col-span-1">
            <KpiCard label="เงินออกสุทธิ" value={formatMoney(paymentHistoryMetrics.netOut)} tone="blue" />
          </div>
        </div>
      ) : showHistorySection ? (
        <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4 lg:grid-cols-4">
          <KpiCard label="ยอดรับแล้ว" value={formatMoney(receiptHistoryMetrics.amount)} tone="emerald" />
          <KpiCard label="ภาษีหัก ณ ที่จ่าย" value={formatMoney(receiptHistoryMetrics.withholdingTax)} tone="amber" />
          <KpiCard label="ค่าธรรมเนียมธนาคาร" value={formatMoney(receiptHistoryMetrics.fee)} tone="amber" />
          <KpiCard label="เงินเข้าสุทธิ" value={formatMoney(receiptHistoryMetrics.netAmount)} tone="blue" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4">
          <KpiCard label="ยอดค้างรับ" value={formatMoney(receiptOutstandingAmount)} tone="violet" />
          <KpiCard label="บิลค้างรับ" value={`${outstandingBills.length.toLocaleString('th-TH')} รายการ`} tone="amber" />
        </div>
      )}

      {showMoneyTabs ? (
        <Tabs
          className="gap-0"
          value={moneyTab}
          onValueChange={(value) => switchMoneyTab(value as ReceiptTab)}
        >
          <TabsList className="w-full" variant="line">
            <TabsTrigger value="entry" variant="line">{mode === 'payment' ? 'จ่ายเงิน' : 'รับเงินลูกค้า'}</TabsTrigger>
            <TabsTrigger value="history" variant="line">{mode === 'payment' ? 'ประวัติ' : 'ประวัติการรับเงิน'}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {mode === 'receipt' && showEntrySection ? (
        <>
          <div className="space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <UiInput
                className="h-9 min-w-[260px] flex-1 rounded-md"
                placeholder="ค้นหาใบรับเงิน / Sales Bill / ลูกค้า / วันที่"
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
            <div className="hidden justify-end lg:flex">
              <UiButton className="h-9 font-normal shadow" size="sm" type="button" variant="default" onClick={openForm}>
                + รับเงินเอง
              </UiButton>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <div>พบ <span className="font-semibold text-slate-900">{receiptBillTotalRows}</span> รายการ</div>
            <div className="flex flex-wrap items-center gap-2">
              {receiptQueueColumnResize.hasCustomWidths ? <UiButton className="h-9 font-normal" size="sm" type="button" variant="outline" onClick={receiptQueueColumnResize.resetColumnWidths}>คืนค่าเดิมตาราง</UiButton> : null}
              <PageSizeDropdown options={pageSizeOptions} value={billPageSize} onChange={setBillPageSize} />
              <UiButton className="h-9 font-normal" disabled={receiptBillCurrentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setBillPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</UiButton>
              <span className="px-1">หน้า {receiptBillCurrentPage} / {receiptBillTotalPages}</span>
              <UiButton className="h-9 font-normal" disabled={receiptBillCurrentPage >= receiptBillTotalPages} size="sm" type="button" variant="outline" onClick={() => setBillPage((value) => Math.min(receiptBillTotalPages, value + 1))}>ถัดไป</UiButton>
            </div>
          </div>

          <div className="block lg:hidden space-y-3">
            {isLoading ? (
              <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
            ) : null}
            {!isLoading && receiptBillPageRows.map((bill) => {
              const balance = bill.receivableBalance ?? 0
              const cancelableReceipt = findActiveReceiptForBill(bill)
              const receiptDocNo = receiptQueueDocNo(bill)
              return (
                <div
                  key={bill.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => openReceivableBillDetail(bill)}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{receiptDocNo}</div>
                      <div className="mt-0.5 text-xs text-slate-500">อ้างอิง {bill.docNo}</div>
                    </div>
                    <span className="text-xs text-slate-500">{formatDateDisplay(bill.date)}</span>
                  </div>
                  <div className="mb-3 space-y-1 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-500">ลูกค้า: </span>
                      <span className="text-slate-800">{partyMap.get(bill.customerId ?? '') ?? bill.customerId ?? '-'}</span>
                    </div>
                    <div className="text-xs font-semibold text-amber-700">{receiptQueueStatusLabel(bill)}</div>
                  </div>
                  <div className="flex items-end justify-between border-t border-slate-100 pt-2">
                    <div>
                      <span className="text-xs text-slate-400 block">ค้างรับ</span>
                      <span className="font-bold text-sm tabular-nums text-emerald-700">{formatMoney(balance)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">ยอดรวมบิล</span>
                      <span className="font-bold text-slate-900 text-sm tabular-nums">{formatMoney(bill.totalAmount)}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
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
                      รับเงิน
                    </UiButton>
                    {cancelableReceipt ? (
                      <UiButton
                        className="font-normal border-red-200 text-red-700"
                        size="xs"
                        title={`ยกเลิกใบรับเงิน ${cancelableReceipt.docNo}`}
                        type="button"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation()
                          setCancelReceiptTarget(cancelableReceipt)
                          setCancelReceiptReason('')
                        }}
                      >
                        ยกเลิก
                      </UiButton>
                    ) : null}
                  </div>
                </div>
              )
            })}
            {!isLoading && receiptBillPageRows.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">ไม่พบใบรับเงินรอดำเนินการตามเงื่อนไข</div>
            ) : null}
          </div>

          <div className="hidden lg:block overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <Table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: receiptQueueColumnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {receiptQueueColumns.map((column) => (
                  <col key={column.key} style={receiptQueueColumnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <TableHeader className="text-slate-700">
                <tr>
                  <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="เลขที่ใบรับเงิน" resizeProps={receiptQueueColumnResize.getResizeHandleProps('docNo', 'เลขที่ใบรับเงิน')} sortKey="docNo" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="วันที่สร้างเอกสาร" resizeProps={receiptQueueColumnResize.getResizeHandleProps('date', 'วันที่สร้างเอกสาร')} sortKey="date" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="ลูกค้า" resizeProps={receiptQueueColumnResize.getResizeHandleProps('partyName', 'ลูกค้า')} sortKey="supplier" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="บิลขายอ้างอิง" resizeProps={receiptQueueColumnResize.getResizeHandleProps('accountNo', 'บิลขายอ้างอิง')} sortKey="sourceDocNo" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="ยอดรวม" resizeProps={receiptQueueColumnResize.getResizeHandleProps('totalAmount', 'ยอดรวม')} sortKey="totalAmount" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="รับแล้ว" resizeProps={receiptQueueColumnResize.getResizeHandleProps('paidAmount', 'รับแล้ว')} sortKey="paidAmount" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="ค้างรับ" resizeProps={receiptQueueColumnResize.getResizeHandleProps('balance', 'ค้างรับ')} sortKey="balance" onSort={toggleBillSort} />
                  <ResizableTableHead align="center" label="จัดการ" resizeProps={receiptQueueColumnResize.getResizeHandleProps('action', 'Action')} />
                </tr>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={receiptQueueColumns.length}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                {!isLoading && receiptBillPageRows.map((bill) => {
                  const balance = bill.receivableBalance ?? 0
                  const receivedAmount = Math.max(0, (bill.totalAmount ?? 0) - balance)
                  const cancelableReceipt = findActiveReceiptForBill(bill)
                  const receiptDocNo = receiptQueueDocNo(bill)
                  return (
                    <TableRow key={bill.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openReceivableBillDetail(bill)}>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        <div>{receiptDocNo}</div>
                        <div className="mt-1 text-xs font-normal text-amber-700">{receiptQueueStatusLabel(bill)}</div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{formatDateDisplay(bill.date)}</TableCell>
                      <TableCell className="truncate text-xs font-semibold text-slate-700">{partyMap.get(bill.customerId ?? '') ?? bill.customerId ?? '-'}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{bill.docNo}</TableCell>
                      <TableCell className="whitespace-nowrap pr-4 text-right text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(bill.totalAmount)}</TableCell>
                      <TableCell className="whitespace-nowrap pr-4 text-right text-xs font-semibold text-blue-700 tabular-nums">{formatMoney(receivedAmount)}</TableCell>
                      <TableCell className="whitespace-nowrap pr-4 text-right text-xs font-semibold text-emerald-700 tabular-nums">{formatMoney(balance)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
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
                          รับเงิน
                        </UiButton>
                        {cancelableReceipt ? (
                          <UiButton
                            className="font-normal border-red-200 text-red-700"
                            size="xs"
                            title={`ยกเลิกใบรับเงิน ${cancelableReceipt.docNo}`}
                            type="button"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation()
                              setCancelReceiptTarget(cancelableReceipt)
                              setCancelReceiptReason('')
                            }}
                          >
                            ยกเลิก
                          </UiButton>
                        ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!isLoading && receiptBillPageRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={receiptQueueColumns.length}>ไม่พบใบรับเงินรอดำเนินการตามเงื่อนไข</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </>
      ) : null}

      {mode === 'payment' && showEntrySection ? (
        <>
          <div className="space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <UiInput
                className="h-9 min-w-[260px] flex-1 rounded-md"
                placeholder="ค้นหา PMA / เอกสาร / ผู้รับเงิน / บัญชี"
                type="search"
                value={billSearch}
                onChange={(event) => setBillSearch(event.target.value)}
              />
              <UiSelect
                aria-label="เรียงคิวรอจ่าย"
                className="h-9 w-full px-2 sm:w-auto lg:hidden"
                value={billSort}
                onChange={(event) => setBillSort(event.target.value as PaymentBillSort)}
              >
                <option value="date_desc">เรียง: ล่าสุด</option>
                <option value="age_desc">เรียง: เก่าสุด</option>
                <option value="balance_desc">เรียง: ยอดรอจ่ายมากสุด</option>
              </UiSelect>
              {hasActiveBillFilters ? (
                <UiButton
                  className="h-9 font-normal"
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setBillSearch('')
                    setBillSort('date_desc')
                    setBillSourceFilter('all')
                  }}
                >
                  <X aria-hidden="true" className="mr-1 h-4 w-4" />
                  ล้าง
                </UiButton>
              ) : null}
            </div>
            <div aria-label="กรองคิวรอจ่ายตามประเภทเอกสาร" className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2" role="group">
              <span className="text-xs text-slate-500">ประเภทเอกสาร:</span>
              {paymentQueueSourceOptions.map((option) => {
                const isActive = billSourceFilter === option.value
                return (
                  <button
                    aria-pressed={isActive}
                    className={`rounded-md border px-3 py-1 text-xs font-medium ${isActive ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                    key={option.value}
                    type="button"
                    onClick={() => setBillSourceFilter(option.value)}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <div>พบทั้งหมด <span className="font-semibold text-slate-900">{supplierBillTotalRows}</span> รายการ</div>
            <div className="flex flex-wrap items-center gap-2">
              {paymentQueueColumnResize.hasCustomWidths ? <UiButton className="h-9 font-normal" size="sm" type="button" variant="outline" onClick={paymentQueueColumnResize.resetColumnWidths}>คืนค่าเดิมตาราง</UiButton> : null}
              <PageSizeDropdown options={pageSizeOptions} value={billPageSize} onChange={setBillPageSize} />
              <UiButton className="h-9 font-normal" disabled={supplierBillCurrentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setBillPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</UiButton>
              <span className="px-1">หน้า {supplierBillCurrentPage} / {supplierBillTotalPages}</span>
              <UiButton className="h-9 font-normal" disabled={supplierBillCurrentPage >= supplierBillTotalPages} size="sm" type="button" variant="outline" onClick={() => setBillPage((value) => Math.min(supplierBillTotalPages, value + 1))}>ถัดไป</UiButton>
            </div>
          </div>

          {/* Mobile Card List for Payment Entry Queue */}
          <div className="block lg:hidden space-y-3">
            {isLoading ? (
              <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
            ) : null}
            {!isLoading && supplierBillPageRows.map((bill) => {
              const balance = bill.payableBalance ?? 0
              const supplier = supplierMap.get(bill.supplierId ?? '')
              const supplierBankAccounts = approvalBankAccountLines(bill).length > 0 ? approvalBankAccountLines(bill) : supplierBankAccountLines(supplier, paymentMethods)
              const bankAccount = supplierBankAccounts[0]
              const canCancelApproval = (bill.paidAmount ?? 0) <= 0.01 && Boolean(bill.approvalId)
              const showApprovedAmount = Math.abs((bill.totalAmount ?? 0) - balance) > 0.01
              return (
                <div
                  key={`${bill.id}:${bill.approvalId ?? 'no-approval'}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-800">{bill.docNo}</div>
                      {bill.sourceDocNo && bill.sourceDocNo !== bill.docNo ? <div className="mt-0.5 text-xs text-slate-500">อ้างอิง {bill.sourceDocNo}</div> : null}
                    </div>
                    <span className="shrink-0 text-xs text-slate-500">{formatDateDisplay(bill.date)}</span>
                  </div>
                  <div className="mb-3 space-y-1.5 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-500">ผู้รับเงิน: </span>
                      <span className="text-slate-800">{partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'}</span>
                    </div>
                    {bankAccount ? (
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
                        <span>ปลายทาง: {bankAccount.bankName || '-'}</span>
                        {bankAccount.accountNo ? (
                          <>
                            <span className="text-slate-300">|</span>
                            <span>บัญชี: {formatAccountNoDisplay(bankAccount.accountNo) || bankAccount.accountNo}</span>
                            <button
                              aria-label={`คัดลอกเลขบัญชี ${bankAccount.accountNo}`}
                              className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-500 active:bg-slate-100"
                              onClick={(event) => {
                                event.stopPropagation()
                                void copyAccountNo(`${bill.id}-${bankAccount.accountNo}-0`, bankAccount.accountNo)
                              }}
                              type="button"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : <div className="font-medium text-amber-700">ยังไม่มีข้อมูลบัญชีปลายทาง</div>}
                  </div>
                  <div className="flex items-end justify-between border-t border-slate-100 pt-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-700">{paymentSourceTypeLabel(bill.sourceType)}</span>
                      <span>อายุ {ageInDays(bill.date).toLocaleString('th-TH')} วัน</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-xs text-slate-400">ยอดรอจ่าย</span>
                      <span className={`text-sm font-bold tabular-nums ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatMoney(balance)}</span>
                      {showApprovedAmount ? <span className="mt-0.5 block text-xs text-slate-500">อนุมัติ {formatMoney(bill.totalAmount)}</span> : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                    <UiButton
                      className="font-normal"
                      size="xs"
                      type="button"
                      variant="default"
                      onClick={(event) => {
                        event.stopPropagation()
                        openFormForBill(bill)
                      }}
                    >
                      ทำจ่าย
                    </UiButton>
                    {canCancelApproval ? (
                      <UiButton
                        className="border-red-200 font-normal text-red-700"
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
                    ) : null}
                  </div>
                </div>
              )
            })}
            {!isLoading && supplierBillPageRows.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">ไม่พบ PMA ค้างจ่ายตามเงื่อนไข</div>
            ) : null}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block">
            <Table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: paymentQueueColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {paymentQueueColumns.map((column) => (
                    <col key={column.key} style={paymentQueueColumnResize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <TableHeader className="text-slate-700">
                  <tr>
                    <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="เลขที่ PMA / อ้างอิง" resizeProps={paymentQueueColumnResize.getResizeHandleProps('docNo', 'เลขที่ PMA / อ้างอิง')} sortKey="docNo" onSort={toggleBillSort} />
                    <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="วันที่เอกสาร" resizeProps={paymentQueueColumnResize.getResizeHandleProps('date', 'วันที่เอกสาร')} sortKey="date" onSort={toggleBillSort} />
                    <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="ผู้รับเงิน" resizeProps={paymentQueueColumnResize.getResizeHandleProps('partyName', 'ผู้รับเงิน')} sortKey="supplier" onSort={toggleBillSort} />
                    <ResizableTableHead align="right" label="ปลายทางรับเงิน" resizeProps={paymentQueueColumnResize.getResizeHandleProps('destination', 'ปลายทางรับเงิน')} />
                    <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="ยอดอนุมัติ" resizeProps={paymentQueueColumnResize.getResizeHandleProps('totalAmount', 'ยอดอนุมัติ')} sortKey="totalAmount" onSort={toggleBillSort} />
                    <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="ยอดรอจ่าย" resizeProps={paymentQueueColumnResize.getResizeHandleProps('balance', 'ยอดรอจ่าย')} sortKey="balance" onSort={toggleBillSort} />
                    <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="อายุเอกสาร (วัน)" sortKey="age" onSort={toggleBillSort} />
                    <ResizableTableHead align="right" className="sticky right-0 z-20 bg-slate-100" label="จัดการ" resizeProps={paymentQueueColumnResize.getResizeHandleProps('action', 'จัดการ')} />
                  </tr>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={paymentQueueColumns.length}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                  {!isLoading && supplierBillPageRows.map((bill) => {
                    const balance = bill.payableBalance ?? 0
                    const supplier = supplierMap.get(bill.supplierId ?? '')
                    const approvalAccounts = approvalBankAccountLines(bill)
                    const supplierBankAccounts = approvalAccounts.length > 0 ? approvalAccounts : supplierBankAccountLines(supplier, paymentMethods)
                    const canCancelApproval = (bill.paidAmount ?? 0) <= 0.01 && Boolean(bill.approvalId)
                    return (
                      <TableRow key={`${bill.id}:${bill.approvalId ?? 'no-approval'}`} className="group hover:bg-slate-50">
                        <TableCell className="text-xs font-semibold text-slate-700">
                          <div>{bill.docNo}</div>
                          {bill.sourceDocNo && bill.sourceDocNo !== bill.docNo ? <div className="mt-0.5 text-xs font-normal text-slate-500">อ้างอิง {bill.sourceDocNo}</div> : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-xs font-semibold text-slate-700">{formatDateDisplay(bill.date)}</TableCell>
                        <TableCell className="max-w-72 truncate text-right text-xs font-semibold text-slate-700">{partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'}</TableCell>
                        <TableCell className="text-right text-xs font-semibold text-slate-700">
                          {supplierBankAccounts.length > 0 ? (
                            <div className="space-y-1.5">
                              {supplierBankAccounts.map((account, index) => {
                                const accountKey = `${bill.id}-${account.accountNo}-${index}`
                                const copied = copiedAccountKey === accountKey
                                const label = formatAccountNoDisplay(account.accountNo) || account.accountNo
                                return (
                                  <div key={accountKey}>
                                    <div className="whitespace-nowrap">{account.bankName || '-'}</div>
                                    {label ? (
                                      <div className="mt-0.5 flex items-center justify-end gap-1 text-slate-500">
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
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          ) : <span className="font-medium text-amber-700">ยังไม่มีข้อมูล</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(bill.totalAmount)}</TableCell>
                        <TableCell className={`whitespace-nowrap text-right pr-4 text-xs font-semibold tabular-nums ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatMoney(balance)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-slate-700 tabular-nums">{ageInDays(bill.date)}</TableCell>
                        <TableCell className="sticky right-0 z-10 bg-white text-right group-hover:bg-slate-50">
                          <div className="flex items-center justify-end gap-2">
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
                            {canCancelApproval ? (
                              <button
                                className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
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
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {!isLoading && supplierBillPageRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={paymentQueueColumns.length}>ไม่พบ PMA ค้างจ่ายตามเงื่อนไข</TableCell></TableRow> : null}
                </TableBody>
            </Table>
          </div>
        </>
      ) : null}

      {formOpen && showEntrySection ? (
        <Dialog open onOpenChange={(open) => {
          if (!open && !isSaving) setFormOpen(false)
        }}>
          <DialogContent className="top-[max(2rem,50%)] max-h-[90vh] max-w-5xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none" hideClose>
            <form noValidate onSubmit={save} className="flex flex-col max-h-[90vh]">
            <DialogHeader className="px-5 py-4 shrink-0 bg-slate-900 text-white rounded-t-md">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <DialogTitle className="font-bold text-white">
                  {mode === 'payment' ? 'สร้าง Payment Voucher' : (form.id ? 'แก้ไข Receipt Voucher' : title)}
                </DialogTitle>
                {mode === 'payment' ? null : <p className="text-xs text-slate-300 opacity-80">{subtitle}</p>}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <UiButton className="h-9 gap-2 border-emerald-600 bg-emerald-600 px-4 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white disabled:opacity-60" disabled={isSaving} type="submit" variant="outline">
                  <Check className="h-4 w-4" />
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                </UiButton>
                <UiButton className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => setFormOpen(false)}>ยกเลิก</UiButton>
              </div>
              </div>
            </DialogHeader>
            {error ? <div className="mx-5 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 shrink-0">{error}</div> : null}
            {mode === 'payment' ? (
              <div className="flex-1 overflow-y-auto flex flex-col gap-4 p-5 text-sm bg-slate-50">
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
                  methodDisabled={false}
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
                  <label className="block text-sm font-medium">
                    <span className="mb-1 block text-xs font-medium text-slate-600">หมายเหตุ</span>
                    <textarea
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none text-slate-900"
                      rows={2}
                      value={form.notes ?? ''}
                      onChange={(event) => setForm({ ...form, notes: event.target.value })}
                    />
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto space-y-4 p-5 bg-slate-50">
                  <section className="rounded-md border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <h3 className="text-sm font-bold text-slate-900">ข้อมูลใบรับเงิน</h3>
                    </div>
                    <div className="grid gap-4 p-4 md:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">วันที่</span>
                        <DatePickerInput
                          className="w-full h-9 text-sm"
                          value={form.date}
                          onChange={(value) => setForm({ ...form, date: value })}
                        />
                      </label>
                      <SearchCombobox
                        disabled={Boolean(form.id || form.billId)}
                        inputClassName="!h-9 px-2 py-1.5"
                        inputId="receipt-customer-search"
                        label={`${partyLabel} *`}
                        options={customerSearchOptions}
                        optionsPanelClassName="max-h-[280px]"
                        placeholder="พิมพ์ค้นหาลูกค้า..."
                        value={partyValue}
                        onChange={changeReceiptCustomer}
                      />
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-slate-600">ประเภทเอกสารรับเงิน</span>
                        <UiSelect
                          className="h-9 w-full rounded-md border border-slate-300 px-2 text-sm"
                          disabled={Boolean(form.id)}
                          value={receiptSourceType}
                          onChange={(event) => changeReceiptSourceType(event.target.value as 'SB' | 'CADV')}
                        >
                          <option value="SB">บิลขาย (SB)</option>
                          <option value="CADV">รับเงินล่วงหน้า (CADV)</option>
                        </UiSelect>
                      </label>
                    </div>
                  </section>

                  {receiptSourceType === 'SB' ? <section className="rounded-md border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                      <h3 className="text-sm font-bold text-slate-900">บิลขายที่รับเงิน</h3>
                      <UiButton className="h-9 font-normal" size="sm" type="button" variant="outline" onClick={addReceiptLine}>
                        <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
                        เพิ่มบิล
                      </UiButton>
                    </div>
                    {/* Desktop Table view (Visible on large screens) */}
                    <div className="hidden lg:block overflow-x-auto">
                      <table className="ns-table w-full min-w-[910px] table-fixed text-xs">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="w-[380px] p-2 text-left">Sales Bill</th>
                            <th className="w-[110px] p-2 text-right">ค้างรับ</th>
                            <th className="w-[120px] p-2 text-right">ยอดรับ</th>
                            <th className="w-[110px] p-2 text-right">ภาษีหัก ณ ที่จ่าย</th>
                            <th className="w-[110px] p-2 text-right">ส่วนลด</th>
                            <th className="w-[80px] p-2 text-center">ลบ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receiptLines.map((line, index) => {
                            const selectedLineBill = billMap.get(line.salesBillDocNo)
                            const receiptAmountKey = receiptLineMoneyKey(line, index, 'receiptAmount')
                            const withholdingTaxAmountKey = receiptLineMoneyKey(line, index, 'withholdingTaxAmount')
                            const discountAmountKey = receiptLineMoneyKey(line, index, 'discountAmount')
                            return (
                              <tr key={line.id ?? `${index}-${line.salesBillDocNo}`} className="border-t border-slate-100">
                                <td className="p-2">
                                  <UiSelect
                                    className="h-9 w-full rounded-md border border-slate-300 px-2 text-xs"
                                    value={line.salesBillDocNo}
                                    onChange={(event) => selectReceiptLineBill(index, event.target.value)}
                                  >
                                    <option value="">เลือกบิลขาย</option>
                                    {receiptSelectableBillsForLine(index).map((bill) => (
                                      <option key={bill.docNo} value={bill.docNo}>
                                        {bill.docNo} - {partyMap.get(bill.customerId ?? '') ?? bill.customerId ?? '-'} - ค้าง {formatMoney(bill.receivableBalance ?? 0)}
                                      </option>
                                    ))}
                                  </UiSelect>
                                </td>
                                <td className="p-2 text-right font-semibold tabular-nums text-amber-700">{formatMoney(selectedLineBill?.receivableBalance ?? 0)}</td>
                                <td className="p-2">
                                  <UiInput
                                    className="h-9 text-right tabular-nums"
                                    disabled={Boolean(form.id)}
                                    inputMode="decimal"
                                    type="text"
                                    value={moneyInputValue(receiptAmountKey, line.receiptAmount)}
                                    onBlur={() => finishMoneyInput(receiptAmountKey)}
                                    onChange={(event) => changeMoneyInput(receiptAmountKey, event.target.value, (value) => updateReceiptLine(index, { receiptAmount: value }))}
                                    onFocus={() => startMoneyInput(receiptAmountKey, line.receiptAmount)}
                                  />
                                </td>
                                <td className="p-2">
                                  <UiInput
                                    className="h-9 text-right tabular-nums"
                                    disabled={Boolean(form.id)}
                                    inputMode="decimal"
                                    type="text"
                                    value={moneyInputValue(withholdingTaxAmountKey, line.withholdingTaxAmount)}
                                    onBlur={() => finishMoneyInput(withholdingTaxAmountKey)}
                                    onChange={(event) => changeMoneyInput(withholdingTaxAmountKey, event.target.value, (value) => updateReceiptLine(index, { withholdingTaxAmount: value }))}
                                    onFocus={() => startMoneyInput(withholdingTaxAmountKey, line.withholdingTaxAmount)}
                                  />
                                </td>
                                <td className="p-2">
                                  <UiInput
                                    className="h-9 text-right tabular-nums"
                                    disabled={Boolean(form.id)}
                                    inputMode="decimal"
                                    type="text"
                                    value={moneyInputValue(discountAmountKey, line.discountAmount)}
                                    onBlur={() => finishMoneyInput(discountAmountKey)}
                                    onChange={(event) => changeMoneyInput(discountAmountKey, event.target.value, (value) => updateReceiptLine(index, { discountAmount: value }))}
                                    onFocus={() => startMoneyInput(discountAmountKey, line.discountAmount)}
                                  />
                                </td>
                                <td className="p-2 text-center">
                                  <UiButton className="h-8 w-8 px-0" disabled={receiptLines.length <= 1} size="icon" type="button" variant="ghost" onClick={() => removeReceiptLine(index)}>
                                    <X aria-hidden="true" className="h-4 w-4" />
                                  </UiButton>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card-based view (Visible on mobile and tablet) */}
                    <div className="block lg:hidden p-4 space-y-4 border-t border-slate-100">
                      {receiptLines.map((line, index) => {
                        const selectedLineBill = billMap.get(line.salesBillDocNo)
                        const receiptAmountKey = receiptLineMoneyKey(line, index, 'receiptAmount')
                        const withholdingTaxAmountKey = receiptLineMoneyKey(line, index, 'withholdingTaxAmount')
                        const discountAmountKey = receiptLineMoneyKey(line, index, 'discountAmount')
                        return (
                          <div key={line.id ?? `${index}-${line.salesBillDocNo}`} className="p-4 rounded-md border border-slate-200 bg-slate-50/50 space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-xs text-slate-500">บิลรายการที่ #{index + 1}</span>
                              <UiButton
                                className="h-8 w-8 px-0 text-red-500 hover:text-red-700 disabled:text-slate-300"
                                disabled={receiptLines.length <= 1}
                                size="icon"
                                type="button"
                                variant="ghost"
                                onClick={() => removeReceiptLine(index)}
                              >
                                <X className="h-4 w-4" />
                              </UiButton>
                            </div>

                            <div>
                              <span className="mb-1 block text-xs font-medium text-slate-600">Sales Bill</span>
                              <UiSelect
                                className="h-9 w-full rounded-md border border-slate-300 px-2 text-xs"
                                value={line.salesBillDocNo}
                                onChange={(event) => selectReceiptLineBill(index, event.target.value)}
                              >
                                <option value="">เลือกบิลขาย</option>
                                {receiptSelectableBillsForLine(index).map((bill) => (
                                  <option key={bill.docNo} value={bill.docNo}>
                                    {bill.docNo} - {partyMap.get(bill.customerId ?? '') ?? bill.customerId ?? '-'} - ค้าง {formatMoney(bill.receivableBalance ?? 0)}
                                  </option>
                                ))}
                              </UiSelect>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <span className="mb-1 block text-xs font-medium text-slate-600">ค้างรับ</span>
                                <div className="h-9 flex items-center px-3 rounded-md border border-slate-300 bg-slate-100 text-xs font-semibold text-amber-700 tabular-nums">
                                  {formatMoney(selectedLineBill?.receivableBalance ?? 0)}
                                </div>
                              </div>
                              <div>
                                <span className="mb-1 block text-xs font-medium text-slate-600">ยอดรับ</span>
                                <UiInput
                                  className="h-9 w-full text-right tabular-nums text-xs"
                                  disabled={Boolean(form.id)}
                                  inputMode="decimal"
                                  type="text"
                                  value={moneyInputValue(receiptAmountKey, line.receiptAmount)}
                                  onBlur={() => finishMoneyInput(receiptAmountKey)}
                                  onChange={(event) => changeMoneyInput(receiptAmountKey, event.target.value, (value) => updateReceiptLine(index, { receiptAmount: value }))}
                                  onFocus={() => startMoneyInput(receiptAmountKey, line.receiptAmount)}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <span className="mb-1 block text-xs font-medium text-slate-600">ภาษีหัก ณ ที่จ่าย</span>
                                <UiInput
                                  className="h-9 w-full text-right tabular-nums text-xs"
                                  disabled={Boolean(form.id)}
                                  inputMode="decimal"
                                  type="text"
                                  value={moneyInputValue(withholdingTaxAmountKey, line.withholdingTaxAmount)}
                                  onBlur={() => finishMoneyInput(withholdingTaxAmountKey)}
                                  onChange={(event) => changeMoneyInput(withholdingTaxAmountKey, event.target.value, (value) => updateReceiptLine(index, { withholdingTaxAmount: value }))}
                                  onFocus={() => startMoneyInput(withholdingTaxAmountKey, line.withholdingTaxAmount)}
                                />
                              </div>
                              <div>
                                <span className="mb-1 block text-xs font-medium text-slate-600">ส่วนลด</span>
                                <UiInput
                                  className="h-9 w-full text-right tabular-nums text-xs"
                                  disabled={Boolean(form.id)}
                                  inputMode="decimal"
                                  type="text"
                                  value={moneyInputValue(discountAmountKey, line.discountAmount)}
                                  onBlur={() => finishMoneyInput(discountAmountKey)}
                                  onChange={(event) => changeMoneyInput(discountAmountKey, event.target.value, (value) => updateReceiptLine(index, { discountAmount: value }))}
                                  onFocus={() => startMoneyInput(discountAmountKey, line.discountAmount)}
                                />
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section> : (
                    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">รับเงินล่วงหน้า Customer (CADV)</h3>
                          <p className="mt-1 text-xs text-slate-500">เลือก CADV ได้หลายรายการ แต่ต้องเป็นลูกค้ารายเดียวกัน</p>
                        </div>
                        <UiButton className="h-9 font-normal" size="sm" type="button" variant="outline" onClick={addCustomerAdvanceReceiptLine}>
                          <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
                          เพิ่ม CADV
                        </UiButton>
                      </div>
                      <div className="overflow-x-auto p-4">
                        <table className="ns-table w-full min-w-[760px] table-fixed text-xs">
                          <thead className="bg-slate-50 text-slate-600">
                            <tr>
                              <th className="w-[320px] p-2 text-left">CADV</th>
                              <th className="w-[130px] p-2 text-right">ยอดเอกสาร</th>
                              <th className="w-[130px] p-2 text-right">รับแล้ว</th>
                              <th className="w-[130px] p-2 text-right">คงเหลือรับ</th>
                              <th className="w-[140px] p-2 text-right">ยอดรับ</th>
                              <th className="w-[70px] p-2 text-center">ลบ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {customerAdvanceReceiptLines.map((line, index) => {
                              const advance = customerAdvanceMap.get(line.customerAdvanceDocNo)
                              const amountKey = `customer-advance-receipt:${line.id ?? index}:amount`
                              return (
                                <tr key={line.id ?? `${index}-${line.customerAdvanceDocNo}`} className="border-t border-slate-100">
                                  <td className="p-2">
                                    <UiSelect
                                      className="h-9 w-full rounded-md border border-slate-300 px-2 text-xs"
                                      value={line.customerAdvanceDocNo}
                                      onChange={(event) => selectCustomerAdvanceLine(index, event.target.value)}
                                    >
                                      <option value="">เลือก CADV</option>
                                      {receiptSelectableCustomerAdvances.filter((option) => option.docNo === line.customerAdvanceDocNo || !selectedCustomerAdvanceDocNos.has(option.docNo)).map((option) => (
                                        <option key={option.docNo} value={option.docNo}>
                                          {option.docNo} - {formatMoney(option.availableAmount)} คงเหลือรับ
                                        </option>
                                      ))}
                                    </UiSelect>
                                  </td>
                                  <td className="p-2 text-right font-semibold tabular-nums text-slate-700">{formatMoney(advance?.targetAmount ?? 0)}</td>
                                  <td className="p-2 text-right font-semibold tabular-nums text-slate-700">{formatMoney(advance?.receivedAmount ?? 0)}</td>
                                  <td className="p-2 text-right font-semibold tabular-nums text-amber-700">{formatMoney(advance?.availableAmount ?? 0)}</td>
                                  <td className="p-2">
                                    <UiInput
                                      className="h-9 text-right tabular-nums"
                                      disabled={Boolean(form.id)}
                                      inputMode="decimal"
                                      type="text"
                                      value={moneyInputValue(amountKey, line.receiptAmount)}
                                      onBlur={() => finishMoneyInput(amountKey)}
                                      onChange={(event) => changeMoneyInput(amountKey, event.target.value, (value) => updateCustomerAdvanceReceiptLine(index, { receiptAmount: value }))}
                                      onFocus={() => startMoneyInput(amountKey, line.receiptAmount)}
                                    />
                                  </td>
                                  <td className="p-2 text-center">
                                    <UiButton className="h-8 w-8 px-0" disabled={customerAdvanceReceiptLines.length <= 1} size="icon" type="button" variant="ghost" onClick={() => removeCustomerAdvanceReceiptLine(index)}>
                                      <X aria-hidden="true" className="h-4 w-4" />
                                    </UiButton>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}

                  <div className="rounded-md border border-slate-200 bg-slate-50/50 p-4">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-5 text-xs">
                      <div>
                        <span className="text-slate-500 block mb-1 font-semibold">{amountLabel}</span>
                        <span className="font-bold text-slate-800 text-sm tabular-nums">{formatMoney(form.amount)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block mb-1 font-semibold">{receiptSourceType === 'SB' ? 'ภาษีหัก ณ ที่จ่าย' : 'รับเข้า CADV'}</span>
                        <span className="font-bold text-slate-800 text-sm tabular-nums">{formatMoney(form.withholdingTax)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block mb-1 font-semibold">{receiptSourceType === 'SB' ? 'ตัดหนี้ AR' : 'ยอดรับ CADV'}</span>
                        <span className="font-bold text-slate-800 text-sm tabular-nums">{formatMoney(receiptSourceType === 'SB' ? form.amount + form.withholdingTax + form.discount : form.amount)}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block mb-1 font-semibold">Fee / Discount</span>
                        <span className="font-bold text-slate-800 text-sm tabular-nums">{formatMoney(form.fee)} / {formatMoney(form.discount)}</span>
                      </div>
                      <div className="col-span-2 md:col-span-1">
                        <span className="text-slate-500 block mb-1 font-semibold">Net (สุทธิ)</span>
                        <span className={`font-extrabold text-sm tabular-nums ${theme.strong}`}>{formatMoney(formNetAmount)}</span>
                      </div>
                    </div>
                  </div>

                  <PaymentSplitsSection
                    activeAccounts={activeAccounts}
                    addButtonLabel="+ เพิ่มบัญชีรับ"
                    afterLabel="📊 หลังรับ"
                    amountLabel="➕ รับ"
                    balanceMode="add"
                    form={form}
                    formNetAmount={formNetAmount}
                    moneyInputValue={moneyInputValue}
                    netTargetLabel="🎯 ยอดสุทธิที่ต้องรับ"
                    paymentSplits={receiptSplits}
                    paymentSplitTotal={receiptSplitTotal}
                    sectionHelp="เลือกได้หลายบัญชี กรณีรับเงินเข้าหลายบัญชี"
                    sectionTitle="💳 บัญชีรับเงิน *"
                    totalLabel="💰 รวมเข้าบัญชี"
                    onAddPaymentSplit={addReceiptSplit}
                    onChangeMoneyInput={changeMoneyInput}
                    onFinishMoneyInput={finishMoneyInput}
                    onRemovePaymentSplit={removeReceiptSplit}
                    onStartMoneyInput={startMoneyInput}
                    onUpdatePaymentForm={updateReceiptForm}
                    onUpdatePaymentSplit={updateReceiptSplit}
                    paymentMethods={paymentMethods}
                    methodValue={form.method}
                    onMethodChange={(value) => updateReceiptForm({ method: value })}
                    methodDisabled={false}
                  />
                  <div>
                    <label className="block text-sm font-medium mt-4">
                      <span className="mb-1 block text-xs font-medium text-slate-600">หมายเหตุ</span>
                      <textarea
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none text-slate-900"
                        rows={2}
                        value={form.notes ?? ''}
                        onChange={(event) => setForm({ ...form, notes: event.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </>
            )}
          </form>
        </DialogContent>
        </Dialog>
      ) : null}

      {showHistorySection ? (
        <>
          {/* Desktop Toolbar (Hidden on Mobile) */}
          <div className="hidden space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
            <div className="flex flex-wrap items-center gap-2">
              <UiInput
                className="h-9 min-w-[260px] flex-1 rounded-md"
                placeholder={mode === 'payment' ? 'ค้นหาเลข PMT / PMA / บิล / ผู้รับเงิน / บัญชี / หมายเหตุ' : 'ค้นหาเลขที่ / ชื่อ / บัญชี / หมายเหตุ'}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <label className="text-xs text-slate-500">วันที่:</label>
              <DatePickerInput ariaLabel="วันที่เริ่มต้น" className="h-9 w-[130px]" id={`${mode}-history-date-from`} value={dateFrom} onChange={setDateFrom} />
              <span className="text-slate-400">→</span>
              <DatePickerInput ariaLabel="วันที่สิ้นสุด" className="h-9 w-[130px]" id={`${mode}-history-date-to`} value={dateTo} onChange={setDateTo} />
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
              <span className="text-xs text-slate-500">สถานะ:</span>
              {moneyHistoryStatusOptions(mode).map((option) => {
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
              {mode === 'receipt' && !showReceiptTabs ? (
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <UiButton className="h-9 font-normal shadow" size="sm" type="button" variant="default" onClick={openForm}>
                    + รับเงินลูกค้า
                  </UiButton>
                </div>
              ) : null}
            </div>
          </div>

          {/* Mobile Toolbar */}
          <div className="space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
            <div className="flex gap-2 items-center">
              <UiInput
                className="h-9 min-w-[200px] flex-1 rounded-md"
                placeholder={mode === 'payment' ? 'ค้นหาเลข PMT / PMA / บิล...' : 'ค้นหาเลขที่ / ชื่อ / บัญชี...'}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={() => setShowMobileFilters(true)}
              >
                ตัวกรอง {hasActiveHistoryFilters ? '(มี)' : ''}
              </button>
            </div>
          </div>

          {/* Bottom Sheet Filter for History (Mobile) */}
          {showMobileFilters ? (
            <MobileFilterSheet
              title="ตัวกรองประวัติ"
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

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-600">บัญชี</span>
                    <UiSelect className="h-9 w-full px-2" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                      <option value="">ทุกบัญชี</option>
                      {activeAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </UiSelect>
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะ</span>
                    <div className="flex flex-wrap gap-2">
                      {moneyHistoryStatusOptions(mode).map((option) => {
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
                    </div>
                  </div>
            </MobileFilterSheet>
          ) : null}

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <div>
                {mode === 'payment' ? (
                  <>
                    PMT ทั้งหมด <span className="font-semibold text-slate-900">{paymentHistoryMetrics.totalCount}</span>
                    {' · '}จ่ายแล้ว <span className="font-semibold text-emerald-700">{paymentHistoryMetrics.paidCount}</span>
                    {' · '}ยกเลิก <span className="font-semibold text-red-700">{paymentHistoryMetrics.cancelledCount}</span>
                    {paymentHistoryMetrics.approvalOnlyCount > 0 ? (
                      <>{' · '}PMA ยกเลิก <span className="font-semibold text-amber-700">{paymentHistoryMetrics.approvalOnlyCount}</span></>
                    ) : null}
                  </>
                ) : (
                  <>พบทั้งหมด <span className="font-semibold text-slate-900">{historyTotalRows}</span> รายการ</>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {selectedReceiptIds.length > 0 && (
                  <UiButton
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs py-1 h-9 gap-1 flex items-center border-0"
                    size="sm"
                    type="button"
                    onClick={printSelectedReceipts}
                  >
                    <Printer className="h-4 w-4 mr-1" />
                    พิมพ์ใบเสร็จที่เลือก ({selectedReceiptIds.length})
                  </UiButton>
                )}
                {historyColumnResize.hasCustomWidths ? <UiButton className="font-normal" size="sm" type="button" variant="outline" onClick={historyColumnResize.resetColumnWidths}>คืนค่าเดิมตาราง</UiButton> : null}
                <PageSizeDropdown options={pageSizeOptions} value={historyPageSize} onChange={setHistoryPageSize} />
                <UiButton className="font-normal" disabled={historyCurrentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setHistoryPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</UiButton>
                <span className="px-1">หน้า {historyCurrentPage} / {historyTotalPages}</span>
                <UiButton className="font-normal" disabled={historyCurrentPage >= historyTotalPages} size="sm" type="button" variant="outline" onClick={() => setHistoryPage((value) => Math.min(historyTotalPages, value + 1))}>ถัดไป</UiButton>
              </div>
            </div>

            {/* Mobile Card List for History */}
            <div className="block lg:hidden space-y-3 mt-3">
              {isLoading ? (
                <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
              ) : null}
              {!isLoading && historyPageRows.map((row) => {
                const billDocNos = row.billDocNos?.length ? row.billDocNos : [row.billId ? (billMap.get(row.billId)?.docNo ?? row.billDocNo ?? row.billId) : (row.billDocNo ?? '-')]
                const accountSummaries = row.accountSummaries?.length ? row.accountSummaries : [row.accountName]
                const isCheckboxVisible = mode === 'receipt' && paymentHistoryStatusFilter === 'active'
                return (
                  <div
                    key={row.id}
                    className={`flex items-start gap-3 rounded-xl border border-slate-200 p-4 shadow-sm ${row.status === 'cancelled' ? 'bg-red-100/60 text-slate-400' : 'bg-white'}`}
                  >
                    {isCheckboxVisible ? (
                      <div className="pt-0.5">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                          checked={selectedReceiptIds.includes(row.id)}
                          onChange={() => toggleRowSelection(row.id)}
                        />
                      </div>
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
                        <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
                      </div>
                      <div className="text-xs text-slate-600 mb-3 space-y-1">
                        <div>
                          <span className="font-semibold text-slate-500">{partyLabel}: </span>
                          <span className="text-slate-800">{row.partyName}</span>
                        </div>
                        <div className="text-xs text-slate-500">
                          อ้างอิง: {billDocNos.join(', ')}
                        </div>
                        <div className="text-xs text-slate-500">
                          บัญชี: {accountSummaries.join(', ')}
                        </div>
                        {row.notes ? (
                          <div className="text-xs text-slate-400 italic truncate">
                            หมายเหตุ: {row.notes}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex justify-between items-end pt-2 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${paymentHistoryStatusTone(row.status)}`}>
                            <span className={`size-1.5 rounded-full ${paymentHistoryStatusDot(row.status)}`} />
                            {paymentHistoryStatusLabel(row.status, mode)}
                          </span>
                          <div className="ml-1 flex flex-wrap items-center gap-1 bg-transparent">
                            <button
                              className="cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                              type="button"
                              onClick={() => {
                                if (mode === 'payment') void openPaymentHistoryRow(row)
                                else openReceiptDetail(row)
                              }}
                            >
                              ดูรายละเอียด
                            </button>
                            {row.status !== 'cancelled' && mode === 'receipt' ? (
                              <>
                                <button
                                  type="button"
                                  className="text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-50 font-semibold px-2 py-0.5 rounded border border-slate-200 bg-white cursor-pointer"
                                  onClick={() => openFormForReceipt(row)}
                                >
                                  แก้ไข
                                </button>
                                <button
                                  type="button"
                                  className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 font-semibold px-2 py-0.5 rounded border border-red-200 bg-white cursor-pointer"
                                  onClick={() => {
                                    setCancelReceiptTarget(row)
                                    setCancelReceiptReason('')
                                  }}
                                >
                                  ยกเลิก
                                </button>
                              </>
                            ) : null}
                            {row.status !== 'cancelled' && mode !== 'receipt' ? (
                              <button
                                type="button"
                                className="cursor-pointer rounded-md border border-red-200 bg-white px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => setCancelPaymentTarget(row)}
                              >
                                ยกเลิก
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-slate-400 block">ยอดสุทธิ</span>
                          <span className={`font-bold text-sm tabular-nums ${theme.strong}`}>{formatMoney(row.netAmount)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {!isLoading && historyPageRows.length === 0 ? (
                <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">ยังไม่มีรายการ</div>
              ) : null}
            </div>

            {/* Desktop Table */}
            <div className="mt-3 hidden lg:block">
              <Table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: historyColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {mode === 'receipt' && paymentHistoryStatusFilter === 'active' ? (
                    <col style={{ width: '40px' }} />
                  ) : null}
                  {historyColumns.map((column) => (
                    <col key={column.key} style={historyColumnResize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <TableHeader className="text-slate-700">
                  <tr>
                    {mode === 'receipt' && paymentHistoryStatusFilter === 'active' ? (
                      <th className="p-2 text-center w-10">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                          checked={isAllPageSelected}
                          onChange={toggleAllPageRows}
                        />
                      </th>
                    ) : null}
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label="เลขที่รายการ" resizeProps={historyColumnResize.getResizeHandleProps('docNo', 'เลขที่รายการ')} sortKey="docNo" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label={mode === 'receipt' ? 'วันที่รับเงิน' : 'วันที่สร้างรายการ'} resizeProps={historyColumnResize.getResizeHandleProps('date', mode === 'receipt' ? 'วันที่รับเงิน' : 'วันที่สร้างรายการ')} sortKey="date" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label={partyLabel} resizeProps={historyColumnResize.getResizeHandleProps('partyName', partyLabel)} sortKey="partyName" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label="บิลอ้างอิง" resizeProps={historyColumnResize.getResizeHandleProps('billRefs', 'บิลอ้างอิง')} sortKey="billRefs" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label={accountLabel} resizeProps={historyColumnResize.getResizeHandleProps('accountName', accountLabel)} sortKey="accountName" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="right" direction={historySortDirection} label={amountLabel} resizeProps={historyColumnResize.getResizeHandleProps('amount', amountLabel)} sortKey="amount" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="right" direction={historySortDirection} label="ภาษีหัก ณ ที่จ่าย" resizeProps={historyColumnResize.getResizeHandleProps('wht', 'ภาษีหัก ณ ที่จ่าย')} sortKey="wht" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="right" direction={historySortDirection} label="ค่าธรรมเนียมธนาคาร" resizeProps={historyColumnResize.getResizeHandleProps('bankFee', 'ค่าธรรมเนียมธนาคาร')} sortKey="bankFee" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="right" direction={historySortDirection} label="สุทธิ" resizeProps={historyColumnResize.getResizeHandleProps('netAmount', 'สุทธิ')} sortKey="netAmount" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label="สถานะ" resizeProps={historyColumnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label="หมายเหตุ" resizeProps={historyColumnResize.getResizeHandleProps('notes', 'หมายเหตุ')} sortKey="notes" onSort={toggleHistorySort} />
                    <ResizableTableHead align="right" label="จัดการ" resizeProps={historyColumnResize.getResizeHandleProps('action', 'จัดการ')} />
                  </tr>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {isLoading ? (
                    <TableRow>
                      <TableCell className="p-8 text-center text-slate-500" colSpan={historyTableColumnCount}>
                        กำลังโหลดข้อมูล
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!isLoading && historyPageRows.map((row) => {
                    const billDocNos = row.billDocNos?.length ? row.billDocNos : [row.billId ? (billMap.get(row.billId)?.docNo ?? row.billDocNo ?? row.billId) : (row.billDocNo ?? '-')]
                    const accountSummaries = row.accountSummaries?.length ? row.accountSummaries : [row.accountName]
                    const isRowSelected = selectedReceiptIds.includes(row.id)
                    return (
                      <TableRow
                        key={row.id}
                        className={row.status === 'cancelled' ? 'bg-red-100/60 text-slate-400' : 'hover:bg-slate-50'}
                      >
                        {mode === 'receipt' && paymentHistoryStatusFilter === 'active' ? (
                          <TableCell className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-blue-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                              checked={isRowSelected}
                              onChange={() => toggleRowSelection(row.id)}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell className="text-sm font-semibold text-slate-700">{row.docNo}</TableCell>
                        <TableCell className="text-sm font-medium text-slate-700">{formatDateDisplay(row.date)}</TableCell>
                        <TableCell className="text-sm font-medium text-slate-700">{row.partyName}</TableCell>
                        <TableCell className="text-sm font-medium text-slate-700">
                          <div className="space-y-1">
                            <CollapsedList items={billDocNos} />
                            {mode === 'payment' && row.approvalIds?.length ? (
                              <div className="pt-1 text-xs text-slate-500">
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
                        <TableCell className="text-sm font-medium text-slate-700">
                          <div className="space-y-1">
                            <CollapsedList items={accountSummaries} />
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap pr-4 text-right text-sm font-semibold text-slate-700 tabular-nums">{formatMoney(row.amount)}</TableCell>
                        <TableCell className="whitespace-nowrap pr-4 text-right text-sm font-semibold text-amber-700 tabular-nums">{formatMoney(row.withholdingTax)}</TableCell>
                        <TableCell className="whitespace-nowrap pr-4 text-right text-sm font-semibold text-slate-700 tabular-nums">{formatMoney(row.fee)}</TableCell>
                        <TableCell className={`whitespace-nowrap pr-4 text-right text-sm font-semibold tabular-nums ${theme.strong}`}>{formatMoney(row.netAmount)}</TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${paymentHistoryStatusTone(row.status)}`}>
                            <span className={`size-1.5 rounded-full ${paymentHistoryStatusDot(row.status)}`} />
                            <span>{paymentHistoryStatusLabel(row.status, mode)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-56 truncate text-sm font-medium text-slate-700">{row.notes || '-'}</TableCell>
                        <TableCell className="p-2">
                          <div className="flex items-center gap-1 bg-transparent justify-start">
                            <UiButton
                              className="h-7 px-2 text-xs font-medium"
                              size="sm"
                              type="button"
                              variant="outline"
                              onClick={() => {
                                if (mode === 'payment') void openPaymentHistoryRow(row)
                                else openReceiptDetail(row)
                              }}
                            >
                              ดูรายละเอียด
                            </UiButton>
                            {row.status !== 'cancelled' && mode === 'receipt' ? (
                              <>
                                <UiButton
                                  className="h-7 border-slate-300 px-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                  onClick={() => openFormForReceipt(row)}
                                >
                                  แก้ไข
                                </UiButton>
                                <UiButton
                                  className="h-7 border-red-200 px-2 text-xs font-medium text-red-700 hover:bg-red-50 hover:text-red-700"
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                  onClick={() => {
                                    setCancelReceiptTarget(row)
                                    setCancelReceiptReason('')
                                  }}
                                >
                                  ยกเลิก
                                </UiButton>
                              </>
                            ) : null}
                            {row.status !== 'cancelled' && mode !== 'receipt' ? (
                              <UiButton
                                className="h-7 border-red-200 px-2 text-xs font-semibold text-red-700 hover:bg-red-50 hover:text-red-700"
                                size="sm"
                                type="button"
                                variant="outline"
                                onClick={() => setCancelPaymentTarget(row)}
                              >
                                ยกเลิก
                              </UiButton>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {!isLoading && historyPageRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={historyTableColumnCount}>ยังไม่มีรายการ</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
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
          onCancel={(row) => setCancelPaymentTarget(row)}
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

      {mode === 'receipt' ? (
        <ReceivableBillDetailDialog
          bill={receiptBillDetailBill}
          cancelableReceipt={receiptBillDetailBill ? findActiveReceiptForBill(receiptBillDetailBill) : null}
          customerName={receiptBillDetailBill ? (partyMap.get(receiptBillDetailBill.customerId ?? '') ?? receiptBillDetailBill.customerId ?? '-') : '-'}
          open={receiptBillDetailOpen}
          onCancel={(row) => {
            setReceiptBillDetailOpen(false)
            setReceiptBillDetailBill(null)
            setCancelReceiptTarget(row)
            setCancelReceiptReason('')
          }}
          onEdit={(bill) => {
            setReceiptBillDetailOpen(false)
            setReceiptBillDetailBill(null)
            openFormForBill(bill)
          }}
          onOpenChange={(open) => {
            setReceiptBillDetailOpen(open)
            if (!open) setReceiptBillDetailBill(null)
          }}
          onPrint={printReceivableBill}
        />
      ) : null}

      {mode === 'receipt' ? (
        <ReceiptDetailDialog
          open={receiptDetailOpen}
          readOnly
          row={receiptDetailRow}
          onCancel={(row) => {
            setReceiptDetailOpen(false)
            setReceiptDetailRow(null)
            setCancelReceiptTarget(row)
            setCancelReceiptReason('')
          }}
          onEdit={(row) => {
            setReceiptDetailOpen(false)
            setReceiptDetailRow(null)
            openFormForReceipt(row)
          }}
          onOpenChange={(open) => {
            setReceiptDetailOpen(open)
            if (!open) setReceiptDetailRow(null)
          }}
          onPrint={printCustomerReceipt}
        />
      ) : null}

      {cancelReceiptTarget ? (
        <Dialog open onOpenChange={(open) => {
          if (!open && !isCancellingReceipt) {
            setCancelReceiptTarget(null)
            setInvalidCancelReason(null)
          }
        }}>
          <DialogContent className="max-w-md rounded-md !p-0 overflow-hidden bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none" hideClose mobileAppShell={false}>
            <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md">
              <DialogTitle className="font-bold text-white">ยกเลิก Receipt Voucher</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm bg-slate-50 p-5">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">{cancelReceiptTarget.docNo}</div>
                <div className="text-slate-600">{cancelReceiptTarget.partyName} · {formatMoney(cancelReceiptTarget.amount)}</div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-600">
                  เหตุผลการยกเลิก<span className="ml-1 text-red-600">*</span>
                </span>
                <textarea
                  aria-invalid={invalidCancelReason === 'receipt'}
                  className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  required
                  value={cancelReceiptReason}
                  onChange={(event) => {
                    setCancelReceiptReason(event.target.value)
                    if (invalidCancelReason === 'receipt') setInvalidCancelReason(null)
                  }}
                />
              </label>
            </div>
            <DialogFooter className="border-t border-slate-200 bg-white px-5 py-4">
              <UiButton className="font-normal" disabled={isCancellingReceipt} type="button" variant="outline" onClick={() => { setCancelReceiptTarget(null); setInvalidCancelReason(null) }}>ปิด</UiButton>
              <UiButton className="bg-red-600 text-white hover:bg-red-700 font-normal px-5" disabled={isCancellingReceipt} type="button" variant="default" onClick={cancelCustomerReceiptRow}>ยืนยันยกเลิก</UiButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {cancelPaymentTarget ? (
        <Dialog open onOpenChange={(open) => {
          if (!open && !isCancellingPayment) {
            setCancelPaymentTarget(null)
            setInvalidCancelReason(null)
          }
        }}>
          <DialogContent className="max-w-md rounded-md !p-0 overflow-hidden bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none" hideClose mobileAppShell={false}>
            <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md">
              <DialogTitle className="font-bold text-white">ยกเลิกรายการจ่ายเงิน</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm bg-slate-50 p-5">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="font-semibold text-slate-900">{cancelPaymentTarget.docNo}</div>
                <div className="text-slate-600">{cancelPaymentTarget.partyName} · {formatMoney(cancelPaymentTarget.amount)}</div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-600">
                  เหตุผลการยกเลิก<span className="ml-1 text-red-600">*</span>
                </span>
                <textarea
                  aria-invalid={invalidCancelReason === 'payment'}
                  className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  required
                  value={cancelPaymentReason}
                  onChange={(event) => {
                    setCancelPaymentReason(event.target.value)
                    if (invalidCancelReason === 'payment') setInvalidCancelReason(null)
                  }}
                />
              </label>
            </div>
            <DialogFooter className="border-t border-slate-200 bg-white px-5 py-4">
              <UiButton className="font-normal" disabled={isCancellingPayment} type="button" variant="outline" onClick={() => { setCancelPaymentTarget(null); setInvalidCancelReason(null) }}>ปิด</UiButton>
              <UiButton className="bg-red-600 text-white hover:bg-red-700 font-normal px-5" disabled={isCancellingPayment} type="button" variant="default" onClick={cancelPaymentRow}>ยืนยันยกเลิก</UiButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {mode === 'payment' && !historyOnly && cancelApprovalTarget ? (
        <Dialog open onOpenChange={(open) => {
          if (!open && !isCancellingApproval) {
            setCancelApprovalTarget(null)
            setCancelApprovalReason('')
            setInvalidCancelReason(null)
          }
        }}>
          <DialogContent className="max-w-lg rounded-md !p-0 overflow-hidden bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none" hideClose mobileAppShell={false}>
            <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md">
              <DialogTitle className="font-bold text-white">ยกเลิกรายการรอจ่าย</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 px-5 py-4 text-sm bg-slate-50">
              <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-800">
                <div><span className="font-semibold">เลขที่รายการ:</span> {cancelApprovalTarget.docNo}</div>
                {cancelApprovalTarget.sourceDocNo && cancelApprovalTarget.sourceDocNo !== cancelApprovalTarget.docNo ? (
                  <div><span className="font-semibold">เอกสารต้นทาง:</span> {cancelApprovalTarget.sourceDocNo}</div>
                ) : null}
                <div><span className="font-semibold">{partyLabel}:</span> {partyMap.get(cancelApprovalTarget.supplierId ?? '') ?? cancelApprovalTarget.supplierId ?? '-'}</div>
                <div><span className="font-semibold">ยอดคงเหลือ:</span> {formatMoney(cancelApprovalTarget.payableBalance ?? 0)}</div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  เหตุผลการยกเลิก<span className="ml-1 text-red-600">*</span>
                </span>
                <textarea
                  aria-invalid={invalidCancelReason === 'approval'}
                  className="min-h-28 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-400"
                  placeholder="ระบุเหตุผลการยกเลิกรายการรอจ่าย"
                  required
                  value={cancelApprovalReason}
                  onChange={(event) => {
                    setCancelApprovalReason(event.target.value)
                    if (invalidCancelReason === 'approval') setInvalidCancelReason(null)
                  }}
                />
              </label>
            </div>
            <DialogFooter className="border-t border-slate-200 bg-white px-5 py-4">
              <UiButton
                className="font-normal"
                disabled={isCancellingApproval}
                type="button"
                variant="outline"
                onClick={() => {
                  setCancelApprovalTarget(null)
                  setCancelApprovalReason('')
                  setInvalidCancelReason(null)
                }}
              >
                ปิด
              </UiButton>
              <UiButton
                className="bg-red-600 px-5 font-normal text-white hover:bg-red-700 disabled:opacity-60"
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

      {/* Floating Action Button (FAB) for Mobile (Receipt Mode) */}
      {mode === 'receipt' && showEntrySection ? (
        <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden">
          <button
            className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg active:scale-95 transition-transform"
            onClick={openForm}
            type="button"
            aria-label="รับเงินลูกค้าใหม่"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      ) : null}

    </section>
  )
}

function PaymentHistoryDetailDialog({
  detail,
  error,
  isLoading,
  onCancel,
  onOpenChange,
  open,
  row,
}: {
  detail: PaymentHistoryDetail | null
  error: string | null
  isLoading: boolean
  onCancel: (row: MoneyRow) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  row: MoneyRow | null
}) {
  const summary = detail?.summary
  const detailDocNo = detail?.docNo ?? row?.docNo ?? '-'
  const detailPartyName = row?.partyName ?? '-'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none" fallbackTitle="รายละเอียดการจ่ายเงิน" hideClose>
        <DialogHeader className="px-5 py-4 bg-slate-900 text-white rounded-t-md">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-bold text-white">รายละเอียด {detailDocNo}</DialogTitle>
            <div className="mt-1 truncate text-xs text-slate-300">{detailPartyName}</div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {row && row.status !== 'cancelled' ? (
              <UiButton
                className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white"
                title="ยกเลิกรายการจ่ายเงิน"
                type="button"
                variant="outline"
                onClick={() => onCancel(row)}
              >
                ยกเลิก
              </UiButton>
            ) : null}
            <UiButton className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => onOpenChange(false)}>ปิด</UiButton>
          </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 p-5 text-sm bg-slate-50">
          {isLoading ? <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow">กำลังโหลดรายละเอียด</div> : null}
          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-800">{error}</div> : null}
          {!isLoading && !error && detail && summary ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-xs text-slate-500">{detail.type === 'approval' ? 'ยอดอนุมัติ' : 'ยอดจ่าย'}</div>
                  <div className="text-lg font-bold text-slate-900">{formatMoney(summary.amount)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-xs text-slate-500">สถานะ</div>
                  <div className={`text-lg font-bold ${detailToneTextClass(detail.latestTone)}`}>{detail.latestStatusLabel}</div>
                </div>
                {detail.type === 'approval' ? (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="text-xs text-slate-500">วันที่อนุมัติ</div>
                      <div className="text-lg font-bold text-slate-900">{summary.approvedAt ?? '-'}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="text-xs text-slate-500">วันที่ปิดรายการ</div>
                      <div className={`text-lg font-bold ${detailToneTextClass(detail.latestTone)}`}>{summary.closedAt ?? '-'}</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="text-xs text-slate-500">ภาษีหัก ณ ที่จ่าย / ค่าธรรมเนียมธนาคาร</div>
                      <div className="text-lg font-bold text-slate-900">{formatMoney(summary.withholdingTax)} / {formatMoney(summary.fee)}</div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="text-xs text-slate-500">สุทธิ</div>
                      <div className={`text-lg font-bold ${detailToneTextClass(detail.latestTone)}`}>{formatMoney(summary.netAmount)}</div>
                    </div>
                  </>
                )}
              </div>

              <DetailSection
                title="ข้อมูลรายละเอียด"
                rows={detail.detailCards.map((card) => [card.label, card.value])}
              />

              <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="font-semibold text-slate-900">{detail.type === 'approval' ? 'PMT ที่ใช้รายการนี้' : 'รายการที่ทำจ่าย'}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="ns-table w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                      <tr>
                        <th className="p-2 text-left">{detail.type === 'approval' ? 'PMT' : 'PMA'}</th>
                        <th className="p-2 text-left">เอกสารต้นทาง</th>
                        <th className="p-2 text-right">ยอดจัดสรร</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.approvalRows.map((approval) => (
                        <tr key={`${approval.docNo}-${approval.sourceDocNo}`} className="border-t border-slate-100">
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
                <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h2 className="font-semibold text-slate-900">บัญชีที่ใช้ทำจ่าย</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="ns-table w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                        <tr>
                          <th className="p-2 text-left">บัญชี</th>
                          <th className="p-2 text-left">รายการธนาคาร</th>
                          <th className="p-2 text-right">ยอด</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.accountRows.map((account) => (
                          <tr key={`${account.accountName}-${account.bankStatementDocNo}-${account.amount}`} className="border-t border-slate-100">
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

              <section className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
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
                              <div className="mt-1 truncate text-xs">{event.actor || '-'}</div>
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

function ReceivableBillDetailDialog({
  bill,
  cancelableReceipt,
  customerName,
  onCancel,
  onEdit,
  onOpenChange,
  onPrint,
  open,
}: {
  bill: Bill | null
  cancelableReceipt: MoneyRow | null
  customerName: string
  onCancel: (row: MoneyRow) => void
  onEdit: (bill: Bill) => void
  onOpenChange: (open: boolean) => void
  onPrint: (bill: Bill) => void
  open: boolean
}) {
  const balance = bill?.receivableBalance ?? 0
  const receivedAmount = Math.max(0, (bill?.totalAmount ?? 0) - balance)
  const receiptDocNo = bill ? receiptQueueDocNo(bill) : '-'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden rounded-md !p-0 flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none" fallbackTitle="รายละเอียดใบรับเงินลูกค้า" hideClose>
        <DialogHeader className="bg-slate-900 px-5 py-4 text-white rounded-t-md">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-bold text-white">{receiptDocNo}</DialogTitle>
            <DialogDescription className="mt-1 truncate text-xs text-slate-300">{customerName || '-'}</DialogDescription>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <UiButton className="h-9 gap-2 border-emerald-600 bg-emerald-600 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white" disabled={!bill} type="button" variant="outline" onClick={() => bill && onPrint(bill)}>
              <Printer className="h-4 w-4" />
              พิมพ์
            </UiButton>
            <UiButton className="h-9 border-slate-700 bg-slate-800 font-normal text-white hover:bg-slate-700 hover:text-white" disabled={!bill} type="button" variant="outline" onClick={() => bill && onEdit(bill)}>แก้ไข</UiButton>
            {cancelableReceipt ? (
              <UiButton
                className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white"
                title={`ยกเลิกใบรับเงิน ${cancelableReceipt.docNo}`}
                type="button"
                variant="outline"
                onClick={() => onCancel(cancelableReceipt)}
              >
                ยกเลิก
              </UiButton>
            ) : null}
            <UiButton className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => onOpenChange(false)}>ปิด</UiButton>
          </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 bg-slate-50 p-5 text-sm">
          {!bill ? <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow">ไม่พบข้อมูล</div> : (
            <>
              <DetailSection
                title="ข้อมูลใบรับเงิน"
                rows={[
                  ['เลขที่ใบรับเงิน', receiptDocNo],
                  ['วันที่สร้างเอกสาร', formatDateDisplay(bill.date)],
                  ['สถานะใบรับเงิน', receiptQueueStatusLabel(bill)],
                  ['อายุเอกสาร', `${ageInDays(bill.date)} วัน`],
                ]}
              />

              <DetailSection
                title="เอกสารอ้างอิง"
                rows={[
                  ['บิลขายอ้างอิง', bill.docNo],
                  ['เอกสารอ้างอิง', bill.sourceDocNo || bill.docNo],
                  ['สถานะบิลขาย', paymentBillStatus(bill)],
                ]}
              />

              <section className="rounded-md border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-sm font-bold text-slate-900">ยอดเงิน</h3>
                </div>
                <div className="grid divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
                  <MoneySummaryItem label="ยอดรวม" tone="slate" value={formatMoney(bill.totalAmount)} />
                  <MoneySummaryItem label="รับแล้ว" tone="blue" value={formatMoney(receivedAmount)} />
                  <MoneySummaryItem label="ค้างรับ" tone="emerald" value={formatMoney(balance)} />
                </div>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ReceiptDetailDialog({
  onCancel,
  onEdit,
  onOpenChange,
  onPrint,
  open,
  readOnly = false,
  row,
}: {
  onCancel: (row: MoneyRow) => void
  onEdit: (row: MoneyRow) => void
  onOpenChange: (open: boolean) => void
  onPrint: (row: MoneyRow) => void
  open: boolean
  readOnly?: boolean
  row: MoneyRow | null
}) {
  const billDocNos = row?.billDocNos?.length ? row.billDocNos : [row?.billDocNo || row?.billId || '-']
  const accountSummaries = row?.accountSummaries?.length ? row.accountSummaries : [row?.accountName || '-']
  const lines = row?.receiptLines?.length
    ? row.receiptLines
    : billDocNos.map((docNo, index) => ({
      discountAmount: index === 0 ? row?.discount ?? 0 : 0,
      lineNo: index + 1,
      receiptAmount: index === 0 ? row?.amount ?? 0 : 0,
      salesBillDocNo: docNo,
      withholdingTaxAmount: index === 0 ? row?.withholdingTax ?? 0 : 0,
    }))
  const isCancelled = row?.status === 'cancelled'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden rounded-md !p-0 flex flex-col bg-slate-900 border-0 shadow-2xl outline-none focus:outline-none" fallbackTitle="รายละเอียดรับเงินลูกค้า" hideClose>
        <DialogHeader className="bg-slate-900 px-5 py-4 text-white rounded-t-md">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-bold text-white">{row?.docNo ?? '-'}</DialogTitle>
            <DialogDescription className="mt-1 truncate text-xs text-slate-300">{row?.partyName || '-'}</DialogDescription>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {!readOnly ? (
              <>
                <UiButton className="h-9 gap-2 border-emerald-600 bg-emerald-600 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white" disabled={!row} type="button" variant="outline" onClick={() => row && onPrint(row)}>
                  <Printer className="h-4 w-4" />
                  พิมพ์
                </UiButton>
                {row && !isCancelled ? (
                  <>
                    <UiButton className="h-9 border-slate-700 bg-slate-800 font-normal text-white hover:bg-slate-700 hover:text-white" type="button" variant="outline" onClick={() => onEdit(row)}>แก้ไข</UiButton>
                    <UiButton className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => onCancel(row)}>ยกเลิก</UiButton>
                  </>
                ) : null}
              </>
            ) : null}
            <UiButton className="h-9 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white" type="button" variant="outline" onClick={() => onOpenChange(false)}>ปิด</UiButton>
          </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 bg-slate-50 p-5 text-sm">
          {!row ? <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow">ไม่พบข้อมูล</div> : (
            <>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-xs text-slate-500">ยอดรับ</div>
                  <div className="text-lg font-bold text-emerald-700">{formatMoney(row.amount)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-xs text-slate-500">ยอดสุทธิ</div>
                  <div className="text-lg font-bold text-blue-700">{formatMoney(row.netAmount)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-xs text-slate-500">ภาษีหัก ณ ที่จ่าย / ค่าธรรมเนียมธนาคาร</div>
                  <div className="text-lg font-bold text-slate-900">{formatMoney(row.withholdingTax ?? 0)} / {formatMoney(row.fee ?? 0)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="text-xs text-slate-500">สถานะ</div>
                  <div className={`text-lg font-bold ${isCancelled ? 'text-slate-500' : 'text-emerald-700'}`}>{isCancelled ? 'ยกเลิก' : 'รับเงินแล้ว'}</div>
                </div>
              </div>

              <DetailSection
                title="ข้อมูลใบรับเงิน"
                rows={[
                  ['เลขที่เอกสาร', row.docNo],
                  ['วันที่รับเงิน', formatDateDisplay(row.date)],
                  ['วิธีรับเงิน', row.method || '-'],
                ]}
              />

              <DetailSection
                title="ช่องทางรับเงินและหมายเหตุ"
                rows={[
                  ['บัญชีรับเงิน', accountSummaries.join('\n')],
                  ['หมายเหตุ', row.notes || '-'],
                ]}
              />

              <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="font-semibold text-slate-900">บิลขายที่รับเงิน</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="ns-table w-full text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="p-2 text-left">บิลขาย</th>
                        <th className="p-2 text-right">ยอดรับ</th>
                        <th className="p-2 text-right">ภาษีหัก ณ ที่จ่าย</th>
                        <th className="p-2 text-right">ส่วนลด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => (
                        <tr key={`${line.salesBillDocNo}-${index}`} className="border-t border-slate-200">
                          <td className="p-2 font-mono text-slate-800">{line.salesBillDocNo || '-'}</td>
                          <td className="p-2 text-right font-semibold tabular-nums">{formatMoney(line.receiptAmount)}</td>
                          <td className="p-2 text-right font-semibold tabular-nums text-amber-700">{formatMoney(line.withholdingTaxAmount)}</td>
                          <td className="p-2 text-right font-semibold tabular-nums">{formatMoney(line.discountAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailCard({ label, multiline, value }: { label: string; multiline?: boolean; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-medium text-slate-900 ${multiline ? 'whitespace-pre-line' : ''}`}>{value}</div>
    </div>
  )
}

function DetailSection({ rows, title }: { rows: Array<[string, string]>; title: string }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      <dl className="grid md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="border-b border-slate-100 px-4 py-3 last:border-b-0 md:[&:nth-last-child(-n+2)]:border-b-0">
            <dt className="text-xs font-medium text-slate-500">{label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-slate-900 whitespace-pre-line">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function MoneySummaryItem({ label, tone, value }: { label: string; tone: 'blue' | 'emerald' | 'slate'; value: string }) {
  const toneClass = tone === 'blue' ? 'text-blue-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'
  return (
    <div className="px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${toneClass}`}>{value}</div>
    </div>
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
  return <SharedKpiCard label={label} tone={tone} value={value} />
}
