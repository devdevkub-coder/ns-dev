/* eslint-disable jsx-a11y/alt-text */
import 'server-only'
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer'
import { type WeightTicketRecord, decodeStoredImageAsset, type StoredImageAsset } from '@/lib/weight-tickets'
import { type CompanyProfilePrintValues } from '@/lib/company-profile'
import {
  buildPrintWeightRows,
  formatPrintableNumber,
  FIRST_PAGE_ITEM_ROWS,
  CONTINUATION_PAGE_ITEM_ROWS,
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
 * - ใช้ business logic เดิม (buildPrintWeightRows, pagination 12/17) — pure data transform
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

  // Items table (flex rows)
  tableContainer: { marginTop: 5 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BG_HEADER,
    borderWidth: 1,
    borderColor: BORDER,
  },
  tableHeaderCell: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    fontWeight: 700,
    color: '#1e293b',
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  tableHeaderCellLast: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    fontWeight: 700,
    color: '#1e293b',
  },
  tableRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: BORDER_LIGHT,
  },
  tableCell: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    borderRightWidth: 1,
    borderRightColor: BORDER_LIGHT,
  },
  tableCellLast: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
  },
  tableCellRight: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    textAlign: 'right',
    borderRightWidth: 1,
    borderRightColor: BORDER_LIGHT,
  },
  tableCellRightLast: {
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    textAlign: 'right',
  },
  tableCellStrong: {
    paddingTop: 4,
    paddingBottom: 4,
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
    paddingTop: 4,
    paddingBottom: 4,
    paddingLeft: 3,
    paddingRight: 3,
    fontSize: 9,
    textAlign: 'right',
    fontWeight: 700,
    color: FINAL_WEIGHT_GREEN,
  },
  itemName: { fontWeight: 700, color: TEXT_DARK, fontSize: 9 },
  muted: { color: TEXT_MUTED, fontSize: 6.4, marginTop: 0.5 },

  // Row backgrounds (by className)
  bgProductHeading: { backgroundColor: BG_PRODUCT_HEADING },
  bgLotRow: { backgroundColor: BG_LOT_ROW },
  bgSourceRow: { backgroundColor: BG_SOURCE_ROW },
  bgPurchaseRow: { backgroundColor: BG_PURCHASE_ROW },
  bgProductTotal: { backgroundColor: BG_PRODUCT_TOTAL, fontWeight: 700 },

  // Bottom section
  bottomGrid: { flexDirection: 'row', gap: 7, marginTop: 8 },
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

  // Signatures
  signatures: { flexDirection: 'row', gap: 12, marginTop: 18 },
  sig: { flex: 1 },
  sigLine: {
    borderTopWidth: 1,
    borderTopColor: '#94a3b8',
    paddingTop: 4,
    marginTop: 18,
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

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    borderTopStyle: 'dashed' as any,
    fontSize: 7.2,
    color: TEXT_MUTED,
  },

  // Continued marker
  continued: {
    textAlign: 'right',
    fontSize: 9,
    fontWeight: 700,
    color: TEXT_MUTED,
    paddingTop: 8,
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
    height: 120,
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
  },
  albumImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  albumBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 6,
    paddingRight: 6,
    borderRadius: 4,
  },
  albumBadgeText: {
    fontSize: 9,
    fontWeight: 700,
    color: '#ffffff',
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
  spacer: {
    flexGrow: 1,
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

function ItemRow({ row, isReceipt }: { row: PrintWeightRow; isReceipt: boolean }) {
  const afterContainerWeight = Math.max(0, row.grossWeight - row.containerDeductionWeight)
  const bgStyle =
    row.className === 'product-heading' ? styles.bgProductHeading
      : row.className === 'lot-row' ? styles.bgLotRow
        : row.className === 'source-row' ? styles.bgSourceRow
          : row.className === 'purchase-row' ? styles.bgPurchaseRow
            : row.className === 'product-total' ? styles.bgProductTotal
              : {}

  if (row.className === 'product-heading') {
    return (
      <View style={[styles.tableRow, bgStyle]}>
        <View style={[styles.tableCell, { width: COL_RANK, textAlign: 'center' }]}>
          <Text>{nt(row.rank || '')}</Text>
        </View>
        <View style={[styles.tableCellLast, { width: isReceipt ? `${100 - 4}%` : `${100 - 4 - 12 - 12 - 26}%` }]}>
          <Text style={styles.itemName}>{nt(row.productName)}</Text>
          <Text style={styles.muted}>{nt(row.detail)}</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.tableRow, bgStyle]}>
      <View style={[styles.tableCell, { width: COL_RANK, textAlign: 'center' }]}>
        <Text>{nt(row.rank || '')}</Text>
      </View>
      <View style={[styles.tableCell, { width: isReceipt ? COL_ITEM : `${100 - 4 - 12 - 12 - 26}%` }]}>
        <Text style={styles.itemName}>{nt(row.productName)}</Text>
        {row.label ? <Text style={styles.muted}>{nt(row.label)}</Text> : null}
        <Text style={styles.muted}>{nt(row.detail)}</Text>
      </View>
      <View style={[styles.tableCellRight, { width: COL_GROSS }]}>
        <Text>{formatPrintableNumber(row.grossWeight)}</Text>
      </View>
      <View style={[styles.tableCellRight, { width: COL_CONTAINER }]}>
        <Text>{formatPrintableNumber(row.containerDeductionWeight)}</Text>
      </View>
      {isReceipt ? (
        <>
          <View style={[styles.tableCellRight, { width: COL_AFTER_CONTAINER }]}>
            <Text>{formatPrintableNumber(afterContainerWeight)}</Text>
          </View>
          <View style={[styles.tableCellRight, { width: COL_DEDUCTION }]}>
            <Text>{formatPrintableNumber(row.deductionWeight)}</Text>
          </View>
        </>
      ) : null}
      <View style={[styles.tableCellStrongLast, { width: isReceipt ? COL_NET : COL_NET_WTO }]}>
        <Text>{formatPrintableNumber(row.netWeight)}</Text>
      </View>
    </View>
  )
}

function FillerRow({ isReceipt }: { isReceipt: boolean }) {
  return (
    <View style={[styles.tableRow, { height: 14 }]}>
      <View style={[styles.tableCell, { width: COL_RANK }]}><Text> </Text></View>
      <View style={[styles.tableCell, { width: isReceipt ? COL_ITEM : `${100 - 4 - 12 - 12 - 26}%` }]}><Text> </Text></View>
      <View style={[styles.tableCellRight, { width: COL_GROSS }]}><Text> </Text></View>
      <View style={[styles.tableCellRight, { width: COL_CONTAINER }]}><Text> </Text></View>
      {isReceipt ? (
        <>
          <View style={[styles.tableCellRight, { width: COL_AFTER_CONTAINER }]}><Text> </Text></View>
          <View style={[styles.tableCellRight, { width: COL_DEDUCTION }]}><Text> </Text></View>
        </>
      ) : null}
      <View style={[styles.tableCellStrongLast, { width: isReceipt ? COL_NET : COL_NET_WTO }]}><Text> </Text></View>
    </View>
  )
}

function TableHeader({ isReceipt }: { isReceipt: boolean }) {
  return (
    <View style={styles.tableHeader}>
      <Text style={[styles.tableHeaderCell, { width: COL_RANK, textAlign: 'center' }]}>#</Text>
      <Text style={[styles.tableHeaderCell, { width: isReceipt ? COL_ITEM : `${100 - 4 - 12 - 12 - 26}%` }]}>
        {nt('รายการสินค้า')}
      </Text>
      <Text style={[styles.tableHeaderCell, { width: COL_GROSS, textAlign: 'right' }]}>{nt('น้ำหนักรวม')}</Text>
      <Text style={[styles.tableHeaderCell, { width: COL_CONTAINER, textAlign: 'right' }]}>{nt('หักภาชนะ')}</Text>
      {isReceipt ? (
        <>
          <Text style={[styles.tableHeaderCell, { width: COL_AFTER_CONTAINER, textAlign: 'right' }]}>
            {nt('น้ำหนักหลังหักภาชนะ')}
          </Text>
          <Text style={[styles.tableHeaderCell, { width: COL_DEDUCTION, textAlign: 'right' }]}>
            {nt('หักสิ่งเจือปน')}
          </Text>
        </>
      ) : null}
      <Text style={[styles.tableHeaderCellLast, { width: isReceipt ? COL_NET : COL_NET_WTO, textAlign: 'right' }]}>
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
  const pages: Array<{ capacity: number; items: PrintWeightRow[] }> = []
  let cursor = 0
  while (cursor < printRows.length || pages.length === 0) {
    const capacity = pages.length === 0 ? FIRST_PAGE_ITEM_ROWS : CONTINUATION_PAGE_ITEM_ROWS
    pages.push({ capacity, items: printRows.slice(cursor, cursor + capacity) })
    cursor += capacity
  }
  const totalPages = pages.length

  // Lot info (เหมือน HTML template)
  const isLotLine = (line: WeightTicketRecord['lines'][number]) => {
    if (!isReceipt) return true
    return line.grossWeightValue > 0 && !line.note.includes('มาจากสิ่งเจือปน')
  }
  const lotLines = ticket.lines.filter(isLotLine)
  const lotCount = lotLines.length
  const lotGrossWeight = lotLines.reduce((sum, line) => sum + line.grossWeightValue, 0)
  const lotContainerWeight = lotLines.reduce((sum, line) => sum + line.containerDeductionWeightValue, 0)

  const ticketImages = ticket.imageNames || []
  const decodedImages = ticketImages
    .map((img) => decodeStoredImageAsset(img))
    .filter((img) => img.url && (img.url.startsWith('http') || img.url.startsWith('data:')))

  const albumChunks: Array<StoredImageAsset[]> = []
  const albumChunkSize = 8
  for (let i = 0; i < decodedImages.length; i += albumChunkSize) {
    albumChunks.push(decodedImages.slice(i, i + albumChunkSize))
  }

  const companyNameText = missing(profile.name)
  const renderCompanyName = () => {
    const suffix = '(สำนักงานใหญ่)'
    if (companyNameText.endsWith(suffix)) {
      const base = companyNameText.slice(0, -suffix.length).trim()
      return (
        <>
          <Text style={styles.companyName}>{nt(base)}</Text>
          <Text style={styles.companyName}>{nt(suffix)}</Text>
        </>
      )
    }
    return <Text style={styles.companyName}>{nt(companyNameText)}</Text>
  }

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
        return (
          <Page key={pageIndex} size="A4" style={styles.page}>
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
                  {renderCompanyName()}
                  {profile.nameEn ? <Text style={styles.companyEn}>{nt(profile.nameEn)}</Text> : null}
                  {renderAddress()}
                  {otherInfoLines.map((line, i) => (
                    <Text key={i} style={styles.companyInfo}>{nt(line)}</Text>
                  ))}
                </View>
              </View>
              <View style={styles.docHead}>
                <Text style={styles.docTitle}>{nt(docTitle)}</Text>
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
            <View style={styles.tableContainer}>
              <TableHeader isReceipt={isReceipt} />
              {page.items.map((row, idx) => (
                <ItemRow key={idx} row={row} isReceipt={isReceipt} />
              ))}
              {/* Filler rows to align height exactly with printed output */}
              {Array.from({ length: Math.max(0, page.capacity - page.items.length) }).map((_, idx) => (
                <FillerRow key={`filler-${idx}`} isReceipt={isReceipt} />
              ))}
              {isLastPage ? <TableFooter ticket={ticket} isReceipt={isReceipt} /> : null}
            </View>

            {!isLastPage ? <View style={styles.spacer} /> : null}

            {/* Bottom section (last page only) */}
            {isLastPage ? (
              <>
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
                        <Text style={styles.fieldValue}>{formatPrintableNumber(lotGrossWeight)} kg</Text>
                      </View>
                      <View style={styles.bottomField}>
                        <Text style={styles.fieldLabel}>{nt('หักภาชนะ')}</Text>
                        <Text style={styles.fieldValue}>{formatPrintableNumber(lotContainerWeight)} kg</Text>
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
                <View style={styles.signatures}>
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
              </>
            ) : (
              <Text style={styles.continued}>{nt('ต่อหน้าถัดไป')}</Text>
            )}

            {/* Footer */}
            <View style={styles.footer}>
              <Text>{nt(profile.footerNote || '')}</Text>
              <Text render={({ pageNumber, totalPages }) => `${nt('หน้า')} ${pageNumber} / ${totalPages}`} />
            </View>
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
              const isOut = img.fileName.toLowerCase().includes('out') ||
                img.fileName.toLowerCase().includes('exit') ||
                img.fileName.includes('ขาออก')
              const badgeText = isOut ? 'ขาออก' : (isReceipt ? 'รับเข้า' : 'ขาออก')
              const badgeColor = isOut ? '#10b981' : '#0ea5e9'
              const photoTime = getPhotoTimestamp(img.fileName, ticket.createdAt)

              return (
                <View key={imgIdx} style={styles.albumCard}>
                  <View style={styles.albumImageWrapper}>
                    <Image src={img.url || ''} style={styles.albumImage} />
                    <View style={[styles.albumBadge, { backgroundColor: badgeColor }]}>
                      <Text style={styles.albumBadgeText}>{nt(badgeText)}</Text>
                    </View>
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

          <View style={styles.spacer} />
          <View style={styles.footer}>
            <Text>{nt(profile.footerNote || '')}</Text>
            <Text render={({ pageNumber, totalPages }) => `${nt('หน้า')} ${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      ))}
    </Document>
  )
}
