'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type ApprovalPayload = {
  apRows: Array<{ bankAccount: string; bankName: string; date: string; docNo: string; id: string; paidAmount: number; payableBalance: number; supplierName: string; totalAmount: number }>
  expenseRows: Array<{ accountName: string; date: string; docNo: string; dueDate: string; id: string; payee: string; refDocNo: string; totalAmount: number }>
}

type ApprovalTab = 'ap' | 'expense'
type SelectionState = Record<string, { payAmount: number; selected: boolean }>

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

  const rows = useMemo(() => {
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

  const apRows = useMemo(() => rows.filter((row): row is ApprovalPayload['apRows'][number] => 'payableBalance' in row), [rows])
  const expenseRows = useMemo(() => rows.filter((row): row is ApprovalPayload['expenseRows'][number] => !('payableBalance' in row)), [rows])

  const summary = useMemo(() => {
    return rows.reduce(
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
  }, [rows, selection])

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows])
  const visibleSelectedCount = visibleIds.filter((id) => selection[id]?.selected).length
  const allVisibleSelected = visibleIds.length > 0 && visibleSelectedCount === visibleIds.length

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

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 p-5 text-white shadow">
        <div>
          <h1 className="text-2xl font-bold">อนุมัติโอนเงิน (Payment Approval)</h1>
          <p className="mt-1 text-sm opacity-80">เช็ครายการที่จะจ่าย แล้วพิมพ์ใบอนุมัติส่งให้ cashier</p>
        </div>
        <button className="rounded-lg bg-white/20 px-4 py-2 text-sm font-bold hover:bg-white/30 disabled:cursor-wait disabled:opacity-60" disabled={isLoading} type="button" onClick={() => void loadData()}>
          Refresh ยอดค้าง
        </button>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow">
        <div className="flex border-b">
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'ap' ? 'border-red-600 text-red-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('ap')}>
            ต้นทุน (AP / บิลซื้อ) <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">{data.apRows.length}</span>
          </button>
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'expense' ? 'border-purple-600 text-purple-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('expense')}>
            ค่าใช้จ่าย <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">{data.expenseRows.length}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <input className="min-w-[220px] flex-1 rounded border px-3 py-2 text-sm" placeholder="ค้นหาเลขที่/ชื่อ/บัญชี..." type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <input className="rounded border px-2 py-2 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <span className="text-slate-400">→</span>
          <input className="rounded border px-2 py-2 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input checked={approvedOnly} className="h-4 w-4 rounded border-slate-300" type="checkbox" onChange={(event) => setApprovedOnly(event.target.checked)} />
            เฉพาะอนุมัติแล้ว
          </label>
          <button className="rounded bg-blue-100 px-3 py-1.5 text-xs text-blue-700" type="button" onClick={selectAllVisible}>เลือกทั้งหมด</button>
          <button className="rounded bg-slate-100 px-3 py-1.5 text-xs text-slate-700" type="button" onClick={clearVisibleSelection}>ล้างเลือก</button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b bg-white p-3 text-sm md:grid-cols-5">
          <div className="rounded bg-slate-50 p-2"><div className="text-xs text-slate-500">รายการทั้งหมด</div><div className="font-bold">{rows.length}</div></div>
          <div className="rounded bg-blue-50 p-2"><div className="text-xs text-blue-600">ยอดเต็ม</div><div className="font-bold text-blue-700">{formatMoney(summary.totalFull)}</div></div>
          <div className="rounded bg-emerald-50 p-2"><div className="text-xs text-emerald-600">ชำระแล้ว</div><div className="font-bold text-emerald-700">{formatMoney(summary.totalPaid)}</div></div>
          <div className="rounded bg-red-50 p-2"><div className="text-xs text-red-600">คงเหลือ</div><div className="font-bold text-red-700">{formatMoney(summary.totalRemain)}</div></div>
          <div className="rounded bg-amber-50 p-2"><div className="text-xs text-amber-600">เลือกจ่าย ({summary.selectedCount})</div><div className="font-bold text-amber-700">{formatMoney(summary.selectedTotal)}</div></div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-amber-200 bg-amber-50 p-3">
          <div className="text-sm text-amber-700">เลือก <b>{summary.selectedCount}</b> รายการ ยอดรวม <b className="text-red-600">{formatMoney(summary.selectedTotal)} บาท</b></div>
          <div className="flex flex-wrap gap-2">
            <button className="rounded bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300" disabled title="รอออกแบบ approval write/audit ก่อนเปิดใช้งาน" type="button">อนุมัติที่เลือก</button>
            <button className="rounded bg-slate-700 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300" disabled title="รอออกแบบเอกสาร approval sheet ก่อนเปิดใช้งาน" type="button">พิมพ์ใบอนุมัติส่ง Cashier</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {tab === 'ap' ? (
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="w-8 p-2"><input checked={allVisibleSelected} className="h-4 w-4 rounded border-slate-300" type="checkbox" onChange={(event) => (event.target.checked ? selectAllVisible() : clearVisibleSelection())} /></th>
                  <th className="p-2 text-left">เลขที่บิล</th>
                  <th className="p-2 text-left">วันที่</th>
                  <th className="p-2 text-left">Supplier</th>
                  <th className="p-2 text-left">เลขบัญชี ธ.</th>
                  <th className="p-2 text-right">ยอดเต็ม</th>
                  <th className="p-2 text-right">ชำระแล้ว</th>
                  <th className="p-2 text-right">คงเหลือ</th>
                  <th className="p-2 text-right">ยอดที่จะจ่าย</th>
                  <th className="p-2 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && apRows.map((row) => {
                  const selectedRow = selection[row.id]
                  return (
                    <tr key={row.id} className={`border-t hover:bg-slate-50 ${selectedRow?.selected ? 'bg-emerald-50' : ''}`}>
                      <td className="p-2"><input checked={selectedRow?.selected ?? false} className="h-4 w-4 rounded border-slate-300" type="checkbox" onChange={(event) => setSelected(row, event.target.checked)} /></td>
                      <td className="p-2 font-mono text-xs">{row.docNo}</td>
                      <td className="p-2 text-xs">{row.date}</td>
                      <td className="p-2 font-semibold">{row.supplierName}</td>
                      <td className="p-2">
                        {row.bankAccount ? (
                          <span className="select-all whitespace-nowrap rounded bg-yellow-100 px-2 py-1 font-mono text-base font-bold text-blue-900">{[row.bankName, row.bankAccount].filter(Boolean).join(' / ')}</span>
                        ) : (
                          <span className="text-xs text-red-500">ไม่ระบุ</span>
                        )}
                      </td>
                      <td className="p-2 text-right">{formatMoney(row.totalAmount)}</td>
                      <td className="p-2 text-right text-emerald-700">{formatMoney(row.paidAmount)}</td>
                      <td className="p-2 text-right font-bold text-red-700">{formatMoney(row.payableBalance)}</td>
                      <td className="p-2 text-right">
                        <input className="w-28 rounded border bg-amber-50 px-2 py-1 text-right text-xs" min={0} step="0.01" type="number" value={selectedRow?.payAmount ?? row.payableBalance} onChange={(event) => setPayAmount(row, Number(event.target.value))} />
                      </td>
                      <td className="p-2 text-center text-xs">{selectedRow?.selected ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">เลือกแล้ว</span> : <span className="text-slate-300">-</span>}</td>
                    </tr>
                  )
                })}
                {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={10}>ไม่มีบิลค้างจ่าย</td></tr> : null}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="w-8 p-2"><input checked={allVisibleSelected} className="h-4 w-4 rounded border-slate-300" type="checkbox" onChange={(event) => (event.target.checked ? selectAllVisible() : clearVisibleSelection())} /></th>
                  <th className="p-2 text-left">เลขที่/วันที่</th>
                  <th className="p-2 text-left">ครบกำหนด</th>
                  <th className="p-2 text-left">ผู้รับเงิน</th>
                  <th className="p-2 text-left">เลขบัญชี / ธนาคาร</th>
                  <th className="p-2 text-left">รายละเอียด / อ้างอิง</th>
                  <th className="p-2 text-right">ยอดเต็ม</th>
                  <th className="p-2 text-right">ยอดที่จะจ่าย</th>
                  <th className="p-2 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && expenseRows.map((row) => {
                  const selectedRow = selection[row.id]
                  const overdue = row.dueDate ? row.dueDate < new Date().toISOString().slice(0, 10) : false
                  return (
                    <tr key={row.id} className={`border-t hover:bg-slate-50 ${selectedRow?.selected ? 'bg-emerald-50' : ''}`}>
                      <td className="p-2"><input checked={selectedRow?.selected ?? false} className="h-4 w-4 rounded border-slate-300" type="checkbox" onChange={(event) => setSelected(row, event.target.checked)} /></td>
                      <td className="p-2 text-xs"><div className="font-mono font-bold">{row.docNo}</div><div className="text-slate-500">{row.date}</div></td>
                      <td className="p-2 text-xs">{row.dueDate ? <span className={overdue ? 'font-bold text-red-600' : 'text-slate-700'}>{row.dueDate}{overdue ? <span className="block text-[10px] text-red-500">เลยกำหนด</span> : null}</span> : <span className="text-slate-300">-</span>}</td>
                      <td className="p-2 font-semibold">{row.payee}</td>
                      <td className="p-2">{row.accountName ? <span className="whitespace-nowrap rounded bg-yellow-100 px-2 py-1 text-xs font-semibold text-blue-900">{row.accountName}</span> : <span className="text-xs text-amber-600">ไม่มี - แก้ที่บิลหรือ Master</span>}</td>
                      <td className="p-2 text-xs">{row.refDocNo ? <div className="font-mono text-slate-700">{row.refDocNo}</div> : <span className="text-slate-300">-</span>}</td>
                      <td className="p-2 text-right font-bold text-red-700">{formatMoney(row.totalAmount)}</td>
                      <td className="p-2 text-right">
                        <input className="w-28 rounded border bg-amber-50 px-2 py-1 text-right text-xs font-bold" min={0} step="0.01" type="number" value={selectedRow?.payAmount ?? row.totalAmount} onChange={(event) => setPayAmount(row, Number(event.target.value))} />
                      </td>
                      <td className="p-2 text-center text-xs">{selectedRow?.selected ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">เลือกแล้ว</span> : <span className="text-slate-300">-</span>}</td>
                    </tr>
                  )
                })}
                {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={9}>ไม่มีค่าใช้จ่ายค้างจ่าย</td></tr> : null}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  )
}
