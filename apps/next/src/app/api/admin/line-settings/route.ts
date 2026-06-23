import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { currentActor } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

const settingsSchema = z.object({
  lineChannelAccessToken: z.string().trim().nullable().or(z.literal('')),
  lineChannelSecret: z.string().trim().nullable().or(z.literal('')),
  lineDefaultTargetId: z.string().trim().nullable().or(z.literal('')),
  pdfBucket: z.string().trim().min(1, 'ระบุชื่อ Storage Bucket'),
  appUrl: z.string().trim().url('URL ไม่ถูกต้อง').or(z.literal('')),
  lineAutoSend: z.boolean().default(false),
  googleSheetsWebhookUrl: z.string().trim().url('URL ไม่ถูกต้อง').or(z.literal('')).nullable().or(z.literal('')),
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
            'GOOGLE_SHEETS_WEBHOOK_URL',
          ],
        },
      },
    })

    const configMap = Object.fromEntries(dbSettings.map((s) => [s.key, s.value]))

    return NextResponse.json({
      lineChannelAccessToken: configMap.LINE_CHANNEL_ACCESS_TOKEN || '',
      lineChannelSecret: configMap.LINE_CHANNEL_SECRET || '',
      lineDefaultTargetId: configMap.LINE_DEFAULT_TARGET_ID || '',
      pdfBucket: configMap.WEIGHT_TICKET_PDF_BUCKET || 'weight-ticket-pdfs',
      appUrl: configMap.NEXT_PUBLIC_APP_URL || '',
      lineAutoSend: configMap.LINE_AUTO_SEND === 'true',
      googleSheetsWebhookUrl: configMap.GOOGLE_SHEETS_WEBHOOK_URL || '',
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

    const updates = [
      { key: 'LINE_CHANNEL_ACCESS_TOKEN', value: values.lineChannelAccessToken || null },
      { key: 'LINE_CHANNEL_SECRET', value: values.lineChannelSecret || null },
      { key: 'LINE_DEFAULT_TARGET_ID', value: values.lineDefaultTargetId || null },
      { key: 'WEIGHT_TICKET_PDF_BUCKET', value: values.pdfBucket },
      { key: 'NEXT_PUBLIC_APP_URL', value: values.appUrl || null },
      { key: 'LINE_AUTO_SEND', value: values.lineAutoSend ? 'true' : 'false' },
      { key: 'GOOGLE_SHEETS_WEBHOOK_URL', value: values.googleSheetsWebhookUrl || null },
    ]

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

    return NextResponse.json({ ok: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'บันทึกข้อมูลตั้งค่า LINE ไม่สำเร็จ', 400)
  }
}
