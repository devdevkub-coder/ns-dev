'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'

type CatalogTab = 'accounting' | 'all' | 'daily' | 'finance' | 'main' | 'production' | 'stock' | 'tracking'
type LegacyTab = 'purchase-channel' | 'purchase-product' | 'purchase-supplier' | 'sales-channel' | 'sales-customer'

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
  { category: 'main', href: '/pending-sales', label: 'รายการรอขาย', owner: 'Main', status: 'read/design', summary: 'Pending sale, pool vs stock และ LME reference' },
  { category: 'main', href: '/sales-commission', label: 'Sales Tracking Dashboard', owner: 'Main', status: 'read/design', summary: 'ยอดขาย commission และ supplier assignment read shell' },
  { category: 'main', href: '/cash-flow-calendar', label: 'Cash Flow Calendar', owner: 'Main', status: 'read/design', summary: 'ปฏิทินเงินเข้าออกและ running balance' },
  { category: 'main', href: '/business-calendar', label: 'Business Calendar', owner: 'Main', status: 'read/design', summary: 'ปฏิทินซื้อขายค่าใช้จ่ายและ GP รายวัน' },
  { category: 'main', href: '/cash-others-summary', label: 'Cash & Others Summary', owner: 'Main', status: 'read baseline', summary: 'Cash, AR, AP, stock, pending sale และ trading pending' },
  { category: 'main', href: '/anomaly-detector', label: 'ตรวจจับความผิดปกติ', owner: 'Main', status: 'read baseline', summary: 'Read-only anomaly scan พร้อม link ไปหน้าที่เกี่ยวข้อง' },
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
  // { category: 'production', href: '/production/dashboard', label: 'แดชบอร์ดการผลิต', owner: 'Production', status: 'read baseline', summary: 'Production KPIs and open order status' },
  { category: 'production', href: '/production/report', label: 'รายงานการผลิต / Yield', owner: 'Production', status: 'read baseline', summary: 'Production yield report' },
  { category: 'daily', href: '/po-reports/outstanding', label: 'PO ซื้อ/ขาย คงเหลือ', owner: 'PO Reports', status: 'read baseline', summary: 'Outstanding PO buy/sell report' },
  { category: 'daily', href: '/admin/transaction-ledger', label: 'Transaction Ledger', owner: 'Admin', status: 'read/export', summary: 'เงินเข้าออกทุกบัญชีพร้อม voucher refs' },
]

