'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

type CatalogTab = 'accounting' | 'all' | 'daily' | 'finance' | 'main' | 'production' | 'stock' | 'tracking'
type CatalogColumnKey = 'action' | 'owner' | 'report' | 'status' | 'summary'
type LegacyTab = 'purchase-channel' | 'purchase-product' | 'purchase-supplier' | 'sales-channel' | 'sales-customer'
type SortDirection = 'asc' | 'desc'

type ReportLink = {
  category: Exclude<CatalogTab, 'all'>
  href: string
  label: string
  owner: string
  status: string
  summary: string
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
  { key: 'status', defaultWidth: 150, minWidth: 125 },
  { key: 'summary', defaultWidth: 360, minWidth: 240 },
  { key: 'action', defaultWidth: 115, minWidth: 100 },
]

const catalogTabs: Array<{ k: CatalogTab; l: string }> = [
  { k: 'all', l: 'ทั้งหมด' },
  { k: 'main', l: 'Dashboard / Control' },
  { k: 'finance', l: 'การเงิน / หนี้' },
  { k: 'accounting', l: 'Finance Accounting' },
  { k: 'stock', l: 'Stock' },
  { k: 'tracking', l: 'Tracking' },
  { k: 'production', l: 'Production' },
  { k: 'daily', l: 'Daily / PO' },
]

const legacyTabs: Array<{ k: LegacyTab; l: string }> = [
  { k: 'purchase-channel', l: 'ซื้อตามช่องทาง' },
  { k: 'purchase-supplier', l: 'ซื้อตาม Supplier' },
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
    { key: 'name', label: 'Supplier' },
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
    { key: 'marginPct', label: 'Margin%', tone: 'profit', type: 'percent' },
  ],
  'sales-customer': [
    { key: 'name', label: 'Customer' },
    { key: 'count', label: 'บิล', type: 'number' },
    { key: 'amount', label: 'ยอดขาย', tone: 'amount', type: 'currency' },
    { key: 'profit', label: 'กำไร', tone: 'profit', type: 'currency' },
  ],
}

