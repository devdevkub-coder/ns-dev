import { Prisma } from '../../../generated/prisma/client'
import { parseInternalBigIntId, requireBusinessCode } from '@/lib/business-code'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { findActiveWarehouseReferenceByCodeOrId } from '@/lib/server/warehouse-reference'
import { applyWorksheetTableLayout } from '@/lib/server/xlsx'
import * as XLSX from 'xlsx'

export type StockBalanceKey = {
  branchId: string | bigint | null
  lotNo: string | null
  notAvailable: boolean
  productId: string | null
  status: string | null
  warehouseId: string | bigint | null
}

const stockLedgerInclude = {
  branches: true,
  products: { select: { code: true, metal_group: true, name: true } },
  warehouses: true,
} as const

export function stockKey(input: StockBalanceKey) {
  return [
    input.productId ?? '-',
    input.branchId ?? '-',
    input.warehouseId ?? '-',
    input.lotNo ?? '-',
    input.status ?? '-',
    input.notAvailable ? 'NA' : 'A',
  ].join('|')
}

function stockBucketInternalKey(input: {
  branchId: bigint | null
  lotNo: string | null
  notAvailable: boolean
  productId: bigint | null
  status: string | null
  warehouseId: bigint | null
}) {
  return [
    input.productId?.toString() ?? '-',
    input.branchId?.toString() ?? '-',
    input.warehouseId?.toString() ?? '-',
    input.lotNo ?? '-',
    input.status ?? '-',
    input.notAvailable ? 'NA' : 'A',
  ].join('|')
}

export function stockWhere(input: {
  asOf?: string | null
  branchId?: bigint | null
  from?: string | null
  lotNo?: string | null
  movementType?: string | null
  productId?: bigint | null
  refType?: string | null
  status?: string | null
  to?: string | null
  warehouseId?: bigint | null
}): Prisma.stock_ledgerWhereInput {
  const statusWhere = input.status
    ? {
        OR: [
          { output_category: input.status },
          {
            output_category: null,
            warehouses: { type: input.status },
          },
        ],
      }
    : {}

  return {
    ...(input.productId ? { product_id: input.productId } : {}),
    ...(input.branchId ? { branch_id: input.branchId } : {}),
    ...(input.warehouseId ? { warehouse_id: input.warehouseId } : {}),
    ...(input.movementType ? { movement_type: input.movementType } : {}),
    ...(input.refType ? { ref_type: input.refType } : {}),
    ...(input.lotNo ? { lot_no: { contains: input.lotNo, mode: 'insensitive' } } : {}),
    ...statusWhere,
    ...dateWhere(input),
  }
}

function stockStatusForLedgerRow(row: { output_category: string | null; warehouse_type?: string | null }) {
  const explicitStatus = row.output_category?.trim()
  if (explicitStatus) return explicitStatus
  const warehouseType = row.warehouse_type?.trim().toUpperCase()
  return warehouseType === 'RM' || warehouseType === 'WIP' || warehouseType === 'FG' ? warehouseType : '-'
}

export async function normalizeStockReferenceInput(input: {
  branchId?: string | bigint | null
  productId?: string | bigint | null
  warehouseId?: string | bigint | null
}): Promise<{ branchId: bigint | null; productId: bigint | null; warehouseId: bigint | null }> {
  const [branch, warehouse, product] = await Promise.all([
    input.branchId ? findActiveBranchReferenceByCodeOrId(input.branchId) : Promise.resolve(null),
    input.warehouseId ? findActiveWarehouseReferenceByCodeOrId(input.warehouseId) : Promise.resolve(null),
    input.productId
      ? prisma.products.findFirst({
        select: { id: true },
        where: {
          OR: [
            { code: String(input.productId).trim().toUpperCase() },
            ...(parseInternalBigIntId(input.productId) != null ? [{ id: parseInternalBigIntId(input.productId) as bigint }] : []),
          ],
        },
      })
      : Promise.resolve(null),
  ])

  return {
    branchId: branch?.id ?? null,
    productId: product?.id ?? null,
    warehouseId: warehouse?.id ?? null,
  }
}

function dateWhere(input: { asOf?: string | null; from?: string | null; to?: string | null }): Prisma.stock_ledgerWhereInput {
  if (input.asOf) return { date: { lte: normalizeDate(input.asOf) } }
  if (input.from || input.to) {
    return {
      date: {
        ...(input.from ? { gte: normalizeDate(input.from) } : {}),
        ...(input.to ? { lte: normalizeDate(input.to) } : {}),
      },
    }
  }
  return {}
}

