import { NextResponse } from 'next/server'
import { createHash, randomUUID } from 'node:crypto'
import { Zip, ZipPassThrough } from 'fflate'
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
// Keep each ZIP part below the private Storage bucket's 50 MiB upload limit.
// The 45 MiB raw-byte threshold leaves room for ZIP headers and compression
// overhead while reducing the number of parts for larger documents.
const MAX_ARCHIVE_PART_BYTES = 45 * 1024 * 1024
const MAX_STORAGE_UPLOAD_BYTES = 50 * 1024 * 1024
const DETERMINISTIC_ARTIFACT_RETRY_ATTEMPTS = 8
const DETERMINISTIC_ARTIFACT_RETRY_DELAY_MS = 50

type DownloadDerivativeRow = {
  download_byte_size: bigint | null
  download_status: string
  download_storage_key: string
  original_storage_key: string
}

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

function partitionArchiveAssets(assets: StoredImageAsset[], derivativeRows: Array<{ download_byte_size: bigint | null; download_status: string; original_storage_key: string }>) {
  const derivativeByOriginal = new Map(derivativeRows.map((row) => [row.original_storage_key, row]))
  const seen = new Set<string>()
  const parts: StoredImageAsset[][] = []
  let currentPart: StoredImageAsset[] = []
  let totalBytes = 0
  for (const asset of assets) {
    if (!asset.storageKey || seen.has(asset.storageKey)) continue
    seen.add(asset.storageKey)
    const derivative = derivativeByOriginal.get(asset.storageKey)
    if (!derivative || derivative.download_status !== 'ready' || derivative.download_byte_size == null) return null
    const byteSize = Number(derivative.download_byte_size)
    if (!Number.isSafeInteger(byteSize) || byteSize < 0) return null
    if (currentPart.length > 0 && totalBytes + byteSize > MAX_ARCHIVE_PART_BYTES) {
      parts.push(currentPart)
      currentPart = []
      totalBytes = 0
    }
    currentPart.push(asset)
    totalBytes += byteSize
  }
  if (currentPart.length > 0) parts.push(currentPart)
  return seen.size > 0 ? parts : []
}

function estimateArchivePartCount(assets: StoredImageAsset[], derivativeRows: Array<{ download_byte_size: bigint | null; download_status: string; original_storage_key: string }>) {
  return partitionArchiveAssets(assets, derivativeRows)?.length ?? null
}

function archivePartitionSignature(ticketId: bigint, assets: StoredImageAsset[], derivativeRows: DownloadDerivativeRow[]) {
  const derivativeByOriginal = new Map(derivativeRows.map((row) => [row.original_storage_key, row]))
  const seen = new Set<string>()
  const signatureParts: string[] = []
  for (const asset of assets) {
    if (!asset.storageKey || seen.has(asset.storageKey)) continue
    seen.add(asset.storageKey)
    const derivative = derivativeByOriginal.get(asset.storageKey)
    if (!derivative || derivative.download_status !== 'ready' || derivative.download_byte_size == null) return null
    signatureParts.push(`${asset.storageKey}\u0000${derivative.download_storage_key}\u0000${derivative.download_byte_size.toString()}`)
  }
  if (signatureParts.length === 0) return null
  return createHash('sha256').update(`${ticketId.toString()}\u0000${signatureParts.join('\u0001')}`).digest('hex')
}

async function uploadZipArchive<T>(entries: AsyncIterable<{ fileName: string; bytes: Uint8Array }>, upload: (body: ReadableStream<Uint8Array>) => Promise<T>) {
  let archiveBytes = 0
  let streamError: Error | null = null
  const streamState: { controller?: ReadableStreamDefaultController<Uint8Array> } = {}
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      streamState.controller = streamController
    },
  })
  const uploadPromise = upload(body)
  const zip = new Zip((error, chunk) => {
    if (error) {
      streamError = error instanceof Error ? error : new Error(String(error))
      streamState.controller?.error(streamError)
      return
    }
    if (chunk) {
      archiveBytes += chunk.byteLength
      if (archiveBytes > MAX_STORAGE_UPLOAD_BYTES) {
        streamError = new Error('ไฟล์ ZIP มีขนาดเกิน 50MiB กรุณาลดจำนวนรูปต่อการดาวน์โหลด')
        streamState.controller?.error(streamError)
        return
      }
      streamState.controller?.enqueue(chunk)
    }
  })
  try {
    for await (const { fileName, bytes } of entries) {
      const entry = new ZipPassThrough(fileName)
      zip.add(entry)
      entry.push(bytes, true)
      if (streamError) throw streamError
    }
    zip.end()
    if (streamError) throw streamError
    streamState.controller?.close()
    return { result: await uploadPromise, archiveBytes }
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    streamState.controller?.error(failure)
    await uploadPromise.catch(() => undefined)
    throw failure
  } finally {
    zip.terminate()
  }
}

