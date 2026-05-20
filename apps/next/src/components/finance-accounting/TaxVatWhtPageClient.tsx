'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type BranchRow = { code: string; id: string; name: string }
type TaxItem = { base: number; date: string; hasDoc?: boolean; no: string; party: string; source: string; vat?: number; wht?: number }
type SourceState = { basis: string; limitations: string[]; writeActionsEnabled: false }

type TaxPayload = {
  branches: BranchRow[]
  filters: { branchId: string; month: string; periodEnd: string; periodStart: string; year: string }
  sourceState: SourceState
  summary: { missingCount: number; vatIn: number; vatOut: number; vatPayable: number; whtChargedNet: number; whtWithheldNet: number }
  taxCalendar: Array<{ periodLabel: string; vIn: number; vOut: number; vatDue: string; vatPayable: number; wC: number; wW: number; whtDue: string }>
  vatInput: { items: TaxItem[] }
  vatOutput: { items: TaxItem[] }
  whtCharged: { items: TaxItem[] }
  whtWithheld: { items: TaxItem[] }
}

const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const YEARS = [2024, 2025, 2026, 2027, 2028]

export function TaxVatWhtPageClient() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [branchId, setBranchId] = useState('')
  const url = useMemo(() => `/api/finance-accounting/tax-vat-wht?month=${month}&year=${year}${branchId ? `&branchId=${branchId}` : ''}`, [branchId, month, year])
  const { data, error, isLoading } = useApi<TaxPayload>(url)
  const maxCalendar = Math.max(...(data?.taxCalendar ?? []).flatMap((row) => [row.vOut, row.vIn, Math.abs(row.vatPayable)]), 1)

  return (
    <section className="space-y-4">
      <Hero />
      <BaselineNotice sourceState={data?.sourceState} />
      {error ? <ErrorBox message={error} /> : null}
      <FilterPanel>
        <label className="text-sm">งวด</label>
        <select className="rounded border px-2 py-1.5 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}>{MONTHS.map((item) => <option key={item} value={item}>เดือน {item}</option>)}</select>
        <select className="rounded border px-2 py-1.5 text-sm" value={year} onChange={(event) => setYear(event.target.value)}>{YEARS.map((item) => <option key={item} value={String(item)}>ปี {item}</option>)}</select>
        <BranchSelect branches={data?.branches ?? []} value={branchId} onChange={setBranchId} />
        <span className="text-xs text-slate-500">ช่วง {data?.filters.periodStart ?? `${year}-${month}-01`} ถึง {data?.filters.periodEnd ?? '-'}</span>
        <DisabledButton>📥 Excel</DisabledButton>
      </FilterPanel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-600 via-pink-700 to-fuchsia-800 p-6 text-white shadow-lg">
          <div className="text-sm uppercase tracking-wider opacity-80">🧾 VAT Payable งวด {year}-{month}</div>
          <div className="mt-2 text-4xl font-bold md:text-5xl">{money(data?.summary.vatPayable)}</div>
          <div className="mt-1 text-sm opacity-90">บาท · {(data?.summary.vatPayable ?? 0) >= 0 ? 'ต้องนำส่ง' : 'ภาษีซื้อรอใช้เครดิต'}</div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
            <MiniHero label="📤 VAT ขาย (Output)" tone="emerald" value={money(data?.summary.vatOut)} />
            <MiniHero label="📥 VAT ซื้อ (Input)" tone="blue" value={money(data?.summary.vatIn)} />
          </div>
        </div>
        <Panel title="🥧 VAT Output vs Input"><Donut output={data?.summary.vatOut ?? 0} input={data?.summary.vatIn ?? 0} net={data?.summary.vatPayable ?? 0} /></Panel>
        <Panel title="🪙 WHT Position"><div className="space-y-3"><WhtBox label="เราหักไว้ (ต้องนำส่ง ภงด.)" tone="amber" value={money(data?.summary.whtChargedNet)} /><WhtBox label="ลูกค้าหักจากเรา (เครดิตได้)" tone="purple" value={money(data?.summary.whtWithheldNet)} /><WhtBox label="⚠ ใบกำกับขาด" tone="red" value={`${data?.summary.missingCount ?? 0} รายการ`} /></div></Panel>
      </div>

      <Panel title="📈 VAT แนวโน้ม 6 เดือน (ขาย/ซื้อ/Payable)">
        <div className="grid grid-cols-6 gap-3 overflow-x-auto pb-1">
          {(data?.taxCalendar ?? []).map((row) => <CalendarBars key={row.periodLabel} max={maxCalendar} row={row} />)}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="VAT ขาย (Output)" value={money(data?.summary.vatOut)} tone="emerald" />
        <StatCard label="VAT ซื้อ (Input)" value={money(data?.summary.vatIn)} tone="blue" />
        <StatCard label="VAT Payable" value={money(data?.summary.vatPayable)} tone="red" sub="ต้องนำส่ง / เครดิต" />
        <StatCard label="WHT เราหักไว้" value={money(data?.summary.whtChargedNet)} tone="amber" sub="ต้องนำส่ง" />
        <StatCard label="WHT ถูกหักจากเรา" value={money(data?.summary.whtWithheldNet)} tone="purple" sub="ใช้เครดิตได้" />
        <StatCard label="เอกสารภาษีไม่ครบ" value={String(data?.summary.missingCount ?? 0)} tone="red" />
      </div>

      <TaxTable isLoading={isLoading} rows={data?.vatOutput.items ?? []} title={`📤 VAT ขาย (Output) — ${year}-${month}`} tone="emerald" valueKey="vat" />
      <TaxTable hasDoc isLoading={isLoading} rows={data?.vatInput.items ?? []} title={`📥 VAT ซื้อ (Input) — ${year}-${month}`} tone="blue" valueKey="vat" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <TaxTable isLoading={isLoading} rows={data?.whtCharged.items ?? []} title="🪙 WHT เราหักไว้ (ต้องนำส่ง ภงด.3/53)" tone="amber" valueKey="wht" />
        <TaxTable isLoading={isLoading} rows={data?.whtWithheld.items ?? []} title="💰 WHT ลูกค้าหักจากเรา (ใช้เครดิต)" tone="purple" valueKey="wht" />
      </div>
      <CalendarTable rows={data?.taxCalendar ?? []} />
    </section>
  )
}

