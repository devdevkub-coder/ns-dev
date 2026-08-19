import { recordAuthAuditEvent } from '@/lib/server/auth-audit'
import { authContextErrorResponse, getCurrentLoginContext, type AuthContextTimingStage } from '@/lib/server/auth-context'
import { authJson, withAuthNoStore } from '@/lib/server/auth-response'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

type LoginTimingStage = AuthContextTimingStage | 'last_login' | 'audit'

function withLoginTiming(
  response: Response,
  startedAt: number,
  timings: Partial<Record<LoginTimingStage, number>>
) {
  const orderedStages: LoginTimingStage[] = ['auth', 'app_user', 'last_login', 'audit']
  const entries = orderedStages
    .filter((stage) => timings[stage] != null)
    .map((stage) => `${stage};dur=${Math.max(0, timings[stage] ?? 0).toFixed(1)}`)
  entries.push(`total;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`)
  response.headers.set('Server-Timing', entries.join(', '))
  return response
}

async function measureLoginStage<T>(
  timings: Partial<Record<LoginTimingStage, number>>,
  stage: LoginTimingStage,
  operation: () => Promise<T>
) {
  const startedAt = performance.now()
  try {
    return await operation()
  } finally {
    timings[stage] = performance.now() - startedAt
  }
}

export async function POST(request: Request) {
  const startedAt = performance.now()
  const timings: Partial<Record<LoginTimingStage, number>> = {}

  try {
    const context = await getCurrentLoginContext({
      onStage: (stage, durationMs) => {
        timings[stage] = durationMs
      },
    })

    const loggedInAt = new Date()

    await prisma.$transaction(async (transaction) => {
      await measureLoginStage(timings, 'last_login', () => transaction.app_users.update({
        data: {
          last_login_at: loggedInAt,
        },
        where: {
          id: context.appUser.id,
        },
      }))

      await measureLoginStage(timings, 'audit', () => recordAuthAuditEvent({
        context,
        db: transaction,
        eventType: 'app_user.login_completed',
        metadata: {
          source: 'password_login',
        },
        request,
        targetAppUserId: context.appUser.id.toString(),
      }))
    })

    return withLoginTiming(authJson({
      authUserId: context.authUser.id,
      lastLoginAt: loggedInAt.toISOString(),
    }), startedAt, timings)
  } catch (caught) {
    return withLoginTiming(withAuthNoStore(authContextErrorResponse(caught)), startedAt, timings)
  }
}
