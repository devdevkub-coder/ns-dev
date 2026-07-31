import { Prisma } from '../../../generated/prisma/client'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { toBangkokDateOnly, toBangkokEndOfDay, toNumber } from '@/lib/server/daily'
import { FinancialStatementInputError } from '@/lib/server/finance-accounting-statements'
import { buildFinanceCashPosition } from '@/lib/server/finance-accounting-cash-position'
import { prisma } from '@/lib/server/prisma'
import { purchaseBillItemRows } from '@/lib/server/purchase-bill-items'
import { listActiveBranches, listActiveBranchesByCodes } from '@/lib/server/reference-master-cache'

const CANCELLED_STATUSES = ['cancelled', 'void', 'ยกเลิก']
const DAY_MS = 86_400_000
const STOCK_FINANCE_OUTPUT_CATEGORIES = ['RM', 'WIP', 'FG'] as const

type StockFinanceOutputCategory = (typeof STOCK_FINANCE_OUTPUT_CATEGORIES)[number]

export type PeriodDaysFilter = {
  allowedBranchCodes?: string[] | null
  asOf: Date
  branchId?: string
  periodDays: number
}

export type ProfitLeakFilter = {
  branchId?: string
  from: Date
  targetMargin: number
  to: Date
}

export type StockFinanceHistoryFilter = {
  allowedBranchCodes?: string[] | null
  branchId?: string
  from: Date
  to: Date
}

type JsonRecord = Record<string, unknown>

function dateOnly(date: Date) {
  return toBangkokDateOnly(date)
}

function endOfDay(date: Date) {
  return toBangkokEndOfDay(date)
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function daysBetween(left: Date, right: Date) {
  return Math.max(1, Math.floor((left.getTime() - right.getTime()) / DAY_MS) + 1)
}

function notCancelledWhere() {
  return { NOT: { status: { in: CANCELLED_STATUSES } } }
}

function branchWhere(branchId?: bigint | null) {
  return branchId ? { branch_id: branchId } : {}
}

function sourceState(extra: string[] = []) {
  return {
    basis: 'Working-capital/profit-leak source from operational transactions. Not a GL close or statutory report.',
    limitations: [
      'Inventory value uses stock_ledger movement value as WAC-style operational source.',
      'Profit leak flags use sales/purchase item JSON where available and header totals as fallback.',
      'No financing, reclass, stock adjustment, production loss posting, payment, receipt, or GL write is enabled.',
      ...extra,
    ],
    writeActionsEnabled: false,
  }
}

async function listBranches() {
  const branches = await listActiveBranches()
  return branches.map((branch) => {
    const code = requireBusinessCode(branch.code, `สาขา ${branch.id}`)
    return { code, id: code, name: branch.name }
  })
}

async function listScopedBranches(allowedBranchCodes?: string[] | null) {
  const branches = allowedBranchCodes === undefined || allowedBranchCodes === null
    ? await listActiveBranches()
    : await listActiveBranchesByCodes(allowedBranchCodes)
  return branches.map((branch) => {
    const code = requireBusinessCode(branch.code, `สาขา ${branch.id}`)
    return { code, id: code, name: branch.name }
  })
}

async function resolveStockBranchIds(filter: Pick<PeriodDaysFilter, 'allowedBranchCodes' | 'branchId'>) {
  const selectedBranch = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  if (filter.branchId && !selectedBranch) {
    throw new FinancialStatementInputError(`ไม่พบสาขาที่ใช้งาน: ${filter.branchId}`)
  }

  if (filter.allowedBranchCodes === undefined || filter.allowedBranchCodes === null) {
    return selectedBranch ? [selectedBranch.id] : null
  }

  if (!filter.allowedBranchCodes.length) return []

  const allowedBranches = await listActiveBranchesByCodes(filter.allowedBranchCodes)
  const allowedIds = allowedBranches.map((branch) => parseInternalBigIntId(branch.id)).filter((id): id is bigint => id !== null)
  if (selectedBranch) {
    return allowedIds.some((id) => id === selectedBranch.id) ? [selectedBranch.id] : []
  }
  return allowedIds
}

function stockBranchSql(branchIds: bigint[] | null) {
  return branchIds == null
    ? Prisma.sql`TRUE`
    : branchIds.length === 0
      ? Prisma.sql`FALSE`
      : Prisma.sql`snap.branch_id IN (${Prisma.join(branchIds)})`
}

function stockFinanceSourceState() {
  return {
    basis: 'Stock Finance reads stock_ledger movements up to the selected as-of date, grouped by stock balance dimensions before product/status summary.',
    limitations: [
      'WAC = stock value as of date / stock quantity as of date from the same stock_ledger cutoff.',
      'Stock balances are first grouped by product, branch, warehouse, lot, output category, and not-available-for-sale flag.',
      'Paid/unpaid stock value and price-opportunity are not shown because this page has no approved source-of-truth linkage for those facts.',
      'Pending-out stock_holds is outside WAC and is not included in this operational stock value report.',
      'No financing, reclass, stock adjustment, production loss posting, payment, receipt, or GL write is enabled.',
    ],
    writeActionsEnabled: false,
  }
}

async function cashAsOf(asOf: Date, branchId?: bigint | null) {
  const position = await buildFinanceCashPosition({ asOf, branchIds: branchId == null ? null : [branchId] })
  return position.cashAndBank
}

function jsonRows(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is JsonRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
}

function jsonNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/,/g, '')) : 0
    if (Number.isFinite(numeric) && numeric !== 0) return numeric
  }
  return 0
}

