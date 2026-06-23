'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
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
  const latestLoadRequestRef = useRef(0)

  useEffect(() => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    const params = new URLSearchParams({ asOf })
    if (branchId !== 'ALL') params.set('branchId', branchId)
    dailyFetchJson<Payload>(`/api/finance-accounting/asset-overview?${params}`)
      .then((payload) => {
        if (requestId !== latestLoadRequestRef.current) return
        setData(payload)
      })
      .catch((caught) => {
        if (requestId !== latestLoadRequestRef.current) return
        setError(caught instanceof Error ? caught.message : 'โหลด Net Worth / Track Asset ไม่ได้')
      })
  }, [asOf, branchId])

  const summary = data?.summary ?? {}

  return (
    <section className="space-y-4 text-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="m-0 text-xl font-bold text-slate-900">💎 Net Worth / Track Asset</h1>
          <p className="mt-1 text-xs text-slate-500">ภาพรวมการบริหารทรัพย์สิน หนี้สิน สภาพคล่อง และอายุลูกหนี้ (AR Aging)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DatePickerInput 
            className="w-[140px] border-slate-300 bg-white text-slate-900 outline-none focus:ring-0 h-9 rounded-lg" 
            value={asOf} 
            onChange={setAsOf} 
          />
          <select 
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none focus:ring-0 focus:border-slate-400 h-9 transition-colors" 
            value={branchId} 
            onChange={(event) => setBranchId(event.target.value)}
          >
            <option value="ALL">ทุกสาขา</option>
            {(data?.branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <button 
            className="rounded-md bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm px-3.5 py-1.5 outline-none border border-slate-200/80 transition-colors opacity-50 cursor-not-allowed" 
            disabled 
            type="button"
          >
            ส่งออก
          </button>
        </div>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <DarkKpi label="Total Asset" value={summary.totalAsset} />
        <DarkKpi label="Total Debt" value={summary.totalDebt} />
        <DarkKpi up label="Net Worth" value={summary.netWorth} />
        <DarkKpi danger={(summary.cashNeededToday ?? 0) > (summary.totalCash ?? 0)} label="เงินที่ต้องใช้วันนี้" value={summary.cashNeededToday} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 text-xs text-amber-900 shadow-sm">
        <span className="font-bold text-amber-700">📌 Read-only baseline</span>
        <span>{data?.sourceState.limitations[0] ?? 'มุมมองสำหรับการบริหารเท่านั้น ไม่รองรับการทำธุรกรรมหรือแก้ไขข้อมูลโดยตรง'}</span>
        <Link 
          className="ml-auto rounded-lg bg-slate-950 px-3.5 py-1.5 text-white hover:bg-slate-800 outline-none transition-colors font-semibold" 
          href="/finance-accounting/financial-dashboard"
        >
          Financial Dashboard
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4">
          {num(data?.pendingIssueSummary.count) > 0 ? <PendingSaleBlock summary={data?.pendingIssueSummary ?? {}} /> : null}
          {num(data?.tradingPending.billCount) > 0 ? <TradingPendingBlock summary={data?.tradingPending ?? {}} /> : null}
          
          <div className="grid gap-4 md:grid-cols-2">
            <CashTable rows={data?.rows.cashAccounts ?? []} total={summary.totalCash ?? 0} />
            <ReceivableTable row={data?.rows.receivable ?? {}} />
            <StockTable row={data?.rows.stock ?? {}} />
            <DebtTable row={data?.rows.debt ?? {}} />
          </div>
        </div>
        
        <div className="space-y-4">
          <DonutPanel items={data?.charts.assetComp ?? []} title="🥧 องค์ประกอบสินทรัพย์" total={summary.totalAsset ?? 0} tone="emerald" />
          <DonutPanel empty="✅ ไม่มีภาระหนี้สิน" items={data?.charts.debtComp ?? []} title="🥧 องค์ประกอบหนี้สิน" total={summary.totalDebt ?? 0} tone="red" />
          <ArAging aging={data?.charts.arAging ?? {}} total={data?.rows.receivable.totalAR ?? 0} />
        </div>
      </div>
    </section>
  )
}

function DarkKpi({ danger = false, label, up = false, value }: { danger?: boolean; label: string; up?: boolean; value: unknown }) {
  const toneStyles = danger ? {
    border: 'border-red-200',
    bg: 'bg-red-50/30',
    text: 'text-red-700',
    iconBg: 'bg-red-100/60 text-red-600',
    emoji: '⏰',
    sub: 'cash pressure'
  } : up ? {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50/30',
    text: 'text-emerald-700',
    iconBg: 'bg-emerald-100/60 text-emerald-600',
    emoji: '💰',
    sub: 'assets - liabilities'
  } : label === 'Total Asset' ? {
    border: 'border-blue-200',
    bg: 'bg-blue-50/30',
    text: 'text-blue-700',
    iconBg: 'bg-blue-100/60 text-blue-600',
    emoji: '🏦',
    sub: 'management value'
  } : {
    border: 'border-purple-200',
    bg: 'bg-purple-50/30',
    text: 'text-purple-700',
    iconBg: 'bg-purple-100/60 text-purple-600',
    emoji: '📉',
    sub: 'total liabilities'
  }

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm flex items-center gap-3.5 ${toneStyles.border}`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${toneStyles.iconBg}`}>
        {toneStyles.emoji}
      </div>
      <div>
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
        <div className={`text-lg font-bold mt-0.5 ${toneStyles.text}`}>{money(value)}</div>
        <div className="text-[10px] text-slate-400 font-medium mt-0.5">
          {toneStyles.sub}
        </div>
      </div>
    </div>
  )
}

