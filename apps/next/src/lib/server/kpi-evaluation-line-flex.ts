export type KpiEvaluation = {
  warehouseCode: string
  warehouseName: string
  accuracy: number
  speed: number
  targetHit: number
  avgScore: number
  problems: string
  solutions: string
  evaluatedBy: string
}

export type KpiReportData = {
  dateDisplay: string
  overallAvg: number
  evaluations: KpiEvaluation[]
}

function stars(score: number): string {
  const filled = Math.round(score)
  let s = ''
  for (let i = 1; i <= 5; i++) {
    s += i <= filled ? '★' : '☆'
  }
  return s
}

function ratingLabel(score: number): string {
  if (score >= 5) return 'ดีเยี่ยม'
  if (score >= 4) return 'ดี'
  if (score >= 3) return 'พอใช้'
  if (score >= 2) return 'ต้องปรับปรุง'
  return 'แย่'
}

function medalEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return '📊'
}

function buildOverviewBubble(data: KpiReportData) {
  const sorted = [...data.evaluations].sort((a, b) => b.avgScore - a.avgScore)
  const problemCount = data.evaluations.filter(e => e.problems && e.problems.trim().length > 0 && e.problems !== 'ไม่มี').length

  return {
    type: 'bubble' as const,
    size: 'giga' as const,
    header: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '18px',
      background: {
        type: 'linearGradient' as const,
        angle: '135deg',
        startColor: '#0f172a',
        endColor: '#065f46',
      },
      contents: [
        { type: 'text' as const, text: '⭐ KPI โกดังรายวัน — สรุปรวม', color: '#10b981', size: 'xs' as const, weight: 'bold' as const },
        { type: 'text' as const, text: `${data.overallAvg.toFixed(1)} / 5`, color: '#ffffff', size: '3xl' as const, weight: 'bold' as const, margin: 'md' },
        { type: 'text' as const, text: `${data.dateDisplay} · ${ratingLabel(data.overallAvg)}`, color: '#94a3b8', size: 'xs' as const, margin: 'xs' },
      ]
    },
    body: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '16px',
      backgroundColor: '#ffffff',
      contents: [
        { type: 'text' as const, text: '🏆 อันดับโกดังวันนี้', size: 'sm' as const, weight: 'bold' as const, color: '#475569', margin: 'md' },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          margin: 'md',
          spacing: 'md',
          contents: sorted.map((wh, idx) => ({
            type: 'box' as const,
            layout: 'horizontal' as const,
            alignItems: 'center' as const,
            contents: [
              { type: 'text' as const, text: medalEmoji(idx + 1), size: 'md' as const, flex: 0, margin: 'sm' },
              { type: 'text' as const, text: wh.warehouseName, size: 'sm' as const, weight: 'bold' as const, color: '#1e293b', flex: 4, margin: 'sm' },
              { type: 'text' as const, text: stars(wh.avgScore), size: 'sm' as const, color: '#f59e0b', flex: 3 },
              { type: 'text' as const, text: wh.avgScore.toFixed(1), size: 'sm' as const, weight: 'bold' as const, color: '#475569', align: 'end' as const, flex: 2 },
            ]
          }))
        },
        { type: 'separator' as const, color: '#f1f5f9', margin: 'xl' },
        { type: 'text' as const, text: `มีปัญหารายงานเข้ามา ${problemCount} รายการ — ดูการ์ดถัดไป →`, size: 'xs' as const, color: '#ef4444', weight: 'bold' as const, margin: 'md', align: 'center' as const }
      ]
    },
    footer: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '10px',
      backgroundColor: '#0f172a',
      contents: [
        { type: 'text' as const, text: 'NS SCRAP RECYCLING SYSTEM', size: 'xxs' as const, color: '#64748b', align: 'center' as const },
      ]
    }
  }
}

