import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { isMaskedToken, syncLineTargetsFromAPI } from '@/lib/server/line-target-sync'

export const runtime = 'nodejs'

const settingsSchema = z.object({
  lineChannelAccessToken: z.string().trim().nullable().or(z.literal('')),
  lineChannelSecret: z.string().trim().nullable().or(z.literal('')),
  lineDefaultTargetId: z.string().trim().nullable().or(z.literal('')),
  pdfBucket: z.string().trim().min(1, 'ระบุชื่อ Storage Bucket'),
  appUrl: z.string().trim().url('URL ไม่ถูกต้อง').or(z.literal('')),
  lineAutoSend: z.boolean().optional(),
  lineAutoSendWti: z.boolean().default(false),
  lineAutoSendWto: z.boolean().default(false),
  googleSheetsWebhookUrl: z.string().trim().url('URL ไม่ถูกต้อง').or(z.literal('')).nullable().or(z.literal('')),
  lineNotifyTextTemplateWti: z.string().trim().nullable().or(z.literal('')),
  lineNotifyTextTemplateWto: z.string().trim().nullable().or(z.literal('')),
  lineAlbumShowBadges: z.boolean().default(true),
  lineAlbumShowTimestamps: z.boolean().default(true),
  lineAlbumQuality: z.number().int().min(10).max(100).default(90),
})

