'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Download, Printer } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { TableNumberCell } from '@/components/ui/TableNumberCell'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { openReceiptVoucherPrint, openReceiptVoucherPrintWindow, type ReceiptVoucherPrintDocument } from '@/lib/receipt-voucher-print'

type VoucherItem = {
  amount?: number | string | null
  description?: string | null
  id?: string | null
  price?: number | string | null
  qty?: number | string | null
  unit?: string | null
}

type ReceiptVoucherRow = {
  amountInWords: string
  cancelNote?: string
  cancelledAt?: string
  cancelledBy?: string
  createdAt?: string
  createdBy?: string
  date: string
  docNo: string
  id: string
  items?: unknown
  licensePlate: string
  note: string
  payerSignerName?: string
  paymentMethod?: string
  purchaseBillDocNo: string
  purchaseBillId?: string
  salesPerson?: string
  sellerAddress?: string
  sellerName: string
  sellerPhone: string
  sellerTaxId: string
  status: string
  supplierCode?: string
  timeline?: ReceiptVoucherTimelineEvent[]
  totalAmount: number
  totalQty: number
  updatedAt?: string
  updatedBy?: string
}
type ReceiptVoucherTimelineEvent = {
  action: string
  createdAt: string
  createdBy: string
  fromStatus: string
  id: string
  note: string
  toStatus: string
  totalAmount: number
}
type ReceiptVoucherFormItem = {
  description: string
  price: string
  qty: string
  unit: string
}
type ReceiptVoucherFormState = {
  amountInWords: string
  date: string
  docNo: string
  items: ReceiptVoucherFormItem[]
  licensePlate: string
  note: string
  payerSignerName: string
  paymentMethod: string
  purchaseBillDocNo: string
  salesPerson: string
  sellerAddress: string
  sellerName: string
  sellerPhone: string
  sellerTaxId: string
  supplierCode: string
}
type SupplierOption = {
  address: string
  bankAccounts?: Array<{
    accountName: string
    accountNo: string
    bankName: string
    branchCode: string
    code: string
    isPrimary: boolean
    paymentMethod: string
  }>
  code: string
  id: string
  name: string
  phone: string
  taxId: string
}
type PurchaseBillOption = {
  date: string
  docNo: string
  id: string
  items: ReceiptVoucherFormItem[]
  licensePlate: string
  note: string
  salesPerson: string
  sellerAddress: string
  sellerCode: string
  sellerName: string
  sellerPhone: string
  sellerTaxId: string
  totalAmount: number
}
type PaymentMethodOption = {
  name: string
  type?: string | null
}
type ReceiptVoucherColumnKey = 'action' | 'date' | 'docNo' | 'licensePlate' | 'purchaseBillDocNo' | 'sellerName' | 'sellerTaxId' | 'status' | 'totalAmount' | 'totalQty'

type ReceiptVoucherCompanyProfile = {
  address: string
  logoUrl?: string
  name: string
  nameEn: string
  phone: string
  taxId: string
} | null

const CASH_PAYMENT_METHOD = 'รับเงินสด'

function bankAccountPaymentMethodValue(account: NonNullable<SupplierOption['bankAccounts']>[number]) {
  return `${account.paymentMethod} บช.${account.accountNo}`
}

function paymentMethodForSupplier(supplier: SupplierOption | undefined, currentPaymentMethod = '') {
  const accounts = supplier?.bankAccounts ?? []
  const current = currentPaymentMethod.trim()
  if (accounts.length === 0) return current || CASH_PAYMENT_METHOD
  return accounts.some((account) => bankAccountPaymentMethodValue(account) === current)
    ? current
    : bankAccountPaymentMethodValue(accounts[0])
}

const receiptVoucherColumns: Array<ResizableColumnDefinition<ReceiptVoucherColumnKey>> = [
  { key: 'docNo', defaultWidth: 110, minWidth: 90 },
  { key: 'date', defaultWidth: 90, minWidth: 80 },
  { key: 'sellerName', defaultWidth: 260, minWidth: 140 },
  { key: 'sellerTaxId', defaultWidth: 130, minWidth: 110 },
  { key: 'purchaseBillDocNo', defaultWidth: 110, minWidth: 90 },
  { key: 'licensePlate', defaultWidth: 100, minWidth: 80 },
  { key: 'status', defaultWidth: 96, minWidth: 80 },
  { key: 'totalQty', defaultWidth: 110, minWidth: 90 },
  { key: 'totalAmount', defaultWidth: 110, minWidth: 90 },
  { key: 'action', defaultWidth: 210, minWidth: 180 },
]

function dateInputToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function blankForm(): ReceiptVoucherFormState {
  return {
    amountInWords: '',
    date: dateInputToday(),
    docNo: '',
    items: [],
    licensePlate: '',
    note: '',
    payerSignerName: '',
    paymentMethod: CASH_PAYMENT_METHOD,
    purchaseBillDocNo: '',
    salesPerson: '',
    sellerAddress: '',
    sellerName: '',
    sellerPhone: '',
    sellerTaxId: '',
    supplierCode: '',
  }
}

function itemAmount(item: ReceiptVoucherFormItem) {
  return toNumber(item.qty) * toNumber(item.price)
}

function formTotals(form: ReceiptVoucherFormState) {
  return {
    amount: form.items.reduce((sum, item) => sum + itemAmount(item), 0),
    qty: form.items.reduce((sum, item) => sum + toNumber(item.qty), 0),
  }
}

function thaiBahtText(value: number) {
  if (!Number.isFinite(value)) return ''
  if (value === 0) return 'ศูนย์บาทถ้วน'
  const digitText = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const unitText = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']
  const convert = (input: string) => {
    let text = ''
    for (let index = 0; index < input.length; index += 1) {
      const digit = Number(input[index])
      const position = input.length - index - 1
      if (digit !== 0) {
        if (position % 6 === 1) {
          text += digit === 1 ? 'สิบ' : digit === 2 ? 'ยี่สิบ' : `${digitText[digit]}สิบ`
        } else if (position % 6 === 0 && digit === 1 && input.length > 1 && index > 0 && input[index - 1] !== '0') {
          text += 'เอ็ด'
        } else {
          text += `${digitText[digit]}${unitText[position % 6]}`
        }
      }
      if (position > 0 && position % 6 === 0) text += 'ล้าน'
    }
    return text
  }
  const [baht, satang] = value.toFixed(2).split('.')
  const bahtText = baht ? convert(baht) : ''
  const satangText = satang && satang !== '00' ? `${convert(satang)}สตางค์` : ''
  if (bahtText && !satangText) return `${bahtText}บาทถ้วน`
  if (!bahtText && satangText) return satangText
  return `${bahtText}บาท${satangText}`
}

