'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'

type Row = Record<string, string | number | boolean | null | undefined | Record<string, number>>
type Payload = {
  breakdown?: Record<string, number>
  byStatus?: Array<{ count: number; status: string }>
  daily?: Array<{ date: string; inputQty: number; lossQty: number; outputQty: number }>
  machineUtil?: Array<{ batches: number; name: string; qty: number }>
  monthly?: Array<{ inputQty: number; month: string; outputQty: number }>
  rows: Row[]
  summary: Record<string, number>
  topProducts?: Array<{ avgCost?: number; batches: number; code?: string; cost: number; name: string; qty: number }>
}

type Column = {
  key: string
  label: string
  tone?: 'good' | 'bad'
  type?: 'money' | 'number' | 'percent' | 'text'
}

const configs: Record<string, { apiPath: string; columns: Column[]; metrics: Array<{ key: string; label: string; type?: 'money' | 'number' | 'percent' }>; title: string; exportable?: boolean }> = {
  dashboard: {
    apiPath: '/api/production/dashboard',
    title: 'Production Dashboard',
    metrics: [{ key: 'count', label: 'ใบสั่งผลิต' }, { key: 'outputQty', label: 'ผลิตได้', type: 'number' }, { key: 'wipQty', label: 'WIP', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'lossPct', label: 'Loss', type: 'percent' }],
    columns: [{ key: 'docNo', label: 'เลขที่' }, { key: 'date', label: 'วันที่' }, { key: 'productName', label: 'สินค้า' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'status', label: 'สถานะ' }],
  },
  wip: {
    apiPath: '/api/production/wip-report',
    title: 'WIP คงเหลือ',
    metrics: [{ key: 'count', label: 'ใบที่มี WIP' }, { key: 'wipQty', label: 'WIP Qty', type: 'number' }, { key: 'wipValue', label: 'WIP Value', type: 'money' }],
    columns: [{ key: 'docNo', label: 'ใบสั่งผลิต' }, { key: 'date', label: 'วันที่เริ่ม' }, { key: 'branchName', label: 'สาขา' }, { key: 'machineName', label: 'เครื่องจักร' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'wipQty', label: 'WIP Qty', type: 'number' }, { key: 'wipValue', label: 'WIP Value', type: 'money' }, { key: 'status', label: 'สถานะ' }],
  },
  report: {
    apiPath: '/api/production/report',
    title: 'รายงานการผลิต / Yield',
    exportable: true,
    metrics: [{ key: 'count', label: 'ใบสั่งผลิต' }, { key: 'inputQty', label: 'วัตถุดิบรวม', type: 'number' }, { key: 'outputQty', label: 'ผลผลิตรวม', type: 'number' }, { key: 'lossQty', label: 'Loss รวม', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'costPerKg', label: 'ต้นทุน/กก.', type: 'money' }],
    columns: [{ key: 'docNo', label: 'เลขที่' }, { key: 'date', label: 'วันที่' }, { key: 'productionType', label: 'ประเภท' }, { key: 'machineName', label: 'เครื่อง' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'wipQty', label: 'WIP', type: 'number' }, { key: 'lossQty', label: 'Loss', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'totalCost', label: 'Total Cost', type: 'money' }, { key: 'costPerKg', label: '฿/กก.', type: 'money' }],
  },
  cost: {
    apiPath: '/api/production/production-cost-report',
    title: 'Production Cost Report',
    exportable: true,
    metrics: [{ key: 'inputCost', label: 'RM Cost', type: 'money' }, { key: 'processCost', label: 'Process Cost', type: 'money' }, { key: 'totalCost', label: 'Total Cost', type: 'money' }, { key: 'costPerKg', label: 'ต้นทุน/กก.', type: 'money' }],
    columns: [{ key: 'docNo', label: 'เลขที่' }, { key: 'date', label: 'วันที่' }, { key: 'inputCost', label: 'RM', type: 'money' }, { key: 'processCost', label: 'Process', type: 'money' }, { key: 'totalCost', label: 'Total', type: 'money' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'costPerKg', label: '฿/กก.', type: 'money' }, { key: 'productionType', label: 'Method' }],
  },
  yieldLoss: {
    apiPath: '/api/production/yield-loss-report',
    title: 'Yield/Loss + Abnormal',
    exportable: true,
    metrics: [{ key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'lossQty', label: 'Loss', type: 'number' }, { key: 'yieldGainValue', label: 'Yield Gain', type: 'money' }, { key: 'abnormalLossValue', label: 'Abnormal Loss', type: 'money' }, { key: 'netPnL', label: 'Net P&L', type: 'money' }],
    columns: [{ key: 'docNo', label: 'เลขที่' }, { key: 'date', label: 'วันที่' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'lossQty', label: 'Loss', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'lossPct', label: 'Loss %', type: 'percent' }, { key: 'normalLossPercent', label: 'Normal %', type: 'percent' }, { key: 'abnormalLossValue', label: 'Loss Value', type: 'money' }, { key: 'yieldGainValue', label: 'Gain', type: 'money' }, { key: 'netPnL', label: 'Net P&L', type: 'money' }],
  },
  machine: {
    apiPath: '/api/production/machine-utilization',
    title: 'Machine Utilization',
    metrics: [{ key: 'count', label: 'เครื่องจักร' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }],
    columns: [{ key: 'name', label: 'เครื่องจักร' }, { key: 'type', label: 'ประเภท' }, { key: 'branchName', label: 'สาขา' }, { key: 'capacityKgPerHr', label: 'Capacity', type: 'number' }, { key: 'normalYieldPct', label: 'Normal Yield', type: 'percent' }, { key: 'orderCount', label: 'รอบ', type: 'number' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'actualYield', label: 'Actual Yield', type: 'percent' }, { key: 'yieldDiff', label: 'Diff', type: 'percent' }, { key: 'utilization', label: 'Util %', type: 'percent' }, { key: 'maintenanceStatus', label: 'สถานะ' }],
  },
}

