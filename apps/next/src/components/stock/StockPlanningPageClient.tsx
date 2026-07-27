'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronDown, ChevronRight, Download, RefreshCw, SlidersHorizontal } from 'lucide-react'

import { KpiCard } from '@/components/ui/KpiCard'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type Row = {
  date: string
  docNo: string
  expectedDelivery: string
  partnerName: string
  productId: string
  productName: string
  remainingQty: number
  unitPrice: number
}

type StockRow = {
  avgCost: number
  productCode: string
  productId: string
  productMetalGroup: string
  productName: string
  qty: number
  readyQty: number
}

type Payload = { buyRows: Row[]; sellRows: Row[] }

type PlanRow = Row & {
  after: number
  before: number
  buyBefore: number
  daysUntil: number
  enough: boolean
  group: string
  productCode: string
  shortage: number
  stockNow: number
  urgency: 'overdue' | 'critical' | 'warning' | 'planning' | 'ok'
}

type ProductPlan = {
  avgCost: number
  buyBudget: number
  buyComing: number
  finalBalance: number
  group: string
  key: string
  poSellPrice: number
  potentialMargin: number
  productCode: string
  productIds: string[]
  productName: string
  rows: PlanRow[]
  sellPending: number
  shortage: number
  stockNow: number
  urgency: PlanRow['urgency']
}

type MobileFilterDraft = {
  group: string
  includeEmpty: boolean
  product: string
}

const pageSizeOptions = [10, 25] as const
const urgencyRank: Record<PlanRow['urgency'], number> = {
  overdue: 0,
  critical: 1,
  warning: 2,
  planning: 3,
  ok: 4,
}