export async function GET() {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    const dbSettings = await prisma.system_settings.findMany({
      where: {
        key: {
          in: [
            'LINE_CHANNEL_ACCESS_TOKEN',
            'LINE_CHANNEL_SECRET',
            'LINE_DEFAULT_TARGET_ID',
            'WEIGHT_TICKET_PDF_BUCKET',
            'NEXT_PUBLIC_APP_URL',
            'LINE_AUTO_SEND',
            'LINE_AUTO_SEND_WTI',
            'LINE_AUTO_SEND_WTO',
            'GOOGLE_SHEETS_WEBHOOK_URL',
            'LINE_NOTIFY_TEXT_TEMPLATE_WTI',
            'LINE_NOTIFY_TEXT_TEMPLATE_WTO',
            'LINE_ALBUM_SHOW_BADGES',
            'LINE_ALBUM_SHOW_TIMESTAMPS',
            'LINE_ALBUM_QUALITY',
          ],
        },
      },
    })

    const configMap = Object.fromEntries(dbSettings.map((s) => [s.key, s.value]))
    const legacyAutoSend = configMap.LINE_AUTO_SEND === 'true'
    const lineAutoSendWti = configMap.LINE_AUTO_SEND_WTI ? configMap.LINE_AUTO_SEND_WTI === 'true' : legacyAutoSend
    const lineAutoSendWto = configMap.LINE_AUTO_SEND_WTO ? configMap.LINE_AUTO_SEND_WTO === 'true' : legacyAutoSend

    const lineNotifyTextTemplateWti = configMap.LINE_NOTIFY_TEXT_TEMPLATE_WTI || ''
    const lineNotifyTextTemplateWto = configMap.LINE_NOTIFY_TEXT_TEMPLATE_WTO || ''
    const lineAlbumShowBadges = configMap.LINE_ALBUM_SHOW_BADGES !== 'false'
    const lineAlbumShowTimestamps = configMap.LINE_ALBUM_SHOW_TIMESTAMPS !== 'false'
    const lineAlbumQuality = configMap.LINE_ALBUM_QUALITY ? parseInt(configMap.LINE_ALBUM_QUALITY, 10) : 90

    const maskSecret = (val: string | null | undefined) => {
      if (!val) return ''
      return '••••••••••••••••'
    }

    return NextResponse.json({
      lineChannelAccessToken: maskSecret(configMap.LINE_CHANNEL_ACCESS_TOKEN),
      lineChannelSecret: maskSecret(configMap.LINE_CHANNEL_SECRET),
      lineDefaultTargetId: configMap.LINE_DEFAULT_TARGET_ID || '',
      pdfBucket: configMap.WEIGHT_TICKET_PDF_BUCKET || 'weight-ticket-pdfs',
      appUrl: configMap.NEXT_PUBLIC_APP_URL || '',
      lineAutoSend: lineAutoSendWti && lineAutoSendWto,
      lineAutoSendWti,
      lineAutoSendWto,
      googleSheetsWebhookUrl: configMap.GOOGLE_SHEETS_WEBHOOK_URL || '',
      lineNotifyTextTemplateWti,
      lineNotifyTextTemplateWto,
      lineAlbumShowBadges,
      lineAlbumShowTimestamps,
      lineAlbumQuality,
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'โหลดข้อมูลตั้งค่า LINE ไม่สำเร็จ', 500)
  }
}

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    const body = await request.json()
    const values = settingsSchema.parse(body)
    const actor = currentActor(context)
    const hasLegacyAutoSend = typeof values.lineAutoSend === 'boolean'
    const lineAutoSendWti = hasLegacyAutoSend ? values.lineAutoSend === true : values.lineAutoSendWti
    const lineAutoSendWto = hasLegacyAutoSend ? values.lineAutoSend === true : values.lineAutoSendWto
    const legacyAutoSend = lineAutoSendWti && lineAutoSendWto

    const isMasked = (val: string | null | undefined) => {
      if (!val) return false
      return val.includes('••') || val === '••••••••••••••••'
    }

    const updates = [
      { key: 'LINE_DEFAULT_TARGET_ID', value: values.lineDefaultTargetId || null },
      { key: 'WEIGHT_TICKET_PDF_BUCKET', value: values.pdfBucket },
      { key: 'NEXT_PUBLIC_APP_URL', value: values.appUrl || null },
      { key: 'LINE_AUTO_SEND', value: legacyAutoSend ? 'true' : 'false' },
      { key: 'LINE_AUTO_SEND_WTI', value: lineAutoSendWti ? 'true' : 'false' },
      { key: 'LINE_AUTO_SEND_WTO', value: lineAutoSendWto ? 'true' : 'false' },
      { key: 'GOOGLE_SHEETS_WEBHOOK_URL', value: values.googleSheetsWebhookUrl || null },
      { key: 'LINE_NOTIFY_TEXT_TEMPLATE_WTI', value: values.lineNotifyTextTemplateWti || null },
      { key: 'LINE_NOTIFY_TEXT_TEMPLATE_WTO', value: values.lineNotifyTextTemplateWto || null },
      { key: 'LINE_ALBUM_SHOW_BADGES', value: values.lineAlbumShowBadges ? 'true' : 'false' },
      { key: 'LINE_ALBUM_SHOW_TIMESTAMPS', value: values.lineAlbumShowTimestamps ? 'true' : 'false' },
      { key: 'LINE_ALBUM_QUALITY', value: String(values.lineAlbumQuality) },
    ]

    if (!isMasked(values.lineChannelAccessToken)) {
      updates.push({ key: 'LINE_CHANNEL_ACCESS_TOKEN', value: values.lineChannelAccessToken || null })
    }
    if (!isMasked(values.lineChannelSecret)) {
      updates.push({ key: 'LINE_CHANNEL_SECRET', value: values.lineChannelSecret || null })
    }

    await prisma.$transaction(
      updates.map((item) =>
        prisma.system_settings.upsert({
          where: { key: item.key },
          create: {
            key: item.key,
            value: item.value,
            updated_by: actor,
          },
          update: {
            value: item.value,
            updated_by: actor,
            updated_at: new Date(),
          },
        })
      )
    )

    // Auto-sync targets เมื่อมีการเปลี่ยน token จริง (ไม่ใช่ masked placeholder)
    // sync ล้มเหลวไม่ทำให้การบันทึก token ล้มเหลวด้วย — คืน warning ไปแค่นั้น
    let syncWarning: string | null = null
    if (!isMaskedToken(values.lineChannelAccessToken) && values.lineChannelAccessToken) {
      try {
        await syncLineTargetsFromAPI(values.lineChannelAccessToken)
      } catch (err) {
        syncWarning = err instanceof Error ? err.message : 'sync กลุ่ม LINE ล้มเหลว'
        console.error('[line-settings] auto-sync targets failed', err)
      }
    }

    return NextResponse.json({ ok: true, syncWarning })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลตั้งค่า LINE ไม่สำเร็จ', 400)
  }
}
