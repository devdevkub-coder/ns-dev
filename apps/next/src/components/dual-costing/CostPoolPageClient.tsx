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
  const [productId, setProductId] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('FIFO')
  const [sourceType, setSourceType] = useState('all')
  const [status, setStatus] = useState('all')
  const [toDate, setToDate] = useState('')

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    params.set('availableOnly', String(availableOnly))
    if (costType !== 'all') params.set('costType', costType)
    if (fromDate) params.set('from', fromDate)
    if (productId !== 'all') params.set('productId', productId)
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
    const list = (data?.filters.products ?? []).map((product) => ({
      id: product.id,
      label: product.name,
      searchText: product.name.toLowerCase(),
    }))
    return [{ id: 'all', label: 'ทุกสินค้า', searchText: 'ทุกสินค้า all' }, ...list]
  }, [data?.filters.products])

  const exportHref = `/api/dual-costing/cost-pool?${queryString ? `${queryString}&` : ''}format=xlsx`
  const hasActiveFilters = Boolean(search || fromDate || toDate || productId !== 'all' || costType !== 'all' || sourceType !== 'all' || status !== 'all' || !availableOnly || sort !== 'FIFO')

  function resetFilters() {
    setAvailableOnly(true)
    setCostType('all')
    setFromDate('')
    setProductId('all')
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
        <DualCostingStatCard label="Original Qty" value={formatMoney(data?.summary.originalQty ?? 0)} />
        <DualCostingStatCard label="Matched Qty" tone="amber" value={formatMoney(data?.summary.usedQty ?? 0)} />
        <DualCostingStatCard label="Available Qty" tone="emerald" value={formatMoney(data?.summary.availableQty ?? 0)} />
        <DualCostingStatCard label="มูลค่าต้นทุนรวม" value={formatMoney(data?.summary.originalValue ?? 0)} />
        <DualCostingStatCard label="Available Value" tone="emerald" value={formatMoney(data?.summary.availableValue ?? 0)} />
      </div>

      <DualCostingFilterCard>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="min-w-[240px] flex-1 rounded-md"
            placeholder="ค้นหาเลขที่ / คู่ค้า / สินค้า..."
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="text-xs text-slate-500">วันที่:</span>
          <DatePickerInput id="cost-pool-date-from" value={fromDate} onChange={setFromDate} />
          <span className="text-slate-400">→</span>
          <DatePickerInput id="cost-pool-date-to" value={toDate} onChange={setToDate} />
          <div className="w-auto min-w-[180px]">
            <SearchCombobox
              hideLabel
              inputClassName="h-9 text-sm"
              inputId="cost-pool-product-filter"
              label="สินค้า"
              options={productSearchOptions}
              placeholder="ค้นหาสินค้า"
              value={productId}
              onChange={(value) => setProductId(value || 'all')}
            />
          </div>
          <Select aria-label="Cost Type" className="w-auto min-w-[160px]" value={costType} onChange={(event) => setCostType(event.target.value)}>
            <option value="all">ทุก Cost Type</option>
            {(data?.filters.costTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Select aria-label="Source Type" className="w-auto min-w-[160px]" value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
            <option value="all">ทุก Source</option>
            {(data?.filters.sourceTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Select aria-label="สถานะ" className="w-auto min-w-[150px]" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">ทุกสถานะ</option>
            {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Select aria-label="เรียงลำดับ" className="w-auto min-w-[160px]" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="FIFO">FIFO</option>
            <option value="LIFO">LIFO</option>
            <option value="Cheap">ต้นทุนถูกก่อน</option>
            <option value="Expensive">ต้นทุนแพงก่อน</option>
          </Select>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-sm text-emerald-700">
            <input checked={availableOnly} className="h-4 w-4" type="checkbox" onChange={(event) => setAvailableOnly(event.target.checked)} />
            แสดงเฉพาะ Available
          </label>
          {hasActiveFilters ? <Button size="xs" type="button" variant="secondary" onClick={resetFilters}>✕ ล้าง</Button> : null}
          <Button asChild size="sm" variant="export">
            <a href={exportHref}>Export XLSX</a>
          </Button>
        </div>
      </DualCostingFilterCard>

      <DualCostingCountRow countValue={data?.rows.length ?? 0}>
        <span className="text-xs text-slate-500">เรียงตาม {sort}</span>
      </DualCostingCountRow>

      <Table className="[&_tbody_tr]:border-slate-100">
        <TableHeader>
          <tr>
            <TableHead>Cost Type</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>เลขที่</TableHead>
            <TableHead>วันที่</TableHead>
            <TableHead>คู่ค้า</TableHead>
            <TableHead>สินค้า</TableHead>
            <TableHead className="text-right">Original</TableHead>
            <TableHead className="text-right">Matched</TableHead>
            <TableHead className="bg-emerald-50 text-right">Available</TableHead>
            <TableHead className="text-right">฿/หน่วย</TableHead>
            <TableHead className="bg-emerald-50 text-right">Available Value</TableHead>
            <TableHead className="text-center">สถานะ</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {isLoading ? <TableRow><TableCell className="p-8 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
          {!isLoading && !error && (data?.rows.length ?? 0) === 0 ? <TableRow><TableCell className="p-8 text-center text-slate-400" colSpan={12}>Cost Pool ว่างตามตัวกรองปัจจุบัน</TableCell></TableRow> : null}
          {!isLoading && (data?.rows ?? []).map((row) => (
            <TableRow key={row.costPoolId} className="hover:bg-slate-50">
              <TableCell><span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${costTypeBadgeClass(row.costType)}`}>{row.costType}</span></TableCell>
              <TableCell><span className={`rounded-md px-2 py-0.5 text-[10px] ${sourceBadgeClass(row.sourceType)}`}>{row.sourceType}</span></TableCell>
              <TableCell className="font-mono text-xs">{row.sourceNo}</TableCell>
              <TableCell className="whitespace-nowrap text-xs">{formatDateDisplay(row.date)}</TableCell>
              <TableCell className="text-xs">{row.counterparty}</TableCell>
              <TableCell className="text-xs">{row.productName}</TableCell>
              <TableCell className="text-right">{formatMoney(row.qty)}</TableCell>
              <TableCell className="text-right text-amber-700">{formatMoney(row.usedQty)}</TableCell>
              <TableCell className="bg-emerald-50/40 text-right font-bold text-emerald-700">{formatMoney(row.availableQty)}</TableCell>
              <TableCell className="text-right">{formatMoney(row.unitCost)}</TableCell>
              <TableCell className="bg-emerald-50/40 text-right font-medium text-emerald-700">{formatMoney(row.availableValue)}</TableCell>
              <TableCell className="text-center"><StatusIndicator status={row.status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
  const classes = {
    blue: 'border-blue-500 bg-blue-50 text-blue-700',
    orange: 'border-orange-500 bg-orange-50 text-orange-700',
    purple: 'border-purple-500 bg-purple-50 text-purple-700',
  }[tone]

  return (
    <div className={`rounded-md border-l-4 p-3 ${classes}`}>
      <div className="text-xs font-bold">{label}</div>
      <div className="mt-1 text-lg font-bold">{formatMoney(availableQty)} กก.</div>
      <div className="text-xs">{formatMoney(availableValue)} ฿ · {count} lots · {costType}</div>
    </div>
  )
}

function StatusIndicator({ status }: { status: string }) {
  const tones = status === 'Available'
    ? 'bg-emerald-500'
    : status === 'Partially Used'
      ? 'bg-amber-500'
      : 'bg-slate-400'

  return (
    <span className="inline-flex items-center gap-2 rounded-md px-2 py-0.5 text-[11px] text-slate-700">
      <span className={`h-2.5 w-2.5 rounded-full ${tones}`} />
      {status}
    </span>
  )
}

function costTypeBadgeClass(type: string) {
  if (type === 'Production') return 'bg-orange-100 text-orange-700'
  if (type === 'Regrade') return 'bg-purple-100 text-purple-700'
  return 'bg-blue-100 text-blue-700'
}

function sourceBadgeClass(type: string) {
  if (type === 'Production') return 'bg-orange-100 text-orange-700'
  if (type === 'Regrade') return 'bg-purple-100 text-purple-700'
  if (type === 'PO_Buy') return 'bg-cyan-100 text-cyan-700'
  return 'bg-blue-100 text-blue-700'
}
