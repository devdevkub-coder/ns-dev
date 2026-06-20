import { NextResponse } from 'next/server'
import { Prisma } from '../../../../../generated/prisma/client'
import { requireDocumentNo } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { normalizeStockReferenceInput, quantityForStock, stockReferenceData } from '@/lib/server/stock'
import { stockConvertFormSchema } from '@/lib/stock'

export const runtime = 'nodejs'

const COST_EPSILON = 0.000001

type CostPoolEntry = {
  available_qty: Prisma.Decimal
  branch_id: bigint | null
  date: Date
  id: bigint
  lot_no: string | null
  original_qty: Prisma.Decimal
  product_id: bigint
  source_ref_no: string | null
  source_type: string
  status: string
  unit_cost: Prisma.Decimal
  warehouse_id: bigint | null
}

type LockedCostPoolEntry = CostPoolEntry & {
  allocated_qty: Prisma.Decimal
  branch_id: bigint | null
  original_value: Prisma.Decimal
  product_id: bigint
  released_qty: Prisma.Decimal
  warehouse_id: bigint | null
}

type AllocationLine = {
  poolEntryId: bigint
  qty: number
}

type PostedAllocationRow = {
  id: bigint
  qty: Prisma.Decimal
  source_pool_entry_id: bigint
  target_pool_entry_id: bigint | null
  unit_cost: Prisma.Decimal
}

type RegradePoolRow = {
  allocated_qty: Prisma.Decimal
  branch_id: bigint | null
  id: bigint
  lot_no: string | null
  original_qty: Prisma.Decimal
  product_id: bigint
  unit_cost: Prisma.Decimal
  warehouse_id: bigint | null
}

type AllocationDetailRow = {
  allocation_status: string | null
  allocation_total_cost: Prisma.Decimal | null
  allocation_unit_cost: Prisma.Decimal | null
  branch_name: string | null
  date: Date
  doc_no: string
  ga_status: string
  line_no: number | null
  notes: string | null
  qty: Prisma.Decimal | null
  reason: string | null
  reversed_at: Date | null
  source_lot_no: string | null
  source_pool_id: bigint | null
  source_pool_lot_no: string | null
  source_pool_ref_no: string | null
  source_pool_type: string | null
  source_product_code: string | null
  source_product_name: string | null
  source_qty: Prisma.Decimal | null
  source_unit_cost: Prisma.Decimal | null
  source_type: string | null
  target_cost_policy: string | null
  target_lot_no: string | null
  target_unit_cost: Prisma.Decimal | null
  cost_variance: Prisma.Decimal | null
  cost_override_reason: string | null
  target_pool_id: bigint | null
  target_pool_lot_no: string | null
  target_pool_status: string | null
  target_product_code: string | null
  target_product_name: string | null
  target_qty: Prisma.Decimal | null
  warehouse_name: string | null
}

async function nextDocNo() {
  const prefix = 'GA-'
  const last = await prisma.grade_adjustments.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith: prefix } },
  })
  const lastNumber = Number(String(last?.doc_no ?? '').slice(prefix.length))
  return `${prefix}${String(Number.isFinite(lastNumber) ? lastNumber + 1 : 1).padStart(6, '0')}`
}

function statusForPool(originalQty: number, allocatedQty: number, releasedQty: number) {
  if (releasedQty >= originalQty - COST_EPSILON) return 'Released'
  if (allocatedQty >= originalQty - releasedQty - COST_EPSILON) return 'Fully Used'
  if (allocatedQty > COST_EPSILON) return 'Partially Used'
  return 'Available'
}

function allocationOrder(method: string) {
  if (method === 'LIFO') return Prisma.sql`date desc, id desc`
  if (method === 'HIGHEST_COST') return Prisma.sql`unit_cost desc, date asc, id asc`
  if (method === 'LOWEST_COST') return Prisma.sql`unit_cost asc, date asc, id asc`
  return Prisma.sql`date asc, id asc`
}

