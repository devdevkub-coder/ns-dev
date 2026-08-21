import 'server-only'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import {
  WEIGHT_TICKET_IMAGE_IMMUTABLE_CACHE_SECONDS,
  WEIGHT_TICKET_THUMBNAIL_WEBP_EFFORT,
  resolveWeightTicketImageProcessingConfig,
} from '@/lib/server/weight-ticket-storage'

export type WeightTicketThumbnailJobResult = {
  status: 'failed' | 'queued' | 'ready' | 'skipped'
}

type ThumbnailJobScope = {
  bucket?: string
  attachedTicketId?: bigint
}

function validatePrintDimensions(width: number | undefined, height: number | undefined, maxDimension: number): { width: number; height: number } {
  if (
    typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || width > maxDimension
    || height > maxDimension
    || width > 400
    || height > 400
  ) {
    throw new Error('รูปสำหรับพิมพ์หลังย่อยังมีขนาดเกินกรอบ 400 x 400 px')
  }
  return { width, height }
}

async function readExistingPrintDimensions(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  bucket: string,
  storageKey: string,
  expectedBytes: Buffer,
  maxDimension: number,
) {
  if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase สำหรับตรวจสอบรูปสำหรับพิมพ์ที่มีอยู่')
  const { data, error } = await supabase.storage.from(bucket).download(storageKey)
  if (error || !data) throw new Error(`ตรวจสอบรูปสำหรับพิมพ์ที่มีอยู่ไม่สำเร็จ: ${error?.message ?? 'ไม่พบไฟล์'}`)
  const existingBytes = Buffer.from(await data.arrayBuffer())
  if (!existingBytes.equals(expectedBytes)) {
    throw new Error('รูปสำหรับพิมพ์ที่มีอยู่ไม่ตรงกับ derivative ที่สร้างจากรูปต้นฉบับปัจจุบัน')
  }
  const metadata = await sharp(existingBytes, { failOn: 'error' }).metadata()
  if (metadata.format !== 'jpeg') throw new Error('รูปสำหรับพิมพ์ที่มีอยู่ไม่ใช่ JPEG')
  return validatePrintDimensions(metadata.width, metadata.height, maxDimension)
}

export async function selectWeightTicketThumbnailJobs(scope: ThumbnailJobScope = {}) {
  const config = await resolveWeightTicketImageProcessingConfig()
  const now = new Date()
  const staleLock = new Date(now.getTime() - config.lockTimeoutSeconds * 1000)
  return prisma.weight_ticket_image_assets.findMany({
    orderBy: { created_at: 'asc' },
    select: { id: true },
    take: config.drainBatchSize,
    where: {
      ...(scope.bucket ? { bucket: scope.bucket } : {}),
      ...(scope.attachedTicketId != null ? { attached_ticket_id: scope.attachedTicketId } : {}),
      attempt_count: { lt: config.maxAttempts },
      OR: [
        { thumbnail_status: 'queued', next_retry_at: { lte: now } },
        { thumbnail_status: 'processing', locked_at: { lt: staleLock } },
      ],
    },
  })
}

export async function drainWeightTicketThumbnailJobs(scope: ThumbnailJobScope = {}) {
  const jobs = await selectWeightTicketThumbnailJobs(scope)
  const results = await Promise.all(jobs.map(async ({ id }) => {
    try {
      return await processWeightTicketThumbnailAsset(id)
    } catch (error) {
      console.error('[weight_ticket_thumbnail] drain job crashed', {
        assetId: String(id),
        error: error instanceof Error ? error.message : String(error),
      })
      return { status: 'skipped' as const }
    }
  }))
  return { attempted: jobs.length, results }
}

export async function selectWeightTicketPrintJobs(scope: ThumbnailJobScope = {}) {
  const config = await resolveWeightTicketImageProcessingConfig()
  const now = new Date()
  const staleLock = new Date(now.getTime() - config.lockTimeoutSeconds * 1000)
  return prisma.weight_ticket_image_assets.findMany({
    orderBy: { created_at: 'asc' },
    select: { id: true },
    take: config.drainBatchSize,
    where: {
      ...(scope.bucket ? { bucket: scope.bucket } : {}),
      ...(scope.attachedTicketId != null ? { attached_ticket_id: scope.attachedTicketId } : {}),
      print_attempt_count: { lt: config.maxAttempts },
      OR: [
        {
          print_status: 'queued',
          print_next_retry_at: { lte: now },
          OR: [
            { print_locked_at: null },
            { print_locked_at: { lt: staleLock } },
          ],
        },
        { print_status: 'processing', print_locked_at: { lt: staleLock } },
      ],
    },
  })
}

