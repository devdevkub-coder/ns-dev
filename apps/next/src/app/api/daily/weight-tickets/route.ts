import { NextResponse } from 'next/server'
import { parseInternalBigIntId } from '@/lib/business-code'
import { calculateTicketTotals, displayWeightTicketStatus, isWeightTicketDraftLotSkeleton, type WeightTicketStatus, type WeightTicketType, weightTicketFormSchema } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, hasPermission, requirePermission } from '@/lib/server/auth-context'
import { withAuthNoStore } from '@/lib/server/auth-response'
import { currentActor } from '@/lib/server/daily'
import { findActiveBranchReferenceByCodeOrId, findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { findActiveCustomerReferenceByCodeOrId } from '@/lib/server/customer-reference'
import { prisma } from '@/lib/server/prisma'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { assertWeightTicketImpurityRules, assertWeightTicketPartyForType, WeightTicketWriteValidationError } from '@/lib/server/weight-ticket-write/type-guards'
import {
  WtoPendingOutError,
} from '@/lib/server/stock-holds'
import { resolveWeightTicketWarehousesForWrite, validateWeightTicketStockForWrite, weightTicketPartySnapshot } from '@/lib/server/weight-ticket-write/handlers'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import {
  bangkokDateInput,
  branchScopeIds,
  buildWeightTicketLineIdMap,
  buildWeightTicketLineRows,
  buildWeightTicketProductSummaryRows,
  defaultTicketStatus,
  enteredByLabel,
  getWeightTicketUsageCounts,
  getWeightTicketUsageCountsByTicketIds,
  mapWeightTicketRow,
  mapWeightTicketListRow,
  nextWeightTicketDocNo,
  parseWeightTicketQuery,
  requireWeightTicketBranchDocumentCode,
  resolveWeightTicketActorDisplayNames,
  WeightTicketDataContractError,
  weightTicketActorDisplayName,
  weightTicketAuditSnapshot,
  weightTicketOrderBy,
  weightTicketInclude,
  weightTicketWhere,
  weightTicketListSelect,
  type WeightTicketListRow,
  type WeightTicketRow,
} from '@/lib/server/weight-tickets'
import { assertWeightTicketImageAssetOwnership, attachWeightTicketImageAssets, normalizeWeightTicketImageReferences, resolveWeightTicketImageBucket } from '@/lib/server/weight-ticket-storage'
import { publishWeightTicketChange } from '@/lib/server/weight-ticket-realtime'
import { applyWorksheetTableLayout, XLSX } from '@/lib/server/xlsx'

export const runtime = 'nodejs'

type WeightTicketMappedRow = ReturnType<typeof mapWeightTicketRow>

async function buildWeightTicketWorkbook(rows: WeightTicketMappedRow[]) {
  const workbookRows = rows.map((row) => ({
    เลขที่: row.documentNo,
    ประเภท: row.type === 'WTI' ? 'ใบรับของ WTI' : 'ใบส่งของ WTO',
    วันที่เอกสาร: row.documentDate,
    วันที่สร้าง: row.createdAt,
    คู่ค้า: row.partyName,
    สาขา: row.branchName,
    ทะเบียนรถ: row.vehicleNo,
    โกดัง: row.godownName,
    น้ำหนักรวม: row.totals.grossWeight,
    หักภาชนะ: row.totals.containerDeductionWeight,
    น้ำหนักสุทธิ: row.totals.netWeight,
    สถานะ: displayWeightTicketStatus(row.type as WeightTicketType, row.status as WeightTicketStatus),
    สินค้า: row.productSummaries.map((item) => `${item.productName} ${item.netWeight}`).join(', '),
    หมายเหตุ: row.remark,
    ผู้บันทึก: row.enteredBy,
    อัปเดตล่าสุด: row.updatedAt,
  }))
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.json_to_sheet(workbookRows)
  const headers = workbookRows[0] ? Object.keys(workbookRows[0]) : []
  sheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, header.length + 4) }))
  applyWorksheetTableLayout(sheet, headers.length, workbookRows.length + 1)
  XLSX.utils.book_append_sheet(workbook, sheet, 'Weight Tickets')
  return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

