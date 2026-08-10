import { NextRequest, NextResponse } from 'next/server'
import { cleanupWeightTicketImageAssets, drainWeightTicketThumbnailJobs } from '@/lib/server/weight-ticket-thumbnail-jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  return Boolean(cronSecret) && request.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [thumbnail, cleanup] = await Promise.all([
    drainWeightTicketThumbnailJobs(),
    cleanupWeightTicketImageAssets(),
  ])
  return NextResponse.json({ cleanup, ok: true, thumbnail })
}
