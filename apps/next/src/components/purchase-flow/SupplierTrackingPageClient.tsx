'use client'

import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type SupplierTrackingRow = {
  avgBuy: number
  billCount: number
  code: string
  deliveryCompletionPct: number
  deductionPct: number
  gradeAdjustmentCount: number
  id: string
  paidAmount: number
  paidPct: number
  payable: number
  paymentCount: number
  purchaseAmount: number
  qty: number
  supplierName: string
  wtiCount: number
}

type SupplierTrackingPayload = {
  byProduct: Array<{ amount: number; avgBuy: number; billCount: number; productName: string; qty: number; suppliers: number }>
  detail?: SupplierTrackingDetail | null
  filters?: { suppliers: Array<{ active: boolean | null; code: string | null; id: string; name: string }> }
  monthly: Array<{ amount: number; month: string; qty: number }>
  rows: SupplierTrackingRow[]
  summary: { paidAmount: number; payable: number; purchaseAmount: number; qty: number; suppliers: number }
  year: string
}

type SupplierTrackingDetail = {
  bills: Array<{ amount: number; avgBuy: number; date: string; docNo: string; href: string; paidAmount: number; payable: number; qty: number; status: string }>
  gradeAdjustments: Array<{ date: string; docNo: string; qtyDiff: number; reason: string; status: string; valueDiff: number }>
  monthly: Array<{ billCount: number; month: string; paidAmount: number; payable: number; paymentCount: number; purchaseAmount: number; qty: number }>
  payments: Array<{ amount: number; date: string; docNo: string; method: string; netAmount: number; status: string }>
  products: Array<{ amount: number; avgBuy: number; billCount: number; productName: string; qty: number }>
  qualitySignals: {
    deliveryCompletionPct: number
    deductionPct: number
    gradeAdjustmentCount: number
    paymentReliabilityPct: number
    returnSignalStatus: string
    wtiCount: number
  }
  supplier: { code: string; id: string; name: string }
  weightTickets: Array<{ billedWeight: number; date: string; deductWeight: number; docNo: string; grossWeight: number; netWeight: number; remainingWeight: number; status: string }>
}

const monthLabels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']

