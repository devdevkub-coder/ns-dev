import type { DailyReportSummaryData, WarehouseDetailSummary } from '@/lib/server/daily-report-aggregator'

function fmt(n: number) {
  return new Intl.NumberFormat('th-TH').format(Math.round(n || 0))
}

function statCard(value: string, label: string, color = '#047857') {
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

// 1. การ์ดภาพรวม (Overview Bubble)
function buildOverviewBubble(summary: DailyReportSummaryData) {
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
        endColor: '#065f46',
      },
      contents: [
        {
          type: 'box' as const,
          layout: 'baseline' as const,
          spacing: 'sm',
          contents: [
            { type: 'text' as const, text: '●', size: 'xs' as const, flex: 0, color: '#10b981' },
            { type: 'text' as const, text: 'DAILY REPORT', color: '#10b981', size: 'xs' as const, weight: 'bold' as const },
          ],
        },
        { type: 'text' as const, text: 'รายงานสรุป', color: '#ffffff', size: 'xl' as const, weight: 'bold' as const, margin: 'xs' },
        { type: 'text' as const, text: summary.dateDisplay, color: '#94a3b8', size: 'xs' as const, margin: 'xs' },
        { type: 'box' as const, layout: 'vertical' as const, height: '3px', backgroundColor: '#10b981', margin: 'md', cornerRadius: '2px', contents: [{ type: 'filler' as const }] },
        { type: 'text' as const, text: `🕐 เริ่ม ${summary.earliestTime} · เสร็จ ${summary.latestTime}`, color: '#cbd5e1', size: 'xs' as const, margin: 'sm' },
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
            statCard(`${summary.totalJobs}`, 'งาน'),
            statCard(`${summary.completedJobs}`, 'เสร็จ'),
            statCard(`${summary.uniqueCustomers}`, 'ลูกค้า'),
          ],
        },
        { type: 'separator' as const, color: '#f1f5f9', margin: 'lg' },
        { type: 'text' as const, text: '🏢 รวมทั้งโรง', size: 'xs' as const, weight: 'bold' as const, color: '#475569', margin: 'md' },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          margin: 'sm',
          spacing: 'sm',
          contents: [
            summaryRow('📥 รับเข้า', `${summary.receiveVendorsCount} ลูกค้า · ${fmt(summary.receiveTotalKg)} กก.`),
            summaryRow('📦 อัดก้อน', `${summary.baleTotalCount} ก้อน · ${fmt(summary.baleTotalKg)} กก.`),
            summaryRow('🚛 ส่งออก', `${summary.loadCustomersCount} ลูกค้า · ${fmt(summary.loadTotalKg)} กก.`),
          ],
        },
      ],
    },
    footer: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '10px',
      backgroundColor: '#0f172a',
      contents: [
        { type: 'text' as const, text: 'NS SCRAP RECYCLING SYSTEM', size: 'xxs' as const, color: '#64748b', align: 'center' as const },
      ],
    },
  }
}

// 2. การ์ดรายโกดัง (Warehouse Bubble)
function buildWarehouseBubble(wh: WarehouseDetailSummary) {
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
        endColor: '#1e3a8a',
      },
      contents: [
        {
          type: 'box' as const,
          layout: 'baseline' as const,
          spacing: 'sm',
          contents: [
            { type: 'text' as const, text: '🏗️', size: 'xs' as const, flex: 0 },
            { type: 'text' as const, text: wh.name, color: '#ffffff', size: 'md' as const, weight: 'bold' as const, flex: 1 },
            { type: 'text' as const, text: '● WAREHOUSE', color: '#38bdf8', size: 'xs' as const, weight: 'bold' as const, flex: 0 },
          ],
        },
        { type: 'text' as const, text: `${wh.code} · ${wh.jobCount} งาน · ${wh.completedCount} เสร็จ`, color: '#94a3b8', size: 'xs' as const, margin: 'xs' },
        { type: 'box' as const, layout: 'vertical' as const, height: '3px', backgroundColor: '#38bdf8', margin: 'md', cornerRadius: '2px', contents: [{ type: 'filler' as const }] },
        { type: 'text' as const, text: `🕐 ${wh.startTime} → ${wh.endTime}`, color: '#cbd5e1', size: 'xs' as const, margin: 'sm' },
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
            statCard(`${wh.customerCount}`, 'ลูกค้า'),
            statCard(`${wh.jobCount}`, 'งาน'),
            statCard('—', 'Eff.', '#64748b'),
          ],
        },
        { type: 'separator' as const, color: '#f1f5f9', margin: 'md' },
        { type: 'text' as const, text: '📊 สรุปรายประเภท', size: 'xs' as const, weight: 'bold' as const, color: '#475569', margin: 'md' },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          margin: 'sm',
          spacing: 'xs',
          contents: wh.types.map((t) =>
            summaryRow(`${t.icon} ${t.label}`, `${t.count} งาน · ${fmt(t.kg)} กก.`),
          ),
        },
        { type: 'separator' as const, color: '#f1f5f9', margin: 'md' },
        { type: 'text' as const, text: `📋 รายการงาน (${wh.items.length} รายการ)`, size: 'xs' as const, weight: 'bold' as const, color: '#475569', margin: 'md' },
        {
          type: 'box' as const,
          layout: 'vertical' as const,
          margin: 'sm',
          spacing: 'sm',
          contents: wh.items.map((it) => ({
            type: 'box' as const,
            layout: 'horizontal' as const,
            alignItems: 'center' as const,
            contents: [
              {
                type: 'box' as const,
                layout: 'vertical' as const,
                flex: 7,
                contents: [
                  { type: 'text' as const, text: `${it.icon} ${it.title}`, size: 'xs' as const, weight: 'bold' as const, color: '#1e293b', wrap: true },
                  { type: 'text' as const, text: `— ➔ ${it.timeText}`, size: 'xxs' as const, color: '#94a3b8' },
                ],
              },
              { type: 'text' as const, text: it.kgText, size: 'xs' as const, weight: 'bold' as const, color: '#0284c7', align: 'end' as const, flex: 3 },
              { type: 'text' as const, text: '✅', size: 'xs' as const, margin: 'xs', flex: 0 },
            ],
          })),
        },
      ],
    },
    footer: {
      type: 'box' as const,
      layout: 'vertical' as const,
      paddingAll: '10px',
      backgroundColor: '#0f172a',
      contents: [
        { type: 'text' as const, text: `${wh.code} · ${wh.name}`, size: 'xxs' as const, color: '#64748b', align: 'center' as const },
      ],
    },
  }
}

// 3. Main Builder (ส่ง Carousel ออกไป)
export function buildDailyReportFlexMessage(summary: DailyReportSummaryData) {
  const overview = buildOverviewBubble(summary)
  const whBubbles = summary.warehouses.map(buildWarehouseBubble)

  // รวม bubbles ทั้งหมด (สูงสุด 10 ใบตาม LINE API limit)
  const bubbles = [overview, ...whBubbles].slice(0, 10)

  return {
    type: 'flex',
    altText: `📊 สรุปรายงานการผลิตประจำวัน ${summary.dateDisplay}`,
    contents: {
      type: 'carousel',
      contents: bubbles,
    },
  }
}
