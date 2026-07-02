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
    const salesBillAllocations = await prisma.sales_bill_source_allocations.findMany({
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: {
        product_id: true,
        sales_bills: {
          select: {
            doc_no: true,
          },
        },
      },
      where: {
        product_id: { in: productIds },
        sales_bills: {
          status: { notIn: ['cancelled', 'canceled'] },
        },
        source_doc_no: ticket.doc_no,
        source_type: 'WTO',
        status: 'active',
        weight_ticket_id: ticket.id,
      },
    })
    const salesBillDocNosByProductId = new Map<bigint, string[]>()
    for (const allocation of salesBillAllocations) {
      if (!allocation.product_id) continue
      const docNo = allocation.sales_bills.doc_no
      const current = salesBillDocNosByProductId.get(allocation.product_id) ?? []
      if (!current.includes(docNo)) current.push(docNo)
      salesBillDocNosByProductId.set(allocation.product_id, current)
    }

    const optionGroups = new Map<string, {
      pendingOutKey: string
      pendingOutKeys: string[]
      pendingQty: number
      productCode: string
      productName: string
      salesBillDocNos: string[]
      sourceLineNos: number[]
      warehouseName: string
      weightTicketDocNo: string
    }>()

    for (const hold of holds) {
      const salesBillDocNos = salesBillDocNosByProductId.get(hold.product_id) ?? []
      if (salesBillDocNos.length === 0) continue

      const groupKey = `GROUP:${hold.product_id.toString()}:${hold.warehouse_id.toString()}`
      const current = optionGroups.get(groupKey) ?? {
        pendingOutKey: groupKey,
        pendingOutKeys: [],
        pendingQty: 0,
        productCode: hold.products.code ?? '',
        productName: hold.products.name,
        salesBillDocNos,
        sourceLineNos: [],
        warehouseName: hold.warehouses.name,
        weightTicketDocNo: hold.source_doc_no,
      }
      current.pendingOutKeys.push(hold.hold_key)
      current.pendingQty = Number((current.pendingQty + toNumber(hold.qty)).toFixed(2))
      if (hold.source_line_no != null && !current.sourceLineNos.includes(hold.source_line_no)) {
        current.sourceLineNos.push(hold.source_line_no)
        current.sourceLineNos.sort((left, right) => left - right)
      }
      for (const docNo of salesBillDocNos) {
        if (!current.salesBillDocNos.includes(docNo)) current.salesBillDocNos.push(docNo)
      }
      optionGroups.set(groupKey, current)
    }

    return NextResponse.json({
      options: [...optionGroups.values()]
        .map((option) => ({
          ...option,
          sourceLineNo: option.sourceLineNos.length === 1 ? option.sourceLineNos[0] : null,
        }))
        .filter((option) => option.pendingQty > 0.0001 && option.salesBillDocNos.length > 0),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการรับของคืนจากใบส่งของไม่ได้', 500)
  }
}
