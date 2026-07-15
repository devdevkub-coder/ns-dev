import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { buildReceiptPrintHtml } from '@/lib/weight-ticket-print'
import { type CompanyProfilePrintValues } from '@/lib/company-profile'
import type { Prisma } from '../../../generated/prisma/client'
import { decodeStoredImageAsset, formatDateDisplay, formatWeight, type WeightTicketRecord, typeLabels, type StoredImageAsset } from '@/lib/weight-tickets'
import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import {
  findScopedWeightTicket,
  getWeightTicketUsageCounts,
  mapWeightTicketRow,
  type WeightTicketRow,
} from '@/lib/server/weight-tickets'
import { syncWeightTicketToGoogleSheets } from '@/lib/server/google-sheets-sync'
// module ใหม่ที่ใช้ react-pdf + @napi-rs/canvas แทน Playwright
// (import เป็น alias เพื่อไม่ให้ชนกับชื่อ function legacy ในไฟล์นี้)
import { generateWeightTicketPdf as generateWeightTicketPdfReactPdf } from '@/lib/server/pdf/weight-ticket-pdf'

type NotifyOptions = {
  customMessage?: string
  origin: string
  requestedBy: string
  scopedBranchIds: string[]
  targetId?: string
  force?: boolean
  retryKey?: string
}

type NotificationLogStatus = 'failed' | 'sent'

async function resolveNotificationConfigs() {
  const dbSettings = await prisma.system_settings.findMany({
    where: {
      key: {
        in: [
          'LINE_CHANNEL_ACCESS_TOKEN',
          'LINE_CHANNEL_SECRET',
          'LINE_DEFAULT_TARGET_ID',
          'WEIGHT_TICKET_PDF_BUCKET',
          'NEXT_PUBLIC_APP_URL',
          'LINE_NOTIFY_TEXT_TEMPLATE_WTI',
          'LINE_NOTIFY_TEXT_TEMPLATE_WTO',
          'LINE_ALBUM_SHOW_BADGES',
          'LINE_ALBUM_SHOW_TIMESTAMPS',
          'LINE_ALBUM_QUALITY',
        ],
      },
    },
  })

  const configMap = Object.fromEntries(dbSettings.map((s) => [s.key, s.value]))

  const wtiDefaultTemplate = `ใบรับของ WTI [DocumentNo]\n━━━━━━━━━━━━━━━\nผู้ขาย: [PartyName]\nสาขา: [BranchName]\nวันที่/เวลาเอกสาร: [DocDateTime]\nน้ำหนักรวม: [GrossWeight] กก.\nหักภาชนะ: [ContainerWeight] กก.\nหักสิ่งเจือปน: [DeductionWeight] กก.\nน้ำหนักสุทธิ: [NetWeight] กก.\n━━━━━━━━━━━━━━━\nลิงค์โหลด pdf:\n[PdfUrl]`

  const wtoDefaultTemplate = `ใบส่งของ WTO [DocumentNo]\n━━━━━━━━━━━━━━━\nลูกค้า: [PartyName]\nสาขา: [BranchName]\nวันที่/เวลาเอกสาร: [DocDateTime]\nน้ำหนักรวม: [GrossWeight] กก.\nหักภาชนะ: [ContainerWeight] กก.\nหักสิ่งเจือปน: [DeductionWeight] กก.\nน้ำหนักสุทธิ: [NetWeight] กก.\n━━━━━━━━━━━━━━━\nลิงค์โหลด pdf:\n[PdfUrl]`

  return {
    lineChannelAccessToken: configMap.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    lineChannelSecret: configMap.LINE_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || '',
    lineDefaultTargetId: configMap.LINE_DEFAULT_TARGET_ID || process.env.LINE_DEFAULT_TARGET_ID || '',
    pdfBucket: configMap.WEIGHT_TICKET_PDF_BUCKET || process.env.WEIGHT_TICKET_PDF_BUCKET || 'weight-ticket-pdfs',
    appUrl: configMap.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '',
    wtiTemplate: configMap.LINE_NOTIFY_TEXT_TEMPLATE_WTI || wtiDefaultTemplate,
    wtoTemplate: configMap.LINE_NOTIFY_TEXT_TEMPLATE_WTO || wtoDefaultTemplate,
    albumShowBadges: configMap.LINE_ALBUM_SHOW_BADGES !== 'false',
    albumShowTimestamps: configMap.LINE_ALBUM_SHOW_TIMESTAMPS !== 'false',
    albumQuality: configMap.LINE_ALBUM_QUALITY ? parseInt(configMap.LINE_ALBUM_QUALITY, 10) : 90,
  }
}

function cleanText(value: string | null | undefined, fallback = '-') {
  const cleaned = String(value ?? '').trim()
  return cleaned || fallback
}

function safeStorageSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

function imageFromDataUrl(value: string) {
  const match = value.match(/^data:image\/(png|jpe?g);base64,(.+)$/i)
  if (!match) return null
  return {
    bytes: Buffer.from(match[2], 'base64'),
    type: match[1].toLowerCase().startsWith('jp') ? 'jpg' as const : 'png' as const,
  }
}

