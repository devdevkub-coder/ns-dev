import { z } from 'zod'
import { readJsonResponse } from '@/lib/api-client'
import { companyProfileForPrint, companyProfileResponseSchema, type CompanyProfilePrintValues } from '@/lib/company-profile'
import { displayWeightTicketStatus, type WeightTicketRecord } from '@/lib/weight-tickets'

const companyProfilePayloadSchema = z.object({
  ...companyProfileResponseSchema.shape,
  selectedBranchName: z.string().nullable().default(null),
})

const FIRST_PAGE_ITEM_ROWS = 12
const CONTINUATION_PAGE_ITEM_ROWS = 17

type PrintWeightRow = {
  className?: string
  containerDeductionWeight: number
  detail: string
  deductionWeight: number
  grossWeight: number
  label: string
  netWeight: number
  productName: string
  rank?: string
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatPrintableNumber(value: number) {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatPrintableWeight(value: number) {
  if (value % 1 === 0) {
    return value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  }
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function missing(value: string | null | undefined) {
  return value?.trim() || 'ไม่มีข้อมูล'
}

function cleanNote(note: string | null | undefined): string {
  if (!note) return '-'
  return note
    .replace(/\[impurity_product_id:[^\]]+\]/gi, '')
    .replace(/\[impurity_product_name:[^\]]+\]/gi, '')
    .replace(/\s*\(\s*([^)]+?)\s+\d+(?:\.\d+)?\s*kg\s*\)/gi, ' ($1)')
    .replace(/\s*\([\d.]+\s*kg\)/gi, '')
    .replace(/\s*[\d.]+\s*kg/gi, '')
    .trim()
}

function cleanImpurityName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .replace(/\s*\([\d.]+\s*kg\)/gi, '')
    .replace(/\s*[\d.]+\s*kg/gi, '')
    .trim()
}

function detailHtml(value: string) {
  return value
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => `<div class="detail-line">${escapeHtml(line)}</div>`)
    .join('')
}

function isImpurityLine(line: WeightTicketRecord['lines'][number]) {
  return line.grossWeightValue === 0 && Boolean(line.impurityName || line.impurityId)
}

function isPurchaseFromImpurityLine(line: WeightTicketRecord['lines'][number]) {
  return line.grossWeightValue > 0 && line.note.includes('มาจากสิ่งเจือปน')
}

function formatImpurityPurchaseSourceDetail(line: WeightTicketRecord['lines'][number]) {
  const match = /^มาจากสิ่งเจือปน \(([^)]+)\) ของรายการที่ ([^:]+):\s*(.+)$/.exec(line.note.trim())
  if (!match) return line.note || 'ซื้อเพิ่มจากสิ่งเจือปนที่เป็นสินค้า'

  const [, , , sourceProduct] = match
  return `มาจาก: ${sourceProduct}`
}

function findPurchaseLineForImpurity(
  impurityLine: WeightTicketRecord['lines'][number],
  sourceProductName: string,
  purchaseLines: WeightTicketRecord['lines'],
) {
  return purchaseLines.find((purchaseLine) => {
    if (!purchaseLine.note.includes(sourceProductName) && !purchaseLine.note.includes(impurityLine.productId)) return false
    return Math.abs(purchaseLine.grossWeightValue - impurityLine.deductionWeight) < 0.001
  })
}

function formatImpuritySummaryDetail(
  impurityLines: WeightTicketRecord['lines'],
  sourceProductName: string,
  purchaseLines: WeightTicketRecord['lines'],
) {
  if (impurityLines.length === 0) return 'ไม่มีหักสิ่งเจือปน'

  const details = impurityLines.map((line, index) => {
    const purchaseLine = findPurchaseLineForImpurity(line, sourceProductName, purchaseLines)
    const impurityName = cleanImpurityName(line.impurityName) || 'สิ่งเจือปน'
    const deductionText = `${formatPrintableWeight(line.deductionWeight)} กก.`
    const prefix = `- ${index + 1}. ${impurityName} ${deductionText}`
    if (purchaseLine) {
      return `${prefix} ซื้อเป็น ${purchaseLine.productName}`
    }

    const isOtherProductImpurity = impurityName === 'สินค้าอื่น' || impurityName === 'อื่นๆ' || impurityName === 'อย่างอื่น'
    if (isOtherProductImpurity) return `${prefix} ไม่ซื้อ`
    return prefix
  })

  return ['หักสิ่งเจือปน:', ...details].join('\n')
}

