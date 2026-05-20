import { NextResponse } from 'next/server'
import { z } from 'zod'
import { recordActivityLog } from '@/lib/server/app-logging'
import { authContextErrorResponse, getCurrentAuthContext } from '@/lib/server/auth-context'

export const runtime = 'nodejs'

const activitySchema = z.object({
  key: z.string().trim().max(120).regex(/^[a-z0-9_.:-]+$/).default('page.view'),
  metadata: z.record(z.string(), z.union([z.boolean(), z.number(), z.string(), z.null()])).default({}),
  referrer: z.string().trim().max(500).nullable().optional(),
  routePath: z.string().trim().min(1).max(500),
  title: z.string().trim().max(160).nullable().optional(),
  type: z.enum(['action', 'export', 'filter', 'navigation', 'page_view', 'search', 'session', 'system']).default('page_view'),
})

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    const values = activitySchema.parse(await request.json())

    await recordActivityLog({
      activityKey: values.key,
      activityType: values.type,
      context,
      metadata: values.metadata,
      referrer: values.referrer ?? null,
      request,
      routePath: values.routePath,
      title: values.title ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (caught) {
    return authContextErrorResponse(caught)
  }
}
