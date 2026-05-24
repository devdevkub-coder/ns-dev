'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AnyRow = Record<string, number | string | boolean | null | undefined>
type CashOthersPayload = {
  asOf: string
  charts: { arAging: Record<string, number>; assetComp: Array<{ color: string; name: string; val: number }>; debtComp: Array<{ color: string; name: string; val: number }> }
  pendingIssueSummary: Record<string, number>
  rows: { cashAccounts: AnyRow[]; debt: Record<string, number>; receivable: Record<string, number>; stock: Record<string, number> }
  sourceState: { limitations: string[] }
  summary: Record<string, number>
  tradingPending: Record<string, number>
}
type Anomaly = { action: string; category: string; detail: string; fixHref?: string; icon: string; id: string; severity: 'critical' | 'info' | 'warn'; title: string }
type AnomalyStats = { byCategory: Array<{ cat: string; count: number }>; critical: number; info: number; ruleGroups: number; total: number; warn: number }
type AnomalyPayload = { anomalies: Anomaly[]; asOf: string; sourceState: { limitations: string[] }; stats: AnomalyStats }

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

export function CashOthersSummaryPageClient() {
  const [asOf, setAsOf] = useState(today())
  const [data, setData] = useState<CashOthersPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setError(null)
    dailyFetchJson<CashOthersPayload>(`/api/cash-others-summary?asOf=${asOf}`).then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้'))
  }, [asOf])
  const summary = data?.summary ?? {}

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow"><label className="text-xs font-bold text-slate-500">As of</label><input className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} /><span className="flex-1" /><button className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-500" disabled type="button">Export disabled</button></div>
      <div className="grid grid-cols-1 gap-4 rounded-md bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-center text-white shadow-lg md:grid-cols-4">
        <Grand label="Total Asset" value={summary.totalAsset} />
        <Grand label="Total Debt" value={summary.totalDebt} />
        <Grand label="Net Worth" value={summary.netWorth} />
        <Grand danger={(summary.cashNeededToday ?? 0) > (summary.totalCash ?? 0)} label="เงินที่ต้องใช้วันนี้" value={summary.cashNeededToday} />
      </div>
      {num(data?.pendingIssueSummary.count) > 0 ? <PendingSaleBlock summary={data?.pendingIssueSummary ?? {}} /> : null}
      <TradingPendingBlock summary={data?.tradingPending ?? {}} />
      <div className="grid gap-4 lg:grid-cols-3">
        <DonutPanel items={data?.charts.assetComp ?? []} title="🥧 องค์ประกอบสินทรัพย์" total={summary.totalAsset ?? 0} tone="emerald" />
        <DonutPanel empty="✅ ไม่มีหนี้" items={data?.charts.debtComp ?? []} title="🥧 องค์ประกอบหนี้สิน" total={summary.totalDebt ?? 0} tone="red" />
        <ArAging aging={data?.charts.arAging ?? {}} total={data?.rows.receivable.totalAR ?? 0} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <CashTable rows={data?.rows.cashAccounts ?? []} total={summary.totalCash ?? 0} />
        <ReceivableTable row={data?.rows.receivable ?? {}} />
        <StockTable row={data?.rows.stock ?? {}} />
        <DebtTable row={data?.rows.debt ?? {}} />
      </div>
      <Notice text={data?.sourceState.limitations[0]} />{error ? <ErrorBox text={error} /> : null}
    </section>
  )
}

