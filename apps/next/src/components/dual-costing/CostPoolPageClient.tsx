'use client'

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { Download, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import type { SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { useResizableColumns } from '@/components/ui/useResizableColumns'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import {
  DualCostingErrorBox,
  DualCostingFilterCard,
  DualCostingPageSection,
  DualCostingStatCard,
} from './DualCostingPageShell'
import {
  buildCostPoolExportHref,
  buildCostPoolQueryString,
  COST_POOL_DEFAULT_FILTERS,
  COST_POOL_GROUP_COLUMN_STORAGE_KEY,
  COST_POOL_GROUP_TABLE_COLUMN_COUNT,
  COST_POOL_LOT_COLUMN_STORAGE_KEY,
  COST_POOL_LOT_TABLE_COLUMN_COUNT,
  costPoolGroupColumns,
  costPoolLotColumns,
  type CostPoolGroupSortKey,
} from './cost-pool-page-config'

type CostPoolRow = {
  availableQty: number
  availableValue: number
  branchName: string
  costPoolId: string
  costType: string
  counterparty: string
  date: string
  productId: string
  productName: string
  qty: number
  sourceNo: string
  sourceType: string
  status: string
  totalCost: number
  unitCost: number
  usedQty: number
}

type CostPoolPayload = {
  filters: {
    costTypes: string[]
    products: Array<{ id: string; name: string }>
    sourceTypes: string[]
    statuses: string[]
  }
  rows: CostPoolRow[]
  summary: {
    availableQty: number
    availableValue: number
    originalQty: number
    originalValue: number
    rows: number
    usedQty: number
  }
  summaryByCostType: Array<{ availableQty: number; availableValue: number; count: number; costType: string }>
}

type SortDirection = 'asc' | 'desc'

type ProductGroup = {
  availableQty: number
  availableValue: number
  avgUnitCost: number
  key: string
  originalQty: number
  productId: string
  productName: string
  rows: CostPoolRow[]
  usedQty: number
}

const pageSizeOptions = [10, 25, 50, 100] as const

const costTypeOptions = [
  { label: 'ทุกประเภท', value: 'all' },
  { label: 'จัดซื้อ', value: 'Purchase' },
  { label: 'การผลิต', value: 'Production' },
  { label: 'ปรับเกรด', value: 'Regrade' },
] as const

const statusOptions = [
  { label: 'ทุกสถานะ', value: 'all' },
  { label: 'พร้อมใช้', value: 'Available' },
  { label: 'จับคู่แล้วบางส่วน', value: 'Partial' },
  { label: 'จับคู่ครบแล้ว', value: 'Fully' },
] as const

const costTypeCards = [
  { costType: 'Purchase', icon: '📥', label: 'ต้นทุนการจัดซื้อ (PO/Spot Buy)', tone: 'blue' },
  { costType: 'Production', icon: '🏭', label: 'ต้นทุนจากการผลิต', tone: 'orange' },
  { costType: 'Regrade', icon: '🔄', label: 'ต้นทุนปรับเกรด / แปรสภาพ', tone: 'purple' },
] as const

export function CostPoolPageClient() {
  const [activeProductKey, setActiveProductKey] = useState<string | null>(null)
  const [availableOnly, setAvailableOnly] = useState(COST_POOL_DEFAULT_FILTERS.availableOnly)
  const [costType, setCostType] = useState(COST_POOL_DEFAULT_FILTERS.costType)
  const [data, setData] = useState<CostPoolPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState(COST_POOL_DEFAULT_FILTERS.fromDate)
  const [groupSortDirection, setGroupSortDirection] = useState<SortDirection>('asc')
  const [groupSortKey, setGroupSortKey] = useState<CostPoolGroupSortKey>('productName')
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof pageSizeOptions)[number]>(10)
  const [productId, setProductId] = useState(COST_POOL_DEFAULT_FILTERS.productId)
  const [search, setSearch] = useState(COST_POOL_DEFAULT_FILTERS.search)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sort, setSort] = useState(COST_POOL_DEFAULT_FILTERS.sort)
  const [sourceType, setSourceType] = useState(COST_POOL_DEFAULT_FILTERS.sourceType)
  const [status, setStatus] = useState(COST_POOL_DEFAULT_FILTERS.status)
  const [toDate, setToDate] = useState(COST_POOL_DEFAULT_FILTERS.toDate)
  const groupColumnResize = useResizableColumns(COST_POOL_GROUP_COLUMN_STORAGE_KEY, costPoolGroupColumns)
  const lotColumnResize = useResizableColumns(COST_POOL_LOT_COLUMN_STORAGE_KEY, costPoolLotColumns)

  useEffect(() => {
    setPage(1)
  }, [availableOnly, costType, fromDate, productId, search, sort, sourceType, status, toDate])

  const queryString = useMemo(() => buildCostPoolQueryString({
    availableOnly,
    costType,
    fromDate,
    productId,
    search,
    sort,
    sourceType,
    status,
    toDate,
  }), [availableOnly, costType, fromDate, productId, search, sort, sourceType, status, toDate])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<CostPoolPayload>(`/api/dual-costing/cost-pool?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Cost Pool ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const groupedRows = useMemo<ProductGroup[]>(() => {
    const groups = new Map<string, ProductGroup>()

    rows.forEach((row) => {
      const key = row.productId || row.productName
      const existing = groups.get(key)
      if (existing) {
        existing.originalQty += row.qty
        existing.usedQty += row.usedQty
        existing.availableQty += row.availableQty
        existing.availableValue += row.availableValue
        existing.rows.push(row)
        return
      }

      groups.set(key, {
        availableQty: row.availableQty,
        availableValue: row.availableValue,
        avgUnitCost: 0,
        key,
        originalQty: row.qty,
        productId: row.productId,
        productName: row.productName,
        rows: [row],
        usedQty: row.usedQty,
      })
    })

    return [...groups.values()]
      .map((group) => ({
        ...group,
        avgUnitCost: group.availableQty > 0 ? group.availableValue / group.availableQty : 0,
      }))
      .sort((left, right) => {
        const result = compareSortValues(left[groupSortKey], right[groupSortKey])
        return groupSortDirection === 'asc' ? result : -result
      })
  }, [groupSortDirection, groupSortKey, rows])

  const totalGroups = groupedRows.length
  const totalPages = Math.max(1, Math.ceil(totalGroups / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return groupedRows.slice(start, start + pageSize)
  }, [currentPage, groupedRows, pageSize])
  const activeGroup = useMemo(() => groupedRows.find((group) => group.key === activeProductKey) ?? null, [activeProductKey, groupedRows])

  useEffect(() => {
    if (activeProductKey && !activeGroup) setActiveProductKey(null)
  }, [activeGroup, activeProductKey])

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => (
    (data?.filters.products ?? []).map((product) => ({
      id: product.id,
      label: product.name,
      searchText: product.name.toLowerCase(),
    }))
  ), [data?.filters.products])

  const exportHref = buildCostPoolExportHref(queryString)
  const hasActiveFilters = Boolean(
    search
    || fromDate
    || toDate
    || productId
    || costType !== 'all'
    || sourceType !== 'all'
    || status !== 'all'
    || !availableOnly
    || sort !== 'FIFO',
  )
  const activeFilterCount = [
    Boolean(search.trim()),
    fromDate,
    toDate,
    productId,
    costType !== 'all',
    sourceType !== 'all',
    status !== 'all',
    !availableOnly,
    sort !== 'FIFO',
  ].filter(Boolean).length

  function resetFilters() {
    setAvailableOnly(COST_POOL_DEFAULT_FILTERS.availableOnly)
    setCostType(COST_POOL_DEFAULT_FILTERS.costType)
    setFromDate(COST_POOL_DEFAULT_FILTERS.fromDate)
    setProductId(COST_POOL_DEFAULT_FILTERS.productId)
    setSearch(COST_POOL_DEFAULT_FILTERS.search)
    setSort(COST_POOL_DEFAULT_FILTERS.sort)
    setSourceType(COST_POOL_DEFAULT_FILTERS.sourceType)
    setStatus(COST_POOL_DEFAULT_FILTERS.status)
    setToDate(COST_POOL_DEFAULT_FILTERS.toDate)
  }

  function handleGroupSort(key: CostPoolGroupSortKey) {
    if (groupSortKey === key) {
      setGroupSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setGroupSortKey(key)
    setGroupSortDirection('asc')
  }

  function openGroupDetail(group: ProductGroup) {
    setActiveProductKey(group.key)
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, group: ProductGroup) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openGroupDetail(group)
  }

  return (
    <DualCostingPageSection className="space-y-5">
      <DualCostingErrorBox error={error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {costTypeCards.map((card, index) => {
          const row = data?.summaryByCostType.find((item) => item.costType === card.costType)
          return (
            <div className={index === costTypeCards.length - 1 ? 'col-span-2 md:col-span-1' : ''} key={card.costType}>
              <DualCostingStatCard
                icon={card.icon}
                label={card.label}
                tone={card.tone}
                value={`${formatMoney(row?.availableQty ?? 0)} กก.`}
              >
                {formatMoney(row?.availableValue ?? 0)} บาท · {(row?.count ?? 0).toLocaleString('th-TH')} ล็อต
              </DualCostingStatCard>
            </div>
          )
        })}
      </div>

      <DualCostingFilterCard className="hidden md:block">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block min-w-[260px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-9 pl-9"
                placeholder="ค้นหาเลขที่ / คู่ค้า / สินค้า..."
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <span className="text-xs text-slate-500">วันที่เอกสาร:</span>
            <DatePickerInput id="cost-pool-date-from" value={fromDate} onChange={setFromDate} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="cost-pool-date-to" value={toDate} onChange={setToDate} />
            <div className="w-auto min-w-[180px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 border-slate-300 text-sm"
                inputId="cost-pool-product-filter"
                label="สินค้า"
                options={productSearchOptions}
                placeholder="ทุกสินค้า"
                value={productId}
                onChange={(value) => setProductId(value || '')}
              />
            </div>
            <Select aria-label="แหล่งต้นทุน" className="h-9 w-auto min-w-[140px]" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
              <option value="all">ทุกแหล่งต้นทุน</option>
              {(data?.filters.sourceTypes ?? []).map((item) => <option key={item} value={item}>{sourceLabel(item)}</option>)}
            </Select>
            <Select aria-label="เรียงลำดับ" className="h-9 w-auto min-w-[145px]" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="FIFO">FIFO</option>
              <option value="LIFO">LIFO</option>
              <option value="Cheap">ต้นทุนถูกก่อน</option>
              <option value="Expensive">ต้นทุนแพงก่อน</option>
            </Select>
            <Button className="h-9" disabled={!hasActiveFilters} size="sm" type="button" variant="secondary" onClick={resetFilters}>ล้างตัวกรอง</Button>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">ประเภทต้นทุน:</span>
                {costTypeOptions.map((option) => (
                  <SegmentSingle active={costType === option.value} key={option.value} label={option.label} onClick={() => setCostType(option.value)} />
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500">สถานะ:</span>
                {statusOptions.map((option) => (
                  <SegmentSingle active={status === option.value} key={option.value} label={option.label} onClick={() => setStatus(option.value)} />
                ))}
              </div>
              <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 select-none">
                <input checked={availableOnly} className="size-4 accent-blue-600" type="checkbox" onChange={(event) => setAvailableOnly(event.target.checked)} />
                คงเหลือพร้อมใช้
              </label>
            </div>
            <Button asChild className="h-9 gap-2" size="sm" variant="export">
              <a href={exportHref}><Download className="size-4" /><span>ส่งออก Excel</span></a>
            </Button>
          </div>
        </div>
      </DualCostingFilterCard>

      <DualCostingFilterCard className="space-y-2 p-3 md:hidden">
        <div className="flex items-center gap-2">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-9 pl-9"
              placeholder="ค้นหาเลขที่ / คู่ค้า / สินค้า..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            type="button"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>
        <Button asChild className="h-9 w-full gap-2" size="sm" variant="export">
          <a href={exportHref}><Download className="size-4" /><span>ส่งออก Excel</span></a>
        </Button>
      </DualCostingFilterCard>

      {showMobileFilters ? (
        <MobileFilterSheet
          footer={(
            <>
              <button
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                type="button"
                onClick={() => {
                  resetFilters()
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button className="h-11 rounded-md bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700" type="button" onClick={() => setShowMobileFilters(false)}>
                ใช้ตัวกรอง
              </button>
            </>
          )}
          onClose={() => setShowMobileFilters(false)}
          title="ตัวกรอง Cost Pool"
          visibleClassName="md:hidden"
        >
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">วันที่เอกสาร</span>
            <div className="flex items-center gap-2">
              <DatePickerInput className="min-w-0 flex-1" value={fromDate} onChange={setFromDate} />
              <span className="text-slate-400">→</span>
              <DatePickerInput className="min-w-0 flex-1" value={toDate} onChange={setToDate} />
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">สินค้า</span>
            <SearchCombobox
              hideLabel
              inputClassName="h-9 w-full border-slate-300 text-sm"
              inputId="cost-pool-product-filter-mobile"
              label="สินค้า"
              options={productSearchOptions}
              placeholder="ทุกสินค้า"
              value={productId}
              onChange={(value) => setProductId(value || '')}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-600">
              แหล่งต้นทุน
              <Select aria-label="แหล่งต้นทุน" className="mt-1 h-9 w-full" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
                <option value="all">ทุกแหล่งต้นทุน</option>
                {(data?.filters.sourceTypes ?? []).map((item) => <option key={item} value={item}>{sourceLabel(item)}</option>)}
              </Select>
            </label>
            <label className="text-xs font-semibold text-slate-600">
              เรียงลำดับ
              <Select aria-label="เรียงลำดับ" className="mt-1 h-9 w-full" value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="FIFO">FIFO</option>
                <option value="LIFO">LIFO</option>
                <option value="Cheap">ต้นทุนถูกก่อน</option>
                <option value="Expensive">ต้นทุนแพงก่อน</option>
              </Select>
            </label>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">ประเภทต้นทุน</span>
            <div className="flex flex-wrap gap-2">
              {costTypeOptions.map((option) => (
                <SegmentSingle active={costType === option.value} key={`mobile-${option.value}`} label={option.label} onClick={() => setCostType(option.value)} />
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold text-slate-600">สถานะ</span>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <SegmentSingle active={status === option.value} key={`mobile-${option.value}`} label={option.label} onClick={() => setStatus(option.value)} />
              ))}
            </div>
          </div>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 select-none">
            <input checked={availableOnly} className="size-4 accent-blue-600" type="checkbox" onChange={(event) => setAvailableOnly(event.target.checked)} />
            เฉพาะคงเหลือพร้อมใช้
          </label>
        </MobileFilterSheet>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-sm text-slate-600">
        <div>พบทั้งหมด {totalGroups.toLocaleString('th-TH')} สินค้า · {rows.length.toLocaleString('th-TH')} ล็อต</div>
        <div className="flex flex-wrap items-center gap-2">
          {groupColumnResize.hasCustomWidths ? (
            <Button className="hidden h-9 lg:inline-flex" size="sm" type="button" variant="outline" onClick={groupColumnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button>
          ) : null}
          <Select
            aria-label="จำนวนสินค้าต่อหน้า"
            className="h-9 w-auto px-2 py-1"
            disabled={isLoading}
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof pageSizeOptions)[number])
              setPage(1)
            }}
          >
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </Select>
          <Button className="h-9" disabled={currentPage <= 1 || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <Button className="h-9" disabled={currentPage >= totalPages || isLoading} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="ns-table min-w-full text-sm" style={{ minWidth: groupColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {costPoolGroupColumns.map((column) => (
                <col key={column.key} style={groupColumnResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                <ResizableTableHead activeSortKey={groupSortKey} direction={groupSortDirection} label="สินค้า" sortKey="productName" onSort={handleGroupSort} resizeProps={groupColumnResize.getResizeHandleProps('productName', 'สินค้า')} />
                <ResizableTableHead activeSortKey={groupSortKey} align="right" direction={groupSortDirection} label="ปริมาณตั้งต้นรวม" sortKey="originalQty" onSort={handleGroupSort} resizeProps={groupColumnResize.getResizeHandleProps('originalQty', 'ปริมาณตั้งต้นรวม')} />
                <ResizableTableHead activeSortKey={groupSortKey} align="right" direction={groupSortDirection} label="จับคู่แล้วรวม" sortKey="usedQty" onSort={handleGroupSort} resizeProps={groupColumnResize.getResizeHandleProps('usedQty', 'จับคู่แล้วรวม')} />
                <ResizableTableHead activeSortKey={groupSortKey} align="right" direction={groupSortDirection} label="คงเหลือพร้อมใช้รวม" sortKey="availableQty" onSort={handleGroupSort} resizeProps={groupColumnResize.getResizeHandleProps('availableQty', 'คงเหลือพร้อมใช้รวม')} />
                <ResizableTableHead activeSortKey={groupSortKey} align="right" direction={groupSortDirection} label="ต้นทุนเฉลี่ย" sortKey="avgUnitCost" onSort={handleGroupSort} resizeProps={groupColumnResize.getResizeHandleProps('avgUnitCost', 'ต้นทุนเฉลี่ย')} />
                <ResizableTableHead activeSortKey={groupSortKey} align="right" direction={groupSortDirection} label="มูลค่าคงเหลือรวม" sortKey="availableValue" onSort={handleGroupSort} resizeProps={groupColumnResize.getResizeHandleProps('availableValue', 'มูลค่าคงเหลือรวม')} />
                <ResizableTableHead align="right" label="จัดการ" resizeProps={groupColumnResize.getResizeHandleProps('action', 'จัดการ')} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td className="p-8 text-center text-slate-500" colSpan={COST_POOL_GROUP_TABLE_COLUMN_COUNT}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && !error && totalGroups === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={COST_POOL_GROUP_TABLE_COLUMN_COUNT}>Cost Pool ว่างตามตัวกรองปัจจุบัน</td></tr> : null}
              {!isLoading && pagedGroups.map((group) => (
                <tr className="cursor-pointer transition-colors hover:bg-slate-50" key={group.key} onClick={() => openGroupDetail(group)}>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{group.productName}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{group.rows.length.toLocaleString('th-TH')} ล็อต</div>
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(group.originalQty)}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(group.usedQty)}</td>
                  <td className="p-3 text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(group.availableQty)}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(group.avgUnitCost)}</td>
                  <td className="p-3 text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(group.availableValue)}</td>
                  <td className="p-3 text-right">
                    <button
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        openGroupDetail(group)
                      }}
                    >
                      ดูรายละเอียด
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {isLoading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && !error && totalGroups === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">Cost Pool ว่างตามตัวกรองปัจจุบัน</div> : null}
        {!isLoading && pagedGroups.map((group) => (
          <article
            aria-label={`ดูรายละเอียด Cost Pool ${group.productName}`}
            className="cursor-pointer space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm transition-colors active:bg-slate-50"
            key={group.key}
            role="button"
            tabIndex={0}
            onClick={() => openGroupDetail(group)}
            onKeyDown={(event) => handleCardKeyDown(event, group)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-bold text-slate-900">{group.productName}</div>
                <div className="mt-0.5 text-xs text-slate-500">{group.rows.length.toLocaleString('th-TH')} ล็อตต้นทุน</div>
              </div>
              <span className="shrink-0 text-xs font-semibold text-blue-700">ดูรายละเอียด</span>
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-md border border-slate-100 bg-slate-50 p-3 text-sm">
              <MobileMetric label="ปริมาณตั้งต้นรวม" value={`${formatMoney(group.originalQty)} กก.`} />
              <MobileMetric align="right" label="จับคู่แล้วรวม" value={`${formatMoney(group.usedQty)} กก.`} />
              <MobileMetric label="ต้นทุนเฉลี่ย" value={formatMoney(group.avgUnitCost)} />
              <MobileMetric align="right" label="คงเหลือพร้อมใช้รวม" value={`${formatMoney(group.availableQty)} กก.`} />
            </div>
            <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">มูลค่าคงเหลือรวม</span>
              <span className="font-mono text-base font-bold tabular-nums text-slate-900">{formatMoney(group.availableValue)} บาท</span>
            </div>
          </article>
        ))}
      </div>

      {activeGroup ? (
        <Dialog open onOpenChange={(open) => { if (!open) setActiveProductKey(null) }}>
          <DialogContent
            aria-labelledby="cost-pool-detail-title"
            className="left-0 top-0 h-[100dvh] max-h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 rounded-none !p-0 overflow-hidden flex flex-col bg-slate-900 border-0 sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[90vh] sm:w-[calc(100%-2rem)] sm:max-w-[min(96vw,90rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-md"
            hideClose
          >
            <DialogHeader className="rounded-none bg-slate-900 px-4 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white sm:rounded-t-md sm:p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between">
                <div className="min-w-0">
                  <DialogTitle className="truncate text-base text-white sm:text-lg" id="cost-pool-detail-title">รายละเอียด Cost Pool: {activeGroup.productName}</DialogTitle>
                  <DialogDescription className="truncate text-slate-300">{activeGroup.rows.length.toLocaleString('th-TH')} ล็อต · เรียงตาม {sortLabel(sort)}</DialogDescription>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {lotColumnResize.hasCustomWidths ? (
                    <Button className="hidden h-9 border-slate-700 bg-slate-800 text-white hover:bg-slate-700 hover:text-white lg:inline-flex" size="sm" type="button" variant="outline" onClick={lotColumnResize.resetColumnWidths}>คืนค่าเดิมตาราง</Button>
                  ) : null}
                  <Button className="h-10 border-rose-600 bg-rose-600 font-normal text-white hover:border-rose-700 hover:bg-rose-700 hover:text-white sm:h-9" type="button" variant="outline" onClick={() => setActiveProductKey(null)}>ปิด</Button>
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50">
              <div className="space-y-4 p-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:p-4">
                <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-5">
                  <DetailMetric label="ปริมาณตั้งต้นรวม" value={`${formatMoney(activeGroup.originalQty)} กก.`} />
                  <DetailMetric label="จับคู่แล้วรวม" value={`${formatMoney(activeGroup.usedQty)} กก.`} />
                  <DetailMetric label="คงเหลือพร้อมใช้รวม" value={`${formatMoney(activeGroup.availableQty)} กก.`} />
                  <DetailMetric label="ต้นทุนเฉลี่ย" value={formatMoney(activeGroup.avgUnitCost)} />
                  <DetailMetric className="col-span-2 sm:col-span-1" label="มูลค่าคงเหลือรวม" value={`${formatMoney(activeGroup.availableValue)} บาท`} />
                </div>

                <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm md:block">
                  <div className="overflow-x-auto">
                    <table className="ns-table min-w-full text-sm" style={{ minWidth: lotColumnResize.tableMinWidth, tableLayout: 'fixed' }}>
                      <colgroup>
                        {costPoolLotColumns.map((column) => (
                          <col key={column.key} style={lotColumnResize.getColumnStyle(column.key)} />
                        ))}
                      </colgroup>
                      <thead className="bg-slate-100">
                        <tr>
                          <ResizableTableHead label="แหล่งต้นทุน" resizeProps={lotColumnResize.getResizeHandleProps('sourceType', 'แหล่งต้นทุน')} />
                          <ResizableTableHead label="เลขที่เอกสารต้นทุน" resizeProps={lotColumnResize.getResizeHandleProps('sourceNo', 'เลขที่เอกสารต้นทุน')} />
                          <ResizableTableHead label="วันที่เอกสาร" resizeProps={lotColumnResize.getResizeHandleProps('date', 'วันที่เอกสาร')} />
                          <ResizableTableHead label="สาขา" resizeProps={lotColumnResize.getResizeHandleProps('branchName', 'สาขา')} />
                          <ResizableTableHead label="คู่ค้า" resizeProps={lotColumnResize.getResizeHandleProps('counterparty', 'คู่ค้า')} />
                          <ResizableTableHead align="right" label="ปริมาณตั้งต้น" resizeProps={lotColumnResize.getResizeHandleProps('qty', 'ปริมาณตั้งต้น')} />
                          <ResizableTableHead align="right" label="จับคู่แล้ว" resizeProps={lotColumnResize.getResizeHandleProps('usedQty', 'จับคู่แล้ว')} />
                          <ResizableTableHead align="right" label="คงเหลือพร้อมใช้" resizeProps={lotColumnResize.getResizeHandleProps('availableQty', 'คงเหลือพร้อมใช้')} />
                          <ResizableTableHead align="right" label="ต้นทุน/หน่วย" resizeProps={lotColumnResize.getResizeHandleProps('unitCost', 'ต้นทุนต่อหน่วย')} />
                          <ResizableTableHead align="right" label="มูลค่าคงเหลือ" resizeProps={lotColumnResize.getResizeHandleProps('availableValue', 'มูลค่าคงเหลือ')} />
                          <ResizableTableHead label="สถานะ" resizeProps={lotColumnResize.getResizeHandleProps('status', 'สถานะ')} />
                        </tr>
                      </thead>
                      <tbody>
                        {activeGroup.rows.map((row) => (
                          <tr className="hover:bg-slate-50" key={row.costPoolId}>
                            <td className="p-3 whitespace-nowrap"><span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>{sourceLabel(row.sourceType)}</span></td>
                            <td className="p-3 whitespace-nowrap font-mono text-slate-900">{row.sourceNo}</td>
                            <td className="p-3 whitespace-nowrap text-slate-600">{formatDateDisplay(row.date)}</td>
                            <td className="p-3 text-slate-700">{row.branchName || '-'}</td>
                            <td className="p-3 font-medium text-slate-900">{row.counterparty}</td>
                            <td className="p-3 whitespace-nowrap text-right font-mono tabular-nums text-slate-700">{formatMoney(row.qty)}</td>
                            <td className="p-3 whitespace-nowrap text-right font-mono tabular-nums text-slate-700">{formatMoney(row.usedQty)}</td>
                            <td className="p-3 whitespace-nowrap text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(row.availableQty)}</td>
                            <td className="p-3 whitespace-nowrap text-right font-mono tabular-nums text-slate-700">{formatMoney(row.unitCost)}</td>
                            <td className="p-3 whitespace-nowrap text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(row.availableValue)}</td>
                            <td className="p-3"><StatusIndicator status={row.status} /></td>
                          </tr>
                        ))}
                        {activeGroup.rows.length === 0 ? <tr><td className="p-8 text-center text-slate-500" colSpan={COST_POOL_LOT_TABLE_COLUMN_COUNT}>ไม่พบล็อตต้นทุน</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-3 md:hidden">
                  {activeGroup.rows.map((row) => (
                    <article className="space-y-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm" key={row.costPoolId}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-sm font-bold text-slate-900">{row.sourceNo}</div>
                          <div className="mt-0.5 text-xs text-slate-500">{formatDateDisplay(row.date)} · {row.branchName || '-'}</div>
                        </div>
                        <StatusIndicator status={row.status} />
                      </div>
                      <div className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                        <div className="mb-1"><span className="font-semibold text-slate-500">แหล่งต้นทุน: </span><span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>{sourceLabel(row.sourceType)}</span></div>
                        <div><span className="font-semibold text-slate-500">คู่ค้า: </span><span className="text-slate-900">{row.counterparty}</span></div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <MobileMetric label="ปริมาณตั้งต้น" value={`${formatMoney(row.qty)} กก.`} />
                        <MobileMetric align="right" label="จับคู่แล้ว" value={`${formatMoney(row.usedQty)} กก.`} />
                        <MobileMetric label="ต้นทุน/หน่วย" value={formatMoney(row.unitCost)} />
                        <MobileMetric align="right" label="คงเหลือพร้อมใช้" value={`${formatMoney(row.availableQty)} กก.`} />
                      </div>
                      <div className="flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
                        <span className="text-xs text-slate-500">มูลค่าคงเหลือ</span>
                        <span className="font-mono text-base font-bold tabular-nums text-slate-900">{formatMoney(row.availableValue)} บาท</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </DualCostingPageSection>
  )
}

function SegmentSingle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      aria-pressed={active}
      className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${active ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function MobileMetric({
  align = 'left',
  label,
  value,
}: {
  align?: 'left' | 'right'
  label: string
  value: string
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <span className="block text-xs text-slate-500">{label}</span>
      <span className="mt-0.5 block font-mono font-semibold tabular-nums text-slate-900">{value}</span>
    </div>
  )
}

function DetailMetric({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-mono text-sm font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  )
}

function compareSortValues(left: number | string, right: number | string) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

function StatusIndicator({ status }: { status: string }) {
  const tones = status === 'Available'
    ? 'bg-emerald-500 text-emerald-700'
    : status === 'Partial'
      ? 'bg-amber-500 text-amber-700'
      : 'bg-slate-400 text-slate-600'
  const [dotTone, textTone] = tones.split(' ')

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold ${textTone}`}>
      <span className={`size-1.5 rounded-full ${dotTone}`} />
      {statusLabel(status)}
    </span>
  )
}