async function loadCompanyPrintProfile(branchId: string): Promise<CompanyProfilePrintValues | null> {
  const branch = await prisma.branches.findFirst({
    select: { id: true },
    where: { code: branchId },
  })
  const profile = await prisma.company_profiles.findFirst({
    orderBy: { id: 'desc' },
    where: branch?.id ? { OR: [{ branch_id: branch.id }, { branch_id: null }] } : { branch_id: null },
  })
  if (!profile) return null
  return {
    address: profile.address,
    bankInfo: profile.bank_info,
    branchCode: profile.branch_code ?? '00000',
    email: profile.email,
    fax: profile.fax,
    footerNote: profile.footer_note,
    logoUrl: profile.logo_url,
    name: profile.name,
    nameEn: profile.name_en,
    phone: profile.phone,
    taxId: profile.tax_id,
    website: profile.website,
  }
}

async function loadWeightTicketRecord(documentNo: string, scopedBranchIds: string[]) {
  const ticket = await findScopedWeightTicket(documentNo, scopedBranchIds)
  if (!ticket) return null
  const usage = await getWeightTicketUsageCounts(prisma, ticket.id)
  return {
    id: ticket.id,
    record: mapWeightTicketRow(ticket as WeightTicketRow, usage),
  }
}


function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// --- Image Metadata Timestamp Helpers ---

function getPhotoTimestamp(fileName: string, ticketCreatedAt: string): string {
  const msMatch = fileName.match(/\b(\d{13})\b/)
  if (msMatch) {
    const ms = parseInt(msMatch[1], 10)
    const date = new Date(ms)
    if (!isNaN(date.getTime())) {
      return formatTime(date)
    }
  }
  const sMatch = fileName.match(/\b(\d{10})\b/)
  if (sMatch) {
    const s = parseInt(sMatch[1], 10) * 1000
    const date = new Date(s)
    if (!isNaN(date.getTime())) {
      return formatTime(date)
    }
  }
  const cameraMatch = fileName.match(/(\d{4})[_-]?(\d{2})[_-]?(\d{2})[_-](\d{2})[_-]?(\d{2})[_-]?(\d{2})/)
  if (cameraMatch) {
    const [, , , , hour, minute] = cameraMatch
    return `${hour}:${minute}`
  }
  const date = ticketCreatedAt ? new Date(ticketCreatedAt) : new Date()
  return formatTime(date)
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok'
  })
}


async function uploadPdf(ticket: WeightTicketRecord, pdfBuffer: Buffer, bucketName: string) {
  if (process.env.MOCK_PDF_UPLOAD === 'true') {
    return {
      pdfUrl: `https://${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : 'fhglqymcdmrgbsbadnwr.supabase.co'}/storage/v1/object/public/${bucketName}/dummy-test-ticket.pdf`,
      storageKey: 'dummy-test-ticket.pdf'
    }
  }
  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    if (process.env.NODE_ENV === 'development' || process.env.MOCK_PDF_UPLOAD_FALLBACK === 'true') {
      console.warn('[uploadPdf] SUPABASE_SERVICE_ROLE_KEY missing, falling back to dummy url in development')
      return {
        pdfUrl: `https://${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : 'fhglqymcdmrgbsbadnwr.supabase.co'}/storage/v1/object/public/${bucketName}/dummy-test-ticket.pdf`,
        storageKey: 'dummy-test-ticket.pdf'
      }
    }
    throw new Error('ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY สำหรับอัปโหลด PDF')
  }
  const storageKey = `${safeStorageSegment(ticket.documentNo)}/${Date.now()}-${safeStorageSegment(ticket.documentNo)}.pdf`
  const { error } = await supabase.storage.from(bucketName).upload(storageKey, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) {
    if (process.env.MOCK_PDF_UPLOAD_FALLBACK === 'true') {
      console.warn('[uploadPdf] upload failed, falling back to dummy url due to RLS/credentials:', error.message)
      return {
        pdfUrl: `https://${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : 'fhglqymcdmrgbsbadnwr.supabase.co'}/storage/v1/object/public/${bucketName}/dummy-test-ticket.pdf`,
        storageKey: 'dummy-test-ticket.pdf'
      }
    }
    throw new Error(`อัปโหลด PDF ไป Supabase Storage ไม่สำเร็จ: ${error.message}`)
  }
  const { data } = supabase.storage.from(bucketName).getPublicUrl(storageKey)
  return { pdfUrl: data.publicUrl, storageKey }
}

async function uploadAlbumImage(ticket: WeightTicketRecord, buffer: Buffer, pageIdx: number, bucketName: string) {
  if (process.env.MOCK_PDF_UPLOAD === 'true') {
    return `https://${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : 'fhglqymcdmrgbsbadnwr.supabase.co'}/storage/v1/object/public/${bucketName}/dummy-album-${pageIdx + 1}.jpg`
  }
  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    if (process.env.NODE_ENV === 'development' || process.env.MOCK_PDF_UPLOAD_FALLBACK === 'true') {
      return `https://${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : 'fhglqymcdmrgbsbadnwr.supabase.co'}/storage/v1/object/public/${bucketName}/dummy-album-${pageIdx + 1}.jpg`
    }
    throw new Error('ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY สำหรับอัปโหลดรูปภาพอัลบั้ม')
  }
  const storageKey = `${safeStorageSegment(ticket.documentNo)}/album/finish-${Date.now()}-${pageIdx + 1}.jpg`
  const { error } = await supabase.storage.from(bucketName).upload(storageKey, buffer, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  if (error) {
    if (process.env.MOCK_PDF_UPLOAD_FALLBACK === 'true') {
      console.warn('[uploadAlbumImage] upload failed, falling back to dummy url:', error.message)
      return `https://${process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : 'fhglqymcdmrgbsbadnwr.supabase.co'}/storage/v1/object/public/${bucketName}/dummy-album-${pageIdx + 1}.jpg`
    }
    throw new Error(`อัปโหลดรูปภาพอัลบั้มไป Supabase Storage ไม่สำเร็จ: ${error.message}`)
  }
  const { data } = supabase.storage.from(bucketName).getPublicUrl(storageKey)
  return data.publicUrl
}

