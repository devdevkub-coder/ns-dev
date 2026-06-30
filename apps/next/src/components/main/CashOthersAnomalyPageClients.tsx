'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AnyRow = Record<string, number | string | boolean | null | undefined>
type CashOthersPayload = {
  asOf: string
  charts: { arAging: Record<string, number>; assetComp: Array<{ color: string; name: string; val: number }>; debtComp: Array<{ color: string; name: string; val: number }> }
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

export function CashOthersSummaryPageClient() {
  const [asOf, setAsOf] = useState(today())
  const [data, setData] = useState<CashOthersPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latestLoadRequestRef = useRef(0)
  useEffect(() => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    dailyFetchJson<CashOthersPayload>(`/api/cash-others-summary?asOf=${asOf}`)
      .then((payload) => {
        if (requestId !== latestLoadRequestRef.current) return
        setData(payload)
      })
      .catch((caught) => {
        if (requestId !== latestLoadRequestRef.current) return
        setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
      })
  }, [asOf])
  const summary = data?.summary ?? {}

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
        <label className="text-xs font-bold text-slate-500">As of</label>
        <DatePickerInput className="w-[140px]" value={asOf} onChange={setAsOf} />
        <span className="flex-1" />
        <button className="rounded-lg bg-slate-100 border border-slate-100 px-3 py-1.5 text-xs font-bold text-slate-400 cursor-not-allowed outline-none focus:outline-none" disabled type="button">
          ส่งออก (ปิดการใช้งาน)
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Grand icon="💰" label="Total Asset" value={summary.totalAsset} />
        <Grand icon="📉" label="Total Debt" value={summary.totalDebt} />
        <Grand icon="⚖️" label="Net Worth" value={summary.netWorth} />
        <Grand danger={(summary.cashNeededToday ?? 0) > (summary.totalCash ?? 0)} icon="💸" label="เงินที่ต้องใช้วันนี้" value={summary.cashNeededToday} />
      </div>
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

function Grand({ danger = false, icon, label, value }: { danger?: boolean; icon: string; label: string; value: unknown }) {
  const iconBg = danger ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-600'
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl ${iconBg}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        <div className={`mt-0.5 break-words text-xl font-bold tracking-tight text-slate-900 ${danger ? 'text-red-600 font-extrabold' : ''}`}>
          {money(value)}
        </div>
      </div>
    </div>
  )
}


function TradingPendingBlock({ summary }: { summary: Record<string, number> }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <span className="text-xl">🔄</span> Trading Pending รับเงิน — Trading ซื้อจ่ายแล้ว แต่ Sales ยังไม่เปิด
        </h3>
        <Link className="rounded-lg bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs font-bold text-white transition-colors outline-none focus:outline-none" href="/trading/matching">
          Trading Matching →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 text-sm">
        <Mini label="📋 บิลซื้อ" tone="purple" value={`${money(summary.billCount)} ใบ`} />
        <Mini label="💸 จ่ายไปแล้ว" tone="blue" value={money(summary.paidAmount)} />
        <Mini label="✓ Match แล้ว" tone="emerald" value={money(summary.matchedAmount)} />
        <Mini label="⏳ Pending รับเงิน" tone="purpleStrong" value={money(summary.pendingAmount)} />
      </div>
    </div>
  )
}

function Mini({ label, tone, value }: { label: string; tone: string; value: string }) {
  const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''))
  const isZero = isNaN(numericValue) ? false : numericValue === 0

  const textToneMap: Record<string, string> = {
    amber: 'text-amber-700',
    blue: 'text-blue-700',
    emerald: 'text-emerald-700',
    purple: 'text-purple-700',
    purpleStrong: 'text-purple-800',
    red: 'text-red-700'
  }
  const color = isZero ? 'text-slate-900' : (textToneMap[tone] ?? 'text-slate-700')
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="text-xs text-slate-500 font-medium">{label}</div>
      <div className={`mt-0.5 break-words text-lg font-bold ${color}`}>{value}</div>
    </div>
  )
}

