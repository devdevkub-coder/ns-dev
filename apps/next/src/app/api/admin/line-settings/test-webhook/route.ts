import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    // Read the current channel secret from the database
    const config = await prisma.system_settings.findUnique({
      where: { key: 'LINE_CHANNEL_SECRET' },
    })
    const secret = config?.value || process.env.LINE_CHANNEL_SECRET || ''

    if (!secret) {
      throw new Error('กรุณากรอกและบันทึก LINE Channel Secret ก่อนทดสอบ')
    }

    // Dummy LINE webhook event payload
    const dummyPayload = {
      destination: 'U1234567890abcdef1234567890abcdef',
      events: [
        {
          type: 'message',
          message: {
            type: 'text',
            id: '325708',
            text: 'Hello, world',
          },
          timestamp: 1462629479859,
          source: {
            type: 'user',
            userId: 'U1234567890abcdef1234567890abcdef',
          },
          replyToken: 'test-reply-token',
        },
      ],
    }

    const rawBody = JSON.stringify(dummyPayload)
    const signature = createHmac('sha256', secret).update(rawBody).digest('base64')

    // Use an explicitly configured application URL; never infer another environment from the request host.
    const hostConfig = await prisma.system_settings.findUnique({
      where: { key: 'NEXT_PUBLIC_APP_URL' },
    })
    
    const appUrl = hostConfig?.value?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || ''
    if (!appUrl) throw new Error('ต้องตั้งค่า NEXT_PUBLIC_APP_URL อย่างชัดเจนก่อนทดสอบ Webhook')
    const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/line/webhook`
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signature,
      },
      body: rawBody,
    })

    const status = response.status
    const text = await response.text()

    if (response.ok) {
      return NextResponse.json({
        ok: true,
        message: 'ทดสอบจำลองส่ง Webhook สำเร็จ! ระบบคำนวณและยืนยันลายเซ็น (Signature) ถูกต้อง',
        webhookUrl,
        status,
        response: text,
      })
    } else {
      return NextResponse.json({
        ok: false,
        message: `ระบบตรวจสอบลายเซ็นล้มเหลว (ตอบกลับเป็น HTTP ${status} จาก URL: ${webhookUrl}) - ผลลัพธ์: ${text}`,
        webhookUrl,
        status,
        response: text,
      })
    }
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ทดสอบจำลอง Webhook ล้มเหลว', 400)
  }
}