export function ProductionReportPageClient({ mode }: { mode: keyof typeof configs }) {
  const config = configs[mode]
  const [data, setData] = useState<Payload | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async () => {
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const suffix = params.toString() ? `?${params.toString()}` : ''
      setData(await dailyFetchJson<Payload>(`${config.apiPath}${suffix}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `โหลด${config.title}ไม่ได้`)
    } finally {
      setIsLoading(false)
    }
  }, [config.apiPath, config.title, dateFrom, dateTo])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = data?.rows ?? []
  const metricItems = useMemo(() => config.metrics.map((metric) => ({ ...metric, value: data?.summary?.[metric.key] ?? 0 })), [config.metrics, data?.summary])

  function applyDashboardRange(range: 'last30' | 'last7' | 'last90' | 'month' | 'today' | 'year') {
    const end = new Date()
    const start = new Date(end)
    if (range === 'today') {
      // keep today
    } else if (range === 'last7') start.setDate(start.getDate() - 6)
    else if (range === 'last30') start.setDate(start.getDate() - 29)
    else if (range === 'last90') start.setDate(start.getDate() - 89)
    else if (range === 'month') start.setDate(1)
    else if (range === 'year') {
      start.setMonth(0)
      start.setDate(1)
    }
    setDateFrom(start.toISOString().slice(0, 10))
    setDateTo(end.toISOString().slice(0, 10))
  }

  function exportCsv() {
    const header = config.columns.map((column) => column.label)
    const body = rows.map((row) => config.columns.map((column) => String(row[column.key] ?? '')))
    const csv = [header, ...body].map((line) => line.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${mode}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (mode === 'dashboard') {
    const summary = data?.summary ?? {}
    const topProducts = data?.topProducts ?? []
    const byStatus = data?.byStatus ?? []
    const daily = data?.daily ?? []
    const monthly = data?.monthly ?? []
    const machineUtil = data?.machineUtil ?? []
    return (
      <section className="space-y-4">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        <div className="rounded-2xl bg-gradient-to-r from-purple-700 to-pink-600 p-5 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">Production Dashboard</h1>
              <p className="mt-1 text-sm opacity-90">รายงานการผลิตแบบสรุป รายวัน / รายเดือน + Charts</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                ['today', 'วันนี้'],
                ['last7', '7 วัน'],
                ['last30', '30 วัน'],
                ['last90', '90 วัน'],
                ['month', 'เดือนนี้'],
                ['year', 'ปีนี้'],
              ].map(([value, label]) => <button key={value} className="rounded bg-white/20 px-3 py-1.5 text-xs hover:bg-white/30" type="button" onClick={() => applyDashboardRange(value as Parameters<typeof applyDashboardRange>[0])}>{label}</button>)}
              <input className="rounded px-2 py-1 text-xs text-slate-900" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              <span className="text-xs">→</span>
              <input className="rounded px-2 py-1 text-xs text-slate-900" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <DashboardKpi label="ใบสั่งผลิต" note={`Input ${formatMoney(summary.inputQty ?? 0)} | Output ${formatMoney(summary.outputQty ?? 0)}`} tone="blue" value={formatMoney(summary.count ?? 0)} />
          <DashboardKpi label="ผลิตได้" note="กก. ไม่รวม Loss" tone="emerald" value={formatMoney(summary.outputQty ?? 0)} />
          <DashboardKpi label="WIP คงเหลือทั้งระบบ" note="กก. ที่ยังผลิตค้างอยู่" tone="amber" value={formatMoney(summary.totalWipQty ?? summary.wipQty ?? 0)} />
          <DashboardKpi label="Yield %" note={`Loss ${Number(summary.lossPct ?? 0).toFixed(1)}%`} tone="purple" value={`${Number(summary.yieldPct ?? 0).toFixed(1)}%`} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartPanel title="ผลิตรายวัน (Input/Output/Loss)" type="line" rows={daily.map((item) => ({ label: item.date.slice(5), input: item.inputQty, output: item.outputQty, loss: item.lossQty }))} />
          <ChartPanel title="ผลิตรายเดือน (12 เดือนล่าสุด)" type="bar" rows={monthly.map((item) => ({ label: item.month.slice(5), input: item.inputQty, output: item.outputQty, loss: 0 }))} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-lg">
            <h3 className="mb-3 font-bold text-slate-700">สถานะใบสั่งผลิต</h3>
            <div className="space-y-2">
              {byStatus.map((item) => <StatusBar key={item.status} count={item.count} max={Math.max(1, ...byStatus.map((row) => row.count))} status={item.status} />)}
              {!byStatus.length ? <div className="py-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</div> : null}
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white shadow-lg lg:col-span-2">
            <div className="border-b bg-emerald-50 p-3"><h3 className="font-bold text-emerald-700">Top 10 สินค้าที่ผลิตมากสุด</h3></div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50"><tr><th className="w-8 p-2 text-left">#</th><th className="p-2 text-left">Code</th><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">รอบ</th><th className="p-2 text-right">น้ำหนัก</th><th className="p-2 text-right">ต้นทุนรวม</th><th className="p-2 text-right">ต้นทุน/กก.</th></tr></thead>
              <tbody>
                {topProducts.map((item, index) => <tr key={item.name} className="border-t"><td className="p-2 font-bold text-emerald-700">{index + 1}</td><td className="p-2 font-mono text-xs">{item.code || '-'}</td><td className="p-2 text-xs">{item.name}</td><td className="p-2 text-right text-xs">{item.batches}</td><td className="p-2 text-right font-bold">{formatMoney(item.qty)}</td><td className="p-2 text-right text-xs">{formatMoney(item.cost)}</td><td className="p-2 text-right text-xs text-slate-600">{formatMoney(item.avgCost ?? (item.qty > 0 ? item.cost / item.qty : 0))}</td></tr>)}
                {!topProducts.length ? <tr><td className="py-6 text-center text-slate-400" colSpan={7}>ยังไม่มีข้อมูลในช่วงนี้</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl bg-white shadow-lg">
          <div className="border-b bg-indigo-50 p-3"><h3 className="font-bold text-indigo-700">Machine Utilization (ปริมาณผลิตต่อเครื่อง)</h3></div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-2 text-left">เครื่องจักร</th><th className="p-2 text-right">รอบที่ใช้</th><th className="p-2 text-right">น้ำหนักผลิต</th></tr></thead>
            <tbody>
              {machineUtil.map((item) => <tr key={item.name} className="border-t"><td className="p-2">{item.name}</td><td className="p-2 text-right">{item.batches}</td><td className="p-2 text-right font-bold text-indigo-700">{formatMoney(item.qty)}</td></tr>)}
              {!machineUtil.length ? <tr><td className="py-6 text-center text-slate-400" colSpan={3}>ยังไม่มีข้อมูล</td></tr> : null}
            </tbody>
          </table>
        </div>

        {isLoading ? <div className="text-center text-sm text-slate-500">กำลังโหลดข้อมูล</div> : null}
      </section>
    )
  }

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="rounded-lg bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <input className="rounded-lg border px-3 py-2 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <input className="rounded-lg border px-3 py-2 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          <button className="rounded-lg border px-3 py-2 text-sm" type="button" onClick={() => { setDateFrom(''); setDateTo('') }}>ล้างวันที่</button>
          {config.exportable ? <button className="ml-auto rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={exportCsv}>Export CSV</button> : null}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-6">
        {metricItems.map((metric) => <Metric key={metric.key} label={metric.label} type={metric.type} value={metric.value} />)}
      </div>
      {mode === 'dashboard' && data?.topProducts?.length ? (
        <div className="rounded-lg bg-white p-4 shadow">
          <h3 className="font-semibold">Top Products</h3>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {data.topProducts.map((item) => <div key={item.name} className="flex justify-between rounded border p-2 text-sm"><span>{item.name}</span><span className="font-semibold">{formatMoney(item.qty)}</span></div>)}
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="w-full text-sm">
          <thead className="bg-slate-100">
            <tr>{config.columns.map((column) => <th key={column.key} className="whitespace-nowrap p-2 text-left">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={config.columns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row, index) => (
              <tr key={String(row.id ?? index)} className="border-t hover:bg-slate-50">
                {config.columns.map((column) => <td key={column.key} className="whitespace-nowrap p-2">{formatCell(row[column.key], column.type)}</td>)}
              </tr>
            ))}
            {!isLoading && rows.length === 0 ? <tr><td className="p-6 text-center text-slate-500" colSpan={config.columns.length}>ไม่มีข้อมูล</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Metric({ label, type, value }: { label: string; type?: 'money' | 'number' | 'percent'; value: number }) {
  return <div className="rounded-lg bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-bold text-slate-900">{formatCell(value, type)}</div></div>
}

function DashboardKpi({ label, note, tone, value }: { label: string; note: string; tone: 'amber' | 'blue' | 'emerald' | 'purple'; value: string }) {
  const classes = {
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
  }
  return <div className={`rounded-xl border p-3 ${classes[tone]}`}><div className="text-xs opacity-90">{label}</div><div className="text-2xl font-bold">{value}</div><div className="text-xs opacity-80">{note}</div></div>
}

function ChartPanel({ rows, title, type }: { rows: Array<{ input: number; label: string; loss: number; output: number }>; title: string; type: 'bar' | 'line' }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.input, row.output, row.loss]))
  return (
    <div className="rounded-2xl bg-white p-4 shadow-lg">
      <h3 className="mb-2 font-bold text-slate-700">{title}</h3>
      <div className="flex h-[300px] items-end gap-2 overflow-x-auto border-b border-slate-100 pb-8">
        {rows.map((row) => (
          <div key={row.label} className="relative flex min-w-10 flex-1 items-end justify-center gap-1">
            <div className={`${type === 'line' ? 'rounded-t' : 'rounded-t'} w-2 bg-blue-500`} style={{ height: `${Math.max(2, (row.input / max) * 240)}px` }} title={`Input ${formatMoney(row.input)}`} />
            <div className="w-2 rounded-t bg-emerald-500" style={{ height: `${Math.max(2, (row.output / max) * 240)}px` }} title={`Output ${formatMoney(row.output)}`} />
            {type === 'line' ? <div className="w-2 rounded-t bg-red-500" style={{ height: `${Math.max(2, (row.loss / max) * 240)}px` }} title={`Loss ${formatMoney(row.loss)}`} /> : null}
            <span className="absolute -bottom-6 text-[10px] text-slate-400">{row.label}</span>
          </div>
        ))}
        {!rows.length ? <div className="w-full self-center text-center text-sm text-slate-400">ยังไม่มีข้อมูล</div> : null}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-500"><span className="text-blue-600">Input</span><span className="text-emerald-600">Output</span>{type === 'line' ? <span className="text-red-600">Loss</span> : null}</div>
    </div>
  )
}

function StatusBar({ count, max, status }: { count: number; max: number; status: string }) {
  return (
    <div className="text-sm">
      <div className="mb-1 flex justify-between"><span>{status}</span><b>{count}</b></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-purple-500" style={{ width: `${Math.max(4, (count / max) * 100)}%` }} /></div>
    </div>
  )
}

function formatCell(value: Row[string], type?: Column['type']) {
  if (value === null || value === undefined || typeof value === 'object') return '-'
  if (type === 'money') return formatMoney(Number(value))
  if (type === 'number') return formatMoney(Number(value))
  if (type === 'percent') return `${Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`
  return String(value)
}
