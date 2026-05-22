'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { purchaseBillFormSchema, type PurchaseBillFormValues } from '@/lib/purchase-bill'

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

type TransactionPayload = {
  rows: Array<BillRow | StockIssueRow>
  totalAmount?: number
  totalRows?: number
}

type TransactionBillsPageClientProps = {
  mode: 'purchase' | 'sales' | 'stock-issue'
}

type SortKey = 'createdBy' | 'date' | 'docNo' | 'itemCount' | 'name' | 'outstanding' | 'refNo' | 'status' | 'totalAmount' | 'transactionMode' | 'warehouse'
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

function optionLabel(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name
}

function searchableOptionText(option: Option) {
  return `${option.code ?? ''} ${option.name} ${option.id}`.toLowerCase()
}

function formatPercent(value: number) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: value % 1 === 0 ? 0 : 2 })
}

function poQtyVariance(poQty: number, itemQty: number) {
  const diff = poQty - itemQty
  if (Math.abs(diff) < 0.001) return { className: 'text-emerald-700', text: 'ตรงกับ PO' }
  if (diff > 0) return { className: 'text-amber-700', text: `ขาด ${formatMoney(diff)} กก.` }
  return { className: 'text-red-700', text: `เกิน ${formatMoney(Math.abs(diff))} กก.` }
}

