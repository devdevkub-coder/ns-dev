import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, hasPermission } from '@/lib/server/auth-context'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { resolveWeightTicketImageBucket, WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS } from '@/lib/server/weight-ticket-storage'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])

function matchesImageSignature(bytes: Buffer, mimeType: string) {
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  return false
}

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
    const fileBytes = Buffer.from(await file.arrayBuffer())
    if (!matchesImageSignature(fileBytes, file.type)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'ชนิดไฟล์รูปภาพไม่ตรงกับข้อมูลจริง' }, { status: 400 })
    }

    const bucket = await resolveWeightTicketImageBucket()
    const supabase = getSupabaseAdminClient()
    if (!bucket || !supabase) {
      return NextResponse.json({ code: 'CONFIGURATION_ERROR', error: 'ยังไม่ได้ตั้งค่า Storage สำหรับไฟล์แนบ WTI/WTO' }, { status: 503 })
    }

    const fileName = safeFileName(file.name)
    const storageKey = `attachments/pending/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`
    const { error } = await supabase.storage.from(bucket).upload(storageKey, fileBytes, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    })
    if (error) throw new Error(`Storage upload failed: ${error.message}`)

    const { data, error: signedUrlError } = await supabase.storage.from(bucket).createSignedUrl(storageKey, WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS)
    if (signedUrlError || !data?.signedUrl) {
      throw new Error(`Storage signed URL failed: ${signedUrlError?.message ?? 'ไม่สามารถสร้าง signed URL ได้'}`)
    }
    return NextResponse.json({ bucket, fileName, storageKey, url: data.signedUrl }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'อัปโหลดไฟล์แนบ WTI/WTO ไม่สำเร็จ', 500)
  }
}
