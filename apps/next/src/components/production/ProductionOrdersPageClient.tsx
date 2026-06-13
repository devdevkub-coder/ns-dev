'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type Category = { availableForSale: boolean; code: string; name: string; stockEffect: string }
type ProductionMovementRow = {
  categoryCode?: string
  date: string
  docNo: string
  lotNo: string
  outputType?: string
  productCode: string
  productName: string
  qty: number
  status: string
  stockStatus?: string
  totalCost: number
  unitCost: number
  warehouseCode: string
  warehouseName: string
}
type ProductionOrderRow = {
  branchName: string
  closedAt: string | null
  date: string
  docNo: string
  id: string
  inputCost: number
  inputCount: number
  inputQty: number
  inputs: ProductionMovementRow[]
  notes: string
  outputCategories: Array<{ code: string; name: string }>
  outputCount: number
  outputQty: number
  outputValue: number
  outputs: ProductionMovementRow[]
  productCode: string
  productId: string
  productName: string
  qtyPlanned: number
  status: string
  variance: number
  warehouseName: string
}
type ProductionOrdersPayload = {
  categories: Category[]
  page: number
  pageSize: number
  rows: ProductionOrderRow[]
  summary: { inputCost: number; outputValue: number; qtyPlanned: number; total: number; totalPages: number; variance: number }
}
type Option = { code: string; id: string; name: string }
type WarehouseOption = Option & { branchCode: string | null; type: string | null }
type ProductionOrderOptions = {
  branches: Option[]
  machines: Option[]
  productionLines: Option[]
  productionTypes: string[]
  products: Option[]
  warehouses: WarehouseOption[]
}
type WipPayload = { consumedWipQty: number; docNo: string; inputCost: number; inputQty: number; outputQty: number; wipQty: number }
type ProductStockPayload = {
  branchCode: string
  productCode: string
  productName: string
  rows: Array<{ avgCost: number; qty: number; status: string; value: number }>
  warehouseCode: string
}

const emptyOptions: ProductionOrderOptions = { branches: [], machines: [], productionLines: [], productionTypes: [], products: [], warehouses: [] }
const pageSizeOptions = [10, 25, 50, 100]
const statusOptions = ['', 'Open', 'In Production', 'Partially Completed', 'Completed', 'Cancelled']
const sortOptions = [
  { label: 'วันที่', value: 'date' },
  { label: 'เลขที่', value: 'docNo' },
  { label: 'สถานะ', value: 'status' },
  { label: 'ต้นทุนเข้า', value: 'inputCost' },
  { label: 'มูลค่าผลผลิต', value: 'outputValue' },
]

export function ProductionOrdersPageClient() {
  const [data, setData] = useState<ProductionOrdersPayload | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [modalMode, setModalMode] = useState<'create' | 'detail' | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [selectedRow, setSelectedRow] = useState<ProductionOrderRow | null>(null)
  const [sort, setSort] = useState('date')
  const [status, setStatus] = useState('')
  const latestLoadRequestRef = useRef(0)

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ direction, page: String(page), pageSize: String(pageSize), sort })
      if (search.trim()) params.set('search', search.trim())
      if (status) params.set('status', status)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const payload = await dailyFetchJson<ProductionOrdersPayload>(`/api/production/orders?${params.toString()}`)
      if (requestId !== latestLoadRequestRef.current) return
      setData(payload)
    } catch (caught) {
      if (requestId !== latestLoadRequestRef.current) return
      setError(caught instanceof Error ? caught.message : 'โหลดใบสั่งผลิตไม่ได้')
    } finally {
      if (requestId !== latestLoadRequestRef.current) return
      setIsLoading(false)
    }
  }, [dateFrom, dateTo, direction, page, pageSize, search, sort, status])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const currentRows = useMemo(() => data?.rows ?? [], [data?.rows])
  const totalPages = data?.summary.totalPages ?? 1

  function clearFilters() {
    setSearch('')
    setStatus('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  function setPeriod(period: 'today' | 'week' | 'month' | '') {
    if (!period) {
      setDateFrom('')
      setDateTo('')
      setPage(1)
      return
    }
    const today = todayDateInput()
    const start = new Date(`${today}T00:00:00`)
    if (period === 'week') start.setDate(start.getDate() - 6)
    if (period === 'month') start.setDate(1)
    setDateFrom(start.toISOString().slice(0, 10))
    setDateTo(today)
    setPage(1)
  }

  function closeModal(refresh = false) {
    setModalMode(null)
    setSelectedRow(null)
    if (refresh) void loadData()
  }

  async function refreshSelectedOrder(docNo: string) {
    const params = new URLSearchParams({ pageSize: '10', search: docNo })
    const payload = await dailyFetchJson<ProductionOrdersPayload>(`/api/production/orders?${params.toString()}`)
    const refreshedRow = payload.rows.find((candidate) => candidate.docNo === docNo) ?? null
    if (refreshedRow) setSelectedRow(refreshedRow)
    await loadData()
    return refreshedRow
  }

  return (
    <section className="space-y-4">
      {error ? <Alert tone="red" title="โหลดข้อมูลใบสั่งผลิตไม่ได้" text={error} /> : null}

      <div className="rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[260px] flex-1 rounded-md border px-3 py-2 text-sm" placeholder="ค้นหาเลขใบสั่งผลิต / สินค้า / หมายเหตุ..." type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
          <label className="text-xs text-slate-500">วันที่:</label>
          <DatePickerInput className="w-[130px]" value={dateFrom} onChange={(value) => { setDateFrom(value); setPage(1) }} />
          <span className="text-slate-400">→</span>
          <DatePickerInput className="w-[130px]" value={dateTo} onChange={(value) => { setDateTo(value); setPage(1) }} />
          <select className="rounded-md border px-3 py-2 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}>
            {statusOptions.map((option) => <option key={option || 'all'} value={option}>{option || 'ทุกสถานะ'}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1) }}>
            {sortOptions.map((option) => <option key={option.value} value={option.value}>เรียง: {option.label}</option>)}
          </select>
          <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => setDirection((value) => value === 'asc' ? 'desc' : 'asc')}>{direction === 'asc' ? 'น้อยไปมาก' : 'มากไปน้อย'}</button>
          {(search || dateFrom || dateTo || status) ? <button className="rounded-md bg-slate-100 px-3 py-2 text-xs hover:bg-slate-200" type="button" onClick={clearFilters}>ล้าง</button> : null}
          <button className="ml-auto rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => setModalMode('create')}>+ ใบสั่งผลิตใหม่</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">ช่วง:</span>
          <button className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium hover:bg-slate-50" type="button" onClick={() => setPeriod('')}>ทั้งหมด</button>
          <button className="rounded-md border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50" type="button" onClick={() => setPeriod('today')}>วันนี้</button>
          <button className="rounded-md border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50" type="button" onClick={() => setPeriod('week')}>7 วัน</button>
          <button className="rounded-md border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50" type="button" onClick={() => setPeriod('month')}>เดือนนี้</button>
          <span className="ml-auto text-xs text-slate-500">พบ <b className="text-slate-700">{data?.summary.total ?? 0}</b> ใบ</span>
        </div>
      </div>

      {isLoading ? <div className="rounded-md bg-white p-10 text-center text-slate-500 shadow">กำลังโหลดข้อมูล</div> : null}
      {!isLoading && currentRows.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {currentRows.map((row) => <OrderCard key={row.id} row={row} onOpen={() => { setSelectedRow(row); setModalMode('detail') }} />)}
        </div>
      ) : null}
      {!isLoading && currentRows.length === 0 ? (
        <div className="rounded-md bg-white p-12 text-center text-slate-400 shadow">
          <div className="mb-2 text-3xl font-semibold">ใบสั่งผลิต</div>
          <div>ยังไม่มีใบสั่งผลิต</div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div>รวมทั้งหมด <span className="font-semibold text-slate-900">{data?.summary.total ?? 0}</span> รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-md border border-slate-300 px-2 py-1" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}>
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </select>
          <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={page <= 1} type="button" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</button>
          <span className="px-1">หน้า {data?.page ?? page} / {totalPages}</span>
          <button className="rounded-md border border-slate-300 px-3 py-1 disabled:opacity-50" disabled={page >= totalPages} type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</button>
        </div>
      </div>

      {modalMode ? <ProductionOrderModal mode={modalMode} row={selectedRow} onClose={closeModal} onRefreshRow={refreshSelectedOrder} /> : null}
    </section>
  )
}

