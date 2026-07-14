import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { buildSalesPlan } from '@/lib/server/main-sales-control'
import { clearPendingSalesPlans, createSalesPlan, getSalesPlanRow, lockSalesPlan } from '@/lib/server/sales-plans'
import { fetchLiveSalesPlanLmeConfig, getSalesPlanLmeConfig, saveSalesPlanLmeConfig } from '../../../lib/server/sales-plan-lme'

export const runtime = 'nodejs'

const salesPlanLmeRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('fetch-live') }),
  z.object({
    action: z.literal('create-plan'),
    plan: z.object({
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
      fxRate: z.coerce.number().finite().min(0),
      kgPerContainer: z.coerce.number().finite().min(0),
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
    requirePermission(context, 'reports.reports.view')
    const { searchParams } = new URL(request.url)
    const planId = searchParams.get('planId')
    if (planId) {
      if (!/^\d+$/.test(planId)) return NextResponse.json({ code: 'BAD_REQUEST', error: 'แผนขายไม่ถูกต้อง' }, { status: 400 })
      const planRow = await getSalesPlanRow(BigInt(planId))
      if (!planRow) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบแผนขาย' }, { status: 404 })
      return NextResponse.json({ planRow })
    }
    return NextResponse.json(await buildSalesPlan())
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดแผนการขายไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'reports.reports.view')

    const payload = salesPlanLmeRequestSchema.parse(await request.json())
    if (payload.action === 'fetch-live') {
      const currentConfig = await getSalesPlanLmeConfig()
      const liveConfig = await fetchLiveSalesPlanLmeConfig(currentConfig)
      const savedConfig = await saveSalesPlanLmeConfig({
        ...liveConfig,
        source: 'mixed',
      }, context)
      return NextResponse.json({
        lmeConfig: savedConfig,
      })
    }
    if (payload.action === 'create-plan') {
      const currentConfig = await getSalesPlanLmeConfig()
      const planRow = await createSalesPlan(payload.plan, context, currentConfig.fxRate)
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
