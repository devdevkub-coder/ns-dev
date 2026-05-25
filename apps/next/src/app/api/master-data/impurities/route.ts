import { NextResponse } from 'next/server'
import { impurityFormSchema } from '@/lib/impurity'
import { mapPrismaImpurity, type PrismaImpurityRow } from '@/lib/domain/impurity'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

async function getNextImpurityId() {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    select id
    from public.impurities
    where id like 'IMP-%'
  `
  const maxNumber = rows.reduce((max, row) => {
    const matched = row.id.match(/^IMP-(\d+)$/i)
    const value = matched ? Number(matched[1]) : 0
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return `IMP-${String(maxNumber + 1).padStart(3, '0')}`
}

async function findImpurityByName(name: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    select id
    from public.impurities
    where lower(btrim(name)) = lower(btrim(${name}))
    limit 1
  `
  return rows[0] ?? null
}

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.view')

    const rows = await prisma.$queryRaw<PrismaImpurityRow[]>`
      select id, name, active, created_at, updated_at
      from public.impurities
      order by lower(name), id
    `

    return NextResponse.json({ rows: rows.map(mapPrismaImpurity) })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลสิ่งเจือปนไม่ได้', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'master.reference.manage')

    const values = impurityFormSchema.parse(await request.json())
    const existing = await findImpurityByName(values.name)
    if (existing && existing.id !== values.id) {
      return NextResponse.json({ code: 'CONFLICT', error: 'ชื่อสิ่งเจือปนนี้มีอยู่แล้ว' }, { status: 409 })
    }

    const id = values.id || await getNextImpurityId()
    const rows = values.id
      ? await prisma.$queryRaw<PrismaImpurityRow[]>`
        update public.impurities
        set name = ${values.name}, active = ${values.active}
        where id = ${id}
        returning id, name, active, created_at, updated_at
      `
      : await prisma.$queryRaw<PrismaImpurityRow[]>`
        insert into public.impurities (id, name, active)
        values (${id}, ${values.name}, ${values.active})
        returning id, name, active, created_at, updated_at
      `

    const row = rows[0]
    if (!row) {
      return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบข้อมูลสิ่งเจือปนที่ต้องการแก้ไข' }, { status: 404 })
    }

    return NextResponse.json(mapPrismaImpurity(row))
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลสิ่งเจือปนไม่ได้', 400)
  }
}