function statusClass(status: string) {
  if (status.includes('write')) return 'bg-amber-100 text-amber-700'
  if (status.includes('design')) return 'bg-blue-100 text-blue-700'
  if (status.includes('management')) return 'bg-purple-100 text-purple-700'
  return 'bg-emerald-100 text-emerald-700'
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
  const [catalogTab, setCatalogTab] = useState<CatalogTab>('all')
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
    downloadCsv(`reports-${legacyTab}-${fromDate || 'all'}-${toDate || 'all'}.csv`, columns, rows)
    setError(rows.length ? '' : `${tabLabel} ไม่มีข้อมูลให้ export`)
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <DatePickerInput className="w-[130px]" onChange={setFromDate} value={fromDate} />
          <DatePickerInput className="w-[130px]" onChange={setToDate} value={toDate} />
          <span className="text-xs text-slate-500">เว้นว่างเพื่อดูทุกช่วงเวลา</span>
          <button className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={loading} onClick={exportActiveTab} type="button">
            Export CSV รายงานนี้
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {legacyTabs.map((item) => (
            <button
              className={`rounded-md px-3 py-1.5 text-sm font-semibold ${legacyTab === item.k ? 'bg-blue-600 text-white shadow' : 'border bg-white text-slate-700 hover:bg-slate-50'}`}
              key={item.k}
              onClick={() => setLegacyTab(item.k)}
              type="button"
            >
              {item.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md bg-blue-50 p-4 shadow">
          <div className="text-xs font-semibold text-blue-700">จำนวนรายการ</div>
          <div className="text-2xl font-bold text-blue-800">{numberFormat(summary.count)}</div>
        </div>
        <div className="rounded-md bg-emerald-50 p-4 shadow">
          <div className="text-xs font-semibold text-emerald-700">น้ำหนักรวม</div>
          <div className="text-2xl font-bold text-emerald-800">{numberFormat(summary.weight, 2)}</div>
        </div>
        <div className="rounded-md bg-purple-50 p-4 shadow">
          <div className="text-xs font-semibold text-purple-700">มูลค่ารวม</div>
          <div className="text-2xl font-bold text-purple-800">{currency(summary.amount)}</div>
        </div>
        <div className="rounded-md bg-amber-50 p-4 shadow">
          <div className="text-xs font-semibold text-amber-700">กำไร / ต้นทุน</div>
          <div className="text-2xl font-bold text-amber-800">{currency(summary.profit || summary.cost)}</div>
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div> : null}

      <div className="overflow-x-auto rounded-md bg-white shadow">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-100">
            <tr>
              {columns.map((column) => (
                <th className={`p-2 ${column.key === 'name' ? 'text-left' : 'text-right'}`} key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="py-8 text-center text-slate-400" colSpan={columns.length}>กำลังโหลดรายงาน...</td></tr>
            ) : rows.length ? rows.map((row) => (
              <tr className="border-t hover:bg-slate-50" key={row.name}>
                {columns.map((column) => (
                  <td className={`p-2 ${column.key === 'name' ? 'font-semibold text-slate-900' : `text-right font-semibold ${column.tone === 'amount' ? 'text-blue-700' : column.tone === 'cost' ? 'text-red-700' : column.tone === 'profit' ? 'text-emerald-700' : 'text-slate-700'}`}`} key={column.key}>
                    {rowValue(row, column)}
                  </td>
                ))}
              </tr>
            )) : (
              <tr><td className="py-8 text-center text-slate-400" colSpan={columns.length}>ไม่พบข้อมูลตามเงื่อนไข</td></tr>
            )}
          </tbody>
          {rows.length ? (
            <tfoot className="border-t-2 bg-slate-50 font-bold text-slate-900">
              <tr>
                {columns.map((column) => (
                  <td className={`p-2 ${column.key === 'name' ? 'text-left' : 'text-right'}`} key={column.key}>
                    {column.key === 'name' ? 'รวม' : column.key === 'count' ? numberFormat(summary.count) : column.key === 'weight' ? numberFormat(summary.weight, 2) : column.key === 'amount' ? currency(summary.amount) : column.key === 'cost' ? currency(summary.cost) : column.key === 'profit' ? currency(summary.profit) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">รายงานอื่นในระบบ</h2>
            <p className="text-xs text-slate-500">ส่วนนี้คงไว้เป็นทางลัดไปยังรายงาน Next ที่เปิดใช้งานแล้ว</p>
          </div>
          <input className="ml-auto min-w-52 rounded-md border px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อรายงาน / module / path" type="search" value={query} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {catalogTabs.map((item) => (
            <button
              className={`rounded-md px-3 py-1.5 text-sm ${catalogTab === item.k ? 'bg-slate-700 text-white' : 'border bg-white text-slate-700'}`}
              key={item.k}
              onClick={() => setCatalogTab(item.k)}
              type="button"
            >
              {item.l}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-md bg-white p-3 ring-1 ring-slate-200"><div className="text-xs text-slate-500">รายงานที่พบ</div><div className="text-xl font-bold text-blue-700">{catalogSummary.count.toLocaleString('th-TH')}</div></div>
          <div className="rounded-md bg-white p-3 ring-1 ring-slate-200"><div className="text-xs text-slate-500">Read / Design</div><div className="text-xl font-bold text-emerald-700">{catalogSummary.readOnly.toLocaleString('th-TH')}</div></div>
          <div className="rounded-md bg-white p-3 ring-1 ring-slate-200"><div className="text-xs text-slate-500">Accounting / Finance</div><div className="text-xl font-bold text-purple-700">{catalogSummary.accounting.toLocaleString('th-TH')}</div></div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-md border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-2 text-left">รายงาน</th>
                <th className="p-2 text-left">หมวด</th>
                <th className="p-2 text-left">สถานะ</th>
                <th className="p-2 text-left">รายละเอียด</th>
                <th className="p-2 text-right">เปิด</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((report) => (
                <tr className="border-t" key={report.href}>
                  <td className="p-2">
                    <div className="font-semibold text-slate-900">{report.label}</div>
                    <div className="font-mono text-xs text-slate-500">{report.href}</div>
                  </td>
                  <td className="p-2 text-slate-700">{report.owner}</td>
                  <td className="p-2"><span className={`rounded-md-full px-2 py-1 text-xs font-semibold ${statusClass(report.status)}`}>{report.status}</span></td>
                  <td className="p-2 text-slate-600">{report.summary}</td>
                  <td className="p-2 text-right"><Link className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700" href={report.href} prefetch={false}>เปิดรายงาน</Link></td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr><td className="py-8 text-center text-slate-400" colSpan={5}>ไม่พบรายงานตามเงื่อนไข</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