function buildDetailUrl(origin: string, documentNo: string) {
  return new URL(`/daily/weight-ticket-list/${encodeURIComponent(documentNo)}`, origin).toString()
}

function buildProductDetailRows(ticket: WeightTicketRecord) {
  const summaries = ticket.productSummaries?.length
    ? ticket.productSummaries.map((summary) => ({
      detail: `${summary.lineCount.toLocaleString('th-TH')} รายการ · ชั่ง ${formatWeight(summary.grossWeight)} กก. · หัก ${formatWeight(summary.deductWeight)} กก.`,
      name: `${summary.productId} ${summary.productName}`.trim(),
      netWeight: summary.netWeight,
    }))
    : ticket.lines.map((line) => ({
      detail: `${line.warehouseName || '-'} · ชั่ง ${formatWeight(line.grossWeightValue)} กก. · หัก ${formatWeight(line.deductionWeight)} กก.`,
      name: `${line.productId} ${line.productName}`.trim(),
      netWeight: line.netWeight,
    }))

  const visibleSummaries = summaries.slice(0, 3)
  const rows: any[] = visibleSummaries.map((item, index) => ({
    type: 'box' as const,
    layout: 'vertical' as const,
    spacing: 'xs' as const,
    margin: index === 0 ? 'sm' as const : 'md' as const,
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderWidth: '1px',
    cornerRadius: 'md' as const,
    paddingAll: '10px',
    contents: [
      {
        type: 'box' as const,
        layout: 'horizontal' as const,
        contents: [
          {
            type: 'text' as const,
            text: item.name || '-',
            color: '#1e293b',
            size: 'xs' as const,
            weight: 'bold' as const,
            flex: 5,
            wrap: true,
          },
          {
            type: 'text' as const,
            text: `${formatWeight(item.netWeight)} กก.`,
            color: '#0ea5e9',
            size: 'xs' as const,
            weight: 'bold' as const,
            align: 'end' as const,
            flex: 2,
            wrap: false,
          },
        ],
      },
      {
        type: 'text' as const,
        text: item.detail,
        color: '#64748b',
        size: 'xxs' as const,
        wrap: true,
      },
    ],
  }))

  if (summaries.length > visibleSummaries.length) {
    rows.push({
      type: 'box' as const,
      layout: 'vertical' as const,
      spacing: 'xs' as const,
      margin: 'md' as const,
      backgroundColor: '#f8fafc',
      borderColor: '#e2e8f0',
      borderWidth: '1px',
      cornerRadius: 'md' as const,
      paddingAll: '10px',
      contents: [
        {
          type: 'text' as const,
          text: `อีก ${summaries.length - visibleSummaries.length} ชนิด ดูรายการครบในระบบ`,
          color: '#475569',
          size: 'xs' as const,
          weight: 'bold' as const,
          wrap: true,
        },
      ],
    })
  }

  return rows
}