function archiveStorageKey(ticketId: bigint, signature: string, fileName: string) {
  return `attachments/downloads/${ticketId.toString()}/${signature}/${fileName}`
}

function isDeterministicStorageConflict(error: unknown) {
  const details = typeof error === 'object' && error !== null ? error as { message?: unknown; statusCode?: unknown } : null
  const message = typeof details?.message === 'string' ? details.message.toLowerCase() : ''
  const statusCode = String(details?.statusCode ?? '')
  return statusCode === '409' || message.includes('already exists') || message.includes('conflict') || message.includes('duplicate')
}

async function loadDownloadDerivativeRows(bucket: string, originalKeys: string[]): Promise<DownloadDerivativeRow[]> {
  return prisma.weight_ticket_image_assets.findMany({
    select: { download_byte_size: true, download_status: true, download_storage_key: true, original_storage_key: true },
    where: { bucket, original_storage_key: { in: originalKeys } },
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
    const searchParams = new URL(request.url).searchParams
    const requestedPartValue = searchParams.get('part')
    const requestedPart = requestedPartValue == null ? null : Number(requestedPartValue)
    const originalKeys = Array.from(new Set(assets.map((asset) => assertWeightTicketImageStorageKey(asset.storageKey ?? ''))))
    let derivativeRows = await loadDownloadDerivativeRows(bucket, originalKeys)
    if (new URL(request.url).searchParams.get('estimate') === 'true') {
      return withAuthNoStore(NextResponse.json({
        partCount: estimateArchivePartCount(assets, derivativeRows),
        partitionSignature: archivePartitionSignature(ticket.id, assets, derivativeRows),
        ready: derivativeRows.length === originalKeys.length && derivativeRows.every((row) => row.download_status === 'ready' && row.download_byte_size != null),
      }, { status: 200 }))
    }
    const isResignRequest = searchParams.get('resign') === 'true'
    const derivativesReady = derivativeRows.length === originalKeys.length
      && derivativeRows.every((row) => row.download_status === 'ready' && row.download_byte_size != null)
    if (!isResignRequest && requestedPart === null) {
      stage = 'cleanup-expired-artifacts'
      await cleanupExpiredDownloadArtifacts(supabase)
    }
    if (!isResignRequest && !derivativesReady) {
      const maxDrainBatches = Math.max(1, Math.ceil(assets.length / processingConfig.drainBatchSize) + 1)
      stage = 'drain-download-jobs'
      for (let batch = 0; batch < maxDrainBatches; batch += 1) {
        const drained = await drainWeightTicketDownloadJobs({ attachedTicketId: ticket.id, bucket })
        if (drained.attempted === 0) break
      }
    }
    stage = 'load-derivative-metadata'
    derivativeRows = await loadDownloadDerivativeRows(bucket, originalKeys)
    const plannedParts = partitionArchiveAssets(assets, derivativeRows)
    if (!plannedParts) throw new Error('รูปภาพบางรายการยังสร้างรูปสำหรับดาวน์โหลดไม่เสร็จ')
    if (requestedPart !== null) {
      const expectedSignature = archivePartitionSignature(ticket.id, assets, derivativeRows)
      const receivedSignature = searchParams.get('partitionSignature')
      if (!expectedSignature || receivedSignature !== expectedSignature) {
        throw new Error('ชุดรูปภาพเปลี่ยนระหว่างการเตรียม ZIP กรุณาเริ่มดาวน์โหลดใหม่')
      }
    }
    const plannedPartCount = plannedParts?.length ?? 0
    if (requestedPart !== null && (!Number.isInteger(requestedPart) || requestedPart < 1 || requestedPart > plannedPartCount)) {
      throw new Error(`ไม่พบ ZIP ส่วนที่ ${requestedPartValue}`)
    }
    const expectedTotalParts = plannedPartCount
    const derivativeByOriginal = new Map(derivativeRows.map((row) => [row.original_storage_key, row]))
    const archiveBase = safeFileName(ticket.doc_no, 'weight-ticket')
    const partitionSignature = requestedPart === null ? null : archivePartitionSignature(ticket.id, assets, derivativeRows)
    if (requestedPart !== null && !partitionSignature) throw new Error('ไม่สามารถระบุชุดรูปภาพสำหรับ ZIP ได้')
    const artifactPrefix = partitionSignature === null
      ? `attachments/downloads/${randomUUID()}`
      : `attachments/downloads/${ticket.id.toString()}/${partitionSignature}`
    const requestedInternalFileName = requestedPart === null
      ? null
      : `${archiveBase}-images-part-${String(requestedPart).padStart(2, '0')}.zip`
    const existingArtifactStorageKey = requestedPart === null || !requestedInternalFileName || !partitionSignature
      ? null
      : archiveStorageKey(ticket.id, partitionSignature, requestedInternalFileName)
    const existingArtifact = !existingArtifactStorageKey
      ? null
      : await prisma.weight_ticket_image_download_artifacts.findFirst({
        select: { bucket: true, storage_key: true },
        where: { bucket, storage_key: existingArtifactStorageKey },
      })
    if (requestedPart !== null && existingArtifact) {
      await prisma.weight_ticket_image_download_artifacts.update({
        data: { expires_at: new Date(Date.now() + processingConfig.downloadArtifactRetentionSeconds * 1000) },
        where: { storage_key: existingArtifact.storage_key },
      })
      const { data: signed, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(existingArtifact.storage_key, processingConfig.previewTtlSeconds)
      if (signedError || !signed?.signedUrl) {
        await supabase.storage.from(bucket).remove([existingArtifact.storage_key]).catch(() => undefined)
        await prisma.weight_ticket_image_download_artifacts.deleteMany({ where: { storage_key: existingArtifact.storage_key } })
        if (isResignRequest) throw new Error(`สร้างลิงก์ดาวน์โหลด ZIP ใหม่ไม่สำเร็จ: ${signedError?.message ?? 'ไม่พบไฟล์ ZIP'}`)
      } else {
        return withAuthNoStore(NextResponse.json({ files: [{ fileName: requestedInternalFileName, part: requestedPart, totalParts: expectedTotalParts, url: signed.signedUrl }], split: expectedTotalParts > 1 }, { status: 200 }))
      }
    }
    if (isResignRequest) throw new Error('ไม่พบไฟล์ ZIP ที่เตรียมไว้ กรุณาเตรียมไฟล์ใหม่')
    const generatedFiles: Array<{ internalFileName: string; url: string; part: number }> = []
    const uploadArchivePart = async (assetsForPart: StoredImageAsset[], currentPartNumber: number) => {
      if (assetsForPart.length === 0) return
      const internalFileName = `${archiveBase}-images-part-${String(currentPartNumber).padStart(2, '0')}.zip`
      const storageKey = partitionSignature === null ? `${artifactPrefix}/${internalFileName}` : archiveStorageKey(ticket.id, partitionSignature, internalFileName)
      const entries = async function* () {
        const usedNames = new Set<string>()
        for (const [index, asset] of assetsForPart.entries()) {
          const originalKey = assertWeightTicketImageStorageKey(asset.storageKey ?? '')
          const derivative = derivativeByOriginal.get(originalKey)
          if (!derivative || derivative.download_status !== 'ready') {
            throw new Error(`รูป ${asset.fileName} ยังสร้างรูปสำหรับดาวน์โหลดไม่เสร็จ`)
          }
          const bytes = await loadImageBytes(asset, derivative.download_storage_key, bucket, supabase)
          if (bytes.byteLength > MAX_ARCHIVE_PART_BYTES) {
            throw new Error(`รูป ${asset.fileName} มีขนาดเกิน 45MiB ไม่สามารถรวมในไฟล์ ZIP ตามเพดาน Storage 50MiB ได้`)
          }
          const baseName = safeFileName(asset.fileName.replace(/\.[^.]+$/, '.jpg'), `image-${index + 1}.jpg`)
          let fileName = baseName
          let suffix = 2
          while (usedNames.has(fileName)) {
            fileName = `${baseName.replace(/(\.[^.]+)$/, '')}-${suffix}${baseName.match(/\.[^.]+$/)?.[0] ?? ''}`
            suffix += 1
          }
          usedNames.add(fileName)
          yield { fileName, bytes }
        }
      }()
      let uploadResult: { error: { message?: string; statusCode?: string | number } | null }
      try {
        const uploadResponse = await uploadZipArchive(entries, (body) => supabase.storage.from(bucket).upload(storageKey, body, {
          cacheControl: '600',
          contentType: 'application/zip',
          upsert: false,
        }))
        uploadResult = uploadResponse.result
      } catch (error) {
        if (!isDeterministicStorageConflict(error)) {
          await supabase.storage.from(bucket).remove([storageKey]).catch(() => undefined)
        }
        throw error
      }
      const uploadError = uploadResult.error
      if (uploadError && partitionSignature !== null && isDeterministicStorageConflict(uploadError)) {
        let concurrentArtifact: { bucket: string; storage_key: string } | null = null
        for (let attempt = 0; attempt < DETERMINISTIC_ARTIFACT_RETRY_ATTEMPTS && !concurrentArtifact; attempt += 1) {
          concurrentArtifact = await prisma.weight_ticket_image_download_artifacts.findFirst({
            select: { bucket: true, storage_key: true },
            where: { bucket, storage_key: storageKey },
          })
          if (!concurrentArtifact && attempt + 1 < DETERMINISTIC_ARTIFACT_RETRY_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, DETERMINISTIC_ARTIFACT_RETRY_DELAY_MS))
          }
        }
        if (!concurrentArtifact) {
          try {
            await prisma.weight_ticket_image_download_artifacts.create({
              data: {
                bucket,
                created_by: auth.authUser.id,
                expires_at: new Date(Date.now() + processingConfig.downloadArtifactRetentionSeconds * 1000),
                storage_key: storageKey,
              },
            })
            concurrentArtifact = { bucket, storage_key: storageKey }
          } catch {
            // Another request may have claimed the deterministic key while the
            // row was still invisible to the reads above. Re-read it before
            // treating the Storage conflict as a real upload failure.
            concurrentArtifact = await prisma.weight_ticket_image_download_artifacts.findFirst({
              select: { bucket: true, storage_key: true },
              where: { bucket, storage_key: storageKey },
            })
          }
        }
        if (concurrentArtifact) {
          await prisma.weight_ticket_image_download_artifacts.update({
            data: { expires_at: new Date(Date.now() + processingConfig.downloadArtifactRetentionSeconds * 1000) },
            where: { storage_key: storageKey },
          })
          const { data: signed, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(storageKey, processingConfig.previewTtlSeconds)
          if (signedError || !signed?.signedUrl) throw new Error(`สร้างลิงก์ดาวน์โหลด ZIP ไม่สำเร็จ: ${signedError?.message ?? 'ไม่พบ signed URL'}`)
          generatedFiles.push({ internalFileName, part: currentPartNumber, url: signed.signedUrl })
          return
        }
      }
      if (uploadError) {
        if (!isDeterministicStorageConflict(uploadError)) {
          await supabase.storage.from(bucket).remove([storageKey]).catch(() => undefined)
        }
        throw new Error(`อัปโหลดไฟล์ ZIP ไม่สำเร็จ: ${uploadError.message}`)
      }
      createdArtifactKeys.push(storageKey)
      const expiresAt = new Date(Date.now() + processingConfig.downloadArtifactRetentionSeconds * 1000)
      await prisma.weight_ticket_image_download_artifacts.create({
        data: { bucket, created_by: auth.authUser.id, expires_at: expiresAt, storage_key: storageKey },
      })
      const { data: signed, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(storageKey, processingConfig.previewTtlSeconds)
      if (signedError || !signed?.signedUrl) throw new Error(`สร้างลิงก์ดาวน์โหลด ZIP ไม่สำเร็จ: ${signedError?.message ?? 'ไม่พบ signed URL'}`)
      generatedFiles.push({ internalFileName, part: currentPartNumber, url: signed.signedUrl })
    }

    stage = 'upload-zip-artifacts'
    if (requestedPart !== null) {
      await uploadArchivePart(plannedParts[requestedPart - 1] ?? [], requestedPart)
    } else {
      for (const [index, assetsForPart] of plannedParts.entries()) {
        await uploadArchivePart(assetsForPart, index + 1)
      }
    }
    const totalParts = expectedTotalParts
    const downloadedFiles = generatedFiles.map(({ internalFileName, part, url }) => ({
      fileName: totalParts === 1 ? `${archiveBase}-images.zip` : internalFileName,
      part,
      totalParts,
      url,
    }))
    return withAuthNoStore(NextResponse.json({ files: downloadedFiles, split: requestedPart === null ? downloadedFiles.length > 1 : expectedTotalParts > 1 }, { status: 200 }))
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
