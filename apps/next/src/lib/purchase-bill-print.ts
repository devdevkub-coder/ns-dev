import { companyProfileForPrint, type CompanyProfilePrintValues } from '@/lib/company-profile'
import { fetchCompanyProfileForPrint } from '@/lib/print-asset-prefetch'
import {
  paginatePurchaseBillPrintRows,
  parsePurchaseBillRemark,
  purchaseBillRowSegmentKey,
  type PurchaseBillPrintMeasurements,
  type PurchaseBillPrintPagePlan,
  type PurchaseBillPrintRowSegment,
} from './purchase-bill-print-layout'
import { calculatePurchaseBillPostAdvanceTotals } from '@/lib/purchase-advance'
import type { PurchaseBillDetail } from '@/lib/server/purchase-bill-detail'

type PurchaseBillPrintBuildOptions = {
  measurementMode?: boolean
  pagePlan?: PurchaseBillPrintPagePlan[]
}

const MAX_EXTRA_MEASUREMENT_SEGMENTS = 2_000
const REQUIRED_PRINT_FONTS = [
  "400 12px 'Noto Sans Thai'",
  "700 12px 'Noto Sans Thai'",
] as const
const PRINT_FONT_TEST_TEXT = 'กข123'

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

const PURCHASE_BILL_KILOGRAM_UNITS = new Set([
  'กก',
  'กก.',
  'กิโล',
  'กิโลกรัม',
  'กิโลกรัม.',
  'kg',
  'kg.',
  'kgs',
  'kgs.',
  'kilogram',
  'kilograms',
])

/** Keep equivalent kilogram snapshots readable and aligned in the PB table. */
export function normalizePurchaseBillPrintUnit(value: string | null | undefined) {
  const unit = value?.trim() ?? ''
  const comparableUnit = unit.toLocaleLowerCase('th-TH').replace(/\s+/g, '')
  return !comparableUnit || PURCHASE_BILL_KILOGRAM_UNITS.has(comparableUnit) ? 'กก.' : unit
}

/** Normalize unit words inside user-facing PB text without changing the stored snapshot. */
export function normalizePurchaseBillPrintText(value: string | null | undefined) {
  return String(value ?? '').replace(/กิโลกรัม\.?|กิโล\.?|กก\.?|kilograms?\.?|kgs?\.?/gi, 'กก.')
}

function missing(value: string | null | undefined) {
  return value?.trim() || 'ไม่มีข้อมูล'
}

