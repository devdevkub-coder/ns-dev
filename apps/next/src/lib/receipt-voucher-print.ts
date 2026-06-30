import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'

const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

export type ReceiptVoucherPrintItem = {
  amount?: number | string | null
  description?: string | null
  id?: string | null
  price?: number | string | null
  qty?: number | string | null
  unit?: string | null
}

export type ReceiptVoucherPrintDocument = {
  amountInWords: string
  cancelNote?: string
  cancelledAt?: string
  cancelledBy?: string
  createdAt?: string
  createdBy?: string
  date: string
  docNo: string
  id: string
  items?: unknown
  licensePlate: string
  note: string
  payerSignerName?: string
  paymentMethod?: string
  purchaseBillDocNo: string
  salesPerson?: string
  sellerAddress?: string
  sellerName: string
  sellerPhone?: string | null
  sellerTaxId?: string | null
  status: string
  totalAmount: number
  totalQty: number
  supplierBankAccounts?: Array<{
    accountName: string
    accountNo: string
    bankName: string
    branchCode: string
    code: string
    isPrimary: boolean
    paymentMethod: string
  }>
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

function toNumber(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeItems(items: unknown): ReceiptVoucherPrintItem[] {
  if (!Array.isArray(items)) return []
  return items.filter((item): item is ReceiptVoucherPrintItem => Boolean(item) && typeof item === 'object')
}

function summarizeQuantityByUnit(items: ReceiptVoucherPrintItem[]) {
  const byUnit = new Map<string, number>()
  for (const item of items) {
    const unit = item.unit || 'หน่วย'
    byUnit.set(unit, (byUnit.get(unit) ?? 0) + toNumber(item.qty))
  }
  return [...byUnit.entries()].map(([unit, qty]) => `${money(qty)} ${unit}`).join(' / ')
}

function buildReceiptVoucherPrintHtml(row: ReceiptVoucherPrintDocument, profile: CompanyProfilePrintValues) {
  const items = normalizeItems(row.items)
  const printItems = items.length
    ? items
    : [{ amount: row.totalAmount, description: row.purchaseBillDocNo || row.docNo, id: 'summary', price: row.totalQty ? row.totalAmount / row.totalQty : row.totalAmount, qty: row.totalQty, unit: 'กก.' }]

  const quantitySummary = summarizeQuantityByUnit(printItems)
  const companyName = profile.name || 'ไม่มีข้อมูล'
  const companyAddress = profile.address || 'ไม่มีข้อมูล'
  const companyPhone = profile.phone || 'ไม่มีข้อมูล'
  const companyTaxId = profile.taxId || 'ไม่มีข้อมูล'

  const isCancelled = row.status === 'cancelled'

  const itemsHtml = printItems.map((item, index) => {
    return `
      <tr>
        <td class="center">${index + 1}</td>
        <td class="item-name">${escapeHtml(item.description || '-')}</td>
        <td class="num">${money(toNumber(item.qty))} ${escapeHtml(item.unit || 'หน่วย')}</td>
        <td class="num">${money(toNumber(item.price))}</td>
        <td class="num font-black">${money(toNumber(item.amount))}</td>
      </tr>
    `
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบสำคัญรับเงิน ${escapeHtml(row.docNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.35; background: #f8fafc; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #059669; color: white; font: inherit; cursor: pointer; font-weight: bold; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 7mm; background: white; position: relative; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
      .print-footer { display: none; }
      .accent { height: 4px; background: linear-gradient(90deg, #065f46, #84cc16, #cbd5e1); border-radius: 99px; margin-bottom: 12px; }
      .header { display: grid; grid-template-columns: 1fr .82fr; gap: 16px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
      .company { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: start; min-width: 0; }
      .logo { width: 64px; height: 64px; object-fit: contain; }
      .no-logo { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 12px; font-weight: 850; text-align: center; width: 64px; height: 64px; }
      .company-name { font-size: 15px; font-weight: 900; color: #0f172a; line-height: 1.2; }
      .company-en { font-size: 12px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 4px; color: #475569; font-size: 12px; line-height: 1.4; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 22px; font-weight: 900; color: #065f46; letter-spacing: 0; }
      .doc-subtitle { font-size: 12px; font-weight: bold; uppercase; color: #64748b; margin-top: 1px; }
      .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-top: 12px; text-align: left; }
      .meta-card { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; padding: 4px 8px; }
      .meta-label { font-size: 12px; color: #64748b; }
      .meta-value { font-weight: 900; color: #0f172a; margin-top: 2px; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 6px 9px; background: #f1f5f9; color: #334155; font-weight: 900; font-size: 12px; }
      .panel-body { padding: 8px 9px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 12px; }
      .field-label { color: #64748b; font-size: 12px; }
      .field-value { font-weight: bold; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      .field-wide { grid-span: 2; grid-column: span 2; }
      table { width: 100%; border-collapse: collapse; }
      .items { margin-top: 12px; font-size: 12px; break-inside: auto; page-break-inside: auto; table-layout: fixed; }
      .items thead { display: table-header-group; }
      .items tbody { break-inside: auto; page-break-inside: auto; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 6px 6px; text-align: left; font-weight: 900; }
      .items td { border: 1px solid #cbd5e1; padding: 6px 6px; vertical-align: top; }
      .items tr { break-inside: avoid; page-break-inside: avoid; }
      .item-name { font-weight: bold; color: #0f172a; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .center { text-align: center; }
      
      .bottom-grid { display: grid; grid-template-columns: 1fr 70mm; gap: 12px; margin-top: 12px; }
      .notes-panel { display: flex; flex-direction: column; gap: 8px; }
      .note-box { border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }
      .note-box-header { background: #f1f5f9; padding: 4px 8px; font-weight: 900; color: #475569; font-size: 12px; }
      .note-content { padding: 8px; font-size: 12px; font-weight: bold; color: #0f172a; min-height: 32px; }
      .note-content-small { padding: 6px 8px; font-size: 12px; color: #475569; min-height: 40px; white-space: pre-wrap; }
      .summary-box { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .summary-row { display: grid; grid-template-columns: 1fr 32mm; gap: 8px; border-bottom: 1px solid #cbd5e1; padding: 6px 8px; font-size: 12px; }
      .summary-row:last-child { border-bottom: 0; }
      .summary-row.highlight { background: #065f46; color: white; padding: 8px; font-size: 12px; font-weight: 900; }
      
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 48px; font-size: 12px; }
      .sig-block { text-align: center; color: #475569; }
      .sig-line { width: 78%; margin: 0 auto; height: 28px; border-bottom: 1px solid #475569; }
      .sig-title { margin-top: 4px; font-weight: 900; color: #0f172a; }
      .sig-name { margin-top: 2px; }
      .sig-date { margin-top: 4px; font-size: 12px; color: #64748b; }
      
      .legal-note { margin-top: 16px; border-top: 1px solid #e2e8f0; padding-top: 8px; text-align: center; font-size: 12px; font-weight: bold; color: #64748b; }
      
      .watermark { pointer-events: none; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 72px; font-weight: 900; color: rgba(226, 232, 240, 0.7); transform: rotate(-18deg); z-index: 10; }
      
      @media print {
        body { background: white; margin: 0; }
        .toolbar { display: none !important; }
        .page { border: 0; box-shadow: none; margin: 0; padding: 0; width: 100%; min-height: 0; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิด</button>
      <span style="font-size: 12px;color:#cbd5e1">A4 portrait corporate print</span>
    </div>
    
    <div class="page">
      ${isCancelled ? '<div class="watermark">ยกเลิก / CANCELLED</div>' : ''}
      <div class="accent"></div>
      
      <header class="header">
        <div class="company">
          ${profile.logoUrl ? `
            <img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company Logo" />
          ` : `
            <div class="no-logo">ไม่มีข้อมูล</div>
          `}
          <div class="min-w-0">
            <div class="company-name">${escapeHtml(companyName)}</div>
            ${profile.nameEn ? `<div class="company-en">${escapeHtml(profile.nameEn)}</div>` : ''}
            <div class="company-info">
              <div>${escapeHtml(companyAddress)}</div>
              <div>โทร ${escapeHtml(companyPhone)}</div>
              <div>เลขประจำตัวผู้เสียภาษี ${escapeHtml(companyTaxId)}</div>
            </div>
          </div>
        </div>
        <div class="doc-head">
          <div class="doc-title">ใบสำคัญรับเงิน</div>
          <div class="doc-subtitle">Receipt Voucher</div>
          <div class="meta-grid">
            <div class="meta-card">
              <div class="meta-label">เลขที่เอกสาร</div>
              <div class="meta-value">${escapeHtml(row.docNo)}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">วันที่ออกเอกสาร</div>
              <div class="meta-value">${dateDisplay(row.date)}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">อ้างอิงบิลซื้อ</div>
              <div class="meta-value">${escapeHtml(row.purchaseBillDocNo || '-')}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">วิธีรับเงิน</div>
              <div class="meta-value">${escapeHtml(row.paymentMethod || 'รับเงินสด')}</div>
            </div>
          </div>
        </div>
      </header>
      
      <section class="section-grid">
        <div class="panel">
          <div class="panel-title">ผู้รับเงิน / Supplier Receiver</div>
          <div class="panel-body">
            <div class="two-col">
              <div>
                <div class="field-label">ผู้รับเงิน</div>
                <div class="field-value">${escapeHtml(row.sellerName)}</div>
              </div>
              <div>
                <div class="field-label">เลขประจำตัวผู้เสียภาษี</div>
                <div class="field-value">${escapeHtml(row.sellerTaxId || '-')}</div>
              </div>
              <div class="field-wide">
                <div class="field-label">ที่อยู่</div>
                <div class="field-value">${escapeHtml(row.sellerAddress || '-')}</div>
              </div>
              <div>
                <div class="field-label">เบอร์โทร</div>
                <div class="field-value">${escapeHtml(row.sellerPhone || '-')}</div>
              </div>
              <div>
                <div class="field-label">Sale contact</div>
                <div class="field-value">${escapeHtml(row.salesPerson || '-')}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="panel">
          <div class="panel-title">ผู้จ่ายเงิน / Company Payer</div>
          <div class="panel-body">
            <div class="two-col">
              <div>
                <div class="field-label">บริษัท</div>
                <div class="field-value">${escapeHtml(companyName)}</div>
              </div>
              <div>
                <div class="field-label">เลขประจำตัวผู้เสียภาษี</div>
                <div class="field-value">${escapeHtml(companyTaxId)}</div>
              </div>
              <div class="field-wide">
                <div class="field-label">ที่อยู่</div>
                <div class="field-value">${escapeHtml(companyAddress)}</div>
              </div>
              <div>
                <div class="field-label">โทร</div>
                <div class="field-value">${escapeHtml(companyPhone)}</div>
              </div>
              <div>
                <div class="field-label">ผู้จ่ายเงิน</div>
                <div class="field-value">${escapeHtml(row.payerSignerName || row.createdBy || '')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      <table class="items">
        <thead>
          <tr>
            <th style="width: 8mm; text-align: center;">#</th>
            <th>รายการ</th>
            <th style="width: 28mm; text-align: right;">จำนวน/หน่วย</th>
            <th style="width: 25mm; text-align: right;">ราคา/หน่วย</th>
            <th style="width: 29mm; text-align: right;">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <section class="bottom-grid">
        <div class="notes-panel">
          ${(row.supplierBankAccounts && row.supplierBankAccounts.length > 0) ? `
            <div class="note-box">
              <div class="note-box-header">เลขที่บัญชี / Bank Account</div>
              <div class="note-content" style="min-height: 48px; padding: 6px 8px; font-weight: normal; line-height: 1.4;">
                ${row.supplierBankAccounts.slice(0, 2).map((account, index) => `
                  <div style="font-size: 11px; ${index > 0 ? 'margin-top: 4px; border-top: 1px dashed #cbd5e1; padding-top: 4px;' : ''}">
                    <strong>${escapeHtml(account.paymentMethod)}</strong> · ${escapeHtml(account.bankName || '-')} · <span style="font-variant-numeric: tabular-nums;">${escapeHtml(account.accountNo || '-')}</span>
                    <div style="color: #475569; margin-top: 2px;">ชื่อบัญชี: ${escapeHtml(account.accountName || '-')} ${account.branchCode ? `· สาขา: ${escapeHtml(account.branchCode)}` : ''}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : `
            <div class="note-box">
              <div class="note-box-header">จำนวนเงิน (ตัวอักษร)</div>
              <div class="note-content">${escapeHtml(row.amountInWords || '-')}</div>
            </div>
          `}
          <div class="note-box">
            <div class="note-box-header">หมายเหตุ</div>
            <div class="note-content-small">${escapeHtml(row.note || 'แนบสำเนาบัตรประชาชนผู้รับเงิน (กรณีบุคคลธรรมดา)')}</div>
          </div>
        </div>
        
        <div class="summary-box">
          <div class="summary-row">
            <div style="font-weight: bold; color: #475569;">จำนวนรวม</div>
            <div style="text-align: right; font-weight: 900; color: #0f172a;">${escapeHtml(quantitySummary || '-')}</div>
          </div>
          <div class="summary-row" style="border-bottom: 0;">
            <div style="font-weight: bold; color: #475569;">ยอดเงินรวม</div>
            <div style="text-align: right; font-weight: 900; color: #0f172a;">${money(row.totalAmount)}</div>
          </div>
          <div class="summary-row highlight">
            <div>ยอดรับเงินสด</div>
            <div style="text-align: right; font-variant-numeric: tabular-nums;">${money(row.totalAmount)}</div>
          </div>
          ${(row.supplierBankAccounts && row.supplierBankAccounts.length > 0) ? `
            <div style="padding: 6px 8px; text-align: right; font-size: 11px; font-weight: bold; color: #065f46; background: #ecfdf5; border-top: 1px solid #cbd5e1;">
              (${escapeHtml(row.amountInWords || '-')})
            </div>
          ` : ''}
        </div>
      </section>
      
      <div class="signatures">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-title">ผู้จ่ายเงิน</div>
          <div class="sig-name">( ${escapeHtml(row.payerSignerName || row.createdBy || '')} )</div>
          <div class="sig-date">วันที่ ____ / ____ / ______</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-title">ผู้รับเงิน</div>
          <div class="sig-name">( ${escapeHtml(row.sellerName)} )</div>
          <div class="sig-date">วันที่ ____ / ____ / ______</div>
        </div>
      </div>
      
      <div class="legal-note">
        เอกสารนี้เป็นหลักฐานรับเงินสดจาก Supplier เท่านั้น ไม่ใช่เอกสารโอนเงินหรือรายการธนาคาร
      </div>
    </div>
  </body></html>`
}

function writeLoading(printWindow: Window) {
  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมใบสำคัญรับเงิน...</body></html>`)
  printWindow.document.close()
}

export function openReceiptVoucherPrintWindow() {
  const printWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  writeLoading(printWindow)
  printWindow.focus()
  return printWindow
}

export async function openReceiptVoucherPrint(row: ReceiptVoucherPrintDocument, targetWindow?: Window) {
  const printWindow = targetWindow ?? openReceiptVoucherPrintWindow()
  
  try {
    const response = await fetch('/api/admin/company-profile', { cache: 'no-store' })
    const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
    const profile = companyProfileForPrint(payload)
    printWindow.document.open()
    printWindow.document.write(buildReceiptVoucherPrintHtml(row, profile))
    printWindow.document.close()
    printWindow.focus()
  } catch (err) {
    printWindow.document.open()
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>เกิดข้อผิดพลาด</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#ef4444"><b>เกิดข้อผิดพลาดในการโหลดข้อมูลพิมพ์:</b><br>${escapeHtml(err instanceof Error ? err.message : String(err))}</body></html>`)
    printWindow.document.close()
  }
}
