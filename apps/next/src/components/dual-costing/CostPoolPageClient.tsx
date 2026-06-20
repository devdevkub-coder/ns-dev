'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import type { SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import {
  DualCostingCountRow,
  DualCostingErrorBox,
  DualCostingFilterCard,
  DualCostingHint,
  DualCostingPageSection,
  DualCostingStatCard,
  DualCostingWorkflowStrip,
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

export function CostPoolPageClient() {
  const [availableOnly, setAvailableOnly] = useState(true)
  const [costType, setCostType] = useState('all')
  const [data, setData] = useState<CostPoolPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [productId, setProductId] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('FIFO')
  const [sourceType, setSourceType] = useState('all')
  const [status, setStatus] = useState('all')
  const [toDate, setToDate] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('availableOnly', String(availableOnly))
    if (costType !== 'all') params.set('costType', costType)
    if (fromDate) params.set('from', fromDate)
    if (productId) params.set('productId', productId)
    if (search.trim()) params.set('q', search.trim())
    if (sort !== 'FIFO') params.set('sort', sort)
    if (sourceType !== 'all') params.set('sourceType', sourceType)
    if (status !== 'all') params.set('status', status)
    if (toDate) params.set('to', toDate)
    return params.toString()
  }, [availableOnly, costType, fromDate, productId, search, sort, sourceType, status, toDate])

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

  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => {
    return (data?.filters.products ?? []).map((product) => ({
      id: product.id,
      label: product.name,
      searchText: product.name.toLowerCase(),
    }))
  }, [data?.filters.products])

  const exportHref = `/api/dual-costing/cost-pool?${queryString ? `${queryString}&` : ''}format=xlsx`
  const hasActiveFilters = Boolean(search || fromDate || toDate || productId !== '' || costType !== 'all' || sourceType !== 'all' || status !== 'all' || !availableOnly || sort !== 'FIFO')

  function resetFilters() {
    setAvailableOnly(true)
    setCostType('all')
    setFromDate('')
    setProductId('')
    setSearch('')
    setSort('FIFO')
    setSourceType('all')
    setStatus('all')
    setToDate('')
  }

  return (
    <DualCostingPageSection>
      <DualCostingHint tone="amber">
        <strong>Cost Pool</strong> คือต้นทุนคงเหลือที่รอ match กับดีลขายทองแดง/ทองเหลือง ไม่ใช่ stock จริง และยังต้องแยกจาก WAC ที่ใช้ลง P/L ตามหลักบัญชี
      </DualCostingHint>

      <DualCostingErrorBox error={error} />
      <DualCostingWorkflowStrip active="pool" />

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
        <DualCostingStatCard icon="⚖️" label="Original Qty" tone="slate" value={formatMoney(data?.summary.originalQty ?? 0)} />
        <DualCostingStatCard icon="🔗" label="Matched Qty" tone="amber" value={formatMoney(data?.summary.usedQty ?? 0)} />
        <DualCostingStatCard icon="✅" label="Available Qty" tone="emerald" value={formatMoney(data?.summary.availableQty ?? 0)} />
        <DualCostingStatCard icon="💰" label="มูลค่าต้นทุนรวม" tone="slate" value={formatMoney(data?.summary.originalValue ?? 0)} />
        <DualCostingStatCard icon="📈" label="Available Value" tone="emerald" value={formatMoney(data?.summary.availableValue ?? 0)} />
      </div>

      <DualCostingFilterCard>
        {/* Desktop View */}
        <div className="hidden xl:block space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-[200px] flex-1 rounded-md border-slate-300 focus-visible:ring-emerald-100"
              placeholder="ค้นหาเลขที่ / คู่ค้า / สินค้า..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <span className="text-xs text-slate-500 font-semibold">วันที่:</span>
            <DatePickerInput id="cost-pool-date-from" value={fromDate} onChange={setFromDate} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="cost-pool-date-to" value={toDate} onChange={setToDate} />
            <div className="w-auto min-w-[180px]">
              <SearchCombobox
                hideLabel
                inputClassName="h-9 text-sm focus-visible:ring-emerald-100 border-slate-300"
                inputId="cost-pool-product-filter"
                label="สินค้า"
                options={productSearchOptions}
                placeholder="ทุกสินค้า"
                value={productId}
                onChange={(value) => setProductId(value || '')}
              />
            </div>
            <Select aria-label="Cost Type" className="w-auto min-w-[140px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={costType} onChange={(event) => setCostType(event.target.value)}>
              <option value="all">ทุก Cost Type</option>
              {(data?.filters.costTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select aria-label="Source Type" className="w-auto min-w-[130px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
              <option value="all">ทุก Source</option>
              {(data?.filters.sourceTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
            <Select aria-label="สถานะ" className="w-auto min-w-[130px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">ทุกสถานะ</option>
              {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
            </Select>
            <Select aria-label="เรียงลำดับ" className="w-auto min-w-[130px] h-9 border-slate-300 focus-visible:ring-emerald-100" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="FIFO">FIFO</option>
              <option value="LIFO">LIFO</option>
              <option value="Cheap">ต้นทุนถูกก่อน</option>
              <option value="Expensive">ต้นทุนแพงก่อน</option>
            </Select>
            <label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-700 select-none">
              <input checked={availableOnly} className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 border-emerald-300" type="checkbox" onChange={(event) => setAvailableOnly(event.target.checked)} />
              Available
            </label>
            {hasActiveFilters ? <Button size="xs" type="button" variant="secondary" onClick={resetFilters}>✕ ล้าง</Button> : null}
            <Button asChild className="ml-auto focus-visible:ring-2 focus-visible:ring-emerald-100" size="sm" variant="export">
              <a href={exportHref}>Export XLSX</a>
            </Button>
          </div>
        </div>

        {/* Mobile / Tablet Collapsible View */}
        <div className="block xl:hidden space-y-2">
          <div className="flex gap-2">
            <Input
              className="flex-1 h-10 rounded-md border-slate-300 focus-visible:ring-emerald-100"
              placeholder="ค้นหาเลขที่ / คู่ค้า / สินค้า..."
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className={`h-10 rounded-md border px-3 text-sm font-semibold transition-colors flex items-center gap-1 shrink-0 ${
                showMobileFilters ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700 border-slate-100'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              🔍 ตัวกรอง
            </button>
            <Button asChild size="sm" variant="export" className="h-10 shrink-0">
              <a href={exportHref}>📥 XLSX</a>
            </Button>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2.5 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500 font-semibold">
                  จากวันที่
                  <DatePickerInput className="mt-1 w-full" value={fromDate} onChange={setFromDate} />
                </label>
                <label className="text-[11px] text-slate-500 font-semibold">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 w-full" value={toDate} onChange={setToDate} />
                </label>
              </div>
              <label className="text-[11px] text-slate-500 font-semibold">
                เลือกสินค้า
                <SearchCombobox
                  hideLabel
                  inputClassName="h-9 text-sm w-full border-slate-300 mt-1"
                  inputId="cost-pool-product-filter-mobile"
                  label="สินค้า"
                  options={productSearchOptions}
                  placeholder="ทุกสินค้า"
                  value={productId}
                  onChange={(value) => setProductId(value || '')}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500 font-semibold">
                  Cost Type
                  <Select aria-label="Cost Type" className="mt-1 w-full h-9 border-slate-300" value={costType} onChange={(event) => setCostType(event.target.value)}>
                    <option value="all">ทุก Cost Type</option>
                    {(data?.filters.costTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </label>
                <label className="text-[11px] text-slate-500 font-semibold">
                  Source
                  <Select aria-label="Source Type" className="mt-1 w-full h-9 border-slate-300" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
                    <option value="all">ทุก Source</option>
                    {(data?.filters.sourceTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[11px] text-slate-500 font-semibold">
                  สถานะ
                  <Select aria-label="สถานะ" className="mt-1 w-full h-9 border-slate-300" value={status} onChange={(event) => setStatus(event.target.value)}>
                    <option value="all">ทุกสถานะ</option>
                    {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{statusLabel(item)}</option>)}
                  </Select>
                </label>
                <label className="text-[11px] text-slate-500 font-semibold">
                  เรียงลำดับ
                  <Select aria-label="เรียงลำดับ" className="mt-1 w-full h-9 border-slate-300" value={sort} onChange={(event) => setSort(event.target.value)}>
                    <option value="FIFO">FIFO</option>
                    <option value="LIFO">LIFO</option>
                    <option value="Cheap">ต้นทุนถูกก่อน</option>
                    <option value="Expensive">ต้นทุนแพงก่อน</option>
                  </Select>
                </label>
              </div>
              <div className="flex items-center justify-between pt-1">
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 select-none">
                  <input checked={availableOnly} className="h-3.5 w-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-emerald-300" type="checkbox" onChange={(event) => setAvailableOnly(event.target.checked)} />
                  Available Only
                </label>
                {hasActiveFilters ? <button className="rounded-md bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200" type="button" onClick={resetFilters}>ล้างตัวกรอง</button> : null}
              </div>
            </div>
          )}
        </div>
      </DualCostingFilterCard>

      <DualCostingCountRow countValue={data?.rows.length ?? 0}>
        <span className="text-xs text-slate-500">เรียงตาม {sort}</span>
      </DualCostingCountRow>

      <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <Table className="[&_tbody_tr]:border-slate-100 text-xs">
          <TableHeader className="bg-slate-50 border-b border-slate-100 font-semibold text-slate-600">
            <tr>
              <TableHead className="p-3 pl-4">Cost Type</TableHead>
              <TableHead className="p-3">Source</TableHead>
              <TableHead className="p-3">เลขที่</TableHead>
              <TableHead className="p-3">วันที่</TableHead>
              <TableHead className="p-3">คู่ค้า</TableHead>
              <TableHead className="p-3">สินค้า</TableHead>
              <TableHead className="p-3 text-right">Original</TableHead>
              <TableHead className="p-3 text-right">Matched</TableHead>
              <TableHead className="p-3 bg-emerald-50/50 text-right">Available</TableHead>
              <TableHead className="p-3 text-right">฿/หน่วย</TableHead>
              <TableHead className="p-3 bg-emerald-50/50 text-right">Available Value</TableHead>
              <TableHead className="p-3 pr-4 text-center">สถานะ</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
            {!isLoading && !error && (data?.rows.length ?? 0) === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-400" colSpan={12}>Cost Pool ว่างตามตัวกรองปัจจุบัน</TableCell></TableRow> : null}
            {!isLoading && (data?.rows ?? []).map((row) => (
              <TableRow key={row.costPoolId} className="hover:bg-slate-50/30 transition-colors border-t border-slate-100">
                <TableCell className="p-3 pl-4"><span className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ${costTypeBadgeClass(row.costType)}`}>{row.costType}</span></TableCell>
                <TableCell className="p-3"><span className={`rounded px-2 py-0.5 text-[10px] font-medium ${sourceBadgeClass(row.sourceType)}`}>{row.sourceType}</span></TableCell>
                <TableCell className="p-3 font-mono text-xs text-slate-700">{row.sourceNo}</TableCell>
                <TableCell className="p-3 whitespace-nowrap text-xs text-slate-600">{formatDateDisplay(row.date)}</TableCell>
                <TableCell className="p-3 text-xs text-slate-800 font-medium">{row.counterparty}</TableCell>
                <TableCell className="p-3 text-xs text-slate-700">{row.productName}</TableCell>
                <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(row.qty)}</TableCell>
                <TableCell className="p-3 text-right font-mono text-amber-700 font-medium">{formatMoney(row.usedQty)}</TableCell>
                <TableCell className="p-3 bg-emerald-50/20 text-right font-mono font-bold text-emerald-700">{formatMoney(row.availableQty)}</TableCell>
                <TableCell className="p-3 text-right font-mono text-slate-700">{formatMoney(row.unitCost)}</TableCell>
                <TableCell className="p-3 bg-emerald-50/20 text-right font-mono font-semibold text-emerald-700">{formatMoney(row.availableValue)}</TableCell>
                <TableCell className="p-3 pr-4 text-center"><StatusIndicator status={row.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </DualCostingPageSection>
  )
}

const costTypeCards = [
  { costType: 'Purchase', label: 'Purchase Cost (PO/Spot Buy)', tone: 'blue' },
  { costType: 'Production', label: 'Production Cost', tone: 'orange' },
  { costType: 'Regrade', label: 'Regrade / Conversion Cost', tone: 'purple' },
] as const

function CostTypeCard({
  availableQty,
  availableValue,
  count,
  costType,
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
        <div className="mt-0.5 text-lg font-bold font-mono text-slate-900 leading-tight">{formatMoney(availableQty)} กก.</div>
        <div className="text-xs text-slate-500 mt-0.5">
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
    <span className="inline-flex items-center gap-2 rounded-md px-2 py-0.5 text-[11px] text-slate-600 font-medium">
      <span className={`h-2 w-2 rounded-full ${tones}`} />
      {status}
    </span>
  )
}

function statusLabel(status: string) {
  if (status === 'Available') return 'Available (พร้อม)'
  if (status === 'Partial') return 'Partial (Match บางส่วน)'
  if (status === 'Fully') return 'Fully (Match ครบแล้ว)'
  return status
}

function costTypeBadgeClass(type: string) {
  if (type === 'Production') return 'bg-orange-50 text-orange-700 border border-orange-200/50'
  if (type === 'Regrade') return 'bg-purple-50 text-purple-700 border border-purple-200/50'
  return 'bg-blue-50 text-blue-700 border border-blue-200/50'
}

function sourceBadgeClass(type: string) {
  if (type === 'Production') return 'bg-orange-50 text-orange-700 border border-orange-200/50'
  if (type === 'Regrade' || type === 'Grade Adjustment') return 'bg-purple-50 text-purple-700 border border-purple-200/50'
  if (type === 'PO_Buy') return 'bg-cyan-50 text-cyan-700 border border-cyan-200/50'
  return 'bg-blue-50 text-blue-700 border border-blue-200/50'
}
