import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildCashOthersSummary } from '@/lib/server/cash-others-anomaly'
import { buildFinancialDashboard } from '@/lib/server/finance-accounting-dashboard'

export const runtime = 'nodejs'

const assetLabels: Record<string, string> = {
  '💵 Cash & Bank': 'เงินสดและธนาคาร',
  '📥 ลูกหนี้ (AR)': 'ลูกหนี้การค้า (AR)',
  '📦 Stock': 'สินค้าคงคลัง',
  '🏗 Fixed Asset': 'สินทรัพย์ถาวร',
}

function parseDate(value: string | null) {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'finance.financials.view')
    const { searchParams } = new URL(request.url)
    const asOf = searchParams.get('asOf')
    const branchId = searchParams.get('branchId') || undefined
    const [cashPayload, financialPayload] = await Promise.all([
      buildCashOthersSummary(asOf),
      buildFinancialDashboard({ asOf: parseDate(asOf), branchId }),
    ])
    const debtComp = [
      { color: '#ef4444', name: 'เจ้าหนี้การค้า (AP)', val: financialPayload.summary.ap },
      { color: '#f97316', name: 'เงินกู้ / สัญญาเช่าการเงิน', val: financialPayload.summary.totalLoan },
    ].filter((row) => row.val > 0)

    return NextResponse.json({
      ...cashPayload,
      branches: financialPayload.branches,
      charts: {
        ...cashPayload.charts,
        assetComp: financialPayload.assetComp.map((row) => ({ color: row.color, name: assetLabels[row.name] ?? row.name, val: row.value })),
        debtComp: debtComp.length ? debtComp : cashPayload.charts.debtComp,
      },
      filters: financialPayload.filters,
      sourceState: {
        ...cashPayload.sourceState,
        limitations: [
          'Net Worth / Track Asset เป็น management source จาก Financial Dashboard + Cash & Others legacy surfaces; ยังไม่ใช่ statutory balance sheet หรือ GL close report.',
          ...cashPayload.sourceState.limitations,
        ],
      },
      summary: {
        ...cashPayload.summary,
        ap: financialPayload.summary.ap,
        ar: financialPayload.summary.ar,
        fixedAssetNet: financialPayload.summary.totalNBV,
        inventory: financialPayload.summary.inv,
        netWorth: financialPayload.summary.equity,
        totalAsset: financialPayload.summary.totalAssets,
        totalDebt: financialPayload.summary.totalLiab,
        totalLoan: financialPayload.summary.totalLoan,
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลด Net Worth / Track Asset ไม่ได้', 500)
  }
}
