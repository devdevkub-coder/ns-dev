import { companyProfileForPrint, type CompanyProfilePrintValues } from '@/lib/company-profile'
import { prepareCorporatePrintLayout } from './corporate-print-layout'
import { fetchCompanyProfileForPrint } from '@/lib/print-asset-prefetch'
import { paginateStandardPrintItems } from '@/lib/print-pagination'

const CASH_PAYMENT_METHOD = 'รับเงินสด'

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
  supplierCode?: string
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

function selectedSupplierBankAccount(row: ReceiptVoucherPrintDocument) {
  const paymentMethod = row.paymentMethod?.trim()
  if (!paymentMethod || paymentMethod === CASH_PAYMENT_METHOD) return null
  const matchedAccount = row.supplierBankAccounts?.find((account) => {
    const accountNo = account.accountNo.trim()
    const methodWithAccount = `${account.paymentMethod} บช.${accountNo}`
    return paymentMethod === methodWithAccount || Boolean(accountNo && paymentMethod.includes(accountNo))
  })
  if (matchedAccount) return matchedAccount

  const accountMatch = paymentMethod.match(/^(.*?)\s*บช\.?\s*(.+)$/)
  if (!accountMatch) return null
  return {
    accountName: '',
    accountNo: accountMatch[2]?.trim() ?? '',
    bankName: '',
    branchCode: '',
    code: '',
    isPrimary: false,
    paymentMethod: accountMatch[1]?.trim() || paymentMethod,
  }
}

