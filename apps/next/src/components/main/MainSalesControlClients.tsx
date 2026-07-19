'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Calculator, Download, ExternalLink, LockKeyhole, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { dailyFetchJson, formatMoney } from '@/lib/daily'
import { formatDateDisplay, sanitizeDecimalInput } from '@/lib/format'
import { DatePickerInput } from '@/components/ui/date-picker-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { KpiCard } from '@/components/ui/KpiCard'
import { PageSizeDropdown } from '@/components/ui/PageSizeDropdown'
import { ResizableTableHead } from '@/components/ui/ResizableTableHead'
import { SearchCombobox } from '@/components/ui/SearchCombobox'
import { Select } from '@/components/ui/Select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResizableColumns, type ResizableColumnDefinition } from '@/components/ui/useResizableColumns'

type AnyRow = Record<string, number | string | boolean | null | undefined>
type SortDirection = 'asc' | 'desc'
type TableColumn<TKey extends string> = ResizableColumnDefinition<TKey> & { align?: 'center' | 'left' | 'right'; label: string }
type SalesPlanColumnKey = 'channel' | 'containers' | 'customerName' | 'fx' | 'kgPerContainer' | 'lme' | 'poSell' | 'productName' | 'select' | 'sellPctLme' | 'sellPrice' | 'status' | 'totalKg'
type SalesPlanAnalysisColumnKey = 'bestPlanPct' | 'bestPlanPrice' | 'lockedKg' | 'metalGroup' | 'name' | 'projectedMarginPct' | 'projectedProfit' | 'recommendation' | 'remainingKg' | 'stock' | 'wac'
type SalesPlanRemainingColumnKey = 'lockedContainers' | 'lockedKg' | 'metalGroup' | 'name' | 'remainingContainers' | 'remainingKg' | 'stock' | 'value' | 'wac'
type CommissionCategoryColumnKey = 'amount' | 'category' | 'qty'
type CommissionSupplierColumnKey = 'amount' | 'bills' | 'pct' | 'qty' | 'supplier'
type CommissionBillColumnKey = 'amount' | 'commissionStatus' | 'date' | 'docNo' | 'price' | 'productName' | 'profitDiff' | 'qty' | 'salesPrice' | 'supplierName'
type CommissionSummaryColumnKey = 'amount' | 'category' | 'qty' | 'salesName'
type CommissionDrilldownTab = 'categoryAll' | 'commissionableCategories' | 'items' | 'suppliers'
type CommissionQuickRange = 'last7' | 'month' | 'today'
type CommissionSalesCardFilter = 'activity' | 'all' | 'eligible'
type CommissionMobileRow = {
  badge?: ReactNode
  details?: { label: string; value: ReactNode }[]
  key: string
  summary: { label: string; value: ReactNode }[]
  title: ReactNode
}
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
  customers: Array<{ active: boolean; code: string; id: string; marketScope: 'ต่างประเทศ' | 'ในประเทศ'; name: string }>
  filters: { channels: { id: string; name: string }[]; metalGroups: string[]; month: string }
  lmeConfig: LmeConfig
  pendingSaleTable: AnyRow[]
  pendingSaleTotals: Record<string, number>
  planProductOptions: AnyRow[]
  planRows: AnyRow[]
  productAnalysis: AnyRow[]
  sourceState: { limitations: string[] }
  summary: Record<string, number>
}
type SalesPlanDraftForm = {
  channel: string
  containers: string
  customerCode: string
  customerName: string
  kgPerContainer: string
  lmeCf: string
  productCode: string
  sellPctLme: string
}
type ClearPendingPlansDialogState = {
  filters?: {
    channel?: string
    metalGroup?: string
    month: string
    productCode?: string
  }
  message: string
  planIds?: string[]
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
  { key: 'select', label: 'เลือก', defaultWidth: 72, minWidth: 64, align: 'center' },
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
  { key: 'poSell', label: 'PO ขาย', defaultWidth: 135, minWidth: 120, align: 'center' },
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
  { key: 'name', label: 'สินค้า', defaultWidth: 250, minWidth: 190 },
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
  { key: 'qty', label: 'จำนวน KG', defaultWidth: 140, minWidth: 115, align: 'right' },
  { key: 'amount', label: 'มูลค่ารวม (บาท)', defaultWidth: 160, minWidth: 130, align: 'right' },
]
const commissionQuickRangeOptions: Array<{ label: string; value: CommissionQuickRange }> = [
  { label: 'วันนี้', value: 'today' },
  { label: '7 วัน', value: 'last7' },
  { label: 'เดือนนี้', value: 'month' },
]
const commissionSalesCardFilterOptions: Array<{ label: string; value: CommissionSalesCardFilter }> = [
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'มีรายการ', value: 'activity' },
  { label: 'ได้คอม', value: 'eligible' },
]

const salesPlanNumberInputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 text-right font-medium text-slate-700 outline-none transition focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
const salesPlanReadonlyNumberInputClass = 'w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-right font-medium text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

function money(value: unknown) {
  return formatMoney(typeof value === 'number' ? value : Number(value ?? 0))
}

