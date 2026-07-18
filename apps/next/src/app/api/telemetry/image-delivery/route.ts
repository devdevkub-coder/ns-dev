import { NextResponse } from 'next/server'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext } from '@/lib/server/auth-context'

export const runtime = 'nodejs'

const MAX_DURATION_MS = 10 * 60 * 1000
const MAX_BYTES = 1024 * 1024 * 1024

function boundedMetric(value: unknown, max: number) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(Math.round(value), max))
}

export async function POST(request: Request) {
  try {
    await getCurrentAuthContext()
    const body = await request.json().catch(() => null)
    if (
      body?.assetFamily !== 'weight_ticket_attachment'
      || (body.outcome !== 'loaded' && body.outcome !== 'error')
    ) {
      return NextResponse.json({ code: 'BAD_REQUEST' }, { status: 400 })
    }

    console.info(JSON.stringify({
      assetFamily: body.assetFamily,
      decodedBodySize: boundedMetric(body.decodedBodySize, MAX_BYTES),
      durationMs: boundedMetric(body.durationMs, MAX_DURATION_MS),
      encodedBodySize: boundedMetric(body.encodedBodySize, MAX_BYTES),
      event: 'image_delivery',
      outcome: body.outcome,
      transferSize: boundedMetric(body.transferSize, MAX_BYTES),
    }))
    return new NextResponse(null, { status: 204 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return NextResponse.json({ code: 'TELEMETRY_UNAVAILABLE' }, { status: 204 })
  }
}
