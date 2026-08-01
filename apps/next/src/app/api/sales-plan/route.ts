import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildSalesPlan } from '@/lib/server/main-sales-control'
import { clearPendingSalesPlans, createSalesPlan, getSalesPlanRow, lockSalesPlan } from '@/lib/server/sales-plans'
import { fetchLiveSalesPlanLmeConfig, getSalesPlanLmeConfig, saveSalesPlanLmeConfig } from '../../../lib/server/sales-plan-lme'
import { REPORT_PAGE_PERMISSIONS } from '@/lib/report-permissions'
import { getFinanceBranchCodeIntersection } from '@/lib/server/finance-accounting-branch-scope'
import { listActiveBranches, listActiveBranchesByCodes } from '@/lib/server/reference-master-cache'

export const runtime = 'nodejs'

const salesPlanLmeRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('fetch-live') }),
  z.object({
    action: z.literal('create-plan'),
    plan: z.object({
      branchCode: z.string().trim().min(1, 'เลือกสาขา'),
      containers: z.coerce.number().finite().gt(0, 'จำนวนตู้ต้องมากกว่า 0'),
      customerCode: z.string().trim().min(1, 'เลือกลูกค้า').max(80),
      kgPerContainer: z.coerce.number().finite().gt(0, 'กก./ตู้ ต้องมากกว่า 0'),
      lmeCf: z.coerce.number().finite().gt(0, 'LME cf ต้องมากกว่า 0'),
      planMonth: z.string().trim().regex(/^\d{4}-\d{2}$/, 'เดือนต้องเป็นรูปแบบ YYYY-MM'),
      productCode: z.string().trim().min(1, 'เลือกสินค้า').max(80),
      sellPctLme: z.coerce.number().finite().gt(0, '% LME ต้องมากกว่า 0'),
    }),
  }),
  z.object({
    action: z.literal('lock-plan'),
    planId: z.string().trim().regex(/^\d+$/, 'แผนขายไม่ถูกต้อง'),
  }),
  z.object({
    action: z.literal('clear-pending-plans'),
    planIds: z.array(z.string().trim().regex(/^\d+$/, 'แผนขายไม่ถูกต้อง')).optional(),
    filters: z.object({
      month: z.string().trim().regex(/^\d{4}-\d{2}$/, 'เดือนต้องเป็นรูปแบบ YYYY-MM'),
      metalGroup: z.string().trim().max(80).optional(),
      channel: z.string().trim().max(80).optional(),
      productCode: z.string().trim().max(80).optional(),
    }).optional(),
  }),
  z.object({
    action: z.literal('save-config'),
    config: z.object({
      fxRate: z.coerce.number().finite().gt(0, 'USD/THB ต้องมากกว่า 0'),
      kgPerContainer: z.coerce.number().finite().gt(0, 'กก./ตู้ ต้องมากกว่า 0'),
      lmeAluminumUSD: z.coerce.number().finite().min(0),
      lmeBrassUSD: z.coerce.number().finite().min(0),
      lmeCopperUSD: z.coerce.number().finite().min(0),
      liveFetchNote: z.string().trim().max(500).default(''),
      source: z.enum(['default', 'live', 'manual', 'mixed']).default('manual'),
    }),
  }),
])

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, REPORT_PAGE_PERMISSIONS.salesPlan)
    const { searchParams } = new URL(request.url)
    const planId = searchParams.get('planId')
    const month = searchParams.get('month')?.trim() ?? ''
    const requestedBranchCode = searchParams.get('branchCode')?.trim().toUpperCase() || null
    const allowedBranchCodes = getFinanceBranchCodeIntersection(context, requestedBranchCode)
    const branches = allowedBranchCodes === null
      ? await listActiveBranches()
      : allowedBranchCodes.length > 0
        ? await listActiveBranchesByCodes(allowedBranchCodes)
        : []
    if (planId) {
      if (!/^\d+$/.test(planId)) return NextResponse.json({ code: 'BAD_REQUEST', error: 'แผนขายไม่ถูกต้อง' }, { status: 400 })
      const planRow = await getSalesPlanRow(BigInt(planId))
      if (!planRow) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบแผนขาย' }, { status: 404 })
      return NextResponse.json({ planRow })
    }
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'เดือนต้องเป็นรูปแบบ YYYY-MM' }, { status: 400 })
    }
    const payload = await buildSalesPlan(month || undefined, requestedBranchCode ?? undefined)
    return NextResponse.json({ ...payload, filters: { ...payload.filters, branches: branches.map((branch) => ({ code: branch.code, id: branch.code, name: branch.name })) } })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดแผนการขายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, REPORT_PAGE_PERMISSIONS.salesPlan)

    const payload = salesPlanLmeRequestSchema.parse(await request.json())
    if (payload.action === 'fetch-live') {
      const currentConfig = await getSalesPlanLmeConfig()
      const liveConfig = await fetchLiveSalesPlanLmeConfig(currentConfig)
      return NextResponse.json({
        lmeConfig: {
          ...liveConfig,
          source: 'mixed',
        },
      })
    }
    if (payload.action === 'create-plan') {
      const allowedBranchCodes = getFinanceBranchCodeIntersection(context, payload.plan.branchCode)
      const branches = allowedBranchCodes === null
        ? await listActiveBranches()
        : allowedBranchCodes.length > 0
          ? await listActiveBranchesByCodes(allowedBranchCodes)
          : []
      if (!branches.some((branch) => branch.code === payload.plan.branchCode.trim().toUpperCase())) {
        throw new Error('สาขาไม่ถูกต้องหรือไม่มีสิทธิ์ใช้งาน')
      }
      const currentConfig = await getSalesPlanLmeConfig()
      const planRow = await createSalesPlan({ ...payload.plan, branchCode: payload.plan.branchCode.trim().toUpperCase() }, context, currentConfig.fxRate)
      return NextResponse.json({ planRow }, { status: 201 })
    }
    if (payload.action === 'lock-plan') {
      const planRow = await lockSalesPlan(payload.planId, context)
      return NextResponse.json({ planRow })
    }
    if (payload.action === 'clear-pending-plans') {
      const result = await clearPendingSalesPlans(context, payload.planIds, payload.filters)
      return NextResponse.json(result)
    }

    const lmeConfig = await saveSalesPlanLmeConfig(payload.config, context)
    return NextResponse.json({ lmeConfig })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึก Sales Plan ไม่ได้', 500)
  }
}
