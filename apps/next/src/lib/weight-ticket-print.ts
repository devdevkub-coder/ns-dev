import { companyProfileForPrint, type CompanyProfilePrintValues } from '@/lib/company-profile'
import { openWeightTicketPdfPrint } from '@/lib/download-weight-ticket-pdf'
import { decodeStoredImageAsset, displayWeightTicketStatus, isPreviewableStoredImageAsset, stripImpurityProductMeta, type StoredImageAsset, type WeightTicketRecord, weightTicketImpurityDisplayName } from '@/lib/weight-tickets'

/**
 * WTI/WTO are the only printable forms whose table always renders the full
 * twenty-cell form on every page, including the final page that also carries
 * totals, summary panels and signatures. Short tickets fill the unused slots
 * with empty rows so the form keeps its fixed 20-row grid. The browser print
 * path performs a second, DOM-backed fit after the HTML is written; these
 * values are the deterministic ceiling used by React-PDF and the LINE
 * notification renderers.
 */
export const WEIGHT_TICKET_MAX_ROWS_PER_PAGE = 20
const FIRST_PAGE_ITEM_ROWS = WEIGHT_TICKET_MAX_ROWS_PER_PAGE
const CONTINUATION_PAGE_ITEM_ROWS = WEIGHT_TICKET_MAX_ROWS_PER_PAGE
// Wrapped text spends more than one visual row, so the height budget is
// expressed in text-line units rather than row counts. Keeping the final page
// on the same 20-unit budget means up to twenty short rows (or fewer wrapped
// rows) fit on one A4 form without pushing totals, panels or signatures off
// the page; a row that does not fit uses a detail continuation when there is
// remaining space, otherwise it moves to the next page.
const WTI_FINAL_PAGE_HEIGHT_UNITS = WEIGHT_TICKET_MAX_ROWS_PER_PAGE
const WTO_FINAL_PAGE_HEIGHT_UNITS = WEIGHT_TICKET_MAX_ROWS_PER_PAGE
const WTI_DETAIL_CHARS_PER_WRAP = 34
const WTO_DETAIL_CHARS_PER_WRAP = 58
export const WEIGHT_TICKET_A4_ATTACHMENT_IMAGES_PER_PAGE = 6

/** exported เพื่อให้ react-pdf template ใช้ค่าเดียวกันกับ HTML template */
export { FIRST_PAGE_ITEM_ROWS, CONTINUATION_PAGE_ITEM_ROWS }

/** Short neutral detail shown in the WTI product-total row when nothing was deducted. */
export const NO_IMPURITY_SUMMARY_DETAIL = 'ไม่มีหักสิ่งเจือปน'

export type PrintWeightRow = {
  className?: string
  containerDeductionWeight: number
  detail: string
  deductionWeight: number
  grossWeight: number
  label: string
  netWeight: number
  productName: string
  rank?: string
  continuation?: boolean
}

