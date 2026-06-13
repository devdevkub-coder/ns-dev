'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { TableNumberCell } from '@/components/ui/TableNumberCell'
import { Table, TableBody, TableHeader, TableRow } from '@/components/ui/Table'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

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
type ReceiptVoucherColumnKey = 'action' | 'date' | 'docNo' | 'licensePlate' | 'purchaseBillDocNo' | 'sellerName' | 'sellerTaxId' | 'status' | 'totalAmount' | 'totalQty'

type ReceiptVoucherCompanyProfile = {
  address: string
  logoUrl?: string
  name: string
  nameEn: string
  phone: string
  taxId: string
} | null

const receiptVoucherColumns: Array<ResizableColumnDefinition<ReceiptVoucherColumnKey>> = [
  { key: 'docNo', defaultWidth: 110, minWidth: 90 },
  { key: 'date', defaultWidth: 90, minWidth: 80 },
  { key: 'sellerName', defaultWidth: 320, minWidth: 140 },
  { key: 'sellerTaxId', defaultWidth: 130, minWidth: 110 },
  { key: 'purchaseBillDocNo', defaultWidth: 110, minWidth: 90 },
  { key: 'licensePlate', defaultWidth: 100, minWidth: 80 },
  { key: 'status', defaultWidth: 96, minWidth: 80 },
  { key: 'totalQty', defaultWidth: 85, minWidth: 70 },
  { key: 'totalAmount', defaultWidth: 85, minWidth: 70 },
  { key: 'action', defaultWidth: 180, minWidth: 150 },
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
    paymentMethod: 'รับเงินสด',
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
    paymentMethod: row.paymentMethod || 'รับเงินสด',
    purchaseBillDocNo: row.purchaseBillDocNo || '',
    salesPerson: row.salesPerson || '',
    sellerAddress: row.sellerAddress || '',
    sellerName: row.sellerName || '',
    sellerPhone: row.sellerPhone || '',
    sellerTaxId: row.sellerTaxId || '',
    supplierCode: '',
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
  const [printingRow, setPrintingRow] = useState<ReceiptVoucherRow | null>(null)
  const [companyProfile, setCompanyProfile] = useState<ReceiptVoucherCompanyProfile>(null)
  const [form, setForm] = useState<ReceiptVoucherFormState>(() => blankForm())
  const [formError, setFormError] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null)
  const [purchaseBillOptions, setPurchaseBillOptions] = useState<PurchaseBillOption[]>([])
  const [rows, setRows] = useState<ReceiptVoucherRow[]>([])
  const [search, setSearch] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [supplierOptions, setSupplierOptions] = useState<SupplierOption[]>([])
  const [currentActorName, setCurrentActorName] = useState('')
  const columnResize = useResizableColumns('daily.receipt-vouchers', receiptVoucherColumns)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<{ companyProfile: ReceiptVoucherCompanyProfile; currentActor: string; purchaseBills: PurchaseBillOption[]; rows: ReceiptVoucherRow[]; suppliers: SupplierOption[] }>('/api/purchase/receipt-vouchers')
      setCompanyProfile(payload.companyProfile)
      setCurrentActorName(payload.currentActor ?? '')
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
  }, [dateFrom, dateTo, pageSize, search])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      const inDateRange = (!dateFrom || row.date >= dateFrom) && (!dateTo || row.date <= dateTo)
      if (!inDateRange) return false
      if (!query) return true
      return `${row.docNo} ${row.purchaseBillDocNo} ${row.sellerName} ${row.sellerTaxId} ${row.licensePlate}`.toLowerCase().includes(query)
    })
  }, [dateFrom, dateTo, rows, search])

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

  const totals = useMemo(() => ({
    amount: filteredRows.filter((row) => row.status !== 'cancelled').reduce((sum, row) => sum + row.totalAmount, 0),
    qty: filteredRows.filter((row) => row.status !== 'cancelled').reduce((sum, row) => sum + row.totalQty, 0),
  }), [filteredRows])

  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const hasActiveFilter = Boolean(search || dateFrom || dateTo)

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
  }

  function openCreateForm() {
    setForm({ ...blankForm(), payerSignerName: currentActorName })
    setFormError(null)
    setFormMode('create')
  }

  function openEditForm(row: ReceiptVoucherRow) {
    if (row.status === 'cancelled') return
    setForm(normalizeFormFromRow(row))
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

        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 text-sm">
          <KpiCard label="จำนวนเอกสาร" tone="slate" value={totalRows.toLocaleString('th-TH')} />
          <KpiCard label="น้ำหนัก active (กก.)" tone="blue" value={formatMoney(totals.qty)} />
          <KpiCard label="ยอด active" tone="emerald" value={formatMoney(totals.amount)} />
          <KpiCard label="ยกเลิก" tone="violet" value={filteredRows.filter((row) => row.status === 'cancelled').length.toLocaleString('th-TH')} />
        </div>

        {/* Desktop Toolbar (Hidden on Mobile) */}
        <div className="hidden md:block rounded-md bg-white p-3 shadow">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[260px] flex-1 rounded-md"
              placeholder="ค้นเลขที่ / ชื่อผู้รับ / เลขบิลซื้อ / ทะเบียน..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">วันที่:</span>
              <DatePickerInput id="receipt-vouchers-date-from" value={dateFrom} onChange={setDateFrom} />
              <span className="text-slate-400">→</span>
              <DatePickerInput id="receipt-vouchers-date-to" value={dateTo} onChange={setDateTo} />
            </div>

            {hasActiveFilter ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
            <Button type="button" onClick={openCreateForm}>+ สร้างใบสำคัญรับเงิน</Button>
          </div>
        </div>

        {/* Mobile Toolbar (Hidden on Desktop) */}
        <div className="block md:hidden rounded-md bg-white p-3 shadow">
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
              <span>🔍</span> ตัวกรอง {(dateFrom || dateTo) ? '(1)' : ''}
            </button>
            {hasActiveFilter ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕</Button> : null}
          </div>
        </div>

        {/* Bottom Sheet Filter for Mobile */}
        {showMobileFilters ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 md:hidden">
            <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-200 animate-slide-up max-h-[80vh] overflow-y-auto">
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
                    <DatePickerInput className="flex-1" id="receipt-vouchers-mobile-date-from" value={dateFrom} onChange={setDateFrom} />
                    <span className="text-slate-400">→</span>
                    <DatePickerInput className="flex-1" id="receipt-vouchers-mobile-date-to" value={dateTo} onChange={setDateTo} />
                  </div>
                </div>
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
                  className="h-11 rounded-md bg-slate-800 text-sm font-semibold text-white hover:bg-slate-700"
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
            <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow border border-slate-200">กำลังโหลดข้อมูล</div>
          ) : null}
          {!isLoading && pagedRows.map((row) => (
            <div
              key={row.id}
              className="rounded-md border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 cursor-pointer transition-colors"
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
            <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-200">ยังไม่มีใบสำคัญรับเงิน</div>
          ) : null}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <Table className="[&_tbody_tr]:border-slate-100" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {receiptVoucherColumns.map((column, index) => {
              const style = columnResize.getColumnStyle(column.key);
              if (index === receiptVoucherColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />;
              }
              return <col key={column.key} style={style} />;
            })}
            </colgroup>
            <TableHeader>
              <tr>
                <ResizableTableHead label="เลขที่" resizeProps={columnResize.getResizeHandleProps('docNo', 'เลขที่')} />
                <ResizableTableHead label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} />
                <ResizableTableHead label="ผู้รับเงิน" resizeProps={columnResize.getResizeHandleProps('sellerName', 'ผู้รับเงิน')} />
                <ResizableTableHead label="เลขประจำตัวผู้เสียภาษี" resizeProps={columnResize.getResizeHandleProps('sellerTaxId', 'เลขประจำตัวผู้เสียภาษี')} />
                <ResizableTableHead label="บิลซื้อ" resizeProps={columnResize.getResizeHandleProps('purchaseBillDocNo', 'บิลซื้อ')} />
                <ResizableTableHead label="ทะเบียน" resizeProps={columnResize.getResizeHandleProps('licensePlate', 'ทะเบียน')} />
                <ResizableTableHead label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} />
                <ResizableTableHead align="right" label="น้ำหนัก (กก.)" resizeProps={columnResize.getResizeHandleProps('totalQty', 'น้ำหนัก (กก.)')} />
                <ResizableTableHead align="right" label="จำนวนเงิน" resizeProps={columnResize.getResizeHandleProps('totalAmount', 'จำนวนเงิน')} />
                <ResizableTableHead align="right" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('action', 'จัดการ')} />
              </tr>
            </TableHeader>
            <TableBody>
              {isLoading ? <TableRow><td className="p-8 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</td></TableRow> : null}
              {!isLoading && pagedRows.map((row) => (
                <TableRow key={row.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetailRow(row)}>
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
                      <button className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60" type="button" onClick={(event) => { event.stopPropagation(); setPrintingRow(row) }}>
                        พิมพ์
                      </button>
                      <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={row.status === 'cancelled'} type="button" onClick={(event) => { event.stopPropagation(); openEditForm(row) }}>แก้ไข</button>
                      <button className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={row.status === 'cancelled'} type="button" onClick={(event) => { event.stopPropagation(); setCancelingRow(row); setCancelNote(''); setCancelError(null) }}>ยกเลิก</button>
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
          supplierSearchOptions={supplierSearchOptions}
          purchaseBillSearchOptions={purchaseBillSearchOptions}
        />
      ) : null}

      {detailRow ? <ReceiptVoucherDetailModal row={detailRow} onClose={() => setDetailRow(null)} onPrint={() => setPrintingRow(detailRow)} /> : null}
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
          onNoteChange={setCancelNote}
        />
      ) : null}
      {printingRow ? <PrintPreview companyProfile={companyProfile} row={printingRow} onClose={() => setPrintingRow(null)} /> : null}

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 md:hidden print:hidden">
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
  supplierSearchOptions: SearchComboboxOption[]
  purchaseBillSearchOptions: SearchComboboxOption[]
}) {
  const totals = formTotals(form)
  const [showSellerDetails, setShowSellerDetails] = useState(false)

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/40 md:p-3 print:hidden flex items-stretch md:items-start justify-center">
      <div className="w-full md:max-w-6xl rounded-none md:rounded-md bg-white shadow-xl flex flex-col h-screen md:h-auto md:max-h-[calc(100vh-80px)] my-0 md:my-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 md:px-5 py-3 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">{mode === 'edit' ? 'แก้ไข' : 'สร้าง'}ใบสำคัญรับเงิน</h3>
            <p className="hidden md:block text-xs text-slate-500">ใช้สำหรับ Supplier รับเงินสดจากบริษัท กรณีไม่มีใบเสร็จจาก Supplier</p>
          </div>
          <button className="text-2xl leading-none text-slate-400 hover:text-slate-600" type="button" onClick={onClose}>&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 md:p-5 space-y-3 md:space-y-4">
          {formError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError}</div> : null}

          <section className="rounded-md border border-amber-200 bg-amber-50 p-2.5 md:p-3">
            <div className="mb-2 md:mb-3 text-xs md:text-sm font-semibold text-amber-950">ข้อมูลหลัก</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-[1.2fr_1fr_180px] md:gap-3">
              <div className="col-span-2 md:col-span-1">
                <SearchCombobox
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
                  <DatePickerInput id="rv-date" value={form.date} onChange={(value) => onUpdateForm({ date: value })} />
                </FormField>
              </div>
            </div>

            {/* Seller Info Collapsible on Mobile */}
            {form.sellerName ? (
              <div className="mt-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-amber-200 bg-amber-100/50 px-3 py-1.5 text-xs font-semibold text-amber-950 md:hidden focus-visible:outline-none"
                  onClick={() => setShowSellerDetails(!showSellerDetails)}
                >
                  <span>📋 {showSellerDetails ? 'ซ่อนรายละเอียดผู้รับเงิน' : 'ดูรายละเอียดผู้รับเงิน'}</span>
                  <span className="text-[10px]">{showSellerDetails ? '▲' : '▼'}</span>
                </button>

                <div className={`${showSellerDetails ? 'grid' : 'hidden'} md:grid mt-2 md:mt-3 grid-cols-1 gap-2 rounded-md border border-amber-200 bg-white/70 p-3 text-xs text-slate-700 md:grid-cols-2`}>
                  <ReadOnlyInfo label="ผู้รับเงิน" value={form.sellerName} />
                  <ReadOnlyInfo label="เลขประจำตัวผู้เสียภาษี" value={form.sellerTaxId} />
                  <ReadOnlyInfo label="ที่อยู่" value={form.sellerAddress} wide />
                  <ReadOnlyInfo label="เบอร์โทร" value={form.sellerPhone} />
                  <ReadOnlyInfo label="ช่องทางติดต่อ Sale" value={form.salesPerson} />
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-md border border-slate-200 p-2.5 md:p-3">
            <div className="mb-1.5 md:mb-2 flex items-center justify-between gap-2">
              <div className="text-xs md:text-sm font-semibold text-slate-800">รายการค่าใช้จ่าย/สินค้า ({form.items.length})</div>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[820px] text-xs">
                <thead className="bg-slate-100 text-slate-700">
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
            <div className="mt-2 md:mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
              <div className="flex min-h-8 md:min-h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2 md:px-3 text-xs md:text-sm text-slate-800">
                {form.amountInWords || thaiBahtText(totals.amount) || '-'}
              </div>
            </div>
          </section>

          <section className="rounded-md border border-slate-200 p-2.5 md:p-3">
            <div className="mb-2 md:mb-3 text-xs md:text-sm font-semibold text-slate-800">หมายเหตุและผู้ลงนาม</div>
            <div className="grid grid-cols-2 gap-2 md:gap-3">
              <FormField className="col-span-2" label="หมายเหตุ">
                <textarea
                  className="h-10 md:h-20 min-h-10 md:min-h-20 w-full rounded-md border border-slate-300 px-3 py-1.5 md:py-2 text-xs md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                  value={form.note}
                  onChange={(event) => onUpdateForm({ note: event.target.value })}
                />
              </FormField>
              <FormField label="วิธีรับเงิน">
                <div className="flex h-8 md:h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 md:px-3 text-xs md:text-sm font-semibold text-slate-800">
                  รับเงินสด
                </div>
              </FormField>
              <FormField label="ผู้จ่ายเงิน (ลายเซ็น)">
                <div className="flex h-8 md:h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 md:px-3 text-xs md:text-sm font-semibold text-slate-800 truncate">
                  {form.payerSignerName || '-'}
                </div>
              </FormField>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 md:px-5 py-3 shrink-0">
          <Button disabled={isSaving} type="button" variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button disabled={isSaving} type="button" onClick={onSave}>{isSaving ? 'กำลังบันทึก...' : 'บันทึก'}</Button>
        </div>
      </div>
    </div>
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
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 min-h-5 font-semibold text-slate-800">{value || '-'}</div>
    </div>
  )
}