function buildFlexMessage(
  ticket: WeightTicketRecord,
  pdfUrl: string,
  detailUrl: string,
  imagePublicUrls: string[],
  albumImageUrls: string[],
  customMessage?: string
) {
  const isWti = ticket.type === 'WTI'
  const partyLabel = isWti ? 'ผู้ขาย' : 'ลูกค้า'
  const typeLabel = isWti ? '📥 รับสินค้า' : '📤 ส่งสินค้า'
  const headerBgColor = isWti ? '#064e3b' : '#0c4a6e'
  const bulletColor = isWti ? '#34d399' : '#38bdf8'
  const valueColor = isWti ? '#0ea5e9' : '#0ea5e9'

  let docTimeStr = ''
  try {
    const date = ticket.createdAt ? new Date(ticket.createdAt) : new Date()
    docTimeStr = date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok'
    })
  } catch {
    docTimeStr = '--:--'
  }

  const godownDisplay = ticket.godownName

  const productTypesCount = ticket.productSummaries?.length || 1
  const productDetailRows = buildProductDetailRows(ticket)

  // 1. Create Summary Card (Slide 1)
  const summaryBubble = {
    type: 'bubble' as const,
    action: {
      type: 'uri' as const,
      label: 'เปิดในระบบ',
      uri: detailUrl
    },
    header: {
      type: 'box' as const,
      layout: 'vertical' as const,
      backgroundColor: headerBgColor,
      paddingAll: '20px',
      contents: [
        {
          type: 'text' as const,
          text: '● FINISHED',
          color: bulletColor,
          size: 'xs' as const,
          weight: 'bold' as const
        },
        {
          type: 'text' as const,
          text: typeLabel,
          color: '#ffffff',
          size: 'xl' as const,
          weight: 'bold' as const,
          margin: 'sm' as const
        },
        {
          type: 'text' as const,
          text: docTimeStr,
          color: '#e2e8f0',
          size: 'sm' as const,
          margin: 'xs' as const
        }
      ]
    },
    body: {
      type: 'box' as const,
      layout: 'vertical' as const,
      backgroundColor: '#ffffff',
      paddingAll: '16px',
      spacing: 'sm' as const,
      contents: [
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          backgroundColor: '#f8fafc',
          borderColor: '#e2e8f0',
          borderWidth: '1px',
          cornerRadius: 'md' as const,
          paddingAll: '12px',
          spacing: 'sm' as const,
          contents: [
            {
              type: 'box' as const,
              layout: 'horizontal' as const,
              contents: [
                {
                  type: 'text' as const,
                  text: '🤝 ลูกค้า',
                  color: '#64748b',
                  size: 'xs' as const,
                  flex: 2
                },
                {
                  type: 'text' as const,
                  text: ticket.partyName || '-',
                  color: '#0f172a',
                  size: 'sm' as const,
                  weight: 'bold' as const,
                  flex: 5,
                  wrap: true
                }
              ]
            },
            {
              type: 'box' as const,
              layout: 'horizontal' as const,
              contents: [
                {
                  type: 'text' as const,
                  text: '📍 โกดัง',
                  color: '#64748b',
                  size: 'xs' as const,
                  flex: 2
                },
                {
                  type: 'text' as const,
                  text: godownDisplay,
                  color: '#0f172a',
                  size: 'sm' as const,
                  weight: 'bold' as const,
                  flex: 5,
                  wrap: true
                }
              ]
            },
            {
              type: 'box' as const,
              layout: 'horizontal' as const,
              margin: 'sm' as const,
              spacing: 'sm' as const,
              contents: [
                {
                  type: 'box' as const,
                  layout: 'vertical' as const,
                  backgroundColor: '#eff6ff',
                  cornerRadius: 'sm' as const,
                  paddingAll: '8px',
                  flex: 1,
                  contents: [
                    {
                      type: 'text' as const,
                      text: 'สุทธิ',
                      color: '#64748b',
                      size: 'xxs' as const
                    },
                    {
                      type: 'text' as const,
                      text: `${formatWeight(ticket.totals.netWeight)} กก.`,
                      color: valueColor,
                      size: 'sm' as const,
                      weight: 'bold' as const,
                      wrap: false
                    }
                  ]
                },
                {
                  type: 'box' as const,
                  layout: 'vertical' as const,
                  backgroundColor: '#f1f5f9',
                  cornerRadius: 'sm' as const,
                  paddingAll: '8px',
                  flex: 1,
                  contents: [
                    {
                      type: 'text' as const,
                      text: 'รายการ',
                      color: '#64748b',
                      size: 'xxs' as const
                    },
                    {
                      type: 'text' as const,
                      text: `${productTypesCount} ชนิด`,
                      color: '#0f172a',
                      size: 'sm' as const,
                      weight: 'bold' as const
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: 'separator' as const,
          margin: 'md' as const,
          color: '#e2e8f0'
        },
        {
          type: 'text' as const,
          text: 'รายละเอียดสินค้า',
          color: '#334155',
          size: 'xs' as const,
          weight: 'bold' as const,
          margin: 'sm' as const
        },
        ...productDetailRows,
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          spacing: 'xs' as const,
          margin: 'md' as const,
          backgroundColor: '#f8fafc',
          borderColor: '#e2e8f0',
          borderWidth: '1px',
          cornerRadius: 'md' as const,
          paddingAll: '10px',
          contents: [
            {
              type: 'text' as const,
              text: 'สรุปรวม',
              color: '#334155',
              size: 'xs' as const,
              weight: 'bold' as const
            },
            {
              type: 'text' as const,
              text: `สุทธิ ${formatWeight(ticket.totals.netWeight)} กก. · ชั่งรวม ${formatWeight(ticket.totals.grossWeight)} กก. · หัก ${formatWeight(ticket.totals.containerDeductionWeight + ticket.totals.deductionWeight)} กก.`,
              color: '#64748b',
              size: 'xxs' as const,
              wrap: true
            },
            {
              type: 'text' as const,
              text: `${ticket.documentNo} · ${formatDateDisplay(ticket.documentDate)} · รูป ${ticket.imageCount.toLocaleString('th-TH')}`,
              color: '#64748b',
              size: 'xxs' as const,
              wrap: true
            }
          ]
        }
      ]
    },
    footer: {
      type: 'box' as const,
      layout: 'vertical' as const,
      backgroundColor: '#0f172a',
      paddingAll: '10px',
      contents: [
        {
          type: 'text' as const,
          text: `#${ticket.documentNo}`,
          color: '#94a3b8',
          align: 'center' as const,
          size: 'sm' as const,
          weight: 'bold' as const
        }
      ]
    }
  }

  const bubbles: any[] = [summaryBubble]

  // 2. Paginate photo attachments (chunks of 8)
  const images = ticket.imageNames || []
  const decodedImages = images
    .map((img, idx) => {
      const asset = decodeStoredImageAsset(img)
      return {
        fileName: asset.fileName,
        url: imagePublicUrls[idx] || asset.url || ''
      }
    })
    .filter(asset => asset.url && (asset.url.startsWith('http://') || asset.url.startsWith('https://')))

  if (decodedImages.length > 0) {
    const chunkSize = 8
    const totalPages = Math.ceil(decodedImages.length / chunkSize)

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const chunk = decodedImages.slice(pageIdx * chunkSize, (pageIdx + 1) * chunkSize)
      const gridRows: any[] = []
      const rowCount = Math.ceil(chunk.length / 2)
      const albumUrl = albumImageUrls[pageIdx] || pdfUrl

      for (let r = 0; r < rowCount; r++) {
        const img1 = chunk[r * 2]
        const img2 = chunk[r * 2 + 1]
        const rowContents: any[] = []

        // Column 1
        const idx1 = pageIdx * chunkSize + r * 2 + 1
        rowContents.push(buildPhotoTile(img1, idx1, ticket.createdAt, isWti, albumUrl))

        // Column 2
        if (img2) {
          const idx2 = pageIdx * chunkSize + r * 2 + 2
          rowContents.push(buildPhotoTile(img2, idx2, ticket.createdAt, isWti, albumUrl))
        } else {
          rowContents.push({
            type: 'box' as const,
            layout: 'vertical' as const,
            flex: 1,
            contents: []
          })
        }

        gridRows.push({
          type: 'box' as const,
          layout: 'horizontal' as const,
          spacing: 'md' as const,
          contents: rowContents
        })
      }

      const photoBubble = {
        type: 'bubble' as const,
        action: {
          type: 'uri' as const,
          label: 'ดูรูปทั้งหมด',
          uri: albumUrl
        },
        header: {
          type: 'box' as const,
          layout: 'vertical' as const,
          backgroundColor: headerBgColor,
          paddingAll: '12px',
          contents: [
            {
              type: 'box' as const,
              layout: 'horizontal' as const,
              contents: [
                {
                  type: 'box' as const,
                  layout: 'vertical' as const,
                  flex: 3,
                  contents: [
                    {
                      type: 'text' as const,
                      text: `${typeLabel} · ${pageIdx + 1}/${totalPages}`,
                      color: '#ffffff',
                      size: 'sm' as const,
                      weight: 'bold' as const
                    },
                    {
                      type: 'text' as const,
                      text: `${ticket.partyName} · ${ticket.documentNo}`,
                      color: '#cbd5e1',
                      size: 'xxs' as const,
                      wrap: true
                    }
                  ]
                },
                {
                  type: 'text' as const,
                  text: 'NS PRODUCTION',
                  color: '#cbd5e1',
                  size: 'xxs' as const,
                  align: 'end' as const,
                  gravity: 'center' as const,
                  flex: 2
                }
              ]
            }
          ]
        },
        body: {
          type: 'box' as const,
          layout: 'vertical' as const,
          paddingAll: '12px',
          spacing: 'md' as const,
          contents: gridRows
        },
        footer: {
          type: 'box' as const,
          layout: 'vertical' as const,
          backgroundColor: headerBgColor,
          paddingAll: '12px',
          contents: [
            {
              type: 'box' as const,
              layout: 'horizontal' as const,
              contents: [
                {
                  type: 'box' as const,
                  layout: 'vertical' as const,
                  contents: [
                    {
                      type: 'text' as const,
                      text: typeLabel,
                      color: '#ffffff',
                      size: 'xs' as const,
                      weight: 'bold' as const
                    },
                    {
                      type: 'text' as const,
                      text: ticket.partyName || '-',
                      color: '#ffffff',
                      size: 'xs' as const,
                      weight: 'bold' as const
                    },
                    {
                      type: 'text' as const,
                      text: `#${ticket.documentNo}`,
                      color: isWti ? '#a7f3d0' : '#bae6fd',
                      size: 'xxs' as const
                    },
                    {
                      type: 'text' as const,
                      text: `โกดัง ${godownDisplay}`,
                      color: isWti ? '#a7f3d0' : '#bae6fd',
                      size: 'xxs' as const
                    }
                  ]
                },
                {
                  type: 'text' as const,
                  text: `📷 ${pageIdx + 1}/${totalPages}`,
                  color: '#ffffff',
                  size: 'sm' as const,
                  align: 'end' as const,
                  gravity: 'center' as const
                }
              ]
            }
          ]
        }
      }

      bubbles.push(photoBubble)
    }
  }

  const altTitle = isWti ? 'ใบรับของ WTI' : 'ใบส่งของ WTO'
  return {
    type: 'flex' as const,
    altText: `${altTitle} ${ticket.documentNo} | ${partyLabel}: ${ticket.partyName} | สุทธิ ${formatWeight(ticket.totals.netWeight)} กก.`,
    contents: {
      type: 'carousel' as const,
      contents: bubbles
    }
  }
}

function buildPhotoTile(
  asset: { fileName: string; url: string },
  index: number,
  ticketCreatedAt: string,
  isWti: boolean,
  albumUrl: string
) {
  const isOut = asset.fileName.toLowerCase().includes('out') ||
                asset.fileName.toLowerCase().includes('exit') ||
                asset.fileName.includes('ขาออก')
  const badgeText = isOut ? 'ขาออก' : (isWti ? 'รับเข้า' : 'ขาออก')
  const badgeColor = isOut ? '#10b981' : '#0ea5e9'
  const photoTime = getPhotoTimestamp(asset.fileName, ticketCreatedAt)

  return {
    type: 'box' as const,
    layout: 'vertical' as const,
    flex: 1,
    contents: [
      {
        type: 'box' as const,
        layout: 'vertical' as const,
        cornerRadius: 'md' as const,
        contents: [
          {
            type: 'image' as const,
            url: asset.url || '',
            aspectMode: 'cover' as const,
            aspectRatio: '4:3' as const,
            size: 'full' as const,
            action: {
              type: 'uri' as const,
              label: `ดูรูป`,
              uri: albumUrl
            }
          },
          {
            type: 'box' as const,
            layout: 'vertical' as const,
            position: 'absolute' as const,
            offsetTop: '4px',
            offsetStart: '4px',
            backgroundColor: badgeColor,
            cornerRadius: 'xs' as const,
            paddingStart: '4px',
            paddingEnd: '4px',
            paddingTop: '2px',
            paddingBottom: '2px',
            contents: [
              {
                type: 'text' as const,
                text: badgeText,
                color: '#ffffff',
                size: 'xxs' as const,
                weight: 'bold' as const
              }
            ]
          }
        ]
      },
      {
        type: 'box' as const,
        layout: 'horizontal' as const,
        margin: 'xs' as const,
        contents: [
          {
            type: 'text' as const,
            text: `🕒 ${photoTime}`,
            color: '#64748b',
            size: 'xxs' as const
          },
          {
            type: 'text' as const,
            text: `#${index}`,
            color: '#64748b',
            size: 'xxs' as const,
            align: 'end' as const
          }
        ]
      }
    ]
  }
}

function formatCustomTemplate(template: string, ticket: WeightTicketRecord, pdfUrl: string) {
  const normalizedTemplate = ensureGrossWeightLine(template)
  let docDateStr = ''
  try {
    const date = ticket.createdAt ? new Date(ticket.createdAt) : new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok'
    }).formatToParts(date)
    const byType = Object.fromEntries(parts.map(p => [p.type, p.value]))
    const yearBE = parseInt(byType.year, 10) + 543
    docDateStr = `${byType.day}/${byType.month}/${yearBE} ${byType.hour}:${byType.minute}`
  } catch {
    docDateStr = formatDateDisplay(ticket.documentDate)
  }

  return normalizedTemplate
    .replace(/\[DocumentNo\]/g, ticket.documentNo || '-')
    .replace(/\[PartyName\]/g, ticket.partyName || '-')
    .replace(/\[BranchName\]/g, ticket.branchName || '-')
    .replace(/\[DocDateTime\]/g, docDateStr)
    .replace(/\[GrossWeight\]/g, formatWeight(ticket.totals.grossWeight))
    .replace(/\[ContainerWeight\]/g, formatWeight(ticket.totals.containerDeductionWeight))
    .replace(/\[DeductionWeight\]/g, formatWeight(ticket.totals.deductionWeight))
    .replace(/\[NetWeight\]/g, formatWeight(ticket.totals.netWeight))
    .replace(/\[PdfUrl\]/g, pdfUrl || '-')
}

