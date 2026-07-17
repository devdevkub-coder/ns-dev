import { NextResponse } from 'next/server'
import type { Prisma } from '../../../../../generated/prisma/client'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { listBranchMasterRecords, listWarehouseMasterRecords } from '@/lib/server/reference-master-cache'
import { normalizeStockReferenceInput, stockBalanceSnapshot, stockReferenceData } from '@/lib/server/stock'
import { stockAdjustCorrectionSchema, stockAdjustFormSchema, stockAdjustReasonOptions } from '@/lib/stock'

export const runtime = 'nodejs'
const CORRECTION_WINDOW_DAYS = 7
const MIN_VALUE_PRICE = 0.000001

const stockAdjustmentSelect = {
  accounting_impact_policy: true,
  adjust_type: true,
  branch_id: true,
  counted_qty: true,
  created_at: true,
  created_by: true,
  date: true,
  diff_qty: true,
  doc_no: true,
  id: true,
  lot_no: true,
  on_hold_qty: true,
  output_category: true,
  product_id: true,
  ready_qty_snapshot: true,
  reason: true,
  remark: true,
  status: true,
  system_qty: true,
  unit_cost_used: true,
  updated_at: true,
  updated_by: true,
  value_note: true,
  warehouse_id: true,
} satisfies Prisma.stock_adjustmentsSelect