const reports: ReportLink[] = [
  { category: 'main', href: '/dashboard', label: 'Dashboard', owner: 'Main', status: 'read baseline', summary: 'ภาพรวมยอดซื้อ ขาย stock cash และ production' },
  { category: 'main', href: '/owner-daily', label: 'Owner Daily Control', owner: 'Main', status: 'read baseline', summary: 'เช็คเงินสด หนี้ due และงานที่ต้องดูตอนเช้า' },
  { category: 'main', href: '/daily-report', label: 'Daily Report', owner: 'Main', status: 'read baseline', summary: 'รายงานประจำวันจาก purchase/sales/cash sources' },
  { category: 'main', href: '/profit-cost-analysis', label: 'Profit & Cost Analysis', owner: 'Main', status: 'read baseline', summary: 'วิเคราะห์รายได้ ต้นทุน GP และ product drilldown' },
  { category: 'main', href: '/sales-commission', label: 'Sales Tracking Dashboard', owner: 'Main', status: 'read/design', summary: 'ยอดขาย commission และ supplier assignment read shell' },
  { category: 'main', href: '/cash-flow-calendar', label: 'Cash Flow Calendar', owner: 'Main', status: 'read/design', summary: 'ปฏิทินเงินเข้าออกและ running balance' },
  { category: 'main', href: '/business-calendar', label: 'Business Calendar', owner: 'Main', status: 'read/design', summary: 'ปฏิทินซื้อขายค่าใช้จ่ายและ GP รายวัน' },
  { category: 'main', href: '/cash-others-summary', label: 'Cash & Others Summary', owner: 'Main', status: 'read baseline', summary: 'Cash, AR, AP, stock และ trading pending' },
  { category: 'finance', href: '/finance/ar', label: 'ลูกหนี้ (AR)', owner: 'Finance', status: 'read baseline', summary: 'AR aging, customer exposure และ overdue' },
  { category: 'finance', href: '/finance/ap', label: 'เจ้าหนี้ (AP)', owner: 'Finance', status: 'read baseline', summary: 'AP aging, supplier exposure และ payment queue' },
  { category: 'finance', href: '/finance/bank', label: 'Cash / Bank Statement', owner: 'Finance', status: 'read baseline', summary: 'Bank statement, duplicate checks และ export' },
  { category: 'finance', href: '/finance/cash-position', label: 'Cash Position', owner: 'Finance', status: 'read baseline', summary: 'เงินสด/ธนาคารและ short-term need' },
  { category: 'accounting', href: '/finance-accounting/financial-dashboard', label: 'Financial Dashboard', owner: 'Accounting', status: 'read baseline', summary: 'Accounting management dashboard' },
  { category: 'accounting', href: '/finance-accounting/cash-flow-analysis', label: 'Cash Flow Analysis', owner: 'Accounting', status: 'read baseline', summary: 'Cash flow and working capital sources' },
  { category: 'accounting', href: '/finance-accounting/pl-statement', label: 'งบกำไรขาดทุน (P&L)', owner: 'Accounting', status: 'management/read', summary: 'Management P&L baseline, not statutory yet' },
  { category: 'accounting', href: '/finance-accounting/balance-sheet', label: 'งบดุล', owner: 'Accounting', status: 'management/read', summary: 'Management balance sheet baseline' },
  { category: 'accounting', href: '/finance-accounting/cash-flow-statement', label: 'งบกระแสเงินสด', owner: 'Accounting', status: 'management/read', summary: 'Management cash flow statement baseline' },
  { category: 'accounting', href: '/finance-accounting/tax-vat-wht', label: 'Tax / VAT / WHT', owner: 'Accounting', status: 'read/design', summary: 'VAT/WHT transaction-derived baseline' },
  { category: 'stock', href: '/stock/balance', label: 'Stock Balance', owner: 'Stock', status: 'read baseline', summary: 'Stock qty/value by product branch warehouse' },
  { category: 'stock', href: '/stock/ledger', label: 'Stock Ledger', owner: 'Stock', status: 'read baseline', summary: 'Stock movement ledger' },
  { category: 'stock', href: '/stock/status-convert', label: 'ปรับสถานะสินค้า', owner: 'Stock', status: 'read/design', summary: 'RM/FG status conversion shell' },
  { category: 'stock', href: '/stock/adjust', label: 'นับสต๊อก / Stock Count Adjust', owner: 'Stock', status: 'partial write', summary: 'Stock count adjustment baseline' },
  { category: 'tracking', href: '/tracking/customer', label: 'Customer Tracking', owner: 'Tracking', status: 'read baseline', summary: 'Customer sales/receipt tracking' },
  { category: 'tracking', href: '/tracking/supplier', label: 'Supplier Tracking', owner: 'Tracking', status: 'read/export', summary: 'Supplier purchase/payment/product tracking' },
  { category: 'tracking', href: '/tracking/product', label: 'Product Tracking', owner: 'Tracking', status: 'read/export', summary: 'Product movement and slow mover report' },
  { category: 'production', href: '/production/report', label: 'รายงานการผลิต / Yield', owner: 'Production', status: 'read baseline', summary: 'Production yield report' },
  { category: 'daily', href: '/po-reports/outstanding', label: 'PO ซื้อ/ขาย คงเหลือ', owner: 'PO Reports', status: 'read baseline', summary: 'Outstanding PO buy/sell report' },
  { category: 'daily', href: '/admin/transaction-ledger', label: 'Transaction Ledger', owner: 'Admin', status: 'read/export', summary: 'เงินเข้าออกทุกบัญชีพร้อม voucher refs' },
]

