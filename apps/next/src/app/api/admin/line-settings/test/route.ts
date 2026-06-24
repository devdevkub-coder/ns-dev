import { NextResponse } from 'next/server'
import { z } from 'zod'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { notifyWeightTicketLine } from '@/lib/server/weight-ticket-line-notification'
import { currentActor } from '@/lib/server/daily'

export const runtime = 'nodejs'

const testSchema = z.object({
  token: z.string().trim().optional().nullable().or(z.literal('')),
  targetId: z.string().trim().optional().nullable().or(z.literal('')),
  documentNo: z.string().trim().optional().nullable().or(z.literal('')),
  customMessage: z.string().trim().optional().nullable().or(z.literal('')),
})

export async function POST(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    const body = await request.json()
    const { token, targetId, documentNo, customMessage } = testSchema.parse(body)

    let finalToken = token
    if (!finalToken || finalToken === '••••••••••••••••' || finalToken.includes('••')) {
      const config = await prisma.system_settings.findUnique({
        where: { key: 'LINE_CHANNEL_ACCESS_TOKEN' },
      })
      finalToken = config?.value || ''
    }

    let finalTargetId = targetId
    if (!finalTargetId) {
      // Fallback to the latest registered group
      const latestGroup = await prisma.line_groups.findFirst({
        orderBy: { updated_at: 'desc' },
      })
      if (latestGroup) {
        finalTargetId = latestGroup.group_id
      } else {
        // Fallback to default target settings in DB
        const config = await prisma.system_settings.findUnique({
          where: { key: 'LINE_DEFAULT_TARGET_ID' },
        })
        finalTargetId = config?.value || ''
      }
    }

    if (documentNo) {
      const actor = currentActor(context)
      const res = await notifyWeightTicketLine(documentNo, {
        force: true,
        targetId: finalTargetId || undefined,
        customMessage: customMessage || undefined,
        requestedBy: actor,
        origin: request.headers.get('origin') || '',
        scopedBranchIds: [],
      })

      if (res.status !== 200 && res.status !== 201) {
        throw new Error(res.error || 'ส่ง LINE Notification ไม่สำเร็จ')
      }

      return NextResponse.json({ ok: true })
    }

    if (!finalTargetId) {
      throw new Error('ไม่พบข้อมูลกลุ่มไลน์ปลายทาง กรุณาเชิญบอทเข้ากลุ่มก่อนทดสอบ หรือตั้งค่า Target ID ด้วยตนเอง')
    }

    if (!finalToken) {
      throw new Error('กรุณากรอก LINE Channel Access Token หรือบันทึกในระบบก่อนทดสอบ')
    }

    const mockFlexMessage = {
      type: 'flex',
      altText: 'ใบรับของ WTI012606-0001 | ผู้ขาย: ร้านค้าทดสอบ (LINE Test) | สุทธิ 14,500 กก.',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: 'WTI (ใบรับของ)', weight: 'bold', size: 'sm', color: '#0f766e' },
            { type: 'text', text: 'WTI012606-0001', weight: 'bold', size: 'lg', color: '#111827', wrap: true },
            { type: 'text', text: '🔔 ทดสอบระบบแจ้งเตือน LINE Official Account สำเร็จ!', margin: 'sm', size: 'sm', color: '#475569', wrap: true },
            { type: 'separator', margin: 'md' },
            {
              type: 'box',
              layout: 'baseline',
              margin: 'md',
              contents: [
                { type: 'text', text: 'ผู้ขาย', color: '#64748b', size: 'sm', flex: 2 },
                { type: 'text', text: 'ร้านค้าทดสอบ (LINE Test)', color: '#111827', size: 'sm', flex: 5, wrap: true }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              margin: 'sm',
              contents: [
                { type: 'text', text: 'สาขา', color: '#64748b', size: 'sm', flex: 2 },
                { type: 'text', text: 'สำนักงานใหญ่ (HQ)', color: '#111827', size: 'sm', flex: 5, wrap: true }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              margin: 'sm',
              contents: [
                { type: 'text', text: 'ทะเบียนรถ', color: '#64748b', size: 'sm', flex: 2 },
                { type: 'text', text: 'กข 1234 กรุงเทพ', color: '#111827', size: 'sm', flex: 5, wrap: true }
              ]
            },
            {
              type: 'box',
              layout: 'baseline',
              margin: 'sm',
              contents: [
                { type: 'text', text: 'สุทธิ', color: '#64748b', size: 'sm', flex: 2 },
                { type: 'text', text: '14,500 กก.', color: '#0f766e', size: 'md', flex: 5, weight: 'bold' }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#0f766e',
              action: {
                type: 'uri',
                label: 'เปิด PDF (ตัวอย่าง)',
                uri: 'https://ns-dev.devkub.com'
              }
            },
            {
              type: 'button',
              style: 'secondary',
              action: {
                type: 'uri',
                label: 'เปิดในระบบ',
                uri: 'https://ns-dev.devkub.com/daily/weight-ticket-list'
              }
            }
          ]
        }
      }
    }

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${finalToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: finalTargetId,
        messages: [mockFlexMessage],
      }),
    })

    if (!response.ok) {
      const errBody = await response.text()
      throw new Error(`ส่งข้อความไม่สำเร็จ (${response.status}): ${errBody}`)
    }

    return NextResponse.json({ ok: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ทดสอบส่งข้อความไม่สำเร็จ', 400)
  }
}
