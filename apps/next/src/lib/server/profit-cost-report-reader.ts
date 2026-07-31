import { Prisma } from '../../../generated/prisma/client'
import { PURCHASE_BILL_ACTIVE_STATUSES } from '@/lib/purchase-bill-status'
import { SALES_BILL_STATUS } from '@/lib/server/sales-bill-history'
import type { ProfitCostAppliedFilter, ProfitCostTableQuery } from './profit-cost-report-contract'
import { decimalString, serializeProfitCostAppliedFilter } from './profit-cost-report-contract'
import { prisma } from './prisma'

type NumericText = string
export type ProfitCostReaderFilter = ProfitCostAppliedFilter & { allowedBranchIds?: bigint[] | null }

type SummarySqlRow = {
  cogs: NumericText
  customer_count: number
  gp: NumericText
  purchase_amount: NumericText
  purchase_qty: NumericText
  revenue: NumericText
  sales_qty: NumericText
  stock_qty: NumericText
  stock_value: NumericText
  supplier_count: number
}

type BalanceSqlRow = { ap: NumericText; ar: NumericText }

const purchaseBillActiveStatuses = Prisma.join(PURCHASE_BILL_ACTIVE_STATUSES)
const salesBillActiveStatuses = Prisma.join([SALES_BILL_STATUS.UNRECEIVED, SALES_BILL_STATUS.PARTIAL, SALES_BILL_STATUS.RECEIVED])

function branchScopeSql(filter: ProfitCostReaderFilter, branchColumn = Prisma.sql`fact.branch_id`) {
  if (filter.branchId != null) return Prisma.sql`and ${branchColumn} = ${filter.branchId}`
  if (filter.allowedBranchIds === null || filter.allowedBranchIds === undefined) return Prisma.empty
  if (filter.allowedBranchIds.length === 0) return Prisma.sql`and false`
  return Prisma.sql`and ${branchColumn} in (${Prisma.join(filter.allowedBranchIds)})`
}

function dailyWhere(filter: ProfitCostReaderFilter, includeFrom = true) {
  return Prisma.sql`
    ${includeFrom ? Prisma.sql`daily.event_date >= ${filter.from}::date and` : Prisma.empty}
    daily.event_date <= ${filter.to}::date
    ${branchScopeSql(filter, Prisma.sql`daily.branch_id`)}
    ${filter.productId != null ? Prisma.sql`and daily.product_id = ${filter.productId}` : Prisma.empty}
    ${filter.metalGroup ? Prisma.sql`and product.metal_group = ${filter.metalGroup}` : Prisma.empty}
  `
}

function purchaseDailyMatch(filter: ProfitCostReaderFilter) {
  return Prisma.sql`
    daily.supplier_id is not null
    ${filter.supplierId != null ? Prisma.sql`and daily.supplier_id = ${filter.supplierId}` : Prisma.empty}
    ${filter.purchaseChannelId != null ? Prisma.sql`and daily.purchase_channel_id = ${filter.purchaseChannelId}` : Prisma.empty}
  `
}

function saleDailyMatch(filter: ProfitCostReaderFilter) {
  return Prisma.sql`
    daily.customer_id is not null
    ${filter.customerId != null ? Prisma.sql`and daily.customer_id = ${filter.customerId}` : Prisma.empty}
    ${filter.salesChannelId != null ? Prisma.sql`and daily.sales_channel_id = ${filter.salesChannelId}` : Prisma.empty}
  `
}

function commonFactWhere(filter: ProfitCostReaderFilter, includeFrom = true) {
  return Prisma.sql`
    ${includeFrom ? Prisma.sql`fact.event_date >= ${filter.from}::date and` : Prisma.empty}
    fact.event_date <= ${filter.to}::date
    ${branchScopeSql(filter)}
    ${filter.productId != null ? Prisma.sql`and fact.product_id = ${filter.productId}` : Prisma.empty}
    ${filter.metalGroup ? Prisma.sql`and product.metal_group = ${filter.metalGroup}` : Prisma.empty}
  `
}

