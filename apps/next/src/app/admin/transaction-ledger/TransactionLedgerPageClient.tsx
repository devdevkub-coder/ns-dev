'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { getErrorMessage, readBlobResponse, readJsonResponse } from '@/lib/api-client'
import { formatDateDisplay } from '@/lib/format'
import { Filter, SlidersHorizontal } from 'lucide-react'

const transactionLedgerPayloadSchema = z.object({
  accounts: z.array(z.object({
    accountNo: z.string().nullable(),
    active: z.boolean(),
    balance: z.number(),
    code: z.string(),
    currency: z.string(),
    id: z.string(),
    name: z.string(),
    odLimit: z.number(),
    openingBalance: z.number(),
    type: z.string(),
  })),
  duplicateGroups: z.array(z.object({
    accountName: z.string(),
    count: z.number(),
    ids: z.array(z.string()),
    refNo: z.string(),
    refType: z.string(),
    totalIn: z.number(),
    totalOut: z.number(),
  })),
  rows: z.array(z.object({
    accountId: z.string().nullable(),
    accountName: z.string(),
    amountIn: z.number(),
    amountOut: z.number(),
    date: z.string(),
    description: z.string(),
    id: z.string(),
    linkedBills: z.array(z.object({
      docNo: z.string(),
      type: z.enum(['PB', 'SB']),
    })),
    note: z.string(),
    payee: z.string(),
    refId: z.string().nullable(),
    refNo: z.string(),
    refType: z.string(),
    runningBalance: z.number().nullable(),
    sourceLabel: z.string(),
  })),
})

type AccountRow = z.infer<typeof transactionLedgerPayloadSchema>['accounts'][number]
type DuplicateGroup = z.infer<typeof transactionLedgerPayloadSchema>['duplicateGroups'][number]
type LedgerRow = z.infer<typeof transactionLedgerPayloadSchema>['rows'][number]

const refTypeOptions = [
  { label: 'PMT — จ่ายเงิน', value: 'PMT' },
  { label: 'RCP — รับเงิน', value: 'RCP' },
  { label: 'EXP — ค่าใช้จ่าย', value: 'EXP' },
  { label: 'TRF — โอนระหว่างบัญชี', value: 'TRF' },
  { label: 'OPEN — ยอดยกมา', value: 'OPEN' },
  { label: 'BANK — Bank Statement', value: 'BANK' },
]

