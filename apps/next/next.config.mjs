import path from 'node:path'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
  try {
    return execSync('git rev-parse --short HEAD', { cwd: workspaceRoot, encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function readBuildTime() {
  return new Date().toISOString()
}

const BUILD_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || readPackageVersion()
const BUILD_COMMIT = process.env.NEXT_PUBLIC_BUILD_COMMIT || readShortCommitHash()
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || readBuildTime()

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: workspaceRoot,
  reactStrictMode: true,
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