function count(value: unknown) {
  return num(value).toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

function commissionDateRange(range: CommissionQuickRange) {
  const end = new Date()
  const start = new Date(end)
  if (range === 'last7') start.setDate(start.getDate() - 6)
  if (range === 'month') start.setDate(1)

  const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { from: formatDate(start), to: formatDate(end) }
}

function text(value: unknown) {
  return String(value ?? '')
}

function num(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

function normalizedProductFilterValue(value: unknown) {
  return text(value).trim().toLowerCase()
}

function matchesProductFilter(row: AnyRow, filterProductCode: string) {
  if (!filterProductCode) return true
  const needle = normalizedProductFilterValue(filterProductCode)
  return [
    row.productCode,
    row.productId,
    row.code,
  ].some((value) => normalizedProductFilterValue(value) === needle)
}

function productMatchKeys(row: AnyRow) {
  return [
    row.productCode,
    row.productId,
    row.productName,
    row.code,
    row.name,
  ].map((value) => normalizedProductFilterValue(value)).filter(Boolean)
}

function lmeDraftValueByMetalGroup(metalGroup: string, config: LmeConfig | null) {
  if (!config) return ''
  const group = metalGroup.toLowerCase()
  if (group.includes('ทองแดง') || group.includes('copper')) return String(config.lmeCopperUSD)
  if (group.includes('ทองเหลือง') || group.includes('brass')) return ''
  return ''
}

function getPlanStatus(value: unknown): 'locked' | 'pending' | 'po_created' {
  const normalized = text(value).toLowerCase()
  if (normalized.includes('po_created')) return 'po_created'
  return normalized.includes('lock') ? 'locked' : 'pending'
}

function getPlanStatusLabel(value: unknown) {
  const status = getPlanStatus(value)
  if (status === 'po_created') return 'เปิด PO ขายแล้ว'
  return status === 'locked' ? 'ล็อกแผนแล้ว' : 'รอล็อกแผน'
}

function canOpenPoSell(value: unknown) {
  return getPlanStatus(value) === 'locked'
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

function recommendationBadgeClass(recommendation: unknown) {
  const value = text(recommendation).trim()
  if (value === 'ควรขาย (กำไรดี)') return 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200'
  if (value === 'พอกำไร') return 'bg-sky-100 text-sky-700 ring-1 ring-sky-200'
  if (value === 'ขาดทุน - รอราคา') return 'bg-rose-100 text-rose-700 ring-1 ring-rose-200'
  if (value === 'ล็อกครบแล้ว') return 'bg-slate-200 text-slate-700 ring-1 ring-slate-300'
  if (value === 'ยังไม่มีแผนเสนอ') return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
  return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
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

async function downloadExcel(filename: string, headers: string[], rows: string[][]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const workbook = [
    headers.map((value) => ({ fontWeight: 'bold' as const, value })),
    ...rows,
  ]
  await writeXlsxFile(workbook, { sheet: 'รายงาน' }).toFile(filename)
}

const SALES_PLAN_DEFAULT_PAGE_SIZE = 10
const SALES_PLAN_PAGE_SIZE_OPTIONS = [10, 25] as const

function pageCount(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize))
}

function paginateRows<TRow>(rows: TRow[], page: number, pageSize: number) {
  return rows.slice((page - 1) * pageSize, page * pageSize)
}

function TablePaginationToolbar({
  page,
  pageSize,
  totalItems,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onResetWidths,
}: {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  onResetWidths?: (() => void) | undefined
}) {
  return (
    <div className="border-b border-slate-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <div className="font-semibold text-slate-500">พบทั้งหมด {count(totalItems)} รายการ</div>
        <div className="flex flex-wrap items-center gap-2">
          {onResetWidths ? (
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={onResetWidths}>คืนค่าเดิมตาราง</button>
          ) : null}
          <PageSizeDropdown options={SALES_PLAN_PAGE_SIZE_OPTIONS} value={pageSize} onChange={onPageSizeChange} />
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 outline-none hover:bg-slate-50 disabled:opacity-40"
            disabled={page <= 1}
            type="button"
            onClick={() => onPageChange(page - 1)}
          >
            ก่อนหน้า
          </button>
          <span className="px-1 text-sm font-semibold text-slate-600">หน้า {page} / {totalPages}</span>
          <button
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-600 outline-none hover:bg-slate-50 disabled:opacity-40"
            disabled={page >= totalPages}
            type="button"
            onClick={() => onPageChange(page + 1)}
          >
            ถัดไป
          </button>
        </div>
      </div>
    </div>
  )
}

export function SalesPlanPageClient() {
  const [data, setData] = useState<SalesPlanPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetchingLive, setIsFetchingLive] = useState(false)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isSavingPlan, setIsSavingPlan] = useState(false)
  const [isClearingPendingPlans, setIsClearingPendingPlans] = useState(false)
  const [isPlanFormOpen, setIsPlanFormOpen] = useState(false)
  const [clearPendingPlansDialog, setClearPendingPlansDialog] = useState<ClearPendingPlansDialogState | null>(null)
  const [selectedPendingPlanIds, setSelectedPendingPlanIds] = useState<string[]>([])
  const [month, setMonth] = useState('')
  const [planFilterGroup, setPlanFilterGroup] = useState('')
  const [planFilterChannel, setPlanFilterChannel] = useState('')
  const [planFilterProductCode, setPlanFilterProductCode] = useState('')
  const [insightFilterGroup, setInsightFilterGroup] = useState('')
  const [insightFilterProductCode, setInsightFilterProductCode] = useState('')
  const [lmeForm, setLmeForm] = useState<LmeConfig | null>(null)
  const [planDraftError, setPlanDraftError] = useState<string | null>(null)
  const [planDraftForm, setPlanDraftForm] = useState<SalesPlanDraftForm>({
    channel: '',
    containers: '1',
    customerCode: '',
    customerName: '',
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
  const [salesPlanInsightTab, setSalesPlanInsightTab] = useState<'analysis' | 'remaining'>('analysis')
  const [planPage, setPlanPage] = useState(1)
  const [pendingSalePage, setPendingSalePage] = useState(1)
  const [analysisPage, setAnalysisPage] = useState(1)
  const [remainingPage, setRemainingPage] = useState(1)
  const [planPageSize, setPlanPageSize] = useState(SALES_PLAN_DEFAULT_PAGE_SIZE)
  const [pendingSalePageSize, setPendingSalePageSize] = useState(SALES_PLAN_DEFAULT_PAGE_SIZE)
  const [analysisPageSize, setAnalysisPageSize] = useState(SALES_PLAN_DEFAULT_PAGE_SIZE)
  const [remainingPageSize, setRemainingPageSize] = useState(SALES_PLAN_DEFAULT_PAGE_SIZE)
  const planResize = useResizableColumns('main.sales-plan.plan.v1', salesPlanColumns)
  const analysisResize = useResizableColumns('main.sales-plan.analysis.v1', salesPlanAnalysisColumns)
  const remainingResize = useResizableColumns('main.sales-plan.remaining.v2', salesPlanRemainingColumns)

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

  const productOptions = useMemo(() => (data?.planProductOptions ?? [])
    .map((row) => ({
      code: text(row.code),
      metalGroup: text(row.metalGroup),
      name: text(row.name),
      wac: num(row.wac),
    }))
    .filter((row) => row.code && row.name), [data?.planProductOptions])
  const customerOptions = useMemo(() => (data?.customers ?? [])
    .filter((customer) => customer.active)
    .map((customer) => ({ code: customer.code, marketScope: customer.marketScope, name: customer.name })), [data?.customers])
  const filterProductOptions = useMemo(() => {
    const options = new Map<string, { id: string; label: string; searchText: string }>()
    productOptions.forEach((option) => {
      if (!option.code) return
      options.set(option.code, {
        id: option.code,
        label: `${option.code} - ${option.name}`,
        searchText: `${option.code} ${option.name} ${option.metalGroup}`,
      })
    })
    ;(data?.pendingSaleTable ?? []).forEach((row) => {
      const code = text(row.productCode)
      if (!code || options.has(code)) return
      const name = text(row.productName)
      const metalGroup = text(row.metalGroup)
      options.set(code, {
        id: code,
        label: name ? `${code} - ${name}` : code,
        searchText: `${code} ${name} ${metalGroup}`,
      })
    })
    ;(data?.productAnalysis ?? []).forEach((row) => {
      const code = text(row.code)
      if (!code || options.has(code)) return
      const name = text(row.name)
      const metalGroup = text(row.metalGroup)
      options.set(code, {
        id: code,
        label: name ? `${code} - ${name}` : code,
        searchText: `${code} ${name} ${metalGroup}`,
      })
    })
    return Array.from(options.values()).sort((left, right) => left.label.localeCompare(right.label, 'th', { numeric: true }))
  }, [data?.pendingSaleTable, data?.productAnalysis, productOptions])
  const insightFilterGroupOptions = useMemo(() => Array.from(
    new Set((data?.productAnalysis ?? []).map((row) => text(row.metalGroup).trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right, 'th', { numeric: true })), [data?.productAnalysis])
  const selectedDraftProduct = useMemo(() => productOptions.find((option) => option.code === planDraftForm.productCode) ?? null, [planDraftForm.productCode, productOptions])
  const selectedDraftCustomer = useMemo(() => customerOptions.find((option) => option.code === planDraftForm.customerCode) ?? null, [customerOptions, planDraftForm.customerCode])
  const selectedDraftChannel = useMemo(() => (data?.filters.channels ?? []).find((channel) => channel.id === planDraftForm.channel) ?? null, [data?.filters.channels, planDraftForm.channel])
  const draftKgPerContainer = Math.max(0, Number(planDraftForm.kgPerContainer || 0))
  const draftContainers = Math.max(0, Number(planDraftForm.containers || 0))
  const parsedDraftLmeCf = Number(planDraftForm.lmeCf || 0)
  const draftLmeCf = Number.isFinite(parsedDraftLmeCf) ? Math.max(0, parsedDraftLmeCf) : 0
  const draftSellPct = Math.max(0, Number(planDraftForm.sellPctLme || 0))
  const draftTotalKg = draftContainers * draftKgPerContainer
  const draftFx = lmeForm?.fxRate ?? 0
  const draftSellPrice = draftLmeCf > 0 ? (draftLmeCf / 1000) * draftFx * (draftSellPct / 100) : 0
  const draftWac = selectedDraftProduct?.wac ?? 0
  const draftProjectedProfit = draftSellPrice > 0 && draftWac > 0 ? draftTotalKg * (draftSellPrice - draftWac) : 0
  const draftMarginPct = draftSellPrice > 0 && draftWac > 0 ? ((draftSellPrice - draftWac) / draftSellPrice) * 100 : 0
  const filteredServerPlanRows = useMemo(() => (data?.planRows ?? [])
    .filter((row) => !planFilterGroup || text(row.metalGroup).includes(planFilterGroup))
    .filter((row) => !planFilterChannel || text(row.channel).toLowerCase() === planFilterChannel.toLowerCase())
    .filter((row) => matchesProductFilter(row, planFilterProductCode)), [data?.planRows, planFilterChannel, planFilterGroup, planFilterProductCode])
  const planRowsWithStatus = useMemo<AnyRow[]>(() => filteredServerPlanRows.map((row) => {
    const status = getPlanStatus(row.status)
    return {
      ...row,
      poSell: status === 'po_created' ? text(row.poSell) : status === 'locked' ? 'ready' : 'pending',
      status,
      statusLabel: getPlanStatusLabel(status),
    }
  }), [filteredServerPlanRows])
  const visiblePlanRows = useMemo(() => planRowsWithStatus.filter((row) => getPlanStatus(row.status) !== 'po_created'), [planRowsWithStatus])
  const pendingPlanCount = useMemo(() => visiblePlanRows.filter((row) => getPlanStatus(row.status) === 'pending').length, [visiblePlanRows])
  const visiblePendingPlanIds = useMemo(() => visiblePlanRows.filter((row) => getPlanStatus(row.status) === 'pending').map((row) => text(row.id)).filter(Boolean), [visiblePlanRows])
  const selectedVisiblePendingPlanIds = useMemo(() => selectedPendingPlanIds.filter((id) => visiblePendingPlanIds.includes(id)), [selectedPendingPlanIds, visiblePendingPlanIds])
  const allVisiblePendingSelected = visiblePendingPlanIds.length > 0 && selectedVisiblePendingPlanIds.length === visiblePendingPlanIds.length
  const visiblePlanProductKeys = useMemo(() => {
    const keys = new Set<string>()
    visiblePlanRows.forEach((row) => {
      productMatchKeys(row).forEach((key) => keys.add(key))
    })
    return keys
  }, [visiblePlanRows])
  const bestVisiblePlanByProduct = useMemo(() => {
    const plans = new Map<string, { price: number; pct: number }>()
    visiblePlanRows.forEach((plan) => {
      const price = num(plan.sellPrice)
      const pct = num(plan.sellPctLme)
      if (price <= 0 || pct <= 0) return
      productMatchKeys(plan).forEach((key) => {
        const current = plans.get(key)
        if (!current || price > current.price) plans.set(key, { pct, price })
      })
    })
    return plans
  }, [visiblePlanRows])
  const pendingSaleRows = useMemo<AnyRow[]>(() => {
    return (data?.pendingSaleTable ?? [])
      .filter((row) => matchesProductFilter(row, insightFilterProductCode))
      .map((row): AnyRow => {
        const plan = productMatchKeys(row).map((key) => bestVisiblePlanByProduct.get(key)).find(Boolean)
        if (!plan) return { ...row, bestPlanPct: 0, bestPlanPrice: 0, projectedMarginPct: 0, projectedProfit: 0 }

        const poolCost = num(row.avgPrice)
        const pendingQty = num(row.pendingSaleQty)
        const projectedProfit = pendingQty * (plan.price - poolCost)
        return {
          ...row,
          bestPlanPct: plan.pct,
          bestPlanPrice: plan.price,
          projectedMarginPct: poolCost > 0 ? ((plan.price - poolCost) / poolCost) * 100 : 0,
          projectedProfit,
        }
      })
      .sort((left, right) => {
        const leftHasPlan = num(left.bestPlanPrice) > 0 && num(left.bestPlanPct) > 0
        const rightHasPlan = num(right.bestPlanPrice) > 0 && num(right.bestPlanPct) > 0
        if (leftHasPlan !== rightHasPlan) return leftHasPlan ? -1 : 1
        return num(right.pendingSaleQty) - num(left.pendingSaleQty)
      })
  }, [bestVisiblePlanByProduct, data?.pendingSaleTable, insightFilterProductCode])
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
    .filter((row) => !insightFilterGroup || text(row.metalGroup).includes(insightFilterGroup))
    .filter((row) => matchesProductFilter(row, insightFilterProductCode)), [data?.productAnalysis, insightFilterGroup, insightFilterProductCode])
  const sortedPlanRows = useMemo(() => {
    const rows = visiblePlanRows
    if (!planSortKey) return rows

    return [...rows].sort((left, right) => {
      const result = compareSortValues(getAnySortValue(left, planSortKey), getAnySortValue(right, planSortKey))
      return planSortDirection === 'asc' ? result : -result
    })
  }, [visiblePlanRows, planSortDirection, planSortKey])
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
  const totalPlanPages = useMemo(() => pageCount(sortedPlanRows.length, planPageSize), [planPageSize, sortedPlanRows.length])
  const totalPendingSalePages = useMemo(() => pageCount(pendingSaleRows.length, pendingSalePageSize), [pendingSalePageSize, pendingSaleRows.length])
  const totalAnalysisPages = useMemo(() => pageCount(sortedAnalysisRows.length, analysisPageSize), [analysisPageSize, sortedAnalysisRows.length])
  const totalRemainingPages = useMemo(() => pageCount(sortedRemainingRows.length, remainingPageSize), [remainingPageSize, sortedRemainingRows.length])
  const pagedPlanRows = useMemo(() => paginateRows(sortedPlanRows, planPage, planPageSize), [planPage, planPageSize, sortedPlanRows])
  const pagedPendingSaleRows = useMemo(() => paginateRows(pendingSaleRows, pendingSalePage, pendingSalePageSize), [pendingSalePage, pendingSalePageSize, pendingSaleRows])
  const pagedAnalysisRows = useMemo(() => paginateRows(sortedAnalysisRows, analysisPage, analysisPageSize), [analysisPage, analysisPageSize, sortedAnalysisRows])
  const pagedRemainingRows = useMemo(() => paginateRows(sortedRemainingRows, remainingPage, remainingPageSize), [remainingPage, remainingPageSize, sortedRemainingRows])
  
  const remainingContainers = analysisRows.reduce((sum, row) => sum + num(row.remainingContainers), 0)
  const stockTotal = analysisRows.reduce((sum, row) => sum + num(row.stock), 0)
  const lockedTotal = analysisRows.reduce((sum, row) => sum + num(row.lockedKg), 0)
  const remainingKgTotal = analysisRows.reduce((sum, row) => sum + num(row.remainingKg), 0)
  const remainingValueTotal = analysisRows.reduce((sum, row) => sum + num(row.value), 0)
  const projectedProfitTotal = analysisRows.reduce((sum, row) => sum + num(row.projectedProfit), 0)

  useEffect(() => {
    setSelectedPendingPlanIds((current) => current.filter((id) => visiblePendingPlanIds.includes(id)))
  }, [visiblePendingPlanIds])
  useEffect(() => {
    setPlanPage(1)
  }, [month, planFilterChannel, planFilterGroup, planFilterProductCode])
  useEffect(() => {
    setPlanPage(1)
  }, [planPageSize])
  useEffect(() => {
    setPendingSalePage(1)
    setAnalysisPage(1)
    setRemainingPage(1)
  }, [insightFilterGroup, insightFilterProductCode])
  useEffect(() => {
    setPendingSalePage(1)
  }, [pendingSalePageSize])
  useEffect(() => {
    setAnalysisPage(1)
  }, [analysisPageSize])
  useEffect(() => {
    setRemainingPage(1)
  }, [remainingPageSize])
  useEffect(() => {
    setPlanPage((current) => Math.min(current, totalPlanPages))
  }, [totalPlanPages])
  useEffect(() => {
    setPendingSalePage((current) => Math.min(current, totalPendingSalePages))
  }, [totalPendingSalePages])
  useEffect(() => {
    setAnalysisPage((current) => Math.min(current, totalAnalysisPages))
  }, [totalAnalysisPages])
  useEffect(() => {
    setRemainingPage((current) => Math.min(current, totalRemainingPages))
  }, [totalRemainingPages])

  const exportPlan = async () => {
    await downloadExcel(
      `sales_plan_${month || data?.filters.month || 'current'}.xlsx`,
      ['Month', 'Product', 'ช่องทาง', 'Customer', 'Containers', 'Kg/ตู้', 'รวม กก.', '% LME', 'LME (USD/MT)', 'FX', 'ราคาขาย (THB/kg)', 'สถานะ'],
      visiblePlanRows.map((row) => [month || text(data?.filters.month), text(row.productName), text(row.channel), text(row.customerName), money(row.containers), money(row.kgPerContainer), money(row.totalKg), money(row.sellPctLme), money(row.lme), money(row.fx), money(row.sellPrice), text(row.status)]),
    )
  }

  const clearPlanFilters = () => {
    setMonth('')
    setPlanFilterGroup('')
    setPlanFilterChannel('')
    setPlanFilterProductCode('')
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
      channel: '',
      containers: '1',
      customerCode: '',
      customerName: '',
      kgPerContainer: String(lmeForm?.kgPerContainer ?? data?.lmeConfig.kgPerContainer ?? 25000),
      lmeCf: '',
      productCode: '',
      sellPctLme: '',
    })
    setPlanDraftError(null)
  }

  function openPoSellForRow(rowId: string) {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams({ source: 'sales-plan', salesPlanId: rowId })
    window.location.assign(`/sales/po-sell?${params.toString()}`)
  }
  function openPlanForm() {
    resetPlanDraftForm()
    setIsPlanFormOpen(true)
  }

  function handleDraftProductChange(productCode: string) {
    const product = productOptions.find((option) => option.code === productCode)
    setPlanDraftForm((current) => ({
      ...current,
      lmeCf: product ? lmeDraftValueByMetalGroup(product.metalGroup, lmeForm) : '',
      productCode,
    }))
  }

  function handleDraftCustomerChange(customerCode: string) {
    const customer = customerOptions.find((option) => option.code === customerCode)
    const channel = (data?.filters.channels ?? []).find((option) => option.name === customer?.marketScope)
    setPlanDraftForm((current) => ({
      ...current,
      channel: channel?.id ?? '',
      customerCode: customer?.code ?? '',
      customerName: customer?.name ?? '',
    }))
  }

  async function handlePlanStatusChange(rowId: string, nextStatus: 'locked' | 'pending') {
    if (nextStatus !== 'locked') return
    setPlanDraftError(null)
    setIsSavingPlan(true)
    try {
      await dailyFetchJson<{ planRow: AnyRow }>('/api/sales-plan', {
        body: JSON.stringify({ action: 'lock-plan', planId: rowId }),
        method: 'POST',
      })
      await loadSalesPlan()
    } catch (caught) {
      setPlanDraftError(caught instanceof Error ? caught.message : 'ล็อกแผนขายไม่ได้')
    } finally {
      setIsSavingPlan(false)
    }
  }

  function togglePendingPlanSelection(planId: string, checked: boolean) {
    setSelectedPendingPlanIds((current) => {
      if (checked) return current.includes(planId) ? current : [...current, planId]
      return current.filter((id) => id !== planId)
    })
  }

  function toggleAllVisiblePendingPlans(checked: boolean) {
    setSelectedPendingPlanIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visiblePendingPlanIds]))
      return current.filter((id) => !visiblePendingPlanIds.includes(id))
    })
  }

  async function handleClearPendingPlans() {
    const targetPlanIds = selectedVisiblePendingPlanIds
    const cleaningSelected = targetPlanIds.length > 0
    const targetCount = cleaningSelected ? targetPlanIds.length : pendingPlanCount
    if (!targetCount) return
    const activeMonth = month || data?.filters.month || new Date().toISOString().slice(0, 7)
    setClearPendingPlansDialog({
      ...(cleaningSelected
        ? { planIds: targetPlanIds }
        : {
          filters: {
            channel: planFilterChannel || undefined,
            metalGroup: planFilterGroup || undefined,
            month: activeMonth,
            productCode: planFilterProductCode || undefined,
          },
        }),
      message: cleaningSelected
        ? `ต้องการยกเลิกแผนรอล็อกที่เลือก ${targetCount} รายการใช่หรือไม่?`
        : `ต้องการยกเลิกแผนรอล็อกทั้งหมด ${targetCount} รายการตามตัวกรองปัจจุบันของเดือน ${activeMonth} ใช่หรือไม่?`,
    })
  }

  async function confirmClearPendingPlans() {
    if (!clearPendingPlansDialog) return
    const targetPlanIds = clearPendingPlansDialog.planIds ?? []
    setFormError(null)
    setIsClearingPendingPlans(true)
    try {
      await dailyFetchJson<{ deletedCount: number }>('/api/sales-plan', {
        body: JSON.stringify({
          action: 'clear-pending-plans',
          ...(clearPendingPlansDialog.planIds
            ? { planIds: clearPendingPlansDialog.planIds }
            : { filters: clearPendingPlansDialog.filters }),
        }),
        method: 'POST',
      })
      if (targetPlanIds.length > 0) {
        setSelectedPendingPlanIds((current) => current.filter((id) => !targetPlanIds.includes(id)))
      }
      setClearPendingPlansDialog(null)
      await loadSalesPlan()
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'ยกเลิกแผนรอล็อกไม่ได้')
    } finally {
      setIsClearingPendingPlans(false)
    }
  }

  async function addDraftPlan() {
    if (!selectedDraftProduct) {
      setPlanDraftError('เลือกสินค้า')
      return
    }
    if (!planDraftForm.customerCode || !planDraftForm.customerName) {
      setPlanDraftError('เลือกลูกค้า')
      return
    }
    if (!planDraftForm.channel) {
      setPlanDraftError('ไม่พบช่องทางขายจาก Master Customer')
      return
    }
    if (draftContainers <= 0 || draftKgPerContainer <= 0) {
      setPlanDraftError('จำนวนตู้และ กก./ตู้ ต้องมากกว่า 0')
      return
    }
    if (draftLmeCf <= 0) {
      setPlanDraftError('กรอก LME cf มากกว่า 0')
      return
    }
    if (draftSellPct <= 0) {
      setPlanDraftError('กรอก % LME มากกว่า 0')
      return
    }

    setIsSavingPlan(true)
    setPlanDraftError(null)
    try {
      await dailyFetchJson<{ planRow: AnyRow }>('/api/sales-plan', {
        body: JSON.stringify({
          action: 'create-plan',
          plan: {
            containers: draftContainers,
            customerCode: planDraftForm.customerCode,
            kgPerContainer: draftKgPerContainer,
            lmeCf: draftLmeCf,
            planMonth: month || data?.filters.month || new Date().toISOString().slice(0, 7),
            productCode: selectedDraftProduct.code,
            sellPctLme: draftSellPct,
          },
        }),
        method: 'POST',
      })
      resetPlanDraftForm()
      setIsPlanFormOpen(false)
      await loadSalesPlan()
    } catch (caught) {
      setPlanDraftError(caught instanceof Error ? caught.message : 'บันทึกแผนขายไม่ได้')
    } finally {
      setIsSavingPlan(false)
    }
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100"><Calculator className="size-5 text-slate-500" /> ราคาอ้างอิง LME และอัตราแลกเปลี่ยน</h2>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">ใช้เป็นฐานคำนวณแผนขายเท่านั้น การบันทึกค่าใหม่จะมีผลกับการคำนวณแผนที่สร้างหลังจากนั้น</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isFetchingLive || isSavingConfig}
              onClick={handleFetchLive}
              type="button"
            >
              <RefreshCw className="size-4" />{isFetchingLive ? 'กำลังดึงข้อมูล...' : 'ดึงราคาล่าสุด'}
            </button>
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-800 px-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              disabled={isLoading || isSavingConfig || !lmeForm}
              onClick={handleSaveConfig}
              type="button"
            >
              <Save className="size-4" />{isSavingConfig ? 'กำลังบันทึก...' : 'บันทึกค่าอ้างอิง'}
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">ราคาตลาด</div>
            <LmeEditableCard label="ทองแดง LME (USD/MT)" readOnly value={lmeForm?.lmeCopperUSD ?? 0} onChange={(value) => updateLmeField('lmeCopperUSD', value)} />
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">สมมติฐานการคำนวณ</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <LmeEditableCard label="USD/THB" value={lmeForm?.fxRate ?? 0} onChange={(value) => updateLmeField('fxRate', value)} />
              <LmeEditableCard label="น้ำหนักมาตรฐานต่อตู้ (กก.)" manualOnly value={lmeForm?.kgPerContainer ?? 0} onChange={(value) => updateLmeField('kgPerContainer', value)} />
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 text-sm md:flex-row md:items-center md:justify-between">
          <div className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <span>อัปเดต {dateTime(lmeForm?.updatedAt)}</span>
            <span className="text-slate-400">โดย</span>
            <span>{text(lmeForm?.updatedBy)}</span>
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">แหล่งข้อมูล: {text(lmeForm?.source || data?.lmeConfig.source)}</div>
        </div>
        <div className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {text(lmeForm?.liveFetchNote || data?.lmeConfig.liveFetchNote || 'Live fetch: USD/THB จาก exchangerate-api · LME จาก fx678 — ถ้า fetch fail ให้กรอกเอง')}
        </div>
        {formError ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">{formError}</div> : null}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <PendingStatCard label="แผนทั้งหมด" sublabel="เดือนที่เลือก" value={count(data?.summary.plansCount)} />
        <PendingStatCard label="รอล็อกแผน" sublabel="ยังไม่เปิด PO ขาย" value={count(data?.summary.pendingCount)} tone="danger" />
        <PendingStatCard label="ล็อกแล้ว" sublabel="พร้อมเปิด PO ขาย" value={count(data?.summary.lockedCount)} tone="success" />
        <PendingStatCard label="สต๊อกว่างขาย" sublabel="หลังหักแผนที่ล็อก" value={`${money(data?.summary.stockRemainingKg)} กก.`} />
      </div>
      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="sales-plan-filter-month">เดือน:</label>
          <input className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-slate-300 dark:focus:ring-slate-700" id="sales-plan-filter-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          <div className="min-w-[240px] flex-1 sm:max-w-sm">
            <SearchCombobox
              hideLabel
              inputClassName="h-9 text-sm font-normal text-slate-700 dark:text-slate-100"
              inputId="sales-plan-filter-product"
              label="สินค้า"
              openOnFocus={false}
              options={filterProductOptions}
              placeholder="ค้นหาสินค้า"
              value={planFilterProductCode}
              onChange={setPlanFilterProductCode}
            />
          </div>
          {planFilterProductCode ? (
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" onClick={() => setPlanFilterProductCode('')} type="button">ล้างสินค้า</button>
          ) : null}
          <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" onClick={clearPlanFilters} type="button">ล้างตัวกรอง</button>
        </div>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="sales-plan-filter-group">ประเภทโลหะ:</label>
            <Select className="h-9 w-auto text-sm font-normal" id="sales-plan-filter-group" value={planFilterGroup} onChange={(event) => setPlanFilterGroup(event.target.value)}>
              <option value="">ทุกหมวด (ทองแดง+ทองเหลือง)</option>
              <option value="ทองแดง">ทองแดงเท่านั้น</option>
              <option value="ทองเหลือง">ทองเหลืองเท่านั้น</option>
            </Select>
            <label className="ml-2 text-xs text-slate-500 dark:text-slate-400" htmlFor="sales-plan-filter-channel">ช่องทาง:</label>
            <Select className="h-9 w-auto text-sm font-normal" id="sales-plan-filter-channel" value={planFilterChannel} onChange={(event) => setPlanFilterChannel(event.target.value)}>
              <option value="">ทุกช่องทาง</option>
              {(data?.filters.channels ?? []).map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-950/50"
              disabled={!pendingPlanCount || isClearingPendingPlans || isSavingPlan}
              onClick={() => handleClearPendingPlans()}
              type="button"
            >
              {isClearingPendingPlans
                ? 'กำลังยกเลิกแผน...'
                : selectedVisiblePendingPlanIds.length > 0
                  ? `ยกเลิกแผนที่เลือก (${selectedVisiblePendingPlanIds.length})`
                  : `ยกเลิกแผนรอล็อก (${pendingPlanCount})`}
            </button>
            <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700" onClick={openPlanForm} type="button"><Plus className="size-4" />สร้างแผนขาย</button>
            <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700" onClick={exportPlan} type="button"><Download className="size-4" />ส่งออก Excel</button>
          </div>
        </div>
      </div>
      {/* 1. Sales Plan Section */}
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 text-xs font-semibold text-slate-600">
          แผนขาย — สร้างแผนเป็น `รอล็อกแผน` ก่อน จากนั้นตรวจสอบราคาและกด `ล็อกแผน` เมื่อพร้อมเปิด PO ขาย
        </div>
        <Dialog open={Boolean(clearPendingPlansDialog)} onOpenChange={(open) => { if (!open && !isClearingPendingPlans) setClearPendingPlansDialog(null) }}>
          <DialogContent className="max-w-lg rounded-md !p-0 overflow-hidden flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 animate-fade-in" fallbackTitle="ยืนยันยกเลิกแผน" hideClose>
            <DialogHeader className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
              <DialogTitle className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100"><AlertTriangle className="size-5 text-rose-600" />ยืนยันยกเลิกแผนขาย</DialogTitle>
              <p className="text-sm text-slate-600 dark:text-slate-300">{clearPendingPlansDialog?.message}</p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">รายการนี้ยังไม่ถูกล็อกและยังไม่สร้าง PO ขาย ระบบจะลบรายการรอล็อกออกจากฐานข้อมูล</p>
            </DialogHeader>
            <DialogFooter className="shrink-0">
              <button className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" disabled={isClearingPendingPlans} onClick={() => setClearPendingPlansDialog(null)} type="button">ยกเลิก</button>
              <button className="inline-flex h-10 items-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60" disabled={isClearingPendingPlans} onClick={confirmClearPendingPlans} type="button"><Trash2 className="size-4" />{isClearingPendingPlans ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกแผน'}</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={isPlanFormOpen} onOpenChange={setIsPlanFormOpen}>
          <DialogContent className="max-w-6xl rounded-md !p-0 overflow-hidden flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 max-h-[90vh] animate-fade-in" fallbackTitle="สร้างแผนขาย" hideClose>
            <DialogHeader className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-700 dark:bg-slate-800">
              <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">สร้างแผนขาย</DialogTitle>
              <p className="text-xs text-slate-600 dark:text-slate-300">บันทึกเป็น `รอล็อกแผน` ก่อน ระบบยังไม่ตัดสต๊อกและยังไม่สร้าง AR</p>
            </DialogHeader>
            <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 text-sm dark:bg-slate-950 sm:p-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <h4 className="mb-4 border-b border-slate-100 pb-2 text-sm font-bold text-slate-800 dark:border-slate-700 dark:text-slate-100">ข้อมูลแผนขาย</h4>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                  <SearchCombobox
                    hideLabel={false}
                    inputClassName="h-10 text-sm font-medium text-slate-700"
                    inputId="sales-plan-draft-product"
                    label="สินค้า *"
                    openOnFocus={false}
                    options={productOptions.map((option) => ({
                      id: option.code,
                      label: `${option.code} - ${option.name}`,
                      searchText: `${option.code} ${option.name} ${option.metalGroup}`,
                    }))}
                    placeholder="ค้นหารหัสหรือชื่อสินค้า"
                    value={planDraftForm.productCode}
                    onChange={handleDraftProductChange}
                  />
                  <SearchCombobox
                    inputClassName="h-10 text-sm font-medium text-slate-700"
                    inputId="sales-plan-draft-customer"
                    label="ลูกค้า *"
                    options={customerOptions.map((customer) => ({
                      id: customer.code,
                      label: `${customer.code} - ${customer.name}`,
                      searchText: `${customer.code} ${customer.name}`,
                    }))}
                    placeholder="ค้นหารหัสหรือชื่อลูกค้า"
                    value={planDraftForm.customerCode}
                    onChange={handleDraftCustomerChange}
                  />
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    <span className="mb-1 block">ช่องทางขาย</span>
                    <input className="h-10 w-full rounded-md border border-slate-300 bg-slate-100 px-3 text-sm font-medium text-slate-700 outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200" readOnly value={selectedDraftChannel?.name ?? (selectedDraftCustomer ? 'ไม่พบช่องทางจาก Master Customer' : 'เลือกลูกค้าก่อน')} />
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <label className="text-xs font-bold text-slate-600">
                    <span className="mb-1 block">จำนวนตู้</span>
                    <input className={`h-10 text-sm ${salesPlanNumberInputClass}`} min="0" onChange={(event) => setPlanDraftForm((current) => ({ ...current, containers: event.target.value }))} type="number" value={planDraftForm.containers} />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    <span className="mb-1 block">กก./ตู้</span>
                    <input className={`h-10 text-sm ${salesPlanNumberInputClass}`} min="0" onChange={(event) => setPlanDraftForm((current) => ({ ...current, kgPerContainer: event.target.value }))} type="number" value={planDraftForm.kgPerContainer} />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    <span className="mb-1 block">LME cf (USD/MT)</span>
                    <input className={`h-10 text-sm ${salesPlanNumberInputClass}`} inputMode="decimal" onChange={(event) => setPlanDraftForm((current) => ({ ...current, lmeCf: sanitizeDecimalInput(event.target.value) }))} placeholder="0.00" value={planDraftForm.lmeCf} />
                  </label>
                  <label className="text-xs font-bold text-slate-600">
                    <span className="mb-1 block">% LME</span>
                    <input className={`h-10 text-sm ${salesPlanNumberInputClass}`} min="0" onChange={(event) => setPlanDraftForm((current) => ({ ...current, sellPctLme: event.target.value }))} type="number" value={planDraftForm.sellPctLme} />
                  </label>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
                <PendingStatCard label="หมวด" sublabel="อิงจากสินค้า" value={selectedDraftProduct?.metalGroup || '-'} />
                <PendingStatCard label="รวม กก." sublabel="ตู้ x กก./ตู้" value={`${money(draftTotalKg)} กก.`} />
                <PendingStatCard label="LME cf / FX" sublabel={`${money(draftLmeCf)} USD/MT`} value={money(draftFx)} />
                <PendingStatCard label="ราคา THB/kg" sublabel={`ที่ ${money(draftSellPct)}% LME`} value={money(draftSellPrice)} />
                <PendingStatCard label="ต้นทุน WAC" sublabel="จากข้อมูลสินค้า" value={draftWac > 0 ? `${money(draftWac)} บาท/กก.` : '-'} />
                <PendingStatCard label="กำไร / Margin" sublabel="ประมาณการจาก WAC" tone={draftProjectedProfit < 0 ? 'danger' : 'success'} value={draftSellPrice > 0 && draftWac > 0 ? `${money(draftProjectedProfit)} บาท / ${money(draftMarginPct)}%` : '-'} />
              </div>
              {planDraftError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{planDraftError}</div> : null}
            </div>
            <DialogFooter className="shrink-0">
              <button className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={resetPlanDraftForm} type="button">ล้างฟอร์ม</button>
              <button className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setIsPlanFormOpen(false)} type="button">ยกเลิก</button>
              <button className="h-10 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSavingPlan} onClick={addDraftPlan} type="button">{isSavingPlan ? 'กำลังบันทึก...' : 'เพิ่มเข้าตาราง'}</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <TablePaginationToolbar
          page={planPage}
          pageSize={planPageSize}
          totalItems={sortedPlanRows.length}
          totalPages={totalPlanPages}
          onPageChange={setPlanPage}
          onPageSizeChange={setPlanPageSize}
          onResetWidths={planResize.hasCustomWidths ? planResize.resetColumnWidths : undefined}
        />
        {/* Desktop view */}
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
                    label={column.key === 'select' ? (
                      <input
                        aria-label="เลือก Pending ทั้งหมด"
                        checked={allVisiblePendingSelected}
                        className="size-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        disabled={!visiblePendingPlanIds.length}
                        type="checkbox"
                        onChange={(event) => toggleAllVisiblePendingPlans(event.target.checked)}
                      />
                    ) : column.label}
                    sortKey={column.key === 'select' ? undefined : column.key}
                    onSort={column.key === 'select' ? undefined : changePlanSort}
                    resizeProps={column.key === 'select' ? undefined : planResize.getResizeHandleProps(column.key, column.label)}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedPlanRows.map((row) => (
                <tr className="hover:bg-slate-50/50 transition-colors" key={text(row.id)}>
                  <td className="p-1.5 text-center">
                    {getPlanStatus(row.status) === 'pending' ? (
                      <input
                        aria-label={`เลือกแผนขาย ${text(row.productName)}`}
                        checked={selectedPendingPlanIds.includes(text(row.id))}
                        className="size-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                        type="checkbox"
                        onChange={(event) => togglePendingPlanSelection(text(row.id), event.target.checked)}
                      />
                    ) : <span className="text-xs font-semibold text-slate-300">-</span>}
                  </td>
                  <td className="p-1.5"><div className="flex h-10 w-full items-center truncate rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700" title={text(row.productName)}>{text(row.productName) || '-เลือก-'}</div></td>
                  <td className="p-1.5"><div className="flex h-10 w-full items-center truncate rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700" title={text(row.channel)}>{text(row.channel) || 'ส่งออก'}</div></td>
                  <td className="p-1.5"><div className="flex h-10 w-full items-center truncate rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700" title={text(row.customerName)}>{text(row.customerName) || '-เลือก-'}</div></td>
                  <td className="p-1.5"><input className={`py-1 text-xs ${salesPlanReadonlyNumberInputClass}`} min="0" readOnly step="1" type="number" value={num(row.containers)} /></td>
                  <td className="p-1.5"><input className={`py-1 text-xs ${salesPlanReadonlyNumberInputClass}`} min="0" readOnly step="any" type="number" value={num(row.kgPerContainer)} /></td>
                  <td className="p-1.5 text-right font-semibold text-slate-800">{money(row.totalKg)}</td>
                  <td className="p-1.5"><input className={`border-amber-200 py-1 text-xs font-bold text-amber-700 ${salesPlanReadonlyNumberInputClass}`} min="0" readOnly step="any" type="number" value={num(row.sellPctLme)} /></td>
                  <td className="p-1.5 text-right text-xs text-slate-400 font-medium">{money(row.lme)}</td>
                  <td className="p-1.5 text-right text-xs text-slate-400 font-medium">{money(row.fx)}</td>
                  <td className="bg-emerald-50/20 p-1.5 text-right font-bold text-emerald-600">{money(row.sellPrice)}</td>
                  <td className="p-1.5 text-center">
                    {canOpenPoSell(row.status) ? (
                      <button className="inline-flex h-8 items-center justify-center rounded-md bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700" onClick={() => openPoSellForRow(text(row.id))} type="button">เปิด PO ขาย</button>
                    ) : getPlanStatus(row.status) === 'po_created' ? (
                      <span className="text-xs font-semibold text-violet-600">{text(row.poSell) || 'เปิด PO แล้ว'}</span>
                    ) : (
                      <span className="text-xs font-semibold text-slate-400">รอล็อก</span>
                    )}
                  </td>
                  <td className="p-1.5 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      {getPlanStatus(row.status) !== 'pending' ? (
                        <span className="inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{getPlanStatusLabel(row.status)}</span>
                      ) : (
                        <>
                          <span className="inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">รอล็อกแผน</span>
                          <button className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSavingPlan} onClick={() => handlePlanStatusChange(text(row.id), 'locked')} type="button"><LockKeyhole className="size-3.5" />ล็อกแผน</button>
                        </>
                      )}
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
          {pagedPlanRows.map((row) => (
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
                {getPlanStatus(row.status) !== 'pending' ? (
                  <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{getPlanStatusLabel(row.status)}</span>
                ) : (
                  <div className="flex items-center gap-2">
                          <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">รอล็อกแผน</span>
                          <button className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSavingPlan} onClick={() => handlePlanStatusChange(text(row.id), 'locked')} type="button"><LockKeyhole className="size-3.5" />ล็อกแผน</button>
                  </div>
                )}
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-400 font-semibold">PO ขาย:</span>
                {canOpenPoSell(row.status) ? (
                  <button className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700" onClick={() => openPoSellForRow(text(row.id))} type="button"><ExternalLink className="size-3.5" />เปิด PO ขาย</button>
                ) : getPlanStatus(row.status) === 'po_created' ? (
                  <span className="text-xs font-semibold text-violet-600">{text(row.poSell) || 'เปิด PO แล้ว'}</span>
                ) : (
                  <span className="text-xs font-semibold text-slate-400">รอล็อก</span>
                )}
              </div>
            </div>
          ))}
          {!sortedPlanRows.length ? <div className="text-center text-slate-400 py-4 font-semibold text-xs">ยังไม่มีรายการในเดือนนี้</div> : null}
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
          <h3 className="font-bold text-slate-800 text-sm">📋 ตารางรอขาย — ทองแดง / ทองเหลือง ({money(pendingSaleRows.length)} รายการ)</h3>
          <p className="mt-1 text-xs text-slate-500">รอขายจริง = STOCK + PO ซื้อรอส่ง − ล็อกขายรอส่ง · ยอดติดลบหมายถึงของจริงและของกำลังเข้าไม่พอกับยอดขายที่ล็อกไว้</p>
        </div>
        <TablePaginationToolbar
          page={pendingSalePage}
          pageSize={pendingSalePageSize}
          totalItems={pendingSaleRows.length}
          totalPages={totalPendingSalePages}
          onPageChange={setPendingSalePage}
          onPageSizeChange={setPendingSalePageSize}
        />
        <div className="hidden overflow-x-auto lg:block">
          <table className="ns-table min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">สินค้า</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">หมวด</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">รอขาย (กก.)</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">ต้นทุน Pool<br /><span className="text-xs font-medium text-slate-400">(บาท/กก.)</span></th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">ราคาเสนอที่ดีสุด<br /><span className="text-xs font-medium text-slate-400">(บาท/กก.)</span></th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">% LME</th>
                <th className="px-4 py-3 text-right font-semibold text-emerald-700">กำไรคาดการณ์<br /><span className="text-xs font-medium text-emerald-600">(บาท)</span></th>
                <th className="px-4 py-3 text-right font-semibold text-emerald-700">Margin %</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">รอขายจริง<br /><span className="text-xs font-medium text-slate-400">(กก.)</span></th>
                <th className="px-4 py-3 text-right font-semibold text-rose-700">ล็อกขาย<br /><span className="text-xs font-medium text-rose-600">(กก.)</span></th>
                <th className="px-4 py-3 text-right font-semibold text-violet-700">PO ซื้อรอส่ง<br /><span className="text-xs font-medium text-violet-600">(กก.)</span></th>
                <th className="px-4 py-3 text-right font-semibold text-blue-700">STOCK<br /><span className="text-xs font-medium text-blue-600">(กก.)</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedPendingSaleRows.map((row) => {
                const shortage = num(row.realPendingSale) < 0
                return (
                  <tr className={`transition-colors hover:bg-slate-50/50 ${shortage ? 'bg-red-50/40' : ''}`} key={text(row.productId)}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{text(row.productName)}</div>
                      <div className="font-mono text-xs font-semibold text-slate-400">{text(row.productCode)}</div>
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-500">{text(row.metalGroup)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{money(row.pendingSaleQty)}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{num(row.avgPrice) > 0 ? money(row.avgPrice) : '-'}</td>
                    <td className="bg-amber-50/40 px-4 py-3 text-right font-semibold text-amber-700">{num(row.bestPlanPrice) > 0 ? money(row.bestPlanPrice) : '-'}</td>
                    <td className="bg-amber-50/40 px-4 py-3 text-right font-medium text-slate-700">{num(row.bestPlanPct) > 0 ? `${money(row.bestPlanPct)}%` : '-'}</td>
                    <td className={`bg-emerald-50/40 px-4 py-3 text-right font-bold ${num(row.projectedProfit) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{num(row.bestPlanPrice) > 0 ? money(row.projectedProfit) : '-'}</td>
                    <td className={`bg-emerald-50/40 px-4 py-3 text-right font-semibold ${num(row.projectedMarginPct) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{num(row.bestPlanPrice) > 0 ? `${money(row.projectedMarginPct)}%` : '-'}</td>
                    <td className={`px-4 py-3 text-right font-bold ${shortage ? 'text-red-600' : 'text-emerald-700'}`}>{money(row.realPendingSale)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-rose-700">{money(row.lockedSell)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-violet-700">{money(row.lockedBuy)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-700">{money(row.stock)}</td>
                  </tr>
                )
              })}
              {!pendingSaleRows.length ? (
                <tr>
                  <td className="px-4 py-8 text-center text-xs font-semibold text-slate-400" colSpan={12}>ยังไม่มีข้อมูล ทองแดง / ทองเหลือง — เมื่อมี PO Buy / บิลซื้อ / PO Sell ระบบจะคำนวณให้อัตโนมัติ</td>
                </tr>
              ) : null}
            </tbody>
            {pendingSaleRows.length ? (
              <tfoot className="border-t border-slate-200 bg-slate-50/50 font-bold text-slate-700">
                <tr>
                  <td className="px-4 py-3 text-xs" colSpan={2}>รวม</td>
                  <td className="px-4 py-3 text-right text-xs text-emerald-700">{money(pendingSaleTotals.totalPendingSaleQty)}</td>
                  <td colSpan={5} />
                  <td className={`px-4 py-3 text-right text-xs ${num(pendingSaleTotals.totalRealPending) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(pendingSaleTotals.totalRealPending)}</td>
                  <td className="px-4 py-3 text-right text-xs text-rose-700">{money(pendingSaleTotals.totalLockedSell)}</td>
                  <td className="px-4 py-3 text-right text-xs text-violet-700">{money(pendingSaleTotals.totalLockedBuy)}</td>
                  <td className="px-4 py-3 text-right text-xs text-blue-700">{money(pendingSaleTotals.totalStock)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        <div className="space-y-3 bg-slate-50/20 p-4 lg:hidden">
          {pagedPendingSaleRows.map((row) => {
            const shortage = num(row.realPendingSale) < 0
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
                  <div><span className="mb-0.5 block text-slate-400 font-medium">รอขาย / มูลค่า</span><span className="font-semibold text-slate-800">{money(row.pendingSaleQty)} กก. / {money(row.pendingSaleValue)} ฿</span></div>
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

      <Tabs className="gap-3" value={salesPlanInsightTab} onValueChange={(value) => setSalesPlanInsightTab(value as 'analysis' | 'remaining')}>
        <div className="overflow-x-auto">
          <TabsList
            aria-label="ตารางวิเคราะห์แผนขาย"
            className="inline-flex w-full max-w-max flex-nowrap gap-2 border-b border-slate-200 bg-transparent p-0 shadow-none dark:border-slate-700"
          >
            <TabsTrigger
              className="min-w-fit rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-slate-500 data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none dark:text-slate-400 dark:data-[state=active]:border-slate-100 dark:data-[state=active]:text-slate-100"
              value="analysis"
            >
              วิเคราะห์แผนขาย vs สต๊อกว่างขาย
            </TabsTrigger>
            <TabsTrigger
              className="min-w-fit rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-slate-500 data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none dark:text-slate-400 dark:data-[state=active]:border-slate-100 dark:data-[state=active]:text-slate-100"
              value="remaining"
            >
              สต๊อกว่างขายคงเหลือ
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      <div className="rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 text-xs font-semibold text-slate-500 dark:text-slate-400">ตัวกรองข้อมูลของตารางวิเคราะห์</div>
        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="flex min-w-[200px] flex-col gap-1 text-xs font-medium text-slate-500">
            <span>หมวด</span>
            <Select className="h-9 text-sm font-medium" value={insightFilterGroup} onChange={(event) => setInsightFilterGroup(event.target.value)}>
              <option value="">ทุกหมวด</option>
              {insightFilterGroupOptions.map((group) => <option key={group} value={group}>{group}</option>)}
            </Select>
          </label>
          <div className="min-w-[260px] flex-1 lg:max-w-md">
            <div className="mb-1 text-xs font-medium text-slate-500">สินค้า</div>
            <SearchCombobox
              hideLabel
              inputClassName="h-9 text-sm font-medium text-slate-700 dark:text-slate-100"
              inputId="sales-plan-insight-filter-product"
              label="สินค้า"
              openOnFocus={false}
              options={filterProductOptions}
              placeholder="ค้นหาสินค้าในตารางล่าง"
              value={insightFilterProductCode}
              onChange={setInsightFilterProductCode}
            />
          </div>
          {insightFilterGroup || insightFilterProductCode ? (
            <button
              className="h-9 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 lg:ml-auto"
              onClick={() => {
                setInsightFilterGroup('')
                setInsightFilterProductCode('')
              }}
              type="button"
            >
              ล้างตัวกรอง
            </button>
          ) : null}
        </div>
      </div>

      {/* 2. Analysis Section */}
      {salesPlanInsightTab === 'analysis' ? (
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-4">
          <div>
          <h3 className="flex items-center gap-2 font-bold text-slate-800 text-sm dark:text-slate-100"><Calculator className="size-4 text-slate-500" />วิเคราะห์แผนขายและสต๊อกว่างขาย</h3>
          </div>
        </div>

        <TablePaginationToolbar
          page={analysisPage}
          pageSize={analysisPageSize}
          totalItems={sortedAnalysisRows.length}
          totalPages={totalAnalysisPages}
          onPageChange={setAnalysisPage}
          onPageSizeChange={setAnalysisPageSize}
          onResetWidths={analysisResize.hasCustomWidths ? analysisResize.resetColumnWidths : undefined}
        />
        {/* Desktop View Table */}
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
              {pagedAnalysisRows.map((row) => (
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
                  <td className="p-2.5 text-center min-w-0 overflow-hidden"><div className={`rounded-xl px-2.5 py-1 text-xs font-bold truncate ${recommendationBadgeClass(row.recommendation)}`} title={text(row.recommendation)}>{text(row.recommendation)}</div></td>
                </tr>
              ))}
              {!sortedAnalysisRows.length ? <tr><td className="py-8 text-center text-slate-400 font-semibold" colSpan={salesPlanAnalysisColumns.length}>ไม่มีสต๊อกทองแดง/ทองเหลืองให้วิเคราะห์</td></tr> : null}
            </tbody>
            {analysisRows.length ? <tfoot className="border-t border-slate-200 bg-slate-50/50 font-bold text-slate-700"><tr><td className="p-3 text-xs" colSpan={2}>รวม</td><td className="p-3 text-right text-slate-700 text-xs">{money(stockTotal)}</td><td className="p-3 text-right text-emerald-600 text-xs">{money(lockedTotal)}</td><td className="bg-yellow-50/20 p-3 text-right text-yellow-600 text-xs">{money(remainingKgTotal)}</td><td colSpan={3} /><td className={`p-3 text-right text-xs ${projectedProfitTotal >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{money(projectedProfitTotal)}</td><td colSpan={2} /></tr></tfoot> : null}
          </table>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden p-4 space-y-3 bg-slate-50/20 border-t border-slate-100">
          {pagedAnalysisRows.map((row) => (
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
                <span className={`rounded-xl px-2.5 py-1 text-xs font-bold ${recommendationBadgeClass(row.recommendation)}`}>{text(row.recommendation)}</span>
              </div>
            </div>
          ))}
          {!sortedAnalysisRows.length ? <div className="text-center text-slate-400 py-4 font-semibold text-xs">ไม่มีสต๊อกทองแดง/ทองเหลืองให้วิเคราะห์</div> : null}
        </div>
      </div>

      ) : (
      /* 3. Containers Remaining Section */
      <div className="rounded-md border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/50 p-4">
          <h3 className="flex items-center gap-2 font-bold text-slate-800 text-sm dark:text-slate-100"><Calculator className="size-4 text-slate-500" />สต๊อกว่างขายหลังหักแผนที่ล็อก — เดือน {(month || data?.filters.month) ?? ''}</h3>
          <div className="text-xs flex items-center gap-1.5">
            <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-slate-700 font-bold">รวม {money(remainingKgTotal)} กก.</span>
            <span className="rounded-xl bg-emerald-50 px-2.5 py-1 text-emerald-700 font-bold border border-emerald-100">มูลค่า WAC {money(remainingValueTotal)}</span>
          </div>
        </div>

        <TablePaginationToolbar
          page={remainingPage}
          pageSize={remainingPageSize}
          totalItems={sortedRemainingRows.length}
          totalPages={totalRemainingPages}
          onPageChange={setRemainingPage}
          onPageSizeChange={setRemainingPageSize}
          onResetWidths={remainingResize.hasCustomWidths ? remainingResize.resetColumnWidths : undefined}
        />
        {/* Desktop View Table */}
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
              {pagedRemainingRows.map((row) => (
                <tr className={`hover:bg-slate-50/50 transition-colors ${num(row.remainingKg) > 0 ? '' : 'opacity-60'}`} key={`${text(row.code)}-remain`}>
                  <td className="p-2.5 min-w-0 overflow-hidden">
                    <div className="truncate text-slate-800 font-semibold" title={text(row.name)}>{text(row.name)}</div>
                    <div className="truncate font-mono text-xs text-slate-400 font-semibold" title={text(row.code)}>{text(row.code)}</div>
                  </td>
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
            {analysisRows.length ? <tfoot className="border-t border-slate-100 bg-slate-50/50 font-bold text-slate-700"><tr><td className="p-3 text-xs" colSpan={2}>รวม</td><td className="p-3 text-right text-slate-700 text-xs">{money(stockTotal)}</td><td className="p-3 text-right text-emerald-600 text-xs">{money(lockedTotal)}</td><td className="p-3 text-right text-emerald-600 text-xs">{money(0)}</td><td className="bg-yellow-50/20 p-3 text-right text-yellow-600 text-xs">{money(remainingKgTotal)}</td><td className="bg-yellow-50/20 p-3 text-right text-yellow-600 text-xs">{money(remainingContainers)}</td><td /><td className="p-3 text-right text-slate-700 text-xs">{money(remainingValueTotal)}</td></tr></tfoot> : null}
          </table>
        </div>

        {/* Mobile View */}
        <div className="block lg:hidden p-4 space-y-3 bg-slate-50/20 border-t border-slate-100">
          {pagedRemainingRows.map((row) => (
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
      )}

      {error ? <ErrorBox text={error} /> : null}
    </section>
  )
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="space-y-1 text-xs font-bold text-slate-600 block"><span>{label}</span>{children}</label>
}

function PendingStatCard({ label, sublabel, tone = 'neutral', value }: { label: string; sublabel: string; tone?: 'danger' | 'neutral' | 'success'; value: string }) {
  const toneClass = tone === 'danger'
    ? 'bg-red-50 text-red-600 border-red-100 dark:bg-red-950/30 dark:text-red-300 dark:border-red-900/60'
    : tone === 'success'
      ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60'
      : 'bg-white text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700'

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${toneClass}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      <div className="mt-1 text-xs font-medium opacity-80">{sublabel}</div>
    </div>
  )
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
  const [salesCardFilter, setSalesCardFilter] = useState<CommissionSalesCardFilter>('all')
  const [selectedSales, setSelectedSales] = useState('')
  const [drilldownTab, setDrilldownTab] = useState<CommissionDrilldownTab>('categoryAll')
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

  function setCommissionQuickRange(range: CommissionQuickRange) {
    const nextRange = commissionDateRange(range)
    setFrom(nextRange.from)
    setTo(nextRange.to)
  }

  function isCommissionQuickRangeActive(range: CommissionQuickRange) {
    const nextRange = commissionDateRange(range)
    return from === nextRange.from && to === nextRange.to
  }

  function resetCommissionOverviewFilters() {
    setCommissionQuickRange('month')
    setBranchId('')
    setSalesCardFilter('all')
  }

  const sales = (data?.salesRows ?? []).find((row) => text(row.id) === selectedSales)
  const billRows = (data?.billRows ?? []).filter((row) => text(row.salesId) === selectedSales)
  const visibleSalesRows = useMemo(() => {
    const rows = data?.salesRows ?? []
    if (salesCardFilter === 'eligible') return rows.filter((row) => row.commissionEligible)
    if (salesCardFilter === 'activity') return rows.filter((row) => row.billCount > 0)
    return rows
  }, [data?.salesRows, salesCardFilter])

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

  const handleDownloadExcel = async () => {
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
    await downloadExcel(`sales_tracking_${sales.code || sales.id}.xlsx`, headers, rows)
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
        <button
          className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          type="button"
          onClick={() => {
            setDrilldownTab('categoryAll')
            setSelectedSales('')
            setTable3Page(1)
            setTable4Page(1)
            setTable4Search('')
          }}
        >
          ← กลับหน้าหลัก
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
              onClick={handleDownloadExcel}
              className="flex h-9 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-normal text-white hover:bg-emerald-700"
              type="button"
            >
              ส่งออก Excel
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Metric label="จำนวนบิลรับซื้อ" value={`${count(sales.billCount)} บิล`} tone="blue" />
          <Metric label="น้ำหนักรวม" value={`${money(sales.qty)} กก.`} tone="amber" />
          <Metric label="ยอดรับซื้อรวม" value={`${money(sales.purchaseAmt)} บาท`} tone="blue" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="จำนวนที่ได้คอม" value={`${money(sales.commissionableQty)} กก.`} tone="emerald" />
          <Metric label="ยอดซื้อที่ได้คอม" value={`${money(sales.commissionableAmount)} บาท`} tone="emerald" />
          <Metric label="จำนวนที่ไม่ได้คอม" value={`${money(sales.nonCommissionableQty)} กก.`} tone="slate" />
          <Metric label="ยอดซื้อที่ไม่ได้คอม" value={`${money(sales.nonCommissionableAmount)} บาท`} tone="slate" />
        </div>

        <Tabs value={drilldownTab} onValueChange={(value) => setDrilldownTab(value as CommissionDrilldownTab)}>
          <TabsList className="w-full flex-nowrap overflow-x-auto" variant="line">
            <TabsTrigger value="categoryAll" variant="line">ยอดรวมตามหมวด</TabsTrigger>
            <TabsTrigger value="commissionableCategories" variant="line">ยอดได้คอม</TabsTrigger>
            <TabsTrigger value="suppliers" variant="line">ผู้ขาย</TabsTrigger>
            <TabsTrigger value="items" variant="line">รายการสินค้า</TabsTrigger>
          </TabsList>
        </Tabs>

        {drilldownTab === 'categoryAll' ? (
          <Panel title="ยอดรวมตามหมวดสินค้า">
            {table1Resize.hasCustomWidths ? (
              <div className="mb-2 hidden justify-end lg:flex">
                <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={table1Resize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
              </div>
            ) : null}
            <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
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
            <CommissionMobileRows
              empty="ไม่มีข้อมูลการซื้อ"
              rows={sortedTable1Data.map((row) => ({
                key: row.category,
                title: row.category,
                summary: [
                  { label: 'จำนวน (กก.)', value: money(row.qty) },
                  { label: 'ยอดซื้อ (บาท)', value: money(row.amount) },
                ],
              }))}
            />
          </Panel>
        ) : null}

        {drilldownTab === 'commissionableCategories' ? (
          <Panel title="ยอดซื้อที่ได้รับค่าคอมมิชชั่นตามหมวดสินค้า">
            {table2Resize.hasCustomWidths ? (
              <div className="mb-2 hidden justify-end lg:flex">
                <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={table2Resize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
              </div>
            ) : null}
            <div className="hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
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
            <CommissionMobileRows
              empty="ไม่มีข้อมูลรายการที่ได้คอมมิชชั่น"
              rows={sortedTable2Data.map((row) => ({
                key: row.category,
                title: row.category,
                summary: [
                  { label: 'จำนวน (กก.)', value: money(row.qty) },
                  { label: 'ยอดซื้อ (บาท)', value: money(row.amount) },
                ],
              }))}
            />
          </Panel>
        ) : null}

        {drilldownTab === 'suppliers' ? (
          <Panel title="ผู้ขายในความดูแล">
          {table3Resize.hasCustomWidths ? (
            <div className="mb-2 hidden justify-end lg:flex">
              <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={table3Resize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
            </div>
          ) : null}
          <div className="mb-3 hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
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
          <CommissionMobileRows
            empty="ไม่มีข้อมูลผู้ขาย"
            rows={pagedTable3.map((row) => ({
              key: row.supplier,
              title: row.supplier,
              details: [{ label: 'จำนวนบิล', value: row.bills }],
              summary: [
                { label: 'น้ำหนัก (กก.)', value: money(row.qty) },
                { label: 'ยอดรับซื้อ (บาท)', value: money(row.amount) },
                { label: '% ของทั้งหมด', value: row.pct.toFixed(2) + '%' },
              ],
            }))}
          />
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
        ) : null}

        {drilldownTab === 'items' ? (
          <Panel title="รายการสินค้าละเอียด">
          <div className="mb-3 flex gap-2">
            <input
              className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white font-semibold text-slate-700 h-9 w-64 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200 transition-all"
              placeholder="ค้นหาเลขที่บิล, ผู้ขาย, สินค้า..."
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
          <div className="mb-3 hidden overflow-x-auto rounded-md border border-slate-200 bg-white shadow-sm lg:block">
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
          <CommissionMobileRows
            empty="ไม่มีข้อมูลสินค้าละเอียด"
            rows={pagedTable4.map((row) => {
              const profitDiff = sales.commissionEligible ? num(row.salesPrice) - num(row.price) : 0
              return {
                key: row.id,
                title: text(row.docNo),
                badge: row.isCommissionable ? (
                  <span className="inline-flex rounded-md border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">ได้คอมมิชชั่น</span>
                ) : (
                  <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">ไม่ได้คอม</span>
                ),
                details: [
                  { label: 'วันที่', value: formatDateDisplay(text(row.date)) },
                  { label: 'ผู้ขาย', value: text(row.supplierName) },
                  { label: 'สินค้า', value: text(row.productName) },
                ],
                summary: [
                  { label: 'น้ำหนัก (กก.)', value: money(row.qty) },
                  { label: 'ราคาซื้อ', value: money(row.price) },
                  { label: 'ราคาหน้าใบ', value: sales.commissionEligible && row.salesPrice > 0 ? money(row.salesPrice) : '-' },
                  { label: 'ส่วนต่างกำไร', value: sales.commissionEligible && row.salesPrice > 0 ? money(profitDiff) : '-' },
                  { label: 'ยอดรวม (บาท)', value: money(row.amount) },
                ],
              }
            })}
          />
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
        ) : null}
      </section>
    )
  }

  // 1. Overview Page State
  return (
    <section className="space-y-4 text-[13.5px]">
      {/* Filters Toolbar */}
      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="grid items-end gap-3 md:grid-cols-3">
          <Field label="จากวันที่">
            <DatePickerInput className="w-full mt-1" value={from} onChange={setFrom} />
          </Field>
          <Field label="ถึงวันที่">
            <DatePickerInput className="w-full mt-1" value={to} onChange={setTo} />
          </Field>
          <Field label="สาขา">
            <Select className="mt-1 h-9 text-xs font-semibold" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">ทั้งหมด</option>
              {(data?.filters.branches ?? []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-500">📋 บิลซื้อทั้งหมดในช่วงเวลา:</span>
            <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{count(data?.totals.bills)} บิล</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <span className="font-medium text-slate-500">ช่วงเวลา:</span>
            {commissionQuickRangeOptions.map((option) => (
              <button
                aria-pressed={isCommissionQuickRangeActive(option.value)}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition ${isCommissionQuickRangeActive(option.value) ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                key={option.value}
                type="button"
                onClick={() => setCommissionQuickRange(option.value)}
              >
                {option.label}
              </button>
            ))}
            {isLoading ? <span className="animate-pulse font-medium text-slate-400">กำลังโหลด...</span> : null}
            {!isCommissionQuickRangeActive('month') || branchId || salesCardFilter !== 'all' ? (
              <button className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={resetCommissionOverviewFilters}>
                ล้างตัวกรอง
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 8 Summary Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">สรุปยอดตามพนักงานขาย</h2>
          <div aria-label="ตัวกรองการ์ดพนักงานขาย" className="flex flex-wrap items-center gap-2" role="group">
            <span className="text-xs font-medium text-slate-500">แสดง:</span>
            {commissionSalesCardFilterOptions.map((option) => (
              <button
                aria-pressed={salesCardFilter === option.value}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition ${salesCardFilter === option.value ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                key={option.value}
                type="button"
                onClick={() => setSalesCardFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleSalesRows.map((row) => (
            <button
              key={text(row.id)}
              className="group flex min-h-[340px] flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50/60 focus:ring-2 focus:ring-blue-100"
              type="button"
              onClick={() => {
                setDrilldownTab('categoryAll')
                setSelectedSales(text(row.id))
              }}
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
                <SalesCardMetric align="center" label="บิล" tone="slate" value={count(row.billCount)} />
                <SalesCardMetric align="center" label="Supplier" tone="slate" value={count(row.supplierCount)} />
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
          {!isLoading && visibleSalesRows.length === 0 ? (
            <div className="col-span-full rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm font-medium text-slate-500">
              ไม่พบพนักงานขายตามตัวกรองนี้
            </div>
          ) : null}
        </div>
      </section>

      {/* สรุปยอดซื้อรายพนักงานขาย */}
      <Panel title="สรุปยอดซื้อรายพนักงานขาย">
        <div className="mb-3.5 flex items-center gap-3">
          <label className="text-xs font-bold text-slate-500">เลือกดูพนักงานขาย:</label>
          <Select
            className="h-9 w-auto min-w-48 text-xs font-semibold"
            value={summarySalesFilter}
            onChange={(e) => setSummarySalesFilter(e.target.value)}
          >
            <option value="ALL">พนักงานขายทั้งหมด</option>
            {(data?.salesRows ?? []).map((sale) => (
              <option key={text(sale.id)} value={text(sale.id)}>{text(sale.name)}</option>
            ))}
          </Select>
        </div>

        {summaryResize.hasCustomWidths ? (
          <div className="mb-2 hidden justify-end lg:flex">
            <button className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" type="button" onClick={summaryResize.resetColumnWidths}>คืนค่าเดิมตาราง</button>
          </div>
        ) : null}
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
              {summaryFlatRows.map((row) => (
                <tr key={`${row.salesId}-${row.category}`} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-3 font-bold text-slate-800">
                    <button
                      className="text-blue-600 hover:text-blue-800 hover:underline outline-none text-left font-bold"
                      type="button"
                      onClick={() => {
                        setDrilldownTab('categoryAll')
                        setSelectedSales(row.salesId)
                      }}
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
                  <td className="p-3 text-slate-800" colSpan={2}>รวมพนักงานขายทั้งหมด</td>
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
        <CommissionMobileRows
          empty="ไม่มีข้อมูล"
          rows={summaryFlatRows.map((row) => ({
            key: row.salesId + '-' + row.category,
            title: (
              <button
                className="text-left font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                type="button"
                onClick={() => {
                  setDrilldownTab('categoryAll')
                  setSelectedSales(row.salesId)
                }}
              >
                {row.salesName}
              </button>
            ),
            badge: <span className="text-xs text-slate-500">{row.category}</span>,
            summary: [
              { label: 'จำนวน (กก.)', value: money(row.qty) },
              { label: 'มูลค่ารวม (บาท)', value: money(row.amount) },
            ],
          }))}
        />
      </Panel>

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
      <div className="border-b border-slate-200 bg-white p-3 text-sm font-bold text-slate-800">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function CommissionMobileRows({ empty, rows }: { empty: string; rows: CommissionMobileRow[] }) {
  return (
    <div className="space-y-3 lg:hidden">
      {rows.map((row) => (
        <div key={row.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
            <div className="min-w-0 font-semibold text-slate-800">{row.title}</div>
            {row.badge ? <div className="shrink-0">{row.badge}</div> : null}
          </div>
          {row.details?.length ? (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 rounded-md bg-slate-50 p-2 text-xs">
              {row.details.map((value) => (
                <div key={value.label}>
                  <div className="text-slate-500">{value.label}</div>
                  <div className="mt-0.5 font-semibold text-slate-800">{value.value}</div>
                </div>
              ))}
            </div>
          ) : null}
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-2 text-right text-xs">
            {row.summary.map((value) => (
              <div key={value.label}>
                <div className="text-slate-500">{value.label}</div>
                <div className="mt-0.5 font-semibold text-slate-800">{value.value}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {rows.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs font-semibold text-slate-400 shadow-sm">{empty}</div> : null}
    </div>
  )
}

function LmeEditableCard({ label, manualOnly = false, onChange, readOnly = false, value }: { label: string; manualOnly?: boolean; onChange: (value: string) => void; readOnly?: boolean; value: number }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
        <span>{label}</span>
        {readOnly ? <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-extrabold text-slate-700 dark:bg-slate-700 dark:text-slate-200">ดึงจาก API</span> : null}
        {!readOnly && manualOnly ? <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-extrabold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">กรอกเอง</span> : null}
      </div>
      <input
        className={`h-14 px-4 text-2xl font-extrabold ${(readOnly || manualOnly) ? salesPlanReadonlyNumberInputClass : salesPlanNumberInputClass}`}
        disabled={readOnly}
        min="0"
        onChange={(event) => onChange(event.target.value)}
        step="any"
        type="number"
        value={Number.isFinite(value) ? value : 0}
      />
    </label>
  )
}

type CommissionMetricTone = 'amber' | 'blue' | 'emerald' | 'purple' | 'red' | 'slate'

const commissionMetricIcons: Record<CommissionMetricTone, ReactNode> = {
  amber: '⏳',
  blue: '📋',
  emerald: '📈',
  purple: '📦',
  red: '⚠️',
  slate: '🏷️',
}

function Metric({ label, tone, value }: { label: string; tone: CommissionMetricTone; value: string }) {
  return <KpiCard icon={commissionMetricIcons[tone]} label={label} tone={tone} value={value} />
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

function ErrorBox({ text: value }: { text: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 shadow-sm">
      {value}
    </div>
  )
}