function formatMoney(value: number) {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function accountIcon(type: string) {
  const normalized = type.toLowerCase()
  if (normalized.includes('cash') || type === 'เงินสด') return '💵'
  if (normalized.includes('bank') || type === 'ธนาคาร') return '🏦'
  if (normalized.includes('od')) return '💳'
  return '🧾'
}

function accountTypeLabel(type: string) {
  if (type === 'cash') return 'เงินสด'
  if (type === 'bank') return 'ธนาคาร'
  return type || 'อื่น ๆ'
}

function buildCsv(rows: LedgerRow[]) {
  const header = ['วันที่', 'บัญชี', 'ประเภท', 'เลขที่', 'บิลที่เกี่ยวข้อง', 'ผู้รับ/ส่ง', 'รายละเอียด', 'เงินเข้า', 'เงินออก', 'คงเหลือหลังรายการ']
  const body = rows.map((row) => [
    row.date,
    row.accountName,
    row.refType,
    row.refNo,
    row.linkedBills.map((bill) => `${bill.type}:${bill.docNo}`).join(', '),
    row.payee,
    row.description || row.note,
    String(row.amountIn),
    String(row.amountOut),
    row.runningBalance === null ? '' : String(row.runningBalance),
  ])
  return [header, ...body].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
}

export function TransactionLedgerPageClient() {
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [actualBalances, setActualBalances] = useState<Record<string, number>>({})
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filterAccount, setFilterAccount] = useState('')
  const [filterRefType, setFilterRefType] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [search, setSearch] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/transaction-ledger?limit=10000', { cache: 'no-store' })
      const payload = await readJsonResponse(response, transactionLedgerPayloadSchema, 'โหลด Transaction Ledger ไม่สำเร็จ')
      setAccounts(payload.accounts)
      setDuplicateGroups(payload.duplicateGroups)
      setRows(payload.rows)
    } catch (caught) {
      setError(getErrorMessage(caught, 'โหลด Transaction Ledger ไม่สำเร็จ'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const accountBalances = useMemo(() => accounts.map((account) => {
    const actual = actualBalances[account.id]
    const hasActual = actual !== undefined
    const diff = hasActual ? actual - account.balance : 0
    const odUsed = account.type.toLowerCase().includes('od') ? Math.max(0, -account.balance) : 0
    const odAvail = account.type.toLowerCase().includes('od') ? Math.max(0, account.odLimit - odUsed) : 0
    return { ...account, actual, diff, hasActual, match: hasActual && Math.abs(diff) < 0.01, odAvail, odUsed }
  }), [accounts, actualBalances])

  const ledger = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows
      .filter((row) => {
        if (filterAccount && row.accountId !== filterAccount) return false
        if (dateFrom && row.date && row.date < dateFrom) return false
        if (dateTo && row.date && row.date > dateTo) return false
        if (filterRefType && row.refType !== filterRefType) return false
        if (!query) return true
        return [
          row.refNo,
          row.description,
          row.note,
          row.payee,
          row.accountName,
          row.refType,
          row.sourceLabel,
          row.linkedBills.map((bill) => bill.docNo).join(' '),
        ].some((value) => value.toLowerCase().includes(query))
      })
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id))
  }, [dateFrom, dateTo, filterAccount, filterRefType, rows, search])

  const summary = useMemo(() => ({
    count: ledger.length,
    net: ledger.reduce((sum, row) => sum + row.amountIn - row.amountOut, 0),
    totalIn: ledger.reduce((sum, row) => sum + row.amountIn, 0),
    totalOut: ledger.reduce((sum, row) => sum + row.amountOut, 0),
  }), [ledger])

  const grandTotal = accountBalances.filter((account) => !account.type.toLowerCase().includes('od')).reduce((sum, account) => sum + account.balance, 0)
  const odUsedTotal = accountBalances.filter((account) => account.type.toLowerCase().includes('od')).reduce((sum, account) => sum + account.odUsed, 0)
  const selectedAccount = filterAccount ? accountBalances.find((account) => account.id === filterAccount) ?? null : null
  const selectedComputedBalance = selectedAccount ? ledger.reduce((sum, row) => sum + row.amountIn - row.amountOut, 0) : null
  const selectedDiff = selectedAccount && selectedComputedBalance !== null ? selectedAccount.balance - selectedComputedBalance : null

  function exportCsv() {
    const csv = buildCsv(ledger)
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `transaction_ledger_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function exportExcel() {
    setError(null)
    setIsExporting(true)
    try {
      const response = await fetch('/api/admin/transaction-ledger?limit=10000&format=xlsx', { cache: 'no-store' })
      const blob = await readBlobResponse(response, 'Export Excel ไม่สำเร็จ')
      const disposition = response.headers.get('content-disposition') ?? ''
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `transaction_ledger_${new Date().toISOString().slice(0, 10)}.xlsx`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(getErrorMessage(caught, 'Export Excel ไม่สำเร็จ'))
    } finally {
      setIsExporting(false)
    }
  }

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setFilterAccount('')
    setFilterRefType('')
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-md bg-gradient-to-r from-cyan-700 to-blue-700 p-4 text-white shadow">
        <div>
          <h1 className="text-xl font-bold">📒 Transaction Ledger — เช็คเงินเข้า-ออกทุกบัญชี</h1>
          <p className="mt-1 text-sm opacity-90">ตรวจสอบทุกการเคลื่อนไหวในบัญชีธนาคารจาก bank statement พร้อม source voucher และบิลที่เกี่ยวข้อง</p>
        </div>
        <button className="rounded-md bg-white/15 px-4 py-2 text-sm font-bold text-white shadow hover:bg-white/25 disabled:opacity-60 shrink-0 self-start md:self-auto" disabled={isLoading} type="button" onClick={() => void loadData()}>
          {isLoading ? 'กำลังโหลด...' : '🔄 รีเฟรช'}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลด Transaction Ledger ไม่สำเร็จ</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      <div className="rounded-md bg-white p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">💰 ยอดคงเหลือทุกบัญชี</h3>
          <span className="text-xs text-slate-500">{accounts.length.toLocaleString('th-TH')} บัญชี</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 animate-fade-in">
          {accountBalances.map((account) => (
            <div key={account.id} className={`rounded-md border-2 p-3 transition ${filterAccount === account.id ? 'border-blue-500 bg-blue-50' : account.hasActual ? (account.match ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50') : 'border-slate-100 bg-slate-50'}`}>
              <button className="mb-2 flex w-full cursor-pointer items-center gap-2 text-left" type="button" onClick={() => setFilterAccount(filterAccount === account.id ? '' : account.id)}>
                <span className="text-lg">{accountIcon(account.type)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-slate-800">{account.name}</span>
                  <span className="block text-xs text-slate-500">{accountTypeLabel(account.type)} · {account.accountNo || '-'}</span>
                </span>
                {account.hasActual ? <span className="text-lg">{account.match ? '✅' : '⚠️'}</span> : null}
              </button>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-slate-500">📊 ในระบบ</div>
                  <div className={`font-mono text-base font-bold ${account.balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(account.balance)}</div>
                </div>
                <label>
                  <span className="text-slate-500">🔍 นับจริง</span>
                  <input className="w-full rounded-md border border-slate-300 bg-white px-1 py-0.5 text-right font-mono font-bold" placeholder="กรอกยอด..." step="0.01" type="number" value={account.actual ?? ''} onChange={(event) => setActualBalances((current) => ({ ...current, [account.id]: Number(event.target.value || 0) }))} />
                </label>
              </div>
              {account.hasActual ? (
                <div className={`mt-2 rounded-md px-2 py-1 text-center text-xs font-bold ${account.match ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {account.match ? '✅ ตรง' : `⚠️ Diff: ${account.diff > 0 ? '+' : ''}${formatMoney(account.diff)}`}
                </div>
              ) : null}
              {account.type.toLowerCase().includes('od') ? <div className="mt-1 text-xs text-amber-700">OD ใช้ {formatMoney(account.odUsed)} / Limit {formatMoney(account.odLimit)} · เหลือ {formatMoney(account.odAvail)}</div> : null}
            </div>
          ))}
          {!isLoading && accountBalances.length === 0 ? <div className="rounded-md border border-dashed p-5 text-sm text-slate-500">ยังไม่มีบัญชีเงินในระบบ</div> : null}
        </div>
        {/* AcexPOS Style Grand Totals KPI Cards */}
        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 text-sm">
          {/* 1. ยอดคงเหลือรวม */}
          <div className="bg-white p-3 sm:p-4 border border-slate-100 rounded-xl shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xl shrink-0">
              💰
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-500 truncate">ยอดคงเหลือรวม</div>
              <div className="text-sm font-bold text-emerald-700 mt-0.5 tabular-nums">{formatMoney(grandTotal)}</div>
            </div>
          </div>

          {/* 2. OD ใช้รวม */}
          <div className="bg-white p-3 sm:p-4 border border-slate-100 rounded-xl shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-xl shrink-0">
              ⚠️
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-500 truncate">OD ใช้รวม</div>
              <div className="text-sm font-bold text-amber-700 mt-0.5 tabular-nums">{formatMoney(odUsedTotal)}</div>
            </div>
          </div>

          {/* 3. Net Cash Position */}
          <div className="bg-white p-3 sm:p-4 border border-slate-100 rounded-xl shadow-sm flex items-center gap-3 col-span-2 md:col-span-1">
            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xl shrink-0">
              📊
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-500 truncate">Net Cash Position</div>
              <div className="text-sm font-bold text-blue-700 mt-0.5 tabular-nums">{formatMoney(grandTotal - odUsedTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Toolbar (Hidden on Mobile) */}
      <div className="hidden lg:block rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[260px] flex-1 rounded-md border px-3 py-2 text-sm h-9 border-slate-300" placeholder="ค้นหา เลขที่ / รายละเอียด / ผู้รับ-ส่ง..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <DatePickerInput className="w-[130px]" value={dateFrom} onChange={setDateFrom} />
          <span className="text-slate-400">→</span>
          <DatePickerInput className="w-[130px]" value={dateTo} onChange={setDateTo} />
          <select className="rounded-md border border-slate-300 px-3 text-sm h-9 bg-white text-slate-800" value={filterAccount} onChange={(event) => setFilterAccount(event.target.value)}>
            <option value="">💳 ทุกบัญชี</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
          <select className="rounded-md border border-slate-300 px-3 text-sm h-9 bg-white text-slate-800" value={filterRefType} onChange={(event) => setFilterRefType(event.target.value)}>
            <option value="">📋 ทุกประเภท</option>
            {refTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button className="rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 h-9 flex items-center shrink-0" disabled={ledger.length === 0 || isExporting} type="button" onClick={() => void exportExcel()}>{isExporting ? 'กำลัง Export...' : '📊 Excel'}</button>
          <button className="rounded-md bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60 h-9 flex items-center shrink-0" disabled={ledger.length === 0} type="button" onClick={exportCsv}>ส่งออก CSV</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600 pt-2 border-t border-slate-100">
          <span className="rounded-md bg-emerald-50 px-2 py-1">📥 เงินเข้ารวม <b className="text-emerald-700">{formatMoney(summary.totalIn)}</b></span>
          <span className="rounded-md bg-red-50 px-2 py-1">📤 เงินออกรวม <b className="text-red-700">{formatMoney(summary.totalOut)}</b></span>
          <span className={`rounded-md px-2 py-1 ${summary.net >= 0 ? 'bg-blue-50' : 'bg-rose-50'}`}>📊 Net <b className={summary.net >= 0 ? 'text-blue-700' : 'text-rose-700'}>{formatMoney(summary.net)}</b></span>
          <span className="rounded-md bg-slate-50 px-2 py-1">📋 พบ <b>{summary.count.toLocaleString('th-TH')}</b> รายการ</span>
          {duplicateGroups.length > 0 ? <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800 font-semibold">⚠️ ยอดซ้ำ {duplicateGroups.length} กลุ่ม</span> : null}
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="lg:hidden rounded-md bg-white p-3 shadow space-y-2">
        <div className="flex gap-2 items-center">
          <input className="flex-1 rounded-md border px-3 h-9 text-sm border-slate-300" placeholder="ค้นหา..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button
            type="button"
            className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1 shrink-0"
            onClick={() => setShowMobileFilters(true)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            ตัวกรอง {(dateFrom || dateTo || filterAccount || filterRefType) ? '(มี)' : ''}
          </button>
          <button className="h-9 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 shrink-0" disabled={ledger.length === 0 || isExporting} type="button" onClick={() => void exportExcel()}>{isExporting ? '..' : 'Excel'}</button>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs text-slate-500 pt-1">
          <span className="rounded bg-emerald-50 px-1 py-0.5 text-emerald-700 font-medium">เข้า: {formatMoney(summary.totalIn)}</span>
          <span className="rounded bg-red-50 px-1 py-0.5 text-red-700 font-medium">ออก: {formatMoney(summary.totalOut)}</span>
          <span className="rounded bg-slate-50 px-1 py-0.5 text-slate-700">พบ: {summary.count} รายการ</span>
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 lg:hidden animate-fade-in">
          <div className="w-full rounded-t-2xl bg-white p-4 shadow-xl border-t border-slate-100 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h4 className="font-bold text-slate-800">ตัวกรองรายการ</h4>
              <button
                className="p-1 text-slate-400 hover:text-slate-600 text-xl font-bold"
                onClick={() => setShowMobileFilters(false)}
                type="button"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className="mb-1 block text-xs font-semibold text-slate-600">ระบุวันที่</span>
                <div className="flex items-center gap-2">
                  <DatePickerInput className="flex-1" value={dateFrom} onChange={setDateFrom} />
                  <span className="text-slate-400">→</span>
                  <DatePickerInput className="flex-1" value={dateTo} onChange={setDateTo} />
                </div>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">เลือกบัญชี</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={filterAccount} onChange={(event) => setFilterAccount(event.target.value)}>
                  <option value="">💳 ทุกบัญชี</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">ประเภทรายการ</span>
                <select className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm bg-white text-slate-800" value={filterRefType} onChange={(event) => setFilterRefType(event.target.value)}>
                  <option value="">📋 ทุกประเภท</option>
                  {refTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6 pt-3 border-t border-slate-100">
              <button
                type="button"
                className="h-11 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  clearFilters()
                  setShowMobileFilters(false)
                }}
              >
                ล้างตัวกรอง
              </button>
              <button
                type="button"
                className="h-11 rounded-md bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={() => setShowMobileFilters(false)}
              >
                ใช้ตัวกรอง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {duplicateGroups.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <div className="font-bold">ตรวจพบรายการที่รูปแบบซ้ำกัน</div>
          <div className="mt-1 text-xs">แสดงเพื่อช่วยตรวจสอบเท่านั้น ยังไม่ลบอัตโนมัติ เพราะการลบต้องผูก audit log และ reconciliation rule ก่อน</div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {duplicateGroups.slice(0, 6).map((group) => (
              <span key={`${group.refType}-${group.refNo}-${group.accountName}`} className="rounded-md bg-white px-2 py-1 ring-1 ring-amber-200">
                {group.refType} {group.refNo} · {group.accountName} × {group.count}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {selectedAccount && selectedComputedBalance !== null && selectedDiff !== null ? (
        <div className={`rounded-md border-l-4 p-3 ${Math.abs(selectedDiff) < 0.01 ? 'border-emerald-500 bg-emerald-50' : 'border-red-500 bg-red-50'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{Math.abs(selectedDiff) < 0.01 ? '✅' : '⚠️'}</span>
            <div>
              <div className={`font-bold ${Math.abs(selectedDiff) < 0.01 ? 'text-emerald-700' : 'text-red-700'}`}>{Math.abs(selectedDiff) < 0.01 ? 'ความถูกต้อง: ตรง ✓' : `พบความไม่ตรง ${formatMoney(selectedDiff)} บาท`}</div>
              <div className="text-xs text-slate-600">บัญชี: {selectedAccount.name} · ยอดในตาราง: <b>{formatMoney(selectedComputedBalance)}</b> · ยอดบัญชี: <b>{formatMoney(selectedAccount.balance)}</b></div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Desktop Table View (Hidden on Mobile) */}
      <div className="hidden lg:block overflow-x-auto rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm min-w-[1000px]">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 text-left">
            <tr>
              <th className="p-3 text-left font-semibold">วันที่</th>
              <th className="p-3 text-left font-semibold">บัญชี</th>
              <th className="p-3 text-left font-semibold">ประเภท</th>
              <th className="p-3 text-left font-semibold">เลขที่</th>
              <th className="p-3 text-left font-semibold">บิลที่เกี่ยวข้อง</th>
              <th className="p-3 text-left font-semibold">ผู้รับ/ส่ง</th>
              <th className="p-3 text-left font-semibold">รายละเอียด</th>
              <th className="p-3 text-right font-semibold text-emerald-700">เงินเข้า</th>
              <th className="p-3 text-right font-semibold text-red-600">เงินออก</th>
              <th className="p-3 text-right font-semibold">คงเหลือ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td className="py-8 text-center text-slate-400 font-medium" colSpan={10}>กำลังโหลด Transaction Ledger...</td></tr>
            ) : ledger.length > 0 ? ledger.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="p-3 text-xs text-slate-600 whitespace-nowrap">{row.date ? formatDateDisplay(row.date) : '-'}</td>
                <td className="p-3 text-xs text-slate-900 font-medium min-w-0 overflow-hidden"><div className="truncate" title={row.accountName}>{row.accountName}</div></td>
                <td className="p-3 whitespace-nowrap"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{row.refType}</span></td>
                <td className="p-3 font-mono text-xs text-slate-700 whitespace-nowrap">{row.refNo}</td>
                <td className="p-3 text-xs">
                  {row.linkedBills.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {row.linkedBills.map((bill) => <span key={`${row.id}-${bill.type}-${bill.docNo}`} className="rounded bg-blue-50 px-2 py-0.5 font-mono text-blue-700">{bill.type}:{bill.docNo}</span>)}
                    </div>
                  ) : '-'}
                </td>
                <td className="p-3 text-xs text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={row.payee || ''}>{row.payee || '-'}</div></td>
                <td className="p-3 text-xs text-slate-600 leading-normal min-w-0 overflow-hidden"><div className="truncate" title={row.description || row.note || ''}>{row.description || row.note || '-'}</div></td>
                <td className="p-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap pl-4 tabular-nums">{row.amountIn > 0 ? formatMoney(row.amountIn) : '-'}</td>
                <td className="p-3 text-right font-mono font-bold text-red-600 whitespace-nowrap pl-4 tabular-nums">{row.amountOut > 0 ? formatMoney(row.amountOut) : '-'}</td>
                <td className="p-3 text-right font-mono text-xs text-slate-600 whitespace-nowrap pl-4 tabular-nums">{row.runningBalance === null ? '-' : formatMoney(row.runningBalance)}</td>
              </tr>
            )) : (
              <tr><td className="py-8 text-center text-slate-400" colSpan={10}>ไม่มีรายการ</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile View: Dense Card List (Hidden on Desktop) */}
      {!isLoading && ledger.length > 0 ? (
        <div className="space-y-3 lg:hidden">
          {ledger.map((row) => (
            <div key={row.id} className="rounded-lg border border-slate-100 bg-white p-3.5 shadow-sm space-y-2.5 animate-fade-in">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-bold text-slate-700">{row.refType}</span>
                  <span className="ml-1.5 font-mono text-xs text-slate-500 bg-slate-50 px-1 py-0.5 rounded border border-slate-100">{row.refNo}</span>
                </div>
                <span className="text-xs font-medium text-slate-500">{row.date ? formatDateDisplay(row.date) : '-'}</span>
              </div>

              <div className="text-xs">
                <div className="font-semibold text-slate-800">{row.accountName}</div>
                <div className="text-slate-500 mt-0.5 leading-snug">{row.description || row.note || '-'}</div>
                {row.payee ? (
                  <div className="text-xs text-slate-400 mt-1">
                    <span className="font-medium text-slate-500">ผู้รับ/ส่ง:</span> {row.payee}
                  </div>
                ) : null}
              </div>

              {row.linkedBills.length > 0 ? (
                <div className="flex flex-wrap gap-1 border-t border-slate-50 pt-2">
                  {row.linkedBills.map((bill) => (
                    <span key={`${row.id}-${bill.type}-${bill.docNo}`} className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-blue-700">
                      {bill.type}:{bill.docNo}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 text-center text-xs">
                <div>
                  <span className="text-slate-400 block text-xs uppercase font-semibold">เงินเข้า</span>
                  <span className="font-bold tabular-nums text-emerald-700">{row.amountIn > 0 ? formatMoney(row.amountIn) : '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs uppercase font-semibold">เงินออก</span>
                  <span className="font-bold tabular-nums text-red-600">{row.amountOut > 0 ? formatMoney(row.amountOut) : '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-xs uppercase font-semibold">คงเหลือ</span>
                  <span className="font-semibold tabular-nums text-slate-600">{row.runningBalance === null ? '-' : formatMoney(row.runningBalance)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!isLoading && ledger.length === 0 ? (
        <div className="rounded-lg border border-slate-100 bg-white p-12 text-center text-slate-400 shadow-sm lg:hidden">
          ไม่มีรายการ
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-lg border border-slate-100 bg-white p-12 text-center text-slate-400 shadow-sm lg:hidden">
          กำลังโหลด Transaction Ledger...
        </div>
      ) : null}

      <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 p-3 text-xs text-amber-800">
        <b>💡 คำแนะนำ:</b> หน้านี้เป็น read-only ledger view สำหรับตรวจยอดเงินเข้า-ออกจาก `bank_statement` พร้อม source voucher และบิลที่เกี่ยวข้อง การแก้ไข/ลบรายการควรเปิดพร้อม audit log และ reconciliation rule.
      </div>
    </section>
  )
}
