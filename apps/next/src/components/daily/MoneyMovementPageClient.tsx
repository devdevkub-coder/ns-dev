'use client'

import { Check, Copy, X, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { z } from 'zod'
import { paymentMethodGroupFromValue, type PaymentMethodGroup } from '@/lib/account-payment-method'
import { Field, SelectField, SummaryPill } from '@/components/daily/MoneyMovementFieldHelpers'
import { PaymentLinesSection, PaymentSplitsSection } from '@/components/daily/MoneyMovementFormSections'
import { Button as UiButton } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input as UiInput } from '@/components/ui/Input'
import { CollapsedList } from '@/components/ui/CollapsedList'
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
  sourceType?: 'advance_payment' | 'expense' | 'purchase_bill'
  status?: string
  supplierId?: string | null
  totalAmount: number
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
type ReceiptLine = NonNullable<CustomerReceiptFormValues['lines']>[number]
type ReceiptSplit = NonNullable<CustomerReceiptFormValues['splits']>[number]
type PaymentBillSort = 'age_asc' | 'age_desc' | 'balance_asc' | 'balance_desc' | 'date_asc' | 'date_desc' | 'doc_asc' | 'doc_desc' | 'paid_asc' | 'paid_desc' | 'supplier_asc' | 'supplier_desc' | 'total_asc' | 'total_desc'
type PaymentBillSortField = 'age' | 'balance' | 'date' | 'docNo' | 'paidAmount' | 'supplier' | 'totalAmount'
type HistorySortField = 'accountName' | 'amount' | 'date' | 'docNo' | 'netAmount' | 'partyName'
type PaymentHistoryStatusFilter = 'active' | 'all' | 'cancelled'
type ReceiptTab = 'entry' | 'history'
type PaymentQueueColumnKey = 'accountNo' | 'action' | 'age' | 'balance' | 'bankName' | 'date' | 'docNo' | 'paidAmount' | 'partyName' | 'totalAmount'
type MoneyHistoryColumnKey = 'accountName' | 'action' | 'amount' | 'bankFee' | 'billRefs' | 'date' | 'docNo' | 'netAmount' | 'notes' | 'partyName' | 'status' | 'wht'
const pageSizeOptions = [10, 25, 50, 100]
const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})
const paymentQueueColumns: Array<ResizableColumnDefinition<PaymentQueueColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 120, minWidth: 100 },
  { key: 'partyName', defaultWidth: 260, minWidth: 150 },
  { key: 'bankName', defaultWidth: 150, minWidth: 120 },
  { key: 'accountNo', defaultWidth: 220, minWidth: 160 },
  { key: 'totalAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'paidAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'balance', defaultWidth: 110, minWidth: 90 },
  { key: 'age', defaultWidth: 75, minWidth: 60 },
  { key: 'action', defaultWidth: 240, minWidth: 210 },
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
]
const receiptHistoryColumns: Array<ResizableColumnDefinition<MoneyHistoryColumnKey>> = [
  { key: 'docNo', defaultWidth: 150, minWidth: 120 },
  { key: 'date', defaultWidth: 150, minWidth: 120 },
  { key: 'partyName', defaultWidth: 260, minWidth: 140 },
  { key: 'billRefs', defaultWidth: 220, minWidth: 160 },
  { key: 'accountName', defaultWidth: 220, minWidth: 160 },
  { key: 'amount', defaultWidth: 110, minWidth: 90 },
  { key: 'wht', defaultWidth: 100, minWidth: 80 },
  { key: 'bankFee', defaultWidth: 100, minWidth: 80 },
  { key: 'netAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'notes', defaultWidth: 180, minWidth: 130 },
]

function newPaymentLine(): PaymentLine {
  return { amount: 0, approvalId: null, billId: '', billText: '', discount: 0, fee: 0, id: `PL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, supplierId: '', withholdingTax: 0 }
}

function newPaymentSplit(): PaymentSplit {
  return { accountId: '', amount: 0, id: `SP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
}

function newReceiptSplit(): ReceiptSplit {
  return { accountId: '', amount: 0, id: `RS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
}

function newReceiptLine(): ReceiptLine {
  return { discountAmount: 0, id: `RL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, receiptAmount: 0, salesBillDocNo: '', withholdingTaxAmount: 0 }
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
    method: '',
    notes: null,
    ...(mode === 'payment' ? { lines: [newPaymentLine()], splits: [newPaymentSplit()], supplierId: '' } : { customerId: '', lines: [newReceiptLine()], splits: [newReceiptSplit()] }),
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

function paymentDailyReportDateRangeLabel(dateFrom: string, dateTo: string) {
  const today = todayDateInput()
  const from = dateFrom || today
  const to = dateTo || dateFrom || today
  return from === to ? formatDateDisplay(from) : `${formatDateDisplay(from)} - ${formatDateDisplay(to)}`
}

function buildPaymentDailyReportHtml(rows: MoneyRow[], profile: CompanyProfilePrintValues, params: { dateFrom: string; dateTo: string; printedAt: Date }) {
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
    return `<tr>
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
  const emptyRow = '<tr><td class="empty" colspan="11">ไม่พบรายการจ่าย PMT ในวันที่เลือก</td></tr>'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>รายงานประวัติการจ่ายเงินประจำวัน</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      body { font-family: 'Noto Sans Thai', Arial, sans-serif; color: #0f172a; font-size: 11px; margin: 0; }
      .toolbar { background: #f1f5f9; border-bottom: 1px solid #cbd5e1; padding: 8px; text-align: center; }
      .toolbar button { background: #0f172a; border: 0; border-radius: 6px; color: white; cursor: pointer; font-size: 13px; margin: 0 4px; padding: 7px 14px; }
      .page { padding: 10px; }
      .header { display: grid; grid-template-columns: 1fr 280px; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 10px; }
      .logo { max-height: 52px; max-width: 180px; object-fit: contain; margin-bottom: 4px; }
      .no-logo { display: flex; align-items: center; justify-content: center; width: 120px; height: 52px; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 10px; font-weight: 800; text-align: center; }
      .co-name { font-size: 18px; font-weight: 800; }
      .co-info { color: #475569; line-height: 1.45; margin-top: 3px; }
      .doc-title { text-align: right; }
      .doc-title h1 { font-size: 20px; margin: 0 0 4px; }
      .doc-title .range { color: #be123c; font-size: 15px; font-weight: 800; }
      .summary { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin: 12px 0; }
      .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; background: #fff; }
      .card .label { color: #64748b; font-size: 10px; }
      .card .value { font-size: 16px; font-weight: 800; margin-top: 2px; }
      .green { color: #047857; }
      .rose { color: #be123c; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #334155; color: #fff; font-size: 10px; padding: 6px; text-align: left; }
      td { border-bottom: 1px solid #e2e8f0; padding: 6px; vertical-align: top; }
      tr.cancelled td { color: #64748b; }
      .r { text-align: right; }
      .c { text-align: center; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .small { font-size: 10px; }
      .strong { font-weight: 800; }
      .empty { color: #64748b; padding: 24px; text-align: center; }
      .footer { border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 10px; margin-top: 12px; padding-top: 8px; }
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
          <h1>รายงานประวัติการจ่ายเงินประจำวัน</h1>
          <div class="range">${escapeHtml(paymentDailyReportDateRangeLabel(params.dateFrom, params.dateTo))}</div>
          <div>พิมพ์เมื่อ ${escapeHtml(params.printedAt.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }))}</div>
        </div>
      </div>
      <div class="summary">
        <div class="card"><div class="label">รายการ PMT ทั้งหมด</div><div class="value">${rows.length.toLocaleString('th-TH')}</div></div>
        <div class="card"><div class="label">จ่ายแล้ว</div><div class="value green">${paidRows.length.toLocaleString('th-TH')}</div></div>
        <div class="card"><div class="label">ยกเลิก</div><div class="value rose">${cancelledRows.length.toLocaleString('th-TH')}</div></div>
        <div class="card"><div class="label">ยอดจ่ายแล้วก่อน fee</div><div class="value">${escapeHtml(formatMoney(paidAmount))}</div></div>
        <div class="card"><div class="label">เงินออกสุทธิ</div><div class="value green">${escapeHtml(formatMoney(paidNet))}</div></div>
      </div>
      <div class="summary" style="grid-template-columns: repeat(3, 1fr);">
        <div class="card"><div class="label">Bank Fee ของรายการจ่ายแล้ว</div><div class="value">${escapeHtml(formatMoney(paidFee))}</div></div>
        <div class="card"><div class="label">ยอดรายการยกเลิก ไม่รวมเงินออก</div><div class="value rose">${escapeHtml(formatMoney(cancelledAmount))}</div></div>
        <div class="card"><div class="label">หมายเหตุการนับยอด</div><div class="value" style="font-size:12px">เงินออกสุทธินับเฉพาะ PMT จ่ายแล้ว</div></div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="c">#</th>
            <th>PMT</th>
            <th>วันที่</th>
            <th>ผู้รับเงิน</th>
            <th>เอกสารอ้างอิง</th>
            <th>บัญชีที่จ่าย</th>
            <th class="r">ยอดจ่าย</th>
            <th class="r">Bank Fee</th>
            <th class="r">เงินออกสุทธิ</th>
            <th>สถานะ</th>
            <th>หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>${rowHtml || emptyRow}</tbody>
      </table>
      <div class="footer">รายงานนี้เป็นเอกสารตรวจรายการจ่ายประจำวันจาก PMT history เท่านั้น ไม่รวม PMA ที่ยังไม่เกิด PMT</div>
    </div>
  </body></html>`
}

function buildCustomerReceiptPrintHtml(row: MoneyRow) {
  const billDocNos = row.billDocNos?.length ? row.billDocNos : [row.billDocNo || row.billId || '-']
  const accountSummaries = row.accountSummaries?.length ? row.accountSummaries : [row.accountName || '-']
  const lineRows = (row.receiptLines?.length ? row.receiptLines : billDocNos.map((docNo, index) => ({
    discountAmount: index === 0 ? row.discount ?? 0 : 0,
    lineNo: index + 1,
    receiptAmount: index === 0 ? row.amount : 0,
    salesBillDocNo: docNo,
    withholdingTaxAmount: index === 0 ? row.withholdingTax ?? 0 : 0,
  }))).map((line, index) => `<tr>
    <td class="c">${index + 1}</td>
    <td class="mono">${escapeHtml(line.salesBillDocNo || '-')}</td>
    <td class="r">${escapeHtml(formatMoney(line.receiptAmount))}</td>
    <td class="r">${escapeHtml(formatMoney(line.withholdingTaxAmount))}</td>
    <td class="r">${escapeHtml(formatMoney(line.discountAmount))}</td>
  </tr>`).join('')
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
      .label { color: #64748b; font-size: 10px; }
      .value { font-weight: 800; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; }
      th { background: #334155; color: white; padding: 7px; text-align: left; }
      td { border-bottom: 1px solid #e2e8f0; padding: 7px; vertical-align: top; }
      .r { text-align: right; }
      .c { text-align: center; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
      .green { color: #047857; }
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
          <div class="muted">ใบสำคัญรับเงิน Customer</div>
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
        <thead><tr><th class="c">#</th><th>บิลขาย</th><th class="r">ยอดรับ</th><th class="r">WHT</th><th class="r">ส่วนลด</th></tr></thead>
        <tbody>${lineRows}</tbody>
      </table>
      <div class="summary">
        <div class="box"><div class="label">ยอดรับ</div><div class="value">${escapeHtml(formatMoney(row.amount))}</div></div>
        <div class="box"><div class="label">WHT</div><div class="value">${escapeHtml(formatMoney(row.withholdingTax ?? 0))}</div></div>
        <div class="box"><div class="label">Bank Fee</div><div class="value">${escapeHtml(formatMoney(row.fee ?? 0))}</div></div>
        <div class="box"><div class="label">ยอดสุทธิ</div><div class="value green">${escapeHtml(formatMoney(row.netAmount))}</div></div>
      </div>
      <div class="box" style="margin-top:12px"><div class="label">หมายเหตุ</div><div>${escapeHtml(row.notes || '-')}</div></div>
    </div>
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
      .label { color: #64748b; font-size: 10px; }
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
          <div class="muted">ใบรับเงิน Customer รอดำเนินการ</div>
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
  const [cancelReceiptReason, setCancelReceiptReason] = useState('')
  const [cancelReceiptTarget, setCancelReceiptTarget] = useState<MoneyRow | null>(null)
  const [isCancellingReceipt, setIsCancellingReceipt] = useState(false)
  const [receiptBillDetailBill, setReceiptBillDetailBill] = useState<Bill | null>(null)
  const [receiptBillDetailOpen, setReceiptBillDetailOpen] = useState(false)
  const [receiptDetailOpen, setReceiptDetailOpen] = useState(false)
  const [receiptDetailRow, setReceiptDetailRow] = useState<MoneyRow | null>(null)
  const [paymentDetailOpen, setPaymentDetailOpen] = useState(false)
  const [paymentDetailRow, setPaymentDetailRow] = useState<MoneyRow | null>(null)
  const [paymentDetail, setPaymentDetail] = useState<PaymentHistoryDetail | null>(null)
  const [isPaymentDetailLoading, setIsPaymentDetailLoading] = useState(false)
  const [paymentDetailError, setPaymentDetailError] = useState<string | null>(null)
  const paymentQueueColumnResize = useResizableColumns(`daily.money-movement.${mode}.queue.v5`, paymentQueueColumns)
  const historyColumns = useMemo(() => mode === 'payment' ? paymentHistoryColumns : receiptHistoryColumns, [mode])
  const historyColumnResize = useResizableColumns(`daily.money-movement.${mode}.history.v5`, historyColumns)

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
  const customerSearchOptions = useMemo<SearchComboboxOption[]>(() => (data.customers ?? [])
    .filter((customer) => customer.active !== false)
    .map((customer) => ({
      id: customer.id,
      label: customer.name,
      searchText: `${customer.id} ${customer.name}`.toLowerCase(),
    })), [data.customers])
  const supplierMap = useMemo(() => new Map((data.suppliers ?? []).map((supplier) => [supplier.id, supplier])), [data.suppliers])
  const billMap = useMemo(() => new Map(data.bills.map((bill) => [bill.id, bill])), [data.bills])
  const paymentLines = useMemo(() => (mode === 'payment' ? (form as SupplierPaymentFormValues).lines ?? [] : []), [form, mode])
  const receiptLines = useMemo(() => (mode === 'receipt' ? (form as CustomerReceiptFormValues).lines ?? [] : []), [form, mode])
  const selectedBill = form.billId ? billMap.get(form.billId) : null
  const selectedBillBalance = selectedBill ? (mode === 'payment' ? selectedBill.payableBalance ?? 0 : selectedBill.receivableBalance ?? 0) : 0
  const paymentLineBalanceTotal = paymentLines.reduce((sum, line) => sum + (billMap.get(line.billId)?.payableBalance ?? 0), 0)
  const formNetAmount = mode === 'payment'
    ? form.amount + form.fee
    : form.amount - form.fee - form.withholdingTax
  const paymentSplits = mode === 'payment' ? (form as SupplierPaymentFormValues).splits ?? [] : []
  const receiptSplits = mode === 'receipt' ? (form as CustomerReceiptFormValues).splits ?? [] : []
  const paymentSplitTotal = paymentSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0)
  const receiptSplitTotal = receiptSplits.reduce((sum, split) => sum + (Number(split.amount) || 0), 0)

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
  const selectedReceiptBillDocNos = useMemo(() => new Set(receiptLines.map((line) => line.salesBillDocNo).filter(Boolean)), [receiptLines])
  const receiptSelectableBills = useMemo(() => {
    if (mode !== 'receipt') return []
    const customerId = (form as CustomerReceiptFormValues).customerId
    return data.bills.filter((bill) => !customerId || bill.customerId === customerId)
  }, [data.bills, form, mode])
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
          return left.docNo.localeCompare(right.docNo)
        case 'doc_desc':
          return right.docNo.localeCompare(left.docNo)
        case 'paid_asc':
          return (left.paidAmount ?? 0) - (right.paidAmount ?? 0)
        case 'paid_desc':
          return (right.paidAmount ?? 0) - (left.paidAmount ?? 0)
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
  const hasActiveBillFilters = billSearch.trim() !== '' || billSort !== 'date_desc'
  useEffect(() => {
    setBillPage(1)
  }, [billSearch, billPageSize, billSort])

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
    || (mode === 'payment' ? dateFrom !== todayDateInput() || dateTo !== todayDateInput() : dateFrom !== '' || dateTo !== '')
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
    if (mode === 'receipt') {
      const amount = roundMoney(bill.receivableBalance && bill.receivableBalance > 0 ? bill.receivableBalance : bill.totalAmount)
      setForm({
        ...initialForm(mode),
        amount,
        billId: bill.id,
        customerId: bill.customerId ?? '',
        docNo: bill.activeReceiptDocNos?.[0] ?? null,
        lines: [{
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
      method: bill.approvalPaymentMethod ?? '',
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
      lines,
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

  function getDailyPaymentPrintRows() {
    const query = search.trim().toLowerCase()
    const printDateFrom = dateFrom || todayDateInput()
    const printDateTo = dateTo || dateFrom || todayDateInput()
    return data.rows
      .filter((row) => row.docNo.startsWith('PMT'))
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

  async function printDailyPaymentReport() {
    if (mode !== 'payment') return
    const printWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
    if (!printWindow) {
      setError('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
      return
    }
    printWindow.document.open()
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมรายงาน</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมรายงานประวัติการจ่ายเงินประจำวัน...</body></html>`)
    printWindow.document.close()
    printWindow.focus()
    setIsPrintingDailyReport(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/company-profile', { cache: 'no-store' })
      const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
      const profile = companyProfileForPrint(payload)
      const printRows = getDailyPaymentPrintRows()
      printWindow.document.open()
      printWindow.document.write(buildPaymentDailyReportHtml(printRows, profile, {
        dateFrom: dateFrom || todayDateInput(),
        dateTo: dateTo || dateFrom || todayDateInput(),
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
    const nextNetAmount = roundMoney(nextAmount - nextFee - nextWithholdingTax)
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
      lines: normalizedLines,
      splits: nextSplits,
      withholdingTax: nextWithholdingTax,
    } as MoneyForm)
  }

  function updateReceiptForm(patch: Partial<CustomerReceiptFormValues>) {
    setError(null)
    const nextAmount = Number(form.amount) || 0
    const nextWithholdingTax = Number(form.withholdingTax) || 0
    const nextFee = 'fee' in patch ? Number(patch.fee) || 0 : Number(form.fee) || 0
    const nextNetAmount = roundMoney(nextAmount - nextFee - nextWithholdingTax)
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
    const payloadLines = (receiptForm.lines ?? [])
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
      lines: payloadLines,
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

  async function cancelCustomerReceiptRow() {
    if (!cancelReceiptTarget) return
    if (!cancelReceiptReason.trim()) {
      setError('กรุณาระบุเหตุผลการยกเลิก')
      return
    }
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
      setError(caught instanceof Error ? caught.message : 'ยกเลิกรับเงิน Customer ไม่ได้')
    } finally {
      setIsCancellingReceipt(false)
    }
  }

  const billSortState = billSortParts()

  return (
    <section className="space-y-5">
      {error && !formOpen ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5 text-sm">
        <KpiCard label={mode === 'payment' ? 'จำนวนรายการ' : 'จำนวน Voucher'} value={rows.length.toLocaleString('th-TH')} tone="slate" />
        <KpiCard label={amountLabel} value={formatMoney(metrics.rowAmount)} tone={mode === 'payment' ? 'rose' : 'emerald'} />
        <KpiCard label="ยอดสุทธิ" value={formatMoney(metrics.rowNet)} tone="blue" />
        {mode === 'payment'
          ? <KpiCard label="Bank Fee" value={formatMoney(metrics.rowFee)} tone="amber" />
          : <KpiCard label="WHT / Fee" value={`${formatMoney(metrics.rowWht)} / ${formatMoney(metrics.rowFee)}`} tone="amber" />}
        <div className="col-span-2 lg:col-span-1">
          <KpiCard label={balanceLabel} value={formatMoney(metrics.outstanding)} tone="violet" />
        </div>
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
        <>
          <div className="space-y-2 rounded-md bg-white p-3 shadow">
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
              <UiButton className="h-9 font-bold shadow" size="sm" type="button" variant="default" onClick={openForm}>
                + รับเงินเอง
              </UiButton>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <div>พบใบรับเงินรอดำเนินการ <span className="font-semibold text-slate-900">{receiptBillTotalRows}</span> รายการ</div>
            <div className="flex flex-wrap items-center gap-2">
              {paymentQueueColumnResize.hasCustomWidths ? <UiButton className="h-9 font-normal" size="sm" type="button" variant="outline" onClick={paymentQueueColumnResize.resetColumnWidths}>คืนค่าเดิมตาราง</UiButton> : null}
              <UiSelect
                aria-label="จำนวนรายการต่อหน้า"
                className="h-9 w-auto min-w-[96px] px-2"
                value={billPageSize}
                onChange={(event) => setBillPageSize(Number(event.target.value))}
              >
                {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
              </UiSelect>
              <UiButton className="h-9 font-normal" disabled={receiptBillCurrentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setBillPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</UiButton>
              <span className="px-1">หน้า {receiptBillCurrentPage} / {receiptBillTotalPages}</span>
              <UiButton className="h-9 font-normal" disabled={receiptBillCurrentPage >= receiptBillTotalPages} size="sm" type="button" variant="outline" onClick={() => setBillPage((value) => Math.min(receiptBillTotalPages, value + 1))}>ถัดไป</UiButton>
            </div>
          </div>

          <div className="block lg:hidden space-y-3">
            {isLoading ? (
              <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
            ) : null}
            {!isLoading && receiptBillPageRows.map((bill) => {
              const balance = bill.receivableBalance ?? 0
              const cancelableReceipt = findActiveReceiptForBill(bill)
              const receiptDocNo = receiptQueueDocNo(bill)
              return (
                <div
                  key={bill.id}
                  className="rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => openReceivableBillDetail(bill)}
                >
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{receiptDocNo}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">อ้างอิง {bill.docNo}</div>
                    </div>
                    <span className="text-xs text-slate-500">{formatDateDisplay(bill.date)}</span>
                  </div>
                  <div className="mb-3 space-y-1 text-xs text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-500">ลูกค้า: </span>
                      <span className="text-slate-800">{partyMap.get(bill.customerId ?? '') ?? bill.customerId ?? '-'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">อายุเอกสาร: {ageInDays(bill.date)} วัน</div>
                    <div className="text-[11px] font-semibold text-amber-700">{receiptQueueStatusLabel(bill)}</div>
                  </div>
                  <div className="flex items-end justify-between border-t border-slate-100 pt-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block">ค้างรับ</span>
                      <span className="font-bold text-sm tabular-nums text-emerald-700">{formatMoney(balance)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">ยอดรวมบิล</span>
                      <span className="font-bold text-slate-900 text-sm tabular-nums">{formatMoney(bill.totalAmount)}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                    <UiButton
                      className="font-normal border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      size="xs"
                      type="button"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation()
                        printReceivableBill(bill)
                      }}
                    >
                      พิมพ์
                    </UiButton>
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
                      แก้ไข
                    </UiButton>
                    <UiButton
                      className="font-normal border-red-200 text-red-700"
                      disabled={!cancelableReceipt}
                      size="xs"
                      title={cancelableReceipt ? `ยกเลิกใบรับเงิน ${cancelableReceipt.docNo}` : 'ยังไม่มีใบรับเงินให้ยกเลิก'}
                      type="button"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!cancelableReceipt) return
                        setCancelReceiptTarget(cancelableReceipt)
                        setCancelReceiptReason('')
                      }}
                    >
                      ยกเลิก
                    </UiButton>
                  </div>
                </div>
              )
            })}
            {!isLoading && receiptBillPageRows.length === 0 ? (
              <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">ไม่พบใบรับเงินรอดำเนินการตามเงื่อนไข</div>
            ) : null}
          </div>

          <div className="hidden lg:block overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <Table className="text-xs" style={{ minWidth: paymentQueueColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {paymentQueueColumns.filter((column) => column.key !== 'bankName').map((column, index, columns) => {
                  const style = paymentQueueColumnResize.getColumnStyle(column.key)
                  if (index === columns.length - 1) {
                    return <col key={column.key} style={{ minWidth: column.minWidth }} />
                  }
                  return <col key={column.key} style={style} />
                })}
              </colgroup>
              <TableHeader className="text-slate-700">
                <tr>
                  <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="เลขที่ใบรับเงิน" resizeProps={paymentQueueColumnResize.getResizeHandleProps('docNo', 'เลขที่ใบรับเงิน')} sortKey="docNo" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="วันที่" resizeProps={paymentQueueColumnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="ลูกค้า" resizeProps={paymentQueueColumnResize.getResizeHandleProps('partyName', 'ลูกค้า')} sortKey="supplier" onSort={toggleBillSort} />
                  <ResizableTableHead label="บิลขายอ้างอิง" resizeProps={paymentQueueColumnResize.getResizeHandleProps('accountNo', 'บิลขายอ้างอิง')} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="ยอดรวม" resizeProps={paymentQueueColumnResize.getResizeHandleProps('totalAmount', 'ยอดรวม')} sortKey="totalAmount" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="รับแล้ว" resizeProps={paymentQueueColumnResize.getResizeHandleProps('paidAmount', 'รับแล้ว')} sortKey="paidAmount" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="ค้างรับ" resizeProps={paymentQueueColumnResize.getResizeHandleProps('balance', 'ค้างรับ')} sortKey="balance" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="อายุ(วัน)" resizeProps={paymentQueueColumnResize.getResizeHandleProps('age', 'อายุ(วัน)')} sortKey="age" onSort={toggleBillSort} />
                  <ResizableTableHead align="center" label="จัดการ" resizeProps={paymentQueueColumnResize.getResizeHandleProps('action', 'Action')} />
                </tr>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                {!isLoading && receiptBillPageRows.map((bill) => {
                  const balance = bill.receivableBalance ?? 0
                  const receivedAmount = Math.max(0, (bill.totalAmount ?? 0) - balance)
                  const cancelableReceipt = findActiveReceiptForBill(bill)
                  const receiptDocNo = receiptQueueDocNo(bill)
                  return (
                    <TableRow key={bill.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openReceivableBillDetail(bill)}>
                      <TableCell className="text-xs font-semibold text-slate-700">
                        <div>{receiptDocNo}</div>
                        <div className="mt-1 text-[11px] font-normal text-amber-700">{receiptQueueStatusLabel(bill)}</div>
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{formatDateDisplay(bill.date)}</TableCell>
                      <TableCell className="max-w-72 truncate text-xs font-semibold text-slate-700">{partyMap.get(bill.customerId ?? '') ?? bill.customerId ?? '-'}</TableCell>
                      <TableCell className="text-xs font-semibold text-slate-700">{bill.docNo}</TableCell>
                      <TableCell className="whitespace-nowrap pr-4 text-right text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(bill.totalAmount)}</TableCell>
                      <TableCell className="whitespace-nowrap pr-4 text-right text-xs font-semibold text-blue-700 tabular-nums">{formatMoney(receivedAmount)}</TableCell>
                      <TableCell className="whitespace-nowrap pr-4 text-right text-xs font-semibold text-emerald-700 tabular-nums">{formatMoney(balance)}</TableCell>
                      <TableCell className="whitespace-nowrap pr-4 text-right text-xs font-semibold text-slate-700 tabular-nums">{ageInDays(bill.date)}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                        <UiButton
                          className="font-normal border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          size="xs"
                          type="button"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation()
                            printReceivableBill(bill)
                          }}
                        >
                          พิมพ์
                        </UiButton>
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
                          แก้ไข
                        </UiButton>
                        <UiButton
                          className="font-normal border-red-200 text-red-700"
                          disabled={!cancelableReceipt}
                          size="xs"
                          title={cancelableReceipt ? `ยกเลิกใบรับเงิน ${cancelableReceipt.docNo}` : 'ยังไม่มีใบรับเงินให้ยกเลิก'}
                          type="button"
                          variant="outline"
                          onClick={(event) => {
                            event.stopPropagation()
                            if (!cancelableReceipt) return
                            setCancelReceiptTarget(cancelableReceipt)
                            setCancelReceiptReason('')
                          }}
                        >
                          ยกเลิก
                        </UiButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {!isLoading && receiptBillPageRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={9}>ไม่พบใบรับเงินรอดำเนินการตามเงื่อนไข</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </div>
        </>
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
              {paymentQueueColumnResize.hasCustomWidths ? <UiButton className="h-9 font-normal" size="sm" type="button" variant="outline" onClick={paymentQueueColumnResize.resetColumnWidths}>คืนค่าเดิมตาราง</UiButton> : null}
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

          {/* Mobile Card List for Payment Entry Queue */}
          <div className="block lg:hidden space-y-3">
            {isLoading ? (
              <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
            ) : null}
            {!isLoading && supplierBillPageRows.map((bill) => {
              const balance = bill.payableBalance ?? 0
              const supplier = supplierMap.get(bill.supplierId ?? '')
              const supplierBankAccounts = approvalBankAccountLines(bill).length > 0 ? approvalBankAccountLines(bill) : supplierBankAccountLines(supplier, paymentMethods)
              const bankAccount = supplierBankAccounts[0]
              return (
                <div
                  key={`${bill.id}:${bill.approvalId ?? 'no-approval'}`}
                  className="rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => openFormForBill(bill)}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-bold text-slate-800 text-sm">
                      {bill.docNo}
                      {bill.sourceDocNo && bill.sourceDocNo !== bill.docNo ? (
                        <span className="ml-2 text-xs font-normal text-slate-500">(อ้างอิง {bill.sourceDocNo})</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-slate-500">{formatDateDisplay(bill.date)}</span>
                  </div>
                  <div className="text-xs text-slate-600 mb-3 space-y-1">
                    <div>
                      <span className="font-semibold text-slate-500">ผู้รับเงิน: </span>
                      <span className="text-slate-800">{partyMap.get(bill.supplierId ?? '') ?? bill.supplierId ?? '-'}</span>
                    </div>
                    {bankAccount ? (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                        <span>ธนาคาร: {bankAccount.bankName || '-'}</span>
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
                      </div>
                    ) : null}
                    <div className="text-[11px] text-slate-500">
                      อายุเอกสาร: {ageInDays(bill.date)} วัน
                    </div>
                  </div>
                  <div className="flex justify-between items-end pt-2 border-t border-slate-100">
                    <div>
                      <span className="text-[10px] text-slate-400 block">ค้างชำระ</span>
                      <span className={`font-bold text-sm tabular-nums ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatMoney(balance)}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">ยอดรวม</span>
                      <span className="font-bold text-slate-900 text-sm tabular-nums">{formatMoney(bill.totalAmount)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
            {!isLoading && supplierBillPageRows.length === 0 ? (
              <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">ไม่พบ PMA ค้างจ่ายตามเงื่อนไข</div>
            ) : null}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
            <Table className="text-xs" style={{ minWidth: paymentQueueColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
              <colgroup>
                {paymentQueueColumns.map((column) => {
                  const style = paymentQueueColumnResize.getColumnStyle(column.key);
                  return <col key={column.key} style={style} />;
                })}
              </colgroup>
              <TableHeader className="text-slate-700">
                <tr>
                  <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="เลขที่รายการ" resizeProps={paymentQueueColumnResize.getResizeHandleProps('docNo', 'เลขที่รายการ')} sortKey="docNo" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="วันที่" resizeProps={paymentQueueColumnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="left" direction={billSortState.direction} label="ผู้รับเงิน" resizeProps={paymentQueueColumnResize.getResizeHandleProps('partyName', 'ผู้รับเงิน')} sortKey="supplier" onSort={toggleBillSort} />
                  <ResizableTableHead label="ธนาคาร" resizeProps={paymentQueueColumnResize.getResizeHandleProps('bankName', 'ธนาคาร')} />
                  <ResizableTableHead label="เลขบัญชี" resizeProps={paymentQueueColumnResize.getResizeHandleProps('accountNo', 'เลขบัญชี')} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="ยอดรวม" resizeProps={paymentQueueColumnResize.getResizeHandleProps('totalAmount', 'ยอดรวม')} sortKey="totalAmount" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="จ่ายแล้ว" resizeProps={paymentQueueColumnResize.getResizeHandleProps('paidAmount', 'จ่ายแล้ว')} sortKey="paidAmount" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="คงเหลือรอออก PMT" resizeProps={paymentQueueColumnResize.getResizeHandleProps('balance', 'คงเหลือรอออก PMT')} sortKey="balance" onSort={toggleBillSort} />
                  <TableSortHeader activeKey={billSortState.field} align="right" direction={billSortState.direction} label="อายุ(วัน)" resizeProps={paymentQueueColumnResize.getResizeHandleProps('age', 'อายุ(วัน)')} sortKey="age" onSort={toggleBillSort} />
                  <ResizableTableHead align="center" label="จัดการ" resizeProps={paymentQueueColumnResize.getResizeHandleProps('action', 'Action')} />
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
                          {bill.sourceDocNo && bill.sourceDocNo !== bill.docNo ? <div className="mt-1 text-[11px] font-normal text-slate-500">อ้างอิง {bill.sourceDocNo}</div> : null}
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
                        <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(bill.totalAmount)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-blue-700 tabular-nums">{formatMoney(bill.paidAmount)}</TableCell>
                        <TableCell className={`whitespace-nowrap text-right pr-4 text-xs font-semibold tabular-nums ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{formatMoney(balance)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-slate-700 tabular-nums">{ageInDays(bill.date)}</TableCell>
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
          </div>
        </>
      ) : null}

      {formOpen && showEntrySection ? (
        <Dialog open onOpenChange={(open) => {
          if (!open && !isSaving) setFormOpen(false)
        }}>
          <DialogContent className={`top-[max(2rem,50%)] max-h-[90vh] overflow-y-auto p-0 ${mode === 'payment' ? 'max-w-5xl' : 'max-w-4xl'}`} hideClose>
            <form noValidate onSubmit={save}>
            <DialogHeader className="flex-row items-center justify-between px-5 py-4">
              <div>
                <DialogTitle className="font-bold text-white">
                  {mode === 'payment' ? 'สร้าง Payment Voucher' : (form.id ? 'แก้ไข Receipt Voucher' : title)}
                </DialogTitle>
                {mode === 'payment' ? null : <p className="text-xs text-slate-300 opacity-80">{subtitle}</p>}
              </div>
              <UiButton className="h-8 w-8 px-0 text-2xl text-slate-400 hover:text-white hover:bg-slate-800" size="icon" type="button" variant="ghost" onClick={() => setFormOpen(false)}>&times;</UiButton>
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
                    <span className="mb-1 block text-xs text-slate-600">วิธีจ่าย/รับเงิน</span>
                    <UiSelect className="h-9 rounded-md border border-slate-300 px-2 py-1.5 text-sm" value={form.method ?? ''} onChange={(event) => setForm({ ...form, method: event.target.value })}>
                      <option value="">ไม่ระบุ</option>
                      {paymentMethods.map((method) => (
                        <option key={method.name} value={method.name}>{method.name}</option>
                      ))}
                    </UiSelect>
                  </label>
                  <Field label="หมายเหตุ" value={form.notes ?? ''} onChange={(value) => setForm({ ...form, notes: value })} />
                </div>
                <div className="px-5 pb-5">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-800">บิลขายที่รับชำระ</div>
                    <UiButton className="h-8 font-normal" size="sm" type="button" variant="outline" onClick={addReceiptLine}>
                      <Plus aria-hidden="true" className="mr-1 h-4 w-4" />
                      เพิ่มบิล
                    </UiButton>
                  </div>
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="w-full min-w-[760px] table-fixed text-xs">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="w-[260px] p-2 text-left">Sales Bill</th>
                          <th className="w-[110px] p-2 text-right">ค้างรับ</th>
                          <th className="w-[120px] p-2 text-right">ยอดรับ</th>
                          <th className="w-[110px] p-2 text-right">WHT</th>
                          <th className="w-[110px] p-2 text-right">ส่วนลด</th>
                          <th className="w-[80px] p-2 text-center">ลบ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiptLines.map((line, index) => {
                          const selectedLineBill = billMap.get(line.salesBillDocNo)
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
                                  min="0"
                                  step="0.01"
                                  type="number"
                                  value={String(line.receiptAmount)}
                                  onChange={(event) => updateReceiptLine(index, { receiptAmount: Number(event.target.value) })}
                                />
                              </td>
                              <td className="p-2">
                                <UiInput
                                  className="h-9 text-right tabular-nums"
                                  min="0"
                                  step="0.01"
                                  type="number"
                                  value={String(line.withholdingTaxAmount)}
                                  onChange={(event) => updateReceiptLine(index, { withholdingTaxAmount: Number(event.target.value) })}
                                />
                              </td>
                              <td className="p-2">
                                <UiInput
                                  className="h-9 text-right tabular-nums"
                                  min="0"
                                  step="0.01"
                                  type="number"
                                  value={String(line.discountAmount)}
                                  onChange={(event) => updateReceiptLine(index, { discountAmount: Number(event.target.value) })}
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
                </div>
                <div className="px-5 pb-5">
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
                  />
                </div>
                <div className="grid gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 md:grid-cols-5">
                  <SummaryPill label={amountLabel} value={formatMoney(form.amount)} />
                  <SummaryPill label="WHT" value={formatMoney(form.withholdingTax)} />
                  <SummaryPill label="ตัดหนี้ AR" value={formatMoney(form.amount + form.withholdingTax + form.discount)} />
                  <SummaryPill label="Fee / Discount" value={`${formatMoney(form.fee)} / ${formatMoney(form.discount)}`} />
                  <SummaryPill label="Net" value={formatMoney(formNetAmount)} />
                </div>
              </>
            )}
            <DialogFooter className="border-t border-slate-200 px-5 py-4">
              <UiButton className="font-normal text-slate-600" type="button" variant="ghost" onClick={() => setFormOpen(false)}>ยกเลิก</UiButton>
              <UiButton className={`px-5 font-semibold text-white disabled:opacity-60 ${theme.action}`} disabled={isSaving} type="submit" variant="default">บันทึก</UiButton>
            </DialogFooter>
          </form>
        </DialogContent>
        </Dialog>
      ) : null}

      {showHistorySection ? (
        <>
          {/* Desktop Toolbar (Hidden on Mobile) */}
          <div className="hidden lg:block space-y-2 rounded-md bg-white p-3 shadow">
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
              {mode === 'payment' ? (
                <UiButton
                  className="h-9 font-semibold"
                  disabled={isPrintingDailyReport}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => void printDailyPaymentReport()}
                >
                  {isPrintingDailyReport ? 'กำลังเตรียมรายงาน...' : 'พิมพ์รายงานประจำวัน'}
                </UiButton>
              ) : null}
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

          {/* Mobile Toolbar */}
          <div className="space-y-2 rounded-md bg-white p-3 shadow lg:hidden">
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
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden">
              <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                  <h4 className="font-bold text-slate-800">ตัวกรองประวัติ</h4>
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

                  {mode === 'payment' ? (
                    <div>
                      <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะ</span>
                      <div className="flex flex-wrap gap-2">
                        {([
                          { label: 'ทั้งหมด', value: 'all' },
                          { label: 'จ่ายแล้ว', value: 'active' },
                          { label: 'ยกเลิก', value: 'cancelled' },
                        ] as Array<{ label: string; value: PaymentHistoryStatusFilter }>).map((option) => {
                          const active = paymentHistoryStatusFilter === option.value
                          return (
                            <button
                              key={option.value}
                              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                              type="button"
                              onClick={() => setPaymentHistoryStatusFilter(option.value)}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ) : null}

                  {mode === 'payment' ? (
                    <div className="pt-2">
                      <UiButton
                        className="w-full h-11 font-semibold"
                        disabled={isPrintingDailyReport}
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setShowMobileFilters(false)
                          void printDailyPaymentReport()
                        }}
                      >
                        {isPrintingDailyReport ? 'กำลังเตรียมรายงาน...' : 'พิมพ์รายงานประจำวัน'}
                      </UiButton>
                    </div>
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

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
              <div>พบทั้งหมด <span className="font-semibold text-slate-900">{historyTotalRows}</span> รายการ</div>
              <div className="flex flex-wrap items-center gap-2">
                {historyColumnResize.hasCustomWidths ? <UiButton className="font-normal" size="sm" type="button" variant="outline" onClick={historyColumnResize.resetColumnWidths}>คืนค่าเดิมตาราง</UiButton> : null}
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

            {/* Mobile Card List for History */}
            <div className="block lg:hidden space-y-3 mt-3">
              {isLoading ? (
                <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
              ) : null}
              {!isLoading && historyPageRows.map((row) => {
                const billDocNos = row.billDocNos?.length ? row.billDocNos : [row.billId ? (billMap.get(row.billId)?.docNo ?? row.billDocNo ?? row.billId) : (row.billDocNo ?? '-')]
                const accountSummaries = row.accountSummaries?.length ? row.accountSummaries : [row.accountName]
                const clickable = mode === 'payment' || mode === 'receipt'
                return (
                  <div
                    key={row.id}
                    className={`rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 transition-colors ${clickable ? 'cursor-pointer' : ''}`}
                    onClick={clickable ? () => {
                      if (mode === 'payment') void openPaymentHistoryRow(row)
                      else openReceiptDetail(row)
                    } : undefined}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
                      <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
                    </div>
                    <div className="text-xs text-slate-600 mb-3 space-y-1">
                      <div>
                        <span className="font-semibold text-slate-500">{partyLabel}: </span>
                        <span className="text-slate-800">{row.partyName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        อ้างอิง: {billDocNos.join(', ')}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        บัญชี: {accountSummaries.join(', ')}
                      </div>
                      {row.notes ? (
                        <div className="text-[11px] text-slate-400 italic truncate">
                          หมายเหตุ: {row.notes}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex justify-between items-end pt-2 border-t border-slate-100">
                      <div>
                        {mode === 'payment' ? (
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${paymentHistoryStatusTone(row.status)}`}>
                            <span className={`size-1.5 rounded-full ${paymentHistoryStatusDot(row.status)}`} />
                            {paymentHistoryStatusLabel(row.status)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">เสร็จสิ้น</span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">ยอดสุทธิ</span>
                        <span className={`font-bold text-sm tabular-nums ${theme.strong}`}>{formatMoney(row.netAmount)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
              {!isLoading && historyPageRows.length === 0 ? (
                <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">ยังไม่มีรายการ</div>
              ) : null}
            </div>

            {/* Desktop Table */}
            <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm mt-3">
              <Table className="text-xs" style={{ minWidth: historyColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {historyColumns.map((column) => {
                    const style = historyColumnResize.getColumnStyle(column.key);
                    return <col key={column.key} style={style} />;
                  })}
                </colgroup>
                <TableHeader className="text-slate-700">
                  <tr>
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label="เลขที่รายการ" resizeProps={historyColumnResize.getResizeHandleProps('docNo', 'เลขที่รายการ')} sortKey="docNo" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label="วันที่สร้างรายการ" resizeProps={historyColumnResize.getResizeHandleProps('date', 'วันที่สร้างรายการ')} sortKey="date" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label={partyLabel} resizeProps={historyColumnResize.getResizeHandleProps('partyName', partyLabel)} sortKey="partyName" onSort={toggleHistorySort} />
                    <ResizableTableHead label="บิลอ้างอิง" resizeProps={historyColumnResize.getResizeHandleProps('billRefs', 'บิลอ้างอิง')} />
                    <TableSortHeader activeKey={historySortField} align="left" direction={historySortDirection} label="บัญชีที่ใช้ทำจ่าย" resizeProps={historyColumnResize.getResizeHandleProps('accountName', 'บัญชีที่ใช้ทำจ่าย')} sortKey="accountName" onSort={toggleHistorySort} />
                    <TableSortHeader activeKey={historySortField} align="right" direction={historySortDirection} label={amountLabel} resizeProps={historyColumnResize.getResizeHandleProps('amount', amountLabel)} sortKey="amount" onSort={toggleHistorySort} />
                    <ResizableTableHead align="right" label="WHT" resizeProps={historyColumnResize.getResizeHandleProps('wht', 'WHT')} />
                    <ResizableTableHead align="right" label="Bank Fee" resizeProps={historyColumnResize.getResizeHandleProps('bankFee', 'Bank Fee')} />
                    <TableSortHeader activeKey={historySortField} align="right" direction={historySortDirection} label="สุทธิ" resizeProps={historyColumnResize.getResizeHandleProps('netAmount', 'สุทธิ')} sortKey="netAmount" onSort={toggleHistorySort} />
                    {mode === 'payment' ? <ResizableTableHead label="สถานะ" resizeProps={historyColumnResize.getResizeHandleProps('status', 'สถานะ')} /> : null}
                    <ResizableTableHead label="หมายเหตุ" resizeProps={historyColumnResize.getResizeHandleProps('notes', 'หมายเหตุ')} />
                  </tr>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={mode === 'payment' ? 11 : 10}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                    {!isLoading && historyPageRows.map((row) => {
                      const billDocNos = row.billDocNos?.length ? row.billDocNos : [row.billId ? (billMap.get(row.billId)?.docNo ?? row.billDocNo ?? row.billId) : (row.billDocNo ?? '-')]
                      const accountSummaries = row.accountSummaries?.length ? row.accountSummaries : [row.accountName]
                      const clickable = mode === 'payment' || mode === 'receipt'
                      return (
                        <TableRow
                          key={row.id}
                          className={`hover:bg-slate-50 ${clickable ? 'cursor-pointer' : ''}`}
                          onClick={clickable ? () => {
                            if (mode === 'payment') void openPaymentHistoryRow(row)
                            else openReceiptDetail(row)
                          } : undefined}
                        >
                          <TableCell className="text-xs font-semibold text-slate-700">{row.docNo}</TableCell>
                          <TableCell className="text-xs font-semibold text-slate-700">{formatDateDisplay(row.date)}</TableCell>
                          <TableCell className="text-xs font-semibold text-slate-700">{row.partyName}</TableCell>
                          <TableCell className="text-xs font-semibold text-slate-700">
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-700">{billDocNos.length.toLocaleString('th-TH')} บิล</div>
                              <CollapsedList items={billDocNos} />
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
                              <CollapsedList items={accountSummaries} />
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.amount)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-amber-700 tabular-nums">{formatMoney(row.withholdingTax)}</TableCell>
                          <TableCell className="whitespace-nowrap text-right pr-4 text-xs font-semibold text-slate-700 tabular-nums">{formatMoney(row.fee)}</TableCell>
                          <TableCell className={`whitespace-nowrap text-right pr-4 text-xs font-semibold tabular-nums ${theme.strong}`}>{formatMoney(row.netAmount)}</TableCell>
                          {mode === 'payment' ? (
                            <TableCell>
                              <div className={`inline-flex items-center gap-1.5 text-xs font-semibold ${paymentHistoryStatusTone(row.status)}`}>
                                <span className={`size-1.5 rounded-full ${paymentHistoryStatusDot(row.status)}`} />
                                <span>{paymentHistoryStatusLabel(row.status)}</span>
                              </div>
                            </TableCell>
                          ) : null}
                          <TableCell className="max-w-56 truncate text-xs font-semibold text-slate-700">{row.notes || '-'}</TableCell>
                        </TableRow>
                      )
                    })}
                  {!isLoading && historyPageRows.length === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={mode === 'payment' ? 11 : 10}>ยังไม่มีรายการ</TableCell></TableRow> : null}
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
          if (!open && !isCancellingReceipt) setCancelReceiptTarget(null)
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>ยกเลิก Receipt Voucher</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-md bg-slate-50 p-3">
                <div className="font-semibold text-slate-900">{cancelReceiptTarget.docNo}</div>
                <div className="text-slate-600">{cancelReceiptTarget.partyName} · {formatMoney(cancelReceiptTarget.amount)}</div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-600">เหตุผลการยกเลิก</span>
                <textarea
                  className="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2"
                  value={cancelReceiptReason}
                  onChange={(event) => setCancelReceiptReason(event.target.value)}
                />
              </label>
            </div>
            <DialogFooter>
              <UiButton disabled={isCancellingReceipt} type="button" variant="ghost" onClick={() => setCancelReceiptTarget(null)}>ปิด</UiButton>
              <UiButton className="bg-red-600 text-white hover:bg-red-700" disabled={isCancellingReceipt} type="button" variant="default" onClick={cancelCustomerReceiptRow}>ยืนยันยกเลิก</UiButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {mode === 'payment' && !historyOnly && cancelApprovalTarget ? (
        <Dialog open onOpenChange={(open) => {
          if (!open && !isCancellingApproval) {
            setCancelApprovalTarget(null)
            setCancelApprovalReason('')
          }
        }}>
          <DialogContent className="max-w-lg p-0" hideClose>
            <DialogHeader className="px-5 py-4">
              <DialogTitle className="font-bold text-white">ยกเลิกรายการรอจ่าย</DialogTitle>
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
            <DialogFooter className="border-t border-slate-200 px-5 py-4">
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

      {/* Floating Action Button (FAB) for Mobile (Receipt Mode) */}
      {mode === 'receipt' && showEntrySection ? (
        <div className="fixed bottom-6 right-6 z-40 lg:hidden">
          <button
            className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg active:scale-95 transition-transform"
            onClick={openForm}
            type="button"
            aria-label="รับเงิน Customer ใหม่"
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
      <DialogContent className="max-h-[90vh] max-w-6xl rounded-md !p-0 overflow-hidden flex flex-col bg-slate-900 border-0" fallbackTitle="รายละเอียดการจ่ายเงิน" hideClose>
        <DialogHeader className="flex-row items-center justify-between gap-3 px-5 py-4 bg-slate-900 text-white">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-bold text-white">{detail?.heading ?? 'รายละเอียดการจ่ายเงิน'}</DialogTitle>
            <div className="mt-1 truncate font-mono text-xs text-slate-300">{detail?.docNo ?? row?.docNo ?? '-'}</div>
          </div>
          <UiButton
            aria-label="ปิดรายละเอียด"
            className="h-9 w-9 shrink-0 px-0 text-slate-400 hover:text-white hover:bg-slate-800"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </UiButton>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 p-5 text-sm bg-slate-50">
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
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="font-semibold text-slate-900">{detail.type === 'approval' ? 'PMT ที่ใช้รายการนี้' : 'รายการที่ทำจ่าย'}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
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
                <div className="overflow-hidden rounded-md bg-white shadow">
                  <div className="border-b border-slate-200 px-4 py-3">
                    <h2 className="font-semibold text-slate-900">บัญชีที่ใช้ทำจ่าย</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
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
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden rounded-md !p-0 flex flex-col bg-slate-900 border-0" fallbackTitle="รายละเอียดใบรับเงิน Customer" hideClose>
        <DialogHeader className="flex-row items-center justify-between gap-3 bg-slate-900 px-5 py-4 text-white">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-bold text-white">รายละเอียดใบรับเงิน Customer</DialogTitle>
            <div className="mt-1 truncate font-mono text-xs text-slate-300">{receiptDocNo}</div>
          </div>
          <UiButton
            aria-label="ปิดรายละเอียด"
            className="h-9 w-9 shrink-0 px-0 text-slate-400 hover:bg-slate-800 hover:text-white"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </UiButton>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 bg-slate-50 p-5 text-sm">
          {!bill ? <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow">ไม่พบข้อมูล</div> : (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-md bg-white p-3 shadow">
                  <div className="text-xs text-slate-500">ยอดรวม</div>
                  <div className="text-lg font-bold text-slate-900">{formatMoney(bill.totalAmount)}</div>
                </div>
                <div className="rounded-md bg-white p-3 shadow">
                  <div className="text-xs text-slate-500">รับแล้ว</div>
                  <div className="text-lg font-bold text-blue-700">{formatMoney(receivedAmount)}</div>
                </div>
                <div className="rounded-md bg-white p-3 shadow">
                  <div className="text-xs text-slate-500">ค้างรับ</div>
                  <div className="text-lg font-bold text-emerald-700">{formatMoney(balance)}</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <DetailCard label="เลขที่ใบรับเงิน" value={receiptDocNo} />
                <DetailCard label="วันที่" value={formatDateDisplay(bill.date)} />
                <DetailCard label="ลูกค้า" value={customerName || '-'} />
                <DetailCard label="บิลขายอ้างอิง" value={bill.docNo} />
                <DetailCard label="เอกสารอ้างอิง" value={bill.sourceDocNo || bill.docNo} />
                <DetailCard label="สถานะใบรับเงิน" value={receiptQueueStatusLabel(bill)} />
                <DetailCard label="สถานะบิลขาย" value={paymentBillStatus(bill)} />
                <DetailCard label="อายุเอกสาร" value={`${ageInDays(bill.date)} วัน`} />
              </div>
            </>
          )}
        </div>
        <DialogFooter className="border-t border-slate-200 bg-white px-5 py-4">
          <UiButton className="font-normal border-emerald-200 text-emerald-700 hover:bg-emerald-50" disabled={!bill} type="button" variant="outline" onClick={() => bill && onPrint(bill)}>พิมพ์</UiButton>
          <UiButton className="font-normal" disabled={!bill} type="button" variant="outline" onClick={() => bill && onEdit(bill)}>แก้ไข</UiButton>
          <UiButton
            className="font-normal border-red-200 text-red-700"
            disabled={!cancelableReceipt}
            title={cancelableReceipt ? `ยกเลิกใบรับเงิน ${cancelableReceipt.docNo}` : 'ยังไม่มีใบรับเงินให้ยกเลิก'}
            type="button"
            variant="outline"
            onClick={() => cancelableReceipt && onCancel(cancelableReceipt)}
          >
            ยกเลิก
          </UiButton>
          <UiButton className="font-normal text-slate-600" type="button" variant="ghost" onClick={() => onOpenChange(false)}>ปิด</UiButton>
        </DialogFooter>
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
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden rounded-md !p-0 flex flex-col bg-slate-900 border-0" fallbackTitle="รายละเอียดรับเงิน Customer" hideClose>
        <DialogHeader className="flex-row items-center justify-between gap-3 bg-slate-900 px-5 py-4 text-white">
          <div className="min-w-0">
            <DialogTitle className="truncate text-base font-bold text-white">รายละเอียดรับเงิน Customer</DialogTitle>
            <div className="mt-1 truncate font-mono text-xs text-slate-300">{row?.docNo ?? '-'}</div>
          </div>
          <UiButton
            aria-label="ปิดรายละเอียด"
            className="h-9 w-9 shrink-0 px-0 text-slate-400 hover:bg-slate-800 hover:text-white"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </UiButton>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 bg-slate-50 p-5 text-sm">
          {!row ? <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow">ไม่พบข้อมูล</div> : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-md bg-white p-3 shadow">
                  <div className="text-xs text-slate-500">ยอดรับ</div>
                  <div className="text-lg font-bold text-emerald-700">{formatMoney(row.amount)}</div>
                </div>
                <div className="rounded-md bg-white p-3 shadow">
                  <div className="text-xs text-slate-500">ยอดสุทธิ</div>
                  <div className="text-lg font-bold text-blue-700">{formatMoney(row.netAmount)}</div>
                </div>
                <div className="rounded-md bg-white p-3 shadow">
                  <div className="text-xs text-slate-500">WHT / Fee</div>
                  <div className="text-lg font-bold text-slate-900">{formatMoney(row.withholdingTax ?? 0)} / {formatMoney(row.fee ?? 0)}</div>
                </div>
                <div className="rounded-md bg-white p-3 shadow">
                  <div className="text-xs text-slate-500">สถานะ</div>
                  <div className={`text-lg font-bold ${isCancelled ? 'text-slate-500' : 'text-emerald-700'}`}>{isCancelled ? 'ยกเลิก' : 'รับเงินแล้ว'}</div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <DetailCard label="เลขที่เอกสาร" value={row.docNo} />
                <DetailCard label="วันที่รับเงิน" value={formatDateDisplay(row.date)} />
                <DetailCard label="ลูกค้า" value={row.partyName || '-'} />
                <DetailCard label="วิธีรับเงิน" value={row.method || '-'} />
                <DetailCard label="บัญชีรับเงิน" value={accountSummaries.join('\n')} multiline />
                <DetailCard label="หมายเหตุ" value={row.notes || '-'} multiline />
              </div>

              <div className="overflow-hidden rounded-md bg-white shadow">
                <div className="border-b border-slate-200 px-4 py-3">
                  <h2 className="font-semibold text-slate-900">บิลขายที่รับชำระ</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="p-2 text-left">บิลขาย</th>
                        <th className="p-2 text-right">ยอดรับ</th>
                        <th className="p-2 text-right">WHT</th>
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
        <DialogFooter className="border-t border-slate-200 bg-white px-5 py-4">
          {!readOnly ? (
            <>
              <UiButton className="font-normal border-emerald-200 text-emerald-700 hover:bg-emerald-50" disabled={!row} type="button" variant="outline" onClick={() => row && onPrint(row)}>พิมพ์</UiButton>
              <UiButton className="font-normal" disabled={!row || isCancelled} type="button" variant="outline" onClick={() => row && onEdit(row)}>แก้ไข</UiButton>
              <UiButton className="font-normal border-red-200 text-red-700 hover:bg-red-50" disabled={!row || isCancelled} type="button" variant="outline" onClick={() => row && onCancel(row)}>ยกเลิก</UiButton>
            </>
          ) : null}
          <UiButton className="font-normal text-slate-600" type="button" variant="ghost" onClick={() => onOpenChange(false)}>ปิด</UiButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailCard({ label, multiline, value }: { label: string; multiline?: boolean; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-medium text-slate-900 ${multiline ? 'whitespace-pre-line' : ''}`}>{value}</div>
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
  const configs = {
    slate: {
      bg: 'bg-slate-100 text-slate-600',
      emoji: '📋',
      labelColor: 'text-slate-500',
      valueColor: 'text-slate-900',
    },
    rose: {
      bg: 'bg-rose-100 text-rose-600',
      emoji: '💸',
      labelColor: 'text-rose-600',
      valueColor: 'text-rose-700',
    },
    emerald: {
      bg: 'bg-emerald-100 text-emerald-600',
      emoji: '✅',
      labelColor: 'text-emerald-600',
      valueColor: 'text-emerald-700',
    },
    blue: {
      bg: 'bg-blue-100 text-blue-600',
      emoji: '💰',
      labelColor: 'text-blue-600',
      valueColor: 'text-blue-700',
    },
    amber: {
      bg: 'bg-amber-100 text-amber-600',
      emoji: '⚙️',
      labelColor: 'text-amber-600',
      valueColor: 'text-amber-700',
    },
    violet: {
      bg: 'bg-violet-100 text-violet-600',
      emoji: '⏳',
      labelColor: 'text-violet-600',
      valueColor: 'text-violet-700',
    },
  }

  const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''))
  const isZero = isNaN(numericValue) ? false : numericValue === 0

  const config = isZero
    ? {
        bg: 'bg-slate-100 text-slate-600',
        emoji: configs[tone].emoji,
        labelColor: 'text-slate-500',
        valueColor: 'text-slate-900',
      }
    : configs[tone]

  return (
    <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4 flex-1 w-full">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${config.bg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {config.emoji}
      </div>
      <div className="min-w-0">
        <div className={`text-xs ${config.labelColor} truncate`}>{label}</div>
        <div className={`font-bold ${config.valueColor} break-words`}>{value}</div>
      </div>
    </div>
  )
}