function OrderCard({ onOpen, row }: { onOpen: () => void; row: ProductionOrderRow }) {
  const yieldPct = row.inputQty > 0 ? (row.outputQty / row.inputQty) * 100 : 0
  const wipQty = Math.max(0, row.inputQty - row.outputQty)
  return (
    <div className={`relative cursor-pointer overflow-hidden rounded-md border-2 p-4 shadow-md transition hover:shadow-xl ${cardClass(row.status)}`} onClick={onOpen}>
      <div className="absolute right-2 top-2"><StatusBadge status={row.status} /></div>
      <div className="mb-1 font-mono text-xs text-slate-400">{row.docNo}</div>
      <div className="mb-3 text-xs text-slate-500">{formatDateDisplay(row.date)} · {row.branchName}</div>
      <div className="mb-3 rounded-md border border-slate-200 bg-white/80 p-3">
        <div className="mb-1 text-xs text-slate-500">สินค้าที่ผลิต</div>
        <div className="text-base font-bold leading-tight text-amber-700">{row.productName || 'ยังไม่ได้กำหนดสินค้า'}</div>
        <div className="mt-1 text-xs text-slate-500">{row.productCode || row.productId || '-'} · {row.warehouseName}</div>
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        <MiniMetric label="เบิก" tone="red" value={row.inputQty} />
        <MiniMetric label="WIP" tone="amber" value={wipQty} />
        <MiniMetric label="ผลิต" tone="emerald" value={row.outputQty} />
      </div>
      {row.inputQty > 0 ? (
        <div className="mb-2">
          <div className="mb-0.5 flex justify-between text-xs"><span className="text-slate-500">Yield</span><span className={`font-bold ${yieldPct >= 90 ? 'text-emerald-700' : yieldPct >= 70 ? 'text-blue-700' : 'text-amber-700'}`}>{yieldPct.toFixed(1)}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-500" style={{ width: `${Math.min(100, yieldPct)}%` }} /></div>
        </div>
      ) : null}
      <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
        <div className="text-xs"><span className="text-slate-500">ต้นทุน:</span><b className="ml-1 text-slate-700">{formatMoney(row.inputCost)}</b></div>
        <button className="rounded-md bg-blue-600 px-3 py-1 text-xs font-bold text-white" type="button">เปิด</button>
      </div>
    </div>
  )
}