function purchaseDimensionMatch(filter: ProfitCostReaderFilter) {
  return Prisma.sql`
    fact.fact_type = 'PURCHASE'
    ${filter.supplierId != null ? Prisma.sql`and fact.supplier_id = ${filter.supplierId}` : Prisma.empty}
    ${filter.purchaseChannelId != null ? Prisma.sql`and fact.purchase_channel_id = ${filter.purchaseChannelId}` : Prisma.empty}
  `
}

function saleDimensionMatch(filter: ProfitCostReaderFilter) {
  return Prisma.sql`
    fact.fact_type = 'SALE'
    ${filter.customerId != null ? Prisma.sql`and fact.customer_id = ${filter.customerId}` : Prisma.empty}
    ${filter.salesChannelId != null ? Prisma.sql`and fact.sales_channel_id = ${filter.salesChannelId}` : Prisma.empty}
  `
}

function numberText(value: unknown, field: string) {
  try {
    return decimalString(value)
  } catch {
    throw new Error(`INVALID_PROFIT_COST_NUMERIC:${field}`)
  }
}

function divideDecimal(numerator: string, denominator: string, scale = 2) {
  const left = new Prisma.Decimal(numerator)
  const right = new Prisma.Decimal(denominator)
  return right.isZero() ? new Prisma.Decimal(0).toFixed(scale) : left.div(right).toFixed(scale)
}

async function loadTargetMarginPct() {
  const setting = await prisma.system_settings.findUnique({
    select: { value: true },
    where: { key: 'profit_cost_target_margin_pct' },
  })
  if (!setting?.value || !/^\d+(?:\.\d+)?$/.test(setting.value.trim())) {
    throw new Error('PROFIT_COST_TARGET_MARGIN_NOT_CONFIGURED')
  }
  return setting.value.trim()
}

export async function readProfitCostSummary(filter: ProfitCostReaderFilter) {
  const [rows, balances, targetMarginPct] = await Promise.all([
    prisma.$queryRaw<SummarySqlRow[]>(Prisma.sql`
      select
        coalesce(sum(daily.quantity) filter (where daily.event_date >= ${filter.from}::date and ${purchaseDailyMatch(filter)}), 0)::text as purchase_qty,
        coalesce(sum(daily.purchase_amount) filter (where daily.event_date >= ${filter.from}::date and ${purchaseDailyMatch(filter)}), 0)::text as purchase_amount,
        coalesce(sum(daily.quantity) filter (where daily.event_date >= ${filter.from}::date and ${saleDailyMatch(filter)}), 0)::text as sales_qty,
        coalesce(sum(daily.revenue_amount) filter (where daily.event_date >= ${filter.from}::date and ${saleDailyMatch(filter)}), 0)::text as revenue,
        coalesce(sum(daily.cogs_amount) filter (where daily.event_date >= ${filter.from}::date and ${saleDailyMatch(filter)}), 0)::text as cogs,
        coalesce(sum(daily.stock_quantity_delta) filter (where daily.supplier_id is null and daily.customer_id is null), 0)::text as stock_qty,
        coalesce(sum(daily.stock_value_delta) filter (where daily.supplier_id is null and daily.customer_id is null), 0)::text as stock_value,
        count(distinct daily.supplier_id) filter (where daily.event_date >= ${filter.from}::date and ${purchaseDailyMatch(filter)})::int as supplier_count,
        count(distinct daily.customer_id) filter (where daily.event_date >= ${filter.from}::date and ${saleDailyMatch(filter)})::int as customer_count,
        (coalesce(sum(daily.revenue_amount) filter (where daily.event_date >= ${filter.from}::date and ${saleDailyMatch(filter)}), 0)
          - coalesce(sum(daily.cogs_amount) filter (where daily.event_date >= ${filter.from}::date and ${saleDailyMatch(filter)}), 0))::text as gp
      from public.report_profit_cost_daily daily
      join public.products product on product.id = daily.product_id
      where ${dailyWhere(filter, false)}
        and (
          (daily.event_date >= ${filter.from}::date and (${purchaseDailyMatch(filter)} or ${saleDailyMatch(filter)}))
          or (daily.supplier_id is null and daily.customer_id is null)
        )
    `),
    prisma.$queryRaw<BalanceSqlRow[]>(Prisma.sql`
      select
        coalesce((select sum(pb.payable_balance) from public.purchase_bills pb
          where (pb.created_at at time zone 'Asia/Bangkok')::date between ${filter.from}::date and ${filter.to}::date
            and pb.status in (${purchaseBillActiveStatuses})
            ${branchScopeSql(filter, Prisma.sql`pb.branch_id`)}
            ${filter.supplierId != null ? Prisma.sql`and pb.supplier_id = ${filter.supplierId}` : Prisma.empty}
            ${filter.purchaseChannelId != null ? Prisma.sql`and pb.purchase_channel_id = ${filter.purchaseChannelId}` : Prisma.empty}), 0)::text as ap,
        coalesce((select sum(sb.receivable_balance) from public.sales_bills sb
          where sb.date between ${filter.from}::date and ${filter.to}::date
            and sb.status in (${salesBillActiveStatuses})
            ${branchScopeSql(filter, Prisma.sql`sb.branch_id`)}
            ${filter.customerId != null ? Prisma.sql`and sb.customer_id = ${filter.customerId}` : Prisma.empty}
            ${filter.salesChannelId != null ? Prisma.sql`and sb.channel_id = ${filter.salesChannelId}` : Prisma.empty}), 0)::text as ar
    `),
    loadTargetMarginPct(),
  ])
  const row = rows[0]
  const balance = balances[0]
  if (!row || !balance) throw new Error('PROFIT_COST_SUMMARY_NOT_AVAILABLE')
  const purchaseQty = numberText(row.purchase_qty, 'purchaseQty')
  const purchaseAmount = numberText(row.purchase_amount, 'purchaseAmount')
  const salesQty = numberText(row.sales_qty, 'salesQty')
  const revenue = numberText(row.revenue, 'revenue')
  const gp = numberText(row.gp, 'gp')
  return {
    filter: serializeProfitCostAppliedFilter(filter),
    summary: {
      ap: numberText(balance.ap, 'ap'), ar: numberText(balance.ar, 'ar'),
      avgBuy: divideDecimal(purchaseAmount, purchaseQty), avgSell: divideDecimal(revenue, salesQty),
      cogs: numberText(row.cogs, 'cogs'), customerCount: row.customer_count, gp,
      gpPct: new Prisma.Decimal(revenue).isZero() ? '0.00' : new Prisma.Decimal(gp).mul(100).div(revenue).toFixed(2),
      purchaseAmount, purchaseQty, revenue, salesQty,
      stockQty: numberText(row.stock_qty, 'stockQty'), stockValue: numberText(row.stock_value, 'stockValue'),
      supplierCount: row.supplier_count, targetMarginPct,
    },
  }
}

