import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pageSourcePath = fileURLToPath(new URL('./PoSellPageClient.tsx', import.meta.url))

function enclosingTableCell(source: string, marker: string) {
  const markerIndex = source.indexOf(marker)
  expect(markerIndex).toBeGreaterThan(-1)

  const start = source.lastIndexOf('<TableCell', markerIndex)
  const end = source.indexOf('</TableCell>', markerIndex)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(markerIndex)

  return source.slice(start, end + '</TableCell>'.length)
}

describe('PO Sell desktop table layout', () => {
  it('keeps every permitted row action inside the non-collapsing action menu column', async () => {
    const source = await readFile(pageSourcePath, 'utf8')
    const actionCell = enclosingTableCell(source, '<TableActionButton menu={(')

    expect(source).toContain("{ key: 'action', minWidth: 64, defaultWidth: 72, maxWidth: 88 }")
    expect(source).toContain("style={{ tableLayout: 'fixed', minWidth: columnResize.tableMinWidth }}")
    expect(actionCell).toContain('className="whitespace-nowrap text-center"')
    expect(actionCell).toContain('<TableActionButton menu={(')
    expect(actionCell).toContain('<TableActionMenuItem')
    expect(actionCell).toContain('row.canEdit')
    expect(actionCell).toContain('row.canCancel')
    expect(actionCell).toContain('canShortClosePoSell(row)')
    expect(actionCell).toContain('แก้ไข')
    expect(actionCell).toContain('พิมพ์')
    expect(actionCell).toContain('ปิดส่งไม่ครบ')
    expect(actionCell).toContain('ยกเลิก')
  })

  it('contains and truncates both updated audit lines without overriding the column width', async () => {
    const source = await readFile(pageSourcePath, 'utf8')
    const updatedCell = enclosingTableCell(source, "{row.updatedBy || '-'}")
    const openingTag = updatedCell.slice(0, updatedCell.indexOf('>') + 1)

    expect(openingTag).toContain('overflow-hidden')
    expect(openingTag).not.toMatch(/\bw-\d+\b/)
    expect(updatedCell.match(/\btruncate\b/g)).toHaveLength(2)
    expect(updatedCell).toContain("title={row.updatedBy || '-'}")
    expect(updatedCell).toContain('title={formatTimestampDisplay(row.updatedAt)}')
  })

  it('uses the selected price-lock date for business surfaces and keeps creation time in audit detail', async () => {
    const source = await readFile(pageSourcePath, 'utf8')

    expect(source).toMatch(/<DatePickerInput[\s\S]*?required[\s\S]*?value=\{form\.priceLockDate\}/)
    expect(source).toContain("sortKey=\"priceLockDate\"")
    expect(source).toContain('label="วันที่ล็อคราคา"')
    expect(source).toContain('>ประวัติการทำรายการ</h4>')
    expect(source).toContain('label="สร้างโดย"')
    expect(source).toContain('label="สร้างเอกสารเมื่อ"')
    expect(source).toContain('label="แก้ไขล่าสุดโดย"')
    expect(source).toContain('label="แก้ไขล่าสุดเมื่อ"')
    expect(source).not.toContain('label="วันที่สร้าง" activeSortKey')
    expect(source).not.toContain('label="วันที่สร้างรายการ" value={formatDateDisplay(row.createdAt)}')
  })
})
