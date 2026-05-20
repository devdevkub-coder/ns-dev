'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AnyRow = Record<string, number | string | boolean | null | undefined>
type Payload = {
  asOf: string
  branches: { code: string; id: string; name: string }[]
  charts: { arAging: Record<string, number>; assetComp: Array<{ color: string; name: string; val: number }>; debtComp: Array<{ color: string; name: string; val: number }> }
  filters: { asOf: string; branchId: string; monthStart: string }
  pendingIssueSummary: Record<string, number>
  rows: { cashAccounts: AnyRow[]; debt: Record<string, number>; receivable: Record<string, number>; stock: Record<string, number> }
  sourceState: { limitations: string[] }
  summary: Record<string, number>
  tradingPending: Record<string, number>
}

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function money(value: unknown) {
  return formatMoney(typeof value === 'number' ? value : Number(value ?? 0))
}

function text(value: unknown) {
  return String(value ?? '')
}

function num(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

export function AssetOverviewPageClient() {
  const [asOf, setAsOf] = useState(today())
  const [branchId, setBranchId] = useState('ALL')
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    const params = new URLSearchParams({ asOf })
    if (branchId !== 'ALL') params.set('branchId', branchId)
    dailyFetchJson<Payload>(`/api/finance-accounting/asset-overview?${params}`)
      .then(setData)
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลด Net Worth / Track Asset ไม่ได้'))
  }, [asOf, branchId])

  const summary = data?.summary ?? {}

  return (
    <section className="min-h-full rounded-xl bg-[#0b1220] p-[18px] text-[#e6ecff]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-lg font-bold text-[#e6ecff]">💎 Net Worth / Track Asset</h2>
          <p className="mt-1 text-xs text-[#8a96b8]">Management overview · assets, debt, liquidity, AR aging</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input className="rounded-lg border border-[#1f2c4a] bg-[#0e1729] px-3 py-2 text-sm font-bold text-[#e6ecff]" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          <select className="rounded-lg border border-[#1f2c4a] bg-[#0e1729] px-3 py-2 text-sm text-[#e6ecff]" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="ALL">ทุกสาขา</option>
            {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <button className="rounded-lg bg-[#1f2c4a] px-3 py-2 text-sm text-white opacity-60" disabled type="button">Export</button>
        </div>
      </div>

      {error ? <div className="mb-3 rounded-lg border border-[#ff6b6b] bg-[#3b1f1f] p-3 text-sm text-[#ffb4b4]">{error}</div> : null}

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <DarkKpi label="Total Asset" value={summary.totalAsset} />
        <DarkKpi label="Total Debt" value={summary.totalDebt} />
        <DarkKpi label="Net Worth" up value={summary.netWorth} />
        <DarkKpi danger={(summary.cashNeededToday ?? 0) > (summary.totalCash ?? 0)} label="เงินที่ต้องใช้วันนี้" value={summary.cashNeededToday} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border-l-4 border-[#ffcc4d] bg-[#1a2440] p-3 text-xs text-[#c6d0ee]">
        <span className="font-bold text-[#ffcc4d]">Read-only baseline</span>
        <span>{data?.sourceState.limitations[0] ?? 'Management view only; no posting/write action enabled.'}</span>
        <Link className="ml-auto rounded-lg bg-[#1f2c4a] px-3 py-1.5 text-white" href="/finance-accounting/financial-dashboard">Financial Dashboard</Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div>
          {num(data?.pendingIssueSummary.count) > 0 ? <PendingSaleBlock summary={data?.pendingIssueSummary ?? {}} /> : null}
          {num(data?.tradingPending.billCount) > 0 ? <TradingPendingBlock summary={data?.tradingPending ?? {}} /> : null}
          <div className="grid gap-4 md:grid-cols-2">
            <CashTable rows={data?.rows.cashAccounts ?? []} total={summary.totalCash ?? 0} />
            <ReceivableTable row={data?.rows.receivable ?? {}} />
            <StockTable row={data?.rows.stock ?? {}} />
            <DebtTable row={data?.rows.debt ?? {}} />
          </div>
        </div>
        <div>
          <DonutPanel items={data?.charts.assetComp ?? []} title="🥧 องค์ประกอบสินทรัพย์" total={summary.totalAsset ?? 0} tone="emerald" />
          <DonutPanel empty="✅ ไม่มีหนี้" items={data?.charts.debtComp ?? []} title="🥧 องค์ประกอบหนี้สิน" total={summary.totalDebt ?? 0} tone="red" />
          <ArAging aging={data?.charts.arAging ?? {}} total={data?.rows.receivable.totalAR ?? 0} />
        </div>
      </div>
    </section>
  )
}

function DarkKpi({ danger = false, label, up = false, value }: { danger?: boolean; label: string; up?: boolean; value: unknown }) {
  return <div className="rounded-[14px] border border-[#1f2c4a] bg-[#111a2e] p-4"><div className="text-xs text-[#8a96b8]">{label}</div><div className={`mt-1 break-words text-[22px] font-semibold ${danger ? 'text-[#ff6b6b]' : up ? 'text-[#2ecc71]' : 'text-[#e6ecff]'}`}>{money(value)}</div><div className={`mt-1 text-xs ${danger ? 'text-[#ff6b6b]' : up ? 'text-[#2ecc71]' : 'text-[#8a96b8]'}`}>{danger ? 'cash pressure' : up ? 'assets - liabilities' : 'management value'}</div></div>
}

/*
  Legacy CSS for this remote-only view defines a dark `ta-overview` shell.
  The repeated blocks below intentionally keep the same colors/density while
  using the existing Cash & Others data contract for the visible tables.
*/

function PendingSaleBlock({ summary }: { summary: Record<string, number> }) {
  return <div className="mb-4 rounded-[14px] border border-[#5d4321] border-l-4 border-l-[#f59e0b] bg-[#151f35] p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-[#ffcc4d]"><span className="text-2xl">📦</span> ต้นทุนรอเปิดบิล (Pending Sale) - เงินค้างใน Stock ที่เบิกออกไปแล้ว</h3><Link className="rounded-lg bg-[#9a6b12] px-3 py-1.5 text-xs font-bold text-white" href="/sales/stock-issue">ดูทั้งหมด</Link></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Mini label="⏰ จำนวนใบ" tone="amber" value={money(summary.count)} /><Mini label="⚖ น้ำหนัก" tone="blue" value={`${money(summary.qty)} กก.`} /><Mini label="💰 ต้นทุน (เงินที่ค้าง)" tone="red" value={money(summary.cost)} /><Mini label="📈 ยอดขายคาด" tone="emerald" value={money(summary.est)} /></div></div>
}

function TradingPendingBlock({ summary }: { summary: Record<string, number> }) {
  return <div className="mb-4 rounded-[14px] border border-[#4c2f78] border-l-4 border-l-[#a855f7] bg-[#151f35] p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-[#c4a3ff]"><span className="text-2xl">🔄</span> Trading Pending รับเงิน - Trading ซื้อจ่ายแล้ว แต่ Sales ยังไม่เปิด</h3><Link className="rounded-lg bg-[#6d3dc2] px-3 py-1.5 text-xs font-bold text-white" href="/trading/matching">Trading Matching</Link></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Mini label="📋 บิลซื้อ" tone="purple" value={`${money(summary.billCount)} ใบ`} /><Mini label="💸 จ่ายไปแล้ว" tone="blue" value={money(summary.paidAmount)} /><Mini label="✓ Match แล้ว" tone="emerald" value={money(summary.matchedAmount)} /><Mini label="⏳ Pending รับเงิน" tone="purpleStrong" value={money(summary.pendingAmount)} /></div></div>
}

function Mini({ label, tone, value }: { label: string; tone: string; value: string }) {
  const map: Record<string, string> = {
    amber: 'border-[#5d4321] text-[#ffcc4d]',
    blue: 'border-[#1f4e7a] text-[#7dd3fc]',
    emerald: 'border-[#1f5f4a] text-[#2ecc71]',
    purple: 'border-[#4c2f78] text-[#c4a3ff]',
    purpleStrong: 'border-[#7c3aed] text-[#c4a3ff]',
    red: 'border-[#7f2d2d] text-[#ff6b6b]',
  }
  return <div className={`rounded-lg border bg-[#0e1729] p-3 ${map[tone] ?? map.blue}`}><div className="text-xs text-[#8a96b8]">{label}</div><div className="break-words text-2xl font-bold">{value}</div></div>
}

function DonutPanel({ empty, items, title, total, tone }: { empty?: string; items: Array<{ color: string; name: string; val: number }>; title: string; total: number; tone: string }) {
  const gradient = conic(items, total)
  return <div className="mb-4 rounded-[14px] border border-[#1f2c4a] bg-[#111a2e] p-5"><h3 className={`mb-3 font-bold ${tone === 'red' ? 'text-[#ff6b6b]' : 'text-[#2ecc71]'}`}>{title}</h3><div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full p-9" style={{ background: gradient }}><div className="flex h-full w-full items-center justify-center rounded-full bg-[#0b1220] text-center text-xs font-bold text-[#e6ecff]">รวม<br />{money(total)}</div></div><div className="mt-3 space-y-1 text-xs text-[#c6d0ee]">{items.map((item) => <div key={item.name} className="flex justify-between gap-2"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded" style={{ background: item.color }} />{item.name}</span><span className={`font-mono font-bold ${tone === 'red' ? 'text-[#ff6b6b]' : 'text-[#2ecc71]'}`}>{money(item.val)}</span></div>)}{items.length === 0 ? <div className="py-3 text-center font-semibold text-[#2ecc71]">{empty ?? 'ไม่มีข้อมูล'}</div> : null}</div></div>
}

function conic(items: Array<{ color: string; val: number }>, total: number) {
  if (!items.length || total <= 0) return 'conic-gradient(#1f2c4a 0% 100%)'
  let start = 0
  return `conic-gradient(${items.map((item) => {
    const end = start + item.val / total * 100
    const value = `${item.color} ${start}% ${end}%`
    start = end
    return value
  }).join(', ')})`
}

function ArAging({ aging, total }: { aging: Record<string, number>; total: number }) {
  const max = Math.max(1, ...Object.values(aging))
  return <div className="rounded-[14px] border border-[#1f2c4a] bg-[#111a2e] p-5"><h3 className="mb-3 font-bold text-[#7dd3fc]">📥 AR Aging - อายุลูกหนี้</h3><div className="space-y-2">{Object.entries(aging).map(([key, amount]) => <div key={key}><div className="mb-1 flex justify-between text-xs text-[#c6d0ee]"><span className="font-medium">{agingLabel(key)}</span><span className="font-mono font-bold">{money(amount)}</span></div><div className="h-3 rounded-full bg-[#1f2c4a]"><div className="h-3 rounded-full bg-[#06b6d4]" style={{ width: `${Math.min(100, amount / max * 100)}%` }} /></div></div>)}</div><div className="mt-3 flex justify-between border-t border-[#1f2c4a] pt-2 text-sm font-bold"><span>รวม AR</span><span className="text-[#7dd3fc]">{money(total)}</span></div></div>
}

function agingLabel(key: string) {
  return key === 'current' ? '✅ ยังไม่ครบกำหนด' : key === '90+' ? '> 90 วัน ⚠️' : `${key} วัน`
}

function CashTable({ rows, total }: { rows: AnyRow[]; total: number }) {
  return <Panel heading="💵 CASH & OTHERS" tone="emerald" total={total}><Table headers={['บัญชี', 'ประเภท', 'สกุล', 'Balance', 'THB Equiv']} rows={rows.map((row) => [text(row.name), text(row.type), text(row.currency), money(row.balance), money(row.thbEquivalent)])} /></Panel>
}

function ReceivableTable({ row }: { row: Record<string, number> }) {
  return <Panel heading="📈 RECEIVABLE / ลูกหนี้" tone="blue" total={row.totalAR}><KeyRows rows={[['ลูกหนี้ในประเทศ', row.arDomestic], ['ลูกหนี้ต่างประเทศ', row.arOverseas], ['ลูกหนี้เกินกำหนด', row.arOverdue, 'amber'], ['+ Customer Advance ที่รับไว้', row.customerAdvanceTotal, 'emerald']]} /></Panel>
}

function StockTable({ row }: { row: Record<string, number> }) {
  return <Panel heading="📦 STOCK" tone="amber" total={row.val}><KeyRows rows={[['น้ำหนัก Stock รวม', `${money(row.qty)} กก.`], ['มูลค่า Stock รวม (WAC)', row.val], ['Stock ที่จ่ายเงินแล้ว (ประมาณ)', row.paidVal, 'emerald'], ['Stock ที่ยังค้างจ่าย', row.unpaidVal, 'amber']]} /></Panel>
}

function DebtTable({ row }: { row: Record<string, number> }) {
  return <Panel heading="📉 DEBT / ภาระหนี้" tone="red" total={row.totalAP + row.customerAdvanceTotal}><KeyRows rows={[['เจ้าหนี้การค้า (AP)', row.totalAP], ['เจ้าหนี้เกินกำหนด', row.apOverdue, 'red'], ['Customer Advance (Liability)', row.customerAdvanceTotal], ['ค่าใช้จ่ายวันนี้', row.expenseToday, 'amber'], ['Supplier Advance ที่จ่ายไว้ (Asset)', row.supplierAdvanceTotal, 'emerald']]} /></Panel>
}

function Panel({ children, heading, tone, total }: { children: ReactNode; heading: string; tone: string; total: unknown }) {
  const map: Record<string, string> = {
    amber: 'text-[#ffcc4d]',
    blue: 'text-[#7dd3fc]',
    emerald: 'text-[#2ecc71]',
    red: 'text-[#ff6b6b]',
  }
  return <div className="overflow-hidden rounded-[14px] border border-[#1f2c4a] bg-[#111a2e]"><div className={`flex justify-between border-b border-[#1f2c4a] bg-[#151f35] px-4 py-3 font-semibold ${map[tone]}`}><span>{heading}</span><span>{money(total as number)}</span></div>{children}</div>
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-xs text-[#c6d0ee]"><thead className="bg-[#0e1729] text-[#8a96b8]"><tr>{headers.map((header) => <th key={header} className="p-2 text-left last:text-right">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t border-[#1f2c4a] hover:bg-[#151f35]">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={`p-2 ${cellIndex >= row.length - 2 ? 'text-right font-mono' : ''}`}>{cell}</td>)}</tr>)}</tbody></table></div>
}

function KeyRows({ rows }: { rows: Array<[string, number | string | undefined, string?]> }) {
  const bg: Record<string, string> = { amber: 'bg-[#2d2618] text-[#ffcc4d]', emerald: 'bg-[#10261f] text-[#2ecc71]', red: 'bg-[#321c22] text-[#ff6b6b]' }
  return <table className="w-full text-xs text-[#c6d0ee]"><tbody>{rows.map(([label, value, tone]) => <tr key={label} className={`border-t border-[#1f2c4a] ${tone ? bg[tone] : ''}`}><td className="p-2">{label}</td><td className="p-2 text-right font-mono font-medium">{typeof value === 'string' ? value : money(value)}</td></tr>)}</tbody></table>
}
