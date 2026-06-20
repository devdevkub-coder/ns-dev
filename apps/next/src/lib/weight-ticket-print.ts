import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'
import { displayWeightTicketStatus, type WeightTicketRecord } from '@/lib/weight-tickets'

const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

const FIRST_PAGE_ITEM_ROWS = 12
const CONTINUATION_PAGE_ITEM_ROWS = 17

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatPrintableNumber(value: number) {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPrintableWeight(value: number) {
  if (value % 1 === 0) {
    return value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function missing(value: string | null | undefined) {
  return value?.trim() || 'ไม่มีข้อมูล'
}

export function buildReceiptPrintHtml(ticket: WeightTicketRecord, profile: CompanyProfilePrintValues) {
  const isReceipt = ticket.type === 'WTI'
  const docTitle = isReceipt ? 'ใบชั่งน้ำหนัก/ใบรับสินค้า' : 'ใบชั่งน้ำหนัก/ใบส่งของ'
  const partyLabel = isReceipt ? 'ผู้ขาย/ผู้ส่งของ' : 'ลูกค้า/ผู้รับสินค้า'
  const signatureLeft = isReceipt ? 'ผู้ส่งสินค้า' : 'ผู้ส่งของ'
  const signatureMiddle = isReceipt ? 'ผู้รับเข้าคลัง' : 'ผู้รับของ'
  const branchLabel = ticket.branchName?.trim() ? `สาขา ${ticket.branchName.trim()}` : ''
  const companyInfo = `
    ${escapeHtml(missing(profile.address))}<br>
    โทร ${escapeHtml(missing(profile.phone))} ${profile.fax ? ` · แฟกซ์ ${escapeHtml(profile.fax)}` : ''}<br>
    เลขประจำตัวผู้เสียภาษี: ${escapeHtml(missing(profile.taxId))}${branchLabel ? ` · ${escapeHtml(branchLabel)}` : ''}
    ${profile.email ? `<br>Email: ${escapeHtml(profile.email)}` : ''}
    ${profile.website ? `<br>Website: ${escapeHtml(profile.website)}` : ''}
  `

  const vehicleImageBlocks = ticket.vehicleImageNames
    .map((name) => {
      const match = /^([^|]+)\|(data:image\/[^|]+)$/.exec(name)
      if (!match) return null
      return `<div style="border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;page-break-inside:avoid"><img src="${escapeHtml(match[2])}" style="width:100%;height:auto;display:block;max-height:8cm;object-fit:cover"><div style="padding:4px 8px;background:#f1f5f9;font-size:10px;color:#475569">${escapeHtml(match[1])}</div></div>`
    })
    .filter(Boolean)
    .join('')

  // Find parent line for each line (only relevant for WTI where deductions/impurities exist)
  const parentMap = new Map<string, typeof ticket.lines[number]>()
  let currentParent: typeof ticket.lines[number] | null = null
  ticket.lines.forEach((line) => {
    if (line.grossWeightValue > 0) {
      currentParent = line
    } else if (line.grossWeightValue === 0 && line.impurityId && currentParent) {
      parentMap.set(line.id, currentParent)
    }
  })

  function rowHtml(line: WeightTicketRecord['lines'][number], index: number) {
    const parent = parentMap.get(line.id)
    if (isReceipt && parent) {
      const netWeight = parent.grossWeightValue - parent.containerDeductionWeightValue - line.deductionWeight
      return `
        <tr class="item-row">
          <td class="c rank-cell"></td>
          <td>
            <div class="item-name">${escapeHtml(line.productName)}</div>
            <div class="muted">${escapeHtml(line.impurityName || 'หักสิ่งเจือปน')}</div>
            <div class="muted">${escapeHtml(line.note || '-')}</div>
          </td>
          <td class="r">${formatPrintableWeight(parent.grossWeightValue)}</td>
          <td class="r">- ${formatPrintableWeight(parent.containerDeductionWeightValue)}</td>
          <td class="r">- ${formatPrintableWeight(line.deductionWeight)}</td>
          <td class="r strong">= ${formatPrintableWeight(netWeight)}</td>
        </tr>
      `
    }

    return `
      <tr class="item-row">
        <td class="c rank-cell">${index + 1}</td>
        <td>
          <div class="item-name">${escapeHtml(line.productName)}</div>
          <div class="muted">${escapeHtml(line.note || '-')}</div>
        </td>
        <td class="r">${formatPrintableNumber(line.grossWeightValue)}</td>
        ${isReceipt ? `
        <td class="r">${formatPrintableNumber(line.containerDeductionWeightValue)}</td>
        <td class="r">${escapeHtml(line.impurityName || '-')}</td>
        ` : ''}
        <td class="r strong">${formatPrintableNumber(line.netWeight)}</td>
      </tr>
    `
  }

  function emptyRows(count: number) {
    const tds = isReceipt
      ? '<td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td>'
      : '<td>&nbsp;</td><td></td><td></td><td></td>'
    return Array.from({ length: Math.max(0, count) }, () => (
      `<tr class="empty">${tds}</tr>`
    )).join('')
  }

  const pages: Array<{ capacity: number; items: WeightTicketRecord['lines']; startIndex: number }> = []
  let cursor = 0
  while (cursor < ticket.lines.length || pages.length === 0) {
    const capacity = pages.length === 0 ? FIRST_PAGE_ITEM_ROWS : CONTINUATION_PAGE_ITEM_ROWS
    pages.push({
      capacity,
      items: ticket.lines.slice(cursor, cursor + capacity),
      startIndex: cursor,
    })
    cursor += capacity
  }

  const totalPages = pages.length
  const pageHtml = pages.map((page, pageIndex) => {
    const isLastPage = pageIndex === totalPages - 1
    const rows = page.items.map((line, index) => rowHtml(line, page.startIndex + index)).join('')
    const fillerRows = emptyRows(page.capacity - page.items.length)

    return `
      <main class="page">
        <div class="accent"></div>
        <section class="header">
          <div class="company">
            ${profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo-placeholder">ไม่มีข้อมูล</div>'}
            <div>
              <div class="company-name">${escapeHtml(missing(profile.name))}</div>
              ${profile.nameEn ? `<div class="company-en">${escapeHtml(profile.nameEn)}</div>` : ''}
              <div class="company-info">${companyInfo}</div>
            </div>
          </div>
          <div class="doc-head">
            <div class="doc-title">${escapeHtml(docTitle)}</div>
          </div>
        </section>

        <section class="section-grid">
          <div class="panel">
            <div class="panel-title">${escapeHtml(partyLabel)}</div>
            <div class="panel-body two-col">
              <div><div class="field-label">ชื่อ</div><div class="field-value">${escapeHtml(ticket.partyName || '-')}</div></div>
              <div><div class="field-label">ทะเบียนรถ</div><div class="field-value">${escapeHtml(ticket.vehicleNo || '-')}</div></div>
              <div><div class="field-label">สาขา</div><div class="field-value">${escapeHtml(ticket.branchName || '-')}</div></div>
              <div><div class="field-label">โกดัง</div><div class="field-value">${escapeHtml(ticket.warehouseName || '-')}</div></div>
              <div><div class="field-label">พนักงานชั่ง</div><div class="field-value">${escapeHtml(ticket.enteredBy || '-')}</div></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-title">ข้อมูลเอกสาร / Document Info</div>
            <div class="panel-body two-col">
              <div><div class="field-label">เลขที่เอกสาร</div><div class="field-value">${escapeHtml(ticket.documentNo)}</div></div>
              <div><div class="field-label">วันที่เอกสาร</div><div class="field-value">${escapeHtml(ticket.documentDate || '-')}</div></div>
              <div><div class="field-label">เวลาสร้าง</div><div class="field-value">${escapeHtml(formatDateTime(ticket.createdAt))}</div></div>
              <div><div class="field-label">สถานะ</div><div class="field-value">${escapeHtml(displayWeightTicketStatus(ticket.type, ticket.status))}</div></div>
            </div>
          </div>
        </section>

        <table class="items">
          <thead>
            <tr>
              <th class="c rank-cell" style="width:7mm">#</th>
              <th>รายการสินค้า</th>
              <th class="r" style="width:24mm">รวม (kg)</th>
              ${isReceipt ? `
              <th class="r" style="width:25mm">หักภาชนะ</th>
              <th class="r" style="width:34mm">หักสิ่งเจือปน</th>
              ` : ''}
              <th class="r" style="width:24mm">สุทธิ</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            ${fillerRows}
          </tbody>
          ${isLastPage ? `
            <tfoot>
              <tr>
                <td colspan="2" class="r">รวมทั้งสิ้น</td>
                <td class="r">${formatPrintableNumber(ticket.totals.grossWeight)}</td>
                ${isReceipt ? `
                <td class="r">${formatPrintableNumber(ticket.totals.containerDeductionWeight)} kg</td>
                <td class="r">${formatPrintableNumber(ticket.totals.deductionWeight)} kg</td>
                ` : ''}
                <td class="r final-weight">${formatPrintableNumber(ticket.totals.netWeight)}</td>
              </tr>
            </tfoot>
          ` : ''}
        </table>

        ${isLastPage ? `
          <section class="bottom-grid">
            <div class="panel">
              <div class="panel-title">หมายเหตุ</div>
              <div class="panel-body"><div class="note">${escapeHtml(ticket.remark || '-')}</div></div>
            </div>
            <div class="panel">
              <div class="panel-title">ข้อมูลน้ำหนัก / Weight Info</div>
              <div class="panel-body two-col">
                <div><div class="field-label">จำนวนรายการ</div><div class="field-value">${ticket.lines.length.toLocaleString('th-TH')} รายการ</div></div>
                <div><div class="field-label">น้ำหนักรวม</div><div class="field-value">${formatPrintableNumber(ticket.totals.grossWeight)} kg</div></div>
                <div><div class="field-label">หักภาชนะ</div><div class="field-value">${formatPrintableNumber(ticket.totals.containerDeductionWeight)} kg</div></div>
                <div><div class="field-label">หักสิ่งเจือปน</div><div class="field-value">${formatPrintableNumber(ticket.totals.deductionWeight)} kg</div></div>
                <div><div class="field-label">น้ำหนักสุทธิ</div><div class="field-value strong">${formatPrintableNumber(ticket.totals.netWeight)} kg</div></div>
              </div>
            </div>
          </section>

          ${vehicleImageBlocks ? `<section class="photos"><div class="panel-title">รูปรถ${isReceipt ? 'ส่งของ' : 'ขนส่ง'}</div><div class="photos-grid">${vehicleImageBlocks}</div></section>` : ''}

          <section class="signatures">
            <div class="sig"><div class="sig-line">${escapeHtml(signatureLeft)}</div><div>วันที่ ____ / ____ / ______</div></div>
            <div class="sig"><div class="sig-line">พนักงานชั่ง</div><div>${escapeHtml(ticket.enteredBy || '-')}</div></div>
            <div class="sig"><div class="sig-line">${escapeHtml(signatureMiddle)}</div><div>วันที่ ____ / ____ / ______</div></div>
            <div class="sig"><div class="sig-line">ผู้อนุมัติ</div><div>วันที่ ____ / ____ / ______</div></div>
          </section>
        ` : '<div class="continued">ต่อหน้าถัดไป</div>'}

        <footer class="footer">
          <span>${escapeHtml(profile.footerNote || '')}</span>
          <span>หน้า ${pageIndex + 1} / ${totalPages}</span>
        </footer>
      </main>
    `
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(docTitle)} ${escapeHtml(ticket.documentNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 11px; line-height: 1.35; background: #f8fafc; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #15803d; color: white; font: inherit; cursor: pointer; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 7mm; background: white; position: relative; display: flex; flex-direction: column; break-after: page; page-break-after: always; }
      .page:last-child { break-after: auto; page-break-after: auto; }
      .accent { height: 4px; background: linear-gradient(90deg, #166534, #65a30d, #cbd5e1); border-radius: 99px; margin-bottom: 12px; flex: 0 0 auto; }
      .header { display: grid; grid-template-columns: 1fr .9fr; gap: 12px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; flex: 0 0 auto; }
      .company { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: start; min-width: 0; }
      .logo, .logo-placeholder { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; }
      .logo-placeholder { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; background: #f8fafc; color: #64748b; font-size: 9px; font-weight: 800; text-align: center; }
      .company-name { font-size: 16px; font-weight: 800; color: #0f172a; }
      .company-en { font-size: 10px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 4px; color: #475569; font-size: 10px; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 22px; font-weight: 900; color: #14532d; letter-spacing: 0; }
      .doc-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; text-align: left; }
      .kv { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 7px; background: #f8fafc; }
      .kv .label, .field-label, .summary-card .label { color: #64748b; font-size: 9px; }
      .kv .value, .field-value { font-weight: 800; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; flex: 0 0 auto; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 6px 9px; background: #f1f5f9; color: #334155; font-weight: 900; }
      .panel-body { padding: 8px 9px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; }
      table { width: 100%; border-collapse: collapse; }
      .items { margin-top: 12px; font-size: 9px; table-layout: fixed; flex: 0 0 auto; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 6px 5px; text-align: left; font-weight: 900; }
      .items td { border: 1px solid #dbe3ea; padding: 6px 5px; vertical-align: top; }
      .items .empty td { height: 24px; color: transparent; }
      .item-name { font-weight: 850; color: #0f172a; }
      .muted { color: #64748b; font-size: 9px; margin-top: 1px; }
      .rank-cell { padding-left: 2px !important; padding-right: 2px !important; }
      .final-weight { color: #059669; font-size: 12px; font-weight: 900; }
      .r { text-align: right; }
      .c { text-align: center; }
      .strong { font-weight: 900; }
      .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
      .note { min-height: 42px; color: #334155; white-space: pre-wrap; }
      .summary-cards { display: grid; gap: 8px; }
      .summary-card { border: 1px solid #dbe3ea; border-radius: 8px; padding: 7px; background: #f8fafc; }
      .summary-card .value { font-size: 12px; font-weight: 900; color: #0f172a; margin-top: 2px; }
      .photos { margin-top: 12px; break-inside: avoid; page-break-inside: avoid; }
      .photos-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 8px; border: 1px solid #cbd5e1; border-top: 0; border-radius: 0 0 8px 8px; }
      .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 16px; break-inside: avoid; page-break-inside: avoid; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 5px; margin-top: 24px; font-weight: 800; color: #1e293b; }
      .continued { margin-top: auto; padding-top: 12px; text-align: right; color: #64748b; font-weight: 800; }
      .footer { margin-top: auto; padding-top: 8px; display: flex; justify-content: space-between; gap: 12px; border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 9px; flex: 0 0 auto; }
      @media print {
        @page { size: A4 portrait; margin: 8mm; }
        body { background: white; font-size: 9.5px; line-height: 1.2; }
        .toolbar { display: none; }
        .page { width: auto; min-height: 281mm; margin: 0; padding: 0; box-shadow: none; break-after: page; page-break-after: always; }
        .page:last-child { break-after: auto; page-break-after: auto; }
        .accent { margin-bottom: 7px; }
        .header { gap: 10px; padding-bottom: 7px; }
        .company { grid-template-columns: 48px 1fr; gap: 8px; }
        .logo, .logo-placeholder { width: 48px; height: 48px; }
        .company-name { font-size: 14px; }
        .company-info { font-size: 9px; line-height: 1.25; margin-top: 2px; }
        .doc-title { font-size: 19px; }
        .doc-grid { gap: 6px 8px; }
        .kv { padding: 3px 5px; }
        .section-grid { gap: 8px; margin-top: 7px; }
        .panel-title { padding: 4px 7px; }
        .panel-body { padding: 5px 7px; }
        .two-col { gap: 4px 8px; }
        .items { font-size: 8px; margin-top: 7px; }
        .items th, .items td { padding: 3px; }
        .items .empty td { height: 18px; }
        .muted { font-size: 8px; }
        .bottom-grid { gap: 8px; margin-top: 7px; }
        .note { min-height: 24px; }
        .summary-card { padding: 5px; }
        .summary-card .value { font-size: 10px; }
        .signatures { gap: 14px; margin-top: 10px; }
        .sig-line { margin-top: 16px; padding-top: 3px; }
        .footer { padding-top: 4px; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิด</button>
      <span style="font-size:11px;color:#cbd5e1">A4 portrait multi-page print</span>
    </div>
    ${pageHtml}
  </body></html>`
}

function writeLoading(printWindow: Window, ticket: WeightTicketRecord) {
  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมใบพิมพ์${ticket.type === 'WTI' ? 'ใบรับสินค้า' : 'ใบส่งของ'}...</body></html>`)
  printWindow.document.close()
}

export function openWeightTicketPrintWindow(ticket: WeightTicketRecord) {
  const printWindow = window.open('', '_blank', 'width=1024,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  writeLoading(printWindow, ticket)
  printWindow.focus()
  return printWindow
}

export async function openWeightTicketReceiptPrint(ticket: WeightTicketRecord, targetWindow?: Window) {
  const printWindow = targetWindow ?? openWeightTicketPrintWindow(ticket)
  const query = ticket.branchId ? `?branchId=${encodeURIComponent(ticket.branchId)}` : ''
  const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = companyProfileForPrint(payload)
  printWindow.document.open()
  printWindow.document.write(buildReceiptPrintHtml(ticket, profile))
  printWindow.document.close()
  printWindow.focus()
}
