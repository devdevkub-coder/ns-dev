import { NextResponse } from 'next/server'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    // Query logs directly since it may not be in schema.prisma
    const logs = await prisma.$queryRaw`
      SELECT
        l.id,
        l.weight_ticket_id::text as weight_ticket_id,
        l.delivery_channel,
        l.target_id,
        l.status,
        l.error_message,
        l.sent_at,
        l.requested_by,
        l.pdf_url,
        t.doc_no as document_no,
        t.doc_type as ticket_type
      FROM public.weight_ticket_notification_logs l
      LEFT JOIN public.weight_tickets t ON l.weight_ticket_id = t.id
      ORDER BY l.id DESC
      LIMIT 20
    `

    return NextResponse.json({ ok: true, logs })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    // If the table doesn't exist yet, return empty
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : 'ดึงข้อมูลไม่สำเร็จ', logs: [] })
  }
}
