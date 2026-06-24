import { NextResponse } from 'next/server'
import type { Prisma } from '../../../../../generated/prisma/client'
import { requireBusinessCode, requireDocumentNo } from '@/lib/business-code'
import { stockTransferFormSchema } from '@/lib/daily'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { normalizeStockReferenceInput, stockBalanceSnapshot } from '@/lib/server/stock'
import { findActiveWarehouseReferenceByCodeOrId } from '@/lib/server/warehouse-reference'

export const runtime = 'nodejs'

type TransferItemInput = {
  allocations: Array<{
    lineValue: number
    lotNo: string | null
    notAvailableForSale: boolean
    outputCategory: string | null
    qty: number
    sourceUnitCost: number
  }>
  productId: bigint
  productCode: string
  qty: number
  sourceUnitCost: number
  lineValue: number
}

type TransferWithRelations = Prisma.stock_transfersGetPayload<{
  include: {
    branches_from: { select: { code: true; name: true } }
    branches_to: { select: { code: true; name: true } }
    stock_transfer_items: { include: { products: { select: { code: true; name: true } } } }
    warehouses_from: { select: { code: true; name: true } }
    warehouses_to: { select: { code: true; name: true } }
  }
}>

const transferInclude = {
  branches_from: { select: { code: true, name: true } },
  branches_to: { select: { code: true, name: true } },
  stock_transfer_items: {
    include: { products: { select: { code: true, name: true } } },
    orderBy: { id: 'asc' },
  },
  warehouses_from: { select: { code: true, name: true } },
  warehouses_to: { select: { code: true, name: true } },
} as const

