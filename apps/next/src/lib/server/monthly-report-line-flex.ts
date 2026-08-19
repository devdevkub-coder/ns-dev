import type { MonthlyReportSummaryData } from '@/lib/server/monthly-report-aggregator'
import type { WarehouseDetailSummary } from '@/lib/server/daily-report-aggregator'

function fmt(n: number) {
  return new Intl.NumberFormat('th-TH').format(Math.round(n || 0))
}

function fmtTon(kg: number) {
  const tons = (kg || 0) / 1000
  return `${tons.toLocaleString('th-TH', { maximumFractionDigits: 2, minimumFractionDigits: 1 })} ตัน`
}

function fmtMoney(amount: number) {
  return `${(amount || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })} บาท`
}

function statCard(value: string, label: string, color = '#0284c7') {
  return {
    type: 'box' as const,
    layout: 'vertical' as const,
    borderWidth: '1px' as const,
    borderColor: '#e2e8f0',
    cornerRadius: '10px',
    paddingAll: '10px',
    alignItems: 'center' as const,
    flex: 1,
    contents: [
      { type: 'text' as const, text: value, size: 'xl' as const, weight: 'bold' as const, color },
      { type: 'text' as const, text: label, size: 'xxs' as const, color: '#64748b' },
    ],
  }
}

function summaryRow(label: string, value: string) {
  return {
    type: 'box' as const,
    layout: 'horizontal' as const,
    contents: [
      { type: 'text' as const, text: label, size: 'xs' as const, color: '#64748b', flex: 3 },
      { type: 'text' as const, text: value, size: 'xs' as const, weight: 'bold' as const, color: '#1e293b', flex: 7, wrap: true },
    ],
  }
}

// 1. การ์ดภาพรวมประจำเดือน (Monthly Overview Bubble)
function buildMonthlyOverviewBubble(summary: MonthlyReportSummaryData) {
  return {
    type: 'bubble' as const,
    size: 'mega' as const,
    header: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '18px',
      background: {
        type: 'linearGradient' as const,
        angle: '135deg',
        startColor: '#0f172a',
        endColor: '#1e3a8a', // Deep Blue Theme for Monthly
      },
      contents: [
        {
          type: 'box' as const,
          layout: 'baseline' as const,
          spacing: 'sm',
          contents: [
            { type: 'text' as const, text: '●', size: 'xs' as const, flex: 0, color: '#38bdf8' },
            { type: 'text' as const, text: 'MONTHLY EXECUTIVE REPORT', color: '#38bdf8', size: 'xs' as const, weight: 'bold' as const },
          ],
        },
        { type: 'text' as const, text: `สรุปภาพรวม ${summary.monthDisplay}`, color: '#ffffff', size: 'xl' as const, weight: 'bold' as const, margin: 'xs' },
        { type: 'text' as const, text: `📅 ${summary.dateRangeDisplay}`, color: '#94a3b8', size: 'xs' as const, margin: 'xs' },
        { type: 'box' as const, layout: 'vertical' as const, height: '3px', backgroundColor: '#38bdf8', margin: 'md', cornerRadius: '2px', contents: [{ type: 'filler' as const }] },
        { type: 'text' as const, text: `🏭 ทำงาน ${summary.activeDaysCount} วัน · คู่ค้า ${summary.uniquePartners} ราย · สร้างเมื่อ ${summary.generatedTime} น.`, color: '#cbd5e1', size: 'xs' as const, margin: 'sm' },
      ],
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
          spacing: 'md',
          contents: [
            statCard(fmtTon(summary.receiveTotalKg), 'รับเข้าทั้งเดือน', '#0284c7'),
            statCard(fmtTon(summary.loadTotalKg), 'ขึ้นออกทั้งเดือน', '#0d9488'),
            statCard(`${summary.baleTotalCount}`, 'ก้อนอัด', '#7c3aed'),
          ],
        },
        { type: 'separator' as const, color: '#f1f5f9', margin: 'lg' },
        { type: 'text' as const, text: '📊 ผลผลิตและการเคลื่อนไหวทั้งโรง', size: 'xs' as const, weight: 'bold' as const, color: '#475569', margin: 'md' },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          margin: 'sm',
          spacing: 'sm',
          contents: [
            summaryRow('📥 ยอดรับเข้า', `${summary.receiveVendorsCount} Supplier · ${fmtTon(summary.receiveTotalKg)} (${fmt(summary.receiveTotalKg)} กก.)`),
            summaryRow('🚛 ยอดขึ้นออก', `${summary.loadCustomersCount} ลูกค้า · ${fmtTon(summary.loadTotalKg)} (${fmt(summary.loadTotalKg)} กก.)`),
            summaryRow('📦 ยอดอัดก้อน', `${summary.baleTotalCount} ก้อน · ${fmtTon(summary.baleTotalKg)} (${fmt(summary.baleTotalKg)} กก.)`),
            summaryRow('🔀 ยอดคัดแยก', `${fmtTon(summary.sortTotalKg)} (${fmt(summary.sortTotalKg)} กก.)`),
          ],
        },
        ...(summary.financialSummary ? [
          { type: 'separator' as const, color: '#f1f5f9', margin: 'lg' },
          { type: 'text' as const, text: '💰 สรุปมูลค่าการซื้อ-ขาย', size: 'xs' as const, weight: 'bold' as const, color: '#475569', margin: 'md' },
          {
            type: 'box' as const,
            layout: 'vertical' as const,
            margin: 'sm',
            spacing: 'sm',
            contents: [
              summaryRow('🧾 บิลรับซื้อ (PB)', `${summary.financialSummary.purchaseBillCount} บิล · ${fmtMoney(summary.financialSummary.purchaseTotalAmount)}`),
              summaryRow('💵 บิลขาย (SB)', `${summary.financialSummary.salesBillCount} บิล · ${fmtMoney(summary.financialSummary.salesTotalAmount)}`),
            ],
          },
        ] : []),
      ],
    },
    footer: {
      type: 'box' as const,
      layout: 'vertical' as const,
      backgroundColor: '#f8fafc',
      paddingAll: '12px',
      contents: [
        { type: 'text' as const, text: 'เลื่อนขวาเพื่อดูยอดแยกตามโกดัง (WH-01..WH-05) 👉', size: 'xxs' as const, color: '#94a3b8', align: 'center' as const },
      ],
    },
  }
}

