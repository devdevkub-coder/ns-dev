import { existsSync, readFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hostname } from 'node:os'
import { chromium } from 'playwright'
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

  const wtiDefaultTemplate = `ใบรับของ WTI [DocumentNo]\n━━━━━━━━━━━━━━━\nผู้ขาย: [PartyName]\nสาขา: [BranchName]\nวันที่/เวลาเอกสาร: [DocDateTime]\nหักภาชนะ: [ContainerWeight] กก.\nหักสิ่งเจือปน: [DeductionWeight] กก.\nน้ำหนักสุทธิ: [NetWeight] กก.\n━━━━━━━━━━━━━━━\nลิงค์โหลด pdf:\n[PdfUrl]`

  const wtoDefaultTemplate = `ใบส่งของ WTO [DocumentNo]\n━━━━━━━━━━━━━━━\nลูกค้า: [PartyName]\nสาขา: [BranchName]\nวันที่/เวลาเอกสาร: [DocDateTime]\nหักภาชนะ: [ContainerWeight] กก.\nหักสิ่งเจือปน: [DeductionWeight] กก.\nน้ำหนักสุทธิ: [NetWeight] กก.\n━━━━━━━━━━━━━━━\nลิงค์โหลด pdf:\n[PdfUrl]`

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

/**
 * Resolve ตำแหน่ง Playwright Chromium binary ในขณะรันจริง (runtime) อย่างชัดเจน
 *
 * ลำดับการ resolve:
 *   1. env `PLAYWRIGHT_BROWSERS_PATH` — ทางที่ถูกที่สุด ถ้า container ตั้งไว้ก็ใช้เลย
 *   2. candidate paths ครอบคลุมทุก layout ที่เป็นไปได้ (workspace root, cwd และ parent levels)
 *   3. หากไม่พบทั้งหมด → throw error พร้อมคำแนะนำ (แทนที่จะปล่อยให้ Playwright
 *      fallback ไป default path `/root/.cache/ms-playwright/` ที่ว่างเปล่าแล้วพังเงียบ ๆ)
 *
 * เหตุผล: Docker multi-stage build อาจไม่ COPY `.playwright-browsers/` จาก builder
 * stage เข้าสู่ runtime image. การ throw ที่ชัดเจนช่วยให้ debug ได้ทันทีผ่านข้อความ error
 * และช่วยให้ทีม infra ตั้ง env var ตัวเดียวก็แก้ได้โดยไม่ต้องแก้โค้ด
 */
