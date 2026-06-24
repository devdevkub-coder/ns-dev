import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
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

type CompanyPrintProfile = {
  address: string
  branchCode: string | null
  name: string
  nameEn: string | null
  phone: string
  taxId: string | null
  logoUrl: string | null
  footerNote: string | null
}

type NotifyOptions = {
  customMessage?: string
  origin: string
  requestedBy: string
  scopedBranchIds: string[]
  targetId?: string
  force?: boolean
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

function resolveThaiFontPath() {
  const cwd = process.cwd()
  const candidates = [
    join(cwd, 'public/fonts/NotoSansThai-Regular.ttf'),
    join(cwd, 'src/assets/fonts/NotoSansThai-Regular.ttf'),
    join(cwd, 'apps/next/public/fonts/NotoSansThai-Regular.ttf'),
    join(cwd, 'apps/next/src/assets/fonts/NotoSansThai-Regular.ttf'),
  ]
  const fontPath = candidates.find((candidate) => existsSync(candidate))
  if (!fontPath) {
    throw new Error(`ไม่พบไฟล์ฟอนต์ไทย NotoSansThai-Regular.ttf ใน path ที่รองรับ: ${candidates.join(', ')}`)
  }
  return fontPath
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
    logoUrl: profile.logo_url,
    footerNote: profile.footer_note,
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

// --- PDF Layout & Text Alignment Drawing Helpers ---

function drawRightAlignedXText(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.13, 0.18, 0.27)
) {
  const width = font.widthOfTextAtSize(text, size)
  page.drawText(text, {
    x: rightX - width,
    y,
    font,
    size,
    color
  })
}

function drawCenterAlignedXText(
  page: PDFPage,
  text: string,
  centerX: number,
  y: number,
  font: PDFFont,
  size: number,
  color = rgb(0.13, 0.18, 0.27)
) {
  const width = font.widthOfTextAtSize(text, size)
  page.drawText(text, {
    x: centerX - width / 2,
    y,
    font,
    size,
    color
  })
}

function drawPanel(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  font: PDFFont
) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.82, 0.85, 0.9),
    borderWidth: 0.8,
    color: rgb(1, 1, 1)
  })
  page.drawRectangle({
    x: x + 0.4,
    y: y + height - 16.4,
    width: width - 0.8,
    height: 16,
    color: rgb(0.94, 0.96, 0.98)
  })
  page.drawText(title, {
    x: x + 8,
    y: y + height - 12,
    font,
    size: 8.5,
    color: rgb(0.2, 0.25, 0.35)
  })
}

function drawPanelField(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  font: PDFFont
) {
  page.drawText(label, {
    x,
    y: y + 11,
    font,
    size: 7.5,
    color: rgb(0.47, 0.52, 0.60)
  })
  page.drawText(value, {
    x,
    y,
    font,
    size: 9.5,
    color: rgb(0.09, 0.13, 0.22)
  })
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

// --- Printable Row Parsing Helpers (Parity with weight-ticket-print.ts) ---

type PrintWeightRow = {
  className?: string
  containerDeductionWeight: number
  detail: string
  deductionWeight: number
  grossWeight: number
  label: string
  netWeight: number
  productName: string
  rank?: string
}

function formatPrintableWeight(value: number) {
  if (value % 1 === 0) {
    return value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function cleanNote(note: string | null | undefined): string {
  if (!note) return '-'
  return note
    .replace(/\[impurity_product_id:[^\]]+\]/gi, '')
    .replace(/\[impurity_product_name:[^\]]+\]/gi, '')
    .replace(/\s*\(\s*([^)]+?)\s+\d+(?:\.\d+)?\s*kg\s*\)/gi, ' ($1)')
    .replace(/\s*\([\d.]+\s*kg\)/gi, '')
    .replace(/\s*[\d.]+\s*kg/gi, '')
    .trim()
}

function cleanImpurityName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .replace(/\s*\([\d.]+\s*kg\)/gi, '')
    .replace(/\s*[\d.]+\s*kg/gi, '')
    .trim()
}

function isImpurityLine(line: WeightTicketRecord['lines'][number]) {
  return line.grossWeightValue === 0 && Boolean(line.impurityName || line.impurityId)
}

function isPurchaseFromImpurityLine(line: WeightTicketRecord['lines'][number]) {
  return line.grossWeightValue > 0 && line.note.includes('มาจากสิ่งเจือปน')
}

function formatImpurityPurchaseSourceDetail(line: WeightTicketRecord['lines'][number]) {
  const match = /^มาจากสิ่งเจือปน \(([^)]+)\) ของรายการที่ ([^:]+):\s*(.+)$/.exec(line.note.trim())
  if (!match) return line.note || 'ซื้อเพิ่มจากสิ่งเจือปนที่เป็นสินค้า'

  const [, , , sourceProduct] = match
  return `มาจาก: ${sourceProduct}`
}

function findPurchaseLineForImpurity(
  impurityLine: WeightTicketRecord['lines'][number],
  sourceProductName: string,
  purchaseLines: WeightTicketRecord['lines'],
) {
  return purchaseLines.find((purchaseLine) => {
    if (!purchaseLine.note.includes(sourceProductName) && !purchaseLine.note.includes(impurityLine.productId)) return false
    return Math.abs(purchaseLine.grossWeightValue - impurityLine.deductionWeight) < 0.001
  })
}