export function SupplierTrackingPageClient() {
  const [data, setData] = useState<SupplierTrackingPayload | null>(null)
  const [detail, setDetail] = useState<SupplierTrackingDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [month, setMonth] = useState('')
  const [search, setSearch] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [view, setView] = useState<'list' | 'top10' | 'yearCompare'>('list')
  const [year, setYear] = useState(String(new Date().getFullYear()))

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ year })
    if (month) params.set('month', month)
    if (supplierId) params.set('supplierId', supplierId)
    if (search.trim()) params.set('q', search.trim())
    return params.toString()
  }, [month, search, supplierId, year])

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<SupplierTrackingPayload>(`/api/tracking/supplier?${queryString}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Supplier Tracking ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [queryString])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openDetail = useCallback(async (row: SupplierTrackingRow) => {
    setIsDetailLoading(true)
    setDetail({
      bills: [],
      gradeAdjustments: [],
      monthly: [],
      payments: [],
      products: [],
      qualitySignals: {
        deliveryCompletionPct: row.deliveryCompletionPct,
        deductionPct: row.deductionPct,
        gradeAdjustmentCount: row.gradeAdjustmentCount,
        paymentReliabilityPct: row.paidPct,
        returnSignalStatus: 'ยังไม่มี purchase return source table ใน schema ปัจจุบัน',
        wtiCount: row.wtiCount,
      },
      supplier: { code: row.code, id: row.id, name: row.supplierName },
      weightTickets: [],
    })
    try {
      const params = new URLSearchParams(queryString)
      params.set('detailId', row.id)
      const payload = await dailyFetchJson<SupplierTrackingPayload>(`/api/tracking/supplier?${params.toString()}`)
      setDetail(payload.detail ?? null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดรายละเอียด Supplier ไม่ได้')
      setDetail(null)
    } finally {
      setIsDetailLoading(false)
    }
  }, [queryString])

  const rows = data?.rows ?? []

  const topFive = rows.slice(0, 5)
  const topPurchase = [...rows].sort((left, right) => right.purchaseAmount - left.purchaseAmount).slice(0, 10)
  const topQty = [...rows].sort((left, right) => right.qty - left.qty).slice(0, 10)
  const cheapest = [...rows].filter((row) => row.avgBuy > 0).sort((left, right) => left.avgBuy - right.avgBuy).slice(0, 10)
  const expensive = [...rows].filter((row) => row.avgBuy > 0).sort((left, right) => right.avgBuy - left.avgBuy).slice(0, 10)
  const topPayable = [...rows].sort((left, right) => right.payable - left.payable).slice(0, 10)
  const maxMonthAmount = Math.max(1, ...(data?.monthly ?? []).map((item) => item.amount))
  const exportHref = `/api/tracking/supplier?${queryString}&format=xlsx`
  const paidAmount = rows.reduce((sum, row) => sum + row.paidAmount, 0)
  const payable = rows.reduce((sum, row) => sum + row.payable, 0)

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="rounded-md bg-white p-3 shadow">
        <div className="grid gap-2 md:grid-cols-6">
          <input className="rounded-md border px-3 py-2 text-sm" type="number" value={year} onChange={(event) => setYear(event.target.value)} />
          <select className="rounded-md border px-3 py-2 text-sm" value={month} onChange={(event) => setMonth(event.target.value)}>
            <option value="">ทั้งปี</option>
            {months.map((value, index) => <option key={value} value={value}>{monthLabels[index]}</option>)}
          </select>
          <select className="rounded-md border px-3 py-2 text-sm md:col-span-2" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">Supplier ทั้งหมด</option>
            {(data?.filters?.suppliers ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.code ? `${supplier.code} - ${supplier.name}` : supplier.name}</option>)}
          </select>
          <input className="rounded-md border px-3 py-2 text-sm" placeholder="ค้นหา Supplier" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          <a className="hidden md:inline-flex items-center justify-center rounded-md bg-blue-700 px-4 py-2 text-center text-sm font-bold text-white" href={exportHref}>📥 XLSX</a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SummaryCard color="blue" label="💰 ยอดซื้อรวม" value={formatMoney(rows.reduce((sum, row) => sum + row.purchaseAmount, 0))} />
        <SummaryCard color="indigo" label="⚖️ น้ำหนักรวม" value={`${formatMoney(rows.reduce((sum, row) => sum + row.qty, 0))} กก.`} />
        <SummaryCard color="red" label="🏦 เจ้าหนี้ค้าง" value={formatMoney(payable)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-md bg-white p-4 shadow lg:col-span-2">
          <div className="mb-3 text-sm font-semibold text-slate-700">ยอดซื้อรายเดือน {data?.year ?? year}</div>
          <div className="grid grid-cols-12 items-end gap-2">
            {(data?.monthly ?? []).map((item, index) => (
              <div key={item.month} className="flex min-h-40 flex-col items-center justify-end gap-1">
                <div className="w-full rounded-md-t bg-blue-500" style={{ height: `${Math.max(4, (item.amount / maxMonthAmount) * 128)}px` }} />
                <div className="text-[10px] text-slate-500">{monthLabels[index]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md bg-white p-4 shadow">
          <div className="mb-3 text-sm font-bold text-slate-700">🏆 Top 5 Supplier</div>
          <BarList rows={topFive.map((row) => ({ label: row.supplierName, value: row.purchaseAmount }))} />
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <MiniMetric label="จ่ายแล้ว" value={formatMoney(paidAmount)} />
            <MiniMetric label="ค้างจ่าย" value={formatMoney(payable)} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 rounded-md bg-white p-2 shadow">
        <Tab active={view === 'list'} label="รายการ" onClick={() => setView('list')} />
        <Tab active={view === 'top10'} label="Top 10" onClick={() => setView('top10')} />
        <Tab active={view === 'yearCompare'} label="รายปี" onClick={() => setView('yearCompare')} />
      </div>

      {view === 'top10' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TopPanel rows={topPurchase.map((row) => ({ label: row.supplierName, value: row.purchaseAmount }))} title="Top 10 ยอดซื้อ" />
          <TopPanel rows={topQty.map((row) => ({ label: row.supplierName, value: row.qty }))} title="Top 10 น้ำหนัก" />
          <TopPanel rows={cheapest.map((row) => ({ label: row.supplierName, value: row.avgBuy }))} title="Top 10 ราคาถูกสุด" />
          <TopPanel rows={expensive.map((row) => ({ label: row.supplierName, value: row.avgBuy }))} title="Top 10 ราคาแพงสุด" />
          <TopPanel rows={topPayable.map((row) => ({ label: row.supplierName, value: row.payable }))} title="Top 10 เจ้าหนี้ค้าง" />
        </div>
      ) : null}

      {view === 'yearCompare' ? <YearCompare monthly={data?.monthly ?? []} /> : null}

      {view === 'list' ? (
        <>
          {/* Mobile Card list for main tracking list */}
          <div className="block md:hidden space-y-3 mb-4">
            {isLoading ? (
              <div className="rounded-md bg-white p-8 text-center text-slate-500 shadow-sm border border-slate-200">กำลังโหลดข้อมูล</div>
            ) : null}
            
            {!isLoading && rows.map((row) => (
              <div key={row.id} className="rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2" role="button" tabIndex={0} onClick={() => void openDetail(row)} onKeyDown={(event) => { if (event.key === 'Enter') void openDetail(row) }}>
                <div className="flex justify-between items-start">
                  <span className="font-bold text-slate-800 text-sm">{row.supplierName}</span>
                  <span className="text-xs font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{row.code || '-'}</span>
                </div>
                
                <div className="text-xs text-slate-600 space-y-1">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="font-semibold text-slate-500 block">บิล: </span>
                      <span className="text-slate-800">{row.billCount} ใบ</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block">น้ำหนัก: </span>
                      <span className="text-slate-800 font-semibold">{formatMoney(row.qty)} กก.</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block">เฉลี่ย/กก: </span>
                      <span className="text-slate-800">{formatMoney(row.avgBuy)} บาท</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100/60 mt-1">
                    <div>
                      <span className="font-semibold text-slate-400 block">ยอดซื้อ: </span>
                      <span className="text-blue-700 font-bold tabular-nums">{formatMoney(row.purchaseAmount)} บาท</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500 block">ค้างจ่าย: </span>
                      <span className="text-red-700 font-bold tabular-nums">{formatMoney(row.payable)} ({row.paidPct.toFixed(0)}% จ่าย)</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-100/60 mt-1">
                    <div>
                      <span className="font-semibold text-slate-400 block">WTI: </span>
                      <span className="text-slate-800">{row.wtiCount} ใบ</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-400 block">ส่งครบ: </span>
                      <span className="text-emerald-700 font-semibold">{row.deliveryCompletionPct.toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-400 block">หัก: </span>
                      <span className="text-amber-700 font-semibold">{row.deductionPct.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {!isLoading && rows.length === 0 ? (
              <div className="rounded-md bg-white p-8 text-center text-slate-400 shadow-sm border border-slate-200">
                ไม่มีข้อมูล Supplier Tracking
              </div>
            ) : null}
          </div>

          <div className="hidden md:block overflow-x-auto rounded-md bg-white shadow mb-4">
            <table className="w-full min-w-[1180px] text-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-left">Supplier</th>
                  <th className="p-2 text-right">บิล</th>
                  <th className="p-2 text-right">น้ำหนัก</th>
                  <th className="p-2 text-right">ยอดซื้อ</th>
                  <th className="p-2 text-right">ราคาเฉลี่ย</th>
                  <th className="p-2 text-right">จ่ายแล้ว</th>
                  <th className="p-2 text-right">ค้างจ่าย</th>
                  <th className="p-2 text-right">% จ่าย</th>
                  <th className="p-2 text-right">WTI</th>
                  <th className="p-2 text-right">ส่งครบ</th>
                  <th className="p-2 text-right">หัก%</th>
                  <th className="p-2 text-right">Grade</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={13}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && rows.length === 0 ? <tr><td className="p-8 text-center text-slate-400" colSpan={13}>ไม่มีข้อมูล Supplier Tracking</td></tr> : null}
                {!isLoading && rows.map((row) => (
                  <tr key={row.id} className="cursor-pointer border-t hover:bg-blue-50/40" onClick={() => void openDetail(row)}>
                    <td className="p-2 font-mono text-xs text-slate-500">{row.code || '-'}</td>
                    <td className="p-2 font-medium">{row.supplierName}</td>
                    <td className="p-2 text-right">{row.billCount}</td>
                    <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                    <td className="p-2 text-right font-semibold text-blue-700">{formatMoney(row.purchaseAmount)}</td>
                    <td className="p-2 text-right">{formatMoney(row.avgBuy)}</td>
                    <td className="p-2 text-right">{formatMoney(row.paidAmount)}</td>
                    <td className="p-2 text-right text-red-700">{formatMoney(row.payable)}</td>
                    <td className="p-2 text-right">{row.paidPct.toFixed(1)}%</td>
                    <td className="p-2 text-right">{row.wtiCount}</td>
                    <td className="p-2 text-right font-semibold text-emerald-700">{row.deliveryCompletionPct.toFixed(1)}%</td>
                    <td className="p-2 text-right text-amber-700">{row.deductionPct.toFixed(1)}%</td>
                    <td className="p-2 text-right">{row.gradeAdjustmentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card list for Product breakdown */}
          <div className="block md:hidden space-y-3">
            <div className="border-b bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-700 rounded-t-md">Product breakdown จากบิลรับซื้อ (มือถือ)</div>
            {(data?.byProduct ?? []).slice(0, 20).map((row) => (
              <div key={row.productName} className="rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2">
                <span className="font-bold text-slate-800 text-sm block">{row.productName}</span>
                
                <div className="text-xs text-slate-600 grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="font-semibold text-slate-500">คู่ค้า / บิล: </span>
                    <span className="text-slate-800">{row.suppliers} ราย / {row.billCount} ใบ</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">ราคาเฉลี่ย: </span>
                    <span className="text-slate-800 font-semibold">{formatMoney(row.avgBuy)} บาท</span>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-2 pt-1 border-t border-slate-100/60">
                    <div>
                      <span className="font-semibold text-slate-400 block">น้ำหนักรวม: </span>
                      <span className="text-slate-800 tabular-nums">{formatMoney(row.qty)} กก.</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-400 block">ยอดซื้อรวม: </span>
                      <span className="text-slate-900 font-bold tabular-nums">{formatMoney(row.amount)} บาท</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!isLoading && (data?.byProduct ?? []).length === 0 ? (
              <div className="rounded-md bg-white p-6 text-center text-xs text-slate-400 shadow-sm border border-slate-200">
                ไม่มี item detail สำหรับ product breakdown
              </div>
            ) : null}
          </div>

          <div className="hidden md:block overflow-x-auto rounded-md bg-white shadow">
            <div className="border-b bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">Product breakdown จากบิลรับซื้อ</div>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-100"><tr><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">Supplier</th><th className="p-2 text-right">บิล</th><th className="p-2 text-right">น้ำหนัก</th><th className="p-2 text-right">ยอดซื้อ</th><th className="p-2 text-right">ราคาเฉลี่ย</th></tr></thead>
              <tbody>
                {(data?.byProduct ?? []).slice(0, 20).map((row) => (
                  <tr key={row.productName} className="border-t hover:bg-slate-50">
                    <td className="p-2 font-medium">{row.productName}</td>
                    <td className="p-2 text-right">{row.suppliers}</td>
                    <td className="p-2 text-right">{row.billCount}</td>
                    <td className="p-2 text-right">{formatMoney(row.qty)}</td>
                    <td className="p-2 text-right font-semibold">{formatMoney(row.amount)}</td>
                    <td className="p-2 text-right">{formatMoney(row.avgBuy)}</td>
                  </tr>
                ))}
                {!isLoading && (data?.byProduct ?? []).length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={6}>ไม่มี item detail สำหรับ product breakdown</td></tr> : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <SupplierDetailDialog detail={detail} isLoading={isDetailLoading} onOpenChange={(open) => { if (!open) setDetail(null) }} />
    </section>
  )
}

function SupplierDetailDialog({ detail, isLoading, onOpenChange }: { detail: SupplierTrackingDetail | null; isLoading: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={detail !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-hidden !p-0" fallbackTitle="Supplier Tracking Detail">
        <DialogHeader>
          <DialogTitle>{detail?.supplier.name ?? 'รายละเอียด Supplier'}</DialogTitle>
          <DialogDescription>{detail?.supplier.code ?? ''} · Purchase Bills / Payments / WTI / Grade Adjust / Product mix</DialogDescription>
        </DialogHeader>
        <div className="max-h-[72vh] space-y-4 overflow-y-auto p-4">
          {isLoading ? <div className="rounded-md bg-slate-50 p-6 text-center text-sm text-slate-500">กำลังโหลดรายละเอียด</div> : null}
          {!isLoading && detail ? (
            <>
              <DetailSection title="Reliability / Quality Signals">
                <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
                  <SignalMetric label="ส่งครบจาก WTI" value={`${detail.qualitySignals.deliveryCompletionPct.toFixed(1)}%`} />
                  <SignalMetric label="หักน้ำหนัก" value={`${detail.qualitySignals.deductionPct.toFixed(1)}%`} />
                  <SignalMetric label="จ่ายดี" value={`${detail.qualitySignals.paymentReliabilityPct.toFixed(1)}%`} />
                  <SignalMetric label="WTI" value={`${detail.qualitySignals.wtiCount} ใบ`} />
                  <SignalMetric label="Grade Adjust" value={`${detail.qualitySignals.gradeAdjustmentCount} รายการ`} />
                  <SignalMetric label="Return" value={detail.qualitySignals.returnSignalStatus} />
                </div>
              </DetailSection>
              <DetailSection title="Purchase Bill">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'น้ำหนัก', 'ยอดซื้อ', 'ราคาเฉลี่ย', 'จ่ายแล้ว', 'ค้างจ่าย', 'สถานะ']}
                  rows={detail.bills.map((row) => [formatDateDisplay(row.date), row.docNo, formatMoney(row.qty), formatMoney(row.amount), formatMoney(row.avgBuy), formatMoney(row.paidAmount), formatMoney(row.payable), row.status])}
                />
              </DetailSection>
              <DetailSection title="Payment">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'วิธีจ่าย', 'ยอดจ่าย', 'สุทธิ', 'สถานะ']}
                  rows={detail.payments.map((row) => [formatDateDisplay(row.date), row.docNo, row.method, formatMoney(row.amount), formatMoney(row.netAmount), row.status])}
                />
              </DetailSection>
              <DetailSection title="Monthly Purchase / Payment Trend">
                <SimpleTable
                  headers={['เดือน', 'บิล', 'จ่าย', 'น้ำหนัก', 'ยอดซื้อ', 'จ่ายแล้ว', 'ค้างจ่าย']}
                  rows={detail.monthly.map((row, index) => [monthLabels[index] ?? row.month, String(row.billCount), String(row.paymentCount), formatMoney(row.qty), formatMoney(row.purchaseAmount), formatMoney(row.paidAmount), formatMoney(row.payable)])}
                />
              </DetailSection>
              <DetailSection title="WTI / Delivery">
                <SimpleTable
                  headers={['วันที่', 'WTI', 'น้ำหนักสุทธิ', 'ชั่งบิลแล้ว', 'คงเหลือ', 'หักน้ำหนัก', 'สถานะ']}
                  rows={detail.weightTickets.map((row) => [formatDateDisplay(row.date), row.docNo, formatMoney(row.netWeight), formatMoney(row.billedWeight), formatMoney(row.remainingWeight), formatMoney(row.deductWeight), row.status])}
                />
              </DetailSection>
              <DetailSection title="Grade Adjust">
                <SimpleTable
                  headers={['วันที่', 'เอกสาร', 'Qty Diff', 'Value Diff', 'เหตุผล', 'สถานะ']}
                  rows={detail.gradeAdjustments.map((row) => [formatDateDisplay(row.date), row.docNo, formatMoney(row.qtyDiff), formatMoney(row.valueDiff), row.reason, row.status])}
                />
              </DetailSection>
              <DetailSection title="Product Mix">
                <SimpleTable
                  headers={['สินค้า', 'บิล', 'น้ำหนัก', 'ยอดซื้อ', 'ราคาเฉลี่ย']}
                  rows={detail.products.map((row) => [row.productName, String(row.billCount), formatMoney(row.qty), formatMoney(row.amount), formatMoney(row.avgBuy)])}
                />
              </DetailSection>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DetailSection({ children, title }: { children: ReactNode; title: string }) {
  return <section className="rounded-md border border-slate-200 bg-white"><div className="border-b bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">{title}</div>{children}</section>
}

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-slate-100"><tr>{headers.map((header) => <th key={header} className="p-2 text-left">{header}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td className="p-6 text-center text-slate-400" colSpan={headers.length}>ไม่มีข้อมูล</td></tr> : null}
          {rows.map((row, index) => <tr key={index} className="border-t">{row.map((cell, cellIndex) => <td key={`${index}-${headers[cellIndex]}`} className={cellIndex === 0 || cellIndex === 1 || cellIndex === headers.length - 1 ? 'p-2' : 'p-2 text-right'}>{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

function SummaryCard({ color, label, value }: { color: 'blue' | 'indigo' | 'red'; label: string; value: string }) {
  const gradient = color === 'red' ? 'from-red-500 to-rose-600' : color === 'indigo' ? 'from-indigo-500 to-violet-600' : 'from-blue-500 to-indigo-600'
  return <div className={`rounded-md bg-gradient-to-br ${gradient} p-5 text-white shadow-xl`}><div className="text-xs opacity-80">{label}</div><div className="mt-1 font-mono text-3xl font-bold">{value}</div></div>
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-2"><div className="text-slate-500">{label}</div><div className="font-mono font-bold text-slate-900">{value}</div></div>
}

function SignalMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-slate-50 p-3"><div className="text-xs font-semibold text-slate-500">{label}</div><div className="mt-1 text-sm font-bold text-slate-900">{value}</div></div>
}

function Tab({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button className={active ? 'rounded-md bg-blue-700 px-4 py-2 text-sm font-bold text-white' : 'rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600'} type="button" onClick={onClick}>{label}</button>
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return <div className="space-y-2">{rows.length === 0 ? <div className="py-8 text-center text-slate-400">ไม่มีข้อมูล</div> : rows.map((row, index) => <div key={row.label}><div className="mb-1 flex justify-between text-xs"><span>{index + 1}. {row.label}</span><b>{formatMoney(row.value)}</b></div><div className="h-2 rounded-md bg-slate-100"><div className="h-2 rounded-md bg-blue-500" style={{ width: `${Math.min(100, row.value / max * 100)}%` }} /></div></div>)}</div>
}

function TopPanel({ rows, title }: { rows: { label: string; value: number }[]; title: string }) {
  return <div className="overflow-hidden rounded-md bg-white shadow"><div className="border-b bg-blue-50 p-3 font-bold text-blue-700">{title}</div><table className="w-full text-sm"><tbody>{rows.map((row, index) => <tr key={row.label} className="border-t"><td className="p-2 font-bold">{index + 1}</td><td className="p-2">{row.label}</td><td className="p-2 text-right font-semibold">{formatMoney(row.value)}</td></tr>)}</tbody></table></div>
}

function YearCompare({ monthly }: { monthly: SupplierTrackingPayload['monthly'] }) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-md bg-white shadow">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-slate-100"><tr><th className="p-2 text-left">เดือน</th><th className="p-2 text-right">น้ำหนัก</th><th className="p-2 text-right">ยอดซื้อ</th><th className="p-2 text-right">ราคาเฉลี่ย</th></tr></thead>
          <tbody>{monthly.map((row, index) => <tr key={row.month} className="border-t"><td className="p-2">{monthLabels[index]}</td><td className="p-2 text-right">{formatMoney(row.qty)}</td><td className="p-2 text-right font-semibold text-blue-700">{formatMoney(row.amount)}</td><td className="p-2 text-right">{formatMoney(row.qty > 0 ? row.amount / row.qty : 0)}</td></tr>)}</tbody>
        </table>
      </div>

      {/* Mobile Card list */}
      <div className="block md:hidden space-y-3">
        {monthly.map((row, index) => (
          <div key={row.month} className="rounded-md border border-slate-100 bg-white p-4 shadow-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-800 text-sm">{monthLabels[index]}</span>
              <span className="text-xs font-semibold text-blue-700 tabular-nums">{formatMoney(row.amount)} บาท</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>
                <span className="text-slate-400 font-medium">น้ำหนัก: </span>
                <span className="font-semibold text-slate-700">{formatMoney(row.qty)} กก.</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium">ราคาเฉลี่ย: </span>
                <span className="font-semibold text-slate-700">{formatMoney(row.qty > 0 ? row.amount / row.qty : 0)} บาท/กก.</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
