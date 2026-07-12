import { z } from 'zod'
import { currentActor } from '@/lib/server/daily'
import { prisma } from '@/lib/server/prisma'

const SALES_PLAN_LME_CONFIG_KEY = 'SALES_PLAN_LME_CONFIG'
const FX678_LME_URL = 'https://3g.fx678.com/Market/index/LME'
const GOOGLE_FINANCE_USD_THB_URL = 'https://www.google.com/finance/beta/quote/USD-THB'

const salesPlanLmeConfigSchema = z.object({
  fxRate: z.coerce.number().finite().min(0),
  kgPerContainer: z.coerce.number().finite().min(0),
  lmeAluminumUSD: z.coerce.number().finite().min(0),
  lmeBrassUSD: z.coerce.number().finite().min(0),
  lmeCopperUSD: z.coerce.number().finite().min(0),
  liveFetchNote: z.string().trim().max(500).default(''),
  source: z.enum(['default', 'live', 'manual', 'mixed']).default('default'),
})

export type SalesPlanLmeConfigInput = z.infer<typeof salesPlanLmeConfigSchema>

export type SalesPlanLmeConfig = SalesPlanLmeConfigInput & {
  updatedAt: string
  updatedBy: string
}

const defaultSalesPlanLmeConfig: SalesPlanLmeConfigInput = {
  fxRate: 36,
  kgPerContainer: 25000,
  lmeAluminumUSD: 2400,
  lmeBrassUSD: 7000,
  lmeCopperUSD: 9000,
  liveFetchNote: 'Live fetch: USD/THB จาก Google Finance และ LME จาก fx678 — ส่วนทองเหลือง/กก./ตู้ ต้องกรอกเอง',
  source: 'default',
}

function toConfig(row: { updated_at: Date; updated_by: string | null; value: string | null } | null) {
  let parsed: ReturnType<typeof salesPlanLmeConfigSchema.safeParse> | null = null
  if (row?.value) {
    try {
      parsed = salesPlanLmeConfigSchema.safeParse(JSON.parse(row.value))
    } catch {
      parsed = null
    }
  }
  const values = parsed?.success ? parsed.data : defaultSalesPlanLmeConfig
  return {
    ...defaultSalesPlanLmeConfig,
    ...values,
    updatedAt: row?.updated_at.toISOString() ?? '2026-05-19T00:00:00.000Z',
    updatedBy: row?.updated_by?.trim() || 'source',
  } satisfies SalesPlanLmeConfig
}

export async function getSalesPlanLmeConfig() {
  const row = await prisma.system_settings.findUnique({
    where: { key: SALES_PLAN_LME_CONFIG_KEY },
  })
  return toConfig(row)
}

function shouldAutoRefreshConfig(config: SalesPlanLmeConfig) {
  const lastUpdated = Date.parse(config.updatedAt)
  if (!Number.isFinite(lastUpdated)) return true
  return Date.now() - lastUpdated >= 6 * 60 * 60 * 1000
}

export async function saveSalesPlanLmeConfig(
  values: SalesPlanLmeConfigInput,
  context: Parameters<typeof currentActor>[0],
) {
  return saveSalesPlanLmeConfigByActor(values, currentActor(context))
}

export async function saveSalesPlanLmeConfigByActor(
  values: SalesPlanLmeConfigInput,
  updatedBy: string,
) {
  const parsed = salesPlanLmeConfigSchema.parse(values)
  const row = await prisma.system_settings.upsert({
    where: { key: SALES_PLAN_LME_CONFIG_KEY },
    create: {
      description: 'Sales Plan LME reference pricing config (manual + live fetched values)',
      key: SALES_PLAN_LME_CONFIG_KEY,
      updated_by: updatedBy,
      value: JSON.stringify(parsed),
    },
    update: {
      description: 'Sales Plan LME reference pricing config (manual + live fetched values)',
      updated_at: new Date(),
      updated_by: updatedBy,
      value: JSON.stringify(parsed),
    },
  })
  return toConfig(row)
}

function parseFxRatePayload(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null
  const rates = (payload as { conversion_rates?: Record<string, unknown> }).conversion_rates
  const thbRate = typeof rates?.THB === 'number' ? rates.THB : Number(rates?.THB ?? 0)
  return Number.isFinite(thbRate) && thbRate > 0 ? thbRate : null
}

function toIsoFromUnixSeconds(value: string | null) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(seconds * 1000).toISOString()
}

function toIsoFromDateString(value: string | null) {
  if (!value) return null
  const parsedAt = Date.parse(value)
  if (Number.isNaN(parsedAt)) return null
  return new Date(parsedAt).toISOString()
}

function parseGoogleFinanceUsdThbPage(html: string) {
  const lines = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\u202f/g, ' ')
    .replace(/\r/g, '')
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)

  const pairIndex = lines.findIndex((value) => value === 'United States Dollar / Thai Baht')
  if (pairIndex < 0) return null

  const rate = Number(lines[pairIndex + 1] ?? Number.NaN)
  if (!Number.isFinite(rate) || rate <= 0) return null

  const quotedAtCandidate = lines[pairIndex + 6] ?? ''
  const quotedAt = quotedAtCandidate.endsWith('UTC')
    ? toIsoFromDateString(quotedAtCandidate)
    : null

  return {
    rate,
    quotedAt,
  }
}

async function fetchUsdThbRateFromGoogleFinance() {
  const response = await fetch(GOOGLE_FINANCE_USD_THB_URL, {
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; NS-Scrap-ERP/1.0; +https://example.local)',
    },
  })
  if (!response.ok) {
    return { error: `Google Finance ตอบกลับ ${response.status}` as const }
  }

  const parsed = parseGoogleFinanceUsdThbPage(await response.text())
  if (!parsed) return { error: 'อ่านค่า USD/THB จาก Google Finance ไม่ได้' as const }
  return parsed
}