export async function drainWeightTicketPrintJobs(scope: ThumbnailJobScope = {}) {
  const jobs = await selectWeightTicketPrintJobs(scope)
  const results = await Promise.all(jobs.map(async ({ id }) => {
    try {
      return await processWeightTicketPrintAsset(id)
    } catch (error) {
      console.error('[weight_ticket_print_image] drain job crashed', {
        assetId: String(id),
        error: error instanceof Error ? error.message : String(error),
      })
      return { status: 'skipped' as const }
    }
  }))
  return { attempted: jobs.length, results }
}

export async function drainWeightTicketImageJobs(scope: ThumbnailJobScope = {}) {
  const [thumbnail, print] = await Promise.all([
    drainWeightTicketThumbnailJobs(scope),
    drainWeightTicketPrintJobs(scope),
  ])
  return {
    attempted: thumbnail.attempted + print.attempted,
    results: [...thumbnail.results, ...print.results],
  }
}

export async function cleanupWeightTicketImageAssets() {
  const config = await resolveWeightTicketImageProcessingConfig()
  const cutoff = new Date(Date.now() - config.orphanRetentionSeconds * 1000)
  const candidates = await prisma.weight_ticket_image_assets.findMany({
    orderBy: { created_at: 'asc' },
    select: {
      bucket: true,
      id: true,
      original_storage_key: true,
      print_storage_key: true,
      thumbnail_storage_key: true,
    },
    take: config.drainBatchSize,
    where: { attached_ticket_id: null, created_at: { lt: cutoff }, locked_by: null, print_locked_by: null },
  })
  const results = [] as Array<{ id: bigint; status: 'deleted' | 'skipped' | 'failed'; error?: string }>
  for (const candidate of candidates) {
    const cleanupLock = `cleanup-${process.pid}-${randomUUID()}`
    const cleanupNow = new Date()
    const claimed = await prisma.weight_ticket_image_assets.updateMany({
      data: {
        locked_at: cleanupNow,
        locked_by: cleanupLock,
        print_locked_at: cleanupNow,
        print_locked_by: cleanupLock,
        updated_at: cleanupNow,
      },
      where: { attached_ticket_id: null, id: candidate.id, locked_by: null, print_locked_by: null },
    })
    if (claimed.count !== 1) {
      results.push({ id: candidate.id, status: 'skipped' })
      continue
    }
    try {
      const supabase = getSupabaseAdminClient()
      if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase สำหรับล้างรูปหลักฐานที่หมดอายุ')
      const { error } = await supabase.storage.from(candidate.bucket).remove([
        candidate.original_storage_key,
        candidate.thumbnail_storage_key,
        candidate.print_storage_key,
      ])
      if (error) throw new Error(error.message)
      const deleted = await prisma.weight_ticket_image_assets.deleteMany({
        where: { attached_ticket_id: null, id: candidate.id, locked_by: cleanupLock, print_locked_by: cleanupLock },
      })
      results.push({ id: candidate.id, status: deleted.count === 1 ? 'deleted' : 'skipped' })
    } catch (error) {
      await prisma.weight_ticket_image_assets.updateMany({
        data: {
          last_error: errorMessage(error).slice(0, 1000),
          locked_at: null,
          locked_by: null,
          print_locked_at: null,
          print_locked_by: null,
          updated_at: new Date(),
        },
        where: { id: candidate.id, locked_by: cleanupLock, print_locked_by: cleanupLock },
      })
      results.push({ id: candidate.id, status: 'failed', error: errorMessage(error) })
    }
  }
  return { attempted: candidates.length, results }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'ไม่สามารถสร้างรูป derivative ได้'
}

