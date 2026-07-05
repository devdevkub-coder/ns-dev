'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { formatDateDisplay } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type OutputProductValue = {
  cost?: number
  productCode?: string
  productName?: string
  qty?: number
}
type ProductSummaryItem = {
  code?: string
  cost: number
  count: number
  name: string
  qty: number
  unitCost: number
}
type Row = Record<string, string | number | boolean | null | undefined | Record<string, number> | OutputProductValue[]>
type Payload = {
  breakdown?: Record<string, number>
  byStatus?: Array<{ count: number; status: string }>
  daily?: Array<{ date: string; inputQty: number; lossQty: number; outputQty: number }>
  machineUtil?: Array<{ batches: number; name: string; qty: number }>
  monthly?: Array<{ inputQty: number; month: string; outputQty: number }>
  rows: Row[]
  summary: Record<string, number>
  productSummary?: ProductSummaryItem[]
  topProducts?: Array<{ avgCost?: number; batches: number; code?: string; cost: number; name: string; qty: number }>
  wipRows?: Row[]
}
type DashboardTopProduct = NonNullable<Payload['topProducts']>[number]
type DashboardMachineUtil = NonNullable<Payload['machineUtil']>[number]

type Column = {
  key: string
  label: string
  tone?: 'good' | 'bad'
  type?: 'date' | 'money' | 'number' | 'percent' | 'text'
}

type SortDirection = 'asc' | 'desc'

const configs: Record<string, { apiPath: string; columns: Column[]; metrics: Array<{ key: string; label: string; type?: 'money' | 'number' | 'percent' }>; title: string; exportable?: boolean }> = {
  dashboard: {
    apiPath: '/api/production/dashboard',
    title: 'แดชบอร์ดการผลิต',
    metrics: [{ key: 'count', label: 'ใบสั่งผลิต' }, { key: 'outputQty', label: 'ผลิตได้', type: 'number' }, { key: 'wipQty', label: 'WIP', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'lossPct', label: 'Loss', type: 'percent' }],
    columns: [{ key: 'docNo', label: 'เลขที่' }, { key: 'date', label: 'วันที่', type: 'date' }, { key: 'productName', label: 'สินค้า' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'status', label: 'สถานะ' }],
  },
  wip: {
    apiPath: '/api/production/wip-report',
    title: 'WIP คงเหลือ',
    metrics: [{ key: 'count', label: 'ใบที่มี WIP' }, { key: 'wipQty', label: 'WIP Qty', type: 'number' }, { key: 'wipValue', label: 'WIP Value', type: 'money' }],
    columns: [{ key: 'docNo', label: 'ใบสั่งผลิต' }, { key: 'date', label: 'วันที่เริ่ม', type: 'date' }, { key: 'ageDays', label: 'อายุ (วัน)', type: 'number' }, { key: 'branchName', label: 'สาขา' }, { key: 'machineName', label: 'เครื่องจักร' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'wipQty', label: 'WIP Qty', type: 'number' }, { key: 'wipValue', label: 'WIP Value', type: 'money' }, { key: 'status', label: 'สถานะ' }],
  },
  report: {
    apiPath: '/api/production/report',
    title: 'รายงานการผลิต / Yield',
    exportable: true,
    metrics: [{ key: 'inputQty', label: 'วัตถุดิบรวม', type: 'number' }, { key: 'outputQty', label: 'ผลผลิตรวม', type: 'number' }, { key: 'lossQty', label: 'Loss รวม', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'totalCost', label: 'ต้นทุนผลิตรวม', type: 'money' }, { key: 'lossValue', label: 'Loss Value', type: 'money' }],
    columns: [{ key: 'docNo', label: 'เลขที่ใบสั่งผลิต' }, { key: 'date', label: 'วันที่สร้าง', type: 'date' }, { key: 'productionType', label: 'ประเภทเครื่องจักร' }, { key: 'inputProducts', label: 'สินค้าที่เบิกผลิต' }, { key: 'machineName', label: 'เครื่องจักร' }, { key: 'status', label: 'สถานะ' }, { key: 'inputQty', label: 'Input', type: 'number' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'wipQty', label: 'WIP', type: 'number' }, { key: 'lossQty', label: 'Loss', type: 'number' }, { key: 'yieldPct', label: 'Yield', type: 'percent' }, { key: 'inputCost', label: 'RM', type: 'money' }, { key: 'processCost', label: 'Process', type: 'money' }, { key: 'totalCost', label: 'ต้นทุนรวม', type: 'money' }, { key: 'lossValue', label: 'Loss Value (บาท)', type: 'money' }, { key: 'rmCostPerKg', label: 'RM บาท/กก.', type: 'money' }, { key: 'productionCostPerKg', label: 'ต้นทุนผลิต บาท/กก.', type: 'money' }],
  },
  cost: {
    apiPath: '/api/production/production-cost-report',
    title: 'Production Cost Report',
    exportable: true,
    metrics: [{ key: 'inputCost', label: 'RM Cost', type: 'money' }, { key: 'processCost', label: 'Process Cost', type: 'money' }, { key: 'totalCost', label: 'Total Cost', type: 'money' }, { key: 'costPerKg', label: 'ต้นทุนผลผลิต ฿/กก.', type: 'money' }],
    columns: [{ key: 'docNo', label: 'เลขที่' }, { key: 'date', label: 'วันที่', type: 'date' }, { key: 'inputCost', label: 'RM', type: 'money' }, { key: 'processCost', label: 'Process', type: 'money' }, { key: 'totalCost', label: 'Total', type: 'money' }, { key: 'outputQty', label: 'Output', type: 'number' }, { key: 'costPerKg', label: 'ต้นทุนผลผลิต ฿/กก.', type: 'money' }, { key: 'productionType', label: 'Method' }],
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

const wipColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'docNo', defaultWidth: 120, minWidth: 110 },
  { key: 'date', defaultWidth: 100, minWidth: 95 },
  { key: 'ageDays', defaultWidth: 90, minWidth: 80 },
  { key: 'branchName', defaultWidth: 120, minWidth: 100 },
  { key: 'machineName', defaultWidth: 120, minWidth: 100 },
  { key: 'inputQty', defaultWidth: 100, minWidth: 90 },
  { key: 'outputQty', defaultWidth: 100, minWidth: 90 },
  { key: 'wipQty', defaultWidth: 100, minWidth: 90 },
  { key: 'wipValue', defaultWidth: 120, minWidth: 105 },
  { key: 'status', defaultWidth: 100, minWidth: 90 },
]

const reportColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'docNo', defaultWidth: 155, minWidth: 135 },
  { key: 'date', defaultWidth: 115, minWidth: 105 },
  { key: 'productionType', defaultWidth: 125, minWidth: 115 },
  { key: 'inputProducts', defaultWidth: 180, minWidth: 145 },
  { key: 'machineName', defaultWidth: 120, minWidth: 100 },
  { key: 'status', defaultWidth: 120, minWidth: 105 },
  { key: 'inputQty', defaultWidth: 100, minWidth: 90 },
  { key: 'outputQty', defaultWidth: 100, minWidth: 90 },
  { key: 'wipQty', defaultWidth: 100, minWidth: 85 },
  { key: 'lossQty', defaultWidth: 100, minWidth: 85 },
  { key: 'yieldPct', defaultWidth: 90, minWidth: 80 },
  { key: 'inputCost', defaultWidth: 110, minWidth: 95 },
  { key: 'processCost', defaultWidth: 110, minWidth: 95 },
  { key: 'totalCost', defaultWidth: 115, minWidth: 105 },
  { key: 'lossValue', defaultWidth: 130, minWidth: 115 },
  { key: 'rmCostPerKg', defaultWidth: 130, minWidth: 115 },
  { key: 'productionCostPerKg', defaultWidth: 160, minWidth: 140 },
]

const costColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'docNo', defaultWidth: 120, minWidth: 110 },
  { key: 'date', defaultWidth: 100, minWidth: 95 },
  { key: 'inputCost', defaultWidth: 110, minWidth: 95 },
  { key: 'processCost', defaultWidth: 110, minWidth: 95 },
  { key: 'totalCost', defaultWidth: 120, minWidth: 105 },
  { key: 'outputQty', defaultWidth: 100, minWidth: 90 },
  { key: 'costPerKg', defaultWidth: 100, minWidth: 95 },
  { key: 'productionType', defaultWidth: 120, minWidth: 100 },
]

const productionCostBreakdownColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'docNo', defaultWidth: 120, minWidth: 110 },
  { key: 'date', defaultWidth: 110, minWidth: 100 },
  { key: 'rm', defaultWidth: 110, minWidth: 95 },
  { key: 'labor', defaultWidth: 110, minWidth: 95 },
  { key: 'electricity', defaultWidth: 110, minWidth: 95 },
  { key: 'machine', defaultWidth: 110, minWidth: 95 },
  { key: 'fuel', defaultWidth: 100, minWidth: 90 },
  { key: 'maintenance', defaultWidth: 120, minWidth: 105 },
  { key: 'otherProc', defaultWidth: 120, minWidth: 105 },
  { key: 'totalCost', defaultWidth: 130, minWidth: 115 },
  { key: 'outputQty', defaultWidth: 120, minWidth: 105 },
  { key: 'costPerKg', defaultWidth: 150, minWidth: 130 },
  { key: 'method', defaultWidth: 130, minWidth: 110 },
]

const productionCostBreakdownTableColumns: Column[] = [
  { key: 'docNo', label: 'เลขที่', type: 'text' },
  { key: 'date', label: 'วันที่', type: 'date' },
  { key: 'rm', label: 'RM', type: 'money' },
  { key: 'labor', label: 'Labor', type: 'money' },
  { key: 'electricity', label: 'Electricity', type: 'money' },
  { key: 'machine', label: 'Machine', type: 'money' },
  { key: 'fuel', label: 'Fuel', type: 'money' },
  { key: 'maintenance', label: 'Maintenance', type: 'money' },
  { key: 'otherProc', label: 'Other Proc', type: 'money' },
  { key: 'totalCost', label: 'Total Cost', type: 'money' },
  { key: 'outputQty', label: 'Output (kg)', type: 'number' },
  { key: 'costPerKg', label: 'ต้นทุนผลิต ฿/กก.', type: 'money' },
  { key: 'method', label: 'Method', type: 'text' },
]

const yieldLossColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'docNo', defaultWidth: 120, minWidth: 110 },
  { key: 'date', defaultWidth: 100, minWidth: 95 },
  { key: 'inputQty', defaultWidth: 100, minWidth: 90 },
  { key: 'outputQty', defaultWidth: 100, minWidth: 90 },
  { key: 'lossQty', defaultWidth: 100, minWidth: 90 },
  { key: 'yieldPct', defaultWidth: 90, minWidth: 80 },
  { key: 'lossPct', defaultWidth: 90, minWidth: 80 },
  { key: 'normalLossPercent', defaultWidth: 100, minWidth: 90 },
  { key: 'abnormalLossValue', defaultWidth: 110, minWidth: 100 },
  { key: 'yieldGainValue', defaultWidth: 110, minWidth: 100 },
  { key: 'netPnL', defaultWidth: 120, minWidth: 105 },
]

const machineColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'name', defaultWidth: 150, minWidth: 125 },
  { key: 'type', defaultWidth: 100, minWidth: 85 },
  { key: 'branchName', defaultWidth: 120, minWidth: 100 },
  { key: 'capacityKgPerHr', defaultWidth: 100, minWidth: 90 },
  { key: 'normalYieldPct', defaultWidth: 100, minWidth: 90 },
  { key: 'orderCount', defaultWidth: 80, minWidth: 70 },
  { key: 'inputQty', defaultWidth: 100, minWidth: 90 },
  { key: 'outputQty', defaultWidth: 100, minWidth: 90 },
  { key: 'actualYield', defaultWidth: 100, minWidth: 90 },
  { key: 'yieldDiff', defaultWidth: 90, minWidth: 80 },
  { key: 'estHours', defaultWidth: 100, minWidth: 90 },
  { key: 'utilization', defaultWidth: 95, minWidth: 85 },
  { key: 'totalCost', defaultWidth: 120, minWidth: 105 },
]

const productSummaryColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'name', defaultWidth: 280, minWidth: 180 },
  { key: 'count', defaultWidth: 100, minWidth: 80 },
  { key: 'qty', defaultWidth: 160, minWidth: 120 },
  { key: 'cost', defaultWidth: 160, minWidth: 120 },
  { key: 'unitCost', defaultWidth: 180, minWidth: 150 },
]

const dashboardTopProductColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'rank', defaultWidth: 56, minWidth: 48 },
  { key: 'code', defaultWidth: 90, minWidth: 80 },
  { key: 'name', defaultWidth: 220, minWidth: 160 },
  { key: 'batches', defaultWidth: 90, minWidth: 80 },
  { key: 'qty', defaultWidth: 130, minWidth: 110 },
  { key: 'cost', defaultWidth: 130, minWidth: 110 },
  { key: 'avgCost', defaultWidth: 150, minWidth: 130 },
]

const dashboardMachineColumns: Array<ResizableColumnDefinition<string>> = [
  { key: 'name', defaultWidth: 240, minWidth: 160 },
  { key: 'batches', defaultWidth: 120, minWidth: 100 },
  { key: 'qty', defaultWidth: 150, minWidth: 120 },
]

const productSummaryTableColumns: Column[] = [
  { key: 'name', label: 'สินค้า' },
  { key: 'count', label: 'รอบ', type: 'number' },
  { key: 'qty', label: 'น้ำหนักรวม', type: 'number' },
  { key: 'cost', label: 'ต้นทุนรวม', type: 'money' },
  { key: 'unitCost', label: 'ต้นทุนผลผลิต ฿/กก.', type: 'money' },
]

const emptyColumns: Array<ResizableColumnDefinition<string>> = []

const reportRangeOptions = [
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'วันนี้', value: 'today' },
  { label: '7 วัน', value: 'last7' },
  { label: 'เดือนนี้', value: 'month' },
] as const

const productionStatusOptions = [
  { label: 'ทุกสถานะ', value: '' },
  { label: 'ยังไม่เริ่ม', value: 'Open' },
  { label: 'กำลังผลิต', value: 'In Production' },
  { label: 'เสร็จบางส่วน', value: 'Partially Completed' },
  { label: 'เสร็จสิ้น', value: 'Completed' },
  { label: 'ยกเลิก', value: 'Cancelled' },
] as const

type ReportRangeFilter = 'all' | 'custom' | typeof reportRangeOptions[number]['value']

