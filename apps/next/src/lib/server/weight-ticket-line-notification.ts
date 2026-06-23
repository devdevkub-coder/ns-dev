import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { Prisma } from '../../../generated/prisma/client'
import { decodeStoredImageAsset, formatDateDisplay, formatWeight, type WeightTicketRecord, typeLabels } from '@/lib/weight-tickets'
import { prisma } from '@/lib/server/prisma'
import { getSupabaseAdminClient } from '@/lib/server/supabase-admin'
import {
  findScopedWeightTicket,
  getWeightTicketUsageCounts,
  mapWeightTicketRow,
  type WeightTicketRow,
} from '@/lib/server/weight-tickets'
import { syncWeightTicketToGoogleSheets } from '@/lib/server/google-sheets-sync'

type CompanyPrintProfile = {
  address: string
  branchCode: string | null
  name: string
  nameEn: string | null
  phone: string
  taxId: string | null
}

type NotifyOptions = {
  customMessage?: string
  origin: string
  requestedBy: string
  scopedBranchIds: string[]
  targetId?: string
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
        ],
      },
    },
  })

  const configMap = Object.fromEntries(dbSettings.map((s) => [s.key, s.value]))

  return {
    lineChannelAccessToken: configMap.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    lineChannelSecret: configMap.LINE_CHANNEL_SECRET || process.env.LINE_CHANNEL_SECRET || '',
    lineDefaultTargetId: configMap.LINE_DEFAULT_TARGET_ID || process.env.LINE_DEFAULT_TARGET_ID || '',
    pdfBucket: configMap.WEIGHT_TICKET_PDF_BUCKET || process.env.WEIGHT_TICKET_PDF_BUCKET || 'weight-ticket-pdfs',
    appUrl: configMap.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '',
  }
}

function cleanText(value: string | null | undefined, fallback = '-') {
  const cleaned = String(value ?? '').trim()
  return cleaned || fallback
}

function safeStorageSegment(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const chars = [...text]
  const lines: string[] = []
  let line = ''
  chars.forEach((char) => {
    const next = `${line}${char}`
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line)
      line = char.trimStart()
      return
    }
    line = next
  })
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

function drawText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, color = rgb(0.13, 0.18, 0.27)) {
  page.drawText(text, { color, font, size, x, y })
}

function drawWrappedText(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, maxWidth: number, lineHeight = size + 4) {
  const lines = wrapText(text, font, size, maxWidth)
  lines.forEach((line, index) => drawText(page, line, x, y - (index * lineHeight), font, size))
  return y - (lines.length * lineHeight)
}

function imageFromDataUrl(value: string) {
  const match = value.match(/^data:image\/(png|jpe?g);base64,(.+)$/i)
  if (!match) return null
  return {
    bytes: Buffer.from(match[2], 'base64'),
    type: match[1].toLowerCase().startsWith('jp') ? 'jpg' as const : 'png' as const,
  }
}

