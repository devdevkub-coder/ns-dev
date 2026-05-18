import { NextResponse } from 'next/server'
import { z } from 'zod'
import { authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { Prisma } from '../../../../../generated/prisma/client'

export const runtime = 'nodejs'

const listAuthEventsSchema = z.object({
  actor: z.string().trim().max(120).default(''),
  eventType: z.string().trim().max(120).default(''),
  group: z.enum(['all', 'auth', 'users', 'permissions', 'activity']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(200).default(50),
  q: z.string().trim().max(200).default(''),
  target: z.string().trim().max(120).default(''),
})

type AuthEventRow = {
  actor_display_name: string | null
  actor_username: string | null
  created_at: Date
  event_type: string
  id: string
  metadata: unknown
  target_display_name: string | null
  target_username: string | null
  user_agent: string | null
}

type CountRow = {
  total: bigint
}

function groupCondition(group: z.infer<typeof listAuthEventsSchema>['group']) {
  const authEvents = Prisma.sql`(e.event_type like '%login%' or e.event_type like '%invite%' or e.event_type like '%reset%')`

  if (group === 'auth') return authEvents
  if (group === 'users') return Prisma.sql`(e.event_type like 'app_user.%' and not ${authEvents})`
  if (group === 'permissions') return Prisma.sql`(e.event_type like '%permission%' or e.event_type like '%role%')`
  if (group === 'activity') return Prisma.sql`not (e.event_type like '%login%' or e.event_type like '%invite%' or e.event_type like '%reset%' or e.event_type like 'app_user.%' or e.event_type like '%permission%' or e.event_type like '%role%')`
  return null
}

function buildWhere(values: z.infer<typeof listAuthEventsSchema>) {
  const clauses: Prisma.Sql[] = []
  const groupSql = groupCondition(values.group)

  if (groupSql) clauses.push(groupSql)
  if (values.eventType) clauses.push(Prisma.sql`e.event_type = ${values.eventType}`)
  if (values.actor) clauses.push(Prisma.sql`(actor.username ilike ${`%${values.actor}%`} or actor.display_name ilike ${`%${values.actor}%`})`)
  if (values.target) clauses.push(Prisma.sql`(target.username ilike ${`%${values.target}%`} or target.display_name ilike ${`%${values.target}%`})`)
  if (values.q) {
    const q = `%${values.q}%`
    clauses.push(Prisma.sql`(
      e.event_type ilike ${q}
      or e.metadata::text ilike ${q}
      or e.user_agent ilike ${q}
      or actor.username ilike ${q}
      or actor.display_name ilike ${q}
      or target.username ilike ${q}
      or target.display_name ilike ${q}
    )`)
  }

  return clauses.length > 0 ? Prisma.sql`where ${Prisma.join(clauses, ' and ')}` : Prisma.empty
}

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.audit.view')

    const url = new URL(request.url)
    const values = listAuthEventsSchema.parse({
      actor: url.searchParams.get('actor') ?? undefined,
      eventType: url.searchParams.get('eventType') ?? undefined,
      group: url.searchParams.get('group') ?? undefined,
      page: url.searchParams.get('page') ?? undefined,
      pageSize: url.searchParams.get('pageSize') ?? undefined,
      q: url.searchParams.get('q') ?? undefined,
      target: url.searchParams.get('target') ?? undefined,
    })
    const where = buildWhere(values)
    const offset = (values.page - 1) * values.pageSize

    const [rows, countRows] = await Promise.all([
      prisma.$queryRaw<AuthEventRow[]>`
      select
        e.id,
        e.event_type,
        e.metadata,
        e.user_agent,
        e.created_at,
        actor.username as actor_username,
        actor.display_name as actor_display_name,
        target.username as target_username,
        target.display_name as target_display_name
      from public.app_auth_events e
      left join public.app_users actor on actor.id = e.actor_app_user_id
      left join public.app_users target on target.id = e.target_app_user_id
      ${where}
      order by e.created_at desc
      limit ${values.pageSize}
      offset ${offset}
    `,
      prisma.$queryRaw<CountRow[]>`
      select count(*)::bigint as total
      from public.app_auth_events e
      left join public.app_users actor on actor.id = e.actor_app_user_id
      left join public.app_users target on target.id = e.target_app_user_id
      ${where}
    `,
    ])
    const total = Number(countRows[0]?.total ?? 0)

    return NextResponse.json({
      page: values.page,
      pageSize: values.pageSize,
      rows: rows.map((row) => ({
        actor: row.actor_username ? {
          displayName: row.actor_display_name,
          username: row.actor_username,
        } : null,
        createdAt: row.created_at.toISOString(),
        eventType: row.event_type,
        id: row.id,
        metadata: row.metadata,
        target: row.target_username ? {
          displayName: row.target_display_name,
          username: row.target_username,
        } : null,
        userAgent: row.user_agent,
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / values.pageSize)),
    })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
