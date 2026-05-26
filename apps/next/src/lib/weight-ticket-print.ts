import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileSchema, emptyCompanyProfile, type CompanyProfileFormValues } from '@/lib/company-profile'
import { displayWeightTicketStatus, type WeightTicketRecord } from '@/lib/weight-tickets'

const companyProfilePayloadSchema = z.object({
  profile: companyProfileSchema,
})

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

export function buildReceiptPrintHtml(ticket: WeightTicketRecord, profile: CompanyProfileFormValues) {
  const isReceipt = ticket.type === 'WTI'
  const docTitle = isReceipt ? 'ใบรับสินค้า' : 'ใบส่งของ'
  const partyLabel = isReceipt ? 'ผู้ขาย/ผู้ส่งของ' : 'ลูกค้า/ผู้รับสินค้า'
  const signatureLeft = isReceipt ? 'ผู้ส่งสินค้า' : 'ผู้ส่งของ'
  const signatureMiddle = isReceipt ? 'ผู้รับเข้าคลัง' : 'ผู้รับของ'
  const rows = ticket.lines.map((line, index) => `
    <tr>
      <td class="c">${index + 1}</td>
      <td>${escapeHtml(line.productName)}<div style="font-size:11px;color:#64748b;font-weight:400;margin-top:2px">${escapeHtml(line.note || '-')}</div></td>
      <td class="r">${formatPrintableNumber(line.grossWeightValue)}</td>
      <td class="r">${escapeHtml(line.impurityName || '-')} ${line.deductionWeight > 0 ? `(${formatPrintableNumber(line.deductionWeight)} kg${line.deductionMode === 'percent' ? ` / ${escapeHtml(line.deductionValue)}%` : ''})` : ''}</td>
      <td class="r">${formatPrintableNumber(line.netWeight)}</td>
    </tr>
  `).join('')

  const emptyRows = Array.from({ length: Math.max(0, 8 - ticket.lines.length) }, () => (
    '<tr><td class="c">&nbsp;</td><td></td><td></td><td></td><td></td></tr>'
  )).join('')

  const companyInfo = `
    ${escapeHtml(profile.address)}<br>
    โทร ${escapeHtml(profile.phone || '-')} ${profile.fax ? ` · แฟกซ์ ${escapeHtml(profile.fax)}` : ''}<br>
    เลขประจำตัวผู้เสียภาษี: ${escapeHtml(profile.taxId || '-')} ${profile.branchCode ? ` · สาขา ${escapeHtml(profile.branchCode)}` : ''}
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

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(docTitle)} ${escapeHtml(ticket.documentNo)}</title>
    <style>
      @page { size: A4; margin: 0.5in; }
      body { font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 13px; color: #0f172a; margin: 0; padding: 0; line-height: 1.4; }
      .page { padding: 12px; }
      .head { position: relative; padding-bottom: 14px; border-bottom: 2px solid #334155; margin-bottom: 14px; }
      .co-name { font-size: 22px; font-weight: 700; margin: 0; }
      .co-sub { font-size: 12px; color: #64748b; }
      .co-info { margin-top: 4px; font-size: 12px; color: #64748b; line-height: 1.5; max-width: 62%; }
      .doc-info { position: absolute; top: 8px; right: 0; text-align: right; font-size: 13px; }
      .doc-info .title { font-size: 24px; font-weight: 700; margin-top: 4px; }
      .doc-info .num { font-size: 18px; font-weight: 700; color: #1d4ed8; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 30px; font-size: 13px; margin: 14px 0 18px; }
      .meta div { padding: 3px 0; }
      table.items { width: 100%; border-collapse: separate; border-spacing: 0; margin-top: 8px; font-size: 12px; }
      table.items thead { display: table-header-group; }
      table.items tfoot { display: table-footer-group; }
      table.items th { background: #334155; color: white; padding: 10px; text-align: left; font-weight: 600; font-size: 12px; }
      table.items th:first-child { border-radius: 8px 0 0 0; }
      table.items th:last-child { border-radius: 0 8px 0 0; }
      table.items td { border-bottom: 1px solid #e2e8f0; background: white; padding: 12px 10px; vertical-align: top; }
      table.items tr { break-inside: avoid; page-break-inside: avoid; }
      table.items tfoot td { background: #f1f5f9; font-weight: 700; padding: 14px 10px; border-top: 2px solid #334155; border-bottom: 0; }
      .r { text-align: right; }
      .c { text-align: center; }
      .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 18px; }
      .summary .box { border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; text-align: center; background: white; }
      .summary .box .lbl { font-size: 11px; color: #64748b; margin-bottom: 6px; }
      .summary .box .val { font-size: 22px; font-weight: 800; }
      .summary .box.green { border-color: #10b981; background: #ecfdf5; }
      .summary .box.green .val { color: #059669; }
      .note-box { margin-top: 12px; font-size: 12px; color: #475569; }
      .note-box .label { font-weight: 700; color: #334155; margin-bottom: 3px; }
      .summary, .note-box, .signatures, .photos { break-inside: avoid; page-break-inside: avoid; }
      .signatures { break-before: auto; page-break-before: auto; }
      .photos{margin-top:30px;page-break-inside:auto}
      .photos-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
      .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-top: 50px; font-size: 12px; }
      .sig { text-align: center; }
      .sig .line { border-top: 1px solid #94a3b8; padding-top: 6px; margin-top: 40px; color: #475569; }
      .footer-note { margin-top: 20px; text-align: center; font-size: 11px; color: #666; }
      @media print {
        .no-print { display: none; }
        .page { padding: 0; }
      }
      .toolbar { background: #f3f4f6; padding: 8px; text-align: center; border-bottom: 1px solid #ccc; }
      .toolbar button { background: #2563eb; color: white; border: none; padding: 8px 16px; margin: 0 4px; border-radius: 4px; cursor: pointer; font-size: 14px; }
      .toolbar button:hover { background: #1d4ed8; }
    </style>
  </head><body>
    <div class="no-print toolbar">
      <button onclick="window.print()">🖨 พิมพ์ / Print</button>
      <button onclick="window.close()" style="background:#64748b">✕ ปิด</button>
      <span style="margin-left:10px;color:#555;font-size:12px">กด Ctrl+P เพื่อพิมพ์ หรือ Save as PDF</span>
    </div>

    <div class="page">
      <div class="head">
        <div>
          ${profile.logoUrl ? `<img src="${escapeHtml(profile.logoUrl)}" style="max-height:60px;margin-bottom:6px"/>` : ''}
          <div class="co-name">${escapeHtml(profile.name || '-')}</div>
          ${profile.nameEn ? `<div class="co-sub">${escapeHtml(profile.nameEn)}</div>` : ''}
          <div class="co-info">${companyInfo}</div>
        </div>
        <div class="doc-info">
          <div class="title">${escapeHtml(docTitle)}</div>
          <div class="num">เลขที่: <b>${escapeHtml(ticket.documentNo)}</b></div>
          <div>วันที่ ${escapeHtml(ticket.documentDate || '-')}</div>
          <div>เวลา ${escapeHtml(formatDateTime(ticket.createdAt))}</div>
        </div>
      </div>

      <div class="meta">
        <div><b style="color:#475569">${escapeHtml(partyLabel)}:</b> <b style="font-size:14px">${escapeHtml(ticket.partyName || '-')}</b></div>
        <div><b style="color:#475569">ทะเบียนรถ:</b> <b style="font-size:14px">${escapeHtml(ticket.vehicleNo || '-')}</b></div>
        <div><b style="color:#475569">สาขา:</b> <b style="font-size:14px">${escapeHtml(ticket.branchName || '-')}</b></div>
        <div><b style="color:#475569">พนักงานชั่ง:</b> <b style="font-size:14px">${escapeHtml(ticket.enteredBy || '-')}</b></div>
        <div><b style="color:#475569">สถานะ:</b> <b style="font-size:14px">${escapeHtml(displayWeightTicketStatus(ticket.type, ticket.status))}</b></div>
      </div>

      <table class="items">
        <thead><tr>
          <th class="c" style="width:30px">#</th>
          <th>รายการสินค้า</th>
          <th class="r" style="width:120px">รวม (kg)</th>
          <th class="r" style="width:200px">หักสิ่งเจือปน</th>
          <th class="r" style="width:100px">น้ำหนักสุทธิ</th>
        </tr></thead>
        <tbody>
          ${rows}
          ${emptyRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="text-align:right">รวมทั้งสิ้น</td>
            <td style="text-align:right">${formatPrintableNumber(ticket.totals.grossWeight)}</td>
            <td style="text-align:right">${formatPrintableNumber(ticket.totals.deductionWeight)} kg</td>
            <td style="text-align:right;color:#059669;font-size:18px">${formatPrintableNumber(ticket.totals.netWeight)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="summary">
        <div class="box"><div class="lbl">รายการสินค้า</div><div class="val">${ticket.lines.length} รายการ</div></div>
        <div class="box"><div class="lbl">น้ำหนักรวม</div><div class="val">${formatPrintableNumber(ticket.totals.grossWeight)} kg</div></div>
        <div class="box green"><div class="lbl">น้ำหนักสุทธิ</div><div class="val">${formatPrintableNumber(ticket.totals.netWeight)} kg</div></div>
      </div>

      <div class="note-box">
        <div class="label">หมายเหตุ</div>
        <div>${escapeHtml(ticket.remark || '-')}</div>
      </div>

      ${vehicleImageBlocks ? `<div class="photos"><div style="font-size:13px;font-weight:700;color:#475569;margin-bottom:10px;border-bottom:2px solid #cbd5e1;padding-bottom:6px">📷 รูปรถ${isReceipt ? 'ส่งของ' : 'ขนส่ง'}</div><div class="photos-grid">${vehicleImageBlocks}</div></div>` : ''}

      <div class="signatures">
        <div class="sig">
          <div class="line">${escapeHtml(signatureLeft)}</div>
        </div>
        <div class="sig">
          <div class="line">พนักงานชั่ง</div>
          <div style="font-size:10px;color:#64748b;margin-top:2px">${escapeHtml(ticket.enteredBy || '')}</div>
        </div>
        <div class="sig">
          <div class="line">${escapeHtml(signatureMiddle)}</div>
        </div>
        <div class="sig">
          <div class="line">ผู้อนุมัติ</div>
        </div>
      </div>

      <div style="margin-top:12px;font-size:10px;color:#777;border-top:1px dashed #ccc;padding-top:6px">
        👤 ผู้ทำเอกสาร: <b>${escapeHtml(ticket.enteredBy || '-')}</b>
      </div>

      <div class="footer-note">${escapeHtml(profile.footerNote || '')}</div>
    </div>
  </body></html>`
}

export async function openWeightTicketReceiptPrint(ticket: WeightTicketRecord) {
  const response = await fetch('/api/admin/company-profile', { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = payload.profile ?? emptyCompanyProfile
  const printWindow = window.open('', '_blank', 'width=1024,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  printWindow.document.open()
  printWindow.document.write(buildReceiptPrintHtml(ticket, profile))
  printWindow.document.close()
  printWindow.focus()
}