type ProductSqlRow = {
  avg_buy: NumericText
  avg_sell: NumericText
  buy_amount: NumericText
  buy_bill_count: number
  buy_qty: NumericText
  code: string
  cogs: NumericText
  gp: NumericText
  gp_pct: NumericText
  id: string
  metal_group: string | null
  name: string
  profit_per_kg: NumericText
  revenue: NumericText
  sell_bill_count: number
  sell_qty: NumericText
  stock_qty: NumericText
  stock_value: NumericText
  total_rows: number
}

export const PRODUCT_SORT_FIELDS = ['gp', 'revenue', 'stockValue', 'name', 'code', 'metalGroup', 'buyAmount', 'buyQty', 'avgBuy', 'sellQty', 'avgSell', 'cogs', 'gpPct', 'profitPerKg', 'stockQty'] as const
type ProductSort = (typeof PRODUCT_SORT_FIELDS)[number]

const productSortSql: Record<ProductSort, Prisma.Sql> = {
  avgBuy: Prisma.sql`avg_buy`, avgSell: Prisma.sql`avg_sell`, buyAmount: Prisma.sql`buy_amount`,
  buyQty: Prisma.sql`buy_qty`, code: Prisma.sql`code`, cogs: Prisma.sql`cogs`, gp: Prisma.sql`gp`,
  gpPct: Prisma.sql`gp_pct`, metalGroup: Prisma.sql`metal_group`, name: Prisma.sql`name`,
  profitPerKg: Prisma.sql`profit_per_kg`, revenue: Prisma.sql`revenue`, sellQty: Prisma.sql`sell_qty`,
  stockQty: Prisma.sql`stock_qty`, stockValue: Prisma.sql`stock_value`,
}