function companyInfo(profile: CompanyProfilePrintValues, bill: PurchaseBillDetail) {
  const branchLabel = bill.branchName?.trim() ? `สาขา ${bill.branchName.trim()}` : ''
  return [
    missing(profile.address),
    `โทร ${missing(profile.phone)}${profile.fax ? `  แฟกซ์ ${profile.fax}` : ''}`,
    `เลขประจำตัวผู้เสียภาษี ${missing(profile.taxId)}${branchLabel ? ` · ${branchLabel}` : ''}`,
    [profile.email ? `Email: ${profile.email}` : null, profile.website ? `Website: ${profile.website}` : null].filter(Boolean).join('  '),
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

function totalsByUnit(bill: PurchaseBillDetail) {
  const byUnit = new Map<string, { deductWeight: number; grossWeight: number; qty: number }>()
  bill.allocationRows.forEach((row) => {
    const unit = normalizePurchaseBillPrintUnit(row.unit)
    const current = byUnit.get(unit) ?? { deductWeight: 0, grossWeight: 0, qty: 0 }
    current.deductWeight += row.deductWeight
    current.grossWeight += row.grossWeight
    current.qty += row.qty
    byUnit.set(unit, current)
  })
  return Array.from(byUnit.entries()).map(([unit, value]) => ({ ...value, unit }))
}

function unitSummaryNumbers(
  values: Array<{ unit: string } & Record<'deductWeight' | 'grossWeight' | 'qty', number>>,
  field: 'deductWeight' | 'grossWeight' | 'qty',
) {
  if (values.length === 0) return '-'
  return values.map((value) => (
    `<span class="unit-total-line">${escapeHtml(money(value[field]))}</span>`
  )).join('')
}

function unitSummaryLabels(values: Array<{ unit: string } & Record<'deductWeight' | 'grossWeight' | 'qty', number>>) {
  if (values.length === 0) return '-'
  return values.map((value) => (
    `<span class="unit-total-line">${escapeHtml(value.unit)}</span>`
  )).join('')
}

function tableColgroup() {
  return `
    <colgroup>
      <col style="width:8mm">
      <col style="width:29mm">
      <col style="width:48mm">
      <col style="width:20mm">
      <col style="width:17mm">
      <col style="width:22mm">
      <col style="width:13mm">
      <col style="width:17mm">
      <col style="width:20mm">
    </colgroup>
  `
}

function renderRemark(note: string, remarkStart: number, remarkEnd: number) {
  const remark = parsePurchaseBillRemark(note)
  if (remark.kind === 'plain') {
    return `<div class="remark-plain">${escapeHtml(normalizePurchaseBillPrintText(remark.text || '-'))}</div>`
  }

  return `<div class="remark-list">${remark.items.slice(remarkStart, remarkEnd).map((item, index) => `
    <div class="remark-item">
      <span class="remark-index">${remarkStart + index + 1}.</span>
      <span class="remark-text">${escapeHtml(normalizePurchaseBillPrintText(item))}</span>
    </div>
  `).join('')}</div>`
}

function renderItemRow(
  bill: PurchaseBillDetail,
  segment: PurchaseBillPrintRowSegment,
  measurementKey?: string,
) {
  const item = bill.allocationRows[segment.sourceIndex]
  if (!item) throw new Error(`ไม่พบรายการ PB ลำดับที่ ${segment.sourceIndex + 1}`)
  const continued = segment.remarkStart > 0
  const values = segment.showValues
  const quantityUnit = normalizePurchaseBillPrintUnit(item.unit)
  const measureAttribute = measurementKey ? ` data-measure-row="${escapeHtml(measurementKey)}"` : ''

  return `
    <tr class="item-row${continued ? ' item-row-continuation' : ''}" data-source-index="${segment.sourceIndex}" data-row-slot="${segment.sourceIndex + 1}"${measureAttribute}>
      <td class="center rank-cell">${segment.sourceIndex + 1}</td>
      <td><div class="item-name">${escapeHtml(item.productName)}${continued ? ' (ต่อ)' : ''}</div></td>
      <td>${renderRemark(item.note, segment.remarkStart, segment.remarkEnd)}</td>
      <td class="num">${values ? money(item.grossWeight) : ''}</td>
      <td class="num">${values ? money(item.deductWeight) : ''}</td>
      <td class="num strong">${values ? money(item.qty) : ''}</td>
      <td class="unit-cell">${values ? escapeHtml(quantityUnit) : ''}</td>
      <td class="num">${values ? money(item.price) : ''}</td>
      <td class="num strong">${values ? money(item.amount) : ''}</td>
    </tr>
  `
}

function renderEmptyRows(heights: readonly number[], measurement = false) {
  return heights.map((height, index) => (
    `<tr class="empty"${measurement ? ' data-measure-empty-row="true"' : ''} data-empty-row="${index + 1}" style="height:${Math.max(1, height).toFixed(2)}px"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
  )).join('')
}

function measurementSegments(bill: PurchaseBillDetail) {
  const segments: PurchaseBillPrintRowSegment[] = []
  let extraSegments = 0
  bill.allocationRows.forEach((row, sourceIndex) => {
    const remark = parsePurchaseBillRemark(row.note)
    if (remark.kind === 'plain') {
      segments.push({ measuredHeight: 0, remarkEnd: 0, remarkStart: 0, showValues: true, sourceIndex })
      return
    }

    const candidateCount = remark.items.length * (remark.items.length + 1) / 2
    const extraCandidateCount = Math.max(0, candidateCount - 1)
    if (extraSegments + extraCandidateCount > MAX_EXTRA_MEASUREMENT_SEGMENTS) {
      throw new Error('REMARK ของ PB มีรายการย่อยมากเกินกว่าระบบจัดหน้าได้อย่างปลอดภัย')
    }
    extraSegments += extraCandidateCount
    for (let start = 0; start < remark.items.length; start += 1) {
      for (let end = start + 1; end <= remark.items.length; end += 1) {
        segments.push({ measuredHeight: 0, remarkEnd: end, remarkStart: start, showValues: start === 0, sourceIndex })
      }
    }
  })
  return segments
}

export function buildPurchaseBillPrintHtml(
  bill: PurchaseBillDetail,
  profile: CompanyProfilePrintValues,
  options: PurchaseBillPrintBuildOptions = {},
) {
  const pagePlan = options.pagePlan ?? []
  const logoHtml = profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo no-logo">ไม่มีข้อมูล</div>'
  const cancelled = ['cancelled', 'cancelled_supplier_swap'].includes(bill.status)
  const title = 'บิลรับซื้อ'
  const totals = totalsByUnit(bill)
  const totalSummaryHtml = unitSummaryNumbers(totals, 'qty')
  const grossSummaryHtml = unitSummaryNumbers(totals, 'grossWeight')
  const deductSummaryHtml = unitSummaryNumbers(totals, 'deductWeight')
  const quantityUnitSummaryHtml = unitSummaryLabels(totals)
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

  function renderHeader(pageLabel = '') {
    return `
      <section class="header">
        <div class="company">
          ${logoHtml}
          <div>
            <div class="company-name">${escapeHtml(missing(profile.name).replace(/[\r\n]+/g, ' ').trim())}</div>
            ${profile.nameEn ? `<div class="company-en">${escapeHtml(profile.nameEn.replace(/[\r\n]+/g, ' ').trim())}</div>` : ''}
            <div class="company-info">${companyInfo(profile, bill)}</div>
          </div>
        </div>
        <div class="doc-head">
          <div class="doc-title">${escapeHtml(title)}</div>
          ${pageLabel ? `<div class="page-label">(${escapeHtml(pageLabel)})</div>` : ''}
        </div>
      </section>
    `
  }

  function renderSupplierDocSections() {
    return `
      <section class="section-grid">
        <div class="panel">
          <div class="panel-title">ข้อมูลผู้ขาย / Supplier</div>
          <div class="panel-body two-col">
            <div><div class="field-label">ชื่อผู้ขาย</div><div class="field-value">${escapeHtml(bill.supplierName)}</div></div>
            <div><div class="field-label">รหัสผู้ขาย</div><div class="field-value">${escapeHtml(bill.supplierCode)}</div></div>
            <div><div class="field-label">เลขผู้เสียภาษี</div><div class="field-value">${escapeHtml(plain(bill.supplierTaxId))}</div></div>
            <div><div class="field-label">ทะเบียนรถ</div><div class="field-value">${escapeHtml(plain(bill.licensePlate))}</div></div>
            <div class="full-field"><div class="field-label">ที่อยู่</div><div class="field-value">${escapeHtml(plain(bill.supplierAddress))}</div></div>
          </div>
        </div>
        <div class="panel">
          <div class="panel-title">ข้อมูลเอกสาร / Document Info</div>
          <div class="panel-body two-col">
            <div><div class="field-label">เลขที่เอกสาร</div><div class="field-value">${escapeHtml(bill.docNo)}</div></div>
            <div><div class="field-label">วันที่ส่ง / วันที่เอกสาร</div><div class="field-value">${escapeHtml(plain(bill.date))}</div></div>
            <div><div class="field-label">ผู้จัดทำ</div><div class="field-value">${escapeHtml(plain(bill.createdBy))}</div></div>
            <div><div class="field-label">Sale</div><div class="field-value">${escapeHtml(bill.salesName ? (bill.salesName.includes('@') ? bill.salesName.split('@')[0] : bill.salesName) : '-')}</div></div>
            <div><div class="field-label">ใบรับของ</div><div class="field-value">${escapeHtml(bill.receiptDocNos.join(', ') || '-')}</div></div>
          </div>
        </div>
      </section>
    `
  }

  function renderTableHead(pageNo = 1) {
    return `
      <thead>
        <tr>
          <th class="center rank-cell">#</th>
          <th>สินค้า${pageNo > 1 ? ' (ต่อ)' : ''}</th>
          <th>REMARK</th>
          <th class="num">นน.ก่อนหัก</th>
          <th class="num">นน.หัก</th>
          <th class="num">นน.สุทธิ</th>
          <th class="center unit-cell">หน่วย</th>
          <th class="num">ราคา</th>
          <th class="num">รวม</th>
        </tr>
      </thead>
    `
  }

  function renderTableFooter(placeholder: boolean) {
    if (placeholder) {
      return `
        <tfoot class="placeholder-total" data-page-totals="placeholder">
          <tr><td colspan="9">&nbsp;</td></tr>
        </tfoot>
      `
    }

    return `
      <tfoot data-page-totals="final">
        <tr>
          <td colspan="3" class="num table-total-label">รวมทั้งสิ้น</td>
          <td class="num unit-total-cell">${grossSummaryHtml}</td>
          <td class="num unit-total-cell">${deductSummaryHtml}</td>
          <td class="num unit-total-cell">${totalSummaryHtml}</td>
          <td class="unit-cell unit-total-cell">${quantityUnitSummaryHtml}</td>
          <td></td>
          <td class="num final-amount">${money(bill.subtotal)}</td>
        </tr>
      </tfoot>
    `
  }

  function renderBottomGridAndSignatures(placeholder: boolean, nextPageNo = 2) {
    if (placeholder) {
      return `
        <section class="bottom-grid continuation-summary" data-continuation-summary="placeholder" aria-label="Continuation page summary placeholders">
          <div class="continuation-summary-panel">
            <div class="continuation-panel-title">สรุปตามหมวดสินค้า</div>
            <div class="continuation-placeholder">-</div>
          </div>
          <div class="continuation-summary-panel">
            <div class="continuation-panel-title">หมายเหตุ</div>
            <div class="continuation-placeholder">-</div>
          </div>
        </section>
        <div class="continuation-signature" data-continuation-signature="true">
          ( มีต่อหน้า ${nextPageNo} / Continued on Page ${nextPageNo} ➔ )
        </div>
        <div class="footer">${escapeHtml(profile.footerNote || '')}</div>
      `
    }

    return `
      <section class="bottom-grid">
        <div class="panel-group">
          ${(bill.supplierBankAccounts && bill.supplierBankAccounts.length > 0) ? `
            <div class="panel">
              <div class="panel-title">เลขที่บัญชี / Bank Account</div>
              <div class="panel-body">
                ${bill.supplierBankAccounts.slice(0, 2).map((account, index) => `
                  <div class="bank-account${index > 0 ? ' bank-account-next' : ''}">
                    <strong>${escapeHtml(account.paymentMethod)}</strong> · ${escapeHtml(account.bankName || '-')} · <span class="tabular">${escapeHtml(account.accountNo || '-')}</span>
                    <div class="bank-account-detail">ชื่อบัญชี: ${escapeHtml(account.accountName || '-')} ${account.branchCode ? `· สาขา: ${escapeHtml(account.branchCode)}` : ''}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
          <div class="panel">
            <div class="panel-title">หมายเหตุ</div>
            <div class="panel-body"><div class="note">${escapeHtml(plain(bill.note))}</div></div>
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
      <section class="signature-zone">
        <section class="signatures" data-signatures="final">
          <div class="sig"><div class="sig-line">ผู้ส่งสินค้า / Supplier</div><div>วันที่ ____ / ____ / ______</div></div>
          <div class="sig"><div class="sig-line">ผู้ตรวจรับ / ตรวจนับ</div><div>วันที่ ____ / ____ / ______</div></div>
          <div class="sig"><div class="sig-line">ผู้รับสินค้า / บริษัท</div><div>วันที่ ____ / ____ / ______</div></div>
        </section>
        <div class="footer">${escapeHtml(profile.footerNote || '')}</div>
      </section>
    `
  }

  const pagesHtml = pagePlan.map((page) => `
    <main class="page${page.pageNo > 1 ? ' page-break-before' : ''}" data-print-page="${page.pageNo}" data-final-page="${page.isFinalPage}">
      <div class="watermark">${escapeHtml(bill.statusLabel)}</div>
      <div class="accent"></div>
      ${renderHeader(`หน้า ${page.pageNo} / ${page.totalPages}`)}
      ${renderSupplierDocSections()}
      <table class="items">
        ${tableColgroup()}
        ${renderTableHead(page.pageNo)}
        <tbody>
          ${page.rows.map((segment) => renderItemRow(bill, segment)).join('')}
          ${renderEmptyRows(page.emptyRowHeights)}
        </tbody>
        ${renderTableFooter(!page.isFinalPage)}
      </table>
      ${renderBottomGridAndSignatures(!page.isFinalPage, page.pageNo + 1)}
    </main>
  `).join('')

  const measurementHtml = options.measurementMode ? `
    <div class="measurement-status">กำลังวัดพื้นที่และจัดหน้า PB...</div>
    <div id="pb-measurement-root" aria-hidden="true">
      <div data-measure-content-box class="measure-content-box"></div>
      <div class="measure-width">
        <div data-measure-top class="measure-block">
          <div class="accent"></div>
          ${renderHeader('หน้า 1 / 1')}
          ${renderSupplierDocSections()}
        </div>
        <div data-measure-table-header class="measure-table-header">
          <table class="items measure-table">${tableColgroup()}${renderTableHead()}</table>
        </div>
        <table class="items measure-table measure-row-table">
          ${tableColgroup()}
          <tbody>
            ${measurementSegments(bill).map((segment) => renderItemRow(
              bill,
              segment,
              purchaseBillRowSegmentKey(segment.sourceIndex, segment.remarkStart, segment.remarkEnd),
            )).join('')}
          </tbody>
        </table>
        <table class="items measure-table measure-empty-table">
          ${tableColgroup()}
          <tbody>${renderEmptyRows([18], true)}</tbody>
        </table>
        <div data-measure-continuation-end class="measure-block measure-end-block">
          <table class="items measure-table">${tableColgroup()}${renderTableFooter(true)}</table>
          ${renderBottomGridAndSignatures(true, 2)}
        </div>
        <div data-measure-final-end class="measure-block measure-end-block">
          <table class="items measure-table">${tableColgroup()}${renderTableFooter(false)}</table>
          ${renderBottomGridAndSignatures(false)}
        </div>
      </div>
    </div>
  ` : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(bill.docNo)}</title>
    <style>
      @font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Regular.ttf') format('truetype'); font-style: normal; font-weight: 400; font-display: swap; }
      @font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Bold.ttf') format('truetype'); font-style: normal; font-weight: 700; font-display: swap; }
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.2; background: #334155; padding: 16px 0; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 10px; background: #0f172a; color: white; position: sticky; top: 0; z-index: 50; margin-top: -16px; margin-bottom: 16px; }
      .toolbar button { min-width: 154px; border: 0; border-radius: 6px; padding: 7px 14px; background: #15803d; color: white; font: inherit; cursor: pointer; font-weight: bold; }
      .toolbar button:disabled { cursor: wait; opacity: .55; }
      .toolbar button.secondary { min-width: 72px; background: #475569; }
      .toolbar-status { min-width: 178px; font-size: 12px; color: #cbd5e1; }
      .toolbar-status.error { color: #fecaca; font-weight: 700; }
      .page { width: 210mm; height: 297mm; min-height: 297mm; max-height: 297mm; margin: 0 auto 16px; padding: 8mm; overflow: hidden; background: white; position: relative; display: flex; flex-direction: column; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2); border-radius: 4px; }
      .page-break-before { page-break-before: always !important; break-before: page !important; }
      .accent { height: 4px; flex: 0 0 4px; background: linear-gradient(90deg, #166534, #65a30d, #cbd5e1); border-radius: 99px; margin-bottom: 7px; }
      .header { display: grid; grid-template-columns: 1.4fr .6fr; gap: 10px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 7px; }
      .company { display: grid; grid-template-columns: 48px 1fr; gap: 8px; align-items: start; min-width: 0; }
      .logo { width: 48px; height: 48px; object-fit: contain; }
      .no-logo { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 12px; font-weight: 800; text-align: center; }
      .company-name { font-size: 14px; font-weight: 900; color: #0f172a; line-height: 1.25; white-space: nowrap; }
      .company-en { font-size: 12px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 2px; color: #475569; font-size: 12px; line-height: 1.25; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 19px; font-weight: 900; color: #14532d; }
      .page-label { margin-top: 2px; color: #166534; font-size: 13px; font-weight: 700; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 7px; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 4px 7px; background: #f1f5f9; color: #334155; font-weight: 900; }
      .panel-body { padding: 5px 7px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; }
      .full-field { grid-column: 1 / -1; }
      .field-label { color: #64748b; font-size: 12px; }
      .field-value { font-weight: 750; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      table { width: 100%; border-collapse: collapse; }
      .items { flex: 0 0 auto; margin-top: 7px; font-size: 12px; table-layout: fixed; }
      .items thead { display: table-header-group; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 3px; text-align: left; font-weight: 900; overflow-wrap: normal; word-break: normal; }
      .items td { border: 1px solid #dbe3ea; padding: 3px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
      .items tr { break-inside: avoid; page-break-inside: avoid; }
      .items .empty td { height: inherit; min-height: 1px; padding-top: 0; padding-bottom: 0; color: transparent; }
      .items tfoot td { background: #ecfdf5; color: #0f172a; font-weight: 900; }
      .items tfoot.placeholder-total td { height: 28px; background: #ffffff; color: transparent; }
      .items tfoot .final-amount { color: #14532d; }
      .table-total-label { padding-right: 6px !important; }
      .unit-total-cell { padding: 3px 2px !important; font-size: 10.5px; }
      .unit-total-line { display: block; white-space: nowrap; }
      .item-name { font-weight: 850; color: #0f172a; }
      .item-row-continuation .item-name { color: #475569; }
      .remark-list { display: grid; gap: 1px; }
      .remark-item { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 3px; align-items: start; }
      .remark-index { white-space: nowrap; font-variant-numeric: tabular-nums; }
      .remark-text { min-width: 0; overflow-wrap: anywhere; }
      .remark-plain { white-space: pre-wrap; overflow-wrap: anywhere; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .unit-cell { text-align: center; white-space: nowrap; font-weight: 800; }
      .center { text-align: center !important; }
      .rank-cell { min-width: 8mm; padding-left: 2px !important; padding-right: 2px !important; white-space: nowrap; word-break: keep-all !important; overflow-wrap: normal !important; font-variant-numeric: tabular-nums; }
      .strong { font-weight: 900; }
      .bottom-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 7px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
      .panel-group { display: flex; flex-direction: column; gap: 10px; }
      .bank-account { font-size: 12px; }
      .bank-account-next { margin-top: 6px; border-top: 1px dashed #cbd5e1; padding-top: 6px; }
      .bank-account-detail { color: #475569; margin-top: 2px; }
      .tabular { font-variant-numeric: tabular-nums; }
      .continuation-summary-panel { min-height: 92px; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; padding: 8px; }
      .continuation-panel-title { font-weight: 900; color: #1e293b; }
      .continuation-placeholder { margin-top: 12px; color: #94a3b8; }
      .continuation-signature { min-height: 74px; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: bold; color: #166534; font-size: 13px; letter-spacing: 0.5px; }
      .note { min-height: 24px; color: #334155; white-space: pre-wrap; }
      .totals { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .total-row { display: grid; grid-template-columns: minmax(0, 1fr) 30mm; gap: 8px; padding: 3px 6px; border-bottom: 1px solid #e2e8f0; }
      .total-row:last-child { border-bottom: 0; }
      .total-row.final { background: #14532d; color: white; font-size: 12px; font-weight: 900; }
      .total-row.advance { color: #b45309; }
      .total-row.advance-sub { color: #0369a1; font-size: 12px; }
      .signature-zone { min-height: 30mm; margin-top: auto; display: flex; flex: 0 0 30mm; flex-direction: column; justify-content: flex-end; }
      .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; break-inside: avoid; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 3px; margin-top: 18px; font-weight: 800; color: #1e293b; }
      .footer { margin-top: 4px; text-align: center; color: #64748b; font-size: 12px; }
      .watermark { display: ${cancelled ? 'block' : 'none'}; position: absolute; top: 72mm; left: 54mm; transform: rotate(-18deg); color: rgba(100,116,139,.14); font-size: 54px; font-weight: 900; pointer-events: none; }
      .measurement-status { margin: 48px auto; width: fit-content; border-radius: 8px; background: #ffffff; padding: 16px 20px; color: #0f172a; font-weight: 700; box-shadow: 0 10px 25px -5px rgba(0,0,0,.3); }
      #pb-measurement-root { position: absolute; top: 0; left: -12000px; width: 194mm; visibility: hidden; pointer-events: none; }
      .measure-content-box { position: absolute; width: 194mm; height: 281mm; }
      .measure-width { width: 194mm; }
      .measure-block { display: flow-root; }
      .measure-table { margin-top: 0; }
      .measure-table-header { padding-top: 7px; }
      .measure-row-table, .measure-empty-table { margin-top: 0; }
      .measure-end-block { margin-top: 0; }
      @media print {
        *, *::before, *::after { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { background: white; padding: 0; }
        .toolbar, .measurement-status, #pb-measurement-root { display: none !important; }
        .page-break-before { break-before: auto !important; page-break-before: auto !important; }
        .page { width: 194mm; height: 281mm; min-height: 281mm; max-height: 281mm; padding: 0; margin: 0; overflow: hidden; box-shadow: none; border-radius: 0; break-after: page; page-break-after: always; }
        .page:last-of-type { break-after: auto; page-break-after: auto; }
      }
    </style>
  </head><body>
    ${options.measurementMode ? '' : `
      <div class="toolbar">
        <button type="button" data-pb-print-button disabled onclick="window.__printPurchaseBill && window.__printPurchaseBill()">พิมพ์ / Save as PDF</button>
        <button type="button" class="secondary" onclick="window.close()">ปิด</button>
        <span class="toolbar-status" data-pb-print-status>กำลังตรวจความพอดีของเอกสาร...</span>
      </div>
    `}
    ${pagesHtml}
    ${measurementHtml}
    ${options.measurementMode ? '' : `
      <script>
        window.__purchaseBillPagesFit = function () {
          return Array.from(document.querySelectorAll('[data-print-page]')).every(function (page) {
            return page.scrollHeight <= page.clientHeight + 1 && page.scrollWidth <= page.clientWidth + 1
          })
        }
        window.__printPurchaseBill = function () {
          var button = document.querySelector('[data-pb-print-button]')
          var status = document.querySelector('[data-pb-print-status]')
          if (!button || button.disabled) return
          if (!window.__purchaseBillPagesFit()) {
            button.disabled = true
            if (status) {
              status.textContent = 'เอกสารล้น A4 — ยังไม่เปิดให้พิมพ์'
              status.classList.add('error')
            }
            return
          }
          window.print()
        }
      </script>
    `}
  </body></html>`
}

function writeDocument(printWindow: Window, html: string) {
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
}

function writeLoading(printWindow: Window) {
  writeDocument(printWindow, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมใบพิมพ์บิลรับซื้อ...</body></html>`)
}

function writeLayoutError(printWindow: Window, message: string) {
  writeDocument(printWindow, `<!DOCTYPE html><html><head><meta charset="utf-8"><title>จัดหน้าไม่สำเร็จ</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a"><h1 style="font-size:20px;color:#b91c1c">จัดหน้าเอกสาร PB ไม่สำเร็จ</h1><p>${escapeHtml(message)}</p><p>ระบบยังไม่เปิดการพิมพ์ เพื่อป้องกันข้อมูลหรือลายเซ็นล้นออกนอก A4</p></body></html>`)
}

async function waitForRequiredPrintFonts(document: Document) {
  const fonts = document.fonts
  if (!fonts || typeof fonts.load !== 'function' || !fonts.ready) {
    throw new Error('Browser ไม่รองรับการตรวจสอบฟอนต์ Noto Sans Thai')
  }

  try {
    const loadedFaces = await Promise.all(REQUIRED_PRINT_FONTS.map((font) => fonts.load(font, PRINT_FONT_TEST_TEXT)))
    await fonts.ready
    if (loadedFaces.some((faces) => faces.length === 0 || faces.some((face) => face.status !== 'loaded'))) {
      throw new Error('required font face is not loaded')
    }
  } catch {
    throw new Error('โหลดฟอนต์ Noto Sans Thai ไม่สำเร็จ')
  }
}

export function waitForPurchaseBillPrintAssets(document: Document, timeoutMs = 8_000) {
  const images = Array.from(document.images)
  const imagePromises = images.map((image) => {
    if (image.complete) {
      return image.naturalWidth > 0 ? Promise.resolve() : Promise.reject(new Error('โหลดโลโก้บริษัทไม่สำเร็จ'))
    }
    return new Promise<void>((resolve, reject) => {
      image.addEventListener('load', () => resolve(), { once: true })
      image.addEventListener('error', () => reject(new Error('โหลดโลโก้บริษัทไม่สำเร็จ')), { once: true })
    })
  })
  const assetsReady = Promise.all([waitForRequiredPrintFonts(document), ...imagePromises]).then(() => undefined)
  let timeoutId: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(new Error('รอ font หรือโลโก้นานเกินกำหนด')), timeoutMs)
  })
  return Promise.race([assetsReady, timeout]).finally(() => globalThis.clearTimeout(timeoutId))
}

function measuredHeight(document: Document, selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  const height = element?.getBoundingClientRect().height ?? 0
  if (!Number.isFinite(height) || height <= 0) throw new Error(`วัดพื้นที่ ${selector} ไม่สำเร็จ`)
  return height
}

function measurePurchaseBillPrintDocument(document: Document): PurchaseBillPrintMeasurements {
  const segmentHeights: Record<string, number> = {}
  document.querySelectorAll<HTMLElement>('[data-measure-row]').forEach((row) => {
    const key = row.dataset.measureRow
    const height = row.getBoundingClientRect().height
    if (key && Number.isFinite(height) && height > 0) segmentHeights[key] = height
  })

  return {
    continuationEndHeight: measuredHeight(document, '[data-measure-continuation-end]'),
    emptyRowMinimumHeight: measuredHeight(document, '[data-measure-empty-row]'),
    finalEndHeight: measuredHeight(document, '[data-measure-final-end]'),
    pageContentHeight: measuredHeight(document, '[data-measure-content-box]'),
    safetyGap: 2,
    segmentHeights,
    tableHeaderHeight: measuredHeight(document, '[data-measure-table-header]'),
    topHeight: measuredHeight(document, '[data-measure-top]'),
  }
}

function overflowingPageNumbers(document: Document) {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-print-page]'))
    .filter((page) => page.scrollHeight > page.clientHeight + 1 || page.scrollWidth > page.clientWidth + 1)
    .map((page) => page.dataset.printPage ?? '?')
}

function enablePurchaseBillPrint(document: Document) {
  const button = document.querySelector<HTMLButtonElement>('[data-pb-print-button]')
  const status = document.querySelector<HTMLElement>('[data-pb-print-status]')
  if (!button || !status) throw new Error('ไม่พบปุ่มพิมพ์หรือสถานะการจัดหน้า')
  button.disabled = false
  status.textContent = 'พร้อมพิมพ์ · A4 portrait'
  status.classList.remove('error')
  document.body.dataset.layoutReady = 'true'
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
  try {
    // Reads from the short-lived in-memory cache warmed on hover when available.
    const payload = await fetchCompanyProfileForPrint(bill.branchId)
    const profile = companyProfileForPrint(payload)

    writeDocument(printWindow, buildPurchaseBillPrintHtml(bill, profile, { measurementMode: true }))
    await waitForPurchaseBillPrintAssets(printWindow.document)
    const measurements = measurePurchaseBillPrintDocument(printWindow.document)
    const pagePlan = paginatePurchaseBillPrintRows(bill.allocationRows.map((row) => row.note), measurements)

    writeDocument(printWindow, buildPurchaseBillPrintHtml(bill, profile, { pagePlan }))
    await waitForPurchaseBillPrintAssets(printWindow.document)
    const overflow = overflowingPageNumbers(printWindow.document)
    if (overflow.length > 0) {
      throw new Error(`หน้า ${overflow.join(', ')} มีเนื้อหาล้นกรอบ A4`)
    }

    enablePurchaseBillPrint(printWindow.document)
    printWindow.focus()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
    writeLayoutError(printWindow, message)
    printWindow.focus()
    throw error
  }
}