function parsePositiveNumber(value: string | null) {
  if (value == null || value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function toTransferRow(row: TransferWithRelations) {
  const updatedAt = row.updated_at ?? row.posted_at ?? row.created_at
  const updatedBy = row.updated_by ?? row.posted_by ?? row.created_by ?? ''
  return {
    canCancel: row.status === 'draft',
    canEdit: row.status === 'draft',
    canPost: row.status === 'draft',
    date: toDateOnly(row.date),
    transferDate: row.transfer_date ? toDateOnly(row.transfer_date) : '',
    docNo: requireDocumentNo(row.doc_no, `stock_transfer ${row.id}`),
    from: `${row.branches_from.name} / ${row.warehouses_from.name}`,
    fromBranchId: requireBusinessCode(row.branches_from.code, `สาขาต้นทาง ${row.id}`),
    fromWarehouseId: requireBusinessCode(row.warehouses_from.code, `คลังต้นทาง ${row.id}`),
    id: requireDocumentNo(row.doc_no, `stock_transfer ${row.id}`),
    itemCount: row.stock_transfer_items.length,
    items: row.stock_transfer_items.map((item) => ({
      lineValue: toNumber(item.line_value),
      productCode: item.products.code ?? '',
      productId: item.products.code ?? '',
      productName: item.products.name,
      qty: toNumber(item.qty),
      sourceUnitCost: toNumber(item.source_unit_cost),
    })),
    notes: row.notes ?? '',
    status: row.status,
    to: `${row.branches_to.name} / ${row.warehouses_to.name}`,
    toBranchId: requireBusinessCode(row.branches_to.code, `สาขาปลายทาง ${row.id}`),
    toWarehouseId: requireBusinessCode(row.warehouses_to.code, `คลังปลายทาง ${row.id}`),
    totalQty: toNumber(row.total_qty),
    totalValue: toNumber(row.total_value),
    updatedAt: updatedAt ? updatedAt.toISOString() : '',
    updatedBy,
  }
}

async function nextStockTransferDocNo(tx: Prisma.TransactionClient, date: string) {
  const compactDate = date.slice(2, 4) + date.slice(5, 7)
  const startsWith = `ST${compactDate}-`
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${`stock_transfers:doc_no:${compactDate}`}, 0))`
  const last = await tx.stock_transfers.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith } },
  })
  const lastNumber = Number(String(last?.doc_no ?? '').slice(startsWith.length))
  return `${startsWith}${String(Number.isFinite(lastNumber) ? lastNumber + 1 : 1).padStart(4, '0')}`
}

async function validateTransferReferences(values: {
  fromBranchId: string
  fromWarehouseId: string
  toBranchId: string
  toWarehouseId: string
}) {
  const [fromBranch, toBranch, fromWarehouse, toWarehouse] = await Promise.all([
    findActiveBranchReferenceByCodeOrId(values.fromBranchId),
    findActiveBranchReferenceByCodeOrId(values.toBranchId),
    findActiveWarehouseReferenceByCodeOrId(values.fromWarehouseId),
    findActiveWarehouseReferenceByCodeOrId(values.toWarehouseId),
  ])

  if (!fromBranch) throw new Error('สาขาต้นทางไม่ถูกต้องหรือถูกปิดใช้งาน')
  if (!toBranch) throw new Error('สาขาปลายทางไม่ถูกต้องหรือถูกปิดใช้งาน')
  if (!fromWarehouse) throw new Error('คลังต้นทางไม่ถูกต้องหรือถูกปิดใช้งาน')
  if (!toWarehouse) throw new Error('คลังปลายทางไม่ถูกต้องหรือถูกปิดใช้งาน')
  if (fromWarehouse.branchCode && fromWarehouse.branchCode !== fromBranch.code) throw new Error('สาขาต้นทางและคลังต้นทางไม่ตรงกัน')
  if (toWarehouse.branchCode && toWarehouse.branchCode !== toBranch.code) throw new Error('สาขาปลายทางและคลังปลายทางไม่ตรงกัน')
  if (fromWarehouse.id === toWarehouse.id) throw new Error('ต้นทางและปลายทางต้องไม่เป็นคลังเดียวกัน')

  return { fromBranch, fromWarehouse, toBranch, toWarehouse }
}

async function resolveTransferItems(values: {
  branchId: bigint
  items: Array<{ productId: string; qty: number }>
  warehouseId: bigint
}) {
  const productQty = new Map<string, number>()
  for (const item of values.items) {
    productQty.set(item.productId, (productQty.get(item.productId) ?? 0) + item.qty)
  }

  const productRefs = new Map<string, { productId: bigint; productCode: string; requestedQty: number }>()
  for (const [productInput, requestedQty] of productQty) {
    const productReference = await normalizeStockReferenceInput({ productId: productInput })
    if (!productReference.productId) throw new Error(`สินค้า ${productInput} ไม่ถูกต้องหรือถูกปิดใช้งาน`)
    const product = await prisma.products.findUnique({ select: { code: true }, where: { id: productReference.productId } })
    productRefs.set(productInput, {
      productCode: requireBusinessCode(product?.code, `สินค้า ${productReference.productId}`),
      productId: productReference.productId,
      requestedQty,
    })
  }

  const allocationsByProductId = new Map<bigint, TransferItemInput['allocations']>()
  for (const product of productRefs.values()) {
    const allocations = await allocateSourceBuckets({
      branchId: values.branchId,
      productCode: product.productCode,
      productId: product.productId,
      requestedQty: product.requestedQty,
      warehouseId: values.warehouseId,
    })
    const availableQty = allocations.availableQty
    if (product.requestedQty > availableQty + 0.000001) {
      throw new Error(`จำนวน ${product.productCode} เกินสต๊อกพร้อมใช้ (${availableQty.toLocaleString('th-TH')})`)
    }
    allocationsByProductId.set(product.productId, allocations.rows)
  }

  const remainingAllocationsByProductId = new Map(
    Array.from(allocationsByProductId.entries()).map(([productId, allocations]) => [productId, allocations.map((row) => ({ ...row }))]),
  )

  return values.items.map((item) => {
    const product = productRefs.get(item.productId)
    if (!product) throw new Error(`สินค้า ${item.productId} ไม่ถูกต้องหรือถูกปิดใช้งาน`)
    const allocationPool = remainingAllocationsByProductId.get(product.productId) ?? []
    const itemAllocations = consumeAllocations(allocationPool, item.qty)
    const lineValue = itemAllocations.reduce((sum, allocation) => sum + allocation.lineValue, 0)
    const sourceUnitCost = item.qty > 0 ? lineValue / item.qty : 0
    return {
      allocations: itemAllocations,
      lineValue,
      productCode: product.productCode,
      productId: product.productId,
      qty: item.qty,
      sourceUnitCost,
    }
  })
}

async function allocateSourceBuckets(input: {
  branchId: bigint
  productCode: string
  productId: bigint
  requestedQty: number
  warehouseId: bigint
}) {
  const snapshot = await stockBalanceSnapshot({
    branchId: input.branchId,
    productId: input.productId,
    warehouseId: input.warehouseId,
  })
  const buckets = snapshot.rows
    .filter((row) => !row.notAvailable && row.readyQty > 0)
    .sort((left, right) => left.lastDate.localeCompare(right.lastDate) || left.lotNo.localeCompare(right.lotNo) || left.status.localeCompare(right.status))
  const availableQty = buckets.reduce((sum, row) => sum + row.readyQty, 0)
  if (input.requestedQty > availableQty + 0.000001) return { availableQty, rows: [] }

  let remaining = input.requestedQty
  const rows: TransferItemInput['allocations'] = []
  for (const bucket of buckets) {
    if (remaining <= 0.000001) break
    if (!(bucket.avgCost > 0)) {
      throw new Error(`หา WAC ต้นทางของสินค้า ${input.productCode} ไม่ได้`)
    }
    const qty = Math.min(remaining, bucket.readyQty)
    rows.push({
      lineValue: qty * bucket.avgCost,
      lotNo: bucket.lotNo || null,
      notAvailableForSale: false,
      outputCategory: bucket.status && bucket.status !== '-' ? bucket.status : null,
      qty,
      sourceUnitCost: bucket.avgCost,
    })
    remaining -= qty
  }
  return { availableQty, rows }
}

function consumeAllocations(allocationPool: TransferItemInput['allocations'], requestedQty: number) {
  let remaining = requestedQty
  const consumed: TransferItemInput['allocations'] = []
  for (const allocation of allocationPool) {
    if (remaining <= 0.000001) break
    if (allocation.qty <= 0.000001) continue
    const qty = Math.min(remaining, allocation.qty)
    consumed.push({
      ...allocation,
      lineValue: qty * allocation.sourceUnitCost,
      qty,
    })
    allocation.qty -= qty
    allocation.lineValue = allocation.qty * allocation.sourceUnitCost
    remaining -= qty
  }
  if (remaining > 0.000001) throw new Error('จำนวนที่ต้องการมากกว่า allocation ต้นทางที่พร้อมใช้')
  return consumed
}

async function createPostedLedger(tx: Prisma.TransactionClient, transfer: {
  date: Date
  transfer_date: Date | null
  doc_no: string
  from_branch_id: bigint
  from_warehouse_id: bigint
  id: bigint
  notes: string | null
  to_branch_id: bigint
  to_warehouse_id: bigint
}, items: TransferItemInput[], actor: string) {
  const existingLedger = await tx.stock_ledger.count({
    where: { ref_id: `ST-${transfer.id}`, ref_no: transfer.doc_no, ref_type: 'ST' },
  })
  if (existingLedger > 0) throw new Error(`เอกสาร ${transfer.doc_no} ส่งเข้าสต๊อกแล้ว`)

  const ledgerDate = transfer.transfer_date ?? transfer.date

  for (const item of items) {
    for (const allocation of item.allocations) {
      await tx.stock_ledger.createMany({
        data: [
        {
          branch_id: transfer.from_branch_id,
          created_by: actor,
          date: ledgerDate,
          lot_no: allocation.lotNo,
          movement_type: 'โอนระหว่างสาขา-ออก',
          not_available_for_sale: allocation.notAvailableForSale,
          notes: transfer.notes,
          output_category: allocation.outputCategory,
          product_id: item.productId,
          qty_in: 0,
          qty_out: allocation.qty,
          ref_id: `ST-${transfer.id}`,
          ref_no: transfer.doc_no,
          ref_type: 'ST',
          unit_cost: allocation.sourceUnitCost,
          value_in: 0,
          value_out: allocation.lineValue,
          warehouse_id: transfer.from_warehouse_id,
        },
        {
          branch_id: transfer.to_branch_id,
          created_by: actor,
          date: ledgerDate,
          lot_no: allocation.lotNo,
          movement_type: 'โอนระหว่างสาขา-เข้า',
          not_available_for_sale: allocation.notAvailableForSale,
          notes: transfer.notes,
          output_category: allocation.outputCategory,
          product_id: item.productId,
          qty_in: allocation.qty,
          qty_out: 0,
          ref_id: `ST-${transfer.id}`,
          ref_no: transfer.doc_no,
          ref_type: 'ST',
          unit_cost: allocation.sourceUnitCost,
          value_in: allocation.lineValue,
          value_out: 0,
          warehouse_id: transfer.to_warehouse_id,
        },
        ],
      })
    }
  }
}

async function buildSourceStockPreview(url: URL) {
  const sourceBranchId = url.searchParams.get('sourceBranchId')
  const sourceWarehouseId = url.searchParams.get('sourceWarehouseId')
  const sourceProductId = url.searchParams.get('sourceProductId')
  if (!sourceBranchId || !sourceWarehouseId) return []

  const snapshot = await stockBalanceSnapshot({
    branchId: sourceBranchId,
    productId: sourceProductId,
    warehouseId: sourceWarehouseId,
  })
  const byProduct = new Map<string, {
    productCode: string
    productId: string
    productName: string
    qty: number
    readyQty: number
    sourceValue: number
  }>()

  for (const row of snapshot.rows) {
    if (row.notAvailable || row.readyQty <= 0) continue
    const current = byProduct.get(row.productId) ?? {
      productCode: row.productCode,
      productId: row.productId,
      productName: row.productName,
      qty: 0,
      readyQty: 0,
      sourceValue: 0,
    }
    current.qty += row.qty
    current.readyQty += row.readyQty
    current.sourceValue += row.readyQty * row.avgCost
    byProduct.set(row.productId, current)
  }

  return Array.from(byProduct.values())
    .map((row) => ({
      ...row,
      sourceUnitCost: row.readyQty > 0 ? row.sourceValue / row.readyQty : 0,
    }))
    .sort((left, right) => left.productCode.localeCompare(right.productCode))
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')

    const url = new URL(request.url)
    if (url.searchParams.get('mode') === 'source-stock') {
      return NextResponse.json({ sourceStock: await buildSourceStockPreview(url) })
    }

    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1))
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? 10)))
    const docNo = url.searchParams.get('docNo')?.trim().toUpperCase() ?? ''
    const dateFrom = url.searchParams.get('dateFrom')?.trim() ?? ''
    const dateTo = url.searchParams.get('dateTo')?.trim() ?? ''
    const totalQtyFrom = parsePositiveNumber(url.searchParams.get('totalQtyFrom'))
    const totalQtyTo = parsePositiveNumber(url.searchParams.get('totalQtyTo'))
    const status = url.searchParams.get('status')?.trim() ?? ''

    const where: Prisma.stock_transfersWhereInput = {
      ...(docNo ? { doc_no: { startsWith: docNo } } : {}),
      ...(status ? { status } : {}),
      ...((dateFrom || dateTo) ? {
        date: {
          ...(dateFrom ? { gte: normalizeDate(dateFrom) } : {}),
          ...(dateTo ? { lte: normalizeDate(dateTo) } : {}),
        },
      } : {}),
      ...((totalQtyFrom != null || totalQtyTo != null) ? {
        total_qty: {
          ...(totalQtyFrom != null ? { gte: totalQtyFrom } : {}),
          ...(totalQtyTo != null ? { lte: totalQtyTo } : {}),
        },
      } : {}),
    }

    const [branches, warehouses, products, rows, totalRows, summary, sourceStock] = await Promise.all([
      prisma.branches.findMany({ orderBy: [{ code: 'asc' }, { name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
      prisma.warehouses.findMany({
        orderBy: [{ code: 'asc' }, { name: 'asc' }],
        select: {
          active: true,
          branches: { select: { code: true } },
          branch_id: true,
          code: true,
          id: true,
          name: true,
        },
      }),
      prisma.products.findMany({ orderBy: [{ name: 'asc' }], select: { active: true, code: true, id: true, name: true } }),
      prisma.stock_transfers.findMany({
        include: transferInclude,
        orderBy: [{ date: 'desc' }, { doc_no: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      prisma.stock_transfers.count({ where }),
      prisma.stock_transfers.aggregate({
        _sum: { total_qty: true, total_value: true },
        where,
      }),
      buildSourceStockPreview(url),
    ])

    return NextResponse.json({
      branches: branches.map((branch) => ({
        ...branch,
        id: requireBusinessCode(branch.code, `สาขา ${branch.id}`),
      })),
      page,
      pageSize,
      products: products.map((product) => ({
        ...product,
        id: requireBusinessCode(product.code, `สินค้า ${product.id}`),
      })),
      rows: rows.map(toTransferRow),
      sourceStock,
      summary: {
        totalQty: toNumber(summary._sum.total_qty),
        totalRows,
        totalValue: toNumber(summary._sum.total_value),
      },
      totalRows,
      warehouses: warehouses.map((warehouse) => ({
        ...warehouse,
        branch_id: warehouse.branches ? requireBusinessCode(warehouse.branches.code, `สาขาคลัง ${warehouse.branch_id ?? warehouse.id}`) : null,
        id: requireBusinessCode(warehouse.code, `คลัง ${warehouse.id}`),
      })),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการโอนสินค้าไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')

    const values = stockTransferFormSchema.parse(await request.json())
    const actor = currentActor(context)
    const refs = await validateTransferReferences(values)
    const normalizedItems = await resolveTransferItems({
      branchId: refs.fromBranch.id,
      items: values.items,
      warehouseId: refs.fromWarehouse.id,
    })
    const totalQty = normalizedItems.reduce((sum, item) => sum + item.qty, 0)
    const totalValue = normalizedItems.reduce((sum, item) => sum + item.lineValue, 0)

    const created = await prisma.$transaction(async (tx) => {
      const docNo = values.docNo ?? await nextStockTransferDocNo(tx, values.date)
      const transfer = await tx.stock_transfers.create({
        data: {
          created_by: actor,
          date: normalizeDate(values.date),
          transfer_date: values.transferDate ? normalizeDate(values.transferDate) : null,
          doc_no: docNo,
          from_branch_id: refs.fromBranch.id,
          from_warehouse_id: refs.fromWarehouse.id,
          notes: values.notes,
          posted_at: values.submitMode === 'post' ? new Date() : null,
          posted_by: values.submitMode === 'post' ? actor : null,
          status: values.submitMode === 'post' ? 'posted' : 'draft',
          to_branch_id: refs.toBranch.id,
          to_warehouse_id: refs.toWarehouse.id,
          total_qty: totalQty,
          total_value: totalValue,
          updated_at: new Date(),
          updated_by: actor,
          stock_transfer_items: {
            createMany: {
              data: normalizedItems.map((item) => ({
                created_by: actor,
                line_value: item.lineValue,
                product_id: item.productId,
                qty: item.qty,
                source_unit_cost: item.sourceUnitCost,
              })),
            },
          },
        },
      })
      if (values.submitMode === 'post') {
        await createPostedLedger(tx, transfer, normalizedItems, actor)
      }
      return transfer
    })

    return NextResponse.json({ id: created.doc_no, refNo: created.doc_no, status: created.status })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกโอนสินค้าไม่ได้', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')

    const payload = await request.json()
    const action = String(payload?.action ?? '')
    const docNo = requireDocumentNo(payload?.docNo, 'stock transfer')
    const actor = currentActor(context)

    if (action === 'cancel') {
      const cancelled = await prisma.stock_transfers.updateMany({
        data: {
          cancelled_at: new Date(),
          cancelled_by: actor,
          cancel_reason: typeof payload?.reason === 'string' ? payload.reason : null,
          status: 'cancelled',
          updated_at: new Date(),
          updated_by: actor,
          version: { increment: 1 },
        },
        where: { doc_no: docNo, status: 'draft' },
      })
      if (cancelled.count !== 1) throw new Error('ยกเลิกได้เฉพาะเอกสารที่ยังไม่ส่งเข้าสต๊อก')
      return NextResponse.json({ id: docNo, status: 'cancelled' })
    }

    if (action === 'edit' || action === 'post') {
      const existing = await prisma.stock_transfers.findUnique({
        include: { stock_transfer_items: true },
        where: { doc_no: docNo },
      })
      if (!existing) throw new Error('ไม่พบเอกสารโอนสินค้า')
      if (existing.status !== 'draft') throw new Error('แก้ไขหรือส่งได้เฉพาะเอกสารที่ยังไม่ส่งเข้าสต๊อก')

      const values = stockTransferFormSchema.parse({
        ...payload,
        docNo,
        submitMode: action === 'post' ? 'post' : 'draft',
      })
      const refs = await validateTransferReferences(values)
      const normalizedItems = await resolveTransferItems({
        branchId: refs.fromBranch.id,
        items: values.items,
        warehouseId: refs.fromWarehouse.id,
      })
      const totalQty = normalizedItems.reduce((sum, item) => sum + item.qty, 0)
      const totalValue = normalizedItems.reduce((sum, item) => sum + item.lineValue, 0)

      await prisma.$transaction(async (tx) => {
        await tx.stock_transfer_items.deleteMany({ where: { transfer_id: existing.id } })
        const transfer = await tx.stock_transfers.update({
          data: {
            date: normalizeDate(values.date),
            transfer_date: values.transferDate ? normalizeDate(values.transferDate) : null,
            from_branch_id: refs.fromBranch.id,
            from_warehouse_id: refs.fromWarehouse.id,
            notes: values.notes,
            posted_at: action === 'post' ? new Date() : null,
            posted_by: action === 'post' ? actor : null,
            status: action === 'post' ? 'posted' : 'draft',
            to_branch_id: refs.toBranch.id,
            to_warehouse_id: refs.toWarehouse.id,
            total_qty: totalQty,
            total_value: totalValue,
            updated_at: new Date(),
            updated_by: actor,
            version: { increment: 1 },
            stock_transfer_items: {
              createMany: {
                data: normalizedItems.map((item) => ({
                  created_by: actor,
                  line_value: item.lineValue,
                  product_id: item.productId,
                  qty: item.qty,
                  source_unit_cost: item.sourceUnitCost,
                })),
              },
            },
          },
          where: { id: existing.id },
        })
        if (action === 'post') {
          await createPostedLedger(tx, transfer, normalizedItems, actor)
        }
      })

      return NextResponse.json({ id: docNo, status: action === 'post' ? 'posted' : 'draft' })
    }

    return NextResponse.json({ code: 'BAD_REQUEST', error: 'action ไม่ถูกต้อง' }, { status: 400 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'แก้ไขโอนสินค้าไม่ได้', 400)
  }
}
