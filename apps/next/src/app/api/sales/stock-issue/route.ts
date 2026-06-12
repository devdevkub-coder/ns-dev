import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { findActiveBranchReferenceByCodeOrId } from '@/lib/server/branch-reference'
import { findActiveWarehouseReferenceByCodeOrId } from '@/lib/server/warehouse-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { nextDailyDocNo } from '@/lib/server/daily'
import { stockIssueFormSchema } from '@/lib/sales'
import { stockBalanceSnapshot, averageCostForStock, normalizeStockReferenceInput } from '@/lib/server/stock'
import { requireBusinessCode } from '@/lib/business-code'
import type { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

type StockIssueQuery = {
  dateFrom?: string
  dateTo?: string
  page: number
  pageSize: number
  search?: string
  status?: string
  sortDirection: Prisma.SortOrder
  sortKey: string
}

function parseStockIssueQuery(url: URL): StockIssueQuery {
  return {
    dateFrom: url.searchParams.get('dateFrom') || undefined,
    dateTo: url.searchParams.get('dateTo') || undefined,
    page: Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1),
    pageSize: Math.min(100, Math.max(10, Number(url.searchParams.get('pageSize') ?? 10) || 10)),
    search: url.searchParams.get('search')?.trim() || undefined,
    status: url.searchParams.get('status')?.trim() || undefined,
    sortDirection: url.searchParams.get('sortDirection') === 'asc' ? 'asc' : 'desc',
    sortKey: url.searchParams.get('sortKey') || 'date',
  }
}