const initialPurchaseForm = (): PurchaseBillFormValues => ({
  branchId: '',
  discountTotal: 0,
  hasVat: false,
  items: [blankItem()],
  licensePlate: '',
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

export function TransactionBillsPageClient({ mode }: TransactionBillsPageClientProps) {
  const router = useRouter()
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
  const [options, setOptions] = useState<Omit<PurchasePayload, 'rows'>>({ branches: [], poBuys: [], products: [], salespersons: [], suppliers: [], warehouses: [] })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [rows, setRows] = useState<Array<BillRow | StockIssueRow>>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
  const [vatRatePercent, setVatRatePercent] = useState(7)
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
    if (mode === 'purchase' && filterMode) params.set('filterMode', filterMode)
    if (mode === 'stock-issue' && filterMode) params.set('status', filterMode)
    return `${apiPath}?${params.toString()}`
  }, [apiPath, dateFrom, dateTo, filterMode, mode, page, pageSize, search, sortDirection, sortKey])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      if (mode === 'purchase') {
        const payload = await dailyFetchJson<PurchasePayload>(requestPath)
        setRows(payload.rows)
        setTotalAmount(payload.totalAmount ?? 0)
        setTotalRows(payload.totalRows ?? payload.rows.length)
        setVatRatePercent(payload.vatRatePercent ?? 7)
        setOptions({
          branches: payload.branches,
          poBuys: payload.poBuys,
          products: payload.products,
          salespersons: payload.salespersons,
          suppliers: payload.suppliers,
          warehouses: payload.warehouses,
        })
      } else {
        const payload = await dailyFetchJson<TransactionPayload>(requestPath)
        setRows(payload.rows)
        setTotalAmount(payload.totalAmount ?? 0)
        setTotalRows(payload.totalRows ?? payload.rows.length)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [mode, requestPath])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, filterMode, pageSize, search, sortDirection, sortKey])

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows
  const total = totalAmount
  const title = mode === 'purchase' ? 'บิลรับซื้อ' : mode === 'sales' ? 'บิลขาย' : 'เบิกออกรอบิล'
  const activeBranches = options.branches.filter((option) => option.active !== false)
  const activePoBuys = options.poBuys.filter((option) => option.active !== false && (!form.supplierId || option.supplier_id === form.supplierId))
  const activeProducts = options.products.filter((option) => option.active !== false)
  const activeSuppliers = options.suppliers.filter((option) => option.active !== false)
  const editingBill = editingBillId ? rows.find((row): row is BillRow => !isStockIssueRow(row) && row.id === editingBillId) : null
  const formVatRatePercent = editingBill?.vatRatePercent ?? vatRatePercent
  const formSubtotal = form.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const formTotalWeight = form.items.reduce((sum, item) => sum + item.qty, 0)
  const formAfterDiscount = Math.max(0, formSubtotal - form.discountTotal)
  const formVat = !form.hasVat || form.vatType === 'NONE' ? 0 : form.vatType === 'INCLUDE' ? formAfterDiscount * formVatRatePercent / (100 + formVatRatePercent) : formAfterDiscount * (formVatRatePercent / 100)
  const formTotal = form.hasVat && form.vatType === 'EXCLUDE' ? formAfterDiscount + formVat : formAfterDiscount
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
  const tableColSpan = mode === 'purchase' ? 10 : mode === 'sales' ? 13 : 10

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setFilterMode('')
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
    setForm(initialPurchaseForm())
    setFieldErrors({})
    setError(null)
    setShowForm(true)
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
      licensePlate: row.licensePlate || '',
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

  function updateForm<K extends keyof PurchaseBillFormValues>(key: K, value: PurchaseBillFormValues[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'supplierId' ? { salesId: activeSuppliers.find((supplier) => supplier.id === value)?.sales_id ?? null } : {}),
      ...(key === 'branchId' ? { warehouseId: null } : {}),
      ...(key === 'hasVat' ? { vatType: value ? 'EXCLUDE' : 'NONE' } : {}),
      ...(key === 'vatInvoiceReceived' && value === false ? { vatInvoiceDate: null, vatInvoiceNo: null } : {}),
    }))
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

  async function exportExcel() {
    setIsExporting(true)
    setError(null)
    try {
      const params = new URLSearchParams({ format: 'xlsx', sortDirection, sortKey })
      if (search.trim()) params.set('search', search.trim())
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (filterMode) params.set('filterMode', filterMode)
      const response = await fetch(`/api/purchase/bills?${params.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Export Excel ไม่สำเร็จ')
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `purchase_bills_${new Date().toISOString().slice(0, 10)}.xlsx`
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
      {mode === 'purchase' ? (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <TransactionKpi label="จำนวนบิลในหน้า" tone="blue" value={totalRows.toLocaleString('th-TH')} />
            <TransactionKpi label="ยอดซื้อรวม" tone="blue" value={formatMoney(total)} />
            <TransactionKpi label="ค้างจ่ายในหน้า" tone="red" value={formatMoney(visibleOutstanding)} />
            <TransactionKpi label="ชำระแล้วในหน้า" tone="emerald" value={formatMoney(visiblePaid)} />
            <TransactionKpi label="Stock / Trading" tone="slate" value={`${visibleStockCount} / ${visibleTradingCount}`} />
          </div>
        </>
      ) : null}

      {mode === 'sales' ? (
        <>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <span className="font-bold">⚠ Pending Sale / ต้นทุนรอเปิดบิล:</span>
            <span className="ml-2">ถ้ามีรายการเบิกออกแล้ว ให้ตรวจที่หน้าเบิกออกรอบิลก่อนเปิดบิลขายจริง</span>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-emerald-700 to-teal-700 p-4 text-white shadow">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h1 className="text-2xl font-bold">📤 บิลขาย</h1><p className="mt-1 text-sm opacity-90">ดูบิลขาย, สถานะรับเงิน, Gross Profit, ค้างรับ และ Trading match baseline</p></div>
              <div className="flex flex-wrap gap-2">
                <button className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white opacity-70" disabled type="button">🔄 Recalc กำไร</button>
                <button className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-700 opacity-70" disabled type="button">📥 Export Excel</button>
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white opacity-70" disabled type="button">+ บิลขายใหม่</button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <TransactionKpi label="จำนวนบิล" tone="emerald" value={totalRows.toLocaleString('th-TH')} />
            <TransactionKpi label="ยอดขายรวม" tone="emerald" value={formatMoney(total)} />
            <TransactionKpi label="รับแล้วในหน้า" tone="blue" value={formatMoney(visiblePaid)} />
            <TransactionKpi label="ค้างรับในหน้า" tone="red" value={formatMoney(visibleOutstanding)} />
            <TransactionKpi label="GP / Margin" tone={visibleGp >= 0 ? 'amber' : 'red'} value={`${formatMoney(visibleGp)} · ${formatMoney(visibleMarginPct)}%`} />
          </div>
        </>
      ) : null}

      {mode === 'stock-issue' ? (
        <>
          <div className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 p-5 text-white shadow">
            <h1 className="text-2xl font-bold">📦 เบิกออกรอบิล (Pending Sale)</h1>
            <p className="mt-1 text-sm opacity-90">เบิกสินค้าออกจากคลังก่อนเปิดบิลขายจริง — สต๊อกตัดทันที พอจะเปิดบิลค่อยกดเปิดบิลขาย</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <TransactionKpi label="⏰ Pending / รายการ" tone="amber" value={`${totalRows.toLocaleString('th-TH')} ใบ`} />
            <TransactionKpi label="น้ำหนักรวมในหน้า" tone="blue" value={`${formatMoney(stockIssueQty)} กก.`} />
            <TransactionKpi label="ต้นทุน (WAC)" tone="red" value={formatMoney(stockIssueCost)} />
            <TransactionKpi label="ยอดขายคาด" tone="emerald" value={formatMoney(stockIssueEst || total)} />
          </div>
        </>
      ) : null}

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="space-y-2 rounded-xl bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[260px] flex-1 rounded-lg border px-3 py-2 text-sm" placeholder={mode === 'purchase' ? 'ค้นหาเลขบิล / เลขอ้างอิง / ชื่อ Supplier...' : 'ค้นหาเลขที่ / ชื่อ / สาขา / คลัง'} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="text-xs text-slate-500">วันที่:</label>
          <input className="rounded-lg border px-2 py-2 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <span className="text-slate-400">→</span>
          <input className="rounded-lg border px-2 py-2 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          {(search || dateFrom || dateTo || filterMode) ? <button className="rounded bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={clearFilters}>✕ ล้าง Filter</button> : null}
          {mode === 'purchase' ? <button className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-60" disabled={isExporting} type="button" onClick={() => void exportExcel()}>{isExporting ? 'กำลัง Export...' : 'Export Excel'}</button> : null}
          {mode === 'purchase' ? <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" type="button" onClick={openPurchaseForm}>+ บิลรับซื้อใหม่</button> : null}
          {mode === 'sales' ? <button className="ml-auto rounded bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700 opacity-70" disabled type="button">🔄 Recalc กำไร</button> : null}
          {mode === 'stock-issue' ? (
            <>
              <select className="rounded-lg border px-3 py-2 text-sm" value={filterMode} onChange={(event) => setFilterMode(event.target.value)}>
                <option value="">ทุกสถานะ</option>
                <option value="pending">⏰ Pending</option>
                <option value="converted">✓ เปิดบิลแล้ว</option>
                <option value="cancelled">⊘ ยกเลิก</option>
              </select>
              <button className="ml-auto rounded bg-amber-600 px-4 py-2 text-sm font-bold text-white opacity-70" disabled type="button">+ เบิกออกใหม่</button>
            </>
          ) : null}
        </div>
        {mode === 'purchase' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">ประเภท:</span>
            <Segment value="" current={filterMode} label="ทั้งหมด" onClick={setFilterMode} />
            <Segment value="STOCK" current={filterMode} label="📦 STOCK" onClick={setFilterMode} />
            <Segment value="TRADING" current={filterMode} label="🔄 TRADING" onClick={setFilterMode} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="rounded border border-slate-300 px-2 py-1"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            <option value={10}>10 / หน้า</option>
            <option value={25}>25 / หน้า</option>
            <option value={50}>50 / หน้า</option>
            <option value={100}>100 / หน้า</option>
          </select>
          <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={currentPage <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <button className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={currentPage >= totalPages} type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="เลขที่" sortKey="docNo" onSort={changeSort} />
              {mode === 'sales' ? <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="เลขที่อ้างอิง" sortKey="refNo" onSort={changeSort} /> : null}
              <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="วันที่" sortKey="date" onSort={changeSort} />
              <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label={mode === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า'} sortKey="name" onSort={changeSort} />
              {mode !== 'purchase' ? <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="สาขา / คลัง" sortKey="warehouse" onSort={changeSort} /> : null}
              {mode !== 'stock-issue' ? <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="ประเภท" sortKey="transactionMode" onSort={changeSort} /> : null}
              <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="สถานะ" sortKey="status" onSort={changeSort} />
              <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="รายการ" sortKey="itemCount" onSort={changeSort} />
              {mode === 'stock-issue' ? <th className="p-2 text-right">น้ำหนัก</th> : null}
              {mode === 'stock-issue' ? <th className="p-2 text-right">ต้นทุน</th> : null}
              <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label={mode === 'stock-issue' ? 'ยอดคาด' : 'ยอดรวม'} sortKey="totalAmount" onSort={changeSort} />
              {mode === 'sales' ? <th className="p-2 text-right">GP / Margin</th> : null}
              {mode === 'sales' ? <th className="p-2 text-right">รับแล้ว</th> : null}
              {mode !== 'stock-issue' ? <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ค้างชำระ" sortKey="outstanding" onSort={changeSort} /> : null}
              {mode === 'sales' ? <th className="p-2 text-center">VAT</th> : null}
              {mode !== 'stock-issue' ? <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="ผู้กรอก / เวลา" sortKey="createdBy" onSort={changeSort} /> : null}
              {mode === 'purchase' ? <th className="p-2 text-right">จัดการ</th> : null}
              {mode === 'sales' ? <th className="p-2 text-right">จัดการ</th> : null}
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={tableColSpan}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && pageRows.map((row) => (
              <tr key={row.id} className={`border-t hover:bg-slate-50 ${mode === 'purchase' && !isStockIssueRow(row) ? 'cursor-pointer' : ''}`} onClick={() => openRow(row)}>
                <td className="p-2 font-mono text-xs">{row.docNo}</td>
                {mode === 'sales' && !isStockIssueRow(row) ? <td className="p-2 font-mono text-xs text-slate-600">{row.refNo || '-'}</td> : null}
                <td className="p-2">{row.date}</td>
                <td className="p-2">{'supplierName' in row ? row.supplierName : row.customerName}</td>
                {mode !== 'purchase' ? <td className="p-2">{formatBranchWarehouse(row)}</td> : null}
                {mode !== 'stock-issue' && !isStockIssueRow(row) ? <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.transactionMode === 'TRADING' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'}`}>{row.transactionMode ?? '-'}</span></td> : null}
                <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(row.status)}`}>{statusText(row.status)}</span></td>
                <td className="p-2 text-right">{row.itemCount}</td>
                {mode === 'stock-issue' && isStockIssueRow(row) ? <td className="p-2 text-right">{formatMoney(row.totalQty ?? 0)}</td> : null}
                {mode === 'stock-issue' && isStockIssueRow(row) ? <td className="p-2 text-right text-red-700">{formatMoney(row.totalCost)}</td> : null}
                <td className="p-2 text-right font-semibold">{formatMoney(isStockIssueRow(row) ? row.totalEstAmount : row.totalAmount ?? 0)}</td>
                {mode === 'sales' && !isStockIssueRow(row) ? <td className={`p-2 text-right font-semibold ${(row.grossProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}><div>{formatMoney(row.grossProfit ?? 0)}</div><div className="text-xs text-slate-500">{formatMoney((row.totalAmount ?? 0) > 0 ? (row.grossProfit ?? 0) / (row.totalAmount ?? 1) * 100 : 0)}%</div></td> : null}
                {mode === 'sales' && !isStockIssueRow(row) ? <td className="p-2 text-right text-blue-700">{formatMoney(row.receivedAmount ?? 0)}</td> : null}
                {mode !== 'stock-issue' && !isStockIssueRow(row) ? <td className="p-2 text-right text-red-700">{formatMoney(mode === 'purchase' ? row.payableBalance ?? 0 : row.receivableBalance ?? 0)}</td> : null}
                {mode === 'sales' && !isStockIssueRow(row) ? <td className="p-2 text-center"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.vatInvoiceIssued ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{row.vatInvoiceIssued ? 'ออกแล้ว' : 'ยังไม่ออก'}</span>{row.vatInvoiceNo ? <div className="mt-1 font-mono text-[10px] text-slate-500">{row.vatInvoiceNo}</div> : null}</td> : null}
                {mode !== 'stock-issue' && !isStockIssueRow(row) ? <td className="p-2 text-xs text-slate-600"><div>{row.createdBy || '-'}</div><div className="font-mono text-[10px] text-slate-400">{formatDateTime(row.createdAt)}</div></td> : null}
                {mode === 'purchase' && !isStockIssueRow(row) ? <td className="p-2 text-right"><div className="flex justify-end gap-1"><button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={(event) => { event.stopPropagation(); openEditPurchaseForm(row) }}>จัดการ</button></div></td> : null}
                {mode === 'sales' && !isStockIssueRow(row) ? <td className="p-2 text-right"><div className="flex justify-end gap-1"><button className="rounded bg-blue-100 px-2 py-1 text-xs font-semibold text-blue-700 opacity-70" disabled type="button">อ่าน</button><button className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-400" disabled type="button">พิมพ์</button><button className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-400" disabled type="button">แก้</button></div></td> : null}
                {mode === 'stock-issue' && isStockIssueRow(row) ? <td className="p-2 text-right"><div className="flex justify-end gap-1 whitespace-nowrap"><button className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 opacity-70" disabled={row.status !== 'pending'} type="button">→ เปิดบิลขาย</button><button className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-400" disabled type="button">แก้</button><button className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-400" disabled type="button">ยกเลิก</button></div></td> : null}
              </tr>
            ))}
            {!isLoading && totalRows === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={tableColSpan}>ยังไม่มีรายการ</td></tr> : null}
          </tbody>
        </table>
      </div>

      {showForm && mode === 'purchase' ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="mx-auto my-4 flex max-h-[94vh] max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 text-white">
              <div>
                <h3 className="text-xl font-bold">📥 {editingBillId ? 'แก้ไขบิลรับซื้อ' : 'สร้างบิลรับซื้อใหม่'}</h3>
                <p className="mt-1 text-xs opacity-80">{editingBillId ? 'แก้ไขได้แม้มีการชำระแล้ว ระบบจะคำนวณยอดค้างและ stock ledger ใหม่' : 'บันทึก header และรายการสินค้าในบิลรับซื้อ'}</p>
              </div>
              <button className="text-3xl leading-none text-white/80 hover:text-white" type="button" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-6 text-sm">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="amber">1</StepBadge>ประเภทบิล</h4>
                <div className="grid gap-3 md:grid-cols-2">
                  <RadioCard active={form.transactionMode === 'STOCK'} label="📦 STOCK" note="ซื้อเข้าสต๊อก · เข้า Stock + คำนวณ WAC ภายหลัง" onClick={() => updateForm('transactionMode', 'STOCK')} />
                  <RadioCard active={form.transactionMode === 'TRADING'} label="🔄 TRADING" note="ซื้อขายผ่านมือ · ไม่เข้า Stock ไม่กระทบ WAC" onClick={() => updateForm('transactionMode', 'TRADING')} />
                </div>
                {form.transactionMode === 'TRADING' ? (
                  <div className="mt-3 rounded border border-purple-200 bg-purple-50 p-2 text-xs text-purple-700">รายการ Trading ไม่เข้า Stock และจะใช้สำหรับจับคู่ขายใน Trading Matching ภายหลัง</div>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="blue">2</StepBadge>ข้อมูลบิล</h4>
                <div className="grid gap-3 md:grid-cols-3">
                <SelectField hideCode error={fieldErrors.branchId} label="สาขา/คลัง *" options={activeBranches} value={form.branchId} onChange={(value) => updateForm('branchId', value)} />
                <SupplierSearchCombobox className="md:col-span-2" error={fieldErrors.supplierId} options={activeSuppliers} value={form.supplierId} onChange={(value) => updateForm('supplierId', value)} />
                <Field error={fieldErrors.licensePlate} label="ทะเบียนรถ *"><input className="w-full rounded border px-3 py-2 uppercase" placeholder="เช่น 1กข-1234 / 70-1234" value={form.licensePlate} onChange={(event) => updateForm('licensePlate', event.target.value.toUpperCase())} /></Field>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="emerald">3</StepBadge>รายการสินค้า ({form.items.length})</h4>
                  <button className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, blankItem()] }))}>+ เพิ่มรายการ</button>
                </div>
                {fieldErrors.items ? <div className="mb-2 text-xs text-red-600">{fieldErrors.items}</div> : null}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[780px] text-sm">
                    <tbody>
                      {form.items.map((item, index) => (
                        <Fragment key={index}>
                          <tr className="border-t align-top hover:bg-blue-50/30">
                            <td className="p-2" colSpan={4}>
                              <ProductSearchCombobox inputId={`purchase-bill-product-search-${index}`} options={activeProducts} value={item.productId} onChange={(value) => updateItem(index, 'productId', value)} />
                              <input className="mt-1.5 w-full rounded border bg-yellow-50 px-2 py-1 text-xs" placeholder="ชื่อสำหรับโชว์ในบิล (ว่าง = ใช้ชื่อ Master)" value={item.displayName ?? ''} onChange={(event) => updateItem(index, 'displayName', event.target.value || null)} />
                            </td>
                            <td className="p-2" colSpan={form.salesId ? 3 : 2}>
                              <div className="mb-1 text-[11px] font-semibold text-indigo-700">อ้างอิง PO</div>
                              <select className="w-full rounded border bg-blue-50 px-2 py-2 text-xs" value={item.poBuyId ?? ''} onChange={(event) => updateItem(index, 'poBuyId', event.target.value || null)}>
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
                            <td className="p-2 align-middle" rowSpan={2}><button className="rounded px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-40" disabled={form.items.length <= 1} type="button" onClick={() => removeItem(index)}>ลบ</button></td>
                          </tr>
                          <tr className="border-t border-slate-100 align-top hover:bg-blue-50/30">
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-slate-500">Gross</div>
                              <input className="w-full rounded border bg-slate-50 px-2 py-2 text-right font-mono" min="0" step="0.01" type="number" value={item.grossWeight || ''} onChange={(event) => updateItemWeights(index, 'grossWeight', Number(event.target.value || 0))} />
                            </td>
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-amber-700">หัก</div>
                              <input className="w-full rounded border bg-amber-50 px-2 py-2 text-right font-mono" min="0" step="0.01" type="number" value={item.deductWeight || ''} onChange={(event) => updateItemWeights(index, 'deductWeight', Number(event.target.value || 0))} />
                            </td>
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-emerald-700">สุทธิ</div>
                              <input className="w-full rounded border bg-emerald-50 px-2 py-2 text-right font-mono font-bold text-emerald-700" min="0" step="0.01" type="number" value={item.qty || ''} onChange={(event) => updateItem(index, 'qty', Number(event.target.value || 0))} />
                            </td>
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-slate-500">ราคา/กก.</div>
                              <input className="w-full rounded border px-2 py-2 text-right font-mono" min="0" step="0.01" type="number" value={item.price || ''} onChange={(event) => updateItem(index, 'price', Number(event.target.value || 0))} />
                            </td>
                            {form.salesId ? (
                              <td className="p-2">
                                <div className="mb-1 text-[11px] font-semibold text-purple-700">ราคาหน้าใบ</div>
                                <input className="w-full rounded border bg-purple-50 px-2 py-2 text-right font-mono" min="0" step="0.01" type="number" value={item.salesPrice || ''} onChange={(event) => updateItem(index, 'salesPrice', Number(event.target.value || 0))} />
                              </td>
                            ) : null}
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-slate-500">ส่วนลด</div>
                              <input className="w-full rounded border px-2 py-2 text-right font-mono" min="0" step="0.01" type="number" value={item.discount || ''} onChange={(event) => updateItem(index, 'discount', Number(event.target.value || 0))} />
                            </td>
                            <td className="p-2">
                              <div className="mb-1 text-[11px] font-semibold text-blue-700">ยอดรวม</div>
                              <div className="rounded border border-blue-100 bg-blue-50 px-2 py-2 text-right font-mono font-bold text-blue-700">{formatMoney(Math.max(0, item.qty * item.price - item.discount))}</div>
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

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="purple">4</StepBadge>VAT & ยอดรวม</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 ${form.hasVat ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                      <input checked={form.hasVat} className="size-5" type="checkbox" onChange={(event) => updateForm('hasVat', event.target.checked)} />
                      <span className="font-bold text-slate-700">มี {vatLabel}</span>
                    </label>
                    <Field error={fieldErrors.discountTotal} label="ส่วนลดท้ายบิล (บาท)"><input className="w-full rounded border px-3 py-2 text-right font-mono" min="0" step="0.01" type="number" value={form.discountTotal || ''} onChange={(event) => updateForm('discountTotal', Number(event.target.value || 0))} /></Field>
                  </div>
                  <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
                    <div className="mb-2 flex justify-between rounded border border-emerald-300 bg-emerald-100 p-2 font-bold text-emerald-800"><span>น้ำหนักรวมที่ซื้อ</span><span className="font-mono">{formatMoney(formTotalWeight)} กก.</span></div>
                    <SummaryLine label="ยอดรวมรายการ" value={formatMoney(formSubtotal)} />
                    {form.discountTotal > 0 ? <SummaryLine label="หักส่วนลด" tone="red" value={`-${formatMoney(form.discountTotal)}`} /> : null}
                    <SummaryLine label="หลังส่วนลด" value={formatMoney(formAfterDiscount)} />
                    {form.hasVat ? <SummaryLine label={vatLabel} value={formatMoney(formVat)} /> : null}
                    <div className="mt-2 flex justify-between border-t-2 border-blue-400 pt-2 text-lg font-bold"><span>ยอดสุทธิ</span><span className="font-mono text-blue-700">{formatMoney(formTotal)}</span></div>
                  </div>
                </div>
              </div>

              {form.hasVat ? (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                  <label className="mb-2 flex cursor-pointer items-center gap-2">
                    <input checked={form.vatInvoiceReceived} className="size-5" type="checkbox" onChange={(event) => updateForm('vatInvoiceReceived', event.target.checked)} />
                    <span className="font-bold text-amber-700">ได้รับใบกำกับภาษีตัวจริงแล้ว</span>
                  </label>
                  {form.vatInvoiceReceived ? (
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <Field error={fieldErrors.vatInvoiceNo} label="เลขที่ใบกำกับภาษี"><input className="w-full rounded border px-3 py-2 font-mono" placeholder="เช่น TI-001" value={form.vatInvoiceNo ?? ''} onChange={(event) => updateForm('vatInvoiceNo', event.target.value || null)} /></Field>
                      <Field error={fieldErrors.vatInvoiceDate} label="วันที่ใบกำกับภาษี"><input className="w-full rounded border px-3 py-2" type="date" value={form.vatInvoiceDate ?? ''} onChange={(event) => updateForm('vatInvoiceDate', event.target.value || null)} /></Field>
                    </div>
                  ) : <div className="mt-1 text-xs text-amber-700">ยังไม่ได้รับใบกำกับภาษีตัวจริง ต้องติดตามเพื่อใช้เครดิต VAT ซื้อ</div>}
                </div>
              ) : null}

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <Field error={fieldErrors.note ?? fieldErrors.notes} label="หมายเหตุ"><textarea className="w-full rounded border px-3 py-2" rows={2} value={form.note ?? form.notes ?? ''} onChange={(event) => {
                  const value = event.target.value || null
                  updateForm('note', value)
                  updateForm('notes', value)
                }} /></Field>
              </div>
            </div>
            <div className="flex justify-end gap-2 rounded-b-2xl border-t bg-white p-4">
              <button className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50" type="button" onClick={() => setShowForm(false)}>ยกเลิก</button>
              <button className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={() => void savePurchaseBill()}>{isSaving ? 'กำลังบันทึก...' : editingBillId ? 'บันทึกการแก้ไข' : 'บันทึกบิลรับซื้อ'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Segment({ current, label, onClick, value }: { current: string; label: string; onClick: (value: string) => void; value: string }) {
  const active = current === value
  return <button className={`rounded border px-3 py-1 text-xs font-medium ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`} type="button" onClick={() => onClick(value)}>{label}</button>
}

function TransactionKpi({ label, tone, value }: { label: string; tone: 'amber' | 'blue' | 'emerald' | 'red' | 'slate'; value: string }) {
  const className = {
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    slate: 'border-slate-200 bg-white text-slate-700',
  }[tone]
  return <div className={`rounded-xl border p-3 shadow-sm ${className}`}><div className="text-xs opacity-75">{label}</div><div className="mt-1 break-words text-xl font-bold">{value}</div></div>
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
    complete: 'เสร็จแล้ว',
    completed: 'เสร็จแล้ว',
    converted: 'เปิดบิลแล้ว',
    draft: 'Draft',
    open: 'เปิดอยู่',
    paid: 'จ่ายครบ',
    partial: 'บางส่วน',
    partially_paid: 'บางส่วน',
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
      <button className={`inline-flex w-full items-center gap-1 ${alignClass} rounded px-1 py-0.5 hover:bg-slate-200`} type="button" onClick={() => onSort(sortKey)}>
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

function Field({ children, className, error, label }: { children: ReactNode; className?: string; error?: string; label: string }) {
  return <label className={className}><span className="mb-1 block text-xs font-bold text-slate-700">{label}</span>{children}{error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}</label>
}

function SelectField({ className, error, hideCode = false, label, onChange, options, placeholder = 'เลือก', value }: { className?: string; error?: string; hideCode?: boolean; label: string; onChange: (value: string) => void; options: Option[]; placeholder?: string; value: string }) {
  return (
    <Field className={className} error={error} label={label}>
      <select className="w-full rounded border px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{!hideCode && option.code ? `${option.code} — ` : ''}{option.name}</option>)}
      </select>
    </Field>
  )
}

function SupplierSearchCombobox({
  className = '',
  error,
  options,
  value,
  onChange,
}: {
  className?: string
  error?: string
  options: Option[]
  value: string
  onChange: (supplierId: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedSupplier = useMemo(() => options.find((supplier) => supplier.id === value) ?? null, [options, value])
  const selectedLabel = selectedSupplier ? optionLabel(selectedSupplier) : ''
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(selectedLabel)

  useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const rows = normalizedQuery
      ? options.filter((supplier) => searchableOptionText(supplier).includes(normalizedQuery))
      : options
    return rows.slice(0, 80)
  }, [options, query])

  const selectSupplier = (supplier: Option) => {
    onChange(supplier.id)
    setQuery(optionLabel(supplier))
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className={`relative ${className}`}>
      <label className="mb-1 block text-xs font-bold text-slate-700" htmlFor="purchase-bill-supplier-search">ผู้ขาย *</label>
      <input
        ref={inputRef}
        aria-autocomplete="list"
        aria-controls="purchase-bill-supplier-options"
        aria-expanded={open}
        aria-invalid={Boolean(error)}
        className={`w-full rounded border px-3 py-2 outline-none focus:border-blue-600 ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
        id="purchase-bill-supplier-search"
        placeholder="ค้นหาชื่อหรือรหัสผู้ขาย"
        role="combobox"
        type="search"
        value={query}
        onBlur={() => {
          window.setTimeout(() => {
            const exactMatch = options.find((supplier) => optionLabel(supplier).toLowerCase() === query.trim().toLowerCase())
            if (exactMatch) {
              onChange(exactMatch.id)
              setQuery(optionLabel(exactMatch))
            } else if (selectedSupplier) {
              setQuery(optionLabel(selectedSupplier))
            }
            setOpen(false)
          }, 120)
        }}
        onChange={(event) => {
          const nextQuery = event.target.value
          setQuery(nextQuery)
          setOpen(true)
          if (value && nextQuery !== selectedLabel) onChange('')
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            return
          }
          if (event.key === 'Enter' && open && filteredOptions[0]) {
            event.preventDefault()
            selectSupplier(filteredOptions[0])
          }
        }}
      />
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
      {open ? (
        <div id="purchase-bill-supplier-options" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-xl" role="listbox">
          {filteredOptions.length > 0 ? filteredOptions.map((supplier) => (
            <button
              key={supplier.id}
              aria-selected={supplier.id === value}
              className={`block w-full px-3 py-2 text-left hover:bg-blue-50 ${supplier.id === value ? 'bg-blue-100 text-blue-800' : ''}`}
              role="option"
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
                selectSupplier(supplier)
              }}
            >
              <span className="block font-medium">{supplier.name}</span>
              <span className="block text-xs text-slate-500">{supplier.code ? `${supplier.code} · ` : ''}{supplier.id}</span>
            </button>
          )) : <div className="px-3 py-2 text-sm text-slate-500">ไม่พบผู้ขายที่ตรงกับคำค้นหา</div>}
        </div>
      ) : null}
    </div>
  )
}

function ProductSearchCombobox({
  inputId,
  options,
  value,
  onChange,
}: {
  inputId: string
  options: Option[]
  value: string
  onChange: (productId: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedProduct = useMemo(() => options.find((product) => product.id === value) ?? null, [options, value])
  const selectedLabel = selectedProduct ? optionLabel(selectedProduct) : ''
  const listId = `${inputId}-options`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(selectedLabel)

  useEffect(() => {
    setQuery(selectedLabel)
  }, [selectedLabel])

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const rows = normalizedQuery
      ? options.filter((product) => searchableOptionText(product).includes(normalizedQuery))
      : options
    return rows.slice(0, 80)
  }, [options, query])

  const selectProduct = (product: Option) => {
    onChange(product.id)
    setQuery(optionLabel(product))
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-[11px] font-semibold text-slate-500" htmlFor={inputId}>สินค้า *</label>
      <input
        ref={inputRef}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        className="w-full rounded border border-slate-300 px-2 py-2 outline-none focus:border-blue-600"
        id={inputId}
        placeholder="ค้นหารหัสหรือชื่อสินค้า"
        role="combobox"
        type="search"
        value={query}
        onBlur={() => {
          window.setTimeout(() => {
            const exactMatch = options.find((product) => optionLabel(product).toLowerCase() === query.trim().toLowerCase())
            if (exactMatch) {
              onChange(exactMatch.id)
              setQuery(optionLabel(exactMatch))
            } else if (selectedProduct) {
              setQuery(optionLabel(selectedProduct))
            } else {
              setQuery('')
            }
            setOpen(false)
          }, 120)
        }}
        onChange={(event) => {
          const nextQuery = event.target.value
          setQuery(nextQuery)
          setOpen(true)
          if (value && nextQuery !== selectedLabel) onChange('')
        }}
        onFocus={() => setOpen(true)}
      />
      {open ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded border border-slate-200 bg-white shadow-lg" id={listId}>
          {filteredOptions.length ? filteredOptions.map((product) => (
            <button key={product.id} className="block w-full px-3 py-2 text-left text-xs hover:bg-blue-50" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectProduct(product)}>
              <span className="font-medium text-slate-800">{optionLabel(product)}</span>
              {product.unit ? <span className="ml-2 text-slate-400">({product.unit})</span> : null}
            </button>
          )) : <div className="px-3 py-2 text-xs text-slate-500">ไม่พบสินค้า</div>}
        </div>
      ) : null}
    </div>
  )
}

function StepBadge({ children, tone }: { children: ReactNode; tone: 'amber' | 'blue' | 'emerald' | 'purple' }) {
  const className = {
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    purple: 'bg-purple-100 text-purple-700',
  }[tone]
  return <span className={`flex size-6 items-center justify-center rounded-full text-xs ${className}`}>{children}</span>
}

function SummaryLine({ label, tone, value }: { label: string; tone?: 'red'; value: string }) {
  return (
    <div className="flex justify-between border-t border-blue-200 py-1 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`font-mono ${tone === 'red' ? 'text-red-600' : 'text-slate-800'}`}>{value}</span>
    </div>
  )
}

function RadioCard({ active, label, note, onClick }: { active: boolean; label: string; note: string; onClick: () => void }) {
  return (
    <button className={`rounded-lg border-2 p-3 text-left transition ${active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'}`} type="button" onClick={onClick}>
      <div className="font-bold">{label}</div>
      <div className="text-xs text-slate-500">{note}</div>
    </button>
  )
}

function isStockIssueRow(row: BillRow | StockIssueRow): row is StockIssueRow {
  return 'totalEstAmount' in row
}