function stockLedgerSqlWhere(input: {
  asOf?: string | null
  branchId?: bigint | null
  from?: string | null
  lotNo?: string | null
  movementType?: string | null
  productId?: bigint | null
  refType?: string | null
  status?: string | null
  to?: string | null
  warehouseId?: bigint | null
}) {
  const clauses: Prisma.Sql[] = [Prisma.sql`true`]
  // กรองยอด Loss ออกจากรายงานยอดคงเหลือสต๊อกเสมอ
  clauses.push(Prisma.sql`coalesce(sl.output_category, '') != 'LOSS'`)

  if (input.productId) clauses.push(Prisma.sql`sl.product_id = ${input.productId}`)
  if (input.branchId) clauses.push(Prisma.sql`sl.branch_id = ${input.branchId}`)
  if (input.warehouseId) clauses.push(Prisma.sql`sl.warehouse_id = ${input.warehouseId}`)
  if (input.movementType) clauses.push(Prisma.sql`sl.movement_type = ${input.movementType}`)
  if (input.refType) clauses.push(Prisma.sql`sl.ref_type = ${input.refType}`)
  if (input.lotNo) clauses.push(Prisma.sql`sl.lot_no ilike ${`%${input.lotNo}%`}`)
  if (input.status) clauses.push(Prisma.sql`(
    sl.output_category = ${input.status}
    or (
      sl.output_category is null
      and exists (
        select 1
        from public.warehouses sw
        where sw.id = sl.warehouse_id
          and sw.type = ${input.status}
      )
    )
  )`)
  if (input.asOf) clauses.push(Prisma.sql`sl.date <= ${normalizeDate(input.asOf)}`)
  if (!input.asOf && input.from) clauses.push(Prisma.sql`sl.date >= ${normalizeDate(input.from)}`)
  if (!input.asOf && input.to) clauses.push(Prisma.sql`sl.date <= ${normalizeDate(input.to)}`)
  return Prisma.join(clauses, ' and ')
}

type StockBalanceAggregateRow = {
  branch_code: string | null
  branch_id: bigint | null
  branch_name: string | null
  last_date: Date | string | null
  lot_no: string | null
  not_available_for_sale: boolean | null
  output_category: string | null
  product_code: string | null
  product_id: bigint | null
  product_metal_group: string | null
  product_name: string | null
  qty: Prisma.Decimal | number | string | null
  value: Prisma.Decimal | number | string | null
  warehouse_code: string | null
  warehouse_id: bigint | null
  warehouse_name: string | null
  warehouse_type: string | null
}

function rawNumeric(value: Prisma.Decimal | number | string | null) {
  if (value == null) return 0
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  return value.toNumber()
}

function rawDateOnly(value: Date | string | null) {
  if (!value) return ''
  return toDateOnly(typeof value === 'string' ? new Date(value) : value)
}

export async function stockReferenceData(input?: { includeCustomers?: boolean }) {
  const [branches, warehouses, products, customers] = await Promise.all([
    prisma.branches.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
    prisma.warehouses.findMany({
      orderBy: [{ name: 'asc' }],
      select: { active: true, branches: { select: { code: true } }, branch_id: true, code: true, id: true, name: true },
    }),
    prisma.products.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, metal_group: true, name: true } }),
    input?.includeCustomers === false
      ? Promise.resolve([])
      : prisma.customers.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
  ])

  return {
    branches: branches.map((row) => {
      const code = requireBusinessCode(row.code, `สาขา ${row.id}`)
      return { active: row.active, code, id: code, name: row.name }
    }),
    customers: customers.map((row) => {
      const code = requireBusinessCode(row.code, `ลูกค้า ${row.id}`)
      return { active: row.active, code, id: code, name: row.name }
    }),
    products: products.map((row) => ({ active: row.active, code: row.code, id: row.code, metalGroup: row.metal_group, name: row.name, status: null })),
    warehouses: warehouses.map((row) => ({
      active: row.active,
      branchId: row.branches ? requireBusinessCode(row.branches.code, `สาขาคลัง ${row.branch_id ?? row.id}`) : null,
      code: row.code,
      id: row.code,
      name: row.name,
    })),
  }
}

