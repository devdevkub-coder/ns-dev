import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'
import { calculatePurchaseBillPostAdvanceTotals } from '@/lib/purchase-advance'
import type { PurchaseBillDetail } from '@/lib/server/purchase-bill-detail'

const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

const FIRST_PAGE_ITEM_ROWS = 15
const CONTINUATION_PAGE_ITEM_ROWS = 24

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

function companyInfo(profile: CompanyProfilePrintValues, bill: PurchaseBillDetail) {
  const branchLabel = bill.branchName?.trim() ? `สาขา ${bill.branchName.trim()}` : ''
  return [
    missing(profile.address),
    `โทร ${missing(profile.phone)}${profile.fax ? `  แฟกซ์ ${profile.fax}` : ''}`,
    `เลขประจำตัวผู้เสียภาษี ${missing(profile.taxId)}${branchLabel ? `  ${branchLabel}` : ''}`,
    [profile.email ? `Email: ${profile.email}` : null, profile.website ? `Website: ${profile.website}` : null].filter(Boolean).join('  '),
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

function itemRows(bill: PurchaseBillDetail) {
  return bill.allocationRows.map((item) => `
    <tr class="item-row">
      <td class="center rank-cell">${item.lineNo}</td>
      <td>
        <div class="item-name">${escapeHtml(item.productName)}</div>
        <div class="muted">${escapeHtml([item.productCode || null, item.poDocNo ?? 'Spot Buy'].filter(Boolean).join(' · '))}</div>
      </td>
      <td>${escapeHtml(item.note || '-')}</td>
      <td class="num">${money(item.grossWeight)}</td>
      <td class="num">${money(item.deductWeight)}</td>
      <td class="num strong">${money(item.qty)} ${escapeHtml(item.unit)}</td>
      <td class="num">${money(item.price)}</td>
      <td class="num strong">${money(item.amount)}</td>
    </tr>
  `).join('')
}

function emptyRows(count: number) {
  return Array.from({ length: Math.max(0, count) }, () => (
    '<tr class="empty"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>'
  )).join('')
}

function fillerRowCount(itemCount: number) {
  if (itemCount <= FIRST_PAGE_ITEM_ROWS) return FIRST_PAGE_ITEM_ROWS - itemCount
  const lastPageRows = (itemCount - FIRST_PAGE_ITEM_ROWS) % CONTINUATION_PAGE_ITEM_ROWS
  return lastPageRows === 0 ? 0 : CONTINUATION_PAGE_ITEM_ROWS - lastPageRows
}

function totalsByUnit(bill: PurchaseBillDetail) {
  const byUnit = new Map<string, { deductWeight: number; grossWeight: number; qty: number }>()
  bill.allocationRows.forEach((row) => {
    const unit = row.unit || 'กก.'
    const current = byUnit.get(unit) ?? { deductWeight: 0, grossWeight: 0, qty: 0 }
    current.deductWeight += row.deductWeight
    current.grossWeight += row.grossWeight
    current.qty += row.qty
    byUnit.set(unit, current)
  })
  return Array.from(byUnit.entries()).map(([unit, value]) => ({
    deductWeight: value.deductWeight,
    grossWeight: value.grossWeight,
    qty: value.qty,
    unit,
  }))
}

export function buildPurchaseBillPrintHtml(bill: PurchaseBillDetail, profile: CompanyProfilePrintValues) {
  const logoHtml = profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo no-logo">ไม่มีข้อมูล</div>'
  const cancelled = ['cancelled', 'cancelled_supplier_swap'].includes(bill.status)
  const title = 'บิลรับซื้อ'
  const totals = totalsByUnit(bill)
  const totalSummaryText = totals.map((item) => `${money(item.qty)} ${item.unit}`).join(' / ') || '-'
  const grossSummaryText = totals.map((item) => `${money(item.grossWeight)} ${item.unit}`).join(' / ') || '-'
  const deductSummaryText = totals.map((item) => `${money(item.deductWeight)} ${item.unit}`).join(' / ') || '-'
  const postAdvanceTotals = calculatePurchaseBillPostAdvanceTotals({
    advanceBaseAllocatedAmount: bill.advanceAllocatedSubtotalAmount || bill.advanceConsumedAmount,
    discountAmount: bill.discount,
    hasVat: bill.hasVat,
    subtotalAmount: bill.subtotal,
    vatRatePercent: bill.vatRatePercent,
    vatType: bill.vatType,
  })
  const vatLabel = `VAT ${bill.vatRatePercent || 7}%`
  const advanceBreakdownHtml = bill.advancePaymentDocNo
    ? `<div class="total-row advance-sub"><div>หัก ADV/มัดจำก่อน VAT (${escapeHtml(bill.advancePaymentDocNo)})</div><div class="num">${money(bill.advanceAllocatedSubtotalAmount || bill.advanceConsumedAmount)}</div></div>`
    : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(bill.docNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.35; background: #f8fafc; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #15803d; color: white; font: inherit; cursor: pointer; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 7mm; background: white; position: relative; }
      .print-only { display: none; }
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
      .items tfoot .final-amount { color: #14532d; }
      .item-name { font-weight: 850; color: #0f172a; }
      .muted { color: #64748b; font-size: 12px; margin-top: 1px; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .center { text-align: center; }
      .rank-cell { padding-left: 2px !important; padding-right: 2px !important; }
      .strong { font-weight: 900; }
      .bottom-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
      .note { min-height: 42px; color: #334155; white-space: pre-wrap; }
      .totals { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .total-row { display: grid; grid-template-columns: minmax(0, 1fr) 30mm; gap: 8px; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
      .total-row:last-child { border-bottom: 0; }
      .total-row.final { background: #14532d; color: white; font-size: 13px; font-weight: 900; }
      .total-row.advance { color: #b45309; }
      .total-row.advance-sub { color: #0369a1; font-size: 12px; }
      .weight-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
      .weight-card { border: 1px solid #dbe3ea; border-radius: 8px; padding: 7px; background: #f8fafc; }
      .weight-card .label { color: #64748b; font-size: 12px; }
      .weight-card .value { font-size: 12px; font-weight: 900; color: #0f172a; margin-top: 2px; }
      .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 20px; break-inside: avoid; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 5px; margin-top: 28px; font-weight: 800; color: #1e293b; }
      .footer { margin-top: 8px; text-align: center; color: #64748b; font-size: 12px; }
      .watermark { display: ${cancelled ? 'block' : 'none'}; position: absolute; top: 72mm; left: 54mm; transform: rotate(-18deg); color: rgba(100,116,139,.14); font-size: 54px; font-weight: 900; pointer-events: none; }
      @media print {
        @page { size: A4 portrait; margin: 8mm; }
        body { background: white; font-size: 12px; line-height: 1.2; }
        .toolbar { display: none; }
        .page { width: auto; min-height: auto; padding: 0; }
        .print-only { display: initial; }
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
        .items { font-size: 12px; margin-top: 7px; page-break-before: auto; }
        .items th { padding: 3px 3px; }
        .items td { padding: 3px 3px; }
        .items .empty td { height: 18px; }
        .muted { font-size: 12px; }
        .weight-summary { gap: 6px; margin-top: 6px; }
        .weight-card { padding: 5px; }
        .weight-card .value { font-size: 12px; }
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
        </div>
      </section>

      <section class="section-grid">
        <div class="panel">
          <div class="panel-title">ข้อมูลผู้ขาย / Supplier</div>
          <div class="panel-body two-col">
            <div><div class="field-label">ชื่อผู้ขาย</div><div class="field-value">${escapeHtml(bill.supplierName)}</div></div>
            <div><div class="field-label">รหัสผู้ขาย</div><div class="field-value">${escapeHtml(bill.supplierCode)}</div></div>
            <div><div class="field-label">เลขผู้เสียภาษี</div><div class="field-value">${escapeHtml(plain(bill.supplierTaxId))}</div></div>
            <div><div class="field-label">ทะเบียนรถ</div><div class="field-value">${escapeHtml(plain(bill.licensePlate))}</div></div>
            <div style="grid-column:1 / -1"><div class="field-label">ที่อยู่</div><div class="field-value">${escapeHtml(plain(bill.supplierAddress))}</div></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">ข้อมูลเอกสาร / Document Info</div>
          <div class="panel-body two-col">
            <div><div class="field-label">เลขที่เอกสาร</div><div class="field-value">${escapeHtml(bill.docNo)}</div></div>
            <div><div class="field-label">วันที่ส่ง / วันที่เอกสาร</div><div class="field-value">${escapeHtml(plain(bill.date))}</div></div>
            <div><div class="field-label">ผู้จัดทำ</div><div class="field-value">${escapeHtml(plain(bill.createdBy))}</div></div>
            <div><div class="field-label">Sale</div><div class="field-value">${escapeHtml(plain(bill.salesName))}</div></div>
            <div><div class="field-label">ใบรับของ</div><div class="field-value">${escapeHtml(bill.receiptDocNos.join(', ') || '-')}</div></div>
          </div>
        </div>
      </section>

      <table class="items">
        <thead>
          <tr>
            <th class="center rank-cell" style="width:5mm">#</th>
            <th style="width:36mm">สินค้า</th>
            <th>REMARK</th>
            <th class="num" style="width:19mm">นน.ก่อนหัก</th>
            <th class="num" style="width:17mm">นน.หัก</th>
            <th class="num" style="width:20mm">นน.สุทธิ</th>
            <th class="num" style="width:18mm">ราคา</th>
            <th class="num" style="width:22mm">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows(bill)}
          ${emptyRows(fillerRowCount(bill.allocationRows.length))}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" class="num">รวมทั้งสิ้น</td>
            <td class="num">${escapeHtml(grossSummaryText)}</td>
            <td class="num">${escapeHtml(deductSummaryText)}</td>
            <td class="num">${escapeHtml(totalSummaryText)}</td>
            <td></td>
            <td class="num final-amount">${money(bill.subtotal)}</td>
          </tr>
        </tfoot>
      </table>

      <div class="weight-summary">
        <div class="weight-card"><div class="label">น้ำหนักก่อนหักรวม</div><div class="value">${escapeHtml(grossSummaryText)}</div></div>
        <div class="weight-card"><div class="label">น้ำหนักหักรวม</div><div class="value">${escapeHtml(deductSummaryText)}</div></div>
        <div class="weight-card"><div class="label">น้ำหนักสุทธิรวม</div><div class="value">${escapeHtml(totalSummaryText)}</div></div>
      </div>

      <section class="bottom-grid">
        <div class="panel-group" style="display: flex; flex-direction: column; gap: 10px;">
          ${(bill.supplierBankAccounts && bill.supplierBankAccounts.length > 0) ? `
            <div class="panel">
              <div class="panel-title">เลขที่บัญชี / Bank Account</div>
              <div class="panel-body">
                ${bill.supplierBankAccounts.slice(0, 2).map((account, index) => `
                  <div style="font-size: 12px; ${index > 0 ? 'margin-top: 6px; border-top: 1px dashed #cbd5e1; padding-top: 6px;' : ''}">
                    <strong>${escapeHtml(account.paymentMethod)}</strong> · ${escapeHtml(account.bankName || '-')} · <span style="font-variant-numeric: tabular-nums;">${escapeHtml(account.accountNo || '-')}</span>
                    <div style="color: #475569; margin-top: 2px;">ชื่อบัญชี: ${escapeHtml(account.accountName || '-')} ${account.branchCode ? `· สาขา: ${escapeHtml(account.branchCode)}` : ''}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          <div class="panel">
            <div class="panel-title">หมายเหตุ</div>
            <div class="panel-body">
              <div class="note">${escapeHtml(plain(bill.note))}</div>
            </div>
          </div>
        </div>
        <div class="totals">
          <div class="total-row"><div>ยอดรวมรายการ</div><div class="num">${money(bill.subtotal)}</div></div>
          <div class="total-row"><div>หักส่วนลด</div><div class="num">${money(bill.discount)}</div></div>
          ${advanceBreakdownHtml}
          <div class="total-row"><div>${bill.hasVat ? 'ยอดที่ต้องจ่ายก่อน VAT' : 'ยอดที่ต้องจ่าย'}</div><div class="num">${money(postAdvanceTotals.taxableBaseAmount)}</div></div>
          ${bill.hasVat ? `<div class="total-row"><div>${escapeHtml(vatLabel)}</div><div class="num">${money(postAdvanceTotals.vatAmount)}</div></div>` : ''}
          <div class="total-row final"><div>${bill.hasVat ? 'ยอดสุทธิรวม VAT ที่ต้องจ่าย' : 'ยอดสุทธิที่ต้องจ่าย'}</div><div class="num">${money(postAdvanceTotals.totalAmount)}</div></div>
        </div>
      </section>

      <section class="signatures">
        <div class="sig"><div class="sig-line">ผู้ส่งสินค้า / Supplier</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้ตรวจรับ / ตรวจนับ</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้รับสินค้า / บริษัท</div><div>วันที่ ____ / ____ / ______</div></div>
      </section>
      <div class="footer">${escapeHtml(profile.footerNote || '')}</div>
    </main>
  </body></html>`
}

function writeLoading(printWindow: Window) {
  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมใบพิมพ์บิลรับซื้อ...</body></html>`)
  printWindow.document.close()
}

export function openPurchaseBillPrintWindow() {
  const printWindow = window.open('', '_blank', 'width=1200,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  writeLoading(printWindow)
  printWindow.focus()
  return printWindow
}

export async function openPurchaseBillPrint(bill: PurchaseBillDetail, targetWindow?: Window) {
  const printWindow = targetWindow ?? openPurchaseBillPrintWindow()
  const query = bill.branchId ? `?branchId=${encodeURIComponent(bill.branchId)}` : ''
  const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = companyProfileForPrint(payload)
  printWindow.document.open()
  printWindow.document.write(buildPurchaseBillPrintHtml(bill, profile))
  printWindow.document.close()
  printWindow.focus()
}
