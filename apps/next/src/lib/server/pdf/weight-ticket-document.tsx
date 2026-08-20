/* eslint-disable jsx-a11y/alt-text */
import 'server-only'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { type WeightTicketRecord, type StoredImageAsset } from '@/lib/weight-tickets'
import { type CompanyProfilePrintValues } from '@/lib/company-profile'
import {
  buildPrintWeightRows,
  paginatePrintWeightRows,
  buildWeightTicketAttachmentImages,
  formatPrintableNumber,
  NO_IMPURITY_SUMMARY_DETAIL,
  WEIGHT_TICKET_A4_ATTACHMENT_IMAGES_PER_PAGE,
  type PrintWeightRow,
} from '@/lib/weight-ticket-print'
import { PDF_FONT_FAMILY } from './fonts'
import { normalizeThai } from './thai-text'

/**
 * Weight Ticket PDF Document (react-pdf)
 *
 * reimplement ใบชั่งน้ำหนัก ที่เดิมใช้ HTML/CSS + Playwright มาเป็น react-pdf declarative JSX
 * เพื่อกำจัด dependency Chromium binary ออกจาก Docker image
 *
 * หลักการ:
 * - ใช้ business logic เดิม (buildPrintWeightRows, measured 20-row WTI/WTO ceiling) — pure data transform
 * - ทุก string ผ่าน normalizeThai ก่อนเข้า <Text> (แก้ Sara Am truncation, Issue #3295)
 * - CSS Grid → flex rows (react-pdf ไม่มี grid)
 * - <table> → fixed-width flex rows (ความกว้างตาม HTML เดิม)
 * - ใช้ Noto Sans Thai เท่านั้น (ตามมติผู้ใช้)
 */

// ============================================================
// Helpers (pure functions, ไม่มี DOM dependency)
// ============================================================

function nt(value: string | null | undefined): string {
  return normalizeThai(value ?? '')
}

function missing(value: string | null | undefined): string {
  return value && value.trim() ? value : 'ไม่มีข้อมูล'
}

function getPhotoTimestamp(fileName: string, ticketCreatedAt: string | null | undefined): string {
  const msMatch = fileName.match(/\b(\d{13})\b/)
  if (msMatch) {
    const ms = parseInt(msMatch[1], 10)
    const date = new Date(ms)
    if (!isNaN(date.getTime())) return formatTime(date)
  }
  const sMatch = fileName.match(/\b(\d{10})\b/)
  if (sMatch) {
    const s = parseInt(sMatch[1], 10) * 1000
    const date = new Date(s)
    if (!isNaN(date.getTime())) return formatTime(date)
  }
  const date = ticketCreatedAt ? new Date(ticketCreatedAt) : new Date()
  return formatTime(date)
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  })
}

