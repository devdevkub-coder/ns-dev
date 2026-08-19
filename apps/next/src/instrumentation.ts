import { randomUUID } from 'crypto'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[AUTO-CRON-SCHEDULER] Initializing Daily & Monthly Report background scheduler...')

    let lastSentDailyKey = ''
    let lastSentMonthlyKey = ''

    // รันตรวจสอบเวลาทุก 20 วินาที
    setInterval(async () => {
      try {
        const { prisma } = await import('@/lib/server/prisma')
        const { getDailyProductionSummary } = await import('@/lib/server/daily-report-aggregator')
        const { buildDailyReportFlexMessage } = await import('@/lib/server/daily-report-line-flex')
        const { getMonthlyProductionSummary } = await import('@/lib/server/monthly-report-aggregator')
        const { buildMonthlyReportFlexMessage } = await import('@/lib/server/monthly-report-line-flex')
        const { resolveLineTargetsForDocument } = await import('@/lib/server/line-notification-routing')
        const { sendLinePush } = await import('@/lib/server/weight-ticket-line-notification')

        // แปลงเวลาปัจจุบันเป็นเวลาไทย (Asia/Bangkok)
        const now = new Date()
        const bangkokTime = new Intl.DateTimeFormat('en-GB', {
          hour: '2-digit',
          hour12: false,
          minute: '2-digit',
          timeZone: 'Asia/Bangkok',
        }).format(now)

        const bangkokDate = new Intl.DateTimeFormat('en-CA', {
          day: '2-digit',
          month: '2-digit',
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
        }).format(now) // YYYY-MM-DD

        const bangkokDayOfMonth = Number(bangkokDate.slice(8, 10))
        const bangkokMonthStr = bangkokDate.slice(0, 7) // YYYY-MM

        // อ่านค่าตั้งเวลาจาก system_settings
        const settings = await prisma.system_settings.findMany({
          where: {
            key: {
              in: [
                'DAILY_REPORT_AUTO_SEND',
                'DAILY_REPORT_SCHEDULE_TIME',
                'MONTHLY_REPORT_AUTO_SEND',
                'MONTHLY_REPORT_SCHEDULE_TIME',
                'MONTHLY_REPORT_DAY',
                'LINE_CHANNEL_ACCESS_TOKEN',
              ],
            },
          },
        })
        const configMap = Object.fromEntries(settings.map((s) => [s.key, s.value]))
        const token = configMap.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
        if (!token) return

        // 1. ตรวจสอบการส่ง Daily Report
        const dailyAutoSend = configMap.DAILY_REPORT_AUTO_SEND !== 'false'
        const dailyScheduleTime = configMap.DAILY_REPORT_SCHEDULE_TIME || '18:00'
        const dailySendKey = `${bangkokDate}_${dailyScheduleTime}`

        if (dailyAutoSend && bangkokTime === dailyScheduleTime && lastSentDailyKey !== dailySendKey) {
          lastSentDailyKey = dailySendKey
          console.log(`[AUTO-CRON-SCHEDULER] ⏰ Triggering Daily Report at ${bangkokTime} (Date: ${bangkokDate})...`)

          const summary = await getDailyProductionSummary(now)
          const flexMessage = buildDailyReportFlexMessage(summary)
          const decisions = await resolveLineTargetsForDocument({ type: 'DAILY' })
          const targetIds = [...new Set(decisions.map((d) => d.targetId))]

          for (const targetId of targetIds) {
            try {
              const res = await sendLinePush(targetId, [flexMessage], token, randomUUID())
              console.log(`[AUTO-CRON-SCHEDULER] ✅ Daily Report sent to ${targetId}, reqId: ${res.lineRequestId}`)
            } catch (err) {
              console.error(`[AUTO-CRON-SCHEDULER] ❌ Failed to send Daily Report to ${targetId}:`, err)
            }
          }
        }

        // 2. ตรวจสอบการส่ง Monthly Report (เช่น ทุกวันที่ 1 ของเดือน หรือสิ้นเดือน)
        const monthlyAutoSend = configMap.MONTHLY_REPORT_AUTO_SEND !== 'false'
        const targetMonthlyDay = Number(configMap.MONTHLY_REPORT_DAY || '1')
        const monthlyScheduleTime = configMap.MONTHLY_REPORT_SCHEDULE_TIME || '08:00'
        const monthlySendKey = `${bangkokMonthStr}_${targetMonthlyDay}_${monthlyScheduleTime}`

        if (monthlyAutoSend && bangkokDayOfMonth === targetMonthlyDay && bangkokTime === monthlyScheduleTime && lastSentMonthlyKey !== monthlySendKey) {
          lastSentMonthlyKey = monthlySendKey
          console.log(`[AUTO-CRON-SCHEDULER] 🗓️ Triggering Monthly Report at ${bangkokTime} (Month: ${bangkokMonthStr})...`)

          // สรุปยอดของเดือนก่อนหน้าถ้าส่งวันที่ 1 หรือเดือนปัจจุบัน
          const reportDate = new Date(now)
          if (targetMonthlyDay === 1) {
            // วันที่ 1 เช้า ให้ส่งสรุปของเดือนที่เพิ่งจบไป
            reportDate.setDate(0)
          }

          const monthlySummary = await getMonthlyProductionSummary(reportDate)
          const monthlyFlexMessage = buildMonthlyReportFlexMessage(monthlySummary)

          let monthlyDecisions = await resolveLineTargetsForDocument({ type: 'MONTHLY' })
          if (monthlyDecisions.length === 0) {
            monthlyDecisions = await resolveLineTargetsForDocument({ type: 'DAILY' })
          }
          const monthlyTargetIds = [...new Set(monthlyDecisions.map((d) => d.targetId))]

          for (const targetId of monthlyTargetIds) {
            try {
              const res = await sendLinePush(targetId, [monthlyFlexMessage], token, randomUUID())
              console.log(`[AUTO-CRON-SCHEDULER] ✅ Monthly Report sent to ${targetId}, reqId: ${res.lineRequestId}`)
            } catch (err) {
              console.error(`[AUTO-CRON-SCHEDULER] ❌ Failed to send Monthly Report to ${targetId}:`, err)
            }
          }
        }
      } catch (error) {
        console.error('[AUTO-CRON-SCHEDULER ERROR]:', error)
      }
    }, 20_000)
  }
}
