import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'

const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

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
  allocatedAmount: number
  remainingAmount: number
  branchId: string
  branchName?: string | null
  supplierName?: string | null
  customerName?: string | null
  plateNo?: string | null
  productName?: string | null
  netWeight?: number | null
  pricePerKg?: number | null
  paymentMethod?: string | null
  accountName?: string | null
  remark?: string | null
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

function companyInfo(profile: CompanyProfilePrintValues, doc: AdvancePaymentPrintDocument) {
  const branchLabel = doc.branchName?.trim() ? `สาขา ${doc.branchName.trim()}` : ''
  return [
    missing(profile.address),
    `โทร ${missing(profile.phone)}${profile.fax ? `  แฟกซ์ ${profile.fax}` : ''}`,
    `เลขประจำตัวผู้เสียภาษี ${missing(profile.taxId)}${branchLabel ? `  ${branchLabel}` : ''}`,
    [profile.email ? `Email: ${profile.email}` : null, profile.website ? `Website: ${profile.website}` : null].filter(Boolean).join('  '),
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

export function buildAdvancePaymentPrintHtml(doc: AdvancePaymentPrintDocument, profile: CompanyProfilePrintValues) {
  const isCancelled = doc.remark?.includes('ยกเลิก') || false
  const title = 'ใบสำคัญการจ่ายเงินล่วงหน้า / มัดจำ'
  const partyLabel = doc.customerName ? 'ลูกค้า / Customer' : 'ผู้ขาย / Supplier'
  const partyName = doc.customerName || doc.supplierName || '-'

  const allocationsHtml = (doc.allocations ?? []).map((alloc, idx) => `
    <tr>
      <td class="center" style="width:10mm">${idx + 1}</td>
      <td>หักล้างกับบิลซื้อ ${escapeHtml(alloc.purchaseBillDocNo)}</td>
      <td class="num" style="width:40mm">${money(alloc.allocatedAmount)}</td>
      <td class="center" style="width:30mm">${dateDisplay(alloc.allocatedAt)}</td>
    </tr>
  `).join('')

  const allocationsTable = (doc.allocations ?? []).length > 0 ? `
    <h3 style="margin-top: 15px; font-size: 12px; color: #1e293b;">ประวัติการหักล้างมัดจำ (Allocation History)</h3>
    <table class="items" style="margin-top: 5px;">
      <thead>
        <tr>
          <th class="center" style="width:10mm">#</th>
          <th>รายละเอียดการหักล้าง</th>
          <th class="num" style="width:40mm">ยอดที่หักล้าง (บาท)</th>
          <th class="center" style="width:30mm">วันที่ทำรายการ</th>
        </tr>
      </thead>
      <tbody>
        ${allocationsHtml}
      </tbody>
    </table>
  ` : '<div style="margin-top:15px;font-style:italic;color:#64748b;font-size: 12px">ยังไม่มีการนำไปหักล้างกับบิลซื้อ</div>'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(doc.docNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.35; background: #f8fafc; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #15803d; color: white; font: inherit; cursor: pointer; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; min-height: 277mm; margin: 14px auto; padding: 7mm; background: white; position: relative; box-shadow: 0 18px 40px rgba(15,23,42,.12); break-after: page; page-break-after: always; }
      .page-content { min-height: calc(277mm - 14mm); display: flex; flex-direction: column; }
      .accent { height: 4px; background: linear-gradient(90deg, #1e3a8a, #3b82f6, #cbd5e1); border-radius: 99px; margin-bottom: 12px; }
      .header { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
      .company { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: start; min-width: 0; }
      .logo { width: 64px; height: 64px; object-fit: contain; }
      .company-name { font-size: 15px; font-weight: 800; color: #0f172a; }
      .company-info { margin-top: 4px; color: #475569; font-size: 12px; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 20px; font-weight: 900; color: #1e3a8a; }
      .doc-grid { margin-top: 8px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; text-align: left; }
      .kv { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 7px; background: #f8fafc; }
      .kv .label { color: #64748b; font-size: 12px; }
      .kv .value { font-weight: 800; color: #0f172a; margin-top: 1px; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .panel-title { padding: 6px 9px; background: #f1f5f9; color: #334155; font-weight: 900; }
      .panel-body { padding: 8px 9px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; }
      .field-label { color: #64748b; font-size: 12px; }
      .field-value { font-weight: 750; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; }
      .items { margin-top: 12px; font-size: 12px; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 6px 5px; text-align: left; font-weight: 900; }
      .items td { border: 1px solid #dbe3ea; padding: 6px 5px; }
      .num { text-align: right; }
      .center { text-align: center; }
      .bottom-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 15px; align-items: start; }
      .note { min-height: 42px; color: #334155; white-space: pre-wrap; font-size: 12px; }
      .totals { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .total-row { display: grid; grid-template-columns: minmax(0, 1fr) 35mm; gap: 8px; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
      .total-row:last-child { border-bottom: 0; }
      .total-row.final { background: #1e3a8a; color: white; font-size: 12px; font-weight: 900; }
      .total-row.allocated { color: #b45309; }
      .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 25px; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 5px; margin-top: 32px; font-weight: 800; color: #1e293b; }
      .footer { margin-top: 15px; text-align: center; color: #64748b; font-size: 12px; }
      @media print {
        body { background: white; font-size: 12px; line-height: 1.2; }
        .toolbar { display: none; }
        .page { width: auto; min-height: 281mm; margin: 0; padding: 0; box-shadow: none; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิด</button>
      <span style="font-size: 12px;color:#cbd5e1">A4 portrait corporate print</span>
    </div>
    <main class="page">
      <div class="page-content">
        <div class="accent"></div>
        <section class="header">
          <div class="company">
            ${profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo no-logo">ไม่มีข้อมูล</div>'}
            <div>
              <div class="company-name">${escapeHtml(missing(profile.name))}</div>
              ${profile.nameEn ? `<div style="font-size: 12px;font-weight:700;color:#475569">${escapeHtml(profile.nameEn)}</div>` : ''}
              <div class="company-info">${companyInfo(profile, doc)}</div>
            </div>
          </div>
          <div class="doc-head">
            <div class="doc-title">${escapeHtml(title)}</div>
            <div class="doc-grid">
              <div class="kv"><div class="label">เลขที่เอกสาร</div><div class="value">${escapeHtml(doc.docNo)}</div></div>
              <div class="kv"><div class="label">วันที่ทำมัดจำ</div><div class="value">${escapeHtml(dateDisplay(doc.advanceDate))}</div></div>
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
              <div><div class="field-label">น้ำหนักประมาณการ</div><div class="field-value">${doc.netWeight ? `${money(doc.netWeight)} กก.` : '-'}</div></div>
              <div><div class="field-label">ราคา/กก. ประมาณการ</div><div class="field-value">${doc.pricePerKg ? `${money(doc.pricePerKg)} บาท` : '-'}</div></div>
            </div>
          </div>
        </section>

        ${allocationsTable}

        <div style="margin-top:auto"></div>

        <section class="bottom-grid">
          <div class="panel">
            <div class="panel-title">หมายเหตุ / Note</div>
            <div class="panel-body note">${escapeHtml(plain(doc.remark))}</div>
          </div>
          <div class="totals">
            <div class="total-row"><div>ยอดเงินมัดจำ / Total Advance</div><div class="num">${money(doc.amount)}</div></div>
            <div class="total-row allocated"><div>หักล้างแล้ว / Allocated</div><div class="num">${money(doc.allocatedAmount)}</div></div>
            <div class="total-row final"><div>ยอดคงเหลือ / Remaining</div><div class="num">${money(doc.remainingAmount)}</div></div>
          </div>
        </section>

        <section class="signatures">
          <div class="sig"><div class="sig-line">ผู้ขอเบิกเงินล่วงหน้า</div><div>วันที่ ____ / ____ / ______</div></div>
          <div class="sig"><div class="sig-line">ผู้อนุมัติจ่ายเงิน</div><div>วันที่ ____ / ____ / ______</div></div>
          <div class="sig"><div class="sig-line">ผู้จ่ายเงิน (แคชเชียร์)</div><div>วันที่ ____ / ____ / ______</div></div>
        </section>
        <div class="footer">${escapeHtml(profile.footerNote || '')}</div>
      </div>
    </main>
  </body></html>`
}

export function openAdvancePaymentPrintWindow() {
  const printWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมพิมพ์เอกสารเงินล่วงหน้า/มัดจำ...</body></html>`)
  printWindow.document.close()
  printWindow.focus()
  return printWindow
}

export async function openAdvancePaymentPrint(doc: AdvancePaymentPrintDocument, targetWindow?: Window) {
  const printWindow = targetWindow ?? openAdvancePaymentPrintWindow()
  const query = doc.branchId ? `?branchId=${encodeURIComponent(doc.branchId)}` : ''
  const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = companyProfileForPrint(payload)
  printWindow.document.open()
  printWindow.document.write(buildAdvancePaymentPrintHtml(doc, profile))
  printWindow.document.close()
  printWindow.focus()
}
