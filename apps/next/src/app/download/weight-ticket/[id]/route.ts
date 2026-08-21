import { NextResponse } from 'next/server'
import { canPrintWeightTicket } from '@/lib/weight-tickets'
import { apiErrorResponse } from '@/lib/server/api-error'
import { generateWeightTicketPdfBuffer } from '@/lib/server/pdf/weight-ticket-pdf'
import { prisma } from '@/lib/server/prisma'
import { findScopedWeightTicket, getWeightTicketUsageCounts, mapWeightTicketRow, type WeightTicketRow } from '@/lib/server/weight-tickets'
import { attachWeightTicketImagePrintUrls, resolveWeightTicketImageBucket, WeightTicketPrintReadinessError } from '@/lib/server/weight-ticket-storage'
import { loadWeightTicketCompanyPrintProfile } from '@/lib/server/weight-ticket-pdf-profile'
import { drainWeightTicketImageJobs } from '@/lib/server/weight-ticket-thumbnail-jobs'

export const runtime = 'nodejs'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const ticket = await findScopedWeightTicket(id, null)
    if (!ticket) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 })

    const usage = await getWeightTicketUsageCounts(prisma, ticket.id)
    const mapped = mapWeightTicketRow(ticket as WeightTicketRow, usage)
    if (!canPrintWeightTicket(mapped.status)) {
      return NextResponse.json({ code: 'NOT_PRINTABLE', error: 'เอกสารสถานะนี้ไม่สามารถสร้าง PDF ได้' }, { status: 409 })
    }
    const profile = await loadWeightTicketCompanyPrintProfile(mapped.branchId)
    if (!profile) return NextResponse.json({ code: 'PRINT_PROFILE_NOT_READY', error: 'ยังไม่มีข้อมูลบริษัทสำหรับสร้าง PDF' }, { status: 503 })
    const imageBucket = await resolveWeightTicketImageBucket()
    await drainWeightTicketImageJobs({ attachedTicketId: ticket.id, bucket: imageBucket })
    const printableTicket = await attachWeightTicketImagePrintUrls(mapped, imageBucket)
    const pdfBuffer = await generateWeightTicketPdfBuffer(printableTicket, profile)
    const filename = `${mapped.documentNo.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`
    return new Response(new Uint8Array(pdfBuffer), {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/pdf',
      },
    })
  } catch (caught) {
    if (caught instanceof WeightTicketPrintReadinessError) return NextResponse.json({ code: caught.code, error: caught.message }, { status: caught.status })
    return apiErrorResponse(caught, 'ดาวน์โหลด PDF ใบรับ-ส่งของไม่ได้', 500)
  }
}
