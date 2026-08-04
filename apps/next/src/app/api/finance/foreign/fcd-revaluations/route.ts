import { NextResponse } from 'next/server'
import { fcdRevaluationPostSchema, fcdRevaluationReverseSchema } from '@/lib/finance-fcd-actions'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { requireFinanceActor } from '@/lib/server/finance-actor'
import { reverseFcdRevaluation, postFcdRevaluation } from '@/lib/server/fcd-revaluation-posting'
import { getFinanceCurrencyPolicy } from '@/lib/server/finance-currency-policy'
import { FCD_ACTION_PERMISSION } from '@/lib/server/fcd-action-permissions'
import { findFcdRateSnapshot } from '@/lib/server/fcd-rate-snapshot'
import { prisma } from '@/lib/server/prisma'
import { listActiveAccounts } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = (body: unknown, init?: ResponseInit) => NextResponse.json(body, {
  ...init,
  headers: { 'Cache-Control': 'private, no-store', ...init?.headers },
})

function accountLabel(account: { accountNo: string | null; name: string }) {
  return account.accountNo ? `${account.accountNo} - ${account.name}` : account.name
}

function assertBranchAccess(context: Awaited<ReturnType<typeof getCurrentAuthContext>>, branchCode: string) {
  const allowed = getBranchCodeIntersection(context, branchCode)
  if (allowed !== null && allowed.length === 0) throw new AuthContextError('ไม่มีสิทธิ์ใช้งานสาขานี้', 403)
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, FCD_ACTION_PERMISSION.revaluation.view)
    const url = new URL(request.url)
    const requestedCurrency = url.searchParams.get('currencyCode')?.trim().toUpperCase() ?? ''
    const requestedDate = url.searchParams.get('periodEnd')?.trim() ?? ''
    const requestedRateType = url.searchParams.get('rateType')?.trim() ?? ''
    const docNo = url.searchParams.get('docNo')?.trim() ?? ''
    if ((requestedCurrency || requestedDate || requestedRateType) && (!requestedCurrency || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !requestedRateType)) {
      return noStore({ code: 'BAD_REQUEST', error: 'ต้องระบุสกุลเงิน วันสิ้นงวด และประเภท rate ให้ครบ' }, { status: 400 })
    }
    const [policy, accounts, branches, rateTypeRows, batches] = await Promise.all([
      getFinanceCurrencyPolicy(),
      listActiveAccounts(),
      prisma.branches.findMany({ orderBy: { code: 'asc' }, select: { code: true, name: true }, where: { active: true } }),
      prisma.fx_rates.findMany({ distinct: ['rate_type'], orderBy: { rate_type: 'asc' }, select: { rate_type: true }, where: { active: true } }),
      prisma.fcd_revaluation_batches.findMany({
        orderBy: [{ period_end: 'desc' }, { id: 'desc' }],
        take: 500,
        ...(docNo ? { where: { doc_no: docNo } } : {}),
      }),
    ])
    const allowedBranches = getBranchCodeIntersection(context)
    const visibleBranches = branches.filter((branch) => allowedBranches === null || allowedBranches.includes(branch.code))
    const accountCurrencies = accounts
      .filter((account) => account.accountGroup === 'bank' && account.isFcd)
      .flatMap((account) => account.supportedCurrencies
        .filter((currency) => currency !== policy.functionalCurrencyCode)
        .map((currency) => ({ code: account.code, currency, id: `${account.code}|${currency}`, label: `${accountLabel(account)} (${currency})` })))
    const lines = batches.length
      ? await prisma.fcd_revaluation_lines.findMany({ where: { batch_id: { in: batches.map((batch) => batch.id) } } })
      : []
    const linesByBatchId = new Map<string, typeof lines>()
    lines.forEach((line) => {
      const key = line.batch_id.toString()
      linesByBatchId.set(key, [...(linesByBatchId.get(key) ?? []), line])
    })
    const branchCodeById = new Map((await prisma.branches.findMany({ select: { code: true, id: true }, where: { id: { in: batches.flatMap((batch) => batch.branch_id == null ? [] : [batch.branch_id]) } } })).map((branch) => [branch.id.toString(), branch.code]))
    const rateSnapshot = requestedCurrency
      ? await findFcdRateSnapshot(prisma, {
          fromCurrency: requestedCurrency,
          rateDate: requestedDate,
          rateType: requestedRateType,
          toCurrency: policy.functionalCurrencyCode,
        })
      : null
    return noStore({
      filters: {
        accountCurrencies,
        branches: visibleBranches,
        functionalCurrencyCode: policy.functionalCurrencyCode,
        rateTypes: rateTypeRows.map((row) => row.rate_type),
      },
      suggestedRate: rateSnapshot?.kind === 'suggested'
        ? { rate: rateSnapshot.rate, rateId: rateSnapshot.rateId.toString(), source: rateSnapshot.source, status: 'suggested' }
        : rateSnapshot?.kind === 'manual_required' ? { rate: null, rateId: null, source: null, status: 'manual_required' } : null,
      rows: batches.filter((batch) => {
        const branchCode = batch.branch_id == null ? null : branchCodeById.get(batch.branch_id.toString())
        return allowedBranches === null || (branchCode != null && allowedBranches.includes(branchCode))
      }).flatMap((batch) => (linesByBatchId.get(batch.id.toString()) ?? []).map((line) => ({
        branchCode: batch.branch_id == null ? null : branchCodeById.get(batch.branch_id.toString()) ?? null,
        carryingThbBefore: toNumber(line.carrying_thb_before),
        closingFxRate: toNumber(line.closing_fx_rate),
        currencyCode: line.currency_code,
        docNo: batch.doc_no,
        id: `${batch.id}:${line.id}`,
        nativeBalance: toNumber(line.native_balance),
        periodEnd: toDateOnly(line.period_end),
        revaluedThbAmount: toNumber(line.revalued_thb_amount),
        reversalOfId: batch.reversal_of_id?.toString() ?? null,
        status: batch.status,
        unrealizedFxDifference: toNumber(line.unrealized_fx_difference),
      }))),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการตีมูลค่า FCD ไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, FCD_ACTION_PERMISSION.revaluation.post)
    const values = fcdRevaluationPostSchema.parse(await request.json())
    assertBranchAccess(context, values.branchCode)
    const branch = await prisma.branches.findFirst({ select: { id: true }, where: { active: true, code: values.branchCode } })
    if (!branch) return noStore({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือไม่ active' }, { status: 400 })
    const result = await prisma.$transaction((tx) => postFcdRevaluation(tx, {
      ...values,
      actor: requireFinanceActor(context),
      branchId: branch.id,
    }), { isolationLevel: 'Serializable' })
    return noStore({ docNo: result.docNo, unrealizedFxDifference: result.unrealizedFxDifference.toFixed(2) }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกรายการตีมูลค่า FCD ไม่ได้', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, FCD_ACTION_PERMISSION.revaluation.reverse)
    const values = fcdRevaluationReverseSchema.parse(await request.json())
    const original = await prisma.fcd_revaluation_batches.findUnique({ where: { doc_no: values.originalDocNo } })
    if (!original?.branch_id) return noStore({ code: 'NOT_FOUND', error: 'ไม่พบรายการตีมูลค่า FCD' }, { status: 404 })
    const branch = await prisma.branches.findUnique({ select: { code: true }, where: { id: original.branch_id } })
    if (!branch) throw new Error('รายการตีมูลค่า FCD ไม่มีสาขาที่ใช้งานได้')
    assertBranchAccess(context, branch.code)
    const result = await prisma.$transaction((tx) => reverseFcdRevaluation(tx, { ...values, actor: requireFinanceActor(context) }), { isolationLevel: 'Serializable' })
    return noStore({ docNo: result.docNo })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกรายการตีมูลค่า FCD ไม่ได้', 400)
  }
}