function formatImpuritySummaryDetail(
  impurityLines: WeightTicketRecord['lines'],
  sourceProductName: string,
  purchaseLines: WeightTicketRecord['lines'],
) {
  if (impurityLines.length === 0) return 'ไม่มีหักสิ่งเจือปน'

  const details = impurityLines.map((line, index) => {
    const purchaseLine = findPurchaseLineForImpurity(line, sourceProductName, purchaseLines)
    const impurityName = cleanImpurityName(line.impurityName) || 'สิ่งเจือปน'
    const deductionText = `${formatPrintableWeight(line.deductionWeight)} กก.`
    const prefix = `- ${index + 1}. ${impurityName} ${deductionText}`
    if (purchaseLine) {
      return `${prefix} ซื้อเป็น ${purchaseLine.productName}`
    }

    const isOtherProductImpurity = impurityName === 'สินค้าอื่น' || impurityName === 'อื่นๆ' || impurityName === 'อย่างอื่น'
    if (isOtherProductImpurity) return `${prefix} ไม่ซื้อ`
    return prefix
  })

  return ['หักสิ่งเจือปน:', ...details].join('\n')
}

function sumPrintLines(lines: WeightTicketRecord['lines']) {
  return lines.reduce(
    (summary, line) => ({
      containerDeductionWeight: summary.containerDeductionWeight + line.containerDeductionWeightValue,
      deductionWeight: summary.deductionWeight + line.deductionWeight,
      grossWeight: summary.grossWeight + line.grossWeightValue,
      netBeforeImpurityWeight: summary.netBeforeImpurityWeight + Math.max(0, line.grossWeightValue - line.containerDeductionWeightValue),
      netWeight: summary.netWeight + line.netWeight,
    }),
    { containerDeductionWeight: 0, deductionWeight: 0, grossWeight: 0, netBeforeImpurityWeight: 0, netWeight: 0 },
  )
}