function KpiCard({ label, tone, value }: { label: string; tone: 'blue' | 'emerald' | 'slate' | 'violet'; value: string }) {
  const configs = {
    slate: {
      bg: 'bg-slate-100 text-slate-600',
      emoji: '📋',
      labelColor: 'text-slate-500',
      valueColor: 'text-slate-900',
    },
    blue: {
      bg: 'bg-blue-100 text-blue-600',
      emoji: '⚖️',
      labelColor: 'text-blue-600',
      valueColor: 'text-blue-700',
    },
    emerald: {
      bg: 'bg-emerald-100 text-emerald-600',
      emoji: '✅',
      labelColor: 'text-emerald-600',
      valueColor: 'text-emerald-700',
    },
    violet: {
      bg: 'bg-violet-100 text-violet-600',
      emoji: '🚨',
      labelColor: 'text-violet-600',
      valueColor: 'text-violet-700',
    },
  }

  const config = configs[tone]

  return (
    <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4 flex-1">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${config.bg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {config.emoji}
      </div>
      <div>
        <div className={`text-xs ${config.labelColor}`}>{label}</div>
        <div className={`font-bold ${config.valueColor}`}>{value}</div>
      </div>
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/40 p-3 print:hidden">
      <div className="mx-auto my-4 max-w-4xl rounded-md bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">รายละเอียดใบสำคัญรับเงิน {row.docNo}</h3>
              <StatusPill status={row.status} />
            </div>
            <p className="mt-1 text-xs text-slate-500">เอกสารหลักฐานรับเงินสดจาก Supplier ไม่กระทบ PMT/BST/AP/stock</p>
          </div>
          <button className="text-2xl leading-none text-slate-400 hover:text-slate-600" type="button" onClick={onClose}>&times;</button>
        </div>

        <div className="max-h-[calc(100vh-150px)] space-y-4 overflow-y-auto p-5">
          {row.status === 'cancelled' ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-semibold">เหตุผลการยกเลิก</div>
              <div className="mt-1 whitespace-pre-wrap">{row.cancelNote || '-'}</div>
              <div className="mt-2 text-xs text-slate-500">ยกเลิกโดย {row.cancelledBy || '-'} เมื่อ {row.cancelledAt ? formatDateDisplay(row.cancelledAt.slice(0, 10)) : '-'}</div>
            </div>
          ) : null}

          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DetailField label="วันที่ออกเอกสาร" value={formatDateDisplay(row.date)} />
            <DetailField label="บิลซื้ออ้างอิง" value={row.purchaseBillDocNo || '-'} />
            <DetailField label="ผู้รับเงิน" value={row.sellerName || '-'} />
            <DetailField label="เลขประจำตัวผู้เสียภาษี" value={row.sellerTaxId || '-'} />
            <DetailField label="ที่อยู่" value={row.sellerAddress || '-'} wide />
            <DetailField label="เบอร์โทร" value={row.sellerPhone || '-'} />
            <DetailField label="Sale contact" value={row.salesPerson || '-'} />
            <DetailField label="ยอดเงิน" value={formatMoney(row.totalAmount)} />
            <DetailField label="น้ำหนักรวม" value={formatMoney(row.totalQty)} />
            <DetailField label="หมายเหตุ" value={row.note || '-'} wide />
          </section>

          <section className="rounded-md border border-slate-200">
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

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>ปิด</Button>
          <Button type="button" onClick={onPrint}>พิมพ์</Button>
        </div>
      </div>
    </div>
  )
}

