'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type AnyRow = Record<string, number | string | boolean | null | undefined>
type LmeConfig = { fxRate: number; kgPerContainer: number; lmeAluminumUSD: number; lmeBrassUSD: number; lmeCopperUSD: number; updatedAt: string; updatedBy: string }
type PendingPayload = {
  customers: { id: string; name: string }[]
  lmeConfig: LmeConfig
  metalGroups: string[]
  productDetails: AnyRow[]
  productRows: AnyRow[]
  reconciliation: AnyRow[]
  reconTotals: Record<string, number>
  sourceState: { limitations: string[] }
  summary: Record<string, number>
}
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

export function PendingSalesPageClient() {
  const [data, setData] = useState<PendingPayload | null>(null)
  const [mode, setMode] = useState<'all' | 'pending' | 'sold'>('pending')
  const [customerId, setCustomerId] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dailyFetchJson<PendingPayload>('/api/pending-sales').then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้'))
  }, [])

  const productRows = useMemo(() => (data?.productRows ?? [])
    .filter((row) => selectedGroups.length === 0 || selectedGroups.includes(text(row.metalGroup)))
    .filter((row) => mode === 'all' || (mode === 'pending' ? num(row.remainQty) > 0 : num(row.soldQty) > 0)), [data, mode, selectedGroups])
  const details = (data?.productDetails ?? []).filter((row) => text(row.productId) === selectedProductId).filter((row) => !customerId || text(row.customerId) === customerId)
  const selectedProduct = productRows.find((row) => text(row.productId) === selectedProductId)

  return (
    <section className="space-y-3">
      <Hero tone="from-amber-600 to-orange-600" title="⏰ รายการรอขาย / Pending Sales — เทียบกับ LME" subtitle="สรุปสินค้าที่รอขาย · เปรียบเทียบกับราคา LME · กำไร/ขาดทุน · Cost Pool vs Stock" />
      <LmeCard config={data?.lmeConfig} products={productRows} />
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow">
        <Segment active={mode === 'pending'} color="amber" onClick={() => setMode('pending')}>⏳ ยังรอขาย</Segment>
        <Segment active={mode === 'sold'} color="emerald" onClick={() => setMode('sold')}>✅ ขายแล้ว</Segment>
        <Segment active={mode === 'all'} color="blue" onClick={() => setMode('all')}>📋 ทั้งหมด</Segment>
        <select className="control" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">ทุก Customer</option>{(data?.customers ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
        <span className="flex-1" /><button className="btn-disabled" disabled type="button">📥 Export CSV</button>
      </div>
      <MetalChips groups={data?.metalGroups ?? []} selected={selectedGroups} setSelected={setSelectedGroups} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="รายการสินค้า" value={money(productRows.length)} tone="blue" />
        <Metric label="น้ำหนักรวม" value={`${money(data?.summary.totalRemainQty)} กก.`} tone="amber" />
        <Metric label="มูลค่ารวม" value={money(data?.summary.totalRemainValue)} tone="amber" />
        <Metric label="ราคาเฉลี่ย" value={`${money(data?.summary.avgRemainPrice)}/กก.`} tone="slate" />
        <Metric label="กำไรรวม vs LME" value={money(data?.summary.totalGainVsLme)} tone={(data?.summary.totalGainVsLme ?? 0) >= 0 ? 'emerald' : 'red'} />
      </div>
      {!selectedProductId ? <PendingSummary rows={productRows} mode={mode} onSelect={setSelectedProductId} /> : <PendingDetails details={details} name={text(selectedProduct?.productName)} onBack={() => setSelectedProductId('')} />}
      <PoolStock data={data} />
      <Notice text={data?.sourceState.limitations[0]} />
      {error ? <ErrorBox text={error} /> : null}
    </section>
  )
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
    <section className="space-y-3">
      <Hero action={<button className="rounded-lg bg-white px-4 py-2 font-bold text-amber-700 opacity-70" disabled type="button">+ เพิ่มรายการ</button>} tone="from-amber-700 to-orange-600" title="📋 วางแผนการขาย (Sales Plan) — ทองแดง / ทองเหลือง" subtitle="เสนอ % LME + ช่องทางขาย → กด 🔒 Lock เพื่อยืนยันราคา → ตู้ในรอขายลดลงอัตโนมัติ" />
      <div className="grid grid-cols-2 gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm md:grid-cols-5">
        <LmeStat label="🥉 ทองแดง LME" value={`${money(data?.lmeConfig.lmeCopperUSD)} USD/MT`} />
        <LmeStat label="🌟 ทองเหลือง LME" value={`${money(data?.lmeConfig.lmeBrassUSD)} USD/MT`} />
        <LmeStat label="💱 USD/THB" value={money(data?.lmeConfig.fxRate)} />
        <LmeStat label="📦 กก./ตู้" value={`${money(data?.lmeConfig.kgPerContainer)} กก.`} />
        <div className="text-xs text-slate-500">แก้ที่หน้า รายการรอขาย — Tab LME Config</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow">
        <label className="text-sm">เดือน</label>
        <input className="control" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        <select className="control" value={filterGroup} onChange={(event) => setFilterGroup(event.target.value)}>
          <option value="">ทุกหมวด (ทองแดง+ทองเหลือง)</option>
          <option value="ทองแดง">🥉 ทองแดง เท่านั้น</option>
          <option value="ทองเหลือง">🌟 ทองเหลือง เท่านั้น</option>
        </select>
        <select className="control" value={filterChannel} onChange={(event) => setFilterChannel(event.target.value)}>
          <option value="">ทุกช่องทาง</option>
          <option value="export">🌍 ส่งออก</option>
          <option value="domestic">🇹🇭 ในประเทศ</option>
        </select>
        <span className="flex-1" />
        <button className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700" onClick={exportPlan} type="button">📥 Export CSV</button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="rounded-xl bg-white p-3 shadow">
          <div className="text-xs text-slate-500">รายการแผน</div>
          <div className="text-xl font-bold">{money(s.plansCount)}</div>
          <div className="text-xs text-slate-400">🔒 {money(s.lockedCount)} / ⏳ {money(s.pendingCount)}</div>
        </div>
        <div className="rounded-xl bg-white p-3 shadow">
          <div className="text-xs text-slate-500">จำนวนตู้รวม</div>
          <div className="text-xl font-bold text-blue-700">{money(s.totalContainers)}</div>
          <div className="text-xs text-slate-400">🔒 ล็อก {money(s.lockedContainers)}</div>
        </div>
        <div className="rounded-xl bg-white p-3 shadow">
          <div className="text-xs text-slate-500">น้ำหนักรวม</div>
          <div className="text-xl font-bold text-blue-700">{money(s.totalKg)} กก.</div>
          <div className="text-xs text-slate-400">เฉลี่ย {money(s.avgPctLme)}% LME</div>
        </div>
        <div className="rounded-xl border-l-4 border-emerald-500 bg-emerald-50 p-3 shadow">
          <div className="text-xs text-emerald-700">💰 กำไรล็อกแล้ว (สินค้านี้)</div>
          <div className={`text-xl font-bold ${num(s.totalLockedProfit) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{money(s.totalLockedProfit)}</div>
          <div className="text-xs text-slate-500">เฉพาะที่ล็อกราคาแล้ว</div>
        </div>
        <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50 p-3 shadow">
          <div className="text-xs text-amber-700">📈 กำไรคาดการณ์ (ถ้าขายตามแผน)</div>
          <div className={`text-xl font-bold ${num(s.totalProjectedProfit) >= 0 ? 'text-amber-700' : 'text-red-600'}`}>{money(s.totalProjectedProfit)}</div>
          <div className="text-xs text-slate-500">รอขาย × ราคาเสนอที่ดีสุด</div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow">
        <div className="border-b bg-amber-50 p-2 text-xs text-amber-700">📝 ตารางวางแผน — ปลดล็อก = อยู่ในขั้นเสนอ / ล็อก = ราคายืนยันแล้ว ตู้จะถูกหักจากรอขาย</div>
        <table className="w-full min-w-[1120px] text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">สินค้า</th>
              <th className="w-28 p-2 text-center">ช่องทาง</th>
              <th className="p-2 text-left">ลูกค้า</th>
              <th className="w-20 p-2 text-right">ตู้</th>
              <th className="w-24 p-2 text-right">กก./ตู้</th>
              <th className="w-28 p-2 text-right">รวม กก.</th>
              <th className="w-20 bg-amber-50 p-2 text-right">% LME</th>
              <th className="w-24 p-2 text-right">LME (USD/MT)</th>
              <th className="w-20 p-2 text-right">FX</th>
              <th className="w-28 bg-emerald-50 p-2 text-right">ราคา (THB/kg)</th>
              <th className="w-28 p-2 text-center">สถานะ</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {(data?.planRows ?? []).map((row) => (
              <tr className="border-t hover:bg-amber-50/30" key={text(row.id)}>
                <td className="p-1"><select className="w-full rounded border px-2 py-1 text-sm" disabled value={text(row.productId)}><option>{text(row.productName) || '-เลือก-'}</option></select></td>
                <td className="p-1"><select className="w-full rounded border px-1 py-1 text-xs" disabled value={text(row.channel)}><option>{text(row.channel) || 'ส่งออก'}</option></select></td>
                <td className="p-1"><select className="w-full rounded border px-2 py-1 text-sm" disabled value={text(row.customerId)}><option>{text(row.customerName) || '-เลือก-'}</option></select></td>
                <td className="p-1"><input className="w-full rounded border px-1 py-1 text-right" disabled type="number" value={num(row.containers)} /></td>
                <td className="p-1"><input className="w-full rounded border px-1 py-1 text-right text-xs" disabled type="number" value={num(row.kgPerContainer)} /></td>
                <td className="p-1 text-right font-medium">{money(row.totalKg)}</td>
                <td className="p-1"><input className="w-full rounded border bg-amber-50 px-1 py-1 text-right font-bold" disabled type="number" value={num(row.sellPctLme)} /></td>
                <td className="p-1 text-right text-xs text-slate-500">{money(row.lme)}</td>
                <td className="p-1 text-right text-xs text-slate-500">{money(row.fx)}</td>
                <td className="bg-emerald-50 p-1 text-right font-bold text-emerald-700">{money(row.sellPrice)}</td>
                <td className="p-1 text-center"><button className="w-full rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 opacity-70" disabled type="button">⏳ Pending — กดล็อก</button></td>
                <td className="p-1 text-right"><button className="rounded px-2 text-red-500 opacity-50" disabled type="button">×</button></td>
              </tr>
            ))}
            {!(data?.planRows ?? []).length ? <tr><td className="py-8 text-center text-slate-400" colSpan={12}>ยังไม่มีรายการในเดือนนี้ - กด + เพิ่มรายการ</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="overflow-hidden rounded-xl bg-white shadow">
        <div className="flex items-center justify-between border-b bg-indigo-50 p-3">
          <div>
            <h3 className="font-bold text-indigo-700">📊 วิเคราะห์ขาย vs รายการรอขาย — ผู้บริหารตัดสินใจ</h3>
            <p className="text-xs text-slate-500">เปรียบเทียบราคาที่เสนอ (จากแผน Pending) vs WAC ของสต๊อกที่ยังว่างให้ขาย</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">สินค้า</th><th className="p-2 text-left">หมวด</th><th className="p-2 text-right">Stock รวม (กก.)</th><th className="p-2 text-right">🔒 ล็อกแล้ว (กก.)</th><th className="bg-yellow-50 p-2 text-right">⏳ ว่างให้ขาย (กก.)</th><th className="p-2 text-right">WAC ต้นทุน</th><th className="bg-amber-50 p-2 text-right">ราคาเสนอดีสุด</th><th className="p-2 text-right text-xs">% LME</th><th className="bg-emerald-50 p-2 text-right">กำไรคาดการณ์</th><th className="bg-emerald-50 p-2 text-right text-xs">Margin %</th><th className="p-2 text-center">คำแนะนำ</th></tr></thead>
            <tbody>
              {analysisRows.map((row) => (
                <tr className="border-t hover:bg-indigo-50/30" key={text(row.code)}>
                  <td className="p-2"><div className="font-medium">{text(row.name)}</div><div className="font-mono text-xs text-slate-400">{text(row.code)}</div></td>
                  <td className="p-2 text-xs">{text(row.metalGroup)}</td>
                  <td className="p-2 text-right">{money(row.stock)}</td>
                  <td className="p-2 text-right text-emerald-700">{money(row.lockedKg)}</td>
                  <td className={`bg-yellow-50 p-2 text-right font-bold ${num(row.remainingKg) > 0 ? 'text-yellow-700' : 'text-slate-400'}`}>{money(row.remainingKg)}</td>
                  <td className="p-2 text-right text-slate-500">{money(row.wac)}</td>
                  <td className="bg-amber-50 p-2 text-right font-medium">{num(row.bestPlanPrice) > 0 ? money(row.bestPlanPrice) : '-'}</td>
                  <td className="p-2 text-right text-xs">{num(row.bestPlanPct) > 0 ? `${money(row.bestPlanPct)}%` : '-'}</td>
                  <td className={`bg-emerald-50 p-2 text-right font-bold ${num(row.projectedProfit) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{num(row.bestPlanPrice) > 0 ? money(row.projectedProfit) : '-'}</td>
                  <td className={`bg-emerald-50 p-2 text-right text-xs ${num(row.projectedMarginPct) >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{num(row.bestPlanPrice) > 0 ? `${money(row.projectedMarginPct)}%` : '-'}</td>
                  <td className="p-2 text-center text-xs"><span className="rounded bg-slate-100 px-2 py-1 font-medium text-slate-700">{text(row.recommendation)}</span></td>
                </tr>
              ))}
              {!analysisRows.length ? <tr><td className="py-8 text-center text-slate-400" colSpan={11}>ไม่มีสต๊อกทองแดง/ทองเหลืองให้วิเคราะห์</td></tr> : null}
            </tbody>
            {analysisRows.length ? <tfoot className="bg-slate-100 font-bold"><tr><td className="p-2 text-right" colSpan={2}>รวม</td><td className="p-2 text-right">{money(stockTotal)}</td><td className="p-2 text-right text-emerald-700">{money(lockedTotal)}</td><td className="bg-yellow-50 p-2 text-right text-yellow-700">{money(remainingKgTotal)}</td><td colSpan={3} /><td className={`p-2 text-right ${projectedProfitTotal >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{money(projectedProfitTotal)}</td><td colSpan={2} /></tr></tfoot> : null}
          </table>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl bg-white shadow">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-yellow-50 p-3">
          <h3 className="font-bold text-yellow-700">📦 ตู้รอขาย คงเหลือหลังหักล็อกราคา — เดือน {(month || data?.filters.month) ?? ''}</h3>
          <div className="text-sm"><span className="mr-2 rounded bg-yellow-100 px-2 py-0.5 text-yellow-700">รวม {money(remainingKgTotal)} กก.</span><span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">มูลค่า WAC {money(remainingValueTotal)}</span></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">รหัส</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-left">หมวด</th><th className="p-2 text-right">Stock ทั้งหมด (กก.)</th><th className="p-2 text-right">🔒 ล็อกแล้ว (กก.)</th><th className="p-2 text-right">🔒 ล็อกแล้ว (ตู้)</th><th className="bg-yellow-50 p-2 text-right">⏳ รอล็อก (กก.)</th><th className="bg-yellow-50 p-2 text-right">⏳ รอล็อก (ตู้)</th><th className="p-2 text-right">WAC</th><th className="p-2 text-right">มูลค่า WAC</th></tr></thead>
            <tbody>{analysisRows.map((row) => <tr className={`border-t ${num(row.remainingKg) > 0 ? '' : 'opacity-60'}`} key={`${text(row.code)}-remain`}><td className="p-2 font-mono text-xs">{text(row.code)}</td><td className="p-2">{text(row.name)}</td><td className="p-2 text-xs">{text(row.metalGroup)}</td><td className="p-2 text-right">{money(row.stock)}</td><td className="p-2 text-right text-emerald-700">{money(row.lockedKg)}</td><td className="p-2 text-right text-emerald-700">{money(0)}</td><td className={`bg-yellow-50 p-2 text-right font-bold ${num(row.remainingKg) > 0 ? 'text-yellow-700' : 'text-slate-400'}`}>{money(row.remainingKg)}</td><td className={`bg-yellow-50 p-2 text-right font-bold ${num(row.remainingContainers) > 0 ? 'text-yellow-700' : 'text-slate-400'}`}>{money(row.remainingContainers)}</td><td className="p-2 text-right text-slate-500">{money(row.wac)}</td><td className="p-2 text-right font-medium">{money(row.value)}</td></tr>)}
            {!analysisRows.length ? <tr><td className="py-8 text-center text-slate-400" colSpan={10}>ไม่มีสต๊อกทองแดง/ทองเหลือง</td></tr> : null}</tbody>
            {analysisRows.length ? <tfoot className="bg-slate-100 font-bold"><tr><td className="p-2 text-right" colSpan={3}>รวม</td><td className="p-2 text-right">{money(stockTotal)}</td><td className="p-2 text-right text-emerald-700">{money(lockedTotal)}</td><td className="p-2 text-right text-emerald-700">{money(0)}</td><td className="bg-yellow-50 p-2 text-right text-yellow-700">{money(remainingKgTotal)}</td><td className="bg-yellow-50 p-2 text-right text-yellow-700">{money(remainingContainers)}</td><td /><td className="p-2 text-right">{money(remainingValueTotal)}</td></tr></tfoot> : null}
          </table>
        </div>
      </div>
      <Notice text={data?.sourceState.limitations[0]} />{error ? <ErrorBox text={error} /> : null}
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
    return <section className="space-y-4"><Hero action={<button className="rounded bg-white/20 px-3 py-2 text-sm" type="button" onClick={() => setSelectedSales('')}>← กลับ</button>} tone="from-blue-700 to-indigo-700" title={text(sales.name)} subtitle={`${text(sales.code)} · ${text(sales.phone) || '-'}`} /><div className="grid grid-cols-3 gap-3"><Metric label="จำนวนบิลรับซื้อ" value={money(billRows.length)} tone="blue" /><Metric label="น้ำหนักรวม" value={`${money(sales.qty)} กก.`} tone="amber" /><Metric label="ยอดรับซื้อรวม" value={money(sales.purchaseAmt)} tone="blue" /></div><Panel title="🏭 Supplier ในความดูแล"><SimpleTable headers={['Supplier', 'บิล', 'น้ำหนัก', 'ยอดรับซื้อ', 'ราคาเฉลี่ย/กก.', '% ของ Total']} rows={billRows.map((row) => [text(row.supplierName), '1', money(row.qty), money(row.amount), money(row.price), `${money(num(row.amount) / Math.max(1, num(sales.purchaseAmt)) * 100)}%`])} /></Panel><Panel title="📊 รายการสินค้าละเอียด"><SimpleTable headers={['วันที่', 'เลขที่บิล', 'Supplier', 'สินค้า', 'น้ำหนัก', 'ราคาซื้อ', 'ราคาหน้าใบ', 'ยอดรวม']} rows={billRows.map((row) => [text(row.date), text(row.docNo), text(row.supplierName), text(row.productName), money(row.qty), money(row.price), money(row.facePrice), money(row.amount)])} /></Panel></section>
  }
  return (
    <section className="space-y-4">
      <Hero tone="from-blue-700 to-indigo-700" title="💼 Sales Tracking — ผลงานพนักงาน" subtitle="ผูก Sales กับ Supplier · ดึงยอดบิลรับซื้อ · กดการ์ดเพื่อดูรายละเอียด" />
      <div className="rounded-2xl bg-white p-4 shadow"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-500">📅 ช่วงเวลา:</span>{['วันนี้', '7 วัน', 'เดือนนี้', 'ไตรมาส', 'ปีนี้'].map((p) => <button key={p} className="rounded bg-slate-100 px-3 py-1.5 text-xs font-bold" disabled type="button">{p}</button>)}<input className="control" type="date" value={data?.filters.dateFrom ?? ''} readOnly /><span>→</span><input className="control" type="date" value={data?.filters.dateTo ?? ''} readOnly /><button className="btn-disabled ml-auto" disabled type="button">📥 Export CSV</button></div><div className="mt-2 text-xs"><span className="chip">📋 บิลซื้อ <b>{money(data?.totals.bills)}</b></span></div></div>
      <div className="grid gap-4 md:grid-cols-2"><BigCard label="📦 น้ำหนักรับซื้อรวม" tone="from-amber-500 to-orange-600" value={`${money(data?.totals.qty)} กก.`} /><BigCard label="💰 ยอดรับซื้อรวม" tone="from-blue-600 to-indigo-700" value={money(data?.totals.purchaseAmt)} /></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{(data?.salesRows ?? []).map((row) => <button key={text(row.id)} className="rounded-2xl border-l-4 border-blue-500 bg-white p-5 text-left shadow-lg hover:bg-blue-50" type="button" onClick={() => setSelectedSales(text(row.id))}><div className="font-bold">{text(row.name)}</div><div className="text-xs text-slate-500">{text(row.code)} · {text(row.phone)}</div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><Mini label="บิล" value={money(row.billCount)} /><Mini label="Supplier" value={money(row.supplierCount)} /></div><Metric label="น้ำหนักรับซื้อ" value={`${money(row.qty)} กก.`} tone="amber" /><Metric label="ยอดรับซื้อรวม" value={money(row.purchaseAmt)} tone="blue" /><Metric label="ค่าคอมเดือนนี้" value={money(row.commission)} tone={row.eligible ? 'emerald' : 'slate'} /></button>)}</div>
      <Panel title={`🏭 ผูก Supplier กับพนักงานขาย (${data?.suppliers.length ?? 0} ราย)`}><div className="mb-3 flex gap-2"><input className="control" placeholder="ค้นหา Supplier" readOnly /><select className="control"><option>ทุก Sales</option></select></div><SimpleTable headers={['รหัส', 'ชื่อ Supplier', 'โทร', 'พนักงานขายที่รับผิดชอบ']} rows={(data?.suppliers ?? []).slice(0, 200).map((row) => [text(row.code), text(row.name), text(row.phone), text((data?.salesRows ?? []).find((sale) => text(sale.id) === text(row.salesId))?.name ?? '(ไม่ได้กำหนด)')])} /></Panel>
      <Notice text={data?.sourceState.limitations[0]} />{error ? <ErrorBox text={error} /> : null}
    </section>
  )
}

function Hero({ action, subtitle, title, tone }: { action?: ReactNode; subtitle: string; title: string; tone: string }) {
  return <div className={`rounded-xl bg-gradient-to-r ${tone} p-4 text-white shadow`}><div className="flex items-start justify-between gap-3"><div><h1 className="text-xl font-bold">{title}</h1><p className="mt-1 text-sm opacity-80">{subtitle}</p></div>{action}</div></div>
}

function LmeCard({ config, products }: { config?: LmeConfig; products: AnyRow[] }) {
  return <><div className="rounded-xl bg-white p-4 shadow"><div className="mb-3 flex justify-between"><h3 className="font-bold text-slate-700">📊 LME Reference Pricing</h3><button className="btn-disabled" disabled type="button">💾 บันทึก</button></div><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><LmeStat label="🥉 ทองแดง LME (USD/MT)" value={money(config?.lmeCopperUSD)} /><LmeStat label="🌟 ทองเหลือง LME (USD/MT)" value={money(config?.lmeBrassUSD)} /><LmeStat label="⚪ อลูมิเนียม LME (USD/MT)" value={money(config?.lmeAluminumUSD)} /><LmeStat label="💱 เรท USD/THB" value={money(config?.fxRate)} /></div><div className="mt-2 text-xs text-slate-400">⏰ อัปเดตล่าสุด: {config?.updatedAt ?? '-'} โดย {config?.updatedBy ?? '-'}</div></div><details className="rounded-xl bg-white shadow"><summary className="cursor-pointer p-3 font-bold text-slate-700">📋 ตั้งค่าผู้ซื้อซื้อที่ LME กี่ % ต่อสินค้า — เฉพาะ 🥉 ทองแดง / 🌟 ทองเหลือง</summary><SimpleTable headers={['รหัส', 'สินค้า', 'หมวด', 'LME ฐาน', '% ที่ซื้อ', 'ราคาเป้า', 'WAC', 'Diff']} rows={products.filter((row) => text(row.metalGroup).includes('ทองแดง') || text(row.metalGroup).includes('ทองเหลือง')).map((row) => [text(row.productCode), text(row.productName), text(row.metalGroup), money(text(row.metalGroup).includes('ทองแดง') ? config?.lmeCopperUSD : config?.lmeBrassUSD), `${money(row.lmeBuyPercent)}%`, money(row.lmeTarget), money(row.wac), money(num(row.wac) - num(row.lmeTarget))])} /></details></>
}

function PendingSummary({ mode, onSelect, rows }: { mode: string; onSelect: (id: string) => void; rows: AnyRow[] }) {
  return <SimpleTable headers={['สินค้า', 'หมวด', 'PO', `${mode === 'sold' ? 'ขายแล้ว' : 'รอขาย'} (กก.)`, 'มูลค่า', 'ราคาเฉลี่ย', 'WAC', 'LME Target', 'vs WAC', 'vs LME', '']} rows={rows.map((row) => [text(row.productCode) + ' ' + text(row.productName), text(row.metalGroup), money(row.poCount), money(mode === 'sold' ? row.soldQty : row.remainQty), money(mode === 'sold' ? row.soldValue : row.remainValue), money(row.avgPriceRemain), money(row.wac), money(row.lmeTarget), `${money(row.diffPctWac)}%`, `${money(row.diffPctLme)}%`, '▼ ดูรายละเอียด'])} rowClick={(index) => onSelect(text(rows[index]?.productId))} />
}

function PendingDetails({ details, name, onBack }: { details: AnyRow[]; name: string; onBack: () => void }) {
  return <div className="space-y-3"><div className="flex justify-between rounded border-l-4 border-blue-500 bg-blue-50 p-3"><div><div className="text-xs text-slate-500">เลือกสินค้า</div><div className="font-bold text-blue-700">{name}</div></div><button className="text-sm text-slate-600" type="button" onClick={onBack}>← กลับสรุปทั้งหมด</button></div><SimpleTable headers={['เลขที่ PO', 'วันที่', 'Customer', 'จำนวน', 'ราคา', 'ขายแล้ว', 'รอขาย', 'มูลค่ารอ', 'วันส่ง']} rows={details.map((row) => [text(row.docNo), text(row.date), text(row.customerName), money(row.itemQty), money(row.itemPrice), money(row.matched), money(row.remaining), money(row.remainValue), text(row.deliveryDate)])} /></div>
}

function PoolStock({ data }: { data: PendingPayload | null }) {
  return <><Hero tone="from-indigo-600 to-purple-700" title="📦 Pool & Stock Inventory" subtitle="PO On-Order = จองซื้อ · Spot in Pool = บิลรับซื้อจริง − matched · Stock จริง = จาก Stock Ledger · Pool ≠ Stock" /><div className="grid grid-cols-2 gap-3 md:grid-cols-4"><Metric label="PO On-Order" value={`${money(data?.reconTotals.totalPoOnOrderQty)} กก.`} tone="purple" /><Metric label="Spot in Pool" value={`${money(data?.reconTotals.totalSpotInPoolQty)} กก.`} tone="emerald" /><Metric label="Stock จริง" value={`${money(data?.reconTotals.totalStockQty)} กก.`} tone="blue" /><Metric label="จำนวนสินค้า" value={money(data?.reconTotals.productCount)} tone="slate" /></div><SimpleTable headers={['รหัส / สินค้า', 'หมวด · Status', 'PO On-Order', 'Spot in Pool', 'Stock จริง', 'WAC']} rows={(data?.reconciliation ?? []).map((row) => [`${text(row.productCode)} ${text(row.productName)}`, `${text(row.metalGroup)} · ${text(row.itemStatus)}`, money(row.poOnOrderQty), money(row.spotInPoolQty), money(row.stockQty), money(row.stockWAC)])} /></>
}

function SimpleTable({ empty = 'ไม่มีข้อมูล', headers, rowClick, rows }: { empty?: string; headers: string[]; rowClick?: (index: number) => void; rows: string[][] }) {
  return <div className="overflow-x-auto rounded-xl bg-white shadow"><table className="min-w-[760px] w-full text-xs"><thead className="bg-slate-100"><tr>{headers.map((h) => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row[0]}-${index}`} className={`border-t hover:bg-amber-50/30 ${rowClick ? 'cursor-pointer' : ''}`} onClick={() => rowClick?.(index)}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`} className={`p-2 ${cellIndex > 1 ? 'text-right' : ''}`}>{cell}</td>)}</tr>)}{rows.length === 0 ? <tr><td className="py-8 text-center text-slate-400" colSpan={headers.length}>{empty}</td></tr> : null}</tbody></table></div>
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <div className="overflow-hidden rounded-xl bg-white shadow"><div className="border-b bg-amber-50 p-2 text-xs font-bold text-amber-700">{title}</div><div className="p-3">{children}</div></div>
}

