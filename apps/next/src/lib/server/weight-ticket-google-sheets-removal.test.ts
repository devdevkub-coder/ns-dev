import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const weightTicketSources = [
  resolve(process.cwd(), 'src/app/api/daily/weight-tickets/route.ts'),
  resolve(process.cwd(), 'src/app/api/daily/weight-tickets/[id]/route.ts'),
  resolve(process.cwd(), 'src/lib/server/weight-ticket-line-notification.ts'),
  resolve(process.cwd(), 'src/app/api/admin/line-settings/route.ts'),
  resolve(process.cwd(), 'src/app/admin/line-settings/LineSettingsPageClient.tsx'),
].map((path) => readFileSync(path, 'utf8'))
const retirementMigration = readFileSync(
  resolve(process.cwd(), '../../supabase/migrations/20260806100000_retire_google_sheets_weight_ticket_setting.sql'),
  'utf8',
)

describe('weight-ticket Google Sheets removal contract', () => {
  it('does not sync WTI or WTO lifecycle events to Google Sheets', () => {
    for (const source of weightTicketSources) {
      expect(source).not.toContain('syncWeightTicketToGoogleSheets')
      expect(source).not.toContain('google-sheets-sync')
      expect(source).not.toContain('GOOGLE_SHEETS_WEBHOOK_URL')
      expect(source).not.toContain('googleSheetsWebhookUrl')
    }
  })

  it('retires the obsolete persisted webhook setting without changing migration history', () => {
    expect(retirementMigration).toContain("where key = 'GOOGLE_SHEETS_WEBHOOK_URL'")
    expect(retirementMigration).toContain('delete from public.system_settings')
  })
})