function stockIssueWhere(query: StockIssueQuery): Prisma.stock_issuesWhereInput {
  const where: Prisma.stock_issuesWhereInput = {}

  if (query.dateFrom || query.dateTo) {
    where.date = {
      ...(query.dateFrom ? { gte: normalizeDate(query.dateFrom) } : {}),
      ...(query.dateTo ? { lte: normalizeDate(query.dateTo) } : {}),
    }
  }
  if (query.status) where.status = query.status
  if (query.search) {
    where.OR = [
      { doc_no: { contains: query.search, mode: 'insensitive' } },
      { customers: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { branches: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
      { warehouses: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
    ]
  }

  return where
}

function stockIssueOrderBy(query: StockIssueQuery): Prisma.stock_issuesOrderByWithRelationInput[] {
  const direction = query.sortDirection
  const primary: Prisma.stock_issuesOrderByWithRelationInput = (() => {
    switch (query.sortKey) {
      case 'docNo':
        return { doc_no: direction }
      case 'name':
        return { customer_id: direction }
      case 'status':
        return { status: direction }
      case 'totalAmount':
        return { total_est_amount: direction }
      case 'warehouse':
        return { branch_id: direction }
      case 'date':
      default:
        return { date: direction }
    }
  })()

  return [primary, { doc_no: direction }]
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')
    const query = parseStockIssueQuery(new URL(request.url))
    const where = stockIssueWhere(query)

    const [rows, totalRows, totals] = await Promise.all([
      prisma.stock_issues.findMany({
        include: {
          branches: true,
          customers: true,
          warehouses: true,
        },
        orderBy: stockIssueOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      prisma.stock_issues.count({ where }),
      prisma.stock_issues.aggregate({ _sum: { total_est_amount: true }, where }),
    ])

    return NextResponse.json({
      rows: rows.map((row) => ({
        branchId: row.branches?.code ?? '',
        branchName: row.branches?.name ?? '-',
        convertedToBillId: row.converted_to_bill_id ?? '',
        customerId: row.customers?.code ?? '',
        customerName: row.customers?.name ?? '-',
        date: toDateOnly(row.date),
        docNo: row.doc_no,
        id: String(row.id),
        itemCount: Array.isArray(row.items) ? row.items.length : 0,
        items: row.items,
        status: row.status ?? 'pending',
        totalCost: toNumber(row.total_cost),
        totalEstAmount: toNumber(row.total_est_amount),
        totalQty: Array.isArray(row.items) ? row.items.reduce<number>((sum, item) => {
          if (!item || typeof item !== 'object') return sum
          const value = (item as Record<string, unknown>).qty
          return sum + (typeof value === 'number' ? value : typeof value === 'string' ? Number(value || 0) : 0)
        }, 0) : 0,
        warehouseId: row.warehouses?.code ?? '',
        warehouseName: row.warehouses?.name ?? '-',
      })),
      totalAmount: toNumber(totals._sum.total_est_amount),
      totalRows,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดเบิกออกรอบิลไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')

    const values = stockIssueFormSchema.parse(await request.json())
    const actor = currentActor(context)

    const [branch, warehouse, customer] = await Promise.all([
      findActiveBranchReferenceByCodeOrId(values.branchId),
      findActiveWarehouseReferenceByCodeOrId(values.warehouseId),
      findActiveCustomerReferenceByCodeOrId(values.customerId),
    ])

    if (!branch) return NextResponse.json({ error: 'สาขาไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!warehouse) return NextResponse.json({ error: 'คลังไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    if (!customer) return NextResponse.json({ error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })

    // 1. Enforce hold-aware stock validation
    for (const item of values.items) {
      const snapshot = await stockBalanceSnapshot({
        branchId: values.branchId,
        warehouseId: values.warehouseId,
        productId: item.productId,
      })
      const totalReadyQty = snapshot.rows.reduce((sum, r) => sum + r.readyQty, 0)
      if (item.qty > totalReadyQty + 0.0001) {
        return NextResponse.json({
          error: `สินค้า ${item.productId} มีจำนวนพร้อมใช้ไม่พอ (ต้องการ ${item.qty.toLocaleString('th-TH')} กก. แต่มีพร้อมใช้ ${totalReadyQty.toLocaleString('th-TH')} กก.)`
        }, { status: 400 })
      }
    }

    // 2. Fetch products and WAC cost per item
    let totalCost = 0
    let totalEstAmount = 0
    const ledgerItems: Array<{
      productId: bigint
      productCode: string
      qty: number
      price: number
      unitCost: number
      cost: number
      estAmount: number
      note: string | null
    }> = []

    for (const item of values.items) {
      const references = await normalizeStockReferenceInput({
        branchId: values.branchId,
        productId: item.productId,
        warehouseId: values.warehouseId,
      })
      if (!references.productId) {
        return NextResponse.json({ error: `ไม่พบสินค้า ${item.productId}` }, { status: 400 })
      }
      const unitCost = await averageCostForStock({
        branchId: references.branchId,
        productId: references.productId,
        warehouseId: references.warehouseId,
      })
      const estAmount = item.qty * item.price
      const cost = item.qty * unitCost
      totalCost += cost
      totalEstAmount += estAmount

      ledgerItems.push({
        productId: references.productId,
        productCode: item.productId,
        qty: item.qty,
        price: item.price,
        unitCost,
        cost,
        estAmount,
        note: item.note,
      })
    }

    const itemsJson = values.items.map((item, index) => {
      const ledgerItem = ledgerItems[index]
      return {
        id: String(index + 1),
        productId: item.productId,
        qty: item.qty,
        price: item.price,
        note: item.note,
        unitCost: ledgerItem.unitCost,
        cost: ledgerItem.cost,
      }
    })

    const docNo = await nextDailyDocNo('stock_issues', 'PSALE', values.date)

    const created = await prisma.$transaction(async (tx) => {
      const stockIssue = await tx.stock_issues.create({
        data: {
          doc_no: docNo,
          date: normalizeDate(values.date),
          total_cost: totalCost,
          total_est_amount: totalEstAmount,
          status: 'pending',
          items: itemsJson as Prisma.InputJsonValue,
          notes: values.notes,
          created_by: actor,
          customer_id: customer.id,
          branch_id: branch.id,
          warehouse_id: warehouse.id,
        }
      })

      // Insert outgoing stock ledger entries (movement_type = 'เบิกออก', ref_type = 'PSALE')
      for (let i = 0; i < values.items.length; i++) {
        const item = values.items[i]
        const ledgerItem = ledgerItems[i]

        await tx.stock_ledger.create({
          data: {
            branch_id: branch.id,
            warehouse_id: warehouse.id,
            product_id: ledgerItem.productId,
            date: normalizeDate(values.date),
            movement_type: 'เบิกออก',
            ref_type: 'PSALE',
            ref_no: docNo,
            ref_id: String(stockIssue.id),
            qty_in: 0,
            qty_out: item.qty,
            value_in: 0,
            value_out: ledgerItem.cost,
            unit_cost: ledgerItem.unitCost,
            notes: item.note ?? `เบิกออกเพื่อขายใบเบิก ${docNo}`,
            created_by: actor,
          }
        })
      }

      return stockIssue
    })

    return NextResponse.json({ docNo: created.doc_no, id: created.doc_no }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกใบเบิกออกไม่ได้', 400)
  }
}

const cancelStockIssueSchema = z.object({
  id: z.string().trim().min(1, 'ระบุรหัสใบเบิกออก'),
  action: z.enum(['cancel']),
  reason: z.string().trim().max(500).optional(),
})

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'stock.ledger.view')

    const raw = await request.json()
    const { id, action } = cancelStockIssueSchema.parse(raw)
    const actor = currentActor(context)

    const stockIssue = await prisma.stock_issues.findFirst({
      where: { doc_no: id }
    })
    if (!stockIssue) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบเบิกออก' }, { status: 404 })
    }
    if (stockIssue.status === 'cancelled') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ใบเบิกออกนี้ถูกยกเลิกแล้ว' }, { status: 400 })
    }
    if (stockIssue.status === 'billed') {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่สามารถยกเลิกใบเบิกออกที่เปิดบิลขายไปแล้วได้' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await tx.stock_issues.update({
        data: {
          status: 'cancelled',
        },
        where: { id: stockIssue.id }
      })

      await tx.stock_ledger.deleteMany({
        where: {
          ref_type: 'PSALE',
          ref_id: String(stockIssue.id),
        }
      })
    })

    return NextResponse.json({ ok: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกใบเบิกออกไม่ได้', 400)
  }
}
