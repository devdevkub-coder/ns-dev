import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, hasPermission } from '@/lib/server/auth-context'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { resolveWeightTicketImageBucket } from '@/lib/server/weight-ticket-storage'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

function safeFileName(value: string) {
  const cleaned = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-')
  return cleaned.replace(/^-+|-+$/g, '') || 'image'
}

export async function POST(request: Request) {
  try {
    const auth = await getCurrentAuthContext()
    if (!hasPermission(auth, 'daily.weight_tickets.create') && !hasPermission(auth, 'daily.weight_tickets.update')) {
      throw new AuthContextError('ไม่มีสิทธิ์อัปโหลดไฟล์แนบใบรับ-ส่งของ', 403)
    }

    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'กรุณาเลือกไฟล์รูปภาพ' }, { status: 400 })
    }
    const extension = ALLOWED_IMAGE_TYPES.get(file.type)
    if (!extension) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'รองรับเฉพาะไฟล์ JPEG, PNG และ WebP' }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'รูปภาพต้องมีขนาดไม่เกิน 10 MB' }, { status: 400 })
    }

    const bucket = await resolveWeightTicketImageBucket()
    const supabase = getSupabaseAdminClient()
    if (!bucket || !supabase) {
      return NextResponse.json({ code: 'CONFIGURATION_ERROR', error: 'ยังไม่ได้ตั้งค่า Storage สำหรับไฟล์แนบ WTI/WTO' }, { status: 503 })
    }

    const fileName = safeFileName(file.name)
    const storageKey = `attachments/pending/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`
    const { error } = await supabase.storage.from(bucket).upload(storageKey, Buffer.from(await file.arrayBuffer()), {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    })
    if (error) throw new Error(`Storage upload failed: ${error.message}`)

    const { data, error: signedUrlError } = await supabase.storage.from(bucket).createSignedUrl(storageKey, 60 * 60 * 24 * 365)
    if (signedUrlError || !data?.signedUrl) {
      throw new Error(`Storage signed URL failed: ${signedUrlError?.message ?? 'ไม่สามารถสร้าง signed URL ได้'}`)
    }
    return NextResponse.json({ bucket, fileName, storageKey, url: data.signedUrl }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'อัปโหลดไฟล์แนบ WTI/WTO ไม่สำเร็จ', 500)
  }
}
