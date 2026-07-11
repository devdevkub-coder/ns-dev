import path from 'node:path'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(__dirname, '../..')

// ponytail: force-deploy 2026-06-16T17:07

// --- Build-time version metadata (inject เป็น NEXT_PUBLIC_ env ตอน build) ---
// เหตุผล: ทำให้หน้า UI (เช่น /admin/line-settings) แสดง commit hash + version
// ที่กำลังรันอยู่จริงได้ ช่วยยืนยันด้วยสายตาว่า deploy อัปเดตแล้วหรือยัง
// โดยไม่ต้องเดาจากพฤติกรรมของระบบ
function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'))
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

function readShortCommitHash() {
  // 1) env var ที่ CI/DevOps ตั้งใน build pipeline (ทางที่น่าเชื่อถือที่สุด)
  if (process.env.NEXT_PUBLIC_BUILD_COMMIT) return process.env.NEXT_PUBLIC_BUILD_COMMIT

  // 2) git rev-parse (ทำงานใน local dev + build stage ที่มี .git/)
  try {
    const hash = execSync('git rev-parse --short HEAD', { cwd: workspaceRoot, encoding: 'utf8' }).trim()
    if (hash) return hash
  } catch {
    // ไม่มี .git/ → ไป fallback ถัดไป
  }

  // 3) marker file จาก install-playwright.js (commit hash ถูกจับตอน build stage
  //    แล้วเขียนลง marker ก่อนที่ Docker จะ COPY ไป runtime stage ที่ไม่มี .git/)
  try {
    const markerPath = path.join(workspaceRoot, '.playwright-browsers', '.installed')
    if (existsSync(markerPath)) {
      const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
      if (marker && typeof marker.commit === 'string' && marker.commit) return marker.commit
    }
  } catch {
    // marker ไม่มี/อ่านไม่ได้ → ไป fallback สุดท้าย
  }

  // 4) fallback สุดท้าย: build time short stamp (เช่น "0328" = เวลา build)
  //    เพื่อให้ badge ไม่ว่าง และยังบอกได้ว่า deploy ตัวไหน
  try {
    const now = new Date()
    const stamp = `${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}`
    return `build-${stamp}`
  } catch {
    return 'unknown'
  }
}

function readBuildTime() {
  return new Date().toISOString()
}


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseOrigin = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).origin : ''
  } catch {
    return ''
  }
})()
const supabaseWsOrigin = supabaseOrigin ? supabaseOrigin.replace('https://', 'wss://') : ''
const cspConnectSources = ['self', supabaseOrigin, supabaseWsOrigin].filter(Boolean).map((source) => source === 'self' ? "'self'" : source).join(' ')
const cspImageSources = ['self', 'data:', 'blob:', supabaseOrigin].filter(Boolean).map((source) => source === 'self' ? "'self'" : source).join(' ')
const isDevelopment = process.env.NODE_ENV !== 'production'
const cspScriptSources = [
  "'self'",
  "'unsafe-inline'",
  ...(isDevelopment ? ["'unsafe-eval'"] : []),
].join(' ')

const cspHeader = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  'script-src ' + cspScriptSources,
  "style-src 'self' 'unsafe-inline'",
  'img-src ' + cspImageSources,
  "font-src 'self' data:",
  'connect-src ' + cspConnectSources,
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: cspHeader },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), fullscreen=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
]

const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || readPackageVersion()
const BUILD_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT || readShortCommitHash()
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || readBuildTime()

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: workspaceRoot,
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
  // Externalize PDF/canvas packages so Turbopack ไม่ bundle Node-native internals
  // ของ @react-pdf/renderer (PDFKit/fontkit) และ @napi-rs/canvas (native Skia binary)
  // ป้องกันปัญหา bundling และรักษา performance ตอน runtime
  serverExternalPackages: ['@react-pdf/renderer', '@napi-rs/canvas'],
  // Inject build metadata เข้าเป็น client-visible env (Next จะ inline ใน bundle)
  env: {
    NEXT_PUBLIC_BUILD_VERSION: BUILD_VERSION,
    NEXT_PUBLIC_BUILD_COMMIT: BUILD_COMMIT,
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
  turbopack: {
    root: workspaceRoot,
    ignoreIssue: [
      { path: '**/next.config.mjs' },
      { path: '**/weight-ticket-line-notification.ts' },
    ],
  },
}

export default nextConfig