export async function readProfitCostProducts(query: ProfitCostTableQuery<ProductSort> & { allowedBranchIds?: bigint[] | null }) {
  const offset = (query.page - 1) * query.pageSize
  const order = productSortSql[query.sortBy]
  const direction = query.sortDirection === 'asc' ? Prisma.sql`asc` : Prisma.sql`desc`
  const rows = await prisma.$queryRaw<ProductSqlRow[]>(Prisma.sql`
    with daily_rows as (
      select product.id::text as id, product.code, product.name, product.metal_group,
        coalesce(sum(daily.quantity) filter (where daily.event_date >= ${query.from}::date and ${purchaseDailyMatch(query)}), 0) as buy_qty,
        coalesce(sum(daily.purchase_amount) filter (where daily.event_date >= ${query.from}::date and ${purchaseDailyMatch(query)}), 0) as buy_amount,
        coalesce(sum(daily.quantity) filter (where daily.event_date >= ${query.from}::date and ${saleDailyMatch(query)}), 0) as sell_qty,
        coalesce(sum(daily.revenue_amount) filter (where daily.event_date >= ${query.from}::date and ${saleDailyMatch(query)}), 0) as revenue,
        coalesce(sum(daily.cogs_amount) filter (where daily.event_date >= ${query.from}::date and ${saleDailyMatch(query)}), 0) as cogs,
        coalesce(sum(daily.stock_quantity_delta) filter (where daily.supplier_id is null and daily.customer_id is null), 0) as stock_qty,
        coalesce(sum(daily.stock_value_delta) filter (where daily.supplier_id is null and daily.customer_id is null), 0) as stock_value
      from public.report_profit_cost_daily daily
      join public.products product on product.id = daily.product_id
      where ${dailyWhere(query, false)}
      group by product.id, product.code, product.name, product.metal_group
    ), document_counts as (
      select fact.product_id,
        count(distinct (fact.source_type, fact.source_doc_no)) filter (where ${purchaseDimensionMatch(query)})::int as buy_bill_count,
        count(distinct (fact.source_type, fact.source_doc_no)) filter (where ${saleDimensionMatch(query)})::int as sell_bill_count
      from public.report_profit_cost_facts fact
      join public.products product on product.id = fact.product_id
      where ${commonFactWhere(query)} and (${purchaseDimensionMatch(query)} or ${saleDimensionMatch(query)})
      group by fact.product_id
    ), aggregate_rows as (
      select daily_rows.*, coalesce(document_counts.buy_bill_count, 0) buy_bill_count,
        coalesce(document_counts.sell_bill_count, 0) sell_bill_count
      from daily_rows
      left join document_counts on document_counts.product_id::text = daily_rows.id
    ), calculated as (
      select *, revenue - cogs as gp,
        case when buy_qty = 0 then 0 else round(buy_amount / buy_qty, 2) end as avg_buy,
        case when sell_qty = 0 then 0 else round(revenue / sell_qty, 2) end as avg_sell,
        case when revenue = 0 then 0 else round((revenue - cogs) * 100 / revenue, 2) end as gp_pct,
        case when sell_qty = 0 then 0 else round((revenue - cogs) / sell_qty, 2) end as profit_per_kg
      from aggregate_rows
      where buy_qty <> 0 or sell_qty <> 0 or stock_qty <> 0 or stock_value <> 0
    )
    select id, code, name, metal_group,
      buy_qty::text, buy_amount::text, sell_qty::text, revenue::text, cogs::text,
      stock_qty::text, stock_value::text, buy_bill_count, sell_bill_count,
      gp::text, avg_buy::text, avg_sell::text, gp_pct::text, profit_per_kg::text,
      count(*) over ()::int as total_rows
    from calculated
    order by ${order} ${direction}, id asc
    limit ${query.pageSize} offset ${offset}
  `)
  return {
    filter: serializeProfitCostAppliedFilter(query), page: query.page, pageSize: query.pageSize,
    rows: rows.map((row) => ({
      avgBuy: numberText(row.avg_buy, 'avgBuy'), avgSell: numberText(row.avg_sell, 'avgSell'),
      buyAmount: numberText(row.buy_amount, 'buyAmount'), buyBillCount: row.buy_bill_count,
      buyQty: numberText(row.buy_qty, 'buyQty'), code: row.code, cogs: numberText(row.cogs, 'cogs'),
      gp: numberText(row.gp, 'gp'), gpPct: numberText(row.gp_pct, 'gpPct'), id: row.id,
      metalGroup: row.metal_group ?? '', name: row.name, profitPerKg: numberText(row.profit_per_kg, 'profitPerKg'),
      revenue: numberText(row.revenue, 'revenue'), sellBillCount: row.sell_bill_count,
      sellQty: numberText(row.sell_qty, 'sellQty'), stockQty: numberText(row.stock_qty, 'stockQty'),
      stockValue: numberText(row.stock_value, 'stockValue'),
    })),
    totalRows: rows[0]?.total_rows ?? 0,
  }
}

