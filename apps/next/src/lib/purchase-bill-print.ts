import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileSchema, emptyCompanyProfile, type CompanyProfileFormValues } from '@/lib/company-profile'
import type { PurchaseBillDetail } from '@/lib/server/purchase-bill-detail'

const companyProfilePayloadSchema = z.object({
  profile: companyProfileSchema,
})

const DEFAULT_COMPANY_LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <rect width="180" height="180" rx="24" fill="#f8fafc"/>
  <rect x="14" y="14" width="152" height="152" rx="18" fill="#ffffff" stroke="#cbd5e1" stroke-width="3"/>
  <path d="M48 129V48h23l39 49V48h24v81h-22L72 79v50H48z" fill="#14532d"/>
  <path d="M51 136c30 11 61 11 92-2" fill="none" stroke="#a16207" stroke-width="8" stroke-linecap="round"/>
</svg>
`)}`

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

function sourceSummary(bill: PurchaseBillDetail) {
  const sourceKinds = new Set(bill.allocationRows.map((row) => row.poDocNo ? 'PO' : 'Spot'))
  return Array.from(sourceKinds).join(' / ') || '-'
}

function companyInfo(profile: CompanyProfileFormValues) {
  return [
    profile.address,
    `โทร ${profile.phone || '-'}${profile.fax ? `  แฟกซ์ ${profile.fax}` : ''}`,
    `เลขประจำตัวผู้เสียภาษี ${profile.taxId || '-'}${profile.branchCode ? `  สาขา ${profile.branchCode}` : ''}`,
    [profile.email ? `Email: ${profile.email}` : null, profile.website ? `Website: ${profile.website}` : null].filter(Boolean).join('  '),
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

function itemRows(bill: PurchaseBillDetail) {
  return bill.allocationRows.map((item) => `
    <tr class="item-row">
      <td class="center">${item.lineNo}</td>
      <td>
        <div class="item-name">${escapeHtml(item.productName)}</div>
        <div class="muted">${escapeHtml([item.productCode || null, item.poDocNo ?? 'Spot Buy', item.receiptTicketDocNo !== '-' ? item.receiptTicketDocNo : null].filter(Boolean).join(' · '))}</div>
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

export function buildPurchaseBillPrintHtml(bill: PurchaseBillDetail, profile: CompanyProfileFormValues) {
  const logoUrl = profile.logoUrl || DEFAULT_COMPANY_LOGO
  const cancelled = ['cancelled', 'cancelled_supplier_swap'].includes(bill.status)
  const title = 'ใบรับสินค้า / บิลรับซื้อ'
  const totals = totalsByUnit(bill)
  const totalSummaryText = totals.map((item) => `${money(item.qty)} ${item.unit}`).join(' / ') || '-'
  const grossSummaryText = totals.map((item) => `${money(item.grossWeight)} ${item.unit}`).join(' / ') || '-'
  const deductSummaryText = totals.map((item) => `${money(item.deductWeight)} ${item.unit}`).join(' / ') || '-'

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(bill.docNo)}</title>
    <style>
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 11px; line-height: 1.35; background: #f8fafc; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #15803d; color: white; font: inherit; cursor: pointer; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 277mm; min-height: 190mm; margin: 0 auto; padding: 7mm; background: white; position: relative; }
      .print-only { display: none; }
      .accent { height: 4px; background: linear-gradient(90deg, #166534, #65a30d, #cbd5e1); border-radius: 99px; margin-bottom: 12px; }
      .header { display: grid; grid-template-columns: 1fr 1.1fr; gap: 16px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
      .company { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: start; min-width: 0; }
      .logo { width: 64px; height: 64px; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px; }
      .company-name { font-size: 16px; font-weight: 800; color: #0f172a; }
      .company-en { font-size: 10px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 4px; color: #475569; font-size: 10px; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 22px; font-weight: 900; color: #14532d; letter-spacing: 0; }
      .doc-sub { color: #475569; font-size: 10px; margin-top: 2px; }
      .doc-grid { margin-top: 8px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; text-align: left; }
      .kv { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 7px; background: #f8fafc; }
      .kv .label { color: #64748b; font-size: 9px; }
      .kv .value { font-weight: 800; color: #0f172a; margin-top: 1px; }
      .status { display: inline-flex; border-radius: 999px; padding: 3px 9px; background: #ecfdf5; color: #166534; font-weight: 800; }
      .status.cancelled { background: #f1f5f9; color: #475569; }
      .section-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 12px; margin-top: 12px; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 6px 9px; background: #f1f5f9; color: #334155; font-weight: 900; }
      .panel-body { padding: 8px 9px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; }
      .field-label { color: #64748b; font-size: 9px; }
      .field-value { font-weight: 750; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; }
      .items { margin-top: 12px; font-size: 10px; break-inside: auto; page-break-inside: auto; }
      .items thead { display: table-header-group; }
      .items tbody { break-inside: auto; page-break-inside: auto; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 6px 5px; text-align: left; font-weight: 900; }
      .items td { border: 1px solid #dbe3ea; padding: 6px 5px; vertical-align: top; }
      .items tr { break-inside: avoid; page-break-inside: avoid; }
      .items .repeat-head th { background: #f8fafc; color: #334155; font-size: 9px; font-weight: 800; padding: 4px 6px; }
      .items .empty td { height: 24px; color: transparent; }
      .item-name { font-weight: 850; color: #0f172a; }
      .muted { color: #64748b; font-size: 9px; margin-top: 1px; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .center { text-align: center; }
      .strong { font-weight: 900; }
      .bottom-grid { display: grid; grid-template-columns: minmax(0, 1fr) 85mm; gap: 12px; margin-top: 12px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
      .note { min-height: 42px; color: #334155; white-space: pre-wrap; }
      .totals { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .total-row { display: grid; grid-template-columns: 1fr 34mm; gap: 8px; padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
      .total-row:last-child { border-bottom: 0; }
      .total-row.final { background: #14532d; color: white; font-size: 13px; font-weight: 900; }
      .total-row.advance { color: #b45309; }
      .weight-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
      .weight-card { border: 1px solid #dbe3ea; border-radius: 8px; padding: 7px; background: #f8fafc; }
      .weight-card .label { color: #64748b; font-size: 9px; }
      .weight-card .value { font-size: 12px; font-weight: 900; color: #0f172a; margin-top: 2px; }
      .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 20px; break-inside: avoid; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 5px; margin-top: 28px; font-weight: 800; color: #1e293b; }
      .footer { margin-top: 8px; text-align: center; color: #64748b; font-size: 9px; }
      .watermark { display: ${cancelled ? 'block' : 'none'}; position: absolute; top: 72mm; left: 54mm; transform: rotate(-18deg); color: rgba(100,116,139,.14); font-size: 54px; font-weight: 900; pointer-events: none; }
      @media print {
        body { background: white; }
        .toolbar { display: none; }
        .page { width: auto; min-height: auto; padding: 0; }
        .print-only { display: initial; }
        .header, .section-grid { break-inside: avoid; page-break-inside: avoid; }
        .items { page-break-before: auto; }
        .items .repeat-head { display: table-row; }
        .items .empty { display: none; }
        .bottom-grid { break-before: auto; page-break-before: auto; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิด</button>
      <span style="font-size:11px;color:#cbd5e1">A4 landscape corporate print</span>
    </div>
    <main class="page">
      <div class="watermark">${escapeHtml(bill.statusLabel)}</div>
      <div class="accent"></div>
      <section class="header">
        <div class="company">
          <img class="logo" src="${escapeHtml(logoUrl)}" alt="Company logo">
          <div>
            <div class="company-name">${escapeHtml(profile.name || 'New Solutions (Thailand) Co., Ltd.')}</div>
            ${profile.nameEn ? `<div class="company-en">${escapeHtml(profile.nameEn)}</div>` : ''}
            <div class="company-info">${companyInfo(profile)}</div>
          </div>
        </div>
        <div class="doc-head">
          <div class="doc-title">${escapeHtml(title)}</div>
          <div class="doc-sub">Purchase receipt note generated from NS Scrap ERP</div>
          <div class="doc-grid">
            <div class="kv"><div class="label">เลขที่เอกสาร</div><div class="value">${escapeHtml(bill.docNo)}</div></div>
            <div class="kv"><div class="label">สถานะ</div><div class="value"><span class="status ${cancelled ? 'cancelled' : ''}">${escapeHtml(bill.statusLabel)}</span></div></div>
            <div class="kv"><div class="label">วันที่ส่ง / วันที่เอกสาร</div><div class="value">${escapeHtml(plain(bill.date))}</div></div>
            <div class="kv"><div class="label">เวลา</div><div class="value">-</div></div>
          </div>
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
            <div><div class="field-label">สาขา</div><div class="field-value">${escapeHtml(bill.branchName)}</div></div>
            <div><div class="field-label">คลัง</div><div class="field-value">${escapeHtml(plain(bill.warehouseName))}</div></div>
            <div><div class="field-label">ประเภท</div><div class="field-value">${escapeHtml(bill.transactionMode)}</div></div>
            <div><div class="field-label">แหล่งซื้อ</div><div class="field-value">${escapeHtml(sourceSummary(bill))}</div></div>
            <div><div class="field-label">ผู้จัดทำ</div><div class="field-value">${escapeHtml(plain(bill.createdBy))}</div></div>
            <div><div class="field-label">Sale</div><div class="field-value">${escapeHtml(plain(bill.salesName))}</div></div>
            <div><div class="field-label">อ้างอิง</div><div class="field-value">${escapeHtml(plain(bill.refNo))}</div></div>
            <div><div class="field-label">ใบรับของ</div><div class="field-value">${escapeHtml(bill.receiptDocNos.join(', ') || '-')}</div></div>
          </div>
        </div>
      </section>

      <table class="items">
        <thead>
          <tr class="repeat-head">
            <th colspan="8">
              ${escapeHtml(title)} · ${escapeHtml(bill.docNo)} · ${escapeHtml(bill.supplierName)} · ${escapeHtml(plain(bill.date))}
              <span class="print-only"> · รายการสินค้าอาจต่อหลายหน้า</span>
            </th>
          </tr>
          <tr>
            <th class="center" style="width:9mm">#</th>
            <th style="width:50mm">สินค้า</th>
            <th>REMARK</th>
            <th class="num" style="width:25mm">นน.ก่อนหัก</th>
            <th class="num" style="width:23mm">นน.หัก</th>
            <th class="num" style="width:26mm">นน.สุทธิ</th>
            <th class="num" style="width:24mm">ราคา</th>
            <th class="num" style="width:30mm">รวม</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows(bill)}
          ${emptyRows(6 - bill.allocationRows.length)}
        </tbody>
      </table>

      <div class="weight-summary">
        <div class="weight-card"><div class="label">น้ำหนักก่อนหักรวม</div><div class="value">${escapeHtml(grossSummaryText)}</div></div>
        <div class="weight-card"><div class="label">น้ำหนักหักรวม</div><div class="value">${escapeHtml(deductSummaryText)}</div></div>
        <div class="weight-card"><div class="label">น้ำหนักสุทธิรวม</div><div class="value">${escapeHtml(totalSummaryText)}</div></div>
      </div>

      <section class="bottom-grid">
        <div class="panel">
          <div class="panel-title">หมายเหตุ / Reference</div>
          <div class="panel-body">
            <div class="note">${escapeHtml(plain(bill.note))}</div>
            <div class="muted">VAT Invoice: ${escapeHtml(plain(bill.vatInvoiceNo))} · วันที่ ${escapeHtml(plain(bill.vatInvoiceDate))} · Supplier Ref: ${escapeHtml(plain(bill.refNo))}</div>
          </div>
        </div>
        <div class="totals">
          <div class="total-row"><div>ยอดเงินรวม</div><div class="num">${money(bill.subtotal)}</div></div>
          <div class="total-row"><div>หักส่วนลด</div><div class="num">${money(bill.discount)}</div></div>
          <div class="total-row advance"><div>หักเงินมัดจำ / ADV</div><div class="num">${money(bill.advanceAllocatedAmount)}</div></div>
          <div class="total-row"><div>VAT</div><div class="num">${money(bill.vatAmount)}</div></div>
          <div class="total-row final"><div>ยอดรวมทั้งสิ้น</div><div class="num">${money(bill.totalAmount)}</div></div>
          <div class="total-row"><div>ค้างชำระ</div><div class="num strong">${money(bill.payableBalance)}</div></div>
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
  const response = await fetch('/api/admin/company-profile', { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = payload.profile ?? emptyCompanyProfile
  printWindow.document.open()
  printWindow.document.write(buildPurchaseBillPrintHtml(bill, profile))
  printWindow.document.close()
  printWindow.focus()
}
