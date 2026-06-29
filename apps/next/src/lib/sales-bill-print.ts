import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'
import type { SalesBillDetail } from '@/lib/server/sales-bill-detail'

const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

const FIRST_PAGE_ITEM_ROWS = 16
const CONTINUATION_PAGE_ITEM_ROWS = 28

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function money(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function plain(value: string | null | undefined) {
  return value && value !== '-' ? value : '-'
}

function missing(value: string | null | undefined) {
  return value?.trim() || 'ไม่มีข้อมูล'
}

function companyInfo(profile: CompanyProfilePrintValues, bill: SalesBillDetail) {
  const branchLabel = bill.branchName?.trim() ? `สาขา ${bill.branchName.trim()}` : ''
  return [
    missing(profile.address),
    `โทร ${missing(profile.phone)}${profile.fax ? `  แฟกซ์ ${profile.fax}` : ''}`,
    `เลขประจำตัวผู้เสียภาษี ${missing(profile.taxId)}${branchLabel ? `  ${branchLabel}` : ''}`,
    [profile.email ? `Email: ${profile.email}` : null, profile.website ? `Website: ${profile.website}` : null].filter(Boolean).join('  '),
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

function totalsByUnit(bill: SalesBillDetail) {
  const byUnit = new Map<string, { amount: number; qty: number }>()
  bill.items.forEach((row) => {
    const unit = row.unit || 'กก.'
    const current = byUnit.get(unit) ?? { amount: 0, qty: 0 }
    current.amount += row.amount
    current.qty += row.qty
    byUnit.set(unit, current)
  })
  return Array.from(byUnit.entries()).map(([unit, value]) => ({ ...value, unit }))
}

function getTradingLabel(sourceLabel: string | null | undefined): string {
  if (!sourceLabel) return ''
  const parts = sourceLabel.split('/').map((p) => p.trim())
  const found = parts.find((p) =>
    p.startsWith('Trading PB') ||
    p.startsWith('Cost Source') ||
    p.startsWith('รอ Trading allocation')
  )
  return found || ''
}

function itemRows(bill: SalesBillDetail) {
  return bill.items.map((item) => {
    const tradingLabel = getTradingLabel(item.sourceLabel)
    return `
    <tr class="item-row">
      <td class="center rank-cell">${item.lineNo}</td>
      <td>
        <div class="item-name">${escapeHtml(item.productName)}</div>
        ${tradingLabel ? `<div class="muted">${escapeHtml(tradingLabel)}</div>` : ''}
        ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ''}
      </td>
      <td class="num strong">${money(item.netWeight || item.qty)}</td>
      <td class="num">${money(item.price)}</td>
      <td class="num">${money(item.discount)}</td>
      <td class="num strong">${money(item.amount)}</td>
    </tr>
  `}).join('')
}

function emptyRows(count: number) {
  return Array.from({ length: Math.max(0, count) }, () => (
    '<tr class="empty"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>'
  )).join('')
}

function fillerRowCount(itemCount: number) {
  if (itemCount <= FIRST_PAGE_ITEM_ROWS) return FIRST_PAGE_ITEM_ROWS - itemCount
  const lastPageRows = (itemCount - FIRST_PAGE_ITEM_ROWS) % CONTINUATION_PAGE_ITEM_ROWS
  return lastPageRows === 0 ? 0 : CONTINUATION_PAGE_ITEM_ROWS - lastPageRows
}

export function buildSalesBillPrintHtml(bill: SalesBillDetail, profile: CompanyProfilePrintValues) {
  const logoHtml = profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo no-logo">ไม่มีข้อมูล</div>'
  const cancelled = ['cancelled', 'canceled'].includes(bill.status.toLowerCase())
  const title = 'บิลขาย / Sales Bill'
  const afterDiscount = Math.max(0, bill.subtotal - bill.discount)
  const qtySummaryText = totalsByUnit(bill).map((item) => `${money(item.qty)} ${item.unit}`).join(' / ') || '-'
  const amountSummaryText = totalsByUnit(bill).map((item) => `${money(item.amount)} บาท`).join(' / ') || '-'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(bill.docNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.35; background: #f8fafc; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #15803d; color: white; font: inherit; cursor: pointer; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 7mm; background: white; position: relative; }
      .print-footer { display: none; }
      .accent { height: 4px; background: linear-gradient(90deg, #0f766e, #16a34a, #cbd5e1); border-radius: 99px; margin-bottom: 12px; }
      .header { display: grid; grid-template-columns: 1fr .9fr; gap: 12px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
      .company { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: start; min-width: 0; }
      .logo { width: 64px; height: 64px; object-fit: contain; }
      .no-logo { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 12px; font-weight: 800; text-align: center; }
      .company-name { font-size: 16px; font-weight: 800; color: #0f172a; }
      .company-en { font-size: 12px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 4px; color: #475569; font-size: 12px; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 22px; font-weight: 900; color: #0f766e; letter-spacing: 0; }
      .doc-status { display: inline-flex; margin-top: 6px; border-radius: 999px; background: #f1f5f9; color: #334155; padding: 4px 10px; font-weight: 800; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 6px 9px; background: #f1f5f9; color: #334155; font-weight: 900; }
      .panel-body { padding: 8px 9px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; }
      .field-label { color: #64748b; font-size: 12px; }
      .field-value { font-weight: 750; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; }
      .items { margin-top: 12px; font-size: 12px; break-inside: auto; page-break-inside: auto; table-layout: fixed; }
      .items thead { display: table-header-group; }
      .items tbody { break-inside: auto; page-break-inside: auto; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 6px 5px; text-align: left; font-weight: 900; }
      .items td { border: 1px solid #dbe3ea; padding: 6px 5px; vertical-align: top; }
      .items tr { break-inside: avoid; page-break-inside: avoid; }
      .items .empty td { height: 24px; color: transparent; }
      .item-name { font-weight: 850; color: #0f172a; }
      .muted { color: #64748b; font-size: 12px; margin-top: 1px; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .center { text-align: center; }
      .rank-cell { padding-left: 2px !important; padding-right: 2px !important; }
      .strong { font-weight: 900; }
      .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
      .summary-card { border: 1px solid #dbe3ea; border-radius: 8px; padding: 7px; background: #f8fafc; }
      .summary-card .label { color: #64748b; font-size: 12px; }
      .summary-card .value { font-size: 12px; font-weight: 900; color: #0f172a; margin-top: 2px; }
      .bottom-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
      .note { min-height: 42px; color: #334155; white-space: pre-wrap; }
      .totals { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .total-row { display: grid; grid-template-columns: minmax(0, 1fr) 30mm; gap: 8px; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
      .total-row:last-child { border-bottom: 0; }
      .total-row.final { background: #0f766e; color: white; font-size: 13px; font-weight: 900; }
      .total-row.advance { color: #b45309; }
      .read-warning { margin-top: 10px; border: 1px solid #fcd34d; border-radius: 8px; background: #fffbeb; color: #92400e; padding: 7px 9px; font-weight: 700; break-inside: avoid; page-break-inside: avoid; }
      .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 20px; break-inside: avoid; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 5px; margin-top: 28px; font-weight: 800; color: #1e293b; }
      .footer { margin-top: 8px; text-align: center; color: #64748b; font-size: 12px; }
      .watermark { display: ${cancelled ? 'block' : 'none'}; position: absolute; top: 72mm; left: 54mm; transform: rotate(-18deg); color: rgba(100,116,139,.14); font-size: 54px; font-weight: 900; pointer-events: none; }
      @media print {
        @page { size: A4 portrait; margin: 8mm 8mm 12mm; }
        body { background: white; font-size: 12px; line-height: 1.2; }
        .toolbar { display: none; }
        .page { width: auto; min-height: auto; padding: 0; }
        .print-footer { display: block; position: fixed; bottom: -6mm; left: 0; right: 0; text-align: center; color: #64748b; font-size: 12px; }
        .accent { margin-bottom: 7px; }
        .header { gap: 10px; padding-bottom: 7px; }
        .company { grid-template-columns: 48px 1fr; gap: 8px; }
        .logo { width: 48px; height: 48px; }
        .company-name { font-size: 14px; }
        .company-info { font-size: 12px; line-height: 1.25; margin-top: 2px; }
        .doc-title { font-size: 19px; }
        .doc-status { margin-top: 4px; padding: 3px 8px; }
        .section-grid { gap: 8px; margin-top: 7px; }
        .panel-title { padding: 4px 7px; }
        .panel-body { padding: 5px 7px; }
        .two-col { gap: 4px 8px; }
        .header, .section-grid { break-inside: avoid; page-break-inside: avoid; }
        .items { font-size: 12px; margin-top: 7px; page-break-before: auto; }
        .items th { padding: 3px 3px; }
        .items td { padding: 3px 3px; }
        .muted { font-size: 12px; }
        .summary-grid { gap: 6px; margin-top: 6px; }
        .summary-card { padding: 5px; }
        .summary-card .value { font-size: 12px; }
        .bottom-grid { gap: 8px; margin-top: 7px; break-before: auto; page-break-before: auto; }
        .note { min-height: 24px; }
        .total-row { padding: 3px 6px; }
        .total-row.final { font-size: 12px; }
        .signatures { gap: 18px; margin-top: 10px; }
        .sig-line { margin-top: 18px; padding-top: 3px; }
        .footer { margin-top: 4px; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิด</button>
      <span style="font-size: 12px;color:#cbd5e1">A4 portrait multi-page print</span>
    </div>
    <main class="page">
      <div class="watermark">${escapeHtml(bill.statusLabel)}</div>
      <div class="accent"></div>
      <section class="header">
        <div class="company">
          ${logoHtml}
          <div>
            <div class="company-name">${escapeHtml(missing(profile.name))}</div>
            ${profile.nameEn ? `<div class="company-en">${escapeHtml(profile.nameEn)}</div>` : ''}
            <div class="company-info">${companyInfo(profile, bill)}</div>
          </div>
        </div>
        <div class="doc-head">
          <div class="doc-title">${escapeHtml(title)}</div>
          <div class="doc-status">${escapeHtml(bill.statusLabel)}</div>
        </div>
      </section>

      <section class="section-grid">
        <div class="panel">
          <div class="panel-title">ข้อมูลลูกค้า / Customer</div>
          <div class="panel-body two-col">
            <div><div class="field-label">ชื่อลูกค้า</div><div class="field-value">${escapeHtml(bill.customerName)}</div></div>
            <div><div class="field-label">รหัสลูกค้า</div><div class="field-value">${escapeHtml(bill.customerCode)}</div></div>
            <div><div class="field-label">เลขผู้เสียภาษี</div><div class="field-value">${escapeHtml(plain(bill.customerTaxId))}</div></div>
            <div><div class="field-label">ช่องทางขาย</div><div class="field-value">${escapeHtml(plain(bill.channelName))}</div></div>
            ${bill.exportOrderNo ? `<div><div class="field-label">เลขที่ order ส่งออก</div><div class="field-value">${escapeHtml(bill.exportOrderNo)}</div></div>` : ''}
            <div style="grid-column:1 / -1"><div class="field-label">ที่อยู่</div><div class="field-value">${escapeHtml(plain(bill.customerAddress))}</div></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">ข้อมูลเอกสาร / Document Info</div>
          <div class="panel-body two-col">
            <div><div class="field-label">เลขที่เอกสาร</div><div class="field-value">${escapeHtml(bill.docNo)}</div></div>
            <div><div class="field-label">วันที่เอกสาร</div><div class="field-value">${escapeHtml(plain(bill.billDate || bill.date))}</div></div>
            <div><div class="field-label">ประเภทบิล</div><div class="field-value">${escapeHtml(plain(bill.transactionMode))}</div></div>
            <div><div class="field-label">ผู้จัดทำ</div><div class="field-value">${escapeHtml(plain(bill.createdBy))}</div></div>
            <div><div class="field-label">ใบส่งของ WTO</div><div class="field-value">${escapeHtml(bill.deliveryDocNos.join(', ') || '-')}</div></div>
          </div>
        </div>
      </section>

      ${bill.readModelWarning ? `<div class="read-warning">${escapeHtml(bill.readModelWarning)}</div>` : ''}

      <table class="items">
        <thead>
          <tr>
            <th class="center rank-cell" style="width:8mm">#</th>
            <th style="width:78mm">สินค้า</th>
            <th class="num" style="width:24mm">จำนวนสุทธิ</th>
            <th class="num" style="width:20mm">ราคา</th>
            <th class="num" style="width:18mm">ส่วนลด</th>
            <th class="num" style="width:22mm">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows(bill)}
          ${emptyRows(fillerRowCount(bill.items.length))}
        </tbody>
      </table>

      <div class="summary-grid">
        <div class="summary-card"><div class="label">จำนวนสุทธิรวม</div><div class="value">${escapeHtml(qtySummaryText)}</div></div>
        <div class="summary-card"><div class="label">มูลค่ารายการรวม</div><div class="value">${escapeHtml(amountSummaryText)}</div></div>
      </div>

      <section class="bottom-grid">
        <div class="panel">
          <div class="panel-title">หมายเหตุ</div>
          <div class="panel-body">
            <div class="note">${escapeHtml(plain(bill.note))}</div>
          </div>
        </div>
        <div class="totals">
          <div class="total-row"><div>ยอดเงินรวม</div><div class="num">${money(bill.subtotal)}</div></div>
          <div class="total-row"><div>หักส่วนลดท้ายบิล</div><div class="num">${money(bill.discount)}</div></div>
          <div class="total-row"><div>ยอดหลังหักส่วนลด</div><div class="num">${money(afterDiscount)}</div></div>
          <div class="total-row"><div>VAT ${escapeHtml(bill.vatType)}</div><div class="num">${money(bill.vatAmount)}</div></div>
          <div class="total-row final"><div>ยอดรวมทั้งสิ้น</div><div class="num">${money(bill.totalAmount)}</div></div>
          <div class="total-row advance"><div>หักมัดจำ Customer${bill.customerAdvanceDocNo ? ` (${escapeHtml(bill.customerAdvanceDocNo)})` : ''}</div><div class="num">${money(bill.receivedAmount || bill.paidAmount)}</div></div>
          <div class="total-row"><div>ยอดลูกหนี้สุทธิ</div><div class="num strong">${money(bill.receivableBalance)}</div></div>
        </div>
      </section>

      <section class="signatures">
        <div class="sig"><div class="sig-line">ผู้จัดทำเอกสาร</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้ส่งมอบสินค้า</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้รับสินค้า / ลูกค้า</div><div>วันที่ ____ / ____ / ______</div></div>
      </section>
      <div class="footer">${escapeHtml(profile.footerNote || '')}</div>
    </main>
    <div class="print-footer">${escapeHtml(profile.footerNote || `${bill.docNo} · ${title}`)}</div>
  </body></html>`
}

function writeLoading(printWindow: Window) {
  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมใบพิมพ์บิลขาย...</body></html>`)
  printWindow.document.close()
}

export function openSalesBillPrintWindow() {
  const printWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  writeLoading(printWindow)
  printWindow.focus()
  return printWindow
}

export async function openSalesBillPrint(bill: SalesBillDetail, targetWindow?: Window) {
  const printWindow = targetWindow ?? openSalesBillPrintWindow()
  const query = bill.branchId ? `?branchId=${encodeURIComponent(bill.branchId)}` : ''
  const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = companyProfileForPrint(payload)
  printWindow.document.open()
  printWindow.document.write(buildSalesBillPrintHtml(bill, profile))
  printWindow.document.close()
  printWindow.focus()
}
