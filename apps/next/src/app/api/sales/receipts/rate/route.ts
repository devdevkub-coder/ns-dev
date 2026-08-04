import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { FINANCE_DEBT_PAGE_PERMISSIONS } from '@/lib/finance-debt-permissions'
import { getFinanceCurrencyPolicy } from '@/lib/server/finance-currency-policy'
import { findFcdRateSnapshot } from '@/lib/server/fcd-rate-snapshot'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, FINANCE_DEBT_PAGE_PERMISSIONS.receipts)
    const url = new URL(request.url)
    const fromCurrency = url.searchParams.get('currency')?.trim().toUpperCase() ?? ''
    const rateDate = url.searchParams.get('date')?.trim() ?? ''
    const rateType = url.searchParams.get('rateType')?.trim() ?? ''
    if (!fromCurrency || !rateDate || !rateType) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ระบุสกุลเงิน วันที่ และประเภทอัตราแลกเปลี่ยนให้ครบ' }, { status: 400 })
    }

    const policy = await getFinanceCurrencyPolicy()
    if (fromCurrency === policy.functionalCurrencyCode) {
      return NextResponse.json({ rate: null, status: 'not_required' })
    }
    const snapshot = await findFcdRateSnapshot(prisma, {
      fromCurrency,
      rateDate,
      rateType,
      toCurrency: policy.functionalCurrencyCode,
    })
    return NextResponse.json(snapshot.kind === 'suggested'
      ? { rate: snapshot.rate, rateId: snapshot.rateId.toString(), source: snapshot.source, status: 'suggested' }
      : { rate: null, status: 'manual_required' })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดอัตราแลกเปลี่ยนไม่ได้', 500)
  }
}