function buildPrintWeightRows(ticket: WeightTicketRecord, isReceipt: boolean): PrintWeightRow[] {
  if (!isReceipt) {
    return ticket.lines.map((line, index) => ({
      containerDeductionWeight: line.containerDeductionWeightValue,
      deductionWeight: line.deductionWeight,
      detail: line.note || '-',
      grossWeight: line.grossWeightValue,
      label: 'จากสินค้า',
      netWeight: line.netWeight,
      productName: line.productName,
      rank: String(index + 1),
    }))
  }

  const rows: PrintWeightRow[] = []
  const allPurchaseLines = ticket.lines.filter(isPurchaseFromImpurityLine)
  ticket.productSummaries.forEach((summary, groupIndex) => {
    const productLines = ticket.lines.filter((line) => line.productId === summary.productId)
    const realLotLines = productLines.filter((line) => !isImpurityLine(line) && !isPurchaseFromImpurityLine(line))
    const impurityLines = productLines.filter(isImpurityLine)
    const purchaseLines = productLines.filter(isPurchaseFromImpurityLine)
    const realLotTotals = sumPrintLines(realLotLines)
    const impurityTotals = sumPrintLines(impurityLines)
    const realLotNetAfterImpurity = Math.max(0, realLotTotals.netBeforeImpurityWeight - impurityTotals.deductionWeight)

    rows.push({
      className: 'product-heading',
      containerDeductionWeight: 0,
      deductionWeight: 0,
      detail: `${realLotLines.length.toLocaleString('th-TH')} เต๋า · หักสิ่งเจือปน ${impurityLines.length.toLocaleString('th-TH')} รายการ · ซื้อเพิ่ม ${purchaseLines.length.toLocaleString('th-TH')} รายการ`,
      grossWeight: 0,
      label: 'กลุ่มสินค้า',
      netWeight: 0,
      productName: summary.productName,
      rank: String(groupIndex + 1),
    })

    if (realLotLines.length > 0) {
      realLotLines.forEach((line, lotIndex) => {
        rows.push({
          className: 'lot-row',
          containerDeductionWeight: line.containerDeductionWeightValue,
          deductionWeight: line.deductionWeight,
          detail: cleanNote(line.note),
          grossWeight: line.grossWeightValue,
          label: `เต๋าที่ ${lotIndex + 1}`,
          netWeight: Math.max(0, line.grossWeightValue - line.containerDeductionWeightValue - line.deductionWeight),
          productName: summary.productName,
        })
      })

      rows.push({
        className: 'source-row',
        containerDeductionWeight: realLotTotals.containerDeductionWeight,
        deductionWeight: impurityTotals.deductionWeight,
        detail: [
          `${realLotLines.length.toLocaleString('th-TH')} เต๋า`,
          formatImpuritySummaryDetail(impurityLines, summary.productName, allPurchaseLines),
        ].join('\n'),
        grossWeight: realLotTotals.grossWeight,
        label: '',
        netWeight: realLotNetAfterImpurity,
        productName: 'สรุปรวมจากเต๋า',
      })
    }

    purchaseLines.forEach((line) => {
      rows.push({
        className: 'purchase-row',
        containerDeductionWeight: line.containerDeductionWeightValue,
        deductionWeight: 0,
        detail: formatImpurityPurchaseSourceDetail(line),
        grossWeight: line.grossWeightValue,
        label: 'ซื้อเพิ่มจากสิ่งเจือปน',
        netWeight: Math.max(0, line.grossWeightValue - line.containerDeductionWeightValue),
        productName: summary.productName,
      })
    })

    rows.push({
      className: 'product-total',
      containerDeductionWeight: summary.containerDeductionWeight,
      deductionWeight: summary.deductWeight,
      detail: `รวมจากเต๋าหลังหักสิ่งเจือปน${purchaseLines.length > 0 ? ' และรายการซื้อเพิ่มจากสิ่งเจือปน' : ''}`,
      grossWeight: summary.grossWeight,
      label: 'รวมสินค้า',
      netWeight: summary.netWeight,
      productName: summary.productName,
    })
  })

  return rows
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

// --- Main PDF Generation Function ---

export async function generateWeightTicketPdf(ticket: WeightTicketRecord, profile: CompanyPrintProfile | null) {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const fontBytes = await readFile(resolveThaiFontPath())
  const font = await pdfDoc.embedFont(fontBytes, { subset: true })

  const isReceipt = ticket.type === 'WTI'
  const printRows = buildPrintWeightRows(ticket, isReceipt)

  // 1. Pagination calculation for ticket rows
  const FIRST_PAGE_LIMIT = 12
  const CONTINUATION_PAGE_LIMIT = 17

  const pagesData: PrintWeightRow[][] = []
  let cursor = 0
  while (cursor < printRows.length || pagesData.length === 0) {
    const limit = pagesData.length === 0 ? FIRST_PAGE_LIMIT : CONTINUATION_PAGE_LIMIT
    pagesData.push(printRows.slice(cursor, cursor + limit))
    cursor += limit
  }

  const totalTicketPages = pagesData.length
  const totalPhotos = ticket.imageNames.length
  const totalPages = totalTicketPages + (totalPhotos > 0 ? 1 : 0)

  // Load logo image if present
  let logoImage: any = null
  if (profile?.logoUrl) {
    try {
      if (profile.logoUrl.startsWith('data:')) {
        const logoData = imageFromDataUrl(profile.logoUrl)
        if (logoData) {
          logoImage = logoData.type === 'png'
            ? await pdfDoc.embedPng(logoData.bytes)
            : await pdfDoc.embedJpg(logoData.bytes)
        }
      } else {
        const res = await fetch(profile.logoUrl)
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer())
          logoImage = profile.logoUrl.toLowerCase().endsWith('.png')
            ? await pdfDoc.embedPng(buffer)
            : await pdfDoc.embedJpg(buffer)
        }
      }
    } catch (err) {
      console.warn('Failed to embed company logo in PDF:', err)
    }
  }

  // --- DRAW TICKET PAGES ---
  for (let pageIdx = 0; pageIdx < totalTicketPages; pageIdx++) {
    const page = pdfDoc.addPage([595.28, 841.89])
    const currentRows = pagesData[pageIdx]
    const isLastTicketPage = pageIdx === totalTicketPages - 1

    // A. Decorative Top accent line
    page.drawRectangle({
      x: 30,
      y: 805,
      width: 535.28,
      height: 4,
      color: rgb(0.06, 0.40, 0.20)
    })

    // B. Draw Company Logo & Profile (Left)
    if (logoImage) {
      const scaled = logoImage.scale(Math.min(60 / logoImage.width, 60 / logoImage.height))
      const imageX = 30 + ((60 - scaled.width) / 2)
      const imageY = 730 + ((60 - scaled.height) / 2)
      page.drawImage(logoImage, {
        x: imageX,
        y: imageY,
        width: scaled.width,
        height: scaled.height
      })
    } else {
      page.drawRectangle({
        x: 30,
        y: 730,
        width: 60,
        height: 60,
        borderColor: rgb(0.8, 0.82, 0.85),
        borderWidth: 0.8,
        color: rgb(0.97, 0.98, 0.99)
      })
      page.drawText('ไม่มีโลโก้', {
        x: 42,
        y: 755,
        font,
        size: 7.5,
        color: rgb(0.5, 0.55, 0.6)
      })
    }

    // Company profile texts
    page.drawText(profile?.name ?? 'NS SCRAP', { x: 100, y: 780, font, size: 14, color: rgb(0.06, 0.09, 0.16) })
    if (profile?.nameEn) {
      page.drawText(profile.nameEn, { x: 100, y: 769, font, size: 8, color: rgb(0.28, 0.33, 0.43) })
    }
    const cleanAddress = (profile?.address || '-').trim()
    drawWrappedText(page, cleanAddress, 100, 758, font, 7.5, 230, 9)

    const branchLabel = profile?.branchCode ? `สาขา ${profile.branchCode}` : ''
    const contactLine = [
      profile?.phone ? `โทร ${profile.phone}` : null,
      profile?.taxId ? `เลขประจำตัวผู้เสียภาษี: ${profile.taxId}` : null,
      branchLabel || null
    ].filter(Boolean).join(' · ')
    page.drawText(contactLine, { x: 100, y: 730, font, size: 7.5, color: rgb(0.28, 0.33, 0.43) })

    // C. Document Title (Right)
    const docTitle = isReceipt ? 'ใบชั่งน้ำหนัก / ใบรับสินค้า' : 'ใบชั่งน้ำหนัก / ใบส่งของ'
    const titleColor = isReceipt ? rgb(0.06, 0.40, 0.20) : rgb(0.02, 0.52, 0.78)
    drawRightAlignedXText(page, docTitle, 565.28, 775, font, 18, titleColor)

    // D. Section panels (Customer and Doc Info)
    const partyLabel = isReceipt ? 'ผู้ขาย/ผู้ส่งของ' : 'ลูกค้า/ผู้รับสินค้า'
    // Left Box
    drawPanel(page, 30, 650, 260, 64, partyLabel, font)
    drawPanelField(page, 'ชื่อ', ticket.partyName || '-', 38, 680, font)
    drawPanelField(page, 'สาขา', ticket.branchName || '-', 165, 680, font)
    drawPanelField(page, 'ทะเบียนรถ', ticket.vehicleNo || '-', 38, 656, font)
    drawPanelField(page, 'พนักงานชั่ง', ticket.enteredBy || '-', 165, 656, font)

    // Right Box
    drawPanel(page, 305, 650, 260, 64, 'ข้อมูลเอกสาร / Document Info', font)
    drawPanelField(page, 'เลขที่เอกสาร', ticket.documentNo, 313, 680, font)
    drawPanelField(page, 'วันที่เอกสาร', formatDateDisplay(ticket.documentDate) || '-', 440, 680, font)
    drawPanelField(page, 'เวลาสร้าง', formatDateTime(ticket.createdAt), 313, 656, font)
    drawPanelField(page, 'โกดัง', ticket.warehouseName || '-', 440, 656, font)

    // E. Draw Table Headers
    const headersY = 622
    const headerH = 18
    page.drawRectangle({
      x: 30,
      y: headersY,
      width: 535.28,
      height: headerH,
      color: rgb(0.88, 0.91, 0.94)
    })
    page.drawRectangle({
      x: 30,
      y: headersY,
      width: 535.28,
      height: headerH,
      borderColor: rgb(0.8, 0.82, 0.85),
      borderWidth: 0.8
    })

    const colX = isReceipt
      ? [30, 50, 260, 315, 370, 440, 505]
      : [30, 50, 390, 475]
    const colW = isReceipt
      ? [20, 210, 55, 55, 70, 65, 60.28]
      : [20, 340, 85, 90.28]
    const tableHeaders = isReceipt
      ? ['#', 'รายการสินค้า', 'น้ำหนักรวม', 'หักภาชนะ', 'น้ำหนักหลังหัก', 'หักสิ่งเจือปน', 'น้ำหนักสุทธิ']
      : ['#', 'รายการสินค้า', 'น้ำหนักรวม', 'น้ำหนักสุทธิ']

    tableHeaders.forEach((lbl, idx) => {
      const x = colX[idx]
      const w = colW[idx]
      // Draw grid vertical header lines
      if (idx > 0) {
        page.drawLine({
          start: { x, y: headersY },
          end: { x, y: headersY + headerH },
          color: rgb(0.8, 0.82, 0.85),
          thickness: 0.8
        })
      }
      // Print header text
      if (idx === 0) {
        drawCenterAlignedXText(page, lbl, x + w / 2, headersY + 5.5, font, 7.5, rgb(0.12, 0.16, 0.24))
      } else if (idx === 1) {
        page.drawText(lbl, { x: x + 4, y: headersY + 5.5, font, size: 7.5, color: rgb(0.12, 0.16, 0.24) })
      } else {
        drawRightAlignedXText(page, lbl, x + w - 4, headersY + 5.5, font, 7.5, rgb(0.12, 0.16, 0.24))
      }
    })

    // F. Draw Table Rows
    let rowY = headersY
    currentRows.forEach((row) => {
      const detailLines = (row.detail || '').split('\n').filter(line => line.trim() && line.trim() !== '-')
      const extraLines = Math.max(0, detailLines.length - 1)
      const rowHeight = 22 + extraLines * 8

      rowY -= rowHeight

      // Background styling matching web print layout
      let bgColor = rgb(1, 1, 1)
      if (row.className === 'product-heading') bgColor = rgb(0.94, 0.96, 0.98)
      else if (row.className === 'source-row') bgColor = rgb(0.97, 0.98, 0.99)
      else if (row.className === 'purchase-row') bgColor = rgb(0.93, 0.96, 1.0)
      else if (row.className === 'product-total') bgColor = rgb(0.92, 0.99, 0.95)

      page.drawRectangle({
        x: 30,
        y: rowY,
        width: 535.28,
        height: rowHeight,
        color: bgColor
      })

      // Box borders for table cells
      page.drawRectangle({
        x: 30,
        y: rowY,
        width: 535.28,
        height: rowHeight,
        borderColor: rgb(0.86, 0.89, 0.92),
        borderWidth: 0.5
      })

      // Vertical separators for rows
      colX.forEach((cx, idx) => {
        if (idx > 0) {
          page.drawLine({
            start: { x: cx, y: rowY },
            end: { x: cx, y: rowY + rowHeight },
            color: rgb(0.86, 0.89, 0.92),
            thickness: 0.5
          })
        }
      })

      // Row values drawing
      const cellColor = row.className === 'product-total' || row.className === 'product-heading'
        ? rgb(0.05, 0.1, 0.2)
        : rgb(0.13, 0.18, 0.27)

      // # column
      if (row.rank) {
        drawCenterAlignedXText(page, row.rank, colX[0] + colW[0] / 2, rowY + rowHeight - 14, font, 8, cellColor)
      }

      // Items column
      page.drawText(row.productName, {
        x: colX[1] + 4,
        y: rowY + rowHeight - 14,
        font,
        size: 8,
        color: cellColor
      })
      if (row.label && row.className !== 'product-total' && row.className !== 'product-heading') {
        page.drawText(row.label, {
          x: colX[1] + 4,
          y: rowY + rowHeight - 22,
          font,
          size: 7,
          color: rgb(0.45, 0.5, 0.55)
        })
      }

      detailLines.forEach((line, lineIdx) => {
        const textOffset = row.label ? 29 + lineIdx * 8 : 21 + lineIdx * 8
        page.drawText(line, {
          x: colX[1] + 4,
          y: rowY + rowHeight - textOffset,
          font,
          size: 6.8,
          color: rgb(0.45, 0.5, 0.55)
        })
      })

      // Weights drawing
      if (row.className !== 'product-heading') {
        if (isReceipt) {
          const grossWeightStr = formatPrintableWeight(row.grossWeight)
          const containerWeightStr = formatPrintableWeight(row.containerDeductionWeight)
          const afterContainerVal = Math.max(0, row.grossWeight - row.containerDeductionWeight)
          const afterContainerStr = formatPrintableWeight(afterContainerVal)
          const deductionWeightStr = formatPrintableWeight(row.deductionWeight)
          const netWeightStr = formatPrintableWeight(row.netWeight)

          drawRightAlignedXText(page, grossWeightStr, colX[2] + colW[2] - 4, rowY + rowHeight - 14, font, 8, cellColor)
          drawRightAlignedXText(page, containerWeightStr, colX[3] + colW[3] - 4, rowY + rowHeight - 14, font, 8, cellColor)
          drawRightAlignedXText(page, afterContainerStr, colX[4] + colW[4] - 4, rowY + rowHeight - 14, font, 8, cellColor)
          drawRightAlignedXText(page, deductionWeightStr, colX[5] + colW[5] - 4, rowY + rowHeight - 14, font, 8, cellColor)
          drawRightAlignedXText(page, netWeightStr, colX[6] + colW[6] - 4, rowY + rowHeight - 14, font, 8, cellColor)
        } else {
          const grossWeightStr = formatPrintableWeight(row.grossWeight)
          const netWeightStr = formatPrintableWeight(row.netWeight)

          drawRightAlignedXText(page, grossWeightStr, colX[2] + colW[2] - 4, rowY + rowHeight - 14, font, 8, cellColor)
          drawRightAlignedXText(page, netWeightStr, colX[3] + colW[3] - 4, rowY + rowHeight - 14, font, 8, cellColor)
        }
      }
    })

    // G. Draw Table Footer Summary Row
    if (isLastTicketPage) {
      rowY -= 22
      page.drawRectangle({
        x: 30,
        y: rowY,
        width: 535.28,
        height: 22,
        color: rgb(0.93, 0.95, 0.97)
      })
      page.drawRectangle({
        x: 30,
        y: rowY,
        width: 535.28,
        height: 22,
        borderColor: rgb(0.7, 0.73, 0.76),
        borderWidth: 0.8
      })

      // Vertical separators for footer
      colX.forEach((cx, idx) => {
        if (idx > 0) {
          page.drawLine({
            start: { x: cx, y: rowY },
            end: { x: cx, y: rowY + 22 },
            color: rgb(0.7, 0.73, 0.76),
            thickness: 0.8
          })
        }
      })

      // 'รวมทั้งสิ้น' Label
      page.drawText('รวมทั้งสิ้น', {
        x: colX[1] + 4,
        y: rowY + 7,
        font,
        size: 8.5,
        color: rgb(0.09, 0.13, 0.22)
      })

      // Draw footer totals values
      if (isReceipt) {
        const totalAfterContainerVal = Math.max(0, ticket.totals.grossWeight - ticket.totals.containerDeductionWeight)
        drawRightAlignedXText(page, formatPrintableWeight(ticket.totals.grossWeight), colX[2] + colW[2] - 4, rowY + 7, font, 8.5, rgb(0.09, 0.13, 0.22))
        drawRightAlignedXText(page, formatPrintableWeight(ticket.totals.containerDeductionWeight), colX[3] + colW[3] - 4, rowY + 7, font, 8.5, rgb(0.09, 0.13, 0.22))
        drawRightAlignedXText(page, formatPrintableWeight(totalAfterContainerVal), colX[4] + colW[4] - 4, rowY + 7, font, 8.5, rgb(0.09, 0.13, 0.22))
        drawRightAlignedXText(page, formatPrintableWeight(ticket.totals.deductionWeight), colX[5] + colW[5] - 4, rowY + 7, font, 8.5, rgb(0.09, 0.13, 0.22))
        drawRightAlignedXText(page, formatPrintableWeight(ticket.totals.netWeight), colX[6] + colW[6] - 4, rowY + 7, font, 9.5, rgb(0.05, 0.45, 0.25))
      } else {
        drawRightAlignedXText(page, formatPrintableWeight(ticket.totals.grossWeight), colX[2] + colW[2] - 4, rowY + 7, font, 8.5, rgb(0.09, 0.13, 0.22))
        drawRightAlignedXText(page, formatPrintableWeight(ticket.totals.netWeight), colX[3] + colW[3] - 4, rowY + 7, font, 9.5, rgb(0.05, 0.45, 0.25))
      }
    }

    // H. Draw bottom section (only on last page)
    if (isLastTicketPage) {
      // 1. Remark
      drawPanel(page, 30, 150, 260, 60, 'หมายเหตุ', font)
      drawWrappedText(page, ticket.remark || '-', 38, 192, font, 7.8, 244, 9.5)

      // 2. Weights Summary
      const lotLines = ticket.lines.filter(l => !isImpurityLine(l) && !isPurchaseFromImpurityLine(l))
      const lotCount = lotLines.length
      const lotGrossWeight = lotLines.reduce((sum, l) => sum + l.grossWeightValue, 0)
      const lotContainerWeight = lotLines.reduce((sum, l) => sum + l.containerDeductionWeightValue, 0)

      drawPanel(page, 305, 142, 260, 68, 'ข้อมูลน้ำหนัก / Weight Info', font)
      const linesData = [
        ['จำนวนรายการ', `${lotCount} รายการ`],
        ['น้ำหนักรวม', `${formatPrintableWeight(lotGrossWeight)} กก.`],
        ['หักภาชนะ', `${formatPrintableWeight(lotContainerWeight)} กก.`],
        ['หักสิ่งเจือปน', `${formatPrintableWeight(ticket.totals.deductionWeight)} กก.`],
        ['น้ำหนักสุทธิ', `${formatPrintableWeight(ticket.totals.netWeight)} กก.`]
      ]
      linesData.forEach(([lbl, val], idx) => {
        const textY = 142 + 68 - 25 - idx * 9
        page.drawText(lbl, { x: 313, y: textY, font, size: 7.5, color: rgb(0.4, 0.45, 0.5) })
        const valColor = idx === 4 ? rgb(0.05, 0.45, 0.25) : rgb(0.1, 0.15, 0.25)
        const valSize = idx === 4 ? 8.5 : 7.5
        drawRightAlignedXText(page, val, 305 + 260 - 8, textY, font, valSize, valColor)
      })

      // 3. Signatures
      const sigLeft = isReceipt ? 'ผู้ส่งสินค้า' : 'ผู้ส่งของ'
      const sigMiddle = isReceipt ? 'ผู้รับเข้าคลัง' : 'ผู้รับของ'
      const signatureLabels = [sigLeft, 'พนักงานชั่ง', sigMiddle, 'ผู้อนุมัติ']

      const sigColsX = [
        30 + 66.9,
        30 + 133.8 + 66.9,
        30 + 267.6 + 66.9,
        30 + 401.4 + 66.9
      ]

      signatureLabels.forEach((label, idx) => {
        const centerX = sigColsX[idx]
        // Signature Line
        drawCenterAlignedXText(page, '___________________', centerX, 68, font, 8.5, rgb(0.58, 0.62, 0.68))
        // Name / Title
        drawCenterAlignedXText(page, label, centerX, 56, font, 8, rgb(0.12, 0.16, 0.24))
        // Date placeholder
        drawCenterAlignedXText(page, 'วันที่ ____ / ____ / ______', centerX, 44, font, 7.5, rgb(0.4, 0.45, 0.5))

        // Print employee name for พนักงานชั่ง
        if (idx === 1) {
          drawCenterAlignedXText(page, ticket.enteredBy || '-', centerX, 76, font, 8, rgb(0.12, 0.16, 0.24))
        }
      })
    } else {
      drawRightAlignedXText(page, 'ต่อหน้าถัดไป / Continued...', 565.28, 40, font, 9, rgb(0.4, 0.45, 0.5))
    }

    // I. Draw Page Footer
    page.drawLine({
      start: { x: 30, y: 25 },
      end: { x: 565.28, y: 25 },
      color: rgb(0.85, 0.88, 0.91),
      thickness: 0.5
    })
    const footerText = (profile?.footerNote || '').trim()
    page.drawText(footerText, { x: 30, y: 14, font, size: 7.5, color: rgb(0.47, 0.52, 0.60) })
    drawRightAlignedXText(page, `หน้า ${pageIdx + 1} / ${totalPages}`, 565.28, 14, font, 7.5, rgb(0.47, 0.52, 0.60))
  }

  // --- DRAW PHOTO ALBUM PAGE (Page 2 / Last Page) ---
  if (totalPhotos > 0) {
    const bannerHeight = 60
    const rowHeight = 120
    const timestampHeight = 18
    const gapY = 16
    const paddingBottom = 40

    const rowsCount = Math.ceil(totalPhotos / 4)
    const albumPageHeight = 90 + rowsCount * rowHeight + rowsCount * (timestampHeight + gapY) + paddingBottom

    const imagePage = pdfDoc.addPage([595.28, albumPageHeight])

    // A. Top Banner
    const bannerColor = isReceipt ? rgb(0.09, 0.63, 0.89) : rgb(0.09, 0.70, 0.40)
    imagePage.drawRectangle({
      x: 0,
      y: albumPageHeight - bannerHeight,
      width: 595.28,
      height: bannerHeight,
      color: bannerColor
    })

    const titleStr = isReceipt ? '📥 รับสินค้า' : '📤 ส่งสินค้า'
    imagePage.drawText(titleStr, { x: 20, y: albumPageHeight - 22, font, size: 14, color: rgb(1, 1, 1) })
    imagePage.drawText(ticket.partyName || '-', { x: 20, y: albumPageHeight - 37, font, size: 10, color: rgb(1, 1, 1) })

    const metaStr = `#${ticket.documentNo} · โกดัง ${ticket.warehouseName || '-'} · 📷 ${totalPhotos} รูป · ${formatDateDisplay(ticket.documentDate)}`
    imagePage.drawText(metaStr, { x: 20, y: albumPageHeight - 50, font, size: 7.5, color: rgb(1, 1, 1) })

    // B. Draw Grid
    const colWidth = 130
    const colHeight = 120
    const gapX = 12
    const startX = 20

    for (let idx = 0; idx < totalPhotos; idx++) {
      const c = idx % 4
      const r = Math.floor(idx / 4)
      const x = startX + c * (colWidth + gapX)
      const y = albumPageHeight - 90 - r * (colHeight + timestampHeight + gapY) - colHeight

      const rawImg = ticket.imageNames[idx]
      const asset = decodeStoredImageAsset(rawImg)

      // Background card box
      imagePage.drawRectangle({
        x,
        y,
        width: colWidth,
        height: colHeight,
        color: rgb(1, 1, 1),
        borderColor: rgb(0.85, 0.88, 0.92),
        borderWidth: 0.5
      })

      let loadedImageObj: any = null
      if (asset.url) {
        try {
          const imgData = imageFromDataUrl(asset.url)
          if (imgData) {
            loadedImageObj = imgData.type === 'png'
              ? await pdfDoc.embedPng(imgData.bytes)
              : await pdfDoc.embedJpg(imgData.bytes)
          }
        } catch (err) {
          console.warn('Failed to embed photo inside album grid:', err)
        }
      }

      if (loadedImageObj) {
        const scaled = loadedImageObj.scale(Math.min(colWidth / loadedImageObj.width, colHeight / loadedImageObj.height))
        const drawX = x + (colWidth - scaled.width) / 2
        const drawY = y + (colHeight - scaled.height) / 2
        imagePage.drawImage(loadedImageObj, {
          x: drawX,
          y: drawY,
          width: scaled.width,
          height: scaled.height
        })
      } else {
        // Fallback for missing/broken photos
        imagePage.drawRectangle({
          x: x + 1,
          y: y + 1,
          width: colWidth - 2,
          height: colHeight - 2,
          color: rgb(0.97, 0.98, 0.99)
        })
        const brokenName = asset.fileName || `รูปที่ ${idx + 1}`
        drawCenterAlignedXText(imagePage, 'ไม่มีรูปภาพ / โหลดไม่ได้', x + colWidth / 2, y + 62, font, 7, rgb(0.5, 0.55, 0.6))
        drawCenterAlignedXText(imagePage, brokenName.substring(0, 20), x + colWidth / 2, y + 50, font, 6, rgb(0.6, 0.65, 0.7))
      }

      // Draw Top-Left Badge (📥 รับเข้า / 📤 ขาออก)
      const isOut = asset.fileName.toLowerCase().includes('out') ||
                    asset.fileName.toLowerCase().includes('exit') ||
                    asset.fileName.includes('ขาออก')
      const badgeText = isOut ? 'ขาออก' : (isReceipt ? 'รับเข้า' : 'ขาออก')
      const badgeColor = isOut ? rgb(0.09, 0.70, 0.40) : (isReceipt ? rgb(0.09, 0.63, 0.89) : rgb(0.09, 0.70, 0.40))

      imagePage.drawRectangle({
        x: x + 4,
        y: y + colHeight - 16,
        width: 32,
        height: 12,
        color: badgeColor
      })
      imagePage.drawText(badgeText, {
        x: x + 8,
        y: y + colHeight - 12.5,
        font,
        size: 6.5,
        color: rgb(1, 1, 1)
      })

      // Draw timestamp text below photo
      const timeStr = getPhotoTimestamp(asset.fileName, ticket.createdAt)
      drawCenterAlignedXText(imagePage, timeStr, x + colWidth / 2, y - 12, font, 7.5, rgb(0.45, 0.5, 0.55))
    }

    // C. Draw Photo Page Footer
    imagePage.drawLine({
      start: { x: 20, y: 25 },
      end: { x: 575.28, y: 25 },
      color: rgb(0.85, 0.88, 0.91),
      thickness: 0.5
    })
    imagePage.drawText('NS Scrap Production · NS Solutions Thailand', { x: 20, y: 14, font, size: 7.5, color: rgb(0.5, 0.55, 0.6) })
    drawRightAlignedXText(imagePage, `หน้า ${totalTicketPages + 1} / ${totalPages}`, 575.28, 14, font, 7.5, rgb(0.5, 0.55, 0.6))
  }

  return Buffer.from(await pdfDoc.save())
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

