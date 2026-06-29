import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'

const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

const FIRST_PAGE_ITEM_ROWS = 17
const CONTINUATION_PAGE_ITEM_ROWS = 28

export type PoBuyPrintItem = {
  productId: string
  productName: string
  qty: number
  remainingQty: number
  unit?: string | null
  unitPrice: number
}

export type PoBuyPrintDocument = {
  branchId: string
  branchName?: string | null
  createdAt: string
  createdBy: string
  date: string
  docNo: string
  expectedDelivery: string
  id: string
  items: PoBuyPrintItem[]
  notes: string
  remainingAmount: number
  remainingQty: number
  shortClosedAt: string
  shortClosedBy: string
  shortClosedNote: string
  shortClosedQty: number
  status: string
  supplierId: string
  supplierAddress: string
  supplierName: string
  totalAmount: number
  hasVat?: boolean | null
  vatAmount?: number | null
  vatRatePercent?: number | null
  vatType?: string | null
}

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

function dateDisplay(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  })
}

function dateTimeDisplay(value: string | null | undefined) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  })
}

function missing(value: string | null | undefined) {
  return value?.trim() || 'ไม่มีข้อมูล'
}

function companyInfo(profile: CompanyProfilePrintValues, po: PoBuyPrintDocument) {
  const branchLabel = po.branchName?.trim() ? `สาขา ${po.branchName.trim()}` : ''
  return [
    missing(profile.address),
    `โทร ${missing(profile.phone)}${profile.fax ? `  แฟกซ์ ${profile.fax}` : ''}`,
    `เลขประจำตัวผู้เสียภาษี ${missing(profile.taxId)}${branchLabel ? `  ${branchLabel}` : ''}`,
    [profile.email ? `Email: ${profile.email}` : null, profile.website ? `Website: ${profile.website}` : null].filter(Boolean).join('  '),
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

function statusLabel(status: string) {
  const normalized = status.trim().toLowerCase()
  if (normalized.includes('cancel')) return 'ยกเลิก'
  if (normalized.includes('short')) return 'ปิดรับไม่ครบ'
  if (normalized.includes('partial')) return 'รับบางส่วน'
  if (normalized.includes('received')) return 'รับครบ'
  return 'ยังไม่รับ'
}

function itemAmount(item: PoBuyPrintItem) {
  return item.qty * item.unitPrice
}

type PoBuyPrintPage = {
  capacity: number
  items: PoBuyPrintItem[]
  startIndex: number
}

function itemRows(items: PoBuyPrintItem[], startIndex: number) {
  return items.map((item, index) => {
    const unit = item.unit?.trim() || ''
    return `
      <tr class="item-row">
        <td class="center rank-cell">${startIndex + index + 1}</td>
        <td>
          <div class="item-name">${escapeHtml(item.productName || '-')}</div>
          <div class="muted">${escapeHtml(item.productId || '-')}</div>
        </td>
        <td class="num strong">${money(item.qty)}${unit ? ` ${escapeHtml(unit)}` : ''}</td>
        <td class="num">${money(item.unitPrice)}</td>
        <td class="num strong">${money(itemAmount(item))}</td>
        <td class="num">${money(item.remainingQty)}${unit ? ` ${escapeHtml(unit)}` : ''}</td>
      </tr>
    `
  }).join('')
}

function emptyRows(count: number) {
  return Array.from({ length: Math.max(0, count) }, () => (
    '<tr class="empty"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>'
  )).join('')
}

function itemPages(items: PoBuyPrintItem[]) {
  const pages: PoBuyPrintPage[] = []
  let cursor = 0
  const firstPageItems = items.slice(0, FIRST_PAGE_ITEM_ROWS)
  pages.push({ capacity: FIRST_PAGE_ITEM_ROWS, items: firstPageItems, startIndex: 0 })
  cursor = firstPageItems.length

  while (cursor < items.length) {
    const pageItems = items.slice(cursor, cursor + CONTINUATION_PAGE_ITEM_ROWS)
    pages.push({ capacity: CONTINUATION_PAGE_ITEM_ROWS, items: pageItems, startIndex: cursor })
    cursor += pageItems.length
  }

  return pages
}

function qtySummaryByUnit(items: PoBuyPrintItem[], key: 'qty' | 'remainingQty') {
  const byUnit = new Map<string, number>()
  items.forEach((item) => {
    const unit = item.unit?.trim() || 'หน่วย'
    byUnit.set(unit, (byUnit.get(unit) ?? 0) + (item[key] ?? 0))
  })
  return Array.from(byUnit.entries()).map(([unit, qty]) => `${money(qty)} ${unit}`).join(' / ') || '-'
}

export function buildPoBuyPrintHtml(po: PoBuyPrintDocument, profile: CompanyProfilePrintValues) {
  const vatAmount = po.vatAmount ?? 0
  const vatRate = po.vatRatePercent ?? 7
  const subtotal = po.totalAmount - vatAmount

  const logoHtml = profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo no-logo">ไม่มีข้อมูล</div>'
  const title = 'ใบสั่งซื้อ / PO Buy'
  const cancelled = po.status.trim().toLowerCase().includes('cancel')
  const totalQtyText = qtySummaryByUnit(po.items, 'qty')
  const pages = itemPages(po.items)
  const pageCount = pages.length
  const companyHeader = (pageNo: number) => `
      <div class="watermark">${escapeHtml(statusLabel(po.status))}</div>
      <div class="accent"></div>
      <section class="header">
        <div class="company">
          ${logoHtml}
          <div>
            <div class="company-name">${escapeHtml(missing(profile.name))}</div>
            ${profile.nameEn ? `<div class="company-en">${escapeHtml(profile.nameEn)}</div>` : ''}
            <div class="company-info">${companyInfo(profile, po)}</div>
          </div>
        </div>
        <div class="doc-head">
          <div class="doc-title">${escapeHtml(title)}</div>
          <div class="doc-grid">
            <div class="kv"><div class="label">เลขที่เอกสาร</div><div class="value">${escapeHtml(po.docNo)}</div></div>
            <div class="kv"><div class="label">หน้า</div><div class="value">${pageNo} / ${pageCount}</div></div>
          </div>
        </div>
      </section>
  `
  const documentInfo = `
      <section class="section-grid">
        <div class="panel">
          <div class="panel-title">ข้อมูลผู้ขาย / Supplier</div>
          <div class="panel-body two-col">
            <div style="grid-column:1 / -1"><div class="field-label">ชื่อผู้ขาย</div><div class="field-value">${escapeHtml(po.supplierName)}</div></div>
            <div><div class="field-label">รหัสผู้ขาย</div><div class="field-value">${escapeHtml(plain(po.supplierId))}</div></div>
            <div style="grid-column:1 / -1"><div class="field-label">ที่อยู่ผู้ขาย</div><div class="field-value">${escapeHtml(plain(po.supplierAddress))}</div></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">ข้อมูลเอกสาร / Document Info</div>
          <div class="panel-body two-col">
            <div><div class="field-label">วันที่เอกสาร</div><div class="field-value">${escapeHtml(dateDisplay(po.date))}</div></div>
            <div><div class="field-label">วันที่กำหนดส่ง</div><div class="field-value">${escapeHtml(dateDisplay(po.expectedDelivery))}</div></div>
            <div><div class="field-label">ผู้จัดทำ</div><div class="field-value">${escapeHtml(plain(po.createdBy))}</div></div>
            <div><div class="field-label">สร้างเมื่อ</div><div class="field-value">${escapeHtml(dateTimeDisplay(po.createdAt))}</div></div>
          </div>
        </div>
      </section>
  `
  const finalSummary = `
      <div class="summary-cards">
        <div class="summary-card"><div class="label">จำนวนสั่งซื้อรวม</div><div class="value">${escapeHtml(totalQtyText)}</div></div>
        <div class="summary-card"><div class="label">จำนวนรายการ</div><div class="value">${escapeHtml(String(po.items.length))} รายการ</div></div>
      </div>

      <section class="bottom-grid">
        <div class="panel">
          <div class="panel-title">หมายเหตุ</div>
          <div class="panel-body">
            <div class="note">${escapeHtml(plain(po.notes))}</div>
            ${po.shortClosedNote ? `<div class="note" style="margin-top:8px;color:#9f1239"><strong>เหตุผลปิดรับไม่ครบ:</strong><br>${escapeHtml(po.shortClosedNote)}</div>` : ''}
          </div>
        </div>
        <div class="totals">
          <div class="total-row"><div>ยอดรวมสินค้าก่อนภาษี / Subtotal</div><div class="num">${money(subtotal)}</div></div>
          <div class="total-row"><div>ภาษีมูลค่าเพิ่ม / VAT (${vatRate}%)</div><div class="num">${money(vatAmount)}</div></div>
          <div class="total-row remaining"><div>มูลค่าคงเหลือ / Remaining</div><div class="num">${money(po.remainingAmount)}</div></div>
          <div class="total-row"><div>มูลค่าที่รับแล้ว / Received</div><div class="num">${money(Math.max(0, po.totalAmount - po.remainingAmount))}</div></div>
          <div class="total-row final"><div>ยอดรวมทั้งสิ้น / Grand Total</div><div class="num">${money(po.totalAmount)}</div></div>
        </div>
      </section>

      <section class="signatures">
        <div class="sig"><div class="sig-line">ผู้สั่งซื้อ</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้อนุมัติ</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้ขาย / Supplier</div><div>วันที่ ____ / ____ / ______</div></div>
      </section>
      <div class="footer">${escapeHtml(profile.footerNote || '')}</div>
  `
  const tableHeader = `
        <thead>
          <tr>
            <th class="center rank-cell" style="width:6mm">#</th>
            <th>สินค้า</th>
            <th class="num" style="width:28mm">จำนวน</th>
            <th class="num" style="width:26mm">ราคา/หน่วย</th>
            <th class="num" style="width:30mm">รวม</th>
            <th class="num" style="width:28mm">คงเหลือ</th>
          </tr>
        </thead>
  `
  const pagesHtml = pages.map((page, index) => {
    const isFinalPage = index === pages.length - 1
    const pageNo = index + 1
    return `
    <main class="page${isFinalPage ? ' final-page' : ''}">
      <div class="page-content">
      ${companyHeader(pageNo)}
      ${index === 0 ? documentInfo : '<div class="continuation-label">รายการสินค้าต่อจากหน้าก่อน</div>'}
      <table class="items">
        ${tableHeader}
        <tbody>
          ${itemRows(page.items, page.startIndex)}
          ${emptyRows(page.capacity - page.items.length)}
        </tbody>
      </table>
      ${isFinalPage ? `<div class="final-block">${finalSummary}</div>` : ''}
      </div>
    </main>
    `
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(po.docNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.35; background: #f8fafc; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #15803d; color: white; font: inherit; cursor: pointer; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; min-height: 277mm; margin: 14px auto; padding: 7mm; background: white; position: relative; box-shadow: 0 18px 40px rgba(15,23,42,.12); break-after: page; page-break-after: always; }
      .page:last-child { break-after: auto; page-break-after: auto; }
      .page-content { min-height: calc(277mm - 14mm); display: flex; flex-direction: column; }
      .final-block { margin-top: auto; }
      .accent { height: 4px; background: linear-gradient(90deg, #166534, #65a30d, #cbd5e1); border-radius: 99px; margin-bottom: 12px; }
      .header { display: grid; grid-template-columns: 1fr .9fr; gap: 12px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
      .company { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: start; min-width: 0; }
      .logo { width: 64px; height: 64px; object-fit: contain; }
      .no-logo { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 12px; font-weight: 800; text-align: center; }
      .company-name { font-size: 16px; font-weight: 800; color: #0f172a; }
      .company-en { font-size: 12px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 4px; color: #475569; font-size: 12px; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 22px; font-weight: 900; color: #14532d; letter-spacing: 0; }
      .doc-grid { margin-top: 8px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; text-align: left; }
      .kv { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 7px; background: #f8fafc; }
      .kv .label { color: #64748b; font-size: 12px; }
      .kv .value { font-weight: 800; color: #0f172a; margin-top: 1px; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
      .continuation-label { margin-top: 10px; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 6px 8px; color: #64748b; font-size: 12px; font-weight: 800; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 6px 9px; background: #f1f5f9; color: #334155; font-weight: 900; }
      .panel-body { padding: 8px 9px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; }
      .field-label { color: #64748b; font-size: 12px; }
      .field-value { font-weight: 750; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; }
      .items { margin-top: 12px; font-size: 12px; break-inside: auto; page-break-inside: auto; table-layout: fixed; }
      .items thead { display: table-header-group; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 6px 5px; text-align: left; font-weight: 900; }
      .items td { border: 1px solid #dbe3ea; padding: 6px 5px; vertical-align: top; }
      .items tr { break-inside: avoid; page-break-inside: avoid; }
      .items .empty td { height: 23px; color: transparent; }
      .item-name { font-weight: 850; color: #0f172a; }
      .muted { color: #64748b; font-size: 12px; margin-top: 1px; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .center { text-align: center; }
      .rank-cell { padding-left: 2px !important; padding-right: 2px !important; }
      .strong { font-weight: 900; }
      .summary-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
      .summary-card { border: 1px solid #dbe3ea; border-radius: 8px; padding: 7px; background: #f8fafc; }
      .summary-card .label { color: #64748b; font-size: 12px; }
      .summary-card .value { font-size: 12px; font-weight: 900; color: #0f172a; margin-top: 2px; }
      .bottom-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
      .note { min-height: 42px; color: #334155; white-space: pre-wrap; }
      .totals { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .total-row { display: grid; grid-template-columns: minmax(0, 1fr) 32mm; gap: 8px; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
      .total-row:last-child { border-bottom: 0; }
      .total-row.final { background: #14532d; color: white; font-size: 13px; font-weight: 900; }
      .total-row.remaining { color: #b45309; }
      .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 20px; break-inside: avoid; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 5px; margin-top: 28px; font-weight: 800; color: #1e293b; }
      .footer { margin-top: 8px; text-align: center; color: #64748b; font-size: 12px; }
      .watermark { display: ${cancelled ? 'block' : 'none'}; position: absolute; top: 72mm; left: 54mm; transform: rotate(-18deg); color: rgba(100,116,139,.14); font-size: 54px; font-weight: 900; pointer-events: none; }
      @media print {
        @page { size: A4 portrait; margin: 8mm; }
        body { background: white; font-size: 12px; line-height: 1.2; }
        .toolbar { display: none; }
        .page { width: auto; min-height: 281mm; margin: 0; padding: 0; box-shadow: none; break-after: page; page-break-after: always; }
        .page:last-child { break-after: auto; page-break-after: auto; }
        .page-content { min-height: 281mm; }
        .accent { margin-bottom: 7px; }
        .header { gap: 10px; padding-bottom: 7px; }
        .company { grid-template-columns: 48px 1fr; gap: 8px; }
        .logo { width: 48px; height: 48px; }
        .company-name { font-size: 14px; }
        .company-info { font-size: 12px; line-height: 1.25; margin-top: 2px; }
        .doc-title { font-size: 19px; }
        .doc-grid { gap: 3px 6px; margin-top: 5px; }
        .kv { padding: 3px 5px; }
        .section-grid { gap: 8px; margin-top: 7px; }
        .panel-title { padding: 4px 7px; }
        .panel-body { padding: 5px 7px; }
        .two-col { gap: 4px 8px; }
        .header, .section-grid { break-inside: avoid; page-break-inside: avoid; }
        .continuation-label { margin-top: 7px; padding: 4px 6px; font-size: 12px; }
        .items { font-size: 12px; margin-top: 7px; page-break-before: auto; }
        .items th { padding: 3px; }
        .items td { padding: 3px; }
        .muted { font-size: 12px; }
        .summary-cards { gap: 6px; margin-top: 6px; }
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
      <span style="font-size: 12px;color:#cbd5e1">A4 portrait corporate print</span>
    </div>
    ${pagesHtml}
  </body></html>`
}

function writeLoading(printWindow: Window) {
  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมใบพิมพ์ PO Buy...</body></html>`)
  printWindow.document.close()
}

export function openPoBuyPrintWindow() {
  const printWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  writeLoading(printWindow)
  printWindow.focus()
  return printWindow
}

export async function openPoBuyPrint(po: PoBuyPrintDocument, targetWindow?: Window) {
  const printWindow = targetWindow ?? openPoBuyPrintWindow()
  const query = po.branchId ? `?branchId=${encodeURIComponent(po.branchId)}` : ''
  const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = companyProfileForPrint(payload)
  printWindow.document.open()
  printWindow.document.write(buildPoBuyPrintHtml(po, profile))
  printWindow.document.close()
  printWindow.focus()
}
