import 'server-only'
import { renderToBuffer } from '@react-pdf/renderer'
import { type WeightTicketRecord } from '@/lib/weight-tickets'
import { type CompanyProfilePrintValues } from '@/lib/company-profile'
import { buildWeightTicketAttachmentImages } from '@/lib/weight-ticket-print'
import { ensurePdfFontsRegistered } from './fonts'
import { WeightTicketDocument } from './weight-ticket-document'
import type { StoredImageAsset } from '@/lib/weight-tickets'
import { renderAlbumImages } from './album-canvas'

/**
 * Generate Weight Ticket PDF + Album images (react-pdf + @napi-rs/canvas)
 *
 * แทนที่ฟังก์ชันเดิมที่ใช้ Playwright chromium.launch() + page.pdf() + page.screenshot()
 * กำจัด dependency Chromium binary ออกจาก Docker image ทั้งหมด
 *
 * Return shape เหมือนเดิม { pdfBuffer, albumImages } เพื่อให้ notification flow
 * ใช้งานได้โดยไม่ต้องแก้ caller
 */
export async function generateWeightTicketPdf(
  ticket: WeightTicketRecord,
  profile: CompanyProfilePrintValues,
  options?: {
    showBadges?: boolean
    showTimestamps?: boolean
    quality?: number
  }
): Promise<{ pdfBuffer: Buffer; albumImages: Array<{ pageIdx: number; buffer: Buffer }> }> {
  // 1. Register fonts ครั้งเดียว (idempotent)
  await ensurePdfFontsRegistered()

  // 2. Render PDF ผ่าน react-pdf (แทน Playwright page.pdf())
  const pdfBuffer = await renderToBuffer(<WeightTicketDocument ticket={ticket} profile={profile} />)

  // 3. Generate album images ผ่าน @napi-rs/canvas (แทน Playwright page.screenshot())
  const decodedImages: Array<{ asset: StoredImageAsset & { url: string }; url: string }> = buildWeightTicketAttachmentImages(ticket)
    .map((asset) => ({ asset, url: asset.url }))

  const albumImages: Array<{ pageIdx: number; buffer: Buffer }> = []
  if (decodedImages.length > 0) {
    const isWti = ticket.type === 'WTI'
    const albumBuffers = await renderAlbumImages({
      images: decodedImages.map((d) => ({ url: d.url, fileName: d.asset.fileName })),
      ticketCreatedAt: ticket.createdAt,
      isWti,
      partyName: ticket.partyName,
      documentNo: ticket.documentNo,
      quality: options?.quality,
      showBadges: options?.showBadges ?? true,
      showTimestamps: options?.showTimestamps ?? true,
    })
    albumBuffers.forEach((buffer, idx) => {
      albumImages.push({ pageIdx: idx, buffer })
    })
  }

  return { pdfBuffer: Buffer.from(pdfBuffer), albumImages }
}
