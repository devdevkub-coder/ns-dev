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

function statCard(value: string, subValue: string, label: string, color = '#0284c7') {
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
      { type: 'text' as const, text: value, size: 'lg' as const, weight: 'bold' as const, color, align: 'center' as const, wrap: true },
      { type: 'text' as const, text: subValue, size: 'xxs' as const, color: '#64748b', align: 'center' as const, wrap: true },
      { type: 'text' as const, text: label, size: 'xs' as const, weight: 'bold' as const, color: '#334155', align: 'center' as const, margin: 'xs' as const },
    ],
  }
}

function summaryRow(icon: string, label: string, value: string, subValue?: string) {
  return {
    type: 'box' as const,
    layout: 'horizontal' as const,
    alignItems: 'flex-start' as const,
    spacing: 'sm' as const,
    contents: [
      {
        type: 'box' as const,
        layout: 'baseline' as const,
        spacing: 'xs' as const,
        flex: 4,
        contents: [
          { type: 'text' as const, text: icon, size: 'xs' as const, flex: 0 },
          { type: 'text' as const, text: label, size: 'xs' as const, color: '#64748b', wrap: true },
        ],
      },
      {
        type: 'box' as const,
        layout: 'vertical' as const,
        flex: 6,
        alignItems: 'flex-end' as const,
        contents: [
          { type: 'text' as const, text: value, size: 'xs' as const, weight: 'bold' as const, color: '#0f172a', align: 'end' as const, wrap: true },
          ...(subValue ? [{ type: 'text' as const, text: subValue, size: 'xxs' as const, color: '#64748b', align: 'end' as const, wrap: true }] : []),
        ],
      },
    ],
  }
}

// 1. การ์ดภาพรวมประจำเดือน (Monthly Overview Bubble)
function buildMonthlyOverviewBubble(summary: MonthlyReportSummaryData) {
  return {
    type: 'bubble' as const,
    size: 'giga' as const, // ขยายขนาดเต็มจอ (Giga size)
    header: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '18px',
      background: {
        type: 'linearGradient' as const,
        angle: '135deg',
        startColor: '#0f172a',
        endColor: '#1e3a8a', // Deep Blue Executive Palette
      },
      contents: [
        {
          type: 'box' as const,
          layout: 'baseline' as const,
          spacing: 'sm' as const,
          contents: [
            { type: 'text' as const, text: '●', size: 'xs' as const, flex: 0, color: '#38bdf8' },
            { type: 'text' as const, text: 'MONTHLY EXECUTIVE REPORT', color: '#38bdf8', size: 'xs' as const, weight: 'bold' as const },
          ],
        },
        {
          type: 'text' as const,
          text: `สรุปภาพรวม ${summary.monthDisplay}`,
          color: '#ffffff',
          size: 'xl' as const,
          weight: 'bold' as const,
          margin: 'xs' as const,
          wrap: true,
        },
        {
          type: 'text' as const,
          text: `📅 ${summary.dateRangeDisplay}`,
          color: '#94a3b8',
          size: 'xs' as const,
          margin: 'xs' as const,
          wrap: true,
        },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          height: '3px',
          backgroundColor: '#38bdf8',
          margin: 'md' as const,
          cornerRadius: '2px',
          contents: [{ type: 'filler' as const }],
        },
        {
          type: 'text' as const,
          text: `🏭 ทำงาน ${summary.activeDaysCount} วัน · คู่ค้า ${summary.uniquePartners} ราย · อัปเดต ${summary.generatedTime} น.`,
          color: '#cbd5e1',
          size: 'xs' as const,
          margin: 'sm' as const,
          wrap: true,
        },
      ],
    },
    body: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '18px',
      backgroundColor: '#ffffff',
      contents: [
        // 3 Big KPI Stat Cards
        {
          type: 'box' as const,
          layout: 'horizontal' as const,
          spacing: 'md' as const,
          contents: [
            statCard(fmtTon(summary.receiveTotalKg), `(${fmt(summary.receiveTotalKg)} กก.)`, 'รับเข้า', '#0284c7'),
            statCard(fmtTon(summary.loadTotalKg), `(${fmt(summary.loadTotalKg)} กก.)`, 'ขึ้นออก', '#0d9488'),
            statCard(`${summary.baleTotalCount} ก้อน`, fmtTon(summary.baleTotalKg), 'อัดก้อน', '#7c3aed'),
          ],
        },
        { type: 'separator' as const, color: '#f1f5f9', margin: 'lg' as const },
        {
          type: 'text' as const,
          text: '📊 ผลผลิตและการเคลื่อนไหวทั้งโรงงาน',
          size: 'xs' as const,
          weight: 'bold' as const,
          color: '#334155',
          margin: 'md' as const,
        },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          margin: 'sm' as const,
          spacing: 'md' as const,
          contents: [
            summaryRow('📥', `รับเข้า (${summary.receiveVendorsCount} ราย)`, fmtTon(summary.receiveTotalKg), `${fmt(summary.receiveTotalKg)} กก.`),
            summaryRow('🚛', `ขึ้นออก (${summary.loadCustomersCount} ราย)`, fmtTon(summary.loadTotalKg), `${fmt(summary.loadTotalKg)} กก.`),
            summaryRow('📦', 'งานอัดก้อน', `${summary.baleTotalCount} ก้อน`, `${fmtTon(summary.baleTotalKg)} (${fmt(summary.baleTotalKg)} กก.)`),
            summaryRow('🔀', 'งานคัดแยก', fmtTon(summary.sortTotalKg), `${fmt(summary.sortTotalKg)} กก.`),
          ],
        },
        ...(summary.financialSummary ? [
          { type: 'separator' as const, color: '#f1f5f9', margin: 'lg' as const },
          {
            type: 'text' as const,
            text: '💰 สรุปมูลค่าการซื้อ-ขายประจำเดือน',
            size: 'xs' as const,
            weight: 'bold' as const,
            color: '#334155',
            margin: 'md' as const,
          },
          {
            type: 'box' as const,
            layout: 'vertical' as const,
            margin: 'sm' as const,
            spacing: 'md' as const,
            contents: [
              summaryRow('🧾', `บิลรับซื้อ PB (${summary.financialSummary.purchaseBillCount} บิล)`, fmtMoney(summary.financialSummary.purchaseTotalAmount)),
              summaryRow('💵', `บิลขาย SB (${summary.financialSummary.salesBillCount} บิล)`, fmtMoney(summary.financialSummary.salesTotalAmount)),
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
        { type: 'text' as const, text: '👉 เลื่อนขวาเพื่อดูยอดแยกตามโกดัง (KD-0101..KD-0105)', size: 'xs' as const, color: '#64748b', align: 'center' as const },
      ],
    },
  }
}

