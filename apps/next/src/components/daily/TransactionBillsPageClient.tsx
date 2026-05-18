'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { sanitizePhoneInput } from '@/lib/format'
import { purchaseBillFormSchema, type PurchaseBillFormValues } from '@/lib/purchase-bill'

type BillRow = {
  branchId?: string
  branchName?: string
  channelId?: string
  channelName?: string
  createdAt?: string
  createdBy?: string
  customerName?: string
  date: string
  docNo: string
  grossProfit?: number
  hasVat?: boolean
  id: string
  itemCount: number
  paidAmount?: number
  payableBalance?: number
  purchaseSource?: string
  receivableBalance?: number
  receivedAmount?: number
  refNo?: string
  status: string
  supplierId?: string
  supplierName?: string
  totalAmount?: number
  transactionMode?: string
  updatedAt?: string
  updatedBy?: string
  vatInvoiceNo?: string
  vatInvoiceReceived?: boolean
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
  warehouseName: string
}

type Option = {
  active?: boolean | null
  branch_id?: string | null
  code?: string | null
  id: string
  label?: string | null
  name: string
  supplier_id?: string | null
  unit?: string | null
}

type PurchasePayload = {
  branches: Option[]
  channels: Option[]
  poBuys: Option[]
  products: Option[]
  rows: BillRow[]
  salespersons: Option[]
  suppliers: Option[]
  totalAmount?: number
  totalRows?: number
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

type SortKey = 'date' | 'docNo' | 'itemCount' | 'name' | 'outstanding' | 'refNo' | 'status' | 'totalAmount' | 'transactionMode' | 'warehouse'
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

const initialPurchaseForm = (): PurchaseBillFormValues => ({
  branchId: null,
  channelId: null,
  contactPhone: null,
  date: todayDateInput(),
  discountTotal: 0,
  hasVat: false,
  items: [blankItem()],
  licensePlate: null,
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
  const [filterMode, setFilterMode] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [form, setForm] = useState<PurchaseBillFormValues>(initialPurchaseForm())
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [options, setOptions] = useState<Omit<PurchasePayload, 'rows'>>({ branches: [], channels: [], poBuys: [], products: [], salespersons: [], suppliers: [], warehouses: [] })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [rows, setRows] = useState<Array<BillRow | StockIssueRow>>([])
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalRows, setTotalRows] = useState(0)
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
    if (mode === 'purchase' && filterSource) params.set('filterSource', filterSource)
    return `${apiPath}?${params.toString()}`
  }, [apiPath, dateFrom, dateTo, filterMode, filterSource, mode, page, pageSize, search, sortDirection, sortKey])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      if (mode === 'purchase') {
        const payload = await dailyFetchJson<PurchasePayload>(requestPath)
        setRows(payload.rows)
        setTotalAmount(payload.totalAmount ?? 0)
        setTotalRows(payload.totalRows ?? payload.rows.length)
        setOptions({
          branches: payload.branches,
          channels: payload.channels,
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
  }, [dateFrom, dateTo, filterMode, filterSource, pageSize, search, sortDirection, sortKey])

  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = rows
  const total = totalAmount
  const title = mode === 'purchase' ? 'บิลรับซื้อ' : mode === 'sales' ? 'บิลขาย' : 'เบิกออกรอบิล'
  const activeBranches = options.branches.filter((option) => option.active !== false)
  const activeChannels = options.channels.filter((option) => option.active !== false)
  const activePoBuys = options.poBuys.filter((option) => option.active !== false && (!form.supplierId || option.supplier_id === form.supplierId))
  const activeProducts = options.products.filter((option) => option.active !== false)
  const activeSalespersons = options.salespersons.filter((option) => option.active !== false)
  const activeSuppliers = options.suppliers.filter((option) => option.active !== false)
  const activeWarehouses = options.warehouses.filter((option) => option.active !== false && (!form.branchId || option.branch_id === form.branchId))
  const formSubtotal = form.items.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0)
  const formTotalWeight = form.items.reduce((sum, item) => sum + item.qty, 0)
  const formAfterDiscount = Math.max(0, formSubtotal - form.discountTotal)
  const formVat = !form.hasVat || form.vatType === 'NONE' ? 0 : form.vatType === 'INCLUDE' ? formAfterDiscount * 7 / 107 : formAfterDiscount * 0.07
  const formTotal = form.hasVat && form.vatType === 'EXCLUDE' ? formAfterDiscount + formVat : formAfterDiscount

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setFilterMode('')
    setFilterSource('')
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
    setForm(initialPurchaseForm())
    setFieldErrors({})
    setError(null)
    setShowForm(true)
  }

  function updateForm<K extends keyof PurchaseBillFormValues>(key: K, value: PurchaseBillFormValues[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'branchId' ? { warehouseId: null } : {}),
      ...(key === 'hasVat' && value === false ? { vatType: 'NONE' } : {}),
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

  function applyQuickPo(value: string) {
    updateForm('poBuyId', value || null)
    if (!value) return

    setForm((current) => ({
      ...current,
      items: current.items.map((item, index) => index === 0 ? { ...item, poBuyId: value } : item),
      purchaseSource: current.purchaseSource === 'SPOT_BUY' ? 'PO_RECEIPT' : current.purchaseSource,
    }))
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
        body: JSON.stringify(parsed.data),
        method: 'POST',
      })
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
      if (filterSource) params.set('filterSource', filterSource)
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
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="space-y-2 rounded-xl bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[260px] flex-1 rounded-lg border px-3 py-2 text-sm" placeholder={mode === 'purchase' ? 'ค้นหาเลขบิล / เลขอ้างอิง / ชื่อ Supplier...' : 'ค้นหาเลขที่ / ชื่อ / สาขา / คลัง'} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="text-xs text-slate-500">วันที่:</label>
          <input className="rounded-lg border px-2 py-2 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <span className="text-slate-400">→</span>
          <input className="rounded-lg border px-2 py-2 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          {(search || dateFrom || dateTo || filterMode || filterSource) ? <button className="rounded bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={clearFilters}>✕ ล้าง Filter</button> : null}
          {mode === 'purchase' ? <button className="ml-auto rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={isExporting} type="button" onClick={() => void exportExcel()}>{isExporting ? 'กำลัง Export...' : `📥 Export Excel (${totalRows})`}</button> : null}
          {mode === 'purchase' ? <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700" type="button" onClick={openPurchaseForm}>+ บิลรับซื้อใหม่</button> : null}
        </div>
        {mode === 'purchase' ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">ประเภท:</span>
            <Segment value="" current={filterMode} label="ทั้งหมด" onClick={setFilterMode} />
            <Segment value="STOCK" current={filterMode} label="📦 STOCK" onClick={setFilterMode} />
            <Segment value="TRADING" current={filterMode} label="🔄 TRADING" onClick={setFilterMode} />
            <span className="mx-2 text-slate-300">|</span>
            <span className="text-xs text-slate-500">ที่มา:</span>
            <Segment value="" current={filterSource} label="ทั้งหมด" onClick={setFilterSource} />
            <Segment value="SPOT_BUY" current={filterSource} label="📦 SPOT BUY" onClick={setFilterSource} />
            <Segment value="PO_RECEIPT" current={filterSource} label="📋 PO_RECEIPT" onClick={setFilterSource} />
            <Segment value="MIXED" current={filterSource} label="🔀 ผสม" onClick={setFilterSource} />
            <span className="ml-auto text-xs text-slate-500">📊 พบ <b className="text-slate-700">{totalRows.toLocaleString('th-TH')}</b> บิล</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ · รวม <span className="font-semibold text-blue-700">{formatMoney(total)}</span></div>
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
              {mode === 'purchase' ? <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="เลขที่อ้างอิง" sortKey="refNo" onSort={changeSort} /> : null}
              <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="วันที่" sortKey="date" onSort={changeSort} />
              <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label={mode === 'purchase' ? 'ผู้ขาย' : 'ลูกค้า'} sortKey="name" onSort={changeSort} />
              <SortHeader activeKey={sortKey} align="left" direction={sortDirection} label="สาขา / คลัง" sortKey="warehouse" onSort={changeSort} />
              {mode === 'purchase' ? <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="ประเภท" sortKey="transactionMode" onSort={changeSort} /> : null}
              <SortHeader activeKey={sortKey} align="center" direction={sortDirection} label="สถานะ" sortKey="status" onSort={changeSort} />
              <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="รายการ" sortKey="itemCount" onSort={changeSort} />
              <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ยอดรวม" sortKey="totalAmount" onSort={changeSort} />
              {mode !== 'stock-issue' ? <SortHeader activeKey={sortKey} align="right" direction={sortDirection} label="ค้างชำระ" sortKey="outstanding" onSort={changeSort} /> : null}
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={mode === 'purchase' ? 10 : mode === 'stock-issue' ? 7 : 8}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && pageRows.map((row) => (
              <tr key={row.id} className={`border-t hover:bg-slate-50 ${mode === 'purchase' && !isStockIssueRow(row) ? 'cursor-pointer' : ''}`} onClick={() => openRow(row)}>
                <td className="p-2 font-mono text-xs">{row.docNo}</td>
                {mode === 'purchase' && !isStockIssueRow(row) ? <td className="p-2 font-mono text-xs text-slate-600">{row.refNo || '-'}</td> : null}
                <td className="p-2">{row.date}</td>
                <td className="p-2">{'supplierName' in row ? row.supplierName : row.customerName}</td>
                <td className="p-2">{formatBranchWarehouse(row)}</td>
                {mode === 'purchase' && !isStockIssueRow(row) ? <td className="p-2 text-center"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{row.transactionMode ?? '-'}</span></td> : null}
                <td className="p-2 text-center"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{row.status}</span></td>
                <td className="p-2 text-right">{row.itemCount}</td>
                <td className="p-2 text-right font-semibold">{formatMoney(isStockIssueRow(row) ? row.totalEstAmount : row.totalAmount ?? 0)}</td>
                {mode !== 'stock-issue' && !isStockIssueRow(row) ? <td className="p-2 text-right text-red-700">{formatMoney(mode === 'purchase' ? row.payableBalance ?? 0 : row.receivableBalance ?? 0)}</td> : null}
              </tr>
            ))}
            {!isLoading && totalRows === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={mode === 'purchase' ? 10 : mode === 'stock-issue' ? 7 : 8}>ยังไม่มีรายการ</td></tr> : null}
          </tbody>
        </table>
      </div>

      {showForm && mode === 'purchase' ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
          <div className="mx-auto my-4 flex max-h-[94vh] max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 text-white">
              <div>
                <h3 className="text-xl font-bold">📥 สร้างบิลรับซื้อใหม่</h3>
                <p className="mt-1 text-xs opacity-80">บันทึก header และรายการสินค้าในบิลรับซื้อ</p>
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
                <div className="mt-3 rounded-lg border-2 border-indigo-200 bg-indigo-50 p-3 text-xs text-slate-700">
                  <div className="font-bold text-indigo-700">ผสม Spot + ตัด PO ในบิลเดียวได้</div>
                  <div className="mt-1">เลือก PO ที่หัวบิลเพื่อช่วย set รายการแรก หรือเลือก PO แยกรายการในตารางด้านล่างได้ เว้นว่าง = Spot Buy</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="whitespace-nowrap text-slate-600">Quick Load PO:</span>
                    <select className="min-w-[240px] flex-1 rounded border px-2 py-1" value={form.poBuyId ?? ''} onChange={(event) => applyQuickPo(event.target.value)}>
                      <option value="">-- ไม่ใช้ Quick Load --</option>
                      {activePoBuys.map((po) => <option key={po.id} value={po.id}>{po.label ?? po.name}</option>)}
                    </select>
                    <span className="text-slate-500">เลือกแล้วจะผูก PO ให้รายการแรกก่อน</span>
                  </div>
                  {fieldErrors.poBuyId ? <div className="mt-1 text-xs text-red-600">{fieldErrors.poBuyId}</div> : null}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="blue">2</StepBadge>ข้อมูลบิล</h4>
                <div className="grid gap-3 md:grid-cols-3">
                <Field error={fieldErrors.date} label="วันที่ *"><input className="w-full rounded border px-3 py-2" type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} /></Field>
                <Field label="เลขที่บิล"><div className="rounded border bg-slate-100 px-3 py-2 font-mono font-bold text-slate-500">ระบบจะออกเลขให้ตอนบันทึก</div></Field>
                <Field error={fieldErrors.refNo} label="เลขที่อ้างอิง (บิล Supplier)"><input className="w-full rounded border px-3 py-2 font-mono" placeholder="เช่น INV-12345" value={form.refNo ?? ''} onChange={(event) => updateForm('refNo', event.target.value || null)} /></Field>
                <SelectField className="md:col-span-3" error={fieldErrors.supplierId} label="ผู้ขาย *" options={activeSuppliers} value={form.supplierId} onChange={(value) => updateForm('supplierId', value)} />
                <SelectField error={fieldErrors.branchId} label="สาขา" options={activeBranches} value={form.branchId ?? ''} onChange={(value) => updateForm('branchId', value || null)} />
                <SelectField error={fieldErrors.warehouseId} label="คลัง" options={activeWarehouses} value={form.warehouseId ?? ''} onChange={(value) => updateForm('warehouseId', value || null)} />
                <SelectField error={fieldErrors.channelId} label="ช่องทางซื้อ" options={activeChannels} value={form.channelId ?? ''} onChange={(value) => updateForm('channelId', value || null)} />
                <Field error={fieldErrors.licensePlate} label="ทะเบียนรถ"><input className="w-full rounded border px-3 py-2 uppercase" placeholder="เช่น 1กข-1234 / 70-1234" value={form.licensePlate ?? ''} onChange={(event) => updateForm('licensePlate', event.target.value.toUpperCase() || null)} /></Field>
                <Field error={fieldErrors.contactPhone} label="เบอร์โทร"><input className="w-full rounded border px-3 py-2" inputMode="tel" placeholder="085-555-5555" value={form.contactPhone ?? ''} onChange={(event) => updateForm('contactPhone', sanitizePhoneInput(event.target.value) || null)} /></Field>
                <SelectField error={fieldErrors.salesId} label="เซลที่ดูแล" options={activeSalespersons} placeholder="ลูกค้าบริษัท / ไม่มีเซล" value={form.salesId ?? ''} onChange={(value) => updateForm('salesId', value || null)} />
                <Field label="ที่มา"><select className="w-full rounded border px-3 py-2" value={form.purchaseSource} onChange={(event) => updateForm('purchaseSource', event.target.value as PurchaseBillFormValues['purchaseSource'])}><option value="SPOT_BUY">SPOT BUY</option><option value="PO_RECEIPT">PO RECEIPT</option><option value="MIXED">MIXED</option></select></Field>
                <Field label="VAT"><select className="w-full rounded border px-3 py-2" value={form.vatType} onChange={(event) => updateForm('vatType', event.target.value as PurchaseBillFormValues['vatType'])}><option value="NONE">No VAT</option><option value="EXCLUDE">VAT 7% แยกนอก</option><option value="INCLUDE">VAT รวมใน</option></select></Field>
                <label className="flex items-center gap-2 pt-6 text-sm text-slate-700"><input checked={form.hasVat} className="size-4" type="checkbox" onChange={(event) => updateForm('hasVat', event.target.checked)} /> มี VAT</label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="emerald">3</StepBadge>รายการสินค้า ({form.items.length})</h4>
                  <button className="rounded bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700" type="button" onClick={() => setForm((current) => ({ ...current, items: [...current.items, blankItem()] }))}>+ เพิ่มรายการ</button>
                </div>
                {fieldErrors.items ? <div className="mb-2 text-xs text-red-600">{fieldErrors.items}</div> : null}
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[1120px] text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="p-2 text-left">สินค้า *</th>
                        <th className="w-40 p-2 text-left text-indigo-700">PO</th>
                        <th className="w-28 p-2 text-right">Gross</th>
                        <th className="w-28 p-2 text-right text-amber-700">หัก</th>
                        <th className="w-28 p-2 text-right text-emerald-700">สุทธิ</th>
                        <th className="w-28 p-2 text-right">ราคา/กก.</th>
                        {form.salesId ? <th className="w-28 p-2 text-right text-purple-700">ราคาหน้าใบ</th> : null}
                        <th className="w-28 p-2 text-right">ส่วนลด</th>
                        <th className="w-32 p-2 text-right">ยอดรวม</th>
                        <th className="w-16 p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, index) => (
                        <tr key={index} className="border-t align-top hover:bg-blue-50/30">
                          <td className="p-2">
                            <select className="w-full rounded border px-2 py-2" value={item.productId} onChange={(event) => updateItem(index, 'productId', event.target.value)}>
                              <option value="">เลือกสินค้า</option>
                              {activeProducts.map((product) => <option key={product.id} value={product.id}>{product.code ? `${product.code} — ` : ''}{product.name}{product.unit ? ` (${product.unit})` : ''}</option>)}
                            </select>
                            <input className="mt-1.5 w-full rounded border bg-yellow-50 px-2 py-1 text-xs" placeholder="ชื่อสำหรับโชว์ในบิล (ว่าง = ใช้ชื่อ Master)" value={item.displayName ?? ''} onChange={(event) => updateItem(index, 'displayName', event.target.value || null)} />
                          </td>
                          <td className="p-2">
                            <select className="w-full rounded border bg-blue-50 px-2 py-2 text-xs" value={item.poBuyId ?? ''} onChange={(event) => updateItem(index, 'poBuyId', event.target.value || null)}>
                              <option value="">Spot Buy</option>
                              {activePoBuys.map((po) => <option key={po.id} value={po.id}>{po.label ?? po.name}</option>)}
                            </select>
                          </td>
                          <td className="p-2"><input className="w-full rounded border bg-slate-50 px-2 py-2 text-right font-mono" min="0" step="0.01" type="number" value={item.grossWeight || ''} onChange={(event) => updateItemWeights(index, 'grossWeight', Number(event.target.value || 0))} /></td>
                          <td className="p-2"><input className="w-full rounded border bg-amber-50 px-2 py-2 text-right font-mono" min="0" step="0.01" type="number" value={item.deductWeight || ''} onChange={(event) => updateItemWeights(index, 'deductWeight', Number(event.target.value || 0))} /></td>
                          <td className="p-2"><input className="w-full rounded border bg-emerald-50 px-2 py-2 text-right font-mono font-bold text-emerald-700" min="0" step="0.01" type="number" value={item.qty || ''} onChange={(event) => updateItem(index, 'qty', Number(event.target.value || 0))} /></td>
                          <td className="p-2"><input className="w-full rounded border px-2 py-2 text-right font-mono" min="0" step="0.01" type="number" value={item.price || ''} onChange={(event) => updateItem(index, 'price', Number(event.target.value || 0))} /></td>
                          {form.salesId ? <td className="p-2"><input className="w-full rounded border bg-purple-50 px-2 py-2 text-right font-mono" min="0" step="0.01" type="number" value={item.salesPrice || ''} onChange={(event) => updateItem(index, 'salesPrice', Number(event.target.value || 0))} /></td> : null}
                          <td className="p-2"><input className="w-full rounded border px-2 py-2 text-right font-mono" min="0" step="0.01" type="number" value={item.discount || ''} onChange={(event) => updateItem(index, 'discount', Number(event.target.value || 0))} /></td>
                          <td className="p-2 text-right font-mono font-bold text-blue-700">{formatMoney(Math.max(0, item.qty * item.price - item.discount))}</td>
                          <td className="p-2"><button className="rounded px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-40" disabled={form.items.length <= 1} type="button" onClick={() => removeItem(index)}>ลบ</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-emerald-50 font-bold">
                      <tr>
                        <td className="p-2 text-right" colSpan={2}>รวม</td>
                        <td className="p-2 text-right font-mono">{formatMoney(form.items.reduce((sum, item) => sum + item.grossWeight, 0))}</td>
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
                {form.salesId ? <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-3 text-sm text-purple-700">เซลที่ดูแลบิลนี้: <b>{activeSalespersons.find((sales) => sales.id === form.salesId)?.name ?? '-'}</b></div> : null}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h4 className="mb-3 flex items-center gap-2 font-bold text-slate-700"><StepBadge tone="purple">4</StepBadge>VAT & ยอดรวม</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 ${form.hasVat ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                      <input checked={form.hasVat} className="size-5" type="checkbox" onChange={(event) => updateForm('hasVat', event.target.checked)} />
                      <span className="font-bold text-slate-700">มี VAT 7%</span>
                    </label>
                    <Field error={fieldErrors.discountTotal} label="ส่วนลดท้ายบิล (บาท)"><input className="w-full rounded border px-3 py-2 text-right font-mono" min="0" step="0.01" type="number" value={form.discountTotal || ''} onChange={(event) => updateForm('discountTotal', Number(event.target.value || 0))} /></Field>
                  </div>
                  <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
                    <div className="mb-2 flex justify-between rounded border border-emerald-300 bg-emerald-100 p-2 font-bold text-emerald-800"><span>น้ำหนักรวมที่ซื้อ</span><span className="font-mono">{formatMoney(formTotalWeight)} กก.</span></div>
                    <SummaryLine label="ยอดรวมรายการ" value={formatMoney(formSubtotal)} />
                    {form.discountTotal > 0 ? <SummaryLine label="หักส่วนลด" tone="red" value={`-${formatMoney(form.discountTotal)}`} /> : null}
                    <SummaryLine label="หลังส่วนลด" value={formatMoney(formAfterDiscount)} />
                    {form.hasVat ? <SummaryLine label="VAT 7%" value={formatMoney(formVat)} /> : null}
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
              <button className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60" disabled={isSaving} type="button" onClick={() => void savePurchaseBill()}>{isSaving ? 'กำลังบันทึก...' : 'บันทึกบิลรับซื้อ'}</button>
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

function SelectField({ className, error, label, onChange, options, placeholder = 'เลือก', value }: { className?: string; error?: string; label: string; onChange: (value: string) => void; options: Option[]; placeholder?: string; value: string }) {
  return (
    <Field className={className} error={error} label={label}>
      <select className="w-full rounded border px-3 py-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} — ` : ''}{option.name}</option>)}
      </select>
    </Field>
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
