const GOOGLE_FINANCE_USD_THB_URL = 'https://www.google.com/finance/beta/quote/USD-THB'

export type GoogleFinanceUsdThbQuote = {
  quotedAt: string | null
  rate: number
  source: 'Google Finance'
}

function toIsoFromDateString(value: string | null) {
  if (!value) return null
  const parsedAt = Date.parse(value)
  if (Number.isNaN(parsedAt)) return null
  return new Date(parsedAt).toISOString()
}

export function parseGoogleFinanceUsdThbPage(html: string) {
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

  const quotedAtCandidate = lines.slice(pairIndex + 2, pairIndex + 10).find((value) => value.endsWith('UTC')) ?? ''
  return {
    quotedAt: quotedAtCandidate.endsWith('UTC') ? toIsoFromDateString(quotedAtCandidate) : null,
    rate,
    source: 'Google Finance' as const,
  }
}

export async function fetchGoogleFinanceUsdThbQuote(fetchImpl: typeof fetch = fetch): Promise<GoogleFinanceUsdThbQuote> {
  const response = await fetchImpl(GOOGLE_FINANCE_USD_THB_URL, {
    cache: 'no-store',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; NS-Scrap-ERP/1.0; +https://example.local)',
    },
  })
  if (!response.ok) throw new Error(`Google Finance ตอบกลับ ${response.status}`)

  const quote = parseGoogleFinanceUsdThbPage(await response.text())
  if (!quote) throw new Error('อ่านค่า USD/THB จาก Google Finance ไม่ได้')
  return quote
}
