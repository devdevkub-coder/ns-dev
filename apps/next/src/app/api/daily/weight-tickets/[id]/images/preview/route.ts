import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { attachWeightTicketImagePreviewUrls, resolveWeightTicketImageBucket } from '@/lib/server/weight-ticket-storage'
import { branchScopeIds } from '@/lib/server/weight-tickets'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const scopedBranchIds = branchScopeIds(auth)
    if (scopedBranchIds !== null && scopedBranchIds.length === 0) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 })
    }

    const ticket = await prisma.weight_tickets.findFirst({
      select: {
        vehicle_image_names: true,
        weight_ticket_lines: {
          select: {
            image_names: true,
            line_no: true,
          },
          orderBy: { line_no: 'asc' },
        },
      },
      where: {
        doc_no: id,
        ...(scopedBranchIds !== null ? { branches: { code: { in: scopedBranchIds } } } : {}),
      },
    })
    if (!ticket) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 })

    const vehicleImageNames = ticket.vehicle_image_names ?? []
    const lines = ticket.weight_ticket_lines.map((line) => ({
      imageNames: line.image_names ?? [],
      lineNo: line.line_no,
    }))
    const signed = await attachWeightTicketImagePreviewUrls({
      imageNames: [...vehicleImageNames, ...lines.flatMap((line) => line.imageNames)],
      lines,
      vehicleImageNames,
    }, await resolveWeightTicketImageBucket())

    return NextResponse.json({
      imageNames: signed.imageNames,
      lines: signed.lines,
      vehicleImageNames: signed.vehicleImageNames,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด preview รูปใบรับ-ส่งของไม่ได้', 500)
  }
}
