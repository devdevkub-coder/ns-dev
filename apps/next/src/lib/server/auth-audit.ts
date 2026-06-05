import type { AppAuthContext } from '@/lib/server/auth-context'
import { parseInternalBigIntId } from '@/lib/business-code'
import { auditActionForEventKey, recordAuditLog, requestIp } from '@/lib/server/app-logging'
import { prisma } from '@/lib/server/prisma'

type AuthAuditEvent = {
  context: AppAuthContext
  eventType: string
  metadata?: Record<string, boolean | number | string | null>
  request?: Request
  targetAppUserId?: string | null
}

export async function recordAuthAuditEvent({ context, eventType, metadata = {}, request, targetAppUserId = null }: AuthAuditEvent) {
  const parsedTargetAppUserId = parseInternalBigIntId(targetAppUserId)

  await recordAuditLog({
    action: auditActionForEventKey(eventType),
    context,
    eventKey: eventType,
    metadata,
    request,
    targetId: parsedTargetAppUserId?.toString() ?? null,
    targetType: parsedTargetAppUserId != null ? 'app_user' : null,
  })

  try {
    await prisma.$executeRaw`
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
    console.warn('Failed to record auth audit event', caught)
  }
}
