'use client'

import { useCallback, useEffect, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AccountRow = {
  accountNo: string
  balance: number
  bankName: string
  branchName: string
  code: string
  currency: string
  id: string
  name: string
  odLimit: number
  type: string
}

type DueRow = {
  aging: number
  balance: number
  bucket: string
  dueDate: string
  partyName: string
  refNo: string
}

type CashPositionPayload = {
  accounts: AccountRow[]
  byType: Array<{ accounts: number; balance: number; type: string }>
  exposure: {
    ap: { overdue: number; total: number; upcoming7: number }
    ar: { overdue: number; total: number; upcoming7: number }
  }
  nearDue: { ap: DueRow[]; ar: DueRow[] }
  summary: { accountBalance: number; accounts: number; netAfterAp: number; netExposure: number }
}

function typeClass(type: string) {
  if (type === 'เงินสด') return 'bg-emerald-100 text-emerald-700'
  if (type === 'ธนาคาร') return 'bg-blue-100 text-blue-700'
  if (type === 'OD') return 'bg-amber-100 text-amber-700'
  return 'bg-indigo-100 text-indigo-700'
}

function accountBarClass(type: string) {
  if (type === 'OD') return 'bg-amber-400'
  if (type === 'เงินสด') return 'bg-emerald-400'
  return 'bg-blue-400'
}

export function CashPositionPageClient() {
  const [data, setData] = useState<CashPositionPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<CashPositionPayload>('/api/finance/cash-position'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Cash Position ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const accounts = data?.accounts ?? []
  const cashTotal = accounts.filter((row) => row.type === 'เงินสด').reduce((sum, row) => sum + row.balance, 0)
  const bankTotal = accounts.filter((row) => row.type === 'ธนาคาร').reduce((sum, row) => sum + row.balance, 0)
  const fcdTotal = accounts.filter((row) => row.type === 'FCD').reduce((sum, row) => sum + row.balance, 0)
  const odUsedTotal = accounts.reduce((sum, row) => sum + (row.type === 'OD' ? Math.max(0, -row.balance) : 0), 0)
  const odAvailTotal = accounts.reduce((sum, row) => sum + (row.type === 'OD' ? Math.max(0, row.odLimit - Math.max(0, -row.balance)) : 0), 0)
  const arTotal = data?.exposure.ar.total ?? 0
  const apTotal = data?.exposure.ap.total ?? 0
  const liquidTotal = cashTotal + bankTotal + fcdTotal
  const netCash = cashTotal + bankTotal + fcdTotal + arTotal - apTotal - odUsedTotal
  const topAccounts = accounts.filter((row) => row.balance > 0).sort((left, right) => right.balance - left.balance).slice(0, 8)
  const topBalance = topAccounts[0]?.balance ?? 0
  const donut = liquidTotal > 0
    ? `conic-gradient(#10b981 0 ${(cashTotal / liquidTotal) * 100}%, #3b82f6 ${(cashTotal / liquidTotal) * 100}% ${((cashTotal + bankTotal) / liquidTotal) * 100}%, #6366f1 ${((cashTotal + bankTotal) / liquidTotal) * 100}% 100%)`
    : '#e2e8f0'

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-xl ${netCash >= 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-700' : 'bg-gradient-to-br from-red-500 to-rose-700'}`}>
          <div className="absolute right-3 top-2 text-7xl opacity-15">{netCash >= 0 ? '💰' : '⚠️'}</div>
          <div className="text-xs opacity-90">Net Cash Position</div>
          <div className="mt-1 text-4xl font-bold">{formatMoney(netCash)}</div>
          <div className="mt-3 text-sm opacity-90">= Cash + Bank + FCD + AR − AP − OD ใช้</div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-2 text-sm font-bold text-slate-700">🥧 องค์ประกอบเงิน (Liquid)</div>
          <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full p-6" style={{ background: donut }}>
            <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-center text-xs font-bold text-slate-700">
              <span className="text-[10px] font-normal text-slate-500">รวม</span>
              <span>{formatMoney(liquidTotal)}</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" />💵 Cash</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-blue-500" />🏦 Bank</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-indigo-500" />💱 FCD</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-2 text-sm font-bold text-slate-700">⚖ AR vs AP</div>
          <div className="space-y-3 text-sm">
            <div>
              <div className="mb-1 flex justify-between"><span className="text-emerald-600">📥 ลูกหนี้ (AR)</span><span className="font-bold text-emerald-700">{formatMoney(arTotal)}</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: '100%' }} /></div>
            </div>
            <div>
              <div className="mb-1 flex justify-between"><span className="text-red-600">📤 เจ้าหนี้ (AP)</span><span className="font-bold text-red-700">{formatMoney(apTotal)}</span></div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-red-500" style={{ width: arTotal > 0 ? `${Math.min(100, (apTotal / arTotal) * 100)}%` : '0%' }} /></div>
            </div>
            <div className={`rounded-lg p-2 text-center ${arTotal >= apTotal ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <div className="text-xs text-slate-500">Net (AR − AP)</div>
              <div className={`text-xl font-bold ${arTotal >= apTotal ? 'text-emerald-700' : 'text-red-700'}`}>{formatMoney(arTotal - apTotal)}</div>
            </div>
          </div>
        </div>
      </div>

      {topAccounts.length > 0 ? (
        <div className="rounded-xl bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top บัญชีที่มียอด</div>
          <div className="space-y-2">
            {topAccounts.map((account, index) => (
              <div key={account.id} className="text-sm">
                <div className="mb-0.5 flex items-center gap-2">
                  <span className="w-4 text-center font-bold text-slate-400">{index + 1}</span>
                  <span className="flex-1 truncate"><b>{account.name}</b> <span className="text-xs text-slate-400">· {account.type}</span></span>
                  <span className={`w-32 text-right font-bold ${account.type === 'OD' ? 'text-amber-700' : account.type === 'เงินสด' ? 'text-emerald-700' : 'text-blue-700'}`}>{formatMoney(account.balance)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${accountBarClass(account.type)}`} style={{ width: topBalance > 0 ? `${(account.balance / topBalance) * 100}%` : '0%' }} /></div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric border="border-emerald-500" label="💵 เงินสดรวม" value={formatMoney(cashTotal)} valueClassName="text-emerald-600" />
        <Metric border="border-blue-500" label="🏦 ธนาคารรวม" value={formatMoney(bankTotal)} valueClassName="text-blue-600" />
        <Metric border="border-indigo-500" label="💱 FCD (THB equiv.)" value={formatMoney(fcdTotal)} valueClassName="text-indigo-600" />
        <div className="rounded-xl border-l-4 border-amber-500 bg-white p-4 shadow">
          <div className="text-xs text-amber-600">⚠ OD ใช้ไป</div>
          <div className="text-2xl font-bold text-amber-600">{formatMoney(odUsedTotal)}</div>
          <div className="text-xs text-slate-500">เหลือใช้ {formatMoney(odAvailTotal)}</div>
        </div>
        <div className="col-span-2 rounded-xl bg-emerald-50 p-4 shadow"><div className="text-xs text-emerald-600">📥 ลูกหนี้รวม (เงินที่จะได้รับ)</div><div className="text-2xl font-bold text-emerald-700">{formatMoney(arTotal)}</div></div>
        <div className="col-span-2 rounded-xl bg-red-50 p-4 shadow"><div className="text-xs text-red-600">📤 เจ้าหนี้รวม (เงินที่ต้องจ่าย)</div><div className="text-2xl font-bold text-red-700">{formatMoney(apTotal)}</div></div>
      </div>

      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white shadow-lg">
        <div className="text-sm opacity-80">Net Cash Position (สภาพคล่องสุทธิ)</div>
        <div className="text-4xl font-bold">{formatMoney(netCash)}</div>
        <div className="mt-2 text-xs opacity-70">= เงินสด + ธนาคาร + FCD + ลูกหนี้ - เจ้าหนี้ - OD ใช้ไป</div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <h3 className="border-b px-4 py-3 font-semibold">รายละเอียดบัญชีเงินทั้งหมด</h3>
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr><th className="p-2 text-left">รหัส</th><th className="p-2 text-left">ชื่อบัญชี</th><th className="p-2 text-left">ประเภท</th><th className="p-2 text-left">ธนาคาร</th><th className="p-2 text-left">เลขบัญชี</th><th className="p-2 text-left">สกุล</th><th className="p-2 text-right">วงเงิน OD</th><th className="p-2 text-right">ยอดคงเหลือ</th></tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && accounts.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-2 font-mono text-xs">{row.code}</td>
                <td className="p-2">{row.name}</td>
                <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs ${typeClass(row.type)}`}>{row.type}</span></td>
                <td className="p-2">{row.bankName || '-'}</td>
                <td className="p-2 font-mono text-xs">{row.accountNo || '-'}</td>
                <td className="p-2">{row.currency}</td>
                <td className="p-2 text-right">{row.odLimit ? formatMoney(row.odLimit) : '-'}</td>
                <td className={`p-2 text-right font-bold ${row.balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMoney(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({ border, label, value, valueClassName }: { border: string; label: string; value: string; valueClassName: string }) {
  return <div className={`rounded-xl border-l-4 bg-white p-4 shadow ${border}`}><div className="text-xs text-slate-500">{label}</div><div className={`text-2xl font-bold ${valueClassName}`}>{value}</div></div>
}
