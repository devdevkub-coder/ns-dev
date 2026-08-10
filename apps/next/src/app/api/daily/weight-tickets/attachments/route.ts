import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { after, NextResponse } from 'next/server'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, hasPermission } from '@/lib/server/auth-context'
import { withAuthNoStore } from '@/lib/server/auth-response'
import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import {
  WEIGHT_TICKET_IMAGE_IMMUTABLE_CACHE_SECONDS,
  resolveWeightTicketImageBucket,
  resolveWeightTicketImageProcessingConfig,
  resolveWeightTicketImageUploadConfig,
} from '@/lib/server/weight-ticket-storage'
import { processWeightTicketThumbnailAsset } from '@/lib/server/weight-ticket-thumbnail-jobs'

export const runtime = 'nodejs'

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

async function validateImageMetadata(bytes: Buffer, maxSourcePixels: number) {
  const metadata = await sharp(bytes, { failOn: 'error', limitInputPixels: maxSourcePixels }).metadata()
  const width = metadata.width
  const height = metadata.height
  const sourcePixels = width && height ? width * height : 0
  if (!width || !height || !Number.isSafeInteger(sourcePixels) || sourcePixels > maxSourcePixels) {
    throw new Error(`รูปมีความละเอียดสูงเกินกว่าที่ระบบรองรับ (${maxSourcePixels.toLocaleString('en-US')} พิกเซล)`)
  }
  return { height, width }
}

function safeFileName(value: string) {
  const cleaned = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-')
  const fileName = cleaned.replace(/^-+|-+$/g, '')
  if (!fileName) throw new Error('ชื่อไฟล์รูปภาพไม่ถูกต้อง')
  return fileName
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
      return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: 'กรุณาเลือกไฟล์รูปภาพ' }, { status: 400 }))
    }
    const extension = ALLOWED_IMAGE_TYPES.get(file.type)
    if (!extension) {
      return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: 'รองรับเฉพาะไฟล์ JPEG, PNG และ WebP' }, { status: 400 }))
    }
    const uploadConfig = await resolveWeightTicketImageUploadConfig()
    const processingConfig = await resolveWeightTicketImageProcessingConfig()
    if (file.size <= 0 || file.size > uploadConfig.maxUploadBytes) {
      return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: `รูปภาพต้องมีขนาดไม่เกิน ${(uploadConfig.maxUploadBytes / (1024 * 1024)).toLocaleString('th-TH')} MB` }, { status: 400 }))
    }
    const fileBytes = Buffer.from(await file.arrayBuffer())
    if (!matchesImageSignature(fileBytes, file.type)) {
      return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: 'ชนิดไฟล์รูปภาพไม่ตรงกับข้อมูลจริง' }, { status: 400 }))
    }
    let sourceDimensions: { height: number; width: number }
    try {
      sourceDimensions = await validateImageMetadata(fileBytes, processingConfig.maxSourcePixels)
    } catch (error) {
      return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: error instanceof Error ? error.message : 'รูปภาพอ่านไม่ได้' }, { status: 400 }))
    }

    const bucket = await resolveWeightTicketImageBucket()
    const supabase = getSupabaseAdminClient()
    if (!bucket || !supabase) {
      return withAuthNoStore(NextResponse.json({ code: 'CONFIGURATION_ERROR', error: 'ยังไม่ได้ตั้งค่า Storage สำหรับไฟล์แนบ WTI/WTO' }, { status: 503 }))
    }

    const fileName = safeFileName(file.name)
    const storageBase = `attachments/pending/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`
    const storageKey = `${storageBase}.${extension}`
    const thumbnailStorageKey = `${storageBase}.thumb.webp`
    const originalUpload = await supabase.storage.from(bucket).upload(storageKey, fileBytes, {
      cacheControl: String(WEIGHT_TICKET_IMAGE_IMMUTABLE_CACHE_SECONDS),
      contentType: file.type,
      upsert: false,
    })
    if (originalUpload.error) {
      await supabase.storage.from(bucket).remove([storageKey]).catch(() => undefined)
      throw new Error(`Storage upload failed: ${originalUpload.error.message}`)
    }

    let asset: { id: bigint; thumbnail_status: string }
    try {
      asset = await prisma.weight_ticket_image_assets.create({
        data: {
          bucket,
          byte_size: BigInt(file.size),
          file_name: fileName,
          mime_type: file.type,
          original_storage_key: storageKey,
          source_height: sourceDimensions.height,
          source_width: sourceDimensions.width,
          thumbnail_status: 'queued',
          thumbnail_storage_key: thumbnailStorageKey,
          uploaded_by: auth.authUser.id,
        },
        select: { id: true, thumbnail_status: true },
      })
    } catch (caught) {
      await supabase.storage.from(bucket).remove([storageKey]).catch(() => undefined)
      throw caught
    }

    after(async () => {
      try {
        const result = await processWeightTicketThumbnailAsset(asset.id)
        if (result.status === 'failed') {
          console.error('[weight_ticket_thumbnail] job failed', { assetId: String(asset.id), storageKey })
        }
      } catch (caught) {
        console.error('[weight_ticket_thumbnail] job crashed', {
          assetId: String(asset.id),
          error: caught instanceof Error ? caught.message : String(caught),
          storageKey,
        })
      }
    })

    return withAuthNoStore(NextResponse.json({
      bucket,
      fileName,
      storageKey,
      thumbnailStatus: asset.thumbnail_status,
      thumbnailStorageKey,
    }, { status: 201 }))
  } catch (caught) {
    if (caught instanceof AuthContextError) return withAuthNoStore(authContextErrorResponse(caught))
    return withAuthNoStore(apiErrorResponse(caught, 'อัปโหลดไฟล์แนบ WTI/WTO ไม่สำเร็จ', 500))
  }
}

export async function GET() {
  try {
    const auth = await getCurrentAuthContext()
    if (!hasPermission(auth, 'daily.weight_tickets.create') && !hasPermission(auth, 'daily.weight_tickets.update')) {
      throw new AuthContextError('ไม่มีสิทธิ์อ่านการตั้งค่าอัปโหลดไฟล์แนบใบรับ-ส่งของ', 403)
    }
    return withAuthNoStore(NextResponse.json(await resolveWeightTicketImageUploadConfig()))
  } catch (caught) {
    if (caught instanceof AuthContextError) return withAuthNoStore(authContextErrorResponse(caught))
    return withAuthNoStore(apiErrorResponse(caught, 'โหลดการตั้งค่าอัปโหลดไฟล์แนบ WTI/WTO ไม่สำเร็จ', 500))
  }
}
