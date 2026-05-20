'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type LoanContractRow = {
  contractNo: string
  duePaid: number
  dueTotal: number
  endDate: string
  installmentAmount: number
  interestRate: number
  lenderName: string
  loanType: string
  nextDue: string
  outstanding: number
  overdue: number
  principalAmount: number
  startDate: string
  status: string
  termMonths: number
}

type LoanContractsPayload = {
  filters: { statuses: string[]; types: string[] }
  rows: LoanContractRow[]
  summary: { count: number; financed: number; outstanding: number; overdue: number }
}

type DueRow = {
  contractNo: string
  daysOverdue?: number
  dueDate: string
  id: string
  interestAmount: number
  lenderName: string
  loanType: string
  paidAmount: number
  principalAmount: number
  totalDueAmount: number
}

type LoanDashboardPayload = {
  byType: { label: string; value: number }[]
  overdueList: DueRow[]
  summary: { due7: number; due30: number; dueThisMonth: number; interestThisMonth: number; overdueAmount: number; principalThisMonth: number; totalOutstanding: number }
  upcomingDue: DueRow[]
}

type EquityPayload = {
  row: { ownerEquityAdjustment: number; paidUpCapital: number; registeredCapital: number; retainedEarnings: number; totalEquity: number; updatedAt: string }
}

type OpeningPayload = {
  accounts: { branchCode: string; branchName: string; code: string; currency: string; name: string; odLimit: number; openingBalance: number; type: string }[]
  row: { updatedAt: string; updatedBy: string }
  summary: { apCost: number; apExpense: number; ar: number; netOther: number; stock: number }
}

type HistoricalPayload = {
  months: { label: string; month: number; year: number }[]
  rows: { amount: number; categoryId: string; categoryLabel: string; metricType: string; month: number; refNo: string; year: number }[]
  summary: { cashflow: number; expense: number; pnl: number; total: number }
}

