import 'server-only'
import {
  createCanvas,
  loadImage,
  GlobalFonts,
  type Canvas,
  type SKRSContext2D,
} from '@napi-rs/canvas'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Generate album composite images with @napi-rs/canvas
 *
 * แทนที่ Playwright page.screenshot() ที่ render HTML "album card" เป็น JPEG
 * รักษาหน้าตาเดิม 100% (600px dark card, colored header, 2-col grid 4:3, badges, footer)
 *
 * ใช้ Skia engine ที่มี HarfBuzz → Thai text shaping ทำงานถูกต้องกว่า PDFKit
 * แต่ละ page = 8 รูป (chunk size เหมือนเดิม) → คืน array ของ JPEG buffers
 */

const CARD_WIDTH = 600
const CARD_PADDING = 16
const HEADER_HEIGHT = 70
const TILE_GAP = 12
const TILE_BORDER_RADIUS = 8
const BADGE_PADDING_X = 8
const BADGE_PADDING_Y = 3

let fontsRegistered = false

/**
 * Register Noto Sans Thai สำหรับ canvas (เหมือน react-pdf fonts.ts แต่ใช้ GlobalFonts)
 * idempotent — ครั้งเดียวต่อ process
 */
function ensureCanvasFontsRegistered() {
  if (fontsRegistered) return

  const candidates = [
    join(process.cwd(), 'public/fonts/NotoSansThai-Regular.ttf'),
    join(process.cwd(), 'apps/next/public/fonts/NotoSansThai-Regular.ttf'),
  ]
  const regularPath = candidates.find((p) => existsSync(p))
  if (!regularPath) {
    throw new Error(`ไม่พบฟอนต์ NotoSansThai-Regular.ttf สำหรับ canvas (tried: ${candidates.join(', ')})`)
  }
  const boldPath = regularPath.replace('Regular', 'Bold')
  if (!existsSync(boldPath)) {
    throw new Error(`ไม่พบฟอนต์ NotoSansThai-Bold.ttf สำหรับ canvas`)
  }

  GlobalFonts.registerFromPath(regularPath, 'NotoSansThai')
  GlobalFonts.registerFromPath(boldPath, 'NotoSansThai-Bold')
  fontsRegistered = true
}

/**
 * แยก Sara Am (ำ → ํ + า) เหมือน react-pdf shim — เผื่อ Skia มีปัญหาเดียวกัน
 * (จริง ๆ Skia + HarfBuzz น่าจะจัดการได้ แต่เป็น safety net)
 */
function normalizeThai(input: string): string {
  return input.replace(/\u0E33/g, '\u0E4D\u0E32')
}

interface AlbumImageInput {
  images: Array<{ url: string; fileName: string }>
  ticketCreatedAt: string
  isWti: boolean
  partyName: string
  documentNo: string
  quality?: number
  showBadges?: boolean
  showTimestamps?: boolean
}

/**
 * Render album images — แบ่งรูปเป็น chunk ละ 8 รูป แต่ละ chunk = 1 JPEG
 * คืน array ของ Buffer (JPEG)
 */
export async function renderAlbumImages(input: AlbumImageInput): Promise<Buffer[]> {
  ensureCanvasFontsRegistered()
  const requestedQuality = input.quality ?? 90
  const quality = Number.isFinite(requestedQuality)
    ? Math.min(100, Math.max(10, requestedQuality))
    : 90

  const chunkSize = 8
  const chunks: Array<Array<{ url: string; fileName: string }>> = []
  for (let i = 0; i < input.images.length; i += chunkSize) {
    chunks.push(input.images.slice(i, i + chunkSize))
  }

  const totalPages = chunks.length
  const results: Buffer[] = []

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    const chunk = chunks[pageIdx]
    const buffer = await renderSingleAlbumCard({
      chunk,
      pageIdx,
      totalPages,
      ticketCreatedAt: input.ticketCreatedAt,
      isWti: input.isWti,
      partyName: input.partyName,
      documentNo: input.documentNo,
      quality,
      showBadges: input.showBadges ?? true,
      showTimestamps: input.showTimestamps ?? true,
    })
    results.push(buffer)
  }

  return results
}

