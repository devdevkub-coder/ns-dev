'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

type CatalogTab = 'accounting' | 'all' | 'daily' | 'finance' | 'main' | 'production' | 'stock' | 'tracking'
type CatalogColumnKey = 'action' | 'owner' | 'report'
type LegacyTab = 'purchase-channel' | 'purchase-product' | 'purchase-supplier' | 'sales-channel' | 'sales-customer'
type SortDirection = 'asc' | 'desc'

type ReportLink = {
  category: Exclude<CatalogTab, 'all'>
  href: string
  label: string
  owner: string
}

type AggregateRow = {
  amount: number
  avgPrice?: number
  cost?: number
  count: number
  marginPct?: number
  name: string
  profit?: number
  weight?: number
}

type AggregatePayload = {
  generatedAt: string
  purchaseChannel: AggregateRow[]
  purchaseProduct: AggregateRow[]
  purchaseSupplier: AggregateRow[]
  salesChannel: AggregateRow[]
  salesCustomer: AggregateRow[]
  scope: {
    fromDate: string
    purchaseBillCount: number
    salesBillCount: number
    toDate: string
  }
}

type Column = {
  key: keyof AggregateRow
  label: string
  tone?: 'amount' | 'cost' | 'profit'
  type?: 'currency' | 'number' | 'percent' | 'weight'
}

type AggregateColumnKey = Column['key']

const catalogColumns: Array<ResizableColumnDefinition<CatalogColumnKey>> = [
  { key: 'report', defaultWidth: 240, minWidth: 190 },
  { key: 'owner', defaultWidth: 145, minWidth: 120 },
  { key: 'action', defaultWidth: 115, minWidth: 100 },
]

const catalogTabs: Array<{ k: CatalogTab; l: string }> = [
  { k: 'all', l: 'ทั้งหมด' },
  { k: 'main', l: 'ภาพรวม / ควบคุม' },
  { k: 'finance', l: 'การเงิน / หนี้' },
  { k: 'accounting', l: 'การเงิน / บัญชี' },
  { k: 'stock', l: 'สินค้า' },
  { k: 'tracking', l: 'ติดตาม' },
  { k: 'production', l: 'การผลิต' },
  { k: 'daily', l: 'รายวัน / PO' },
]

const legacyTabs: Array<{ k: LegacyTab; l: string }> = [
  { k: 'purchase-channel', l: 'ซื้อตามช่องทาง' },
  { k: 'purchase-supplier', l: 'ซื้อตามผู้ขาย' },
  { k: 'purchase-product', l: 'ซื้อตามสินค้า' },
  { k: 'sales-channel', l: 'ขายตามช่องทาง' },
  { k: 'sales-customer', l: 'ขายตามลูกค้า' },
]

const columnsByTab: Record<LegacyTab, Column[]> = {
  'purchase-channel': [
    { key: 'name', label: 'ช่องทาง' },
    { key: 'count', label: 'จำนวนบิล', type: 'number' },
    { key: 'weight', label: 'น้ำหนัก', type: 'weight' },
    { key: 'amount', label: 'มูลค่าซื้อ', tone: 'amount', type: 'currency' },
  ],
  'purchase-product': [
    { key: 'name', label: 'สินค้า' },
    { key: 'count', label: 'จำนวน' },
    { key: 'weight', label: 'น้ำหนัก', type: 'weight' },
    { key: 'amount', label: 'มูลค่าซื้อ', tone: 'amount', type: 'currency' },
    { key: 'avgPrice', label: 'ราคาเฉลี่ย', tone: 'amount', type: 'currency' },
  ],
  'purchase-supplier': [
    { key: 'name', label: 'ผู้ขาย' },
    { key: 'count', label: 'บิล', type: 'number' },
    { key: 'weight', label: 'น้ำหนัก', type: 'weight' },
    { key: 'amount', label: 'มูลค่า', tone: 'amount', type: 'currency' },
  ],
  'sales-channel': [
    { key: 'name', label: 'ช่องทาง' },
    { key: 'count', label: 'บิล', type: 'number' },
    { key: 'weight', label: 'น้ำหนัก', type: 'weight' },
    { key: 'amount', label: 'ยอดขาย', tone: 'amount', type: 'currency' },
    { key: 'cost', label: 'ต้นทุน', tone: 'cost', type: 'currency' },
    { key: 'profit', label: 'กำไร', tone: 'profit', type: 'currency' },
    { key: 'marginPct', label: 'อัตรากำไร (%)', tone: 'profit', type: 'percent' },
  ],
  'sales-customer': [
    { key: 'name', label: 'ลูกค้า' },
    { key: 'count', label: 'บิล', type: 'number' },
    { key: 'amount', label: 'ยอดขาย', tone: 'amount', type: 'currency' },
    { key: 'profit', label: 'กำไร', tone: 'profit', type: 'currency' },
  ],
}

