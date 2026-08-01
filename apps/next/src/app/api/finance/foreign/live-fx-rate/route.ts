import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { BUSINESS_TIMEZONE } from '@/lib/server/daily'
import { getFinanceCurrencyPolicy } from '@/lib/server/finance-currency-policy'
import { fetchGoogleFinanceUsdThbQuote } from '@/lib/server/google-finance-usd-thb'
import { FINANCE_DEBT_PAGE_PERMISSIONS } from '@/lib/finance-debt-permissions'

export const runtime = 'nodejs'

const noStoreHeaders = { 'Cache-Control': 'private, no-store' }

function bangkokDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
  const year = part('year')
  const month = part('month')
  const day = part('day')
  if (!year || !month || !day) throw new Error('ไม่สามารถระบุวันที่ปัจจุบันสำหรับอัตราแลกเปลี่ยนได้')
  return `${year}-${month}-${day}`
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, FINANCE_DEBT_PAGE_PERMISSIONS.receipts)
    const url = new URL(request.url)
    const currency = url.searchParams.get('currency')?.trim().toUpperCase() ?? ''
    const rateDate = url.searchParams.get('date')?.trim() ?? ''
    if (!currency || !rateDate) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ระบุสกุลเงินและวันที่รับเงินให้ครบ' }, { headers: noStoreHeaders, status: 400 })
    }

    const policy = await getFinanceCurrencyPolicy()
    if (currency === policy.functionalCurrencyCode) {
      return NextResponse.json({ rate: null, status: 'not_required' }, { headers: noStoreHeaders })
    }
    if (currency !== 'USD' || policy.functionalCurrencyCode !== 'THB') {
      return NextResponse.json({ rate: null, status: 'manual_required' }, { headers: noStoreHeaders })
    }
    if (rateDate !== bangkokDate()) {
      return NextResponse.json({ rate: null, status: 'manual_required' }, { headers: noStoreHeaders })
    }

    try {
      const quote = await fetchGoogleFinanceUsdThbQuote()
      return NextResponse.json({ ...quote, status: 'suggested' }, { headers: noStoreHeaders })
    } catch {
      return NextResponse.json({ rate: null, source: 'Google Finance', status: 'manual_required' }, { headers: noStoreHeaders })
    }
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดอัตราแลกเปลี่ยนไม่ได้', 500)
  }
}