export function AnomalyDetectorPageClient() {
  const [asOf, setAsOf] = useState(today())
  const [data, setData] = useState<AnomalyPayload | null>(null)
  const [filter, setFilter] = useState<'critical' | 'info' | 'warn' | ''>('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setError(null)
    dailyFetchJson<AnomalyPayload>(`/api/anomaly-detector?asOf=${asOf}`).then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้'))
  }, [asOf])
  const filtered = (data?.anomalies ?? []).filter((item) => !filter || item.severity === filter)
  const grouped = useMemo(() => {
    const map = new Map<string, { category: string; icon: string; items: Anomaly[]; key: string; label: string; severity: Anomaly['severity'] }>()
    filtered.forEach((item) => {
      const key = ruleKey(item.id)
      const group = map.get(key) ?? { category: item.category, icon: item.icon, items: [], key, label: ruleLabel(key), severity: item.severity }
      group.items.push(item)
      map.set(key, group)
    })
    const order = { critical: 0, warn: 1, info: 2 }
    return Array.from(map.values()).sort((a, b) => order[a.severity] - order[b.severity] || b.items.length - a.items.length)
  }, [filtered])
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-anomaly-action]') : null
      if (!target) return
      const action = target.dataset.anomalyAction
      if (action === 'expand-all') {
        setExpanded(Object.fromEntries(grouped.map((group) => [group.key, true])))
      } else if (action === 'collapse-all') {
        setExpanded({})
      } else if (action === 'toggle' && target.dataset.groupKey) {
        const key = target.dataset.groupKey
        setExpanded((current) => ({ ...current, [key]: current[key] !== true }))
      } else if (action === 'filter') {
        const severity = (target.dataset.severity ?? '') as 'critical' | 'info' | 'warn' | ''
        setFilter((current) => current === severity ? '' : severity)
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [grouped])
  useEffect(() => {
    if (grouped.length && Object.keys(expanded).length === 0) {
      setExpanded(Object.fromEntries(grouped.map((group) => [group.key, true])))
    }
  }, [expanded, grouped])

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SeverityCard active={filter === ''} label="ทั้งหมด" severity="" tone="slate" value={data?.stats.total ?? 0} />
        <SeverityCard active={filter === 'critical'} label="🚨 วิกฤต" severity="critical" tone={(data?.stats.critical ?? 0) > 0 ? 'red' : 'emerald'} value={data?.stats.critical ?? 0} />
        <SeverityCard active={filter === 'warn'} label="⚠ เตือน" severity="warn" tone={(data?.stats.warn ?? 0) > 0 ? 'amber' : 'emerald'} value={data?.stats.warn ?? 0} />
        <SeverityCard active={filter === 'info'} label="ℹ ข้อมูล" severity="info" tone="blue" value={data?.stats.info ?? 0} />
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow">
        <label className="text-xs font-bold text-slate-500">As of</label>
        <input className="rounded-md border border-slate-300 px-3 py-2 text-sm font-bold" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
        <span className="text-xs text-slate-400">Read-only scan · {data?.stats.ruleGroups ?? 0} rule groups active</span>
      </div>
      {(data?.anomalies.length ?? 0) > 0 ? <CategoryTags categories={data?.stats.byCategory ?? []} /> : null}
      {(data?.anomalies.length ?? 0) === 0 ? <div className="rounded-md bg-gradient-to-br from-emerald-100 to-teal-100 p-12 text-center shadow-lg"><div className="mb-4 text-7xl">✅</div><h2 className="mb-2 text-2xl font-bold text-emerald-700">ทุกอย่างปกติ!</h2><p className="text-slate-600">ระบบไม่พบความผิดปกติใดๆ</p></div> : null}
      {grouped.length ? <div className="space-y-2"><div className="mb-1 flex justify-end gap-2"><button className="text-xs text-blue-600 hover:underline" data-anomaly-action="expand-all" type="button">▽ ขยายทั้งหมด</button><button className="text-xs text-slate-600 hover:underline" data-anomaly-action="collapse-all" type="button">▲ ย่อทั้งหมด</button></div>{grouped.map((group) => <AnomalyGroup key={group.key} expanded={expanded[group.key] === true} group={group} />)}</div> : null}
      {filter && grouped.length === 0 ? <div className="py-12 text-center text-slate-400">ไม่มีรายการในหมวดนี้</div> : null}
      <AnomalyChecklist />
      <Notice text={data?.sourceState.limitations[0]} />{error ? <ErrorBox text={error} /> : null}
    </section>
  )
}

function Grand({ danger = false, label, value }: { danger?: boolean; label: string; value: unknown }) {
  return <div><div className="text-sm opacity-80">{label}</div><div className={`break-words text-3xl font-bold ${danger ? 'text-red-200' : ''}`}>{money(value)}</div></div>
}