const reports: ReportLink[] = [
  { category: 'main', href: '/dashboard', label: 'ภาพรวมแดชบอร์ด', owner: 'ภาพรวม' },
  { category: 'main', href: '/owner-daily', label: 'ควบคุมรายวันผู้บริหาร', owner: 'ภาพรวม' },
  { category: 'main', href: '/daily-report', label: 'รายงานประจำวัน', owner: 'ภาพรวม' },
  { category: 'main', href: '/profit-cost-analysis', label: 'วิเคราะห์กำไรและต้นทุน', owner: 'ภาพรวม' },
  { category: 'main', href: '/sales-plan', label: 'แผนการขาย — ทองแดง / ทองเหลือง', owner: 'ภาพรวม' },
  { category: 'main', href: '/sales-commission', label: 'แดชบอร์ดติดตามการขาย', owner: 'ภาพรวม' },
  { category: 'main', href: '/cash-flow-calendar', label: 'ปฏิทินกระแสเงินสด', owner: 'ภาพรวม' },
  { category: 'main', href: '/business-calendar', label: 'ปฏิทินธุรกิจ', owner: 'ภาพรวม' },
  { category: 'main', href: '/cash-others-summary', label: 'สรุปเงินสดและรายการอื่น', owner: 'ภาพรวม' },
  { category: 'finance', href: '/finance/ar', label: 'ลูกหนี้ (AR)', owner: 'การเงิน' },
  { category: 'finance', href: '/finance/ap', label: 'เจ้าหนี้ (AP)', owner: 'การเงิน' },
  { category: 'finance', href: '/finance/bank', label: 'รายการเงินสด / ธนาคาร', owner: 'การเงิน' },
  { category: 'finance', href: '/finance/cash-position', label: 'ฐานะเงินสด', owner: 'การเงิน' },
  { category: 'accounting', href: '/finance-accounting/financial-dashboard', label: 'แดชบอร์ดการเงิน', owner: 'บัญชี' },
  { category: 'accounting', href: '/finance-accounting/cash-flow-analysis', label: 'วิเคราะห์กระแสเงินสด', owner: 'บัญชี' },
  { category: 'accounting', href: '/finance-accounting/pl-statement', label: 'งบกำไรขาดทุน (P&L)', owner: 'บัญชี' },
  { category: 'accounting', href: '/finance-accounting/balance-sheet', label: 'งบดุล', owner: 'บัญชี' },
  { category: 'accounting', href: '/finance-accounting/cash-flow-statement', label: 'งบกระแสเงินสด', owner: 'บัญชี' },
  { category: 'accounting', href: '/finance-accounting/tax-vat-wht', label: 'ภาษี VAT / WHT', owner: 'บัญชี' },
  { category: 'stock', href: '/stock/balance', label: 'คงเหลือสินค้า', owner: 'สินค้า' },
  { category: 'stock', href: '/stock/ledger', label: 'สมุดบัญชีสินค้า', owner: 'สินค้า' },
  { category: 'stock', href: '/stock/status-convert', label: 'ปรับสถานะสินค้า', owner: 'สินค้า' },
  { category: 'stock', href: '/stock/adjust', label: 'ปรับปรุงผลนับสต็อก', owner: 'สินค้า' },
  { category: 'tracking', href: '/tracking/customer', label: 'ติดตามลูกค้า', owner: 'ติดตาม' },
  { category: 'tracking', href: '/tracking/supplier', label: 'ติดตามผู้ขาย', owner: 'ติดตาม' },
  { category: 'tracking', href: '/tracking/product', label: 'ติดตามสินค้า', owner: 'ติดตาม' },
  { category: 'production', href: '/production/report', label: 'รายงานการผลิต', owner: 'การผลิต' },
  { category: 'daily', href: '/po-reports/outstanding', label: 'PO ซื้อ/ขายคงเหลือ', owner: 'รายงาน PO' },
  { category: 'daily', href: '/admin/transaction-ledger', label: 'สมุดรายวันธุรกรรม', owner: 'ระบบ' },
]