function sumPrintLines(lines: WeightTicketRecord['lines']) {
  return lines.reduce(
    (summary, line) => ({
      containerDeductionWeight: summary.containerDeductionWeight + line.containerDeductionWeightValue,
      deductionWeight: summary.deductionWeight + line.deductionWeight,
      grossWeight: summary.grossWeight + line.grossWeightValue,
      netBeforeImpurityWeight: summary.netBeforeImpurityWeight + Math.max(0, line.grossWeightValue - line.containerDeductionWeightValue),
      netWeight: summary.netWeight + line.netWeight,
    }),
    { containerDeductionWeight: 0, deductionWeight: 0, grossWeight: 0, netBeforeImpurityWeight: 0, netWeight: 0 },
  )
}

function buildPrintWeightRows(ticket: WeightTicketRecord, isReceipt: boolean): PrintWeightRow[] {
  if (!isReceipt) {
    return ticket.lines.map((line, index) => ({
      containerDeductionWeight: line.containerDeductionWeightValue,
      deductionWeight: line.deductionWeight,
      detail: line.note || '-',
      grossWeight: line.grossWeightValue,
      label: 'จากสินค้า',
      netWeight: line.netWeight,
      productName: line.productName,
      rank: String(index + 1),
    }))
  }

  const rows: PrintWeightRow[] = []
  const allPurchaseLines = ticket.lines.filter(isPurchaseFromImpurityLine)
  ticket.productSummaries.forEach((summary, groupIndex) => {
    const productLines = ticket.lines.filter((line) => line.productId === summary.productId)
    const realLotLines = productLines.filter((line) => !isImpurityLine(line) && !isPurchaseFromImpurityLine(line))
    const impurityLines = productLines.filter(isImpurityLine)
    const purchaseLines = productLines.filter(isPurchaseFromImpurityLine)
    const realLotTotals = sumPrintLines(realLotLines)
    const impurityTotals = sumPrintLines(impurityLines)
    const realLotNetAfterImpurity = Math.max(0, realLotTotals.netBeforeImpurityWeight - impurityTotals.deductionWeight)

    rows.push({
      className: 'product-heading',
      containerDeductionWeight: 0,
      deductionWeight: 0,
      detail: `${realLotLines.length.toLocaleString('th-TH')} เต๋า · หักสิ่งเจือปน ${impurityLines.length.toLocaleString('th-TH')} รายการ · ซื้อเพิ่ม ${purchaseLines.length.toLocaleString('th-TH')} รายการ`,
      grossWeight: 0,
      label: 'กลุ่มสินค้า',
      netWeight: 0,
      productName: summary.productName,
      rank: String(groupIndex + 1),
    })

    if (realLotLines.length > 0) {
      realLotLines.forEach((line, lotIndex) => {
        rows.push({
          className: 'lot-row',
          containerDeductionWeight: line.containerDeductionWeightValue,
          deductionWeight: line.deductionWeight,
          detail: cleanNote(line.note),
          grossWeight: line.grossWeightValue,
          label: `เต๋าที่ ${lotIndex + 1}`,
          netWeight: Math.max(0, line.grossWeightValue - line.containerDeductionWeightValue - line.deductionWeight),
          productName: summary.productName,
        })
      })

      rows.push({
        className: 'source-row',
        containerDeductionWeight: realLotTotals.containerDeductionWeight,
        deductionWeight: impurityTotals.deductionWeight,
        detail: [
          `${realLotLines.length.toLocaleString('th-TH')} เต๋า`,
          formatImpuritySummaryDetail(impurityLines, summary.productName, allPurchaseLines),
        ].join('\n'),
        grossWeight: realLotTotals.grossWeight,
        label: '',
        netWeight: realLotNetAfterImpurity,
        productName: 'สรุปรวมจากเต๋า',
      })
    }

    purchaseLines.forEach((line) => {
      rows.push({
        className: 'purchase-row',
        containerDeductionWeight: line.containerDeductionWeightValue,
        deductionWeight: 0,
        detail: formatImpurityPurchaseSourceDetail(line),
        grossWeight: line.grossWeightValue,
        label: 'ซื้อเพิ่มจากสิ่งเจือปน',
        netWeight: Math.max(0, line.grossWeightValue - line.containerDeductionWeightValue),
        productName: summary.productName,
      })
    })

    rows.push({
      className: 'product-total',
      containerDeductionWeight: summary.containerDeductionWeight,
      deductionWeight: summary.deductWeight,
      detail: `รวมจากเต๋าหลังหักสิ่งเจือปน${purchaseLines.length > 0 ? ' และรายการซื้อเพิ่มจากสิ่งเจือปน' : ''}`,
      grossWeight: summary.grossWeight,
      label: 'รวมสินค้า',
      netWeight: summary.netWeight,
      productName: summary.productName,
    })
  })

  return rows
}