export async function stockBalanceSnapshot(input: {
  asOf?: string | null
  branchId?: string | bigint | null
  lotNo?: string | null
  onHold?: boolean | null
  productId?: string | bigint | null
  q?: string | null
  status?: string | null
  stockState?: 'on_hand' | 'pending_in' | 'pending_out' | null
  warehouseId?: string | bigint | null
}) {
  const normalizedInput = await normalizeStockReferenceInput(input)
  const sqlWhere = stockLedgerSqlWhere({
    asOf: input.asOf,
    branchId: normalizedInput.branchId,
    lotNo: input.lotNo,
    productId: normalizedInput.productId,
    status: input.status,
    warehouseId: normalizedInput.warehouseId,
  })
  const holdWhere = {
    status: 'active',
    ...(normalizedInput.branchId ? { branch_id: normalizedInput.branchId } : {}),
    ...(normalizedInput.productId ? { product_id: normalizedInput.productId } : {}),
    ...(normalizedInput.warehouseId ? { warehouse_id: normalizedInput.warehouseId } : {}),
  } satisfies Prisma.stock_holdsWhereInput
  const q = input.q?.trim() || null

  // Build unbilled weight query clauses
  const awaitingBillWhere: Prisma.Sql[] = [
    Prisma.sql`wt.doc_type = 'WTI'`,
    Prisma.sql`wt.status in ('received', 'partially_billed')`,
    Prisma.sql`wt.cancelled_at is null`
  ]
  if (normalizedInput.branchId) {
    awaitingBillWhere.push(Prisma.sql`wt.branch_id = ${normalizedInput.branchId}`)
  }
  if (normalizedInput.productId) {
    awaitingBillWhere.push(Prisma.sql`wtl.product_id = ${normalizedInput.productId}`)
  }
  if (normalizedInput.warehouseId) {
    awaitingBillWhere.push(Prisma.sql`wtl.warehouse_id = ${normalizedInput.warehouseId}`)
  }
  if (input.status) {
    awaitingBillWhere.push(Prisma.sql`coalesce(w.type, 'RM') = ${input.status}`)
  }

  const awaitingBillWhereSql = Prisma.join(awaitingBillWhere, ' and ')
  const qSql = q
    ? Prisma.sql`and concat_ws(' ', p.code, p.name, p.metal_group, b.name, w.name, coalesce(w.type, 'RM')) ilike ${`%${q}%`}`
    : Prisma.sql``

  const [ledgerRows, holdSums, awaitingBills] = await Promise.all([
    prisma.$queryRaw<StockBalanceAggregateRow[]>`
      with ledger_balance as (
        select
          sl.product_id,
          sl.branch_id,
          sl.warehouse_id,
          sl.output_category,
          sl.lot_no,
          coalesce(sl.not_available_for_sale, false) as not_available_for_sale,
          sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0)) as qty,
          sum(coalesce(sl.value_in, 0) - coalesce(sl.value_out, 0)) as value,
          max(sl.date) as last_date
        from public.stock_ledger sl
        where ${sqlWhere}
        group by
          sl.product_id,
          sl.branch_id,
          sl.warehouse_id,
          sl.output_category,
          sl.lot_no,
          coalesce(sl.not_available_for_sale, false)
        having abs(sum(coalesce(sl.qty_in, 0) - coalesce(sl.qty_out, 0))) > 0.000001
          or abs(sum(coalesce(sl.value_in, 0) - coalesce(sl.value_out, 0))) > 0.000001
      )
      select
        lb.product_id,
        lb.branch_id,
        lb.warehouse_id,
        lb.output_category,
        lb.lot_no,
        lb.not_available_for_sale,
        lb.qty,
        lb.value,
        lb.last_date,
        p.code as product_code,
        p.name as product_name,
        p.metal_group as product_metal_group,
        b.code as branch_code,
        b.name as branch_name,
        w.code as warehouse_code,
        w.name as warehouse_name,
        w.type as warehouse_type
      from ledger_balance lb
      left join public.products p on p.id = lb.product_id
      left join public.branches b on b.id = lb.branch_id
      left join public.warehouses w on w.id = lb.warehouse_id
      where ${q
        ? Prisma.sql`concat_ws(' ', p.code, p.name, p.metal_group, b.name, w.name, coalesce(lb.lot_no, ''), coalesce(lb.output_category, '')) ilike ${`%${q}%`}`
        : Prisma.sql`true`}
      order by p.metal_group asc nulls last, p.code asc nulls last, b.name asc nulls last, w.name asc nulls last
    `,
    prisma.stock_holds.groupBy({
      _sum: { qty: true },
      by: ['branch_id', 'product_id', 'warehouse_id', 'output_category', 'lot_no', 'not_available_for_sale'],
      where: holdWhere,
    }),
    prisma.$queryRaw<Array<{
      branch_id: bigint | null
      product_id: bigint | null
      warehouse_id: bigint | null
      status: string | null
      awaiting_bill_qty: Prisma.Decimal | number | string | null
      product_code: string | null
      product_name: string | null
      product_metal_group: string | null
      branch_code: string | null
      branch_name: string | null
      warehouse_code: string | null
      warehouse_name: string | null
    }>>`
      select
        wt.branch_id,
        wtl.product_id,
        wtl.warehouse_id,
        coalesce(w.type, 'RM') as status,
        sum(
          case
            when wps.net_weight = 0 then 0
            else wps.remaining_weight * wtl.net_weight / wps.net_weight
          end
        ) as awaiting_bill_qty,
        p.code as product_code,
        p.name as product_name,
        p.metal_group as product_metal_group,
        b.code as branch_code,
        b.name as branch_name,
        w.code as warehouse_code,
        w.name as warehouse_name
      from public.weight_tickets wt
      join public.weight_ticket_product_summaries wps on wps.weight_ticket_id = wt.id
      join public.weight_ticket_lines wtl on wtl.weight_ticket_id = wt.id and wtl.product_id = wps.product_id
      left join public.products p on p.id = wtl.product_id
      left join public.branches b on b.id = wt.branch_id
      left join public.warehouses w on w.id = wtl.warehouse_id
      where ${awaitingBillWhereSql} ${qSql}
      group by
        wt.branch_id,
        wtl.product_id,
        wtl.warehouse_id,
        coalesce(w.type, 'RM'),
        p.code,
        p.name,
        p.metal_group,
        b.code,
        b.name,
        w.code,
        w.name
      having sum(
        case
          when wps.net_weight = 0 then 0
          else wps.remaining_weight * wtl.net_weight / wps.net_weight
        end
      ) > 0.000001
    `
  ])
  const holdQtyByStockKey = new Map(
    holdSums.map((row) => [
      stockBucketInternalKey({
        branchId: row.branch_id,
        lotNo: row.lot_no,
        notAvailable: row.not_available_for_sale === true,
        productId: row.product_id,
        status: row.output_category,
        warehouseId: row.warehouse_id,
      }),
      toNumber(row._sum.qty),
    ]),
  )

  const rows = ledgerRows.map((row) => {
    const productStatus = stockStatusForLedgerRow(row)
    const qty = rawNumeric(row.qty)
    const value = rawNumeric(row.value)
    const publicRow = {
      avgCost: qty > 0 ? value / qty : 0,
      branchInternalId: row.branch_id ?? null,
      branchId: row.branch_code ?? '',
      branchName: row.branch_name ?? '-',
      key: stockKey({
        branchId: row.branch_code ?? null,
        lotNo: row.lot_no ?? null,
        notAvailable: row.not_available_for_sale === true,
        productId: row.product_code ?? null,
        status: productStatus,
        warehouseId: row.warehouse_code ?? null,
      }),
      lastDate: rawDateOnly(row.last_date),
      lotNo: row.lot_no ?? '',
      notAvailable: row.not_available_for_sale === true,
      onHoldQty: 0,
      productInternalId: row.product_id ?? null,
      productCode: row.product_code ?? '',
      productId: row.product_code ?? '',
      productMetalGroup: row.product_metal_group ?? 'อื่นๆ',
      productName: row.product_name ?? '-',
      qty,
      readyQty: 0,
      status: productStatus,
      value,
      warehouseInternalId: row.warehouse_id ?? null,
      warehouseId: row.warehouse_code ?? '',
      warehouseName: row.warehouse_name ?? '-',
      awaitingBillQty: 0,
    }
    return publicRow
  })

  // Merge unbilled weights
  const rowsByKey = new Map<string, typeof rows[number]>()
  for (const row of rows) {
    rowsByKey.set(row.key, row)
  }

  for (const rawAwaiting of awaitingBills) {
    const awaitingQty = rawNumeric(rawAwaiting.awaiting_bill_qty)
    const productStatus = rawAwaiting.status ?? 'RM'

    const key = stockKey({
      branchId: rawAwaiting.branch_code ?? null,
      lotNo: null,
      notAvailable: false,
      productId: rawAwaiting.product_code ?? null,
      status: productStatus,
      warehouseId: rawAwaiting.warehouse_code ?? null,
    })

    const existing = rowsByKey.get(key)
    if (existing) {
      existing.awaitingBillQty = awaitingQty
    } else {
      const newRow = {
        avgCost: 0,
        branchInternalId: rawAwaiting.branch_id ?? null,
        branchId: rawAwaiting.branch_code ?? '',
        branchName: rawAwaiting.branch_name ?? '-',
        key,
        lastDate: '',
        lotNo: '',
        notAvailable: false,
        onHoldQty: 0,
        productInternalId: rawAwaiting.product_id ?? null,
        productCode: rawAwaiting.product_code ?? '',
        productId: rawAwaiting.product_code ?? '',
        productMetalGroup: rawAwaiting.product_metal_group ?? 'อื่นๆ',
        productName: rawAwaiting.product_name ?? '-',
        qty: 0,
        readyQty: 0,
        status: productStatus,
        value: 0,
        warehouseInternalId: rawAwaiting.warehouse_id ?? null,
        warehouseId: rawAwaiting.warehouse_code ?? '',
        warehouseName: rawAwaiting.warehouse_name ?? '-',
        awaitingBillQty: awaitingQty,
      }
      rowsByKey.set(key, newRow)
    }
  }

  const mergedRows = Array.from(rowsByKey.values())
  // Re-sort the merged rows to maintain consistency
  mergedRows.sort((a, b) => {
    if (a.productMetalGroup !== b.productMetalGroup) {
      return a.productMetalGroup.localeCompare(b.productMetalGroup, 'th')
    }
    if (a.productCode !== b.productCode) {
      return a.productCode.localeCompare(b.productCode)
    }
    return a.branchName.localeCompare(b.branchName, 'th')
  })

  for (const row of mergedRows) {
    if (row.notAvailable || row.qty <= 0) {
      row.readyQty = 0
      continue
    }
    const holdKey = stockBucketInternalKey({
      branchId: row.branchInternalId,
      lotNo: row.lotNo || null,
      notAvailable: row.notAvailable,
      productId: row.productInternalId,
      status: row.status || null,
      warehouseId: row.warehouseInternalId,
    })
    const remainingHold = holdQtyByStockKey.get(holdKey) ?? 0
    row.onHoldQty = Math.min(row.qty, Math.max(0, remainingHold))
    row.readyQty = Math.max(0, row.qty - row.onHoldQty)
    holdQtyByStockKey.set(holdKey, Math.max(0, remainingHold - row.onHoldQty))
  }

  const stockState = input.onHold ? 'pending_out' : input.stockState ?? null
  const filteredRows = stockState === 'on_hand'
    ? mergedRows.filter((row) => row.qty > 0)
    : stockState === 'pending_in'
      ? mergedRows.filter((row) => row.awaitingBillQty > 0)
      : stockState === 'pending_out'
        ? mergedRows.filter((row) => row.onHoldQty > 0)
        : mergedRows

  const summary = filteredRows.reduce((acc, row) => {
    acc.onHoldQty += row.onHoldQty
    acc.qty += row.qty
    acc.readyQty += row.readyQty
    acc.value += row.value
    if (row.notAvailable) {
      acc.notAvailableQty += row.qty
      acc.notAvailableValue += row.value
    } else {
      acc.availableQty += row.qty
      acc.availableValue += row.value
    }
    if (row.qty < 0) acc.negativeRows += 1
    return acc
  }, { availableQty: 0, availableValue: 0, count: filteredRows.length, negativeRows: 0, notAvailableQty: 0, notAvailableValue: 0, onHoldQty: 0, qty: 0, readyQty: 0, value: 0 })

  const byStatus = ['RM', 'WIP', 'FG'].map((status) => {
    const statusRows = filteredRows.filter((row) => row.status === status)
    return {
      count: statusRows.length,
      qty: statusRows.reduce((sum, row) => sum + row.qty, 0),
      status,
      value: statusRows.reduce((sum, row) => sum + row.value, 0),
    }
  })

  const publicRows = filteredRows.map(({ branchInternalId: _branchInternalId, productInternalId: _productInternalId, warehouseInternalId: _warehouseInternalId, ...row }) => row)

  return { byStatus, rows: publicRows, summary }
}

