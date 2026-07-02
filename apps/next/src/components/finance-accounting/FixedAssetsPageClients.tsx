'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

type AssetRegisterRow = {
  acquisitionType: string
  accumDep: number
  assetStatus: string
  branchId: string
  branchName: string
  category: string
  chassisNo: string
  code: string
  department: string
  depreciationMethod: string
  engineNo: string
  id: string
  insurancePolicyNo: string
  licensePlate: string
  location: string
  monthlyDep: number
  name: string
  nbv: number
  netAssetCost: number
  notes: string
  originalCost: number
  purchaseDate: string
  responsiblePerson: string
  salvageValue: number
  serialNo: string
  supplierId: string
  supplierName: string
  usefulLifeMonths: number
  vatAmount: number
  warrantyExpireDate: string
}

type AssetRegisterPayload = {
  byCategory: { category: string; count: number; cost: number; monthlyDep: number; nbv: number }[]
  filters: { categories: string[]; statuses: string[] }
  options: {
    acquisitionTypes: string[]
    assetStatuses: string[]
    branches: { code: string; id: string; name: string }[]
    categories: string[]
    departments: string[]
    depreciationMethods: string[]
    suppliers: { code: string; id: string; name: string }[]
  }
  rows: AssetRegisterRow[]
  summary: { accumDep: number; count: number; monthlyDep: number; nbv: number; netAssetCost: number }
}

type AssetFormState = {
  acquisitionType: string
  assetStatus: string
  branchId: string
  category: string
  chassisNo: string
  code: string
  department: string
  depreciationMethod: string
  engineNo: string
  id: string
  insurancePolicyNo: string
  licensePlate: string
  location: string
  name: string
  netAssetCost: string
  notes: string
  originalCost: string
  purchaseDate: string
  responsiblePerson: string
  salvageValue: string
  serialNo: string
  supplierId: string
  usefulLifeMonths: string
  vatAmount: string
  warrantyExpireDate: string
}

type ImportPreviewRow = { code: string; errors: string[]; index: number; mode: string; name: string }

const blankAssetForm: AssetFormState = {
  acquisitionType: 'Purchased',
  assetStatus: 'Active',
  branchId: '',
  category: 'Other',
  chassisNo: '',
  code: '',
  department: '',
  depreciationMethod: 'Straight Line',
  engineNo: '',
  id: '',
  insurancePolicyNo: '',
  licensePlate: '',
  location: '',
  name: '',
  netAssetCost: '',
  notes: '',
  originalCost: '',
  purchaseDate: '',
  responsiblePerson: '',
  salvageValue: '0',
  serialNo: '',
  supplierId: '',
  usefulLifeMonths: '60',
  vatAmount: '0',
  warrantyExpireDate: '',
}

const fieldClass = 'w-full rounded-md border border-slate-100 px-3 py-2 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100'

type DepreciationPayload = {
  designState: { glPosting: string; reverseWrite: string; runWrite: string }
  pendingAssets: { accumDep: number; assetStatus: string; code: string; id: string; monthlyDep: number; name: string; nbv: number; netAssetCost: number; category: string; department: string }[]
  period: { date: string; key: string; month: number | 'all'; postedRuns: number; pendingAssets: number; year: number }
  rows: { accumAfter: number; accumBefore: number; assetCode: string; assetName: string; date: string; depreciationAmount: number; id: string; nbvAfter: number; nbvBefore: number; period: string; refNo: string; reversalReason: string; reversedAt: string; status: string; category: string; department: string }[]
  summary: { pendingAssets: number; postedRuns: number; reversedRuns: number; totalDepreciation: number }
}

type DepreciationPreview = {
  periodDate: string
  periodKey: string
  rows: { accumAfter: number; accumBefore: number; assetCode: string; assetId: string; assetName: string; depreciationAmount: number; monthlyDep: number; nbvAfter: number; nbvBefore: number; netAssetCost: number; salvageValue: number; willFullyDepreciate: boolean }[]
  summary: { count: number; totalDepreciation: number; willFullyDepreciate: number }
}

type DisposalPayload = {
  assetOptions: { assetStatus: string; code: string; id: string; label: string; name: string; nbv: number; purchaseDate: string }[]
  customerOptions: { code: string; id: string; name: string }[]
  designState: { glPosting: string; reversal: string; writeBehavior: string }
  disposalTypes: string[]
  rows: { assetCode: string; assetName: string; customerCode: string; customerName: string; date: string; disposalNo: string; disposalType: string; gainLoss: number; id: string; nbv: number; notes: string; reason: string; receiptRefNo: string; reversalReason: string; reversedAt: string; sellingPrice: number; status: string }[]
  summary: { activeAssets: number; disposedRows: number; gainLoss: number; proceeds: number; reversedRows: number }
}

type DisposalFormState = {
  assetId: string
  customerId: string
  disposalDate: string
  disposalType: string
  notes: string
  reason: string
  receiptRefNo: string
  sellingPrice: string
}

type AssetRegisterColumnKey = 'accumDep' | 'actions' | 'assetName' | 'branchName' | 'category' | 'code' | 'monthlyDep' | 'nbv' | 'netAssetCost' | 'purchaseDate' | 'status'
type AssetRegisterSortKey = Exclude<AssetRegisterColumnKey, 'actions'>
type DepreciationColumnKey = 'accumAfter' | 'accumBefore' | 'actions' | 'asset' | 'depreciationAmount' | 'nbvAfter' | 'nbvBefore' | 'period' | 'refNo' | 'status'
type DepreciationSortKey = Exclude<DepreciationColumnKey, 'actions'>
type DisposalColumnKey = 'actions' | 'asset' | 'date' | 'disposalNo' | 'disposalType' | 'gainLoss' | 'nbv' | 'reason' | 'sellingPrice' | 'status'
type DisposalSortKey = Exclude<DisposalColumnKey, 'actions'>
type PendingAssetColumnKey = 'accumDep' | 'code' | 'monthlyDep' | 'name' | 'nbv' | 'netAssetCost' | 'status'
type PendingAssetSortKey = PendingAssetColumnKey
type SortDirection = 'asc' | 'desc'

const assetRegisterColumns: Array<ResizableColumnDefinition<AssetRegisterColumnKey>> = [
  { key: 'code', defaultWidth: 120, minWidth: 105 },
  { key: 'assetName', defaultWidth: 230, minWidth: 170 },
  { key: 'category', defaultWidth: 135, minWidth: 110 },
  { key: 'branchName', defaultWidth: 140, minWidth: 110 },
  { key: 'purchaseDate', defaultWidth: 120, minWidth: 105 },
  { key: 'netAssetCost', defaultWidth: 150, minWidth: 125 },
  { key: 'accumDep', defaultWidth: 155, minWidth: 130 },
  { key: 'nbv', defaultWidth: 175, minWidth: 145 },
  { key: 'monthlyDep', defaultWidth: 155, minWidth: 130 },
  { key: 'status', defaultWidth: 165, minWidth: 130 },
  { key: 'actions', defaultWidth: 155, minWidth: 130 },
]

const depreciationColumns: Array<ResizableColumnDefinition<DepreciationColumnKey>> = [
  { key: 'refNo', defaultWidth: 130, minWidth: 110 },
  { key: 'period', defaultWidth: 110, minWidth: 95 },
  { key: 'asset', defaultWidth: 240, minWidth: 170 },
  { key: 'accumBefore', defaultWidth: 170, minWidth: 140 },
  { key: 'depreciationAmount', defaultWidth: 155, minWidth: 130 },
  { key: 'accumAfter', defaultWidth: 170, minWidth: 140 },
  { key: 'nbvBefore', defaultWidth: 145, minWidth: 120 },
  { key: 'nbvAfter', defaultWidth: 140, minWidth: 115 },
  { key: 'status', defaultWidth: 165, minWidth: 130 },
  { key: 'actions', defaultWidth: 145, minWidth: 120 },
]

const disposalColumns: Array<ResizableColumnDefinition<DisposalColumnKey>> = [
  { key: 'disposalNo', defaultWidth: 140, minWidth: 115 },
  { key: 'date', defaultWidth: 115, minWidth: 100 },
  { key: 'asset', defaultWidth: 240, minWidth: 170 },
  { key: 'disposalType', defaultWidth: 130, minWidth: 110 },
  { key: 'sellingPrice', defaultWidth: 145, minWidth: 120 },
  { key: 'nbv', defaultWidth: 150, minWidth: 125 },
  { key: 'gainLoss', defaultWidth: 155, minWidth: 130 },
  { key: 'reason', defaultWidth: 210, minWidth: 150 },
  { key: 'status', defaultWidth: 155, minWidth: 125 },
  { key: 'actions', defaultWidth: 135, minWidth: 115 },
]

const pendingAssetColumns: Array<ResizableColumnDefinition<PendingAssetColumnKey>> = [
  { key: 'code', defaultWidth: 120, minWidth: 105 },
  { key: 'name', defaultWidth: 240, minWidth: 170 },
  { key: 'netAssetCost', defaultWidth: 150, minWidth: 125 },
  { key: 'accumDep', defaultWidth: 165, minWidth: 135 },
  { key: 'nbv', defaultWidth: 145, minWidth: 120 },
  { key: 'monthlyDep', defaultWidth: 155, minWidth: 130 },
  { key: 'status', defaultWidth: 160, minWidth: 130 },
]

const blankDisposalForm = (): DisposalFormState => ({
  assetId: '',
  customerId: '',
  disposalDate: new Date().toISOString().slice(0, 10),
  disposalType: 'Sale',
  notes: '',
  reason: '',
  receiptRefNo: '',
  sellingPrice: '0',
})