function Segment({ active, children, color, onClick }: { active: boolean; children: ReactNode; color: 'amber' | 'blue' | 'emerald'; onClick: () => void }) {
  const activeClass = color === 'amber' ? 'bg-amber-600 text-white' : color === 'emerald' ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
  return <button className={`rounded-lg px-4 py-2 text-sm font-medium ${active ? activeClass : 'bg-white text-slate-600 shadow'}`} type="button" onClick={onClick}>{children}</button>
}

function MetalChips({ groups, selected, setSelected }: { groups: string[]; selected: string[]; setSelected: (groups: string[]) => void }) {
  return <div className="rounded-xl bg-white p-3 shadow"><div className="mb-2 flex justify-between gap-3"><h4 className="text-sm font-semibold text-slate-700">📂 หมวดสินค้า ({selected.length === 0 ? 'แสดงทุกหมวด' : `เลือก ${selected.length} หมวด`})</h4><div className="flex gap-2"><button className="chip" type="button" onClick={() => setSelected([])}>เลือกทั้งหมด</button><button className="chip" type="button" onClick={() => setSelected(['__NONE__'])}>ไม่เลือก</button></div></div><div className="flex flex-wrap gap-2">{groups.map((group) => <button key={group} className={`rounded-lg border-2 px-3 py-1.5 text-xs ${selected.includes(group) ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 bg-white text-slate-600'}`} type="button" onClick={() => setSelected(selected.includes(group) ? selected.filter((item) => item !== group) : selected.filter((item) => item !== '__NONE__').concat(group))}>{group}</button>)}</div></div>
}