export function LoanContractsPageClient() {
  const { data, error, isLoading } = useApi<LoanContractsPayload>('/api/finance-accounting/loan-contracts')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [type, setType] = useState('all')
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      const matchesSearch = !needle || [row.contractNo, row.lenderName, row.loanType].join(' ').toLowerCase().includes(needle)
      return matchesSearch && (status === 'all' || row.status === status) && (type === 'all' || row.loanType === type)
    })
  }, [data?.rows, search, status, type])

  return (
    <section className="space-y-4">
      <Hero actions={<><DisabledButton>📥 Template</DisabledButton><DisabledButton>📤 Import Excel</DisabledButton><DisabledButton strong>+ เพิ่มสัญญา</DisabledButton></>} subtitle="BSL · Leasing · Hire Purchase · Bank Loan · OD · FCD Loan · Director Loan" title="🏦 Loan / Leasing / BSL Contracts" tone="loan" />
      {error ? <ErrorBox message={error} /> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="จำนวนสัญญา" value={data?.summary.count ?? 0} />
        <StatCard label="วงเงินรวม" value={formatMoney(data?.summary.financed)} tone="blue" />
        <StatCard label="หนี้คงเหลือ" value={formatMoney(data?.summary.outstanding)} tone="cyan" />
        <StatCard label="เกินกำหนด" value={formatMoney(data?.summary.overdue)} tone="red" />
      </div>
      <FilterPanel>
        <input className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="ค้นหา loanNo/contractNo/lender..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="all">Type: ทั้งหมด</option>
          {(data?.filters.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Status: ทั้งหมด</option>
          {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </FilterPanel>
      <TableShell>
        <table className="w-full text-xs">
          <thead className="bg-slate-100 text-slate-600"><tr><Th>เลขสัญญา</Th><Th>ผู้ให้กู้</Th><Th>ประเภท</Th><Th>Asset</Th><Th align="right">Financed</Th><Th align="right">คงเหลือ</Th><Th align="right">งวด</Th><Th align="center">จ่ายแล้ว</Th><Th>งวดถัดไป</Th><Th align="right">เกินกำหนด</Th><Th align="center">สถานะ</Th><Th align="center">actions</Th></tr></thead>
          <tbody>
            <LoadingOrEmpty colSpan={12} isLoading={isLoading} rows={rows.length} />
            {rows.map((row) => <tr key={row.contractNo} className="border-t border-slate-100 hover:bg-slate-50"><Td><span className="font-mono text-blue-700">{row.contractNo}</span></Td><Td>{row.lenderName}</Td><Td>{row.loanType}</Td><Td>-</Td><Td align="right">{formatMoney(row.principalAmount)}</Td><Td align="right" strong>{formatMoney(row.outstanding)}</Td><Td align="right">{formatMoney(row.installmentAmount)}</Td><Td align="center">{row.duePaid}/{row.dueTotal}</Td><Td>{row.nextDue || '-'}</Td><Td align="right">{formatMoney(row.overdue)}</Td><Td align="center"><StatusPill status={row.status} /></Td><Td align="center"><div className="flex justify-end gap-2"><InlineDisabledButton>Generate Schedule</InlineDisabledButton><InlineDisabledButton>Schedule</InlineDisabledButton></div></Td></tr>)}
          </tbody>
        </table>
      </TableShell>
    </section>
  )
}

export function LoanDashboardPageClient() {
  const { data, error, isLoading } = useApi<LoanDashboardPayload>('/api/finance-accounting/loan-dashboard')
  const maxType = Math.max(...(data?.byType ?? []).map((row) => row.value), 0)
  return (
    <section className="space-y-4">
      <Hero subtitle="Total Outstanding · Due · Overdue · Interest · Next 7/30 days" title="📊 Loan / Leasing Dashboard" tone="dashboard" />
      {error ? <ErrorBox message={error} /> : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-700 p-6 text-white shadow-lg lg:col-span-2">
          <div className="text-sm uppercase opacity-80">💼 ภาระหนี้รวม Total Outstanding</div>
          <div className="mt-2 text-4xl font-bold md:text-5xl">{formatMoney(data?.summary.totalOutstanding)}</div>
          <div className="mt-1 text-sm opacity-90">บาท · ทุกประเภทสินเชื่อ</div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/20 pt-4 text-sm"><MiniHero label="ครบเดือนนี้" value={formatMoney(data?.summary.dueThisMonth)} /><MiniHero label="เกินกำหนด" value={formatMoney(data?.summary.overdueAmount)} tone="red" /><MiniHero label="ดอกเบี้ยเดือนนี้" value={formatMoney(data?.summary.interestThisMonth)} tone="amber" /></div>
        </div>
        <Panel title="🥧 สัดส่วนหนี้ตามประเภท">{(data?.byType ?? []).map((row) => <Bar key={row.label} color="bg-blue-500" label={row.label} max={maxType} value={row.value} />)} {!isLoading && (data?.byType.length ?? 0) === 0 ? <EmptyText>ยังไม่มีข้อมูลสินเชื่อ</EmptyText> : null}</Panel>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Outstanding" value={formatMoney(data?.summary.totalOutstanding)} tone="blue" />
        <StatCard label="ครบเดือนนี้" value={formatMoney(data?.summary.dueThisMonth)} tone="amber" />
        <StatCard label="เกินกำหนด" value={formatMoney(data?.summary.overdueAmount)} tone="red" />
        <StatCard label="ดอกเบี้ยเดือนนี้" value={formatMoney(data?.summary.interestThisMonth)} tone="amber" />
        <StatCard label="งวดใน 7 วัน" value={data?.summary.due7 ?? 0} tone="cyan" />
        <StatCard label="งวดใน 30 วัน" value={data?.summary.due30 ?? 0} tone="blue" />
      </div>
      <Panel title="📊 ภาระหนี้แยกตามประเภท">{(data?.byType ?? []).map((row) => <Bar key={row.label} color="bg-cyan-500" label={row.label} max={data?.summary.totalOutstanding ?? 0} value={row.value} />)} {!isLoading && (data?.byType.length ?? 0) === 0 ? <EmptyText>ยังไม่มีข้อมูลสินเชื่อ</EmptyText> : null}</Panel>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="💰 จ่ายเดือนนี้: เงินต้น vs ดอกเบี้ย"><div className="grid grid-cols-2 gap-3"><StatCard label="เงินต้น" value={formatMoney(data?.summary.principalThisMonth)} tone="blue" /><StatCard label="ดอกเบี้ย" value={formatMoney(data?.summary.interestThisMonth)} tone="amber" /></div><div className="mt-2 text-center text-xs text-slate-500">งวดใน 7 วัน: <b className="text-amber-700">{data?.summary.due7 ?? 0}</b> · 30 วัน: <b className="text-blue-700">{data?.summary.due30 ?? 0}</b></div></Panel>
        <Panel title="🚨 Status สรุป"><div className="space-y-3"><AlertLine label="ยอดเกินกำหนด" tone="red" value={formatMoney(data?.summary.overdueAmount)} /><AlertLine label="ครบเดือนนี้" tone="amber" value={formatMoney(data?.summary.dueThisMonth)} /><AlertLine label="งวดที่ต้องจ่าย 30 วัน" tone="blue" value={data?.summary.due30 ?? 0} /></div></Panel>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2"><DueTable isLoading={isLoading} rows={data?.upcomingDue ?? []} title="⏰ งวดที่จะครบใน 30 วัน" tone="amber" /><DueTable isLoading={isLoading} rows={data?.overdueList ?? []} title="⚠ งวดเกินกำหนด" tone="red" /></div>
    </section>
  )
}

export function EquityMaintenancePageClient() {
  const { data, error, isLoading } = useApi<EquityPayload>('/api/finance-accounting/equity-maint')
  const row = data?.row
  return (
    <section className="space-y-4">
      <Hero subtitle="ใช้คำนวณ Total Equity ในงบดุล (Current Year P&L คำนวณอัตโนมัติจาก Transactions)" title="👑 Equity / ทุนจดทะเบียน & ส่วนของผู้ถือหุ้น" tone="equity" />
      {error ? <ErrorBox message={error} /> : null}
      <div className="max-w-xl rounded-xl bg-white p-5 shadow">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ReadField label="ทุนจดทะเบียน" value={formatMoney(row?.registeredCapital)} />
          <ReadField label="ทุนชำระแล้ว (Paid-up)" value={formatMoney(row?.paidUpCapital)} />
          <ReadField label="กำไรสะสม (ปีก่อน)" value={formatMoney(row?.retainedEarnings)} />
          <ReadField label="Owner Adjustment" value={formatMoney(row?.ownerEquityAdjustment)} />
        </div>
        <div className="mt-4 rounded-lg bg-purple-50 p-3 text-sm text-purple-800">Total Equity: <b>{formatMoney(row?.totalEquity)}</b></div>
        <button className="mt-4 rounded-lg bg-purple-600 px-5 py-2 font-bold text-white opacity-60" disabled type="button">{isLoading ? 'กำลังโหลด' : 'บันทึก'}</button>
      </div>
    </section>
  )
}

export function OpeningBalancePageClient() {
  const { data, error } = useApi<OpeningPayload>('/api/finance-accounting/opening-balance')
  const tabs = ['⚙️ Setup', '💵 Cash/Bank/FCD/OD', '📥 AR ลูกหนี้', '📦 AP ต้นทุน', '💸 AP ค่าใช้จ่าย', '📦 Stock', '🏗️ Fixed Asset', '🏦 Loan', '🧾 VAT/WHT', '➕ Other', '👑 Equity/YTD', '⚖️ BS Check + Lock']
  return (
    <section className="space-y-4">
      <Hero subtitle="ตั้งยอดก่อนเริ่มใช้ระบบจริง · Cash/Bank/FCD/OD · AR/AP · Stock · Fixed Asset · Loan · VAT/WHT · Equity" title="🚀 Opening Balance / ตั้งต้นยอดก่อน Go-Live" tone="opening" />
      {error ? <ErrorBox message={error} /> : null}
      <div className="flex flex-wrap gap-2 rounded-xl bg-white p-3 shadow"><DisabledButton strong>💾 Save ทันที</DisabledButton><DisabledButton>☁️ ⬆ Push to Cloud</DisabledButton>{tabs.map((tab, index) => <span key={tab} className={`rounded px-3 py-2 text-sm ${index === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{tab}</span>)}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><StatCard label="AR" value={formatMoney(data?.summary.ar)} tone="blue" /><StatCard label="AP Cost" value={formatMoney(data?.summary.apCost)} tone="red" /><StatCard label="AP Expense" value={formatMoney(data?.summary.apExpense)} tone="red" /><StatCard label="Stock" value={formatMoney(data?.summary.stock)} tone="amber" /><StatCard label="Net Other" value={formatMoney(data?.summary.netOther)} /></div>
      <Panel title="⚙️ Setup ข้อมูลพื้นฐาน"><div className="grid grid-cols-2 gap-3 text-sm"><ReadField label="Cutoff Date" value="2026-04-30" /><ReadField label="Go-Live Date" value="2026-05-01" /></div><div className="mt-3 text-xs text-slate-400">Updated: {data?.row.updatedAt || '-'}</div></Panel>
      <TableShell>
        <table className="w-full text-xs"><thead className="bg-slate-100 text-slate-600"><tr><Th>เลขที่บัญชี</Th><Th>ชื่อบัญชี</Th><Th>ประเภท</Th><Th>สาขา/คลัง</Th><Th>Currency</Th><Th align="right">Opening Balance</Th><Th align="right">OD Limit</Th></tr></thead><tbody><LoadingOrEmpty colSpan={7} isLoading={false} rows={data?.accounts.length ?? 0} />{(data?.accounts ?? []).map((account) => <tr key={`${account.code || account.name}-${account.name}`} className="border-t border-slate-100"><Td><span className="font-mono">{account.code || '-'}</span></Td><Td>{account.name}</Td><Td>{account.type}</Td><Td>{account.branchName || account.branchCode || '-'}</Td><Td>{account.currency}</Td><Td align="right">{formatMoney(account.openingBalance)}</Td><Td align="right">{formatMoney(account.odLimit)}</Td></tr>)}</tbody></table>
      </TableShell>
    </section>
  )
}

export function HistoricalDataPageClient() {
  const { data, error, isLoading } = useApi<HistoricalPayload>('/api/finance-accounting/historical-data')
  const [tab, setTab] = useState<'expense' | 'pnl' | 'cashflow'>('expense')
  const rows = (data?.rows ?? []).filter((row) => row.metricType === tab)
  return (
    <section className="space-y-4">
      <div className="rounded border-l-4 border-blue-400 bg-blue-50 p-4">
        <h1 className="mb-2 text-xl font-bold text-slate-900">📅 ข้อมูลย้อนหลัง ม.ค.-เม.ย. 2026 (ก่อน Go-Live)</h1>
        <p className="text-sm text-gray-700">ใช้คีย์ตัวเลขย้อนหลังเป็น baseline เพื่อเปรียบเทียบกับข้อมูลจริงตั้งแต่ พ.ค. 2026 (Go-Live)</p>
        <div className="mt-2 text-xs text-blue-700">📊 มีข้อมูลแล้ว: Expense {data?.summary.expense ?? 0} cells · P&amp;L {data?.summary.pnl ?? 0} cells · CashFlow {data?.summary.cashflow ?? 0} cells (รวม {data?.summary.total ?? 0})</div>
      </div>
      {error ? <ErrorBox message={error} /> : null}
      <div className="flex flex-wrap gap-2"><TabButton active={tab === 'expense'} onClick={() => setTab('expense')}>💰 ค่าใช้จ่าย (Expenses)</TabButton><TabButton active={tab === 'pnl'} onClick={() => setTab('pnl')}>📈 งบกำไรขาดทุน (P&amp;L)</TabButton><TabButton active={tab === 'cashflow'} onClick={() => setTab('cashflow')}>💵 งบกระแสเงินสด (Cash Flow)</TabButton></div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600"><span>{tab === 'expense' ? 'กรอกค่าใช้จ่ายแต่ละหมวด — แต่ละเดือน' : tab === 'pnl' ? 'กรอกตัวเลขสรุป P&L แต่ละเดือน' : 'กรอก Cash Flow แต่ละเดือน'}</span><div className="flex gap-2"><DisabledButton>🗑 ล้าง tab นี้</DisabledButton><DisabledButton strong>💾 บันทึก + Sync Cloud</DisabledButton></div></div>
      <TableShell>
        <table className="w-full text-xs"><thead className="bg-gray-100"><tr><Th>รายการ</Th>{(data?.months ?? []).map((month) => <Th key={month.label} align="right">{month.label}</Th>)}<Th align="right">รวม 4 เดือน</Th></tr></thead><tbody><HistoricalRows isLoading={isLoading} months={data?.months ?? []} rows={rows} /></tbody></table>
      </TableShell>
    </section>
  )
}

function useApi<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    setIsLoading(true)
    dailyFetchJson<T>(url).then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')).finally(() => setIsLoading(false))
  }, [url])
  return { data, error, isLoading }
}

function Hero({ actions, subtitle, title, tone }: { actions?: ReactNode; subtitle: string; title: string; tone: 'dashboard' | 'equity' | 'loan' | 'opening' }) {
  const tones = { dashboard: 'from-cyan-700 to-blue-800', equity: 'from-purple-700 to-pink-700', loan: 'from-blue-700 to-cyan-700', opening: 'from-indigo-700 to-blue-700' }
  return <div className={`flex flex-col gap-4 rounded-xl bg-gradient-to-r ${tones[tone]} p-5 text-white shadow md:flex-row md:items-center md:justify-between`}><div><h1 className="text-xl font-bold md:text-2xl">{title}</h1><p className="mt-1 text-sm text-white/85">{subtitle}</p></div>{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}</div>
}

function DisabledButton({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <button className={`${strong ? 'bg-white text-slate-800' : 'bg-white/15 text-white'} rounded-lg px-3 py-2 text-sm font-bold shadow-sm opacity-60`} disabled type="button">{children}</button>
}

function InlineDisabledButton({ children }: { children: ReactNode }) {
  return <button className="whitespace-nowrap text-xs font-medium text-blue-600 opacity-50" disabled type="button">{children}</button>
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow">{children}</div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-xl bg-white p-4 shadow"><h2 className="mb-3 text-sm font-bold text-slate-700">{title}</h2>{children}</div>
}

function TableShell({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-xl bg-white shadow"><div className="max-h-[60vh] overflow-auto">{children}</div></div>
}

function StatCard({ label, tone, value }: { label: string; tone?: 'amber' | 'blue' | 'cyan' | 'red'; value: number | string }) {
  const color = tone === 'blue' ? 'text-blue-700' : tone === 'cyan' ? 'text-cyan-700' : tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'
  return <div className="rounded-xl bg-white p-4 shadow"><div className={`text-xs ${color}`}>{label}</div><div className={`mt-1 text-xl font-bold ${color}`}>{value}</div></div>
}

function MiniHero({ label, tone, value }: { label: string; tone?: 'amber' | 'red'; value: string }) {
  const color = tone === 'red' ? 'text-red-200' : tone === 'amber' ? 'text-yellow-200' : 'text-amber-200'
  return <div><div className="text-[10px] opacity-75">{label}</div><div className={`text-lg font-bold ${color}`}>{value}</div></div>
}

function Bar({ color, label, max, value }: { color: string; label: string; max: number; value: number }) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return <div className="mb-2 text-xs"><div className="mb-1 flex justify-between"><span>{label}</span><b>{formatMoney(value)}</b></div><div className="h-3 rounded-full bg-slate-100"><div className={`h-3 rounded-full ${color}`} style={{ width: `${width}%` }} /></div></div>
}

function DueTable({ isLoading, rows, title, tone }: { isLoading: boolean; rows: DueRow[]; title: string; tone: 'amber' | 'red' }) {
  const heading = tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
  return <div className="rounded-xl bg-white shadow"><div className={`border-b p-3 font-bold ${heading}`}>{title} ({rows.length})</div><div className="max-h-96 overflow-x-auto"><table className="w-full text-xs"><thead className="sticky top-0 bg-slate-100"><tr><Th>Due</Th><Th>สัญญา</Th><Th>ผู้ให้กู้</Th><Th align="right">ยอด</Th></tr></thead><tbody><LoadingOrEmpty colSpan={4} isLoading={isLoading} rows={rows.length} emptyText="ไม่มี" />{rows.map((row) => <tr key={row.id} className="border-t"><Td>{row.dueDate}</Td><Td><span className="font-mono">{row.contractNo}</span></Td><Td>{row.lenderName}</Td><Td align="right" strong>{formatMoney(row.totalDueAmount - row.paidAmount)}</Td></tr>)}</tbody></table></div></div>
}

function AlertLine({ label, tone, value }: { label: string; tone: 'amber' | 'blue' | 'red'; value: number | string }) {
  const color = tone === 'red' ? 'border-red-500 text-red-600' : tone === 'amber' ? 'border-amber-500 text-amber-600' : 'border-blue-500 text-blue-600'
  return <div className={`rounded-lg border-l-4 bg-white p-3 ${color}`}><div className="flex items-center justify-between"><span className="text-xs text-slate-600">{label}</span><span className="text-xl font-bold">{value}</span></div></div>
}

function ReadField({ label, value }: { label: string; value: string }) {
  return <label className="block"><span className="text-xs text-slate-500">{label}</span><input className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1.5 text-right" readOnly value={value} /></label>
}

function HistoricalRows({ isLoading, months, rows }: { isLoading: boolean; months: HistoricalPayload['months']; rows: HistoricalPayload['rows'] }) {
  const categories = Array.from(new Set(rows.map((row) => row.categoryLabel))).sort()
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={months.length + 2}>กำลังโหลดข้อมูล</td></tr>
  if (categories.length === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={months.length + 2}>ยังไม่มีข้อมูลย้อนหลัง</td></tr>
  return categories.map((category) => {
    const total = months.reduce((sum, month) => sum + (rows.find((row) => row.categoryLabel === category && row.month === month.month && row.year === month.year)?.amount ?? 0), 0)
    return <tr key={category} className="border-t hover:bg-blue-50"><Td>{category}</Td>{months.map((month) => <Td key={month.label} align="right">{formatMoney(rows.find((row) => row.categoryLabel === category && row.month === month.month && row.year === month.year)?.amount)}</Td>)}<Td align="right" strong>{formatMoney(total)}</Td></tr>
  })
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return <button className={`rounded-t-lg px-4 py-2 font-semibold ${active ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`} type="button" onClick={onClick}>{children}</button>
}

function LoadingOrEmpty({ colSpan, emptyText = 'ยังไม่มีข้อมูล', isLoading, rows }: { colSpan: number; emptyText?: string; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>{emptyText}</td></tr>
  return null
}

function Th({ align = 'left', children }: { align?: 'center' | 'left' | 'right'; children: ReactNode }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`whitespace-nowrap px-3 py-2 font-semibold ${textAlign}`}>{children}</th>
}

function Td({ align = 'left', children, strong = false }: { align?: 'center' | 'left' | 'right'; children: ReactNode; strong?: boolean }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`whitespace-nowrap px-3 py-2 ${textAlign} ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>{children}</td>
}

function StatusPill({ status }: { status: string }) {
  const color = status === 'Active' ? 'bg-emerald-50 text-emerald-700' : status === 'Closed' ? 'bg-blue-50 text-blue-700' : status === 'Overdue' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${color}`}>{status}</span>
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="text-sm text-slate-400">{children}</div>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
