import { NextRequest, NextResponse } from 'next/server'
import type { AppAuthContext } from '@/lib/server/auth-context'
import { AuthContextError, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { ProfitCostQueryValidationError, parseProfitCostFilter, parseProfitCostTableQuery } from '@/lib/server/profit-cost-report-contract'
import type { ProfitCostReaderFilter } from '@/lib/server/profit-cost-report-reader'
import { prisma } from '@/lib/server/prisma'
import { REPORT_PAGE_PERMISSIONS } from '@/lib/report-permissions'

export async function authorizeProfitCostRequest(request: NextRequest) {
  const startedAt = performance.now()
  const context = await getCurrentAuthContext()
  requirePermission(context, REPORT_PAGE_PERMISSIONS.profitCostAnalysis)
  return { context, request, startedAt }
}

export async function allowedProfitCostBranchIds(context: AppAuthContext) {
  if (context.isAdmin || context.roles.some((role) => role.branchScope === 'all')) return null
  const codes = [...new Set(context.appUser?.branchIds.map((code) => code.trim().toUpperCase()).filter(Boolean) ?? [])]
  if (!codes.length) return []
  const branches = await prisma.branches.findMany({ select: { id: true }, where: { code: { in: codes } } })
  return branches.map((branch) => branch.id)
}

export async function scopedProfitCostFilter(request: NextRequest, context: AppAuthContext): Promise<ProfitCostReaderFilter> {
  const filter = parseProfitCostFilter(request.nextUrl.searchParams)
  const allowed = await allowedProfitCostBranchIds(context)
  if (filter.branchId != null && allowed !== null && !allowed.some((id) => id === filter.branchId)) {
    throw new AuthContextError('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่เลือก', 403)
  }
  return { ...filter, allowedBranchIds: allowed }
}

export async function scopedProfitCostTableQuery<const T extends readonly [string, ...string[]]>(
  request: NextRequest,
  context: AppAuthContext,
  sortFields: T,
) {
  const query = parseProfitCostTableQuery(request.nextUrl.searchParams, sortFields)
  const allowed = await allowedProfitCostBranchIds(context)
  if (query.branchId != null && allowed !== null && !allowed.some((id) => id === query.branchId)) {
    throw new AuthContextError('ไม่มีสิทธิ์ดูข้อมูลของสาขาที่เลือก', 403)
  }
  return { ...query, allowedBranchIds: allowed }
}

export function profitCostJson(payload: unknown, startedAt: number) {
  return NextResponse.json(payload, { headers: {
    'Cache-Control': 'private, no-store',
    'Server-Timing': `total;dur=${Math.round(performance.now() - startedAt)}`,
  } })
}

export function profitCostRouteError(caught: unknown) {
  const headers = { 'Cache-Control': 'private, no-store' }
  if (caught instanceof AuthContextError) return NextResponse.json({ error: caught.message }, { headers, status: caught.status })
  if (caught instanceof ProfitCostQueryValidationError) {
    return NextResponse.json({ error: caught.message, field: caught.field }, { headers, status: 400 })
  }
  console.error('Profit & Cost Analysis route failed', caught)
  return NextResponse.json({ error: 'โหลด Profit & Cost Analysis ไม่ได้' }, { headers, status: 500 })
}