function formatDateTime(value?: string | null): string {
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

// ============================================================
// Styles
// ============================================================

const ACCENT_GREEN = '#166534'
const DOC_TITLE_GREEN = '#14532d'
const FINAL_WEIGHT_GREEN = '#059669'
const TEXT_DARK = '#0f172a'
const TEXT_MUTED = '#64748b'
const TEXT_SECONDARY = '#475569'
const BORDER = '#cbd5e1'
const BORDER_LIGHT = '#dbe3ea'
const BG_HEADER = '#e2e8f0'
const BG_PANEL_TITLE = '#f1f5f9'
const BG_PRODUCT_HEADING = '#f1f5f9'
const BG_LOT_ROW = '#ffffff'
const BG_SOURCE_ROW = '#f8fafc'
const BG_PURCHASE_ROW = '#eff6ff'
const BG_PRODUCT_TOTAL = '#ecfdf5'

const styles = StyleSheet.create({
  page: {
    fontFamily: PDF_FONT_FAMILY,
    fontSize: 10,
    paddingTop: 20,
    paddingBottom: 20,
    paddingLeft: 26,
    paddingRight: 26,
    color: TEXT_DARK,
    lineHeight: 1.24,
  },
  mainPage: { paddingTop: 12, paddingBottom: 8 },
  accent: {
    height: 3,
    backgroundColor: ACCENT_GREEN,
    marginBottom: 8,
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 8,
    marginBottom: 8,
  },
  companyBlock: { flexDirection: 'row', flex: 1.3 },
  logo: { width: 48, height: 48, marginRight: 8, objectFit: 'contain' },
  logoPlaceholder: {
    width: 48,
    height: 48,
    marginRight: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: BORDER,
    backgroundColor: BG_PANEL_TITLE,
    color: TEXT_MUTED,
    fontSize: 7,
    fontWeight: 700,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  companyName: { fontSize: 12, fontWeight: 700, color: TEXT_DARK, lineHeight: 1.16 },
  companyEn: { fontSize: 10, fontWeight: 700, color: TEXT_SECONDARY, marginTop: 1, lineHeight: 1.16 },
  companyInfo: { fontSize: 7, color: TEXT_SECONDARY, marginTop: 1, lineHeight: 1.16 },
  docHead: { flex: 0.7, alignItems: 'flex-end' },
  docTitle: { fontSize: 13, fontWeight: 700, color: DOC_TITLE_GREEN },
  pageLabel: { fontSize: 8, fontWeight: 700, color: DOC_TITLE_GREEN, marginTop: 2 },

  // Section grid (party + doc info)
  sectionGrid: { flexDirection: 'row', gap: 7, marginBottom: 8 },
  panel: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 6,
  },
  panelTitle: {
    padding: 4,
    backgroundColor: BG_PANEL_TITLE,
    color: '#334155',
    fontWeight: 700,
    fontSize: 9,
  },
  panelBody: { padding: 5, flexDirection: 'row', flexWrap: 'wrap' },
  field: { width: '50%', marginBottom: 2, paddingRight: 5 },
  fieldLabel: { fontSize: 8, color: TEXT_SECONDARY, fontWeight: 500 },
  fieldValue: { fontSize: 9, fontWeight: 600, color: TEXT_DARK, marginTop: 0.5 },
  fieldValueStrong: { fontSize: 9.5, color: FINAL_WEIGHT_GREEN, fontWeight: 700, marginTop: 0.5 },

  // Items table (flex rows). The container grows (flexGrow) to fill the page
  // space left after the fixed header/cards, so the summary panels and
  // signatures follow it to the bottom edge. Empty rows inside the container
  // grow equally, mirroring the HTML equal-slot rows.
  tableContainer: { marginTop: 5, flexGrow: 1 },
  tableContainerDense: { marginTop: 3, flexGrow: 1 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BG_HEADER,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tableHeaderCell: {
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    fontWeight: 700,
    color: '#1e293b',
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  tableHeaderCellLast: {
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    fontWeight: 700,
    color: '#1e293b',
  },
  tableHeaderCellDense: {
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 2,
    paddingRight: 2,
    fontSize: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER_LIGHT,
  },
  tableCell: {
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: BORDER_LIGHT,
  },
  tableCellLast: {
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
  },
  tableCellRight: {
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    textAlign: 'right',
    borderRightWidth: 1,
    borderRightColor: BORDER_LIGHT,
  },
  tableCellRightLast: {
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    textAlign: 'right',
  },
  tableCellStrong: {
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    textAlign: 'right',
    fontWeight: 700,
    color: FINAL_WEIGHT_GREEN,
    borderRightWidth: 1,
    borderRightColor: BORDER_LIGHT,
  },
  tableCellStrongLast: {
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    textAlign: 'right',
    fontWeight: 700,
    color: FINAL_WEIGHT_GREEN,
  },
  tableCellDense: {
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 2,
    paddingRight: 2,
    fontSize: 8,
  },
  itemName: { fontWeight: 700, color: TEXT_DARK, fontSize: 9 },
  itemNameDense: { fontSize: 8 },
  muted: { color: TEXT_MUTED, fontSize: 6.4, marginTop: 0.5 },
  mutedDense: { fontSize: 5.8, marginTop: 0 },

  // Row backgrounds (by className)
  bgProductHeading: { backgroundColor: BG_PRODUCT_HEADING },
  bgLotRow: { backgroundColor: BG_LOT_ROW },
  bgSourceRow: { backgroundColor: BG_SOURCE_ROW },
  bgPurchaseRow: { backgroundColor: BG_PURCHASE_ROW },
  bgProductTotal: { backgroundColor: BG_PRODUCT_TOTAL, fontWeight: 700 },
  tablePlaceholderFooter: {
    height: 20,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER_LIGHT,
    backgroundColor: '#ffffff',
  },
  denseTablePlaceholderFooter: { height: 12 },
  // Every page renders the full 20-row form. Empty rows start tiny and grow
  // equally (flexGrow) with the stretched table container, mirroring the HTML
  // equal-slot rows, so twenty cells always fit on one A4 page.
  emptyTableRow: {
    minHeight: 2,
    flexGrow: 1,
    backgroundColor: '#ffffff',
  },
  finalEmptyTableRow: {
    minHeight: 2,
    flexGrow: 1,
  },
  // The inherited page lineHeight resolves once (12.4pt) and would make every
  // tiny cell 12.4pt tall; an explicit unitless lineHeight here re-resolves
  // against the cell's own fontSize so empty slots start nearly zero-height
  // and only the flexGrow distribution gives them equal heights.
  emptyTableCell: {
    paddingTop: 0.1,
    paddingBottom: 0.1,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 2,
    lineHeight: 1.24,
    borderRightWidth: 1,
    borderRightColor: BORDER_LIGHT,
  },
  emptyTableCellLast: {
    paddingTop: 0.1,
    paddingBottom: 0.1,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 2,
    lineHeight: 1.24,
  },

  // Bottom section (summary panels + signatures). The growing table above
  // fills the remaining page space, so this block lands flush at the bottom
  // of the A4 form like the HTML .bottom-zone.
  bottomZone: {},
  bottomGrid: { flexDirection: 'row', gap: 7, marginTop: 6 },
  bottomPanelBody: { padding: 4, flexDirection: 'row', flexWrap: 'wrap' },
  bottomField: { width: '50%', marginBottom: 1, paddingRight: 5 },
  weightInfoBody: { paddingBottom: 7 },
  weightInfoRightField: { alignItems: 'flex-end', paddingRight: 0 },
  bottomNetField: {
    width: '50%',
    marginLeft: '50%',
    marginBottom: 3,
    paddingRight: 0,
    alignItems: 'flex-end',
  },
  noteText: { fontSize: 9, color: TEXT_DARK },
  // Signatures. The marginTop mirrors the HTML print contract (24px ≈ 18pt)
  // between the bottom grid and the signature lines.
  signatures: { flexDirection: 'row', gap: 12, marginTop: 18, marginBottom: 14 },
  sig: { flex: 1 },
  sigLine: {
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    paddingTop: 4,
    marginTop: 10,
    fontSize: 9,
    fontWeight: 700,
    textAlign: 'center',
  },
  sigDate: {
    fontSize: 8,
    color: TEXT_MUTED,
    marginTop: 2,
    textAlign: 'center',
  },

  // Continued marker
  continued: {
    textAlign: 'center',
    fontSize: 9,
    fontWeight: 700,
    color: DOC_TITLE_GREEN,
    paddingTop: 4,
    paddingBottom: 4,
  },
  continuedDense: {
    fontSize: 8,
    paddingTop: 4,
    paddingBottom: 4,
  },
  albumHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 6,
  },
  albumTitleBlock: {
    flex: 1,
  },
  albumTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: DOC_TITLE_GREEN,
    lineHeight: 1.25,
  },
  albumSubtitle: {
    fontSize: 10,
    color: TEXT_SECONDARY,
    marginTop: 5,
    lineHeight: 1.25,
  },
  albumPageBlock: {
    alignItems: 'flex-end',
  },
  albumPageText: {
    fontSize: 10,
    fontWeight: 700,
    color: TEXT_MUTED,
  },
  albumHeaderSeparator: {
    height: 1,
    backgroundColor: BORDER,
    marginBottom: 10,
  },
  albumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  albumCard: {
    width: 260,
    borderWidth: 1,
    borderColor: BORDER_LIGHT,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  albumImageWrapper: {
    position: 'relative',
    height: 195,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  albumImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  albumCardBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 6,
    paddingRight: 6,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    height: 20,
  },
  albumFileName: {
    fontSize: 8,
    color: TEXT_SECONDARY,
    width: '60%',
    overflow: 'hidden',
  },
  albumIndexBadge: {
    backgroundColor: '#0f172a',
    paddingTop: 1.5,
    paddingBottom: 1.5,
    paddingLeft: 5,
    paddingRight: 5,
    borderRadius: 99,
  },
  albumIndexText: {
    fontSize: 7.5,
    fontWeight: 700,
    color: '#ffffff',
  },

})

// Column widths (mm → pt approx: 1mm ≈ 2.83pt)
// ตาม HTML: 7mm / auto / 21mm / 21mm / 32mm / 26mm / 21mm
const COL_RANK = '4%'
const COL_ITEM = '30%'
const COL_GROSS = '12%'
const COL_CONTAINER = '12%'
const COL_AFTER_CONTAINER = '16%'
const COL_DEDUCTION = '12%'
const COL_NET = '14%'

// WTO columns: # / item / gross / container / net
const COL_NET_WTO = '26%'

// ============================================================
// Sub-components
// ============================================================

function ItemRow({ row, isReceipt, dense = false }: { row: PrintWeightRow; isReceipt: boolean; dense?: boolean }) {
  const afterContainerWeight = Math.max(0, row.grossWeight - row.containerDeductionWeight)
  const inlineNoImpurityDetail = dense && row.detail === NO_IMPURITY_SUMMARY_DETAIL
  const cellDensity = dense ? styles.tableCellDense : {}
  const itemNameDensity = dense ? styles.itemNameDense : {}
  const mutedDensity = dense ? styles.mutedDense : {}
  const bgStyle =
    row.className === 'product-heading' ? styles.bgProductHeading
      : row.className === 'lot-row' ? styles.bgLotRow
        : row.className === 'source-row' ? styles.bgSourceRow
          : row.className === 'purchase-row' ? styles.bgPurchaseRow
            : row.className === 'product-total' ? styles.bgProductTotal
              : {}

  if (row.continuation) {
    return (
      <View style={[styles.tableRow, bgStyle]} wrap={false}>
        <View style={[styles.tableCell, cellDensity, { width: COL_RANK, textAlign: 'center' }]}>
          <Text>{''}</Text>
        </View>
        <View style={[styles.tableCellLast, cellDensity, { width: isReceipt ? `${100 - 4}%` : `${100 - 4 - 12 - 12 - 26}%` }]}>
          {row.label ? <Text style={[styles.muted, mutedDensity]}>{nt(row.label)}</Text> : null}
          {row.detail ? <Text style={[styles.muted, mutedDensity]}>{nt(row.detail)}</Text> : null}
        </View>
      </View>
    )
  }

  if (row.className === 'product-heading') {
    return (
      <View style={[styles.tableRow, bgStyle]} wrap={false}>
        <View style={[styles.tableCell, cellDensity, { width: COL_RANK, textAlign: 'center' }]}>
          <Text>{nt(row.rank || '')}</Text>
        </View>
        <View style={[styles.tableCellLast, cellDensity, { width: isReceipt ? `${100 - 4}%` : `${100 - 4 - 12 - 12 - 26}%` }]}>
          <Text style={[styles.itemName, itemNameDensity]}>
            {nt(row.productName)}
            {inlineNoImpurityDetail ? <Text style={[styles.muted, mutedDensity]}>{nt(` · ${row.detail}`)}</Text> : null}
          </Text>
          {!inlineNoImpurityDetail ? <Text style={[styles.muted, mutedDensity]}>{nt(row.detail)}</Text> : null}
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.tableRow, bgStyle]} wrap={false}>
      <View style={[styles.tableCell, cellDensity, { width: COL_RANK, textAlign: 'center' }]}>
        <Text>{nt(row.rank || '')}</Text>
      </View>
      <View style={[styles.tableCell, cellDensity, { width: isReceipt ? COL_ITEM : `${100 - 4 - 12 - 12 - 26}%` }]}>
        <Text style={[styles.itemName, itemNameDensity]}>
          {nt(row.productName)}
          {inlineNoImpurityDetail ? <Text style={[styles.muted, mutedDensity]}>{nt(` · ${row.detail}`)}</Text> : null}
        </Text>
        {row.label ? <Text style={[styles.muted, mutedDensity]}>{nt(row.label)}</Text> : null}
        {row.detail && !inlineNoImpurityDetail ? <Text style={[styles.muted, mutedDensity]}>{nt(row.detail)}</Text> : null}
      </View>
      <View style={[styles.tableCellRight, cellDensity, { width: COL_GROSS }]}>
        <Text>{row.continuation ? '' : formatPrintableNumber(row.grossWeight)}</Text>
      </View>
      <View style={[styles.tableCellRight, cellDensity, { width: COL_CONTAINER }]}>
        <Text>{row.continuation ? '' : formatPrintableNumber(row.containerDeductionWeight)}</Text>
      </View>
      {isReceipt ? (
        <>
          <View style={[styles.tableCellRight, cellDensity, { width: COL_AFTER_CONTAINER }]}>
            <Text>{row.continuation ? '' : formatPrintableNumber(afterContainerWeight)}</Text>
          </View>
          <View style={[styles.tableCellRight, cellDensity, { width: COL_DEDUCTION }]}>
            <Text>{row.continuation ? '' : formatPrintableNumber(row.deductionWeight)}</Text>
          </View>
        </>
      ) : null}
      <View style={[styles.tableCellStrongLast, cellDensity, { width: isReceipt ? COL_NET : COL_NET_WTO }]}>
        <Text>{row.continuation ? '' : formatPrintableNumber(row.netWeight)}</Text>
      </View>
    </View>
  )
}

function TableHeader({ isReceipt, dense = false }: { isReceipt: boolean; dense?: boolean }) {
  const density = dense ? styles.tableHeaderCellDense : {}
  return (
    <View style={styles.tableHeader}>
      <Text style={[styles.tableHeaderCell, density, { width: COL_RANK, textAlign: 'center' }]}>#</Text>
      <Text style={[styles.tableHeaderCell, density, { width: isReceipt ? COL_ITEM : `${100 - 4 - 12 - 12 - 26}%` }]}>
        {nt('รายการสินค้า')}
      </Text>
      <Text style={[styles.tableHeaderCell, density, { width: COL_GROSS, textAlign: 'right' }]}>{nt('น้ำหนักรวม')}</Text>
      <Text style={[styles.tableHeaderCell, density, { width: COL_CONTAINER, textAlign: 'right' }]}>{nt('หักภาชนะ')}</Text>
      {isReceipt ? (
        <>
          <Text style={[styles.tableHeaderCell, density, { width: COL_AFTER_CONTAINER, textAlign: 'right' }]}>
            {nt('น้ำหนักหลังหักภาชนะ')}
          </Text>
          <Text style={[styles.tableHeaderCell, density, { width: COL_DEDUCTION, textAlign: 'right' }]}>
            {nt('หักสิ่งเจือปน')}
          </Text>
        </>
      ) : null}
      <Text style={[styles.tableHeaderCellLast, density, { width: isReceipt ? COL_NET : COL_NET_WTO, textAlign: 'right' }]}>
        {nt('น้ำหนักสุทธิ')}
      </Text>
    </View>
  )
}

function TableFooter({ ticket, isReceipt }: { ticket: WeightTicketRecord; isReceipt: boolean }) {
  const totalAfterContainer = Math.max(0, ticket.totals.grossWeight - ticket.totals.containerDeductionWeight)
  const labelWidth = isReceipt ? '34%' : '50%'
  return (
    <View style={[styles.tableRow, styles.bgProductTotal]}>
      <View style={[styles.tableCellRight, { width: labelWidth }]}>
        <Text>{nt('รวมทั้งสิ้น')}</Text>
      </View>
      <View style={[styles.tableCellRight, { width: COL_GROSS }]}>
        <Text>{formatPrintableNumber(ticket.totals.grossWeight)}</Text>
      </View>
      <View style={[styles.tableCellRight, { width: COL_CONTAINER }]}>
        <Text>{formatPrintableNumber(ticket.totals.containerDeductionWeight)}{isReceipt ? ' kg' : ''}</Text>
      </View>
      {isReceipt ? (
        <>
          <View style={[styles.tableCellRight, { width: COL_AFTER_CONTAINER }]}>
            <Text>{formatPrintableNumber(totalAfterContainer)} kg</Text>
          </View>
          <View style={[styles.tableCellRight, { width: COL_DEDUCTION }]}>
            <Text>{formatPrintableNumber(ticket.totals.deductionWeight)} kg</Text>
          </View>
        </>
      ) : null}
      <View style={[styles.tableCellStrongLast, { width: isReceipt ? COL_NET : COL_NET_WTO }]}>
        <Text>{formatPrintableNumber(ticket.totals.netWeight)}</Text>
      </View>
    </View>
  )
}

function EmptyTableFooter({ dense = false }: { dense?: boolean }) {
  return (
    <View style={[styles.tablePlaceholderFooter, dense ? styles.denseTablePlaceholderFooter : {}]}>
      <Text>{' '}</Text>
    </View>
  )
}

function EmptyTableRow({ isReceipt, isFinalPage }: { isReceipt: boolean; isFinalPage: boolean }) {
  const widths = isReceipt
    ? [COL_RANK, COL_ITEM, COL_GROSS, COL_CONTAINER, COL_AFTER_CONTAINER, COL_DEDUCTION, COL_NET]
    : [COL_RANK, `${100 - 4 - 12 - 12 - 26}%`, COL_GROSS, COL_CONTAINER, COL_NET_WTO]

  return (
    <View style={[styles.tableRow, styles.emptyTableRow, ...(isFinalPage ? [styles.finalEmptyTableRow] : [])]}>
      {widths.map((width, index) => (
        <View
          key={`empty-cell-${index}`}
          style={[index === widths.length - 1 ? styles.emptyTableCellLast : styles.emptyTableCell, { width }]}
        >
          <Text>{' '}</Text>
        </View>
      ))}
    </View>
  )
}

// ============================================================
// Main Document
// ============================================================

export interface WeightTicketDocumentProps {
  ticket: WeightTicketRecord
  profile: CompanyProfilePrintValues
}

export function WeightTicketDocument({ ticket, profile }: WeightTicketDocumentProps) {
  const isReceipt = ticket.type === 'WTI'
  const docTitle = isReceipt ? 'ใบชั่งน้ำหนัก / ใบรับสินค้า' : 'ใบชั่งน้ำหนัก / ใบส่งของ'
  const partyLabel = isReceipt ? 'ผู้ขาย/ผู้ส่งของ' : 'ลูกค้า/ผู้รับสินค้า'
  const signatureLeft = isReceipt ? 'ผู้ส่งสินค้า' : 'ผู้ส่งของ'
  const signatureMiddle = isReceipt ? 'ผู้รับเข้าคลัง' : 'ผู้รับของ'
  const branchLabel = ticket.branchName?.trim() ? `สาขา ${ticket.branchName.trim()}` : ''

  // Business logic (reuse จาก HTML template)
  const printRows = buildPrintWeightRows(ticket, isReceipt)
  const pages = paginatePrintWeightRows(printRows, isReceipt)
  const totalPages = pages.length

  // Lot info (เหมือน HTML template)
  const isLotLine = (line: WeightTicketRecord['lines'][number]) => {
    if (!isReceipt) return true
    return line.grossWeightValue > 0 && line.impuritySourceLineNo == null
  }
  const lotLines = ticket.lines.filter(isLotLine)
  const lotCount = lotLines.length

  const decodedImages = buildWeightTicketAttachmentImages(ticket)

  const albumChunks: Array<StoredImageAsset[]> = []
  // Six 4:3 cards fit on an A4 portrait page as a 2-column x 3-row grid
  // while keeping the source image fully visible with object-fit contain.
  const albumChunkSize = WEIGHT_TICKET_A4_ATTACHMENT_IMAGES_PER_PAGE
  for (let i = 0; i < decodedImages.length; i += albumChunkSize) {
    albumChunks.push(decodedImages.slice(i, i + albumChunkSize))
  }

  const companyNameText = missing(profile.name).replace(/[\r\n]+/g, ' ').trim()
  const companyNameEnText = profile.nameEn?.replace(/[\r\n]+/g, ' ').trim() || ''

  const rawAddress = missing(profile.address)
  const renderAddress = () => {
    const splitWord = 'จังหวัด'
    const index = rawAddress.indexOf(splitWord)
    if (index !== -1) {
      const part1 = rawAddress.slice(0, index).trim()
      const part2 = rawAddress.slice(index).trim()
      return (
        <>
          <Text style={styles.companyInfo}>{nt(part1)}</Text>
          <Text style={styles.companyInfo}>{nt(part2)}</Text>
        </>
      )
    }
    return <Text style={styles.companyInfo}>{nt(rawAddress)}</Text>
  }

  const otherInfoLines = [
    `โทร ${missing(profile.phone)}${profile.fax ? ` · แฟกซ์ ${profile.fax}` : ''}`,
    `เลขประจำตัวผู้เสียภาษี: ${missing(profile.taxId)}${branchLabel ? ` · ${branchLabel}` : ''}`,
    ...(profile.email ? [`Email: ${profile.email}`] : []),
    ...(profile.website ? [`Website: ${profile.website}`] : []),
  ]

  return (
    <Document>
      {pages.map((page, pageIndex) => {
        const isLastPage = pageIndex === totalPages - 1
        const denseTable = page.items.length > 14
        return (
          <Page key={pageIndex} size="A4" style={[styles.page, styles.mainPage]}>
            {/* Accent */}
            <View style={styles.accent} />

            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.companyBlock}>
                {profile.logoUrl ? (
                  <Image src={profile.logoUrl} style={styles.logo} />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Text>{nt('ไม่มีข้อมูล')}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.companyName}>{nt(companyNameText)}</Text>
                  {companyNameEnText ? <Text style={styles.companyEn}>{nt(companyNameEnText)}</Text> : null}
                  {renderAddress()}
                  {otherInfoLines.map((line, i) => (
                    <Text key={i} style={styles.companyInfo}>{nt(line)}</Text>
                  ))}
                </View>
              </View>
              <View style={styles.docHead}>
                <Text style={styles.docTitle}>{nt(docTitle)}</Text>
                <Text style={styles.pageLabel}>{nt(`หน้า ${pageIndex + 1} / ${totalPages}`)}</Text>
              </View>
            </View>

            {/* Section grid: party info + doc info */}
            <View style={styles.sectionGrid}>
              <View style={[styles.panel, { flex: 1 }]}>
                <Text style={styles.panelTitle}>{nt(partyLabel)}</Text>
                <View style={styles.panelBody}>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{nt('ชื่อ')}</Text>
                    <Text style={styles.fieldValue}>{nt(ticket.partyName || '-')}</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{nt('ทะเบียนรถ')}</Text>
                    <Text style={styles.fieldValue}>{nt(ticket.vehicleNo || '-')}</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{nt('สาขา')}</Text>
                    <Text style={styles.fieldValue}>{nt(ticket.branchName || '-')}</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{nt('พนักงานชั่ง')}</Text>
                    <Text style={styles.fieldValue}>{nt(ticket.enteredBy || '-')}</Text>
                  </View>
                </View>
              </View>
              <View style={[styles.panel, { flex: 1 }]}>
                <Text style={styles.panelTitle}>{nt('ข้อมูลเอกสาร / Document Info')}</Text>
                <View style={styles.panelBody}>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{nt('เลขที่เอกสาร')}</Text>
                    <Text style={styles.fieldValue}>{nt(ticket.documentNo)}</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{nt('วันที่เอกสาร')}</Text>
                    <Text style={styles.fieldValue}>{nt(ticket.documentDate || '-')}</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{nt('เวลาสร้าง')}</Text>
                    <Text style={styles.fieldValue}>{nt(formatDateTime(ticket.createdAt))}</Text>
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>{nt('โกดัง')}</Text>
                    <Text style={styles.fieldValue}>{nt(ticket.godownName || '-')}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Items table */}
            <View style={[styles.tableContainer, denseTable ? styles.tableContainerDense : {}]}>
              <TableHeader isReceipt={isReceipt} dense={denseTable} />
              {page.items.map((row, idx) => (
                <ItemRow key={idx} row={row} isReceipt={isReceipt} dense={denseTable} />
              ))}
              {Array.from({ length: Math.max(0, page.capacity - page.items.length) }, (_, idx) => (
                <EmptyTableRow key={`empty-row-${idx}`} isReceipt={isReceipt} isFinalPage={isLastPage} />
              ))}
              {isLastPage ? <TableFooter ticket={ticket} isReceipt={isReceipt} /> : <EmptyTableFooter dense={denseTable} />}
            </View>

            {/* Bottom section (final page only); the table container above
                flexes to fill the page, so the bottom sections stay pinned. */}
            {isLastPage ? (
              <View style={styles.bottomZone}>
                <View style={styles.bottomGrid}>
                  <View style={[styles.panel, { flex: 1.15 }]}>
                    <Text style={styles.panelTitle}>{nt('สรุปตามหมวดสินค้า')}</Text>
                    <View style={styles.bottomPanelBody}>
                      {Array.from(ticket.productSummaries.reduce((map, summary) => {
                        const cat = summary.categoryName || 'อื่นๆ'
                        map.set(cat, (map.get(cat) || 0) + summary.netWeight)
                        return map
                      }, new Map<string, number>()).entries()).map(([cat, weight], idx) => (
                        <View key={`cat-${idx}`} style={styles.bottomField}>
                          <Text style={styles.fieldLabel}>{nt(cat)}</Text>
                          <Text style={styles.fieldValue}>{formatPrintableNumber(weight)} kg</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <View style={[styles.panel, { flex: 0.8 }]}>
                    <Text style={styles.panelTitle}>{nt('หมายเหตุ')}</Text>
                    <View style={styles.bottomPanelBody}>
                      <Text style={styles.noteText}>{nt(ticket.remark || '-')}</Text>
                    </View>
                  </View>
                  <View style={[styles.panel, { flex: 1.05 }]}>
                    <Text style={styles.panelTitle}>{nt('ข้อมูลน้ำหนัก / Weight Info')}</Text>
                    <View style={[styles.bottomPanelBody, styles.weightInfoBody]}>
                      <View style={styles.bottomField}>
                        <Text style={styles.fieldLabel}>{nt('จำนวนรายการ')}</Text>
                        <Text style={styles.fieldValue}>{lotCount} {nt('รายการ')}</Text>
                      </View>
                      <View style={[styles.bottomField, styles.weightInfoRightField]}>
                        <Text style={styles.fieldLabel}>{nt('น้ำหนักรวม')}</Text>
                        <Text style={styles.fieldValue}>{formatPrintableNumber(ticket.totals.grossWeight)} kg</Text>
                      </View>
                      <View style={styles.bottomField}>
                        <Text style={styles.fieldLabel}>{nt('หักภาชนะ')}</Text>
                        <Text style={styles.fieldValue}>{formatPrintableNumber(ticket.totals.containerDeductionWeight)} kg</Text>
                      </View>
                      <View style={[styles.bottomField, styles.weightInfoRightField]}>
                        <Text style={styles.fieldLabel}>{nt('หักสิ่งเจือปน')}</Text>
                        <Text style={styles.fieldValue}>{formatPrintableNumber(ticket.totals.deductionWeight)} kg</Text>
                      </View>
                      <View style={styles.bottomNetField}>
                        <Text style={styles.fieldLabel}>{nt('น้ำหนักสุทธิ')}</Text>
                        <Text style={styles.fieldValueStrong}>{formatPrintableNumber(ticket.totals.netWeight)} kg</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Signatures */}
                <View style={styles.signatures} wrap={false}>
                  <View style={styles.sig}>
                    <Text style={styles.sigLine}>{nt(signatureLeft)}</Text>
                    <Text style={styles.sigDate}>{nt('วันที่ ____ / ____ / ______')}</Text>
                  </View>
                  <View style={styles.sig}>
                    <Text style={styles.sigLine}>{nt('พนักงานชั่ง')}</Text>
                    <Text style={styles.sigDate}>{nt(ticket.enteredBy || '-')}</Text>
                  </View>
                  <View style={styles.sig}>
                    <Text style={styles.sigLine}>{nt(signatureMiddle)}</Text>
                    <Text style={styles.sigDate}>{nt('วันที่ ____ / ____ / ______')}</Text>
                  </View>
                  <View style={styles.sig}>
                    <Text style={styles.sigLine}>{nt('ผู้อนุมัติ')}</Text>
                    <Text style={styles.sigDate}>{nt('วันที่ ____ / ____ / ______')}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.bottomZone}>
                <Text style={[styles.continued, denseTable ? styles.continuedDense : {}]}>{nt(`( มีต่อหน้า ${pageIndex + 2} / Continued on Page ${pageIndex + 2} ➔ )`)}</Text>
              </View>
            )}

          </Page>
        )
      })}
      {albumChunks.map((chunk, chunkIdx) => (
        <Page key={`album-${chunkIdx}`} size="A4" style={styles.page}>
          <View style={styles.accent} />

          <View style={styles.albumHeader}>
            <View style={styles.albumTitleBlock}>
              <Text style={styles.albumTitle}>{nt(isReceipt ? 'ใบรับสินค้า (รูปถ่ายแนบ)' : 'ใบส่งของ (รูปถ่ายแนบ)')}</Text>
              <Text style={styles.albumSubtitle}>
                {nt(`เลขที่เอกสาร: ${ticket.documentNo} · คู่ค้า: ${ticket.partyName} · วันที่: ${ticket.documentDate || '-'}`)}
              </Text>
            </View>
            <View style={styles.albumPageBlock}>
              <Text
                style={styles.albumPageText}
                render={({ pageNumber, totalPages }) => nt(`${profile.nameEn || 'NS Scrap ERP'} · หน้า ${pageNumber} / ${totalPages}`)}
              />
            </View>
          </View>
          <View style={styles.albumHeaderSeparator} />

          <View style={styles.albumGrid}>
            {chunk.map((img, imgIdx) => {
              const globalIdx = chunkIdx * albumChunkSize + imgIdx + 1
              const photoTime = getPhotoTimestamp(img.fileName, ticket.createdAt)

              return (
                <View key={imgIdx} style={styles.albumCard}>
                  <View style={styles.albumImageWrapper}>
                    <Image src={img.url || ''} style={styles.albumImage} />
                  </View>

                  <View style={styles.albumCardBar}>
                    <Text style={styles.albumFileName}>{nt(img.fileName)}</Text>
                    <View style={styles.albumIndexBadge}>
                      <Text style={styles.albumIndexText}>{nt(`#${globalIdx} · ${photoTime}`)}</Text>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        </Page>
      ))}
    </Document>
  )
}