function statusClass(status: string) {
  if (status.includes('write')) return 'bg-amber-50 text-amber-800 border-amber-100/50'
  if (status.includes('design')) return 'bg-blue-50 text-blue-800 border-blue-100/50'
  if (status.includes('management')) return 'bg-purple-50 text-purple-800 border-purple-100/50'
  return 'bg-emerald-50 text-emerald-800 border-emerald-100/50'
}

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

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, columns: Column[], rows: AggregateRow[]) {
  const csv = [
    columns.map((column) => csvEscape(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => csvEscape(rowValue(row, column))).join(',')),
  ].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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
      return [report.label, report.owner, report.status, report.summary, report.href].some((value) => value.toLowerCase().includes(needle))
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
    readOnly: filtered.filter((report) => !report.status.includes('write')).length,
  }), [filtered])

  const exportActiveTab = () => {
    const tabLabel = legacyTabs.find((tab) => tab.k === legacyTab)?.l ?? 'report'
    downloadCsv(`reports-${legacyTab}-${fromDate || 'all'}-${toDate || 'all'}.csv`, columns, sortedRows)
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
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <DatePickerInput className="w-[130px] border-slate-100" onChange={setFromDate} value={fromDate} />
          <DatePickerInput className="w-[130px] border-slate-100" onChange={setToDate} value={toDate} />
          <span className="text-xs font-medium text-slate-400">เว้นว่างเพื่อดูทุกช่วงเวลา</span>
          <button
            className="ml-auto rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors disabled:cursor-not-allowed disabled:opacity-60 outline-none focus:outline-none"
            disabled={loading}
            onClick={exportActiveTab}
            type="button"
          >
            Export CSV รายงานนี้
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {legacyTabs.map((item) => (
            <button
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold border transition-all duration-150 outline-none focus:outline-none ${
                legacyTab === item.k
                  ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                  : 'bg-white border-slate-100 text-slate-800 hover:bg-slate-50/80'
              }`}
              key={item.k}
              onClick={() => setLegacyTab(item.k)}
              type="button"
            >
              {item.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon="📋" label="จำนวนรายการ" tone="blue" value={numberFormat(summary.count)} />
        <MetricCard icon="⚖️" label="น้ำหนักรวม (กก.)" tone="emerald" value={numberFormat(summary.weight, 2)} />
        <MetricCard icon="💰" label="มูลค่ารวม" tone="purple" value={currency(summary.amount)} />
        <MetricCard icon="📈" label="กำไร / ต้นทุน" tone="amber" value={currency(summary.profit || summary.cost)} />
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 text-sm font-semibold text-red-800 shadow-sm">
          {error}
        </div>
      ) : null}

      {/* Main Table Panel */}
      <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="hidden items-center justify-between border-b border-slate-100 bg-slate-50/40 px-3 py-2 text-xs font-semibold text-slate-500 lg:flex">
          <span>{legacyTabs.find((tab) => tab.k === legacyTab)?.l ?? 'Report'} - {sortedRows.length.toLocaleString('th-TH')} รายการ</span>
          {aggregateColumnResize.hasCustomWidths ? (
            <button className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={aggregateColumnResize.resetColumnWidths}>
              คืนค่าเดิมตาราง
            </button>
          ) : null}
        </div>
        {/* Desktop View */}
        <div className="hidden overflow-x-auto rounded-md border border-slate-100 bg-white shadow-sm lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700" style={{ tableLayout: 'fixed', minWidth: aggregateColumnResize.tableMinWidth }}>
            <colgroup>
              {aggregateColumns.map((column, index) => {
                const style = aggregateColumnResize.getColumnStyle(column.key)
                if (index === aggregateColumns.length - 1) {
                  return <col key={column.key} style={{ minWidth: column.minWidth }} />
                }
                return <col key={column.key} style={style} />
              })}
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
      <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">รายงานอื่นในระบบ</h2>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">ส่วนนี้คงไว้เป็นทางลัดไปยังรายงาน Next ที่เปิดใช้งานแล้ว</p>
          </div>
          <input
            className="ml-auto min-w-52 h-9 rounded-lg border border-slate-100 px-3 py-2 text-sm outline-none focus:outline-none focus:border-slate-300 transition-colors"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อรายงาน / module / path"
            type="search"
            value={query}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {catalogTabs.map((item) => (
            <button
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all duration-150 outline-none focus:outline-none ${
                catalogTab === item.k
                  ? 'bg-slate-800 border-slate-800 text-white shadow-sm'
                  : 'bg-white border-slate-100 text-slate-700 hover:bg-slate-50'
              }`}
              key={item.k}
              onClick={() => setCatalogTab(item.k)}
              type="button"
            >
              {item.l}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50/20 p-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">รายงานที่พบ</div>
            <div className="text-xl font-bold text-slate-800 mt-0.5">{catalogSummary.count.toLocaleString('th-TH')}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/20 p-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">Read / Design</div>
            <div className="text-xl font-bold text-slate-800 mt-0.5">{catalogSummary.readOnly.toLocaleString('th-TH')}</div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/20 p-3 shadow-sm">
            <div className="text-xs font-semibold text-slate-500">Accounting / Finance</div>
            <div className="text-xl font-bold text-slate-800 mt-0.5">{catalogSummary.accounting.toLocaleString('th-TH')}</div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-100">
          <div className="hidden items-center justify-between border-b border-slate-100 bg-slate-50/40 px-3 py-2 text-xs font-semibold text-slate-500 lg:flex">
            <span>{sortedFiltered.length.toLocaleString('th-TH')} รายการ</span>
            {catalogColumnResize.hasCustomWidths ? (
              <button className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50" type="button" onClick={catalogColumnResize.resetColumnWidths}>
                คืนค่าเดิมตาราง
              </button>
            ) : null}
          </div>
          {/* Desktop View */}
          <div className="hidden overflow-x-auto bg-white lg:block">
            <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700" style={{ tableLayout: 'fixed', minWidth: catalogColumnResize.tableMinWidth }}>
              <colgroup>
                {catalogColumns.map((column, index) => {
                  const style = catalogColumnResize.getColumnStyle(column.key)
                  if (index === catalogColumns.length - 1) {
                    return <col key={column.key} style={{ minWidth: column.minWidth }} />
                  }
                  return <col key={column.key} style={style} />
                })}
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  <ResizableTableHead activeSortKey={catalogSortKey ?? undefined} direction={catalogSortDirection} label="รายงาน" resizeProps={catalogColumnResize.getResizeHandleProps('report', 'รายงาน')} sortKey="report" onSort={changeCatalogSort} />
                  <ResizableTableHead activeSortKey={catalogSortKey ?? undefined} direction={catalogSortDirection} label="หมวด" resizeProps={catalogColumnResize.getResizeHandleProps('owner', 'หมวด')} sortKey="owner" onSort={changeCatalogSort} />
                  <ResizableTableHead activeSortKey={catalogSortKey ?? undefined} direction={catalogSortDirection} label="สถานะ" resizeProps={catalogColumnResize.getResizeHandleProps('status', 'สถานะ')} sortKey="status" onSort={changeCatalogSort} />
                  <ResizableTableHead activeSortKey={catalogSortKey ?? undefined} direction={catalogSortDirection} label="รายละเอียด" resizeProps={catalogColumnResize.getResizeHandleProps('summary', 'รายละเอียด')} sortKey="summary" onSort={changeCatalogSort} />
                  <ResizableTableHead align="right" label="เปิด" resizeProps={catalogColumnResize.getResizeHandleProps('action', 'เปิด')} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedFiltered.map((report) => (
                  <tr className="hover:bg-slate-50/30 transition-colors" key={report.href}>
                    <td className="p-3">
                      <div className="font-semibold text-slate-900">{report.label}</div>
                      <div className="font-mono text-xs text-slate-400 mt-0.5">{report.href}</div>
                    </td>
                    <td className="p-3 text-slate-600 font-medium">{report.owner}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold border ${statusClass(report.status)}`}>
                        {report.status}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 text-xs leading-relaxed">{report.summary}</td>
                    <td className="p-3 text-right">
                      <Link className="rounded-lg bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition-colors outline-none focus:outline-none" href={report.href} prefetch={false}>
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
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold border shrink-0 ${statusClass(report.status)}`}>
                    {report.status}
                  </span>
                </div>
                <div className="text-xs text-slate-600 mb-3 leading-relaxed">{report.summary}</div>
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-500">หมวด: {report.owner}</span>
                  <Link className="rounded-lg bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition-colors outline-none focus:outline-none" href={report.href} prefetch={false}>
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
  if (key === 'status') return report.status
  return report.summary
}

function MetricCard({ icon, label, tone, value }: { icon: string; label: string; tone: string; value: string }) {
  const toneMap: Record<string, { bg: string; text: string }> = {
    blue: { bg: 'bg-blue-50 text-blue-600', text: 'text-blue-600' },
    emerald: { bg: 'bg-emerald-50 text-emerald-600', text: 'text-emerald-600' },
    purple: { bg: 'bg-purple-50 text-purple-600', text: 'text-purple-600' },
    amber: { bg: 'bg-amber-50 text-amber-600', text: 'text-amber-600' },
    slate: { bg: 'bg-slate-50 text-slate-600', text: 'text-slate-900' }
  }
  const config = toneMap[tone] ?? toneMap.slate
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${config.bg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        <div className="mt-0.5 break-words text-xl font-bold tracking-tight text-slate-900">
          {value}
        </div>
      </div>
    </div>
  )
}
