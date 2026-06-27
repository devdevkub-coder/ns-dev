import { NextResponse } from 'next/server'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolvePlaywrightBrowsersPath } from '@/lib/server/weight-ticket-line-notification'

export const runtime = 'nodejs'

/**
 * ตรวจสอบสถานะ Playwright Chromium binary เพื่อ debug ปัญหาการสร้าง PDF
 * สำหรับ LINE notification ของใบรับ-ส่งของ (weight ticket)
 *
 * ไม่ throw แม้ binary จะหาไม่เจอ — คืนข้อมูลสถานะออกไปให้ debug ได้ทางสายตา
 */
function inspectPlaywrightBinary() {
  const cwd = process.cwd()
  const candidates = [
    join(cwd, '.playwright-browsers'),
    join(cwd, '..', '.playwright-browsers'),
    join(cwd, '..', '..', '.playwright-browsers'),
    join(cwd, 'apps', 'next', '.playwright-browsers'),
    join(cwd, 'apps', '.playwright-browsers'),
  ]

  // หา path แรกที่มีอยู่จริง
  const existingPath = candidates.find((p) => existsSync(p)) || null

  // อ่าน marker file ถ้ามี (เขียนโดย scripts/install-playwright.js ตอน build)
  let marker: { path?: string; installedAt?: string; nodeVersion?: string; platform?: string } | null = null
  if (existingPath) {
    try {
      marker = JSON.parse(readFileSync(join(existingPath, '.installed'), 'utf8'))
    } catch {
      marker = null
    }
  }

  // ลอง resolve path จริง (เหมือนที่ runtime จะใช้) — ถ้าหาไม่เจอจะ throw,
  // เราจับไว้เพื่อคืน error message ออกไปแทน
  let resolvedPath: string | null = null
  let resolveError: string | null = null
  try {
    resolvedPath = resolvePlaywrightBrowsersPath()
  } catch (err) {
    resolveError = err instanceof Error ? err.message : String(err)
  }

  return {
    // path ที่ runtime จะใช้จริง (resolve แล้ว)
    resolvedPath,
    // path แรกที่หาเจอใน candidate list
    detectedPath: existingPath,
    // env var ที่ตั้งไว้ (ถ้ามี)
    envVar: process.env.PLAYWRIGHT_BROWSERS_PATH || null,
    // marker file จาก build step
    marker,
    // ทุกอย่างพร้อมใช้ไหม (resolvedPath มีค่า = path หาเจอและพร้อม launch)
    ready: Boolean(resolvedPath),
    // error message ถ้า resolve ไม่สำเร็จ
    error: resolveError,
  }
}

export function GET() {
  return NextResponse.json({
    ok: true,
    app: 'ns-scrap-erp-next',
    timestamp: new Date().toISOString(),
    playwright: inspectPlaywrightBinary(),
  })
}