function jsonString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

type StockSnapshotRow = {
  age_date: Date | null
  code: string | null
  days_since_sale_date: Date | null
  metal_group: string | null
  name: string | null
  product_id: bigint | null
  qty: Prisma.Decimal | number | null
  status: string | null
  value: Prisma.Decimal | number | null
}

function requireStockFinanceOutputCategory(value: string | null): StockFinanceOutputCategory {
  if (value === 'RM' || value === 'WIP' || value === 'FG') return value
  throw new FinancialStatementInputError('stock_ledger.output_category ต้องเป็น RM, WIP หรือ FG')
}

async function stockSnapshot(asOf: Date, branchIds?: bigint[] | null) {
  if (branchIds && branchIds.length === 0) {
    return { products: [], totalQty: 0, totalValue: 0 }
  }

  const branchFilter = branchIds == null
    ? Prisma.sql`TRUE`
    : Prisma.sql`sl.branch_id IN (${Prisma.join(branchIds)})`
  const rows = await prisma.$queryRaw<StockSnapshotRow[]>`
    WITH ledger_scope AS (
      SELECT
        sl.product_id,
        sl.branch_id,
        sl.warehouse_id,
        sl.lot_no,
        sl.output_category AS status,
        sl.not_available_for_sale,
        sl.date,
        sl.qty_in::numeric AS qty_in,
        sl.qty_out::numeric AS qty_out,
        sl.value_in::numeric AS value_in,
        sl.value_out::numeric AS value_out
      FROM stock_ledger sl
      WHERE sl.date <= ${endOfDay(asOf)}
        AND ${branchFilter}
    ),
    bucket_balance AS (
      SELECT
        product_id,
        branch_id,
        warehouse_id,
        lot_no,
        status,
        not_available_for_sale,
        SUM(qty_in - qty_out) AS qty,
        SUM(value_in - value_out) AS value,
        MAX(CASE WHEN qty_in > 0 THEN date END) AS last_in_date,
        MAX(CASE WHEN qty_out > 0 THEN date END) AS last_out_date
      FROM ledger_scope
      GROUP BY product_id, branch_id, warehouse_id, lot_no, status, not_available_for_sale
      HAVING ABS(SUM(qty_in - qty_out)) > 0.001 OR ABS(SUM(value_in - value_out)) > 0.01
    )
    SELECT
      bb.product_id,
      p.code,
      p.name,
      p.metal_group,
      bb.status,
      SUM(bb.qty) AS qty,
      SUM(bb.value) AS value,
      MAX(bb.last_in_date) AS age_date,
      MAX(bb.last_out_date) AS days_since_sale_date
    FROM bucket_balance bb
    LEFT JOIN products p ON p.id = bb.product_id
    GROUP BY bb.product_id, p.code, p.name, p.metal_group, bb.status
    ORDER BY SUM(bb.value) DESC
  `
  const products = rows.map((row) => {
    const code = row.code ?? ''
    const status = requireStockFinanceOutputCategory(row.status)
    const qty = toNumber(row.qty)
    const value = toNumber(row.value)
    return {
      ageDays: row.age_date ? Math.max(0, Math.floor((asOf.getTime() - row.age_date.getTime()) / DAY_MS)) : 0,
      code,
      daysSinceSale: row.days_since_sale_date ? Math.max(0, Math.floor((asOf.getTime() - row.days_since_sale_date.getTime()) / DAY_MS)) : 9999,
      id: `${row.product_id == null ? 'UNKNOWN' : String(row.product_id)}:${status}`,
      metalGroup: row.metal_group ?? '-',
      name: row.name ?? '-',
      qty,
      status,
      value,
    }
  })
  return {
    products,
    totalQty: products.reduce((sum, row) => sum + row.qty, 0),
    totalValue: products.reduce((sum, row) => sum + row.value, 0),
  }
}