export async function readProfitCostRankings(filter: ProfitCostReaderFilter) {
  const base = { ...filter, page: 1, pageSize: 10 as const, sortDirection: 'desc' as const }
  const [byRevenue, byGp, byStockValue] = await Promise.all([
    readProfitCostProducts({ ...base, sortBy: 'revenue' }),
    readProfitCostProducts({ ...base, sortBy: 'gp' }),
    readProfitCostProducts({ ...base, sortBy: 'stockValue' }),
  ])
  return { filter: serializeProfitCostAppliedFilter(filter), top: { byGp: byGp.rows, byRevenue: byRevenue.rows, byStockValue: byStockValue.rows } }
}

export async function readProfitCostOptions(allowedBranchIds?: bigint[] | null) {
  const [branches, customers, products, purchaseChannels, salesChannels, suppliers] = await Promise.all([
    prisma.branches.findMany({
      orderBy: { code: 'asc' }, select: { active: true, code: true, id: true, name: true },
      where: { active: true, ...(allowedBranchIds == null ? {} : { id: { in: allowedBranchIds } }) },
    }),
    prisma.customers.findMany({ orderBy: { code: 'asc' }, select: { active: true, code: true, id: true, name: true }, where: { active: true } }),
    prisma.products.findMany({ orderBy: { code: 'asc' }, select: { active: true, code: true, id: true, metal_group: true, name: true }, where: { active: true } }),
    prisma.purchase_channels.findMany({ orderBy: { code: 'asc' }, select: { active: true, code: true, id: true, name: true }, where: { active: true } }),
    prisma.sales_channels.findMany({ orderBy: { code: 'asc' }, select: { active: true, code: true, id: true, name: true }, where: { active: true } }),
    prisma.suppliers.findMany({ orderBy: { code: 'asc' }, select: { active: true, code: true, id: true, name: true }, where: { active: true } }),
  ])
  const option = (row: { active: boolean | null; code: string | null; id: bigint; name: string }) => ({ active: row.active === true, code: row.code ?? '', id: row.id.toString(), name: row.name })
  return {
    branches: branches.map(option), customers: customers.map(option),
    metalGroups: [...new Set(products.map((row) => row.metal_group).filter((value): value is string => Boolean(value)))].sort(),
    products: products.map(option), purchaseChannels: purchaseChannels.map(option),
    salesChannels: salesChannels.map(option), suppliers: suppliers.map(option),
  }
}

export const DIMENSION_SORT_FIELDS = [
  'amount', 'billCount', 'date', 'gp', 'group', 'name', 'paid', 'payable', 'qty', 'receivable', 'received',
] as const
type DimensionSort = (typeof DIMENSION_SORT_FIELDS)[number]
export type ProfitCostDimension = 'channels' | 'customers' | 'suppliers' | 'trend'

type DimensionSqlRow = {
  amount: NumericText
  bill_count: number
  buy_amount: NumericText
  buy_qty: NumericText
  cogs: NumericText
  date: string | null
  gp: NumericText
  group_name: string | null
  name: string
  paid: NumericText
  payable: NumericText
  qty: NumericText
  receivable: NumericText
  received: NumericText
  total_rows: number
}

