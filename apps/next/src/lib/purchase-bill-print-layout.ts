export type PurchaseBillRemark =
  | { kind: 'numbered'; items: string[] }
  | { kind: 'plain'; text: string }

export type PurchaseBillPrintRowSegment = {
  measuredHeight: number
  remarkEnd: number
  remarkStart: number
  showValues: boolean
  sourceIndex: number
}

export type PurchaseBillPrintPagePlan = {
  emptyRowHeights: number[]
  isFinalPage: boolean
  pageNo: number
  rowCapacity: number
  rows: PurchaseBillPrintRowSegment[]
  totalPages: number
  usedRowHeight: number
}

export type PurchaseBillPrintMeasurements = {
  continuationEndHeight: number
  emptyRowMinimumHeight: number
  finalEndHeight: number
  pageContentHeight: number
  safetyGap?: number
  segmentHeights: Record<string, number>
  tableHeaderHeight: number
  topHeight: number
}

const MAX_ROWS_PER_PAGE = 15

export function parsePurchaseBillRemark(value: string): PurchaseBillRemark {
  const text = value.replace(/\r\n?/g, '\n').trim()
  if (!text) return { kind: 'plain', text: '' }

  const marker = /(?:^|\n+|\s+-\s+)\s*(?:-\s*)?(\d{1,3})[.)](?=\s|$)/g
  const matches = Array.from(text.matchAll(marker))
  const prefix = matches[0] ? text.slice(0, matches[0].index).trim() : text
  if (matches.length === 0 || prefix) return { kind: 'plain', text }

  const items = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? text.length
    return text.slice(start, end).trim()
  })

  return items.length > 0 && items.every(Boolean) ? { kind: 'numbered', items } : { kind: 'plain', text }
}

export function purchaseBillRowSegmentKey(rowIndex: number, remarkStart: number, remarkEnd: number) {
  return `${rowIndex}:${remarkStart}:${remarkEnd}`
}

function measuredSegmentHeight(
  measurements: PurchaseBillPrintMeasurements,
  sourceIndex: number,
  remarkStart: number,
  remarkEnd: number,
) {
  const key = purchaseBillRowSegmentKey(sourceIndex, remarkStart, remarkEnd)
  const height = measurements.segmentHeights[key]
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`วัดความสูงรายการที่ ${sourceIndex + 1} ไม่สำเร็จ`)
  }
  return height
}

function emptyRowHeights(availableHeight: number, availableSlots: number, minimumHeight: number) {
  if (availableHeight <= 0.5 || availableSlots <= 0) return []
  const safeMinimum = Math.max(1, minimumHeight)
  if (availableHeight < safeMinimum && safeMinimum - availableHeight > 1e-6) return []
  const count = Math.min(availableSlots, Math.max(1, Math.floor(availableHeight / safeMinimum)))
  const heights = Array.from({ length: count }, () => safeMinimum)
  heights[count - 1] = availableHeight - safeMinimum * (count - 1)
  return heights
}

export function paginatePurchaseBillPrintRows(
  remarks: readonly string[],
  measurements: PurchaseBillPrintMeasurements,
): PurchaseBillPrintPagePlan[] {
  const parsedRemarks = remarks.map(parsePurchaseBillRemark)
  const fixedHeight = measurements.topHeight + measurements.tableHeaderHeight
  const safetyGap = Math.max(0, measurements.safetyGap ?? 0)
  const finalCapacity = measurements.pageContentHeight - fixedHeight - measurements.finalEndHeight - safetyGap
  const continuationCapacity = measurements.pageContentHeight - fixedHeight - measurements.continuationEndHeight - safetyGap

  if (finalCapacity <= 0 || continuationCapacity <= 0) {
    throw new Error('พื้นที่เอกสาร PB ไม่เพียงพอสำหรับหัวเอกสารและส่วนลงนาม')
  }

  let sourceIndex = 0
  let remarkStart = 0
  const pages: PurchaseBillPrintPagePlan[] = []

  const remarkEndFor = (index: number) => {
    const remark = parsedRemarks[index]
    return remark?.kind === 'numbered' ? remark.items.length : 0
  }

  const remainingFitsFinalPage = () => {
    let height = 0
    let rowCount = 0
    for (let index = sourceIndex; index < parsedRemarks.length; index += 1) {
      const start = index === sourceIndex ? remarkStart : 0
      const end = remarkEndFor(index)
      height += measuredSegmentHeight(measurements, index, start, end)
      rowCount += 1
      if (rowCount > MAX_ROWS_PER_PAGE || height > finalCapacity + 0.5) return false
    }
    return true
  }

  do {
    const isFinalPage = remainingFitsFinalPage()
    const rowCapacity = isFinalPage ? finalCapacity : continuationCapacity
    const rows: PurchaseBillPrintRowSegment[] = []
    let usedRowHeight = 0

    while (sourceIndex < parsedRemarks.length && rows.length < MAX_ROWS_PER_PAGE) {
      const remark = parsedRemarks[sourceIndex]
      const remarkEnd = remarkEndFor(sourceIndex)
      const fullHeight = measuredSegmentHeight(measurements, sourceIndex, remarkStart, remarkEnd)
      const remainingHeight = rowCapacity - usedRowHeight
      const completesDocument = sourceIndex === parsedRemarks.length - 1

      if (fullHeight <= remainingHeight + 0.5 && (isFinalPage || !completesDocument)) {
        rows.push({
          measuredHeight: fullHeight,
          remarkEnd,
          remarkStart,
          showValues: remarkStart === 0,
          sourceIndex,
        })
        usedRowHeight += fullHeight
        sourceIndex += 1
        remarkStart = 0
        continue
      }

      if (rows.length > 0) break

      const lastAllowedEnd = !isFinalPage && completesDocument ? remarkEnd - 1 : remarkEnd
      if (remark?.kind !== 'numbered' || lastAllowedEnd <= remarkStart) {
        throw new Error(`ไม่สามารถแบ่งรายการที่ ${sourceIndex + 1} โดยไม่ตัดกลางข้อความ`)
      }

      let splitEnd = 0
      let splitHeight = 0
      for (let candidateEnd = lastAllowedEnd; candidateEnd > remarkStart; candidateEnd -= 1) {
        const candidateHeight = measuredSegmentHeight(measurements, sourceIndex, remarkStart, candidateEnd)
        if (candidateHeight <= remainingHeight + 0.5) {
          splitEnd = candidateEnd
          splitHeight = candidateHeight
          break
        }
      }

      if (splitEnd === 0) {
        throw new Error(`ไม่สามารถแบ่งรายการที่ ${sourceIndex + 1} โดยไม่ตัดกลางข้อความ`)
      }

      rows.push({
        measuredHeight: splitHeight,
        remarkEnd: splitEnd,
        remarkStart,
        showValues: remarkStart === 0,
        sourceIndex,
      })
      usedRowHeight += splitHeight
      remarkStart = splitEnd
      break
    }

    if (!isFinalPage && rows.length === 0) {
      throw new Error('จัดหน้าเอกสาร PB ไม่สำเร็จ')
    }

    pages.push({
      emptyRowHeights: emptyRowHeights(
        rowCapacity - usedRowHeight,
        MAX_ROWS_PER_PAGE - rows.length,
        measurements.emptyRowMinimumHeight,
      ),
      isFinalPage,
      pageNo: pages.length + 1,
      rowCapacity,
      rows,
      totalPages: 0,
      usedRowHeight,
    })
  } while (sourceIndex < parsedRemarks.length || pages.length === 0)

  const totalPages = pages.length
  return pages.map((page) => ({ ...page, totalPages }))
}
