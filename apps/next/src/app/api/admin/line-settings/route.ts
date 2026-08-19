import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '../../../../../generated/prisma/client'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'
import { fetchLineBotInfo, isMaskedToken, syncLineTargetsFromAPI } from '@/lib/server/line-target-sync'

export const runtime = 'nodejs'

const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }

const settingsSchema = z.object({
  lineChannelAccessToken: z.string().trim().nullable().or(z.literal('')),
  lineChannelSecret: z.string().trim().nullable().or(z.literal('')),
  googleSheetsWebhookUrl: z.string().trim().url('URL Google Sheets ไม่ถูกต้อง').or(z.literal('')),
  lineDefaultTargetId: z.string().trim().nullable().or(z.literal('')),
  pdfBucket: z.string().trim().min(1, 'ระบุชื่อ Storage Bucket'),
  appUrl: z.string().trim().url('URL ไม่ถูกต้อง').or(z.literal('')),
  lineAutoSend: z.boolean().optional(),
  lineAutoSendWti: z.boolean().default(false),
  lineAutoSendWto: z.boolean().default(false),
  lineNotifyTextTemplateWti: z.string().trim().nullable().or(z.literal('')).optional(),
  lineNotifyTextTemplateWto: z.string().trim().nullable().or(z.literal('')).optional(),
  lineAlbumShowBadges: z.boolean().default(true),
  lineAlbumShowTimestamps: z.boolean().default(true),
  lineAlbumQuality: z.number().int().min(10).max(100).default(90),
  dailyReportAutoSend: z.boolean().default(true),
  dailyReportScheduleTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'รูปแบบเวลาไม่ถูกต้อง (HH:mm)').default('18:00'),
  monthlyReportAutoSend: z.boolean().default(true).optional(),
  monthlyReportScheduleTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'รูปแบบเวลาไม่ถูกต้อง (HH:mm)').default('08:00').optional(),
  monthlyReportDay: z.string().trim().default('1').optional(),
  confirmBotChange: z.boolean().default(false),
})

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
            'GOOGLE_SHEETS_WEBHOOK_URL',
            'LINE_DEFAULT_TARGET_ID',
            'WEIGHT_TICKET_PDF_BUCKET',
            'NEXT_PUBLIC_APP_URL',
            'LINE_AUTO_SEND',
            'LINE_AUTO_SEND_WTI',
            'LINE_AUTO_SEND_WTO',
            'LINE_NOTIFY_TEXT_TEMPLATE_WTI',
            'LINE_NOTIFY_TEXT_TEMPLATE_WTO',
            'LINE_ALBUM_SHOW_BADGES',
            'LINE_ALBUM_SHOW_TIMESTAMPS',
            'LINE_ALBUM_QUALITY',
            'DAILY_REPORT_AUTO_SEND',
            'DAILY_REPORT_SCHEDULE_TIME',
            'MONTHLY_REPORT_AUTO_SEND',
            'MONTHLY_REPORT_SCHEDULE_TIME',
            'MONTHLY_REPORT_DAY',
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
    const dailyReportAutoSend = configMap.DAILY_REPORT_AUTO_SEND !== 'false'
    const dailyReportScheduleTime = configMap.DAILY_REPORT_SCHEDULE_TIME || '18:00'
    const monthlyReportAutoSend = configMap.MONTHLY_REPORT_AUTO_SEND !== 'false'
    const monthlyReportScheduleTime = configMap.MONTHLY_REPORT_SCHEDULE_TIME || '08:00'
    const monthlyReportDay = configMap.MONTHLY_REPORT_DAY || '1'

    const maskSecret = (val: string | null | undefined) => {
      if (!val) return ''
      return '••••••••••••••••'
    }

    return NextResponse.json({
      lineChannelAccessToken: maskSecret(configMap.LINE_CHANNEL_ACCESS_TOKEN),
      lineChannelSecret: maskSecret(configMap.LINE_CHANNEL_SECRET),
      googleSheetsWebhookUrl: configMap.GOOGLE_SHEETS_WEBHOOK_URL || '',
      lineDefaultTargetId: configMap.LINE_DEFAULT_TARGET_ID || '',
      pdfBucket: configMap.WEIGHT_TICKET_PDF_BUCKET || '',
      appUrl: configMap.NEXT_PUBLIC_APP_URL || '',
      lineAutoSend: lineAutoSendWti && lineAutoSendWto,
      lineAutoSendWti,
      lineAutoSendWto,
      lineNotifyTextTemplateWti,
      lineNotifyTextTemplateWto,
      lineAlbumShowBadges,
      lineAlbumShowTimestamps,
      lineAlbumQuality,
      dailyReportAutoSend,
      dailyReportScheduleTime,
      monthlyReportAutoSend,
      monthlyReportScheduleTime,
      monthlyReportDay,
    }, { headers: PRIVATE_NO_STORE_HEADERS })
  } catch (caught) {
    if (caught instanceof AuthContextError) return privateAuthErrorResponse(caught)
    return privateApiErrorResponse(caught, 'โหลดข้อมูลตั้งค่า LINE ไม่สำเร็จ', 500)
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

    const isReplacingToken = Boolean(values.lineChannelAccessToken && !isMaskedToken(values.lineChannelAccessToken))
    const existingSettings = isReplacingToken
      ? await prisma.system_settings.findMany({
        where: {
          key: {
            in: ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_BOT_BASIC_ID', 'LINE_BOT_NAME'],
          },
        },
      })
      : []
    const existingConfig = Object.fromEntries(existingSettings.map((setting) => [setting.key, setting.value]))
    const previousToken = existingConfig.LINE_CHANNEL_ACCESS_TOKEN || ''
    const previousBasicId = existingConfig.LINE_BOT_BASIC_ID || null
    const previousBotName = existingConfig.LINE_BOT_NAME || null

    let nextBot: Awaited<ReturnType<typeof fetchLineBotInfo>> | null = null
    let isBotRotation = false

    if (isReplacingToken) {
      nextBot = await fetchLineBotInfo(values.lineChannelAccessToken!)
      const hasActiveTargets = await prisma.line_targets.count({ where: { is_active: true } }) > 0
      const isDifferentKnownBot = Boolean(previousBasicId && previousBasicId !== nextBot.basicId)
      const isUnidentifiedExistingBot = Boolean(!previousBasicId && previousToken && previousToken !== values.lineChannelAccessToken && hasActiveTargets)
      isBotRotation = isDifferentKnownBot || isUnidentifiedExistingBot

      if (isBotRotation && !values.confirmBotChange) {
        return NextResponse.json({
          code: 'LINE_BOT_CHANGE_CONFIRMATION_REQUIRED',
          previousBot: { basicId: previousBasicId, name: previousBotName },
          nextBot: { basicId: nextBot.basicId, name: nextBot.botName },
        }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS })
      }
    }

    const updates = [
      { key: 'LINE_DEFAULT_TARGET_ID', value: isBotRotation ? null : values.lineDefaultTargetId || null },
      { key: 'WEIGHT_TICKET_PDF_BUCKET', value: values.pdfBucket },
      { key: 'NEXT_PUBLIC_APP_URL', value: values.appUrl || null },
      { key: 'GOOGLE_SHEETS_WEBHOOK_URL', value: values.googleSheetsWebhookUrl || null },
      { key: 'LINE_AUTO_SEND', value: legacyAutoSend ? 'true' : 'false' },
      { key: 'LINE_AUTO_SEND_WTI', value: lineAutoSendWti ? 'true' : 'false' },
      { key: 'LINE_AUTO_SEND_WTO', value: lineAutoSendWto ? 'true' : 'false' },
      { key: 'LINE_NOTIFY_TEXT_TEMPLATE_WTI', value: values.lineNotifyTextTemplateWti || null },
      { key: 'LINE_NOTIFY_TEXT_TEMPLATE_WTO', value: values.lineNotifyTextTemplateWto || null },
      { key: 'LINE_ALBUM_SHOW_BADGES', value: values.lineAlbumShowBadges ? 'true' : 'false' },
      { key: 'LINE_ALBUM_SHOW_TIMESTAMPS', value: values.lineAlbumShowTimestamps ? 'true' : 'false' },
      { key: 'LINE_ALBUM_QUALITY', value: String(values.lineAlbumQuality) },
      { key: 'DAILY_REPORT_AUTO_SEND', value: values.dailyReportAutoSend ? 'true' : 'false' },
      { key: 'DAILY_REPORT_SCHEDULE_TIME', value: values.dailyReportScheduleTime || '18:00' },
      { key: 'MONTHLY_REPORT_AUTO_SEND', value: values.monthlyReportAutoSend !== false ? 'true' : 'false' },
      { key: 'MONTHLY_REPORT_SCHEDULE_TIME', value: values.monthlyReportScheduleTime || '08:00' },
      { key: 'MONTHLY_REPORT_DAY', value: values.monthlyReportDay || '1' },
    ]

    if (!isMasked(values.lineChannelAccessToken)) {
      updates.push({ key: 'LINE_CHANNEL_ACCESS_TOKEN', value: values.lineChannelAccessToken || null })
    }
    if (!isMasked(values.lineChannelSecret)) {
      updates.push({ key: 'LINE_CHANNEL_SECRET', value: values.lineChannelSecret || null })
    }

    if (nextBot) {
      updates.push(
        { key: 'LINE_BOT_BASIC_ID', value: nextBot.basicId },
        { key: 'LINE_BOT_NAME', value: nextBot.botName },
      )
    }

    const transactionOperations: Prisma.PrismaPromise<unknown>[] = updates.map((item) =>
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

    if (isBotRotation) {
      transactionOperations.push(
        prisma.line_targets.updateMany({
          data: { is_active: false, is_default: false, last_event_type: 'oa_changed' },
        }),
        prisma.line_notification_rules.updateMany({
          data: { is_active: false, updated_at: new Date() },
        }),
      )
    }

    await prisma.$transaction(transactionOperations)

    // Auto-sync targets เมื่อมีการเปลี่ยน token จริง (ไม่ใช่ masked placeholder)
    // sync ล้มเหลวไม่ทำให้การบันทึก token ล้มเหลวด้วย — คืน warning ไปแค่นั้น
    let syncWarning: string | null = null
    if (isReplacingToken && !isBotRotation) {
      try {
        await syncLineTargetsFromAPI(values.lineChannelAccessToken!)
      } catch (err) {
        syncWarning = err instanceof Error ? err.message : 'sync กลุ่ม LINE ล้มเหลว'
        console.error('[line-settings] auto-sync targets failed', err)
      }
    }

    return NextResponse.json({
      ok: true,
      requiresTargetRegistration: isBotRotation,
      syncWarning,
    }, { headers: PRIVATE_NO_STORE_HEADERS })
  } catch (caught) {
    if (caught instanceof AuthContextError) return privateAuthErrorResponse(caught)
    return privateApiErrorResponse(caught, 'บันทึกข้อมูลตั้งค่า LINE ไม่สำเร็จ', 400)
  }
}