// 2. การ์ดสรุปรายโกดังประจำเดือน (Monthly Warehouse Breakdown Bubble)
function buildMonthlyWarehouseBubble(wh: WarehouseDetailSummary, monthDisplay: string) {
  return {
    type: 'bubble' as const,
    size: 'giga' as const, // ขยายขนาดเต็มจอ (Giga size)
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
          spacing: 'sm' as const,
          contents: [
            { type: 'text' as const, text: '🏢', size: 'xs' as const, flex: 0 },
            { type: 'text' as const, text: `${wh.code} · ${monthDisplay}`, color: '#38bdf8', size: 'xs' as const, weight: 'bold' as const },
          ],
        },
        {
          type: 'text' as const,
          text: wh.name,
          color: '#ffffff',
          size: 'xl' as const,
          weight: 'bold' as const,
          margin: 'xs' as const,
          wrap: true,
        },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          height: '3px',
          backgroundColor: '#38bdf8',
          margin: 'md' as const,
          cornerRadius: '2px',
          contents: [{ type: 'filler' as const }],
        },
        {
          type: 'text' as const,
          text: `งานรวมทั้งเดือน ${wh.jobCount} รายการ`,
          color: '#cbd5e1',
          size: 'xs' as const,
          wrap: true,
        },
      ],
    },
    body: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '18px',
      backgroundColor: '#ffffff',
      contents: [
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          spacing: 'md' as const,
          contents: wh.types.length > 0
            ? wh.types.map((t) => summaryRow(t.icon, `${t.label} (${t.count} ครั้ง)`, fmtTon(t.kg), `${fmt(t.kg)} กก.`))
            : [summaryRow('ℹ️', 'สถานะ', 'ไม่มีความเคลื่อนไหวในเดือนนี้')],
        },
        { type: 'separator' as const, color: '#f1f5f9', margin: 'lg' as const },
        {
          type: 'text' as const,
          text: '📋 รายละเอียดกิจกรรมประจำเดือน',
          size: 'xs' as const,
          weight: 'bold' as const,
          color: '#334155',
          margin: 'md' as const,
        },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          spacing: 'sm' as const,
          margin: 'sm' as const,
          contents: wh.items.length > 0
            ? wh.items.slice(0, 6).map((item) => ({
              type: 'box' as const,
              layout: 'horizontal' as const,
              alignItems: 'center' as const,
              contents: [
                { type: 'text' as const, text: `${item.icon} ${item.title}`, size: 'xs' as const, color: '#334155', flex: 7, wrap: true },
                { type: 'text' as const, text: item.kgText, size: 'xs' as const, weight: 'bold' as const, color: '#0284c7', flex: 3, align: 'end' as const, wrap: true },
              ],
            }))
            : [{ type: 'text' as const, text: '- ไม่มีรายการ -', size: 'xs' as const, color: '#94a3b8' }],
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