// 2. การ์ดสรุปรายโกดังประจำเดือน (Monthly Warehouse Breakdown Bubble)
function buildMonthlyWarehouseBubble(wh: WarehouseDetailSummary, monthDisplay: string) {
  return {
    type: 'bubble' as const,
    size: 'mega' as const,
    header: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '18px',
      background: {
        type: 'linearGradient' as const,
        angle: '135deg',
        startColor: '#1e293b',
        endColor: '#334155',
      },
      contents: [
        {
          type: 'box' as const,
          layout: 'baseline' as const,
          spacing: 'sm',
          contents: [
            { type: 'text' as const, text: '🏢', size: 'xs' as const, flex: 0 },
            { type: 'text' as const, text: `${wh.code} · ${monthDisplay}`, color: '#38bdf8', size: 'xs' as const, weight: 'bold' as const },
          ],
        },
        { type: 'text' as const, text: wh.name, color: '#ffffff', size: 'xl' as const, weight: 'bold' as const, margin: 'xs' },
        { type: 'box' as const, layout: 'vertical' as const, height: '3px', backgroundColor: '#38bdf8', margin: 'md', cornerRadius: '2px', contents: [{ type: 'filler' as const }] },
        { type: 'text' as const, text: `งานรวมทั้งเดือน ${wh.jobCount} รายการ`, color: '#cbd5e1', size: 'xs' as const },
      ],
    },
    body: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '16px',
      backgroundColor: '#ffffff',
      contents: [
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          spacing: 'sm',
          contents: wh.types.length > 0
            ? wh.types.map((t) => summaryRow(`${t.icon} ${t.label}`, `${fmtTon(t.kg)} (${fmt(t.kg)} กก.) · ${t.count} ครั้ง`))
            : [summaryRow('สถานะ', 'ไม่มีความเคลื่อนไหวในเดือนนี้')],
        },
        { type: 'separator' as const, color: '#f1f5f9', margin: 'lg' },
        { type: 'text' as const, text: '📋 รายละเอียดกิจกรรมประจำเดือน', size: 'xs' as const, weight: 'bold' as const, color: '#475569', margin: 'md' },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          spacing: 'xs',
          margin: 'sm',
          contents: wh.items.length > 0
            ? wh.items.slice(0, 5).map((item) => ({
              type: 'box' as const,
              layout: 'horizontal' as const,
              contents: [
                { type: 'text' as const, text: `${item.icon} ${item.title}`, size: 'xxs' as const, color: '#334155', flex: 7 },
                { type: 'text' as const, text: item.kgText, size: 'xxs' as const, weight: 'bold' as const, color: '#0284c7', flex: 3, align: 'end' as const },
              ],
            }))
            : [{ type: 'text' as const, text: '- ไม่มีรายการ -', size: 'xxs' as const, color: '#94a3b8' }],
        },
      ],
    },
  }
}

/**
 * สร้าง Flex Message Carousel สำหรับสรุปผลประจำเดือน (Monthly Report)
 */
export function buildMonthlyReportFlexMessage(summary: MonthlyReportSummaryData) {
  const bubbles = [
    buildMonthlyOverviewBubble(summary),
    ...summary.warehouses.map((wh) => buildMonthlyWarehouseBubble(wh, summary.monthDisplay)),
  ]

  return {
    type: 'flex' as const,
    altText: `🗓️ สรุปประจำเดือน ${summary.monthDisplay} | NS Scrap ERP`,
    contents: {
      type: 'carousel' as const,
      contents: bubbles,
    },
  }
}
