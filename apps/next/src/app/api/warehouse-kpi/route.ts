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
    godown_id: z.number(),
    godown_code: z.string(),
    godown_name: z.string(),
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

    const [evaluations, godowns] = await Promise.all([
      prisma.godown_kpi_evaluations.findMany({
        where: { eval_date: targetDate },
        select: {
          id: true,
          godown_id: true,
          godown_code: true,
          godown_name: true,
          accuracy: true,
          speed: true,
          target_hit: true,
          avg_score: true,
          problems: true,
          solutions: true,
          evaluated_by: true,
        },
      }),
      prisma.godowns.findMany({
        where: { active: true },
        select: {
          id: true,
          code: true,
          name: true,
          active: true,
          branches: { select: { code: true, name: true } },
        },
        orderBy: { code: 'asc' }
      })
    ])

    const safeEvaluations = evaluations.map((e) => ({
      id: Number(e.id),
      godown_id: Number(e.godown_id),
      godown_code: e.godown_code,
      godown_name: e.godown_name,
      accuracy: e.accuracy,
      speed: e.speed,
      target_hit: e.target_hit,
      avg_score: Number(e.avg_score),
      problems: e.problems || '',
      solutions: e.solutions || '',
      evaluated_by: e.evaluated_by || '',
    }))

    const safeGodowns = godowns.map((w) => ({
      id: Number(w.id),
      code: w.code,
      name: w.name,
      branch_code: w.branches?.code ?? null,
      branch_name: w.branches?.name ?? null,
      active: w.active ?? true,
    }))

    return NextResponse.json({ evaluations: safeEvaluations, godowns: safeGodowns })
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

    const godownIds = [...new Set(body.evaluations.map((evaluation) => BigInt(evaluation.godown_id)))]
    const godownRows = await prisma.godowns.findMany({
      where: { active: true, id: { in: godownIds } },
      select: { code: true, id: true, name: true },
    })
    const godownById = new Map(godownRows.map((godown) => [godown.id.toString(), godown]))
    if (godownRows.length !== godownIds.length) throw new Error('มีโกดังที่ไม่พบหรือถูกปิดใช้งาน')

    const ops = body.evaluations.map(evalData => {
      const avgScore = Math.round(((evalData.accuracy + evalData.speed + evalData.target_hit) / 3) * 10) / 10
      const godown = godownById.get(String(evalData.godown_id))
      if (!godown) throw new Error('ไม่พบโกดังที่ต้องการบันทึก KPI')

      return prisma.godown_kpi_evaluations.upsert({
        where: {
          eval_date_godown_id: {
            eval_date: targetDate,
            godown_id: BigInt(evalData.godown_id)
          }
        },
        update: {
          godown_code: godown.code,
          godown_name: godown.name,
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
          godown_id: BigInt(evalData.godown_id),
          godown_code: godown.code,
          godown_name: godown.name,
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