function PendingSaleBlock({ summary }: { summary: Record<string, number> }) {
  return <div className="rounded-md border-l-4 border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 p-4 shadow"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-amber-700"><span className="text-2xl">📦</span> ต้นทุนรอเปิดบิล (Pending Sale) — เงินค้างใน Stock ที่เบิกออกไปแล้ว</h3><Link className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-bold text-white" href="/sales/stock-issue">→ ดูทั้งหมด</Link></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Mini label="⏰ จำนวนใบ" tone="amber" value={money(summary.count)} /><Mini label="⚖ น้ำหนัก" tone="blue" value={`${money(summary.qty)} กก.`} /><Mini label="💰 ต้นทุน (เงินที่ค้าง)" tone="red" value={money(summary.cost)} /><Mini label="📈 ยอดขายคาด" tone="emerald" value={money(summary.est)} /></div></div>
}

function TradingPendingBlock({ summary }: { summary: Record<string, number> }) {
  return <div className="rounded-md border-l-4 border-purple-500 bg-gradient-to-r from-purple-50 to-pink-50 p-4 shadow"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-purple-700"><span className="text-2xl">🔄</span> Trading Pending รับเงิน — Trading ซื้อจ่ายแล้ว แต่ Sales ยังไม่เปิด</h3><Link className="rounded-md bg-purple-600 px-3 py-1.5 text-xs font-bold text-white" href="/trading/matching">→ Trading Matching</Link></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Mini label="📋 บิลซื้อ" tone="purple" value={`${money(summary.billCount)} ใบ`} /><Mini label="💸 จ่ายไปแล้ว" tone="blue" value={money(summary.paidAmount)} /><Mini label="✓ Match แล้ว" tone="emerald" value={money(summary.matchedAmount)} /><Mini label="⏳ Pending รับเงิน" tone="purpleStrong" value={money(summary.pendingAmount)} /></div></div>
}

function Mini({ label, tone, value }: { label: string; tone: string; value: string }) {
  const map: Record<string, string> = { amber: 'border-amber-200 text-amber-700', blue: 'border-blue-200 text-blue-700', emerald: 'border-emerald-200 text-emerald-700', purple: 'border-purple-200 text-purple-700', purpleStrong: 'border-purple-400 text-purple-700 border-2', red: 'border-red-300 text-red-700 border-2' }
  return <div className={`rounded-md border bg-white p-3 ${map[tone] ?? map.blue}`}><div className="text-xs">{label}</div><div className="break-words text-2xl font-bold">{value}</div></div>
}