function ProductionOrderModal({ mode, onClose, onRefreshRow, row }: { mode: 'create' | 'detail'; onClose: (refresh?: boolean) => void; onRefreshRow: (docNo: string) => Promise<ProductionOrderRow | null>; row: ProductionOrderRow | null }) {
  const isCreate = mode === 'create'
  const [options, setOptions] = useState<ProductionOrderOptions>(emptyOptions)
  const [tab, setTab] = useState<'header' | 'input' | 'output'>('header')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isStockPreviewLoading, setIsStockPreviewLoading] = useState(false)
  const [productStock, setProductStock] = useState<ProductStockPayload | null>(null)
  const [productStockError, setProductStockError] = useState<string | null>(null)
  const [wip, setWip] = useState<WipPayload | null>(null)
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({})
  const [createForm, setCreateForm] = useState({
    branchCode: '',
    date: todayDateInput(),
    destinationWarehouseCode: '',
    machineCode: '',
    notes: '',
    productionLineCode: '',
    productionType: '',
    shift: 'เช้า',
    sourceWarehouseCode: '',
    targetProductCode: '',
    wipWarehouseCode: '',
  })
  const [inputForm, setInputForm] = useState({ date: todayDateInput(), lotNo: '', netQty: '', notes: '', productCode: '', sourceWarehouseCode: '', stockStatus: 'RM' })
  const [outputForm, setOutputForm] = useState({ categoryCode: 'FG', completeOrder: false, date: todayDateInput(), destinationWarehouseCode: '', lossQty: '', lotNo: '', netQty: '', notes: '', productCode: row?.productCode ?? '' })
  const inputNetQtyRef = useRef<HTMLInputElement | null>(null)
  const outputNetQtyRef = useRef<HTMLInputElement | null>(null)
  const outputLossQtyRef = useRef<HTMLInputElement | null>(null)

  const branchWarehouses = useMemo(() => {
    const branchCode = isCreate ? createForm.branchCode : null
    return branchCode ? options.warehouses.filter((warehouse) => warehouse.branchCode === branchCode) : options.warehouses
  }, [createForm.branchCode, isCreate, options.warehouses])
  const branchWipWarehouses = useMemo(() => createForm.branchCode ? branchWarehouses.filter((warehouse) => warehouse.type?.toUpperCase() === 'WIP') : [], [branchWarehouses, createForm.branchCode])
  const isWipWarehouseLocked = isCreate && branchWipWarehouses.length === 1
  const rowWipQty = wip?.wipQty ?? Math.max(0, (row?.inputQty ?? 0) - (row?.outputQty ?? 0))
  const canWrite = row ? ['Open', 'In Production', 'Partially Completed'].includes(row.status) : false
  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => options.products.map((product) => ({
    description: `รหัส ${product.code}`,
    id: product.code,
    label: `${product.code} - ${product.name}`,
    searchText: `${product.code} ${product.name}`,
  })), [options.products])
  const selectedDestinationWarehouse = useMemo(() => options.warehouses.find((warehouse) => warehouse.code === createForm.destinationWarehouseCode) ?? null, [createForm.destinationWarehouseCode, options.warehouses])

  useEffect(() => {
    let cancelled = false
    async function loadOptions() {
      try {
        const payload = await dailyFetchJson<ProductionOrderOptions>('/api/production/orders/options')
        if (cancelled) return
        setOptions(payload)
        setInputForm((current) => ({ ...current, productCode: current.productCode || payload.products[0]?.code || '', sourceWarehouseCode: current.sourceWarehouseCode || payload.warehouses[0]?.code || '' }))
        setOutputForm((current) => ({ ...current, destinationWarehouseCode: current.destinationWarehouseCode || payload.warehouses[0]?.code || '', productCode: current.productCode || payload.products[0]?.code || '' }))
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'โหลดตัวเลือกไม่ได้')
      }
    }
    void loadOptions()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!row) return
    const currentDocNo = row.docNo
    let cancelled = false
    async function loadWip() {
      try {
        const payload = await dailyFetchJson<WipPayload>(`/api/production/orders/${encodeURIComponent(currentDocNo)}/wip`)
        if (!cancelled) setWip(payload)
      } catch {
        if (!cancelled) setWip(null)
      }
    }
    void loadWip()
    return () => { cancelled = true }
  }, [row])

  useEffect(() => {
    if (!isCreate || !createForm.branchCode) return
    if (branchWipWarehouses.length === 1) {
      const lockedWipWarehouseCode = branchWipWarehouses[0]?.code ?? ''
      if (createForm.wipWarehouseCode !== lockedWipWarehouseCode) {
        setCreateForm((form) => ({ ...form, wipWarehouseCode: lockedWipWarehouseCode }))
        setCreateErrors((current) => {
          if (!current.wipWarehouseCode) return current
          const next = { ...current }
          delete next.wipWarehouseCode
          return next
        })
      }
      return
    }
    if (createForm.wipWarehouseCode && !branchWipWarehouses.some((warehouse) => warehouse.code === createForm.wipWarehouseCode)) {
      setCreateForm((form) => ({ ...form, wipWarehouseCode: '' }))
    }
  }, [branchWipWarehouses, createForm.branchCode, createForm.wipWarehouseCode, isCreate])

  useEffect(() => {
    if (!isCreate) return
    if (!createForm.branchCode || !createForm.targetProductCode || !createForm.destinationWarehouseCode) {
      setProductStock(null)
      setProductStockError(null)
      setIsStockPreviewLoading(false)
      return
    }
    let cancelled = false
    async function loadProductStock() {
      setIsStockPreviewLoading(true)
      setProductStockError(null)
      try {
        const params = new URLSearchParams({
          branchCode: createForm.branchCode,
          productCode: createForm.targetProductCode,
          warehouseCode: createForm.destinationWarehouseCode,
        })
        const payload = await dailyFetchJson<ProductStockPayload>(`/api/production/orders/product-stock?${params.toString()}`)
        if (!cancelled) setProductStock(payload)
      } catch (caught) {
        if (cancelled) return
        setProductStock(null)
        setProductStockError(caught instanceof Error ? caught.message : 'โหลด stock สินค้าที่ผลิตไม่ได้')
      } finally {
        if (!cancelled) setIsStockPreviewLoading(false)
      }
    }
    void loadProductStock()
    return () => { cancelled = true }
  }, [createForm.branchCode, createForm.destinationWarehouseCode, createForm.targetProductCode, isCreate])

  async function submitCreate() {
    if (!validateCreateForm()) return
    await runAction(async () => {
      await dailyFetchJson('/api/production/orders', {
        body: JSON.stringify({
          branchCode: createForm.branchCode,
          date: createForm.date,
          destinationWarehouseCode: createForm.destinationWarehouseCode,
          ...(createForm.machineCode.trim() ? { machineCode: createForm.machineCode } : {}),
          ...(createForm.notes.trim() ? { notes: createForm.notes.trim() } : {}),
          ...(createForm.productionLineCode.trim() ? { productionLineCode: createForm.productionLineCode } : {}),
          productionType: createForm.productionType,
          ...(createForm.shift.trim() ? { shift: createForm.shift.trim() } : {}),
          sourceWarehouseCode: createForm.sourceWarehouseCode,
          targetProductCode: createForm.targetProductCode,
          wipWarehouseCode: createForm.wipWarehouseCode,
        }),
        method: 'POST',
      })
      onClose(true)
    })
  }

  function updateCreateForm(field: keyof typeof createForm, value: string) {
    setCreateForm((form) => ({ ...form, [field]: value }))
    setCreateErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function updateCreateBranch(branchCode: string) {
    setCreateForm((form) => ({
      ...form,
      branchCode,
      destinationWarehouseCode: '',
      sourceWarehouseCode: '',
      wipWarehouseCode: '',
    }))
    setCreateErrors((current) => {
      const next = { ...current }
      delete next.branchCode
      delete next.destinationWarehouseCode
      delete next.sourceWarehouseCode
      delete next.wipWarehouseCode
      return next
    })
  }

  function validateCreateForm() {
    const requiredFields: Array<[keyof typeof createForm, string]> = [
      ['date', 'กรุณาระบุวันที่'],
      ['branchCode', 'กรุณาเลือกสาขา'],
      ['productionType', 'กรุณาเลือกประเภทการผลิต'],
      ['targetProductCode', 'กรุณาเลือกสินค้าที่ผลิต'],
      ['sourceWarehouseCode', 'กรุณาเลือกคลังต้นทาง'],
      ['wipWarehouseCode', 'กรุณาเลือกคลัง WIP'],
      ['destinationWarehouseCode', 'กรุณาเลือกคลังรับผลผลิต'],
    ]
    const nextErrors: Record<string, string> = {}
    for (const [field, message] of requiredFields) {
      if (!createForm[field].trim()) nextErrors[field] = message
    }
    if (createForm.branchCode) {
      if (branchWipWarehouses.length === 0) {
        nextErrors.wipWarehouseCode = 'สาขานี้ยังไม่ได้ตั้งค่าคลัง WIP'
      } else if (createForm.wipWarehouseCode && !branchWipWarehouses.some((warehouse) => warehouse.code === createForm.wipWarehouseCode)) {
        nextErrors.wipWarehouseCode = 'กรุณาเลือกคลัง WIP ของสาขานี้'
      }
    }
    setCreateErrors(nextErrors)
    if (Object.keys(nextErrors).length === 0) return true
    setError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ')
    return false
  }

  async function submitInput(formElement?: HTMLFormElement) {
    if (!row) return
    const netQtyText = readFormValue(formElement, 'production-input-net-qty') || inputNetQtyRef.current?.value.trim() || inputForm.netQty
    const netQty = Number(netQtyText)
    const productCode = getComboboxCode(formElement, 'production-input-product', inputForm.productCode)
    const sourceWarehouseCode = readFormValue(formElement, 'production-input-source-warehouse') || inputForm.sourceWarehouseCode
    const stockStatus = readFormValue(formElement, 'production-input-stock-status') || inputForm.stockStatus
    if (!productCode || !sourceWarehouseCode || !stockStatus || !Number.isFinite(netQty) || netQty <= 0) {
      setError('กรุณาเลือกสินค้า คลังต้นทาง สถานะสต๊อก และระบุ Net (กก.) มากกว่า 0')
      return
    }
    await runAction(async () => {
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}/inputs`, {
        body: JSON.stringify({ date: inputForm.date, lines: [{ lotNo: inputForm.lotNo || undefined, netQty, productCode, sourceWarehouseCode, stockStatus }], notes: inputForm.notes || undefined }),
        method: 'POST',
      })
      await onRefreshRow(row.docNo)
      setInputForm((form) => ({ ...form, lotNo: '', netQty: '', notes: '' }))
      setTab('input')
    })
  }

  async function submitOutput(formElement?: HTMLFormElement) {
    if (!row) return
    const netQtyText = readFormValue(formElement, 'production-output-net-qty') || outputNetQtyRef.current?.value.trim() || outputForm.netQty
    const lossQtyText = readFormValue(formElement, 'production-output-loss-qty') || outputLossQtyRef.current?.value.trim() || outputForm.lossQty
    const netQty = Number(netQtyText)
    const lossQty = lossQtyText ? Number(lossQtyText) : 0
    const productCode = getComboboxCode(formElement, 'production-output-product', outputForm.productCode)
    const categoryCode = readFormValue(formElement, 'production-output-category') || outputForm.categoryCode
    const destinationWarehouseCode = readFormValue(formElement, 'production-output-destination-warehouse') || outputForm.destinationWarehouseCode
    if (netQtyText && (!productCode || !categoryCode || !destinationWarehouseCode || !Number.isFinite(netQty) || netQty <= 0)) {
      setError('กรุณาเลือกสินค้า ประเภท คลังรับ และระบุ Net (กก.) มากกว่า 0')
      return
    }
    if (!Number.isFinite(lossQty) || lossQty < 0) {
      setError('กรุณาระบุ Loss kg เป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
      return
    }
    if (!netQtyText && lossQty <= 0) {
      setError('กรุณาระบุ Net (กก.) หรือ Loss kg อย่างน้อย 1 รายการ')
      return
    }
    await runAction(async () => {
      const lines = netQtyText ? [{ categoryCode, destinationWarehouseCode, lotNo: outputForm.lotNo || undefined, netQty, productCode }] : []
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}/outputs`, {
        body: JSON.stringify({ completeOrder: outputForm.completeOrder, date: outputForm.date, lines, lossQty, notes: outputForm.notes || undefined }),
        method: 'POST',
      })
      await onRefreshRow(row.docNo)
      setOutputForm((form) => ({ ...form, completeOrder: false, lossQty: '', lotNo: '', netQty: '', notes: '' }))
      setTab('output')
    })
  }

  async function patchOrder(action: 'cancel' | 'complete') {
    if (!row) return
    const reason = action === 'cancel' ? window.prompt('เหตุผลการยกเลิก')?.trim() : undefined
    if (action === 'cancel' && !reason) return
    await runAction(async () => {
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}`, {
        body: JSON.stringify(action === 'complete' ? { action, note: '' } : { action, reason }),
        method: 'PATCH',
      })
      await onRefreshRow(row.docNo)
    })
  }

  async function reverseMovement(kind: 'inputs' | 'outputs', docNo: string) {
    if (!row) return
    const reason = window.prompt('เหตุผลการ reverse')?.trim()
    if (!reason) return
    const payloadKey = kind === 'inputs' ? 'inputDocNo' : 'outputDocNo'
    await runAction(async () => {
      await dailyFetchJson(`/api/production/orders/${encodeURIComponent(row.docNo)}/${kind}/reverse`, {
        body: JSON.stringify({ date: todayDateInput(), [payloadKey]: docNo, reason }),
        method: 'POST',
      })
      await onRefreshRow(row.docNo)
      setTab(kind === 'inputs' ? 'input' : 'output')
    })
  }

  async function runAction(action: () => Promise<void>) {
    setError(null)
    setIsSaving(true)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลไม่สำเร็จ')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="font-mono text-lg font-bold text-slate-900">{isCreate ? 'ใบสั่งผลิตใหม่' : row?.docNo ?? ''}</h3>
              <StatusBadge status={isCreate ? 'Open' : row?.status ?? '-'} />
            </div>
            {!isCreate && row ? (
              <div className="flex flex-wrap gap-2">
                <button className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300" disabled={isSaving || rowWipQty > 0 || row.status === 'Completed' || row.status === 'Cancelled'} type="button" onClick={() => void patchOrder('complete')}>จบงาน</button>
                <button className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:bg-slate-300" disabled={isSaving || row.inputCount > 0 || row.outputCount > 0 || row.status === 'Cancelled'} type="button" onClick={() => void patchOrder('cancel')}>ยกเลิก</button>
              </div>
            ) : null}
          </div>
          {!isCreate && row ? (
            <div className="mt-3 rounded-md border-l-4 border-amber-500 bg-amber-50 p-3">
              <div className="text-xs font-bold text-amber-700">สินค้าที่ผลิต</div>
              <div className="text-lg font-bold text-amber-800">{row.productName}</div>
              <div className="font-mono text-xs text-slate-500">{row.productCode || '-'}</div>
            </div>
          ) : null}
          {error ? <div className="mt-3"><Alert tone="red" title="บันทึกไม่สำเร็จ" text={error} /></div> : null}
        </div>

        <div className="max-h-[76vh] space-y-4 overflow-y-auto p-5">
          {!isCreate ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <Metric label="วัตถุดิบเบิก" value={formatMoney(row?.inputQty ?? 0)} tone="danger" />
              <Metric label="ผลผลิตได้" value={formatMoney(row?.outputQty ?? 0)} />
              <Metric label="WIP คงเหลือ" value={formatMoney(rowWipQty)} />
              <Metric label="RM Cost" value={formatMoney(row?.inputCost ?? 0)} />
              <Metric label="Output Value" value={formatMoney(row?.outputValue ?? 0)} />
              <Metric label="Yield" value={`${((row?.inputQty ?? 0) > 0 ? ((row?.outputQty ?? 0) / (row?.inputQty ?? 1)) * 100 : 0).toFixed(1)}%`} />
            </div>
          ) : null}

          {!isCreate ? (
            <div className="flex overflow-x-auto rounded-t-md border-b bg-white shadow">
              {[
                ['header', 'Header'],
                ['input', `Input (${row?.inputCount ?? 0})`],
                ['output', `Output (${row?.outputCount ?? 0})`],
              ].map(([key, label]) => (
                <button key={key} className={`whitespace-nowrap border-b-2 px-5 py-3 text-sm font-medium ${tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`} type="button" onClick={() => setTab(key as typeof tab)}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {(isCreate || tab === 'header') ? (
            <div className="rounded-md bg-white p-5 shadow">
              {isCreate ? (
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <FormField error={createErrors.date} label="วันที่ *"><DatePickerInput value={createForm.date} onChange={(date) => updateCreateForm('date', date)} /></FormField>
                  <SelectField error={createErrors.branchCode} label="สาขา *" placeholder="เลือกสาขา" value={createForm.branchCode} options={options.branches} onChange={updateCreateBranch} />
                  <SelectField error={createErrors.productionType} label="ประเภทการผลิต *" placeholder="เลือกประเภทการผลิต" value={createForm.productionType} options={options.productionTypes.map((value) => ({ code: value, id: value, name: value }))} onChange={(productionType) => updateCreateForm('productionType', productionType)} />
                  <SearchCombobox
                    error={createErrors.targetProductCode}
                    errorKey="targetProductCode"
                    inputId="production-order-target-product"
                    label="สินค้าที่ผลิต *"
                    options={productSearchOptions}
                    placeholder="พิมพ์รหัส/ชื่อสินค้าที่ผลิต..."
                    value={createForm.targetProductCode}
                    onChange={(targetProductCode) => updateCreateForm('targetProductCode', targetProductCode)}
                  />
                  <SelectField error={createErrors.sourceWarehouseCode} label="คลังต้นทาง *" placeholder="เลือกคลังต้นทาง" value={createForm.sourceWarehouseCode} options={branchWarehouses} onChange={(sourceWarehouseCode) => updateCreateForm('sourceWarehouseCode', sourceWarehouseCode)} />
                  <SelectField disabled={isWipWarehouseLocked} error={createErrors.wipWarehouseCode} helperText={isWipWarehouseLocked ? 'ล็อกจากคลัง WIP ของสาขา' : undefined} label="คลัง WIP *" placeholder={createForm.branchCode ? 'เลือกคลัง WIP' : 'เลือกสาขาก่อน'} value={createForm.wipWarehouseCode} options={branchWipWarehouses} onChange={(wipWarehouseCode) => updateCreateForm('wipWarehouseCode', wipWarehouseCode)} />
                  <SelectField error={createErrors.destinationWarehouseCode} label="คลังรับผลผลิต *" placeholder="เลือกคลังรับผลผลิต" value={createForm.destinationWarehouseCode} options={branchWarehouses} onChange={(destinationWarehouseCode) => updateCreateForm('destinationWarehouseCode', destinationWarehouseCode)} />
                  <SelectField label="เครื่องจักร" allowBlank value={createForm.machineCode} options={options.machines} onChange={(machineCode) => updateCreateForm('machineCode', machineCode)} />
                  <SelectField label="ไลน์ผลิต" allowBlank value={createForm.productionLineCode} options={options.productionLines} onChange={(productionLineCode) => updateCreateForm('productionLineCode', productionLineCode)} />
                  <FormField label="Shift"><input className="w-full rounded-md border px-3 py-2" value={createForm.shift} onChange={(event) => updateCreateForm('shift', event.target.value)} /></FormField>
                  <FormField label="หมายเหตุ"><input className="w-full rounded-md border px-3 py-2" value={createForm.notes} onChange={(event) => updateCreateForm('notes', event.target.value)} /></FormField>
                  <div className="md:col-span-3">
                    <ProductStockPreview
                      destinationWarehouseName={selectedDestinationWarehouse?.name ?? ''}
                      error={productStockError}
                      isLoading={isStockPreviewLoading}
                      isReady={Boolean(createForm.branchCode && createForm.targetProductCode && createForm.destinationWarehouseCode)}
                      stock={productStock}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <ReadField label="เลขที่เอกสาร" value={row?.docNo ?? '-'} />
                  <ReadField label="วันที่" value={row?.date ?? '-'} />
                  <ReadField label="สถานะ" value={row?.status ?? '-'} />
                  <ReadField label="สินค้าเป้าหมาย" value={row?.productName ?? '-'} />
                  <ReadField label="สาขา" value={row?.branchName ?? '-'} />
                  <ReadField label="คลังรับผลผลิต" value={row?.warehouseName ?? '-'} />
                  <ReadField label="WIP" value={formatMoney(rowWipQty)} />
                  <ReadField label="หมายเหตุ" value={row?.notes || '-'} />
                </div>
              )}
            </div>
          ) : null}

          {!isCreate && tab === 'input' ? (
            <MovementPanel
              actionLabel="บันทึกการเบิก"
              canWrite={canWrite}
              isSaving={isSaving}
              rows={row?.inputs ?? []}
              title="วัตถุดิบที่เบิก"
              onReverse={(docNo) => void reverseMovement('inputs', docNo)}
              form={(
                <div className="grid gap-3 text-sm md:grid-cols-4">
                  <FormField label="วันที่"><DatePickerInput value={inputForm.date} onChange={(date) => setInputForm((form) => ({ ...form, date }))} /></FormField>
                  <SearchCombobox inputId="production-input-product" label="สินค้า" options={productSearchOptions} placeholder="พิมพ์รหัส/ชื่อสินค้า..." value={inputForm.productCode} onChange={(productCode) => setInputForm((form) => ({ ...form, productCode }))} />
                  <SelectField selectId="production-input-source-warehouse" label="คลังต้นทาง" value={inputForm.sourceWarehouseCode} options={options.warehouses} onChange={(sourceWarehouseCode) => setInputForm((form) => ({ ...form, sourceWarehouseCode }))} />
                  <SelectField selectId="production-input-stock-status" label="สถานะสต๊อก" value={inputForm.stockStatus} options={[{ code: 'RM', id: 'RM', name: 'RM' }, { code: 'FG', id: 'FG', name: 'FG' }]} onChange={(stockStatus) => setInputForm((form) => ({ ...form, stockStatus }))} />
                  <FormField label="Net (กก.)"><input key={`input-net-${row?.inputCount ?? 0}`} ref={inputNetQtyRef} id="production-input-net-qty" className="w-full rounded-md border px-3 py-2 text-right" defaultValue={inputForm.netQty} inputMode="decimal" /></FormField>
                  <FormField label="Lot No."><input className="w-full rounded-md border px-3 py-2" value={inputForm.lotNo} onChange={(event) => setInputForm((form) => ({ ...form, lotNo: event.target.value }))} /></FormField>
                  <FormField label="หมายเหตุ"><input className="w-full rounded-md border px-3 py-2" value={inputForm.notes} onChange={(event) => setInputForm((form) => ({ ...form, notes: event.target.value }))} /></FormField>
                </div>
              )}
              onSubmit={(formElement) => void submitInput(formElement)}
            />
          ) : null}

          {!isCreate && tab === 'output' ? (
            <MovementPanel
              actionLabel="บันทึกผลผลิต"
              canWrite={canWrite}
              isSaving={isSaving}
              rows={row?.outputs ?? []}
              title="ผลผลิต"
              onReverse={(docNo) => void reverseMovement('outputs', docNo)}
              form={(
                <div className="grid gap-3 text-sm md:grid-cols-4">
                  <FormField label="วันที่"><DatePickerInput value={outputForm.date} onChange={(date) => setOutputForm((form) => ({ ...form, date }))} /></FormField>
                  <SearchCombobox inputId="production-output-product" label="สินค้า/Grade" options={productSearchOptions} placeholder="พิมพ์รหัส/ชื่อสินค้า..." value={outputForm.productCode} onChange={(productCode) => setOutputForm((form) => ({ ...form, productCode }))} />
                  <SelectField selectId="production-output-category" label="ประเภท" value={outputForm.categoryCode} options={[{ code: 'FG', id: 'FG', name: 'FG' }, { code: 'RM', id: 'RM', name: 'RM' }]} onChange={(categoryCode) => setOutputForm((form) => ({ ...form, categoryCode }))} />
                  <SelectField selectId="production-output-destination-warehouse" label="คลังรับ" value={outputForm.destinationWarehouseCode} options={options.warehouses} onChange={(destinationWarehouseCode) => setOutputForm((form) => ({ ...form, destinationWarehouseCode }))} />
                  <FormField label="Net (กก.)"><input key={`output-net-${row?.outputCount ?? 0}`} ref={outputNetQtyRef} id="production-output-net-qty" className="w-full rounded-md border px-3 py-2 text-right" defaultValue={outputForm.netQty} inputMode="decimal" /></FormField>
                  <FormField label="Loss kg"><input key={`output-loss-${row?.outputCount ?? 0}`} ref={outputLossQtyRef} id="production-output-loss-qty" className="w-full rounded-md border px-3 py-2 text-right" defaultValue={outputForm.lossQty} inputMode="decimal" /></FormField>
                  <FormField label="Lot No."><input className="w-full rounded-md border px-3 py-2" value={outputForm.lotNo} onChange={(event) => setOutputForm((form) => ({ ...form, lotNo: event.target.value }))} /></FormField>
                  <label className="flex items-center gap-2 rounded-md border px-3 py-2"><input checked={outputForm.completeOrder} type="checkbox" onChange={(event) => setOutputForm((form) => ({ ...form, completeOrder: event.target.checked }))} />จบงานหลังรับ</label>
                  <FormField label="หมายเหตุ"><input className="w-full rounded-md border px-3 py-2" value={outputForm.notes} onChange={(event) => setOutputForm((form) => ({ ...form, notes: event.target.value }))} /></FormField>
                </div>
              )}
              onSubmit={(formElement) => void submitOutput(formElement)}
            />
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" type="button" onClick={() => onClose(false)}>ปิด</button>
          {isCreate ? <button className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:bg-slate-300" disabled={isSaving} type="button" onClick={() => void submitCreate()}>บันทึก</button> : null}
        </div>
      </div>
    </div>
  )
}

function MovementPanel({ actionLabel, canWrite, form, isSaving, onReverse, onSubmit, rows, title }: { actionLabel: string; canWrite: boolean; form: React.ReactNode; isSaving: boolean; onReverse: (docNo: string) => void; onSubmit: (formElement: HTMLFormElement) => void; rows: ProductionMovementRow[]; title: string }) {
  return (
    <div className="space-y-4">
      {canWrite ? (
        <form className="rounded-md bg-white p-5 shadow" onSubmit={(event) => {
          event.preventDefault()
          onSubmit(event.currentTarget)
        }}>
          {form}
          <div className="mt-4 flex justify-end">
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-300" disabled={isSaving} type="submit">{actionLabel}</button>
          </div>
        </form>
      ) : null}
      <div className="rounded-md bg-white p-5 shadow">
        <h3 className="mb-3 font-semibold">{title}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-100">
              <tr><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-left">คลัง</th><th className="p-2 text-right">จำนวน</th><th className="p-2 text-right">มูลค่า</th><th className="p-2 text-left">สถานะ</th><th className="p-2 text-right">จัดการ</th></tr>
            </thead>
            <tbody>
              {rows.map((movement, index) => (
                <tr key={`${movement.docNo}-${index}`} className="border-t">
                  <td className="p-2 font-mono">{movement.docNo}</td>
                  <td className="p-2">{formatDateDisplay(movement.date)}</td>
                  <td className="p-2">{movement.productName}</td>
                  <td className="p-2">{movement.warehouseName}</td>
                  <td className="p-2 text-right">{formatMoney(movement.qty)}</td>
                  <td className="p-2 text-right">{formatMoney(movement.totalCost)}</td>
                  <td className="p-2">{movement.status}</td>
                  <td className="p-2 text-right">
                    <button className="rounded-md border px-2 py-1 text-xs text-red-700 disabled:opacity-40" disabled={movement.status !== 'active'} type="button" onClick={() => onReverse(movement.docNo)}>Reverse</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? <tr><td className="py-6 text-center text-slate-400" colSpan={8}>ยังไม่มีรายการ</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function ProductStockPreview({ destinationWarehouseName, error, isLoading, isReady, stock }: { destinationWarehouseName: string; error: string | null; isLoading: boolean; isReady: boolean; stock: ProductStockPayload | null }) {
  const totalQty = stock?.rows.reduce((sum, row) => sum + row.qty, 0) ?? 0
  const totalValue = stock?.rows.reduce((sum, row) => sum + row.value, 0) ?? 0
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-600">Stock สินค้าที่ผลิตในคลังรับผลผลิต</div>
          <div className="text-xs text-slate-500">{destinationWarehouseName || 'เลือกสาขา สินค้า และคลังรับผลผลิตเพื่อดู stock'}</div>
        </div>
        {stock ? <div className="text-right text-xs text-slate-500">รวม <b className="text-slate-800">{formatMoney(totalQty)}</b> กก. · {formatMoney(totalValue)}</div> : null}
      </div>
      {!isReady ? <div className="rounded-md border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs text-slate-500">เลือกสาขา สินค้าที่ผลิต และคลังรับผลผลิตก่อน</div> : null}
      {isReady && isLoading ? <div className="rounded-md bg-white px-3 py-4 text-center text-xs text-slate-500">กำลังโหลด stock</div> : null}
      {isReady && !isLoading && error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-xs text-red-700">{error}</div> : null}
      {isReady && !isLoading && !error && stock && stock.rows.length === 0 ? <div className="rounded-md bg-white px-3 py-4 text-center text-xs text-slate-500">ยังไม่มี stock ของสินค้านี้ในคลังที่เลือก</div> : null}
      {isReady && !isLoading && !error && stock && stock.rows.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-3">
          {stock.rows.map((row) => (
            <div key={row.status} className="rounded-md bg-white p-3 shadow-sm">
              <div className="text-xs font-semibold text-slate-500">{row.status}</div>
              <div className="mt-1 text-lg font-bold text-slate-900">{formatMoney(row.qty)} กก.</div>
              <div className="mt-1 text-xs text-slate-500">WAC {formatMoney(row.avgCost)} · มูลค่า {formatMoney(row.value)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FormField({ children, error, label }: { children: React.ReactNode; error?: string; label: string }) {
  const hasInlineRequired = label.trim().endsWith('*')
  const labelText = hasInlineRequired ? label.trim().slice(0, -1).trimEnd() : label
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{labelText}{hasInlineRequired ? <span className="ml-1 text-red-600">*</span> : null}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  )
}

function readFormValue(formElement: HTMLFormElement | undefined, inputId: string) {
  const element = formElement?.querySelector(`#${inputId}`) ?? (typeof document === 'undefined' ? null : document.getElementById(inputId))
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) return element.value.trim()
  return ''
}

function getComboboxCode(formElement: HTMLFormElement | undefined, inputId: string, currentValue: string) {
  const element = formElement?.querySelector(`#${inputId}`) ?? (typeof document === 'undefined' ? null : document.getElementById(inputId))
  const displayValue = element instanceof HTMLInputElement ? element.value : ''
  const parsedCode = displayValue.split(' - ')[0]?.trim() ?? ''
  return currentValue || parsedCode
}

function SelectField({ allowBlank = false, disabled = false, error, helperText, label, onChange, options, placeholder, selectId, value }: { allowBlank?: boolean; disabled?: boolean; error?: string; helperText?: string; label: string; onChange: (value: string) => void; options: Option[]; placeholder?: string; selectId?: string; value: string }) {
  return (
    <FormField error={error} label={label}>
      <select id={selectId} className={`w-full rounded-md border px-3 py-2 disabled:bg-slate-100 disabled:text-slate-600 ${error ? 'border-red-400 bg-red-50' : 'border-slate-300'}`} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allowBlank ? '-' : (placeholder ?? 'เลือกข้อมูล')}</option>
        {options.map((option) => <option key={`${option.code}-${option.id}`} value={option.code}>{option.code} - {option.name}</option>)}
      </select>
      {helperText ? <span className="mt-1 block text-xs text-slate-500">{helperText}</span> : null}
    </FormField>
  )
}