export async function processWeightTicketThumbnailAsset(assetId: bigint): Promise<WeightTicketThumbnailJobResult> {
  const config = await resolveWeightTicketImageProcessingConfig()
  const now = new Date()
  const staleLock = new Date(now.getTime() - config.lockTimeoutSeconds * 1000)
  const workerId = `thumbnail-${process.pid}-${randomUUID()}`
  const claimed = await prisma.weight_ticket_image_assets.updateMany({
    data: {
      attempt_count: { increment: 1 },
      last_error: null,
      locked_at: now,
      locked_by: workerId,
      thumbnail_status: 'processing',
      updated_at: now,
    },
    where: {
      attempt_count: { lt: config.maxAttempts },
      id: assetId,
      OR: [
        {
          thumbnail_status: 'queued',
          next_retry_at: { lte: now },
          OR: [
            { locked_at: null },
            { locked_at: { lt: staleLock } },
          ],
        },
        {
          locked_at: { lt: staleLock },
          thumbnail_status: 'processing',
        },
      ],
    },
  })
  if (claimed.count === 0) return { status: 'skipped' }

  const asset = await prisma.weight_ticket_image_assets.findUnique({ where: { id: assetId } })
  if (!asset) return { status: 'skipped' }

  try {
    const supabase = getSupabaseAdminClient()
    if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase สำหรับสร้าง thumbnail')
    const { data: originalBlob, error: downloadError } = await supabase.storage
      .from(asset.bucket)
      .download(asset.original_storage_key)
    if (downloadError || !originalBlob) {
      throw new Error(`ดาวน์โหลดรูปต้นฉบับไม่สำเร็จ: ${downloadError?.message ?? 'ไม่พบไฟล์ต้นฉบับ'}`)
    }

    const originalBytes = Buffer.from(await originalBlob.arrayBuffer())
    const source = sharp(originalBytes, {
      failOn: 'error',
    })
    const metadata = await source.metadata()
    const width = metadata.width
    const height = metadata.height
    const sourcePixels = width && height ? width * height : 0
    if (!width || !height || !Number.isSafeInteger(sourcePixels) || sourcePixels > config.maxSourcePixels) {
      throw new Error(`รูปมีความละเอียดสูงเกินกว่าที่ระบบรองรับ (สูงสุด ${(config.maxSourcePixels / 1_000_000).toLocaleString('th-TH')} ล้านพิกเซล)`)
    }

    const thumbnail = await source
      .rotate()
      .resize({
        fit: 'inside',
        height: config.maxDimension,
        kernel: 'lanczos3',
        withoutEnlargement: true,
        width: config.maxDimension,
      })
      .webp({ effort: WEIGHT_TICKET_THUMBNAIL_WEBP_EFFORT, quality: config.webpQuality, smartSubsample: true })
      .toBuffer({ resolveWithObject: true })

    if (asset.attempt_count > 1) {
      const { error: cleanupError } = await supabase.storage.from(asset.bucket).remove([asset.thumbnail_storage_key])
      if (cleanupError) throw new Error(`เตรียมพื้นที่ thumbnail สำหรับ retry ไม่สำเร็จ: ${cleanupError.message}`)
    }
    const { error: uploadError } = await supabase.storage.from(asset.bucket).upload(
      asset.thumbnail_storage_key,
      thumbnail.data,
      {
        cacheControl: String(WEIGHT_TICKET_IMAGE_IMMUTABLE_CACHE_SECONDS),
        contentType: 'image/webp',
        upsert: false,
      },
    )
    if (uploadError) throw new Error(`อัปโหลด thumbnail ไม่สำเร็จ: ${uploadError.message}`)

    const markedReady = await prisma.weight_ticket_image_assets.updateMany({
      data: {
        last_error: null,
        locked_at: null,
        locked_by: null,
        source_height: height,
        source_width: width,
        thumbnail_height: thumbnail.info.height,
        thumbnail_status: 'ready',
        thumbnail_width: thumbnail.info.width,
        updated_at: new Date(),
      },
      where: { id: assetId, locked_by: workerId },
    })
    if (markedReady.count !== 1) return { status: 'skipped' }
    return { status: 'ready' }
  } catch (caught) {
    const terminal = asset.attempt_count >= config.maxAttempts
    const released = await prisma.weight_ticket_image_assets.updateMany({
      data: {
        last_error: errorMessage(caught).slice(0, 1000),
        locked_at: null,
        locked_by: null,
        next_retry_at: new Date(Date.now() + config.retryDelaySeconds * 1000),
        thumbnail_status: terminal ? 'failed' : 'queued',
        updated_at: new Date(),
      },
      where: { id: assetId, locked_by: workerId },
    })
    if (released.count !== 1) return { status: 'skipped' }
    return { status: terminal ? 'failed' : 'queued' }
  }
}

export type WeightTicketPrintJobResult = {
  status: 'failed' | 'queued' | 'ready' | 'skipped'
}

