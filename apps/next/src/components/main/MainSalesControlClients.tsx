'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

type AnyRow = Record<string, number | string | boolean | null | undefined>
type SortDirection = 'asc' | 'desc'
type TableColumn<TKey extends string> = ResizableColumnDefinition<TKey> & { align?: 'center' | 'left' | 'right'; label: string }
type SalesPlanColumnKey = 'action' | 'channel' | 'containers' | 'customerName' | 'fx' | 'kgPerContainer' | 'lme' | 'productName' | 'sellPctLme' | 'sellPrice' | 'status' | 'totalKg'
type SalesPlanAnalysisColumnKey = 'bestPlanPct' | 'bestPlanPrice' | 'lockedKg' | 'metalGroup' | 'name' | 'projectedMarginPct' | 'projectedProfit' | 'recommendation' | 'remainingKg' | 'stock' | 'wac'
type SalesPlanRemainingColumnKey = 'code' | 'lockedContainers' | 'lockedKg' | 'metalGroup' | 'name' | 'remainingContainers' | 'remainingKg' | 'stock' | 'value' | 'wac'
type CommissionCategoryColumnKey = 'amount' | 'category' | 'qty'
type CommissionSupplierColumnKey = 'amount' | 'bills' | 'pct' | 'qty' | 'supplier'
type CommissionBillColumnKey = 'amount' | 'commissionStatus' | 'date' | 'docNo' | 'price' | 'productName' | 'profitDiff' | 'qty' | 'salesPrice' | 'supplierName'
type CommissionSummaryColumnKey = 'amount' | 'category' | 'qty' | 'salesName'
type LmeConfig = { fxRate: number; kgPerContainer: number; lmeAluminumUSD: number; lmeBrassUSD: number; lmeCopperUSD: number; updatedAt: string; updatedBy: string }
type SalesPlanPayload = {
  filters: { channels: { id: string; name: string }[]; metalGroups: string[]; month: string }
  lmeConfig: LmeConfig
  planRows: AnyRow[]
  productAnalysis: AnyRow[]
  sourceState: { limitations: string[] }
  summary: Record<string, number>
}

type CommissionSalespersonRow = {
  id: string
  name: string
  code: string
  phone: string
  commissionEligible: boolean
  billCount: number
  supplierCount: number
  qty: number
  purchaseAmt: number
  commissionableQty: number
  commissionableAmount: number
  nonCommissionableQty: number
  nonCommissionableAmount: number
  commission: number
  remainingToTarget: number
  progressPct: number
  annualQty: number
  annualAmount: number
}

type CommissionBillRow = {
  id: string
  billId: string
  docNo: string
  date: string
  supplierName: string
  productName: string
  productCategory: string
  qty: number
  price: number
  salesPrice: number
  amount: number
  salesId: string
  status: string
  isCommissionable: boolean
}

type CommissionPayload = {
  billRows: CommissionBillRow[]
  filters: { dateFrom: string; dateTo: string; periods: string[]; branches: { id: string; name: string }[] }
  salesRows: CommissionSalespersonRow[]
  sourceState: { limitations: string[] }
  suppliers: AnyRow[]
  totals: Record<string, number>
}

const salesPlanColumns: Array<TableColumn<SalesPlanColumnKey>> = [
  { key: 'productName', label: 'สินค้า', defaultWidth: 220, minWidth: 160 },
  { key: 'channel', label: 'ช่องทาง', defaultWidth: 125, minWidth: 105, align: 'center' },
  { key: 'customerName', label: 'ลูกค้า', defaultWidth: 190, minWidth: 145 },
  { key: 'containers', label: 'ตู้', defaultWidth: 85, minWidth: 75, align: 'right' },
  { key: 'kgPerContainer', label: 'กก./ตู้', defaultWidth: 105, minWidth: 90, align: 'right' },
  { key: 'totalKg', label: 'รวม กก.', defaultWidth: 120, minWidth: 105, align: 'right' },
  { key: 'sellPctLme', label: '% LME', defaultWidth: 95, minWidth: 80, align: 'right' },
  { key: 'lme', label: 'LME (USD/MT)', defaultWidth: 120, minWidth: 105, align: 'right' },
  { key: 'fx', label: 'FX', defaultWidth: 90, minWidth: 75, align: 'right' },
  { key: 'sellPrice', label: 'ราคา THB/kg', defaultWidth: 135, minWidth: 115, align: 'right' },
  { key: 'status', label: 'สถานะ', defaultWidth: 150, minWidth: 120, align: 'center' },
  { key: 'action', label: 'จัดการ', defaultWidth: 80, minWidth: 70, align: 'right' },
]
const salesPlanAnalysisColumns: Array<TableColumn<SalesPlanAnalysisColumnKey>> = [
  { key: 'name', label: 'สินค้า', defaultWidth: 230, minWidth: 165 },
  { key: 'metalGroup', label: 'หมวด', defaultWidth: 130, minWidth: 105 },
  { key: 'stock', label: 'Stock รวม (กก.)', defaultWidth: 140, minWidth: 120, align: 'right' },
  { key: 'lockedKg', label: 'ล็อกแล้ว (กก.)', defaultWidth: 140, minWidth: 120, align: 'right' },
  { key: 'remainingKg', label: 'ว่างให้ขาย (กก.)', defaultWidth: 150, minWidth: 125, align: 'right' },
  { key: 'wac', label: 'WAC ต้นทุน', defaultWidth: 130, minWidth: 110, align: 'right' },
  { key: 'bestPlanPrice', label: 'ราคาเสนอดีสุด', defaultWidth: 140, minWidth: 120, align: 'right' },
  { key: 'bestPlanPct', label: '% LME', defaultWidth: 100, minWidth: 85, align: 'right' },
  { key: 'projectedProfit', label: 'กำไรคาดการณ์', defaultWidth: 150, minWidth: 125, align: 'right' },
  { key: 'projectedMarginPct', label: 'Margin %', defaultWidth: 120, minWidth: 100, align: 'right' },
  { key: 'recommendation', label: 'คำแนะนำ', defaultWidth: 180, minWidth: 140, align: 'center' },
]
const salesPlanRemainingColumns: Array<TableColumn<SalesPlanRemainingColumnKey>> = [
  { key: 'code', label: 'รหัส', defaultWidth: 110, minWidth: 90 },
  { key: 'name', label: 'สินค้า', defaultWidth: 220, minWidth: 160 },
  { key: 'metalGroup', label: 'หมวด', defaultWidth: 130, minWidth: 105 },
  { key: 'stock', label: 'Stock ทั้งหมด (กก.)', defaultWidth: 150, minWidth: 125, align: 'right' },
  { key: 'lockedKg', label: 'ล็อกแล้ว (กก.)', defaultWidth: 140, minWidth: 120, align: 'right' },
  { key: 'lockedContainers', label: 'ล็อกแล้ว (ตู้)', defaultWidth: 135, minWidth: 115, align: 'right' },
  { key: 'remainingKg', label: 'รอล็อก (กก.)', defaultWidth: 140, minWidth: 120, align: 'right' },
  { key: 'remainingContainers', label: 'รอล็อก (ตู้)', defaultWidth: 135, minWidth: 115, align: 'right' },
  { key: 'wac', label: 'WAC', defaultWidth: 120, minWidth: 100, align: 'right' },
  { key: 'value', label: 'มูลค่า WAC', defaultWidth: 140, minWidth: 120, align: 'right' },
]
const commissionCategoryColumns: Array<TableColumn<CommissionCategoryColumnKey>> = [
  { key: 'category', label: 'ประเภท / หมวดสินค้า', defaultWidth: 240, minWidth: 170 },
  { key: 'qty', label: 'จำนวน (กก.)', defaultWidth: 140, minWidth: 115, align: 'right' },
  { key: 'amount', label: 'ยอดซื้อ (บาท)', defaultWidth: 150, minWidth: 125, align: 'right' },
]
const commissionSupplierColumns: Array<TableColumn<CommissionSupplierColumnKey>> = [
  { key: 'supplier', label: 'Supplier', defaultWidth: 260, minWidth: 180 },
  { key: 'bills', label: 'บิล', defaultWidth: 95, minWidth: 80, align: 'right' },
  { key: 'qty', label: 'น้ำหนัก (กก.)', defaultWidth: 140, minWidth: 115, align: 'right' },
  { key: 'amount', label: 'ยอดรับซื้อ (บาท)', defaultWidth: 160, minWidth: 130, align: 'right' },
  { key: 'pct', label: '% ของ Total', defaultWidth: 130, minWidth: 110, align: 'right' },
]
const commissionBillColumns: Array<TableColumn<CommissionBillColumnKey>> = [
  { key: 'date', label: 'วันที่', defaultWidth: 115, minWidth: 100 },
  { key: 'docNo', label: 'เลขที่บิล', defaultWidth: 140, minWidth: 115 },
  { key: 'supplierName', label: 'Supplier', defaultWidth: 200, minWidth: 150 },
  { key: 'productName', label: 'สินค้า', defaultWidth: 220, minWidth: 160 },
  { key: 'qty', label: 'น้ำหนัก (กก.)', defaultWidth: 130, minWidth: 110, align: 'right' },
  { key: 'price', label: 'ราคาซื้อ', defaultWidth: 120, minWidth: 100, align: 'right' },
  { key: 'salesPrice', label: 'ราคาหน้าใบ', defaultWidth: 125, minWidth: 105, align: 'right' },
  { key: 'profitDiff', label: 'ส่วนต่างกำไร', defaultWidth: 135, minWidth: 115, align: 'right' },
  { key: 'amount', label: 'ยอดรวม (บาท)', defaultWidth: 150, minWidth: 125, align: 'right' },
  { key: 'commissionStatus', label: 'สถานะค่าคอม', defaultWidth: 150, minWidth: 125, align: 'center' },
]
const commissionSummaryColumns: Array<TableColumn<CommissionSummaryColumnKey>> = [
  { key: 'salesName', label: 'Sales', defaultWidth: 220, minWidth: 160 },
  { key: 'category', label: 'ประเภท / หมวดสินค้า', defaultWidth: 260, minWidth: 180 },
  { key: 'qty', label: 'จำนวน KG', defaultWidth: 140, minWidth: 115, align: 'right' },
  { key: 'amount', label: 'มูลค่ารวม (บาท)', defaultWidth: 160, minWidth: 130, align: 'right' },
]