export type WeightTicketPrintPage = {
  capacity: number
  estimatedHeight: number
  items: PrintWeightRow[]
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** exported เพื่อให้ react-pdf template format ตัวเลขเหมือนกัน */
export function formatPrintableNumber(value: number) {
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

/**
 * Keep Print, React-PDF, and LINE album ordering identical.
 * Vehicle evidence is part of the document attachments and must be shown first.
 */
export function buildWeightTicketAttachmentImages(
  ticket: Pick<WeightTicketRecord, 'imageNames' | 'vehicleImageNames'>,
): Array<StoredImageAsset & { url: string }> {
  return getWeightTicketAttachmentReferences(ticket)
    .map(decodeStoredImageAsset)
    // Formal print/PDF/LINE output must use the purpose-specific print
    // derivative. The strict server resolver fails before this helper when
    // the derivative is not ready; this map also prevents a thumbnail-only
    // reference from becoming a formal document artifact.
    .map((image) => ({ ...image, url: image.printUrl ?? null }))
    .filter(isPreviewableStoredImageAsset)
}

/**
 * Formal output must fail closed when any stored attachment is not resolved to
 * its purpose-specific print derivative. The non-throwing helper above stays
 * useful for defensive callers and fixtures; PDF/HTML/LINE entry points use
 * this strict variant so a missing image cannot silently disappear.
 */
export function buildResolvedWeightTicketAttachmentImages(
  ticket: Pick<WeightTicketRecord, 'imageNames' | 'vehicleImageNames'>,
): Array<StoredImageAsset & { url: string }> {
  return getWeightTicketAttachmentReferences(ticket).map((rawValue) => {
    const image = decodeStoredImageAsset(rawValue)
    const resolved = { ...image, url: image.printUrl ?? null }
    if (!isPreviewableStoredImageAsset(resolved)) {
      throw new Error(`รูปหลักฐาน ${image.fileName} ยังไม่มี print derivative ที่พร้อมใช้งาน`)
    }
    return resolved
  })
}

/**
 * The read model keeps imageNames as the aggregate album (vehicle + line
 * evidence) while vehicleImageNames remains available for vehicle-specific UI.
 * Keep vehicle images first, but collapse the overlap when both arrays contain
 * the same stored object.
 */
export function getWeightTicketAttachmentReferences(
  ticket: Pick<WeightTicketRecord, 'imageNames' | 'vehicleImageNames'>,
): string[] {
  const seen = new Set<string>()
  const references: string[] = []

  for (const rawValue of [...ticket.vehicleImageNames, ...ticket.imageNames]) {
    const identity = getWeightTicketAttachmentIdentity(rawValue)

    if (seen.has(identity)) continue
    seen.add(identity)
    references.push(rawValue)
  }

  return references
}

export function getWeightTicketAttachmentIdentity(rawValue: string): string {
  const asset = decodeStoredImageAsset(rawValue)
  return asset.bucket && asset.storageKey
    ? `storage:${asset.bucket}:${asset.storageKey}`
    : asset.url
      ? `url:${asset.url}`
      : `raw:${rawValue}`
}

function cleanNote(note: string | null | undefined): string {
  if (!note) return '-'
  return stripImpurityProductMeta(note)
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
  return line.grossWeightValue > 0 && line.impuritySourceLineNo != null
}

function formatImpurityPurchaseSourceDetail(line: WeightTicketRecord['lines'][number]) {
  const match = /^มาจากสิ่งเจือปน \(([^)]+)\) ของรายการที่ ([^:]+):\s*(.+)$/.exec(line.note.trim())
  if (!match) return line.note || 'ซื้อเพิ่มจากสิ่งเจือปนที่เป็นสินค้า'

  const [, , , sourceProduct] = match
  return `มาจาก: ${sourceProduct}`
}

function findPurchaseLineForImpurity(
  impurityLine: WeightTicketRecord['lines'][number],
  purchaseLines: WeightTicketRecord['lines'],
) {
  return purchaseLines.find((purchaseLine) => purchaseLine.impuritySourceLineNo === impurityLine.lineNo)
}

function formatImpuritySummaryDetail(
  impurityLines: WeightTicketRecord['lines'],
  purchaseLines: WeightTicketRecord['lines'],
) {
  if (impurityLines.length === 0) return NO_IMPURITY_SUMMARY_DETAIL

  const details = impurityLines.map((line, index) => {
    const purchaseLine = findPurchaseLineForImpurity(line, purchaseLines)
    const impurityName = cleanImpurityName(weightTicketImpurityDisplayName(line))
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

export function buildPrintWeightRows(ticket: WeightTicketRecord, isReceipt: boolean): PrintWeightRow[] {
  if (!isReceipt) {
    const rows: PrintWeightRow[] = []
    let lineIndex = 0
    ticket.productSummaries.forEach((summary) => {
      const productLines = ticket.lines.filter((line) => line.productId === summary.productId)
      if (productLines.length === 0) return

      productLines.forEach((line) => {
        lineIndex++
        rows.push({
          containerDeductionWeight: line.containerDeductionWeightValue,
          deductionWeight: line.deductionWeight,
          detail: '',
          grossWeight: line.grossWeightValue,
          label: '',
          netWeight: line.netWeight,
          productName: line.productName,
          rank: String(lineIndex),
        })
      })

      if (productLines.length > 1) {
        rows.push({
          className: 'product-total',
          containerDeductionWeight: summary.containerDeductionWeight,
          deductionWeight: summary.deductWeight,
          detail: '',
          grossWeight: summary.grossWeight,
          label: '',
          netWeight: summary.netWeight,
          productName: `รวม ${summary.productName}`,
          rank: '',
        })
      }
    })
    return rows
  }

  const rows: PrintWeightRow[] = []
  const allPurchaseLines = ticket.lines.filter(isPurchaseFromImpurityLine)
  ticket.productSummaries.forEach((summary, groupIndex) => {
    const productLines = ticket.lines.filter((line) => line.productId === summary.productId)
    const realLotLines = productLines.filter((line) => !isImpurityLine(line) && !isPurchaseFromImpurityLine(line))
    const impurityLines = productLines.filter(isImpurityLine)
    const purchaseLines = productLines.filter(isPurchaseFromImpurityLine)
    const canCollapseToProductSummary = realLotLines.length === 1 && purchaseLines.length === 0

    if (canCollapseToProductSummary) {
      const line = realLotLines[0]
      rows.push({
        className: 'product-total',
        containerDeductionWeight: summary.containerDeductionWeight,
        deductionWeight: summary.deductWeight,
        detail: [
          cleanNote(line.note),
          formatImpuritySummaryDetail(impurityLines, allPurchaseLines),
        ].filter((val) => val && val !== '-').join('\n') || '-',
        grossWeight: summary.grossWeight,
        label: '',
        netWeight: summary.netWeight,
        productName: summary.productName,
        rank: String(groupIndex + 1),
      })
    } else {
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

      realLotLines.forEach((line, lotIndex) => {
        const detail = cleanNote(line.note)
        rows.push({
          className: 'lot-row',
          containerDeductionWeight: line.containerDeductionWeightValue,
          deductionWeight: line.deductionWeight,
          detail: detail === '-' ? '' : detail,
          grossWeight: line.grossWeightValue,
          label: '',
          netWeight: Math.max(0, line.grossWeightValue - line.containerDeductionWeightValue - line.deductionWeight),
          productName: `${summary.productName} - ${lotIndex + 1}`,
        })
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

    if (!canCollapseToProductSummary) {
      rows.push({
        className: 'product-total',
        containerDeductionWeight: summary.containerDeductionWeight,
        deductionWeight: summary.deductWeight,
        detail: [
          formatImpuritySummaryDetail(impurityLines, allPurchaseLines),
          purchaseLines.length > 0 ? 'รวมรายการซื้อเพิ่มจากสิ่งเจือปนแล้ว' : '',
        ].filter(Boolean).join('\n'),
        grossWeight: summary.grossWeight,
        label: 'รวมสินค้า',
        netWeight: summary.netWeight,
        productName: summary.productName,
      })
    }
  })

  return rows
}

function estimateWrappedLineCount(value: string, maxCharacters: number) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  return lines.reduce((total, line) => {
    const characterCount = Array.from(line).length
    return total + Math.max(1, Math.ceil(characterCount / maxCharacters))
  }, 0)
}

/**
 * Estimate the height of one table row without a browser. This is deliberately
 * expressed in text-line units so the same deterministic plan can be reused
 * by React-PDF and server-generated LINE HTML. The browser print window still
 * performs a final CSS/font measurement after rendering.
 */
export function estimatePrintWeightRowHeight(row: PrintWeightRow, isReceipt: boolean) {
  // The WTI item column is narrower than WTO's five-column table. These values
  // are conservative enough to move a wrapped row early rather than risk
  // allowing text to collide with the numeric cells.
  const itemColumnCharacters = isReceipt ? 34 : 58
  if (row.continuation) {
    const lines = [
      row.label ? estimateWrappedLineCount(row.label, itemColumnCharacters) : 0,
      row.detail ? estimateWrappedLineCount(row.detail, itemColumnCharacters) : 0,
    ]
    return Math.max(1, lines.reduce((total, count) => total + count, 0))
  }
  if (row.className === 'product-heading') {
    const headingLines = [
      estimateWrappedLineCount(row.productName, itemColumnCharacters),
      row.detail ? estimateWrappedLineCount(row.detail, itemColumnCharacters) : 0,
    ]
    return Math.max(1, headingLines.reduce((total, count) => total + count, 0) - 1)
  }
  const lines = [
    estimateWrappedLineCount(row.productName, itemColumnCharacters),
    row.label ? estimateWrappedLineCount(row.label, itemColumnCharacters) : 0,
    row.detail ? estimateWrappedLineCount(row.detail, itemColumnCharacters) : 0,
  ]
  // One product line plus one optional detail/label line is the normal row
  // shape and counts as one logical row. Only additional wrapped lines spend
  // extra height budget.
  return Math.max(1, lines.reduce((total, count) => total + count, 0) - 1)
}

function estimateRowsHeight(rows: readonly PrintWeightRow[], isReceipt: boolean) {
  return rows.reduce((total, row) => total + estimatePrintWeightRowHeight(row, isReceipt), 0)
}

function wrapPrintDetailLines(value: string, maxCharacters: number) {
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null
  return value.split('\n').flatMap((line) => {
    const characters = segmenter
      ? Array.from(segmenter.segment(line), (segment) => segment.segment)
      : Array.from(line)
    if (characters.length === 0) return ['']

    const chunks: string[] = []
    for (let cursor = 0; cursor < characters.length; cursor += maxCharacters) {
      chunks.push(characters.slice(cursor, cursor + maxCharacters).join(''))
    }
    return chunks
  })
}

function splitOversizedPrintRow(row: PrintWeightRow, isReceipt: boolean, budget: number) {
  const originalHeight = estimatePrintWeightRowHeight(row, isReceipt)
  if (originalHeight <= budget || !row.detail) return [row]

  const maxCharacters = isReceipt ? WTI_DETAIL_CHARS_PER_WRAP : WTO_DETAIL_CHARS_PER_WRAP
  const detailLines = wrapPrintDetailLines(row.detail, maxCharacters)
  const chunks: PrintWeightRow[] = []
  let cursor = 0

  while (cursor < detailLines.length) {
    const isFirstChunk = chunks.length === 0
    let end = cursor
    let fittingRow: PrintWeightRow | null = null

    while (end < detailLines.length) {
      end += 1
      const detail = detailLines.slice(cursor, end).join('\n')
      const candidate: PrintWeightRow = isFirstChunk
        ? { ...row, detail }
        : {
            ...row,
            continuation: true,
            containerDeductionWeight: 0,
            deductionWeight: 0,
            detail,
            grossWeight: 0,
            label: 'ต่อรายละเอียด',
            netWeight: 0,
            productName: row.productName,
            rank: row.rank,
          }

      if (estimatePrintWeightRowHeight(candidate, isReceipt) > budget) {
        end -= 1
        break
      }
      fittingRow = candidate
    }

    if (!fittingRow || end <= cursor) {
      throw new Error('Unable to split WTI/WTO print row without losing detail')
    }

    chunks.push(fittingRow)
    cursor = end
  }

  console.info('[weight-ticket-print] split oversized row', {
    className: row.className,
    detailLength: Array.from(row.detail).length,
    originalHeight,
    continuationRows: chunks.length - 1,
  })

  return chunks
}

function normalizePrintRowsForPagination(rows: readonly PrintWeightRow[], isReceipt: boolean, budget: number) {
  return rows.flatMap((row) => splitOversizedPrintRow(row, isReceipt, budget))
}

function makePrintPage(
  items: readonly PrintWeightRow[],
  budget: number,
  isReceipt: boolean,
  maxRows = WEIGHT_TICKET_MAX_ROWS_PER_PAGE,
): WeightTicketPrintPage {
  const estimatedHeight = estimateRowsHeight(items, isReceipt)
  if (items.length > maxRows || estimatedHeight > budget) {
    throw new Error('รายการ WTI/WTO ยาวเกินพื้นที่หนึ่งหน้า A4')
  }

  // The form always fills its full row grid: the browser distributes the
  // fixed table height across all slots, so extra empty rows never add height.
  return {
    capacity: maxRows,
    estimatedHeight,
    items: [...items],
  }
}

function takeRowsForBudget(
  rows: readonly PrintWeightRow[],
  start: number,
  budget: number,
  isReceipt: boolean,
  maxRows = WEIGHT_TICKET_MAX_ROWS_PER_PAGE,
) {
  const items: PrintWeightRow[] = []

  while (start + items.length < rows.length && items.length < maxRows) {
    const row = rows[start + items.length]
    const candidate = [...items, row]
    const candidateHeight = estimateRowsHeight(candidate, isReceipt)
    if (items.length === 0 && candidateHeight > budget) {
      throw new Error('รายการ WTI/WTO ยาวเกินพื้นที่หนึ่งหน้า A4')
    }
    if (items.length > 0 && candidateHeight > budget) break
    items.push(row)
  }

  return items
}

function splitRowIntoPageRemainder(
  row: PrintWeightRow,
  isReceipt: boolean,
  remainingBudget: number,
) {
  if (!row.detail || remainingBudget < 1) return null
  try {
    const chunks = splitOversizedPrintRow(row, isReceipt, remainingBudget)
    return chunks.length > 1 ? chunks : null
  } catch (error) {
    if (error instanceof Error && error.message === 'Unable to split WTI/WTO print row without losing detail') {
      // A remaining fragment smaller than one printable detail line cannot be
      // rendered safely. Keep the complete row for the next page instead.
      return null
    }
    throw error
  }
}

function largestFittingSuffix(
  items: readonly PrintWeightRow[],
  budget: number,
  isReceipt: boolean,
  maxRows: number,
) {
  for (let count = Math.min(items.length, maxRows); count > 0; count -= 1) {
    const suffix = items.slice(items.length - count)
    if (estimateRowsHeight(suffix, isReceipt) <= budget) return items.length - count
  }
  return -1
}

/**
 * Keep WTI/WTO rows ordered. Non-final pages reserve continuation-marker/footer
 * space only; the final page contains real totals/summary/signatures. A final
 * page with no item rows is never emitted.
 */
export function paginatePrintWeightRows(printRows: PrintWeightRow[], isReceipt: boolean): WeightTicketPrintPage[] {
  const continuationBudget = CONTINUATION_PAGE_ITEM_ROWS
  const finalMaxRows = WEIGHT_TICKET_MAX_ROWS_PER_PAGE
  const finalBudget = isReceipt ? WTI_FINAL_PAGE_HEIGHT_UNITS : WTO_FINAL_PAGE_HEIGHT_UNITS
  const normalizedPrintRows = normalizePrintRowsForPagination(printRows, isReceipt, continuationBudget)
  const pages: WeightTicketPrintPage[] = []
  let cursor = 0

  while (cursor < normalizedPrintRows.length) {
    let items = takeRowsForBudget(normalizedPrintRows, cursor, continuationBudget, isReceipt, WEIGHT_TICKET_MAX_ROWS_PER_PAGE)
    if (items.length === 0) {
      throw new Error('Unable to paginate WTI/WTO print rows without losing data')
    }
    const nextRowIndex = cursor + items.length
    if (nextRowIndex < normalizedPrintRows.length && items.length < WEIGHT_TICKET_MAX_ROWS_PER_PAGE) {
      const remainingBudget = continuationBudget - estimateRowsHeight(items, isReceipt)
      const remainderChunks = splitRowIntoPageRemainder(normalizedPrintRows[nextRowIndex]!, isReceipt, remainingBudget)
      if (remainderChunks) {
        const remainingSlots = WEIGHT_TICKET_MAX_ROWS_PER_PAGE - items.length
        const fittingChunks = takeRowsForBudget(
          remainderChunks,
          0,
          remainingBudget,
          isReceipt,
          remainingSlots,
        )
        normalizedPrintRows.splice(nextRowIndex, 1, ...remainderChunks)
        items = [...items, ...fittingChunks]
      }
    }

    pages.push(makePrintPage(items, continuationBudget, isReceipt))
    cursor += items.length
  }

  if (pages.length === 0) return [makePrintPage([], finalBudget, isReceipt, finalMaxRows)]

  const lastIndex = pages.length - 1
  const lastPage = pages[lastIndex]
  const finalRowLimit = lastPage.items.length === finalMaxRows
    && lastPage.items.some((row) => estimatePrintWeightRowHeight(row, isReceipt) > 1)
    ? finalMaxRows - 1
    : finalMaxRows
  if (lastPage.items.length <= finalRowLimit && lastPage.estimatedHeight <= finalBudget) {
    pages[lastIndex] = makePrintPage(lastPage.items, finalBudget, isReceipt, finalMaxRows)
    return pages
  }

  const splitAt = largestFittingSuffix(lastPage.items, finalBudget, isReceipt, finalRowLimit)
  if (splitAt <= 0) {
    throw new Error('หน้าสุดท้ายของใบชั่งไม่สามารถวางรายการพร้อมกล่องสรุปได้')
  }

  const prefix = lastPage.items.slice(0, splitAt)
  const suffix = lastPage.items.slice(splitAt)
  const previousPage = pages[lastIndex - 1]
  if (previousPage) {
    const merged = [...previousPage.items, ...prefix]
    if (merged.length <= WEIGHT_TICKET_MAX_ROWS_PER_PAGE && estimateRowsHeight(merged, isReceipt) <= continuationBudget) {
      pages.splice(lastIndex - 1, 2, makePrintPage(merged, continuationBudget, isReceipt, WEIGHT_TICKET_MAX_ROWS_PER_PAGE))
      pages.push(makePrintPage(suffix, finalBudget, isReceipt, finalMaxRows))
      return pages
    }
  }

  pages[lastIndex] = makePrintPage(prefix, continuationBudget, isReceipt, WEIGHT_TICKET_MAX_ROWS_PER_PAGE)
  pages.push(makePrintPage(suffix, finalBudget, isReceipt, finalMaxRows))
  return pages
}

export function buildReceiptPrintHtml(ticket: WeightTicketRecord, profile: CompanyProfilePrintValues) {
  // Six cards fit on an A4 attachment page as a 2-column x 3-row grid.
  const attachmentImagesPerPage = WEIGHT_TICKET_A4_ATTACHMENT_IMAGES_PER_PAGE
  const isReceipt = ticket.type === 'WTI'
  const docTitle = isReceipt ? 'ใบชั่งน้ำหนัก / ใบรับสินค้า' : 'ใบชั่งน้ำหนัก / ใบส่งของ'
  const partyLabel = isReceipt ? 'ผู้ขาย/ผู้ส่งของ' : 'ลูกค้า/ผู้รับสินค้า'
  const signatureLeft = isReceipt ? 'ผู้ส่งสินค้า' : 'ผู้ส่งของ'
  const signatureMiddle = isReceipt ? 'ผู้รับเข้าคลัง' : 'ผู้รับของ'
  const companyName = missing(profile.name).replace(/[\r\n]+/g, ' ').trim()
  const companyNameEn = profile.nameEn?.replace(/[\r\n]+/g, ' ').trim() || ''
  const branchLabel = ticket.branchName?.trim() ? `สาขา ${ticket.branchName.trim()}` : ''
  const companyInfo = `
    ${escapeHtml(missing(profile.address))}<br>
    โทร ${escapeHtml(missing(profile.phone))} ${profile.fax ? ` · แฟกซ์ ${escapeHtml(profile.fax)}` : ''}<br>
    เลขประจำตัวผู้เสียภาษี: ${escapeHtml(missing(profile.taxId))}${branchLabel ? ` · ${escapeHtml(branchLabel)}` : ''}
    ${profile.email ? `<br>Email: ${escapeHtml(profile.email)}` : ''}
    ${profile.website ? `<br>Website: ${escapeHtml(profile.website)}` : ''}
  `

  const attachmentImages = buildResolvedWeightTicketAttachmentImages(ticket)
  const attachmentChunks: Array<typeof attachmentImages> = []
  for (let index = 0; index < attachmentImages.length; index += attachmentImagesPerPage) {
    attachmentChunks.push(attachmentImages.slice(index, index + attachmentImagesPerPage))
  }

  const isLotLine = (line: WeightTicketRecord['lines'][number]) => {
    if (!isReceipt) return true
    return line.grossWeightValue > 0 && line.impuritySourceLineNo == null
  }
  const lotLines = ticket.lines.filter(isLotLine)
  const lotCount = lotLines.length

  function rowHtml(row: PrintWeightRow, rowSlot: number) {
    if (row.continuation) {
      const colSpan = isReceipt ? 7 : 5
      return `
        <tr class="item-row continuation-row ${escapeHtml(row.className || '')}" data-row-slot="${rowSlot}">
          <td class="c rank-cell"></td>
          <td colspan="${colSpan - 1}">
            ${row.label ? `<div class="muted">${escapeHtml(row.label)}</div>` : ''}
            ${row.detail ? `<div class="muted">${detailHtml(row.detail)}</div>` : ''}
          </td>
        </tr>
      `
    }

    if (row.className === 'product-heading') {
      const colSpan = isReceipt ? 7 : 5
      return `
        <tr class="item-row product-heading" data-row-slot="${rowSlot}">
          <td class="c rank-cell">${escapeHtml(row.rank || '')}</td>
          <td colspan="${colSpan - 1}">
            <div class="item-name">${escapeHtml(row.productName)}</div>
            ${row.detail ? `<div class="muted">${detailHtml(row.detail)}</div>` : ''}
          </td>
        </tr>
      `
    }

    const afterContainerWeight = Math.max(0, row.grossWeight - row.containerDeductionWeight)

    return `
      <tr class="item-row ${escapeHtml(row.className || '')}" data-row-slot="${rowSlot}">
        <td class="c rank-cell">${escapeHtml(row.rank || '')}</td>
        <td>
          <div class="item-name">${escapeHtml(row.productName)}</div>
          ${row.label ? `<div class="muted">${escapeHtml(row.label)}</div>` : ''}
          ${row.detail ? `<div class="muted">${detailHtml(row.detail)}</div>` : ''}
        </td>
        <td class="r">${row.continuation ? '&nbsp;' : formatPrintableNumber(row.grossWeight)}</td>
        ${isReceipt ? `
        <td class="r">${row.continuation ? '&nbsp;' : formatPrintableNumber(row.containerDeductionWeight)}</td>
        <td class="r">${row.continuation ? '&nbsp;' : formatPrintableNumber(afterContainerWeight)}</td>
        <td class="r">${row.continuation ? '&nbsp;' : formatPrintableNumber(row.deductionWeight)}</td>
        ` : `
        <td class="r">${row.continuation ? '&nbsp;' : formatPrintableNumber(row.containerDeductionWeight)}</td>
        `}
        <td class="r strong">${row.continuation ? '&nbsp;' : formatPrintableNumber(row.netWeight)}</td>
      </tr>
    `
  }

  const printRows = buildPrintWeightRows(ticket, isReceipt)
  const pages = paginatePrintWeightRows(printRows, isReceipt)

  const totalPages = pages.length
  let rowSlot = 0
  const pageHtml = pages.map((page, pageIndex) => {
    const isLastPage = pageIndex === totalPages - 1
    const rows = page.items.map((row) => rowHtml(row, ++rowSlot)).join('')
    const emptyRows = Array.from({ length: Math.max(0, page.capacity - page.items.length) }, (_, emptyIndex) => `
      <tr class="item-row empty${isLastPage ? ' final-empty' : ''}" data-row-slot="empty-${pageIndex + 1}-${emptyIndex + 1}" aria-hidden="true">
        ${Array.from({ length: isReceipt ? 7 : 5 }, () => '<td>&nbsp;</td>').join('')}
      </tr>
    `).join('')
    const totalAfterContainer = Math.max(0, ticket.totals.grossWeight - ticket.totals.containerDeductionWeight)

    return `
      <main class="page" data-document-type="${ticket.type}" data-print-page="${pageIndex + 1}" data-final-page="${isLastPage}">
        <div class="accent"></div>
        <section class="header">
          <div class="company">
            ${profile.logoUrl ? `<img class="logo" src="${escapeHtml(profile.logoUrl)}" alt="Company logo">` : '<div class="logo-placeholder">ไม่มีข้อมูล</div>'}
            <div>
              <div class="company-name">${escapeHtml(companyName)}</div>
              ${companyNameEn ? `<div class="company-en">${escapeHtml(companyNameEn)}</div>` : ''}
              <div class="company-info">${companyInfo}</div>
            </div>
          </div>
          <div class="doc-head">
            <div class="doc-title">${escapeHtml(docTitle)}</div>
            <div class="page-label">หน้า ${pageIndex + 1} / ${totalPages}</div>
            ${ticket.status === 'draft' ? `<div class="draft-badge">แบบร่าง - ${isReceipt ? 'ยังไม่ยืนยันรับของ' : 'ยังไม่ยืนยันส่งของ'}</div>` : ''}
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
              <div><div class="field-label">โกดัง</div><div class="field-value">${escapeHtml(ticket.godownName || '-')}</div></div>
            </div>
          </div>
        </section>

        <div class="items-frame" data-print-overflow-guard="items">
        <table class="items" style="--item-row-slots: ${page.capacity}">
          <thead>
            <tr>
              <th class="c rank-cell" style="width:7mm">#</th>
              <th>รายการสินค้า</th>
              <th class="r" style="width:21mm">น้ำหนักรวม</th>
              ${isReceipt ? `
              <th class="r" style="width:21mm">หักภาชนะ</th>
              <th class="r" style="width:32mm">น้ำหนักหลังหักภาชนะ</th>
              <th class="r" style="width:26mm">หักสิ่งเจือปน</th>
              ` : `
              <th class="r" style="width:21mm">หักภาชนะ</th>
              `}
              <th class="r" style="width:21mm">น้ำหนักสุทธิ</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            ${emptyRows}
          </tbody>
          ${isLastPage ? `
            <tfoot data-page-totals="final">
              <tr>
                <td colspan="2" class="r">รวมทั้งสิ้น</td>
                <td class="r">${formatPrintableNumber(ticket.totals.grossWeight)}</td>
                ${isReceipt ? `
                <td class="r">${formatPrintableNumber(ticket.totals.containerDeductionWeight)} kg</td>
                <td class="r">${formatPrintableNumber(totalAfterContainer)} kg</td>
                <td class="r">${formatPrintableNumber(ticket.totals.deductionWeight)} kg</td>
                ` : `
                <td class="r">${formatPrintableNumber(ticket.totals.containerDeductionWeight)}</td>
                `}
                <td class="r final-weight">${formatPrintableNumber(ticket.totals.netWeight)}</td>
              </tr>
            </tfoot>
          ` : `
            <tfoot class="placeholder-total" data-page-totals="placeholder">
              <tr><td colspan="${isReceipt ? 7 : 5}">&nbsp;</td></tr>
            </tfoot>
          `}
        </table>
        </div>

        ${isLastPage ? `
          <section class="bottom-zone">
          <section class="bottom-grid">
            <div class="panel">
              <div class="panel-title">สรุปตามหมวดสินค้า</div>
              <div class="panel-body two-col">
                ${Array.from(ticket.productSummaries.reduce((map, summary) => {
                  const cat = summary.categoryName || 'อื่นๆ'
                  map.set(cat, (map.get(cat) || 0) + summary.netWeight)
                  return map
                }, new Map<string, number>()).entries()).map(([cat, weight]) => `<div><div class="field-label">${escapeHtml(cat)}</div><div class="field-value">${formatPrintableNumber(weight)} kg</div></div>`).join('')}
              </div>
            </div>
            <div class="panel">
              <div class="panel-title">หมายเหตุ</div>
              <div class="panel-body"><div class="note">${escapeHtml(ticket.remark || '-')}</div></div>
            </div>
            <div class="panel">
              <div class="panel-title">ข้อมูลน้ำหนัก / Weight Info</div>
              <div class="panel-body two-col weight-info-grid">
                <div><div class="field-label">จำนวนรายการ</div><div class="field-value">${lotCount} รายการ</div></div>
                <div><div class="field-label">น้ำหนักรวม</div><div class="field-value">${formatPrintableNumber(ticket.totals.grossWeight)} kg</div></div>
                <div><div class="field-label">หักภาชนะ</div><div class="field-value">${formatPrintableNumber(ticket.totals.containerDeductionWeight)} kg</div></div>
                <div><div class="field-label">หักสิ่งเจือปน</div><div class="field-value">${formatPrintableNumber(ticket.totals.deductionWeight)} kg</div></div>
                <div class="weight-info-net"><div class="field-label">น้ำหนักสุทธิ</div><div class="field-value strong">${formatPrintableNumber(ticket.totals.netWeight)} kg</div></div>
              </div>
            </div>
          </section>

          <section class="signatures" data-signatures="final">
            <div class="sig"><div class="sig-line">${escapeHtml(signatureLeft)}</div><div>วันที่ ____ / ____ / ______</div></div>
            <div class="sig"><div class="sig-line">พนักงานชั่ง</div><div>${escapeHtml(ticket.enteredBy || '-')}</div></div>
            <div class="sig"><div class="sig-line">${escapeHtml(signatureMiddle)}</div><div>วันที่ ____ / ____ / ______</div></div>
            <div class="sig"><div class="sig-line">ผู้อนุมัติ</div><div>วันที่ ____ / ____ / ______</div></div>
          </section>
          </section>
        ` : `
          <section class="bottom-zone">
            <div class="continued" data-continuation-signature="true">( มีต่อหน้า ${pageIndex + 2} / Continued on Page ${pageIndex + 2} ➔ )</div>
          </section>
        `}
      </main>
    `
  }).join('')

  const attachmentPageHtml = attachmentChunks.map((chunk, chunkIndex) => `
    <main class="page attachment-page">
      <div class="accent"></div>
      <section class="album-header">
        <div>
          <div class="album-title">${escapeHtml(isReceipt ? 'ใบรับสินค้า (รูปถ่ายแนบ)' : 'ใบส่งของ (รูปถ่ายแนบ)')}</div>
          <div class="album-subtitle">เลขที่เอกสาร: ${escapeHtml(ticket.documentNo)} · คู่ค้า: ${escapeHtml(ticket.partyName)} · วันที่: ${escapeHtml(ticket.documentDate || '-')}</div>
        </div>
        <div class="album-page-number">หน้า ${totalPages + chunkIndex + 1} / ${totalPages + attachmentChunks.length}</div>
      </section>
      <div class="album-separator"></div>
      <section class="album-grid">
        ${chunk.map((image, imageIndex) => {
          const globalIndex = chunkIndex * attachmentImagesPerPage + imageIndex + 1
          return `
            <article class="album-card">
              <div class="album-image-wrap">
                <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.fileName)}">
              </div>
              <div class="album-card-bar">
                <span class="album-file-name">${escapeHtml(image.fileName)}</span>
                <span class="album-index">#${globalIndex}</span>
              </div>
            </article>
          `
        }).join('')}
      </section>
    </main>
  `).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>${escapeHtml(docTitle)} ${escapeHtml(ticket.documentNo)}</title>
    <style>
      @font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Regular.ttf') format('truetype'); font-style: normal; font-weight: 400; font-display: swap; }
      @font-face { font-family: 'Noto Sans Thai'; src: url('/fonts/NotoSansThai-Bold.ttf') format('truetype'); font-style: normal; font-weight: 700; font-display: swap; }
      @page { size: A4 portrait; margin: 10mm; }
      * { box-sizing: border-box; }
      html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; color: #0f172a; font-family: 'Noto Sans Thai', Arial, sans-serif; font-size: 11px; line-height: 1.25; background: #334155; padding: 16px 0; }
      .toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 10px; background: #0f172a; color: white; position: sticky; top: 0; z-index: 50; margin-top: -16px; margin-bottom: 16px; }
      .toolbar button { border: 0; border-radius: 6px; padding: 7px 14px; background: #15803d; color: white; font: inherit; cursor: pointer; }
      .toolbar button.secondary { background: #475569; }
      .page { width: 190mm; height: 277mm; min-height: 277mm; margin: 0 auto 16px; padding: 6mm; background: white; position: relative; display: flex; flex-direction: column; box-shadow: 0 10px 25px -5px rgba(0,0,0,.3), 0 8px 10px -6px rgba(0,0,0,.2); border-radius: 4px; break-after: page; page-break-after: always; }
      .page:last-child { break-after: auto; page-break-after: auto; }
      .accent { height: 3px; background: linear-gradient(90deg, #166534, #65a30d, #cbd5e1); border-radius: 99px; margin-bottom: 8px; flex: 0 0 auto; }
      .header { display: grid; grid-template-columns: 1fr .9fr; gap: 10px; align-items: start; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px; flex: 0 0 auto; }
      .company { display: grid; grid-template-columns: 52px 1fr; gap: 9px; align-items: start; min-width: 0; }
      .logo, .logo-placeholder { width: 52px; height: 52px; object-fit: contain; border-radius: 8px; }
      .logo-placeholder { display: flex; align-items: center; justify-content: center; border: 1px dashed #cbd5e1; background: #f8fafc; color: #64748b; font-size: 10px; font-weight: 700; text-align: center; }
      .company-name { font-size: 14px; font-weight: 700; color: #0f172a; white-space: nowrap; }
      .company-en { font-size: 10.5px; font-weight: 700; color: #475569; margin-top: 1px; }
      .company-info { margin-top: 2px; color: #475569; font-size: 10px; }
      .doc-head { text-align: right; }
      .doc-title { font-size: 18px; font-weight: 700; color: #14532d; letter-spacing: 0; }
      .page-label { margin-top: 3px; color: #14532d; font-weight: 700; }
      .draft-badge { display: inline-block; margin-top: 5px; border: 1px solid #d97706; border-radius: 4px; padding: 3px 7px; color: #92400e; background: #fffbeb; font-size: 10.5px; font-weight: 700; }
      .doc-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; text-align: left; }
      .kv { border: 1px solid #e2e8f0; border-radius: 6px; padding: 4px 6px; background: #f8fafc; }
      .kv .label, .field-label, .summary-card .label { color: #475569; font-size: 10px; font-weight: 500; }
      .kv .value, .field-value { font-size: 10.5px; font-weight: 600; color: #0f172a; margin-top: 1px; overflow-wrap: anywhere; }
      .field-value.strong { font-size: 12.5px; color: #059669; font-weight: 700; }
      .section-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; flex: 0 0 auto; }
      .panel { border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .panel-title { padding: 4px 7px; background: #f1f5f9; color: #334155; font-weight: 700; }
      .panel-body { padding: 5px 7px; }
      .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 8px; }
      .weight-info-grid { gap: 3px 8px; padding-bottom: 8px; }
      .weight-info-grid > div:nth-child(even), .weight-info-net { text-align: right; }
      .weight-info-net { grid-column: 2; min-width: 0; }
      .weight-info-net .field-value { margin-top: 1px; white-space: nowrap; }
      table { width: 100%; border-collapse: collapse; }
      .items-frame { margin: 8px 1px 0; border-radius: 6px; box-shadow: 0 0 0 1px #cbd5e1; overflow: hidden; flex: 1 1 auto; display: flex; flex-direction: column; }
      .items { margin-top: 0; font-size: 10.5px; table-layout: fixed; flex: 1 1 auto; height: 100%; }
      .items th { background: #e2e8f0; border: 1px solid #cbd5e1; color: #1e293b; padding: 4px 3px; text-align: left; font-weight: 700; overflow-wrap: anywhere; word-break: break-word; }
      .items td { border: 1px solid #dbe3ea; padding: 4px 3px; vertical-align: top; overflow-wrap: anywhere; word-break: break-word; }
      .items tbody { height: 100%; }
      .items tbody > tr { height: calc(100% / var(--item-row-slots)); }
      .items .empty td { color: transparent; }
      .items .product-heading td { background: #f1f5f9; }
      .items .lot-row td { background: #ffffff; }
      .items .source-row td { background: #f8fafc; }
      .items .purchase-row td { background: #eff6ff; }
      .items .product-total td { background: #ecfdf5; font-weight: 700; }
      .items tfoot.placeholder-total td { height: 24px; background: #ffffff; color: transparent; }
      .item-name { font-weight: 700; color: #0f172a; }
      .muted { color: #64748b; font-size: 9.5px; margin-top: 1px; }
      .detail-line { margin-top: 1px; overflow-wrap: anywhere; }
      .source-row .detail-line:first-child,
      .purchase-row .detail-line:first-child { color: #334155; font-weight: 700; }
      .rank-cell { padding-left: 2px !important; padding-right: 2px !important; }
      .final-weight { color: #059669; font-size: 11.5px; font-weight: 700; }
      .r { text-align: right; }
      .c { text-align: center; }
      .strong { font-weight: 700; }
      .bottom-grid { display: grid; grid-template-columns: 1.15fr 0.8fr 1.05fr; gap: 8px; margin-top: 8px; align-items: start; break-inside: avoid; page-break-inside: avoid; }
      .note { min-height: 28px; color: #334155; white-space: pre-wrap; }
      .summary-cards { display: grid; gap: 8px; }
      .summary-card { border: 1px solid #dbe3ea; border-radius: 6px; padding: 5px; background: #f8fafc; }
      .summary-card .value { font-size: 10.5px; font-weight: 700; color: #0f172a; margin-top: 2px; }
      /* The album pages carry no data-print-page so the shared fitter never
       * normalizes them; keep them on the same A4 box (210×297mm, 8mm padding)
       * as the normalized item pages so every paper in the popup has the same
       * width and height. */
      .attachment-page { width: 210mm; height: 297mm; min-height: 297mm; max-height: 297mm; padding: 8mm; overflow: hidden; }
      .album-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
      .album-title { color: #14532d; font-size: 16px; font-weight: 700; line-height: 1.25; }
      .album-subtitle { color: #475569; font-size: 10px; margin-top: 5px; line-height: 1.25; }
      .album-page-number { color: #64748b; font-size: 10px; font-weight: 700; white-space: nowrap; }
      .album-separator { height: 1px; background: #cbd5e1; margin-bottom: 10px; }
      .album-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .album-card { border: 1px solid #dbe3ea; border-radius: 6px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
      .album-image-wrap { position: relative; aspect-ratio: 4 / 3; height: auto; min-height: 180px; background: #f8fafc; display: flex; align-items: center; justify-content: center; }
      .album-image-wrap img { width: 100%; height: 100%; display: block; object-fit: contain; }
      .album-card-bar { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 5px 7px; }
      .album-file-name { min-width: 0; overflow-wrap: anywhere; color: #334155; font-size: 9px; }
      .album-index { flex: 0 0 auto; border-radius: 4px; padding: 2px 5px; background: #f1f5f9; color: #475569; font-size: 9px; font-weight: 700; }
      .bottom-zone { margin-top: auto; display: flex; flex-direction: column; flex: 0 0 auto; break-inside: avoid; page-break-inside: avoid; }
      .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 28px; margin-bottom: 0; break-inside: avoid; page-break-inside: avoid; }
      .sig { text-align: center; color: #475569; }
      .sig-line { border-top: 1px solid #94a3b8; padding-top: 4px; margin-top: 16px; font-weight: 700; color: #1e293b; }
      .continued { min-height: 0; margin-top: auto; display: flex; align-items: center; justify-content: center; padding: 4px 0; text-align: center; color: #14532d; font-weight: 700; }
      @media print {
        /* WYSIWYG contract: print renders exactly like the on-screen preview.
         * The WTI/WTO builders measure their pages at the base (screen) CSS, so
         * the printed page fits by construction. Only the page box (A4 minus
         * 8mm @page margin), toolbar hiding, and color fidelity differ. */
        @page { size: A4 portrait; margin: 8mm; }
        *, *::before, *::after { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { background: white; padding: 0; }
        .toolbar { display: none; }
        .page { width: auto; min-height: 281mm; margin: 0; padding: 0; box-shadow: none; border-radius: 0; break-after: page; page-break-after: always; }
        .page:last-child { break-after: auto; page-break-after: auto; }
        /* Album pages match the normalized item pages: fixed 194×281mm box. */
        .attachment-page { width: 194mm; height: 281mm; min-height: 281mm; max-height: 281mm; padding: 0; margin: 0; }
      }
    </style>
  </head><body>
    <div class="toolbar">
      <button onclick="window.print()">พิมพ์</button>
      <button class="secondary" onclick="window.close()">ปิด</button>
      <span style="font-size: 12px;color:#cbd5e1">A4 portrait multi-page print</span>
    </div>
    ${pageHtml}${attachmentPageHtml}
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
  await openWeightTicketPdfPrint(ticket.documentNo, printWindow)
  printWindow.focus()
}