async function loadCompanyPrintProfile(branchId: string): Promise<CompanyPrintProfile | null> {
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
    branchCode: profile.branch_code,
    name: profile.name,
    nameEn: profile.name_en,
    phone: profile.phone,
    taxId: profile.tax_id,
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

async function drawImageTile(pdfDoc: PDFDocument, page: PDFPage, rawValue: string, index: number, x: number, y: number, width: number, height: number, font: PDFFont) {
  const asset = decodeStoredImageAsset(rawValue)
  page.drawRectangle({ borderColor: rgb(0.78, 0.82, 0.88), borderWidth: 0.8, color: rgb(0.98, 0.99, 1), height, width, x, y })
  if (!asset.url) {
    drawWrappedText(page, `รูปที่ ${index + 1}: ${asset.fileName}`, x + 10, y + height - 24, font, 10, width - 20)
    return
  }
  const imageData = imageFromDataUrl(asset.url)
  if (!imageData) {
    drawWrappedText(page, `รูปที่ ${index + 1}: เปิดรูปไม่ได้`, x + 10, y + height - 24, font, 10, width - 20)
    return
  }
  const image = imageData.type === 'png'
    ? await pdfDoc.embedPng(imageData.bytes)
    : await pdfDoc.embedJpg(imageData.bytes)
  const scaled = image.scale(Math.min(width / image.width, height / image.height))
  const imageX = x + ((width - scaled.width) / 2)
  const imageY = y + ((height - scaled.height) / 2)
  page.drawImage(image, { height: scaled.height, width: scaled.width, x: imageX, y: imageY })
  page.drawRectangle({ color: rgb(0.06, 0.09, 0.16), opacity: 0.68, height: 18, width: 44, x: x + width - 48, y: y + 4 })
  drawText(page, `#${index + 1}`, x + width - 38, y + 9, font, 8, rgb(1, 1, 1))
}

export async function generateWeightTicketPdf(ticket: WeightTicketRecord, profile: CompanyPrintProfile | null) {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const fontBytes = await readFile(join(process.cwd(), 'src/assets/fonts/NotoSansThai-Regular.ttf'))
  const font = await pdfDoc.embedFont(fontBytes, { subset: true })
  const green = rgb(0, 0.48, 0.34)
  const slate = rgb(0.13, 0.18, 0.27)
  const muted = rgb(0.39, 0.45, 0.55)
  const page = pdfDoc.addPage([595.28, 841.89])
  const { height, width } = page.getSize()

  page.drawRectangle({ color: green, height: 72, width, x: 0, y: height - 72 })
  drawText(page, profile?.name ?? 'NS SCRAP', 36, height - 30, font, 18, rgb(1, 1, 1))
  drawText(page, profile?.nameEn ?? 'Weight Ticket', 36, height - 52, font, 9, rgb(0.83, 0.96, 0.9))
  drawText(page, typeLabels[ticket.type], width - 176, height - 42, font, 17, rgb(1, 1, 1))

  let y = height - 104
  const partyLabel = ticket.type === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'
  const detailRows = [
    ['เลขที่', ticket.documentNo, 'วันที่', formatDateDisplay(ticket.documentDate)],
    [partyLabel, ticket.partyName, 'สาขา', ticket.branchName],
    ['ทะเบียนรถ', ticket.vehicleNo, 'ผู้บันทึก', ticket.enteredBy],
    ['หมายเหตุ', ticket.remark || '-', 'เบอร์/ภาษี', [profile?.phone, profile?.taxId].filter(Boolean).join(' / ') || '-'],
  ]

  detailRows.forEach(([leftLabel, leftValue, rightLabel, rightValue]) => {
    drawText(page, `${leftLabel}:`, 36, y, font, 10, muted)
    drawWrappedText(page, cleanText(leftValue), 90, y, font, 10, 230, 13)
    drawText(page, `${rightLabel}:`, 352, y, font, 10, muted)
    drawWrappedText(page, cleanText(rightValue), 408, y, font, 10, 140, 13)
    y -= 30
  })

  y -= 10
  page.drawRectangle({ color: rgb(0.94, 0.97, 0.95), height: 24, width: width - 72, x: 36, y })
  const columns = [42, 72, 238, 334, 410, 502]
  ;['#', 'สินค้า', 'น้ำหนักรวม', 'หัก', 'สุทธิ', 'คลัง'].forEach((label, index) => {
    drawText(page, label, columns[index], y + 8, font, 9, slate)
  })
  y -= 20
  ticket.lines.slice(0, 18).forEach((line, index) => {
    y -= 22
    page.drawLine({ color: rgb(0.9, 0.92, 0.95), end: { x: width - 36, y: y - 4 }, start: { x: 36, y: y - 4 }, thickness: 0.5 })
    drawText(page, String(index + 1), columns[0], y, font, 8, slate)
    drawWrappedText(page, line.productName, columns[1], y, font, 8, 150, 10)
    drawText(page, formatWeight(line.grossWeightValue), columns[2], y, font, 8, slate)
    drawText(page, formatWeight(line.deductionWeight), columns[3], y, font, 8, slate)
    drawText(page, formatWeight(line.netWeight), columns[4], y, font, 8, slate)
    drawText(page, line.warehouseName || '-', columns[5], y, font, 8, slate)
  })

  y -= 48
  page.drawRectangle({ color: green, height: 42, width: width - 72, x: 36, y })
  drawText(page, `น้ำหนักรวม: ${formatWeight(ticket.totals.grossWeight)} กก.`, 54, y + 25, font, 11, rgb(1, 1, 1))
  drawText(page, `หักรวม: ${formatWeight(ticket.totals.deductionWeight)} กก.`, 236, y + 25, font, 11, rgb(1, 1, 1))
  drawText(page, `น้ำหนักสุทธิ: ${formatWeight(ticket.totals.netWeight)} กก.`, 390, y + 25, font, 12, rgb(1, 1, 1))

  page.drawLine({ color: rgb(0.78, 0.82, 0.88), end: { x: 230, y: 78 }, start: { x: 80, y: 78 }, thickness: 0.6 })
  page.drawLine({ color: rgb(0.78, 0.82, 0.88), end: { x: 510, y: 78 }, start: { x: 360, y: 78 }, thickness: 0.6 })
  drawText(page, 'ผู้ชั่ง / Weigher', 112, 58, font, 9, muted)
  drawText(page, 'ลูกค้า / Customer', 394, 58, font, 9, muted)

  const imageValues = ticket.imageNames.slice(0, 8)
  if (imageValues.length > 0) {
    const imagePage = pdfDoc.addPage([595.28, 841.89])
    imagePage.drawRectangle({ color: green, height: 54, width, x: 0, y: height - 54 })
    drawText(imagePage, `${typeLabels[ticket.type]} ${ticket.documentNo} - รูปประกอบ`, 36, height - 34, font, 15, rgb(1, 1, 1))
    const tileW = 252
    const tileH = 150
    const startX = 36
    const startY = height - 230
    for (let index = 0; index < 8; index += 1) {
      const col = index % 2
      const row = Math.floor(index / 2)
      const x = startX + (col * (tileW + 20))
      const tileY = startY - (row * (tileH + 22))
      if (imageValues[index]) {
        await drawImageTile(pdfDoc, imagePage, imageValues[index], index, x, tileY, tileW, tileH, font)
      } else {
        imagePage.drawRectangle({ borderColor: rgb(0.86, 0.89, 0.93), borderWidth: 0.8, color: rgb(0.98, 0.99, 1), height: tileH, width: tileW, x, y: tileY })
        drawText(imagePage, `ช่องรูปที่ ${index + 1}`, x + 86, tileY + 72, font, 10, muted)
      }
    }
  }

  return Buffer.from(await pdfDoc.save())
}

async function uploadPdf(ticket: WeightTicketRecord, pdfBuffer: Buffer, bucketName: string) {
  const supabase = getSupabaseAdminClient()
  if (!supabase) {
    throw new Error('ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY สำหรับอัปโหลด PDF')
  }
  const storageKey = `${safeStorageSegment(ticket.documentNo)}/${Date.now()}-${safeStorageSegment(ticket.documentNo)}.pdf`
  const { error } = await supabase.storage.from(bucketName).upload(storageKey, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (error) throw new Error(`อัปโหลด PDF ไป Supabase Storage ไม่สำเร็จ: ${error.message}`)
  const { data } = supabase.storage.from(bucketName).getPublicUrl(storageKey)
  return { pdfUrl: data.publicUrl, storageKey }
}

function buildDetailUrl(origin: string, documentNo: string) {
  return new URL(`/daily/weight-ticket-list/${encodeURIComponent(documentNo)}`, origin).toString()
}

function buildFlexMessage(ticket: WeightTicketRecord, pdfUrl: string, detailUrl: string, customMessage?: string) {
  const partyLabel = ticket.type === 'WTI' ? 'ผู้ขาย' : 'ลูกค้า'
  const title = `${typeLabels[ticket.type]} ${ticket.documentNo}`
  return {
    altText: `${title} | ${partyLabel}: ${ticket.partyName} | สุทธิ ${formatWeight(ticket.totals.netWeight)} กก.`,
    contents: {
      body: {
        contents: [
          { color: '#0f766e', size: 'sm', text: ticket.type, type: 'text', weight: 'bold' },
          { color: '#111827', size: 'lg', text: title, type: 'text', weight: 'bold', wrap: true },
          ...(customMessage ? [{ color: '#475569', margin: 'sm', size: 'sm', text: customMessage, type: 'text', wrap: true }] : []),
          { margin: 'md', type: 'separator' },
          { contents: [{ color: '#64748b', flex: 2, size: 'sm', text: partyLabel, type: 'text' }, { color: '#111827', flex: 5, size: 'sm', text: ticket.partyName, type: 'text', wrap: true }], layout: 'baseline', margin: 'md', type: 'box' },
          { contents: [{ color: '#64748b', flex: 2, size: 'sm', text: 'สาขา', type: 'text' }, { color: '#111827', flex: 5, size: 'sm', text: ticket.branchName, type: 'text', wrap: true }], layout: 'baseline', margin: 'sm', type: 'box' },
          { contents: [{ color: '#64748b', flex: 2, size: 'sm', text: 'ทะเบียนรถ', type: 'text' }, { color: '#111827', flex: 5, size: 'sm', text: ticket.vehicleNo || '-', type: 'text', wrap: true }], layout: 'baseline', margin: 'sm', type: 'box' },
          { contents: [{ color: '#64748b', flex: 2, size: 'sm', text: 'สุทธิ', type: 'text' }, { color: '#0f766e', flex: 5, size: 'md', text: `${formatWeight(ticket.totals.netWeight)} กก.`, type: 'text', weight: 'bold' }], layout: 'baseline', margin: 'sm', type: 'box' },
        ],
        type: 'box',
      },
      footer: {
        contents: [
          { action: { label: 'เปิด PDF', type: 'uri', uri: pdfUrl }, color: '#0f766e', style: 'primary', type: 'button' },
          { action: { label: 'เปิดในระบบ', type: 'uri', uri: detailUrl }, style: 'secondary', type: 'button' },
        ],
        spacing: 'sm',
        type: 'box',
      },
      type: 'bubble',
    },
    type: 'flex',
  }
}

async function sendLinePush(targetId: string, message: ReturnType<typeof buildFlexMessage>, token: string) {
  if (!token) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN')

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    body: JSON.stringify({
      messages: [message],
      to: targetId,
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`LINE Push Message ไม่สำเร็จ (${response.status}): ${body}`)
  }
  return response.headers.get('x-line-request-id')
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

export async function notifyWeightTicketLine(documentNo: string, options: NotifyOptions) {
  const loaded = await loadWeightTicketRecord(documentNo, options.scopedBranchIds)
  if (!loaded) {
    return { code: 'NOT_FOUND' as const, status: 404, error: 'ไม่พบใบรับ-ส่งของ' }
  }

  const configs = await resolveNotificationConfigs()
  const targetId = options.targetId || configs.lineDefaultTargetId
  if (!targetId) {
    return { code: 'LINE_NOT_CONFIGURED' as const, status: 400, error: 'ยังไม่ได้ตั้งค่า LINE_DEFAULT_TARGET_ID หรือ targetId สำหรับส่งข้อความ' }
  }

  try {
    const profile = await loadCompanyPrintProfile(loaded.record.branchId)
    const pdfBuffer = await generateWeightTicketPdf(loaded.record, profile)
    const uploaded = await uploadPdf(loaded.record, pdfBuffer, configs.pdfBucket)
    const detailUrl = buildDetailUrl(options.origin || configs.appUrl, loaded.record.documentNo)
    const flexMessage = buildFlexMessage(loaded.record, uploaded.pdfUrl, detailUrl, options.customMessage)
    const lineRequestId = await sendLinePush(targetId, flexMessage, configs.lineChannelAccessToken)
    await recordNotificationLog({
      customMessage: options.customMessage,
      lineRequestId,
      pdfStorageBucket: configs.pdfBucket,
      pdfStorageKey: uploaded.storageKey,
      pdfUrl: uploaded.pdfUrl,
      requestedBy: options.requestedBy,
      status: 'sent',
      targetId,
      ticketId: loaded.id,
    })
    // Sync to Google Sheets with the generated PDF URL
    await syncWeightTicketToGoogleSheets('update', {
      ...loaded.record,
      pdfUrl: uploaded.pdfUrl,
    } as any).catch((err) => {
      console.error('[line-notification] failed to sync to google sheets:', err)
    })
    return {
      code: 'SENT' as const,
      detailUrl,
      lineRequestId,
      pdfUrl: uploaded.pdfUrl,
      status: 200,
    }
  } catch (caught) {
    const errorMessage = caught instanceof Error ? caught.message : 'ส่ง LINE ไม่สำเร็จ'
    await recordNotificationLog({
      customMessage: options.customMessage,
      errorMessage,
      pdfStorageBucket: configs.pdfBucket,
      requestedBy: options.requestedBy,
      status: 'failed',
      targetId,
      ticketId: loaded.id,
    })
    return { code: 'SEND_FAILED' as const, status: 500, error: errorMessage }
  }
}
