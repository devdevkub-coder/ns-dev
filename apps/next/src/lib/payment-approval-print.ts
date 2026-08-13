import { companyProfileForPrint, type CompanyProfilePrintValues } from '@/lib/company-profile'
import { prepareCorporatePrintLayout } from './corporate-print-layout'
import { fetchCompanyProfileForPrint } from '@/lib/print-asset-prefetch'
import { formatDateDisplay } from '@/lib/format'
import { paginateStandardPrintItems } from './print-pagination'

type ApprovalStatus = 'approved' | 'pending' | 'voided'

type ApprovalDestinationOption = {
  accountNo: string
  bankName: string
  id: string
  kind: 'bank' | 'cash'
  label: string
  paymentMethod: string
}

type PrintPmaRow = {
  approvalDisplayDocNo: string | null
  approvalId: string | null
  approvalStatus: ApprovalStatus
  approvedAmount: number
  bankAccount?: string
  bankName?: string
  date: string
  destinationLabel: string
  docNo: string
  id: string
  paidAmount?: number
  payableBalance?: number
  sourceDocNo: string
  sourceLabel?: string
  sourceType: 'advance_payment' | 'purchase_bill' | 'expense' | 'petty_advance_return'
  supplierName?: string
  payee?: string
  totalAmount: number
  voidReason?: string | null
  voidedAt?: string | null
  dueDate?: string
  refDocNo?: string
  accountName?: string
  description?: string | null
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

function missing(value: string | null | undefined) {
  return value?.trim() || 'ไม่มีข้อมูล'
}

function companyInfo(profile: CompanyProfilePrintValues) {
  return [
    missing(profile.address),
    `โทร ${missing(profile.phone)}${profile.fax ? `  แฟกซ์ ${profile.fax}` : ''}`,
    `เลขประจำตัวผู้เสียภาษี ${missing(profile.taxId)}`,
    [profile.email ? `Email: ${profile.email}` : null, profile.website ? `Website: ${profile.website}` : null].filter(Boolean).join('  '),
  ].filter(Boolean).map(escapeHtml).join('<br>')
}

function amountToPay(row: PrintPmaRow) {
  return row.approvalStatus === 'pending' && row.payableBalance ? row.payableBalance : row.approvedAmount
}

function billRemain(row: PrintPmaRow) {
  return row.payableBalance ?? (row.totalAmount - (row.paidAmount ?? 0))
}

function payeeName(row: PrintPmaRow) {
  return row.supplierName || row.payee || '-'
}

function destinationText(row: PrintPmaRow) {
  return row.destinationLabel || row.accountName || ''
}

function normalizedGroupValue(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function paymentSummaryGroupKey(row: PrintPmaRow) {
  return `${normalizedGroupValue(payeeName(row))}::${normalizedGroupValue(destinationText(row))}`
}

function documentNo(row: PrintPmaRow) {
  if (row.approvalDisplayDocNo) return row.approvalDisplayDocNo
  if (row.approvalStatus !== 'pending' && row.docNo) return row.docNo
  return '-'
}

function referenceDocNo(row: PrintPmaRow) {
  return row.sourceDocNo || row.refDocNo || '-'
}

function bankAccountHtml(row: PrintPmaRow) {
  const destination = destinationText(row)
  if (destination && destination.includes(' / ')) {
    const parts = destination.split(' / ')
    if (parts.length >= 3) {
      return `<span class="font-semibold">${escapeHtml(parts[1])}</span> // <span class="font-bold">${escapeHtml(parts[2])}</span>`
    }
    return escapeHtml(destination)
  }
  if (destination && destination !== 'ยังไม่มีช่องทางจ่ายปลายทาง' && destination !== 'ยังไม่มีบัญชีจ่ายปลายทาง') {
    return escapeHtml(destination)
  }
  return '<span class="text-red font-bold text-xs">⚠ ไม่มี</span>'
}

function buildPaymentSummaryGroups(rows: PrintPmaRow[]) {
  const groupStats = new Map<string, {
    count: number
    paidAmount: number
    payableBalance: number
    payeeName: string
    destinationHtml: string
    totalAmount: number
    totalToPay: number
  }>()

  rows.forEach((row) => {
    const key = paymentSummaryGroupKey(row)
    const current = groupStats.get(key) ?? {
      count: 0,
      paidAmount: 0,
      payableBalance: 0,
      payeeName: payeeName(row),
      destinationHtml: bankAccountHtml(row),
      totalAmount: 0,
      totalToPay: 0,
    }
    current.count += 1
    current.totalAmount += row.totalAmount
    current.paidAmount += row.paidAmount ?? 0
    current.payableBalance += billRemain(row)
    current.totalToPay += amountToPay(row)
    groupStats.set(key, current)
  })

  const seenCounts = new Map<string, number>()
  return rows.map((row) => {
    const key = paymentSummaryGroupKey(row)
    const group = groupStats.get(key)
    const seen = (seenCounts.get(key) ?? 0) + 1
    seenCounts.set(key, seen)
    return {
      group,
      row,
      shouldRenderGroupSummary: Boolean(group && group.count > 1 && seen === group.count),
    }
  })
}

function sortedRowsForPaymentSummary(rows: PrintPmaRow[]) {
  const collator = new Intl.Collator('th-TH', { numeric: true, sensitivity: 'base' })
  return [...rows].sort((left, right) => {
    const groupCompare = collator.compare(paymentSummaryGroupKey(left), paymentSummaryGroupKey(right))
    if (groupCompare !== 0) return groupCompare
    const dateCompare = collator.compare(left.date ?? '', right.date ?? '')
    if (dateCompare !== 0) return dateCompare
    const sourceCompare = collator.compare(left.sourceDocNo ?? '', right.sourceDocNo ?? '')
    if (sourceCompare !== 0) return sourceCompare
    return collator.compare(left.docNo ?? '', right.docNo ?? '')
  })
}

export function thaiBahtText(num: number): string {
  if (isNaN(num) || num === null || num === undefined) return ''
  if (num === 0) return 'ศูนย์บาทถ้วน'
  
  const numberStr = num.toFixed(2)
  const [bahtStr, satangStr] = numberStr.split('.')
  
  let bahtText = convertToThaiText(bahtStr)
  let satangText = ''
  
  if (satangStr && satangStr !== '00') {
    satangText = convertToThaiText(satangStr) + 'สตางค์'
  }
  
  if (bahtText) {
    bahtText += 'บาท'
  }
  
  if (!bahtText && satangText) {
    return satangText
  }
  
  if (bahtText && !satangText) {
    return bahtText + 'ถ้วน'
  }
  
  return bahtText + satangText
}

function convertToThaiText(numberStr: string): string {
  const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน']
  let text = ''
  const length = numberStr.length
  
  for (let i = 0; i < length; i++) {
    const digit = parseInt(numberStr[i], 10)
    const position = length - 1 - i
    
    if (digit !== 0) {
      if (position % 6 === 1) {
        if (digit === 1) {
          text += 'สิบ'
        } else if (digit === 2) {
          text += 'ยี่สิบ'
        } else {
          text += digits[digit] + 'สิบ'
        }
      } else if (position % 6 === 0 && digit === 1 && length > 1 && i > 0 && numberStr[i - 1] !== '0') {
        text += 'เอ็ด'
      } else {
        text += digits[digit] + units[position % 6]
      }
    }
    
    if (position > 0 && position % 6 === 0) {
      text += 'ล้าน'
    }
  }
  
  return text
}

export function buildPmaSummaryPrintHtml(rows: PrintPmaRow[], profile: CompanyProfilePrintValues, modeLabel: string) {
  const currentDate = formatDateDisplay(new Date().toISOString().split('T')[0])
  const companyName = missing(profile.name).replace(/[\r\n]+/g, ' ').trim()
  const companyNameEn = profile.nameEn?.replace(/[\r\n]+/g, ' ').trim() || ''
  const logoHtml = profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo no-logo">ไม่มีข้อมูล</div>'
  const totalAmountToPay = rows.reduce((sum, row) => sum + amountToPay(row), 0)
  const sortedRows = sortedRowsForPaymentSummary(rows)
  const noteHeader = rows.some(r => r.sourceType === 'petty_advance_return') ? 'หมายเหตุ' : 'รายละเอียด'
  const isApMode = rows.some(r => r.sourceType === 'purchase_bill')

  type GroupedRow = ReturnType<typeof buildPaymentSummaryGroups>[number]
  type PaymentSummaryEntry =
    | { kind: 'approval'; row: PrintPmaRow; sourceIndex: number }
    | { group: NonNullable<GroupedRow['group']>; kind: 'group-total'; slotId: string }

  const entries: PaymentSummaryEntry[] = []
  buildPaymentSummaryGroups(sortedRows).forEach(({ group, row, shouldRenderGroupSummary }, sourceIndex) => {
    entries.push({ kind: 'approval', row, sourceIndex })
    if (shouldRenderGroupSummary && group) {
      entries.push({ group, kind: 'group-total', slotId: `group-${sourceIndex + 1}` })
    }
  })
  const pages = paginateStandardPrintItems(entries)

  function entryHtml(entry: PaymentSummaryEntry) {
    if (entry.kind === 'group-total') {
      return `
        <tr class="group-total" data-row-slot="${entry.slotId}">
          ${isApMode ? `
            <td></td>
            <td></td>
            <td></td>
            <td class="font-bold text-slate-900">${escapeHtml(entry.group.payeeName)} รวม</td>
            <td>${entry.group.destinationHtml}</td>
          ` : `
            <td></td>
            <td></td>
            <td class="font-bold text-slate-900">${escapeHtml(entry.group.payeeName)} รวม</td>
            <td></td>
            <td>${entry.group.destinationHtml}</td>
          `}
          <td class="num font-bold">${money(entry.group.totalAmount)}</td>
          <td class="num font-bold">${money(entry.group.paidAmount)}</td>
          <td class="num font-bold">${money(entry.group.payableBalance)}</td>
          <td class="num font-bold">${money(entry.group.totalToPay)}</td>
        </tr>
      `
    }

    const { row, sourceIndex } = entry
    return `
      <tr data-row-slot="${sourceIndex + 1}">
        <td class="font-medium">${escapeHtml(formatDateDisplay(row.date))}</td>
        ${isApMode ? `
          <td class="font-semibold text-slate-700">${escapeHtml(documentNo(row))}</td>
          <td class="font-semibold text-slate-700">${escapeHtml(referenceDocNo(row))}</td>
          <td class="font-bold text-slate-800">${escapeHtml(payeeName(row))}</td>
          <td>${bankAccountHtml(row)}</td>
        ` : `
          <td class="font-semibold text-slate-700">${escapeHtml(referenceDocNo(row))}</td>
          <td class="font-bold text-slate-800">${escapeHtml(payeeName(row))}</td>
          <td class="text-slate-700">${escapeHtml(row.description || '')}</td>
          <td>${bankAccountHtml(row)}</td>
        `}
        <td class="num font-semibold text-slate-700">${money(row.totalAmount)}</td>
        <td class="num text-slate-600">${money(row.paidAmount ?? 0)}</td>
        <td class="num font-semibold text-slate-700">${money(billRemain(row))}</td>
        <td class="num font-bold text-slate-900">${money(amountToPay(row))}</td>
      </tr>
    `
  }

  function emptyRowsHtml(count: number) {
    return Array.from({ length: count }, (_, index) => (
      `<tr class="empty" data-row-slot="empty-${index + 1}"><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`
    )).join('')
  }

  const pagesHtml = pages.map((page) => `
    <main class="page${page.pageNo > 1 ? ' page-break-before' : ''}" data-print-page="${page.pageNo}" data-final-page="${page.isFinalPage}">
      <section class="document-header">
        <div class="company">
          ${logoHtml}
          <div>
            <div class="company-name">${escapeHtml(companyName)}</div>
            ${companyNameEn ? `<div class="company-en">${escapeHtml(companyNameEn)}</div>` : ''}
            <div class="company-info">${companyInfo(profile)}</div>
          </div>
        </div>
        <div class="doc-head">
          <div class="doc-title">ใบอนุมัติจ่ายเงิน</div>
          <div class="doc-mode">${escapeHtml(modeLabel)}</div>
          <div class="page-label">หน้า ${page.pageNo} / ${page.totalPages}</div>
        </div>
      </section>

      <div class="meta-info">วันที่พิมพ์: ${currentDate} · จำนวน ${rows.length} รายการ</div>

      <table class="summary-table">
        <thead>
          <tr>
            <th style="width: 8%;">วันที่เอกสาร</th>
            ${isApMode ? `
              <th style="width: 11%;">เลขที่ PMA</th>
              <th style="width: 12%;">เอกสารอ้างอิง</th>
              <th style="width: 20%;">ผู้ขาย</th>
              <th style="width: 21%;">ช่องทางจ่าย / ปลายทาง</th>
            ` : `
              <th style="width: 11%;">เอกสารอ้างอิง</th>
              <th style="width: 18%;">ผู้รับเงิน</th>
              <th style="width: 17%;">${escapeHtml(noteHeader)}</th>
              <th style="width: 18%;">ช่องทางจ่าย / ปลายทาง</th>
            `}
            <th class="num" style="width: 10%;">ยอดเต็ม</th>
            <th class="num" style="width: 6%;">ชำระแล้ว</th>
            <th class="num" style="width: 6%;">คงเหลือ</th>
            <th class="num" style="width: 6%;">ยอดอนุมัติ</th>
          </tr>
        </thead>
        <tbody>
          ${page.items.map(entryHtml).join('')}
          ${emptyRowsHtml(page.emptyRowCount)}
        </tbody>
        ${page.isFinalPage ? `
        <tfoot data-page-totals="final">
          <tr>
            <td colspan="8" class="num">รวมทั้งสิ้น</td>
            <td class="num final-amount">${money(totalAmountToPay)}</td>
          </tr>
        </tfoot>
        ` : `
        <tfoot class="placeholder-total" data-page-totals="placeholder">
          <tr><td colspan="9">&nbsp;</td></tr>
        </tfoot>
        `}
      </table>

      ${page.isFinalPage ? `
      <section class="summary-grid">
        <div class="summary-panel">
          <div class="summary-label">จำนวนเงิน (ตัวอักษร)</div>
          <div class="summary-value">${escapeHtml(thaiBahtText(totalAmountToPay))}</div>
        </div>
        <div class="summary-panel amount-panel">
          <div class="summary-label">ยอดอนุมัติรวม</div>
          <div class="summary-value">${money(totalAmountToPay)} บาท</div>
        </div>
      </section>
      <section class="signatures" data-signatures="final">
        <div class="sig"><div class="sig-line">ผู้จัดทำ</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้ตรวจสอบ</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้อนุมัติ</div><div>วันที่ ____ / ____ / ______</div></div>
        <div class="sig"><div class="sig-line">ผู้จ่ายเงิน / Cashier</div><div>วันที่ ____ / ____ / ______</div></div>
      </section>
      ` : `
      <section class="summary-grid continuation-summary" data-continuation-summary="placeholder" aria-label="Continuation page summary placeholders">
        <div class="continuation-summary-panel">
          <div class="continuation-panel-title">สรุปการอนุมัติจ่าย</div>
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
      <footer class="footer"><span>${escapeHtml(profile.footerNote || '')}</span><span>หน้า ${page.pageNo} / ${page.totalPages}</span></footer>
    </main>
  `).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบอนุมัติโอนเงิน (Summary Print)</title>
    <style>
      @font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Regular.ttf') format('truetype'); font-style: normal; font-weight: 400; font-display: swap; }
      @font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Bold.ttf') format('truetype'); font-style: normal; font-weight: 500 900; font-display: swap; }
      
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #1e293b; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.35; background: #334155; padding: 16px 0; }
      
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px; background: #0f172a; color: white; position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
      .toolbar button { border: 0; border-radius: 6px; padding: 8px 18px; background: #2563eb; color: white; font: inherit; cursor: pointer; font-weight: bold; transition: all 0.2s ease; box-shadow: 0 2px 4px rgb(0 0 0 / 0.1); }
      .toolbar button:hover { background: #1d4ed8; }
      .toolbar button.secondary { background: #475569; }
      
      .page { width: 277mm; height: 190mm; min-height: 190mm; margin: 0 auto 16px; padding: 7mm; background: #fff; display: flex; flex-direction: column; box-shadow: 0 10px 25px -5px rgba(0,0,0,.3), 0 8px 10px -6px rgba(0,0,0,.2); border-radius: 4px; }
      .page-break-before { page-break-before: always !important; break-before: page !important; }
      .document-header { display: grid; grid-template-columns: 1.45fr .55fr; gap: 16px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 10px; }
      .company { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 10px; align-items: start; min-width: 0; }
      .logo { width: 58px; height: 58px; object-fit: contain; }
      .no-logo { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 11px; font-weight: 800; text-align: center; }
      .company-name { color: #0f172a; font-size: 17px; font-weight: 800; line-height: 1.25; white-space: nowrap; }
      .company-en { color: #475569; font-size: 11px; font-weight: 700; margin-top: 1px; }
      .company-info { color: #475569; font-size: 11px; line-height: 1.25; margin-top: 3px; }
      .doc-head { text-align: right; }
      .doc-title { color: #1e40af; font-size: 21px; font-weight: 900; }
      .doc-mode { color: #334155; font-size: 12px; font-weight: 700; margin-top: 2px; }
      .page-label { color: #1e40af; font-size: 12px; font-weight: 800; margin-top: 4px; }
      .meta-info { color: #475569; font-size: 11px; font-weight: 600; margin-top: 7px; }
      
      .summary-table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #cbd5e1; table-layout: fixed; }
      .summary-table th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; font-weight: 900; padding: 6px 5px; text-align: left; font-size: 12px; overflow-wrap: anywhere; word-break: break-word; }
      .summary-table td { border: 1px solid #dbe3ea; padding: 6px 5px; font-size: 12px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
      .summary-table tr { break-inside: avoid; page-break-inside: avoid; }
      .summary-table .num { text-align: right; font-variant-numeric: tabular-nums; }
      .summary-table .group-total td { background: #f1f5f9; border-top: 1px solid #94a3b8; border-bottom: 1px solid #cbd5e1; }
      .summary-table .empty td { height: 24px; color: transparent; }
      .summary-table tfoot td { background: #ecfdf5; color: #0f172a; font-weight: 900; border-top: 1px solid #cbd5e1; }
      .summary-table tfoot.placeholder-total td { height: 28px; background: #ffffff; color: transparent; }
      .summary-table tfoot .final-amount { color: #1e40af; font-size: 13px; }
      .summary-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 10px; }
      .summary-panel { min-height: 70px; border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 11px; background: #ffffff; }
      .summary-label { color: #64748b; font-size: 11px; }
      .summary-value { color: #0f172a; font-size: 13px; font-weight: 800; margin-top: 5px; }
      .amount-panel { text-align: right; }
      .continuation-summary-panel { min-height: 70px; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; padding: 8px; }
      .continuation-panel-title { font-weight: 900; color: #1e293b; }
      .continuation-placeholder { margin-top: 10px; color: #94a3b8; }
      .continuation-signature { min-height: 56px; margin-top: auto; display: flex; align-items: center; justify-content: center; color: #1e40af; font-size: 13px; font-weight: 800; text-align: center; }
      .signatures { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; margin-top: auto; }
      .sig { color: #475569; text-align: center; }
      .sig-line { border-top: 1px solid #94a3b8; color: #1e293b; font-weight: 800; margin-top: 24px; padding-top: 4px; }
      .footer { display: flex; justify-content: space-between; gap: 12px; border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 11px; margin-top: 5px; padding-top: 5px; }
      
      .text-red { color: #dc2626; }
      .text-slate-800 { color: #1e293b; }
      .text-slate-700 { color: #334155; }
      .text-slate-600 { color: #475569; }
      .font-semibold { font-weight: 600; }
      .font-bold { font-weight: 800; }
      .font-medium { font-weight: 500; }
      .text-xs { font-size: 12px; }
      
      @media print {
        @page { size: A4 landscape; margin: 10mm; }
        body { background: white; padding: 0; }
        .toolbar { display: none; }
        .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; border-radius: 0; }
        .summary-table th { background: #e2e8f0 !important; -webkit-print-color-adjust: exact; }
        .summary-table .group-total td { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; }
        .summary-table tfoot td { background: #ecfdf5 !important; -webkit-print-color-adjust: exact; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิดหน้านี้</button>
    </div>
    ${pagesHtml}
  </body></html>`
}

function writeLoading(printWindow: Window) {
  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมเอกสาร...</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมเอกสารใบอนุมัติจ่ายเงิน (PMA)...</body></html>`)
  printWindow.document.close()
}

export function openPmaPrintWindow() {
  const printWindow = window.open('', '_blank', 'width=1100,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  writeLoading(printWindow)
  printWindow.focus()
  return printWindow
}

export async function openPmaBatchPrint(rows: PrintPmaRow[], modeLabel: string, targetWindow?: Window) {
  const printWindow = targetWindow ?? openPmaPrintWindow()
  
  // โหลดข้อมูลบริษัท — อ่านจาก cache ที่อุ่นไว้ตอน hover ถ้ามี
  const payload = await fetchCompanyProfileForPrint()
  const profile = companyProfileForPrint(payload)
  
  printWindow.document.open()
  printWindow.document.write(buildPmaSummaryPrintHtml(rows, profile, modeLabel))
  printWindow.document.close()
  await prepareCorporatePrintLayout(printWindow.document, { orientation: 'landscape', fillContinuationFirst: true })
  printWindow.focus()
}
