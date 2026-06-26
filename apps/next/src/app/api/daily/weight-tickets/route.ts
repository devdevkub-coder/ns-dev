import { NextResponse } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { calculateTicketTotals, isOtherProductImpurityId, isOtherProductImpurityLabel, weightTicketFormSchema } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { findActiveBranchReferenceByCodeOrId, findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { PartyBranchEligibilityError, assertCustomerEligibleForBranch, assertSupplierEligibleForBranch } from '@/lib/server/party-branch-eligibility'
import { prisma } from '@/lib/server/prisma'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import {
  createActiveWtoPendingOut,
  resolveWtoWarehousesForLines,
  validateWtoStockAvailability,
  WtoPendingOutError,
} from '@/lib/server/stock-holds'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
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
import { syncWeightTicketToGoogleSheets } from '@/lib/server/google-sheets-sync'
import { enqueueNotificationJob, executeNotificationJob } from '@/lib/server/line-notification-jobs'

export const runtime = 'nodejs'

const ticketInclude = {
  branches: true,
  customers: true,
  suppliers: true,
  weight_ticket_product_summaries: {
    include: {
      products: {
        select: { code: true, id: true },
      },
    },
    orderBy: { product_name: 'asc' },
  },
  weight_ticket_lines: {
    include: {
      products: {
        select: { code: true, id: true },
      },
      warehouses: {
        select: { code: true, id: true, name: true, type: true },
      },
    },
    orderBy: { line_no: 'asc' },
  },
} as const

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')

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
    requirePermission(context, 'daily.weight_tickets.view')

    const values = weightTicketFormSchema.parse(await request.json())
    const scopedBranchIds = branchScopeIds(context)
    const parsedImpurityIds = values.lines.map((line) => parseInternalBigIntId(line.impurityId))
    const productCodes = [...new Set(values.lines.flatMap((line) => [
      line.productId.trim().toUpperCase(),
      line.impurityProductId?.trim().toUpperCase() ?? '',
    ]).filter(Boolean))]
    const impurityIds = [...new Set(parsedImpurityIds.filter((value): value is bigint => value != null))]

    const [scopedBranches, branch, supplier, customer, products, impurities] = await Promise.all([
      findActiveBranchReferencesByCodes(scopedBranchIds),
      prisma.branches.findFirst({
        select: { code: true, id: true, name: true },
        where: {
          active: true,
          code: values.branchId.toUpperCase(),
        },
      }),
      values.type === 'WTI'
        ? findActiveSupplierReferenceByCodeOrId(values.partyId)
        : Promise.resolve(null),
      values.type === 'WTO'
        ? findActiveCustomerReferenceByCodeOrId(values.partyId)
        : Promise.resolve(null),
      prisma.products.findMany({
        select: { code: true, id: true, name: true },
        where: { active: true, code: { in: productCodes } },
      }),
      impurityIds.length
        ? prisma.impurities.findMany({
          select: { active: true, id: true, name: true },
          where: { active: true, id: { in: impurityIds } },
        })
        : Promise.resolve([]),
    ])

    if (!branch || (scopedBranchIds.length && !scopedBranches.some((item) => item.id === branch.id))) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    }
    if (values.type === 'WTI' && !supplier) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ผู้ขายไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { partyId: ['เลือกผู้ขาย'] } }, { status: 400 })
    }
    if (values.type === 'WTO' && !customer) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ลูกค้าไม่ถูกต้องหรือถูกปิดใช้งาน', fieldErrors: { partyId: ['เลือกลูกค้า'] } }, { status: 400 })
    }
    try {
      if (values.type === 'WTI' && supplier) {
        await assertSupplierEligibleForBranch({ branchId: branch.id, supplierId: supplier.id })
      }
      if (values.type === 'WTO' && customer) {
        await assertCustomerEligibleForBranch({ branchId: branch.id, customerId: customer.id })
      }
    } catch (caught) {
      if (caught instanceof PartyBranchEligibilityError) {
        return NextResponse.json({
          code: 'BAD_REQUEST',
          error: caught.message,
          fieldErrors: { partyId: [caught.message] },
        }, { status: 400 })
      }
      throw caught
    }

    const productByCode = new Map(products.map((product) => [product.code.trim().toUpperCase(), product] as const))
    const missingProductIndex = values.lines.findIndex((_, index) => {
      const productCode = values.lines[index]?.productId.trim().toUpperCase() ?? ''
      return !productCode || !productByCode.has(productCode)
    })
    if (missingProductIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingProductIndex + 1}: สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`lines.${missingProductIndex}.productId`]: ['สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }
    const missingImpurityProductIndex = values.lines.findIndex((line) => {
      const productCode = line.impurityProductId?.trim().toUpperCase() ?? ''
      return Boolean(productCode) && !productByCode.has(productCode)
    })
    if (missingImpurityProductIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingImpurityProductIndex + 1}: สินค้าที่ปนมาไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`lines.${missingImpurityProductIndex}.impurityProductId`]: ['สินค้าที่ปนมาไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }

    const impurityById = new Map(impurities.map((impurity) => [impurity.id, impurity] as const))
    const wtoOtherProductImpurityIndex = values.lines.findIndex((line) => isOtherProductImpurityId(line.impurityId) && values.type === 'WTO')
    if (wtoOtherProductImpurityIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${wtoOtherProductImpurityIndex + 1}: ใบส่งของไม่รองรับสิ่งเจือปนแบบสินค้าอื่น`,
        fieldErrors: { [`lines.${wtoOtherProductImpurityIndex}.impurityId`]: ['ใบส่งของไม่รองรับสิ่งเจือปนแบบสินค้าอื่น'] },
      }, { status: 400 })
    }
    const missingImpurityIndex = values.lines.findIndex((line, index) => {
      const impurityId = parsedImpurityIds[index]
      return Boolean(line.impurityId) && !isOtherProductImpurityId(line.impurityId) && (impurityId == null || !impurityById.has(impurityId))
    })
    if (missingImpurityIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${missingImpurityIndex + 1}: สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน`,
        fieldErrors: { [`lines.${missingImpurityIndex}.impurityId`]: ['สิ่งเจือปนไม่ถูกต้องหรือถูกปิดใช้งาน'] },
      }, { status: 400 })
    }
    const legacyOtherProductImpurityIndex = values.lines.findIndex((line, index) => {
      const impurityId = parsedImpurityIds[index]
      if (!line.impurityId || isOtherProductImpurityId(line.impurityId) || impurityId == null) return false
      return isOtherProductImpurityLabel(impurityById.get(impurityId)?.name)
    })
    if (legacyOtherProductImpurityIndex >= 0) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: `รายการที่ ${legacyOtherProductImpurityIndex + 1}: สินค้าอื่นเป็นตัวเลือกของระบบสำหรับ WTI เท่านั้น ไม่ใช่ master สิ่งเจือปน`,
        fieldErrors: { [`lines.${legacyOtherProductImpurityIndex}.impurityId`]: ['เลือกตัวเลือกสินค้าอื่นของระบบแทน master data'] },
      }, { status: 400 })
    }

    const actor = currentActor(context)
    const enteredBy = enteredByLabel(context)
    const documentDate = bangkokDateInput(new Date())
    const totals = calculateTicketTotals(values.lines.map((line) => ({
      containerDeductionWeight: String(line.containerDeductionWeight),
      deductionMode: line.deductionMode,
      deductionValue: String(line.deductionValue),
      grossWeight: String(line.grossWeight),
      id: line.id,
      impuritySourceLineId: line.impuritySourceLineId,
      parentId: line.parentId,
      impurityId: line.impurityId,
    })))

    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('weight_tickets.doc_no'))`
      const branchCode = String(branch.code ?? '').replace(/\D/g, '').slice(-2).padStart(2, '0')
      const docNo = await nextWeightTicketDocNo(tx, values.type, branchCode, documentDate)
      const createdTicket = await tx.weight_tickets.create({
        data: {
          branch_id: branch.id,
          created_by: actor,
          customer_id: values.type === 'WTO' ? customer?.id ?? null : null,
          doc_no: docNo,
          doc_type: values.type,
          document_date: new Date(`${documentDate}T00:00:00.000Z`),
          entered_by: enteredBy,
          container_deduction_weight: totals.containerDeductionWeight,
          gross_weight: totals.grossWeight,
          image_count: values.vehicleImageNames.length,
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
      const warehouseByCode = values.type === 'WTO'
        ? await resolveWtoWarehousesForLines(tx, { branchId: branch.id, lines: values.lines })
        : new Map()
      const lineRows = buildWeightTicketLineRows(createdTicket.id, values, productByCode, impurityById, warehouseByCode)
      if (values.type === 'WTO') {
        await validateWtoStockAvailability(tx, {
          branchId: branch.id,
          lines: lineRows.map((line, index) => ({
            index,
            netWeight: Number(line.net_weight),
            productId: line.product_id,
            productName: line.product_name,
            warehouseId: line.warehouse_id,
          })),
        })
      }
      const createdLines = await Promise.all(lineRows.map((data) => tx.weight_ticket_lines.create({ data })))
      if (values.type === 'WTO') {
        await createActiveWtoPendingOut(tx, {
          actor,
          branchId: branch.id,
          documentNo: docNo,
          lines: createdLines,
          weightTicketId: createdTicket.id,
        })
      }
      const imageCount = values.vehicleImageNames.length + createdLines.reduce((sum, line) => sum + (line.image_count ?? 0), 0)
      const { summaryRows } = buildWeightTicketProductSummaryRows(createdTicket.id, createdLines)
      const createdSummaries = await Promise.all(summaryRows.map(({ lineIds, ...data }) => tx.weight_ticket_product_summaries.create({ data })))
      const summaryIdByProductId = new Map(createdSummaries.map((summary) => [String(summary.product_id), summary.id] as const))
      const bridgeRows = summaryRows.flatMap(({ lineIds, product_id }) => {
        const summaryId = summaryIdByProductId.get(String(product_id))
        if (summaryId == null) return []
        return lineIds.map((lineId) => ({
          created_at: new Date(),
          summary_id: summaryId,
          weight_ticket_line_id: lineId,
        }))
      })
      if (bridgeRows.length) {
        await tx.weight_ticket_product_summary_lines.createMany({ data: bridgeRows })
      }
      const warehouseName = values.warehouseName || null

      await tx.weight_tickets.update({
        data: { 
          image_count: imageCount,
          warehouse_name: warehouseName,
        },
        where: { id: createdTicket.id },
      })
      await appendWeightTicketStatusLog(tx, {
        action: WEIGHT_TICKET_STATUS_ACTION.CREATED,
        actor,
        meta: {
          reason: 'weight_ticket_create',
          type: values.type,
        },
        toStatus: defaultTicketStatus(values.type),
        weightTicketId: createdTicket.id,
      })

      return tx.weight_tickets.findUniqueOrThrow({
        include: ticketInclude,
        where: { id: createdTicket.id },
      })
    })

    const usage = await getWeightTicketUsageCounts(prisma, created.id)
    const mapped = mapWeightTicketRow(created, usage)
    await syncWeightTicketToGoogleSheets('create', mapped)

    // Trigger auto-send to LINE if enabled for specific type
    const autoSendKey = mapped.type === 'WTI' ? 'LINE_AUTO_SEND_WTI' : 'LINE_AUTO_SEND_WTO'
    const autoSendConfig = await prisma.system_settings.findUnique({
      where: { key: autoSendKey },
    })
    if (autoSendConfig?.value === 'true') {
      try {
        // Auto-send: enqueue แล้ว execute ทันที (ไม่รอ worker) ตามแนวทาง A
        const enqueueResult = await enqueueNotificationJob(mapped.documentNo, {
          requestedBy: enteredBy,
          force: false,
        })
        for (const job of enqueueResult.jobs) {
          try {
            await executeNotificationJob(job.id, { force: false })
          } catch (err) {
            console.error('[weight-ticket-auto-send] failed to execute job:', job.id, err)
          }
        }
      } catch (err) {
        console.error('[weight-ticket-auto-send] failed to enqueue LINE notification:', err)
      }
    }

    await recordAuditLog({
      action: 'create',
      afterData: weightTicketAuditSnapshot(mapped),
      context,
      entityId: String(created.id),
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
      targetId: String(created.id),
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
    if (caught instanceof WtoPendingOutError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'บันทึกใบรับ-ส่งของไม่ได้', 400)
  }
}
