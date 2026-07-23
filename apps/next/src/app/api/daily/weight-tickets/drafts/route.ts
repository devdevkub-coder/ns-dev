import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { recordAuditLog } from '@/lib/server/app-logging'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { findActiveBranchReferencesByCodes } from '@/lib/server/branch-reference'
import { findActiveSupplierReferenceByCodeOrId } from '@/lib/server/supplier-reference'
import { prisma } from '@/lib/server/prisma'
import { assertWeightTicketPartyForType, WeightTicketWriteValidationError } from '@/lib/server/weight-ticket-write/type-guards'
import { weightTicketPartySnapshot } from '@/lib/server/weight-ticket-write/handlers'
import { appendWeightTicketStatusLog, WEIGHT_TICKET_STATUS_ACTION } from '@/lib/server/weight-ticket-status-history'
import {
  bangkokDateInput,
  branchScopeIds,
  buildWeightTicketProductSummaryRows,
  defaultTicketStatus,
  enteredByLabel,
  getWeightTicketUsageCounts,
  mapWeightTicketRow,
  nextWeightTicketDocNo,
  requireWeightTicketBranchDocumentCode,
  weightTicketInclude,
  weightTicketAuditSnapshot,
} from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

const draftSchema = z.object({
  branchId: z.string().trim().min(1),
  godownName: z.string().trim().min(1),
  partyId: z.string().trim().min(1),
  productId: z.string().trim().min(1),
  remark: z.string().trim().max(160).default(''),
  vehicleImageNames: z.array(z.string().trim().min(1).max(4_000_000)).max(20).default([]),
  vehicleNo: z.string().trim().min(2),
})

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'daily.weight_tickets.create')
    const values = draftSchema.parse(await request.json())
    const scopedBranchIds = branchScopeIds(context)
    const [scopedBranches, branch, supplier, product] = await Promise.all([
      findActiveBranchReferencesByCodes(scopedBranchIds),
      prisma.branches.findFirst({
        select: { code: true, id: true, name: true },
        where: { active: true, code: values.branchId.toUpperCase() },
      }),
      findActiveSupplierReferenceByCodeOrId(values.partyId),
      prisma.products.findFirst({
        select: { code: true, id: true, name: true },
      where: { active: true, code: values.productId.toUpperCase() },
      }),
    ])
    if (!branch || (scopedBranchIds.length && !scopedBranches.some((item) => item.id === branch.id))) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน' }, { status: 400 })
    }
    if (!product) return NextResponse.json({ code: 'BAD_REQUEST', error: 'สินค้าไม่ถูกต้องหรือถูกปิดใช้งาน' }, { status: 400 })
    try {
      await assertWeightTicketPartyForType({ branchId: branch.id, customer: null, supplier, type: 'WTI' })
    } catch (caught) {
      if (caught instanceof WeightTicketWriteValidationError) {
        return NextResponse.json({ code: caught.code, error: caught.message, fieldErrors: { partyId: [caught.message] } }, { status: caught.status })
      }
      throw caught
    }

    const actor = currentActor(context)
    const enteredBy = enteredByLabel(context)
    const documentDate = bangkokDateInput(new Date())
    const created = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('weight_tickets.doc_no'))`
      const docNo = await nextWeightTicketDocNo(tx, 'WTI', requireWeightTicketBranchDocumentCode(branch.code), documentDate)
      const ticket = await tx.weight_tickets.create({
        data: {
          branch_id: branch.id,
          container_deduction_weight: 0,
          created_by: actor,
          doc_no: docNo,
          doc_type: 'WTI',
          document_date: new Date(`${documentDate}T00:00:00.000Z`),
          entered_by: enteredBy,
          gross_weight: 0,
          godown_name: values.godownName,
          image_count: values.vehicleImageNames.length,
          net_weight: 0,
          party_name: weightTicketPartySnapshot({ customer: null, supplier, type: 'WTI' }).partyName,
          remark: values.remark || null,
          status: defaultTicketStatus('WTI'),
          supplier_id: supplier?.id ?? null,
          deduct_weight: 0,
          updated_by: actor,
          vehicle_image_count: values.vehicleImageNames.length,
          vehicle_image_names: values.vehicleImageNames,
          vehicle_no: values.vehicleNo,
        },
      })
      const line = await tx.weight_ticket_lines.create({
        data: {
          container_deduction_weight: 0,
          deduction_mode: 'none',
          deduction_value: 0,
          deduct_weight: 0,
          gross_weight: 0,
          image_count: 0,
          image_names: [],
          impurity_id: null,
          impurity_name: null,
          line_no: 1,
          net_weight: 0,
          note: null,
          product_id: product.id,
          product_name: product.name,
          weight_ticket_id: ticket.id,
        },
      })
      const { summaryRows } = buildWeightTicketProductSummaryRows(ticket.id, [line])
      const summaries = await Promise.all(summaryRows.map(({ lineIds: _lineIds, ...data }) => tx.weight_ticket_product_summaries.create({ data })))
      const summaryId = summaries[0]?.id
      if (summaryId != null) {
        await tx.weight_ticket_product_summary_lines.createMany({ data: [{ created_at: new Date(), summary_id: summaryId, weight_ticket_line_id: line.id }] })
      }
      await appendWeightTicketStatusLog(tx, {
        action: WEIGHT_TICKET_STATUS_ACTION.CREATED,
        actor,
        meta: { reason: 'weight_ticket_wti_draft_create', type: 'WTI' },
        toStatus: 'draft',
        weightTicketId: ticket.id,
      })
      return tx.weight_tickets.findUniqueOrThrow({ include: weightTicketInclude, where: { id: ticket.id } })
    })

    const usage = await getWeightTicketUsageCounts(prisma, created.id)
    const mapped = mapWeightTicketRow(created, usage)
    await recordAuditLog({
      action: 'create',
      afterData: weightTicketAuditSnapshot(mapped),
      context,
      entityId: String(created.id),
      entityLabel: created.doc_no,
      entitySchema: 'public',
      entityTable: 'weight_tickets',
      eventKey: 'daily.weight-ticket.draft-created',
      metadata: { documentNo: created.doc_no, type: 'WTI' },
      request,
      targetId: String(created.id),
      targetLabel: created.doc_no,
      targetType: 'weight_ticket',
    })
    return NextResponse.json(mapped)
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof z.ZodError) return NextResponse.json({ code: 'BAD_REQUEST', error: 'ข้อมูล draft ไม่ครบ', fieldErrors: caught.flatten().fieldErrors }, { status: 400 })
    return apiErrorResponse(caught, 'สร้าง draft ใบรับของไม่ได้', 400)
  }
}