function money(value: unknown) {
  return formatMoney(typeof value === 'number' ? value : Number(value ?? 0))
}

function text(value: unknown) {
  return String(value ?? '')
}

function num(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

function getAnySortValue(row: AnyRow, key: string): string | number {
  if (key === 'action') return ''
  if (key === 'lockedContainers') return 0
  const value = row[key]
  return typeof value === 'number' || typeof value === 'string' ? value : ''
}

function getCommissionBillSortValue(row: CommissionBillRow, key: CommissionBillColumnKey, commissionEligible: boolean): string | number {
  if (key === 'commissionStatus') return row.isCommissionable ? 1 : 0
  if (key === 'profitDiff') return commissionEligible ? num(row.salesPrice) - num(row.price) : 0
  return row[key] ?? ''
}

function sortedByKey<TRow, TKey extends string>(
  rows: TRow[],
  key: TKey | null,
  direction: SortDirection,
  getValue: (row: TRow, key: TKey) => string | number,
) {
  if (!key) return rows
  return [...rows].sort((left, right) => {
    const result = compareSortValues(getValue(left, key), getValue(right, key))
    return direction === 'asc' ? result : -result
  })
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
  const [planSortKey, setPlanSortKey] = useState<SalesPlanColumnKey | null>(null)
  const [planSortDirection, setPlanSortDirection] = useState<SortDirection>('asc')
  const [analysisSortKey, setAnalysisSortKey] = useState<SalesPlanAnalysisColumnKey | null>(null)
  const [analysisSortDirection, setAnalysisSortDirection] = useState<SortDirection>('asc')
  const [remainingSortKey, setRemainingSortKey] = useState<SalesPlanRemainingColumnKey | null>(null)
  const [remainingSortDirection, setRemainingSortDirection] = useState<SortDirection>('asc')
  const planResize = useResizableColumns('main.sales-plan.plan.v1', salesPlanColumns)
  const analysisResize = useResizableColumns('main.sales-plan.analysis.v1', salesPlanAnalysisColumns)
  const remainingResize = useResizableColumns('main.sales-plan.remaining.v1', salesPlanRemainingColumns)

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
  const sortedPlanRows = useMemo(() => {
    const rows = data?.planRows ?? []
    if (!planSortKey) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(getAnySortValue(left, planSortKey), getAnySortValue(right, planSortKey))
      return planSortDirection === 'asc' ? result : -result
    })
  }, [data?.planRows, planSortDirection, planSortKey])
  const sortedAnalysisRows = useMemo(() => {
    if (!analysisSortKey) return analysisRows

    return [...analysisRows].sort((left, right) => {
      const result = compareSortValues(getAnySortValue(left, analysisSortKey), getAnySortValue(right, analysisSortKey))
      return analysisSortDirection === 'asc' ? result : -result
    })
  }, [analysisRows, analysisSortDirection, analysisSortKey])
  const sortedRemainingRows = useMemo(() => {
    if (!remainingSortKey) return analysisRows

    return [...analysisRows].sort((left, right) => {
      const result = compareSortValues(getAnySortValue(left, remainingSortKey), getAnySortValue(right, remainingSortKey))
      return remainingSortDirection === 'asc' ? result : -result
    })
  }, [analysisRows, remainingSortDirection, remainingSortKey])
  
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

  function changePlanSort(key: SalesPlanColumnKey) {
    if (key === 'action') return
    if (planSortKey === key) {
      setPlanSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setPlanSortKey(key)
    setPlanSortDirection('asc')
  }

  function changeAnalysisSort(key: SalesPlanAnalysisColumnKey) {
    if (analysisSortKey === key) {
      setAnalysisSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setAnalysisSortKey(key)
    setAnalysisSortDirection('asc')
  }

  function changeRemainingSort(key: SalesPlanRemainingColumnKey) {
    if (remainingSortKey === key) {
      setRemainingSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setRemainingSortKey(key)
    setRemainingSortDirection('asc')
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
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 text-xs font-semibold text-slate-600">
          📝 ตารางวางแผน — ปลดล็อก = อยู่ในขั้นเสนอ / ล็อก = ราคายืนยันแล้วและกันยอดตามแผนขาย
        </div>

        {/* Desktop view */}
        {planResize.hasCustomWidths ? (
          <div className="hidden justify-end px-4 pt-3 lg:flex">
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={planResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          </div>
        ) : null}
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: planResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {salesPlanColumns.map((column) => (
                <col key={column.key} style={planResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                {salesPlanColumns.map((column) => (
                  <ResizableTableHead
                    key={column.key}
                    activeSortKey={planSortKey ?? undefined}
                    align={column.align}
                    direction={planSortDirection}
                    label={column.label}
                    sortKey={column.key === 'action' ? undefined : column.key}
                    onSort={changePlanSort}
                    resizeProps={planResize.getResizeHandleProps(column.key, column.label)}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedPlanRows.map((row) => (
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
              {!sortedPlanRows.length ? <tr><td className="py-8 text-center text-slate-400 font-semibold" colSpan={salesPlanColumns.length}>ยังไม่มีรายการในเดือนนี้ - กด + เพิ่มรายการ</td></tr> : null}
            </tbody>
          </table>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden p-4 space-y-3 bg-slate-50/20">
          {sortedPlanRows.map((row) => (
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
          {!sortedPlanRows.length ? <div className="text-center text-slate-400 py-4 font-semibold text-xs">ยังไม่มีรายการในเดือนนี้ - กด + เพิ่มรายการ</div> : null}
        </div>
      </div>

      {/* 2. Analysis Section */}
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">📊 วิเคราะห์แผนขาย vs สต๊อกว่างขาย — ผู้บริหารตัดสินใจ</h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">เปรียบเทียบราคาที่เสนอในแผนขาย vs WAC ของสต๊อกที่ยังว่างให้ขาย</p>
          </div>
        </div>

        {/* Desktop View Table */}
        {analysisResize.hasCustomWidths ? (
          <div className="hidden justify-end px-4 pt-3 lg:flex">
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={analysisResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          </div>
        ) : null}
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: analysisResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {salesPlanAnalysisColumns.map((column) => (
                <col key={column.key} style={analysisResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                {salesPlanAnalysisColumns.map((column) => (
                  <ResizableTableHead
                    key={column.key}
                    activeSortKey={analysisSortKey ?? undefined}
                    align={column.align}
                    direction={analysisSortDirection}
                    label={column.label}
                    sortKey={column.key}
                    onSort={changeAnalysisSort}
                    resizeProps={analysisResize.getResizeHandleProps(column.key, column.label)}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedAnalysisRows.map((row) => (
                <tr className="hover:bg-slate-50/50 transition-colors" key={text(row.code)}>
                  <td className="p-2.5 min-w-0 overflow-hidden"><div className="font-semibold text-slate-800 truncate" title={text(row.name)}>{text(row.name)}</div><div className="font-mono text-xs text-slate-400 font-semibold truncate" title={text(row.code)}>{text(row.code)}</div></td>
                  <td className="p-2.5 text-xs text-slate-500 font-medium min-w-0 overflow-hidden"><div className="truncate" title={text(row.metalGroup)}>{text(row.metalGroup)}</div></td>
                  <td className="p-2.5 text-right text-slate-700 font-medium whitespace-nowrap tabular-nums pl-4">{money(row.stock)}</td>
                  <td className="p-2.5 text-right font-semibold text-emerald-600 whitespace-nowrap tabular-nums pl-4">{money(row.lockedKg)}</td>
                  <td className={`bg-yellow-50/20 p-2.5 text-right font-bold whitespace-nowrap tabular-nums pl-4 ${num(row.remainingKg) > 0 ? 'text-yellow-600' : 'text-slate-400'}`}>{money(row.remainingKg)}</td>
                  <td className="p-2.5 text-right text-slate-400 font-medium whitespace-nowrap tabular-nums pl-4">{money(row.wac)}</td>
                  <td className="bg-amber-50/20 p-2.5 text-right font-bold text-amber-700 whitespace-nowrap tabular-nums pl-4">{num(row.bestPlanPrice) > 0 ? money(row.bestPlanPrice) : '-'}</td>
                  <td className="p-2.5 text-right text-xs font-semibold text-slate-500 whitespace-nowrap tabular-nums pl-4">{num(row.bestPlanPct) > 0 ? `${money(row.bestPlanPct)}%` : '-'}</td>
                  <td className={`bg-emerald-50/20 p-2.5 text-right font-bold whitespace-nowrap tabular-nums pl-4 ${num(row.projectedProfit) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{num(row.bestPlanPrice) > 0 ? money(row.projectedProfit) : '-'}</td>
                  <td className={`bg-emerald-50/20 p-2.5 text-right text-xs font-bold whitespace-nowrap tabular-nums pl-4 ${num(row.projectedMarginPct) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{num(row.bestPlanPrice) > 0 ? `${money(row.projectedMarginPct)}%` : '-'}</td>
                  <td className="p-2.5 text-center min-w-0 overflow-hidden"><div className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 truncate" title={text(row.recommendation)}>{text(row.recommendation)}</div></td>
                </tr>
              ))}
              {!sortedAnalysisRows.length ? <tr><td className="py-8 text-center text-slate-400 font-semibold" colSpan={salesPlanAnalysisColumns.length}>ไม่มีสต๊อกทองแดง/ทองเหลืองให้วิเคราะห์</td></tr> : null}
            </tbody>
            {analysisRows.length ? <tfoot className="border-t border-slate-200 bg-slate-50/50 font-bold text-slate-700"><tr><td className="p-3 text-xs" colSpan={2}>รวม</td><td className="p-3 text-right text-slate-700 text-xs">{money(stockTotal)}</td><td className="p-3 text-right text-emerald-600 text-xs">{money(lockedTotal)}</td><td className="bg-yellow-50/20 p-3 text-right text-yellow-600 text-xs">{money(remainingKgTotal)}</td><td colSpan={3} /><td className={`p-3 text-right text-xs ${projectedProfitTotal >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{money(projectedProfitTotal)}</td><td colSpan={2} /></tr></tfoot> : null}
          </table>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden p-4 space-y-3 bg-slate-50/20 border-t border-slate-100">
          {sortedAnalysisRows.map((row) => (
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
          {!sortedAnalysisRows.length ? <div className="text-center text-slate-400 py-4 font-semibold text-xs">ไม่มีสต๊อกทองแดง/ทองเหลืองให้วิเคราะห์</div> : null}
        </div>
      </div>

      {/* 3. Containers Remaining Section */}
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 p-4">
          <h3 className="font-bold text-slate-800 text-sm">📦 สต๊อกว่างขาย คงเหลือหลังหักล็อกราคา — เดือน {(month || data?.filters.month) ?? ''}</h3>
          <div className="text-xs flex items-center gap-1.5">
            <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-slate-700 font-bold">รวม {money(remainingKgTotal)} กก.</span>
            <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-emerald-700 font-bold border border-emerald-100">มูลค่า WAC {money(remainingValueTotal)}</span>
          </div>
        </div>

        {/* Desktop View Table */}
        {remainingResize.hasCustomWidths ? (
          <div className="hidden justify-end px-4 pt-3 lg:flex">
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={remainingResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          </div>
        ) : null}
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: remainingResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {salesPlanRemainingColumns.map((column) => (
                <col key={column.key} style={remainingResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                {salesPlanRemainingColumns.map((column) => (
                  <ResizableTableHead
                    key={column.key}
                    activeSortKey={remainingSortKey ?? undefined}
                    align={column.align}
                    direction={remainingSortDirection}
                    label={column.label}
                    sortKey={column.key}
                    onSort={changeRemainingSort}
                    resizeProps={remainingResize.getResizeHandleProps(column.key, column.label)}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRemainingRows.map((row) => (
                <tr className={`hover:bg-slate-50/50 transition-colors ${num(row.remainingKg) > 0 ? '' : 'opacity-60'}`} key={`${text(row.code)}-remain`}>
                  <td className="p-2.5 font-mono text-xs text-slate-400 font-semibold min-w-0 overflow-hidden"><div className="truncate" title={text(row.code)}>{text(row.code)}</div></td>
                  <td className="p-2.5 text-slate-800 font-medium min-w-0 overflow-hidden"><div className="truncate" title={text(row.name)}>{text(row.name)}</div></td>
                  <td className="p-2.5 text-xs text-slate-500 font-medium min-w-0 overflow-hidden"><div className="truncate" title={text(row.metalGroup)}>{text(row.metalGroup)}</div></td>
                  <td className="p-2.5 text-right text-slate-700 font-medium whitespace-nowrap tabular-nums pl-4">{money(row.stock)}</td>
                  <td className="p-2.5 text-right font-semibold text-emerald-600 whitespace-nowrap tabular-nums pl-4">{money(row.lockedKg)}</td>
                  <td className="p-2.5 text-right text-emerald-600 font-semibold whitespace-nowrap tabular-nums pl-4">{money(0)}</td>
                  <td className={`bg-yellow-50/20 p-2.5 text-right font-bold whitespace-nowrap tabular-nums pl-4 ${num(row.remainingKg) > 0 ? 'text-yellow-600' : 'text-slate-400'}`}>{money(row.remainingKg)}</td>
                  <td className={`bg-yellow-50/20 p-2.5 text-right font-bold whitespace-nowrap tabular-nums pl-4 ${num(row.remainingContainers) > 0 ? 'text-yellow-600' : 'text-slate-400'}`}>{money(row.remainingContainers)}</td>
                  <td className="p-2.5 text-right text-slate-400 font-medium whitespace-nowrap tabular-nums pl-4">{money(row.wac)}</td>
                  <td className="p-2.5 text-right font-bold text-slate-700 whitespace-nowrap tabular-nums pl-4">{money(row.value)}</td>
                </tr>
              ))}
              {!sortedRemainingRows.length ? <tr><td className="py-8 text-center text-slate-400 font-semibold" colSpan={salesPlanRemainingColumns.length}>ไม่มีสต๊อกทองแดง/ทองเหลือง</td></tr> : null}
            </tbody>
            {analysisRows.length ? <tfoot className="border-t border-slate-100 bg-slate-50/50 font-bold text-slate-700"><tr><td className="p-3 text-xs" colSpan={3}>รวม</td><td className="p-3 text-right text-slate-700 text-xs">{money(stockTotal)}</td><td className="p-3 text-right text-emerald-600 text-xs">{money(lockedTotal)}</td><td className="p-3 text-right text-emerald-600 text-xs">{money(0)}</td><td className="bg-yellow-50/20 p-3 text-right text-yellow-600 text-xs">{money(remainingKgTotal)}</td><td className="bg-yellow-50/20 p-3 text-right text-yellow-600 text-xs">{money(remainingContainers)}</td><td /><td className="p-3 text-right text-slate-700 text-xs">{money(remainingValueTotal)}</td></tr></tfoot> : null}
          </table>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden p-4 space-y-3 bg-slate-50/20 border-t border-slate-100">
          {sortedRemainingRows.map((row) => (
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
          {!sortedRemainingRows.length ? <div className="text-center text-slate-500 py-4 font-semibold text-xs">ไม่มีสต๊อกทองแดง/ทองเหลือง</div> : null}
        </div>
      </div>

      <Notice text={data?.sourceState.limitations[0]} />
      {error ? <ErrorBox text={error} /> : null}
    </section>
  )
}

function Select({ onChange, options, value }: { onChange: (value: string) => void; options: { id: string; name: string }[]; value: string }) {
  return (
    <select
      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none select h-10 transition-all focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">ทั้งหมด</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  )
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="space-y-1 text-xs font-bold text-slate-600 block"><span>{label}</span>{children}</label>
}

export function SalesCommissionPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [from, setFrom] = useState(() => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [to, setTo] = useState(() => {
    const date = new Date()
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
  const [branchId, setBranchId] = useState('')
  const [selectedSales, setSelectedSales] = useState('')
  const [data, setData] = useState<CommissionPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Filters for tables in drilldown or overview
  const [summarySalesFilter, setSummarySalesFilter] = useState('ALL')
  const [table3Page, setTable3Page] = useState(1)
  const [table4Page, setTable4Page] = useState(1)
  const [table1SortKey, setTable1SortKey] = useState<CommissionCategoryColumnKey | null>(null)
  const [table1SortDir, setTable1SortDir] = useState<SortDirection>('asc')
  const [table2SortKey, setTable2SortKey] = useState<CommissionCategoryColumnKey | null>(null)
  const [table2SortDir, setTable2SortDir] = useState<SortDirection>('asc')
  const [table3Sort, setTable3Sort] = useState<CommissionSupplierColumnKey>('amount')
  const [table3SortDir, setTable3SortDir] = useState<SortDirection>('desc')
  const [table4SortKey, setTable4SortKey] = useState<CommissionBillColumnKey | null>(null)
  const [table4SortDir, setTable4SortDir] = useState<SortDirection>('asc')
  const [summarySortKey, setSummarySortKey] = useState<CommissionSummaryColumnKey | null>(null)
  const [summarySortDir, setSummarySortDir] = useState<SortDirection>('asc')
  const [table4Search, setTable4Search] = useState('')
  const table1Resize = useResizableColumns('main.sales-commission.category-all.v1', commissionCategoryColumns)
  const table2Resize = useResizableColumns('main.sales-commission.category-commissionable.v1', commissionCategoryColumns)
  const table3Resize = useResizableColumns('main.sales-commission.suppliers.v1', commissionSupplierColumns)
  const table4Resize = useResizableColumns('main.sales-commission.bill-details.v1', commissionBillColumns)
  const summaryResize = useResizableColumns('main.sales-commission.summary.v1', commissionSummaryColumns)

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (from) params.set('dateFrom', from)
    if (to) params.set('dateTo', to)
    if (branchId) params.set('branchId', branchId)
    return params.toString()
  }, [from, to, branchId])

  useEffect(() => {
    const requestId = latestLoadRequestRef.current + 1
    latestLoadRequestRef.current = requestId
    setError(null)
    setIsLoading(true)
    dailyFetchJson<CommissionPayload>(`/api/sales-commission?${query}`)
      .then((payload) => {
        if (latestLoadRequestRef.current !== requestId) return
        setData(payload)
      })
      .catch((caught) => {
        if (latestLoadRequestRef.current !== requestId) return
        setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
      })
      .finally(() => {
        if (latestLoadRequestRef.current !== requestId) return
        setIsLoading(false)
      })
  }, [query])

  const sales = (data?.salesRows ?? []).find((row) => text(row.id) === selectedSales)
  const billRows = (data?.billRows ?? []).filter((row) => text(row.salesId) === selectedSales)

  // Table 1: ยอดซื้อรวมตามหมวดสินค้า
  const table1Data = useMemo(() => {
    const groups: Record<string, { qty: number; amount: number }> = {}
    billRows.forEach((row) => {
      const cat = text(row.productCategory)
      if (!groups[cat]) groups[cat] = { qty: 0, amount: 0 }
      groups[cat].qty += num(row.qty)
      groups[cat].amount += num(row.amount)
    })
    return Object.entries(groups).map(([category, d]) => ({ category, ...d }))
  }, [billRows])

  // Table 2: ยอดซื้อที่ได้รับค่าคอมมิชชั่นตามหมวดสินค้า
  const table2Data = useMemo(() => {
    const groups: Record<string, { qty: number; amount: number }> = {}
    billRows.filter((row) => row.isCommissionable).forEach((row) => {
      const cat = text(row.productCategory)
      if (!groups[cat]) groups[cat] = { qty: 0, amount: 0 }
      groups[cat].qty += num(row.qty)
      groups[cat].amount += num(row.amount)
    })
    return Object.entries(groups).map(([category, d]) => ({ category, ...d }))
  }, [billRows])
  const sortedTable1Data = useMemo(() => sortedByKey(table1Data, table1SortKey, table1SortDir, (row, key) => row[key]), [table1Data, table1SortDir, table1SortKey])
  const sortedTable2Data = useMemo(() => sortedByKey(table2Data, table2SortKey, table2SortDir, (row, key) => row[key]), [table2Data, table2SortDir, table2SortKey])

  // Table 3: Supplier ในความดูแล
  const table3Data = useMemo(() => {
    const groups: Record<string, { billNos: Set<string>; qty: number; amount: number }> = {}
    billRows.forEach((row) => {
      const sup = text(row.supplierName)
      if (!groups[sup]) groups[sup] = { billNos: new Set(), qty: 0, amount: 0 }
      groups[sup].billNos.add(text(row.docNo))
      groups[sup].qty += num(row.qty)
      groups[sup].amount += num(row.amount)
    })
    const totalAmount = sales?.purchaseAmt ? num(sales.purchaseAmt) : 1
    return Object.entries(groups).map(([supplier, d]) => ({
      supplier,
      bills: d.billNos.size,
      qty: d.qty,
      amount: d.amount,
      pct: (d.amount / totalAmount) * 100
    }))
  }, [billRows, sales])

  // Table 4: รายการสินค้าละเอียด (filtered by search input)
  const table4FilteredData = useMemo(() => {
    const searchLower = table4Search.trim().toLowerCase()
    if (!searchLower) return billRows
    return billRows.filter((row) => {
      return (
        text(row.docNo).toLowerCase().includes(searchLower) ||
        text(row.supplierName).toLowerCase().includes(searchLower) ||
        text(row.productName).toLowerCase().includes(searchLower)
      )
    })
  }, [billRows, table4Search])
  const sortedTable4Data = useMemo(() => sortedByKey(table4FilteredData, table4SortKey, table4SortDir, (row, key) => getCommissionBillSortValue(row, key, Boolean(sales?.commissionEligible))), [sales?.commissionEligible, table4FilteredData, table4SortDir, table4SortKey])

  // Grouped Summary Table for Page 1
  const summaryTableData = useMemo(() => {
    const allBills = data?.billRows ?? []
    const salesRows = data?.salesRows ?? []

    const groups: Record<string, Record<string, { qty: number; amount: number }>> = {}
    allBills.forEach((row) => {
      const sId = text(row.salesId)
      const cat = text(row.productCategory)
      if (!groups[sId]) groups[sId] = {}
      if (!groups[sId][cat]) groups[sId][cat] = { qty: 0, amount: 0 }
      groups[sId][cat].qty += num(row.qty)
      groups[sId][cat].amount += num(row.amount)
    })

    const result = salesRows.map((sale) => {
      const sId = text(sale.id)
      const cats = groups[sId] || {}
      const categories = Object.entries(cats).map(([category, d]) => ({ category, ...d }))
      return {
        salesId: sId,
        salesName: text(sale.name),
        categories,
        totalQty: num(sale.qty),
        totalAmount: num(sale.purchaseAmt)
      }
    })

    if (summarySalesFilter === 'ALL') return result
    return result.filter((row) => row.salesId === summarySalesFilter)
  }, [data, summarySalesFilter])
  const summaryFlatRows = useMemo(() => {
    const rows = summaryTableData.flatMap((row) => {
      if (!row.categories.length) {
        return [{ amount: 0, category: 'ไม่มีข้อมูล', qty: 0, salesId: row.salesId, salesName: row.salesName }]
      }
      return row.categories.map((category) => ({ ...category, salesId: row.salesId, salesName: row.salesName }))
    })
    return sortedByKey(rows, summarySortKey, summarySortDir, (row, key) => row[key])
  }, [summarySortDir, summarySortKey, summaryTableData])

  // Helper for downloading CSV of Table 4
  const handleDownloadCsv = () => {
    if (!sales) return
    const headers = ['วันที่', 'เลขที่บิล', 'Supplier', 'สินค้า', 'น้ำหนัก (กก.)', 'ราคาซื้อ/กก.', 'ราคาหน้าใบ', 'ส่วนต่างกำไร', 'ยอดรวม (บาท)', 'สถานะค่าคอม']
    const rows = billRows.map((row) => [
      formatDateDisplay(text(row.date)),
      text(row.docNo),
      text(row.supplierName),
      text(row.productName),
      money(row.qty),
      money(row.price),
      sales?.commissionEligible ? money(row.salesPrice) : '-',
      sales?.commissionEligible ? money(num(row.salesPrice) - num(row.price)) : '-',
      money(row.amount),
      row.isCommissionable ? 'ได้คอมมิชชั่น' : 'ไม่ได้คอมมิชชั่น'
    ])
    downloadCsv(`sales_tracking_${sales.code || sales.id}.csv`, headers, rows)
  }

  function changeTable1Sort(key: CommissionCategoryColumnKey) {
    if (table1SortKey === key) {
      setTable1SortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setTable1SortKey(key)
    setTable1SortDir('asc')
  }

  function changeTable2Sort(key: CommissionCategoryColumnKey) {
    if (table2SortKey === key) {
      setTable2SortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setTable2SortKey(key)
    setTable2SortDir('asc')
  }

  function changeTable3Sort(key: CommissionSupplierColumnKey) {
    if (table3Sort === key) {
      setTable3SortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setTable3Sort(key)
    setTable3SortDir('asc')
  }

  function changeTable4Sort(key: CommissionBillColumnKey) {
    if (table4SortKey === key) {
      setTable4SortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setTable4SortKey(key)
    setTable4SortDir('asc')
  }

  function changeSummarySort(key: CommissionSummaryColumnKey) {
    if (summarySortKey === key) {
      setSummarySortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSummarySortKey(key)
    setSummarySortDir('asc')
  }

  if (selectedSales && sales) {
    // Sort Table 3
    const sortedTable3 = [...table3Data].sort((a, b) => {
      const result = compareSortValues(a[table3Sort], b[table3Sort])
      return table3SortDir === 'asc' ? result : -result
    })

    // Pagination constants
    const table3PageSize = 10
    const table4PageSize = 20

    const totalTable3Pages = Math.ceil(sortedTable3.length / table3PageSize) || 1
    const totalTable4Pages = Math.ceil(sortedTable4Data.length / table4PageSize) || 1

    const pagedTable3 = sortedTable3.slice((table3Page - 1) * table3PageSize, table3Page * table3PageSize)
    const pagedTable4 = sortedTable4Data.slice((table4Page - 1) * table4PageSize, table4Page * table4PageSize)

    return (
      <section className="space-y-4 text-[13.5px]">
        {/* Header Block */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <div>
            <div className="font-bold text-slate-800 text-base flex items-center gap-2">
              <span>{text(sales.name)}</span>
              <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${sales.commissionEligible ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>
                {sales.commissionEligible ? 'ได้ค่าคอมมิชชั่น' : 'ไม่ได้ค่าคอมมิชชั่น'}
              </span>
            </div>
            <div className="text-xs text-slate-500 font-semibold mt-0.5">
              รหัส: {text(sales.code)} · โทร: {text(sales.phone) || '-'} · ตัวกรอง: {formatDateDisplay(from)} - {formatDateDisplay(to)}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadCsv}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 shadow-xs outline-none transition-colors h-10 flex items-center justify-center gap-1.5"
              type="button"
            >
              📥 ส่งออกรายละเอียด CSV
            </button>
            <button
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 shadow-xs outline-none transition-colors h-10 flex items-center justify-center"
              type="button"
              onClick={() => {
                setSelectedSales('')
                setTable3Page(1)
                setTable4Page(1)
                setTable4Search('')
              }}
            >
              ← กลับหน้าหลัก
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Metric label="จำนวนบิลรับซื้อ" value={`${money(sales.billCount)} บิล`} tone="blue" />
          <Metric label="น้ำหนักรวม" value={`${money(sales.qty)} กก.`} tone="amber" />
          <Metric label="ยอดรับซื้อรวม" value={`${money(sales.purchaseAmt)} บาท`} tone="blue" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="จำนวนที่ได้คอม" value={`${money(sales.commissionableQty)} กก.`} tone="emerald" />
          <Metric label="ยอดซื้อที่ได้คอม" value={`${money(sales.commissionableAmount)} บาท`} tone="emerald" />
          <Metric label="จำนวนที่ไม่ได้คอม" value={`${money(sales.nonCommissionableQty)} กก.`} tone="slate" />
          <Metric label="ยอดซื้อที่ไม่ได้คอม" value={`${money(sales.nonCommissionableAmount)} บาท`} tone="slate" />
        </div>

        {/* Tables Grid */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Table 1 */}
          <Panel title="📦 Table 1: ยอดซื้อรวมตามหมวดสินค้า">
            {table1Resize.hasCustomWidths ? (
              <div className="mb-2 hidden justify-end lg:flex">
                <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={table1Resize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: table1Resize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  {commissionCategoryColumns.map((column) => (
                    <col key={column.key} style={table1Resize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <thead className="bg-slate-100">
                  <tr>
                    {commissionCategoryColumns.map((column) => (
                      <ResizableTableHead
                        key={column.key}
                        activeSortKey={table1SortKey ?? undefined}
                        align={column.align}
                        direction={table1SortDir}
                        label={column.label}
                        sortKey={column.key}
                        onSort={changeTable1Sort}
                        resizeProps={table1Resize.getResizeHandleProps(column.key, column.label)}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedTable1Data.map((row) => (
                    <tr key={row.category} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 font-semibold text-slate-800">{row.category}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-700">{money(row.qty)}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-700">{money(row.amount)}</td>
                    </tr>
                  ))}
                  {sortedTable1Data.length === 0 ? (
                    <tr>
                      <td className="py-8 text-center text-slate-400 font-semibold" colSpan={commissionCategoryColumns.length}>ไม่มีข้อมูลการซื้อ</td>
                    </tr>
                  ) : (
                    <tr className="bg-slate-50/55 font-bold">
                      <td className="p-3 text-slate-800">ผลรวมทั้งหมด</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(sales.qty)}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(sales.purchaseAmt)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {/* Table 2 */}
          <Panel title="📈 Table 2: ยอดซื้อที่ได้รับค่าคอมมิชชั่นตามหมวดสินค้า">
            {table2Resize.hasCustomWidths ? (
              <div className="mb-2 hidden justify-end lg:flex">
                <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={table2Resize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
              </div>
            ) : null}
            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: table2Resize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  {commissionCategoryColumns.map((column) => (
                    <col key={column.key} style={table2Resize.getColumnStyle(column.key)} />
                  ))}
                </colgroup>
                <thead className="bg-slate-100">
                  <tr>
                    {commissionCategoryColumns.map((column) => (
                      <ResizableTableHead
                        key={column.key}
                        activeSortKey={table2SortKey ?? undefined}
                        align={column.align}
                        direction={table2SortDir}
                        label={column.label}
                        sortKey={column.key}
                        onSort={changeTable2Sort}
                        resizeProps={table2Resize.getResizeHandleProps(column.key, column.label)}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedTable2Data.map((row) => (
                    <tr key={row.category} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 font-semibold text-slate-800">{row.category}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-700">{money(row.qty)}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-700">{money(row.amount)}</td>
                    </tr>
                  ))}
                  {sortedTable2Data.length === 0 ? (
                    <tr>
                      <td className="py-8 text-center text-slate-400 font-semibold" colSpan={commissionCategoryColumns.length}>ไม่มีข้อมูลรายการที่ได้คอมมิชชั่น</td>
                    </tr>
                  ) : (
                    <tr className="bg-slate-50/55 font-bold">
                      <td className="p-3 text-slate-800">ผลรวมทั้งหมด</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(sales.commissionableQty)}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(sales.commissionableAmount)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* Table 3 */}
        <Panel title="🏭 Table 3: Supplier ในความดูแล">
          {table3Resize.hasCustomWidths ? (
            <div className="mb-2 hidden justify-end lg:flex">
              <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={table3Resize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm mb-3">
            <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: table3Resize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {commissionSupplierColumns.map((column) => (
                  <col key={column.key} style={table3Resize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  {commissionSupplierColumns.map((column) => (
                    <ResizableTableHead
                      key={column.key}
                      activeSortKey={table3Sort}
                      align={column.align}
                      direction={table3SortDir}
                      label={column.label}
                      sortKey={column.key}
                      onSort={changeTable3Sort}
                      resizeProps={table3Resize.getResizeHandleProps(column.key, column.label)}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedTable3.map((row) => (
                  <tr key={row.supplier} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 font-semibold text-slate-800">{row.supplier}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-700">{row.bills}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-700">{money(row.qty)}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-700">{money(row.amount)}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-700">{row.pct.toFixed(2)}%</td>
                  </tr>
                ))}
                {pagedTable3.length === 0 ? (
                  <tr>
                    <td className="py-8 text-center text-slate-400 font-semibold" colSpan={commissionSupplierColumns.length}>ไม่มีข้อมูล Supplier</td>
                  </tr>
                ) : (
                  <tr className="bg-slate-50/55 font-bold">
                    <td className="p-3 text-slate-800">รวมทั้งหมด ({table3Data.length} ราย)</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-800">
                      {table3Data.reduce((sum, r) => sum + r.bills, 0)}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(sales.qty)}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(sales.purchaseAmt)}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-800">100.00%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalTable3Pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500 font-semibold">แสดงหน้า {table3Page} จาก {totalTable3Pages} (ทั้งหมด {table3Data.length} รายการ)</span>
              <div className="flex gap-1">
                <button
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 outline-none"
                  disabled={table3Page <= 1}
                  onClick={() => setTable3Page((p) => p - 1)}
                >
                  ย้อนกลับ
                </button>
                <button
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 outline-none"
                  disabled={table3Page >= totalTable3Pages}
                  onClick={() => setTable3Page((p) => p + 1)}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </Panel>

        {/* Table 4 */}
        <Panel title="📊 Table 4: รายการสินค้าละเอียด">
          <div className="mb-3 flex gap-2">
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white font-semibold text-slate-700 h-9 w-64 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all"
              placeholder="ค้นหาเลขที่บิล, Supplier, สินค้า..."
              value={table4Search}
              onChange={(e) => {
                setTable4Search(e.target.value)
                setTable4Page(1)
              }}
            />
          </div>
          {table4Resize.hasCustomWidths ? (
            <div className="mb-2 hidden justify-end lg:flex">
              <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={table4Resize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm mb-3">
            <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: table4Resize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                {commissionBillColumns.map((column) => (
                  <col key={column.key} style={table4Resize.getColumnStyle(column.key)} />
                ))}
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  {commissionBillColumns.map((column) => (
                    <ResizableTableHead
                      key={column.key}
                      activeSortKey={table4SortKey ?? undefined}
                      align={column.align}
                      direction={table4SortDir}
                      label={column.label}
                      sortKey={column.key}
                      onSort={changeTable4Sort}
                      resizeProps={table4Resize.getResizeHandleProps(column.key, column.label)}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagedTable4.map((row) => {
                  const profitDiff = sales.commissionEligible ? num(row.salesPrice) - num(row.price) : 0
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 text-slate-500 whitespace-nowrap">{formatDateDisplay(text(row.date))}</td>
                      <td className="p-3 font-semibold text-slate-800">{text(row.docNo)}</td>
                      <td className="p-3 text-slate-700">{text(row.supplierName)}</td>
                      <td className="p-3 text-slate-700 font-semibold">{text(row.productName)}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-700">{money(row.qty)}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-700">{money(row.price)}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-700">
                        {sales.commissionEligible ? (row.salesPrice > 0 ? money(row.salesPrice) : '-') : '-'}
                      </td>
                      <td className={`p-3 text-right font-mono tabular-nums font-semibold ${profitDiff > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                        {sales.commissionEligible ? (row.salesPrice > 0 ? money(profitDiff) : '-') : '-'}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-800 font-bold">{money(row.amount)}</td>
                      <td className="p-3 text-center">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-bold leading-none ${row.isCommissionable ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>
                          {row.isCommissionable ? 'ได้คอมมิชชั่น' : 'ไม่ได้คอม'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {pagedTable4.length === 0 ? (
                  <tr>
                    <td className="py-8 text-center text-slate-400 font-semibold" colSpan={commissionBillColumns.length}>ไม่มีข้อมูลสินค้าละเอียด</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {totalTable4Pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500 font-semibold">แสดงหน้า {table4Page} จาก {totalTable4Pages} (ทั้งหมด {sortedTable4Data.length} รายการ)</span>
              <div className="flex gap-1">
                <button
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 outline-none"
                  disabled={table4Page <= 1}
                  onClick={() => setTable4Page((p) => p - 1)}
                >
                  ย้อนกลับ
                </button>
                <button
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 outline-none"
                  disabled={table4Page >= totalTable4Pages}
                  onClick={() => setTable4Page((p) => p + 1)}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </Panel>
      </section>
    )
  }

  // 1. Overview Page State
  return (
    <section className="space-y-4 text-[13.5px]">
      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 items-end">
          <Field label="จากวันที่">
            <DatePickerInput className="w-full mt-1" value={from} onChange={setFrom} />
          </Field>
          <Field label="ถึงวันที่">
            <DatePickerInput className="w-full mt-1" value={to} onChange={setTo} />
          </Field>
          <Field label="สาขา">
            <Select
              options={data?.filters.branches ?? []}
              value={branchId}
              onChange={setBranchId}
            />
          </Field>
          <div className="flex items-center ml-auto w-full xl:w-auto mt-2 md:mt-0 font-bold">
            {isLoading ? (
              <span className="text-xs font-bold text-slate-400 animate-pulse flex items-center gap-1.5">
                ⏳ กำลังโหลดข้อมูล...
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-3.5 pt-3 border-t border-slate-100 text-xs flex items-center gap-1.5">
          <span className="font-semibold text-slate-500">📋 บิลซื้อทั้งหมดในช่วงเวลา:</span>
          <span className="rounded-xl bg-slate-100 text-slate-700 px-2.5 py-1 text-xs font-bold">{money(data?.totals.bills)} บิล</span>
        </div>
      </div>

      {/* 8 Summary Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="จำนวนที่ซื้อ" value={`${money(data?.totals.qty)} กก.`} tone="amber" />
        <Metric label="ยอดซื้อ" value={`${money(data?.totals.amount)} บ.`} tone="blue" />
        <Metric label="จำนวนที่ได้คอม" value={`${money(data?.totals.commissionableQty)} กก.`} tone="emerald" />
        <Metric label="ยอดซื้อที่ได้คอม" value={`${money(data?.totals.commissionableAmount)} บ.`} tone="emerald" />
        <Metric label="จำนวนที่ไม่ได้คอม" value={`${money(data?.totals.nonCommissionableQty)} กก.`} tone="slate" />
        <Metric label="ยอดซื้อที่ไม่ได้คอม" value={`${money(data?.totals.nonCommissionableAmount)} บ.`} tone="slate" />
        <Metric label="จำนวนซื้อทั้งปี" value={`${money(data?.totals.annualQty)} กก.`} tone="amber" />
        <Metric label="ยอดซื้อทั้งปี" value={`${money(data?.totals.annualAmount)} บ.`} tone="blue" />
      </div>

      {/* Grid of Salesperson Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.salesRows ?? []).map((row) => (
          <button
            key={text(row.id)}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-400 hover:bg-slate-50/40 outline-none transition-all duration-200 focus:outline-none flex flex-col justify-between"
            type="button"
            onClick={() => setSelectedSales(text(row.id))}
          >
            <div>
              <div className="flex items-start justify-between">
                <div className="font-bold text-slate-800 text-base">{text(row.name)}</div>
                <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-bold leading-none ${row.commissionEligible ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>
                  {row.commissionEligible ? 'ได้ค่าคอม' : 'ไม่ได้คอม'}
                </span>
              </div>
              <div className="text-xs text-slate-500 font-semibold mt-0.5">{text(row.code)} · {text(row.phone) || '-'}</div>
              <div className="mt-3.5 grid grid-cols-2 gap-2 text-xs">
                <Mini label="บิล" value={money(row.billCount)} />
                <Mini label="Supplier" value={money(row.supplierCount)} />
              </div>
              <div className="mt-4 space-y-2.5">
                <Metric label="น้ำหนักรับซื้อ" value={`${money(row.qty)} กก.`} tone="amber" />
                <Metric label="ยอดรับซื้อรวม" value={`${money(row.purchaseAmt)} บ.`} tone="blue" />
                <Metric label="น้ำหนักที่ได้คอม" value={`${money(row.commissionableQty)} กก.`} tone="emerald" />
                <Metric label="ยอดซื้อที่ได้คอม" value={`${money(row.commissionableAmount)} บ.`} tone="emerald" />
                <Metric label="ค่าคอมเดือนนี้" value={`${money(row.commission)} บ.`} tone={row.commission > 0 ? 'emerald' : 'slate'} />
              </div>
            </div>
            <div className="mt-4 text-right text-xs font-semibold text-blue-600 flex items-center justify-end gap-1 border-t border-slate-50 pt-2.5 w-full">
              <span>คลิกเพื่อดูรายละเอียด</span>
              <span>&rarr;</span>
            </div>
          </button>
        ))}
      </div>

      {/* Sales Summary / สรุปยอดซื้อราย Sales */}
      <Panel title="สรุปยอดซื้อราย Sales">
        <div className="mb-3.5 flex items-center gap-3">
          <label className="text-xs font-bold text-slate-500">เลือกดูพนักงานขาย:</label>
          <select
            className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white font-semibold text-slate-700 h-9 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all cursor-pointer"
            value={summarySalesFilter}
            onChange={(e) => setSummarySalesFilter(e.target.value)}
          >
            <option value="ALL">ทุก Sales</option>
            {(data?.salesRows ?? []).map((sale) => (
              <option key={text(sale.id)} value={text(sale.id)}>{text(sale.name)}</option>
            ))}
          </select>
        </div>

        {summaryResize.hasCustomWidths ? (
          <div className="mb-2 hidden justify-end lg:flex">
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={summaryResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: summaryResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {commissionSummaryColumns.map((column) => (
                <col key={column.key} style={summaryResize.getColumnStyle(column.key)} />
              ))}
            </colgroup>
            <thead className="bg-slate-100">
              <tr>
                {commissionSummaryColumns.map((column) => (
                  <ResizableTableHead
                    key={column.key}
                    activeSortKey={summarySortKey ?? undefined}
                    align={column.align}
                    direction={summarySortDir}
                    label={column.label}
                    sortKey={column.key}
                    onSort={changeSummarySort}
                    resizeProps={summaryResize.getResizeHandleProps(column.key, column.label)}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summaryFlatRows.map((row) => (
                <tr key={`${row.salesId}-${row.category}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold text-slate-800">
                    <button
                      className="text-blue-600 hover:text-blue-800 hover:underline outline-none text-left font-bold"
                      type="button"
                      onClick={() => setSelectedSales(row.salesId)}
                    >
                      {row.salesName}
                    </button>
                  </td>
                  <td className="p-3 font-semibold text-slate-700">{row.category}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-slate-700">{money(row.qty)}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-slate-700">{money(row.amount)}</td>
                </tr>
              ))}
              {summaryFlatRows.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-slate-400 font-semibold" colSpan={commissionSummaryColumns.length}>ไม่มีข้อมูล</td>
                </tr>
              ) : (
                <tr className="bg-slate-100/50 font-bold text-base">
                  <td className="p-3 text-slate-800" colSpan={2}>รวมทั้งหมดทุก Sales</td>
                  <td className="p-3 text-right font-mono tabular-nums text-slate-800">
                    {money(summaryTableData.reduce((sum, r) => sum + r.totalQty, 0))}
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums text-slate-800">
                    {money(summaryTableData.reduce((sum, r) => sum + r.totalAmount, 0))}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
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
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
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