function DonutPanel({ empty, items, title, total, tone }: { empty?: string; items: Array<{ color: string; name: string; val: number }>; title: string; total: number; tone: string }) {
  const gradient = conic(items, total)
  return <div className="rounded-md bg-white p-5 shadow-lg"><h3 className={`mb-3 font-bold ${tone === 'red' ? 'text-red-700' : 'text-emerald-700'}`}>{title}</h3><div className="mx-auto flex h-40 w-40 items-center justify-center rounded-md-full p-9" style={{ background: gradient }}><div className="flex h-full w-full items-center justify-center rounded-md-full bg-white text-center text-xs font-bold text-slate-700">รวม<br />{money(total)}</div></div><div className="mt-3 space-y-1 text-xs">{items.map((item) => <div key={item.name} className="flex justify-between gap-2"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-md" style={{ background: item.color }} />{item.name}</span><span className={`font-mono font-bold ${tone === 'red' ? 'text-red-600' : ''}`}>{money(item.val)}</span></div>)}{items.length === 0 ? <div className="py-3 text-center font-semibold text-emerald-700">{empty ?? 'ไม่มีข้อมูล'}</div> : null}</div></div>
}

function conic(items: Array<{ color: string; val: number }>, total: number) {
  if (!items.length || total <= 0) return 'conic-gradient(#e5e7eb 0% 100%)'
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
  return <div className="rounded-md bg-white p-5 shadow-lg"><h3 className="mb-3 font-bold text-cyan-700">📥 AR Aging — อายุลูกหนี้</h3><div className="space-y-2">{Object.entries(aging).map(([key, amount]) => <div key={key}><div className="mb-1 flex justify-between text-xs"><span className="font-medium">{agingLabel(key)}</span><span className="font-mono font-bold">{money(amount)}</span></div><div className="h-3 rounded-md-full bg-slate-100"><div className="h-3 rounded-md-full bg-cyan-500" style={{ width: `${Math.min(100, amount / max * 100)}%` }} /></div></div>)}</div><div className="mt-3 flex justify-between border-t pt-2 text-sm font-bold"><span>รวม AR</span><span className="text-cyan-700">{money(total)}</span></div></div>
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
  const map: Record<string, string> = { amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700', emerald: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700' }
  return <div className="overflow-hidden rounded-md bg-white shadow"><div className={`flex justify-between border-b px-4 py-3 font-semibold ${map[tone]}`}><span>{heading}</span><span>{money(total as number)}</span></div>{children}</div>
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-xs"><thead className="bg-slate-50"><tr>{headers.map((header) => <th key={header} className="p-2 text-left last:text-right">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className="border-t">{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={`p-2 ${cellIndex >= row.length - 2 ? 'text-right' : ''}`}>{cell}</td>)}</tr>)}</tbody></table></div>
}

function KeyRows({ rows }: { rows: Array<[string, number | string | undefined, string?]> }) {
  const bg: Record<string, string> = { amber: 'bg-amber-50 text-amber-700', emerald: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700' }
  return <table className="w-full text-xs"><tbody>{rows.map(([label, value, tone]) => <tr key={label} className={`border-t ${tone ? bg[tone] : ''}`}><td className="p-2">{label}</td><td className="p-2 text-right font-medium">{typeof value === 'string' ? value : money(value)}</td></tr>)}</tbody></table>
}

function SeverityCard({ active, label, severity, tone, value }: { active: boolean; label: string; severity: string; tone: string; value: number }) {
  const map: Record<string, string> = { amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700', emerald: 'bg-emerald-50 text-emerald-700', red: 'bg-red-50 text-red-700', slate: 'bg-white text-slate-800' }
  return <button className={`rounded-md border-2 p-4 text-left shadow-lg transition ${map[tone] ?? map.slate} ${active ? 'border-slate-700' : 'border-transparent'}`} data-anomaly-action="filter" data-severity={severity} type="button"><div className="text-xs opacity-80">{label}</div><div className="text-3xl font-bold">{value}</div></button>
}

function CategoryTags({ categories }: { categories: Array<{ cat: string; count: number }> }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-md bg-white p-3 shadow"><span className="text-xs font-bold text-slate-500">📂 หมวด:</span>{categories.map((category) => <span className="rounded-md-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700" key={category.cat}>{category.cat} <b className="text-red-600">{category.count}</b></span>)}</div>
}

function AnomalyGroup({ expanded, group }: { expanded: boolean; group: { category: string; icon: string; items: Anomaly[]; key: string; label: string; severity: Anomaly['severity'] } }) {
  const shell = group.severity === 'critical' ? 'border-red-600 bg-red-50' : group.severity === 'warn' ? 'border-amber-500 bg-amber-50' : 'border-blue-500 bg-blue-50'
  const badge = group.severity === 'critical' ? 'bg-red-600 text-white' : group.severity === 'warn' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
  const textTone = group.severity === 'critical' ? 'text-red-800' : group.severity === 'warn' ? 'text-amber-800' : 'text-blue-800'
  const countTone = group.severity === 'critical' ? 'text-red-700' : group.severity === 'warn' ? 'text-amber-700' : 'text-blue-700'
  return <div className={`rounded-md border-l-4 shadow ${shell}`}><button className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/40" data-anomaly-action="toggle" data-group-key={group.key} type="button"><span className="text-2xl">{group.icon}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md px-2 py-0.5 text-xs font-bold ${badge}`}>{group.severity === 'critical' ? 'วิกฤต' : group.severity === 'warn' ? 'เตือน' : 'ข้อมูล'}</span><span className="text-xs text-slate-500">📂 {group.category}</span><span className={`font-bold ${textTone}`}>{group.label}</span><span className={`ml-auto text-2xl font-bold ${countTone}`}>{group.items.length}</span><span className="text-xs text-slate-500">รายการ</span></div></div><span className="text-xl text-slate-400">{expanded ? '▲' : '▼'}</span></button>{expanded ? <div className="divide-y divide-slate-200 border-t border-slate-200 bg-white/60">{group.items.map((item) => <div key={item.id} className="p-3 pl-12 hover:bg-white"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-[260px] flex-1"><div className={`text-sm font-semibold ${textTone}`}>{item.title}</div><div className="mt-0.5 text-xs text-slate-700">{item.detail}</div><div className="mt-1 text-xs italic text-slate-500">💡 <b>แนะนำ:</b> {item.action}</div></div>{item.fixHref ? <Link className="whitespace-nowrap rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow" href={item.fixHref}>✏️ ไปแก้</Link> : null}</div></div>)}</div> : null}</div>
}

function ruleLabel(key: string) {
  const labels: Record<string, string> = { 'acc-neg': '🚨 บัญชีติดลบ', 'ap-overdue': '⚠ เจ้าหนี้ค้างจ่าย', 'ar-overdue': '🚨 ลูกหนี้ค้างเกิน 90 วัน', 'bs-orphan': 'ℹ Bank entry ไม่มี ref', 'cash-low': '⚠ เงินสดต่ำ', 'cust-dup': '⚠ ลูกค้าชื่อซ้ำ', 'cust-no-contact': 'ℹ ลูกค้าไม่มีข้อมูลติดต่อ', 'margin-neg': '🚨 บิลขายขาดทุน', 'no-bill': 'ℹ วันนี้ยังไม่มีบิล', 'pb-empty': '⚠ บิลซื้อไม่มีรายการ/ราคา', 'pb-future': '⚠ บิลซื้อวันที่อนาคต', 'pb-overpaid': '🚨 บิลซื้อจ่ายเกิน', 'sb-empty': '⚠ บิลขายไม่มีรายการ', 'sb-future': '⚠ บิลขายวันที่อนาคต', 'stock-neg': '🚨 Stock ติดลบ', 'stock-orphan-val': '⚠ Stock 0 แต่มีมูลค่า', 'sup-dup': '⚠ Supplier ชื่อซ้ำ', 'trade-stuck': '⚠ Trading ค้าง match นาน' }
  return labels[key] ?? key
}

function ruleKey(id: string) {
  const keys = ['stock-orphan-val', 'stock-neg', 'cust-no-contact', 'pb-overpaid', 'pb-future', 'pb-empty', 'sb-future', 'sb-empty', 'ar-overdue', 'ap-overdue', 'margin-neg', 'acc-neg', 'cash-low', 'cust-dup', 'sup-dup', 'bs-orphan', 'trade-stuck', 'no-bill']
  return keys.find((key) => id === key || id.startsWith(`${key}-`)) ?? (id.split('-').slice(0, -1).join('-') || id)
}

function AnomalyChecklist() {
  return <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600"><h3 className="mb-2 font-bold">📋 ระบบตรวจจับความผิดปกติ — เปิดใช้งาน 18 rule groups จากข้อมูลจริง</h3><div className="grid gap-2 md:grid-cols-2"><ul className="ml-5 list-disc space-y-0.5"><li>📦 <b>Stock:</b> ติดลบ / มูลค่ากำพร้า</li><li>📥 <b>AR:</b> ลูกหนี้เกินกำหนด</li><li>📤 <b>AP:</b> เจ้าหนี้ค้างจ่าย / จ่ายเกิน</li><li>💵 <b>Cash:</b> เงินสดต่ำ / บัญชีติดลบ / bank entry ไม่มี ref</li><li>📤 <b>Sales:</b> บิลขาดทุน / วันที่อนาคต</li></ul><ul className="ml-5 list-disc space-y-0.5"><li>🧮 <b>Bill Content:</b> บิลซื้อ/ขายไม่มีรายการหรือยอดรายการเป็น 0</li><li>📅 <b>Date:</b> บิลซื้อ/ขายวันที่อนาคต</li><li>🔄 <b>Trading:</b> ค้าง match นาน</li><li>👥 <b>Master:</b> ชื่อซ้ำ / ไม่มี contact</li><li>📅 <b>Daily:</b> วันทำงานยังไม่มีบิลซื้อ-ขาย</li></ul></div><div className="mt-3 border-t border-slate-300 pt-3 text-[11px] text-slate-500">Legacy 40-check coverage และ record-level auto-scroll/highlight ยังเป็น follow-up จนกว่า target data contract และปลายทาง highlight query จะพร้อม.</div></div>
}

function Notice({ text }: { text?: string }) {
  return <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"><b>Read-only baseline</b><span className="ml-2">{text ?? 'ไม่มี write action ใน baseline นี้'}</span></div>
}

function ErrorBox({ text }: { text: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{text}</div>
}
