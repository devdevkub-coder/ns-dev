import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { withAuthNoStore } from '@/lib/server/auth-response'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { branchScopeIds, findScopedWeightTicket } from '@/lib/server/weight-tickets'
import { assertWeightTicketImageStorageKey, resolveWeightTicketImageBucket, WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS } from '@/lib/server/weight-ticket-storage'
import { decodeStoredImageAsset } from '@/lib/weight-tickets'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const storageKey = new URL(request.url).searchParams.get('storageKey')?.trim() ?? ''
    if (!storageKey) {
      return withAuthNoStore(NextResponse.json({ code: 'INVALID_STORAGE_KEY', error: 'ไม่พบ storage key ของรูปต้นฉบับ' }, { status: 400 }))
    }

    const ticket = await findScopedWeightTicket(id, branchScopeIds(auth))
    if (!ticket) return withAuthNoStore(NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 }))

    const requestedKey = assertWeightTicketImageStorageKey(storageKey)
    const bucket = await resolveWeightTicketImageBucket()
    const referencedKeys = [
      ...(ticket.vehicle_image_names ?? []),
      ...ticket.weight_ticket_lines.flatMap((line) => line.image_names ?? []),
    ]
      .map((rawValue) => decodeStoredImageAsset(rawValue))
      .flatMap((asset) => asset.bucket === bucket && asset.storageKey
        ? [assertWeightTicketImageStorageKey(asset.storageKey)]
        : [])

    if (!referencedKeys.includes(requestedKey)) {
      return withAuthNoStore(NextResponse.json({ code: 'NOT_FOUND', error: 'รูปต้นฉบับไม่ได้อยู่ในใบรับ-ส่งของนี้' }, { status: 404 }))
    }

    const supabase = getSupabaseAdminClient()
    if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Storage สำหรับโหลดรูปต้นฉบับ')
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(requestedKey, WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS)
    if (error || !data?.signedUrl) throw new Error(`สร้าง signed URL รูปต้นฉบับไม่สำเร็จ: ${error?.message ?? 'ไม่พบ signed URL'}`)

    return withAuthNoStore(NextResponse.json({ url: data.signedUrl }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return withAuthNoStore(authContextErrorResponse(caught))
    return withAuthNoStore(apiErrorResponse(caught, 'โหลดรูปต้นฉบับใบรับ-ส่งของไม่ได้', 500))
  }
}