export function AssetRegisterPageClient() {
  const [category, setCategory] = useState('all')
  const [data, setData] = useState<AssetRegisterPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<AssetFormState>(blankAssetForm)
  const [importRows, setImportRows] = useState<Omit<AssetFormState, 'id'>[]>([])
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [modal, setModal] = useState<'asset' | 'import' | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<AssetRegisterSortKey | null>(null)
  const columnResize = useResizableColumns('finance-accounting.asset-register.main.v1', assetRegisterColumns)

  useEffect(() => {
    setPage(1)
  }, [category, search, status])

  const supplierOptions = useMemo(() => {
    return (data?.options.suppliers ?? []).map((row) => ({
      id: row.id,
      label: `${row.code} - ${row.name}`,
      searchText: `${row.code} ${row.name}`
    }))
  }, [data?.options.suppliers])

  const categoryOptions = useMemo(() => {
    return (data?.options.categories ?? []).map((cat) => ({
      id: cat,
      label: cat,
      searchText: cat,
    }))
  }, [data?.options.categories])

  const departmentOptions = useMemo(() => {
    return (data?.options.departments ?? []).map((dept) => ({
      id: dept,
      label: dept,
      searchText: dept,
    }))
  }, [data?.options.departments])


  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    if (category !== 'all') params.set('category', category)
    if (status !== 'all') params.set('status', status)
    return params.toString()
  }, [category, search, status])
  const apiHref = `/api/finance-accounting/asset-register${queryString ? `?${queryString}` : ''}`
  const exportHref = `/api/finance-accounting/asset-register?${new URLSearchParams({ ...(queryString ? Object.fromEntries(new URLSearchParams(queryString)) : {}), format: 'csv' }).toString()}`

  const loadData = useCallback(() => {
    setIsLoading(true)
    dailyFetchJson<AssetRegisterPayload>(apiHref)
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดทะเบียนทรัพย์สินไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [apiHref])

  useEffect(() => loadData(), [loadData])

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      const matchesSearch = !needle || [row.code, row.name, row.location, row.branchName].join(' ').toLowerCase().includes(needle)
      const matchesCategory = category === 'all' || row.category === category
      const matchesStatus = status === 'all' || row.assetStatus === status
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [category, data?.rows, search, status])

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((left, right) => {
      const result = compareSortValues(getAssetRegisterSortValue(left, sortKey), getAssetRegisterSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  const totalRows = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const changeSort = (key: AssetRegisterSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }

  const openCreate = () => {
    setError(null)
    setForm(blankAssetForm)
    setModal('asset')
  }

  const openEdit = (row: AssetRegisterRow) => {
    setError(null)
    setForm(assetRowToForm(row))
    setModal('asset')
  }

  const openImport = () => {
    setError(null)
    setImportRows([])
    setImportPreview(null)
    setModal('import')
  }

  const updateForm = (field: keyof AssetFormState, value: string) => {
    setForm((current) => {
      const next = { ...current, [field]: value }
      if (field === 'originalCost') {
        const originalCost = decimalValue(value)
        if (originalCost > 0) {
          next.netAssetCost = formatInputNumber(originalCost)
          next.vatAmount = '0'
        }
      }
      return next
    })
  }

  const saveAsset = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: AssetRegisterPayload }>('/api/finance-accounting/asset-register', {
        body: JSON.stringify(formToPayload(form)),
        method: 'POST',
      })
      setData(result.payload)
      setModal(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกทะเบียนทรัพย์สินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const deactivateAsset = async (row: AssetRegisterRow) => {
    if (!window.confirm(`ปิดใช้งานทรัพย์สิน ${row.code} ?`)) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: AssetRegisterPayload }>('/api/finance-accounting/asset-register', {
        body: JSON.stringify({ action: 'deactivate', id: row.id, reason: 'deactivated from asset register page' }),
        method: 'PATCH',
      })
      setData(result.payload)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ปิดใช้งานทรัพย์สินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const previewImport = async (rowsToPreview = importRows) => {
    if (!rowsToPreview.length) {
      setError('เลือกไฟล์ CSV/TSV ก่อนนำเข้า')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ rows: ImportPreviewRow[] }>('/api/finance-accounting/asset-register', {
        body: JSON.stringify({ action: 'previewImport', rows: rowsToPreview.map(formToPayload) }),
        method: 'POST',
      })
      setImportPreview(result.rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ตรวจไฟล์นำเข้าไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const commitImport = async () => {
    if (!importRows.length || importPreview?.some((row) => row.errors.length)) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: AssetRegisterPayload }>('/api/finance-accounting/asset-register', {
        body: JSON.stringify({ action: 'commitImport', rows: importRows.map(formToPayload) }),
        method: 'POST',
      })
      setData(result.payload)
      setImportRows([])
      setImportPreview(null)
      setModal(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'นำเข้าทะเบียนทรัพย์สินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const importBlocked = importPreview?.some((row) => row.errors.length) ?? true
  const summary = data?.summary
  const hasAssets = (summary?.count ?? 0) > 0
  const hasCategoryBreakdown = (data?.byCategory.length ?? 0) > 0
  const hasActiveAssetFilters = Boolean(search.trim() || category !== 'all' || status !== 'all')

  return (
    <section className="space-y-4 text-slate-800">
      {error ? <ErrorBox message={error} /> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="bg-white p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 ${hasAssets ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
            🏢
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-xs font-semibold truncate ${hasAssets ? 'text-emerald-600' : 'text-slate-500'}`}>มูลค่าคงเหลือสุทธิ (NBV)</div>
            <div className="mt-0.5 text-2xl font-extrabold text-slate-900 tracking-tight">{formatMoney(data?.summary.nbv)} ฿</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
              <div><div className="text-slate-400">ต้นทุนสุทธิ</div><div className="font-bold text-slate-800 text-xs">{formatMoney(data?.summary.netAssetCost)}</div></div>
              <div><div className="text-slate-400">ค่าเสื่อมสะสม</div><div className="font-bold text-slate-500 text-xs">{formatMoney(data?.summary.accumDep)}</div></div>
            </div>
          </div>
        </div>
        <Panel title="NBV ตามหมวด">
          {hasCategoryBreakdown ? (
            <div className="space-y-3">
              {(data?.byCategory ?? []).slice(0, 6).map((item) => (
                <Bar key={item.category} label={`${item.category} (${item.count})`} max={data?.summary.nbv ?? 0} value={item.nbv} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/70 px-4 py-5 text-sm">
              <div className="font-semibold text-slate-700">ยังไม่มีข้อมูลหมวดทรัพย์สิน</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">เพิ่มหรือ import ทรัพย์สินก่อน ระบบจึงจะแสดงสัดส่วน NBV ตามหมวดได้</div>
            </div>
          )}
        </Panel>
        <Panel title="ค่าเสื่อม/เดือน">
          <div className={`text-2xl font-extrabold tracking-tight ${(data?.summary.monthlyDep ?? 0) > 0 ? 'text-amber-700' : 'text-slate-900'}`}>{formatMoney(data?.summary.monthlyDep)} ฿</div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <MiniStat label="รายการทั้งหมด" value={data?.summary.count ?? 0} />
            <MiniStat label="แสดงผลปัจจุบัน" value={rows.length} />
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="จำนวนทรัพย์สิน" value={data?.summary.count ?? 0} tone="blue" icon="📋" />
        <StatCard label="ต้นทุนสุทธิรวม" value={formatMoney(data?.summary.netAssetCost)} tone="blue" icon="💰" />
        <StatCard label="ค่าเสื่อมสะสมรวม" value={formatMoney(data?.summary.accumDep)} tone="amber" icon="📉" />
        <StatCard label="แสดงผลตามตัวกรอง" value={rows.length} tone="blue" icon="🔎" />
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 space-y-2 rounded-md bg-white p-3 shadow lg:hidden">
        <div className="flex gap-2 items-center">
          <input
            className="flex-1 rounded-md border border-slate-300 px-3 py-1 text-sm h-9 outline-none focus:border-slate-400 transition"
            placeholder="ค้นหา..."
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {(category !== 'all' || status !== 'all') ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden">
          <div className="w-full rounded-t-2xl bg-white p-5 shadow-xl border-t border-slate-200 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-800 text-sm">ตัวกรองเพิ่มเติม</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-2xl font-bold focus:outline-none"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">หมวดหมู่</label>
                <select
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="all">ทุกหมวด</option>
                  {(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">สถานะ</label>
                <select
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">ทุกสถานะ</option>
                  {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div className="border-t border-slate-100 pt-3 space-y-2">
                <label className="block font-semibold text-slate-600 text-xs">จัดการไฟล์และระบบนำเข้า</label>
                <div className="grid grid-cols-2 gap-2">
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                  <a
                    href="/api/finance-accounting/asset-register?template=csv"
                    className="flex h-10 items-center justify-center rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    📄 Template
                  </a>
                  <button
                    type="button"
                    onClick={() => { setShowMobileFilters(false); openImport() }}
                    className="flex h-10 items-center justify-center rounded-md border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    📥 Import
                  </button>
                  <a
                    href={exportHref}
                    onClick={() => setShowMobileFilters(false)}
                    className="col-span-2 flex h-10 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
                  >
                    📤 Export CSV
                  </a>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setCategory('all')
                  setStatus('all')
                }}
                className="flex-1 h-10 rounded-md border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 h-10 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Desktop Table Card */}
      <div className="hidden rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <input
          className="h-9 min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none transition focus:border-slate-400"
          placeholder="ค้นหา รหัส / ชื่อ / สถานที่ / สาขา"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <select
            className="h-9 w-auto min-w-[120px] rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition cursor-pointer focus:border-slate-400"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">ทุกหมวด</option>
            {(data?.filters.categories ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select
            className="h-9 w-auto min-w-[120px] rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none transition cursor-pointer focus:border-slate-400"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
          <LinkButton href="/api/finance-accounting/asset-register?template=csv">📄 Template CSV</LinkButton>
          <button
            type="button"
            onClick={openImport}
            className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition hover:bg-slate-50 outline-none focus:ring-0"
          >
            📥 Import
          </button>
          <LinkButton href={exportHref}>📤 Export CSV</LinkButton>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 items-center rounded-md bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 outline-none focus:ring-0"
          >
            + เพิ่มทรัพย์สิน
          </button>
        </div>
      </div>
        <div className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={pageSize}
            onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </select>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={currentPage <= 1}
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            ก่อนหน้า
          </button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={currentPage >= totalPages}
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            ถัดไป
          </button>
          {columnResize.hasCustomWidths ? (
            <button
              className="h-9 rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
      </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {assetRegisterColumns.map((column, index) => {
                if (index === assetRegisterColumns.length - 1) {
                  return <col key={column.key} style={{ minWidth: column.minWidth }} />
                }
                return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
              })}
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="รหัสทรัพย์สิน" resizeProps={columnResize.getResizeHandleProps('code', 'รหัสทรัพย์สิน')} sortKey="code" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="ชื่อทรัพย์สิน / สถานที่" resizeProps={columnResize.getResizeHandleProps('assetName', 'ชื่อทรัพย์สิน / สถานที่')} sortKey="assetName" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="หมวด" resizeProps={columnResize.getResizeHandleProps('category', 'หมวด')} sortKey="category" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="สาขา" resizeProps={columnResize.getResizeHandleProps('branchName', 'สาขา')} sortKey="branchName" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="วันที่ซื้อ" resizeProps={columnResize.getResizeHandleProps('purchaseDate', 'วันที่ซื้อ')} sortKey="purchaseDate" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ต้นทุนสุทธิ" resizeProps={columnResize.getResizeHandleProps('netAssetCost', 'ต้นทุนสุทธิ')} sortKey="netAssetCost" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ค่าเสื่อมสะสม" resizeProps={columnResize.getResizeHandleProps('accumDep', 'ค่าเสื่อมสะสม')} sortKey="accumDep" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="มูลค่าคงเหลือ (NBV)" resizeProps={columnResize.getResizeHandleProps('nbv', 'มูลค่าคงเหลือ')} sortKey="nbv" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ค่าเสื่อม/เดือน" resizeProps={columnResize.getResizeHandleProps('monthlyDep', 'ค่าเสื่อมต่อเดือน')} sortKey="monthlyDep" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeSort} />
                <ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('actions', 'จัดการ')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? <LoadingOrEmpty colSpan={assetRegisterColumns.length} isLoading rows={1} /> : null}
              {!isLoading && rows.length === 0 ? (
                <AssetRegisterEmptyRow colSpan={assetRegisterColumns.length} hasFilters={hasActiveAssetFilters} />
              ) : null}
              {!isLoading && pagedRows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-amber-700">{row.code}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-400">{row.location || '-'}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{row.category}</td>
                  <td className="px-3 py-3 text-slate-700">{row.branchName}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.purchaseDate || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-medium tabular-nums text-slate-700">{formatMoney(row.netAssetCost)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-500">{formatMoney(row.accumDep)}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums ${row.nbv > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>{formatMoney(row.nbv)}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-medium tabular-nums ${row.monthlyDep > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{formatMoney(row.monthlyDep)}</td>
                  <td className="px-3 py-3 text-center"><StatusPill status={row.assetStatus} /></td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex justify-center gap-1">
                      <button className="rounded border border-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition outline-none" disabled={isSaving} onClick={() => openEdit(row)} type="button">แก้ไข</button>
                      {!['Inactive', 'Sold', 'Disposed', 'Lost'].includes(row.assetStatus) ? (
                        <button className="rounded border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition outline-none" disabled={isSaving} onClick={() => deactivateAsset(row)} type="button">ปิดใช้งาน</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
      </div>

      </div>

      {/* Mobile Pagination Controls */}
      <div className="flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between lg:hidden">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={pageSize}
            onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </select>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={currentPage <= 1}
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            ก่อนหน้า
          </button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={currentPage >= totalPages}
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            ถัดไป
          </button>
          {columnResize.hasCustomWidths ? (
            <button
              className="h-9 rounded-md bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
      </div>

      {/* Mobile View Card List */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-xl p-6 text-center text-xs text-slate-400 shadow-sm border border-slate-100">กำลังโหลดข้อมูล...</div>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
            <AssetRegisterEmptyState hasFilters={hasActiveAssetFilters} />
          </div>
        ) : (
          pagedRows.map((row) => (
            <div key={row.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 space-y-3 hover:bg-slate-50/50 transition">
              <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                <div className="min-w-0 flex-1 pr-2">
                  <span className="font-mono font-bold text-xs text-amber-700 block">{row.code}</span>
                  <span className="font-bold text-slate-900 text-sm block truncate">{row.name}</span>
                  <span className="text-slate-400 text-xs block truncate">{row.location || '-'}</span>
                </div>
                <StatusPill status={row.assetStatus} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:text-xs">
                <div><span className="text-slate-400 block text-xs">หมวดหมู่ / สาขา</span><span className="font-medium text-slate-700 block truncate">{row.category} / {row.branchName}</span></div>
                <div><span className="text-slate-400 block text-xs">วันที่ซื้อ</span><span className="font-medium text-slate-700 block">{row.purchaseDate || '-'}</span></div>
                <div><span className="text-slate-400 block text-xs">ต้นทุนสุทธิ</span><span className="font-bold text-slate-800 block">{formatMoney(row.netAssetCost)}</span></div>
                <div><span className="text-slate-400 block text-xs">ค่าเสื่อมสะสม</span><span className="font-medium text-slate-500 block">{formatMoney(row.accumDep)}</span></div>
                <div><span className="text-slate-400 block text-xs">มูลค่าคงเหลือ (NBV)</span><span className={`font-extrabold text-xs sm:text-sm block ${row.nbv > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>{formatMoney(row.nbv)}</span></div>
                <div><span className="text-slate-400 block text-xs">ค่าเสื่อม/เดือน</span><span className={`font-bold block ${row.monthlyDep > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{formatMoney(row.monthlyDep)}</span></div>
              </div>
              <div className="border-t border-slate-100 pt-2 flex justify-end gap-2">
                <button className="rounded border border-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition outline-none focus:ring-0" disabled={isSaving} onClick={() => openEdit(row)} type="button">แก้ไข</button>
                {!['Inactive', 'Sold', 'Disposed', 'Lost'].includes(row.assetStatus) ? (
                  <button className="rounded border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 transition outline-none focus:ring-0" disabled={isSaving} onClick={() => deactivateAsset(row)} type="button">ปิดใช้งาน</button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>



      {modal === 'asset' ? (
        <Modal title={form.id ? `แก้ไขทรัพย์สิน ${form.code}` : 'เพิ่มทรัพย์สิน'}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="รหัสทรัพย์สิน">
              <input
                className={fieldClass}
                disabled
                placeholder={form.id ? "" : "(ระบบสร้างให้อัตโนมัติ)"}
                value={form.id ? form.code : "(ระบบสร้างให้อัตโนมัติ)"}
              />
            </Field>
            <Field label="ชื่อทรัพย์สิน"><input className={fieldClass} value={form.name} onChange={(event) => updateForm('name', event.target.value)} /></Field>
            <div className="w-full">
              <SearchCombobox
                inputId="form-category"
                label="หมวด"
                options={categoryOptions}
                value={form.category}
                onChange={(value) => updateForm('category', value)}
                placeholder="เลือกหรือพิมพ์หมวด..."
              />
            </div>
            <Field label="สาขา"><OptionSelect blankLabel="ไม่ระบุสาขา" options={data?.options.branches ?? []} value={form.branchId} onChange={(value) => updateForm('branchId', value)} /></Field>
            <div className="w-full">
              <SearchCombobox
                inputId="form-department"
                label="แผนก"
                options={departmentOptions}
                value={form.department}
                onChange={(value) => updateForm('department', value)}
                placeholder="เลือกหรือพิมพ์แผนก..."
              />
            </div>
            <Field label="สถานที่"><input className={fieldClass} value={form.location} onChange={(event) => updateForm('location', event.target.value)} /></Field>
            <Field label="วันที่ซื้อ"><input className={fieldClass} type="date" value={form.purchaseDate} onChange={(event) => updateForm('purchaseDate', event.target.value)} /></Field>
            <Field label="ประเภทการได้มา"><SelectControl options={data?.options.acquisitionTypes ?? []} value={form.acquisitionType} onChange={(value) => updateForm('acquisitionType', value)} /></Field>
            <div className="w-full">
              <SearchCombobox
                inputId="form-supplier"
                label="ผู้ขาย"
                options={supplierOptions}
                value={form.supplierId}
                onChange={(value) => updateForm('supplierId', value)}
                placeholder="พิมพ์เพื่อค้นหาผู้ขาย..."
              />
            </div>
            <MoneyField label="ราคาทุน" value={form.originalCost} onChange={(value) => updateForm('originalCost', value)} />
            <MoneyField label="มูลค่าซาก" value={form.salvageValue} onChange={(value) => updateForm('salvageValue', value)} />
            <Field label="อายุใช้งาน (เดือน)"><input className={fieldClass} inputMode="numeric" value={form.usefulLifeMonths} onChange={(event) => updateForm('usefulLifeMonths', event.target.value)} /></Field>
            <Field label="วิธีคิดค่าเสื่อม"><SelectControl options={data?.options.depreciationMethods ?? []} value={form.depreciationMethod} onChange={(value) => updateForm('depreciationMethod', value)} /></Field>
            <Field label="สถานะ"><SelectControl options={data?.options.assetStatuses ?? []} value={form.assetStatus} onChange={(value) => updateForm('assetStatus', value)} /></Field>
            <Field label="Serial No."><input className={fieldClass} value={form.serialNo} onChange={(event) => updateForm('serialNo', event.target.value)} /></Field>
            <Field label="ทะเบียนรถ"><input className={fieldClass} value={form.licensePlate} onChange={(event) => updateForm('licensePlate', event.target.value)} /></Field>
            <Field label="เลขตัวถัง"><input className={fieldClass} value={form.chassisNo} onChange={(event) => updateForm('chassisNo', event.target.value)} /></Field>
            <Field label="เลขเครื่อง"><input className={fieldClass} value={form.engineNo} onChange={(event) => updateForm('engineNo', event.target.value)} /></Field>
            <Field label="กรมธรรม์"><input className={fieldClass} value={form.insurancePolicyNo} onChange={(event) => updateForm('insurancePolicyNo', event.target.value)} /></Field>
            <Field label="หมดประกัน"><input className={fieldClass} type="date" value={form.warrantyExpireDate} onChange={(event) => updateForm('warrantyExpireDate', event.target.value)} /></Field>
            <Field label="ผู้รับผิดชอบ"><input className={fieldClass} value={form.responsiblePerson} onChange={(event) => updateForm('responsiblePerson', event.target.value)} /></Field>
            <div className="col-span-2 md:col-span-3"><Field label="หมายเหตุ"><textarea className={`${fieldClass} min-h-20`} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></Field></div>
          </div>
          <ModalActions>
            <ActionButton onClick={() => setModal(null)}>ยกเลิก</ActionButton>
            <ActionButton strong disabled={isSaving} onClick={saveAsset}>{isSaving ? 'กำลังบันทึก' : 'บันทึก'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}

      {modal === 'import' ? (
        <Modal title="Import Asset Register">
          <div className="space-y-3">
            <input
              accept=".csv,.tsv,.txt"
              className="block w-full rounded-md border border-slate-100 px-3 py-2 text-sm"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (!file) return
                file.text().then((content) => {
                  const parsedRows = parseAssetImportText(content)
                  setImportRows(parsedRows)
                  setImportPreview(null)
                  void previewImport(parsedRows)
                }).catch(() => setError('อ่านไฟล์นำเข้าไม่ได้'))
              }}
            />
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">รองรับ CSV/TSV ตามหัวคอลัมน์จาก template ก่อน commit ระบบจะ preview และ block แถวที่ซ้ำหรือ reference ไม่ถูกต้อง</div>
            {importPreview ? (
              <TableShell>
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><Th>#</Th><Th>รหัส</Th><Th>ชื่อ</Th><Th>ผลตรวจ</Th></tr></thead>
                  <tbody>
                    {importPreview.slice(0, 100).map((row) => (
                      <tr key={`${row.index}-${row.code}`} className="border-t border-slate-100">
                        <Td>{row.index}</Td><Td><span className="font-mono">{row.code}</span></Td><Td>{row.name}</Td><Td>{row.errors.length ? <span className="text-red-700">{row.errors.join(', ')}</span> : <span className="text-emerald-700">พร้อมนำเข้า</span>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableShell>
            ) : null}
          </div>
          <ModalActions>
            <ActionButton onClick={() => setModal(null)}>ยกเลิก</ActionButton>
            <ActionButton disabled={isSaving || importBlocked} strong onClick={commitImport}>{isSaving ? 'กำลังนำเข้า' : 'Commit Import'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform focus:outline-none text-2xl font-bold hover:bg-blue-700"
          onClick={openCreate}
          type="button"
          aria-label="เพิ่มทรัพย์สิน"
        >
          +
        </button>
      </div>
    </section>
  )
}

export function DepreciationPageClient() {
  const [data, setData] = useState<DepreciationPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [preview, setPreview] = useState<DepreciationPreview | null>(null)
  const [reverseRow, setReverseRow] = useState<DepreciationPayload['rows'][number] | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [year, setYear] = useState(String(now.getFullYear()))

  const [filterCategory, setFilterCategory] = useState('all')
  const [filterDepartment, setFilterDepartment] = useState('all')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [depreciationTab, setDepreciationTab] = useState<'pending' | 'history'>('pending')
  const [historySortDirection, setHistorySortDirection] = useState<SortDirection>('asc')
  const [historySortKey, setHistorySortKey] = useState<DepreciationSortKey | null>(null)
  const columnResize = useResizableColumns('finance-accounting.depreciation.history.v1', depreciationColumns)

  useEffect(() => {
    setPage(1)
  }, [filterCategory, filterDepartment, month, year])

  const loadData = useCallback(() => {
    setIsLoading(true)
    const params = new URLSearchParams({ month, year })
    dailyFetchJson<DepreciationPayload>(`/api/finance-accounting/depreciation?${params.toString()}`)
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดค่าเสื่อมราคาไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [month, year])

  useEffect(() => loadData(), [loadData])

  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    data?.pendingAssets.forEach((item) => { if (item.category) set.add(item.category) })
    data?.rows.forEach((item) => { if (item.category) set.add(item.category) })
    return Array.from(set).sort()
  }, [data])

  const departmentOptions = useMemo(() => {
    const set = new Set<string>()
    data?.pendingAssets.forEach((item) => { if (item.department) set.add(item.department) })
    data?.rows.forEach((item) => { if (item.department) set.add(item.department) })
    return Array.from(set).sort()
  }, [data])

  const filteredPendingAssets = useMemo(() => {
    return (data?.pendingAssets ?? []).filter((item) => {
      const matchCat = filterCategory === 'all' || item.category === filterCategory
      const matchDept = filterDepartment === 'all' || item.department === filterDepartment
      return matchCat && matchDept
    })
  }, [data?.pendingAssets, filterCategory, filterDepartment])

  const filteredRows = useMemo(() => {
    return (data?.rows ?? []).filter((item) => {
      const matchCat = filterCategory === 'all' || item.category === filterCategory
      const matchDept = filterDepartment === 'all' || item.department === filterDepartment
      return matchCat && matchDept
    })
  }, [data?.rows, filterCategory, filterDepartment])

  const sortedRows = useMemo(() => {
    if (!historySortKey) return filteredRows
    return [...filteredRows].sort((left, right) => {
      const result = compareSortValues(getDepreciationSortValue(left, historySortKey), getDepreciationSortValue(right, historySortKey))
      return historySortDirection === 'asc' ? result : -result
    })
  }, [filteredRows, historySortDirection, historySortKey])

  const totalRows = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const changeHistorySort = (key: DepreciationSortKey) => {
    if (historySortKey === key) {
      setHistorySortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setHistorySortKey(key)
    setHistorySortDirection('asc')
  }

  const totalDepreciationAmount = useMemo(() => {
    return filteredRows.filter((row) => row.status !== 'reversed').reduce((sum, row) => sum + row.depreciationAmount, 0)
  }, [filteredRows])

  const periodDate = useMemo(() => month === 'all' ? '-' : new Date(Number(year), Number(month), 0).toISOString().slice(0, 10), [month, year])
  const runPreview = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<DepreciationPreview>('/api/finance-accounting/depreciation', {
        body: JSON.stringify({ action: 'preview', periodMonth: month, periodYear: year }),
        method: 'POST',
      })
      setPreview(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Preview ค่าเสื่อมไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const commitRun = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: DepreciationPayload }>('/api/finance-accounting/depreciation', {
        body: JSON.stringify({ action: 'commit', periodMonth: month, periodYear: year }),
        method: 'POST',
      })
      setData(result.payload)
      setPreview(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Run ค่าเสื่อมราคาไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const reverseDepreciation = async () => {
    if (!reverseRow) return
    setIsSaving(true)
    setError(null)
    try {
      await dailyFetchJson('/api/finance-accounting/depreciation', {
        body: JSON.stringify({ action: 'reverse', id: reverseRow.id, periodMonth: month, periodYear: year, reason: reverseReason }),
        method: 'PATCH',
      })
      loadData()
      setReverseRow(null)
      setReverseReason('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ย้อนกลับค่าเสื่อมราคาไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <select aria-label="Depreciation month" className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer" value={month} onChange={(event) => setMonth(event.target.value)}>
          <option value="all">ดูรายปี (ทุกเดือน)</option>
          {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((item) => <option key={item} value={item}>เดือน {item}</option>)}
        </select>
        <input aria-label="Depreciation year" className="w-24 h-9 rounded-md border border-slate-300 px-3 py-1 text-sm outline-none focus:border-slate-400 transition text-center" value={year} onChange={(event) => setYear(event.target.value)} />
        <input aria-label="Depreciation period date" className="h-9 rounded-md border border-slate-300 bg-slate-50 px-3 py-1 text-sm outline-none cursor-default" readOnly value={periodDate} />

        <select aria-label="Filter category" className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer" value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
          <option value="all">ทุกหมวด</option>
          {categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="Filter department" className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer" value={filterDepartment} onChange={(event) => setFilterDepartment(event.target.value)}>
          <option value="all">ทุกแผนก</option>
          {departmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>

        <Chip tone="blue">คิดค่าเสื่อม {filteredPendingAssets.length}</Chip>
        <Chip tone="emerald">Run แล้ว {data?.period.postedRuns ?? 0}</Chip>
        <Chip tone="amber">รอ Run {filteredPendingAssets.length}</Chip>
        <span className="flex-1" />
        <ActionButton disabled={isSaving || month === 'all' || filteredPendingAssets.length === 0} strong onClick={runPreview}>Preview ค่าเสื่อมงวดนี้</ActionButton>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="rounded-md bg-white p-3 shadow lg:hidden space-y-3">
        <div className="flex gap-2 items-center">
          <select
            aria-label="Depreciation month"
            className="flex-1 h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          >
            <option value="all">ดูรายปี (ทุกเดือน)</option>
            {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((item) => <option key={item} value={item}>เดือน {item}</option>)}
          </select>
          <input
            aria-label="Depreciation year"
            className="w-20 h-9 rounded-md border border-slate-300 px-3 py-1 text-sm outline-none focus:border-slate-400 transition text-center"
            value={year}
            onChange={(event) => setYear(event.target.value)}
          />
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Chip tone="blue">คิดค่าเสื่อม {filteredPendingAssets.length}</Chip>
          <Chip tone="emerald">Run แล้ว {data?.period.postedRuns ?? 0}</Chip>
          <Chip tone="amber">รอ Run {filteredPendingAssets.length}</Chip>
        </div>

        <button
          type="button"
          disabled={isSaving || month === 'all' || filteredPendingAssets.length === 0}
          onClick={runPreview}
          className={`w-full h-10 rounded-lg text-sm font-bold transition shadow-sm outline-none focus:ring-0 flex items-center justify-center ${
            isSaving || month === 'all' || filteredPendingAssets.length === 0
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed opacity-60'
              : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95 transition-transform'
          }`}
        >
          Preview ค่าเสื่อมงวดนี้
        </button>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden">
          <div className="w-full rounded-t-2xl bg-white p-5 shadow-xl border-t border-slate-200 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-800 text-sm">ตัวกรองเพิ่มเติม</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-2xl font-bold focus:outline-none"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">หมวดหมู่ทรัพย์สิน</label>
                <select
                  aria-label="Filter category"
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={filterCategory}
                  onChange={(event) => setFilterCategory(event.target.value)}
                >
                  <option value="all">ทุกหมวด</option>
                  {categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">แผนก</label>
                <select
                  aria-label="Filter department"
                  className="w-full h-10 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={filterDepartment}
                  onChange={(event) => setFilterDepartment(event.target.value)}
                >
                  <option value="all">ทุกแผนก</option>
                  {departmentOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">วันสิ้นสุดงวด (Period End Date)</label>
                <input
                  aria-label="Depreciation period date"
                  className="w-full h-10 rounded-md border border-slate-300 bg-slate-50 px-3 py-1 text-sm outline-none cursor-default"
                  readOnly
                  value={periodDate}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilterCategory('all')
                  setFilterDepartment('all')
                }}
                className="flex-1 h-10 rounded-md border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 h-10 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Tabs
        value={depreciationTab}
        className="gap-2"
        onValueChange={(value) => {
          setDepreciationTab(value as typeof depreciationTab)
          setPage(1)
        }}
      >
        <TabsList className="w-full overflow-x-auto rounded-md bg-white px-2 shadow-sm" variant="line">
          <TabsTrigger value="pending" variant="line">สินทรัพย์รอประมวลผล</TabsTrigger>
          <TabsTrigger value="history" variant="line">ประวัติการประมวลผล</TabsTrigger>
        </TabsList>
      </Tabs>

      {depreciationTab === 'pending' ? (
        <div className="space-y-3">
          <div className="px-1 text-sm text-slate-600">
            พบสินทรัพย์รอประมวลผล <span className="font-semibold text-slate-900">{filteredPendingAssets.length}</span> รายการ
          </div>
          <MiniAssetTable isLoading={isLoading} rows={filteredPendingAssets} />
        </div>
      ) : null}

      {depreciationTab === 'history' ? (
        <div className="space-y-3">
          {/* Pagination Controls */}
          <div className="mb-3 flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
            <div>
              พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
              <span className="mx-2 text-slate-300">/</span>
              ค่าเสื่อมรวม <span className="font-semibold text-slate-900">{formatMoney(totalDepreciationAmount)}</span> บาท
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {columnResize.hasCustomWidths ? (
                <button
                  className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
                  type="button"
                  onClick={columnResize.resetColumnWidths}
                >
                  คืนค่าเดิมตาราง
                </button>
              ) : null}
              <select
                aria-label="จำนวนรายการต่อหน้า"
                className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
                value={pageSize}
                onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}
              >
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
              </select>
              <button
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                disabled={currentPage <= 1}
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                ก่อนหน้า
              </button>
              <span className="px-1">หน้า {currentPage} / {totalPages}</span>
              <button
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                disabled={currentPage >= totalPages}
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                ถัดไป
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        {/* Desktop view */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {depreciationColumns.map((column, index) => {
                if (index === depreciationColumns.length - 1) {
                  return <col key={column.key} style={{ minWidth: column.minWidth }} />
                }
                return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
              })}
            </colgroup>
            <thead className="sticky top-0 bg-slate-100">
              <tr>
                <ResizableTableHead activeSortKey={historySortKey ?? undefined} direction={historySortDirection} label="เลขที่รันค่าเสื่อม" resizeProps={columnResize.getResizeHandleProps('refNo', 'เลขที่รันค่าเสื่อม')} sortKey="refNo" onSort={changeHistorySort} />
                <ResizableTableHead activeSortKey={historySortKey ?? undefined} direction={historySortDirection} label="งวด" resizeProps={columnResize.getResizeHandleProps('period', 'งวด')} sortKey="period" onSort={changeHistorySort} />
                <ResizableTableHead activeSortKey={historySortKey ?? undefined} direction={historySortDirection} label="สินทรัพย์" resizeProps={columnResize.getResizeHandleProps('asset', 'สินทรัพย์')} sortKey="asset" onSort={changeHistorySort} />
                <ResizableTableHead activeSortKey={historySortKey ?? undefined} align="right" direction={historySortDirection} label="ค่าเสื่อมสะสมก่อน" resizeProps={columnResize.getResizeHandleProps('accumBefore', 'ค่าเสื่อมสะสมก่อน')} sortKey="accumBefore" onSort={changeHistorySort} />
                <ResizableTableHead activeSortKey={historySortKey ?? undefined} align="right" direction={historySortDirection} label="ค่าเสื่อมงวดนี้" resizeProps={columnResize.getResizeHandleProps('depreciationAmount', 'ค่าเสื่อมงวดนี้')} sortKey="depreciationAmount" onSort={changeHistorySort} />
                <ResizableTableHead activeSortKey={historySortKey ?? undefined} align="right" direction={historySortDirection} label="ค่าเสื่อมสะสมหลัง" resizeProps={columnResize.getResizeHandleProps('accumAfter', 'ค่าเสื่อมสะสมหลัง')} sortKey="accumAfter" onSort={changeHistorySort} />
                <ResizableTableHead activeSortKey={historySortKey ?? undefined} align="right" direction={historySortDirection} label="NBV ก่อน" resizeProps={columnResize.getResizeHandleProps('nbvBefore', 'NBV ก่อน')} sortKey="nbvBefore" onSort={changeHistorySort} />
                <ResizableTableHead activeSortKey={historySortKey ?? undefined} align="right" direction={historySortDirection} label="NBV หลัง" resizeProps={columnResize.getResizeHandleProps('nbvAfter', 'NBV หลัง')} sortKey="nbvAfter" onSort={changeHistorySort} />
                <ResizableTableHead activeSortKey={historySortKey ?? undefined} align="center" direction={historySortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeHistorySort} />
                <ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('actions', 'จัดการ')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <LoadingOrEmpty colSpan={10} isLoading={isLoading} rows={filteredRows.length} />
              {pagedRows.map((row) => (
                <tr key={row.id} className={`transition-colors hover:bg-slate-50 ${row.status === 'reversed' ? 'bg-slate-50 opacity-70' : ''}`}>
                  <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-red-700">{row.refNo}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.period}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-800">{row.assetName}</div>
                    <div className="text-xs text-slate-400 font-medium font-mono">{row.assetCode}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.accumBefore)}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-medium tabular-nums ${row.depreciationAmount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{formatMoney(row.depreciationAmount)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.accumAfter)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-500">{formatMoney(row.nbvBefore)}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums ${row.nbvAfter > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>{formatMoney(row.nbvAfter)}</td>
                  <td className="px-3 py-3 text-center">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.status === 'reversed' ? (
                      <span className="text-xs text-slate-400 font-medium">{row.reversalReason || '-'}</span>
                    ) : (
                      <button
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-0 transition"
                        disabled={isSaving}
                        onClick={() => setReverseRow(row)}
                        type="button"
                      >
                        ย้อนกลับ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile view */}
        <div className="block lg:hidden divide-y divide-slate-100/60 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล...</div>
          ) : filteredRows.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">ยังไม่มีประวัติการประมวลผลค่าเสื่อม</div>
          ) : (
            pagedRows.map((row) => (
              <div key={row.id} className={`p-4 space-y-2.5 text-xs ${row.status === 'reversed' ? 'opacity-70 bg-slate-50/50' : 'bg-white'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-red-700">{row.refNo}</span>
                  <span className="font-semibold text-slate-500 text-xs">{row.period}</span>
                </div>
                <div>
                  <div className="font-bold text-slate-800">{row.assetCode}</div>
                  <div className="text-xs text-slate-500 font-medium">{row.assetName}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50">
                  <div>
                    <span className="text-slate-400">ค่าเสื่อมงวดนี้:</span>{' '}
                    <span className={`font-bold ${row.depreciationAmount > 0 ? 'text-red-600' : 'text-slate-700'}`}>{formatMoney(row.depreciationAmount)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">สถานะ:</span>{' '}
                    <StatusPill status={row.status} />
                  </div>
                  <div>
                    <span className="text-slate-400">NBV ก่อนรัน:</span>{' '}
                    <span className="font-medium text-slate-600">{formatMoney(row.nbvBefore)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">NBV หลังรัน:</span>{' '}
                    <span className={`font-bold ${row.nbvAfter > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>{formatMoney(row.nbvAfter)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Acc ก่อนรัน:</span>{' '}
                    <span className="font-medium text-slate-600">{formatMoney(row.accumBefore)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Acc หลังรัน:</span>{' '}
                    <span className="font-medium text-slate-600">{formatMoney(row.accumAfter)}</span>
                  </div>
                </div>
                <div className="pt-2 flex justify-between items-center border-t border-slate-100/50">
                  {row.status === 'reversed' ? (
                    <span className="text-xs text-slate-400 italic font-medium">สาเหตุ: {row.reversalReason || '-'}</span>
                  ) : (
                    <>
                      <span />
                      <button
                        className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-0 transition"
                        disabled={isSaving}
                        onClick={() => setReverseRow(row)}
                        type="button"
                      >
                        ย้อนกลับ
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
          </div>
        </div>
      ) : null}


      {preview ? (
        <Modal title={`Preview ค่าเสื่อมงวด ${preview.periodKey}`}>
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <StatCard label="จำนวนรายการ" value={preview.summary.count} />
            <StatCard label="ค่าเสื่อมรวม" value={formatMoney(preview.summary.totalDepreciation)} tone="red" />
            <div className="col-span-2 md:col-span-1">
              <StatCard label="จะ Fully Depreciated" value={preview.summary.willFullyDepreciate} tone="amber" />
            </div>
          </div>
          <TableShell>
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><Th>ทรัพย์สิน</Th><Th align="right">ค่าเสื่อมสะสมก่อน</Th><Th align="right">ค่าเสื่อม</Th><Th align="right">ค่าเสื่อมสะสมหลัง</Th><Th align="right">NBV หลัง</Th><Th align="center">สถานะหลัง Run</Th></tr></thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.assetId} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <Td><div className="font-medium">{row.assetCode}</div><div className="text-slate-400">{row.assetName}</div></Td>
                    <Td align="right">{formatMoney(row.accumBefore)}</Td><Td align="right">{formatMoney(row.depreciationAmount)}</Td><Td align="right">{formatMoney(row.accumAfter)}</Td><Td align="right">{formatMoney(row.nbvAfter)}</Td>
                    <Td align="center">{row.willFullyDepreciate ? <Chip tone="blue">Fully Depreciated</Chip> : <Chip tone="emerald">Active</Chip>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableShell>
          <ModalActions>
            <ActionButton onClick={() => setPreview(null)}>ยกเลิก</ActionButton>
            <ActionButton disabled={isSaving || preview.rows.length === 0} strong onClick={commitRun}>{isSaving ? 'กำลัง Run' : 'Commit Run'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}

      {reverseRow ? (
        <Modal title={`ย้อนกลับค่าเสื่อม ${reverseRow.refNo}`}>
          <div className="space-y-3">
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-medium">{reverseRow.assetCode} - {reverseRow.assetName}</div>
              <div>งวด {reverseRow.period} / ค่าเสื่อม {formatMoney(reverseRow.depreciationAmount)} บาท</div>
            </div>
            <Field label="เหตุผลการย้อนกลับ"><textarea className={`${fieldClass} min-h-24`} value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /></Field>
          </div>
          <ModalActions>
            <ActionButton onClick={() => setReverseRow(null)}>ยกเลิก</ActionButton>
            <ActionButton disabled={isSaving} strong onClick={reverseDepreciation}>{isSaving ? 'กำลังย้อนกลับ' : 'ยืนยันย้อนกลับ'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}
    </section>
  )
}

export function AssetDisposalPageClient() {
  const [data, setData] = useState<DisposalPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<DisposalFormState>(blankDisposalForm)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [modal, setModal] = useState<'create' | 'reverse' | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reverseRow, setReverseRow] = useState<DisposalPayload['rows'][number] | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<DisposalSortKey | null>(null)
  const columnResize = useResizableColumns('finance-accounting.asset-disposal.history.v1', disposalColumns)

  useEffect(() => {
    setPage(1)
  }, [data?.rows])

  const customerOptions = useMemo(() => {
    return (data?.customerOptions ?? []).map((row) => ({
      id: row.id,
      label: `${row.code} - ${row.name}`,
      searchText: `${row.code} ${row.name}`
    }))
  }, [data?.customerOptions])

  const loadData = useCallback(() => {
    setIsLoading(true)
    dailyFetchJson<DisposalPayload>('/api/finance-accounting/asset-disposal')
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลจำหน่ายทรัพย์สินไม่ได้'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => loadData(), [loadData])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((left, right) => {
      const result = compareSortValues(getDisposalSortValue(left, sortKey), getDisposalSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])
  const totalRows = sortedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const changeSort = (key: DisposalSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }

  const selectedAsset = data?.assetOptions.find((asset) => asset.id === form.assetId)
  const sellingPrice = decimalValue(form.sellingPrice)
  const gainLossPreview = sellingPrice - (selectedAsset?.nbv ?? 0)

  const openCreate = () => {
    setForm(blankDisposalForm())
    setError(null)
    setModal('create')
  }

  const updateForm = (field: keyof DisposalFormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const saveDisposal = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: DisposalPayload }>('/api/finance-accounting/asset-disposal', {
        body: JSON.stringify({ ...form, sellingPrice }),
        method: 'POST',
      })
      setData(result.payload)
      setModal(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกจำหน่ายทรัพย์สินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  const openReverse = (row: DisposalPayload['rows'][number]) => {
    setReverseRow(row)
    setReverseReason('')
    setModal('reverse')
  }

  const reverseDisposal = async () => {
    if (!reverseRow) return
    setIsSaving(true)
    setError(null)
    try {
      const result = await dailyFetchJson<{ payload: DisposalPayload }>('/api/finance-accounting/asset-disposal', {
        body: JSON.stringify({ action: 'reverse', id: reverseRow.id, reason: reverseReason }),
        method: 'PATCH',
      })
      setData(result.payload)
      setModal(null)
      setReverseRow(null)
      setReverseReason('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ย้อนกลับรายการจำหน่ายทรัพย์สินไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      {/* Desktop Toolbar */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <Chip tone="blue">ทรัพย์สินที่จำหน่ายได้ {data?.summary.activeAssets ?? 0}</Chip>
        <Chip tone="emerald">บันทึกแล้ว {data?.summary.disposedRows ?? 0}</Chip>
        <Chip tone="amber">ย้อนกลับแล้ว {data?.summary.reversedRows ?? 0}</Chip>
        <div className="ml-auto">
          <button
            type="button"
            onClick={openCreate}
            className="h-9 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition outline-none"
          >
            + จำหน่ายทรัพย์สิน
          </button>
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-md bg-white p-3 shadow lg:hidden">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-1.5">
            <div className="text-xs text-slate-500 font-semibold">จำหน่ายได้</div>
            <div className="text-xs font-bold text-blue-700">{data?.summary.activeAssets ?? 0}</div>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-1.5">
            <div className="text-xs text-slate-500 font-semibold">บันทึกแล้ว</div>
            <div className="text-xs font-bold text-emerald-700">{data?.summary.disposedRows ?? 0}</div>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-100 p-1.5">
            <div className="text-xs text-slate-500 font-semibold">ย้อนกลับ</div>
            <div className="text-xs font-bold text-amber-700">{data?.summary.reversedRows ?? 0}</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StatCard label="ยอดขายรวม (Proceeds)" value={formatMoney(data?.summary.proceeds)} tone="blue" icon="💵" />
        <StatCard label="กำไร/(ขาดทุน) สุทธิ" value={formatMoney(data?.summary.gainLoss)} tone={(data?.summary.gainLoss ?? 0) >= 0 ? 'emerald' : 'red'} icon="📈" />
      </div>
      {/* Pagination Controls */}
      <div className="mb-3 flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {columnResize.hasCustomWidths ? (
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          ) : null}
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={pageSize}
            onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </select>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={currentPage <= 1}
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            ก่อนหน้า
          </button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={currentPage >= totalPages}
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            ถัดไป
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        {/* Desktop view */}
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {disposalColumns.map((column, index) => {
                if (index === disposalColumns.length - 1) {
                  return <col key={column.key} style={{ minWidth: column.minWidth }} />
                }
                return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
              })}
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="เลขที่จำหน่าย" resizeProps={columnResize.getResizeHandleProps('disposalNo', 'เลขที่จำหน่าย')} sortKey="disposalNo" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="สินทรัพย์" resizeProps={columnResize.getResizeHandleProps('asset', 'สินทรัพย์')} sortKey="asset" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('disposalType', 'ประเภท')} sortKey="disposalType" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ราคาขาย" resizeProps={columnResize.getResizeHandleProps('sellingPrice', 'ราคาขาย')} sortKey="sellingPrice" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="NBV ณ วันจำหน่าย" resizeProps={columnResize.getResizeHandleProps('nbv', 'NBV ณ วันจำหน่าย')} sortKey="nbv" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="กำไร/(ขาดทุน)" resizeProps={columnResize.getResizeHandleProps('gainLoss', 'กำไรหรือขาดทุน')} sortKey="gainLoss" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="เหตุผล" resizeProps={columnResize.getResizeHandleProps('reason', 'เหตุผล')} sortKey="reason" onSort={changeSort} />
                <ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeSort} />
                <ResizableTableHead align="center" label="จัดการ" resizeProps={columnResize.getResizeHandleProps('actions', 'จัดการ')} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <LoadingOrEmpty colSpan={10} isLoading={isLoading} rows={rows.length} emptyText="ยังไม่มีรายการจำหน่ายทรัพย์สิน" />
              {pagedRows.map((row) => (
                <tr key={row.id} className={`transition-colors hover:bg-slate-50 ${row.status === 'reversed' ? 'bg-slate-50 opacity-70' : ''}`}>
                  <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-slate-700">{row.disposalNo}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{row.date}</td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-slate-800">{row.assetCode}</div>
                    <div className="text-xs text-slate-400 font-medium">{row.assetName}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-700">{row.disposalType}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.sellingPrice)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-500">{formatMoney(row.nbv)}</td>
                  <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums ${(row.gainLoss ?? 0) > 0 ? 'text-emerald-700' : (row.gainLoss ?? 0) < 0 ? 'text-red-700' : 'text-slate-700'}`}>{formatMoney(row.gainLoss)}</td>
                  <td className="min-w-0 px-3 py-3 text-slate-500" title={row.reason}>
                    <div className="truncate">{row.reason || '-'}</div>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    {row.status === 'reversed' ? (
                      <span className="text-xs text-slate-400 font-medium">{row.reversalReason || '-'}</span>
                    ) : (
                      <button
                        className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-0 transition"
                        disabled={isSaving}
                        onClick={() => openReverse(row)}
                        type="button"
                      >
                        ย้อนกลับ
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile view */}
        <div className="block lg:hidden divide-y divide-slate-100/60 max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="py-8 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล...</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">ยังไม่มีรายการจำหน่ายทรัพย์สิน</div>
          ) : (
            pagedRows.map((row) => (
              <div key={row.id} className={`p-4 space-y-2.5 text-xs ${row.status === 'reversed' ? 'opacity-70 bg-slate-50/50' : 'bg-white'}`}>
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold text-slate-700">{row.disposalNo}</span>
                  <span className="font-semibold text-slate-500 text-xs">{row.date}</span>
                </div>
                <div>
                  <div className="font-bold text-slate-800">{row.assetCode}</div>
                  <div className="text-xs text-slate-500 font-medium">{row.assetName}</div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50">
                  <div>
                    <span className="text-slate-400">ประเภท:</span>{' '}
                    <span className="font-semibold text-slate-700">{row.disposalType}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">ราคาขาย:</span>{' '}
                    <span className="font-bold text-slate-800">{formatMoney(row.sellingPrice)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">NBV ณ วันจำหน่าย:</span>{' '}
                    <span className="font-medium text-slate-600">{formatMoney(row.nbv)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">กำไร/(ขาดทุน):</span>{' '}
                    <span className={`font-bold ${(row.gainLoss ?? 0) > 0 ? 'text-emerald-700' : (row.gainLoss ?? 0) < 0 ? 'text-red-700' : 'text-slate-700'}`}>{formatMoney(row.gainLoss)}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400">สถานะ:</span>{' '}
                    <StatusPill status={row.status} />
                  </div>
                </div>
                {row.reason && (
                  <div className="text-xs bg-slate-50 p-2 rounded border border-slate-100 text-slate-600">
                    <span className="font-semibold text-slate-700">เหตุผล:</span> {row.reason}
                  </div>
                )}
                <div className="pt-2 flex justify-between items-center border-t border-slate-100/50">
                  {row.status === 'reversed' ? (
                    <span className="text-xs text-slate-400 italic font-medium">สาเหตุ: {row.reversalReason || '-'}</span>
                  ) : (
                    <>
                      <span />
                      <button
                        className="rounded-md border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-0 transition"
                        disabled={isSaving}
                        onClick={() => openReverse(row)}
                        type="button"
                      >
                        ย้อนกลับ
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>


      {modal === 'create' ? (
        <Modal title="จำหน่ายทรัพย์สิน">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-2">
            <Field label="ทรัพย์สิน"><IdOptionSelect blankLabel="-เลือกทรัพย์สิน-" options={data?.assetOptions ?? []} value={form.assetId} onChange={(value) => updateForm('assetId', value)} /></Field>
            <Field label="วันที่"><input className={fieldClass} type="date" value={form.disposalDate} onChange={(event) => updateForm('disposalDate', event.target.value)} /></Field>
            <Field label="ประเภท"><SelectControl options={data?.disposalTypes ?? []} value={form.disposalType} onChange={(value) => updateForm('disposalType', value)} /></Field>
            <MoneyField label="ราคาขาย" value={form.sellingPrice} onChange={(value) => updateForm('sellingPrice', value)} />
            <div className="w-full">
                <SearchCombobox
                  inputId="form-customer"
                  label="ลูกค้า"
                  options={customerOptions}
                  value={form.customerId}
                  onChange={(value) => updateForm('customerId', value)}
                  placeholder="พิมพ์เพื่อค้นหาลูกค้า..."
                />
            </div>
            <Field label="เลขอ้างอิงรับเงิน"><input className={fieldClass} value={form.receiptRefNo} onChange={(event) => updateForm('receiptRefNo', event.target.value)} /></Field>
            <div className="col-span-2"><Field label="เหตุผล"><textarea className={`${fieldClass} min-h-20`} value={form.reason} onChange={(event) => updateForm('reason', event.target.value)} /></Field></div>
            <div className="col-span-2"><Field label="หมายเหตุ"><textarea className={`${fieldClass} min-h-20`} value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} /></Field></div>
          </div>
          {selectedAsset ? (
            <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <div>NBV ปัจจุบัน: <span className="font-semibold">{formatMoney(selectedAsset.nbv)}</span></div>
              <div>กำไร/(ขาดทุน) คาดการณ์: <span className={`font-semibold ${gainLossPreview > 0 ? 'text-emerald-700' : gainLossPreview < 0 ? 'text-red-700' : 'text-slate-700'}`}>{formatMoney(gainLossPreview)}</span></div>
            </div>
          ) : null}
          <ModalActions>
            <ActionButton onClick={() => setModal(null)}>ยกเลิก</ActionButton>
            <ActionButton disabled={isSaving || !form.assetId} strong onClick={saveDisposal}>{isSaving ? 'กำลังบันทึก' : 'บันทึก'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}

      {modal === 'reverse' && reverseRow ? (
        <Modal title={`ย้อนกลับรายการจำหน่าย ${reverseRow.disposalNo}`}>
          <div className="space-y-3">
            <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <div className="font-medium">{reverseRow.assetCode} - {reverseRow.assetName}</div>
              <div>{reverseRow.disposalType} / กำไร(ขาดทุน) {formatMoney(reverseRow.gainLoss)} บาท</div>
            </div>
            <Field label="เหตุผลการย้อนกลับ"><textarea className={`${fieldClass} min-h-24`} value={reverseReason} onChange={(event) => setReverseReason(event.target.value)} /></Field>
          </div>
          <ModalActions>
            <ActionButton onClick={() => setModal(null)}>ยกเลิก</ActionButton>
            <ActionButton disabled={isSaving} strong onClick={reverseDisposal}>{isSaving ? 'กำลังย้อนกลับ' : 'ยืนยันย้อนกลับ'}</ActionButton>
          </ModalActions>
        </Modal>
      ) : null}

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-40 lg:hidden">
        <button
          className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg active:scale-95 transition-transform focus:outline-none text-2xl font-bold hover:bg-blue-700"
          onClick={openCreate}
          type="button"
          aria-label="จำหน่ายสินทรัพย์"
        >
          +
        </button>
      </div>
    </section>
  )
}

function getAssetRegisterSortValue(row: AssetRegisterRow, key: AssetRegisterSortKey) {
  if (key === 'assetName') return `${row.name} ${row.location}`
  if (key === 'status') return row.assetStatus
  return row[key]
}

function getDepreciationSortValue(row: DepreciationPayload['rows'][number], key: DepreciationSortKey) {
  if (key === 'asset') return `${row.assetCode} ${row.assetName}`
  return row[key]
}

function getDisposalSortValue(row: DisposalPayload['rows'][number], key: DisposalSortKey) {
  if (key === 'asset') return `${row.assetCode} ${row.assetName}`
  return row[key]
}

function getPendingAssetSortValue(row: DepreciationPayload['pendingAssets'][number], key: PendingAssetSortKey) {
  if (key === 'status') return row.assetStatus
  return row[key]
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left ?? '').localeCompare(String(right ?? ''), 'th', { numeric: true, sensitivity: 'base' })
}

function assetRowToForm(row: AssetRegisterRow): AssetFormState {
  return {
    acquisitionType: row.acquisitionType,
    assetStatus: row.assetStatus,
    branchId: row.branchId,
    category: row.category,
    chassisNo: row.chassisNo,
    code: row.code,
    department: row.department,
    depreciationMethod: row.depreciationMethod,
    engineNo: row.engineNo,
    id: row.id,
    insurancePolicyNo: row.insurancePolicyNo,
    licensePlate: row.licensePlate,
    location: row.location,
    name: row.name,
    netAssetCost: formatInputNumber(row.netAssetCost),
    notes: row.notes,
    originalCost: formatInputNumber(row.originalCost),
    purchaseDate: row.purchaseDate,
    responsiblePerson: row.responsiblePerson,
    salvageValue: formatInputNumber(row.salvageValue),
    serialNo: row.serialNo,
    supplierId: row.supplierId,
    usefulLifeMonths: String(row.usefulLifeMonths || 60),
    vatAmount: formatInputNumber(row.vatAmount),
    warrantyExpireDate: row.warrantyExpireDate,
  }
}

function decimalValue(value: string) {
  const amount = Number(String(value || '').replace(/,/g, ''))
  return Number.isFinite(amount) ? amount : 0
}

function formatInputNumber(value: number) {
  return Number.isFinite(value) && value !== 0 ? String(Number(value.toFixed(2))) : ''
}

function formToPayload(form: AssetFormState | Omit<AssetFormState, 'id'>) {
  return {
    ...form,
    netAssetCost: decimalValue(form.netAssetCost),
    originalCost: decimalValue(form.originalCost),
    salvageValue: decimalValue(form.salvageValue),
    usefulLifeMonths: Number(form.usefulLifeMonths || 0),
    vatAmount: decimalValue(form.vatAmount),
  }
}

function parseAssetImportText(content: string): Omit<AssetFormState, 'id'>[] {
  const delimiter = content.includes('\t') ? '\t' : ','
  const lines = content.split(/\r?\n/).filter((line) => line.trim())
  const headers = splitDelimitedLine(lines[0] ?? '', delimiter).map((header) => header.trim().toLowerCase())
  return lines.slice(1).map((line) => {
    const cells = splitDelimitedLine(line, delimiter)
    const value = (header: string) => {
      const index = headers.indexOf(header)
      return index >= 0 ? (cells[index] ?? '').trim() : ''
    }
    return {
      acquisitionType: value('acquisition_type') || 'Purchased',
      assetStatus: value('asset_status') || 'Active',
      branchId: value('branch_code'),
      category: value('category') || 'Other',
      chassisNo: value('chassis_no'),
      code: value('asset_code').toUpperCase(),
      department: value('department'),
      depreciationMethod: value('depreciation_method') || 'Straight Line',
      engineNo: value('engine_no'),
      insurancePolicyNo: value('insurance_policy_no'),
      licensePlate: value('license_plate'),
      location: value('location'),
      name: value('asset_name'),
      netAssetCost: value('net_asset_cost'),
      notes: value('notes'),
      originalCost: value('original_cost'),
      purchaseDate: value('purchase_date'),
      responsiblePerson: value('responsible_person'),
      salvageValue: value('salvage_value') || '0',
      serialNo: value('serial_no'),
      supplierId: value('supplier_code'),
      usefulLifeMonths: value('useful_life_months') || '60',
      vatAmount: value('vat_amount') || '0',
      warrantyExpireDate: value('warranty_expire_date'),
    }
  })
}

function splitDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current)
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current)
  return cells
}

function Modal({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
      <div className="mt-8 w-full max-w-5xl overflow-hidden rounded-md bg-white shadow-xl">
        <div className="bg-slate-900 px-6 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}

function ModalActions({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">{children}</div>
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="block text-xs font-medium text-slate-600"><span className="mb-1 block">{label}</span>{children}</label>
}

function SelectControl({ onChange, options, value }: { onChange: (value: string) => void; options: string[]; value: string }) {
  return <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
}

function OptionSelect({ blankLabel, onChange, options, value }: { blankLabel: string; onChange: (value: string) => void; options: { code: string; name: string }[]; value: string }) {
  return <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{blankLabel}</option>{options.map((option) => <option key={option.code} value={option.code}>{option.code} - {option.name}</option>)}</select>
}

function IdOptionSelect({ blankLabel, onChange, options, value }: { blankLabel: string; onChange: (value: string) => void; options: { code: string; id: string; name: string }[]; value: string }) {
  return <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{blankLabel}</option>{options.map((option) => <option key={option.id} value={option.id}>{option.code} - {option.name}</option>)}</select>
}

function MoneyField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <Field label={label}><input className={fieldClass} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} /></Field>
}

function ActionButton({ children, disabled = false, onClick, strong = false }: { children: ReactNode; disabled?: boolean; onClick: () => void; strong?: boolean }) {
  const color = strong
    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm focus:outline-none focus:ring-0'
    : 'bg-transparent text-slate-500 hover:text-slate-800 border-none shadow-none focus:outline-none focus:ring-0'
  return <button className={`${color} rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 transition`} disabled={disabled} onClick={onClick} type="button">{children}</button>
}

function DisabledButton({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <button className={`${strong ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'} rounded-md px-4 py-2 text-sm font-medium shadow-sm opacity-65 focus:outline-none focus:ring-0`} disabled type="button">{children}</button>
}

function LinkButton({ children, href }: { children: ReactNode; href: string }) {
  return <a className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 transition hover:bg-slate-50 outline-none focus:ring-0" href={href}>{children}</a>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-slate-900 text-sm">{title}</h2>
      {children}
    </div>
  )
}

function FilterPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
      {children}
    </div>
  )
}

function TableShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      {title ? (
        <h2 className="border-b border-slate-200 px-4 py-3 font-bold text-slate-900 text-sm bg-slate-50/50">{title}</h2>
      ) : null}
      <div className="max-h-[60vh] overflow-auto">
        {children}
      </div>
    </div>
  )
}

function StatCard({ label, tone, value, icon }: { label: string; tone?: 'amber' | 'emerald' | 'red' | 'blue'; value: number | string; icon?: string }) {
  const isZero = isZeroDisplayValue(value)
  const labelColor = isZero ? 'text-slate-500' : tone === 'amber' ? 'text-amber-600' : tone === 'emerald' ? 'text-emerald-600' : tone === 'red' ? 'text-red-600' : tone === 'blue' ? 'text-blue-600' : 'text-slate-500'
  const iconBgColor = isZero ? 'bg-slate-100 text-slate-500' : tone === 'amber' ? 'bg-amber-50 text-amber-600' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-600' : tone === 'red' ? 'bg-red-50 text-red-600' : tone === 'blue' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-600'
  return (
    <div className="bg-white p-3 sm:p-5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
      {icon && (
        <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${iconBgColor} flex items-center justify-center text-xl shrink-0`}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={`text-xs font-semibold ${labelColor} truncate`}>{label}</div>
        <div className="mt-0.5 text-sm sm:text-base font-bold text-slate-900 tracking-tight">{value}</div>
      </div>
    </div>
  )
}

function isZeroDisplayValue(value: number | string) {
  if (typeof value === 'number') return value === 0
  const numericValue = Number(value.replace(/,/g, ''))
  return Number.isFinite(numericValue) && numericValue === 0
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-bold text-slate-900 text-xs">{value}</div>
    </div>
  )
}

function Bar({ label, max, value }: { label: string; max: number; value: number }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">{formatMoney(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full bg-amber-500" style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function MiniAssetTable({ isLoading, rows }: { isLoading: boolean; rows: DepreciationPayload['pendingAssets'] }) {
  const columnResize = useResizableColumns('finance-accounting.depreciation.pending-assets.v1', pendingAssetColumns)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [sortKey, setSortKey] = useState<PendingAssetSortKey | null>(null)

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((left, right) => {
      const result = compareSortValues(getPendingAssetSortValue(left, sortKey), getPendingAssetSortValue(right, sortKey))
      return sortDirection === 'asc' ? result : -result
    })
  }, [rows, sortDirection, sortKey])

  const changeSort = (key: PendingAssetSortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDirection('asc')
  }

  return (
    <div>
      {/* Desktop view */}
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        {columnResize.hasCustomWidths ? (
          <div className="flex justify-end border-b border-slate-100 bg-white px-3 py-2">
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
              type="button"
              onClick={columnResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          </div>
        ) : null}
        <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {pendingAssetColumns.map((column, index) => {
              if (index === pendingAssetColumns.length - 1) {
                return <col key={column.key} style={{ minWidth: column.minWidth }} />
              }
              return <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            })}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="รหัสทรัพย์สิน" resizeProps={columnResize.getResizeHandleProps('code', 'รหัสทรัพย์สิน')} sortKey="code" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="ชื่อทรัพย์สิน" resizeProps={columnResize.getResizeHandleProps('name', 'ชื่อทรัพย์สิน')} sortKey="name" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ต้นทุนสุทธิ" resizeProps={columnResize.getResizeHandleProps('netAssetCost', 'ต้นทุนสุทธิ')} sortKey="netAssetCost" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ค่าเสื่อมสะสมเดิม" resizeProps={columnResize.getResizeHandleProps('accumDep', 'ค่าเสื่อมสะสมเดิม')} sortKey="accumDep" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="NBV ปัจจุบัน" resizeProps={columnResize.getResizeHandleProps('nbv', 'NBV ปัจจุบัน')} sortKey="nbv" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="ค่าเสื่อม/เดือน" resizeProps={columnResize.getResizeHandleProps('monthlyDep', 'ค่าเสื่อมต่อเดือน')} sortKey="monthlyDep" onSort={changeSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="center" direction={sortDirection} label="สถานะ" resizeProps={columnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <LoadingOrEmpty colSpan={7} isLoading={isLoading} rows={rows.length} />
            {sortedRows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-3 font-mono font-bold text-amber-700">{row.code}</td>
                <td className="px-3 py-3 font-semibold text-slate-800">{row.name}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.netAssetCost)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-500">{formatMoney(row.accumDep)}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-bold tabular-nums ${row.nbv > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>{formatMoney(row.nbv)}</td>
                <td className={`whitespace-nowrap px-3 py-3 text-right font-mono font-medium tabular-nums ${row.monthlyDep > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{formatMoney(row.monthlyDep)}</td>
                <td className="px-3 py-3 text-center"><StatusPill status={row.assetStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden space-y-2.5">
        {isLoading ? (
          <div className="text-center text-xs text-slate-400 py-6">กำลังโหลดข้อมูล...</div>
        ) : sortedRows.length === 0 ? (
          <div className="text-center text-xs text-slate-400 py-6">ไม่มีรายการทรัพย์สินที่ต้องประมวลผล</div>
        ) : (
          sortedRows.map((row) => (
            <div key={row.id} className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-mono text-xs text-amber-700 font-bold">{row.code}</span>
                <StatusPill status={row.assetStatus} />
              </div>
              <div className="text-xs font-semibold text-slate-800">{row.name}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-400">ต้นทุนสุทธิ:</span> <span className="font-medium text-slate-700">{formatMoney(row.netAssetCost)}</span></div>
                <div><span className="text-slate-400">ค่าเสื่อมสะสมเดิม:</span> <span className="font-medium text-slate-500">{formatMoney(row.accumDep)}</span></div>
                <div><span className="text-slate-400">NBV:</span> <span className={`font-bold ${row.nbv > 0 ? 'text-emerald-700' : 'text-slate-700'}`}>{formatMoney(row.nbv)}</span></div>
                <div><span className="text-slate-400">ค่าเสื่อม/เดือน:</span> <span className={`font-bold ${row.monthlyDep > 0 ? 'text-amber-700' : 'text-slate-700'}`}>{formatMoney(row.monthlyDep)}</span></div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function AssetRegisterEmptyRow({
  colSpan,
  hasFilters,
}: {
  colSpan: number
  hasFilters: boolean
}) {
  return (
    <tr>
      <td className="px-3 py-10" colSpan={colSpan}>
        <AssetRegisterEmptyState hasFilters={hasFilters} />
      </td>
    </tr>
  )
}

function AssetRegisterEmptyState({
  hasFilters,
}: {
  hasFilters: boolean
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-5 py-6 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg text-slate-500 shadow-sm">🏢</div>
      <div className="mt-3 text-sm font-semibold text-slate-800">
        {hasFilters ? 'ไม่พบทรัพย์สินตามตัวกรอง' : 'ยังไม่มีทรัพย์สินในระบบ'}
      </div>
      <div className="mt-1 text-xs leading-5 text-slate-500">
        {hasFilters ? 'ลองปรับคำค้นหา หมวด หรือสถานะ แล้วตรวจรายการอีกครั้ง' : 'ใช้ปุ่ม + เพื่อเพิ่มทรัพย์สิน หรือ import จากไฟล์ CSV template'}
      </div>
    </div>
  )
}

function LoadingOrEmpty({ colSpan, emptyText = 'ยังไม่มีข้อมูล', isLoading, rows }: { colSpan: number; emptyText?: string; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>{emptyText}</td></tr>
  return null
}

function Th({ align = 'left', children, className = '' }: { align?: 'center' | 'left' | 'right'; children: ReactNode; className?: string }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`whitespace-nowrap px-4 py-2.5 font-bold text-slate-600 bg-slate-50 border-b border-slate-100 ${textAlign} ${className}`}>{children}</th>
}

function Td({ align = 'left', children, strong = false, className = '', title }: { align?: 'center' | 'left' | 'right'; children: ReactNode; strong?: boolean; className?: string; title?: string }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td title={title} className={`whitespace-nowrap px-4 py-3 border-b border-slate-100/60 ${textAlign} ${strong ? 'font-bold text-slate-900' : 'text-slate-700'} ${className}`}>{children}</td>
}

function Chip({ children, tone }: { children: ReactNode; tone: 'amber' | 'blue' | 'emerald' }) {
  const color = tone === 'blue' ? 'bg-blue-50 text-blue-700' : tone === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{children}</span>
}

function StatusPill({ status }: { status: string }) {
  let color = 'bg-slate-100 text-slate-700'
  let text = status

  if (status === 'Active' || status === 'active' || status === 'posted') {
    color = 'bg-emerald-50 text-emerald-700'
    text = status === 'posted' ? 'ประมวลผลแล้ว (posted)' : 'พร้อมใช้งาน (Active)'
  } else if (status === 'Fully Depreciated') {
    color = 'bg-blue-50 text-blue-700'
    text = 'หักค่าเสื่อมครบแล้ว'
  } else if (status === 'Maintenance') {
    color = 'bg-amber-50 text-amber-700'
    text = 'ซ่อมบำรุง'
  }

  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{text}</span>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
