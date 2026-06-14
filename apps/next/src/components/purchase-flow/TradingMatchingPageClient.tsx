'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type TradingPayload = {
  deals: Array<{ customerName: string; date: string; dealNo: string; grossProfit: number; grossProfitPct: number; id: string; matchedPurchaseAmount: number; matchedQty: number; matchedSalesAmount: number; productName: string; purchaseBillNo: string; salesBillNo: string; status: string; supplierName: string }>
  filters: { statuses: string[] }
  purchases: Array<{ date: string; docNo: string; id: string; matchedAmount: number; remainingAmount: number; supplierName: string; totalAmount: number }>
  sales: Array<{ customerName: string; date: string; docNo: string; id: string; matchedAmount: number; remainingAmount: number; totalAmount: number }>
  summary: { activeDeals: number; grossProfit: number; purchaseRemaining: number; purchaseTotal: number; salesRemaining: number; salesTotal: number }
}

type TradingDealRow = TradingPayload['deals'][number]
type TradingPurchaseRow = TradingPayload['purchases'][number]

const allocationLinks = [
  { href: '/dual-costing/cost-allocation-ledger', label: 'Allocation Ledger' },
  { href: '/dual-costing/deal-margin', label: 'Deal Margin' },
  { href: '/dual-costing/waiting-allocations', label: 'Waiting Allocation' },
]

function isCancelled(status: string) {
  return status.toLowerCase().includes('cancel')
}