export function resolvePlaywrightBrowsersPath(): string {
  // 1) env var ที่ container/DevOps อาจตั้งไว้
  const envPath = process.env.PLAYWRIGHT_BROWSERS_PATH
  if (envPath && existsSync(envPath)) {
    return envPath
  }

  // 2) candidate paths — ครอบคลุมทุก layout ที่เป็นไปได้
  const cwd = process.cwd()
  const candidates = [
    join(cwd, '.playwright-browsers'),                       // รันจาก workspace root
    join(cwd, '..', '.playwright-browsers'),                  // รันจาก apps/next (cwd = apps/next)
    join(cwd, '..', '..', '.playwright-browsers'),            // รันจาก apps/next/src/...
    join(cwd, 'apps', 'next', '.playwright-browsers'),        // workspace root ที่ binary อยู่ใต้ apps/next
    join(cwd, 'apps', '.playwright-browsers'),                // รูปแบบอื่น
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  // 3) หาไม่เจอ — throw พร้อมคำแนะนำที่อ่านง่าย แทนการปล่อยให้ Playwright พังเงียบ
  const triedList = [envPath, ...candidates].filter(Boolean).map((p) => `  • ${p}`).join('\n')
  throw new Error(
    `ไม่พบ Playwright Chromium binary ที่ติดตั้งไว้ (PLAYWRIGHT_BROWSERS_PATH).\n` +
    `Paths ที่ลองค้นหา:\n${triedList}\n\n` +
    `วิธีแก้ไข (เลือกอย่างใดอย่างหนึ่ง):\n` +
    `  1) ตั้ง env var PLAYWRIGHT_BROWSERS_PATH ใน runtime container ให้ชี้ไปยังโฟลเดอร์ที่มี Chromium binary\n` +
    `  2) ตรวจ Dockerfile ให้มีการ COPY .playwright-browsers/ จาก builder stage เข้าสู่ runner stage\n` +
    `  3) รัน "npx playwright install --with-deps chromium" ใน runtime image ระหว่าง build\n\n` +
    `เช็คสถานะปัจจุบันได้ที่ endpoint /api/health (ฟิลด์ playwright)`
  )
}

/**
 * อ่าน marker file ที่เขียนโดย install-playwright.js ตอน build stage
 * เพื่อเปรียบเทียบระหว่าง "build time" กับ "runtime process" — ถ้า worker เก่า
 * ค้างอยู่ (warm worker) จะเห็น mismatch ของ marker.commit / installedAt ทันที
 */
function readPlaywrightMarker(browsersPath: string): {
  path?: string
  commit?: string | null
  installedAt?: string
  nodeVersion?: string
  platform?: string
} | null {
  try {
    const markerFile = join(browsersPath, '.installed')
    if (!existsSync(markerFile)) return null
    return JSON.parse(readFileSync(markerFile, 'utf8'))
  } catch {
    return null
  }
}

/**
 * จุดเดียวที่ทำการ launch Chromium ของ Playwright (Single source of truth)
 *
 * แก้ปัญหาที่ ChatGPT diagnosis ไว้ถูกต้อง:
 *  - env `PLAYWRIGHT_BROWSERS_PATH` อาจมีตอน build แต่หายตอน runtime
 *    → เราบังคับ set process.env ทุกครั้งก่อน launch
 *  - worker process บางตัวอาจใช้ code/env เก่า → log fingerprint เพื่อยืนยัน
 *
 * ทุก job (manual + auto + retry) ต้องผ่านจุดนี้เท่านั้น ห้ามเรียก chromium.launch() ตรง ๆ
 */
export async function launchManagedChromium(options?: {
  queueId?: string | number
  billNo?: string
}): Promise<import('playwright').Browser> {
  const resolvedPath = resolvePlaywrightBrowsersPath()

  // บังคับ set env ทุกครั้งก่อน launch — กัน env หายตอน runtime
  process.env.PLAYWRIGHT_BROWSERS_PATH = resolvedPath

  const marker = readPlaywrightMarker(resolvedPath)

  // Runtime fingerprint log — ถ้า job พังจะเห็นทันทีว่าเป็น process/env ตัวไหน
  console.log('[LINE_SEND_WORKER_BEFORE_PLAYWRIGHT]', JSON.stringify({
    queueId: options?.queueId ?? null,
    billNo: options?.billNo ?? null,
    pid: process.pid,
    hostname: hostname(),
    cwd: process.cwd(),
    processUptimeSeconds: Math.round(process.uptime()),
    nodeEnv: process.env.NODE_ENV ?? null,
    playwrightBrowsersPathEnv: process.env.PLAYWRIGHT_BROWSERS_PATH,
    resolvedPath,
    binaryExists: existsSync(resolvedPath),
    marker,
  }))

  try {
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--font-render-hinting=none',
        '--disable-font-subpixel-positioning',
        '--disable-gpu',
      ],
    })
    return browser
  } catch (err) {
    // ถ้ายังไปเจอ /root/.cache/... แปลว่า Playwright ไม่รับ env ที่เรา set
    // → throw error ของเราเองพร้อม fingerprint แทน error ปกติของ Playwright
    const rawErr = err instanceof Error ? err.message : String(err)
    if (rawErr.includes('/root/.cache/ms-playwright') || rawErr.includes('ms-playwright')) {
      throw new Error(
        `Playwright ยังไปหา default path ที่ว่างเปล่าแทน path ที่เราตั้ง แม้จะ set env แล้ว\n` +
        `→ น่าจะเป็น warm worker/stale process ที่ไม่รับ env ใหม่ (ต้อง restart container)\n` +
        `fingerprint: resolvedPath=${resolvedPath}, env=${process.env.PLAYWRIGHT_BROWSERS_PATH}, ` +
        `pid=${process.pid}, hostname=${hostname()}, uptime=${Math.round(process.uptime())}s\n` +
        `original: ${rawErr}`
      )
    }
    throw err
  }
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

// --- Main PDF Generation Function ---

