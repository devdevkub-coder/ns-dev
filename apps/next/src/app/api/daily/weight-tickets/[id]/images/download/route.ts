import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { zipSync } from 'fflate'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { withAuthNoStore } from '@/lib/server/auth-response'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { prisma } from '@/lib/server/prisma'
import { branchScopeIds, findScopedWeightTicket } from '@/lib/server/weight-tickets'
import { assertWeightTicketImageStorageKey, resolveWeightTicketImageBucket, resolveWeightTicketImageProcessingConfig } from '@/lib/server/weight-ticket-storage'
import { drainWeightTicketDownloadJobs } from '@/lib/server/weight-ticket-thumbnail-jobs'
import { decodeStoredImageAsset, type StoredImageAsset } from '@/lib/weight-tickets'

export const runtime = 'nodejs'

// This is a server-safety guard for the complete archive, not a per-image
// business limit. Per-image validation belongs to the upload contract.
// Keep each in-memory ZIP part bounded. The route still splits large downloads,
// but a smaller raw-byte threshold limits the peak of source buffers plus the
// compressed archive while the part is uploaded.
const MAX_ARCHIVE_PART_BYTES = 16 * 1024 * 1024

async function cleanupExpiredDownloadArtifacts(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  if (!supabase) return
  const expired = await prisma.weight_ticket_image_download_artifacts.findMany({
    select: { bucket: true, id: true, storage_key: true },
    take: 20,
    where: { expires_at: { lt: new Date() } },
  })
  for (const artifact of expired) {
    const { error } = await supabase.storage.from(artifact.bucket).remove([artifact.storage_key])
    if (error) continue
    await prisma.weight_ticket_image_download_artifacts.deleteMany({ where: { id: artifact.id } })
  }
}

function safeFileName(value: string, fallback: string) {
  const cleaned = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  const fileName = cleaned || fallback
  return fileName.replace(/\.([A-Za-z0-9]+)$/, (_match, extension: string) => `.${extension.toLowerCase()}`)
}

async function loadImageBytes(asset: StoredImageAsset, storageKey: string, bucket: string, supabase: ReturnType<typeof getSupabaseAdminClient>) {
  if (!asset.bucket || !asset.storageKey) {
    throw new Error(`รูป ${asset.fileName} ยังไม่อยู่ใน private image bucket กรุณารัน migration/backfill ก่อนดาวน์โหลด`)
  }
  if (asset.bucket !== bucket) {
    throw new Error(`ไม่อนุญาตให้ดาวน์โหลดรูปจาก bucket ${asset.bucket}`)
  }
  if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Storage สำหรับดาวน์โหลดรูปหลักฐาน')

  const validatedKey = assertWeightTicketImageStorageKey(storageKey)
  const { data, error } = await supabase.storage.from(bucket).download(validatedKey)
  if (error || !data) throw new Error(error?.message ?? `ไม่พบไฟล์ ${asset.fileName}`)
  return Buffer.from(await data.arrayBuffer())
}

function ticketImageAssets(ticket: Awaited<ReturnType<typeof findScopedWeightTicket>>) {
  if (!ticket) return []
  return [
    ...(ticket.vehicle_image_names ?? []),
    ...ticket.weight_ticket_lines.flatMap((line) => line.image_names ?? []),
  ]
    .map(decodeStoredImageAsset)
    .filter((asset) => asset.rawValue.trim().length > 0)
}

function uniqueTicketImageAssets(assets: StoredImageAsset[]) {
  const seenStorageKeys = new Set<string>()
  return assets.filter((asset) => {
    if (!asset.storageKey) return true
    if (seenStorageKeys.has(asset.storageKey)) return false
    seenStorageKeys.add(asset.storageKey)
    return true
  })
}