async function nextDocNo(tx: Prisma.TransactionClient) {
  const prefix = 'ADJ-'
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('stock_adjustments.doc_no'))`
  const last = await tx.stock_adjustments.findFirst({
    orderBy: { doc_no: 'desc' },
    select: { doc_no: true },
    where: { doc_no: { startsWith: prefix } },
  })
  const lastNumber = Number(String(last?.doc_no ?? '').slice(prefix.length))
  return `${prefix}${String(Number.isFinite(lastNumber) ? lastNumber + 1 : 1).padStart(6, '0')}`
}

async function stockAdjustMetrics(input: {
  asOf?: string | null
  branchId: bigint
  lotNo?: string | null
  productId: bigint
  status?: string | null
  warehouseId: bigint
}) {
  const snapshot = await stockBalanceSnapshot({
    asOf: input.asOf,
    branchId: input.branchId,
    lotNo: input.lotNo,
    productId: input.productId,
    status: input.status,
    warehouseId: input.warehouseId,
  })
  const totals = snapshot.rows.reduce(
    (acc, row) => {
      acc.readyQty += row.readyQty
      acc.systemQty += row.qty
      acc.value += row.value
      return acc
    },
    { readyQty: 0, systemQty: 0, value: 0 },
  )
  return {
    readyQty: totals.readyQty,
    systemQty: totals.systemQty,
    unitPricePerKg: totals.systemQty > 0 ? totals.value / totals.systemQty : 0,
  }
}

async function stockAdjustSnapshot(input: {
  branchId?: string | null
  countedQty?: string | null
  date?: string | null
  lotNo?: string | null
  productId?: string | null
  status?: string | null
  warehouseId?: string | null
}) {
  const references = await normalizeStockReferenceInput({
    branchId: input.branchId,
    productId: input.productId,
    warehouseId: input.warehouseId,
  })
  if (!references.branchId) return { error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }
  if (!references.warehouseId) return { error: 'คลังไม่ถูกต้องหรือถูกปิดใช้งาน' }
  if (!references.productId) return { error: 'สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }

  const status = input.status || 'RM'
  const asOf = input.date || null
  const { readyQty, systemQty, unitPricePerKg } = await stockAdjustMetrics({
    asOf,
    branchId: references.branchId,
    lotNo: input.lotNo,
    productId: references.productId,
    status,
    warehouseId: references.warehouseId,
  })
  const countedQty = input.countedQty == null || input.countedQty === '' ? systemQty : Number(input.countedQty)
  const diffQty = Number.isFinite(countedQty) ? countedQty - systemQty : 0
  return {
    adjustType: Math.abs(diffQty) < 0.000001 ? 'NONE' : diffQty < 0 ? 'LOSS' : 'GAIN',
    countedQty: Number.isFinite(countedQty) ? countedQty : systemQty,
    diffQty,
    onHoldQty: Math.max(0, systemQty - readyQty),
    priceSource: 'STOCK_WAC_AS_OF_DATE',
    readyQty,
    systemQty,
    totalValue: diffQty * unitPricePerKg,
    unitPricePerKg,
  }
}

function correctionDeadline(date: Date | null) {
  if (!date) return null
  const deadline = new Date(date)
  deadline.setDate(deadline.getDate() + CORRECTION_WINDOW_DAYS)
  deadline.setHours(23, 59, 59, 999)
  return deadline
}

function canCorrectAdjustment(date: Date | null) {
  const deadline = correctionDeadline(date)
  return Boolean(deadline && deadline.getTime() >= Date.now())
}

async function buildListWhere(searchParams: URLSearchParams) {
  const q = searchParams.get('q')?.trim() || ''
  const branchParam = searchParams.get('branchId')?.trim()
  const productParam = searchParams.get('productId')?.trim()
  const warehouseParam = searchParams.get('warehouseId')?.trim()
  const references = await normalizeStockReferenceInput({
    branchId: branchParam,
    productId: productParam,
    warehouseId: warehouseParam,
  })
  if (branchParam && !references.branchId) return { error: 'สาขา filter ไม่ถูกต้องหรือถูกปิดใช้งาน' }
  if (warehouseParam && !references.warehouseId) return { error: 'คลัง filter ไม่ถูกต้องหรือถูกปิดใช้งาน' }
  if (productParam && !references.productId) return { error: 'สินค้า filter ไม่ถูกต้องหรือถูกปิดใช้งาน' }

  const dateFrom = searchParams.get('dateFrom')?.trim()
  const dateTo = searchParams.get('dateTo')?.trim()
  const adjustType = searchParams.get('adjustType')?.trim()
  const productIdsBySearch = q
    ? await prisma.products.findMany({
        select: { id: true },
        take: 100,
        where: {
          OR: [
            { code: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        },
      })
    : []
  const where: Prisma.stock_adjustmentsWhereInput = {
    ...(references.branchId ? { branch_id: references.branchId } : {}),
    ...(references.productId ? { product_id: references.productId } : {}),
    ...(references.warehouseId ? { warehouse_id: references.warehouseId } : {}),
    ...(adjustType === 'LOSS' || adjustType === 'GAIN' ? { adjust_type: adjustType } : {}),
    ...(dateFrom || dateTo
      ? {
          date: {
            ...(dateFrom ? { gte: normalizeDate(dateFrom) } : {}),
            ...(dateTo ? { lte: normalizeDate(dateTo) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { doc_no: { contains: q, mode: 'insensitive' } },
            { lot_no: { contains: q, mode: 'insensitive' } },
            { reason: { contains: q, mode: 'insensitive' } },
            { created_by: { contains: q, mode: 'insensitive' } },
            { updated_by: { contains: q, mode: 'insensitive' } },
            ...(productIdsBySearch.length > 0 ? [{ product_id: { in: productIdsBySearch.map((row) => row.id) } }] : []),
          ],
        }
      : {}),
  }
  return { where }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const searchParams = new URL(request.url).searchParams
    if (searchParams.get('snapshot') === '1') {
      const snapshot = await stockAdjustSnapshot({
        branchId: searchParams.get('branchId'),
        countedQty: searchParams.get('countedQty'),
        date: searchParams.get('date'),
        lotNo: searchParams.get('lotNo'),
        productId: searchParams.get('productId'),
        status: searchParams.get('status'),
        warehouseId: searchParams.get('warehouseId'),
      })
      if ('error' in snapshot) return NextResponse.json({ error: snapshot.error }, { status: 400 })
      return NextResponse.json({ snapshot })
    }

    const listFilter = await buildListWhere(searchParams)
    if ('error' in listFilter) return NextResponse.json({ error: listFilter.error }, { status: 400 })
    const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
    const pageSize = Math.min(500, Math.max(1, Number(searchParams.get('pageSize') ?? '500') || 500))
    const [reference, adjustments, total] = await Promise.all([
      stockReferenceData({ includeCustomers: false }),
      prisma.stock_adjustments.findMany({
        orderBy: [{ date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
        select: stockAdjustmentSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
        where: listFilter.where,
      }),
      prisma.stock_adjustments.count({ where: listFilter.where }),
    ])
    const [branchMaster, warehouseMaster, products] = await Promise.all([
      listBranchMasterRecords(),
      listWarehouseMasterRecords(),
      prisma.products.findMany({
        select: { code: true, id: true, name: true, metal_group: true },
        where: { id: { in: [...new Set(adjustments.map((row) => row.product_id).filter((id): id is bigint => id !== null))] } },
      }),
    ])
    const branchIds = new Set(adjustments.map((row) => row.branch_id).filter((id): id is bigint => id !== null))
    const warehouseIds = new Set(adjustments.map((row) => row.warehouse_id).filter((id): id is bigint => id !== null))
    const branchById = new Map(branchMaster.filter((row) => branchIds.has(row.id)).map((row) => [row.id, row]))
    const warehouseById = new Map(warehouseMaster.filter((row) => warehouseIds.has(row.id)).map((row) => [row.id, row]))
    const productById = new Map(products.map((row) => [row.id, row]))

    return NextResponse.json({
      pagination: { page, pageSize, total },
      reasonOptions: stockAdjustReasonOptions,
      reference,
      rows: adjustments.map((row) => {
        const product = row.product_id ? productById.get(row.product_id) : null
        const warehouse = row.warehouse_id ? warehouseById.get(row.warehouse_id) : null
        const unitPricePerKg = toNumber(row.unit_cost_used)
        const rawTotalValue = toNumber(row.value_note)
        const totalValue = row.adjust_type === 'LOSS' && rawTotalValue > 0 ? -rawTotalValue : rawTotalValue
        return {
          adjustType: row.adjust_type ?? '',
          branchId: row.branch_id ? branchById.get(row.branch_id)?.code ?? '' : '',
          branchName: row.branch_id ? branchById.get(row.branch_id)?.name ?? '-' : '-',
          branchWarehouse: `${row.branch_id ? branchById.get(row.branch_id)?.name ?? '-' : '-'} / ${row.warehouse_id ? warehouseById.get(row.warehouse_id)?.name ?? '-' : '-'}`,
          countedQty: toNumber(row.counted_qty),
          canEdit: canCorrectAdjustment(row.date),
          createdAt: row.created_at ? row.created_at.toISOString() : null,
          createdBy: row.created_by ?? '',
          date: row.date ? toDateOnly(row.date) : '',
          diffQty: toNumber(row.diff_qty),
          docNo: row.doc_no ?? '',
          id: row.doc_no ?? '',
          lotNo: row.lot_no ?? '',
          onHoldQty: toNumber(row.on_hold_qty),
          outputCategory: row.output_category ?? '',
          policy: row.accounting_impact_policy ?? 'NOTE_ONLY',
          productCode: product?.code ?? '',
          productName: product?.name ?? '-',
          metalGroup: product?.metal_group ?? '',
          readyQty: toNumber(row.ready_qty_snapshot),
          reason: row.reason ?? '',
          remark: row.remark ?? '',
          status: row.status ?? '',
          systemQty: toNumber(row.system_qty),
          totalValue,
          unitPricePerKg,
          updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
          updatedBy: row.updated_by ?? '',
          editableUntil: correctionDeadline(row.date)?.toISOString() ?? null,
          valueNote: totalValue,
          warehouseName: warehouse?.name ?? '-',
          warehouseId: warehouse?.code ?? '',
        }
      }),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการปรับสต๊อกไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const values = stockAdjustFormSchema.parse(await request.json())
    const references = await normalizeStockReferenceInput({ branchId: values.branchId, productId: values.productId, warehouseId: values.warehouseId })
    if (!references.branchId) {
      return NextResponse.json({ error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    if (!references.warehouseId) {
      return NextResponse.json({ error: 'คลังไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    if (!references.productId) {
      return NextResponse.json({ error: 'สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    }
    const { readyQty, systemQty, unitPricePerKg: unitCost } = await stockAdjustMetrics({
      asOf: values.date,
      branchId: references.branchId,
      lotNo: values.lotNo,
      productId: references.productId,
      status: values.status,
      warehouseId: references.warehouseId,
    })
    const onHoldQty = Math.max(0, systemQty - readyQty)
    if (values.countedQty < onHoldQty - 0.000001) {
      return NextResponse.json({ error: `บันทึกไม่ได้: นับจริงต่ำกว่า stock ที่ถูกจองไว้ (${onHoldQty.toLocaleString('th-TH')}) ต้องปลด/ยกเลิก hold หรือทำ reconciliation approval ก่อน` }, { status: 400 })
    }
    const diffQty = values.countedQty - systemQty
    if (Math.abs(diffQty) < 0.000001) {
      return NextResponse.json({ error: 'นับจริงเท่ากับยอดในระบบ ไม่ต้องสร้างรายการปรับ' }, { status: 400 })
    }

    if (unitCost <= MIN_VALUE_PRICE) {
      return NextResponse.json({ error: 'ไม่พบราคาต่อกก. สำหรับสินค้า/วันที่นี้ จึงยังบันทึก stock correction ที่กระทบ WAC/margin ไม่ได้' }, { status: 400 })
    }
    const actor = currentActor(context)
    const adjustType = diffQty < 0 ? 'LOSS' : 'GAIN'
    const totalValue = diffQty * unitCost
    const now = new Date()

    const saved = await prisma.$transaction(async (tx) => {
      const docNo = values.docNo?.trim() || await nextDocNo(tx)
      if (values.docNo) {
        const duplicate = await tx.stock_adjustments.findFirst({
          select: { id: true },
          where: { doc_no: docNo },
        })
        if (duplicate) return { error: 'เลขที่เอกสารปรับสต๊อกซ้ำ' }
      }
      const adjustment = await tx.stock_adjustments.create({
        data: {
          adjust_type: adjustType,
          branch_id: references.branchId,
          counted_qty: values.countedQty,
          created_by: actor,
          date: normalizeDate(values.date),
          diff_qty: diffQty,
          doc_no: docNo,
          lot_no: values.lotNo,
          accounting_impact_policy: 'STOCK_CORRECTION',
          on_hold_qty: onHoldQty,
          output_category: values.status,
          product_id: references.productId,
          ready_qty_snapshot: readyQty,
          reason: values.reason,
          remark: values.remark,
          status: 'posted',
          system_qty: systemQty,
          unit_cost_used: unitCost,
          updated_at: now,
          updated_by: actor,
          value_note: totalValue,
          warehouse_id: references.warehouseId,
        },
      })
      const ledger = await tx.stock_ledger.create({
        data: {
          branch_id: references.branchId,
          created_by: actor,
          date: normalizeDate(values.date),
          lot_no: values.lotNo,
          movement_type: diffQty < 0 ? 'STOCK_COUNT_LOSS' : 'STOCK_COUNT_GAIN',
          notes: values.reason,
          output_category: values.status,
          product_id: references.productId,
          qty_in: diffQty > 0 ? diffQty : 0,
          qty_out: diffQty < 0 ? Math.abs(diffQty) : 0,
          ref_id: String(adjustment.id),
          ref_no: docNo,
          ref_type: 'ADJ',
          unit_cost: unitCost,
          value_in: diffQty > 0 ? totalValue : 0,
          value_out: diffQty < 0 ? Math.abs(totalValue) : 0,
          warehouse_id: references.warehouseId,
        },
      })
      await tx.stock_adjustments.update({
        data: { stock_ledger_id: ledger.id },
        where: { id: adjustment.id },
      })
      return { docNo }
    })
    if ('error' in saved) return NextResponse.json({ error: saved.error }, { status: 409 })

    return NextResponse.json({ id: saved.docNo, refNo: saved.docNo, totalValue, unitPricePerKg: unitCost })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกปรับสต๊อกไม่ได้', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const values = stockAdjustCorrectionSchema.parse(await request.json())
    const actor = currentActor(context)
    const now = new Date()

    const existing = await prisma.stock_adjustments.findFirst({
      where: { doc_no: values.docNo },
    })
    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบเอกสารปรับสต๊อกนี้' }, { status: 404 })
    }
    if (existing.status !== 'posted') {
      return NextResponse.json({ error: 'แก้ไขได้เฉพาะรายการ posted เท่านั้น' }, { status: 400 })
    }
    if (!canCorrectAdjustment(existing.date)) {
      return NextResponse.json({ error: `แก้ไขรายการนับ stock ได้ไม่เกิน ${CORRECTION_WINDOW_DAYS} วันนับจากวันที่เอกสาร` }, { status: 400 })
    }

    const systemQty = toNumber(existing.system_qty)
    const onHoldQty = toNumber(existing.on_hold_qty)
    if (values.countedQty < onHoldQty - 0.000001) {
      return NextResponse.json({ error: `บันทึกไม่ได้: นับจริงต่ำกว่า stock ที่ถูกจองไว้ (${onHoldQty.toLocaleString('th-TH')}) ต้องปลด/ยกเลิก hold หรือทำ reconciliation approval ก่อน` }, { status: 400 })
    }

    const oldDiffQty = toNumber(existing.diff_qty)
    const newDiffQty = values.countedQty - systemQty
    const unitCost = toNumber(existing.unit_cost_used)
    if (Math.abs(newDiffQty) > 0.000001 && unitCost <= MIN_VALUE_PRICE) {
      return NextResponse.json({ error: 'รายการเดิมไม่มีราคาต่อกก. จึงยังแก้ไข stock correction ที่กระทบ WAC/margin ไม่ได้' }, { status: 400 })
    }
    const oldTotalValue = oldDiffQty * unitCost
    const newTotalValue = newDiffQty * unitCost
    const newAdjustmentType = newDiffQty < 0 ? 'LOSS' : newDiffQty > 0 ? 'GAIN' : 'NONE'

    await prisma.$transaction(async (tx) => {
      if (Math.abs(oldDiffQty) > 0.000001) {
        await tx.stock_ledger.create({
          data: {
            branch_id: existing.branch_id,
            created_by: actor,
            date: normalizeDate(toDateOnly(now)),
            lot_no: existing.lot_no,
            movement_type: oldDiffQty < 0 ? 'STOCK_COUNT_REVERSE_IN' : 'STOCK_COUNT_REVERSE_OUT',
            notes: `Correction reverse ${values.docNo}: ${values.reason}${values.remark ? ` · ${values.remark}` : ''}`,
            output_category: existing.output_category,
            product_id: existing.product_id,
            qty_in: oldDiffQty < 0 ? Math.abs(oldDiffQty) : 0,
            qty_out: oldDiffQty > 0 ? oldDiffQty : 0,
            ref_id: String(existing.id),
            ref_no: values.docNo,
            ref_type: 'ADJ-REV',
            unit_cost: unitCost,
            value_in: oldDiffQty < 0 ? Math.abs(oldTotalValue) : 0,
            value_out: oldDiffQty > 0 ? Math.abs(oldTotalValue) : 0,
            warehouse_id: existing.warehouse_id,
          },
        })
      }

      let replacementLedgerId = existing.stock_ledger_id
      if (Math.abs(newDiffQty) > 0.000001) {
        const replacementLedger = await tx.stock_ledger.create({
          data: {
            branch_id: existing.branch_id,
            created_by: actor,
            date: normalizeDate(toDateOnly(now)),
            lot_no: existing.lot_no,
            movement_type: newDiffQty < 0 ? 'STOCK_COUNT_LOSS' : 'STOCK_COUNT_GAIN',
            notes: `Correction replacement ${values.docNo}: ${values.reason}${values.remark ? ` · ${values.remark}` : ''}`,
            output_category: existing.output_category,
            product_id: existing.product_id,
            qty_in: newDiffQty > 0 ? newDiffQty : 0,
            qty_out: newDiffQty < 0 ? Math.abs(newDiffQty) : 0,
            ref_id: String(existing.id),
            ref_no: values.docNo,
            ref_type: 'ADJ',
            unit_cost: unitCost,
            value_in: newDiffQty > 0 ? newTotalValue : 0,
            value_out: newDiffQty < 0 ? Math.abs(newTotalValue) : 0,
            warehouse_id: existing.warehouse_id,
          },
        })
        replacementLedgerId = replacementLedger.id
      }

      await tx.stock_adjustments.update({
        data: {
          adjust_type: newAdjustmentType,
          counted_qty: values.countedQty,
          diff_qty: newDiffQty,
          reason: values.reason,
          remark: values.remark,
          stock_ledger_id: replacementLedgerId,
          updated_at: now,
          updated_by: actor,
          value_note: newTotalValue,
          version: (existing.version ?? 1) + 1,
        },
        where: { id: existing.id },
      })
    })

    return NextResponse.json({ id: values.docNo, refNo: values.docNo, totalValue: newTotalValue, unitPricePerKg: unitCost })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'แก้ไขปรับสต๊อกไม่ได้', 400)
  }
}