function normalizeFormFromRow(row: ReceiptVoucherRow): ReceiptVoucherFormState {
  const items = normalizeItems(row).map((item) => ({
    description: item.description ?? '',
    price: String(toNumber(item.price)),
    qty: String(toNumber(item.qty)),
    unit: item.unit || 'กก.',
  }))
  const form = {
    amountInWords: row.amountInWords || '',
    date: row.date || dateInputToday(),
    docNo: row.docNo,
    items: items.length > 0 ? items : [{ description: '', price: '0', qty: '0', unit: 'กก.' }],
    licensePlate: row.licensePlate || '',
    note: row.note || '',
    payerSignerName: row.payerSignerName || row.createdBy || '',
    paymentMethod: row.paymentMethod || CASH_PAYMENT_METHOD,
    purchaseBillDocNo: row.purchaseBillDocNo || '',
    salesPerson: row.salesPerson || '',
    sellerAddress: row.sellerAddress || '',
    sellerName: row.sellerName || '',
    sellerPhone: row.sellerPhone || '',
    sellerTaxId: row.sellerTaxId || '',
    supplierCode: row.supplierCode || '',
  }
  return { ...form, amountInWords: form.amountInWords || thaiBahtText(formTotals(form).amount) }
}

export function ReceiptVouchersPageClient() {
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelNote, setCancelNote] = useState('')
  const [cancelingRow, setCancelingRow] = useState<ReceiptVoucherRow | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [detailRow, setDetailRow] = useState<ReceiptVoucherRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [printingDocNo, setPrintingDocNo] = useState<string | null>(null)
  const [companyProfile, setCompanyProfile] = useState<ReceiptVoucherCompanyProfile>(null)

  const printReceiptVoucher = async (row: ReceiptVoucherRow) => {
    if (printingDocNo) return
    let printWindow: Window | null = null
    setPrintingDocNo(row.docNo)
    try {
      printWindow = openReceiptVoucherPrintWindow()
      const docToPrint: ReceiptVoucherPrintDocument = {
        ...row,
      }
      await openReceiptVoucherPrint(docToPrint, printWindow)
    } catch (err) {
      printWindow?.close()
      alert(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการพิมพ์')
    } finally {
      setPrintingDocNo(null)
    }
  }
  const [form, setForm] = useState<ReceiptVoucherFormState>(() => blankForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<PaymentMethodOption[]>([])
  const [purchaseBillOptions, setPurchaseBillOptions] = useState<PurchaseBillOption[]>([])
  const [rows, setRows] = useState<ReceiptVoucherRow[]>([])
  const [search, setSearch] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'cancelled'>('all')
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([])
  const [currentActorName, setCurrentActorName] = useState('')
  const columnResize = useResizableColumns('daily.receipt-vouchers.v5', receiptVoucherColumns)

  const [sortKey, setSortKey] = useState<ReceiptVoucherColumnKey>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const changeSort = useCallback((nextKey: ReceiptVoucherColumnKey) => {
    if (nextKey === 'action') return
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(nextKey)
      setSortDirection(nextKey === 'date' || nextKey === 'totalQty' || nextKey === 'totalAmount' ? 'desc' : 'asc')
    }
  }, [sortKey])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<{ companyProfile: ReceiptVoucherCompanyProfile; currentActor: string; paymentMethods?: PaymentMethodOption[]; purchaseBills: PurchaseBillOption[]; rows: ReceiptVoucherRow[]; suppliers: SupplierOption[] }>('/api/purchase/receipt-vouchers')
      setCompanyProfile(payload.companyProfile)
      setCurrentActorName(payload.currentActor ?? '')
      setPaymentMethodOptions(payload.paymentMethods ?? [])
      setPurchaseBillOptions(payload.purchaseBills ?? [])
      setRows(payload.rows)
      setSupplierOptions(payload.suppliers ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดใบสำคัญรับเงินไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])



  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, pageSize, search, sortKey, sortDirection, statusFilter])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows
      .filter((row) => {
        const inDateRange = (!dateFrom || row.date >= dateFrom) && (!dateTo || row.date <= dateTo)
        if (!inDateRange) return false
        if (statusFilter === 'active' && row.status === 'cancelled') return false
        if (statusFilter === 'cancelled' && row.status !== 'cancelled') return false
        if (!query) return true
        return `${row.docNo} ${row.purchaseBillDocNo} ${row.sellerName} ${row.sellerTaxId} ${row.licensePlate}`.toLowerCase().includes(query)
      })
      .sort((left, right) => {
        let comparison = 0
        if (sortKey === 'docNo') {
          comparison = left.docNo.localeCompare(right.docNo)
        } else if (sortKey === 'date') {
          comparison = left.date.localeCompare(right.date)
        } else if (sortKey === 'sellerName') {
          comparison = (left.sellerName || '').localeCompare(right.sellerName || '')
        } else if (sortKey === 'sellerTaxId') {
          comparison = (left.sellerTaxId || '').localeCompare(right.sellerTaxId || '')
        } else if (sortKey === 'purchaseBillDocNo') {
          comparison = (left.purchaseBillDocNo || '').localeCompare(right.purchaseBillDocNo || '')
        } else if (sortKey === 'licensePlate') {
          comparison = (left.licensePlate || '').localeCompare(right.licensePlate || '')
        } else if (sortKey === 'status') {
          comparison = (left.status || '').localeCompare(right.status || '')
        } else if (sortKey === 'totalQty') {
          comparison = left.totalQty - right.totalQty
        } else if (sortKey === 'totalAmount') {
          comparison = left.totalAmount - right.totalAmount
        }
        return sortDirection === 'asc' ? comparison : -comparison
      })
  }, [dateFrom, dateTo, rows, search, sortKey, sortDirection, statusFilter])

  const supplierSearchOptions = useMemo<SearchComboboxOption[]>(() => supplierOptions.map((supplier) => ({
    description: supplier.taxId ? `เลขประจำตัวผู้เสียภาษี ${supplier.taxId}` : supplier.address,
    id: supplier.code,
    label: `${supplier.code} | ${supplier.name}`,
    searchText: `${supplier.code} ${supplier.name} ${supplier.taxId} ${supplier.address} ${supplier.phone}`.toLowerCase(),
  })), [supplierOptions])
  const filteredPurchaseBillOptions = useMemo(() => {
    if (!form.supplierCode) return purchaseBillOptions
    return purchaseBillOptions.filter((bill) => bill.sellerCode === form.supplierCode)
  }, [form.supplierCode, purchaseBillOptions])
  const purchaseBillSearchOptions = useMemo<SearchComboboxOption[]>(() => filteredPurchaseBillOptions.map((bill) => ({
    description: `${bill.date} · ${bill.sellerName || '-'} · ${formatMoney(bill.totalAmount)}`,
    id: bill.docNo,
    label: bill.docNo,
    searchText: `${bill.docNo} ${bill.sellerCode} ${bill.sellerName} ${bill.date} ${bill.licensePlate}`.toLowerCase(),
  })), [filteredPurchaseBillOptions])

  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hasActiveFilter = Boolean(search || dateFrom || dateTo || statusFilter !== 'all')
  const mobileFilterCount = (dateFrom || dateTo ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0)
  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ direction: sortDirection, format: 'xlsx', sort: sortKey })
    if (search.trim()) params.set('search', search.trim())
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    return `/api/purchase/receipt-vouchers?${params.toString()}`
  }, [dateFrom, dateTo, search, sortDirection, sortKey, statusFilter])

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setStatusFilter('all')
  }

  function openCreateForm() {
    setForm({ ...blankForm(), payerSignerName: currentActorName })
    setFormError(null)
    setFormMode('create')
  }

  function openEditForm(row: ReceiptVoucherRow) {
    if (row.status === 'cancelled') return
    const purchaseBill = purchaseBillOptions.find((bill) => bill.docNo === row.purchaseBillDocNo)
    setForm({ ...normalizeFormFromRow(row), supplierCode: row.supplierCode || purchaseBill?.sellerCode || '' })
    setFormError(null)
    setFormMode('edit')
  }

  function closeForm() {
    if (isSaving) return
    setFormMode(null)
    setFormError(null)
  }

  function updateForm(patch: Partial<ReceiptVoucherFormState>) {
    setForm((current) => ({ ...current, ...patch }))
  }

  function pickSupplier(code: string) {
    const supplier = supplierOptions.find((item) => item.code === code)
    if (!supplier) {
      updateForm({ supplierCode: '' })
      return
    }
    updateForm({
      purchaseBillDocNo: '',
      sellerAddress: supplier.address,
      sellerName: supplier.name,
      sellerPhone: supplier.phone,
      sellerTaxId: supplier.taxId,
      supplierCode: supplier.code,
      paymentMethod: paymentMethodForSupplier(supplier),
    })
  }

  function pickPurchaseBill(docNo: string) {
    const bill = purchaseBillOptions.find((item) => item.docNo === docNo)
    if (!bill) {
      updateForm({ purchaseBillDocNo: '' })
      return
    }
    const billItems = bill.items.length > 0 ? bill.items.map((item) => ({
      description: item.description,
      price: String(toNumber(item.price)),
      qty: String(toNumber(item.qty)),
      unit: item.unit || 'กก.',
    })) : form.items
    const supplier = supplierOptions.find((item) => item.code === bill.sellerCode)
    updateForm({
      amountInWords: thaiBahtText(billItems.reduce((sum, item) => sum + itemAmount(item), 0)),
      date: bill.date || form.date,
      items: billItems,
      licensePlate: bill.licensePlate,
      note: bill.note,
      purchaseBillDocNo: bill.docNo,
      salesPerson: bill.salesPerson,
      sellerAddress: bill.sellerAddress,
      sellerName: bill.sellerName,
      sellerPhone: bill.sellerPhone,
      sellerTaxId: bill.sellerTaxId,
      supplierCode: bill.sellerCode,
      paymentMethod: paymentMethodForSupplier(supplier, form.paymentMethod),
    })
  }

  async function saveForm() {
    setFormError(null)
    const totals = formTotals(form)
    if (!form.sellerName.trim()) {
      setFormError('กรุณากรอกชื่อผู้รับเงิน')
      return
    }
    if (form.items.length === 0) {
      setFormError('กรุณาเลือกบิลซื้อเพื่อเติมรายการสินค้า')
      return
    }
    if (form.items.some((item) => !item.description.trim())) {
      setFormError('รายการสินค้าจากบิลซื้อไม่ครบถ้วน')
      return
    }
    setIsSaving(true)
    try {
      await dailyFetchJson('/api/purchase/receipt-vouchers', {
        body: JSON.stringify({
          amountInWords: form.amountInWords || thaiBahtText(totals.amount),
          date: form.date,
          docNo: form.docNo,
          items: form.items.map((item) => ({
            description: item.description,
            price: toNumber(item.price),
            qty: toNumber(item.qty),
            unit: item.unit || 'กก.',
          })),
          licensePlate: form.licensePlate,
          note: form.note,
          paymentMethod: form.paymentMethod,
          purchaseBillDocNo: form.purchaseBillDocNo,
          salesPerson: form.salesPerson,
          sellerAddress: form.sellerAddress,
          sellerName: form.sellerName,
          sellerPhone: form.sellerPhone,
          sellerTaxId: form.sellerTaxId,
          supplierCode: form.supplierCode,
        }),
        method: formMode === 'edit' ? 'PATCH' : 'POST',
      })
      setFormMode(null)
      await loadData()
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'บันทึกใบสำคัญรับเงินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function cancelReceiptVoucher() {
    if (!cancelingRow) return
    const note = cancelNote.trim()
    if (!note) {
      setCancelError('กรุณากรอกเหตุผลการยกเลิก')
      return
    }
    setIsSaving(true)
    setCancelError(null)
    try {
      await dailyFetchJson('/api/purchase/receipt-vouchers', {
        body: JSON.stringify({ action: 'cancel', docNo: cancelingRow.docNo, note }),
        method: 'PATCH',
      })
      setCancelingRow(null)
      setCancelNote('')
      await loadData()
    } catch (caught) {
      setCancelError(caught instanceof Error ? caught.message : 'ยกเลิกใบสำคัญรับเงินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <section className="space-y-4 print:hidden">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        {/* Desktop Toolbar (Hidden on Mobile) */}
        <div className="hidden lg:block rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[260px] flex-1 rounded-md"
              placeholder="ค้นเลขที่ RV / ผู้รับเงิน / บิลซื้อ / ทะเบียนรถ..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">วันที่ออกเอกสาร:</span>
              <DatePickerInput id="receipt-vouchers-date-from" value={dateFrom} onChange={setDateFrom} />
              <span className="text-slate-400">→</span>
              <DatePickerInput id="receipt-vouchers-date-to" value={dateTo} onChange={setDateTo} />
            </div>

            {hasActiveFilter ? <Button size="sm" type="button" variant="secondary" onClick={clearFilters}>ล้างตัวกรอง</Button> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">สถานะ:</span>
            {[
              ['all', 'ทุกสถานะ'],
              ['active', 'ใช้งาน'],
              ['cancelled', 'ยกเลิก'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={`rounded-md border px-3 py-1 text-xs font-medium ${statusFilter === value ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
                type="button"
                onClick={() => setStatusFilter(value as typeof statusFilter)}
              >
                {label}
              </button>
            ))}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button asChild className="gap-2" size="sm" variant="export">
                <a href={exportHref}>
                  <Download className="size-4" />
                  <span>ส่งออก Excel</span>
                </a>
              </Button>
              <Button size="sm" type="button" onClick={openCreateForm}>+ สร้างใบสำคัญรับเงิน</Button>
            </div>
          </div>
        </div>

        {/* Mobile Toolbar (Hidden on Desktop) */}
        <div className="block lg:hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Input
              className="flex-1 min-w-0 rounded-md"
              placeholder="ค้นหาเลขที่ / ผู้รับ / บิลซื้อ..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 shrink-0"
              onClick={() => setShowMobileFilters(true)}
            >
              ตัวกรอง {mobileFilterCount > 0 ? `(${mobileFilterCount})` : ''}
            </button>
            {hasActiveFilter ? <Button size="sm" type="button" variant="secondary" onClick={clearFilters}>ล้าง</Button> : null}
          </div>
          <Button asChild className="mt-2 w-full gap-2" size="sm" variant="export">
            <a href={exportHref}>
              <Download className="size-4" />
              <span>ส่งออก Excel</span>
            </a>
          </Button>
        </div>

        {/* Bottom Sheet Filter for Mobile */}
        {showMobileFilters ? (
          <MobileFilterSheet
            title="ตัวกรองเพิ่มเติม"
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
                  className="h-11 rounded-md bg-slate-800 text-sm font-semibold text-white hover:bg-slate-700"
                  onClick={() => setShowMobileFilters(false)}
                >
                  ใช้ตัวกรอง
                </button>
              </>
            )}
          >
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะ</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['all', 'ทุกสถานะ'],
                      ['active', 'ใช้งาน'],
                      ['cancelled', 'ยกเลิก'],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={`rounded-md border px-3 py-1 text-xs font-medium ${statusFilter === value ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
                        type="button"
                        onClick={() => setStatusFilter(value as typeof statusFilter)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
                  <div className="flex items-center gap-2">
                    <DatePickerInput className="flex-1" id="receipt-vouchers-mobile-date-from" value={dateFrom} onChange={setDateFrom} />
                    <span className="text-slate-400">→</span>
                    <DatePickerInput className="flex-1" id="receipt-vouchers-mobile-date-to" value={dateTo} onChange={setDateTo} />
                  </div>
                </div>
          </MobileFilterSheet>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
          <div className="flex flex-wrap items-center gap-2">
            {columnResize.hasCustomWidths ? <Button size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button> : null}
            <PageSizeDropdown value={pageSize} onChange={setPageSize} />
            <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
            <span className="px-1">หน้า {currentPage} / {totalPages}</span>
            <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
          </div>
        </div>

        {/* Mobile Card List */}
        <div className="block lg:hidden space-y-3">
          {isLoading ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-500 shadow border border-slate-200">กำลังโหลดข้อมูล</div>
          ) : null}
          {!isLoading && pagedRows.map((row) => (
            <div
              key={row.id}
              className={`rounded-xl border border-slate-200 p-4 shadow-sm transition-colors ${row.status === 'cancelled' ? 'bg-red-100/60 active:bg-red-200/60 text-slate-400' : 'bg-white active:bg-slate-50'} cursor-pointer`}
              onClick={() => setDetailRow(row)}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-slate-800 text-sm">{row.docNo}</span>
                <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
              </div>
              <div className="text-sm font-semibold text-slate-700 mb-2">
                {row.sellerName || '-'}
              </div>
              <div className="mb-2"><StatusPill status={row.status} /></div>
              <div className="text-xs text-slate-500 space-y-1 mb-3">
                {row.sellerTaxId ? <div>เลขประจำตัวผู้เสียภาษี: {row.sellerTaxId}</div> : null}
                {row.purchaseBillDocNo ? <div>บิลซื้อ: <span className="font-semibold text-slate-700">{row.purchaseBillDocNo}</span></div> : null}
                {row.licensePlate ? <div>ทะเบียน: <span className="font-semibold text-slate-700">{row.licensePlate}</span></div> : null}
              </div>
              <div className="flex justify-between items-end border-t border-slate-100 pt-2.5">
                <div className="text-xs text-slate-500">
                  <span>น้ำหนัก: <span className="font-semibold text-slate-700">{formatMoney(row.totalQty)}</span> กก.</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500 block">จำนวนเงิน</span>
                  <span className="font-bold text-slate-900 text-sm tabular-nums">{formatMoney(row.totalAmount)}</span>
                </div>
              </div>
            </div>
          ))}
          {!isLoading && totalRows === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow border border-slate-200">ยังไม่มีใบสำคัญรับเงิน</div>
          ) : null}
        </div>

        <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
          <Table className="[&_tbody_tr]:border-slate-100" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {receiptVoucherColumns.map((column) => (
                <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <TableHeader>
              <tr>
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เลขที่ RV" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่ RV')} sortKey="docNo" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="วันที่ออกเอกสาร" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่ออกเอกสาร')} sortKey="date" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ผู้รับเงิน" resizeProps={columnResize.getResizeHandleProps('sellerName', 'ผู้รับเงิน')} sortKey="sellerName" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="เลขประจำตัวผู้เสียภาษี" resizeProps={columnResize.getResizeHandleProps('sellerTaxId', 'เลขประจำตัวผู้เสียภาษี')} sortKey="sellerTaxId" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="บิลซื้อ" resizeProps={columnResize.getResizeHandleProps('purchaseBillDocNo', 'บิลซื้อ')} sortKey="purchaseBillDocNo" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="ทะเบียน" resizeProps={columnResize.getResizeHandleProps('licensePlate', 'ทะเบียน')} sortKey="licensePlate" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} align="right" label="น้ำหนัก (กก.)" resizeProps={columnResize.getResizeHandleProps('totalQty', 'น้ำหนัก (กก.)')} sortKey="totalQty" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey} direction={sortDirection} align="right" label="จำนวนเงิน" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'จำนวนเงิน')} sortKey="totalAmount" onSort={changeSort} />
                <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
              </tr>
            </TableHeader>
            <TableBody className="divide-y divide-slate-100">
              {isLoading ? <TableRow><td className="p-8 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</td></TableRow> : null}
              {!isLoading && pagedRows.map((row) => (
                <TableRow key={row.id} className={`cursor-pointer ${row.status === 'cancelled' ? 'bg-red-100/60 hover:bg-red-200/60 text-slate-400' : 'hover:bg-slate-50'}`} onClick={() => setDetailRow(row)}>
                  <td className="whitespace-nowrap p-2 text-xs font-semibold text-slate-700">{row.docNo}</td>
                  <td className="whitespace-nowrap p-2">{formatDateDisplay(row.date)}</td>
                  <td className="p-2 font-medium text-slate-800">{row.sellerName || '-'}</td>
                  <td className="p-2 text-xs text-slate-500">{row.sellerTaxId || '-'}</td>
                  <td className="p-2 text-xs text-slate-700">{row.purchaseBillDocNo || '-'}</td>
                  <td className="p-2 text-xs text-slate-600">{row.licensePlate || '-'}</td>
                  <td className="p-2"><StatusPill status={row.status} /></td>
                  <TableNumberCell value={formatMoney(row.totalQty)} />
                  <TableNumberCell strong value={formatMoney(row.totalAmount)} />
                  <td className="whitespace-nowrap p-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60" type="button" disabled={printingDocNo === row.docNo} onClick={(event) => { event.stopPropagation(); void printReceiptVoucher(row) }}>
                        {printingDocNo === row.docNo ? 'กำลังพิมพ์...' : 'พิมพ์'}
                      </button>
                      {row.status !== 'cancelled' ? (
                        <>
                          <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={(event) => { event.stopPropagation(); openEditForm(row) }}>แก้ไข</button>
                          <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50" type="button" onClick={(event) => { event.stopPropagation(); setCancelingRow(row); setCancelNote(''); setCancelError(null) }}>ยกเลิก</button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </TableRow>
              ))}
              {!isLoading && totalRows === 0 ? <TableRow><td className="p-8 text-center text-slate-400" colSpan={10}>ยังไม่มีใบสำคัญรับเงิน</td></TableRow> : null}
            </TableBody>
          </Table>
        </div>
      </section>

      {formMode ? (
        <ReceiptVoucherFormModal
          form={form}
          formError={formError}
          isSaving={isSaving}
          mode={formMode}
          onClose={closeForm}
          onPickSupplier={pickSupplier}
          onPickPurchaseBill={pickPurchaseBill}
          onSave={saveForm}
          onUpdateForm={updateForm}
          paymentMethods={paymentMethodOptions}
          supplierBankAccounts={supplierOptions.find((supplier) => supplier.code === form.supplierCode)?.bankAccounts ?? []}
          supplierSearchOptions={supplierSearchOptions}
          purchaseBillSearchOptions={purchaseBillSearchOptions}
        />
      ) : null}

      {detailRow ? <ReceiptVoucherDetailModal row={detailRow} onClose={() => setDetailRow(null)} onPrint={() => void printReceiptVoucher(detailRow)} /> : null}
      {cancelingRow ? (
        <CancelReceiptVoucherDialog
          error={cancelError}
          isSaving={isSaving}
          note={cancelNote}
          row={cancelingRow}
          onCancel={() => {
            if (isSaving) return
            setCancelingRow(null)
            setCancelNote('')
            setCancelError(null)
          }}
          onConfirm={cancelReceiptVoucher}
          onNoteChange={(value) => {
            const shouldClearFieldError = Boolean(cancelError && !cancelNote.trim())
            setCancelNote(value)
            if (shouldClearFieldError) setCancelError(null)
          }}
        />
      ) : null}

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-6 z-40 lg:hidden print:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform"
          onClick={openCreateForm}
          type="button"
          aria-label="สร้างใบสำคัญรับเงินใหม่"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="size-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
    </>
  )
}

function ReceiptVoucherFormModal({
  form,
  formError,
  isSaving,
  mode,
  onClose,
  onPickSupplier,
  onPickPurchaseBill,
  onSave,
  onUpdateForm,
  paymentMethods,
  supplierBankAccounts,
  supplierSearchOptions,
  purchaseBillSearchOptions,
}: {
  form: ReceiptVoucherFormState
  formError: string | null
  isSaving: boolean
  mode: 'create' | 'edit'
  onClose: () => void
  onPickSupplier: (code: string) => void
  onPickPurchaseBill: (docNo: string) => void
  onSave: () => void
  onUpdateForm: (patch: Partial<ReceiptVoucherFormState>) => void
  paymentMethods: PaymentMethodOption[]
  supplierBankAccounts: SupplierOption['bankAccounts']
  supplierSearchOptions: SearchComboboxOption[]
  purchaseBillSearchOptions: SearchComboboxOption[]
}) {
  const totals = formTotals(form)
  const [showSellerDetails, setShowSellerDetails] = useState(false)
  const paymentMethodChoices = (() => {
    const choices: Array<{ label: string; value: string }> = []
    const seen = new Set<string>()
    const addChoice = (value: string, label = value) => {
      const normalized = value.trim()
      if (!normalized || seen.has(normalized)) return
      seen.add(normalized)
      choices.push({ label, value: normalized })
    }
    for (const account of supplierBankAccounts ?? []) {
      const value = `${account.paymentMethod} บช.${account.accountNo}`
      addChoice(value, `${account.paymentMethod}${account.bankName ? ` · ${account.bankName}` : ''}${account.accountNo ? ` · ${account.accountNo}` : ''}`)
    }
    for (const method of paymentMethods) {
      addChoice(method.name)
    }
    if (form.paymentMethod) {
      addChoice(form.paymentMethod)
    }
    if (choices.length === 0) addChoice(CASH_PAYMENT_METHOD)
    return choices
  })()

  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent
        hideClose
        aria-labelledby="receipt-voucher-form-title"
        fallbackTitle="Receipt voucher form"
        className="left-0 top-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-[min(96vw,96rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md"
      >
        <DialogHeader className="bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white shrink-0 rounded-none sm:p-4 sm:rounded-t-md">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
            <div className="min-w-0">
              <DialogTitle id="receipt-voucher-form-title" className="truncate text-base text-white sm:text-lg">
                {mode === 'edit' ? 'แก้ไข' : 'สร้าง'}ใบสำคัญรับเงิน
              </DialogTitle>
              <DialogDescription className="truncate text-slate-300">
                ใช้สำหรับ Supplier รับเงินสดจากบริษัท กรณีไม่มีใบเสร็จจาก Supplier
              </DialogDescription>
            </div>
            <div className="flex max-w-[min(58vw,12rem)] justify-end gap-2 overflow-x-auto pb-0.5 sm:max-w-none sm:flex-wrap sm:overflow-visible sm:pb-0">
              <Button className="h-10 w-10 shrink-0 gap-0 border-emerald-600 bg-emerald-600 px-0 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white disabled:opacity-50 sm:h-9 sm:w-auto sm:gap-2 sm:px-4" disabled={isSaving} type="button" variant="outline" onClick={onSave}>
                <Check className="size-4" />
                <span className="sr-only sm:not-sr-only">{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</span>
              </Button>
              <Button className="h-10 shrink-0 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white sm:h-9" disabled={isSaving} type="button" variant="outline" onClick={onClose}>ยกเลิก</Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain bg-slate-50 p-3 pb-4 sm:p-4">
          {formError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</div> : null}

          <section className="rounded-xl border border-slate-200 !bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-3 border-b border-slate-100 pb-2 text-sm font-semibold text-slate-800">ข้อมูลหลัก</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_180px]">
              <div className="sm:col-span-2 lg:col-span-1">
                <SearchCombobox
                  disabled={mode === 'edit'}
                  inputClassName="h-9 bg-white"
                  inputId="rv-supplier"
                  label="Supplier"
                  options={supplierSearchOptions}
                  optionsPanelClassName="max-h-80"
                  placeholder="ค้นรหัส / ชื่อ Supplier / เลขภาษี"
                  value={form.supplierCode}
                  onChange={onPickSupplier}
                />
              </div>
              <div className="col-span-1">
                <SearchCombobox
                  disabled={mode === 'edit'}
                  inputClassName="h-9 bg-white"
                  inputId="rv-purchase-bill"
                  label="อ้างอิงบิลซื้อ"
                  options={purchaseBillSearchOptions}
                  optionsPanelClassName="max-h-80"
                  placeholder={form.supplierCode ? 'ค้นเลขบิลซื้อ' : 'เลือก Supplier ก่อน'}
                  value={form.purchaseBillDocNo}
                  onChange={onPickPurchaseBill}
                />
              </div>
              <div className="col-span-1">
                <FormField label="วันที่ออกเอกสาร">
                  <DatePickerInput
                    disabled={mode === 'edit'}
                    id="rv-date"
                    value={form.date}
                    onChange={(value) => onUpdateForm({ date: value })}
                  />
                </FormField>
              </div>
            </div>

            {/* Seller Info Collapsible on Mobile */}
            {form.sellerName ? (
              <div className="mt-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 lg:hidden focus-visible:outline-none"
                  onClick={() => setShowSellerDetails(!showSellerDetails)}
                >
                  <span>{showSellerDetails ? 'ซ่อนรายละเอียดผู้รับเงิน' : 'ดูรายละเอียดผู้รับเงิน'}</span>
                  <span className="text-xs">{showSellerDetails ? '▲' : '▼'}</span>
                </button>

                <div className={`${showSellerDetails ? 'grid' : 'hidden'} lg:grid mt-2 grid-cols-1 gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 md:mt-3 md:grid-cols-2`}>
                  <ReadOnlyInfo label="ผู้รับเงิน" value={form.sellerName} />
                  <ReadOnlyInfo label="เลขประจำตัวผู้เสียภาษี" value={form.sellerTaxId} />
                  <ReadOnlyInfo label="ที่อยู่" value={form.sellerAddress} wide />
                  <ReadOnlyInfo label="เบอร์โทร" value={form.sellerPhone} />
                  <ReadOnlyInfo label="ช่องทางติดต่อ Sale" value={form.salesPerson} />
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-1.5 md:mb-2 flex items-center justify-between gap-2">
              <div className="text-xs md:text-sm font-semibold text-slate-800">รายการค่าใช้จ่าย/สินค้า ({form.items.length})</div>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
              <table className="ns-table w-full min-w-[820px] text-xs">
                <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                  <tr>
                    <th className="w-10 p-1.5 md:p-2 text-center">#</th>
                    <th className="p-1.5 md:p-2 text-left">รายการ</th>
                    <th className="w-24 p-1.5 md:p-2 text-left">หน่วย</th>
                    <th className="w-32 p-1.5 md:p-2 text-right">จำนวน</th>
                    <th className="w-32 p-1.5 md:p-2 text-right">ราคา/หน่วย</th>
                    <th className="w-36 p-1.5 md:p-2 text-right">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.length === 0 ? (
                    <tr>
                      <td className="p-4 md:p-6 text-center text-slate-400" colSpan={6}>เลือกบิลซื้อเพื่อเติมรายการสินค้าอัตโนมัติ</td>
                    </tr>
                  ) : form.items.map((item, index) => (
                    <tr key={index} className="border-t border-slate-100">
                      <td className="p-1.5 md:p-2 text-center text-slate-400">{index + 1}</td>
                      <td className="p-1.5 md:p-2 font-medium text-slate-800">{item.description || '-'}</td>
                      <td className="p-1.5 md:p-2 text-slate-600">{item.unit || 'กก.'}</td>
                      <td className="p-1.5 md:p-2 text-right tabular-nums">{formatMoney(toNumber(item.qty))}</td>
                      <td className="p-1.5 md:p-2 text-right tabular-nums">{formatMoney(toNumber(item.price))}</td>
                      <td className="p-1.5 md:p-2 text-right font-semibold text-emerald-700">{formatMoney(itemAmount(item))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold">
                  <tr>
                    <td className="p-1.5 md:p-2 text-right" colSpan={3}>รวม</td>
                    <td className="p-1.5 md:p-2 text-right">{formatMoney(totals.qty)}</td>
                    <td />
                    <td className="p-1.5 md:p-2 text-right text-emerald-700">{formatMoney(totals.amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="mt-2 md:mt-3">
              <div className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 bg-slate-50 p-2 md:grid-cols-4">
                <FormField className="col-span-2 md:col-span-1" label="วิธีรับเงิน / เลขบัญชี">
                  <Select
                    disabled={paymentMethodChoices.length === 0}
                    className="h-10 w-full px-2 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                    value={(() => {
                      const matched = supplierBankAccounts?.find((account) => `${account.paymentMethod} บช.${account.accountNo}` === (form.paymentMethod === CASH_PAYMENT_METHOD ? '' : form.paymentMethod))
                      if (matched) return `${matched.paymentMethod} บช.${matched.accountNo}`
                      if (form.paymentMethod && paymentMethodChoices.some((choice) => choice.value === form.paymentMethod)) return form.paymentMethod
                      return paymentMethodChoices[0]?.value ?? ''
                    })()}
                    onChange={(event) => onUpdateForm({ paymentMethod: event.target.value })}
                  >
                    {paymentMethodChoices.map((choice) => (
                      <option key={choice.value} value={choice.value}>{choice.label}</option>
                    ))}
                  </Select>
                </FormField>
                {(() => {
                  const current = supplierBankAccounts?.find((account) => `${account.paymentMethod} บช.${account.accountNo}` === (form.paymentMethod === CASH_PAYMENT_METHOD ? '' : form.paymentMethod))
                  const fallbackAcctNo = !current && form.paymentMethod ? form.paymentMethod.split('บช.')[1]?.trim() : null
                  return (
                    <>
                      <FormField label="ธนาคาร"><div className="flex h-8 md:h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs md:text-sm text-slate-800">{current?.bankName || '-'}</div></FormField>
                      <FormField label="เลขบัญชี"><div className="flex h-8 md:h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs md:text-sm font-semibold tabular-nums text-slate-900">{current?.accountNo || fallbackAcctNo || '-'}</div></FormField>
                      <FormField label="ชื่อบัญชี"><div className="flex h-8 md:h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 text-xs md:text-sm text-slate-800 truncate">{current?.accountName || '-'}</div></FormField>
                    </>
                  )
                })()}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <div className="mb-2 md:mb-3 text-xs md:text-sm font-semibold text-slate-800">หมายเหตุและผู้ลงนาม</div>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <FormField className="col-span-2" label="หมายเหตุ">
                <textarea
                  className="h-10 md:h-20 min-h-10 md:min-h-20 w-full rounded-md border border-slate-300 px-3 py-1.5 md:py-2 text-xs md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                  value={form.note}
                  onChange={(event) => onUpdateForm({ note: event.target.value })}
                />
              </FormField>
              <FormField label="ผู้จ่ายเงิน (ลายเซ็น)">
                <div className="flex h-8 md:h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 md:px-3 text-xs md:text-sm font-semibold text-slate-800 truncate">
                  {form.payerSignerName || '-'}
                </div>
              </FormField>
            </div>
          </section>
        </div>

      </DialogContent>
    </Dialog>
  )
}

function FormField({ children, className = '', label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

function ReadOnlyInfo({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={wide ? 'md:col-span-2' : ''}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 min-h-5 font-semibold text-slate-800">{value || '-'}</div>
    </div>
  )
}

function receiptVoucherStatusLabel(status: string) {
  if (status === 'cancelled') return 'ยกเลิก'
  return 'ใช้งาน'
}

function receiptVoucherActionLabel(action: string) {
  if (action === 'cancelled') return 'ยกเลิกเอกสาร'
  if (action === 'edited') return 'แก้ไขเอกสาร'
  if (action === 'created') return 'สร้างเอกสาร'
  return action || '-'
}

function StatusPill({ status }: { status: string }) {
  const isCancelled = status === 'cancelled'
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${isCancelled ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
      {receiptVoucherStatusLabel(status)}
    </span>
  )
}

function ReceiptVoucherDetailModal({ onClose, onPrint, row }: { onClose: () => void; onPrint: () => void; row: ReceiptVoucherRow }) {
  const timeline = row.timeline ?? []
  return (
    <Dialog open onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <DialogContent hideClose aria-labelledby="receipt-voucher-detail-title" className="left-0 top-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-[min(96vw,64rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md" fallbackTitle="รายละเอียดใบสำคัญรับเงิน">
        <DialogHeader className="bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white shrink-0 rounded-none sm:p-4 sm:rounded-t-md">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <DialogTitle id="receipt-voucher-detail-title" className="truncate text-base text-white sm:text-lg">รายละเอียดใบสำคัญรับเงิน {row.docNo}</DialogTitle>
              <StatusPill status={row.status} />
            </div>
              <DialogDescription className="truncate text-slate-300">{row.sellerName || 'เอกสารหลักฐานรับเงินสดจาก Supplier ไม่กระทบ PMT/BST/AP/stock'}</DialogDescription>
            </div>
            <div className="flex max-w-[min(58vw,12rem)] justify-end gap-2 overflow-x-auto pb-0.5 sm:max-w-none sm:flex-wrap sm:overflow-visible sm:pb-0">
              <Button aria-label="พิมพ์" className="h-10 w-10 shrink-0 gap-0 border-emerald-600 bg-emerald-600 px-0 font-normal text-white hover:border-emerald-700 hover:bg-emerald-700 hover:text-white sm:h-9 sm:w-auto sm:gap-2 sm:px-4" type="button" variant="outline" onClick={onPrint}>
                <Printer className="size-4" />
                <span className="sr-only sm:not-sr-only">พิมพ์</span>
              </Button>
              <Button className="h-10 shrink-0 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white sm:h-9" type="button" variant="outline" onClick={onClose}>ปิด</Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50">
          <div className="space-y-4 p-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-5">
          {row.status === 'cancelled' ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-semibold">เหตุผลการยกเลิก</div>
              <div className="mt-1 whitespace-pre-wrap">{row.cancelNote || '-'}</div>
              <div className="mt-2 text-xs text-slate-500">ยกเลิกโดย {row.cancelledBy || '-'} เมื่อ {row.cancelledAt ? formatDateDisplay(row.cancelledAt.slice(0, 10)) : '-'}</div>
            </div>
          ) : null}

          <section className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ข้อมูลเอกสาร</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <DetailField label="วันที่ออกเอกสาร" value={formatDateDisplay(row.date)} />
                <DetailField label="บิลซื้ออ้างอิง" value={row.purchaseBillDocNo || '-'} />
                <DetailField label="ผู้รับเงิน" value={row.sellerName || '-'} />
                <DetailField label="เลขประจำตัวผู้เสียภาษี" value={row.sellerTaxId || '-'} />
                <DetailField label="ที่อยู่" value={row.sellerAddress || '-'} />
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800">ยอดและผู้ติดต่อ</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <DetailField label="เบอร์โทร" value={row.sellerPhone || '-'} />
                <DetailField label="Sale contact" value={row.salesPerson || '-'} />
                <DetailField label="ยอดเงิน" value={formatMoney(row.totalAmount)} />
                <DetailField label="น้ำหนักรวม" value={formatMoney(row.totalQty)} />
                <DetailField label="หมายเหตุ" value={row.note || '-'} />
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">Timeline</div>
            <div className="divide-y divide-slate-100">
              {timeline.length === 0 ? (
                <div className="p-4 text-sm text-slate-400">ยังไม่มี timeline</div>
              ) : timeline.map((event) => (
                <div key={event.id} className="grid gap-1 p-3 text-sm md:grid-cols-[150px_1fr_140px]">
                  <div className="text-xs text-slate-500">{event.createdAt ? `${formatDateDisplay(event.createdAt.slice(0, 10))}` : '-'}</div>
                  <div>
                    <div className="font-semibold text-slate-800">{receiptVoucherActionLabel(event.action)}</div>
                    <div className="text-xs text-slate-500">
                      {event.fromStatus ? `${receiptVoucherStatusLabel(event.fromStatus)} -> ` : ''}{receiptVoucherStatusLabel(event.toStatus)}
                    </div>
                    {event.note ? <div className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{event.note}</div> : null}
                  </div>
                  <div className="text-right text-xs text-slate-500">{event.createdBy || '-'}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col py-1 ${wide ? 'md:col-span-2' : ''}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 text-xs sm:text-sm font-semibold text-slate-800 [overflow-wrap:anywhere]">{value}</div>
    </div>
  )
}

function CancelReceiptVoucherDialog({
  error,
  isSaving,
  note,
  onCancel,
  onConfirm,
  onNoteChange,
  row,
}: {
  error: string | null
  isSaving: boolean
  note: string
  onCancel: () => void
  onConfirm: () => void
  onNoteChange: (value: string) => void
  row: ReceiptVoucherRow
}) {
  const noteInvalid = Boolean(error && !note.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 print:hidden">
      <div data-ns-modal-shell="dialog" className="w-full max-w-lg overflow-hidden rounded-md bg-slate-900 shadow-xl">
        <div className="bg-slate-900 px-5 py-3 text-white">
          <h3 className="text-base font-bold text-white">ยกเลิกใบสำคัญรับเงิน {row.docNo}</h3>
          <p className="mt-1 text-xs text-slate-300">{row.sellerName || '-'}</p>
        </div>
        <div className="space-y-3 bg-slate-50 p-5">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            การยกเลิก RV จะ mark เอกสารเป็นยกเลิกและบันทึก timeline เท่านั้น ไม่ reverse payment หรือ stock
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              เหตุผลการยกเลิก<span className="ml-1 text-red-600">*</span>
            </span>
            <textarea
              aria-invalid={noteInvalid}
              className={`min-h-24 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 ${noteInvalid ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
              maxLength={500}
              required
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </label>
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
          <Button disabled={isSaving} type="button" variant="secondary" onClick={onCancel}>ปิด</Button>
          <Button className="bg-red-600 hover:bg-red-700" disabled={isSaving} type="button" onClick={onConfirm}>{isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}</Button>
        </div>
      </div>
    </div>
  )
}

function normalizeItems(row: ReceiptVoucherRow): VoucherItem[] {
  if (!Array.isArray(row.items)) return []
  return row.items.filter((item): item is VoucherItem => Boolean(item) && typeof item === 'object')
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
