import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { resolveLineConnectionProfile } from '@/lib/line-connection-profile'

export const runtime = 'nodejs'

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

function privateApiErrorResponse(caught: unknown, fallback: string, status: number) {
  const response = apiErrorResponse(caught, fallback, status)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

function privateAuthErrorResponse(caught: AuthContextError) {
  const response = authContextErrorResponse(caught)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    const config = await prisma.system_settings.findUnique({
      where: { key: 'LINE_CHANNEL_SECRET' },
    })
    const secret = config?.value || process.env.LINE_CHANNEL_SECRET || ''

    if (!secret) {
      return NextResponse.json({
        code: 'LINE_SECRET_NOT_SAVED',
        stage: 'configuration',
        error: 'กรุณากรอกและบันทึก LINE Channel Secret ก่อนทดสอบ',
      }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS })
    }

    const hostConfig = await prisma.system_settings.findUnique({
      where: { key: 'NEXT_PUBLIC_APP_URL' },
    })
    const appUrl = hostConfig?.value?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || ''
    let webhookUrl = ''
    try {
      if (!appUrl) throw new Error('missing')
      webhookUrl = new URL('/api/line/webhook', appUrl).toString()
    } catch {
      return NextResponse.json({
        code: 'LINE_APP_URL_INVALID',
        stage: 'configuration',
        error: 'ต้องตั้งค่า Public App URL ที่ถูกต้องก่อนทดสอบ Webhook',
      }, { status: 400, headers: PRIVATE_NO_STORE_HEADERS })
    }

    const profile = resolveLineConnectionProfile({
      appUrl,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    })
    const isKnownProfileMismatch = profile.dataProfileId !== 'custom'
      && profile.targetProfileId !== 'custom'
      && !profile.aligned

    if (isKnownProfileMismatch) {
      return NextResponse.json({
        code: 'LINE_ENVIRONMENT_MISMATCH',
        stage: 'environment',
        sourceProfile: profile.dataProfileLabel,
        targetProfile: profile.targetProfileLabel,
        sourceHost: new URL(request.url).host,
        targetHost: new URL(webhookUrl).host,
        error: 'ฐานข้อมูล LINE และ Webhook URL อยู่คนละ environment',
      }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS })
    }

    const rawBody = JSON.stringify({ events: [] })
    const signature = createHmac('sha256', secret).update(rawBody).digest('base64')

    let response: Response
    try {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-signature': signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(10_000),
      })
    } catch (caught) {
      const isTimeout = caught instanceof DOMException
        ? caught.name === 'TimeoutError' || caught.name === 'AbortError'
        : caught instanceof Error && /timeout|abort/i.test(caught.name)
      return NextResponse.json({
        code: isTimeout ? 'LINE_WEBHOOK_TIMEOUT' : 'LINE_WEBHOOK_UNREACHABLE',
        stage: 'transport',
        error: isTimeout
          ? 'Webhook ใช้เวลาตอบกลับนานเกินกำหนด'
          : 'ไม่สามารถติดต่อ Webhook URL ได้',
        webhookUrl,
      }, { status: isTimeout ? 504 : 502, headers: PRIVATE_NO_STORE_HEADERS })
    }

    if (response.status === 401) {
      return NextResponse.json({
        code: 'LINE_WEBHOOK_SIGNATURE_REJECTED',
        stage: 'signature',
        error: 'Secret ที่บันทึกไม่ตรงกับ Channel Secret ของ OA เป้าหมาย',
        upstreamStatus: response.status,
        webhookUrl,
      }, { status: 422, headers: PRIVATE_NO_STORE_HEADERS })
    }

    if (!response.ok) {
      return NextResponse.json({
        code: 'LINE_WEBHOOK_UNREACHABLE',
        stage: 'transport',
        error: 'Webhook URL ตอบกลับผิดพลาด',
        upstreamStatus: response.status,
        webhookUrl,
      }, { status: 502, headers: PRIVATE_NO_STORE_HEADERS })
    }

    return NextResponse.json({
      ok: true,
      code: 'LINE_WEBHOOK_OK',
      stage: 'complete',
      message: 'Webhook ภายในยืนยันลายเซ็นสำเร็จ',
      webhookUrl,
      upstreamStatus: response.status,
    }, { headers: PRIVATE_NO_STORE_HEADERS })
  } catch (caught) {
    if (caught instanceof AuthContextError) return privateAuthErrorResponse(caught)
    return privateApiErrorResponse(caught, 'ทดสอบ Webhook ภายในล้มเหลว', 400)
  }
}
