import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { buildLineWebhookUrl, isProtectedCredential } from './LineSettingsPageClient'

const pageSource = readFileSync(new URL('./LineSettingsPageClient.tsx', import.meta.url), 'utf8').replaceAll('\r\n', '\n')

describe('LINE settings connection helpers', () => {
  it('distinguishes a protected credential from a newly typed credential', () => {
    expect(isProtectedCredential('••••••••••••••••')).toBe(true)
    expect(isProtectedCredential('new-token')).toBe(false)
  })

  it('derives the LINE webhook endpoint from a valid public app URL', () => {
    expect(buildLineWebhookUrl('https://ns-erp-sit.vercel.app/'))
      .toBe('https://ns-erp-sit.vercel.app/api/line/webhook')
    expect(buildLineWebhookUrl('')).toBe('')
  })
})

describe('LINE settings guided connection contract', () => {
  it('keeps saved credentials protected and exposes each setup action in order', () => {
    expect(pageSource).toContain('บันทึกแล้ว — Protected')
    expect(pageSource).toContain('เปลี่ยนค่า')
    expect(pageSource).toContain('ยกเลิกการเปลี่ยนค่า')
    expect(pageSource).toContain('ทดสอบ Access Token')
    expect(pageSource).toContain('ทดสอบ Webhook ภายใน')
    expect(pageSource).toContain('คัดลอก Webhook URL')
    expect(pageSource).toContain('เปิด LINE Developers')
    expect(pageSource).toContain('ส่งข้อความทดสอบจริง')
    expect(pageSource).not.toContain("{showToken ? '🐵' : '🙈'}")
    expect(pageSource).not.toContain("{showSecret ? '🐵' : '🙈'}")

    const actionLabels = [
      'ทดสอบ Access Token',
      'บันทึกการตั้งค่า',
      'ทดสอบ Webhook ภายใน',
      'คัดลอก Webhook URL',
      'เปิด LINE Developers',
      'ส่งข้อความทดสอบจริง',
    ]
    const actionPositions = actionLabels.map((label) => pageSource.indexOf(label))

    expect(actionPositions.every((position) => position >= 0)).toBe(true)

    const guide = pageSource.slice(pageSource.indexOf('ลำดับการเชื่อมต่อ'))
    const phases = ['1. Environment', '2. Credentials', '3. Save', '4. Internal Webhook', '5. LINE Developers', '6. Target / ส่งจริง']
    const phasePositions = phases.map((phase) => guide.indexOf(phase))

    expect(phasePositions.every((position) => position >= 0)).toBe(true)
    expect(phasePositions).toEqual([...phasePositions].sort((left, right) => left - right))
  })

  it('uses only active targets and requires an explicit destination when needed', () => {
    expect(pageSource).toContain('targets.filter((target) => target.is_active)')
    expect(pageSource).toContain('defaultTarget?.id ?? (activeTargets.length === 1 ? activeTargets[0].id : \'\')')
    expect(pageSource).toContain('ไปที่กลุ่มแจ้งเตือน')
    expect(pageSource).toContain('disabled={!canSendTestMessage}')
    expect(pageSource).toContain('handleTestTarget(selectedTestTarget.target_id, selectedTestTarget.id)')
  })

  it('keeps connection feedback next to stable action buttons', () => {
    expect(pageSource).toContain("{activeTab !== 'credentials' && error ?")
    expect(pageSource).toContain("{activeTab !== 'credentials' && message ?")

    const credentials = pageSource.slice(
      pageSource.indexOf('/* Tab 2: Channel Credentials */'),
      pageSource.indexOf('/* Tab 3: Targets / Groups */'),
    )
    const feedbackPosition = credentials.indexOf('data-line-connection-feedback')
    const actionsPosition = credentials.indexOf('data-line-connection-actions')

    expect(feedbackPosition).toBeGreaterThanOrEqual(0)
    expect(actionsPosition).toBeGreaterThan(feedbackPosition)

    const actions = credentials.slice(actionsPosition)
    expect(actions).toContain('sm:grid-cols-3')
    expect(actions).toContain('aria-busy={isTestingOA}')
    expect(actions).toContain('aria-busy={isSaving}')
    expect(actions).toContain('aria-busy={isTestingWebhook}')
    expect(actions).not.toContain("isTestingOA ? 'กำลังทดสอบ Access Token...'")
    expect(actions).not.toContain("isSaving ? 'กำลังบันทึก...'")
    expect(actions).not.toContain("isTestingWebhook ? 'กำลังทดสอบ Webhook ภายใน...'")
  })

  it('groups all connection states into one compact status surface', () => {
    const credentials = pageSource.slice(
      pageSource.indexOf('/* Tab 2: Channel Credentials */'),
      pageSource.indexOf('/* Tab 3: Targets / Groups */'),
    )
    const summaryStart = credentials.indexOf('data-line-connection-summary')
    const summaryEnd = credentials.indexOf('{hasDeployedHostMismatch', summaryStart)
    const summary = credentials.slice(summaryStart, summaryEnd)

    expect(summaryStart).toBeGreaterThanOrEqual(0)
    expect(summary).toContain('grid grid-cols-2 xl:grid-cols-4')
    expect(summary).toContain('สภาพแวดล้อม')
    expect((summary.match(/data-line-connection-status/g) || []).length).toBe(4)
    const summaryOpeningTag = summary.slice(0, summary.indexOf('>') + 1)
    expect(summaryOpeningTag).toContain('className="space-y-3"')
    expect(summaryOpeningTag).not.toContain('bg-slate-50')
    expect(summaryOpeningTag).not.toContain('shadow-sm')
    expect(summaryOpeningTag).not.toContain('rounded-xl border')
    expect(summary).not.toContain('size-8 shrink-0')
  })

  it('keeps the connection flow app-like on mobile without changing desktop structure', () => {
    const credentials = pageSource.slice(
      pageSource.indexOf('/* Tab 2: Channel Credentials */'),
      pageSource.indexOf('/* Tab 3: Targets / Groups */'),
    )

    expect(pageSource).toContain('data-line-mobile-tabs')
    expect(pageSource).toContain('grid-cols-3')
    expect(pageSource).toContain('min-h-11')
    expect(credentials).toContain('grid-cols-2 xl:grid-cols-4')
    expect(credentials).toContain('p-4 shadow-sm lg:space-y-6 lg:p-6')
    expect(credentials).toContain('h-11')
    expect(credentials).toContain('lg:h-10')
    expect(credentials).toContain('data-line-mobile-guide')
  })

  it('keeps asynchronous credential results scoped to the connection tab', () => {
    expect(pageSource).toContain("const [connectionError, setConnectionError] = useState<string | null>(null)")
    expect(pageSource).toContain("const [connectionMessage, setConnectionMessage] = useState<string | null>(null)")
    expect(pageSource).toContain('{connectionError || connectionMessage ? (')

    const credentialHandlers = [
      ['const saveCredentials', 'const testOAConnection'],
      ['const testOAConnection', 'const testWebhookSignature'],
      ['const testWebhookSignature', 'const runExternalAction'],
      ['const copyWebhookUrl', '// Trigger Outbox Processing'],
    ]

    for (const [start, end] of credentialHandlers) {
      const handler = pageSource.slice(pageSource.indexOf(start), pageSource.indexOf(end))
      expect(handler).not.toContain('setError(')
      expect(handler).not.toContain('setMessage(')
    }
  })
})
