'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type AnyRow = Record<string, number | string | boolean | null | undefined>
type LmeConfig = { fxRate: number; kgPerContainer: number; lmeAluminumUSD: number; lmeBrassUSD: number; lmeCopperUSD: number; updatedAt: string; updatedBy: string }
type SalesPlanPayload = {
  filters: { channels: { id: string; name: string }[]; metalGroups: string[]; month: string }
  lmeConfig: LmeConfig
  planRows: AnyRow[]
  productAnalysis: AnyRow[]
  sourceState: { limitations: string[] }
  summary: Record<string, number>
}
type CommissionPayload = {
  billRows: AnyRow[]
  filters: { dateFrom: string; dateTo: string; periods: string[] }
  salesRows: AnyRow[]
  sourceState: { limitations: string[] }
  suppliers: AnyRow[]
  totals: Record<string, number>
}

function money(value: unknown) {
  return formatMoney(typeof value === 'number' ? value : Number(value ?? 0))
}

function text(value: unknown) {
  return String(value ?? '')
}

function num(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function SalesPlanPageClient() {
  const [data, setData] = useState<SalesPlanPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterChannel, setFilterChannel] = useState('')

  useEffect(() => {
    dailyFetchJson<SalesPlanPayload>('/api/sales-plan').then((payload) => {
      setData(payload)
      setMonth(payload.filters.month)
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้'))
  }, [])

  const s = data?.summary ?? {}
  const analysisRows = useMemo(() => (data?.productAnalysis ?? [])
    .filter((row) => !filterGroup || text(row.metalGroup).includes(filterGroup))
    .filter((row) => !filterChannel || filterChannel), [data, filterGroup, filterChannel])
  
  const remainingContainers = analysisRows.reduce((sum, row) => sum + num(row.remainingContainers), 0)
  const stockTotal = analysisRows.reduce((sum, row) => sum + num(row.stock), 0)
  const lockedTotal = analysisRows.reduce((sum, row) => sum + num(row.lockedKg), 0)
  const remainingKgTotal = analysisRows.reduce((sum, row) => sum + num(row.remainingKg), 0)
  const remainingValueTotal = analysisRows.reduce((sum, row) => sum + num(row.value), 0)
  const projectedProfitTotal = analysisRows.reduce((sum, row) => sum + num(row.projectedProfit), 0)

  const exportPlan = () => {
    downloadCsv(
      `sales_plan_${month || data?.filters.month || 'current'}.csv`,
      ['Month', 'Product', 'ช่องทาง', 'Customer', 'Containers', 'Kg/ตู้', 'รวม กก.', '% LME', 'LME (USD/MT)', 'FX', 'ราคาขาย (THB/kg)', 'สถานะ'],
      (data?.planRows ?? []).map((row) => [month || text(data?.filters.month), text(row.productName), text(row.channel), text(row.customerName), money(row.containers), money(row.kgPerContainer), money(row.totalKg), money(row.sellPctLme), money(row.lme), money(row.fx), money(row.sellPrice), text(row.status)]),
    )
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 text-sm">
        <LmeStat label="🥉 ทองแดง LME" value={`${money(data?.lmeConfig.lmeCopperUSD)} USD/MT`} />
        <LmeStat label="🌟 ทองเหลือง LME" value={`${money(data?.lmeConfig.lmeBrassUSD)} USD/MT`} />
        <LmeStat label="💱 USD/THB" value={money(data?.lmeConfig.fxRate)} />
        <LmeStat label="📦 กก./ตู้" value={`${money(data?.lmeConfig.kgPerContainer)} กก.`} />
        <div className="text-xs text-slate-400 font-medium self-center px-2">LME Config ยังเป็น read-only จนกว่าจะมีหน้าตั้งค่าเฉพาะ</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
        <label className="text-xs font-bold text-slate-500">เดือน</label>
        <input className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white font-medium text-slate-700 h-10 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        <select className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white font-medium text-slate-700 h-10 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" value={filterGroup} onChange={(event) => setFilterGroup(event.target.value)}>
          <option value="">ทุกหมวด (ทองแดง+ทองเหลือง)</option>
          <option value="ทองแดง">🥉 ทองแดง เท่านั้น</option>
          <option value="ทองเหลือง">🌟 ทองเหลือง เท่านั้น</option>
        </select>
        <select className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white font-medium text-slate-700 h-10 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" value={filterChannel} onChange={(event) => setFilterChannel(event.target.value)}>
          <option value="">ทุกช่องทาง</option>
          <option value="export">🌍 ส่งออก</option>
          <option value="domestic">🇹🇭 ในประเทศ</option>
        </select>
        <span className="flex-1" />
        <button className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-400 outline-none focus:outline-none focus:ring-0 cursor-not-allowed opacity-60 h-10 flex items-center justify-center" disabled type="button">+ เพิ่มรายการ</button>
        <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors outline-none focus:outline-none focus:ring-0 shadow-xs h-10 flex items-center justify-center" onClick={exportPlan} type="button">📥 Export CSV</button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-lg shrink-0">📋</div>
          <div>
            <div className="text-xs text-slate-500 font-semibold mb-0.5">รายการแผน</div>
            <div className="text-lg font-bold text-slate-800 leading-tight">{money(s.plansCount)}</div>
            <div className="text-xs text-slate-400 font-medium mt-0.5">🔒 {money(s.lockedCount)} / ⏳ {money(s.pendingCount)}</div>
          </div>
        </div>
        <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-lg shrink-0">📦</div>
          <div>
            <div className="text-xs text-slate-500 font-semibold mb-0.5">จำนวนตู้รวม</div>
            <div className="text-lg font-bold text-blue-700 leading-tight">{money(s.totalContainers)}</div>
            <div className="text-xs text-slate-400 font-medium mt-0.5">🔒 ล็อก {money(s.lockedContainers)}</div>
          </div>
        </div>
        <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-lg shrink-0">⚖️</div>
          <div>
            <div className="text-xs text-slate-500 font-semibold mb-0.5">น้ำหนักรวม</div>
            <div className="text-lg font-bold text-slate-800 leading-tight">{money(s.totalKg)} กก.</div>
            <div className="text-xs text-slate-400 font-medium mt-0.5">เฉลี่ย {money(s.avgPctLme)}% LME</div>
          </div>
        </div>
        <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg shrink-0">💰</div>
          <div>
            <div className="text-xs text-slate-500 font-semibold mb-0.5">กำไรล็อกแล้ว</div>
            <div className={`text-lg font-bold leading-tight ${num(s.totalLockedProfit) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{money(s.totalLockedProfit)}</div>
            <div className="text-xs text-slate-400 font-medium mt-0.5">เฉพาะที่ล็อกราคาแล้ว</div>
          </div>
        </div>
        <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-lg shrink-0">📈</div>
          <div>
            <div className="text-xs text-slate-500 font-semibold mb-0.5">กำไรคาดการณ์</div>
            <div className={`text-lg font-bold leading-tight ${num(s.totalProjectedProfit) >= 0 ? 'text-amber-600' : 'text-red-500'}`}>{money(s.totalProjectedProfit)}</div>
            <div className="text-xs text-slate-400 font-medium mt-0.5">ถ้าขายตามแผน</div>
          </div>
        </div>
      </div>

      {/* 1. Sales Plan Section */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 text-xs font-semibold text-slate-600">
          📝 ตารางวางแผน — ปลดล็อก = อยู่ในขั้นเสนอ / ล็อก = ราคายืนยันแล้วและกันยอดตามแผนขาย
        </div>

        {/* Desktop view */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/60">
              <tr>
                <th className="p-2.5 text-left font-semibold text-slate-600">สินค้า</th>
                <th className="w-28 p-2.5 text-center font-semibold text-slate-600">ช่องทาง</th>
                <th className="p-2.5 text-left font-semibold text-slate-600">ลูกค้า</th>
                <th className="w-20 p-2.5 text-right font-semibold text-slate-600">ตู้</th>
                <th className="w-24 p-2.5 text-right font-semibold text-slate-600">กก./ตู้</th>
                <th className="w-28 p-2.5 text-right font-semibold text-slate-600">รวม กก.</th>
                <th className="w-20 bg-amber-50/20 p-2.5 text-right font-semibold text-amber-800">% LME</th>
                <th className="w-24 p-2.5 text-right font-semibold text-slate-600">LME (USD/MT)</th>
                <th className="w-20 p-2.5 text-right font-semibold text-slate-600">FX</th>
                <th className="w-28 bg-emerald-50/20 p-2.5 text-right font-semibold text-emerald-800">ราคา (THB/kg)</th>
                <th className="w-28 p-2.5 text-center font-semibold text-slate-600">สถานะ</th>
                <th className="p-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.planRows ?? []).map((row) => (
                <tr className="hover:bg-slate-50/50 transition-colors" key={text(row.id)}>
                  <td className="p-1.5"><select className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs bg-slate-50 outline-none" disabled value={text(row.productId)}><option>{text(row.productName) || '-เลือก-'}</option></select></td>
                  <td className="p-1.5"><select className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs bg-slate-50 outline-none" disabled value={text(row.channel)}><option>{text(row.channel) || 'ส่งออก'}</option></select></td>
                  <td className="p-1.5"><select className="w-full rounded-xl border border-slate-200 px-2 py-1 text-xs bg-slate-50 outline-none" disabled value={text(row.customerId)}><option>{text(row.customerName) || '-เลือก-'}</option></select></td>
                  <td className="p-1.5"><input className="w-full rounded-xl border border-slate-200 px-2 py-1 text-right text-xs bg-slate-50 outline-none" disabled type="number" value={num(row.containers)} /></td>
                  <td className="p-1.5"><input className="w-full rounded-xl border border-slate-200 px-2 py-1 text-right text-xs bg-slate-50 outline-none" disabled type="number" value={num(row.kgPerContainer)} /></td>
                  <td className="p-1.5 text-right font-semibold text-slate-800">{money(row.totalKg)}</td>
                  <td className="p-1.5"><input className="w-full rounded-xl border border-amber-200 bg-amber-50/30 px-2 py-1 text-right text-xs font-bold text-amber-700 outline-none" disabled type="number" value={num(row.sellPctLme)} /></td>
                  <td className="p-1.5 text-right text-xs text-slate-400 font-medium">{money(row.lme)}</td>
                  <td className="p-1.5 text-right text-xs text-slate-400 font-medium">{money(row.fx)}</td>
                  <td className="bg-emerald-50/20 p-1.5 text-right font-bold text-emerald-600">{money(row.sellPrice)}</td>
                  <td className="p-1.5 text-center"><button className="w-full rounded-xl bg-amber-100/50 px-2.5 py-1 text-xs font-semibold text-amber-700 opacity-80 cursor-not-allowed" disabled type="button">⏳ Pending — กดล็อก</button></td>
                  <td className="p-1.5 text-right"><button className="rounded-full w-6 h-6 flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 opacity-60 transition-colors" disabled type="button">×</button></td>
                </tr>
              ))}
              {!(data?.planRows ?? []).length ? <tr><td className="py-8 text-center text-slate-400 font-semibold" colSpan={12}>ยังไม่มีรายการในเดือนนี้ - กด + เพิ่มรายการ</td></tr> : null}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden p-4 space-y-3 bg-slate-50/20">
          {(data?.planRows ?? []).map((row) => (
            <div key={text(row.id)} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                <div className="font-bold text-slate-800 text-sm">{text(row.productName) || 'ไม่ได้ระบุสินค้า'}</div>
                <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{text(row.channel) || 'ส่งออก'}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">ลูกค้า</span>
                  <span className="text-slate-700 font-semibold">{text(row.customerName) || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">ตู้ / น้ำหนักต่อตู้</span>
                  <span className="text-slate-700 font-semibold">{money(row.containers)} ตู้ / {money(row.kgPerContainer)} กก.</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">รวม กก.</span>
                  <span className="text-slate-800 font-bold text-sm">{money(row.totalKg)} กก.</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">% LME</span>
                  <span className="text-amber-700 font-bold">{money(row.sellPctLme)}%</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">LME / FX</span>
                  <span className="text-slate-500 font-semibold">{money(row.lme)} USD / {money(row.fx)}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">ราคาขาย (THB/kg)</span>
                  <span className="text-emerald-600 font-bold text-sm">{money(row.sellPrice)} ฿</span>
                </div>
              </div>
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-semibold">สถานะ:</span>
                <div className="flex gap-2">
                  <button className="rounded-xl bg-amber-100/50 px-2.5 py-1 text-xs font-semibold text-amber-700 opacity-80 cursor-not-allowed" disabled type="button">⏳ Pending — กดล็อก</button>
                  <button className="rounded-full w-6 h-6 flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 opacity-60 transition-colors" disabled type="button">×</button>
                </div>
              </div>
            </div>
          ))}
          {!(data?.planRows ?? []).length ? <div className="text-center text-slate-400 py-4 font-semibold text-xs">ยังไม่มีรายการในเดือนนี้ - กด + เพิ่มรายการ</div> : null}
        </div>
      </div>

      {/* 2. Analysis Section */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">📊 วิเคราะห์แผนขาย vs สต๊อกว่างขาย — ผู้บริหารตัดสินใจ</h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">เปรียบเทียบราคาที่เสนอในแผนขาย vs WAC ของสต๊อกที่ยังว่างให้ขาย</p>
          </div>
        </div>

        {/* Desktop View Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="p-2.5 text-left font-semibold text-slate-600">สินค้า</th>
                <th className="p-2.5 text-left font-semibold text-slate-600">หมวด</th>
                <th className="p-2.5 text-right font-semibold text-slate-600">Stock รวม (กก.)</th>
                <th className="p-2.5 text-right font-semibold text-emerald-700">🔒 ล็อกแล้ว (กก.)</th>
                <th className="bg-yellow-50/20 p-2.5 text-right font-semibold text-yellow-800">⏳ ว่างให้ขาย (กก.)</th>
                <th className="p-2.5 text-right font-semibold text-slate-600">WAC ต้นทุน</th>
                <th className="bg-amber-50/20 p-2.5 text-right font-semibold text-amber-800">ราคาเสนอดีสุด</th>
                <th className="p-2.5 text-right font-semibold text-slate-600">% LME</th>
                <th className="bg-emerald-50/20 p-2.5 text-right font-semibold text-emerald-800">กำไรคาดการณ์</th>
                <th className="bg-emerald-50/20 p-2.5 text-right font-semibold text-emerald-800">Margin %</th>
                <th className="p-2.5 text-center font-semibold text-slate-600">คำแนะนำ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analysisRows.map((row) => (
                <tr className="hover:bg-slate-50/50 transition-colors" key={text(row.code)}>
                  <td className="p-2.5"><div className="font-semibold text-slate-800">{text(row.name)}</div><div className="font-mono text-xs text-slate-400 font-semibold">{text(row.code)}</div></td>
                  <td className="p-2.5 text-xs text-slate-500 font-medium">{text(row.metalGroup)}</td>
                  <td className="p-2.5 text-right text-slate-700 font-medium">{money(row.stock)}</td>
                  <td className="p-2.5 text-right font-semibold text-emerald-600">{money(row.lockedKg)}</td>
                  <td className={`bg-yellow-50/20 p-2.5 text-right font-bold ${num(row.remainingKg) > 0 ? 'text-yellow-600' : 'text-slate-400'}`}>{money(row.remainingKg)}</td>
                  <td className="p-2.5 text-right text-slate-400 font-medium">{money(row.wac)}</td>
                  <td className="bg-amber-50/20 p-2.5 text-right font-bold text-amber-700">{num(row.bestPlanPrice) > 0 ? money(row.bestPlanPrice) : '-'}</td>
                  <td className="p-2.5 text-right text-xs font-semibold text-slate-500">{num(row.bestPlanPct) > 0 ? `${money(row.bestPlanPct)}%` : '-'}</td>
                  <td className={`bg-emerald-50/20 p-2.5 text-right font-bold ${num(row.projectedProfit) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{num(row.bestPlanPrice) > 0 ? money(row.projectedProfit) : '-'}</td>
                  <td className={`bg-emerald-50/20 p-2.5 text-right text-xs font-bold ${num(row.projectedMarginPct) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{num(row.bestPlanPrice) > 0 ? `${money(row.projectedMarginPct)}%` : '-'}</td>
                  <td className="p-2.5 text-center"><span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{text(row.recommendation)}</span></td>
                </tr>
              ))}
              {!analysisRows.length ? <tr><td className="py-8 text-center text-slate-400 font-semibold" colSpan={11}>ไม่มีสต๊อกทองแดง/ทองเหลืองให้วิเคราะห์</td></tr> : null}
            </tbody>
            {analysisRows.length ? <tfoot className="border-t border-slate-200 bg-slate-50/50 font-bold text-slate-700"><tr><td className="p-3 text-xs" colSpan={2}>รวม</td><td className="p-3 text-right text-slate-700 text-xs">{money(stockTotal)}</td><td className="p-3 text-right text-emerald-600 text-xs">{money(lockedTotal)}</td><td className="bg-yellow-50/20 p-3 text-right text-yellow-600 text-xs">{money(remainingKgTotal)}</td><td colSpan={3} /><td className={`p-3 text-right text-xs ${projectedProfitTotal >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{money(projectedProfitTotal)}</td><td colSpan={2} /></tr></tfoot> : null}
          </table>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden p-4 space-y-3 bg-slate-50/20 border-t border-slate-100">
          {analysisRows.map((row) => (
            <div key={text(row.code)} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-3">
              <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                <div>
                  <div className="font-bold text-slate-800 text-sm">{text(row.name)}</div>
                  <div className="font-mono text-xs text-slate-400 font-semibold">{text(row.code)}</div>
                </div>
                <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{text(row.metalGroup)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">Stock รวม / 🔒 ล็อกแล้ว</span>
                  <span className="text-slate-800 font-semibold">{money(row.stock)} / <span className="text-emerald-600 font-bold">{money(row.lockedKg)}</span> กก.</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">⏳ ว่างให้ขาย</span>
                  <span className={`font-bold ${num(row.remainingKg) > 0 ? 'text-yellow-600' : 'text-slate-400'}`}>{money(row.remainingKg)} กก.</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium font-semibold">WAC ต้นทุน</span>
                  <span className="text-slate-500 font-bold">{money(row.wac)} ฿</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">ราคาเสนอดีสุด (% LME)</span>
                  <span className="text-amber-700 font-bold">{num(row.bestPlanPrice) > 0 ? `${money(row.bestPlanPrice)} ฿` : '-'} {num(row.bestPlanPct) > 0 ? `(${money(row.bestPlanPct)}%)` : ''}</span>
                </div>
                <div className="col-span-2 border-t border-slate-50 pt-2 flex justify-between items-center">
                  <span className="text-slate-400 font-medium">กำไรคาดการณ์ / Margin:</span>
                  <span className={`font-bold text-sm ${num(row.projectedProfit) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{num(row.bestPlanPrice) > 0 ? `${money(row.projectedProfit)} ฿` : '-'} {num(row.projectedMarginPct) > 0 ? `(${money(row.projectedMarginPct)}%)` : ''}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">คำแนะนำ:</span>
                <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{text(row.recommendation)}</span>
              </div>
            </div>
          ))}
          {!analysisRows.length ? <div className="text-center text-slate-400 py-4 font-semibold text-xs">ไม่มีสต๊อกทองแดง/ทองเหลืองให้วิเคราะห์</div> : null}
        </div>
      </div>

      {/* 3. Containers Remaining Section */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 p-4">
          <h3 className="font-bold text-slate-800 text-sm">📦 สต๊อกว่างขาย คงเหลือหลังหักล็อกราคา — เดือน {(month || data?.filters.month) ?? ''}</h3>
          <div className="text-xs flex items-center gap-1.5">
            <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-slate-700 font-bold">รวม {money(remainingKgTotal)} กก.</span>
            <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-emerald-700 font-bold border border-emerald-100">มูลค่า WAC {money(remainingValueTotal)}</span>
          </div>
        </div>

        {/* Desktop View Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200/60">
              <tr>
                <th className="p-2.5 text-left font-semibold text-slate-600">รหัส</th>
                <th className="p-2.5 text-left font-semibold text-slate-700">สินค้า</th>
                <th className="p-2.5 text-left font-semibold text-slate-700">หมวด</th>
                <th className="p-2.5 text-right font-semibold text-slate-700">Stock ทั้งหมด (กก.)</th>
                <th className="p-2.5 text-right font-semibold text-emerald-700">🔒 ล็อกแล้ว (กก.)</th>
                <th className="p-2.5 text-right font-semibold text-emerald-700">🔒 ล็อกแล้ว (ตู้)</th>
                <th className="bg-yellow-50/20 p-2.5 text-right font-semibold text-yellow-800">⏳ รอล็อก (กก.)</th>
                <th className="bg-yellow-50/20 p-2.5 text-right font-semibold text-yellow-800">⏳ รอล็อก (ตู้)</th>
                <th className="p-2.5 text-right font-semibold text-slate-700">WAC</th>
                <th className="p-2.5 text-right font-semibold text-slate-700">มูลค่า WAC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analysisRows.map((row) => (
                <tr className={`hover:bg-slate-50/50 transition-colors ${num(row.remainingKg) > 0 ? '' : 'opacity-60'}`} key={`${text(row.code)}-remain`}>
                  <td className="p-2.5 font-mono text-xs text-slate-400 font-semibold">{text(row.code)}</td>
                  <td className="p-2.5 text-slate-800 font-medium">{text(row.name)}</td>
                  <td className="p-2.5 text-xs text-slate-500 font-medium">{text(row.metalGroup)}</td>
                  <td className="p-2.5 text-right text-slate-700 font-medium">{money(row.stock)}</td>
                  <td className="p-2.5 text-right font-semibold text-emerald-600">{money(row.lockedKg)}</td>
                  <td className="p-2.5 text-right text-emerald-600 font-semibold">{money(0)}</td>
                  <td className={`bg-yellow-50/20 p-2.5 text-right font-bold ${num(row.remainingKg) > 0 ? 'text-yellow-600' : 'text-slate-400'}`}>{money(row.remainingKg)}</td>
                  <td className={`bg-yellow-50/20 p-2.5 text-right font-bold ${num(row.remainingContainers) > 0 ? 'text-yellow-600' : 'text-slate-400'}`}>{money(row.remainingContainers)}</td>
                  <td className="p-2.5 text-right text-slate-400 font-medium">{money(row.wac)}</td>
                  <td className="p-2.5 text-right font-bold text-slate-700">{money(row.value)}</td>
                </tr>
              ))}
              {!analysisRows.length ? <tr><td className="py-8 text-center text-slate-400 font-semibold" colSpan={10}>ไม่มีสต๊อกทองแดง/ทองเหลือง</td></tr> : null}
            </tbody>
            {analysisRows.length ? <tfoot className="border-t border-slate-100 bg-slate-50/50 font-bold text-slate-700"><tr><td className="p-3 text-xs" colSpan={3}>รวม</td><td className="p-3 text-right text-slate-700 text-xs">{money(stockTotal)}</td><td className="p-3 text-right text-emerald-600 text-xs">{money(lockedTotal)}</td><td className="p-3 text-right text-emerald-600 text-xs">{money(0)}</td><td className="bg-yellow-50/20 p-3 text-right text-yellow-600 text-xs">{money(remainingKgTotal)}</td><td className="bg-yellow-50/20 p-3 text-right text-yellow-600 text-xs">{money(remainingContainers)}</td><td /><td className="p-3 text-right text-slate-700 text-xs">{money(remainingValueTotal)}</td></tr></tfoot> : null}
          </table>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden p-4 space-y-3 bg-slate-50/20 border-t border-slate-100">
          {analysisRows.map((row) => (
            <div key={`${text(row.code)}-remain`} className={`bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-3 ${num(row.remainingKg) > 0 ? '' : 'opacity-65'}`}>
              <div className="flex justify-between items-start border-b border-slate-100 pb-2">
                <div>
                  <div className="font-bold text-slate-800 text-sm">{text(row.name)}</div>
                  <div className="font-mono text-xs text-slate-400 font-semibold">{text(row.code)}</div>
                </div>
                <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{text(row.metalGroup)}</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">Stock ทั้งหมด / 🔒 ล็อกแล้ว (กก. / ตู้)</span>
                  <span className="text-slate-700 font-semibold">{money(row.stock)} / <span className="text-emerald-600 font-bold">{money(row.lockedKg)}</span> (0 ตู้)</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5 font-medium">⏳ รอล็อก (กก. / ตู้)</span>
                  <span className={`font-bold ${num(row.remainingKg) > 0 ? 'text-yellow-600' : 'text-slate-400'}`}>{money(row.remainingKg)} กก. / {money(row.remainingContainers)} ตู้</span>
                </div>
                <div className="col-span-2 border-t border-slate-50 pt-2 flex justify-between items-center">
                  <span className="text-slate-400 font-medium">WAC / มูลค่า WAC:</span>
                  <span className="text-slate-800 font-bold">{money(row.wac)} ฿ / {money(row.value)} ฿</span>
                </div>
              </div>
            </div>
          ))}
          {!analysisRows.length ? <div className="text-center text-slate-500 py-4 font-semibold text-xs">ไม่มีสต๊อกทองแดง/ทองเหลือง</div> : null}
        </div>
      </div>

      <Notice text={data?.sourceState.limitations[0]} />
      {error ? <ErrorBox text={error} /> : null}
    </section>
  )
}

export function SalesCommissionPageClient() {
  const [data, setData] = useState<CommissionPayload | null>(null)
  const [selectedSales, setSelectedSales] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dailyFetchJson<CommissionPayload>('/api/sales-commission').then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้'))
  }, [])

  const sales = (data?.salesRows ?? []).find((row) => text(row.id) === selectedSales)
  const billRows = (data?.billRows ?? []).filter((row) => text(row.salesId) === selectedSales)

  if (selectedSales && sales) {
    return (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div>
            <div className="font-bold text-slate-800 text-base">{text(sales.name)}</div>
            <div className="text-xs text-slate-500 font-semibold">{text(sales.code)} · {text(sales.phone) || '-'}</div>
          </div>
          <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 shadow-xs outline-none focus:outline-none focus:ring-0 transition-colors h-10 flex items-center justify-center" type="button" onClick={() => setSelectedSales('')}>
            ← กลับ
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Metric label="จำนวนบิลรับซื้อ" value={money(billRows.length)} tone="blue" />
          <Metric label="น้ำหนักรวม" value={`${money(sales.qty)} กก.`} tone="amber" />
          <Metric label="ยอดรับซื้อรวม" value={money(sales.purchaseAmt)} tone="blue" />
        </div>
        <Panel title="🏭 Supplier ในความดูแล">
          <SimpleTable headers={['Supplier', 'บิล', 'น้ำหนัก', 'ยอดรับซื้อ', 'ราคาเฉลี่ย/กก.', '% ของ Total']} rows={billRows.map((row) => [text(row.supplierName), '1', money(row.qty), money(row.amount), money(row.price), `${money(num(row.amount) / Math.max(1, num(sales.purchaseAmt)) * 100)}%`])} />
        </Panel>
        <Panel title="📊 รายการสินค้าละเอียด">
          <SimpleTable headers={['วันที่', 'เลขที่บิล', 'Supplier', 'สินค้า', 'น้ำหนัก', 'ราคาซื้อ', 'ราคาหน้าใบ', 'ยอดรวม']} rows={billRows.map((row) => [formatDateDisplay(text(row.date)), text(row.docNo), text(row.supplierName), text(row.productName), money(row.qty), money(row.price), money(row.facePrice), money(row.amount)])} />
        </Panel>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">📅 ช่วงเวลา:</span>
          {['วันนี้', '7 วัน', 'เดือนนี้', 'ไตรมาส', 'ปีนี้'].map((p) => (
            <button key={p} className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-1.5 text-xs font-semibold text-slate-600 outline-none focus:outline-none focus:ring-0 cursor-not-allowed opacity-60" disabled type="button">{p}</button>
          ))}
          <span className="control inline-flex items-center text-xs font-semibold bg-slate-50 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200">{formatDateDisplay(data?.filters.dateFrom ?? '')}</span>
          <span className="text-slate-400 font-bold">&rarr;</span>
          <span className="control inline-flex items-center text-xs font-semibold bg-slate-50 text-slate-700 px-3 py-1.5 rounded-xl border border-slate-200">{formatDateDisplay(data?.filters.dateTo ?? '')}</span>
          <button className="ml-auto rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 active:bg-slate-700 outline-none focus:outline-none focus:ring-0 transition-colors shadow-xs h-10 flex items-center justify-center opacity-60 cursor-not-allowed" disabled type="button">📥 Export CSV</button>
        </div>
        <div className="mt-3 text-xs flex items-center gap-1.5">
          <span className="font-semibold text-slate-500">📋 บิลซื้อทั้งหมด:</span>
          <span className="rounded-xl bg-slate-100 text-slate-700 px-2.5 py-1 text-xs font-bold">{money(data?.totals.bills)} บิล</span>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BigCard label="📦 น้ำหนักรับซื้อรวม" tone="amber" value={`${money(data?.totals.qty)} กก.`} />
        <BigCard label="💰 ยอดรับซื้อรวม" tone="blue" value={money(data?.totals.purchaseAmt)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.salesRows ?? []).map((row) => (
          <button key={text(row.id)} className="rounded-xl border border-slate-100 bg-white p-5 text-left shadow-sm hover:border-slate-300 hover:bg-slate-50/30 outline-none transition-all duration-200" type="button" onClick={() => setSelectedSales(text(row.id))}>
            <div className="font-bold text-slate-800 text-base">{text(row.name)}</div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">{text(row.code)} · {text(row.phone)}</div>
            <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs">
              <Mini label="บิล" value={money(row.billCount)} />
              <Mini label="Supplier" value={money(row.supplierCount)} />
            </div>
            <div className="mt-4 space-y-2.5">
              <Metric label="น้ำหนักรับซื้อ" value={`${money(row.qty)} กก.`} tone="amber" />
              <Metric label="ยอดรับซื้อรวม" value={money(row.purchaseAmt)} tone="blue" />
              <Metric label="ค่าคอมเดือนนี้" value={money(row.commission)} tone={row.eligible ? 'emerald' : 'slate'} />
            </div>
          </button>
        ))}
      </div>
      <Panel title={`🏭 ผูก Supplier กับพนักงานขาย (${data?.suppliers.length ?? 0} ราย)`}>
        <div className="mb-3 flex gap-2">
          <input className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white font-medium text-slate-700 h-10 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" placeholder="ค้นหา Supplier" readOnly />
          <select className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white font-medium text-slate-700 h-10 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200">
            <option>ทุก Sales</option>
          </select>
        </div>
        <SimpleTable headers={['รหัส', 'ชื่อ Supplier', 'โทร', 'พนักงานขายที่รับผิดชอบ']} rows={(data?.suppliers ?? []).slice(0, 200).map((row) => [text(row.code), text(row.name), text(row.phone), text((data?.salesRows ?? []).find((sale) => text(sale.id) === text(row.salesId))?.name ?? '(ไม่ได้กำหนด)')])} />
      </Panel>
      <Notice text={data?.sourceState.limitations[0]} />
      {error ? <ErrorBox text={error} /> : null}
    </section>
  )
}

function SimpleTable({ empty = 'ไม่มีข้อมูล', headers, rowClick, rows }: { empty?: string; headers: string[]; rowClick?: (index: number) => void; rows: string[][] }) {
  return (
    <div>
      {/* Desktop View Table */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-slate-100 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              {headers.map((h) => (
                <th key={h} className="p-3 text-left font-semibold text-slate-600 text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr
                key={index}
                className={`hover:bg-slate-50/50 transition-colors ${rowClick ? 'cursor-pointer' : ''}`}
                onClick={() => rowClick?.(index)}
              >
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={`p-2.5 text-slate-700 font-medium ${cellIndex > 1 ? 'text-right' : ''}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="py-8 text-center text-slate-400 font-semibold" colSpan={headers.length}>{empty}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Mobile View Card List */}
      <div className="block lg:hidden space-y-3">
        {rows.map((row, index) => (
          <div
            key={index}
            onClick={() => rowClick?.(index)}
            className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2 hover:bg-slate-50/50 active:bg-slate-200/40 transition-colors ${rowClick ? 'cursor-pointer' : ''}`}
          >
            <div className="flex justify-between items-start border-b border-slate-100 pb-2">
              <div className="font-bold text-slate-800 text-sm leading-tight">{row[0]}</div>
              {row[1] && <span className="text-xs bg-slate-100 font-semibold px-2 py-0.5 rounded text-slate-500">{row[1]}</span>}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {headers.slice(2).map((header, hIndex) => {
                const cellValue = row[hIndex + 2]
                if (header === '' && cellValue === '▼ ดูรายละเอียด') return null
                return (
                  <div key={header} className="flex flex-col">
                    <span className="text-slate-400 font-semibold mb-0.5">{header}</span>
                    <span className="text-slate-700 font-bold">{cellValue || '-'}</span>
                  </div>
                )
              })}
            </div>
            {rowClick && (
              <div className="text-right text-xs font-semibold text-blue-600 pt-1 border-t border-slate-50 flex items-center justify-end gap-1">
                <span>ดูรายละเอียด</span>
                <span>&rarr;</span>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 ? (
          <div className="bg-white p-6 text-center text-slate-400 rounded-xl border border-slate-200 shadow-sm font-semibold text-xs">
            {empty}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
      <div className="bg-slate-900 p-3 text-sm font-bold text-white">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function LmeStat({ label, value }: { label: string; value: string }) {
  const icon = label.slice(0, 2)
  const cleanLabel = label.slice(2).trim()
  return (
    <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4 flex-1 w-full">
      <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-lg shrink-0">
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-500 font-semibold mb-0.5">{cleanLabel}</div>
        <div className="text-sm font-bold text-slate-800">{value}</div>
      </div>
    </div>
  )
}

function Metric({ label, tone, value }: { label: string; tone: string; value: string }) {
  const colors: Record<string, { bg: string; text: string; emoji: string }> = {
    amber: { bg: 'bg-amber-50', text: 'text-amber-600', emoji: '⏳' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', emoji: '📋' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', emoji: '📈' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', emoji: '📦' },
    red: { bg: 'bg-red-50', text: 'text-red-600', emoji: '⚠️' },
    slate: { bg: 'bg-slate-100', text: 'text-slate-600', emoji: '🏷️' }
  }
  const style = colors[tone] ?? colors.slate
  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-4 flex items-center gap-3 w-full">
      <div className={`w-10 h-10 rounded-full ${style.bg} ${style.text} flex items-center justify-center text-lg shrink-0`}>
        {style.emoji}
      </div>
      <div>
        <div className="text-xs text-slate-500 font-semibold mb-0.5">{label}</div>
        <div className="text-lg font-bold text-slate-800 leading-tight">{value}</div>
      </div>
    </div>
  )
}

function BigCard({ label, tone, value }: { label: string; tone: string; value: string }) {
  const isWeight = label.includes('น้ำหนัก')
  const emoji = isWeight ? '📦' : '💰'
  const iconBg = isWeight ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
  return (
    <div className="bg-white shadow-sm border border-slate-200 rounded-xl p-5 flex items-center gap-4 w-full">
      <div className={`w-12 h-12 rounded-full ${iconBg} flex items-center justify-center text-xl shrink-0`}>
        {emoji}
      </div>
      <div>
        <div className="text-xs text-slate-500 font-semibold mb-1">{label}</div>
        <div className="break-words font-mono text-2xl font-bold text-slate-800">{value}</div>
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 text-center shadow-xs">
      <div className="text-xs text-slate-400 font-semibold">{label}</div>
      <div className="text-xs font-bold text-slate-800">{value}</div>
    </div>
  )
}

function Notice({ text: value }: { text?: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-xs font-semibold text-amber-800 shadow-sm leading-relaxed">
      <span>💡 <b>Read/design baseline:</b></span>
      <span className="ml-1.5">{value ?? 'ไม่มี write action ใน baseline นี้'}</span>
    </div>
  )
}

function ErrorBox({ text: value }: { text: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 shadow-sm">
      {value}
    </div>
  )
}