async function workingInputs(filter: PeriodDaysFilter) {
  const branchRef = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const from = addDays(filter.asOf, -filter.periodDays + 1)
  const to = endOfDay(filter.asOf)
  const branch = branchWhere(branchRef?.id ?? null)
  return Promise.all([
    prisma.sales_bills.findMany({ include: { customers: { select: { name: true } } }, take: 20000, where: { ...notCancelledWhere(), ...branch, date: { gte: from, lte: to } } }),
    prisma.purchase_bills.findMany({ include: { suppliers: { select: { name: true } } }, take: 20000, where: { ...notCancelledWhere(), ...branch, date: { gte: from, lte: to } } }),
    prisma.sales_bills.findMany({ include: { customers: { select: { name: true } } }, take: 20000, where: { ...notCancelledWhere(), ...branch, date: { lte: to } } }),
    prisma.purchase_bills.findMany({ include: { suppliers: { select: { name: true } } }, take: 20000, where: { ...notCancelledWhere(), ...branch, date: { lte: to } } }),
    prisma.loan_schedules.findMany({ take: 10000, where: { due_date: { gte: filter.asOf, lte: addDays(filter.asOf, 365) }, payment_status: { not: 'Paid' } } }),
    stockSnapshot(filter.asOf, branchRef?.id ? [branchRef.id] : null),
    cashAsOf(filter.asOf, branchRef?.id ?? null),
    listBranches(),
  ])
}