export async function generateWeightTicketPdf(
  ticket: WeightTicketRecord,
  profile: CompanyProfilePrintValues | null,
  options?: {
    showBadges?: boolean
    showTimestamps?: boolean
    quality?: number
  }
): Promise<{ pdfBuffer: Buffer; albumImages: Array<{ pageIdx: number; buffer: Buffer }> }> {
  const configs = await resolveNotificationConfigs()
  const showBadges = options?.showBadges ?? configs.albumShowBadges
  const showTimestamps = options?.showTimestamps ?? configs.albumShowTimestamps
  const quality = options?.quality ?? configs.albumQuality
  const defaultProfile: CompanyProfilePrintValues = {
    address: '-',
    bankInfo: null,
    branchCode: '00000',
    email: null,
    fax: null,
    footerNote: null,
    logoUrl: null,
    name: 'NS SCRAP',
    nameEn: null,
    phone: '-',
    taxId: null,
    website: null,
  }

  const activeProfile = profile || defaultProfile

  // 2. Generate original ticket HTML page
  const ticketHtml = buildReceiptPrintHtml(ticket, activeProfile)

  // 3. Extract original HTML and inject page break + photo album page (Page 2)
  const isWti = ticket.type === 'WTI'
  const images = ticket.imageNames || []
  const decodedImages = images
    .map((img) => decodeStoredImageAsset(img))
    .filter((asset) => asset.url && (asset.url.startsWith('http') || asset.url.startsWith('data:')))

  let photoAlbumHtml = ''
  if (decodedImages.length > 0) {
    const photoTiles = decodedImages.map((asset, idx) => {
      const isOut = asset.fileName.toLowerCase().includes('out') ||
                    asset.fileName.toLowerCase().includes('exit') ||
                    asset.fileName.includes('ขาออก')
      const badgeText = isOut ? 'ขาออก' : (isWti ? 'รับเข้า' : 'ขาออก')
      const badgeColor = isOut ? '#10b981' : '#0ea5e9'
      const photoTime = getPhotoTimestamp(asset.fileName, ticket.createdAt)

      return `
        <div style="position: relative; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; page-break-inside: avoid; break-inside: avoid; background: #f8fafc;">
          <img src="${asset.url}" style="width: 100%; height: 160px; object-fit: cover; display: block;" />
          <div style="position: absolute; top: 8px; left: 8px; background: ${badgeColor}; color: white; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">
            ${badgeText}
          </div>
          <div style="position: absolute; bottom: 8px; right: 8px; background: rgba(15, 23, 42, 0.75); color: white; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 4px;">
            #${idx + 1} &middot; ${photoTime}
          </div>
          <div style="padding: 6px 8px; font-size: 9px; color: #64748b; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
            ${asset.fileName}
          </div>
        </div>
      `
    }).join('')

    photoAlbumHtml = `
      <div class="page" style="page-break-before: always; break-before: page; min-height: 277mm; display: flex; flex-direction: column; background: white; padding: 7mm; box-sizing: border-box;">
        <div class="accent"></div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; margin-bottom: 16px; flex: 0 0 auto;">
          <div>
            <div style="font-size: 18px; font-weight: 900; color: ${isWti ? '#14532d' : '#0369a1'};">
              ${isWti ? '📥 ใบรับสินค้า (รูปถ่ายแนบ)' : '📤 ใบส่งของ (รูปถ่ายแนบ)'}
            </div>
            <div style="font-size: 10px; color: #475569; margin-top: 4px;">
              เลขที่เอกสาร: ${ticket.documentNo} &middot; คู่ค้า: ${ticket.partyName || '-'} &middot; วันที่: ${formatDateDisplay(ticket.documentDate)}
            </div>
          </div>
          <div style="text-align: right; font-size: 10px; color: #64748b;">
            NS PRODUCTION &middot; หน้า 2 / 2
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; flex: 1 1 auto; align-content: start;">
          ${photoTiles}
        </div>
        <div class="footer" style="margin-top: auto; padding-top: 8px; display: flex; justify-content: space-between; gap: 12px; border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 9px; flex: 0 0 auto;">
          <div>ขอขอบคุณที่ใช้บริการค่ะ/ครับ</div>
          <div>NS Scrap Production &middot; NS Solutions Thailand</div>
        </div>
      </div>
    `
  }

  // Load local font to base64 inline styles
  const regFontPaths = [
    join(/*turbopackIgnore: true*/ process.cwd(), 'public/fonts/NotoSansThai-Regular.ttf'),
    join(/*turbopackIgnore: true*/ process.cwd(), 'apps/next/public/fonts/NotoSansThai-Regular.ttf'),
    join(/*turbopackIgnore: true*/ process.cwd(), 'src/assets/fonts/NotoSansThai-Regular.ttf'),
    join(/*turbopackIgnore: true*/ process.cwd(), 'apps/next/src/assets/fonts/NotoSansThai-Regular.ttf'),
  ]
  const boldFontPaths = [
    join(/*turbopackIgnore: true*/ process.cwd(), 'public/fonts/NotoSansThai-Bold.ttf'),
    join(/*turbopackIgnore: true*/ process.cwd(), 'apps/next/public/fonts/NotoSansThai-Bold.ttf'),
    join(/*turbopackIgnore: true*/ process.cwd(), 'src/assets/fonts/NotoSansThai-Bold.ttf'),
    join(/*turbopackIgnore: true*/ process.cwd(), 'apps/next/src/assets/fonts/NotoSansThai-Bold.ttf'),
  ]

  let regBase64 = ''
  for (const fontPath of regFontPaths) {
    if (existsSync(fontPath)) {
      try {
        regBase64 = await readFile(fontPath, 'base64')
        break
      } catch (err) {
        console.warn('Failed to read regular font file at', fontPath, err)
      }
    }
  }

  let boldBase64 = ''
  for (const fontPath of boldFontPaths) {
    if (existsSync(fontPath)) {
      try {
        boldBase64 = await readFile(fontPath, 'base64')
        break
      } catch (err) {
        console.warn('Failed to read bold font file at', fontPath, err)
      }
    }
  }

  if (!regBase64) {
    throw new Error('ไม่พบไฟล์ฟอนต์ภาษาไทยสำหรับสร้างเอกสาร PDF (Tried paths: ' + regFontPaths.join(', ') + ')')
  }

  let fontStyleBlock = ''
  if (regBase64) {
    fontStyleBlock += `
    <style>
      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('data:font/ttf;charset=utf-8;base64,${regBase64}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('data:font/ttf;charset=utf-8;base64,${regBase64}') format('truetype');
        font-weight: 300;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('data:font/ttf;charset=utf-8;base64,${regBase64}') format('truetype');
        font-weight: 400;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('data:font/ttf;charset=utf-8;base64,${regBase64}') format('truetype');
        font-weight: 500;
        font-style: normal;
      }
    `
    if (boldBase64) {
      fontStyleBlock += `
      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('data:font/ttf;charset=utf-8;base64,${boldBase64}') format('truetype');
        font-weight: bold;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('data:font/ttf;charset=utf-8;base64,${boldBase64}') format('truetype');
        font-weight: 600;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('data:font/ttf;charset=utf-8;base64,${boldBase64}') format('truetype');
        font-weight: 700;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('data:font/ttf;charset=utf-8;base64,${boldBase64}') format('truetype');
        font-weight: 800;
        font-style: normal;
      }
      @font-face {
        font-family: 'Noto Sans Thai';
        src: url('data:font/ttf;charset=utf-8;base64,${boldBase64}') format('truetype');
        font-weight: 900;
        font-style: normal;
      }
      `
    }
    fontStyleBlock += `
      * {
        font-family: 'Noto Sans Thai', sans-serif !important;
        font-synthesis: none !important;
      }
    </style>
    `
  }

  // 4. Inject Page 2 and Font Face styles
  let finalHtml = ticketHtml
    .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/g, '')
    .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>/g, '')

  if (fontStyleBlock) {
    const headCloseIdx = finalHtml.indexOf('</head>')
    if (headCloseIdx !== -1) {
      // Inject ฟอนต์ + CSS override เฉพาะ PDF ที่จะส่ง LINE
      // ปัญหา: เอกสารที่มีสินค้าน้อย (1-3 รายการ) เนื้อหาจริงสั้น (~150mm) แต่หน้า A4 สูง 297mm
      // โครงสร้าง flex มีแค่ .footer ที่ margin-top:auto → เกิดช่องว่างใหญ่ครึ่งหน้าระหว่าง
      // .signatures กับ .footer (เพราะ .signatures ติดเนื้อหาด้านบน)
      // แก้: (1) ดัน .signatures ไปติด .footer ด้านล่าง (2) ขยายระยะหายใจของแต่ละส่วนให้เต็มหน้า
      const pdfOverrideCss = `
    <style>
      @page { size: A4 portrait; margin: 0; }
      .page { width: auto; max-width: 210mm; min-height: 297mm; margin: 0; padding: 10mm 11mm; display: flex; flex-direction: column; }
      body { background: white; }
      /* ดันกล่องลงชื่อไปติดด้านล่างสุดของหน้า ไม่ว่าเนื้อหาจะน้อยแค่ไหน */
      .signatures { margin-top: auto !important; }
      /* ขยายระยะหายใจของเนื้อหาหลักเพื่อเติมพื้นที่หน้า A4 */
      .accent { margin-bottom: 14px !important; }
      .header { padding-bottom: 14px !important; }
      .section-grid { margin-top: 14px !important; }
      .panel { border-width: 1px !important; }
      .panel-title { padding: 8px 11px !important; font-size: 12px !important; }
      .panel-body { padding: 9px 11px !important; }
      .field-value { font-size: 13px !important; }
      .items { margin-top: 14px !important; font-size: 12px !important; }
      .items th { padding: 7px 6px !important; font-size: 11.5px !important; }
      .items td { padding: 8px 6px !important; }
      .bottom-grid { margin-top: 14px !important; gap: 12px !important; }
      .summary-card { padding: 8px !important; }
      .summary-card .value { font-size: 12.5px !important; }
      .note { min-height: 40px !important; }
      /* signatures ปรับให้กระชับขึ้นเพื่อกันล้นไปหน้า 2 */
      .signatures { gap: 16px !important; margin-top: 26px !important; }
      .sig-line { margin-top: 22px !important; padding-top: 5px !important; }
      .footer { display: none !important; }
    </style>`
      finalHtml = finalHtml.substring(0, headCloseIdx) + fontStyleBlock + pdfOverrideCss + finalHtml.substring(headCloseIdx)
    }
  }

  if (photoAlbumHtml) {
    const bodyCloseIdx = finalHtml.lastIndexOf('</body>')
    if (bodyCloseIdx !== -1) {
      finalHtml = finalHtml.substring(0, bodyCloseIdx) + photoAlbumHtml + finalHtml.substring(bodyCloseIdx)
    }
  }

  // 5. Use Playwright to launch Chromium in headless mode and render HTML to PDF
  // Chromium binary ต้องถูกติดตั้งตอน build และ copy ข้าม Docker multi-stage เข้าสู่ runtime image.
  // ปัดทุกการ launch ผ่าน launchManagedChromium() จุดเดียว — เพื่อ:
  //   - บังคับ set PLAYWRIGHT_BROWSERS_PATH ทุกครั้งก่อน launch (กัน env หายตอน runtime)
  //   - log runtime fingerprint (pid/hostname/uptime/marker) เพื่อ detect warm worker
  //   - ถ้า fallback ไป /root/.cache ทั้งที่ set env แล้ว → throw error ที่บอกต้นเหตุชัดเจน
  const browser = await launchManagedChromium({
    billNo: ticket.documentNo,
  })
  const context = await browser.newContext()
  const page = await context.newPage()

  // Emulate print media type
  await page.emulateMedia({ media: 'print' })

  if (process.env.NODE_ENV === 'development' || process.env.MOCK_PDF_UPLOAD === 'false') {
    await writeFile(join(/*turbopackIgnore: true*/ process.cwd(), 'scratch/generated_test.html'), finalHtml, 'utf8').catch((err: any) => console.warn('Failed to save generated_test.html:', err))
  }

  await page.setContent(finalHtml, { waitUntil: 'load' })

  // Wait for font faces to be ready
  await page.evaluate(() => document.fonts.ready)

  // Print page to PDF with standard A4 settings
  // margin ใช้ 0mm เพราะ @page ใน CSS override (ฝั่ง PDF เท่านั้น) เป็นตัวกำหนดพื้นที่พิมพ์
  // (ปุ่มพิมพ์ในเบราว์เซอร์ใช้ CSS หลัก @page margin:10mm อยู่แยกกัน)
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '0mm',
      bottom: '0mm',
      left: '0mm',
      right: '0mm'
    }
  })

  // --- Generate Album screenshots ---
  const albumImages: Array<{ pageIdx: number; buffer: Buffer }> = []
  if (decodedImages.length > 0) {
    const chunkSize = 8
    const totalPages = Math.ceil(decodedImages.length / chunkSize)
    const headerBgColor = isWti ? '#064e3b' : '#0c4a6e'

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      const chunk = decodedImages.slice(pageIdx * chunkSize, (pageIdx + 1) * chunkSize)
      const tilesHtml = chunk.map((asset, rIdx) => {
        const isOut = asset.fileName.toLowerCase().includes('out') ||
                      asset.fileName.toLowerCase().includes('exit') ||
                      asset.fileName.includes('ขาออก')
        const badgeText = isOut ? 'ขาออก' : (isWti ? 'รับเข้า' : 'ขาออก')
        const badgeColor = isOut ? '#10b981' : '#0ea5e9'
        const photoTime = getPhotoTimestamp(asset.fileName, ticket.createdAt)
        const displayIndex = pageIdx * chunkSize + rIdx + 1

        const badgeHtml = showBadges
          ? `<div class="badge-top-left" style="background: ${badgeColor};">${badgeText}</div>`
          : ''

        const timestampHtml = showTimestamps
          ? `<span>🕒 ${photoTime}</span>`
          : '<span></span>'

        return `
          <div class="tile">
            <img src="${asset.url}" />
            ${badgeHtml}
            <div class="tile-footer">
              ${timestampHtml}
              <span>#${displayIndex}</span>
            </div>
          </div>
        `
      }).join('')

      const albumCardHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            @font-face {
              font-family: 'Noto Sans Thai';
              src: url('data:font/ttf;charset=utf-8;base64,${regBase64}') format('truetype');
              font-weight: normal;
              font-style: normal;
            }
            @font-face {
              font-family: 'Noto Sans Thai';
              src: url('data:font/ttf;charset=utf-8;base64,${boldBase64}') format('truetype');
              font-weight: bold;
              font-style: normal;
            }
            * {
              box-sizing: border-box;
              font-family: 'Noto Sans Thai', sans-serif !important;
              font-synthesis: none !important;
            }
            body {
              margin: 0;
              padding: 0;
              background: transparent;
            }
            #album-card {
              width: 600px;
              background: #0f172a;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            .header {
              background-color: ${headerBgColor};
              padding: 20px 24px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              color: white;
            }
            .header-left {
              display: flex;
              flex-direction: column;
              gap: 4px;
            }
            .header-title {
              font-size: 20px;
              font-weight: bold;
            }
            .header-subtitle {
              font-size: 13px;
              color: #cbd5e1;
            }
            .header-right {
              font-size: 13px;
              color: #cbd5e1;
              font-weight: 500;
            }
            .grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
              padding: 16px;
              background: #0f172a;
            }
            .tile {
              position: relative;
              border-radius: 8px;
              overflow: hidden;
              aspect-ratio: 4/3;
              background: #1e293b;
            }
            .tile img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              display: block;
            }
            .badge-top-left {
              position: absolute;
              top: 10px;
              left: 10px;
              color: white;
              font-size: 12px;
              font-weight: bold;
              padding: 3px 8px;
              border-radius: 4px;
            }
            .tile-footer {
              position: absolute;
              bottom: 0;
              left: 0;
              right: 0;
              background: rgba(15, 23, 42, 0.75);
              color: white;
              font-size: 12px;
              padding: 6px 10px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
          </style>
        </head>
        <body>
          <div id="album-card">
            <div class="header">
              <div class="header-left">
                <div class="header-title">${isWti ? '📥 รับสินค้า' : '📤 ส่งสินค้า'} &middot; ${pageIdx + 1}/${totalPages}</div>
                <div class="header-subtitle">${ticket.partyName || '-'} &middot; ${ticket.documentNo}</div>
              </div>
              <div class="header-right">NS PRODUCTION</div>
            </div>
            <div class="grid">
              ${tilesHtml}
            </div>
          </div>
        </body>
        </html>
      `

      const imgPage = await context.newPage()
      await imgPage.setContent(albumCardHtml, { waitUntil: 'load' })
      await imgPage.evaluate(() => document.fonts.ready)

      const cardElement = imgPage.locator('#album-card')
      const imgBuffer = await cardElement.screenshot({
        type: 'jpeg',
        quality: quality
      })
      await imgPage.close()

      albumImages.push({
        pageIdx,
        buffer: Buffer.from(imgBuffer)
      })
    }
  }

  await browser.close()
  return { pdfBuffer: Buffer.from(pdfBuffer), albumImages }
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

  return template
    .replace(/\[DocumentNo\]/g, ticket.documentNo || '-')
    .replace(/\[PartyName\]/g, ticket.partyName || '-')
    .replace(/\[BranchName\]/g, ticket.branchName || '-')
    .replace(/\[DocDateTime\]/g, docDateStr)
    .replace(/\[ContainerWeight\]/g, formatWeight(ticket.totals.containerDeductionWeight))
    .replace(/\[DeductionWeight\]/g, formatWeight(ticket.totals.deductionWeight))
    .replace(/\[NetWeight\]/g, formatWeight(ticket.totals.netWeight))
    .replace(/\[PdfUrl\]/g, pdfUrl || '-')
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

export async function sendLinePush(targetId: string, messages: any[], token: string, retryKey?: string) {
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
      const { pdfBuffer, albumImages } = await generateWeightTicketPdf(loaded.record, profile, {
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