function ensureGrossWeightLine(template: string) {
  if (template.includes('[GrossWeight]')) return template

  const grossLine = 'น้ำหนักรวม: [GrossWeight] กก.'
  const lines = template.split(/\r?\n/)
  const existingLabelIndex = lines.findIndex((line) => line.includes('น้ำหนักรวม'))
  if (existingLabelIndex >= 0) {
    lines[existingLabelIndex] = grossLine
    return lines.join('\n')
  }

  const insertBeforeIndex = lines.findIndex((line) =>
    line.includes('[ContainerWeight]') ||
    line.includes('[DeductionWeight]') ||
    line.includes('[NetWeight]') ||
    line.includes('หักภาชนะ') ||
    line.includes('หักสิ่งเจือปน') ||
    line.includes('น้ำหนักสุทธิ')
  )
  if (insertBeforeIndex >= 0) {
    lines.splice(insertBeforeIndex, 0, grossLine)
    return lines.join('\n')
  }

  const insertAfterIndex = lines.findIndex((line) => line.includes('[DocDateTime]') || line.includes('วันที่/เวลาเอกสาร'))
  if (insertAfterIndex >= 0) {
    lines.splice(insertAfterIndex + 1, 0, grossLine)
    return lines.join('\n')
  }

  return `${template}\n${grossLine}`
}

