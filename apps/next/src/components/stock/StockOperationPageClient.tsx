'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import type { StatusConvertFormValues, StockAdjustFormValues, StockConvertFormValues, StockCostPoolOption, StockOption } from '@/lib/stock'

type Mode = 'adjust' | 'convert' | 'status-convert'
type Payload = {
  reference: { branches: StockOption[]; costPoolEntries?: StockCostPoolOption[]; customers?: StockOption[]; products: StockOption[]; warehouses: StockOption[] }
  rows: Array<Record<string, string | number | boolean | null>>
}
type OperationColumn = {
  cellClassName?: string
  headerClassName?: string
  key: string
  label: string
  sortable?: boolean
}
type SortDirection = 'asc' | 'desc'
type StatusConvertSortKey =
  | 'createdAt'
  | 'createdBy'
  | 'date'
  | 'locationDisplay'
  | 'lotNo'
  | 'note'
  | 'productDisplay'
  | 'qty'
  | 'refNo'
  | 'statusFlow'
  | 'unitCost'
  | 'value'

const STATUS_CONVERT_PAGE_SIZES = [10, 20, 50, 100]

type StockConvertDetailLine = {
  allocationStatus: string
  lineNo: number
  qty: number
  reversedAt: string | null
  sourceLotNo: string | null
  sourcePoolId: string | null
  sourceProduct: string
  sourceRefNo: string | null
  sourceType: string | null
  targetLotNo: string | null
  targetPoolId: string | null
  targetPoolStatus: string | null
  targetProduct: string
  totalCost: number
  unitCost: number
}

type StockConvertDetail = {
  allocationMethod: string
  branchWarehouse: string
  date: string
  lines: StockConvertDetailLine[]
  lossQty: number
  notes: string | null
  reason: string | null
  refNo: string
  sourceLotNo: string | null
  sourceQty: number
  sourceUnitCost: number
  status: string
  targetCostPolicy: string
  targetCostReason: string | null
  targetCostVariance: number
  targetLotNo: string | null
  targetQty: number
  targetUnitCost: number
}

const config = {
  adjust: {
    accent: 'from-amber-600 to-orange-600',
    api: '/api/stock/adjust',
    title: 'Stock Count Adjustment / ปรับสต๊อกจากการนับจริง',
  },
  convert: {
    accent: 'from-cyan-700 to-teal-700',
    api: '/api/stock/convert',
    title: 'Grade Adjustment / ปรับเกรดสินค้า',
  },
  'status-convert': {
    accent: 'from-purple-700 to-pink-700',
    api: '/api/stock/status-convert',
    title: 'ปรับสถานะสินค้า / Status Convert',
  },
} satisfies Record<Mode, { accent: string; api: string; title: string }>