export async function processWeightTicketPrintAsset(assetId: bigint): Promise<WeightTicketPrintJobResult> {
  const config = await resolveWeightTicketImageProcessingConfig()
  const now = new Date()
  const staleLock = new Date(now.getTime() - config.lockTimeoutSeconds * 1000)
  const workerId = `print-image-${process.pid}-${randomUUID()}`
  const claimed = await prisma.weight_ticket_image_assets.updateMany({
    data: {
      print_attempt_count: { increment: 1 },
      print_last_error: null,
      print_locked_at: now,
      print_locked_by: workerId,
      print_status: 'processing',
      updated_at: now,
    },
    where: {
      id: assetId,
      print_attempt_count: { lt: config.maxAttempts },
      OR: [
        {
          print_status: 'queued',
          print_next_retry_at: { lte: now },
          OR: [
            { print_locked_at: null },
            { print_locked_at: { lt: staleLock } },
          ],
        },
        { print_status: 'processing', print_locked_at: { lt: staleLock } },
      ],
    },
  })
  if (claimed.count === 0) return { status: 'skipped' }

  const asset = await prisma.weight_ticket_image_assets.findUnique({ where: { id: assetId } })
  if (!asset) return { status: 'skipped' }

  try {
    const supabase = getSupabaseAdminClient()
    if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase สำหรับสร้างรูปสำหรับพิมพ์')
    const { data: originalBlob, error: downloadError } = await supabase.storage
      .from(asset.bucket)
      .download(asset.original_storage_key)
    if (downloadError || !originalBlob) {
      throw new Error(`ดาวน์โหลดรูปต้นฉบับไม่สำเร็จ: ${downloadError?.message ?? 'ไม่พบไฟล์ต้นฉบับ'}`)
    }

    const originalBytes = Buffer.from(await originalBlob.arrayBuffer())
    const source = sharp(originalBytes, { failOn: 'error' })
    const metadata = await source.metadata()
    const width = metadata.width
    const height = metadata.height
    const sourcePixels = width && height ? width * height : 0
    if (!width || !height || !Number.isSafeInteger(sourcePixels) || sourcePixels > config.maxSourcePixels) {
      throw new Error(`รูปมีความละเอียดสูงเกินกว่าที่ระบบรองรับ (สูงสุด ${(config.maxSourcePixels / 1_000_000).toLocaleString('th-TH')} ล้านพิกเซล)`)
    }

    const printImage = await sharp(originalBytes, { failOn: 'error' })
      .rotate()
      .resize({
        fit: 'inside',
        height: config.printMaxDimension,
        kernel: 'lanczos3',
        withoutEnlargement: true,
        width: config.printMaxDimension,
      })
      .jpeg({ mozjpeg: true, quality: config.printJpegQuality })
      .toBuffer({ resolveWithObject: true })
    let printDimensions = validatePrintDimensions(printImage.info.width, printImage.info.height, config.printMaxDimension)

    const { error: uploadError } = await supabase.storage.from(asset.bucket).upload(
      asset.print_storage_key,
      printImage.data,
      {
        cacheControl: String(WEIGHT_TICKET_IMAGE_IMMUTABLE_CACHE_SECONDS),
        contentType: 'image/jpeg',
        upsert: false,
      },
    )
    if (uploadError) {
      if (!/already exists/i.test(uploadError.message)) {
        throw new Error(`อัปโหลดรูปสำหรับพิมพ์ไม่สำเร็จ: ${uploadError.message}`)
      }
      printDimensions = await readExistingPrintDimensions(supabase, asset.bucket, asset.print_storage_key, printImage.data, config.printMaxDimension)
    }

    const markedReady = await prisma.weight_ticket_image_assets.updateMany({
      data: {
        print_height: printDimensions.height,
        print_last_error: null,
        print_locked_at: null,
        print_locked_by: null,
        print_status: 'ready',
        print_width: printDimensions.width,
        source_height: height,
        source_width: width,
        updated_at: new Date(),
      },
      where: { id: assetId, print_locked_by: workerId },
    })
    if (markedReady.count !== 1) return { status: 'skipped' }
    return { status: 'ready' }
  } catch (caught) {
    const terminal = asset.print_attempt_count >= config.maxAttempts
    const released = await prisma.weight_ticket_image_assets.updateMany({
      data: {
        print_last_error: errorMessage(caught).slice(0, 1000),
        print_locked_at: null,
        print_locked_by: null,
        print_next_retry_at: new Date(Date.now() + config.retryDelaySeconds * 1000),
        print_status: terminal ? 'failed' : 'queued',
        updated_at: new Date(),
      },
      where: { id: assetId, print_locked_by: workerId },
    })
    if (released.count !== 1) return { status: 'skipped' }
    return { status: terminal ? 'failed' : 'queued' }
  }
}
