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
      SELECT id, weight_ticket_id::text as weight_ticket_id, delivery_channel, target_id, status, error_message, sent_at, requested_by
      FROM public.weight_ticket_notification_logs
      ORDER BY id DESC
      LIMIT 20
    `

    return NextResponse.json({ ok: true, logs })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    // If the table doesn't exist yet, return empty
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : 'ดึงข้อมูลไม่สำเร็จ', logs: [] })
  }
}
