import { NextRequest, NextResponse } from 'next/server'
import { fetchLiveSalesPlanLmeConfig, getSalesPlanLmeConfig, saveSalesPlanLmeConfigByActor } from '@/lib/server/sales-plan-lme'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const currentConfig = await getSalesPlanLmeConfig()
  const nextConfig = await fetchLiveSalesPlanLmeConfig(currentConfig)
  const savedConfig = await saveSalesPlanLmeConfigByActor(nextConfig, 'cron:sales-plan-lme')

  return NextResponse.json({
    lmeConfig: savedConfig,
    ok: true,
  })
}