function MiniMetric({ label, tone, value }: { label: string; tone: 'amber' | 'emerald' | 'red'; value: number }) {
  const color = tone === 'red' ? 'text-red-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-amber-700'
  return <div className="rounded-md bg-white/70 p-2"><div className={`text-[10px] ${color}`}>{label}</div><div className={`text-sm font-bold ${color}`}>{formatMoney(value)}</div></div>
}

function Metric({ label, value, tone = 'normal' }: { label: string; tone?: 'normal' | 'danger'; value: string }) {
  return (
    <div className="rounded-md bg-white p-3 shadow">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${tone === 'danger' ? 'text-red-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">{value}</div>
    </div>
  )
}

function Alert({ text, title, tone }: { text: string; title: string; tone: 'red' }) {
  const className = tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : ''
  return <div className={`rounded-md border p-4 text-sm ${className}`}><div className="font-bold">{title}</div><div className="mt-1">{text}</div></div>
}

function cardClass(status: string) {
  if (status === 'Completed') return 'border-emerald-300 bg-emerald-50'
  if (status === 'In Production' || status === 'Partially Completed') return 'border-blue-400 bg-blue-50'
  if (status === 'Cancelled') return 'border-slate-300 bg-slate-50 opacity-70'
  return 'border-slate-200 bg-white hover:border-blue-300'
}

function statusClass(status: string) {
  if (status === 'In Production') return 'bg-purple-100 text-purple-700'
  if (status === 'Partially Completed') return 'bg-amber-100 text-amber-700'
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700'
  if (status === 'Cancelled') return 'bg-red-100 text-red-700'
  return 'bg-slate-100 text-slate-700'
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(status)}`}>{status}</span>
}
