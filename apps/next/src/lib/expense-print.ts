import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'

const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

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

function missing(value: string | null | undefined) {
  return value?.trim() || 'ไม่มีข้อมูล'
}

function formatDateDisplay(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function expenseStatusLabel(status?: string | null) {
  if (!status) return '-'
  const lower = status.toLowerCase()
  if (lower === 'paid') return 'จ่ายแล้ว'
  if (lower === 'unpaid') return 'ค้างจ่าย'
  if (lower === 'pending_approval') return 'ยังไม่อนุมัติ'
  if (lower === 'cancelled') return 'ยกเลิก'
  return status
}

export function buildExpensePrintHtml(expense: any, profile: CompanyProfilePrintValues) {
  const logoHtml = profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo no-logo">ไม่มีข้อมูล</div>'
  const isCancelled = String(expense.status ?? '').toLowerCase() === 'cancelled'
  const branchLabel = expense.branchName?.trim() ? `สาขา ${expense.branchName.trim()}` : ''
  const companyInfo = `
    ${escapeHtml(missing(profile.address))}<br>
    โทร ${escapeHtml(missing(profile.phone))} ${profile.fax ? ` · แฟกซ์ ${escapeHtml(profile.fax)}` : ''}<br>
    เลขประจำตัวผู้เสียภาษี: ${escapeHtml(missing(profile.taxId))}${branchLabel ? ` · ${escapeHtml(branchLabel)}` : ''}
    ${profile.email ? `<br>Email: ${escapeHtml(profile.email)}` : ''}
    ${profile.website ? `<br>Website: ${escapeHtml(profile.website)}` : ''}
  `

  const lines = expense.lines || []
  const rowsHtml = lines.map((line: any, idx: number) => {
    const lineNet = (line.amount || 0) + (line.vatAmount || 0) - (line.whtAmount || 0)
    return `
      <tr class="item-row">
        <td class="center rank-cell">${idx + 1}</td>
        <td>
          <div class="item-name">${escapeHtml(line.categoryName || expense.categoryName || '-')}</div>
        </td>
        <td>${escapeHtml(line.description || '-')}</td>
        <td class="num">${money(line.amount)}</td>
        <td class="num">${line.vatAmount > 0 ? money(line.vatAmount) : '-'}</td>
        <td class="num">${line.whtAmount > 0 ? money(line.whtAmount) : '-'}</td>
        <td class="num strong">${money(lineNet)}</td>
      </tr>
    `
  }).join('')

  // Filler empty rows to align footer
  const emptyRowCount = Math.max(0, 10 - lines.length)
  const emptyRowsHtml = Array.from({ length: emptyRowCount }, () => (
    '<tr class="empty"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'
  )).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบสำคัญจ่ายค่าใช้จ่าย ${escapeHtml(expense.docNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.35; background: #f8fafc; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #15803d; color: white; font: inherit; cursor: pointer; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 7mm; background: white; position: relative; display: flex; flex-direction: column; }
      .accent { height: 4px; background: linear-gradient(90deg, #b91c1c, #ea580c, #cbd5e1); border-radius: 99px; margin-bottom: 12px; }
      .header { display: grid; grid-template-columns: 1fr .9fr; gap: 12px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
      .company { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: start; min-width: 0; }
      .logo { width: 64px; height: 64px; object-fit: contain; }
      .no-logo { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 12px; font-weight: 800; text-align: center; }
      .company-name { font-size: 16px; font-weight: 800; color: #0f172a; }
      .company-en { font-size: 12px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 4px; color: #475569; font-size: 12px; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 22px; font-weight: 900; color: #991b1b; letter-spacing: 0; }
      .section-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 10px; margin-top: 12px; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 6px 9px; background: #f1f5f9; color: #334155; font-weight: 900; }
      .panel-body { padding: 8px 9px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; }
      .field-label { color: #64748b; font-size: 12px; }
      .field-value { font-weight: 750; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; }
      .items { margin-top: 12px; font-size: 12px; table-layout: fixed; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 6px 5px; text-align: left; font-weight: 900; }
      .items td { border: 1px solid #dbe3ea; padding: 6px 5px; vertical-align: top; }
      .items .empty td { height: 24px; color: transparent; }
      .item-name { font-weight: 850; color: #0f172a; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .center { text-align: center; }
      .rank-cell { padding-left: 2px !important; padding-right: 2px !important; }
      .strong { font-weight: 900; }
      .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
      .note { min-height: 42px; color: #334155; white-space: pre-wrap; }
      .totals { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .total-row { display: grid; grid-template-columns: minmax(0, 1fr) 30mm; gap: 8px; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
      .total-row:last-child { border-bottom: 0; }
      .total-row.final { background: #991b1b; color: white; font-size: 13px; font-weight: 900; }
      .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-top: 24px; break-inside: avoid; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 5px; margin-top: 28px; font-weight: 800; color: #1e293b; }
      .footer { margin-top: auto; padding-top: 8px; display: flex; justify-content: space-between; gap: 12px; border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 12px; }
      .watermark { display: ${isCancelled ? 'block' : 'none'}; position: absolute; top: 72mm; left: 54mm; transform: rotate(-18deg); color: rgba(239,68,68,.14); font-size: 54px; font-weight: 900; pointer-events: none; }
      @media print {
        @page { size: A4 portrait; margin: 8mm; }
        body { background: white; font-size: 12px; line-height: 1.2; }
        .toolbar { display: none; }
        .page { width: auto; min-height: auto; padding: 0; }
        .accent { margin-bottom: 7px; }
        .header { gap: 10px; padding-bottom: 7px; }
        .company { grid-template-columns: 48px 1fr; gap: 8px; }
        .logo { width: 48px; height: 48px; }
        .company-name { font-size: 14px; }
        .company-info { font-size: 12px; line-height: 1.25; margin-top: 2px; }
        .doc-title { font-size: 19px; }
        .section-grid { gap: 8px; margin-top: 7px; }
        .panel-title { padding: 4px 7px; }
        .panel-body { padding: 5px 7px; }
        .two-col { gap: 4px 8px; }
        .items { font-size: 12px; margin-top: 7px; }
        .items th, .items td { padding: 3px; }
        .items .empty td { height: 18px; }
        .bottom-grid { gap: 8px; margin-top: 7px; }
        .note { min-height: 24px; }
        .total-row { padding: 3px 6px; }
        .total-row.final { font-size: 12px; }
        .signatures { gap: 12px; margin-top: 15px; }
        .sig-line { margin-top: 20px; padding-top: 3px; }
        .footer { padding-top: 4px; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิด</button>
      <span style="font-size: 12px;color:#cbd5e1">A4 portrait print</span>
    </div>
    <main class="page">
      <div class="watermark">ยกเลิก / CANCELLED</div>
      <div class="accent"></div>
      <section class="header">
        <div class="company">
          ${logoHtml}
          <div>
            <div class="company-name">${escapeHtml(missing(profile.name))}</div>
            ${profile.nameEn ? `<div class="company-en">${escapeHtml(profile.nameEn)}</div>` : ''}
            <div class="company-info">${companyInfo}</div>
          </div>
        </div>
        <div class="doc-head">
          <div class="doc-title">ใบสำคัญจ่ายค่าใช้จ่าย</div>
        </div>
      </section>

      <section class="section-grid">
        <div class="panel">
          <div class="panel-title">ข้อมูลการจ่ายเงิน / Payment Details</div>
          <div class="panel-body two-col">
            <div><div class="field-label">จ่ายให้ (Payee)</div><div class="field-value">${escapeHtml(expense.payee || '-')}</div></div>
            <div><div class="field-label">วันที่จ่าย</div><div class="field-value">${escapeHtml(formatDateDisplay(expense.date))}</div></div>
            <div><div class="field-label">บัญชีจ่าย</div><div class="field-value">${escapeHtml(expense.accountName || '-')}</div></div>
            <div><div class="field-label">เลขอ้างอิง</div><div class="field-value">${escapeHtml(expense.refDocNo || '-')}</div></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">ข้อมูลเอกสาร / Document Info</div>
          <div class="panel-body two-col">
            <div><div class="field-label">เลขที่สำคัญ</div><div class="field-value">${escapeHtml(expense.docNo)}</div></div>
            <div><div class="field-label">วันครบกำหนด</div><div class="field-value">${escapeHtml(expense.dueDate ? formatDateDisplay(expense.dueDate) : '-')}</div></div>
            <div><div class="field-label">เลขใบกำกับภาษี</div><div class="field-value">${escapeHtml(expense.taxInvoiceNo || '-')}</div></div>
            <div><div class="field-label">สถานะ</div><div class="field-value">${escapeHtml(expenseStatusLabel(expense.status))}</div></div>
          </div>
        </div>
      </section>

      <table class="items">
        <thead>
          <tr>
            <th class="center rank-cell" style="width:7mm">#</th>
            <th style="width:50mm">หมวดหมู่</th>
            <th>รายละเอียด</th>
            <th class="num" style="width:26mm">ยอดก่อน VAT</th>
            <th class="num" style="width:20mm">VAT</th>
            <th class="num" style="width:20mm">WHT</th>
            <th class="num" style="width:26mm">ยอดสุทธิ</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          ${emptyRowsHtml}
        </tbody>
      </table>

      <section class="bottom-grid">
        <div class="panel">
          <div class="panel-title">รายละเอียดรวม / หมายเหตุ</div>
          <div class="panel-body">
            <div class="note"><b>รายละเอียดรวม:</b> ${escapeHtml(expense.description || '-')}<br><br><b>หมายเหตุ:</b> ${escapeHtml(expense.notes || '-')}</div>
          </div>
        </div>
        <div class="totals">
          <div class="total-row"><span class="field-label">ยอดก่อน VAT</span><span class="num">${money(expense.amount)}</span></div>
          <div class="total-row"><span class="field-label">ยอด VAT</span><span class="num">${money(expense.vat)}</span></div>
          <div class="total-row"><span class="field-label">ยอด WHT</span><span class="num">${money(expense.wht)}</span></div>
          <div class="total-row final"><span class="strong">ยอดรวมสุทธิ</span><span class="num">${money(expense.netAmount)}</span></div>
        </div>
      </section>

      <section class="signatures">
        <div class="sig"><div class="sig-line">ผู้จัดทำ (Prepared By)</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้ตรวจสอบ (Checked By)</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้อนุมัติ (Approved By)</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้รับเงิน (Recipient)</div><div>วันที่ ____ / ____ / ______</div></div>
      </section>

      <footer class="footer">
        <span>${escapeHtml(profile.footerNote || '')}</span>
        <span>หน้า 1 / 1</span>
      </footer>
    </main>
  </body></html>`
}

function writeLoading(printWindow: Window, expense: any) {
  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมใบสำคัญจ่ายค่าใช้จ่าย ${escapeHtml(expense.docNo)}...</body></html>`)
  printWindow.document.close()
}

export function openExpensePrintWindow(expense: any) {
  const printWindow = window.open('', '_blank', 'width=1024,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  writeLoading(printWindow, expense)
  printWindow.focus()
  return printWindow
}

export async function openExpenseReceiptPrint(expense: any, targetWindow?: Window) {
  const printWindow = targetWindow ?? openExpensePrintWindow(expense)
  const query = expense.branchId ? `?branchId=${encodeURIComponent(expense.branchId)}` : ''
  const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = companyProfileForPrint(payload)
  printWindow.document.open()
  printWindow.document.write(buildExpensePrintHtml(expense, profile))
  printWindow.document.close()
  printWindow.focus()
}