async function readyQuantityForStockInTransaction(tx: Prisma.TransactionClient, input: {
  branchId: bigint | null
  lotNo: string | null
  productId: bigint
  warehouseId: bigint | null
}) {
  const [row] = await tx.$queryRaw<Array<{ qty: Prisma.Decimal | null }>>`
    select greatest(0, coalesce(stock.qty, 0) - coalesce(holds.qty, 0)) as qty
    from (
      select sum(coalesce(qty_in, 0) - coalesce(qty_out, 0)) as qty
      from public.stock_ledger
      where product_id = ${input.productId}
        and branch_id is not distinct from ${input.branchId}
        and warehouse_id is not distinct from ${input.warehouseId}
        and (${input.lotNo}::text is null or lot_no = ${input.lotNo})
        and coalesce(not_available_for_sale, false) = false
    ) stock
    cross join (
      select sum(qty) as qty
      from public.stock_holds
      where status = 'active'
        and product_id = ${input.productId}
        and branch_id is not distinct from ${input.branchId}
        and warehouse_id is not distinct from ${input.warehouseId}
    ) holds
  `
  return toNumber(row?.qty)
}

async function loadCostPoolOptions() {
  const rows = await prisma.$queryRaw<CostPoolEntry[]>`
    select
      e.id,
      e.date,
      e.source_type,
      e.source_ref_no,
      e.lot_no,
      e.original_qty,
      e.unit_cost,
      e.status,
      e.original_qty - e.allocated_qty - e.released_qty as available_qty,
      e.product_id,
      e.branch_id,
      e.warehouse_id
    from public.stock_cost_pool_entries e
    where e.status in ('Available', 'Partially Used')
      and e.original_qty - e.allocated_qty - e.released_qty > ${COST_EPSILON}
    order by e.date asc, e.id asc
  `

  return rows.map((row) => {
    const availableQty = toNumber(row.available_qty)
    return {
      availableQty,
      availableValue: availableQty * toNumber(row.unit_cost),
      branchId: row.branch_id ? String(row.branch_id) : '',
      date: toDateOnly(row.date),
      id: String(row.id),
      lotNo: row.lot_no,
      originalQty: toNumber(row.original_qty),
      productId: row.product_id ? String(row.product_id) : '',
      sourceRefNo: row.source_ref_no,
      sourceType: row.source_type,
      status: row.status,
      unitCost: toNumber(row.unit_cost),
      warehouseId: row.warehouse_id ? String(row.warehouse_id) : '',
    }
  })
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? '')
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function csvResponse(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const body = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
  return new NextResponse(body, {
    headers: {
      'content-disposition': `attachment; filename="${filename}"`,
      'content-type': 'text/csv; charset=utf-8',
    },
  })
}