export function StockOperationPageClient({ mode }: { mode: Mode }) {
  const meta = config[mode]
  const pathname = usePathname()
  const [data, setData] = useState<Payload>({ reference: { branches: [], products: [], warehouses: [] }, rows: [] })
  const [error, setError] = useState<string | null>(null)
  const [adjustBranchFilter, setAdjustBranchFilter] = useState('')
  const [adjustTypeFilter, setAdjustTypeFilter] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [fromDateFilter, setFromDateFilter] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [costStatusFilter, setCostStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sourceTypeFilter, setSourceTypeFilter] = useState('')
  const [toDateFilter, setToDateFilter] = useState('')
  const [statusConvertPage, setStatusConvertPage] = useState(1)
  const [statusConvertPageSize, setStatusConvertPageSize] = useState(20)
  const [statusConvertSortDirection, setStatusConvertSortDirection] = useState<SortDirection>('desc')
  const [statusConvertSortKey, setStatusConvertSortKey] = useState<StatusConvertSortKey>('date')
  const [convertDetail, setConvertDetail] = useState<StockConvertDetail | null>(null)
  const [isConvertDetailLoading, setIsConvertDetailLoading] = useState(false)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<Payload>(meta.api))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [meta.api])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (window.location.search.includes('new=1')) setFormOpen(true)
  }, [])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return data.rows
      .filter((row) => !query || Object.values(row).join(' ').toLowerCase().includes(query))
      .filter((row) => mode !== 'convert' || !sourceTypeFilter || row.sourceType === sourceTypeFilter)
      .filter((row) => mode !== 'convert' || !costStatusFilter || row.costStatus === costStatusFilter)
      .filter((row) => mode !== 'adjust' || !adjustBranchFilter || row.branchId === adjustBranchFilter)
      .filter((row) => mode !== 'adjust' || !adjustTypeFilter || row.adjustType === adjustTypeFilter)
      .filter((row) => mode !== 'adjust' || !fromDateFilter || String(row.date ?? '') >= fromDateFilter)
      .filter((row) => mode !== 'adjust' || !toDateFilter || String(row.date ?? '') <= toDateFilter)
  }, [adjustBranchFilter, adjustTypeFilter, costStatusFilter, data.rows, fromDateFilter, mode, search, sourceTypeFilter, toDateFilter])

  useEffect(() => {
    if (mode === 'status-convert') setStatusConvertPage(1)
  }, [mode, rows.length, search])

  const statusConvertSortedRows = useMemo(() => {
    if (mode !== 'status-convert') return rows
    return [...rows].sort((left, right) => compareStatusConvertRows(left, right, statusConvertSortKey, statusConvertSortDirection))
  }, [mode, rows, statusConvertSortDirection, statusConvertSortKey])

  const statusConvertTotalPages = useMemo(() => {
    if (mode !== 'status-convert') return 1
    return Math.max(1, Math.ceil(statusConvertSortedRows.length / statusConvertPageSize))
  }, [mode, statusConvertPageSize, statusConvertSortedRows.length])

  useEffect(() => {
    if (mode !== 'status-convert') return
    setStatusConvertPage((currentPage) => Math.min(currentPage, statusConvertTotalPages))
  }, [mode, statusConvertTotalPages])

  const visibleRows = useMemo(() => {
    if (mode !== 'status-convert') return rows
    const startIndex = (statusConvertPage - 1) * statusConvertPageSize
    return statusConvertSortedRows.slice(startIndex, startIndex + statusConvertPageSize)
  }, [mode, rows, statusConvertPage, statusConvertPageSize, statusConvertSortedRows])

  function toggleStatusConvertSort(nextKey: StatusConvertSortKey) {
    if (statusConvertSortKey === nextKey) {
      setStatusConvertSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'))
      return
    }
    setStatusConvertSortKey(nextKey)
    setStatusConvertSortDirection(nextKey === 'date' ? 'desc' : 'asc')
  }

  async function submit(values: StatusConvertFormValues | StockConvertFormValues | StockAdjustFormValues) {
    setError(null)
    setIsSaving(true)
    try {
      await dailyFetchJson(meta.api, { body: JSON.stringify(values), method: 'POST' })
      setFormOpen(false)
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'บันทึกข้อมูลไม่ได้')
    } finally {
      setIsSaving(false)
    }
  }

  async function reverseConvert(refNo: string) {
    if (!window.confirm(`Reverse Grade Adjustment ${refNo} ?`)) return
    setError(null)
    setIsSaving(true)
    try {
      await dailyFetchJson(meta.api, { body: JSON.stringify({ action: 'reverse', refNo }), method: 'PATCH' })
      await loadData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Reverse ไม่สำเร็จ')
    } finally {
      setIsSaving(false)
    }
  }

  async function openConvertDetail(refNo: string) {
    setError(null)
    setIsConvertDetailLoading(true)
    try {
      const payload = await dailyFetchJson<{ detail: StockConvertDetail }>(`${meta.api}?detail=${encodeURIComponent(refNo)}`)
      setConvertDetail(payload.detail)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียดปรับเกรดไม่ได้')
    } finally {
      setIsConvertDetailLoading(false)
    }
  }

  function exportConvertDetail(refNo: string) {
    const link = document.createElement('a')
    link.href = `${meta.api}?detail=${encodeURIComponent(refNo)}&format=csv`
    link.download = `stock-convert-${refNo}-allocation.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {mode === 'adjust' ? <AdjustPrincipleBox /> : null}
      <SummaryCards mode={mode} rows={rows} />
      <div className="rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
            <input className="h-9 w-full min-w-[260px] flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder={mode === 'convert' ? 'ค้นหา doc/source/target/ref...' : mode === 'adjust' ? 'ค้นหา doc/สินค้า/เหตุผล...' : 'ค้นหาเลขที่/วันที่/สินค้า/เหตุผล...'} type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            {mode === 'status-convert' && search ? (
              <button className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={() => setSearch('')}>
                ล้างค้นหา
              </button>
            ) : null}
          </div>
          {mode === 'convert' ? (
            <>
              <select className="h-9 rounded-md border bg-amber-50 px-3 py-2 text-sm font-medium" value={sourceTypeFilter} onChange={(event) => setSourceTypeFilter(event.target.value)}>
                <option value="">ทุก Source Type</option>
                <option value="Manual">📝 Manual</option>
                <option value="Auto (FIFO)">Auto FIFO</option>
                <option value="Auto (LIFO)">Auto LIFO</option>
                <option value="Auto (HIGHEST_COST)">Auto Highest Cost</option>
                <option value="Auto (LOWEST_COST)">Auto Lowest Cost</option>
                <option value="Legacy">Legacy</option>
              </select>
              <select className="h-9 rounded-md border px-3 py-2 text-sm" value={costStatusFilter} onChange={(event) => setCostStatusFilter(event.target.value)}>
                <option value="">ทุก Cost Status</option>
                <option value="allocated">✓ Allocated</option>
                <option value="pending_cost">⏳ Pending Cost</option>
                <option value="partial">📋 Partial</option>
              </select>
            </>
          ) : mode === 'adjust' ? (
            <>
              <select className="h-9 rounded-md border px-3 py-2 text-sm" value={adjustBranchFilter} onChange={(event) => setAdjustBranchFilter(event.target.value)}>
                <option value="">ทุกสาขา</option>
                {data.reference.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <select className="h-9 rounded-md border px-3 py-2 text-sm" value={adjustTypeFilter} onChange={(event) => setAdjustTypeFilter(event.target.value)}>
                <option value="">ทุกประเภท</option>
                <option value="LOSS">📉 นับขาด</option>
                <option value="GAIN">📈 นับเกิน</option>
              </select>
              <DatePickerInput className="w-[130px]" title="จากวันที่" value={fromDateFilter} onChange={setFromDateFilter} />
              <DatePickerInput className="w-[130px]" title="ถึงวันที่" value={toDateFilter} onChange={setToDateFilter} />
              <button className="h-9 rounded-md bg-slate-700 px-3 py-2 text-sm text-white opacity-60" disabled title="รอ export contract สำหรับ stock adjustment" type="button">📥 CSV</button>
            </>
          ) : null}
          
          <div className="flex items-center gap-2 ml-auto">
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors" type="button" onClick={() => void loadData()}>
              Refresh
            </button>
            {mode === 'adjust' ? (
              <a className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors" href={`${pathname}?new=1`}>
                + ปรับสต๊อกใหม่
              </a>
            ) : mode === 'convert' ? (
              <a className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors" href={`${pathname}?new=1`}>
                + ปรับเกรดใหม่
              </a>
            ) : mode === 'status-convert' ? (
              <a className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors" href={`${pathname}?new=1`}>
                + ปรับสถานะใหม่
              </a>
            ) : (
              <a className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 transition-colors" href={`${pathname}?new=1`}>
                + เพิ่มรายการ
              </a>
            )}
          </div>
        </div>
      </div>
      {mode === 'status-convert' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>พบทั้งหมด {rows.length} รายการ</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <select
              className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700"
              value={String(statusConvertPageSize)}
              onChange={(event) => {
                setStatusConvertPageSize(Number(event.target.value))
                setStatusConvertPage(1)
              }}
            >
              {STATUS_CONVERT_PAGE_SIZES.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize} / หน้า
                </option>
              ))}
            </select>
            <button
              className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={statusConvertPage <= 1}
              type="button"
              onClick={() => setStatusConvertPage((currentPage) => Math.max(1, currentPage - 1))}
            >
              ก่อนหน้า
            </button>
            <span className="px-1">หน้า {statusConvertPage} / {statusConvertTotalPages}</span>
            <button
              className="h-9 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={statusConvertPage >= statusConvertTotalPages}
              type="button"
              onClick={() => setStatusConvertPage((currentPage) => Math.min(statusConvertTotalPages, currentPage + 1))}
            >
              ถัดไป
            </button>
          </div>
        </div>
      ) : null}
      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8 animate-fade-in">
          <div className="w-full max-w-3xl overflow-hidden rounded-md bg-slate-900 shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between bg-slate-900 text-white px-5 py-4 shrink-0">
              <h3 className="font-bold text-slate-100">{meta.title}</h3>
              <a className="text-2xl text-slate-400 hover:text-white" href={pathname}>&times;</a>
            </div>
            {mode === 'status-convert' ? <StatusConvertForm cancelHref={pathname} isSaving={isSaving} reference={data.reference} onSubmit={submit} /> : null}
            {mode === 'convert' ? <ConvertForm cancelHref={pathname} isSaving={isSaving} reference={data.reference} onSubmit={submit} /> : null}
            {mode === 'adjust' ? <AdjustForm cancelHref={pathname} isSaving={isSaving} reference={data.reference} onSubmit={submit} /> : null}
          </div>
        </div>
      ) : null}
      <OperationTable
        isLoading={isLoading}
        mode={mode}
        rows={visibleRows}
        sortDirection={mode === 'status-convert' ? statusConvertSortDirection : undefined}
        sortKey={mode === 'status-convert' ? statusConvertSortKey : undefined}
        onConvertDetail={mode === 'convert' ? openConvertDetail : undefined}
        onSortChange={mode === 'status-convert' ? toggleStatusConvertSort : undefined}
        onConvertReverse={mode === 'convert' ? reverseConvert : undefined}
      />
      {convertDetail ? (
        <ConvertDetailModal
          detail={convertDetail}
          isLoading={isConvertDetailLoading}
          onClose={() => setConvertDetail(null)}
          onExport={() => exportConvertDetail(convertDetail.refNo)}
        />
      ) : null}
      {mode === 'adjust' ? <AdjustUsageBox /> : null}
    </section>
  )
}

function descriptionFor(mode: Mode) {
  if (mode === 'status-convert') return 'แปลง stock bucket RM ↔ FG ของสินค้าเดิม · ลดต้นทางเพิ่มปลายทางทันที · ใช้ source WAC และบันทึก Stock Ledger 2 ฝั่ง'
  if (mode === 'convert') return 'ตัดสินค้าต้นทางจาก Cost Pool ด้วย FIFO/LIFO/Cost/Manual แล้วเพิ่มสินค้าปลายทางกลับเข้า Cost Pool เป็น Regrade'
  return 'หาของไม่เจอ · สต๊อกตัด 0 แล้ว แต่ในระบบยังมี · นับเกินระบบ — Quick Adjust ทีละ row · Note-only ไม่ลง P&L'
}

function SummaryCards({ mode, rows }: { mode: Mode; rows: Payload['rows'] }) {
  const totalQty = rows.reduce((sum, row) => sum + Number(row.qty ?? row.sourceQty ?? row.diffQty ?? 0), 0)
  const totalValue = rows.reduce((sum, row) => sum + Number(row.value ?? row.valueNote ?? 0), 0)
  if (mode === 'convert') {
    const posted = rows.filter((row) => row.status === 'posted').length
    const pendingCost = rows.filter((row) => row.costStatus === 'pending_cost').length
    const manualCount = rows.filter((row) => row.sourceType === 'Manual').length
    const autoCount = rows.filter((row) => String(row.sourceType ?? '').startsWith('Auto')).length
    const reversed = rows.filter((row) => row.status === 'reversed').length
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 shadow-sm grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 lg:grid-cols-7 text-sm">
        <Metric emoji="📋" iconBg="bg-slate-100" label="รายการทั้งหมด" value={String(rows.length)} valueClassName="text-slate-900" />
        <Metric emoji="✅" iconBg="bg-emerald-100 text-emerald-700" label="Posted" value={String(posted)} valueClassName="text-emerald-700" />
        <Metric emoji="⏳" iconBg="bg-amber-100 text-amber-700" label="Pending Cost" value={String(pendingCost)} valueClassName="text-amber-700" />
        <Metric emoji="📝" iconBg="bg-blue-100 text-blue-700" label="Manual" value={String(manualCount)} valueClassName="text-blue-700" />
        <Metric emoji="🏭" iconBg="bg-purple-100 text-purple-700" label="Auto Cost Pool" value={String(autoCount)} valueClassName="text-purple-700" />
        <Metric emoji="⚖️" iconBg="bg-slate-100" label="น้ำหนักรวม" value={`${formatMoney(totalQty)} กก.`} valueClassName="text-slate-900" />
        <Metric emoji="🔄" iconBg="bg-slate-100 text-slate-500" label="Reversed" value={String(reversed)} valueClassName="text-slate-500" className="col-span-2 md:col-span-1" />
      </div>
    )
  }
  if (mode === 'adjust') {
    const lossRows = rows.filter((row) => Number(row.diffQty ?? 0) < 0)
    const gainRows = rows.filter((row) => Number(row.diffQty ?? 0) > 0)
    const lossQty = lossRows.reduce((sum, row) => sum + Math.abs(Number(row.diffQty ?? 0)), 0)
    const gainQty = gainRows.reduce((sum, row) => sum + Number(row.diffQty ?? 0), 0)
    const lossValue = lossRows.reduce((sum, row) => sum + Number(row.valueNote ?? 0), 0)
    const gainValue = gainRows.reduce((sum, row) => sum + Number(row.valueNote ?? 0), 0)
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 shadow-sm grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5 text-sm">
        <Metric emoji="📋" iconBg="bg-slate-100" label="รายการทั้งหมด" value={String(rows.length)} valueClassName="text-slate-900" />
        <Metric emoji="📉" iconBg="bg-red-100 text-red-700" label="นับขาด (LOSS)" value={`-${formatMoney(lossQty)} กก.`} valueClassName="text-red-600" />
        <Metric emoji="💸" iconBg="bg-red-100 text-red-700" label="มูลค่าขาด (Note)" value={formatMoney(lossValue)} valueClassName="text-red-600" />
        <Metric emoji="📈" iconBg="bg-emerald-100 text-emerald-700" label="นับเกิน (GAIN)" value={`+${formatMoney(gainQty)} กก.`} valueClassName="text-emerald-700" />
        <Metric emoji="💰" iconBg="bg-emerald-100 text-emerald-700" label="มูลค่าเกิน (Note)" value={formatMoney(gainValue)} valueClassName="text-emerald-700" className="col-span-2 lg:col-span-1" />
      </div>
    )
  }
  if (mode === 'status-convert') return null
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4 shadow-sm grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 text-sm">
      <Metric emoji="📋" iconBg="bg-slate-100" label="รายการ" value={String(rows.length)} />
      <Metric emoji="⚖️" iconBg="bg-slate-100" label="น้ำหนักรวม" value={`${formatMoney(totalQty)} กก.`} />
      <Metric emoji="💰" iconBg="bg-slate-100" label="มูลค่า" value={formatMoney(totalValue)} />
      <Metric emoji="🔗" iconBg="bg-slate-100" label="สถานะ" value="DB-connected" />
    </div>
  )
}

function AdjustPrincipleBox() {
  return (
    <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-xs text-slate-700">
      <div className="mb-1 font-bold">📒 หลักการทำงาน — Note-only (ไม่ลง P&L)</div>
      <ul className="ml-5 list-disc space-y-0.5">
        <li>ปรับสต๊อกจริง (qty) ตาม &quot;นับจริง&quot; ของคุณ — ตัดออกหรือเพิ่มเข้า stock_ledger</li>
        <li><strong>มูลค่า (value) = 0</strong> ใน ledger — ไม่กระทบ Stock Value · ไม่ลง P&L · ไม่กระโดด WAC</li>
        <li>มูลค่าที่หาย/เกินเก็บเป็น <strong>Note</strong> สำหรับ analysis เท่านั้น และแสดงใน column &quot;มูลค่า Note&quot;</li>
        <li>ใช้เมื่อ &quot;หาของไม่เจอ&quot; / &quot;นับจริง 0 แต่ระบบมี&quot; / &quot;นับเกินระบบ&quot;</li>
      </ul>
    </div>
  )
}

function AdjustUsageBox() {
  return (
    <div className="rounded-md border-l-4 border-blue-500 bg-blue-50 p-4 text-sm">
      <h3 className="mb-1 font-bold">💡 ใช้เมื่อไหร่</h3>
      <ul className="ml-5 list-disc space-y-1 text-slate-700">
        <li><strong>หาของไม่เจอ</strong> — ระบบมี 100 กก. แต่นับจริงเหลือ 80 → ใส่ &quot;นับจริง&quot; 80 → ขาด 20 กก. (Note)</li>
        <li><strong>สต๊อกตัด 0 แต่ในระบบยังมี</strong> — ระบบมี 50 กก. แต่นับจริง 0 → ใส่ &quot;นับจริง&quot; 0 → ขาด 50 กก. (Note)</li>
        <li><strong>นับเกินระบบ</strong> — ระบบมี 10 กก. แต่นับจริงได้ 25 → ใส่ &quot;นับจริง&quot; 25 → เกิน 15 กก. (Note)</li>
        <li>เคลื่อนไหวจะเข้า Stock Ledger เป็น <code>STOCK_COUNT_LOSS</code> หรือ <code>STOCK_COUNT_GAIN</code> · qty จริง · value=0</li>
      </ul>
    </div>
  )
}

function OperationTable({
  isLoading,
  mode,
  onConvertDetail,
  onConvertReverse,
  onSortChange,
  rows,
  sortDirection,
  sortKey,
}: {
  isLoading: boolean
  mode: Mode
  onConvertDetail?: (refNo: string) => void
  onConvertReverse?: (refNo: string) => void
  onSortChange?: (key: StatusConvertSortKey) => void
  rows: Payload['rows']
  sortDirection?: SortDirection
  sortKey?: StatusConvertSortKey
}) {
  const columns = columnsFor(mode)
  return (
    <div className="overflow-x-auto rounded-md bg-white shadow">
      <table className={mode === 'convert' ? 'w-full min-w-[1300px] text-sm' : mode === 'status-convert' ? 'w-full min-w-[1280px] text-sm' : 'w-full min-w-[1000px] text-sm'}>
        <thead className="bg-slate-100">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`p-2 text-left ${column.headerClassName ?? ''}`}>
                {mode === 'status-convert' && column.sortable && onSortChange ? (
                  <button
                    className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900"
                    type="button"
                    onClick={() => onSortChange(column.key as StatusConvertSortKey)}
                  >
                    <span>{column.label}</span>
                    <span className="text-xs text-slate-400">{sortKey === column.key ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={columns.length}>กำลังโหลดข้อมูล</td></tr> : null}
          {!isLoading && rows.map((row, index) => <tr key={String(row.id ?? index)} className="border-t hover:bg-slate-50">{columns.map((column) => <td key={column.key} className={`p-2 ${column.cellClassName ?? ''}`}>{formatOperationCell(mode, row, column.key, onConvertReverse, onConvertDetail)}</td>)}</tr>)}
          {!isLoading && !rows.length ? <tr><td className="p-8 text-center text-slate-400" colSpan={columns.length}>{emptyTextFor(mode)}</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}

function emptyTextFor(mode: Mode) {
  if (mode === 'convert') return 'ยังไม่มีรายการปรับเกรด'
  if (mode === 'status-convert') return 'ยังไม่เคยปรับสถานะ — กดปุ่ม "+ ปรับสถานะใหม่"'
  return 'ยังไม่มีรายการ'
}

function columnsFor(mode: Mode): OperationColumn[] {
  if (mode === 'status-convert') return [
    { key: 'date', label: 'วันที่', sortable: true },
    { key: 'refNo', label: 'เลขที่', sortable: true },
    { key: 'productDisplay', label: 'สินค้า', sortable: true },
    { key: 'lotNo', label: 'Lot', sortable: true },
    { key: 'locationDisplay', label: 'สาขา/คลัง', sortable: true },
    { key: 'qty', label: 'จำนวน (กก.)', cellClassName: 'text-right font-bold text-purple-700', sortable: true },
    { key: 'unitCost', label: 'ต้นทุน (บาท/กก.)', cellClassName: 'text-right text-slate-600', sortable: true },
    { key: 'value', label: 'มูลค่า', cellClassName: 'text-right text-slate-600', sortable: true },
    { key: 'statusFlow', label: 'เปลี่ยนสถานะ', cellClassName: 'text-center', sortable: true },
    { key: 'note', label: 'เหตุผล', sortable: true },
    { key: 'createdBy', label: 'ผู้ทำ', sortable: true },
    { key: 'createdAt', label: 'วันที่ทำ', sortable: true },
  ]
  if (mode === 'convert') return [
    { key: 'sourceType', label: 'Source Type' },
    { key: 'refNo', label: 'เลขที่ / Ref' },
    { key: 'date', label: 'วันที่' },
    { key: 'branchWarehouse', label: 'สาขา / คลัง' },
    { key: 'sourceProduct', label: 'Source (ออก)', headerClassName: 'bg-red-50' },
    { key: 'sourceQty', label: 'Qty', cellClassName: 'text-right font-mono text-red-700', headerClassName: 'bg-red-50 text-right' },
    { key: 'unitCost', label: '฿/กก.', cellClassName: 'text-right font-mono', headerClassName: 'bg-red-50 text-right' },
    { key: 'targetProduct', label: 'Target (เข้า)', headerClassName: 'bg-emerald-50' },
    { key: 'targetQty', label: 'Qty', cellClassName: 'text-right font-mono text-emerald-700', headerClassName: 'bg-emerald-50 text-right' },
    { key: 'targetUnitCost', label: '฿/กก.', cellClassName: 'text-right font-mono', headerClassName: 'bg-emerald-50 text-right' },
    { key: 'lossQty', label: 'Loss', cellClassName: 'text-right font-mono' },
    { key: 'costStatus', label: 'Cost Status', cellClassName: 'text-center' },
    { key: 'status', label: 'สถานะ', cellClassName: 'text-center' },
    { key: 'action', label: '' },
  ]
  if (mode === 'adjust') return [
    { key: 'docNo', label: 'Doc No' },
    { key: 'date', label: 'วันที่' },
    { key: 'branchWarehouse', label: 'สาขา/คลัง' },
    { key: 'productName', label: 'สินค้า' },
    { key: 'lotNo', label: 'Lot' },
    { key: 'systemQty', label: 'ระบบ', cellClassName: 'text-right font-mono' },
    { key: 'countedQty', label: 'นับจริง', cellClassName: 'text-right font-mono' },
    { key: 'diffQty', label: 'Diff', cellClassName: 'text-right font-mono' },
    { key: 'adjustType', label: 'ประเภท' },
    { key: 'valueNote', label: 'มูลค่า Note', cellClassName: 'text-right font-mono' },
    { key: 'reason', label: 'เหตุผล' },
    { key: 'status', label: 'สถานะ', cellClassName: 'text-center' },
    { key: 'action', label: 'การกระทำ', cellClassName: 'text-center' },
  ]
  return []
}

function formatCell(value: unknown) {
  if (typeof value === 'number') return formatMoney(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value ?? '-')
}

function formatDateTime(value: string | number | boolean | null | undefined) {
  if (!value) return '-'
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

function normalizeSortValue(value: string | number | boolean | null | undefined) {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  return String(value ?? '').trim().toLowerCase()
}

function statusConvertSortValue(row: Record<string, string | number | boolean | null>, key: StatusConvertSortKey) {
  if (key === 'productDisplay') return `${String(row.productCode ?? '')} ${String(row.productName ?? '')}`.trim().toLowerCase()
  if (key === 'locationDisplay') return `${String(row.branchName ?? '')} ${String(row.warehouseName ?? '')}`.trim().toLowerCase()
  if (key === 'statusFlow') return `${String(row.statusFrom ?? '')} ${String(row.statusTo ?? '')}`.trim().toLowerCase()
  if (key === 'note') return normalizeSortValue(row.note ?? row.reason)
  return normalizeSortValue(row[key])
}

function compareStatusConvertRows(
  left: Record<string, string | number | boolean | null>,
  right: Record<string, string | number | boolean | null>,
  key: StatusConvertSortKey,
  direction: SortDirection,
) {
  const leftValue = statusConvertSortValue(left, key)
  const rightValue = statusConvertSortValue(right, key)
  let result = 0
  if (typeof leftValue === 'number' && typeof rightValue === 'number') {
    result = leftValue - rightValue
  } else {
    result = String(leftValue).localeCompare(String(rightValue), 'th')
  }
  if (result === 0) {
    result = String(left.id ?? '').localeCompare(String(right.id ?? ''), 'th')
  }
  return direction === 'asc' ? result : result * -1
}

function formatOperationCell(mode: Mode, row: Record<string, string | number | boolean | null>, key: string, onConvertReverse?: (refNo: string) => void, onConvertDetail?: (refNo: string) => void) {
  if (mode === 'status-convert') {
    if (key === 'productDisplay') return <><b>{formatCell(row.productCode)}</b><div className="text-xs text-slate-500">{formatCell(row.productName)}</div></>
    if (key === 'locationDisplay') return <span className="text-xs">{formatCell(row.branchName)}<br />{formatCell(row.warehouseName)}</span>
    if (key === 'statusFlow') return <><span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-700">{formatCell(row.statusFrom)}</span><span className="mx-1 text-amber-600">→</span><span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">{formatCell(row.statusTo)}</span></>
    if (key === 'createdAt') return formatDateTime(row.createdAt)
  }
  if (mode === 'convert') {
    if (key === 'action') {
      const status = String(row.status ?? '')
      const refNo = String(row.refNo ?? row.id ?? '')
      return (
        <div className="flex items-center justify-center gap-1">
          <button
            className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            disabled={!onConvertDetail}
            type="button"
            onClick={() => onConvertDetail?.(refNo)}
          >
            Detail
          </button>
          <button className="rounded-md bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 opacity-60" disabled title="Cost allocation ถูกทำตอน Post แล้ว" type="button">Confirm Cost</button>
          <button
            className="rounded-md bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-200 disabled:opacity-50"
            disabled={status === 'reversed' || !onConvertReverse}
            type="button"
            onClick={() => onConvertReverse?.(refNo)}
          >
            Reverse
          </button>
        </div>
      )
    }
    if (key === 'costStatus') {
      const value = String(row[key] ?? '')
      const label = value === 'allocated' ? '✓ Allocated' : value === 'pending_cost' ? '⏳ Pending Cost' : value === 'partial' ? '📋 Partial' : '-'
      const color = value === 'allocated' ? 'bg-emerald-100 text-emerald-700' : value === 'pending_cost' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
      return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>
    }
    if (key === 'status') {
      const value = String(row[key] ?? '')
      const color = value === 'posted' ? 'bg-emerald-100 text-emerald-700' : value === 'reversed' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-700'
      return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{value || '-'}</span>
    }
    if (key === 'sourceType') {
      const value = String(row[key] ?? 'Manual')
      const color = value.startsWith('Auto') ? 'bg-purple-100 text-purple-700' : value === 'Legacy' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'
      return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{value}</span>
    }
  }
  if (mode === 'adjust') {
    if (key === 'action') {
      return <button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-60" disabled title="รอออกแบบ reverse/audit/rollback ก่อนเปิดใช้งาน" type="button">จัดการ</button>
    }
    if (key === 'adjustType') {
      const value = String(row[key] ?? '')
      const color = value === 'LOSS' ? 'bg-red-100 text-red-700' : value === 'GAIN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
      const label = value === 'LOSS' ? '📉 นับขาด' : value === 'GAIN' ? '📈 นับเกิน' : '-'
      return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>
    }
    if (key === 'status') {
      const value = String(row[key] ?? '')
      return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">{value || 'posted'}</span>
    }
    if (key === 'diffQty') {
      const value = Number(row[key] ?? 0)
      return <span className={value < 0 ? 'font-mono text-red-600' : value > 0 ? 'font-mono text-emerald-700' : 'font-mono text-slate-500'}>{formatMoney(value)}</span>
    }
  }
  return formatCell(row[key])
}

function Metric({
  cardClassName,
  emoji,
  iconBg = 'bg-slate-100',
  label,
  labelClassName = 'text-slate-500',
  value,
  valueClassName = 'text-slate-900',
  className = '',
}: {
  cardClassName?: string
  emoji?: string
  iconBg?: string
  label: string
  labelClassName?: string
  value: string
  valueClassName?: string
  className?: string
}) {
  if (cardClassName) {
    return <div className={cardClassName}><div className="text-xs text-slate-500">{label}</div><div className={`mt-1 text-lg font-bold ${valueClassName}`}>{value}</div></div>
  }

  return (
    <div className={`bg-white p-3 sm:p-4 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-3 ${className}`}>
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${iconBg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {emoji ?? '•'}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold ${labelClassName} truncate`}>{label}</div>
        <div className={`font-bold ${valueClassName} mt-0.5`}>{value}</div>
      </div>
    </div>
  )
}

