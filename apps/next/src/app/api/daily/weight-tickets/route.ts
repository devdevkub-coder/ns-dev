import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { weightTicketFormSchema } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import {
  bangkokDateInput,
  branchScopeIds,
  buildWeightTicketLineRows,
  buildWeightTicketProductSummaryRows,
  defaultTicketStatus,
  enteredByLabel,
  getWeightTicketTimeline,
  getWeightTicketUsageCounts,
  mapWeightTicketRow,
  nextWeightTicketDocNo,
  parseWeightTicketQuery,
  weightTicketAuditSnapshot,
  weightTicketOrderBy,
  weightTicketWhere,
} from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

const ticketInclude = {
  branches: true,
  customers: true,
  suppliers: true,
  weight_ticket_product_summaries: {
    orderBy: { product_name: 'asc' },
  },
  weight_ticket_lines: {
    orderBy: { line_no: 'asc' },
  },
} as const

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const query = parseWeightTicketQuery(new URL(request.url))
    const scopedBranchIds = branchScopeIds(context)
    const where = weightTicketWhere(query, scopedBranchIds)
    const orderBy = weightTicketOrderBy(query)

    const [rows, totalRows] = await Promise.all([
      prisma.weight_tickets.findMany({
        include: ticketInclude,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        where,
      }),
      prisma.weight_tickets.count({ where }),
    ])

    const mappedRows = await Promise.all(rows.map(async (row: Awaited<typeof rows>[number]) => {
      const usage = await getWeightTicketUsageCounts(prisma, row.id)
      return mapWeightTicketRow(row, usage)
    }))

    return NextResponse.json({ rows: mappedRows, totalRows })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการใบรับ-ส่งของไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.cash.view')

    const values = weightTicketFormSchema.parse(await request.json())
    const scopedBranchIds = branchScopeIds(context)
    const productIds = [...new Set(values.lines.map((line) => line.productId))]
    const impurityIds = [...new Set(values.lines.map((line) => line.impurityId).filter(Boolean))]

    const [branch, supplier, customer, products, impurities] = await Promise.all([
      prisma.branches.findFirst({
        select: { code: true, id: true, name: true },
        where: {
          active: true,
          id: values.branchId,
          ...(scopedBranchIds.length ? { id: { in: scopedBranchIds } } : {}),
        },
      }),
      values.type === 'WTI'
        ? prisma.suppliers.findFirst({ select: { id: true, name: true }, where: { active: true, id: values.partyId } })
        : Promise.resolve(null),
      values.type === 'WTO'
        ? prisma.customers.findFirst({ select: { id: true, name: true }, where: { active: true, id: values.partyId } })
        : Promise.resolve(null),
      prisma.products.findMany({
        select: { id: true, name: true },
        where: { active: true, id: { in: productIds } },
      }),
      impurityIds.length
        ? prisma.impurities.findMany({
          select: { active: true, id: true, name: true },
          where: { active: true, id: { in: impurityIds } },
        })
        : Promise.resolve([]),
    ])

    if (!branch) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    }
    if (values.type === 'WTI' && !supplier) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { partyId: ['เลือกผู้ขาย'] } }, { status: 400 })
    }
    if (values.type === 'WTO' && !customer) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { partyId: ['เลือกลูกค้า'] } }, { status: 400 })
    }

    const productById = new Map(products.map((product) => [product.id, product]))
    const missingProductIndex = values.lines.findIndex((line) => !productById.has(line.productId))
    if (missingProductIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingProductIndex + 1}: สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`lines.${missingProductIndex}.productId`]: ['สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }

    const impurityById = new Map(impurities.map((impurity) => [impurity.id, impurity]))
    const missingImpurityIndex = values.lines.findIndex((line) => line.impurityId && !impurityById.has(line.impurityId))
    if (missingImpurityIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingImpurityIndex + 1}: สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`lines.${missingImpurityIndex}.impurityId`]: ['สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }

    const actor = currentActor(context)
    const enteredBy = enteredByLabel(context)
    const documentDate = bangkokDateInput(new Date())
    const totals = values.lines.reduce((summary, line) => {
      const grossWeight = Number(line.grossWeight)
      const deductionWeight = line.deductionMode === 'percent'
        ? grossWeight * Number(line.deductionValue) / 100
        : line.deductionMode === 'kg'
          ? Number(line.deductionValue)
          : 0
      summary.grossWeight += grossWeight
      summary.deductionWeight += Math.min(deductionWeight, grossWeight)
      summary.netWeight += Math.max(0, grossWeight - Math.min(deductionWeight, grossWeight))
      return summary
    }, { deductionWeight: 0, grossWeight: 0, netWeight: 0 })

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('weight_tickets.doc_no'))`
      const branchCode = String(branch.code ?? '').replace(/\D/g, '').slice(-2).padStart(2, '0')
      const docNo = await nextWeightTicketDocNo(tx, values.type, branchCode, documentDate)
      const ticketId = `WT-${randomUUID()}`
      const lineRows = buildWeightTicketLineRows(ticketId, values, productById, impurityById)
      const { bridgeRows, summaryRows } = buildWeightTicketProductSummaryRows(ticketId, lineRows)
      const imageCount = values.vehicleImageNames.length + lineRows.reduce((sum, line) => sum + line.image_count, 0)

      await tx.weight_tickets.create({
        data: {
          branch_id: branch.id,
          created_by: actor,
          customer_id: values.type === 'WTO' ? customer?.id ?? null : null,
          doc_no: docNo,
          doc_type: values.type,
          document_date: new Date(`${documentDate}T00:00:00.000Z`),
          entered_by: enteredBy,
          gross_weight: totals.grossWeight,
          id: ticketId,
          image_count: imageCount,
          net_weight: totals.netWeight,
          party_name: values.type === 'WTI' ? supplier?.name ?? '' : customer?.name ?? '',
          remark: values.remark || null,
          status: defaultTicketStatus(values.type),
          supplier_id: values.type === 'WTI' ? supplier?.id ?? null : null,
          deduct_weight: totals.deductionWeight,
          updated_by: actor,
          vehicle_image_count: values.vehicleImageNames.length,
          vehicle_image_names: values.vehicleImageNames,
          vehicle_no: values.vehicleNo,
        },
      })
      await tx.weight_ticket_lines.createMany({ data: lineRows })
      await tx.weight_ticket_product_summaries.createMany({ data: summaryRows })
      await tx.weight_ticket_product_summary_lines.createMany({ data: bridgeRows })

      return tx.weight_tickets.findUniqueOrThrow({
        include: ticketInclude,
        where: { id: ticketId },
      })
    })

    const usage = await getWeightTicketUsageCounts(prisma, created.id)
    const mapped = mapWeightTicketRow(created, usage)
    await recordAuditLog({
      action: 'create',
      afterData: weightTicketAuditSnapshot(mapped),
      context,
      entityId: created.id,
      entityLabel: created.doc_no,
      entitySchema: 'public',
      entityTable: 'weight_tickets',
      eventKey: 'daily.weight-ticket.created',
      metadata: {
        branchName: mapped.branchName,
        documentNo: mapped.documentNo,
        type: mapped.type,
      },
      request,
      targetId: created.id,
      targetLabel: created.doc_no,
      targetType: 'weight_ticket',
    })
    const timeline = await getWeightTicketTimeline(prisma, created.id)
    return NextResponse.json({
      ...mapped,
      timeline,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกใบรับ-ส่งของไม่ได้', 400)
  }
}
