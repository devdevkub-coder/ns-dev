'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

type ReportTab = 'accounting' | 'all' | 'daily' | 'finance' | 'main' | 'production' | 'stock' | 'tracking'

type ReportLink = {
  category: Exclude<ReportTab, 'all'>
  href: string
  label: string
  owner: string
  status: string
  summary: string
}

const tabs: Array<{ k: ReportTab; l: string }> = [
  { k: 'all', l: 'ทั้งหมด' },
  { k: 'main', l: 'Dashboard / Control' },
  { k: 'finance', l: 'การเงิน / หนี้' },
  { k: 'accounting', l: 'Finance Accounting' },
  { k: 'stock', l: 'Stock' },
  { k: 'tracking', l: 'Tracking' },
  { k: 'production', l: 'Production' },
  { k: 'daily', l: 'Daily / PO' },
]

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
  { category: 'finance', href: '/finance/foreign/fx-rate', label: 'FX Rate', owner: 'Foreign Finance', status: 'read/write baseline', summary: 'FX rate management baseline' },
  { category: 'finance', href: '/finance/foreign/fx-gain-loss-report', label: 'FX Gain/Loss', owner: 'Foreign Finance', status: 'read baseline', summary: 'Realized FX gain/loss report' },
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
  { category: 'production', href: '/production/dashboard', label: 'Production Dashboard', owner: 'Production', status: 'read baseline', summary: 'Production KPIs and open order status' },
  { category: 'production', href: '/production/report', label: 'รายงานการผลิต / Yield', owner: 'Production', status: 'read baseline', summary: 'Production yield report' },
  { category: 'production', href: '/production/wip-report', label: 'WIP คงเหลือ', owner: 'Production', status: 'read baseline', summary: 'WIP balance report' },
  { category: 'daily', href: '/po-reports/outstanding', label: 'PO ซื้อ/ขาย คงเหลือ', owner: 'PO Reports', status: 'read baseline', summary: 'Outstanding PO buy/sell report' },
  { category: 'daily', href: '/admin/transaction-ledger', label: 'Transaction Ledger', owner: 'Admin', status: 'read/export', summary: 'เงินเข้าออกทุกบัญชีพร้อม voucher refs' },
]

function statusClass(status: string) {
  if (status.includes('write')) return 'bg-amber-100 text-amber-700'
  if (status.includes('design')) return 'bg-blue-100 text-blue-700'
  if (status.includes('management')) return 'bg-purple-100 text-purple-700'
  return 'bg-emerald-100 text-emerald-700'
}

export function ReportsIndexPageClient() {
  const [tab, setTab] = useState<ReportTab>('all')
  const [query, setQuery] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return reports.filter((report) => {
      if (tab !== 'all' && report.category !== tab) return false
      if (!needle) return true
      return [report.label, report.owner, report.status, report.summary, report.href].some((value) => value.toLowerCase().includes(needle))
    })
  }, [query, tab])

  const summary = useMemo(() => ({
    accounting: filtered.filter((report) => report.category === 'accounting').length,
    count: filtered.length,
    readOnly: filtered.filter((report) => !report.status.includes('write')).length,
  }), [filtered])

  return (
    <section className="space-y-4">
      <div className="rounded-xl bg-gradient-to-r from-slate-700 to-blue-700 p-4 text-white shadow">
        <h1 className="text-xl font-bold">📑 รายงานทั้งหมด</h1>
        <p className="mt-1 text-sm opacity-90">ศูนย์รวมรายงานที่เปิดใช้งานแล้วใน Next — เลือกหมวด ค้นหา แล้วเปิดหน้ารายงานต้นทาง</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-4 shadow">
        <input className="rounded-lg border px-3 py-2 text-sm" onChange={(event) => setFromDate(event.target.value)} type="date" value={fromDate} />
        <input className="rounded-lg border px-3 py-2 text-sm" onChange={(event) => setToDate(event.target.value)} type="date" value={toDate} />
        <input className="min-w-52 flex-1 rounded-lg border px-3 py-2 text-sm" onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อรายงาน / module / path" value={query} />
        <span className="text-xs text-slate-500">ช่วงวันที่ส่งต่อให้รายงานปลายทางใน batch ถัดไป</span>
        <button className="ml-auto rounded-lg bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-700 opacity-70" disabled type="button">Export CSV รายงานนี้</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            className={`rounded-lg px-3 py-1.5 text-sm ${tab === item.k ? 'bg-blue-600 text-white' : 'border bg-white text-slate-700'}`}
            key={item.k}
            onClick={() => setTab(item.k)}
            type="button"
          >
            {item.l}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow"><div className="text-xs text-slate-500">รายงานที่พบ</div><div className="text-2xl font-bold text-blue-700">{summary.count.toLocaleString('th-TH')}</div></div>
        <div className="rounded-xl bg-white p-4 shadow"><div className="text-xs text-slate-500">Read / Design</div><div className="text-2xl font-bold text-emerald-700">{summary.readOnly.toLocaleString('th-TH')}</div></div>
        <div className="rounded-xl bg-white p-4 shadow"><div className="text-xs text-slate-500">Accounting / Finance</div><div className="text-2xl font-bold text-purple-700">{summary.accounting.toLocaleString('th-TH')}</div></div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
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
                <td className="p-2"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(report.status)}`}>{report.status}</span></td>
                <td className="p-2 text-slate-600">{report.summary}</td>
                <td className="p-2 text-right"><Link className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700" href={report.href} prefetch={false}>เปิดรายงาน</Link></td>
              </tr>
            ))}
            {!filtered.length ? (
              <tr><td className="py-8 text-center text-slate-400" colSpan={5}>ไม่พบรายงานตามเงื่อนไข</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
