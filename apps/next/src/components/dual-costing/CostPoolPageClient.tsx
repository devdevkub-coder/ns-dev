'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import type { SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import {
  DualCostingErrorBox,
  DualCostingFilterCard,
  DualCostingPageSection,
  DualCostingStatCard,
} from './DualCostingPageShell'

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
type GroupSortKey = 'availableQty' | 'availableValue' | 'avgUnitCost' | 'originalQty' | 'productName' | 'usedQty'

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

export function CostPoolPageClient() {
  const [availableOnly, setAvailableOnly] = useState(true)
  const [data, setData] = useState<CostPoolPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedProductKeys, setExpandedProductKeys] = useState<string[]>([])
  const [fromDate, setFromDate] = useState('')
  const [groupSortDirection, setGroupSortDirection] = useState<SortDirection>('asc')
  const [groupSortKey, setGroupSortKey] = useState<GroupSortKey>('productName')
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [productId, setProductId] = useState('')
  const [search, setSearch] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sort, setSort] = useState('FIFO')
  const [sourceType, setSourceType] = useState('all')
  const [status, setStatus] = useState('all')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    setPage(1)
  }, [availableOnly, fromDate, productId, search, sort, sourceType, status, toDate])

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('availableOnly', String(availableOnly))
    if (fromDate) params.set('from', fromDate)
    if (productId) params.set('productId', productId)
    if (search.trim()) params.set('q', search.trim())
    if (sort !== 'FIFO') params.set('sort', sort)
    if (sourceType !== 'all') params.set('sourceType', sourceType)
    if (status !== 'all') params.set('status', status)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [availableOnly, fromDate, productId, search, sort, sourceType, status, toDate])

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

  useEffect(() => {
    setExpandedProductKeys((current) => current.filter((key) => groupedRows.some((group) => group.key === key)))
  }, [groupedRows])

  const totalGroups = groupedRows.length
  const totalPages = Math.max(1, Math.ceil(totalGroups / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedGroups = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return groupedRows.slice(start, start + pageSize)
  }, [currentPage, groupedRows, pageSize])

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filters.products ?? []).map((product) => ({
      id: product.id,
      label: product.name,
      searchText: product.name.toLowerCase(),
    }))
  }, [data?.filters.products])

  const exportHref = `/api/dual-costing/cost-pool?${queryString ? `${queryString}&` : ''}format=xlsx`
  const hasActiveFilters = Boolean(search || fromDate || toDate || productId !== '' || sourceType !== 'all' || status !== 'all' || !availableOnly || sort !== 'FIFO')
  const activeFilterCount = [
    fromDate,
    toDate,
    productId,
    sourceType !== 'all',
    status !== 'all',
    !availableOnly,
    sort !== 'FIFO',
  ].filter(Boolean).length
  const visibleExpandedCount = pagedGroups.filter((group) => expandedProductKeys.includes(group.key)).length

  function resetFilters() {
    setAvailableOnly(true)
    setFromDate('')
    setProductId('')
    setSearch('')
    setSort('FIFO')
    setSourceType('all')
    setStatus('all')
    setToDate('')
  }

  function handleGroupSort(key: GroupSortKey) {
    if (groupSortKey === key) {
      setGroupSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setGroupSortKey(key)
    setGroupSortDirection('asc')
  }

  function toggleGroup(key: string) {
    setExpandedProductKeys((current) => (
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    ))
  }

  function expandVisibleGroups() {
    setExpandedProductKeys((current) => {
      const next = new Set(current)
      pagedGroups.forEach((group) => next.add(group.key))
      return [...next]
    })
  }

  function collapseVisibleGroups() {
    const visibleKeys = new Set(pagedGroups.map((group) => group.key))
    setExpandedProductKeys((current) => current.filter((key) => !visibleKeys.has(key)))
  }

  const tableControls = (
    <>
      <div>
        พบทั้งหมด <span className="font-semibold text-slate-900">{totalGroups}</span> สินค้า
        <span className="ml-2 text-xs font-normal text-slate-500">lot ด้านในเรียงตาม {sort}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button className="h-9" size="sm" type="button" variant="outline" onClick={expandVisibleGroups}>
          ขยายทั้งหมด
        </Button>
        <Button className="h-9" size="sm" type="button" variant="outline" onClick={collapseVisibleGroups}>
          ย่อทั้งหมด
        </Button>
        <select
          aria-label="จำนวนสินค้าต่อหน้า"
          className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
          value={pageSize}
          onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}
        >
          {[5, 10, 25, 50].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
        </select>
        <Button
          disabled={currentPage <= 1}
          className="h-9"
          size="sm"
          variant="outline"
          type="button"
          onClick={() => setPage((value) => Math.max(1, value - 1))}
        >
          ก่อนหน้า
        </Button>
        <span className="px-1">หน้า {currentPage} / {totalPages}</span>
        <Button
          disabled={currentPage >= totalPages}
          className="h-9"
          size="sm"
          variant="outline"
          type="button"
          onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
        >
          ถัดไป
        </Button>
      </div>
    </>
  )

  return (
    <DualCostingPageSection>
      <DualCostingErrorBox error={error} />

      <div className="grid gap-3 md:grid-cols-3">
        {costTypeCards.map((card) => {
          const row = data?.summaryByCostType.find((item) => item.costType === card.costType)
          return (
            <CostTypeCard
              key={card.costType}
              availableQty={row?.availableQty ?? 0}
              availableValue={row?.availableValue ?? 0}
              count={row?.count ?? 0}
              {...card}
            />
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <DualCostingStatCard icon="⚖️" label="ปริมาณต้นทุนตั้งต้น" tone="slate" value={formatMoney(data?.summary.originalQty ?? 0)} />
        <DualCostingStatCard icon="🔗" label="ปริมาณที่จับคู่แล้ว" tone="amber" value={formatMoney(data?.summary.usedQty ?? 0)} />
        <DualCostingStatCard icon="✅" label="ปริมาณคงเหลือ" tone="emerald" value={formatMoney(data?.summary.availableQty ?? 0)} />
        <DualCostingStatCard icon="💰" label="มูลค่าต้นทุนรวม" tone="slate" value={formatMoney(data?.summary.originalValue ?? 0)} />
        <DualCostingStatCard icon="📈" label="มูลค่าคงเหลือ" tone="emerald" value={formatMoney(data?.summary.availableValue ?? 0)} />
      </div>

      <DualCostingFilterCard>
        <div className="hidden space-y-3 xl:block">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[200px] flex-1 rounded-md border-slate-300 focus-visible:ring-emerald-100"
              placeholder="ค้นหาเลขที่ / คู่ค้า / สินค้า..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="text-xs font-semibold text-slate-500">วันที่เอกสาร:</span>
            <DatePickerInput id="cost-pool-date-from" value={fromDate} onChange={setFromDate} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="cost-pool-date-to" value={toDate} onChange={setToDate} />
            <div className="w-auto min-w-[180px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 border-slate-300 text-sm focus-visible:ring-emerald-100"
                inputId="cost-pool-product-filter"
                label="สินค้า"
                options={productSearchOptions}
                placeholder="ทุกสินค้า"
                value={productId}
                onChange={(value) => setProductId(value || '')}
              />
            </div>
            <Select aria-label="แหล่งต้นทุน" className="h-9 w-auto min-w-[140px] border-slate-300 focus-visible:ring-emerald-100" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
              <option value="all">ทุกแหล่งต้นทุน</option>
              {(data?.filters.sourceTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select aria-label="สถานะ" className="h-9 w-auto min-w-[130px] border-slate-300 focus-visible:ring-emerald-100" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">ทุกสถานะ</option>
              {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
            </Select>
            <Select aria-label="เรียงลำดับ" className="h-9 w-auto min-w-[135px] border-slate-300 focus-visible:ring-emerald-100" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="FIFO">FIFO</option>
              <option value="LIFO">LIFO</option>
              <option value="Cheap">ต้นทุนถูกก่อน</option>
              <option value="Expensive">ต้นทุนแพงก่อน</option>
            </Select>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-700 select-none">
              <input checked={availableOnly} className="h-4 w-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" type="checkbox" onChange={(event) => setAvailableOnly(event.target.checked)} />
              คงเหลือพร้อมใช้
            </label>
            {hasActiveFilters ? <Button className="h-9" size="sm" type="button" variant="secondary" onClick={resetFilters}>ล้างตัวกรอง</Button> : null}
            <Button asChild className="ml-auto focus-visible:ring-2 focus-visible:ring-emerald-100" size="sm" variant="export">
              <a href={exportHref}>ส่งออก XLSX</a>
            </Button>
          </div>
        </div>

        <div className="block space-y-2 xl:hidden">
          <div className="flex gap-2">
            <Input
              className="h-10 flex-1 rounded-md border-slate-300 focus-visible:ring-emerald-100"
              placeholder="ค้นหาเลขที่ / คู่ค้า / สินค้า..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className={`flex h-10 shrink-0 items-center gap-1 rounded-md border px-3 text-sm font-semibold transition-colors ${
                showMobileFilters ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-100 bg-slate-100 text-slate-700'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              ตัวกรอง{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            <Button asChild className="h-10 shrink-0" size="sm" variant="export">
              <a href={exportHref}>XLSX</a>
            </Button>
          </div>

          {showMobileFilters ? (
            <div className="animate-in slide-in-from-top-2 grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-2 duration-100">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-500">
                  จากวันที่
                  <DatePickerInput className="mt-1 w-full" value={fromDate} onChange={setFromDate} />
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 w-full" value={toDate} onChange={setToDate} />
                </label>
              </div>
              <label className="text-xs font-semibold text-slate-500">
                เลือกสินค้า
                <SearchCombobox
                  hideLabel
                  inputClassName="mt-1 h-9 w-full border-slate-300 text-sm"
                  inputId="cost-pool-product-filter-mobile"
                  label="สินค้า"
                  options={productSearchOptions}
                  placeholder="ทุกสินค้า"
                  value={productId}
                  onChange={(value) => setProductId(value || '')}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-500">
                  แหล่งต้นทุน
                  <Select aria-label="แหล่งต้นทุน" className="mt-1 h-9 w-full border-slate-300" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
                    <option value="all">ทุกแหล่งต้นทุน</option>
                    {(data?.filters.sourceTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </label>
                <label className="text-xs font-semibold text-slate-500">
                  สถานะ
                  <Select aria-label="สถานะ" className="mt-1 h-9 w-full border-slate-300" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="all">ทุกสถานะ</option>
                    {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
                  </Select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold text-slate-500">
                  เรียงลำดับ
                  <Select aria-label="เรียงลำดับ" className="mt-1 h-9 w-full border-slate-300" value={sort} onChange={(event) => setSort(event.target.value)}>
                    <option value="FIFO">FIFO</option>
                    <option value="LIFO">LIFO</option>
                    <option value="Cheap">ต้นทุนถูกก่อน</option>
                    <option value="Expensive">ต้นทุนแพงก่อน</option>
                  </Select>
                </label>
              </div>
              <div className="flex items-center justify-between pt-1">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 select-none">
                  <input checked={availableOnly} className="h-3.5 w-3.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" type="checkbox" onChange={(event) => setAvailableOnly(event.target.checked)} />
                  เฉพาะคงเหลือพร้อมใช้
                </label>
                {hasActiveFilters ? <button className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={resetFilters}>ล้างตัวกรอง</button> : null}
              </div>
            </div>
          ) : null}
        </div>
      </DualCostingFilterCard>

      <div className="mb-3 flex flex-col gap-3 px-1 py-1 text-sm text-slate-600 md:hidden">
        {tableControls}
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 text-sm text-slate-600 lg:flex-row lg:items-center lg:justify-between">
          {tableControls}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                <GroupHeaderCell activeKey={groupSortKey} align="left" direction={groupSortDirection} label="สินค้า" sortKey="productName" onSort={handleGroupSort} />
                <GroupHeaderCell activeKey={groupSortKey} align="right" direction={groupSortDirection} label="ปริมาณตั้งต้นรวม" sortKey="originalQty" onSort={handleGroupSort} />
                <GroupHeaderCell activeKey={groupSortKey} align="right" direction={groupSortDirection} label="จับคู่แล้วรวม" sortKey="usedQty" onSort={handleGroupSort} />
                <GroupHeaderCell activeKey={groupSortKey} align="right" direction={groupSortDirection} label="คงเหลือพร้อมใช้รวม" sortKey="availableQty" onSort={handleGroupSort} />
                <GroupHeaderCell activeKey={groupSortKey} align="right" direction={groupSortDirection} label="ต้นทุนเฉลี่ย" sortKey="avgUnitCost" onSort={handleGroupSort} />
                <GroupHeaderCell activeKey={groupSortKey} align="right" direction={groupSortDirection} label="มูลค่าคงเหลือรวม" sortKey="availableValue" onSort={handleGroupSort} />
                <th className="px-4 py-3 text-right font-semibold text-slate-700">ดูรายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? <tr><td className="px-4 py-10 text-center text-slate-500" colSpan={7}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && !error && totalGroups === 0 ? <tr><td className="px-4 py-10 text-center text-slate-400" colSpan={7}>Cost Pool ว่างตามตัวกรองปัจจุบัน</td></tr> : null}
              {!isLoading && pagedGroups.map((group) => {
                const isExpanded = expandedProductKeys.includes(group.key)
                return (
                  <Fragment key={group.key}>
                    <tr key={group.key} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <button className="flex w-full items-center gap-3 text-left" type="button" onClick={() => toggleGroup(group.key)}>
                          <span className="text-slate-400">{isExpanded ? '▾' : '▸'}</span>
                          <span className="font-semibold text-slate-900">{group.productName}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(group.originalQty)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(group.usedQty)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(group.availableQty)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(group.avgUnitCost)}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(group.availableValue)}</td>
                      <td className="px-4 py-3 text-right">
                        <button className="text-sm font-semibold text-slate-700 hover:text-slate-900" type="button" onClick={() => toggleGroup(group.key)}>
                          {isExpanded ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr key={`${group.key}-details`} className="bg-slate-50/60">
                        <td className="px-4 pb-4 pt-0" colSpan={7}>
                          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50">
                                  <tr>
                                    <th className="px-3 py-3 text-left font-semibold text-slate-700">แหล่งต้นทุน</th>
                                    <th className="px-3 py-3 text-left font-semibold text-slate-700">เลขที่เอกสารต้นทุน</th>
                                    <th className="px-3 py-3 text-left font-semibold text-slate-700">วันที่เอกสาร</th>
                                    <th className="px-3 py-3 text-left font-semibold text-slate-700">คู่ค้า</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-700">ปริมาณตั้งต้น</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-700">จับคู่แล้ว</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-700">คงเหลือพร้อมใช้</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-700">ต้นทุน/หน่วย</th>
                                    <th className="px-3 py-3 text-right font-semibold text-slate-700">มูลค่าคงเหลือ</th>
                                    <th className="px-3 py-3 text-center font-semibold text-slate-700">สถานะ</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {group.rows.map((row) => (
                                    <tr key={row.costPoolId} className="hover:bg-slate-50">
                                      <td className="whitespace-nowrap px-3 py-3"><span className={`rounded border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>{row.sourceType}</span></td>
                                      <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-900">{row.sourceNo}</td>
                                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateDisplay(row.date)}</td>
                                      <td className="px-3 py-3 font-medium text-slate-900">{row.counterparty}</td>
                                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.qty)}</td>
                                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.usedQty)}</td>
                                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(row.availableQty)}</td>
                                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono tabular-nums text-slate-700">{formatMoney(row.unitCost)}</td>
                                      <td className="whitespace-nowrap px-3 py-3 text-right font-mono font-semibold tabular-nums text-slate-900">{formatMoney(row.availableValue)}</td>
                                      <td className="px-3 py-3 text-center"><StatusIndicator status={row.status} /></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {isLoading ? <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div> : null}
        {!isLoading && !error && totalGroups === 0 ? <div className="rounded-lg border border-slate-200 bg-white p-4 text-center text-sm text-slate-400 shadow-sm">Cost Pool ว่างตามตัวกรองปัจจุบัน</div> : null}
        {!isLoading && pagedGroups.map((group) => {
          const isExpanded = expandedProductKeys.includes(group.key)
          return (
            <div key={group.key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <button className="flex w-full items-center justify-between gap-3 text-left" type="button" onClick={() => toggleGroup(group.key)}>
                <div>
                  <div className="text-base font-bold text-slate-900">{group.productName}</div>
                  <div className="mt-1 text-xs text-slate-500">แตะเพื่อ{isExpanded ? 'ซ่อน' : 'ดู'} lot รายการ</div>
                </div>
                <span className="text-slate-400">{isExpanded ? '▾' : '▸'}</span>
              </button>

              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                <MobileMetric label="ปริมาณตั้งต้นรวม" value={`${formatMoney(group.originalQty)} กก.`} />
                <MobileMetric align="right" label="จับคู่แล้วรวม" value={`${formatMoney(group.usedQty)} กก.`} />
                <MobileMetric label="คงเหลือพร้อมใช้รวม" value={`${formatMoney(group.availableQty)} กก.`} />
                <MobileMetric align="right" label="ต้นทุนเฉลี่ย" value={formatMoney(group.avgUnitCost)} />
                <MobileMetric className="col-span-2 text-right" label="มูลค่าคงเหลือรวม" value={formatMoney(group.availableValue)} />
              </div>

              {isExpanded ? (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
                  {group.rows.map((row) => (
                    <div key={row.costPoolId} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${sourceBadgeClass(row.sourceType)}`}>{row.sourceType}</span>
                          </div>
                          <div className="mt-2 font-mono text-sm font-bold text-slate-900">{row.sourceNo}</div>
                          <div className="mt-0.5 text-xs text-slate-500">{formatDateDisplay(row.date)} · {row.branchName}</div>
                        </div>
                        <StatusIndicator status={row.status} />
                      </div>

                      <div className="mt-3 rounded-lg border border-slate-100 bg-white p-3 text-sm text-slate-700">
                        <span className="font-semibold text-slate-500">คู่ค้า: </span>
                        <span className="text-slate-900">{row.counterparty}</span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                        <MobileMetric label="ปริมาณตั้งต้น" value={`${formatMoney(row.qty)} กก.`} />
                        <MobileMetric align="right" label="จับคู่แล้ว" value={`${formatMoney(row.usedQty)} กก.`} />
                        <MobileMetric label="คงเหลือพร้อมใช้" value={`${formatMoney(row.availableQty)} กก.`} />
                        <MobileMetric align="right" label="ต้นทุน/หน่วย" value={formatMoney(row.unitCost)} />
                        <MobileMetric className="col-span-2 text-right" label="มูลค่าคงเหลือ" value={formatMoney(row.availableValue)} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}

        {!isLoading && totalGroups > 0 ? (
          <div className="flex flex-col gap-3 px-1 py-1 text-sm text-slate-600">
            <div>เปิดดูอยู่ <span className="font-semibold text-slate-900">{visibleExpandedCount}</span> / {pagedGroups.length} สินค้า</div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="h-9" size="sm" type="button" variant="outline" onClick={expandVisibleGroups}>
                ขยายทั้งหมด
              </Button>
              <Button className="h-9" size="sm" type="button" variant="outline" onClick={collapseVisibleGroups}>
                ย่อทั้งหมด
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </DualCostingPageSection>
  )
}

function GroupHeaderCell({
  activeKey,
  align = 'left',
  direction,
  label,
  onSort,
  sortKey,
}: {
  activeKey: GroupSortKey
  align?: 'left' | 'right'
  direction: SortDirection
  label: string
  onSort: (key: GroupSortKey) => void
  sortKey: GroupSortKey
}) {
  const active = activeKey === sortKey

  return (
    <th className={`px-4 py-3 font-semibold text-slate-700 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button className={`inline-flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`} type="button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="text-slate-400">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

function MobileMetric({
  align = 'left',
  className,
  label,
  value,
}: {
  align?: 'left' | 'right'
  className?: string
  label: string
  value: string
}) {
  return (
    <div className={className ?? ''}>
      <span className="block text-xs text-slate-500">{label}</span>
      <span className={`mt-0.5 block font-mono font-semibold tabular-nums text-slate-900 ${align === 'right' ? 'text-right' : ''}`}>{value}</span>
    </div>
  )
}

function compareSortValues(left: number | string, right: number | string) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

const costTypeCards = [
  { costType: 'Purchase', label: 'ต้นทุนการจัดซื้อ (PO/Spot Buy)', tone: 'blue' },
  { costType: 'Production', label: 'ต้นทุนจากการผลิต', tone: 'orange' },
  { costType: 'Regrade', label: 'ต้นทุนปรับเกรด / แปรสภาพ', tone: 'purple' },
] as const

function CostTypeCard({
  availableQty,
  availableValue,
  count,
  label,
  tone,
}: {
  availableQty: number
  availableValue: number
  count: number
  costType: string
  label: string
  tone: 'blue' | 'orange' | 'purple'
}) {
  const colors = {
    blue: 'bg-blue-100 text-blue-700 border-blue-200/50',
    orange: 'bg-orange-100 text-orange-700 border-orange-200/50',
    purple: 'bg-purple-100 text-purple-700 border-purple-200/50',
  }[tone]

  const icons = {
    blue: '📥',
    orange: '🏭',
    purple: '🔄',
  }[tone]

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl ${colors.split(' ')[0]}`}>{icons}</div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        <div className="mt-0.5 font-mono text-lg font-bold leading-tight text-slate-900">{formatMoney(availableQty)} กก.</div>
        <div className="mt-0.5 text-xs text-slate-500">
          <span className="font-mono font-semibold text-slate-700">{formatMoney(availableValue)}</span> ฿ · <span className="font-semibold text-slate-700">{count}</span> lots
        </div>
      </div>
    </div>
  )
}

function StatusIndicator({ status }: { status: string }) {
  const tones = status === 'Available'
    ? 'bg-emerald-500'
    : status === 'Partial'
      ? 'bg-amber-500'
      : 'bg-slate-400'

  return (
    <span className="inline-flex items-center gap-2 rounded-md px-2 py-0.5 text-xs font-medium text-slate-600">
      <span className={`h-2 w-2 rounded-full ${tones}`} />
      {statusLabel(status)}
    </span>
  )
}

function statusLabel(status: string) {
  if (status === 'Available') return 'Available (พร้อม)'
  if (status === 'Partial') return 'Partial (Match บางส่วน)'
  if (status === 'Fully') return 'Fully (Match ครบแล้ว)'
  return status
}

function sourceBadgeClass(type: string) {
  if (type === 'Production') return 'bg-orange-50 text-orange-700 border border-orange-200/50'
  if (type === 'Regrade' || type === 'Grade Adjustment') return 'bg-purple-50 text-purple-700 border border-purple-200/50'
  if (type === 'PO_Buy') return 'bg-cyan-50 text-cyan-700 border border-cyan-200/50'
  return 'bg-blue-50 text-blue-700 border border-blue-200/50'
}
