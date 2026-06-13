import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireBusinessCode } from '@/lib/business-code'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor, nextDailyDocNo, normalizeDate, toDateOnly, toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { appendStockIssueStatusLog, STOCK_ISSUE_STATUS_ACTION } from '@/lib/server/stock-issue-history'
import { consumeActiveWtoStockHoldsForPendingSale, reversePendingSaleStockIssue } from '@/lib/server/stock-holds'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
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

type StockIssueDeliveryRow = Prisma.weight_ticketsGetPayload<{
  include: {
    branches: {
      select: {
        code: true
        name: true
      }
    }
    customers: {
      select: {
        code: true
        name: true
      }
    }
    stock_holds: {
      select: {
        product_id: true
        qty: true
        status: true
      }
    }
    weight_ticket_product_summaries: {
      include: {
        products: {
          select: {
            code: true
            name: true
          }
        }
        weight_ticket_product_summary_lines: true
      }
      orderBy: {
        product_name: 'asc'
      }
    }
    weight_ticket_lines: {
      include: {
        products: {
          select: {
            code: true
          }
        }
      }
      orderBy: {
        line_no: 'asc'
      }
    }
  }
}>

const stockIssueCreateSchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'วันที่ต้องเป็นรูปแบบ YYYY-MM-DD'),
  deliveryTicketId: z.string().trim().min(1, 'เลือกใบส่งของ WTO').max(80, 'เลขใบส่งของยาวเกินไป'),
  note: z.string().trim().max(500, 'หมายเหตุยาวเกินไป').nullable().optional(),
  prices: z.record(z.string(), z.coerce.number().finite().min(0, 'ราคาขายคาดต้องไม่ติดลบ')).optional(),
})

const stockIssueCancelSchema = z.object({
  action: z.literal('cancel'),
  docNo: z.string().trim().min(1, 'ไม่พบเลขที่เบิกออกรอบิล').max(80, 'เลขที่เบิกออกรอบิลยาวเกินไป'),
  note: z.string().trim().min(1, 'กรอกเหตุผลการยกเลิก').max(500, 'เหตุผลการยกเลิกยาวเกินไป'),
})

const stockIssueEditSchema = stockIssueCreateSchema.extend({
  action: z.literal('edit'),
  docNo: z.string().trim().min(1, 'ไม่พบเลขที่เบิกออกรอบิล').max(80, 'เลขที่เบิกออกรอบิลยาวเกินไป'),
})

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

function deliveryOption(row: StockIssueDeliveryRow) {
  const activeHoldQtyByProduct = new Map<bigint, number>()
  row.stock_holds
    .filter((hold) => hold.status === 'active')
    .forEach((hold) => activeHoldQtyByProduct.set(hold.product_id, (activeHoldQtyByProduct.get(hold.product_id) ?? 0) + toNumber(hold.qty)))

  return {
    branchId: requireBusinessCode(row.branches.code, `สาขา ${row.branch_id}`),
    branchName: row.branches.name,
    customerId: row.customers?.code ? requireBusinessCode(row.customers.code, `ลูกค้า ${row.customer_id}`) : '',
    documentDate: toDateOnly(row.document_date),
    documentNo: row.doc_no,
    id: row.doc_no,
    lines: row.weight_ticket_lines.map((line) => ({
      deductWeight: toNumber(line.deduct_weight),
      grossWeight: toNumber(line.gross_weight),
      id: String(line.id),
      lineNo: line.line_no,
      netWeight: toNumber(line.net_weight),
      note: line.note ?? '',
      productId: requireBusinessCode(line.products?.code, `สินค้า ${line.product_id}`),
      productName: line.product_name,
      remainingQty: toNumber(line.net_weight),
      usedQty: 0,
    })),
    partyName: row.customers?.name ?? row.party_name,
    productSummaries: row.weight_ticket_product_summaries.flatMap((summary) => {
      const remainingWeight = activeHoldQtyByProduct.get(summary.product_id) ?? 0
      if (remainingWeight <= 0.0001) return []
      return [{
        billedWeight: toNumber(summary.billed_weight),
        deductWeight: toNumber(summary.deduct_weight),
        grossWeight: toNumber(summary.gross_weight),
        hasMixedDeductionProfiles: summary.has_mixed_deduction_profiles,
        id: String(summary.id),
        lineCount: summary.line_count,
        netWeight: toNumber(summary.net_weight),
        productId: requireBusinessCode(summary.products?.code, `สินค้า ${summary.product_id}`),
        productName: summary.product_name,
        remainingWeight,
        sourceLineIds: summary.weight_ticket_product_summary_lines.map((line) => String(line.weight_ticket_line_id)),
      }]
    }),
    status: row.status,
    vehicleNo: row.vehicle_no,
  }
}

