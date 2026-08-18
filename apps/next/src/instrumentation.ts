import { randomUUID } from 'crypto'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[AUTO-CRON-SCHEDULER] Initializing Daily Report background scheduler...')

    let lastSentDate = ''

    // รันตรวจสอบเวลาทุก 20 วินาที
    setInterval(async () => {
      try {
        const { prisma } = await import('@/lib/server/prisma')
        const { getDailyProductionSummary } = await import('@/lib/server/daily-report-aggregator')
        const { buildDailyReportFlexMessage } = await import('@/lib/server/daily-report-line-flex')
        const { resolveLineTargetsForDocument } = await import('@/lib/server/line-notification-routing')
        const { sendLinePush } = await import('@/lib/server/weight-ticket-line-notification')

        // แปลงเวลาปัจจุบันเป็นเวลาไทย (Asia/Bangkok)
        const now = new Date()
        const bangkokTime = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Bangkok',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(now)

        const bangkokDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(now) // YYYY-MM-DD

        // อ่านค่าตั้งเวลาจาก system_settings
        const settings = await prisma.system_settings.findMany({
          where: {
            key: { in: ['DAILY_REPORT_AUTO_SEND', 'DAILY_REPORT_SCHEDULE_TIME', 'LINE_CHANNEL_ACCESS_TOKEN'] },
          },
        })
        const configMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))

        const autoSend = configMap.DAILY_REPORT_AUTO_SEND !== 'false'
        const scheduleTime = configMap.DAILY_REPORT_SCHEDULE_TIME || '18:00'
        const token = configMap.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN || ''

        if (!autoSend || !token) return

        // ตรวจสอบว่าตรงกับเวลาที่ตั้งไว้หรือไม่ และยังไม่ได้ส่งของวันนี้
        const sendKey = `${bangkokDate}_${scheduleTime}`
        if (bangkokTime === scheduleTime && lastSentDate !== sendKey) {
          lastSentDate = sendKey
          console.log(`[AUTO-CRON-SCHEDULER] ⏰ Triggering Daily Report at ${bangkokTime} (Date: ${bangkokDate})...`)

          const summary = await getDailyProductionSummary(now)
          const flexMessage = buildDailyReportFlexMessage(summary)

          const decisions = await resolveLineTargetsForDocument({ type: 'DAILY' })
          const targetIds = decisions.map((d) => d.targetId)

          if (targetIds.length === 0) {
            console.warn('[AUTO-CRON-SCHEDULER] No active targets found for DAILY report.')
            return
          }

          for (const targetId of targetIds) {
            try {
              const res = await sendLinePush(targetId, [flexMessage], token, randomUUID())
              console.log(`[AUTO-CRON-SCHEDULER] ✅ Sent to ${targetId}, reqId: ${res.lineRequestId}`)
            } catch (err) {
              console.error(`[AUTO-CRON-SCHEDULER] ❌ Failed to send to ${targetId}:`, err)
            }
          }
        }
      } catch (error) {
        // Silent catch to prevent crashing dev server interval
        console.error('[AUTO-CRON-SCHEDULER ERROR]:', error)
      }
    }, 20_000)
  }
}
