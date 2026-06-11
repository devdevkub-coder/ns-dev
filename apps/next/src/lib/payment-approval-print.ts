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
  sourceType: 'advance_payment' | 'purchase_bill' | 'expense'
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
  const totalAmountToPay = rows.reduce((sum, row) => sum + (row.approvalStatus === 'pending' && row.payableBalance ? row.payableBalance : row.approvedAmount), 0)

  const rowsHtml = rows.map((row) => {
    const isPending = row.approvalStatus === 'pending'
    const payeeName = row.supplierName || row.payee || '-'
    const destinationText = row.destinationLabel || row.accountName || ''
    
    // จัดการบัญชีธนาคาร
    let bankAccountHtml = '<span class="text-red font-bold text-xs">⚠ ไม่มี</span>'
    if (destinationText && destinationText.includes(' / ')) {
       const parts = destinationText.split(' / ')
       if (parts.length >= 3) {
          bankAccountHtml = `<span class="font-semibold">${escapeHtml(parts[1])}</span> // <span class="font-bold">${escapeHtml(parts[2])}</span>`
       } else {
          bankAccountHtml = escapeHtml(destinationText)
       }
    } else if (destinationText && destinationText !== 'ยังไม่มีช่องทางจ่ายปลายทาง' && destinationText !== 'ยังไม่มีบัญชีจ่ายปลายทาง') {
       bankAccountHtml = escapeHtml(destinationText)
    }

    const amountToPay = isPending && row.payableBalance ? row.payableBalance : row.approvedAmount
    const billTotal = row.totalAmount
    const billPaid = row.paidAmount ?? 0
    const billRemain = row.payableBalance ?? (billTotal - billPaid)

    return `
      <tr>
        <td class="font-medium">${escapeHtml(formatDateDisplay(row.date))}</td>
        <td class="font-bold text-slate-800">${escapeHtml(payeeName)}</td>
        <td>${bankAccountHtml}</td>
        <td class="num font-semibold text-slate-700">${money(billTotal)}</td>
        <td class="num text-slate-600">${money(billPaid)}</td>
        <td class="num font-semibold text-slate-700">${money(billRemain)}</td>
        <td class="num font-bold text-slate-900">${money(amountToPay)}</td>
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
            <th style="width: 10%;">วันที่</th>
            <th style="width: 25%;">Supplier</th>
            <th style="width: 25%;">เลขบัญชีธนาคาร</th>
            <th class="num" style="width: 10%;">ยอดเต็ม</th>
            <th class="num" style="width: 10%;">ชำระแล้ว</th>
            <th class="num" style="width: 10%;">คงเหลือ</th>
            <th class="num" style="width: 10%;">ยอดที่จะจ่าย</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="6" class="num" style="font-size: 14px;">รวมทั้งสิ้น:</td>
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