function numberFormat(value: number, digits = 0) {
  return value.toLocaleString('th-TH', { maximumFractionDigits: digits, minimumFractionDigits: digits })
}

function currency(value: number) {
  return numberFormat(value, 2)
}

function rowValue(row: AggregateRow, column: Column) {
  const value = row[column.key]
  if (column.key === 'name') return String(value ?? '-')
  const numeric = typeof value === 'number' ? value : 0
  if (column.type === 'currency') return currency(numeric)
  if (column.type === 'percent') return `${numberFormat(numeric, 2)}%`
  if (column.type === 'weight') return numberFormat(numeric, 2)
  return numberFormat(numeric)
}

async function downloadExcel(filename: string, columns: Column[], rows: AggregateRow[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  await writeXlsxFile([
    columns.map((column) => ({ fontWeight: 'bold' as const, value: column.label })),
    ...rows.map((row) => columns.map((column) => rowValue(row, column))),
  ], { sheet: 'รายงาน' }).toFile(filename)
}

export function ReportsIndexPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [aggregateSortKey, setAggregateSortKey] = useState<AggregateColumnKey | null>(null)
  const [aggregateSortDirection, setAggregateSortDirection] = useState<SortDirection>('asc')
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('all')
  const [catalogSortKey, setCatalogSortKey] = useState<CatalogColumnKey | null>(null)
  const [catalogSortDirection, setCatalogSortDirection] = useState<SortDirection>('asc')
  const [legacyTab, setLegacyTab] = useState<LegacyTab>('purchase-channel')
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [data, setData] = useState<AggregatePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadAggregate = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (fromDate) params.set('fromDate', fromDate)
      if (toDate) params.set('toDate', toDate)
      const response = await fetch(`/api/reports/aggregate${params.size ? `?${params.toString()}` : ''}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('โหลดรายงานสรุปไม่ได้')
      const payload = await response.json() as AggregatePayload
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setData(null)
      setError(caught instanceof Error ? caught.message : 'โหลดรายงานสรุปไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setLoading(false)
    }
  }, [fromDate, toDate])

  useEffect(() => {
    void loadAggregate()
  }, [loadAggregate])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return reports.filter((report) => {
      if (catalogTab !== 'all' && report.category !== catalogTab) return false
      if (!needle) return true
      return [report.label, report.owner, report.href].some((value) => value.toLowerCase().includes(needle))
    })
  }, [query, catalogTab])

  const rows = useMemo(() => {
    if (!data) return []
    if (legacyTab === 'purchase-channel') return data.purchaseChannel
    if (legacyTab === 'purchase-supplier') return data.purchaseSupplier
    if (legacyTab === 'purchase-product') return data.purchaseProduct
    if (legacyTab === 'sales-channel') return data.salesChannel
    return data.salesCustomer
  }, [data, legacyTab])

  const columns = columnsByTab[legacyTab]
  const aggregateColumns = useMemo<Array<ResizableColumnDefinition<AggregateColumnKey>>>(() => (
    columns.map((column) => ({
      key: column.key,
      defaultWidth: column.key === 'name' ? 240 : 140,
      minWidth: column.key === 'name' ? 180 : 115,
    }))
  ), [columns])
  const aggregateColumnResize = useResizableColumns(`reports.aggregate.${legacyTab}.v1`, aggregateColumns)
  const catalogColumnResize = useResizableColumns('reports.catalog.v1', catalogColumns)
  const sortedRows = useMemo(() => {
    if (!aggregateSortKey) return rows

    return [...rows].sort((left, right) => compareSortValues(
      getAggregateSortValue(left, aggregateSortKey),
      getAggregateSortValue(right, aggregateSortKey),
      aggregateSortDirection,
    ))
  }, [aggregateSortDirection, aggregateSortKey, rows])
  const sortedFiltered = useMemo(() => {
    if (!catalogSortKey) return filtered

    return [...filtered].sort((left, right) => compareSortValues(
      getCatalogSortValue(left, catalogSortKey),
      getCatalogSortValue(right, catalogSortKey),
      catalogSortDirection,
    ))
  }, [catalogSortDirection, catalogSortKey, filtered])
  const summary = useMemo(() => ({
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
    cost: rows.reduce((sum, row) => sum + (row.cost ?? 0), 0),
    count: rows.reduce((sum, row) => sum + row.count, 0),
    profit: rows.reduce((sum, row) => sum + (row.profit ?? 0), 0),
    weight: rows.reduce((sum, row) => sum + (row.weight ?? 0), 0),
  }), [rows])

  const catalogSummary = useMemo(() => ({
    accounting: filtered.filter((report) => report.category === 'accounting').length,
    count: filtered.length,
  }), [filtered])

  const exportActiveTab = async () => {
    const tabLabel = legacyTabs.find((tab) => tab.k === legacyTab)?.l ?? 'report'
    await downloadExcel(`reports-${legacyTab}-${fromDate || 'all'}-${toDate || 'all'}.xlsx`, columns, sortedRows)
    setError(sortedRows.length ? '' : `${tabLabel} ไม่มีข้อมูลให้ export`)
  }

  function changeAggregateSort(key: AggregateColumnKey) {
    if (aggregateSortKey === key) {
      setAggregateSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setAggregateSortKey(key)
    setAggregateSortDirection('asc')
  }

  function changeCatalogSort(key: CatalogColumnKey) {
    if (catalogSortKey === key) {
      setCatalogSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setCatalogSortKey(key)
    setCatalogSortDirection('asc')
  }

  return (
    <section className="space-y-4">
      <Tabs value={legacyTab} onValueChange={(value) => setLegacyTab(value as LegacyTab)}>
        <TabsList className="flex-wrap" variant="line">
          {legacyTabs.map((item) => (
            <TabsTrigger key={item.k} value={item.k} variant="line">
              {item.l}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <DatePickerInput className="w-[130px] border-slate-100" onChange={setFromDate} value={fromDate} />
          <DatePickerInput className="w-[130px] border-slate-100" onChange={setToDate} value={toDate} />
          <span className="text-xs font-medium text-slate-400">เว้นว่างเพื่อดูทุกช่วงเวลา</span>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-normal text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 outline-none focus:outline-none"
            disabled={loading}
            onClick={exportActiveTab}
            type="button"
          >
            ส่งออก Excel
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 text-sm font-semibold text-red-800 shadow-sm">
          {error}
        </div>
      ) : null}

      {/* Main Table Panel */}
      <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <div className="hidden items-center justify-between border-b border-slate-100 bg-slate-50/40 px-3 py-2 text-xs font-semibold text-slate-500 lg:flex">
          <span>{legacyTabs.find((tab) => tab.k === legacyTab)?.l ?? 'Report'} - {sortedRows.length.toLocaleString('th-TH')} รายการ</span>
          {aggregateColumnResize.hasCustomWidths ? (
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={aggregateColumnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        {/* Desktop View */}
        <div className="hidden overflow-x-auto bg-white lg:block">
          <table className="ns-table min-w-full divide-y divide-slate-200 text-sm text-slate-700" style={{ tableLayout: 'fixed', minWidth: aggregateColumnResize.tableMinWidth }}>
            <colgroup>
              {aggregateColumns.map((column) => (
                <col key={column.key} style={aggregateColumnResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                {columns.map((column) => (
                  <ResizableTableHead
                    activeSortKey={aggregateSortKey ?? undefined}
                    align={column.key === 'name' ? 'left' : 'right'}
                    direction={aggregateSortDirection}
                    key={column.key}
                    label={column.label}
                    resizeProps={aggregateColumnResize.getResizeHandleProps(column.key, column.label)}
                    sortKey={column.key}
                    onSort={changeAggregateSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="py-8 text-center text-slate-400 font-medium" colSpan={columns.length}>กำลังโหลดรายงาน...</td></tr>
              ) : sortedRows.length ? sortedRows.map((row) => (
                <tr className="hover:bg-slate-50/30 transition-colors" key={row.name}>
                  {columns.map((column) => (
                    <td className={`p-3 ${column.key === 'name' ? 'font-semibold text-slate-900' : `text-right font-mono font-bold ${column.tone === 'amount' ? 'text-blue-600' : column.tone === 'cost' ? 'text-red-600' : column.tone === 'profit' ? 'text-emerald-600' : 'text-slate-800'}`}`} key={column.key}>
                      {rowValue(row, column)}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr><td className="py-8 text-center text-slate-400 font-medium" colSpan={columns.length}>ไม่พบข้อมูลตามเงื่อนไข</td></tr>
              )}
            </tbody>
            {sortedRows.length > 0 && !loading ? (
              <tfoot className="border-t border-slate-100 bg-slate-50/50 font-bold text-slate-900">
                <tr>
                  {columns.map((column) => (
                    <td className={`p-3 font-bold ${column.key === 'name' ? 'text-left' : 'text-right font-mono'}`} key={column.key}>
                      {column.key === 'name' ? 'รวม' : column.key === 'count' ? numberFormat(summary.count) : column.key === 'weight' ? numberFormat(summary.weight, 2) : column.key === 'amount' ? currency(summary.amount) : column.key === 'cost' ? currency(summary.cost) : column.key === 'profit' ? currency(summary.profit) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {/* Mobile Dense Card List View */}
        <div className="block lg:hidden">
          {loading ? (
            <div className="py-8 text-center text-slate-400 font-medium text-sm">กำลังโหลดรายงาน...</div>
          ) : sortedRows.length ? (
            <div className="divide-y divide-slate-100">
              {sortedRows.map((row) => (
                <div className="p-4 hover:bg-slate-50/30 transition-colors" key={row.name}>
                  <div className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-1.5 mb-2">{row.name}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {columns.filter((c) => c.key !== 'name').map((column) => (
                      <div className="flex flex-col gap-0.5 text-xs" key={column.key}>
                        <span className="font-semibold text-slate-500">{column.label}</span>
                        <span className={`font-mono font-bold ${column.tone === 'amount' ? 'text-blue-600' : column.tone === 'cost' ? 'text-red-600' : column.tone === 'profit' ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {rowValue(row, column)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {/* Mobile Total Row */}
              <div className="bg-slate-50 p-4 font-bold text-slate-900 border-t border-slate-100">
                <div className="text-xs text-slate-500 font-bold mb-2">รวมทั้งหมด</div>
                <div className="grid grid-cols-2 gap-2">
                  {columns.filter((c) => c.key !== 'name').map((column) => (
                    <div className="flex flex-col gap-0.5 text-xs" key={column.key}>
                      <span className="font-semibold text-slate-500">{column.label} (รวม)</span>
                      <span className="font-mono font-bold text-slate-900">
                        {column.key === 'count' ? numberFormat(summary.count) : column.key === 'weight' ? numberFormat(summary.weight, 2) : column.key === 'amount' ? currency(summary.amount) : column.key === 'cost' ? currency(summary.cost) : column.key === 'profit' ? currency(summary.profit) : '-'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 font-medium text-sm">ไม่พบข้อมูลตามเงื่อนไข</div>
          )}
        </div>
      </div>

      {/* Reports Directory Section */}
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">รายงานอื่นในระบบ</h2>
          </div>
          <input
            className="ml-auto h-9 min-w-52 rounded-md border border-slate-300 px-3 text-sm outline-none transition-colors focus:border-slate-300 focus:outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อรายงาน / หมวด / เส้นทาง"
            type="search"
            value={query}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {catalogTabs.map((item) => (
            <button
              className={`inline-flex h-7 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors outline-none focus:outline-none ${
                catalogTab === item.k
                  ? 'border-slate-700 bg-slate-700 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              key={item.k}
              onClick={() => setCatalogTab(item.k)}
              type="button"
            >
              {item.l}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/20 p-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">รายงานที่พบ</div>
            <div className="text-xl font-bold text-slate-800 mt-0.5">{catalogSummary.count.toLocaleString('th-TH')}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/20 p-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">การเงิน / บัญชี</div>
            <div className="text-xl font-bold text-slate-800 mt-0.5">{catalogSummary.accounting.toLocaleString('th-TH')}</div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="hidden items-center justify-between border-b border-slate-100 bg-slate-50/40 px-3 py-2 text-xs font-semibold text-slate-500 lg:flex">
            <span>{sortedFiltered.length.toLocaleString('th-TH')} รายการ</span>
            {catalogColumnResize.hasCustomWidths ? (
              <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={catalogColumnResize.resetColumnWidths}>
                คืนค่าเดิมตาราง
              </button>
            ) : null}
          </div>
          {/* Desktop View */}
          <div className="hidden overflow-x-auto bg-white lg:block">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm text-slate-700" style={{ tableLayout: 'fixed', minWidth: catalogColumnResize.tableMinWidth }}>
              <colgroup>
                {catalogColumns.map((column) => (
                  <col key={column.key} style={catalogColumnResize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="bg-slate-100 [&>tr>th:nth-child(2)]:!text-right [&>tr>th:nth-child(2)>button]:!justify-end">
                <tr>
                  <ResizableTableHead activeSortKey={catalogSortKey ?? undefined} direction={catalogSortDirection} label="รายงาน" resizeProps={catalogColumnResize.getResizeHandleProps('report', 'รายงาน')} sortKey="report" onSort={changeCatalogSort} />
                  <ResizableTableHead activeSortKey={catalogSortKey ?? undefined} direction={catalogSortDirection} label="หมวด" resizeProps={catalogColumnResize.getResizeHandleProps('owner', 'หมวด')} sortKey="owner" onSort={changeCatalogSort} />                  <ResizableTableHead align="right" label="เปิด" resizeProps={catalogColumnResize.getResizeHandleProps('action', 'เปิด')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 [&>tr>td:nth-child(2)]:text-right">
                {sortedFiltered.map((report) => (
                  <tr className="hover:bg-slate-50/30 transition-colors" key={report.href}>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{report.label}</div>
                      <div className="font-mono text-xs text-slate-400 mt-0.5">{report.href}</div>
                    </td>
                    <td className="p-3 text-slate-600 font-medium">{report.owner}</td>                    <td className="p-3 text-right">
                      <Link className="rounded-md bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-normal text-white transition-colors outline-none focus:outline-none" href={report.href} prefetch={false}>
                        เปิดรายงาน
                      </Link>
                    </td>
                  </tr>
                ))}
                {!sortedFiltered.length ? (
                  <tr><td className="py-8 text-center text-slate-400 font-medium" colSpan={catalogColumns.length}>ไม่พบรายงานตามเงื่อนไข</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="block lg:hidden bg-white divide-y divide-slate-100">
            {sortedFiltered.map((report) => (
              <div className="p-4 hover:bg-slate-50/30 transition-colors" key={report.href}>
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{report.label}</div>
                    <div className="font-mono text-xs text-slate-400 mt-0.5">{report.href}</div>
                  </div>
                </div>                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-500">หมวด: {report.owner}</span>
                  <Link className="rounded-md bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-normal text-white transition-colors outline-none focus:outline-none" href={report.href} prefetch={false}>
                    เปิดรายงาน
                  </Link>
                </div>
              </div>
            ))}
            {!sortedFiltered.length ? (
              <div className="py-8 text-center text-slate-400 font-medium text-sm">ไม่พบรายงานตามเงื่อนไข</div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}

function compareSortValues(left: number | string, right: number | string, direction: SortDirection) {
  const result = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), 'th', { numeric: true })

  return direction === 'asc' ? result : -result
}

function getAggregateSortValue(row: AggregateRow, key: AggregateColumnKey): number | string {
  const value = row[key]
  return typeof value === 'number' ? value : String(value ?? '')
}

function getCatalogSortValue(report: ReportLink, key: CatalogColumnKey): string {
  if (key === 'action') return report.href
  if (key === 'owner') return report.owner
  if (key === 'report') return `${report.label} ${report.href}`
  return report.href
}