export async function buildWorkingCapital(filter: PeriodDaysFilter) {
  const [sales, purchases, salesAsOf, purchasesAsOf, schedules, stock, cash, branches] = await workingInputs(filter)
  type SalesBillRow = (typeof sales)[number]
  type PurchaseBillRow = (typeof purchases)[number]
  type SalesAsOfRow = (typeof salesAsOf)[number]
  type PurchaseAsOfRow = (typeof purchasesAsOf)[number]
  type ScheduleRow = (typeof schedules)[number]
  const prevTo = addDays(filter.asOf, -filter.periodDays)
  const prevFrom = addDays(prevTo, -filter.periodDays + 1)
  const revenue = sales.reduce((sum: number, bill: SalesBillRow) => sum + (toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount)), 0)
  const cogs = sales.reduce((sum: number, bill: SalesBillRow) => sum + (toNumber(bill.cogs_amount) || toNumber(bill.total_cost)), 0)
  const purchaseTotal = purchases.reduce((sum: number, bill: PurchaseBillRow) => sum + (toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount)), 0)
  const ar = salesAsOf.reduce((sum: number, bill: SalesAsOfRow) => sum + Math.max(0, toNumber(bill.receivable_balance) || toNumber(bill.total_amount) - toNumber(bill.received_amount)), 0)
  const ap = purchasesAsOf.reduce((sum: number, bill: PurchaseAsOfRow) => sum + Math.max(0, toNumber(bill.payable_balance) || toNumber(bill.total_amount) - toNumber(bill.paid_amount)), 0)
  const currentLoan = schedules.reduce((sum: number, row: ScheduleRow) => sum + Math.max(0, toNumber(row.principal_amount) - toNumber(row.paid_amount)), 0)
  const dailyRevenue = revenue / Math.max(1, filter.periodDays)
  const dailyCogs = cogs / Math.max(1, filter.periodDays)
  const dailyPurchases = purchaseTotal / Math.max(1, filter.periodDays)
  const arDays = dailyRevenue > 0 ? ar / dailyRevenue : 0
  const invDays = dailyCogs > 0 ? stock.totalValue / dailyCogs : 0
  const apDays = dailyPurchases > 0 ? ap / dailyPurchases : 0
  const ccc = arDays + invDays - apDays
  const currentAssets = cash + ar + stock.totalValue
  const currentLiab = ap + currentLoan
  const currentRatio = currentLiab > 0 ? currentAssets / currentLiab : 0
  const quickRatio = currentLiab > 0 ? (cash + ar) / currentLiab : 0
  const stockTurnover = stock.totalValue > 0 ? cogs / stock.totalValue : 0
  const annualizedTurnover = stockTurnover * (365 / Math.max(1, filter.periodDays))
  const previousSales = salesAsOf.filter((bill: SalesAsOfRow) => bill.date >= prevFrom && bill.date <= endOfDay(prevTo))
  const previousPurchases = purchasesAsOf.filter((bill: PurchaseAsOfRow) => bill.date >= prevFrom && bill.date <= endOfDay(prevTo))
  const previousRevenue = previousSales.reduce((sum: number, bill: SalesAsOfRow) => sum + (toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount)), 0)
  const previousCogs = previousSales.reduce((sum: number, bill: SalesAsOfRow) => sum + (toNumber(bill.cogs_amount) || toNumber(bill.total_cost)), 0)
  const previousPurchaseTotal = previousPurchases.reduce((sum: number, bill: PurchaseAsOfRow) => sum + (toNumber(bill.subtotal) || toNumber(bill.total_amount) - toNumber(bill.vat_amount)), 0)
  const previousDailyRevenue = previousRevenue / Math.max(1, filter.periodDays)
  const previousDailyCogs = previousCogs / Math.max(1, filter.periodDays)
  const previousDailyPurchases = previousPurchaseTotal / Math.max(1, filter.periodDays)
  const previousArDays = previousDailyRevenue > 0 ? ar / previousDailyRevenue : 0
  const previousInvDays = previousDailyCogs > 0 ? stock.totalValue / previousDailyCogs : 0
  const previousApDays = previousDailyPurchases > 0 ? ap / previousDailyPurchases : apDays
  const prevCcc = previousArDays + previousInvDays - previousApDays
  const trend: 'better' | 'same' | 'worse' = ccc < prevCcc ? 'better' : ccc > prevCcc ? 'worse' : 'same'

  return {
    branches,
    calculationRows: [
      { label: `Revenue (${filter.periodDays} วัน)`, value: revenue },
      { label: `COGS (${filter.periodDays} วัน)`, value: cogs },
      { label: `Purchases (${filter.periodDays} วัน)`, value: purchaseTotal },
      { label: 'AR คงเหลือ', tone: 'blue', value: ar },
      { label: 'AP คงเหลือ', tone: 'emerald', value: ap },
      { label: 'Inventory (WAC)', tone: 'amber', value: stock.totalValue },
      { label: 'Cash & Bank', value: cash },
      { label: 'Current Loan (12m)', value: currentLoan },
      { label: 'Current Assets', tone: 'purple', value: currentAssets },
      { label: 'Current Liabilities', tone: 'purple', value: currentLiab },
    ],
    filters: { asOf: dateOnly(filter.asOf), branchId: filter.branchId ?? 'ALL', from: dateOnly(addDays(filter.asOf, -filter.periodDays + 1)), periodDays: filter.periodDays },
    sourceState: sourceState(),
    summary: { annualizedTurnover, ap, apDays, ar, arDays, cash, ccc, cogs, currentAssets, currentLiab, currentLoan, currentRatio, inv: stock.totalValue, invDays, prevCcc, purchases: purchaseTotal, quickRatio, revenue, stockTurnover, trend },
  }
}

