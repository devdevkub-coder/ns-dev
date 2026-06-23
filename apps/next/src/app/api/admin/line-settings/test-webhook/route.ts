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
          replyToken: 'nH7w3O5g5aIpjCYZOgoG',
        },
      ],
    }

    const rawBody = JSON.stringify(dummyPayload)
    const signature = createHmac('sha256', secret).update(rawBody).digest('base64')

    // Get host URL from system settings or request header to call ourselves
    const hostConfig = await prisma.system_settings.findUnique({
      where: { key: 'NEXT_PUBLIC_APP_URL' },
    })
    
    // Attempt local direct connection first to bypass external proxies/WAFs
    const portsToTry = []
    if (process.env.PORT) portsToTry.push(process.env.PORT)
    portsToTry.push('3000', '6100') // Try default 3000 and Devkub's 6100 port

    let response: Response | null = null
    let webhookUrl = ''
    let lastError: any = null

    for (const port of portsToTry) {
      const url = `http://127.0.0.1:${port}/api/line/webhook`
      console.info(`[test-webhook] Attempting local test request to: ${url}`)
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-line-signature': signature,
          },
          body: rawBody,
        })
        response = res
        webhookUrl = url
        console.info(`[test-webhook] Local connection succeeded on port ${port} with status ${res.status}`)
        break // Succeeded to connect (even if status is 401/400)
      } catch (err) {
        console.warn(`[test-webhook] Local test failed on port ${port}:`, err)
        lastError = err
      }
    }

    if (!response) {
      console.warn('[test-webhook] All local port attempts failed, falling back to public URL. Error:', lastError)
      // Fallback to public URL
      let appUrl = hostConfig?.value || process.env.NEXT_PUBLIC_APP_URL || ''
      if (!appUrl) {
        const host = request.headers.get('host')
        const protocol = request.headers.get('x-forwarded-proto') || 'http'
        appUrl = `${protocol}://${host}`
      }
      webhookUrl = `${appUrl.replace(/\/$/, '')}/api/line/webhook`
      
      console.info('[test-webhook] Sending fallback test request to:', webhookUrl)
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-signature': signature,
        },
        body: rawBody,
      })
    }

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
        message: `ระบบตรวจสอบลายเซ็นล้มเหลว (ตอบกลับเป็น HTTP ${status} จาก URL: ${webhookUrl}) - ลายเซ็นไม่ถูกต้องหรือ Secret ผิดพลาด`,
        webhookUrl,
        status,
        response: text,
        secretPrefix: secret.slice(0, 4) + '***',
      })
    }
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ทดสอบจำลอง Webhook ล้มเหลว', 400)
  }
}