async function renderSingleAlbumCard(params: {
  chunk: Array<{ url: string; fileName: string }>
  pageIdx: number
  totalPages: number
  ticketCreatedAt: string
  isWti: boolean
  partyName: string
  documentNo: string
  quality: number
  showBadges: boolean
  showTimestamps: boolean
}): Promise<Buffer> {
  const { chunk, pageIdx, totalPages, isWti, partyName, documentNo, quality, showBadges, showTimestamps } = params

  // Layout: header + grid (2 cols x N rows) + footer padding
  const rowCount = Math.ceil(chunk.length / 2)
  const gridWidth = CARD_WIDTH - CARD_PADDING * 2
  const tileWidth = (gridWidth - TILE_GAP) / 2
  const tileHeight = (tileWidth * 3) / 4 // aspect 4:3
  const gridHeight = rowCount * tileHeight + (rowCount - 1) * TILE_GAP
  const cardHeight = HEADER_HEIGHT + CARD_PADDING + gridHeight + CARD_PADDING

  const canvas: Canvas = createCanvas(CARD_WIDTH, cardHeight)
  const ctx: SKRSContext2D = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Background dark
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, CARD_WIDTH, cardHeight)

  // Header (colored bar)
  const headerBgColor = isWti ? '#064e3b' : '#0c4a6e'
  ctx.fillStyle = headerBgColor
  ctx.fillRect(0, 0, CARD_WIDTH, HEADER_HEIGHT)

  // Header text (Thai — NotoSansThai-Bold)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 20px "NotoSansThai-Bold"'
  ctx.textBaseline = 'middle'
  const titleIcon = isWti ? '📥' : '📤'
  const titleText = normalizeThai(`${titleIcon} ${isWti ? 'รับสินค้า' : 'ส่งสินค้า'} · ${pageIdx + 1}/${totalPages}`)
  ctx.fillText(titleText, CARD_PADDING, HEADER_HEIGHT / 2 - 8)

  // Header subtitle
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '13px "NotoSansThai"'
  const subtitleText = normalizeThai(`${partyName} · ${documentNo}`)
  ctx.fillText(subtitleText, CARD_PADDING, HEADER_HEIGHT / 2 + 14)

  // Header right text
  ctx.fillStyle = '#cbd5e1'
  ctx.font = '13px "NotoSansThai"'
  ctx.textAlign = 'right'
  ctx.fillText('NS PRODUCTION', CARD_WIDTH - CARD_PADDING, HEADER_HEIGHT / 2)
  ctx.textAlign = 'left'

  // Grid of tiles
  for (let i = 0; i < chunk.length; i++) {
    const img = chunk[i]
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = CARD_PADDING + col * (tileWidth + TILE_GAP)
    const y = HEADER_HEIGHT + CARD_PADDING + row * (tileHeight + TILE_GAP)
    const displayIndex = pageIdx * 8 + i + 1

    await drawTile(ctx, img, x, y, tileWidth, tileHeight, displayIndex, isWti, showBadges, showTimestamps, params.ticketCreatedAt)
  }

  return canvas.encode('jpeg', quality)
}