async function fetchUsdThbRateFromExchangeRateApi() {
  const apiKey = process.env.EXCHANGERATE_API_KEY
  if (!apiKey) return { error: 'ไม่ได้ตั้งค่า EXCHANGERATE_API_KEY' as const }

  const response = await fetch(`https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}/latest/USD`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    return { error: `ExchangeRate API ตอบกลับ ${response.status}` as const }
  }
  const rate = parseFxRatePayload(await response.json())
  if (!rate) return { error: 'อ่านค่า USD/THB จาก ExchangeRate API ไม่ได้' as const }
  return { rate }
}

async function fetchUsdThbRate() {
  const googleFinanceResult = await fetchUsdThbRateFromGoogleFinance()
  if (!('error' in googleFinanceResult)) {
    return {
      ...googleFinanceResult,
      provider: 'Google Finance' as const,
      fallbackUsed: false,
      fallbackReason: null,
    }
  }

  const exchangeRateResult = await fetchUsdThbRateFromExchangeRateApi()
  if (!('error' in exchangeRateResult)) {
    return {
      ...exchangeRateResult,
      quotedAt: null,
      provider: 'ExchangeRate API' as const,
      fallbackUsed: true,
      fallbackReason: googleFinanceResult.error,
    }
  }

  return {
    error: `${googleFinanceResult.error}; fallback ExchangeRate API: ${exchangeRateResult.error}` as const,
  }
}

function parseFx678Row(html: string, instrumentCode: string) {
  const escapedCode = instrumentCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const rowMatch = html.match(new RegExp(`<tr id="${escapedCode}"[\\s\\S]*?</tr>`, 'i'))
  if (!rowMatch) return null
  const lastMatch = rowMatch[0].match(/addNewsMenu\('select_market_last','([0-9.]+)'/i)
  const quoteTimeMatch = rowMatch[0].match(/addNewsMenu\('select_market_quotetime','([0-9]+)'/i)
  const price = Number(lastMatch?.[1] ?? Number.NaN)
  if (!Number.isFinite(price) || price <= 0) return null
  return {
    price,
    quotedAt: toIsoFromUnixSeconds(quoteTimeMatch?.[1] ?? null),
  }
}

async function fetchFx678MetalsValues() {
  const response = await fetch(FX678_LME_URL, {
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; NS-Scrap-ERP/1.0; +https://example.local)',
    },
  })
  if (!response.ok) {
    return { error: `fx678 ตอบกลับ ${response.status}` as const }
  }
  const html = await response.text()
  const copper = parseFx678Row(html, 'LMCI')
  const aluminum = parseFx678Row(html, 'LMAI')
  if (!copper && !aluminum) {
    return { error: 'อ่านค่าทองแดง/อลูมิเนียมจาก fx678 ไม่ได้' as const }
  }
  return { aluminum, copper }
}

export async function fetchLiveSalesPlanLmeConfig(currentConfig: SalesPlanLmeConfig) {
  const [fxResult, metalsResult] = await Promise.all([
    fetchUsdThbRate(),
    fetchFx678MetalsValues(),
  ])

  const fetchedAt = new Date().toISOString()
  const notes: string[] = ['Live fetch: USD/THB จาก Google Finance และ LME จาก fx678']
  if ('error' in fxResult) {
    notes.push(`USD/THB ใช้ค่าเดิม (${fxResult.error})`)
  } else {
    notes.push(`USD/THB source ${fxResult.provider}`)
    if (fxResult.quotedAt) notes.push(`USD/THB quote ${fxResult.quotedAt}`)
    if (fxResult.fallbackUsed && fxResult.fallbackReason) {
      notes.push(`USD/THB fallback จาก Google Finance (${fxResult.fallbackReason})`)
    }
  }
  if ('error' in metalsResult) {
    notes.push(`LME ใช้ค่าเดิม (${metalsResult.error})`)
  } else {
    if (metalsResult.copper?.quotedAt) notes.push(`ทองแดง quote ${metalsResult.copper.quotedAt}`)
    if (metalsResult.aluminum?.quotedAt) notes.push(`อลูมิเนียม quote ${metalsResult.aluminum.quotedAt}`)
    notes.push('ทองเหลืองยังให้ผู้ใช้กรอกเอง/คงค่า manual')
  }
  notes.push('กก./ตู้ ไม่ดึงจาก API และต้องกรอกเอง')

  return salesPlanLmeConfigSchema.parse({
    fxRate: 'error' in fxResult ? currentConfig.fxRate : fxResult.rate,
    kgPerContainer: currentConfig.kgPerContainer,
    lmeAluminumUSD: 'error' in metalsResult ? currentConfig.lmeAluminumUSD : (metalsResult.aluminum?.price ?? currentConfig.lmeAluminumUSD),
    lmeBrassUSD: currentConfig.lmeBrassUSD,
    lmeCopperUSD: 'error' in metalsResult ? currentConfig.lmeCopperUSD : (metalsResult.copper?.price ?? currentConfig.lmeCopperUSD),
    liveFetchNote: `${notes.join(' · ')} · fetched ${fetchedAt}`,
    source: 'mixed',
  })
}

export async function getSalesPlanLmeConfigAutoRefresh() {
  const currentConfig = await getSalesPlanLmeConfig()
  if (!process.env.EXCHANGERATE_API_KEY) return currentConfig
  if (!shouldAutoRefreshConfig(currentConfig)) return currentConfig
  try {
    const nextConfig = await fetchLiveSalesPlanLmeConfig(currentConfig)
    return await saveSalesPlanLmeConfigByActor(nextConfig, 'system:auto-live-refresh')
  } catch {
    return currentConfig
  }
}
