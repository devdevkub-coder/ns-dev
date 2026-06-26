import { prisma } from '@/lib/server/prisma'

/**
 * LINE Target Sync Helpers
 *
 * LINE Messaging API ไม่มี endpoint "list ทุกกลุ่มที่บอทอยู่" ดังนั้นการ sync
 * ทำได้แค่ refresh ข้อมูลกลุ่ม/ผู้ใช้ที่รู้ target_id อยู่แล้ว โดยเรียก
 * /v2/bot/group/{id}/summary หรือ /v2/bot/profile/{id} ตามประเภท
 *
 * กลุ่มใหม่ที่บอทยังไม่เคยได้รับ webhook event จะดึงมาไม่ได้ที่นี่
 * (ต้องเข้าระบบผ่าน webhook route ก่อน)
 */

const LINE_API_BASE = 'https://api.line.me/v2/bot'
const SYNC_DELAY_MS = 120 // เคารพ rate limit ระหว่างแต่ละ target

export type LineTargetType = 'group' | 'room' | 'user'

export interface LineBotInfo {
  botName: string
  basicId: string
  pictureUrl: string | null
}

export interface LineTargetSyncSummary {
  total: number
  refreshed: number
  notFound: number
  failed: number
  bot: LineBotInfo | null
}

/**
 * ดึงข้อมูลบอท (Official Account) จาก /v2/bot/info
 * ใช้ร่วมกันระหว่าง test-connection และ sync flow
 */
export async function fetchLineBotInfo(token: string): Promise<LineBotInfo> {
  if (!token) {
    throw new Error('กรุณาระบุ Channel Access Token ก่อนเชื่อมต่อ LINE')
  }

  const response = await fetch(`${LINE_API_BASE}/info`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`เชื่อมต่อ LINE OA ไม่สำเร็จ (${response.status}): ${errText}`)
  }

  const body = (await response.json()) as {
    displayName: string
    basicId: string
    pictureUrl?: string
  }

  return {
    botName: body.displayName,
    basicId: body.basicId,
    pictureUrl: body.pictureUrl || null,
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * เช็คว่า token ที่ส่งมาเป็น masked placeholder หรือไม่ (กรณีมาจาก form)
 */
export function isMaskedToken(token: string | null | undefined): boolean {
  if (!token) return false
  return token.includes('••') || token === '••••••••••••••••'
}

/**
 * ดึง token จาก body ถ้าไม่ใช่ masked ถ้าเป็น masked หรือว่าง ให้ดึงจาก DB
 */
export async function resolveLineAccessToken(
  submittedToken: string | null | undefined
): Promise<string> {
  if (submittedToken && !isMaskedToken(submittedToken)) {
    return submittedToken
  }

  const config = await prisma.system_settings.findUnique({
    where: { key: 'LINE_CHANNEL_ACCESS_TOKEN' },
  })
  return config?.value || ''
}

interface EnrichmentResult {
  name: string | null
  pictureUrl: string | null
  /** 'ok' = พบข้อมูล, 'not_found' = บอทไม่ได้อยู่ในกลุ่ม/ไม่ใช่เพื่อนแล้ว, 'error' = LINE ตอบผิดพลาด */
  status: 'ok' | 'not_found' | 'error'
  /** true เฉพาะเมื่อ LINE บอกว่า token ใช้ไม่ได้ ควรหยุด sync ทั้งลูป */
  unauthorized: boolean
}

async function enrichTarget(
  targetId: string,
  targetType: LineTargetType,
  token: string
): Promise<EnrichmentResult> {
  // room ไม่มี summary endpoint ใน LINE API เก็บ placeholder ไว้
  if (targetType === 'room') {
    return {
      name: `ห้องไลน์ ${targetId.slice(0, 6)}...`,
      pictureUrl: null,
      status: 'ok',
      unauthorized: false,
    }
  }

  const endpoint =
    targetType === 'group'
      ? `${LINE_API_BASE}/group/${encodeURIComponent(targetId)}/summary`
      : `${LINE_API_BASE}/profile/${encodeURIComponent(targetId)}`

  const response = await fetch(endpoint, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })

  // 401/403 ที่ /info หรือ /summary/profile: token ใช้ไม่ได้ → หยุดทั้งลูป
  if (response.status === 401 || response.status === 403) {
    return {
      name: null,
      pictureUrl: null,
      status: 'error',
      unauthorized: true,
    }
  }

  // 404/400 ที่ group summary: บอทออกจากกลุ่มแล้ว หรือไม่ได้เป็นเพื่อนกับ user
  if (response.status === 404 || response.status === 400) {
    return {
      name: null,
      pictureUrl: null,
      status: 'not_found',
      unauthorized: false,
    }
  }

  if (!response.ok) {
    return {
      name: null,
      pictureUrl: null,
      status: 'error',
      unauthorized: false,
    }
  }

  const body = (await response.json()) as {
    groupName?: string
    displayName?: string
    pictureUrl?: string
  }

  const name =
    targetType === 'group'
      ? body.groupName || null
      : body.displayName || null

  return {
    name,
    pictureUrl: body.pictureUrl || null,
    status: 'ok',
    unauthorized: false,
  }
}