function buildTextMessageContent(ticket: WeightTicketRecord, pdfUrl: string) {
  const partyLabel = ticket.type === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'
  const typeLabel = typeLabels[ticket.type] || (ticket.type === 'WTI' ? 'ใบรับของ' : 'ใบส่งของ')

  let docDateStr = ''
  try {
    const date = ticket.createdAt ? new Date(ticket.createdAt) : new Date()
    const parts = new Intl.DateTimeFormat('en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok'
    }).formatToParts(date)
    const byType = Object.fromEntries(parts.map(p => [p.type, p.value]))
    const yearBE = parseInt(byType.year, 10) + 543
    docDateStr = `${byType.day}/${byType.month}/${yearBE} ${byType.hour}:${byType.minute}`
  } catch {
    docDateStr = formatDateDisplay(ticket.documentDate)
  }

  return `${typeLabel} ${ticket.type} ${ticket.documentNo}
━━━━━━━━━━━━━━━
${partyLabel}: ${ticket.partyName}
สาขา: ${ticket.branchName}
วันที่/เวลาเอกสาร: ${docDateStr}
น้ำหนักรวม: ${formatWeight(ticket.totals.grossWeight)} กก.
หักภาชนะ: ${formatWeight(ticket.totals.containerDeductionWeight)} กก.
หักสิ่งเจือปน: ${formatWeight(ticket.totals.deductionWeight)} กก.
น้ำหนักสุทธิ: ${formatWeight(ticket.totals.netWeight)} กก.
━━━━━━━━━━━━━━━
ลิงค์โหลด pdf:
${pdfUrl}`
}