async function loadAllocationDetail(refNo: string) {
  const rows = await prisma.$queryRaw<AllocationDetailRow[]>`
    select
      ga.doc_no,
      ga.date,
      ga.status as ga_status,
      ga.source_type,
      ga.source_qty,
      ga.target_qty,
      ga.source_unit_cost,
      ga.target_unit_cost,
      ga.target_cost_policy,
      ga.cost_variance,
      ga.cost_override_reason,
      ga.source_lot_no,
      ga.target_lot_no,
      ga.reason,
      ga.notes,
      b.name as branch_name,
      w.name as warehouse_name,
      a.line_no,
      a.status as allocation_status,
      a.qty,
      a.unit_cost as allocation_unit_cost,
      a.total_cost as allocation_total_cost,
      a.reversed_at,
      sp.id as source_pool_id,
      sp.source_type as source_pool_type,
      sp.source_ref_no as source_pool_ref_no,
      sp.lot_no as source_pool_lot_no,
      spp.code as source_product_code,
      spp.name as source_product_name,
      tp.id as target_pool_id,
      tp.status as target_pool_status,
      tp.lot_no as target_pool_lot_no,
      tpp.code as target_product_code,
      tpp.name as target_product_name
    from public.grade_adjustments ga
    left join public.branches b on b.id = ga.branch_id
    left join public.warehouses w on w.id = ga.warehouse_id
    left join public.stock_cost_pool_allocations a on a.grade_adjustment_id = ga.id
    left join public.stock_cost_pool_entries sp on sp.id = a.source_pool_entry_id
    left join public.products spp on spp.id = sp.product_id
    left join public.stock_cost_pool_entries tp on tp.id = a.target_pool_entry_id
    left join public.products tpp on tpp.id = tp.product_id
    where ga.doc_no = ${refNo}
    order by a.line_no asc nulls last, a.id asc
  `
  if (!rows.length) return null
  const first = rows[0]
  return {
    allocationMethod: first.source_type ?? 'Legacy',
    branchWarehouse: [first.branch_name, first.warehouse_name].filter(Boolean).join(' / '),
    date: toDateOnly(first.date),
    lines: rows
      .filter((row) => row.line_no !== null)
      .map((row) => ({
        allocationStatus: row.allocation_status ?? '-',
        lineNo: Number(row.line_no),
        qty: toNumber(row.qty),
        reversedAt: row.reversed_at ? row.reversed_at.toISOString() : null,
        sourceLotNo: row.source_pool_lot_no,
        sourcePoolId: row.source_pool_id ? String(row.source_pool_id) : null,
        sourceProduct: row.source_product_code ? `${row.source_product_code} · ${row.source_product_name ?? ''}`.trim() : '-',
        sourceRefNo: row.source_pool_ref_no,
        sourceType: row.source_pool_type,
        targetLotNo: row.target_pool_lot_no,
        targetPoolId: row.target_pool_id ? String(row.target_pool_id) : null,
        targetPoolStatus: row.target_pool_status,
        targetProduct: row.target_product_code ? `${row.target_product_code} · ${row.target_product_name ?? ''}`.trim() : '-',
        totalCost: toNumber(row.allocation_total_cost),
        unitCost: toNumber(row.allocation_unit_cost),
      })),
    lossQty: Math.max(0, toNumber(first.source_qty) - toNumber(first.target_qty)),
    notes: first.notes,
    reason: first.reason,
    refNo: first.doc_no,
    sourceLotNo: first.source_lot_no,
    sourceQty: toNumber(first.source_qty),
    sourceUnitCost: toNumber(first.source_unit_cost),
    status: first.ga_status,
    targetCostPolicy: first.target_cost_policy ?? 'SOURCE_MATCHED',
    targetCostVariance: toNumber(first.cost_variance),
    targetCostReason: first.cost_override_reason,
    targetLotNo: first.target_lot_no,
    targetQty: toNumber(first.target_qty),
    targetUnitCost: toNumber(first.target_unit_cost),
  }
}