function ConvertDetailModal({ detail, isLoading, onClose, onExport }: { detail: StockConvertDetail; isLoading: boolean; onClose: () => void; onExport: () => void }) {
  const totalQty = detail.lines.reduce((sum, line) => sum + line.qty, 0)
  const totalCost = detail.lines.reduce((sum, line) => sum + line.totalCost, 0)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-10">
      <div className="w-full max-w-5xl overflow-hidden rounded-md bg-white shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-5 py-4">
          <div>
            <h3 className="font-bold">Cost Allocation Detail · {detail.refNo}</h3>
            <div className="mt-1 text-xs text-slate-500">{detail.date} · {detail.branchWarehouse || '-'} · {detail.status}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800" disabled={isLoading} type="button" onClick={onExport}>CSV</button>
            <button className="text-2xl text-slate-400 hover:text-slate-700" type="button" onClick={onClose}>&times;</button>
          </div>
        </div>
        <div className="grid gap-3 border-b p-5 md:grid-cols-5">
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Source Qty" value={`${formatMoney(detail.sourceQty)} กก.`} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Target Qty" value={`${formatMoney(detail.targetQty)} กก.`} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Loss" value={`${formatMoney(detail.lossQty)} กก.`} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Allocated Qty" value={`${formatMoney(totalQty)} กก.`} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Allocated Cost" value={formatMoney(totalCost)} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Target Policy" value={detail.targetCostPolicy} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Target ฿/กก." value={formatMoney(detail.targetUnitCost)} />
          <Metric cardClassName="rounded-md bg-slate-50 p-3" label="Variance" value={formatMoney(detail.targetCostVariance)} />
        </div>
        <div className="max-h-[55vh] overflow-auto p-5">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-100 text-slate-600">
              <tr>
                <th className="p-2 text-left">Line</th>
                <th className="p-2 text-left">Source Pool</th>
                <th className="p-2 text-left">Source Product</th>
                <th className="p-2 text-left">Target Pool</th>
                <th className="p-2 text-left">Target Product</th>
                <th className="p-2 text-right">Qty</th>
                <th className="p-2 text-right">฿/กก.</th>
                <th className="p-2 text-right">Cost</th>
                <th className="p-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line) => (
                <tr key={`${line.lineNo}-${line.sourcePoolId ?? 'source'}`} className="border-t">
                  <td className="p-2 font-mono">{line.lineNo}</td>
                  <td className="p-2">
                    <div className="font-semibold text-slate-700">{line.sourceRefNo ?? line.sourceType ?? '-'}</div>
                    <div className="text-xs text-slate-500">Pool {line.sourcePoolId ?? '-'}{line.sourceLotNo ? ` · Lot ${line.sourceLotNo}` : ''}</div>
                  </td>
                  <td className="p-2">{line.sourceProduct}</td>
                  <td className="p-2">
                    <div className="font-semibold text-slate-700">Pool {line.targetPoolId ?? '-'}</div>
                    <div className="text-xs text-slate-500">{line.targetPoolStatus ?? '-'}{line.targetLotNo ? ` · Lot ${line.targetLotNo}` : ''}</div>
                  </td>
                  <td className="p-2">{line.targetProduct}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.qty)}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.unitCost)}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.totalCost)}</td>
                  <td className="p-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${line.allocationStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{line.allocationStatus}</span>
                  </td>
                </tr>
              ))}
              {!detail.lines.length ? <tr><td className="p-6 text-center text-slate-400" colSpan={9}>ไม่พบ allocation lines สำหรับเอกสารนี้</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="border-t bg-slate-50 px-5 py-3 text-xs text-slate-500">
          เหตุผล: {detail.reason || '-'} · หมายเหตุ: {detail.notes || '-'} · เหตุผล override: {detail.targetCostReason || '-'}
        </div>
      </div>
    </div>
  )
}

