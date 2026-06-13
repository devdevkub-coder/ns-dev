'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'

type Row = Record<string, string | number | boolean | null | undefined | Record<string, number>>
type Payload = {
  breakdown?: Record<string, number>
  byStatus?: Array<{ count: number; status: string }>
  daily?: Array<{ date: string; inputQty: number; lossQty: number; outputQty: number }>
  machineUtil?: Array<{ batches: number; cost?: number; name: string; qty: number }>
  monthly?: Array<{ inputQty: number; month: string; outputQty: number }>
  productSummary?: ProductSummary[]
  rows: Row[]
  summary: Record<string, number>
  topProducts?: Array<{ avgCost?: number; batches: number; code?: string; cost: number; name: string; qty: number }>
  wipRows?: Row[]
}

type Column = {
  key: string
  label: string
  tone?: 'good' | 'bad'
  type?: 'date' | 'money' | 'number' | 'percent' | 'text'
}

type Option = { code: string; id: string; name: string }
type ReportOptions = { branches: Option[]; machines: Option[] }
type ProductSummary = { batches: number; code: string; cost: number; name: string; qty: number; unitCost: number }

const configs: Record<string, { apiPath: string; columns: Column[]; metrics: Array<{ key: string; label: string; type?: 'money' | 'number' | 'percent' }>; title: string; exportable?: boolean }> = {
  dashboard: {
    apiPath: '/api/production/dashboard',
    title: 'Production Dashboard',
    metrics: [{ key: 'count', label: 'ใบสั่งผลิต' }, { key: 'outputQty', label: 'ผลิตได้', type: 'number' }, { key: 'wipQty', label: 'WIP', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'lossPct', label: 'Loss', type: 'percent' }],
    columns: [{ key: 'docNo', label: 'เลขที่' }, { key: 'date', label: 'วันที่', type: 'date' }, { key: 'productName', label: 'สินค้า' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'status', label: 'สถานะ' }],
  },
  report: {
    apiPath: '/api/production/report',
    title: 'รายงานการผลิต / Yield',
    exportable: true,
    metrics: [{ key: 'count', label: 'ใบสั่งผลิต' }, { key: 'inputQty', label: 'วัตถุดิบรวม', type: 'number' }, { key: 'outputQty', label: 'ผลผลิตรวม', type: 'number' }, { key: 'lossQty', label: 'Loss รวม', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'totalCost', label: 'ต้นทุนผลิตรวม', type: 'money' }, { key: 'lossValue', label: 'Loss Value (บาท)', type: 'money' }],
    columns: [{ key: 'docNo', label: 'เลขที่' }, { key: 'date', label: 'วันที่', type: 'date' }, { key: 'productionType', label: 'ประเภท' }, { key: 'machineName', label: 'เครื่อง' }, { key: 'status', label: 'สถานะ' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'wipQty', label: 'WIP', type: 'number' }, { key: 'lossQty', label: 'Loss', type: 'number' }, { key: 'yieldPct', label: 'Yield %', type: 'percent' }, { key: 'inputCost', label: 'RM', type: 'money' }, { key: 'processCost', label: 'Process', type: 'money' }, { key: 'totalCost', label: 'Total', type: 'money' }, { key: 'lossValue', label: 'Loss Value (บาท)', type: 'money' }, { key: 'rmCostPerKg', label: 'RM บาท/กก.', type: 'money' }, { key: 'productionCostPerKg', label: 'ต้นทุนผลิต บาท/กก.', type: 'money' }],
  },
  cost: {
    apiPath: '/api/production/production-cost-report',
    title: 'Production Cost Report',
    exportable: true,
    metrics: [{ key: 'inputCost', label: 'RM Cost', type: 'money' }, { key: 'processCost', label: 'Process Cost', type: 'money' }, { key: 'totalCost', label: 'Total Cost', type: 'money' }, { key: 'costPerKg', label: 'ต้นทุน/กก.', type: 'money' }],
    columns: [{ key: 'docNo', label: 'เลขที่' }, { key: 'date', label: 'วันที่', type: 'date' }, { key: 'inputCost', label: 'RM', type: 'money' }, { key: 'processCost', label: 'Process', type: 'money' }, { key: 'totalCost', label: 'Total', type: 'money' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'costPerKg', label: '฿/กก.', type: 'money' }, { key: 'productionType', label: 'Method' }],
  },
  yieldLoss: {
    apiPath: '/api/production/yield-loss-report',
    title: 'Yield/Loss + Abnormal',
    exportable: true,
    metrics: [{ key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'lossQty', label: 'Loss', type: 'number' }, { key: 'yieldGainValue', label: 'Yield Gain', type: 'money' }, { key: 'abnormalLossValue', label: 'Abnormal Loss', type: 'money' }, { key: 'netPnL', label: 'Net P&L', type: 'money' }],
    columns: [{ key: 'docNo', label: 'เลขที่' }, { key: 'date', label: 'วันที่', type: 'date' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'lossQty', label: 'Loss', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'lossPct', label: 'Loss %', type: 'percent' }, { key: 'normalLossPercent', label: 'Normal %', type: 'percent' }, { key: 'abnormalLossValue', label: 'Loss Value', type: 'money' }, { key: 'yieldGainValue', label: 'Gain', type: 'money' }, { key: 'netPnL', label: 'Net P&L', type: 'money' }],
  },
  machine: {
    apiPath: '/api/production/machine-utilization',
    title: 'Machine Utilization',
    metrics: [{ key: 'count', label: 'เครื่องจักร' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }],
    columns: [{ key: 'name', label: 'เครื่องจักร' }, { key: 'type', label: 'ประเภท' }, { key: 'branchName', label: 'สาขา' }, { key: 'capacityKgPerHr', label: 'Capacity', type: 'number' }, { key: 'normalYieldPct', label: 'Normal Y%', type: 'percent' }, { key: 'orderCount', label: 'รอบ', type: 'number' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'actualYield', label: 'Actual Y%', type: 'percent' }, { key: 'yieldDiff', label: 'Diff', type: 'percent' }, { key: 'estHours', label: 'Est.Hrs', type: 'number' }, { key: 'utilization', label: 'Util %', type: 'percent' }, { key: 'totalCost', label: 'ต้นทุน', type: 'money' }],
  },
}