async function stockIssueOptionsPayload() {
  const [branches, customers, deliveries, products, salesChannels, warehouses] = await Promise.all([
    prisma.branches.findMany({ orderBy: { name: 'asc' }, select: { active: true, code: true, id: true, name: true } }),
    prisma.customers.findMany({ orderBy: { name: 'asc' }, select: { active: true, code: true, id: true, name: true } }),
    prisma.weight_tickets.findMany({
      include: {
        branches: { select: { code: true, name: true } },
        customers: { select: { code: true, name: true } },
        stock_holds: { select: { product_id: true, qty: true, status: true } },
        weight_ticket_product_summaries: {
          include: {
            products: { select: { code: true, name: true } },
            weight_ticket_product_summary_lines: true,
          },
          orderBy: { product_name: 'asc' },
        },
        weight_ticket_lines: {
          include: { products: { select: { code: true } } },
          orderBy: { line_no: 'asc' },
        },
      },
      orderBy: [{ document_date: 'desc' }, { doc_no: 'desc' }],
      take: 100,
      where: {
        cancelled_at: null,
        doc_type: 'WTO',
        status: 'delivered',
        stock_holds: { some: { status: 'active' } },
      },
    }),
    prisma.products.findMany({ orderBy: { name: 'asc' }, select: { active: true, code: true, id: true, name: true, unit: true } }),
    prisma.sales_channels.findMany({ orderBy: { name: 'asc' }, select: { active: true, code: true, id: true, name: true } }),
    prisma.warehouses.findMany({
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
      select: { active: true, branches: { select: { code: true } }, code: true, id: true, name: true },
    }),
  ])

  return {
    branches: branches.map((branch) => ({ ...branch, id: requireBusinessCode(branch.code, `สาขา ${branch.id}`) })),
    customers: customers.map((customer) => ({ ...customer, id: requireBusinessCode(customer.code, `ลูกค้า ${customer.id}`) })),
    deliveries: deliveries.map(deliveryOption),
    products: products.map((product) => ({ ...product, id: requireBusinessCode(product.code, `สินค้า ${product.id}`) })),
    salesChannels: salesChannels.map((channel) => ({ ...channel, id: requireBusinessCode(channel.code, `ช่องทางขาย ${channel.id}`) })),
    warehouses: warehouses.map((warehouse) => ({
      active: warehouse.active,
      branch_id: warehouse.branches ? requireBusinessCode(warehouse.branches.code, `สาขาคลัง ${warehouse.id}`) : null,
      code: warehouse.code,
      id: warehouse.code,
      name: warehouse.name,
    })),
  }
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const query = parseStockIssueQuery(new URL(request.url))
    const where = stockIssueWhere(query)

    const [rows, totalRows, totals, optionsPayload] = await Promise.all([
      prisma.stock_issues.findMany({
        include: {
          branches: { select: { code: true, name: true } },
          customers: { select: { code: true, name: true } },
          stock_issue_status_logs: {
            orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
            select: {
              action: true,
              created_at: true,
              created_by: true,
              event_key: true,
              from_status: true,
              note: true,
              to_status: true,
            },
            take: 20,
          },
          warehouses: { select: { code: true, name: true } },
        },
        orderBy: stockIssueOrderBy(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      prisma.stock_issues.count({ where }),
      prisma.stock_issues.aggregate({ _sum: { total_est_amount: true }, where }),
      stockIssueOptionsPayload(),
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
        id: row.doc_no,
        items: Array.isArray(row.items) ? row.items : [],
        note: row.notes ?? '',
        itemCount: Array.isArray(row.items) ? row.items.length : 0,
        status: row.status ?? 'pending',
        totalCost: toNumber(row.total_cost),
        totalEstAmount: toNumber(row.total_est_amount),
        totalQty: Array.isArray(row.items) ? row.items.reduce<number>((sum, item) => {
          if (!item || typeof item !== 'object') return sum
          const value = (item as Record<string, unknown>).qty
          return sum + (typeof value === 'number' ? value : typeof value === 'string' ? Number(value || 0) : 0)
        }, 0) : 0,
        timeline: row.stock_issue_status_logs.map((log) => ({
          action: log.action,
          createdAt: log.created_at?.toISOString() ?? '',
          createdBy: log.created_by ?? '',
          eventKey: log.event_key,
          fromStatus: log.from_status ?? '',
          note: log.note ?? '',
          toStatus: log.to_status,
        })),
        warehouseId: row.warehouses?.code ?? '',
        warehouseName: row.warehouses?.name ?? '-',
      })),
      totalAmount: toNumber(totals._sum.total_est_amount),
      totalRows,
      ...optionsPayload,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดเบิกออกรอบิลไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const actor = currentActor(context)
    const values = stockIssueCreateSchema.parse(await request.json())

    const created = await prisma.$transaction(async (tx) => {
      const ticket = await tx.weight_tickets.findUnique({
        include: {
          customers: { select: { id: true } },
          stock_holds: {
            include: {
              products: { select: { code: true, name: true } },
              warehouses: { select: { code: true, id: true, name: true } },
            },
            orderBy: [{ source_line_no: 'asc' }, { id: 'asc' }],
            where: { status: 'active' },
          },
        },
        where: { doc_no: values.deliveryTicketId },
      })
      if (!ticket || ticket.doc_type !== 'WTO' || ticket.cancelled_at) {
        throw new Error('ไม่พบใบส่งของ WTO ที่พร้อมเบิกออกรอบิล')
      }
      if (ticket.status !== 'delivered') {
        throw new Error('ใบส่งของ WTO ต้องอยู่สถานะส่งของแล้วก่อนเบิกออกรอบิล')
      }
      if (!ticket.customer_id || !ticket.customers) {
        throw new Error('ใบส่งของ WTO ต้องมีลูกค้าก่อนเบิกออกรอบิล')
      }
      if (!ticket.stock_holds.length) {
        throw new Error('ใบส่งของนี้ไม่มี stock hold ที่พร้อมใช้ หรือถูกนำไปเปิดบิลแล้ว')
      }

      const docNo = await nextDailyDocNo('stock_issues', 'PSALE', values.date, tx)
      const consumedLines = await consumeActiveWtoStockHoldsForPendingSale(tx, {
        actor,
        branchId: ticket.branch_id,
        issueDate: normalizeDate(values.date),
        stockIssueDocNo: docNo,
        weightTicketId: ticket.id,
      })
      const productById = new Map(ticket.stock_holds.map((hold) => [hold.product_id, hold.products]))
      const warehouseById = new Map(ticket.stock_holds.map((hold) => [hold.warehouse_id, hold.warehouses]))
      const items = consumedLines.map((line, index) => {
        const product = productById.get(line.productId)
        const warehouse = warehouseById.get(line.warehouseId)
        const productCode = requireBusinessCode(product?.code, `สินค้า ${line.productId}`)
        const warehouseCode = requireBusinessCode(warehouse?.code, `คลัง ${line.warehouseId}`)
        const price = values.prices?.[productCode] ?? 0
        return {
          amount: line.qty * price,
          costAmount: line.valueOut,
          deliveryTicketDocNo: ticket.doc_no,
          deliveryTicketId: ticket.doc_no,
          lineNo: index + 1,
          price,
          productCode,
          productId: productCode,
          productName: product?.name ?? productCode,
          qty: line.qty,
          sourceLineNo: line.sourceLineNo,
          unitCost: line.unitCost,
          warehouseCode,
          warehouseId: warehouseCode,
          warehouseName: warehouse?.name ?? warehouseCode,
        }
      })
      const totalCost = items.reduce((sum, item) => sum + item.costAmount, 0)
      const totalEstAmount = items.reduce((sum, item) => sum + item.amount, 0)
      const firstWarehouseCode = items.find((item) => item.warehouseCode)?.warehouseCode
      const warehouse = firstWarehouseCode
        ? await tx.warehouses.findFirst({ select: { id: true }, where: { code: firstWarehouseCode } })
        : null
      const stockIssue = await tx.stock_issues.create({
        data: {
          branch_id: ticket.branch_id,
          created_by: actor,
          customer_id: ticket.customer_id,
          date: normalizeDate(values.date),
          doc_no: docNo,
          items: items as Prisma.InputJsonValue,
          notes: values.note ?? null,
          status: 'pending',
          total_cost: totalCost,
          total_est_amount: totalEstAmount,
          warehouse_id: warehouse?.id ?? null,
        },
        select: { doc_no: true, id: true },
      })
      await appendStockIssueStatusLog(tx, {
        action: STOCK_ISSUE_STATUS_ACTION.CREATED,
        actor,
        meta: {
          deliveryTicketDocNo: ticket.doc_no,
          reason: 'pending_sale_create',
        },
        note: values.note ?? null,
        stockIssueId: stockIssue.id,
        toStatus: 'pending',
      })
      await tx.weight_tickets.update({
        data: {
          status: 'partially_billed',
          updated_at: new Date(),
          updated_by: actor,
        },
        where: { id: ticket.id },
      })
      return stockIssue
    })

    return NextResponse.json({ docNo: created.doc_no, id: created.id.toString() }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกเบิกออกรอบิลไม่ได้', caught instanceof Error ? 400 : 500)
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')
    const actor = currentActor(context)
    const payload = await request.json()
    const action = z.object({ action: z.enum(['cancel', 'edit']) }).parse(payload).action

    if (action === 'edit') {
      const values = stockIssueEditSchema.parse(payload)
      const edited = await prisma.$transaction(async (tx) => {
        const stockIssue = await tx.stock_issues.findFirst({
          select: {
            converted_to_bill_id: true,
            doc_no: true,
            id: true,
            items: true,
            status: true,
          },
          where: { doc_no: values.docNo },
        })
        if (!stockIssue) throw new Error('ไม่พบรายการเบิกออกรอบิลที่ต้องการแก้ไข')
        if ((stockIssue.status ?? 'pending') !== 'pending' || stockIssue.converted_to_bill_id) {
          throw new Error('แก้ไขได้เฉพาะรายการที่ยังไม่ถูกดึงไปเปิดบิลขาย')
        }

        const existingItems = Array.isArray(stockIssue.items) ? stockIssue.items : []
        const firstItem = existingItems.find((item) => Boolean(item && typeof item === 'object' && !Array.isArray(item))) as Record<string, unknown> | undefined
        const originalDeliveryDocNo = typeof firstItem?.deliveryTicketDocNo === 'string' ? firstItem.deliveryTicketDocNo : ''
        if (!originalDeliveryDocNo) throw new Error('PSALE นี้ไม่มีเลขใบส่งของ WTO ต้นทาง ไม่สามารถแก้ไขได้')
        if (values.deliveryTicketId !== originalDeliveryDocNo) {
          throw new Error('แก้ไข PSALE ให้เปลี่ยนใบส่งของ WTO ไม่ได้ ให้ยกเลิกแล้วสร้างรายการใหม่')
        }

        const issueDate = normalizeDate(values.date)
        const reversedHolds = await reversePendingSaleStockIssue(tx, {
          actor,
          cancelDate: issueDate,
          note: values.note ?? 'แก้ไขเบิกออกรอบิล',
          stockIssueDocNo: stockIssue.doc_no,
        })
        const ticketIds = [...new Set(reversedHolds.map((hold) => hold.weight_ticket_id))]
        if (ticketIds.length !== 1) throw new Error('PSALE นี้ผูกกับใบส่งของมากกว่าหนึ่งใบ ไม่สามารถแก้ไขได้')

        const ticket = await tx.weight_tickets.findUnique({
          include: {
            customers: { select: { id: true } },
            stock_holds: {
              include: {
                products: { select: { code: true, name: true } },
                warehouses: { select: { code: true, id: true, name: true } },
              },
              orderBy: [{ source_line_no: 'asc' }, { id: 'asc' }],
              where: { status: 'active' },
            },
          },
          where: { id: ticketIds[0] },
        })
        if (!ticket || ticket.doc_type !== 'WTO' || ticket.cancelled_at || ticket.doc_no !== originalDeliveryDocNo) {
          throw new Error('ไม่พบใบส่งของ WTO ต้นทางที่พร้อมแก้ไข')
        }
        if (!ticket.customer_id || !ticket.customers) {
          throw new Error('ใบส่งของ WTO ต้องมีลูกค้าก่อนแก้ไขเบิกออกรอบิล')
        }
        if (!ticket.stock_holds.length) {
          throw new Error('ใบส่งของนี้ไม่มี stock hold ที่พร้อมใช้หลัง reverse')
        }

        const consumedLines = await consumeActiveWtoStockHoldsForPendingSale(tx, {
          actor,
          branchId: ticket.branch_id,
          issueDate,
          stockIssueDocNo: stockIssue.doc_no,
          weightTicketId: ticket.id,
        })
        const productById = new Map(ticket.stock_holds.map((hold) => [hold.product_id, hold.products]))
        const warehouseById = new Map(ticket.stock_holds.map((hold) => [hold.warehouse_id, hold.warehouses]))
        const items = consumedLines.map((line, index) => {
          const product = productById.get(line.productId)
          const warehouse = warehouseById.get(line.warehouseId)
          const productCode = requireBusinessCode(product?.code, `สินค้า ${line.productId}`)
          const warehouseCode = requireBusinessCode(warehouse?.code, `คลัง ${line.warehouseId}`)
          const price = values.prices?.[productCode] ?? 0
          return {
            amount: line.qty * price,
            costAmount: line.valueOut,
            deliveryTicketDocNo: ticket.doc_no,
            deliveryTicketId: ticket.doc_no,
            lineNo: index + 1,
            price,
            productCode,
            productId: productCode,
            productName: product?.name ?? productCode,
            qty: line.qty,
            sourceLineNo: line.sourceLineNo,
            unitCost: line.unitCost,
            warehouseCode,
            warehouseId: warehouseCode,
            warehouseName: warehouse?.name ?? warehouseCode,
          }
        })
        const totalCost = items.reduce((sum, item) => sum + item.costAmount, 0)
        const totalEstAmount = items.reduce((sum, item) => sum + item.amount, 0)
        const firstWarehouseCode = items.find((item) => item.warehouseCode)?.warehouseCode
        const warehouse = firstWarehouseCode
          ? await tx.warehouses.findFirst({ select: { id: true }, where: { code: firstWarehouseCode } })
          : null
        await tx.weight_tickets.update({
          data: {
            status: 'partially_billed',
            updated_at: new Date(),
            updated_by: actor,
          },
          where: { id: ticket.id },
        })
        await appendWeightTicketStatusLog(tx, {
          action: WEIGHT_TICKET_STATUS_ACTION.USAGE_STATUS_CHANGED,
          actor,
          createdAt: new Date(),
          fromStatus: ticket.status,
          meta: { reason: 'pending_sale_edit', stockIssueDocNo: stockIssue.doc_no },
          note: values.note ?? null,
          toStatus: 'partially_billed',
          weightTicketId: ticket.id,
        })

        const updated = await tx.stock_issues.update({
          data: {
            date: issueDate,
            items: items as Prisma.InputJsonValue,
            notes: values.note ?? null,
            total_cost: totalCost,
            total_est_amount: totalEstAmount,
            warehouse_id: warehouse?.id ?? null,
          },
          select: { doc_no: true },
          where: { id: stockIssue.id },
        })
        await appendStockIssueStatusLog(tx, {
          action: STOCK_ISSUE_STATUS_ACTION.EDITED,
          actor,
          fromStatus: stockIssue.status ?? 'pending',
          meta: {
            deliveryTicketDocNo: ticket.doc_no,
            reason: 'pending_sale_edit',
            reverseRefType: 'PSALE-CANCEL',
          },
          note: values.note ?? null,
          stockIssueId: stockIssue.id,
          toStatus: 'pending',
        })
        return updated
      })

      return NextResponse.json({ docNo: edited.doc_no })
    }

    const values = stockIssueCancelSchema.parse(payload)

    const cancelled = await prisma.$transaction(async (tx) => {
      const stockIssue = await tx.stock_issues.findFirst({
        select: {
          converted_to_bill_id: true,
          doc_no: true,
          id: true,
          status: true,
        },
        where: { doc_no: values.docNo },
      })
      if (!stockIssue) throw new Error('ไม่พบรายการเบิกออกรอบิลที่ต้องการยกเลิก')
      if ((stockIssue.status ?? 'pending') !== 'pending' || stockIssue.converted_to_bill_id) {
        throw new Error('ยกเลิกได้เฉพาะรายการที่ยังรอเปิดบิล')
      }

      const now = new Date()
      const holds = await reversePendingSaleStockIssue(tx, {
        actor,
        cancelDate: now,
        note: values.note,
        stockIssueDocNo: stockIssue.doc_no,
      })
      const ticketIds = [...new Set(holds.map((hold) => hold.weight_ticket_id))]
      await Promise.all(ticketIds.map(async (ticketId) => {
        const ticket = await tx.weight_tickets.findUnique({ select: { status: true }, where: { id: ticketId } })
        if (!ticket) return
        await tx.weight_tickets.update({
          data: {
            status: 'delivered',
            updated_at: now,
            updated_by: actor,
          },
          where: { id: ticketId },
        })
        await appendWeightTicketStatusLog(tx, {
          action: WEIGHT_TICKET_STATUS_ACTION.USAGE_STATUS_CHANGED,
          actor,
          createdAt: now,
          fromStatus: ticket.status,
          meta: { reason: 'pending_sale_cancel', stockIssueDocNo: stockIssue.doc_no },
          note: values.note,
          toStatus: 'delivered',
          weightTicketId: ticketId,
        })
      }))

      const updated = await tx.stock_issues.update({
        data: {
          notes: values.note,
          status: 'cancelled',
        },
        select: { doc_no: true },
        where: { id: stockIssue.id },
      })
      await appendStockIssueStatusLog(tx, {
        action: STOCK_ISSUE_STATUS_ACTION.CANCELLED,
        actor,
        fromStatus: stockIssue.status ?? 'pending',
        meta: {
          reason: 'pending_sale_cancel',
          reverseRefType: 'PSALE-CANCEL',
        },
        note: values.note,
        stockIssueId: stockIssue.id,
        toStatus: 'cancelled',
      })
      return updated
    })

    return NextResponse.json({ docNo: cancelled.doc_no })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกเบิกออกรอบิลไม่ได้', caught instanceof Error ? 400 : 500)
  }
}