export function TradingMatchingPageClient() {
  const [data, setData] = useState<TradingPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedDeal, setSelectedDeal] = useState<TradingDealRow | null>(null)
  const [tab, setTab] = useState<'allocations' | 'remaining'>('allocations')
  const [toDate, setToDate] = useState('')

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      setData(await dailyFetchJson<TradingPayload>('/api/trading/matching'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลด Trading Matching ไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const filteredDeals = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.deals ?? []).filter((row) => {
      if (isCancelled(row.status)) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      if (!query) return true
      return `${row.purchaseBillNo} ${row.salesBillNo} ${row.supplierName} ${row.customerName} ${row.productName}`.toLowerCase().includes(query)
    })
  }, [data?.deals, fromDate, search, toDate])

  const remainingPurchases = useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.purchases ?? []).filter((row) => {
      if (row.remainingAmount <= 0.01) return false
      if (fromDate && row.date < fromDate) return false
      if (toDate && row.date > toDate) return false
      if (!query) return true
      return `${row.docNo} ${row.supplierName}`.toLowerCase().includes(query)
    })
  }, [data?.purchases, fromDate, search, toDate])

  const totals = useMemo(() => {
    const salesAmount = filteredDeals.reduce((sum, row) => sum + row.matchedSalesAmount, 0)
    const costAmount = filteredDeals.reduce((sum, row) => sum + row.matchedPurchaseAmount, 0)
    const grossProfit = salesAmount - costAmount
    const remainingCost = remainingPurchases.reduce((sum, row) => sum + row.remainingAmount, 0)
    const remainingMatchedCost = remainingPurchases.reduce((sum, row) => sum + row.matchedAmount, 0)
    return {
      allocationCount: filteredDeals.length,
      costAmount,
      grossProfit,
      grossProfitPct: salesAmount > 0 ? grossProfit / salesAmount * 100 : 0,
      remainingCost,
      remainingMatchedCost,
      salesAmount,
    }
  }, [filteredDeals, remainingPurchases])

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'xlsx' })
    if (search.trim()) params.set('q', search.trim())
    if (fromDate) params.set('from', fromDate)
    if (toDate) params.set('to', toDate)
    return `/api/trading/matching?${params.toString()}`
  }, [fromDate, search, toDate])

  const resetFilters = () => {
    setFromDate('')
    setSearch('')
    setToDate('')
  }

  const hasFilters = Boolean(search.trim() || fromDate || toDate)

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="relative overflow-hidden rounded-md bg-gradient-to-br from-fuchsia-600 via-purple-700 to-violet-800 p-6 text-white shadow-lg">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
          <div className="relative">
            <div className="text-sm font-semibold uppercase opacity-85">Trading Matching / จับคู่ต้นทุนขาย Trading</div>
            <div className={`mt-2 text-4xl font-bold ${totals.grossProfit >= 0 ? '' : 'text-red-200'}`}>{formatMoney(totals.grossProfit)}</div>
            <div className="mt-1 text-sm opacity-90">Expected GP · GP% = GP / Sale Amount · {totals.allocationCount} allocation</div>
            <div className="mt-4 grid gap-3 border-t border-white/20 pt-4 sm:grid-cols-4">
              <HeroMetric label="Sales Amount" value={formatMoney(totals.salesAmount)} />
              <HeroMetric label="Cost" value={formatMoney(totals.costAmount)} />
              <HeroMetric label="GP%" value={`${totals.grossProfitPct.toFixed(2)}%`} />
              <HeroMetric label="Remaining Cost" value={formatMoney(totals.remainingCost)} />
            </div>
          </div>
        </div>

        <div className="rounded-md border border-purple-100 bg-white p-4 shadow">
          <div className="text-sm font-bold text-slate-800">เส้นทางข้อมูล</div>
          <div className="mt-3 space-y-2 text-xs text-slate-600">
            <FlowLine label="ฝั่งซื้อ" value="PO Buy / Purchase Bill Trading -> Cost Source" />
            <FlowLine label="ฝั่งขาย" value="PO Sell -> Pending Sale -> Sales Bill Trading" />
            <FlowLine label="ผลลัพธ์" value="allocation, expected GP, remaining qty, exposure tracking" />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {allocationLinks.map((item) => (
              <Link key={item.href} className="rounded-md border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100" href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 text-sm">
        <Metric label="Allocation" tone="slate" value={`${totals.allocationCount}`} />
        <Metric label="Expected GP" tone={totals.grossProfit >= 0 ? 'purple' : 'red'} value={formatMoney(totals.grossProfit)} />
        <Metric label="Cost Allocated" tone="emerald" value={formatMoney(totals.costAmount)} />
        <Metric label="Remaining Cost" tone="amber" value={formatMoney(totals.remainingCost)} />
      </div>

      <div className="rounded-md bg-white p-3 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <DatePickerInput ariaLabel="วันที่เริ่มต้น" className="w-[130px]" value={fromDate} onChange={setFromDate} />
          <DatePickerInput ariaLabel="วันที่สิ้นสุด" className="w-[130px]" value={toDate} onChange={setToDate} />
          <input className="min-w-64 flex-1 rounded-md border px-3 py-2 text-sm" placeholder="ค้นหา Sales Bill / Purchase Bill / คู่ค้า / สินค้า" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
          {hasFilters ? <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={resetFilters}>ล้าง</button> : null}
          <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => void loadData()}>Refresh</button>
          <a className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href={exportHref}>Export XLSX</a>
        </div>
      </div>

      <div className="rounded-md border bg-white shadow">
        <div className="flex flex-wrap items-center border-b">
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'allocations' ? 'border-fuchsia-600 text-fuchsia-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('allocations')}>Allocation ({filteredDeals.length})</button>
          <button className={`border-b-2 px-5 py-3 text-sm font-medium ${tab === 'remaining' ? 'border-fuchsia-600 text-fuchsia-700' : 'border-transparent text-slate-500'}`} type="button" onClick={() => setTab('remaining')}>ต้นทุนคงเหลือ ({remainingPurchases.length})</button>
        </div>

        {tab === 'allocations' ? (
          <>
            <div className="block space-y-3 p-4 md:hidden">
              {isLoading ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">กำลังโหลดข้อมูล</div> : null}
              {!isLoading && filteredDeals.map((row) => (
                <button key={row.id} className="block w-full rounded-md border border-slate-100 bg-white p-4 text-left shadow-sm active:bg-slate-50" type="button" onClick={() => setSelectedDeal(row)}>
                  <div className="flex justify-between gap-3">
                    <span className="font-bold text-slate-800">{row.salesBillNo || '-'}</span>
                    <span className="text-xs text-slate-500">{formatDateDisplay(row.date)}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Cost source: {row.purchaseBillNo || '-'}</div>
                  <div className="mt-2 text-xs text-slate-600">{row.supplierName} ไปยัง {row.customerName}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2 text-xs">
                    <Amount label="Cost" tone="red" value={row.matchedPurchaseAmount} />
                    <Amount label="Sales" tone="emerald" value={row.matchedSalesAmount} />
                    <Amount label="GP" tone={row.grossProfit >= 0 ? 'purple' : 'red'} value={row.grossProfit} />
                  </div>
                </button>
              ))}
              {!isLoading && filteredDeals.length === 0 ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm">ยังไม่มี allocation ตามเงื่อนไขที่ค้นหา</div> : null}
            </div>

            <div className="hidden overflow-x-auto p-5 md:block">
              <table className="w-full min-w-[1080px] text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2 text-left">Sales Bill</th>
                    <th className="p-2 text-left">วันที่</th>
                    <th className="p-2 text-left">Cost Source</th>
                    <th className="p-2 text-left">Supplier</th>
                    <th className="p-2 text-left">Customer</th>
                    <th className="p-2 text-left">สินค้า</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Cost</th>
                    <th className="p-2 text-right">Sales Amt</th>
                    <th className="p-2 text-right">Expected GP</th>
                    <th className="p-2 text-right">GP%</th>
                    <th className="p-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={12}>กำลังโหลดข้อมูล</td></tr> : null}
                  {!isLoading && !error && filteredDeals.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={12}>ยังไม่มี allocation ตามเงื่อนไขที่ค้นหา</td></tr> : null}
                  {!isLoading && filteredDeals.map((row) => (
                    <tr key={row.id} className="border-t hover:bg-slate-50">
                      <td className="p-2 font-mono text-xs font-semibold text-slate-800">{row.salesBillNo || '-'}</td>
                      <td className="p-2 text-xs">{formatDateDisplay(row.date)}</td>
                      <td className="p-2 font-mono text-xs">{row.purchaseBillNo || '-'}</td>
                      <td className="p-2 text-xs">{row.supplierName}</td>
                      <td className="p-2 text-xs">{row.customerName}</td>
                      <td className="p-2 text-xs">{row.productName}</td>
                      <td className="p-2 text-right">{formatMoney(row.matchedQty)}</td>
                      <td className="p-2 text-right text-red-600">{formatMoney(row.matchedPurchaseAmount)}</td>
                      <td className="p-2 text-right text-emerald-700">{formatMoney(row.matchedSalesAmount)}</td>
                      <td className={`p-2 text-right font-bold ${row.grossProfit >= 0 ? 'text-purple-700' : 'text-red-600'}`}>{formatMoney(row.grossProfit)}</td>
                      <td className="p-2 text-right">{row.grossProfitPct.toFixed(2)}%</td>
                      <td className="whitespace-nowrap p-2 text-center"><button className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50" type="button" onClick={() => setSelectedDeal(row)}>Detail</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div className="block space-y-3 p-4 md:hidden">
              {remainingPurchases.map((row) => <RemainingPurchaseCard key={row.id} row={row} />)}
              {!isLoading && remainingPurchases.length === 0 ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-slate-400 shadow-sm">ไม่มีต้นทุน Trading คงเหลือ</div> : null}
            </div>

            <div className="hidden p-5 md:block">
              <RemainingPurchaseTable rows={remainingPurchases} />
            </div>
          </>
        )}
      </div>
      {selectedDeal ? <DealDetailModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} /> : null}
    </section>
  )
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] opacity-75">{label}</div><div className="text-lg font-bold">{value}</div></div>
}

function FlowLine({ label, value }: { label: string; value: string }) {
  return <div><span className="font-semibold text-slate-800">{label}: </span>{value}</div>
}

function Amount({ label, tone, value }: { label: string; tone: 'emerald' | 'purple' | 'red'; value: number }) {
  const color = tone === 'emerald' ? 'text-emerald-700' : tone === 'purple' ? 'text-purple-700' : 'text-red-600'
  return <div><span className="block text-slate-400">{label}</span><span className={`font-bold tabular-nums ${color}`}>{formatMoney(value)}</span></div>
}

function RemainingPurchaseCard({ row }: { row: TradingPurchaseRow }) {
  return (
    <div className="rounded-md border border-slate-100 bg-white p-3 text-xs shadow-sm">
      <div className="flex justify-between gap-3 font-bold text-slate-800">
        <span>{row.docNo}</span>
        <span>{formatDateDisplay(row.date)}</span>
      </div>
      <div className="mt-1 text-slate-600">{row.supplierName}</div>
      <div className="mt-2 flex justify-between border-t border-slate-50 pt-2 font-semibold">
        <span>ต้นทุนรวม {formatMoney(row.totalAmount)}</span>
        <span className="text-amber-700">คงเหลือ {formatMoney(row.remainingAmount)}</span>
      </div>
    </div>
  )
}

function RemainingPurchaseTable({ rows }: { rows: TradingPurchaseRow[] }) {
  return (
    <div>
      <div className="mb-2 font-bold text-emerald-700">Trading Purchases / Cost Source — ยังไม่ได้จับ Matched</div>
      <table className="w-full text-xs">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-2 text-left">บิลซื้อ</th>
            <th className="p-2 text-left">วันที่</th>
            <th className="p-2 text-left">Supplier</th>
            <th className="p-2 text-right">มูลค่า</th>
            <th className="p-2 text-right">Matched</th>
            <th className="p-2 text-right">ต้นทุนคงเหลือ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="p-2 font-mono">{row.docNo}</td>
              <td className="p-2">{formatDateDisplay(row.date)}</td>
              <td className="p-2">{row.supplierName}</td>
              <td className="p-2 text-right">{formatMoney(row.totalAmount)}</td>
              <td className="p-2 text-right">{formatMoney(row.matchedAmount)}</td>
              <td className="p-2 text-right font-bold text-amber-700">{formatMoney(row.remainingAmount)}</td>
            </tr>
          ))}
          {rows.length === 0 ? <tr><td className="py-4 text-center text-slate-400" colSpan={6}>ไม่มีต้นทุน Trading คงเหลือ</td></tr> : null}
        </tbody>
      </table>
    </div>
  )
}

function Metric({ label, tone = 'slate', value }: { label: string; tone?: 'amber' | 'emerald' | 'purple' | 'red' | 'slate'; value: string }) {
  const configs = {
    amber: { bg: 'bg-amber-100 text-amber-600', labelColor: 'text-amber-600', valueColor: 'text-amber-700' },
    emerald: { bg: 'bg-emerald-100 text-emerald-600', labelColor: 'text-emerald-600', valueColor: 'text-emerald-700' },
    purple: { bg: 'bg-purple-100 text-purple-600', labelColor: 'text-purple-600', valueColor: 'text-purple-700' },
    red: { bg: 'bg-red-100 text-red-600', labelColor: 'text-red-600', valueColor: 'text-red-700' },
    slate: { bg: 'bg-slate-100 text-slate-600', labelColor: 'text-slate-500', valueColor: 'text-slate-900' },
  }
  const config = configs[tone]

  return (
    <div className="flex flex-1 items-center gap-2.5 rounded-md border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-5">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold sm:h-12 sm:w-12 sm:text-xl ${config.bg}`}>
        {label.slice(0, 1)}
      </div>
      <div>
        <div className={`text-xs ${config.labelColor}`}>{label}</div>
        <div className={`font-bold ${config.valueColor}`}>{value}</div>
      </div>
    </div>
  )
}

function DealDetailModal({ deal, onClose }: { deal: TradingDealRow; onClose: () => void }) {
  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] max-w-2xl !p-0 overflow-hidden flex flex-col bg-slate-900 border-0">
        <DialogHeader className="flex shrink-0 flex-row items-start justify-between gap-3 bg-slate-900 p-4 text-white">
          <div>
            <DialogTitle className="text-lg font-bold text-white">Sales Bill {deal.salesBillNo || '-'}</DialogTitle>
            <DialogDescription className="mt-1 text-xs text-slate-400">
              Cost source {deal.purchaseBillNo || '-'} · {deal.productName}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-5 text-sm">
          <div className="grid gap-3 rounded-md border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-3">
            <Detail label="วันที่" value={deal.date || '-'} />
            <Detail label="Qty" value={formatMoney(deal.matchedQty)} />
            <Detail label="GP %" value={`${formatMoney(deal.grossProfitPct)}%`} />
            <div className="md:col-span-3">
              <Detail label="PB / Supplier" value={`${deal.purchaseBillNo || '-'} · ${deal.supplierName}`} />
            </div>
            <div className="md:col-span-3">
              <Detail label="SB / Customer" value={`${deal.salesBillNo || '-'} · ${deal.customerName}`} />
            </div>
            <Detail label="Cost" value={formatMoney(deal.matchedPurchaseAmount)} />
            <Detail label="Sales" value={formatMoney(deal.matchedSalesAmount)} />
            <Detail label="Expected GP" value={formatMoney(deal.grossProfit)} />
          </div>
        </div>

        <DialogFooter className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <Button className="font-normal" size="sm" type="button" variant="outline" onClick={onClose}>ปิด</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col py-1">
      <div className="text-[10px] font-medium uppercase text-slate-400">{label}</div>
      <div className="mt-0.5 text-xs font-semibold text-slate-800 sm:text-sm">{value}</div>
    </div>
  )
}
