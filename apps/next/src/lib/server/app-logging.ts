import type { AppAuthContext } from '@/lib/server/auth-context'
import { parseInternalBigIntId } from '@/lib/business-code'
import { prisma } from '@/lib/server/prisma'

type LogMetadata = Record<string, boolean | number | string | null>

type AuditAction =
  | 'approve'
  | 'create'
  | 'delete'
  | 'export'
  | 'import'
  | 'invite'
  | 'login'
  | 'logout'
  | 'permission'
  | 'post'
  | 'reset'
  | 'reverse'
  | 'role'
  | 'status'
  | 'system'
  | 'update'

type LogStatus = 'blocked' | 'failure' | 'success'

type AuditLogInput = {
  action?: AuditAction
  afterData?: unknown
  beforeData?: unknown
  context: AppAuthContext
  diff?: unknown
  entityId?: string | null
  entityLabel?: string | null
  entitySchema?: string | null
  entityTable?: string | null
  eventKey: string
  metadata?: LogMetadata
  outcome?: LogStatus
  request?: Request
  severity?: 'critical' | 'debug' | 'error' | 'info' | 'warning'
  targetId?: string | null
  targetLabel?: string | null
  targetType?: string | null
}

type ActivityLogInput = {
  activityKey: string
  activityType: 'action' | 'export' | 'filter' | 'navigation' | 'page_view' | 'search' | 'session' | 'system'
  context: AppAuthContext
  description?: string | null
  metadata?: LogMetadata
  referrer?: string | null
  request?: Request
  routePath?: string | null
  status?: LogStatus
  targetId?: string | null
  targetLabel?: string | null
  targetType?: string | null
  title?: string | null
}

export function requestIp(request: Request | undefined) {
  const forwardedFor = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = request?.headers.get('x-real-ip')?.trim()
  const candidate = forwardedFor || realIp

  if (!candidate) return null
  if (!/^[0-9a-fA-F:.]+$/.test(candidate)) return null

  return candidate
}

export function auditActionForEventKey(eventKey: string): AuditAction {
  if (eventKey.includes('invite')) return 'invite'
  if (eventKey.includes('reset')) return 'reset'
  if (eventKey.includes('status')) return 'status'
  if (eventKey.includes('created')) return 'create'
  if (eventKey.includes('updated')) return 'update'
  if (eventKey.includes('deleted')) return 'delete'
  if (eventKey.includes('permission')) return 'permission'
  if (eventKey.includes('role')) return 'role'
  if (eventKey.includes('login')) return 'login'
  if (eventKey.includes('logout')) return 'logout'
  if (eventKey.includes('export')) return 'export'
  if (eventKey.includes('import')) return 'import'
  return 'system'
}

function requestPath(request: Request | undefined) {
  if (!request) return null
  return new URL(request.url).pathname
}

export async function recordAuditLog({
  action,
  afterData = null,
  beforeData = null,
  context,
  diff = null,
  entityId = null,
  entityLabel = null,
  entitySchema = null,
  entityTable = null,
  eventKey,
  metadata = {},
  outcome = 'success',
  request,
  severity = 'info',
  targetId = null,
  targetLabel = null,
  targetType = null,
}: AuditLogInput) {
  const actorAppUserId = parseInternalBigIntId(context.appUser?.id)

  try {
    await prisma.$executeRaw`
      insert into public.app_audit_logs (
        event_key,
        action,
        outcome,
        severity,
        actor_app_user_id,
        actor_auth_user_id,
        actor_username,
        actor_display_name,
        target_type,
        target_id,
        target_label,
        entity_schema,
        entity_table,
        entity_id,
        entity_label,
        http_method,
        request_path,
        ip_address,
        user_agent,
        before_data,
        after_data,
        diff,
        metadata
      ) values (
        ${eventKey},
        ${action ?? auditActionForEventKey(eventKey)},
        ${outcome},
        ${severity},
        ${actorAppUserId}::bigint,
        ${context.authUser.id}::uuid,
        ${context.appUser?.username ?? context.authUser.email ?? null},
        ${context.appUser?.displayName ?? null},
        ${targetType},
        ${targetId},
        ${targetLabel},
        ${entitySchema},
        ${entityTable},
        ${entityId},
        ${entityLabel},
        ${request?.method ?? null},
        ${requestPath(request)},
        ${requestIp(request)}::inet,
        ${request?.headers.get('user-agent') ?? null},
        ${JSON.stringify(beforeData)}::jsonb,
        ${JSON.stringify(afterData)}::jsonb,
        ${JSON.stringify(diff)}::jsonb,
        ${JSON.stringify(metadata)}::jsonb
      )
    `
  } catch (caught) {
    console.warn('Failed to record audit log', caught)
  }
}

export async function recordActivityLog({
  activityKey,
  activityType,
  context,
  description = null,
  metadata = {},
  referrer = null,
  request,
  routePath = null,
  status = 'success',
  targetId = null,
  targetLabel = null,
  targetType = null,
  title = null,
}: ActivityLogInput) {
  const actorAppUserId = parseInternalBigIntId(context.appUser?.id)

  try {
    await prisma.$executeRaw`
      insert into public.app_activity_logs (
        activity_key,
        activity_type,
        title,
        description,
        actor_app_user_id,
        actor_auth_user_id,
        actor_username,
        actor_display_name,
        route_path,
        referrer,
        http_method,
        request_path,
        target_type,
        target_id,
        target_label,
        status,
        ip_address,
        user_agent,
        metadata
      ) values (
        ${activityKey},
        ${activityType},
        ${title},
        ${description},
        ${actorAppUserId}::bigint,
        ${context.authUser.id}::uuid,
        ${context.appUser?.username ?? context.authUser.email ?? null},
        ${context.appUser?.displayName ?? null},
        ${routePath},
        ${referrer},
        ${request?.method ?? null},
        ${requestPath(request)},
        ${targetType},
        ${targetId},
        ${targetLabel},
        ${status},
        ${requestIp(request)}::inet,
        ${request?.headers.get('user-agent') ?? null},
        ${JSON.stringify(metadata)}::jsonb
      )
    `
  } catch (caught) {
    console.warn('Failed to record activity log', caught)
  }
}