/**
 * Sync กลุ่ม/ผู้ใช้ทั้งหมดในตาราง line_targets กับ LINE API
 *
 * - อัปเดต display_name, picture_url, last_seen_at ของกลุ่มที่ยังอยู่
 * - ตั้ง is_active=false, last_event_type='not_found' ของกลุ่มที่บอทออกแล้ว
 * - คืนค่าสถิติรวม + ข้อมูลบอท (ถ้าดึงได้)
 *
 * @throws เฉพาะเมื่อ token ใช้ไม่ได้ (unauthorized) เพื่อให้ caller ตัดสินใจต่อ
 */
export async function syncLineTargetsFromAPI(
  token: string
): Promise<LineTargetSyncSummary> {
  if (!token) {
    throw new Error('กรุณาระบุ LINE Channel Access Token ก่อน sync')
  }

  const targets = await prisma.line_targets.findMany({
    orderBy: { created_at: 'asc' },
  })

  const summary: LineTargetSyncSummary = {
    total: targets.length,
    refreshed: 0,
    notFound: 0,
    failed: 0,
    bot: null,
  }

  // ดึงข้อมูลบอทก่อน (เป็นการตรวจ token ไปในตัว) — ถ้า unauthorized โยนทันที
  try {
    summary.bot = await fetchLineBotInfo(token)
  } catch (err) {
    // ถ้าเป็น 401/403 ถือว่า token ใช้ไม่ได้ หยุด sync ทั้งลูป
    if (err instanceof Error && /401|403/.test(err.message)) {
      throw err
    }
    // error อื่นๆ (เช่น network) ไม่ block sync รายการ — แค่ไม่มี bot info
    console.error('[line-target-sync] fetch bot info failed', err)
  }

  for (const target of targets) {
    const result = await enrichTarget(target.target_id, target.target_type as LineTargetType, token)

    if (result.unauthorized) {
      throw new Error('LINE Channel Access Token ใช้งานไม่ได้ (401/403)')
    }

    if (result.status === 'ok' && result.name) {
      await prisma.line_targets.update({
        where: { id: target.id },
        data: {
          display_name: result.name,
          picture_url: result.pictureUrl,
          last_seen_at: new Date(),
          last_event_type: 'sync',
          is_active: true,
          updated_at: new Date(),
        },
      })
      summary.refreshed += 1
    } else if (result.status === 'not_found') {
      await prisma.line_targets.update({
        where: { id: target.id },
        data: {
          last_seen_at: new Date(),
          last_event_type: 'not_found',
          is_active: false,
          updated_at: new Date(),
        },
      })
      summary.notFound += 1
    } else {
      // error อื่นๆ (network, 5xx) ไม่แตะข้อมูลเดิม
      summary.failed += 1
    }

    await sleep(SYNC_DELAY_MS)
  }

  return summary
}
