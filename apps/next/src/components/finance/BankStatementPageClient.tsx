'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { BranchSelectCombobox } from '@/components/ui/BranchSelectCombobox'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { KpiCard as SharedKpiCard } from '@/components/ui/KpiCard'
import { dailyFetchJson, formatMoney, todayDateInput } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'

type AccountOption = {
  accountGroup: string | null
  accountNo: string | null
  active: boolean | null
  bankAccountType: string | null
  bankName: string | null
  branchName: string
  code: string | null
  currency: string | null
  id: string
  name: string
  type: string
  subtype?: string | null
  odLimit?: number | null
}

type BankRow = {
  accountName: string
  accountNo: string
  amountIn: number
  amountOut: number
  bankName: string
  branchName: string
  cashFlowCategory: string
  bookFxRate: number | null
  date: string
  description: string
  id: string
  movement: number
  movementCurrencyCode: string
  nativeAmountIn: number
  nativeAmountOut: number
  note: string
  odUsed: number
  refNo: string
  refType: string
  reversalOfId: string | null
  runningBalance: number
  sourceEventKey: string
  sourceEventType: string
  type: string
}

type BankPayload = {
  byAccount: Array<{ accountId: string; accountName: string; amountIn: number; amountOut: number; balance: number; rows: number }>
  filters: { accounts: AccountOption[]; branches: Array<{ code: string; id: string; name: string }>; refTypes: string[]; types: string[] }
  pagination: { page: number; pageSize: number; totalPages: number; totalRows: number }
  rows: BankRow[]
  summary: { accounts: number; amountIn: number; amountOut: number; netMovement: number; rows: number }
}

const companyAccountTypeOptions = [
  { label: 'ทุกประเภทบัญชีบริษัท', value: '' },
  { label: 'เงินสด', value: 'cash' },
  { label: 'ธนาคาร', value: 'bank' },
]

const bankAccountTypeOptions = [
  { label: 'ทุกประเภทบัญชีธนาคาร', value: '' },
  { label: 'ออมทรัพย์', value: 'savings' },
  { label: 'กระแสรายวัน', value: 'current' },
]

type BankColumnKey = 'amountIn' | 'amountOut' | 'date' | 'description' | 'odRemaining' | 'odUsed' | 'refNo' | 'runningBalance' | 'type'
type SortDirection = 'asc' | 'desc'

function currentMonthStart() {
  return `${todayDateInput().slice(0, 8)}01`
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left ?? '').localeCompare(String(right ?? ''), 'th', { numeric: true, sensitivity: 'base' })
}

function bankAccountOptionLabel(account: AccountOption) {
  const accountNo = account.accountNo || '-'
  const bank = account.bankName || '-'
  const branch = account.branchName || '-'
  return `${accountNo} · ${account.name} · ${bank} · ${branch}`
}

function getBankSortValue(row: BankRow, key: BankColumnKey, odLimit: number) {
  if (key === 'description') return `${row.description} ${row.note}`
  if (key === 'odRemaining') return Math.max(0, odLimit - row.odUsed)
  if (key === 'odUsed') return row.odUsed
  if (key === 'refNo') return row.refNo || row.refType
  if (key === 'type') return row.type || row.refType
  return row[key]
}

