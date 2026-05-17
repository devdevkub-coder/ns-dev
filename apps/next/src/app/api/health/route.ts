import { NextResponse } from 'next/server'

export function GET() {
  return NextResponse.json({
    ok: true,
    app: 'ns-scrap-erp-next',
    timestamp: new Date().toISOString(),
  })
}
