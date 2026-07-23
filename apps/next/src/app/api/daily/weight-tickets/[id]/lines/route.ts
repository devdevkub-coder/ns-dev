import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { branchScopeIds, getWeightTicketUsageCounts, mapWeightTicketRow, type WeightTicketRow, weightTicketInclude } from '@/lib/server/weight-tickets'
import { getWtiDraftRow, applyWtiDraftLineOperation, WtiDraftOperationError, type WtiDraftLineInput } from '@/lib/server/weight-ticket-write/wti-draft'
import { broadcastWtiDraftOperation } from '@/lib/server/weight-ticket-realtime'
import type { DeductionMode } from '@/lib/weight-tickets'

export const runtime = 'nodejs'

const lineSchema = z.object({
  containerDeductionWeight: z.coerce.number().finite().min(0).default(0),
  deductionMode: z.enum(['none', 'kg', 'percent']),
  deductionValue: z.coerce.number().finite().min(0).default(0),
  grossWeight: z.coerce.number().finite().min(0),
  imageNames: z.array(z.string().trim().min(1).max(4_000_000)).max(20).default([]),
  impurityId: z.string().trim().max(80).default(''),
  impurityProductId: z.string().trim().max(80).optional(),
  impuritySourceLineId: z.string().trim().max(120).nullable().optional(),
  note: z.string().trim().max(160).default(''),
  parentId: z.string().trim().max(120).nullable().optional(),
  productId: z.string().trim().min(1).max(80),
})

const operationSchema = z.object({
  action: z.enum(['add', 'update', 'delete']),
  expectedLineVersion: z.number().int().nonnegative().nullable().optional(),
  line: lineSchema.optional(),
  lineId: z.string().trim().max(120).nullable().optional(),
  operationId: z.string().trim().min(1).max(120),
})

async function findTicket(documentNo: string, scopedBranchIds: string[]) {
  return prisma.weight_tickets.findFirst({
    include: weightTicketInclude,
    where: {
      doc_no: documentNo,
      doc_type: 'WTI',
      ...(scopedBranchIds.length ? { branches: { code: { in: scopedBranchIds } } } : {}),
    },
  })
}

async function resolveLineId(ticketId: bigint, reference: string | null | undefined) {
  if (!reference) return null
  if (/^\d+$/.test(reference)) return BigInt(reference)
  const lineNo = Number(reference.slice(reference.lastIndexOf(':') + 1))
  if (!Number.isInteger(lineNo) || lineNo <= 0) return null
  const line = await prisma.weight_ticket_lines.findFirst({
    select: { id: true },
    where: { line_no: lineNo, weight_ticket_id: ticketId },
  })
  return line?.id ?? null
}

function toLineInput(value: z.infer<typeof lineSchema>, references: { parentId: bigint | null; impuritySourceLineId: bigint | null }): WtiDraftLineInput {
  return {
    containerDeductionWeight: value.containerDeductionWeight,
    deductionMode: value.deductionMode as DeductionMode,
    deductionValue: value.deductionValue,
    grossWeight: value.grossWeight,
    imageNames: value.imageNames,
    impurityId: value.impurityId,
    impurityProductId: value.impurityProductId,
    impuritySourceLineId: references.impuritySourceLineId == null ? null : String(references.impuritySourceLineId),
    note: value.note,
    parentId: references.parentId == null ? null : String(references.parentId),
    productId: value.productId,
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.update')
    const { id } = await context.params
    const ticket = await findTicket(id, branchScopeIds(auth))
    if (!ticket) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับของ WTI' }, { status: 404 })

    const parsed = operationSchema.parse(await request.json())
    const lineId = await resolveLineId(ticket.id, parsed.lineId)
    if (parsed.action !== 'add' && lineId == null) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบรายการที่ต้องการแก้ไข' }, { status: 400 })
    }
    const parentId = await resolveLineId(ticket.id, parsed.line?.parentId)
    const impuritySourceLineId = await resolveLineId(ticket.id, parsed.line?.impuritySourceLineId)
    if (parsed.line?.parentId && parentId == null) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบรายการหลักที่อ้างถึง' }, { status: 400 })
    }
    if (parsed.line?.impuritySourceLineId && impuritySourceLineId == null) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ไม่พบรายการสิ่งเจือปนต้นทาง' }, { status: 400 })
    }

    const operation = await prisma.$transaction((tx) => applyWtiDraftLineOperation(
      tx,
      {
        action: parsed.action,
        actor: currentActor(auth),
        documentId: ticket.id,
        expectedLineVersion: parsed.expectedLineVersion,
        lineId,
        operationId: parsed.operationId,
      },
      parsed.line ? toLineInput(parsed.line, { impuritySourceLineId, parentId }) : undefined,
    ))

    const row = await getWtiDraftRow(prisma, ticket.id)
    if (!row) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับของ WTI หลังบันทึก' }, { status: 404 })
    const usage = await getWeightTicketUsageCounts(prisma, ticket.id)
    void broadcastWtiDraftOperation({
      action: operation.action,
      actor: currentActor(auth),
      changedLineId: operation.changedLineId,
      documentNo: ticket.doc_no,
      documentVersion: operation.documentVersion,
      operationId: operation.operationId,
    })
    return NextResponse.json({ ...mapWeightTicketRow(row as WeightTicketRow, usage), operation })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    if (caught instanceof WtiDraftOperationError) {
      return NextResponse.json({ code: caught.code, error: caught.message, latest: caught.latest }, { status: caught.status })
    }
    if (caught instanceof z.ZodError) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ข้อมูลรายการไม่ถูกต้อง', fieldErrors: caught.flatten().fieldErrors }, { status: 400 })
    }
    return apiErrorResponse(caught, 'บันทึกรายการ WTI ไม่ได้', 500)
  }
}
