import { NextResponse } from 'next/server'
import { zipSync } from 'fflate'
import { apiErrorResponse } from '@/lib/server/api-error'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import { branchScopeIds, findScopedWeightTicket } from '@/lib/server/weight-tickets'
import { assertWeightTicketImageStorageKey, resolveWeightTicketImageBucket } from '@/lib/server/weight-ticket-storage'
import { decodeStoredImageAsset, type StoredImageAsset } from '@/lib/weight-tickets'

export const runtime = 'nodejs'

// This is a server-safety guard for the complete archive, not a per-image
// business limit. Per-image validation belongs to the upload contract.
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024

function safeFileName(value: string, fallback: string) {
  const cleaned = value.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  const fileName = cleaned || fallback
  return fileName.replace(/\.([A-Za-z0-9]+)$/, (_match, extension: string) => `.${extension.toLowerCase()}`)
}

async function loadImageBytes(asset: StoredImageAsset, bucket: string, supabase: ReturnType<typeof getSupabaseAdminClient>) {
  if (!asset.bucket || !asset.storageKey) {
    throw new Error(`รูป ${asset.fileName} ยังไม่อยู่ใน private image bucket กรุณารัน migration/backfill ก่อนดาวน์โหลด`)
  }
  if (asset.bucket !== bucket) {
    throw new Error(`ไม่อนุญาตให้ดาวน์โหลดรูปจาก bucket ${asset.bucket}`)
  }
  if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Storage สำหรับดาวน์โหลดรูปหลักฐาน')

  const storageKey = assertWeightTicketImageStorageKey(asset.storageKey)
  const { data, error } = await supabase.storage.from(bucket).download(storageKey)
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

    const bucket = await resolveWeightTicketImageBucket()
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