export async function sendLinePush(targetId: string, messages: any[], token: string, retryKey?: string, signal?: AbortSignal) {
  if (!token) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  if (retryKey) {
    headers['X-Line-Retry-Key'] = retryKey
  }

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    body: JSON.stringify({
      messages,
      to: targetId,
    }),
    headers,
    method: 'POST',
    signal,
  })

  if (response.status === 409 && retryKey) {
    const acceptedRequestId = response.headers.get('x-line-accepted-request-id') || response.headers.get('x-line-request-id')
    return {
      lineRequestId: acceptedRequestId || null,
      isConflict: true
    }
  }

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`LINE Push Message ไม่สำเร็จ (${response.status}): ${body}`)
  }
  return {
    lineRequestId: response.headers.get('x-line-request-id') || null,
    isConflict: false
  }
}

async function recordNotificationLog(values: {
  customMessage?: string
  errorMessage?: string
  lineRequestId?: string | null
  pdfStorageBucket: string
  pdfStorageKey?: string
  pdfUrl?: string
  requestedBy: string
  status: NotificationLogStatus
  targetId?: string
  ticketId: bigint
}) {
  try {
    await prisma.$executeRaw`
      insert into public.weight_ticket_notification_logs (
        weight_ticket_id,
        delivery_channel,
        target_id,
        status,
        pdf_storage_bucket,
        pdf_storage_key,
        pdf_url,
        line_request_id,
        custom_message,
        error_message,
        requested_by,
        sent_at
      ) values (
        ${values.ticketId},
        'line',
        ${values.targetId ?? null},
        ${values.status},
        ${values.pdfStorageBucket},
        ${values.pdfStorageKey ?? null},
        ${values.pdfUrl ?? null},
        ${values.lineRequestId ?? null},
        ${values.customMessage ?? null},
        ${values.errorMessage ?? null},
        ${values.requestedBy},
        ${values.status === 'sent' ? new Date() : null}
      )
    `
  } catch {
    // Notification logging should not hide the send result from the operator.
  }
}

async function resolveImagePublicUrls(ticket: WeightTicketRecord, bucketName: string): Promise<string[]> {
  const images = ticket.imageNames || []
  const publicUrls: string[] = []

  for (const img of images) {
    const asset = decodeStoredImageAsset(img)
    if (!asset.url) {
      publicUrls.push('')
      continue
    }

    if (asset.url.startsWith('http://') || asset.url.startsWith('https://')) {
      publicUrls.push(asset.url)
      continue
    }

    try {
      const imgData = imageFromDataUrl(asset.url)
      if (imgData) {
        if (process.env.MOCK_PDF_UPLOAD === 'true') {
          publicUrls.push('https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400')
        } else {
          const supabase = getSupabaseAdminClient()
          if (!supabase) {
            publicUrls.push('https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400')
            continue
          }
          const storageKey = `${safeStorageSegment(ticket.documentNo)}/photos/${safeStorageSegment(asset.fileName)}`
          const { error } = await supabase.storage.from(bucketName).upload(storageKey, imgData.bytes, {
            contentType: imgData.type === 'png' ? 'image/png' : 'image/jpeg',
            upsert: true,
          })
          if (error) {
            console.error('Failed to upload ticket image to Supabase:', error.message)
            publicUrls.push('https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=400')
          } else {
            const { data } = supabase.storage.from(bucketName).getPublicUrl(storageKey)
            publicUrls.push(data.publicUrl)
          }
        }
      } else {
        publicUrls.push('')
      }
    } catch (err) {
      console.warn('Failed to upload dataUrl photo:', err)
      publicUrls.push('')
    }
  }

  return publicUrls
}