export async function buildStockFinance(filter: PeriodDaysFilter) {
  const branchIds = await resolveStockBranchIds(filter)
  const stock = await stockSnapshot(filter.asOf, branchIds)
  const branches = await listScopedBranches(filter.allowedBranchCodes)
  const totalValue = stock.totalValue
  const byStatus = stock.products.reduce<Record<StockFinanceOutputCategory, number>>((acc, row) => {
    acc[row.status] += row.value
    return acc
  }, { FG: 0, RM: 0, WIP: 0 })
  const aging = [
    { count: 0, key: '0-30', value: 0 },
    { count: 0, key: '31-60', value: 0 },
    { count: 0, key: '61-90', value: 0 },
    { count: 0, key: '90+', value: 0 },
  ]
  stock.products.forEach((row: (typeof stock.products)[number]) => {
    const bucket = row.ageDays <= 30 ? aging[0] : row.ageDays <= 60 ? aging[1] : row.ageDays <= 90 ? aging[2] : aging[3]
    bucket.count += 1
    bucket.value += row.value
  })
  const productRows = stock.products.map((row) => ({
    ...row,
    wac: row.qty > 0 ? row.value / row.qty : 0,
  }))
  const productsByValue = [...productRows].sort((left, right) => right.value - left.value)
  return {
    aging,
    branches,
    byStatus,
    filters: { asOf: dateOnly(filter.asOf), branchId: filter.branchId ?? 'ALL' },
    products: productsByValue,
    slowMoving: productsByValue.filter((row) => row.daysSinceSale > 60).slice(0, 15),
    sourceState: stockFinanceSourceState(),
    summary: {
      itemCount: productRows.length,
      totalQty: stock.totalQty,
      totalValue,
      weightedAvgCost: stock.totalQty > 0 ? stock.totalValue / stock.totalQty : 0,
    },
    topProducts: productsByValue.slice(0, 10),
  }
}

type StockFinanceHistoryRow = {
  refreshed_at: Date | null
  snapshot_date: Date
  total_qty: Prisma.Decimal | number | null
  total_value: Prisma.Decimal | number | null
  wac: Prisma.Decimal | number | null
}

type StockFinanceRefreshPlanRow = {
  rebuild_from: Date | null
}

async function refreshStockFinanceDailySnapshots(from: Date, to: Date, branchIds: bigint[] | null) {
  if (branchIds?.length === 0) return
  const branchArraySql = branchIds == null
    ? Prisma.sql`NULL::bigint[]`
    : Prisma.sql`ARRAY[${Prisma.join(branchIds)}]::bigint[]`
  const [plan] = await prisma.$queryRaw<StockFinanceRefreshPlanRow[]>`
    with invalidated as (
      select min(inv.affected_date) as snapshot_date
      from public.report_stock_finance_snapshot_invalidations inv
      where inv.resolved_at is null
        and inv.affected_date <= ${dateOnly(to)}::date
        and (${branchArraySql} is null or inv.branch_id = any(${branchArraySql}))
    ),
    scoped_branches as (
      select distinct sl.branch_id
      from public.stock_ledger sl
      where sl.date < ((${dateOnly(to)}::date + 1)::timestamp at time zone 'Asia/Bangkok')
        and (${branchArraySql} is null or sl.branch_id = any(${branchArraySql}))
    ),
    missing as (
      select min(days.snapshot_at::date) as snapshot_date
      from generate_series(${dateOnly(from)}::date, ${dateOnly(to)}::date, interval '1 day') as days(snapshot_at)
      cross join scoped_branches branch
      where not exists (
        select 1
        from public.report_stock_finance_daily_snapshot_refreshes refresh
        where refresh.snapshot_date = days.snapshot_at::date
          and refresh.branch_id = branch.branch_id
      )
    )
    select min(snapshot_date) as rebuild_from
    from (
      select snapshot_date from invalidated
      union all
      select snapshot_date from missing
    ) candidates
    where snapshot_date is not null
  `
  if (!plan?.rebuild_from) return
  await prisma.$executeRaw`
    select public.rebuild_stock_finance_daily_snapshots(
      ${dateOnly(plan.rebuild_from)}::date,
      ${dateOnly(to)}::date,
      ${branchArraySql}
    )
  `
}

