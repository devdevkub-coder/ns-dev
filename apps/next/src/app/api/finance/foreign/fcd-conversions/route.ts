import { NextResponse } from 'next/server'
import { fcdConversionPostSchema, fcdConversionReverseSchema } from '@/lib/finance-fcd-actions'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getBranchCodeIntersection, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { toDateOnly, toNumber } from '@/lib/server/daily'
import { requireFinanceActor } from '@/lib/server/finance-actor'
import { postFcdConversion, reverseFcdConversion } from '@/lib/server/fcd-conversion-posting'
import { getFinanceCurrencyPolicy } from '@/lib/server/finance-currency-policy'
import { FCD_ACTION_PERMISSION } from '@/lib/server/fcd-action-permissions'
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
    requirePermission(context, FCD_ACTION_PERMISSION.conversion.view)
    const docNo = new URL(request.url).searchParams.get('docNo')?.trim() ?? ''
    const [policy, accounts, branches, rows] = await Promise.all([
      getFinanceCurrencyPolicy(),
      listActiveAccounts(),
      prisma.branches.findMany({ orderBy: { code: 'asc' }, select: { code: true, name: true }, where: { active: true } }),
      prisma.fcd_conversions.findMany({
        orderBy: [{ conversion_date: 'desc' }, { id: 'desc' }],
        take: 500,
        ...(docNo ? { where: { doc_no: docNo } } : {}),
      }),
    ])
    const allowedBranches = getBranchCodeIntersection(context)
    const visibleBranches = branches.filter((branch) => allowedBranches === null || allowedBranches.includes(branch.code))
    const sourceAccounts = accounts
      .filter((account) => account.accountGroup === 'bank' && account.isFcd)
      .flatMap((account) => account.supportedCurrencies
        .filter((currency) => currency !== policy.functionalCurrencyCode)
        .map((currency) => ({
          code: account.code,
          currency,
          id: `${account.code}|${currency}`,
          label: `${accountLabel(account)} (${currency})`,
        })))
    const destinationAccounts = accounts
      .filter((account) => account.accountGroup === 'bank' && !account.isFcd && account.supportedCurrencies.includes(policy.functionalCurrencyCode))
      .map((account) => ({ code: account.code, id: account.code, label: accountLabel(account) }))
    const conversionLines = rows.length
      ? await prisma.fcd_conversion_lines.findMany({ where: { conversion_id: { in: rows.map((row) => row.id) } } })
      : []
    const lineByConversionId = new Map(conversionLines.map((line) => [line.conversion_id.toString(), line]))
    const accountById = new Map(accounts.map((account) => [account.id.toString(), account]))
    const branchCodeById = new Map((await prisma.branches.findMany({ select: { code: true, id: true }, where: { id: { in: rows.map((row) => row.branch_id) } } })).map((branch) => [branch.id.toString(), branch.code]))
    return noStore({
      filters: { branches: visibleBranches, destinationAccounts, functionalCurrencyCode: policy.functionalCurrencyCode, sourceAccounts },
      rows: rows.filter((row) => {
        const branchCode = branchCodeById.get(row.branch_id.toString())
        return allowedBranches === null || (branchCode != null && allowedBranches.includes(branchCode))
      }).map((row) => {
        const line = lineByConversionId.get(row.id.toString())
        const source = accountById.get(row.source_account_id.toString())
        const destination = accountById.get(row.destination_account_id.toString())
        const branchCode = branchCodeById.get(row.branch_id.toString())
        if (!source || !destination || !branchCode) throw new Error('รายการแลกเงิน FCD อ้างอิง master ไม่ครบ')
        return ({
        actualThbReceived: toNumber(row.actual_thb_received),
        bankFeeThb: toNumber(row.bank_fee_thb),
        branchCode,
        conversionDate: toDateOnly(row.conversion_date),
        destinationAccountCode: destination.code,
        docNo: row.doc_no,
        id: row.id.toString(),
        line: line ? {
          carryingThbOut: toNumber(line.carrying_thb_out),
          nativeAmount: toNumber(line.native_amount),
          realizedFxDifference: toNumber(line.realized_fx_difference),
        } : null,
        reversalOfId: row.reversal_of_id?.toString() ?? null,
        sourceAccountCode: source.code,
        sourceCurrencyCode: row.source_currency_code,
        status: row.status,
      })}),
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดรายการแลกเงิน FCD ไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, FCD_ACTION_PERMISSION.conversion.post)
    const values = fcdConversionPostSchema.parse(await request.json())
    assertBranchAccess(context, values.branchCode)
    const branch = await prisma.branches.findFirst({ select: { id: true }, where: { active: true, code: values.branchCode } })
    if (!branch) return noStore({ code: 'BAD_REQUEST', error: 'สาขาไม่ถูกต้องหรือไม่ active' }, { status: 400 })
    const result = await prisma.$transaction((tx) => postFcdConversion(tx, {
      ...values,
      actor: requireFinanceActor(context),
      branchId: branch.id,
    }), { isolationLevel: 'Serializable' })
    return noStore({ docNo: result.docNo, realizedFxDifference: result.realizedFxDifference.toFixed(2) }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกรายการแลกเงิน FCD ไม่ได้', 400)
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, FCD_ACTION_PERMISSION.conversion.reverse)
    const values = fcdConversionReverseSchema.parse(await request.json())
    const original = await prisma.fcd_conversions.findUnique({ where: { doc_no: values.originalDocNo } })
    if (!original) return noStore({ code: 'NOT_FOUND', error: 'ไม่พบรายการแลกเงิน FCD' }, { status: 404 })
    const branch = await prisma.branches.findUnique({ select: { code: true }, where: { id: original.branch_id } })
    if (!branch) throw new Error('รายการแลกเงิน FCD ไม่มีสาขาที่ใช้งานได้')
    assertBranchAccess(context, branch.code)
    const result = await prisma.$transaction((tx) => reverseFcdConversion(tx, { ...values, actor: requireFinanceActor(context) }), { isolationLevel: 'Serializable' })
    return noStore({ docNo: result.docNo })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ยกเลิกรายการแลกเงิน FCD ไม่ได้', 400)
  }
}