const dimensionSortSql: Record<DimensionSort, Prisma.Sql> = {
  amount: Prisma.sql`amount`, billCount: Prisma.sql`bill_count`, date: Prisma.sql`date`,
  gp: Prisma.sql`gp`, group: Prisma.sql`group_name`, name: Prisma.sql`name`,
  paid: Prisma.sql`paid`, payable: Prisma.sql`payable`, qty: Prisma.sql`qty`,
  receivable: Prisma.sql`receivable`, received: Prisma.sql`received`,
}

function pagedDimensionResponse(query: ProfitCostTableQuery<DimensionSort>, rows: DimensionSqlRow[]) {
  return {
    filter: serializeProfitCostAppliedFilter(query), page: query.page, pageSize: query.pageSize,
    rows: rows.map((row) => ({
      amount: numberText(row.amount, 'amount'), billCount: row.bill_count,
      buyAmount: numberText(row.buy_amount, 'buyAmount'), buyQty: numberText(row.buy_qty, 'buyQty'),
      cogs: numberText(row.cogs, 'cogs'), date: row.date, gp: numberText(row.gp, 'gp'),
      gpPct: new Prisma.Decimal(row.amount).isZero() ? '0.00' : new Prisma.Decimal(row.gp).mul(100).div(row.amount).toFixed(2),
      group: row.group_name, name: row.name, paid: numberText(row.paid, 'paid'),
      payable: numberText(row.payable, 'payable'), qty: numberText(row.qty, 'qty'),
      receivable: numberText(row.receivable, 'receivable'), received: numberText(row.received, 'received'),
    })),
    totalRows: rows[0]?.total_rows ?? 0,
  }
}