function buildWarehouseBubble(evalData: KpiEvaluation, dateDisplay: string) {
  let startColor = '#7f1d1d'
  let endColor = '#dc2626'

  if (evalData.avgScore >= 4) {
    startColor = '#065f46'
    endColor = '#047857'
  } else if (evalData.avgScore >= 3.5) {
    startColor = '#1e3a8a'
    endColor = '#2563eb'
  } else if (evalData.avgScore >= 3) {
    startColor = '#4c1d95'
    endColor = '#7c3aed'
  } else if (evalData.avgScore >= 2.5) {
    startColor = '#9a3412'
    endColor = '#ea580c'
  }

  const problemText = (evalData.problems && evalData.problems.trim()) || 'ไม่มี'
  const solutionText = (evalData.solutions && evalData.solutions.trim()) || '—'

  return {
    type: 'bubble' as const,
    size: 'giga' as const,
    header: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '18px',
      background: {
        type: 'linearGradient' as const,
        angle: '135deg',
        startColor,
        endColor,
      },
      contents: [
        { type: 'text' as const, text: `🏢 โกดัง ${evalData.warehouseName} ☀️`, color: '#ffffff', size: 'xl' as const, weight: 'bold' as const },
        { type: 'text' as const, text: stars(evalData.avgScore), color: '#fbbf24', size: 'xxl' as const, margin: 'md' },
        { type: 'text' as const, text: `${dateDisplay} · ${evalData.avgScore.toFixed(1)} คะแนน · ${ratingLabel(evalData.avgScore)}`, color: '#e2e8f0', size: 'xs' as const, margin: 'xs' },
      ]
    },
    body: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '16px',
      backgroundColor: '#ffffff',
      contents: [
        {
          type: 'box' as const,
          layout: 'horizontal' as const,
          contents: [
            { type: 'text' as const, text: '✅ ความถูกต้องของงาน', size: 'sm' as const, color: '#475569', flex: 5 },
            { type: 'text' as const, text: stars(evalData.accuracy), size: 'sm' as const, color: '#f59e0b', flex: 3 },
            { type: 'text' as const, text: evalData.accuracy.toString(), size: 'sm' as const, weight: 'bold' as const, color: '#475569', align: 'end' as const, flex: 2 }
          ]
        },
        {
          type: 'box' as const,
          layout: 'horizontal' as const,
          margin: 'md',
          contents: [
            { type: 'text' as const, text: '⚡ ความรวดเร็วในการทำงาน', size: 'sm' as const, color: '#475569', flex: 5 },
            { type: 'text' as const, text: stars(evalData.speed), size: 'sm' as const, color: '#f59e0b', flex: 3 },
            { type: 'text' as const, text: evalData.speed.toString(), size: 'sm' as const, weight: 'bold' as const, color: '#475569', align: 'end' as const, flex: 2 }
          ]
        },
        {
          type: 'box' as const,
          layout: 'horizontal' as const,
          margin: 'md',
          contents: [
            { type: 'text' as const, text: '🎯 การทำงานให้ถึงเป้า', size: 'sm' as const, color: '#475569', flex: 5 },
            { type: 'text' as const, text: stars(evalData.targetHit), size: 'sm' as const, color: '#f59e0b', flex: 3 },
            { type: 'text' as const, text: evalData.targetHit.toString(), size: 'sm' as const, weight: 'bold' as const, color: '#475569', align: 'end' as const, flex: 2 }
          ]
        },
        { type: 'separator' as const, color: '#f1f5f9', margin: 'lg' },
        {
          type: 'box' as const,
          layout: 'horizontal' as const,
          margin: 'lg',
          contents: [
            { type: 'text' as const, text: 'คะแนนรวม', size: 'sm' as const, weight: 'bold' as const, color: '#475569', flex: 5 },
            { type: 'text' as const, text: evalData.avgScore.toFixed(1), size: 'md' as const, weight: 'bold' as const, color: '#f59e0b', align: 'end' as const, flex: 5 }
          ]
        },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          margin: 'lg',
          backgroundColor: '#1e293b',
          cornerRadius: '8px',
          paddingAll: '12px',
          contents: [
            { type: 'text' as const, text: '⚠️ ปัญหาที่เจอวันนี้', size: 'xs' as const, color: '#94a3b8', weight: 'bold' as const },
            { type: 'text' as const, text: problemText, size: 'sm' as const, color: '#ffffff', margin: 'sm', wrap: true }
          ]
        },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          margin: 'md',
          backgroundColor: '#1e293b',
          cornerRadius: '8px',
          paddingAll: '12px',
          contents: [
            { type: 'text' as const, text: '🛠 วิธีแก้ไข', size: 'xs' as const, color: '#94a3b8', weight: 'bold' as const },
            { type: 'text' as const, text: solutionText, size: 'sm' as const, color: '#ffffff', margin: 'sm', wrap: true }
          ]
        },
        { type: 'text' as const, text: `ประเมินโดย: ${evalData.evaluatedBy}`, size: 'xs' as const, color: '#64748b', margin: 'xl', align: 'end' as const }
      ]
    },
    footer: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '10px',
      backgroundColor: '#0f172a',
      contents: [
        { type: 'text' as const, text: evalData.warehouseCode, size: 'xxs' as const, color: '#64748b', align: 'center' as const },
      ]
    }
  }
}

export function buildKpiEvaluationFlexMessage(data: KpiReportData) {
  const overview = buildOverviewBubble(data)

  // Sort evaluations so highest score is first in the bubbles
  const sorted = [...data.evaluations].sort((a, b) => b.avgScore - a.avgScore)
  const whBubbles = sorted.map(e => buildWarehouseBubble(e, data.dateDisplay))

  const bubbles = [overview, ...whBubbles].slice(0, 10)

  return {
    type: 'flex',
    altText: `⭐ สรุป KPI โกดังรายวัน ${data.dateDisplay}`,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  }
}