export async function stockBalanceDetail(input: {
  branchId: string | bigint
  lotNo?: string | null
  notAvailable?: boolean
  productId: string | bigint
  status?: string | null
  warehouseId: string | bigint
}) {
  const normalizedInput = await normalizeStockReferenceInput(input)
  if (!normalizedInput.branchId || !normalizedInput.productId || !normalizedInput.warehouseId) {
    throw new Error('ระบุสินค้า สาขา และคลังให้ครบก่อนดูรายละเอียด')
  }
  const lotNo = input.lotNo?.trim() || null
  const status = input.status?.trim() || null
  const notAvailable = input.notAvailable === true

  const [ledgerRows, holdRows] = await Promise.all([
    prisma.stock_ledger.findMany({
      include: stockLedgerInclude,
      orderBy: [{ date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
      take: 80,
      where: {
        branch_id: normalizedInput.branchId,
        lot_no: lotNo,
        ...(notAvailable ? { not_available_for_sale: true } : { OR: [{ not_available_for_sale: false }, { not_available_for_sale: null }] }),
        output_category: status,
        product_id: normalizedInput.productId,
        warehouse_id: normalizedInput.warehouseId,
      },
    }),
    prisma.stock_holds.findMany({
      include: {
        weight_ticket_lines: { select: { line_no: true, net_weight: true, product_name: true } },
        weight_tickets: { include: { customers: { select: { code: true, name: true } } } },
      },
      orderBy: [{ held_at: 'desc' }, { id: 'desc' }],
      take: 80,
      where: {
        branch_id: normalizedInput.branchId,
        lot_no: lotNo,
        not_available_for_sale: notAvailable,
        output_category: status,
        product_id: normalizedInput.productId,
        status: 'active',
        warehouse_id: normalizedInput.warehouseId,
      },
    }),
  ])

  return {
    holds: holdRows.map((row) => ({
      customerCode: row.weight_tickets.customers?.code ?? '',
      customerName: row.weight_tickets.customers?.name ?? '-',
      heldAt: row.held_at.toISOString(),
      holdKey: row.hold_key,
      lotNo: row.lot_no ?? '',
      qty: toNumber(row.qty),
      sourceDocNo: row.source_doc_no,
      sourceLineNo: row.source_line_no ?? row.weight_ticket_lines?.line_no ?? null,
      status: row.status,
      weightTicketDate: toDateOnly(row.weight_tickets.document_date),
    })),
    ledgerRows: ledgerRows.map((row) => ({
      createdAt: row.created_at ? row.created_at.toISOString() : '',
      date: toDateOnly(row.date),
      id: row.ledger_key,
      movementType: row.movement_type,
      note: row.note ?? row.notes ?? '',
      qtyIn: toNumber(row.qty_in),
      qtyOut: toNumber(row.qty_out),
      refNo: row.ref_no ?? row.ref_id ?? '',
      refType: row.ref_type ?? '',
      unitCost: toNumber(row.unit_cost),
      valueIn: toNumber(row.value_in),
      valueOut: toNumber(row.value_out),
    })),
  }
}

export async function averageCostForStock(input: { asOf?: string | null; branchId?: bigint | null; lotNo?: string | null; productId: string | bigint; status?: string | null; warehouseId?: bigint | null }) {
  const snapshot = await stockBalanceSnapshot(input)
  const totalQty = snapshot.rows.reduce((sum, row) => sum + row.qty, 0)
  const totalValue = snapshot.rows.reduce((sum, row) => sum + row.value, 0)
  return totalQty > 0 ? totalValue / totalQty : 0
}

export async function quantityForStock(input: { asOf?: string | null; branchId?: bigint | null; lotNo?: string | null; productId: string | bigint; quantityType?: 'onHand' | 'ready'; status?: string | null; warehouseId?: bigint | null }) {
  const snapshot = await stockBalanceSnapshot(input)
  const field = input.quantityType === 'ready' ? 'readyQty' : 'qty'
  return snapshot.rows.reduce((sum, row) => sum + row[field], 0)
}

export function buildStockWorkbook(sheetName: string, rows: Array<Record<string, string | number | boolean | null>>) {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(rows)
  const headers = rows[0] ? Object.keys(rows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, rows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}