function formatDateLocal(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function productionStatusLabel(status: string) {
  return productionStatusOptions.find((option) => option.value === status)?.label ?? status
}

export function ProductionReportPageClient({ mode }: { mode: keyof typeof configs }) {
  const config = configs[mode]
  const wipResize = useResizableColumns('production.report.wip.v5', wipColumns)
  const reportResize = useResizableColumns('production.report.report.v5', reportColumns)
  const costResize = useResizableColumns('production.report.cost.v5', costColumns)
  const costBreakdownResize = useResizableColumns('production.report.cost.breakdown.v1', productionCostBreakdownColumns)
  const yieldLossResize = useResizableColumns('production.report.yieldLoss.v5', yieldLossColumns)
  const machineResize = useResizableColumns('production.report.machine.v5', machineColumns)
  const productSummaryResize = useResizableColumns('production.report.productSummary.v1', productSummaryColumns)
  const dashboardTopProductResize = useResizableColumns('production.dashboard.top-products.v1', dashboardTopProductColumns)
  const dashboardMachineResize = useResizableColumns('production.dashboard.machine-utilization.v1', dashboardMachineColumns)
  const dummyResize = useResizableColumns('production.report.dummy.v5', emptyColumns)
  const activeResizableColumns = mode === 'wip' ? wipColumns : mode === 'report' ? reportColumns : mode === 'cost' ? costColumns : mode === 'yieldLoss' ? yieldLossColumns : mode === 'machine' ? machineColumns : emptyColumns
  const columnResize = mode === 'wip' ? wipResize : mode === 'report' ? reportResize : mode === 'cost' ? costResize : mode === 'yieldLoss' ? yieldLossResize : mode === 'machine' ? machineResize : dummyResize
  const [data, setData] = useState<Payload | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const latestLoadRequestRef = useRef(0)
  const [rangeType, setRangeType] = useState<'today' | 'last7' | 'last30' | 'last90' | 'month' | 'year' | 'custom'>('custom')
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'machines'>('overview')
  const [reportTab, setReportTab] = useState<'orders' | 'products' | 'wip'>('orders')
  const [sortKey, setSortKey] = useState<string>('date')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')
  const [dashboardProductSortKey, setDashboardProductSortKey] = useState<string>('qty')
  const [dashboardProductSortDir, setDashboardProductSortDir] = useState<SortDirection>('desc')
  const [dashboardMachineSortKey, setDashboardMachineSortKey] = useState<string>('qty')
  const [dashboardMachineSortDir, setDashboardMachineSortDir] = useState<SortDirection>('desc')
  const [reportRangeFilter, setReportRangeFilter] = useState<ReportRangeFilter>('all')
  const [statusFilter, setStatusFilter] = useState('')
  const isReportAllRange = mode === 'report' && reportRangeFilter === 'all'
  const displayedDateFrom = isReportAllRange ? '' : dateFrom
  const displayedDateTo = isReportAllRange ? '' : dateTo

  useEffect(() => {
    setPage(1)
  }, [productSearch, displayedDateFrom, displayedDateTo, statusFilter])

  const loadData = useCallback(async () => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (displayedDateFrom) params.set('dateFrom', displayedDateFrom)
      if (displayedDateTo) params.set('dateTo', displayedDateTo)
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
  }, [config.apiPath, config.title, displayedDateFrom, displayedDateTo])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const rows = useMemo(() => data?.rows ?? [], [data?.rows])
  const filteredRows = useMemo(() => {
    const query = productSearch.trim().toLowerCase()
    return rows.filter((row) => {
      if (mode === 'report' && statusFilter && String(row.status ?? '') !== statusFilter) return false
      if (!query) return true
      const docNo = String(row.docNo ?? '').toLowerCase()
      const outputName = String(row.productName ?? '').toLowerCase()
      const outputCode = String(row.productCode ?? '').toLowerCase()
      const inputProducts = String(row.inputProducts ?? '').toLowerCase()
      const productionType = String(row.productionType ?? '').toLowerCase()
      const machineName = String(row.machineName ?? '').toLowerCase()
      const branchName = String(row.branchName ?? '').toLowerCase()
      return [docNo, outputName, outputCode, inputProducts, productionType, machineName, branchName].some((value) => value.includes(query))
    })
  }, [mode, rows, productSearch, statusFilter])

  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const currentPage = Math.min(page, totalPages)
  const sortedRows = useMemo(() => {
    const column = config.columns.find((item) => item.key === sortKey)
    if (!column) return filteredRows
    return [...filteredRows].sort((left, right) => {
      return compareTableValues(left[sortKey], right[sortKey], column.type, sortDir)
    })
  }, [config.columns, filteredRows, sortDir, sortKey])
  const pagedFilteredRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize])

  const localSummary = useMemo(() => {
    const inputQty = filteredRows.reduce((sum, row) => sum + Number(row.inputQty ?? 0), 0)
    const outputQty = filteredRows.reduce((sum, row) => sum + Number(row.outputQty ?? 0), 0)
    const lossQty = filteredRows.reduce((sum, row) => sum + Number(row.lossQty ?? 0), 0)
    const inputCost = filteredRows.reduce((sum, row) => sum + Number(row.inputCost ?? 0), 0)
    const lossValue = filteredRows.reduce((sum, row) => sum + Number(row.lossValue ?? 0), 0)
    const processCost = filteredRows.reduce((sum, row) => sum + Number(row.processCost ?? 0), 0)
    const totalCost = inputCost + processCost
    const wipQty = filteredRows.reduce((sum, row) => sum + Number(row.wipQty ?? 0), 0)
    const wipValue = filteredRows.reduce((sum, row) => sum + Number(row.wipValue ?? 0), 0)

    return {
      count: filteredRows.length,
      inputQty,
      outputQty,
      lossQty,
      inputCost,
      lossValue,
      processCost,
      totalCost,
      wipQty,
      wipValue,
      yieldPct: inputQty > 0 ? outputQty / inputQty * 100 : 0,
      lossPct: inputQty > 0 ? lossQty / inputQty * 100 : 0,
      costPerKg: outputQty > 0 ? totalCost / outputQty : 0,
      productionCostPerKg: outputQty > 0 ? totalCost / outputQty : 0,
    }
  }, [filteredRows])

  const metricItems = useMemo(() => config.metrics.map((metric) => ({ ...metric, value: localSummary[metric.key as keyof typeof localSummary] ?? 0 })), [config.metrics, localSummary])
  const metricGrid = (
    <div className="grid grid-cols-2 gap-2.5 text-sm sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      {metricItems.map((metric, index) => (
        <Metric
          key={metric.key}
          label={metric.label}
          type={metric.type}
          value={metric.value}
          metricKey={metric.key}
          className={index === metricItems.length - 1 && metricItems.length % 2 !== 0 ? 'col-span-2 md:col-span-1' : ''}
        />
      ))}
    </div>
  )
  const productSummary = useMemo(() => {
    const byProduct = new Map<string, { code?: string; cost: number; count: number; name: string; qty: number }>()
    filteredRows.forEach((row) => {
      const outputs = Array.isArray(row.outputProducts) ? row.outputProducts : []
      outputs.forEach((output) => {
        const name = String(output.productName || output.productCode || '-')
        const key = String(output.productCode || name)
        const current = byProduct.get(key) ?? { code: output.productCode, cost: 0, count: 0, name, qty: 0 }
        current.count += 1
        current.qty += Number(output.qty ?? 0)
        current.cost += Number(output.cost ?? 0)
        byProduct.set(key, current)
      })
    })
    return Array.from(byProduct.values()).map((item) => ({ ...item, unitCost: item.qty > 0 ? item.cost / item.qty : 0 })).sort((left, right) => right.qty - left.qty)
  }, [filteredRows])

  const wipRows = useMemo(() => filteredRows.filter((row) => Number(row.wipQty ?? 0) > 0.000001), [filteredRows])
  const totalWipQty = useMemo(() => wipRows.reduce((sum, r) => sum + Number(r.wipQty ?? 0), 0), [wipRows])
  const totalWipValue = useMemo(() => wipRows.reduce((sum, r) => sum + Number(r.wipValue ?? 0), 0), [wipRows])
  const sortedWipRows = useMemo(() => {
    const column = configs.wip.columns.find((item) => item.key === sortKey)
    if (!column) return wipRows
    return [...wipRows].sort((left, right) => compareTableValues(left[sortKey], right[sortKey], column.type, sortDir))
  }, [sortDir, sortKey, wipRows])
  const sortedProductSummary = useMemo(() => {
    const column = productSummaryTableColumns.find((item) => item.key === sortKey)
    if (!column) return productSummary
    return [...productSummary].sort((left, right) => {
      const leftValue = (left as Record<string, string | number>)[sortKey]
      const rightValue = (right as Record<string, string | number>)[sortKey]
      return compareTableValues(leftValue, rightValue, column.type, sortDir)
    })
  }, [productSummary, sortDir, sortKey])
  const sortedCostRows = useMemo(() => {
    const column = productionCostBreakdownTableColumns.find((item) => item.key === sortKey)
    if (!column) return filteredRows
    return [...filteredRows].sort((left, right) => compareTableValues(productionCostBreakdownValue(left, sortKey), productionCostBreakdownValue(right, sortKey), column.type, sortDir))
  }, [filteredRows, sortDir, sortKey])
  const dashboardTopProducts = useMemo(() => data?.topProducts ?? [], [data?.topProducts])
  const sortedDashboardTopProducts = useMemo(() => {
    return [...dashboardTopProducts].sort((left, right) => {
      const type = dashboardProductSortKey === 'name' || dashboardProductSortKey === 'code' ? 'text' : 'number'
      return compareTableValues(dashboardTopProductValue(left, dashboardProductSortKey), dashboardTopProductValue(right, dashboardProductSortKey), type, dashboardProductSortDir)
    })
  }, [dashboardProductSortDir, dashboardProductSortKey, dashboardTopProducts])
  const dashboardMachineUtil = useMemo(() => data?.machineUtil ?? [], [data?.machineUtil])
  const sortedDashboardMachineUtil = useMemo(() => {
    return [...dashboardMachineUtil].sort((left, right) => {
      const type = dashboardMachineSortKey === 'name' ? 'text' : 'number'
      return compareTableValues(dashboardMachineValue(left, dashboardMachineSortKey), dashboardMachineValue(right, dashboardMachineSortKey), type, dashboardMachineSortDir)
    })
  }, [dashboardMachineSortDir, dashboardMachineSortKey, dashboardMachineUtil])
  const hasActiveFilters = Boolean(displayedDateFrom || displayedDateTo || productSearch || statusFilter)

  function applyReportRange(range: Exclude<ReportRangeFilter, 'custom'>) {
    setReportRangeFilter(range)
    if (range === 'all') {
      setDateFrom('')
      setDateTo('')
      return
    }
    const end = new Date()
    const start = new Date(end)
    if (range === 'last7') start.setDate(start.getDate() - 6)
    if (range === 'month') start.setDate(1)
    setDateFrom(formatDateLocal(start))
    setDateTo(formatDateLocal(end))
  }

  function clearFilters() {
    setDateFrom('')
    setDateTo('')
    setProductSearch('')
    setStatusFilter('')
    setReportRangeFilter('all')
  }

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
    setRangeType(range)
  }

  function exportCsv() {
    const header = config.columns.map((column) => column.label)
    const body = filteredRows.map((row) => config.columns.map((column) => formatDisplayCell(row, column, mode)))
    const csv = [header, ...body].map((line) => line.map((value) => `"${value.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${mode}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function toggleSort(nextKey: string) {
    setPage(1)
    setSortKey((currentKey) => {
      if (currentKey === nextKey) {
        setSortDir((currentDir) => currentDir === 'asc' ? 'desc' : 'asc')
        return currentKey
      }
      setSortDir('asc')
      return nextKey
    })
  }

  function toggleDashboardProductSort(nextKey: string) {
    setDashboardProductSortKey((currentKey) => {
      if (currentKey === nextKey) {
        setDashboardProductSortDir((currentDir) => currentDir === 'asc' ? 'desc' : 'asc')
        return currentKey
      }
      setDashboardProductSortDir('asc')
      return nextKey
    })
  }

  function toggleDashboardMachineSort(nextKey: string) {
    setDashboardMachineSortKey((currentKey) => {
      if (currentKey === nextKey) {
        setDashboardMachineSortDir((currentDir) => currentDir === 'asc' ? 'desc' : 'asc')
        return currentKey
      }
      setDashboardMachineSortDir('asc')
      return nextKey
    })
  }

  if (mode === 'cost') {
    const breakdown = data?.breakdown ?? {}
    const summary = data?.summary ?? {}
    const costRows = sortedCostRows
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
      const header = ['เลขที่', 'วันที่', 'RM', 'Labor', 'Electricity', 'Machine', 'Fuel', 'Maintenance', 'Other Proc', 'Total Cost', 'Output (kg)', 'ต้นทุนผลผลิต ฿/กก.', 'Method']
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <DatePickerInput className="flex-1 sm:flex-none sm:w-[130px]" value={dateFrom} onChange={setDateFrom} />
            <span className="text-slate-400 text-sm shrink-0">-</span>
            <DatePickerInput className="flex-1 sm:flex-none sm:w-[130px]" value={dateTo} onChange={setDateTo} />
            <button className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 focus:outline-none shrink-0" type="button" onClick={() => { setDateFrom(''); setDateTo('') }}>
              <span className="hidden xs:inline">ล้างวันที่</span>
              <span className="xs:hidden">ล้าง</span>
            </button>
          </div>
          {costBreakdownResize.hasCustomWidths ? (
            <button
              className="hidden rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none lg:inline-flex"
              type="button"
              onClick={costBreakdownResize.resetColumnWidths}
            >
              คืนค่าเดิมตาราง
            </button>
          ) : null}
          <button className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white focus:outline-none sm:ml-auto w-full sm:w-auto text-center shrink-0" type="button" onClick={exportCostCsv}>
            Export CSV
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 lg:grid-cols-7 text-sm">
          <CostCard label="RM Cost" tone="red" value={costTotals.rm} emoji="📦" iconBg="bg-red-100 text-red-700" />
          <CostCard label="Labor" value={costTotals.labor} emoji="👷" iconBg="bg-blue-100 text-blue-700" />
          <CostCard label="Electricity" value={costTotals.electricity} emoji="⚡" iconBg="bg-amber-100 text-amber-700" />
          <CostCard label="Machine" value={costTotals.machine} emoji="⚙️" iconBg="bg-purple-100 text-purple-700" />
          <CostCard label="Fuel" value={costTotals.fuel} emoji="🔥" iconBg="bg-red-100 text-red-700" />
          <CostCard label="Other Process" value={costTotals.otherProc + costTotals.maintenance} emoji="🔧" />
          <div className="bg-white p-3 sm:p-4 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-3 col-span-2 lg:col-span-1">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg sm:text-xl shrink-0">
              💰
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-500 truncate">Total / Cost per Kg</div>
              <div className="text-base font-bold text-emerald-700 mt-0.5 tabular-nums">{formatMoney(costTotals.total)}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5 truncate">{formatMoney(costTotals.outputQty > 0 ? costTotals.total / costTotals.outputQty : 0)} ฿/กก.</div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-100 bg-white shadow-sm hidden lg:block">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: costBreakdownResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {productionCostBreakdownColumns.map((column, index) => (
                  <col
                    key={column.key}
                    style={index === productionCostBreakdownColumns.length - 1 ? { minWidth: column.minWidth ?? 80 } : costBreakdownResize.getColumnStyle(column.key)}
                  />
                ))}
              </colgroup>
              <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                <tr>
                  {productionCostBreakdownTableColumns.map((column) => (
                    <ResizableTableHead
                      key={column.key}
                      activeSortKey={sortKey}
                      align={column.type === 'money' || column.type === 'number' ? 'right' : 'left'}
                      direction={sortDir}
                      label={column.label}
                      resizeProps={costBreakdownResize.getResizeHandleProps(column.key, column.label)}
                      sortKey={column.key}
                      onSort={toggleSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? <tr><td className="py-6 text-center text-slate-500" colSpan={13}>กำลังโหลดข้อมูล</td></tr> : null}
                {!isLoading && costRows.map((row, index) => {
                  return (
                    <tr key={String(row.id ?? index)} className="border-t border-slate-100 hover:bg-slate-50">
                      {productionCostBreakdownTableColumns.map((column) => (
                        <td
                          key={column.key}
                          className={`p-2 text-xs min-w-0 overflow-hidden ${productionCostBreakdownCellClass(column)}`}
                        >
                          <div className={column.type === 'money' || column.type === 'number' ? 'truncate text-right tabular-nums' : 'truncate'} title={formatProductionCostBreakdownCell(row, column)}>
                            {formatProductionCostBreakdownCell(row, column)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {!isLoading && costRows.length === 0 ? <tr><td className="py-6 text-center text-slate-400" colSpan={13}>ไม่มีข้อมูล</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cost Mobile Card List View */}
        <div className="lg:hidden space-y-3">
          {costRows.map((row, index) => {
            const costs = costBreakdown(row)
            return (
              <div key={String(row.id ?? index)} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-mono text-sm font-bold text-slate-800">{String(row.docNo ?? '')}</span>
                  <span className="text-sm text-slate-600 font-medium">{formatDateDisplay(String(row.date ?? ''))}</span>
                </div>
                <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  <div>
                    <span className="text-slate-500 block text-sm font-semibold">RM Cost</span>
                    <span className="text-sm font-bold text-slate-900">{formatMoney(Number(row.inputCost ?? 0))} ฿</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-sm font-semibold">Labor Cost</span>
                    <span className="text-sm font-bold text-slate-900">{formatMoney(costs.labor)} ฿</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-sm font-semibold">Electricity</span>
                    <span className="text-sm font-bold text-slate-900">{formatMoney(costs.electricity)} ฿</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-sm font-semibold">Machine / Fuel</span>
                    <span className="text-sm font-bold text-slate-900">{formatMoney(costs.machine + costs.fuel)} ฿</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-sm font-semibold">Output (kg)</span>
                    <span className="text-base font-bold text-emerald-700">{formatMoney(Number(row.outputQty ?? 0))} กก.</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-sm font-semibold">Allocation Method</span>
                    <span className="text-sm font-bold text-slate-700">{String(row.costAllocationMethod ?? row.productionType ?? '-')}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-1">
                  <span className="text-sm font-semibold text-slate-500">Total Cost / ฿/kg</span>
                  <div className="text-right">
                    <div className="text-base font-bold text-blue-700">{formatMoney(Number(row.totalCost ?? 0))} ฿</div>
                    <div className="text-sm text-slate-600 font-medium">{formatMoney(Number(row.costPerKg ?? 0))} ฿/กก.</div>
                  </div>
                </div>
              </div>
            )
          })}
          {costRows.length === 0 ? <div className="py-6 text-center text-slate-400 bg-white rounded-md shadow border border-slate-200">ไม่มีข้อมูล</div> : null}
        </div>
      </section>
    )
  }

  if (mode === 'dashboard') {
    const summary = data?.summary ?? {}
    const topProducts = sortedDashboardTopProducts
    const byStatus = data?.byStatus ?? []
    const daily = data?.daily ?? []
    const monthly = data?.monthly ?? []
    const machineUtil = sortedDashboardMachineUtil
    return (
      <section className="space-y-4">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}

        {/* Desktop Header: Premium Gradient Card */}
        <div className="hidden lg:block rounded-xl bg-gradient-to-r from-purple-700 to-pink-600 p-5 text-white shadow-sm border border-transparent">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">แดชบอร์ดการผลิต</h1>
              <p className="mt-1 text-xs opacity-90">รายงานการผลิตแบบสรุป รายวัน / รายเดือน + Charts</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                ['today', 'วันนี้'],
                ['last7', '7 วัน'],
                ['last30', '30 วัน'],
                ['last90', '90 วัน'],
                ['month', 'เดือนนี้'],
                ['year', 'ปีนี้'],
              ].map(([value, label]) => {
                const isActive = rangeType === value
                return (
                  <button
                    key={value}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isActive
                        ? 'bg-white text-purple-700 shadow-sm border border-white'
                        : 'bg-white/20 text-white hover:bg-white/30 border border-transparent'
                    }`}
                    type="button"
                    onClick={() => applyDashboardRange(value as Parameters<typeof applyDashboardRange>[0])}
                  >
                    {label}
                  </button>
                )
              })}
              <DatePickerInput
                className="w-[120px] bg-white text-slate-900 h-9"
                value={dateFrom}
                onChange={(val) => { setDateFrom(val); setRangeType('custom') }}
              />
              <span className="text-sm">→</span>
              <DatePickerInput
                className="w-[120px] bg-white text-slate-900 h-9"
                value={dateTo}
                onChange={(val) => { setDateTo(val); setRangeType('custom') }}
              />
            </div>
          </div>
        </div>

        {/* Mobile Header & Controls (Clean Native App Style) */}
        <div className="lg:hidden flex flex-col gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">แดชบอร์ดการผลิต</h1>
            <p className="text-xs text-slate-500 font-medium">รายงานการผลิตแบบสรุป รายวัน / รายเดือน</p>
          </div>

          {/* Horizontal scrollable range filter pills */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              ['today', 'วันนี้'],
              ['last7', '7 วัน'],
              ['last30', '30 วัน'],
              ['last90', '90 วัน'],
              ['month', 'เดือนนี้'],
              ['year', 'ปีนี้'],
            ].map(([value, label]) => {
              const isActive = rangeType === value
              return (
                <button
                  key={value}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all shrink-0 border ${
                    isActive
                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                  type="button"
                  onClick={() => applyDashboardRange(value as Parameters<typeof applyDashboardRange>[0])}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* Date Picker Row for Custom Dates */}
          <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-sm w-full">
            <span className="text-xs text-slate-500 font-bold shrink-0">กำหนดเอง:</span>
            <DatePickerInput
              className="flex-1 min-w-0 bg-slate-50 border-slate-200 h-9"
              value={dateFrom}
              onChange={(val) => { setDateFrom(val); setRangeType('custom') }}
            />
            <span className="text-slate-400 text-xs font-bold shrink-0">→</span>
            <DatePickerInput
              className="flex-1 min-w-0 bg-slate-50 border-slate-200 h-9"
              value={dateTo}
              onChange={(val) => { setDateTo(val); setRangeType('custom') }}
            />
          </div>
        </div>

        {/* Mobile iOS-Style Segmented Tab Navigation */}
        <div className="lg:hidden flex rounded-xl bg-slate-100 p-1 border border-slate-200/40">
          {(['overview', 'products', 'machines'] as const).map((tab) => {
            const isActive = activeTab === tab
            const label = tab === 'overview' ? '📊 ภาพรวม' : tab === 'products' ? '📦 สินค้า' : '⚙️ เครื่องจักร'
            return (
              <button
                key={tab}
                className={`flex-1 rounded-lg py-2 text-xs font-bold text-center transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200/20'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
                type="button"
                onClick={() => setActiveTab(tab)}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* KPI Cards Container */}
        <div className={`grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4 text-sm ${
          activeTab === 'overview' ? 'grid lg:grid' : 'hidden lg:grid'
        }`}>
          <DashboardKpi label="ใบสั่งผลิต" note={`Input ${formatMoney(summary.inputQty ?? 0)} | Output ${formatMoney(summary.outputQty ?? 0)}`} tone="blue" value={formatMoney(summary.count ?? 0)} emoji="🏭" />
          <DashboardKpi label="ผลิตได้" note="กก. ไม่รวม Loss" tone="emerald" value={formatMoney(summary.outputQty ?? 0)} emoji="📦" />
          <DashboardKpi label="WIP คงเหลือทั้งระบบ" note="กก. ที่ยังผลิตค้างอยู่" tone="amber" value={formatMoney(summary.totalWipQty ?? summary.wipQty ?? 0)} emoji="⚙️" />
          <DashboardKpi label="Yield %" note={`Loss ${Number(summary.lossPct ?? 0).toFixed(1)}%`} tone="purple" value={`${Number(summary.yieldPct ?? 0).toFixed(1)}%`} emoji="📈" />
        </div>

        {/* Charts Container */}
        <div className={`grid-cols-1 gap-4 lg:grid-cols-2 ${
          activeTab === 'overview' ? 'grid lg:grid' : 'hidden lg:grid'
        }`}>
          <ChartPanel title="ผลิตรายวัน (Input/Output/Loss)" type="line" rows={daily.map((item) => ({ label: item.date.slice(5), input: item.inputQty, output: item.outputQty, loss: item.lossQty }))} />
          <ChartPanel title="ผลิตรายเดือน (12 เดือนล่าสุด)" type="bar" rows={monthly.map((item) => ({ label: item.month.slice(5), input: item.inputQty, output: item.outputQty, loss: 0 }))} />
        </div>

        {/* Status Panels & Product Lists */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Status List */}
          <div className={`rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm ${
            activeTab === 'overview' ? 'block lg:block' : 'hidden lg:block'
          }`}>
            <h3 className="mb-3 font-bold text-slate-700 text-sm">สถานะใบสั่งผลิต</h3>
            <div className="space-y-2">
              {byStatus.map((item) => <StatusBar key={item.status} count={item.count} max={Math.max(1, ...byStatus.map((row) => row.count))} status={item.status} />)}
              {!byStatus.length ? <div className="py-6 text-center text-sm text-slate-400">ยังไม่มีข้อมูล</div> : null}
            </div>
          </div>

          {/* Top Products Card */}
          <div className={`rounded-xl border border-slate-200/60 bg-white shadow-sm lg:col-span-2 flex flex-col overflow-hidden ${
            activeTab === 'products' ? 'flex lg:flex' : 'hidden lg:flex'
          }`}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-emerald-50/50 p-3">
              <h3 className="font-bold text-emerald-700 text-sm">Top 10 สินค้าที่ผลิตมากสุด</h3>
              {dashboardTopProductResize.hasCustomWidths ? (
                <button
                  className="hidden rounded-md border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 lg:inline-flex"
                  type="button"
                  onClick={dashboardTopProductResize.resetColumnWidths}
                >
                  คืนค่าเดิมตาราง
                </button>
              ) : null}
            </div>

            {/* Desktop View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: dashboardTopProductResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  {dashboardTopProductColumns.map((column, index) => (
                    <col
                      key={column.key}
                      style={index === dashboardTopProductColumns.length - 1 ? { minWidth: column.minWidth ?? 80 } : dashboardTopProductResize.getColumnStyle(column.key)}
                    />
                  ))}
                </colgroup>
                <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <tr>
                    <ResizableTableHead align="center" label="#" resizeProps={dashboardTopProductResize.getResizeHandleProps('rank', '#')} />
                    <ResizableTableHead activeSortKey={dashboardProductSortKey} direction={dashboardProductSortDir} label="Code" resizeProps={dashboardTopProductResize.getResizeHandleProps('code', 'Code')} sortKey="code" onSort={toggleDashboardProductSort} />
                    <ResizableTableHead activeSortKey={dashboardProductSortKey} direction={dashboardProductSortDir} label="สินค้า" resizeProps={dashboardTopProductResize.getResizeHandleProps('name', 'สินค้า')} sortKey="name" onSort={toggleDashboardProductSort} />
                    <ResizableTableHead activeSortKey={dashboardProductSortKey} align="right" direction={dashboardProductSortDir} label="รอบ" resizeProps={dashboardTopProductResize.getResizeHandleProps('batches', 'รอบ')} sortKey="batches" onSort={toggleDashboardProductSort} />
                    <ResizableTableHead activeSortKey={dashboardProductSortKey} align="right" direction={dashboardProductSortDir} label="น้ำหนัก" resizeProps={dashboardTopProductResize.getResizeHandleProps('qty', 'น้ำหนัก')} sortKey="qty" onSort={toggleDashboardProductSort} />
                    <ResizableTableHead activeSortKey={dashboardProductSortKey} align="right" direction={dashboardProductSortDir} label="ต้นทุนรวม" resizeProps={dashboardTopProductResize.getResizeHandleProps('cost', 'ต้นทุนรวม')} sortKey="cost" onSort={toggleDashboardProductSort} />
                    <ResizableTableHead activeSortKey={dashboardProductSortKey} align="right" direction={dashboardProductSortDir} label="ต้นทุนผลิต ฿/กก." resizeProps={dashboardTopProductResize.getResizeHandleProps('avgCost', 'ต้นทุนผลิต ฿/กก.')} sortKey="avgCost" onSort={toggleDashboardProductSort} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {topProducts.map((item, index) => (
                    <tr key={`${item.code || item.name}-${index}`} className="hover:bg-slate-50">
                      <td className="p-2 text-center text-xs font-bold text-emerald-700 tabular-nums">{index + 1}</td>
                      <td className="p-2 font-mono text-xs text-slate-600 min-w-0 overflow-hidden"><div className="truncate" title={item.code || '-'}>{item.code || '-'}</div></td>
                      <td className="p-2 text-xs text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={item.name}>{item.name}</div></td>
                      <td className="p-2 text-right text-xs tabular-nums whitespace-nowrap">{item.batches}</td>
                      <td className="p-2 text-right font-bold text-xs tabular-nums whitespace-nowrap">{formatMoney(item.qty)}</td>
                      <td className="p-2 text-right text-xs tabular-nums whitespace-nowrap">{formatMoney(item.cost)}</td>
                      <td className="p-2 text-right text-xs text-slate-600 tabular-nums whitespace-nowrap">{formatMoney(item.avgCost ?? (item.qty > 0 ? item.cost / item.qty : 0))}</td>
                    </tr>
                  ))}
                  {!topProducts.length ? <tr><td className="py-6 text-center text-slate-400" colSpan={7}>ยังไม่มีข้อมูลในช่วงนี้</td></tr> : null}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="lg:hidden p-3 space-y-3 bg-slate-50/30 flex-1">
              {topProducts.map((item, index) => (
                <div key={`${item.code || item.name}-${index}`} className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm space-y-3">
                  <div className="border-b border-slate-100 pb-2 flex justify-between items-center">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0">
                        {index + 1}
                      </span>
                      <span className="font-bold text-slate-900 text-base truncate">{item.name}</span>
                    </div>
                    <span className="font-mono text-sm text-slate-500 shrink-0">{item.code || '-'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                    <div>
                      <span className="text-slate-500 block text-sm font-semibold">รอบการผลิต</span>
                      <span className="text-sm font-bold text-slate-900 mt-0.5 block">{item.batches} รอบ</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-sm font-semibold">น้ำหนักรวม</span>
                      <span className="text-base font-bold text-emerald-700 mt-0.5 block">{formatMoney(item.qty)} กก.</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-sm font-semibold">ต้นทุนรวม</span>
                      <span className="text-sm font-bold text-slate-900 mt-0.5 block">{formatMoney(item.cost)} ฿</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-sm font-semibold">ต้นทุนเฉลี่ย</span>
                      <span className="text-sm font-bold text-slate-800 mt-0.5 block">
                        {formatMoney(item.avgCost ?? (item.qty > 0 ? item.cost / item.qty : 0))} ฿/กก.
                      </span>
                    </div>
                  </div>
                </div>
              ))}
              {!topProducts.length ? <div className="py-4 text-center text-sm text-slate-400 bg-white rounded-xl border border-slate-200/60">ยังไม่มีข้อมูลในช่วงนี้</div> : null}
            </div>
          </div>
        {/* Machine Utilization Card */}
        <div className={`rounded-xl border border-slate-200/60 bg-white shadow-sm flex flex-col overflow-hidden ${
          activeTab === 'machines' ? 'flex lg:flex' : 'hidden lg:flex'
        }`}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-indigo-50/50 p-3">
            <h3 className="font-bold text-indigo-700 text-sm">Machine Utilization (ปริมาณผลิตต่อเครื่อง)</h3>
            {dashboardMachineResize.hasCustomWidths ? (
              <button
                className="hidden rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 lg:inline-flex"
                type="button"
                onClick={dashboardMachineResize.resetColumnWidths}
              >
                คืนค่าเดิมตาราง
              </button>
            ) : null}
          </div>

          {/* Desktop View */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: dashboardMachineResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {dashboardMachineColumns.map((column, index) => (
                  <col
                    key={column.key}
                    style={index === dashboardMachineColumns.length - 1 ? { minWidth: column.minWidth ?? 80 } : dashboardMachineResize.getColumnStyle(column.key)}
                  />
                ))}
              </colgroup>
              <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                <tr>
                  <ResizableTableHead activeSortKey={dashboardMachineSortKey} direction={dashboardMachineSortDir} label="เครื่องจักร" resizeProps={dashboardMachineResize.getResizeHandleProps('name', 'เครื่องจักร')} sortKey="name" onSort={toggleDashboardMachineSort} />
                  <ResizableTableHead activeSortKey={dashboardMachineSortKey} align="right" direction={dashboardMachineSortDir} label="รอบที่ใช้" resizeProps={dashboardMachineResize.getResizeHandleProps('batches', 'รอบที่ใช้')} sortKey="batches" onSort={toggleDashboardMachineSort} />
                  <ResizableTableHead activeSortKey={dashboardMachineSortKey} align="right" direction={dashboardMachineSortDir} label="น้ำหนักผลิต" resizeProps={dashboardMachineResize.getResizeHandleProps('qty', 'น้ำหนักผลิต')} sortKey="qty" onSort={toggleDashboardMachineSort} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {machineUtil.map((item) => (
                  <tr key={item.name} className="hover:bg-slate-50">
                    <td className="p-2 text-xs text-slate-700 min-w-0 overflow-hidden"><div className="truncate" title={item.name}>{item.name}</div></td>
                    <td className="p-2 text-right text-xs tabular-nums whitespace-nowrap">{item.batches}</td>
                    <td className="p-2 text-right font-bold text-indigo-700 text-xs tabular-nums whitespace-nowrap">{formatMoney(item.qty)}</td>
                  </tr>
                ))}
                {!machineUtil.length ? <tr><td className="py-6 text-center text-slate-400" colSpan={3}>ยังไม่มีข้อมูล</td></tr> : null}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="lg:hidden p-3 space-y-3 bg-slate-50/30">
            {machineUtil.map((item) => (
              <div key={item.name} className="bg-white p-4 rounded-xl border border-slate-200/60 shadow-sm space-y-3">
                <div className="border-b border-slate-100 pb-2 flex justify-between items-center">
                  <span className="font-bold text-slate-900 text-base truncate">{item.name}</span>
                  <span className="text-base font-bold text-indigo-700 shrink-0">{formatMoney(item.qty)} กก.</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-semibold">รอบที่ใช้งาน</span>
                  <span className="text-sm font-bold text-slate-800 bg-slate-50 px-2.5 py-0.5 rounded-md border border-slate-200">
                    {item.batches} รอบ
                  </span>
                </div>
              </div>
            ))}
            {!machineUtil.length ? <div className="py-4 text-center text-sm text-slate-400 bg-white rounded-xl border border-slate-200">ยังไม่มีข้อมูล</div> : null}
          </div>
        </div>
        </div>
        {isLoading ? <div className="text-center text-sm text-slate-500">กำลังโหลดข้อมูล</div> : null}
      </section>
    )
  }

  const filterCard = (
    <div className="rounded-md bg-white p-3 shadow">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 w-full">
          <div className="w-full lg:min-w-[260px] lg:flex-1 relative">
            <input
              type="text"
              placeholder="ค้นหาเลขที่ใบสั่งผลิต / สินค้า / เครื่องจักร"
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-300 h-[38px]"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
            />
            {productSearch ? (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-base font-bold"
                onClick={() => setProductSearch('')}
              >
                &times;
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto lg:ml-auto">
            <span className="text-xs font-semibold text-slate-500 shrink-0">วันที่สร้าง:</span>
            <DatePickerInput className="flex-1 sm:flex-none sm:w-[130px]" placeholder={isReportAllRange ? 'ไม่จำกัด' : undefined} value={displayedDateFrom} onChange={(value) => { setDateFrom(value); setReportRangeFilter('custom') }} />
            <span className="text-slate-400 text-sm shrink-0">-</span>
            <DatePickerInput className="flex-1 sm:flex-none sm:w-[130px]" placeholder={isReportAllRange ? 'ไม่จำกัด' : undefined} value={displayedDateTo} onChange={(value) => { setDateTo(value); setReportRangeFilter('custom') }} />
            {isReportAllRange ? <span className="rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500">ไม่จำกัดช่วงวันที่</span> : null}
            {hasActiveFilters ? (
              <button className="rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 focus:outline-none shrink-0" type="button" onClick={clearFilters}>
                <span className="hidden xs:inline">ล้างตัวกรอง</span>
                <span className="xs:hidden">ล้าง</span>
              </button>
            ) : null}
          </div>
          {config.exportable ? (
            <button className="rounded-md bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm font-semibold text-white focus:outline-none w-full sm:w-auto text-center shrink-0" type="button" onClick={exportCsv}>
              ส่งออก CSV
            </button>
          ) : null}
        </div>
        {mode === 'report' ? (
          <div className="mt-3 flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-500">ช่วงเวลา:</span>
              {reportRangeOptions.map((option) => {
                const isActive = reportRangeFilter === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`rounded-md border px-3 py-1 text-xs font-medium ${isActive ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
                    onClick={() => applyReportRange(option.value)}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-500">สถานะผลิต:</span>
              {productionStatusOptions.map((option) => {
                const isActive = statusFilter === option.value
                return (
                  <button
                    key={option.value || 'all'}
                    type="button"
                    className={`rounded-md border px-3 py-1 text-xs font-medium ${isActive ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
                    onClick={() => setStatusFilter(option.value)}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}
    </div>
  )

  const reportTabs = (
    <Tabs
      className="gap-2"
      value={reportTab}
      onValueChange={(value) => {
        setReportTab(value as typeof reportTab)
        setPage(1)
      }}
    >
      <TabsList className="w-full overflow-x-auto rounded-md bg-white px-2 shadow-sm" variant="line">
        <TabsTrigger value="orders" variant="line">รายการใบสั่งผลิต</TabsTrigger>
        <TabsTrigger value="wip" variant="line">WIP คงเหลือ</TabsTrigger>
        <TabsTrigger value="products" variant="line">สรุปตามสินค้า</TabsTrigger>
      </TabsList>
    </Tabs>
  )

  return (
    <section className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
      {mode === 'report' ? metricGrid : null}
      {mode === 'report' ? reportTabs : filterCard}
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
      {mode !== 'report' ? metricGrid : null}
      {mode === 'yieldLoss' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-4 text-sm mt-4">
          <ImpactCard label="Yield Gain (Output > คาดหวัง)" tone="gain" value={Number(data?.summary?.yieldGainValue ?? 0)} />
          <ImpactCard label="Abnormal Loss (Output < Normal)" tone="loss" value={Number(data?.summary?.abnormalLossValue ?? 0)} />
          <ImpactCard label="Net P&L Impact" tone={Number(data?.summary?.netPnL ?? 0) >= 0 ? 'netGood' : 'netBad'} value={Number(data?.summary?.netPnL ?? 0)} />
        </div>
      ) : null}
      {mode === 'report' ? (
        <div className="space-y-3">
          {filterCard}
          {/* WIP คงเหลือ (Work-in-Progress) */}
          {reportTab === 'wip' ? (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <div>พบทั้งหมด <span className="font-semibold text-slate-900">{wipRows.length}</span> รายการ</div>
                <div className="text-xs text-slate-500">
                  WIP รวม <span className="font-semibold text-amber-700">{formatMoney(totalWipQty)} กก.</span>
                  <span className="mx-1 text-slate-300">|</span>
                  มูลค่า <span className="font-semibold text-slate-900">{formatMoney(totalWipValue)} บาท</span>
                  {wipResize.hasCustomWidths ? (
                    <Button className="ml-2 hidden md:inline-flex" size="sm" type="button" variant="outline" onClick={wipResize.resetColumnWidths}>
                      คืนค่าเดิมตาราง
                    </Button>
                  ) : null}
                </div>
              </div>

              {/* Desktop View */}
              <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm md:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: wipResize.tableMinWidth, tableLayout: 'fixed' }}>
                    <colgroup>
                      {configs.wip.columns.map((col, index) => {
                        const columnDefinition = wipColumns.find((column) => column.key === col.key)
                        if (index === configs.wip.columns.length - 1) {
                          return <col key={col.key} style={{ minWidth: columnDefinition?.minWidth ?? 80 }} />
                        }
                        return <col key={col.key} style={wipResize.getColumnStyle(col.key)} />
                      })}
                    </colgroup>
                    <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                      <tr>
                        {configs.wip.columns.map((column) => (
                          <ResizableTableHead
                            key={column.key}
                            activeSortKey={sortKey}
                            align={column.type === 'number' || column.type === 'money' || column.type === 'percent' ? 'right' : 'left'}
                            direction={sortDir}
                            label={column.label}
                            resizeProps={wipResize.getResizeHandleProps(column.key, column.label)}
                            sortKey={column.key}
                            onSort={toggleSort}
                          />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedWipRows.map((row, index) => {
                        const ageDays = Math.max(0, Math.floor((new Date().getTime() - new Date(String(row.date ?? '')).getTime()) / (1000 * 60 * 60 * 24)))
                        return (
                          <tr key={String(row.id ?? index)} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${wipAgeClass(ageDays)}`}>
                            <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-900">{String(row.docNo ?? '')}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDateDisplay(String(row.date ?? ''))}</td>
                            <td className={`whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums ${cellTone(ageDays, { key: 'ageDays', label: 'อายุ (วัน)' }, 'wip')}`}>{ageDays}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-700">{String(row.branchName ?? '-')}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-700">{String(row.machineName ?? '-')}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatMoney(Number(row.inputQty ?? 0))}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatMoney(Number(row.outputQty ?? 0))}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-bold tabular-nums text-amber-700">{formatMoney(Number(row.wipQty ?? 0))}</td>
                            <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatMoney(Number(row.wipValue ?? 0))}</td>
                            <td className="whitespace-nowrap px-3 py-3">
                              <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${row.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                {productionStatusLabel(String(row.status ?? ''))}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {!wipRows.length ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={10}>ไม่มี WIP คงเหลือ</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile View */}
              <div className="space-y-3 md:hidden">
                  {wipRows.map((row, index) => {
                    const ageDays = Math.max(0, Math.floor((new Date().getTime() - new Date(String(row.date ?? '')).getTime()) / (1000 * 60 * 60 * 24)))
                    return (
                      <div key={String(row.id ?? index)} className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 ${wipAgeClass(ageDays)}`}>
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="font-mono text-base font-bold text-slate-900">{String(row.docNo ?? '')}</span>
                          <span className="text-sm text-slate-600 font-medium">{formatDateDisplay(String(row.date ?? ''))}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                          <div>
                            <span className="text-slate-500 block text-sm font-semibold">อายุ (วัน)</span>
                            <span className={`text-sm font-bold mt-0.5 block ${cellTone(ageDays, { key: 'ageDays', label: 'อายุ (วัน)' }, 'wip')}`}>{ageDays} วัน</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-sm font-semibold">สาขา / เครื่องจักร</span>
                            <span className="text-sm font-bold text-slate-900 truncate block mt-0.5">{String(row.branchName ?? '')} / {String(row.machineName ?? '-')}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-sm font-semibold">Input / Output</span>
                            <span className="text-sm font-bold text-slate-900 mt-0.5 block">{formatMoney(Number(row.inputQty ?? 0))} / {formatMoney(Number(row.outputQty ?? 0))} กก.</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-sm font-semibold">สถานะ</span>
                            <span className="mt-0.5 block">
                              <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${row.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                {productionStatusLabel(String(row.status ?? ''))}
                              </span>
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-1">
                          <span className="text-sm font-semibold text-slate-500">WIP Qty / Value</span>
                          <div className="text-right">
                            <div className="text-base font-bold text-amber-700">{formatMoney(Number(row.wipQty ?? 0))} กก.</div>
                            <div className="text-sm font-medium text-slate-600">{formatMoney(Number(row.wipValue ?? 0))} ฿</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {!wipRows.length ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">ไม่มี WIP คงเหลือ</div> : null}
              </div>
            </div>
          ) : null}

          {/* ผลผลิตแยกตามสินค้า */}
          {reportTab === 'products' ? (
            <div className="space-y-2">
              <div className="flex flex-col gap-2 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <div>พบทั้งหมด <span className="font-semibold text-slate-900">{productSummary.length}</span> รายการ</div>
                {productSummaryResize.hasCustomWidths ? (
                  <Button className="hidden md:inline-flex" size="sm" type="button" variant="outline" onClick={productSummaryResize.resetColumnWidths}>
                    คืนค่าเดิมตาราง
                  </Button>
                ) : null}
              </div>

              {/* Desktop View */}
              <div className="hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm md:block">
                <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: productSummaryResize.tableMinWidth, tableLayout: 'fixed' }}>
                <colgroup>
                  {productSummaryTableColumns.map((col, index) => {
                    const columnDefinition = productSummaryColumns.find((column) => column.key === col.key)
                    if (index === productSummaryTableColumns.length - 1) {
                      return <col key={col.key} style={{ minWidth: columnDefinition?.minWidth ?? 80 }} />
                    }
                    return <col key={col.key} style={productSummaryResize.getColumnStyle(col.key)} />
                  })}
                </colgroup>
                <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
                  <tr>
                    {productSummaryTableColumns.map((column) => (
                      <ResizableTableHead
                        key={column.key}
                        activeSortKey={sortKey}
                        align={column.type === 'number' || column.type === 'money' || column.type === 'percent' ? 'right' : 'left'}
                        direction={sortDir}
                        label={column.label}
                        resizeProps={productSummaryResize.getResizeHandleProps(column.key, column.label)}
                        sortKey={column.key}
                        onSort={toggleSort}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedProductSummary.map((item) => (
                    <tr key={item.name} className="hover:bg-slate-50">
                      <td className="px-3 py-3 text-slate-700">{item.name}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{item.count}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-emerald-700">{formatMoney(item.qty)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatMoney(item.cost)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums text-slate-900">{formatMoney(item.unitCost)}</td>
                    </tr>
                  ))}
                  {!productSummary.length ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={5}>ไม่มีข้อมูล</td></tr> : null}
                </tbody>
              </table>
                </div>
            </div>

            {/* Mobile View */}
              <div className="space-y-3 md:hidden">
              {productSummary.map((item) => (
                <div key={item.name} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="border-b border-slate-100 pb-2 flex justify-between items-center">
                    <span className="font-bold text-slate-900 text-base">{item.name}</span>
                    <span className="text-sm font-semibold bg-slate-100 px-2.5 py-0.5 rounded text-slate-700 shrink-0">
                      {item.count} รอบ
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 text-sm">
                    <div className="flex justify-between items-center py-2">
                      <span className="text-slate-500 font-semibold">น้ำหนักรวม</span>
                      <span className="text-base font-bold text-emerald-700">{formatMoney(item.qty)} กก.</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-slate-500 font-semibold">ต้นทุนรวม</span>
                      <span className="text-sm font-bold text-slate-800">{formatMoney(item.cost)} ฿</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-slate-500 font-semibold">ต้นทุนผลผลิต ฿/กก.</span>
                      <span className="text-base font-bold text-slate-900">{formatMoney(item.unitCost)} ฿/กก.</span>
                    </div>
                  </div>
                </div>
              ))}
                {!productSummary.length ? <div className="rounded-md border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">ไม่มีข้อมูล</div> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {mode !== 'yield' && (mode !== 'report' || reportTab === 'orders') && (
        <div className="flex flex-col gap-2 px-1 py-1 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div>พบทั้งหมด <span className="font-semibold text-slate-900">{totalRows}</span> รายการ</div>
          <div className="flex flex-wrap items-center gap-2">
            {columnResize.hasCustomWidths ? (
              <Button className="hidden md:inline-flex" size="sm" type="button" variant="outline" onClick={columnResize.resetColumnWidths}>
                คืนค่าเดิมตาราง
              </Button>
            ) : null}
            <select
              aria-label="จำนวนรายการต่อหน้า"
              className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800"
              value={pageSize}
              onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1) }}
            >
              {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / หน้า</option>)}
            </select>
            <Button
              disabled={currentPage <= 1}
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              ก่อนหน้า
            </Button>
            <span className="px-1">หน้า {currentPage} / {totalPages}</span>
            <Button
              disabled={currentPage >= totalPages}
              size="sm"
              variant="outline"
              type="button"
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              ถัดไป
            </Button>
          </div>
        </div>
      )}

      {/* Desktop view for other modes */}
      <div className={mode === 'report' && reportTab !== 'orders' ? 'hidden' : 'hidden overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm md:block'}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: columnResize.tableMinWidth, tableLayout: 'fixed' }}>
            <colgroup>
              {config.columns.map((col, index) => {
                const columnDefinition = activeResizableColumns.find((column) => column.key === col.key)
                if (index === config.columns.length - 1) {
                  return <col key={col.key} style={{ minWidth: columnDefinition?.minWidth ?? 80 }} />
                }
                return <col key={col.key} style={columnResize.getColumnStyle(col.key)} />
              })}
            </colgroup>
            <thead className="bg-slate-100 text-xs font-semibold text-slate-600">
              <tr>
                {config.columns.map((column) => (
                  <ResizableTableHead
                    key={column.key}
                    activeSortKey={sortKey}
                    label={column.label}
                    align={column.type === 'number' || column.type === 'money' || column.type === 'percent' ? 'right' : 'left'}
                    direction={sortDir}
                    sortKey={column.key}
                    resizeProps={columnResize.getResizeHandleProps(column.key, column.label)}
                    onSort={toggleSort}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={config.columns.length}>กำลังโหลดข้อมูล</td></tr> : null}
              {!isLoading && pagedFilteredRows.map((row, index) => (
                <tr key={String(row.id ?? index)} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${mode === 'wip' ? wipAgeClass(Number(row.ageDays ?? 0)) : ''}`}>
                  {config.columns.map((column) => {
                    const isNumeric = column.type === 'number' || column.type === 'money' || column.type === 'percent'
                    return (
                      <td
                        key={column.key}
                        className={`whitespace-nowrap px-3 py-3 overflow-hidden truncate ${isNumeric ? 'text-right font-medium tabular-nums text-slate-900' : 'text-left text-slate-700'} ${cellTone(row[column.key], column, mode)}`}
                      >
                        {formatDisplayCell(row, column, mode)}
                      </td>
                    )
                  })}
                </tr>
              ))}
              {!isLoading && filteredRows.length === 0 ? <tr><td className="px-3 py-10 text-center text-slate-500" colSpan={config.columns.length}>ไม่มีข้อมูล</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dynamic Mobile Card List View for other modes */}
      <div className={mode === 'report' && reportTab !== 'orders' ? 'hidden' : 'space-y-3 md:hidden'}>
        {isLoading ? (
          <div className="py-6 text-center text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm">
            กำลังโหลดข้อมูล
          </div>
        ) : null}
        {!isLoading && pagedFilteredRows.map((row, index) => {
          const firstCol = config.columns[0]
          const secondCol = config.columns[1]
          const titleValue = String(row[firstCol?.key] ?? '')
          const subTitleValue = secondCol ? formatCell(row[secondCol.key], secondCol.type) : ''
          const restColumns = config.columns.slice(2)
          if (mode === 'report') {
            return (
              <div
                key={String(row.id ?? index)}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-mono text-base font-bold text-slate-900">{String(row.docNo ?? '')}</span>
                  <span className="shrink-0 text-sm font-medium text-slate-500">{formatDateDisplay(String(row.date ?? ''))}</span>
                </div>

                <div className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
                  <div>
                    <span className="font-semibold text-slate-500">ประเภทเครื่องจักร: </span>
                    <span className="text-slate-900">{String(row.productionType ?? '-')}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">สินค้าที่เบิกผลิต: </span>
                    <span className="text-slate-900">{String(row.inputProducts ?? '-')}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">เครื่องจักร: </span>
                    <span className="text-slate-900">{String(row.machineName ?? '-')}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-500">สถานะ: </span>
                    <span className="text-slate-900">{productionStatusLabel(String(row.status ?? ''))}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm">
                  <div>
                    <span className="block text-xs text-slate-500">Input / Output</span>
                    <span className="mt-0.5 block font-bold tabular-nums text-slate-900">
                      {formatMoney(Number(row.inputQty ?? 0))} / {formatMoney(Number(row.outputQty ?? 0))} กก.
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="block text-xs text-slate-500">WIP / Loss</span>
                    <span className="mt-0.5 block font-bold tabular-nums text-slate-900">
                      {formatMoney(Number(row.wipQty ?? 0))} / {formatMoney(Number(row.lossQty ?? 0))} กก.
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500">Yield</span>
                    <span className="mt-0.5 block font-bold tabular-nums text-emerald-700">{formatCell(row.yieldPct, 'percent')}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-xs text-slate-500">Loss Value</span>
                    <span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatCell(row.lossValue, 'money')}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500">RM บาท/กก.</span>
                    <span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatCell(row.rmCostPerKg, 'money')}</span>
                  </div>
                  <div className="text-right">
                    <span className="block text-xs text-slate-500">ต้นทุนผลิต บาท/กก.</span>
                    <span className="mt-0.5 block font-bold tabular-nums text-slate-900">{formatCell(row.productionCostPerKg, 'money')}</span>
                  </div>
                </div>
              </div>
            )
          }
          return (
            <div
              key={String(row.id ?? index)}
              className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 ${mode === 'wip' ? wipAgeClass(Number(row.ageDays ?? 0)) : ''}`}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-mono text-base font-bold text-slate-900">{titleValue}</span>
                {subTitleValue && <span className="text-sm text-slate-600 font-medium">{subTitleValue}</span>}
              </div>
              <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                {restColumns.map((col) => {
                   const val = row[col.key]
                   const toneClass = cellTone(val, col, mode)
                   const isLongText = col.key === 'inputProducts'
                   return (
                     <div key={col.key} className={`min-w-0 ${isLongText ? 'col-span-2' : 'col-span-1'}`}>
                       <span className="text-slate-500 block text-sm font-semibold">{col.label}</span>
                       <span className={`text-sm font-bold text-slate-900 block mt-0.5 ${isLongText ? 'whitespace-pre-wrap break-all' : 'truncate'} ${toneClass}`}>
                          {formatDisplayCell(row, col, mode)}
                       </span>
                     </div>
                   )
                })}
              </div>
            </div>
          )
        })}
        {!isLoading && filteredRows.length === 0 ? (
          <div className="py-6 text-center text-slate-400 bg-white rounded-xl border border-slate-200 shadow-sm">
            ไม่มีข้อมูล
          </div>
        ) : null}
      </div>


    </section>
  )
}

function Metric({
  label,
  type,
  value,
  metricKey,
  className,
}: {
  label: string
  type?: 'money' | 'number' | 'percent'
  value: number
  metricKey?: string
  className?: string
}) {
  let emoji = '📄'
  let tone: 'amber' | 'blue' | 'emerald' | 'red' | 'slate' | 'purple' = 'slate'
  let iconBg = 'bg-slate-100 text-slate-700'

  const key = metricKey?.toLowerCase() || ''
  if (key.includes('count') || key.includes('batches')) {
    emoji = '📋'
  } else if (key.includes('input')) {
    emoji = '📦'
    tone = 'blue'
    iconBg = 'bg-blue-100 text-blue-700'
  } else if (key.includes('output')) {
    emoji = '✅'
    tone = 'emerald'
    iconBg = 'bg-emerald-100 text-emerald-700'
  } else if (key.includes('wip')) {
    emoji = '⚙️'
    tone = 'amber'
    iconBg = 'bg-amber-100 text-amber-700'
  } else if (key.includes('loss')) {
    emoji = '📉'
    tone = 'red'
    iconBg = 'bg-red-100 text-red-700'
  } else if (key.includes('yieldpct')) {
    emoji = '📈'
    tone = 'emerald'
    iconBg = 'bg-emerald-100 text-emerald-700'
  } else if (key.includes('cost') || key.includes('value') || key.includes('pnl')) {
    emoji = '💰'
    tone = 'slate'
    iconBg = 'bg-slate-100 text-slate-700'
  } else if (key.includes('purple')) {
    tone = 'purple'
    iconBg = 'bg-purple-100 text-purple-700'
  }

  const color = tone === 'blue'
    ? 'text-blue-600'
    : tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : tone === 'red'
          ? 'text-red-600'
          : tone === 'purple'
            ? 'text-purple-700'
            : 'text-slate-900'
  const unit = metricUnit(metricKey, type, label)
  const renderedValue = `${formatCell(value, type)}${unit ? ` ${unit}` : ''}`

  return (
    <div className={`bg-white p-3 sm:p-4 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-3 ${className || ''}`}>
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${iconBg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-500 truncate">{label}</div>
        <div className={`text-base font-bold ${color} mt-0.5 tabular-nums`}>{renderedValue}</div>
      </div>
    </div>
  )
}

function metricUnit(metricKey?: string, type?: Column['type'], label = '') {
  const key = metricKey?.toLowerCase() ?? ''
  if (type === 'percent') return ''
  if (type === 'money') {
    if (key.includes('perkg')) return 'บาท/กก.'
    if (key.includes('cost') || key.includes('value') || key.includes('pnl')) return 'บาท'
    return ''
  }
  if (key === 'count' || key.includes('count') || key.includes('batches')) {
    if (label.includes('เครื่อง')) return 'เครื่อง'
    if (label.includes('รอบ')) return 'รอบ'
    return 'ใบ'
  }
  if (type === 'number' && (key.includes('qty') || key.includes('input') || key.includes('output') || key.includes('loss') || key.includes('wip'))) return 'กก.'
  return ''
}

function ImpactCard({ label, tone, value }: { label: string; tone: 'gain' | 'loss' | 'netBad' | 'netGood'; value: number }) {
  let emoji = '💰'
  let toneColor: 'emerald' | 'red' | 'blue' | 'amber' = 'emerald'
  let iconBg = 'bg-emerald-100 text-emerald-700'

  if (tone === 'gain' || tone === 'netGood') {
    emoji = tone === 'gain' ? '📈' : '💰'
    toneColor = 'emerald'
    iconBg = 'bg-emerald-100 text-emerald-700'
  } else if (tone === 'loss' || tone === 'netBad') {
    emoji = tone === 'loss' ? '📉' : '💸'
    toneColor = 'red'
    iconBg = 'bg-red-100 text-red-700'
  }

  const prefix = tone === 'gain' || tone === 'netGood' ? '+' : tone === 'loss' ? '-' : ''
  const color = toneColor === 'emerald' ? 'text-emerald-700' : 'text-red-600'

  return (
    <div className="bg-white p-3 sm:p-4 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-3">
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${iconBg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-500 truncate">{label}</div>
        <div className={`text-base font-bold ${color} mt-0.5 tabular-nums`}>
          {prefix}{formatMoney(Math.abs(value))} ฿
        </div>
      </div>
    </div>
  )
}

function DashboardKpi({
  label,
  note,
  tone,
  value,
  emoji,
}: {
  label: string
  note: string
  tone: 'amber' | 'blue' | 'emerald' | 'purple'
  value: string
  emoji: string
}) {
  const iconBg = tone === 'blue'
    ? 'bg-blue-100 text-blue-700'
    : tone === 'emerald'
      ? 'bg-emerald-100 text-emerald-700'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-purple-100 text-purple-700'

  const color = tone === 'blue'
    ? 'text-blue-600'
    : tone === 'emerald'
      ? 'text-emerald-700'
      : tone === 'amber'
        ? 'text-amber-700'
        : 'text-purple-700'

  return (
    <div className="bg-white p-3 sm:p-4 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-3">
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${iconBg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-500 truncate">{label}</div>
        <div className={`text-base font-bold ${color} mt-0.5 tabular-nums`}>{value}</div>
        <div className="text-xs text-slate-500 font-medium mt-0.5 whitespace-pre-wrap break-all sm:truncate">{note}</div>
      </div>
    </div>
  )
}

function ChartPanel({ rows, title, type }: { rows: Array<{ input: number; label: string; loss: number; output: number }>; title: string; type: 'bar' | 'line' }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.input, row.output, row.loss]))
  return (
    <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-bold text-slate-700 text-sm">{title}</h3>
      <div className="flex h-[220px] sm:h-[260px] lg:h-[300px] items-end gap-2 overflow-x-auto border-b border-slate-100 pb-8">
        {rows.map((row) => (
          <div key={row.label} className="relative flex min-w-10 flex-1 items-end justify-center gap-1 h-full">
            <div className="w-2 rounded-t bg-blue-500" style={{ height: `${Math.max(1, (row.input / max) * 85)}%` }} title={`Input ${formatMoney(row.input)}`} />
            <div className="w-2 rounded-t bg-emerald-500" style={{ height: `${Math.max(1, (row.output / max) * 85)}%` }} title={`Output ${formatMoney(row.output)}`} />
            {type === 'line' ? <div className="w-2 rounded-t bg-red-500" style={{ height: `${Math.max(1, (row.loss / max) * 85)}%` }} title={`Loss ${formatMoney(row.loss)}`} /> : null}
            <span className="absolute -bottom-6 text-xs text-slate-400">{row.label}</span>
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

function CostCard({
  label,
  tone,
  value,
  emoji,
  iconBg = 'bg-slate-100',
}: {
  label: string
  tone?: 'red'
  value: number
  emoji: string
  iconBg?: string
}) {
  const color = tone === 'red' ? 'text-red-600' : 'text-slate-900'
  return (
    <div className="bg-white p-3 sm:p-4 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-3">
      <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full ${iconBg} flex items-center justify-center text-lg sm:text-xl shrink-0`}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-500 truncate">{label}</div>
        <div className={`text-base font-bold ${color} mt-0.5 tabular-nums`}>{formatMoney(value)}</div>
      </div>
    </div>
  )
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

function productionCostBreakdownValue(row: Row, key: string) {
  const costs = costBreakdown(row)
  if (key === 'docNo') return String(row.docNo ?? '')
  if (key === 'date') return String(row.date ?? '')
  if (key === 'rm') return Number(row.inputCost ?? 0)
  if (key === 'labor') return costs.labor
  if (key === 'electricity') return costs.electricity
  if (key === 'machine') return costs.machine
  if (key === 'fuel') return costs.fuel
  if (key === 'maintenance') return costs.maintenance
  if (key === 'otherProc') return costs.otherProc
  if (key === 'totalCost') return Number(row.totalCost ?? 0)
  if (key === 'outputQty') return Number(row.outputQty ?? 0)
  if (key === 'costPerKg') return Number(row.costPerKg ?? 0)
  if (key === 'method') return String(row.costAllocationMethod ?? row.productionType ?? '-')
  return row[key]
}

function formatProductionCostBreakdownCell(row: Row, column: Column) {
  return formatCell(productionCostBreakdownValue(row, column.key) as Row[string], column.type)
}

function productionCostBreakdownCellClass(column: Column) {
  const align = column.type === 'money' || column.type === 'number' ? 'text-right font-mono whitespace-nowrap tabular-nums' : 'text-left'
  if (column.key === 'totalCost') return `${align} font-bold text-blue-700`
  if (column.key === 'outputQty') return `${align} font-semibold text-emerald-700`
  if (column.key === 'docNo') return `${align} font-mono text-slate-600`
  return `${align} text-slate-700`
}

function dashboardTopProductValue(row: DashboardTopProduct, key: string) {
  if (key === 'code') return row.code ?? ''
  if (key === 'name') return row.name
  if (key === 'batches') return row.batches
  if (key === 'qty') return row.qty
  if (key === 'cost') return row.cost
  if (key === 'avgCost') return row.avgCost ?? (row.qty > 0 ? row.cost / row.qty : 0)
  return ''
}

function dashboardMachineValue(row: DashboardMachineUtil, key: string) {
  if (key === 'name') return row.name
  if (key === 'batches') return row.batches
  if (key === 'qty') return row.qty
  return ''
}

function formatDisplayCell(row: Row, column: Column, mode: string) {
  if (column.key === 'status' && ['dashboard', 'report', 'wip'].includes(mode)) {
    return productionStatusLabel(String(row[column.key] ?? ''))
  }
  return formatCell(row[column.key], column.type)
}

function formatCell(value: Row[string], type?: Column['type']) {
  if (value === null || value === undefined || typeof value === 'object') return '-'
  if (type === 'date') return formatDateDisplay(String(value))
  if (type === 'money') return formatMoney(Number(value))
  if (type === 'number') return formatMoney(Number(value))
  if (type === 'percent') return `${Number(value).toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%`
  return String(value)
}

function compareTableValues(leftValue: unknown, rightValue: unknown, type: Column['type'] | undefined, direction: SortDirection) {
  const multiplier = direction === 'asc' ? 1 : -1
  if (type === 'number' || type === 'money' || type === 'percent') {
    return (Number(leftValue ?? 0) - Number(rightValue ?? 0)) * multiplier
  }
  if (type === 'date') {
    const leftTime = new Date(String(leftValue ?? '')).getTime()
    const rightTime = new Date(String(rightValue ?? '')).getTime()
    return ((Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime)) * multiplier
  }
  return String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'th') * multiplier
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
  if (ageDays > 30) return 'bg-red-50/15 dark:bg-red-50/10'
  if (ageDays > 14) return 'bg-amber-50/15 dark:bg-amber-50/10'
  return ''
}