export async function notifyWeightTicketLine(documentNo: string, options: NotifyOptions) {
  const loaded = await loadWeightTicketRecord(documentNo, options.scopedBranchIds)
  if (!loaded) {
    return { code: 'NOT_FOUND' as const, status: 404, error: 'ไม่พบใบรับ-ส่งของ' }
  }

  const configs = await resolveNotificationConfigs()

  let targets: string[] = []
  if (options.targetId && options.targetId !== 'routing') {
    targets = [options.targetId]
  } else if (configs.lineDefaultTargetId && options.targetId !== 'routing') {
    targets = [configs.lineDefaultTargetId]
  } else {
    // Multi-target & Branch Routing
    const isWti = loaded.record.type === 'WTI'
    const targetGroups = await prisma.line_groups.findMany({
      where: {
        is_active: true,
        notify_wti: isWti ? true : undefined,
        notify_wto: !isWti ? true : undefined,
        OR: [
          { branch_code: null },
          { branch_code: '' },
          { branch_code: loaded.record.branchId }
        ]
      }
    })
    targets = targetGroups.map(g => g.group_id)
  }

  if (targets.length === 0) {
    return {
      code: 'NO_TARGETS_ROUTED' as const,
      status: 400,
      error: 'ไม่มีกลุ่มไลน์ที่ตรงกับเงื่อนไขการส่งแจ้งเตือน',
    }
  }

  try {
    const profile = await loadCompanyPrintProfile(loaded.record.branchId)
    const detailUrl = buildDetailUrl(options.origin || configs.appUrl, loaded.record.documentNo)

    // --- PDF + album generation (optional, graceful degradation) ---
    // ถ้า Playwright/Supabase พัง → ยังส่งข้อความ LINE ได้ (ไม่มี PDF แนบ)
    // เพราะ template รองรับ pdfUrl='' อยู่แล้ว (degrades เป็น '-')
    // ทำตามแนวทางของ ChatGPT: อย่าให้ PDF gen เป็น hard blocker ของทั้ง notification
    let pdfUrl = ''
    let albumImageUrls: string[] = []
    let pdfStorageBucket = configs.pdfBucket
    let pdfStorageKey: string | undefined

    try {
      // ใช้ module ใหม่ react-pdf + @napi-rs/canvas (แทน Playwright)
      // กำจัด dependency Chromium binary ออกจาก Docker image ทั้งหมด
      const { pdfBuffer, albumImages } = await generateWeightTicketPdfReactPdf(loaded.record, profile as CompanyProfilePrintValues, {
        showBadges: configs.albumShowBadges,
        showTimestamps: configs.albumShowTimestamps,
        quality: configs.albumQuality,
      })
      const uploaded = await uploadPdf(loaded.record, pdfBuffer, configs.pdfBucket)
      pdfUrl = uploaded.pdfUrl
      pdfStorageKey = uploaded.storageKey

      // Upload album images
      for (const albumImg of albumImages) {
        const url = await uploadAlbumImage(loaded.record, albumImg.buffer, albumImg.pageIdx, configs.pdfBucket)
        albumImageUrls.push(url)
      }
    } catch (pdfErr) {
      // PDF/album พัง → log warning แล้วทำงานต่อ ส่งข้อความอย่างเดียว (ไม่มี PDF แนบ)
      const errMsg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr)
      console.warn('[notifyWeightTicketLine] PDF generation failed, sending message without PDF attachment:', errMsg)
    }

    const imagePublicUrls = await resolveImagePublicUrls(loaded.record, configs.pdfBucket)
    const flexMessage = buildFlexMessage(loaded.record, pdfUrl, detailUrl, imagePublicUrls, albumImageUrls, options.customMessage)
    const customTemplate = loaded.record.type === 'WTI' ? configs.wtiTemplate : configs.wtoTemplate
    const textMessage = {
      type: 'text',
      text: formatCustomTemplate(customTemplate, loaded.record, pdfUrl)
    }

    const sentResults: Array<{ targetId: string; status: 'sent' | 'failed' | 'skipped'; lineRequestId?: string; error?: string }> = []
    let lastSentRequestId: string | null = null

    for (const target of targets) {
      // 1. Check double send from logs if force is not true
      if (!options.force) {
        const existingLogs = await prisma.$queryRaw<Array<{ id: unknown }>>`
          select id
          from public.weight_ticket_notification_logs
          where weight_ticket_id = ${loaded.id}
            and status = 'sent'
            and target_id = ${target}
          limit 1
        `
        if (existingLogs.length > 0) {
          sentResults.push({ targetId: target, status: 'skipped' })
          continue
        }
      }

      // 2. Send Line Push
      try {
        const pushResult = await sendLinePush(target, [textMessage, flexMessage], configs.lineChannelAccessToken, options.retryKey)
        const lineRequestId = pushResult.lineRequestId
        lastSentRequestId = lineRequestId || null
        await recordNotificationLog({
          customMessage: options.customMessage,
          lineRequestId,
          pdfStorageBucket,
          pdfStorageKey,
          pdfUrl,
          requestedBy: options.requestedBy,
          status: 'sent',
          targetId: target,
          ticketId: loaded.id,
        })
        sentResults.push({
          targetId: target,
          status: pushResult.isConflict ? 'skipped' : 'sent',
          lineRequestId: lineRequestId || undefined
        })
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err)
        await recordNotificationLog({
          customMessage: options.customMessage,
          errorMessage: errMsg,
          pdfStorageBucket,
          requestedBy: options.requestedBy,
          status: 'failed',
          targetId: target,
          ticketId: loaded.id,
        })
        sentResults.push({ targetId: target, status: 'failed', error: errMsg })
      }
    }

    const sentCount = sentResults.filter((r) => r.status === 'sent').length
    const skippedCount = sentResults.filter((r) => r.status === 'skipped').length
    const failedResults = sentResults.filter((r) => r.status === 'failed')

    if (sentCount > 0) {
      await syncWeightTicketToGoogleSheets('update', {
        ...loaded.record,
        pdfUrl,
      } as any).catch((err) => {
        console.error('[line-notification] failed to sync to google sheets:', err)
      })
    }

    if (sentCount === 0 && skippedCount > 0 && failedResults.length === 0) {
      return {
        code: 'ALREADY_SENT' as const,
        detailUrl,
        error: 'เอกสารนี้เคยส่งเข้า LINE แล้ว จึงไม่ได้ส่งซ้ำอัตโนมัติ',
        lineRequestId: null,
        pdfUrl,
        sentResults,
        status: 409,
      }
    }

    if (sentCount === 0) {
      return {
        code: 'LINE_PUSH_FAILED' as const,
        detailUrl,
        error: failedResults[0]?.error || 'ส่ง LINE ไม่สำเร็จ',
        lineRequestId: null,
        pdfUrl,
        sentResults,
        status: 502,
      }
    }

    return {
      code: 'SENT' as const,
      detailUrl,
      lineRequestId: lastSentRequestId,
      pdfUrl,
      status: 200,
      sentResults
    }
  } catch (caught) {
    const errorMessage = caught instanceof Error ? caught.message : 'สร้างเอกสารหรืออัปโหลด PDF ไม่สำเร็จ'
    return { code: 'SEND_FAILED' as const, status: 500, error: errorMessage }
  }
}