async function lockPoolEntries(input: {
  branchId: bigint
  lotNo: string | null
  method: string
  productId: bigint
  sourceQty: number
  warehouseId: bigint
  manualAllocations: AllocationLine[]
}, tx: Prisma.TransactionClient) {
  if (input.method === 'MANUAL') {
    const ids = input.manualAllocations.map((line) => line.poolEntryId)
    const rows = await tx.$queryRaw<LockedCostPoolEntry[]>`
      select
        e.*,
        e.original_qty - e.allocated_qty - e.released_qty as available_qty,
        p.code as product_code,
        b.code as branch_code,
        w.code as warehouse_code
      from public.stock_cost_pool_entries e
      join public.products p on p.id = e.product_id
      left join public.branches b on b.id = e.branch_id
      left join public.warehouses w on w.id = e.warehouse_id
      where e.id in (${Prisma.join(ids)})
      for update of e
    `
    const byId = new Map(rows.map((row) => [row.id.toString(), row]))
    const allocated = input.manualAllocations.map((line) => {
      const row = byId.get(line.poolEntryId.toString())
      if (!row) throw new Error('ไม่พบ Cost Pool lot ที่เลือก')
      if (row.product_id !== input.productId || row.branch_id !== input.branchId || row.warehouse_id !== input.warehouseId) {
        throw new Error('Cost Pool lot ที่เลือกไม่ตรงกับสินค้า/สาขา/คลัง')
      }
      if (input.lotNo && row.lot_no !== input.lotNo) throw new Error('Cost Pool lot ที่เลือกไม่ตรงกับ Lot ต้นทาง')
      const availableQty = toNumber(row.available_qty)
      if (line.qty > availableQty + COST_EPSILON) throw new Error(`จำนวนที่เลือกเกิน Cost Pool lot ${row.id} ที่เหลือ (${availableQty.toLocaleString('th-TH')})`)
      return { row, qty: line.qty }
    })
    const totalQty = allocated.reduce((sum, line) => sum + line.qty, 0)
    if (Math.abs(totalQty - input.sourceQty) > COST_EPSILON) throw new Error('Manual allocation ต้องรวมเท่ากับน้ำหนักต้นทาง')
    return allocated
  }

  const rows = await tx.$queryRaw<LockedCostPoolEntry[]>(Prisma.sql`
    select
      e.*,
      e.original_qty - e.allocated_qty - e.released_qty as available_qty,
      p.code as product_code,
      b.code as branch_code,
      w.code as warehouse_code
    from public.stock_cost_pool_entries e
    join public.products p on p.id = e.product_id
    left join public.branches b on b.id = e.branch_id
    left join public.warehouses w on w.id = e.warehouse_id
    where e.product_id = ${input.productId}
      and e.branch_id = ${input.branchId}
      and e.warehouse_id = ${input.warehouseId}
      and (${input.lotNo}::text is null or e.lot_no = ${input.lotNo})
      and e.status in ('Available', 'Partially Used')
      and e.original_qty - e.allocated_qty - e.released_qty > ${COST_EPSILON}
    order by ${allocationOrder(input.method)}
    for update of e
  `)

  let remainingQty = input.sourceQty
  const allocated: Array<{ qty: number; row: LockedCostPoolEntry }> = []
  for (const row of rows) {
    if (remainingQty <= COST_EPSILON) break
    const availableQty = toNumber(row.available_qty)
    const qty = Math.min(availableQty, remainingQty)
    if (qty > COST_EPSILON) {
      allocated.push({ row, qty })
      remainingQty -= qty
    }
  }
  if (remainingQty > COST_EPSILON) throw new Error(`Cost Pool ไม่พอสำหรับปรับเกรด ขาด ${remainingQty.toLocaleString('th-TH')} กก.`)
  return allocated
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const url = new URL(request.url)
    const detailRefNo = url.searchParams.get('detail')?.trim()
    if (detailRefNo) {
      const detail = await loadAllocationDetail(detailRefNo)
      if (!detail) return NextResponse.json({ error: 'ไม่พบเอกสารปรับเกรด' }, { status: 404 })
      if (url.searchParams.get('format') === 'csv') {
        return csvResponse(`stock-convert-${detail.refNo}-allocation.csv`, [
          ['doc_no', 'date', 'status', 'branch_warehouse', 'source_qty', 'target_qty', 'loss_qty', 'line_no', 'allocation_status', 'source_pool_id', 'source_ref_no', 'source_type', 'source_product', 'source_lot_no', 'target_pool_id', 'target_product', 'target_lot_no', 'target_pool_status', 'qty', 'unit_cost', 'total_cost', 'reversed_at'],
          ...detail.lines.map((line) => [
            detail.refNo,
            detail.date,
            detail.status,
            detail.branchWarehouse,
            detail.sourceQty,
            detail.targetQty,
            detail.lossQty,
            line.lineNo,
            line.allocationStatus,
            line.sourcePoolId,
            line.sourceRefNo,
            line.sourceType,
            line.sourceProduct,
            line.sourceLotNo,
            line.targetPoolId,
            line.targetProduct,
            line.targetLotNo,
            line.targetPoolStatus,
            line.qty,
            line.unitCost,
            line.totalCost,
            line.reversedAt,
          ]),
        ])
      }
      return NextResponse.json({ detail })
    }
    const [reference, adjustments, ledgerRows, costPoolEntries] = await Promise.all([
      stockReferenceData({ includeCustomers: false }),
      prisma.grade_adjustments.findMany({
        include: { products: { select: { code: true, name: true } }, warehouses: true },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 500,
      }),
      prisma.stock_ledger.findMany({
        include: { products: { select: { code: true, name: true } } },
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }],
        take: 1000,
        where: { ref_type: { in: ['GA', 'GA-REV'] } },
      }),
      loadCostPoolOptions(),
    ])
    const ledgerByRef = new Map<string, typeof ledgerRows>()
    for (const row of ledgerRows) {
      const key = requireDocumentNo(row.ref_no, `stock_ledger ${row.id}`)
      ledgerByRef.set(key, [...(ledgerByRef.get(key) ?? []), row])
    }

    return NextResponse.json({
      reference: { ...reference, costPoolEntries },
      rows: adjustments.map((row) => {
        const rows = ledgerByRef.get(row.doc_no) ?? []
        const source = rows.find((entry) => entry.ref_type === 'GA' && toNumber(entry.qty_out) > 0)
        const target = rows.find((entry) => entry.ref_type === 'GA' && toNumber(entry.qty_in) > 0)
        const sourceType = row.source_type || (row.allocation_method === 'MANUAL' ? 'Manual' : row.allocation_method ? `Auto (${row.allocation_method})` : 'Legacy')
        return {
          branchWarehouse: row.warehouses?.name ?? '-',
          costStatus: row.cost_status,
          createdAt: row.created_at ? row.created_at.toISOString() : '',
          date: toDateOnly(row.date),
          id: row.doc_no,
          lossQty: Math.max(0, toNumber(row.source_qty ?? source?.qty_out) - toNumber(row.target_qty ?? target?.qty_in)),
          refNo: row.doc_no,
          sourceProduct: source?.products ? `${source.products.code} · ${source.products.name}` : row.products ? `${row.products.code} · ${row.products.name}` : '-',
          sourceQty: toNumber(row.source_qty ?? source?.qty_out ?? row.qty_diff),
          sourceType,
          status: row.status,
          targetProduct: target?.products ? `${target.products.code} · ${target.products.name}` : '-',
          targetQty: toNumber(row.target_qty ?? target?.qty_in),
          targetUnitCost: toNumber(row.target_unit_cost ?? target?.unit_cost),
          targetCostPolicy: row.target_cost_policy,
          targetCostVariance: toNumber(row.cost_variance),
          unitCost: toNumber(source?.unit_cost),
          value: Math.abs(toNumber(row.value_diff)),
          warehouseName: row.warehouses?.name ?? '-',
        }
      }),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการปรับเกรดไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const values = stockConvertFormSchema.parse(await request.json())
    const [references, sourceProductReference, targetProductReference] = await Promise.all([
      normalizeStockReferenceInput({ branchId: values.branchId, warehouseId: values.warehouseId }),
      normalizeStockReferenceInput({ productId: values.sourceProductId }),
      normalizeStockReferenceInput({ productId: values.targetProductId }),
    ])
    if (!references.branchId) return NextResponse.json({ error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!references.warehouseId) return NextResponse.json({ error: 'คลังไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!sourceProductReference.productId) return NextResponse.json({ error: 'สินค้าต้นทางไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!targetProductReference.productId) return NextResponse.json({ error: 'สินค้าปลายทางไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (values.targetCostPolicy === 'CUSTOM_UNIT_COST' && !context.isAdmin) {
      return NextResponse.json({ error: 'Custom target unit cost ใช้ได้เฉพาะ admin/owner' }, { status: 403 })
    }
    if (values.targetCostPolicy === 'CUSTOM_UNIT_COST' && values.targetUnitCost === null) {
      return NextResponse.json({ error: 'Custom target unit cost ต้องมากกว่า 0' }, { status: 400 })
    }

    const warehouse = await prisma.warehouses.findFirst({ select: { branch_id: true }, where: { active: true, id: references.warehouseId } })
    if (!warehouse || warehouse.branch_id !== references.branchId) return NextResponse.json({ error: 'คลังไม่อยู่ในสาขาที่เลือก' }, { status: 400 })

    const readyQty = await quantityForStock({
      branchId: references.branchId,
      lotNo: values.lotNo,
      productId: sourceProductReference.productId,
      quantityType: 'ready',
      warehouseId: references.warehouseId,
    })
    if (values.sourceQty > readyQty + COST_EPSILON) {
      return NextResponse.json({ error: `จำนวนเกินสต๊อกพร้อมใช้ (${readyQty.toLocaleString('th-TH')})` }, { status: 400 })
    }

    const refNo = values.docNo ?? await nextDocNo()
    const actor = currentActor(context)
    const result = await prisma.$transaction(async (tx) => {
      const allocations = await lockPoolEntries({
        branchId: references.branchId as bigint,
        lotNo: values.lotNo,
        manualAllocations: values.manualAllocations.map((line) => ({ poolEntryId: BigInt(line.poolEntryId), qty: line.qty })),
        method: values.allocationMethod,
        productId: sourceProductReference.productId as bigint,
        sourceQty: values.sourceQty,
        warehouseId: references.warehouseId as bigint,
      }, tx)
      const sourceValue = allocations.reduce((sum, line) => sum + line.qty * toNumber(line.row.unit_cost), 0)
      const sourceUnitCost = sourceValue / values.sourceQty
      const targetUnitCost = values.targetCostPolicy === 'CUSTOM_UNIT_COST' ? Number(values.targetUnitCost) : sourceUnitCost
      const targetValue = values.targetQty * targetUnitCost
      const costVariance = targetValue - sourceValue
      const costOverrideReason = values.targetCostPolicy === 'CUSTOM_UNIT_COST' ? values.targetUnitCostReason : null
      const sourceType = values.allocationMethod === 'MANUAL' ? 'Manual' : `Auto (${values.allocationMethod})`
      const hasPartialSourcePool = allocations.some((line) => {
        const nextAllocated = toNumber(line.row.allocated_qty) + line.qty
        return statusForPool(toNumber(line.row.original_qty), nextAllocated, toNumber(line.row.released_qty)) === 'Partially Used'
      })
      const costStatus = hasPartialSourcePool ? 'partial' : 'allocated'
      const [adjustment] = await tx.$queryRaw<Array<{ id: bigint }>>`
        insert into public.grade_adjustments (
          approved_by, branch_id, date, doc_no, notes, product_id, source_product_id, target_product_id,
          source_qty, target_qty, source_lot_no, target_lot_no, qty_diff, reason, updated_at, updated_by,
          value_diff, warehouse_id, status, cost_status, source_type, allocation_method,
          target_cost_policy, source_unit_cost, target_unit_cost, cost_variance, cost_override_reason
        )
        values (
          ${actor}, ${references.branchId}, ${normalizeDate(values.date)}, ${refNo}, ${values.notes}, ${sourceProductReference.productId}, ${sourceProductReference.productId}, ${targetProductReference.productId},
          ${values.sourceQty}, ${values.targetQty}, ${values.lotNo}, ${values.targetLotNo}, ${values.targetQty - values.sourceQty}, ${values.reason}, now(), ${actor},
          ${costVariance}, ${references.warehouseId}, 'posted', ${costStatus}, ${sourceType}, ${values.allocationMethod},
          ${values.targetCostPolicy}, ${sourceUnitCost}, ${targetUnitCost}, ${costVariance}, ${costOverrideReason}
        )
        returning id
      `
      const sourceLedgerRows = allocations.map((line) => ({
        branch_id: references.branchId,
        created_by: actor,
        date: normalizeDate(values.date),
        lot_no: line.row.lot_no,
        movement_type: 'GRADE_ADJUST_OUT',
        notes: values.reason ?? values.notes,
        product_id: sourceProductReference.productId,
        qty_in: 0,
        qty_out: line.qty,
        ref_id: String(adjustment.id),
        ref_no: refNo,
        ref_type: 'GA',
        unit_cost: toNumber(line.row.unit_cost),
        value_in: 0,
        value_out: line.qty * toNumber(line.row.unit_cost),
        warehouse_id: references.warehouseId,
      }))
      await tx.stock_ledger.createMany({
        data: [
          ...sourceLedgerRows,
          {
            branch_id: references.branchId,
            created_by: actor,
            date: normalizeDate(values.date),
            lot_no: values.targetLotNo ?? values.lotNo,
            movement_type: 'GRADE_ADJUST_IN',
            notes: values.reason ?? values.notes,
            product_id: targetProductReference.productId,
            qty_in: values.targetQty,
            qty_out: 0,
            ref_id: String(adjustment.id),
            ref_no: refNo,
            ref_type: 'GA',
            unit_cost: targetUnitCost,
            value_in: targetValue,
            value_out: 0,
            warehouse_id: references.warehouseId,
          },
        ],
      })
      const [targetPool] = await tx.$queryRaw<Array<{ id: bigint }>>`
        insert into public.stock_cost_pool_entries (
          source_type, source_ref_type, source_ref_id, source_ref_no, regrade_adjustment_id, date,
          branch_id, warehouse_id, product_id, lot_no, original_qty, unit_cost, original_value,
          status, created_by, notes
        )
        values (
          'Regrade', 'GA', ${String(adjustment.id)}, ${refNo}, ${adjustment.id}, ${normalizeDate(values.date)},
          ${references.branchId}, ${references.warehouseId}, ${targetProductReference.productId}, ${values.targetLotNo ?? values.lotNo},
          ${values.targetQty}, ${targetUnitCost}, ${targetValue}, 'Available', ${actor}, ${values.reason ?? values.notes}
        )
        returning id
      `
      for (const [index, line] of allocations.entries()) {
        const previousAllocated = toNumber(line.row.allocated_qty)
        const releasedQty = toNumber(line.row.released_qty)
        const nextAllocated = previousAllocated + line.qty
        const nextStatus = statusForPool(toNumber(line.row.original_qty), nextAllocated, releasedQty)
        await tx.$executeRaw`
          update public.stock_cost_pool_entries
          set allocated_qty = ${nextAllocated}, status = ${nextStatus}, updated_at = now(), updated_by = ${actor}
          where id = ${line.row.id}
        `
        await tx.$executeRaw`
          insert into public.stock_cost_pool_allocations (
            allocation_type, grade_adjustment_id, source_pool_entry_id, target_pool_entry_id,
            line_no, allocation_method, qty, unit_cost, total_cost, created_by, notes
          )
          values (
            'GA_SOURCE_CONSUME', ${adjustment.id}, ${line.row.id}, ${targetPool.id},
            ${index + 1}, ${values.allocationMethod}, ${line.qty}, ${toNumber(line.row.unit_cost)}, ${line.qty * toNumber(line.row.unit_cost)}, ${actor}, ${values.reason ?? values.notes}
          )
        `
      }
      return { id: refNo, refNo }
    })

    return NextResponse.json(result)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกปรับเกรดไม่ได้', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const body = await request.json() as { action?: string; refNo?: string }
    if (body.action !== 'reverse' || !body.refNo) return NextResponse.json({ error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 })
    const actor = currentActor(context)
    await prisma.$transaction(async (tx) => {
      const adjustment = await tx.grade_adjustments.findFirst({ where: { doc_no: body.refNo } })
      if (!adjustment) throw new Error('ไม่พบเอกสารปรับเกรด')
      if (adjustment.status === 'reversed') throw new Error('เอกสารถูก reverse แล้ว')
      const allocations = await tx.$queryRaw<PostedAllocationRow[]>`
        select id, source_pool_entry_id, target_pool_entry_id, qty, unit_cost
        from public.stock_cost_pool_allocations
        where grade_adjustment_id = ${adjustment.id} and status = 'active'
        order by line_no asc, id asc
        for update
      `
      if (!allocations.length) throw new Error('ไม่พบ allocation สำหรับ reverse')
      const [targetPool] = await tx.$queryRaw<RegradePoolRow[]>`
        select id, product_id, branch_id, warehouse_id, lot_no, original_qty, allocated_qty, unit_cost
        from public.stock_cost_pool_entries
        where regrade_adjustment_id = ${adjustment.id} and source_type = 'Regrade'
        for update
      `
      if (!targetPool) throw new Error('ไม่พบ target Cost Pool สำหรับ reverse')
      if (toNumber(targetPool.allocated_qty) > COST_EPSILON) throw new Error('Reverse ไม่ได้ เพราะ target Cost Pool ถูกใช้ต่อแล้ว')
      const targetReadyQty = await readyQuantityForStockInTransaction(tx, {
        branchId: targetPool.branch_id,
        lotNo: targetPool.lot_no,
        productId: targetPool.product_id,
        warehouseId: targetPool.warehouse_id,
      })
      const targetQty = toNumber(targetPool.original_qty)
      if (targetQty > targetReadyQty + COST_EPSILON) throw new Error(`Reverse ไม่ได้ เพราะ stock ปลายทางพร้อมใช้เหลือ ${targetReadyQty.toLocaleString('th-TH')} กก.`)

      for (const allocation of allocations) {
        const [sourcePool] = await tx.$queryRaw<Array<{ allocated_qty: Prisma.Decimal; branch_id: bigint | null; lot_no: string | null; original_qty: Prisma.Decimal; product_id: bigint; released_qty: Prisma.Decimal; unit_cost: Prisma.Decimal; warehouse_id: bigint | null }>>`
          select id, product_id, branch_id, warehouse_id, lot_no, original_qty, allocated_qty, released_qty, unit_cost
          from public.stock_cost_pool_entries
          where id = ${allocation.source_pool_entry_id}
          for update
        `
        if (!sourcePool) throw new Error('ไม่พบ source Cost Pool สำหรับ reverse')
        const reverseQty = toNumber(allocation.qty)
        const nextAllocated = Math.max(0, toNumber(sourcePool.allocated_qty) - reverseQty)
        await tx.$executeRaw`
          update public.stock_cost_pool_entries
          set allocated_qty = ${nextAllocated},
              status = ${statusForPool(toNumber(sourcePool.original_qty), nextAllocated, toNumber(sourcePool.released_qty))},
              updated_at = now(),
              updated_by = ${actor}
          where id = ${allocation.source_pool_entry_id}
        `
        await tx.stock_ledger.create({
          data: {
            branch_id: sourcePool.branch_id,
            created_by: actor,
            date: normalizeDate(new Date().toISOString().slice(0, 10)),
            lot_no: sourcePool.lot_no,
            movement_type: 'GRADE_ADJUST_REVERSE_IN',
            product_id: sourcePool.product_id,
            qty_in: reverseQty,
            qty_out: 0,
            ref_id: String(adjustment.id),
            ref_no: `REV-${body.refNo}`,
            ref_type: 'GA-REV',
            unit_cost: toNumber(sourcePool.unit_cost),
            value_in: reverseQty * toNumber(sourcePool.unit_cost),
            value_out: 0,
            warehouse_id: sourcePool.warehouse_id,
          },
        })
      }
      await tx.stock_ledger.create({
        data: {
          branch_id: targetPool.branch_id,
          created_by: actor,
          date: normalizeDate(new Date().toISOString().slice(0, 10)),
          lot_no: targetPool.lot_no,
          movement_type: 'GRADE_ADJUST_REVERSE_OUT',
          product_id: targetPool.product_id,
          qty_in: 0,
          qty_out: targetQty,
          ref_id: String(adjustment.id),
          ref_no: `REV-${body.refNo}`,
          ref_type: 'GA-REV',
          unit_cost: toNumber(targetPool.unit_cost),
          value_in: 0,
          value_out: targetQty * toNumber(targetPool.unit_cost),
          warehouse_id: targetPool.warehouse_id,
        },
      })
      await tx.$executeRaw`
        update public.stock_cost_pool_entries
        set released_qty = original_qty, status = 'Released', updated_at = now(), updated_by = ${actor}
        where id = ${targetPool.id}
      `
      await tx.$executeRaw`
        update public.stock_cost_pool_allocations
        set status = 'reversed', reversed_at = now(), reversed_by = ${actor}
        where grade_adjustment_id = ${adjustment.id} and status = 'active'
      `
      await tx.$executeRaw`
        update public.grade_adjustments
        set status = 'reversed', reversed_at = now(), reversed_by = ${actor}, updated_at = now(), updated_by = ${actor}
        where id = ${adjustment.id}
      `
    })
    return NextResponse.json({ ok: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'Reverse ปรับเกรดไม่ได้', 400)
  }
}
