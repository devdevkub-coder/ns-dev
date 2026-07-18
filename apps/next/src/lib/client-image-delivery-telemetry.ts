'use client'

type ImageDeliveryOutcome = 'loaded' | 'error'

type ImageDeliveryTelemetry = {
  assetFamily: 'weight_ticket_attachment'
  decodedBodySize: number | null
  durationMs: number
  encodedBodySize: number | null
  outcome: ImageDeliveryOutcome
  transferSize: number | null
}

function observabilityEnabled() {
  return process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_IMAGE_DELIVERY_OBSERVABILITY === 'true'
}

function resourceTiming(url: string) {
  if (typeof performance === 'undefined') return null
  const entries = performance.getEntriesByName(url)
  const entry = entries.at(-1)
  if (!entry || !('transferSize' in entry)) return null
  const resource = entry as PerformanceResourceTiming
  return {
    decodedBodySize: Number.isFinite(resource.decodedBodySize) ? resource.decodedBodySize : null,
    encodedBodySize: Number.isFinite(resource.encodedBodySize) ? resource.encodedBodySize : null,
    transferSize: Number.isFinite(resource.transferSize) ? resource.transferSize : null,
  }
}

export function recordImageDelivery({
  outcome,
  startedAt,
  url,
}: {
  outcome: ImageDeliveryOutcome
  startedAt: number
  url: string
}) {
  if (!observabilityEnabled() || !url || typeof performance === 'undefined') return

  const timing = resourceTiming(url)
  const payload: ImageDeliveryTelemetry = {
    assetFamily: 'weight_ticket_attachment',
    decodedBodySize: timing?.decodedBodySize ?? null,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    encodedBodySize: timing?.encodedBodySize ?? null,
    outcome,
    transferSize: timing?.transferSize ?? null,
  }

  void fetch('/api/telemetry/image-delivery', {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => undefined)
}
