import { describe, expect, it, vi } from 'vitest'
import { fetchGoogleFinanceUsdThbQuote, parseGoogleFinanceUsdThbPage } from './google-finance-usd-thb'

const quotePage = `
  <html><body>
    <div>United States Dollar / Thai Baht</div>
    <div>36.742</div>
    <div>USD</div><div>THB</div><div>Market</div><div>Jul 31, 2026, 03:15:00 AM UTC</div>
  </body></html>
`

describe('Google Finance USD/THB quote', () => {
  it('parses rate and quote timestamp without applying a fallback value', () => {
    expect(parseGoogleFinanceUsdThbPage(quotePage)).toEqual({
      quotedAt: '2026-07-31T03:15:00.000Z',
      rate: 36.742,
      source: 'Google Finance',
    })
  })

  it('fails when Google Finance does not provide a usable USD/THB quote', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('<html></html>', { status: 200 }))
    await expect(fetchGoogleFinanceUsdThbQuote(fetchImpl)).rejects.toThrow('อ่านค่า USD/THB จาก Google Finance ไม่ได้')
  })
})
