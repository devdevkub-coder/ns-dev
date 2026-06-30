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
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  useEffect(() => {
    setPage(1)
  }, [search, status, type])
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return (data?.rows ?? []).filter((row) => {
      const matchesSearch = !needle || [row.contractNo, row.lenderName, row.loanType].join(' ').toLowerCase().includes(needle)
      return matchesSearch && (status === 'all' || row.status === status) && (type === 'all' || row.loanType === type)
    })
  }, [data?.rows, search, status, type])

  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, currentPage, pageSize])

  return (
    <section className="space-y-4">
      {/* Desktop Actions */}
      <div className="hidden lg:flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <DisabledButton>📥 Template</DisabledButton>
        <DisabledButton>📤 Import Excel</DisabledButton>
        <div className="ml-auto">
          <button 
            type="button" 
            disabled
            className="h-9 px-4 rounded-lg bg-blue-600/50 text-white text-sm font-semibold opacity-60 cursor-not-allowed outline-none"
          >
            + เพิ่มสัญญา
          </button>
        </div>
      </div>
      {error ? <ErrorBox message={error} /> : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="จำนวนสัญญา" value={data?.summary.count ?? 0} />
        <StatCard label="วงเงินรวม" value={formatMoney(data?.summary.financed)} tone="blue" />
        <StatCard label="หนี้คงเหลือ" value={formatMoney(data?.summary.outstanding)} tone="cyan" />
        <StatCard label="เกินกำหนด" value={formatMoney(data?.summary.overdue)} tone="red" />
      </div>

      {/* Desktop Filter Panel */}
      <div className="hidden lg:flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-sm border border-slate-200">
        <input autoComplete="off" className="min-w-0 flex-1 h-9 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-400 transition" placeholder="ค้นหา loanNo/contractNo/lender..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400 transition cursor-pointer" value={type} onChange={(event) => setType(event.target.value)}>
          <option value="all">Type: ทั้งหมด</option>
          {(data?.filters.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-slate-400 transition cursor-pointer" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Status: ทั้งหมด</option>
          {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="mb-4 rounded-xl border border-slate-200/60 bg-white p-3 shadow-sm lg:hidden space-y-3">
        <div className="flex gap-2 items-center">
          <input 
            autoComplete="off" className="flex-1 h-9 rounded-lg border border-slate-300 px-3 text-xs outline-none bg-white placeholder-slate-400 focus:border-slate-400 transition" 
            placeholder="ค้นหา loanNo/contractNo/lender..." 
            type="search" 
            value={search} 
            onChange={(event) => setSearch(event.target.value)} 
          />
          <button
            type="button"
            className="h-9 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition outline-none"
            onClick={() => setShowMobileFilters(true)}
          >
            ตัวกรอง {(type !== 'all' || status !== 'all') ? '(มี)' : ''}
          </button>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden">
          <div className="w-full rounded-t-2xl bg-white p-5 shadow-xl border-t border-slate-200 max-h-[85vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="font-bold text-slate-800 text-sm">ตัวกรองเพิ่มเติม</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-2xl font-bold focus:outline-none"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">ประเภทสัญญา</label>
                <select
                  aria-label="Type select"
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  <option value="all">Type: ทั้งหมด</option>
                  {(data?.filters.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-slate-600 text-xs">สถานะสัญญา</label>
                <select
                  aria-label="Status select"
                  className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm outline-none focus:border-slate-400 transition cursor-pointer"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="all">Status: ทั้งหมด</option>
                  {(data?.filters.statuses ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div className="border-t border-slate-100 pt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled
                  className="w-full h-10 rounded-lg bg-slate-100 text-slate-400 font-semibold text-xs cursor-not-allowed flex items-center justify-center gap-1.5 opacity-60"
                >
                  📥 Template
                </button>
                <button
                  type="button"
                  disabled
                  className="w-full h-10 rounded-lg bg-slate-100 text-slate-400 font-semibold text-xs cursor-not-allowed flex items-center justify-center gap-1.5 opacity-60"
                >
                  📤 Import Excel
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setType('all')
                  setStatus('all')
                }}
                className="flex-1 h-10 rounded-lg border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition"
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 h-10 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition"
              >
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Pagination Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="จำนวนรายการต่อหน้า"
            className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={pageSize}
            onChange={(event) => setPageSize(Number(event.target.value))}
          >
            {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
          </select>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={currentPage <= 1}
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            ก่อนหน้า
          </button>
          <span className="px-1">หน้า {currentPage} / {totalPages}</span>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            disabled={currentPage >= totalPages}
            type="button"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            ถัดไป
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <TableShell>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><Th>เลขสัญญา</Th><Th>ผู้ให้กู้</Th><Th>ประเภท</Th><Th>Asset</Th><Th align="right">Financed</Th><Th align="right">คงเหลือ</Th><Th align="right">งวด</Th><Th align="center">จ่ายแล้ว</Th><Th>งวดถัดไป</Th><Th align="right">เกินกำหนด</Th><Th align="center">สถานะ</Th><Th align="center">actions</Th></tr></thead>
            <tbody>
              <LoadingOrEmpty colSpan={12} isLoading={isLoading} rows={rows.length} />
              {pagedRows.map((row) => <tr key={row.contractNo} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors"><Td><span className="font-mono text-blue-700">{row.contractNo}</span></Td><Td>{row.lenderName}</Td><Td>{row.loanType}</Td><Td>-</Td><Td align="right">{formatMoney(row.principalAmount)}</Td><Td align="right" className="font-bold">{formatMoney(row.outstanding)}</Td><Td align="right">{formatMoney(row.installmentAmount)}</Td><Td align="center">{row.duePaid}/{row.dueTotal}</Td><Td>{row.nextDue || '-'}</Td><Td align="right">{formatMoney(row.overdue)}</Td><Td align="center"><StatusPill status={row.status} /></Td><Td align="center"><div className="flex justify-end gap-2"><InlineDisabledButton>Generate Schedule</InlineDisabledButton><InlineDisabledButton>Schedule</InlineDisabledButton></div></Td></tr>)}
            </tbody>
          </table>
        </TableShell>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 text-xs font-semibold text-slate-500 bg-slate-50">รายการสัญญาเงินกู้</div>
        {isLoading && <div className="p-4 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>}
        {!isLoading && rows.length === 0 && <div className="p-4 text-center text-slate-400 text-xs">ไม่มีสัญญา</div>}
        {!isLoading && pagedRows.map((row) => (
          <div key={row.contractNo} className="p-4 space-y-2 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="font-mono text-blue-700 font-semibold text-sm block">{row.contractNo}</span>
                <span className="text-slate-400 block mt-0.5">{row.lenderName} · {row.loanType}</span>
              </div>
              <StatusPill status={row.status} />
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50">
              <div><span className="text-slate-400 block">วงเงิน (Financed)</span><span className="font-semibold text-slate-800">{formatMoney(row.principalAmount)}</span></div>
              <div><span className="text-slate-400 block">ยอดคงเหลือ</span><span className="font-bold text-slate-900">{formatMoney(row.outstanding)}</span></div>
              <div><span className="text-slate-400 block">งวดผ่อนชำระ</span><span className="font-semibold text-slate-800">{formatMoney(row.installmentAmount)}</span></div>
              <div><span className="text-slate-400 block">ชำระแล้ว</span><span className="font-medium text-slate-700">{row.duePaid}/{row.dueTotal} งวด</span></div>
              <div><span className="text-slate-400 block">งวดถัดไป</span><span className="font-medium text-slate-700">{row.nextDue || '-'}</span></div>
              <div><span className="text-slate-400 block">เกินกำหนด</span><span className="font-bold text-red-600">{formatMoney(row.overdue)}</span></div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <InlineDisabledButton>Generate Schedule</InlineDisabledButton>
              <InlineDisabledButton>Schedule</InlineDisabledButton>
            </div>
          </div>
        ))}
      </div>


    </section>
  )
}

export function LoanDashboardPageClient() {
  const { data, error, isLoading } = useApi<LoanDashboardPayload>('/api/finance-accounting/loan-dashboard')
  const maxType = Math.max(...(data?.byType ?? []).map((row) => row.value), 0)
  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-700 p-6 text-white shadow-lg lg:col-span-2">
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
      {error ? <ErrorBox message={error} /> : null}
      <div className="max-w-xl rounded-md bg-white p-5 shadow">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <ReadField label="ทุนจดทะเบียน" value={formatMoney(row?.registeredCapital)} />
          <ReadField label="ทุนชำระแล้ว (Paid-up)" value={formatMoney(row?.paidUpCapital)} />
          <ReadField label="กำไรสะสม (ปีก่อน)" value={formatMoney(row?.retainedEarnings)} />
          <ReadField label="Owner Adjustment" value={formatMoney(row?.ownerEquityAdjustment)} />
        </div>
        <div className="mt-4 rounded-md bg-purple-50 p-3 text-sm text-purple-800">Total Equity: <b>{formatMoney(row?.totalEquity)}</b></div>
        <button className="mt-4 rounded-md bg-purple-600 px-5 py-2 font-bold text-white opacity-60" disabled type="button">{isLoading ? 'กำลังโหลด' : 'บันทึก'}</button>
      </div>
    </section>
  )
}

export function OpeningBalancePageClient() {
  const { data, error } = useApi<OpeningPayload>('/api/finance-accounting/opening-balance')
  const tabs = ['⚙️ Setup', '💵 Cash/Bank/FCD/OD', '📥 AR ลูกหนี้', '📦 AP ต้นทุน', '💸 AP ค่าใช้จ่าย', '📦 Stock', '🏗️ Fixed Asset', '🏦 Loan', '🧾 VAT/WHT', '➕ Other', '👑 Equity/YTD', '⚖️ BS Check + Lock']
  return (
    <section className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}
      <div className="flex flex-wrap gap-2 rounded-md bg-white p-3 shadow"><DisabledButton strong>💾 Save ทันที</DisabledButton><DisabledButton>☁️ ⬆ Push to Cloud</DisabledButton>{tabs.map((tab, index) => <span key={tab} className={`rounded-md px-3 py-2 text-sm ${index === 0 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{tab}</span>)}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5"><StatCard label="AR" value={formatMoney(data?.summary.ar)} tone="blue" /><StatCard label="AP Cost" value={formatMoney(data?.summary.apCost)} tone="red" /><StatCard label="AP Expense" value={formatMoney(data?.summary.apExpense)} tone="red" /><StatCard label="Stock" value={formatMoney(data?.summary.stock)} tone="amber" /><StatCard label="Net Other" value={formatMoney(data?.summary.netOther)} /></div>
      <Panel title="⚙️ Setup ข้อมูลพื้นฐาน"><div className="grid grid-cols-2 gap-3 text-sm"><ReadField label="Cutoff Date" value="2026-04-30" /><ReadField label="Go-Live Date" value="2026-05-01" /></div><div className="mt-3 text-xs text-slate-400">Updated: {data?.row.updatedAt || '-'}</div></Panel>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <TableShell>
          <table className="w-full text-xs"><thead className="bg-slate-50 border-b border-slate-100 text-slate-500"><tr><Th>เลขที่บัญชี</Th><Th>ชื่อบัญชี</Th><Th>ประเภท</Th><Th>สาขา/คลัง</Th><Th>Currency</Th><Th align="right">Opening Balance</Th><Th align="right">OD Limit</Th></tr></thead><tbody><LoadingOrEmpty colSpan={7} isLoading={false} rows={data?.accounts.length ?? 0} />{(data?.accounts ?? []).map((account) => <tr key={`${account.code || account.name}-${account.name}`} className="border-t border-slate-100"><Td><span className="font-mono">{account.code || '-'}</span></Td><Td>{account.name}</Td><Td>{account.type}</Td><Td>{account.branchName || account.branchCode || '-'}</Td><Td>{account.currency}</Td><Td align="right">{formatMoney(account.openingBalance)}</Td><Td align="right">{formatMoney(account.odLimit)}</Td></tr>)}</tbody></table>
        </TableShell>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 text-xs font-semibold text-slate-500 bg-slate-50">บัญชีและยอดเปิดบัญชี</div>
        {(!data?.accounts || data.accounts.length === 0) && <div className="p-4 text-center text-slate-400 text-xs">ไม่มีข้อมูล</div>}
        {(data?.accounts ?? []).map((account) => (
          <div key={`${account.code || account.name}-${account.name}`} className="p-4 space-y-2 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <span className="font-semibold text-slate-900 text-sm block">{account.name}</span>
                <span className="font-mono text-slate-500 block text-xs mt-0.5">{account.code || '-'} · {account.type}</span>
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{account.currency}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50/50 p-2.5 text-slate-600 rounded">
              <div><span className="text-slate-400">สาขา/คลัง:</span> {account.branchName || account.branchCode || '-'}</div>
              <div><span className="text-slate-400">OD Limit:</span> {formatMoney(account.odLimit)}</div>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-slate-100/50">
              <span className="text-slate-400 font-medium">Opening Balance</span>
              <span className="font-bold text-slate-900 text-sm">{formatMoney(account.openingBalance)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function HistoricalDataPageClient() {
  const { data, error, isLoading } = useApi<HistoricalPayload>('/api/finance-accounting/historical-data')
  const [tab, setTab] = useState<'expense' | 'pnl' | 'cashflow'>('expense')
  const rows = (data?.rows ?? []).filter((row) => row.metricType === tab)
  return (
    <section className="space-y-4">
      <div className="rounded-md border-l-4 border-blue-400 bg-blue-50 p-4">
        <h1 className="mb-2 text-xl font-bold text-slate-900">📅 ข้อมูลย้อนหลัง ม.ค.-เม.ย. 2026 (ก่อน Go-Live)</h1>
        <p className="text-sm text-gray-700">ใช้คีย์ตัวเลขย้อนหลังเป็น baseline เพื่อเปรียบเทียบกับข้อมูลจริงตั้งแต่ พ.ค. 2026 (Go-Live)</p>
        <div className="mt-2 text-xs text-blue-700">📊 มีข้อมูลแล้ว: Expense {data?.summary.expense ?? 0} cells · P&amp;L {data?.summary.pnl ?? 0} cells · CashFlow {data?.summary.cashflow ?? 0} cells (รวม {data?.summary.total ?? 0})</div>
      </div>
      {error ? <ErrorBox message={error} /> : null}
      <div className="flex flex-wrap gap-2"><TabButton active={tab === 'expense'} onClick={() => setTab('expense')}>💰 ค่าใช้จ่าย (Expenses)</TabButton><TabButton active={tab === 'pnl'} onClick={() => setTab('pnl')}>📈 งบกำไรขาดทุน (P&amp;L)</TabButton><TabButton active={tab === 'cashflow'} onClick={() => setTab('cashflow')}>💵 งบกระแสเงินสด (Cash Flow)</TabButton></div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600"><span>{tab === 'expense' ? 'กรอกค่าใช้จ่ายแต่ละหมวด — แต่ละเดือน' : tab === 'pnl' ? 'กรอกตัวเลขสรุป P&L แต่ละเดือน' : 'กรอก Cash Flow แต่ละเดือน'}</span><div className="flex gap-2"><DisabledButton>🗑 ล้าง tab นี้</DisabledButton><DisabledButton strong>💾 บันทึก + Sync Cloud</DisabledButton></div></div>
      {/* Desktop Table View */}
      <div className="hidden lg:block">
        <TableShell>
          <table className="w-full text-xs"><thead className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium"><tr><Th>รายการ</Th>{(data?.months ?? []).map((month) => <Th key={month.label} align="right">{month.label}</Th>)}<Th align="right">รวม 4 เดือน</Th></tr></thead><tbody><HistoricalRows isLoading={isLoading} months={data?.months ?? []} rows={rows} /></tbody></table>
        </TableShell>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-slate-100 bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 text-xs font-semibold text-slate-500 bg-slate-50">ประวัติข้อมูลย้อนหลัง</div>
        <HistoricalRowsMobile isLoading={isLoading} months={data?.months ?? []} rows={rows} />
      </div>
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
    dailyFetchJson<T>(url)
      .then((payload) => { if (mounted) setData(payload) })
      .catch((caught) => { if (mounted) setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้') })
      .finally(() => { if (mounted) setIsLoading(false) })
    return () => { mounted = false }
  }, [url])
  return { data, error, isLoading }
}

function DisabledButton({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return <button className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${strong ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-50 border border-slate-100 text-slate-400 opacity-60'} outline-none focus:ring-0`} disabled type="button">{children}</button>
}

function InlineDisabledButton({ children }: { children: ReactNode }) {
  return <button className="whitespace-nowrap text-xs font-semibold text-blue-500 hover:text-blue-700 opacity-50 outline-none focus:ring-0" disabled type="button">{children}</button>
}

function FilterPanel({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">{children}</div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"><h2 className="mb-3 text-xs font-bold text-slate-800">{title}</h2>{children}</div>
}

function TableShell({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm"><div className="max-h-[60vh] overflow-auto">{children}</div></div>
}

function StatCard({ label, tone, value }: { label: string; tone?: 'amber' | 'blue' | 'cyan' | 'red'; value: number | string }) {
  const toneStyles = {
    blue: { text: 'text-blue-600', bg: 'bg-blue-50', icon: '💰' },
    cyan: { text: 'text-cyan-600', bg: 'bg-cyan-50', icon: '📊' },
    amber: { text: 'text-amber-600', bg: 'bg-amber-50', icon: '📈' },
    red: { text: 'text-red-600', bg: 'bg-red-50', icon: '📉' },
    default: { text: 'text-slate-600', bg: 'bg-slate-50', icon: '📋' }
  }
  const current = toneStyles[tone ?? 'default']
  return (
    <div className="bg-white p-3.5 border border-slate-100 rounded-xl shadow-sm flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full ${current.bg} ${current.text} flex items-center justify-center text-lg shrink-0`}>
        {current.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-slate-500 truncate uppercase">{label}</div>
        <div className="mt-0.5 text-sm sm:text-base font-bold text-slate-900 tracking-tight">{value}</div>
      </div>
    </div>
  )
}

function MiniHero({ label, tone, value }: { label: string; tone?: 'amber' | 'red'; value: string }) {
  const color = tone === 'red' ? 'text-red-600 font-bold' : tone === 'amber' ? 'text-amber-600 font-bold' : 'text-slate-800 font-bold'
  return (
    <div>
      <div className="text-xs text-slate-400 font-medium">{label}</div>
      <div className={`text-sm ${color}`}>{value}</div>
    </div>
  )
}

function Bar({ color, label, max, value }: { color: string; label: string; max: number; value: number }) {
  const width = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className="mb-3.5 text-xs">
      <div className="mb-1 flex justify-between">
        <span className="text-slate-650 font-medium">{label}</span>
        <b className="text-slate-800">{formatMoney(value)}</b>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function DueTable({ isLoading, rows, title, tone }: { isLoading: boolean; rows: DueRow[]; title: string; tone: 'amber' | 'red' }) {
  const heading = tone === 'red' ? 'border-red-105 bg-red-50/50 text-red-700' : 'border-amber-105 bg-amber-50/50 text-amber-700'
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className={`border-b px-4 py-3 font-bold text-xs ${heading}`}>{title} ({rows.length})</div>
      
      {/* Desktop Table View */}
      <div className="hidden lg:block max-h-96 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 text-slate-500 font-medium z-10">
            <tr>
              <Th>Due</Th><Th>สัญญา</Th><Th>ผู้ให้กู้</Th><Th align="right">ยอด</Th>
            </tr>
          </thead>
          <tbody>
            <LoadingOrEmpty colSpan={4} isLoading={isLoading} rows={rows.length} emptyText="ไม่มี" />
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors transition">
                <Td>{row.dueDate}</Td>
                <Td><span className="font-mono text-slate-800 font-semibold">{row.contractNo}</span></Td>
                <Td>{row.lenderName}</Td>
                <Td align="right" className="font-bold text-slate-900">{formatMoney(row.totalDueAmount - row.paidAmount)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="block lg:hidden divide-y divide-slate-100 max-h-96 overflow-auto">
        {isLoading && <div className="p-4 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>}
        {!isLoading && rows.length === 0 && <div className="p-4 text-center text-slate-400 text-xs">ไม่มีงวดที่ต้องชำระ</div>}
        {!isLoading && rows.map((row) => (
          <div key={row.id} className="p-3 space-y-1.5 text-xs hover:bg-slate-50/50 transition">
            <div className="flex justify-between items-center">
              <span className="font-semibold text-slate-900">{row.dueDate}</span>
              <span className="font-mono text-blue-700 font-semibold">{row.contractNo}</span>
            </div>
            <div className="flex justify-between items-center text-xs text-slate-500">
              <span>ผู้ให้กู้: {row.lenderName}</span>
              <span>ยอด: <b className="text-slate-800 font-bold">{formatMoney(row.totalDueAmount - row.paidAmount)}</b></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AlertLine({ label, tone, value }: { label: string; tone: 'amber' | 'blue' | 'red'; value: number | string }) {
  const map = {
    red: 'border-red-200 bg-red-50/30 text-red-800',
    amber: 'border-amber-200 bg-amber-50/30 text-amber-800',
    blue: 'border-blue-200 bg-blue-50/30 text-blue-800'
  }
  return (
    <div className={`rounded-xl border p-3.5 shadow-sm ${map[tone]} text-xs`}>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-600">{label}</span>
        <span className="text-sm font-bold tracking-tight text-slate-900">{value}</span>
      </div>
    </div>
  )
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      <span className="mb-1 block">{label}</span>
      <input className="w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 text-right text-xs outline-none focus:ring-0" readOnly value={value} />
    </label>
  )
}

function HistoricalRows({ isLoading, months, rows }: { isLoading: boolean; months: HistoricalPayload['months']; rows: HistoricalPayload['rows'] }) {
  const categories = Array.from(new Set(rows.map((row) => row.categoryLabel))).sort()
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={months.length + 2}>กำลังโหลดข้อมูล</td></tr>
  if (categories.length === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={months.length + 2}>ยังไม่มีข้อมูลย้อนหลัง</td></tr>
  return categories.map((category) => {
    const total = months.reduce((sum, month) => sum + (rows.find((row) => row.categoryLabel === category && row.month === month.month && row.year === month.year)?.amount ?? 0), 0)
    return (
      <tr key={category} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors transition">
        <Td className="font-medium">{category}</Td>
        {months.map((month) => (
          <Td key={month.label} align="right">{formatMoney(rows.find((row) => row.categoryLabel === category && row.month === month.month && row.year === month.year)?.amount)}</Td>
        ))}
        <Td align="right" className="font-bold text-slate-900">{formatMoney(total)}</Td>
      </tr>
    )
  })
}

function HistoricalRowsMobile({ isLoading, months, rows }: { isLoading: boolean; months: HistoricalPayload['months']; rows: HistoricalPayload['rows'] }) {
  const categories = Array.from(new Set(rows.map((row) => row.categoryLabel))).sort()
  if (isLoading) return <div className="p-8 text-center text-slate-400 text-xs">กำลังโหลดข้อมูล</div>
  if (categories.length === 0) return <div className="p-8 text-center text-slate-400 text-xs">ยังไม่มีข้อมูลย้อนหลัง</div>
  return categories.map((category) => {
    const total = months.reduce((sum, month) => sum + (rows.find((row) => row.categoryLabel === category && row.month === month.month && row.year === month.year)?.amount ?? 0), 0)
    return (
      <div key={category} className="p-4 space-y-2 text-xs hover:bg-slate-50/50 transition">
        <div className="font-semibold text-slate-900 text-sm">{category}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-slate-50/50 p-2.5 rounded-lg border border-slate-100/50 text-slate-650">
          {months.map((month) => {
            const val = rows.find((row) => row.categoryLabel === category && row.month === month.month && row.year === month.year)?.amount
            return (
              <div key={month.label} className="flex justify-between">
                <span>{month.label}:</span>
                <span className="font-medium text-slate-800">{formatMoney(val)}</span>
              </div>
            )
          })}
        </div>
        <div className="flex justify-between items-center pt-1.5 border-t border-slate-100/50">
          <span className="text-slate-400 font-medium">รวม 4 เดือน</span>
          <span className="font-bold text-slate-950">{formatMoney(total)}</span>
        </div>
      </div>
    )
  })
}

function TabButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={`rounded-lg px-4 py-2 text-xs font-bold transition outline-none focus:ring-0 ${active ? 'bg-[#0F172A] text-white hover:bg-slate-800 shadow-sm' : 'bg-slate-50 border border-slate-100 text-slate-650 hover:bg-slate-100'}`}
      type="button" 
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function LoadingOrEmpty({ colSpan, emptyText = 'ยังไม่มีข้อมูล', isLoading, rows }: { colSpan: number; emptyText?: string; isLoading: boolean; rows: number }) {
  if (isLoading) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>กำลังโหลดข้อมูล</td></tr>
  if (rows === 0) return <tr><td className="py-8 text-center text-slate-400" colSpan={colSpan}>{emptyText}</td></tr>
  return null
}

function Th({ align = 'left', children }: { align?: 'center' | 'left' | 'right'; children: ReactNode }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <th className={`whitespace-nowrap px-4 py-2.5 font-bold text-slate-600 bg-slate-50 border-b border-slate-100 ${textAlign}`}>{children}</th>
}

function Td({ align = 'left', children, className = '' }: { align?: 'center' | 'left' | 'right'; children: ReactNode; className?: string }) {
  const textAlign = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`whitespace-nowrap px-4 py-3 border-b border-slate-100/60 ${textAlign} text-slate-700 ${className}`}>{children}</td>
}

function StatusPill({ status }: { status: string }) {
  const color = status === 'Active' ? 'bg-emerald-50 text-emerald-700' : status === 'Closed' ? 'bg-blue-50 text-blue-700' : status === 'Overdue' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>{status}</span>
}

function EmptyText({ children }: { children: ReactNode }) {
  return <div className="text-xs text-slate-400 font-medium py-4 text-center">{children}</div>
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{message}</div>
}