export async function buildStockFinanceHistory(filter: StockFinanceHistoryFilter) {
  if (Number.isNaN(filter.from.getTime()) || Number.isNaN(filter.to.getTime()) || filter.from > filter.to) {
    throw new FinancialStatementInputError('ช่วงวันที่ประวัติ Stock Finance ไม่ถูกต้อง')
  }

  const branchIds = await resolveStockBranchIds(filter)
  await refreshStockFinanceDailySnapshots(filter.from, filter.to, branchIds)

  const branchFilter = stockBranchSql(branchIds)
  const rows = await prisma.$queryRaw<StockFinanceHistoryRow[]>`
    with days as (
      select generate_series(${dateOnly(filter.from)}::date, ${dateOnly(filter.to)}::date, interval '1 day')::date as snapshot_date
    ),
    daily as (
      select
        snap.snapshot_date,
        sum(snap.qty) as total_qty,
        sum(snap.value) as total_value,
        max(snap.refreshed_at) as refreshed_at
      from public.report_stock_finance_daily_snapshots snap
      where snap.snapshot_date between ${dateOnly(filter.from)}::date and ${dateOnly(filter.to)}::date
        and ${branchFilter}
      group by snap.snapshot_date
    )
    select
      days.snapshot_date,
      coalesce(daily.total_qty, 0) as total_qty,
      coalesce(daily.total_value, 0) as total_value,
      case when coalesce(daily.total_qty, 0) <> 0 then daily.total_value / daily.total_qty else 0 end as wac,
      daily.refreshed_at
    from days
    left join daily on daily.snapshot_date = days.snapshot_date
    order by days.snapshot_date asc
  `
  const points = rows.map((row) => ({
    date: dateOnly(row.snapshot_date),
    qty: toNumber(row.total_qty),
    refreshedAt: row.refreshed_at?.toISOString() ?? null,
    value: toNumber(row.total_value),
    wac: toNumber(row.wac),
  }))
  const values = points.map((point) => point.value)
  const wacValues = points.map((point) => point.wac)
  return {
    branches: await listScopedBranches(filter.allowedBranchCodes),
    filters: { branchId: filter.branchId ?? 'ALL', from: dateOnly(filter.from), to: dateOnly(filter.to) },
    points,
    sourceState: stockFinanceSourceState(),
    summary: {
      maxValue: Math.max(0, ...values),
      maxWac: Math.max(0, ...wacValues),
      minValue: Math.min(0, ...values),
      minWac: Math.min(0, ...wacValues),
      refreshedAt: points.map((point) => point.refreshedAt).filter(Boolean).at(-1) ?? null,
    },
  }
}

async function profitInputs(filter: ProfitLeakFilter) {
  const branchRef = filter.branchId ? await findActiveBranchReferenceByCodeOrId(filter.branchId) : null
  const branch = branchWhere(branchRef?.id ?? null)
  const date = { gte: filter.from, lte: endOfDay(filter.to) }
  return Promise.all([
    prisma.sales_bills.findMany({ include: { customers: { select: { code: true, name: true } } }, orderBy: [{ date: 'asc' }, { doc_no: 'asc' }], take: 20000, where: { ...notCancelledWhere(), ...branch, date } }),
    prisma.purchase_bills.findMany({ include: { purchase_bill_items: { orderBy: { line_no: 'asc' }, where: { item_status: 'active' } }, suppliers: { select: { code: true, name: true } } }, orderBy: [{ date: 'asc' }, { doc_no: 'asc' }], take: 20000, where: { ...notCancelledWhere(), ...branch, date } }),
    prisma.expenses.findMany({ include: { expense_categories: { select: { name: true } } }, orderBy: [{ date: 'asc' }, { doc_no: 'asc' }], take: 20000, where: { ...notCancelledWhere(), ...branch, date } }),
    prisma.loan_payments.findMany({ take: 10000, where: { ...notCancelledWhere(), date } }),
    prisma.stock_ledger.findMany({ take: 30000, where: { ...branch, date, movement_type: { contains: 'LOSS', mode: 'insensitive' } } }),
    prisma.production_outputs.findMany({ take: 10000, where: { date, output_type: { in: ['Loss', 'Waste', 'LOSS', 'WASTE'] } } }),
    prisma.fx_gain_loss.findMany({ take: 10000, where: { date } }),
    prisma.payments.findMany({ take: 20000, where: { ...notCancelledWhere(), ...branch, date } }),
    prisma.customer_receipts.findMany({ take: 20000, where: { ...notCancelledWhere(), ...branch, date } }),
    listBranches(),
  ])
}