function DonutPanel({ empty, items, title, total, tone }: { empty?: string; items: Array<{ color: string; name: string; val: number }>; title: string; total: number; tone: string }) {
  const gradient = conic(items, total)
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className={`mb-3 font-bold text-sm ${tone === 'red' ? 'text-red-700' : 'text-emerald-700'}`}>{title}</h3>
      <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-full p-9" style={{ background: gradient }}>
        <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-center text-xs font-bold text-slate-700 leading-tight">
          รวม<br />{money(total)}
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-xs text-slate-600">
        {items.map((item) => (
          <div key={item.name} className="flex justify-between gap-2 items-center">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: item.color }} />
              {item.name}
            </span>
            <span className={`font-mono font-bold text-slate-800 ${tone === 'red' ? 'text-red-600' : ''}`}>{money(item.val)}</span>
          </div>
        ))}
        {items.length === 0 ? <div className="py-3 text-center font-semibold text-emerald-700">{empty ?? 'ไม่มีข้อมูล'}</div> : null}
      </div>
    </div>
  )
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
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
      <h3 className="mb-3 font-bold text-sm text-cyan-700">📥 AR Aging — อายุลูกหนี้</h3>
      <div className="space-y-3">
        {Object.entries(aging).map(([key, amount]) => (
          <div key={key}>
            <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600">
              <span>{agingLabel(key)}</span>
              <span className="font-mono text-slate-800 font-bold">{money(amount)}</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-cyan-500 transition-all duration-300" style={{ width: `${Math.min(100, amount / max * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-sm font-bold text-slate-800">
        <span>รวม AR</span>
        <span className="text-cyan-700 font-mono">{money(total)}</span>
      </div>
    </div>
  )
}

function agingLabel(key: string) {
  return key === 'current' ? '✅ ยังไม่ครบกำหนด' : key === '90+' ? '> 90 วัน ⚠️' : `${key} วัน`
}

function CashTable({ rows, total }: { rows: AnyRow[]; total: number }) {
  return (
    <Panel heading="💵 CASH & OTHERS" tone="emerald" total={total}>
      <Table
        headers={['บัญชี', 'ประเภท', 'สกุล', 'Balance', 'THB Equiv']}
        rows={rows.map((row) => [
          text(row.name),
          text(row.type),
          text(row.currency),
          money(row.balance),
          money(row.thbEquivalent)
        ])}
      />
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

function Panel({ children, heading, total }: { children: ReactNode; heading: string; tone?: string; total: unknown }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="flex justify-between items-center border-b border-slate-100 bg-slate-50/80 px-4 py-3 font-bold text-sm text-slate-800">
        <span>{heading}</span>
        <span className="font-mono text-slate-900">{money(total as number)}</span>
      </div>
      {children}
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div>
      {/* Desktop view */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full min-w-[620px] text-xs text-slate-700">
          <thead className="bg-slate-50/50">
            <tr>
              {headers.map((header) => (
                <th key={header} className="p-3 text-left font-semibold text-slate-600 border-b border-slate-100 last:text-right">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={`${row[0]}-${index}`} className="hover:bg-slate-50/30 transition-colors">
                {row.map((cell, cellIndex) => (
                  <td key={`${cell}-${cellIndex}`} className={`p-3 ${cellIndex >= row.length - 2 ? 'text-right font-mono' : ''}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile view */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-white">
        {rows.map((row, index) => (
          <div key={`${row[0]}-${index}`} className="p-3 hover:bg-slate-50/30 transition-colors">
            {row.map((cell, cellIndex) => (
              <div key={`${cell}-${cellIndex}`} className="flex justify-between items-center gap-2 py-1 text-xs">
                <span className="font-semibold text-slate-500">{headers[cellIndex]}</span>
                <span className={`text-slate-800 ${cellIndex >= row.length - 2 ? 'font-mono font-bold' : ''}`}>
                  {cell}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function KeyRows({ rows }: { rows: Array<[string, number | string | undefined, string?]> }) {
  const toneBg: Record<string, string> = {
    amber: 'bg-amber-50/40 text-amber-800 border-amber-100/30',
    emerald: 'bg-emerald-50/40 text-emerald-800 border-emerald-100/30',
    red: 'bg-red-50/40 text-red-800 border-red-100/30'
  }
  return (
    <div className="divide-y divide-slate-100">
      {rows.map(([label, value, tone]) => (
        <div key={label} className={`flex justify-between items-center p-3 text-xs ${tone ? toneBg[tone] : 'text-slate-700 bg-white'}`}>
          <span className="font-semibold text-slate-500">{label}</span>
          <span className="font-mono font-bold text-slate-800">
            {typeof value === 'string' ? value : money(value)}
          </span>
        </div>
      ))}
    </div>
  )
}


function Notice({ text }: { text?: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 text-sm text-amber-900 shadow-sm flex items-start gap-2">
      <span>⚠️</span>
      <div>
        <b className="font-bold">Read-only baseline</b>
        <span className="ml-2 leading-relaxed">{text ?? 'ไม่มี write action ใน baseline นี้'}</span>
      </div>
    </div>
  )
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/40 p-4 text-sm text-red-800 shadow-sm flex items-start gap-2">
      <span>🚨</span>
      <div className="leading-relaxed">{text}</div>
    </div>
  )
}