function requestTraceId(request: Request) {
  return request.headers.get('x-vercel-id')
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const createdArtifactKeys: string[] = []
  let cleanupBucket: string | null = null
  let cleanupSupabase: ReturnType<typeof getSupabaseAdminClient> = null
  let stage = 'auth'
  const traceId = requestTraceId(request)
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const ticket = await findScopedWeightTicket(id, branchScopeIds(auth))
    if (!ticket) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 })

    stage = 'collect-assets'
    const referencedAssets = ticketImageAssets(ticket)
    const assets = uniqueTicketImageAssets(referencedAssets)
    if (assets.length === 0) {
      return NextResponse.json({ code: 'NO_IMAGES', error: 'เอกสารนี้ยังไม่มีรูปภาพที่ดาวน์โหลดได้' }, { status: 404 })
    }

    const bucket = await resolveWeightTicketImageBucket()
    const supabase = getSupabaseAdminClient()
    cleanupBucket = bucket
    cleanupSupabase = supabase
    if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Storage สำหรับสร้างไฟล์ดาวน์โหลดรูปภาพ')
    const processingConfig = await resolveWeightTicketImageProcessingConfig()
    stage = 'cleanup-expired-artifacts'
    await cleanupExpiredDownloadArtifacts(supabase)
    const maxDrainBatches = Math.max(1, Math.ceil(assets.length / processingConfig.drainBatchSize) + 1)
    stage = 'drain-download-jobs'
    for (let batch = 0; batch < maxDrainBatches; batch += 1) {
      const drained = await drainWeightTicketDownloadJobs({ attachedTicketId: ticket.id, bucket })
      if (drained.attempted === 0) break
    }
    stage = 'load-derivative-metadata'
    const originalKeys = Array.from(new Set(assets.map((asset) => assertWeightTicketImageStorageKey(asset.storageKey ?? ''))))
    const derivativeRows = await prisma.weight_ticket_image_assets.findMany({
      select: { download_status: true, download_storage_key: true, original_storage_key: true },
      where: { bucket, original_storage_key: { in: originalKeys } },
    })
    const derivativeByOriginal = new Map(derivativeRows.map((row) => [row.original_storage_key, row]))
    const archiveBase = safeFileName(ticket.doc_no, 'weight-ticket')
    const artifactPrefix = `attachments/downloads/${randomUUID()}`
    const generatedFiles: Array<{ internalFileName: string; url: string; part: number }> = []
    let currentFiles: Record<string, Uint8Array> = {}
    const usedNames = new Set<string>()
    let totalBytes = 0
    let partNumber = 1

    const uploadArchivePart = async (files: Record<string, Uint8Array>, currentPartNumber: number) => {
      if (Object.keys(files).length === 0) return
      const internalFileName = `${archiveBase}-images-part-${String(currentPartNumber).padStart(2, '0')}.zip`
      const storageKey = `${artifactPrefix}/${internalFileName}`
      const archive = zipSync(files, { level: 6 })
      const { error: uploadError } = await supabase.storage.from(bucket).upload(storageKey, archive, {
        cacheControl: '600',
        contentType: 'application/zip',
        upsert: false,
      })
      if (uploadError) throw new Error(`อัปโหลดไฟล์ ZIP ไม่สำเร็จ: ${uploadError.message}`)
      createdArtifactKeys.push(storageKey)
      const expiresAt = new Date(Date.now() + processingConfig.previewTtlSeconds * 1000)
      await prisma.weight_ticket_image_download_artifacts.create({
        data: { bucket, created_by: auth.authUser.id, expires_at: expiresAt, storage_key: storageKey },
      })
      const { data: signed, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(storageKey, processingConfig.previewTtlSeconds)
      if (signedError || !signed?.signedUrl) throw new Error(`สร้างลิงก์ดาวน์โหลด ZIP ไม่สำเร็จ: ${signedError?.message ?? 'ไม่พบ signed URL'}`)
      generatedFiles.push({ internalFileName, part: currentPartNumber, url: signed.signedUrl })
    }

    stage = 'download-derivatives-and-build-zip'
    for (const [index, asset] of assets.entries()) {
      const originalKey = assertWeightTicketImageStorageKey(asset.storageKey ?? '')
      const derivative = derivativeByOriginal.get(originalKey)
      if (!derivative || derivative.download_status !== 'ready') {
        throw new Error(`รูป ${asset.fileName} ยังสร้างรูปสำหรับดาวน์โหลดไม่เสร็จ`)
      }
      const bytes = await loadImageBytes(asset, derivative.download_storage_key, bucket, supabase)
      const baseName = safeFileName(asset.fileName.replace(/\.[^.]+$/, '.jpg'), `image-${index + 1}.jpg`)
      let fileName = baseName
      let suffix = 2
      while (usedNames.has(fileName)) {
        fileName = `${baseName.replace(/(\.[^.]+)$/, '')}-${suffix}${baseName.match(/\.[^.]+$/)?.[0] ?? ''}`
        suffix += 1
      }
      usedNames.add(fileName)
      if (Object.keys(currentFiles).length > 0 && totalBytes + bytes.byteLength > MAX_ARCHIVE_PART_BYTES) {
        await uploadArchivePart(currentFiles, partNumber)
        currentFiles = {}
        partNumber += 1
        totalBytes = 0
        usedNames.clear()
      }
      currentFiles[fileName] = bytes
      totalBytes += bytes.byteLength
    }
    stage = 'upload-zip-artifacts'
    await uploadArchivePart(currentFiles, partNumber)
    const totalParts = generatedFiles.length
    const downloadedFiles = generatedFiles.map(({ internalFileName, part, url }) => ({
      fileName: totalParts === 1 ? `${archiveBase}-images.zip` : internalFileName,
      part,
      totalParts,
      url,
    }))
    return withAuthNoStore(NextResponse.json({ files: downloadedFiles, split: downloadedFiles.length > 1 }, { status: 200 }))
  } catch (caught) {
    console.error('[weight-ticket-image-download]', {
      stage,
      traceId,
      error: caught instanceof Error ? caught.message : String(caught),
    })
    if (cleanupSupabase && cleanupBucket && createdArtifactKeys.length > 0) {
      await cleanupSupabase.storage.from(cleanupBucket).remove(createdArtifactKeys).catch(() => undefined)
      await prisma.weight_ticket_image_download_artifacts.deleteMany({ where: { storage_key: { in: createdArtifactKeys } } }).catch(() => undefined)
    }
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ดาวน์โหลดรูปภาพใบรับ-ส่งของไม่สำเร็จ', 500)
  }
}