function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    let mounted = true
    setIsLoading(true)
    setError(null)
    dailyFetchJson<T>(url).then((payload) => mounted ? setData(payload) : undefined).catch((caught) => mounted ? setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้') : undefined).finally(() => mounted ? setIsLoading(false) : undefined)
    return () => { mounted = false }
  }, [url])
  return { data, error, isLoading }
}

function money(value?: number) {
  const amount = value ?? 0
  return amount < 0 ? `(${formatMoney(Math.abs(amount))})` : formatMoney(amount)
}

function Hero() {
  return <div className="rounded-xl bg-gradient-to-r from-rose-600 to-pink-700 p-5 text-white shadow"><h1 className="text-xl font-bold md:text-2xl">🧾 Tax / VAT / WHT</h1><p className="mt-1 text-sm opacity-80">VAT ซื้อ-ขาย · VAT Payable · WHT ถูกหัก / หักไว้ · Tax Calendar 6 เดือน · เอกสารภาษีไม่ครบ</p></div>
}

function BaselineNotice({ sourceState }: { sourceState?: SourceState }) {
  return <div className="rounded border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"><b>Tax read/design baseline</b><span className="ml-2">สรุปจาก transaction fields ยังไม่ใช่แบบยื่นภาษีหรือบัญชีภาษีปิดงวด</span>{sourceState ? <div className="mt-1 text-xs text-amber-800">{sourceState.limitations[0]}</div> : null}</div>
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow">{children}</div>
}

function BranchSelect({ branches, onChange, value }: { branches: BranchRow[]; onChange: (value: string) => void; value: string }) {
  return <select className="rounded border bg-white px-2 py-1.5 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">ทุกสาขา</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
}

function DisabledButton({ children }: { children: ReactNode }) {
  return <button className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white opacity-50" disabled type="button">{children}</button>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-2xl bg-white p-4 shadow"><div className="mb-2 text-xs font-bold text-slate-700">{title}</div>{children}</div>
}

function MiniHero({ label, tone, value }: { label: string; tone: 'blue' | 'emerald'; value: string }) {
  const color = tone === 'emerald' ? 'text-emerald-200' : 'text-blue-200'
  return <div><div className="text-[10px] opacity-75">{label}</div><div className={`text-lg font-bold ${color}`}>{value}</div></div>
}

function Donut({ input, net, output }: { input: number; net: number; output: number }) {
  const total = Math.max(1, input + output)
  const outputDash = output / total * 439.8
  return <svg viewBox="0 0 200 200" className="h-44 w-full"><g transform="rotate(-90 100 100)"><circle cx="100" cy="100" fill="none" r="70" stroke="#10b981" strokeDasharray={`${outputDash} 439.8`} strokeWidth="30" /><circle cx="100" cy="100" fill="none" r="70" stroke="#3b82f6" strokeDasharray={`${input / total * 439.8} 439.8`} strokeDashoffset={-outputDash} strokeWidth="30" /></g><text fill="#64748b" fontSize="9" textAnchor="middle" x="100" y="98">VAT Net</text><text fill={net >= 0 ? '#dc2626' : '#059669'} fontSize="13" fontWeight="bold" textAnchor="middle" x="100" y="115">{money(net)}</text></svg>
}

function WhtBox({ label, tone, value }: { label: string; tone: 'amber' | 'purple' | 'red'; value: string }) {
  const color = tone === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-700' : tone === 'purple' ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-red-500 bg-red-50 text-red-700'
  return <div className={`rounded-lg border-l-4 p-3 ${color}`}><div className="text-[11px]">{label}</div><div className="text-2xl font-bold">{value}</div></div>
}

