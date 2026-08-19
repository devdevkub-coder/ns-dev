import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requireAnyPermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const getSchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)')
})

const postSchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'),
  evaluations: z.array(z.object({
    warehouse_id: z.number(),
    warehouse_code: z.string(),
    warehouse_name: z.string(),
    accuracy: z.number().min(1).max(5),
    speed: z.number().min(1).max(5),
    target_hit: z.number().min(1).max(5),
    problems: z.string().optional(),
    solutions: z.string().optional(),
    evaluated_by: z.string()
  }))
})

export async function GET(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requireAnyPermission(auth, [
      'system.manage',
      'system.settings.view',
      'daily.weight_tickets.view',
      'daily.weight_tickets.edit',
      'daily.weight_tickets.share',
      'production.view',
      'production.manage',
    ])

    const url = new URL(request.url)
    const dateParam = url.searchParams.get('date') || ''

    if (!dateParam) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 })
    }

    const { date } = getSchema.parse({ date: dateParam })
    const targetDate = new Date(`${date}T00:00:00.000Z`)

    const [evaluations, warehouses] = await Promise.all([
      prisma.warehouse_kpi_evaluations.findMany({
        where: { eval_date: targetDate },
        select: {
          id: true,
          warehouse_id: true,
          warehouse_code: true,
          warehouse_name: true,
          accuracy: true,
          speed: true,
          target_hit: true,
          avg_score: true,
          problems: true,
          solutions: true,
          evaluated_by: true,
        },
      }),
      prisma.warehouses.findMany({
        where: { active: true },
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
        },
        orderBy: { code: 'asc' }
      })
    ])

    const safeEvaluations = evaluations.map((e) => ({
      id: Number(e.id),
      warehouse_id: Number(e.warehouse_id),
      warehouse_code: e.warehouse_code,
      warehouse_name: e.warehouse_name,
      accuracy: e.accuracy,
      speed: e.speed,
      target_hit: e.target_hit,
      avg_score: Number(e.avg_score),
      problems: e.problems || '',
      solutions: e.solutions || '',
      evaluated_by: e.evaluated_by || '',
    }))

    const safeWarehouses = warehouses.map((w) => ({
      id: Number(w.id),
      code: w.code,
      name: w.name,
      active: w.active ?? true,
    }))

    return NextResponse.json({ evaluations: safeEvaluations, warehouses: safeWarehouses })
  } catch (caught) {
    console.error('[API /api/warehouse-kpi GET ERROR]:', caught)
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ดึงข้อมูลไม่สำเร็จ', 500)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    requireAnyPermission(auth, [
      'system.manage',
      'system.settings.view',
      'daily.weight_tickets.edit',
      'daily.weight_tickets.share',
      'production.manage',
      'production.view',
    ])

    const body = postSchema.parse(await request.json().catch(() => ({})))
    const targetDate = new Date(`${body.date}T00:00:00.000Z`)

    const ops = body.evaluations.map(evalData => {
      const avgScore = Math.round(((evalData.accuracy + evalData.speed + evalData.target_hit) / 3) * 10) / 10

      return prisma.warehouse_kpi_evaluations.upsert({
        where: {
          eval_date_warehouse_id: {
            eval_date: targetDate,
            warehouse_id: BigInt(evalData.warehouse_id)
          }
        },
        update: {
          warehouse_code: evalData.warehouse_code,
          warehouse_name: evalData.warehouse_name,
          accuracy: evalData.accuracy,
          speed: evalData.speed,
          target_hit: evalData.target_hit,
          avg_score: avgScore,
          problems: evalData.problems || '',
          solutions: evalData.solutions || '',
          evaluated_by: evalData.evaluated_by,
          updated_at: new Date(),
        },
        create: {
          eval_date: targetDate,
          warehouse_id: BigInt(evalData.warehouse_id),
          warehouse_code: evalData.warehouse_code,
          warehouse_name: evalData.warehouse_name,
          accuracy: evalData.accuracy,
          speed: evalData.speed,
          target_hit: evalData.target_hit,
          avg_score: avgScore,
          problems: evalData.problems || '',
          solutions: evalData.solutions || '',
          evaluated_by: evalData.evaluated_by,
        }
      })
    })

    await prisma.$transaction(ops)
    return NextResponse.json({ success: true })
  } catch (caught) {
    console.error('[API /api/warehouse-kpi POST ERROR]:', caught)
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลไม่สำเร็จ', 500)
  }
}
