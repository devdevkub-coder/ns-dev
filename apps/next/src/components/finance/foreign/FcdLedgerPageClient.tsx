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
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">
        <strong>FCD Ledger</strong> - เดินบัญชีเงินตราต่างประเทศ แสดงทั้งยอดสกุลต่างประเทศและมูลค่า THB equivalent
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="flex flex-wrap gap-2">
        <select className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:w-80" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          {(data?.filters.accounts ?? []).map((account) => <option key={account.id} value={account.id}>{account.label} ({account.currency})</option>)}
          {!isLoading && (data?.filters.accounts.length ?? 0) === 0 ? <option value="">ไม่มีบัญชี FCD</option> : null}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="text-xs text-slate-500">บัญชี</div>
          <div className="font-semibold">{data?.account?.name ?? '-'}</div>
        </div>
        <div className="rounded-xl bg-indigo-50 p-4 shadow">
          <div className="text-xs text-indigo-600">ยอดคงเหลือ ({currency || '-'})</div>
          <div className="text-2xl font-bold text-indigo-700">{formatMoney(data?.summary.foreignBalance ?? 0)}</div>
        </div>
        <div className="rounded-xl bg-blue-50 p-4 shadow">
          <div className="text-xs text-blue-600">ยอดคงเหลือ THB Equivalent</div>
          <div className="text-2xl font-bold text-blue-700">{formatMoney(data?.summary.thbBalance ?? 0)}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">วันที่</th>
              <th className="p-2 text-left">ประเภท</th>
              <th className="p-2 text-left">เอกสาร</th>
              <th className="p-2 text-left">รายละเอียด</th>
              <th className="p-2 text-right">FCD เข้า</th>
              <th className="p-2 text-right">FCD ออก</th>
              <th className="p-2 text-right">FX</th>
              <th className="p-2 text-right">THB เข้า</th>
              <th className="p-2 text-right">THB ออก</th>
              <th className="p-2 text-right">FCD Balance</th>
              <th className="p-2 text-right">THB Balance</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && (data?.rows.length ?? 0) === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={11}>ยังไม่มีรายการเดินบัญชี FCD</td></tr> : null}
            {!isLoading && data?.rows.map((row) => (
              <tr key={row.id} className={`border-t ${row.type === 'ยอดยกมา' ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'}`}>
                <td className="p-2">{row.date}</td>
                <td className="p-2 text-xs">{row.type}</td>
                <td className="p-2 font-mono text-xs text-blue-600">{row.refNo}</td>
                <td className="max-w-80 truncate p-2 text-xs">{row.description || '-'}</td>
                <MoneyCell tone="in" value={row.foreignIn} />
                <MoneyCell tone="out" value={row.foreignOut} />
                <td className="p-2 text-right">{row.fxRate ? formatMoney(row.fxRate) : '-'}</td>
                <MoneyCell tone="in" value={row.thbIn} />
                <MoneyCell tone="out" value={row.thbOut} />
                <td className="p-2 text-right font-medium">{formatMoney(row.foreignBal)}</td>
                <td className="p-2 text-right font-medium">{formatMoney(row.thbBal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function MoneyCell({ tone, value }: { tone: 'in' | 'out'; value: number }) {
  const color = tone === 'in' ? 'text-emerald-700' : 'text-red-600'
  return <td className={`p-2 text-right ${color}`}>{value ? formatMoney(value) : '-'}</td>
}
