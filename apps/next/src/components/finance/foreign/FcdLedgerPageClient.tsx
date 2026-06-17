'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type FcdAccount = {
  accountNo: string | null
  bankName: string
  branchName: string
  code: string | null
  currency: string
  id: string
  label: string
  name: string
  openingBalance: number
  type: string
}

type FcdRow = {
  date: string
  description: string
  foreignBal: number
  foreignIn: number
  foreignOut: number
  fxRate: number
  id: string
  refNo: string
  thbBal: number
  thbIn: number
  thbOut: number
  type: string
}

type FcdPayload = {
  account: (Omit<FcdAccount, 'label'> & { openingBalance: number }) | null
  filters: { accounts: FcdAccount[] }
  rows: FcdRow[]
  summary: { accountCount: number; currency: string; foreignBalance: number; rows: number; thbBalance: number }
}

export function FcdLedgerPageClient() {
  const [accountId, setAccountId] = useState('')
  const [data, setData] = useState<FcdPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (accountId) params.set('accountId', accountId)
    return params.toString()
  }, [accountId])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<FcdPayload>(`/api/finance/foreign/fcd-ledger${query ? `?${query}` : ''}`)
      setData(payload)
      if (!accountId && payload.account?.id) setAccountId(payload.account.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด FCD Ledger ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [accountId, query])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const currency = data?.summary.currency || data?.account?.currency || ''

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
        <strong>FCD Ledger</strong> - เดินบัญชีเงินตราต่างประเทศ แสดงทั้งยอดสกุลต่างประเทศและมูลค่า THB equivalent
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap gap-2">
        <select className="w-full rounded-md border border-slate-100 bg-white px-3 py-2 text-sm md:w-80" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.label} ({account.currency})</option>)}
          {!isLoading && (data?.filters.accounts.length ?? 0) === 0 ? <option value="">ไม่มีบัญชี FCD</option> : null}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 text-sm">
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-lg sm:text-xl shrink-0">
            🏦
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-500">บัญชี</div>
            <div className="truncate text-lg font-bold text-slate-800">{data?.account?.name ?? '-'}</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${(data?.summary.foreignBalance ?? 0) === 0 ? 'bg-slate-100 text-slate-600' : 'bg-indigo-100 text-indigo-600'} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
            💱
          </div>
          <div>
            <div className={`text-xs ${(data?.summary.foreignBalance ?? 0) === 0 ? 'text-slate-500' : 'text-indigo-600'}`}>ยอดคงเหลือ ({currency || '-'})</div>
            <div className={`font-mono text-2xl font-bold ${(data?.summary.foreignBalance ?? 0) === 0 ? 'text-slate-900' : 'text-indigo-700'}`}>{formatMoney(data?.summary.foreignBalance ?? 0)}</div>
          </div>
        </div>
        <div className="bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full ${(data?.summary.thbBalance ?? 0) === 0 ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-600'} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
            💰
          </div>
          <div>
            <div className={`text-xs ${(data?.summary.thbBalance ?? 0) === 0 ? 'text-slate-500' : 'text-blue-600'}`}>ยอดคงเหลือ THB Equivalent</div>
            <div className={`font-mono text-2xl font-bold ${(data?.summary.thbBalance ?? 0) === 0 ? 'text-slate-900' : 'text-blue-700'}`}>{formatMoney(data?.summary.thbBalance ?? 0)}</div>
          </div>
        </div>
      </div>

      <div className="hidden lg:block overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">วันที่</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">ประเภท</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">เอกสาร</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-left">รายละเอียด</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">FCD เข้า</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">FCD ออก</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">FX</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">THB เข้า</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">THB ออก</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">FCD Balance</th>
              <th className="px-4 py-3 text-xs font-semibold text-slate-500 text-right">THB Balance</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && (data?.rows.length ?? 0) === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>ยังไม่มีรายการเดินบัญชี FCD</td></tr> : null}
            {!isLoading && data?.rows.map((row) => (
              <tr key={row.id} className={`border-t border-slate-100 ${row.type === 'ยอดยกมา' ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'}`}>
                <td className="px-4 py-3.5">{row.date}</td>
                <td className="px-4 py-3.5 text-xs">{row.type}</td>
                <td className="px-4 py-3.5 font-mono text-xs text-blue-600">{row.refNo}</td>
                <td className="max-w-80 truncate p-2 text-xs">{row.description || '-'}</td>
                <MoneyCell tone="in" value={row.foreignIn} />
                <MoneyCell tone="out" value={row.foreignOut} />
                <td className="px-4 py-3.5 text-right">{row.fxRate ? formatMoney(row.fxRate) : '-'}</td>
                <MoneyCell tone="in" value={row.thbIn} />
                <MoneyCell tone="out" value={row.thbOut} />
                <td className="px-4 py-3.5 text-right font-medium">{formatMoney(row.foreignBal)}</td>
                <td className="px-4 py-3.5 text-right font-medium">{formatMoney(row.thbBal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card list */}
      <div className="block lg:hidden space-y-3">
        {isLoading ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow border border-slate-100">กำลังโหลดข้อมูล</div>
        ) : null}
        {!isLoading && (data?.rows.length ?? 0) === 0 ? (
          <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow border border-slate-100">ยังไม่มีรายการเดินบัญชี FCD</div>
        ) : null}
        {!isLoading && data?.rows.map((row) => {
          const isOpening = row.type === 'ยอดยกมา'
          return (
            <div
              key={row.id}
              className={`rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2 text-xs ${isOpening ? 'bg-slate-50' : ''}`}
            >
              <div className="flex justify-between items-start">
                <span className="font-mono text-slate-500 text-[10px]">{row.date}</span>
                <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${isOpening ? 'bg-slate-200 text-slate-700' : 'bg-indigo-100 text-indigo-700'}`}>
                  {row.type}
                </span>
              </div>
              
              {!isOpening && (
                <div className="flex justify-between">
                  <span className="font-mono text-blue-600 font-semibold">Ref: {row.refNo}</span>
                  {row.fxRate ? <span className="text-slate-400">Rate: {formatMoney(row.fxRate)}</span> : null}
                </div>
              )}
              
              <div className="text-slate-700">{row.description || '-'}</div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-2 border-t border-slate-100/60 mt-1">
                <div>
                  <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">ต่างประเทศ ({currency})</div>
                  <div className="mt-0.5 space-y-0.5 font-mono">
                    <div className="flex justify-between"><span>เข้า:</span><span className="text-emerald-700">{row.foreignIn ? formatMoney(row.foreignIn) : '-'}</span></div>
                    <div className="flex justify-between"><span>ออก:</span><span className="text-red-600">{row.foreignOut ? formatMoney(row.foreignOut) : '-'}</span></div>
                    <div className="flex justify-between border-t border-slate-100/60 pt-0.5 font-bold"><span>คงเหลือ:</span><span className="text-slate-800">{formatMoney(row.foreignBal)}</span></div>
                  </div>
                </div>
                
                <div>
                  <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Equivalent (THB)</div>
                  <div className="mt-0.5 space-y-0.5 font-mono">
                    <div className="flex justify-between"><span>เข้า:</span><span className="text-emerald-700">{row.thbIn ? formatMoney(row.thbIn) : '-'}</span></div>
                    <div className="flex justify-between"><span>ออก:</span><span className="text-red-600">{row.thbOut ? formatMoney(row.thbOut) : '-'}</span></div>
                    <div className="flex justify-between border-t border-slate-100/60 pt-0.5 font-bold"><span>คงเหลือ:</span><span className="text-slate-800">{formatMoney(row.thbBal)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function MoneyCell({ tone, value }: { tone: 'in' | 'out'; value: number }) {
  const color = tone === 'in' ? 'text-emerald-700' : 'text-red-600'
  return <td className={`p-2 text-right ${color}`}>{value ? formatMoney(value) : '-'}</td>
}
