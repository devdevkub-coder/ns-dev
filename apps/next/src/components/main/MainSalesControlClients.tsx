'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay } from '@/lib/format'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { KpiCard as SharedKpiCard, type KpiCardTone } from '@/components/ui/KpiCard'
import { MobileFilterSheet } from '@/components/ui/MobileFilterSheet'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox, type SearchComboboxOption } from '@/components/ui/SearchCombobox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'
import { ArrowLeft, Download, RotateCcw, Search } from 'lucide-react'

type AnyRow = Record<string, number | string | boolean | null | undefined>
type SortDirection = 'asc' | 'desc'
type CommissionDetailTab = 'categoryCommission' | 'categoryTotal' | 'supplier' | 'items'
type TableColumn<TKey extends string> = ResizableColumnDefinition<TKey> & { align?: 'center' | 'left' | 'right'; label: string }
type SalesPlanColumnKey = 'channel' | 'containers' | 'customerName' | 'fx' | 'kgPerContainer' | 'lme' | 'productName' | 'sellPctLme' | 'sellPrice' | 'status' | 'totalKg'
type SalesPlanAnalysisColumnKey = 'bestPlanPct' | 'bestPlanPrice' | 'lockedKg' | 'metalGroup' | 'name' | 'projectedMarginPct' | 'projectedProfit' | 'recommendation' | 'remainingKg' | 'stock' | 'wac'
type SalesPlanRemainingColumnKey = 'code' | 'lockedContainers' | 'lockedKg' | 'metalGroup' | 'name' | 'remainingContainers' | 'remainingKg' | 'stock' | 'value' | 'wac'
type SalesPlanInsightTabKey = 'analysis' | 'remaining'
type CommissionCategoryColumnKey = 'amount' | 'category' | 'qty'
type CommissionSupplierColumnKey = 'amount' | 'bills' | 'pct' | 'qty' | 'supplier'
type CommissionBillColumnKey = 'amount' | 'commissionStatus' | 'date' | 'docNo' | 'price' | 'productName' | 'profitDiff' | 'qty' | 'salesPrice' | 'supplierName'
type CommissionSummaryColumnKey = 'amount' | 'category' | 'qty' | 'salesName'
type CommissionStatusFilter = 'all' | 'commissionable' | 'nonCommissionable'
type LmeConfig = {
  fxRate: number
  kgPerContainer: number
  liveFetchNote: string
  lmeAluminumUSD: number
  lmeBrassUSD: number
  lmeCopperUSD: number
  source: 'default' | 'live' | 'manual' | 'mixed'
  updatedAt: string
  updatedBy: string
}
type SalesPlanPayload = {
  customers?: Array<{ active: boolean; code: string; id: string; name: string }>
  filters: { channels: { id: string; name: string }[]; metalGroups: string[]; month: string }
  lmeConfig: LmeConfig
  pendingSaleTable: AnyRow[]
  pendingSaleTotals: Record<string, number>
  planRows: AnyRow[]
  planProductOptions?: Array<{ code: string; metalGroup: string; name: string; wac: number }>
  productAnalysis: AnyRow[]
  sourceState: { limitations: string[] }
  summary: Record<string, number>
}
type SalesPlanDraftForm = {
  channel: string
  containers: string
  customerId: string
  kgPerContainer: string
  lmeCf: string
  productCode: string
  sellPctLme: string
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

const detailPageSizeOptions = [10, 25, 50] as const
type DetailPageSize = (typeof detailPageSizeOptions)[number]

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
  { key: 'supplier', label: 'ผู้ขาย', defaultWidth: 260, minWidth: 180 },
  { key: 'bills', label: 'บิล', defaultWidth: 95, minWidth: 80, align: 'right' },
  { key: 'qty', label: 'น้ำหนัก (กก.)', defaultWidth: 140, minWidth: 115, align: 'right' },
  { key: 'amount', label: 'ยอดรับซื้อ (บาท)', defaultWidth: 160, minWidth: 130, align: 'right' },
  { key: 'pct', label: '% ของทั้งหมด', defaultWidth: 130, minWidth: 110, align: 'right' },
]
const commissionBillColumns: Array<TableColumn<CommissionBillColumnKey>> = [
  { key: 'date', label: 'วันที่', defaultWidth: 115, minWidth: 100 },
  { key: 'docNo', label: 'เลขที่บิล', defaultWidth: 140, minWidth: 115 },
  { key: 'supplierName', label: 'ผู้ขาย', defaultWidth: 200, minWidth: 150 },
  { key: 'productName', label: 'สินค้า', defaultWidth: 220, minWidth: 160 },
  { key: 'qty', label: 'น้ำหนัก (กก.)', defaultWidth: 130, minWidth: 110, align: 'right' },
  { key: 'price', label: 'ราคาซื้อ', defaultWidth: 120, minWidth: 100, align: 'right' },
  { key: 'salesPrice', label: 'ราคาหน้าใบ', defaultWidth: 125, minWidth: 105, align: 'right' },
  { key: 'profitDiff', label: 'ส่วนต่างกำไร', defaultWidth: 135, minWidth: 115, align: 'right' },
  { key: 'amount', label: 'ยอดรวม (บาท)', defaultWidth: 150, minWidth: 125, align: 'right' },
  { key: 'commissionStatus', label: 'สถานะค่าคอม', defaultWidth: 150, minWidth: 125, align: 'center' },
]
const commissionSummaryColumns: Array<TableColumn<CommissionSummaryColumnKey>> = [
  { key: 'salesName', label: 'พนักงานขาย', defaultWidth: 220, minWidth: 160 },
  { key: 'category', label: 'ประเภท / หมวดสินค้า', defaultWidth: 260, minWidth: 180 },
  { key: 'qty', label: 'ยอดซื้อ (กก.)', defaultWidth: 140, minWidth: 115, align: 'right' },
  { key: 'amount', label: 'ยอดรับซื้อ (บาท)', defaultWidth: 160, minWidth: 130, align: 'right' },
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

function lmeBaseByMetalGroup(metalGroup: string, config: LmeConfig | null) {
  if (!config) return 0
  const group = metalGroup.toLowerCase()
  if (group.includes('ทองแดง') || group.includes('copper')) return config.lmeCopperUSD
  if (group.includes('ทองเหลือง') || group.includes('brass')) return config.lmeBrassUSD
  if (group.includes('อลูมิ') || group.includes('aluminum')) return config.lmeAluminumUSD
  return 0
}

function dateTime(value: string | null | undefined) {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

function currentMonthDateRange() {
  const date = new Date()
  return {
    from: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`,
    to: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  }
}

function compareSortValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right
  }

  return String(left).localeCompare(String(right), 'th', { numeric: true })
}

function getAnySortValue(row: AnyRow, key: string): string | number {
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

function normalizeSearch(value: string) {
  return value.trim().toLowerCase()
}

function totalPagesFor(totalRows: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalRows / pageSize))
}

function safePageFor(page: number, totalRows: number, pageSize: number) {
  return Math.min(Math.max(1, page), totalPagesFor(totalRows, pageSize))
}

function pagedRows<TRow>(rows: TRow[], page: number, pageSize: number) {
  const safePage = safePageFor(page, rows.length, pageSize)
  return rows.slice((safePage - 1) * pageSize, safePage * pageSize)
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
  const [formError, setFormError] = useState<string | null>(null)
  const [isFetchingLive, setIsFetchingLive] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isPlanFormOpen, setIsPlanFormOpen] = useState(false)
  const [lmeForm, setLmeForm] = useState<LmeConfig | null>(null)
  const [month, setMonth] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [planDraftError, setPlanDraftError] = useState<string | null>(null)
  const [localPlanRows, setLocalPlanRows] = useState<AnyRow[]>([])
  const [planDraftForm, setPlanDraftForm] = useState<SalesPlanDraftForm>({
    channel: 'export',
    containers: '1',
    customerId: '',
    kgPerContainer: '25000',
    lmeCf: '',
    productCode: '',
    sellPctLme: '',
  })
  const [planSortKey, setPlanSortKey] = useState<SalesPlanColumnKey | null>(null)
  const [planSortDirection, setPlanSortDirection] = useState<SortDirection>('asc')
  const [analysisSortKey, setAnalysisSortKey] = useState<SalesPlanAnalysisColumnKey | null>(null)
  const [analysisSortDirection, setAnalysisSortDirection] = useState<SortDirection>('asc')
  const [remainingSortKey, setRemainingSortKey] = useState<SalesPlanRemainingColumnKey | null>(null)
  const [remainingSortDirection, setRemainingSortDirection] = useState<SortDirection>('asc')
  const [insightTab, setInsightTab] = useState<SalesPlanInsightTabKey>('analysis')
  const planResize = useResizableColumns('main.sales-plan.plan.v1', salesPlanColumns)
  const analysisResize = useResizableColumns('main.sales-plan.analysis.v1', salesPlanAnalysisColumns)
  const remainingResize = useResizableColumns('main.sales-plan.remaining.v1', salesPlanRemainingColumns)

  const loadSalesPlan = async () => {
    setError(null)
    setIsLoading(true)
    try {
      const payload = await dailyFetchJson<SalesPlanPayload>('/api/sales-plan')
      setData(payload)
      setLmeForm(payload.lmeConfig)
      setMonth(payload.filters.month)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'โหลดข้อมูลไม่ได้')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadSalesPlan()
  }, [])

  const s = data?.summary ?? {}
  const productOptions = useMemo(() => (data?.planProductOptions ?? [])
    .map((row) => ({
      code: text(row.code),
      metalGroup: text(row.metalGroup),
      name: text(row.name),
      wac: num(row.wac),
    }))
    .filter((row) => row.code && row.name), [data?.planProductOptions])
  const productSearchOptions = useMemo<SearchComboboxOption[]>(() => productOptions.map((option) => ({
    description: option.metalGroup || undefined,
    id: option.code,
    label: `${option.name} (${option.code})`,
    searchText: `${option.code} ${option.name} ${option.metalGroup}`.toLowerCase(),
  })), [productOptions])
  const customerOptions = useMemo(() => (data?.customers ?? [])
    .map((row) => ({
      active: Boolean(row.active),
      code: text(row.code),
      id: text(row.id),
      name: text(row.name),
    }))
    .filter((row) => row.active && row.id && row.name), [data?.customers])
  const customerSearchOptions = useMemo<SearchComboboxOption[]>(() => customerOptions.map((option) => ({
    description: option.name,
    id: option.id,
    label: option.code ? `${option.code} - ${option.name}` : option.name,
    searchText: `${option.id} ${option.code} ${option.name}`.toLowerCase(),
  })), [customerOptions])
  const selectedDraftProduct = useMemo(() => productOptions.find((option) => option.code === planDraftForm.productCode) ?? null, [planDraftForm.productCode, productOptions])
  const selectedDraftCustomer = useMemo(() => customerOptions.find((option) => option.id === planDraftForm.customerId) ?? null, [customerOptions, planDraftForm.customerId])
  const draftKgPerContainer = Math.max(0, Number(planDraftForm.kgPerContainer || 0))
  const draftContainers = Math.max(0, Number(planDraftForm.containers || 0))
  const draftTotalKg = draftContainers * draftKgPerContainer
  const draftBaseLme = selectedDraftProduct ? lmeBaseByMetalGroup(selectedDraftProduct.metalGroup, lmeForm) : 0
  const draftFx = lmeForm?.fxRate ?? 0
  const draftSellPct = Math.max(0, Number(planDraftForm.sellPctLme || 0))
  const draftLmeCf = Math.max(0, Number(planDraftForm.lmeCf || 0))
  const draftSellPrice = draftLmeCf > 0 && draftSellPct > 0 ? (draftLmeCf / 1000) * draftFx * (draftSellPct / 100) : 0
  const filteredServerPlanRows = useMemo(() => (data?.planRows ?? [])
    .filter((row) => !filterGroup || text(row.metalGroup).includes(filterGroup))
    .filter((row) => !filterChannel || text(row.channel) === filterChannel), [data?.planRows, filterChannel, filterGroup])
  const filteredLocalPlanRows = useMemo(() => localPlanRows
    .filter((row) => !filterGroup || text(row.metalGroup).includes(filterGroup))
    .filter((row) => !filterChannel || text(row.channel) === filterChannel), [filterChannel, filterGroup, localPlanRows])
  const mergedPlanRows = useMemo(() => [...filteredLocalPlanRows, ...filteredServerPlanRows], [filteredLocalPlanRows, filteredServerPlanRows])
  const liveSummary = useMemo(() => ({
    avgPctLme: mergedPlanRows.length ? mergedPlanRows.reduce((sum, row) => sum + num(row.sellPctLme), 0) / mergedPlanRows.length : 0,
    lockedContainers: mergedPlanRows.filter((row) => text(row.status).toLowerCase().includes('lock')).reduce((sum, row) => sum + num(row.containers), 0),
    lockedCount: mergedPlanRows.filter((row) => text(row.status).toLowerCase().includes('lock')).length,
    pendingCount: mergedPlanRows.filter((row) => !text(row.status).toLowerCase().includes('lock')).length,
    plansCount: mergedPlanRows.length,
    totalContainers: mergedPlanRows.reduce((sum, row) => sum + num(row.containers), 0),
    totalKg: mergedPlanRows.reduce((sum, row) => sum + num(row.totalKg), 0),
    totalLockedProfit: mergedPlanRows.filter((row) => text(row.status).toLowerCase().includes('lock')).reduce((sum, row) => sum + num(row.projectedProfit), 0),
    totalProjectedProfit: mergedPlanRows.reduce((sum, row) => sum + num(row.projectedProfit), 0),
  }), [mergedPlanRows])
  const pendingSaleRows = useMemo(() => (data?.pendingSaleTable ?? [])
    .filter((row) => !filterGroup || text(row.metalGroup).includes(filterGroup)), [data?.pendingSaleTable, filterGroup])
  const pendingSaleTotals = useMemo(() => ({
    count: pendingSaleRows.length,
    shortageCount: pendingSaleRows.filter((row) => num(row.realPendingSale) < 0).length,
    totalLockedBuy: pendingSaleRows.reduce((sum, row) => sum + num(row.lockedBuy), 0),
    totalLockedSell: pendingSaleRows.reduce((sum, row) => sum + num(row.lockedSell), 0),
    totalPendingSaleQty: pendingSaleRows.reduce((sum, row) => sum + num(row.pendingSaleQty), 0),
    totalPendingSaleValue: pendingSaleRows.reduce((sum, row) => sum + num(row.pendingSaleValue), 0),
    totalRealPending: pendingSaleRows.reduce((sum, row) => sum + num(row.realPendingSale), 0),
    totalStock: pendingSaleRows.reduce((sum, row) => sum + num(row.stock), 0),
  }), [pendingSaleRows])
  const analysisRows = useMemo(() => (data?.productAnalysis ?? [])
    .filter((row) => !filterGroup || text(row.metalGroup).includes(filterGroup))
    .filter((row) => !filterChannel || filterChannel), [data, filterGroup, filterChannel])
  const sortedPlanRows = useMemo(() => {
    const rows = mergedPlanRows
    if (!planSortKey) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(getAnySortValue(left, planSortKey), getAnySortValue(right, planSortKey))
      return planSortDirection === 'asc' ? result : -result
    })
  }, [mergedPlanRows, planSortDirection, planSortKey])
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
      mergedPlanRows.map((row) => [month || text(data?.filters.month), text(row.productName), text(row.channel), text(row.customerName), money(row.containers), money(row.kgPerContainer), money(row.totalKg), money(row.sellPctLme), money(row.lme), money(row.fx), money(row.sellPrice), text(row.status)]),
    )
  }

  function changePlanSort(key: SalesPlanColumnKey) {
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

  function updateLmeField(key: keyof LmeConfig, value: string) {
    if (!lmeForm) return
    const numericKeys = new Set<keyof LmeConfig>(['fxRate', 'kgPerContainer', 'lmeAluminumUSD', 'lmeBrassUSD', 'lmeCopperUSD'])
    setFormError(null)
    setLmeForm({
      ...lmeForm,
      [key]: numericKeys.has(key) ? Number(value || 0) : value,
      source: lmeForm.source === 'live' ? 'mixed' : 'manual',
    })
  }

  async function handleFetchLive() {
    setFormError(null)
    setIsFetchingLive(true)
    try {
      const response = await dailyFetchJson<{ lmeConfig: LmeConfig }>('/api/sales-plan', {
        body: JSON.stringify({ action: 'fetch-live' }),
        method: 'POST',
      })
      setLmeForm(response.lmeConfig)
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'ดึงข้อมูล live ไม่ได้')
    } finally {
      setIsFetchingLive(false)
    }
  }

  async function handleSaveConfig() {
    if (!lmeForm) return
    setFormError(null)
    setIsSavingConfig(true)
    try {
      const response = await dailyFetchJson<{ lmeConfig: LmeConfig }>('/api/sales-plan', {
        body: JSON.stringify({
          action: 'save-config',
          config: {
            fxRate: lmeForm.fxRate,
            kgPerContainer: lmeForm.kgPerContainer,
            liveFetchNote: lmeForm.liveFetchNote,
            lmeAluminumUSD: lmeForm.lmeAluminumUSD,
            lmeBrassUSD: lmeForm.lmeBrassUSD,
            lmeCopperUSD: lmeForm.lmeCopperUSD,
            source: lmeForm.source,
          },
        }),
        method: 'POST',
      })
      setLmeForm(response.lmeConfig)
      await loadSalesPlan()
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'บันทึกค่า LME ไม่ได้')
    } finally {
      setIsSavingConfig(false)
    }
  }

  function resetPlanDraftForm() {
    setPlanDraftForm({
      channel: filterChannel || 'export',
      containers: '1',
      customerId: '',
      kgPerContainer: String(lmeForm?.kgPerContainer ?? data?.lmeConfig.kgPerContainer ?? 25000),
      lmeCf: String(lmeForm?.lmeCopperUSD ?? data?.lmeConfig.lmeCopperUSD ?? 0),
      productCode: '',
      sellPctLme: '',
    })
    setPlanDraftError(null)
  }

  function updateDraftProduct(productCode: string) {
    setPlanDraftForm((current) => ({ ...current, productCode }))
  }

  function updateDraftSellPct(value: string) {
    setPlanDraftForm((current) => ({ ...current, sellPctLme: value }))
  }

  function updateDraftLmeCf(value: string) {
    setPlanDraftForm((current) => ({ ...current, lmeCf: value }))
  }

  function removeLocalPlanRow(rowId: string) {
    setLocalPlanRows((rows) => rows.filter((row) => text(row.id) !== rowId))
  }

  function openPoSellForRow(rowId: string) {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams({ source: 'sales-plan', salesPlanRowId: rowId })
    window.location.assign(`/sales/po-sell?${params.toString()}`)
  }

  function openPlanForm() {
    resetPlanDraftForm()
    setIsPlanFormOpen(true)
  }

  function addDraftPlan() {
    if (!selectedDraftProduct) {
      setPlanDraftError('เลือกสินค้า')
      return
    }
    if (!selectedDraftCustomer) {
      setPlanDraftError('เลือกลูกค้า')
      return
    }
    if (draftContainers <= 0 || draftKgPerContainer <= 0) {
      setPlanDraftError('จำนวนตู้และ กก./ตู้ ต้องมากกว่า 0')
      return
    }
    if (draftSellPct <= 0) {
      setPlanDraftError('กรอก % LME มากกว่า 0')
      return
    }
    if (draftLmeCf <= 0) {
      setPlanDraftError('กรอก LME cf มากกว่า 0')
      return
    }

    const projectedProfit = draftTotalKg * (draftSellPrice - selectedDraftProduct.wac)
    const projectedMarginPct = draftSellPrice > 0 ? ((draftSellPrice - selectedDraftProduct.wac) / draftSellPrice) * 100 : 0
    setLocalPlanRows((rows) => [{
      channel: planDraftForm.channel,
      containers: draftContainers,
      customerId: selectedDraftCustomer.id,
      customerName: selectedDraftCustomer.name,
      fx: draftFx,
      id: `draft:${Date.now()}:${selectedDraftProduct.code}`,
      kgPerContainer: draftKgPerContainer,
      lme: draftLmeCf,
      metalGroup: selectedDraftProduct.metalGroup,
      productId: selectedDraftProduct.code,
      productName: selectedDraftProduct.name,
      projectedMarginPct,
      projectedProfit,
      sellPctLme: draftSellPct,
      sellPrice: draftSellPrice,
      status: 'Locked %',
      totalKg: draftTotalKg,
    }, ...rows])
    resetPlanDraftForm()
    setIsPlanFormOpen(false)
  }

  return (
    <section className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">LME Reference Pricing</h2>
            <p className="mt-1 text-sm text-slate-500">แก้ค่า LME, FX และ กก./ตู้ แล้วกดบันทึกเพื่อคำนวณ Sales Plan ใหม่</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isFetchingLive || isSavingConfig}
              onClick={handleFetchLive}
              type="button"
            >
              {isFetchingLive ? 'กำลังดึงข้อมูล' : 'Fetch Live'}
            </button>
            <button
              className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || isSavingConfig || !lmeForm}
              onClick={handleSaveConfig}
              type="button"
            >
              {isSavingConfig ? 'กำลังบันทึก' : 'บันทึกค่า'}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <LmeEditableField label="ทองแดง LME" suffix="USD/MT" value={lmeForm?.lmeCopperUSD ?? 0} onChange={(value) => updateLmeField('lmeCopperUSD', value)} />
          <LmeEditableField label="ทองเหลือง LME" suffix="USD/MT" value={lmeForm?.lmeBrassUSD ?? 0} onChange={(value) => updateLmeField('lmeBrassUSD', value)} />
          <LmeEditableField label="อลูมิเนียม LME" suffix="USD/MT" value={lmeForm?.lmeAluminumUSD ?? 0} onChange={(value) => updateLmeField('lmeAluminumUSD', value)} />
          <LmeEditableField label="USD/THB" value={lmeForm?.fxRate ?? 0} onChange={(value) => updateLmeField('fxRate', value)} />
          <LmeEditableField label="กก./ตู้" suffix="กก." value={lmeForm?.kgPerContainer ?? 0} onChange={(value) => updateLmeField('kgPerContainer', value)} />
        </div>
        <div className="mt-3 flex flex-col gap-1 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>อัปเดตล่าสุด {dateTime(lmeForm?.updatedAt)} โดย {text(lmeForm?.updatedBy)}</span>
          <span>source: {text(lmeForm?.source || data?.lmeConfig.source)}</span>
        </div>
        <div className="mt-2 text-xs text-slate-400">{text(lmeForm?.liveFetchNote || data?.lmeConfig.liveFetchNote)}</div>
        {formError ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{formError}</div> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm">
        <label className="text-xs font-bold text-slate-500">เดือน</label>
        <input className="h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        <select className="h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" value={filterGroup} onChange={(event) => setFilterGroup(event.target.value)}>
          <option value="">ทุกหมวด (ทองแดง+ทองเหลือง)</option>
          <option value="ทองแดง">🥉 ทองแดง เท่านั้น</option>
          <option value="ทองเหลือง">🌟 ทองเหลือง เท่านั้น</option>
        </select>
        <select className="h-9 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" value={filterChannel} onChange={(event) => setFilterChannel(event.target.value)}>
          <option value="">ทุกช่องทาง</option>
          <option value="export">🌍 ส่งออก</option>
          <option value="domestic">🇹🇭 ในประเทศ</option>
        </select>
        <span className="flex-1" />
        <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors outline-none focus:outline-none focus:ring-0 shadow-xs h-10 flex items-center justify-center" onClick={openPlanForm} type="button">+ เพิ่มแผน</button>
        <button className="flex h-9 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-emerald-700 outline-none focus:outline-none focus:ring-0" onClick={exportPlan} type="button">ส่งออก Excel</button>
      </div>
      {/* 1. Sales Plan Section */}
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 text-xs font-semibold text-slate-600">
          📝 ตารางวางแผน — เมื่อเพิ่มแผน ระบบจะล็อก % ที่ตกลงกับลูกค้าเป็น `Locked %` และเปิดไปหน้า PO Sell ได้ทันที
        </div>
        {/* Desktop view */}
        {planResize.hasCustomWidths ? (
          <div className="hidden justify-end px-4 pt-3 lg:flex">
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={planResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          </div>
        ) : null}
        <div className="hidden overflow-x-auto lg:block">
          <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: planResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
                    sortKey={column.key}
                    onSort={changePlanSort}
                    resizeProps={planResize.getResizeHandleProps(column.key, column.label)}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedPlanRows.map((row) => (
                <tr className="hover:bg-slate-50/50 transition-colors" key={text(row.id)}>
                  <td className="p-1.5"><select className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs bg-slate-50 outline-none" disabled value={text(row.productId)}><option>{text(row.productName) || '-เลือก-'}</option></select></td>
                  <td className="p-1.5"><select className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs bg-slate-50 outline-none" disabled value={text(row.channel)}><option>{text(row.channel) || 'ส่งออก'}</option></select></td>
                  <td className="p-1.5"><select className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs bg-slate-50 outline-none" disabled value={text(row.customerId)}><option>{text(row.customerName) || '-เลือก-'}</option></select></td>
                  <td className="p-1.5"><input className="w-full rounded-md border border-slate-200 px-2 py-1 text-right text-xs bg-slate-50 outline-none" disabled type="number" value={num(row.containers)} /></td>
                  <td className="p-1.5"><input className="w-full rounded-md border border-slate-200 px-2 py-1 text-right text-xs bg-slate-50 outline-none" disabled type="number" value={num(row.kgPerContainer)} /></td>
                  <td className="p-1.5 text-right font-semibold text-slate-800">{money(row.totalKg)}</td>
                  <td className="p-1.5"><input className="w-full rounded-md border border-amber-200 bg-amber-50/30 px-2 py-1 text-right text-xs font-bold text-amber-700 outline-none" disabled type="number" value={num(row.sellPctLme)} /></td>
                  <td className="p-1.5 text-right text-xs text-slate-400 font-medium">{money(row.lme)}</td>
                  <td className="p-1.5 text-right text-xs text-slate-400 font-medium">{money(row.fx)}</td>
                  <td className="bg-emerald-50/20 p-1.5 text-right font-bold text-emerald-600">{money(row.sellPrice)}</td>
                  <td className="p-1.5 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${text(row.status).toLowerCase().includes('lock') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{text(row.status) || 'Pending'}</span>
                      <button className="inline-flex h-8 items-center justify-center rounded-md bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700" onClick={() => openPoSellForRow(text(row.id))} type="button">+ เปิด PO ขาย</button>
                      {text(row.id).startsWith('draft:') ? <button className="text-xs font-semibold text-rose-500 hover:text-rose-600" onClick={() => removeLocalPlanRow(text(row.id))} type="button">ลบ</button> : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!sortedPlanRows.length ? <tr><td className="py-8 text-center text-slate-400 font-semibold" colSpan={salesPlanColumns.length}>ยังไม่มีรายการในเดือนนี้</td></tr> : null}
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
                <div className="flex items-center gap-2">
                  <span className={`rounded-md px-2.5 py-1 text-xs font-semibold ${text(row.status).toLowerCase().includes('lock') ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{text(row.status) || 'Pending'}</span>
                  <button className="inline-flex h-8 items-center justify-center rounded-md bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700" onClick={() => openPoSellForRow(text(row.id))} type="button">+ เปิด PO ขาย</button>
                </div>
              </div>
              {text(row.id).startsWith('draft:') ? <div className="pt-2"><button className="text-xs font-semibold text-rose-500 hover:text-rose-600" onClick={() => removeLocalPlanRow(text(row.id))} type="button">ลบรายการนี้</button></div> : null}
            </div>
          ))}
          {!sortedPlanRows.length ? <div className="text-center text-slate-400 py-4 font-semibold text-xs">ยังไม่มีรายการในเดือนนี้</div> : null}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
          <h3 className="font-bold text-slate-800 text-sm">📋 ตารางรอขาย</h3>
          <p className="mt-1 text-xs font-medium text-slate-500">เฉพาะทองแดง / ทองเหลือง · ของใน Cost Pool ที่ยังไม่ allocate</p>
          <p className="mt-2 text-xs text-slate-500">รอขายจริง = STOCK + PO ซื้อรอส่ง − ล๊อกขายรอส่ง ถ้าติดลบแปลว่าของจริงและของกำลังเข้าไม่พอกับยอดที่ล๊อกขาย</p>
        </div>
        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-slate-50/30 p-4 lg:grid-cols-5">
          <PendingStatCard label="💰 รอขาย (Cost Pool)" sublabel={`≈ ${money(pendingSaleTotals.totalPendingSaleValue)} ฿`} value={`${money(pendingSaleTotals.totalPendingSaleQty)} กก.`} />
          <PendingStatCard label="🔒 ล๊อกขายรอส่ง" sublabel="PO Sell (Open)" value={`${money(pendingSaleTotals.totalLockedSell)} กก.`} />
          <PendingStatCard label="📦 PO ซื้อรอส่ง" sublabel="PO Buy (Open)" value={`${money(pendingSaleTotals.totalLockedBuy)} กก.`} />
          <PendingStatCard label="🏷 STOCK" sublabel="ของจริงในคลัง" value={`${money(pendingSaleTotals.totalStock)} กก.`} />
          <PendingStatCard label="⚖ รอขายจริง (รวม)" sublabel={num(pendingSaleTotals.shortageCount) > 0 ? `ขาด ${money(pendingSaleTotals.shortageCount)} รายการ` : '✓ ครบทุกรายการ'} tone={num(pendingSaleTotals.totalRealPending) < 0 ? 'danger' : 'success'} value={`${money(pendingSaleTotals.totalRealPending)} กก.`} />
        </div>
        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">สินค้า</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">หมวด</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">รอขาย (กก.)</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">ต้นทุน Pool (฿/กก.)</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">ราคาขายดีที่สุด</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">% LME</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">กำไรคาดการณ์</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Margin %</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">ล๊อกขายรอส่ง</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">PO ซื้อรอส่ง</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">STOCK</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">รอขายจริง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingSaleRows.map((row) => {
                const shortage = num(row.realPendingSale) < 0
                const projectedProfit = num(row.projectedProfit)
                const projectedMarginPct = num(row.projectedMarginPct)
                return (
                  <tr className={`transition-colors hover:bg-slate-50/50 ${shortage ? 'bg-red-50/40' : ''}`} key={text(row.productId)}>
                    <td className="px-4 py-3"><div className="font-semibold text-slate-800">{text(row.productName)}</div><div className="font-mono text-xs font-semibold text-slate-400">{text(row.productCode)}</div></td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-500">{text(row.metalGroup)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">{money(row.pendingSaleQty)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{money(row.avgPrice)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-amber-700">{num(row.bestPlanPrice) > 0 ? money(row.bestPlanPrice) : '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{num(row.bestPlanPct) > 0 ? `${money(row.bestPlanPct)}%` : '-'}</td>
                    <td className={`px-4 py-3 text-right font-bold ${projectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{num(row.bestPlanPrice) > 0 ? money(projectedProfit) : '-'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${projectedMarginPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{num(row.bestPlanPrice) > 0 ? `${money(projectedMarginPct)}%` : '-'}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{money(row.lockedSell)}</td>
                    <td className="px-4 py-3 text-right text-blue-700">{money(row.lockedBuy)}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{money(row.stock)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${shortage ? 'text-red-600' : 'text-emerald-600'}`}>{money(row.realPendingSale)}</td>
                  </tr>
                )
              })}
              {!pendingSaleRows.length ? <tr><td className="px-4 py-8 text-center text-xs font-semibold text-slate-400" colSpan={12}>ยังไม่มีข้อมูล ทองแดง / ทองเหลือง — เมื่อมี PO Buy / บิลซื้อ / PO Sell ระบบจะคำนวณให้อัตโนมัติ</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 bg-slate-50/20 p-4 lg:hidden">
          {pendingSaleRows.map((row) => {
            const shortage = num(row.realPendingSale) < 0
            const projectedProfit = num(row.projectedProfit)
            const projectedMarginPct = num(row.projectedMarginPct)
            return (
              <div key={text(row.productId)} className={`rounded-xl border p-4 shadow-sm ${shortage ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{text(row.productName)}</div>
                    <div className="font-mono text-xs font-semibold text-slate-400">{text(row.productCode)}</div>
                  </div>
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{text(row.metalGroup)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div><span className="mb-0.5 block text-slate-400 font-medium">รอขาย / ต้นทุน Pool</span><span className="font-semibold text-slate-800">{money(row.pendingSaleQty)} กก. / {money(row.avgPrice)} ฿</span></div>
                  <div><span className="mb-0.5 block text-slate-400 font-medium">ราคาขาย / % LME</span><span className="font-semibold text-amber-700">{num(row.bestPlanPrice) > 0 ? money(row.bestPlanPrice) : '-'} / {num(row.bestPlanPct) > 0 ? `${money(row.bestPlanPct)}%` : '-'}</span></div>
                  <div><span className="mb-0.5 block text-slate-400 font-medium">กำไรคาดการณ์ / Margin</span><span className={`font-semibold ${projectedProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{num(row.bestPlanPrice) > 0 ? money(projectedProfit) : '-'} / {num(row.bestPlanPrice) > 0 ? `${money(projectedMarginPct)}%` : '-'}</span></div>
                  <div><span className="mb-0.5 block text-slate-400 font-medium">ล๊อกขาย / PO ซื้อ</span><span className="font-semibold text-slate-800">{money(row.lockedSell)} / {money(row.lockedBuy)} กก.</span></div>
                  <div><span className="mb-0.5 block text-slate-400 font-medium">STOCK</span><span className="font-semibold text-slate-800">{money(row.stock)} กก.</span></div>
                  <div><span className="mb-0.5 block text-slate-400 font-medium">รอขายจริง</span><span className={`font-bold ${shortage ? 'text-red-600' : 'text-emerald-600'}`}>{money(row.realPendingSale)} กก.</span></div>
                </div>
              </div>
            )
          })}
          {!pendingSaleRows.length ? <div className="py-4 text-center text-xs font-semibold text-slate-400">ยังไม่มีข้อมูล ทองแดง / ทองเหลือง — เมื่อมี PO Buy / บิลซื้อ / PO Sell ระบบจะคำนวณให้อัตโนมัติ</div> : null}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              <button
                className={`h-10 rounded-md px-4 text-sm font-semibold transition-colors ${insightTab === 'analysis' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                onClick={() => setInsightTab('analysis')}
                type="button"
              >
                📊 วิเคราะห์แผนขาย vs สต๊อกว่างขาย
              </button>
              <button
                className={`h-10 rounded-md px-4 text-sm font-semibold transition-colors ${insightTab === 'remaining' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                onClick={() => setInsightTab('remaining')}
                type="button"
              >
                📦 สต๊อกว่างขายคงเหลือ
              </button>
            </div>
            {insightTab === 'remaining' ? (
              <div className="text-xs flex items-center gap-1.5">
                <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-slate-700 font-bold">รวม {money(remainingKgTotal)} กก.</span>
                <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-emerald-700 font-bold border border-emerald-100">มูลค่า WAC {money(remainingValueTotal)}</span>
              </div>
            ) : null}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            {insightTab === 'analysis'
              ? 'ผู้บริหารใช้ดูความคุ้มค่าของแผนขายเทียบกับสต๊อกที่ยังว่างให้ขาย'
              : `สต๊อกว่างขาย คงเหลือหลังหักล็อกราคา — เดือน ${(month || data?.filters.month) ?? ''}`}
          </div>
        </div>

        {insightTab === 'analysis' ? (
          <>
            {analysisResize.hasCustomWidths ? (
              <div className="hidden justify-end px-4 pt-3 lg:flex">
                <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={analysisResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
              </div>
            ) : null}
            <div className="hidden overflow-x-auto lg:block">
              <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: analysisResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
          </>
        ) : (
          <>
            {remainingResize.hasCustomWidths ? (
              <div className="hidden justify-end px-4 pt-3 lg:flex">
                <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={remainingResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
              </div>
            ) : null}
            <div className="hidden overflow-x-auto lg:block">
              <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: remainingResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
          </>
        )}
      </div>

      {error ? <ErrorBox text={error} /> : null}

      <Dialog open={isPlanFormOpen} onOpenChange={(open) => {
        setIsPlanFormOpen(open)
        if (!open) setPlanDraftError(null)
      }}>
        <DialogContent aria-labelledby="sales-plan-draft-title" className="max-h-[90vh] max-w-6xl overflow-hidden rounded-md border-0 bg-slate-900 !p-0 shadow-2xl outline-none focus:outline-none flex flex-col" hideClose>
          <DialogHeader className="shrink-0 rounded-t-md bg-slate-900 px-5 py-4 text-white">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <DialogTitle id="sales-plan-draft-title" className="truncate text-white">+ เพิ่มแผนขาย</DialogTitle>
                <DialogDescription className="text-slate-300">
                  บันทึกเป็น draft บนหน้าจอก่อน เพื่อเริ่มวางแผนและเห็นตัวเลขในตารางได้ทันที
                </DialogDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="h-9 rounded-md border border-slate-700 bg-slate-800 px-4 text-sm font-semibold text-white hover:bg-slate-700" onClick={resetPlanDraftForm} type="button">ล้างฟอร์ม</button>
                <button className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700" onClick={() => setIsPlanFormOpen(false)} type="button">ยกเลิก</button>
                <button className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700" onClick={addDraftPlan} type="button">เพิ่มเข้าตาราง</button>
              </div>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto bg-slate-50 p-5">
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-bold text-slate-700">1</div>
                  <div className="text-sm font-bold text-slate-800">ข้อมูลแผนขาย</div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SearchCombobox
                    inputClassName="h-10 border-slate-300 bg-white text-sm font-medium text-slate-700"
                    inputId="sales-plan-draft-product"
                    label="สินค้า *"
                    options={productSearchOptions}
                    placeholder="ค้นหารหัสหรือชื่อสินค้า"
                    value={planDraftForm.productCode}
                    onChange={updateDraftProduct}
                  />
                  <label className="text-xs font-bold text-slate-600">
                    <span className="mb-1 block">ช่องทาง *</span>
                    <select className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" value={planDraftForm.channel} onChange={(event) => setPlanDraftForm((current) => ({ ...current, channel: event.target.value }))}>
                      {data?.filters.channels.map((channel) => (
                        <option key={channel.id} value={channel.id}>{channel.name}</option>
                      ))}
                    </select>
                  </label>
                  <SearchCombobox
                    inputClassName="h-10 border-slate-300 bg-white text-sm font-medium text-slate-700"
                    inputId="sales-plan-draft-customer"
                    label="ลูกค้า *"
                    options={customerSearchOptions}
                    placeholder="ค้นหารหัสหรือชื่อลูกค้า"
                    value={planDraftForm.customerId}
                    onChange={(value) => setPlanDraftForm((current) => ({ ...current, customerId: value }))}
                  />
                  <label className="text-xs font-bold text-slate-600">
                    <span className="mb-1 block">จำนวนตู้ *</span>
                    <input className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-right text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" min="0" onChange={(event) => setPlanDraftForm((current) => ({ ...current, containers: event.target.value }))} type="number" value={planDraftForm.containers} />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    <span className="mb-1 block">กก./ตู้ *</span>
                    <input className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-right text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" min="0" onChange={(event) => setPlanDraftForm((current) => ({ ...current, kgPerContainer: event.target.value }))} type="number" value={planDraftForm.kgPerContainer} />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    <span className="mb-1 block">% LME *</span>
                    <input className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-right text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" min="0" onChange={(event) => updateDraftSellPct(event.target.value)} type="number" value={planDraftForm.sellPctLme} />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    <span className="mb-1 block">LME cf (USD/MT) *</span>
                    <input className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-right text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200" min="0" onChange={(event) => updateDraftLmeCf(event.target.value)} type="number" value={planDraftForm.lmeCf} />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-sm font-bold text-slate-700">2</div>
                  <div className="text-sm font-bold text-slate-800">ผลคำนวณแผนขาย</div>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <PendingStatCard label="หมวด" sublabel="อิงจากสินค้า" value={selectedDraftProduct?.metalGroup || '-'} />
                  <PendingStatCard label="รวม กก." sublabel="ตู้ x กก./ตู้" value={`${money(draftTotalKg)} กก.`} />
                  <PendingStatCard label="LME base / FX" sublabel={`${money(draftBaseLme)} USD/MT`} value={money(draftFx)} />
                  <PendingStatCard label="% LME / LME cf" sublabel={`${money(draftLmeCf)} USD/MT`} value={`${money(draftSellPct)}%`} />
                  <PendingStatCard label="ราคา THB/kg" sublabel="คำนวณจาก LME cf x FX x %" value={money(draftSellPrice)} />
                </div>
                {planDraftError ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{planDraftError}</div> : null}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function Select({ onChange, options, value }: { onChange: (value: string) => void; options: { id: string; name: string }[]; value: string }) {
  return (
    <select
      className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none select h-10 transition-all focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
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

function PendingStatCard({ label, sublabel, tone = 'neutral', value }: { label: string; sublabel: string; tone?: 'danger' | 'neutral' | 'success'; value: string }) {
  const toneClass = tone === 'danger'
    ? 'bg-red-50 text-red-600 border-red-100'
    : tone === 'success'
      ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
      : 'bg-white text-slate-700 border-slate-200'

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      <div className="mt-1 text-xs font-medium opacity-80">{sublabel}</div>
    </div>
  )
}

export function SalesCommissionPageClient() {
  const latestLoadRequestRef = useRef(0)
  const [from, setFrom] = useState(() => currentMonthDateRange().from)
  const [to, setTo] = useState(() => currentMonthDateRange().to)
  const [branchId, setBranchId] = useState('')
  const [selectedSales, setSelectedSales] = useState('')
  const [data, setData] = useState<CommissionPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showCommissionMobileFilters, setShowCommissionMobileFilters] = useState(false)
  const [detailTab, setDetailTab] = useState<CommissionDetailTab>('categoryTotal')

  // Filters for tables in drilldown or overview
  const [summarySalesFilter, setSummarySalesFilter] = useState('ALL')
  const [summaryPage, setSummaryPage] = useState(1)
  const [summaryPageSize, setSummaryPageSize] = useState<DetailPageSize>(10)
  const [table1Search, setTable1Search] = useState('')
  const [table1Page, setTable1Page] = useState(1)
  const [table1PageSize, setTable1PageSize] = useState<DetailPageSize>(10)
  const [table2Search, setTable2Search] = useState('')
  const [table2Page, setTable2Page] = useState(1)
  const [table2PageSize, setTable2PageSize] = useState<DetailPageSize>(10)
  const [table3Search, setTable3Search] = useState('')
  const [table3Page, setTable3Page] = useState(1)
  const [table3PageSize, setTable3PageSize] = useState<DetailPageSize>(10)
  const [table4Page, setTable4Page] = useState(1)
  const [table4PageSize, setTable4PageSize] = useState<DetailPageSize>(10)
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
  const [table4CommissionFilter, setTable4CommissionFilter] = useState<CommissionStatusFilter>('all')
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
  const table1FilteredData = useMemo(() => {
    const query = normalizeSearch(table1Search)
    if (!query) return table1Data
    return table1Data.filter((row) => row.category.toLowerCase().includes(query))
  }, [table1Data, table1Search])
  const table2FilteredData = useMemo(() => {
    const query = normalizeSearch(table2Search)
    if (!query) return table2Data
    return table2Data.filter((row) => row.category.toLowerCase().includes(query))
  }, [table2Data, table2Search])
  const sortedTable1Data = useMemo(() => sortedByKey(table1FilteredData, table1SortKey, table1SortDir, (row, key) => row[key]), [table1FilteredData, table1SortDir, table1SortKey])
  const sortedTable2Data = useMemo(() => sortedByKey(table2FilteredData, table2SortKey, table2SortDir, (row, key) => row[key]), [table2FilteredData, table2SortDir, table2SortKey])

  // Supplier drilldown rows.
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
  const table3FilteredData = useMemo(() => {
    const query = normalizeSearch(table3Search)
    if (!query) return table3Data
    return table3Data.filter((row) => row.supplier.toLowerCase().includes(query))
  }, [table3Data, table3Search])

  // Item drilldown rows.
  const table4FilteredData = useMemo(() => {
    const searchLower = table4Search.trim().toLowerCase()
    return billRows.filter((row) => {
      if (table4CommissionFilter === 'commissionable' && !row.isCommissionable) return false
      if (table4CommissionFilter === 'nonCommissionable' && row.isCommissionable) return false
      if (!searchLower) return true
      return (
        text(row.docNo).toLowerCase().includes(searchLower) ||
        text(row.supplierName).toLowerCase().includes(searchLower) ||
        text(row.productName).toLowerCase().includes(searchLower)
      )
    })
  }, [billRows, table4CommissionFilter, table4Search])
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
  const pagedSummaryRows = useMemo(() => pagedRows(summaryFlatRows, summaryPage, summaryPageSize), [summaryFlatRows, summaryPage, summaryPageSize])

  // Helper for item-detail export.
  const handleDownloadCsv = () => {
    if (!sales) return
    const headers = ['วันที่', 'เลขที่บิล', 'ผู้ขาย', 'สินค้า', 'น้ำหนัก (กก.)', 'ราคาซื้อ/กก.', 'ราคาหน้าใบ', 'ส่วนต่างกำไร', 'ยอดรวม (บาท)', 'สถานะค่าคอม']
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

  const handleDownloadSummaryCsv = () => {
    downloadCsv(
      `sales_commission_summary_${from || 'all'}_${to || 'all'}.csv`,
      ['พนักงานขาย', 'ประเภท / หมวดสินค้า', 'ยอดซื้อ (กก.)', 'ยอดรับซื้อ (บาท)'],
      summaryFlatRows.map((row) => [row.salesName, row.category, money(row.qty), money(row.amount)]),
    )
  }

  function resetCommissionFilters() {
    const range = currentMonthDateRange()
    setFrom(range.from)
    setTo(range.to)
    setBranchId('')
    setSummarySalesFilter('ALL')
    setSummaryPage(1)
  }

  function openSalesDetail(salesId: string) {
    setSelectedSales(salesId)
    setDetailTab('categoryTotal')
    requestAnimationFrame(() => {
      window.scrollTo({ behavior: 'smooth', top: 0 })
    })
  }

  function closeSalesDetail() {
    setSelectedSales('')
    setTable1Search('')
    setTable1Page(1)
    setTable2Search('')
    setTable2Page(1)
    setTable3Search('')
    setTable3Page(1)
    setTable4CommissionFilter('all')
    setTable4Page(1)
    setTable4Search('')
    setDetailTab('categoryTotal')
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
    // Sort supplier rows.
    const sortedTable3 = [...table3FilteredData].sort((a, b) => {
      const result = compareSortValues(a[table3Sort], b[table3Sort])
      return table3SortDir === 'asc' ? result : -result
    })

    const pagedTable1 = pagedRows(sortedTable1Data, table1Page, table1PageSize)
    const pagedTable2 = pagedRows(sortedTable2Data, table2Page, table2PageSize)
    const pagedTable3 = pagedRows(sortedTable3, table3Page, table3PageSize)
    const pagedTable4 = pagedRows(sortedTable4Data, table4Page, table4PageSize)
    const table1Total = sortedTable1Data.reduce((sum, row) => ({ amount: sum.amount + row.amount, qty: sum.qty + row.qty }), { amount: 0, qty: 0 })
    const table2Total = sortedTable2Data.reduce((sum, row) => ({ amount: sum.amount + row.amount, qty: sum.qty + row.qty }), { amount: 0, qty: 0 })
    const table3Total = sortedTable3.reduce((sum, row) => ({ amount: sum.amount + row.amount, bills: sum.bills + row.bills, qty: sum.qty + row.qty }), { amount: 0, bills: 0, qty: 0 })
    const table3TotalPct = sales.purchaseAmt ? (table3Total.amount / sales.purchaseAmt) * 100 : 0

    return (
      <section className="space-y-4 text-[13.5px]">
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 shadow-xs outline-none transition-colors hover:bg-slate-50 hover:text-slate-900"
          type="button"
          onClick={closeSalesDetail}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          กลับหน้าหลัก
        </button>

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
              className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white shadow-xs outline-none transition-colors hover:bg-emerald-700"
              type="button"
            >
              <Download className="size-4" aria-hidden="true" />
              ส่งออก Excel
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="จำนวนบิลรับซื้อ" value={`${money(sales.billCount)} บิล`} tone="blue" />
          <Metric label="น้ำหนักรวม" value={`${money(sales.qty)} กก.`} tone="amber" />
          <Metric label="ยอดรับซื้อรวม" value={`${money(sales.purchaseAmt)} บาท`} tone="blue" />
          <Metric label="ค่าคอมเดือนนี้" value={`${money(sales.commission)} บาท`} tone={sales.commission > 0 ? 'amber' : 'slate'} />
          <Metric label="จำนวนที่ได้คอม" value={`${money(sales.commissionableQty)} กก.`} tone="emerald" />
          <Metric label="ยอดซื้อที่ได้คอม" value={`${money(sales.commissionableAmount)} บาท`} tone="emerald" />
          <Metric label="จำนวนที่ไม่ได้คอม" value={`${money(sales.nonCommissionableQty)} กก.`} tone="slate" />
          <Metric label="ยอดซื้อที่ไม่ได้คอม" value={`${money(sales.nonCommissionableAmount)} บาท`} tone="slate" />
        </div>

        <Tabs className="gap-3" value={detailTab} onValueChange={(value) => setDetailTab(value as CommissionDetailTab)}>
          <TabsList className="w-full min-w-0 overflow-x-auto" variant="line">
            <TabsTrigger value="categoryTotal" variant="line">ยอดรวมตามหมวด</TabsTrigger>
            <TabsTrigger value="categoryCommission" variant="line">ยอดได้คอม</TabsTrigger>
            <TabsTrigger value="supplier" variant="line">ผู้ขาย</TabsTrigger>
            <TabsTrigger value="items" variant="line">รายการสินค้า</TabsTrigger>
          </TabsList>

          <TabsContent value="categoryTotal" className="space-y-4">
            <Panel title="ยอดซื้อรวมตามหมวดสินค้า">
              <TableToolbar reset={table1Resize.hasCustomWidths ? <ResetTableButton onClick={table1Resize.resetColumnWidths} /> : null}>
                <TableSearchInput
                  label="ค้นหาหมวดสินค้า"
                  placeholder="ค้นหาหมวดสินค้า..."
                  value={table1Search}
                  onChange={(value) => {
                    setTable1Search(value)
                    setTable1Page(1)
                  }}
                />
              </TableToolbar>
              <div className="mb-3">
                <TablePagination
                  page={table1Page}
                  pageSize={table1PageSize}
                  totalRows={sortedTable1Data.length}
                  onPageChange={setTable1Page}
                  onPageSizeChange={setTable1PageSize}
                />
              </div>
              <div className="mb-3 overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
                <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: table1Resize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
                    {pagedTable1.map((row) => (
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
                        <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(table1Total.qty)}</td>
                        <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(table1Total.amount)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="categoryCommission" className="space-y-4">
            <Panel title="ยอดซื้อที่ได้ค่าคอมตามหมวดสินค้า">
              <TableToolbar reset={table2Resize.hasCustomWidths ? <ResetTableButton onClick={table2Resize.resetColumnWidths} /> : null}>
                <TableSearchInput
                  label="ค้นหาหมวดสินค้าที่ได้ค่าคอม"
                  placeholder="ค้นหาหมวดสินค้า..."
                  value={table2Search}
                  onChange={(value) => {
                    setTable2Search(value)
                    setTable2Page(1)
                  }}
                />
              </TableToolbar>
              <div className="mb-3">
                <TablePagination
                  page={table2Page}
                  pageSize={table2PageSize}
                  totalRows={sortedTable2Data.length}
                  onPageChange={setTable2Page}
                  onPageSizeChange={setTable2PageSize}
                />
              </div>
              <div className="mb-3 overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm">
                <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: table2Resize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
                    {pagedTable2.map((row) => (
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
                        <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(table2Total.qty)}</td>
                        <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(table2Total.amount)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          </TabsContent>

          <TabsContent value="supplier" className="space-y-4">
            <Panel title="ผู้ขายในความดูแล">
          <TableToolbar reset={table3Resize.hasCustomWidths ? <ResetTableButton onClick={table3Resize.resetColumnWidths} /> : null}>
            <TableSearchInput
              label="ค้นหาผู้ขาย"
              placeholder="ค้นหาผู้ขาย..."
              value={table3Search}
              onChange={(value) => {
                setTable3Search(value)
                setTable3Page(1)
              }}
            />
          </TableToolbar>
          <div className="mb-3">
            <TablePagination
              page={table3Page}
              pageSize={table3PageSize}
              totalRows={sortedTable3.length}
              onPageChange={setTable3Page}
              onPageSizeChange={setTable3PageSize}
            />
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm mb-3">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: table3Resize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
                    <td className="py-8 text-center text-slate-400 font-semibold" colSpan={commissionSupplierColumns.length}>ไม่มีข้อมูลผู้ขาย</td>
                  </tr>
                ) : (
                  <tr className="bg-slate-50/55 font-bold">
                    <td className="p-3 text-slate-800">รวมทั้งหมด</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-800">
                      {table3Total.bills}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(table3Total.qty)}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-800">{money(table3Total.amount)}</td>
                    <td className="p-3 text-right font-mono tabular-nums text-slate-800">{table3TotalPct.toFixed(2)}%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
            </Panel>
          </TabsContent>

          <TabsContent value="items" className="space-y-4">
            <Panel title="รายการสินค้าละเอียด">
          <TableToolbar reset={table4Resize.hasCustomWidths ? <ResetTableButton onClick={table4Resize.resetColumnWidths} /> : null}>
            <TableSearchInput
              label="ค้นหารายการสินค้า"
              placeholder="ค้นหาเลขที่บิล, ผู้ขาย, สินค้า..."
              value={table4Search}
              onChange={(value) => {
                setTable4Search(value)
                setTable4Page(1)
              }}
            />
            <CommissionStatusFilterSegments
              value={table4CommissionFilter}
              onChange={(value) => {
                setTable4CommissionFilter(value)
                setTable4Page(1)
              }}
            />
          </TableToolbar>
          <div className="mb-3">
            <TablePagination
              page={table4Page}
              pageSize={table4PageSize}
              totalRows={sortedTable4Data.length}
              onPageChange={setTable4Page}
              onPageSizeChange={setTable4PageSize}
            />
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm mb-3">
            <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: table4Resize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
            </Panel>
          </TabsContent>
        </Tabs>
      </section>
    )
  }

  // 1. Overview Page State
  return (
    <section className="space-y-4 text-[13.5px]">
      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-500">ช่วงวันที่</div>
            <div className="truncate text-sm font-semibold text-slate-900">{formatDateDisplay(from)} - {formatDateDisplay(to)}</div>
          </div>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-slate-200"
            type="button"
            onClick={() => setShowCommissionMobileFilters(true)}
          >
            ตัวกรอง{branchId ? ' (มี)' : ''}
          </button>
        </div>
      </div>

      <div className="hidden rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm lg:block">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(180px,220px)_minmax(180px,220px)_minmax(180px,260px)]">
            <Field label="ช่วงวันที่">
              <DatePickerInput className="mt-1 w-full" value={from} onChange={setFrom} />
            </Field>
            <Field label="ถึงวันที่">
              <DatePickerInput className="mt-1 w-full" value={to} onChange={setTo} />
            </Field>
            <Field label="สาขา">
              <Select
                options={data?.filters.branches ?? []}
                value={branchId}
                onChange={setBranchId}
              />
            </Field>
          </div>
          <div className="flex h-9 items-center gap-2">
            {isLoading ? (
              <span className="text-xs font-semibold text-slate-400">กำลังโหลดข้อมูล...</span>
            ) : null}
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 focus:ring-2 focus:ring-slate-200"
              type="button"
              onClick={resetCommissionFilters}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              รีเซ็ตตัวกรอง
            </button>
          </div>
        </div>
      </div>

      {showCommissionMobileFilters ? (
        <MobileFilterSheet
          title="ตัวกรอง Sales Tracking"
          onClose={() => setShowCommissionMobileFilters(false)}
          footer={(
            <>
              <button className="h-10 rounded-md border border-slate-300 bg-white text-sm font-semibold text-slate-700" type="button" onClick={resetCommissionFilters}>ล้าง</button>
              <button className="h-10 rounded-md bg-blue-600 text-sm font-semibold text-white" type="button" onClick={() => setShowCommissionMobileFilters(false)}>ปิด</button>
            </>
          )}
        >
          <div className="space-y-4">
            <Field label="จากวันที่">
              <DatePickerInput className="mt-1 w-full" value={from} onChange={setFrom} />
            </Field>
            <Field label="ถึงวันที่">
              <DatePickerInput className="mt-1 w-full" value={to} onChange={setTo} />
            </Field>
            <Field label="สาขา">
              <Select options={data?.filters.branches ?? []} value={branchId} onChange={setBranchId} />
            </Field>
          </div>
        </MobileFilterSheet>
      ) : null}

      {/* Summary Metrics Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="จำนวนที่ซื้อ" value={`${money(data?.totals.qty)} กก.`} tone="orange" />
        <Metric label="ยอดซื้อ" value={`${money(data?.totals.amount)} บ.`} tone="blue" />
        <Metric label="จำนวนที่ได้คอม" value={`${money(data?.totals.commissionableQty)} กก.`} tone="emerald" />
        <Metric label="ยอดซื้อที่ได้คอม" value={`${money(data?.totals.commissionableAmount)} บ.`} tone="emerald" />
        <Metric label="จำนวนที่ไม่ได้คอม" value={`${money(data?.totals.nonCommissionableQty)} กก.`} tone="slate" />
        <Metric label="ยอดซื้อที่ไม่ได้คอม" value={`${money(data?.totals.nonCommissionableAmount)} บ.`} tone="slate" />
        <Metric label="จำนวนซื้อทั้งปี" value={`${money(data?.totals.annualQty)} กก.`} tone="orange" />
        <Metric label="ยอดซื้อทั้งปี" value={`${money(data?.totals.annualAmount)} บ.`} tone="blue" />
      </div>

      {/* Grid of Salesperson Cards */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">สรุปยอดตามพนักงานขาย</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(data?.salesRows ?? []).map((row) => (
            <button
              key={text(row.id)}
              className="group flex min-h-[340px] flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50/60 focus:ring-2 focus:ring-blue-100"
              type="button"
              onClick={() => openSalesDetail(text(row.id))}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 pr-2">
                  <div className="truncate text-xl font-black leading-tight text-slate-950">{text(row.name)}</div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-500">
                    {text(row.code) || '-'} · {text(row.phone) || '-'}
                  </div>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${row.commissionEligible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {row.commissionEligible ? 'ได้คอม' : 'ไม่ได้คอม'}
                </span>
              </div>

              <div className="mt-4 grid flex-1 grid-cols-2 gap-3">
                <SalesCardMetric align="center" label="บิล" tone="slate" value={money(row.billCount)} />
                <SalesCardMetric align="center" label="Supplier" tone="slate" value={money(row.supplierCount)} />
                <SalesCardMetric label="น้ำหนักรับซื้อ" tone="amber" value={`${money(row.qty)} กก.`} />
                <SalesCardMetric label="น้ำหนักที่ได้คอม" tone="emerald" value={`${money(row.commissionableQty)} กก.`} />
                <SalesCardMetric label="ยอดรับซื้อรวม" tone="blue" value={`${money(row.purchaseAmt)} บ.`} />
                <SalesCardMetric label="ยอดซื้อที่ได้คอม" tone="emerald" value={`${money(row.commissionableAmount)} บ.`} />
                <SalesCardMetric className="col-span-2" label="ค่าคอมเดือนนี้" tone={row.commission > 0 ? 'amber' : 'slate'} value={`${money(row.commission)} บ.`} />
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 text-right text-sm font-bold text-blue-600 transition group-hover:text-blue-700">
                คลิกเพื่อดูรายละเอียด →
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Sales Summary / สรุปยอดซื้อราย Sales */}
      <CommissionOverviewPanel title="สรุปยอดจัดการ Sales">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-bold text-slate-500">เลือกดูพนักงานขาย</label>
          <select
            className="border border-slate-200 rounded-md px-3 py-2 text-xs bg-white font-semibold text-slate-700 h-9 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all cursor-pointer"
            value={summarySalesFilter}
            onChange={(e) => {
              setSummarySalesFilter(e.target.value)
              setSummaryPage(1)
            }}
          >
            <option value="ALL">ทุก Sales</option>
            {(data?.salesRows ?? []).map((sale) => (
              <option key={text(sale.id)} value={text(sale.id)}>{text(sale.name)}</option>
            ))}
          </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {summaryResize.hasCustomWidths ? <ResetTableButton onClick={summaryResize.resetColumnWidths} /> : null}
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white outline-none transition hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-200"
              type="button"
              onClick={handleDownloadSummaryCsv}
            >
              <Download className="size-4" aria-hidden="true" />
              ส่งออก Excel
            </button>
          </div>
        </div>

        <div className="mb-3">
          <TablePagination
            page={summaryPage}
            pageSize={summaryPageSize}
            totalRows={summaryFlatRows.length}
            onPageChange={setSummaryPage}
            onPageSizeChange={setSummaryPageSize}
          />
        </div>
        <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
          <table className="ns-table min-w-full divide-y divide-slate-200 text-sm" style={{ minWidth: summaryResize.tableMinWidth, tableLayout: 'fixed', width: '100%' }}>
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
              {pagedSummaryRows.map((row) => (
                <tr key={`${row.salesId}-${row.category}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold text-slate-800">
                    <button
                      className="text-blue-600 hover:text-blue-800 hover:underline outline-none text-left font-bold"
                      type="button"
                      onClick={() => openSalesDetail(row.salesId)}
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
        <div className="space-y-3 lg:hidden">
          {pagedSummaryRows.map((row) => (
            <button
              key={`${row.salesId}-${row.category}`}
              className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm active:bg-slate-50"
              type="button"
              onClick={() => openSalesDetail(row.salesId)}
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-slate-900">{row.salesName}</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-500">{row.category}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Mini label="จำนวน" value={money(row.qty)} />
                <Mini label="ยอดซื้อ" value={money(row.amount)} />
              </div>
            </button>
          ))}
          {summaryFlatRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm font-semibold text-slate-400">ไม่มีข้อมูล</div>
          ) : null}
        </div>
      </CommissionOverviewPanel>

      {error ? <ErrorBox text={error} /> : null}
    </section>
  )
}

function SimpleTable({ empty = 'ไม่มีข้อมูล', headers, rowClick, rows }: { empty?: string; headers: string[]; rowClick?: (index: number) => void; rows: string[][] }) {
  return (
    <div>
      {/* Desktop View Table */}
      <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
        <table className="ns-table w-full text-xs">
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

function TableSearchInput({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string
  onChange: (value: string) => void
  placeholder: string
  value: string
}) {
  return (
    <label className="relative block min-w-[260px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        aria-label={label}
        className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 pl-9 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function ResetTableButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="hidden h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 lg:inline-flex lg:items-center"
      type="button"
      onClick={onClick}
    >
      คืนค่าเดิมตาราง
    </button>
  )
}

function TablePagination({
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  totalRows,
}: {
  onPageChange: (value: number) => void
  onPageSizeChange: (value: DetailPageSize) => void
  page: number
  pageSize: DetailPageSize
  totalRows: number
}) {
  const totalPages = totalPagesFor(totalRows, pageSize)
  const safePage = safePageFor(page, totalRows, pageSize)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-1 text-sm text-slate-600">
      <div>พบทั้งหมด {totalRows.toLocaleString('th-TH')} รายการ</div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="จำนวนรายการต่อหน้า"
          className="h-9 w-auto rounded-md border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-700 outline-none transition focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
          value={pageSize}
          onChange={(event) => {
            onPageSizeChange(Number(event.target.value) as DetailPageSize)
            onPageChange(1)
          }}
        >
          {detailPageSizeOptions.map((option) => (
            <option key={option} value={option}>{option} / หน้า</option>
          ))}
        </select>
        <button
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={safePage <= 1}
          type="button"
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          ก่อนหน้า
        </button>
        <span className="px-1">หน้า {safePage} / {totalPages}</span>
        <button
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={safePage >= totalPages}
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
        >
          ถัดไป
        </button>
      </div>
    </div>
  )
}

function TableToolbar({
  children,
  reset,
}: {
  children: ReactNode
  reset?: ReactNode
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
      {reset ? <div className="ml-auto flex items-center gap-2">{reset}</div> : null}
    </div>
  )
}

function CommissionStatusFilterSegments({
  onChange,
  value,
}: {
  onChange: (value: CommissionStatusFilter) => void
  value: CommissionStatusFilter
}) {
  const options: Array<{ label: string; value: CommissionStatusFilter }> = [
    { label: 'ทั้งหมด', value: 'all' },
    { label: 'ได้คอม', value: 'commissionable' },
    { label: 'ไม่ได้คอม', value: 'nonCommissionable' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">สถานะค่าคอม:</span>
      {options.map((option) => (
        <button
          key={option.value}
          className={`rounded-md border px-3 py-1 text-xs font-medium ${value === option.value ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white hover:bg-slate-50'}`}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-white px-4 py-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function CommissionOverviewPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function LmeEditableField({ label, onChange, suffix, value }: { label: string; onChange: (value: string) => void; suffix?: string; value: number }) {
  return (
    <label className="block rounded-md border border-slate-200 bg-slate-50 p-3">
      <span className="mb-2 block text-xs font-bold text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <input
          className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-right text-sm font-semibold text-slate-800 outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-200"
          min={0}
          onChange={(event) => onChange(event.target.value)}
          step="0.01"
          type="number"
          value={Number.isFinite(value) ? value : 0}
        />
        {suffix ? <span className="w-14 text-xs font-semibold text-slate-400">{suffix}</span> : null}
      </div>
    </label>
  )
}

function Metric({ icon, label, tone, value }: { icon?: ReactNode; label: string; tone: KpiCardTone; value: string }) {
  return <SharedKpiCard icon={icon} label={label} tone={tone} value={value} />
}

function BigCard({ label, tone, value }: { label: string; tone: string; value: string }) {
  const isWeight = label.includes('น้ำหนัก')
  const emoji = isWeight ? '📦' : '💰'
  return <SharedKpiCard className="w-full" icon={emoji} label={label} tone={(isWeight ? 'amber' : tone || 'blue') as KpiCardTone} value={value} />
}

function SalesCardMetric({
  align = 'left',
  className = '',
  label,
  tone,
  value,
}: {
  align?: 'center' | 'left'
  className?: string
  label: string
  tone: 'amber' | 'blue' | 'emerald' | 'slate'
  value: string
}) {
  const labelColors = {
    amber: 'text-orange-600',
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    slate: 'text-slate-400',
  }
  const valueColors = {
    amber: 'text-orange-600',
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    slate: 'text-slate-900',
  }

  return (
    <div className={`min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-xs ${align === 'center' ? 'text-center' : 'text-left'} ${className}`}>
      <div className={`truncate text-sm font-bold ${labelColors[tone]}`}>{label}</div>
      <div className={`mt-1 break-words font-mono text-[15px] font-black leading-tight tabular-nums ${valueColors[tone]}`}>{value}</div>
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

function ErrorBox({ text: value }: { text: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 shadow-sm">
      {value}
    </div>
  )
}