export function BankStatementPageClient({ initialFilters }: { initialFilters?: { from?: string; q?: string; to?: string } } = {}) {
  const latestLoadRequestRef = useRef(0)
  const [accountId, setAccountId] = useState('')
  const [accountGroup, setAccountGroup] = useState('')
  const [bankAccountType, setBankAccountType] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [data, setData] = useState<BankPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(initialFilters?.from || currentMonthStart())
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState(initialFilters?.q || '')
  const [refType, setRefType] = useState('')
  const [selectedRow, setSelectedRow] = useState<BankRow | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [to, setTo] = useState(initialFilters?.to || todayDateInput())
  const [type, setType] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)


  const query = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '50',
      sortDirection,
    })
    if (branchCode) params.set('branchCode', branchCode)
    if (accountId) params.set('accountId', accountId)
    if (accountGroup) params.set('accountGroup', accountGroup)
    if (bankAccountType) params.set('bankAccountType', bankAccountType)
    if (from) params.set('from', from)
    if (q.trim()) params.set('q', q.trim())
    if (refType) params.set('refType', refType)
    if (to) params.set('to', to)
    if (type) params.set('type', type)
    return params
  }, [accountGroup, accountId, bankAccountType, branchCode, from, page, q, refType, sortDirection, to, type])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<BankPayload>(`/api/finance/bank?${query.toString()}`)
      if (latestLoadRequestRef.current !== requestId) return
      setData(payload)
    } catch (caught) {
      if (latestLoadRequestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'โหลด Bank Statement ไม่ได้')
    } finally {
      if (latestLoadRequestRef.current !== requestId) return
      setIsLoading(false)
    }
  }, [query])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (!accountId && data?.filters.accounts[0]?.id) {
      setAccountId(data.filters.accounts[0].id)
    }
  }, [accountId, data?.filters.accounts])

  function changeBranch(value: string) {
    setBranchCode(value)
    setAccountId('')
    setData(null)
    setPage(1)
  }

  function changeAccountGroup(value: string) {
    setAccountGroup(value)
    setBankAccountType('')
    setAccountId('')
    setData(null)
    setPage(1)
  }

  function changeBankAccountType(value: string) {
    setBankAccountType(value)
    setAccountId('')
    setData(null)
    setPage(1)
  }

  async function exportXlsx() {
    setIsExporting(true)
    setError(null)
    try {
      const exportQuery = new URLSearchParams(query)
      exportQuery.set('format', 'xlsx')
      const response = await fetch(`/api/finance/bank?${exportQuery.toString()}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Export Bank Statement ไม่สำเร็จ')
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `finance_bank_${todayDateInput()}.xlsx`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Export Bank Statement ไม่สำเร็จ')
    } finally {
      setIsExporting(false)
    }
  }

  const totalPages = data?.pagination.totalPages ?? 1
  const accounts = data?.filters.accounts ?? []
  const branches = data?.filters.branches ?? []
  const selectedAccount = accounts.find((account) => account.id === accountId) ?? null
  const selectedAccountSummary = data?.byAccount.find((row) => row.accountId === selectedAccount?.id) ?? null
  const displayRows = data?.rows ?? []
  const cashIn = data?.summary.amountIn ?? 0
  const cashOut = data?.summary.amountOut ?? 0
  const closingBalance = displayRows.at(-1)?.runningBalance ?? selectedAccountSummary?.balance ?? 0

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        {/* Desktop View */}
        <div className="hidden lg:flex flex-wrap items-center gap-2">
          <BranchSelectCombobox branches={branches.map((branch) => ({ id: branch.code, name: `${branch.code} - ${branch.name}` }))} className="w-[12rem]" controlSize="filter" inputId="bank-statement-branch-filter" label="" placeholder="ทุกสาขา" value={branchCode || null} onChange={(value) => changeBranch(value ?? '')} />
          <Select className="h-9 w-48 text-sm" value={accountGroup} onChange={(event) => changeAccountGroup(event.target.value)}>
            {companyAccountTypeOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
          </Select>
          {accountGroup === 'bank' ? (
            <Select className="h-9 w-52 text-sm" value={bankAccountType} onChange={(event) => changeBankAccountType(event.target.value)}>
              {bankAccountTypeOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </Select>
          ) : null}
          <Select className="h-9 w-64 text-sm" value={accountId} onChange={(event) => { setPage(1); setAccountId(event.target.value) }}>
            <option value="">เลือกบัญชี</option>
            {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{bankAccountOptionLabel(account)}</option>)}
          </Select>
          <DatePickerInput className="h-9 w-[130px]" value={from} onChange={(value) => { setPage(1); setFrom(value) }} />
          <span className="text-xs text-slate-400">→</span>
          <DatePickerInput className="h-9 w-[130px]" value={to} onChange={(value) => { setPage(1); setTo(value) }} />
        </div>
        <div className="mt-2 hidden justify-end lg:flex">
          <button className="flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-normal text-white transition-colors hover:bg-emerald-700 disabled:opacity-60" disabled={isExporting} type="button" onClick={() => void exportXlsx()}>
            <Download aria-hidden="true" className="size-4" />
            <span>{isExporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}</span>
          </button>
        </div>

        {/* Mobile View (Collapsible Filters) */}
        <div className="block lg:hidden space-y-2.5">
          <div className="flex flex-wrap gap-2">
            <BranchSelectCombobox branches={branches.map((branch) => ({ id: branch.code, name: `${branch.code} - ${branch.name}` }))} className="min-w-0 flex-1" controlSize="filter" inputId="bank-statement-branch-filter-mobile" label="" placeholder="ทุกสาขา" value={branchCode || null} onChange={(value) => changeBranch(value ?? '')} />
            <Select className="h-9 min-w-[180px] flex-1 text-sm text-slate-900" value={accountGroup} onChange={(event) => changeAccountGroup(event.target.value)}>
              {companyAccountTypeOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
            </Select>
            {accountGroup === 'bank' ? (
              <Select className="h-9 min-w-[200px] flex-1 text-sm text-slate-900" value={bankAccountType} onChange={(event) => changeBankAccountType(event.target.value)}>
                {bankAccountTypeOptions.map((option) => <option key={option.value || 'all'} value={option.value}>{option.label}</option>)}
              </Select>
            ) : null}
            <Select className="h-9 min-w-[160px] flex-1 text-sm text-slate-900" value={accountId} onChange={(event) => { setPage(1); setAccountId(event.target.value) }}>
              <option value="">เลือกบัญชี</option>
              {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{bankAccountOptionLabel(account)}</option>)}
            </Select>
            <button
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors ${
                showMobileFilters ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
            >
              ตัวกรอง
            </button>
            <button
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-normal text-white disabled:opacity-60"
              disabled={isExporting}
              type="button"
              onClick={() => void exportXlsx()}
            >
              <Download aria-hidden="true" className="size-4" />
              {isExporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}
            </button>
          </div>

          {showMobileFilters && (
            <div className="grid grid-cols-1 gap-2 pt-2 border-t border-slate-100 animate-in slide-in-from-top-2 duration-100">
              <div className="grid grid-cols-2 gap-2 items-center">
                <label className="text-xs text-slate-500">
                  จากวันที่
                  <DatePickerInput className="mt-1 h-9 w-full" value={from} onChange={(value) => { setPage(1); setFrom(value) }} />
                </label>
                <label className="text-xs text-slate-500">
                  ถึงวันที่
                  <DatePickerInput className="mt-1 h-9 w-full" value={to} onChange={(value) => { setPage(1); setTo(value) }} />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 text-sm">
        <SharedKpiCard icon="🏦" label="บัญชี" note={selectedAccount?.type ?? '-'} tone="slate" value={selectedAccount?.name ?? 'กำลังโหลด'} />
        <SharedKpiCard icon="📥" label="เงินเข้ารวม" note="THB ตามบัญชี" tone={cashIn === 0 ? 'slate' : 'emerald'} value={formatMoney(cashIn)} />
        <SharedKpiCard icon="📤" label="เงินออกรวม" note="THB ตามบัญชี" tone={cashOut === 0 ? 'slate' : 'rose'} value={formatMoney(cashOut)} />
        <SharedKpiCard icon="💰" label="ยอดคงเหลือ" note="THB ตามบัญชี" tone={closingBalance === 0 ? 'slate' : 'blue'} value={formatMoney(closingBalance)} />
      </div>

      {/* ข้อมูลบัญชีและวงเงิน OD */}
      {selectedAccount ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ข้อมูลบัญชีที่เลือก */}
          <div className="lg:col-span-1 bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">ข้อมูลบัญชีที่เลือก</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                  ประเภทบัญชี: {selectedAccount.subtype === 'current' ? 'กระแสรายวัน' : selectedAccount.subtype === 'savings' ? 'ออมทรัพย์' : selectedAccount.subtype === 'fcd' ? 'FCD' : selectedAccount.type}
                </span>
                {selectedAccount.subtype === 'current' && (selectedAccount.odLimit || 0) > 0 && (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/10">
                    มีวงเงิน OD
                  </span>
                )}
              </div>
              <h4 className="text-lg font-bold text-slate-800">{selectedAccount.name}</h4>
              <p className="text-xs text-slate-500 mt-1">
                เลขที่บัญชี {selectedAccount.accountNo || '-'} · สาขา {selectedAccount.branchName || '-'}
              </p>
            </div>
            {selectedAccount.subtype === 'current' && (selectedAccount.odLimit || 0) > 0 && (
              <div className="mt-4 text-xs text-slate-400 leading-normal border-t border-slate-100 pt-3">
                * OD ไม่ใช่เงินสดจริง แต่เป็นวงเงินเสริมที่ใช้ได้เมื่อยอดบัญชีจริงติดลบ
              </div>
            )}
          </div>

          {/* สรุปวงเงิน OD */}
          <div className="lg:col-span-2 bg-white p-5 border border-slate-200 rounded-xl shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">สรุปวงเงิน OD</div>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-4">
                <div className="bg-emerald-50/40 border border-emerald-100/60 rounded-xl p-4 sm:p-5 text-right flex flex-col justify-between min-h-[95px]">
                  <div className="text-xs sm:text-sm text-emerald-800 font-bold text-left">วงเงิน OD</div>
                  <div className="font-mono text-lg sm:text-xl md:text-2xl font-bold text-emerald-700 mt-2">{formatMoney(selectedAccount.odLimit || 0)}</div>
                </div>
                {/* 2. ยอดคงเหลือจริง */}
                <div className="bg-rose-50/40 border border-rose-100/60 rounded-xl p-4 sm:p-5 text-right flex flex-col justify-between min-h-[95px]">
                  <div className="text-xs sm:text-sm text-rose-800 font-bold text-left">ยอดคงเหลือจริง</div>
                  <div className={`font-mono text-lg sm:text-xl md:text-2xl font-bold mt-2 ${closingBalance >= 0 ? 'text-slate-800' : 'text-rose-700'}`}>
                    {formatMoney(closingBalance)}
                  </div>
                </div>
                {/* 3. OD ใช้ไป */}
                <div className="bg-amber-50/40 border border-amber-100/60 rounded-xl p-4 sm:p-5 text-right flex flex-col justify-between min-h-[95px]">
                  <div className="text-xs sm:text-sm text-amber-800 font-bold text-left">OD ใช้ไป</div>
                  <div className="font-mono text-lg sm:text-xl md:text-2xl font-bold text-amber-700 mt-2">
                    {formatMoney(Math.max(0, -closingBalance))}
                  </div>
                </div>
                {/* 4. OD คงเหลือ */}
                <div className="bg-emerald-50/40 border border-emerald-100/60 rounded-xl p-4 sm:p-5 text-right flex flex-col justify-between min-h-[95px]">
                  <div className="text-xs sm:text-sm text-emerald-800 font-bold text-left">OD คงเหลือ</div>
                  <div className="font-mono text-lg sm:text-xl md:text-2xl font-bold text-emerald-700 mt-2">
                    {formatMoney(Math.max(0, (selectedAccount.odLimit || 0) - Math.max(0, -closingBalance)))}
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 text-xs text-slate-400 leading-normal border-t border-slate-100 pt-3">
              สูตร: OD ใช้ไป = max(0, -ยอดคงเหลือจริง), OD คงเหลือ = วงเงิน OD - OD ใช้ไป
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPanel rows={displayRows} title="📈 ยอดคงเหลือสะสม" variant="balance" />
        <ChartPanel rows={displayRows} title="📊 กระแสเงิน (เข้า/ออก)" variant="flow" />
      </div>
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-6">
          <input autoComplete="off" className="h-9 rounded-md border px-3 text-sm lg:col-span-2" placeholder="ค้นหาเลขอ้างอิง / คำอธิบาย / หมายเหตุ" type="search" value={q} onChange={(event) => { setPage(1); setQ(event.target.value) }} />
          <Select className="h-9 text-sm" value={refType} onChange={(event) => { setPage(1); setRefType(event.target.value) }}>
            <option value="">ทุกประเภทอ้างอิง</option>
            {(data?.filters.refTypes ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Select className="h-9 text-sm" value={type} onChange={(event) => { setPage(1); setType(event.target.value) }}>
            <option value="">ทุกประเภทรายการ</option>
            {(data?.filters.types ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <button className="h-9 rounded-md bg-slate-100 px-3 text-sm font-normal text-slate-700" type="button" onClick={() => { setPage(1); setSortDirection((current) => current === 'asc' ? 'desc' : 'asc') }}>วันที่ {sortDirection === 'asc' ? 'เก่าไปใหม่' : 'ใหม่ไปเก่า'}</button>
          <button className="h-9 rounded-md bg-slate-100 px-3 text-sm font-normal text-slate-700" type="button" onClick={() => { setFrom(''); setPage(1); setQ(''); setRefType(''); setTo(''); setType('') }}>ล้างตัวกรอง</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">บัญชี {selectedAccount?.code ? `${selectedAccount.code} - ` : ''}{selectedAccount?.name ?? '-'} / {selectedAccount?.bankName ?? '-'}</span>
          <span className="ml-auto text-xs text-slate-500">พบ {data?.pagination.totalRows ?? 0} รายการ</span>
        </div>
      </div>
      <DetailTable rows={displayRows} isLoading={isLoading} onOpen={setSelectedRow} totalRows={displayRows.length} selectedAccount={selectedAccount} />
      <div className="flex items-center justify-end gap-2">
        <button className="rounded-md bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page <= 1 || isLoading} type="button" onClick={() => setPage((current) => Math.max(1, current - 1))}>ก่อนหน้า</button>
        <span className="text-sm text-slate-600">หน้า {page} / {totalPages}</span>
        <button className="rounded-md bg-slate-100 px-3 py-2 text-sm disabled:opacity-50" disabled={page >= totalPages || isLoading} type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>ถัดไป</button>
      </div>
      {selectedRow ? <DetailModal row={selectedRow} onClose={() => setSelectedRow(null)} /> : null}
    </section>
  )
}

function ChartPanel({ rows, title, variant }: { rows: BankRow[]; title: string; variant: 'balance' | 'flow' }) {
  const chartRows = rows.slice(-18)
  const maxBalance = Math.max(1, ...chartRows.map((row) => Math.abs(row.runningBalance)))
  const maxFlow = Math.max(1, ...chartRows.map((row) => Math.max(row.amountIn, row.amountOut)))
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-bold text-slate-700">{title}</h3>
      <div className="flex h-[280px] items-end gap-1 rounded-md border border-slate-100 bg-slate-50 p-3">
        {chartRows.length === 0 ? <div className="m-auto text-sm text-slate-400">ไม่มีรายการ</div> : null}
        {variant === 'balance'
          ? chartRows.map((row) => (
              <div key={`${row.id}-balance`} className="flex min-w-5 flex-1 flex-col items-center justify-end gap-1">
                <div className={`w-full rounded-md-t ${row.runningBalance >= 0 ? 'bg-blue-500/80' : 'bg-red-500/80'}`} style={{ height: `${Math.max(6, Math.abs(row.runningBalance) / maxBalance * 220)}px` }} title={`${formatDateDisplay(row.date)}: ${formatMoney(row.runningBalance)}`} />
                <span className="w-full truncate text-center text-xs text-slate-400">{formatDateDisplay(row.date).slice(0, 5)}</span>
              </div>
            ))
          : chartRows.map((row) => (
              <div key={`${row.id}-flow`} className="flex min-w-5 flex-1 flex-col items-center justify-end gap-1">
                <div className="flex w-full flex-col justify-end gap-0.5">
                  <div className="w-full rounded-md-t bg-emerald-500/80" style={{ height: `${row.amountIn > 0 ? Math.max(4, row.amountIn / maxFlow * 110) : 2}px` }} title={`เข้า ${formatMoney(row.amountIn)}`} />
                  <div className="w-full rounded-md-b bg-rose-500/80" style={{ height: `${row.amountOut > 0 ? Math.max(4, row.amountOut / maxFlow * 110) : 2}px` }} title={`ออก ${formatMoney(row.amountOut)}`} />
                </div>
                <span className="w-full truncate text-center text-xs text-slate-400">{formatDateDisplay(row.date).slice(0, 5)}</span>
              </div>
            ))}
      </div>
    </div>
  )
}

const bankColumns: Array<ResizableColumnDefinition<BankColumnKey>> = [
  { key: 'date', defaultWidth: 100, minWidth: 90 },
  { key: 'type', defaultWidth: 100, minWidth: 90 },
  { key: 'description', defaultWidth: 250, minWidth: 180 },
  { key: 'refNo', defaultWidth: 150, minWidth: 120 },
  { key: 'amountIn', defaultWidth: 110, minWidth: 100 },
  { key: 'amountOut', defaultWidth: 110, minWidth: 100 },
  { key: 'runningBalance', defaultWidth: 140, minWidth: 120 },
  { key: 'odUsed', defaultWidth: 110, minWidth: 100 },
  { key: 'odRemaining', defaultWidth: 110, minWidth: 100 },
]

function DetailTable({
  isLoading,
  onOpen,
  rows,
  totalRows,
  selectedAccount,
}: {
  isLoading: boolean
  onOpen: (row: BankRow) => void
  rows: BankRow[]
  totalRows: number
  selectedAccount: AccountOption | null
}) {
  const odLimit = selectedAccount?.odLimit || 0
  const hasOd = selectedAccount?.subtype === 'current' && odLimit > 0

  const columns = useMemo(() => {
    return hasOd ? bankColumns : bankColumns.slice(0, 7)
  }, [hasOd])
  const columnResize = useResizableColumns('finance.bank.statement.v5', columns)
  const [tableSortDirection, setTableSortDirection] = useState<SortDirection>('asc')
  const [tableSortKey, setTableSortKey] = useState<BankColumnKey | null>(null)

  const sortedRows = useMemo(() => {
    if (!tableSortKey) return rows
    return [...rows].sort((left, right) => {
      const result = compareSortValues(getBankSortValue(left, tableSortKey, odLimit), getBankSortValue(right, tableSortKey, odLimit))
      return tableSortDirection === 'asc' ? result : -result
    })
  }, [odLimit, rows, tableSortDirection, tableSortKey])

  const changeSort = (key: BankColumnKey) => {
    if (tableSortKey === key) {
      setTableSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setTableSortKey(key)
    setTableSortDirection('asc')
  }

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-3">
        <h3 className="font-bold text-slate-700">📋 รายการเดินบัญชี ({totalRows} รายการ)</h3>
        {columnResize.hasCustomWidths ? (
          <button className="text-xs text-blue-600 hover:underline" type="button" onClick={columnResize.resetColumnWidths}>
            คืนค่าเดิมตาราง
          </button>
        ) : null}
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="ns-table w-full text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
            <tr>
              <ResizableTableHead activeSortKey={tableSortKey ?? undefined} align="center" direction={tableSortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={changeSort} />
              <ResizableTableHead activeSortKey={tableSortKey ?? undefined} align="center" direction={tableSortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('type', 'ประเภท')} sortKey="type" onSort={changeSort} />
              <ResizableTableHead activeSortKey={tableSortKey ?? undefined} direction={tableSortDirection} label="รายละเอียด" resizeProps={columnResize.getResizeHandleProps('description', 'รายละเอียด')} sortKey="description" onSort={changeSort} />
              <ResizableTableHead activeSortKey={tableSortKey ?? undefined} align="center" direction={tableSortDirection} label="อ้างอิง" resizeProps={columnResize.getResizeHandleProps('refNo', 'อ้างอิง')} sortKey="refNo" onSort={changeSort} />
              <ResizableTableHead activeSortKey={tableSortKey ?? undefined} align="right" direction={tableSortDirection} label="📥 เข้า (THB)" resizeProps={columnResize.getResizeHandleProps('amountIn', '📥 เข้า (THB)')} sortKey="amountIn" onSort={changeSort} />
              <ResizableTableHead activeSortKey={tableSortKey ?? undefined} align="right" direction={tableSortDirection} label="📤 ออก (THB)" resizeProps={columnResize.getResizeHandleProps('amountOut', '📤 ออก (THB)')} sortKey="amountOut" onSort={changeSort} />
              <ResizableTableHead activeSortKey={tableSortKey ?? undefined} align="right" direction={tableSortDirection} label="💰 คงเหลือ (THB)" resizeProps={columnResize.getResizeHandleProps('runningBalance', '💰 คงเหลือ (THB)')} sortKey="runningBalance" onSort={changeSort} />
              {hasOd && (
                <>
                  <ResizableTableHead activeSortKey={tableSortKey ?? undefined} align="right" direction={tableSortDirection} label="OD ใช้ไป" resizeProps={columnResize.getResizeHandleProps('odUsed', 'OD ใช้ไป')} sortKey="odUsed" onSort={changeSort} />
                  <ResizableTableHead activeSortKey={tableSortKey ?? undefined} align="right" direction={tableSortDirection} label="OD คงเหลือ" resizeProps={columnResize.getResizeHandleProps('odRemaining', 'OD คงเหลือ')} sortKey="odRemaining" onSort={changeSort} />
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={hasOd ? 9 : 7}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && sortedRows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={hasOd ? 9 : 7}>ไม่มีรายการ</td></tr> : null}
            {!isLoading && sortedRows.map((row) => {
              const runningBalance = row.runningBalance
              const odUsed = row.odUsed
              const odRemaining = Math.max(0, odLimit - odUsed)
              return (
                <tr key={row.id} className="border-t border-slate-100 transition hover:bg-yellow-50">
                  <td className="px-4 py-3.5 text-center font-mono text-xs whitespace-nowrap">{formatDateDisplay(row.date)}</td>
                  <td className="px-4 py-3.5 text-center text-xs whitespace-nowrap"><span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">{row.type || row.refType || '-'}</span></td>
                  <td className="p-2 text-xs overflow-hidden truncate">{row.description || row.note || '-'}</td>
                  <td className="px-4 py-3.5 text-center font-mono text-xs text-blue-600 whitespace-nowrap">
                    <button className="underline-offset-2 hover:underline" type="button" onClick={() => onOpen(row)}>{row.refNo || row.refType || '-'}</button>
                  </td>
                  <td className={`bg-emerald-50/30 p-2 text-right font-mono whitespace-nowrap tabular-nums ${row.amountIn > 0 ? 'font-bold text-emerald-700' : 'text-slate-300'}`}>{row.amountIn ? formatMoney(row.amountIn) : '-'}</td>
                  <td className={`bg-rose-50/30 p-2 text-right font-mono whitespace-nowrap tabular-nums ${row.amountOut > 0 ? 'font-bold text-rose-700' : 'text-slate-300'}`}>{row.amountOut ? formatMoney(row.amountOut) : '-'}</td>
                  <td className={`bg-blue-50/30 p-2 text-right font-mono font-bold whitespace-nowrap tabular-nums ${runningBalance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>{formatMoney(runningBalance)}</td>
                  {hasOd && (
                    <>
                      <td className="bg-amber-50/30 p-2 text-right font-mono text-amber-700 font-semibold whitespace-nowrap tabular-nums">{formatMoney(odUsed)}</td>
                      <td className="bg-emerald-50/30 p-2 text-right font-mono text-emerald-700 font-semibold whitespace-nowrap tabular-nums">{formatMoney(odRemaining)}</td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3 p-3 bg-slate-50/50 border-t border-slate-100">
        {isLoading ? (
          <div className="py-6 text-center text-slate-500 text-xs">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && sortedRows.length === 0 ? (
          <div className="py-6 text-center text-slate-400 text-xs">ไม่มีรายการ</div>
        ) : null}
        {!isLoading && sortedRows.map((row) => {
          const runningBalance = row.runningBalance
          const odUsed = row.odUsed
          const odRemaining = Math.max(0, odLimit - odUsed)
          return (
            <div
              key={row.id}
              className="space-y-2 rounded-xl border border-slate-100 bg-white p-3.5 text-sm shadow-sm"
            >
              <div className="flex justify-between items-start">
                <span className="whitespace-nowrap font-mono text-slate-500 text-xs">{formatDateDisplay(row.date)}</span>
                <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                  {row.type || row.refType || '-'}
                </span>
              </div>
              
              <div className="text-slate-700 font-medium line-clamp-2">{row.description || row.note || '-'}</div>
              
              <div className="font-mono text-xs text-slate-600">
                อ้างอิง: <button type="button" className="whitespace-nowrap font-semibold text-blue-600 underline" onClick={() => onOpen(row)}>{row.refNo || row.refType || '-'}</button>
              </div>

              <div className={`grid ${hasOd ? 'grid-cols-5' : 'grid-cols-3'} gap-2 pt-2 border-t border-slate-100/60 mt-1 text-right text-xs`}>
                <div>
                  <span className="block text-xs text-slate-400">เข้า:</span>
                  <span className="text-emerald-700 font-bold tabular-nums">{row.amountIn ? formatMoney(row.amountIn) : '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-400">ออก:</span>
                  <span className="text-rose-700 font-bold tabular-nums">{row.amountOut ? formatMoney(row.amountOut) : '-'}</span>
                </div>
                <div>
                  <span className="block text-xs text-slate-500">คงเหลือ:</span>
                  <span className={`font-bold tabular-nums ${runningBalance >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                    {formatMoney(runningBalance)}
                  </span>
                </div>
                {hasOd && (
                  <>
                    <div>
                      <span className="block text-xs text-amber-600">OD ใช้:</span>
                      <span className="text-amber-700 font-bold tabular-nums">{formatMoney(odUsed)}</span>
                    </div>
                    <div>
                      <span className="block text-xs text-emerald-600">OD เหลือ:</span>
                      <span className="text-emerald-700 font-bold tabular-nums">{formatMoney(odRemaining)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DetailModal({ onClose, row }: { onClose: () => void; row: BankRow }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 pt-8" onClick={onClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-md bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
        <div data-ns-dialog-header className="flex flex-wrap items-start justify-between gap-3 rounded-t-md bg-slate-900 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-white">{row.refNo || row.id}</h2>
            <p className="text-xs text-slate-300">{row.accountName}</p>
          </div>
          <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-normal text-white hover:border-rose-700 hover:bg-rose-700" type="button" onClick={onClose}>ปิด</button>
        </div>
        <div className="space-y-4 bg-slate-50 p-5">
          {/* ข้อมูลบัญชีและอ้างอิง */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-100">ข้อมูลบัญชีและอ้างอิง</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <DetailItem label="วันที่" value={formatDateDisplay(row.date)} />
              <DetailItem label="บัญชี" value={row.accountName || '-'} />
              <DetailItem label="ธนาคาร" value={row.bankName || '-'} />
              <DetailItem label="เลขบัญชี" value={row.accountNo || '-'} />
              <DetailItem label="ประเภทอ้างอิง" value={row.refType || '-'} />
              <DetailItem label="ประเภทรายการ" value={row.type || '-'} />
              <DetailItem label="หมวดกระแสเงินสด" value={row.cashFlowCategory || '-'} />
            </div>
          </div>

          {/* ข้อมูลการเงิน */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-100">ข้อมูลการเงิน</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <DetailItem label="เงินเข้า (THB)" value={formatMoney(row.amountIn)} />
              <DetailItem label="เงินออก (THB)" value={formatMoney(row.amountOut)} />
              <DetailItem label="คงเหลือทางบัญชี (THB)" value={formatMoney(row.runningBalance)} />
              <DetailItem label="สกุลเงินรายการ" value={row.movementCurrencyCode} />
              {row.nativeAmountIn > 0 ? <DetailItem label={`เงินเข้า (${row.movementCurrencyCode})`} value={formatMoney(row.nativeAmountIn)} /> : null}
              {row.nativeAmountOut > 0 ? <DetailItem label={`เงินออก (${row.movementCurrencyCode})`} value={formatMoney(row.nativeAmountOut)} /> : null}
              {row.bookFxRate != null ? <DetailItem label="Book FX Rate" value={row.bookFxRate.toFixed(3)} /> : null}
            </div>
          </div>

          {/* รายละเอียดและหมายเหตุ */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 pb-1.5 border-b border-slate-100">รายละเอียดและหมายเหตุ</div>
            <div className="grid grid-cols-1 gap-y-3">
              <DetailItem label="คำอธิบาย" value={row.description || '-'} />
              <DetailItem label="หมายเหตุ" value={row.note || '-'} />
              <DetailItem label="Source event" value={`${row.sourceEventType} / ${row.sourceEventKey}`} />
              {row.reversalOfId ? <DetailItem label="Reversal of" value={row.reversalOfId} /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailItem({ className = '', label, value }: { className?: string; label: string; value: string }) {
  return (
    <div className={`flex flex-col py-1.5 ${className}`}>
      <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-sm sm:text-base font-bold text-slate-800">{value}</div>
    </div>
  )
}