export async function readProfitCostDimension(
  dimension: ProfitCostDimension,
  query: ProfitCostTableQuery<DimensionSort> & { allowedBranchIds?: bigint[] | null },
) {
  const offset = (query.page - 1) * query.pageSize
  const order = dimensionSortSql[query.sortBy]
  const direction = query.sortDirection === 'asc' ? Prisma.sql`asc` : Prisma.sql`desc`
  let aggregate: Prisma.Sql
  if (dimension === 'suppliers') {
    aggregate = Prisma.sql`
      select supplier.name, null::text group_name, null::text date,
        sum(fact.quantity) qty, sum(fact.purchase_amount) amount, 0::numeric cogs, 0::numeric gp,
        count(distinct fact.source_doc_no)::int bill_count,
        0::numeric buy_qty, 0::numeric buy_amount,
        coalesce((select sum(pb.paid_amount) from public.purchase_bills pb
          where pb.supplier_id = supplier.id and (pb.created_at at time zone 'Asia/Bangkok')::date between ${query.from}::date and ${query.to}::date
            and pb.status in (${purchaseBillActiveStatuses})
            ${branchScopeSql(query, Prisma.sql`pb.branch_id`)}
            ${query.purchaseChannelId != null ? Prisma.sql`and pb.purchase_channel_id = ${query.purchaseChannelId}` : Prisma.empty}), 0) paid,
        coalesce((select sum(pb.payable_balance) from public.purchase_bills pb
          where pb.supplier_id = supplier.id and (pb.created_at at time zone 'Asia/Bangkok')::date between ${query.from}::date and ${query.to}::date
            and pb.status in (${purchaseBillActiveStatuses})
            ${branchScopeSql(query, Prisma.sql`pb.branch_id`)}
            ${query.purchaseChannelId != null ? Prisma.sql`and pb.purchase_channel_id = ${query.purchaseChannelId}` : Prisma.empty}), 0) payable,
        0::numeric received, 0::numeric receivable
      from public.report_profit_cost_facts fact
      join public.products product on product.id = fact.product_id
      join public.suppliers supplier on supplier.id = fact.supplier_id
      where ${commonFactWhere(query)} and ${purchaseDimensionMatch(query)}
      group by supplier.id, supplier.name`
  } else if (dimension === 'customers') {
    aggregate = Prisma.sql`
      select customer.name, null::text group_name, null::text date,
        sum(fact.quantity) qty, sum(fact.revenue_amount) amount, sum(fact.cogs_amount) cogs,
        sum(fact.revenue_amount - fact.cogs_amount) gp,
        count(distinct fact.source_doc_no)::int bill_count,
        0::numeric buy_qty, 0::numeric buy_amount, 0::numeric paid, 0::numeric payable,
        coalesce((select sum(coalesce(sb.received_amount, sb.paid_amount, 0)) from public.sales_bills sb
          where sb.customer_id = customer.id and sb.date between ${query.from}::date and ${query.to}::date
            and sb.status in (${salesBillActiveStatuses})
            ${branchScopeSql(query, Prisma.sql`sb.branch_id`)}
            ${query.salesChannelId != null ? Prisma.sql`and sb.channel_id = ${query.salesChannelId}` : Prisma.empty}), 0) received,
        coalesce((select sum(sb.receivable_balance) from public.sales_bills sb
          where sb.customer_id = customer.id and sb.date between ${query.from}::date and ${query.to}::date
            and sb.status in (${salesBillActiveStatuses})
            ${branchScopeSql(query, Prisma.sql`sb.branch_id`)}
            ${query.salesChannelId != null ? Prisma.sql`and sb.channel_id = ${query.salesChannelId}` : Prisma.empty}), 0) receivable
      from public.report_profit_cost_facts fact
      join public.products product on product.id = fact.product_id
      join public.customers customer on customer.id = fact.customer_id
      where ${commonFactWhere(query)} and ${saleDimensionMatch(query)}
      group by customer.id, customer.name`
  } else if (dimension === 'channels') {
    aggregate = Prisma.sql`
      select channel_rows.name, channel_rows.group_name, null::text date,
        sum(channel_rows.qty) qty, sum(channel_rows.amount) amount, sum(channel_rows.cogs) cogs,
        sum(channel_rows.gp) gp, sum(channel_rows.bill_count)::int bill_count,
        0::numeric buy_qty, 0::numeric buy_amount, 0::numeric paid, 0::numeric payable,
        0::numeric received, 0::numeric receivable
      from (
        select channel.name, 'Purchase'::text group_name, sum(fact.quantity) qty,
          sum(fact.purchase_amount) amount, 0::numeric cogs, 0::numeric gp,
          count(distinct fact.source_doc_no)::int bill_count
        from public.report_profit_cost_facts fact
        join public.products product on product.id = fact.product_id
        join public.purchase_channels channel on channel.id = fact.purchase_channel_id
        where ${commonFactWhere(query)} and ${purchaseDimensionMatch(query)}
        group by channel.id, channel.name
        union all
        select channel.name, 'Sales'::text group_name, sum(fact.quantity) qty,
          sum(fact.revenue_amount) amount, sum(fact.cogs_amount) cogs,
          sum(fact.revenue_amount - fact.cogs_amount) gp,
          count(distinct fact.source_doc_no)::int bill_count
        from public.report_profit_cost_facts fact
        join public.products product on product.id = fact.product_id
        join public.sales_channels channel on channel.id = fact.sales_channel_id
        where ${commonFactWhere(query)} and ${saleDimensionMatch(query)}
        group by channel.id, channel.name
      ) channel_rows
      group by channel_rows.group_name, channel_rows.name`
  } else {
    aggregate = Prisma.sql`
      select to_char(fact.event_date, 'YYYY-MM-DD') name, null::text group_name,
        to_char(fact.event_date, 'YYYY-MM-DD') date,
        sum(fact.quantity) filter (where ${saleDimensionMatch(query)}) qty,
        sum(fact.revenue_amount) filter (where ${saleDimensionMatch(query)}) amount,
        sum(fact.cogs_amount) filter (where ${saleDimensionMatch(query)}) cogs,
        sum(fact.revenue_amount - fact.cogs_amount) filter (where ${saleDimensionMatch(query)}) gp,
        count(distinct fact.source_doc_no)::int bill_count,
        sum(fact.quantity) filter (where ${purchaseDimensionMatch(query)}) buy_qty,
        sum(fact.purchase_amount) filter (where ${purchaseDimensionMatch(query)}) buy_amount,
        0::numeric paid, 0::numeric payable, 0::numeric received, 0::numeric receivable
      from public.report_profit_cost_facts fact
      join public.products product on product.id = fact.product_id
      where ${commonFactWhere(query)} and (${purchaseDimensionMatch(query)} or ${saleDimensionMatch(query)})
      group by fact.event_date`
  }
  const rows = await prisma.$queryRaw<DimensionSqlRow[]>(Prisma.sql`
    with aggregate_rows as (${aggregate})
    select name, group_name, date,
      coalesce(qty, 0)::text qty, coalesce(amount, 0)::text amount,
      coalesce(cogs, 0)::text cogs, coalesce(gp, 0)::text gp, bill_count,
      coalesce(buy_qty, 0)::text buy_qty, coalesce(buy_amount, 0)::text buy_amount,
      coalesce(paid, 0)::text paid, coalesce(payable, 0)::text payable,
      coalesce(received, 0)::text received, coalesce(receivable, 0)::text receivable,
      count(*) over ()::int total_rows
    from aggregate_rows
    order by ${order} ${direction}, name asc
    limit ${query.pageSize} offset ${offset}`)
  return pagedDimensionResponse(query, rows)
}