function buildDetailUrl(origin: string, documentNo: string) {
  return new URL(`/daily/weight-ticket-list/${encodeURIComponent(documentNo)}`, origin).toString()
}

function buildFlexMessage(ticket: WeightTicketRecord, pdfUrl: string, detailUrl: string, imagePublicUrls: string[], customMessage?: string) {
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

  const uniqueWarehouses = [...new Set(ticket.lines.map(l => l.warehouseName).filter(Boolean))]
  const warehouseDisplay = ticket.warehouseName || (uniqueWarehouses.length > 0 ? uniqueWarehouses.join(', ') : '-')

  const productTypesCount = ticket.productSummaries?.length || 1

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
      paddingAll: '20px',
      spacing: 'md' as const,
      contents: [
        {
          type: 'box' as const,
          layout: 'horizontal' as const,
          contents: [
            {
              type: 'text' as const,
              text: '🤝 ลูกค้า',
              color: '#64748b',
              size: 'sm' as const,
              flex: 2
            },
            {
              type: 'text' as const,
              text: ticket.partyName || '-',
              color: '#1e293b',
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
              size: 'sm' as const,
              flex: 2
            },
            {
              type: 'text' as const,
              text: warehouseDisplay,
              color: '#1e293b',
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
              text: '📦 ผลผลิต',
              color: '#64748b',
              size: 'sm' as const,
              flex: 2
            },
            {
              type: 'text' as const,
              text: `${formatWeight(ticket.totals.netWeight)} กก.`,
              color: valueColor,
              size: 'lg' as const,
              weight: 'bold' as const,
              flex: 5
            }
          ]
        },
        {
          type: 'box' as const,
          layout: 'horizontal' as const,
          contents: [
            {
              type: 'text' as const,
              text: '📋 รายการ',
              color: '#64748b',
              size: 'sm' as const,
              flex: 2
            },
            {
              type: 'text' as const,
              text: `${productTypesCount} ชนิด`,
              color: '#1e293b',
              size: 'sm' as const,
              weight: 'bold' as const,
              flex: 5
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

      for (let r = 0; r < rowCount; r++) {
        const img1 = chunk[r * 2]
        const img2 = chunk[r * 2 + 1]
        const rowContents: any[] = []

        // Column 1
        const idx1 = pageIdx * chunkSize + r * 2 + 1
        rowContents.push(buildPhotoTile(img1, idx1, ticket.createdAt, isWti))

        // Column 2
        if (img2) {
          const idx2 = pageIdx * chunkSize + r * 2 + 2
          rowContents.push(buildPhotoTile(img2, idx2, ticket.createdAt, isWti))
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
                      text: `โกดัง ${warehouseDisplay}`,
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

function buildPhotoTile(asset: { fileName: string; url: string }, index: number, ticketCreatedAt: string, isWti: boolean) {
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
              label: `รูปที่ ${index}`,
              uri: asset.url || ''
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
หักภาชนะ: ${formatWeight(ticket.totals.containerDeductionWeight)} กก.
หักสิ่งเจือปน: ${formatWeight(ticket.totals.deductionWeight)} กก.
น้ำหนักสุทธิ: ${formatWeight(ticket.totals.netWeight)} กก.
━━━━━━━━━━━━━━━
ลิงค์โหลด pdf:
${pdfUrl}`
}

async function sendLinePush(targetId: string, messages: any[], token: string) {
  if (!token) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN')

  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    body: JSON.stringify({
      messages,
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
  if (options.targetId) {
    targets = [options.targetId]
  } else if (configs.lineDefaultTargetId) {
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
    const pdfBuffer = await generateWeightTicketPdf(loaded.record, profile)
    const uploaded = await uploadPdf(loaded.record, pdfBuffer, configs.pdfBucket)
    const detailUrl = buildDetailUrl(options.origin || configs.appUrl, loaded.record.documentNo)
    const imagePublicUrls = await resolveImagePublicUrls(loaded.record, configs.pdfBucket)
    const flexMessage = buildFlexMessage(loaded.record, uploaded.pdfUrl, detailUrl, imagePublicUrls, options.customMessage)
    const textMessage = {
      type: 'text',
      text: buildTextMessageContent(loaded.record, uploaded.pdfUrl)
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
        const lineRequestId = await sendLinePush(target, [textMessage, flexMessage], configs.lineChannelAccessToken)
        lastSentRequestId = lineRequestId || null
        await recordNotificationLog({
          customMessage: options.customMessage,
          lineRequestId,
          pdfStorageBucket: configs.pdfBucket,
          pdfStorageKey: uploaded.storageKey,
          pdfUrl: uploaded.pdfUrl,
          requestedBy: options.requestedBy,
          status: 'sent',
          targetId: target,
          ticketId: loaded.id,
        })
        sentResults.push({ targetId: target, status: 'sent', lineRequestId: lineRequestId || undefined })
      } catch (err: any) {
        const errMsg = err instanceof Error ? err.message : String(err)
        await recordNotificationLog({
          customMessage: options.customMessage,
          errorMessage: errMsg,
          pdfStorageBucket: configs.pdfBucket,
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
        pdfUrl: uploaded.pdfUrl,
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
        pdfUrl: uploaded.pdfUrl,
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
        pdfUrl: uploaded.pdfUrl,
        sentResults,
        status: 502,
      }
    }

    return {
      code: 'SENT' as const,
      detailUrl,
      lineRequestId: lastSentRequestId,
      pdfUrl: uploaded.pdfUrl,
      status: 200,
      sentResults
    }
  } catch (caught) {
    const errorMessage = caught instanceof Error ? caught.message : 'สร้างเอกสารหรืออัปโหลด PDF ไม่สำเร็จ'
    return { code: 'SEND_FAILED' as const, status: 500, error: errorMessage }
  }
}