export async function buildProfitLeak(filter: ProfitLeakFilter) {
  const [sales, purchases, expenses, loanPayments, stockLossRows, productionLossRows, fxRows, payments, customerReceipts, branches] = await profitInputs(filter)
  type ProfitSalesBillRow = (typeof sales)[number]
  type ProfitPurchaseBillRow = (typeof purchases)[number]
  type ExpenseRow = (typeof expenses)[number]
  type LoanPaymentRow = (typeof loanPayments)[number]
  type StockLossRow = (typeof stockLossRows)[number]
  type ProductionLossRow = (typeof productionLossRows)[number]
  type FxRow = (typeof fxRows)[number]
  type PaymentRow = (typeof payments)[number]
  type CustomerReceiptRow = (typeof customerReceipts)[number]
  const negMarginItems = sales.flatMap((bill: ProfitSalesBillRow) => jsonRows(bill.items).map((item, index) => {
    const qty = jsonNumber(item.netWeight, item.weight, item.qty)
    const price = jsonNumber(item.price, item.unitPrice, item.unit_price)
    const cost = jsonNumber(item.unitCost, item.unit_cost, item.cost)
    const profit = jsonNumber(item.profit, (price - cost) * qty)
    return {
      customer: bill.customers?.name ?? '-',
      date: dateOnly(bill.date),
      docNo: bill.doc_no,
      id: `${bill.doc_no}-${index + 1}`,
      loss: Math.max(0, -profit || (cost > price ? (cost - price) * qty : 0)),
      price,
      productName: jsonString(item.productName, item.name) || '-',
      qty,
      unitCost: cost,
    }
  })).filter((row: { loss: number }) => row.loss > 0)
  const lowMarginBills = sales.map((bill: ProfitSalesBillRow) => {
    const revenue = toNumber(bill.total_amount)
    const cost = toNumber(bill.cogs_amount) || toNumber(bill.total_cost)
    const gp = revenue - cost
    const gpPct = revenue > 0 ? gp / revenue * 100 : 0
    return { customer: bill.customers?.name ?? '-', docNo: bill.doc_no, gpPct, id: bill.doc_no, revenue, shortfall: Math.max(0, filter.targetMargin / 100 * revenue - gp) }
  }).filter((row: { gpPct: number; revenue: number }) => row.revenue > 0 && row.gpPct < filter.targetMargin)
    .sort((left: { shortfall: number }, right: { shortfall: number }) => right.shortfall - left.shortfall)
    .slice(0, 15)
  const expenseByCategory = new Map<string, { amount: number; date: string; docNo: string; id: string; payee: string }[]>()
  expenses.forEach((expense: ExpenseRow) => {
    const key = expense.expense_categories?.name ?? 'OTHER'
    const rows = expenseByCategory.get(key) ?? []
    rows.push({ amount: toNumber(expense.net_amount) || toNumber(expense.amount), date: dateOnly(expense.date), docNo: expense.doc_no, id: expense.doc_no, payee: expense.payee ?? '-' })
    expenseByCategory.set(key, rows)
  })
  const outliers = Array.from(expenseByCategory.entries()).flatMap(([category, rows]) => {
    if (rows.length < 3) return []
    const mean = rows.reduce((sum: number, row: (typeof rows)[number]) => sum + row.amount, 0) / rows.length
    const std = Math.sqrt(rows.reduce((sum: number, row: (typeof rows)[number]) => sum + (row.amount - mean) ** 2, 0) / rows.length)
    const threshold = mean + 1.5 * std
    return rows.filter((row: (typeof rows)[number]) => row.amount > threshold).map((row: (typeof rows)[number]) => ({ ...row, category, mean, over: row.amount - mean, threshold }))
  }).sort((left, right) => right.over - left.over)
  const interestExpense = loanPayments.reduce((sum: number, row: LoanPaymentRow) => sum + toNumber(row.interest_amount), 0)
  const stockLoss = stockLossRows.reduce((sum: number, row: StockLossRow) => sum + toNumber(row.value_out), 0)
  const productionLoss = productionLossRows.reduce((sum: number, row: ProductionLossRow) => sum + toNumber(row.total_cost), 0)
  const fxLoss = fxRows.reduce((sum: number, row: FxRow) => sum + Math.min(0, toNumber(row.gain_loss)), 0)
  const bankFee = payments.reduce((sum: number, row: PaymentRow) => sum + toNumber(row.bank_fee) + toNumber(row.fee), 0)
    + customerReceipts.reduce((sum: number, row: CustomerReceiptRow) => sum + toNumber(row.bank_fee_total), 0)
  const customerMargins = new Map<string, { cost: number; name: string; revenue: number }>()
  sales.forEach((bill: ProfitSalesBillRow) => {
    const key = bill.customers?.code ? requireBusinessCode(bill.customers.code, `ลูกค้าบิลขาย ${bill.id}`) : 'UNKNOWN'
    const current = customerMargins.get(key) ?? { cost: 0, name: bill.customers?.name ?? '-', revenue: 0 }
    current.revenue += toNumber(bill.total_amount)
    current.cost += toNumber(bill.cogs_amount) || toNumber(bill.total_cost)
    customerMargins.set(key, current)
  })
  const lowCustomers = Array.from(customerMargins.entries()).map(([id, row]) => ({ id, gpPct: row.revenue > 0 ? (row.revenue - row.cost) / row.revenue * 100 : 0, name: row.name, revenue: row.revenue }))
    .filter((row) => row.revenue > 0 && row.gpPct < filter.targetMargin).sort((left, right) => left.gpPct - right.gpPct).slice(0, 10)
  const supplierCost = new Map<string, { productName: string; qty: number; supplierName: string; value: number }>()
  purchases.forEach((bill: ProfitPurchaseBillRow) => purchaseBillItemRows(bill).forEach((item) => {
    const productId = jsonString(item.productCode, item.code, item.productName, item.name) || 'UNKNOWN'
    const supplierCode = bill.suppliers?.code ? requireBusinessCode(bill.suppliers.code, `ผู้ขายบิลซื้อ ${bill.id}`) : 'UNKNOWN'
    const key = `${supplierCode}|${productId}`
    const current = supplierCost.get(key) ?? { productName: jsonString(item.productName, item.name) || '-', qty: 0, supplierName: bill.suppliers?.name ?? '-', value: 0 }
    current.qty += jsonNumber(item.netWeight, item.weight, item.qty)
    current.value += jsonNumber(item.netAmount, item.amount, item.total)
    supplierCost.set(key, current)
  }))
  const productAvg = new Map<string, { qty: number; value: number }>()
  supplierCost.forEach((row, key) => {
    const productId = key.split('|')[1]
    const current = productAvg.get(productId) ?? { qty: 0, value: 0 }
    current.qty += row.qty
    current.value += row.value
    productAvg.set(productId, current)
  })
  const highSuppliers = Array.from(supplierCost.entries()).map(([key, row]) => {
    const avg = productAvg.get(key.split('|')[1])
    const myAvg = row.qty > 0 ? row.value / row.qty : 0
    const allAvg = avg && avg.qty > 0 ? avg.value / avg.qty : 0
    return { id: key, premium: myAvg - allAvg, premiumPct: allAvg > 0 ? (myAvg - allAvg) / allAvg * 100 : 0, productName: row.productName, qty: row.qty, supplierName: row.supplierName }
  }).filter((row) => row.premium > 0 && row.qty > 0).sort((left, right) => right.premium * right.qty - left.premium * left.qty).slice(0, 10)
  const negTotal = negMarginItems.reduce((sum: number, row: (typeof negMarginItems)[number]) => sum + row.loss, 0)
  const totalLeak = negTotal + interestExpense + stockLoss + productionLoss + Math.abs(fxLoss) + bankFee
  return {
    branches,
    filters: { branchId: filter.branchId ?? 'ALL', from: dateOnly(filter.from), targetMargin: filter.targetMargin, to: dateOnly(filter.to) },
    highSuppliers,
    leakSegments: [
      { label: 'ขายต่ำกว่าทุน', value: negTotal },
      { label: 'ดอกเบี้ย', value: interestExpense },
      { label: 'ขาดทุนสต็อก', value: stockLoss },
      { label: 'ขาดทุนการผลิต', value: productionLoss },
      { label: 'ขาดทุนอัตราแลกเปลี่ยน', value: Math.abs(fxLoss) },
      { label: 'ค่าธรรมเนียมธนาคาร', value: bankFee },
    ].filter((row) => row.value > 0),
    lowCustomers,
    lowMarginBills,
    negMarginItems,
    outliers,
    sourceState: sourceState(),
    summary: { bankFee, fxLoss, interestExpense, negTotal, outlierCount: outliers.length, productionLoss, stockLoss, totalLeak },
  }
}
