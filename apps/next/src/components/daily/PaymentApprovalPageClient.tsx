'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type ApprovalPayload = {
  apRows: Array<{ bankAccount: string; bankName: string; date: string; docNo: string; id: string; paidAmount: number; payableBalance: number; supplierName: string; totalAmount: number }>
  expenseRows: Array<{ accountName: string; date: string; docNo: string; dueDate: string; id: string; payee: string; refDocNo: string; totalAmount: number }>
}

type ApprovalTab = 'ap' | 'expense'
type ApprovalSortDirection = 'asc' | 'desc'
type ApprovalSortKey = 'bankAccount' | 'date' | 'docNo' | 'dueDate' | 'paidAmount' | 'partyName' | 'payableBalance' | 'totalAmount'
type SelectionState = Record<string, { payAmount: number; selected: boolean }>
const pageSizeOptions = [10, 25, 50, 100]

export function PaymentApprovalPageClient() {
  const [data, setData] = useState<ApprovalPayload>({ apRows: [], expenseRows: [] })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [approvedOnly, setApprovedOnly] = useState(false)
  const [tab, setTab] = useState<ApprovalTab>('ap')
  const [selection, setSelection] = useState<SelectionState>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [sortDirection, setSortDirection] = useState<ApprovalSortDirection>('desc')
  const [sortKey, setSortKey] = useState<ApprovalSortKey>('date')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setData(await dailyFetchJson<ApprovalPayload>('/api/daily/payment-approval'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายการอนุมัติไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const source = tab === 'ap' ? data.apRows : data.expenseRows
    return source.filter((row) => {
      const rowDate = row.date || ''
      const selected = selection[row.id]?.selected ?? false
      const haystack = `${row.docNo} ${'supplierName' in row ? row.supplierName : row.payee} ${'bankAccount' in row ? `${row.bankName} ${row.bankAccount}` : `${row.accountName} ${row.refDocNo}`}`.toLowerCase()
      if (query && !haystack.includes(query)) return false
      if (dateFrom && rowDate < dateFrom) return false
      if (dateTo && rowDate > dateTo) return false
      if (approvedOnly && !selected) return false
      return true
    })
  }, [data.apRows, data.expenseRows, dateFrom, dateTo, approvedOnly, search, selection, tab])

  const rows = useMemo(() => {
    const collator = new Intl.Collator('th-TH', { numeric: true, sensitivity: 'base' })
    return [...filteredRows].sort((left, right) => {
      const leftValue = approvalSortValue(left, sortKey)
      const rightValue = approvalSortValue(right, sortKey)
      let base = 0
      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        base = leftValue - rightValue
      } else {
        base = collator.compare(String(leftValue), String(rightValue))
      }
      return sortDirection === 'asc' ? base : -base
    })
  }, [filteredRows, sortDirection, sortKey])

  const totalRows = rows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [currentPage, pageSize, rows])

  const apRows = useMemo(() => pageRows.filter((row): row is ApprovalPayload['apRows'][number] => 'payableBalance' in row), [pageRows])
  const expenseRows = useMemo(() => pageRows.filter((row): row is ApprovalPayload['expenseRows'][number] => !('payableBalance' in row)), [pageRows])

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (totals, row) => {
        const totalFull = 'payableBalance' in row ? row.totalAmount : row.totalAmount
        const totalPaid = 'payableBalance' in row ? row.paidAmount : 0
        const totalRemain = 'payableBalance' in row ? row.payableBalance : row.totalAmount
        const selectedRow = selection[row.id]
        const selectedAmount = selectedRow?.selected ? selectedRow.payAmount : 0
        totals.totalFull += totalFull
        totals.totalPaid += totalPaid
        totals.totalRemain += totalRemain
        totals.selectedTotal += selectedAmount
        if (selectedRow?.selected) totals.selectedCount += 1
        return totals
      },
      { selectedCount: 0, selectedTotal: 0, totalFull: 0, totalPaid: 0, totalRemain: 0 },
    )
  }, [filteredRows, selection])

  const visibleIds = useMemo(() => pageRows.map((row) => row.id), [pageRows])
  const visibleSelectedCount = visibleIds.filter((id) => selection[id]?.selected).length
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length

  useEffect(() => {
    setPage(1)
  }, [approvedOnly, dateFrom, dateTo, pageSize, search, sortDirection, sortKey, tab])

  function defaultPayAmount(row: ApprovalPayload['apRows'][number] | ApprovalPayload['expenseRows'][number]) {
    return 'payableBalance' in row ? row.payableBalance : row.totalAmount
  }

  function setSelected(row: ApprovalPayload['apRows'][number] | ApprovalPayload['expenseRows'][number], selected: boolean) {
    setSelection((current) => ({
      ...current,
      [row.id]: {
        payAmount: current[row.id]?.payAmount ?? defaultPayAmount(row),
        selected,
      },
    }))
  }

  function setPayAmount(row: ApprovalPayload['apRows'][number] | ApprovalPayload['expenseRows'][number], payAmount: number) {
    setSelection((current) => ({
      ...current,
      [row.id]: {
        payAmount: Number.isFinite(payAmount) ? payAmount : 0,
        selected: current[row.id]?.selected ?? false,
      },
    }))
  }

  function selectAllVisible() {
    setSelection((current) => {
      const next = { ...current }
      rows.forEach((row) => {
        next[row.id] = {
          payAmount: current[row.id]?.payAmount ?? defaultPayAmount(row),
          selected: true,
        }
      })
      return next
    })
  }

  function clearVisibleSelection() {
    setSelection((current) => {
      const next = { ...current }
      rows.forEach((row) => {
        if (next[row.id]) next[row.id] = { ...next[row.id], selected: false }
      })
      return next
    })
  }

  function clearFilters() {
    setSearch('')
    setDateFrom('')
    setDateTo('')
    setApprovedOnly(false)
    setSortKey('date')
    setSortDirection('desc')
  }

  function changeSort(nextKey: ApprovalSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === 'partyName' || nextKey === 'bankAccount' ? 'asc' : 'desc')
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
        <div className="rounded-md bg-slate-50 p-2"><div className="text-xs text-slate-500">รายการทั้งหมด</div><div className="font-bold">{filteredRows.length}</div></div>
        <div className="rounded-md bg-blue-50 p-2"><div className="text-xs text-blue-600">ยอดเต็ม</div><div className="font-bold text-blue-700">{formatMoney(summary.totalFull)}</div></div>
        <div className="rounded-md bg-emerald-50 p-2"><div className="text-xs text-emerald-600">ชำระแล้ว</div><div className="font-bold text-emerald-700">{formatMoney(summary.totalPaid)}</div></div>
        <div className="rounded-md bg-red-50 p-2"><div className="text-xs text-red-600">คงเหลือ</div><div className="font-bold text-red-700">{formatMoney(summary.totalRemain)}</div></div>
        <div className="rounded-md bg-amber-50 p-2"><div className="text-xs text-amber-600">เลือกจ่าย ({summary.selectedCount})</div><div className="font-bold text-amber-700">{formatMoney(summary.selectedTotal)}</div></div>
      </div>

      <div className="overflow-hidden rounded-md bg-white shadow">
        <div className="flex border-b">
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'ap' ? 'border-red-600 text-red-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('ap')}>
            ต้นทุน (AP / บิลซื้อ) <span className="ml-2 rounded-md-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{data.apRows.length}</span>
          </button>
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'expense' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('expense')}>
            ค่าใช้จ่าย <span className="ml-2 rounded-md-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{data.expenseRows.length}</span>
          </button>
        </div>

        <div className="space-y-2 border-b p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="min-w-[260px] flex-1 rounded-md" placeholder="ค้นหาเลขที่ / ชื่อ / บัญชี..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
            <label className="text-xs text-slate-500">วันที่:</label>
            <DatePickerInput id="payment-approval-date-from" value={dateFrom} onChange={setDateFrom} />
            <span className="text-slate-400">→</span>
            <DatePickerInput id="payment-approval-date-to" value={dateTo} onChange={setDateTo} />
            {(search || dateFrom || dateTo || approvedOnly || sortKey !== 'date' || sortDirection !== 'desc') ? <Button size="xs" type="button" variant="secondary" onClick={clearFilters}>✕ ล้าง</Button> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input checked={approvedOnly} className="h-4 w-4 rounded-md border-slate-300" type="checkbox" onChange={(event) => setApprovedOnly(event.target.checked)} />
              เฉพาะอนุมัติแล้ว
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-amber-200 bg-amber-50 p-3">
          <div className="text-sm text-amber-700">เลือก <b>{summary.selectedCount}</b> รายการ ยอดรวม <b className="text-red-600">{formatMoney(summary.selectedTotal)} บาท</b></div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300" disabled title="รอออกแบบ approval write/audit ก่อนเปิดใช้งาน" type="button">อนุมัติที่เลือก</button>
            <button className="rounded-md bg-slate-700 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300" disabled title="รอออกแบบเอกสาร approval sheet ก่อนเปิดใช้งาน" type="button">พิมพ์ใบอนุมัติส่ง Cashier</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm text-slate-600">
          <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="จำนวนรายการต่อหน้า"
              className="h-9 w-auto px-2 py-1"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
            >
              {pageSizeOptions.map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
            </Select>
            <Button disabled={currentPage <= 1} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.max(1, value - 1))}>ก่อนหน้า</Button>
            <span className="px-1">หน้า {currentPage} / {totalPages}</span>
            <Button disabled={currentPage >= totalPages} size="sm" type="button" variant="outline" onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>ถัดไป</Button>
          </div>
        </div>

        <div>
          {tab === 'ap' ? (
            <Table>
              <TableHeader>
                <tr>
                  <TableHead className="w-8"><input checked={allVisibleSelected} className="h-4 w-4 rounded-md border-slate-300" type="checkbox" onChange={(event) => (event.target.checked ? selectAllVisible() : clearVisibleSelection())} /></TableHead>
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="เลขที่บิล" sortKey="docNo" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="วันที่" sortKey="date" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="Supplier" sortKey="partyName" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="เลขบัญชี ธ." sortKey="bankAccount" onSort={changeSort} />
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="ยอดเต็ม" sortKey="totalAmount" onSort={changeSort} />
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="ชำระแล้ว" sortKey="paidAmount" onSort={changeSort} />
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="คงเหลือ" sortKey="payableBalance" onSort={changeSort} />
                  <TableHead className="text-right">ยอดที่จะจ่าย</TableHead>
                  <TableHead className="text-center">สถานะ</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                {!isLoading && apRows.map((row) => {
                  const selectedRow = selection[row.id]
                  return (
                    <TableRow key={row.id} className={`hover:bg-slate-50 ${selectedRow?.selected ? 'bg-emerald-50' : ''}`}>
                      <TableCell><input checked={selectedRow?.selected ?? false} className="h-4 w-4 rounded-md border-slate-300" type="checkbox" onChange={(event) => setSelected(row, event.target.checked)} /></TableCell>
                      <TableCell className="font-mono text-xs">{row.docNo}</TableCell>
                      <TableCell className="text-xs">{formatDateDisplay(row.date)}</TableCell>
                      <TableCell className="font-semibold">{row.supplierName}</TableCell>
                      <TableCell>
                        {row.bankAccount ? (
                          <span className="select-all whitespace-nowrap rounded-md bg-yellow-100 px-2 py-1 font-mono text-base font-bold text-blue-900">{[row.bankName, row.bankAccount].filter(Boolean).join(' / ')}</span>
                        ) : (
                          <span className="text-xs text-red-500">ไม่ระบุ</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatMoney(row.totalAmount)}</TableCell>
                      <TableCell className="text-right text-emerald-700">{formatMoney(row.paidAmount)}</TableCell>
                      <TableCell className="text-right font-bold text-red-700">{formatMoney(row.payableBalance)}</TableCell>
                      <TableCell className="text-right">
                        <Input className="w-28 bg-amber-50 px-2 py-1 text-right text-xs" min={0} step="0.01" type="number" value={selectedRow?.payAmount ?? row.payableBalance} onChange={(event) => setPayAmount(row, Number(event.target.value))} />
                      </TableCell>
                      <TableCell className="text-center text-xs">{selectedRow?.selected ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">เลือกแล้ว</span> : <span className="text-slate-300">-</span>}</TableCell>
                    </TableRow>
                  )
                })}
                {!isLoading && totalRows === 0 ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={10}>ไม่มีบิลค้างจ่าย</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <tr>
                  <TableHead className="w-8"><input checked={allVisibleSelected} className="h-4 w-4 rounded-md border-slate-300" type="checkbox" onChange={(event) => (event.target.checked ? selectAllVisible() : clearVisibleSelection())} /></TableHead>
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="เลขที่/วันที่" sortKey="docNo" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="ครบกำหนด" sortKey="dueDate" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="ผู้รับเงิน" sortKey="partyName" onSort={changeSort} />
                  <SortableHead align="left" currentKey={sortKey} direction={sortDirection} label="เลขบัญชี / ธนาคาร" sortKey="bankAccount" onSort={changeSort} />
                  <TableHead>รายละเอียด / อ้างอิง</TableHead>
                  <SortableHead align="right" currentKey={sortKey} direction={sortDirection} label="ยอดเต็ม" sortKey="totalAmount" onSort={changeSort} />
                  <TableHead className="text-right">ยอดที่จะจ่าย</TableHead>
                  <TableHead className="text-center">สถานะ</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</TableCell></TableRow> : null}
                {!isLoading && expenseRows.map((row) => {
                  const selectedRow = selection[row.id]
                  const overdue = row.dueDate ? row.dueDate < new Date().toISOString().slice(0, 10) : false
                  return (
                    <TableRow key={row.id} className={`hover:bg-slate-50 ${selectedRow?.selected ? 'bg-emerald-50' : ''}`}>
                      <TableCell><input checked={selectedRow?.selected ?? false} className="h-4 w-4 rounded-md border-slate-300" type="checkbox" onChange={(event) => setSelected(row, event.target.checked)} /></TableCell>
                      <TableCell className="text-xs"><div className="font-mono font-bold">{row.docNo}</div><div className="text-slate-500">{formatDateDisplay(row.date)}</div></TableCell>
                      <TableCell className="text-xs">{row.dueDate ? <span className={overdue ? 'font-bold text-red-600' : 'text-slate-700'}>{formatDateDisplay(row.dueDate)}{overdue ? <span className="block text-[10px] text-red-500">เลยกำหนด</span> : null}</span> : <span className="text-slate-300">-</span>}</TableCell>
                      <TableCell className="font-semibold">{row.payee}</TableCell>
                      <TableCell>{row.accountName ? <span className="whitespace-nowrap rounded-md bg-yellow-100 px-2 py-1 text-xs font-semibold text-blue-900">{row.accountName}</span> : <span className="text-xs text-amber-600">ไม่มี - แก้ที่บิลหรือ Master</span>}</TableCell>
                      <TableCell className="text-xs">{row.refDocNo ? <div className="font-mono text-slate-700">{row.refDocNo}</div> : <span className="text-slate-300">-</span>}</TableCell>
                      <TableCell className="text-right font-bold text-red-700">{formatMoney(row.totalAmount)}</TableCell>
                      <TableCell className="text-right">
                        <Input className="w-28 bg-amber-50 px-2 py-1 text-right text-xs font-bold" min={0} step="0.01" type="number" value={selectedRow?.payAmount ?? row.totalAmount} onChange={(event) => setPayAmount(row, Number(event.target.value))} />
                      </TableCell>
                      <TableCell className="text-center text-xs">{selectedRow?.selected ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">เลือกแล้ว</span> : <span className="text-slate-300">-</span>}</TableCell>
                    </TableRow>
                  )
                })}
                {!isLoading && totalRows === 0 ? <TableRow><TableCell className="p-6 text-center text-slate-500" colSpan={9}>ไม่มีค่าใช้จ่ายค้างจ่าย</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </section>
  )
}

function approvalSortValue(row: ApprovalPayload['apRows'][number] | ApprovalPayload['expenseRows'][number], sortKey: ApprovalSortKey) {
  switch (sortKey) {
    case 'docNo':
      return row.docNo ?? ''
    case 'date':
      return row.date ?? ''
    case 'partyName':
      return 'supplierName' in row ? row.supplierName ?? '' : row.payee ?? ''
    case 'bankAccount':
      return 'bankAccount' in row ? `${row.bankName ?? ''} ${row.bankAccount ?? ''}`.trim() : row.accountName ?? ''
    case 'totalAmount':
      return row.totalAmount ?? 0
    case 'paidAmount':
      return 'paidAmount' in row ? row.paidAmount ?? 0 : 0
    case 'payableBalance':
      return 'payableBalance' in row ? row.payableBalance ?? 0 : row.totalAmount ?? 0
    case 'dueDate':
      return 'dueDate' in row ? row.dueDate ?? '' : row.date ?? ''
    default:
      return ''
  }
}

function SortableHead({ align, currentKey, direction, label, onSort, sortKey }: { align: 'left' | 'right'; currentKey: ApprovalSortKey; direction: ApprovalSortDirection; label: string; onSort: (key: ApprovalSortKey) => void; sortKey: ApprovalSortKey }) {
  const active = currentKey === sortKey
  const alignClass = align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
  return (
    <TableHead className={align === 'right' ? 'text-right' : undefined}>
      <button className={`inline-flex w-full items-center gap-1 rounded-md px-1 py-0.5 hover:bg-slate-200 ${alignClass}`} type="button" onClick={() => onSort(sortKey)}>
        <span>{label}</span>
        <span className="text-xs text-slate-400">{active ? (direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </TableHead>
  )
}