function xlsxResponse(body: Buffer, filename: string) {
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  })
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.view')

    const query = parseWeightTicketQuery(new URL(request.url))
    const scopedBranchIds = branchScopeIds(context)
    const where = weightTicketWhere(query, scopedBranchIds)
    const orderBy = weightTicketOrderBy(query)

    const isXlsx = new URL(request.url).searchParams.get('format') === 'xlsx'
    const take = isXlsx ? 10000 : query.pageSize
    const [rows, totalRows] = await Promise.all([
      isXlsx
        ? prisma.weight_tickets.findMany({
          include: weightTicketInclude,
          orderBy,
          take,
          where,
        })
        : prisma.weight_tickets.findMany({
          select: weightTicketListSelect,
          orderBy,
          skip: (query.page - 1) * query.pageSize,
          take,
          where,
        }),
      prisma.weight_tickets.count({ where }),
    ])

    const usageMap = await getWeightTicketUsageCountsByTicketIds(prisma, rows.map((row) => row.id))
    const mappedRows: WeightTicketMappedRow[] = rows.map((row) => {
      const usage = usageMap.get(row.id.toString()) ?? {
        purchaseCount: 0,
        purchaseDocNos: [],
        salesCount: 0,
        salesDocNos: [],
      }
      return isXlsx
        ? mapWeightTicketRow(row as WeightTicketRow, usage)
        : mapWeightTicketListRow(row as WeightTicketListRow, usage)
    })
    const actorDisplayNames = await resolveWeightTicketActorDisplayNames(mappedRows.flatMap((row) => [row.createdBy, row.updatedBy]))
    const displayMappedRows = mappedRows.map((row) => ({
      ...row,
      createdBy: weightTicketActorDisplayName(row.createdBy, actorDisplayNames),
      updatedBy: row.updatedBy == null ? null : weightTicketActorDisplayName(row.updatedBy, actorDisplayNames),
    }))

    if (isXlsx) {
      return withAuthNoStore(xlsxResponse(await buildWeightTicketWorkbook(displayMappedRows), `weight_tickets_${new Date().toISOString().slice(0, 10)}.xlsx`))
    }

    return withAuthNoStore(NextResponse.json({
      canOpenPurchaseBill: hasPermission(context, 'daily.weight_tickets.open_bill'),
      canOpenSalesBill: hasPermission(context, 'daily.weight_tickets.open_bill'),
      rows: displayMappedRows,
      totalRows,
    }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return withAuthNoStore(authContextErrorResponse(caught))
    if (caught instanceof WeightTicketDataContractError) return withAuthNoStore(apiErrorResponse(caught, 'ข้อมูลประวัติใบรับ-ส่งของไม่ครบ กรุณาแจ้งผู้ดูแลระบบ', caught.status))
    return withAuthNoStore(apiErrorResponse(caught, 'โหลดรายการใบรับ-ส่งของไม่ได้', 500))
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.create')

    const parsedValues = weightTicketFormSchema.parse(await request.json())
    const draftLineIds = new Set(parsedValues.draftLineIds ?? [])
    const unmarkedDraftLot = parsedValues.lines.find((line) => (
      isWeightTicketDraftLotSkeleton(line) && !draftLineIds.has(line.id)
    ))
    if (unmarkedDraftLot) {
      return NextResponse.json({
        code: 'BAD_REQUEST',
        error: 'เต๋าใหม่ต้องกรอกน้ำหนักและแนบรูปภาพก่อนบันทึก',
        fieldErrors: {
          [`lines.${parsedValues.lines.findIndex((line) => line.id === unmarkedDraftLot.id)}.grossWeight`]: ['กรอกน้ำหนักรวม'],
        },
      }, { status: 400 })
    }
    const imageBucket = await resolveWeightTicketImageBucket()
    const values = normalizeWeightTicketImageReferences(parsedValues, imageBucket)
    const imageStorageKeys = await assertWeightTicketImageAssetOwnership({
      authUserId: context.authUser.id,
      bucket: imageBucket,
      record: values,
    })
    const scopedBranchIds = branchScopeIds(context)
    const parsedImpurityIds = values.lines.map((line) => parseInternalBigIntId(line.impurityId))
    const productCodes = [...new Set(values.lines.flatMap((line) => [
      line.productId.trim().toUpperCase(),
      line.impurityProductId?.trim().toUpperCase() ?? '',
    ]).filter(Boolean))]
    const impurityIds = [...new Set(parsedImpurityIds.filter((value): value is bigint => value != null))]

    const [scopedBranches, branch, supplier, customer, products, impurities] = await Promise.all([
      scopedBranchIds === null ? Promise.resolve([]) : findActiveBranchReferencesByCodes(scopedBranchIds),
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

    if (!branch || (scopedBranchIds !== null && !scopedBranches.some((item) => item.id === branch.id))) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน', fieldErrors: { branchId: ['เลือกสาขา'] } }, { status: 400 })
    }
    try {
      await assertWeightTicketPartyForType({ branchId: branch.id, customer, supplier, type: values.type })
    } catch (caught) {
      if (caught instanceof WeightTicketWriteValidationError) {
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
    try {
      assertWeightTicketImpurityRules({ impurityById, parsedImpurityIds, values })
    } catch (caught) {
      if (caught instanceof WeightTicketWriteValidationError) {
        return NextResponse.json({
          code: caught.code,
          error: caught.message,
          fieldErrors: caught.fieldErrors,
        }, { status: caught.status })
      }
      throw caught
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
      productId: line.productId,
    })))

    const createResult = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('weight_tickets.doc_no'))`
      const branchCode = requireWeightTicketBranchDocumentCode(branch.code)
      const docNo = await nextWeightTicketDocNo(tx, values.type, branchCode, documentDate)
      const partySnapshot = weightTicketPartySnapshot({ customer, supplier, type: values.type })
      const createdTicket = await tx.weight_tickets.create({
        data: {
          branch_id: branch.id,
          created_by: actor,
          customer_id: partySnapshot.customerId,
          doc_no: docNo,
          doc_type: values.type,
          document_date: new Date(`${documentDate}T00:00:00.000Z`),
          entered_by: enteredBy,
          container_deduction_weight: totals.containerDeductionWeight,
          gross_weight: totals.grossWeight,
          godown_name: values.godownName,
          image_count: values.vehicleImageNames.length,
          net_weight: totals.netWeight,
          party_name: partySnapshot.partyName,
          remark: values.remark || null,
          status: defaultTicketStatus(values.type),
          supplier_id: partySnapshot.supplierId,
          deduct_weight: totals.deductionWeight,
          updated_by: actor,
          vehicle_image_count: values.vehicleImageNames.length,
          vehicle_image_names: values.vehicleImageNames,
          vehicle_no: values.vehicleNo,
        },
      })
      const warehouseByCode = await resolveWeightTicketWarehousesForWrite(tx, { branchId: branch.id, lines: values.lines, type: values.type })
      const lineRows = buildWeightTicketLineRows(createdTicket.id, values, productByCode, impurityById, warehouseByCode)
      if (values.type === 'WTO' && values.saveScope !== 'header') {
        await validateWeightTicketStockForWrite(tx, { branchId: branch.id, lineRows, type: values.type })
      }
      const createdLines = lineRows.length
        ? await tx.weight_ticket_lines.createManyAndReturn({ data: lineRows })
        : []
      const imageCount = values.vehicleImageNames.length + createdLines.reduce((sum, line) => sum + (line.image_count ?? 0), 0)
      const { summaryRows } = buildWeightTicketProductSummaryRows(createdTicket.id, createdLines)
      const createdSummaries = summaryRows.length
        ? await tx.weight_ticket_product_summaries.createManyAndReturn({
          data: summaryRows.map(({ lineIds: _lineIds, ...data }) => data),
        })
        : []
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
      await tx.weight_tickets.update({
        data: { 
          image_count: imageCount,
        },
        where: { id: createdTicket.id },
      })
      await attachWeightTicketImageAssets(tx, {
        authUserId: context.authUser.id,
        bucket: imageBucket,
        storageKeys: imageStorageKeys,
        ticketId: createdTicket.id,
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

      const lineIdMap = buildWeightTicketLineIdMap(
        values.lines.map((line, index) => ({ clientId: line.id, lineNo: index + 1 })),
        createdLines,
      )
      const ticket = await tx.weight_tickets.findUniqueOrThrow({
        include: weightTicketInclude,
        where: { id: createdTicket.id },
      })
      return { lineIdMap, ticket }
    })

    const created = createResult.ticket
    const usage = await getWeightTicketUsageCounts(prisma, created.id)
    const mapped = mapWeightTicketRow(created, usage)
    const actorDisplayNames = await resolveWeightTicketActorDisplayNames([mapped.createdBy, mapped.updatedBy])
    const displayMapped = {
      ...mapped,
      createdBy: weightTicketActorDisplayName(mapped.createdBy, actorDisplayNames),
      updatedBy: mapped.updatedBy == null ? null : weightTicketActorDisplayName(mapped.updatedBy, actorDisplayNames),
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
    void publishWeightTicketChange({ branchId: mapped.branchId, changeType: 'created', documentNo: mapped.documentNo, updatedAt: mapped.updatedAt })
    return NextResponse.json({
      ...displayMapped,
      lineIdMap: createResult.lineIdMap,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WeightTicketDataContractError) return apiErrorResponse(caught, 'ข้อมูลประวัติใบรับ-ส่งของไม่ครบ กรุณาแจ้งผู้ดูแลระบบ', caught.status)
    if (caught instanceof WtoPendingOutError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: caught.message, fieldErrors: caught.fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'บันทึกใบรับ-ส่งของไม่ได้', 400)
  }
}