const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const dayDiff = (date: string, today: string) => Math.round(
  (new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000,
)
const displayGroup = (group: string) => /อลูมิเนียมกระป๋อง|อลูมิเนียมกระป๋องอัดก้อน|aluminum can/i.test(group)
  ? 'อลูมิเนียมกระป๋อง (รวม)'
  : group || 'ไม่ระบุหมวด'
const isFocusGroup = (group: string) => /ทองแดง|ทองเหลือง|อลูมิเนียมกระป๋อง|copper|brass|aluminum|aluminium/i.test(group)

function statusLabel(value: PlanRow['urgency']) {
  return value === 'overdue'
    ? 'เลยกำหนด'
    : value === 'critical'
      ? 'ด่วน'
      : value === 'warning'
        ? 'เตือน'
        : value === 'planning'
          ? 'วางแผน'
          : 'พอ'
}

function statusTextClass(value: PlanRow['urgency']) {
  return value === 'overdue' || value === 'critical'
    ? 'text-red-700'
    : value === 'warning'
      ? 'text-amber-700'
      : value === 'planning'
        ? 'text-blue-700'
        : 'text-emerald-700'
}

function statusDotClass(value: PlanRow['urgency']) {
  return value === 'overdue' || value === 'critical'
    ? 'bg-red-500'
    : value === 'warning'
      ? 'bg-amber-500'
      : value === 'planning'
        ? 'bg-blue-500'
        : 'bg-emerald-500'
}

function StatusIndicator({ value }: { value: PlanRow['urgency'] }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold ${statusTextClass(value)}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${statusDotClass(value)}`} />
      {statusLabel(value)}
    </span>
  )
}

export function StockPlanningPageClient() {
  const [data, setData] = useState<Payload | null>(null)
  const [stock, setStock] = useState<StockRow[]>([])
  const [group, setGroup] = useState('')
  const [product, setProduct] = useState('')
  const [view, setView] = useState<'table' | 'calendar'>('table')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [selectedDate, setSelectedDate] = useState('')
  const [expanded, setExpanded] = useState('')
  const [includeEmpty, setIncludeEmpty] = useState(false)
  const [mobileFilterDraft, setMobileFilterDraft] = useState<MobileFilterDraft | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(10)
  const [exporting, setExporting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [po, stockPayload] = await Promise.all([
        dailyFetchJson<Payload>('/api/po-reports/outstanding'),
        dailyFetchJson<{ rows: StockRow[] }>('/api/stock/balance'),
      ])
      setData(po)
      setStock(stockPayload.rows ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลวางแผนสต๊อกไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const today = new Date().toISOString().slice(0, 10)
  const stockByProduct = useMemo(() => {
    const map = new Map<string, { code: string; group: string; name: string; qty: number; value: number }>()
    stock.forEach((row) => {
      const current = map.get(row.productId) ?? {
        code: row.productCode,
        group: row.productMetalGroup,
        name: row.productName,
        qty: 0,
        value: 0,
      }
      current.qty += numberValue(row.readyQty ?? row.qty)
      current.value += numberValue(row.readyQty ?? row.qty) * numberValue(row.avgCost)
      map.set(row.productId, current)
    })
    return map
  }, [stock])

  const productMeta = useMemo(() => {
    const map = new Map<string, { code: string; group: string; name: string }>()
    stockByProduct.forEach((value, key) => {
      map.set(key, { code: value.code, group: value.group, name: value.name })
    })
    ;[...(data?.buyRows ?? []), ...(data?.sellRows ?? [])].forEach((row) => {
      if (!map.has(row.productId)) {
        map.set(row.productId, { code: row.productId, group: '', name: row.productName })
      }
    })
    return map
  }, [data, stockByProduct])

  const groupOptions = useMemo(
    () => [...new Set(
      [...productMeta.values()]
        .filter((item) => isFocusGroup(item.group))
        .map((item) => displayGroup(item.group))
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right, 'th')),
    [productMeta],
  )

  const productOptions = useMemo<SearchComboboxOption[]>(
    () => [...productMeta.entries()]
      .filter(([, value]) => isFocusGroup(value.group))
      .filter(([, value]) => !group || displayGroup(value.group) === group)
      .map(([id, value]) => ({
        description: displayGroup(value.group),
        id,
        label: `${value.code} - ${value.name}`,
        searchText: `${value.code} ${value.name} ${value.group}`,
      })),
    [group, productMeta],
  )

  const plans = useMemo<ProductPlan[]>(() => {
    const ids = [...productMeta.keys()]
      .filter((id) => isFocusGroup(productMeta.get(id)?.group ?? ''))
      .filter((id) => !product || id === product)
      .filter((id) => !group || displayGroup(productMeta.get(id)?.group ?? '') === group)
    const buyRows = data?.buyRows ?? []
    const sellRows = data?.sellRows ?? []
    const result: ProductPlan[] = []

    ids.forEach((id) => {
      const meta = productMeta.get(id)!
      const stockInfo = stockByProduct.get(id)
      const events = [
        ...buyRows
          .filter((row) => row.productId === id && row.remainingQty > 0.01)
          .map((row) => ({ ...row, date: row.expectedDelivery || row.date, type: 'buy' as const })),
        ...sellRows
          .filter((row) => row.productId === id && row.remainingQty > 0.01)
          .map((row) => ({ ...row, date: row.expectedDelivery || row.date, type: 'sell' as const })),
      ].sort((left, right) => (
        (left.date || '9999').localeCompare(right.date || '9999')
        || (left.type === 'buy' ? -1 : 1)
      ))

      let balance = stockInfo?.qty ?? 0
      let buyBefore = 0
      let maxShortage = 0
      const rows: PlanRow[] = []

      events.forEach((event) => {
        if (event.type === 'buy') {
          balance += event.remainingQty
          buyBefore += event.remainingQty
          return
        }
        const before = balance
        const shortage = Math.max(0, event.remainingQty - before)
        const daysUntil = dayDiff(event.date || '9999-12-31', today)
        const urgency = shortage <= 0.01
          ? 'ok'
          : daysUntil < 0
            ? 'overdue'
            : daysUntil <= 7
              ? 'critical'
              : daysUntil <= 30
                ? 'warning'
                : 'planning'
        maxShortage = Math.max(maxShortage, shortage)
        rows.push({
          ...event,
          after: before - event.remainingQty,
          before,
          buyBefore,
          daysUntil,
          enough: shortage <= 0.01,
          group: displayGroup(meta.group),
          productCode: meta.code,
          shortage,
          stockNow: stockInfo?.qty ?? 0,
          urgency,
        })
        balance -= event.remainingQty
      })

      const avgCost = stockInfo && stockInfo.qty > 0 ? stockInfo.value / stockInfo.qty : 0
      const shortageRows = rows.filter((row) => !row.enough)
      const shortageQty = shortageRows.reduce((sum, row) => sum + row.shortage, 0)
      const poSellPrice = shortageQty > 0
        ? shortageRows.reduce((sum, row) => sum + row.shortage * numberValue(row.unitPrice), 0) / shortageQty
        : 0

      if (includeEmpty || rows.length || events.length) {
        result.push({
          avgCost,
          buyBudget: maxShortage * avgCost,
          buyComing: buyRows
            .filter((row) => row.productId === id)
            .reduce((sum, row) => sum + row.remainingQty, 0),
          finalBalance: balance,
          group: displayGroup(meta.group),
          key: id,
          poSellPrice,
          potentialMargin: maxShortage * (poSellPrice - avgCost),
          productCode: meta.code,
          productIds: [id],
          productName: meta.name,
          rows,
          sellPending: sellRows
            .filter((row) => row.productId === id)
            .reduce((sum, row) => sum + row.remainingQty, 0),
          shortage: maxShortage,
          stockNow: stockInfo?.qty ?? 0,
          urgency: rows.length
            ? rows.reduce(
              (best, row) => urgencyRank[row.urgency] < urgencyRank[best] ? row.urgency : best,
              'ok' as PlanRow['urgency'],
            )
            : 'ok',
        })
      }
    })

    return result.sort((left, right) => (
      urgencyRank[left.urgency] - urgencyRank[right.urgency]
      || (left.rows[0]?.date ?? '9999').localeCompare(right.rows[0]?.date ?? '9999')
    ))
  }, [data, group, includeEmpty, product, productMeta, stockByProduct, today])

  const allRows = useMemo(() => plans.flatMap((plan) => plan.rows), [plans])
  const shortagePlans = plans.filter((plan) => plan.shortage > 0.01)
  const shortageTotal = shortagePlans.reduce((sum, plan) => sum + plan.shortage, 0)
  const calendarRows = allRows.filter((row) => row.date.startsWith(month))
  const hasFilters = Boolean(group || product || includeEmpty)
  const pageCount = Math.max(1, Math.ceil(plans.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const pagedPlans = plans.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const initialLoading = loading && !data

  function resetFilters() {
    setGroup('')
    setProduct('')
    setIncludeEmpty(false)
    setPage(1)
  }

  function openMobileFilters() {
    setMobileFilterDraft({ group, includeEmpty, product })
  }

  function applyMobileFilters() {
    if (!mobileFilterDraft) return
    setGroup(mobileFilterDraft.group)
    setIncludeEmpty(mobileFilterDraft.includeEmpty)
    setProduct(mobileFilterDraft.group === group ? mobileFilterDraft.product : '')
    setPage(1)
    setMobileFilterDraft(null)
  }

  async function exportExcel() {
    setExporting(true)
    setError('')
    try {
      const header = [
        'สินค้า',
        'หมวด',
        'Stock พร้อมส่ง (กก.)',
        'PO Buy กำลังเข้า (กก.)',
        'PO Sell ค้างส่ง (กก.)',
        'สมดุลสุดท้าย (กก.)',
        'ต้องซื้อเพิ่ม (กก.)',
        'สถานะ',
      ]
      const body = plans.map((plan) => [
        `${plan.productCode} - ${plan.productName}`,
        plan.group,
        plan.stockNow,
        plan.buyComing,
        plan.sellPending,
        plan.finalBalance,
        plan.shortage,
        statusLabel(plan.urgency),
      ])
      const { default: writeXlsxFile } = await import('write-excel-file/browser')
      await writeXlsxFile([
        header.map((value) => ({ fontWeight: 'bold' as const, value })),
        ...body,
      ], { sheet: 'วางแผนสต๊อก' }).toFile(`stock-planning-${today}.xlsx`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ส่งออก Excel ไม่สำเร็จ')
    } finally {
      setExporting(false)
    }
  }

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">วางแผนสต๊อก vs PO Sell</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon="📋"
          label="PO Sell ค้างส่ง"
          tone="purple"
          value={initialLoading ? 'กำลังโหลด' : `${allRows.length.toLocaleString('th-TH')} รายการ`}
        />
        <KpiCard
          icon="✓"
          label="พร้อมส่ง"
          tone="emerald"
          value={initialLoading ? 'กำลังโหลด' : `${allRows.filter((row) => row.enough).length.toLocaleString('th-TH')} รายการ`}
        />
        <KpiCard
          icon="⚠"
          label="ขาด"
          tone="danger"
          value={initialLoading ? 'กำลังโหลด' : `${allRows.filter((row) => !row.enough).length.toLocaleString('th-TH')} รายการ`}
        />
        <KpiCard
          icon="↗"
          label="ต้องซื้อเพิ่ม"
          tone="red"
          value={initialLoading ? 'กำลังโหลด' : `${formatMoney(shortageTotal)} กก.`}
        />
      </div>

      <Tabs
        className="gap-0"
        value={view}
        onValueChange={(value) => setView(value as 'table' | 'calendar')}
      >
        <TabsList className="w-full flex-nowrap overflow-x-auto" variant="line">
          <TabsTrigger value="table" variant="line">ตาราง</TabsTrigger>
          <TabsTrigger className="gap-1.5" value="calendar" variant="line">
            <CalendarDays aria-hidden="true" className="size-4" />
            ปฏิทิน
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div
        className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block"
        data-stock-planning-filter-toolbar="desktop"
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-xs font-semibold text-slate-500">
            <span>สินค้า</span>
            <SearchCombobox
              hideLabel
              inputClassName="h-9 text-sm font-normal"
              inputId="stock-planning-product"
              label="สินค้า"
              openOnFocus={false}
              options={productOptions}
              placeholder="ค้นหาชื่อหรือรหัสสินค้า"
              value={product}
              onChange={(value) => {
                setProduct(value)
                setPage(1)
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">
            <span>หมวด</span>
            <Select
              className="h-9 min-w-[190px]"
              value={group}
              onChange={(event) => {
                setGroup(event.target.value)
                setProduct('')
                setPage(1)
              }}
            >
              <option value="">ทุกหมวด</option>
              {groupOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </label>
          {hasFilters ? (
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50"
              onClick={resetFilters}
              type="button"
            >
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
          <label className="flex h-9 items-center gap-2 text-xs text-slate-600">
            <input
              checked={includeEmpty}
              onChange={(event) => {
                setIncludeEmpty(event.target.checked)
                setPage(1)
              }}
              type="checkbox"
            />
            แสดงสินค้าที่ไม่มี PO
          </label>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              disabled={loading}
              onClick={() => void load()}
              type="button"
            >
              <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
              รีเฟรช
            </button>
            <button
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-normal text-white hover:bg-emerald-700 disabled:opacity-60"
              disabled={exporting || initialLoading || !plans.length}
              onClick={() => void exportExcel()}
              type="button"
            >
              <Download aria-hidden="true" className="size-4" />
              {exporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}
            </button>
          </div>
        </div>
      </div>

      <div
        className="space-y-2 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm lg:hidden"
        data-stock-planning-filter-toolbar="mobile"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <SearchCombobox
              hideLabel
              inputClassName="h-9 text-sm font-normal"
              inputId="stock-planning-product-mobile"
              label="สินค้า"
              openOnFocus={false}
              options={productOptions}
              placeholder="ค้นหาสินค้า"
              value={product}
              onChange={(value) => {
                setProduct(value)
                setPage(1)
              }}
            />
          </div>
          <button
            aria-haspopup="dialog"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={openMobileFilters}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            ตัวกรอง{hasFilters ? ' (มี)' : ''}
          </button>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 border-t border-slate-100 pt-2">
          <button
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            disabled={loading}
            onClick={() => void load()}
            type="button"
          >
            <RefreshCw aria-hidden="true" className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
          <button
            className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-normal text-white hover:bg-emerald-700 disabled:opacity-60"
            disabled={exporting || initialLoading || !plans.length}
            onClick={() => void exportExcel()}
            type="button"
          >
            <Download aria-hidden="true" className="size-4" />
            {exporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}
          </button>
        </div>
      </div>

      {mobileFilterDraft ? (
        <MobileFilterSheet
          footer={(
            <>
              <button
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setMobileFilterDraft({ group: '', includeEmpty: false, product: '' })}
                type="button"
              >
                ล้างตัวกรอง
              </button>
              <button
                className="h-11 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700"
                onClick={applyMobileFilters}
                type="button"
              >
                ใช้ตัวกรอง
              </button>
            </>
          )}
          onClose={() => setMobileFilterDraft(null)}
          title="ตัวกรองวางแผนสต๊อก"
          visibleClassName="lg:hidden"
        >
          <label className="block text-xs font-semibold text-slate-600">
            <span className="mb-1 block">หมวดสินค้า</span>
            <Select
              className="h-9 w-full"
              value={mobileFilterDraft.group}
              onChange={(event) => setMobileFilterDraft((current) => current
                ? { ...current, group: event.target.value }
                : current)}
            >
              <option value="">ทุกหมวด</option>
              {groupOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm text-slate-700">
            <input
              checked={mobileFilterDraft.includeEmpty}
              onChange={(event) => setMobileFilterDraft((current) => current
                ? { ...current, includeEmpty: event.target.checked }
                : current)}
              type="checkbox"
            />
            แสดงสินค้าที่ไม่มี PO
          </label>
        </MobileFilterSheet>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      {!initialLoading && shortagePlans.length ? (
        <UrgentPurchasePanel plans={shortagePlans} />
      ) : null}

      {view === 'table' ? (
        <>
          <PlanningPagination
            currentPage={currentPage}
            loading={initialLoading}
            onPageChange={setPage}
            onPageSizeChange={(value) => {
              setPageSize(value as (typeof pageSizeOptions)[number])
              setPage(1)
            }}
            pageCount={pageCount}
            pageSize={pageSize}
            total={plans.length}
          />
          <PlanDataSurface
            expanded={expanded}
            loading={initialLoading}
            plans={pagedPlans}
            setExpanded={setExpanded}
          />
        </>
      ) : (
        <CalendarView
          loading={initialLoading}
          month={month}
          rows={calendarRows}
          selectedDate={selectedDate}
          setMonth={setMonth}
          setSelectedDate={setSelectedDate}
        />
      )}
    </section>
  )
}

function UrgentPurchasePanel({ plans }: { plans: ProductPlan[] }) {
  return (
    <section className="rounded-xl border border-red-200 bg-red-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-red-800">ต้องซื้อสินค้าเพิ่มด่วน</h2>
          <p className="mt-1 text-xs text-red-700">
            พบ {plans.length} สินค้า · คำนวณจาก shortage สูงสุดตามลำดับวันส่ง
          </p>
        </div>
        <span className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">ต้องดำเนินการ</span>
      </div>

      <div className="hidden md:block">
        <div className="mt-3 overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="ns-table min-w-[1200px] w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="min-w-[200px] whitespace-nowrap p-2 text-center font-bold text-slate-700">สินค้า</th>
                <th className="min-w-[120px] whitespace-nowrap p-2 text-center font-bold text-slate-700">หมวด</th>
                <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">Stock ตอนนี้ (กก.)</th>
                <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">ต้องซื้อเพิ่ม (กก.)</th>
                <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">ต้นทุนเฉลี่ย (บาท/กก.)</th>
                <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">งบประมาณซื้อ (บาท)</th>
                <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">ราคาขาย PO ที่ขาด (บาท/กก.)</th>
                <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">กำไรที่จะได้ (บาท)</th>
                <th className="min-w-[220px] whitespace-nowrap p-2 text-center font-bold text-slate-700">PO Sell แรกที่ขาด</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const firstShortage = plan.rows.find((row) => !row.enough)
                return (
                  <tr key={plan.key}>
                    <td className="min-w-[200px] whitespace-nowrap p-3 text-center font-semibold text-slate-800">
                      {plan.productCode} - {plan.productName}
                    </td>
                    <td className="min-w-[120px] whitespace-nowrap p-3 text-center">
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{plan.group}</span>
                    </td>
                    <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums text-blue-700">{formatMoney(plan.stockNow)}</td>
                    <td className="whitespace-nowrap p-3 text-right font-bold tabular-nums text-red-700">{formatMoney(plan.shortage)}</td>
                    <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums text-slate-700">{plan.avgCost > 0 ? formatMoney(plan.avgCost) : '-'}</td>
                    <td className="whitespace-nowrap p-3 text-right font-bold tabular-nums text-red-700">{plan.buyBudget > 0 ? formatMoney(plan.buyBudget) : '-'}</td>
                    <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums text-emerald-700">{plan.poSellPrice > 0 ? formatMoney(plan.poSellPrice) : '-'}</td>
                    <td className={`whitespace-nowrap p-3 text-right font-bold tabular-nums ${plan.potentialMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {plan.poSellPrice > 0 ? formatMoney(plan.potentialMargin) : '-'}
                    </td>
                    <td className="p-3 text-center align-top">
                      <div className="font-mono font-semibold text-slate-700">{firstShortage?.docNo ?? '-'}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500">{firstShortage?.date ?? '-'}</div>
                      <div className="mt-0.5 max-w-[220px] truncate text-slate-600" title={firstShortage?.partnerName}>
                        {firstShortage?.partnerName ?? '-'}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 space-y-3 md:hidden">
        {plans.map((plan) => {
          const firstShortage = plan.rows.find((row) => !row.enough)
          return (
            <article
              className="rounded-xl border border-red-200 bg-white p-4 shadow-sm"
              data-stock-planning-mobile-card="urgent"
              key={plan.key}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-800">{plan.productCode} - {plan.productName}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{plan.group}</div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-red-700">ต้องซื้อเพิ่ม</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                <div>
                  <div className="text-slate-500">Stock ตอนนี้</div>
                  <div className="mt-0.5 text-right font-semibold tabular-nums text-blue-700">{formatMoney(plan.stockNow)} กก.</div>
                </div>
                <div>
                  <div className="text-slate-500">ต้องซื้อเพิ่ม</div>
                  <div className="mt-0.5 text-right font-bold tabular-nums text-red-700">{formatMoney(plan.shortage)} กก.</div>
                </div>
                <div>
                  <div className="text-slate-500">งบประมาณซื้อ</div>
                  <div className="mt-0.5 text-right font-semibold tabular-nums text-slate-700">{plan.buyBudget > 0 ? `${formatMoney(plan.buyBudget)} บาท` : '-'}</div>
                </div>
                <div>
                  <div className="text-slate-500">กำไรที่จะได้</div>
                  <div className={`mt-0.5 text-right font-semibold tabular-nums ${plan.potentialMargin >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {plan.poSellPrice > 0 ? `${formatMoney(plan.potentialMargin)} บาท` : '-'}
                  </div>
                </div>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600">
                <div className="font-mono font-semibold text-slate-800">{firstShortage?.docNo ?? '-'}</div>
                <div className="mt-0.5">{firstShortage?.date ?? '-'} · {firstShortage?.partnerName ?? '-'}</div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function PlanningPagination({
  currentPage,
  loading,
  onPageChange,
  onPageSizeChange,
  pageCount,
  pageSize,
  total,
}: {
  currentPage: number
  loading: boolean
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  pageCount: number
  pageSize: number
  total: number
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
      <span>พบทั้งหมด {total.toLocaleString('th-TH')} รายการ</span>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <PageSizeDropdown
          disabled={loading}
          onChange={onPageSizeChange}
          options={pageSizeOptions}
          value={pageSize}
        />
        <button
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          type="button"
        >
          ก่อนหน้า
        </button>
        <span className="px-1">หน้า {currentPage} / {pageCount}</span>
        <button
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading || currentPage >= pageCount}
          onClick={() => onPageChange(currentPage + 1)}
          type="button"
        >
          ถัดไป
        </button>
      </div>
    </div>
  )
}

function PlanDataSurface({
  expanded,
  loading,
  plans,
  setExpanded,
}: {
  expanded: string
  loading: boolean
  plans: ProductPlan[]
  setExpanded: (key: string) => void
}) {
  return (
    <section className="space-y-3">
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="ns-table min-w-[1050px] w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">สินค้า</th>
                  <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">หมวด</th>
                  <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">Stock พร้อมส่ง (กก.)</th>
                  <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">PO Buy กำลังเข้า (กก.)</th>
                  <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">PO Sell ค้างส่ง (กก.)</th>
                  <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">สมดุลสุดท้าย (กก.)</th>
                  <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">ต้องซื้อเพิ่ม (กก.)</th>
                  <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">จำนวน PO</th>
                  <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="p-8 text-center font-semibold text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td>
                  </tr>
                ) : plans.length ? plans.map((plan) => {
                  const isExpanded = expanded === plan.key
                  const detailId = `stock-planning-${plan.key}-desktop-detail`
                  return (
                    <Fragment key={plan.key}>
                      <tr className={plan.shortage > 0 ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-slate-50'}>
                        <td className="p-3 text-center">
                          <button
                            aria-controls={detailId}
                            aria-expanded={isExpanded}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-sm font-bold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            onClick={() => setExpanded(isExpanded ? '' : plan.key)}
                            type="button"
                          >
                            {isExpanded
                              ? <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
                              : <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-slate-400" />}
                            {plan.productCode} - {plan.productName}
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{plan.group}</span>
                        </td>
                        <td className="whitespace-nowrap p-3 text-right font-semibold tabular-nums text-blue-700">{formatMoney(plan.stockNow)}</td>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums text-emerald-700">{plan.buyComing ? `+${formatMoney(plan.buyComing)}` : '—'}</td>
                        <td className="whitespace-nowrap p-3 text-right tabular-nums text-red-700">{plan.sellPending ? `−${formatMoney(plan.sellPending)}` : '—'}</td>
                        <td className={`whitespace-nowrap p-3 text-right font-bold tabular-nums ${plan.finalBalance < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(plan.finalBalance)}</td>
                        <td className={`whitespace-nowrap p-3 text-right font-bold tabular-nums ${plan.shortage ? 'text-red-700' : 'text-emerald-700'}`}>{plan.shortage ? `⚠ ${formatMoney(plan.shortage)}` : '0'}</td>
                      <td className="p-3 text-right font-semibold tabular-nums text-slate-700">{plan.rows.length}</td>
                        <td className="p-3 text-center"><StatusIndicator value={plan.urgency} /></td>
                      </tr>
                      <tr className="bg-slate-50" hidden={!isExpanded} id={detailId}>
                        <td className="p-3" colSpan={9}>
                          <PlanDetailDesktopTable rows={plan.rows} />
                        </td>
                      </tr>
                    </Fragment>
                  )
                }) : (
                  <tr>
                    <td className="p-8 text-center font-semibold text-slate-500" colSpan={9}>ยังไม่มีรายการตามตัวกรอง</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
            กำลังโหลดข้อมูล
          </div>
        ) : plans.length ? plans.map((plan) => {
          const isExpanded = expanded === plan.key
          const detailId = `stock-planning-${plan.key}-mobile-detail`
          return (
            <article
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
              data-stock-planning-mobile-card="plan"
              key={plan.key}
            >
              <button
                aria-controls={detailId}
                aria-expanded={isExpanded}
                className="w-full p-4 text-left outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                onClick={() => setExpanded(isExpanded ? '' : plan.key)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    {isExpanded
                      ? <ChevronDown aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />
                      : <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-slate-400" />}
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800">{plan.productCode} - {plan.productName}</div>
                      <div className="mt-0.5 text-xs text-slate-500">{plan.group}</div>
                    </div>
                  </div>
                  <StatusIndicator value={plan.urgency} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                  <div>
                    <div className="text-slate-500">Stock พร้อมส่ง</div>
                    <div className="mt-0.5 text-right font-semibold tabular-nums text-blue-700">{formatMoney(plan.stockNow)} กก.</div>
                  </div>
                  <div>
                    <div className="text-slate-500">PO Buy กำลังเข้า</div>
                    <div className="mt-0.5 text-right font-semibold tabular-nums text-emerald-700">{plan.buyComing ? `+${formatMoney(plan.buyComing)}` : '—'} กก.</div>
                  </div>
                  <div>
                    <div className="text-slate-500">PO Sell ค้างส่ง</div>
                    <div className="mt-0.5 text-right font-semibold tabular-nums text-red-700">{plan.sellPending ? `−${formatMoney(plan.sellPending)}` : '—'} กก.</div>
                  </div>
                  <div>
                    <div className="text-slate-500">สมดุลสุดท้าย</div>
                    <div className={`mt-0.5 text-right font-bold tabular-nums ${plan.finalBalance < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatMoney(plan.finalBalance)} กก.</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                  <span className="text-slate-500">PO Sell {plan.rows.length.toLocaleString('th-TH')} รายการ</span>
                  <span className={`font-bold tabular-nums ${plan.shortage ? 'text-red-700' : 'text-emerald-700'}`}>
                    {plan.shortage ? `ต้องซื้อ ${formatMoney(plan.shortage)} กก.` : 'สต๊อกเพียงพอ'}
                  </span>
                </div>
              </button>
              <div className="border-t border-slate-200 bg-slate-50 p-3" hidden={!isExpanded} id={detailId}>
                <PlanDetailMobileCards rows={plan.rows} />
              </div>
            </article>
          )
        }) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
            ยังไม่มีรายการตามตัวกรอง
          </div>
        )}
      </div>
    </section>
  )
}

function PlanDetailDesktopTable({ rows }: { rows: PlanRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
      <table className="ns-table min-w-[900px] w-full text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">PO Sell</th>
            <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">ลูกค้า</th>
            <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">วันที่กำหนดส่ง</th>
            <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">ระยะเวลา</th>
            <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">ต้องส่ง (กก.)</th>
            <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">มี ณ วันส่ง (กก.)</th>
            <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">ต้องซื้อเพิ่ม (กก.)</th>
            <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className={row.shortage ? 'bg-red-50/60' : ''} key={`${row.docNo}-${row.date}`}>
              <td className="p-3 text-center font-mono font-bold">{row.docNo}</td>
              <td className="p-3 text-center">{row.partnerName}</td>
              <td className="whitespace-nowrap p-3 text-center font-mono">{row.date || '-'}</td>
              <td className="whitespace-nowrap p-3 text-center">
                {row.daysUntil < 0 ? `เลย ${Math.abs(row.daysUntil)} วัน` : row.daysUntil === 0 ? 'วันนี้' : `อีก ${row.daysUntil} วัน`}
              </td>
              <td className="whitespace-nowrap p-3 text-right font-bold tabular-nums text-amber-700">{formatMoney(row.remainingQty)}</td>
              <td className={`whitespace-nowrap p-3 text-right font-bold tabular-nums ${row.before >= row.remainingQty ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(row.before)}</td>
              <td className="whitespace-nowrap p-3 text-right font-bold tabular-nums text-red-700">{row.shortage ? `⚠ ${formatMoney(row.shortage)}` : '0'}</td>
              <td className="p-3 text-center"><StatusIndicator value={row.urgency} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlanDetailMobileCards({ rows }: { rows: PlanRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div className={`rounded-lg border bg-white p-3 ${row.shortage ? 'border-red-200' : 'border-slate-200'}`} key={`${row.docNo}-${row.date}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-mono text-sm font-bold text-slate-800">{row.docNo}</div>
              <div className="mt-0.5 text-xs text-slate-500">{row.partnerName}</div>
            </div>
            <StatusIndicator value={row.urgency} />
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
            <span>{row.date || '-'} · {row.daysUntil < 0 ? `เลย ${Math.abs(row.daysUntil)} วัน` : row.daysUntil === 0 ? 'วันนี้' : `อีก ${row.daysUntil} วัน`}</span>
            <span className="font-semibold tabular-nums">{formatMoney(row.remainingQty)} กก.</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 text-xs">
            <div>
              <div className="text-slate-500">มี ณ วันส่ง</div>
              <div className="text-right font-semibold tabular-nums">{formatMoney(row.before)} กก.</div>
            </div>
            <div>
              <div className="text-slate-500">ต้องซื้อเพิ่ม</div>
              <div className={`text-right font-bold tabular-nums ${row.shortage ? 'text-red-700' : 'text-emerald-700'}`}>
                {formatMoney(row.shortage)} กก.
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CalendarView({
  loading,
  month,
  rows,
  selectedDate,
  setMonth,
  setSelectedDate,
}: {
  loading: boolean
  month: string
  rows: PlanRow[]
  selectedDate: string
  setMonth: (value: string) => void
  setSelectedDate: (value: string) => void
}) {
  const [year, monthNumber] = month.split('-').map(Number)
  const first = new Date(year, monthNumber - 1, 1).getDay()
  const days = new Date(year, monthNumber, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)
  const cells: Array<string | null> = [
    ...Array.from<null>({ length: first }).fill(null),
    ...Array.from({ length: days }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`),
  ]
  while (cells.length % 7) cells.push(null)

  const rowsFor = (date: string) => rows.filter((row) => row.date === date)
  const selectedRows = selectedDate ? rowsFor(selectedDate) : []

  function changeMonth(value: string) {
    if (!value) return
    setMonth(value)
    setSelectedDate('')
  }

  function shiftMonth(offset: number) {
    const next = new Date(year, monthNumber - 1 + offset, 1)
    changeMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap items-end gap-2">
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50"
            onClick={() => shiftMonth(-1)}
            type="button"
          >
            ← เดือนก่อน
          </button>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500" htmlFor="stock-planning-month">
            <span>เดือน</span>
            <input
              aria-label="เลือกเดือน"
              className="h-9 rounded-md border border-slate-300 px-3 text-sm"
              id="stock-planning-month"
              onChange={(event) => changeMonth(event.target.value)}
              type="month"
              value={month}
            />
          </label>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50"
            onClick={() => shiftMonth(1)}
            type="button"
          >
            เดือนถัดไป →
          </button>
        </div>
        <div className="text-xs text-slate-500">เลือกวันที่เพื่อดู PO Sell</div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm font-semibold text-slate-500">กำลังโหลดข้อมูล</div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100">
                {['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'].map((day) => (
                  <div className="p-2 text-center text-xs font-bold text-slate-600" key={day}>{day}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {cells.map((date, index) => {
                  const dayRows = date ? rowsFor(date) : []
                  const hasShortage = dayRows.some((row) => !row.enough)
                  return (
                    <button
                      aria-label={date ? `${date} มี ${dayRows.length} รายการ` : undefined}
                      aria-pressed={date === selectedDate}
                      className={[
                        'min-h-[112px] border-b border-r border-slate-100 p-2 text-left align-top text-xs outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
                        date === today ? 'bg-yellow-50 ring-2 ring-inset ring-yellow-400' : '',
                        hasShortage ? 'bg-red-50/60' : dayRows.length ? 'bg-emerald-50/40' : '',
                        date === selectedDate ? 'bg-blue-50 ring-2 ring-inset ring-blue-500' : '',
                      ].join(' ')}
                      disabled={!date}
                      key={`${date}-${index}`}
                      onClick={() => date && setSelectedDate(date)}
                      type="button"
                    >
                      {date ? (
                        <>
                          <div className="mb-1 flex items-center justify-between font-bold text-slate-700">
                            <span>{Number(date.slice(-2))}</span>
                            {dayRows.length ? (
                              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-white">{dayRows.length}</span>
                            ) : null}
                          </div>
                          {dayRows.slice(0, 3).map((row) => (
                            <div
                              className={`mb-1 truncate rounded px-1 py-0.5 text-[10px] ${row.enough ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 font-bold text-red-800'}`}
                              key={`${row.docNo}-${row.productId}`}
                            >
                              {row.docNo} · {formatMoney(row.remainingQty)}
                            </div>
                          ))}
                          {dayRows.length > 3 ? (
                            <div className="text-[10px] text-slate-500">+{dayRows.length - 3} รายการ</div>
                          ) : null}
                        </>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedDate ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-100 p-3 text-sm font-bold text-slate-800">
            PO Sell วันที่ {selectedDate}
          </div>
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="ns-table min-w-[800px] w-full text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">PO Sell</th>
                    <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">สินค้า</th>
                    <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">ลูกค้า</th>
                    <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">ต้องส่ง (กก.)</th>
                    <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">มี ณ วันส่ง (กก.)</th>
                    <th data-column-align="right" className="whitespace-nowrap p-2 text-right font-bold text-slate-700">ต้องซื้อเพิ่ม (กก.)</th>
                    <th className="whitespace-nowrap p-2 text-center font-bold text-slate-700">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.length ? selectedRows.map((row) => (
                    <tr key={`${row.docNo}-${row.productId}`}>
                      <td className="p-3 text-center font-mono font-semibold">{row.docNo}</td>
                      <td className="p-3 text-center">{row.productCode} - {row.productName}</td>
                      <td className="p-3 text-center">{row.partnerName}</td>
                      <td className="whitespace-nowrap p-3 text-right font-bold tabular-nums text-amber-700">{formatMoney(row.remainingQty)}</td>
                      <td className="whitespace-nowrap p-3 text-right tabular-nums">{formatMoney(row.before)}</td>
                      <td className="whitespace-nowrap p-3 text-right font-bold tabular-nums text-red-700">{formatMoney(row.shortage)}</td>
                      <td className="p-3 text-center"><StatusIndicator value={row.urgency} /></td>
                    </tr>
                  )) : (
                    <tr>
                      <td className="p-8 text-center font-semibold text-slate-500" colSpan={7}>ยังไม่มีรายการ</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-3 p-3 md:hidden">
            {selectedRows.length ? selectedRows.map((row) => (
              <article
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                data-stock-planning-mobile-card="calendar"
                key={`${row.docNo}-${row.productId}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono font-bold text-slate-800">{row.docNo}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{row.productCode} - {row.productName}</div>
                  </div>
                  <StatusIndicator value={row.urgency} />
                </div>
                <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs">
                  <div className="text-slate-500">ลูกค้า</div>
                  <div className="mt-0.5 font-semibold text-slate-800">{row.partnerName}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200 pt-3">
                    <div>
                      <div className="text-slate-500">ต้องส่ง</div>
                      <div className="mt-0.5 text-right font-semibold tabular-nums">{formatMoney(row.remainingQty)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">มี ณ วันส่ง</div>
                      <div className="mt-0.5 text-right font-semibold tabular-nums">{formatMoney(row.before)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">ต้องซื้อ</div>
                      <div className="mt-0.5 text-right font-bold tabular-nums text-red-700">{formatMoney(row.shortage)}</div>
                    </div>
                  </div>
                </div>
              </article>
            )) : (
              <div className="p-8 text-center text-sm font-semibold text-slate-500">ยังไม่มีรายการ</div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  )
}
