'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type Row = { afterAmount: number; afterPrice: number; afterSupplierId: string; beforeAmount: number; beforePrice: number; beforeSupplierId: string; billId: string; changedBy: string; id: string; itemIndex: number | null; reason: string; swapDate: string }

export function BillSwapHistoryPageClient() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [rows, setRows] = useState<Row[]>([])
  const [search, setSearch] = useState('')

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const payload = await dailyFetchJson<{ rows: Row[] }>('/api/daily/bill-swap-history')
      setRows(payload.rows)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดประวัติเปลี่ยน Supplier ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => !query || `${row.billId} ${row.beforeSupplierId} ${row.afterSupplierId} ${row.reason}`.toLowerCase().includes(query))
  }, [rows, search])

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="rounded-lg bg-white p-4 shadow"><input className="w-full max-w-md rounded-lg border px-3 py-2 text-sm" placeholder="ค้นหาบิล / supplier / เหตุผล" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      <div className="flex text-sm text-slate-600">พบทั้งหมด <span className="mx-1 font-semibold text-slate-900">{filteredRows.length}</span> รายการ</div>
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">บิล</th><th className="p-2 text-left">Supplier เดิม</th><th className="p-2 text-left">Supplier ใหม่</th><th className="p-2 text-right">ราคาเก่า</th><th className="p-2 text-right">ราคาใหม่</th><th className="p-2 text-right">ส่วนต่างยอด</th><th className="p-2 text-left">เหตุผล</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && filteredRows.map((row) => <tr key={row.id} className="border-t hover:bg-slate-50"><td className="p-2">{row.swapDate}</td><td className="p-2 font-mono text-xs">{row.billId}</td><td className="p-2">{row.beforeSupplierId || '-'}</td><td className="p-2">{row.afterSupplierId || '-'}</td><td className="p-2 text-right">{formatMoney(row.beforePrice)}</td><td className="p-2 text-right">{formatMoney(row.afterPrice)}</td><td className="p-2 text-right font-semibold">{formatMoney(row.afterAmount - row.beforeAmount)}</td><td className="p-2">{row.reason || '-'}</td></tr>)}
            {!isLoading && filteredRows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={8}>ยังไม่มีประวัติ</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