function PendingSaleBlock({ summary }: { summary: Record<string, number> }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/10 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
          <span className="text-xl">📦</span> ต้นทุนรอเปิดบิล (Pending Sale) - เงินค้างใน Stock ที่เบิกออกไปแล้ว
        </h3>
        <Link 
          className="rounded-lg bg-amber-700 hover:bg-amber-800 transition-colors px-3 py-1.5 text-xs font-semibold text-white outline-none" 
          href="/sales/stock-issue"
        >
          ดูทั้งหมด
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="⏰ จำนวนใบ" tone="amber" value={money(summary.count)} />
        <Mini label="⚖ น้ำหนัก" tone="blue" value={`${money(summary.qty)} กก.`} />
        <Mini label="💰 ต้นทุน (เงินค้าง)" tone="red" value={money(summary.cost)} />
        <Mini label="📈 ยอดขายคาด" tone="emerald" value={money(summary.est)} />
      </div>
    </div>
  )
}

function TradingPendingBlock({ summary }: { summary: Record<string, number> }) {
  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50/10 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-purple-800">
          <span className="text-xl">🔄</span> Trading Pending รับเงิน - Trading ซื้อจ่ายแล้ว แต่ Sales ยังไม่เปิด
        </h3>
        <Link 
          className="rounded-lg bg-purple-700 hover:bg-purple-800 transition-colors px-3 py-1.5 text-xs font-semibold text-white outline-none" 
          href="/trading/matching"
        >
          Trading Matching
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="📋 บิลซื้อ" tone="purple" value={`${money(summary.billCount)} ใบ`} />
        <Mini label="💸 จ่ายไปแล้ว" tone="blue" value={money(summary.paidAmount)} />
        <Mini label="✓ Match แล้ว" tone="emerald" value={money(summary.matchedAmount)} />
        <Mini label="⏳ Pending รับเงิน" tone="purpleStrong" value={money(summary.pendingAmount)} />
      </div>
    </div>
  )
}

function Mini({ label, tone, value }: { label: string; tone: string; value: string }) {
  const map: Record<string, string> = {
    amber: 'border-amber-200 bg-amber-50/30 text-amber-800',
    blue: 'border-blue-200 bg-blue-50/30 text-blue-800',
    emerald: 'border-emerald-200 bg-emerald-50/30 text-emerald-800',
    purple: 'border-purple-200 bg-purple-50/30 text-purple-800',
    purpleStrong: 'border-fuchsia-200 bg-fuchsia-50/30 text-fuchsia-800',
    red: 'border-red-200 bg-red-50/30 text-red-800',
  }
  return (
    <div className={`rounded-lg border p-3 ${map[tone] ?? map.blue}`}>
      <div className="text-[10px] text-slate-500 font-semibold uppercase">{label}</div>
      <div className="break-words text-lg font-bold mt-1">{value}</div>
    </div>
  )
}

