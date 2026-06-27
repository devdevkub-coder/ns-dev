import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const browsersPath = join(rootDir, '.playwright-browsers');

process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;

// จับ commit hash ตอนนี้ (build stage ที่มี .git/ อยู่) เพื่อเขียนลง marker file
// runtime stage จะไม่มี .git/ → ใช้ marker file เป็น fallback สำหรับ version badge
function readShortCommitHash() {
  // 1) env var ที่ CI/DevOps อาจตั้งไว้
  if (process.env.NEXT_PUBLIC_BUILD_COMMIT) return process.env.NEXT_PUBLIC_BUILD_COMMIT;
  // 2) git rev-parse (ทำงานใน build stage)
  try {
    return execSync('git rev-parse --short HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

const buildCommit = readShortCommitHash();

// ข้ามการติดตั้งซ้ำถ้ามี marker file ที่บันทึก path ตรงกับที่จะติดตั้ง
// เหตุผล: ลดเวลา build ใน CI/Docker ที่รัน install-playwright.js หลายครั้ง
const markerFile = join(browsersPath, '.installed');
if (existsSync(markerFile)) {
  try {
    const marker = JSON.parse(readFileSync(markerFile, 'utf8'));
    if (marker && marker.path === browsersPath) {
      console.log('[install-playwright] Chromium already installed at:', browsersPath, '(skipped via marker)');
      process.exit(0);
    }
  } catch {
    // marker อ่านไม่ได้ → ติดตั้งใหม่
  }
}

if (!existsSync(browsersPath)) {
  mkdirSync(browsersPath, { recursive: true });
}

try {
  console.log('[install-playwright] Installing Playwright chromium browser to:', browsersPath);
  execSync('npx playwright install chromium', { stdio: 'inherit' });
} catch (err) {
  console.error('[install-playwright] Failed to install playwright browser:', err);
  process.exit(1);
}

// เขียน marker file หลังติดตั้งสำเร็จ — runtime path resolver และ health endpoint ใช้ตรวจสอบได้
// รวมถึง commit hash ที่จับได้ใน build stage เพื่อเป็น fallback สำหรับ version badge
// (runtime stage ใน Docker ไม่มี .git/ จึงใช้ marker file เป็นแหล่ง commit hash)
try {
  writeFileSync(
    markerFile,
    JSON.stringify(
      {
        path: browsersPath,
        commit: buildCommit,
        installedAt: new Date().toISOString(),
        nodeVersion: process.version,
        platform: `${process.platform}-${process.arch}`,
      },
      null,
      2
    ) + '\n'
  );
  console.log('[install-playwright] Marker file written at:', markerFile, 'commit:', buildCommit || 'null');
} catch (err) {
  // ไม่ fatal — แค่ไม่สามารถ skip ใน build ครั้งถัดไป
  console.warn('[install-playwright] Could not write marker file (non-fatal):', err?.message || err);
}