function statusLabel(status: string) {
  if (status === 'Available') return 'พร้อมใช้'
  if (status === 'Partial') return 'จับคู่แล้วบางส่วน'
  if (status === 'Fully') return 'จับคู่ครบแล้ว'
  return status
}

function sourceLabel(type: string) {
  if (type === 'PO_Buy') return 'PO ซื้อ'
  if (type === 'Spot_Buy') return 'ซื้อสด'
  if (type === 'Production') return 'การผลิต'
  if (type === 'Regrade' || type === 'Grade Adjustment') return 'ปรับเกรด / แปรสภาพ'
  return type
}

function sourceBadgeClass(type: string) {
  if (type === 'Production') return 'border-orange-200/50 bg-orange-50 text-orange-700'
  if (type === 'Regrade' || type === 'Grade Adjustment') return 'border-purple-200/50 bg-purple-50 text-purple-700'
  if (type === 'PO_Buy') return 'border-cyan-200/50 bg-cyan-50 text-cyan-700'
  return 'border-blue-200/50 bg-blue-50 text-blue-700'
}

function sortLabel(sort: string) {
  if (sort === 'LIFO') return 'LIFO'
  if (sort === 'Cheap') return 'ต้นทุนถูกก่อน'
  if (sort === 'Expensive') return 'ต้นทุนแพงก่อน'
  return 'FIFO'
}
