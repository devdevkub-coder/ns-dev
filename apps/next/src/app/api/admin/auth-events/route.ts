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
  action: string
  created_at: Date
  event_type: string
  id: string
  metadata: unknown
  outcome: string
  request_path: string | null
  route_path: string | null
  severity: string
  stream: 'activity' | 'audit'
  target_display_name: string | null
  target_username: string | null
  user_agent: string | null
}

type CountRow = {
  total: bigint
}

function groupCondition(group: z.infer<typeof listAuthEventsSchema>['group']) {
  const authEvents = Prisma.sql`(e.stream = 'audit' and e.action in ('login', 'logout', 'invite', 'reset'))`

  if (group === 'auth') return authEvents
  if (group === 'users') return Prisma.sql`(e.stream = 'audit' and e.event_type like 'app_user.%' and not ${authEvents})`
  if (group === 'permissions') return Prisma.sql`(e.stream = 'audit' and e.action in ('permission', 'role'))`
  if (group === 'activity') return Prisma.sql`e.stream = 'activity'`
  return null
}

function buildWhere(values: z.infer<typeof listAuthEventsSchema>) {
  const clauses: Prisma.Sql[] = []
  const groupSql = groupCondition(values.group)

  if (groupSql) clauses.push(groupSql)
  if (values.eventType) clauses.push(Prisma.sql`e.event_type = ${values.eventType}`)
  if (values.actor) clauses.push(Prisma.sql`(e.actor_username ilike ${`%${values.actor}%`} or e.actor_display_name ilike ${`%${values.actor}%`})`)
  if (values.target) clauses.push(Prisma.sql`(e.target_username ilike ${`%${values.target}%`} or e.target_display_name ilike ${`%${values.target}%`})`)
  if (values.q) {
    const q = `%${values.q}%`
    clauses.push(Prisma.sql`(
      e.event_type ilike ${q}
      or e.action ilike ${q}
      or e.stream ilike ${q}
      or e.metadata::text ilike ${q}
      or e.user_agent ilike ${q}
      or e.request_path ilike ${q}
      or e.route_path ilike ${q}
      or e.actor_username ilike ${q}
      or e.actor_display_name ilike ${q}
      or e.target_username ilike ${q}
      or e.target_display_name ilike ${q}
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
      with unified as (
        select
          'audit'::text as stream,
          a.id::text as id,
          a.event_key as event_type,
          a.action,
          a.outcome,
          a.severity,
          a.occurred_at as created_at,
          a.metadata,
          a.user_agent,
          coalesce(a.actor_username, actor.username) as actor_username,
          coalesce(a.actor_display_name, actor.display_name) as actor_display_name,
          coalesce(target.username, a.target_label) as target_username,
          coalesce(target.display_name, a.target_label) as target_display_name,
          a.request_path,
          null::text as route_path
        from public.app_audit_logs a
        left join public.app_users actor on actor.id = a.actor_app_user_id
        left join public.app_users target
          on a.target_type = 'app_user'
          and a.target_id ~ '^[0-9]+$'
          and target.id = a.target_id::bigint
        union all
        select
          'activity'::text as stream,
          activity.id::text as id,
          activity.activity_key as event_type,
          activity.activity_type as action,
          activity.status as outcome,
          'info'::text as severity,
          activity.occurred_at as created_at,
          activity.metadata,
          activity.user_agent,
          coalesce(activity.actor_username, actor.username) as actor_username,
          coalesce(activity.actor_display_name, actor.display_name) as actor_display_name,
          activity.target_label as target_username,
          activity.target_label as target_display_name,
          activity.request_path,
          activity.route_path
        from public.app_activity_logs activity
        left join public.app_users actor on actor.id = activity.actor_app_user_id
      )
      select
        e.id,
        e.stream,
        e.event_type,
        e.action,
        e.outcome,
        e.severity,
        e.metadata,
        e.user_agent,
        e.created_at,
        e.actor_username,
        e.actor_display_name,
        e.target_username,
        e.target_display_name,
        e.request_path,
        e.route_path
      from unified e
      ${where}
      order by e.created_at desc
      limit ${values.pageSize}
      offset ${offset}
    `,
      prisma.$queryRaw<CountRow[]>`
      with unified as (
        select
          'audit'::text as stream,
          a.event_key as event_type,
          a.action,
          a.metadata,
          a.user_agent,
          coalesce(a.actor_username, actor.username) as actor_username,
          coalesce(a.actor_display_name, actor.display_name) as actor_display_name,
          coalesce(target.username, a.target_label) as target_username,
          coalesce(target.display_name, a.target_label) as target_display_name,
          a.request_path,
          null::text as route_path
        from public.app_audit_logs a
        left join public.app_users actor on actor.id = a.actor_app_user_id
        left join public.app_users target
          on a.target_type = 'app_user'
          and a.target_id ~ '^[0-9]+$'
          and target.id = a.target_id::bigint
        union all
        select
          'activity'::text as stream,
          activity.activity_key as event_type,
          activity.activity_type as action,
          activity.metadata,
          activity.user_agent,
          coalesce(activity.actor_username, actor.username) as actor_username,
          coalesce(activity.actor_display_name, actor.display_name) as actor_display_name,
          activity.target_label as target_username,
          activity.target_label as target_display_name,
          activity.request_path,
          activity.route_path
        from public.app_activity_logs activity
        left join public.app_users actor on actor.id = activity.actor_app_user_id
      )
      select count(*)::bigint as total
      from unified e
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
        id: `${row.event_type}:${row.created_at.toISOString()}:${row.stream}`,
        metadata: {
          ...(row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : { value: row.metadata }),
          action: row.action,
          outcome: row.outcome,
          requestPath: row.request_path,
          routePath: row.route_path,
          severity: row.severity,
          stream: row.stream,
        },
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
