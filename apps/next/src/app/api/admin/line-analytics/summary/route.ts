import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'system.settings.manage')

    // Today boundaries
    const todayStart = new Date()
    todayStart.setHours(0,0,0,0)
    const todayEnd = new Date()
    todayEnd.setHours(23,59,59,999)

    // Today metrics
    const totalToday = await prisma.line_notification_jobs.count({
      where: { created_at: { gte: todayStart, lte: todayEnd } }
    })
    const sentToday = await prisma.line_notification_jobs.count({
      where: { status: 'sent', created_at: { gte: todayStart, lte: todayEnd } }
    })
    const failedToday = await prisma.line_notification_jobs.count({
      where: { status: 'failed', created_at: { gte: todayStart, lte: todayEnd } }
    })
    const pendingToday = await prisma.line_notification_jobs.count({
      where: { status: 'pending', created_at: { gte: todayStart, lte: todayEnd } }
    })

    // Last 30 Days metrics
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const totalCount = await prisma.line_notification_jobs.count({
      where: { created_at: { gte: thirtyDaysAgo } }
    })
    const sentCount = await prisma.line_notification_jobs.count({
      where: { status: 'sent', created_at: { gte: thirtyDaysAgo } }
    })
    const failedCount = await prisma.line_notification_jobs.count({
      where: { status: 'failed', created_at: { gte: thirtyDaysAgo } }
    })
    const pendingCount = await prisma.line_notification_jobs.count({
      where: { status: 'pending', created_at: { gte: thirtyDaysAgo } }
    })

    // Avg duration
    const avgDurationRow = await prisma.line_notification_attempts.aggregate({
      where: { created_at: { gte: thirtyDaysAgo }, status: 'success' },
      _avg: { duration_ms: true }
    })
    const avgDuration = Math.round(avgDurationRow._avg.duration_ms || 0)

    // Top Targets
    const topTargetsRaw = await prisma.line_notification_jobs.groupBy({
      by: ['target_id'],
      where: { created_at: { gte: thirtyDaysAgo } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    })
    const targetIds = topTargetsRaw.map(t => t.target_id)
    const targets = await prisma.line_targets.findMany({
      where: { target_id: { in: targetIds } }
    })
    const targetMap = new Map(targets.map(t => [t.target_id, t.display_name]))
    const topTargets = topTargetsRaw.map(t => ({
      targetId: t.target_id,
      displayName: targetMap.get(t.target_id) || t.target_id,
      count: t._count.id
    }))

    // Top Errors
    const topErrors = await prisma.line_notification_jobs.groupBy({
      by: ['last_error_message'],
      where: {
        created_at: { gte: thirtyDaysAgo },
        last_error_message: { not: null }
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5
    })

    // Document types distribution
    const docTypes = await prisma.line_notification_jobs.groupBy({
      by: ['document_type'],
      where: { created_at: { gte: thirtyDaysAgo } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } }
    })

    return NextResponse.json({
      today: {
        total: totalToday,
        sent: sentToday,
        failed: failedToday,
        pending: pendingToday,
        successRate: totalToday > 0 ? Math.round((sentToday / totalToday) * 100) : 100
      },
      last30Days: {
        total: totalCount,
        sent: sentCount,
        failed: failedCount,
        pending: pendingCount,
        successRate: totalCount > 0 ? Math.round((sentCount / totalCount) * 100) : 100,
        avgDurationMs: avgDuration
      },
      topTargets,
      topErrors: topErrors.map(e => ({
        message: e.last_error_message,
        count: e._count.id
      })),
      docTypes: docTypes.map(d => ({
        type: d.document_type,
        count: d._count.id
      }))
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลสรุปสถิติส่งไลน์ไม่สำเร็จ', 500)
  }
}
