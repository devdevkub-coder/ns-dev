import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'
import { formatDateDisplay } from '@/lib/format'

const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

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
  const totalAmountToPay = rows.reduce((sum, row) => sum + amountToPay(row), 0)
  const sortedRows = sortedRowsForPaymentSummary(rows)

  const rowsHtml = buildPaymentSummaryGroups(sortedRows).map(({ group, row, shouldRenderGroupSummary }) => {
    const payee = payeeName(row)
    const billTotal = row.totalAmount
    const billPaid = row.paidAmount ?? 0
    const remaining = billRemain(row)

    const rowHtml = `
      <tr>
        <td class="font-medium">${escapeHtml(formatDateDisplay(row.date))}</td>
        <td class="font-semibold text-slate-700">${escapeHtml(documentNo(row))}</td>
        <td class="font-semibold text-slate-700">${escapeHtml(referenceDocNo(row))}</td>
        <td class="font-bold text-slate-800">${escapeHtml(payee)}</td>
        <td>${bankAccountHtml(row)}</td>
        <td class="num font-semibold text-slate-700">${money(billTotal)}</td>
        <td class="num text-slate-600">${money(billPaid)}</td>
        <td class="num font-semibold text-slate-700">${money(remaining)}</td>
        <td class="num font-bold text-slate-900">${money(amountToPay(row))}</td>
      </tr>
    `
    if (!shouldRenderGroupSummary || !group) return rowHtml

    return `${rowHtml}
      <tr class="group-total">
        <td></td>
        <td></td>
        <td></td>
        <td class="font-bold text-slate-900">${escapeHtml(group.payeeName)} รวม</td>
        <td>${group.destinationHtml}</td>
        <td class="num font-bold">${money(group.totalAmount)}</td>
        <td class="num font-bold">${money(group.paidAmount)}</td>
        <td class="num font-bold">${money(group.payableBalance)}</td>
        <td class="num font-bold">${money(group.totalToPay)}</td>
      </tr>
    `
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบอนุมัติโอนเงิน (Summary Print)</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap');
      
      @page { size: A4 landscape; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #1e293b; font-family: 'Noto Sans Thai', 'Outfit', sans-serif; font-size: 12px; line-height: 1.45; background: #fff; }
      
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px; background: #0f172a; color: white; position: sticky; top: 0; z-index: 100; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
      .toolbar button { border: 0; border-radius: 6px; padding: 8px 18px; background: #2563eb; color: white; font: inherit; cursor: pointer; font-weight: bold; transition: all 0.2s ease; box-shadow: 0 2px 4px rgb(0 0 0 / 0.1); }
      .toolbar button:hover { background: #1d4ed8; }
      .toolbar button.secondary { background: #475569; }
      
      .page { padding: 15px 25px; }
      
      .header-title { font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 4px; }
      .sub-title { font-size: 16px; font-weight: 700; color: #0f172a; display: flex; align-items: center; gap: 6px; margin-bottom: 6px; color: #1e40af; }
      .meta-info { font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 12px; }
      .meta-info .total { color: #dc2626; }
      
      .summary-table { width: 100%; border-collapse: collapse; margin-top: 10px; border: 1px solid #cbd5e1; }
      .summary-table th { background: #f8fafc; border: 1px solid #cbd5e1; color: #334155; font-weight: 800; padding: 10px; text-align: left; font-size: 12px; }
      .summary-table td { border: 1px solid #e2e8f0; padding: 8px 10px; font-size: 12px; }
      .summary-table .num { text-align: right; font-variant-numeric: tabular-nums; }
      .summary-table .group-total td { background: #f1f5f9; border-top: 2px solid #94a3b8; border-bottom: 2px solid #cbd5e1; }
      
      .summary-table tfoot td { background: #f8fafc; font-weight: 800; border-top: 2px solid #94a3b8; }
      
      .text-red { color: #dc2626; }
      .text-slate-800 { color: #1e293b; }
      .text-slate-700 { color: #334155; }
      .text-slate-600 { color: #475569; }
      .font-semibold { font-weight: 600; }
      .font-bold { font-weight: 800; }
      .font-medium { font-weight: 500; }
      .text-xs { font-size: 11px; }
      
      @media print {
        @page { size: A4 landscape; margin: 10mm; }
        .toolbar { display: none; }
        .page { padding: 0; }
        .summary-table th { background: #f8fafc !important; -webkit-print-color-adjust: exact; }
        .summary-table .group-total td { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; }
        .summary-table tfoot td { background: #f8fafc !important; -webkit-print-color-adjust: exact; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์เอกสารสรุป / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิดหน้านี้</button>
    </div>
    <main class="page">
      <div class="header-title">${escapeHtml(missing(profile.name))}</div>
      <div class="sub-title">📋 ใบอนุมัติโอนเงิน — ${escapeHtml(modeLabel)}</div>
      <div class="meta-info">วันที่: ${currentDate} • จำนวน ${rows.length} รายการ • รวม <span class="total">${money(totalAmountToPay)} บาท</span></div>
      
      <table class="summary-table">
        <thead>
          <tr>
            <th style="width: 8%;">วันที่ PMA</th>
            <th style="width: 11%;">เลขที่เอกสาร</th>
            <th style="width: 12%;">เอกสารอ้างอิง</th>
            <th style="width: 20%;">Supplier</th>
            <th style="width: 21%;">เลขบัญชีธนาคาร</th>
            <th class="num" style="width: 10%;">ยอดเต็ม</th>
            <th class="num" style="width: 6%;">ชำระแล้ว</th>
            <th class="num" style="width: 6%;">คงเหลือ</th>
            <th class="num" style="width: 6%;">ยอดที่จะจ่าย</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="8" class="num" style="font-size: 14px;">รวมทั้งสิ้น:</td>
            <td class="num" style="font-size: 13px; color: #000;">
              <div style="font-weight: 900; padding-bottom: 2px;">${money(totalAmountToPay)}</div>
              <div style="font-size: 10px; font-weight: bold; color: #475569;">บาท</div>
            </td>
          </tr>
        </tfoot>
      </table>
    </main>
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
  
  // โหลดข้อมูลบริษัท (ข้อมูลโปรไฟล์)
  const response = await fetch('/api/admin/company-profile', { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = companyProfileForPrint(payload)
  
  printWindow.document.open()
  printWindow.document.write(buildPmaSummaryPrintHtml(rows, profile, modeLabel))
  printWindow.document.close()
  printWindow.focus()
}
