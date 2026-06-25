import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toNumber } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { branchScopeIds } from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const ticketRef = decodeURIComponent(id)
    const scopedBranchIds = branchScopeIds(auth)
    const ticket = await prisma.weight_tickets.findFirst({
      select: {
        doc_no: true,
        doc_type: true,
        id: true,
      },
      where: {
        doc_no: ticketRef,
        ...(scopedBranchIds.length ? { branches: { code: { in: scopedBranchIds } } } : {}),
      },
    })
    if (!ticket) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบส่งของ' }, { status: 404 })
    if (ticket.doc_type !== 'WTO') {
      return NextResponse.json({ options: [] })
    }

    const holds = await prisma.stock_holds.findMany({
      include: {
        products: { select: { code: true, name: true } },
        warehouses: { select: { name: true } },
      },
      orderBy: [{ source_line_no: 'asc' }, { id: 'asc' }],
      where: {
        source_type: 'WTO',
        status: 'active',
        weight_ticket_id: ticket.id,
      },
    })
    if (holds.length === 0) return NextResponse.json({ options: [] })

    const productIds = [...new Set(holds.map((hold) => hold.product_id))]
    const usageLogs = await prisma.weight_ticket_usage_logs.findMany({
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: {
        product_id: true,
        target_doc_no: true,
      },
      where: {
        action: 'allocated_to_sales_bill',
        product_id: { in: productIds },
        target_doc_no: { not: null },
        target_type: 'SALES_BILL',
        weight_ticket_id: ticket.id,
      },
    })
    const salesBillDocNos = [...new Set(usageLogs.map((log) => log.target_doc_no).filter((docNo): docNo is string => Boolean(docNo)))]
    const activeSalesBills = salesBillDocNos.length
      ? await prisma.sales_bills.findMany({
          select: { doc_no: true, status: true },
          where: {
            doc_no: { in: salesBillDocNos },
            status: { notIn: ['cancelled', 'canceled'] },
          },
        })
      : []
    const activeSalesBillDocNoSet = new Set(activeSalesBills.map((bill) => bill.doc_no))
    const salesBillDocNosByProductId = new Map<bigint, string[]>()
    for (const log of usageLogs) {
      if (!log.product_id || !log.target_doc_no || !activeSalesBillDocNoSet.has(log.target_doc_no)) continue
      const current = salesBillDocNosByProductId.get(log.product_id) ?? []
      if (!current.includes(log.target_doc_no)) current.push(log.target_doc_no)
      salesBillDocNosByProductId.set(log.product_id, current)
    }

    return NextResponse.json({
      options: holds
        .map((hold) => ({
          pendingOutKey: hold.hold_key,
          pendingQty: toNumber(hold.qty),
          productCode: hold.products.code ?? '',
          productName: hold.products.name,
          salesBillDocNos: salesBillDocNosByProductId.get(hold.product_id) ?? [],
          sourceLineNo: hold.source_line_no,
          warehouseName: hold.warehouses.name,
          weightTicketDocNo: hold.source_doc_no,
        }))
        .filter((option) => option.pendingQty > 0.0001 && option.salesBillDocNos.length > 0),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการรับของคืนจากใบส่งของไม่ได้', 500)
  }
}
