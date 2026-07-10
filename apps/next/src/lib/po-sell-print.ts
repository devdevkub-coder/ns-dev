import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'

const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

const FIRST_PAGE_ITEM_ROWS = 17
const CONTINUATION_PAGE_ITEM_ROWS = 28

export type PoSellPrintItem = {
  discount: number
  note: string | null
  price: number
  productId: string
  productName: string
  qty: number
  remainingQty: number
  totalAmount: number
  unitPrice: number
  unit?: string | null
}

export type PoSellPrintDocument = {
  branchId: string | null
  branchName?: string | null
  createdAt: string
  createdBy: string
  docNo: string
  expectedDelivery: string
  id: string
  items: PoSellPrintItem[]
  note: string | null
  remainingAmount: number
  remainingQty: number
  status: string
  documentStatus: string
  customerId: string | null
  customerName: string
  customerAddress?: string | null
  customerTaxId?: string | null
  customerPhone?: string | null
  totalAmount: number
  channelName?: string | null
  hasVat?: boolean
  vatRatePercent?: number
  vatAmount?: number
  vatType?: string
  subtotal?: number
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

function companyInfo(profile: CompanyProfilePrintValues, po: PoSellPrintDocument) {
  const branchLabel = po.branchName?.trim() ? `สาขา ${po.branchName.trim()}` : ''
  return [
    missing(profile.address),
    `โทร ${missing(profile.phone)}${profile.fax ? `  แฟกซ์ ${profile.fax}` : ''}`,
    `เลขประจำตัวผู้เสียภาษี ${missing(profile.taxId)}${branchLabel ? `  ${branchLabel}` : ''}`,
    [profile.email ? `Email: ${profile.email}` : null, profile.website ? `Website: ${profile.website}` : null].filter(Boolean).join('  '),
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

function totalsByUnit(po: PoSellPrintDocument) {
  const byUnit = new Map<string, { amount: number; qty: number }>()
  po.items.forEach((row) => {
    const unit = row.unit || 'กก.'
    const current = byUnit.get(unit) ?? { amount: 0, qty: 0 }
    current.amount += (row.qty * row.price - row.discount)
    current.qty += row.qty
    byUnit.set(unit, current)
  })
  return Array.from(byUnit.entries()).map(([unit, value]) => ({ ...value, unit }))
}

function itemRows(items: PoSellPrintItem[], pageIndex: number, startIndex: number) {
  return items.map((item, idx) => {
    const totalRowAmount = item.qty * item.price - item.discount
    return `
    <tr class="item-row">
      <td class="center rank-cell">${startIndex + idx + 1}</td>
      <td>${escapeHtml(item.productId)}</td>
      <td>
        <div class="item-name">${escapeHtml(item.productName)}</div>
        ${item.note ? `<div class="muted">${escapeHtml(item.note)}</div>` : ''}
      </td>
      <td class="num strong">${money(item.qty)}</td>
      <td class="center">${escapeHtml(item.unit || 'กก.')}</td>
      <td class="num">${money(item.price)}</td>
      <td class="num">${money(item.discount)}</td>
      <td class="num strong">${money(totalRowAmount)}</td>
    </tr>
  `}).join('')
}

function emptyRows(count: number) {
  return Array.from({ length: Math.max(0, count) }, () => (
    '<tr class="empty"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'
  )).join('')
}

export function buildPoSellPrintHtml(po: PoSellPrintDocument, profile: CompanyProfilePrintValues) {
  const logoHtml = profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo no-logo">ไม่มีข้อมูล</div>'
  const cancelled = ['cancelled', 'canceled'].includes(po.documentStatus.toLowerCase())
  const title = 'ใบสั่งจองขาย / PO SELL'

  // Chunk items into pages
  const pages: PoSellPrintItem[][] = []
  let remainingItems = [...po.items]

  if (remainingItems.length <= FIRST_PAGE_ITEM_ROWS) {
    pages.push(remainingItems)
    remainingItems = []
  } else {
    pages.push(remainingItems.slice(0, FIRST_PAGE_ITEM_ROWS))
    remainingItems = remainingItems.slice(FIRST_PAGE_ITEM_ROWS)
    while (remainingItems.length > 0) {
      pages.push(remainingItems.slice(0, CONTINUATION_PAGE_ITEM_ROWS))
      remainingItems = remainingItems.slice(CONTINUATION_PAGE_ITEM_ROWS)
    }
  }

  const totalPages = pages.length
  const tableQtySummaryText = totalsByUnit(po).map((item) => `${money(item.qty)} ${item.unit}`).join(' / ') || '-'
  const tableSubtotal = po.items.reduce((sum, item) => sum + (item.qty * item.price), 0)
  const tableDiscountTotal = po.items.reduce((sum, item) => sum + item.discount, 0)

  const pagesHtml = pages.map((pageItems, pageIndex) => {
    const isFirstPage = pageIndex === 0
    const isLastPage = pageIndex === totalPages - 1
    const pageNo = pageIndex + 1

    let itemsLimit = isFirstPage ? FIRST_PAGE_ITEM_ROWS : CONTINUATION_PAGE_ITEM_ROWS
    let padCount = itemsLimit - pageItems.length
    if (isLastPage && padCount > 0) {
      // make sure we leave room if it's the last page and needs signatures
      padCount = Math.max(0, padCount)
    }

    const startIndex = isFirstPage ? 0 : FIRST_PAGE_ITEM_ROWS + (pageIndex - 1) * CONTINUATION_PAGE_ITEM_ROWS
    const tableRows = itemRows(pageItems, pageIndex, startIndex) + emptyRows(padCount)
    const tableFooter = isLastPage ? `
            <tfoot>
              <tr>
                <td colspan="3" class="num">รวมทั้งสิ้น</td>
                <td class="num">${escapeHtml(tableQtySummaryText)}</td>
                <td></td>
                <td></td>
                <td class="num">${money(tableDiscountTotal)}</td>
                <td class="num final-amount">${money(tableSubtotal - tableDiscountTotal)}</td>
              </tr>
            </tfoot>
          ` : ''

    let bottomSectionHtml = ''
    if (isLastPage) {
      const qtySummaryText = totalsByUnit(po).map((item) => `${money(item.qty)} ${item.unit}`).join(' / ') || '-'
      const subtotal = po.items.reduce((sum, item) => sum + (item.qty * item.price), 0)
      const totalDiscount = po.items.reduce((sum, item) => sum + item.discount, 0)
      const vatAmount = po.vatAmount ?? 0
      const vatRate = po.vatRatePercent ?? 7

      bottomSectionHtml = `
        <div class="summary-cards">
          <div class="summary-card">
            <div class="label">จำนวนจองรวมทั้งหมด / Total Quantity</div>
            <div class="value">${escapeHtml(qtySummaryText)}</div>
          </div>
          <div class="summary-card">
            <div class="label">จำนวนรายการ</div>
            <div class="value">${escapeHtml(String(po.items.length))} รายการ</div>
          </div>
        </div>

        <div class="bottom-grid">
          <div class="panel">
            <div class="panel-title">หมายเหตุ / Note</div>
            <div class="panel-body note">${escapeHtml(plain(po.note))}</div>
          </div>

          <div class="totals">
            <div class="total-row">
              <div class="total-label">มูลค่าก่อนหักส่วนลด / Subtotal</div>
              <div class="num">${money(subtotal)}</div>
            </div>
            <div class="total-row">
              <div class="total-label">ส่วนลดรวม / Total Discount</div>
              <div class="num">${money(totalDiscount)}</div>
            </div>
            <div class="total-row">
              <div class="total-label">ยอดหลังหักส่วนลด / Net Subtotal</div>
              <div class="num">${money(subtotal - totalDiscount)}</div>
            </div>
            <div class="total-row">
              <div class="total-label">ภาษีมูลค่าเพิ่ม / VAT (${vatRate}%)</div>
              <div class="num">${money(vatAmount)}</div>
            </div>
            <div class="total-row final">
              <div class="total-label">จำนวนเงินสุทธิ / Net Total</div>
              <div class="num">${money(po.totalAmount)}</div>
            </div>
          </div>
        </div>

        <div class="signatures">
          <div class="sig">
            <div>ผู้อนุมัติรายการ / Approved By</div>
            <div class="sig-line">${escapeHtml(po.createdBy || '-')}</div>
            <div style="font-size: 12px;margin-top:2px">${escapeHtml(dateTimeDisplay(po.createdAt))}</div>
          </div>
          <div class="sig">
            <div>ผู้ประสานงานขาย / Sales Coordinator</div>
            <div class="sig-line">&nbsp;</div>
            <div style="font-size: 12px;margin-top:2px">วันที่ ______/______/______</div>
          </div>
          <div class="sig">
            <div>ผู้ยืนยันใบสั่งจอง (ลูกค้า) / Confirmed By (Customer)</div>
            <div class="sig-line">&nbsp;</div>
            <div style="font-size: 12px;margin-top:2px">วันที่ ______/______/______</div>
          </div>
        </div>
      `
    }

    return `
      <div class="page">
        <div class="print-footer">หน้า ${pageNo} / ${totalPages} · เอกสารนี้พิมพ์จากระบบ ERP</div>
        <div class="page-content">
          <div class="accent"></div>
          
          <div class="header">
            <div class="company">
              ${logoHtml}
              <div>
                <div class="company-name">${escapeHtml(profile.name)}</div>
                <div class="company-en">${escapeHtml(profile.nameEn)}</div>
                <div class="company-info">${companyInfo(profile, po)}</div>
              </div>
            </div>
            <div class="doc-head">
              <div class="doc-title">${escapeHtml(title)}</div>
              <div class="doc-grid">
                <div class="kv">
                  <div class="label">เลขที่เอกสาร / Document No.</div>
                  <div class="value font-mono">${escapeHtml(po.docNo)}</div>
                </div>
                <div class="kv">
                  <div class="label">วันที่เอกสาร / Date</div>
                  <div class="value">${escapeHtml(dateDisplay(po.createdAt))}</div>
                </div>
                <div class="kv">
                  <div class="label">กำหนดส่งมอบ / Delivery Date</div>
                  <div class="value">${escapeHtml(dateDisplay(po.expectedDelivery))}</div>
                </div>
                <div class="kv">
                  <div class="label">หน้า / Page</div>
                  <div class="value">${pageNo} / ${totalPages}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="section-grid">
            <div class="panel">
              <div class="panel-title">ข้อมูลลูกค้า / Customer Info</div>
              <div class="panel-body two-col">
                <div>
                  <div class="field-label">ชื่อลูกค้า / Name</div>
                  <div class="field-value">${escapeHtml(po.customerName)}</div>
                </div>
                <div>
                  <div class="field-label">เลขประจำตัวผู้เสียภาษี / Tax ID</div>
                  <div class="field-value">${escapeHtml(plain(po.customerTaxId))}</div>
                </div>
                <div style="grid-column: span 2">
                  <div class="field-label">ที่อยู่ / Address</div>
                  <div class="field-value">${escapeHtml(plain(po.customerAddress))}</div>
                </div>
                <div>
                  <div class="field-label">เบอร์โทรศัพท์ / Phone</div>
                  <div class="field-value">${escapeHtml(plain(po.customerPhone))}</div>
                </div>
              </div>
            </div>

            <div class="panel">
              <div class="panel-title">ข้อมูลธุรกรรม / Transaction Info</div>
              <div class="panel-body two-col">
                <div>
                  <div class="field-label">ช่องทางการขาย / Sales Channel</div>
                  <div class="field-value">${escapeHtml(plain(po.channelName))}</div>
                </div>
                <div>
                  <div class="field-label">สาขาคลังสินค้า / Storage Branch</div>
                  <div class="field-value">${escapeHtml(plain(po.branchName))}</div>
                </div>
                <div>
                  <div class="field-label">สถานะเอกสาร / Document Status</div>
                  <div class="field-value">${escapeHtml(po.documentStatus === 'open' ? 'เปิดอยู่ / Open' : po.documentStatus === 'partial' ? 'ออกบิลบางส่วน / Partial' : po.documentStatus === 'short_closed' ? 'ปิดส่งไม่ครบ / Short Closed' : po.documentStatus === 'closed' ? 'ปิดแล้ว / Closed' : 'ยกเลิก / Cancelled')}</div>
                </div>
                <div>
                  <div class="field-label">ผู้บันทึก / Created By</div>
                  <div class="field-value">${escapeHtml(po.createdBy || '-')}</div>
                </div>
              </div>
            </div>
          </div>

          <table class="items">
            <thead>
              <tr>
                <th class="center rank-cell" style="width: 8mm">ลำดับ</th>
                <th style="width: 25mm">รหัสสินค้า</th>
                <th>รายละเอียดสินค้า</th>
                <th class="num" style="width: 22mm">จำนวน</th>
                <th class="center" style="width: 15mm">หน่วย</th>
                <th class="num" style="width: 20mm">ราคา/หน่วย</th>
                <th class="num" style="width: 18mm">ส่วนลด</th>
                <th class="num" style="width: 24mm">จำนวนเงิน</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
            ${tableFooter}
          </table>

          ${bottomSectionHtml}
        </div>
        <div class="watermark">ยกเลิก / CANCELLED</div>
      </div>
    `
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(po.docNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.35; background: #f8fafc; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #6b21a8; color: white; font: inherit; cursor: pointer; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 7mm; background: white; position: relative; }
      .print-footer { display: none; }
      .accent { height: 4px; background: linear-gradient(90deg, #6b21a8, #a855f7, #cbd5e1); border-radius: 99px; margin-bottom: 12px; }
      .header { display: grid; grid-template-columns: 1fr .9fr; gap: 12px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
      .company { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: start; min-width: 0; }
      .logo { width: 64px; height: 64px; object-fit: contain; }
      .no-logo { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 12px; font-weight: 800; text-align: center; }
      .company-name { font-size: 16px; font-weight: 800; color: #0f172a; }
      .company-en { font-size: 12px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 4px; color: #475569; font-size: 12px; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 22px; font-weight: 900; color: #6b21a8; letter-spacing: 0; }
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
      .items tfoot td { background: #ecfdf5; color: #0f172a; font-weight: 900; }
      .items tfoot .final-amount { color: #6b21a8; }
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
      .total-row { display: grid; grid-template-columns: minmax(0, 1fr) 30mm; gap: 8px; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
      .total-row:last-child { border-bottom: 0; }
      .total-row.final { background: #6b21a8; color: white; font-size: 13px; font-weight: 900; }
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
        .items th { padding: 3px; }
        .items td { padding: 3px; }
        .items .empty td { height: 18px; }
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
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมใบพิมพ์ PO Sell...</body></html>`)
  printWindow.document.close()
}

export function openPoSellPrintWindow() {
  const printWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  writeLoading(printWindow)
  printWindow.focus()
  return printWindow
}

export async function openPoSellPrint(po: PoSellPrintDocument, targetWindow?: Window) {
  const printWindow = targetWindow ?? openPoSellPrintWindow()
  const query = po.branchId ? `?branchId=${encodeURIComponent(po.branchId)}` : ''
  const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = companyProfileForPrint(payload)
  printWindow.document.open()
  printWindow.document.write(buildPoSellPrintHtml(po, profile))
  printWindow.document.close()
  printWindow.focus()
}
