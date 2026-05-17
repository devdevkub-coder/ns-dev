import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'

const root = resolve(new URL('..', import.meta.url).pathname)
const reportDir = join(root, 'reports/frontend-visual-audit')
const liveUrl = process.env.LIVE_URL || process.argv[2] || 'https://sirimasth.github.io/ns-scrap-erp/'
const viewKey = process.env.VIEW_KEY || process.argv[3] || 'cashOthersSummary'
const vuePath = process.env.VUE_PATH || process.argv[4] || '/cash-others-summary'
const vuePort = Number(process.env.VUE_PORT || 5279)

mkdirSync(reportDir, { recursive: true })

function startVueServer() {
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(vuePort), '--host', '127.0.0.1'], {
    cwd: root,
    env: { ...process.env, VITE_AUTH_BYPASS: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`))
  child.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))
  return child
}

async function waitForHttp(url, timeoutMs = 30000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // retry
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 300))
  }
  throw new Error(`Timeout waiting for ${url}`)
}

async function loginLive(page) {
  await page.goto(liveUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')

  const username = page.getByPlaceholder('ns-aom@nsscrap.com')
  if (await username.count()) {
    await username.fill('admin')
  } else {
    await page.locator('input').first().fill('admin')
  }

  await page.locator('input[type="password"]').fill('admin')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForTimeout(1200)
}

async function openLiveView(page) {
  await loginLive(page)
  await page.evaluate((key) => {
    if (typeof window._setView === 'function') {
      window._setView(key)
    }
  }, viewKey)
  await page.waitForTimeout(1000)
}

async function collectText(page) {
  return page.locator('h1,h2,h3,button,th').evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const element = node
        const style = window.getComputedStyle(element)
        return style.visibility !== 'hidden' && style.display !== 'none' && element.getClientRects().length > 0
      })
      .map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 140),
  )
}

async function captureViewport(browser, viewport) {
  const live = await browser.newPage({ viewport })
  const vue = await browser.newPage({ viewport })

  await openLiveView(live)
  await vue.goto(`http://127.0.0.1:${vuePort}${vuePath}`, { waitUntil: 'networkidle' })
  await vue.waitForTimeout(500)

  const name = viewport.width < 600 ? 'mobile' : 'desktop'
  await live.screenshot({ path: join(reportDir, `${viewKey}-${name}-live.png`), fullPage: true })
  await vue.screenshot({ path: join(reportDir, `${viewKey}-${name}-vue-live-compare.png`), fullPage: true })

  const result = {
    viewport,
    liveText: await collectText(live),
    vueText: await collectText(vue),
  }

  await live.close()
  await vue.close()
  return result
}

async function main() {
  const vueServer = startVueServer()
  try {
    await waitForHttp(`http://127.0.0.1:${vuePort}/`)
    const browser = await chromium.launch()
    const results = []
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      results.push(await captureViewport(browser, viewport))
    }
    await browser.close()
    console.log(JSON.stringify({
      liveUrl,
      vueUrl: `http://127.0.0.1:${vuePort}${vuePath}`,
      viewKey,
      screenshots: [
        `${viewKey}-desktop-live.png`,
        `${viewKey}-desktop-vue-live-compare.png`,
        `${viewKey}-mobile-live.png`,
        `${viewKey}-mobile-vue-live-compare.png`,
      ],
      results,
    }, null, 2))
  } finally {
    vueServer.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
