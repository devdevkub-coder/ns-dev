import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pageSource = readFileSync(new URL('./LineSettingsPageClient.tsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const routeSource = readFileSync(new URL('../../api/admin/line-settings/route.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')

describe('LINE settings Google Sheets connector', () => {
  it('keeps the optional webhook visible, masked, editable, and persisted by the existing API', () => {
    expect(pageSource).toContain("const [showGoogleSheetsWebhook, setShowGoogleSheetsWebhook] = useState(false)")
    expect(pageSource).toContain('เชื่อมต่อ Google Sheets (ไม่บังคับ)')
    expect(pageSource).toContain('id="google-sheets-webhook-url"')
    expect(pageSource).toContain("type={showGoogleSheetsWebhook ? 'url' : 'password'}")
    expect(pageSource).toContain("value={form.googleSheetsWebhookUrl || ''}")
    expect(pageSource).toContain('googleSheetsWebhookUrl: e.target.value')
    expect(pageSource).toContain('data-line-google-sheets-disclosure')
    expect(pageSource).toContain('showGoogleSheetsWebhook ? <EyeOff')
    expect(pageSource).not.toContain("{showGoogleSheetsWebhook ? 'à¸‹à¹ˆà¸­à¸™' : 'à¹à¸ªà¸”à¸‡'}")
    expect(pageSource).toContain('เว้นว่างแล้วกดบันทึกเพื่อปิดการเชื่อมต่อ')
    expect(routeSource).toContain("{ key: 'GOOGLE_SHEETS_WEBHOOK_URL', value: values.googleSheetsWebhookUrl || null }")
  })
})
