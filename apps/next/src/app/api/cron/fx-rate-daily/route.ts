import { NextRequest, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { toBangkokDateOnly } from '@/lib/server/daily'
import { fetchGoogleFinanceUsdThbQuote } from '@/lib/server/google-finance-usd-thb'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAuthorized(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  return request.headers.get('authorization') === `Bearer ${cronSecret}`
}

/**
 * BUG #18: อัปเดตอัตราแลกเปลี่ยน USD -> THB ทุกวันจาก Google Finance (สด)
 * - เขียนเฉพาะวันที่ยังไม่มี rate (กันทับค่าที่ user แก้มือวันนั้น)
 * - ใช้ได้เฉพาะ USD (ตามนโยบาย: ใช้แค่ค่า USD)
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const today = toBangkokDateOnly(new Date())
    const existing = await prisma.fx_rates.findFirst({
      where: {
        from_currency: { equals: 'USD', mode: 'insensitive' },
        rate_date: new Date(today),
        rate_type: { equals: 'BOT Rate', mode: 'insensitive' },
        to_currency: { equals: 'THB', mode: 'insensitive' },
      },
      select: { id: true, rate: true, source: true },
    })
    if (existing) {
      // มี rate ของวันนี้แล้ว (แก้มือหรือ cron รอบก่อน) — ไม่ทับ
      return NextResponse.json({
        ok: true,
        rate: String(existing.rate),
        skipped: 'already_exists',
        source: existing.source,
      })
    }

    const quote = await fetchGoogleFinanceUsdThbQuote()
    const rate = Math.round(quote.rate * 1000) / 1000
    const actor = 'cron:fx-rate-daily'

    await prisma.$transaction([
      prisma.fx_rates.create({
        data: {
          active: true,
          created_by: actor,
          from_currency: 'USD',
          note: `อัตโนมัติจาก ${quote.source} (${quote.quotedAt ?? 'สด'})`,
          rate,
          rate_date: new Date(today),
          rate_type: 'BOT Rate',
          source: 'Google Finance (อัตโนมัติ)',
          to_currency: 'THB',
          updated_by: actor,
        },
      }),
      prisma.currencies.updateMany({
        where: { code: { equals: 'USD', mode: 'insensitive' } },
        data: { rate_to_thb: rate },
      }),
    ])

    return NextResponse.json({
      created: true,
      ok: true,
      quotedAt: quote.quotedAt,
      rate,
      rateDate: today,
      source: quote.source,
    })
  } catch (caught) {
    return apiErrorResponse(caught, 'อัปเดต FX Rate รายวันไม่ได้', 500)
  }
}
