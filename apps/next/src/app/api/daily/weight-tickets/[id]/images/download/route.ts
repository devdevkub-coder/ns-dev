import { NextResponse } from 'next/server'
import { zipSync } from 'fflate'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { branchScopeIds, findScopedWeightTicket } from '@/lib/server/weight-tickets'
import { decodeStoredImageAsset, type StoredImageAsset } from '@/lib/weight-tickets'

export const runtime = 'nodejs'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024

function allowedRemoteImageHost() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!supabaseUrl) return null
  try {
    return new URL(supabaseUrl).hostname
  } catch {
    return null
  }
}

function safeFileName(value: string, fallback: string) {
  const cleaned = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned || fallback
}

async function resolveWeightTicketBucket() {
  const setting = await prisma.system_settings.findUnique({
    select: { value: true },
    where: { key: 'WEIGHT_TICKET_PDF_BUCKET' },
  })
  return setting?.value?.trim() || process.env.WEIGHT_TICKET_PDF_BUCKET?.trim() || ''
}

function dataUrlBytes(url: string) {
  const match = url.match(/^data:image\/(?:png|jpe?g|webp);base64,(.+)$/i)
  return match ? Buffer.from(match[1], 'base64') : null
}

async function loadImageBytes(asset: StoredImageAsset, bucket: string, supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const dataBytes = asset.url ? dataUrlBytes(asset.url) : null
  if (dataBytes) {
    if (dataBytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`ไฟล์ ${asset.fileName} มีขนาดใหญ่เกินไป`)
    return dataBytes
  }

  if (asset.storageKey && supabase && bucket) {
    const { data, error } = await supabase.storage.from(bucket).download(asset.storageKey)
    if (error || !data) throw new Error(error?.message ?? `ไม่พบไฟล์ ${asset.fileName}`)
    if (data.size > MAX_IMAGE_BYTES) throw new Error(`ไฟล์ ${asset.fileName} มีขนาดใหญ่เกินไป`)
    return Buffer.from(await data.arrayBuffer())
  }

  const allowedHost = allowedRemoteImageHost()
  if (asset.url?.startsWith('https://') && allowedHost) {
    const remoteUrl = new URL(asset.url)
    if (remoteUrl.hostname !== allowedHost) {
      throw new Error(`ไม่อนุญาตให้โหลดรูปจาก ${remoteUrl.hostname}`)
    }
    const response = await fetch(remoteUrl, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`โหลดไฟล์ ${asset.fileName} ไม่สำเร็จ (${response.status})`)
    const contentLength = Number(response.headers.get('content-length') ?? 0)
    if (contentLength > MAX_IMAGE_BYTES) throw new Error(`ไฟล์ ${asset.fileName} มีขนาดใหญ่เกินไป`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error(`ไฟล์ ${asset.fileName} มีขนาดใหญ่เกินไป`)
    return bytes
  }

  throw new Error(`ไม่พบแหล่งไฟล์สำหรับ ${asset.fileName}`)
}

function ticketImageAssets(ticket: Awaited<ReturnType<typeof findScopedWeightTicket>>) {
  if (!ticket) return []
  return [
    ...(ticket.vehicle_image_names ?? []),
    ...ticket.weight_ticket_lines.flatMap((line) => line.image_names ?? []),
  ]
    .map(decodeStoredImageAsset)
    .filter((asset) => asset.storageKey || asset.url?.startsWith('data:image/') || asset.url?.startsWith('https://'))
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getCurrentAuthContext()
    requirePermission(auth, 'daily.weight_tickets.view')

    const { id } = await context.params
    const ticket = await findScopedWeightTicket(id, branchScopeIds(auth))
    if (!ticket) return NextResponse.json({ code: 'NOT_FOUND', error: 'ไม่พบใบรับ-ส่งของ' }, { status: 404 })

    const assets = ticketImageAssets(ticket)
    if (assets.length === 0) {
      return NextResponse.json({ code: 'NO_IMAGES', error: 'เอกสารนี้ยังไม่มีรูปภาพที่ดาวน์โหลดได้' }, { status: 404 })
    }

    const bucket = await resolveWeightTicketBucket()
    const supabase = getSupabaseAdminClient()
    const files: Record<string, Uint8Array> = {}
    const usedNames = new Set<string>()
    let totalBytes = 0

    for (const [index, asset] of assets.entries()) {
      const bytes = await loadImageBytes(asset, bucket, supabase)
      totalBytes += bytes.byteLength
      if (totalBytes > MAX_ARCHIVE_BYTES) {
        throw new Error('รูปภาพรวมมีขนาดใหญ่เกินกว่าที่ดาวน์โหลดเป็น ZIP ได้')
      }
      const baseName = safeFileName(asset.fileName, `image-${index + 1}`)
      let fileName = baseName
      let suffix = 2
      while (usedNames.has(fileName)) {
        fileName = `${baseName.replace(/(\.[^.]+)$/, '')}-${suffix}${baseName.match(/\.[^.]+$/)?.[0] ?? ''}`
        suffix += 1
      }
      usedNames.add(fileName)
      files[fileName] = bytes
    }

    const archive = zipSync(files, { level: 6 })
    const archiveName = `${safeFileName(ticket.doc_no, 'weight-ticket')}-images.zip`
    return new Response(archive, {
      headers: {
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `attachment; filename="${archiveName}"`,
        'Content-Type': 'application/zip',
      },
    })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return apiErrorResponse(caught, 'ดาวน์โหลดรูปภาพใบรับ-ส่งของไม่สำเร็จ', 500)
  }
}