function DonutPanel({ empty, items, title, total, tone }: { empty?: string; items: Array<{ color: string; name: string; val: number }>; title: string; total: number; tone: string }) {
  const gradient = conic(items, total)
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className={`mb-4 font-bold text-sm ${tone === 'red' ? 'text-red-700' : 'text-emerald-700'}`}>{title}</h3>
      <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full p-9 shadow-inner transition-transform" style={{ background: gradient }}>
        <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-center text-[10px] font-bold text-slate-800 border border-slate-100 shadow-sm leading-tight">
          รวม<br />
          <span className="text-xs font-extrabold mt-0.5 text-slate-900">{money(total)}</span>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-xs text-slate-700">
        {items.map((item) => (
          <div key={item.name} className="flex justify-between gap-2 items-center">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
              {item.name}
            </span>
            <span className={`font-mono font-bold ${tone === 'red' ? 'text-red-600' : 'text-emerald-600'}`}>{money(item.val)}</span>
          </div>
        ))}
        {items.length === 0 ? <div className="py-3 text-center font-semibold text-emerald-600 bg-emerald-50/30 rounded-lg">{empty ?? 'ไม่มีข้อมูล'}</div> : null}
      </div>
    </div>
  )
}

function conic(items: Array<{ color: string; val: number }>, total: number) {
  if (!items.length || total <= 0) return 'conic-gradient(#f1f5f9 0% 100%)'
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
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-bold text-sm text-blue-700">📥 AR Aging - อายุลูกหนี้</h3>
      <div className="space-y-3">
        {Object.entries(aging).map(([key, amount]) => (
          <div key={key}>
            <div className="mb-1 flex justify-between text-xs text-slate-700">
              <span className="font-medium">{agingLabel(key)}</span>
              <span className="font-mono font-bold">{money(amount)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100">
              <div className="h-2.5 rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min(100, amount / max * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-sm font-bold text-slate-800">
        <span>รวม AR</span>
        <span className="text-blue-600">{money(total)}</span>
      </div>
    </div>
  )
}

function agingLabel(key: string) {
  return key === 'current' ? '✅ ยังไม่ครบกำหนด' : key === '90+' ? '> 90 วัน ⚠️' : `${key} วัน`
}

function CashTable({ rows, total }: { rows: AnyRow[]; total: number }) {
  const headers = ['บัญชี', 'ประเภท', 'สกุล', 'Balance', 'THB Equiv']
  return (
    <Panel heading="💵 CASH & OTHERS" tone="emerald" total={total}>
      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100">
        {rows.length === 0 ? (
          <div className="p-4 text-center text-slate-400 text-xs">ยังไม่มีข้อมูล</div>
        ) : (
          rows.map((row, index) => (
            <div key={index} className="p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-800">{text(row.name)}</span>
                <span className="text-slate-500">{text(row.type)}</span>
              </div>
              <div className="flex justify-between text-slate-500 font-mono text-[11px]">
                <span>สกุลเงิน: {text(row.currency)}</span>
                <span>ยอดคงเหลือ: {money(row.balance)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-100/50">
                <span className="text-slate-400">THB Equiv:</span>
                <span className="font-bold text-emerald-600 font-mono">{money(row.thbEquivalent)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-xs text-slate-700">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
            <tr>
              {headers.map((header) => <th key={header} className="px-4 py-3 text-xs font-semibold text-slate-500 text-left last:text-right">{header}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={`${row.name}-${index}`} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3.5 font-medium">{text(row.name)}</td>
                <td className="px-4 py-3.5 text-slate-500">{text(row.type)}</td>
                <td className="px-4 py-3.5 text-slate-500">{text(row.currency)}</td>
                <td className="px-4 py-3.5 text-right font-mono">{money(row.balance)}</td>
                <td className="px-4 py-3.5 text-right font-mono font-semibold text-emerald-600">{money(row.thbEquivalent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function ReceivableTable({ row }: { row: Record<string, number> }) {
  return (
    <Panel heading="📈 RECEIVABLE / ลูกหนี้" tone="blue" total={row.totalAR}>
      <KeyRows 
        rows={[
          ['ลูกหนี้ในประเทศ', row.arDomestic], 
          ['ลูกหนี้ต่างประเทศ', row.arOverseas], 
          ['ลูกหนี้เกินกำหนด', row.arOverdue, 'amber'], 
          ['+ Customer Advance ที่รับไว้', row.customerAdvanceTotal, 'emerald']
        ]} 
      />
    </Panel>
  )
}

function StockTable({ row }: { row: Record<string, number> }) {
  return (
    <Panel heading="📦 STOCK" tone="amber" total={row.val}>
      <KeyRows 
        rows={[
          ['น้ำหนัก Stock รวม', `${money(row.qty)} กก.`], 
          ['มูลค่า Stock รวม (WAC)', row.val], 
          ['Stock ที่จ่ายเงินแล้ว (ประมาณ)', row.paidVal, 'emerald'], 
          ['Stock ที่ยังค้างจ่าย', row.unpaidVal, 'amber']
        ]} 
      />
    </Panel>
  )
}

function DebtTable({ row }: { row: Record<string, number> }) {
  return (
    <Panel heading="📉 DEBT / ภาระหนี้" tone="red" total={row.totalAP + row.customerAdvanceTotal}>
      <KeyRows 
        rows={[
          ['เจ้าหนี้การค้า (AP)', row.totalAP], 
          ['เจ้าหนี้เกินกำหนด', row.apOverdue, 'red'], 
          ['Customer Advance (Liability)', row.customerAdvanceTotal], 
          ['ค่าใช้จ่ายวันนี้', row.expenseToday, 'amber'], 
          ['Supplier Advance ที่จ่ายไว้ (Asset)', row.supplierAdvanceTotal, 'emerald']
        ]} 
      />
    </Panel>
  )
}

function Panel({ children, heading, tone, total }: { children: ReactNode; heading: string; tone: string; total: unknown }) {
  const map: Record<string, string> = {
    amber: 'text-amber-800 border-amber-100',
    blue: 'text-blue-800 border-blue-100',
    emerald: 'text-emerald-800 border-emerald-100',
    red: 'text-red-800 border-red-100',
  }
  const bgMap: Record<string, string> = {
    amber: 'bg-amber-50/40',
    blue: 'bg-blue-50/40',
    emerald: 'bg-emerald-50/40',
    red: 'bg-red-50/40',
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm flex flex-col justify-between">
      <div className={`flex justify-between border-b border-slate-100 px-4 py-3.5 font-bold text-sm ${bgMap[tone]} ${map[tone]}`}>
        <span>{heading}</span>
        <span className="font-mono font-bold">{money(total as number)}</span>
      </div>
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}

function KeyRows({ rows }: { rows: Array<[string, number | string | undefined, string?]> }) {
  const bg: Record<string, string> = { 
    amber: 'bg-amber-50/30 text-amber-800 border-amber-100', 
    emerald: 'bg-emerald-50/30 text-emerald-800 border-emerald-100', 
    red: 'bg-red-50/30 text-red-800 border-red-100' 
  }
  return (
    <div className="divide-y divide-slate-100">
      {rows.map(([label, value, tone]) => (
        <div key={label} className={`flex justify-between items-center p-3.5 text-xs text-slate-700 hover:bg-slate-50/30 transition-colors ${tone ? bg[tone] : ''}`}>
          <span className="font-medium">{label}</span>
          <span className="font-mono font-semibold text-right shrink-0 ml-2">
            {typeof value === 'string' ? value : money(value)}
          </span>
        </div>
      ))}
    </div>
  )
}
