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
import { cleanupWeightTicketImageAssets, processWeightTicketPrintAsset, processWeightTicketThumbnailAsset } from '@/lib/server/weight-ticket-thumbnail-jobs'

export const runtime = 'nodejs'

// Detect the real image format from magic bytes instead of trusting the
// declared MIME type. Phone galleries and chat apps (LINE/WhatsApp) routinely
// mislabel HEIC/PNG/WebP files as image/jpeg, so the signature must match the
// actual content, not the filename or declared type.
function detectRealImageFormat(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

const IMAGE_FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const IMAGE_FORMAT_TO_EXTENSION: Record<string, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
}

async function validateImageMetadata(bytes: Buffer, maxSourcePixels: number) {
  const metadata = await sharp(bytes, { failOn: 'error' }).metadata()
  const width = metadata.width
  const height = metadata.height
  const sourcePixels = width && height ? width * height : 0
  if (!width || !height || !Number.isSafeInteger(sourcePixels) || sourcePixels > maxSourcePixels) {
    throw new Error(`รูปมีความละเอียดสูงเกินกว่าที่ระบบรองรับ (สูงสุด ${(maxSourcePixels / 1_000_000).toLocaleString('th-TH')} ล้านพิกเซล) กรุณาเลือกรูปใหม่`)
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
    const uploadConfig = await resolveWeightTicketImageUploadConfig()
    const processingConfig = await resolveWeightTicketImageProcessingConfig()
    if (file.size <= 0 || file.size > uploadConfig.maxUploadBytes) {
      return withAuthNoStore(NextResponse.json({ code: 'BAD_REQUEST', error: `รูปภาพต้องมีขนาดไม่เกิน ${(uploadConfig.maxUploadBytes / (1024 * 1024)).toLocaleString('th-TH')} MB` }, { status: 400 }))
    }
    const fileBytes = Buffer.from(await file.arrayBuffer())
    // Detect the real format from the content. Declared MIME types from phone
    // galleries / chat apps are unreliable (HEIC often reported as image/jpeg).
    const realFormat = detectRealImageFormat(fileBytes)
    if (!realFormat) {
      // Not a plain JPEG/PNG/WebP by signature — could be HEIC/AVIF from a
      // phone. Let sharp probe it; if decodable we transcode to JPEG so the
      // evidence is stored in a browser-friendly, pipeline-supported format.
      let heicDecoded: { data: Buffer; height: number; width: number } | null = null
      try {
        const probe = sharp(fileBytes, { failOn: 'error' })
        const probeMeta = await probe.metadata()
        const width = probeMeta.width
        const height = probeMeta.height
        const sourcePixels = width && height ? width * height : 0
        if (!width || !height || !Number.isSafeInteger(sourcePixels) || sourcePixels > processingConfig.maxSourcePixels) {
          return withAuthNoStore(NextResponse.json({
            code: 'BAD_REQUEST',
            error: `รูปมีความละเอียดสูงเกินกว่าที่ระบบรองรับ (สูงสุด ${(processingConfig.maxSourcePixels / 1_000_000).toLocaleString('th-TH')} ล้านพิกเซล) กรุณาเลือกรูปใหม่`,
          }, { status: 400 }))
        }
        const jpeg = await probe.rotate().jpeg({ quality: 92 }).toBuffer({ resolveWithObject: true })
        heicDecoded = { data: jpeg.data, height, width }
      } catch {
        return withAuthNoStore(NextResponse.json({
          code: 'BAD_REQUEST',
          error: 'รูปภาพนี้เปิดไม่ได้หรือไม่ใช่ไฟล์รูปภาพที่รองรับ (รองรับ JPEG, PNG, WebP และ HEIC)' ,
        }, { status: 400 }))
      }
      // Store the transcoded JPEG (smaller + universally supported), using the
      // original file name with a .jpg extension.
      const fileName = safeFileName(file.name.replace(/\.(heic|heif|avif)$/i, '') + '.jpg')
      const storageBase = `attachments/pending/${new Date().toISOString().slice(0, 10)}/${randomUUID()}`
      const storageKey = `${storageBase}.jpg`
      const thumbnailStorageKey = `${storageBase}.thumb.webp`
      const printStorageKey = `${storageBase}.print.jpg`
      const bucket = await resolveWeightTicketImageBucket()
      const supabase = getSupabaseAdminClient()
      if (!bucket || !supabase) {
        return withAuthNoStore(NextResponse.json({ code: 'CONFIGURATION_ERROR', error: 'ยังไม่ได้ตั้งค่า Storage สำหรับไฟล์แนบ WTI/WTO' }, { status: 503 }))
      }
      const originalUpload = await supabase.storage.from(bucket).upload(storageKey, heicDecoded.data, {
        cacheControl: String(WEIGHT_TICKET_IMAGE_IMMUTABLE_CACHE_SECONDS),
        contentType: 'image/jpeg',
        upsert: false,
      })
      if (originalUpload.error) {
        await supabase.storage.from(bucket).remove([storageKey]).catch(() => undefined)
        throw new Error(`Storage upload failed: ${originalUpload.error.message}`)
      }
      let asset: { id: bigint; print_status: string; thumbnail_status: string }
      try {
        asset = await prisma.weight_ticket_image_assets.create({
          data: {
            bucket,
            byte_size: BigInt(heicDecoded.data.length),
            file_name: fileName,
            mime_type: 'image/jpeg',
            original_storage_key: storageKey,
            source_height: heicDecoded.height,
            source_width: heicDecoded.width,
            thumbnail_status: 'queued',
            thumbnail_storage_key: thumbnailStorageKey,
            print_status: 'queued',
            print_storage_key: printStorageKey,
            uploaded_by: auth.authUser.id,
          },
          select: { id: true, print_status: true, thumbnail_status: true },
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
        try {
          const result = await processWeightTicketPrintAsset(asset.id)
          if (result.status === 'failed') {
            console.error('[weight_ticket_print_image] job failed', { assetId: String(asset.id), storageKey })
          }
        } catch (caught) {
          console.error('[weight_ticket_print_image] job crashed', {
            assetId: String(asset.id),
            error: caught instanceof Error ? caught.message : String(caught),
            storageKey,
          })
        }
        try {
          await cleanupWeightTicketImageAssets()
        } catch (caught) {
          console.error('[weight_ticket_image_cleanup] cleanup crashed', {
            error: caught instanceof Error ? caught.message : String(caught),
          })
        }
      })
      return withAuthNoStore(NextResponse.json({
        bucket,
        fileName,
        storageKey,
        thumbnailStatus: asset.thumbnail_status,
        thumbnailStorageKey,
        printStatus: asset.print_status,
        printStorageKey,
      }, { status: 201 }))
    }

    const extension = IMAGE_FORMAT_TO_EXTENSION[realFormat]
    const mimeType = IMAGE_FORMAT_TO_MIME[realFormat]
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
    const printStorageKey = `${storageBase}.print.jpg`
    const originalUpload = await supabase.storage.from(bucket).upload(storageKey, fileBytes, {
      cacheControl: String(WEIGHT_TICKET_IMAGE_IMMUTABLE_CACHE_SECONDS),
      contentType: mimeType,
      upsert: false,
    })
    if (originalUpload.error) {
      await supabase.storage.from(bucket).remove([storageKey]).catch(() => undefined)
      throw new Error(`Storage upload failed: ${originalUpload.error.message}`)
    }

    let asset: { id: bigint; print_status: string; thumbnail_status: string }
    try {
      asset = await prisma.weight_ticket_image_assets.create({
        data: {
          bucket,
          byte_size: BigInt(fileBytes.length),
          file_name: fileName,
          mime_type: mimeType,
          original_storage_key: storageKey,
          source_height: sourceDimensions.height,
          source_width: sourceDimensions.width,
          thumbnail_status: 'queued',
          thumbnail_storage_key: thumbnailStorageKey,
          print_status: 'queued',
          print_storage_key: printStorageKey,
          uploaded_by: auth.authUser.id,
        },
        select: { id: true, print_status: true, thumbnail_status: true },
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
      try {
        const result = await processWeightTicketPrintAsset(asset.id)
        if (result.status === 'failed') {
          console.error('[weight_ticket_print_image] job failed', { assetId: String(asset.id), storageKey })
        }
      } catch (caught) {
        console.error('[weight_ticket_print_image] job crashed', {
          assetId: String(asset.id),
          error: caught instanceof Error ? caught.message : String(caught),
          storageKey,
        })
      }
      try {
        await cleanupWeightTicketImageAssets()
      } catch (caught) {
        console.error('[weight_ticket_image_cleanup] cleanup crashed', {
          error: caught instanceof Error ? caught.message : String(caught),
        })
      }
    })

    return withAuthNoStore(NextResponse.json({
      bucket,
      fileName,
      storageKey,
      thumbnailStatus: asset.thumbnail_status,
      thumbnailStorageKey,
      printStatus: asset.print_status,
      printStorageKey,
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