export async function readProfitCostAlerts(filter: ProfitCostReaderFilter) {
  const targetMarginPct = await loadTargetMarginPct()
  const rows = await prisma.$queryRaw<Array<{
    amount: NumericText
    label: string
    severity: 'high' | 'low' | 'medium'
    type: string
  }>>(Prisma.sql`
    with aggregate_rows as (
      select product.id, product.name,
        coalesce(sum(daily.quantity) filter (where daily.event_date >= ${filter.from}::date and ${purchaseDailyMatch(filter)}), 0) as buy_qty,
        coalesce(sum(daily.quantity) filter (where daily.event_date >= ${filter.from}::date and ${saleDailyMatch(filter)}), 0) as sell_qty,
        coalesce(sum(daily.revenue_amount) filter (where daily.event_date >= ${filter.from}::date and ${saleDailyMatch(filter)}), 0) as revenue,
        coalesce(sum(daily.cogs_amount) filter (where daily.event_date >= ${filter.from}::date and ${saleDailyMatch(filter)}), 0) as cogs,
        coalesce(sum(daily.stock_quantity_delta) filter (where daily.supplier_id is null and daily.customer_id is null), 0) as stock_qty,
        coalesce(sum(daily.stock_value_delta) filter (where daily.supplier_id is null and daily.customer_id is null), 0) as stock_value
      from public.report_profit_cost_daily daily
      join public.products product on product.id = daily.product_id
      where ${dailyWhere(filter, false)}
      group by product.id, product.name
    ), calculated as (
      select *, revenue - cogs as gp,
        case when revenue = 0 then 0 else round((revenue - cogs) * 100 / revenue, 2) end as gp_pct
      from aggregate_rows
    ), classified as (
      select name as label,
        case
          when revenue > 0 and gp < 0 then gp
          when revenue > 0 and gp_pct >= 0 and gp_pct < ${targetMarginPct}::numeric then gp_pct
          else stock_value
        end as amount,
        case
          when revenue > 0 and gp < 0 then 'high'
          when revenue > 0 and gp_pct >= 0 and gp_pct < ${targetMarginPct}::numeric then 'medium'
          else 'low'
        end as severity,
        case
          when revenue > 0 and gp < 0 then 'GP ติดลบ'
          when revenue > 0 and gp_pct >= 0 and gp_pct < ${targetMarginPct}::numeric then 'GP ต่ำกว่าเป้า'
          else 'ซื้อแล้วยังไม่ขาย'
        end as type,
        case
          when revenue > 0 and gp < 0 then 1
          when revenue > 0 and gp_pct >= 0 and gp_pct < ${targetMarginPct}::numeric then 2
          else 3
        end as severity_rank
      from calculated
      where (revenue > 0 and gp < 0)
        or (revenue > 0 and gp_pct >= 0 and gp_pct < ${targetMarginPct}::numeric)
        or (stock_qty > 0 and sell_qty = 0 and buy_qty > 0)
    )
    select amount::text, label, severity, type
    from classified
    order by severity_rank asc,
      case when severity = 'high' then amount end asc nulls last,
      case when severity = 'medium' then amount end asc nulls last,
      case when severity = 'low' then amount end desc nulls last,
      label asc
    limit 12
  `)
  return {
    alerts: rows.map((row) => ({ ...row, amount: numberText(row.amount, 'alertAmount') })),
    filter: serializeProfitCostAppliedFilter(filter),
  }
}