async function drawTile(
  ctx: SKRSContext2D,
  img: { url: string; fileName: string },
  x: number,
  y: number,
  w: number,
  h: number,
  displayIndex: number,
  isWti: boolean,
  showBadges: boolean,
  showTimestamps: boolean,
  ticketCreatedAt: string
) {
  // Tile background (fallback)
  ctx.fillStyle = '#1e293b'
  roundRect(ctx, x, y, w, h, TILE_BORDER_RADIUS)
  ctx.fill()

  // Load and draw image without stretching or cropping. The 4:3 tile is a
  // presentation frame; the source image keeps its own aspect ratio inside it.
  try {
    const image = await loadImage(img.url)
    const footerHeight = 26
    const imageHeight = Math.max(1, h - footerHeight)
    const imgRatio = image.width / image.height
    const tileRatio = w / imageHeight
    let drawWidth = w
    let drawHeight = imageHeight
    if (imgRatio > tileRatio) {
      drawHeight = w / imgRatio
    } else {
      drawWidth = h * imgRatio
    }
    const drawX = x + (w - drawWidth) / 2
    const drawY = y + (imageHeight - drawHeight) / 2
    // Clip to rounded rect then draw
    ctx.save()
    roundRect(ctx, x, y, w, h, TILE_BORDER_RADIUS)
    ctx.clip()
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(x, y, w, h)
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
    ctx.restore()
  } catch (err) {
    // image load fail — draw placeholder text
    ctx.fillStyle = '#64748b'
    ctx.font = '12px "NotoSansThai"'
    ctx.textAlign = 'center'
    ctx.fillText(normalizeThai('ไม่สามารถโหลดรูปได้'), x + w / 2, y + h / 2)
    ctx.textAlign = 'left'
  }

  // Badge (top-left)
  if (showBadges) {
    const isOut = img.fileName.toLowerCase().includes('out') ||
                  img.fileName.toLowerCase().includes('exit') ||
                  img.fileName.includes('ขาออก')
    const badgeText = isOut ? 'ขาออก' : (isWti ? 'รับเข้า' : 'ขาออก')
    const badgeColor = isOut ? '#10b981' : '#0ea5e9'

    ctx.font = 'bold 12px "NotoSansThai-Bold"'
    const badgeWidth = ctx.measureText(badgeText).width + BADGE_PADDING_X * 2
    const badgeHeight = 18
    const badgeX = x + 10
    const badgeY = y + 10

    ctx.fillStyle = badgeColor
    roundRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 4)
    ctx.fill()

    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    ctx.fillText(normalizeThai(badgeText), badgeX + BADGE_PADDING_X, badgeY + badgeHeight / 2)
  }

  // Footer is a separate metadata area, not an overlay over the source image.
  const footerHeight = 26
  const footerY = y + h - footerHeight
  ctx.save()
  roundRect(ctx, x, footerY, w, footerHeight, 0)
  ctx.clip()
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)'
  ctx.fillRect(x, footerY, w, footerHeight)
  ctx.restore()

  const photoTime = getPhotoTimestamp(img.fileName, ticketCreatedAt)

  ctx.fillStyle = '#ffffff'
  ctx.font = '12px "NotoSansThai"'
  ctx.textBaseline = 'middle'

  // Left: timestamp
  ctx.textAlign = 'left'
  const leftText = showTimestamps ? `🕒 ${photoTime}` : ''
  ctx.fillText(normalizeThai(leftText), x + 10, footerY + footerHeight / 2)

  // Right: index
  ctx.textAlign = 'right'
  ctx.fillText(`#${displayIndex}`, x + w - 10, footerY + footerHeight / 2)
  ctx.textAlign = 'left'
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function getPhotoTimestamp(fileName: string, ticketCreatedAt: string): string {
  const msMatch = fileName.match(/\b(\d{13})\b/)
  if (msMatch) {
    const ms = parseInt(msMatch[1], 10)
    const date = new Date(ms)
    if (!isNaN(date.getTime())) return formatTime(date)
  }
  const sMatch = fileName.match(/\b(\d{10})\b/)
  if (sMatch) {
    const s = parseInt(sMatch[1], 10) * 1000
    const date = new Date(s)
    if (!isNaN(date.getTime())) return formatTime(date)
  }
  const date = ticketCreatedAt ? new Date(ticketCreatedAt) : new Date()
  return formatTime(date)
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  })
}