function DetailField({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col py-1 ${wide ? 'md:col-span-2' : ''}`}>
      <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</div>
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-3 print:hidden">
      <div className="w-full max-w-lg rounded-md bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-base font-bold text-slate-900">ยกเลิกใบสำคัญรับเงิน {row.docNo}</h3>
          <p className="mt-1 text-xs text-slate-500">{row.sellerName || '-'}</p>
        </div>
        <div className="space-y-3 p-5">
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            การยกเลิก RV จะ mark เอกสารเป็นยกเลิกและบันทึก timeline เท่านั้น ไม่ reverse payment หรือ stock
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">เหตุผลการยกเลิก *</span>
            <textarea
              className={`min-h-24 w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100 ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
            />
          </label>
          {error ? <div className="text-xs text-red-600">{error}</div> : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button disabled={isSaving} type="button" variant="secondary" onClick={onCancel}>ปิด</Button>
          <Button className="bg-red-600 hover:bg-red-700" disabled={isSaving} type="button" onClick={onConfirm}>{isSaving ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิก'}</Button>
        </div>
      </div>
    </div>
  )
}

function PrintPreview({ companyProfile, onClose, row }: { companyProfile: ReceiptVoucherCompanyProfile; onClose: () => void; row: ReceiptVoucherRow }) {
  const items = normalizeItems(row)
  const printItems = items.length
    ? items
    : [{ amount: row.totalAmount, description: row.purchaseBillDocNo || row.docNo, id: 'summary', price: row.totalQty ? row.totalAmount / row.totalQty : row.totalAmount, qty: row.totalQty, unit: 'กก.' }]
  const quantitySummary = summarizeQuantityByUnit(printItems)
  const companyName = companyProfile?.name || 'ไม่มีข้อมูล'
  const companyAddress = companyProfile?.address || 'ไม่มีข้อมูล'
  const companyPhone = companyProfile?.phone || 'ไม่มีข้อมูล'
  const companyTaxId = companyProfile?.taxId || 'ไม่มีข้อมูล'

  const [autoScale, setAutoScale] = useState(1)
  const [zoom, setZoom] = useState<number | null>(null)

  const zoomLevels = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25, 1.5]

  useEffect(() => {
    const handleResize = () => {
      // Calculate available dimensions:
      // Height: viewport height minus modal header (68px), modal footer (60px), zoom toolbar (45px) and padding
      const availableHeight = window.innerHeight - 210
      // Width: viewport width minus modal padding
      const availableWidth = window.innerWidth - 64

      const targetHeight = 1123
      const targetWidth = 794

      const scaleHeight = availableHeight / targetHeight
      const scaleWidth = availableWidth / targetWidth

      const s = Math.min(1, scaleHeight, scaleWidth)
      setAutoScale(s)
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const currentScale = zoom === null ? autoScale : zoom

  const handleZoomIn = () => {
    const currentVal = zoom === null ? autoScale : zoom
    const nextLevel = zoomLevels.find((level) => level > currentVal + 0.01)
    if (nextLevel) {
      setZoom(nextLevel)
    }
  }

  const handleZoomOut = () => {
    const currentVal = zoom === null ? autoScale : zoom
    const prevLevel = [...zoomLevels].reverse().find((level) => level < currentVal - 0.01)
    if (prevLevel) {
      setZoom(prevLevel)
    }
  }

  const handleResetZoom = () => {
    setZoom(null)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 p-3 flex justify-center items-center print:static print:p-0 print:bg-transparent overflow-hidden">
      <div className="relative w-full max-w-4xl rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden print:border-none print:shadow-none print:w-full">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 bg-slate-50 print:hidden">
          <div>
            <h3 className="text-base font-bold text-slate-900">พรีวิวใบสำคัญรับเงิน {row.docNo}</h3>
            <p className="text-xs text-slate-500">ตรวจสอบรายละเอียดรูปแบบพิมพ์เอกสาร (A4)</p>
          </div>
          <button className="text-2xl leading-none text-slate-400 hover:text-slate-600" type="button" onClick={onClose}>&times;</button>
        </div>

        {/* Modal Content Preview Sheet */}
        <div className="flex flex-col h-[calc(100vh-170px)] bg-slate-100 print:h-auto print:max-h-none print:overflow-visible print:bg-white print:p-0">

          {/* Zoom Toolbar */}
          <div className="flex items-center justify-center gap-3 border-b border-slate-200 bg-white px-4 py-2 shadow-sm print:hidden">
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              onClick={handleZoomOut}
              disabled={zoom !== null && zoom <= zoomLevels[0]}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="size-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
              </svg>
            </button>
            <span className="min-w-[64px] text-center text-xs font-bold text-slate-700">
              {zoom === null ? 'พอดีจอ' : `${Math.round(zoom * 100)}%`}
            </span>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              onClick={handleZoomIn}
              disabled={zoom !== null && zoom >= zoomLevels[zoomLevels.length - 1]}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="size-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <button
              type="button"
              className="rounded-md px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:bg-blue-50 disabled:opacity-40"
              onClick={handleResetZoom}
              disabled={zoom === null}
            >
              ปรับให้พอดี
            </button>
          </div>

          {/* Scrollable Preview Area */}
          <div className="flex-1 overflow-auto p-4 md:p-6 flex print:overflow-visible print:p-0">
            {/* Scaled Wrapper */}
            <div
              className="relative flex justify-center items-start print:block print:w-full print:h-auto m-auto"
              style={{
                width: typeof window !== 'undefined' ? `${794 * currentScale}px` : '100%',
                height: typeof window !== 'undefined' ? `${1123 * currentScale}px` : 'auto',
              }}
            >
              <div
                className="absolute top-0 left-0 origin-top-left bg-white p-[6mm] md:p-[9mm] text-slate-900 shadow-md print:static print:transform-none print:p-0 print:shadow-none print:w-full print:h-auto print:min-h-0"
                style={{
                  fontFamily: "'Noto Sans Thai', Arial, sans-serif",
                  fontSize: '11px',
                  lineHeight: 1.35,
                  width: typeof window !== 'undefined' ? '794px' : '100%',
                  height: typeof window !== 'undefined' ? '1123px' : 'auto',
                  transform: typeof window !== 'undefined' ? `scale(${currentScale})` : 'none',
                }}
              >
              {row.status === 'cancelled' ? (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[72px] font-black text-slate-200/70 rotate-[-18deg] print:text-[64px]">
                  ยกเลิก
                </div>
              ) : null}
              <div className="mb-3 h-1 rounded-full bg-gradient-to-r from-emerald-800 via-lime-600 to-slate-300 print:mb-2" />

              <header className="grid grid-cols-[1fr_0.82fr] gap-4 border-b border-slate-300 pb-3 print:gap-3 print:pb-2">
                <div className="grid grid-cols-[64px_1fr] gap-3 print:grid-cols-[48px_1fr] print:gap-2">
                  {companyProfile?.logoUrl ? (
                    <div
                      aria-label="Company logo"
                      className="size-16 bg-contain bg-center bg-no-repeat print:size-12"
                      role="img"
                      style={{ backgroundImage: `url("${companyProfile.logoUrl.replaceAll('"', '%22')}")` }}
                    />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded-md border border-dashed border-slate-300 text-center text-[9px] font-bold text-slate-500 print:size-12 print:text-[8px]">ไม่มีข้อมูล</div>
                  )}
                  <div className="min-w-0">
                    <div className="text-base font-black leading-tight text-slate-950 print:text-sm">{companyName}</div>
                    {companyProfile?.nameEn ? <div className="mt-0.5 text-[10px] font-bold text-slate-600">{companyProfile.nameEn}</div> : null}
                    <div className="mt-1 text-[10px] leading-relaxed text-slate-600 print:text-[9px]">
                      <div>{companyAddress}</div>
                      <div>โทร {companyPhone}</div>
                      <div>เลขประจำตัวผู้เสียภาษี {companyTaxId}</div>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[22px] font-black text-emerald-900 print:text-[19px]">ใบสำคัญรับเงิน</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-normal text-slate-500">Receipt Voucher</div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5 text-left print:mt-2">
                    <PrintMeta label="เลขที่เอกสาร" value={row.docNo} />
                    <PrintMeta label="วันที่ออกเอกสาร" value={formatDateDisplay(row.date)} />
                    <PrintMeta label="อ้างอิงบิลซื้อ" value={row.purchaseBillDocNo || '-'} />
                    <PrintMeta label="วิธีรับเงิน" value={row.paymentMethod || 'รับเงินสด'} />
                  </div>
                </div>
              </header>

              <section className="mt-3 grid grid-cols-2 gap-3 print:mt-2 print:gap-2">
                <PrintPanel title="ผู้รับเงิน / Supplier Receiver">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <PrintField label="ผู้รับเงิน" value={row.sellerName} />
                    <PrintField label="เลขประจำตัวผู้เสียภาษี" value={row.sellerTaxId} />
                    <PrintField label="ที่อยู่" value={row.sellerAddress} wide />
                    <PrintField label="เบอร์โทร" value={row.sellerPhone} />
                    <PrintField label="Sale contact" value={row.salesPerson} />
                  </div>
                </PrintPanel>
                <PrintPanel title="ผู้จ่ายเงิน / Company Payer">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    <PrintField label="บริษัท" value={companyName} />
                    <PrintField label="เลขประจำตัวผู้เสียภาษี" value={companyTaxId} />
                    <PrintField label="ที่อยู่" value={companyAddress} wide />
                    <PrintField label="โทร" value={companyPhone} />
                    <PrintField label="ผู้จ่ายเงิน" value={row.payerSignerName || row.createdBy} />
                  </div>
                </PrintPanel>
              </section>

              <table className="mt-3 w-full table-fixed border-collapse text-[9px] print:mt-2 print:text-[8px]">
                <thead>
                  <tr className="bg-slate-200 text-slate-900">
                    <th className="w-[8mm] border border-slate-300 p-1.5 text-center font-black print:p-1">#</th>
                    <th className="border border-slate-300 p-1.5 text-left font-black print:p-1">รายการ</th>
                    <th className="w-[28mm] border border-slate-300 p-1.5 text-right font-black print:p-1">จำนวน/หน่วย</th>
                    <th className="w-[25mm] border border-slate-300 p-1.5 text-right font-black print:p-1">ราคา/หน่วย</th>
                    <th className="w-[29mm] border border-slate-300 p-1.5 text-right font-black print:p-1">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody>
                  {printItems.map((item, index) => (
                    <tr key={item.id ?? index} className="break-inside-avoid">
                      <td className="border border-slate-300 p-1.5 text-center print:p-1">{index + 1}</td>
                      <td className="border border-slate-300 p-1.5 font-bold text-slate-900 print:p-1">{item.description || '-'}</td>
                      <td className="border border-slate-300 p-1.5 text-right tabular-nums print:p-1">{formatMoney(toNumber(item.qty))} {item.unit || 'หน่วย'}</td>
                      <td className="border border-slate-300 p-1.5 text-right tabular-nums print:p-1">{formatMoney(toNumber(item.price))}</td>
                      <td className="border border-slate-300 p-1.5 text-right font-black tabular-nums print:p-1">{formatMoney(toNumber(item.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <section className="mt-3 grid grid-cols-[1fr_70mm] gap-3 print:mt-2 print:gap-2">
                <div className="space-y-2">
                  <div className="rounded-md border border-slate-300">
                    <div className="bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700 print:text-[9px]">จำนวนเงิน (ตัวอักษร)</div>
                    <div className="min-h-8 px-2 py-2 text-xs font-bold text-slate-900 print:min-h-6 print:py-1.5 print:text-[10px]">{row.amountInWords || '-'}</div>
                  </div>
                  <div className="rounded-md border border-slate-300">
                    <div className="bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700 print:text-[9px]">หมายเหตุ</div>
                    <div className="min-h-10 whitespace-pre-wrap px-2 py-2 text-[10px] text-slate-700 print:min-h-7 print:py-1.5 print:text-[9px]">{row.note || 'แนบสำเนาบัตรประชาชนผู้รับเงิน (กรณีบุคคลธรรมดา)'}</div>
                  </div>
                </div>
                <div className="overflow-hidden rounded-md border border-slate-300">
                  <TotalLine label="จำนวนรวม" value={quantitySummary || '-'} />
                  <TotalLine label="ยอดเงินรวม" value={formatMoney(row.totalAmount)} />
                  <div className="grid grid-cols-[1fr_32mm] gap-2 bg-emerald-900 px-2 py-1.5 text-white">
                    <div className="font-black">ยอดรับเงินสด</div>
                    <div className="text-right font-black tabular-nums">{formatMoney(row.totalAmount)}</div>
                  </div>
                </div>
              </section>

              <div className="mt-12 grid grid-cols-2 gap-16 text-[10px] print:mt-9 print:gap-12 print:text-[9px]">
                <SignatureBlock label="ผู้จ่ายเงิน" name={row.payerSignerName} />
                <SignatureBlock label="ผู้รับเงิน" name={row.sellerName} />
              </div>

              <div className="mt-4 border-t border-slate-200 pt-2 text-center text-[9px] font-semibold text-slate-500 print:mt-3">
                เอกสารนี้เป็นหลักฐานรับเงินสดจาก Supplier เท่านั้น ไม่ใช่เอกสารโอนเงินหรือรายการธนาคาร
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 print:hidden">
          <Button type="button" variant="secondary" onClick={onClose}>ปิด</Button>
          <Button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1.5" type="button" onClick={() => window.print()}>
            🖨 พิมพ์เอกสาร
          </Button>
        </div>
      </div>
    </div>
  )
}

function PrintMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 print:px-1.5 print:py-0.5">
      <div className="text-[9px] text-slate-500 print:text-[8px]">{label}</div>
      <div className="mt-0.5 font-black text-slate-900">{value || '-'}</div>
    </div>
  )
}

function PrintPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-300 break-inside-avoid">
      <div className="bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700 print:text-[9px]">{title}</div>
      <div className="p-2 print:p-1.5">{children}</div>
    </div>
  )
}

function PrintField({ label, value, wide = false }: { label: string; value?: string | null; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-[9px] text-slate-500 print:text-[8px]">{label}</div>
      <div className="mt-0.5 font-bold text-slate-900 [overflow-wrap:anywhere]">{value || '-'}</div>
    </div>
  )
}

function TotalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_32mm] gap-2 border-b border-slate-200 px-2 py-1.5 last:border-b-0 print:py-1">
      <div className="font-bold text-slate-700">{label}</div>
      <div className="text-right font-black tabular-nums text-slate-900">{value}</div>
    </div>
  )
}

function SignatureBlock({ label, name }: { label: string; name?: string | null }) {
  return (
    <div className="text-center text-slate-600">
      <div className="mx-auto h-9 w-[78%] border-b border-slate-500 print:h-7" />
      <div className="mt-1 font-black text-slate-800">{label}</div>
      <div className="mt-0.5">( {name || '-'} )</div>
      <div className="mt-1 text-[9px] text-slate-500">วันที่ ____ / ____ / ______</div>
    </div>
  )
}

function normalizeItems(row: ReceiptVoucherRow): VoucherItem[] {
  if (!Array.isArray(row.items)) return []
  return row.items.filter((item): item is VoucherItem => Boolean(item) && typeof item === 'object')
}

function summarizeQuantityByUnit(items: VoucherItem[]) {
  const byUnit = new Map<string, number>()
  for (const item of items) {
    const unit = item.unit || 'หน่วย'
    byUnit.set(unit, (byUnit.get(unit) ?? 0) + toNumber(item.qty))
  }
  return [...byUnit.entries()].map(([unit, qty]) => `${formatMoney(qty)} ${unit}`).join(' / ')
}

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