function CalendarBars({ max, row }: { max: number; row: TaxPayload['taxCalendar'][number] }) {
  const height = (value: number) => `${Math.max(4, Math.abs(value) / max * 112)}px`
  return <div className="min-w-24 rounded-lg bg-slate-50 p-2 text-center text-xs"><div className="flex h-32 items-end justify-center gap-1"><span className="w-5 rounded-t bg-emerald-500" style={{ height: height(row.vOut) }} /><span className="w-5 rounded-t bg-blue-500" style={{ height: height(row.vIn) }} /><span className={`w-5 rounded-t ${row.vatPayable >= 0 ? 'bg-red-500' : 'bg-emerald-700'}`} style={{ height: height(row.vatPayable) }} /></div><div className="mt-1 font-bold text-slate-600">{row.periodLabel.slice(5)}</div></div>
}

function StatCard({ label, sub, tone, value }: { label: string; sub?: string; tone: 'amber' | 'blue' | 'emerald' | 'purple' | 'red'; value: string }) {
  const color = { amber: 'border-amber-500 text-amber-700', blue: 'border-blue-500 text-blue-700', emerald: 'border-emerald-500 text-emerald-700', purple: 'border-purple-500 text-purple-700', red: 'border-red-500 text-red-700' }[tone]
  return <div className={`rounded-xl border-l-4 bg-white p-3 shadow ${color}`}><div className="text-xs text-slate-500">{label}</div><div className="text-lg font-bold">{value}</div>{sub ? <div className="text-xs text-slate-400">{sub}</div> : null}</div>
}

function TaxTable({ hasDoc = false, isLoading, rows, title, tone, valueKey }: { hasDoc?: boolean; isLoading: boolean; rows: TaxItem[]; title: string; tone: 'amber' | 'blue' | 'emerald' | 'purple'; valueKey: 'vat' | 'wht' }) {
  const heading = { amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700', emerald: 'bg-emerald-50 text-emerald-700', purple: 'bg-purple-50 text-purple-700' }[tone]
  const valueColor = { amber: 'text-amber-700', blue: 'text-blue-700', emerald: 'text-emerald-700', purple: 'text-purple-700' }[tone]
  return <div className="overflow-hidden rounded-xl bg-white shadow"><div className={`border-b p-3 font-bold ${heading}`}>{title}</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr><Th>วันที่</Th><Th>เลขที่</Th><Th>คู่ค้า</Th><Th align="right">ฐาน</Th><Th align="right">{valueKey === 'vat' ? 'VAT' : 'WHT'}</Th>{hasDoc ? <Th align="center">เอกสาร</Th> : null}</tr></thead><tbody><LoadingOrEmpty colSpan={hasDoc ? 6 : 5} isLoading={isLoading} rows={rows.length} />{rows.map((item) => <tr key={`${item.source}-${item.no}`} className="border-t"><Td>{item.date}</Td><Td><span className="font-mono text-xs">{item.no}</span></Td><Td>{item.party}</Td><Td align="right">{money(item.base)}</Td><Td align="right"><span className={`font-bold ${valueColor}`}>{money(item[valueKey])}</span></Td>{hasDoc ? <Td align="center">{item.hasDoc ? '✓' : '✗ ขาด'}</Td> : null}</tr>)}</tbody></table></div></div>
}

function CalendarTable({ rows }: { rows: TaxPayload['taxCalendar'] }) {
  return <div className="overflow-hidden rounded-xl bg-white shadow"><div className="border-b bg-slate-100 p-3 font-bold text-slate-700">📅 Tax Calendar — 6 เดือนล่าสุด</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><Th>งวด</Th><Th align="right">VAT ขาย</Th><Th align="right">VAT ซื้อ</Th><Th align="right">VAT Payable</Th><Th>VAT Due (PP30)</Th><Th align="right">WHT หักไว้</Th><Th align="right">WHT ถูกหัก</Th><Th>WHT Due (ภงด.)</Th></tr></thead><tbody>{rows.map((row) => <tr key={row.periodLabel} className="border-t hover:bg-slate-50"><Td><b>{row.periodLabel}</b></Td><Td align="right"><span className="text-emerald-700">{money(row.vOut)}</span></Td><Td align="right"><span className="text-blue-700">{money(row.vIn)}</span></Td><Td align="right"><span className="font-bold text-red-700">{money(row.vatPayable)}</span></Td><Td>{row.vatDue}</Td><Td align="right"><span className="text-amber-700">{money(row.wC)}</span></Td><Td align="right"><span className="text-purple-700">{money(row.wW)}</span></Td><Td>{row.whtDue}</Td></tr>)}</tbody></table></div></div>
}

function LoadingOrEmpty({ colSpan, isLoading, rows }: { colSpan: number; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>ยังไม่มีข้อมูล</td></tr>
  return null
}

function Th({ align = 'left', children }: { align?: 'center' | 'left' | 'right'; children: ReactNode }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`whitespace-nowrap p-2 font-semibold ${textAlign}`}>{children}</th>
}

function Td({ align = 'left', children }: { align?: 'center' | 'left' | 'right'; children: ReactNode }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`whitespace-nowrap p-2 ${textAlign}`}>{children}</td>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
