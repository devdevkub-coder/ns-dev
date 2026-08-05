import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { fetchLineBotInfo } from '@/lib/server/line-target-sync'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const testConnectionSchema = z.object({
  token: z.string().trim().optional().nullable().or(z.literal('')),
})

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    const body = await request.json()
    const { token } = testConnectionSchema.parse(body)

    let finalToken = token
    if (!finalToken || finalToken === '••••••••••••••••' || finalToken.includes('••')) {
      const config = await prisma.system_settings.findUnique({
        where: { key: 'LINE_CHANNEL_ACCESS_TOKEN' },
      })
      finalToken = config?.value || ''
    }

    if (!finalToken) {
      throw new Error('กรุณาระบุ Channel Access Token หรือบันทึกในระบบก่อนทดสอบ')
    }

    const botInfo = await fetchLineBotInfo(finalToken)

    return NextResponse.json({
      ok: true,
      botName: botInfo.botName,
      basicId: botInfo.basicId,
      pictureUrl: botInfo.pictureUrl,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ตรวจสอบการเชื่อมต่อ LINE OA ล้มเหลว', 400)
  }
}