export function buildReceiptPrintHtml(ticket: WeightTicketRecord, profile: CompanyProfilePrintValues) {
  const isReceipt = ticket.type === 'WTI'
  const docTitle = isReceipt ? 'ใบชั่งน้ำหนัก / ใบรับสินค้า' : 'ใบชั่งน้ำหนัก / ใบส่งของ'
  const partyLabel = isReceipt ? 'ผู้ขาย/ผู้ส่งของ' : 'ลูกค้า/ผู้รับสินค้า'
  const signatureLeft = isReceipt ? 'ผู้ส่งสินค้า' : 'ผู้ส่งของ'
  const signatureMiddle = isReceipt ? 'ผู้รับเข้าคลัง' : 'ผู้รับของ'
  const branchLabel = ticket.branchName?.trim() ? `สาขา ${ticket.branchName.trim()}` : ''
  const companyInfo = `
    ${escapeHtml(missing(profile.address))}<br>
    โทร ${escapeHtml(missing(profile.phone))} ${profile.fax ? ` · แฟกซ์ ${escapeHtml(profile.fax)}` : ''}<br>
    เลขประจำตัวผู้เสียภาษี: ${escapeHtml(missing(profile.taxId))}${branchLabel ? ` · ${escapeHtml(branchLabel)}` : ''}
    ${profile.email ? `<br>Email: ${escapeHtml(profile.email)}` : ''}
    ${profile.website ? `<br>Website: ${escapeHtml(profile.website)}` : ''}
  `

  const vehicleImageBlocks = ticket.vehicleImageNames
    .map((name) => {
      const match = /^([^|]+)\|(data:image\/[^|]+)$/.exec(name)
      if (!match) return null
      return `<div style="border:1px solid #cbd5e1;border-radius:6px;overflow:hidden;page-break-inside:avoid"><img src="${escapeHtml(match[2])}" style="width:100%;height:auto;display:block;max-height:8cm;object-fit:cover"><div style="padding:4px 8px;background:#f1f5f9;font-size:10px;color:#475569">${escapeHtml(match[1])}</div></div>`
    })
    .filter(Boolean)
    .join('')

  const isLotLine = (line: WeightTicketRecord['lines'][number]) => {
    if (!isReceipt) return true
    return line.grossWeightValue > 0 && !line.note.includes('มาจากสิ่งเจือปน')
  }
  const lotLines = ticket.lines.filter(isLotLine)
  const lotCount = lotLines.length
  const lotGrossWeight = lotLines.reduce((sum, line) => sum + line.grossWeightValue, 0)
  const lotContainerWeight = lotLines.reduce((sum, line) => sum + line.containerDeductionWeightValue, 0)

  function rowHtml(row: PrintWeightRow) {
    if (row.className === 'product-heading') {
      const colSpan = isReceipt ? 7 : 4
      return `
        <tr class="item-row product-heading">
          <td class="c rank-cell">${escapeHtml(row.rank || '')}</td>
          <td colspan="${colSpan - 1}">
            <div class="item-name">${escapeHtml(row.productName)}</div>
            <div class="muted">${detailHtml(row.detail)}</div>
          </td>
        </tr>
      `
    }

    const afterContainerWeight = Math.max(0, row.grossWeight - row.containerDeductionWeight)

    return `
      <tr class="item-row ${escapeHtml(row.className || '')}">
        <td class="c rank-cell">${escapeHtml(row.rank || '')}</td>
        <td>
          <div class="item-name">${escapeHtml(row.productName)}</div>
          ${row.label ? `<div class="muted">${escapeHtml(row.label)}</div>` : ''}
          <div class="muted">${detailHtml(row.detail)}</div>
        </td>
        <td class="r">${formatPrintableNumber(row.grossWeight)}</td>
        ${isReceipt ? `
        <td class="r">${formatPrintableNumber(row.containerDeductionWeight)}</td>
        <td class="r">${formatPrintableNumber(afterContainerWeight)}</td>
        <td class="r">${formatPrintableNumber(row.deductionWeight)}</td>
        ` : ''}
        <td class="r strong">${formatPrintableNumber(row.netWeight)}</td>
      </tr>
    `
  }

  function emptyRows(count: number) {
    const tds = isReceipt
      ? '<td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td>'
      : '<td>&nbsp;</td><td></td><td></td><td></td>'
    return Array.from({ length: Math.max(0, count) }, () => (
      `<tr class="empty">${tds}</tr>`
    )).join('')
  }

  const printRows = buildPrintWeightRows(ticket, isReceipt)
  const pages: Array<{ capacity: number; items: PrintWeightRow[] }> = []
  let cursor = 0
  while (cursor < printRows.length || pages.length === 0) {
    const capacity = pages.length === 0 ? FIRST_PAGE_ITEM_ROWS : CONTINUATION_PAGE_ITEM_ROWS
    pages.push({
      capacity,
      items: printRows.slice(cursor, cursor + capacity),
    })
    cursor += capacity
  }

  const totalPages = pages.length
  const pageHtml = pages.map((page, pageIndex) => {
    const isLastPage = pageIndex === totalPages - 1
    const rows = page.items.map((row) => rowHtml(row)).join('')
    const fillerRows = emptyRows(page.capacity - page.items.length)
    const totalAfterContainer = Math.max(0, ticket.totals.grossWeight - ticket.totals.containerDeductionWeight)

    return `
      <main class="page">
        <div class="accent"></div>
        <section class="header">
          <div class="company">
            ${profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo-placeholder">ไม่มีข้อมูล</div>'}
            <div>
              <div class="company-name">${escapeHtml(missing(profile.name))}</div>
              ${profile.nameEn ? `<div class="company-en">${escapeHtml(profile.nameEn)}</div>` : ''}
              <div class="company-info">${companyInfo}</div>
            </div>
          </div>
          <div class="doc-head">
            <div class="doc-title">${escapeHtml(docTitle)}</div>
          </div>
        </section>

        <section class="section-grid">
          <div class="panel">
            <div class="panel-title">${escapeHtml(partyLabel)}</div>
            <div class="panel-body two-col">
              <div><div class="field-label">ชื่อ</div><div class="field-value">${escapeHtml(ticket.partyName || '-')}</div></div>
              <div><div class="field-label">ทะเบียนรถ</div><div class="field-value">${escapeHtml(ticket.vehicleNo || '-')}</div></div>
              <div><div class="field-label">สาขา</div><div class="field-value">${escapeHtml(ticket.branchName || '-')}</div></div>
              <div><div class="field-label">พนักงานชั่ง</div><div class="field-value">${escapeHtml(ticket.enteredBy || '-')}</div></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-title">ข้อมูลเอกสาร / Document Info</div>
            <div class="panel-body two-col">
              <div><div class="field-label">เลขที่เอกสาร</div><div class="field-value">${escapeHtml(ticket.documentNo)}</div></div>
              <div><div class="field-label">วันที่เอกสาร</div><div class="field-value">${escapeHtml(ticket.documentDate || '-')}</div></div>
              <div><div class="field-label">เวลาสร้าง</div><div class="field-value">${escapeHtml(formatDateTime(ticket.createdAt))}</div></div>
              <div><div class="field-label">โกดัง</div><div class="field-value">${escapeHtml(ticket.warehouseName || '-')}</div></div>
            </div>
          </div>
        </section>

        <table class="items">
          <thead>
            <tr>
              <th class="c rank-cell" style="width:7mm">#</th>
              <th>รายการสินค้า</th>
              <th class="r" style="width:21mm">น้ำหนักรวม</th>
              ${isReceipt ? `
              <th class="r" style="width:21mm">หักภาชนะ</th>
              <th class="r" style="width:32mm">น้ำหนักหลังหักภาชนะ</th>
              <th class="r" style="width:26mm">หักสิ่งเจือปน</th>
              ` : ''}
              <th class="r" style="width:21mm">น้ำหนักสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            ${fillerRows}
          </tbody>
          ${isLastPage ? `
            <tfoot>
              <tr>
                <td colspan="2" class="r">รวมทั้งสิ้น</td>
                <td class="r">${formatPrintableNumber(ticket.totals.grossWeight)}</td>
                ${isReceipt ? `
                <td class="r">${formatPrintableNumber(ticket.totals.containerDeductionWeight)} kg</td>
                <td class="r">${formatPrintableNumber(totalAfterContainer)} kg</td>
                <td class="r">${formatPrintableNumber(ticket.totals.deductionWeight)} kg</td>
                ` : ''}
                <td class="r final-weight">${formatPrintableNumber(ticket.totals.netWeight)}</td>
              </tr>
            </tfoot>
          ` : ''}
        </table>

        ${isLastPage ? `
          <section class="bottom-grid">
            <div class="panel">
              <div class="panel-title">หมายเหตุ</div>
              <div class="panel-body"><div class="note">${escapeHtml(ticket.remark || '-')}</div></div>
            </div>
            <div class="panel">
              <div class="panel-title">ข้อมูลน้ำหนัก / Weight Info</div>
              <div class="panel-body two-col">
                <div><div class="field-label">จำนวนรายการ</div><div class="field-value">${lotCount} รายการ</div></div>
                <div><div class="field-label">น้ำหนักรวม</div><div class="field-value">${formatPrintableNumber(lotGrossWeight)} kg</div></div>
                <div><div class="field-label">หักภาชนะ</div><div class="field-value">${formatPrintableNumber(lotContainerWeight)} kg</div></div>
                <div><div class="field-label">หักสิ่งเจือปน</div><div class="field-value">${formatPrintableNumber(ticket.totals.deductionWeight)} kg</div></div>
                <div><div class="field-label">น้ำหนักสุทธิ</div><div class="field-value strong">${formatPrintableNumber(ticket.totals.netWeight)} kg</div></div>
              </div>
            </div>
          </section>

          ${vehicleImageBlocks ? `<section class="photos"><div class="panel-title">รูปรถ${isReceipt ? 'ส่งของ' : 'ขนส่ง'}</div><div class="photos-grid">${vehicleImageBlocks}</div></section>` : ''}

          <section class="signatures">
            <div class="sig"><div class="sig-line">${escapeHtml(signatureLeft)}</div><div>วันที่ ____ / ____ / ______</div></div>
            <div class="sig"><div class="sig-line">พนักงานชั่ง</div><div>${escapeHtml(ticket.enteredBy || '-')}</div></div>
            <div class="sig"><div class="sig-line">${escapeHtml(signatureMiddle)}</div><div>วันที่ ____ / ____ / ______</div></div>
            <div class="sig"><div class="sig-line">ผู้อนุมัติ</div><div>วันที่ ____ / ____ / ______</div></div>
          </section>
        ` : '<div class="continued">ต่อหน้าถัดไป</div>'}

        <footer class="footer">
          <span>${escapeHtml(profile.footerNote || '')}</span>
          <span>หน้า ${pageIndex + 1} / ${totalPages}</span>
        </footer>
      </main>
    `
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <title>${escapeHtml(docTitle)} ${escapeHtml(ticket.documentNo)}</title>
    <style>
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 11px; line-height: 1.35; background: #f8fafc; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #15803d; color: white; font: inherit; cursor: pointer; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; min-height: 277mm; margin: 0 auto; padding: 7mm; background: white; position: relative; display: flex; flex-direction: column; break-after: page; page-break-after: always; }
      .page:last-child { break-after: auto; page-break-after: auto; }
      .accent { height: 4px; background: linear-gradient(90deg, #166534, #65a30d, #cbd5e1); border-radius: 99px; margin-bottom: 12px; flex: 0 0 auto; }
      .header { display: grid; grid-template-columns: 1fr .9fr; gap: 12px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; flex: 0 0 auto; }
      .company { display: grid; grid-template-columns: 64px 1fr; gap: 12px; align-items: start; min-width: 0; }
      .logo, .logo-placeholder { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; }
      .logo-placeholder { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; background: #f8fafc; color: #64748b; font-size: 9px; font-weight: 800; text-align: center; }
      .company-name { font-size: 16px; font-weight: 800; color: #0f172a; }
      .company-en { font-size: 10px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 4px; color: #475569; font-size: 10px; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 22px; font-weight: 900; color: #14532d; letter-spacing: 0; }
      .doc-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; text-align: left; }
      .kv { border: 1px solid #e2e8f0; border-radius: 6px; padding: 5px 7px; background: #f8fafc; }
      .kv .label, .field-label, .summary-card .label { color: #475569; font-size: 9.5px; font-weight: 500; }
      .kv .value, .field-value { font-size: 12.5px; font-weight: 700; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      .field-value.strong { font-size: 15.5px; color: #059669; font-weight: 800; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; flex: 0 0 auto; }
      .panel { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 6px 9px; background: #f1f5f9; color: #334155; font-weight: 900; }
      .panel-body { padding: 8px 9px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; }
      table { width: 100%; border-collapse: collapse; }
      .items { margin-top: 12px; font-size: 11.5px; table-layout: fixed; flex: 0 0 auto; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 6px 5px; text-align: left; font-weight: 900; }
      .items td { border: 1px solid #dbe3ea; padding: 6px 5px; vertical-align: top; }
      .items .empty td { height: 24px; color: transparent; }
      .items .product-heading td { background: #f1f5f9; }
      .items .lot-row td { background: #ffffff; }
      .items .source-row td { background: #f8fafc; }
      .items .purchase-row td { background: #eff6ff; }
      .items .product-total td { background: #ecfdf5; font-weight: 900; }
      .item-name { font-weight: 850; color: #0f172a; }
      .muted { color: #64748b; font-size: 9px; margin-top: 1px; }
      .detail-line { margin-top: 1px; overflow-wrap: anywhere; }
      .source-row .detail-line:first-child,
      .purchase-row .detail-line:first-child { color: #334155; font-weight: 800; }
      .rank-cell { padding-left: 2px !important; padding-right: 2px !important; }
      .final-weight { color: #059669; font-size: 13.5px; font-weight: 900; }
      .r { text-align: right; }
      .c { text-align: center; }
      .strong { font-weight: 900; }
      .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
      .note { min-height: 42px; color: #334155; white-space: pre-wrap; }
      .summary-cards { display: grid; gap: 8px; }
      .summary-card { border: 1px solid #dbe3ea; border-radius: 8px; padding: 7px; background: #f8fafc; }
      .summary-card .value { font-size: 12px; font-weight: 900; color: #0f172a; margin-top: 2px; }
      .photos { margin-top: 12px; break-inside: avoid; page-break-inside: avoid; }
      .photos-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 8px; border: 1px solid #cbd5e1; border-top: 0; border-radius: 0 0 8px 8px; }
      .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 16px; break-inside: avoid; page-break-inside: avoid; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 5px; margin-top: 24px; font-weight: 800; color: #1e293b; }
      .continued { margin-top: auto; padding-top: 12px; text-align: right; color: #64748b; font-weight: 800; }
      .footer { margin-top: auto; padding-top: 8px; display: flex; justify-content: space-between; gap: 12px; border-top: 1px dashed #cbd5e1; color: #64748b; font-size: 9px; flex: 0 0 auto; }
      @media print {
        @page { size: A4 portrait; margin: 8mm; }
        body { background: white; font-size: 9.5px; line-height: 1.2; }
        .toolbar { display: none; }
        .page { width: auto; min-height: 281mm; margin: 0; padding: 0; box-shadow: none; break-after: page; page-break-after: always; }
        .page:last-child { break-after: auto; page-break-after: auto; }
        .accent { margin-bottom: 7px; }
        .header { gap: 10px; padding-bottom: 7px; }
        .company { grid-template-columns: 48px 1fr; gap: 8px; }
        .logo, .logo-placeholder { width: 48px; height: 48px; }
        .company-name { font-size: 14px; }
        .company-info { font-size: 9px; line-height: 1.25; margin-top: 2px; }
        .doc-title { font-size: 19px; }
        .doc-grid { gap: 6px 8px; }
        .kv { padding: 3px 5px; }
        .kv .label, .field-label, .summary-card .label { font-size: 8px; }
        .kv .value, .field-value { font-size: 10.5px; }
        .field-value.strong { font-size: 13.5px; }
        .section-grid { gap: 8px; margin-top: 7px; }
        .panel-title { padding: 4px 7px; }
        .panel-body { padding: 5px 7px; }
        .two-col { gap: 4px 8px; }
        .items { font-size: 11.5px; margin-top: 7px; }
        .items th, .items td { padding: 3px; }
        .items .empty td { height: 18px; }
        .muted { font-size: 8px; }
        .detail-line { margin-top: 0; line-height: 1.25; }
        .bottom-grid { gap: 8px; margin-top: 7px; }
        .note { min-height: 24px; }
        .summary-card { padding: 5px; }
        .summary-card .value { font-size: 10px; }
        .signatures { gap: 14px; margin-top: 10px; }
        .sig-line { margin-top: 16px; padding-top: 3px; }
        .footer { padding-top: 4px; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์ / Save as PDF</button>
      <button class="secondary" onclick="window.close()">ปิด</button>
      <span style="font-size:11px;color:#cbd5e1">A4 portrait multi-page print</span>
    </div>
    ${pageHtml}
  </body></html>`
}

function writeLoading(printWindow: Window, ticket: WeightTicketRecord) {
  printWindow.document.open()
  printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>กำลังเตรียมใบพิมพ์</title></head><body style="font-family:'Noto Sans Thai',Arial,sans-serif;margin:32px;color:#0f172a">กำลังเตรียมใบพิมพ์${ticket.type === 'WTI' ? 'ใบรับสินค้า' : 'ใบส่งของ'}...</body></html>`)
  printWindow.document.close()
}

export function openWeightTicketPrintWindow(ticket: WeightTicketRecord) {
  const printWindow = window.open('', '_blank', 'width=1024,height=900,scrollbars=yes')
  if (!printWindow) {
    throw new Error('Browser block popup — กรุณาอนุญาต popup สำหรับเว็บนี้')
  }
  writeLoading(printWindow, ticket)
  printWindow.focus()
  return printWindow
}

export async function openWeightTicketReceiptPrint(ticket: WeightTicketRecord, targetWindow?: Window) {
  const printWindow = targetWindow ?? openWeightTicketPrintWindow(ticket)
  const query = ticket.branchId ? `?branchId=${encodeURIComponent(ticket.branchId)}` : ''
  const response = await fetch(`/api/admin/company-profile${query}`, { cache: 'no-store' })
  const payload = await readJsonResponse(response, companyProfilePayloadSchema, 'โหลดข้อมูลบริษัทไม่สำเร็จ')
  const profile = companyProfileForPrint(payload)
  printWindow.document.open()
  printWindow.document.write(buildReceiptPrintHtml(ticket, profile))
  printWindow.document.close()
  printWindow.focus()
}