export function ProductionReportPageClient({ mode }: { mode: keyof typeof configs }) {
  const config = configs[mode]
  const [branchId, setBranchId] = useState('')
  const [data, setData] = useState<Payload | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [machineId, setMachineId] = useState('')
  const [options, setOptions] = useState<ReportOptions>({ branches: [], machines: [] })
  const [status, setStatus] = useState('')
  const latestLoadRequestRef = useRef(0)

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      if (mode === 'report') {
        if (branchId) params.set('branchId', branchId)
        if (machineId) params.set('machineId', machineId)
        if (status) params.set('status', status)
      }
      const suffix = params.toString() ? `?${params.toString()}` : ''
      const payload = await dailyFetchJson<Payload>(`${config.apiPath}${suffix}`)
      if (requestId !== latestLoadRequestRef.current) return
      setData(payload)
    } catch (caught) {
      if (requestId !== latestLoadRequestRef.current) return
      setError(caught instanceof Error ? caught.message : `โหลด${config.title}ไม่ได้`)
    } finally {
      if (requestId !== latestLoadRequestRef.current) return
      setIsLoading(false)
    }
  }, [branchId, config.apiPath, config.title, dateFrom, dateTo, machineId, mode, status])

  useEffect(() => {
    void loadData()
  }, [loadData])

  useEffect(() => {
    if (mode !== 'report') return
    let cancelled = false
    async function loadOptions() {
      try {
        const payload = await dailyFetchJson<ReportOptions>('/api/production/orders/options')
        if (!cancelled) setOptions({ branches: payload.branches ?? [], machines: payload.machines ?? [] })
      } catch (caught) {
        if (!cancelled) setOptions({ branches: [], machines: [] })
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'โหลดตัวกรองรายงานการผลิตไม่ได้')
      }
    }
    void loadOptions()
    return () => { cancelled = true }
  }, [mode])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const metricItems = useMemo(() => config.metrics.map((metric) => ({ ...metric, value: data?.summary?.[metric.key] ?? 0 })), [config.metrics, data?.summary])
  const productSummary = useMemo(() => data?.productSummary ?? [], [data?.productSummary])
  const wipRows = useMemo(() => data?.wipRows ?? rows.filter((row) => Number(row.wipQty ?? 0) > 0.000001), [data?.wipRows, rows])

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

  if (mode === 'cost') {
    const breakdown = data?.breakdown ?? {}
    const summary = data?.summary ?? {}
    const costRows = rows
    const costTotals = {
      electricity: breakdown['Electricity Cost'] ?? 0,
      fuel: breakdown['Fuel Cost'] ?? 0,
      labor: breakdown['Labor Cost'] ?? 0,
      machine: breakdown['Machine Cost'] ?? 0,
      maintenance: breakdown['Maintenance Cost'] ?? 0,
      otherProc: Object.entries(breakdown).filter(([key]) => !['RM', 'Labor Cost', 'Electricity Cost', 'Machine Cost', 'Fuel Cost', 'Maintenance Cost'].includes(key)).reduce((sum, [, value]) => sum + value, 0),
      rm: breakdown.RM ?? summary.inputCost ?? 0,
      total: summary.totalCost ?? 0,
      outputQty: summary.outputQty ?? 0,
    }

    function exportCostCsv() {
      const header = ['เลขที่', 'วันที่', 'RM', 'Labor', 'Electricity', 'Machine', 'Fuel', 'Maintenance', 'Other Proc', 'Total Cost', 'Output (kg)', '฿/กก.', 'Method']
      const body = costRows.map((row) => {
        const costs = costBreakdown(row)
        return [
          String(row.docNo ?? ''),
          String(row.date ?? ''),
          String(row.inputCost ?? 0),
          String(costs.labor),
          String(costs.electricity),
          String(costs.machine),
          String(costs.fuel),
          String(costs.maintenance),
          String(costs.otherProc),
          String(row.totalCost ?? 0),
          String(row.outputQty ?? 0),
          String(row.costPerKg ?? 0),
          String(row.costAllocationMethod ?? row.productionType ?? ''),
        ]
      })
      const csv = [header, ...body].map((line) => line.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n')
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `production-cost-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    }

    return (
      <section className="space-y-4">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
        <div className="flex flex-wrap gap-2">
          <DatePickerInput className="w-[130px]" value={dateFrom} onChange={setDateFrom} />
          <DatePickerInput className="w-[130px]" value={dateTo} onChange={setDateTo} />
          <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => { setDateFrom(''); setDateTo('') }}>ล้างวันที่</button>
          <button className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm text-white" type="button" onClick={exportCostCsv}>Export CSV</button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-7">
          <CostCard label="RM Cost" tone="red" value={costTotals.rm} />
          <CostCard label="Labor" value={costTotals.labor} />
          <CostCard label="Electricity" value={costTotals.electricity} />
          <CostCard label="Machine" value={costTotals.machine} />
          <CostCard label="Fuel" value={costTotals.fuel} />
          <CostCard label="Other Process" value={costTotals.otherProc + costTotals.maintenance} />
          <div className="rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 p-3 text-white shadow">
            <div className="opacity-80">Total / Cost per Kg</div>
            <div className="text-base font-bold">{formatMoney(costTotals.total)}</div>
            <div className="text-xs opacity-80">{formatMoney(costTotals.outputQty > 0 ? costTotals.total / costTotals.outputQty : 0)} ฿/กก.</div>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md bg-white shadow">
          <table className="w-full text-sm">
            <thead className="bg-slate-100"><tr><th className="p-2 text-left">เลขที่</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-right">RM</th><th className="p-2 text-right">Labor</th><th className="p-2 text-right">Electricity</th><th className="p-2 text-right">Machine</th><th className="p-2 text-right">Fuel</th><th className="p-2 text-right">Maintenance</th><th className="p-2 text-right">Other Proc</th><th className="p-2 text-right">Total Cost</th><th className="p-2 text-right">Output (kg)</th><th className="p-2 text-right">฿/กก.</th><th className="p-2 text-left">Method</th></tr></thead>
            <tbody>
              {isLoading ? <tr><td className="py-6 text-center text-slate-500" colSpan={13}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && costRows.map((row, index) => {
                const costs = costBreakdown(row)
                return <tr key={String(row.id ?? index)} className="border-t hover:bg-slate-50"><td className="p-2 font-mono text-xs">{String(row.docNo ?? '')}</td><td className="p-2">{formatDateDisplay(String(row.date ?? ''))}</td><td className="p-2 text-right">{formatMoney(Number(row.inputCost ?? 0))}</td><td className="p-2 text-right">{formatMoney(costs.labor)}</td><td className="p-2 text-right">{formatMoney(costs.electricity)}</td><td className="p-2 text-right">{formatMoney(costs.machine)}</td><td className="p-2 text-right">{formatMoney(costs.fuel)}</td><td className="p-2 text-right">{formatMoney(costs.maintenance)}</td><td className="p-2 text-right">{formatMoney(costs.otherProc)}</td><td className="p-2 text-right font-bold text-blue-700">{formatMoney(Number(row.totalCost ?? 0))}</td><td className="p-2 text-right text-emerald-700">{formatMoney(Number(row.outputQty ?? 0))}</td><td className="p-2 text-right text-slate-700">{formatMoney(Number(row.costPerKg ?? 0))}</td><td className="p-2 text-xs">{String(row.costAllocationMethod ?? row.productionType ?? '-')}</td></tr>
              })}
              {!isLoading && costRows.length === 0 ? <tr><td className="py-6 text-center text-slate-400" colSpan={13}>ไม่มีข้อมูล</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  if (mode === 'dashboard') {
    const summary = data?.summary ?? {}
    const topProducts = data?.topProducts ?? []
    const daily = data?.daily ?? []
    const monthly = data?.monthly ?? []
    const machineUtil = data?.machineUtil ?? []
    const abnormalOrderCount = Number(summary.abnormalOrderCount ?? 0)
    const abnormalLossQty = Number(summary.abnormalLossQty ?? 0)
    const abnormalLossValue = Number(summary.abnormalLossValue ?? 0)
    return (
      <section className="space-y-4">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        <div className="rounded-md bg-gradient-to-r from-purple-700 to-pink-600 p-5 text-white shadow-lg">
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
              ].map(([value, label]) => <button key={value} className="rounded-md bg-white/20 px-3 py-1.5 text-xs hover:bg-white/30" type="button" onClick={() => applyDashboardRange(value as Parameters<typeof applyDashboardRange>[0])}>{label}</button>)}
              <DatePickerInput className="w-[130px] bg-white text-slate-900" value={dateFrom} onChange={setDateFrom} />
              <span className="text-xs">→</span>
              <DatePickerInput className="w-[130px] bg-white text-slate-900" value={dateTo} onChange={setDateTo} />
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
          <div className="rounded-md bg-white p-4 shadow-lg">
            <h3 className="mb-3 font-bold text-slate-700">Abnormal Loss</h3>
            <div className="space-y-3">
              <div className="rounded-md border border-red-100 bg-red-50 p-3">
                <div className="text-xs font-medium text-red-700">Order ผิดปกติ</div>
                <div className="mt-1 text-2xl font-bold text-red-700">{formatMoney(abnormalOrderCount)}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-md bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Abnormal Loss</div>
                  <div className="mt-1 font-semibold text-red-700">{formatMoney(abnormalLossQty)}</div>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Loss Value</div>
                  <div className="mt-1 font-semibold text-red-700">{formatMoney(abnormalLossValue)}</div>
                </div>
              </div>
              {!abnormalOrderCount ? <div className="text-xs text-emerald-700">ไม่มี order ที่ loss เกิน normal ในช่วงนี้</div> : null}
            </div>
          </div>
          <div className="overflow-hidden rounded-md bg-white shadow-lg lg:col-span-2">
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

        <div className="overflow-hidden rounded-md bg-white shadow-lg">
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
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      <div className="rounded-md bg-white p-4 shadow">
        <div className="flex flex-wrap items-center gap-2">
          <DatePickerInput className="w-[130px]" value={dateFrom} onChange={setDateFrom} />
          <DatePickerInput className="w-[130px]" value={dateTo} onChange={setDateTo} />
          {mode === 'report' ? (
            <>
              <select className="h-9 rounded-md border px-3 text-sm" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
                <option value="">ทุกสาขา</option>
                {options.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <select className="h-9 rounded-md border px-3 text-sm" value={machineId} onChange={(event) => setMachineId(event.target.value)}>
                <option value="">ทุกเครื่อง</option>
                {options.machines.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
              </select>
              <select className="h-9 rounded-md border px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">ทุกสถานะ</option>
                {['Open', 'In Production', 'Partially Completed', 'Completed'].map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </>
          ) : null}
          <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => { setDateFrom(''); setDateTo(''); setBranchId(''); setMachineId(''); setStatus('') }}>ล้างตัวกรอง</button>
          {config.exportable ? <button className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={exportCsv}>Export CSV</button> : null}
        </div>
      </div>
      {mode === 'yieldLoss' ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          แสดง Yield/Loss + <b>P&amp;L Impact</b> — Output ขาดเกิน Normal = Loss สีแดง · Output เกินคาด = Gain สีเขียว · Net P&amp;L = Gain - Loss
        </div>
      ) : null}
      {mode === 'machine' ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <b>Machine Utilization</b> = ชั่วโมงประมาณการ / (8 ชม./วัน x จำนวนวัน) | <b>Yield Diff</b> = Actual Yield - Normal Yield
        </div>
      ) : null}
      <div className={`grid gap-3 ${mode === 'report' ? 'md:grid-cols-7' : 'md:grid-cols-6'}`}>
        {metricItems.map((metric) => <Metric key={metric.key} label={metric.label} type={metric.type} value={metric.value} />)}
      </div>
      {mode === 'yieldLoss' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ImpactCard label="Yield Gain (Output > คาดหวัง)" tone="gain" value={Number(data?.summary?.yieldGainValue ?? 0)} />
          <ImpactCard label="Abnormal Loss (Output < Normal)" tone="loss" value={Number(data?.summary?.abnormalLossValue ?? 0)} />
          <ImpactCard label="Net P&L Impact" tone={Number(data?.summary?.netPnL ?? 0) >= 0 ? 'netGood' : 'netBad'} value={Number(data?.summary?.netPnL ?? 0)} />
        </div>
      ) : null}
      {mode === 'report' ? (
        <div className="overflow-hidden rounded-md bg-white shadow">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-4 py-3">
            <h3 className="font-semibold text-amber-800">WIP คงเหลือ (Work-in-Progress)</h3>
            <div className="text-xs text-amber-700">{wipRows.length} ใบ · รวม {formatMoney(wipRows.reduce((sum, row) => sum + Number(row.wipQty ?? 0), 0))}</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100"><tr><th className="p-2 text-left">ใบสั่งผลิต</th><th className="p-2 text-left">วันที่</th><th className="p-2 text-left">สาขา</th><th className="p-2 text-left">เครื่องจักร</th><th className="p-2 text-right">Input</th><th className="p-2 text-right">Output</th><th className="p-2 text-right">WIP Qty</th><th className="p-2 text-right">WIP Value</th><th className="p-2 text-center">สถานะ</th></tr></thead>
              <tbody>
                {wipRows.map((row, index) => <tr key={String(row.id ?? index)} className="border-t"><td className="p-2 font-mono text-xs">{String(row.docNo ?? '')}</td><td className="p-2">{formatDateDisplay(String(row.date ?? ''))}</td><td className="p-2">{String(row.branchName ?? '-')}</td><td className="p-2">{String(row.machineName ?? '-')}</td><td className="p-2 text-right">{formatMoney(Number(row.inputQty ?? 0))}</td><td className="p-2 text-right text-emerald-700">{formatMoney(Number(row.outputQty ?? 0))}</td><td className="p-2 text-right font-semibold text-amber-700">{formatMoney(Number(row.wipQty ?? 0))}</td><td className="p-2 text-right">{formatMoney(Number(row.wipValue ?? 0))}</td><td className="p-2 text-center text-xs">{String(row.status ?? '')}</td></tr>)}
                {!wipRows.length ? <tr><td className="py-6 text-center text-slate-400" colSpan={9}>ไม่มี WIP คงเหลือในเงื่อนไขนี้</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      {mode === 'report' ? (
        <div className="overflow-hidden rounded-md bg-white shadow">
          <h3 className="border-b px-4 py-3 font-semibold">📦 ผลผลิตแยกตามสินค้า</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100"><tr><th className="p-2 text-left">สินค้า</th><th className="p-2 text-right">รอบ</th><th className="p-2 text-right">น้ำหนักรวม</th><th className="p-2 text-right">ต้นทุนรวม</th><th className="p-2 text-right">ต้นทุน/กก.</th></tr></thead>
              <tbody>
                {productSummary.map((item) => <tr key={item.code || item.name} className="border-t"><td className="p-2"><div className="font-medium">{item.name}</div>{item.code ? <div className="font-mono text-xs text-slate-500">{item.code}</div> : null}</td><td className="p-2 text-right">{item.batches}</td><td className="p-2 text-right font-medium text-emerald-700">{formatMoney(item.qty)}</td><td className="p-2 text-right">{formatMoney(item.cost)}</td><td className="p-2 text-right">{formatMoney(item.unitCost)}</td></tr>)}
                {!productSummary.length ? <tr><td className="py-6 text-center text-slate-400" colSpan={5}>ไม่มีข้อมูล</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-md bg-white shadow">
        <table className="w-full text-sm table-zebra">
          <thead className="bg-slate-100">
            <tr>{config.columns.map((column) => <th key={column.key} className="whitespace-nowrap p-2 text-left">{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td className="p-6 text-center text-slate-500" colSpan={config.columns.length}>กำลังโหลดข้อมูล</td></tr> : null}
            {!isLoading && rows.map((row, index) => (
              <tr key={String(row.id ?? index)} className={`border-t hover:bg-slate-50 ${mode === 'wip' ? wipAgeClass(Number(row.ageDays ?? 0)) : ''}`}>
                {config.columns.map((column) => <td key={column.key} className={`whitespace-nowrap p-2 ${cellTone(row[column.key], column, mode)}`}>{formatCell(row[column.key], column.type)}</td>)}
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
  return <div className="rounded-md bg-white p-3 shadow"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-lg font-bold text-slate-900">{formatCell(value, type)}</div></div>
}

function ImpactCard({ label, tone, value }: { label: string; tone: 'gain' | 'loss' | 'netBad' | 'netGood'; value: number }) {
  const classes = {
    gain: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    loss: 'border-red-200 bg-red-50 text-red-700',
    netBad: 'border-orange-300 bg-orange-50 text-orange-700',
    netGood: 'border-blue-300 bg-blue-50 text-blue-700',
  }
  const prefix = tone === 'gain' || tone === 'netGood' ? '+' : tone === 'loss' ? '-' : ''
  return <div className={`rounded-md border-2 p-4 shadow ${classes[tone]}`}><div className="text-xs font-semibold">{label}</div><div className="mt-1 text-2xl font-bold">{prefix}{formatMoney(Math.abs(value))} ฿</div></div>
}

function DashboardKpi({ label, note, tone, value }: { label: string; note: string; tone: 'amber' | 'blue' | 'emerald' | 'purple'; value: string }) {
  const classes = {
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
  }
  return <div className={`rounded-md border p-3 ${classes[tone]}`}><div className="text-xs opacity-90">{label}</div><div className="text-2xl font-bold">{value}</div><div className="text-xs opacity-80">{note}</div></div>
}

function ChartPanel({ rows, title, type }: { rows: Array<{ input: number; label: string; loss: number; output: number }>; title: string; type: 'bar' | 'line' }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.input, row.output, row.loss]))
  return (
    <div className="rounded-md bg-white p-4 shadow-lg">
      <h3 className="mb-2 font-bold text-slate-700">{title}</h3>
      <div className="flex h-[300px] items-end gap-2 overflow-x-auto border-b border-slate-100 pb-8">
        {rows.map((row) => (
          <div key={row.label} className="relative flex min-w-10 flex-1 items-end justify-center gap-1">
            <div className={`${type === 'line' ? 'rounded-md-t' : 'rounded-md-t'} w-2 bg-blue-500`} style={{ height: `${Math.max(2, (row.input / max) * 240)}px` }} title={`Input ${formatMoney(row.input)}`} />
            <div className="w-2 rounded-md-t bg-emerald-500" style={{ height: `${Math.max(2, (row.output / max) * 240)}px` }} title={`Output ${formatMoney(row.output)}`} />
            {type === 'line' ? <div className="w-2 rounded-md-t bg-red-500" style={{ height: `${Math.max(2, (row.loss / max) * 240)}px` }} title={`Loss ${formatMoney(row.loss)}`} /> : null}
            <span className="absolute -bottom-6 text-[10px] text-slate-400">{row.label}</span>
          </div>
        ))}
        {!rows.length ? <div className="w-full self-center text-center text-sm text-slate-400">ยังไม่มีข้อมูล</div> : null}
      </div>
      <div className="mt-2 flex gap-4 text-xs text-slate-500"><span className="text-blue-600">Input</span><span className="text-emerald-600">Output</span>{type === 'line' ? <span className="text-red-600">Loss</span> : null}</div>
    </div>
  )
}

function CostCard({ label, tone, value }: { label: string; tone?: 'red'; value: number }) {
  return <div className="rounded-md bg-white p-3 shadow"><div className="text-slate-500">{label}</div><div className={`text-base font-bold ${tone === 'red' ? 'text-red-700' : 'text-slate-900'}`}>{formatMoney(value)}</div></div>
}

function costBreakdown(row: Row) {
  const breakdown = typeof row.costBreakdown === 'object' && row.costBreakdown ? row.costBreakdown as Record<string, number> : {}
  const labor = breakdown['Labor Cost'] ?? 0
  const electricity = breakdown['Electricity Cost'] ?? 0
  const machine = breakdown['Machine Cost'] ?? 0
  const fuel = breakdown['Fuel Cost'] ?? 0
  const maintenance = breakdown['Maintenance Cost'] ?? 0
  const otherProc = Number(row.processCost ?? 0) - labor - electricity - machine - fuel - maintenance
  return { electricity, fuel, labor, machine, maintenance, otherProc: Math.max(0, otherProc) }
}

function formatCell(value: Row[string], type?: Column['type']) {
  if (value === null || value === undefined || typeof value === 'object') return '-'
  if (type === 'date') return formatDateDisplay(String(value))
  if (type === 'money') return formatMoney(Number(value))
  if (type === 'number') return formatMoney(Number(value))
  if (type === 'percent') return `${Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`
  return String(value)
}

function cellTone(value: Row[string], column: Column, mode: string) {
  if (mode === 'wip' && column.key === 'ageDays') {
    const ageDays = Number(value ?? 0)
    if (ageDays > 30) return 'font-bold text-red-600'
    if (ageDays > 14) return 'font-semibold text-amber-700'
  }
  if (mode === 'yieldLoss' && ['abnormalLossValue', 'lossPct', 'lossQty'].includes(column.key)) return 'text-red-600'
  if (mode === 'yieldLoss' && ['yieldGainValue', 'netPnL'].includes(column.key)) {
    return Number(value ?? 0) >= 0 ? 'font-bold text-emerald-700' : 'font-bold text-red-600'
  }
  if (mode === 'machine' && column.key === 'actualYield') return 'font-bold text-emerald-700'
  if (mode === 'machine' && column.key === 'yieldDiff') return Number(value ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600'
  if (mode === 'machine' && column.key === 'utilization') {
    const utilization = Number(value ?? 0)
    if (utilization >= 70) return 'font-bold text-emerald-700'
    if (utilization >= 40) return 'font-bold text-amber-700'
    return 'font-bold text-red-600'
  }
  return ''
}

function wipAgeClass(ageDays: number) {
  if (ageDays > 30) return 'bg-red-50/50'
  if (ageDays > 14) return 'bg-amber-50/30'
  return ''
}