function LmeStat({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-blue-700">{label}</div><div className="font-bold">{value}</div></div>
}

function Metric({ label, tone, value }: { label: string; tone: string; value: string }) {
  const map: Record<string, string> = { amber: 'bg-amber-50 text-amber-700', blue: 'bg-blue-50 text-blue-700', emerald: 'bg-emerald-50 text-emerald-700', purple: 'bg-purple-50 text-purple-700', red: 'bg-red-50 text-red-700', slate: 'bg-slate-50 text-slate-700' }
  return <div className={`rounded-xl p-3 shadow ${map[tone] ?? map.slate}`}><div className="text-xs opacity-75">{label}</div><div className="text-xl font-bold">{value}</div></div>
}

function BigCard({ label, tone, value }: { label: string; tone: string; value: string }) {
  return <div className={`rounded-2xl bg-gradient-to-br ${tone} p-6 text-white shadow-xl`}><div className="text-sm opacity-80">{label}</div><div className="break-words font-mono text-3xl font-bold">{value}</div></div>
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded bg-slate-50 p-2 text-center"><div className="text-slate-500">{label}</div><div className="font-bold text-slate-700">{value}</div></div>
}

function Notice({ text: value }: { text?: string }) {
  return <div className="rounded border-l-4 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"><b>Read/design baseline</b><span className="ml-2">{value ?? 'ไม่มี write action ใน baseline นี้'}</span></div>
}

function ErrorBox({ text: value }: { text: string }) {
  return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{value}</div>
}