function Field(props: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className="block text-xs font-semibold text-slate-600">{props.label}{props.type === 'date' ? <DatePickerInput className="mt-1.5 w-full font-normal" value={props.value} onChange={props.onChange} /> : <input className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 bg-white outline-none focus:border-slate-900" type={props.type ?? 'text'} value={props.value} onChange={(event) => props.onChange(event.target.value)} />}</label>
}

function Select(props: { label: string; onChange: (value: string) => void; options: StockOption[]; value: string }) {
  return <label className="block text-xs font-semibold text-slate-600">{props.label}<select className="mt-1.5 w-full h-10 rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 bg-white outline-none focus:border-slate-900" value={props.value} onChange={(event) => props.onChange(event.target.value)}><option value="">เลือก</option>{props.options.filter((option) => option.active !== false).map((option) => <option key={option.id} value={option.id}>{option.code ? `${option.code} - ${option.name}` : option.name}</option>)}</select></label>
}

function BranchWarehouseFields({ branchId, reference, setBranchId, setWarehouseId, warehouseId }: { branchId: string; reference: Payload['reference']; setBranchId: (value: string) => void; setWarehouseId: (value: string) => void; warehouseId: string }) {
  return <>
    <Select label="สาขา" options={reference.branches} value={branchId} onChange={(value) => { setBranchId(value); setWarehouseId('') }} />
    <Select label="คลัง" options={reference.warehouses.filter((item) => !branchId || item.branchId === branchId)} value={warehouseId} onChange={setWarehouseId} />
  </>
}

function StatusConvertForm(props: { cancelHref: string; isSaving: boolean; onSubmit: (values: StatusConvertFormValues) => void; reference: Payload['reference'] }) {
  const [values, setValues] = useState<StatusConvertFormValues>({ branchId: '', date: todayDateInput(), docNo: null, fromStatus: 'RM', lotNo: null, notes: null, productId: '', qty: 0, reason: '', toStatus: 'FG', warehouseId: '' })
  const setFromStatus = (fromStatus: StatusConvertFormValues['fromStatus']) => setValues({ ...values, fromStatus, toStatus: fromStatus === 'RM' ? 'FG' : 'RM' })
  const setToStatus = (toStatus: StatusConvertFormValues['toStatus']) => setValues({ ...values, fromStatus: toStatus === 'RM' ? 'FG' : 'RM', toStatus })
  return <FormShell cancelHref={props.cancelHref} isSaving={props.isSaving} onSubmit={() => props.onSubmit(values)}>
    <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-5 shadow-sm grid gap-4 md:grid-cols-2">
      <BaseDateDoc values={values} setValues={setValues} />
      <Select label="สินค้า" options={props.reference.products} value={values.productId} onChange={(productId) => setValues({ ...values, productId })} />
      <BranchWarehouseFields branchId={values.branchId} reference={props.reference} setBranchId={(branchId) => setValues({ ...values, branchId, warehouseId: '' })} setWarehouseId={(warehouseId) => setValues({ ...values, warehouseId })} warehouseId={values.warehouseId} />
      <Select label="จากสถานะ" options={statusOptions()} value={values.fromStatus} onChange={(fromStatus) => setFromStatus(fromStatus as StatusConvertFormValues['fromStatus'])} />
      <Select label="เป็นสถานะ" options={statusOptions()} value={values.toStatus} onChange={(toStatus) => setToStatus(toStatus as StatusConvertFormValues['toStatus'])} />
      <Field label="น้ำหนัก (กก.)" type="number" value={String(values.qty)} onChange={(qty) => setValues({ ...values, qty: Number(qty) })} />
      <Field label="Lot" value={values.lotNo ?? ''} onChange={(lotNo) => setValues({ ...values, lotNo })} />
      <div className="md:col-span-2">
        <Field label="เหตุผล *" value={values.reason ?? ''} onChange={(reason) => setValues({ ...values, reason })} />
      </div>
      <div className="md:col-span-2">
        <Field label="หมายเหตุ" value={values.notes ?? ''} onChange={(notes) => setValues({ ...values, notes })} />
      </div>
    </div>
  </FormShell>
}

function sortCostPoolEntries(left: StockCostPoolOption, right: StockCostPoolOption, method: StockConvertFormValues['allocationMethod']) {
  if (method === 'LIFO') return right.date.localeCompare(left.date) || Number(right.id) - Number(left.id)
  if (method === 'HIGHEST_COST') return right.unitCost - left.unitCost || left.date.localeCompare(right.date) || Number(left.id) - Number(right.id)
  if (method === 'LOWEST_COST') return left.unitCost - right.unitCost || left.date.localeCompare(right.date) || Number(left.id) - Number(right.id)
  return left.date.localeCompare(right.date) || Number(left.id) - Number(right.id)
}

function previewCostPoolAllocation(entries: StockCostPoolOption[], sourceQty: number) {
  let remainingQty = Math.max(0, Number(sourceQty) || 0)
  const rows: Array<{ entry: StockCostPoolOption; qty: number }> = []
  for (const entry of entries) {
    if (remainingQty <= 0) break
    const qty = Math.min(entry.availableQty, remainingQty)
    if (qty > 0) rows.push({ entry, qty })
    remainingQty -= qty
  }
  return { rows, shortageQty: Math.max(0, remainingQty) }
}

function CostPoolPreview({
  entries,
  manualAllocations,
  method,
  onManualChange,
  previewRows,
  shortageQty,
  sourceQty,
}: {
  entries: StockCostPoolOption[]
  manualAllocations: StockConvertFormValues['manualAllocations']
  method: StockConvertFormValues['allocationMethod']
  onManualChange: (poolEntryId: string, qty: number) => void
  previewRows: Array<{ entry: StockCostPoolOption; qty: number }>
  shortageQty: number
  sourceQty: number
}) {
  const selectedById = new Map(manualAllocations.map((line) => [line.poolEntryId, line.qty]))
  const totalQty = previewRows.reduce((sum, line) => sum + line.qty, 0)
  const totalValue = previewRows.reduce((sum, line) => sum + line.qty * line.entry.unitCost, 0)
  return (
    <div className="rounded-md border border-red-100 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-red-700">Cost Pool Lots</div>
        <div className="text-xs text-slate-500">
          เลือก {formatMoney(totalQty)} / {formatMoney(sourceQty || 0)} กก. · {formatMoney(totalValue)} ฿
        </div>
      </div>
      {shortageQty > 0 ? <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">Cost Pool ไม่พอ ขาด {formatMoney(shortageQty)} กก.</div> : null}
      {method === 'MANUAL' ? (
        <div className="max-h-48 overflow-y-auto rounded-md border border-slate-100">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-2 text-left">Source</th>
                <th className="p-2 text-right">Available</th>
                <th className="p-2 text-right">฿/กก.</th>
                <th className="p-2 text-right">ตัด</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-t">
                  <td className="p-2">
                    <div className="font-semibold text-slate-700">{entry.sourceRefNo ?? entry.sourceType}</div>
                    <div className="text-slate-500">{entry.date}{entry.lotNo ? ` · Lot ${entry.lotNo}` : ''}</div>
                  </td>
                  <td className="p-2 text-right font-mono">{formatMoney(entry.availableQty)}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(entry.unitCost)}</td>
                  <td className="p-2 text-right">
                    <input
                      className="h-8 w-24 rounded-md border border-slate-300 px-2 text-right font-mono"
                      min="0"
                      step="0.001"
                      type="number"
                      value={String(selectedById.get(entry.id) ?? 0)}
                      onChange={(event) => onManualChange(entry.id, Math.min(entry.availableQty, Math.max(0, Number(event.target.value) || 0)))}
                    />
                  </td>
                </tr>
              ))}
              {!entries.length ? <tr><td className="p-3 text-center text-slate-400" colSpan={4}>ไม่พบ Cost Pool ที่ตรงกับ source</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="max-h-44 overflow-y-auto rounded-md border border-slate-100">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-2 text-left">Source</th>
                <th className="p-2 text-right">ตัด</th>
                <th className="p-2 text-right">฿/กก.</th>
                <th className="p-2 text-right">มูลค่า</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((line) => (
                <tr key={line.entry.id} className="border-t">
                  <td className="p-2">
                    <div className="font-semibold text-slate-700">{line.entry.sourceRefNo ?? line.entry.sourceType}</div>
                    <div className="text-slate-500">{line.entry.date}{line.entry.lotNo ? ` · Lot ${line.entry.lotNo}` : ''}</div>
                  </td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.qty)}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.entry.unitCost)}</td>
                  <td className="p-2 text-right font-mono">{formatMoney(line.qty * line.entry.unitCost)}</td>
                </tr>
              ))}
              {!previewRows.length ? <tr><td className="p-3 text-center text-slate-400" colSpan={4}>เลือกสินค้า/สาขา/คลังและน้ำหนักเพื่อ preview Cost Pool</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ConvertForm(props: { cancelHref: string; isSaving: boolean; onSubmit: (values: StockConvertFormValues) => void; reference: Payload['reference'] }) {
  const [values, setValues] = useState<StockConvertFormValues>({
    allocationMethod: 'FIFO',
    branchId: '',
    date: todayDateInput(),
    docNo: null,
    lotNo: null,
    manualAllocations: [],
    notes: null,
    reason: null,
    sourceProductId: '',
    sourceQty: 0,
    targetCostPolicy: 'SOURCE_MATCHED',
    targetLotNo: null,
    targetProductId: '',
    targetQty: 0,
    targetUnitCost: null,
    targetUnitCostReason: null,
    warehouseId: '',
  })
  const sourceProduct = props.reference.products.find((item) => item.id === values.sourceProductId)
  const targetProduct = props.reference.products.find((item) => item.id === values.targetProductId)
  const lossQty = Math.max(0, Number(values.sourceQty) - Number(values.targetQty))
  const yieldPct = Number(values.sourceQty) > 0 ? (Number(values.targetQty) / Number(values.sourceQty)) * 100 : 0
  const sourceCostPoolEntries = useMemo(() => {
    const entries = props.reference.costPoolEntries ?? []
    return entries
      .filter((entry) => !values.branchId || entry.branchId === values.branchId)
      .filter((entry) => !values.warehouseId || entry.warehouseId === values.warehouseId)
      .filter((entry) => !values.sourceProductId || entry.productId === values.sourceProductId)
      .filter((entry) => !values.lotNo || entry.lotNo === values.lotNo)
      .filter((entry) => entry.availableQty > 0)
      .sort((left, right) => sortCostPoolEntries(left, right, values.allocationMethod))
  }, [props.reference.costPoolEntries, values.allocationMethod, values.branchId, values.lotNo, values.sourceProductId, values.warehouseId])
  const autoPreview = useMemo(() => previewCostPoolAllocation(sourceCostPoolEntries, Number(values.sourceQty)), [sourceCostPoolEntries, values.sourceQty])
  const manualTotalQty = values.manualAllocations.reduce((sum, line) => sum + Number(line.qty || 0), 0)
  const costPreviewRows = values.allocationMethod === 'MANUAL'
    ? values.manualAllocations
        .map((line) => {
          const pool = sourceCostPoolEntries.find((entry) => entry.id === line.poolEntryId)
          return pool ? { entry: pool, qty: Number(line.qty || 0) } : null
        })
        .filter((line): line is { entry: StockCostPoolOption; qty: number } => Boolean(line))
    : autoPreview.rows
  const previewValue = costPreviewRows.reduce((sum, line) => sum + line.qty * line.entry.unitCost, 0)
  const previewUnitCost = Number(values.sourceQty) > 0 ? previewValue / Number(values.sourceQty) : 0
  const targetUnitCost = values.targetCostPolicy === 'CUSTOM_UNIT_COST' ? Number(values.targetUnitCost || 0) : previewUnitCost
  const targetValue = Number(values.targetQty || 0) * targetUnitCost
  const costVariance = targetValue - previewValue

  function updateManualAllocation(poolEntryId: string, qty: number) {
    const existing = values.manualAllocations.filter((line) => line.poolEntryId !== poolEntryId)
    setValues({ ...values, manualAllocations: qty > 0 ? [...existing, { poolEntryId, qty }] : existing })
  }

  return <FormShell cancelHref={props.cancelHref} isSaving={props.isSaving} mode="convert" onSubmit={() => props.onSubmit(values)}>
    <div className="md:col-span-2 rounded-lg border border-slate-200 bg-white p-5 shadow-sm grid gap-4 md:grid-cols-2 animate-fade-in">
      <BaseDateDoc values={values} setValues={setValues} />
      <BranchWarehouseFields branchId={values.branchId} reference={props.reference} setBranchId={(branchId) => setValues({ ...values, branchId, warehouseId: '' })} setWarehouseId={(warehouseId) => setValues({ ...values, warehouseId })} warehouseId={values.warehouseId} />
    </div>
    <div className="rounded-xl border border-red-200 bg-red-50/40 p-5 shadow-sm md:col-span-2">
      <div className="mb-3 text-sm font-bold text-red-700">Source (ออก)</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Select label="สินค้าต้นทาง" options={props.reference.products} value={values.sourceProductId} onChange={(sourceProductId) => setValues({ ...values, sourceProductId })} />
        <Field label="น้ำหนักต้นทาง (กก.)" type="number" value={String(values.sourceQty)} onChange={(sourceQty) => setValues({ ...values, sourceQty: Number(sourceQty) })} />
        <Field label="Lot ต้นทาง" value={values.lotNo ?? ''} onChange={(lotNo) => setValues({ ...values, lotNo })} />
        <ReadOnlyBox label="Source Product" value={sourceProduct ? `${sourceProduct.code ? `${sourceProduct.code} - ` : ''}${sourceProduct.name}` : '-'} />
        <label className="block text-sm font-medium md:col-span-2">วิธีตัดต้นทุน
          <select
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2"
            value={values.allocationMethod}
            onChange={(event) => setValues({ ...values, allocationMethod: event.target.value as StockConvertFormValues['allocationMethod'], manualAllocations: [] })}
          >
            <option value="FIFO">FIFO (มาก่อน-ออกก่อน)</option>
            <option value="LIFO">LIFO (มาหลัง-ออกก่อน)</option>
            <option value="HIGHEST_COST">Highest Cost (ต้นทุนสูงก่อน)</option>
            <option value="LOWEST_COST">Lowest Cost (ต้นทุนต่ำก่อน)</option>
            <option value="MANUAL">Manual (เลือก lot เอง)</option>
          </select>
        </label>
        <div className="md:col-span-2">
          <CostPoolPreview
            entries={sourceCostPoolEntries}
            manualAllocations={values.manualAllocations}
            method={values.allocationMethod}
            previewRows={costPreviewRows}
            shortageQty={values.allocationMethod === 'MANUAL' ? Math.max(0, Number(values.sourceQty) - manualTotalQty) : autoPreview.shortageQty}
            sourceQty={Number(values.sourceQty)}
            onManualChange={updateManualAllocation}
          />
        </div>
      </div>
    </div>
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm md:col-span-2">
      <div className="mb-3 text-sm font-bold text-emerald-700">Target (เข้า)</div>
      <div className="grid gap-4 md:grid-cols-2">
        <Select label="สินค้าปลายทาง" options={props.reference.products} value={values.targetProductId} onChange={(targetProductId) => setValues({ ...values, targetProductId })} />
        <Field label="น้ำหนักปลายทาง (กก.)" type="number" value={String(values.targetQty)} onChange={(targetQty) => setValues({ ...values, targetQty: Number(targetQty) })} />
        <Field label="Lot ปลายทาง" value={values.targetLotNo ?? ''} onChange={(targetLotNo) => setValues({ ...values, targetLotNo })} />
        <ReadOnlyBox label="Target Product" value={targetProduct ? `${targetProduct.code ? `${targetProduct.code} - ` : ''}${targetProduct.name}` : '-'} />
        <label className="block text-sm font-medium md:col-span-2">Target Cost Policy
          <select
            className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2"
            value={values.targetCostPolicy}
            onChange={(event) => setValues({ ...values, targetCostPolicy: event.target.value as StockConvertFormValues['targetCostPolicy'], targetUnitCost: null, targetUnitCostReason: null })}
          >
            <option value="SOURCE_MATCHED">Source matched cost (default)</option>
            <option value="CUSTOM_UNIT_COST">Custom unit cost (admin/owner)</option>
          </select>
        </label>
        {values.targetCostPolicy === 'CUSTOM_UNIT_COST' ? (
          <>
            <Field label="Custom target ฿/กก." type="number" value={String(values.targetUnitCost ?? '')} onChange={(targetUnitCostValue) => setValues({ ...values, targetUnitCost: Number(targetUnitCostValue) })} />
            <Field label="เหตุผล override ต้นทุน" value={values.targetUnitCostReason ?? ''} onChange={(targetUnitCostReason) => setValues({ ...values, targetUnitCostReason })} />
          </>
        ) : null}
      </div>
    </div>
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
      <div className="mb-3 text-sm font-bold text-slate-700">Loss / Yield / Cost Flow</div>
      <div className="grid gap-4 md:grid-cols-3">
        <ReadOnlyBox label="Loss" value={`${formatMoney(lossQty)} กก.`} />
        <ReadOnlyBox label="Yield" value={`${formatMoney(yieldPct)}%`} />
        <ReadOnlyBox label="Allocation" value={`${values.allocationMethod} · ${formatMoney(previewUnitCost)} ฿/กก.`} />
        <ReadOnlyBox label="Target Cost" value={`${values.targetCostPolicy} · ${formatMoney(targetUnitCost)} ฿/กก.`} />
        <ReadOnlyBox label="Target Value" value={formatMoney(targetValue)} />
        <ReadOnlyBox label="Cost Variance" value={formatMoney(costVariance)} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field label="เหตุผล" value={values.reason ?? ''} onChange={(reason) => setValues({ ...values, reason })} />
        <Field label="หมายเหตุ" value={values.notes ?? ''} onChange={(notes) => setValues({ ...values, notes })} />
      </div>
    </div>
  </FormShell>
}

function AdjustForm(props: { cancelHref: string; isSaving: boolean; onSubmit: (values: StockAdjustFormValues) => void; reference: Payload['reference'] }) {
  const [values, setValues] = useState<StockAdjustFormValues>({ branchId: '', countedQty: 0, date: todayDateInput(), docNo: null, lotNo: null, productId: '', reason: '', remark: null, systemQty: 0, warehouseId: '' })
  return <FormShell cancelHref={props.cancelHref} isSaving={props.isSaving} onSubmit={() => props.onSubmit(values)}>
    <Field label="เหตุผล" value={values.reason} onChange={(reason) => setValues({ ...values, reason })} />
  </FormShell>
}

function BaseDateDoc<T extends { date: string; docNo?: string | null }>({ setValues, values }: { setValues: (values: T) => void; values: T }) {
  return <>
    <Field label="วันที่" type="date" value={values.date} onChange={(date) => setValues({ ...values, date })} />
    <Field label="เลขที่เอกสาร" value={values.docNo ?? ''} onChange={(docNo) => setValues({ ...values, docNo })} />
  </>
}

function ReadOnlyBox({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border border-white/70 bg-white/80 px-3 py-2"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-sm font-semibold text-slate-800">{value}</div></div>
}

function FormShell({ cancelHref, children, isSaving, mode, onSubmit }: { cancelHref: string; children: React.ReactNode; isSaving: boolean; mode?: Mode; onSubmit: () => void }) {
  return (
    <form className="flex-1 flex flex-col overflow-hidden" onSubmit={(event) => { event.preventDefault(); onSubmit() }}>
      <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 shrink-0">
        <a className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-normal text-slate-700 hover:bg-slate-50 flex items-center justify-center" href={cancelHref}>
          ยกเลิก
        </a>
        <button
          className="rounded-md bg-slate-900 px-5 py-2 text-sm font-normal text-white hover:bg-slate-800 disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          บันทึก
        </button>
      </div>
    </form>
  )
}

function statusOptions(): StockOption[] {
  return [{ active: true, id: 'RM', name: 'RM' }, { active: true, id: 'FG', name: 'FG' }]
}
