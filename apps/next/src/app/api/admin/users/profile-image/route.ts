import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, hasPermission } from '@/lib/server/auth-context'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'

const PROFILE_IMAGE_BUCKET = 'user-profile-images'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

function storageKeyFromUrl(value: string) {
  try {
    const url = new URL(value)
    const prefix = `/storage/v1/object/public/${PROFILE_IMAGE_BUCKET}/`
    return url.pathname.startsWith(prefix) ? decodeURIComponent(url.pathname.slice(prefix.length)) : null
  } catch {
    return null
  }
}

async function requireUserManagement() {
  const auth = await getCurrentAuthContext()
  if (!hasPermission(auth, 'system.users.manage')) {
    throw new AuthContextError('ไม่มีสิทธิ์จัดการรูป profile ผู้ใช้งาน', 403)
  }
}

export async function POST(request: Request) {
  try {
    await requireUserManagement()
    const formData = await request.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'กรุณาเลือกไฟล์รูป profile' }, { status: 400 })
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'รองรับเฉพาะไฟล์ JPEG, PNG และ WebP' }, { status: 400 })
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ code: 'BAD_REQUEST', error: 'รูป profile ต้องมีขนาดไม่เกิน 10 MB' }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    if (!supabase) {
      return NextResponse.json({ code: 'CONFIGURATION_ERROR', error: 'ยังไม่ได้ตั้งค่า Storage สำหรับรูป profile' }, { status: 503 })
    }

    const extension = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1]
    const storageKey = `profiles/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`
    const { error } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(storageKey, Buffer.from(await file.arrayBuffer()), {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    })
    if (error) throw new Error(`Storage upload failed: ${error.message}`)

    const { data } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(storageKey)
    return NextResponse.json({ storageKey, url: data.publicUrl }, { status: 201 })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'อัปโหลดรูป profile ไม่สำเร็จ', 500)
  }
}

export async function DELETE(request: Request) {
  try {
    await requireUserManagement()
    const body = await request.json() as { url?: unknown }
    const storageKey = typeof body.url === 'string' ? storageKeyFromUrl(body.url) : null
    if (!storageKey) return NextResponse.json({ code: 'BAD_REQUEST', error: 'รูป profile ที่ต้องการลบไม่ถูกต้อง' }, { status: 400 })

    const supabase = getSupabaseAdminClient()
    if (!supabase) return NextResponse.json({ code: 'CONFIGURATION_ERROR', error: 'ยังไม่ได้ตั้งค่า Storage สำหรับรูป profile' }, { status: 503 })
    const { error } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove([storageKey])
    if (error) throw new Error(`Storage delete failed: ${error.message}`)
    return NextResponse.json({ deleted: true })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ลบรูป profile ไม่สำเร็จ', 500)
  }
}