function buildReceiptVoucherPrintHtml(row: ReceiptVoucherPrintDocument, profile: CompanyProfilePrintValues) {
  const items = normalizeItems(row.items)
  const printItems = items.length
    ? items
    : [{ amount: row.totalAmount, description: row.purchaseBillDocNo || row.docNo, id: 'summary', price: row.totalQty ? row.totalAmount / row.totalQty : row.totalAmount, qty: row.totalQty, unit: 'กก.' }]

  const quantitySummary = summarizeQuantityByUnit(printItems)
  const companyName = (profile.name || 'ไม่มีข้อมูล').replace(/[\r\n]+/g, ' ').trim()
  const companyAddress = profile.address || 'ไม่มีข้อมูล'
  const companyPhone = profile.phone || 'ไม่มีข้อมูล'
  const companyTaxId = profile.taxId || 'ไม่มีข้อมูล'

  const isCancelled = row.status === 'cancelled'
  const selectedBankAccount = selectedSupplierBankAccount(row)
  const paymentMethodDisplay = selectedBankAccount?.paymentMethod || row.paymentMethod || CASH_PAYMENT_METHOD
  const legalNote = selectedBankAccount
    ? 'เอกสารนี้เป็นหลักฐานรับเงินจาก Supplier ตามบัญชีที่ระบุในเอกสาร'
    : 'เอกสารนี้เป็นหลักฐานรับเงินสดจาก Supplier เท่านั้น ไม่ใช่เอกสารโอนเงินหรือรายการธนาคาร'

  const pages = paginateStandardPrintItems(printItems)

  function renderRows(rowsToRender: ReceiptVoucherPrintItem[], startIndex: number) {
    return rowsToRender.map((item, index) => `
      <tr data-row-slot="${startIndex + index + 1}">
        <td class="center">${startIndex + index + 1}</td>
        <td class="item-name">${escapeHtml(item.description || '-')}</td>
        <td class="num">${money(toNumber(item.qty))} ${escapeHtml(item.unit || 'หน่วย')}</td>
        <td class="num">${money(toNumber(item.price))}</td>
        <td class="num font-black">${money(toNumber(item.amount))}</td>
      </tr>
    `).join('')
  }

  function renderEmptyRows(count: number) {
    return Array.from({ length: count }, (_, index) => `
      <tr class="empty-row" data-row-slot="empty-${index + 1}">
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
        <td>&nbsp;</td>
      </tr>
    `).join('')
  }

  function renderHeader(subTitle = 'Receipt Voucher', pageLabel = '') {
    return `
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
          <div class="doc-subtitle">${escapeHtml(subTitle)} ${pageLabel ? `<span style="color:#059669;margin-left:4px;">(${escapeHtml(pageLabel)})</span>` : ''}</div>
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
              <div class="meta-value">${escapeHtml(paymentMethodDisplay)}</div>
            </div>
          </div>
        </div>
      </header>
    `
  }

  function renderSupplierPayerSections() {
    return `
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
              <div class="field-wide">
                <div class="field-label">บริษัท</div>
                <div class="field-value">${escapeHtml(companyName)}</div>
              </div>
              <div>
                <div class="field-label">เลขประจำตัวผู้เสียภาษี</div>
                <div class="field-value">${escapeHtml(companyTaxId)}</div>
              </div>
              <div>
                <div class="field-label">โทร</div>
                <div class="field-value">${escapeHtml(companyPhone)}</div>
              </div>
              <div class="field-wide">
                <div class="field-label">ที่อยู่</div>
                <div class="field-value">${escapeHtml(companyAddress)}</div>
              </div>
              <div class="field-wide">
                <div class="field-label">ผู้จ่ายเงิน</div>
                <div class="field-value">${escapeHtml(row.payerSignerName || row.createdBy || '')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `
  }

  function renderBottomGridAndSignatures(options?: { isPlaceholderPage?: boolean; nextPageNo?: number }) {
    const isPlaceholderPage = options?.isPlaceholderPage ?? false
    const nextPageNo = options?.nextPageNo ?? 2

    if (isPlaceholderPage) {
      return `
        <section class="bottom-grid continuation-summary" data-continuation-summary="placeholder" aria-label="Continuation page summary placeholders">
          <div class="continuation-summary-panel">
            <div class="continuation-panel-title">รายละเอียดการรับเงิน</div>
            <div class="continuation-placeholder">-</div>
          </div>
          <div class="continuation-summary-panel">
            <div class="continuation-panel-title">หมายเหตุ</div>
            <div class="continuation-placeholder">-</div>
          </div>
        </section>

        <div class="footer-group">
          <div class="continuation-signature" data-continuation-signature="true">
            ( มีต่อหน้า ${nextPageNo} / Continued on Page ${nextPageNo} ➔ )
          </div>
          <div class="legal-note">
            ${escapeHtml(legalNote)}
          </div>
        </div>
      `
    }

    return `
      <section class="bottom-grid">
        <div class="notes-panel">
          ${(() => {
            if (selectedBankAccount) {
              return `
                <div class="note-box">
                  <div class="note-box-header">เลขที่บัญชี / Bank Account</div>
                  <div class="note-content" style="min-height: 48px; padding: 6px 8px; font-weight: normal; line-height: 1.4;">
                    <div style="font-size: 12px;">
                      <strong>${escapeHtml(selectedBankAccount.paymentMethod)}</strong> · ${escapeHtml(selectedBankAccount.bankName || '-')} · <span style="font-variant-numeric: tabular-nums;">${escapeHtml(selectedBankAccount.accountNo || '-')}</span>
                      <div style="color: #475569; margin-top: 2px;">ชื่อบัญชี: ${escapeHtml(selectedBankAccount.accountName || '-')} ${selectedBankAccount.branchCode ? `· สาขา: ${escapeHtml(selectedBankAccount.branchCode)}` : ''}</div>
                    </div>
                  </div>
                </div>
              `
            }
            return `
              <div class="note-box">
                <div class="note-box-header">จำนวนเงิน (ตัวอักษร)</div>
                <div class="note-content">${escapeHtml(row.amountInWords || '-')}</div>
              </div>
            `
          })()}
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
            <div>ยอดรับเงิน</div>
            <div style="text-align: right; font-variant-numeric: tabular-nums;">${money(row.totalAmount)}</div>
          </div>
          ${selectedBankAccount ? `
            <div style="padding: 6px 8px; text-align: right; font-size: 12px; font-weight: bold; color: #065f46; background: #ecfdf5; border-top: 1px solid #cbd5e1;">
              (${escapeHtml(row.amountInWords || '-')})
            </div>
          ` : ''}
        </div>
      </section>
      
      <div class="footer-group">
        <div class="signatures" data-signatures="final">
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
          ${escapeHtml(legalNote)}
        </div>
      </div>
    `
  }

  const pagesHtml = pages.map((page) => {
    const placeholder = !page.isFinalPage

    return `
      <div class="page is-dense${page.pageNo > 1 ? ' page-break-before' : ''}" data-print-page="${page.pageNo}" data-final-page="${page.isFinalPage}">
        ${isCancelled ? '<div class="watermark">ยกเลิก / CANCELLED</div>' : ''}
        <div class="accent"></div>
        ${renderHeader('Receipt Voucher', `หน้า ${page.pageNo} / ${page.totalPages}`)}
        ${renderSupplierPayerSections()}
        <table class="items">
          <thead>
            <tr>
              <th style="width: 8mm; text-align: center;">#</th>
              <th>รายการ${page.pageNo > 1 ? ' (ต่อ)' : ''}</th>
              <th style="width: 28mm; text-align: right;">จำนวน/หน่วย</th>
              <th style="width: 25mm; text-align: right;">ราคา/หน่วย</th>
              <th style="width: 29mm; text-align: right;">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            ${renderRows(page.items, page.startIndex)}
            ${renderEmptyRows(page.emptyRowCount)}
          </tbody>
          ${placeholder ? `
          <tfoot class="placeholder-total" data-page-totals="placeholder">
            <tr>
              <td colspan="5">&nbsp;</td>
            </tr>
          </tfoot>
          ` : `
          <tfoot data-page-totals="final">
            <tr>
              <td colspan="2" class="num">รวมทั้งสิ้น</td>
              <td class="num">${escapeHtml(quantitySummary || '-')}</td>
              <td></td>
              <td class="num final-amount">${money(row.totalAmount)}</td>
            </tr>
          </tfoot>
          `}
        </table>
        ${renderBottomGridAndSignatures({ isPlaceholderPage: placeholder, nextPageNo: page.pageNo + 1 })}
      </div>
    `
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ใบสำคัญรับเงิน ${escapeHtml(row.docNo)}</title>
    <style>
      @font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Regular.ttf') format('truetype'); font-style: normal; font-weight: 400; font-display: swap; }
      @font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Bold.ttf') format('truetype'); font-style: normal; font-weight: 700; font-display: swap; }
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 12px; line-height: 1.35; background: #334155; padding: 16px 0; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; position: sticky; top: 0; z-index: 50; margin-top: -16px; margin-bottom: 16px; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #059669; color: white; font: inherit; cursor: pointer; font-weight: bold; }
      .toolbar button.secondary { background: #475569; }
      .page { box-sizing: border-box; width: 210mm; height: 297mm; min-height: 297mm; max-height: 297mm; margin: 0 auto 16px; padding: 8mm; overflow: hidden; background: white; position: relative; display: flex; flex-direction: column; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2); border-radius: 4px; }
      .page-break-before { page-break-before: always !important; break-before: page !important; }
      .print-footer { display: none; }
      .accent { height: 4px; flex: 0 0 auto; background: linear-gradient(90deg, #065f46, #84cc16, #cbd5e1); border-radius: 99px; margin-bottom: 8px; }
      .header { display: grid; grid-template-columns: 1.2fr .8fr; gap: 12px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; }
      .company { display: grid; grid-template-columns: 60px 1fr; gap: 10px; align-items: start; min-width: 0; }
      .logo { width: 60px; height: 60px; object-fit: contain; }
      .no-logo { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; border-radius: 8px; color: #64748b; font-size: 11px; font-weight: 850; text-align: center; width: 60px; height: 60px; }
      .company-name { font-size: 14.5px; font-weight: 900; color: #0f172a; line-height: 1.2; white-space: nowrap; }
      .company-en { font-size: 11.5px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 3px; color: #475569; font-size: 11.5px; line-height: 1.35; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 21px; font-weight: 900; color: #065f46; letter-spacing: 0; }
      .doc-subtitle { font-size: 11.5px; font-weight: bold; uppercase; color: #64748b; margin-top: 1px; }
      .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; margin-top: 8px; text-align: left; }
      .meta-card { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 6px; padding: 3px 6px; }
      .meta-label { font-size: 11px; color: #64748b; }
      .meta-value { font-weight: 900; color: #0f172a; margin-top: 1px; font-size: 11.5px; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 4px 8px; background: #f1f5f9; color: #334155; font-weight: 900; font-size: 11.5px; }
      .panel-body { padding: 6px 8px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 10px; }
      .field-label { color: #64748b; font-size: 11px; }
      .field-value { font-weight: bold; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; font-size: 11.5px; }
      .field-wide { grid-span: 2; grid-column: span 2; }
      table { width: 100%; border-collapse: collapse; }
      .items { margin-top: 8px; font-size: 11.5px; break-inside: auto; page-break-inside: auto; table-layout: fixed; }
      .items thead { display: table-header-group; }
      .items tbody { break-inside: auto; page-break-inside: auto; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 5px 6px; text-align: left; font-weight: 900; overflow-wrap: anywhere; word-break: break-word; }
      .items td { border: 1px solid #dbe3ea; padding: 5px 6px; vertical-align: middle; overflow-wrap: anywhere; word-break: break-word; }
      .items tr { break-inside: avoid; page-break-inside: avoid; }
      .items .empty-row td { height: 26px; color: transparent; }
      .items tfoot td { background: #ecfdf5; color: #0f172a; font-weight: 900; padding: 5px 6px; }
      .items tfoot.placeholder-total td { height: 28px; background: #ffffff; color: transparent; }
      .items tfoot .final-amount { color: #059669; font-size: 11.5px; }
      .item-name { font-weight: bold; color: #0f172a; }
      .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .center { text-align: center; }
      
      .bottom-grid { display: grid; grid-template-columns: 1fr 70mm; gap: 8px; margin-top: 8px; break-inside: avoid; page-break-inside: avoid; }
      .notes-panel { display: flex; flex-direction: column; gap: 6px; }
      .note-box { border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; }
      .note-box-header { background: #f1f5f9; padding: 3px 6px; font-weight: 900; color: #475569; font-size: 11px; }
      .note-content { padding: 6px; font-size: 11.5px; font-weight: bold; color: #0f172a; min-height: 28px; }
      .note-content-small { padding: 4px 6px; font-size: 11px; color: #475569; min-height: 32px; white-space: pre-wrap; }
      .summary-box { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
      .summary-row { display: grid; grid-template-columns: 1fr 32mm; gap: 6px; border-bottom: 1px solid #cbd5e1; padding: 4px 6px; font-size: 11.5px; }
      .summary-row:last-child { border-bottom: 0; }
      .summary-row.highlight { background: #065f46; color: white; padding: 6px; font-size: 11.5px; font-weight: 900; }
      .continuation-summary-panel { min-height: 92px; border: 1px solid #cbd5e1; border-radius: 8px; background: #ffffff; padding: 8px; }
      .continuation-panel-title { font-weight: 900; color: #1e293b; }
      .continuation-placeholder { margin-top: 12px; color: #94a3b8; }
      .continuation-signature { min-height: 74px; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: bold; color: #059669; font-size: 13px; letter-spacing: 0.5px; }
      
      .footer-group { margin-top: auto; break-inside: avoid; page-break-inside: avoid; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 28px; font-size: 11.5px; break-inside: avoid; page-break-inside: avoid; }
      .sig-block { text-align: center; color: #475569; }
      .sig-line { width: 82%; margin: 0 auto; height: 38px; border-bottom: 1px solid #475569; }
      .sig-title { margin-top: 6px; font-weight: 900; color: #0f172a; }
      .sig-name { margin-top: 2px; }
      .sig-date { margin-top: 4px; font-size: 11px; color: #64748b; }
      
      .legal-note { margin-top: 12px; border-top: 1px solid #e2e8f0; padding-top: 6px; text-align: center; font-size: 11px; font-weight: bold; color: #64748b; break-inside: avoid; page-break-inside: avoid; }

      /* Auto Dense Sizing */
      .page.is-dense { padding: 8mm; }
      .page.is-dense .company-name { font-size: 14px; }
      .page.is-dense .company-info { font-size: 11px; margin-top: 2px; }
      .page.is-dense .doc-title { font-size: 20px; }
      .page.is-dense .doc-subtitle { font-size: 11px; }
      .page.is-dense .meta-grid { margin-top: 6px; gap: 4px; }
      .page.is-dense .meta-card { padding: 3px 6px; }
      .page.is-dense .section-grid { margin-top: 6px; gap: 6px; }
      .page.is-dense .panel-title { padding: 4px 6px; font-size: 11px; }
      .page.is-dense .panel-body { padding: 5px 6px; }
      .page.is-dense .two-col { gap: 4px 8px; }
      .page.is-dense .items { margin-top: 8px; font-size: 11px; }
      .page.is-dense .items th, .page.is-dense .items td { padding: 4px 5px; }
      .page.is-dense .bottom-grid { margin-top: 6px; gap: 6px; }
      .page.is-dense .signatures { margin-top: 20px; gap: 28px; }
      .page.is-dense .sig-line { height: 32px; }
      .page.is-dense .legal-note { margin-top: 8px; padding-top: 4px; font-size: 10.5px; }
      
      .watermark { pointer-events: none; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 72px; font-weight: 900; color: rgba(226, 232, 240, 0.7); transform: rotate(-18deg); z-index: 10; }
      
      @media print {
        @page { size: A4 portrait; margin: 8mm; }
        *, *::before, *::after { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { background: white; margin: 0; padding: 0; }
        .toolbar { display: none !important; }
        .page { border: 0; box-shadow: none; margin: 0; padding: 0; width: 194mm; height: 281mm; min-height: 281mm; max-height: 281mm; overflow: hidden; border-radius: 0; break-after: page; page-break-after: always; }
        .page:last-of-type { break-after: auto; page-break-after: auto; }
        .page.page-break-before { page-break-before: always !important; break-before: page !important; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิด</button>
      <span style="font-size: 12px;color:#cbd5e1">A4 portrait corporate print</span>
    </div>
    
    ${pagesHtml}
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
    // Reads from the short-lived in-memory cache warmed on hover when available.
    const payload = await fetchCompanyProfileForPrint()
    const profile = companyProfileForPrint(payload)
    printWindow.document.open()
    printWindow.document.write(buildReceiptVoucherPrintHtml(row, profile))
    printWindow.document.close()
    await prepareCorporatePrintLayout(printWindow.document, { fillContinuationFirst: true })
    printWindow.focus()
  } catch (err) {
    printWindow.document.open()
    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>เกิดข้อผิดพลาด</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#ef4444"><b>เกิดข้อผิดพลาดในการโหลดข้อมูลพิมพ์:</b><br>${escapeHtml(err instanceof Error ? err.message : String(err))}</body></html>`)
    printWindow.document.close()
  }
}
