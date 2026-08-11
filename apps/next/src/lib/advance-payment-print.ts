import { companyProfileForPrint, type CompanyProfilePrintValues } from '@/lib/company-profile'
import { prepareCorporatePrintLayout } from '@/lib/corporate-print-layout'
import { fetchCompanyProfileForPrint } from '@/lib/print-asset-prefetch'
import { paginateStandardPrintItems } from '@/lib/print-pagination'

export type AdvancePaymentPrintAllocation = {
  allocatedAmount: number
  allocatedAt: string
  allocatedBy: string
  id: string
  purchaseBillDocNo: string
}

export type AdvancePaymentPrintDocument = {
  id: string
  docNo: string
  advanceDate: string
  amount: number
  advanceTypeLabel?: string | null
  allocatedAmount: number
  remainingAmount: number
  branchId: string
  branchName?: string | null
  supplierName?: string | null
  customerName?: string | null
  invoiceNo?: string | null
  plateNo?: string | null
  productName?: string | null
  netWeight?: number | null
  pricePerKg?: number | null
  paymentMethod?: string | null
  accountName?: string | null
  remark?: string | null
  subtotalAmount?: number | null
  totalAmount?: number | null
  vatAmount?: number | null
  vatRatePercent?: number | null
  vatTypeLabel?: string | null
  createdBy: string
  createdAt: string
  allocations?: AdvancePaymentPrintAllocation[]
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

function missing(value: string | null | undefined) {
  return value?.trim() || 'ไม่มีข้อมูล'
}

function companyInfo(profile: CompanyProfilePrintValues, doc: AdvancePaymentPrintDocument) {
  const branchLabel = doc.branchName?.trim() ? `สาขา ${doc.branchName.trim()}` : ''
  return [
    missing(profile.address),
    `โทร ${missing(profile.phone)}${profile.fax ? `  แฟกซ์ ${profile.fax}` : ''}`,
    `เลขประจำตัวผู้เสียภาษี ${missing(profile.taxId)}${branchLabel ? `  ${branchLabel}` : ''}`,
    [profile.email ? `Email: ${profile.email}` : null, profile.website ? `Website: ${profile.website}` : null].filter(Boolean).join('  '),
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

function allocationRows(allocations: AdvancePaymentPrintAllocation[], startIndex: number) {
  return allocations.map((allocation, index) => `
    <tr class="item-row" data-row-slot="${startIndex + index + 1}">
      <td class="center">${startIndex + index + 1}</td>
      <td>หักล้างกับบิลซื้อ ${escapeHtml(allocation.purchaseBillDocNo)}</td>
      <td class="num">${money(allocation.allocatedAmount)}</td>
      <td class="center">${escapeHtml(dateDisplay(allocation.allocatedAt))}</td>
    </tr>
  `).join('')
}

function emptyRows(count: number) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => (
    `<tr class="empty" data-row-slot="empty-${index + 1}"><td>&nbsp;</td><td></td><td></td><td></td></tr>`
  )).join('')
}

export function buildAdvancePaymentPrintHtml(doc: AdvancePaymentPrintDocument, profile: CompanyProfilePrintValues) {
  const cancelled = doc.remark?.includes('ยกเลิก') ?? false
  const title = 'ใบสำคัญการจ่ายเงินล่วงหน้า / มัดจำ'
  const partyLabel = doc.customerName ? 'ลูกค้า / Customer' : 'ผู้ขาย / Supplier'
  const partyName = doc.customerName || doc.supplierName || '-'
  const pages = paginateStandardPrintItems(doc.allocations ?? [])
  const logoHtml = profile.logoUrl
    ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">`
    : '<div class="logo no-logo">ไม่มีข้อมูล</div>'

  const pagesHtml = pages.map((page) => {
    return `
      <main class="page${page.pageNo > 1 ? ' page-break-before' : ''}" data-print-page="${page.pageNo}" data-final-page="${page.isFinalPage}">
        <div class="page-content">
          <div class="watermark">ยกเลิก / CANCELLED</div>
          <div class="accent"></div>
          <section class="header">
            <div class="company">
              ${logoHtml}
              <div>
                <div class="company-name">${escapeHtml(missing(profile.name).replace(/\s+/g, ' ').trim())}</div>
                ${profile.nameEn ? `<div class="company-en">${escapeHtml(profile.nameEn.replace(/\s+/g, ' ').trim())}</div>` : ''}
                <div class="company-info">${companyInfo(profile, doc)}</div>
              </div>
            </div>
            <div class="doc-head">
              <div class="doc-title">${escapeHtml(title)}</div>
              <div class="page-label">หน้า ${page.pageNo} / ${page.totalPages}</div>
              <div class="doc-grid">
                <div class="kv"><div class="label">เลขที่เอกสาร</div><div class="value">${escapeHtml(doc.docNo)}</div></div>
                <div class="kv"><div class="label">วันที่ทำมัดจำ</div><div class="value">${escapeHtml(dateDisplay(doc.advanceDate))}</div></div>
                <div class="kv"><div class="label">ประเภท ADV</div><div class="value">${escapeHtml(plain(doc.advanceTypeLabel))}</div></div>
                <div class="kv"><div class="label">Invoice</div><div class="value">${escapeHtml(plain(doc.invoiceNo))}</div></div>
              </div>
            </div>
          </section>

          <section class="section-grid">
            <div class="panel">
              <div class="panel-title">ข้อมูล ${partyLabel}</div>
              <div class="panel-body two-col">
                <div style="grid-column:1 / -1"><div class="field-label">ชื่อ</div><div class="field-value">${escapeHtml(partyName)}</div></div>
                <div><div class="field-label">ทะเบียนรถ</div><div class="field-value">${escapeHtml(plain(doc.plateNo))}</div></div>
                <div><div class="field-label">สินค้าสั่งจอง</div><div class="field-value">${escapeHtml(plain(doc.productName))}</div></div>
              </div>
            </div>
            <div class="panel">
              <div class="panel-title">ข้อมูลทางการเงิน / Financial Info</div>
              <div class="panel-body two-col">
                <div><div class="field-label">วิธีการจ่ายเงิน</div><div class="field-value">${escapeHtml(plain(doc.paymentMethod || doc.accountName))}</div></div>
                <div><div class="field-label">คลัง/สาขา</div><div class="field-value">${escapeHtml(plain(doc.branchName))}</div></div>
                <div><div class="field-label">น้ำหนักประมาณการ</div><div class="field-value">${doc.netWeight != null ? `${money(doc.netWeight)} กก.` : '-'}</div></div>
                <div><div class="field-label">ราคา/กก. ประมาณการ</div><div class="field-value">${doc.pricePerKg != null ? `${money(doc.pricePerKg)} บาท` : '-'}</div></div>
              </div>
            </div>
          </section>

          <div class="table-title">ประวัติการหักล้างมัดจำ / Allocation History</div>
          ${(doc.allocations ?? []).length === 0 ? '<div class="allocation-note">ยังไม่มีการนำไปหักล้างกับบิลซื้อ</div>' : ''}
          <table class="items">
            <thead>
              <tr>
                <th class="center" style="width:10mm">#</th>
                <th>รายละเอียดการหักล้าง${page.pageNo > 1 ? ' (ต่อ)' : ''}</th>
                <th class="num" style="width:40mm">ยอดที่หักล้าง (บาท)</th>
                <th class="center" style="width:30mm">วันที่ทำรายการ</th>
              </tr>
            </thead>
            <tbody>
              ${allocationRows(page.items, page.startIndex)}
              ${emptyRows(page.emptyRowCount)}
            </tbody>
            ${page.isFinalPage ? `
            <tfoot data-page-totals="final">
              <tr><td colspan="2" class="num">รวมทั้งสิ้น</td><td class="num final-amount">${money(doc.allocatedAmount)}</td><td></td></tr>
            </tfoot>
            ` : `
            <tfoot class="placeholder-total" data-page-totals="placeholder">
              <tr><td colspan="4">&nbsp;</td></tr>
            </tfoot>
            `}
          </table>

          ${page.isFinalPage ? `
            <section class="bottom-grid">
              <div class="panel">
                <div class="panel-title">หมายเหตุ / Note</div>
                <div class="panel-body note">${escapeHtml(plain(doc.remark))}</div>
              </div>
              <div class="totals">
                <div class="total-row"><div>ยอดก่อน VAT</div><div class="num">${money(doc.subtotalAmount ?? doc.amount)}</div></div>
                <div class="total-row"><div>${escapeHtml(doc.vatTypeLabel || 'VAT')}${doc.vatRatePercent ? ` (${money(doc.vatRatePercent).replace('.00', '')}%)` : ''}</div><div class="num">${money(doc.vatAmount)}</div></div>
                <div class="total-row"><div>ยอดรวมมัดจำ / Total Advance</div><div class="num">${money(doc.totalAmount ?? doc.amount)}</div></div>
                <div class="total-row allocated"><div>เครดิตฐานที่ใช้หักบิลแล้ว</div><div class="num">${money(doc.allocatedAmount)}</div></div>
                <div class="total-row final"><div>เครดิตฐานคงเหลือ</div><div class="num">${money(doc.remainingAmount)}</div></div>
              </div>
            </section>
            <section class="signatures" data-signatures="final">
              <div class="sig"><div class="sig-line">ผู้ขอเบิกเงินล่วงหน้า</div><div>วันที่ ____ / ____ / ______</div></div>
              <div class="sig"><div class="sig-line">ผู้อนุมัติจ่ายเงิน</div><div>วันที่ ____ / ____ / ______</div></div>
              <div class="sig"><div class="sig-line">ผู้จ่ายเงิน (แคชเชียร์)</div><div>วันที่ ____ / ____ / ______</div></div>
            </section>
          ` : `
            <section class="continuation-summary" data-continuation-summary="placeholder" aria-label="พื้นที่สรุปสำหรับหน้าต่อเนื่อง">
              <div class="continuation-summary-panel">
                <div class="continuation-panel-title">สรุปการจัดสรร</div>
                <div class="continuation-placeholder">-</div>
              </div>
              <div class="continuation-summary-panel">
                <div class="continuation-panel-title">หมายเหตุ</div>
                <div class="continuation-placeholder">-</div>
              </div>
            </section>
            <div class="continuation-signature" data-continuation-signature="true">
              ( มีต่อหน้า ${page.pageNo + 1} / Continued on Page ${page.pageNo + 1} ➔ )
            </div>
          `}
          <div class="footer">${escapeHtml(profile.footerNote || '')}</div>
        </div>
      </main>
    `
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(doc.docNo)}</title>
    <style>
      @font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Regular.ttf') format('truetype'); font-style: normal; font-weight: 400; font-display: swap; }
      @font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Bold.ttf') format('truetype'); font-style: normal; font-weight: 700 900; font-display: swap; }
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing: border-box; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.35; background: #334155; padding: 16px 0; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; position: sticky; top: 0; z-index: 50; margin-top: -16px; margin-bottom: 16px; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #1e3a8a; color: white; font: inherit; cursor: pointer; font-weight: 700; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; min-height: 277mm; margin: 0 auto 16px; padding: 7mm; background: white; position: relative; box-shadow: 0 10px 25px -5px rgba(0,0,0,.3), 0 8px 10px -6px rgba(0,0,0,.2); border-radius: 4px; break-after: page; page-break-after: always; }
      .page:last-of-type { break-after: auto; page-break-after: auto; }
      .page-content { height: 263mm; min-height: 263mm; display: flex; flex-direction: column; }
      .page-break-before { break-before: page; page-break-before: always; }
      .accent { height: 4px; background: linear-gradient(90deg, #1e3a8a, #3b82f6, #cbd5e1); border-radius: 99px; margin-bottom: 12px; }
      .header { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
      .company { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: start; min-width: 0; }
      .logo { width: 64px; height: 64px; object-fit: contain; }
      .no-logo { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-weight: 700; text-align: center; }
      .company-name { font-size: 15px; font-weight: 900; color: #0f172a; white-space: nowrap; }
      .company-en { font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 4px; color: #475569; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 20px; font-weight: 900; color: #1e3a8a; }
      .page-label { margin-top: 4px; color: #1e3a8a; font-weight: 700; }
      .doc-grid { margin-top: 7px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; text-align: left; }
      .kv { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 7px; background: #f8fafc; }
      .kv .label, .field-label { color: #64748b; }
      .kv .value, .field-value { font-weight: 700; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 6px 9px; background: #f1f5f9; color: #334155; font-weight: 900; }
      .panel-body { padding: 8px 9px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; }
      .table-title { margin-top: 12px; color: #1e293b; font-weight: 900; }
      .allocation-note { margin-top: 4px; color: #64748b; font-style: italic; }
      table { width: 100%; border-collapse: collapse; }
      .items { margin-top: 5px; table-layout: fixed; }
      .items thead { display: table-header-group; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 6px 5px; text-align: left; font-weight: 900; overflow-wrap: anywhere; word-break: break-word; }
      .items td { border: 1px solid #dbe3ea; padding: 6px 5px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
      .items tr { break-inside: avoid; page-break-inside: avoid; }
      .items .empty td { height: 24px; color: transparent; }
      .items tfoot td { background: #ecfdf5; font-weight: 900; }
      .items tfoot.placeholder-total td { height: 24px; background: #ffffff; color: transparent; }
      .items tfoot .final-amount { color: #1e3a8a; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .center { text-align: center; }
      .bottom-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
      .note { min-height: 42px; color: #334155; white-space: pre-wrap; }
      .placeholder { color: #94a3b8; }
      .continuation-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
      .continuation-summary-panel { min-height: 92px; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; padding: 8px; }
      .continuation-panel-title { font-weight: 900; color: #1e293b; }
      .continuation-placeholder { margin-top: 12px; color: #94a3b8; }
      .continuation-signature { min-height: 74px; margin-top: auto; display: flex; align-items: center; justify-content: center; text-align: center; color: #1e3a8a; font-size: 13px; font-weight: 800; }
      .totals { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .total-row { display: grid; grid-template-columns: minmax(0, 1fr) 35mm; gap: 8px; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
      .total-row:last-child { border-bottom: 0; }
      .total-row.final { background: #1e3a8a; color: white; font-weight: 900; }
      .total-row.allocated { color: #b45309; }
      .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: auto; break-inside: avoid; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 5px; margin-top: 28px; font-weight: 800; color: #1e293b; }
      .continued { padding: 18px 0 6px; text-align: center; color: #1e3a8a; font-weight: 800; }
      .footer { margin-top: 8px; text-align: center; color: #64748b; }
      .watermark { display: ${cancelled ? 'block' : 'none'}; position: absolute; top: 72mm; left: 48mm; transform: rotate(-18deg); color: rgba(100,116,139,.14); font-size: 50px; font-weight: 900; pointer-events: none; }
      @media print {
        body { background: white; padding: 0; font-size: 12px; line-height: 1.2; }
        .toolbar { display: none; }
        .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; border-radius: 0; }
        .page-content { min-height: 281mm; }
        .accent { margin-bottom: 7px; }
        .header { gap: 10px; padding-bottom: 7px; }
        .company { grid-template-columns: 48px 1fr; gap: 8px; }
        .logo { width: 48px; height: 48px; }
        .company-name { font-size: 14px; }
        .company-info { line-height: 1.25; margin-top: 2px; }
        .doc-title { font-size: 18px; }
        .doc-grid { gap: 3px 6px; margin-top: 5px; }
        .kv { padding: 3px 5px; }
        .section-grid { gap: 8px; margin-top: 7px; }
        .panel-title { padding: 4px 7px; }
        .panel-body { padding: 5px 7px; }
        .two-col { gap: 4px 8px; }
        .table-title { margin-top: 7px; }
        .items { margin-top: 4px; }
        .items th, .items td { padding: 3px; }
        .items .empty td { height: 18px; }
        .bottom-grid { gap: 8px; margin-top: 7px; }
        .note { min-height: 24px; }
        .total-row { padding: 3px 6px; }
        .signatures { gap: 18px; margin-top: 10px; }
        .sig-line { margin-top: 18px; padding-top: 3px; }
        .continued { padding: 12px 0 4px; }
        .footer { margin-top: 4px; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิด</button>
      <span style="font-size:12px;color:#cbd5e1">A4 portrait · 15 รายการต่อหน้า</span>
    </div>
    ${pagesHtml}
  </body></html>`
}

export function openAdvancePaymentPrintWindow() {
  const printWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
  if (!printWindow) throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมพิมพ์เอกสารเงินล่วงหน้า/มัดจำ...</body></html>`)
  printWindow.document.close()
  printWindow.focus()
  return printWindow
}

export async function openAdvancePaymentPrint(doc: AdvancePaymentPrintDocument, targetWindow?: Window) {
  const printWindow = targetWindow ?? openAdvancePaymentPrintWindow()
  // Reads from the short-lived in-memory cache warmed on hover when available.
  const payload = await fetchCompanyProfileForPrint(doc.branchId)
  const profile = companyProfileForPrint(payload)
  printWindow.document.open()
  printWindow.document.write(buildAdvancePaymentPrintHtml(doc, profile))
  printWindow.document.close()
  await prepareCorporatePrintLayout(printWindow.document)
  printWindow.focus()
}
