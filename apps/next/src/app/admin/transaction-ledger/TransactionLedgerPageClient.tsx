'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { Select } from '@/components/ui/Select'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { getErrorMessage, readBlobResponse, readJsonResponse } from '@/lib/api-client'
import { formatDateDisplay } from '@/lib/format'
import { Download, SlidersHorizontal } from 'lucide-react'

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
type LedgerColumnKey = 'accountName' | 'amountIn' | 'amountOut' | 'date' | 'description' | 'linkedBills' | 'payee' | 'refNo' | 'refType' | 'runningBalance'
type SortDirection = 'asc' | 'desc'

const refTypeOptions = [
  { label: 'PMT — จ่ายเงิน', value: 'PMT' },
  { label: 'RCP — รับเงิน', value: 'RCP' },
  { label: 'EXP — ค่าใช้จ่าย', value: 'EXP' },
  { label: 'TRF — โอนระหว่างบัญชี', value: 'TRF' },
  { label: 'OPEN — ยอดยกมา', value: 'OPEN' },
  { label: 'BANK — Bank Statement', value: 'BANK' },
]

const ledgerColumns: Array<ResizableColumnDefinition<LedgerColumnKey>> = [
  { key: 'date', defaultWidth: 130, minWidth: 110 },
  { key: 'accountName', defaultWidth: 210, minWidth: 150 },
  { key: 'refType', defaultWidth: 110, minWidth: 90 },
  { key: 'refNo', defaultWidth: 155, minWidth: 120 },
  { key: 'linkedBills', defaultWidth: 190, minWidth: 135 },
  { key: 'payee', defaultWidth: 190, minWidth: 130 },
  { key: 'description', defaultWidth: 300, minWidth: 180 },
  { key: 'amountIn', defaultWidth: 145, minWidth: 115 },
  { key: 'amountOut', defaultWidth: 145, minWidth: 115 },
  { key: 'runningBalance', defaultWidth: 150, minWidth: 120 },
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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [search, setSearch] = useState('')
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [sortKey, setSortKey] = useState<LedgerColumnKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const columnResize = useResizableColumns('admin.transaction-ledger.main.v1', ledgerColumns)

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

  const sortedLedger = useMemo(() => {
    if (!sortKey) return ledger

    return [...ledger].sort((left, right) => {
      const leftValue = getLedgerSortValue(left, sortKey)
      const rightValue = getLedgerSortValue(right, sortKey)
      const result = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), 'th', { numeric: true })

      return sortDirection === 'asc' ? result : -result
    })
  }, [ledger, sortDirection, sortKey])

  const totalPages = Math.max(1, Math.ceil(sortedLedger.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedLedger = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedLedger.slice(start, start + pageSize)
  }, [currentPage, pageSize, sortedLedger])

  useEffect(() => {
    setPage(1)
  }, [dateFrom, dateTo, filterAccount, filterRefType, search])

  const summary = useMemo(() => ({
    net: ledger.reduce((sum, row) => sum + row.amountIn - row.amountOut, 0),
    totalIn: ledger.reduce((sum, row) => sum + row.amountIn, 0),
    totalOut: ledger.reduce((sum, row) => sum + row.amountOut, 0),
  }), [ledger])

  const grandTotal = accountBalances.filter((account) => !account.type.toLowerCase().includes('od')).reduce((sum, account) => sum + account.balance, 0)
  const odUsedTotal = accountBalances.filter((account) => account.type.toLowerCase().includes('od')).reduce((sum, account) => sum + account.odUsed, 0)
  const selectedAccount = filterAccount ? accountBalances.find((account) => account.id === filterAccount) ?? null : null
  const selectedComputedBalance = selectedAccount ? ledger.reduce((sum, row) => sum + row.amountIn - row.amountOut, 0) : null
  const selectedDiff = selectedAccount && selectedComputedBalance !== null ? selectedAccount.balance - selectedComputedBalance : null

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

  function handleSort(key: LedgerColumnKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(key)
    setSortDirection('asc')
  }

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setFilterAccount('')
    setFilterRefType('')
    setPage(1)
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200/60 bg-white p-4 text-slate-900 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl font-bold">📒 Transaction Ledger — เช็คเงินเข้า-ออกทุกบัญชี</h1>
        </div>
        <button className="shrink-0 self-start rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 md:self-auto" disabled={isLoading} type="button" onClick={() => void loadData()}>
          {isLoading ? 'กำลังโหลด...' : '🔄 รีเฟรช'}
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="font-bold">โหลด Transaction Ledger ไม่สำเร็จ</div>
          <div className="mt-1">{error}</div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
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
                  <span className="text-slate-500">นับจริง</span>
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
      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap items-center gap-2">
          <input className="min-w-[260px] flex-1 rounded-md border px-3 py-2 text-sm h-9 border-slate-300" placeholder="ค้นหา เลขที่ / รายละเอียด / ผู้รับ-ส่ง..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <DatePickerInput className="w-[130px]" value={dateFrom} onChange={setDateFrom} />
          <span className="text-slate-400">→</span>
          <DatePickerInput className="w-[130px]" value={dateTo} onChange={setDateTo} />
          <Select className="h-9 w-auto min-w-40 text-sm" value={filterAccount} onChange={(event) => setFilterAccount(event.target.value)}>
            <option value="">💳 ทุกบัญชี</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </Select>
          <Select className="h-9 w-auto min-w-40 text-sm" value={filterRefType} onChange={(event) => setFilterRefType(event.target.value)}>
            <option value="">📋 ทุกประเภท</option>
            {refTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
          {columnResize.hasCustomWidths ? (
            <button className="hidden h-9 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 xl:inline-flex xl:items-center" type="button" onClick={columnResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          ) : null}
          <button className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={ledger.length === 0 || isExporting} type="button" onClick={() => void exportExcel()}>
            <Download aria-hidden="true" className="size-4" />
            <span>{isExporting ? 'กำลังส่งออก...' : 'ส่งออก Excel'}</span>
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600 pt-2 border-t border-slate-100">
          <span className="rounded-md bg-emerald-50 px-2 py-1">📥 เงินเข้ารวม <b className="text-emerald-700">{formatMoney(summary.totalIn)}</b></span>
          <span className="rounded-md bg-red-50 px-2 py-1">📤 เงินออกรวม <b className="text-red-700">{formatMoney(summary.totalOut)}</b></span>
          <span className={`rounded-md px-2 py-1 ${summary.net >= 0 ? 'bg-blue-50' : 'bg-rose-50'}`}>📊 Net <b className={summary.net >= 0 ? 'text-blue-700' : 'text-rose-700'}>{formatMoney(summary.net)}</b></span>
          {duplicateGroups.length > 0 ? <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800 font-semibold">⚠️ ยอดซ้ำ {duplicateGroups.length} กลุ่ม</span> : null}
        </div>
      </div>

      {/* Mobile Toolbar (Hidden on Desktop) */}
      <div className="space-y-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
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
        </div>
      </div>

      {/* Bottom Sheet Filter for Mobile */}
      {showMobileFilters ? (
        <MobileFilterSheet
          footer={
            <>
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
            </>
          }
          onClose={() => setShowMobileFilters(false)}
          title="ตัวกรองรายการ"
        >
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
                <Select className="h-9 text-sm" value={filterAccount} onChange={(event) => setFilterAccount(event.target.value)}>
                  <option value="">💳 ทุกบัญชี</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </Select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">ประเภทรายการ</span>
                <Select className="h-9 text-sm" value={filterRefType} onChange={(event) => setFilterRefType(event.target.value)}>
                  <option value="">📋 ทุกประเภท</option>
                  {refTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </label>
        </MobileFilterSheet>
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

      <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          พบทั้งหมด <span className="font-semibold text-slate-900">{sortedLedger.length.toLocaleString('th-TH')}</span> รายการ
          {sortedLedger.length > 0 ? (
            <span className="ml-2 text-xs text-slate-500">
              แสดง {((currentPage - 1) * pageSize + 1).toLocaleString('th-TH')}-{Math.min(currentPage * pageSize, sortedLedger.length).toLocaleString('th-TH')}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PageSizeDropdown
            value={pageSize}
            onChange={(nextPageSize) => {
              setPageSize(nextPageSize)
              setPage(1)
            }}
          />
          <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={currentPage <= 1} type="button" onClick={() => setPage(currentPage - 1)}>ก่อนหน้า</button>
          <span className="px-1 text-sm font-medium text-slate-700">หน้า {currentPage.toLocaleString('th-TH')} / {totalPages.toLocaleString('th-TH')}</span>
          <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40" disabled={currentPage >= totalPages} type="button" onClick={() => setPage(currentPage + 1)}>ถัดไป</button>
        </div>
      </div>

      {/* Desktop Table View (Hidden on Mobile) */}
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {ledgerColumns.map((column) => (
              <col key={column.key} style={columnResize.getColumnStyle(column.key)} />
            ))}
          </colgroup>
          <thead className="bg-slate-100">
            <tr>
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="วันที่" resizeProps={columnResize.getResizeHandleProps('date', 'วันที่')} sortKey="date" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="บัญชี" resizeProps={columnResize.getResizeHandleProps('accountName', 'บัญชี')} sortKey="accountName" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="ประเภท" resizeProps={columnResize.getResizeHandleProps('refType', 'ประเภท')} sortKey="refType" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="เลขที่" resizeProps={columnResize.getResizeHandleProps('refNo', 'เลขที่')} sortKey="refNo" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="บิลที่เกี่ยวข้อง" resizeProps={columnResize.getResizeHandleProps('linkedBills', 'บิลที่เกี่ยวข้อง')} sortKey="linkedBills" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="ผู้รับ/ส่ง" resizeProps={columnResize.getResizeHandleProps('payee', 'ผู้รับ/ส่ง')} sortKey="payee" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} direction={sortDirection} label="รายละเอียด" resizeProps={columnResize.getResizeHandleProps('description', 'รายละเอียด')} sortKey="description" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="เงินเข้า" resizeProps={columnResize.getResizeHandleProps('amountIn', 'เงินเข้า')} sortKey="amountIn" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="เงินออก" resizeProps={columnResize.getResizeHandleProps('amountOut', 'เงินออก')} sortKey="amountOut" onSort={handleSort} />
              <ResizableTableHead activeSortKey={sortKey ?? undefined} align="right" direction={sortDirection} label="คงเหลือ" resizeProps={columnResize.getResizeHandleProps('runningBalance', 'คงเหลือ')} sortKey="runningBalance" onSort={handleSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td className="px-3 py-10 text-center font-medium text-slate-400" colSpan={ledgerColumns.length}>กำลังโหลด Transaction Ledger...</td></tr>
            ) : pagedLedger.length > 0 ? pagedLedger.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-slate-50">
                <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{row.date ? formatDateDisplay(row.date) : '-'}</td>
                <td className="min-w-0 px-3 py-3 text-xs font-medium text-slate-900"><div className="truncate" title={row.accountName}>{row.accountName}</div></td>
                <td className="whitespace-nowrap px-3 py-3"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{row.refType}</span></td>
                <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-700">{row.refNo}</td>
                <td className="min-w-0 px-3 py-3 text-xs">
                  {row.linkedBills.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {row.linkedBills.map((bill) => <span key={row.id + '-' + bill.type + '-' + bill.docNo} className="rounded bg-blue-50 px-2 py-0.5 font-mono text-blue-700">{bill.type}:{bill.docNo}</span>)}
                    </div>
                  ) : '-'}
                </td>
                <td className="min-w-0 px-3 py-3 text-xs text-slate-700"><div className="truncate" title={row.payee || ''}>{row.payee || '-'}</div></td>
                <td className="min-w-0 px-3 py-3 text-xs leading-normal text-slate-600"><div className="truncate" title={row.description || row.note || ''}>{row.description || row.note || '-'}</div></td>
                <td className="whitespace-nowrap px-3 py-3 pl-4 text-right font-mono font-bold tabular-nums text-emerald-700">{row.amountIn > 0 ? formatMoney(row.amountIn) : '-'}</td>
                <td className="whitespace-nowrap px-3 py-3 pl-4 text-right font-mono font-bold tabular-nums text-red-600">{row.amountOut > 0 ? formatMoney(row.amountOut) : '-'}</td>
                <td className="whitespace-nowrap px-3 py-3 pl-4 text-right font-mono text-xs tabular-nums text-slate-600">{row.runningBalance === null ? '-' : formatMoney(row.runningBalance)}</td>
              </tr>
            )) : (
              <tr><td className="px-3 py-10 text-center text-slate-400" colSpan={ledgerColumns.length}>ไม่มีรายการ</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile View: Dense Card List (Hidden on Desktop) */}
      {!isLoading && pagedLedger.length > 0 ? (
        <div className="space-y-3 lg:hidden">
          {pagedLedger.map((row) => (
            <div key={row.id} className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm space-y-2.5 animate-fade-in">
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

      {!isLoading && sortedLedger.length === 0 ? (
        <div className="rounded-xl border border-slate-100 bg-white p-12 text-center text-slate-400 shadow-sm lg:hidden">
          ไม่มีรายการ
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-slate-100 bg-white p-12 text-center text-slate-400 shadow-sm lg:hidden">
          กำลังโหลด Transaction Ledger...
        </div>
      ) : null}
    </section>
  )
}

function getLedgerSortValue(row: LedgerRow, key: LedgerColumnKey): number | string {
  if (key === 'date') {
    const timestamp = Date.parse(row.date)
    return Number.isNaN(timestamp) ? 0 : timestamp
  }
  if (key === 'linkedBills') return row.linkedBills.map((bill) => `${bill.type}:${bill.docNo}`).join(' ')
  if (key === 'description') return row.description || row.note || ''
  if (key === 'runningBalance') return row.runningBalance ?? 0

  return row[key]
}
