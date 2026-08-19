import type { AuthActorContext } from '@/lib/server/auth-context'
import { parseInternalBigIntId } from '@/lib/business-code'
import { auditActionForEventKey, recordAuditLog, requestIp, type AuditDatabaseClient } from '@/lib/server/app-logging'
import { prisma } from '@/lib/server/prisma'

type AuthAuditEvent = {
  context: AuthActorContext
  db?: AuditDatabaseClient
  eventType: string
  metadata?: Record<string, boolean | number | string | null>
  request?: Request
  targetAppUserId?: string | null
}

export async function recordAuthAuditEvent({ context, db = prisma, eventType, metadata = {}, request, targetAppUserId = null }: AuthAuditEvent) {
  const parsedTargetAppUserId = parseInternalBigIntId(targetAppUserId)

  await recordAuditLog({
    action: auditActionForEventKey(eventType),
    context,
    db,
    eventKey: eventType,
    metadata,
    request,
    targetId: parsedTargetAppUserId?.toString() ?? null,
    targetType: parsedTargetAppUserId != null ? 'app_user' : null,
  })

  try {
    await db.$executeRaw`
      insert into public.app_auth_events (
        actor_app_user_id,
        actor_auth_user_id,
        target_app_user_id,
        event_type,
        metadata,
        ip_address,
        user_agent
      ) values (
        ${parseInternalBigIntId(context.appUser?.id) ?? null}::bigint,
        ${context.authUser.id}::uuid,
        ${parsedTargetAppUserId}::bigint,
        ${eventType},
        ${JSON.stringify(metadata)}::jsonb,
        ${requestIp(request)}::inet,
        ${request?.headers.get('user-agent') ?? null}
      )
    `
  } catch (caught) {
    console.error('Failed to record auth audit event', caught)
    throw new Error('ไม่สามารถบันทึก auth audit event ได้', { cause: caught })
  }
}
